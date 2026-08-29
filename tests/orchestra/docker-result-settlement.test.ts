import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { CapabilityVector, SkillProfile } from '../../src/core/routing/capability-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../src/core/routing/config.js';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { createSkillDefinition } from '../../src/core/skill-types.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import { promptDeliveryReceiptPath } from '../../src/core/prompt-delivery-receipt.js';

import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  listPendingTaskResultSettlementAttempts,
  readTaskResultSettlementClosure,
  readTaskResultSettlement,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  closeDockerTaskResultSettlement,
  persistDockerTaskResultSettlement,
  reconcileDockerHostTerminalResultFile,
} from '../../src/orchestra/spawn-backend-docker.js';
import { collectCatalogStatsTerminalOutcomes } from '../../src/orchestra/sprint-finalizer.js';
import { routeTasksV3ForPlan } from '../../src/orchestra/routing-plan-adapter.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; tasks: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root, tasks };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('persistDockerTaskResultSettlement', () => {
  it('carries real route→persona/skill body→receipt identities into settlement and finalizer attribution', async () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-delivery-chain';
    const agentId = 'delivery-agent';
    const skillId = 'delivery-skill';
    const capabilities: CapabilityVector = {
      capabilitiesVersion: 3,
      content: {
        workTypes: [{ type: 'build', proficiency: 'primary' }],
        expertise: ['prompt-delivery'],
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
    const skillProfile: SkillProfile = {
      profileVersion: 3,
      workTypes: [{ type: 'build', proficiency: 'primary' }],
      domains: [{ id: '*', proficiency: 'primary' }],
      expertise: ['prompt-delivery'],
      deliverables: ['code-src'],
    };
    const agent = createAgentDefinition({
      id: agentId,
      name: 'Delivery Agent',
      source: 'user',
      capabilities,
    });
    const skill = createSkillDefinition({
      id: skillId,
      name: 'Delivery Skill',
      description: 'Canonical prompt delivery and settlement skill.',
      profile: skillProfile,
      manifestVersion: 2,
      triggers: ['prompt-delivery'],
    });
    const task: Task = {
      id: taskId,
      title: 'Wire canonical prompt delivery settlement',
      description: 'Implement the prompt delivery receipt consumer chain.',
      model: agent.preferredModel,
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'production-chain-test',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/prompt-delivery-receipt.ts'],
      },
      dependencies: [],
      goNogo: {
        goCriteria: 'Canonical delivery identity reaches settlement.',
        noGoCriteria: 'Worker claims override host delivery truth.',
        techDebtAcceptable: 'none',
      },
      status: TaskStatus.PENDING,
      sprintId: 'sprint-docker-delivery',
      createdAt: '2026-08-24T00:00:00.000Z',
    } as Task;

    const agentDir = join(root, '.deckent', 'agents', agentId);
    const skillDir = join(root, '.deckent', 'skills', skillId);
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(agentDir, 'PROMPT.md'), '# Delivery Agent\n\nCanonical persona bytes.\n', 'utf8');
    writeFileSync(join(skillDir, 'SKILL.md'), '# Delivery Skill\n\nCanonical skill bytes.\n', 'utf8');
    writeFileSync(join(skillDir, 'manifest.json'), `${JSON.stringify(skill, null, 2)}\n`, 'utf8');

    const routed = await routeTasksV3ForPlan(
      [task],
      root,
      { ...DEFAULT_ROUTING_V3_CONFIG, enabled: true },
      {
        journal: false,
        pools: {
          agents: new Map([[agentId, agent]]),
          skills: new Map([[skillId, skill]]),
        },
      },
    );
    expect(routed.routed).toEqual([taskId]);
    expect(task.assignedAgent).toBe(agentId);
    expect(task.assignedSkills).toEqual([skillId]);

    const persona = new AgentPoolManager(root).resolvePrompt(agentId);
    const skillBody = new SkillPoolManager(root).resolveBody(skillId);
    expect(persona.availability).toBe('prompt-file');
    expect(skillBody.ok).toBe(true);
    if (!skillBody.ok) return;
    const prompt = buildWorkerPrompt(task, persona.content, [{
      name: skillId,
      content: skillBody.entrypoint.content,
    }], root);
    expect(prompt).toContain('Canonical persona bytes.');
    expect(prompt).toContain('Canonical skill bytes.');
    expect(task.promptCompilePlanId).toMatch(/^prompt-compile-plan:sha256:[a-f0-9]{64}$/);

    writeFileSync(join(tasks, `task-${taskId}.json`), `${JSON.stringify(task, null, 2)}\n`, 'utf8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      agentId: 'worker-claim-agent',
      skillIds: ['worker-claim-skill'],
      selfAssessment: 'DONE',
      testsPassed: true,
      notes: 'worker claim must not own attribution',
    }), 'utf8');
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 0)).toBe(true);
    const settlement = readTaskResultSettlement(ref);
    expect(settlement?.result).toMatchObject({
      agentId,
      skillIds: [skillId],
      promptDeliveryAttribution: { state: 'CURRENT' },
    });
    const canonicalResult = settlement?.result as TaskResult;
    const outcomes = collectCatalogStatsTerminalOutcomes(
      root,
      [task],
      new Map([[taskId, TaskEvaluation.DONE]]),
      new Map([[taskId, canonicalResult]]),
    );
    expect(outcomes).toMatchObject([{
      taskId,
      agentId,
      skillIds: [],
      selectedSkillIds: [skillId],
      deliveredSkillIds: [skillId],
      skillAttributionState: 'EXPOSURE_ONLY',
      evaluation: TaskEvaluation.DONE,
    }]);
  });

  it('embeds the final result under the exact project/task/attempt authority', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-a';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'host final',
    }), 'utf-8');

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 137)).toBe(true);
    expect(readTaskResultSettlement(ref)).toMatchObject({
      exitCode: 137,
      result: { taskId, selfAssessment: 'NO_GO', notes: 'host final' },
    });

    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
    }), 'utf-8');
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({ selfAssessment: 'NO_GO' });
  });

  it('denies agent and skill credit when a fresh task receipt is malformed', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-malformed-delivery';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({
      id: taskId,
      promptCompilePlanId: `prompt-compile-plan:sha256:${'a'.repeat(64)}`,
      assignedAgent: 'assigned-agent',
      assignedSkills: ['assigned-skill'],
    }), 'utf8');
    writeFileSync(promptDeliveryReceiptPath(root, taskId), '{malformed', 'utf8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      agentId: 'worker-claim-agent',
      skillIds: ['worker-claim-skill'],
      selfAssessment: 'DONE',
      testsPassed: true,
    }), 'utf8');

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 0)).toBe(true);
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      skillIds: [],
      promptDeliveryAttribution: { state: 'HOLD', reason: 'malformed' },
    });
    expect(readTaskResultSettlement(ref)?.result).not.toHaveProperty('agentId');
  });

  it('does not invent authority for direct legacy backend calls and rejects cross-project refs', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-b';
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({ taskId, selfAssessment: 'DONE' }), 'utf-8');
    expect(persistDockerTaskResultSettlement(root, tasks, undefined, 0)).toBe(false);

    const ref = createTaskResultSettlementRef(root, taskId);
    const otherRoot = join(root, '..', 'other');
    mkdirSync(otherRoot, { recursive: true });
    expect(() => persistDockerTaskResultSettlement(otherRoot, tasks, ref, 0)).toThrow(/authority/);
  });

  it('closes the durable claim only after dispatch, settlement and lifecycle cleanup evidence', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-closed';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
    writeTaskResultSettlementDispatchAtomic(ref, 'f'.repeat(64));
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
    }), 'utf-8');

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 0)).toBe(true);
    expect(closeDockerTaskResultSettlement(ref, 'stopped-removed')).toBe(true);
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      state: 'closed',
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(listPendingTaskResultSettlementAttempts(root)).toEqual([]);
  });
});

describe('reconcileDockerHostTerminalResultFile', () => {
  const contract = {
    version: 1,
    kind: 'terminal-verdict',
    protocol: 'xverify-v1',
  } as const;
  const event = (seq: number, type: string, content: unknown): string => JSON.stringify({
    ts: '2026-07-22T00:00:00.000Z',
    seq,
    type,
    content,
  });

  it('promotes only an exact wrapper marker from assistant protocol and preserves evidence', () => {
    const { tasks } = fixture();
    const taskId = 'xverify-a';
    const resultPath = join(tasks, `task-${taskId}.result`);
    const logPath = join(tasks, `task-${taskId}.log`);
    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      markerType: 'EXIT_WITHOUT_RESULT',
      workPresent: false,
      diffStat: '',
      lastHbStatus: 'unknown',
      lastHbSequence: 0,
      exitCode: 0,
      tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
      providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
    }), 'utf-8');
    writeFileSync(logPath, [
      event(1, 'text', { type: 'user', message: { content: [{ type: 'text', text: 'VERDICT: REFUTED prompt example' }] } }),
      event(2, 'text', { type: 'assistant', message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED exact host evidence' }] } }),
      event(3, 'usage', { type: 'result', result: 'VERDICT: REFUTED copied envelope' }),
    ].join('\n'), 'utf-8');

    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBe(
      'VERDICT: CONFIRMED exact host evidence',
    );
    const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(result).toMatchObject({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
      exitCode: 0,
      tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
      providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
      hostTerminalProjection: {
        version: 1,
        protocol: 'xverify-v1',
        observedBy: 'host',
        sourceMarker: {
          type: 'EXIT_WITHOUT_RESULT',
          exitCode: 0,
          preTerminalHeartbeat: {
            status: 'unknown',
            sequence: 0,
          },
        },
      },
    });
    expect(result).not.toHaveProperty('markerType');
    expect(result).not.toHaveProperty('workPresent');
    expect(result).not.toHaveProperty('diffStat');
    expect(result).not.toHaveProperty('lastHbStatus');
    expect(result).not.toHaveProperty('lastHbSequence');
    expect(String(result['notes'])).toMatch(/VERDICT: CONFIRMED exact host evidence$/);
  });

  it('does not promote prompt echoes, incomplete protocol, or a genuine worker result', () => {
    const { tasks } = fixture();
    const taskId = 'xverify-b';
    const resultPath = join(tasks, `task-${taskId}.result`);
    const logPath = join(tasks, `task-${taskId}.log`);
    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      markerType: 'EXIT_WITHOUT_RESULT',
      exitCode: 0,
    }), 'utf-8');
    writeFileSync(logPath, event(1, 'text', {
      type: 'user',
      message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED prompt echo' }] },
    }), 'utf-8');
    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBeNull();

    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      markerType: 'EXIT_WITHOUT_RESULT',
      exitCode: 1,
    }), 'utf-8');
    writeFileSync(logPath, event(2, 'text', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED process still failed' }] },
    }), 'utf-8');
    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBeNull();

    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'genuine worker failure',
    }), 'utf-8');
    writeFileSync(logPath, event(2, 'text', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED should not override' }] },
    }), 'utf-8');
    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBeNull();
    expect(JSON.parse(readFileSync(resultPath, 'utf-8'))).toMatchObject({
      selfAssessment: 'NO_GO',
      notes: 'genuine worker failure',
    });
  });
});
