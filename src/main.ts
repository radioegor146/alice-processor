import express from 'express'
import fs from 'node:fs'
import { OpenAI } from 'openai'
import { Server as WSServer } from 'ws'

import { getEnvironment } from './environment'
import { createAliceDirectiveFunctionServer } from './llm/function/alice-directive'
import { RemoteFunctionServer } from './llm/function/remote'
import { FunctionServer } from './llm/function/types'
import { RemoteMCPServer } from './llm/mcp/remote'
import { MCPServer } from './llm/mcp/types'
import { HandlebarsPromptGenerator } from './llm/prompt-generator/handlebars'
import { RemoteStateServer } from './llm/state/remote'
import { SystemStateServer } from './llm/state/system'
import { StateServer } from './llm/state/types'
import { LLMMessage } from './llm/types'
import { getLogger } from './logger'
import { Processor } from './processor'
import { InMemorySessionStorage } from './session-storage/in-memory'

const logger = getLogger()
const environment = getEnvironment()

const app = express()

const openAI = new OpenAI({
  apiKey: environment.OPENAI_API_KEY,
  baseURL: environment.OPENAI_BASE_URL,
})

const stateServers: StateServer[] = [
  new SystemStateServer()
]
for (const url of environment.PROCESSOR_STATE_SERVER_URLS) {
  stateServers.push(new RemoteStateServer(url))
}

const functionServers: FunctionServer[] = [
  createAliceDirectiveFunctionServer()
]
for (const url of environment.PROCESSOR_FUNCTION_SERVER_URLS) {
  functionServers.push(new RemoteFunctionServer(url))
}

const mcpServers: MCPServer[] = []
for (const url of environment.PROCESSOR_MCP_SERVER_URLS) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  mcpServers.push(new RemoteMCPServer(url.split('#')[1]!, url.split('#')[0]!))
}

(async () => {
  for (const server of mcpServers) {
    try {
      await server.init()
      logger.info(`${server.getName()} initialized successfully`)
    } catch (error) {
      logger.error(`Failed to init ${server.getName()} server: `, error)
    }
  }
// eslint-disable-next-line unicorn/prefer-top-level-await
})().catch(error => logger.error(error))

const promptGenerator = new HandlebarsPromptGenerator(
  fs.readFileSync(environment.PROMPT_TEMPLATE_PATH).toString('utf8'),
  fs.readFileSync(environment.STATE_PROMPT_TEMPLATE_PATH).toString('utf8')
)

const sessionStorage = new InMemorySessionStorage<LLMMessage[]>()

const processor = new Processor({
  cacheSize: environment.CACHE_SIZE,
  functionServers,
  mcpServers,
  model: environment.OPENAI_MODEL,
  openAI,
  promptGenerator,
  sessionStorage,
  stateServers
})

app.use(express.json())

const server = app.listen(environment.PORT, error => {
  if (error) {
    logger.fatal(`Failed to start on :${environment.PORT}: `, error)
    return
  }
  logger.info(`Started on :${environment.PORT}`)
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
