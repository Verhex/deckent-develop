// PTY proof-of-function harness for native REPL path (SP-1 M3 T6).
// Drives `deckent --native` end-to-end: real Ink + real AgentSession + real tool
// exec, with ONLY the LLM mocked via DECKENT_NATIVE_MOCK (structured tool_use —
// no tag parsing).  Pattern: scripts/ink-pty-tool-verify.mjs (same PTY mechanics).
// Skip-safe: exits 0 with SKIP when dist/ or node-pty are missing (same guard).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ENTRY = resolve('dist/cli/entry.js');
if (!existsSync(ENTRY)) {
  console.log('FAIL: dist not built — run npm run build:all first');
  process.exit(1);
}

let ptySpawn;
try { ({ spawn: ptySpawn } = await import('@lydell/node-pty')); }
catch { console.log('SKIP: @lydell/node-pty not available'); process.exit(0); }

const stripAnsi = (s) =>
  s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n');

// ─── Scenario ────────────────────────────────────────────────────────────────
// Turn-1: assistant says text, then emits a tool-call (write a proof file),
//         then done.  Turn-2: "Done." — the confirmation round-trip close.
const scenarioCwd = mkdtempSync(join(tmpdir(), 'pty-native-verify-'));
const proofFile = join(scenarioCwd, 'native-proof.txt');

const mockScript = JSON.stringify([
  // turn-1 events (structured ProviderEvent[])
  [
    { type: 'text-delta', text: 'Writing the proof file.' },
    { type: 'tool-call', id: 'p1', name: 'deckent_write_file', args: { path: proofFile, content: 'OK' } },
    { type: 'done' },
  ],
  // turn-2 events (after tool result sent back)
  [
    { type: 'text-delta', text: 'Done.' },
    { type: 'done' },
  ],
]);

const env = {
  ...process.env,
  DECKENT_INK: '1',
  DECKENT_NATIVE_AGENT: '1',
  DECKENT_NATIVE_MOCK: mockScript,
  // No ANTHROPIC_API_KEY — mock short-circuit fires first regardless
};
delete env.ANTHROPIC_API_KEY;

const p = ptySpawn('node', [ENTRY, '--native'], {
  name: 'xterm-256color', cols: 120, rows: 40,
  cwd: scenarioCwd, env,
});

let out = '';
let exited = false;
p.onData((d) => { out += d; });
p.onExit(() => { exited = true; });

// Steps:
//   1500ms — send the prompt
//   3000ms — send 'y' to approve the confirm card for deckent_write_file
//   6000ms — Ctrl+C to exit
const steps = [
  { send: 'write the proof\r', afterMs: 1500 },
  { send: 'y',                afterMs: 3000 },
  { send: '\x03',             afterMs: 6000 },
];
steps.forEach(({ send, afterMs }) =>
  setTimeout(() => { try { p.write(send); } catch { /* already exited */ } }, afterMs));

// Deadline: longest step + buffer
const DEADLINE = 6000 + 2500;

const result = await new Promise((resolve) => {
  setTimeout(() => {
    if (!exited) { try { p.kill(); } catch { /* already dead */ } }
    resolve(stripAnsi(out));
  }, DEADLINE);
});

// ─── Assertions ──────────────────────────────────────────────────────────────
const failures = [];

// (a) A confirm card appeared (approval-prompt hint)
const hasConfirmCard =
  result.includes('y = allow') ||
  result.includes('y = izin') ||
  result.includes('allow') ||
  result.includes('confirm');
if (!hasConfirmCard) failures.push('(a) no confirm card hint in scrollback');

// (b) native-proof.txt written with content OK
const proofExists = existsSync(proofFile);
if (!proofExists) {
  failures.push('(b) native-proof.txt not created on disk');
} else {
  const content = readFileSync(proofFile, 'utf8').trim();
  if (content !== 'OK') failures.push(`(b) native-proof.txt content = "${content}" (expected "OK")`);
}

// (c) scrollback shows a change/tool block (at minimum a recognizable artifact)
const hasToolArtifact =
  result.includes('deckent_write_file') ||
  result.includes('write_file') ||
  result.includes('Writing the proof') ||
  result.includes('native-proof');
if (!hasToolArtifact) failures.push('(c) no tool artifact in scrollback');

// ─── Cleanup ─────────────────────────────────────────────────────────────────
try { rmSync(scenarioCwd, { recursive: true, force: true }); } catch { /* best-effort */ }

// ─── Report ──────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log('PASS: deckent --native tool round-trip');
  console.log('  (a) confirm card appeared');
  console.log('  (b) native-proof.txt written with "OK"');
  console.log('  (c) tool artifact visible in scrollback');
  process.exit(0);
} else {
  console.log('FAIL: deckent --native tool round-trip');
  failures.forEach((f) => console.log(`  ${f}`));
  console.log('  --- scrollback (last 20 lines) ---');
  result.split('\n').filter((l) => l.trim()).slice(-20).forEach((l) => console.log(`  ${l}`));
  process.exit(1);
}
