#!/usr/bin/env node

// Trusted, bounded current-source runtime observer for two Terminal profiles.
// It never supplies DECKENT_NATIVE_MOCK or credentials.
import { spawn as spawnChild } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const adapterId = process.argv[2];
const proofOutputDirectory = process.env.DECKENT_PROOF_OUTPUT_DIR;
const entry = resolve('src/cli/entry.ts');
if (!existsSync(entry)) process.exit(41);
let ptySpawn;
let tsxLoader;
try {
  // The verifier is staged outside the observed checkout. Resolve the PTY
  // dependency from that checkout, never from an ambient HOME/CODEX_HOME.
  const requireFromObservedRoot = createRequire(resolve('package.json'));
  ({ spawn: ptySpawn } = requireFromObservedRoot('@lydell/node-pty'));
  tsxLoader = requireFromObservedRoot.resolve('tsx');
} catch { process.exit(42); }
const root = mkdtempSync(join(tmpdir(), 'deckent-terminal-host-proof-'));
mkdirSync(join(root, '.deckent'), { recursive: true });
const deckentHome = join(root, 'deckent-home');
const xdgConfigHome = join(root, 'xdg-config');
const xdgStateHome = join(root, 'xdg-state');
const xdgCacheHome = join(root, 'xdg-cache');
for (const path of [deckentHome, xdgConfigHome, xdgStateHome, xdgCacheHome]) mkdirSync(path, { recursive: true });
const baseConfig = {
  chat_provider: 'ollama',
  native_provider: 'ollama',
  native_model: 'qwen2.5-coder',
  ollama_host: 'http://127.0.0.1:11434',
  terminal: { native_agent: true },
};
const env = {
  DECKENT_HOME: deckentHome,
  XDG_CONFIG_HOME: xdgConfigHome,
  XDG_STATE_HOME: xdgStateHome,
  XDG_CACHE_HOME: xdgCacheHome,
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  TERM: 'xterm-256color',
  LANG: 'C',
  LC_ALL: 'C',
  DECKENT_CONFIG_RELOAD: '1',
  DECKENT_INK: '1',
  NO_COLOR: '1',
  TSX_TSCONFIG_PATH: resolve('tsconfig.json'),
};
const stripAnsi = value => value
  .replace(/\x1b\][^\x07]*\x07/g, '')
  .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
  .replace(/\r/g, '\n');
const NATIVE_HEALTH_LINE = /^ollama\/qwen2\.5-coder:7b · auth: unknown(?: ·|$)/mu;
const NATIVE_HEALTH_LINE_TR = /^ollama\/qwen2\.5-coder:7b · kimlik doğrulama: bilinmiyor(?: ·|$)/mu;
const NATIVE_FALLBACK_BANNER = /native engine not started|yerel motor başlatılamadı|legacy loop/u;
const MAX_PTY_OUTPUT_BYTES = 64 * 1024;
const evidence = [];

async function observe(config, exitWhen, evidenceId) {
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(config));
  let output = '';
  let outputBytes = 0;
  let exceededOutput = false;
  const pty = ptySpawn(process.execPath, ['--import', tsxLoader, entry, '--native'], {
    name: 'xterm-256color', cols: 120, rows: 40, cwd: root, env,
  });
  const exit = await new Promise(resolveExit => {
    let sentExit = false;
    const requestExit = () => {
      if (sentExit) return;
      sentExit = true;
      try { pty.write('/exit\r'); } catch { /* exited */ }
    };
    const killTimer = setTimeout(() => { try { pty.kill('SIGKILL'); } catch { /* exited */ } }, 25_000);
    pty.onData(data => {
      if (exceededOutput) return;
      const dataBytes = Buffer.byteLength(data);
      if (outputBytes + dataBytes > MAX_PTY_OUTPUT_BYTES) {
        exceededOutput = true;
        try { pty.kill('SIGKILL'); } catch { /* exited */ }
        return;
      }
      output += data;
      outputBytes += dataBytes;
      if (exitWhen(stripAnsi(output))) requestExit();
    });
    pty.onExit(event => {
      clearTimeout(killTimer);
      resolveExit(event);
    });
  });
  const observation = { plain: stripAnsi(output), exit, exceededOutput };
  evidence.push({ id: evidenceId, ...observation });
  return observation;
}

async function observeSourceConfig() {
  const program = String.raw`
    import { loadConfig, mergeConfigs } from './src/core/config.ts';
    import { writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    const root = process.argv[1];
    const path = join(root, '.deckent', 'config.json');
    writeFileSync(path, JSON.stringify({ repl_surface: { approvals: false } }));
    const partial = await loadConfig(root, { force: true });
    writeFileSync(path, JSON.stringify({ repl_surface: { enabled: false } }));
    const disabled = await loadConfig(root, { force: true });
    const mergedPartial = mergeConfigs(null, { repl_surface: { approvals: false } });
    const mergedDisabled = mergeConfigs(null, { repl_surface: { enabled: false } });
    process.exitCode = partial.repl_surface?.enabled === true
      && partial.repl_surface?.approvals === false
      && disabled.repl_surface?.enabled === false
      && disabled.repl_surface?.approvals === true
      && mergedPartial.repl_surface?.enabled === true
      && mergedPartial.repl_surface?.approvals === false
      && mergedDisabled.repl_surface?.enabled === false
      && mergedDisabled.repl_surface?.approvals === true ? 0 : 49;
  `;
  const child = spawnChild(process.execPath, [
    '--import', tsxLoader, '--input-type=module', '--eval', program, root,
  ], { cwd: process.cwd(), env, stdio: 'ignore' });
  return await new Promise(resolveExit => {
    const deadline = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* exited */ } }, 10_000);
    child.on('exit', (code, signal) => {
      clearTimeout(deadline);
      resolveExit(code === 0 && signal === null);
    });
    child.on('error', () => { clearTimeout(deadline); resolveExit(false); });
  });
}

function cleanExit(observation) {
  return !observation.exceededOutput
    && observation.exit.exitCode === 0
    && observation.exit.signal === 0;
}
async function main() {
  if (adapterId === 'deckent-terminal-native-boot-health-source-runtime-v1') {
    const observation = await observe({ ...baseConfig, language: 'en', repl_surface: { enabled: false } },
      plain => NATIVE_HEALTH_LINE.test(plain), 'native-en');
    if (!cleanExit(observation)
      || !NATIVE_HEALTH_LINE.test(observation.plain)
      || NATIVE_FALLBACK_BANNER.test(observation.plain)) return 43;
  } else if (adapterId === 'deckent-terminal-repl-surface-source-runtime-v1') {
    // `approvals` alone is the original partial-field regression: enabled must
    // still default on at the actual Ink entrypoint.
    const defaultObservation = await observe({ ...baseConfig, repl_surface: { approvals: false } },
      plain => plain.includes('[Run]'), 'repl-partial-default');
    if (!cleanExit(defaultObservation) || !defaultObservation.plain.includes('[Run]')) return 44;
    const disabledObservation = await observe({
      ...baseConfig,
      repl_surface: { enabled: false, approvals: false },
    }, plain => NATIVE_HEALTH_LINE.test(plain), 'repl-explicit-disabled');
    if (!cleanExit(disabledObservation) || disabledObservation.plain.includes('[Run]')) return 45;
    if (!await observeSourceConfig()) return 46;
  } else if (adapterId === 'deckent-terminal-native-auth-health-source-runtime-v1') {
    const english = await observe({ ...baseConfig, language: 'en', repl_surface: { enabled: false } },
      plain => NATIVE_HEALTH_LINE.test(plain), 'native-auth-en');
    const turkish = await observe({ ...baseConfig, language: 'tr', repl_surface: { enabled: false } },
      plain => NATIVE_HEALTH_LINE_TR.test(plain), 'native-auth-tr');
    if (!cleanExit(english) || !cleanExit(turkish)
      || !NATIVE_HEALTH_LINE.test(english.plain) || !NATIVE_HEALTH_LINE_TR.test(turkish.plain)
      || NATIVE_FALLBACK_BANNER.test(english.plain) || NATIVE_FALLBACK_BANNER.test(turkish.plain)) return 49;
  } else return 48;
  return 0;
}

let exitCode = 47;
try { exitCode = await main(); } catch { exitCode = 47; }
finally { try { rmSync(root, { recursive: true, force: true }); } catch { /* cleanup */ } }
if (proofOutputDirectory !== undefined) {
  const directory = resolve(proofOutputDirectory);
  if (!directory.startsWith('/tmp/')) exitCode = 47;
  else {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(join(directory, 'terminal-health-config-source-runtime.json'), `${JSON.stringify({
        adapterId, evidence, exitCode,
      }, null, 2)}\n`, { mode: 0o600 });
    } catch { exitCode = 47; }
  }
}
if (exitCode === 0) process.stdout.write('observed');
else process.exitCode = exitCode;
