# DIRECTIVES — W0 SECURITY/ISOLATION DEBTS (Sıra 8-12): close the 5 "ADR-claim ≠ code" gaps

## Goal
Close the remaining Wave-0 (W0) security/isolation debts from `docs/MASTER-PLAN.md`. Each task fixes a
concrete "the accepted ADR promises X, the code does NOT do X" gap. These are trust-critical: three are
🔴 (secret cross-read, symlink authority-bypass, crash-log secret-leak). Each task **re-verifies the gap
against the real source code first** (disk-verify — do NOT trust the plan's line numbers blindly; confirm
with `git grep`/Read and cite `file:line`), then implements the fix with tests.

Two audiences (Yasa #1): deckent's own orchestration (dogfood) + the end-user product, from solo to the
largest enterprise. Every fix is cross-platform (Yasa #2: macOS · Linux · Windows-native · WSL) and
god-level, never MVP (Yasa #3).

## 🔒 BAĞLAYICI — her task (binding)
- **DISTINCT-FILE (KRİTİK):** each task's `Files:` list is its SOLE write set. No two tasks write the same
  physical file (verified: all 5 write-sets are disjoint). NEVER edit a file outside your `Files:` list —
  if you spot an issue elsewhere, note it in your result, do not fix it inline. This prevents worktree
  merge-back collisions.
- **DISK-VERIFY before implementing (ground truth):** confirm the actual gap yourself (`git grep`, Read),
  cite `file:line`. If the code already does the right thing on disk, SKIP with evidence — do not
  introduce churn to satisfy a stale plan line.
- **ADR is the contract:** your governing ADR is injected into your prompt. Implement exactly what it
  promises. If your implementation would violate another accepted ADR → stop, write NO_GO + propose an
  amendment.
- **NEW-FILE tasks stay additive:** tasks 1 (STATE-RESOLVER) and 2 (CRED-PER-PROJECT) deliver a NEW
  primitive + its tests ONLY. Do NOT migrate the ~150 existing call-sites / rip out the current global
  vault in this sprint — that mass migration would collide with every other task and is an explicit
  follow-up. Deliver the primitive, fully tested, with a header comment documenting the adoption pattern.
- **Surgical / minimum-diff** for the WIRE tasks (3, 4, 5): change only the lines the gap requires;
  preserve existing behavior and passing tests.
- **god-level + i18n-first:** any NEW user-facing string goes through `getMessage(key, lang)` (en/tr) —
  never hardcode TR/EN. These tasks are mostly internal (no new user-facing strings expected).
- **Cross-platform:** use `node:path` join (never string concat), `realpathSync`/`openSync` portably;
  no POSIX-only assumptions. Windows-native + WSL must work.
- **No build/login during the sprint:** run your own `tsc --noEmit` scope-check and `vitest` on your new
  test only. Do NOT run `npm run build`, `npm install`, or `/login` (the host runs the final build).
- **Test hermeticity:** all fixture I/O under `os.tmpdir()` (mkdtempSync), cleaned in afterEach; never
  write to project root / HOME / real `~/.deckent`; async `spawn` only (no `spawnSync` in tests).
- **Honest result:** `files_changed`, a `git grep`/`file:line` proof for the fix, test results, and a
  truthful `selfAssessment` (DONE only if the goCriteria are verified; GO_WITH_TECH_DEBT / NO_GO otherwise).
- **No haiku** (security-critical implementation).

---

## Task 1: W0-8 STATE-RESOLVER — env-aware state-path resolver primitive
- Model: sonnet
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/core/state-paths.ts, tests/core/state-paths.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-D-002 (state-path isolation, W3-precondition) + cross-cut ADR-G-001 (global-install) /
ADR-G-017 (isolation). Create ONE env-aware resolver so deckent's state root is not hardcoded. Export:
`resolveDeckentHome(projectRoot?)`, `resolveBrainHome(projectRoot?)`, `deckentPath(projectRoot, ...segs)`,
`brainPath(projectRoot, ...segs)`. Precedence (highest first): explicit env `DECKENT_HOME` / `BRAIN_HOME`
→ project-local `<projectRoot>/.deckent` · `<projectRoot>/.brain` (current convention) → `~/.deckent`
(global-install fallback via `os.homedir()`). Pure functions, cross-platform `node:path`. This task ONLY
creates the primitive + exhaustive tests + a header comment documenting the migration pattern for the
~150 existing hardcoded `.deckent`/`.brain` joins (do NOT migrate them here — follow-up).
### goNogo
- goCriteria: resolver exports the 4 functions; env-precedence (DECKENT_HOME/BRAIN_HOME) beats
  project-local beats `~/.deckent`; unit tests cover every precedence branch + a Windows-style path join
  (via `path.win32` or asserting with `join`); no existing file edited (distinct-file); `tsc --noEmit` clean.
- nogo: migrating existing call-sites (collision); reading real `~/.deckent`; hardcoding a separator;
  env var read at module-load instead of call-time.

## Task 2: W0-9 CRED-PER-PROJECT — per-project encrypted credential store 🔴
- Model: sonnet
- Effort: high
- Agent: security-auditor
- Skills: typescript-expert
- Files: src/core/credentials-per-project.ts, tests/core/credentials-per-project.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-017 (per-project credential isolation; design-doc §4.2). Today credentials live in a
GLOBAL vault → project-A's secret is readable from project-B. Deliver a per-project store: encrypted
`<projectRoot>/.deckent/credentials.enc`, AES-256-GCM, with the data key derived via HKDF (`node:crypto`
`hkdfSync`) from a master secret **salted with the canonical projectRoot** so project-A's key ≠
project-B's. Cross-read MUST fail: decrypting project-A's file with project-B's derivation throws. API:
`setCredential(projectRoot, key, value)`, `getCredential(projectRoot, key)`, both async, no plaintext on
disk. This is the NEW primitive + tests; do NOT rip out the existing global vault (follow-up adoption).
### goNogo
- goCriteria: `.deckent/credentials.enc` written encrypted (no plaintext secret in the file bytes);
  HKDF key-derivation salted by projectRoot; round-trip get==set within one project; **sibling-cross-read
  FAILS** — a test proves project-B cannot decrypt project-A's `credentials.enc` (throws / auth-tag fail);
  AES-256-GCM auth-tag verified; `tsc --noEmit` clean; tests hermetic (tmpdir).
- nogo: plaintext secret on disk; a static/global key not bound to projectRoot; cross-read succeeding;
  editing the existing global vault module.

## Task 3: W0-10 SYMLINK-AUTHORITY-WIRE — close the runtime symlink scope-bypass 🔴
- Model: sonnet
- Effort: high
- Agent: security-auditor
- Skills: typescript-expert
- Files: src/orchestra/authority-enforcer.ts, tests/orchestra/authority-enforcer-symlink.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-017 (isolation). Today `authority-enforcer.ts` (~:339) checks scope containment with
path-NORMALIZE only — the ADR-rejected method: a symlink inside scope pointing OUTSIDE scope passes, so a
worker can escape `scope.filesWrite` via a symlink. Wire a `realpathSync`-based `isWithinScope` into
`checkWorkerAuthority` and `checkAuthority`: resolve the real path of BOTH the target and each scope root
(for a not-yet-existing new file, realpath its nearest existing parent + rejoin the tail) before the
containment test. A symlink resolving outside scope → REJECT. Keep legitimate in-scope writes + new-file
creation allowed. Preserve the existing advisory/soft ADR-037 enforcement MODE (this hardens the check
logic, it does not flip soft→hard).
### goNogo
- goCriteria: `isWithinScope` resolves symlinks via `realpathSync` and is wired into BOTH
  `checkWorkerAuthority` + `checkAuthority`; test: a symlink under scope → outside target is REJECTED
  (regression: was accepted); an ordinary in-scope path passes; a new (non-existent) in-scope file path
  is allowed (parent-realpath handling); `tsc --noEmit` clean; hermetic tmpdir symlink fixtures.
- nogo: path-normalize-only left in place; rejecting legitimate new-file creation; realpath throwing on a
  non-existent target instead of parent-resolving; touching files outside authority-enforcer.

## Task 4: W0-11 AUDIT-WIRE — persist terminal audit to MemoryStore + HMAC chain
- Model: sonnet
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, api-designer
- Files: src/api/server.ts, src/api/terminal/audit.ts, tests/api/terminal-audit-wire.test.ts
- Scope: src/api/, src/core/, tests/api/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-029 (invariant #3 clause-2). At `server.ts:1473` the production audit sink is a NO-OP
(`insert: () => {}`), so terminal lifecycle events are never persisted and the HMAC integrity-chain is
inert — an audit hole. Wire a MemoryStore-backed `AuditSink` whose `insert()` persists each audit event
(as a store entry) AND advances the HMAC integrity chain per integrity-config, when integrity is enabled.
Tests still pass a no-op sink; production selects the real store-backed sink. Keep `TerminalAudit`'s
interface stable.
### goNogo
- goCriteria: when integrity-config enables audit, `server.ts` wires a MemoryStore-backed sink (not the
  no-op); an emitted lifecycle event is persisted to the store AND HMAC-chain-linked (test asserts the
  stored entry + a verifiable chain link); the no-op path stays available for tests; `tsc --noEmit` clean.
  NOTE (Tier-1 surface — src/api): add a `Smoke:` line proving the real served path persists an event.
- nogo: leaving the no-op sink in production; breaking existing server tests; an unverifiable/empty HMAC
  chain; persisting plaintext secrets into the audit entry (redact if needed).

## Task 5: W0-12 CRASH-REDACT — redact secrets from fatal crash output 🔴
- Model: sonnet
- Effort: high
- Agent: security-auditor
- Skills: typescript-expert
- Files: src/cli/helpers/error-handler.ts, tests/cli/error-handler-redact.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-025 (resilience/observability). The redactor `redactSensitive()` already exists in
`src/core/redact-sensitive.ts` but is NOT called by the fatal path. Wire it into `formatFatalAndExit`
(`error-handler.ts` ~:103) so a fatal error's `message` AND `stack` are passed through `redactSensitive`
before they are written to stderr and the crash-log. A crashing error whose message/stack contain
`sk-...`, `Bearer <token>`, or `API_KEY=...` must NOT surface those secrets verbatim in either output.
### goNogo
- goCriteria: `formatFatalAndExit` redacts message+stack via `redactSensitive` before BOTH stderr and the
  crash-log write; a test injects an error carrying `sk-live-...`, `Bearer abc...`, `API_KEY=secret` and
  asserts none appear verbatim in either output (masked); non-sensitive error text preserved; exit code +
  crash-log path unchanged; `tsc --noEmit` clean.
- nogo: redacting only one of the two outputs; changing the exit code / crash-log location; over-redacting
  so ordinary error text is destroyed; importing a new dependency.
