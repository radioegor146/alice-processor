import { Functions, SessionContext } from '../types'
import { FunctionServer, functionsType } from './types'

export class RemoteFunctionServer implements FunctionServer {
  constructor (private readonly url: string) {}

  async callFunction (context: SessionContext, name: string,
    parameters: Record<string, number | string>): Promise<void> {
    await fetch(this.url, {
      body: JSON.stringify({
        context,
        name,
        parameters
      }),
      headers: {
        'content-type': 'application/json'
      },
      method: 'PATCH'
    })
  }

  async getFunctions (context: SessionContext): Promise<Functions> {
    const response = await fetch(this.url, {
      body: JSON.stringify({
        context
      }),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST'
    })
    return functionsType.parse(await response.json())
  }

  getName (): string {
    return `remote{${this.url}}`
  }
}
