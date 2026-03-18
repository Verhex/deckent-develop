import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInitTool } from './init.js';
import { registerSetDirectivesTool } from './directives.js';
import { registerPlanTool } from './plan.js';
import { registerStartTool } from './start.js';
import { registerStatusTool } from './status.js';
import { registerDoctorTool } from './doctor.js';
import { registerRetroTool } from './retro.js';
import { registerHistoryTool } from './history.js';
import { registerAnalyzeTool } from './analyze.js';
import { registerSyncTool } from './sync.js';

export function registerTools(server: McpServer): void {
  registerInitTool(server);
  registerSetDirectivesTool(server);
  registerPlanTool(server);
  registerStartTool(server);
  registerStatusTool(server);
  registerDoctorTool(server);
  registerRetroTool(server);
  registerHistoryTool(server);
  registerAnalyzeTool(server);
  registerSyncTool(server);
}
