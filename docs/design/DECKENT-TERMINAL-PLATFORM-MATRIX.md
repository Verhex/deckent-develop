# Deckent Terminal Platform and Capability Matrix

> Status: implementation admission contract · 2026-08-25
>
> Accepted composition: Causal Workline with contextual Work Ledger
>
> Applies to: macOS, Linux, Windows native, WSL, remote TTYs, multiplexers and redirected output

## 1. Admission decision

Deckent chooses a rendering path from observed capabilities, not from the operating-system or shell
name alone:

1. **Interactive rich Terminal** — stdin and stdout are TTYs; raw input, cursor control, usable
   encoding and a measured viewport are available. Render one Causal Workline with bounded dynamic
   output and native scrollback.
2. **Interactive line Terminal** — line editing is safe but cursor ownership, glyphs or viewport
   behavior are not proven. Use a sequential line REPL with numbered decisions and explicit
   commands; do not emulate the rich surface.
3. **Unsupported interactive host** — required input semantics cannot be established. Fail honestly
   with the exact missing capability and a supported invocation path.
4. **Non-interactive output** — stdin or stdout is redirected, `TERM=dumb`, or machine output is
   requested. Emit deterministic records with no cursor movement, animation or interactive prompt.

An OS-family match is never sufficient evidence for the rich path.

## 2. Environment matrix

| Environment | Rich-path target | Required behavior | Proof needed before default admission |
|---|---|---|---|
| macOS Terminal, iTerm2, modern emulators | Yes | POSIX signals, UTF-8/display-cell width, resize, main-screen scrollback, theme-safe foregrounds | Real binary PTY run on macOS; light/dark, 16/256/truecolor, resize, paste and long scrollback |
| Linux desktop terminals | Yes | POSIX signals, TERM/COLORTERM capability resolution, UTF-8/ASCII fallback, resize | Real binary PTY run on representative VTE/xterm-shaped hosts; color tiers and locale variance |
| Windows Terminal with PowerShell, pwsh or cmd | Yes | Windows signal/close semantics, ConPTY input, CRLF-safe paste, display-cell width, native path rendering | Real binary ConPTY run on Windows native for every supported shell; resize, Ctrl+C/SIGBREAK and pipe close |
| Legacy or restricted Windows console host | Conditional | Admit only capabilities actually observed; otherwise line Terminal | Real binary proof per supported host; unsupported hosts fail with a typed reason |
| WSL under Windows Terminal or another host | Yes | Linux process semantics plus WSL raw-mode reassert, ConPTY boundary and `/mnt`/network-filesystem tolerance | Real WSL run, subprocess return/raw-mode recovery, resize, paste and polling-backed freshness |
| SSH / remote pseudo-TTY | Conditional | Trust negotiated capabilities only after probing; tolerate latency and disconnect; no local clipboard assumption | Remote PTY run with disconnect/reconnect, narrow resize, locale/color variance and stale state |
| tmux / screen | Conditional | Respect reported color tier and cell size; preserve multiplexer scrollback and key ownership | Nested PTY run, detach/reattach, resize, alternate-key conflicts and 16/256/truecolor behavior |
| CI, pipe, redirect, `TERM=dumb` | No | Deterministic line or machine records; no raw mode, cursor control, focus or required input | Snapshot plus real pipe/redirect runs; EPIPE/EOF closure on POSIX and Windows |

“Conditional” means the line path is a first-class valid result, not a degraded imitation of the
rich UI.

## 3. Allowed production primitives

| Design region | Terminal primitive |
|---|---|
| Settled causal history | Ink `<Static>` or equivalent write-once main-screen output retained by native scrollback |
| Live phase, focus and composer | One bounded dynamic render region with one stdin owner |
| Work anchor | Sequential text rows above the live stream; it must collapse before log width becomes unsafe |
| Decision dock | Conditional dynamic rows immediately before the composer |
| Work Ledger | `/runs --follow` replaces the bounded dynamic region; stable identity survives polling/reorder and one stdin owner remains |
| Full approval review | Replacement of the bounded dynamic region, restored on Escape; not a floating popup |
| Selection | Visible text cursor and stable object identity; color is supplemental |
| Semantic emphasis | Generated foreground roles resolved to none/ANSI-16/ANSI-256/truecolor |
| Causal stem | Unicode glyph when width/encoding is trusted; `|`, `+`, `\` ASCII equivalents otherwise |
| Help and action hints | Contextual key labels and slash commands; pointer support may supplement but never gate an action |

Deckent must not depend on bundled fonts, a forced background, CSS layout, hover, pointer-only
actions, clipboard-only actions, GUI notifications, exact pixel geometry or alternate-screen mode.

## 4. Width and height policy

Width is measured in terminal display cells, not JavaScript string length or code points. Height is
also an admission input; a wide but short terminal is not treated as spacious.

- **100+ cells:** one column by default; an optional adjacent focus context is admissible only after
  resize and input-ownership proof. Work Ledger may show outcome, progress, current condition,
  freshness and evidence columns.
- **60–99 cells:** single Causal Workline; summaries wrap at semantic boundaries. Work Ledger keeps
  identity, progress and current condition, moving freshness/evidence into selected detail.
- **40–59 cells:** compact anchor, exact counts and short stable IDs; Work Ledger uses two-line rows
  and full detail replaces the dynamic region.
- **Below 40 cells or insufficient rows:** line Terminal. No clipped facsimile of the rich layout.

Resize preserves focused object identity and composer content. It may reflow text, but it cannot
silently change the selected decision or execution state.

## 5. Input, process and signal contract

- Arrow, Home/End, Backspace/Delete, paste and combining/wide characters require display-cell and
  grapheme-safe cursor evidence on each rich path.
- Enter and visible key hints are primary. Mouse and clipboard integration are optional adapters.
- Escape returns from focus; it never claims to cancel a provider turn or process.
- Interrupt is shown only when the exact target has a real abort seam. Pending-queue clearing is not
  described as active execution cancellation.
- POSIX uses its documented signal set; Windows native separately handles console close, `SIGINT`,
  `SIGBREAK`, EOF and closed-pipe behavior.
- Returning from an editor, shell or child process re-establishes raw mode and redraw ownership,
  including WSL.

## 6. Font, theme and glyph contract

- The operator owns font family, size, line height and ligatures. Production copy must remain
  readable in common monospace metrics and must not name Geist Mono as a runtime dependency.
- The operator owns the background. Foreground roles must remain legible on light, dark and unknown
  backgrounds. When background confidence is insufficient, Deckent falls back to conservative ANSI
  roles or no color.
- `NO_COLOR` and explicit no-color flags remove decoration without removing state, risk, focus or
  attribution.
- Emoji and ambiguous-width glyphs are excluded from structural UI. Box-drawing characters have
  tested ASCII equivalents.

## 7. Existing evidence and exact gaps

Existing source seams already provide TTY/non-TTY branching, Windows/POSIX shutdown distinctions,
WSL raw-mode reassertion, main-screen scrollback by default, color-tier resolution, display-width
cursor handling, polling for WSL/network filesystems and an xterm-shaped PTY harness.

The current anchors are `src/cli/entry.ts`, `src/cli/repl/run.tsx`,
`src/cli/helpers/theme.ts`, `src/cli/repl/cursor-model.ts`,
`src/cli/repl/input-bar.tsx`, `src/cli/repl/inbox-card.tsx`,
`src/cli/repl/run-flow-inbox.ts`, `src/cli/repl/run-completion-watch.ts`,
`tests/cli/repl/term-compat-matrix.test.ts` and `scripts/ink-pty-test.mjs`.

That evidence does **not** yet prove the accepted surface on the platform matrix:

1. The current compatibility tests exercise pure seams and comments reference a canonical
   `docs/reference/terminal-compat.md` that does not exist.
2. The PTY harness proves one local xterm-shaped environment, not macOS Terminal, native Windows
   ConPTY, WSL, SSH or multiplexers.
3. Cursor handling is code-point/display-width aware, but full grapheme-cluster behavior needs a
   real-input proof before the rich path claims it.
4. Component-local color literals still bypass the generated Terminal theme in parts of the
   current surface.
5. Queue preview length is character-based rather than measured display cells.
6. Active provider-turn cancellation and full Ask/Run/Control risk-gate wiring remain unavailable.

These gaps do not invalidate the design direction. They block default production admission for any
capability path they affect.

## 8. Implementation capture manifest

Before the accepted direction becomes production-complete, evidence must include:

- real-binary macOS, Linux, Windows native and WSL runs;
- representative Windows Terminal + PowerShell/pwsh/cmd and Linux/macOS emulator combinations;
- SSH and tmux/screen conditional-path runs;
- 120, 80, 40 and below-40-cell captures plus insufficient-height behavior;
- live resize with selection identity and composer content preserved;
- light, dark and unknown background; truecolor, ANSI-256, ANSI-16 and no-color;
- Unicode and forced ASCII/legacy-locale behavior;
- paste, wide/combining/grapheme input, child-process return and raw-mode recovery;
- EPIPE/EOF, Ctrl+C, SIGBREAK/console close, disconnect and stale-state behavior;
- long-session main-screen scrollback with bounded redraw; and
- redirected human output and stable machine-output snapshots.

Evidence is recorded per platform/terminal/shell/capability tuple. A green row cannot be generalized
to an untested tuple merely because it shares an operating system.
