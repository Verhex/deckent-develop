#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const auditDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(auditDir, '../../..');
const expectedBase = 'ff48978fb78139ea34b8c5e98fc41532437af9c9';
const expectedInputSha = '34b6a7c25bca9a02ff2901682868e86ad4fc3bead05b2c4e5061cb249a686edb';
const failures = [];
const passes = [];

function check(condition, message) {
  if (condition) passes.push(message);
  else failures.push(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function readWorktreeHead() {
  const dotGit = readFileSync(resolve(repoRoot, '.git'), 'utf8').trim();
  const gitDir = dotGit.startsWith('gitdir: ') ? resolve(repoRoot, dotGit.slice(8)) : resolve(repoRoot, '.git');
  const headValue = readFileSync(resolve(gitDir, 'HEAD'), 'utf8').trim();
  if (!headValue.startsWith('ref: ')) return headValue;
  const ref = headValue.slice(5);
  const commonDirMarker = resolve(gitDir, 'commondir');
  const commonDir = existsSync(commonDirMarker)
    ? resolve(gitDir, readFileSync(commonDirMarker, 'utf8').trim())
    : gitDir;
  const looseRef = resolve(commonDir, ref);
  if (existsSync(looseRef)) return readFileSync(looseRef, 'utf8').trim();
  const packedRefs = readFileSync(resolve(commonDir, 'packed-refs'), 'utf8');
  const match = packedRefs.match(new RegExp(`^([0-9a-f]{40}) ${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  if (!match) throw new Error(`Unable to resolve HEAD ref ${ref}`);
  return match[1];
}

function verifyReceipt(relativePath) {
  const absolutePath = resolve(auditDir, relativePath);
  const receipt = JSON.parse(readFileSync(absolutePath, 'utf8'));
  const claimed = receipt.receiptDigest;
  const digestInput = { ...receipt };
  delete digestInput.receiptDigest;
  const actual = `sha256:${sha256(JSON.stringify(canonicalize(digestInput)))}`;
  check(claimed === actual, `${relativePath}: canonical receipt digest`);
  check(receipt.baseSha === expectedBase, `${relativePath}: base SHA pinned`);
  check(receipt.headSha === expectedBase, `${relativePath}: head SHA pinned`);
}

const requiredArtifacts = [
  'README.md',
  'AUDIT-CHARTER.md',
  'field-universe.json',
  'consumer-index.json',
  'CONFIG-FIELD-MATRIX.md',
  'DRIFT-REGISTER.md',
  'PRODUCT-COMPLETION-PLAN.md',
  'MAIN-DRIFT-DELTA.md',
  'VERIFICATION.md',
  'MORNING-SUMMARY.md',
  'agent-reports/01-schema-defaults.md',
  'agent-reports/02-runtime-wiring.md',
  'agent-reports/03-product-surfaces.md',
  'agent-reports/04-independent-critic.md',
  'handoffs/01-schema-defaults.json',
  'handoffs/02-runtime-wiring.json',
  'handoffs/03-product-surfaces.json',
  'handoffs/04-independent-critic.json',
  'evidence/project-config.corrupted-backup.input.json',
];

for (const artifact of requiredArtifacts) {
  check(existsSync(resolve(auditDir, artifact)), `${artifact}: present`);
}

const inputBytes = readFileSync(resolve(auditDir, 'evidence/project-config.corrupted-backup.input.json'));
check(sha256(inputBytes) === expectedInputSha, 'input snapshot SHA-256');
JSON.parse(inputBytes.toString('utf8'));
passes.push('input snapshot parses as JSON');

const universe = JSON.parse(readFileSync(resolve(auditDir, 'field-universe.json'), 'utf8'));
check(universe.baseSha === expectedBase, 'field universe base SHA pinned');
check(universe.inputSha256 === expectedInputSha, 'field universe input SHA pinned');
check(universe.counts.unionPaths === 1146, 'union path count = 1,146');
check(universe.counts.deckentConfigRoots === 141, 'DeckentConfig root count = 141');
check(universe.counts.semanticDeckentConfigLeaves === 1002, 'semantic leaf count = 1,002');
check(universe.counts.defaultLeaves === 180, 'raw default parser leaves = 180');
check(universe.counts.normalizedDefaultPaths === 178, 'normalized default paths = 178');
check(universe.counts.defaultParserArtifacts === 2, 'default parser quarantine = 2');
check(universe.counts.resolvedConfigRoots === 117, 'public ResolvedConfig roots = 117');
check(universe.counts.truthRuntimeParserLeaves === 185, 'truth runtime parser leaves = 185');
check(universe.counts.runtimeParserArtifacts === 6, 'runtime parser quarantine = 6');
check(universe.counts.inputSnapshotLeaves === 197, 'input snapshot leaf count = 197');
check(universe.counts.truthIssues === 589, 'truth issue count = 589');
check(universe.fields.length === universe.counts.unionPaths, 'field row count equals union count');
check(new Set(universe.fields.map((field) => field.path)).size === universe.fields.length, 'field paths unique');
check(
  universe.fields.every((field, index, fields) => index === 0 || fields[index - 1].path <= field.path),
  'field paths sorted',
);
check(
  universe.fields.filter((field) => field.provenance.inputSnapshot).length === universe.counts.inputSnapshotLeaves,
  'every input leaf has a field-universe row',
);
check(
  universe.fields.every((field) => !Object.hasOwn(field, 'inputValue')),
  'generated field universe serializes no raw input values',
);
check(
  universe.fields.every((field) => typeof field.inputPresent === 'boolean'
    && (field.inputValueKind === null || ['array', 'boolean', 'null', 'number', 'object', 'string'].includes(field.inputValueKind))),
  'input projection is limited to presence and non-sensitive value kind',
);
const staticStatusCounts = Object.groupBy(universe.fields, (field) => field.staticStatus);
check(staticStatusCounts.OPTIONAL_NO_EXPLICIT_DEFAULT?.length === 755, 'optional no-default rows = 755');
check(staticStatusCounts.CONDITIONAL_NO_EXPLICIT_DEFAULT?.length === 205, 'conditional no-default rows = 205');
check(staticStatusCounts.DYNAMIC_DESCENDANT?.length === 28, 'genuine dynamic descendant rows = 28');
check(staticStatusCounts.INPUT_ONLY_UNDECLARED?.length === 3, 'input-only undeclared rows = 3');
check(
  !universe.fields.some((field) => field.path === 'activeModeConfig'),
  'parser-only activeModeConfig absent from authored union',
);
check(
  !universe.fields.some((field) => field.path.includes('__spread__')),
  'synthetic default spread rows absent from field union',
);
check(
  universe.defaultParserArtifacts.length === 2
    && universe.defaultParserArtifacts.every((row) => row.classification === 'SYNTHETIC_DEFAULT_SPREAD_PARSER_ARTIFACT'),
  'synthetic default spread rows retained in quarantine',
);
check(
  universe.runtimeParserArtifacts.some((row) => row.path === 'activeModeConfig'),
  'parser-only activeModeConfig retained in quarantine',
);
const dimensionKeys = [
  'declaration',
  'default',
  'validation',
  'effectiveResolution',
  'behavioralConsumer',
  'operatorSurface',
  'documentation',
  'tests',
  'lifecycleMigration',
];
check(
  universe.fields.every((field) => dimensionKeys.every((key) => {
    const dimension = field.dimensions?.[key];
    return dimension
      && typeof dimension.disposition === 'string'
      && dimension.disposition.length > 0
      && typeof dimension.reason === 'string'
      && dimension.reason.length > 0
      && Array.isArray(dimension.evidence);
  })),
  'all field rows carry nine typed dimension dispositions',
);
const approvalAuthority = universe.fields.find((field) => field.path === 'approval.authority');
const workerOutputEnabled = universe.fields.find((field) => field.path === 'worker_output_contract.enabled');
const concreteModeWorker = universe.fields.find((field) => field.path === 'modes.api.max_workers');
check(
  approvalAuthority?.dynamicAncestor === null
    && approvalAuthority?.dimensions.declaration.disposition !== 'NOT_APPLICABLE',
  'ordinary nested approval.authority is not misclassified as dynamic/N/A',
);
check(
  workerOutputEnabled?.dimensions.default.disposition !== 'NOT_APPLICABLE',
  'ordinary nested worker_output_contract.enabled default is not N/A',
);
check(
  concreteModeWorker?.dynamicAncestor === 'modes.*.max_workers'
    && concreteModeWorker?.dynamicAncestorKind === 'wildcard',
  'concrete mode field binds to exact wildcard contract',
);
check(
  universe.fields.every((field) => {
    const hasNotApplicable = dimensionKeys.some(
      (key) => field.dimensions[key].disposition === 'NOT_APPLICABLE',
    );
    return !hasNotApplicable
      || field.dynamicContractEvidence.some((evidence) => evidence.includes('*') || evidence.includes('[]'));
  }),
  'every N/A dimension has wildcard/repeated contract evidence',
);

const consumers = JSON.parse(readFileSync(resolve(auditDir, 'consumer-index.json'), 'utf8'));
check(consumers.baseSha === expectedBase, 'consumer index base SHA pinned');
check(consumers.counts.matchedPaths === 384, 'consumer matched paths = 384');
check(consumers.counts.references === 2372, 'consumer references = 2,372');
check(
  consumers.environmentCandidates.some((row) => String(row.value ?? row.name ?? row).startsWith('DECKENT_E')),
  'DECKENT_E literals retained as discovery candidates',
);
check(
  !consumers.environmentReferences.some((row) => String(row.name ?? row.key ?? '').startsWith('DECKENT_E')),
  'DECKENT_E literals not promoted to environment evidence',
);

for (const receipt of [
  'handoffs/01-schema-defaults.json',
  'handoffs/02-runtime-wiring.json',
  'handoffs/03-product-surfaces.json',
  'handoffs/04-independent-critic.json',
]) {
  if (existsSync(resolve(auditDir, receipt))) verifyReceipt(receipt);
}

const criticReceiptPath = resolve(auditDir, 'handoffs/04-independent-critic.json');
if (existsSync(criticReceiptPath)) {
  const criticReceipt = JSON.parse(readFileSync(criticReceiptPath, 'utf8'));
  check(
    criticReceipt.mainDriftComparedSha === '298e8188fadead9b29224be442034816497a99c9',
    'critic receipt binds final committed-main cutoff',
  );
  const reportDigestEvidence = criticReceipt.verification
    ?.find((entry) => entry.startsWith('LOCAL_VERIFIED: report SHA-256 is '));
  const claimedReportDigest = reportDigestEvidence?.match(/[0-9a-f]{64}$/u)?.[0];
  const actualReportDigest = sha256(
    readFileSync(resolve(auditDir, 'agent-reports/04-independent-critic.md')),
  );
  check(claimedReportDigest === actualReportDigest, 'critic receipt binds current critic report bytes');
}

const head = readWorktreeHead();
check(head === expectedBase, 'audit worktree HEAD remains pinned');

for (const report of [
  'agent-reports/01-schema-defaults.md',
  'agent-reports/02-runtime-wiring.md',
  'agent-reports/03-product-surfaces.md',
  'agent-reports/04-independent-critic.md',
]) {
  if (!existsSync(resolve(auditDir, report))) continue;
  const body = readFileSync(resolve(auditDir, report), 'utf8');
  check(
    !/\b1[.,]152\b/u.test(body)
      && !/\b1[.,]148\b/u.test(body)
      && !/\bfields=11(?:48|52)\b/u.test(body)
      && !/\b(?:388|2[.,]636|3[.,]349) (?:matched|path|reference|heuristic)/u.test(body),
    `${report}: stale union counts absent`,
  );
}

const evidenceDocuments = [
  'DRIFT-REGISTER.md',
  'PRODUCT-COMPLETION-PLAN.md',
  'agent-reports/01-schema-defaults.md',
  'agent-reports/02-runtime-wiring.md',
  'agent-reports/03-product-surfaces.md',
  'agent-reports/04-independent-critic.md',
];
let evidenceReferenceCount = 0;
const badEvidenceReferences = [];
const evidencePattern = /(?:src|tests|scripts|docs)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|mjs|md|json):\d+/g;
for (const document of evidenceDocuments) {
  const body = readFileSync(resolve(auditDir, document), 'utf8');
  for (const evidence of body.match(evidencePattern) ?? []) {
    evidenceReferenceCount += 1;
    const separator = evidence.lastIndexOf(':');
    const relativePath = evidence.slice(0, separator);
    const line = Number(evidence.slice(separator + 1));
    const sourcePath = resolve(repoRoot, relativePath);
    if (!existsSync(sourcePath)) {
      badEvidenceReferences.push(`${document}: missing ${evidence}`);
      continue;
    }
    const lineCount = readFileSync(sourcePath, 'utf8').split('\n').length;
    if (line < 1 || line > lineCount) badEvidenceReferences.push(`${document}: out-of-range ${evidence}`);
  }
}
check(evidenceReferenceCount > 300, `evidence references scanned (${evidenceReferenceCount})`);
check(badEvidenceReferences.length === 0, `evidence references resolve (${badEvidenceReferences.join('; ')})`);

for (const message of passes) process.stdout.write(`PASS ${message}\n`);
if (failures.length > 0) {
  for (const message of failures) process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS audit artifact integrity (${passes.length} checks)\n`);
}
