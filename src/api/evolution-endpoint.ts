// ─── Evolution API Endpoints ─────────────────────────────────────────────────
// Read-only GET endpoints for F5 evolution data: genealogy, retirement, prompt-metrics.
import type { ServerResponse } from 'node:http';
import { AgentGenealogy } from '../agents/agent-genealogy.js';
import { AgentRetirement } from '../agents/agent-retirement.js';
import { PromptMetrics, PromptABTester } from '../agents/prompt-analytics.js';
import { PromptVersionManager } from '../agents/prompt-version.js';
import { AgentPoolManager } from '../core/agent-pool.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/**
 * Handle /api/evolution/* routes. Returns true if the route was handled.
 */
export function registerEvolutionRoutes(
  url: string,
  res: ServerResponse,
  projectRoot: string,
): boolean {
  // GET /api/evolution/genealogy
  if (url === '/api/evolution/genealogy') {
    const genealogy = new AgentGenealogy(projectRoot);
    const tree = genealogy.buildFamilyTree();
    sendJson(res, tree);
    return true;
  }

  // GET /api/evolution/retirement
  if (url === '/api/evolution/retirement') {
    const retirement = new AgentRetirement(projectRoot);
    const retired = retirement.listRetired();
    sendJson(res, retired);
    return true;
  }

  // GET /api/evolution/prompt-metrics
  if (url === '/api/evolution/prompt-metrics') {
    const agentPool = new AgentPoolManager(projectRoot);
    const versionMgr = new PromptVersionManager(projectRoot);
    const abTester = new PromptABTester(projectRoot);
    const metrics = new PromptMetrics();

    const agents = agentPool.listEnabled();
    const reports = agents.map((agent) => {
      const versions = versionMgr.listVersions(agent.id);
      const experiment = abTester.getActiveExperiment(agent.id) ?? undefined;
      return metrics.collectMetrics(agent.id, versions, experiment);
    });

    sendJson(res, reports);
    return true;
  }

  return false;
}
