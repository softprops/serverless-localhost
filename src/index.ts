import { CommandDescription, ServerlessInstance, ServerlessOptions, FunctionConfig } from './@types/serverless';
import * as express from 'express';
import * as Dockerode from 'dockerode';
import { demux, runtimeImage, pull, containerArgs } from './docker';

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
        if (funcResponse && funcResponse.length > 0) {
            const json = JSON.parse(funcResponse);
            response.status(json.statusCode).send(json.body);
        }
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
                    const dockerImage = runtimeImage(func.runtime);
                    // todo: pull container first to ensure it exists
                    this.serverless.cli.log(`Pulling ${dockerImage} image...`);
                    await pull(docker, dockerImage);

                    this.serverless.cli.log(`Creating container...`);
                    let event = JSON.stringify(
                        this.apigwEvent(
                            request,
                            this.serverless.getProvider(svc.provider.name).getStage()
                        )
                    );
                    let container = await docker.createContainer(
                        containerArgs(
                            dockerImage,
                            event,
                            func.handler
                        )
                    );

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
                    demux((logs as unknown) as Buffer,
                        (data: any) => {
                            process.stderr.write(data);
                        },
                        (data: any) => {
                            const str = data.toString("utf8").trim();
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