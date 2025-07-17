export interface FunctionArgumentValueMinMaxConstraints {
    type: "min-max"
    min: number;
    max: number;
}

export interface FunctionArgumentValueVariantsConstraints {
    type: "variants"
    variants: {
        value: number;
        description: string;
    }[];
}

export type FunctionArgumentValueConstraints =
    FunctionArgumentValueMinMaxConstraints
    | FunctionArgumentValueVariantsConstraints;

export interface FunctionArgument {
    description: string;
    constraints: FunctionArgumentValueConstraints;
}

export interface FunctionInfo {
    description: string;
    arguments: Record<string, FunctionArgument>;
}

export type Functions = Record<string, FunctionInfo>;

export interface StateEntry {
    description: string;
    value: string;
}

export type State = Record<string, StateEntry>;

export type FunctionCallArguments = Record<string, number>;

export interface FunctionCall {
    name: string;
    parameters: FunctionCallArguments;
}

export interface StructuredResponse {
    functionCalls: FunctionCall[];
    requireMoreInput: boolean;
    text: string;
}