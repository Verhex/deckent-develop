#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd());
const auditRelative = 'docs/audits/ci-repair-2026-08-26';
const auditDir = resolve(root, auditRelative);
const baseSha = '5fd085737e4e2b918bf3c601f29c61d9d521b229';
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function text(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function digestFile(relativePath) {
  return digest(readFileSync(resolve(root, relativePath)));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function git(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr.trim()}`));
    });
  });
}

const required = [
  `${auditRelative}/CI-ROOT-REGISTER.md`,
  `${auditRelative}/TEST-SLIM-PROPOSAL.md`,
  `${auditRelative}/FINDINGS.md`,
  `${auditRelative}/verify-artifacts.mjs`,
  `${auditRelative}/HANDOFF.md`,
  'LANE-STATUS.md',
];

check(existsSync(resolve(root, 'package.json')), 'validator must run from repository root');
for (const path of required) {
  const absolute = resolve(root, path);
  check(existsSync(absolute), `missing required artifact: ${path}`);
  if (existsSync(absolute)) {
    check(statSync(absolute).isFile(), `required artifact is not a file: ${path}`);
    check(statSync(absolute).size >= 200, `required artifact unexpectedly small: ${path}`);
  }
}

const testFiles = walk(resolve(root, 'tests'))
  .map(path => relative(root, path).split('\\').join('/'))
  .filter(path => /\.test\.(?:ts|tsx|js|mjs)$/u.test(path))
  .sort();
const metadata = new Map();
let totalLines = 0;
let totalCalls = 0;
const bins = { lt80: 0, b80_199: 0, b200_499: 0, gte500: 0 };
const directories = new Map();

for (const path of testFiles) {
  const content = text(path);
  const lines = content.split(/\n/u).length - 1;
  const calls = (content.match(/\b(?:it|test)(?:\.(?:skip|skipIf|todo|concurrent|each))?\s*\(/gu) ?? []).length;
  metadata.set(path, { content, lines, calls });
  totalLines += lines;
  totalCalls += calls;
  if (lines < 80) bins.lt80 += 1;
  else if (lines < 200) bins.b80_199 += 1;
  else if (lines < 500) bins.b200_499 += 1;
  else bins.gte500 += 1;
  const layer = path.split('/')[1];
  const current = directories.get(layer) ?? { files: 0, lines: 0, calls: 0 };
  current.files += 1;
  current.lines += lines;
  current.calls += calls;
  directories.set(layer, current);
  check(path.startsWith('tests/'), `test escaped tests root: ${path}`);
  check(lines > 0, `empty test file: ${path}`);
}

check(testFiles.length === 2923, `test file count drift: ${testFiles.length}`);
check(totalLines === 718051, `test line count drift: ${totalLines}`);
check(totalCalls === 37791, `static test-call count drift: ${totalCalls}`);
check(JSON.stringify(bins) === JSON.stringify({ lt80: 384, b80_199: 1129, b200_499: 1211, gte500: 199 }), `size bins drift: ${JSON.stringify(bins)}`);
for (const [layer, expected] of Object.entries({
  orchestra: [748, 207981, 9480],
  core: [643, 153097, 9330],
  cli: [606, 136820, 7765],
  integration: [37, 13564, 430],
  unit: [4, 1135, 73],
  e2e: [29, 12512, 435],
})) {
  const observed = directories.get(layer);
  check(observed?.files === expected[0], `${layer} file count drift`);
  check(observed?.lines === expected[1], `${layer} line count drift`);
  check(observed?.calls === expected[2], `${layer} call count drift`);
}

const byBase = new Map();
for (const path of testFiles) {
  const key = basename(path).replace(/\.test\.(?:ts|tsx|js|mjs)$/u, '');
  const group = byBase.get(key) ?? [];
  group.push(path);
  byBase.set(key, group);
}
const duplicateBaseGroups = [...byBase.values()].filter(group => group.length > 1);
const crossLayer = new Set(duplicateBaseGroups
  .filter(group => new Set(group.map(path => path.split('/')[1])).size > 1)
  .flat());
const parity = new Set(testFiles.filter(path => /parity/iu.test(basename(path))));
const sameLayerActionable = new Set([...byBase.entries()].flatMap(([key, group]) => {
  const layers = new Set(group.map(path => path.split('/')[1]));
  return layers.size === 1 && group.length > 1 && key !== 'config' ? group : [];
}));
const fullSkip = new Set([
  'tests/docs/vitepress.test.ts',
  'tests/docs/readme-quality.test.ts',
  'tests/docs/no-stale-identity-refs.test.ts',
  'tests/docs/blueprint-current.test.ts',
]);
const envGated = new Set([
  'tests/e2e/docker-backend.test.ts',
  'tests/e2e/provider-smoke.test.ts',
]);
const categorySets = {
  integration: new Set(testFiles.filter(path => path.startsWith('tests/integration/'))),
  fullSkip,
  envGated,
  sameLayer: sameLayerActionable,
  unit: new Set(testFiles.filter(path => path.startsWith('tests/unit/'))),
  crossParity: new Set([...crossLayer, ...parity]),
  period: new Set(testFiles.filter(path => /(?:sprint[-_]?\d+|faz[-_]?\d+|f101\d|w[-_]?\d+|20\d{2}[-_]?[01]\d[-_]?[0-3]\d)/iu.test(basename(path)))),
  wire: new Set(testFiles.filter(path => /wire/iu.test(basename(path)))),
  superBloat: new Set(testFiles.filter(path => metadata.get(path).lines >= 500)),
};
const seen = new Set();
const disjoint = {};
for (const [name, set] of Object.entries(categorySets)) {
  const current = [...set].filter(path => !seen.has(path));
  current.forEach(path => seen.add(path));
  disjoint[name] = current.length;
}
disjoint.remainder = testFiles.length - seen.size;

check(duplicateBaseGroups.length === 74, `duplicate basename group drift: ${duplicateBaseGroups.length}`);
check(crossLayer.size === 124, `cross-layer file drift: ${crossLayer.size}`);
check(parity.size === 36, `parity filename drift: ${parity.size}`);
check(new Set([...crossLayer, ...parity]).size === 160, 'cross/parity union drift');
check(sameLayerActionable.size === 36, `actionable same-layer file drift: ${sameLayerActionable.size}`);
check(categorySets.period.size === 28, `raw period-pin drift: ${categorySets.period.size}`);
check(categorySets.wire.size === 117, `raw wire count drift: ${categorySets.wire.size}`);
check([...categorySets.wire].reduce((sum, path) => sum + metadata.get(path).lines, 0) === 28831, 'wire line count drift');
check([...categorySets.wire].reduce((sum, path) => sum + metadata.get(path).calls, 0) === 1070, 'wire call count drift');
check(categorySets.superBloat.size === 199, `raw super-bloat count drift: ${categorySets.superBloat.size}`);
check(JSON.stringify(disjoint) === JSON.stringify({ integration: 37, fullSkip: 4, envGated: 2, sameLayer: 36, unit: 4, crossParity: 157, period: 27, wire: 115, superBloat: 165, remainder: 2376 }), `disjoint classification drift: ${JSON.stringify(disjoint)}`);
check(Object.values(disjoint).reduce((sum, value) => sum + value, 0) === 2923, 'disjoint classification does not close');

const byteHashes = new Map();
const normalizedHashes = new Map();
for (const path of testFiles) {
  const content = metadata.get(path).content;
  const normalized = content
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '')
    .replace(/\s+/gu, '');
  for (const [map, value] of [[byteHashes, content], [normalizedHashes, normalized]]) {
    const hash = digest(value);
    const group = map.get(hash) ?? [];
    group.push(path);
    map.set(hash, group);
  }
}
check([...byteHashes.values()].every(group => group.length === 1), 'byte-identical test files discovered');
check([...normalizedHashes.values()].every(group => group.length === 1), 'normalized-identical test files discovered');

const exactCandidates = {
  'tests/docs/vitepress.test.ts': [243, 38],
  'tests/docs/readme-quality.test.ts': [90, 5],
  'tests/docs/no-stale-identity-refs.test.ts': [55, 6],
  'tests/docs/blueprint-current.test.ts': [33, 1],
  'tests/docs/readme.test.ts': [106, 13],
  'tests/core/config-sprint063.test.ts': [234, 11],
  'tests/core/config-sprint064.test.ts': [217, 11],
};
for (const [path, [lines, calls]] of Object.entries(exactCandidates)) {
  check(metadata.has(path), `retirement candidate missing: ${path}`);
  check(metadata.get(path)?.lines === lines, `retirement candidate line drift: ${path}`);
  check(metadata.get(path)?.calls === calls, `retirement candidate call drift: ${path}`);
}
check(metadata.get('tests/docs/vitepress.test.ts').content.includes('describe.skip'), 'vitepress is no longer full-suite skipped');
for (const path of [...fullSkip].filter(path => path !== 'tests/docs/vitepress.test.ts')) {
  const content = metadata.get(path).content;
  const active = (content.match(/^\s*(?:it|test)\s*\(/gmu) ?? []).length;
  check(active === 0, `full-skip candidate gained active tests: ${path}`);
}

const longest = testFiles.concat((await git(['ls-files'])).split(/\n/u).filter(Boolean))
  .reduce((winner, path) => path.length > winner.length ? path : winner, '');
check(longest.length === 295, `longest tracked path drift: ${longest.length}`);
check(longest === '.deckent/provider-execution-observation-reconciliation/receipts/v1/6xfmarozvydadjajc6vedauzxnqcoduas7tattjiretdilk5ku4a/5f2xasf2jqdswn3wr2ddaml7pyj7aabtbue6psyjrtz45tv5h4ja/3trsiujgzaljltbwypp367hant6z5ql7hyctaauhkx4paywm2q7q/44f0d8ce7a5893b16b85fd39820b679c717096f273230d1ca059aad025773312.json', 'longest tracked path identity drift');

const proposedFixture = 'task-xv-1787682688606.json';
check(/^task-([\w-]{1,100})\.json$/u.test(proposedFixture), 'proposed Secret Scan fixture is not canonical');
check(!/sk-(?:proj-)?[A-Za-z0-9_-]{40,}/gu.test(proposedFixture), 'proposed Secret Scan fixture still matches OPENAI_KEY');
check(text('scripts/security/secret-baseline.mjs').includes("regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g"), 'OPENAI_KEY evidence regex drift');
check(text('tests/core/task-artifact-classifier.test.ts').includes('task-xv-1787682688606-bcaa9b15-1d54-4836-8bce-b5a3f76cfe72.json'), 'Phase-A fixture freeze violated or evidence drifted');

const ciWorkflow = text('.github/workflows/ci.yml');
const crossWorkflow = text('.github/workflows/cross-platform-e2e.yml');
check((ciWorkflow.match(/GIT_CONFIG_KEY_0:\s*core\.longpaths/gu) ?? []).length === 1, 'CI Windows longpaths injection count mismatch');
check((crossWorkflow.match(/GIT_CONFIG_KEY_0:\s*core\.longpaths/gu) ?? []).length === 3, 'Cross workflow longpaths injection count mismatch');
check((crossWorkflow.match(/if: runner\.os == 'Linux'/gu) ?? []).length >= 2, 'Linux guarded clean steps missing');
check(crossWorkflow.includes('Build without clean on fresh macOS checkout'), 'macOS clean-less build missing');
check(crossWorkflow.includes('Build dist + dashboard without clean (macOS/Windows fresh checkout)'), 'packed clean-less build missing');
check((crossWorkflow.match(/if \[ -e dist \]/gu) ?? []).length === 2, 'fresh-checkout dist guards mismatch');
check((crossWorkflow.match(/npx tsc/gu) ?? []).length === 2, 'clean-less tsc payload count mismatch');
check((crossWorkflow.match(/node scripts\/copy-assets\.mjs/gu) ?? []).length === 2, 'clean-less copy payload count mismatch');
check(!/DECKENT_CLEAN_[A-Z_]+:\s*['"]?1/gu.test(crossWorkflow), 'workflow introduced a clean authority env bypass');

const rootRegister = text(`${auditRelative}/CI-ROOT-REGISTER.md`);
for (const phrase of ['CI-R001', 'CI-R002', 'CI-R003', '32956544242', '32956544218', '32956544285', '70 benzersiz kırmızı test dosyası']) {
  check(rootRegister.includes(phrase), `CI root register missing: ${phrase}`);
}
const proposal = text(`${auditRelative}/TEST-SLIM-PROPOSAL.md`);
const retireIds = [...proposal.matchAll(/\| (TSR-\d{3}) /gu)].map(match => match[1]);
const mergeIds = [...proposal.matchAll(/\| (TSM-\d{3}) /gu)].map(match => match[1]);
check(JSON.stringify(retireIds) === JSON.stringify(Array.from({ length: 7 }, (_, i) => `TSR-${String(i + 1).padStart(3, '0')}`)), `retirement IDs drift: ${retireIds.join(',')}`);
check(JSON.stringify(mergeIds) === JSON.stringify(Array.from({ length: 18 }, (_, i) => `TSM-${String(i + 1).padStart(3, '0')}`)), `merge IDs drift: ${mergeIds.join(',')}`);
for (const phrase of ['GEREKÇE', 'Kapsama-kanıtı', 'Risk-notu', '2.923 → ≤2.861', '37.791', '718.051', 'byte-identical dosya sayısı **0**', 'assertion weakening yasak']) {
  check(proposal.includes(phrase), `proposal missing required phrase: ${phrase}`);
}

const findings = text(`${auditRelative}/FINDINGS.md`);
for (const id of ['CI-F001', 'CI-F002', 'CI-F003']) check(findings.includes(`## ${id}`), `finding missing: ${id}`);
for (const anchor of ['src/core/file-lock.ts:1860-1915', 'scripts/clean.mjs:7338-7347', 'receipt-store.ts:205-206', '295 karakter', '70 benzersiz test dosyası']) {
  check(findings.includes(anchor), `finding evidence anchor missing: ${anchor}`);
}

let handoff;
try {
  const handoffText = text(`${auditRelative}/HANDOFF.md`);
  const match = handoffText.match(/<!-- HANDOFF-JSON\n([\s\S]*?)\nHANDOFF-JSON -->/u);
  check(match !== null, 'handoff machine block missing');
  handoff = match ? JSON.parse(match[1]) : undefined;
  check(handoff?.schemaVersion === 1, 'handoff schemaVersion must be 1');
  check(handoff?.lane === 'lane/ci-repair-20260826', 'handoff lane mismatch');
  check(handoff?.baseSha === baseSha, 'handoff baseSha mismatch');
  check(/^[a-f0-9]{40}$/u.test(handoff?.headSha ?? ''), 'handoff headSha must be full SHA');
  check(handoff?.status === 'READY_FOR_OWNER_REVIEW', 'handoff status mismatch');
  check(handoff?.phase === 'A', 'handoff phase must remain A');
  check(handoff?.phaseBLease === 'INACTIVE', 'handoff must not claim Phase-B lease');
  check(handoff?.testFilesChanged === 0, 'handoff must report zero test-file changes');
  check(handoff?.proposalCounts?.retirementRows === 7, 'handoff retirement count mismatch');
  check(handoff?.proposalCounts?.mergeRows === 18, 'handoff merge count mismatch');
} catch (error) {
  failures.push(`handoff parse failed: ${error instanceof Error ? error.message : String(error)}`);
}

for (const name of ['CI-ROOT-REGISTER.md', 'TEST-SLIM-PROPOSAL.md', 'FINDINGS.md', 'verify-artifacts.mjs']) {
  const expected = handoff?.artifactDigests?.[name];
  check(typeof expected === 'string' && /^[a-f0-9]{64}$/u.test(expected), `handoff artifact digest missing: ${name}`);
  if (typeof expected === 'string') check(digestFile(`${auditRelative}/${name}`) === expected, `handoff artifact digest drift: ${name}`);
}

try {
  const changed = (await git(['diff', '--name-only', `${baseSha}...HEAD`])).split(/\n/u).filter(Boolean);
  const allowed = path => path.startsWith('.github/workflows/')
    || path.startsWith(`${auditRelative}/`)
    || path === 'LANE-STATUS.md';
  for (const path of changed) check(allowed(path), `Faz-A write allowlist violation: ${path}`);
  check(changed.some(path => path === '.github/workflows/ci.yml'), 'CI workflow absent from branch diff');
  check(changed.some(path => path === '.github/workflows/cross-platform-e2e.yml'), 'Cross workflow absent from branch diff');
  check(!changed.some(path => path === '.github/workflows/coverage.yml'), 'coverage workflow changed without a Windows job');
  check(!changed.some(path => path.startsWith('tests/')), 'tests changed during Phase A');
  check(!changed.some(path => path.startsWith('src/')), 'src changed during Phase A');
  check(!changed.some(path => path.startsWith('scripts/')), 'scripts changed during Phase A');
  check(!changed.some(path => path === 'vitest.config.ts'), 'vitest config changed during Phase A');
  check((await git(['status', '--porcelain'])) === '', 'worktree must be clean when sealing verification');
  if (handoff?.headSha) await git(['merge-base', '--is-ancestor', handoff.headSha, 'HEAD']);
  check(true, 'handoff content head is ancestor of settlement head');
} catch (error) {
  failures.push(`git verification failed: ${error instanceof Error ? error.message : String(error)}`);
}

const laneStatus = text('LANE-STATUS.md');
for (const phrase of ['READY_FOR_OWNER_REVIEW', 'lane/ci-repair-20260826', 'Phase-B lease: `INACTIVE`', 'Test files changed: 0', 'Retirement rows: 7', 'Merge rows: 18']) {
  check(laneStatus.includes(phrase), `LANE-STATUS missing: ${phrase}`);
}

for (const path of required) {
  if (!existsSync(resolve(root, path))) continue;
  const content = text(path);
  const unsettledMarkers = [
    `PENDING_${'SHA'}`,
    `PENDING_${'DIGEST'}`,
    ['TO', 'BE', 'SETTLED'].join('_'),
    ['PLACE', 'HOLDER'].join(''),
  ];
  check(!unsettledMarkers.some(marker => content.toUpperCase().includes(marker)), `unsettled marker: ${path}`);
}

if (failures.length > 0) {
  console.error(`FAIL ${checks - failures.length}/${checks} checks passed; ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks}/${checks} checks`);
  console.log(`inventory ${testFiles.length} files / ${totalLines} lines / ${totalCalls} static calls`);
  console.log(`proposal ${retireIds.length} retirement rows / ${mergeIds.length} merge rows`);
  console.log(`baseSha ${baseSha}`);
}
