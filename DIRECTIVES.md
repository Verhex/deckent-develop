# DIRECTIVES — Sprint 181: Recovery + Nervous Restart + Worker-Rollback Fix (Crisis Stabilization §7)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §7 (Sprint 181: 16 task, last beta-blocker sprint)
- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-25-sprint-181-recovery-nervous-restart.md` — Worker-rollback P0 fix + Sprint 179/180 deliverable recovery + Sprint 180 NO_GO closure + Beta launch
- **Sub-project #2 plan (W1-W2 re-write referansı):** `docs/superpowers/plans/2026-05-21-sub-project-2.md` — TDD breakdown her self-security task için
- **Sub-project #2 design (invariants I1-I5):** `docs/superpowers/specs/2026-05-21-sub-project-2-design.md`
- **NERVOUS-TODO mirror (W4-1 restore source):** `/home/alperen/.claude/plans/deckent-i-inde-nervous-system-fuzzy-fern.md` (540 satır, 31KB)
- **Sprint 180 retro (W2-W3 recovery referansı):** Sprint 180 retro learning detail (.brain/exports/memory.md + b6d6e7a3 commit notes)
- **dist/ runtime referansı:** dist/api/terminal/* + dist/cli/commands/audit-verify.js + dist/nervous/{bootstrap,action-handlers}.js (Sprint 179 + Sprint 180 compiled build hala intact)
- **Predecessor:** Sprint 180 GO_WITH_GATE_FAILURE (4 DONE + 8 GWT + 8 NO_GO). Sprint 179'u commit etmediğimiz için 7 src/ dosyası worker-rollback ile silindi. Sprint 181 recovery + worker-rollback bug fix + beta launch.

## Goal

16 task ile Crisis Stabilization §7: **W0 Worker-rollback P0 fix** ([[project-worker-rollback-untracked-bug]]) + **W1 5 self-security src/+tests recovery** (Sprint 179 silinen — audit-integrity, command-guard, prompt-guard, outbound-limiter, audit-verify) + **W2 2 nervous core recovery** (Sprint 180 silinen — bootstrap, action-handlers) + **W3 5 Sprint 180 NO_GO/GWT closure** + **W4 NERVOUS-TODO restore** + **W5 Beta launch v1.0.0-beta.1 ready + Sprint 181 retro**. **June 1 OSS beta gate ~10 gün — son beta-blocker sprint.**

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential (src/agents + src/api/terminal + src/nervous + src/cli + src/mcp + src/orchestra hepsi self-modifying). Wave: 6 (W0 → W1 → W2 → W3 → W4 → W5). **W0 SEQUENTIAL FIRST, blocker.** Max workers: 2. `dependency_pipeline_enabled: false` → Brain manuel wave gates (ADR-047). Provider: claude. **Worker rollback eski davranışta canlı; W0 LAND ettikten sonra scope-bounded safe.**

### Dependency strategy (drift-immune, Sprint 179+180'de kanıtlanmış)

Dependencies field KULLANMA. Wave-prefix task title'da (W0/W1/W2/W3/W4/W5). Brain manuel wave gate orchestre eder:

- W0 SEQUENTIAL FIRST — worker-rollback fix LAND etmeden W1+ dispatch YOK
- W1 5 task, max 2 paralel (src/api/terminal/* + src/cli/commands/*)
- W2 2 task, max 2 paralel (src/nervous/*)
- W3 5 task, max 2 paralel (state-tracker, config, gate, publish, integration)
- W4 single task (NERVOUS-TODO restore)
- W5 sequential (smoke → retro)

## Worker Contract

- **Kod YAZAR** (W0: modify worker-rollback.ts; W1-W2: NEW src/ + tests/ recovery; W3: NO_GO closure fix; W4: doc restore; W5: smoke + retro).
- Scope DIŞINA yazma YASAK (advisory + worker rollback **W0 LAND ettikten sonra scope-bounded**).
- **TDD ZORUNLU:** her task RED→GREEN (plan adımları aynen).
- **ESM:** `.js` uzantısı zorunlu (Node16 resolution).
- **memory.db:** Sprint 179'da uygulanmış ALTER schema (audit_prev_hmac + audit_hmac) intact, Sprint 181'de schema değişikliği YOK.
- **Worker rollback (W0 öncesi):** eski davranış aktif — UNTRACKED dosyalar risk altında. Her task SONUNDA `git add` + commit yapılır (post-task commit hygiene, [[feedback-post-sprint-commit-mandatory]]).
- **dist/ runtime referansı KORUNUR:** `npm run build` ÇAĞRILMAZ Sprint 181 boyunca (yoksa dist regen olur, recovery referansı kaybedilir). Son build W5-1'de.
- **Recovery referans 3 kaynak:** her W1/W2 task'ı için (a) `dist/<target>.js` runtime, (b) sub-project #2 plan §Task NN, (c) Sprint 179/180 retro learning detail.
- **TaskRecord schema:** `.result` `originalTaskId: null` (main) veya `originalTaskId: "181-..."` (fix retry) — Bug A aggregate verdict.
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes.

## GO/NO_GO Criteria

- **GATE-0 (W0) ★ BLOCKER:** Worker-rollback untracked-safe fix DONE — 6 test PASS + regression sweep clean. **W1+ ancak bundan sonra başlar.**
- **GATE-1 (W1):** 5 self-security recovery (audit-integrity, command-guard, prompt-guard, outbound-limiter, audit-verify) — I1-I5 invariant testleri yeşil.
- **GATE-2 (W2):** 2 nervous core (bootstrap, action-handlers) — 4 + 11 = 15 test PASS.
- **GATE-3 (W3):** 5 Sprint 180 closure — state-tracker green + Faz 1 smoke validation + self-audit gate TS2307'ler kapanır (W1+W2 land sonrası otomatik) + npm publish 6 gate green + integration runtime assertion sıkı.
- **GATE-4 (W4):** NERVOUS-TODO.md proje kökünde 540 satır içerikle restore.
- **GATE-5 (W5) ★ BETA LAUNCH:** Beta smoke 6/6 gate green (tsc + vitest + lint:link + lint:adr + validate:publish + dashboard build) + Sprint 181 retro + v1.0.0-beta.1 package.json.

**Sprint verdict:**
- **GO** = 16/16 DONE (beta launch READY)
- **GO_WITH_TECH_DEBT** = 14-15/16 DONE + ≤2 GWT; **şart:** W0 DONE + W1 5/5 DONE + W5-1 beta smoke DONE
- **NO_GO** = W0 fail (sonraki sprint riski) **veya** W1 ≥2 NO_GO (RCE surface açık) **veya** W5-1 beta smoke fail (June 1 kayar)

---

## Task 1: W0 — Worker-rollback untracked-safe (P0 BLOCKER)
- Model: opus
- Effort: high
- Skills: typescript-expert, git-expert, testing-expert
- Agent: bug-fixer
- Files: src/agents/worker-rollback.ts, src/orchestra/spawn-backend.ts, tests/agents/worker-rollback-untracked-safety.test.ts, .gitignore
- Scope: src/agents/, src/orchestra/, tests/agents/, ./

### Description
Plan §Wave 0 W0. [[project-worker-rollback-untracked-bug]]. Sprint 179→180 incident: bare `git stash --include-untracked` + `git stash drop` döngüsü 7 uncommitted Sprint 179 src/ dosyasını sildi. Çözüm: (1) scope-bounded stash — `git stash push --include-untracked --pathspec` ile sadece worker scope dirs/files stashlenir (out-of-scope untracked dosyalar dokunulmaz), (2) pre-spawn out-of-scope uncommitted guard — uyarı emit edilir, (3) archive folder — `git stash drop` yerine `.deckent/worker-rollback-history/{sprintId}/{taskId}/stash-{iso}.patch` yazılır (7-sprint TTL prune), (4) spawn-backend caller güncellenir scope geçer. **Kanıt:** vitest 6 test PASS + regression sweep tests/agents/ tests/orchestra/ temiz. **Test:** TDD — 6 case (scope-bounded + out-of-scope safe + archive folder + pre-spawn guard + NO_GO scope revert + DONE scope keep + TTL prune).

---

## Task 2: W1-1 — Recover src/api/terminal/audit-integrity.ts (I4 HMAC chain)
- Model: opus
- Effort: high
- Skills: security-specialist, database-migration, typescript-expert
- Agent: data-engineer
- Files: src/api/terminal/audit-integrity.ts (NEW), src/api/terminal/audit.ts, src/core/memory-store.ts, tests/api/terminal/audit-integrity.test.ts (NEW)
- Scope: src/api/terminal/, src/core/, tests/api/terminal/

### Description
Plan §Wave 1-1. Sprint 179'da land etmiş ama silinmiş HMAC chain modülü recovery. **Referans 3 kaynak:** (a) `dist/api/terminal/audit-integrity.js` (126L, runtime davranış intact), (b) sub-project-2 plan `docs/superpowers/plans/2026-05-21-sub-project-2.md` §Task 12 (TDD breakdown), (c) Sprint 179 retro learning W5-12 detayı. `computeAuditHmac(secret, ev)` HMAC-SHA256(prev_hmac || timestamp || tenant_id || action || content). `loadOrCreateAuditKey(projectRoot)` `.deckent/audit-key` mode 0600. `verifyAuditChain(opts)` walk audit rows id-order, recompute expected hmac. **memory.db schema ALTER YOK** (Sprint 179'da uygulanmış intact). audit.ts'yi `insertAuditWithHmac` ile bağla. **Kanıt:** vitest 5 test PASS + manuel tamper smoke (sqlite3 UPDATE → verify exit 1). **Test:** TDD — 5 case (computeAuditHmac determinism + chain link + verify clean + verify tamper + audit-key load).

---

## Task 3: W1-2 — Recover src/api/terminal/command-guard.ts (I3 default-deny remote)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/api/terminal/command-guard.ts (NEW), src/api/terminal/session-manager.ts, tests/security/command-guard.test.ts (NEW)
- Scope: src/api/terminal/, tests/security/

### Description
Plan §Wave 1-2. **Referans 3 kaynak:** `dist/api/terminal/command-guard.js` (82L) + sub-project-2 plan §Task 9 + Sprint 179 retro W4-9 detayı. 6 deny pattern: `rm_rf_root`, `mkfs`, `dd_of_dev`, `fork_bomb`, `ssh_keygen_rewrite`, `authorized_keys_write`. `checkCommandGuard(input, ctx)` bypass: `meta.kind != 'shell'` OR `meta.host in {127.0.0.1, ::1, localhost}`. Remote'ta match → `command_guard_block` audit + `session.kill()`. session-manager `write()` path'ine hook. **Kanıt:** vitest 9 test PASS.
**Test:** TDD — 9 case (localhost bypass + 6 remote pattern + non-shell + benign).

---

## Task 4: W1-3 — Recover src/api/terminal/prompt-guard.ts (I1+I2 input pattern)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/api/terminal/prompt-guard.ts (NEW), src/api/terminal/ws-gateway.ts, tests/security/prompt-guard.test.ts (NEW)
- Scope: src/api/terminal/, tests/security/

### Description
Plan §Wave 1-3. **Referans 3 kaynak:** `dist/api/terminal/prompt-guard.js` (47L) + sub-project-2 plan §Task 8 + Sprint 179 retro W4-8 detayı. `matchPromptPatterns()` 3 pattern: BASE64_BLOB (≥256), OSC_ESCAPE (`\x1b]`), CURL_PIPE_SHELL (`curl ... | sh`). ws-gateway `bridge()` input handler'a pre-write hook: match → write SKIP + per-match audit `guard.block` (detail formatı `pattern_id:offset:base64_signal`, ham byte YOK — I2). Client `guard_block` event emit (I1 no silent drop). **Kanıt:** vitest 5 unit + 1 integration PASS.
**Test:** TDD — 5 pattern case + 1 integration (no silent drop + signal-only audit).

---

## Task 5: W1-4 — Recover src/api/terminal/outbound-limiter.ts (I5 tenant quota)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: api-builder
- Files: src/api/terminal/outbound-limiter.ts (NEW), src/api/terminal/ws-gateway.ts, src/core/config.ts, src/core/config-types.ts, tests/security/outbound-limiter.test.ts (NEW)
- Scope: src/api/terminal/, src/core/, tests/security/

### Description
Plan §Wave 1-4. **Referans 3 kaynak:** `dist/api/terminal/outbound-limiter.js` (70L) + sub-project-2 plan §Task 10 + Sprint 179 retro W4-10 detayı. `OutboundLimiter` class: per-tenant `Map<TenantId, {bytes, warned, windowStart}>` 24h. `track(tenantId, bytes)` → `{action: 'pass'|'warn'|'kill', bytesUsed, bytesRemaining}`. Default `terminal.outboundDailyQuotaBytes: 1_073_741_824` (1 GB). ws-gateway send hook: warn 50% → audit + client event; kill 100% → audit + close(4429). **Kanıt:** vitest 4 test PASS.
**Test:** TDD — 4 case (per-tenant isolation + warn one-shot + kill threshold + window reset).

---

## Task 6: W1-5 — Recover src/cli/commands/audit-verify.ts (CLI tamper detect)
- Model: opus
- Effort: normal
- Skills: typescript-expert, security-specialist
- Agent: api-builder
- Files: src/cli/commands/audit-verify.ts (NEW), src/cli/index.ts, tests/cli/audit-verify.test.ts (NEW)
- Scope: src/cli/, tests/cli/

### Description
Plan §Wave 1-5. **Referans 3 kaynak:** `dist/cli/commands/audit-verify.js` (59L) + sub-project-2 plan §Task 12 + Sprint 179 retro W5-12 detayı. `deckent audit verify` CLI: `.deckent/audit-key` load → `verifyAuditChain` çağır → clean exit 0 ("Row count: N, integrity verified"), tamper exit 1 ("TAMPER DETECTED — first invalid row id=X"). cli/index.ts register. **Kanıt:** vitest 4 test PASS + manuel tamper smoke (sqlite3 UPDATE → exit 1).
**Test:** TDD — 4 case (clean exit 0 + tamper exit 1 + missing key + row count display).

---

## Task 7: W2-1 — Recover src/nervous/bootstrap.ts (createNervousSystemIfEnabled)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/nervous/bootstrap.ts (NEW), tests/nervous/bootstrap.test.ts (NEW)
- Scope: src/nervous/, tests/nervous/

### Description
Plan §Wave 2-1. **Referans 3 kaynak:** `dist/nervous/bootstrap.js` (108L) + Sprint 180 retro W1-2 detayı (full 161 LoC TDD breakdown 4 case) + NERVOUS-TODO §11.2 Step A. `createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider, actionHandler?): {observer, dispose} | null`. `if (!config.nervous_system?.enabled) return null`. Observer + DecisionEngine + Proposer + Dispatcher + Executor + History instantiate. `observer.on('detection')` chain wire — DetectorResult → DecisionEngine.decide → Proposer.propose → Promise.allSettled([Dispatcher.dispatch, Executor.handle]). `dispose()` idempotent. ActionHandler default stub. **Kanıt:** vitest 4 test PASS.
**Test:** TDD — 4 case (disabled→null + missing→null + enabled→{observer, dispose} + dispose cleanup idempotent).

---

## Task 8: W2-2 — Recover src/nervous/action-handlers.ts (4 MVP handlers)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Agent: architect
- Files: src/nervous/action-handlers.ts (NEW), tests/nervous/action-handlers.test.ts (NEW)
- Scope: src/nervous/, tests/nervous/

### Description
Plan §Wave 2-2. **Referans 3 kaynak:** `dist/nervous/action-handlers.js` (163L) + Sprint 180 retro W2-1 detayı (full 247 LoC + 11 test breakdown) + NERVOUS-TODO §11.2 Step C. 4 MVP handler: WORKER_RESPAWN (spawn-backend tmux kill + spawn intent), ORPHAN_TASK_ARCHIVE (sprint-docs-updater.archiveOrphanTasks), STALE_LOCK_RELEASE (file-lock.releaseLock), DEAD_EVENT_STREAM_CLEANUP (no-op stub). Diğer 26 action `{outcome:'unimplemented', actionId}`. `createActionHandler(deps)` factory bridging to Executor's ActionHandler. Lazy default deps load via dynamic import (worker scope coupling kaçınma). **Kanıt:** vitest 11 test PASS.
**Test:** TDD — 11 case (4 MVP unit + stub default + unknown id + payload validation + handler-throw + Executor integration + unimplemented bridge + type contract).

---

## Task 9: W3-1 — Sprint 180 NO_GO closure: sprint-state-tracker (180-002)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: api-builder
- Files: src/orchestra/sprint-state-tracker.ts, tests/orchestra/sprint-state-snapshot.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Plan §Wave 3-1. Sprint 180 180-002 NO_GO ("worker exited without writing result"). Sprint 180 retro learning W1-1 detayı: `getSprintStateSnapshot(projectRoot)` SprintStateSnapshot dön — `.deckent/sprint-state.json` + `.tasks/*.hb` + `.tasks/*.result` + `.brain/exports/debt.md` read. Idle (no sprint-state.json) → IDLE_SNAPSHOT frozen constant. normalizePhase coerces SprintPhase → SprintStateSnapshot union with IDLE fallback. **Kanıt:** vitest 3 TDD test PASS (active + idle + phase change).
**Test:** TDD — 3 case.

---

## Task 10: W3-2 — Sprint 180 NO_GO closure: Faz 1 smoke config (180-007)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: devops-engineer
- Files: .deckent/config.json (verify), tests/config/nervous-faz1-smoke.test.ts (survived)
- Scope: .deckent/, tests/config/

### Description
Plan §Wave 3-2. Sprint 180 180-007 NO_GO. Config'de aktif: `nervous_system.enabled: true`, `mode: strict`, `severity_min: critical`, 3 detector enabled (stale_worker + dead_event_stream + directives_protection). Test validation sıkılaştır. **Kanıt:** vitest config validation PASS + 3 detector enabled assertion.
**Test:** Config validation + 3 detector enabled smoke.

---

## Task 11: W3-3 — Sprint 180 NO_GO closure: Self-audit gate vitest fix (180-011)
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: TBD (W1-W2 land sonrası 5 TS2307 otomatik kapanır; 1 vitest failing pinpoint + fix)
- Scope: tests/, src/

### Description
Plan §Wave 3-3. Sprint 180 180-011 NO_GO. **W1-W2 LAND ettikten sonra çağrıldığında 5 TS2307 error otomatik resolve (modüller exist).** Kalan 1 vitest failing test pinpoint: Sprint 180 retro `Self-audit gate failed... vitest: 1 failing tests`. `npx vitest run 2>&1 | grep FAIL` ile bul + fix. **Kanıt:** `npx tsc --noEmit` exit 0 + `npx vitest run` 0 failures.
**Test:** Gate green smoke.

---

## Task 12: W3-4 — Sprint 180 NO_GO closure: npm publish v1.0.0-beta.1 (180-012)
- Model: opus
- Effort: high
- Skills: devops-engineer, typescript-expert
- Agent: devops-engineer
- Files: scripts/validate-publish.mjs (survived), package.json, tests/scripts/validate-publish-readiness.test.ts (survived)
- Scope: ./, scripts/, tests/scripts/

### Description
Plan §Wave 3-4. Sprint 180 180-012 NO_GO. validate-publish.mjs 432 LoC survived; 6 readiness gate: (1) npm pack ≤2MB + 899 files, (2) engines.node>=24, (3) main/types entry points, (4) no internal state leak, (5) ADR validation clean, (6) lint:link clean. Test (20 unit) green'e çıkar. Version `1.0.0-beta.1`. **Publish KOŞMAZ** — Alperen manuel ([[feedback-build-requires-user-approval]]). **Kanıt:** `npm run validate:publish` exit 0 + 6/6 gate PASS + 20 unit test PASS.
**Test:** 6 readiness gate + 20 unit test.

---

## Task 13: W3-5 — Sprint 180 GWT closure: Nervous integration runtime (180-008)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: tests/nervous/integration-runtime.test.ts (survived, 257 LoC)
- Scope: tests/nervous/

### Description
Plan §Wave 3-5. Sprint 180 180-008 GWT. integration-runtime.test.ts survived ama assertion gevşek. W2-1 bootstrap LAND ettikten sonra runtime bağlantı sağlanır; assertion sıkılaştır: detection event emit + history write + dispatcher file channel write asserted. **Kanıt:** vitest integration test PASS + `.deckent/nervous-history.jsonl` boş değil.
**Test:** Integration runtime end-to-end.

---

## Task 14: W4-1 — Restore NERVOUS-TODO.md
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: NERVOUS-TODO.md (NEW restore)
- Scope: ./

### Description
Plan §Wave 4-1. `cp /home/alperen/.claude/plans/deckent-i-inde-nervous-system-fuzzy-fern.md NERVOUS-TODO.md` (540 satır, 31KB). Memory'deki `project_nervous_activation_plan.md` ile cross-check (içerik uyumlu). **Kanıt:** wc -l NERVOUS-TODO.md == 540 + ilk 5 satır "Deckent Nervous System — Tam Kapsamlı Durum Analizi" başlığı.
**Test:** File restore smoke.

---

## Task 15: W5-1 — Beta launch smoke v1.0.0-beta.1 ★ BETA LAUNCH
- Model: opus
- Effort: high
- Skills: devops-engineer, typescript-expert, testing-expert
- Agent: devops-engineer
- Files: package.json (version 1.0.0-beta.1), root smoke runs
- Scope: ./

### Description
Plan §Wave 5-1. **Final 6/6 gate green** sırasıyla: (1) `npm run build:all` (tsc + copy-assets + dashboard vite build), (2) `npx tsc --noEmit` exit 0, (3) `npx vitest run` 0 failures, (4) `npm run lint:link` exit 0, (5) `npm run lint:adr` exit 0 (54+ ADRs), (6) `npm run validate:publish` 6 readiness gate green. Package.json version `1.0.0-beta.1`. Tarball: 899 files target, ≤2MB. **Kanıt:** 6/6 gate exit 0 + tarball stats.
**Test:** Beta smoke 6 gate.

---

## Task 16: W5-2 — Sprint 181 retro + Sprint 182 stub
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/exports/memory.md (Sprint 181 retro append), docs/superpowers/specs/2026-05-26-sprint-182-post-beta-stub.md (NEW)
- Scope: .brain/, docs/superpowers/specs/

### Description
Plan §Wave 5-2. Sprint 181 retro: `.brain/exports/memory.md` Sprint 181 entries append (16 task verdict + W0 worker-rollback fix kanıt + 5 self-security recovery + 2 nervous recovery + W3-W4 closure + W5 beta smoke). Sprint 182 post-beta spec stub: sub-project #3 (multi-tenant + mTLS impl + k8s) + sub-project #4 (enterprise SSO/SIEM/compliance) + nervous Faz 2 pilot + AEGIS realization (ADR-061) roadmap outline. **Kanıt:** memory.md updated + Sprint 182 stub ≥150 satır.
**Test:** Doc smoke.
