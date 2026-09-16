#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EFFECTS = ['READ', 'MUTATE_LOCAL', 'MUTATE_EXTERNAL', 'SPAWN_EXECUTION', 'DESTRUCTIVE', 'DB', 'MEMORY_LAW', 'PROVIDER_CALL'];
const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const IDEMPOTENCY = ['NONE', 'KEYED', 'NATURAL'];
const EFFECT_MIN_GATE = { READ: 'G0', MUTATE_LOCAL: 'G1', MUTATE_EXTERNAL: 'G1', SPAWN_EXECUTION: 'G1', DESTRUCTIVE: 'G3', DB: 'G4', MEMORY_LAW: 'G6', PROVIDER_CALL: 'G7' };
const ID_RE = /^op(\.[a-z0-9]+(?:-[a-z0-9]+)*){2,}$/u;
const TYPESCRIPT_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function symbolFor(operationId) {
  return operationId.slice(3).split('.').flatMap(part => part.split('-')).map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function generatedSource(operations) {
  const strings = operations.map(operation => `  ${symbolFor(operation.id)}: '${operation.id}',`).join('\n');
  const referenceTypes = operations.map(operation => {
    const symbol = symbolFor(operation.id);
    return `  readonly ${symbol}: Readonly<{ readonly operationId: typeof Op.${symbol}; readonly version: ${operation.version}; readonly key: '${operation.id}@${operation.version}' }>;`;
  }).join('\n');
  const references = operations.map(operation => `  ${symbolFor(operation.id)}: Object.freeze({ operationId: Op.${symbolFor(operation.id)}, version: ${operation.version}, key: '${operation.id}@${operation.version}' }),`).join('\n');
  return `// GENERATED FILE — DO NOT EDIT. Source: catalog.v1.json; generator: scripts/lint-operation-catalog.mjs\n\nexport const Op = Object.freeze({\n${strings}\n} as const);\n\nexport type OpId = (typeof Op)[keyof typeof Op];\n\nexport interface OperationReferenceBySymbol {\n${referenceTypes}\n}\n\nexport type ExactOperationReference = OperationReferenceBySymbol[keyof OperationReferenceBySymbol];\n\nexport const OperationRef = Object.freeze({\n${references}\n} as const) satisfies OperationReferenceBySymbol;\n\nexport type GeneratedOperationReference = (typeof OperationRef)[keyof typeof OperationRef];\n`;
}

function readCapabilityVocabulary(path) {
  const block = /export type Capability =([\s\S]*?);/u.exec(readFileSync(path, 'utf8'));
  if (!block) throw new Error('Capability union not found in work-model.ts');
  return new Set([...block[1].matchAll(/'([a-z-]+)'/gu)].map(match => match[1]));
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

export function lintOperationCatalog(options = {}) {
  const normalized = typeof options === 'string' ? { root: options } : options;
  const root = resolve(normalized.root ?? DEFAULT_ROOT);
  const catalogPath = join(root, 'src/core/operation-catalog/catalog.v1.json');
  const generatedPath = join(root, 'src/core/operation-catalog/generated.ts');
  const errors = [];
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    return { errors: [`catalog unreadable: ${error instanceof Error ? error.message : String(error)}`], count: 0, expected: '' };
  }

  let capabilities;
  try {
    capabilities = readCapabilityVocabulary(join(root, 'src/core/work-model.ts'));
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], count: 0, expected: '' };
  }

  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return { errors: ['catalog must be an object'], count: 0, expected: '' };
  }

  const operations = Array.isArray(catalog.operations) ? catalog.operations : [];
  const ids = new Set();
  const symbols = new Set();
  const referenceKeys = new Set();
  if (catalog.schemaVersion !== 1) errors.push(`schemaVersion must be 1, got ${catalog.schemaVersion}`);
  if (!Array.isArray(catalog.operations)) errors.push('operations must be an array');
  else if (catalog.operations.length === 0) errors.push('operations must not be empty');

  for (const operation of operations) {
    const label = `operation '${operation?.id ?? '(missing id)'}'`;
    if (!operation || typeof operation !== 'object') {
      errors.push('operation must be an object');
      continue;
    }
    const validId = typeof operation.id === 'string' && ID_RE.test(operation.id);
    const validVersion = Number.isInteger(operation.version) && operation.version > 0;
    if (!validId) errors.push(`${label}: id must be dot-hierarchic lowercase (op.<family>.<verb>)`);
    if (ids.has(operation.id)) errors.push(`${label}: duplicate id`);
    ids.add(operation.id);
    if (validId) {
      const symbol = symbolFor(operation.id);
      if (!TYPESCRIPT_IDENTIFIER_RE.test(symbol)) errors.push(`${label}: generated symbol '${symbol}' is not a valid TypeScript identifier`);
      else {
        if (symbols.has(symbol)) errors.push(`${label}: generated symbol collision '${symbol}'`);
        symbols.add(symbol);
      }
    }
    if (!validVersion) errors.push(`${label}: version must be a positive integer`);
    if (validId && validVersion) {
      const referenceKey = `${operation.id}@${operation.version}`;
      if (referenceKeys.has(referenceKey)) errors.push(`${label}: duplicate operation key '${referenceKey}'`);
      referenceKeys.add(referenceKey);
    }
    if (!EFFECTS.includes(operation.effect)) errors.push(`${label}: unknown effect '${operation.effect}'`);
    if (!GATES.includes(operation.gate)) errors.push(`${label}: unknown gate '${operation.gate}'`);
    if (!RISKS.includes(operation.risk)) errors.push(`${label}: unknown risk '${operation.risk}'`);
    if (!IDEMPOTENCY.includes(operation.idempotency)) errors.push(`${label}: unknown idempotency '${operation.idempotency}'`);
    const auditMatch = typeof operation.auditEvent === 'string'
      ? /^(?:[a-z0-9]+\.)+[a-z0-9]+\.v([1-9][0-9]*)$/u.exec(operation.auditEvent)
      : null;
    if (!auditMatch || !validVersion || Number(auditMatch[1]) !== operation.version) {
      errors.push(`${label}: auditEvent version must match version ${operation.version}`);
    }
    if (!operation.title
      || typeof operation.title.en !== 'string'
      || typeof operation.title.tr !== 'string'
      || operation.title.en.length === 0
      || operation.title.tr.length === 0
      || operation.title.en !== operation.title.en.trim()
      || operation.title.tr !== operation.title.tr.trim()) {
      errors.push(`${label}: title must carry non-empty en AND tr (i18n-first)`);
    }
    if (!Array.isArray(operation.capabilities) || operation.capabilities.length === 0) errors.push(`${label}: capabilities must be a non-empty array`);
    else for (const capability of operation.capabilities) if (!capabilities.has(capability)) errors.push(`${label}: capability '${capability}' is not in the work-model vocabulary`);
    const minimumGate = EFFECT_MIN_GATE[operation.effect];
    if (minimumGate && GATES.indexOf(operation.gate) < GATES.indexOf(minimumGate)) errors.push(`${label}: effect ${operation.effect} requires at least ${minimumGate}, declared ${operation.gate}`);
  }

  const expected = errors.length === 0 ? generatedSource(operations) : '';
  if (errors.length === 0 && normalized.write === true) atomicWrite(generatedPath, expected);
  else if (errors.length === 0 && (!existsSync(generatedPath) || readFileSync(generatedPath, 'utf8') !== expected)) errors.push('generated.ts drift: run node scripts/lint-operation-catalog.mjs --write');
  return { errors: errors.sort(compareText), count: ids.size, expected };
}

function parseCliArguments(args) {
  let root;
  let write = false;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--write') write = true;
    else if (argument === '--check') check = true;
    else if (argument === '--root') {
      root = args[index + 1];
      if (!root || root.startsWith('--')) return { error: '--root requires a path' };
      index += 1;
    } else return { error: `unknown argument '${argument}'` };
  }
  if (write && check) return { error: '--write and --check are mutually exclusive' };
  return { root, write };
}

const invokedDirectly = (() => {
  try { return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? ''); } catch { return false; }
})();

if (invokedDirectly) {
  const options = parseCliArguments(process.argv.slice(2));
  const result = 'error' in options ? { errors: [options.error], count: 0 } : lintOperationCatalog(options);
  if (result.errors.length > 0) {
    process.stderr.write(`[operation-catalog] FAIL — ${result.errors.length} defect(s):\n${result.errors.map(error => `  - ${error}\n`).join('')}`);
    process.exitCode = 1;
  } else process.stdout.write(`[operation-catalog] ✓ ${result.count} operation(s) valid and generated projection is current\n`);
}
