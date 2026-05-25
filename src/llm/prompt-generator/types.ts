import { Functions, State } from '../types'

export interface PromptGenerator {
  generate(functions: Functions): string;
  generateState(state: State): string;
}
