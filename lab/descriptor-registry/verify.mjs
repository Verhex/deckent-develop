import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson, compileRegistry, sha256 } from './model.mjs';
import { createEqualityReport, equalityOutput } from './equality-check.mjs';
import { generateMetadataAndDocumentationOutputs } from './generate-metadata-docs.mjs';
import { generateTypeOutputs } from './generate-types.mjs';
import { generatedDirectory, labDirectory, reconcileOutputs } from './io.mjs';
import { messages } from './messages.mjs';
import { registry } from './registry.mjs';

const generatedFiles = [
  'config-metadata.generated.json',
  'config-metadata.generated.ts',
  'config-types.generated.ts',
  'configuration-schema.en.generated.md',
  'configuration-schema.tr.generated.md',
  'equality-report.generated.json',
  'registry-census.generated.json',
];

const artifactFiles = [
  'README.md',
  'equality-check.mjs',
  'generate-metadata-docs.mjs',
  'generate-types.mjs',
  'generate.mjs',
  ...generatedFiles.map((file) => `generated/${file}`),
  'io.mjs',
  'messages.mjs',
  'model.mjs',
  'registry.mjs',
  'verify.mjs',
].sort();

function clonedRegistry() {
  return structuredClone(registry);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function artifactSetDigest(files) {
  const rows = [];
  for (const relativePath of files) {
    const content = await readFile(resolve(labDirectory, relativePath));
    rows.push(`${relativePath}\0${sha256(content)}\n`);
  }
  return `sha256:${sha256(rows.join(''))}`;
}

function verifyNegativeContracts() {
  const duplicate = clonedRegistry();
  duplicate.descriptors[1].id = duplicate.descriptors[0].id;
  assert.throws(() => compileRegistry(duplicate, messages), /REGISTRY_DESCRIPTOR_ID_DUPLICATE/);

  const unresolved = clonedRegistry();
  unresolved.descriptors[0].authored.type = { kind: 'externalRef', name: 'MissingExternalType' };
  assert.throws(() => compileRegistry(unresolved, messages), /REGISTRY_EXTERNAL_REF_UNRESOLVED/);

  const secretDefault = clonedRegistry();
  const secret = secretDefault.descriptors.find((descriptor) => descriptor.path === 'api_keys.*');
  secret.default = { kind: 'EFFECTIVE_DEFAULT', value: 'plaintext-is-forbidden' };
  assert.throws(() => compileRegistry(secretDefault, messages), /REGISTRY_SECRET_DEFAULT_FORBIDDEN/);

  const unboundedDynamicKey = clonedRegistry();
  const dynamic = unboundedDynamicKey.descriptors.find((descriptor) => descriptor.path === 'provider_overrides.*');
  delete dynamic.key.maxLength;
  assert.throws(() => compileRegistry(unboundedDynamicKey, messages), /REGISTRY_DYNAMIC_KEY_UNBOUNDED/);
}

async function readOptionalHandoffReceipt() {
  let handoff;
  try {
    handoff = await readFile(resolve(labDirectory, 'HANDOFF.md'), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const match = handoff.match(/<!-- HANDOFF-RECEIPT:START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- HANDOFF-RECEIPT:END -->/);
  assert.ok(match, 'HANDOFF_RECEIPT_MISSING');
  return JSON.parse(match[1]);
}

async function main() {
  const compiled = compileRegistry(registry, messages);
  assert.equal(compiled.descriptors.length, 20);
  assert.deepEqual(compiled.census.typeKinds, [
    'array', 'discriminatedUnion', 'enum', 'externalRef', 'literal', 'object', 'primitive', 'record', 'ref', 'union',
  ]);
  assert.ok(compiled.census.dynamicPaths >= 1);
  assert.ok(compiled.descriptors.some((descriptor) => descriptor.path.includes('.')));
  assert.ok(compiled.descriptors.some((descriptor) => descriptor.authored.type.kind === 'union'));
  assert.ok(compiled.descriptors.some((descriptor) => descriptor.authored.type.kind === 'ref'));
  assert.ok(Object.keys(compiled.census.defaultKinds).length >= 5);
  assert.ok(Object.keys(compiled.census.lifecycle).length >= 3);
  verifyNegativeContracts();

  const typeOutputs = generateTypeOutputs();
  const metadataOutputs = generateMetadataAndDocumentationOutputs();
  const equalityOutputs = await equalityOutput();
  const outputNames = [...typeOutputs.keys(), ...metadataOutputs.keys(), ...equalityOutputs.keys()].sort();
  assert.deepEqual(outputNames, generatedFiles);
  const reconciled = await reconcileOutputs(new Map([...typeOutputs, ...metadataOutputs, ...equalityOutputs]), { mode: 'check' });
  assert.equal(reconciled.changed, 0, `GENERATED_OUTPUT_DRIFT:${JSON.stringify(reconciled.changes)}`);

  const actualGeneratedFiles = (await readdir(generatedDirectory)).sort();
  assert.deepEqual(actualGeneratedFiles, generatedFiles);
  const equality = await createEqualityReport();
  assert.equal(equality.status, 'MATCH');
  assert.equal(equality.comparedFields, 20);
  assert.equal(equality.matchedFields, 20);
  assert.deepEqual(equality.drift, []);

  const metadata = await readJson(resolve(generatedDirectory, 'config-metadata.generated.json'));
  const census = await readJson(resolve(generatedDirectory, 'registry-census.generated.json'));
  const equalityOnDisk = await readJson(resolve(generatedDirectory, 'equality-report.generated.json'));
  assert.equal(metadata.registryDigest, compiled.digest);
  assert.equal(metadata.fields.length, 20);
  assert.equal(census.registryDigest, compiled.digest);
  assert.equal(census.descriptors, 20);
  assert.deepEqual(equalityOnDisk, equality);

  const readme = await readFile(resolve(labDirectory, 'README.md'), 'utf8');
  for (const command of [
    'node lab/descriptor-registry/generate-types.mjs --check',
    'node lab/descriptor-registry/generate-metadata-docs.mjs --check',
    'node lab/descriptor-registry/equality-check.mjs --check',
    'node lab/descriptor-registry/verify.mjs',
  ]) assert.ok(readme.includes(command), `README_COMMAND_MISSING:${command}`);
  assert.ok(readme.includes('production authority değildir'));

  const digest = await artifactSetDigest(artifactFiles);
  const receipt = await readOptionalHandoffReceipt();
  if (receipt !== null) {
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.outcomeId, 'CONFIG-DESCRIPTOR-REGISTRY-PHASE-B-2026-08-26');
    assert.equal(receipt.role, 'implementer');
    assert.match(receipt.baseSha, /^[0-9a-f]{40}$/);
    assert.match(receipt.headSha, /^[0-9a-f]{40}$/);
    assert.equal(receipt.branch, 'lane/descriptor-registry-20260826');
    assert.equal(receipt.policyDigest, 'sha256:8c10f28c4a5d895848cc12bb20e210544983ab714c0fcca49bc7422a76dc3ff2');
    assert.equal(receipt.scopeDigest, 'sha256:8d0f9fe40781082b230fb8dd26522e76e8a9ede76df9bb18328fcefb6d32d723');
    assert.deepEqual(receipt.artifactSet.files, artifactFiles);
    assert.equal(receipt.artifactSet.digest, digest);
    assert.equal(receipt.registryDigest, compiled.digest);
    assert.equal(receipt.sourceDigest, equality.source.sha256);
    const unsigned = structuredClone(receipt);
    delete unsigned.receiptDigest;
    assert.equal(receipt.receiptDigest, `sha256:${sha256(canonicalJson(unsigned))}`);
  }

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    descriptors: compiled.census.descriptors,
    generatedFiles: generatedFiles.length,
    equality: `${equality.matchedFields}/${equality.comparedFields} MATCH`,
    registryDigest: compiled.digest,
    sourceDigest: equality.source.sha256,
    artifactFiles: artifactFiles.length,
    artifactSetDigest: digest,
    handoffReceipt: receipt === null ? 'NOT_PRESENT' : 'VERIFIED',
  }, null, 2)}\n`);
}

await main();
