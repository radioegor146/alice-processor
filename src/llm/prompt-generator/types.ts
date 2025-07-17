import {Functions, State} from "../types";

export interface PromptGenerator {
    generate(state: State, functions: Functions): string;
}