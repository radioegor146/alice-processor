import Handlebars from 'handlebars'

import { FunctionArgument, FunctionArgumentValueConstraints, Functions, State } from '../types'
import { PromptGenerator } from './types'

export class HandlebarsPromptGenerator implements PromptGenerator {
  private readonly template: HandlebarsTemplateDelegate
  private readonly stateTemplate: HandlebarsTemplateDelegate

  constructor (private readonly rawTemplate: string, private readonly rawStateTemplate: string) {
    this.template = Handlebars.compile(rawTemplate, {
      noEscape: true
    })
    this.stateTemplate = Handlebars.compile(rawStateTemplate, {
      noEscape: true
    })
  }

  generateState(state: State): string {
    return this.stateTemplate({
      stateText: this.getStateText(state)
    })
  }

  generate (functions: Functions): string {
    return this.template({
      functionsText: this.getFunctionsText(functions)
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

  private getStateText (state: State): string {
    let text = ''
    for (const [name, entry] of Object.entries(state)) {
      text += `${name} (${entry.description}): ${entry.value}\n`
    }
    return text.trim()
  }
}
