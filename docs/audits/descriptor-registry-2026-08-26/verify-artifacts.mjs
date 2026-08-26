#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const auditDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(auditDir, '../../..');

const REQUIRED_FILES = [
  'README.md',
  'SOURCE-MANIFEST.json',
  'DRIFT-REGISTER.md',
  'DESIGN.md',
  'PLAN.md',
  'verify-artifacts.mjs',
  'HANDOFF.md',
];

const ARTIFACT_SET_FILES = [
  'DESIGN.md',
  'DRIFT-REGISTER.md',
  'PLAN.md',
  'README.md',
  'SOURCE-MANIFEST.json',
  'verify-artifacts.mjs',
];

const EXPECTED_AUDIT_COUNTS = Object.freeze({
  deckentConfigRoots: 141,
  truthGateDeclarationLeaves: 449,
  semanticDeckentConfigLeaves: 1002,
  normalizedUnionPaths: 1146,
  rawDefaultLeaves: 180,
  normalizedDefaultPaths: 178,
  defaultParserArtifacts: 2,
  resolvedConfigRoots: 117,
  truthRuntimeParserLeaves: 185,
  runtimeParserArtifacts: 6,
  configMetadataEntries: 55,
  inputSnapshotLeaves: 197,
  truthIssues: 589,
  optionalNoExplicitDefault: 755,
  conditionalNoExplicitDefault: 205,
  requiredNoTextualDefault: 1,
  genuineDynamicDescendants: 28,
});

const EXPECTED_LIVE_COUNTS = Object.freeze({
  deckentConfigRoots: 142,
  truthGateDeclarationLeaves: 450,
  rawDefaultLeaves: 181,
  truthRuntimeParserLeaves: 186,
  configMetadataEntries: 55,
  dashboardConfigFields: 66,
  schemaDocDefaultRowsEn: 164,
  schemaDocDefaultRowsTr: 164,
  truthIssues: 592,
  metadataEntriesWithTurkishDescription: 4,
});

const EXPECTED_AUDIT_DIGESTS = Object.freeze({
  'field-universe.json': '8cffb156596dc5057da934f01ef5892ba3a9a37642535d01af834853f2c9195f',
  'CONFIG-FIELD-MATRIX.md': '61a9e0652f979aa9761d5a426498f13e306b5799dc3f32ae0e6bff3b92abf05c',
  'DRIFT-REGISTER.md': '11be75abd8a17d7b6e67f4456c3178f16375b955f0f9d425b457ee834427388e',
  'verify-audit-artifacts.mjs': '155c49fd97cad5c2421b56de9999d533297c2faaeef82034d3c573b700cea087',
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function lineCount(text) {
  return text.match(/\n/g)?.length ?? 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function artifactSetDigest(files) {
  const records = [...files].sort().map((name) => {
    const digest = sha256(read(resolve(auditDir, name)));
    return `${name}\0${digest}\n`;
  });
  return `sha256:${sha256(records.join(''))}`;
}

function parseReceipt(handoff) {
  const match = handoff.match(
    /<!-- HANDOFF-RECEIPT:START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- HANDOFF-RECEIPT:END -->/,
  );
  assert(match?.[1], 'HANDOFF_RECEIPT_MISSING');
  return JSON.parse(match[1]);
}

function verifyRequiredFiles() {
  for (const name of REQUIRED_FILES) {
    const path = resolve(auditDir, name);
    assert(existsSync(path), `REQUIRED_ARTIFACT_MISSING:${name}`);
    assert(read(path).trim().length > 0, `REQUIRED_ARTIFACT_EMPTY:${name}`);
  }
}

function verifyManifest() {
  const manifest = JSON.parse(read(resolve(auditDir, 'SOURCE-MANIFEST.json')));
  assert.equal(manifest.schemaVersion, 1, 'SOURCE_MANIFEST_SCHEMA');
  assert.equal(manifest.analysisBaseSha, 'abed38c50f6dda2e48041d9ead2605894a17d0a2', 'SOURCE_BASE_SHA');
  assert.equal(manifest.auditCorpus.commit, 'd2e9a1247', 'AUDIT_CORPUS_COMMIT');
  assert.deepEqual(manifest.auditCorpus.counts, {
    ...EXPECTED_AUDIT_COUNTS,
    truthIssueKinds: {
      DIVERGENT: 12,
      MISSING_DEFAULT: 400,
      MISSING_METADATA: 112,
      MISSING_RUNTIME: 65,
    },
  }, 'AUDIT_COUNTS_DRIFT');
  assert.deepEqual(manifest.auditCorpus.sha256, EXPECTED_AUDIT_DIGESTS, 'AUDIT_DIGESTS_DRIFT');
  assert.deepEqual(manifest.liveSource.counts, {
    ...EXPECTED_LIVE_COUNTS,
    truthIssueKinds: {
      DIVERGENT: 12,
      MISSING_DEFAULT: 401,
      MISSING_METADATA: 113,
      MISSING_RUNTIME: 66,
    },
  }, 'LIVE_COUNTS_DRIFT');

  for (const source of manifest.liveSource.files) {
    const path = resolve(root, source.path);
    assert(existsSync(path), `LIVE_SOURCE_MISSING:${source.path}`);
    const content = read(path);
    assert.equal(lineCount(content), source.lines, `LIVE_SOURCE_LINE_DRIFT:${source.path}`);
    assert.equal(sha256(content), source.sha256, `LIVE_SOURCE_DIGEST_DRIFT:${source.path}`);
  }

  for (const authority of manifest.authorityInputs) {
    const path = resolve(root, authority.path);
    assert(existsSync(path), `AUTHORITY_INPUT_MISSING:${authority.path}`);
    assert.equal(sha256(read(path)), authority.sha256, `AUTHORITY_INPUT_DIGEST_DRIFT:${authority.path}`);
  }

  return manifest;
}

function verifyCountClaims(manifest) {
  const readme = read(resolve(auditDir, 'README.md'));
  const marker = readme.match(/<!-- descriptor-registry-counts:v1 ([^>]+) -->/);
  assert(marker?.[1], 'README_COUNT_MARKER_MISSING');
  const claims = Object.fromEntries(marker[1].trim().split(/\s+/).map((entry) => {
    const [key, raw] = entry.split('=');
    assert(key && raw && /^\d+$/.test(raw), `README_COUNT_MARKER_INVALID:${entry}`);
    return [key, Number(raw)];
  }));
  assert.deepEqual(claims, {
    currentRoots: manifest.liveSource.counts.deckentConfigRoots,
    currentShallowLeaves: manifest.liveSource.counts.truthGateDeclarationLeaves,
    currentDefaults: manifest.liveSource.counts.rawDefaultLeaves,
    currentRuntimeLeaves: manifest.liveSource.counts.truthRuntimeParserLeaves,
    currentMetadata: manifest.liveSource.counts.configMetadataEntries,
    currentDashboard: manifest.liveSource.counts.dashboardConfigFields,
    currentTruthIssues: manifest.liveSource.counts.truthIssues,
    auditRoots: manifest.auditCorpus.counts.deckentConfigRoots,
    auditSemanticLeaves: manifest.auditCorpus.counts.semanticDeckentConfigLeaves,
    auditUnionPaths: manifest.auditCorpus.counts.normalizedUnionPaths,
    auditTruthIssues: manifest.auditCorpus.counts.truthIssues,
  }, 'README_COUNT_MARKER_DRIFT');
}

function verifyDesignCoverage() {
  const design = read(resolve(auditDir, 'DESIGN.md'));
  const plan = read(resolve(auditDir, 'PLAN.md'));
  const drift = read(resolve(auditDir, 'DRIFT-REGISTER.md'));

  const requiredDesignTokens = [
    'NO_DEFAULT', 'EFFECTIVE_DEFAULT', 'STARTER_VALUE', 'SAFETY_FALLBACK',
    'POLICY_INHERITED', 'PLATFORM_RESOLVED', 'ACTIVE', 'OPT_IN', 'DEPRECATED',
    'INTERNAL', 'RESERVED', 'PLATFORM_UNSUPPORTED', 'REMOVED', 'hot-reload',
    'next-run', 'restart', 'required_when_parent_present', 'Imported alias',
    'Mapped type', 'Record', 'Array ve tuple', 'Discriminated union', 'Dynamic namespace',
    'titleKey', 'descriptionKey', 'SensitivityClass', 'generatedArtifacts',
  ];
  for (const token of requiredDesignTokens) {
    assert(design.includes(token), `DESIGN_COVERAGE_MISSING:${token}`);
  }

  for (const phase of ['P0', 'P1', 'P2', 'P3A', 'P3B', 'P3C', 'P3D', 'P4', 'P5', 'P6', 'P7']) {
    assert(plan.includes(phase), `PLAN_PHASE_MISSING:${phase}`);
  }
  for (const master of ['470', '4210', '471']) {
    assert(plan.includes(master), `PLAN_MASTER_LINK_MISSING:${master}`);
  }
  for (const finding of Array.from({ length: 10 }, (_, index) => `DR-${String(index + 1).padStart(3, '0')}`)) {
    assert(drift.includes(finding), `DRIFT_FINDING_MISSING:${finding}`);
  }
}

function verifyReceipt() {
  const receipt = parseReceipt(read(resolve(auditDir, 'HANDOFF.md')));
  assert.equal(receipt.schemaVersion, 1, 'HANDOFF_SCHEMA');
  assert.equal(receipt.outcomeId, 'CONFIG-DESCRIPTOR-REGISTRY-PHASE-A-2026-08-26', 'HANDOFF_OUTCOME');
  assert.equal(receipt.role, 'implementer', 'HANDOFF_ROLE');
  assert.equal(receipt.baseSha, 'abed38c50f6dda2e48041d9ead2605894a17d0a2', 'HANDOFF_BASE_SHA');
  assert.match(receipt.headSha, /^[0-9a-f]{40}$/, 'HANDOFF_HEAD_SHA');
  assert.equal(receipt.branch, 'lane/descriptor-registry-20260826', 'HANDOFF_BRANCH');
  assert.deepEqual([...receipt.artifactSet.files].sort(), ARTIFACT_SET_FILES, 'HANDOFF_ARTIFACT_FILES');
  assert.equal(receipt.artifactSet.digest, artifactSetDigest(receipt.artifactSet.files), 'HANDOFF_ARTIFACT_DIGEST');

  const unsigned = structuredClone(receipt);
  delete unsigned.receiptDigest;
  assert.equal(receipt.receiptDigest, `sha256:${sha256(canonicalJson(unsigned))}`, 'HANDOFF_RECEIPT_DIGEST');
  assert(Array.isArray(receipt.openActions) && receipt.openActions.length > 0, 'HANDOFF_OPEN_ACTIONS');
  return receipt;
}

function main() {
  verifyRequiredFiles();
  const manifest = verifyManifest();
  verifyCountClaims(manifest);
  verifyDesignCoverage();
  const receipt = verifyReceipt();

  const digests = Object.fromEntries(REQUIRED_FILES.map((name) => [name, `sha256:${sha256(read(resolve(auditDir, name)))}`]));
  console.log(JSON.stringify({
    ok: true,
    checks: {
      requiredFiles: REQUIRED_FILES.length,
      liveSourceDigests: manifest.liveSource.files.length,
      authorityInputDigests: manifest.authorityInputs.length,
      auditCounts: EXPECTED_AUDIT_COUNTS,
      liveCounts: EXPECTED_LIVE_COUNTS,
      artifactSetDigest: receipt.artifactSet.digest,
      receiptDigest: receipt.receiptDigest,
    },
    digests,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`DESCRIPTOR_REGISTRY_ARTIFACT_VERIFY_FAILED:${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
