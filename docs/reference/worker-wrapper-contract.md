# Worker Wrapper Behavior Contract

The **wrapper** is the generated shell script (docker) or generated inline shell command
(tmux/host) that a spawn backend wraps around the actual worker CLI invocation
(`claude -p - …`, `codex exec …`, `gemini …`). It exists to guarantee a `.result` file is
**always** produced — even when the worker CLI crashes, is OOM-killed, or times out — so a
sprint never stalls waiting on a task that will never finish.

This document is the **behavior contract** for six load-bearing wrapper guarantees. Each was
introduced to close a specific historical failure mode (`born-4xx` markers below); a future
change to either wrapper generator MUST preserve every row of the table in
[§ The 6-behavior contract](#the-6-behavior-contract), verified by the regression test listed
in its row. It cross-references the Sprint-360 POSIX/portability audit
([`docs/analysis/wrapper-posix-audit-360.md`](https://github.com/VerhexIO/deckent/blob/main/docs/analysis/wrapper-posix-audit-360.md)), which
re-verified these fixes by running the actual shell semantics rather than reading source.

**Honest numbering note:** the task family driving this document names markers
"466-473-468". The Sprint-360 audit already established (and this document confirms by
re-grepping the current tree) that **no `born-473` marker exists** anywhere in `src/`,
`tests/`, or `.tasks/` — the four markers actually present across both wrapper files are
**born-466, born-467, born-468, born-471**. This document documents the fixes that exist
rather than inventing a 473 mapping.

Line numbers below are current against the tree at HEAD (sprint-365); they supersede the
Sprint-360 audit's line numbers where the two differ (the files have grown since commit
`06947b09`, but the referenced logic itself is unchanged unless a row says otherwise).

---

## Generators — which module produces which wrapper

| Backend | Generator | Invocation site | Shape |
|---|---|---|---|
| **docker** | `src/orchestra/spawn-backend-docker.ts` — `DockerSpawnBackend.spawn()` | writes a POSIX `sh` script to `.tasks/.worker-<taskId>.sh` (`spawn-backend-docker.ts:1003-1065`), run via `sh <path>` inside the container | full multi-function script: `fsync_file`, `on_exit`, HB-gate loop, EXIT/TERM traps, `timeout -k 30` |
| **tmux/host** | `src/orchestra/tmux.ts` — `buildWorkerCommand()` (`tmux.ts:175-222`) | `spawnWorker()` (`tmux.ts:241-274`) sends the built command via `tmux send-keys` (`tmux.ts:259-264`); also reused by `startAuditor()` (`tmux.ts:333-349`) and by `TmuxBackend.spawn()` (`spawn-backend.ts:133-160`) | single inline `RFILE=…; trap … EXIT; timeout -k 30 … ; CLAUDE_EXIT=$? ; …` command string |
| **subprocess** | `providers/subprocess.ts` (per `spawn-backend.ts:291-360` comments) | `SubprocessBackend.spawn()` (`spawn-backend.ts:334-348`) delegates to a per-provider `SubprocessSpawnBackend` | **out of this document's read scope** (`src/providers/` is not in `docs/reference/`'s sibling read-scope for this task) — its exit/timeout/trap contract is **not verified here**. Treat it as an open gap, not an assumed parity, until a follow-up task reads `providers/subprocess.ts` directly. |

`src/orchestra/spawn-backend-subprocess.ts` (124 lines) is unrelated to wrapper generation —
it is the provider-agnostic JSONL stream-capture module (`captureStreamToLog`), not a spawn
backend.

---

## The 6-behavior contract

| # | Behavior | born-item | docker (`spawn-backend-docker.ts`) | tmux/host (`tmux.ts`) | Regression test |
|---|---|---|---|---|---|
| 1 | Exit-code capture (no `$?` masking) | born-466 | `:1059-1060` (`CLAUDE_EXIT=$?` right after the worker command); read back at `:214` (`local exit_code=${CLAUDE_EXIT:-$?}`) | `:219` (`CLAUDE_EXIT=$?` right after the `timeout … sh -c '…'`) | `tests/orchestra/tmux-timeout-parity.test.ts:32`; `tests/orchestra/docker-exit-marker.test.ts` (`buildOnExitTrap` block, `:180-`) |
| 2 | Timeout-purity — only `124`/`137` write `.timeout`, and never over an existing `.result` | born-466 | `:1061` | `:219` | `tests/orchestra/tmux-timeout-parity.test.ts:42` (gate on 124/137), `:48` (never over existing `.result`) |
| 3 | `TERM` → explicit `exit 143` (not `0`) | born-466 | `:1044` (`trap 'fsync_file "$RFILE"; fsync_file "$HBFILE"; exit 143' TERM`) | **not implemented** — see [§3](#3-term--exit-143) | — (no tmux-side test; nothing to regress-guard) |
| 4 | HB-staleness-gate (skip-write if fresh; atomic tmp+mv otherwise) | born-468 | `buildHeartbeatGateFn` `:658-677`, driver `buildHeartbeatWrapperLoop` `:684-689`, threshold constant `:56` | **not implemented** — see [§4](#4-hb-staleness-gate) | `tests/orchestra/wrapper-hb-allowlist.test.ts:136-285` |
| 5 | Untracked-diff union (`git diff` ∪ `git ls-files --others`) | born-467 | `:244` | **not implemented** — see [§5](#5-untracked-diff-union) | `tests/orchestra/docker-exit-marker.test.ts` (`TIMEOUT_WITH_WORK` / `workPresent` cases, `:128-171`) |
| 6 | Allowlist-SSOT re-derivation (`filesWrite` sole authority) | born-471 | `buildDockerAllowedTools` `:727-733` | **not implemented** — see [§6](#6-allowlist-ssot-re-derivation) | `tests/orchestra/wrapper-hb-allowlist.test.ts:59-134` |

Rows 3, 4, 5, 6 are **docker-only**. This is not an oversight to silently "fix" in a future
wrapper change without reading the rest of this document — §3-§6 below explain what the tmux
backend does instead (if anything) and what a change must NOT assume.

---

### 1. Exit-code capture

**Invariant:** the wrapper's cleanup/trap logic must read the worker CLI's REAL exit code,
never a later command's `$?` (e.g. `rm`, `echo`, or the trap dispatcher itself silently
resetting it to `0`).

**Why:** pre-born-466, `on_exit`/the tmux fallback trap read `$?` at the point the trap body
executed — by then an intermediate `rm -f`/`echo` had already overwritten it, so a killed or
crashed worker was misclassified as a clean exit.

**Docker:** `CLAUDE_EXIT=$?` is captured on the line **immediately** after
`timeout -k 30 $TIMEOUT ${workerCmd}` (`spawn-backend-docker.ts:1059-1060`); `on_exit`
(`:208-302`) reads it via `local exit_code=${CLAUDE_EXIT:-$?}` at `:214` — the `${CLAUDE_EXIT:-$?}`
form falls back to `$?` only if `CLAUDE_EXIT` was never set (defensive, not the primary path).

**tmux:** identical shape — `CLAUDE_EXIT=$?` immediately follows the `timeout -k 30 …`
invocation (`tmux.ts:219`).

**POSIX-audit-360 cross-ref:** Part A row 1 (`born-466 — $? masking`) — confirmed correct by
running the actual shell (`[verified-by-run]`), not just read.

---

### 2. Timeout-purity (124 / 137 only)

**Invariant:** the `.timeout` marker is written **only** when the worker's exit code is `124`
(GNU `timeout`'s own TERM) or `137` (`128+9`, the `-k 30` hard-KILL) — a CLI-arg error or any
other non-zero crash must NOT be misclassified as a timeout — **and never** when a real
`.result` already exists (a worker that finished just as the clock ran out must not have its
successful result overwritten by a stale timeout marker).

**Docker:** `spawn-backend-docker.ts:1061` —
`if [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ]; then [ ! -f "$RFILE" ] && echo "WORKER_TIMEOUT" > "…timeout"; fi`.

**tmux:** `tmux.ts:219`, byte-identical gate shape:
`if [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ]; then [ ! -f "${resultFile}" ] && echo "WORKER_TIMEOUT" > "${timeoutMarker}"; fi`.

**POSIX-audit-360 cross-ref:** Part A row 3 (`.timeout` marker is timeout-PURE) — confirmed.

---

### 3. TERM → `exit 143`

**Invariant:** when the wrapper receives `SIGTERM` (a graceful stop), it must fsync any
already-written `.result`/heartbeat **and** exit with code `143` (`128+15`) — never `0`. Exit
`0` would let `on_exit` classify a mid-work stop as a clean run, discarding the
`TIMEOUT_WITH_WORK` reconciliation path.

**Docker:** a dedicated top-level trap —
`trap 'fsync_file "$RFILE"; fsync_file "$HBFILE"; exit 143' TERM` (`spawn-backend-docker.ts:1044`)
— fires as soon as the container-level `SIGTERM` lands (sent by `kill()`'s
`docker stop --time=<grace>`, `:1450-1466`), independent of and prior to the generic
`trap on_exit EXIT` (`:1040`).

**tmux — not implemented, and not equivalent by default:** `tmux.ts` defines only a single
generic `trap '[ -f $RFILE ] || echo … > $RFILE' EXIT` (`:212-214`) — there is **no**
`TERM`-specific trap, **no explicit `exit 143`**, and **no `fsync_file` call anywhere in
`tmux.ts`** (the docker-only `fsync_file()` helper, `spawn-backend-docker.ts:1026`, has no
tmux counterpart). Per-worker kill for this backend is `killWorker()` →
`tmux kill-window` (`tmux.ts:276-280`), which delivers **`SIGHUP`, not `SIGTERM`**, with no
grace period and no docker-stop-style wait. A POSIX `sh`'s default `EXIT` trap still fires on
signal death, so the RFILE fallback will still write if `.result` is missing — but there is no
urgent pre-kill fsync of an already-written-but-not-yet-durable `.result`/heartbeat. **A
future change must not assume the tmux/host backend has docker's TERM-fsync durability
guarantee** — it doesn't, and closing that gap (mirroring `:1044`'s trap + adding
`fsync_file` to `tmux.ts`) is an open improvement, not yet a regression to protect.

---

### 4. HB-staleness-gate

**Invariant:** the wrapper's own background heartbeat tick must **never clobber** a richer
heartbeat the worker itself just wrote. It must check the on-disk heartbeat's mtime and
skip the write if younger than the staleness threshold; when it does write, the write itself
must be atomic (no reader ever observes a torn/partial heartbeat file).

**Docker:** `buildHeartbeatGateFn` (`spawn-backend-docker.ts:658-677`):
- `hb_mtime=$(stat -c %Y "$HBFILE" 2>/dev/null || echo 0)` (`:663`)
- skip-write early return when `hb_age < WRAPPER_HB_STALE_THRESHOLD_SECONDS` (`:666-670`;
  threshold `= 40`, `:56`)
- otherwise atomic `tmp+mv` in the same directory (`:672-674`) — a single `rename()` syscall,
  so a concurrent reader (auditor stale-worker scan) never sees a torn write.
`buildHeartbeatWrapperLoop` (`:684-689`) drives this every 15s in the background (`:687`).

**tmux — not implemented:** `tmux.ts` has no equivalent background heartbeat loop at all —
the wrapper relies entirely on the worker CLI itself to write `.hb`. There is no
"wrapper safety-net heartbeat" for this backend, so a tmux-spawned worker that stops updating
its own heartbeat (without dying) will look stale to the auditor with no wrapper-side fallback
tick — this is a real (pre-existing, undocumented before now) parity gap, not something this
document introduces.

**POSIX-audit-360 cross-ref (F2, LOW/latent, `spawn-backend-docker.ts:663`):** the
`stat -c %Y … || echo 0` fallback is **backwards** if `stat -c` is ever unavailable (a
BSD-`stat` base image) — a failed read yields `hb_mtime=0`, so `hb_age` is always huge and the
gate **always** rewrites, reintroducing the exact clobber born-468 fixed. Not an active bug
on the shipped Alpine/BusyBox image (BusyBox `stat` supports `-c`), but any change to the base
image must re-verify this before shipping, or fix the fallback to bias toward "assume fresh"
(`hb_now` instead of `0`) per the audit's suggestion.

---

### 5. Untracked-diff union

**Invariant:** "did the worker do any work before dying" must be computed from the union of
tracked changes (`git diff --name-only`) **and** new untracked-but-not-ignored files
(`git ls-files --others --exclude-standard`) — tracked-diff alone misses brand-new files,
which is the common case (most deckent tasks create new test files).

**Docker:** `spawn-backend-docker.ts:244` —
```
changed_files=$({ git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u || true)
```
feeds both the `TIMEOUT_WITH_WORK` marker (`:267-269`) and the enriched
`EXIT_WITHOUT_RESULT` marker's `workPresent`/`diffStat` fields (`:277-293`).

**tmux — not implemented:** the tmux/host fallback trap (`:212-214`) writes a single **static**
fallback JSON (`fallbackJson`, built once at `:207-211` in `buildWorkerCommand`) with
`filesChanged: []` unconditionally — it never inspects `git diff` or `git ls-files` at all. A
tmux-spawned worker that dies after creating new files gets a blind NO_GO with no
`workPresent`/`TIMEOUT_WITH_WORK` signal; Brain's FIX-phase reconciliation
(`docs: Spurious NO_GO helper`) has nothing to reconcile from for this backend today.

**POSIX-audit-360 cross-ref:** Part A row 4 (`born-467 — untracked NEW files counted`) —
confirmed by run (`[verified-by-run]`: a new untracked `b.new.txt` is missed by
`git diff --name-only` alone, surfaced by the union). Also see **F5** (LOW,
`spawn-backend-docker.ts:258`, filename→JSON escaping vs. git `core.quotePath` — safe,
cosmetic-only for pathological filenames) and **F7** (INFO, `:280`, `diffStat`'s narrower
`tr -d '"'` escaping vs. `filesChanged`'s full `\`+`"` escaping — safe because
`git diff --shortstat` output is fixed-format ASCII).

---

### 6. Allowlist-SSOT re-derivation

**Invariant:** once a task's `scope.filesWrite` is a non-empty list, it is the **sole**
`Write()`/`Edit()` authority passed to the worker CLI's `--allowedTools` — `scope.directories`
(read/context scope) must NOT also grant Write/Edit, even though a directory listed there is
readable. A scope with neither `directories` nor `filesWrite` must narrow to `.tasks/` only,
never fall open to an unrestricted grant.

**Docker:** `buildDockerAllowedTools` (`spawn-backend-docker.ts:727-733`) re-derives the
allowlist from the task's own on-disk scope, independent of whatever `opts.allowedTools` the
caller computed:
- `filesWrite` non-empty → sole write authority (`directories` excluded)
- `filesWrite` empty, `directories` present → `directories` become the write-fallback target
- neither present → narrows to `.tasks/` only
- `.tasks/` is always included (heartbeat/result write authority)

**tmux — not implemented:** `TmuxBackend.spawn()` (`spawn-backend.ts:133-160`) passes
`opts?.allowedTools` straight through to `tmuxSpawnWorker`/`buildWorkerCommand`
(`spawn-backend.ts:155`, consumed at `tmux.ts:129-132`) with **no re-derivation** — whatever
allowlist string the caller (e.g. `sprint-spawner.ts`, out of this doc's write scope) computed
upstream is trusted as-is. If that upstream computation ever regresses to the pre-born-471
"merge directories into Write/Edit unconditionally" bug, the tmux backend has **no
independent SSOT check to catch it** — docker does.

**POSIX-audit-360 cross-ref:** Part A row 5 (`born-471 — allowlist SSOT re-derivation`) —
confirmed correct; "never falls open to unrestricted Write/Edit" independently verified.

---

## Cross-reference index — POSIX-audit-360 findings not already covered above

| ID | Severity | Current location | Status |
|---|---|---|---|
| F1 | **MEDIUM** | `tmux.ts:212-214` (was `:149` at audit time) — unquoted `$RFILE` in the fallback trap (`RFILE=${resultFile}`, `[ -f $RFILE ]`, `> $RFILE`) | **Still open** — re-verified present in the current tree. Breaks on host paths containing spaces (Law-2 EVERY ENVIRONMENT violation on macOS/Windows-WSL). Highest-priority follow-up item from the audit; not addressed by any commit since. |
| F4 | LOW | `spawn-backend-docker.ts:1035` (was `:969`) — `PARTIALEOF` here-doc uses an unquoted delimiter for a body needing no expansion | Still open; low-priority (inputs are already `validateTaskId`-checked / registry-sourced). |
| F6 | LOW | `spawn-backend-docker.ts:226-230` last-chance wait, coupled to `kill()`'s `docker stop --time=<grace>` (`:1450-1458`, default grace `15`, `DEFAULT_GRACEFUL_TIMEOUT_SECONDS`) | Still open; the 5s wait budget is safe only because the default grace exceeds it — undocumented coupling at the wait site itself. |
| F8 | LOW | `spawn-backend-docker.ts:1049` (`HB_PID=$!`, assigned after `trap on_exit EXIT` is armed at `:1040`) + `kill $HB_PID` at `:220`, `:235`, `:299` | Still open; near-zero-probability race + a cosmetic orphaned-`sleep` child on kill. |

F2, F3, F5, F7 are covered inline in §4/§3/§5/§5 above (they map directly onto a contract
row). F1/F4/F6/F8 don't correspond to one of the 6 named behaviors, so they're indexed here
instead — any future change touching the lines above should re-read the audit's full
rationale before touching them.

---

## For future wrapper changes

Before modifying either generator, re-verify each row still holds and re-run its listed test:

1. Exit-code capture — `CLAUDE_EXIT` must be read, never bare `$?`, after any refactor of the
   trap/cleanup ordering. → `tmux-timeout-parity.test.ts`, `docker-exit-marker.test.ts`.
2. Timeout-purity — the `124`/`137` gate + `[ ! -f "$RFILE" ]` guard must stay together; don't
   let a refactor split them onto different conditions. → `tmux-timeout-parity.test.ts`.
3. TERM-143 — if you add TERM-trap/fsync parity to the tmux backend, add it as a **new**
   contract row (not a silent edit to this one) and add a tmux-side regression test alongside
   `tests/orchestra/tmux-timeout-parity.test.ts`.
4. HB-staleness-gate — any base-image change (docker) must re-verify `stat -c %Y` support
   before assuming F2 stays latent. → `wrapper-hb-allowlist.test.ts`.
5. Untracked-diff — keep the `git diff` ∪ `git ls-files --others --exclude-standard` union;
   don't revert to tracked-diff-only. → `docker-exit-marker.test.ts`.
6. Allowlist-SSOT — `filesWrite` must remain the sole authority when non-empty; don't
   reintroduce a `directories`-merge path. → `wrapper-hb-allowlist.test.ts`.

Any change to `tmux.ts:212-214` should also close **F1** (quote `$RFILE`) rather than leaving
it for a separate task, since both are the same three lines.
