# Codex Dogfood RCA — Sprint 361 (task 361-006)

Root-cause analysis of why the sprint-360 "codex" analytical run (task `360-014`,
CODEX-DOGFOOD-A) failed, plus a runtime self-report for this retry. Read + write only —
no code, no tests. All claims are anchored to files in `.brain/archive/sprint-360-tasks/`.

## 1. Runtime self-report (proof-of-existence)

- **Executing runtime:** Claude **Opus 4.8** (`claude-opus-4-8`) via the Claude Code
  agent harness (advisor tool + skill surface present) — **not** codex-CLI / gpt-5.
- **Observed start:** heartbeat `task-361-006.hb` first written `2026-07-02T22:07:42Z`
  (task `createdAt` `2026-07-02T22:06:57Z`).
- **Config vs. reality:** `task-361-006.json` declares `provider: "codex"`,
  `forceModel: "gpt-5"`, `backend: "subprocess"`. The process that actually ran this
  task is Claude Opus 4.8. **This retry is therefore _still_ not a real codex run** —
  the codex dogfood remains inconclusive for the same reason it was in sprint 360.

## 2. Evidence

| Source (`sprint-360-tasks/`) | What it shows |
|---|---|
| `task-360-014.json` | Configured `provider: codex`, `forceModel: gpt-5`, `backend: subprocess` |
| `task-360-014.log` | `api_error_status: 429`, `"You've hit your session limit · resets 5:30pm (UTC)"`, `duration_ms: 262552`; `modelUsage` = **claude-opus-4-8 + haiku**, cost $1.16 |
| `task-360-014.hb` | `workerId: docker-360-014`, `backend: docker`, `exitCode: 0` (≠ json's `subprocess`) |
| `task-360-014.result` | `selfAssessment: TIMEOUT_WITH_WORK`, `exitCode: 1`, `filesChanged` = 40 **unrelated** files, priced `anthropic/claude-opus-4-8`; Brain `NO_GO` (rubric 41) |
| `task-360-014-fix.log/.result` | Fix ran **783s on claude-opus-4-8**, `DONE`; notes confirm "zero codex/gemini worker rows" |
| `find … *.timeout` | **No `.timeout` file exists** for `360-014` (only sprint-186 has any) |

## 3. Findings (evidence-referenced)

1. **It was not a wall-clock timeout — it was an HTTP 429 session-limit.**
   `task-360-014.log` records `api_error_status: 429` with
   `"You've hit your session limit · resets 5:30pm (UTC)"` at `duration_ms: 262552`
   (~4.4 min) — far under any normal worker kill-timeout. The spawn wrapper collapsed
   this into `selfAssessment: TIMEOUT_WITH_WORK` / `exitCode: 1`, mislabeling a quota
   error as a timeout.

2. **The "codex" run never routed to codex.** Despite `provider: codex` /
   `forceModel: gpt-5`, the log's `modelUsage` is `claude-opus-4-8` (+ haiku) and the
   result is priced against `cost-config:anthropic/claude-opus-4-8`. The `.hb` even
   reports `backend: docker` while the json declared `subprocess`. So the analytical
   power being tested was Claude's, not gpt-5's — the dogfood was moot before it ran.

3. **The "40 files modified" signal was spurious.** `task-360-014.result.filesChanged`
   lists `src/api/server.ts`, `src/core/limit-preflight.ts`, `tests/**`, etc. — the
   concurrent output of _other_ sprint-360 workers captured by a global
   `git diff --stat`. The one authorized target (`docs/analysis/worker-quality-357-359.md`)
   is **absent** from the list: real doc output was zero. The `notes`
   ("git diff shows 40 files modified") turned an empty run into a false "work detected".

4. **The fix silently ran on Claude too.** `task-360-014-fix.log` completed in 783s on
   `claude-opus-4-8` (`DONE`, rubric 100). Its own notes state the analysis found
   "zero codex/gemini worker rows" — confirming the entire 360-014 lifecycle
   (attempt + fix) executed on Claude, never codex.

## 4. Root-cause hypothesis

Primary cause is a **shared session-quota exhaustion (429)**, not a slow model,
CLI stall, or prompt-size blow-up:

- **Slow-model / CLI-stall — rejected.** The run made 8 turns and returned a clean
  structured `result` in 262s; the terminal event is an API 429, not a hang or SIGKILL.
- **Prompt-size — rejected.** Token counts are modest (6.4k in / 9.1k out); the failure
  is a quota ceiling, not context overflow.
- **Session-limit — confirmed.** Sprint-360 was a large ~28-task run; the shared Claude
  session hit its quota window ("resets 5:30pm UTC") mid-sprint, so `360-014` (a
  later task) got the 429. The codex routing gap meant the task consumed the _Claude_
  session it was never supposed to touch.

## 5. Recommendations

1. **Fix the codex spawn/routing gap first.** Verify the _spawned backend_, not the
   config label: assert `modelUsage`/pricing matches `gpt-5` before counting a run as a
   codex dogfood. Until then every "codex" task silently falls back to Claude. Note
   `src/orchestra/codex-spawn-readiness.ts` (+ its test) appears in 360-014's
   `filesChanged` — the spawn gap was already in-flight in sprint 360, so the dogfood
   keeps front-running its own fix.
2. **Classify 429 distinctly from timeout.** Don't collapse `api_error_status: 429` into
   `TIMEOUT_WITH_WORK`. Surface `SESSION_LIMIT` so Brain retries after reset instead of
   spawning a same-session fix that also fails.
3. **Scope the result diff to `scope.filesWrite`.** A doc worker's `filesChanged` must
   diff only its authorized target, not a global `git diff --stat` that captures other
   workers → no more phantom "40 files" signals.
4. **Run the codex dogfood in an isolated single-task sprint** on a fresh/independent
   quota so it neither contends for the Claude session nor gets misrouted.
