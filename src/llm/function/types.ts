import { Span } from '@sentry/node'

import { Functions } from '../types'

export interface FunctionServer {
  callFunction(sessionId: string, metadata: object, functionName: string,
    parameters: unknown, parentSpan: Span): Promise<string>;

  getFunctions(parentSpan: Span): Promise<Functions>;

  getName(): string;

  initialize(): Promise<void>;
}
