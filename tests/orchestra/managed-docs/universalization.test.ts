// ─── Managed Docs Universalization Tests ─────────────────────────────────
// Tests for Sprint 131 features:
//   A) Pattern i18n — non-English section titles match built-in generators
//   B) Template engine — user-defined templates with {{placeholder}} substitution
//   C) Plugin loader — JSON-declarative custom generators from .deckent/generators/
//   D) Cache — unchanged docs are skipped on repeat runs

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findGenerator } from '../../../src/orchestra/managed-docs/content-generators.js';
import { renderTemplate, resolvePath, buildTemplateScope } from '../../../src/orchestra/managed-docs/template-renderer.js';
import { loadUserGeneratorsSync } from '../../../src/orchestra/managed-docs/plugin-loader.js';
import { contentHash, readDocCache, writeDocCache, clearDocCache } from '../../../src/orchestra/managed-docs/doc-cache.js';
import { runManagedDocUpdates } from '../../../src/orchestra/managed-docs/managed-doc-runner.js';
import { saveDocsConfig } from '../../../src/orchestra/managed-docs/docs-config.js';
import { TaskEvaluation } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../../src/core/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────

let TEST_ROOT: string;

beforeEach(() => {
  TEST_ROOT = join(tmpdir(), `deckent-universalization-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(TEST_ROOT, { recursive: true });
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
});

afterEach(() => {
  try { rmSync(TEST_ROOT, { recursive: true, force: true }); } catch { /* non-fatal */ }
});

function makeCtx(): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 3, completedTasks: 2, techDebtTasks: 1, noGoTasks: 0,
    durationMs: 120000, coveragePercent: 87.5, noGoRate: 0,
    newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
    boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
  };
  const sprint = { id: 'sprint-042', number: 42, tasks: [] } as unknown as Sprint;
  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('042-001', TaskEvaluation.DONE);
  evaluations.set('042-002', TaskEvaluation.GO_WITH_TECH_DEBT);
  return {
    projectRoot: TEST_ROOT,
    sprintResult: { sprint, evaluations, metrics },
    config: { language: 'tr', auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

// ─── A) Pattern i18n ──────────────────────────────────────────────────────

describe('Pattern i18n — multi-language section titles', () => {
  it('matches Turkish "Modüller" to module-map generator', () => {
    const gen = findGenerator('Modüller');
    expect(gen).not.toBeNull();
    expect(gen?.id).toBe('module-map');
  });

  it('matches Turkish "Bağımlılıklar" to dependencies generator', () => {
    const gen = findGenerator('Bağımlılıklar');
    expect(gen).not.toBeNull();
    expect(gen?.id).toBe('dependencies');
  });

  it('matches Turkish "Sprint Metrikleri" to sprint-metrics generator', () => {
    const gen = findGenerator('Sprint Metrikleri');
    expect(gen).not.toBeNull();
    expect(gen?.id).toBe('sprint-metrics');
  });

  it('matches German "Abhängigkeiten" to dependencies generator', () => {
    const gen = findGenerator('Abhängigkeiten');
    expect(gen).not.toBeNull();
    expect(gen?.id).toBe('dependencies');
  });

  it('still matches English "Module Map" after i18n changes', () => {
    const gen = findGenerator('Module Map');
    expect(gen).not.toBeNull();
    expect(gen?.id).toBe('module-map');
  });

  it('returns null for unmatchable titles', () => {
    expect(findGenerator('Zzzz Unknown Zzzz')).toBeNull();
  });
});

// ─── B) Template Engine ───────────────────────────────────────────────────

describe('Template engine — {{path}} placeholder substitution', () => {
  it('resolves nested paths from sprint result', () => {
    const ctx = makeCtx();
    const out = renderTemplate('Sprint {{sprint.id}} at {{metrics.coveragePercent}}%', ctx);
    expect(out).toBe('Sprint sprint-042 at 87.5%');
  });

  it('resolves dynamic project stats (providerCount, providerList)', () => {
    const ctx = makeCtx();
    const out = renderTemplate('{{providerCount}} providers: {{providerList}}', ctx);
    expect(out).toMatch(/^\d+ providers: /);
    expect(out).toContain('Claude');
  });

  it('resolves language from config', () => {
    const ctx = makeCtx();
    expect(renderTemplate('{{language}}', ctx)).toBe('tr');
  });

  it('returns empty string for unresolved placeholders', () => {
    const ctx = makeCtx();
    expect(renderTemplate('[{{nonexistent.deep.path}}]', ctx)).toBe('[]');
  });

  it('resolvePath walks nested objects and Maps', () => {
    const scope = { a: { b: { c: 42 } }, m: new Map([['k', 'v']]) };
    expect(resolvePath(scope, 'a.b.c')).toBe(42);
    expect(resolvePath(scope, 'm.k')).toBe('v');
    expect(resolvePath(scope, 'a.missing')).toBeUndefined();
  });

  it('buildTemplateScope includes date and datetime', () => {
    const scope = buildTemplateScope(makeCtx());
    expect(scope.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(scope.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── C) Plugin Loader ─────────────────────────────────────────────────────

describe('Plugin loader — .deckent/generators/*.json', () => {
  it('returns empty array when no generators dir', () => {
    expect(loadUserGeneratorsSync(TEST_ROOT)).toEqual([]);
  });

  it('loads a JSON generator with template', () => {
    const genDir = join(TEST_ROOT, '.deckent', 'generators');
    mkdirSync(genDir, { recursive: true });
    writeFileSync(join(genDir, 'kpi.json'), JSON.stringify({
      id: 'kpi',
      patterns: ['KPI', 'kpis'],
      template: 'Coverage: {{metrics.coveragePercent}}%',
    }));
    const gens = loadUserGeneratorsSync(TEST_ROOT);
    expect(gens).toHaveLength(1);
    expect(gens[0]?.id).toBe('kpi');
    expect(gens[0]?.generate(makeCtx())).toBe('Coverage: 87.5%');
  });

  it('skips JSON files missing a template', () => {
    const genDir = join(TEST_ROOT, '.deckent', 'generators');
    mkdirSync(genDir, { recursive: true });
    writeFileSync(join(genDir, 'broken.json'), JSON.stringify({ id: 'broken', patterns: ['x'] }));
    expect(loadUserGeneratorsSync(TEST_ROOT)).toHaveLength(0);
  });

  it('user generators take precedence over built-ins via findGenerator', () => {
    const userGen = {
      id: 'custom-modules',
      patterns: ['modules'],
      generate: () => 'CUSTOM MODULE LIST',
    };
    const gen = findGenerator('Modules', [userGen]);
    expect(gen?.generate(makeCtx())).toBe('CUSTOM MODULE LIST');
  });
});

// ─── D) Doc Cache ─────────────────────────────────────────────────────────

describe('Doc cache — content hash + skip logic', () => {
  it('contentHash is stable for equal inputs', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });

  it('readDocCache returns empty object when no cache file', () => {
    expect(readDocCache(TEST_ROOT)).toEqual({});
  });

  it('writeDocCache + readDocCache round-trip', () => {
    const entry = { entryHash: 'abc', fileHash: 'def', updatedAt: '2026-04-10T00:00:00Z' };
    writeDocCache(TEST_ROOT, { 'doc-1': entry });
    const result = readDocCache(TEST_ROOT);
    expect(result['doc-1']).toEqual(entry);
    // _meta is auto-inserted
    expect(result._meta).toBeDefined();
    expect((result._meta as any).adr).toBe('ADR-031');
  });

  it('clearDocCache empties the cache file doc entries', () => {
    writeDocCache(TEST_ROOT, { 'doc-1': { entryHash: 'a', fileHash: 'b', updatedAt: 'now' } });
    clearDocCache(TEST_ROOT);
    const result = readDocCache(TEST_ROOT);
    // Doc entries are cleared
    const docKeys = Object.keys(result).filter(k => k !== '_meta');
    expect(docKeys).toHaveLength(0);
  });

  it('second run with unchanged content skips via cache', () => {
    // Setup a managed doc with a trivial template
    const docPath = 'DOC.md';
    writeFileSync(join(TEST_ROOT, docPath), '# Doc\n\n## KPI\nold\n');
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{
        id: 'doc-md',
        path: docPath,
        templates: { 'KPI': 'Static content' },
      }],
    });

    // First run: should update
    const r1 = runManagedDocUpdates(makeCtx());
    expect(r1[0]?.updated).toBe(true);

    // Second run: content hasn't changed, should hit cache
    const r2 = runManagedDocUpdates(makeCtx());
    expect(r2[0]?.reason).toBe('cached_no_change');
  });
});

// ─── Integration — the original deney scenario ───────────────────────────

describe('Integration — alperen/deneme/doküman1.md scenario', () => {
  it('updates Turkish sections via built-in pattern matching', () => {
    const dirPath = join(TEST_ROOT, 'alperen', 'deneme');
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, 'doküman1.md'), [
      '# Doküman 1',
      '',
      '## Giriş',
      'Protected intro.',
      '',
      '## Modüller',
      'placeholder',
      '',
      '## Bağımlılıklar',
      'placeholder',
      '',
      '## Benim Notlarım',
      'Protected notes.',
    ].join('\n'));

    // Minimal package.json so Dependencies generator has something to emit
    writeFileSync(join(TEST_ROOT, 'package.json'), JSON.stringify({
      name: 'deney', version: '1.0.0',
      dependencies: { express: '^4.0.0' },
    }));

    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{
        id: 'dokuman1',
        path: 'alperen/deneme/doküman1.md',
        autoSections: ['Modüller', 'Bağımlılıklar'],
        protectedSections: ['Giriş', 'Benim Notlarım'],
      }],
    });

    const results = runManagedDocUpdates(makeCtx());
    expect(results[0]?.updated).toBe(true);

    const final = readFileSync(join(dirPath, 'doküman1.md'), 'utf-8');
    expect(final).toContain('Protected intro.');
    expect(final).toContain('Protected notes.');
    expect(final).toContain('express'); // Bağımlılıklar doldu
    // Modüller bölümü de bu kez Türkçe pattern sayesinde doldu
    expect(final).not.toMatch(/## Modüller\nplaceholder/);
  });
});
