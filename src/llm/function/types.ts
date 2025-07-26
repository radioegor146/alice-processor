import {FunctionArgumentValueConstraints, Functions, SessionContext} from "../types";
import z from "zod";

export const functionsType = z.record(z.object({
    description: z.string(),
    arguments: z.record(z.object({
        description: z.string(),
        constraints: z.discriminatedUnion("type", [
            z.object({
                type: z.literal("number-min-max"),
                argumentType: z.literal("number"),
                min: z.number(),
                max: z.number()
            }),
            z.object({
                type: z.literal("number-variants"),
                argumentType: z.literal("number"),
                variants: z.array(z.object({
                    description: z.string(),
                    value: z.number()
                }))
            }),
            z.object({
                type: z.literal("string-not-empty"),
                argumentType: z.literal("string")
            }),
            z.object({
                type: z.literal("string-variants"),
                argumentType: z.literal("string"),
                variants: z.array(z.object({
                    description: z.string(),
                    value: z.string()
                }))
            })
        ])
    }))
}));

export interface FunctionServer {
    getName(): string;

    getFunctions(context: SessionContext): Promise<Functions>;

    callFunction(context: SessionContext, functionName: string, parameters: Record<string, number | string>): Promise<void>;
}