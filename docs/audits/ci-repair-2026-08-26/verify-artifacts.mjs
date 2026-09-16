#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const auditRoot = 'docs/audits/ci-repair-2026-08-26';
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function git(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`git ${args.join(' ')} exited ${String(code)}: ${stderr.trim()}`));
    });
  });
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

check(existsSync(resolve(root, 'package.json')), 'run from repository root');

const required = [
  `${auditRoot}/CI-ROOT-REGISTER.md`,
  `${auditRoot}/TEST-SLIM-PROPOSAL.md`,
  `${auditRoot}/FINDINGS.md`,
  `${auditRoot}/HANDOFF.md`,
  `${auditRoot}/PHASE-B-EQUALITY.json`,
  `${auditRoot}/tsm-merge-plan.json`,
  `${auditRoot}/wire-merge-plan.json`,
  `${auditRoot}/verify-phase-b-equality.mjs`,
  `${auditRoot}/verify-artifacts.mjs`,
  'LANE-STATUS.md',
];
for (const path of required) check(existsSync(resolve(root, path)), `missing artifact: ${path}`);

const testFiles = walk(resolve(root, 'tests'))
  .map((path) => relative(root, path).replaceAll('\\', '/'))
  .filter((path) => /\.test\.(?:ts|tsx|js|mjs)$/u.test(path))
  .sort();
let lines = 0;
let calls = 0;
for (const path of testFiles) {
  const content = read(path);
  lines += content.split(/\n/u).length - 1;
  calls += (content.match(/\b(?:it|test)(?:\.(?:skip|skipIf|todo|concurrent|each))?\s*\(/gu) ?? []).length;
}
const wireFiles = testFiles.filter((path) => /wire/iu.test(basename(path)));
const dashboardFiles = testFiles.filter((path) => path.startsWith('tests/dashboard/'));
check(testFiles.length === 2859, `Phase-B test file count drift: ${testFiles.length}`);
check(lines === 716502, `Phase-B test line count drift: ${lines}`);
check(calls === 37733, `Phase-B static call count drift: ${calls}`);
check(wireFiles.length === 78, `wire target drift: ${wireFiles.length}`);
check(dashboardFiles.length === 82, `dashboard test count drift: ${dashboardFiles.length}`);

const tsm = json(`${auditRoot}/tsm-merge-plan.json`);
const wire = json(`${auditRoot}/wire-merge-plan.json`);
const equality = json(`${auditRoot}/PHASE-B-EQUALITY.json`);
check(tsm.length === 18, `TSM plan count drift: ${tsm.length}`);
check(wire.length === 39, `wire plan count drift: ${wire.length}`);
check(equality.records === 57, `equality record count drift: ${equality.records}`);
check(equality.passed === 57 && equality.failed === 0, 'equality result is not 57/57 PASS');
check(equality.checks.reduce((sum, item) => sum + item.before.tests, 0) === 1305, 'merged title inventory drift');
check(equality.checks.reduce((sum, item) => sum + item.before.assertions, 0) === 2915, 'merged assertion inventory drift');
for (const record of equality.checks) {
  check(record.passed === true, `${record.id} equality failed`);
  const retiredSources = record.sources.filter((path) => path !== record.target);
  check(retiredSources.every((path) => !existsSync(resolve(root, path))), `${record.id} retired source still exists`);
  check(existsSync(resolve(root, record.target)), `${record.id} live target missing`);
  check(Object.values(record.checks).every(Boolean), `${record.id} has a failed equality dimension`);
}

for (const path of [
  'tests/docs/vitepress.test.ts',
  'tests/docs/readme-quality.test.ts',
  'tests/docs/no-stale-identity-refs.test.ts',
  'tests/docs/blueprint-current.test.ts',
  'tests/docs/readme.test.ts',
  'tests/core/config-sprint063.test.ts',
  'tests/core/config-sprint064.test.ts',
]) check(!existsSync(resolve(root, path)), `approved TSR source still exists: ${path}`);
for (const [path, phrase] of [
  ['tests/docs/cli-reference.test.ts', 'rejects the retired project-identity path'],
  ['tests/docs/doc-honesty.test.ts', 'retired anti-X framing'],
  ['tests/docs/readme-number-truth.test.ts', 'without Turkish section headings'],
  ['tests/core/config-migration.test.ts', 'TSR-006'],
  ['tests/core/config-migration.test.ts', 'TSR-007'],
]) check(read(path).includes(phrase), `TSR assertion target missing: ${path} :: ${phrase}`);

const classifier = read('tests/core/task-artifact-classifier.test.ts');
check(classifier.includes('task-xv-1787682688606.json'), 'CI-R001 canonical fixture missing');
check(!classifier.includes('bcaa9b15-1d54-4836-8bce-b5a3f76cfe72'), 'CI-R001 secret-like fixture remains');
check(read('scripts/security/secret-baseline.mjs').includes("regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g"), 'secret regex was weakened');

const handoffText = read(`${auditRoot}/HANDOFF.md`);
const handoffMatch = handoffText.match(/<!-- HANDOFF-JSON\n([\s\S]*?)\nHANDOFF-JSON -->/u);
check(handoffMatch !== null, 'HANDOFF machine block missing');
if (handoffMatch) {
  const handoff = JSON.parse(handoffMatch[1]);
  check(handoff.schemaVersion === 2, 'HANDOFF schemaVersion must be 2');
  check(handoff.lane === 'lane/ci-repair-20260826', 'HANDOFF lane mismatch');
  check(handoff.phase === 'B', 'HANDOFF phase mismatch');
  check(handoff.phaseBLease === 'ACTIVE', 'HANDOFF lease mismatch');
  check(handoff.testInventory?.before === 2923 && handoff.testInventory?.after === 2859, 'HANDOFF inventory mismatch');
  check(handoff.mergeEquality === '57/57 PASS', 'HANDOFF equality mismatch');
  check(handoff.deliveryStatus === 'HOLD_ADMISSION', 'HANDOFF must honestly preserve admission HOLD');
}

const allowed = (path) => path.startsWith('.github/workflows/')
  || path.startsWith('tests/')
  || path === 'vitest.config.ts'
  || path === 'scripts/security/secret-baseline.mjs'
  || path.startsWith(`${auditRoot}/`)
  || path === 'LANE-STATUS.md';
const trackedChanges = (await git(['diff', '--name-only', 'origin/main'])).split(/\n/u).filter(Boolean);
const untrackedChanges = (await git(['ls-files', '--others', '--exclude-standard'])).split(/\n/u).filter(Boolean);
for (const path of new Set([...trackedChanges, ...untrackedChanges])) {
  check(allowed(path), `Phase-B write allowlist violation: ${path}`);
  check(!path.startsWith('src/'), `src mutation forbidden: ${path}`);
  check(path !== '.secrets-baseline', '.secrets-baseline mutation forbidden');
}

for (const [path, phrases] of [
  [`${auditRoot}/CI-ROOT-REGISTER.md`, ['CI-R001', 'F1', 'F2', 'F3', 'F4', 'F5']],
  [`${auditRoot}/TEST-SLIM-PROPOSAL.md`, ['TSR-001', 'TSR-007', 'TSM-001', 'TSM-018', '117', '78']],
  [`${auditRoot}/FINDINGS.md`, ['CI-F001', 'CI-F002', 'CI-F004', 'CI-F005']],
  ['LANE-STATUS.md', ['Phase: `B`', 'Phase-B lease: `ACTIVE`', 'HOLD_ADMISSION']],
]) for (const phrase of phrases) check(read(path).includes(phrase), `${path} missing ${phrase}`);

if (failures.length > 0) {
  console.error(`FAIL ${checks - failures.length}/${checks}; ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks}/${checks} checks`);
  console.log(`inventory ${testFiles.length} files / ${lines} lines / ${calls} static calls / ${wireFiles.length} wire`);
  console.log(`merge equality ${equality.passed}/${equality.records} PASS / 1305 titles / 2915 assertions`);
}
