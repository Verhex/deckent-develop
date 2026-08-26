#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const auditRelative = 'docs/audits/approval-surface-2026-08-26';
const auditDir = resolve(root, auditRelative);
const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function text(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestFile(relativePath) {
  return digestBytes(readFileSync(resolve(root, relativePath)));
}

const required = [
  `${auditRelative}/SURFACE-MATRIX.md`,
  `${auditRelative}/DRIFT-REGISTER.md`,
  `${auditRelative}/COMPLETION-PLAN.md`,
  `${auditRelative}/VERIFICATION.md`,
  `${auditRelative}/CRITIC-REVIEW.md`,
  `${auditRelative}/EVIDENCE-MANIFEST.json`,
  `${auditRelative}/HANDOFF.md`,
  `${auditRelative}/verify-artifacts.mjs`,
  'LANE-STATUS.md',
];

for (const relativePath of required) {
  const absolutePath = resolve(root, relativePath);
  check(existsSync(absolutePath), `missing required artifact: ${relativePath}`);
  if (existsSync(absolutePath)) {
    check(statSync(absolutePath).isFile(), `required artifact is not a file: ${relativePath}`);
    check(statSync(absolutePath).size >= 100, `artifact is unexpectedly small: ${relativePath}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(text(`${auditRelative}/EVIDENCE-MANIFEST.json`));
  check(manifest.schemaVersion === 1, 'evidence manifest schemaVersion must be 1');
  check(manifest.audit === 'approval-surface-2026-08-26', 'evidence manifest audit id mismatch');
  check(/^[a-f0-9]{40}$/u.test(manifest.baseSha), 'evidence baseSha must be a full git SHA');
} catch (error) {
  failures.push(`evidence manifest parse failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (manifest?.sourceFiles && typeof manifest.sourceFiles === 'object') {
  const sourceEntries = Object.entries(manifest.sourceFiles);
  check(sourceEntries.length >= 40, `source evidence coverage too small: ${sourceEntries.length}`);
  for (const [relativePath, expectedDigest] of sourceEntries) {
    const absolutePath = resolve(root, relativePath);
    check(existsSync(absolutePath), `manifest source missing: ${relativePath}`);
    if (existsSync(absolutePath)) {
      check(digestFile(relativePath) === expectedDigest, `source digest drift: ${relativePath}`);
    }
  }
} else {
  failures.push('evidence manifest sourceFiles object missing');
}

const expectedWorkIds = ['4050', '4053', '4054', '4056', '4060', '475', '4130', '4210', '6120'];
const masterLines = text('docs/MASTER-PLAN.md').split(/\r?\n/u);
for (const workId of expectedWorkIds) {
  const matches = masterLines.filter(line => line.startsWith(`| ${workId} |`));
  check(matches.length === 1, `MASTER WorkID ${workId} must resolve exactly once; got ${matches.length}`);
  if (matches.length === 1) {
    const expectedDigest = manifest?.masterWorkItems?.[workId];
    check(typeof expectedDigest === 'string' && /^[a-f0-9]{64}$/u.test(expectedDigest), `WorkID ${workId} digest missing`);
    check(digestBytes(matches[0]) === expectedDigest, `MASTER WorkID ${workId} content digest drift`);
  }
}

const matrix = text(`${auditRelative}/SURFACE-MATRIX.md`);
const matrixRows = matrix.match(/^\|\s*\d+\s*\|/gmu) ?? [];
check(matrixRows.length === 16, `surface matrix must contain exactly 16 numbered rows; got ${matrixRows.length}`);
for (const phrase of ['Protected decision', 'Consent/acknowledgement', 'MCP intentional negative-space', 'FAIL']) {
  check(matrix.includes(phrase), `surface matrix missing required phrase: ${phrase}`);
}

const drift = text(`${auditRelative}/DRIFT-REGISTER.md`);
const findingIds = [...drift.matchAll(/^## (APR-\d{3})\b/gmu)].map(match => match[1]);
const expectedFindingIds = Array.from({ length: 9 }, (_, index) => `APR-${String(index + 1).padStart(3, '0')}`);
check(JSON.stringify(findingIds) === JSON.stringify(expectedFindingIds), `finding IDs must be exactly APR-001..APR-009; got ${findingIds.join(',')}`);
check((drift.match(/\*\*Severity \/ disposition:\*\* CRITICAL/gmu) ?? []).length === 3, 'critical finding count must be 3');
check((drift.match(/\*\*Severity \/ disposition:\*\* HIGH/gmu) ?? []).length === 6, 'high finding count must be 6');
for (const phrase of ['Ana-şerit exact diff', 'Kabul kanıtı', 'CFG-004', 'CFG-017']) {
  check(drift.includes(phrase), `drift register missing required phrase: ${phrase}`);
}

const completion = text(`${auditRelative}/COMPLETION-PLAN.md`);
for (const wave of ['W0', 'W1', 'W2', 'W3', 'W4', 'W5']) {
  check(completion.includes(`### ${wave} —`), `completion plan missing ${wave}`);
}
for (const workId of expectedWorkIds) {
  check(completion.includes(`| ${workId} `), `completion plan missing WorkID ${workId}`);
}
check(completion.includes('Owner admission gereken semantik kararlar'), 'completion plan missing owner-admission section');
check(!/yeni ledger row gerekir/iu.test(completion), 'completion plan proposes a new ledger row');

const verification = text(`${auditRelative}/VERIFICATION.md`);
for (let question = 1; question <= 6; question += 1) {
  check(verification.includes(`Q${question}: ANSWERED`), `verification missing exact answer marker Q${question}`);
}
for (const phrase of ['HOLD / koşulmayan kanıtlar', 'Production code', 'Different-provider XVerify']) {
  check(verification.includes(phrase), `verification missing honesty marker: ${phrase}`);
}

const critic = text(`${auditRelative}/CRITIC-REVIEW.md`);
check(critic.includes('Current product closure:** **NO-GO'), 'critic must carry current product NO-GO');
check(critic.includes('Audit artifact quality:** **PASS WITH RUNTIME HOLDS'), 'critic must carry artifact verdict');
check(critic.includes('Formal cross-provider XVerify:** **HOLD'), 'critic must not impersonate XVerify');

let handoff;
try {
  const handoffText = text(`${auditRelative}/HANDOFF.md`);
  const match = handoffText.match(/<!-- HANDOFF-JSON\n([\s\S]*?)\nHANDOFF-JSON -->/u);
  check(match !== null, 'handoff machine block missing');
  handoff = match ? JSON.parse(match[1]) : undefined;
  check(handoff?.schemaVersion === 1, 'handoff schemaVersion must be 1');
  check(handoff?.lane === 'lane/approval-audit-20260826', 'handoff lane mismatch');
  check(handoff?.baseSha === manifest?.baseSha, 'handoff/evidence baseSha mismatch');
  check(/^[a-f0-9]{40}$/u.test(handoff?.headSha ?? ''), 'handoff headSha must be a full git SHA');
  check(handoff?.status === 'READY_FOR_ADMISSION', 'handoff status must be READY_FOR_ADMISSION');
  check(Array.isArray(handoff?.openActions) && handoff.openActions.length >= 5, 'handoff openActions must enumerate owner/closure actions');
} catch (error) {
  failures.push(`handoff parse failed: ${error instanceof Error ? error.message : String(error)}`);
}

const digestTargets = [
  'SURFACE-MATRIX.md',
  'DRIFT-REGISTER.md',
  'COMPLETION-PLAN.md',
  'VERIFICATION.md',
  'CRITIC-REVIEW.md',
  'EVIDENCE-MANIFEST.json',
];
for (const name of digestTargets) {
  const expectedDigest = handoff?.artifactDigests?.[name];
  check(typeof expectedDigest === 'string' && /^[a-f0-9]{64}$/u.test(expectedDigest), `handoff digest missing: ${name}`);
  if (typeof expectedDigest === 'string' && existsSync(resolve(auditDir, name))) {
    check(digestFile(`${auditRelative}/${name}`) === expectedDigest, `artifact digest mismatch: ${name}`);
  }
}

const laneStatus = text('LANE-STATUS.md');
for (const phrase of ['READY_FOR_ADMISSION', 'lane/approval-audit-20260826', 'Production code changes: 0']) {
  check(laneStatus.includes(phrase), `LANE-STATUS missing required phrase: ${phrase}`);
}

for (const relativePath of required) {
  if (!existsSync(resolve(root, relativePath))) continue;
  if (relativePath.endsWith('/verify-artifacts.mjs')) continue;
  const content = text(relativePath);
  check(!/PENDING_(?:SHA|DIGEST)|TO_BE_SETTLED|PLACEHOLDER/iu.test(content), `unsettled placeholder in ${relativePath}`);
}

if (failures.length > 0) {
  console.error(`FAIL ${checks - failures.length}/${checks} checks passed; ${failures.length} failed`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks}/${checks} checks`);
  console.log(`baseSha ${manifest.baseSha}`);
  console.log(`findings ${findingIds.length} (CRITICAL 3, HIGH 6)`);
  console.log(`matrixRows ${matrixRows.length}`);
}
