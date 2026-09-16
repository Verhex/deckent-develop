#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const auditRoot = 'docs/audits/ci-repair-2026-08-26';
const plans = [
  ...JSON.parse(readFileSync(resolve(root, auditRoot, 'tsm-merge-plan.json'), 'utf8')),
  ...JSON.parse(readFileSync(resolve(root, auditRoot, 'wire-merge-plan.json'), 'utf8')),
];

function baseText(path) {
  return execFileSync('git', ['show', `origin/main:${path}`], { cwd: root, encoding: 'utf8' });
}

function parse(path, text) {
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    extname(path) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function runnerRoot(expression) {
  if (ts.isIdentifier(expression)) return ['it', 'test'].includes(expression.text) ? expression.text : undefined;
  if (ts.isPropertyAccessExpression(expression)) return runnerRoot(expression.expression);
  if (ts.isCallExpression(expression)) return runnerRoot(expression.expression);
  return undefined;
}

function normalize(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function testRegistrations(file) {
  const output = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && runnerRoot(node.expression)) {
      const parentIsContinuation = ts.isCallExpression(node.parent) && node.parent.expression === node;
      if (!parentIsContinuation) {
        const expression = normalize(node.expression.getText(file));
        const first = node.arguments[0];
        const title = first && (ts.isStringLiteralLike(first) || ts.isNoSubstitutionTemplateLiteral(first))
          ? first.text
          : first ? normalize(first.getText(file)) : '<missing-title>';
        const mode = expression.includes('.skipIf') ? 'skipIf'
          : expression.includes('.skip') ? 'skip'
            : expression.includes('.todo') ? 'todo'
              : 'active';
        output.push({ root: runnerRoot(node.expression), mode, title });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return output;
}

function structuralFingerprint(node) {
  const chunks = [];
  const visit = (current) => {
    chunks.push(String(current.kind));
    if (ts.isStringLiteralLike(current)) chunks.push(`s:${JSON.stringify(current.text)}`);
    else if (ts.isNumericLiteral(current)) chunks.push(`n:${current.text}`);
    else if (current.kind === ts.SyntaxKind.TrueKeyword || current.kind === ts.SyntaxKind.FalseKeyword
      || current.kind === ts.SyntaxKind.NullKeyword || current.kind === ts.SyntaxKind.UndefinedKeyword) {
      chunks.push(ts.SyntaxKind[current.kind]);
    } else if (ts.isIdentifier(current)) {
      const preserve =
        (ts.isPropertyAccessExpression(current.parent) && current.parent.name === current)
        || (ts.isPropertyAssignment(current.parent) && current.parent.name === current)
        || (ts.isMethodDeclaration(current.parent) && current.parent.name === current);
      chunks.push(preserve ? `p:${current.text}` : '$id');
    }
    ts.forEachChild(current, visit);
    chunks.push('/');
  };
  visit(node);
  return createHash('sha256').update(chunks.join('|')).digest('hex');
}

function assertionFingerprints(file) {
  const output = [];
  const seen = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'expect') {
      let container = node;
      while (container.parent && !ts.isExpressionStatement(container.parent)
        && !ts.isReturnStatement(container.parent) && !ts.isArrowFunction(container.parent)) {
        container = container.parent;
      }
      if (ts.isExpressionStatement(container.parent)) container = container.parent.expression;
      const key = `${container.pos}:${container.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        output.push(structuralFingerprint(container));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return output;
}

function canonicalModule(path, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  const absolute = resolve(root, dirname(path), specifier);
  const candidates = [
    absolute,
    absolute.replace(/\.js$/u, '.ts'),
    absolute.replace(/\.js$/u, '.tsx'),
    absolute.replace(/\.mjs$/u, '.ts'),
  ];
  const found = candidates.find(existsSync);
  return found ? relative(root, found).replaceAll('\\', '/') : `UNRESOLVED:${relative(root, absolute).replaceAll('\\', '/')}`;
}

function importedModules(path, file) {
  return new Set(file.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => canonicalModule(path, statement.moduleSpecifier.text)));
}

function mockSurface(path, file) {
  const modules = new Map();
  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'vi'
      && ['mock', 'doMock'].includes(node.expression.name.text)
      && node.arguments[0]
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      const module = canonicalModule(path, node.arguments[0].text);
      if (!modules.has(module)) modules.set(module, new Set());
      const keys = modules.get(module);
      const factory = node.arguments[1];
      const factoryVisit = (current) => {
        if (ts.isObjectLiteralExpression(current)) {
          for (const property of current.properties) {
            if ((ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) || ts.isShorthandPropertyAssignment(property))
              && property.name) keys.add(property.name.getText(file).replace(/["']/gu, ''));
          }
        }
        ts.forEachChild(current, factoryVisit);
      };
      if (factory) factoryVisit(factory);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return modules;
}

function multiset(values) {
  const output = new Map();
  for (const value of values) {
    const key = typeof value === 'string' ? value : JSON.stringify(value);
    output.set(key, (output.get(key) ?? 0) + 1);
  }
  return output;
}

function equalMultiset(left, right) {
  if (left.size !== right.size) return false;
  return [...left].every(([key, count]) => right.get(key) === count);
}

function unionSets(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function unionMockSurfaces(...maps) {
  const output = new Map();
  for (const map of maps) {
    for (const [module, keys] of map) {
      if (module.startsWith('UNRESOLVED:')) continue;
      if (!output.has(module)) output.set(module, new Set());
      for (const key of keys) output.get(module).add(key);
    }
  }
  return output;
}

const records = [];
let failures = 0;
for (const entry of plans) {
  const destination = entry.destination ?? entry.target;
  const beforeTarget = parse(entry.target, baseText(entry.target));
  const beforeSource = parse(entry.source, baseText(entry.source));
  const after = parse(destination, readFileSync(resolve(root, destination), 'utf8'));
  const beforeTests = [...testRegistrations(beforeTarget), ...testRegistrations(beforeSource)];
  const afterTests = testRegistrations(after);
  const beforeAssertions = [...assertionFingerprints(beforeTarget), ...assertionFingerprints(beforeSource)];
  const afterAssertions = assertionFingerprints(after);
  const beforeImports = unionSets(importedModules(entry.target, beforeTarget), importedModules(entry.source, beforeSource));
  const afterImports = importedModules(destination, after);
  const beforeMocks = unionMockSurfaces(mockSurface(entry.target, beforeTarget), mockSurface(entry.source, beforeSource));
  const afterMocks = unionMockSurfaces(mockSurface(destination, after));
  const missingMockSurface = [];
  for (const [module, keys] of beforeMocks) {
    for (const key of keys) if (!afterMocks.get(module)?.has(key)) missingMockSurface.push(`${module}:${key}`);
  }
  const checks = {
    titles: equalMultiset(multiset(beforeTests), multiset(afterTests)),
    testCount: beforeTests.length === afterTests.length,
    assertionStructure: equalMultiset(multiset(beforeAssertions), multiset(afterAssertions)),
    assertionCount: beforeAssertions.length === afterAssertions.length,
    importModules: equalMultiset(multiset([...beforeImports].filter((x) => !x.startsWith('UNRESOLVED:'))), multiset([...afterImports].filter((x) => !x.startsWith('UNRESOLVED:')))),
    mockFactorySurface: missingMockSurface.length === 0,
  };
  const passed = Object.values(checks).every(Boolean);
  if (!passed) failures += 1;
  records.push({
    id: entry.id,
    target: destination,
    sources: [entry.target, entry.source],
    before: { tests: beforeTests.length, assertions: beforeAssertions.length },
    after: { tests: afterTests.length, assertions: afterAssertions.length },
    checks,
    missingMockSurface,
    passed,
  });
}

const summary = {
  schemaVersion: 1,
  base: 'origin/main',
  generatedAt: new Date().toISOString(),
  records: records.length,
  passed: records.length - failures,
  failed: failures,
  checks: records,
};
const serialized = `${JSON.stringify(summary, null, 2)}\n`;
if (process.argv.includes('--write')) {
  writeFileSync(resolve(root, auditRoot, 'PHASE-B-EQUALITY.json'), serialized);
}
console.log(serialized.trimEnd());
if (failures > 0) process.exitCode = 1;
