import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('production provider-routing boundary', () => {
  it('threads durable context and parks routing failures as a resumable HOLD', async () => {
    const source = await readFile('src/orchestra/sprint-controller.ts', 'utf-8');
    const start = source.indexOf('// Phase 1.5: Route tasks to providers');
    const end = source.indexOf('try { updateLastSprintId', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const boundary = source.slice(start, end);
    expect(boundary).toContain('{ projectRoot, sprintId: sprint.id }');
    expect(boundary).toContain('opts?.exactPlanAuthority');
    expect(boundary).toContain('BRAIN→AUDITOR:PROVIDER_ROUTING_HOLD');
    expect(boundary).toContain("pauseSprint(projectRoot, sprint, routingFailure, 'provider-routing-hold')");
    expect(boundary).toContain("emitSprintEvent('SPRINT_PAUSED'");
    expect(boundary).toContain('releaseSprintLock(projectRoot)');
    expect(boundary).toContain('clearActiveSprint()');
    expect(boundary).not.toContain('clearSprintState(projectRoot)');
    expect(boundary).toContain('throw e');
    expect(boundary).not.toMatch(/catch \(e\) \{ debugLog\('runSprint:routeSprintTasks'/);
  });

  it('fails plan admission closed when routing or its prompt gate throws', async () => {
    const source = await readFile('src/orchestra/sprint-planner.ts', 'utf-8');
    const start = source.indexOf('// ─── Routing Engine v3:');
    const end = source.indexOf('// Owner-policy budget snapshot:', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const boundary = source.slice(start, end);
    expect(boundary).toContain('Routing/prompt admission failed closed');
    expect(boundary).toContain('if (poolErr instanceof BrainError) throw poolErr');
    expect(boundary).toContain('ROUTING-V3 admission unavailable');
    expect(boundary).not.toContain('V2 routing pool loading failed');
  });
});
