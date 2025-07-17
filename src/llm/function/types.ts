import {FunctionArgumentValueConstraints, Functions} from "../types";
import z from "zod";

export const functionsType = z.record(z.object({
    description: z.string(),
    arguments: z.record(z.object({
        description: z.string(),
        constraints: z.discriminatedUnion("type", [
            z.object({
                type: z.literal("min-max"),
                min: z.number(),
                max: z.number()
            }),
            z.object({
                type: z.literal("variants"),
                variants: z.array(z.object({
                    description: z.string(),
                    value: z.number()
                }))
            })
        ])
    }))
}));

export interface FunctionServer {
    getName(): string;

    getFunctions(): Promise<Functions>;

    callFunction(functionName: string, parameters: Record<string, number>): Promise<void>;
}