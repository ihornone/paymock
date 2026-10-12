#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPaymockMcpServer } from './server';

async function main() {
  const userId = process.env.PAYMOCK_USER_ID || null;
  const baseUrl = process.env.PAYMOCK_URL || 'http://localhost:8787';
  const defaultProjectId = process.env.PAYMOCK_PROJECT_ID || null;

  const server = createPaymockMcpServer({
    userId,
    baseUrl,
    defaultProjectId,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Paymock MCP Server started successfully on stdio');
}

main().catch((err) => {
  console.error('Fatal error in Paymock MCP Server:', err);
  process.exit(1);
});
