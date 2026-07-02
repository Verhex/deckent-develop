# Ink TUI (React-for-CLI)

> Sprint 224: Ink's full-frame reconciler replaced a hand-rolled raw-ANSI TUI that could not
> deliver native feel (multi-line overwrite, broken queue, cursor drift). This skill captures
> the layout + testing lessons from sprints 224 / 285 / 354 / 359.

### Layout: Static / Anchor / Input-Pinned
- Completed turns render once inside `<Static>` — they scroll naturally and are never
  re-rendered on every keystroke (Ink reconciles the WHOLE frame, so re-rendering history
  is wasted work and causes flicker).
- The streaming reply + a persistent status anchor render BELOW `<Static>`.
- The input component is the LAST element in the tree so it stays pinned at the bottom no
  matter how much scrollback accumulates above it.

### Raw Mode
- `useInput` requires raw mode; raw mode requires a real TTY. Guard every
  `process.stdin.setRawMode(true)` call behind `process.stdin.isTTY` AND a try/catch — a
  piped/non-interactive stdin throws on `setRawMode`, it does not just return false.
- Never assume an Ink app always has an interactive terminal — CI, piped input, and
  `< script.txt` invocations are all real, un-interactive stdin.

### NO_COLOR / Color Detection
- Check `process.env.NO_COLOR !== undefined`, not truthiness — an empty-string `NO_COLOR=`
  must still disable color per the spec.
- Keep ONE `strip()`/color-detection helper instead of scattering ANSI checks across
  components — every render path (Static, anchor, input) must agree on color state.

### Testing Without Mounting Ink
- `ink-testing-library` is NOT a project dependency — confirmed independently three times
  (sprints 285, 354, 359) rather than re-litigated per task. The established pattern:
  extract the PURE, EXPORTED logic out of the Ink component (key parsing, queue state,
  mode transitions, footer text) and unit-test THAT directly — never mount the component
  tree just to reach one helper.
- Concretely: `editInput`/`InputHistory` (line-edit), `createConfirmQueue` (app),
  `inkToKey` (input-bar), `buildLiveFooter` (live-footer) are seams built for exactly this.
- What stays untested by design (document it, don't silently drop it): real bracketed
  paste, `setRawMode` negotiation, Ink's own resize reconciliation — these need a real PTY
  smoke, not a unit test.

## Anti-Patterns to Avoid
- Mounting an Ink component in a test to reach one exported helper — extract the helper.
- Calling `setRawMode` without an `isTTY` guard — crashes on non-interactive invocations.
- Re-rendering history instead of appending once inside `<Static>`.
- Checking `NO_COLOR` for truthiness instead of `!== undefined`.

## Karpathy Notes
- **Simplicity first:** a pure-function seam beats a mocked Ink render every time — faster,
  zero flake, no new devDependency.
- **Surgical:** when a behavior genuinely can't be seamed (raw-mode negotiation, real
  paste), say so explicitly in the test file's header instead of forcing a fragile mount.
