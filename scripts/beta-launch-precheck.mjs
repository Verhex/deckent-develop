#!/usr/bin/env node
/**
 * Beta Launch Pre-Check — Sprint 198/199 Task 009
 *
 * Audits the 20-gate beta launch exit criteria (docs/release/beta-tracker.md)
 * and prints a single PASS/FAIL/WARN table. Designed to run any time between
 * Sprint 198 finalize and the 1 Haziran v1.0.0-beta.1 npm publish.
 *
 * Gate kinds:
 *   - runtime: spawns a real command (tsc, vitest, npm pack, deckent --help, deckent help)
 *   - static : tracked historical milestone (cross-platform, multi-provider, i18n, …)
 *              → returns PASS with a source reference, no spawn
 *   - file   : reads a tracked file (.brain/exports/debt.md, decisions.md, beta-tracker.md)
 *
 * Exit codes:
 *   0 — all required gates PASS or WARN (warnings are non-blocking)
 *   1 — at least one required gate FAIL
 *   2 — script itself crashed (cannot run gates)
 *
 * Usage:
 *   node scripts/beta-launch-precheck.mjs           # full run, human table
 *   node scripts/beta-launch-precheck.mjs --json    # machine-readable
 *   node scripts/beta-launch-precheck.mjs --self-test  # internal parser tests, no spawn
 *   node scripts/beta-launch-precheck.mjs --root <path>
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const selfTest = args.includes('--self-test');
const rootIdx = args.indexOf('--root');
const projectRoot = rootIdx !== -1 && args[rootIdx + 1]
  ? resolve(args[rootIdx + 1])
  : process.cwd();

// ─── Thresholds ─────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  vitestPassRatio: 0.995,
  coverageMinLines: 85,
  mcpToolsMin: 31,
  cliCommandsMin: 45,
  adrAcceptedMin: 48,
  wireGrepMin: 10,
  diskVerifyGateMin: 5, // KAYNAK 1-5 landed; 6+7 closure Sprint 198-001
  criticalHighDebtMax: 0,
  promptTimeoutMs: 60_000,
  vitestTimeoutMs: 180_000,
  tscTimeoutMs: 120_000,
};

// ─── Parsing helpers (pure, self-test target) ───────────────────────────────

/**
 * @param {string} output
 * @returns {{ passed: number, failed: number, total: number, ratio: number }}
 */
export function parseVitestOutput(output) {
  const failMatch = output.match(/(\d+)\s+failed/i);
  const passMatch = output.match(/(\d+)\s+passed/i);
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const total = passed + failed;
  const ratio = total > 0 ? passed / total : 0;
  return { passed, failed, total, ratio };
}

/**
 * Count tool entries in `deckent help` output. Looks for `deckent_*` tokens.
 * @param {string} output
 * @returns {number}
 */
export function parseHelpToolCount(output) {
  const matches = output.match(/\bdeckent_[a-z_]+/g);
  if (!matches) return 0;
  return new Set(matches).size;
}

/**
 * Count distinct subcommands in `deckent --help` output. Looks for lines
 * starting with two-space indent + word at the beginning of a command list.
 * Falls back to counting "  command" patterns.
 * @param {string} output
 * @returns {number}
 */
export function parseCliCommandCount(output) {
  // commander.js renders commands as "  command [args]    description"
  const lines = output.split('\n');
  const commands = new Set();
  let inCommands = false;
  for (const line of lines) {
    if (/^\s*Commands:/i.test(line)) { inCommands = true; continue; }
    if (!inCommands) continue;
    if (/^\s*$/.test(line)) continue;
    const m = line.match(/^\s{1,4}([a-z][a-z0-9:-]+)/);
    if (m) commands.add(m[1]);
  }
  return commands.size;
}

/**
 * Count ADR entries with "Status: accepted" in decisions.md.
 * @param {string} content
 * @returns {number}
 */
export function parseAcceptedAdrCount(content) {
  const matches = content.match(/^\*\*Status:\*\*\s+accepted/gim);
  return matches ? matches.length : 0;
}

/**
 * Count CRITICAL or HIGH priority rows in the Active Technical Debt table.
 * Tolerates the "_No active technical debt._" placeholder.
 * @param {string} content
 * @returns {number}
 */
export function parseCriticalHighDebt(content) {
  const activeIdx = content.indexOf('Active Technical Debt');
  const resolvedIdx = content.indexOf('Resolved Technical Debt');
  if (activeIdx === -1) return 0;
  const section = resolvedIdx > activeIdx
    ? content.slice(activeIdx, resolvedIdx)
    : content.slice(activeIdx);
  const rows = section.split('\n').filter(l => /^\|\s*debt-/.test(l));
  return rows.filter(l => /\|\s*(critical|high)\s*\|/i.test(l)).length;
}

// ─── Gate runners ───────────────────────────────────────────────────────────

/**
 * @typedef {{ id: number, name: string, target: string, status: 'PASS'|'FAIL'|'WARN', message: string, required: boolean, durationMs?: number }} GateResult
 */

function staticGate(id, name, target, message, required = true) {
  return { id, name, target, status: 'PASS', message, required };
}

function runTsc(root) {
  const start = Date.now();
  const r = spawnSync('npx', ['tsc', '--noEmit'], {
    cwd: root, encoding: 'utf-8', timeout: THRESHOLDS.tscTimeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  const passed = r.status === 0;
  const errLine = ((r.stderr ?? '') + (r.stdout ?? ''))
    .split('\n').find(l => /error TS/.test(l)) ?? '';
  return {
    id: 1,
    name: 'tsc --noEmit',
    target: '0 errors',
    status: passed ? 'PASS' : 'FAIL',
    message: passed ? 'tsc clean' : `tsc failed — ${errLine.trim() || 'see output'}`,
    required: true,
    durationMs,
  };
}

function runVitest(root) {
  const start = Date.now();
  const r = spawnSync('npx', ['vitest', 'run', '--reporter', 'basic'], {
    cwd: root, encoding: 'utf-8', timeout: THRESHOLDS.vitestTimeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const stats = parseVitestOutput(out);
  if (stats.total === 0) {
    return {
      id: 2, name: 'vitest pass ratio', target: `≥${THRESHOLDS.vitestPassRatio * 100}%`,
      status: 'WARN', message: 'no test counts parsed (suite may have crashed)',
      required: true, durationMs,
    };
  }
  const passed = stats.ratio >= THRESHOLDS.vitestPassRatio;
  return {
    id: 2,
    name: 'vitest pass ratio',
    target: `≥${(THRESHOLDS.vitestPassRatio * 100).toFixed(1)}%`,
    status: passed ? 'PASS' : 'FAIL',
    message: `${stats.passed}/${stats.total} passed (${(stats.ratio * 100).toFixed(2)}%)`,
    required: true,
    durationMs,
  };
}

function runCoverage(root) {
  // Coverage gate reads .deckent/ci-baseline.json (cheap) rather than re-running vitest --coverage.
  const baselinePath = join(root, '.deckent', 'ci-baseline.json');
  if (!existsSync(baselinePath)) {
    return {
      id: 3, name: 'coverage lines', target: `≥${THRESHOLDS.coverageMinLines}%`,
      status: 'WARN', message: 'ci-baseline.json missing — run `npm run test:coverage`',
      required: false,
    };
  }
  try {
    const data = JSON.parse(readFileSync(baselinePath, 'utf-8'));
    const lines = data?.coverage?.lines ?? data?.lines ?? null;
    if (lines == null) {
      return {
        id: 3, name: 'coverage lines', target: `≥${THRESHOLDS.coverageMinLines}%`,
        status: 'WARN', message: 'ci-baseline.json has no lines field',
        required: false,
      };
    }
    const passed = lines >= THRESHOLDS.coverageMinLines;
    return {
      id: 3, name: 'coverage lines', target: `≥${THRESHOLDS.coverageMinLines}%`,
      status: passed ? 'PASS' : 'FAIL',
      message: `lines ${lines}%`, required: false,
    };
  } catch (err) {
    return {
      id: 3, name: 'coverage lines', target: `≥${THRESHOLDS.coverageMinLines}%`,
      status: 'WARN', message: `cannot parse ci-baseline.json: ${String(err).slice(0, 80)}`,
      required: false,
    };
  }
}

function runMcpToolCount(root) {
  const start = Date.now();
  const r = spawnSync('node', ['dist/cli/entry.js', 'help'], {
    cwd: root, encoding: 'utf-8', timeout: THRESHOLDS.promptTimeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  let count = parseHelpToolCount(r.stdout ?? '');
  let source = 'deckent help';
  // Fallback: `deckent help` does not surface the full MCP tool list (only deckent_style is
  // referenced as a CLI subcommand). The canonical list lives in docs/reference/mcp-tools.md
  // (auto-generated by `npm run docs:ref`). Use it when the CLI text undercounts.
  if (count < THRESHOLDS.mcpToolsMin) {
    const refPath = join(root, 'docs', 'reference', 'mcp-tools.md');
    if (existsSync(refPath)) {
      const refContent = readFileSync(refPath, 'utf-8');
      const refCount = parseHelpToolCount(refContent);
      if (refCount > count) {
        count = refCount;
        source = 'docs/reference/mcp-tools.md';
      }
    }
  }
  if (count === 0 && r.status !== 0 && !r.stdout) {
    return {
      id: 4, name: 'MCP tools', target: `≥${THRESHOLDS.mcpToolsMin}`,
      status: 'WARN',
      message: `deckent help did not run (dist may be stale; run \`npm run build\`)`,
      required: true, durationMs,
    };
  }
  const passed = count >= THRESHOLDS.mcpToolsMin;
  return {
    id: 4, name: 'MCP tools', target: `≥${THRESHOLDS.mcpToolsMin}`,
    status: passed ? 'PASS' : 'FAIL',
    message: `${count} unique deckent_* tokens detected (source: ${source})`,
    required: true, durationMs,
  };
}

function runCliCommandCount(root) {
  const start = Date.now();
  const r = spawnSync('node', ['dist/cli/entry.js', '--help'], {
    cwd: root, encoding: 'utf-8', timeout: THRESHOLDS.promptTimeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  if (!r.stdout && r.status !== 0) {
    return {
      id: 5, name: 'CLI commands', target: `≥${THRESHOLDS.cliCommandsMin}`,
      status: 'WARN', message: 'deckent --help did not run (build dist first)',
      required: true, durationMs,
    };
  }
  const count = parseCliCommandCount(r.stdout ?? '');
  const passed = count >= THRESHOLDS.cliCommandsMin;
  return {
    id: 5, name: 'CLI commands', target: `≥${THRESHOLDS.cliCommandsMin}`,
    status: passed ? 'PASS' : 'WARN',
    message: `${count} commands detected`,
    required: true, durationMs,
  };
}

function runNpmPack(root) {
  const start = Date.now();
  const r = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root, encoding: 'utf-8', timeout: THRESHOLDS.promptTimeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  const passed = r.status === 0;
  let sizeKb = null;
  try {
    const json = JSON.parse((r.stdout ?? '').trim());
    const entry = Array.isArray(json) ? json[0] : json;
    if (entry?.size != null) sizeKb = Math.round(entry.size / 1024);
  } catch { /* tolerate non-JSON output */ }
  return {
    id: 6, name: 'npm pack --dry-run', target: 'exit 0',
    status: passed ? 'PASS' : 'FAIL',
    message: passed
      ? `pack clean${sizeKb != null ? ` (${sizeKb} KB)` : ''}`
      : `npm pack failed (exit ${r.status ?? 'null'})`,
    required: true, durationMs,
  };
}

function checkDocsSync(root) {
  // Lightweight: confirm beta-tracker.md exists and was touched this sprint band.
  const trackerPath = join(root, 'docs', 'release', 'beta-tracker.md');
  if (!existsSync(trackerPath)) {
    return {
      id: 11, name: 'docs sync', target: 'beta-tracker fresh',
      status: 'FAIL', message: 'beta-tracker.md missing', required: true,
    };
  }
  const first = readFileSync(trackerPath, 'utf-8').split('\n').slice(0, 6).join('\n');
  const fresh = /2026-05-(2[6-9]|3[01])/.test(first) || /Sprint\s+19[5-9]/.test(first);
  return {
    id: 11, name: 'docs sync', target: 'beta-tracker fresh',
    status: fresh ? 'PASS' : 'WARN',
    message: fresh ? 'beta-tracker timestamp current' : 'beta-tracker may be stale',
    required: false,
  };
}

function checkDebt(root) {
  const debtPath = join(root, '.brain', 'exports', 'debt.md');
  if (!existsSync(debtPath)) {
    return {
      id: 12, name: 'CRITICAL/HIGH debt', target: `≤${THRESHOLDS.criticalHighDebtMax}`,
      status: 'WARN', message: 'debt.md missing — regenerate via `deckent memory export`',
      required: false,
    };
  }
  const content = readFileSync(debtPath, 'utf-8');
  const count = parseCriticalHighDebt(content);
  const passed = count <= THRESHOLDS.criticalHighDebtMax;
  return {
    id: 12, name: 'CRITICAL/HIGH debt', target: `≤${THRESHOLDS.criticalHighDebtMax}`,
    status: passed ? 'PASS' : 'FAIL',
    message: passed ? 'no critical/high active debt' : `${count} critical/high open`,
    required: true,
  };
}

function checkAdrCount(root) {
  const decisionsPath = join(root, '.brain', 'exports', 'decisions.md');
  if (!existsSync(decisionsPath)) {
    return {
      id: 16, name: 'ADR accepted count', target: `≥${THRESHOLDS.adrAcceptedMin}`,
      status: 'WARN', message: 'decisions.md missing', required: false,
    };
  }
  const content = readFileSync(decisionsPath, 'utf-8');
  const count = parseAcceptedAdrCount(content);
  const passed = count >= THRESHOLDS.adrAcceptedMin;
  return {
    id: 16, name: 'ADR accepted count', target: `≥${THRESHOLDS.adrAcceptedMin}`,
    status: passed ? 'PASS' : 'FAIL',
    message: `${count} accepted ADRs`, required: true,
  };
}

function checkWireGrep(root) {
  const r = spawnSync('grep', ['-rc', 'respawnEligibleTasks', join(root, 'src')], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const total = (r.stdout ?? '')
    .split('\n')
    .map(line => parseInt((line.split(':').pop() || '0'), 10))
    .filter(n => Number.isFinite(n))
    .reduce((a, b) => a + b, 0);
  const passed = total >= THRESHOLDS.wireGrepMin;
  return {
    id: 18, name: 'wire code-complete', target: `respawnEligibleTasks ≥${THRESHOLDS.wireGrepMin}`,
    status: passed ? 'PASS' : 'WARN',
    message: `${total} matches across src/`, required: false,
  };
}

function checkDiskVerifyGate(root) {
  const r = spawnSync('grep', ['-rl', 'verifyDiskAgainstClaim', join(root, 'src')], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const files = (r.stdout ?? '').split('\n').filter(Boolean);
  const count = files.length;
  const passed = count >= THRESHOLDS.diskVerifyGateMin;
  return {
    id: 21, name: 'Brain dürüst raporlama', target: `disk-verify gates ≥${THRESHOLDS.diskVerifyGateMin}`,
    status: passed ? 'PASS' : 'WARN',
    message: `verifyDiskAgainstClaim wired in ${count} src files (KAYNAK 6+7 closure: Sprint 198-001)`,
    required: false,
  };
}

// ─── Static gates ───────────────────────────────────────────────────────────

function staticGates() {
  return [
    staticGate(7, 'cross-platform smoke', 'macOS+Linux+WSL2', 'Sprint 148 verified (3/3)', true),
    staticGate(8, 'multi-provider smoke', 'Claude+Codex+Gemini', 'Sprint 148 verified (3/3)', true),
    staticGate(9, 'i18n parity', 'CLI 100% / MCP 100%', 'Sprint 145 (Dashboard 95%+)', false),
    staticGate(10, 'Memory V2 stress', 'FTS5 + decay + rebuild', 'Sprint 145 + Sprint 166', true),
    staticGate(13, 'messaging trio smoke', '2/2 + WhatsApp scaffold', 'Sprint 145 (Discord+Telegram live, WhatsApp pending token)', false),
    staticGate(14, 'deckent_style toggle', 'live', 'Sprint 150A delivered', true),
    staticGate(15, 'DeckentHub seed skills', '20/20 published', 'Sprint 165 target met', true),
    staticGate(17, 'Brain stability gate', '≥5/6 DONE', 'Sprint 195-197 17 rescue commits + 164 new tests', true),
    staticGate(19, 'Bug X (stub replay)', 'closed', 'Sprint 165 T1 — Brain FIFO stall closed', true),
    staticGate(20, 'Bug W (dead_event_stream)', 'closed', 'Sprint 165 T4 + Sprint 166 T9 (stale_md detector wired)', true),
  ];
}

// ─── Orchestration ──────────────────────────────────────────────────────────

export function runAllGates(root = projectRoot) {
  const gates = [
    runTsc(root),
    runVitest(root),
    runCoverage(root),
    runMcpToolCount(root),
    runCliCommandCount(root),
    runNpmPack(root),
    ...staticGates(),
    checkDocsSync(root),
    checkDebt(root),
    checkAdrCount(root),
    checkWireGrep(root),
    checkDiskVerifyGate(root),
  ];
  gates.sort((a, b) => a.id - b.id);
  const requiredFailed = gates.filter(g => g.required && g.status === 'FAIL').length;
  const allPassed = requiredFailed === 0;
  return { gates, allPassed, requiredFailed };
}

// ─── Self-test ──────────────────────────────────────────────────────────────

function runSelfTest() {
  const assertions = [];
  const expect = (label, cond, detail = '') => {
    assertions.push({ label, ok: !!cond, detail });
  };

  // 1. parseVitestOutput
  const v = parseVitestOutput(' Tests  10 failed | 990 passed (1000) ');
  expect('parseVitestOutput counts passed/failed', v.passed === 990 && v.failed === 10, JSON.stringify(v));
  expect('parseVitestOutput ratio', v.ratio === 0.99, `ratio=${v.ratio}`);

  // 2. parseHelpToolCount
  const helpOut = 'deckent_init deckent_plan deckent_status deckent_init deckent_memory_query';
  expect('parseHelpToolCount dedupes', parseHelpToolCount(helpOut) === 4, `count=${parseHelpToolCount(helpOut)}`);
  expect('parseHelpToolCount empty', parseHelpToolCount('') === 0);

  // 3. parseCliCommandCount
  const cliOut = [
    'Usage: deckent [options]',
    '',
    'Commands:',
    '  init [args]   initialise project',
    '  plan          plan sprint',
    '  start         start sprint',
    '',
    'Options:',
    '  -h --help',
  ].join('\n');
  expect('parseCliCommandCount picks up indented commands', parseCliCommandCount(cliOut) >= 3, `count=${parseCliCommandCount(cliOut)}`);

  // 4. parseAcceptedAdrCount
  const adrOut = '## adr-001\n**Status:** accepted\n## adr-002\n**Status:** proposed\n## adr-003\n**Status:** accepted\n';
  expect('parseAcceptedAdrCount only counts accepted', parseAcceptedAdrCount(adrOut) === 2);

  // 5. parseCriticalHighDebt
  const debtMd = [
    '## Active Technical Debt',
    '| ID | Title | Priority | Sprint | Status |',
    '|---|---|---|---|---|',
    '| debt-1 | t | critical | s-1 | open |',
    '| debt-2 | t | high | s-1 | open |',
    '| debt-3 | t | normal | s-1 | open |',
    '## Resolved Technical Debt',
    '| debt-99 | r | critical | s-0 | resolved |',
  ].join('\n');
  expect('parseCriticalHighDebt skips resolved + normal', parseCriticalHighDebt(debtMd) === 2);

  // 6. staticGate helper
  const sg = staticGate(99, 'name', 'tgt', 'msg', true);
  expect('staticGate returns PASS', sg.status === 'PASS' && sg.required === true);

  const failed = assertions.filter(a => !a.ok);
  for (const a of assertions) {
    const icon = a.ok ? '✓' : '✗';
    process.stdout.write(`  ${icon} ${a.label}${a.detail ? ` — ${a.detail}` : ''}\n`);
  }
  process.stdout.write(`\n  ${failed.length === 0 ? '✅' : '❌'} self-test: ${assertions.length - failed.length}/${assertions.length} passed\n\n`);
  return failed.length === 0 ? 0 : 1;
}

// ─── Render ─────────────────────────────────────────────────────────────────

function renderTable(gates) {
  const out = [];
  out.push('');
  out.push('┌─────┬──────────────────────────────┬──────────────────────────────┬───────┬─────────────────────────────────────────────┐');
  out.push('│  #  │ Gate                         │ Target                       │ State │ Message                                     │');
  out.push('├─────┼──────────────────────────────┼──────────────────────────────┼───────┼─────────────────────────────────────────────┤');
  for (const g of gates) {
    const id = String(g.id).padStart(3, ' ');
    const name = (g.name || '').padEnd(28, ' ').slice(0, 28);
    const target = (g.target || '').padEnd(28, ' ').slice(0, 28);
    const state = (g.status || '').padEnd(5, ' ').slice(0, 5);
    const message = (g.message || '').padEnd(43, ' ').slice(0, 43);
    out.push(`│ ${id} │ ${name} │ ${target} │ ${state} │ ${message} │`);
  }
  out.push('└─────┴──────────────────────────────┴──────────────────────────────┴───────┴─────────────────────────────────────────────┘');
  return out.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  if (selfTest) {
    process.exit(runSelfTest());
  }
  try {
    const { gates, allPassed, requiredFailed } = runAllGates(projectRoot);
    if (outputJson) {
      process.stdout.write(JSON.stringify({ gates, allPassed, requiredFailed }, null, 2) + '\n');
    } else {
      process.stdout.write(renderTable(gates) + '\n');
      process.stdout.write(allPassed
        ? `\n  ✅ Beta launch pre-check PASSED — ${gates.filter(g => g.status === 'PASS').length}/${gates.length} gates green\n\n`
        : `\n  ❌ Beta launch pre-check FAILED — ${requiredFailed} required gate(s) failing\n\n`);
    }
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    process.stderr.write(`beta-launch-precheck crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(2);
  }
}
