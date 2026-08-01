# Wrapper-sh POSIX / Portability Audit — Sprint 360 (CODEX-DOGFOOD-B)

**Task:** 360-015 — İKİNCİ-GÖZ (second-eye) cross-validation of the Fable analysis.
**Scope of read:** `src/orchestra/spawn-backend-docker.ts` (generated container wrapper) and
`src/orchestra/tmux.ts` (generated host wrapper).
**Nature:** audit-only. Every item below is a **suggestion** — no source was modified
(`nogo: src değişikliği`). Line references are against the tree at commit `06947b09`.

Each finding carries a severity (`HIGH` / `MEDIUM` / `LOW` / `INFO`), the exact
`file:line`, a one-line impact, and a fix suggestion. Load-bearing claims were verified by
running the actual shell snippets (`sh`/BusyBox semantics), not asserted from reading —
those carry a **[verified-by-run]** tag.

---

## Part A — Verification of the born-46x/47x fixes (regression re-check)

The original task asked for verification of the born-466/467/473 fixes. The two files
carry these born markers (enumerated via `grep -onE 'born-4[0-9][0-9]'`):
**466, 467, 468, 471**. There is **no `born-473` marker** in either file, and `born-473`
appears nowhere in `src/`, `tests/`, or the sprint-359 commit body (which lists 465, 466,
468, 469, 470, 471). Honest note: born-473 is either a mis-numbered reference in the task
text or was closed outside these two wrapper files — I verified the four fixes that are
actually present rather than inventing a 473 mapping.

| Fix | Location | Verdict | Evidence |
|-----|----------|---------|----------|
| **born-466** — `$?` masking (capture real worker exit code) | `spawn-backend-docker.ts:214`, `:994`; `tmux.ts:154` | ✅ CORRECT | `CLAUDE_EXIT=$?` is captured on the line *immediately* after the `timeout … workerCmd` line (`:993→:994`); `on_exit` reads `local exit_code=${CLAUDE_EXIT:-$?}`. **[verified-by-run]** `${CLAUDE_EXIT:-$?}` returns the captured `42`, not the trap-entry `$?`. |
| **born-466** — TERM trap exits `143`, not `0` | `spawn-backend-docker.ts:978` | ✅ CORRECT | `trap 'fsync…; exit 143' TERM` — a docker-stop no longer masquerades as a clean run. `143 = 128+15`, matching the sh-portability skill. |
| **born-466** — `.timeout` marker is timeout-PURE | `spawn-backend-docker.ts:995`; `tmux.ts:154` | ✅ CORRECT | Marker written only when `CLAUDE_EXIT` is `124` (GNU timeout TERM) **or** `137` (128+9 KILL) **and** no `.result` exists — a CLI-arg crash is no longer misclassified as a timeout. |
| **born-467** — untracked NEW files counted | `spawn-backend-docker.ts:244` | ✅ CORRECT | `{ git diff --name-only; git ls-files --others --exclude-standard; } \| sort -u`. **[verified-by-run]** a new untracked `b.new.txt` is MISSED by `git diff --name-only` alone and SURFACED by the union — exactly the born-467 failure mode. |
| **born-468** — heartbeat staleness gate + atomic write | `spawn-backend-docker.ts:622-641` | ✅ CORRECT (with latent caveat — see F2) | Gate returns early when the on-disk HB is younger than `WRAPPER_HB_STALE_THRESHOLD_SECONDS` (40); the fallback write is `tmp+mv` in the **same directory** ⇒ a single atomic `rename()`, so an auditor reader never sees a torn write. |
| **born-471** — allowlist SSOT re-derivation | `spawn-backend-docker.ts:691-697` | ✅ CORRECT | `buildDockerAllowedTools` re-derives Write/Edit targets from the task's own on-disk scope; `filesWrite` present ⇒ sole authority, `.tasks/` always included, never falls open to unrestricted Write/Edit. |
| **tmux 466-parity** — `-k 30` + explicit capture | `tmux.ts:150-154` | ✅ CORRECT | The host wrapper mirrors the docker `timeout -k 30 … ; CLAUDE_EXIT=$? ; 124/137-gated marker` shape. Covered by `tmux-timeout-parity.test.ts` (8/8 green). |

**Design choices independently confirmed correct** (these are the parts most likely to have
been reintroduced wrong by a third backend):

- **`while … read` reads from a HERE-DOC, never a pipe** (`spawn-backend-docker.ts:250-262`,
  delimiter `<<GITEOF`). A pipe-into-`while` runs the loop body in a subshell and the
  accumulated `json_array` would be **lost**. **[verified-by-run]** the here-doc form yields
  `["x","y","z"]` (survives); the pipe form yields an empty `[` (lost). This is the correct,
  non-obvious POSIX choice.
- **Escaping uses `printf "%s"`, not `echo`** (`spawn-backend-docker.ts:258`) — avoids
  backslash interpretation differences between `echo` implementations.
- **`fsync_file` is dependency-free** (`spawn-backend-docker.ts:960`) — `dd conv=fsync` + `mv`,
  no python/perl, correct for the Alpine/BusyBox base image.

**Targeted regression suite** (corroboration, not the DoD): `wrapper-hb-allowlist.test.ts`,
`tmux-timeout-parity.test.ts`, `spawn-backend-docker.test.ts` → **47/47 passing**.

---

## Part B — Residual findings (suggestions; no code changed)

### F1 — MEDIUM · `tmux.ts:149` · unquoted `$RFILE` breaks on host paths containing spaces
`const trap = \`RFILE=${resultFile}; trap '[ -f $RFILE ] || echo …' EXIT\``

The host-side fallback trap interpolates `resultFile` **unquoted** in three places: the
assignment `RFILE=${resultFile}`, the test `[ -f $RFILE ]`, and the redirect `> $RFILE`.
`resultFile` is host-derived (`join(tasksDir, …)`) and on macOS/Windows commonly contains
spaces (`/Users/x/My Project/.tasks/…`, `C:\Users\…\My Documents\…` under WSL).

- **[verified-by-run]** with `resultFile="/my project/.tasks/x.result"`, the generated
  `RFILE=/my project/…` makes `sh` word-split the assignment: it sets `RFILE=/my` and then
  tries to **execute** `project/.tasks/x.result` → `sh: project/.tasks/x.result: not found`.
  The whole fallback-result mechanism silently fails to write, re-opening the exact
  "worker exits without `.result` → sprint stalls" hole this trap exists to close.
- Contrast: the docker wrapper quotes `"$RFILE"` **everywhere** (`spawn-backend-docker.ts:216`,
  `:217`, `:267`, `:295`, …) — so this gap is **tmux-backend-only** and is a real
  Law-2 (EVERY ENVIRONMENT) violation for space-bearing host paths.
- **Fix suggestion:** single-quote the literal at generation time and quote the expansions —
  `RFILE='${resultFile}'; trap '[ -f "$RFILE" ] || echo … > "$RFILE"' EXIT`. (The single
  quotes are safe because deckent tasks-dirs never contain a `'`; if that assumption is ever
  relaxed, escape it the same way the outer `sh -c '…'` payload already is.) Add a
  parity test with a spaced `projectDir` to `tmux-timeout-parity.test.ts`.

### F2 — LOW (latent) · `spawn-backend-docker.ts:627` · `stat -c %Y` failure reverts born-468 to always-overwrite
`hb_mtime=$(stat -c %Y "$HBFILE" 2>/dev/null || echo 0)`

The staleness gate reads the HB mtime with GNU/BusyBox `stat -c %Y`. On the shipped Alpine
base image BusyBox `stat` supports `-c`, so this is **not an active bug**. But the
`|| echo 0` fallback is silently self-defeating if `stat` ever lacks `-c` (a BSD-`stat`
base image, or a hardened image without `stat`): **[verified-by-run]** a failed `stat` yields
`hb_mtime=0`, so `hb_age = now - 0 ≈ 1.78e9`, which is `≥ 40` on every tick ⇒ the gate
**always** rewrites `$HBFILE`, reintroducing precisely the born-468 clobber it was built to
prevent. The failure is invisible (no error, wrong behavior).

- **Severity rationale:** latent / defense-in-depth — triggers only under a base-image change,
  which is why it is LOW not MEDIUM. But it is a *portability* landmine (Law-2) and the
  fallback direction is backwards: a `stat` that cannot read mtime should bias toward
  **not** clobbering a possibly-fresh worker HB.
- **Fix suggestion:** fall back to `hb_now` (treat unknown mtime as *fresh* → skip the write)
  instead of `0`, or probe `stat -c %Y` once at wrapper start and branch to a `date -r`
  (BSD) form; at minimum emit a one-time diagnostic when `stat` returns non-numeric.

### F3 — LOW · `spawn-backend-docker.ts:284-285` · HB enrichment `sed` assumes compact JSON, silently degrades on pretty-printed heartbeats
```
hb_status=$(sed -n 's/.*"status":"\([^"]*\)".*/\1/p' "$HBFILE" …)
hb_seq=$(sed -n 's/.*"sequence":\([0-9][0-9]*\).*/\1/p' "$HBFILE" …)
```
Both regexes require **no space** after the colon (`"status":"…"`, `"sequence":N`). Deckent's
own wrapper writes compact HB (`:637`) so it self-matches, but a **worker** that writes a
pretty-printed heartbeat (`"status": "EXECUTING"`, `"sequence": 7` — the exact shape the
WORKER-GUIDE example and this very task's own `.hb` use) does not match.

- **[verified-by-run]** compact input → `status=EXECUTING seq=7`; spaced/pretty input → **both
  empty**. The guards at `:286-287` then coerce them to `unknown` / `0`.
- **Impact:** diagnostic-only and *non-crashing* — the EXIT_WITHOUT_RESULT marker still
  produces valid JSON (guards prevent an empty `lastHbSequence:` token), but `lastHbStatus`
  and `lastHbSequence` degrade to `unknown`/`0`, weakening the FIX-phase signal ("was the
  worker alive and advancing?") exactly when it is most needed.
- **Fix suggestion:** tolerate optional whitespace — `"status":[[:space:]]*"\([^"]*\)"` and
  `"sequence":[[:space:]]*\([0-9][0-9]*\)`.

### F4 — LOW · `spawn-backend-docker.ts:969` · `PARTIALEOF` here-doc uses an unquoted delimiter for a body that needs no expansion
`cat > "$PRFILE" <<PARTIALEOF` (body is TS-interpolated literal JSON, closed at `:971`).

Unlike `RESULTEOF`/`NORESULTEOF` (which legitimately expand `$json_array`, `$exit_code`,
`$hb_status`, … and **must** stay unquoted), the `PARTIALEOF` body contains only values baked
in at generation time (`${taskId}`, `${provider}`, `${model}`) — no shell variable it needs to
expand. Leaving the delimiter unquoted means the shell still scans the body for `$`/backtick.

- **Impact:** none today (taskId is `validateTaskId`-checked; provider/model come from the
  registry, none contain shell metacharacters) — hence LOW / defense-in-depth. But it is an
  unnecessary injection surface: a future model/provider id containing `$(…)` or a backtick
  would be evaluated inside the container.
- **Fix suggestion:** quote the delimiter — `cat > "$PRFILE" <<'PARTIALEOF'`. Leave
  `RESULTEOF`/`NORESULTEOF` unquoted (they depend on expansion).

### F5 — LOW · `spawn-backend-docker.ts:258` + `:244` · filename→JSON escaping does not account for git `core.quotePath`
`escaped=$(printf "%s" "$f" | sed 's/\\/\\\\/g; s/"/\\"/g')`

The escaper correctly handles the common cases (backslash escaped **before** double-quote —
correct order) and the here-doc read loop uses `IFS= read -r`, so ordinary paths are handled.
The gap is pathological filenames: by default git **quote-paths** names with control/non-ASCII
bytes, emitting `"tab\tfile"` (surrounding quotes + C-style escapes) from
`git diff --name-only` / `git ls-files`. That already-quoted token is then re-escaped by the
`sed`, producing a technically-valid-JSON string whose *content* no longer round-trips to the
real filename.

- **Impact:** low — such filenames are vanishingly rare in deckent tasks, and the JSON stays
  *well-formed* (only the value is cosmetically wrong); `filesChanged` is advisory reconcile
  data, not a control path.
- **Fix suggestion:** if strict fidelity is ever needed, switch the collection to
  `git diff -z --name-only` + `git ls-files -z --others` and read null-delimited
  (`read -r -d ''`), bypassing quotePath entirely. Not worth doing preemptively.

### F6 — LOW · `spawn-backend-docker.ts:226-230` · last-chance 5 s wait is implicitly coupled to the host `docker stop --time` grace
```
lc_wait=0
while [ ! -f "$RFILE" ] && [ "$lc_wait" -lt 5 ]; do sleep 1; lc_wait=$((lc_wait + 1)); done
```
On a graceful stop (`SIGTERM → exit 143 → EXIT trap → on_exit`), this waits up to 5 s for a
late `.result` flush, then fsyncs. That budget is only safe because the host stops with
`docker stop --time=15` (`:1376` comment) — 5 s wait + fsync comfortably fits 15 s. The
coupling is undocumented at the wait site: if the stop grace were ever lowered below
~6–7 s, SIGKILL could land mid-wait and the marker write would be lost (SIGKILL bypasses the
trap; only the host monitor would then cover it).

- **Fix suggestion:** add a comment at `:226` cross-linking the `--time=15` invariant, or
  derive the loop bound from a shared constant so the two cannot drift apart.

### F7 — INFO · `spawn-backend-docker.ts:280` / `:292` · `diffStat` escaping is narrower than `filesChanged` escaping (but safe)
`diff_stat=$(git diff --shortstat … | tr -d '"' …)` — `diffStat` strips only `"`, whereas
`filesChanged` escapes both `\` and `"`. This is **safe**: `git diff --shortstat` output is
fixed-format ASCII (`N files changed, M insertions(+), K deletions(-)`) — no backslashes, no
control bytes — so `tr -d '"'` fully guarantees a JSON-safe string. Logged only as an
intentional asymmetry a future reader might otherwise flag as a bug. No change recommended.

### F8 — LOW · `spawn-backend-docker.ts:983` + `:220`/`:235`/`:299` · `HB_PID` kill race and orphaned `sleep`
The background HB loop is `( … ) &` (`:651`) with `HB_PID=$!` captured at `:983`; `on_exit`
does `kill $HB_PID 2>/dev/null`. Two minor issues:

1. The EXIT trap is armed at `:974`, *before* `HB_PID` is assigned at `:983`. If the script
   died in that tiny window, `on_exit` would run `kill` with an empty argument (harmless —
   `2>/dev/null` swallows the usage error). Window is a few no-fail statements wide, so
   near-zero probability.
2. `kill $HB_PID` targets the subshell, but its in-flight `sleep 15` child can briefly outlive
   it as an orphan until container teardown reaps it. Cosmetic.

- **Fix suggestion:** initialize `HB_PID=""` before the trap is armed, and (optionally)
  `kill "$HB_PID" 2>/dev/null; wait "$HB_PID" 2>/dev/null` to reap cleanly. Very low priority.

---

## Part C — Summary

| ID | Severity | File:line | One-line |
|----|----------|-----------|----------|
| F1 | **MEDIUM** | `tmux.ts:149` | unquoted `$RFILE` → fallback trap breaks on host paths with spaces (Law-2) |
| F2 | LOW (latent) | `spawn-backend-docker.ts:627` | `stat -c %Y` fail → born-468 gate reverts to always-overwrite |
| F3 | LOW | `spawn-backend-docker.ts:284-285` | HB `sed` assumes compact JSON → `lastHbStatus/Seq` degrade to `unknown`/`0` |
| F4 | LOW | `spawn-backend-docker.ts:969` | `PARTIALEOF` unquoted delimiter — needless expansion surface |
| F5 | LOW | `spawn-backend-docker.ts:258` | filename escaping vs git `quotePath` (well-formed but lossy for exotic names) |
| F6 | LOW | `spawn-backend-docker.ts:226-230` | 5 s last-chance wait coupled to `docker stop --time=15` (safe, undocumented) |
| F7 | INFO | `spawn-backend-docker.ts:280` | `diffStat` escaping narrower than `filesChanged` (safe — ASCII shortstat) |
| F8 | LOW | `spawn-backend-docker.ts:983` | `HB_PID` kill race window + orphaned `sleep` child |

**Bottom line.** The born-466/467/468/471 fixes and the tmux 466-parity are all present and
**correct** — verified by re-running the actual shell semantics, not just by reading. No
regression of those fixes was found. Eight residual items remain; **F1 (tmux unquoted
`$RFILE`)** is the only one worth a near-term fix — it is a real EVERY-ENVIRONMENT
(Law-2) break for host paths containing spaces, in the same class of quoting/`$?`/tracked-diff
footgun the sh-portability skill was written to prevent, and it is the strongest candidate for
a follow-up born-item. The remaining seven are LOW/latent hardening or intentional-but-worth-
documenting asymmetries. **No source was modified by this task.**
