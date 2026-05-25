import { PROCESSOR_METADATA_SERVER_TYPE_KEY, ProcessorMetadataServerType } from '@v3rt3p/types/processor'

import { State, StateServer } from './types'

const names: Record<'unknown' | ProcessorMetadataServerType | string, string> = {
  marusya: 'Маруся',
  quasar: 'Алиса (but you can be addressed by user as Яндекс or Ясмина)',
  unknown: 'unknown, you DO NOT KNOW your name'
}

export class SystemStateServer implements StateServer {
  async getIndependentState (_sessionId: string): Promise<State> {
    return {}
  }

  getName (): string {
    return 'system'
  }

  async getState (_sessionId: string, metadata: object): Promise<State> {
    return {
      assistant_name: {
        description: 'name of assistant (YOU)',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: names[(metadata as any)[PROCESSOR_METADATA_SERVER_TYPE_KEY] ?? 'unknown'] ?? 'unknown'
      },
      date_time: {
        description: 'current time and date in DD-MM-YYYY HH:MM:SS format',
        value: this.getCurrentTimeAndDateFormatted()
      },
      input_person_age: {
        description: 'age of person who talked to you',
        value: (metadata as { age: string }).age ?? 'unknown'
      },
      input_person_gender: {
        description: 'gender of person who talked to you',
        value: (metadata as { gender: string }).gender ?? 'unknown'
      }
    }
  }

  async initialize (): Promise<void> {}

  private getCurrentTimeAndDateFormatted (): string {
    const date = new Date()
    return `${date.getDate().toString().padStart(2, '0')}-${
            (date.getMonth() + 1).toString().padStart(2, '0')}-${
            date.getFullYear().toString().padStart(4, '0')} ${
            date.getHours().toString().padStart(2, '0')}:${
            date.getMinutes().toString().padStart(2, '0')}:${
            date.getSeconds().toString().padStart(2, '0')}`
  }
}
