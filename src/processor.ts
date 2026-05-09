import { JSONParser } from '@streamparser/json'
import { LRUCache } from 'lru-cache'
import { randomUUID } from 'node:crypto'
import { OpenAI } from 'openai'
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions/completions'
import { WebSocket } from 'ws'
import z from 'zod'

import { AliceDirectiveFunctionServer } from './llm/function/alice-directive'
import { FunctionServer } from './llm/function/types'
import { PromptGenerator } from './llm/prompt-generator/types'
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

const logger = getLogger()

export type AliceDirective = SoundLouderDirective | SoundQuieterDirective | SoundSetLevelDirective

export interface ProcessorPrepareRequest {
  sessionId?: string | undefined;
}

export interface ProcessorPrepareResponse {
  sessionId?: string | undefined;
}

export interface ProcessorRequest {
  isExternalEvent?: boolean | undefined;
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
  sessionStorage: SessionStorage<ChatCompletionMessageParam[]>;
  stateServers: StateServer[];
}

const functionCallType = z.object({
  args: z.record(z.union([z.number(), z.string()])),
  name: z.string(),
  schedule: z.string().optional()
})

const llmResponseType = z.object({
  can_cache: z.boolean().optional(),
  continue_dialog: z.boolean().optional(),
  function_calls: z.array(functionCallType).optional(),
  text: z.string().optional()
})

const scheduleTimeRegexes: { coefficient: number; regex: RegExp, }[] = [
  {
    coefficient: 1, regex: /^(?<value>[.\d]+)ms$/
  },
  {
    coefficient: 1000, regex: /^(?<value>[.\d]+)s$/
  },
  {
    coefficient: 60 * 1000, regex: /^(?<value>[.\d]+)m$/
  },
  {
    coefficient: 60 * 60 * 1000, regex: /^(?<value>[.\d]+)h$/
  },
  {
    coefficient: 24 * 60 * 60 * 1000, regex: /^(?<value>[.\d]+)d$/
  },
]

const webSocketMessageType = z.union([
  z.object({
    data: z.object({
      sessionId: z.string().optional()
    }),
    type: z.literal('prepare')
  }),
  z.object({
    data: z.object({
      isExternalEvent: z.boolean().optional(),
      metadata: z.record(z.string(), z.any()),
      text: z.string()
    }),
    type: z.literal('process')
  })
])

export class Processor {
  private readonly cache: LRUCache<string, string>
  private readonly lockedSessions: Set<string> = new Set()
  private readonly logger = getLogger<Processor>()

  constructor (private readonly parameters: ProcessorParameters) {
    this.cache = new LRUCache({
      max: parameters.cacheSize
    })
  }

  openSession (webSocket: WebSocket): void {
    let sessionId: null | string = null
    webSocket.addEventListener('error', error => {
      if (sessionId) {
        this.lockedSessions.delete(sessionId)
      }
      this.logger.info(`WebSocket session error: ${error.error}`)
    })
    webSocket.addEventListener('close', error => {
      if (sessionId) {
        this.lockedSessions.delete(sessionId)
      }
      this.logger.info(`WebSocket session error: ${error.code}`)
    })
    webSocket.addEventListener('message', async message => {
      const decodedData = webSocketMessageType.parse(JSON.parse(message.data.toString()))
      switch (decodedData.type) {
        case 'prepare': {
          this.logger.info('WebSocket prepare')
          sessionId = decodedData.data.sessionId ?? null
          if (sessionId) {
            this.lockedSessions.add(sessionId)
          }
          break
        }
        case 'process': {
          this.logger.info('WebSocket process')
          const response = await this.process({
            ...decodedData.data,
            sessionId: sessionId ?? undefined
          })
          sessionId = response.sessionId ?? null
          if (sessionId) {
            this.lockedSessions.add(sessionId)
          }
          webSocket.send(JSON.stringify({
            data: {
              directives: response.directives,
              finished: false,
              sessionId: response.sessionId,
              text: response.text
            },
            type: 'partialResponse'
          }), () => {
            this.logger.info('WebSocket close')
            webSocket.close()
          })
          break
        }
      }
    })
  }

  async prepare (request: ProcessorPrepareRequest): Promise<ProcessorPrepareResponse> {
    return {
      sessionId: request.sessionId
    }
  }

  async process (request: ProcessorRequest): Promise<ProcessorResult> {
    const isNewRequest = !request.sessionId

    const text = request.text.trim()
    const sessionId = request.sessionId ?? randomUUID()
    const previousMessages = await this.parameters.sessionStorage.load(sessionId) ?? []

    const context: SessionContext = {
      id: sessionId,
      metadata: request.metadata
    }

    const functions = await this.getFunctions(context)

    if (isNewRequest) {
      previousMessages.push({
        content: this.parameters.promptGenerator.generate(functions),
        role: 'system'
      })
    }

    const state = await this.getState(context)
    previousMessages.push({
      content: this.parameters.promptGenerator.generateState(state),
      role: 'system'
    })

    if (request.isExternalEvent) {
      previousMessages.push({
        content: `External event happened: '${text}'`,
        role: 'system'
      })
    } else {
      previousMessages.push({
        content: text,
        role: 'user'
      })
    }

    this.logger.info(`Received request: ${JSON.stringify(request, undefined, 4)}`)

    let responseContent: string = ''

    const cachedResponse = this.cache.get(text)

    let doFunctionCallsOnline = false

    const directives: AliceDirective[] = []

    if (isNewRequest && cachedResponse) {
      doFunctionCallsOnline = false
      responseContent = cachedResponse
      this.logger.info(`Received answer from cache: ${responseContent}`)
    } else {
      doFunctionCallsOnline = true
      this.logger.info('Querying LLM')
      const response = await this.parameters.openAI.chat.completions.create({
        messages: [
          ...previousMessages
        ],
        model: this.parameters.model,
        stream: true
      })

      const callFunctionsPromises: Promise<[AliceDirective[], Promise<void>]>[] = []

      const jsonParser = new JSONParser()
      jsonParser.onValue = async (value) => {
        if (value.stack.length === 2 && value.stack[0]?.key === undefined &&
          value.stack[1]?.key === 'function_calls' && typeof value.key === 'number') {
          this.logger.info(`Found function call: ${JSON.stringify(value.value)}`)
          callFunctionsPromises.push(this.callFunctions(context, functions, [parseFunctionCall(value.value)]))
        }
      }

      for await (const chunk of response) {
        const part = chunk.choices[0]?.delta?.content
        if (!part) {
          continue
        }
        responseContent += part
        jsonParser.write(part)
      }

      const result = await Promise.all(callFunctionsPromises)

      for (const part of result) {
        directives.push(...part[0])
        part[1].catch(error => this.logger.error(`Failed to call functions: ${error}`))
      }

      this.logger.info(`Received answer from LLM: '${responseContent}'`)
    }

    previousMessages.push({
      content: responseContent,
      role: 'assistant'
    })
    await this.parameters.sessionStorage.save(sessionId, previousMessages)

    const structuredResponse = parseLLMResponse(JSON.parse(responseContent))
    if (!structuredResponse.requireMoreInput && structuredResponse.canCache && isNewRequest) {
      this.cache.set(text, responseContent)
      this.logger.info(`Saved answer to cache: '${text}' -> ${responseContent}`)
    }

    if (!doFunctionCallsOnline) {
      const [newDirectives, functionPromises] =
              await this.callFunctions(context, functions, structuredResponse.functionCalls)

      functionPromises.catch(error => this.logger.error(`Failed to call functions: ${error}`))

      directives.push(...newDirectives)
    }

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

function parseFunctionCall (rawCall: unknown): FunctionCall {
  const call = functionCallType.parse(rawCall)
  return {
    name: call.name,
    parameters: call.args,
    ...(call.schedule
      ? {
          schedule: parseSchedule(call.schedule)
        }
      : {})
  }
}

function parseLLMResponse (rawResponse: unknown): StructuredResponse {
  const response = llmResponseType.parse(rawResponse)
  return {
    canCache: response.can_cache ?? false,
    functionCalls: response.function_calls?.map(call => parseFunctionCall(call)) ?? [],
    requireMoreInput: response.continue_dialog ?? false,
    text: response.text ?? ''
  }
}

function parseSchedule (schedule: string): number {
  const parts = schedule.split(' ').filter(Boolean)
  let result = 0
  for (const part of parts) {
    let matched = false
    for (const { coefficient, regex } of scheduleTimeRegexes) {
      const match = part.match(regex)
      if (!match) {
        continue
      }
      matched = true
      result += coefficient * Number.parseFloat(match.groups?.value ?? '0')
    }
    if (!matched) {
      logger.warn(`Failed to parse 'schedule' part from LLM: '${part}'`)
    }
  }
  return result
}
