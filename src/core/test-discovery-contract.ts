import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Task } from './task-types.js';
import { matchGlob } from './doc-tracking/glob.js';

export interface TestDiscoveryContract {
  readonly runner: string;
  readonly configPath: string;
  readonly include: readonly string[];
  readonly evidence: 'static-config';
}

export interface TestDiscoverabilityIssue {
  readonly taskId: string;
  readonly runner: string;
  readonly configPath: string;
  readonly testPath: string;
  readonly include: readonly string[];
}

export interface TestDiscoveryAdapter {
  readonly id: string;
  resolve(projectRoot: string): TestDiscoveryContract | null;
}

const VITEST_CONFIG_CANDIDATES = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.cts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vitest.config.cjs',
] as const;

const TEST_PATH_RE = /(?:^|[\s`"'(])([A-Za-z0-9_./@+-]+\.(?:test|spec)\.[cm]?[jt]sx?)(?=$|[\s`"',);])/gi;
const TEST_FILE_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;

function parseTopLevelStaticStringArray(source: string, property: string): string[] | null {
  let objectDepth = 0;
  let arrayDepth = 0;
  let parenDepth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escapedChar = false;
  let arrayBody: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (escapedChar) {
        escapedChar = false;
      } else if (char === '\\') {
        escapedChar = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') objectDepth += 1;
    else if (char === '}') objectDepth -= 1;
    else if (char === '[') arrayDepth += 1;
    else if (char === ']') arrayDepth -= 1;
    else if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth -= 1;
    if (objectDepth !== 0 || arrayDepth !== 0 || parenDepth !== 0) continue;
    if (!source.startsWith(property, index)) continue;
    const before = source[index - 1];
    const after = source[index + property.length];
    if ((before && /[A-Za-z0-9_$]/.test(before)) || (after && /[A-Za-z0-9_$]/.test(after))) continue;
    let cursor = index + property.length;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] !== ':') continue;
    cursor += 1;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] !== '[') return null;
    const start = cursor + 1;
    let nested = 1;
    let valueQuote: "'" | '"' | '`' | null = null;
    let valueEscaped = false;
    for (cursor += 1; cursor < source.length; cursor += 1) {
      const valueChar = source[cursor]!;
      if (valueQuote) {
        if (valueEscaped) valueEscaped = false;
        else if (valueChar === '\\') valueEscaped = true;
        else if (valueChar === valueQuote) valueQuote = null;
        continue;
      }
      if (valueChar === "'" || valueChar === '"' || valueChar === '`') {
        valueQuote = valueChar;
        continue;
      }
      if (valueChar === '[') nested += 1;
      if (valueChar === ']') {
        nested -= 1;
        if (nested === 0) {
          arrayBody = source.slice(start, cursor);
          break;
        }
      }
    }
    break;
  }
  if (arrayBody === null) return null;
  const values: string[] = [];
  for (const quoted of arrayBody.matchAll(/(['"`])([^'"`\r\n]+)\1/g)) {
    const value = quoted[2]?.trim();
    if (value) values.push(value.replace(/^\.\//, ''));
  }
  return values;
}

/**
 * Return the statically-authored `test: { ... }` object body.
 *
 * The scanner is deliberately conservative: dynamic config (`test: variable`,
 * function calls, spreads that own include) remains UNKNOWN. Strings,
 * templates, and comments are skipped so braces inside them cannot terminate
 * the object early.
 */
function extractStaticObjectBody(source: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\s*:\\s*\\{`, 'm').exec(source);
  if (!match) return null;
  const open = source.indexOf('{', match.index);
  if (open < 0) return null;
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let lineComment = false;
  let blockComment = false;
  let escapedChar = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escapedChar) {
        escapedChar = false;
        continue;
      }
      if (char === '\\') {
        escapedChar = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

export const vitestDiscoveryAdapter: TestDiscoveryAdapter = {
  id: 'vitest',
  resolve(projectRoot): TestDiscoveryContract | null {
    for (const configPath of VITEST_CONFIG_CANDIDATES) {
      const absolute = join(projectRoot, configPath);
      if (!existsSync(absolute)) continue;
      try {
        const source = readFileSync(absolute, 'utf-8');
        const testBody = extractStaticObjectBody(source, 'test');
        const include = testBody ? parseTopLevelStaticStringArray(testBody, 'include') : null;
        // Dynamic/unreadable include is UNKNOWN, never guessed. A future runtime
        // adapter can resolve it; this static adapter only blocks proven misses.
        if (!include || include.length === 0) return null;
        return {
          runner: 'vitest',
          configPath,
          include,
          evidence: 'static-config',
        };
      } catch {
        return null;
      }
    }
    return null;
  },
};

export const DEFAULT_TEST_DISCOVERY_ADAPTERS: readonly TestDiscoveryAdapter[] = [
  vitestDiscoveryAdapter,
];

export function extractPlannedTestPaths(task: Task): string[] {
  const paths = new Set<string>();
  for (const path of task.scope?.filesWrite ?? []) {
    if (TEST_FILE_RE.test(path)) paths.add(path.replace(/^\.\//, ''));
  }
  for (const text of [
    task.description,
    task.goNogo?.goCriteria,
    task.goNogo?.noGoCriteria,
  ]) {
    if (!text) continue;
    TEST_PATH_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TEST_PATH_RE.exec(text)) !== null) {
      const path = match[1]?.replace(/^\.\//, '');
      if (path) paths.add(path);
    }
  }
  return [...paths].sort();
}

export function resolveTestDiscoveryContracts(
  projectRoot: string,
  adapters: readonly TestDiscoveryAdapter[] = DEFAULT_TEST_DISCOVERY_ADAPTERS,
): TestDiscoveryContract[] {
  const contracts: TestDiscoveryContract[] = [];
  for (const adapter of adapters) {
    const contract = adapter.resolve(projectRoot);
    if (contract) contracts.push(contract);
  }
  return contracts;
}

export function evaluateTestDiscoverability(
  tasks: readonly Task[],
  contracts: readonly TestDiscoveryContract[],
): TestDiscoverabilityIssue[] {
  const issues: TestDiscoverabilityIssue[] = [];
  for (const task of tasks) {
    for (const testPath of extractPlannedTestPaths(task)) {
      for (const contract of contracts) {
        if (contract.include.some(pattern => matchGlob(testPath, pattern))) continue;
        issues.push({
          taskId: task.id,
          runner: contract.runner,
          configPath: contract.configPath,
          testPath,
          include: contract.include,
        });
      }
    }
  }
  return issues;
}
