import { StructuredResponse } from '../types'
import { ResponseParser } from './types'

export class PlainResponseParser implements ResponseParser {
  parse (text: string): StructuredResponse {
    return {
      functionCalls: [],
      requireMoreInput: false,
      text
    }
  }
}
