import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDashboardResource } from './dashboard.js';
import { registerDirectivesResource } from './directives.js';
import { registerMemoryResource } from './memory.js';
import { registerDebtResource } from './debt.js';

export function registerResources(server: McpServer): void {
  registerDashboardResource(server);
  registerDirectivesResource(server);
  registerMemoryResource(server);
  registerDebtResource(server);
}
