# Terminal Single-Surface Design Critic — 2026-08-25

VERDICT: **PASS — accepted design contract only**

This verdict does not approve production implementation or claim real-binary parity. It confirms
that the owner-accepted Causal Workline with contextual Work Ledger is coherent, mapped to real
Terminal primitives and honest about its implementation-admission gaps.

## Scope

- Contract: `docs/design/DECKENT-TERMINAL-SINGLE-SURFACE.md`
- Platform contract: `docs/design/DECKENT-TERMINAL-PLATFORM-MATRIX.md`
- Prototype: `docs/design/prototypes/terminal-single-surface-directions.html`
- Accepted composition: Causal Workline default shell + contextual `/runs --follow` Work Ledger;
  Focus Workspace and standalone Command Ledger remain comparison evidence
- States: routine operation, bounded approval and stale/disconnected evidence
- Rendered conditions: Workline and Work Ledger at 120-column dark/Unicode and 80-column
  light/ASCII; 40-column focused approval and compact Work Ledger light/ASCII simulations
- Authority: current owner-decision ratchet and Deckent Terminal/Product/Agentic/Visual contracts

## Findings

### TSS-C1 · MEDIUM · Focus Workspace · 80/40-column focused object

- **Evidence:** Direction B moves the focus region below the event stream at narrow widths.
- **Contract:** stable focus and native scrollback must survive resize without scroll theft.
- **Impact:** a live stream could move the selected decision outside the viewport or make Escape's
  return target ambiguous if production focus and scroll ownership are not identity-based.
- **Smallest durable remedy:** use canonical object identity for selection; freeze the focused
  region's return target; never auto-scroll on unrelated stream updates.
- **Closure proof:** real Ink resize capture with a selected run, arriving events and two-level
  Escape behavior at 80 and 40 columns.

### TSS-C2 · MEDIUM · Work Ledger · enterprise query authority

- **Evidence:** the accepted contextual ledger is grounded in a filesystem-backed run inbox capped
  to recent rows with bounded live polling.
- **Contract:** the first admitted lens covers active and attention-requiring work; enterprise
  history requires honest canonical filtering, pagination and stable selection authority.
- **Impact:** presenting the local lens as a complete fleet ledger would imply multi-tenant scale
  and query completeness that the current source does not prove.
- **Smallest durable remedy:** retain `/runs --follow` as the bounded contextual lens and
  dependency-bind full history/search to a canonical paged application-service query.
- **Closure proof:** large-history performance test and cross-process reorder test against the
  production source, not a prototype array.

### TSS-C3 · MEDIUM · Platform admission · real environment evidence

- **Evidence:** source tests and the PTY harness cover pure seams and a local xterm-shaped path; they
  do not prove native Windows ConPTY, macOS Terminal, WSL, SSH or multiplexer behavior.
- **Contract:** rich rendering is admitted by observed capability and per-environment real-binary
  evidence, never by OS or shell name.
- **Impact:** without the evidence matrix, resize, raw input, glyph width, signals or scrollback can
  fail on a platform while the design still appears complete.
- **Smallest durable remedy:** implement the matrix as an executable capture manifest and retain the
  line/non-interactive path for unproved tuples.
- **Closure proof:** named real-binary captures for macOS, Linux, Windows native and WSL plus
  conditional SSH/tmux runs, with failures mapped to typed fallback behavior.

### TSS-C4 · LOW · Prototype · localization and forced-color evidence

- **Evidence:** the prototype is English and browser-rendered; it demonstrates light/dark and
  Unicode/ASCII reference states but not Windows forced colors, ANSI-16 or Turkish expansion.
- **Contract:** Terminal ships en/tr parity and honest color-tier degradation.
- **Impact:** long Turkish labels or a restricted palette may change wrapping and action priority.
- **Smallest durable remedy:** implement through `messages.ts` and generated Terminal semantic
  tokens; do not translate or recolor locally in components.
- **Closure proof:** en/tr real-binary captures at 120/80/40 columns plus ANSI-16, NO_COLOR/dumb and
  forced-color checks.

## Evidence gaps before production acceptance

- No worktree `dist/` existed, so the mock-provider real-PTY harness skipped; no current binary was
  rebuilt because this design lane does not own build/daemon state.
- Active-turn interrupt is not a real provider abort in the current App path.
- Ask/Run/Control's full risk gate is not called by the production App.
- Approval review's complete requestor/scope/expiry/consequence/recovery anatomy is prototype-only.
- Pipe/redirect, ANSI tiers, Windows native, WSL, SSH, Turkish and screen-reader behavior are not
  proven by this artifact.
- Component-local Terminal color literals have not yet migrated to the generated semantic theme
  authority.
- Work Ledger's local cross-process scan is not enterprise history/search authority.
- The compatibility-test comment references `docs/reference/terminal-compat.md`, but that canonical
  runtime reference does not currently exist.

## Accepted strengths

- Every direction preserves one Terminal product surface and keeps Basic/Advanced Desktop-only.
- Causal Workline uses Terminal-native scrollback and removes the component-order card stack.
- Work Ledger replaces the same bounded dynamic region, uses one stdin owner and returns by stable
  canonical identity; it is not a permanent second pane.
- One focus region owns the decision and shows an exact pending count instead of simultaneous cards.
- Approval review exposes requestor, scope, policy, expiry, default, consequence, evidence and
  recovery limits before a decision.
- Routine, approval and stale states have explicit textual carriers independent of color.
- The 40-column render preserves outcome, progress, current condition, causal events, decision and
  composer in one reading order.
- Prototype mutations explicitly report that no production action was sent.
- Font and background are now explicitly host-owned; bundled Geist Mono and graphite exist only in
  the reproducible browser capture.
- Approval and evidence actions render as visible keyboard paths; the browser click target is review
  tooling only.
- The approval “overlay” is contractually a conditional replacement of the bounded dynamic region,
  not a floating Terminal window or alternate-screen requirement.
- The platform contract has a first-class line path, ASCII fallback and deterministic pipe output.

## Closure

Causal Workline with contextual Work Ledger is accepted. Production component work begins with the
region-to-Ink migration map, Workline → Ledger → selected Workline focus-preservation proof and an
executable capability-admission matrix. Active-turn abort, authority-gate, i18n, generated-theme,
canonical enterprise query and platform-proof gaps must close before their affected behavior is
default-admitted. A missing proof keeps the tuple on the bounded/line/non-interactive path; it does
not receive inferred parity.
