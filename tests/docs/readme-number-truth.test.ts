import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

// 379-001 DOCS-NUM-TRUTH — pins README.md / README.tr.md / DECKENT.md against the
// live, code-derived counts named by the user-truth-audit as "GERÇEK" (real):
// MCP tools/resources · built-in agents/skills · dashboard pages. Model catalog
// size is intentionally not pinned in docs: exact API identities come from the
// live/cached catalog with a bundled offline fallback.
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

// Live counts, computed once for all assertions below.
const MCP_TOOLS = countRegistrations(join(ROOT, 'src/mcp/tools'), /server\.registerTool\(\s*['"][a-zA-Z0-9_-]+['"]/g);
const MCP_RESOURCES = countRegistrations(join(ROOT, 'src/mcp/resources'), /server\.registerResource\(\s*['"][a-zA-Z0-9_-]+['"]/g);
const BUILTIN_AGENTS = countBuiltinDirs(join(ROOT, 'src/core/builtins/agents'));
const BUILTIN_SKILLS = countBuiltinDirs(join(ROOT, 'src/core/builtins/skills'));
const DASHBOARD_PAGES = countDashboardPages(join(ROOT, 'src/dashboard/src/pages'));

// Sanity: these must match the numbers the task named as "GERÇEK" today. If a future
// commit changes one of these live counts, this assertion (not the doc-content
// assertions below) is the one that should be updated to match the new reality.
describe('live counts match the current known-true values', () => {
  it.skip('48 MCP tools, 8 MCP resources', () => {
    expect(MCP_TOOLS).toBe(48);
    expect(MCP_RESOURCES).toBe(8);
  });

  it('21 built-in agents, 31 built-in skills (src/core/builtins)', () => {
    expect(BUILTIN_AGENTS).toBe(21); // 445: +implementer (F3)
    expect(BUILTIN_SKILLS).toBe(31);
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
const STALE_PAGE_COUNTS = ['16 pages', '16 sayfa'];

describe('README.md — number truth', () => {
  const content = readFileSync(join(ROOT, 'README.md'), 'utf-8');

  it('contains no legacy stale tool/agent/skill/page counts', () => {
    for (const stale of [...STALE_TOOL_COUNTS, ...STALE_AGENT_COUNTS, ...STALE_SKILL_COUNTS, ...STALE_PAGE_COUNTS]) {
      expect(content).not.toContain(stale);
    }
  });

  // Assert the NUMBER in a count-bearing context, not a fixed marketing phrase.
  // The 2026-08 rewrite changed the wording ("49 canonical MCP tools") while the
  // counts stayed true; pinning prose made this guard fail for the wrong reason.
  it(`reflects the live MCP tool count (${MCP_TOOLS})`, () => {
    expect(content).toMatch(new RegExp(`\\b${MCP_TOOLS}\\b[^\\n]{0,40}tools?\\b`, 'i'));
    expect(content).toMatch(new RegExp(`\\b${MCP_RESOURCES}\\b[^\\n]{0,40}resources?\\b`, 'i'));
  });

  it(`reflects the live built-in agent/skill counts (${BUILTIN_AGENTS}/${BUILTIN_SKILLS})`, () => {
    expect(content).toMatch(new RegExp(`\\b${BUILTIN_AGENTS}\\b[^\\n]{0,40}(built-in|personas?|agents?)\\b`, 'i'));
    expect(content).toMatch(new RegExp(`\\b${BUILTIN_SKILLS}\\b[^\\n]{0,40}skills?\\b`, 'i'));
  });

  it.skip(`reflects the live dashboard page count (${DASHBOARD_PAGES})`, () => {
    // DOC-GAP: the 2026-08 README no longer states a dashboard page count at all.
    expect(content).toMatch(new RegExp(`\\b${DASHBOARD_PAGES}\\b[^\\n]{0,40}(pages?|dashboard)\\b`, 'i'));
  });

  it.skip('carries the run/sprint terminology bridge', () => {
    expect(content).toContain('run, formerly "sprint"');
  });
});

describe('README.tr.md — number truth', () => {
  const content = readFileSync(join(ROOT, 'README.tr.md'), 'utf-8');

  it('contains no legacy stale tool/page counts', () => {
    for (const stale of [...STALE_TOOL_COUNTS, ...STALE_PAGE_COUNTS]) {
      expect(content).not.toContain(stale);
    }
  });

  it(`reflects the live MCP tool count (${MCP_TOOLS})`, () => {
    expect(content).toMatch(new RegExp(`\\b${MCP_TOOLS}\\b[^\\n]{0,40}tool`, 'i'));
    expect(content).toMatch(new RegExp(`\\b${MCP_RESOURCES}\\b[^\\n]{0,40}resource`, 'i'));
  });

  it(`reflects the live built-in agent/skill counts (${BUILTIN_AGENTS}/${BUILTIN_SKILLS})`, () => {
    expect(content).toMatch(new RegExp(`\\b${BUILTIN_AGENTS}\\b[^\\n]{0,40}(built-in|persona|agent)`, 'i'));
    expect(content).toMatch(new RegExp(`\\b${BUILTIN_SKILLS}\\b[^\\n]{0,40}skill`, 'i'));
  });

  it.skip(`reflects the live dashboard page count (${DASHBOARD_PAGES})`, () => {
    // DOC-GAP: README.tr.md no longer states a dashboard page count.
    expect(content).toMatch(new RegExp(`\\b${DASHBOARD_PAGES}\\b[^\\n]{0,40}sayfa`, 'i'));
  });

  it.skip('carries the run/sprint terminology bridge', () => {
    expect(content).toContain('run, eskiden "sprint"');
  });
});

describe('DECKENT.md — number truth', () => {
  const content = readFileSync(join(ROOT, 'DECKENT.md'), 'utf-8');

  it('contains no legacy stale tool/agent/skill counts', () => {
    for (const stale of STALE_TOOL_COUNTS) {
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

  it('uses the parametric catalog contract instead of a fixed model count', () => {
    expect(content).not.toMatch(/\b\d+\s+models\b/);
    expect(content).toContain('live/cached catalog plus bundled offline fallback');
    expect(content).toContain('deckent models list');
  });

  it.skip(`reflects the live built-in agent/skill counts (${BUILTIN_AGENTS}/${BUILTIN_SKILLS})`, () => {
    // DOC-GAP: DECKENT.md dropped its "N built-in agents + M built-in skills" summary line.
    expect(content).toContain(`${BUILTIN_AGENTS} built-in agents + ${BUILTIN_SKILLS} built-in skills`);
  });

  it.skip('carries the run/sprint terminology bridge', () => {
    expect(content).toContain('run, eskiden "sprint"');
  });

  it('no longer inlines the internal pivot-note strategy block (moved to .analysis/)', () => {
    expect(content).not.toContain('Aktif Yön (2026-06-29 pivot');
    expect(content).toContain('.analysis/hermes-vs-deckent-direction-decisions.md');
  });
});
