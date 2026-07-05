# ADR-D-010: REPL Input Stabilization (Cursor / Queue / Streaming Contract)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=test-suite-only (`tests/cli/line-edit.test.ts`, `tests/cli/repl-input-queue.test.ts`, `tests/cli/repl/f11-016-stab.test.tsx`, `tests/cli/repl/term-compat-matrix.test.ts` — no runtime gate, no `lint:*` hook) → tomorrow=named follow-up tasks per KALAN-envanter item (§ below), each closing with its own targeted test before this ADR's Status graduates past `proposed`
**Status:** proposed (acceptance: Alperen) · **Date:** 2026-07-05 · **Absorbs:** — (new; consolidates the F11-016 line of work — Sprint 224 Ink migration, 360-009, 368-003, commit `2ddda01b` — under one governance record; no legacy ADR-NNN predecessor)
**Crosswalk:** — (new decision, no legacy ADR-NNN mapping)

> **Origin note:** MASTER-PLAN Row-62 (F11-016, "Ink REPL stabilizasyon (cursor/queue/streaming) + ADR") has carried an open ADR-ayağı since the row was created. This document is that ADR-ayağı: it records what F11-016 already shipped (Sprint 224 Ink migration, 360-009 render fixes, 368-003 input-queue core, and its `2ddda01b` app.tsx wire), states the behavior guarantees that stack of work actually provides today, and — per the ADR-G-019 authoring standard's demand for honesty — inventories what is explicitly **not yet** guaranteed rather than implying the row is closed.

---

## Context

The Ink REPL (`src/cli/repl/`) took its current shape in three stages, each closing a distinct class of instability:

1. **Sprint 224 — Ink migration.** The original hand-rolled raw-ANSI TUI could not deliver a native feel: "multi-line overwrite, broken queue, cursor drift" (`src/cli/repl/app.tsx:3-4`). Moving to Ink's full-frame reconciler — completed turns in `<Static>`, a pinned input always last — closed that *first* generation of cursor-drift bugs (terminal-level ANSI cursor mispositioning from manual overwrite).
2. **360-009 (F11-016-STAB slice).** Four further Ink-era bugs were found and fixed with pure, testable helper functions pulled out of the component (`confirmKeyToAnswer`, `buildSegmentTurns`, the `/clear`-recreates-segmenter fix, `truncateQueuePreview`) — `tests/cli/repl/f11-016-stab.test.tsx`.
3. **368-003 + `2ddda01b` (this ADR's direct subject).** The REPL's pending-input buffer was a raw `useRef<string[]>` FIFO with no contract beyond "push/shift." 368-003 extracted a pure, dependency-free `InputQueue` core (`src/cli/repl/input-queue.ts`) with a stated 4-item behavior contract (FIFO, no-loss, swallow, clear) and a full test suite (`tests/cli/repl-input-queue.test.ts`). Commit `2ddda01b` (2026-07-05) then wired that core into `app.tsx` at its 7 call sites, replacing the raw array end-to-end.

None of this work has a governance record. Row-62 explicitly asks for one ("+ ADR"), and the ADR-G-019 authoring standard requires every non-trivial dev decision to state **both** what shipped and what remains — exactly the gap here: the queue's contract is now solid and tested, but two adjacent claims the row's name implies ("cursor" and full "streaming" abort) are only partially true, and saying so plainly is the point of this document.

---

## Decision (Today)

### 1. The input-queue core (368-003)

`src/cli/repl/input-queue.ts` (`createInputQueue()`) is a pure, I/O-free, string-free FIFO. Its `EnqueueDecision` return shape (`{ kind: 'queued', position }` or `{ kind: 'swallowed', reason: 'empty' | 'duplicate-enter' }`, `input-queue.ts:28-30`) lets callers resolve any user-facing text themselves (i18n-first — the module owns no prose). Contract, as implemented and tested (`tests/cli/repl-input-queue.test.ts`):

```xml
<input-queue-contract source="src/cli/repl/input-queue.ts">
  <fifo>dequeue() returns lines in exact enqueue order (lines 67-71; suite "FIFO order preserved").</fifo>
  <no-loss>enqueue() always accepts non-swallowed input; nothing but clear() or a swallow
    removes a queued line — verified interleaved with in-flight dequeue (lines 54-65; suite
    "input arriving mid-drain is never lost").</no-loss>
  <swallow>blank/whitespace-only lines swallow as 'empty' (lines 55-58); an immediate repeat of
    the last successfully-queued TRIMMED text with no dequeue()/clear() in between swallows as
    'duplicate-enter' (lines 59-61) — this is the real "Enter fires twice for one keypress"
    terminal quirk, not a generic dedupe: the guard is purely positional (no Date.now()/timers,
    input-queue.ts:22-25), resets on both dequeue() and clear(), so a deliberately repeated
    command later is never permanently blocked.</swallow>
  <clear>clear() (ESC/cancel) empties the buffer AND resets the duplicate guard (lines 73-76) —
    the reset matters: without it, a genuine repeat right after a clear would misread as a
    double-fire and get silently swallowed.</clear>
</input-queue-contract>
```

### 2. The app.tsx wire (commit `2ddda01b`, 7 call sites)

The prior raw `useRef<string[]>` is replaced end-to-end by the `InputQueue` core, lazily constructed once (`app.tsx:653-654`, mirroring the existing `confirmQueue` lazy-init pattern in the same file). All 7 sites:

| # | Site | Line(s) | What changed |
|---|------|---------|--------------|
| 1 | `inputIter` drain-loop | `app.tsx:800-802` | `while (queue.current!.size() > 0) { dequeue(); setQueued(snapshot()) }` — same drain shape, now contract-backed |
| 2 | Turn-end steer-merge | `app.tsx:819-823` | `steerNotesToInputs()` output re-enqueued via `clear()` + `enqueue()` loop (steer notes must jump the existing queue — see behavior table below) |
| 3 | `cancelPendingInputs` (the injected busy-controls `Canceller`) | `app.tsx:897` | `queue.current!.clear()` |
| 4 | `/cancel` slash command | `app.tsx:905` | `queue.current!.clear()` |
| 5 | `/resume <id>` forward-to-loop | `app.tsx:965-966` | `queue.current!.enqueue(...)` |
| 6 | User line submission (`handleSubmit` tail) | `app.tsx:1016-1018` | `enqueue()`; **new** — a `'swallowed'` decision now short-circuits (`return`) *before* `setQueued`/wake, so a double-fired Enter no longer even triggers a re-render or wakes the drain loop (previously: every push always re-rendered) |
| 7 | Lazy construction | `app.tsx:653-654` | `useRef<InputQueue \| null>(null)` + `if (queue.current === null) queue.current = createInputQueue()` |

### 3. Shared lineage with `stream-segmenter.ts`

`input-queue.ts` and `stream-segmenter.ts` follow the *same* extraction discipline this REPL directory has used since Sprint 224: pull rendering-adjacent decision logic into a pure, dependency-free, fully-unit-tested core, and let the Ink component only hold the ref and call it (`chat-turn-queue.ts` and `busy-controls.ts` are the other two members of this family — see `busy-controls.ts:1-16`, which explicitly documents `chat-turn-queue.ts` as a read-only dependency for the same reason). This lineage matters directly to the inventory below: `stream-segmenter.ts` is the one module in the family that already solved the **code-point-safety** class of bug (§ KALAN-envanter item 1 states where the queue/cursor stack has not).

### 4. Behavior-guarantee table (cursor / queue / streaming)

| Dimension | Guarantee | Status | Evidence |
|---|---|---|---|
| Queue FIFO order | Lines dequeue in exact enqueue order | ✅ held | `input-queue.ts:67-71`; `tests/cli/repl-input-queue.test.ts` |
| Queue no-loss | Nothing silently drops a queued line | ✅ held | same, "input arriving mid-drain is never lost" |
| Queue double-fire-Enter | A duplicate immediate resubmission is swallowed, not double-queued | ✅ held | `input-queue.ts:59-61`; `app.tsx:1016-1017` |
| Queue ESC/cancel clear | `clear()` empties the queue AND resets the dup-guard | ✅ held | `input-queue.ts:73-76`; `app.tsx:897,905` |
| Steer-note ordering | Turn-end-drained `/steer` notes jump AHEAD of already-queued lines (steer, then FIFO among themselves) | ✅ held | `steerNotesToInputs()` (`app.tsx:287-289`); `app.tsx:819-823` |
| Streaming: segment-once emit | A completed prose line / fenced block emits exactly once into `<Static>` | ✅ held | `stream-segmenter.ts:56-115`; `tests/cli/repl/stream-segmenter-utf8.test.ts` |
| Streaming: `/clear` drops stale buffer | A recreated segmenter cannot resurface pre-clear partial text | ✅ held (360-009 FIX-3) | `tests/cli/repl/f11-016-stab.test.tsx:135-169` |
| Streaming: multi-byte UTF-8 chunk boundary | A code point split across a stream chunk is held, not bisected into U+FFFD | ✅ held | `stream-segmenter.ts:60-64,94-97`; `tests/cli/repl/stream-segmenter-utf8.test.ts` |
| Cursor: BMP-character editing | Insert/backspace/delete/left/right/Home/End are correct for single-UTF-16-unit characters (incl. Turkish ç/ğ/ı/İ/ö/ş/ü) | ✅ held | `line-edit.ts:57-82`; `tests/cli/line-edit.test.ts:20-23` ("inserts Turkish chars correctly") |
| Cursor: astral / surrogate-pair editing | Left/Right/Backspace/Delete move/remove one whole code point, never bisect a pair | ❌ **not held** — see KALAN-envanter (a) | `line-edit.ts:63-66,82` — code-unit arithmetic; no test exists |
| Queue-preview layout | Truncated preview line adapts to actual terminal width | ❌ **not held** — see KALAN-envanter (b) | `app.tsx:343-351` — fixed 60-col cap, self-documented as a known gap |
| Mid-turn abort | `/interrupt` (or Esc/Ctrl-C) stops the CURRENTLY STREAMING turn | ❌ **not held** — see KALAN-envanter (c) | `app.tsx:893-897`; `busy-controls.ts:92-110` |

---

## KALAN-envanter (honest, as of 2026-07-05)

Per ADR-G-019 §4 ("every ADR documents both today and tomorrow, transparently") and the project's no-tech-debt-by-default quality bar, F11-016's queue-half is solid and tested; the cursor-half and full mid-turn-abort claim the row's name implies are **not** yet delivered. Stated plainly, code-ref'd, so Row-62 is not silently marked closed on a partial win:

**(a) Cursor-drift — astral/surrogate-pair input is not code-point-safe.**
`editInput`'s left/right/backspace/delete cursor arithmetic operates on raw UTF-16 code-unit offsets (`line-edit.ts:63-66` — `cursor - 1` / `cursor + 1`; `line-edit.ts:82` — `cursor: cursor + text.length` counts `key.sequence.length` in code units). Any astral-plane character in the buffer (an emoji, e.g. `🎉` = a surrogate pair = 2 UTF-16 units) can be bisected by a single Left/Right/Backspace/Delete, leaving one buffer half holding a lone unpaired surrogate. `CaretText` (`input-bar.tsx:94-107`) then renders that state via `buffer.slice(cursor, cursor + 1)` — a straight code-unit slice — so the visible caret cell can land mid-pair, corrupting the rendered line. This is the *same class* of bug `stream-segmenter.ts` (its stateful `TextDecoder`, `stream-segmenter.ts:60-64,94-97`) and `truncateQueuePreview` (its `[...text]` code-point spread, `app.tsx:348-350`) were explicitly hardened against elsewhere in this same directory — line-edit.ts is the one core in the family that still has it. `tests/cli/line-edit.test.ts` covers only BMP text (`describe/it` list: printable-insert, Turkish chars, backspace/delete/left/right/Home/End, Ctrl-A/E/U/C/D, Enter, history-nav, multi-char paste, control-byte drop) — no emoji/surrogate-pair case exists today.

**(b) Cursor/layout-drift — queue-preview truncation ignores actual terminal width.**
`truncateQueuePreview` (`app.tsx:343-351`) hard-caps at 60 code points regardless of the real terminal width, and its own comment says so: *"Fixed 60-col width is a KNOWN resize gap — width-aware layout is a separate slice"* (`app.tsx:346-347`). This is inconsistent with the live-footer, which IS width-aware and resize-tested (`tests/cli/repl/term-compat-matrix.test.ts:78-109` — "a simulated live resize... truncates every field independently"). On a narrower terminal, a queue-preview row can still wrap or overflow unexpectedly relative to the frame Ink otherwise reconciles cleanly — a residual, code-acknowledged case of the "cursor drift" this whole line of work exists to close.

**(c) Mid-turn abort is loop-side, not yet delivered.**
`applyInterrupt` (`busy-controls.ts:92-110`) and its REPL-side `Canceller` (`cancelPendingInputs`, `app.tsx:897`) only clear the **not-yet-started** queued lines — they cannot stop a turn that is *currently* streaming from the provider. The `app.tsx:893-896` comment states this directly: *"no mid-turn provider-abort seam exists in runChatNativeLoop/nativeEngine yet, so 'interrupt' honestly cancels what it CAN... true mid-turn abort is loop-side follow-up work."* This is the 358-006 note this task was asked to carry forward honestly: a user pressing Esc/Ctrl-C or typing `/interrupt` while a reply is actively streaming gets a truthful no-op-on-the-live-turn (idempotent, per `busy-controls.ts:98-104`), not a real cancel — the streaming turn runs to completion regardless.

---

## Intent / Roadmap (Tomorrow)

- **Code-point-safe cursor arithmetic (closes KALAN (a)):** rewrite `line-edit.ts`'s left/right/backspace/delete/insert paths to operate over `[...buffer]` code points (mirroring `truncateQueuePreview`'s existing pattern in the same file tree) rather than raw string indices; extend `CaretText` (`input-bar.tsx:94-107`) accordingly; add an emoji/surrogate-pair suite to `tests/cli/line-edit.test.ts` alongside the existing Turkish-char case. Not yet filed as a MASTER-PLAN task.
- **Width-aware queue-preview (closes KALAN (b)):** extend the live-footer's existing width-aware truncation approach (`buildLiveFooter`, exercised by `term-compat-matrix.test.ts`) to `truncateQueuePreview`, replacing the fixed 60-col cap with the terminal's live `columns`. Not yet filed.
- **Loop-side mid-turn abort (closes KALAN (c)):** a real provider-abort seam in `runChatNativeLoop`/`nativeEngine` (an `AbortController`-shaped cancel token threaded through the active stream call), then `applyInterrupt`'s `Canceller` upgraded from "clear pending queue only" to "abort the live stream AND clear pending queue." This is the largest of the three — it touches the provider/engine boundary, not just `src/cli/repl/`, so it is out of this ADR's own write-scope and is recorded here as the roadmap item, not implemented.
- **Enforcement graduation:** once each KALAN item above closes with its own task + targeted test, this ADR's `Status` graduates from `proposed` toward `accepted`, and its behavior-guarantee table's `❌` rows flip to `✅` with the closing evidence appended — not a rewrite of the table, an update to it (ADR-G-019 today/tomorrow discipline: the record evolves, it does not get replaced).

---

## Consequences

**(+)** The REPL's pending-input buffer now has a *stated, tested* contract (FIFO/no-loss/swallow/clear) instead of an implicit raw-array behavior nobody had written down — `2ddda01b`'s 7-site wire means every caller in `app.tsx` goes through that one contract, not a hand-rolled `push`/`shift`. The double-fire-Enter fix additionally now short-circuits BEFORE the wake/re-render (`app.tsx:1016-1017`), closing a real quirk, not just masking its symptom. Steer-note turn-end ordering is explicit and tested. Row-62's queue-half and streaming-segment-half are genuinely solid.

**(−)** Row-62's own name ("cursor/queue/streaming") is only two-thirds delivered: the cursor half has a real, code-confirmed, untested gap for any non-BMP character (KALAN (a)), and a second, self-acknowledged layout gap (KALAN (b)). The "streaming" half's mid-turn-abort claim is honestly *not* met — `/interrupt` today only prevents not-yet-started queued work from running, exactly as the existing `app.tsx:893-896` comment already discloses; this ADR does not change that behavior, it only puts it on the record with a named roadmap item. This document's own `Status: proposed` reflects that: it records a real, dated snapshot of a partially-complete stabilization effort, not a closed one.

---

## References / Absorbed

- **Absorbs:** — (new; consolidates Sprint-224 Ink migration + 360-009 (F11-016-STAB) + 368-003 (input-queue core) + commit `2ddda01b` (app.tsx wire) under one governance record; no legacy ADR-NNN predecessor).
- **Evidence:** commit `2ddda01b` (feat(repl): F11-016 — input-queue app.tsx'e wired) · `src/cli/repl/input-queue.ts` · `src/cli/repl/app.tsx` (lines 3-4, 343-351, 653-654, 800-823, 893-897, 905, 965-966, 1016-1018) · `src/cli/repl/stream-segmenter.ts` · `src/cli/repl/busy-controls.ts` (lines 92-110) · `src/cli/repl/line-edit.ts` (lines 57-82) · `src/cli/repl/input-bar.tsx` (lines 94-107) · `tests/cli/repl-input-queue.test.ts` · `tests/cli/repl/f11-016-stab.test.tsx` · `tests/cli/repl/term-compat-matrix.test.ts` · `tests/cli/line-edit.test.ts` · `tests/cli/repl/stream-segmenter-utf8.test.ts`.
- **Cross-ref:** ADR-G-019 (ADR Governance & 4-Layer Taxonomy — the authoring standard this document follows) · ADR-G-009 (Evaluation Integrity — the honest-inventory principle applied to the KALAN-envanter section) · ADR-D-009 (Worker-Result Boundary Normalization — the most recent sibling ADR-D, same "document a just-shipped commit's policy, proposed status, today+tomorrow" shape this document follows).
- **MASTER-PLAN:** Row-62 (F11-016, TERM, P1) — this document is that row's "+ ADR" deliverable; the row itself stays 🟡 (not closed) until the three KALAN-envanter items above are filed and closed.
- **Born work-items (not yet filed in MASTER-PLAN):** code-point-safe `line-edit.ts` cursor arithmetic + emoji test suite (closes KALAN (a)) · width-aware `truncateQueuePreview` (closes KALAN (b)) · loop-side provider-abort seam for `runChatNativeLoop`/`nativeEngine` (closes KALAN (c), largest scope — touches the provider/engine boundary, not just `src/cli/repl/`).
