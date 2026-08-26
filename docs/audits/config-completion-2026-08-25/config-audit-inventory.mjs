#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { analyzeConfigTruth } from '../../../scripts/lint-config-truth.mjs';

const root = resolve(new URL('../../..', import.meta.url).pathname);
const auditDir = resolve(new URL('.', import.meta.url).pathname);
const typesPath = join(root, 'src/core/config-types.ts');
const loaderPath = join(root, 'src/core/config.ts');
const inputPath = join(auditDir, 'evidence/project-config.corrupted-backup.input.json');
const outputPath = join(auditDir, 'field-universe.json');
const consumerPath = join(auditDir, 'consumer-index.json');
const matrixPath = join(auditDir, 'CONFIG-FIELD-MATRIX.md');

const typesText = readFileSync(typesPath, 'utf8');
const loaderText = readFileSync(loaderPath, 'utf8');
const truth = analyzeConfigTruth(typesText, loaderText, {
  typesPath: relative(root, typesPath),
  loaderPath: relative(root, loaderPath),
});

function walkFiles(directory, predicate, output = []) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walkFiles(path, predicate, output);
    else if (predicate(path)) output.push(path);
  }
  return output;
}

const INPUT_VALUE_KINDS = new Set(['array', 'boolean', 'null', 'number', 'object', 'string']);
function recordInputKind(output, path, kind) {
  const kinds = output.get(path) ?? new Set();
  kinds.add(kind);
  output.set(path, kinds);
}
function flattenInputShape(value, prefix = '', output = new Map()) {
  if (Array.isArray(value)) {
    if (value.length === 0) recordInputKind(output, `${prefix}[]`, 'array');
    value.forEach((item) => flattenInputShape(item, `${prefix}[]`, output));
    return output;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) recordInputKind(output, prefix, 'object');
    for (const [key, nested] of entries) flattenInputShape(nested, prefix ? `${prefix}.${key}` : key, output);
    return output;
  }
  recordInputKind(output, prefix, value === null ? 'null' : typeof value);
  return output;
}

const inputConfig = JSON.parse(readFileSync(inputPath, 'utf8'));
const inputShapeByPath = new Map([...flattenInputShape(inputConfig)]
  .map(([path, kinds]) => [path, [...kinds].sort().join('|')]));
const defaultParserArtifacts = [...truth.defaults.entries()]
  .filter(([path]) => /__spread__\d+$/.test(path))
  .map(([path, expression]) => ({
    path,
    expression,
    classification: 'SYNTHETIC_DEFAULT_SPREAD_PARSER_ARTIFACT',
  }));
const normalizedDefaultPaths = [...truth.defaults.keys()]
  .filter((path) => !/__spread__\d+$/.test(path));
const allPaths = new Set([
  ...truth.canonicalLeaves,
  ...normalizedDefaultPaths,
  ...truth.metadata.keys(),
  ...inputShapeByPath.keys(),
]);

const configSource = ts.createSourceFile(typesPath, typesText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const interfaces = new Map();
for (const statement of configSource.statements) {
  if (ts.isInterfaceDeclaration(statement)) interfaces.set(statement.name.text, statement);
}

const declarationPaths = new Map();
function propertyKey(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
}
function recordDeclaration(node, path) {
  const key = node.getStart(configSource);
  const existing = declarationPaths.get(key) ?? new Set();
  existing.add(path);
  declarationPaths.set(key, existing);
}
function unwrapType(node) {
  if (ts.isParenthesizedTypeNode(node)) return unwrapType(node.type);
  return node;
}
function mapType(node, path, seen) {
  node = unwrapType(node);
  if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) {
      if (member.kind !== ts.SyntaxKind.UndefinedKeyword && member.kind !== ts.SyntaxKind.NullKeyword) mapType(member, path, seen);
    }
    return;
  }
  if (ts.isTypeLiteralNode(node)) return mapMembers(node.members, path, seen);
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const target = interfaces.get(node.typeName.text);
    if (target && !seen.has(target.name.text)) {
      const next = new Set(seen);
      next.add(target.name.text);
      return mapMembers(target.members, path, next);
    }
  }
}
function mapMembers(members, prefix, seen) {
  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;
    const key = propertyKey(member.name);
    if (!key) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    recordDeclaration(member, path);
    mapType(member.type, path, seen);
  }
}
const rootInterface = interfaces.get('DeckentConfig');
if (!rootInterface) throw new Error('DeckentConfig interface not found');
const resolvedInterface = interfaces.get('ResolvedConfig');
if (!resolvedInterface) throw new Error('ResolvedConfig interface not found');
const interfaceRootNames = (declaration) => new Set(declaration.members
  .filter((member) => ts.isPropertySignature(member))
  .map((member) => propertyKey(member.name))
  .filter(Boolean));
const deckentConfigRootNames = interfaceRootNames(rootInterface);
const resolvedConfigRootNames = interfaceRootNames(resolvedInterface);
const deckentConfigRootPresence = new Map(rootInterface.members
  .filter((member) => ts.isPropertySignature(member))
  .map((member) => [propertyKey(member.name), member.questionToken ? 'optional' : 'required'])
  .filter(([name]) => Boolean(name)));

// `truth.runtime` is a textual object-literal parser result, not the public
// ResolvedConfig schema. Preserve every non-authored row as parser evidence but
// do not allow resolved-only/local-extension outputs to enter the authored path
// union merely because they occur in loadConfig's projection literal.
const runtimeParserArtifacts = [...truth.runtime.entries()]
  .filter(([path]) => !deckentConfigRootNames.has(path.split('.')[0]))
  .map(([path, expression]) => ({
    path,
    expression,
    classification: resolvedConfigRootNames.has(path.split('.')[0])
      ? 'RESOLVED_OUTPUT_ONLY'
      : 'NONCANONICAL_EXTENSION_OUTPUT',
  }));
for (const path of truth.runtime.keys()) {
  if (deckentConfigRootNames.has(path.split('.')[0])) allPaths.add(path);
}
mapMembers(rootInterface.members, '', new Set(['DeckentConfig']));
const syntacticDeclarationEvidence = new Map();
for (const [start, paths] of declarationPaths) {
  const position = configSource.getLineAndCharacterOfPosition(start);
  for (const path of paths) {
    const refs = syntacticDeclarationEvidence.get(path) ?? new Set();
    refs.add(`${relative(root, typesPath)}:${position.line + 1}`);
    syntacticDeclarationEvidence.set(path, refs);
  }
}

const configJson = ts.parseConfigFileTextToJson(join(root, 'tsconfig.json'), readFileSync(join(root, 'tsconfig.json'), 'utf8'));
if (configJson.error) throw new Error(ts.flattenDiagnosticMessageText(configJson.error.messageText, '\n'));
const parsedConfig = ts.parseJsonConfigFileContent(configJson.config, ts.sys, root);
const program = ts.createProgram({ rootNames: parsedConfig.fileNames, options: parsedConfig.options });
const checker = program.getTypeChecker();

// The repository truth gate deliberately follows only finite interfaces declared
// in config-types.ts. This second lane asks TypeScript for the full semantic type,
// including imported interfaces, arrays, records, aliases and discriminated unions.
const semanticLeaves = new Map();
const semanticPresence = new Map();
function recordSemanticPresence(path, selfOptional, optionalByAncestor) {
  if (!path) return;
  const states = semanticPresence.get(path) ?? new Set();
  states.add(`${selfOptional ? 1 : 0}:${optionalByAncestor ? 1 : 0}`);
  semanticPresence.set(path, states);
}
function addSemanticLeaf(path, declaration, selfOptional = false, optionalByAncestor = false) {
  if (!path) return;
  const refs = semanticLeaves.get(path) ?? new Set();
  if (declaration) refs.add(evidence(declaration.getSourceFile(), declaration));
  semanticLeaves.set(path, refs);
  recordSemanticPresence(path, selfOptional, optionalByAncestor);
}
function isPrimitiveType(type) {
  return Boolean(type.flags & (
    ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike |
    ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike | ts.TypeFlags.Null |
    ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never | ts.TypeFlags.Any |
    ts.TypeFlags.Unknown
  ));
}
function enumerateSemanticType(type, path, depth, stack, declaration, selfOptional = false, optionalByAncestor = false) {
  recordSemanticPresence(path, selfOptional, optionalByAncestor);
  if (depth > 16) return addSemanticLeaf(path, declaration, selfOptional, optionalByAncestor);
  if ((type.flags & ts.TypeFlags.Intersection) && type.types?.some(isPrimitiveType)) {
    return addSemanticLeaf(path, declaration, selfOptional, optionalByAncestor);
  }
  if (type.isUnion()) {
    const material = type.types.filter((member) => !(member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Never)));
    const unionSelfOptional = selfOptional || material.length !== type.types.length;
    if (material.length === 0 || material.every(isPrimitiveType)) {
      return addSemanticLeaf(path, declaration, unionSelfOptional, optionalByAncestor);
    }
    for (const member of material) {
      enumerateSemanticType(member, path, depth + 1, new Set(stack), declaration, unionSelfOptional, optionalByAncestor);
    }
    return;
  }
  if (isPrimitiveType(type)) return addSemanticLeaf(path, declaration, selfOptional, optionalByAncestor);
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const args = checker.getTypeArguments(type);
    const elementOptionalByAncestor = true;
    if (args.length === 0) return addSemanticLeaf(`${path}[]`, declaration, false, elementOptionalByAncestor);
    for (const arg of args) {
      enumerateSemanticType(arg, `${path}[]`, depth + 1, new Set(stack), declaration, false, elementOptionalByAncestor);
    }
    return;
  }
  const typeId = type.id ?? checker.typeToString(type);
  if (stack.has(typeId)) return addSemanticLeaf(path, declaration, selfOptional, optionalByAncestor);
  const nextStack = new Set(stack);
  nextStack.add(typeId);
  const properties = checker.getPropertiesOfType(type);
  const stringIndex = checker.getIndexTypeOfType(type, ts.IndexKind.String);
  if (properties.length === 0 && stringIndex) {
    return enumerateSemanticType(stringIndex, path ? `${path}.*` : '*', depth + 1, nextStack, declaration, false, true);
  }
  if (properties.length === 0) return addSemanticLeaf(path, declaration, selfOptional, optionalByAncestor);
  for (const property of properties) {
    const name = property.getName();
    if (name.startsWith('__@') || name === 'prototype') continue;
    const propertyDeclaration = property.valueDeclaration ?? property.declarations?.[0] ?? declaration;
    const propertyType = propertyDeclaration ? checker.getTypeOfSymbolAtLocation(property, propertyDeclaration) : checker.getDeclaredTypeOfSymbol(property);
    const propertySelfOptional = Boolean(property.flags & ts.SymbolFlags.Optional);
    enumerateSemanticType(
      propertyType,
      path ? `${path}.${name}` : name,
      depth + 1,
      nextStack,
      propertyDeclaration,
      propertySelfOptional,
      optionalByAncestor || selfOptional,
    );
  }
  if (stringIndex) {
    enumerateSemanticType(stringIndex, path ? `${path}.*` : '*', depth + 1, nextStack, declaration, false, true);
  }
}
const programTypesSource = program.getSourceFile(typesPath);
const programDeckentInterface = programTypesSource?.statements.find((statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === 'DeckentConfig');
if (!programDeckentInterface || !ts.isInterfaceDeclaration(programDeckentInterface)) throw new Error('Semantic DeckentConfig interface not found');
enumerateSemanticType(checker.getTypeAtLocation(programDeckentInterface.name), '', 0, new Set(), programDeckentInterface);
for (const path of semanticLeaves.keys()) allPaths.add(path);

const productionFiles = walkFiles(join(root, 'src'), (path) => /\.(?:ts|tsx)$/.test(path));
const scriptFiles = walkFiles(join(root, 'scripts'), (path) => /\.(?:ts|mjs)$/.test(path));
const testFiles = walkFiles(join(root, 'tests'), (path) => /\.(?:ts|tsx)$/.test(path));
const scanFiles = new Set([...productionFiles, ...scriptFiles, ...testFiles]);
const consumers = new Map();
const rawConfigFileCandidates = [];
const environmentRefs = [];
const environmentCandidates = [];
const literalPathRefs = [];
const heuristicCandidates = [];
const documentationCandidates = new Map();

function evidence(source, node) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(root, source.fileName)}:${position.line + 1}`;
}
function addConsumer(path, ref) {
  const list = consumers.get(path) ?? [];
  const signature = JSON.stringify(ref);
  if (!list.some((item) => JSON.stringify(item) === signature)) list.push(ref);
  consumers.set(path, list);
}
function addUniqueEvidence(list, item) {
  const signature = JSON.stringify(item);
  if (!list.some((existing) => JSON.stringify(existing) === signature)) list.push(item);
}
function chainParts(node) {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isThis(node)) return ['this'];
  if (ts.isPropertyAccessExpression(node)) {
    const left = chainParts(node.expression);
    return left ? [...left, node.name.text] : undefined;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) {
    const left = chainParts(node.expression);
    return left ? [...left, node.argumentExpression.text] : undefined;
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return chainParts(node.expression);
  }
  return undefined;
}
function accessKind(node) {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && parent.left === node) return 'write';
  if (ts.isDeleteExpression(parent)) return 'write';
  return 'read';
}
function functionContext(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText(current.getSourceFile());
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}
function declarationMatches(node, sourceInProgram) {
  if (!sourceInProgram) return [];
  const symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression);
  const paths = new Set();
  for (const declaration of symbol?.declarations ?? []) {
    if (resolve(declaration.getSourceFile().fileName) !== resolve(typesPath)) continue;
    for (const path of declarationPaths.get(declaration.getStart(declaration.getSourceFile())) ?? []) paths.add(path);
  }
  return [...paths];
}
function bestKnownSuffix(parts) {
  const matches = [...allPaths].filter((path) => {
    const pathParts = path.replaceAll('[]', '').split('.');
    return pathParts.length <= parts.length && pathParts.every((part, index) => part === '*' || part === parts[parts.length - pathParts.length + index]);
  });
  return matches.sort((a, b) => b.split('.').length - a.split('.').length || a.localeCompare(b))[0];
}

for (const fileName of scanFiles) {
  const programSource = program.getSourceFile(fileName);
  const source = programSource ?? ts.createSourceFile(fileName, readFileSync(fileName, 'utf8'), ts.ScriptTarget.Latest, true);
  const lane = fileName.startsWith(join(root, 'tests')) ? 'test' : fileName.startsWith(join(root, 'scripts')) ? 'script' : 'production';
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) {
      if (node.text.includes('config.json')) rawConfigFileCandidates.push({ evidence: evidence(source, node), value: node.text, lane });
      if (/^(?:DECKENT|CLAUDE|CODEX|OPENAI|GEMINI|CURSOR|OLLAMA|OPENROUTER)_/.test(node.text)) {
        environmentCandidates.push({ evidence: evidence(source, node), name: node.text, lane });
      }
      if (allPaths.has(node.text)) literalPathRefs.push({ evidence: evidence(source, node), path: node.text, lane });
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const parts = chainParts(node);
      if (parts?.[0] === 'process' && parts[1] === 'env' && parts.length === 3) {
        addUniqueEvidence(environmentRefs, {
          evidence: evidence(source, node),
          name: parts[2],
          lane,
          access: accessKind(node),
          expression: node.getText(source).replace(/\s+/g, ' '),
          bindingKind: 'process.env.static',
        });
      } else if (ts.isElementAccessExpression(node)
        && node.expression.getText(source) === 'process.env'
        && node.argumentExpression
        && !ts.isStringLiteralLike(node.argumentExpression)) {
        addUniqueEvidence(environmentRefs, {
          evidence: evidence(source, node),
          name: null,
          lane,
          access: accessKind(node),
          expression: node.getText(source).replace(/\s+/g, ' '),
          bindingKind: 'process.env.dynamic',
        });
      }
      if (parts) {
        const typedMatches = declarationMatches(node, Boolean(programSource));
        const suffix = bestKnownSuffix(parts);
        const paths = typedMatches.length > 0 ? typedMatches : suffix ? [suffix] : [];
        const rootLooksConfig = parts.some((part) => /(?:config|cfg|settings|resolved)/i.test(part));
        for (const path of paths) {
          if (typedMatches.length > 0 || rootLooksConfig) {
            addConsumer(path, {
              evidence: evidence(source, node),
              lane,
              access: accessKind(node),
              expression: node.getText(source).replace(/\s+/g, ' '),
              context: functionContext(node),
            });
          }
        }
        if (paths.length === 0 && rootLooksConfig && parts.length > 1) {
          heuristicCandidates.push({ evidence: evidence(source, node), lane, expression: node.getText(source).replace(/\s+/g, ' '), candidatePath: parts.slice(parts.findIndex((part) => /(?:config|cfg|settings|resolved)/i.test(part)) + 1).join('.') });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

for (const path of consumers.keys()) allPaths.add(path);
function patternMatches(pattern, concrete) {
  const patternParts = pattern.replaceAll('[]', '').split('.');
  const concreteParts = concrete.replaceAll('[]', '').split('.');
  return patternParts.length <= concreteParts.length && patternParts.every((part, index) => part === '*' || part === concreteParts[index]);
}
function contractAncestor(path) {
  return [...allPaths]
    .filter((candidate) => candidate !== path && patternMatches(candidate, path) && (
      semanticPresence.has(candidate) || truth.canonicalLeaves.includes(candidate) || truth.defaults.has(candidate) || truth.runtime.has(candidate)
    ))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}
function dynamicContractAncestor(path) {
  return [...allPaths]
    .filter((candidate) => candidate !== path
      && (candidate.includes('*') || candidate.includes('[]'))
      && patternMatches(candidate, path)
      && (semanticPresence.has(candidate) || semanticLeaves.has(candidate)))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

const documentationFiles = [
  ...walkFiles(join(root, 'docs'), (path) => /\.(?:md|mdx)$/i.test(path) && !path.startsWith(auditDir)),
  ...['README.md', 'DECKENT.md', 'CLAUDE.md', 'AGENTS.md']
    .map((name) => join(root, name))
    .filter((path) => existsSync(path)),
];
const dynamicDocumentationPaths = [...allPaths].filter((path) => path.includes('*'));
const documentationTokenPattern = /[A-Za-z_][\w-]*(?:\[\])?(?:\.(?:[A-Za-z_][\w-]*|\*)(?:\[\])?)*/g;
for (const fileName of documentationFiles) {
  const lines = readFileSync(fileName, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const tokens = new Set(line.match(documentationTokenPattern) ?? []);
    for (const token of tokens) {
      const matches = new Set();
      if (allPaths.has(token)) matches.add(token);
      for (const pattern of dynamicDocumentationPaths) {
        if (patternMatches(pattern, token)) matches.add(pattern);
      }
      for (const path of matches) {
        const refs = documentationCandidates.get(path) ?? [];
        if (refs.length < 20) refs.push({ evidence: `${relative(root, fileName)}:${index + 1}`, token });
        documentationCandidates.set(path, refs);
      }
    }
  });
}
function presenceMode(path) {
  const states = [...(semanticPresence.get(path) ?? [])];
  if (states.length === 0) return deckentConfigRootPresence.get(path) ?? null;
  if (states.includes('0:0')) return 'required';
  if (states.every((state) => state.startsWith('1:'))) return 'optional';
  return 'required_when_parent_present';
}
function dimension(disposition, reason, evidenceRows = []) {
  return { disposition, reason, evidence: evidenceRows.slice(0, 20) };
}
function referenceEvidence(refs) {
  return refs.map((ref) => `${ref.evidence}${ref.context ? ` [${ref.context}]` : ''} :: ${ref.expression}`);
}
function fieldDimensions(row) {
  const refs = row.references;
  const declarationRefs = new Set([
    ...row.semanticDeclarations,
    ...(syntacticDeclarationEvidence.get(row.path) ?? []),
  ]);
  const validationRefs = refs.filter((ref) => /(?:validate|validation|schema|parse|assert|canonicaliz|normaliz)/i.test(`${ref.evidence} ${ref.context ?? ''}`));
  const resolutionRefs = refs.filter((ref) => /(?:loadConfig|mergeConfigs|resolve[A-Z_]|interpolateConfig|createDefaultConfig)/.test(ref.context ?? ''));
  const nonBehaviorFiles = /src\/core\/(?:config(?:-types|-migration)?|.*canonicalizer)\.ts:/;
  const behaviorRefs = refs.filter((ref) => (ref.lane === 'production' || ref.lane === 'script')
    && !nonBehaviorFiles.test(ref.evidence)
    && !validationRefs.includes(ref)
    && !resolutionRefs.includes(ref));
  const operatorRefs = refs.filter((ref) => /^src\/(?:cli|mcp|api|dashboard|connectors|extensions)\//.test(ref.evidence));
  const testRefs = refs.filter((ref) => ref.lane === 'test');
  const lifecycleRefs = refs.filter((ref) => /(?:config-migration|canonicalizer|deprecat|migrat)/i.test(`${ref.evidence} ${ref.context ?? ''}`));
  const docRefs = documentationCandidates.get(row.path) ?? [];
  const keyInstantiatedContract = row.dynamicContractEvidence.length > 0;

  const declaration = row.provenance.deckentConfig
    ? dimension(
      'STATIC_EVIDENCE',
      'DeckentConfig AST/TypeChecker declaration evidence exists; this proves declaration only.',
      declarationRefs.size > 0 ? [...declarationRefs] : [`${relative(root, typesPath)}:1017 (root contract fallback)`],
    )
    : row.dynamicAncestor
      ? dimension('NOT_APPLICABLE', `Concrete/dynamic descendant is governed by typed ancestor ${row.dynamicAncestor}.`, [row.dynamicAncestor])
      : dimension('NONE_FOUND_STATIC', 'No DeckentConfig declaration evidence was found for this path.');

  const defaultDisposition = row.provenance.createDefaultConfig
    ? dimension(
      'STATIC_EVIDENCE',
      'Textual createDefaultConfig/default parser evidence exists; named-resolver and effective semantics are evaluated separately.',
      [`${relative(root, loaderPath)}:1897 :: ${row.defaultExpression}`],
    )
    : keyInstantiatedContract
      ? dimension('NOT_APPLICABLE', `No per-key/per-element default is required by this wildcard/repeated contract${row.dynamicAncestor ? ` governed by ${row.dynamicAncestor}` : ''}.`, row.dynamicContractEvidence)
      : dimension('NONE_FOUND_STATIC', `No explicit textual default found; presenceMode=${row.presenceMode ?? 'unknown'} and absence is not automatically a defect.`);

  let effectiveResolution;
  if (row.provenance.truthRuntimeParser && typeof row.resolvedExpression === 'string' && row.resolvedExpression.startsWith('__CONFIG_PATH_MISSING__')) {
    effectiveResolution = dimension('NONE_FOUND_STATIC', 'The textual runtime parser emitted an explicit missing-path sentinel; no effective-resolution proof exists.', [`${relative(root, loaderPath)}:2363 :: ${row.resolvedExpression}`]);
  } else if (row.provenance.truthRuntimeParser || resolutionRefs.length > 0) {
    effectiveResolution = dimension(
      'HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF',
      'A projection/resolver reference exists, but static text does not prove the effective runtime value or precedence.',
      [...(row.provenance.truthRuntimeParser ? [`${relative(root, loaderPath)}:2363 :: ${row.resolvedExpression}`] : []), ...referenceEvidence(resolutionRefs)],
    );
  } else {
    const ancestor = row.contractAncestor && truth.runtime.has(row.contractAncestor) ? row.contractAncestor : null;
    effectiveResolution = ancestor
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', `Resolution may be inherited through ancestor ${ancestor}; no leaf runtime proof exists.`, [`${relative(root, loaderPath)}:2363 :: ${truth.runtime.get(ancestor)}`])
      : dimension('NONE_FOUND_STATIC', 'No textual runtime projection or resolver reference was found.');
  }

  return {
    declaration,
    default: defaultDisposition,
    validation: validationRefs.length > 0
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', 'Validator/schema-like static references exist; execution and rejection behavior were not proven per field.', referenceEvidence(validationRefs))
      : dimension('NONE_FOUND_STATIC', 'No validator/schema-like static reference was found for this path.'),
    effectiveResolution,
    behavioralConsumer: behaviorRefs.length > 0
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', 'Non-config production/static references exist; they are consumer candidates, not behavioral runtime proof.', referenceEvidence(behaviorRefs))
      : dimension('NONE_FOUND_STATIC', 'No non-config production consumer candidate was found statically.'),
    operatorSurface: operatorRefs.length > 0
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', 'CLI/MCP/API/Dashboard/connector static references exist; operator reachability and behavior were not executed.', referenceEvidence(operatorRefs))
      : dimension('NONE_FOUND_STATIC', 'No operator-surface static reference was found.'),
    documentation: docRefs.length > 0
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', 'Documentation token matches exist; semantic accuracy and currentness were not inferred from token presence.', docRefs.map((ref) => `${ref.evidence} :: ${ref.token}`))
      : dimension('NONE_FOUND_STATIC', 'No exact/wildcard documentation token candidate was found.'),
    tests: testRefs.length > 0
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', 'Test-source references exist; per-field behavioral coverage is not inferred from static presence.', referenceEvidence(testRefs))
      : dimension('NONE_FOUND_STATIC', 'No test-source static reference was found for this path.'),
    lifecycleMigration: lifecycleRefs.length > 0
      ? dimension('HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF', 'Migration/canonicalizer/deprecation static references exist; lifecycle behavior and round-trip were not proven per field.', referenceEvidence(lifecycleRefs))
      : dimension('NONE_FOUND_STATIC', 'No migration/canonicalizer/deprecation static reference was found for this path.'),
  };
}
function classify(row) {
  const p = row.provenance;
  if (!p.deckentConfig && row.dynamicAncestor) return 'DYNAMIC_DESCENDANT';
  if (p.inputSnapshot && !p.deckentConfig) return 'INPUT_ONLY_UNDECLARED';
  if (p.deckentConfig && !p.createDefaultConfig) {
    if (row.presenceMode === 'optional') return 'OPTIONAL_NO_EXPLICIT_DEFAULT';
    if (row.presenceMode === 'required_when_parent_present') return 'CONDITIONAL_NO_EXPLICIT_DEFAULT';
    return 'REQUIRED_NO_DEFAULT';
  }
  if (p.createDefaultConfig && !p.truthRuntimeParser) return 'DEFAULT_NO_RUNTIME_PROJECTION';
  if (p.truthRuntimeParser && !p.deckentConfig) return 'RUNTIME_PROJECTION_UNDECLARED';
  if (p.deckentConfig && !p.productionConsumer) return 'NO_STATIC_PRODUCTION_CONSUMER';
  if (p.deckentConfig && p.createDefaultConfig && p.truthRuntimeParser && p.productionConsumer) return 'STATIC_CHAIN_PRESENT';
  return 'PARTIAL_CHAIN';
}
const fieldRows = [...allPaths].sort().map((path) => {
  const row = {
  path,
  provenance: {
    deckentConfig: semanticPresence.has(path) || semanticLeaves.has(path) || truth.canonicalLeaves.includes(path) || deckentConfigRootNames.has(path),
    truthGateCanonical: truth.canonicalLeaves.includes(path),
    createDefaultConfig: truth.defaults.has(path),
    truthRuntimeParser: truth.runtime.has(path),
    resolvedConfigRoot: resolvedConfigRootNames.has(path.split('.')[0]),
    configMetadata: truth.metadata.has(path),
    inputSnapshot: inputShapeByPath.has(path),
    productionConsumer: (consumers.get(path) ?? []).some((item) => item.lane === 'production' || item.lane === 'script'),
    testReference: (consumers.get(path) ?? []).some((item) => item.lane === 'test'),
  },
  defaultExpression: truth.defaults.get(path) ?? null,
  resolvedExpression: truth.runtime.get(path) ?? null,
  metadataDefaultExpression: truth.metadata.get(path) ?? null,
  inputPresent: inputShapeByPath.has(path),
  inputValueKind: inputShapeByPath.get(path) ?? null,
  references: consumers.get(path) ?? [],
  contractAncestor: contractAncestor(path),
  dynamicAncestor: dynamicContractAncestor(path),
  dynamicAncestorKind: null,
  dynamicContractEvidence: [],
  semanticDeclarations: [...(semanticLeaves.get(path) ?? [])].sort(),
  presenceMode: presenceMode(path),
  };
  row.dynamicAncestorKind = row.dynamicAncestor
    ? row.dynamicAncestor.includes('*') && row.dynamicAncestor.includes('[]')
      ? 'wildcard_and_repeated'
      : row.dynamicAncestor.includes('*')
        ? 'wildcard'
        : 'repeated'
    : null;
  row.dynamicContractEvidence = row.dynamicAncestor
    ? [row.dynamicAncestor]
    : /(?:^|\.)\*(?:\.|$)|\[\]/.test(row.path)
      ? [row.path]
      : [];
  const classified = { ...row, staticStatus: classify(row) };
  return { ...classified, dimensions: fieldDimensions(classified) };
});
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
const dimensionDispositionCounts = Object.fromEntries(dimensionKeys.map((key) => [
  key,
  Object.fromEntries(Object.entries(Object.groupBy(fieldRows, (row) => row.dimensions[key].disposition))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([disposition, rows]) => [disposition, rows.length])),
]));

// Guard the boundary between ordinary typed containers and genuine
// wildcard/repeated contracts. A generic ancestor is useful provenance, but it
// must never make an undeclared ordinary child look schema-governed.
const fieldByPath = new Map(fieldRows.map((row) => [row.path, row]));
for (const path of [
  'approval.authority',
  'approval.authority.oidc',
  'approval.authority.terminal',
  'approval.lifecycle',
  'cross_verify.verifier_tier_authority',
  'identity.owner',
  'local_llm.acceleration',
  'openrouter.reasoning',
  'prompt.canary_thresholds',
  'timeout.adaptive_multiplier',
  'timeout.runtime_extension_max',
]) {
  assert.equal(fieldByPath.get(path)?.dynamicAncestor, null, `${path} must not inherit an ordinary ancestor as a dynamic contract`);
}
assert.notEqual(fieldByPath.get('approval.authority')?.dimensions.declaration.disposition, 'NOT_APPLICABLE');
assert.notEqual(fieldByPath.get('worker_output_contract.enabled')?.dimensions.default.disposition, 'NOT_APPLICABLE');
assert.equal(fieldByPath.get('modes.api.max_workers')?.dynamicAncestor, 'modes.*.max_workers');
for (const row of fieldRows) {
  if (!Object.values(row.dimensions).some((value) => value.disposition === 'NOT_APPLICABLE')) continue;
  assert.ok(row.dynamicContractEvidence.length > 0, `${row.path} has NOT_APPLICABLE without dynamic-contract evidence`);
  assert.ok(row.dynamicContractEvidence.every((value) => value.includes('*') || value.includes('[]')), `${row.path} has non-dynamic NOT_APPLICABLE evidence`);
}
for (const row of fieldRows) {
  assert.equal(Object.hasOwn(row, 'inputValue'), false, `${row.path} must not serialize raw snapshot inputValue`);
  assert.equal(row.inputPresent, row.provenance.inputSnapshot, `${row.path} input presence projections disagree`);
  if (!row.inputPresent) {
    assert.equal(row.inputValueKind, null, `${row.path} has an input kind without input presence`);
    continue;
  }
  assert.ok(
    row.inputValueKind.split('|').every((kind) => INPUT_VALUE_KINDS.has(kind)),
    `${row.path} has a non-allowlisted input value kind`,
  );
}

const generatedAt = new Date().toISOString();
const fieldUniverse = {
  schemaVersion: 2,
  generatedAt,
  baseSha: 'ff48978fb78139ea34b8c5e98fc41532437af9c9',
  inputSha256: '34b6a7c25bca9a02ff2901682868e86ad4fc3bead05b2c4e5061cb249a686edb',
  inputProjectionPolicy: {
    rawValuesSerialized: false,
    rowFields: ['inputPresent', 'inputValueKind'],
    allowedValueKinds: [...INPUT_VALUE_KINDS].sort(),
  },
  counts: {
    unionPaths: fieldRows.length,
    deckentConfigRoots: deckentConfigRootNames.size,
    deckentConfigLeaves: truth.canonicalLeaves.length,
    semanticDeckentConfigLeaves: semanticLeaves.size,
    defaultLeaves: truth.defaults.size,
    normalizedDefaultPaths: normalizedDefaultPaths.length,
    defaultParserArtifacts: defaultParserArtifacts.length,
    resolvedConfigRoots: resolvedConfigRootNames.size,
    truthRuntimeParserLeaves: truth.runtime.size,
    runtimeParserArtifacts: runtimeParserArtifacts.length,
    configMetadataDefaults: truth.metadata.size,
    inputSnapshotLeaves: inputShapeByPath.size,
    truthIssues: truth.issues.length,
  },
  fields: fieldRows,
  dimensionDispositionCounts,
  defaultParserArtifacts,
  runtimeParserArtifacts,
  truthIssues: truth.issues,
};
const fieldUniverseJson = JSON.stringify(fieldUniverse, null, 2);
assert.doesNotMatch(fieldUniverseJson, /"inputValue"\s*:/, 'field-universe projection must be raw-input-value-free');
writeFileSync(outputPath, `${fieldUniverseJson}\n`);
writeFileSync(consumerPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt,
  baseSha: 'ff48978fb78139ea34b8c5e98fc41532437af9c9',
  counts: {
    matchedPaths: consumers.size,
    references: [...consumers.values()].reduce((sum, refs) => sum + refs.length, 0),
    rawConfigFileCandidates: rawConfigFileCandidates.length,
    environmentReferences: environmentRefs.length,
    environmentCandidates: environmentCandidates.length,
    documentationCandidatePaths: documentationCandidates.size,
    documentationCandidateReferences: [...documentationCandidates.values()].reduce((sum, refs) => sum + refs.length, 0),
    literalPathReferences: literalPathRefs.length,
    heuristicCandidates: heuristicCandidates.length,
  },
  consumers: Object.fromEntries([...consumers].sort(([a], [b]) => a.localeCompare(b))),
  rawConfigFileCandidates,
  environmentReferences: environmentRefs,
  environmentCandidates,
  literalPathReferences: literalPathRefs,
  heuristicCandidates,
}, null, 2)}\n`);

function compact(value) {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, 96);
}
function dimensionCell(value) {
  return `${value.disposition}<br><sub>${compact(value.reason)}</sub>`;
}
const statusCounts = Object.fromEntries(Object.entries(Object.groupBy(fieldRows, (row) => row.staticStatus))
  .sort(([a], [b]) => a.localeCompare(b)).map(([status, rows]) => [status, rows.length]));
const matrixLines = [
  '# Deckent Configuration Field Matrix',
  '',
  '> Generated by `config-audit-inventory.mjs` against pinned base `ff48978f`. Static evidence is a coverage baseline, not a final runtime verdict. `DYNAMIC_DESCENDANT` means the concrete snapshot path is governed by the named typed container.',
  '',
  '## Coverage summary',
  '',
  `- Union paths: ${fieldRows.length}`,
  `- DeckentConfig roots: ${deckentConfigRootNames.size}`,
  `- Typed DeckentConfig leaves: ${truth.canonicalLeaves.length}`,
  `- Semantic DeckentConfig leaves (imports/records/arrays expanded): ${semanticLeaves.size}`,
  `- Raw createDefaultConfig parser leaves: ${truth.defaults.size}`,
  `- Normalized default paths: ${normalizedDefaultPaths.length}`,
  `- Quarantined default-parser artifacts: ${defaultParserArtifacts.length}`,
  `- Public ResolvedConfig roots: ${resolvedConfigRootNames.size}`,
  `- Truth runtime-parser leaves: ${truth.runtime.size}`,
  `- Quarantined runtime-parser artifacts: ${runtimeParserArtifacts.length}`,
  `- Input snapshot leaves: ${inputShapeByPath.size}`,
  `- Config-truth issues: ${truth.issues.length}`,
  ...Object.entries(statusCounts).map(([status, count]) => `- ${status}: ${count}`),
  '',
  '## Per-path matrix',
  '',
  '| # | Path | Input presence / value-free kind | Typed | Presence | Default expr | Runtime expr | Static status | Declaration | Default | Validation | Effective resolution | Behavioral consumer | Operator surface | Docs | Tests | Lifecycle / migration |',
  '|---:|---|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
fieldRows.forEach((row, index) => {
  matrixLines.push(`| ${index + 1} | \`${row.path}\` | ${row.inputPresent ? `yes (${row.inputValueKind})` : 'no'} | ${row.provenance.deckentConfig ? 'yes' : 'no'} | ${row.presenceMode ?? '—'} | ${compact(row.defaultExpression)} | ${compact(row.resolvedExpression)} | ${row.staticStatus} | ${dimensionCell(row.dimensions.declaration)} | ${dimensionCell(row.dimensions.default)} | ${dimensionCell(row.dimensions.validation)} | ${dimensionCell(row.dimensions.effectiveResolution)} | ${dimensionCell(row.dimensions.behavioralConsumer)} | ${dimensionCell(row.dimensions.operatorSurface)} | ${dimensionCell(row.dimensions.documentation)} | ${dimensionCell(row.dimensions.tests)} | ${dimensionCell(row.dimensions.lifecycleMigration)} |`);
});
matrixLines.push(
  '',
  '## Default-parser quarantine',
  '',
  '`truth.defaults` is also textual. Synthetic spread placeholders are retained as parser evidence but excluded from the authored field union.',
  '',
  '| Path | Classification | Parser expression |',
  '|---|---|---|',
  ...defaultParserArtifacts.map((row) => `| \`${row.path}\` | ${row.classification} | ${compact(row.expression)} |`),
  '',
  '## Runtime-parser quarantine',
  '',
  '`truth.runtime` is a textual projection parser, not the public `ResolvedConfig` schema. The following rows are retained as evidence but excluded from the authored config-path union unless another authored/input/metadata source independently admits them.',
  '',
  '| Path | Classification | Parser expression |',
  '|---|---|---|',
  ...runtimeParserArtifacts.map((row) => `| \`${row.path}\` | ${row.classification} | ${compact(row.expression)} |`),
  '',
  '## Interpretation boundary',
  '',
  '`required_when_parent_present` means the leaf is mandatory only after its optional ancestor block is authored; it is not an unconditional default requirement. Input projection is value-free: rows expose only presence and an allowlisted non-sensitive value kind; raw snapshot scalars are never serialized. Every field row carries all nine charter dimensions. `STATIC_EVIDENCE` proves only the named static dimension. `HOLD_STATIC_CANDIDATE_NOT_BEHAVIOR_PROOF` explicitly forbids promoting a source reference, self-reference, docs token, or test token to executed behavior. `NONE_FOUND_STATIC` and `NOT_APPLICABLE` are typed negative dispositions with per-row reasons in both this matrix and `field-universe.json`.',
  '',
);
writeFileSync(matrixPath, `${matrixLines.join('\n')}\n`);

console.log(JSON.stringify({ outputPath, consumerPath, matrixPath, fields: fieldRows.length, consumers: consumers.size, truthIssues: truth.issues.length, statusCounts }));
