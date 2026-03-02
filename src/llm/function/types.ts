import z from 'zod'

import { Functions, SessionContext } from '../types'

export const functionsType = z.record(z.object({
  arguments: z.record(z.object({
    constraints: z.discriminatedUnion('type', [
      z.object({
        argumentType: z.literal('number'),
        max: z.number(),
        min: z.number(),
        type: z.literal('number-min-max')
      }),
      z.object({
        argumentType: z.literal('number'),
        type: z.literal('number-variants'),
        variants: z.array(z.object({
          description: z.string(),
          value: z.number()
        }))
      }),
      z.object({
        argumentType: z.literal('string'),
        type: z.literal('string-not-empty')
      }),
      z.object({
        argumentType: z.literal('string'),
        type: z.literal('string-variants'),
        variants: z.array(z.object({
          description: z.string(),
          value: z.string()
        }))
      })
    ]),
    description: z.string()
  })),
  description: z.string()
}))

export interface FunctionServer {
  callFunction(context: SessionContext, functionName: string,
    parameters: Record<string, number | string>): Promise<void>;

  getFunctions(context: SessionContext): Promise<Functions>;

  getName(): string;
}
