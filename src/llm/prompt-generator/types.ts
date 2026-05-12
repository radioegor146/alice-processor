import { MCPFunctions } from '../mcp/types'
import { Functions, State } from '../types'

export interface PromptGenerator {
  generate(functions: Functions, mcpFunctions: MCPFunctions): string;
  generateState(state: State): string;
}
