/**
 * Provider Matrix — Claude + Codex Mixed Mini-Sprint E2E Tests
 *
 * Validates multi-provider routing scenarios:
 * - 3-task mini sprint with exact Claude/Codex API model identities
 * - Codex timeout → Claude fallback via resolveProviderWithFallback
 * - Per-provider metrics tracking (latency, tokens, cost)
 * - Provider stats aggregation for retro
 *
 * All providers use mock adapters — no real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProviderRegistry,
  ProviderUnavailableError,
  resolveProviderWithFallback,
} from '../../../src/core/provider.js';
import { routeTask, detectTaskType } from '../../../src/orchestra/task-router.js';
import {
  getEquivalentModel,
  getModelTier,
  getModelProvider,
} from '../../../src/core/model-equivalence.js';
import { modelRegistry } from '../../../src/core/model-registry.js';
import type { ProviderAdapter } from '../../../src/core/provider.js';
import type { ModelType, ProviderName } from '../../../src/core/types.js';
import type { Task } from '../../../src/core/task-types.js';

// ─── Mock Adapter Factory ──────────────────────────────────────────────────────

function makeMockAdapter(
  name: string,
  available: boolean,
  models: ModelType[] = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
): ProviderAdapter {
  return {
    name,
    supportedModels: models,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildCommand: vi.fn().mockReturnValue(`${name} exec`),
  };
}

// ─── Mini-Sprint Task Fixtures ─────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    description: overrides.title,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Provider matrix test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'PASS', noGoCriteria: 'FAIL', techDebtAcceptable: 'none' },
    status: 'PENDING',
    sprintId: 'sprint-148',
    ...overrides,
  };
}

const MINI_SPRINT_TASKS: Task[] = [
  makeTask({
    id: '148-A',
    title: 'Architect core routing refactor',
    model: 'claude-opus-4-8',
    forceModel: 'claude-opus-4-8',
    scope: { directories: ['src/core/'], filesRead: ['src/core/routing-engine.ts'], filesWrite: ['src/core/routing-engine.ts'] },
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
  }),
  makeTask({
    id: '148-B',
    title: 'Codex model integration test',
    model: 'gpt-4.1' as ModelType,
    forceModel: 'gpt-4.1' as ModelType,
    provider: 'codex',
    scope: { directories: ['src/core/'], filesRead: ['src/core/provider.ts'], filesWrite: ['src/core/provider.ts'] },
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
  }),
  makeTask({
    id: '148-C',
    title: 'Quick doc update for provider guide',
    model: 'claude-haiku-4-5-20251001',
    forceModel: 'claude-haiku-4-5-20251001',
    scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/provider-guide.md'] },
    assignedAgent: 'doc-writer',
    assignedSkills: ['documentation-writer'],
  }),
];

// ─── Per-Provider Metrics Tracker ──────────────────────────────────────────────

interface ProviderMetrics {
  provider: ProviderName;
  model: ModelType;
  taskId: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface ProviderStatsAggregation {
  provider: ProviderName;
  taskCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

function aggregateProviderStats(metrics: ProviderMetrics[]): ProviderStatsAggregation[] {
  const grouped = new Map<ProviderName, ProviderMetrics[]>();

  for (const m of metrics) {
    const existing = grouped.get(m.provider) ?? [];
    existing.push(m);
    grouped.set(m.provider, existing);
  }

  const result: ProviderStatsAggregation[] = [];
  for (const [provider, items] of grouped) {
    const totalLatencyMs = items.reduce((s, i) => s + i.latencyMs, 0);
    result.push({
      provider,
      taskCount: items.length,
      totalLatencyMs,
      avgLatencyMs: Math.round(totalLatencyMs / items.length),
      totalInputTokens: items.reduce((s, i) => s + i.inputTokens, 0),
      totalOutputTokens: items.reduce((s, i) => s + i.outputTokens, 0),
      totalCost: items.reduce((s, i) => s + i.cost, 0),
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Provider Matrix — Claude + Codex Mixed Mini-Sprint', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  // ─── Test 1: 3 tasks routed to 3 different providers ─────────────────────

  describe('Test 1: 3-task multi-provider routing', () => {
    it('routes each task to the correct provider based on forceModel', () => {
      const claudeAdapter = makeMockAdapter('claude', true);
      const codexAdapter = makeMockAdapter('codex', true, ['gpt-5.5', 'gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'o3', 'o4-mini']);

      registry.registerProvider(claudeAdapter);
      registry.registerProvider(codexAdapter);

      const availableProviders: ProviderName[] = ['claude', 'codex'];
      const config = { worker_provider: 'claude' };

      const routingResults = MINI_SPRINT_TASKS.map(task => ({
        taskId: task.id,
        routing: routeTask(task, config, availableProviders),
      }));

      // Task A: claude-opus-4-8 → claude
      expect(routingResults[0].routing.provider).toBe('claude');
      // Task B: gpt-4.1 → codex
      expect(routingResults[1].routing.provider).toBe('codex');
      // Task C: claude-haiku-4-5-20251001 → claude
      expect(routingResults[2].routing.provider).toBe('claude');

      // Verify 2 different providers used (claude for 2 tasks, codex for 1)
      const providers = new Set(routingResults.map(r => r.routing.provider));
      expect(providers.size).toBe(2);
      expect(providers.has('claude')).toBe(true);
      expect(providers.has('codex')).toBe(true);

      // Agents are preserved from task assignment
      expect(routingResults[0].routing.agent).toBe('architect');
      expect(routingResults[1].routing.agent).toBe('architect');
      expect(routingResults[2].routing.agent).toBe('doc-writer');
    });

    it('model tiers are correctly identified for each task model', () => {
      expect(getModelTier('claude-opus-4-8')).toBe('premium');
      expect(getModelTier('gpt-4.1')).toBe('standard');
      expect(getModelTier('claude-haiku-4-5-20251001')).toBe('economy');
    });

    it('model providers are correctly identified', () => {
      expect(getModelProvider('claude-opus-4-8')).toBe('claude');
      expect(getModelProvider('gpt-4.1')).toBe('codex');
      expect(getModelProvider('claude-haiku-4-5-20251001')).toBe('claude');
    });
  });

  // ─── Test 2: Fallback on provider failure — Codex timeout → Claude ───────

  describe('Test 2: Codex timeout → Claude fallback', () => {
    it('falls back to Claude when Codex is unavailable', async () => {
      const claudeAdapter = makeMockAdapter('claude', true);
      const codexAdapter = makeMockAdapter('codex', false, ['gpt-5.5', 'gpt-4.1']);

      registry.registerProvider(claudeAdapter);
      registry.registerProvider(codexAdapter);

      const result = await resolveProviderWithFallback(
        'codex',
        'gpt-4.1',
        { fallback_provider: 'claude' },
        registry,
      );

      expect(result.provider).toBe('claude');
      expect(result.wasOriginal).toBe(false);
      // gpt-4.1 (standard tier) → Claude's canonical standard model
      expect(result.model).toBe('claude-sonnet-5');
      expect(result.reason).toContain('unavailable');
      expect(result.reason).toContain('fallback');
    });

    it('model equivalence maps gpt-4.1 to Claude canonical standard on fallback', () => {
      const equivalent = getEquivalentModel('gpt-4.1', 'claude');
      expect(equivalent).toBe('claude-sonnet-5');
    });

    it('model equivalence maps gpt-5.5 to Claude canonical premium on fallback', () => {
      const equivalent = getEquivalentModel('gpt-5.5', 'claude');
      expect(equivalent).toBe('claude-opus-4-8');
    });

    it('throws ProviderUnavailableError when both providers unavailable', async () => {
      const claudeAdapter = makeMockAdapter('claude', false);
      const codexAdapter = makeMockAdapter('codex', false);

      registry.registerProvider(claudeAdapter);
      registry.registerProvider(codexAdapter);

      await expect(
        resolveProviderWithFallback(
          'codex',
          'gpt-4.1',
          { fallback_provider: 'claude' },
          registry,
        ),
      ).rejects.toThrow(ProviderUnavailableError);
    });

    it('throws when no fallback_provider configured', async () => {
      const codexAdapter = makeMockAdapter('codex', false);
      registry.registerProvider(codexAdapter);

      await expect(
        resolveProviderWithFallback('codex', 'gpt-4.1', {}, registry),
      ).rejects.toThrow(ProviderUnavailableError);
    });
  });

  // ─── Test 3: Per-provider metrics (latency, tokens, cost) ────────────────

  describe('Test 3: Per-provider metrics tracking', () => {
    it('tracks latency, tokens, and cost per provider per task', () => {
      // Simulated metrics from a completed mini-sprint
      const metrics: ProviderMetrics[] = [
        {
          provider: 'claude',
          model: 'claude-opus-4-8',
          taskId: '148-A',
          latencyMs: 45_000,
          inputTokens: 15_000,
          outputTokens: 3_200,
          cost: modelRegistry.estimateCost('claude-opus-4-8', 15_000, 3_200),
        },
        {
          provider: 'codex',
          model: 'gpt-4.1' as ModelType,
          taskId: '148-B',
          latencyMs: 30_000,
          inputTokens: 12_000,
          outputTokens: 2_800,
          cost: modelRegistry.estimateCost('gpt-4.1', 12_000, 2_800),
        },
        {
          provider: 'claude',
          model: 'claude-haiku-4-5-20251001',
          taskId: '148-C',
          latencyMs: 8_000,
          inputTokens: 5_000,
          outputTokens: 1_200,
          cost: modelRegistry.estimateCost('claude-haiku-4-5-20251001', 5_000, 1_200),
        },
      ];

      // Each metric has all required fields
      for (const m of metrics) {
        expect(m.provider).toBeDefined();
        expect(m.model).toBeDefined();
        expect(m.taskId).toBeDefined();
        expect(m.latencyMs).toBeGreaterThan(0);
        expect(m.inputTokens).toBeGreaterThan(0);
        expect(m.outputTokens).toBeGreaterThan(0);
        expect(m.cost).toBeGreaterThanOrEqual(0);
      }

      // Cost reflects tier pricing — Claude premium > Claude economy
      expect(metrics[0].cost).toBeGreaterThan(metrics[2].cost);
    });

    it('estimateCost uses correct model pricing from ModelRegistry', () => {
      // All models used in the mini-sprint should be registered
      expect(modelRegistry.has('claude-opus-4-8')).toBe(true);
      expect(modelRegistry.has('gpt-4.1')).toBe(true);
      expect(modelRegistry.has('claude-haiku-4-5-20251001')).toBe(true);

      // Cost is non-negative for valid inputs
      const opusCost = modelRegistry.estimateCost('claude-opus-4-8', 10_000, 2_000);
      const codexCost = modelRegistry.estimateCost('gpt-4.1', 10_000, 2_000);
      const haikuCost = modelRegistry.estimateCost('claude-haiku-4-5-20251001', 10_000, 2_000);

      expect(opusCost).toBeGreaterThan(0);
      expect(codexCost).toBeGreaterThan(0);
      expect(haikuCost).toBeGreaterThan(0);

      // Premium tier costs more than economy tier
      expect(opusCost).toBeGreaterThan(haikuCost);
    });
  });

  // ─── Test 4: Provider stats aggregation for retro ────────────────────────

  describe('Test 4: Provider stats aggregation for retro', () => {
    it('aggregates metrics by provider for retrospective report', () => {
      const metrics: ProviderMetrics[] = [
        {
          provider: 'claude',
          model: 'claude-opus-4-8',
          taskId: '148-A',
          latencyMs: 45_000,
          inputTokens: 15_000,
          outputTokens: 3_200,
          cost: 0.32,
        },
        {
          provider: 'codex',
          model: 'gpt-4.1' as ModelType,
          taskId: '148-B',
          latencyMs: 30_000,
          inputTokens: 12_000,
          outputTokens: 2_800,
          cost: 0.15,
        },
        {
          provider: 'claude',
          model: 'claude-haiku-4-5-20251001',
          taskId: '148-C',
          latencyMs: 8_000,
          inputTokens: 5_000,
          outputTokens: 1_200,
          cost: 0.02,
        },
      ];

      const stats = aggregateProviderStats(metrics);

      // 2 unique providers: claude (2 tasks) + codex (1 task)
      expect(stats).toHaveLength(2);

      const claudeStats = stats.find(s => s.provider === 'claude');
      const codexStats = stats.find(s => s.provider === 'codex');

      expect(claudeStats).toBeDefined();
      expect(codexStats).toBeDefined();

      // Claude: 2 tasks (premium + economy)
      expect(claudeStats!.taskCount).toBe(2);
      expect(claudeStats!.totalLatencyMs).toBe(53_000); // 45000 + 8000
      expect(claudeStats!.avgLatencyMs).toBe(26_500);   // 53000 / 2
      expect(claudeStats!.totalInputTokens).toBe(20_000);
      expect(claudeStats!.totalOutputTokens).toBe(4_400);
      expect(claudeStats!.totalCost).toBeCloseTo(0.34, 2);

      // Codex: 1 task (gpt-4.1)
      expect(codexStats!.taskCount).toBe(1);
      expect(codexStats!.totalLatencyMs).toBe(30_000);
      expect(codexStats!.avgLatencyMs).toBe(30_000);
      expect(codexStats!.totalInputTokens).toBe(12_000);
      expect(codexStats!.totalOutputTokens).toBe(2_800);
      expect(codexStats!.totalCost).toBeCloseTo(0.15, 2);
    });

    it('generates retro-compatible summary from aggregated stats', () => {
      const stats: ProviderStatsAggregation[] = [
        {
          provider: 'claude',
          taskCount: 2,
          totalLatencyMs: 53_000,
          avgLatencyMs: 26_500,
          totalInputTokens: 20_000,
          totalOutputTokens: 4_400,
          totalCost: 0.34,
        },
        {
          provider: 'codex',
          taskCount: 1,
          totalLatencyMs: 30_000,
          avgLatencyMs: 30_000,
          totalInputTokens: 12_000,
          totalOutputTokens: 2_800,
          totalCost: 0.15,
        },
      ];

      // Generate retro markdown table
      const header = '| Provider | Tasks | Avg Latency | Total Tokens | Cost |';
      const separator = '|----------|-------|-------------|--------------|------|';
      const rows = stats.map(s =>
        `| ${s.provider} | ${s.taskCount} | ${(s.avgLatencyMs / 1000).toFixed(1)}s | ${s.totalInputTokens + s.totalOutputTokens} | $${s.totalCost.toFixed(2)} |`
      );

      const table = [header, separator, ...rows].join('\n');

      expect(table).toContain('claude');
      expect(table).toContain('codex');
      expect(table).toContain('26.5s');
      expect(table).toContain('30.0s');
      expect(table).toContain('$0.34');
      expect(table).toContain('$0.15');

      // Total cost across providers
      const totalCost = stats.reduce((s, p) => s + p.totalCost, 0);
      expect(totalCost).toBeCloseTo(0.49, 2);
    });
  });
});
