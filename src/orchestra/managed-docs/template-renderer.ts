// ─── Template Renderer ───────────────────────────────────────────────────
// Resolves {{path.to.value}} placeholders in user-defined templates against
// a DocUpdateContext. Provides a lightweight alternative to built-in generators
// for users who want custom content without writing TypeScript.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentPoolManager } from '../../core/agent-pool.js';
import { SkillPoolManager } from '../../core/skill-pool.js';
import { modelRegistry } from '../../core/model-registry.js';
import { TaskEvaluation } from '../../core/types.js';
import type { DocUpdateContext } from '../doc-updaters/types.js';

// ─── Scope Building ──────────────────────────────────────────────────────

/**
 * Build a value-lookup scope for template resolution. Exposes sprint result,
 * config, metrics, and dynamic project stats (agent count, skill count, providers).
 */
export function buildTemplateScope(ctx: DocUpdateContext): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    projectRoot: ctx.projectRoot,
    sprintResult: ctx.sprintResult,
    sprint: ctx.sprintResult.sprint,
    metrics: ctx.sprintResult.metrics,
    config: ctx.config,
    language: ctx.config?.language ?? 'en',
    date: new Date().toISOString().split('T')[0],
    datetime: new Date().toISOString(),
  };

  // Dynamic project stats (non-fatal)
  try {
    const agentPool = new AgentPoolManager(ctx.projectRoot);
    const agents = agentPool.listAgents();
    scope.agentCount = agents.length;
    scope.agentCountBuiltin = agents.filter(a => a.source === 'builtin').length;
  } catch { /* non-fatal */ }

  try {
    const skillPool = new SkillPoolManager(ctx.projectRoot);
    scope.skillCount = skillPool.listSkills().length;
  } catch { /* non-fatal */ }

  try {
    const providers = modelRegistry.getAllProviders();
    scope.providers = providers;
    scope.providerCount = providers.length;
    scope.providerList = providers
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(', ');
  } catch { /* non-fatal */ }

  // Task counts by evaluation
  const evals = ctx.sprintResult.evaluations;
  let done = 0, techDebt = 0, noGo = 0;
  for (const ev of evals.values()) {
    if (ev === TaskEvaluation.DONE) done++;
    else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) techDebt++;
    else if (ev === TaskEvaluation.NO_GO) noGo++;
  }
  scope.taskCounts = { done, techDebt, noGo, total: evals.size };

  // Latest sprint ID from MemoryStore (V2: DB is single source of truth)
  if (ctx.store) {
    try {
      const sprintEntries = ctx.store.getByType('sprint');
      if (sprintEntries.length > 0) {
        const sorted = [...sprintEntries].sort((a, b) => a.sprint_num - b.sprint_num);
        scope.latestSprintId = sorted.at(-1)?.sprint_id ?? sorted.at(-1)?.id ?? null;
        scope.totalSprints = sprintEntries.length;
      }
    } catch { /* non-fatal */ }
  }

  // package.json version
  try {
    const pkgPath = join(ctx.projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      scope.version = pkg.version ?? 'unknown';
      scope.projectName = pkg.name ?? 'unknown';
    }
  } catch { /* non-fatal */ }

  return scope;
}

// ─── Path Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a dotted path (e.g., "metrics.coveragePercent") against a scope.
 * Supports nested objects and Map access. Returns undefined if any segment misses.
 */
export function resolvePath(scope: unknown, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split('.').map(s => s.trim()).filter(Boolean);
  let current: unknown = scope;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (current instanceof Map) {
      current = current.get(seg);
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

// ─── Template Rendering ──────────────────────────────────────────────────

/**
 * Render a template string by substituting {{path.to.value}} placeholders.
 * - Unresolved placeholders become empty string (non-fatal).
 * - Numbers, strings, booleans are rendered via String(value).
 * - Objects/arrays are JSON.stringified.
 * - Functions are called with no args and result is rendered.
 */
export function renderTemplate(template: string, ctx: DocUpdateContext): string {
  const scope = buildTemplateScope(ctx);
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawPath: string) => {
    const path = rawPath.trim();
    const value = resolvePath(scope, path);
    if (value === undefined || value === null) return '';
    if (typeof value === 'function') {
      try { return String((value as () => unknown)()); } catch { return ''; }
    }
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return ''; }
    }
    return String(value);
  });
}
