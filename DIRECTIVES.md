# DIRECTIVES — OVERNIGHT ROUND 3: TRN-pillar wire + APR contract + lifecycle/test debts

## Goal
Advance the strategic-pivot P0 pillars (TRN training-trace: rows 76/77/78 · APR approval: row 30)
and close two quality debts (SIGTERM-CLEANUP from ADR-G-013 · stale model-ID sweep row 431).
Disk-verify each claim first (`git grep`/Read, cite `file:line`), then implement with hermetic
tests. Two audiences (Yasa #1), cross-platform (Yasa #2), god-level never-MVP (Yasa #3).

## 🔒 BAĞLAYICI — her task (binding)
- **DISTINCT-FILE:** `Files:` listen tek yazım-otoritendir; read-dizinleri yazım izni VERMEZ.
  Scope-dışı bulgu → result `notes`.
- **DISK-VERIFY first:** kusuru/0-caller iddiasını diskte doğrula, `file:line` cite et;
  diskte zaten-doğruysa kanıtla SKIP.
- **ADR kontrat; surgical minimum-diff; davranış koru.**
- **Test hermeticity:** tmpdir + afterEach cleanup; proje-kökü/HOME'a yazma; spawnSync yok.
- **No build/install/login.** `tsc --noEmit` + yalnız HEDEFLİ test dosyaların.
- **i18n-first:** yeni user-facing string yalnız `getMessage(key, lang)` (en/tr).
- **Honest result** + docImpact-notes konvansiyonu. **No haiku.**

---

## Task 1: TRN-1 — trace-recorder'ı sprint-worker turn'lerine WIRE (row 76)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/output-collector.ts, src/agent/trace-recorder.ts, tests/orchestra/trn1-sprint-trace-wire.test.ts
- Scope: src/orchestra/, src/agent/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-009 (eval/trace) + strategic-pivot P0 ("training-trace WIRE — §7.2 en kritik").
`src/agent/trace-recorder.ts` exists but has ZERO live callers on the sprint path: a docker/subprocess
worker's full execution trace (turns, tool_use, results — captured by the output-collector JSONL
contract) is never recorded into the training-trace store. Disk-verify the 0-caller claim, then wire:
when a sprint worker's output is collected (output-collector seam), feed the turn stream into the
trace-recorder with REDACTION (reuse `redactSensitive` — never record raw secrets) and task-labeling
(taskId, sprintId, agent, model, selfAssessment outcome). Config-gate it (`training_trace.enabled`,
default OFF — recording is opt-in) so default behavior is byte-identical. Fail-soft: a trace-write
error never affects the sprint.
### goNogo
- goCriteria: with the flag ON a collected worker output produces a recorded, redacted, labeled trace
  entry (test proves: secrets masked, labels present); with the flag OFF behavior is byte-identical
  (no writes, no perf hooks); 0-caller claim cited with file:line evidence; fail-soft proven (throwing
  recorder never fails collection); `tsc --noEmit` clean; targeted tests pass.
- nogo: default-ON recording; raw secrets in any trace; a trace failure breaking result collection.

## Task 2: TRN-2 — trace-recorder'ı native-REPL'e WIRE (row 77)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/repl/trace-wire.ts, tests/cli/trn2-repl-trace-wire.test.ts
- Scope: src/cli/, src/agent/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-009. `src/cli/repl/trace-wire.ts` exports `buildTurnRecorder` (~:20) with ZERO
callers — the native-REPL agent loop never records its turns. Disk-verify, then wire
`buildTurnRecorder` into the REPL turn lifecycle at the correct seam (find where a REPL turn
completes — likely the native agent loop's turn boundary), same rules as TRN-1: config-gated
(`training_trace.enabled`, default OFF), redacted, fail-soft. Do NOT change REPL behavior when off.
### goNogo
- goCriteria: flag ON → a completed REPL turn is recorded (test via the seam, hermetic — no real
  provider call); flag OFF → byte-identical; wire point cited file:line; fail-soft proven;
  `tsc --noEmit` clean; targeted tests pass.
- nogo: recording w/o the flag; touching the REPL's user-visible output; a new dependency.

## Task 3: TRN-3 — cc-trace-extractor driver (row 78)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/trace-extract.ts, tests/cli/trn3-trace-extract.test.ts
- Scope: src/cli/, src/training/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-009 + ADR-G-011 (CLI/MCP parity — note the MCP-tool follow-up in your result,
do NOT build it here). `src/training/cc-trace-extractor.ts` (~:51) has the extraction logic but
NO driver — nothing invokes it. Build the CLI command `deckent trace extract` (register<Name>
pattern, commander, i18n via getMessage): inputs (transcript path / directory), output (JSONL to
`.deckent/training/`), respects redaction, honest counts printed. Register it in the CLI entry
registry following the existing command-registration pattern (verify the pattern from a sibling
command first). NOTE (Tier-1 surface — src/cli/commands): include a `Smoke:` line in your result:
`node dist/cli/entry.js trace extract --help → usage printed` (the host runs it post-sprint).
### goNogo
- goCriteria: command registered + `--help` renders (hermetic test via commander program, not a
  real spawn); a fixture transcript extracts to JSONL with redaction applied (tmpdir); i18n keys
  for new user-facing strings (en+tr); `tsc --noEmit` clean; targeted tests pass.
- nogo: hardcoded user-facing strings; writing outside tmpdir in tests; skipping registration.

## Task 4: APR-CONTRACT — ApprovalRequest tam kontratı (row 30)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-builder
- Files: src/core/approval-contract.ts, tests/core/approval-contract.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: strategic-pivot P0 APR (§11.2) + ADR-G-020 (authority). The runtime-wide ApprovalBroker
(APR-1) needs its CONTRACT first. Deliver the complete, versioned type module (types + zod schema +
guards — zod is already a dependency): `ApprovalRequest` { id, version, requester (brain|worker|
auditor|nervous|connector + instanceId), summary (short, human) ↔ details (full, structured),
scopeId, scope (7-enum: file-read|file-write|shell-exec|git-mutation|network|credential|lifecycle),
risk (5-enum: none|low|medium|high|critical), policy (4-enum: auto-approve|notify|require-approval|
deny), defaultAction (4-enum: allow|deny|defer|escalate), tenantId, userId, createdAt, expiresAt,
maskedArgs vs rawArgsRef (APR-4 redaction-ready: raw NEVER serialized into the request — a ref only) }
+ `ApprovalDecision` { requestId, decision, decidedBy, channel, decidedAt, reason }. Exhaustive zod
validation + type guards + JSON round-trip. This is a foundation module — NO broker/IO here.
### goNogo
- goCriteria: module exports the full contract exactly as specced (all enums with the counts above);
  zod schema rejects malformed requests (tests per enum + missing-field + expiry); JSON round-trip
  lossless; rawArgs cannot appear in a serialized request (test proves the type/schema excludes it);
  `tsc --noEmit` clean; hermetic tests pass.
- nogo: broker implementation/IO in this module; a rawArgs field serializable into the request;
  enums deviating from the spec counts.

## Task 5: SIGTERM-CLEANUP — SIGTERM'i SIGINT temizlik-yoluna bağla (ADR-G-013 born)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/entry.ts, tests/cli/sigterm-cleanup.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-013 (graceful shutdown — born item SIGTERM-CLEANUP). `entry.ts` `onSignal`
(~:724-736) runs `interruptActiveSprint()` + `killAllSessions()` ONLY for SIGINT; SIGTERM is
registered but exits with NO cleanup — a `kill <pid>` / systemd stop / docker stop of the
coordinator leaves INTERRUPTED-unmarked tasks, live locks, orphan tmux sessions. Fix: SIGTERM runs
the SAME cleanup path as SIGINT (extract or share; both signals → interrupt + session-kill +
exit). Preserve exit codes and the stderr message shape. Keep the handler synchronous-fast
(signal-safe); no new async work in the handler.
### goNogo
- goCriteria: a test proves the SIGTERM path invokes the same cleanup functions as SIGINT (seam/mocked
  — never signal the real test process); stderr message + exit behavior preserved; ADR-G-013's
  SIGTERM-CLEANUP consequence line updated via docImpact note (do NOT edit the ADR file);
  `tsc --noEmit` clean; targeted tests pass.
- nogo: real signals in tests; changing SIGINT behavior; async work added into the signal handler.

## Task 6: STALE-MODEL-ID-SWEEP — 30 test dosyasında sonnet-ID güncelle (row 431)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/providers/subprocess.test.ts, tests/core/limit-ledger-report.test.ts, tests/orchestra/cost-gate-advisory.test.ts, tests/core/f1ad-model-detect.test.ts, tests/core/limit-ledger.test.ts, tests/core/model-types.test.ts, tests/core/cost-config-loader.test.ts, tests/core/catalog-apiid-merge.test.ts, tests/core/cost-model-label.test.ts, tests/core/cost-gate-spend.test.ts, tests/core/result-cost.test.ts
- Scope: tests/, src/core/, docs/adr/
- Dependencies: none
### Description
Governing: [[feedback_zero_hardcode_live_data]] + row 431. Commit 8e4b51db mapped the `sonnet`
alias to Claude Sonnet 5, leaving ~30 test files asserting the RETIRED `claude-sonnet-4-6` ID —
2 live failures today (tests/providers/subprocess.test.ts:664 …). FIRST disk-verify the canonical
current ID from the live source (`src/core/model-registry.ts` / model catalog — cite it), then
sweep your Files list: update assertions to the canonical ID. Where a test's INTENT is
"alias resolves to the registry's current model" prefer asserting via the registry/catalog value
instead of a re-hardcoded literal (zero-hardcode) — but do NOT restructure tests beyond the ID
fix. Your Files list covers the first 11 files; list the REMAINING stale files (grep) in your
result notes as follow-up (do not touch them — distinct-file).
### goNogo
- goCriteria: all 11 listed files updated + their suites pass (run each); the 2 known failures
  (subprocess.test.ts) now green; canonical-ID source cited file:line; remaining-files list in
  notes; `tsc --noEmit` clean.
- nogo: touching files outside the 11; behavioral test changes beyond the model-ID; re-hardcoding
  where a registry-based assertion is natural.
