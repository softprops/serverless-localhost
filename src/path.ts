export function translatePath(apiGatewayPath: string): string {
    return apiGatewayPath
        .replace(/{proxy\+}/g, '*')
        .replace(/{([^}]+)}/g, ':$1');
}