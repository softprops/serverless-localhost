import * as stream from 'stream';
import * as Dockerode from 'dockerode';

export function demux(logs: Buffer, stderr: (d: any) => void, stdout: (d: any) => void): void {
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
        if (type === 2) {
            stderr(payload);
        } else {
            stdout(payload);
        }
        header = bufferStream.read(8);
    }
}

export function pull(docker: Dockerode, image: string): Promise<void> {
    return new Promise((resolve) => {
        docker.pull(image, {}, (err, stream) => {
            docker.modem.followProgress(stream, (err, out) => {
                resolve();
            }, function(event) {
                process.stdout.write(
                    `\r${event.status} ${event.id || ""} ${event.progress || ""}`
                );
            });
        });
    });
}


export function runtimeImage(runtime: string): string {
    // https://hub.docker.com/r/lambci/lambda/tags
    return `lambci/lambda:${runtime}`;
}

export function containerArgs(dockerImage: string, event: string, handler: string): object {
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
        Env: [
            `AWS_LAMBDA_FUNCTION_HANDLER=${handler}`,
            `AWS_LAMBDA_EVENT_BODY=${event}`
        ]
    };
}