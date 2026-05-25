import z from 'zod'

export interface FunctionArgument {
  constraints: FunctionArgumentValueConstraints;
  description: string;
}

export type FunctionArgumentValueConstraints =
    FunctionArgumentValueNumberMinMaxConstraints
    | FunctionArgumentValueNumberVariantsConstraints
    | FunctionArgumentValueStringNotEmptyConstraints
    | FunctionArgumentValueStringVariantsConstraints

export interface FunctionArgumentValueNumberMinMaxConstraints {
  argumentType: 'number';
  max: number;
  min: number;
  type: 'number-min-max';
}

export interface FunctionArgumentValueNumberVariantsConstraints {
  argumentType: 'number';
  type: 'number-variants';
  variants: {
    description: string;
    value: number;
  }[];
}

export interface FunctionArgumentValueStringNotEmptyConstraints {
  argumentType: 'string';
  type: 'string-not-empty';
}

export interface FunctionArgumentValueStringVariantsConstraints {
  argumentType: 'string';
  type: 'string-variants';
  variants: {
    description: string;
    value: string;
  }[];
}

export interface FunctionCall {
  arguments: unknown;
  name: string;
  schedule?: number;
}

export type FunctionCallArguments = Record<string, number | string>

export interface FunctionInfo<T = unknown> {
  argumentsSchema: z.ZodSchema<T>;
  description: string;
  hasResponse: boolean;
}

export type Functions = Record<string, FunctionInfo>

export interface LLMMessage {
  content: string
  name?: string
  role: 'assistant' | 'system' | 'user',
}

export type State = Record<string, StateEntry>

export interface StateEntry {
  description: string;
  value: string;
}
