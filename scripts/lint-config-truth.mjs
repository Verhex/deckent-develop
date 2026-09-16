#!/usr/bin/env node
/**
 * Fail-closed CFG-03/CFG-04 truth gate.
 *
 * The typed `DeckentConfig` declaration is the metadata authority.  This
 * script reads it, then statically follows `createDefaultConfig()` and the
 * `resolved` object built by `loadConfig()`; it never imports the config
 * module, writes configuration, or depends on process environment.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));

/** @typedef {{ kind: 'MISSING_METADATA' | 'MISSING_DEFAULT' | 'MISSING_RUNTIME' | 'DIVERGENT', path: string, canonicalValue?: string, runtimeValue?: string, detail: string }} ConfigTruthIssue */

function sourceFile(text, name) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function expressionText(node, source) {
  return node.getText(source).replace(/\s+/g, ' ').trim();
}

function unwrapExpression(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}

function declarations(file) {
  const values = new Map();
  const interfaces = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) values.set(node.name.text, node.initializer);
    if (ts.isInterfaceDeclaration(node)) interfaces.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { values, interfaces };
}

function unwrapType(type) {
  return ts.isParenthesizedTypeNode(type) ? unwrapType(type.type) : type;
}

/** Enumerate finite config leaf paths declared by the canonical typed source. */
export function enumerateCanonicalLeaves(typesText, name = 'config-types.ts') {
  const file = sourceFile(typesText, name);
  const { interfaces } = declarations(file);
  const root = interfaces.get('DeckentConfig');
  if (!root) throw new Error(`CONFIG_TRUTH_PARSE: ${name} has no DeckentConfig interface`);
  const leaves = new Set();

  const addMembers = (members, prefix, seen) => {
    for (const member of members) {
      if (!ts.isPropertySignature(member) || !member.type) continue;
      const key = propertyName(member.name);
      if (!key) continue;
      addType(unwrapType(member.type), prefix ? `${prefix}.${key}` : key, seen);
    }
  };
  const addType = (type, path, seen) => {
    if (ts.isTypeLiteralNode(type)) return addMembers(type.members, path, seen);
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      const target = interfaces.get(type.typeName.text);
      if (target && !seen.has(target.name.text)) {
        const next = new Set(seen);
        next.add(target.name.text);
        return addMembers(target.members, path, next);
      }
    }
    leaves.add(path);
  };
  addMembers(root.members, '', new Set(['DeckentConfig']));
  return leaves;
}

function findFunctionObject(file, functionName) {
  let found;
  const visit = (node) => {
    if (found) return;
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      && node.name?.text === functionName && node.body) {
      const scan = (child) => {
        if (found) return;
        if (ts.isVariableDeclaration(child) && ts.isIdentifier(child.name) && child.name.text === 'config'
          && child.initializer && ts.isObjectLiteralExpression(child.initializer)) found = child.initializer;
        if (ts.isReturnStatement(child) && child.expression && ts.isObjectLiteralExpression(child.expression)) found = child.expression;
        ts.forEachChild(child, scan);
      };
      scan(node.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function findVariableObject(file, variableName) {
  let found;
  const visit = (node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName
      && node.initializer && ts.isObjectLiteralExpression(unwrapExpression(node.initializer))) found = unwrapExpression(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function flattenObject(object, file, values, prefix = '', output = new Map(), stack = new Set()) {
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = evaluateObject(property.expression, values, stack);
      if (!spread) {
        output.set(`${prefix}__spread__${property.getStart(file)}`, expressionText(property.expression, file));
      } else {
        flattenObject(spread, file, values, prefix, output, stack);
      }
      continue;
    }
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (!key) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
    const nested = evaluateObject(value, values, stack);
    if (nested) flattenObject(nested, file, values, path, output, stack);
    else output.set(path, expressionText(value, file));
  }
  return output;
}

function evaluateObject(node, values, stack) {
  node = unwrapExpression(node);
  if (ts.isObjectLiteralExpression(node)) return node;
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'structuredClone' && node.arguments[0]) {
    return evaluateObject(node.arguments[0], values, stack);
  }
  if (ts.isIdentifier(node) && !stack.has(node.text)) {
    const value = values.get(node.text);
    if (value) {
      const next = new Set(stack);
      next.add(node.text);
      return evaluateObject(value, values, next);
    }
  }
  return undefined;
}

/** Return default leaves from `createDefaultConfig`, retaining expressions canonically. */
export function collectDefaultLeaves(loaderText, name = 'config.ts') {
  const file = sourceFile(loaderText, name);
  const object = findFunctionObject(file, 'createDefaultConfig');
  if (!object) throw new Error(`CONFIG_TRUTH_PARSE: ${name} has no object return from createDefaultConfig`);
  return flattenObject(object, file, declarations(file).values);
}

function configPath(expression) {
  const parts = [];
  let current = expression;
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  return ts.isIdentifier(current) && current.text === 'config' ? parts.join('.') : undefined;
}

function runtimeValue(expression, defaults, file) {
  const direct = configPath(expression);
  if (direct) return defaults.get(direct) ?? `__CONFIG_PATH_MISSING__:${direct}`;
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const left = runtimeValue(expression.left, defaults, file);
    return left.startsWith('__CONFIG_PATH_MISSING__:') ? runtimeValue(expression.right, defaults, file) : left;
  }
  return expressionText(expression, file);
}

/**
 * Resolve every `loadConfig` output property to the value an unoverridden
 * `createDefaultConfig` input supplies. Values outside that path remain an
 * explicit marker so the comparison cannot silently pass.
 */
export function collectRuntimeLeaves(loaderText, defaults, name = 'config.ts') {
  const file = sourceFile(loaderText, name);
  const resolved = findVariableObject(file, 'resolved');
  if (!resolved) throw new Error(`CONFIG_TRUTH_PARSE: ${name} has no resolved object in loadConfig`);
  const runtime = new Map();
  for (const property of resolved.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    if (!key) continue;
    const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
    const direct = configPath(value);
    if (direct) {
      for (const [path, defaultValue] of defaults) {
        if (path === direct || path.startsWith(`${direct}.`)) runtime.set(path, defaultValue);
      }
      if (![...runtime.keys()].some((path) => path === direct || path.startsWith(`${direct}.`))) {
        runtime.set(direct, `__CONFIG_PATH_MISSING__:${direct}`);
      }
    } else {
      runtime.set(key, runtimeValue(value, defaults, file));
    }
  }
  return runtime;
}

/** Collect top-level config metadata defaults from the loader's public manifest. */
export function collectMetadataDefaults(loaderText, name = 'config.ts') {
  const file = sourceFile(loaderText, name);
  const object = findVariableObject(file, 'CONFIG_METADATA');
  if (!object) throw new Error(`CONFIG_TRUTH_PARSE: ${name} has no CONFIG_METADATA object`);
  const metadata = new Map();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyName(property.name);
    const entry = key ? evaluateObject(property.initializer, declarations(file).values, new Set()) : undefined;
    if (!key || !entry) continue;
    for (const field of entry.properties) {
      if (!ts.isPropertyAssignment(field) || propertyName(field.name) !== 'default') continue;
      metadata.set(key, expressionText(field.initializer, file));
    }
  }
  return metadata;
}

/** @returns {{ ok: boolean, canonicalLeaves: string[], defaults: Map<string, string>, runtime: Map<string, string>, metadata: Map<string, string>, issues: ConfigTruthIssue[] }} */
export function analyzeConfigTruth(typesText, loaderText, paths = {}) {
  const canonical = enumerateCanonicalLeaves(typesText, paths.typesPath);
  const defaults = collectDefaultLeaves(loaderText, paths.loaderPath);
  const runtime = collectRuntimeLeaves(loaderText, defaults, paths.loaderPath);
  const metadata = collectMetadataDefaults(loaderText, paths.loaderPath);
  /** @type {ConfigTruthIssue[]} */
  const issues = [];

  for (const [path, value] of defaults) {
    if (!canonical.has(path)) issues.push({ kind: 'MISSING_METADATA', path, canonicalValue: value, detail: 'default leaf is absent from DeckentConfig metadata' });
    const runtimeValueAtPath = runtime.get(path);
    if (runtimeValueAtPath === undefined) {
      issues.push({ kind: 'MISSING_RUNTIME', path, canonicalValue: value, detail: 'loadConfig resolved output does not carry this default leaf' });
    } else if (runtimeValueAtPath !== value) {
      issues.push({ kind: 'DIVERGENT', path, canonicalValue: value, runtimeValue: runtimeValueAtPath, detail: 'runtime default differs from canonical default production' });
    }
  }
  for (const path of canonical) {
    if (!defaults.has(path)) issues.push({ kind: 'MISSING_DEFAULT', path, detail: 'DeckentConfig leaf has no createDefaultConfig default' });
  }
  for (const [path, value] of runtime) {
    if (!canonical.has(path)) issues.push({ kind: 'MISSING_METADATA', path, canonicalValue: value, detail: 'loadConfig resolved leaf is absent from DeckentConfig metadata' });
    if (!defaults.has(path)) issues.push({ kind: 'MISSING_DEFAULT', path, runtimeValue: value, detail: 'loadConfig resolved leaf has no createDefaultConfig default' });
  }
  for (const [path, metadataValue] of metadata) {
    const defaultValue = defaults.get(path);
    const hasCanonicalDescendant = [...canonical].some((leaf) => leaf.startsWith(`${path}.`));
    if (!canonical.has(path) && !hasCanonicalDescendant) {
      issues.push({ kind: 'MISSING_METADATA', path, canonicalValue: metadataValue, detail: 'CONFIG_METADATA entry is absent from DeckentConfig metadata' });
    } else if (canonical.has(path) && defaultValue === undefined) {
      issues.push({ kind: 'MISSING_DEFAULT', path, canonicalValue: metadataValue, detail: 'CONFIG_METADATA entry has no createDefaultConfig default' });
    } else if (canonical.has(path) && metadataValue !== defaultValue) {
      issues.push({ kind: 'DIVERGENT', path, canonicalValue: defaultValue, runtimeValue: metadataValue, detail: 'CONFIG_METADATA default differs from createDefaultConfig default' });
    }
  }
  issues.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
  return { ok: issues.length === 0, canonicalLeaves: [...canonical].sort(), defaults, runtime, metadata, issues };
}

export function runLint({ typesPath, loaderPath }) {
  const result = analyzeConfigTruth(readFileSync(typesPath, 'utf8'), readFileSync(loaderPath, 'utf8'), { typesPath, loaderPath });
  console.log(`[lint-config-truth] types=${typesPath}`);
  console.log(`[lint-config-truth] loader=${loaderPath}`);
  console.log(`[lint-config-truth] metadata-leaves=${result.canonicalLeaves.length} default-leaves=${result.defaults.size} runtime-leaves=${result.runtime.size} manifest-defaults=${result.metadata.size}`);
  for (const issue of result.issues) {
    const values = issue.runtimeValue === undefined ? '' : ` canonical=${issue.canonicalValue} runtime=${issue.runtimeValue}`;
    console.error(`${issue.kind}: ${issue.path}${values} (${issue.detail})`);
  }
  if (result.ok) console.log('PASS: canonical config metadata and runtime defaults are in sync.');
  else console.error(`FAIL: ${result.issues.length} typed config-truth issue(s) found.`);
  return result.ok ? 0 : 1;
}

function parseArgs(argv) {
  const root = join(here, '..');
  const args = argv.slice(2);
  const options = { typesPath: join(root, 'src/core/config-types.ts'), loaderPath: join(root, 'src/core/config.ts') };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--types' && args[index + 1]) options.typesPath = args[++index];
    else if (args[index] === '--loader' && args[index + 1]) options.loaderPath = args[++index];
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { process.exitCode = runLint(parseArgs(process.argv)); }
  catch (error) { console.error(`CONFIG_TRUTH_PARSE: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
}
