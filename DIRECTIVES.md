# DIRECTIVES — DOGFOOD ROUND 2: sprint-348 born-item fixpack (docker/finalize/cred/redact/prompt)

## Goal
Close five born-items surfaced by the sprint-348 dogfood + its prompt analysis
(`docs/MASTER-PLAN.md` rows 433/434/436/437/438/445). Each task fixes a concrete,
evidence-grounded defect. Disk-verify the claim first (cite `file:line`), then implement
with hermetic tests. This sprint ALSO live-tests the new routing role-signal and the
tiered ADR-injection — do your task well and the meta-experiment takes care of itself.

Two audiences (Yasa #1): deckent dogfood + end-user product, solo → enterprise. Cross-platform
(Yasa #2: macOS · Linux · Windows-native · WSL). God-level, never MVP (Yasa #3).

## 🔒 BAĞLAYICI — her task (binding)
- **DISTINCT-FILE:** your `Files:` list is your SOLE write authority. The read/context
  directories do NOT grant write permission. Out-of-scope findings → result `notes`.
- **DISK-VERIFY first:** confirm the defect on disk (`git grep`, Read) and cite `file:line`
  in your result. Already-fixed on disk → SKIP with evidence, no churn.
- **ADR is the contract:** injected ADRs are mandatory. Conflict → NO_GO + amendment proposal.
- **Surgical / minimum-diff:** change only what the defect requires; preserve behavior + passing tests.
- **Test hermeticity:** all fixture I/O under `os.tmpdir()` (mkdtempSync) + afterEach cleanup;
  never write project root / HOME / real `~/.deckent`; async spawn only (no spawnSync in tests).
- **No build/login:** run `tsc --noEmit` + your TARGETED test file(s) only. No `npm run build`,
  no `npm install`, no `/login`.
- **i18n-first:** any new user-facing string via `getMessage(key, lang)` (en/tr) — never hardcoded.
- **Honest result:** files_changed + `file:line` proof + test results + truthful selfAssessment.
- **No haiku.**

---

## Task 1: DOCKER-FIXPACK — stale-shadow EACCES + inert kind-memlimit (rows 434+433)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-backend-fixpack.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-005 (deck worker isolation) + ADR-G-014 (spawn backend). Two verified defects
in the docker backend:
(a) STALE-SHADOW-PERMS 🔴 — `ensureDeckShadowFile` (~:559) does `writeFileSync(path, '', {mode:0o600})`,
but `mode` only applies on CREATE: a pre-existing read-only (0o400) `.tasks/.deck-shadow` left by an
older build makes the O_TRUNC write throw EACCES and the whole SPAWN phase fails (live-observed:
sprint-347 first launch). Fix: if the shadow exists, `chmodSync(0o600)` (or unlink) BEFORE writing;
wrap so ANY pre-existing perm state converges to a writable 0o600 shadow. Cross-platform: guard
chmod failures on Windows (best-effort + honest debugLog, never throw-through).
(b) KIND-MEMLIMIT-DEAD — `resolveKindMemoryLimits` (~:1313) looks up `this.kindMemoryLimits[kind]`
but the resource-log proves NO kind-based limit has EVER fired (all-history limits = {4096,2048}MB
only, even during pure-doc sprints 345/346). Trace how the task's kind reaches (or fails to reach)
the lookup — likely the task.json `kind`/`type` field name or value mismatches the config map keys
(`documentation`, `code-development`, …). Fix the chain so a task whose kind is configured gets its
kind-specific `--memory`, and add a regression test proving a `documentation` task resolves 1536m
(current config) while an unconfigured kind falls back to the constructor default.
### goNogo
- goCriteria: (a) a pre-existing 0o400 shadow no longer breaks `ensureDeckShadowFile` — test creates
  a read-only shadow in tmpdir, calls the function, asserts no throw + resulting file writable 0o600;
  (b) kind-resolution proven by test: configured kind → its limit, unconfigured → default; the broken
  link is named in the result notes with `file:line`; `tsc --noEmit` clean; targeted tests pass.
- nogo: kind fix that only works for one hardcoded kind; chmod throw-through on Windows; touching
  container-side script logic unrelated to the two defects.

## Task 2: FINALIZE-ERROR-SURFACE — swallowed finalize failures become visible (row 436)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/finalize-error-surface.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-025 (resilience/observability). Live-verified defect: when `finalizeSprint`
throws inside `runRetroPhase` (~:2462 catch — sprint-348 hit "database is locked" there), the
catch only calls `safeDashboardUpdate` and returns undefined — the sprint still prints
"Complete!", and the retro/memory/export/archive loss is INVISIBLE to the operator
(`.brain/archive/sprint-348-tasks` silently never existed). Fix the catch path so a finalize
failure is SURFACED: (1) write a clear stderr line (via the existing output helpers, i18n-first
if a new user-facing string is needed), (2) fire the existing notify pipeline (`notifyAsync` /
`notify` — reuse, don't invent) with the error, (3) make the returned/propagated state carry a
`finalizeFailed: true` marker (or equivalent) that the sprint summary can render, so "Complete!"
is never printed unqualified over a lost finalize. Do NOT change the fail-soft philosophy (the
sprint must still not crash) — the fix is visibility, not a re-throw.
### goNogo
- goCriteria: a test injects a throwing finalize (mock/seam) and asserts (a) the error reaches
  stderr or the notify sink, (b) the phase result carries the finalize-failed marker; existing
  retro-phase tests still pass; no re-throw (fail-soft preserved); `tsc --noEmit` clean.
- nogo: converting fail-soft into a crash; swallowing remains possible on any finalize-throw path;
  a new user-facing string hardcoded in one language.

## Task 3: CRED-HARDEN-PACK — AAD binding + atomic writes + Windows honesty (row 438)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/core/credential-encryption.ts, src/core/credentials-per-project.ts, tests/core/credentials-harden.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-017 (isolation). The sprint-348 crypto-audit confirmed the per-project store's
core is sound (HKDF-by-projectRoot + GCM) but found three hardening gaps:
(a) NO AAD — entries are not bound to their credential key name, so an attacker with file-write
can PERMUTE entries (relabel KEY_B → returns KEY_A's value). Extend `credential-encryption.ts`
encrypt/decrypt with optional AAD (`cipher.setAAD`/`decipher.setAAD`) and pass the credential
key name as AAD from `credentials-per-project.ts`. BACKWARD-COMPAT is mandatory: existing
`.deckent/credentials.enc` files written without AAD must still decrypt (e.g. version the entry
or try-without-AAD fallback for legacy entries — document the chosen strategy).
(b) NON-ATOMIC saveFile (~:105) — read-modify-write with direct `writeFile`: concurrent sets
lose entries, a crash mid-write corrupts the store. Switch to tmp-file + `renameSync` atomic
replace (same pattern as the checkpoint writer).
(c) POSIX-only perms with a swallowed `chmod` — on Windows-native chmod is a no-op and the
swallow hides it. Keep best-effort but debugLog the failure honestly; note the Windows-ACL
follow-up in a comment (do NOT attempt ACL implementation here).
### goNogo
- goCriteria: entry-swap test — after swapping two entries' ciphertext/labels in the file,
  `getCredential` THROWS instead of returning the wrong secret (AAD proof); legacy no-AAD file
  still round-trips (compat proof); atomic write proven (tmp+rename — assert no partial state
  via the rename pattern or an injected-failure test); existing credentials-per-project tests
  still pass; `tsc --noEmit` clean.
- nogo: breaking decryption of existing stores; AAD only on write but not verified on read;
  leaving the direct writeFile path reachable.

## Task 4: REDACT-COVERAGE — extend the secret-mask allowlist (row 437)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, secure-coding
- Files: src/core/redact-sensitive.ts, tests/core/redact-sensitive-coverage.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-025. `redactSensitive()` is now wired into the fatal handler (CRASH-REDACT ✅)
but its pattern allowlist is a coverage ceiling: AWS access keys (`AKIA[0-9A-Z]{16}`), GitHub
tokens (`ghp_…`/`gho_…`/`github_pat_…`), JWTs (`eyJ…` three-segment base64url), and generic
`password=`/`passwd=`/`token=`/`secret=` assignments are NOT masked. Extend the allowlist with
precise, anchored patterns (no catastrophic-backtracking regex; keep each pattern commented with
an example). Preserve the existing mask style and ordinary-text pass-through — over-redaction is
a regression (the CRASH-REDACT nogo already guards "ordinary error text preserved").
### goNogo
- goCriteria: tests prove AKIA…, ghp_…, github_pat_…, a real-shaped JWT, and password=/token=
  assignments are masked while plain prose ("the token bucket algorithm", "password field
  validation") passes through UNCHANGED; all existing redact + error-handler-redact tests still
  pass; `tsc --noEmit` clean.
- nogo: over-redaction of ordinary prose; a regex with unbounded nested quantifiers; changing
  the mask format existing consumers assert on.

## Task 5: PCOMP-W8 — test-strategy hints for exit-path tasks (row 445)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-testhints.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-027 (prompt lifecycle / worker context). Workers burn their 3-attempt verify
budget on process-terminating targets: a task touching `process.exit` / `process.kill` /
signal-handlers / a fatal handler needs its test to mock `process.exit`, but the prompt never
says so (live case: 348-005 formatFatalAndExit). Add a small, pure heuristic to the prompt
template: when the task's title/description/goCriteria mention an exit-path signal
(`process.exit`, `process.kill`, `SIGTERM`/`SIGKILL`/`SIGINT`, `formatFatalAndExit`, "fatal
handler", "exit code"), the Verify block gains ONE hint line: mock `process.exit` (e.g.
`vi.spyOn(process, 'exit').mockImplementation(...)`), assert the exit code without terminating
the test process, and never call the real exit in tests. Keep it ONE line, pattern-gated
(non-matching tasks get byte-identical prompts — determinism tests must stay green), and place
it inside the existing verify-block builder following the file's segment conventions.
### goNogo
- goCriteria: an exit-path task's prompt contains the hint line exactly once; a non-matching
  task's prompt is byte-identical to before (prompt-determinism + prompt-segmentation suites
  still pass); the heuristic is a pure exported function with its own unit tests;
  `tsc --noEmit` clean.
- nogo: hint injected into every prompt unconditionally; breaking prompt-determinism tests;
  a multi-paragraph hint (attention dilution — ONE line).
