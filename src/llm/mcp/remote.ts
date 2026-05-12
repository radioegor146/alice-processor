import { Client } from '@modelcontextprotocol/sdk/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'
import { Span, startSpan } from '@sentry/node'

import { getLogger } from '../../logger'
import { MCPFunctions, MCPServer } from './types'

export class RemoteMCPServer implements MCPServer {
  private readonly logger = getLogger<RemoteMCPServer>()
  private readonly mcp: Client

  constructor (private readonly url: string, private readonly name: string) {
    this.mcp = new Client({ name: 'alice-processor', version: '1.0.0' })
  }

  async callFunction (functionName: string, arguments_: unknown, parentSpan: Span): Promise<string> {
    return startSpan({
      name: `Calling MCP function ${functionName} on ${this.getName()}`,
      op: 'call-mcp-function',
      parentSpan
    }, async span => {
      this.logger.info(`Calling ${functionName}`)
      const response = await this.mcp.callTool({
        arguments: arguments_ as unknown as { [k: string]: unknown },
        name: functionName.slice(this.name.length + 1)
      })
      const responseItems = response.content as unknown as {
        text: ''
        type: 'text' | string,
      }[]
      const result = String(responseItems[0]?.text ?? 'N/A')
      span.setAttribute('result', result)
      return result
    })
  }

  async getFunctions (parentSpan: Span): Promise<MCPFunctions> {
    return startSpan({
      name: `Requesting MCP functions from ${this.getName()}`,
      op: 'get-mcp-functions-server',
      parentSpan
    }, async () => {
      const tools = await this.mcp.listTools()
      const functions: MCPFunctions = {}
      for (const tool of tools.tools) {
        functions[`${this.name}_${tool.name}`] = {
          argumentsSchema: tool.inputSchema,
          description: tool.description ?? '???'
        }
      }
      return functions
    })
  }

  getName (): string {
    return `mcp{${this.name}#${this.url}`
  }

  async init (): Promise<void> {
    this.mcp.connect(new StreamableHTTPClientTransport(new URL(this.url)))
  }
}
