
//type Method = "get" | "post" | "put" | "delete" | "patch" | "any";

export function translateMethod(method: string): string {
    const lowercased = method.toLowerCase();
    return 'any' === lowercased ? 'all' : lowercased;
}

export function translatePath(apiGatewayPath: string): string {
    return apiGatewayPath
        .replace(/{proxy\+}/g, '*')
        .replace(/{([^}]+)}/g, ':$1');
}