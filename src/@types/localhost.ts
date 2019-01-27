import { Cors } from './serverless';

export interface HttpFunc {
  name: string;
  qualifiedName: string;
  handler: string;
  runtime: string;
  memorySize: number;
  timeout: number;
  events: { method: string; path: string; cors?: Cors }[];
  environment: { [key: string]: string };
}
