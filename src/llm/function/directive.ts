import { Span, startSpan } from '@sentry/node'
import { Directive } from '@v3rt3p/types/directives'
import z from 'zod'

import { FunctionInfo, Functions } from '../types'
import { FunctionServer } from './types'

export interface DirectiveFunction<T> {
  implementation: (sessionId: string, metadata: object, input: T) => Promise<Directive>,
  info: FunctionInfo<T>,
}

export class DirectiveFunctionServer implements FunctionServer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor (private readonly directiveFunctions: Record<string, DirectiveFunction<any>>) {}

  async callDirectiveFunction (sessionId: string, metadata: object, functionName: string,
    arguments_: unknown, parentSpan: Span): Promise<Directive | null> {
    return startSpan({
      attributes: {
        parameters: JSON.stringify(arguments_, undefined, 2)
      },
      name: `Calling directive function ${sessionId}`,
      parentSpan
    }, async span => {
      const directiveFunction = this.directiveFunctions[functionName]
      if (!directiveFunction) {
        return null
      }
      const result = await directiveFunction.implementation(sessionId, metadata, arguments_)
      span.setAttribute('result', JSON.stringify(result, undefined, 2))
      return result
    })
  }

  callFunction (): Promise<string> {
    throw new Error('no async calls supported')
  }

  async getFunctions (): Promise<Functions> {
    return Object.fromEntries(Object.entries(this.directiveFunctions)
      .map(([name, function_]) => [name, function_.info]))
  }

  getName (): string {
    return 'directive'
  }

  async initialize (): Promise<void> {}
}

export function createDirectiveFunctionServer ():
DirectiveFunctionServer {
  return new DirectiveFunctionServer({
    assistant_disable_bluetooth: createDirectiveFunction({
      argumentsSchema: z.null(),
      description: 'disables bluetooth on the voice assistant',
      hasResponse: false,
    }, async () => ({
      type: 'bluetoothDisable'
    })),
    assistant_enable_bluetooth: createDirectiveFunction({
      argumentsSchema: z.null(),
      description: 'enables bluetooth on the voice assistant',
      hasResponse: false,
    }, async () => ({
      type: 'bluetoothEnable'
    })),
    assistant_set_volume_level: createDirectiveFunction({
      argumentsSchema: z.object({
        level: z.number().min(1).max(10).describe('volume level')
      }),
      description: 'sets volume level of the voice assistant, use this method only when user directly asks for your volume',
      hasResponse: false
    }, async (_, __, parameters) => ({
      level: parameters.level,
      type: 'soundSetLevel'
    })),
    assistant_set_volume_louder: createDirectiveFunction({
      argumentsSchema: z.null(),
      description: 'makes volume level of the voice assistant relatively louder, use this method only when user directly asks for your volume',
      hasResponse: false
    }, async () => ({
      type: 'soundLouder'
    })),
    assistant_set_volume_quieter: createDirectiveFunction({
      argumentsSchema: z.null(),
      description: 'makes volume level of the voice assistant relatively quieter, use this method only when user directly asks for your volume',
      hasResponse: false
    }, async () => ({
      type: 'soundQuieter'
    }))
  })
}

function createDirectiveFunction<T> (info: FunctionInfo<T>, implementation:
(sessionId: string, metadata: object, input: T) => Promise<Directive>):
  DirectiveFunction<T> {
  return {
    implementation,
    info,
  }
}
