import z from 'zod'

import { SessionContext, State } from '../types'

export const stateType = z.record(z.object({
  description: z.string(),
  value: z.string()
}))

export interface StateServer {
  getName(): string;

  getState(context: SessionContext): Promise<State>;
}
