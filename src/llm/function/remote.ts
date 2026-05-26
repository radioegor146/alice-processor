import { Span, startSpan } from '@sentry/node'
import z from 'zod'

import { FunctionInfo, Functions, FunctionServer } from './types'

const functionArgumentType = z.object({
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
})

const functionInfoType = z.object({
  arguments: z.record(z.string(), functionArgumentType),
  description: z.string()
})

const functionsType = z.record(z.string(), functionInfoType)

export class RemoteFunctionServer implements FunctionServer {
  constructor (private readonly url: string) {}

  async callFunction (sessionId: string, metadata: object, name: string,
    arguments_: unknown, parentSpan: Span): Promise<string> {
    return startSpan({
      attributes: {
        parameters: JSON.stringify(arguments_, undefined, 2)
      },
      name: `Calling function ${name} on ${this.getName()}`,
      op: 'call-function',
      parentSpan
    }, async () => {
      await fetch(this.url, {
        body: JSON.stringify({
          arguments: arguments_,
          metadata,
          name,
          sessionId
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'PATCH'
      })
      return ''
    })
  }

  async getFunctions (parentSpan: Span): Promise<Functions> {
    return startSpan({
      name: `Requesting functions from ${this.getName()}`,
      op: 'get-functions-server',
      parentSpan
    }, async () => {
      const response = await fetch(this.url, {
        headers: {
          'content-type': 'application/json'
        },
        method: 'GET'
      })
      return Object.fromEntries(Object.entries(
        functionsType.parse(await response.json()))
        .map(([name, entry]) => ([name, mapEntry(entry)])))
    })
  }

  getName (): string {
    return `remote{${this.url}}`
  }

  async initialize (): Promise<void> {}
}

function convertToZodType (type: z.infer<typeof functionArgumentType>): z.ZodSchema {
  switch (type.constraints.type) {
    case 'number-min-max': {
      return z.number().min(type.constraints.min).max(type.constraints.max).describe(type.description)
    }
    case 'number-variants': {
      return z.union(type.constraints.variants.map(variant =>
        z.literal(variant.value).describe(variant.description))).describe(type.description)
    }
    case 'string-not-empty': {
      return z.string().nonempty().describe(type.description)
    }
    case 'string-variants': {
      return z.union(type.constraints.variants.map(variant =>
        z.literal(variant.value).describe(variant.description))).describe(type.description)
    }
  }
}

function mapEntry (entry: z.infer<typeof functionInfoType>): FunctionInfo {
  const types: Record<string, z.ZodSchema> = {}
  for (const [key, value] of Object.entries(entry.arguments)) {
    types[key] = convertToZodType(value)
  }
  return {
    argumentsSchema: Object.keys(types).length === 0 ? z.null() : z.object(types),
    description: entry.description,
    hasResponse: false
  }
}
