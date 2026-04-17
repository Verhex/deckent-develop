# DIRECTIVES — Sprint 143: Güvenlik + Memory V2 Tam + Core Stabilite + Operasyonel P0

## Goal

Ship-blocker foundation sprint. 6 P0 güvenlik (shell injection, path traversal, `.brain/memory.db` git, API auth, health-check fix). Memory V2 tam migrasyon (FTS5 query builder fix + relations hibrit + V1 remnant temizlik + DECISIONS.md archive + init.ts DB preload). Brain co-evolve canlı (sprint-finalizer hook + rule generator 3 provider). 6 operasyonel P0 (MCP disconnect, auto-archive guard, Layer 4 wire, task restoration, panic kill guard, E2E harness). ADR-010 amendment + MCP help fix + heartbeat execSync whitelist.

**Spec:** `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` § 2
**Plan:** `docs/superpowers/plans/2026-04-17-sprint-143-implementation-plan.md`

**Süre hard cap:** 4h | **Cost budget:** $12 | **Opus-only P0/P1 zorunlu.**

---

## Cross-Cutting Rules (tüm task'lar için)

1. **Opus-only:** Sprint 143 tümü P0/P1 kritik, her task `forceModel: opus` zorunlu. İhlal = NO_GO.
2. **MVP yasak:** Her task kök neden analizi + kesin çözüm + test. "Acaba-denesem" pattern yasak.
3. **Core bozulamaz:** Brain sprint-finalize + cleanup + heartbeat regresyon = chain ABORT.
4. **Chain safety gate:** Sprint sonu 5-check (doctor + tsc + vitest ≥99% + cost <$15 + no_go <3).

---

## Task 1: Shell Injection Fix (tmux.ts)
- Model: opus
- Effort: high
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/orchestra/tmux.ts, src/core/validators.ts, tests/orchestra/tmux.test.ts, tests/core/validators.test.ts
- Scope: src/orchestra/, src/core/, tests/

### Description
`taskId` regex `/^[\w-]+$/` validate. Tüm `spawnSync` `shell: false` zorunlu. `validateTaskId()` + `ValidationError` class src/core/validators.ts'de. Her tmux public fonksiyonu validate çağrısı ile başlar.

**Kanıt:** `grep -c "shell: true" src/orchestra/tmux.ts` → `0`
**Test:** 7+ test (valid taskId + 6 injection attempt: shell metachar, null byte, empty, length>100, path traversal, URL encoded)

---

## Task 2: Path Traversal Fix (checkpoint/docs/decision-logger)
- Model: opus
- Effort: normal
- Skills: security-specialist, typescript-expert
- Agent: security-auditor
- Files: src/mcp/tools/checkpoint.ts, src/mcp/tools/docs.ts, src/orchestra/decision-logger.ts, src/core/validators.ts, tests/
- Scope: src/core/, src/mcp/, src/orchestra/, tests/

### Description
`validatePath(base, user)` = `path.resolve` + `.startsWith(base)`. `validateSprintId` regex `/^sprint-\d{3,4}$/`. `validatePhase` enum. 3 dosyada parametre validate pre-fs-call.

**Kanıt:** `grep -rn "validatePath\|validateSprintId\|validatePhase" src/mcp/ src/orchestra/decision-logger.ts` → her dosya baş satırında.
**Test:** 15+ test (3 dosya × 5 injection + happy paths)

---

## Task 3: .brain/memory.db Git Takip Fix
- Model: opus
- Effort: low
- Skills: git-expert, devops-engineer
- Agent: devops-engineer
- Files: .gitignore, scripts/verify-gitignore.mjs, src/cli/commands/doctor.ts, tests/scripts/
- Scope: ., scripts/, src/cli/commands/, tests/scripts/

### Description
`.gitignore` ekle `.brain/memory.db`, `memory.db-shm`, `memory.db-wal`. `git rm --cached .brain/memory.db`. `scripts/verify-gitignore.mjs` doctor check entegrasyon.

**Kanıt:** `git ls-files .brain/memory.db` → 0 sonuç. `node scripts/verify-gitignore.mjs && echo OK` → `OK`.
**Test:** 3 test (gitignored, tracked, missing)

---

## Task 4: API Auth Default Secure
- Model: opus
- Effort: normal
- Skills: security-specialist, api-builder
- Agent: security-auditor
- Files: src/api/auth.ts, src/api/server.ts, tests/api/
- Scope: src/api/, tests/api/

### Description
Mevcut `if (!token) return true` kaldırılır. Token yoksa → 401 (default). `DECKENT_API_AUTH_DISABLED=1` env ile explicit bypass + stderr warning. CORS config'ten (wildcard yasak). Security headers: X-Content-Type-Options, X-Frame-Options, CSP, HSTS.

**Kanıt:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/sprint` → `401`.
**Test:** 8+ test (missing token, bypass mode, valid token, invalid token, CORS reject, security headers)

---

## Task 5: health-check.ts Dosya Yolu Uyuşmazlığı Fix
- Model: opus
- Effort: low
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/doc-updaters/health-check.ts, tests/orchestra/doc-updaters/health-check.test.ts
- Scope: src/orchestra/doc-updaters/, tests/orchestra/doc-updaters/

### Description
`shouldRun()` ve `run()` fonksiyonlarında ortak `HEALTH_DOC_PATH` constant. Fix file path mismatch. `run()` dosya yoksa oluşturur.

**Kanıt:** `ls -la docs/reference/health-check.md` var + içerik doğru.
**Test:** 4 test.

---

## Task 6: FTS5 Query Builder Fix (Karar 2-A)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/core/debug-log.ts (yeni), src/core/memory-query.ts, src/cli/commands/recall.ts, src/mcp/tools/memory-query.ts, tests/
- Scope: src/core/, src/cli/commands/, src/mcp/tools/, tests/

### Description
`src/core/debug-log.ts` yeni — structured stderr log (4 seviye). `escapeFts5Query()` default OR join (AND ile replace). `MemoryQueryParams.mode?: 'and' | 'or'` (default 'or'). Silent catch kaldır → `MemoryQueryError` throw + debugLog.error. `buildAutoQuery()` Brain için `mode:'or'` zorunlu. CLI `--mode=and|or` flag. MCP tool `mode` parametresi.

**Kanıt:** `deckent recall "docker heartbeat" | wc -l` → ≥7 satır. `deckent recall "docker heartbeat" --mode=and` → 0-3 sonuç.
**Test:** 15+ test (dual-mode, empty, edge, error path, debug trace)

---

## Task 7: Relations Hibrit — Backfill + Write-time (Karar 3-C)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: scripts/backfill-relations.mjs (yeni), src/core/memory-store.ts, src/core/memory-types.ts, src/orchestra/task-builder.ts, src/orchestra/sprint-finalizer.ts, src/cli/commands/memory.ts, tests/
- Scope: scripts/, src/core/, src/orchestra/, src/cli/commands/, tests/

### Description
`Relation` + `RelationType` types. `MemoryStore.insertRelation()` + `getRelations()` + `insert()` auto-extract ADR references (regex `\bADR-\d{3}\b`). Backfill script 65 entry tarar → `.brain/exports/relations-backfill-preview.md`. `deckent memory relations review` komutu manuel gate (y/n per relation). Sprint finalize triple-link (sprint-log → memory → retro `depends_on`).

**Kanıt:** `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM relations"` → ≥80. source dağılımı: backfill ≥80, auto-extract ≥20, finalizer ≥2.
**Test:** 20+ test (pattern extraction, auto-extract, finalizer triple-link, gate workflow)

---

## Task 8: Memory V2 Tam Migrasyon (ci-reporter + managed-docs)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Agent: refactorer
- Files: src/orchestra/ci-reporter.ts, src/orchestra/managed-docs/content-generators.ts, template-renderer.ts, managed-doc-runner.ts, tests/
- Scope: src/orchestra/, tests/orchestra/

### Description
4 V1 ihlali kaldır:
1. ci-reporter.ts: RETRO.md + MEMORY.md direct write → `store.upsert({type:'retro'|'memory'})`
2. content-generators.ts: DEBT.md read → `store.getByType('debt')`
3. template-renderer.ts: `.brain/sprints/*.md` read → `store.getByType('sprint')`
4. managed-doc-runner.ts: `buildStandaloneDocContext` DB-first

**Kanıt:** `grep -rn "readFileSync.*\.brain/\(RETRO\|MEMORY\|DEBT\|PATTERNS\|sprints/\)" src/` → **0 sonuç**
**Test:** 12+ test (4 dosya × DB dual-path + integration)

---

## Task 9: DECISIONS.md Archive + init.ts DB Preload
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: refactorer
- Files: scripts/archive-decisions-md.mjs (yeni), src/cli/commands/init.ts, src/core/adr-seed.ts (yeni), .gitignore, tests/cli/init.test.ts
- Scope: src/cli/commands/, src/core/, scripts/, tests/cli/

### Description
`.brain/DECISIONS.md` (1505 satır) → `.brain/archive/decisions-root-pre-sprint143/`. Hash verify. init.ts DB preload: 40 ADR seed (src/core/adr-seed.ts) + identity entry. Template referansları `@.brain/MEMORY.md` → `@.brain/exports/summary.md`.

**Kanıt:** `ls .brain/DECISIONS.md` → no such file. Yeni proje init sonrası `sqlite3 .brain/memory.db "SELECT COUNT(*)"` → ≥41.
**Test:** 6+ test

---

## Task 10: Sprint-Finalizer Hook (Karar 4-A)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/orchestra/sprint-finalizer.ts, src/core/identity-generator.ts (yeni), src/orchestra/doc-updaters/registry.ts, changelog.ts, tests/orchestra/
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint finalize sonu otomatik zincir: (1) `deckent memory export` → exports/* regenerate, (2) `PROJECT-IDENTITY.md` auto-regen (canlı metrikler), (3) `CHANGELOG.md` append, (4) `docs/SPRINT-LOG.md` append, (5) rule regen hook point (Task 11'den).

**Kanıt:** Sprint 143 finalize sonrası exports/summary.md count = DB count. PROJECT-IDENTITY.md "22 tools, 40 ADR, 41+ CLI" güncel.
**Test:** 10+ test (her hook adımı + idempotency)

---

## Task 11: Rule Generator (Karar 4-B, 3 Provider)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/core/rule-generator.ts, rule-templates/*.template.md (3 yeni), provider-adapters/claude.ts, codex.ts, gemini.ts, tests/, .codex/rules/*, .gemini/rules/*
- Scope: src/core/, src/orchestra/, tests/core/, .claude/, .codex/, .gemini/

### Description
Template engine: ADR entry'lerden `.claude/rules/brain.md` + `auditor.md` + `worker-default.md` üretir. 3 provider adapter (claude/codex/gemini). `<!-- AUTO-START -->` / `<!-- CUSTOM-START -->` ayrımı (user edits preserved). Sprint-finalizer regenerateRules() çağrısı.

**Kanıt:** `ls .claude/rules/ .codex/rules/ .gemini/rules/` → 9 dosya (3 role × 3 provider).
**Test:** 15+ test (template render, custom preservation, provider adapters, idempotency)

---

## Task 12: MCP Disconnect Fix (Background Sprint Runner)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/orchestra/sprint-runner-entry.ts (yeni), src/cli/commands/start.ts, src/mcp/tools/start.ts, src/orchestra/sprint-controller.ts, tests/integration/mcp-sprint-isolation.test.ts
- Scope: src/cli/, src/orchestra/, src/mcp/, tests/integration/

### Description
`sprint-runner-entry.ts` detached child process entry. MCP `deckent_start` detached spawn + `unref()` → MCP stdio serbest. IPC `.deckent/sprint-NNN-ipc/` fifo. Sprint 139 t+80dk disconnect incident çözümü.

**Kanıt:** MCP server alive kalır (stdio blocked değil) 100-task sprint boyunca.
**Test:** 8+ test (process isolation, stdio freedom, IPC bridge)

---

## Task 13: Auto-Archive Guard (Task 3 Regression Koruması)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/task-restoration.ts (yeni), tests/orchestra/auto-archive.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Archive öncesi pre-archive snapshot `.deckent/<sprint-id>-pre-archive.tar.gz` + SHA-256 hash. Archive sadece DONE/NO_GO (PENDING/EXECUTING korunur). `task-restoration.ts` restore function.

**Kanıt:** Archive sonrası PENDING task'lar `.tasks/` içinde korunur. Snapshot hash verify PASS.
**Test:** 10+ test (snapshot, hash, preservation, restore roundtrip)

---

## Task 14: Layer 4 Runtime Wire Deploy (ADR-006 Canlı Enforcement)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Agent: architect
- Files: src/orchestra/authority-enforcer.ts, src/orchestra/sprint-controller.ts, src/agents/auditor.ts, tests/orchestra/layer4-runtime.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description
`enforceAdrCompliance(taskId, changedFiles, store)` — ADR-006 spawnSync shell:true, ADR-008 core→orchestra import, ADR-010 package.json deps whitelist. Violation → NO_GO + ADR amendment proposal. Fail-safe: enforcer fail → task devam (güvenlik ekstra, kritik path block etmez).

**Kanıt:** Worker `spawnSync(cmd, {shell:true})` yazarsa auditor NO_GO + breadcrumb log.
**Test:** 12+ test (ADR PASS/FAIL per rule + fail-safe + breadcrumb)

---

## Task 15: Task Restoration on Crash
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/orchestra/sprint-checkpoint.ts, src/cli/commands/resume.ts, src/orchestra/sprint-controller.ts, tests/orchestra/task-restoration.test.ts
- Scope: src/orchestra/, src/cli/commands/, tests/orchestra/

### Description
Phase transition auto-checkpoint write `.deckent/sprint-NNN-checkpoint.json`. `deckent resume <sprint-id>` crash'ten devam. Stale heartbeat (>5min) detection → respawn worker. DONE task tekrar çalıştırılmaz.

**Kanıt:** Sprint orta noktada SIGKILL coordinator → `deckent resume` devam eder.
**Test:** 15+ test (checkpoint write, restore, heartbeat freshness, idempotency)

---

## Task 16: Panic Kill Guard
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/core/panic-guard.ts (yeni), src/orchestra/sprint-controller.ts, src/cli/commands/kill.ts, tests/orchestra/panic-guard.test.ts
- Scope: src/core/, src/orchestra/, src/cli/commands/, tests/orchestra/

### Description
Runtime panic → worker kill Alperen onayı gerekiyor (feedback tartışmasız kural). `deckent kill --force --user-explicit` bypass. Panic log `.deckent/<sprint-id>-panic-*.json`. Notification dispatcher entegrasyon.

**Kanıt:** Runtime panic'te worker'lar kill edilmiyor (default). Force flag override PASS.
**Test:** 8+ test

---

## Task 17: E2E Harness (Chain Safety Foundation)
- Model: opus
- Effort: normal
- Skills: testing-expert, ci-testing
- Agent: test-writer
- Files: tests/e2e/sprint-lifecycle.e2e.test.ts (genişlet), tests/e2e/chain-safety.e2e.test.ts (yeni), scripts/run-e2e-harness.mjs
- Scope: tests/e2e/, scripts/

### Description
Chain safety gate E2E: 3-task mini-sprint → finalize → 5-check gate. PASS → auto-trigger-next. FAIL (cost>$15, 3+ NO_GO) → abort-notify. `npm run e2e:chain`.

**Kanıt:** `npm run e2e:chain` PASS + FAIL scenarios PASS.
**Test:** 10+ E2E scenario

---

## Task 18: ADR-010 Amendment (Karar 6-C)
- Model: opus
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: src/core/memory-store.ts (insert amendment), tests/core/memory-store.test.ts
- Scope: src/core/, tests/core/

### Description
ADR-010 "Tek runtime dependency" → "Minimal runtime dependencies (Amended)". 4 bağımlılık (commander, better-sqlite3, @modelcontextprotocol/sdk, zod) gerekçelerle belgelenir. `store.upsert({id:'adr-010', ...})`. T-143-014 Layer 4 runtime enforcement ile bağlantı.

**Kanıt:** `deckent recall "minimal runtime dependency"` → ADR-010 amendment top result.
**Test:** 3 test

---

## Task 19: MCP help.ts + Server Instructions + Tool Count
- Model: opus
- Effort: low
- Skills: typescript-expert
- Agent: bug-fixer
- Files: src/mcp/tools/help.ts, src/mcp/server.ts, src/mcp/tools/index.ts, tests/mcp/help.test.ts
- Scope: src/mcp/, tests/mcp/

### Description
help.ts TOOLS dizisine 6 eksik tool ekle (agent_list, skill_list, checkpoint, docs, explain, memory_query). server.ts "Tools (21)" → "(22)". Server instructions V2 yolları (V1 MEMORY.md/DEBT.md referansları kaldırılır).

**Kanıt:** `deckent_help` 22 tool listeler. Server startup log "22 tools registered".
**Test:** 5 test

---

## Task 20: heartbeat-daemon execSync Beyaz Liste
- Model: opus
- Effort: low
- Skills: security-specialist
- Agent: security-auditor
- Files: src/orchestra/heartbeat-daemon.ts, tests/orchestra/heartbeat-daemon.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
`ALLOWED_COMMANDS = ['ps', 'kill', 'wait', 'uptime', 'date']`. Shell metachar reject (`[;&|\`$()]`). execSync öncesi validateCommand. Timeout 5s.

**Kanıt:** Malicious HEARTBEAT.md (örn `; rm -rf /`) → ValidationError.
**Test:** 6 test

---

## Sprint 143 Sonu — Chain Safety Gate

Sprint finalize otomatik 5-check:
1. `deckent doctor` PASS
2. `tsc --noEmit` 0 error
3. `vitest run` ≥99% pass
4. Sprint cost <$15
5. NO_GO count <3

**PASS → Sprint 144 auto-trigger.**
**FAIL → chain ABORT + notification dispatcher Alperen push.**
