import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, type Services } from './tools.js';

/** Build a fresh MCP server with the full v1 tool surface wired to the services. */
export function buildMcpServer(services: Services): McpServer {
  const server = new McpServer({ name: 'gtm-mcp', version: '0.1.0' });
  registerTools(server, services);
  return server;
}
