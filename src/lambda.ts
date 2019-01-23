import * as express from 'express';

export function errorLike(payload: object): boolean {
    // https://aws.amazon.com/blogs/compute/error-handling-patterns-in-amazon-api-gateway-and-aws-lambda/
    const fields = ["errorMessage", "errorType", "stackTrace"];
    return fields.every(f => f in payload) || "errorMessage" in payload;
}

export function apigwEvent(request: express.Request, stage: string) {
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