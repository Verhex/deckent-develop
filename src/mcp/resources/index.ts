import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDashboardResource } from './dashboard.js';
import { registerDirectivesResource } from './directives.js';
import { registerMemoryResource } from './memory.js';
import { registerDebtResource } from './debt.js';
import { registerConfigResource } from './config.js';
import { registerRetroResource } from './retro.js';
import { registerTasksResource } from './tasks.js';
import { registerAgentsResource } from './agents.js';

export function registerResources(server: McpServer): void {
  registerDashboardResource(server);
  registerDirectivesResource(server);
  registerMemoryResource(server);
  registerDebtResource(server);
  registerConfigResource(server);
  registerRetroResource(server);
  registerTasksResource(server);
  registerAgentsResource(server);
}
