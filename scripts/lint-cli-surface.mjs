#!/usr/bin/env node
/** Fail-closed CLI registration ↔ surface-registry drift gate. */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = realpathSync(resolve(fileURLToPath(import.meta.url), '..', '..'));
const COMMAND_NAME_OVERRIDES = Object.freeze({
  help: ['help-info'],
  'task-settlement': ['task'],
  'test-run': ['test'],
  'trace-extract': ['trace'],
  // registerGateway installs the hidden gateway-runtime entry as well.
  gateway: ['gateway', 'gateway-runtime'],
  // This augments the config command rather than registering a root command.
  'config-nervous': [],
});

class InputError extends Error {}

const posix = (value) => value.split(sep).join('/');

function rootPath(value) {
  const root = realpathSync(resolve(value));
  if (!statSync(root).isDirectory()) throw new InputError('--root is not a directory');
  return root;
}

function sourceFile(root, relPath) {
  const path = resolve(root, relPath);
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new InputError(`${relPath} escapes repository root`);
  }
  if (!existsSync(path)) throw new InputError(`required source is missing: ${relPath}`);
  return path;
}

function commandNamesFromImport(specifier, fallback) {
  const stem = basename(specifier).replace(/\.[^.]+$/, '');
  if (Object.hasOwn(COMMAND_NAME_OVERRIDES, stem)) return COMMAND_NAME_OVERRIDES[stem];
  return [(stem || fallback.replace(/^register/, '').replace(/Command$/, ''))
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()];
}

/** Extract static register* call sites and map imports to their root command names. */
export function extractRegisteredCommands(sourceText) {
  const imports = new Map();
  for (const match of sourceText.matchAll(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g)) {
    for (const binding of match[1].split(',')) {
      const name = binding.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name?.startsWith('register')) imports.set(name, match[2]);
    }
  }
  const source = sourceText.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|(['"])(?:\\.|(?!\1)[\s\S])*?\1/g, ' ');
  const names = new Set();
  for (const match of source.matchAll(/\b(register[A-Z][A-Za-z0-9_]*)\s*\(/g)) {
    for (const name of commandNamesFromImport(imports.get(match[1]) ?? '', match[1])) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function balancedArray(sourceText, variableName) {
  const declaration = new RegExp(`(?:const|let)\\s+${variableName}\\s*=`).exec(sourceText);
  if (!declaration) throw new InputError(`registry is missing ${variableName}`);
  const start = sourceText.indexOf('[', declaration.index + declaration[0].length);
  if (start < 0) throw new InputError(`registry is missing ${variableName} array`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < sourceText.length; index += 1) {
    const character = sourceText[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) return sourceText.slice(start + 1, index);
  }
  throw new InputError(`registry has an unclosed ${variableName} array`);
}

function literalRows(sourceText, variableName, replacementIndex = null) {
  const body = balancedArray(sourceText, variableName);
  const rows = [];
  let depth = 0;
  let rowStart = -1;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === '[') {
      if (depth === 0) rowStart = index;
      depth += 1;
    } else if (character === ']') {
      depth -= 1;
      if (depth === 0 && rowStart >= 0) {
        const fields = [...body.slice(rowStart, index + 1).matchAll(/['"]([^'"]+)['"]/g)]
          .map((field) => field[1]);
        if (!fields.length) throw new InputError(`${variableName} row lacks a literal command name`);
        rows.push(fields);
      }
    }
  }
  if (depth !== 0) throw new InputError(`registry has an unclosed row in ${variableName}`);
  const names = rows.map((fields) => fields[0]);
  const replacements = replacementIndex === null ? [] : rows.map((fields) => {
    if (!fields[replacementIndex]) {
      throw new InputError(`${variableName} row has a non-literal replacement`);
    }
    return fields[replacementIndex];
  });
  return { names, replacements };
}

/** Extract the static VISIBLE/ADVANCED/DEPRECATED registry row sets. */
export function extractRegistryCommands(sourceText) {
  const visible = literalRows(sourceText, 'VISIBLE_ROWS');
  const advanced = literalRows(sourceText, 'ADVANCED_ROWS');
  const deprecated = literalRows(sourceText, 'DEPRECATED_ROWS', 2);
  return {
    names: [...new Set([...visible.names, ...advanced.names, ...deprecated.names])].sort(),
    replacements: deprecated.replacements.map((value) => value.split(/\s+/)[0]).sort(),
  };
}

/** Compare registration and registry universes, then validate deprecation targets. */
export function checkCliSurface(rootDir = REPO_ROOT) {
  const root = rootPath(rootDir);
  const registered = extractRegisteredCommands(readFileSync(sourceFile(root, 'src/cli/index.ts'), 'utf8'));
  const registry = extractRegistryCommands(readFileSync(sourceFile(root, 'src/cli/surface-registry.ts'), 'utf8'));
  const registrySet = new Set(registry.names);
  const registeredSet = new Set(registered);
  // Commander'ın örtük built-in `help` komutu register*-çağrısı üretmez ama canlı
  // komut-evreninin gerçek üyesidir (deckent help [command]) — kayıtlı sayılır (701 kapanışı).
  registeredSet.add('help');
  const problems = [
    ...registered.filter((name) => !registrySet.has(name)).map((name) => ({ code: 'REGISTERED_WITHOUT_REGISTRY', name })),
    ...registry.names.filter((name) => !registeredSet.has(name)).map((name) => ({ code: 'REGISTRY_WITHOUT_REGISTRATION', name })),
    ...registry.replacements.filter((name) => !registrySet.has(name)).map((name) => ({ code: 'DEPRECATED_REPLACEMENT_MISSING', name })),
  ];
  return { ok: problems.length === 0, registered, registry: registry.names, problems };
}

function main(argv) {
  try {
    let root = REPO_ROOT;
    if (argv.length === 2 && argv[0] === '--root') root = argv[1];
    else if (argv.length === 1 && argv[0] === '--help') {
      console.log('Usage: node scripts/lint-cli-surface.mjs [--root <dir>]');
      return 0;
    } else if (argv.length) throw new InputError('Usage: node scripts/lint-cli-surface.mjs [--root <dir>]');
    const result = checkCliSurface(root);
    if (result.ok) console.log(`CLI surface gate clean (${result.registered.length} registered commands).`);
    else for (const problem of result.problems) console.log(`${problem.code}: ${problem.name}`);
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
