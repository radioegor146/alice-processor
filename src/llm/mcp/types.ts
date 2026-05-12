import { Span } from '@sentry/node'

export interface MCPFunctionInfo {
  argumentsSchema: unknown;
  description: string;
}

export type MCPFunctions = Record<string, MCPFunctionInfo>

export interface MCPServer {
  callFunction(functionName: string, arguments_: unknown, parentSpan: Span): Promise<string>;

  getFunctions(parentSpan: Span): Promise<MCPFunctions>;

  getName(): string;

  init(): Promise<void>
}
