import { CommandDescription, ServerlessInstance, ServerlessOptions, FunctionConfig } from './@types/serverless';
import * as express from 'express';
import * as Dockerode from 'dockerode';
import * as stream from 'stream';

interface HttpFunc {
    name: string;
    handler: string;
    runtime: string;
    events: { method: string, path: string }[];
}

export = class Localhost {

    readonly serverless: ServerlessInstance;
    readonly options: ServerlessOptions;
    readonly commands: { [key: string]: CommandDescription };
    readonly hooks: { [key: string]: any };

    constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
        this.serverless = serverless;
        this.options = options;
        this.commands = {
            localhost: {
                usage: "Runs a local http server similating API Gatway triggering you http functions",
                commands: {
                    start: {
                        usage: "Starts the server",
                        lifecycleEvents: ["start"]
                    }
                }
            }
        };
        this.hooks = {
            'localhost:start:start': this.start.bind(this)
        };
    }

    demux(logs: Buffer, stderr: (d: any) => void, stdout: (d: any) => void) {
        // https://github.com/apocas/docker-modem/blob/7ec7abeb6b0cf7192d29667b397d292fe9f6e3ca/lib/modem.js#L296
        // when we're not `following` the logs we get a buffer. dockerode doesn't provide a helpful
        // way do demux that hence the following...
        var bufferStream = new stream.PassThrough();
        bufferStream.end(logs);
        let header = bufferStream.read(8);
        while (header !== null) {
            var type = header.readUInt8(0);
            var payload = bufferStream.read(header.readUInt32BE(4));
            if (payload === null) { break; }
            if (type == 2) {
                stderr(payload);
            } else {
                stdout(payload);
            }
            header = bufferStream.read(8);
        }
    }

    apigwEvent(request: express.Request, stage: string) {
        return {
            httpMethod: request.method,
            path: request.path,
            body: request.body,
            headers: request.headers, // replying to the JSONize impl for effect
            queryStringParameters: null,
            pathParameters: request.params,
            stageVariables: null,
            isBase64Encoded: false,
            requestContext: {
                path: "/",
                accountId: "123",
                resourceId: "123",
                stage: stage,
                requestId: "123",
                identity: {
                    cognitoIdentityPoolId: null,
                    accountId: null,
                    cognitoIdentityId: null,
                    caller: null,
                    apiKey: null,
                    sourceIp: "127.0.0.1",
                    accessKey: null,
                    cognitoAuthenticationType: null,
                    cognitoAuthenticationProvider: null,
                    userArn: null,
                    userAgent: "Serverless/xxx",
                    user: null
                },
                resourcePath: "/",
                httpMethod: request.method,
                apiId: "123"
            }
        };
    }

    httpFunc(name: string, runtime: string, func: FunctionConfig): HttpFunc {
        return {
            name,
            handler: func.handler,
            runtime,
            events: (func.events || []).filter(event => event['http'] !== undefined).map(event => {
                let http = event['http'];
                if (typeof http === 'string') {
                    const split = http.split(' ');
                    return {
                        method: split[0],
                        path: split[1]
                    };
                } else {
                    return {
                        method: event['http'].method,
                        path: event['http'].path
                    };
                }
            })
        };
    }

    respond(funcResponse: string, response: express.Response) {
        // expect apigateway contract to be hold here
        // todo: deal with error
        const json = JSON.parse(funcResponse);
        return response.status(json.statusCode).send(json.body);
    }

    dockerImage(runtime: string) {
        // https://hub.docker.com/r/lambci/lambda/tags
        return `lambci/lambda:${runtime}`;
    }

    async start() {
        const svc = this.serverless.service;
        const providerName = svc.provider.name;
        if ("aws" !== providerName) {
            throw Error(`Provider ${providerName} is not supported`);
        }
        this.serverless.cli.log("Starting server...");
        const funcs = svc.getAllFunctions().reduce<HttpFunc[]>(
            (httpFuncs, name) => {
                let func = svc.functions[name];
                let runtime = func.runtime || svc.provider.runtime;
                if (!runtime) {
                    return httpFuncs;
                }

                if ((func.events || []).find((event: any) => event['http'] !== undefined)) {
                    httpFuncs.push(this.httpFunc(name, runtime, func));
                }

                return httpFuncs;
            }, []
        );
        if (!funcs) {
            throw Error(`This serverless service has not http functions`);
        }
        const app = express();
        const port = 3000;
        const docker = new Dockerode({
            socketPath: '/var/run/docker.sock'
        });
        // is docker daemon available? if not, what then?
        await docker.ping();
        for (let func of funcs) {
            for (let event of func.events) {
                this.serverless.cli.log(
                    `Mounting ${func.name} (${func.runtime} handler ${func.handler}) to ${event.method} ${event.path}`
                );
                await app.get(event.path, async (request, response) => {
                    // set up container
                    // https://hub.docker.com/r/lambci/lambda/tags
                    const dockerImage = this.dockerImage(func.runtime);
                    // todo: pull container first to ensure it exists
                    this.serverless.cli.log(`Creating container...`);
                    let event = JSON.stringify(this.apigwEvent(request, "dev"));
                    let container = await docker.createContainer({
                        Image: dockerImage,
                        Volumes: {
                            '/var/task': {}
                        },
                        // todo: what ever else lambci expects
                        HostConfig: {
                            Binds: [`${process.cwd()}:/var/task:ro`]
                        },
                        // todo: what ever else lambci expects
                        Env: [
                            `AWS_LAMBDA_FUNCTION_HANDLER=${func.handler}`,
                            `AWS_LAMBDA_EVENT_BODY=${event}`
                        ]
                    });

                    // start container
                    this.serverless.cli.log(`Starting container...`);
                    let containerStatus = await container.start();
                    this.serverless.cli.consoleLog(`Started container ${containerStatus.id}`);

                    // wait for container to finish its work
                    await container.wait();

                    // get the logs
                    this.serverless.cli.log(`Fetching container ${container.id}'s logs...`);
                    let logs = await container.logs({
                        stdout: true,
                        stderr: true
                    });
                    this.demux((logs as unknown) as Buffer,
                        process.stderr.write,
                        (data: any) => {
                            const str = data.toString("utf8");
                            this.respond(str, response);
                        }
                    );

                    // sweep up
                    await container.remove();
                });
            }
        }

        return new Promise((resolve) =>
            app.listen(
                port, () => {
                    this.serverless.cli.log(`Listening on port ${port}...`);
                    resolve();
                }
            )
        ).then(() => {
            // keep this serverless command exec going until user quits a session
            const sigint = new Promise(resolve => {
                process.on('SIGINT', () => resolve('SIGINT'));
            });

            const sigterm = new Promise(resolve => {
                process.on('SIGTERM', () => resolve('SIGTERM'));
            });

            return Promise.race([sigint, sigterm]).then(sig => {
                this.serverless.cli.log(`Received ${sig} signal...`);
            });
        });
    }
};