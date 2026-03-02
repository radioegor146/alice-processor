import { LRUCache } from 'lru-cache'
import { randomUUID } from 'node:crypto'
import { OpenAI } from 'openai'
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions/completions'

import { AliceDirectiveFunctionServer } from './llm/function/alice-directive'
import { FunctionServer } from './llm/function/types'
import { PromptGenerator } from './llm/prompt-generator/types'
import { ResponseParser } from './llm/response-parser/types'
import { StateServer } from './llm/state/types'
import {
  FunctionArgument,
  FunctionCall,
  FunctionCallArguments,
  FunctionInfo,
  Functions, SessionContext,
  State,
  StructuredResponse
} from './llm/types'
import { getLogger } from './logger'
import { SessionStorage } from './session-storage/types'

export type AliceDirective = SoundLouderDirective | SoundQuieterDirective | SoundSetLevelDirective

export interface ProcessorRequest {
  metadata: object;
  sessionId?: string | undefined;
  text: string;
}

export interface ProcessorResult {
  directives: AliceDirective[];
  requireMoreInput: boolean;
  sessionId: string;
  text: string;
}

export interface SoundLouderDirective {
  type: 'soundLouder';
}

export interface SoundQuieterDirective {
  type: 'soundQuieter';
}

export interface SoundSetLevelDirective {
  newLevel: number;
  type: 'soundSetLevel';
}

type ExtendedFunctionInfo = FunctionInfo & {
  server: FunctionServer
}

type ExtendedFunctions = Record<string, ExtendedFunctionInfo>

interface ProcessorParameters {
  cacheSize: number;
  functionServers: FunctionServer[];
  model: string;
  openAI: OpenAI;
  promptGenerator: PromptGenerator;
  responseParser: ResponseParser;
  sessionStorage: SessionStorage<ChatCompletionMessageParam[]>;
  stateServers: StateServer[];
}

export class Processor {
  private readonly cache: LRUCache<string, string>
  private readonly logger = getLogger<Processor>()

  constructor (private readonly parameters: ProcessorParameters) {
    this.cache = new LRUCache({
      max: parameters.cacheSize
    })
  }

  async process (request: ProcessorRequest): Promise<ProcessorResult> {
    const isNewRequest = !!request.sessionId
    const sessionId = request.sessionId ?? randomUUID()
    const previousMessages = await this.parameters.sessionStorage.load(sessionId) ?? []
    previousMessages.push({
      content: request.text,
      role: 'user'
    })

    const context: SessionContext = {
      id: sessionId,
      metadata: request.metadata
    }

    const state = await this.getState(context)

    const functions = await this.getFunctions(context)

    const prompt = this.parameters.promptGenerator.generate(state, functions)

    this.logger.info(`Received request: ${JSON.stringify(request, undefined, 4)}`)

    let responseContent: string

    const cachedResponse = this.cache.get(request.text)
    if (isNewRequest && cachedResponse) {
      responseContent = cachedResponse
      this.logger.info(`Received answer from cache: ${responseContent}`)
    } else {
      this.logger.debug(`Prompt: ${prompt}`)
      const response = await this.parameters.openAI.chat.completions.create({
        messages: [
          {
            content: prompt,
            role: 'system'
          },
          ...previousMessages
        ],
        model: this.parameters.model
      })

      const [choice] = response.choices
      responseContent = choice?.message?.content ?? ''

      this.logger.info(`Received answer from LLM: ${responseContent}`)
    }

    previousMessages.push({
      content: responseContent,
      role: 'assistant'
    })
    await this.parameters.sessionStorage.save(sessionId, previousMessages)

    const structuredResponse = this.parameters.responseParser.parse(responseContent)
    if (!structuredResponse.requireMoreInput && structuredResponse.canCache && isNewRequest) {
      this.cache.set(request.text, responseContent)
    }
    const [directives, functionPromises] =
            await this.callFunctions(context, functions, structuredResponse.functionCalls)

    functionPromises.catch(error => this.logger.error(`Failed to call functions: ${error}`))

    return {
      directives,
      requireMoreInput: structuredResponse.requireMoreInput,
      sessionId,
      text: structuredResponse.text
    }
  }

  private async callFunctions (context: SessionContext, functions: ExtendedFunctions,
    functionCalls: FunctionCall[]): Promise<[AliceDirective[], Promise<void>]> {
    const directives: AliceDirective[] = []

    const promises: Promise<void>[] = []
    for (const call of functionCalls) {
      const function_ = functions[call.name]
      if (!function_) {
        this.logger.warn(`Tried to call non-existent function '${call.name}'`)
        continue
      }
      if (!this.validateParameters(function_, call.parameters)) {
        this.logger.warn(`Tried to call function '${call.name}' with invalid parameters: ${JSON.stringify(call.parameters)}`)
        continue
      }

      if (function_.server instanceof AliceDirectiveFunctionServer) {
        directives.push(await function_.server.callDirectiveFunction(context, call.name, call.parameters))
        continue
      }

      promises.push((async () => {
        try {
          if (call.schedule) {
            this.logger.info(`Calling ${call.name} with ${JSON.stringify(call.parameters)} after ${call.schedule} milliseconds`)
            await new Promise(resolve => setTimeout(resolve, call.schedule))
          }
          await function_.server.callFunction(context, call.name, call.parameters)
        } catch (error) {
          this.logger.warn(`Failed to call function '${call.name}' with parameters ${JSON.stringify(call.parameters)}: ${error}`)
        }
      })())
    }

    return [directives, Promise.all(promises).then(() => {})]
  }

  private async getFunctions (context: SessionContext): Promise<ExtendedFunctions> {
    const promises: Promise<[FunctionServer, Functions, undefined | unknown]>[] = []
    for (const server of this.parameters.functionServers) {
      promises.push((async () => {
        try {
          const functions = await server.getFunctions(context)
          return [server, functions, undefined]
        } catch (error) {
          return [server, {}, error]
        }
      })())
    }
    const resultFunctions: ExtendedFunctions = {}
    const results = await Promise.all(promises)
    for (const [server, state, error] of results) {
      if (error) {
        this.logger.warn(`Function server ${server.getName()} returned error while fetching functions: ${error}`)
        continue
      }
      for (const [key, functionInfo] of Object.entries(state)) {
        if (resultFunctions[key]) {
          this.logger.warn(`Function server ${server.getName()} returned duplicate function entry '${key}'`)
          continue
        }
        resultFunctions[key] = {
          ...functionInfo,
          server
        }
      }
    }
    return resultFunctions
  }

  private async getState (context: SessionContext): Promise<State> {
    const promises: Promise<[StateServer, State, undefined | unknown]>[] = []
    for (const server of this.parameters.stateServers) {
      promises.push((async () => {
        try {
          const state = await server.getState(context)
          return [server, state, undefined]
        } catch (error) {
          return [server, {}, error]
        }
      })())
    }
    const resultState: State = {}
    const results = await Promise.all(promises)
    for (const [server, state, error] of results) {
      if (error) {
        this.logger.warn(`State server ${server.getName()} returned error: ${error}`)
        continue
      }
      for (const [key, stateEntry] of Object.entries(state)) {
        if (resultState[key]) {
          this.logger.warn(`State server ${server.getName()} returned duplicate state entry '${key}'`)
          continue
        }
        resultState[key] = stateEntry
      }
    }
    return resultState
  }

  private validateParameters (function_: ExtendedFunctionInfo, callArguments: FunctionCallArguments): boolean {
    const callArgumentsList = Object.entries(callArguments)
      .toSorted((a, b) => compareStrings(a[0], b[0]))
    const requiredArgumentsList = Object.entries(function_.arguments)
      .toSorted((a, b) => compareStrings(a[0], b[0]))

    if (callArgumentsList.length !== requiredArgumentsList.length) {
      return false
    }

    for (const [index, [callArgumentName, callArgumentValue]] of callArgumentsList.entries()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [requiredArgumentName, requiredArgumentConstraints] = requiredArgumentsList[index]!

      if (callArgumentName !== requiredArgumentName) {
        this.logger.warn(`Call argument '${callArgumentName}' !== '${requiredArgumentName}'`)
        return false
      }

      if (!this.validateParameterValue(callArgumentValue, requiredArgumentConstraints)) {
        this.logger.warn(`Call argument '${callArgumentName}' value does not satisfy constraints`)
        return false
      }
    }

    return true
  }

  private validateParameterValue (value: number | string, constraints: FunctionArgument): boolean {
    let numberValue = 0
    let stringValue = ''
    switch (constraints.constraints.argumentType) {
      case 'number': {
        switch (typeof value) {
          case 'number': {
            numberValue = value
            break
          }
          case 'string': {
            try {
              numberValue = Number.parseFloat(value)
            } catch {
              this.logger.warn(`Failed to parse '${value}' as number`)
              return false
            }
            break
          }
        }
        break
      }
      case 'string': {
        switch (typeof value) {
          case 'number': {
            stringValue = value.toString()
            break
          }
          default: {
            stringValue = value
            break
          }
        }
        break
      }
    }
    switch (constraints.constraints.type) {
      case 'number-min-max': {
        if (numberValue < constraints.constraints.min || numberValue > constraints.constraints.max) {
          return false
        }
        break
      }
      case 'number-variants': {
        if (!constraints.constraints.variants.some(variant => variant.value === numberValue)) {
          return false
        }
        break
      }
      case 'string-not-empty': {
        if (!stringValue) {
          return false
        }
        break
      }
      case 'string-variants': {
        if (!constraints.constraints.variants.some(variant => variant.value === stringValue)) {
          return false
        }
        break
      }
    }
    return true
  }
}

function compareStrings (a: string, b: string): number {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}
