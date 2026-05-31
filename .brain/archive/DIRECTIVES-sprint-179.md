# DIRECTIVES — Sprint 179: Sub-project #2 + Bug A Foundation (Crisis Stabilization §5)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §5 (Sprint 179: 13 task, Bug A foundation + sub-project #2 12 task)
- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-23-sprint-179-subproject-2-plus-bugA.md` — W0 Bug A TDD breakdown + W1-W5 sub-project #2 reuse referansları
- **Sub-project #2 design (W1-W5 canonical):** `docs/superpowers/specs/2026-05-21-sub-project-2-design.md` — 5 invariant (I1-I5)
- **Sub-project #2 plan (W1-W5 TDD adımları):** `docs/superpowers/plans/2026-05-21-sub-project-2.md` — task IDs 176-* → 179-*
- **Sprint 178 forensik (Bug A discovery):** `.deckent/sprint-178-events.jsonl`
- **Predecessor:** Sprint 178 (9 DONE / 0 debt / 2 NO_GO + auto-debt cluster). Worker rollback canlı (Sprint 177), TOPP B+C continuous-dispatch canlı (Sprint 178 ADR-064).

## Goal

13 task ile Crisis Stabilization §5: **Bug A foundation** (W0 — dependency aggregate fix-aware) + **sub-project #2 12 task** (W1-W3 planner state-hygiene + W4-W5 self-security guards). June 1 2026 OSS beta gate'in son MUST sprinti — W0 + W4-W5 beta blocker (RCE surface + downstream tracking).

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential (src/orchestra + src/agents + src/api/terminal hepsi self-modifying). Wave: 6 (W0 → W1 → W2 → W3 → W4 → W5; W0 sequential 1-task; W1 sequential same-file; W2-W3-W4-W5 parallel intra-wave). Max workers: 2. `dependency_pipeline_enabled: false` → Brain manuel wave gates (ADR-047). Provider: claude. **Worker rollback canlı + TOPP continuous-dispatch canlı.**

### Dependency strategy (Sprint 176/178 drift fix)

Sprint 176 + 178'de Dependencies field plan-slot ID kayması yaşandı: Brain auto-debt prepend ettiğinde task ID'leri shift olurdu, "Dependencies: [178-002]" yanlış disk task'a işaret ederdi. **Sprint 179 çözümü: Dependencies field KULLANMA.** Her task `## Task N:` heading'inde **wave prefix** taşır (W0/W1/W2/W3/W4/W5). Brain manuel wave gate (deckent-dev policy ADR-047) ile orchestre edilir:

- W0 önce sequential bitir → W1 başlat
- W1 sequential (same file sprint-planner.ts) → W2 başlat
- W2-W3-W4-W5 wave'leri içinde paralel (max 2 worker), her wave bitince Alperen gate
- W5-12 (audit HMAC chain) wave-implicit olarak W4-8/W4-9/W4-10'a bağlı (W4 wave bitmeden W5 başlamaz)
- W1-2 same-file sequential disiplini self-modifying-detector tarafından zorunlu

Bu strateji plan-slot ID renaming'e karşı %100 immun.

## Worker Contract

- **Kod YAZAR** (W0 4 dosya modify + 1 yeni test; W1-W5 12 task plan'a göre — yeni dosya: prompt-guard, command-guard, outbound-limiter, audit-integrity, audit-verify CLI + pid-liveness wire). Scope DIŞINA yazma YASAK (advisory + worker rollback).
- **TDD ZORUNLU:** her task RED→GREEN (plan adımları aynen).
- **ESM:** `.js` uzantısı zorunlu (Node16 resolution).
- **memory.db:** SADECE additive ALTER (W5-12 audit_prev_hmac + audit_hmac kolonları). DROP/rebuild YASAK.
- **Worker rollback aktif:** NO_GO scope writes auto-revert.
- **TaskRecord schema (W0 sonrası tüm task'lar için):** `.result` dosyası `originalTaskId: null` (main) veya `originalTaskId: "179-..."` (fix retry) içermeli — aggregate verdict bunu kullanır.
- **Güvenlik invariant'ları (sub-project #2 spec §4):** I1 silent-drop YOK, I2 ham byte audit YOK, I3 default-deny remote-shell, I4 append-only HMAC chain, I5 tenant-scope isolation. İhlal = otomatik NO_GO.
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes (honest-gate kalibrasyon).

## GO/NO_GO Criteria

- **GATE-0 (W0):** Task 179-W0-1 PASS — 5 test (aggregate / event / planDispatch / digest / honest-gate intact). Bug A foundation downstream'i ZORUNLU unblock eder.
- **GATE-1 (W1):** W1-1 + W1-2 PASS — sprint-planner auto-debt scope inheritance + orphan cleanup yeşil.
- **GATE-2 (W2):** W2-3 + W2-4 + W2-7 PASS — DEP0190 warning yok, coverage hard-floor immutable, lokal+CI parity.
- **GATE-3 (W3):** W3-5 + W3-6 PASS — dashboard tsc temiz, root lint kapsıyor, doctor Memory-V2 clean install false-positive yok.
- **GATE-4 (W4) ★ MUST:** W4-8 + W4-9 + W4-10 PASS — I1+I2+I3+I5 invariant testleri yeşil (RCE surface kapanır).
- **GATE-5 (W5) ★ MUST:** W5-11 + W5-12 PASS — mTLS interface contract + I4 HMAC chain + manuel tamper smoke (`deckent audit verify` exit 1).

**Sprint verdict:**
- **GO** = 13/13 DONE
- **GO_WITH_TECH_DEBT** = 11-12/13 DONE + ≤2 GWT, **provided:** W0 DONE (downstream tracking) **+** W4+W5 ≥4/5 DONE (beta MUST — RCE surface). W1-W3 ≤2 GWT KABUL.
- **NO_GO** = W0 fail (aggregate broken) **veya** W4/W5 invariant ihlali (I1-I5) **veya** W4+W5 <4 DONE.

---

## Task 1: W0-1 — Dependency aggregate fix-aware (Bug A foundation)
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert, system-architect
- Agent: architect
- Files: src/orchestra/event-stream.ts, src/orchestra/result-evaluator.ts, src/orchestra/result-collector.ts, src/orchestra/prompt-god-template.ts, tests/orchestra/dependency-aggregate-fix-aware.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Plan §Wave 0 Task 179-W0-1. Sprint 178 forensik: ana NO_GO + fix DONE → downstream depStatuses "EXECUTING" gözüktü 22dk. Çözüm: `getAggregateVerdict()` + `DEPENDENCY_RESOLVED_BY_FIX` event channel + `planDispatch` aggregate kullanır + `buildDependenciesBlock` hem original hem latest-fix `.result` digest. **Honest-gate intact:** Brain re-evaluate UPDATE'i bloke etmez (Bug C/E dokunulmaz). **Kanıt:** vitest 5/5 PASS + tsc clean. **Test:** TDD — 5 case (aggregate / event / planDispatch / digest / honest-gate).

---

## Task 2: W1-1 — Auto-debt empty-scope inheritance
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-planner.ts, src/core/types.ts, tests/orchestra/sprint-planner-debt-injection.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sub-project #2 plan Task 1 adımları. CRITICAL debt → task dönüşümünde origin scope inherit; verified-no-result skip + honest closure mark. DebtEntry.originScope + class field eklenir. **Kanıt:** vitest 3 test PASS (inheritance + skip + legacy fallback).
**Test:** TDD — 3 test.

---

## Task 3: W1-2 — Re-plan orphan task file cleanup
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-planner.ts, tests/orchestra/sprint-planner-orphan-cleanup.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sub-project #2 plan Task 2 adımları. `cleanupOrphanTaskFiles()` ekle + re-plan wire. dryRun + cross-sprint isolation. **Kanıt:** vitest 3 test PASS (unlink + dryRun + cross-sprint).
**Test:** TDD — 3 test.

---

## Task 4: W2-3 — DEP0190 shell:true win32-only conditional
- Model: sonnet
- Effort: low
- Skills: typescript-expert, security-specialist
- Agent: security-auditor
- Files: src/core/plugin-hooks.ts, src/orchestra/baseline-tracker.ts, tests/core/dep0190-shell-fix.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
Sub-project #2 plan Task 3 adımları. 3 call-site `shell:true` → `shell: process.platform === 'win32'` (subprocess.ts:147 deseni). ADR-006 spawnSync güvenlik pattern'a uyum. **Kanıt:** vitest 3 test + `--trace-deprecation` temiz.
**Test:** TDD — 3 test (linux/darwin shell=false + win32 shell=true).

---

## Task 5: W2-4 — Coverage hard-floor / aspirational split
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: refactorer
- Files: src/core/config.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-controller.ts, tests/core/coverage-gate-split.test.ts
- Scope: src/core/, src/orchestra/, tests/core/

### Description
Sub-project #2 plan Task 4 adımları. `coverage_hard_floor` (immutable, default 50) + `coverage_aspirational` (auto-learn, default 90) split. EVALUATE gate hard-floor kullanır; finalizer sadece aspirational'ı ayarlar. **Kanıt:** vitest 4 test PASS (defaults + adjust mutability + immutable floor + legacy map).
**Test:** TDD — 4 test.

---

## Task 6: W2-7 — CI-only test flakes (PID portability + mock hygiene)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert, ci-testing
- Agent: bug-fixer
- Files: src/orchestra/ (process.kill call sites), tests/cli/archive-debt.test.ts, tests/core/orphan-cleaner-ipc.test.ts
- Scope: src/orchestra/, tests/

### Description
Sub-project #2 plan Task 7 adımları. Sprint 178 partial: `pid-liveness.ts` zaten shipped (Sprint 178-006 follow-up). Sprint 179 hijyen: kalan `process.kill(pid, 0)` call sites → `isPidAlive()`; archive-debt.test.ts:102 + orphan-cleaner-ipc.test.ts mock factory hygiene. **Kanıt:** lokal + `CI=true` aynı sonuç (2 test PASS her iki ortamda).
**Test:** TDD — call-site replace + mock surface hijyen.

---

## Task 7: W3-5 — Dashboard TS errors + root lint wire
- Model: opus
- Effort: normal
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Files: src/dashboard/src/i18n/types.ts, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/pages/DashboardPage.tsx, package.json
- Scope: src/dashboard/, ./

### Description
Sub-project #2 plan Task 5 adımları. `Translator` (strict) + `TranslatorProp` (relaxed) split — prop boundary contravariance. Root `lint` script dashboard tsc'yi ekler. **Kanıt:** `cd src/dashboard && npx tsc --noEmit` exit 0 + `npm run lint` exit 0.
**Test:** Type-check only.

---

## Task 8: W3-6 — doctor DECISIONS.md obsolete + 5-file cascade
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: refactorer
- Files: src/cli/commands/doctor.ts, src/core/constants.ts, src/orchestra/debt-manager.ts, src/orchestra/sprint-docs-helpers.ts, src/orchestra/authority-enforcer.ts, tests/cli/doctor-memory-v2.test.ts
- Scope: src/cli/, src/core/, src/orchestra/, tests/cli/

### Description
Sub-project #2 plan Task 6 adımları. Memory V2 source of truth: `.brain/memory.db` + `.brain/exports/decisions.md`. doctor accept-either check; DECISIONS_FILE @deprecated; DECAY_EXEMPT yol-bazlı temizle; sprint-docs-helpers + authority-enforcer reference güncel. **Kanıt:** vitest 2 test PASS; fresh `npm install` + `deckent doctor` false-positive YOK.
**Test:** TDD — 2 test.

---

## Task 9: W4-8 — Prompt guard (I1 + I2 invariants) ★ BETA MUST
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/api/terminal/prompt-guard.ts (NEW), src/api/terminal/ws-gateway.ts, src/api/terminal/types.ts, tests/security/prompt-guard.test.ts
- Scope: src/api/terminal/, tests/security/

### Description
Sub-project #2 plan Task 8 adımları. `matchPromptPatterns()` 3 pattern: BASE64_BLOB (≥256), OSC_ESCAPE (`\x1b]`), CURL_PIPE_SHELL (`curl ... | sh`). ws-gateway pre-bridge hook: match → block + structured audit (`pattern_id:offset`, ham byte YOK) + client `guard_block` event. **I1:** no silent drop (user görür). **I2:** audit content regex `^[a-z_]+:[0-9]+(:[a-z_]+)?$` (signal-only). **Kanıt:** vitest 5 unit + 1 integration PASS.
**Test:** TDD — 5 pattern case + 1 integration.

---

## Task 10: W4-9 — Command guard (I3 default-deny remote) ★ BETA MUST
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/api/terminal/command-guard.ts (NEW), src/api/terminal/session-manager.ts, tests/security/command-guard.test.ts
- Scope: src/api/terminal/, tests/security/

### Description
Sub-project #2 plan Task 9 adımları. 6 deny pattern: `rm_rf_root`, `mkfs`, `dd_of_dev`, `fork_bomb`, `ssh_keygen_rewrite`, `authorized_keys_write`. Bypass: `meta.kind != 'shell'` OR `meta.host in ['127.0.0.1', '::1', 'localhost']`. Remote'ta match → `command_guard_block` audit + `session.kill()`. **I3:** default-deny on host≠127.0.0.1 (`allowShellKind=true` ile birlikte). **Kanıt:** vitest 9 test PASS (localhost bypass + 6 remote pattern + benign + non-shell).
**Test:** TDD — 9 test.

---

## Task 11: W4-10 — Outbound rate-limit (I5 tenant isolation) ★ BETA MUST
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: api-builder
- Files: src/api/terminal/outbound-limiter.ts (NEW), src/api/terminal/ws-gateway.ts, src/core/config.ts, tests/security/outbound-limiter.test.ts
- Scope: src/api/terminal/, src/core/, tests/security/

### Description
Sub-project #2 plan Task 10 adımları. `OutboundLimiter` class: per-tenant 24h window (`Map<TenantId, { bytes, warned, windowStart }>`). `track()` → `{ action: 'pass'|'warn'|'kill', bytesUsed, bytesRemaining }`. Default quota 1 GB/24h. ws-gateway send hook: warn 50% → audit + client event; kill 100% → audit + close(4429). **I5:** tenant_id partition (cross-tenant leak 0). **Kanıt:** vitest 4 test PASS (per-tenant isolation + warn one-shot + kill threshold + window reset).
**Test:** TDD — 4 test.

---

## Task 12: W5-11 — mTLS hook (AuthProvider interface) ★ BETA MUST
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, security-specialist
- Agent: architect
- Files: src/api/terminal/auth-provider.ts, src/api/terminal/ws-gateway.ts, tests/api/terminal/auth-provider-mtls.test.ts
- Scope: src/api/terminal/, tests/api/terminal/

### Description
Sub-project #2 plan Task 11 adımları. `AuthProvider.verifyClientCert?(cert: Buffer): Promise<TenantId | null>` optional method. `LocalTokenAuthProvider` IMPL YOK (undefined döner, no-op). ws-gateway upgrade: client cert geldi ama auth.verifyClientCert undefined ise warn log "mTLS configured but not implemented — sub-project #3". **Kanıt:** vitest 3 test PASS (interface contract + LocalToken no-op + custom MtlsProvider impl). tsc clean.
**Test:** TDD — 3 test.

---

## Task 13: W5-12 — Audit HMAC chain + verify CLI (I4 invariant) ★ BETA MUST
- Model: opus
- Effort: high
- Skills: security-specialist, database-migration, typescript-expert
- Agent: data-engineer
- Files: src/api/terminal/audit-integrity.ts (NEW), src/api/terminal/audit.ts, src/core/memory-store.ts, src/core/memory-types.ts, src/cli/commands/audit-verify.ts (NEW), src/cli/index.ts, .gitignore, tests/api/terminal/audit-integrity.test.ts
- Scope: src/api/terminal/, src/core/, src/cli/, tests/api/terminal/, ./

### Description
Sub-project #2 plan Task 12 adımları. HMAC-SHA256 chain: `hmac(prev_hmac || timestamp || tenant_id || action || content_signal)`. memory.db ADDITIVE ALTER: `audit_prev_hmac TEXT` + `audit_hmac TEXT` kolonları (DROP/rebuild YASAK — [[feedback_db_silmek_yasak]]). `.deckent/audit-key` mode 0600 gitignored (32 random bytes, hex). `deckent audit verify` CLI: clean → exit 0; tamper → "TAMPER DETECTED — first invalid row id=X" → exit 1. **I4:** append-only chain (UPDATE/DELETE tamper-evident). **Kanıt:** vitest 5 test PASS + manuel tamper smoke (sqlite3 UPDATE → verify exit 1).
**Test:** TDD — 5 test + 1 manual smoke.
