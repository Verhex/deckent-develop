# REPL Terminal Compatibility Matrix

Sprint 359 Task 359-007 (Sıra-52). What deckent's Ink REPL (`src/cli/repl/`)
actually verifies about resize / paste / arrow-key / raw-mode behavior across
terminal environments, and — critically — what it does **not** verify and
still needs a human or a real-PTY run to confirm. Honesty over coverage
theater: a cell in this table says exactly what kind of proof backs it.

## Why this isn't an `ink-testing-library` suite

The task that produced this doc asked for `ink-testing-library`-based
scenarios. That library is **not a project dependency** — `package.json` has
`ink` but no `ink-testing-library`, and there is no
`node_modules/ink-testing-library`. This has already been hit and documented
twice before in this codebase:

- [`tests/cli/repl-tool-multi-tag-repro.test.ts`](../../tests/cli/repl-tool-multi-tag-repro.test.ts) (sprint 285)
- [`tests/cli/repl-surface-wire.test.tsx`](https://github.com/VerhexIO/deckent/blob/main/tests/cli/repl-surface-wire.test.tsx) (sprint 354)

Both land on the same fallback, which this task's own wording anticipates
("gerçek-PTY değil, seam'li" — not real-PTY, seam-based): pull the pure,
already-exported logic out of the Ink components and test that directly,
instead of mounting Ink. Adding `ink-testing-library` as a new dependency was
out of scope here (package.json isn't in this task's write list, and workers
are never allowed to run `npm install`) and would duplicate a decision three
sprints have already made independently.

The seam-tested suite is
[`tests/cli/repl/term-compat-matrix.test.ts`](../../tests/cli/repl/term-compat-matrix.test.ts)
(23 deterministic cases across 4 groups — Resize, Paste, Arrow/cursor/history,
Raw-mode control bindings).

## What "seam-tested" proves, and what it doesn't

The seam tests exercise real, exported, pure functions:
[`editInput` + `InputHistory`](../../src/cli/repl/line-edit.ts) (arrow keys,
Home/End, Ctrl-A/E/U/C/D, Backspace/Delete, Tab, history nav, and the
single-chunk `key.sequence` insert path a no-newline OS paste flows through)
and [`buildLiveFooter`](../../src/cli/helpers/live-footer.ts) (the `width`
option is exactly what changes on a terminal resize).

That proves the **decision logic is correct and platform-agnostic** — the
same reducer runs identically on every OS, so there is no OS-specific branch
in `editInput`/`buildLiveFooter` to individually verify per platform. It does
**not** prove that a given terminal emulator on a given OS actually delivers
the byte sequences that logic expects at its input boundary (e.g. does
PowerShell's Home key really arrive as the escape sequence `inkToKey` maps to
`{name:'home'}`?). That boundary lives in Ink's own keypress parser and in
[`inkToKey`](https://github.com/VerhexIO/deckent/blob/main/src/cli/repl/input-bar.tsx) (module-private, not exported —
touching `input-bar.tsx` was explicitly out of this task's nogo), so it is
real-PTY / manual territory, not a seam.

Not covered by any seam at all (the logic lives inline inside `input-bar.tsx`'s
`useInput` callback or `run.tsx`'s raw-mode negotiation, neither exported nor
in this task's write scope):

- Real bracketed multi-line paste → single-message merge
  ([`input-bar.tsx:128-146`](https://github.com/VerhexIO/deckent/blob/main/src/cli/repl/input-bar.tsx#L128-L146))
- Single-line paste + trailing-newline auto-submit (same block)
- `inkToKey`'s Home/End escape-sequence detection per terminal
  ([`input-bar.tsx:42-57`](https://github.com/VerhexIO/deckent/blob/main/src/cli/repl/input-bar.tsx#L42-L57))
- `process.stdin.setRawMode` negotiation, real TTY only
  ([`run.tsx:235,247`](https://github.com/VerhexIO/deckent/blob/main/src/cli/repl/run.tsx))
- Ink's own resize reconciliation (internal to the `ink` package, not deckent code)

## Compat matrix

Legend:
- **seam** — logic-verified by the deterministic suite above; platform-agnostic, runs in CI on every push.
- **seam + PTY** — seam-verified, and additionally covered by an existing real-PTY harness (Linux container only, see below).
- **manual** — no seam and no existing PTY harness; needs a human on that OS/terminal, or a new harness (tracked as debt, not silently skipped — Immutable Law 2 forbids "this environment first, the rest later").

| Platform | Resize | Paste | Arrow / cursor | Raw-mode (Ctrl bindings) |
|---|---|---|---|---|
| Linux (native tty) | seam | seam (single-chunk); multi-line-merge: **manual** | seam + PTY | seam + PTY |
| Linux (WSL, no native PTY here) | seam | seam (single-chunk); multi-line-merge: **manual** | seam | seam |
| macOS (Terminal.app / iTerm2) | seam | seam (single-chunk); multi-line-merge: **manual** | seam; Home/End byte-sequence: **manual** | seam; raw-mode negotiation: **manual** |
| Windows Terminal | seam | seam (single-chunk); multi-line-merge: **manual** | seam; Home/End byte-sequence: **manual** | seam; raw-mode negotiation: **manual** |
| PowerShell (conhost/legacy) | seam | seam (single-chunk); multi-line-merge: **manual** | seam; Home/End byte-sequence: **manual** | seam; raw-mode negotiation: **manual** |
| Git Bash (MinTTY) | seam | seam (single-chunk); multi-line-merge: **manual** | seam; Home/End byte-sequence: **manual** | seam; raw-mode negotiation: **manual** |

Note on the "PTY" column value: this worker's sandbox is a Linux container,
so `+ PTY` is only claimed where an existing harness in this repo actually
runs there. No PTY harness in this repo currently drives a live terminal
resize (`SIGWINCH`) or a multi-line bracketed paste — see the commands below
for what exists today and the ad-hoc snippet for what doesn't yet have a
tracked script.

## Real-PTY smoke — host-side (CC/Alperen), not run by this worker

These spawn the **real built binary** in a real pseudo-terminal via
`@lydell/node-pty`. Build first: `npm run build`.

**Arrow / raw-mode / single-line-paste round-trip** — existing generic
harness, tokenized keystrokes against `dist/cli/entry.js`:

```bash
node scripts/ink-pty-test.mjs '[
  {"send":"hello<LEFT><LEFT><BS>","afterMs":1200},
  {"send":"<HOME>X<END>Y","afterMs":1800},
  {"send":"<UP><DOWN>","afterMs":2200},
  {"send":"<C-c>","afterMs":2800}
]'
```

Inspect the printed `--- last render ---` tail: left/backspace should show
the edited buffer, Home/End should show `X` prepended and `Y` appended,
Ctrl-C should exit. See
[`scripts/ink-pty-test.mjs`](../../scripts/ink-pty-test.mjs) for the full
token table (`<LEFT>`, `<RIGHT>`, `<UP>`, `<DOWN>`, `<HOME>`, `<END>`, `<BS>`,
`<ESC>`, `<TAB>`, `<C-c>`, `<C-r>`, `<C-l>`).

**Tool-confirm flow (raw-mode `y`/`n`/`a` bindings under a real PTY)**:

```bash
npm run verify:repl-tools     # scripts/ink-pty-tool-verify.mjs — 4 scenarios
npm run verify:native-repl    # scripts/ink-pty-native-verify.mjs — native-agent path
```

Both are skip-safe (exit 0 with `SKIP` if `dist/` or `@lydell/node-pty` are
missing) — a real PASS requires the build step above.

**Live resize (SIGWINCH) — no existing script; ad-hoc command** (not added as
a new file here — out of this task's write scope):

```bash
node --input-type=module -e '
import { spawn } from "@lydell/node-pty";
const p = spawn("node", ["dist/cli/entry.js"], { name: "xterm-256color", cols: 100, rows: 30, cwd: process.cwd(), env: { ...process.env, DECKENT_INK: "1" } });
let out = "";
p.onData((d) => { out += d; });
setTimeout(() => p.write("checking footer at 100 cols\r"), 1000);
setTimeout(() => p.resize(40, 30), 2000);   // narrow the terminal live
setTimeout(() => p.write("checking footer at 40 cols\r"), 2500);
setTimeout(() => p.resize(100, 30), 3500);  // widen back
setTimeout(() => { p.kill(); console.log(out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")); process.exit(0); }, 4500);
'
```

Confirm the live-footer line (when wired to a running task) re-truncates at
the new width after each `resize()` call, with no stale wide-render artifact
left on screen and no crash. This is the honest gap called out in the matrix
above — promote it to a tracked `scripts/` harness in a follow-up task rather
than leaving it as a one-off command long-term.

## Running the deterministic suite

```bash
npx vitest run tests/cli/repl/term-compat-matrix.test.ts
```
