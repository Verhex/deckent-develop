# ADR-090 (Ink): Ink ^7 + React ^19 as Runtime Dependencies for Native REPL

**Status:** accepted

**Date:** 2026-06-19

**Related:** ADR-010 (Tek Runtime Dependency), ADR-081 (Native Agentic REPL), ADR-083 (REPL-UX-Provider-Parity), ADR-086 (Native CLI Parity)

---

## Context

Sprint 224 landed the native Ink REPL (`src/cli/repl/`). The Ink renderer (`ink ^7`) and React (`react ^19`) are full-frame reconciled TUI frameworks — the only viable approach to solving the hand-rolled ANSI TUI failures (cursor drift, broken confirm queue, broken multi-line overwrite). The decision was recorded in ADR-081/083 but without an explicit dependency-rationale entry covering the ADR-010 exemption justification.

ADR-010 (amended Sprint 281) already lists `ink`, `react`, and `react-dom` in the runtime dependency inventory and references ADR-081/083 as governing ADRs. This ADR documents the design rationale for the exemption and the integration contract, complementing that amendment.

---

## Decision

Accept `ink ^7` and `react ^19` (`react-dom ^19`) as runtime dependencies, exempt from the "minimal + ADR-justified" principle in ADR-010, under the following justification:

1. **No viable alternative at this scope.** A hand-rolled raw-ANSI TUI was tried (pre-Sprint 224) and produced cursor drift, broken multi-line overwrite, and a single-slot confirm resolver that dropped concurrent tool calls. Fixing these at parity with Ink would require reimplementing Ink (full-frame reconciler, <Static> scrollback management, raw-mode stdin handling, cross-platform terminal probing). That would itself become a de-facto runtime dependency with more surface area than Ink.

2. **ADR-010 exemption criteria met.** ADR-010 Amendment (Sprint 281) states: "each runtime dependency must be traceable to an accepted ADR." ADR-081 (Native Agentic REPL) and ADR-083 (REPL-UX-Provider-Parity) govern the native REPL feature set. `ink`/`react`/`react-dom` are directly required by those ADRs.

3. **Additive, flag-gated, not affecting non-REPL paths.** The Ink renderer is only mounted by `runInkRepl()` in `src/cli/repl/run.tsx`. The MCP server, sprint engine, and non-interactive CLI paths never import Ink. The dependency footprint is isolated.

4. **Peer/de-facto standard.** Claude Code itself uses Ink for its TUI. The versions (`ink ^7`, `react ^19`) track the Claude Code baseline, reducing long-term divergence risk.

---

## Stream-Segmenter Integration Contract

The `createStreamSegmenter` (`src/cli/repl/stream-segmenter.ts`) is the boundary between the streaming token output and the Ink renderer:

- **Completed units** (prose lines, finished code/table blocks) are emitted into `<Static>` via `pushSegment` → flow into terminal scrollback immediately (readable in real time).
- **In-progress partial** line is held in the dynamic region (one line max — no tall re-render, no drift).
- **fenceGuard**: an unclosed code fence (stream ends mid-block or a runaway block exceeds `MAX_CODE_BLOCK_LINES = 200`) is auto-flushed. Named `fenceGuard` in the source for grep/test anchoring.
- **flush()**: called at turn-end; emits any buffered partial line or open code/table block. Safe for the "yarım fence" case (stream ends with ```` ``` ```` but no closing fence).

---

## ConfirmQueue Integration Contract

`createConfirmQueue` (`src/cli/repl/app.tsx`) is the FIFO queue for tool-confirm modals:

- **Never overwrites**: a new `enqueue()` while a head is active appends and waits — the H1 single-slot race (pre-Sprint 285) is eliminated.
- **'a' (always) cascade**: answering the head with 'a' auto-resolves same-`toolName` items already in the queue (claude-code "always allow" UX, without re-prompting the user for the same tool type).
- **'n' (deny) no-cascade**: denial of one card does not cancel the remaining queue.
- **onChange hook**: each `enqueue` and `answer` fires `onChange()` → React `setState` → Ink re-render. The queue itself is a plain JS object (no React state) for deterministic synchronous mutation.

---

## Consequences (+)

- Full-frame reconciled TUI: completed reply segments render in native scrollback; cursor never drifts.
- ConfirmQueue is race-free for sequential and concurrent tool-call bursts.
- REPL stabilize tests (`tests/cli/repl/ink-stabilize.test.ts`) cover fence-guard and queue burst paths hermetially.
- claude-code baseline alignment reduces future maintenance.

## Consequences (−)

- `ink` + `react` + `react-dom` add ~3 MB to the installed footprint.
- Ink's stdin raw-mode requires a real TTY; `deckent chat` in non-interactive pipe mode falls back to the legacy `runChatNativeLoop` path (no Ink).
- React's reconciler version is pinned to `^19` (tracks `ink ^7` peer requirement); upgrading Ink major version requires React upgrade coordination.

---

## References

- `src/cli/repl/stream-segmenter.ts` — `fenceGuard`, `createStreamSegmenter`
- `src/cli/repl/app.tsx` — `createConfirmQueue`, `ConfirmQueue`
- `src/cli/repl/run.tsx` — `runInkRepl`, provider/confirm wiring
- `tests/cli/repl/ink-stabilize.test.ts` — hermetic proof-of-function for this ADR
- ADR-010 Amendment (Sprint 281): `docs/adr/010-tek-runtime-dependency-commander-js.md`
- ADR-081: `docs/adr/081-native-agentic-deckent.md`
- ADR-083: `docs/adr/083-repl-ux-provider-parity-local-model.md`
