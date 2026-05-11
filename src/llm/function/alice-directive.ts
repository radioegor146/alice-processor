import { AliceDirective } from '../../processor'
import { FunctionInfo, Functions } from '../types'
import { FunctionServer } from './types'

export interface AliceDirectiveFunction {
  implementation: (id: string, metadata: object, input: Record<string, number | string>) => Promise<AliceDirective>,
  info: FunctionInfo,
}

export class AliceDirectiveFunctionServer implements FunctionServer {
  constructor (private readonly directiveFunctions: Record<string, AliceDirectiveFunction>) {}

  async callDirectiveFunction (id: string, metadata: object, functionName: string,
    parameters: Record<string, number | string>): Promise<AliceDirective | null> {
    const directiveFunction = this.directiveFunctions[functionName]
    if (!directiveFunction) {
      return null
    }
    return directiveFunction.implementation(id, metadata, parameters)
  }

  callFunction (): Promise<void> {
    throw new Error('no async calls supported')
  }

  async getFunctions (): Promise<Functions> {
    return Object.fromEntries(Object.entries(this.directiveFunctions)
      .map(([name, function_]) => [name, function_.info]))
  }

  getName (): string {
    return 'alice-directive'
  }
}

export function createAliceDirectiveFunctionServer ():
AliceDirectiveFunctionServer {
  return new AliceDirectiveFunctionServer({
    alice_set_volume_level: createDirectiveFunction({
      arguments: {
        level: {
          constraints: {
            argumentType: 'number',
            max: 10,
            min: 1,
            type: 'number-min-max'
          },
          description: 'volume level'
        }
      },
      description: 'sets volume level of Алиса voice assistant, use this method only when user directly asks for your volume'
    }, async (_, __, parameters) => ({
      newLevel: parameters['level'] as number,
      type: 'soundSetLevel'
    })),
    alice_set_volume_louder: createDirectiveFunction({
      arguments: {},
      description: 'makes volume level of Алиса voice assistant relatively louder, use this method only when user directly asks for your volume'
    }, async () => ({
      type: 'soundLouder'
    })),
    alice_set_volume_quieter: createDirectiveFunction({
      arguments: {},
      description: 'makes volume level of Алиса voice assistant relatively quieter, use this method only when user directly asks for your volume'
    }, async () => ({
      type: 'soundQuieter'
    })),
  })
}

function createDirectiveFunction (info: FunctionInfo, implementation:
(id: string, metadata: object, input: Record<string, number | string>) => Promise<AliceDirective>):
  AliceDirectiveFunction {
  return {
    implementation,
    info,
  }
}
