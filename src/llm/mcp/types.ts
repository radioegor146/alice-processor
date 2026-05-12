export interface MCPFunctionInfo {
  argumentsSchema: unknown;
  description: string;
}

export type MCPFunctions = Record<string, MCPFunctionInfo>

export interface MCPServer {
  callFunction(functionName: string, arguments_: unknown): Promise<string>;

  getFunctions(): Promise<MCPFunctions>;

  getName(): string;
}
