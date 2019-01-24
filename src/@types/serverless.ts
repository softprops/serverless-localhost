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
    log(args: any): any;
    consoleLog(args: any): any;
  };
  service: {
    service: string;
    provider: {
      name: string;
      runtime?: string;
      memorySize?: number;
      timeout?: number;
      environment?: { [key: string]: string };
    };
    package?: Package;
    getAllFunctions: () => string[];
    functions: { [key: string]: FunctionConfig };
  };
  getProvider(name: string): Provider;
  pluginManager: {
    spawn(cmd: string, options?: object): Promise<void>;
  };
}

export interface FunctionConfig {
  name: string;
  handler: string;
  runtime?: string;
  events?: { [key: string]: any }[];
  package?: Package;
  memorySize?: number;
  timeout?: number;
  environment?: { [key: string]: string };
}

export interface Package {
  artifact?: string;
  disable?: boolean;
}

export interface Provider {
  getStage(): string;
}

export interface ServerlessOptions {
  port?: number;
  watch?: boolean;
}
