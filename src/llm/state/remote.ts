import { SessionContext, State } from '../types'
import { StateServer, stateType } from './types'

export class RemoteStateServer implements StateServer {
  constructor (private readonly url: string) {}

  getName (): string {
    return `remote{${this.url}}`
  }

  async getState (context: SessionContext): Promise<State> {
    const response = await fetch(this.url, {
      body: JSON.stringify({
        context
      }),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST'
    })
    return stateType.parse(await response.json())
  }
}
