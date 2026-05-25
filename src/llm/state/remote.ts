import { Span, startSpan } from '@sentry/node'

import { State } from '../types'
import { StateServer, stateType } from './types'

export class RemoteStateServer implements StateServer {
  constructor (private readonly url: string) {}

  async getIndependentState (sessionId: string, parentSpan: Span): Promise<State> {
    return startSpan({
      name: `Requesting independent state from ${this.getName()}`,
      op: 'get-independent-state-server',
      parentSpan
    }, async span => {
      const response = await fetch(this.url, {
        body: JSON.stringify({
          sessionId
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'PUT'
      })
      const json = await response.json()
      const result = stateType.parse(json)
      span.setAttribute('result', JSON.stringify(result, undefined, 2))
      return result
    })
  }

  getName (): string {
    return `remote{${this.url}}`
  }

  async getState (sessionId: string, metadata: object, parentSpan: Span): Promise<State> {
    return startSpan({
      name: `Requesting state from ${this.getName()}`,
      op: 'get-state-server',
      parentSpan
    }, async span => {
      const response = await fetch(this.url, {
        body: JSON.stringify({
          metadata,
          sessionId
        }),
        headers: {
          'content-type': 'application/json'
        },
        method: 'POST'
      })
      const json = await response.json()
      const result = stateType.parse(json)
      span.setAttribute('result', JSON.stringify(result, undefined, 2))
      return result
    })
  }

  async initialize (): Promise<void> {}
}
