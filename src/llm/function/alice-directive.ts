import {FunctionInfo, Functions, SessionContext} from "../types";
import {FunctionServer} from "./types";
import {AliceDirective} from "../../processor";
import {getLogger} from "../../logger";

export interface AliceDirectiveFunction {
    info: FunctionInfo,
    implementation: (context: SessionContext, input: Record<string, string | number>) => Promise<AliceDirective>,
}

function createDirectiveFunction(info: FunctionInfo, implementation:
    (context: SessionContext, input: Record<string, string | number>) => Promise<AliceDirective>): AliceDirectiveFunction {
    return {
        info,
        implementation,
    };
}

const logger = getLogger<AliceDirectiveFunctionServer>();

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

    callDirectiveFunction(context: SessionContext, functionName: string,
                          parameters: Record<string, number | string>): Promise<AliceDirective> {
        return this.directiveFunctions[functionName].implementation(context, parameters);
    }
}

export function createAliceDirectiveFunctionServer():
    AliceDirectiveFunctionServer {
    return new AliceDirectiveFunctionServer({
        "alice_set_volume_level": createDirectiveFunction({
            description: "sets volume level of Алиса voice assistant",
            arguments: {
                "level": {
                    description: "volume level",
                    constraints: {
                        type: "number-min-max",
                        argumentType: "number",
                        min: 1,
                        max: 10
                    }
                }
            }
        }, async (_, parameters) => ({
            type: "soundSetLevel",
            newLevel: parameters["level"] as number
        })),
        "alice_set_volume_louder": createDirectiveFunction({
            description: "makes volume level of Алиса voice assistant relatively louder",
            arguments: {}
        }, async () => ({
            type: "soundLouder"
        })),
        "alice_set_volume_quieter": createDirectiveFunction({
            description: "makes volume level of Алиса voice assistant relatively quieter",
            arguments: {}
        }, async () => ({
            type: "soundQuieter"
        })),
    });
}