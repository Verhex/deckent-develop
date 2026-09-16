#!/usr/bin/env node
/** Fail-closed ADR-D-004 full TypeScript source-graph gate. */
import {
  closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdtempSync, openSync, readFileSync,
  readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ts = createRequire(import.meta.url)('typescript');
const REPO_ROOT = realpathSync(resolve(fileURLToPath(import.meta.url), '..', '..'));
const DEFAULT_REGISTRY = join(REPO_ROOT, '.deckent', 'settings', 'layer-shims.json');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const REQUIRED_FIELDS = ['id', 'from', 'to', 'symbols', 'reason', 'adrRef', 'owner', 'dateAdded', 'expiresOn', 'replacement'];
const BRAIN_FAMILY = new Set([
  'sprint-controller', 'sprint-phases', 'sprint-spawner', 'sprint-lifecycle',
  'sprint-planner', 'sprint-finalizer', 'sprint-utils', 'result-collector',
  'result-evaluator', 'debt-manager', 'resource-monitor', 'spawn-backend',
  'spawn-backend-docker', 'brain', 'index',
]);
const BRAIN_INTERNALS = new Set(['tmux', 'auditor', 'worker']);
const TOPOLOGY = Object.freeze({
  version: 1,
  layers: ['core', 'orchestra', 'providers', 'cli', 'api', 'mcp'],
  forbidden: [
    'core>orchestra', 'core>providers', 'core>cli', 'core>api', 'core>mcp',
    'orchestra>providers', 'orchestra>cli', 'orchestra>api', 'orchestra>mcp',
    'cli>api', 'cli>mcp', 'api>cli', 'api>mcp', 'mcp>cli', 'mcp>api',
  ],
  brainFamily: [...BRAIN_FAMILY].sort(),
  brainInternals: [...BRAIN_INTERNALS].sort(),
});
const HELP = `Usage: node scripts/lint-layer-shims.mjs [options]

Options:
  --root <dir>          Repository root
  --registry <path>     Registry JSON path
  --now <YYYY-MM-DD>    Exception-expiry date (UTC today by default)
  --json                Deterministic JSON output
  --init-baseline       Atomically initialize exact atoms and SCCs
  --shrink-baseline     Atomically remove resolved atoms/SCCs only
  --write-topology      Atomically write compiled ADR topology
  --help                Show help
Exit: 0 clean/written, 1 policy violation, 2 usage/input/scan error
`;

class InputError extends Error {}
const posix = (value) => value.split(sep).join('/');
const unique = (items) => [...new Set(items)].sort();
const day = (date) => date.toISOString().slice(0, 10);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;

function portablePath(value, label) {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || isAbsolute(value)) {
    throw new InputError(`${label} must be a non-empty POSIX relative path`);
  }
  if (value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new InputError(`${label} is not normalized/contained: ${value}`);
  }
  return value;
}

function ensureContained(root, candidate, label) {
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new InputError(`${label} escapes repository root`);
  }
}

function exactExisting(root, relPath, label, expected = 'file') {
  portablePath(relPath, label);
  let cursor = root;
  for (const part of relPath.split('/')) {
    const names = readdirSync(cursor);
    if (!names.includes(part)) {
      if (names.some((name) => name.toLowerCase() === part.toLowerCase())) {
        throw new InputError(`${label} has incorrect case: ${relPath}`);
      }
      throw new InputError(`${label} does not exist: ${relPath}`);
    }
    cursor = join(cursor, part);
  }
  const canonical = realpathSync(cursor);
  ensureContained(root, canonical, label);
  const stats = statSync(canonical);
  if (expected === 'file' && !stats.isFile()) throw new InputError(`${label} is not a file`);
  if (expected === 'directory' && !stats.isDirectory()) throw new InputError(`${label} is not a directory`);
  return canonical;
}

function rootPath(value) {
  const canonical = realpathSync(resolve(value));
  if (!statSync(canonical).isDirectory()) throw new InputError('--root is not a directory');
  return canonical;
}

function registryPath(root, value) {
  const absolute = resolve(value);
  ensureContained(root, absolute, '--registry');
  return exactExisting(root, posix(relative(root, absolute)), '--registry');
}

function ignoredSource(path, policy) {
  const parts = path.split('/');
  const filename = parts.at(-1) ?? '';
  const directoryRules = {
    node_modules: 'src/**/node_modules/**', out: 'src/**/out/**', dist: 'src/**/dist/**',
    'dist-app': 'src/**/dist-app/**', build: 'src/**/build/**', tests: 'src/**/tests/**',
    __tests__: 'src/**/__tests__/**',
  };
  const ignored = new Set(policy.ignore);
  return parts.slice(0, -1).some((part) => ignored.has(directoryRules[part])) ||
    (filename.endsWith('.test.ts') && ignored.has('src/**/*.test.ts')) ||
    (filename.endsWith('.test.tsx') && ignored.has('src/**/*.test.tsx')) ||
    (filename.endsWith('.spec.ts') && ignored.has('src/**/*.spec.ts')) ||
    (filename.endsWith('.spec.tsx') && ignored.has('src/**/*.spec.tsx'));
}

function walkSources(root, policy) {
  const sourceRoot = exactExisting(root, 'src', 'source root', 'directory');
  const files = [];
  const walk = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const folded = new Set();
    for (const entry of entries) {
      const key = entry.name.toLowerCase();
      if (folded.has(key)) throw new InputError(`case collision in ${posix(relative(root, directory)) || '.'}: ${entry.name}`);
      folded.add(key);
      const path = join(directory, entry.name);
      const relPath = posix(relative(root, path));
      if (ignoredSource(relPath, policy)) continue;
      if (entry.isSymbolicLink()) {
        ensureContained(root, realpathSync(path), `source symlink ${posix(relative(root, path))}`);
        throw new InputError(`source graph contains symlink: ${posix(relative(root, path))}`);
      }
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && SOURCE_EXTENSIONS.includes(extname(entry.name))) files.push(path);
    }
  };
  walk(sourceRoot);
  return files;
}

function symbolsFromImport(clause) {
  if (!clause) return ['(side-effect)'];
  const symbols = [];
  if (clause.name) symbols.push('default');
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) symbols.push('*');
    else for (const item of clause.namedBindings.elements) {
      symbols.push(item.propertyName?.text ?? item.name.text);
    }
  }
  return unique(symbols);
}

function symbolsFromExport(node) {
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) return ['*'];
  return unique(node.exportClause.elements.map((item) => item.propertyName?.text ?? item.name.text));
}

/** Parse every static declaration plus literal dynamic import/require via TypeScript AST. */
export function extractDeclarationAtoms(content, fileName = 'source.ts') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, kind);
  if (source.parseDiagnostics.length) {
    const diagnostic = source.parseDiagnostics[0];
    const at = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    throw new InputError(`${fileName}:${at.line + 1}:${at.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  }
  const atoms = [];
  const add = (declarationKind, specifier, symbols, node) => atoms.push({
    kind: declarationKind,
    specifier,
    symbols: unique(symbols),
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  });
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteralLike(node.moduleSpecifier)) throw new InputError(`${fileName}: non-literal import`);
      add('import', node.moduleSpecifier.text, symbolsFromImport(node.importClause), node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (!ts.isStringLiteralLike(node.moduleSpecifier)) throw new InputError(`${fileName}: non-literal export`);
      add('export', node.moduleSpecifier.text, symbolsFromExport(node), node);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!ts.isExternalModuleReference(node.moduleReference) ||
          !ts.isStringLiteralLike(node.moduleReference.expression)) {
        throw new InputError(`${fileName}: unsupported import-equals`);
      }
      add('import-equals', node.moduleReference.expression.text, ['*'], node);
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
       (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) {
        // Only literal runtime references have a deterministic source-graph target.
      } else {
        add(node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic-import' : 'require',
          node.arguments[0].text, ['*'], node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return atoms;
}

/** Legacy export retained, now AST-backed. */
export function extractCliCrossings(content) {
  return extractDeclarationAtoms(content)
    .filter((atom) => atom.specifier.includes('/cli/'))
    .map((atom) => ({ to: atom.specifier, symbols: atom.symbols }));
}

function candidates(importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  const extension = extname(base);
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    const stem = base.slice(0, -extension.length);
    const mapped = extension === '.mjs' ? ['.mts'] : extension === '.cjs' ? ['.cts'] : ['.ts', '.tsx'];
    return mapped.map((suffix) => `${stem}${suffix}`);
  }
  if (SOURCE_EXTENSIONS.includes(extension) || extension) return [base];
  return [
    base,
    ...SOURCE_EXTENSIONS.map((suffix) => `${base}${suffix}`),
    ...SOURCE_EXTENSIONS.map((suffix) => join(base, `index${suffix}`)),
  ];
}

function resolveLocal(root, importer, specifier) {
  if (!specifier.startsWith('.')) return { external: true, specifier };
  if (specifier.includes('\\') || specifier.includes('\0')) throw new InputError(`invalid specifier '${specifier}'`);
  const possible = candidates(importer, specifier);
  for (const path of possible) ensureContained(root, path, `specifier '${specifier}'`);
  const found = [];
  for (const path of possible) {
    try {
      const stats = lstatSync(path);
      if (!stats.isFile()) continue;
      const canonical = realpathSync(path);
      ensureContained(root, canonical, `specifier '${specifier}'`);
      found.push(canonical);
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
    }
  }
  const exact = unique(found);
  const from = posix(relative(root, importer));
  if (!exact.length) throw new InputError(`unresolved relative specifier '${specifier}' from ${from}`);
  if (exact.length > 1) {
    throw new InputError(`ambiguous relative specifier '${specifier}' from ${from}: ${exact.map((path) => posix(relative(root, path))).join(', ')}`);
  }
  return { external: false, target: exact[0] };
}

export function resolveSpecifier(fromFileRel, specifier, rootDir = REPO_ROOT) {
  const root = rootPath(rootDir);
  const importer = exactExisting(root, portablePath(fromFileRel, 'from file'), 'from file');
  const result = resolveLocal(root, importer, specifier);
  return result.external ? specifier : posix(relative(root, result.target));
}

const layerOf = (path) => /^src\/(core|orchestra|providers|cli|api|mcp)(?:\/|$)/.exec(path)?.[1] ?? null;
const forbidden = (from, to) => from && to && TOPOLOGY.forbidden.includes(`${from}>${to}`);
const atomKey = (atom) => `${atom.from}|${atom.kind}|${atom.to}|${atom.symbols.join(',')}`;

function stronglyConnected(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  for (const targets of adjacency.values()) targets.sort();
  let counter = 0;
  const indexes = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const result = [];
  const visit = (node) => {
    indexes.set(node, counter); low.set(node, counter); counter += 1;
    stack.push(node); active.add(node);
    for (const target of adjacency.get(node) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target)) low.set(node, Math.min(low.get(node), indexes.get(target)));
    }
    if (low.get(node) === indexes.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop(); active.delete(member); component.push(member);
      } while (member !== node);
      component.sort();
      if (component.length > 1 || (adjacency.get(node) ?? []).includes(node)) result.push(component);
    }
  };
  for (const node of nodes) if (!indexes.has(node)) visit(node);
  return result.sort((a, b) => a.join('|').localeCompare(b.join('|'), 'en'));
}

function matchingOwnership(path, ownership) {
  return ownership.filter((entry) => entry.selector.kind === 'exact-file'
    ? entry.selector.path === path
    : path.startsWith(`${entry.selector.path}/`));
}

function buildGraph(root, registry) {
  const files = walkSources(root, registry.sourcePolicy);
  const nodes = files.map((path) => posix(relative(root, path))).sort();
  const sourcePaths = new Set(files.map((path) => realpathSync(path)));
  const edges = [];
  const violations = [];
  const ownershipFindings = [];
  for (const file of files) {
    const from = posix(relative(root, file));
    const owners = matchingOwnership(from, registry.ownership);
    if (owners.length === 0) ownershipFindings.push({ type: 'unowned-source', source: from });
    else if (owners.length > 1) ownershipFindings.push({
      type: 'multiple-source-owners', source: from, owners: owners.map((owner) => owner.moduleId).sort(),
    });
    for (const atom of extractDeclarationAtoms(readFileSync(file, 'utf8'), from)) {
      const resolved = resolveLocal(root, file, atom.specifier);
      if (resolved.external) continue;
      const to = posix(relative(root, resolved.target));
      const record = { from, kind: atom.kind, to, symbols: atom.symbols, line: atom.line };
      if (sourcePaths.has(resolved.target)) edges.push(record);
      const fromLayer = layerOf(from);
      const toLayer = layerOf(to);
      if (forbidden(fromLayer, toLayer)) violations.push({ ...record, rule: `${fromLayer}>${toLayer}` });
      if (fromLayer === 'orchestra' && BRAIN_INTERNALS.has(basename(to, extname(to))) &&
          !BRAIN_FAMILY.has(basename(from, extname(from)))) {
        violations.push({ ...record, rule: 'brain-family' });
      }
    }
  }
  edges.sort((a, b) => atomKey(a).localeCompare(atomKey(b), 'en'));
  violations.sort((a, b) => atomKey(a).localeCompare(atomKey(b), 'en'));
  return { nodes, edges, violations, ownershipFindings, sccs: stronglyConnected(nodes, edges) };
}

export function loadRegistry(path = DEFAULT_REGISTRY) {
  if (!existsSync(path)) throw new InputError(`registry does not exist: ${path}`);
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new InputError('registry root must be an object');
  }
  return registry;
}

function stringArray(value, label, nonEmpty = false) {
  if (!Array.isArray(value) || (nonEmpty && !value.length) ||
      value.some((item) => typeof item !== 'string' || !item)) {
    throw new InputError(`${label} must be ${nonEmpty ? 'a non-empty' : 'an'} string array`);
  }
  if (new Set(value).size !== value.length) throw new InputError(`${label} contains duplicates`);
}

/** Returns legacy missing-field objects and detailed registry problems. */
export function validateRegistry(registry, rootDir = REPO_ROOT, now = new Date()) {
  const problems = [];
  try {
    if (registry.schemaVersion !== 2) throw new InputError('registry.schemaVersion must be 2');
    if (!registry.sourcePolicy || typeof registry.sourcePolicy !== 'object' ||
        registry.sourcePolicy.unmatchedPolicy !== 'reject' ||
        registry.sourcePolicy.multipleMatchPolicy !== 'reject' ||
        !Array.isArray(registry.sourcePolicy.ignore)) {
      throw new InputError('sourcePolicy must reject unmatched and multiple ownership');
    }
    if (!Array.isArray(registry.ownership)) throw new InputError('registry.ownership must be an array');
    for (const [index, entry] of registry.ownership.entries()) {
      if (!entry || typeof entry !== 'object' || typeof entry.moduleId !== 'string' || !entry.moduleId ||
          !entry.selector || typeof entry.selector !== 'object' ||
          !['exact-file', 'subtree'].includes(entry.selector.kind)) {
        throw new InputError(`ownership[${index}] must declare moduleId and selector`);
      }
      portablePath(entry.selector.path, `ownership[${index}].selector.path`);
    }
    if (!Array.isArray(registry.shims)) throw new InputError('registry.shims must be an array');
    const ids = new Set();
    for (let index = 0; index < registry.shims.length; index += 1) {
      const entry = registry.shims[index];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new InputError(`shims[${index}] must be an object`);
      const missingFields = REQUIRED_FIELDS.filter((field) =>
        entry[field] === undefined || entry[field] === null || entry[field] === '');
      if (missingFields.length) {
        problems.push({ id: entry.id ?? '(no id)', missingFields });
        continue;
      }
      if (ids.has(entry.id)) throw new InputError(`duplicate shim id: ${entry.id}`);
      ids.add(entry.id);
      for (const field of ['id', 'reason', 'adrRef', 'owner', 'dateAdded', 'expiresOn', 'replacement']) {
        if (typeof entry[field] !== 'string') throw new InputError(`${entry.id}.${field} must be a string`);
      }
      portablePath(entry.from, `${entry.id}.from`);
      portablePath(entry.to, `${entry.id}.to`);
      if (entry.from.includes('*') || entry.to.includes('*')) throw new InputError(`${entry.id} wildcard paths are forbidden`);
      exactExisting(rootDir, entry.from, `${entry.id}.from`);
      exactExisting(rootDir, entry.to.replace(/\.(?:js|mjs|cjs)$/, '.ts'), `${entry.id}.to`);
      stringArray(entry.symbols, `${entry.id}.symbols`, true);
      if (entry.symbols.includes('*')) throw new InputError(`${entry.id}.symbols must be exact; wildcard is forbidden`);
      if (entry.enforced !== undefined && typeof entry.enforced !== 'boolean') {
        throw new InputError(`${entry.id}.enforced must be boolean`);
      }
      for (const [field, value] of [['dateAdded', entry.dateAdded], ['expiresOn', entry.expiresOn]]) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError(`${entry.id}.${field} must be YYYY-MM-DD`);
        const date = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(date.valueOf()) || day(date) !== value) throw new InputError(`${entry.id}.${field} is invalid`);
      }
      if (entry.dateAdded > entry.expiresOn) throw new InputError(`${entry.id}.dateAdded must not follow expiresOn`);
      if (new Date(`${entry.expiresOn}T00:00:00Z`) < now) throw new InputError(`${entry.id} expired on ${entry.expiresOn}`);
    }
    if (registry.baseline !== undefined) {
      if (!registry.baseline || typeof registry.baseline !== 'object' || registry.baseline.version !== 1) {
        throw new InputError('baseline.version must be 1');
      }
      stringArray(registry.baseline.atoms, 'baseline.atoms');
      if (!Array.isArray(registry.baseline.sccs)) throw new InputError('baseline.sccs must be an array');
      registry.baseline.sccs.forEach((component, index) => stringArray(component, `baseline.sccs[${index}]`, true));
    }
    if (registry.topology !== undefined &&
        JSON.stringify(stable(registry.topology)) !== JSON.stringify(stable(TOPOLOGY))) {
      throw new InputError('registry topology drifts from compiled ADR topology');
    }
  } catch (error) {
    if (error instanceof InputError) problems.push({ id: '(registry)', missingFields: [], message: error.message });
    else throw error;
  }
  return problems;
}

function matchingShims(atom, shims) {
  return shims.filter((entry) => entry.from === atom.from &&
    entry.to.replace(/\.(?:js|mjs|cjs)$/, '.ts') === atom.to &&
    entry.symbols.length === atom.symbols.length && atom.symbols.every((symbol) => entry.symbols.includes(symbol)));
}

function evaluate(registry, graph) {
  const findings = [...graph.ownershipFindings];
  const baseline = new Set(registry.baseline?.atoms ?? []);
  const actualAtoms = [];
  for (const atom of graph.violations) {
    const owners = matchingShims(atom, registry.shims);
    if (owners.length > 1) {
      findings.push({ type: 'ambiguous-ownership', atom: atomKey(atom), owners: owners.map((item) => item.id).sort() });
    } else if (owners.length === 0) {
      const key = atomKey(atom);
      actualAtoms.push(key);
      if (!baseline.has(key)) findings.push({ type: 'new-crossing', atom: key, rule: atom.rule });
    }
  }
  for (const shim of registry.shims) {
    const owners = graph.violations.filter((atom) => matchingShims(atom, [shim]).length === 1);
    if (owners.length !== 1) findings.push({ type: 'stale-exception', id: shim.id, matchingAtoms: owners.length });
  }
  const exactActual = unique(actualAtoms);
  for (const key of baseline) {
    if (!exactActual.includes(key)) findings.push({ type: 'baseline-reduction-requires-shrink', atom: key });
  }
  if (!registry.baseline && exactActual.length) findings.push({ type: 'baseline-missing', count: exactActual.length });

  const oldSccs = registry.baseline?.sccs ?? [];
  for (const component of graph.sccs) {
    if (!oldSccs.some((old) => component.every((node) => old.includes(node)) && component.length <= old.length)) {
      findings.push({ type: 'scc-growth', component });
    }
  }
  for (const old of oldSccs) {
    if (!graph.sccs.some((current) => current.join('\0') === [...old].sort().join('\0'))) {
      findings.push({ type: 'scc-reduction-requires-shrink', component: old });
    }
  }
  if (!registry.topology) findings.push({ type: 'topology-missing' });
  return { findings, actualAtoms: exactActual };
}

/** Full graph check compatibility export. */
export function runCheck(registry = loadRegistry(), rootDir = REPO_ROOT) {
  const root = rootPath(rootDir);
  const problems = validateRegistry(registry, root);
  if (problems.length) {
    throw new InputError(problems.map((item) =>
      item.message ?? `${item.id}: missing [${item.missingFields.join(', ')}]`).join('; '));
  }
  return evaluate(registry, buildGraph(root, registry)).findings;
}

/** Single-file compatibility export, still AST/exact-resolution based. */
export function checkFile(absPath, fromFileRel, entries, rootDir = REPO_ROOT) {
  const root = rootPath(rootDir);
  const importer = realpathSync(absPath);
  ensureContained(root, importer, fromFileRel);
  const results = [];
  for (const atom of extractDeclarationAtoms(readFileSync(importer, 'utf8'), fromFileRel)) {
    const resolved = resolveLocal(root, importer, atom.specifier);
    if (resolved.external) continue;
    const to = posix(relative(root, resolved.target));
    if (!forbidden(layerOf(fromFileRel), layerOf(to))) continue;
    const record = { from: fromFileRel, kind: atom.kind, to, symbols: atom.symbols };
    const owners = matchingShims(record, entries);
    if (!owners.length) results.push({ type: 'unregistered-crossing', to, symbols: atom.symbols });
    else if (owners.length > 1) results.push({ type: 'ambiguous-ownership', to, symbols: atom.symbols });
  }
  return results;
}

function atomicWrite(path, value, noClobber = false) {
  const directory = dirname(path);
  const temporaryDirectory = mkdtempSync(join(directory, `.${basename(path)}.`));
  const temporary = join(temporaryDirectory, 'next');
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, stableJson(value), 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (noClobber) {
      try { linkSync(temporary, path); }
      catch (error) {
        if (error?.code === 'EEXIST') throw new InputError('baseline already exists; use --shrink-baseline');
        throw error;
      }
      unlinkSync(temporary);
    } else renameSync(temporary, path);
    const directoryDescriptor = openSync(directory, 'r');
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = { root: REPO_ROOT, registry: null, now: day(new Date()), json: false, writer: null, help: false };
  const writers = new Map([
    ['--init-baseline', 'init'], ['--shrink-baseline', 'shrink'], ['--write-topology', 'topology'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (writers.has(arg)) {
      if (options.writer) throw new InputError('writer flags are mutually exclusive');
      options.writer = writers.get(arg);
    } else if (['--root', '--registry', '--now'].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new InputError(`${arg} requires a value`);
      index += 1;
      if (arg === '--root') options.root = value;
      else if (arg === '--registry') options.registry = value;
      else options.now = value;
    } else throw new InputError(`unknown option: ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.now)) throw new InputError('--now must be YYYY-MM-DD');
  options.nowDate = new Date(`${options.now}T00:00:00Z`);
  if (Number.isNaN(options.nowDate.valueOf()) || day(options.nowDate) !== options.now) {
    throw new InputError('--now is not a valid date');
  }
  return options;
}

function emit(options, payload, text, error = false) {
  (error ? process.stderr : process.stdout).write(options.json ? stableJson(payload) : `${text}\n`);
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`[layer-shims] ERROR: ${error.message}\n${HELP}`);
    return 2;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  try {
    const root = rootPath(options.root);
    const requestedRegistry = options.registry ? resolve(options.registry) :
      join(root, '.deckent', 'settings', 'layer-shims.json');
    const path = registryPath(root, requestedRegistry);
    const registry = loadRegistry(path);
    const problems = validateRegistry(registry, root, options.nowDate);
    if (problems.length) {
      throw new InputError(problems.map((item) =>
        item.message ?? `${item.id}: missing [${item.missingFields.join(', ')}]`).join('; '));
    }
    const graph = buildGraph(root, registry);
    const result = evaluate(registry, graph);

    if (options.writer === 'topology') {
      registry.topology = TOPOLOGY;
      atomicWrite(path, registry);
      emit(options, { action: 'write-topology', ok: true }, '[layer-shims] wrote topology atomically');
      return 0;
    }
    if (options.writer === 'init') {
      if (registry.baseline) throw new InputError('baseline already exists; use --shrink-baseline');
      const lock = `${path}.init.lock`;
      let lockDescriptor;
      try {
        try { lockDescriptor = openSync(lock, 'wx', 0o600); }
        catch (error) {
          if (error?.code === 'EEXIST') throw new InputError('baseline initialization is already in progress');
          throw error;
        }
        if (loadRegistry(path).baseline) throw new InputError('baseline already exists; use --shrink-baseline');
        registry.baseline = { version: 1, atoms: result.actualAtoms, sccs: graph.sccs };
        registry.topology ??= TOPOLOGY;
        atomicWrite(path, registry);
      } finally {
        if (lockDescriptor !== undefined) closeSync(lockDescriptor);
        rmSync(lock, { force: true });
      }
      emit(options, { action: 'init-baseline', atoms: result.actualAtoms.length, ok: true, sccs: graph.sccs.length },
        '[layer-shims] initialized exact baseline atomically');
      return 0;
    }
    if (options.writer === 'shrink') {
      if (!registry.baseline) throw new InputError('baseline is absent; use --init-baseline');
      const oldAtoms = new Set(registry.baseline.atoms);
      if (result.actualAtoms.some((atom) => !oldAtoms.has(atom))) throw new InputError('cannot shrink with new crossing atoms');
      if (graph.sccs.some((component) => !registry.baseline.sccs.some((old) =>
        component.every((node) => old.includes(node)) && component.length <= old.length))) {
        throw new InputError('cannot shrink with SCC growth');
      }
      registry.baseline = { version: 1, atoms: result.actualAtoms, sccs: graph.sccs };
      atomicWrite(path, registry);
      emit(options, { action: 'shrink-baseline', atoms: result.actualAtoms.length, ok: true, sccs: graph.sccs.length },
        '[layer-shims] shrank exact baseline atomically');
      return 0;
    }
    if (result.findings.length) {
      emit(options, { findings: result.findings, ok: false },
        `[layer-shims] FAIL: ${result.findings.length} violation(s)\n${result.findings.map((item) => `  ${JSON.stringify(item)}`).join('\n')}`, true);
      return 1;
    }
    emit(options, { edges: graph.edges.length, files: graph.nodes.length, ok: true },
      `[layer-shims] ✓ full graph clean (${graph.nodes.length} files, ${graph.edges.length} local edges)`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(options, { error: message, ok: false }, `[layer-shims] ERROR: ${message}`, true);
    return 2;
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
