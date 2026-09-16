/**
 * verify-cli-help-matrix.mjs — real compiled CLI --help consumer matrix (v4).
 * Import-safe exports for hermetic unit tests.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync, readdirSync,
} from 'node:fs';
import { dirname, join, resolve, relative, extname, delimiter as pathDelimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(__dirname, '..');
export const DEFAULT_ENTRY = join(DEFAULT_REPO_ROOT, 'dist/cli/entry.js');
export const DEFAULT_MANIFEST = join(DEFAULT_REPO_ROOT, 'docs/generated/cli-manifest.json');

export const OUTPUT_LIMIT = 256 * 1024;
export const CASE_TIMEOUT_MS = 20_000;
export const REAP_TIMEOUT_MS = 5_000;
/** Bound after SIGKILL in which a child must emit close to be called reaped. */
export const CLOSE_OBSERVATION_MS = 1_000;
/** Serial is deliberate: an unreaped child stops the matrix before a next case starts. */
export const DEFAULT_POOL = 1;

export const DEPRECATED_FORWARDING_COMMANDS = Object.freeze([
  'dashboard', 'attach', 'output', 'plan-nl', 'archive-debt', 'confirmations',
  'checkpoint', 'audit-verify', 'autonomous-mission', 'explain', 'recall', 'remember',
]);

const DIRECT_CONSUMER_MODULES = Object.freeze([
  'dist/cli/index.js',
  'dist/cli/helpers/command-contract.js',
  'dist/cli/surface-contract.js',
  'dist/cli/helpers/messages.js',
]);

const ANSI_RE = /\x1b\[[0-9;]*m/;
const UNRESOLVED_KEY_RE = /\b(?:cli(?:Contract)?\.[a-z0-9_.-]+|init\.[a-z0-9_.-]+)\b/i;

export function normalizeWs(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function parseReplacementSurface(replacement) {
  const parts = replacement.trim().split(/\s+/).filter(Boolean);
  const prefixFlags = [];
  const targetPath = [];
  for (const part of parts) {
    if (part.startsWith('--')) prefixFlags.push(part);
    else targetPath.push(part);
  }
  return { prefixFlags, targetPath };
}

/** Match catalog text against live help; a declared enum has an exact local set. */
export function descriptionPresent(expected, text) {
  const normText = normalizeWs(text);
  const normExpected = normalizeWs(expected);

  const open = expected.indexOf('(');
  const close = open >= 0 ? expected.indexOf(')', open + 1) : -1;
  if (open >= 0 && close > open) {
    const prefix = normalizeWs(expected.slice(0, open));
    const inner = expected.slice(open + 1, close);
    const tokens = inner.includes('|')
      ? inner.split('|').map((part) => part.trim()).filter(Boolean)
      : inner.split(',').map((part) => part.trim()).filter(Boolean);
    if (tokens.length > 1) {
      const expectedTokens = tokens.map((token) => normalizeWs(token));
      let start = normText.indexOf(prefix);
      while (start >= 0) {
        const enumOpen = normText.indexOf('(', start + prefix.length);
        const enumClose = enumOpen >= 0 ? normText.indexOf(')', enumOpen + 1) : -1;
        if (enumClose >= 0) {
          const actualTokens = normText.slice(enumOpen + 1, enumClose)
            .split(inner.includes('|') ? '|' : ',')
            .map((token) => normalizeWs(token))
            .filter(Boolean);
          if (actualTokens.length === expectedTokens.length
            && actualTokens.every((token) => expectedTokens.includes(token))
            && expectedTokens.every((token) => actualTokens.includes(token))) return true;
        }
        start = normText.indexOf(prefix, start + Math.max(prefix.length, 1));
      }
      return false;
    }
  }
  return normText.includes(normExpected);
}

export function optionFlagTokens(flags) {
  return flags.split(',').map((part) => part.trim()).filter(Boolean);
}

function normalizeSyntax(text) {
  return normalizeWs(text).replace(/\s*,\s*/g, ', ');
}

function helpHeadings(lang) {
  return lang === 'tr'
    ? { usage: 'Kullanım:', arguments: ['Argümanlar:'], options: ['Seçenekler:', 'Genel Seçenekler:'] }
    : { usage: 'Usage:', arguments: ['Arguments:'], options: ['Options:', 'Global Options:'] };
}

function allHelpHeadings() {
  return new Set([
    'Usage:', 'Kullanım:', 'Arguments:', 'Argümanlar:', 'Options:', 'Seçenekler:',
    'Global Options:', 'Genel Seçenekler:', 'Commands:', 'Komutlar:',
  ]);
}

function extractUsageRow(text, lang) {
  const lines = text.split(/\r?\n/);
  const heading = helpHeadings(lang).usage;
  const start = lines.findIndex((line) => line.trimStart().startsWith(heading));
  if (start < 0) return '';
  const usage = [lines[start].trim().slice(heading.length).trim()];
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.length === 0 || allHelpHeadings().has(trimmed)) break;
    usage.push(trimmed);
  }
  return normalizeSyntax(usage.join(' '));
}

function extractSectionRows(text, headings) {
  const rows = [];
  const wanted = new Set(headings);
  const knownHeadings = allHelpHeadings();
  let inSection = false;
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (knownHeadings.has(trimmed)) {
      inSection = wanted.has(trimmed);
      current = null;
      continue;
    }
    if (!inSection || trimmed.length === 0) continue;
    // Commander starts each row at exactly two spaces. Wrapped descriptions
    // are deeper-indented and must never become a new empty-syntax row.
    const row = line.match(/^ {2}(\S.*?)(?: {2,})(\S.*)$/);
    if (row) {
      current = { syntax: normalizeSyntax(row[1]), description: row[2].trim() };
      rows.push(current);
    } else if (/^ {2}\S/.test(line)) {
      // A long option syntax can occupy its own line before a wrapped
      // description; keep it as the owning row instead of silently dropping it.
      current = { syntax: normalizeSyntax(trimmed), description: '' };
      rows.push(current);
    } else if (current && /^ {3,}\S/.test(line)) {
      current.description = `${current.description} ${trimmed}`;
    }
  }
  return rows;
}

export function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

const LOCAL_IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function localModulePath(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(fromFile), specifier);
  if (existsSync(candidate)) return candidate;
  if (extname(candidate) === '' && existsSync(`${candidate}.js`)) return `${candidate}.js`;
  if (extname(candidate) === '' && existsSync(join(candidate, 'index.js'))) return join(candidate, 'index.js');
  return null;
}

/**
 * Hash the actual static ESM closure of the compiled entry.  Entry/index hashes
 * alone do not bind their separately-loaded command/helper modules.
 */
export function collectLoadedConsumerPins(repoRoot, entry) {
  const root = resolve(repoRoot);
  const queue = [resolve(entry)];
  const visited = new Set();
  const pins = {};
  while (queue.length > 0) {
    const file = queue.pop();
    const withinRoot = file !== undefined && !relative(root, file).startsWith('..');
    if (!file || !withinRoot || visited.has(file) || !existsSync(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    pins[`consumer:${relative(root, file)}`] = sha256Buffer(Buffer.from(source));
    for (const match of source.matchAll(LOCAL_IMPORT_RE)) {
      const next = localModulePath(file, match[1] ?? match[2]);
      if (next !== null) queue.push(next);
    }
  }
  return pins;
}

export function collectPins(repoRoot, entry, manifestPath, runnerPath, extra = {}) {
  const directConsumerPins = Object.fromEntries(DIRECT_CONSUMER_MODULES.map((relativePath) => {
    const absolutePath = join(repoRoot, relativePath);
    return [`directConsumer:${relativePath}`, existsSync(absolutePath) ? sha256File(absolutePath) : 'missing'];
  }));
  const pins = {
    entry: sha256File(entry),
    manifest: sha256File(manifestPath),
    runner: sha256File(runnerPath),
    buildIdentity: sha256File(join(repoRoot, 'dist/build-identity.json')),
    ...directConsumerPins,
    ...collectLoadedConsumerPins(repoRoot, entry),
    ...extra,
  };
  return pins;
}

export function assertPinsStable(before, after) {
  const errors = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) {
      errors.push(`pin drift ${key}: ${before[key] ?? '<missing>'} -> ${after[key] ?? '<missing>'}`);
    }
  }
  return errors.length ? errors.join('; ') : null;
}

export function loadInventory(manifestPath = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const commands = manifest.commands.filter((c) => !c.hidden);
  const byPath = new Map(commands.map((c) => [c.path, c]));
  return { manifest, commands, byPath };
}

export function classifyManifestPath(path) {
  if (DEPRECATED_FORWARDING_COMMANDS.includes(path)) return 'deprecated-top';
  const top = path.split(' ')[0];
  if (DEPRECATED_FORWARDING_COMMANDS.includes(top) && path.includes(' ')) return 'deprecated-virtual';
  return 'normal';
}

export async function loadLiveInventory(repoRoot) {
  const indexUrl = pathToFileURL(join(repoRoot, 'dist/cli/index.js')).href;
  const contractUrl = pathToFileURL(join(repoRoot, 'dist/cli/helpers/command-contract.js')).href;
  const surfaceUrl = pathToFileURL(join(repoRoot, 'dist/cli/surface-contract.js')).href;
  const { buildProgram } = await import(indexUrl);
  const { walkCommanderTree } = await import(contractUrl);
  const { DEPRECATED_FORWARDING } = await import(surfaceUrl);
  const program = buildProgram();
  const nodes = walkCommanderTree(program);
  const publicNodes = nodes.filter((node) => node.visible);
  const livePaths = publicNodes.map((node) => node.path);
  const liveSet = new Set(livePaths);
  return { program, nodes, publicNodes, livePaths, liveSet, deprecatedSurfaces: DEPRECATED_FORWARDING };
}

export function auditInventory(manifestCommands, liveSet) {
  const issues = [];
  const manifestPaths = manifestCommands.map((cmd) => cmd.path);
  const manifestSet = new Set(manifestPaths);
  const dupes = manifestPaths.filter((path, index) => manifestPaths.indexOf(path) !== index);
  if (dupes.length) issues.push(`manifest duplicate paths: ${[...new Set(dupes)].join(', ')}`);

  for (const path of manifestPaths) {
    const kind = classifyManifestPath(path);
    if (kind === 'deprecated-virtual') {
      if (liveSet.has(path)) issues.push(`virtual deprecated child unexpectedly live: ${path}`);
      continue;
    }
    if (kind === 'deprecated-top') {
      if (!liveSet.has(path)) issues.push(`deprecated top-level missing from live tree: ${path}`);
      continue;
    }
    if (!liveSet.has(path)) issues.push(`manifest path missing from live tree: ${path}`);
  }

  for (const livePath of liveSet) {
    if (!manifestSet.has(livePath) && !livePath.startsWith('help')) {
      issues.push(`live path missing from manifest: ${livePath}`);
    }
  }
  return issues;
}

export function usageHeading(lang) {
  return lang === 'tr' ? 'Kullanım:' : 'Usage:';
}

export function wrongUsageHeading(lang) {
  return lang === 'tr' ? 'Usage:' : 'Kullanım:';
}

export function assertOptionFlagsExact(cmd, text, errors) {
  const rows = extractSectionRows(text, helpHeadings(cmd.__lang ?? 'en').options);
  for (const opt of cmd.options ?? []) {
    if (opt.hidden) continue;
    const row = rows.find((candidate) => candidate.syntax === normalizeSyntax(opt.flags));
    if (!row) {
      errors.push(`missing exact option syntax ${opt.flags}`);
      continue;
    }
    const od = opt.description?.[cmd.__lang ?? 'en'];
    if (od && !descriptionPresent(od, row.description)) {
      errors.push(`missing option description ${opt.flags}`);
    }
  }
}

export function assertArgumentsExact(cmd, text, errors) {
  const lang = cmd.__lang ?? 'en';
  const usage = extractUsageRow(text, lang);
  const rows = extractSectionRows(text, helpHeadings(lang).arguments);
  for (const arg of cmd.arguments ?? []) {
    const token = arg.token ?? `<${arg.name}>`;
    const usageToken = normalizeSyntax(token);
    if (!usage.split(' ').includes(usageToken)) {
      errors.push(`missing exact usage argument ${token}`);
    }
    const displayName = normalizeSyntax(arg.name);
    const row = rows.find((candidate) => candidate.syntax === displayName);
    if (!row) {
      errors.push(`missing exact argument display name ${arg.name}`);
      continue;
    }
    const ad = arg.description?.[cmd.__lang ?? 'en'];
    if (ad && !descriptionPresent(ad, row.description)) {
      errors.push(`missing argument description ${token}`);
    }
  }
}

/** Semantic assertion against manifest row + live help stdout. */
export function assertHelpOutput(cmd, lang, stdout, opts = {}) {
  const errors = [];
  const allowAnsi = opts.allowAnsi === true;
  const text = stdout ?? '';
  const localizedCmd = { ...cmd, __lang: lang };

  if (!allowAnsi && ANSI_RE.test(text)) errors.push('unexpected ANSI in pipe help');

  const head = text.slice(0, 1200);
  const want = usageHeading(lang);
  const wrong = wrongUsageHeading(lang);
  if (!head.includes(want)) errors.push(`missing localized heading ${want}`);
  if (head.includes(wrong) && !head.includes(want)) errors.push(`wrong locale heading ${wrong}`);

  const desc = cmd.description?.[lang];
  if (desc && !descriptionPresent(desc, text)) {
    errors.push(`missing command description for ${cmd.path}`);
  }

  assertOptionFlagsExact(localizedCmd, text, errors);
  assertArgumentsExact(localizedCmd, text, errors);

  if (UNRESOLVED_KEY_RE.test(text)) errors.push('unresolved catalog key leaked to help output');

  return errors.length ? errors.join('; ') : null;
}

export function assertDeprecatedTopHelp(surface, lang, stdout, inventory, getMessage) {
  const errors = [];
  const text = stdout ?? '';
  const want = usageHeading(lang);
  if (!text.includes(want)) errors.push(`missing localized heading ${want}`);

  const warning = getMessage(surface.warningKey, lang);
  if (!descriptionPresent(warning, text)) errors.push('missing deprecation warning');

  const { targetPath } = parseReplacementSurface(surface.replacement);
  const replPath = targetPath.join(' ');
  const replCmd = inventory.byPath.get(replPath);
  if (!replCmd) {
    if (!text.includes(`deckent ${replPath}`)) {
      errors.push(`missing replacement usage for ${replPath}`);
    }
  } else {
    const replDesc = replCmd.description?.[lang];
    if (replDesc && !descriptionPresent(replDesc, text)) {
      errors.push(`missing replacement description for ${replPath}`);
    }
    assertOptionFlagsExact({ ...replCmd, __lang: lang }, text, errors);
  }

  const contract = inventory.byPath.get(surface.command);
  if (contract && replCmd) {
    for (const legacyOpt of contract.options ?? []) {
      if (legacyOpt.hidden) continue;
      const primary = legacyOpt.flags.split(',')[0].trim();
      const replHasSame = replCmd.options?.some((opt) => opt.flags.includes(primary));
      if (!replHasSame && text.includes(primary)) {
        errors.push(`legacy-only option leaked on deprecated help: ${primary}`);
      }
    }
  }

  if (UNRESOLVED_KEY_RE.test(text)) errors.push('unresolved catalog key leaked to help output');
  return errors.length ? errors.join('; ') : null;
}

export function assertRootHelp(lang, stdout, opts = {}) {
  const errors = [];
  const text = stdout ?? '';
  if (!opts.allowAnsi && ANSI_RE.test(text)) errors.push('unexpected ANSI');
  const want = usageHeading(lang);
  if (!text.includes(want)) errors.push(`missing ${want}`);
  if (lang === 'en' && !text.includes('Usage: deckent [options]')) {
    errors.push('missing English root usage line');
  }
  if (lang === 'tr' && !text.includes('Kullanım: deckent [seçenekler]')) {
    errors.push('missing Turkish root usage line');
  }
  if (lang === 'en' && !text.includes('start a native chat session')) {
    errors.push('missing English root prompt help');
  }
  if (lang === 'tr' && !text.includes('yerel bir sohbet oturumu başlat')) {
    errors.push('missing Turkish root prompt help');
  }
  return errors.length ? errors.join('; ') : null;
}

export function buildCaseList(inventory, { includeEdges = true, livePaths = [] } = {}) {
  const cases = [];
  for (const lang of ['en', 'tr']) {
    cases.push({
      id: `root:${lang}`,
      kind: 'root',
      pathArgs: [],
      lang,
      env: { DECKENT_LANGUAGE: lang },
    });
  }
  const manifestPaths = new Set(inventory.commands.map((cmd) => cmd.path));
  const paths = [...new Set([...manifestPaths, ...livePaths])].sort();
  for (const path of paths) {
    const pathKind = classifyManifestPath(path);
    const inManifest = manifestPaths.has(path);
    const inLive = livePaths.includes(path);
    const kind = pathKind === 'deprecated-virtual'
      ? 'deprecated-virtual'
      : !inLive ? 'canonical-missing'
        : !inManifest ? 'live-unmanifested'
          : pathKind === 'deprecated-top' ? 'deprecated-top' : 'command';
    for (const lang of ['en', 'tr']) {
      cases.push({
        id: `${path}:${lang}`,
        kind,
        pathArgs: path.split(' '),
        lang,
        manifestPath: inManifest ? path : undefined,
        env: { DECKENT_LANGUAGE: lang },
      });
    }
  }
  if (includeEdges) {
    cases.push(
      {
        id: 'edge:status:tr:DECKENT_LANG',
        kind: 'edge',
        pathArgs: ['status'],
        lang: 'tr',
        manifestPath: 'status',
        env: { DECKENT_LANG: 'tr' },
      },
      {
        id: 'edge:init:tr:c-locale',
        kind: 'edge',
        pathArgs: ['init'],
        lang: 'tr',
        manifestPath: 'init',
        env: { DECKENT_LANGUAGE: 'tr', LANG: 'C' },
      },
      {
        id: 'edge:plan:en:nocolor-dumb',
        kind: 'edge',
        pathArgs: ['plan'],
        lang: 'en',
        manifestPath: 'plan',
        env: { DECKENT_LANGUAGE: 'en', NO_COLOR: '1', TERM: 'dumb' },
      },
      {
        id: 'edge:status:en:config-tr-env-en',
        kind: 'edge',
        pathArgs: ['status'],
        lang: 'en',
        manifestPath: 'status',
        env: { DECKENT_LANGUAGE: 'en', DECKENT_LANG: 'tr' },
        projectConfig: { language: 'tr' },
        expectedLanguageSource: 'DECKENT_LANGUAGE',
      },
      {
        id: 'edge:doctor:en:DECKENT_HOME',
        kind: 'edge',
        pathArgs: ['doctor'],
        lang: 'en',
        manifestPath: 'doctor',
        env: { DECKENT_LANGUAGE: 'en' },
        deckentHome: true,
      },
    );
  }
  return cases;
}

function buildPathEnv(extra = {}) {
  const nodeDir = dirname(process.execPath);
  const parts = [nodeDir, '/usr/local/bin', '/usr/bin', '/bin'];
  const seen = new Set();
  const pathValue = parts.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  }).join(pathDelimiter);
  return { PATH: pathValue, ...extra };
}

function appendBoundedChunk(state, chunk, stream) {
  const combinedLimit = OUTPUT_LIMIT;
  const roomCombined = combinedLimit - state.combinedBytes;
  if (roomCombined <= 0) {
    state[`${stream}Dropped`] += chunk.length;
    state.combinedDropped += chunk.length;
    return true;
  }
  const take = Math.min(chunk.length, roomCombined, combinedLimit - state[stream].length);
  if (take > 0) {
    state[stream] = Buffer.concat([state[stream], chunk.subarray(0, take)]);
    state.combinedBytes += take;
  }
  const dropped = chunk.length - take;
  if (dropped > 0) {
    state[`${stream}Dropped`] += dropped;
    state.combinedDropped += dropped;
  }
  return dropped > 0;
}

function prepareCaseFixture(caseDef, privateHome) {
  if (!caseDef.projectConfig) return;
  const deckentDir = join(privateHome, '.deckent');
  mkdirSync(deckentDir, { recursive: true });
  writeFileSync(join(deckentDir, 'config.json'), JSON.stringify(caseDef.projectConfig));
}

export function runHelpChild(entry, caseDef, privateHome, options = {}) {
  const args = [...caseDef.pathArgs, '--help'];
  prepareCaseFixture(caseDef, privateHome);
  const home = caseDef.deckentHome ? join(privateHome, 'deckent-home') : privateHome;
  if (caseDef.deckentHome) mkdirSync(home, { recursive: true });

  const env = buildPathEnv({
    HOME: privateHome,
    DECKENT_HOME: caseDef.deckentHome ? home : join(privateHome, '.deckent'),
    USER: 'help-matrix',
    XDG_CONFIG_HOME: join(privateHome, '.config'),
    XDG_CACHE_HOME: join(privateHome, '.cache'),
    XDG_DATA_HOME: join(privateHome, '.local', 'share'),
    LANG: caseDef.env.LANG ?? (caseDef.lang === 'tr' ? 'tr_TR.UTF-8' : 'en_US.UTF-8'),
    TERM: caseDef.env.TERM ?? 'dumb',
    ...caseDef.env,
  });

  const timeoutMs = options.timeoutMs ?? CASE_TIMEOUT_MS;
  const reapMs = options.reapMs ?? REAP_TIMEOUT_MS;
  const closeObservationMs = options.closeObservationMs ?? CLOSE_OBSERVATION_MS;

  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: privateHome,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const state = {
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      stdoutDropped: 0,
      stderrDropped: 0,
      combinedBytes: 0,
      combinedDropped: 0,
    };
    let terminationReason = null;
    let sigkillSent = false;
    let closeObserved = false;
    let settled = false;
    let timer;
    let reapTimer;
    let closeTimer;
    let unknownReleased = false;
    let unknownPayload = null;

    // We cannot prove a descendant is dead merely because SIGKILL was sent to
    // its parent. After the UNKNOWN row is persisted, release only this
    // runner's pipe/listener handles; never guess or kill an unknown descendant.
    const releaseUnknownObservationHandles = () => {
      if (unknownReleased) return;
      unknownReleased = true;
      child.stdout?.removeAllListeners('data');
      child.stderr?.removeAllListeners('data');
      child.removeAllListeners('close');
      child.removeAllListeners('error');
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      if (unknownPayload) unknownPayload.observationHandlesReleased = true;
    };

    const resultPayload = (exitCode, signal, reapState) => {
      const payload = {
        exitCode,
        signal,
        durationMs: Date.now() - started,
        stdout: state.stdout,
        stderr: state.stderr,
        stdoutSha256: sha256Buffer(state.stdout),
        stderrSha256: sha256Buffer(state.stderr),
        stdoutTruncated: state.combinedBytes >= OUTPUT_LIMIT || state.combinedDropped > 0,
        stderrTruncated: state.combinedBytes >= OUTPUT_LIMIT || state.combinedDropped > 0,
        stdoutDroppedBytes: state.stdoutDropped,
        stderrDroppedBytes: state.stderrDropped,
        combinedDroppedBytes: state.combinedDropped,
        timedOut: terminationReason === 'timeout',
        overflowed: terminationReason === 'overflow',
        terminationReason,
        reapState,
        closeObserved,
        pid: child.pid,
        observationHandlesReleased: false,
      };
      if (reapState === 'unreaped') {
        unknownPayload = payload;
        payload.releaseUnknownObservationHandles = releaseUnknownObservationHandles;
      }
      return payload;
    };

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(reapTimer);
      clearTimeout(closeTimer);
      resolvePromise(payload);
    };

    const beginTermination = (reason) => {
      if (terminationReason !== null || settled) return;
      terminationReason = reason;
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      reapTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        sigkillSent = true;
        closeTimer = setTimeout(() => {
          // SIGKILL delivery is not a reap. Preserve the fixture and stop the
          // matrix if close never arrives within this explicit observation bound.
          finish(resultPayload(child.exitCode, child.signalCode, 'unreaped'));
        }, closeObservationMs);
      }, reapMs);
    };

    child.stdout.on('data', (c) => {
      if (appendBoundedChunk(state, c, 'stdout')) beginTermination('overflow');
    });
    child.stderr.on('data', (c) => {
      if (appendBoundedChunk(state, c, 'stderr')) beginTermination('overflow');
    });

    timer = setTimeout(() => beginTermination('timeout'), timeoutMs);

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer); clearTimeout(reapTimer); clearTimeout(closeTimer);
        reject(err);
      }
    });
    child.on('close', (code, signal) => {
      closeObserved = true;
      const reapState = sigkillSent ? 'reaped' : terminationReason !== null ? 'term-exited' : 'not-needed';
      finish(resultPayload(code, signal, reapState));
    });
  });
}

function snapshotTree(dir) {
  if (!existsSync(dir)) return [];
  const rows = [];
  const walk = (current, prefix = '') => {
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${name.name}` : name.name;
      if (name.isDirectory()) walk(join(current, name.name), rel);
      else rows.push(rel);
    }
  };
  walk(dir);
  return rows.sort();
}

export async function evaluateCase(caseDef, inventory, entry, privateHome, ctx = {}) {
  if (caseDef.kind === 'deprecated-virtual') {
    return {
      ...caseDef,
      status: 'HOLD',
      holdReason: 'virtual deprecated child path not registered in live catch-all tree',
    };
  }
  if (caseDef.kind === 'canonical-missing') {
    return {
      ...caseDef,
      status: 'HOLD',
      holdReason: 'canonical manifest path is not registered in the live public Commander tree',
    };
  }

  prepareCaseFixture(caseDef, privateHome);
  const treeBefore = snapshotTree(privateHome);
  let result;
  try {
    result = await runHelpChild(entry, caseDef, privateHome, ctx.runOptions);
  } catch (error) {
    return {
      ...caseDef,
      status: 'FAIL',
      assertionError: error instanceof Error ? error.message : String(error),
    };
  }

  const treeAfter = snapshotTree(privateHome);
  const treeDiff = treeAfter.filter((row) => !treeBefore.includes(row));

  const stdoutText = result.stdout?.toString('utf8') ?? '';

  if (result.reapState === 'unreaped') {
    return {
      ...caseDef,
      status: 'HOLD',
      holdReason: 'child did not emit close after SIGKILL within the bounded observation window; fixture retained and matrix must stop',
      ...serializeResult(result),
      treeDiff,
      fixtureRetained: true,
    };
  }

  if (result.error) {
    return { ...caseDef, status: 'FAIL', assertionError: String(result.error), ...serializeResult(result) };
  }
  if (result.exitCode !== 0) {
    return {
      ...caseDef,
      status: 'FAIL',
      assertionError: `exit ${result.exitCode} signal=${result.signal ?? 'null'}`,
      ...serializeResult(result),
      treeDiff,
    };
  }
  if (result.timedOut) {
    return {
      ...caseDef,
      status: 'FAIL',
      assertionError: result.reapState === 'reaped' ? 'case timeout exceeded (reaped)' : 'case timeout exceeded',
      ...serializeResult(result),
      treeDiff,
    };
  }
  if (result.combinedDroppedBytes > 0 || result.stdoutTruncated || result.stderrTruncated) {
    return {
      ...caseDef,
      status: 'FAIL',
      assertionError: 'combined stream byte cap overflow',
      ...serializeResult(result),
      treeDiff,
    };
  }
  if (result.timedOut && result.exitCode === 0) {
    return {
      ...caseDef,
      status: 'FAIL',
      assertionError: 'timeout produced exit 0',
      ...serializeResult(result),
      treeDiff,
    };
  }
  if (!stdoutText.trim()) {
    return {
      ...caseDef,
      status: 'FAIL',
      assertionError: 'empty stdout',
      ...serializeResult(result),
      treeDiff,
    };
  }

  let assertionError = null;
  if (caseDef.kind === 'root') {
    assertionError = assertRootHelp(caseDef.lang, stdoutText);
  } else if (caseDef.kind === 'deprecated-top') {
    const surface = ctx.deprecatedByCommand?.get(caseDef.pathArgs[0]);
    if (!surface) assertionError = `missing deprecated surface ${caseDef.pathArgs[0]}`;
    else assertionError = assertDeprecatedTopHelp(surface, caseDef.lang, stdoutText, inventory, ctx.getMessage);
  } else if (caseDef.kind === 'live-unmanifested') {
    return {
      ...caseDef,
      status: 'HOLD',
      holdReason: 'live public Commander path has no canonical manifest contract',
      ...serializeResult(result),
      treeDiff,
    };
  } else {
    const cmd = inventory.byPath.get(caseDef.manifestPath);
    if (!cmd) assertionError = `manifest missing ${caseDef.manifestPath}`;
    else assertionError = assertHelpOutput(cmd, caseDef.lang, stdoutText);
  }

  return {
    ...caseDef,
    status: assertionError ? 'FAIL' : 'PASS',
    assertionError,
    ...serializeResult(result),
    treeDiff,
  };
}

function serializeResult(result) {
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    stdoutSha256: result.stdoutSha256,
    stderrSha256: result.stderrSha256,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
    stdoutDroppedBytes: result.stdoutDroppedBytes,
    stderrDroppedBytes: result.stderrDroppedBytes,
    combinedDroppedBytes: result.combinedDroppedBytes,
    timedOut: result.timedOut,
    overflowed: result.overflowed,
    terminationReason: result.terminationReason,
    reapState: result.reapState,
    closeObserved: result.closeObserved,
    pid: result.pid,
    observationHandlesReleased: result.observationHandlesReleased,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function runMatrix(options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const entry = options.entry ?? join(repoRoot, 'dist/cli/entry.js');
  const manifestPath = options.manifestPath ?? join(repoRoot, 'docs/generated/cli-manifest.json');
  const outDir = options.outDir ?? join(repoRoot, 'proof/cursor-cli-help-matrix-v4/results');
  const includeEdges = options.includeEdges !== false;

  if (!existsSync(entry)) throw new Error(`E_ENTRY_MISSING:${entry}`);

  // Snapshot the executable closure before importing the live Commander tree:
  // otherwise an import cache can combine inventory A with a later pin B.
  const runnerPath = options.runnerPath ?? fileURLToPath(import.meta.url);
  const pinsBefore = collectPins(repoRoot, entry, manifestPath, runnerPath);

  const inventory = loadInventory(manifestPath);
  const live = await loadLiveInventory(repoRoot);
  const inventoryAudit = auditInventory(inventory.commands, live.liveSet);

  const messagesUrl = pathToFileURL(join(repoRoot, 'dist/cli/helpers/messages.js')).href;
  const { getMessage } = await import(messagesUrl);
  const deprecatedByCommand = new Map(live.deprecatedSurfaces.map((surface) => [surface.command, surface]));

  const cases = buildCaseList(inventory, { includeEdges, livePaths: live.livePaths });
  mkdirSync(outDir, { recursive: true });
  const privateHomeRoot = mkdtempSync(join(tmpdir(), 'deckent-help-matrix-'));

  let retainedFixtureRoot = null;
  try {
    const results = [];
    // Keep the default serial: once child custody is UNKNOWN, do not launch a
    // later case against the same proof host.
    for (const caseDef of cases) {
      const caseHome = mkdtempSync(join(privateHomeRoot, 'case-'));
      const row = await evaluateCase(caseDef, inventory, entry, caseHome, {
        getMessage,
        deprecatedByCommand,
        runOptions: options.runOptions,
      });
      const base = caseDef.id.replace(/[:/]/g, '_');
      const payload = {
        ...row,
        stdoutPreview: row.stdout ? row.stdout.toString('utf8').slice(0, 2000) : undefined,
        stderrPreview: row.stderr ? row.stderr.toString('utf8').slice(0, 500) : undefined,
      };
      delete payload.stdout;
      delete payload.stderr;
      writeFileSync(join(outDir, `${base}.json`), JSON.stringify(payload, null, 2));
      if (row.stdout) writeFileSync(join(outDir, `${base}.stdout`), row.stdout);
      if (row.stderr) writeFileSync(join(outDir, `${base}.stderr`), row.stderr);
      results.push(row);
      if (row.fixtureRetained === true) {
        // The UNKNOWN row and raw bytes are durable before releasing the
        // runner's own observers. No descendant PID is treated as ours.
        row.releaseUnknownObservationHandles?.();
        retainedFixtureRoot = privateHomeRoot;
        break;
      }
      rmSync(caseHome, { recursive: true, force: true });
    }

    const pinsAfter = collectPins(repoRoot, entry, manifestPath, runnerPath);
    const pinDrift = assertPinsStable(pinsBefore, pinsAfter);

    const manifest = {
      schema: 'cursor-cli-help-matrix-v4',
      generatedAt: new Date().toISOString(),
      nodeExecutable: process.execPath,
      nodeVersion: process.version,
      entry,
      pinsBefore,
      pinsAfter,
      pinDrift,
      inventoryAudit,
      livePathCount: live.livePaths.length,
      plannedCaseCount: cases.length,
      caseCount: results.length,
      passCount: results.filter((r) => r.status === 'PASS').length,
      failCount: results.filter((r) => r.status === 'FAIL').length,
      holdCount: results.filter((r) => r.status === 'HOLD').length,
      publicCommandCount: inventory.commands.length,
      retainedFixtureRoot,
      results: results.map(({ stdout, stderr, ...rest }) => rest),
    };

    const manifestPathOut = options.manifestOut ?? join(repoRoot, 'proof/cursor-cli-help-matrix-v4/manifest.json');
    mkdirSync(dirname(manifestPathOut), { recursive: true });
    writeFileSync(manifestPathOut, JSON.stringify(manifest, null, 2));
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    return {
      manifest,
      results,
      failed: manifest.failCount > 0 || pinDrift !== null || retainedFixtureRoot !== null,
      pinDrift,
      inventoryAudit,
    };
  } finally {
    if (retainedFixtureRoot === null) rmSync(privateHomeRoot, { recursive: true, force: true });
  }
}

/** Negative self-test for assertion helpers (not product proof). */
export function runSelfTest(inventory) {
  const cmd = inventory.byPath.get('status') ?? inventory.commands[0];
  const failures = [];

  const checks = [
    {
      label: 'reject wrong locale heading',
      fn: () => assertHelpOutput(cmd, 'tr', 'Usage: deckent status\n' + cmd.description.en),
      wantFail: true,
    },
    {
      label: 'reject missing flag',
      fn: () => assertHelpOutput(cmd, 'en', `Usage: x\n${cmd.description.en}`),
      wantFail: true,
    },
    {
      label: 'accept minimal valid EN',
      fn: () => {
        const argumentTokens = (cmd.arguments ?? []).map((a) => a.token ?? `<${a.name}>`).join(' ');
        let out = `Usage: deckent ${cmd.path}${argumentTokens ? ` ${argumentTokens}` : ''}\n${cmd.description.en}\n`;
        if ((cmd.arguments ?? []).length > 0) {
          out += '\nArguments:\n';
          for (const a of cmd.arguments ?? []) out += `  ${a.name}  ${a.description?.en ?? ''}\n`;
        }
        out += '\nOptions:\n';
        for (const o of cmd.options ?? []) out += `  ${o.flags}  ${o.description.en}\n`;
        return assertHelpOutput(cmd, 'en', out);
      },
      wantFail: false,
    },
  ];

  for (const check of checks) {
    const err = check.fn();
    const didFail = err !== null;
    if (didFail !== check.wantFail) failures.push(`${check.label}: expected fail=${check.wantFail} got ${err ?? 'pass'}`);
  }
  return failures;
}

async function main() {
  const { manifest, failed } = await runMatrix();
  process.stdout.write(`help-matrix: ${manifest.passCount}/${manifest.caseCount} PASS (${manifest.holdCount} HOLD)\n`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(String(error) + '\n');
    process.exit(1);
  });
}
