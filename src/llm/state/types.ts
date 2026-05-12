import { Span } from '@sentry/node'
import z from 'zod'

import { State } from '../types'

export const stateType = z.record(z.string(), z.object({
  description: z.string(),
  value: z.string()
}))

export interface StateServer {
  getIndependentState(sessionId: string, parentSpan: Span): Promise<State>

  getName(): string;

  getState(sessionId: string, metadata: object, parentSpan: Span): Promise<State>;
}
