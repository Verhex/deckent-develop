import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// 379-001 DOCS-NUM-TRUTH — pins README.md / README-TR.md / DECKENT.md against the
// live, code-derived counts named by the user-truth-audit as "GERÇEK" (real):
// 47 MCP tools · 20 built-in agents · 31 built-in skills · 14 models · 20 dashboard
// pages. Every count below is recomputed from source on each run — never a
// hardcoded pin — so this test does not itself go stale as the codebase grows.
//
// Agents/skills are counted from `src/core/builtins/{agents,skills}` (the full
// authored catalog every `deckent init` seeds), NOT `.deckent/{agents,skills}`
// (this repo's own dogfood-materialized subset, which currently lags by 3+3
// items pending a manifest.json/agent.json — see
// tests/core/builtins/catalog-sync-parity.test.ts). The user-truth-audit
// (docs/analysis/user-truth-audit-2026-07-06.md) explicitly names "builtins-sayımı"
// as the source of truth for these two counts.

const ROOT = join(import.meta.dirname, '..', '..');

function listFilesRecursive(dir: string, predicate: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'node_modules') continue;
      out.push(...listFilesRecursive(p, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function countRegistrations(dir: string, re: RegExp): number {
  let count = 0;
  for (const file of listFilesRecursive(dir, (n) => n.endsWith('.ts') && !n.endsWith('.d.ts') && n !== 'index.ts')) {
    count += readFileSync(file, 'utf-8').match(re)?.length ?? 0;
  }
  return count;
}

function countBuiltinDirs(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && d.name !== 'archive',
  ).length;
}

function countDashboardPages(dir: string): number {
  return readdirSync(dir).filter((n) => n.endsWith('.tsx') && !n.endsWith('.test.tsx')).length;
}

function countBuiltinModels(): number {
  const src = readFileSync(join(ROOT, 'src/core/model-registry.ts'), 'utf-8');
  const start = src.indexOf('export const BUILTIN_MODELS');
  const end = src.indexOf('] as const;', start);
  if (start === -1 || end === -1) throw new Error('BUILTIN_MODELS array not found in model-registry.ts');
  return (src.slice(start, end).match(/^\s*id:\s*'/gm) ?? []).length;
}

// Live counts, computed once for all assertions below.
const MCP_TOOLS = countRegistrations(join(ROOT, 'src/mcp/tools'), /server\.registerTool\(\s*['"][a-zA-Z0-9_-]+['"]/g);
const MCP_RESOURCES = countRegistrations(join(ROOT, 'src/mcp/resources'), /server\.registerResource\(\s*['"][a-zA-Z0-9_-]+['"]/g);
const BUILTIN_AGENTS = countBuiltinDirs(join(ROOT, 'src/core/builtins/agents'));
const BUILTIN_SKILLS = countBuiltinDirs(join(ROOT, 'src/core/builtins/skills'));
const BUILTIN_MODELS_COUNT = countBuiltinModels();
const DASHBOARD_PAGES = countDashboardPages(join(ROOT, 'src/dashboard/src/pages'));

// Sanity: these must match the numbers the task named as "GERÇEK" today. If a future
// commit changes one of these live counts, this assertion (not the doc-content
// assertions below) is the one that should be updated to match the new reality.
describe('live counts match the current known-true values', () => {
  it('47 MCP tools, 8 MCP resources', () => {
    expect(MCP_TOOLS).toBe(47);
    expect(MCP_RESOURCES).toBe(8);
  });

  it('20 built-in agents, 31 built-in skills (src/core/builtins)', () => {
    expect(BUILTIN_AGENTS).toBe(20);
    expect(BUILTIN_SKILLS).toBe(31);
  });

  it('14 built-in models', () => {
    expect(BUILTIN_MODELS_COUNT).toBe(14);
  });

  it('20 dashboard pages', () => {
    expect(DASHBOARD_PAGES).toBe(20);
  });
});

// Legacy stale values the user-truth-audit found scattered across the three docs.
// None of these must appear anywhere near a tool/agent/skill/model/page count again.
const STALE_TOOL_COUNTS = ['35 tools', '37 tools', '34 tool', '35 tool', '35 araç'];
const STALE_AGENT_COUNTS = ['15 built-in agent', '15 built-in agents'];
const STALE_SKILL_COUNTS = ['21 built-in skill', '21 built-in skills'];
const STALE_MODEL_COUNTS = ['13 models'];
const STALE_PAGE_COUNTS = ['16 pages', '16 sayfa'];

describe('README.md — number truth', () => {
  const content = readFileSync(join(ROOT, 'README.md'), 'utf-8');

  it('contains no legacy stale tool/agent/skill/page counts', () => {
    for (const stale of [...STALE_TOOL_COUNTS, ...STALE_AGENT_COUNTS, ...STALE_SKILL_COUNTS, ...STALE_PAGE_COUNTS]) {
      expect(content).not.toContain(stale);
    }
  });

  it(`reflects the live MCP tool count (${MCP_TOOLS})`, () => {
    expect(content).toContain(`${MCP_TOOLS} MCP tools`);
    expect(content).toContain(`${MCP_TOOLS} tools + ${MCP_RESOURCES} resources`);
  });

  it(`reflects the live built-in agent/skill counts (${BUILTIN_AGENTS}/${BUILTIN_SKILLS})`, () => {
    expect(content).toContain(`${BUILTIN_AGENTS} built-in agents`);
    expect(content).toContain(`${BUILTIN_SKILLS} built-in skills`);
  });

  it(`reflects the live dashboard page count (${DASHBOARD_PAGES})`, () => {
    expect(content).toContain(`${DASHBOARD_PAGES} pages`);
    expect(content).toContain(`${DASHBOARD_PAGES} dashboard pages`);
  });

  it('carries the run/sprint terminology bridge', () => {
    expect(content).toContain('run, formerly "sprint"');
  });
});

describe('README-TR.md — number truth', () => {
  const content = readFileSync(join(ROOT, 'README-TR.md'), 'utf-8');

  it('contains no legacy stale tool/page counts', () => {
    for (const stale of [...STALE_TOOL_COUNTS, ...STALE_PAGE_COUNTS]) {
      expect(content).not.toContain(stale);
    }
  });

  it(`reflects the live MCP tool count (${MCP_TOOLS})`, () => {
    expect(content).toContain(`${MCP_TOOLS} tool + ${MCP_RESOURCES} resource`);
  });

  it(`reflects the live built-in agent/skill counts (${BUILTIN_AGENTS}/${BUILTIN_SKILLS})`, () => {
    expect(content).toContain(`${BUILTIN_AGENTS} built-in agents`);
    expect(content).toContain(`${BUILTIN_SKILLS} built-in skills`);
  });

  it(`reflects the live dashboard page count (${DASHBOARD_PAGES})`, () => {
    expect(content).toContain(`${DASHBOARD_PAGES} sayfa`);
  });

  it('carries the run/sprint terminology bridge', () => {
    expect(content).toContain('run, eskiden "sprint"');
  });
});

describe('DECKENT.md — number truth', () => {
  const content = readFileSync(join(ROOT, 'DECKENT.md'), 'utf-8');

  it('contains no legacy stale tool/agent/skill/model counts', () => {
    for (const stale of [...STALE_TOOL_COUNTS, ...STALE_MODEL_COUNTS]) {
      expect(content).not.toContain(stale);
    }
    // "15 built-in agents" / "21 built-in skills" no longer appear as the summary
    // count (the detail-table headers below them are intentionally count-free —
    // see the "örnek" (sample) reword — so only the summary line is asserted here).
    expect(content).not.toContain('15 built-in agents + 21 built-in skills');
  });

  it(`reflects the live tool count (${MCP_TOOLS})`, () => {
    expect(content).toContain(`${MCP_TOOLS} araç`);
  });

  it(`reflects the live model count (${BUILTIN_MODELS_COUNT})`, () => {
    expect(content).toContain(`${BUILTIN_MODELS_COUNT} models`);
  });

  it(`reflects the live built-in agent/skill counts (${BUILTIN_AGENTS}/${BUILTIN_SKILLS})`, () => {
    expect(content).toContain(`${BUILTIN_AGENTS} built-in agents + ${BUILTIN_SKILLS} built-in skills`);
  });

  it('carries the run/sprint terminology bridge', () => {
    expect(content).toContain('run, eskiden "sprint"');
  });

  it('no longer inlines the internal pivot-note strategy block (moved to .analysis/)', () => {
    expect(content).not.toContain('Aktif Yön (2026-06-29 pivot');
    expect(content).toContain('.analysis/hermes-vs-deckent-direction-decisions.md');
  });
});
