import * as Dockerode from 'dockerode';
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

export function containerArgs(
  dockerImage: string,
  event: string,
  func: HttpFunc,
  region: string
): object {
  const baseEnv = Object.keys(func.environment).reduce<string[]>(
    (res, key) => [...res, `${key}=${func.environment[key]}`],
    []
  );
  return {
    Image: dockerImage,
    Volumes: {
      '/var/task': {}
    },
    // todo: what ever else lambci expects
    HostConfig: {
      Binds: [`${process.cwd()}:/var/task:ro`]
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
