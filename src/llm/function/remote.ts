import { Span, startSpan } from '@sentry/node'

import { Functions } from '../types'
import { FunctionServer, functionsType } from './types'

export class RemoteFunctionServer implements FunctionServer {
  constructor (private readonly url: string) {}

  async callFunction (sessionId: string, metadata: object, name: string,
    parameters: Record<string, number | string>, parentSpan: Span): Promise<void> {
    return startSpan({
      attributes: {
        parameters: JSON.stringify(parameters, undefined, 2)
      },
      name: `Calling function ${name} on ${this.getName()}`,
      op: 'call-function',
      parentSpan
    }, async () => {
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
      return functionsType.parse(await response.json())
    })
  }

  getName (): string {
    return `remote{${this.url}}`
  }
}
