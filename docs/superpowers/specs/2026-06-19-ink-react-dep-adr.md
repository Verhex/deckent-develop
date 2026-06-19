# ADR: ink + react Runtime Dependencies — Justification Against ADR-010

**Date:** 2026-06-19
**Status:** Accepted
**Scope:** `src/cli/repl/` — Ink-based native REPL (F11 feature set)
**Governing ADRs:** ADR-010 (Minimal Dependencies), ADR-081 (Native Agentic REPL), ADR-083 (REPL-UX-Evolution)

---

## 1. Context

ADR-010 ("Tek Runtime Dependency") establishes that every runtime dependency must be
ADR-justified and serve a foundational product capability. When deckent adopted `ink`
and `react` as part of the native REPL (Sprint 224, ADR-081/083), a formal dependency
justification was added to the ADR-010 inventory but never written as a standalone
rationale document. This spec records that rationale.

The hand-rolled raw-ANSI TUI (used before Sprint 224) suffered from:

| Problem | Impact |
|---------|--------|
| Multi-line overwrite flicker | Reply text tore when it exceeded terminal height |
| Queue ordering bugs | In-progress partial-line and static history shared the same render region |
| Cursor drift | Ansi escape sequences accumulated; cursor position was guessed, not owned |
| Broken input + output interleaving | stdin raw-mode and stdout writes fought each other |

These are precisely the problems that a full-frame reconciler solves. `claude-code` uses
the same Ink-based approach; deckent's native REPL is aligned with the industry direction.

---

## 2. Decision

**Accept `ink` (^7.0.5) and `react` / `react-dom` (^19.2.7) as justified runtime
dependencies** for the native REPL and web dashboard respectively, subject to the
constraints in §4.

### Why Ink (not a lighter alternative)

| Option | Verdict | Reason |
|--------|---------|--------|
| Raw ANSI escape codes | Rejected | Already tried (Sprint 1–223); cursor drift + queue breakage proved it cannot deliver native feel at production quality |
| `blessed` / `neo-blessed` | Rejected | Unmaintained; terminal compatibility issues; larger footprint than ink |
| `terminal-kit` | Rejected | Imperative API requires owning cursor state; same class of bugs as raw ANSI |
| **`ink`** | **Accepted** | Full-frame reconciler; React mental model; zero cursor math; claude-code compatibility; active maintenance |

Ink's full-frame reconciler owns cursor positioning. Completed reply turns are placed in
`<Static>` (rendered once, flow into scrollback naturally); the in-progress partial line
and input bar occupy a small dynamic region — no re-render of the entire history, no
height-based drift.

### Why React (not Preact or another alternative)

`ink` requires React as its peer dependency. Using Preact or a React-shim would break
ink's reconciler contract. Accepting ink implies accepting react. `react-dom` is also
required for the web dashboard (ADR-080).

The React version (19.x) is the current stable release as of Sprint 224.

---

## 3. Stream-Segmenter Race — Addressed Alongside This ADR

The native REPL's streaming model feeds provider tokens through `createStreamSegmenter`
(src/cli/repl/stream-segmenter.ts). The known "unclosed-fence + queue/flush" race:

**Scenario:** A streaming reply opens a ``` code fence but the turn ends (or is interrupted
by a tool call) before the closing ``` arrives. If flush() is not properly guarded, the
buffered fence content is discarded.

**Fix (F11-016):** The segmenter's `flush()` method explicitly handles unclosed fences —
it emits the accumulated block content immediately (even without a closing fence), then
resets to prose mode. This is surfaced via `createStreamOutputHandler()` in
`src/cli/repl/native-transport.ts`, which is the canonical unit-testable seam for
consumers of the native transport layer.

The fix is verified by unit tests in `tests/cli/repl/native-transport.test.ts` (Sprint 292,
Task 292-003).

---

## 4. Constraints

The acceptance of ink + react is scoped to the following invariants:

1. **Feature-gated**: The Ink REPL is only activated when the `--native` flag is present
   or `native_repl: true` is set in config (ADR-081). Headless and non-interactive paths
   are unaffected.

2. **String-free / i18n-first**: Ink components hold no hardcoded user-facing strings.
   All labels arrive via the `labels: ReplLabels` prop (injected by the caller via
   `getMessage`). Components are string-free by construction.

3. **No new React ecosystem pull**: No `react-router`, `zustand`, `redux`, or other
   React ecosystem packages. The Ink REPL uses only `ink`, `react`, and `react-dom`.
   Any future UI complexity must be solved within this constraint.

4. **ADR-010 amendment stays authoritative**: The inventory in ADR-010 (Amendment 2,
   Sprint 281) is the canonical list. This document is a rationale supplement, not an
   override. Any future change to ink/react versions must update the ADR-010 inventory.

---

## 5. Consequences

**Easier:**
- Terminal rendering is owned by the reconciler — no cursor math, no drift
- Multi-line replies, code blocks, and the confirm modal render correctly at any terminal height
- Component boundaries align with feature boundaries (input bar, static history, streaming partial, confirm modal)

**Harder:**
- Test environment needs React available (already in devDependencies for dashboard tests)
- Ink components cannot be unit-tested without a React render environment; business logic
  (segmenter, confirm queue, slash parsing) is kept outside React components for this reason

---

## 6. Alternatives Considered and Rejected

| Alternative | Reason for Rejection |
|-------------|---------------------|
| Keep raw-ANSI TUI | Sprint 1–223 proved it cannot scale to production native-feel |
| Build a custom React-for-CLI reconciler | Weeks of effort for no product benefit; ink is already proven in claude-code |
| Use Ink but vendor react internally | Package interop issues; security risk (vendored copy diverges); harder to upgrade |
| No native REPL (stay MCP-only) | ADR-081 product direction requires native agentic feel; MCP alone cannot deliver it |

---

## 7. References

- ADR-010 Amendment 2 (Sprint 281) — runtime dependency inventory
- ADR-081 — Native Agentic Deckent (`deckent` argümansız REPL)
- ADR-083 — REPL-UX-Evolution + Provider-Parity
- `src/cli/repl/stream-segmenter.ts` — segmenter implementation
- `src/cli/repl/native-transport.ts` — canonical streaming seam (createStreamOutputHandler)
- `tests/cli/repl/native-transport.test.ts` — fence/flush race unit tests (Sprint 292)
