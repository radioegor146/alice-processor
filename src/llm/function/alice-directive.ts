import {FunctionInfo, Functions} from "../types";
import {FunctionServer} from "./types";
import {AliceDirective} from "../../processor";

export interface AliceDirectiveFunction {
    info: FunctionInfo,
    implementation: (input: Record<string, number>) => AliceDirective,
}

function createDirectiveFunction(info: FunctionInfo, implementation:
    (input: Record<string, number>) => AliceDirective): AliceDirectiveFunction {
    return {
        info,
        implementation,
    };
}

export class AliceDirectiveFunctionServer implements FunctionServer {

    constructor(private readonly directiveFunctions: Record<string, AliceDirectiveFunction>) {
    }

    getName(): string {
        return "alice-directive";
    }

    async getFunctions(): Promise<Functions> {
        return Object.fromEntries(Object.entries(this.directiveFunctions)
            .map(([name, func]) => [name, func.info]));
    }

    callFunction(): Promise<void> {
        throw new Error("no async calls supported");
    }

    callDirectiveFunction(functionName: string, parameters: Record<string, number>): AliceDirective {
        return this.directiveFunctions[functionName].implementation(parameters);
    }
}

export function createAliceDirectiveFunctionServer(): AliceDirectiveFunctionServer {
    return new AliceDirectiveFunctionServer({
        "alice_set_volume_level": createDirectiveFunction({
            description: "sets volume level of Алиса voice assistant",
            arguments: {
                "level": {
                    description: "volume level",
                    constraints: {
                        type: "min-max",
                        min: 1,
                        max: 10
                    }
                }
            }
        }, (parameters) => ({
            type: "soundSetLevel",
            newLevel: parameters["level"]
        })),
        "alice_set_volume_louder": createDirectiveFunction({
            description: "makes volume level of Алиса voice assistant relatively louder",
            arguments: {}
        }, () => ({
            type: "soundLouder"
        })),
        "alice_set_volume_quieter": createDirectiveFunction({
            description: "makes volume level of Алиса voice assistant relatively quieter",
            arguments: {}
        }, () => ({
            type: "soundQuieter"
        }))
    });
}