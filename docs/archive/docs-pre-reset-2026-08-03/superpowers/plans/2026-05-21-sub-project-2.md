# Sub-project #2 Implementation Plan — Planner State-Hygiene + Self-Security

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint 176 ships 12 tasks across 5 waves — 7 planner state-hygiene fixes + 5 self-security guards — as a beta-blocker for June 1 2026 OSS GA.

**Architecture:** Planner hygiene (W1-W3) = targeted fixes in existing `src/orchestra/`, `src/core/`, `src/cli/`, `src/dashboard/` modules (zero new architecture). Self-security (W4-W5) = interceptor pattern, 5 new files in `src/api/terminal/` hooked into existing session/gateway/audit pipeline (no contract changes). Audit gets non-destructive HMAC-chain extension (additive ALTER, append-only).

**Tech Stack:** TypeScript ESM (Node 24+), vitest 3.x, better-sqlite3 12.10.0, Node crypto (HMAC-SHA256), node-pty (`@lydell/node-pty`), ws (gateway), React 18 + Vite (dashboard).

**Spec reference:** `docs/superpowers/specs/2026-05-21-sub-project-2-design.md` — five non-negotiable invariants (I1-I5 in §4), wave breakdown (§5), verdict matrix.

---

## File Structure

### Modified files (Planner state-hygiene W1-W3)

| File | Task | Responsibility |
|------|------|----------------|
| `src/orchestra/sprint-planner.ts` | 1, 2 | auto-debt scope inheritance + orphan task file cleanup |
| `src/core/plugin-hooks.ts` | 3 | spawnSync shell win32-only (line 395, 577) |
| `src/orchestra/baseline-tracker.ts` | 3 | spawnSync shell win32-only (line 85) |
| `src/core/config.ts` | 4 | add coverage_hard_floor + coverage_aspirational |
| `src/orchestra/sprint-finalizer.ts` | 4 | auto-learn only coverage_aspirational (line 413, 450) |
| `src/orchestra/sprint-controller.ts` | 4 | EVALUATE uses coverage_hard_floor (line 679) |
| `src/dashboard/src/components/WorkerCard.tsx` | 5 | relax t() prop boundary (line 127) |
| `src/dashboard/src/pages/DashboardPage.tsx` | 5 | relax t() prop boundary (line 284) |
| `src/dashboard/src/i18n/types.ts` | 5 | translator function signature relaxation |
| `package.json` | 5 | root lint script wires dashboard tsc |
| `src/cli/commands/doctor.ts` | 6 | check .brain/exports/decisions.md (line 193) |
| `src/core/constants.ts` | 6 | deprecate DECISIONS_FILE (line 37) |
| `src/orchestra/debt-manager.ts` | 6 | remove from DECAY_EXEMPT (line 481) |
| `src/orchestra/sprint-docs-helpers.ts` | 6 | update reference (line 142) |
| `src/orchestra/authority-enforcer.ts` | 6 | remove from allow-list (line 118) |
| `src/core/pid-liveness.ts` | 7 | new — portable PID liveness probe |
| `tests/cli/archive-debt.test.ts` | 7 | mock hygiene fix (line 102) |
| `tests/core/orphan-cleaner-ipc.test.ts` | 7 | update mock surface |

### New files (Self-security W4-W5)

| File | Task | Responsibility |
|------|------|----------------|
| `src/api/terminal/prompt-guard.ts` | 8 | input pattern matcher |
| `src/api/terminal/command-guard.ts` | 9 | shell-kind deny-list, default-deny on host != 127.0.0.1 |
| `src/api/terminal/outbound-limiter.ts` | 10 | per-tenant daily byte quota |
| `src/api/terminal/audit-integrity.ts` | 12 | HMAC-SHA256 append-only chain encode + verify |
| `src/cli/commands/audit-verify.ts` | 12 | deckent audit verify CLI command |
| `tests/orchestra/sprint-planner-debt-injection.test.ts` | 1 | auto-debt scope inheritance |
| `tests/orchestra/sprint-planner-orphan-cleanup.test.ts` | 2 | re-plan orphan cleanup |
| `tests/core/dep0190-shell-fix.test.ts` | 3 | spawn options shell win32-only assertion |
| `tests/core/coverage-gate-split.test.ts` | 4 | hard-floor immutability + aspirational mutability |
| `tests/cli/doctor-memory-v2.test.ts` | 6 | doctor false-positive YOK on Memory V2 install |
| `tests/security/prompt-guard.test.ts` | 8 | I1+I2 invariants + pattern matching |
| `tests/security/command-guard.test.ts` | 9 | I3 invariant + localhost bypass |
| `tests/security/outbound-limiter.test.ts` | 10 | I5 invariant + warn/kill thresholds |
| `tests/api/terminal/auth-provider-mtls.test.ts` | 11 | interface contract |
| `tests/api/terminal/audit-integrity.test.ts` | 12 | I4 invariant + chain verify + tamper detect |

### Hooked files (W4-W5 minimal touch — add interceptor calls only)

| File | Tasks | Hook |
|------|-------|------|
| `src/api/terminal/ws-gateway.ts` | 8, 10 | promptGuard.check + outboundLimiter.track on send |
| `src/api/terminal/session-manager.ts` | 9 | commandGuard.check in write() path |
| `src/api/terminal/audit.ts` | 12 | auditIntegrity.encode in record() |
| `src/api/terminal/auth-provider.ts` | 11 | extend AuthProvider interface |
| `src/api/terminal/types.ts` | 8, 9, 10, 12 | extend AuditAction enum |
| `src/core/memory-store.ts` | 12 | non-destructive ALTER + chain accessors |
| `src/core/memory-types.ts` | 12 | extend MemoryEntryV2 with HMAC fields |

---

## Wave 1 — Planner P0 (sequential, same file)

### Task 1: Auto-debt empty-scope inheritance

**Files:**
- Modify: `src/orchestra/sprint-planner.ts` (line 197-216)
- Create: `tests/orchestra/sprint-planner-debt-injection.test.ts`
- Modify: `src/core/types.ts` (extend DebtEntry)

- [ ] **Step 1: Read current implementation**

Run: grep for `debt-injection` or `prependDebtTask` patterns; capture existing scope assignment around sprint-planner.ts line 197-216.

- [ ] **Step 2: Write failing test (RED) — see plan code blocks**

Test file asserts: (a) origin scope inheritance, (b) verified-no-result skip, (c) legacy fallback to broad scope.

- [ ] **Step 3: Run test, expect FAIL**

`npx vitest run tests/orchestra/sprint-planner-debt-injection.test.ts`

- [ ] **Step 4: Implement `injectCriticalDebtTasks()` in sprint-planner.ts**

Exports new function: takes `debts[]` + `sprintId`, returns `Task[]`. Skips `class:'verified-no-result'`; uses `debt.originScope` when present; falls back to broad `{ directories: ['src/'], filesWrite: ['src/'] }` for legacy.

- [ ] **Step 5: Extend DebtEntry in src/core/types.ts**

Add optional `originScope?: { directories: string[]; filesWrite: string[] }` and `class?: 'verified-no-result' | 'standard'`.

- [ ] **Step 6: Run test, expect PASS**

3 tests green.

- [ ] **Step 7: tsc + commit**

`npm run lint` exit 0; commit message: `fix(planner-w1-1): auto-debt scope inheritance + verified-no-result skip`.

---

### Task 2: Re-plan orphan task file cleanup

**Files:**
- Modify: `src/orchestra/sprint-planner.ts` (extend with cleanupOrphanTaskFiles)
- Create: `tests/orchestra/sprint-planner-orphan-cleanup.test.ts`

- [ ] **Step 1: Write failing test (RED)**

Test asserts: (a) files not in newIds Set are unlinked, (b) dryRun mode preserves files, (c) cross-sprint files ignored.

- [ ] **Step 2: Run test, expect FAIL**

`cleanupOrphanTaskFiles` not exported.

- [ ] **Step 3: Implement cleanupOrphanTaskFiles() in sprint-planner.ts**

Function signature: `(projectRoot: string, sprintId: string, newTaskIds: Set<string>, opts?: { dryRun?: boolean }): string[]`. Reads `.tasks/`, filters by `task-{sprint-num}-` prefix, removes files whose id-slot is not in newTaskIds. Returns list of removed file paths.

- [ ] **Step 4: Wire into re-plan flow**

After plan rewrite, call `cleanupOrphanTaskFiles()` with `new Set(tasks.map(t => t.id))`.

- [ ] **Step 5: Run test, expect PASS**

3 tests green.

- [ ] **Step 6: tsc + commit**

Commit: `fix(planner-w1-2): re-plan orphan task file cleanup`.

---

## Wave 2 — Discipline gate (parallel, independent files)

### Task 3: DEP0190 shell:true removal

**Files:**
- Modify: `src/core/plugin-hooks.ts` (line 395, 577)
- Modify: `src/orchestra/baseline-tracker.ts` (line 85)
- Create: `tests/core/dep0190-shell-fix.test.ts`

- [ ] **Step 1: Inspect existing safe pattern in src/providers/subprocess.ts:147**

Pattern: `shell: process.platform === 'win32'` — npm/npx .cmd resolution Windows-only.

- [ ] **Step 2: Write failing test (RED)**

Test asserts spawn options.shell === false on linux/darwin (3 call sites), === true on win32.

- [ ] **Step 3: Replace 3 call sites**

In plugin-hooks.ts (lines 395, 577) and baseline-tracker.ts (line 85): replace `shell: true` with `shell: process.platform === 'win32'`.

- [ ] **Step 4: Run test, expect PASS**

3 tests green.

- [ ] **Step 5: Verify DEP0190 warning eliminated**

Run with `--trace-deprecation`: no DEP0190 output.

- [ ] **Step 6: Commit**

`fix(planner-w2-3): DEP0190 shell:true win32-only conditional`.

---

### Task 4: Coverage hard-floor / aspirational split

**Files:**
- Modify: `src/core/config.ts` (line 554)
- Modify: `src/orchestra/sprint-finalizer.ts` (line 413, 450)
- Modify: `src/orchestra/sprint-controller.ts` (line 679)
- Create: `tests/core/coverage-gate-split.test.ts`

- [ ] **Step 1: Inspect current coverage_threshold usage**

grep all references; capture finalizer auto-lowering logic + controller EVALUATE gate wire.

- [ ] **Step 2: Write failing test (RED) — 4 cases**

(a) defaults coverage_hard_floor=50, coverage_aspirational=90; (b) adjustCoverageThreshold tunes only aspirational; (c) never below floor; (d) legacy coverage_threshold maps to aspirational.

- [ ] **Step 3: Extend DeckentConfig + DEFAULT_CONFIG**

Add coverage_hard_floor: 50 + coverage_aspirational: 90. Mark coverage_threshold as @deprecated.

- [ ] **Step 4: Update sprint-finalizer.ts adjustCoverageThreshold()**

New signature: takes config + avgCoverage, returns config with new coverage_aspirational only (hard-floor immutable).

- [ ] **Step 5: Update sprint-controller.ts:679 EVALUATE wire**

Use `config.coverage_hard_floor` (immutable floor) for the gate.

- [ ] **Step 6: Run test, expect PASS**

4 tests green.

- [ ] **Step 7: Commit**

`fix(planner-w2-4): coverage gate hard-floor / aspirational split`.

---

### Task 7: CI-only test flakes — portable PID liveness + mock hygiene

**Files:**
- Create: `src/core/pid-liveness.ts`
- Modify: `src/orchestra/` callers of process.kill(pid, 0)
- Modify: `tests/cli/archive-debt.test.ts` (line 102)
- Modify: `tests/core/orphan-cleaner-ipc.test.ts`

- [ ] **Step 1: Extract isPidAlive() into src/core/pid-liveness.ts**

Implementation: on linux parse /proc/{pid}; on darwin/win32 fall back to process.kill(pid, 0) with EPERM/ESRCH error-code check.

- [ ] **Step 2: Replace existing call sites**

grep `process\.kill.*,\s*0` in src/; replace with `isPidAlive(pid)` import + call.

- [ ] **Step 3: Update tests/core/orphan-cleaner-ipc.test.ts mock**

Mock `../../src/core/pid-liveness.js` with vi.mocked(isPidAlive); set per-test behavior.

- [ ] **Step 4: Fix tests/cli/archive-debt.test.ts:102 mock hygiene**

Switch vi.mock('node:fs') to explicit factory + importOriginal pattern (includes mkdirSync, writeFileSync, existsSync).

- [ ] **Step 5: Run locally + with CI=true env**

Both modes PASS.

- [ ] **Step 6: Commit**

`fix(planner-w2-7): CI-only test flakes — portable PID liveness + mock hygiene`.

---

## Wave 3 — Memory V2 cascade + frontend

### Task 5: Dashboard TS errors + root lint wire

**Files:**
- Modify: `src/dashboard/src/components/WorkerCard.tsx` (line ~127)
- Modify: `src/dashboard/src/pages/DashboardPage.tsx` (line ~284)
- Create/modify: `src/dashboard/src/i18n/types.ts`
- Modify: `package.json` (lint script)

- [ ] **Step 1: Reproduce TS2345**

`cd src/dashboard && npx tsc --noEmit` — capture errors at WorkerCard:127 + DashboardPage:284.

- [ ] **Step 2: Split translator types in src/dashboard/src/i18n/types.ts**

`Translator` (strict literal-union key) for i18n module internals. `TranslatorProp` (relaxed `key: string`) for component prop boundaries.

- [ ] **Step 3: Update WorkerCard.tsx + DashboardPage.tsx**

Change prop type from Translator to TranslatorProp.

- [ ] **Step 4: Verify dashboard tsc clean**

`cd src/dashboard && npx tsc --noEmit` exit 0.

- [ ] **Step 5: Wire dashboard tsc into root lint script**

package.json: `"lint": "tsc --noEmit && tsc --noEmit -p src/dashboard/tsconfig.json"`.

- [ ] **Step 6: Run root lint**

`npm run lint` exit 0.

- [ ] **Step 7: Commit**

`fix(planner-w3-5): dashboard TS contravariance + root lint wire`.

---

### Task 6: doctor DECISIONS.md obsolete + cascade cleanup

**Files:**
- Modify: `src/cli/commands/doctor.ts` (line ~193)
- Modify: `src/core/constants.ts` (line 37)
- Modify: `src/orchestra/debt-manager.ts` (line 481)
- Modify: `src/orchestra/sprint-docs-helpers.ts` (line 142)
- Modify: `src/orchestra/authority-enforcer.ts` (line 118)
- Create: `tests/cli/doctor-memory-v2.test.ts`

- [ ] **Step 1: Write failing test (RED)**

Test bootstraps Memory V2 install (`memory.db` + `exports/decisions.md`, no `DECISIONS.md`); asserts doctor reports no DECISIONS.md error.

- [ ] **Step 2: Update doctor.ts:193**

Replace `requiredFiles = [..., DECISIONS_FILE]` with accept-either pattern: check `.brain/memory.db` OR `.brain/exports/decisions.md`.

- [ ] **Step 3: Deprecate DECISIONS_FILE in constants.ts:37**

Add @deprecated JSDoc tag; keep export for backward compat.

- [ ] **Step 4: Empty DECAY_EXEMPT in debt-manager.ts:481**

Memory V2 has entry-level decay_exempt; the path-based set is obsolete.

- [ ] **Step 5: Update sprint-docs-helpers.ts:142 reference**

Change "See .brain/DECISIONS.md" text to "See .brain/exports/decisions.md".

- [ ] **Step 6: Remove DECISIONS.md from authority-enforcer.ts:118 allow-list**

Path-based rule obsolete; brain-write enforcement at MemoryStore API level.

- [ ] **Step 7: Run test, expect PASS**

2 tests green.

- [ ] **Step 8: Full regression check**

`npx vitest run tests/cli/ tests/core/ tests/orchestra/` — no new fails.

- [ ] **Step 9: Commit**

`fix(planner-w3-6): doctor Memory-V2 alignment + cascade cleanup`.

---

## Wave 4 — Self-security core (parallel — interceptor pattern)

### Task 8: Prompt guard (I1 + I2 invariants)

**Files:**
- Create: `src/api/terminal/prompt-guard.ts`
- Modify: `src/api/terminal/ws-gateway.ts` (pre-bridge hook)
- Modify: `src/api/terminal/types.ts` (extend AuditAction)
- Create: `tests/security/prompt-guard.test.ts`

- [ ] **Step 1: Extend AuditAction enum in types.ts**

Add: `prompt_guard_block`, `command_guard_block`, `outbound_warn`, `outbound_kill`, `audit_tamper_detect`.

- [ ] **Step 2: Write failing test (RED) — 5 cases**

(a) base64 blob >=256, (b) OSC escape, (c) curl|sh, (d) benign passes, (e) audit content regex `^[a-z_]+:[0-9]+$` (I2 signal-only).

- [ ] **Step 3: Implement matchPromptPatterns() + encodeGuardSignal()**

3 regex patterns: BASE64_BLOB, OSC_ESCAPE, CURL_PIPE_SHELL. Return `{ pattern_id, signal_type, offset }` or null.

- [ ] **Step 4: Hook ws-gateway.ts pre-bridge**

Before forwarding input to PTY: call matchPromptPatterns(); on match, send `{ type: 'guard_block', pattern_id, signal }` to socket (I1 no silent drop), record audit with content=signal (I2 no raw bytes), do not write to PTY.

- [ ] **Step 5: Write I1 integration test**

Model after `tests/api/terminal/ws-gateway.test.ts` from sub-project #1. Assert: client receives guard_block, audit.record called with signal, session.write NOT called.

- [ ] **Step 6: Run tests, expect PASS**

5 unit + 1 integration green.

- [ ] **Step 7: Commit**

`feat(security-w4-8): prompt-guard input pattern matcher (I1+I2)`.

---

### Task 9: Command guard (I3 invariant)

**Files:**
- Create: `src/api/terminal/command-guard.ts`
- Modify: `src/api/terminal/session-manager.ts` (hook in write())
- Create: `tests/security/command-guard.test.ts`

- [ ] **Step 1: Write failing test (RED) — 9 cases**

(a-b) localhost never blocks (rm -rf /, mkfs); (c-h) remote blocks each of 6 patterns; (i) benign passes; extra: non-shell kind never blocks.

- [ ] **Step 2: Implement checkCommandGuard()**

6 patterns: rm_rf_root, mkfs, dd_of_dev, fork_bomb, ssh_keygen_rewrite, authorized_keys_write. Return match or null. Bypass if `meta.kind != 'shell'` OR `meta.host in ['127.0.0.1', '::1', 'localhost']`.

- [ ] **Step 3: Hook session-manager.ts write() path**

On match: audit.record action='command_guard_block' + signal; this.kill(sessionId); return.

- [ ] **Step 4: Run tests, expect PASS**

9 tests green.

- [ ] **Step 5: Commit**

`feat(security-w4-9): command-guard remote-shell deny-list (I3)`.

---

### Task 10: Outbound rate-limit (I5 invariant)

**Files:**
- Create: `src/api/terminal/outbound-limiter.ts`
- Modify: `src/api/terminal/ws-gateway.ts` (send hook)
- Modify: `src/core/config.ts` (add terminal.outboundDailyQuotaBytes)
- Create: `tests/security/outbound-limiter.test.ts`

- [ ] **Step 1: Write failing test (RED) — 4 cases**

(a) per-tenant isolation; (b) warn at warnFraction*quota (one-shot per window); (c) kill at quota; (d) window reset.

- [ ] **Step 2: Implement OutboundLimiter class**

State: `Map<TenantId, { bytes, warned, windowStart }>`. track(tenantId, bytes): rotates window after 24h; returns `{ action: 'pass'|'warn'|'kill', bytesUsed, bytesRemaining }`. usage(tenantId): returns bytes. advanceWindow(): test-only force rotation.

- [ ] **Step 3: Add terminal.outboundDailyQuotaBytes config**

Default 1_073_741_824 (1 GB).

- [ ] **Step 4: Hook ws-gateway.ts send path**

On warn: audit + send `{ type: 'outbound_warn', bytesUsed, bytesRemaining }`. On kill: audit + sessionManager.kill + socket.close(4429, 'outbound quota exceeded').

- [ ] **Step 5: Run tests, expect PASS**

4 tests green.

- [ ] **Step 6: Commit**

`feat(security-w4-10): outbound rate-limit per-tenant daily quota (I5)`.

---

## Wave 5 — Self-security ileri (parallel)

### Task 11: mTLS hook — AuthProvider interface extension

**Files:**
- Modify: `src/api/terminal/auth-provider.ts`
- Modify: `src/api/terminal/ws-gateway.ts` (warning log when cert presented but no impl)
- Create: `tests/api/terminal/auth-provider-mtls.test.ts`

- [ ] **Step 1: Write failing test (RED) — 3 cases**

(a) AuthProvider interface exposes optional verifyClientCert; (b) LocalTokenAuthProvider returns undefined; (c) custom MtlsProvider impl works.

- [ ] **Step 2: Extend AuthProvider interface in auth-provider.ts**

Add: `verifyClientCert?(cert: Buffer): Promise<TenantId | null>;` (optional). LocalTokenAuthProvider deliberately does NOT implement.

- [ ] **Step 3: Gateway warning log**

In ws-gateway.ts upgrade handler: if client cert present (req.socket.getPeerCertificate?.()) but auth.verifyClientCert undefined, log warning "client presented mTLS certificate but AuthProvider has no verifyClientCert() — falling back to localhost token. Implement mTLS in sub-project #3."

- [ ] **Step 4: Run tests, expect PASS**

3 tests green; tsc clean.

- [ ] **Step 5: Commit**

`feat(security-w5-11): mTLS hook — AuthProvider interface extension`.

---

### Task 12: Self-audit-of-audit HMAC chain + verify CLI (I4 invariant)

**Files:**
- Create: `src/api/terminal/audit-integrity.ts`
- Create: `src/cli/commands/audit-verify.ts`
- Modify: `src/api/terminal/audit.ts` (hook into record())
- Modify: `src/core/memory-store.ts` (schema ALTER + chain accessors + key load)
- Modify: `src/core/memory-types.ts` (HMAC fields on audit entries)
- Modify: `src/cli/index.ts` (register audit-verify command)
- Modify: `.gitignore` (ensure .deckent/audit-key)
- Create: `tests/api/terminal/audit-integrity.test.ts`
- Dependencies: 176-008, 176-009, 176-010 (audit hooks must exist)

- [ ] **Step 1: Write failing test (RED) — 5 cases**

(a) computeHmac determinism; (b) chain link integrity; (c) verifyAuditChain clean; (d) verifyAuditChain detects UPDATE tamper; (e) audit-key load.

- [ ] **Step 2: Implement audit-integrity.ts**

`computeHmac(secret, ev)` HMAC-SHA256 with prevHmac || timestamp || tenantId || action || content. `verifyAuditChain({ projectRoot, secret })` opens MemoryStore, walks audit rows in id-order, recomputes expected hmac per row, returns `{ ok, firstTamperedRowId, rowsVerified }`.

- [ ] **Step 3: Schema migration in memory-store.ts**

PRAGMA table_info(entries) check; if audit_hmac column missing, run ALTER TABLE entries ADD COLUMN audit_prev_hmac TEXT + ADD COLUMN audit_hmac TEXT (additive, idempotent — DROP/rebuild YASAK).

- [ ] **Step 4: Add insertAuditWithHmac() + queryAuditChain() to MemoryStore**

`insertAuditWithHmac(ev)`: query last audit row's hmac (prevHmac); compute new hmac; INSERT with prev_hmac + hmac. `queryAuditChain()`: SELECT type='audit' ORDER BY id ASC.

- [ ] **Step 5: Hook audit.ts record() → insertAuditWithHmac()**

Replace existing insert with the new chain-aware variant.

- [ ] **Step 6: Audit key management — loadOrCreateAuditKey()**

`.deckent/audit-key` file (hex string of 32 random bytes). Generate on first call (mode 0600). Add to .gitignore.

- [ ] **Step 7: Implement deckent audit verify CLI**

Read `.deckent/audit-key`; call verifyAuditChain(); on clean: print row count + exit 0; on tamper: print "TAMPER DETECTED — first invalid row id=X" + exit 1.

- [ ] **Step 8: Run tests, expect PASS**

5 tests green.

- [ ] **Step 9: Manual tamper smoke**

Bootstrap audit events; sqlite3 UPDATE one content; run deckent audit verify; expect exit 1 with row id.

- [ ] **Step 10: Commit**

`feat(security-w5-12): audit HMAC chain + verify CLI (I4)`.

---

## Self-Review

- **Spec coverage:** all 12 tasks map 1:1 to spec §1b; I1-I5 covered by Tasks 8, 9, 10, 12 explicitly.
- **Placeholder scan:** clean.
- **Type consistency:** Translator vs TranslatorProp (Task 5); AuditAction enum extensions reused across Tasks 8-12; DebtEntry.originScope + class (Task 1) consumed in Task 1 only.
- **No dangling references:** all new exports defined in their owning task before being called elsewhere.

---

## DIRECTIVES.md content for Sprint 176 launch

This is ready-to-paste DIRECTIVES content. Pipe through `deckent_set_directives` when the user authorises sprint launch.

```markdown
# DIRECTIVES — Sprint 176: Sub-project #2 — Planner State-Hygiene + Self-Security

## Spec + Plan Referansları

- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-21-sub-project-2.md`
- **Spec (doğrulanmış gerçek):** `docs/superpowers/specs/2026-05-21-sub-project-2-design.md` — beş güvenlik invariant'ı (§4 I1-I5) + verdict matrix (§5).
- **Predecessor:** Sub-project #1 (Sprint 175, PR #16 merged 2026-05-20).

## Goal

12 task ile beta-blocker'ı kapat: 7 planner state-hygiene defect + 5 self-security guard. Planner fix'leri pure code-quality (sıfır mimari değişiklik); self-security interceptor pattern (5 yeni dosya, mevcut kontratlar dokunulmaz). Audit non-destructive HMAC chain extension. June 1 2026 OSS beta gate.

## Brain Planning Instructions

Mode: **structured**. **Self-modifying / dogfood: ZORUNLU sequential** (self-modifying-detector tetikler). Wave: 5 (W1->W5, plandaki sıra). Max workers: 2. `dependency_pipeline_enabled: false` -> Wave geçişleri + GATE Brain manuel (ADR-047). Provider: claude. Alperen review: sprint başlangıç + her wave GATE + finalize. Build/publish son doğrulama Alperen.

## Worker Contract

- **Kod YAZAR** (planner fix + security yeni dosya). Scope DIŞINA yazma YASAK (ADR-037 advisory).
- **TDD ZORUNLU:** plandaki RED->GREEN aynen.
- **ESM:** `.js` uzantısı zorunlu.
- **memory.db:** SADECE additive migration (Task 12). DROP/rebuild YASAK.
- **Güvenlik invariant'ı (spec §4):** I1 silent-drop YOK, I2 ham byte audit YOK, I3 default-deny remote-shell, I4 append-only HMAC chain, I5 tenant-scope isolation.
- `.tasks/task-<id>.result`: gerçek vitest çıktısına göre selfAssessment + filesChanged + coverage + testsPassed + notes.

## GO/NO_GO Criteria

- **GATE-1 (W1):** Task 1+2 PASS; sprint-planner testleri yeşil.
- **GATE-2 (W2):** Task 3+4+7 PASS; DEP0190 warning yok; coverage hard-floor immutable; lokal=CI parity.
- **GATE-3 (W3):** Task 5+6 PASS; dashboard tsc temiz; root lint dashboard'ı kapsıyor; doctor Memory-V2 clean install false-positive yok.
- **GATE-4 (W4):** Task 8+9+10 PASS; I1+I2+I3+I5 invariant'ları yeşil.
- **GATE-5 (W5):** Task 11+12 PASS; manuel tamper smoke -> deckent audit verify exit 1.

**Sprint verdict:** GO = 12/12 DONE. GO_WITH_TECH_DEBT = 10-11 DONE + <=2 GWT (W1-W3>=5 DONE, W4>=2 DONE). NO_GO = W1 ihlali veya I1-I5 invariant ihlali (otomatik NO_GO, tech debt KABUL EDİLMEZ).

---

## Task 1: W1-1 — Auto-debt empty-scope inheritance
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-planner.ts, src/core/types.ts, tests/orchestra/sprint-planner-debt-injection.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Plan Task 1 adımları. CRITICAL debt -> task dönüşümünde origin scope inherit; verified-no-result skip + honest closure. **Kanıt:** vitest 3 test PASS.
**Test:** TDD — 3 test (inheritance + skip + legacy fallback).

---

## Task 2: W1-2 — Re-plan orphan task file cleanup
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-planner.ts, tests/orchestra/sprint-planner-orphan-cleanup.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: ["176-001"]

### Description
Plan Task 2 adımları. cleanupOrphanTaskFiles() ekle + re-plan wire. dryRun + cross-sprint isolation. **Kanıt:** vitest 3 test PASS.
**Test:** TDD — 3 test.

---

## Task 3: W2-3 — DEP0190 shell:true win32-only conditional
- Model: sonnet
- Effort: low
- Skills: typescript-expert, security-specialist
- Agent: security-auditor
- Files: src/core/plugin-hooks.ts, src/orchestra/baseline-tracker.ts, tests/core/dep0190-shell-fix.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
Plan Task 3 adımları. 3 call-site shell:true -> shell:platform===win32. subprocess.ts:147 deseni. **Kanıt:** vitest 3 test + --trace-deprecation temiz.
**Test:** TDD — 3 test (linux/win32 variants).

---

## Task 4: W2-4 — Coverage hard-floor / aspirational split
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: refactorer
- Files: src/core/config.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-controller.ts, tests/core/coverage-gate-split.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
Plan Task 4 adımları. coverage_hard_floor (immutable) + coverage_aspirational (auto-learn) split. **Kanıt:** vitest 4 test PASS.
**Test:** TDD — 4 test.

---

## Task 5: W3-5 — Dashboard TS errors + root lint wire
- Model: opus
- Effort: normal
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/src/i18n/types.ts, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/pages/DashboardPage.tsx, package.json
- Scope: src/dashboard/, ./

### Description
Plan Task 5 adımları. Translator + TranslatorProp split; root lint dashboard tsc wire. **Kanıt:** dashboard tsc + root lint exit 0.
**Test:** Type-check only.

---

## Task 6: W3-6 — doctor DECISIONS.md obsolete + 5-file cascade
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: refactorer
- Files: src/cli/commands/doctor.ts, src/core/constants.ts, src/orchestra/debt-manager.ts, src/orchestra/sprint-docs-helpers.ts, src/orchestra/authority-enforcer.ts, tests/cli/doctor-memory-v2.test.ts
- Scope: src/cli/, src/core/, src/orchestra/, tests/cli/

### Description
Plan Task 6 adımları. Memory-V2 ADR source kabul; cascade 4 dosya. **Kanıt:** vitest 2 test PASS; clean install false-positive yok.
**Test:** TDD — 2 test.

---

## Task 7: W2-7 — CI-only test flakes (PID portability + mock hygiene)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert, ci-testing
- Agent: bug-fixer
- Files: src/core/pid-liveness.ts, tests/cli/archive-debt.test.ts, tests/core/orphan-cleaner-ipc.test.ts, src/orchestra/
- Scope: src/core/, src/orchestra/, tests/

### Description
Plan Task 7 adımları. pid-liveness.ts extract; mock factory hijyen. **Kanıt:** lokal + CI=true aynı sonuç.
**Test:** TDD — unit + mock surface.

---

## Task 8: W4-8 — Prompt guard (I1+I2)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/api/terminal/prompt-guard.ts, src/api/terminal/ws-gateway.ts, src/api/terminal/types.ts, tests/security/prompt-guard.test.ts
- Scope: src/api/terminal/, tests/security/

### Description
Plan Task 8 adımları. matchPromptPatterns 3 pattern (base64/OSC/curl-pipe); ws-gateway pre-bridge hook. **Kanıt:** vitest 5 unit + 1 integration PASS; I1 no silent drop; I2 no raw payload.
**Test:** TDD — 5 pattern + 1 integration.

---

## Task 9: W4-9 — Command guard (I3 default-deny remote)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/api/terminal/command-guard.ts, src/api/terminal/session-manager.ts, tests/security/command-guard.test.ts
- Scope: src/api/terminal/, tests/security/

### Description
Plan Task 9 adımları. 6 deny pattern; shell-kind + host!=127.0.0.1; session-manager write() hook. **Kanıt:** vitest 9 test PASS; localhost bypass + remote block.
**Test:** TDD — 9 test.

---

## Task 10: W4-10 — Outbound rate-limit (I5 tenant isolation)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: api-builder
- Files: src/api/terminal/outbound-limiter.ts, src/api/terminal/ws-gateway.ts, src/core/config.ts, tests/security/outbound-limiter.test.ts
- Scope: src/api/terminal/, src/core/, tests/security/

### Description
Plan Task 10 adımları. OutboundLimiter class (per-tenant 24h, warn/kill); 1GB default. **Kanıt:** vitest 4 test PASS; tenant isolation; warn/kill threshold.
**Test:** TDD — 4 test.

---

## Task 11: W5-11 — mTLS hook (AuthProvider interface)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Agent: architect
- Files: src/api/terminal/auth-provider.ts, src/api/terminal/ws-gateway.ts, tests/api/terminal/auth-provider-mtls.test.ts
- Scope: src/api/terminal/, tests/api/terminal/

### Description
Plan Task 11 adımları. AuthProvider.verifyClientCert? opsiyonel; LocalTokenAuthProvider undefined; gateway warn log. **Kanıt:** vitest 3 test PASS; tsc temiz.
**Test:** TDD — 3 test.

---

## Task 12: W5-12 — Self-audit-of-audit HMAC chain + verify CLI (I4)
- Model: opus
- Effort: high
- Skills: security-specialist, database-migration, typescript-expert
- Agent: data-engineer
- Files: src/api/terminal/audit-integrity.ts, src/api/terminal/audit.ts, src/core/memory-store.ts, src/core/memory-types.ts, src/cli/commands/audit-verify.ts, src/cli/index.ts, .gitignore, tests/api/terminal/audit-integrity.test.ts
- Scope: src/api/terminal/, src/core/, src/cli/, tests/api/terminal/, ./
- Dependencies: ["176-008", "176-009", "176-010"]

### Description
Plan Task 12 adımları. HMAC-SHA256 chain; additive ALTER (DROP/rebuild YASAK); .deckent/audit-key mode 0600 gitignored; deckent audit verify CLI. **Kanıt:** vitest 5 test PASS + manual tamper smoke (UPDATE -> verify exit 1).
**Test:** TDD — 5 test.
```

---

## Plan complete and saved to `docs/superpowers/plans/2026-05-21-sub-project-2.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints.

**Which approach?**
