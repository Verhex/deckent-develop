// PTY regression harness for REPL tool-call protocol (Sprint 285 T-285-005).
// 4 scenarios: write+approval, bash-tek, deny, multi-tag (2 confirm cards).
// Pattern: scripts/ink-pty-test.mjs (existing harness — same PTY mechanics).
// Skip-safe: exits 0 with SKIP when dist/ or node-pty are missing.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
function runScenario({ name, mock, steps, verify, multiWriteTarget }) {
  return new Promise((resolvePromise) => {
    // HERMETIC cwd (ADR-087): a fresh tmpdir per scenario. Running in the repo
    // root leaked `.deckent/settings.local.json` permission-memory ('a'-always
    // grants from real dogfood sessions) into the harness — pre-allowed tools
    // never show a confirm card, making deny/multi-tag structurally untestable.
    const scenarioCwd = mkdtempSync(join(tmpdir(), 'pty-tool-verify-'));

    // multi-tag: the write target lives inside the per-run tmpdir so its
    // existence is the on-disk proof that the FIRST queued tool executed.
    const writeTarget = join(scenarioCwd, 'multi-write.txt');
    const effectiveMock = multiWriteTarget
      ? [
          `<deckent_tool>{"name":"deckent_write_file","args":{"path":"${writeTarget}","content":"first"}}</deckent_tool>` +
          '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo pty-multi-ok"}}</deckent_tool>',
          'Both done.',
        ]
      : mock;

    const env = {
      ...process.env,
      DECKENT_INK: '1',
      DECKENT_CHAT_PROVIDER: 'claude',
      DECKENT_PTY_MOCK: JSON.stringify(effectiveMock),
    };
    delete env.ANTHROPIC_API_KEY;

    const p = ptySpawn('node', [ENTRY], {
      name: 'xterm-256color', cols: 100, rows: 30,
      cwd: scenarioCwd, env,
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
      // multi-tag: BOTH the bash block (out) AND the write-on-disk must hold.
      const diskOk = multiWriteTarget ? existsSync(writeTarget) : true;
      const passed = verify(stripped) && diskOk;
      try { rmSync(scenarioCwd, { recursive: true, force: true }); } catch { /* best-effort */ }
      resolvePromise({ passed, name, out: stripped });
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
    // STRICT: the confirm card's hint must appear (no weak fallbacks — a raw
    // tag echoed into the transcript previously produced a spurious PASS).
    verify: (out) => out.includes('y = allow') || out.includes('y = izin'),
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
    // STRICT: card-hint required ('echo'/'bash' also appear in the typed input
    // itself, which previously made this a trivially-green check).
    verify: (out) => out.includes('y = allow') || out.includes('y = izin'),
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
    // STRICT: the card must have shown AND the deny-signal must appear AND no
    // fake success block. Deny returns "[deckent] iptal edildi: <tool>".
    verify: (out) =>
      (out.includes('y = allow') || out.includes('y = izin')) &&
      (out.includes('iptal edildi') || out.includes('cancelled')) &&
      !out.includes('wrote file') && !out.includes('dosya yazıldı'),
  },
  {
    // Two tags in ONE assistant turn. The engine dispatches tool calls
    // sequentially (await each), so the confirm queue shows them as two
    // back-to-back [1/1] cards (NOT a single [1/2]/[2/2] burst — that only
    // happens if multiple confirms enqueue before any resolves). The real
    // contract: BOTH tools get a confirm AND BOTH execute. Proven on disk
    // (write target) + the bash change-block, which persist in scrollback —
    // unlike the transient [i/N] modal which never flushes to Static.
    name: 'multi-tag (both tools execute)',
    multiWriteTarget: true, // harness fills the write path with a per-run tmp file
    mock: null,             // built in runScenario once the target path is known
    steps: [
      { send: 'do two things<CR>', afterMs: 1500 },
      { send: 'y', afterMs: 3000 },       // confirm first tool (write)
      { send: 'y', afterMs: 4200 },       // confirm second tool (bash)
      { send: '<C-c>', afterMs: 6000 },
    ],
    // PERSISTENT proof: the bash change-block appears AND the write landed on
    // disk (checked in runScenario via fileMustExist).
    verify: (out) => out.includes('ran command') || out.includes('komut çalıştırıldı'),
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
