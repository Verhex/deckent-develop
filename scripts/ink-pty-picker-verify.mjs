// PTY proof-of-function harness for the Terminal value picker (TERMINAL-PICKER-001…005).
// Drives `deckent --native` end-to-end: real Ink + real picker + real apply seams, with ONLY
// the LLM mocked via DECKENT_NATIVE_MOCK (the picker never calls the provider). Pattern:
// scripts/ink-pty-native-verify.mjs (same PTY mechanics, same skip-safe guards).
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

// ─── Scenario ────────────────────────────────────────────────────────────────
// A fresh tmp project (no config → English, Ask posture). The mock provider is
// never asked anything: every step is a picker interaction.
const scenarioCwd = mkdtempSync(join(tmpdir(), 'pty-picker-verify-'));
const mockScript = JSON.stringify([[{ type: 'text-delta', text: 'unused' }, { type: 'done' }]]);

const env = {
  ...process.env,
  HOME: scenarioCwd,
  DECKENT_INK: '1',
  DECKENT_NATIVE_AGENT: '1',
  DECKENT_NATIVE_MOCK: mockScript,
  TERM: 'xterm-256color',
};
delete env.ANTHROPIC_API_KEY;
delete env.DECKENT_CLAUDE_API_KEY;
delete env.NO_COLOR;

const p = ptySpawn('node', [ENTRY, '--native'], {
  name: 'xterm-256color', cols: 100, rows: 40,
  cwd: scenarioCwd, env,
});

let out = '';
let exited = false;
p.onData((d) => { out += d; });
p.onExit(() => { exited = true; });

// Steps (ms after spawn):
//   /model⏎ → the model picker · Esc closes it
//   /term⏎  → the posture picker · ↓ Enter → Run
//   /approve⏎ → the approval-mode picker · Esc
//   Ctrl-C ×2 → exit
const steps = [
  { send: '/model\r',   afterMs: 6000 },
  { send: '\x1b',       afterMs: 8000 },
  { send: '/term\r',    afterMs: 9500 },
  { send: '\x1b[B',     afterMs: 11000 },
  { send: '\r',         afterMs: 11700 },
  { send: '/approve\r', afterMs: 13000 },
  { send: '\x1b',       afterMs: 14500 },
  { send: '\x03',       afterMs: 16000 },
  { send: '\x03',       afterMs: 16700 },
];
steps.forEach(({ send, afterMs }) =>
  setTimeout(() => { try { p.write(send); } catch { /* already exited */ } }, afterMs));

const DEADLINE = 16700 + 2500;

const result = await new Promise((resolve) => {
  setTimeout(() => {
    if (!exited) { try { p.kill(); } catch { /* already dead */ } }
    resolve(stripAnsi(out));
  }, DEADLINE);
});

// ─── Assertions ──────────────────────────────────────────────────────────────
const failures = [];

// (a) the model picker opened: its localized title + at least one state word
if (!(result.includes('Choose a model') && /\[(current|ok|blocked|unknown)\]/.test(result))) {
  failures.push('(a) model picker title/state words not in scrollback');
}
// (b) while a picker owns stdin the anchor says so (textual carrier)
if (!result.includes('input paused')) failures.push('(b) "input paused" anchor never rendered');
// (c) the posture picker applied its pick through the real seam
if (!(result.includes('Choose the terminal authority posture') && result.includes('terminal mode switched: Run'))) {
  failures.push('(c) /term picker did not switch the posture to Run');
}
// (d) the approval-mode picker opened with its mode meanings
if (!(result.includes('Choose the approval mode') && result.includes('ask before every tool call'))) {
  failures.push('(d) /approve picker title/facts not in scrollback');
}
// (e) no picker string leaked a placeholder
if (/\{(detail|value|query|command|glyph|n|id|arg)\}/.test(result)) failures.push('(e) an unfilled {placeholder} leaked');

// ─── Cleanup ─────────────────────────────────────────────────────────────────
try { rmSync(scenarioCwd, { recursive: true, force: true }); } catch { /* best-effort */ }

// ─── Report ──────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log('PASS: Terminal value picker (/model · /term · /approve) real-binary round-trip');
  console.log('  (a) model picker opened with state words');
  console.log('  (b) "input paused" anchor while a picker owns stdin');
  console.log('  (c) /term picker switched the posture to Run');
  console.log('  (d) /approve picker opened with mode meanings');
  console.log('  (e) no placeholder leaked');
  process.exit(0);
} else {
  console.log('FAIL: Terminal value picker real-binary round-trip');
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('  --- scrollback (last 30 lines) ---');
  result.split('\n').filter((l) => l.trim()).slice(-30).forEach((l) => console.log(`  ${l}`));
  process.exit(1);
}
