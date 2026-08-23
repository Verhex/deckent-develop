#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Authority is granted to exact symbols, never to a whole file. Helpers are
// listed only when they directly own a canonical publication/verified move.
const CANONICAL_WRITER_SYMBOLS = new Map([
  ['src/core/runtime-evaluation-retention.ts', new Set([
    'refreshManifest',
  ])],
  ['src/core/sprint-archive.ts', new Set([
    'publishVerifiedCopy',
    'publishSprintArchiveArtifact',
    'moveVerified',
    'archiveTaskArtifacts',
    'writeTaskArtifactPreservationMarker',
    'writeJsonAtomic',
    'reconcileSprintArchive',
    'sealSprintArchiveTerminal',
    'writeFileAtomic',
  ])],
]);
const VERIFIED_LEGACY_RETIREMENT_SYMBOLS = new Map([
  ['src/core/sprint-archive.ts', new Set([
    'publishSprintArchiveArtifact',
    'moveVerified',
    'archiveTaskArtifacts',
    'removeEmptyTree',
    'reconcileSprintArchive',
  ])],
]);

const DIRECT_WRITES = new Map([
  ['appendFile', [0]], ['appendFileSync', [0]],
  ['createWriteStream', [0]],
  ['mkdtemp', [0]], ['mkdtempSync', [0]],
  ['mkdir', [0]], ['mkdirSync', [0]],
  ['open', [0]], ['openSync', [0]],
  ['truncate', [0]], ['truncateSync', [0]],
  ['writeFile', [0]], ['writeFileSync', [0]],
]);
const DESTINATION_WRITES = new Map([
  ['copyFile', [1]], ['copyFileSync', [1]],
  ['cp', [1]], ['cpSync', [1]],
  ['link', [1]], ['linkSync', [1]],
  ['symlink', [1]], ['symlinkSync', [1]],
  ['rename', [1]], ['renameSync', [1]],
]);
const RETIREMENTS = new Map([
  ['rm', [0]], ['rmSync', [0]],
  ['rmdir', [0]], ['rmdirSync', [0]],
  ['unlink', [0]], ['unlinkSync', [0]],
  ['rename', [0]], ['renameSync', [0]],
]);
const MUTATION_NAMES = new Set([
  ...DIRECT_WRITES.keys(), ...DESTINATION_WRITES.keys(), ...RETIREMENTS.keys(),
]);
const PATH_CALLS = new Set(['basename', 'dirname', 'join', 'normalize', 'resolve']);
const FS_MODULES = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises']);
const PATH_MODULES = new Set(['path', 'node:path', 'path/posix', 'node:path/posix', 'path/win32', 'node:path/win32']);
const STATIC_PATH_SYMBOLS = new Map([
  ['DECKENT_DIR', '.deckent'],
  ['BRAIN_DIR', '.brain'],
  ['TASKS_DIR', '.tasks'],
  ['ARCHIVE_DIR', 'archive'],
  ['ARCHIVE_SPRINTS_SUBDIR', 'sprints'],
  ['LEGACY_TASK_ARCHIVE', 'archive'],
  ['LEGACY_TASK_ARCHIVE_SUBDIR', 'archive'],
]);
const CANONICAL_ARCHIVE_RESOLVERS = new Set(['resolveSprintArchiveDir']);
const CONSTANTS_MODULE = /(?:^|\/)constants(?:\.js)?$/u;
const SPRINT_ARCHIVE_MODULE = /(?:^|\/)sprint-archive(?:\.js)?$/u;
const OBSERVABILITY_ROTATION_FILE = 'src/core/observability-rotation.ts';
const TERMINAL_ARCHIVE_SIDECARS = new Set([
  'terminal-seal-receipt.json',
  'terminal-seal-application.json',
]);
const LOCAL_ARCHIVE_ADMISSION_HELPER = /(?:assert|admit|guard|check).*(?:archive|namespace).*(?:safe|writable|sealed|admission)|(?:archive|namespace).*(?:admission|writable)/iu;

export function portableArchivePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function sourceFiles(root) {
  const start = resolve(root, 'src');
  try { if (!statSync(start).isDirectory()) return []; } catch { return []; }
  const files = [];
  const ignoredDirectories = new Set(['node_modules', 'dist', 'out', 'coverage', '.vite']);
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(directory, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) visit(full);
      else if (entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(entry.name)
        && !/\.d\.[cm]?ts$/u.test(entry.name)) files.push(full);
    }
  };
  visit(start);
  return files;
}

function moduleName(node) {
  return ts.isStringLiteral(node) ? node.text : '';
}

function loadedModule(expression) {
  const node = unwrap(expression);
  if (!ts.isCallExpression(node) || node.arguments.length !== 1) return '';
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  return isRequire || isDynamicImport ? moduleName(node.arguments[0]) : '';
}

function bindingScope(declaration) {
  if (ts.isParameter(declaration)) return declaration.parent;
  const declarationList = ts.isVariableDeclaration(declaration)
    && ts.isVariableDeclarationList(declaration.parent) ? declaration.parent : null;
  const functionScoped = declarationList && !(declarationList.flags & ts.NodeFlags.BlockScoped);
  let current = declaration.parent;
  while (current) {
    if (ts.isSourceFile(current) || (functionScoped && ts.isFunctionLike(current))) return current;
    if (!functionScoped && (ts.isBlock(current) || ts.isModuleBlock(current) || ts.isCaseBlock(current)
      || ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)
      || ts.isCatchClause(current))) return current;
    current = current.parent;
  }
  return declaration.getSourceFile();
}

function addBinding(map, declaration, initializer) {
  if (!ts.isIdentifier(declaration.name)) return;
  const name = declaration.name.text;
  const entries = map.get(name) ?? [];
  entries.push({ declaration, initializer, assignments: [], scope: bindingScope(declaration) });
  map.set(name, entries);
}

function visibleBinding(identifier, bindings) {
  const entries = bindings.values.get(identifier.text) ?? [];
  const candidates = [];
  for (const entry of entries) {
    let current = identifier;
    let distance = 0;
    while (current && current !== entry.scope) { current = current.parent; distance += 1; }
    if (current === entry.scope) candidates.push({ ...entry, distance });
  }
  if (candidates.length === 0) return { found: false, initializer: null, declaration: null };
  const nearestDistance = Math.min(...candidates.map(candidate => candidate.distance));
  const nearest = candidates.filter(candidate => candidate.distance === nearestDistance)
    .sort((left, right) => right.declaration.getStart() - left.declaration.getStart());
  const preceding = nearest.find(candidate => candidate.declaration.getStart() <= identifier.getStart());
  // A same-scope declaration after the use still shadows outer bindings (TDZ).
  const assignment = preceding?.assignments
    .filter(candidate => candidate.position <= identifier.getStart())
    .sort((left, right) => right.position - left.position)[0];
  return preceding
    ? {
      found: true,
      initializer: assignment?.initializer ?? preceding.initializer,
      declaration: preceding.declaration,
    }
    : { found: true, initializer: null, declaration: nearest[0].declaration };
}

/** Collect bindings first, so a const or import alias is decidable at every call site. */
function collectBindings(source) {
  const fsAliases = new Map();
  const pathAliases = new Map();
  const fsAliasDeclarations = new Set();
  const pathAliasDeclarations = new Set();
  const fsNamespaces = new Set();
  const pathNamespaces = new Set();
  const fsNamespaceDeclarations = new Set();
  const pathNamespaceDeclarations = new Set();
  const fsConstantsNamespaces = new Set();
  const fsConstantsDeclarations = new Set();
  const staticPathAliases = new Map();
  const staticPathAliasDeclarations = new Set();
  const canonicalResolverAliases = new Set();
  const canonicalResolverDeclarations = new Set();
  const values = new Map();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = moduleName(statement.moduleSpecifier);
    const clause = statement.importClause;
    if (!clause) continue;
    const isFs = FS_MODULES.has(specifier);
    const isPath = PATH_MODULES.has(specifier);
    if (clause.name) {
      addBinding(values, clause, null);
      if (isFs || isPath) {
        (isFs ? fsNamespaces : pathNamespaces).add(clause.name.text);
        (isFs ? fsNamespaceDeclarations : pathNamespaceDeclarations).add(clause);
      }
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      addBinding(values, bindings, null);
      if (isFs || isPath) {
        (isFs ? fsNamespaces : pathNamespaces).add(bindings.name.text);
        (isFs ? fsNamespaceDeclarations : pathNamespaceDeclarations).add(bindings);
      }
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        addBinding(values, element, null);
        if (isFs || isPath) {
          (isFs ? fsAliases : pathAliases).set(element.name.text, imported);
          (isFs ? fsAliasDeclarations : pathAliasDeclarations).add(element);
        }
        if ((isFs && imported === 'promises')
          || (isPath && (imported === 'posix' || imported === 'win32'))) {
          (isFs ? fsNamespaces : pathNamespaces).add(element.name.text);
          (isFs ? fsNamespaceDeclarations : pathNamespaceDeclarations).add(element);
        }
        if (isFs && imported === 'constants') {
          fsConstantsNamespaces.add(element.name.text);
          fsConstantsDeclarations.add(element);
        }
        if (CONSTANTS_MODULE.test(specifier) && STATIC_PATH_SYMBOLS.has(imported)) {
          staticPathAliases.set(element.name.text, STATIC_PATH_SYMBOLS.get(imported));
          staticPathAliasDeclarations.add(element);
        }
        if (SPRINT_ARCHIVE_MODULE.test(specifier) && CANONICAL_ARCHIVE_RESOLVERS.has(imported)) {
          canonicalResolverAliases.add(element.name.text);
          canonicalResolverDeclarations.add(element);
        }
      }
    }
  }

  const collect = node => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addBinding(values, node, node);
    } else if (ts.isVariableDeclaration(node)) {
      addBinding(values, node, node.initializer ?? null);
      if (!node.initializer) {
        ts.forEachChild(node, collect);
        return;
      }
      if (ts.isIdentifier(node.name)) {
        const loaded = loadedModule(node.initializer);
        if (FS_MODULES.has(loaded)) {
          fsNamespaces.add(node.name.text);
          fsNamespaceDeclarations.add(node);
        }
        if (PATH_MODULES.has(loaded)) {
          pathNamespaces.add(node.name.text);
          pathNamespaceDeclarations.add(node);
        }
      } else if (ts.isObjectBindingPattern(node.name)) {
        const loaded = loadedModule(node.initializer);
        let target = FS_MODULES.has(loaded) ? fsAliases : PATH_MODULES.has(loaded) ? pathAliases : null;
        let targetDeclarations = FS_MODULES.has(loaded)
          ? fsAliasDeclarations : PATH_MODULES.has(loaded) ? pathAliasDeclarations : null;
        if (!target && ts.isIdentifier(node.initializer)) {
          const binding = visibleBinding(node.initializer, { values });
          if (binding.found && fsNamespaceDeclarations.has(binding.declaration)) {
            target = fsAliases;
            targetDeclarations = fsAliasDeclarations;
          } else if (binding.found && pathNamespaceDeclarations.has(binding.declaration)) {
            target = pathAliases;
            targetDeclarations = pathAliasDeclarations;
          }
        }
        for (const element of node.name.elements) {
          if (ts.isIdentifier(element.name)) addBinding(values, element, null);
        }
        if (target) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            const imported = element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
            target.set(element.name.text, imported);
            targetDeclarations.add(element);
            if ((FS_MODULES.has(loaded) && imported === 'promises')
              || (PATH_MODULES.has(loaded) && (imported === 'posix' || imported === 'win32'))) {
              (FS_MODULES.has(loaded) ? fsNamespaces : pathNamespaces).add(element.name.text);
            }
          }
        }
      }
    } else if (ts.isParameter(node)) {
      addBinding(values, node, node.initializer ?? null);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const collectAssignments = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left)) {
      const binding = visibleBinding(node.left, { values });
      const entry = values.get(node.left.text)?.find(candidate => candidate.declaration === binding.declaration);
      entry?.assignments.push({ position: node.getStart(), initializer: node.right });
    }
    ts.forEachChild(node, collectAssignments);
  };
  collectAssignments(source);
  return {
    fsAliases, pathAliases, fsNamespaces, pathNamespaces,
    fsAliasDeclarations, pathAliasDeclarations,
    fsNamespaceDeclarations, pathNamespaceDeclarations,
    fsConstantsNamespaces, fsConstantsDeclarations,
    staticPathAliases, staticPathAliasDeclarations,
    canonicalResolverAliases, canonicalResolverDeclarations,
    values,
  };
}

function propertyName(expression) {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression
    && ts.isStringLiteralLike(expression.argumentExpression)) return expression.argumentExpression.text;
  return '';
}

function staticMemberName(expression, bindings, seen = new Set()) {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (!ts.isIdentifier(node) || seen.has(node.text)) return '';
  const binding = visibleBinding(node, bindings);
  if (!binding.found || !binding.initializer) return '';
  const nextSeen = new Set(seen); nextSeen.add(node.text);
  return staticMemberName(binding.initializer, bindings, nextSeen);
}

function resolvedPropertyName(expression, bindings) {
  const direct = propertyName(expression);
  return direct || (ts.isElementAccessExpression(expression) && expression.argumentExpression
    ? staticMemberName(expression.argumentExpression, bindings) : '');
}

function receiverIdentifier(expression, kind, bindings) {
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) return expression.expression;
    const nested = expression.expression;
    if (ts.isPropertyAccessExpression(nested) || ts.isElementAccessExpression(nested)) {
      const admitted = kind === 'fs' ? new Set(['promises']) : new Set(['posix', 'win32']);
      if (admitted.has(resolvedPropertyName(nested, bindings)) && ts.isIdentifier(nested.expression)) return nested.expression;
    }
  }
  return null;
}

function resolveCallable(expression, bindings, kind, seen = new Set()) {
  const aliases = kind === 'fs' ? bindings.fsAliases : bindings.pathAliases;
  const aliasDeclarations = kind === 'fs'
    ? bindings.fsAliasDeclarations : bindings.pathAliasDeclarations;
  const namespaces = kind === 'fs' ? bindings.fsNamespaces : bindings.pathNamespaces;
  const namespaceDeclarations = kind === 'fs'
    ? bindings.fsNamespaceDeclarations : bindings.pathNamespaceDeclarations;
  const accepted = kind === 'fs' ? MUTATION_NAMES : PATH_CALLS;
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return '';
    const binding = visibleBinding(expression, bindings);
    if (binding.found) {
      if (aliasDeclarations.has(binding.declaration)) {
        const imported = aliases.get(expression.text);
        return typeof imported === 'string' && accepted.has(imported) ? imported : '';
      }
      if (!binding.initializer) return '';
      seen.add(expression.text);
      return resolveCallable(binding.initializer, bindings, kind, seen);
    }
    return '';
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const loaded = loadedModule(expression.expression);
    const member = resolvedPropertyName(expression, bindings);
    const modules = kind === 'fs' ? FS_MODULES : PATH_MODULES;
    if (modules.has(loaded) && accepted.has(member)) return member;
  }
  const receiver = receiverIdentifier(expression, kind, bindings);
  const member = resolvedPropertyName(expression, bindings);
  if (receiver && namespaces.has(receiver.text) && accepted.has(member)) {
    const binding = visibleBinding(receiver, bindings);
    if (!binding.found || namespaceDeclarations.has(binding.declaration)) return member;
  }
  return '';
}

function combine(parts, separator = '') {
  let values = [''];
  for (const choices of parts) {
    const next = [];
    for (const prefix of values) {
      for (const suffix of choices) {
        next.push(prefix === '' ? suffix : suffix === '' ? prefix : `${prefix}${separator}${suffix}`);
        if (next.length >= 32) return next;
      }
    }
    values = next;
  }
  return values;
}

function unwrap(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)
    || ts.isAwaitExpression(current) || ts.isSatisfiesExpression?.(current)) current = current.expression;
  return current;
}

function localFunction(expression, bindings) {
  if (!ts.isIdentifier(expression)) return null;
  const binding = visibleBinding(expression, bindings);
  if (!binding.found) return null;
  if (ts.isFunctionDeclaration(binding.declaration)) return binding.declaration;
  const initializer = binding.initializer ? unwrap(binding.initializer) : null;
  return initializer && (ts.isFunctionExpression(initializer) || ts.isArrowFunction(initializer))
    ? initializer : null;
}

function directReturnExpressions(fn) {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const values = [];
  const visit = node => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) values.push(node.expression);
    else ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return values;
}

function canonicalResolverCall(expression, bindings) {
  if (!ts.isIdentifier(expression)) return false;
  const binding = visibleBinding(expression, bindings);
  return binding.found
    && bindings.canonicalResolverAliases.has(expression.text)
    && bindings.canonicalResolverDeclarations.has(binding.declaration);
}

function objectPropertyInitializer(expression, bindings) {
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return null;
  const name = propertyName(expression);
  if (!name || !ts.isIdentifier(expression.expression)) return null;
  const binding = visibleBinding(expression.expression, bindings);
  const initializer = binding.initializer ? unwrap(binding.initializer) : null;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return null;
  for (const property of initializer.properties) {
    const propertyKey = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
      ? property.name.text : '';
    if (propertyKey !== name) continue;
    if (ts.isPropertyAssignment(property)) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property)) return property.name;
  }
  return null;
}

function evaluatePath(expression, bindings, seen = new Set(), overrides = new Map()) {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return [portableArchivePath(node.text)];
  if (ts.isNumericLiteral(node)) return [node.text];
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return [`<${node.text}>`];
    const binding = visibleBinding(node, bindings);
    if (binding.found && overrides.has(binding.declaration)) return overrides.get(binding.declaration);
    if (binding.found && binding.initializer) {
      if (bindings.staticPathAliasDeclarations.has(binding.declaration)) {
        return [bindings.staticPathAliases.get(node.text)];
      }
      const nextSeen = new Set(seen); nextSeen.add(node.text);
      return evaluatePath(binding.initializer, bindings, nextSeen, overrides);
    }
    if (binding.found && bindings.staticPathAliasDeclarations.has(binding.declaration)) {
      return [bindings.staticPathAliases.get(node.text)];
    }
    if (binding.found) return [`<${node.text}>`];
    const fixed = STATIC_PATH_SYMBOLS.get(node.text);
    if (fixed) return [fixed];
    return [`<${node.text}>`];
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) return [portableArchivePath(node.text)];
  if (ts.isTemplateExpression(node)) {
    const parts = [[portableArchivePath(node.head.text)]];
    for (const span of node.templateSpans) {
      parts.push(evaluatePath(span.expression, bindings, new Set(seen), overrides));
      parts.push([portableArchivePath(span.literal.text)]);
    }
    return combine(parts);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return combine([
      evaluatePath(node.left, bindings, new Set(seen), overrides),
      evaluatePath(node.right, bindings, new Set(seen), overrides),
    ]);
  }
  if (ts.isConditionalExpression(node)) {
    return [...new Set([
      ...evaluatePath(node.whenTrue, bindings, new Set(seen), overrides),
      ...evaluatePath(node.whenFalse, bindings, new Set(seen), overrides),
    ])];
  }
  const propertyInitializer = objectPropertyInitializer(node, bindings);
  if (propertyInitializer) return evaluatePath(propertyInitializer, bindings, new Set(seen), overrides);
  if (ts.isCallExpression(node)) {
    if (canonicalResolverCall(node.expression, bindings)) return ['<canonical-sprint-archive>'];
    const called = resolveCallable(node.expression, bindings, 'path');
    if (called === 'join' || called === 'resolve') {
      return combine(node.arguments.map(argument => evaluatePath(argument, bindings, new Set(seen), overrides)), '/');
    }
    if (called === 'normalize') return evaluatePath(node.arguments[0] ?? node, bindings, new Set(seen), overrides);
    if (called === 'dirname') {
      return evaluatePath(node.arguments[0] ?? node, bindings, new Set(seen), overrides)
        .map(value => value.replace(/\/+[^/]*$/u, '') || '.');
    }
    if (called === 'basename') {
      return evaluatePath(node.arguments[0] ?? node, bindings, new Set(seen), overrides)
        .map(value => value.split('/').at(-1) ?? value);
    }
    const fn = localFunction(node.expression, bindings);
    if (fn) {
      const functionKey = `@function:${fn.pos}`;
      if (seen.has(functionKey)) return ['<dynamic>'];
      const functionSeen = new Set(seen); functionSeen.add(functionKey);
      const callOverrides = new Map(overrides);
      fn.parameters.forEach((parameter, index) => {
        const argument = node.arguments[index];
        if (argument) callOverrides.set(parameter,
          evaluatePath(argument, bindings, new Set(seen), overrides));
      });
      const returns = directReturnExpressions(fn)
        .flatMap(value => evaluatePath(value, bindings, new Set(functionSeen), callOverrides));
      if (returns.length > 0) return [...new Set(returns)];
    }
  }
  return ['<dynamic>'];
}

function classifyArchivePath(value) {
  const path = portableArchivePath(value).replace(/\/{2,}/gu, '/').toLowerCase();
  if (path.includes('<canonical-sprint-archive>')) return 'canonical';
  if (/(?:^|\/)\.deckent\/archive\/sprints(?:\/|$)/u.test(path)) return 'canonical';
  if (/(?:^|\/)\.deckent\/archive(?:\/|$)/u.test(path)) return 'legacy';
  if (/(?:^|\/)\.(?:brain|tasks)\/archive(?:\/|$)/u.test(path)) return 'legacy';
  return null;
}

function containsArchiveSignal(
  expression,
  bindings,
  seen = new Set(),
  overrides = new Map(),
  visitedNodes = new Set(),
) {
  const node = unwrap(expression);
  if (visitedNodes.has(node)) return false;
  const nextVisited = new Set(visitedNodes); nextVisited.add(node);
  if (evaluatePath(node, bindings, new Set(seen), overrides)
    .some(value => classifyArchivePath(value) !== null)) {
    return true;
  }
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return classifyArchivePath(node.text) !== null;
  }
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return false;
    const binding = visibleBinding(node, bindings);
    if (binding.found && bindings.staticPathAliasDeclarations.has(binding.declaration)) {
      return classifyArchivePath(bindings.staticPathAliases.get(node.text)) !== null;
    }
    if (binding.found && overrides.has(binding.declaration)) {
      return overrides.get(binding.declaration).some(value => value === '<archive-derived-dynamic>'
        || classifyArchivePath(value) !== null);
    }
    if (!binding.found || !binding.initializer) return false;
    if (ts.isFunctionLike(binding.initializer)) return false;
    const nextSeen = new Set(seen); nextSeen.add(node.text);
    return containsArchiveSignal(binding.initializer, bindings, nextSeen, overrides, nextVisited);
  }
  if (ts.isCallExpression(node)) {
    if (canonicalResolverCall(node.expression, bindings)) return true;
    // node:fs calls return descriptors/results, not derived pathname values.
    // Following their non-path arguments (for example a manifest-derived mode)
    // would incorrectly taint an fd later passed to writeFileSync.
    if (resolveCallable(node.expression, bindings, 'fs')) return false;
    const fn = localFunction(node.expression, bindings);
    if (fn && directReturnExpressions(fn)
      .some(value => containsArchiveSignal(
        value, bindings, new Set(seen), overrides, nextVisited,
      ))) return true;
  }
  const propertyInitializer = objectPropertyInitializer(node, bindings);
  if (propertyInitializer) {
    return containsArchiveSignal(
      propertyInitializer, bindings, new Set(seen), overrides, nextVisited,
    );
  }
  let found = false;
  ts.forEachChild(node, child => {
    if (!found && containsArchiveSignal(
      child, bindings, new Set(seen), overrides, nextVisited,
    )) found = true;
  });
  return found;
}

function enclosingFunctionAuthority(node, inherited) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return { name: node.name.text, topLevel: ts.isSourceFile(node.parent) };
  }
  if (ts.isMethodDeclaration(node) && node.name) return { name: node.name.getText(), topLevel: false };
  if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && ts.isVariableDeclaration(node.parent)
    && ts.isIdentifier(node.parent.name)) return { name: node.parent.name.text, topLevel: false };
  return inherited;
}

function isAllowed(table, file, authority) {
  return authority.topLevel && authority.name !== '<module>'
    && table.get(file)?.has(authority.name) === true;
}

function fsConstantName(expression, bindings) {
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return '';
  const name = propertyName(expression).toUpperCase();
  const receiver = expression.expression;
  if (ts.isIdentifier(receiver)) {
    const binding = visibleBinding(receiver, bindings);
    return binding.found && bindings.fsConstantsNamespaces.has(receiver.text)
      && bindings.fsConstantsDeclarations.has(binding.declaration) ? name : '';
  }
  if ((ts.isPropertyAccessExpression(receiver) || ts.isElementAccessExpression(receiver))
    && propertyName(receiver) === 'constants' && ts.isIdentifier(receiver.expression)) {
    const binding = visibleBinding(receiver.expression, bindings);
    return binding.found && bindings.fsNamespaces.has(receiver.expression.text)
      && bindings.fsNamespaceDeclarations.has(binding.declaration) ? name : '';
  }
  return '';
}

function openFlagMode(expression, bindings, seen = new Set()) {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) {
    return ['r', 'rs', 'sr'].includes(node.text.toLowerCase()) ? 'read' : 'mutating';
  }
  if (ts.isNumericLiteral(node)) return Number(node.text) === 0 ? 'read' : 'mutating';
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return 'unknown';
    const binding = visibleBinding(node, bindings);
    if (!binding.found || !binding.initializer) return 'unknown';
    const nextSeen = new Set(seen); nextSeen.add(node.text);
    return openFlagMode(binding.initializer, bindings, nextSeen);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const name = fsConstantName(node, bindings);
    if (!name) return 'unknown';
    if (/^O_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND|EXCL|TMPFILE)$/u.test(name)) return 'mutating';
    if (/^O_(?:RDONLY|CLOEXEC|DIRECTORY|NOFOLLOW|NONBLOCK|SYNC|DSYNC|NOATIME|PATH)$/u.test(name)) return 'read';
    return 'unknown';
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarToken) {
    const left = openFlagMode(node.left, bindings, new Set(seen));
    const right = openFlagMode(node.right, bindings, new Set(seen));
    if (left === 'mutating' || right === 'mutating') return 'mutating';
    return left === 'read' && right === 'read' ? 'read' : 'unknown';
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    const left = openFlagMode(node.left, bindings, new Set(seen));
    const right = openFlagMode(node.right, bindings, new Set(seen));
    if (left === 'mutating' || right === 'mutating') return 'mutating';
    return left === 'read' && right === 'read' ? 'read' : 'unknown';
  }
  return 'unknown';
}

function openIsMutating(call, bindings) {
  const flags = call.arguments[1];
  return !flags || openFlagMode(flags, bindings) !== 'read';
}

function mutationArgumentSpecs(called) {
  return [
    ...(DIRECT_WRITES.get(called) ?? []).map(index => ({ index, role: 'write' })),
    ...(DESTINATION_WRITES.get(called) ?? []).map(index => ({ index, role: 'write' })),
    ...(RETIREMENTS.get(called) ?? []).map(index => ({ index, role: 'retire' })),
  ];
}

function referencesFunctionParameter(expression, fn, bindings) {
  let found = false;
  const visit = node => {
    if (found || (node !== expression && ts.isFunctionLike(node))) return;
    if (ts.isIdentifier(node)) {
      const binding = visibleBinding(node, bindings);
      if (fn.parameters.some(parameter => parameter === binding.declaration)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function mutationParameterUses(fn, bindings) {
  const uses = [];
  const visit = node => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node)) {
      const called = resolveCallable(node.expression, bindings, 'fs');
      if (called && ((called !== 'open' && called !== 'openSync') || openIsMutating(node, bindings))) {
        for (const spec of mutationArgumentSpecs(called)) {
          const argument = node.arguments[spec.index] ? unwrap(node.arguments[spec.index]) : null;
          if (argument && referencesFunctionParameter(argument, fn, bindings)) {
            uses.push({ role: spec.role, argument, called });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return uses;
}

export function inspectSprintArchiveWriterSource(content, filename) {
  const file = portableArchivePath(filename);
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX
    : file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : /\.(?:[cm]?js)$/u.test(file) ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file, content, ts.ScriptTarget.Latest, true,
    scriptKind,
  );
  const bindings = collectBindings(source);
  const problems = [];
  const report = (code, node, detail) => problems.push({
    code,
    file,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    detail,
  });
  // Observability is an archive artifact producer, never an independent seal
  // or namespace-admission authority. Keep this module-specific ratchet next
  // to the generic raw-writer scan so a caller-local preflight cannot return
  // under a harmless read-only fs call and bypass canonical publisher policy.
  if (file === OBSERVABILITY_ROTATION_FILE) {
    let admissionReported = false;
    const reportAdmission = (node, detail) => {
      if (admissionReported) return;
      admissionReported = true;
      report('SPRINT_ARCHIVE_TERMINAL_ADMISSION_BYPASS', node, detail);
    };
    const inspectAdmission = node => {
      if (ts.isStringLiteralLike(node) && TERMINAL_ARCHIVE_SIDECARS.has(node.text)) {
        reportAdmission(node,
          'observability must delegate terminal seal admission to publishSprintArchiveArtifact');
      }
      if (ts.isFunctionDeclaration(node) && node.name
          && LOCAL_ARCHIVE_ADMISSION_HELPER.test(node.name.text)) {
        reportAdmission(node,
          `caller-local archive admission helper ${node.name.text} is forbidden in observability`);
      }
      ts.forEachChild(node, inspectAdmission);
    };
    inspectAdmission(source);
  }
  const wrapperCache = new Map();
  const inspectTarget = (node, called, authority, role, argument, overrides = new Map()) => {
    const emitted = new Set();
    {
      const evaluated = evaluatePath(argument, bindings, new Set(), overrides);
      const kinds = new Set(evaluated.map(classifyArchivePath).filter(Boolean));
      if (kinds.size === 0 && evaluated.includes('<dynamic>')
        && containsArchiveSignal(argument, bindings, new Set(), overrides)) {
        const admitted = role === 'write'
          ? isAllowed(CANONICAL_WRITER_SYMBOLS, file, authority)
          : isAllowed(VERIFIED_LEGACY_RETIREMENT_SYMBOLS, file, authority);
        if (!admitted && !emitted.has('SPRINT_ARCHIVE_UNRESOLVED_MUTATION_TARGET')) {
          emitted.add('SPRINT_ARCHIVE_UNRESOLVED_MUTATION_TARGET');
          report('SPRINT_ARCHIVE_UNRESOLVED_MUTATION_TARGET', node,
            `archive-derived ${called} target in ${authority.name} is unresolved and requires an exact authority annotation`);
        }
      }
      for (const archiveKind of kinds) {
        if (role === 'write') {
          if (archiveKind === 'canonical' && isAllowed(CANONICAL_WRITER_SYMBOLS, file, authority)) continue;
          if (!emitted.has('SPRINT_ARCHIVE_RAW_WRITER')) {
            emitted.add('SPRINT_ARCHIVE_RAW_WRITER');
            report('SPRINT_ARCHIVE_RAW_WRITER', node,
              `raw archive mutation ${called} in ${authority.name} must use the canonical sprint archive authority`);
          }
        } else if (archiveKind === 'legacy') {
          if (isAllowed(VERIFIED_LEGACY_RETIREMENT_SYMBOLS, file, authority)) continue;
          if (!emitted.has('SPRINT_ARCHIVE_LEGACY_RETIREMENT')) {
            emitted.add('SPRINT_ARCHIVE_LEGACY_RETIREMENT');
            report('SPRINT_ARCHIVE_LEGACY_RETIREMENT', node,
              `legacy retirement ${called} in ${authority.name} requires verified migration authority`);
          }
        } else if (!emitted.has('SPRINT_ARCHIVE_DESTRUCTIVE_ROOT')) {
          emitted.add('SPRINT_ARCHIVE_DESTRUCTIVE_ROOT');
          report('SPRINT_ARCHIVE_DESTRUCTIVE_ROOT', node,
            `canonical archive retirement ${called} in ${authority.name} is not an admitted authority operation`);
        }
      }
    }
  };
  const inspectArguments = (reportNode, callNode, called, authority, specs, overrides = new Map()) => {
    for (const { index, role } of specs) {
      const argument = callNode.arguments[index];
      if (argument) inspectTarget(reportNode, called, authority, role, argument, overrides);
    }
  };
  const visit = (node, inheritedAuthority = { name: '<module>', topLevel: false }) => {
    const authority = enclosingFunctionAuthority(node, inheritedAuthority);
    if (ts.isCallExpression(node)) {
      const called = resolveCallable(node.expression, bindings, 'fs');
      if (called && ((called !== 'open' && called !== 'openSync') || openIsMutating(node, bindings))) {
        inspectArguments(node, node, called, authority, mutationArgumentSpecs(called));
      } else {
        const fn = localFunction(node.expression, bindings);
        if (fn) {
          const uses = wrapperCache.get(fn) ?? mutationParameterUses(fn, bindings);
          wrapperCache.set(fn, uses);
          const overrides = new Map();
          fn.parameters.forEach((parameter, index) => {
            const argument = node.arguments[index];
            if (argument) overrides.set(parameter, evaluatePath(argument, bindings));
          });
          for (const use of uses) {
            inspectTarget(node, use.called, authority, use.role, use.argument, overrides);
          }
        }
      }
    }
    ts.forEachChild(node, child => visit(child, authority));
  };
  visit(source);
  return problems;
}

export function checkSprintArchiveWriters(root = process.cwd()) {
  const problems = sourceFiles(root).flatMap(filename => inspectSprintArchiveWriterSource(
    readFileSync(filename, 'utf8'), portableArchivePath(relative(root, filename)),
  ));
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return { ok: problems.length === 0, problems };
}

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const root = resolve(rootAt >= 0 && argv[rootAt + 1] ? argv[rootAt + 1] : process.cwd());
  const result = checkSprintArchiveWriters(root);
  if (result.ok) { process.stdout.write('sprint archive writers: OK\n'); return 0; }
  for (const problem of result.problems) process.stderr.write(`${problem.code} ${problem.file}:${problem.line}: ${problem.detail}\n`);
  return 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
