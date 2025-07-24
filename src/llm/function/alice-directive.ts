import {FunctionInfo, Functions, SessionContext} from "../types";
import {FunctionServer} from "./types";
import {AliceDirective} from "../../processor";
import {getLogger} from "../../logger";
import {BioStorage} from "../bio-storage/types";

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

export interface AliceDirectiveFunctionServerProps {
    bioStorage: BioStorage;
}

export function createAliceDirectiveFunctionServer(props: AliceDirectiveFunctionServerProps):
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
        "alice_cancel_voice_enrollment": createDirectiveFunction({
            description: "cancels current enrollment session",
            arguments: {}
        }, async () => ({
            type: "cancelVoiceEnrollment"
        })),
        "alice_start_voice_enrollment": createDirectiveFunction({
            description: "starts voice print enrollment",
            arguments: {}
        }, async (context, input) => {
            const voicePrintId = `voice-${context.id}`;
            const userId = await props.bioStorage.add({
                voicePrintId,
                finished: false
            });
            return {
                type: "startVoiceEnrollment",
                personId: `voice-${context.id}`,
                timeout: 200000,
                userId: userId
            };
        }),
        "alice_finish_voice_enrollment": createDirectiveFunction({
            description: "finishes voice print enrollment",
            arguments: {
                name: {
                    description: "name of the speaker that wanted voice print enrollment",
                    constraints: {
                        type: "string-not-empty",
                        argumentType: "string"
                    }
                }
            }
        }, async (context, input) => {
            const voicePrintId = `voice-${context.id}`;
            logger.info(`Saved voice print ${voicePrintId} for user with name '${input["name"]}'`);
            const bioData = await props.bioStorage.loadByVoicePrintId(voicePrintId);
            return {
                type: "finishVoiceEnrollment",
                personId: voicePrintId,
                userId: 0
            };
        }),
    });
}