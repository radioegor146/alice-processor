import { Functions } from '../types'
import { FunctionServer, functionsType } from './types'

export class RemoteFunctionServer implements FunctionServer {
  constructor (private readonly url: string) {}

  async callFunction (sessionId: string, metadata: object, name: string,
    parameters: Record<string, number | string>): Promise<void> {
    await fetch(this.url, {
      body: JSON.stringify({
        metadata,
        name,
        parameters,
        sessionId
      }),
      headers: {
        'content-type': 'application/json'
      },
      method: 'PATCH'
    })
  }

  async getFunctions (): Promise<Functions> {
    const response = await fetch(this.url, {
      headers: {
        'content-type': 'application/json'
      },
      method: 'GET'
    })
    return functionsType.parse(await response.json())
  }

  getName (): string {
    return `remote{${this.url}}`
  }
}
