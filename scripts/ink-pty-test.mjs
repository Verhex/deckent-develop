// Ink REPL interactive PTY harness (Sprint 224). Spawns the real Ink REPL in a
// pseudo-terminal, sends timed keystrokes, and reports render + exit — the
// correct way to test a TUI (script+printf can't drive Ink's stdin semantics).
import { spawn } from '@lydell/node-pty';

const TOKENS = { '<LEFT>': '\x1b[D', '<RIGHT>': '\x1b[C', '<UP>': '\x1b[A', '<DOWN>': '\x1b[B', '<HOME>': '\x1b[H', '<END>': '\x1b[F', '<CR>': '\r', '<BS>': '\x7f', '<ESC>': '\x1b', '<TAB>': '\t', '<C-c>': '\x03', '<C-r>': '\x12', '<C-l>': '\x0c' };
const expand = (s) => Object.entries(TOKENS).reduce((a, [k, v]) => a.split(k).join(v), s);
const steps = JSON.parse(process.argv[2] ?? '[]').map((s) => ({ ...s, send: expand(s.send) })); // tokens: <CR>/<LEFT>/<BS>/…
const env = { ...process.env, DECKENT_INK: '1' }; delete env.ANTHROPIC_API_KEY;
const p = spawn('node', ['dist/cli/entry.js'], { name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env });
let out = ''; let exited = false; let code = null;
p.onData((d) => { out += d; });
p.onExit((e) => { exited = true; code = e.exitCode ?? 0; });
const strip = () => out.replace(/\x1b\][0-9;]*[^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n');
for (const s of steps) setTimeout(() => { try { p.write(s.send); } catch { /* exited */ } }, s.afterMs);
const deadline = Math.max(3000, ...steps.map((s) => s.afterMs)) + 3000;
setTimeout(() => {
  console.log(`EXITED=${exited} CODE=${code}`);
  console.log('--- last render ---');
  console.log(strip().split('\n').filter((l) => l.trim()).slice(-8).join('\n'));
  if (!exited) { console.log('!!! HANG'); p.kill(); }
  process.exit(0);
}, deadline);
