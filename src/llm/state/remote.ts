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
      method: 'PUT'
    })
    const json = await response.json()
    console.info(json)
    return stateType.parse(json)
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
    const json = await response.json()
    console.info(json)
    return stateType.parse(json)
  }
}
