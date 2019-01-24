import { CommandDescription, ServerlessInstance, ServerlessOptions, FunctionConfig } from './@types/serverless';
import { HttpFunc } from './@types/localhost';
import * as express from 'express';
import * as Dockerode from 'dockerode';
import { demux, runtimeImage, pull, containerArgs } from './docker';
import { apigwEvent, errorLike } from './lambda';
import { translatePath, translateMethod } from './http';
import * as debug from 'debug';

function trap(sig: NodeJS.Signals): Promise<NodeJS.Signals> {
    return new Promise(resolve => {
        process.on(sig, () => resolve(sig));
    });
}

function trapAll(): Promise<NodeJS.Signals> {
    return Promise.race([trap('SIGINT'), trap('SIGTERM')]);
}

const DEFAULT_PORT: number = 3000;

export = class Localhost {

    readonly serverless: ServerlessInstance;
    readonly options: ServerlessOptions;
    readonly commands: { [key: string]: CommandDescription };
    readonly hooks: { [key: string]: any };
    readonly debug: debug.IDebugger;

    constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
        this.debug = debug('localhost');
        this.serverless = serverless;
        this.options = options;
        this.commands = {
            localhost: {
                usage: 'Runs a local http server simulating API Gateway, triggering your http functions on demand',
                lifecycleEvents: ['start'],
                options: {
                    port: {
                        usage: `Port to listen on. Default: ${DEFAULT_PORT}`,
                        shortcut: 'P',
                    },
                }
            }
        };
        this.hooks = {
            'localhost:start': this.start.bind(this)
        };
    }

    httpFunc(name: string, runtime: string, func: FunctionConfig): HttpFunc {
        return {
            name,
            qualifiedName: func.name,
            handler: func.handler,
            runtime,
            memorySize: func.memorySize || this.serverless.service.provider.memorySize || 1536,
            timeout: func.timeout || this.serverless.service.provider.timeout || 300,
            events: (func.events || []).filter(event => event['http'] !== undefined).map(event => {
                let http = event['http'];
                if (typeof http === 'string') {
                    const [method, path] = http.split(' ');
                    return {
                        method: translateMethod(method),
                        path: translatePath(path)
                    };
                }
                return {
                    method: translateMethod(http.method),
                    path: translatePath(http.path)
                };
            })
        };
    }

    respond(funcResponse: string, response: express.Response) {
        this.debug(`raw function response '${funcResponse}'`);

        // stdout stream may contain other data, response should be the last line
        const lastLine = funcResponse.lastIndexOf('\n');
        if (lastLine >= 0) {
            console.log(funcResponse.substring(lastLine).trim());
            funcResponse = funcResponse.substring(0, lastLine).trim();
        }
        const json = JSON.parse(funcResponse);
        if (errorLike(json)) {
            this.debug('function invocation yieled unhandled error');
            response.status(500).type('application/json').send(json);
        } else {
            const status = json.statusCode || 200;
            const contentType = (json.headers || {})['Content-Type'] || 'application/json';
            response.status(status).type(contentType).send(json.body);
        }
    }

    httpFunctions(): HttpFunc[] {
        const svc = this.serverless.service;
        return svc.getAllFunctions().reduce<HttpFunc[]>(
            (httpFuncs, name) => {
                let func = svc.functions[name];
                let runtime = func.runtime || svc.provider.runtime;
                if (!runtime) {
                    this.serverless.cli.log(`Warning: unable to infer a runtime for function ${name}`);
                    return httpFuncs;
                }

                if ((func.events || []).find((event: any) => event['http'] !== undefined)) {
                    httpFuncs.push(this.httpFunc(name, runtime, func));
                }

                return httpFuncs;
            }, []
        );
    }

    async start() {
        const svc = this.serverless.service;
        const providerName = svc.provider.name;
        if ('aws' !== providerName) {
            throw Error(`Provider ${providerName} is not supported`);
        }

        // package artifacts
        //
        // https://gist.github.com/HyperBrain/50d38027a8f57778d5b0f135d80ea406
        //
        //this.serverless.cli.log(`Packaging ${svc.service} functions for local deployment...`);
        //await this.serverless.pluginManager.spawn("package");

        const funcs = this.httpFunctions();
        if (!funcs) {
            throw Error('This serverless service has no http functions');
        }

        const docker = new Dockerode({
            socketPath: '/var/run/docker.sock'
        });

        // make sure we can communicate with docker
        this.debug('pinging docker daemon');
        await docker.ping().catch(
            (e) => {
                throw new Error(
                    'Unable to communicate to docker. \n' +
                    `   Error: ${e.message}\n` +
                    '  Follow https://docs.docker.com/get-started/ to make sure you have docker installed \n'
                );
            }
        );

        const app = express();
        app.disable('x-powered-by');
        for (let func of funcs) {
            for (let event of func.events) {

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
                        this.debug('Creating docker container for ${func.handler}');
                        return docker.createContainer(
                            containerArgs(
                                dockerImage,
                                event,
                                func
                            )
                        );
                    };

                    let container = await create().catch((e: any) => {
                        if (e.statusCode === 404) {
                            this.serverless.cli.log('Docker image not present');
                            this.serverless.cli.log(`Pulling ${dockerImage} image...`);
                            return pull(docker, dockerImage).then(() => {
                                return create();
                            });
                        }
                        throw e;
                    });

                    // invoke function
                    this.debug(`Invoking ${func.handler} function in ${container.id}`);
                    await container.start().then(() => container.wait());

                    // get the logs
                    this.debug(`Fetching container logs of ${container.id}`);
                    let logs = await container.logs({
                        stdout: true,
                        stderr: true
                    });
                    const stdout: Uint8Array[] = [];
                    demux((logs as unknown) as Buffer,
                        (data: any) => { // stderr
                            process.stderr.write(data);
                        },
                        (data: any) => { // stdout
                            stdout.push(data);
                        }
                    );

                    this.respond(Buffer.concat(stdout).toString('utf8'), response);

                    // sweep up
                    this.debug(`Deleting container ${container.id}`);
                    await container.remove();
                });
            }
        }

        return new Promise((resolve, reject) => {
            this.serverless.cli.log('Starting server...');
            const port = this.options.port || DEFAULT_PORT;
            app.listen(
                port, () => {
                    this.serverless.cli.log(`Listening on port ${port}...`);
                    this.serverless.cli.log('Function routes');
                    for (let func of funcs) {
                        this.serverless.cli.log(`* ${func.name}`);
                        for (let event of func.events) {
                            this.serverless.cli.log(`    ${event.method} http://localhost:${port}${event.path}`);
                        }
                    }
                    resolve();
                }
            ).on('error', (e) => {
                if (e.message.indexOf('listen EADDRINUSE') > -1) {
                    reject(
                        new Error(
                            `Error starting server on localhost port ${port}.\n` +
                            '  * Hint: You likely already have something listening on this port'
                        )
                    );
                    return;
                }
                reject(new Error(`Unexpected error while starting server ${e.message}`));
            });
        }).then(
            () => trapAll().then(
                sig => this.serverless.cli.log(`Received ${sig} signal. Stopping server...`)
            )
        );
    }
};