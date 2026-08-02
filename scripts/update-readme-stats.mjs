#!/usr/bin/env node
// update-readme-stats.mjs — Sprint 172 Task C1
// Single source of truth for stat badges/counts in README.md, README.tr.md, .deckent/workspace/IDENTITY.md.
// Reads from real sources (vitest test count, package.json version, src/mcp/* register calls,
// docs/adr/* filenames, .deckent/agents+skills directories, src/dashboard/src/pages/*).
//
// Modes:
//   --check  → exit 1 if any AUTOGEN block drifts from generated content (CI gate)
//   --write  → overwrite blocks in place
// Exit codes: 0 = ok / in-sync, 1 = drift detected (check) or write error, 2 = bad args

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..');

const AUTOGEN_START = (id) => `<!-- AUTOGEN:START id="${id}" -->`;
const AUTOGEN_END = (id) => `<!-- AUTOGEN:END id="${id}" -->`;

// ─── filesystem helpers ──────────────────────────────────────────────────────

function listFilesRecursive(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'node_modules') continue;
      out.push(...listFilesRecursive(p, predicate));
    } else if (entry.isFile() && predicate(entry.name, p)) {
      out.push(p);
    }
  }
  return out;
}

function safeReadJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

// ─── stat collectors ─────────────────────────────────────────────────────────

const TEST_DESCRIPTOR_RE = /^\s*(?:it|test)(?:\.skip|\.only|\.each|\.concurrent)?\s*[(`]/gm;

export function countTestDescriptors(testsDir) {
  const files = listFilesRecursive(
    testsDir,
    (n) => n.endsWith('.test.ts') || n.endsWith('.test.tsx'),
  );
  let count = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    const matches = src.match(TEST_DESCRIPTOR_RE);
    if (matches) count += matches.length;
  }
  return count;
}

const TOOL_REGISTER_RE = /server\.registerTool\(\s*['"][a-zA-Z0-9_-]+['"]/g;
const RESOURCE_REGISTER_RE = /server\.registerResource\(\s*['"][a-zA-Z0-9_-]+['"]/g;

export function countMcpRegistrations(srcDir, regex) {
  const files = listFilesRecursive(
    srcDir,
    (n) => n.endsWith('.ts') && !n.endsWith('.d.ts') && n !== 'index.ts',
  );
  let count = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    const matches = src.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

const ADR_FILE_RE = /^\d{3,}-.*\.md$/;

export function countAdrFiles(adrDir) {
  if (!existsSync(adrDir)) return 0;
  return readdirSync(adrDir).filter((n) => ADR_FILE_RE.test(n)).length;
}

export function listAgentDirs(agentsDir) {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name !== 'archive' &&
        existsSync(join(agentsDir, d.name, 'agent.json')),
    )
    .map((d) => d.name);
}

export function listSkillDirs(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name !== 'archive' &&
        // Skills can ship either skill.json (legacy) or manifest.json (ADR-029+).
        (existsSync(join(skillsDir, d.name, 'skill.json')) ||
          existsSync(join(skillsDir, d.name, 'manifest.json'))),
    )
    .map((d) => d.name);
}

export function countDashboardPages(pagesDir) {
  if (!existsSync(pagesDir)) return 0;
  return readdirSync(pagesDir).filter((n) => n.endsWith('.tsx') && !n.endsWith('.test.tsx')).length;
}

const SPRINT_FILE_RE = /^sprint-(\d+)(?:\.md|-tasks)?$/;
// Match both the spaced form ("Sprint 172") and the hyphenated GOAL-phase form
// ("SPRINT-14") that DIRECTIVES.md can carry after a re-numbering.
const DIRECTIVES_SPRINT_RE = /Sprint[\s-]+(\d+)/i;

export function detectLatestSprint(archiveDir) {
  if (!existsSync(archiveDir)) return null;
  const nums = readdirSync(archiveDir)
    .map((n) => {
      const m = SPRINT_FILE_RE.exec(n);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n !== null);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

// Active sprint: reconcile two signals and take the higher.
//   - DIRECTIVES.md header ("# DIRECTIVES — Sprint 172: ..." or "SPRINT-14: ...")
//   - max(archive sprint) + 1 from `.brain/archive/sprints/` (the sprint history now
//     lives under a `sprints/` subdirectory, not the archive root).
// The DIRECTIVES header can carry a re-numbered GOAL-phase counter ("SPRINT-14") that
// sits far below the true completed-sprint count; preferring the max keeps the
// "sprints-N+" badge monotonic and correct across such re-numberings, so a regen never
// silently rewinds the badge to a low phase number.
export function detectActiveSprint(root) {
  const directivesPath = join(root, 'DIRECTIVES.md');
  let fromDirectives = null;
  if (existsSync(directivesPath)) {
    const head = readFileSync(directivesPath, 'utf-8').split('\n', 5).join('\n');
    const m = DIRECTIVES_SPRINT_RE.exec(head);
    if (m) fromDirectives = Number(m[1]);
  }
  const archived = detectLatestSprint(join(root, '.brain/archive/sprints'));
  const fromArchive = archived !== null ? archived + 1 : null;
  if (fromDirectives !== null && fromArchive !== null) {
    return Math.max(fromDirectives, fromArchive);
  }
  return fromDirectives ?? fromArchive;
}

// CLI top-level commands: count exported `register*(program)` functions under
// src/cli/commands. Subcommand chains (`.command('subname')`) are excluded so
// the metric matches CLI documentation conventions ("55+ commands").
const CLI_REGISTER_RE = /^export\s+function\s+register\w+\s*\(\s*program\b/m;

export function countCliCommands(cliDir) {
  if (!existsSync(cliDir)) return 0;
  const files = listFilesRecursive(
    cliDir,
    (n) => n.endsWith('.ts') && !n.endsWith('.d.ts') && n !== 'index.ts',
  );
  let count = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    if (CLI_REGISTER_RE.test(src)) count += 1;
  }
  return count;
}

// Coverage: optional read from coverage/coverage-summary.json (vitest --coverage)
export function readCoverage(root) {
  const summary = join(root, 'coverage/coverage-summary.json');
  if (!existsSync(summary)) return null;
  const data = safeReadJson(summary);
  const pct = data?.total?.lines?.pct;
  return typeof pct === 'number' ? pct : null;
}

// ─── collectStats (top-level entry) ──────────────────────────────────────────

export function collectStats({ root = DEFAULT_ROOT, coverage } = {}) {
  const pkg = safeReadJson(join(root, 'package.json')) ?? {};
  const agents = listAgentDirs(join(root, '.deckent/agents'));
  const skills = listSkillDirs(join(root, '.deckent/skills'));
  // Built-in agents = agents not prefixed with `temp-`; total includes temp.
  const builtInAgents = agents.filter((id) => !id.startsWith('temp-'));
  const tempAgents = agents.filter((id) => id.startsWith('temp-'));

  const cov = coverage ?? readCoverage(root);

  return {
    version: pkg.version ?? '0.0.0',
    tests: countTestDescriptors(join(root, 'tests')),
    dashboardTests: countTestDescriptors(join(root, 'src/dashboard/src')),
    coverage: cov,
    sprint: detectActiveSprint(root),
    mcpTools: countMcpRegistrations(join(root, 'src/mcp/tools'), TOOL_REGISTER_RE),
    mcpResources: countMcpRegistrations(join(root, 'src/mcp/resources'), RESOURCE_REGISTER_RE),
    adrs: countAdrFiles(join(root, 'docs/adr')),
    agents: builtInAgents.length,
    agentsTotal: agents.length,
    agentsCustom: tempAgents.length,
    skills: skills.length,
    dashboardPages: countDashboardPages(join(root, 'src/dashboard/src/pages')),
    cliCommands: countCliCommands(join(root, 'src/cli/commands')),
  };
}

// ─── renderers ────────────────────────────────────────────────────────────────

function shieldsEscape(s) {
  // shields.io URL escape: - → --, _ → __, space → _
  return String(s).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_');
}

export function renderBadges({ tests, coverage, sprint, version }) {
  const parts = [];
  parts.push(
    `[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent)`,
  );
  if (typeof tests === 'number' && tests > 0) {
    parts.push(
      `[![tests](https://img.shields.io/badge/tests-${tests}%2B-brightgreen)](https://github.com/VerhexIO/deckent)`,
    );
  }
  if (typeof coverage === 'number' && coverage > 0) {
    parts.push(
      `[![coverage](https://img.shields.io/badge/coverage-${coverage}%25-brightgreen)](https://github.com/VerhexIO/deckent)`,
    );
  }
  parts.push(`[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)`);
  if (typeof sprint === 'number' && sprint > 0) {
    parts.push(
      `[![sprints](https://img.shields.io/badge/sprints-${sprint}%2B-teal)](https://github.com/VerhexIO/deckent)`,
    );
  }
  if (version) {
    parts.push(
      `[![version](https://img.shields.io/badge/version-v${shieldsEscape(version)}-orange)](https://github.com/VerhexIO/deckent)`,
    );
  }
  // CI status is a live shields.io endpoint (no local stat) — kept in the
  // generated set so regenerating the badges block never drops it.
  parts.push(
    `[![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)`,
  );
  return parts.join(' ');
}

export function renderStatCounts({
  mcpTools,
  mcpResources,
  agents,
  agentsTotal,
  skills,
  dashboardPages,
}) {
  const customNote =
    typeof agentsTotal === 'number' && agentsTotal > agents
      ? ` (+${agentsTotal - agents} custom)`
      : '';
  return [
    `- **${mcpTools} MCP tools** + **${mcpResources} MCP resources**`,
    `- **${agents} built-in agents**${customNote}`,
    `- **${skills} built-in skills**`,
    `- **${dashboardPages} dashboard pages**`,
  ].join('\n');
}

export function renderIdentityStatus({
  version,
  mcpTools,
  mcpResources,
  cliCommands,
  dashboardPages,
  agents,
  agentsTotal,
  skills,
}) {
  const customNote =
    typeof agentsTotal === 'number' && agentsTotal > agents
      ? ` + ${agentsTotal - agents} custom`
      : '';
  const cli = typeof cliCommands === 'number' && cliCommands > 0 ? `${cliCommands}+` : '0';
  return [
    '| Metric | Value |',
    '|--------|-------|',
    `| Version | ${version} |`,
    `| MCP Tools | ${mcpTools} |`,
    `| MCP Resources | ${mcpResources} |`,
    `| CLI Commands | ${cli} |`,
    `| Dashboard Pages | ${dashboardPages} |`,
    `| Agents | ${agents} built-in${customNote} |`,
    `| Skills | ${skills} built-in |`,
  ].join('\n');
}

export function renderIdentityTests({ tests, dashboardTests, coverage }) {
  const formatted = typeof tests === 'number' ? tests.toLocaleString('en-US') : String(tests);
  const dashboardFormatted =
    typeof dashboardTests === 'number'
      ? dashboardTests.toLocaleString('en-US')
      : String(dashboardTests);
  const cov = typeof coverage === 'number' ? `${coverage}%` : 'N/A';
  return [
    `Tests: ${formatted} descriptors (parsed from tests/**/*.test.ts(x))`,
    `Dashboard Tests: ${dashboardFormatted} descriptors (parsed from src/dashboard/src/**/*.test.tsx)`,
    `Coverage: ${cov}`,
  ].join('\n');
}

export function renderIdentitySummary({
  cliCommands,
  mcpTools,
  mcpResources,
  agents,
  agentsTotal,
  skills,
}) {
  const customNote =
    typeof agentsTotal === 'number' && agentsTotal > agents
      ? ` + ${agentsTotal - agents} custom`
      : '';
  const cli = typeof cliCommands === 'number' && cliCommands > 0 ? `${cliCommands}+` : '0';
  return [
    `CLI Commands: ${cli}`,
    `MCP: ${mcpTools} tools, ${mcpResources} resources`,
    `Agents: ${agents} built-in${customNote}`,
    `Skills: ${skills} built-in`,
  ].join('\n');
}

// ─── AUTOGEN block replacement ───────────────────────────────────────────────

export function replaceAutogenBlock(content, blockId, newBody) {
  const start = AUTOGEN_START(blockId);
  const end = AUTOGEN_END(blockId);
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`AUTOGEN markers for id="${blockId}" not found in content`);
  }
  const before = content.slice(0, startIdx + start.length);
  const after = content.slice(endIdx);
  const body = newBody.endsWith('\n') ? newBody : newBody + '\n';
  return `${before}\n${body}${after}`;
}

// Append a new AUTOGEN block when markers are absent from the content.
// Used by collectGenerations when a file exists but lacks AUTOGEN scaffolding.
export function injectAutogenBlock(content, blockId, body) {
  const start = AUTOGEN_START(blockId);
  const end = AUTOGEN_END(blockId);
  const block = body.endsWith('\n') ? body : body + '\n';
  const base = content.endsWith('\n') ? content : content + '\n';
  return `${base}\n${start}\n${block}${end}\n`;
}

// ─── Generation descriptors ──────────────────────────────────────────────────

export function collectGenerations({ root = DEFAULT_ROOT, coverage } = {}) {
  const stats = collectStats({ root, coverage });

  const badges = renderBadges(stats);
  const statCounts = renderStatCounts(stats);
  const identityStatus = renderIdentityStatus(stats);
  const identityTests = renderIdentityTests(stats);
  const identitySummary = renderIdentitySummary(stats);

  const targets = [
    {
      target: 'README.md',
      blocks: [
        { id: 'badges', body: badges },
        { id: 'stat-counts', body: statCounts },
      ],
    },
    {
      target: 'README.tr.md',
      blocks: [
        { id: 'badges', body: badges },
        { id: 'stat-counts', body: statCounts },
      ],
    },
    {
      target: '.deckent/workspace/IDENTITY.md',
      blocks: [
        { id: 'identity-tests', body: identityTests },
        { id: 'identity-summary', body: identitySummary, optional: true },
        { id: 'identity-status', body: identityStatus },
      ],
    },
  ];

  const out = [];
  for (const t of targets) {
    const targetPath = join(root, t.target);
    const exists = existsSync(targetPath);
    const actual = exists ? readFileSync(targetPath, 'utf-8') : '';
    let expected = actual;
    if (exists) {
      for (const b of t.blocks) {
        const hasMarker =
          expected.includes(`<!-- AUTOGEN:START id="${b.id}" -->`) &&
          expected.includes(`<!-- AUTOGEN:END id="${b.id}" -->`);
        if (!hasMarker && b.optional) continue;
        if (!hasMarker) {
          // Markers absent — inject the full block at the end of the file.
          expected = injectAutogenBlock(expected, b.id, b.body);
        } else {
          expected = replaceAutogenBlock(expected, b.id, b.body);
        }
      }
    }
    out.push({
      target: t.target,
      blocks: t.blocks,
      exists,
      actual,
      content: expected,
      drift: !exists || actual !== expected,
      renderError: null,
      stats,
    });
  }
  return out;
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

export function main(argv = process.argv.slice(2), opts = {}) {
  const args = new Set(argv);
  const check = args.has('--check');
  const write = args.has('--write');
  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'update-readme-stats.mjs — keep stat badges/counts in README/IDENTITY in sync\n\n' +
        'Usage:\n' +
        '  node scripts/update-readme-stats.mjs --check   # CI gate (exit 1 on drift)\n' +
        '  node scripts/update-readme-stats.mjs --write   # rewrite target files in place\n',
    );
    return 0;
  }
  if (!check && !write) {
    process.stderr.write('error: must pass --check or --write\n');
    return 2;
  }
  const root = opts.root ?? DEFAULT_ROOT;
  const gens = collectGenerations({ root, coverage: opts.coverage });

  if (write) {
    let updated = 0;
    for (const gen of gens) {
      if (gen.renderError) {
        process.stderr.write(`  ✗ ${gen.target} — ${gen.renderError}\n`);
        return 1;
      }
      if (gen.drift) {
        writeFileSync(join(root, gen.target), gen.content);
        updated += 1;
        process.stdout.write(`  ✎ ${gen.target} (updated)\n`);
      } else {
        process.stdout.write(`  ✓ ${gen.target} (in sync)\n`);
      }
    }
    process.stdout.write(`\nupdate-readme-stats: wrote ${updated} of ${gens.length} target(s).\n`);
    return 0;
  }

  // --check mode
  const drifting = gens.filter((g) => g.drift);
  for (const gen of gens) {
    const marker = gen.drift ? '✗' : '✓';
    const note = gen.renderError
      ? gen.renderError
      : gen.drift
        ? gen.exists
          ? 'stale'
          : 'missing'
        : 'in sync';
    process.stdout.write(`  ${marker} ${gen.target} — ${note}\n`);
  }
  if (drifting.length > 0) {
    process.stderr.write(
      `\nupdate-readme-stats: ${drifting.length} of ${gens.length} target(s) drift.` +
        ` Run \`npm run docs:stats\` to regenerate.\n`,
    );
    return 1;
  }
  process.stdout.write(`\nupdate-readme-stats: all ${gens.length} target(s) in sync.\n`);
  return 0;
}

// ─── invoke as CLI when run directly ─────────────────────────────────────────

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = main();
  process.exit(code);
}
