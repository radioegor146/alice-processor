import { AliceDirective } from '../../processor'
import { FunctionInfo, Functions, SessionContext } from '../types'
import { FunctionServer } from './types'

export interface AliceDirectiveFunction {
  implementation: (context: SessionContext, input: Record<string, number | string>) => Promise<AliceDirective>,
  info: FunctionInfo,
}

export class AliceDirectiveFunctionServer implements FunctionServer {
  constructor (private readonly directiveFunctions: Record<string, AliceDirectiveFunction>) {}

  callDirectiveFunction (context: SessionContext, functionName: string,
    parameters: Record<string, number | string>): Promise<AliceDirective> {
    return this.directiveFunctions[functionName].implementation(context, parameters)
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
      description: 'sets volume level of Алиса voice assistant'
    }, async (_, parameters) => ({
      newLevel: parameters['level'] as number,
      type: 'soundSetLevel'
    })),
    alice_set_volume_louder: createDirectiveFunction({
      arguments: {},
      description: 'makes volume level of Алиса voice assistant relatively louder'
    }, async () => ({
      type: 'soundLouder'
    })),
    alice_set_volume_quieter: createDirectiveFunction({
      arguments: {},
      description: 'makes volume level of Алиса voice assistant relatively quieter'
    }, async () => ({
      type: 'soundQuieter'
    })),
  })
}

function createDirectiveFunction (info: FunctionInfo, implementation:
(context: SessionContext, input: Record<string, number | string>) => Promise<AliceDirective>): AliceDirectiveFunction {
  return {
    implementation,
    info,
  }
}
