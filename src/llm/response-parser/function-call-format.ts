/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { getLogger } from '../../logger'
import { StructuredResponse } from '../types'
import { ResponseParser } from './types'

export class FunctionCallFormatResponseParser implements ResponseParser {
  private readonly logger = getLogger<FunctionCallFormatResponseParser>()

  parse (text: string): StructuredResponse {
    const parts = text.split(/\s/ig).filter(Boolean)
    const functionCalls: [string, Record<string, number>][] = []
    let requireMoreInput = false
    let index = 0
    while (index < parts.length) {
      if (parts[index] === 'call_function') {
        index++
        const functionName = parts[index]
        index++
        const rawParameters: [string, number][] = []
        while (index < parts.length) {
          const parameter = parts[index]
          const parameterParts = parameter!.split('=')
          if (parameterParts.length !== 2) {
            break
          }
          try {
            const value = Number.parseInt(parameterParts[1]!)
            rawParameters.push([parameterParts[0]!, value])
            index++
          } catch {
            break
          }
        }
        const resultParameters: Record<string, number> = {}
        for (const [name, value] of rawParameters) {
          if (resultParameters[name] !== undefined) {
            this.logger.warn(`Duplicate parameter '${name}'`)
            continue
          }
          resultParameters[name] = value
        }
        functionCalls.push([functionName!, resultParameters])
      } else {
        if (parts[index] === 'CONTINUE_DIALOG') {
          index++
          requireMoreInput = true
          break
        }
        break
      }
    }

    return {
      functionCalls: functionCalls.map(([name, parsedParameters]) => ({
        name,
        parameters: parsedParameters
      })),
      requireMoreInput,
      text: parts.slice(index).join(' ')
    }
  }
}
