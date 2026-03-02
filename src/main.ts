import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'node:fs'
import { OpenAI } from 'openai'
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions/completions'
import z from 'zod'

import { createAliceDirectiveFunctionServer } from './llm/function/alice-directive'
import { RemoteFunctionServer } from './llm/function/remote'
import { FunctionServer } from './llm/function/types'
import { HandlebarsPromptGenerator } from './llm/prompt-generator/handlebars'
import { JSONFormatResponseParser } from './llm/response-parser/json-format'
import { RemoteStateServer } from './llm/state/remote'
import { SystemStateServer } from './llm/state/system'
import { StateServer } from './llm/state/types'
import { getLogger } from './logger'
import { Processor } from './processor'
import { InMemorySessionStorage } from './session-storage/in-memory'

const logger = getLogger()

dotenv.config({
  path: '.env.local'
})
dotenv.config()

const PORT = Number.parseInt(process.env.PORT || '8080')

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://llm.bksp.in'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'qwen2.5-coder-7b-instruct'

const PROCESSOR_PROMPT_TEMPLATE_PATH = process.env.PROMPT_TEMPLATE_PATH ?? 'prompt.handlebars'
const PROCESSOR_FUNCTION_SERVER_URLS = (process.env.PROCESSOR_FUNCTION_SERVER_URLS ?? '').split(',').filter(Boolean)
const PROCESSOR_STATE_SERVER_URLS = (process.env.PROCESSOR_STATE_SERVER_URLS ?? '').split(',').filter(Boolean)

const CACHE_SIZE = Number.parseInt(process.env.CACHE_SIZE || '1000')

const app = express()

app.use(cors())

const requestType = z.object({
  metadata: z.record(z.any()),
  sessionId: z.string().uuid().optional(),
  text: z.string()
})

const openAI = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
})

const stateServers: StateServer[] = [
  new SystemStateServer()
]
for (const url of PROCESSOR_STATE_SERVER_URLS) {
  stateServers.push(new RemoteStateServer(url))
}

const functionServers: FunctionServer[] = [
  createAliceDirectiveFunctionServer()
]
for (const url of PROCESSOR_FUNCTION_SERVER_URLS) {
  functionServers.push(new RemoteFunctionServer(url))
}

const promptGenerator = new HandlebarsPromptGenerator(
  fs.readFileSync(PROCESSOR_PROMPT_TEMPLATE_PATH).toString('utf8'))

const sessionStorage = new InMemorySessionStorage<ChatCompletionMessageParam[]>()

const responseParser = new JSONFormatResponseParser()

const processor = new Processor({
  cacheSize: CACHE_SIZE,
  functionServers,
  model: OPENAI_MODEL,
  openAI,
  promptGenerator,
  responseParser,
  sessionStorage,
  stateServers
})

app.use(express.json())
app.post('/process', (request, response) => {
  try {
    processor.process(requestType.parse(request.body))
      .then(result => {
        response.status(200).json({
          success: true,
          ...result
        })
      })
      .catch(error => {
        logger.error(`Processor error: ${error}`)
        response.status(500).json({
          error: error.toString(),
          success: false
        })
      })
  } catch (error) {
    logger.error(`Processor error: ${error}`)
    response.status(500).json({
      error: String(error),
      success: false
    })
  }
})

app.listen(PORT, error => {
  if (error) {
    logger.fatal(`Failed to start on :${PORT}: ${error}`)
    return
  }
  logger.info(`Started on :${PORT}`)
})
