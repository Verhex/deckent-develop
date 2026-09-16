// PTY proof-of-function harness for Terminal readability (TERMINAL-READABILITY-001/002).
// Drives `deckent --native` end-to-end in FOUR host environments — real Ink, real
// palette, real markdown renderer, only the LLM mocked via DECKENT_NATIVE_MOCK — and
// measures the raw byte stream against the readability contract:
//   vscode       TERM_PROGRAM=vscode COLORTERM=truecolor, no COLORFGBG → host-theme-mapped
//                16-color only (no truecolor/256 leak), focus row inverse, code/link role
//                94 painted, OSC 8 hyperlinks (host proven), never SGR dim
//   dark-known   COLORFGBG=15;0 COLORTERM=truecolor → NOVA truecolor tokens admitted, never dim
//   nocolor      NO_COLOR=1 → zero SGR, zero OSC 8, reply text intact
//   multiplexer  TMUX set → no OSC 8 (passthrough unproven), no truecolor, never dim
// Pattern: scripts/ink-pty-picker-verify.mjs (same PTY mechanics, same skip-safe guards).
// Skip-safe: exits 0 with SKIP when dist/ or node-pty are missing.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ENTRY = resolve('dist/cli/entry.js');
if (!existsSync(ENTRY)) {
  console.log('SKIP: dist/cli/entry.js not found — run npm run build:all first');
  process.exit(0);
}

let ptySpawn;
try { ({ spawn: ptySpawn } = await import('@lydell/node-pty')); }
catch { console.log('SKIP: @lydell/node-pty not available'); process.exit(0); }

const stripAnsi = (s) =>
  s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n');
const count = (s, re) => (s.match(re) ?? []).length;

// The mock reply exercises inline code, a labeled https link, a path:line:col
// reference and a fenced code block — every carrier the contract covers.
const REPLY = 'Use `npm test` then read [Docs](https://example.com/docs) at src/cli/repl/app.tsx:12:3\n\n```ts\nconst x = 1; // note\n```\n';
const mockScript = JSON.stringify([[{ type: 'text-delta', text: REPLY }, { type: 'done' }]]);

const HOST_ENV_KEYS = ['COLORFGBG', 'NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'TERM_PROGRAM', 'TMUX', 'STY', 'WT_SESSION', 'VTE_VERSION', 'KITTY_WINDOW_ID', 'KONSOLE_VERSION', 'CURSOR_TRACE_ID', 'CURSOR_SESSION'];

const VARIANTS = [
  { id: 'vscode', env: { TERM_PROGRAM: 'vscode', COLORTERM: 'truecolor' } },
  { id: 'dark-known', env: { COLORTERM: 'truecolor', COLORFGBG: '15;0' } },
  { id: 'nocolor', env: { NO_COLOR: '1' } },
  { id: 'multiplexer', env: { TMUX: '/tmp/tmux-verify/default,1,0', TERM_PROGRAM: 'tmux', COLORTERM: 'truecolor' } },
];

// Steps (ms after spawn): /model⏎ ↓ Esc (picker focus row) · `/` ⌫ (slash menu) · hello⏎ (reply) · Ctrl-C ×2
const STEPS = [
  { send: '/model\r', afterMs: 6000 },
  { send: '\x1b[B', afterMs: 7500 },
  { send: '\x1b', afterMs: 8300 },
  { send: '/', afterMs: 9000 },
  { send: '\x7f', afterMs: 10000 },
  { send: 'hello\r', afterMs: 10800 },
  { send: '\x03', afterMs: 14500 },
  { send: '\x03', afterMs: 15200 },
];
const DEADLINE = 15200 + 2500;

async function runVariant(variant) {
  const scenarioCwd = mkdtempSync(join(tmpdir(), `pty-readability-${variant.id}-`));
  const env = {
    ...process.env,
    HOME: scenarioCwd,
    DECKENT_INK: '1',
    DECKENT_NATIVE_AGENT: '1',
    DECKENT_NATIVE_MOCK: mockScript,
    // the mock adapter reports this model id; the input-context authority resolves it through the registry
    DECKENT_NATIVE_MODEL: 'claude-opus-5',
    TERM: 'xterm-256color',
  };
  delete env.ANTHROPIC_API_KEY;
  delete env.DECKENT_CLAUDE_API_KEY;
  for (const k of HOST_ENV_KEYS) delete env[k];
  Object.assign(env, variant.env);

  const p = ptySpawn('node', [ENTRY, '--native'], { name: 'xterm-256color', cols: 100, rows: 40, cwd: scenarioCwd, env });
  let out = '';
  let exited = false;
  p.onData((d) => { out += d; });
  p.onExit(() => { exited = true; });
  STEPS.forEach(({ send, afterMs }) => setTimeout(() => { try { p.write(send); } catch { /* exited */ } }, afterMs));
  await new Promise((done) => setTimeout(() => { if (!exited) { try { p.kill(); } catch { /* dead */ } } done(); }, DEADLINE));
  try { rmSync(scenarioCwd, { recursive: true, force: true }); } catch { /* best-effort */ }

  const plain = stripAnsi(out);
  const m = {
    truecolor: count(out, /\x1b\[[0-9;]*38;2;/g),
    ansi256: count(out, /\x1b\[[0-9;]*38;5;/g),
    dim: count(out, /\x1b\[(?:\d+;)*2m/g),
    inverse: count(out, /\x1b\[(?:\d+;)*7m/g),
    blueBright: count(out, /\x1b\[(?:\d+;)*94m/g),
    named: count(out, /\x1b\[(?:\d+;)*(?:3[0-7]|9[0-7])m/g),
    anySgr: count(out, /\x1b\[[0-9;]*m/g),
    osc8: count(out, /\x1b\]8;;https:\/\/example\.com\/docs\x07/g),
  };
  const text = plain.includes('npm test') && plain.includes('Docs') && plain.includes('app.tsx:12:3') && plain.includes('const x');
  const failures = [];
  if (!text) failures.push('reply text (code / link label / path:line:col / code block) not in scrollback');
  if (m.dim > 0) failures.push(`SGR dim emitted ${m.dim}x`);
  switch (variant.id) {
    case 'vscode':
      if (m.truecolor > 0 || m.ansi256 > 0) failures.push(`truecolor/256 leaked without a known-dark background (${m.truecolor}/${m.ansi256})`);
      if (m.named === 0) failures.push('no host-theme-mapped named color');
      if (m.inverse === 0) failures.push('focus row never painted inverse');
      if (m.blueBright === 0) failures.push('code/link role (94) never painted');
      if (m.osc8 === 0) failures.push('OSC 8 hyperlink absent on a proven host');
      break;
    case 'dark-known':
      if (m.truecolor === 0) failures.push('known-dark background: truecolor tokens expected');
      break;
    case 'nocolor':
      if (m.anySgr > 0) failures.push(`NO_COLOR: ${m.anySgr} SGR sequences emitted`);
      if (m.osc8 > 0) failures.push('NO_COLOR: OSC 8 emitted');
      break;
    case 'multiplexer':
      if (m.osc8 > 0) failures.push('OSC 8 emitted under a multiplexer (passthrough unproven)');
      if (m.truecolor > 0) failures.push('truecolor leaked under a multiplexer without a known-dark background');
      if (!plain.includes('https://example.com/docs')) failures.push('URL text not visible when OSC 8 is off');
      break;
  }
  return { id: variant.id, m, failures, tail: plain.split('\n').filter((l) => l.trim()).slice(-12) };
}

const results = [];
for (const v of VARIANTS) results.push(await runVariant(v));

const failed = results.filter((r) => r.failures.length > 0);
for (const r of results) console.log(`${r.failures.length === 0 ? 'ok  ' : 'FAIL'} ${r.id.padEnd(12)} ${JSON.stringify(r.m)}`);
if (failed.length === 0) {
  console.log('PASS: Terminal readability real-binary round-trip (vscode · dark-known · nocolor · multiplexer)');
  process.exit(0);
}
console.log('FAIL: Terminal readability real-binary round-trip');
for (const r of failed) {
  r.failures.forEach((f) => console.log(`  [${r.id}] ${f}`));
  console.log(`  --- ${r.id} scrollback (last 12 lines) ---`);
  r.tail.forEach((l) => console.log(`  ${l}`));
}
process.exit(1);
