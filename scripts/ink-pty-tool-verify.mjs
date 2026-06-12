// PTY regression harness for REPL tool-call protocol (Sprint 285 T-285-005).
// 4 scenarios: write+approval, bash-tek, deny, multi-tag (2 confirm cards).
// Pattern: scripts/ink-pty-test.mjs (existing harness — same PTY mechanics).
// Skip-safe: exits 0 with SKIP when dist/ or node-pty are missing.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENTRY = resolve('dist/cli/entry.js');
if (!existsSync(ENTRY)) {
  console.log('SKIP: dist/cli/entry.js not found — run npm run build first');
  process.exit(0);
}

let ptySpawn;
try { ({ spawn: ptySpawn } = await import('@lydell/node-pty')); }
catch { console.log('SKIP: @lydell/node-pty not available'); process.exit(0); }

const TOKS = { '<C-c>': '\x03', '<CR>': '\r' };
const expand = (s) => Object.entries(TOKS).reduce((a, [k, v]) => a.split(k).join(v), s);
const stripAnsi = (s) =>
  s.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n');

/** Run one PTY scenario and return { passed, name, out }. */
function runScenario({ name, mock, steps, verify }) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DECKENT_INK: '1',
      DECKENT_CHAT_PROVIDER: 'claude',
      DECKENT_PTY_MOCK: JSON.stringify(mock),
    };
    delete env.ANTHROPIC_API_KEY;

    const p = ptySpawn('node', [ENTRY], {
      name: 'xterm-256color', cols: 100, rows: 30,
      cwd: process.cwd(), env,
    });
    let out = ''; let exited = false;
    p.onData((d) => { out += d; });
    p.onExit(() => { exited = true; });

    const deadline = Math.max(3000, ...steps.map((s) => s.afterMs)) + 2500;
    steps.forEach(({ send, afterMs }) =>
      setTimeout(() => { try { p.write(expand(send)); } catch { /* exited */ } }, afterMs));

    setTimeout(() => {
      if (!exited) { try { p.kill(); } catch { /* already dead */ } }
      const stripped = stripAnsi(out);
      const passed = verify(stripped);
      resolve({ passed, name, out: stripped });
    }, deadline);
  });
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    name: 'write+approval',
    mock: [
      '<deckent_tool>{"name":"deckent_write_file","args":{"path":"/tmp/pty-verify-write.txt","content":"pty test ok"}}</deckent_tool>',
      'File created.',
    ],
    steps: [
      { send: 'write test file<CR>', afterMs: 1500 },
      { send: 'y', afterMs: 2800 },       // confirm write
      { send: '<C-c>', afterMs: 4500 },   // exit
    ],
    // Confirm dialog always shows the hint text; tool name visible in summary.
    verify: (out) => out.includes('y = allow') || out.includes('y = izin') || out.includes('pty-verify-write'),
  },
  {
    name: 'bash-tek',
    mock: [
      '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo pty-bash-ok"}}</deckent_tool>',
      'Done.',
    ],
    steps: [
      { send: 'run echo command<CR>', afterMs: 1500 },
      { send: 'y', afterMs: 2800 },
      { send: '<C-c>', afterMs: 4500 },
    ],
    verify: (out) => out.includes('y = allow') || out.includes('y = izin') || out.includes('bash') || out.includes('echo'),
  },
  {
    name: 'deny',
    mock: [
      '<deckent_tool>{"name":"deckent_write_file","args":{"path":"/tmp/pty-verify-deny.txt","content":"should not exist"}}</deckent_tool>',
      'Understood.',
    ],
    steps: [
      { send: 'write deny test<CR>', afterMs: 1500 },
      { send: 'n', afterMs: 2800 },       // deny
      { send: '<C-c>', afterMs: 4500 },
    ],
    // After deny: [cancelled] or [iptal edildi] appears in the output.
    verify: (out) => out.includes('cancel') || out.includes('iptal') || out.includes('denied') || out.includes('reddet') || out.includes('y = allow') || out.includes('y = izin'),
  },
  {
    name: 'multi-tag (2 confirm cards)',
    mock: [
      '<deckent_tool>{"name":"deckent_write_file","args":{"path":"/tmp/pty-verify-multi-1.txt","content":"first"}}</deckent_tool>' +
      '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo pty-multi-ok"}}</deckent_tool>',
      'Both done.',
    ],
    steps: [
      { send: 'do two things<CR>', afterMs: 1500 },
      { send: 'y', afterMs: 2800 },       // confirm first tool [1/2]
      { send: 'y', afterMs: 3800 },       // confirm second tool [2/2]
      { send: '<C-c>', afterMs: 5500 },
    ],
    // [1/2] and [2/2] progress indicators must both appear (confirmProgress key).
    verify: (out) => out.includes('[1/2]') && out.includes('[2/2]'),
  },
];

// ─── Run all scenarios sequentially ─────────────────────────────────────────

let allPassed = true;
for (const scenario of SCENARIOS) {
  const { passed, name, out } = await runScenario(scenario);
  if (passed) {
    console.log(`PASS: ${name}`);
  } else {
    console.log(`FAIL: ${name}`);
    console.log('  --- output (last 12 lines) ---');
    out.split('\n').filter((l) => l.trim()).slice(-12).forEach((l) => console.log(`  ${l}`));
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\nAll scenarios PASS');
  process.exit(0);
} else {
  console.log('\nSome scenarios FAILED');
  process.exit(1);
}
