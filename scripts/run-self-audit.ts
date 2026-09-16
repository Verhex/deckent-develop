#!/usr/bin/env node
/**
 * scripts/run-self-audit.ts
 *
 * Standalone Brain self-audit runner — Sprint 165 Task 3 (Bug Z fix).
 *
 * Purpose: produce a vitest gate result that agrees with what the worker
 * sees when it runs `npx vitest run` directly. Diverges from sprint-finalizer's
 * `runSelfAuditGate` (which routes through `baseline-tracker::parseVitestOutput`
 * whose loose regex misreads Test Files line) by routing through
 * `auditor::gatherCiBaseline` (JSON reporter preferred, strict Tests-line
 * footer fallback).
 *
 * Usage:
 *   npx tsx scripts/run-self-audit.ts                # current sprint id from config
 *   npx tsx scripts/run-self-audit.ts --sprint sprint-165
 *   npx tsx scripts/run-self-audit.ts --write-gate   # also write .deckent/<sprint>-gate.json
 *
 * Exit codes:
 *   0   PASS         — delta.fail <= 0
 *   2   GATE_FAILURE — delta.fail > 0 (regression introduced)
 *   3   INCONCLUSIVE — vitest subprocess failed (SPAWN_FAIL / PARSE_FAIL)
 *   1   internal error (script bug, unreadable config, etc.)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { runVitestAuditGate, type VitestAuditGateResult } from '../src/monitor/auditor.js';

interface CliArgs {
  sprintId: string | null;
  writeGate: boolean;
  json: boolean;
  root: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { sprintId: null, writeGate: false, json: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sprint' && argv[i + 1]) {
      args.sprintId = argv[++i]!;
    } else if (a === '--write-gate') {
      args.writeGate = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--root' && argv[i + 1]) {
      args.root = resolve(argv[++i]!);
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: run-self-audit [--sprint <id>] [--write-gate] [--json] [--root <path>]');
      process.exit(0);
    }
  }
  return args;
}

function resolveSprintId(root: string, override: string | null): string {
  if (override) return override;
  // Try .deckent/config.json -> last_sprint_id
  const configPath = join(root, '.deckent', 'config.json');
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { last_sprint_id?: string };
      if (cfg.last_sprint_id) return cfg.last_sprint_id;
    } catch { /* ignore */ }
  }
  return 'sprint-current';
}

function formatHumanReport(sprintId: string, result: VitestAuditGateResult): string {
  const lines: string[] = [];
  lines.push(`Sprint Audit — ${sprintId}`);
  lines.push(`  vitest.status        ${result.status}`);
  lines.push(`  vitest.gateStatus    ${result.gateStatus}`);
  lines.push('');
  lines.push('  current counts:');
  lines.push(`    testCount   ${result.current.testCount}`);
  lines.push(`    testPassed  ${result.current.testPassed}`);
  lines.push(`    testFailed  ${result.current.testFailed}`);
  lines.push(`    testSkipped ${result.current.testSkipped}`);
  if (result.baseline) {
    lines.push('  baseline counts:');
    lines.push(`    testCount   ${result.baseline.testCount}`);
    lines.push(`    testPassed  ${result.baseline.testPassed}`);
    lines.push(`    testFailed  ${result.baseline.testFailed}`);
    lines.push(`    testSkipped ${result.baseline.testSkipped}`);
  } else {
    lines.push('  baseline: (none — delta == current)');
  }
  lines.push('  delta:');
  lines.push(`    count   ${result.delta.count >= 0 ? '+' : ''}${result.delta.count}`);
  lines.push(`    pass    ${result.delta.pass >= 0 ? '+' : ''}${result.delta.pass}`);
  lines.push(`    fail    ${result.delta.fail >= 0 ? '+' : ''}${result.delta.fail}`);
  lines.push(`    skipped ${result.delta.skipped >= 0 ? '+' : ''}${result.delta.skipped}`);
  return lines.join('\n');
}

function writeGateJson(root: string, sprintId: string, result: VitestAuditGateResult): string {
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) mkdirSync(deckentDir, { recursive: true });
  const gatePath = join(deckentDir, `${sprintId}-audit-gate.json`);
  const payload = {
    sprintId,
    vitest: {
      status: result.gateStatus,
      invocation: result.status,
      delta: {
        files: 0,
        pass: result.delta.pass,
        fail: result.delta.fail,
        skipped: result.delta.skipped,
      },
      current: result.current,
      baseline: result.baseline,
    },
    overallGate: result.gateStatus,
    source: 'scripts/run-self-audit.ts',
    timestamp: new Date().toISOString(),
  };
  writeFileSync(gatePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  return gatePath;
}

function exitCodeFor(result: VitestAuditGateResult): number {
  if (result.gateStatus === 'PASS') return 0;
  if (result.gateStatus === 'INCONCLUSIVE') return 3;
  return 2;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sprintId = resolveSprintId(args.root, args.sprintId);

  const result = await runVitestAuditGate({
    projectRoot: args.root,
    sprintId,
  });

  if (args.json) {
    console.log(JSON.stringify({ sprintId, ...result }, null, 2));
  } else {
    console.log(formatHumanReport(sprintId, result));
  }

  if (args.writeGate) {
    const path = writeGateJson(args.root, sprintId, result);
    if (!args.json) console.log(`\nwrote ${path}`);
  }

  process.exit(exitCodeFor(result));
}

main().catch((err) => {
  console.error('run-self-audit: fatal error', err);
  process.exit(1);
});
