import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'node:fs'
import { OpenAI } from 'openai'
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions/completions'
import { Server as WSServer } from 'ws'

import { createAliceDirectiveFunctionServer } from './llm/function/alice-directive'
import { RemoteFunctionServer } from './llm/function/remote'
import { FunctionServer } from './llm/function/types'
import { HandlebarsPromptGenerator } from './llm/prompt-generator/handlebars'
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
const PROCESSOR_STATE_PROMPT_TEMPLATE_PATH = process.env.STATE_PROMPT_TEMPLATE_PATH ?? 'prompt-state.handlebars'
const PROCESSOR_FUNCTION_SERVER_URLS = (process.env.PROCESSOR_FUNCTION_SERVER_URLS ?? '').split(',').filter(Boolean)
const PROCESSOR_STATE_SERVER_URLS = (process.env.PROCESSOR_STATE_SERVER_URLS ?? '').split(',').filter(Boolean)

const CACHE_SIZE = Number.parseInt(process.env.CACHE_SIZE || '1000')

const app = express()

app.use(cors())

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
  fs.readFileSync(PROCESSOR_PROMPT_TEMPLATE_PATH).toString('utf8'),
  fs.readFileSync(PROCESSOR_STATE_PROMPT_TEMPLATE_PATH).toString('utf8')
)

const sessionStorage = new InMemorySessionStorage<ChatCompletionMessageParam[]>()

const processor = new Processor({
  cacheSize: CACHE_SIZE,
  functionServers,
  model: OPENAI_MODEL,
  openAI,
  promptGenerator,
  sessionStorage,
  stateServers
})

app.use(express.json())

const server = app.listen(PORT, error => {
  if (error) {
    logger.fatal(`Failed to start on :${PORT}: ${error}`)
    return
  }
  logger.info(`Started on :${PORT}`)
})

const wsServer = new WSServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  if (request.url === '/process') {
    wsServer.handleUpgrade(request, socket, head, client => {
      wsServer.emit('connection', client, request)
    })
  }
})

wsServer.on('connection', (websocket, _) => {
  logger.debug('Got WebSocket connection')

  processor.openSession(websocket)
})
