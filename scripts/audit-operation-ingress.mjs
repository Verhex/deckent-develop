#!/usr/bin/env node

import ts from 'typescript';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_DIRECTORY = join(ROOT, 'src/core/operation-catalog');
const CATALOG_PATH = join(CATALOG_DIRECTORY, 'catalog.v1.json');
const CATALOG_MODULE_PATH = join(CATALOG_DIRECTORY, 'index.ts');
const CATALOG_GENERATED_MODULE_PATH = join(CATALOG_DIRECTORY, 'generated.ts');
const MCP_BROKER_MODULE_PATH = join(ROOT, 'src/mcp-client/broker.ts');

export const TAXONOMIES = Object.freeze([
  'fs-read',
  'fs-write',
  'fs-delete',
  'db-memory',
  'process',
  'provider-network',
  'tool',
]);

const FILE_SYSTEM_METHOD_TAXONOMY = Object.freeze({
  access: 'fs-read',
  accessSync: 'fs-read',
  createReadStream: 'fs-read',
  exists: 'fs-read',
  existsSync: 'fs-read',
  fstat: 'fs-read',
  fstatSync: 'fs-read',
  glob: 'fs-read',
  globSync: 'fs-read',
  lstat: 'fs-read',
  lstatSync: 'fs-read',
  opendir: 'fs-read',
  opendirSync: 'fs-read',
  read: 'fs-read',
  readFile: 'fs-read',
  readFileSync: 'fs-read',
  readdir: 'fs-read',
  readdirSync: 'fs-read',
  readlink: 'fs-read',
  readlinkSync: 'fs-read',
  readSync: 'fs-read',
  readv: 'fs-read',
  readvSync: 'fs-read',
  realpath: 'fs-read',
  realpathSync: 'fs-read',
  stat: 'fs-read',
  statfs: 'fs-read',
  statfsSync: 'fs-read',
  statSync: 'fs-read',
  watch: 'fs-read',
  watchFile: 'fs-read',

  appendFile: 'fs-write',
  appendFileSync: 'fs-write',
  chmod: 'fs-write',
  chmodSync: 'fs-write',
  chown: 'fs-write',
  chownSync: 'fs-write',
  copyFile: 'fs-write',
  copyFileSync: 'fs-write',
  cp: 'fs-write',
  cpSync: 'fs-write',
  createWriteStream: 'fs-write',
  fdatasync: 'fs-write',
  fdatasyncSync: 'fs-write',
  fchmod: 'fs-write',
  fchmodSync: 'fs-write',
  fchown: 'fs-write',
  fchownSync: 'fs-write',
  fsync: 'fs-write',
  fsyncSync: 'fs-write',
  ftruncate: 'fs-write',
  ftruncateSync: 'fs-write',
  futimes: 'fs-write',
  futimesSync: 'fs-write',
  lchmod: 'fs-write',
  lchmodSync: 'fs-write',
  lchown: 'fs-write',
  lchownSync: 'fs-write',
  link: 'fs-write',
  linkSync: 'fs-write',
  lutimes: 'fs-write',
  lutimesSync: 'fs-write',
  mkdir: 'fs-write',
  mkdirSync: 'fs-write',
  mkdtemp: 'fs-write',
  mkdtempSync: 'fs-write',
  rename: 'fs-write',
  renameSync: 'fs-write',
  symlink: 'fs-write',
  symlinkSync: 'fs-write',
  truncate: 'fs-write',
  truncateSync: 'fs-write',
  utimes: 'fs-write',
  utimesSync: 'fs-write',
  write: 'fs-write',
  writeFile: 'fs-write',
  writeFileSync: 'fs-write',
  writeSync: 'fs-write',
  writev: 'fs-write',
  writevSync: 'fs-write',

  rm: 'fs-delete',
  rmSync: 'fs-delete',
  rmdir: 'fs-delete',
  rmdirSync: 'fs-delete',
  unlink: 'fs-delete',
  unlinkSync: 'fs-delete',
});

const FILE_HANDLE_METHOD_TAXONOMY = Object.freeze({
  appendFile: 'fs-write',
  chmod: 'fs-write',
  chown: 'fs-write',
  datasync: 'fs-write',
  sync: 'fs-write',
  truncate: 'fs-write',
  utimes: 'fs-write',
  write: 'fs-write',
  writeFile: 'fs-write',
  writev: 'fs-write',
  createWriteStream: 'fs-write',
  createReadStream: 'fs-read',
  read: 'fs-read',
  readFile: 'fs-read',
  readLines: 'fs-read',
  readv: 'fs-read',
  stat: 'fs-read',
});

const FILE_SYSTEM_NON_EFFECT_METHODS = new Set(['close', 'closeSync', 'unwatchFile']);
const FILE_HANDLE_NON_EFFECT_METHODS = new Set(['close']);

const CHILD_PROCESS_METHODS = new Set([
  'exec',
  'execFile',
  'execFileSync',
  'execSync',
  'fork',
  'spawn',
  'spawnSync',
]);

const DATABASE_EFFECT_METHODS = new Set([
  'aggregate',
  'all',
  'backup',
  'defaultSafeIntegers',
  'deferred',
  'exec',
  'function',
  'get',
  'iterate',
  'exclusive',
  'immediate',
  'loadExtension',
  'pragma',
  'run',
  'serialize',
  'table',
  'unsafeMode',
]);
const DATABASE_ORIGIN_FACTORY_METHODS = new Set(['prepare', 'transaction']);
const DATABASE_NON_EFFECT_METHODS = new Set([
  'bind',
  'catch',
  'close',
  'columns',
  'expand',
  'finally',
  'pluck',
  'prepare',
  'raw',
  'safeIntegers',
  'then',
  'transaction',
]);

const FILE_SYSTEM_MODULES = new Set(['fs', 'node:fs']);
const FILE_SYSTEM_PROMISE_MODULES = new Set(['fs/promises', 'node:fs/promises']);
const CHILD_PROCESS_MODULES = new Set(['child_process', 'node:child_process']);
const FETCH_MODULES = new Set(['node-fetch', 'undici']);
const SOURCE_FILE_PATTERN = /\.[cm]?tsx?$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?tsx?$/u;

function deterministicTextCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isWindowsAbsolute(path) {
  return /^[a-z]:[\\/]/iu.test(path) || path.startsWith('\\\\');
}

export function normalizeRepositoryRelativePath(root, path) {
  const useWindows = isWindowsAbsolute(root) || isWindowsAbsolute(path);
  if (useWindows && !(isWindowsAbsolute(root) && isWindowsAbsolute(path))) {
    throw new Error('root and path must use the same absolute path family');
  }
  const relativePath = useWindows
    ? win32.relative(win32.resolve(root), win32.resolve(path))
    : posix.relative(
      posix.resolve(root.replaceAll('\\', '/')),
      posix.resolve(path.replaceAll('\\', '/')),
    );
  const normalized = relativePath.replaceAll('\\', '/').normalize('NFC');
  if (normalized === '..'
    || normalized.startsWith('../')
    || posix.isAbsolute(normalized)
    || isWindowsAbsolute(normalized)) {
    throw new Error(`path '${path}' is outside repository root '${root}'`);
  }
  return normalized;
}

function canonicalAbsolutePath(path) {
  let absolute = resolve(path);
  try {
    absolute = realpathSync.native(absolute);
  } catch {
    // Compiler-resolved virtual fixture paths may not exist on disk. Exact
    // canonical-catalog checks only succeed for the real, existing module.
  }
  const normalized = absolute.replaceAll('\\', '/').normalize('NFC');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

const CANONICAL_CATALOG_MODULE_ID = canonicalAbsolutePath(CATALOG_MODULE_PATH);
const CANONICAL_CATALOG_GENERATED_MODULE_ID = canonicalAbsolutePath(
  CATALOG_GENERATED_MODULE_PATH,
);
const CANONICAL_MCP_BROKER_MODULE_ID = canonicalAbsolutePath(MCP_BROKER_MODULE_PATH);

function taxonomyFromCatalogDefinition(operation) {
  const event = typeof operation.auditEvent === 'string' ? operation.auditEvent : '';
  if (event.startsWith('fs.read.')) return 'fs-read';
  if (event.startsWith('fs.write.')) return 'fs-write';
  if (event.startsWith('fs.delete.')) return 'fs-delete';
  if (event.startsWith('memory.')) return 'db-memory';
  if (operation.effect === 'SPAWN_EXECUTION') return 'process';
  if (operation.effect === 'PROVIDER_CALL') return 'provider-network';
  return null;
}

let canonicalCatalog;
function loadCanonicalCoverageCatalog() {
  if (canonicalCatalog) return canonicalCatalog;
  const parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.operations)) {
    throw new Error('canonical operation catalog has an unsupported schema');
  }
  const operations = new Map();
  for (const operation of parsed.operations) {
    if (!operation
      || typeof operation.id !== 'string'
      || operations.has(operation.id)
      || typeof operation.effect !== 'string'
      || typeof operation.auditEvent !== 'string') {
      throw new Error('canonical operation catalog contains an invalid or duplicate operation');
    }
    operations.set(operation.id, Object.freeze({
      definition: Object.freeze(operation),
      taxonomy: taxonomyFromCatalogDefinition(operation),
    }));
  }
  canonicalCatalog = Object.freeze({
    schemaVersion: parsed.schemaVersion,
    source: normalizeRepositoryRelativePath(ROOT, CATALOG_PATH),
    digest: digest(JSON.stringify(parsed)),
    operations,
  });
  return canonicalCatalog;
}

function listSourceFiles(directory, output = []) {
  if (!existsSync(directory)) return output;
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => deterministicTextCompare(left.name, right.name));

  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) listSourceFiles(path, output);
    else if (entry.isFile()
      && SOURCE_FILE_PATTERN.test(entry.name)
      && !TEST_FILE_PATTERN.test(entry.name)
      && !entry.name.endsWith('.d.ts')) {
      output.push(path);
    }
  }
  return output;
}

function moduleSpecifierFromDeclaration(declaration) {
  let importDeclaration;
  if (ts.isImportSpecifier(declaration)) {
    importDeclaration = declaration.parent.parent.parent;
  } else if (ts.isNamespaceImport(declaration)) {
    importDeclaration = declaration.parent.parent;
  } else if (ts.isImportClause(declaration)) {
    importDeclaration = declaration.parent;
  }
  return importDeclaration
    && ts.isImportDeclaration(importDeclaration)
    && ts.isStringLiteralLike(importDeclaration.moduleSpecifier)
    ? importDeclaration.moduleSpecifier.text
    : null;
}

function importedBindingFromDeclaration(declaration) {
  const module = moduleSpecifierFromDeclaration(declaration);
  if (!module) return null;

  if (ts.isImportSpecifier(declaration)) {
    return {
      module,
      form: 'direct',
      local: declaration.name.text,
      members: [declaration.propertyName?.text ?? declaration.name.text],
      aliases: [],
    };
  }
  if (ts.isNamespaceImport(declaration)) {
    return {
      module,
      form: 'namespace',
      local: declaration.name.text,
      members: [],
      aliases: [],
    };
  }
  if (ts.isImportClause(declaration) && declaration.name) {
    return {
      module,
      form: 'default',
      local: declaration.name.text,
      members: [],
      aliases: [],
    };
  }
  return null;
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isAwaitExpression(current)) {
    current = current.expression;
  }
  return current;
}

function bindingElementMember(declaration) {
  const property = declaration.propertyName ?? declaration.name;
  return ts.isIdentifier(property) || ts.isStringLiteralLike(property)
    ? property.text
    : null;
}

function enclosingVariableDeclaration(node) {
  let current = node.parent;
  while (current && !ts.isVariableDeclaration(current)) current = current.parent;
  return current && ts.isVariableDeclaration(current) ? current : null;
}

function resolveImportedBinding(checker, rawNode, seenSymbols = new Set()) {
  const node = unwrapExpression(rawNode);

  if (ts.isPropertyAccessExpression(node)) {
    const base = resolveImportedBinding(checker, node.expression, seenSymbols);
    return base ? { ...base, members: [...base.members, node.name.text] } : null;
  }
  if (ts.isElementAccessExpression(node)
    && node.argumentExpression
    && ts.isStringLiteralLike(node.argumentExpression)) {
    const base = resolveImportedBinding(checker, node.expression, seenSymbols);
    return base
      ? { ...base, members: [...base.members, node.argumentExpression.text] }
      : null;
  }
  if (ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
    && node.arguments[0]
    && ts.isStringLiteralLike(node.arguments[0])) {
    return {
      module: node.arguments[0].text,
      form: 'dynamic',
      local: 'import()',
      members: [],
      aliases: [],
    };
  }
  if (!ts.isIdentifier(node)) return null;

  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol || seenSymbols.has(symbol)) return null;
  const nextSeen = new Set(seenSymbols);
  nextSeen.add(symbol);

  for (const declaration of symbol.declarations ?? []) {
    const imported = importedBindingFromDeclaration(declaration);
    if (imported) return imported;

    if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration))
      && declaration.initializer) {
      const base = resolveImportedBinding(checker, declaration.initializer, nextSeen);
      if (base) return { ...base, aliases: [...base.aliases, node.text] };
    }

    if (ts.isBindingElement(declaration)) {
      const variable = enclosingVariableDeclaration(declaration);
      const member = bindingElementMember(declaration);
      if (!variable?.initializer || !member) continue;
      const base = resolveImportedBinding(checker, variable.initializer, nextSeen);
      if (base) {
        return {
          ...base,
          members: [...base.members, member],
          aliases: [...base.aliases, node.text],
        };
      }
    }
  }
  return null;
}

function bindingProvenance(binding) {
  const [imported = 'default', ...members] = binding.members;
  let origin;
  if (binding.form === 'namespace' || binding.form === 'dynamic') {
    const suffix = binding.members.length > 0 ? `.${binding.members.join('.')}` : '';
    origin = `${binding.form}:${binding.local}${suffix}`;
  } else if (binding.form === 'default') {
    const suffix = binding.members.length > 0 ? `.${binding.members.join('.')}` : '';
    origin = `default:${binding.local}${suffix}`;
  } else {
    const local = binding.local === imported ? '' : `->${binding.local}`;
    const suffix = members.length > 0 ? `.${members.join('.')}` : '';
    origin = `direct:${imported}${local}${suffix}`;
  }
  const aliases = binding.aliases.filter((alias, index, all) => (
    alias !== binding.local && all.indexOf(alias) === index
  ));
  return aliases.length > 0 ? `alias:${origin}->${aliases.join('->')}` : origin;
}

function declarationIdentity(declaration, root) {
  const sourceFile = declaration.getSourceFile();
  const sourcePath = sourceFile.fileName.replaceAll('\\', '/');
  const position = sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile));
  try {
    const repositoryPath = normalizeRepositoryRelativePath(root, sourceFile.fileName);
    return `${repositoryPath}:${position.line + 1}:${position.character + 1}`;
  } catch {
    // Continue with stable external-package provenance.
  }
  const nodeModulesIndex = sourcePath.lastIndexOf('/node_modules/');
  if (nodeModulesIndex >= 0) {
    const packagePath = sourcePath.slice(nodeModulesIndex + '/node_modules/'.length);
    const parts = packagePath.split('/');
    const packageName = parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    return `external:${packageName ?? 'unknown'}`;
  }
  return `external:${sourceFile.fileName.split(/[\\/]/u).at(-1) ?? 'unknown'}`;
}

function semanticBindingProvenance(checker, rawNode, root, seenSymbols = new Set()) {
  const node = unwrapExpression(rawNode);
  if (ts.isCallExpression(node)) {
    return semanticBindingProvenance(
      checker,
      ts.isPropertyAccessExpression(node.expression) ? node.expression.expression : node.expression,
      root,
      seenSymbols,
    );
  }
  if (ts.isPropertyAccessExpression(node)) {
    const symbol = checker.getSymbolAtLocation(node.name);
    const declaration = symbol?.declarations?.[0];
    if (declaration) return `member:${declarationIdentity(declaration, root)}:${node.name.text}`;
    const base = semanticBindingProvenance(checker, node.expression, root, seenSymbols);
    return base ? `${base}.${node.name.text}` : null;
  }
  if (!ts.isIdentifier(node)) return null;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol || seenSymbols.has(symbol)) return null;
  const declaration = symbol.declarations?.[0];
  return declaration ? `symbol:${declarationIdentity(declaration, root)}:${node.text}` : null;
}

function typeComesFrom(checker, node, packageFragment, seenTypes = new Set()) {
  const type = checker.getTypeAtLocation(node);
  const visit = candidate => {
    if (!candidate || seenTypes.has(candidate)) return false;
    seenTypes.add(candidate);
    for (const symbol of [candidate.aliasSymbol, candidate.getSymbol?.()]) {
      for (const declaration of symbol?.declarations ?? []) {
        if (declaration.getSourceFile().fileName.replaceAll('\\', '/').includes(packageFragment)) {
          return true;
        }
      }
    }
    return Array.isArray(candidate.types) && candidate.types.some(visit);
  };
  return visit(type);
}

const OPEN_READ_FLAGS = new Set(['O_RDONLY']);
const OPEN_WRITE_FLAGS = new Set([
  'O_APPEND',
  'O_CREAT',
  'O_EXCL',
  'O_RDWR',
  'O_TRUNC',
  'O_WRONLY',
]);
const OPEN_MODIFIER_FLAGS = new Set([
  'O_CLOEXEC',
  'O_DIRECTORY',
  'O_DSYNC',
  'O_NOATIME',
  'O_NOCTTY',
  'O_NOFOLLOW',
  'O_NONBLOCK',
  'O_SYNC',
]);

function mergeOpenFlagEffects(...effects) {
  const known = effects.filter(Boolean);
  if (known.some(effect => effect === 'write')) return 'write';
  if (known.some(effect => effect === 'read')) return 'read';
  return null;
}

function staticOpenFlagEffect(checker, rawNode, seenSymbols = new Set()) {
  const node = unwrapExpression(rawNode);
  if (ts.isStringLiteralLike(node)) return /[wax+]/iu.test(node.text) ? 'write' : 'read';
  if (ts.isNumericLiteral(node)) return (Number(node.text) & 0b11) === 0 ? 'read' : 'write';

  if (ts.isPropertyAccessExpression(node)) {
    if (OPEN_READ_FLAGS.has(node.name.text)) return 'read';
    if (OPEN_WRITE_FLAGS.has(node.name.text)) return 'write';
    if (OPEN_MODIFIER_FLAGS.has(node.name.text)) return null;
  }
  if (ts.isElementAccessExpression(node)
    && node.argumentExpression
    && ts.isStringLiteralLike(node.argumentExpression)) {
    if (OPEN_READ_FLAGS.has(node.argumentExpression.text)) return 'read';
    if (OPEN_WRITE_FLAGS.has(node.argumentExpression.text)) return 'write';
    if (OPEN_MODIFIER_FLAGS.has(node.argumentExpression.text)) return null;
  }
  if (ts.isBinaryExpression(node)) {
    return mergeOpenFlagEffects(
      staticOpenFlagEffect(checker, node.left, seenSymbols),
      staticOpenFlagEffect(checker, node.right, seenSymbols),
    );
  }
  if (ts.isConditionalExpression(node)) {
    return mergeOpenFlagEffects(
      staticOpenFlagEffect(checker, node.whenTrue, seenSymbols),
      staticOpenFlagEffect(checker, node.whenFalse, seenSymbols),
    );
  }
  if (ts.isCallExpression(node)) {
    const symbol = checker.getSymbolAtLocation(node.expression);
    if (!symbol || seenSymbols.has(symbol)) return null;
    const nextSeen = new Set(seenSymbols);
    nextSeen.add(symbol);
    const effects = [];
    const collectReturns = current => {
      if (ts.isReturnStatement(current) && current.expression) {
        effects.push(staticOpenFlagEffect(checker, current.expression, nextSeen));
        return;
      }
      if (current !== node && ts.isFunctionLike(current)) return;
      ts.forEachChild(current, collectReturns);
    };
    const collectFunctionEffect = declaration => {
      if (!declaration.body) return;
      if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) {
        effects.push(staticOpenFlagEffect(checker, declaration.body, nextSeen));
      } else {
        collectReturns(declaration.body);
      }
    };
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isFunctionDeclaration(declaration)
        || ts.isFunctionExpression(declaration)
        || ts.isArrowFunction(declaration)
        || ts.isMethodDeclaration(declaration)) {
        collectFunctionEffect(declaration);
      } else if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        if (ts.isArrowFunction(declaration.initializer)
          || ts.isFunctionExpression(declaration.initializer)) {
          collectFunctionEffect(declaration.initializer);
        } else {
          effects.push(staticOpenFlagEffect(checker, declaration.initializer, nextSeen));
        }
      }
    }
    return mergeOpenFlagEffects(...effects);
  }
  if (!ts.isIdentifier(node)) return null;

  if (OPEN_READ_FLAGS.has(node.text)) return 'read';
  if (OPEN_WRITE_FLAGS.has(node.text)) return 'write';
  if (OPEN_MODIFIER_FLAGS.has(node.text)) return null;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol || seenSymbols.has(symbol)) return null;
  const nextSeen = new Set(seenSymbols);
  nextSeen.add(symbol);
  const effects = [];
  for (const declaration of symbol.declarations ?? []) {
    if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration))
      && declaration.initializer) {
      effects.push(staticOpenFlagEffect(checker, declaration.initializer, nextSeen));
    }
  }
  return mergeOpenFlagEffects(...effects);
}

function openTaxonomy(checker, call) {
  const flag = call.arguments[1];
  const effect = flag ? staticOpenFlagEffect(checker, flag) : null;
  if (effect === 'read') return { taxonomy: 'fs-read', flagResolution: 'static-read' };
  if (effect === 'write') return { taxonomy: 'fs-write', flagResolution: 'static-write' };
  // A dynamic flag can authorize mutation. Inventory it at the highest possible
  // effect instead of under-counting it or making the repository-wide baseline
  // impossible to establish. The provenance records that this was conservative.
  return {
    taxonomy: 'fs-write',
    flagResolution: 'conservative-write',
  };
}

function classifyFileSystem(checker, call) {
  const binding = resolveImportedBinding(checker, call.expression);
  if (!binding) return null;

  let members = binding.members;
  let module = binding.module;
  if (FILE_SYSTEM_MODULES.has(module) && members[0] === 'promises') {
    members = members.slice(1);
    module = module === 'node:fs' ? 'node:fs/promises' : 'fs/promises';
  } else if (!FILE_SYSTEM_MODULES.has(module) && !FILE_SYSTEM_PROMISE_MODULES.has(module)) {
    return null;
  }

  const nativeParent = members.at(-1) === 'native' ? members.at(-2) : null;
  const method = nativeParent ?? members.at(-1);
  if (!method) return null;
  if (FILE_SYSTEM_NON_EFFECT_METHODS.has(method)) return null;
  const effect = method === 'open' || method === 'openSync'
    ? openTaxonomy(checker, call)
    : { taxonomy: FILE_SYSTEM_METHOD_TAXONOMY[method] };
  if (!effect.taxonomy) {
    return {
      unclassified: true,
      call: `${module}:${method}${nativeParent ? '.native' : ''}`,
      binding: bindingProvenance(binding),
      diagnostic: {
        code: 'UNKNOWN_EFFECT',
        message: `unclassified file-system effect '${module}:${method}'`,
      },
    };
  }
  return {
    taxonomy: effect.taxonomy,
    call: `${module}:${method}${nativeParent ? '.native' : ''}`,
    binding: effect.flagResolution
      ? `${bindingProvenance(binding)}|flags:${effect.flagResolution}`
      : bindingProvenance(binding),
    diagnostic: effect.diagnostic,
  };
}

function expressionOriginatesFromFileOpen(checker, rawNode, seenSymbols = new Set()) {
  const node = unwrapExpression(rawNode);
  if (ts.isCallExpression(node)) {
    const binding = resolveImportedBinding(checker, node.expression);
    if (binding) {
      const method = binding.members.at(-1);
      const isFileSystem = FILE_SYSTEM_MODULES.has(binding.module)
        || FILE_SYSTEM_PROMISE_MODULES.has(binding.module);
      if (isFileSystem && (method === 'open' || method === 'openSync')) return true;
    }
    if (ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'then') {
      return expressionOriginatesFromFileOpen(checker, node.expression.expression, seenSymbols);
    }
    return false;
  }
  if (typeComesFrom(checker, node, '/@types/node/fs/promises.d.ts')) return true;
  if (!ts.isIdentifier(node)) return false;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols);
  nextSeen.add(symbol);
  return (symbol.declarations ?? []).some(declaration => (
    (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration))
      && declaration.initializer
      && expressionOriginatesFromFileOpen(checker, declaration.initializer, nextSeen)
  ));
}

function classifyFileHandle(checker, call, root) {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const method = call.expression.name.text;
  if (!expressionOriginatesFromFileOpen(checker, call.expression.expression)) return null;
  if (FILE_HANDLE_NON_EFFECT_METHODS.has(method)) return null;
  const binding = semanticBindingProvenance(checker, call.expression.expression, root);
  const taxonomy = FILE_HANDLE_METHOD_TAXONOMY[method];
  if (!taxonomy) {
    return {
      unclassified: true,
      call: `node:fs/promises:FileHandle.${method}`,
      binding: binding ?? 'type:node:fs/promises:FileHandle',
      diagnostic: {
        code: 'UNKNOWN_EFFECT',
        message: `unclassified FileHandle effect '${method}'`,
      },
    };
  }
  return {
    taxonomy,
    call: `node:fs/promises:FileHandle.${method}`,
    binding: binding ?? 'type:node:fs/promises:FileHandle',
  };
}

function expressionOriginatesFromDatabase(checker, rawNode, seenSymbols = new Set()) {
  const node = unwrapExpression(rawNode);
  if (typeComesFrom(checker, node, 'better-sqlite3')) return true;
  if (ts.isNewExpression(node)) {
    return resolveImportedBinding(checker, node.expression)?.module === 'better-sqlite3';
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return DATABASE_ORIGIN_FACTORY_METHODS.has(node.expression.name.text)
      && expressionOriginatesFromDatabase(checker, node.expression.expression, seenSymbols);
  }
  if (!ts.isIdentifier(node)) return false;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols);
  nextSeen.add(symbol);
  return (symbol.declarations ?? []).some(declaration => (
    (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration))
      && declaration.initializer
      && expressionOriginatesFromDatabase(checker, declaration.initializer, nextSeen)
  ));
}

function classifyDatabase(checker, call, root) {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const method = call.expression.name.text;
  const receiver = call.expression.expression;
  if (!expressionOriginatesFromDatabase(checker, receiver)) return null;
  if (DATABASE_NON_EFFECT_METHODS.has(method)) return null;
  const binding = semanticBindingProvenance(checker, receiver, root) ?? 'type:better-sqlite3';
  if (!DATABASE_EFFECT_METHODS.has(method)) {
    return {
      unclassified: true,
      call: `better-sqlite3:${method}`,
      binding,
      diagnostic: {
        code: 'UNKNOWN_EFFECT',
        message: `unclassified better-sqlite3 effect '${method}'`,
      },
    };
  }
  return {
    taxonomy: 'db-memory',
    call: `better-sqlite3:${method}`,
    binding,
  };
}

function classifyProcess(checker, call) {
  const binding = resolveImportedBinding(checker, call.expression);
  const method = binding?.members.at(-1);
  if (!binding || !CHILD_PROCESS_MODULES.has(binding.module) || !method) return null;
  if (!CHILD_PROCESS_METHODS.has(method)) {
    return {
      unclassified: true,
      call: `${binding.module}:${method}`,
      binding: bindingProvenance(binding),
      diagnostic: {
        code: 'UNKNOWN_EFFECT',
        message: `unclassified child-process effect '${binding.module}:${method}'`,
      },
    };
  }
  return {
    taxonomy: 'process',
    call: `${binding.module}:${method}`,
    binding: bindingProvenance(binding),
  };
}

function hasLocalDeclaration(checker, identifier) {
  const declarations = checker.getSymbolAtLocation(identifier)?.declarations ?? [];
  return declarations.some(declaration => !declaration.getSourceFile().isDeclarationFile);
}

function classifyNetwork(checker, call) {
  const expression = unwrapExpression(call.expression);
  const imported = resolveImportedBinding(checker, expression);
  const method = imported?.members.at(-1) ?? (imported?.form === 'default' ? 'default' : null);
  if (imported && FETCH_MODULES.has(imported.module) && (method === 'fetch' || method === 'default')) {
    return {
      taxonomy: 'provider-network',
      call: `${imported.module}:fetch`,
      binding: bindingProvenance(imported),
    };
  }
  if (ts.isIdentifier(expression) && expression.text === 'fetch'
    && !hasLocalDeclaration(checker, expression)) {
    return { taxonomy: 'provider-network', call: 'global:fetch', binding: 'global:fetch' };
  }
  if (ts.isPropertyAccessExpression(expression)
    && expression.name.text === 'fetch'
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'globalThis') {
    return { taxonomy: 'provider-network', call: 'global:fetch', binding: 'globalThis.fetch' };
  }
  return null;
}

function classifyTool(checker, call, root) {
  if (!ts.isPropertyAccessExpression(call.expression)
    || call.expression.name.text !== 'callTool') return null;
  const declarations = resolvedSymbol(checker, call.expression)?.declarations ?? [];
  const declaration = declarations.find(candidate => {
    const source = canonicalAbsolutePath(candidate.getSourceFile().fileName);
    return source === CANONICAL_MCP_BROKER_MODULE_ID
      || source.includes('/node_modules/@modelcontextprotocol/sdk/');
  });
  if (!declaration) {
    return {
      excluded: true,
      call: 'mcp:callTool',
      binding: semanticBindingProvenance(checker, call.expression.expression, root)
        ?? 'unresolved:callTool-receiver',
      exclusion: 'UNVERIFIED_TOOL_ORIGIN',
    };
  }
  return {
    taxonomy: 'tool',
    call: 'mcp:callTool',
    binding: `method:${declarationIdentity(declaration, root)}:callTool`,
  };
}

function classifyEffect(checker, call, root) {
  return classifyFileSystem(checker, call)
    ?? classifyFileHandle(checker, call, root)
    ?? classifyDatabase(checker, call, root)
    ?? classifyProcess(checker, call)
    ?? classifyNetwork(checker, call)
    ?? classifyTool(checker, call, root);
}

function resolvedSymbol(checker, node) {
  const location = ts.isPropertyAccessExpression(node) ? node.name : node;
  let symbol = checker.getSymbolAtLocation(location);
  if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

function canonicalCatalogDeclarations(checker, node) {
  return (resolvedSymbol(checker, node)?.declarations ?? []).filter(declaration => (
    canonicalAbsolutePath(declaration.getSourceFile().fileName) === CANONICAL_CATALOG_MODULE_ID
  ));
}

function canonicalOperationIdDeclarations(checker, node) {
  return (resolvedSymbol(checker, node)?.declarations ?? []).filter(declaration => {
    const moduleId = canonicalAbsolutePath(declaration.getSourceFile().fileName);
    return moduleId === CANONICAL_CATALOG_MODULE_ID
      || moduleId === CANONICAL_CATALOG_GENERATED_MODULE_ID;
  });
}

function isCanonicalCatalogExport(checker, node, exportName) {
  return canonicalCatalogDeclarations(checker, node).some(declaration => {
    const name = declaration.name;
    return name && ts.isIdentifier(name) && name.text === exportName;
  });
}

function operationIdFromNode(checker, rawNode) {
  const node = unwrapExpression(rawNode);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (!ts.isPropertyAccessExpression(node)) return null;
  for (const declaration of canonicalOperationIdDeclarations(checker, node)) {
    if (ts.isPropertyAssignment(declaration)
      && ts.isStringLiteralLike(declaration.initializer)) {
      return declaration.initializer.text;
    }
  }
  return null;
}

function resolveOperationExpression(checker, rawNode, seenSymbols = new Set()) {
  const node = unwrapExpression(rawNode);
  if (ts.isCallExpression(node)) {
    if (!isCanonicalCatalogExport(checker, node.expression, 'resolveOperation')) return null;
    const id = node.arguments[0] ? operationIdFromNode(checker, node.arguments[0]) : null;
    const canonical = id ? loadCanonicalCoverageCatalog().operations.get(id) : null;
    return { id, taxonomy: canonical?.taxonomy ?? null };
  }
  if (!ts.isIdentifier(node)) return null;
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol || seenSymbols.has(symbol)) return null;
  const nextSeen = new Set(seenSymbols);
  nextSeen.add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration))
      && declaration.initializer) {
      const resolved = resolveOperationExpression(checker, declaration.initializer, nextSeen);
      if (resolved) return resolved;
    }
  }
  return null;
}

function collectOperationAttributions(checker, rootNode) {
  const attributions = [];
  const visit = node => {
    const resolved = resolveOperationExpression(checker, node);
    if (resolved) {
      attributions.push(resolved);
      return;
    }
    // A nested non-operation call is another action boundary. Do not let an
    // operation inside it lend credit to the enclosing effect site.
    if (ts.isCallExpression(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(rootNode);
  return attributions;
}

function evaluateCoverage(checker, call, taxonomy, diagnostics, identity) {
  const attributions = call.arguments.flatMap(argument => (
    collectOperationAttributions(checker, argument)
  ));
  if (attributions.length > 1) {
    diagnostics.push({
      siteId: identity,
      code: 'AMBIGUOUS_ATTRIBUTION',
      message: `effect carries ${attributions.length} operation lookups without canonical invocation context`,
    });
  }
  for (const attribution of attributions) {
    if (!attribution.taxonomy || !TAXONOMIES.includes(attribution.taxonomy)) {
      diagnostics.push({
        siteId: identity,
        code: 'UNKNOWN_TAXONOMY',
        message: `operation '${attribution.id ?? '<dynamic>'}' has no closed-taxonomy attribution`,
      });
    } else if (attribution.taxonomy !== taxonomy) {
      diagnostics.push({
        siteId: identity,
        code: 'AMBIGUOUS_ATTRIBUTION',
        message: `effect is ${taxonomy} but attached operation is ${attribution.taxonomy}`,
      });
    } else {
      diagnostics.push({
        siteId: identity,
        code: 'UNBOUND_ATTRIBUTION',
        message: `matching ${attribution.id} lookup is not a canonical invocation/effect-context link`,
      });
    }
  }
  // 4031 inventories coverage but cannot manufacture the invocation/effect
  // context owned by 4033/4034. A lookup in an arbitrary API argument is not
  // causal evidence, even when its taxonomy happens to match.
  return false;
}

function compareSites(left, right) {
  return deterministicTextCompare(left.location, right.location)
    || deterministicTextCompare(left.taxonomy, right.taxonomy)
    || deterministicTextCompare(left.call, right.call)
    || deterministicTextCompare(left.binding, right.binding);
}

function siteIdentity(site) {
  return `${site.location}|${site.taxonomy}|${site.call}|${site.binding}|${site.exclusion ?? ''}`;
}

export function createOperationIngressSiteId(site) {
  return `site:sha256:${digest(siteIdentity(site))}`;
}

export function auditOperationIngress(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const sourceRoot = resolve(root, options.source ?? 'src');
  const paths = listSourceFiles(sourceRoot);
  const program = ts.createProgram(paths, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  });
  const checker = program.getTypeChecker();
  const sites = [];
  const unclassifiedSites = [];
  const excludedSites = [];
  const diagnostics = [];

  for (const path of paths) {
    const sourceFile = program.getSourceFile(path);
    if (!sourceFile) continue;
    const visit = node => {
      if (ts.isCallExpression(node)) {
        const classification = classifyEffect(checker, node, root);
        if (classification) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const site = {
            location: `${normalizeRepositoryRelativePath(root, path)}:${position.line + 1}:${position.character + 1}`,
            taxonomy: classification.unclassified
              ? 'unclassified'
              : classification.excluded ? 'excluded' : classification.taxonomy,
            call: classification.call,
            binding: classification.binding,
            ...(classification.exclusion ? { exclusion: classification.exclusion } : {}),
          };
          const identity = createOperationIngressSiteId(site);
          if (classification.diagnostic) {
            diagnostics.push({ siteId: identity, ...classification.diagnostic });
          }
          if (classification.excluded) {
            excludedSites.push({ siteId: identity, ...site });
          } else if (classification.unclassified) {
            unclassifiedSites.push({ siteId: identity, ...site });
          } else {
            sites.push({
              siteId: identity,
              ...site,
              covered: !classification.diagnostic
                && evaluateCoverage(checker, node, site.taxonomy, diagnostics, identity),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  sites.sort(compareSites);
  unclassifiedSites.sort(compareSites);
  excludedSites.sort(compareSites);
  diagnostics.sort((left, right) => deterministicTextCompare(left.siteId, right.siteId)
    || deterministicTextCompare(left.code, right.code));
  const covered = sites.filter(site => site.covered).length;
  const catalog = loadCanonicalCoverageCatalog();
  return {
    schemaVersion: 3,
    taxonomies: TAXONOMIES,
    catalog: {
      schemaVersion: catalog.schemaVersion,
      source: catalog.source,
      digest: catalog.digest,
    },
    total: sites.length + unclassifiedSites.length,
    covered,
    unmatched: sites.length + unclassifiedSites.length - covered,
    sites,
    unclassifiedSites,
    excludedSites,
    diagnostics,
    digest: digest(JSON.stringify({ sites, unclassifiedSites, excludedSites })),
  };
}

export function loadOperationIngressBaseline(path) {
  const baseline = JSON.parse(readFileSync(path, 'utf8'));
  if (baseline?.schemaVersion !== 3
    || !Array.isArray(baseline.sites)
    || !Array.isArray(baseline.taxonomies)
    || baseline.taxonomies.join('|') !== TAXONOMIES.join('|')) {
    throw new Error('expected site-granular schemaVersion 3 baseline with the closed taxonomy');
  }
  if (!Array.isArray(baseline.diagnostics)
    || baseline.diagnostics.length !== 0
    || !Array.isArray(baseline.unclassifiedSites)
    || baseline.unclassifiedSites.length !== 0
    || !Array.isArray(baseline.excludedSites)) {
    throw new Error('baseline must not contain unresolved or unclassified semantic sites');
  }
  const catalog = loadCanonicalCoverageCatalog();
  if (baseline.catalog?.schemaVersion !== catalog.schemaVersion
    || baseline.catalog?.source !== catalog.source
    || baseline.catalog?.digest !== catalog.digest) {
    throw new Error('baseline catalog provenance does not match the canonical operation catalog');
  }

  const ids = baseline.sites.map(site => site?.siteId);
  if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('baseline sites require unique string siteId values');
  }
  for (const site of baseline.sites) {
    if (typeof site.location !== 'string'
      || !TAXONOMIES.includes(site.taxonomy)
      || typeof site.call !== 'string'
      || typeof site.binding !== 'string'
      || typeof site.covered !== 'boolean') {
      throw new Error(`baseline site '${site.siteId}' has an invalid site-granular expectation`);
    }
    if (site.siteId !== createOperationIngressSiteId(site)) {
      throw new Error(`baseline site '${site.siteId}' does not match its semantic identity`);
    }
  }
  const excludedIds = baseline.excludedSites.map(site => site?.siteId);
  if (excludedIds.some(id => typeof id !== 'string')
    || new Set(excludedIds).size !== excludedIds.length) {
    throw new Error('baseline excluded sites require unique string siteId values');
  }
  for (const site of baseline.excludedSites) {
    if (typeof site.location !== 'string'
      || site.taxonomy !== 'excluded'
      || site.call !== 'mcp:callTool'
      || typeof site.binding !== 'string'
      || site.exclusion !== 'UNVERIFIED_TOOL_ORIGIN'
      || site.siteId !== createOperationIngressSiteId(site)) {
      throw new Error(`baseline excluded site '${site.siteId}' is invalid`);
    }
  }

  const sorted = [...baseline.sites].sort(compareSites);
  if (baseline.sites.some((site, index) => site !== sorted[index])) {
    throw new Error('baseline sites must use deterministic semantic order');
  }
  const sortedExcluded = [...baseline.excludedSites].sort(compareSites);
  if (baseline.excludedSites.some((site, index) => site !== sortedExcluded[index])) {
    throw new Error('baseline excluded sites must use deterministic semantic order');
  }
  const covered = baseline.sites.filter(site => site.covered).length;
  if (baseline.total !== baseline.sites.length
    || baseline.covered !== covered
    || baseline.unmatched !== baseline.sites.length - covered) {
    throw new Error('baseline totals must exactly match its site expectations');
  }
  if (baseline.digest !== digest(JSON.stringify({
    sites: baseline.sites,
    unclassifiedSites: baseline.unclassifiedSites,
    excludedSites: baseline.excludedSites,
  }))) {
    throw new Error('baseline digest does not match its site expectations');
  }
  return baseline;
}

function loadSchema2BaselineForMigration(path) {
  const baseline = JSON.parse(readFileSync(path, 'utf8'));
  if (baseline?.schemaVersion !== 2
    || !Array.isArray(baseline.sites)
    || baseline.taxonomies?.join('|') !== TAXONOMIES.join('|')
    || !Array.isArray(baseline.diagnostics)
    || baseline.diagnostics.length !== 0) {
    throw new Error('expected diagnostic-free site-granular schemaVersion 2 baseline');
  }
  const ids = baseline.sites.map(site => site?.siteId);
  if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('schemaVersion 2 baseline sites require unique string ids');
  }
  for (const site of baseline.sites) {
    if (typeof site.location !== 'string'
      || !TAXONOMIES.includes(site.taxonomy)
      || typeof site.call !== 'string'
      || typeof site.binding !== 'string'
      || typeof site.covered !== 'boolean'
      || site.siteId !== `site:sha256:${digest(
        `${site.location}|${site.taxonomy}|${site.call}|${site.binding}`,
      )}`) {
      throw new Error(`schemaVersion 2 baseline site '${site.siteId}' is invalid`);
    }
  }
  // Schema 2 was emitted with localeCompare. Preserve that legacy validation
  // only at the one-way migration boundary; schema 3 uses deterministic
  // code-unit ordering on every platform.
  const sorted = [...baseline.sites].sort((left, right) => (
    left.location.localeCompare(right.location)
      || left.taxonomy.localeCompare(right.taxonomy)
      || left.call.localeCompare(right.call)
      || left.binding.localeCompare(right.binding)
  ));
  if (baseline.sites.some((site, index) => site !== sorted[index])) {
    throw new Error('schemaVersion 2 baseline sites are not deterministically ordered');
  }
  const covered = baseline.sites.filter(site => site.covered).length;
  if (baseline.total !== baseline.sites.length
    || baseline.covered !== covered
    || baseline.unmatched !== baseline.sites.length - covered
    || baseline.digest !== digest(JSON.stringify(baseline.sites))) {
    throw new Error('schemaVersion 2 baseline totals or digest are invalid');
  }
  return baseline;
}

export function evaluateOperationIngressRatchet(report, baseline) {
  const live = new Map(report.sites.map(site => [site.siteId, site]));
  const prior = new Map(baseline.sites.map(site => [site.siteId, site]));
  const liveExcluded = new Map(report.excludedSites.map(site => [site.siteId, site]));
  const priorExcluded = new Map(baseline.excludedSites.map(site => [site.siteId, site]));
  const added = report.sites.filter(site => !prior.has(site.siteId));
  const removed = baseline.sites.filter(site => !live.has(site.siteId));
  const excludedAdded = report.excludedSites.filter(site => !priorExcluded.has(site.siteId));
  const excludedRemoved = baseline.excludedSites.filter(site => !liveExcluded.has(site.siteId));
  const coverageGained = report.sites.filter(site => (
    prior.get(site.siteId)?.covered === false && site.covered
  ));
  const coverageLost = report.sites.filter(site => (
    prior.get(site.siteId)?.covered === true && !site.covered
  ));
  return {
    added,
    removed,
    coverageGained,
    coverageLost,
    excludedAdded,
    excludedRemoved,
    diagnostics: report.diagnostics,
    ok: added.length === 0
      && removed.length === 0
      && coverageGained.length === 0
      && coverageLost.length === 0
      && excludedAdded.length === 0
      && excludedRemoved.length === 0
      && report.diagnostics.length === 0,
  };
}

function evaluateBaselineRefresh(report, baseline) {
  const result = evaluateOperationIngressRatchet(report, baseline);
  return {
    ...result,
    ok: result.removed.length === 0
      && result.coverageLost.length === 0
      && report.unclassifiedSites.length === 0
      && report.diagnostics.length === 0,
  };
}

function migrationCoreIdentity(site) {
  return `${site.location}|${site.taxonomy}|${site.call}`;
}

function evaluateSchema2Migration(report, baseline) {
  const liveById = new Map(report.sites.map(site => [site.siteId, site]));
  const liveByCore = new Map();
  for (const site of report.sites) {
    const key = migrationCoreIdentity(site);
    const values = liveByCore.get(key) ?? [];
    values.push(site);
    liveByCore.set(key, values);
  }
  const lost = [];
  const coverageLost = [];
  const ambiguous = [];
  const dispositions = [];
  const excludedByLocationAndCall = new Map(report.excludedSites.map(site => (
    [`${site.location}|${site.call}`, site]
  )));
  for (const prior of baseline.sites) {
    const exact = liveById.get(prior.siteId);
    const candidates = exact ? [exact] : liveByCore.get(migrationCoreIdentity(prior)) ?? [];
    if (candidates.length === 0) {
      const excluded = excludedByLocationAndCall.get(`${prior.location}|${prior.call}`);
      if (prior.taxonomy === 'tool'
        && excluded?.exclusion === 'UNVERIFIED_TOOL_ORIGIN') {
        dispositions.push({ prior, excluded });
      } else {
        lost.push(prior);
      }
    }
    else if (candidates.length > 1) ambiguous.push(prior);
    else if (prior.covered && !candidates[0].covered) coverageLost.push(prior);
  }
  return {
    lost,
    coverageLost,
    ambiguous,
    dispositions,
    diagnostics: report.diagnostics,
    ok: lost.length === 0
      && coverageLost.length === 0
      && ambiguous.length === 0
      && report.unclassifiedSites.length === 0
      && report.diagnostics.length === 0,
  };
}

function emitSemanticDiagnostics(diagnostics) {
  for (const diagnostic of diagnostics) {
    process.stderr.write(
      `[operation-ingress] ${diagnostic.code} ${diagnostic.siteId}: ${diagnostic.message}\n`,
    );
  }
}

function emitRatchetFailure(result) {
  emitSemanticDiagnostics(result.diagnostics);
  for (const site of result.added) {
    process.stderr.write(
      `[operation-ingress] UNMATCHED_SITE ${site.siteId} ${site.location} ${site.taxonomy} ${site.call} binding=${site.binding}\n`,
    );
  }
  for (const site of result.removed) {
    process.stderr.write(
      `[operation-ingress] MISSING_BASELINE_SITE ${site.siteId} ${site.location}\n`,
    );
  }
  for (const site of result.coverageGained) {
    process.stderr.write(
      `[operation-ingress] COVERAGE_GAINED ${site.siteId} ${site.location}\n`,
    );
  }
  for (const site of result.coverageLost) {
    process.stderr.write(
      `[operation-ingress] COVERAGE_LOST ${site.siteId} ${site.location}\n`,
    );
  }
}

function emitWriteRefusal(report, result, prefix = 'BASELINE_WRITE_REFUSED') {
  emitSemanticDiagnostics(report.diagnostics);
  for (const site of result.removed ?? result.lost ?? []) {
    process.stderr.write(
      `[operation-ingress] PRIOR_DEBT_LOST ${site.siteId} ${site.location}\n`,
    );
  }
  for (const site of result.coverageLost ?? []) {
    process.stderr.write(
      `[operation-ingress] COVERAGE_LOST ${site.siteId} ${site.location}\n`,
    );
  }
  for (const site of result.ambiguous ?? []) {
    process.stderr.write(
      `[operation-ingress] MIGRATION_AMBIGUOUS ${site.siteId} ${site.location}\n`,
    );
  }
  process.stderr.write(`[operation-ingress] ${prefix}: comparative debt-preservation gate failed\n`);
}

function writeBaselineAtomically(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    });
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
}

function parseArguments(arguments_) {
  const options = {
    root: ROOT,
    source: 'src',
    baseline: null,
    check: false,
    write: false,
    initialize: false,
    migrateBaseline: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--write') options.write = true;
    else if (argument === '--initialize') options.initialize = true;
    else if (argument === '--migrate-baseline') options.migrateBaseline = true;
    else if (argument === '--root' || argument === '--source' || argument === '--baseline') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === '--root') options.root = value;
      else if (argument === '--source') options.source = value;
      else options.baseline = value;
    } else {
      throw new Error(`unknown argument '${argument}'`);
    }
  }
  const modes = [options.check, options.write, options.initialize, options.migrateBaseline]
    .filter(Boolean).length;
  if (modes > 1) {
    throw new Error('--check, --write, --initialize and --migrate-baseline are mutually exclusive');
  }
  options.root = resolve(options.root);
  options.baseline = resolve(
    options.baseline ?? join(options.root, 'scripts/operation-ingress-baseline.json'),
  );
  return options;
}

function invokedDirectly() {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const report = auditOperationIngress({ root: options.root, source: options.source });
    if (options.initialize) {
      if (existsSync(options.baseline)) {
        process.stderr.write('[operation-ingress] BASELINE_INITIALIZE_REFUSED: baseline already exists\n');
        process.exitCode = 1;
      } else if (report.diagnostics.length > 0 || report.unclassifiedSites.length > 0) {
        emitWriteRefusal(report, {}, 'BASELINE_INITIALIZE_REFUSED');
        process.exitCode = 1;
      } else {
        writeBaselineAtomically(options.baseline, report);
        process.stdout.write(
          `[operation-ingress] baseline initialized: ${report.total} semantic sites (${report.unmatched} unmatched)\n`,
        );
      }
    } else if (options.migrateBaseline) {
      try {
        const baseline = loadSchema2BaselineForMigration(options.baseline);
        const result = evaluateSchema2Migration(report, baseline);
        if (!result.ok) {
          emitWriteRefusal(report, result, 'BASELINE_MIGRATION_REFUSED');
          process.exitCode = 1;
        } else {
          writeBaselineAtomically(options.baseline, report);
          process.stdout.write(
            `[operation-ingress] baseline migrated: ${report.total} semantic sites (${report.unmatched} unmatched; excluded-dispositions=${result.dispositions.length})\n`,
          );
        }
      } catch (error) {
        process.stderr.write(
          `[operation-ingress] BASELINE_MIGRATION_REFUSED: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
      }
    } else if (options.write) {
      if (report.diagnostics.length > 0 || report.unclassifiedSites.length > 0) {
        emitWriteRefusal(report, {});
        process.exitCode = 1;
      } else {
        try {
          const baseline = loadOperationIngressBaseline(options.baseline);
          const result = evaluateBaselineRefresh(report, baseline);
          if (!result.ok) {
            emitWriteRefusal(report, result);
            process.exitCode = 1;
          } else {
            writeBaselineAtomically(options.baseline, report);
            process.stdout.write(
              `[operation-ingress] baseline advanced: ${report.total} semantic sites (${report.unmatched} unmatched; added=${result.added.length}; coverage-gained=${result.coverageGained.length})\n`,
            );
          }
        } catch (error) {
          process.stderr.write(
            `[operation-ingress] BASELINE_WRITE_REFUSED: ${error instanceof Error ? error.message : String(error)}\n`,
          );
          process.exitCode = 1;
        }
      }
    } else if (options.check) {
      try {
        const baseline = loadOperationIngressBaseline(options.baseline);
        const result = evaluateOperationIngressRatchet(report, baseline);
        if (!result.ok) {
          emitRatchetFailure(result);
          process.exitCode = 1;
        } else {
          process.stdout.write(
            `[operation-ingress] PASS: ${report.total} semantic sites; covered=${report.covered}; unmatched=${report.unmatched}; digest=${report.digest.slice(0, 12)}\n`,
          );
        }
      } catch (error) {
        process.stderr.write(
          `[operation-ingress] BASELINE_INVALID: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
      }
    } else {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `[operation-ingress] ARGUMENT_ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
