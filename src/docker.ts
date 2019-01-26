import * as Dockerode from 'dockerode';
import { ContainerCreateOptions } from 'dockerode';
import * as readline from 'readline';
import * as stream from 'stream';
import { HttpFunc } from './@types/localhost';

export function demux(
  logs: Buffer,
  stderr: (d: any) => void,
  stdout: (d: any) => void
): void {
  // https://github.com/apocas/docker-modem/blob/7ec7abeb6b0cf7192d29667b397d292fe9f6e3ca/lib/modem.js#L296
  // when we're not `following` the logs we get a buffer. dockerode doesn't provide a helpful
  // way do demux that hence the following...
  let bufferStream = new stream.PassThrough();
  bufferStream.end(logs);
  let header = bufferStream.read(8);
  while (header !== null) {
    let type = header.readUInt8(0);
    let payload = bufferStream.read(header.readUInt32BE(4));
    if (payload === null) {
      break;
    }
    if (type === 2) {
      stderr(payload);
    } else {
      stdout(payload);
    }
    header = bufferStream.read(8);
  }
}

export function pull(docker: Dockerode, image: string): Promise<void> {
  return new Promise(resolve => {
    docker.pull(image, {}, (err, stream) => {
      docker.modem.followProgress(
        stream,
        () => {
          process.stdout.write('\n');
          resolve();
        },
        function(event: any) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(
            `${event.status} ${event.id || ''} ${event.progress || ''}`
          );
        }
      );
    });
  });
}

export function runtimeImage(runtime: string): string {
  // https://hub.docker.com/r/lambci/lambda/tags
  return `lambci/lambda:${runtime}`;
}

export function debugSupported(runtime: string): boolean {
  return debugEntrypoint(runtime, 0) !== undefined;
}

function debugEntrypoint(runtime: string, port: number): string[] | undefined {
  switch (runtime) {
    case 'nodejs':
      return [
        '/usr/bin/node',
        `--debug-brk=${port}`,
        '--nolazy',
        '--max-old-space-size=1229',
        '--max-new-space-size=153',
        '--max-executable-size=153',
        '--expose-gc',
        '/var/runtime/node_modules/awslambda/bin/awslambda'
      ];
    case 'nodejs4.3':
      return [
        '/usr/local/lib64/node-v4.3.x/bin/node',
        `--debug-brk=${port}`,
        '--nolazy',
        '--max-old-space-size=2547',
        '--max-semi-space-size=150',
        '--max-executable-size=160',
        '--expose-gc',
        '/var/runtime/node_modules/awslambda/index.js'
      ];
    case 'nodejs6.10':
      return [
        '/var/lang/bin/node',
        `--debug-brk=${port}`,
        '--nolazy',
        '--max-old-space-size=2547',
        '--max-semi-space-size=150',
        '--max-executable-size=160',
        '--expose-gc',
        '/var/runtime/node_modules/awslambda/index.js'
      ];
    case 'nodejs8.10':
      return [
        '/var/lang/bin/node',
        `--inspect-brk=0.0.0.0:${port}`,
        '--nolazy',
        '--expose-gc',
        '--max-semi-space-size=150',
        '--max-old-space-size=2707',
        '/var/runtime/node_modules/awslambda/index.js'
      ];
    case 'java8':
      return [
        '/usr/bin/java',
        `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${port}`,
        '-XX:MaxHeapSize=2834432k',
        '-XX:MaxMetaspaceSize=163840k',
        '-XX:ReservedCodeCacheSize=81920k',
        '-XX:+UseSerialGC',
        '-XX:-TieredCompilation',
        '-Djava.net.preferIPv4Stack=true',
        '-jar',
        '/var/runtime/lib/LambdaJavaRTEntry-1.0.jar'
      ];
    case 'python2.7':
      return ['/usr/bin/python2.7', '/var/runtime/awslambda/bootstrap.py'];
    case 'python3.6':
      return ['/var/lang/bin/python3.6', '/var/runtime/awslambda/bootstrap.py'];
    case 'dotnetcore2.0':
    case 'dotnetcore2.1':
      return [
        '/var/lang/bin/dotnet',
        '/var/runtime/MockBootstraps.dll',
        '--debugger-spin-wait'
      ];
    default:
      return undefined;
  }
}

function exposedPorts(port: number) {
  const ports = {};
  ports[`${port}`] = {};
  return ports;
}

function portBindings(containerPort: number, hostPort: number) {
  const bindings = {};
  bindings[`${containerPort}`] = [
    {
      HostPort: `${hostPort}`
    }
  ];
  return bindings;
}

export function containerArgs(
  dockerImage: string,
  event: string,
  func: HttpFunc,
  region: string,
  debugPort?: number
): ContainerCreateOptions {
  const baseEnv = Object.keys(func.environment).reduce<string[]>(
    (res, key) => [...res, `${key}=${func.environment[key]}`],
    []
  );

  const entrypoint =
    debugPort !== undefined
      ? debugEntrypoint(func.runtime, debugPort)
      : undefined;

  return {
    Entrypoint: (entrypoint as unknown) as string,
    ExposedPorts: debugPort !== undefined ? exposedPorts(debugPort) : undefined,
    Image: dockerImage,
    Volumes: {
      '/var/task': {}
    },
    // todo: what ever else lambci expects
    HostConfig: {
      Binds: [`${process.cwd()}:/var/task:ro`],
      PortBindings:
        debugPort !== undefined ? portBindings(debugPort, debugPort) : undefined
    },
    // todo: what ever else lambci expects
    // https://github.com/lambci/docker-lambda/blob/master/provided/run/init.go
    Env: [
      ...baseEnv,
      `AWS_LAMBDA_FUNCTION_HANDLER=${func.handler}`,
      `AWS_LAMBDA_EVENT_BODY=${event}`,
      `AWS_LAMBDA_FUNCTION_NAME=${func.qualifiedName}`,
      `AWS_LAMBDA_FUNCTION_MEMORY_SIZE=${func.memorySize}`,
      `AWS_LAMBDA_FUNCTION_TIMEOUT=${func.timeout}`,
      `AWS_REGION=${region}`,
      `AWS_DEFAULT_REGION=${region}`
      // `AWS_LAMBDA_CLIENT_CONTEXT=??`,
      // `AWS_LAMBDA_COGNITO_IDENTITY=??`
    ]
  };
}
