import Handlebars from 'handlebars'

import { MCPFunctions } from '../mcp/types'
import { FunctionArgument, FunctionArgumentValueConstraints, Functions, State } from '../types'
import { PromptGenerator } from './types'

export class HandlebarsPromptGenerator implements PromptGenerator {
  private readonly stateTemplate: HandlebarsTemplateDelegate
  private readonly template: HandlebarsTemplateDelegate

  constructor (rawTemplate: string, rawStateTemplate: string) {
    this.template = Handlebars.compile(rawTemplate, {
      noEscape: true
    })
    this.stateTemplate = Handlebars.compile(rawStateTemplate, {
      noEscape: true
    })
  }

  generate (functions: Functions, mcpFunctions: MCPFunctions): string {
    return this.template({
      functionsText: `${this.getFunctionsText(functions)}\n${this.getMCPFunctionsText(mcpFunctions)}`
    })
  }

  generateState (state: State): string {
    return this.stateTemplate({
      stateText: this.getStateText(state)
    })
  }

  private getFunctionArgumentConstraintsText (constraints: FunctionArgumentValueConstraints): string {
    switch (constraints.type) {
      case 'number-min-max': {
        return `(min ${constraints.min}, max ${constraints.max})`
      }
      case 'number-variants': {
        return constraints.variants.map(variant =>
                    `${variant.value} (${variant.description})`).join('|')
      }
      case 'string-not-empty': {
        return '"any not empty string"'
      }
      case 'string-variants': {
        return constraints.variants.map(variant =>
                    `"${variant.value}" (${variant.description})`).join('|')
      }
    }
  }

  private getFunctionArgumentsText (argumentMap: Record<string, FunctionArgument>): string {
    let text = ''
    for (const [name, argument] of Object.entries(argumentMap)) {
      text += ` ${name} (MUST BE ${argument.constraints.argumentType}) (${argument.description})=${this.getFunctionArgumentConstraintsText(argument.constraints)}`
    }
    return text
  }

  private getFunctionsText (functions: Functions): string {
    let text = ''
    for (const [name, functionInfo] of Object.entries(functions)) {
      text += `${name} (${functionInfo.description})${this.getFunctionArgumentsText(functionInfo.arguments)}\n`
    }
    return text
  }

  private getMCPFunctionsText (mcpFunctions: MCPFunctions): string {
    let text = ''
    for (const [name, functionInfo] of Object.entries(mcpFunctions)) {
      text += `${name} (${functionInfo.description}): ${JSON.stringify(functionInfo.argumentsSchema)}\n`
    }
    return text
  }

  private getStateText (state: State): string {
    let text = ''
    for (const [name, entry] of Object.entries(state)) {
      text += `${name} (${entry.description}): jsonSchema: ${entry.value}\n`
    }
    return text.trim()
  }
}
