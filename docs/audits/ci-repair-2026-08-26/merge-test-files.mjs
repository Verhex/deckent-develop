#!/usr/bin/env node

/**
 * Phase-B assertion-preserving physical test merger.
 *
 * A plan is a JSON array of { id, target, source, destination? }. The target
 * remains the canonical file unless destination is supplied; the source body
 * is appended in a lexical block so file-local declarations cannot collide.
 * Import bindings are resolved with TypeScript symbols. Identical bindings are
 * shared, conflicting bindings are deterministically aliased, and relative
 * module specifiers are rebased to the destination directory.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const [, , planPath, mode = '--write'] = process.argv;
if (!planPath || !['--write', '--check'].includes(mode)) {
  throw new Error('usage: node merge-test-files.mjs <plan.json> [--write|--check]');
}

const root = process.cwd();
const plan = JSON.parse(readFileSync(resolve(root, planPath), 'utf8'));
if (!Array.isArray(plan) || plan.length === 0) throw new Error('merge plan must be a non-empty array');

const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('tsconfig.json not found');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
const roots = [...new Set(plan.flatMap((entry) => [entry.target, entry.source]).map((path) => resolve(root, path)))];
const program = ts.createProgram({ rootNames: roots, options: parsed.options });
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });

function sourceFile(path) {
  const absolute = resolve(root, path);
  const file = program.getSourceFile(absolute) ?? ts.createSourceFile(
    absolute,
    readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    extname(absolute) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return file;
}

function bindingNames(name, output = []) {
  if (ts.isIdentifier(name)) output.push(name.text);
  else for (const element of name.elements) bindingNames(element.name, output);
  return output;
}

function topLevelNames(file) {
  const names = new Set();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name) names.add(statement.importClause.name.text);
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) names.add(element.name.text);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) names.add(name);
      }
    } else if (
      (ts.isFunctionDeclaration(statement)
        || ts.isClassDeclaration(statement)
        || ts.isInterfaceDeclaration(statement)
        || ts.isTypeAliasDeclaration(statement)
        || ts.isEnumDeclaration(statement))
      && statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function importKey(moduleName, kind, imported, typeOnly) {
  return JSON.stringify([moduleName, kind, imported, Boolean(typeOnly)]);
}

function targetImports(file) {
  const byLocal = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause.name) {
      byLocal.set(clause.name.text, importKey(moduleName, 'default', 'default', clause.isTypeOnly));
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      byLocal.set(bindings.name.text, importKey(moduleName, 'namespace', '*', clause.isTypeOnly));
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        byLocal.set(
          element.name.text,
          importKey(
            moduleName,
            'named',
            element.propertyName?.text ?? element.name.text,
            clause.isTypeOnly || element.isTypeOnly,
          ),
        );
      }
    }
  }
  return byLocal;
}

function rebasedSpecifier(specifier, fromPath, toPath) {
  if (!specifier.startsWith('.')) return specifier;
  const absolute = resolve(dirname(resolve(root, fromPath)), specifier);
  let next = relative(dirname(resolve(root, toPath)), absolute).replaceAll('\\', '/');
  if (!next.startsWith('.')) next = `./${next}`;
  return next;
}

function relocateImports(text, fromPath, toPath) {
  if (dirname(resolve(root, fromPath)) === dirname(resolve(root, toPath))) return text;
  const file = ts.createSourceFile(fromPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const previous = statement.moduleSpecifier.text;
    const next = rebasedSpecifier(previous, fromPath, toPath);
    if (next !== previous) {
      edits.push({ start: statement.moduleSpecifier.getStart(file) + 1, end: statement.moduleSpecifier.getEnd() - 1, text: next });
    }
  }
  return edits.sort((a, b) => b.start - a.start).reduce(
    (value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end),
    text,
  );
}

function uniqueName(base, occupied, id) {
  const safeId = id.toLowerCase().replace(/[^a-z0-9]+/gu, '_');
  let candidate = `${base}__${safeId}`;
  let counter = 2;
  while (occupied.has(candidate)) candidate = `${base}__${safeId}_${counter++}`;
  occupied.add(candidate);
  return candidate;
}

function sourceImportsAndRenameMap(entry, targetFile, sourceFileValue, destination) {
  const occupied = topLevelNames(targetFile);
  const targetByLocal = targetImports(targetFile);
  const renameBySymbol = new Map();
  const additions = [];

  const localName = (identifier, key) => {
    const original = identifier.text;
    if (targetByLocal.get(original) === key) return { shared: true, name: original };
    const name = occupied.has(original) ? uniqueName(original, occupied, entry.id) : original;
    occupied.add(name);
    if (name !== original) {
      const symbol = checker.getSymbolAtLocation(identifier);
      if (!symbol) throw new Error(`${entry.id}: unresolved import symbol ${original}`);
      renameBySymbol.set(symbol, { original, replacement: name });
    }
    return { shared: false, name };
  };

  for (const statement of sourceFileValue.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const nextModule = ts.factory.createStringLiteral(rebasedSpecifier(moduleName, entry.source, destination));
    const clause = statement.importClause;
    if (!clause) {
      additions.push(ts.factory.updateImportDeclaration(statement, statement.modifiers, statement.importClause, nextModule, statement.attributes));
      continue;
    }

    let defaultName;
    if (clause.name) {
      const resolved = localName(clause.name, importKey(moduleName, 'default', 'default', clause.isTypeOnly));
      if (!resolved.shared) defaultName = ts.factory.createIdentifier(resolved.name);
    }
    let namedBindings;
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      const resolved = localName(
        clause.namedBindings.name,
        importKey(moduleName, 'namespace', '*', clause.isTypeOnly),
      );
      if (!resolved.shared) namedBindings = ts.factory.createNamespaceImport(ts.factory.createIdentifier(resolved.name));
    } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      const elements = [];
      for (const element of clause.namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        const resolved = localName(
          element.name,
          importKey(moduleName, 'named', imported, clause.isTypeOnly || element.isTypeOnly),
        );
        if (!resolved.shared) {
          elements.push(ts.factory.createImportSpecifier(
            element.isTypeOnly,
            imported === resolved.name ? undefined : ts.factory.createIdentifier(imported),
            ts.factory.createIdentifier(resolved.name),
          ));
        }
      }
      if (elements.length > 0) namedBindings = ts.factory.createNamedImports(elements);
    }
    if (defaultName || namedBindings) {
      additions.push(ts.factory.updateImportDeclaration(
        statement,
        statement.modifiers,
        ts.factory.updateImportClause(clause, clause.isTypeOnly, defaultName, namedBindings),
        nextModule,
        statement.attributes,
      ));
    }
  }
  return { additions, renameBySymbol };
}

function transformedBody(file, renameBySymbol, fromPath, toPath) {
  const transformer = (context) => {
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) return undefined;
      if (
        ts.isStringLiteral(node)
        && ts.isCallExpression(node.parent)
        && node.parent.arguments[0] === node
        && (
          node.parent.expression.kind === ts.SyntaxKind.ImportKeyword
          || (
            ts.isPropertyAccessExpression(node.parent.expression)
            && ['mock', 'doMock', 'unmock', 'doUnmock'].includes(node.parent.expression.name.text)
          )
        )
      ) {
        return ts.factory.createStringLiteral(rebasedSpecifier(node.text, fromPath, toPath));
      }
      if (
        ts.isStringLiteral(node)
        && ts.isLiteralTypeNode(node.parent)
        && ts.isImportTypeNode(node.parent.parent)
      ) {
        return ts.factory.createStringLiteral(rebasedSpecifier(node.text, fromPath, toPath));
      }
      if (ts.isShorthandPropertyAssignment(node)) {
        const symbol = checker.getSymbolAtLocation(node.name);
        const rename = symbol && renameBySymbol.get(symbol);
        if (rename) {
          return ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier(rename.original),
            ts.factory.createIdentifier(rename.replacement),
          );
        }
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        const rename = symbol && renameBySymbol.get(symbol);
        if (rename) return ts.factory.createIdentifier(rename.replacement);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (rootNode) => ts.visitNode(rootNode, visit);
  };
  const result = ts.transform(file, [transformer]);
  try {
    return result.transformed[0].statements
      .filter((statement) => !ts.isImportDeclaration(statement))
      .map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, file))
      .join('\n\n');
  } finally {
    result.dispose();
  }
}

const outputs = [];
for (const entry of plan) {
  for (const key of ['id', 'target', 'source']) {
    if (typeof entry[key] !== 'string' || entry[key].length === 0) throw new Error(`invalid ${key} in merge plan`);
  }
  const destination = entry.destination ?? entry.target;
  if (entry.target === entry.source) throw new Error(`${entry.id}: target equals source`);
  const targetFile = sourceFile(entry.target);
  const sourceFileValue = sourceFile(entry.source);
  if (sourceFileValue.statements.some((statement) => statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))) {
    throw new Error(`${entry.id}: exported source statements require manual merge`);
  }
  let targetText = relocateImports(readFileSync(resolve(root, entry.target), 'utf8'), entry.target, destination);
  const relocatedTarget = ts.createSourceFile(destination, targetText, ts.ScriptTarget.Latest, true, extname(destination) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const { additions, renameBySymbol } = sourceImportsAndRenameMap(entry, relocatedTarget, sourceFileValue, destination);
  const importText = additions.map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, sourceFileValue)).join('\n');
  const lastImport = [...relocatedTarget.statements].filter(ts.isImportDeclaration).at(-1);
  const insertAt = lastImport?.getEnd() ?? 0;
  if (importText) targetText = `${targetText.slice(0, insertAt)}\n${importText}${targetText.slice(insertAt)}`;
  const body = transformedBody(sourceFileValue, renameBySymbol, entry.source, destination);
  targetText = `${targetText.trimEnd()}\n\n// ${entry.id}: physically merged from ${entry.source}.\n{\n${body}\n}\n`;
  outputs.push({ entry, destination, content: targetText });
}

if (mode === '--check') {
  for (const { entry, destination, content } of outputs) {
    console.log(`${entry.id}\t${entry.target} + ${entry.source} -> ${destination}\t${content.length} bytes`);
  }
} else {
  for (const { entry, destination, content } of outputs) {
    writeFileSync(resolve(root, destination), content, 'utf8');
    if (entry.target !== destination) unlinkSync(resolve(root, entry.target));
    if (entry.source !== destination) unlinkSync(resolve(root, entry.source));
  }
}
