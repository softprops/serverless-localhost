export interface CommandOption {
    usage: string;
    shortcut: string;
    required?: boolean;
}

export interface CommandDescription {
    usage: string;
    lifecycleEvents?: string[];
    commands?: { [key: string]: CommandDescription };
    options?: { [key: string]: CommandOption };
}

export interface ServerlessInstance {
    cli: {
        log(args: any): any
        consoleLog(args: any): any
    };
    service: {
        service: string
        provider: {
            name: string;
            runtime?: string;
        };
        getAllFunctions: () => string[];
        functions: { [key: string]: FunctionConfig };
    };

}

export interface FunctionConfig {
    handler: string;
    runtime?: string;
    events?: { [key: string]: any }[];
}

export interface Provider {
    getStage(): string;
}

export interface ServerlessOptions {
    function?: string;
    watch?: boolean;
    extraServicePath?: string;
}