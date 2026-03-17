import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runDoctorChecks } from '../../cli/commands/doctor.js';

export function registerDoctorTool(server: McpServer): void {
  server.registerTool(
    'deckent_doctor',
    {
      title: 'Health Check',
      description: 'Run Deckent health checks: Node.js, git, tmux, Claude CLI, workspace, brain budget, debt, locks.',
    },
    async () => {
      const root = process.cwd();
      const result = runDoctorChecks(root);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result),
        }],
      };
    },
  );
}
