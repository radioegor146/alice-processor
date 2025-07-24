export interface FunctionArgumentValueNumberMinMaxConstraints {
    type: "number-min-max";
    argumentType: "number";
    min: number;
    max: number;
}

export interface FunctionArgumentValueNumberVariantsConstraints {
    type: "number-variants";
    argumentType: "number";
    variants: {
        value: number;
        description: string;
    }[];
}

export interface FunctionArgumentValueStringNotEmptyConstraints {
    type: "string-not-empty";
    argumentType: "string";
}

export interface FunctionArgumentValueStringVariantsConstraints {
    type: "string-variants";
    argumentType: "string";
    variants: {
        value: string;
        description: string;
    }[];
}

export type FunctionArgumentValueConstraints =
    FunctionArgumentValueNumberMinMaxConstraints
    | FunctionArgumentValueNumberVariantsConstraints
    | FunctionArgumentValueStringNotEmptyConstraints
    | FunctionArgumentValueStringVariantsConstraints;

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

export type FunctionCallArguments = Record<string, string | number>;

export interface FunctionCall {
    name: string;
    parameters: FunctionCallArguments;
    schedule?: number;
}

export interface StructuredResponse {
    functionCalls: FunctionCall[];
    requireMoreInput: boolean;
    text: string;
}

export type BiometryAge = "unknown" | "child" | "adult";
export type BiometryGender = "unknown" | "female" | "male";

export interface BiometryData {
    age: BiometryAge;
    gender: BiometryGender;
}

export interface SessionContext {
    id: string;
    biometry: BiometryData;
}