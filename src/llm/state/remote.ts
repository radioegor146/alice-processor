import { State } from '../types'
import { StateServer, stateType } from './types'

export class RemoteStateServer implements StateServer {
  constructor (private readonly url: string) {}

  async getIndependentState (sessionId: string): Promise<State> {
    const response = await fetch(this.url, {
      body: JSON.stringify({
        context: {
          sessionId
        }
      }),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST'
    })
    return stateType.parse(await response.json())
  }

  getName (): string {
    return `remote{${this.url}}`
  }

  async getState (sessionId: string, metadata: object): Promise<State> {
    const response = await fetch(this.url, {
      body: JSON.stringify({
        context: {
          metadata,
          sessionId
        }
      }),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST'
    })
    return stateType.parse(await response.json())
  }
}
