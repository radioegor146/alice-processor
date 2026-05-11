import z from 'zod'

import { State } from '../types'

export const stateType = z.record(z.object({
  description: z.string(),
  value: z.string()
}))

export interface StateServer {
  getIndependentState(sessionId: string): Promise<State>

  getName(): string;

  getState(sessionId: string, metadata: object): Promise<State>;
}
