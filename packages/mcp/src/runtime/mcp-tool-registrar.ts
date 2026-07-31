import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CapabilitySubject } from '#kernel/capabilities/capabilities.types';

export interface McpToolRegistrar {
  register(server: McpServer, subject: CapabilitySubject): void;
}

export const MCP_TOOL_REGISTRARS = Symbol('MCP_TOOL_REGISTRARS');
