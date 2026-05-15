# Sprint 171 Self-Audit Mega-Sprint — Implementation Plan

> **For agentic workers (deckent worker):** Bu plan deckent Brain + worker'lar tarafından çalıştırılır. Her worker SADECE kendi Task bölümünü + ortak **Worker Contract**'ı okur. Steps checkbox (`- [ ]`) syntax — worker .result yazmadan önce hepsini tamamlamalı.

**Goal:** Bootstrap fix runtime aktifken deckent'in 29 paralel/wave audit-only worker ile kendini tam-kapsamlı denetlemesi; Sprint 172 OSS GA bulgu defteri + doc-reorg planı + AEGIS girdisi.

**Architecture:** 29 task, 5 wave (8/8/8/4/1). Hibrit eksen: 14 modül-derin (char-level, coverage-map) + 8 concern-cross-cutting + 5 doc-tier + 1 DB-integrity + 1 synthesis. Audit-only invariant: `scope.filesWrite` tek dosya `docs/audits/sprint-171/<name>.md`, `scope.directories` src/tests YASAK → `detectTaskType='audit'` → 0 spurious NO_GO tasarım garantisi. Synthesis manuel dispatch (`dependency_pipeline_enabled: false`, ADR-047).

**Tech Stack:** TypeScript (ESM Node16), vitest, better-sqlite3 (FTS5+relations), React+Vite+Tailwind, deckent orchestrator (Brain/Auditor/Worker), Claude-only (opus).

**Spec:** `docs/superpowers/specs/2026-05-15-sprint-171-self-audit-design.md` (Alperen onaylı, commit `59818a6`)

---

## Worker Contract (HER worker ZORUNLU okur)

Bu bölüm 29 task'ın tümü için ortaktır. Task bölümleri sadece **spesifik audit boyutlarını** + **kapsam dosyalarını** tanımlar; aşağıdaki süreç her task'a uygulanır.

### Audit-Only Invariant (ihlali = NO_GO)

1. **Yazma:** SADECE `docs/audits/sprint-171/<name>.md` — tam 1 dosya. Başka hiçbir dosya (kod/test/config/md) modify edilmez.
2. **Okuma:** Tüm repo serbest (`src/**`, `tests/**`, `scripts/**`, `.brain/**`, `docs/**`, root, config). `scope.directories`'de src/tests/lib OLMAZ (yoksa `isAuditTask=false` → spurious NO_GO).
3. **Kod/test yazımı YASAK.** TDD YOK. Sadece markdown rapor.
4. **`.tasks/task-<id>.plan`** yaz (kısa execution plan — bu protokol allowlist'te, boundary ihlali değil, P0-2 fix).
5. **`.tasks/task-<id>.result`** yaz: `selfAssessment: DONE`, `coverage: null` (audit task — `coverageOptional=true`, schema gate geçer), `filesChanged: ["docs/audits/sprint-171/<name>.md"]`, `notes` Türkçe özet.

### Çıktı Dili — ZORUNLU (kullanıcı reinforced 2026-05-15, ATLANMAZ)

**Raporun TÜM içeriği Türkçe, insan-okur.** Teknik terim/identifier/kod alıntısı orijinal kalır (örn. `detectTaskType`, `spawnSync`). Açıklama/bulgu/öneri/severity gerekçesi tam Türkçe, doğru orthography (ç/ğ/ı/ö/ş/ü). Hedef okur: deckent'i tanımayan bir mühendis raporu okuyup aksiyona geçebilmeli.

### Rapor Şeması — ZORUNLU 4+1 Bölüm

```markdown
# <Task Adı> — Audit Raporu (Sprint 171)

## 1. Bulgular (Findings)
Numaralı liste. Her bulgu: ne, nerede (`file:line`), neden sorun.

## 2. Severity
| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
CRITICAL / HIGH / MEDIUM / LOW. CRITICAL = OSS GA blocker.

## 3. Kanıt (Evidence)
Her bulgu için `file:line` + kod/komut alıntısı (≥1 zorunlu).

## 4. Öneriler (Recommendations)
Aksiyonable, Sprint 172+ backlog uyumlu. "Sil / Birleştir / Tamamla / Düzelt / Koru" net.

## 5. Kapsam Haritası (Files Covered)   ← SADECE modül-derin task 171-001..014
| Dosya | LoC | Okundu | Not |
|---|---|---|---|
Dizindeki HER dosya listelenir (boş bırakılamaz — synthesis coverage-gap kontrol eder).
```

Bir bölüm eksik/kanıtsız/boş → task NO_GO (içerik kalite kapısı, Q7 Kapı 2).

### Ortak Step Şablonu (her task)

- [ ] **S1:** `.tasks/task-<id>.plan` yaz — bu task'ın audit boyutları + okunacak dosya listesi.
- [ ] **S2:** Kapsam dosyalarını oku (modül task: HER dosya char-level; concern task: pattern grep + ilgili dosya derinlemesine; doc task: her .md tam okuma).
- [ ] **S3:** Task'a özel audit boyutlarını uygula (aşağıdaki Task bölümü), her bulguya `file:line` kanıt topla.
- [ ] **S4:** `docs/audits/sprint-171/<name>.md` yaz — 4+1 bölüm, **Türkçe**, kanıtlı.
- [ ] **S5:** Self-review: 4 bölüm dolu mu? Her bulgu kanıtlı mı? Dil Türkçe mi? Modül task ise Kapsam Haritası tam mı?
- [ ] **S6:** `.tasks/task-<id>.result` yaz (`DONE`, `coverage:null`, filesChanged tek dosya, Türkçe notes).

### Yasaklar (Memory kuralları)

- Kod/test/config/db modify YOK. `memory.db`'ye dokunma (`feedback_db_silmek_yasak`).
- Fix önerisi raporda yazılır, **uygulanmaz**. Başka task'ın dosyasına yazma.
- Minimum/MVP/"sonra tamamlanır" YOK — bulguyu tam dokümante et (`feedback_no_minimum_no_mvp_deckent`).

---

## File Structure

| Task | Yazılan (tek dosya) | Okuma kapsamı |
|---|---|---|
| 171-001 | `docs/audits/sprint-171/orchestra-lifecycle.md` | `src/orchestra/{sprint-controller,brain,planner,task-builder,result-evaluator,result-collector,sprint-reporter,sprint-utils}.ts`, `src/orchestra/decision-steps/**` |
| 171-002 | `docs/audits/sprint-171/orchestra-routing.md` | `src/orchestra/{task-router,outcome-tracker,quality-assessor,mid-sprint-adapter,rule-evolver,debt-manager,rubric-registry}.ts` |
| 171-003 | `docs/audits/sprint-171/orchestra-infra.md` | `src/orchestra/{tmux,spawn-backend,spawn-backend-docker,temp-skill-generator,promotion-pipeline,event-stream,file-lock}.ts`, `src/orchestra/{doc-updaters,managed-docs}/**` |
| 171-004 | `docs/audits/sprint-171/core-types-config.md` | `src/core/{types,*-types,config,model-registry,mode-presets,condition-evaluator,manifest-migrator}.ts` |
| 171-005 | `docs/audits/sprint-171/core-memory.md` | `src/core/memory-{store,query,normalize,types,export,import}.ts` |
| 171-006 | `docs/audits/sprint-171/core-pools-routing.md` | `src/core/{agent-pool,skill-pool,skill-registry,provider,routing-*,intent-classifier,activation-engine}.ts`, `src/core/{builtins,marketplace,rule-templates,notify-adapters,notification-providers}/**` |
| 171-007 | `docs/audits/sprint-171/agents.md` | `src/agents/**` (worker, adaptive-agent + tümü) |
| 171-008 | `docs/audits/sprint-171/nervous.md` | `src/nervous/**` (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, runtime-scope-check, history, detectors/) |
| 171-009 | `docs/audits/sprint-171/monitor-connectors.md` | `src/monitor/**`, `src/connectors/**` |
| 171-010 | `docs/audits/sprint-171/providers-api.md` | `src/providers/**`, `src/api/**` |
| 171-011 | `docs/audits/sprint-171/mcp.md` | `src/mcp/**` (server, tools/, resources/, helpers/) |
| 171-012 | `docs/audits/sprint-171/cli.md` | `src/cli/**` |
| 171-013 | `docs/audits/sprint-171/dashboard.md` | `src/dashboard/**` (src/, analytics/, api/ — node_modules HARİÇ) |
| 171-014 | `docs/audits/sprint-171/extensions-scripts.md` | `src/extensions/vscode/**`, `scripts/**` (45 script) |
| 171-015 | `docs/audits/sprint-171/dead-code.md` | tüm `src/**` (cross-cut) |
| 171-016 | `docs/audits/sprint-171/adr-compliance.md` | `.brain/exports/decisions.md`, `docs/adr/**`, ilgili `src/**` enforcement noktaları |
| 171-017 | `docs/audits/sprint-171/security.md` | tüm `src/**`, `scripts/**`, config |
| 171-018 | `docs/audits/sprint-171/performance.md` | tüm `src/**` (I/O + async hot path) |
| 171-019 | `docs/audits/sprint-171/type-safety.md` | tüm `src/**` |
| 171-020 | `docs/audits/sprint-171/error-handling.md` | tüm `src/**` |
| 171-021 | `docs/audits/sprint-171/test-integrity.md` | tüm `tests/**`, `vitest.config.*`, `package.json` |
| 171-022 | `docs/audits/sprint-171/memory-db-integrity.md` | `src/core/memory-*.ts`, `.brain/memory.db` (read-only query), `.brain/exports/**` |
| 171-023 | `docs/audits/sprint-171/docs-root.md` | root `*.md` (21 dosya) |
| 171-024 | `docs/audits/sprint-171/docs-tree.md` | `docs/**/*.md` (audits/ ve superpowers/specs|plans HARİÇ — kendi çıktımız) |
| 171-025 | `docs/audits/sprint-171/docs-config-rules.md` | `.claude/rules/**`, `.gemini/rules/**`, `.cursor/rules/**`, `.contracts/api-surface.md`, `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/{IDENTITY,BOOT}.md` |
| 171-026 | `docs/audits/sprint-171/docs-dbsync.md` | `.brain/sprints/*.md`, `.brain/exports/*.md`, `.brain/{DEBT,MEMORY,RETRO,PATTERNS}.md`, `.brain/memory.db` (read-only) |
| 171-027 | `docs/audits/sprint-171/docs-archive.md` | `.brain/archive/**`, `.deckent/archive/**`, `.audit/**`, `examples/**`, `deckent-hub/**`, `.test/**` (dizin-bazlı, içerik örnekleme) |
| 171-028 | `docs/audits/sprint-171/db-decision-integrity.md` | `.brain/memory.db` (read-only query), `src/core/memory-store.ts`, `.brain/exports/**` |
| 171-029 | `docs/audits/sprint-171/SYNTHESIS.md` | `docs/audits/sprint-171/*.md` (28 rapor) + `find src tests scripts` coverage diff |

---

## Pre-Flight Verification

- [x] Spec commit (`59818a6`)
- [x] `npm run build` (Alperen, 2026-05-15) — bootstrap fix dist'e compile
- [x] MCP restart (Alperen, 2026-05-15) — runtime yeni dist
- [x] `.tasks/` temiz (0 dosya — Sprint 170 sonrası)
- [ ] Bu plan commit
- [ ] `docs/audits/sprint-171/` dizini mevcut (yoksa Brain ilk spawn'da oluşturur — `mkdir -p`)
- [ ] DIRECTIVES.md Sprint 171 yazıldı (29 task, JSON array dependency)
- [ ] `npx deckent doctor` READY
- [ ] `deckent plan` (structured mode yeterli — bootstrap fix aktif, cascade beklenmiyor)
- [ ] Alperen checkpoint: plan tablosu onayı
- [ ] `deckent start --auto-approve` (background) + Monitor cascade events
- [ ] Wave 4 tüm DONE → 171-029 manuel dispatch (ADR-047)

---

# WAVE 1 — Modül-Derin (171-001..008)

## Task 171-001 — orchestra/ Lifecycle Audit

**Files:** Write `docs/audits/sprint-171/orchestra-lifecycle.md` | Read `src/orchestra/{sprint-controller,brain,planner,task-builder,result-evaluator,result-collector,sprint-reporter,sprint-utils}.ts` + `src/orchestra/decision-steps/**`

**Audit boyutları (her dosya char-level):**
- PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP faz akışı kod gerçeği vs `.contracts/api-surface.md` Sprint Phases — tutarlı mı?
- ADR-008 (Brain merkezi import tek-yön): sprint-controller dışı modül tmux/auditor/worker import ediyor mu? Circular dependency var mı?
- ADR-046 (Brain Self-Update Hook), ADR-045 (Wave-Based Execution), ADR-043 (Crash Recovery), ADR-048 (Prompt Lifecycle) — kod enforcement mevcut mu yoksa sadece doküman mı?
- `result-evaluator.ts`: bootstrap fix P0-1 (satır ~214 `coverageOptional`) + P0-2 (satır ~1625 `findBoundaryViolations` protocol allowlist) gerçekten aktif mi, doğru semantik mi?
- Dead code: çağrılmayan export, ulaşılamaz dal. Eksik prosedür: yarım implementasyon, `TODO`/`FIXME`/`throw new Error('not implemented')`.
- `rotateModelForFix` lifecycle'a dokunuyorsa fix model downgrade etkisi görülüyor mu (not düş, asıl audit 171-002).

**Steps:** Worker Contract S1-S6 uygula. Kapsam Haritası ZORUNLU (her dosya + LoC).

## Task 171-002 — orchestra/ Routing + Evaluation Audit

**Files:** Write `docs/audits/sprint-171/orchestra-routing.md` | Read `src/orchestra/{task-router,outcome-tracker,quality-assessor,mid-sprint-adapter,rule-evolver,debt-manager,rubric-registry}.ts`

**Audit boyutları:**
- `rubric-registry.ts`: `isAuditTask`/`isDocumentWriteTask`/`detectTaskType`/`coverageOptional` mantığı — `docs/audits/` hardcoded konvansiyon doğru mu, kullanıcı zihin modeli `.audit/self/` ile uyumsuzluk bir bulgu (CRITICAL: doc-vs-code drift, OSS user'ı yanıltır).
- `debt-manager.ts` `rotateModelForFix` (~satır 138): fix task model downgrade (opus→sonnet→haiku) — tasarım hatası, fix orig'den zor, kanıtla (`file:line`) + öneri (semantik ters çevir).
- `task-router.ts` 6-level routing (ADR-015) kod gerçeği vs doküman.
- `outcome-tracker.ts` learning bonus/synergy matrix: persist doğru mu, race var mı?
- `quality-assessor.ts` multi-dim scoring: rubric ile tutarlı mı?
- Dead code, eksik prosedür, type safety hotspot.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-003 — orchestra/ Infra Audit

**Files:** Write `docs/audits/sprint-171/orchestra-infra.md` | Read `src/orchestra/{tmux,spawn-backend,spawn-backend-docker,temp-skill-generator,promotion-pipeline,event-stream,file-lock}.ts` + `src/orchestra/{doc-updaters,managed-docs}/**`

**Audit boyutları:**
- `tmux.ts`: Sprint 170 P0-3 taskId-aware prompt filename fix gerçekten aktif mi? 5 legacy literal-string test fixture tech debt (170-001) — kod tarafı doğru mu?
- `spawn-backend-docker.ts`: Sprint 170 P0-5 `PENDING_SPAWNS` Set + markPending/markActive/clearPending race window closure aktif mi, 4 wire point doğru mu?
- `event-stream.ts`: Sprint 170 P0-6 yarım kaldı — `PROMPT_WRITE`/`PROMPT_DELETE` channel EKSİK mi? Kanıtla (eksik = HIGH bulgu, Sprint 172 backlog).
- ADR-027 (Hybrid Spawn Backend), ADR-048 (Prompt Lifecycle, `.prompt-*.txt` selective cleanup `getActiveWorkerIds`): enforcement.
- `file-lock.ts`: lock/stale-lock semantiği, race.
- ADR-006 spawnSync security pattern: tüm subprocess çağrıları `spawnSync` array-arg mı, shell injection riski?
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-004 — core/ Types + Config Audit

**Files:** Write `docs/audits/sprint-171/core-types-config.md` | Read `src/core/{types,*-types,config,model-registry,mode-presets,condition-evaluator,manifest-migrator}.ts`

**Audit boyutları:**
- `config.ts` 3-layer merge (ADR-004): `dependency_pipeline_enabled` default değeri kod gerçeği = ? CLAUDE.md/DECKENT.md "Sprint 167'den true" iddiası vs gerçek (`.deckent/config.json` false görüldü) — CRITICAL doc-vs-code drift, kanıtla.
- `model-registry.ts`: 13 model, 3 provider, 4 tier — doküman (DECKENT.md tablosu) ile birebir mi? Eksik/fazla model?
- `types.ts` + `*-types.ts`: Task/Result/Sprint interface'leri `.contracts/api-surface.md` ile tutarlı mı? `coverage: number | null` tipi audit task'ı destekliyor mu?
- `mode-presets.ts` MODE_PRESETS: performance/balanced/economic/api — referans doğru.
- `condition-evaluator.ts` `$gt`/`$contains`/`$and`/`$or`: edge case, injection.
- Dead code, kullanılmayan type export.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-005 — core/ Memory Subsystem Audit

**Files:** Write `docs/audits/sprint-171/core-memory.md` | Read `src/core/memory-{store,query,normalize,types,export,import}.ts`

**Audit boyutları:**
- `memory-store.ts`: SQLite CRUD, FTS5, tags, relations, decay, history. `insertRelation`/`getRelations` API (Sprint 169 C1) mevcut + doğru mu?
- `memory-import.ts`: Sprint 169 C2 Bug Z3 rebuild safety — relations backup→import→verify→rollback contract aktif mi? `feedback_db_silmek_yasak` ihlali (DROP) var mı?
- `memory-export.ts`: Sprint 169 H1 ADR DB→FS export + ADR-046 reverse hook bi-directional contract — idempotent mı?
- `memory-normalize.ts` `turkishNormalize`: TR/EN/DE %100 recall iddiası — edge case (ı/İ, ğ, ß) doğru mu?
- `memory-query.ts` dual-layer FTS5: `buildAutoQuery` injection riski?
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-006 — core/ Pools + Routing Audit

**Files:** Write `docs/audits/sprint-171/core-pools-routing.md` | Read `src/core/{agent-pool,skill-pool,skill-registry,provider,routing-*,intent-classifier,activation-engine}.ts` + `src/core/{builtins,marketplace,rule-templates,notify-adapters,notification-providers}/**`

**Audit boyutları:**
- `agent-pool.ts`: 15 built-in agent, LRU eviction (max 50 temp, 5 sprint age) — DECKENT.md listesi ile birebir mi?
- `skill-pool.ts`/`skill-registry.ts`: 21 skill, AST sandbox validation — sandbox bypass riski?
- `routing-engine.ts` `routeTaskV2` (ADR-028 V2 migration): confidence scoring, override resolution. `excludeAgent`/`excludeSkills` doğru mu?
- `intent-classifier.ts`/`activation-engine.ts`: Layer 1-2 routing — exclude support.
- `provider.ts` ProviderAdapter: Claude/Codex/Gemini registry, fallback chain (tek retry, sonsuz döngü yok).
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-007 — agents/ Audit

**Files:** Write `docs/audits/sprint-171/agents.md` | Read `src/agents/**` (20 modül)

**Audit boyutları:**
- `worker.ts`: task claim, file locking, heartbeat, result write. ADR-037 RBAC runtime scope enforcement (`scope.filesWrite` dışına yazamaz) aktif mi?
- `adaptive-agent.ts`: runtime adaptation — race/state corruption?
- Worker verify loop (tsc + vitest, max 3 deneme) kod gerçeği vs worker-default.md.
- ADR-035 (Verification Protocol), ADR-047 (Manuel Subagent Dispatch) enforcement.
- Dead code, eksik prosedür, type safety.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-008 — nervous/ Audit

**Files:** Write `docs/audits/sprint-171/nervous.md` | Read `src/nervous/**`

**Audit boyutları:**
- ADR-040 Nervous System (Proactive Meta-Orchestrator) mimari kod gerçeği vs doküman.
- observer → detector-registry → decision-engine → proposer → dispatcher → executor akışı: kopuk halka var mı?
- `authority-matrix.ts` + `runtime-scope-check.ts`: ADR-037 RBAC enforcement gerçek mi?
- `detectors/**`: her detector çağrılıyor mu (dead detector)?
- `history.ts`: persist doğruluğu.
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

---

# WAVE 2 — Modül-Derin devam + Concern başlangıç (171-009..016)

## Task 171-009 — monitor/ + connectors/ Audit

**Files:** Write `docs/audits/sprint-171/monitor-connectors.md` | Read `src/monitor/**`, `src/connectors/**`

**Audit boyutları:**
- `monitor/`: Auditor scan loop (30sn), dashboard-manager, sprint-state. Auditor NEVER writes source (auditor.md kuralı) — kod garanti ediyor mu?
- Stale heartbeat (>2dk), stale lock (>5min), boundary violation (`git diff --stat`) detection doğru mu? (Active pattern: stale_heartbeat ×3 — tekrar eden, RC var mı?)
- `connectors/`: discord/telegram/whatsapp/incoming-router — secret leakage, input validation, ADR-016 connector lifecycle.
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-010 — providers/ + api/ Audit

**Files:** Write `docs/audits/sprint-171/providers-api.md` | Read `src/providers/**`, `src/api/**`

**Audit boyutları:**
- `providers/` claude/codex/gemini adapter: ADR-017 MCP-Native, fallback semantiği. API key yokken graceful mı (Codex/Gemini UNSET)?
- `claude.ts`: Sprint 170 P0-6 event stream wire EKSİK mi (`PROMPT_WRITE`/`PROMPT_DELETE`)?
- `api/`: HTTP server, SSE, rate limiting — auth, injection, DoS yüzeyi (OSS public öncesi kritik).
- Dead code, eksik prosedür, type safety.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-011 — mcp/ Audit

**Files:** Write `docs/audits/sprint-171/mcp.md` | Read `src/mcp/**`

**Audit boyutları:**
- 27 tool + 8 resource: DECKENT.md/CLAUDE.md sayıları (27/8) kod gerçeği ile birebir mi? Eksik/fazla tool?
- Tool input schema validation (Zod?): injection, path traversal (özellikle `root` param).
- `deckent_kill`/`deckent_cleanup` destructive guard: Alperen onay gate kod gerçeği (`feedback_sprint_kill_always_ask_user`).
- stdio transport, MCP server cache (rebuild sonrası eski kod) — bilinen gotcha doküman vs kod.
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-012 — cli/ Audit

**Files:** Write `docs/audits/sprint-171/cli.md` | Read `src/cli/**`

**Audit boyutları:**
- 55+ komut: DECKENT.md iddiası vs kod gerçeği sayım. `register<Name>(program)` pattern (ADR-012) tutarlı mı?
- ADR-010 tek runtime dependency (commander.js) — başka runtime dep sızmış mı?
- ADR-022-v2 CLI/MCP feature parity: her MCP tool'un CLI karşılığı var mı?
- `deckent recover`/`deckent spawn --auto-approve` recovery chain (BOOT.md) kod gerçeği.
- Komut arg injection, path traversal.
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-013 — dashboard/ Audit

**Files:** Write `docs/audits/sprint-171/dashboard.md` | Read `src/dashboard/**` (node_modules HARİÇ)

**Audit boyutları:**
- React+Vite+Tailwind: 7 sayfa, component mimari. Build CI gate (Sprint 169 H4 `dashboard-build.yml`) mevcut + doğru mu?
- Accessibility (WCAG): semantic HTML, ARIA, keyboard nav, kontrast — OSS public öncesi a11y temel.
- XSS yüzeyi: React'in ham HTML enjeksiyon prop'u (unsafe inner HTML), sanitize edilmemiş SSE/API verisi render'ı.
- analytics/ + api/: veri akışı, secret expose (client bundle'da key?).
- Dead code, kullanılmayan component, type safety.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-014 — extensions/vscode/ + scripts/ Audit

**Files:** Write `docs/audits/sprint-171/extensions-scripts.md` | Read `src/extensions/vscode/**`, `scripts/**` (45)

**Audit boyutları:**
- VS Code extension host: activation event, command registration, güvenlik (workspace trust).
- `scripts/**` 45 dosya: her script ne yapıyor, çağrılıyor mu (dead script), shell injection, hardcoded path/secret.
- `scripts/memory/*` (Sprint 169 migrate-relations, backfill-stub, export-adr-fs): idempotent mı, `feedback_db_silmek_yasak` ihlali (DROP/rm) var mı?
- `scripts/security/secret-baseline.mjs` (Sprint 169 H3): 10 regex pattern doğru mu?
- Dead code, eksik prosedür.

**Steps:** Worker Contract S1-S6. Kapsam Haritası ZORUNLU.

## Task 171-015 — Dead Code + ESM Hygiene (Concern)

**Files:** Write `docs/audits/sprint-171/dead-code.md` | Read tüm `src/**`

**Audit boyutları (cross-cut, pattern + derinlemesine):**
- Kullanılmayan export: hiçbir yerden import edilmeyen `export` (grep cross-ref). Aday liste + `file:line`.
- Ulaşılamaz kod: erken `return`/`throw` sonrası, `if(false)`, dead branch.
- ESM `.js` uzantı (ADR-002 Node16): `import ... from './x'` (eksik `.js`) — derleme kırığı riski, her ihlal `file:line`.
- Import cycle: A→B→A. Import depth aşırı (>5 zincir).
- `_` prefix ile susturulmuş unused var (backwards-compat hack — `feedback`).
- Çıktı: SİL/KORU önerisi her aday için (dispose disposition, ADR-038 formatı).

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK — concern task.)

## Task 171-016 — ADR Compliance (Concern)

**Files:** Write `docs/audits/sprint-171/adr-compliance.md` | Read `.brain/exports/decisions.md`, `docs/adr/**`, ilgili `src/**`

**Audit boyutları:**
- 46+ accepted ADR: HER biri için kod enforcement var mı yoksa sadece doküman mı? Tablo: ADR-ID | Başlık | Enforced? | Kanıt `file:line` | Drift.
- Bilinen drift adayları (öncelik): ADR-045 `dependency_pipeline_enabled` (config false vs CLAUDE.md true), ADR-046 bi-directional hook, ADR-048 prompt lifecycle, ADR-008 import tek-yön, ADR-037 RBAC, ADR-006 spawnSync.
- ADR DB↔FS senkron: `.brain/exports/decisions.md` ADR sayısı vs `docs/adr/*.md` dosya sayısı vs memory.db `getByType('adr')` count — üçü tutarlı mı (Sprint 169 H1 sonrası)?
- proposed ADR (042, 053, 055, 060, 061): kod öncesi mi, kısmi implement mi?
- Çıktı: en ciddi drift'ler CRITICAL (OSS GA'da kullanıcıyı yanıltır).

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

---

# WAVE 3 — Concern devam + Doc başlangıç (171-017..024)

## Task 171-017 — Security Audit (Concern)

**Files:** Write `docs/audits/sprint-171/security.md` | Read tüm `src/**`, `scripts/**`, config

**Audit boyutları:**
- OWASP top 10 (uygulanabilir): injection (command/SQL/path), broken auth, sensitive data exposure, XXE, broken access control, security misconfig.
- Command injection: tüm `spawnSync`/`exec`/`execSync` — array-arg mı, shell string mi (ADR-006 ihlali her biri CRITICAL + `file:line`).
- Path traversal: kullanıcı/MCP `root`/`taskId`/dosya param → `path.join` sanitize? `../` escape?
- Secret leakage: hardcoded key/token, log'a secret, client bundle, `.deck` secret system (ADR-014) doğru mu?
- `scripts/security/secret-baseline.mjs` 10 pattern yeterli mi (Sprint 169 H3)?
- OSS public öncesi: `git ls-files` ile commit'lenmiş secret riski.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-018 — Performance Audit (Concern)

**Files:** Write `docs/audits/sprint-171/performance.md` | Read tüm `src/**`

**Audit boyutları:**
- Sync I/O hot path: `readFileSync`/`writeFileSync`/`existsSync` sıcak döngüde (scan loop, evaluate, spawn) — ADR-005 (Synchronous I/O deprecated) ile çelişki, `file:line`.
- Memory leak: kapatılmayan handle, biriken Map/Set/array (örn. `PENDING_SPAWNS` temizleniyor mu?), event listener leak.
- Async anti-pattern: `await` in loop (paralelleştirilebilir), unhandled promise, `Promise.all` yerine seri.
- N+1: döngüde DB query / dosya okuma.
- Çıktı: hot path öncelikli, ölçülebilir öneri.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-019 — Type Safety Audit (Concern)

**Files:** Write `docs/audits/sprint-171/type-safety.md` | Read tüm `src/**`

**Audit boyutları:**
- `any`/`unknown` kullanımı: her `: any`, `as any`, `@ts-ignore`/`@ts-expect-error` — `file:line` + neden riskli.
- Unsafe assertion: `as Foo` (runtime kontrol yok), non-null `!` aşırı kullanım.
- Missing return type: public fonksiyon implicit any return.
- `tsconfig` strict ayarları: kapalı flag (strictNullChecks vs)?
- ADR-001 (TS+ESM) disiplini.
- Çıktı: tip güvenliği riski severity'li.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-020 — Error Handling Audit (Concern)

**Files:** Write `docs/audits/sprint-171/error-handling.md` | Read tüm `src/**`

**Audit boyutları:**
- Yutulan hata: `catch {}` boş, `catch(e){}` log'suz, `.catch(()=>{})`.
- Boundary try/catch eksik: subprocess, dosya I/O, JSON.parse, DB, network — fail-safe yok.
- Fail-safe/fallback pattern: bootstrap fix gibi kritik yollar fallback'li mi (ADR-035 verification, Layer 4 fail-safe)?
- Hata yutmanın spurious NO_GO'ya katkısı (Sprint 169 RC ile ilişki).
- Çıktı: kritik yol (evaluate/spawn/result) öncelikli.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-021 — Test Integrity Audit (Concern)

**Files:** Write `docs/audits/sprint-171/test-integrity.md` | Read tüm `tests/**`, `vitest.config.*`, `package.json`

**Audit boyutları:**
- 807 test dosyası: gerçek coverage iddiası (89.33% IDENTITY.md) doğrulanabilir mi? Coverage config doğru mu?
- Flaky pattern: timer/sleep bağımlı, sıra-bağımlı, race'li test.
- Mock drift: mock'lanan modül export'u gerçek ile uyumsuz (Sprint 170 170-001 5 legacy literal-string fixture — kanıtla).
- Skipped/`.only`/`.todo`: kalıcı skip kaç (IDENTITY 16 skipped iddiası), `.only` unutulmuş mu?
- Vitest baseline: `npx vitest run` beklenen pass ≥16475 + fail ≤2 + skip ≤41 — config gerçeği.
- Dashboard test (413) ayrı config doğru mu?

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-022 — Memory V2 DB Integrity (Concern)

**Files:** Write `docs/audits/sprint-171/memory-db-integrity.md` | Read `src/core/memory-*.ts`, `.brain/memory.db` (read-only), `.brain/exports/**`

**Audit boyutları:**
- Schema: 5 tablo + FTS5 virtual + schema_version. `.contracts/api-surface.md` şeması ile birebir mi?
- FTS5 index: 8 sütun (4 orijinal + 4 turkishNormalize) — drift, eksik index.
- relations FK: orphan relation (kaynak/hedef entry yok), Sprint 169 C1 migration sonrası count > 0 mı?
- decay: `decay_after_sprints` doğru çalışıyor mu, decay_exempt entry (PROJECT-IDENTITY) korunuyor mu?
- entry_history: field-level change tracking eksiksiz mi?
- DB-vs-export drift: `.brain/exports/{summary,decisions,memory,debt}.md` vs DB gerçeği (read-only `SELECT`, asla yazma — `feedback_db_silmek_yasak`).

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.) **NOT:** DB SADECE read-only query (`SELECT`). Hiçbir yazma/DROP/rebuild.

## Task 171-023 — Doc Audit: Root (Tier-1)

**Files:** Write `docs/audits/sprint-171/docs-root.md` | Read root `*.md` (21)

**Audit boyutları (her dosya tam okuma):**
- Doğruluk: iddialar kod gerçeği ile uyumlu mu (örn. README metrik, VISION, ROADMAP, BLUEPRINT, BETA-TRACKER, COMPETITIVE-ANALYSIS, CHANGELOG, AGENTS.md)?
- Gereklilik: dosya gerekli mi, mükerrer mi (README vs README-TR, VISION vs VISION-TR, NEXT-SESSION-PROMPT vs next-session-prompt — duplikasyon)?
- İçerik kalitesi: eksik bölüm, ölü link, kırık referans, güncel olmayan tarih/sprint no.
- Referans: iç link (`docs/...`, ADR no) geçerli mi?
- **8-badge ata:** her dosyaya core/necessary/guide/reference/info/internal/archive/deprecated + gerekçe.
- Aksiyon: SİL/BİRLEŞTİR/TAMAMLA/KORU + Sprint 172 reorg hedef path.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK — doc task; ama denetlenen 21 dosya listelenir.)

## Task 171-024 — Doc Audit: docs/ Tree (Tier-1)

**Files:** Write `docs/audits/sprint-171/docs-tree.md` | Read `docs/**/*.md` (audits/ + superpowers/specs|plans HARİÇ — kendi çıktımız, recursion önle)

**Audit boyutları:**
- docs/ alt yapı (adr/architecture/guide/reference/vision/governance/launch/release/development/...): mevcut yapı tutarlı mı, mükerrer (docs/CHANGELOG.md vs root CHANGELOG.md, docs/ROADMAP vs root ROADMAP)?
- Her .md: doğruluk + gereklilik + içerik + referans.
- 8-badge ata + gerekçe.
- **Sprint 172 reorg önerisi:** ideal /docs ağaç yapısı (badge-bazlı), hangi dosya nereye, hangi root dosya /docs'a taşınmalı. Bu, synthesis'in doc-reorg planının ana girdisi.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

---

# WAVE 4 — Doc + DB kapanış (171-025..028)

## Task 171-025 — Doc Audit: Config/Contract/Rules (Tier-1, kod-gerçeği kritik)

**Files:** Write `docs/audits/sprint-171/docs-config-rules.md` | Read `.claude/rules/**`, `.gemini/rules/**`, `.cursor/rules/**`, `.contracts/api-surface.md`, `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/{IDENTITY,BOOT}.md`

**Audit boyutları:**
- **Kod gerçeği ile doğruluk (en kritik):** brain.md/auditor.md/worker-default.md kuralları kod davranışı ile uyumlu mu? CLAUDE.md mimari tablosu (76 orchestra / 94 core modül) gerçek sayım ile? DECKENT.md agent/skill/tool sayıları (15/21/27) gerçek?
- 3-ortam rule senkron: `.claude` vs `.gemini` vs `.cursor` rules — divergence (biri güncel diğeri eski)?
- `.contracts/api-surface.md`: Task/Result JSON şeması + Sprint Phases kod gerçeği ile birebir mi (WAVE_BUILD step, `dependency_pipeline_enabled` notu doğru mu)?
- IDENTITY.md metrikleri (test sayısı, coverage, sprint no) güncel mi?
- 8-badge (çoğu `core`) + drift'ler CRITICAL (worker'ları yanlış yönlendirir).

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-026 — Doc Audit: DB-Sync Check (Tier-2)

**Files:** Write `docs/audits/sprint-171/docs-dbsync.md` | Read `.brain/sprints/*.md`, `.brain/exports/*.md`, `.brain/{DEBT,MEMORY,RETRO,PATTERNS}.md`, `.brain/memory.db` (read-only)

**Audit boyutları (içerik audit DEĞİL — senkron diff):**
- `.brain/sprints/sprint-*.md` (33): memory.db `sprint`/`memory` entry ile içerik tutarlı mı? Eksik sprint log (gap)? Sprint 161 stub (summary.md'de "stub inserted") gerçek içerik geldi mi (Sprint 169 H2)?
- `.brain/exports/*.md` auto-gen: DB'den doğru üretilmiş mi, stale mi (export tarihi vs son sprint)?
- `.brain/{DEBT,MEMORY,RETRO,PATTERNS}.md` legacy: hâlâ kullanılıyor mu yoksa DB-first sonrası ölü mü? Badge: çoğu `internal`/`archive`.
- Çıktı: sync drift tablosu + her dosya badge + sil/koru.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.) DB SADECE read-only.

## Task 171-027 — Doc Audit: Archive Özet (Tier-3)

**Files:** Write `docs/audits/sprint-171/docs-archive.md` | Read `.brain/archive/**`, `.deckent/archive/**`, `.audit/**`, `examples/**`, `deckent-hub/**`, `.test/**` (dizin-bazlı, içerik örnekleme — her dosya tam okuma DEĞİL)

**Audit boyutları:**
- Dizin-bazlı envanter: her arşiv dizini ne içeriyor, kaç dosya, kaç KB, ne amaçla, en son ne zaman dokunuldu.
- `.audit/sprint-167/` + `.audit/sprint-169/`: değerli bulgu var mı, Sprint 171'e taşınmalı mı yoksa arşiv mi?
- `examples/quickstart/`, `deckent-hub/`: OSS public'te gerekli mi (guide) yoksa internal mi?
- `.test/sprint-168-smoke-directives.md`: tek dosya, ölü mü?
- 8-badge (çoğu `archive`/`internal`) + dizin-bazlı SİL/TAŞI/KORU + `.gitignore`/`.npmignore` önerisi (OSS GA: `.brain/`,`.deckent/`,`.tasks/` exclude).

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)

## Task 171-028 — DB Decision/Reference Integrity

**Files:** Write `docs/audits/sprint-171/db-decision-integrity.md` | Read `.brain/memory.db` (read-only `SELECT`), `src/core/memory-store.ts`, `.brain/exports/**`

**Audit boyutları (her entry — "her bir kararı kontrol et"):**
- Her `entries` satırı (ADR/memory/sprint/debt/pattern/retro/identity): zorunlu alan dolu mu, status geçerli mi, sprint_id tutarlı mı?
- relations graph: 6 MADR tip (references/supersedes/caused_by/resolves/blocks/depends_on) — orphan (kaynak/hedef yok), kopuk zincir, beklenen ama eksik relation (örn. supersede edilen ADR hâlâ accepted mı?).
- entry_history: audit trail eksiksiz mi, gap var mı?
- Kırık `[[ref]]`: memory metni içi `[[name]]` link hedefi mevcut mu?
- decay doğruluğu: decay olması gereken eski entry duruyor mu, decay_exempt korunuyor mu?
- ADR DB↔FS: `getByType('adr')` count vs `docs/adr/*.md` vs `.brain/exports/decisions.md` — 3'lü tutarlılık (Sprint 169 H1).
- ADR-009 DEBT.md tablo formatı uyumu.
- Çıktı: integrity ihlalleri severity'li, her biri SQL/`file:line` kanıtlı.

**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.) **SADECE read-only `SELECT` — yazma/DROP/rebuild KESİN YASAK** (`feedback_db_silmek_yasak`).

---

# WAVE 5 — Synthesis (171-029, manuel dispatch)

## Task 171-029 — Cross-Cutting Synthesis + Coverage Doğrulama

**Files:** Write `docs/audits/sprint-171/SYNTHESIS.md` | Read `docs/audits/sprint-171/*.md` (28 rapor) + repo (coverage diff için `find`)

**Dispatch koşulu:** Wave 4 tüm task DONE (171-025..028) — Brain manuel (ADR-047, `dependency_pipeline_enabled: false`). DIRECTIVES dependency: `["171-001",...,"171-028"]`.

**Audit boyutları:**
1. **Konsolidasyon:** 28 raporun tüm bulgularını topla, dedupe, tek severity-sıralı backlog (CRITICAL→LOW).
2. **OSS-GA blocker:** Sprint 172 public flip'i bloke eden CRITICAL'ler (secret leak, doc-vs-code drift kullanıcı yanıltan, command injection) ayrı bölüm.
3. **AEGIS hizalama (ADR-061):** bulguları AEGIS faz/rol/artifact terminolojisiyle çerçevele (mode-agnostic — `feedback_mode_agnostic_deckent`); AEGIS manifestosuna girecek mimari güçler/zayıflıklar.
4. **Sprint 172 doc-reorg planı:** 171-023/024/025/026/027 badge atamalarını birleştir → ideal /docs ağaç yapısı + dosya→hedef path tablosu + `.npmignore`/`.gitignore` önerisi.
5. **Coverage Doğrulama (ZORUNLU — "1 virgül bile" ispatı):**
   - 171-001..014 raporlarının "Kapsam Haritası" tablolarının union'ını çıkar.
   - `find src tests scripts -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' \)` çalıştır (read-only).
   - Diff: hiçbir modül raporunda olmayan dosya = **CRITICAL coverage-gap**.
   - Tablo: toplam dosya / kapsanan / boşta + boşta kalanların listesi.
   - Coverage-gap > 0 → synthesis bunu en üst CRITICAL olarak işaretler (sprint GO_WTD'ye düşer).
6. **Sprint verdict önerisi:** Kapı 1 (orchestration) + Kapı 2 (içerik kalite) değerlendirmesi, Brain'e GO/GO_WTD/NO_GO önerisi + gerekçe.

**Steps:** Worker Contract S1-S6. Rapor Türkçe, tüm bölümler dolu. **Kapsam Doğrulama bölümü olmadan synthesis NO_GO.**

---

## Sprint Sonu (Brain — Alperen onayıyla)

- 29 rapor + SYNTHESIS.md `docs/audits/sprint-171/` altında.
- Memory insert (DB-first, sadece insert/upsert): `sprint-log-171`, `retro-sprint-171`, `mem-sprint-171`.
- `deckent memory export` → .md snapshot güncelle.
- Commit (Alperen onayı — `feedback_build_requires_user_approval`): `feat(sprint-171): self-audit mega-sprint — 29 rapor + synthesis`.
- Sprint 172 OSS GA girdisi: backlog + doc-reorg + AEGIS besleme hazır.

## Self-Review (plan vs spec)

- **Spec coverage:** §1 amaç→Goal ✓; §2 Q1-Q7+dil→Worker Contract+task ✓; §3 invariant→Worker Contract ✓; §4 Q2 revizyon→File Structure path ✓; §5 29 task→29 Task bölümü ✓; §6 wave→WAVE başlıkları ✓; §7 coverage-map→171-029 madde 5 + modül task Kapsam Haritası ✓; §8 şema→Rapor Şeması ✓; §9 dual-gate→Sprint Sonu+171-029 madde 6 ✓; §10 sonu→Sprint Sonu ✓; §11 kurallar→Yasaklar ✓; §12 riskler→Pre-Flight ✓.
- **Placeholder:** yok (her task spesifik audit boyutu + dosya listesi).
- **Tutarlılık:** task ID 171-001..029, wave 8/8/8/4/1=29, path `docs/audits/sprint-171/<name>.md` her yerde tutarlı.
