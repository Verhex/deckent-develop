import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectStats,
  renderBadges,
  renderStatCounts,
  renderIdentityStatus,
  renderIdentityTests,
  replaceAutogenBlock,
  injectAutogenBlock,
  collectGenerations,
  main,
  readStatsSnapshot,
  refreshStatsSnapshot,
  STATS_SNAPSHOT_RELATIVE_PATH,
  // @ts-expect-error — .mjs script lacks .d.ts; import works at runtime via vitest's esm loader
} from '../../scripts/update-readme-stats.mjs';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'update-readme-stats-test-'));
});

afterEach(() => {
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

function seedMinimalProject(root: string): void {
  // package.json
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'deckent', version: '1.0.0-beta.1' }, null, 2),
  );
  // tests/ with one test file containing 2 it() calls
  mkdirSync(join(root, 'tests/foo'), { recursive: true });
  writeFileSync(
    join(root, 'tests/foo/a.test.ts'),
    `import { it, expect } from 'vitest';\n` +
      `it('one', () => { expect(1).toBe(1); });\n` +
      `it('two', () => { expect(2).toBe(2); });\n`,
  );
  // src/mcp/tools with 1 registerTool
  mkdirSync(join(root, 'src/mcp/tools'), { recursive: true });
  writeFileSync(
    join(root, 'src/mcp/tools/init.ts'),
    `server.registerTool('deckent_init', { title: 'X', description: 'Y' }, async () => ({}));\n`,
  );
  // src/mcp/resources with 1 registerResource
  mkdirSync(join(root, 'src/mcp/resources'), { recursive: true });
  writeFileSync(
    join(root, 'src/mcp/resources/dashboard.ts'),
    `server.registerResource('dashboard', 'deckent://dashboard', { title: 'D', description: 'd', mimeType: 'application/json' }, async () => ({}));\n`,
  );
  // docs/adr with 2 numbered + 1 README
  mkdirSync(join(root, 'docs/adr'), { recursive: true });
  writeFileSync(join(root, 'docs/adr/001-x.md'), `# ADR-001\n`);
  writeFileSync(join(root, 'docs/adr/002-y.md'), `# ADR-002\n`);
  writeFileSync(join(root, 'docs/adr/README.md'), `# Index\n`);
  // .deckent/agents with 1 built-in + 1 archive
  mkdirSync(join(root, '.deckent/agents/api-builder'), { recursive: true });
  writeFileSync(
    join(root, '.deckent/agents/api-builder/agent.json'),
    JSON.stringify({ id: 'api-builder' }),
  );
  mkdirSync(join(root, '.deckent/agents/archive/old'), { recursive: true });
  writeFileSync(
    join(root, '.deckent/agents/archive/old/agent.json'),
    JSON.stringify({ id: 'old' }),
  );
  // .deckent/skills
  mkdirSync(join(root, '.deckent/skills/typescript-expert'), { recursive: true });
  writeFileSync(
    join(root, '.deckent/skills/typescript-expert/skill.json'),
    JSON.stringify({ id: 'typescript-expert' }),
  );
  // dashboard pages
  mkdirSync(join(root, 'src/dashboard/src/pages'), { recursive: true });
  writeFileSync(join(root, 'src/dashboard/src/pages/StatusPage.tsx'), '');
  writeFileSync(join(root, 'src/dashboard/src/pages/HistoryPage.tsx'), '');
  // Volatile stats (sprint/coverage) come ONLY from the tracked snapshot file —
  // live .brain/DIRECTIVES/coverage sources are refresh-time inputs, not check/write inputs.
  mkdirSync(join(root, '.deckent/workspace'), { recursive: true });
  writeFileSync(
    join(root, STATS_SNAPSHOT_RELATIVE_PATH),
    JSON.stringify({ sprint: 172, coverage: null, refreshedAt: '2026-08-06T00:00:00.000Z' }),
  );
}

// ─── collectStats ────────────────────────────────────────────────────────────

describe('collectStats', () => {
  it('reads version from package.json', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.version).toBe('1.0.0-beta.1');
  });

  it('counts test descriptors from tests/**/*.test.ts files', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.tests).toBe(2);
  });

  it('parses MCP tools and resources from src/mcp', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.mcpTools).toBe(1);
    expect(stats.mcpResources).toBe(1);
  });

  it('counts numbered ADR files (skips README.md)', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.adrs).toBe(2);
  });

  it('counts agents excluding archive directory', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.agents).toBe(1);
  });

  it('counts skills', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.skills).toBe(1);
  });

  it('counts dashboard pages', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.dashboardPages).toBe(2);
  });

  it('reads sprint from the tracked stats snapshot', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.sprint).toBe(172);
  });

  it('exposes coverage as a numeric value or null', () => {
    seedMinimalProject(tmpRoot);
    const stats = collectStats({ root: tmpRoot });
    expect(stats.coverage === null || typeof stats.coverage === 'number').toBe(true);
  });

  it('HERMETICITY: ignores live .brain sprint archive and local coverage artifact', () => {
    seedMinimalProject(tmpRoot);
    // Volatile machine-local state that only exists on a dev machine — a hermetic
    // collectStats must not let any of it leak into check/write output.
    mkdirSync(join(tmpRoot, '.brain/archive/sprints'), { recursive: true });
    writeFileSync(join(tmpRoot, '.brain/archive/sprints/sprint-998.md'), '');
    writeFileSync(join(tmpRoot, 'DIRECTIVES.md'), `# DIRECTIVES — Sprint 999: Local Only\n`);
    mkdirSync(join(tmpRoot, 'coverage'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'coverage/coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 77.7 } } }),
    );
    const stats = collectStats({ root: tmpRoot });
    expect(stats.sprint).toBe(172); // snapshot value, not 999
    expect(stats.coverage).toBeNull(); // snapshot value, not 77.7
  });

  it('HERMETICITY: excludes machine-local temp-* agents from every agent count', () => {
    seedMinimalProject(tmpRoot);
    // temp-* agent dirs are untracked runtime artifacts — absent on a clean checkout.
    mkdirSync(join(tmpRoot, '.deckent/agents/temp-local-only'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.deckent/agents/temp-local-only/agent.json'),
      JSON.stringify({ id: 'temp-local-only' }),
    );
    const stats = collectStats({ root: tmpRoot });
    expect(stats.agents).toBe(1);
    expect(stats.agentsTotal).toBe(1); // no "+N custom" note can ever drift
    expect(stats.agentsCustom).toBe(0);
  });

  it('degrades to null volatile stats when the snapshot file is missing (honest drift)', () => {
    seedMinimalProject(tmpRoot);
    rmSync(join(tmpRoot, STATS_SNAPSHOT_RELATIVE_PATH));
    const stats = collectStats({ root: tmpRoot });
    expect(stats.sprint).toBeNull();
    expect(stats.coverage).toBeNull();
  });
});

// ─── stats snapshot (tracked volatile-stat source) ───────────────────────────

describe('readStatsSnapshot / refreshStatsSnapshot', () => {
  it('reads sprint/coverage from the snapshot and rejects non-numeric values', () => {
    seedMinimalProject(tmpRoot);
    writeFileSync(
      join(tmpRoot, STATS_SNAPSHOT_RELATIVE_PATH),
      JSON.stringify({ sprint: '492', coverage: 80.1 }),
    );
    const snap = readStatsSnapshot(tmpRoot);
    expect(snap.sprint).toBeNull(); // string is invalid
    expect(snap.coverage).toBe(80.1);
  });

  it('refresh derives sprint from live sources (DIRECTIVES header)', () => {
    seedMinimalProject(tmpRoot);
    rmSync(join(tmpRoot, STATS_SNAPSHOT_RELATIVE_PATH));
    writeFileSync(join(tmpRoot, 'DIRECTIVES.md'), `# DIRECTIVES — Sprint 200: X\n`);
    const snap = refreshStatsSnapshot({ root: tmpRoot });
    expect(snap.sprint).toBe(200);
    expect(readStatsSnapshot(tmpRoot).sprint).toBe(200);
  });

  it('refresh is monotonic — a machine without .brain history never rewinds the sprint', () => {
    seedMinimalProject(tmpRoot);
    writeFileSync(
      join(tmpRoot, STATS_SNAPSHOT_RELATIVE_PATH),
      JSON.stringify({ sprint: 500, coverage: null }),
    );
    writeFileSync(join(tmpRoot, 'DIRECTIVES.md'), `# DIRECTIVES — Sprint 14: Renumbered\n`);
    const snap = refreshStatsSnapshot({ root: tmpRoot });
    expect(snap.sprint).toBe(500);
  });

  it('refresh captures coverage only with withCoverage and preserves it otherwise', () => {
    seedMinimalProject(tmpRoot);
    writeFileSync(
      join(tmpRoot, STATS_SNAPSHOT_RELATIVE_PATH),
      JSON.stringify({ sprint: 172, coverage: 85.5 }),
    );
    mkdirSync(join(tmpRoot, 'coverage'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'coverage/coverage-summary.json'),
      JSON.stringify({ total: { lines: { pct: 90.2 } } }),
    );
    // Default: local artifact is NOT consulted — previous deliberate value survives.
    expect(refreshStatsSnapshot({ root: tmpRoot }).coverage).toBe(85.5);
    // Explicit opt-in captures the artifact value.
    expect(refreshStatsSnapshot({ root: tmpRoot, withCoverage: true }).coverage).toBe(90.2);
  });

  it('main --refresh-snapshot writes the snapshot and exits 0', () => {
    seedMinimalProject(tmpRoot);
    rmSync(join(tmpRoot, STATS_SNAPSHOT_RELATIVE_PATH));
    writeFileSync(join(tmpRoot, 'DIRECTIVES.md'), `# DIRECTIVES — Sprint 300: Y\n`);
    const exit = main(['--refresh-snapshot'], { root: tmpRoot });
    expect(exit).toBe(0);
    expect(readStatsSnapshot(tmpRoot).sprint).toBe(300);
  });
});

// ─── renderBadges ────────────────────────────────────────────────────────────

describe('renderBadges', () => {
  it('produces a markdown badge line with tests/coverage/sprints/version', () => {
    const md = renderBadges({
      tests: 12345,
      coverage: 89.5,
      sprint: 200,
      version: '1.2.3',
    });
    expect(md).toContain('img.shields.io');
    expect(md).toContain('tests-12345');
    expect(md).toContain('coverage-89.5');
    expect(md).toContain('sprints-200');
    expect(md).toContain('version-v1.2.3');
  });

  it('omits coverage badge when coverage is null', () => {
    const md = renderBadges({ tests: 100, coverage: null, sprint: 1, version: '0.0.1' });
    expect(md).not.toContain('coverage-');
  });

  it('URL-encodes the v1.0.0-beta.1 version (hyphen → --)', () => {
    const md = renderBadges({ tests: 1, coverage: null, sprint: 1, version: '1.0.0-beta.1' });
    expect(md).toContain('version-v1.0.0--beta.1');
  });

  it('always emits the CI status badge (never dropped on regeneration)', () => {
    // Regression guard: the CI badge has no local stat; it must stay in the
    // generated set so `docs:stats --write` never strips it from the block.
    const withCov = renderBadges({ tests: 1, coverage: 88.58, sprint: 255, version: '1.0.0-beta.1' });
    const withoutCov = renderBadges({ tests: 1, coverage: null, sprint: 1, version: '0.0.1' });
    expect(withCov).toContain('label=ci');
    expect(withCov).toContain('/actions/workflow/status/VerhexIO/deckent/ci.yml');
    expect(withoutCov).toContain('label=ci');
  });
});

// ─── renderStatCounts ────────────────────────────────────────────────────────

describe('renderStatCounts', () => {
  it('lists MCP tools/resources, agents, skills, dashboard pages', () => {
    const md = renderStatCounts({
      mcpTools: 31,
      mcpResources: 8,
      agents: 15,
      agentsTotal: 17,
      skills: 21,
      dashboardPages: 7,
    });
    expect(md).toContain('31');
    expect(md).toContain('MCP tools');
    expect(md).toContain('15');
    expect(md).toContain('21');
    expect(md).toContain('7');
  });
});

// ─── renderIdentityStatus ────────────────────────────────────────────────────

describe('renderIdentityStatus', () => {
  it('produces a markdown table with all expected rows', () => {
    const md = renderIdentityStatus({
      version: '1.0.0-beta.1',
      sprint: 172,
      mcpTools: 31,
      mcpResources: 8,
      cliCommands: 55,
      dashboardPages: 7,
      agents: 15,
      agentsTotal: 17,
      skills: 21,
      providersCount: 3,
    });
    expect(md).toContain('| Version | 1.0.0-beta.1 |');
    expect(md).not.toContain('| Sprint |'); // none!
    expect(md).toContain('| MCP Tools | 31 |');
    expect(md).toContain('| Skills | 21 built-in |');
  });
});

// ─── renderIdentityTests ─────────────────────────────────────────────────────

describe('renderIdentityTests', () => {
  it('formats the Tests line with the provided count', () => {
    const md = renderIdentityTests({ tests: 16672, coverage: 89.33 });
    expect(md).toMatch(/Tests:\s*16,?672/);
    expect(md).toContain('89.33');
  });
});

// ─── replaceAutogenBlock ─────────────────────────────────────────────────────

describe('replaceAutogenBlock', () => {
  it('replaces content between AUTOGEN markers', () => {
    const original = `head\n<!-- AUTOGEN:START id="x" -->\nold\n<!-- AUTOGEN:END id="x" -->\ntail\n`;
    const result = replaceAutogenBlock(original, 'x', 'NEW');
    expect(result).toContain('NEW');
    expect(result).not.toContain('old');
    expect(result).toContain('head');
    expect(result).toContain('tail');
  });

  it('is idempotent — same body twice yields identical output', () => {
    const original = `<!-- AUTOGEN:START id="x" -->\nfoo\n<!-- AUTOGEN:END id="x" -->\n`;
    const r1 = replaceAutogenBlock(original, 'x', 'body');
    const r2 = replaceAutogenBlock(r1, 'x', 'body');
    expect(r1).toBe(r2);
  });

  it('throws when block id is missing', () => {
    expect(() => replaceAutogenBlock('no markers here', 'missing', 'body')).toThrow();
  });
});

// ─── injectAutogenBlock ──────────────────────────────────────────────────────

describe('injectAutogenBlock', () => {
  it('appends a valid AUTOGEN block to content that lacks markers', () => {
    const result = injectAutogenBlock('# README\n', 'badges', 'badge-line');
    expect(result).toContain('<!-- AUTOGEN:START id="badges" -->');
    expect(result).toContain('badge-line');
    expect(result).toContain('<!-- AUTOGEN:END id="badges" -->');
    expect(result).toContain('# README');
  });

  it('preserves existing content before the injected block', () => {
    const existing = 'line1\nline2\n';
    const result = injectAutogenBlock(existing, 'stat-counts', 'counts');
    expect(result.startsWith('line1\nline2\n')).toBe(true);
  });

  it('produces a block that replaceAutogenBlock can subsequently update', () => {
    const injected = injectAutogenBlock('# head\n', 'badges', 'original-body');
    const updated = replaceAutogenBlock(injected, 'badges', 'new-body');
    expect(updated).toContain('new-body');
    expect(updated).not.toContain('original-body');
  });
});

// ─── collectGenerations (drift detection) ────────────────────────────────────

describe('collectGenerations', () => {
  it('reports drift when README is missing AUTOGEN markers', () => {
    seedMinimalProject(tmpRoot);
    writeFileSync(join(tmpRoot, 'README.md'), `# deckent\n\nNo markers.\n`);
    const gens = collectGenerations({ root: tmpRoot });
    const readme = gens.find((g: { target: string }) => g.target === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.drift).toBe(true);
  });

  it('clears drift after writing generated content', () => {
    seedMinimalProject(tmpRoot);
    // Seed README/README.tr/IDENTITY with AUTOGEN scaffolds
    writeFileSync(
      join(tmpRoot, 'README.md'),
      `# deckent\n\n<!-- AUTOGEN:START id="badges" -->\nstale\n<!-- AUTOGEN:END id="badges" -->\n<!-- AUTOGEN:START id="stat-counts" -->\nstale\n<!-- AUTOGEN:END id="stat-counts" -->\n`,
    );
    writeFileSync(
      join(tmpRoot, 'README.tr.md'),
      `# deckent\n\n<!-- AUTOGEN:START id="badges" -->\nstale\n<!-- AUTOGEN:END id="badges" -->\n<!-- AUTOGEN:START id="stat-counts" -->\nstale\n<!-- AUTOGEN:END id="stat-counts" -->\n`,
    );
    mkdirSync(join(tmpRoot, '.deckent/workspace'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.deckent/workspace/IDENTITY.md'),
      `# Identity\n\n<!-- AUTOGEN:START id="identity-tests" -->\nstale\n<!-- AUTOGEN:END id="identity-tests" -->\n\n## Project Status\n\n<!-- AUTOGEN:START id="identity-status" -->\nstale\n<!-- AUTOGEN:END id="identity-status" -->\n`,
    );

    // First pass: stale → drift
    const before = collectGenerations({ root: tmpRoot });
    expect(before.filter((g: { drift: boolean }) => g.drift).length).toBeGreaterThan(0);

    // Apply writes
    for (const gen of before) {
      writeFileSync(join(tmpRoot, gen.target), gen.content);
    }

    // Second pass: no drift
    const after = collectGenerations({ root: tmpRoot });
    expect(after.filter((g: { drift: boolean }) => g.drift).length).toBe(0);
  });
});

// ─── CLI main(argv) ──────────────────────────────────────────────────────────

describe('main (CLI entry)', () => {
  it('exit 2 when neither --check nor --write is given', () => {
    seedMinimalProject(tmpRoot);
    const exit = main([], { root: tmpRoot });
    expect(exit).toBe(2);
  });

  it('exit 1 on drift in --check mode', () => {
    seedMinimalProject(tmpRoot);
    // Missing markers → drift
    writeFileSync(join(tmpRoot, 'README.md'), '# no markers\n');
    writeFileSync(join(tmpRoot, 'README.tr.md'), '# no markers\n');
    mkdirSync(join(tmpRoot, '.deckent/workspace'), { recursive: true });
    writeFileSync(join(tmpRoot, '.deckent/workspace/IDENTITY.md'), '# no markers\n');
    const exit = main(['--check'], { root: tmpRoot });
    expect(exit).toBe(1);
  });

  it('--write auto-injects AUTOGEN markers when absent (exit 0)', () => {
    seedMinimalProject(tmpRoot);
    // Files exist but have NO AUTOGEN markers — write mode should inject them
    writeFileSync(join(tmpRoot, 'README.md'), '# deckent\n\nNo markers here.\n');
    writeFileSync(join(tmpRoot, 'README.tr.md'), '# deckent\n\nNo markers here.\n');
    mkdirSync(join(tmpRoot, '.deckent/workspace'), { recursive: true });
    writeFileSync(join(tmpRoot, '.deckent/workspace/IDENTITY.md'), '# Identity\n\nNo markers.\n');

    const writeExit = main(['--write'], { root: tmpRoot });
    expect(writeExit).toBe(0);

    // After injection, check mode must also pass
    const checkExit = main(['--check'], { root: tmpRoot });
    expect(checkExit).toBe(0);

    // Verify markers are present in the written README
    const readme = readFileSync(join(tmpRoot, 'README.md'), 'utf-8');
    expect(readme).toContain('<!-- AUTOGEN:START id="badges" -->');
    expect(readme).toContain('<!-- AUTOGEN:END id="badges" -->');
  });

  it('exit 0 after --write then --check (round-trip)', () => {
    seedMinimalProject(tmpRoot);
    // Seed with markers so embed mode can replace
    writeFileSync(
      join(tmpRoot, 'README.md'),
      `# deckent\n\n<!-- AUTOGEN:START id="badges" -->\nstale\n<!-- AUTOGEN:END id="badges" -->\n<!-- AUTOGEN:START id="stat-counts" -->\nstale\n<!-- AUTOGEN:END id="stat-counts" -->\n`,
    );
    writeFileSync(
      join(tmpRoot, 'README.tr.md'),
      `# deckent\n\n<!-- AUTOGEN:START id="badges" -->\nstale\n<!-- AUTOGEN:END id="badges" -->\n<!-- AUTOGEN:START id="stat-counts" -->\nstale\n<!-- AUTOGEN:END id="stat-counts" -->\n`,
    );
    mkdirSync(join(tmpRoot, '.deckent/workspace'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.deckent/workspace/IDENTITY.md'),
      `# Identity\n\n<!-- AUTOGEN:START id="identity-tests" -->\nstale\n<!-- AUTOGEN:END id="identity-tests" -->\n\n## Project Status\n\n<!-- AUTOGEN:START id="identity-status" -->\nstale\n<!-- AUTOGEN:END id="identity-status" -->\n`,
    );

    const writeExit = main(['--write'], { root: tmpRoot });
    expect(writeExit).toBe(0);

    const checkExit = main(['--check'], { root: tmpRoot });
    expect(checkExit).toBe(0);
  });
});
