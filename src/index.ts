import { CommandDescription, ServerlessInstance, ServerlessOptions, FunctionConfig } from './@types/serverless';
import * as express from 'express';
import * as Dockerode from 'dockerode';
import { demux, runtimeImage, pull, containerArgs } from './docker';
import { apigwEvent } from './lambda';

interface HttpFunc {
    name: string;
    handler: string;
    runtime: string;
    events: { method: string, path: string }[];
}

function translatePath(apiGatewayPath: string): string {
    return apiGatewayPath;
}

function trap(sig: NodeJS.Signals): Promise<NodeJS.Signals> {
    return new Promise(resolve => {
        process.on(sig, () => resolve(sig));
    });
}

function trapall(): Promise<NodeJS.Signals> {
    return Promise.race([trap('SIGINT'), trap("SIGTERM")]);
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
                usage: "Runs a local http server similating API Gatway triggering your http functions",
                commands: {
                    start: {
                        usage: "Starts the server",
                        lifecycleEvents: ["start"],
                        options: {
                            port: {
                                usage: 'Port to listen on. Default: 3000',
                                shortcut: 'P',
                            },
                        }
                    }
                }
            }
        };
        this.hooks = {
            'localhost:start:start': this.start.bind(this)
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
                        path: translatePath(split[1])
                    };
                }
                return {
                    method: http.method,
                    path: translatePath(http.path)
                };
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

        // package artifacts
        //
        // https://gist.github.com/HyperBrain/50d38027a8f57778d5b0f135d80ea406
        //
        //this.serverless.cli.log(`Packaging ${svc.service} functions for local deployment...`);
        //await this.serverless.pluginManager.spawn("package");


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
            throw Error(`This serverless service has no http functions`);
        }
        const app = express();
        const port = 3000;
        const docker = new Dockerode({
            socketPath: '/var/run/docker.sock'
        });
        // is docker daemon available? if not, what then?
        await docker.ping().catch(
            (e) => {
                throw new Error(
                    'Unable to communicate to docker. \n' +
                    `   Error: ${e.message}\n` +
                    '  Follow https://docs.docker.com/get-started/ to make sure you have docker installed \n'
                );
            }
        );
        for (let func of funcs) {
            for (let event of func.events) {
                this.serverless.cli.log(
                    `Mounting ${func.name} (${func.runtime} handler ${func.handler}) to ${event.method} ${event.path}`
                );
                await app[event.method](event.path, async (request: express.Request, response: express.Response) => {
                    // set up container
                    const dockerImage = runtimeImage(func.runtime);


                    const event = JSON.stringify(
                        apigwEvent(
                            request,
                            this.serverless.getProvider(svc.provider.name).getStage()
                        )
                    );
                    const create = () => {
                        this.serverless.cli.log(`Creating container...`);
                        return docker.createContainer(
                            containerArgs(
                                dockerImage,
                                event,
                                func.handler
                            )
                        );
                    };

                    // todo: pull only in cases where a container create fails
                    //  this.serverless.cli.log(`Pulling ${dockerImage} image...`);
                    //  await pull(docker, dockerImage);

                    let container = await create().catch((e) => {
                        if (e.statusCode === 404) {
                            this.serverless.cli.log(`Docker image not present`);
                            this.serverless.cli.log(`Pulling ${dockerImage} image...`);
                            return pull(docker, dockerImage).then(() => {
                                return create();
                            });
                        }
                        throw e;
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

        return new Promise((resolve) => {
            this.serverless.cli.log("Starting server...");
            return app.listen(
                this.options.port || 3000, () => {
                    this.serverless.cli.log(`Listening on port ${port}...`);
                    resolve();
                }
            );
        }).then(() =>
            trapall().then(sig => {
                this.serverless.cli.log(`Received ${sig} signal...`);
            })
        );
    }
};