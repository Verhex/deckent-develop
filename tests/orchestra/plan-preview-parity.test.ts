import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { CapabilityVector } from '../../src/core/routing/capability-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../src/core/routing/config.js';
import { JOURNAL_V3_DIR } from '../../src/core/routing/journal.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';
import type {
  BrainContext,
  ResolvedConfig,
  Sprint,
  SprintSizeRecommendation,
  Task,
} from '../../src/core/types.js';

const plannedSprint = (): Sprint => ({
  id: 'sprint-parity',
  number: 677,
  status: SprintStatus.PLANNING,
  phase: SprintPhase.PLAN,
  tasks: [task('677-002')],
  workers: ['w-677-002'],
});

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(async () => plannedSprint()),
}));

import { bindExecutionWriteScopePolicy } from '../../src/core/execution-write-scope-policy.js';
import { generatePlanPreview } from '../../src/orchestra/plan-preview-service.js';
import { routeTasksV3ForPlan } from '../../src/orchestra/routing-plan-adapter.js';
import { planRunFlow } from '../../src/orchestra/run-flow-plan-service.js';

const roots: string[] = [];
const recommendation: SprintSizeRecommendation = {
  size: 'full',
  maxWorkers: 1,
  modelConstraint: null,
  reason: 'parity fixture',
};

function task(id: string): Task {
  return {
    id,
    title: 'Preview parity',
    description: 'Keep CLI and MCP planning projections identical.',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'parity fixture',
    scope: {
      directories: ['src'],
      filesRead: [],
      filesWrite: ['src/a.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'Projections match.',
      noGoCriteria: 'Projections differ.',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-parity',
    createdAt: '2026-08-25T00:00:00.000Z',
  } as Task;
}

function fixture(): {
  root: string;
  config: ResolvedConfig;
  context: BrainContext;
} {
  const root = mkdtempSync(join(tmpdir(), 'deckent-preview-parity-'));
  roots.push(root);
  const directives = '# Preview parity\n\nKeep both planning surfaces aligned.';
  writeFileSync(join(root, 'DIRECTIVES.md'), directives, 'utf8');
  const config = {
    mode: 'performance',
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-sonnet-5',
      default_model: 'claude-sonnet-5',
      haiku_allowed: true,
      brain_planning: 'structured',
    },
    modes: {},
    language: 'en',
    projectName: 'preview-parity',
    projectRoot: root,
    version: '1.0.0',
  } as ResolvedConfig;
  writeFileSync(join(root, 'config.json'), JSON.stringify(config), 'utf8');
  return {
    root,
    config,
    context: {
      directives,
      memory: '',
      retro: '',
      debt: [],
      patterns: '',
      decisions: '',
      existingTasks: [],
      projectState: { gitStatus: '', fileTree: [] },
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('plan preview parity', () => {
  it('matches digest context and task projection across preview and durable paths', async () => {
    const { root, config, context } = fixture();
    const rawPolicy = { mode: 'closed-allowlist' as const, filesWrite: ['src/a.ts'] };
    const boundPolicy = bindExecutionWriteScopePolicy(rawPolicy, ['src/a.ts'], false);
    const preview = await generatePlanPreview(root, config, context, recommendation, {
      mode: 'structured',
      writeScopePolicy: boundPolicy,
    });
    const actor = { id: 'parity-owner' };
    const durable = await planRunFlow({
      projectRoot: root,
      config,
      recommendation,
      proposal: {
        flowId: 'flow-parity',
        tenant: 'local',
        project: 'preview-parity',
        actor,
        origin: 'cli',
        revision: 1,
        intentSummary: 'Preview parity',
      },
      lineage: {
        tenantId: 'local',
        actor,
        origin: 'cli',
        correlationId: 'flow-parity',
        idempotencyKey: 'plan:flow-parity:r1',
        sourceRef: 'DIRECTIVES.md',
      },
      source: { sourceKind: 'directives', brainContext: context },
      previewOptions: { mode: 'structured', writeScopePolicy: rawPolicy },
      scopeEvidence: { status: 'available', trackedFiles: ['src/a.ts'] },
    });

    expect(durable.preview.planDigestContext).toEqual(preview.planDigestContext);
    expect(durable.sprint.tasks).toEqual(preview.sprint.tasks);
  });

  it('journals the same single catalog key-set for both routing surfaces', async () => {
    const { root } = fixture();
    const capabilities: CapabilityVector = {
      capabilitiesVersion: 3,
      content: {
        workTypes: [{ type: 'build', proficiency: 'primary' }],
        expertise: [],
        personaSlices: ['implementation', 'default'],
      },
      positional: {
        domains: [{ id: '*', proficiency: 'primary' }],
        surfaces: [],
        writeAuthority: true,
        role: 'implementer',
        deliverables: ['code-src'],
      },
      numerical: { costTier: 'standard', maxParallel: null },
    };
    const agent = {
      id: 'parity-builder',
      source: 'user',
      capabilities,
    } as AgentDefinition;
    const pools = { agents: new Map([[agent.id, agent]]), skills: new Map() };

    await routeTasksV3ForPlan(
      [task('cli-preview')],
      root,
      DEFAULT_ROUTING_V3_CONFIG,
      { sprintId: 'cli-preview', pools },
    );
    await routeTasksV3ForPlan(
      [task('mcp-preview')],
      root,
      DEFAULT_ROUTING_V3_CONFIG,
      { sprintId: 'mcp-preview', pools },
    );

    const catalogKeys = (sprintId: string): string[] => {
      const row = JSON.parse(
        readFileSync(join(root, JOURNAL_V3_DIR, `${sprintId}.jsonl`), 'utf8').trim(),
      ) as { catalog: Record<string, unknown> };
      return Object.keys(row.catalog).sort();
    };
    expect(catalogKeys('mcp-preview')).toEqual(catalogKeys('cli-preview'));
    expect(catalogKeys('cli-preview')).toEqual(['parity-builder']);
  });
});
