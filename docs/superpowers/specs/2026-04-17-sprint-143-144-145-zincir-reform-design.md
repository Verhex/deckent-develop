# Sprint 143-144-145 Zincir Reform — Design Spec

**Oluşturulma:** 2026-04-17
**Karar verici:** Alperen
**Brainstorming partner:** Claude Code (Opus 4.7)
**Kapsam:** 3 sprint zinciri (143, 144, 145) — kesin-kapsamlı çözüm, MVP yasak, chain-parallel yürütme
**Kaynak:** God Analysis Sprint 142 FINAL-REPORT-TR.md + brain-state.md + Alperen direktif (2026-04-17, 33 madde)
**Durum:** DRAFT — Alperen onayı bekliyor

---

## 1. Executive Summary

Bu spec, God Analysis Sprint 142'nin 233 bulgusunu (6 P0 + 45 P1 + 78 P2 + 104 P3) ve Alperen'in 33 direktifini (22 orijinal + 11 yeni) tek, tutarlı bir 3-sprint zincirinde çözer. Zincir chain-parallel yürütülür (Karar 5-D), her sprint opus-only Brain planlaması + Worker execution + brain co-evolve ile kapanır.

### 1.1 Başarı Kriterleri (3 sprint birleşik)

| Boyut | Baseline (Sprint 142) | Hedef (Sprint 145 sonu) |
|-------|-----------------------|-------------------------|
| Brain Sağlık | 72/100 | **95+/100** |
| Memory V2 Bütünlük | 82/100 | **100/100** |
| Genel Sağlık | 74/100 | **92+/100** |
| ADR Compliance | ~%85 | **%100 + exception protokolü** |
| Güvenlik | 68/100 | **95+/100** |
| Performans | 62/100 | **85+/100** |
| i18n | 45/100 | **95/100** |
| Test Kapsaması | 1.33x (B) | **1.50x+ (A) ve vitest pass %99.9+** |
| Tip Güvenliği | 83/100 | **95+/100** |
| Dokümantasyon | 58/100 | **90+/100** |
| Ölü Kod Temizliği | 93/100 | **100/100** |
| Config Tutarlılığı | 70/100 | **95+/100** |

### 1.2 5 Brainstorming Kararı (Alperen onaylı)

| # | Soru | Karar | Uygulanan sprint |
|---|------|-------|------------------|
| 1 | Operasyonel 18-task dağılımı | **B** — 3 sprint'e dağıt (6 P0 + 6 HIGH + 6 NORMAL) | 143 + 144 + 145 |
| 2 | FTS5 multi-word fix | **A** — Query builder fix + silent catch kaldır + debugLog | 143 |
| 3 | Relations tablosu | **C** — Hibrit: backfill + write-time enforcement + manuel gate | 143 |
| 4 | Brain co-evolve | **D** — A+B Sprint 143 (finalize hook + rule generator), C Sprint 145 (feature-level) | 143 + 145 |
| 5 | Chain safety | **D** — Happy path otomatik 5-check gate, FAIL path Alperen push | Tüm zincir |

### 1.3 Alperen 8 Karar Noktası (Sprint 142 FINAL-REPORT)

| # | Karar | Seçilen | Uygulanan sprint |
|---|-------|---------|------------------|
| 1 | Ölü kod temizliği | B+doğrulama hibrit (Direktif 15) | 144 |
| 2 | Memory V2 migrasyon | A — Tam migrasyon hemen | 143 |
| 3 | ADR-008 Cycle 2 | A — core/session-interface.ts çıkar | 144 |
| 4 | God object bölme | A — 4'ünü birden böl | 144 |
| 5 | Güvenlik sertleştirme | A — Tüm P0+P1 şimdi | 143 |
| 6 | ADR-010 güncellemesi | C — ADR amendment | 143 |
| 7 | i18n stratejisi | Direktif 19 override — **95 puan tam kapsam** | 145 |
| 8 | Test kapsaması | B ama kalite A → **A**: kritik yol + geniş | 145 |

### 1.4 Cross-Cutting Kurallar (3 sprint için sabit)

1. **Opus-only model:** Tüm Brain planlaması + tüm P0 + P1 task'lar Opus. P2 task'larda `sonnet` izinli fakat `code-reviewer` agent veya `simplifier` agent tercih edilir. P0/P1 ihlali = **NO_GO otomatik**.
2. **MVP yasak:** Her task kök neden analizi + kesin çözüm + doğruluk testi içerir. "Acaba-denesem-olur" pattern yasak. İhlal eden worker output'u `NO_GO` + prompt revizyonu.
3. **Core bozulamaz:** Brain sprint-finalize + cleanup + heartbeat daemon core özellikleri her sprint doctor check'inde validate edilir. Regresyon = chain ABORT.
4. **Chain safety gate (Karar 5-D):** Her sprint bitişi 5 otomatik check:
   - `deckent doctor` PASS zorunlu
   - `tsc --noEmit` 0 error zorunlu
   - `vitest run` %99+ pass zorunlu (12485 baseline'dan geri düşmesin)
   - Cost spike: sprint toplam cost > $15 → ABORT + notification
   - No_go rate: sprint içinde 3+ NO_GO → ABORT + notification
5. **Brain co-evolve (Direktif 31-32):** Her sprint sonu otomatik tetiklenir (Sprint 143'te wire olur):
   - `deckent memory export` → exports/ regenerate
   - `PROJECT-IDENTITY.md` auto-regen
   - `CHANGELOG.md` + `SPRINT-LOG.md` auto-append
   - `.claude/rules/*` + `.codex/rules/*` + `.gemini/rules/*` ADR-triggered regen
6. **Publishing rule (Direktif 33):** `docs/superpowers/` Deckent dev internal — npm package'a gitmez. `.npmignore` güncellenir Sprint 145'te.

---

## 2. Sprint 143 — "Güvenlik + Memory V2 Tam + Core Stabilite + Operasyonel P0"

### 2.1 Sprint Teması
**Ship-blocker foundation**: Brain health 72→85, Memory V2 82→100, güvenlik P0+P1 kapatılır, core stabilite (brain sprint-finalize, cleanup, heartbeat) runtime enforced.

### 2.2 Task Listesi (~20 task)

#### Wave 1 — P0 Güvenlik + Kritik Foundation (paralel, 5 task)

**T-143-001 — Shell injection fix (tmux.ts)**
- Agent: `security-auditor` | Skills: `security-specialist`, `typescript-expert`
- Files: `src/orchestra/tmux.ts`, `tests/orchestra/tmux.test.ts`
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: `taskId` parametresi `/^[\w-]+$/` regex ile valide edilir, eşleşmeyen input `throw new ValidationError`. spawnSync çağrılarında `shell: false` zorunlu. 3+ test: valid taskId, shell metacharacter injection attempt, empty/null taskId.
- Kanıt: `grep -n "spawnSync" src/orchestra/tmux.ts` → tüm çağrılarda shell:false, taskId validation.

**T-143-002 — Path traversal fix (checkpoint.ts, docs.ts, decision-logger.ts)**
- Agent: `security-auditor` | Skills: `security-specialist`
- Files: `src/mcp/tools/checkpoint.ts`, `src/mcp/tools/docs.ts`, `src/orchestra/decision-logger.ts` + testleri
- Scope: `src/mcp/`, `src/orchestra/`, `tests/mcp/`, `tests/orchestra/`
- Description: `sprintId`, `phase`, filename parametreleri `path.resolve(root, param)` sonrası `.startsWith(root)` check. `..` ve absolute path reddedilir. 5+ test (injection attempts).
- Kanıt: 3 dosyada path.resolve() + startsWith() pattern.

**T-143-003 — .brain/memory.db git takip düzelt**
- Agent: `devops-engineer` | Skills: `git-expert`, `devops-engineer`
- Files: `.gitignore`, `scripts/verify-gitignore.mjs` (yeni), `tests/scripts/verify-gitignore.test.ts`
- Scope: root + `scripts/`, `tests/scripts/`
- Description: `.gitignore` içine `.brain/memory.db` + `.brain/memory.db-shm` + `.brain/memory.db-wal` ekle. `git rm --cached .brain/memory.db` ile repo geçmişinden çıkar. `scripts/verify-gitignore.mjs` doctor check'e entegre: memory.db takip edilmiyor mu valide et.
- Kanıt: `git ls-files | grep memory.db` → 0 sonuç.

**T-143-004 — API auth default secure**
- Agent: `security-auditor` | Skills: `security-specialist`, `api-builder`
- Files: `src/api/auth.ts`, `src/api/server.ts`, `tests/api/auth.test.ts`
- Scope: `src/api/`, `tests/api/`
- Description: `if (!token) return true` (varsayılan açık auth) kaldırılır. Token yoksa **auth DISABLED log warning + 401 zorunlu** (secure default). CORS `*` yerine config'ten okunur. Security headers: X-Content-Type-Options, X-Frame-Options, Content-Security-Policy.
- Kanıt: `curl http://localhost:3000/api/sprint` → 401 (token olmadan).

**T-143-005 — health-check.ts dosya yolu uyuşmazlığı fix**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/doc-updaters/health-check.ts`, `tests/orchestra/doc-updaters/health-check.test.ts`
- Scope: `src/orchestra/doc-updaters/`, `tests/orchestra/doc-updaters/`
- Description: `shouldRun()` ve `run()` aynı path'e referans verecek şekilde ortak `CONFIG.DOC_PATH` constant tanımlanır. Mevcut stub bug fix. 3+ test.
- Kanıt: doc updater runtime'da asla skip olmuyor (wire test).

#### Wave 2 — Memory V2 Tam Migrasyon (paralel, 4 task)

**T-143-006 — FTS5 query builder fix (Karar 2-A)**
- Agent: `bug-fixer` | Skills: `typescript-expert`, `testing-expert`
- Files: `src/core/memory-query.ts`, `src/core/debug-log.ts` (yeni), `src/cli/commands/recall.ts`, `src/mcp/tools/memory-query.ts`, `tests/core/memory-query.test.ts`
- Scope: `src/core/`, `src/cli/commands/`, `src/mcp/tools/`, `tests/core/`, `tests/cli/`, `tests/mcp/`
- Description:
  1. `escapeFts5Query()` içinde default operatör `OR` olarak join (mevcut boşluk join yerine `.join(' OR ')`)
  2. Opsiyonel `mode?: 'and' | 'or'` parametresi (default `or`) — AND istenirse eski davranış
  3. Silent catch kaldır (`catch { return []; }`) → `debugLog.error('FTS5 query failed', { query, error })` + propagate
  4. `src/core/debug-log.ts` yeni modül — structured stderr log (Direktif 22 observability katmanı)
  5. CLI `recall` komutuna `--mode=and|or` flag
  6. MCP `deckent_memory_query` tool schema'ya `mode` parametresi
- Kanıt: `deckent recall "docker heartbeat"` → ≥7 sonuç. FTS error durumunda stderr'de structured error log görülür.

**T-143-007 — Relations hibrit: backfill + write-time enforcement (Karar 3-C)**
- Agent: `architect` | Skills: `typescript-expert`, `system-architect`
- Files: `scripts/backfill-relations.mjs` (yeni), `src/core/memory-store.ts`, `src/orchestra/task-builder.ts`, `src/orchestra/sprint-finalizer.ts`, `src/cli/commands/memory.ts`, `tests/core/memory-store.test.ts`, `tests/scripts/backfill-relations.test.ts`
- Scope: `scripts/`, `src/core/`, `src/orchestra/`, `src/cli/commands/`, `tests/`
- Description:
  1. **Backfill script:** mevcut 65 entry'den pattern-based relation çıkar:
     - ADR content'te `/\bADR-\d{3}\b/g` regex match → `references` relation
     - ADR content'te "supersedes ADR-XXX" → `supersedes` relation
     - Debt entry `sprint_id` → ilgili sprint-log'a `caused_by`
     - Sprint finalize: sprint-log → memory → retro üçlü `depends_on` zinciri
  2. Backfill çıktısı `.brain/exports/relations-backfill-preview.md` dosyasına yazılır
  3. **Manuel gate:** `deckent memory relations review` komutu ile Alperen preview'u onaylar (y/n per relation). Onaylananlar DB'ye yazılır.
  4. **Write-time enforcement:** `MemoryStore.insert()` opsiyonel `relations?: Relation[]` parametresi alır (tavsiye: zorunlu değil ama AUTO-EXTRACT). `insert()` sırasında content regex match ile auto `references` yazar.
  5. `sprint-finalizer.ts` finalize sırasında sprint-log + memory + retro arasında otomatik `depends_on` yazar.
- Kanıt: `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM relations"` → 80+. Alperen gate preview'u onaylı.

**T-143-008 — Memory V2 tam migrasyon (ci-reporter + content-generators + template-renderer + managed-doc-runner)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/orchestra/ci-reporter.ts`, `src/orchestra/managed-docs/content-generators.ts`, `src/orchestra/managed-docs/template-renderer.ts`, `src/orchestra/managed-docs/managed-doc-runner.ts` + testler
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: 4 V2 ihlali kaldırılır:
  1. `ci-reporter.ts` RETRO.md ve MEMORY.md'yi doğrudan yazıyor → `store.upsert({ type: 'retro'|'memory', ... })`
  2. `content-generators.ts` DEBT.md okuyor → `store.getByType('debt')`
  3. `template-renderer.ts` sprint dosyaları okuyor → `store.getByType('sprint', { sprint_num })`
  4. `managed-doc-runner.ts` `.brain/sprints/*.md` okuyor → store query
  Export generator hâlâ dosya üretir (fakat DB'den).
- Kanıt: `grep -rn "readFileSync.*\.brain/\(RETRO\|MEMORY\|DEBT\|PATTERNS\)" src/` → 0 sonuç.

**T-143-009 — DECISIONS.md arşivle + init.ts DB önyükleme (Direktif 29)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/cli/commands/init.ts`, `scripts/archive-decisions-md.mjs` (yeni), `.gitignore`, `tests/cli/init.test.ts`
- Scope: `src/cli/commands/`, `scripts/`, `tests/cli/`
- Description:
  1. `.brain/DECISIONS.md` (1505 satır, root) silinir → Memory V2'de DB tek kaynak
  2. Sadece `.brain/exports/decisions.md` (auto-generated) kalır
  3. `.brain/archive/pre-v2/DECISIONS.md` backup korunur (SHA hash manifest ile)
  4. `init.ts` yeni proje oluştururken `.brain/memory.db` **önyükleme** yapar (mevcut: etmiyor, yeni projeler DB'siz başlıyor). 40 ADR + identity entry + schema_version v2.
  5. `@.brain/MEMORY.md` hâlâ init template'de → `@.brain/exports/summary.md` olarak güncellenir
- Kanıt: `ls .brain/DECISIONS.md` → no such file. Yeni proje init sonrası `sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries"` → ≥40.

#### Wave 3 — Brain Co-Evolve A+B (paralel, 2 task)

**T-143-010 — Sprint-finalizer hook (Karar 4-A)**
- Agent: `architect` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-finalizer.ts`, `src/orchestra/doc-updaters/registry.ts`, `src/core/identity-generator.ts` (yeni), `tests/orchestra/sprint-finalizer.test.ts`
- Scope: `src/orchestra/`, `src/core/`, `tests/orchestra/`
- Description: Sprint finalize sonunda otomatik zincir:
  1. `deckent memory export` → `.brain/exports/*` regenerate
  2. `PROJECT-IDENTITY.md` auto-regen → MCP tool sayısı, CLI komut sayısı, ADR sayısı, test sayısı DB'den + dist/ analyze
  3. `CHANGELOG.md` append (sprint metrikleri)
  4. `SPRINT-LOG.md` append (sprint özet)
  5. `docs/CHANGELOG.md` + `docs/SPRINT-LOG.md` aynı zincire bağlanır
- Kanıt: Sprint 143 finalize sonrası exports/summary.md entry count = DB count. IDENTITY.md sayıları güncel.

**T-143-011 — Rule generator (Karar 4-B, 3 provider)**
- Agent: `architect` | Skills: `typescript-expert`, `system-architect`
- Files: `src/core/rule-generator.ts` (yeni), `src/core/rule-templates/` (yeni dizin), `src/orchestra/sprint-finalizer.ts`, `tests/core/rule-generator.test.ts`, `tests/core/rule-templates.test.ts`
- Scope: `src/core/`, `src/orchestra/`, `tests/core/`
- Description:
  1. `rule-generator.ts`: DB'den ADR entry'leri + skill templates → `.claude/rules/*.md` + `.codex/rules/*.md` + `.gemini/rules/*.md` üretir
  2. Her rule dosyası 2 section: `<!-- AUTO-START -->` (generated) + `<!-- CUSTOM-START -->` (user-editable, korunur)
  3. 3 provider adapter: claude (system prompt injection), codex (instructions), gemini (context)
  4. Sprint finalize sonu ADR değişimi varsa rule regen (diff yazılır sprint retro'suna)
- Kanıt: `.claude/rules/brain.md` AUTO section ADR-008 + Memory V2 kurallarını içerir. `.codex/rules/*` + `.gemini/rules/*` oluşturuldu.

#### Wave 4 — Operasyonel P0 (Karar 1-B Wave A — 6 task)

**T-143-012 — MCP disconnect fix (background sprint runner)**
- Agent: `architect` | Skills: `typescript-expert`, `system-architect`
- Files: `src/cli/commands/start.ts`, `src/orchestra/sprint-runner-entry.ts` (yeni), `src/mcp/tools/start.ts`, `tests/integration/mcp-sprint-isolation.test.ts`
- Scope: `src/cli/`, `src/orchestra/`, `src/mcp/`, `tests/integration/`
- Description: `deckent_start` fire-and-forget runSprint Promise aynı stdio process'inde event loop'u bloke ediyor → MCP disconnect (Sprint 139 80dk live incident). Fix: detached spawn `sprint-runner-entry.ts` child process → MCP server stdio serbest. Parent-child IPC via `.deckent/sprint-NNN-ipc/` fifo.
- Kanıt: 100 task sprint sırasında MCP disconnect 0.

**T-143-013 — Auto-archive guard (Task 3 catastrophic regression koruması)**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-finalizer.ts`, `src/orchestra/task-restoration.ts` (yeni), `tests/orchestra/auto-archive.test.ts`
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: Sprint 139 Task 3 catastrophic auto-archive regression: archive sırasında .tasks/ içindeki incomplete task'lar siliniyor → veri kaybı. Fix: pre-archive snapshot `.deckent/sprint-NNN-pre-archive.tar.gz`. Hash integrity check. Archive sadece DONE/NO_GO task'larda — PENDING/EXECUTING korunur.
- Kanıt: Archive sırasında PENDING task silinmiyor. Snapshot restore testi pass.

**T-143-014 — Layer 4 runtime wire deploy (ADR-006 canlı enforcement)**
- Agent: `architect` | Skills: `typescript-expert`
- Files: `src/orchestra/authority-enforcer.ts`, `src/orchestra/sprint-controller.ts`, `tests/orchestra/layer4-runtime.test.ts`
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: Sprint 138'de Layer 4 runtime wire 3-sprint fail streak → ADR-006 spawnSync canlı enforcement eksik. Fix: `authority-enforcer.ts` runtime hook'u sprint-controller.ts spawn phase'inde wire edilir. ADR ihlali detect edilirse task NO_GO + ADR amendment proposal.
- Kanıt: Worker bir task'ta `spawnSync(cmd, { shell: true })` yazarsa auditor → NO_GO + breadcrumb log.

**T-143-015 — Task restoration on crash**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-checkpoint.ts`, `src/cli/commands/resume.ts`, `tests/orchestra/task-restoration.test.ts`
- Scope: `src/orchestra/`, `src/cli/commands/`, `tests/orchestra/`
- Description: Koordinatör crash olursa sprint state (task progress, heartbeats, locks) restore edilmeli. Mevcut `sprint-checkpoint.ts` hazır ama wire yok. Fix: sprint phase transition'larında otomatik checkpoint write. `resume` komutu crash'ten sonra devam eder.
- Kanıt: Sprint orta noktada `SIGKILL coordinator` → `deckent resume` ile sprint devam eder.

**T-143-016 — Panic kill guard**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-controller.ts`, `src/core/panic-guard.ts` (yeni), `tests/orchestra/panic-guard.test.ts`
- Scope: `src/orchestra/`, `src/core/`, `tests/orchestra/`
- Description: Sprint 139 panic kill incident: koordinatör panic → Alperen onayı olmadan tüm worker'lar kill edildi. Fix: `panic-guard.ts` → panic kill Alperen onayı gerektirir (Feedback memory: "tartışmasız kural"). Exception: `deckent kill --force --user-explicit` bayrağı.
- Kanıt: Runtime panic'te "Alperen onayı bekleniyor" prompt. Force flag ile override mümkün.

**T-143-017 — E2E harness (chain safety foundation)**
- Agent: `test-writer` | Skills: `testing-expert`, `ci-testing`
- Files: `tests/e2e/sprint-lifecycle.e2e.test.ts` (genişlet), `tests/e2e/chain-safety.e2e.test.ts` (yeni), `scripts/run-e2e-harness.mjs` (yeni)
- Scope: `tests/e2e/`, `scripts/`
- Description: Chain safety gate validation için E2E: 3-task mini-sprint → finalize → gate check (doctor + tsc + vitest + cost + no_go). Next sprint auto-trigger veya ABORT.
- Kanıt: `npm run e2e:chain` → PASS. Gate fail scenario'sunda ABORT + notification.

#### Wave 5 — ADR-010 Amendment + Kalite (3 task)

**T-143-018 — ADR-010 amendment (Karar 6-C)**
- Agent: `doc-writer` | Skills: `documentation-writer`
- Files: `.brain/archive/pre-v2/DECISIONS.md` (güncellenen referans için tek kullanımlık), `src/core/memory-store.ts` (amendment insert), `tests/core/memory-store.test.ts`
- Scope: `src/core/`, `tests/core/`
- Description: ADR-010 "Tek runtime bağımlılık" → "Minimal runtime bağımlılıkları" olarak yeniden adlandırılır. 4 bağımlılık (commander, better-sqlite3, @modelcontextprotocol/sdk, zod) gerekçeleriyle belgelenir. Amendment MemoryStore'a insert edilir (upsert `adr-010` yeni content).
- Kanıt: `deckent recall "minimal runtime dependency"` → ADR-010 amendment görülür.

**T-143-019 — MCP help.ts TOOLS dizisi fix + server talimatları + tool count**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/mcp/tools/help.ts`, `src/mcp/server.ts`, `src/mcp/tools/index.ts`, `tests/mcp/help.test.ts`
- Scope: `src/mcp/`, `tests/mcp/`
- Description: help.ts TOOLS dizisi eksik 6 tool (agent_list, skill_list, checkpoint, docs, explain, memory_query) ekle. server.ts "Tools (21)" → "Tools (22)". Server instructions Memory V2 yolları (V1 MEMORY.md/DEBT.md referansları kaldırılır).
- Kanıt: `deckent_help` → 22 tool listeli. server startup log'ta "22 tools registered".

**T-143-020 — heartbeat-daemon execSync beyaz listesi**
- Agent: `security-auditor` | Skills: `security-specialist`
- Files: `src/orchestra/heartbeat-daemon.ts`, `tests/orchestra/heartbeat-daemon.test.ts`
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: `heartbeat-daemon.ts:116-119` execSync komutları HEARTBEAT.md'den gelir, beyaz listede değil → injection riski. Fix: beyaz liste `['ps', 'kill', 'wait']` + args validation.
- Kanıt: HEARTBEAT.md içine malicious command yazılsa execSync reject eder.

### 2.3 Sprint 143 Sonu Gate (Karar 5-D)

Otomatik 5-check chain safety gate:
- `deckent doctor` PASS zorunlu
- `tsc --noEmit` 0 error zorunlu
- `vitest run` ≥99% pass (12485 baseline'dan geri düşmesin)
- Sprint cost < $15
- NO_GO count < 3

PASS → Sprint 144 otomatik tetiklenir.
FAIL → Chain ABORT, notification dispatcher Claude Code chat bar'a push, Alperen müdahalesi bekler.

### 2.4 Sprint 143 Tahmini Metrikler

| Metrik | Hedef |
|--------|-------|
| Task sayısı | 20 |
| Opus task | 20 (Alperen direktifi: P0+P1 kesin opus, Sprint 143 tümü P0/P1 kritik) |
| Sonnet task | 0 |
| Süre hard cap | 4 saat |
| Cost budget | $12 |
| Başarı kriteri | Brain health 72 → 85 (ara hedef; 95+ Sprint 145 sonu), Memory V2 82 → 100, 6 P0 güvenlik closed, core stabilite runtime enforced, operasyonel P0 6-task closed |

**Brain health 72→85 gerekçesi (ara hedef):** Memory V2 tam migrasyon (+10 puan: relations backfill + FTS5 fix + export stale fix + PATTERNS.md sync + sprint-141 log DB + IDENTITY.md auto-regen), DECISIONS.md archive (+2 puan: bellek bütçesi 1505 satır altına), ADR relations (+1 puan: 1→80+ relation). Kalan +10 puan Sprint 144 (god split architectural +4 + ADR-008 cycle fix +3 + performance +3) ve Sprint 145 (doc cross-validation + feature co-evolve +10)'te gelir. 72→85→92→95+ zincir progression.

---

## 3. Sprint 144 — "God Split + ADR-008 Cycle 2 + Performans + Operasyonel HIGH"

### 3.1 Sprint Teması
**Mimari temizlik**: God object'ler (init, doctor, retro, worker) bölünür, ADR-008 Cycle 2 çözülür (core/session-interface.ts), Auditor tarama async, operasyonel HIGH 6 task.

### 3.2 Task Listesi (~20 task)

#### Wave 1 — God Split (paralel, 4 task)

**T-144-001 — init.ts split (1552 LoC → 4 dosya)**
- Agent: `refactorer` | Skills: `typescript-expert`, `system-architect`
- Files: `src/cli/commands/init.ts` (thin), `src/cli/commands/init-steps.ts` (yeni), `src/cli/commands/init-templates.ts` (yeni), `src/cli/commands/init-wizard.ts` (yeni), `tests/cli/init*.test.ts`
- Scope: `src/cli/commands/`, `tests/cli/`
- Description: init.ts 1552 LoC, 620 satırlık monolit handler → 4 modül. Her modül ≤400 LoC, tek sorumluluk. Memory V2 DB önyükleme init-steps.ts'e. Tests restoration: mevcut `tests/cli/init.test.ts` (2270 LoC God test) da bölünür.
- Kanıt: `wc -l src/cli/commands/init*.ts` → her biri <400.

**T-144-002 — doctor.ts split (1069 LoC → 3 dosya)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/cli/commands/doctor.ts` (thin), `src/cli/commands/doctor-checks.ts` (yeni), `src/cli/commands/doctor-format.ts` (yeni), `tests/cli/doctor*.test.ts`
- Scope: `src/cli/commands/`, `tests/cli/`
- Description: doctor.ts 1069 LoC, 26 export → 3 modül. Health checks doctor-checks.ts'e, output format doctor-format.ts'e. Memory V2 checks DB-first (mevcut V1 DEBT.md parse kaldırılır).
- Kanıt: `wc -l src/cli/commands/doctor*.ts` → her biri <500.

**T-144-003 — retro.ts split (453 LoC → 3 dosya)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/cli/commands/retro.ts` (thin), `src/cli/commands/retro-parser.ts` (yeni), `src/cli/commands/retro-formatter.ts` (yeni), `tests/cli/retro*.test.ts`
- Scope: `src/cli/commands/`, `tests/cli/`
- Description: retro.ts (453 LoC) → 3 modül, her biri ≤200 LoC. Memory V2 DB-first (mevcut RETRO.md parse kaldırılır, store.getByType('retro')).
- Kanıt: `wc -l src/cli/commands/retro*.ts` → her biri <200.

**T-144-003b — worker.ts split (1669 LoC → 4 dosya)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/agents/worker.ts` (thin), `src/agents/worker-verify.ts` (yeni), `src/agents/worker-lifecycle.ts` (yeni), `src/agents/worker-log.ts` (yeni), `tests/agents/worker*.test.ts`
- Scope: `src/agents/`, `tests/agents/`
- Description: worker.ts (1669 LoC, God Object) → 4 modül. worker-verify.ts (tsc+vitest verify loop), worker-lifecycle.ts (claim/heartbeat/lock/result), worker-log.ts (structured logging). 5 @deprecated delege fonksiyonu (acquireLock, releaseLock, checkLock, releaseAllLocks, writeFinishedHeartbeat) tamamen silinir. ADR-008 ihlali redactSensitive T-144-012 ile ayrıca taşınır.
- Kanıt: worker.ts ≤500 LoC. @deprecated fonksiyonlar 0. worker.ts test suite (8 dosya) 4 modüle dağıtılır.

**T-144-004 — ADR-008 Cycle 2 fix: core/session-interface.ts çıkar (Karar 3-A)**
- Agent: `architect` | Skills: `typescript-expert`, `system-architect`
- Files: `src/core/session-interface.ts` (yeni), `src/providers/claude.ts`, `src/providers/codex.ts`, `src/providers/gemini.ts`, `src/orchestra/connector.ts`, `src/orchestra/tmux.ts`, testler
- Scope: `src/core/`, `src/providers/`, `src/orchestra/`, `tests/`
- Description: Provider↔Connector↔tmux 7-node döngüsel bağımlılık → `SessionInterface` core/session-interface.ts'te tanımlanır. Provider'lar sadece interface'e bağımlı, tmux implementasyonunu bilmez. connector.ts interface'i implement eder, tmux delegasyonu içerir. ADR-008 uyumu 100%.
- Kanıt: `madge --circular src/` → Cycle 2 yok.

#### Wave 2 — Performans + Ölü Kod (paralel, 5 task)

**T-144-005 — Auditor async scan loop (52 sync I/O elimine)**
- Agent: `performance-analyzer` | Skills: `performance-optimizer`, `typescript-expert`
- Files: `src/agents/auditor.ts`, `src/orchestra/heartbeat-daemon.ts`, tests
- Scope: `src/agents/`, `src/orchestra/`, `tests/`
- Description: Auditor 30s scan döngüsünde 52 senkron I/O + 9 spawnSync. Fix: `fs.promises.*` + `spawn` (stream-based). Parallel readdir + stat with `Promise.all`. Target: scan latency 30s → <5s.
- Kanıt: benchmark: 100-worker simülasyon scan 5s altında.

**T-144-006 — Ölü kod silme Wave A (agent + V1 routing, 17 dosya, 2780 LoC)**
- Agent: `refactorer` | Skills: `code-simplifier`
- Files: 17 ölü dosya (13 agent + 4 V1 routing)
- Scope: `src/agents/`, `src/orchestra/`
- Description: God Analysis onaylanmış 17 ölü dosya silinir (Karar 1-B+A hibrit):
  - Agent: 13 dosya (2289 LoC)
  - V1 routing: decision-engine.ts, decision-replay.ts, agent-step.ts, scope-step.ts (491 LoC)
  - Silmeden önce `grep -rn "<filename>"` 0 reference doğrulama
  - Tests ve barrel exports temizlenir
- Kanıt: `git diff --stat` 17 dosya delete. Build+test pass.

**T-144-007 — Ölü kod silme Wave B (orchestra sahipsiz + feature flag, 12 dosya, 2139 LoC)**
- Agent: `refactorer` | Skills: `code-simplifier`
- Files: multi-agent.ts, handoff-protocol.ts, batch-stats.ts, metrics-updater.ts, learning-decay.ts, learning-migration.ts, combination-scorer.ts + feature flag dead code
- Scope: `src/orchestra/`, `src/core/`
- Description: 12 dosya silinir. Her dosya için "ne için eklenmişti, v2'si var mı" audit notları retro'ya eklenir (Direktif 15). `adaptiveAgentEnabled`, `sharedMemoryEnabled`, `PreloadConfig` flag'ler kaldırılır.
- Kanıt: `git diff --stat` 12 dosya delete. Retro'da "ölü kod disposition" section.

**T-144-008 — file-lock.ts path traversal sanitize + deck-file.ts izin fix (0o644→0o600) + credential cache**
- Agent: `security-auditor` | Skills: `security-specialist`, `performance-optimizer`
- Files: `src/core/file-lock.ts`, `src/core/deck-file.ts`, `src/core/credentials.ts`, tests
- Scope: `src/core/`, `tests/core/`
- Description: P1 güvenlik + perf:
  - file-lock.ts: `lockFilePathFor()` `..` ve absolute path sanitize
  - deck-file.ts: 0o644 → 0o600 (only owner readable)
  - credentials.ts: `getMasterKey` cache (her encrypt/decrypt çağrısında disk I/O kaldır)
- Kanıt: chmod check, cache hit rate ≥99%.

**T-144-009 — Dockerfile hardening (USER + multi-stage)**
- Agent: `devops-engineer` | Skills: `docker-expert`, `devops-engineer`
- Files: `Dockerfile`, `.dockerignore`, tests
- Scope: root, `tests/docker/`
- Description: Multi-stage build (builder + runtime). `USER deckent` (UID 10001). Secrets in layers audit. Image size baseline → optimize. Health check command.
- Kanıt: `docker run deckent whoami` → deckent (not root). Image size <400MB.

#### Wave 3 — i18n Temel (paralel, 3 task)

**T-144-010 — i18n temel CLI (init, start, status, help, doctor)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/cli/helpers/messages.ts` (genişlet), 5 CLI komut dosyası, tests
- Scope: `src/cli/`, `tests/cli/`
- Description: 5 temel kullanıcı komutu için TR/EN mesajlar messages.ts'ye taşınır. LANG env var ile seçim. Dashboard i18n pattern ile uyumlu.
- Kanıt: `LANG=tr deckent init` → TR mesajlar. `LANG=en deckent init` → EN.

**T-144-011 — Türkçe locale (.toLowerCase → .toLocaleLowerCase('tr'))**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/managed-docs/content-generators.ts`, `src/orchestra/managed-docs/section-updater.ts`, `src/orchestra/baseline-tracker.ts`, tests
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: 3 dosyada `.toLowerCase()` Türkçe İ/ı dönüşümünü bozuyor. Fix: `.toLocaleLowerCase('tr-TR')`. Test edilmiş karakterler: İ/ı/I/i.
- Kanıt: `"İSTANBUL".toLocaleLowerCase('tr-TR')` → "istanbul" (correct).

**T-144-012 — redactSensitive CLI→core taşı (ADR-008)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/core/redact-sensitive.ts` (yeni), `src/cli/helpers/output.ts`, `src/agents/worker.ts`, tests
- Scope: `src/core/`, `src/cli/helpers/`, `src/agents/`
- Description: worker.ts CLI'dan import ediyor (ADR-008 ihlali). Fix: core/redact-sensitive.ts çıkar. worker.ts + cli/helpers/output.ts core'dan import eder.
- Kanıt: `grep -rn "from.*cli.*helpers" src/agents/` → 0 sonuç.

#### Wave 4 — Operasyonel HIGH (Karar 1-B Wave B, 6 task)

**T-144-013 — Docker HB deploy (Sprint 139 fix canlı)**
- Agent: `devops-engineer` | Skills: `docker-expert`
- Files: `src/orchestra/spawn-backend-docker.ts`, `src/orchestra/heartbeat-daemon.ts`, tests
- Scope: `src/orchestra/`, `tests/`
- Description: Sprint 139 T-013 Docker HB atomicWrite + SIGTERM fix yazıldı ama deploy yetersiz. Wire check: `spawn-backend-docker.ts` atomicWriteFileSync + 15s grace period + fsync hook runtime'da aktif mi. Test edilmiş.
- Kanıt: Docker backend 10-e2e test PASS. Heartbeat gap <5s.

**T-144-014 — Event stream emit (Sprint 138 foundation canlı)**
- Agent: `architect` | Skills: `typescript-expert`
- Files: `src/orchestra/event-stream.ts`, `src/orchestra/sprint-controller.ts`, `src/agents/worker.ts`, `src/agents/auditor.ts`, tests
- Scope: `src/orchestra/`, `src/agents/`, `tests/`
- Description: Sprint 138 event-stream.ts foundation atıldı (305 LoC) ama emit call site'ları yetersiz. Wire check: Brain/Worker/Auditor sprint phase + task claim + ADR violation + FIX cycle event'leri yazıyor mu.
- Kanıt: `.deckent/sprint-144-events.jsonl` full lifecycle kapsar.

**T-144-015 — Sprint-state lifecycle (pid manager)**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-pid-manager.ts`, `.deckent/pids/` yönetimi, tests
- Scope: `src/orchestra/`, `tests/orchestra/`
- Description: `.deckent/pids/` sadece canlı sprint için tutulsun. Sprint biterken önceki sprint pid'leri silinir. Stale pid detection + auto-cleanup.
- Kanıt: Sprint 144 biterken `.deckent/pids/*sprint-143*` → 0 dosya.

**T-144-016 — Retro sprint-id normalize**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-retro-writer.ts`, `src/core/memory-store.ts`, tests
- Scope: `src/orchestra/`, `src/core/`, `tests/`
- Description: DB'de retro entry'leri `retro-sprint-141` ve `retro-latest` iki kayıt — tutarsız. Fix: canonical ID `retro-sprint-NNN` ve alias `retro-latest` pointer. Backfill: eski retro-latest'ı sprint-id'ye bağla.
- Kanıt: `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE type='retro'"` → sprint-specific ID'ler.

**T-144-017 — Orphan cleanup (.tasks + locks)**
- Agent: `bug-fixer` | Skills: `typescript-expert`
- Files: `src/orchestra/sprint-finalizer.ts`, `src/core/orphan-cleaner.ts` (yeni), tests
- Scope: `src/orchestra/`, `src/core/`, `tests/`
- Description: Sprint bitiminde `.tasks/task-*.json` ve `.locks/*.lock` orphan dosyalar temizlensin. Mevcut cleanup gap var. Safety: sadece DONE/NO_GO task'lar, PENDING korunur (Sprint 139 incident lesson).
- Kanıt: Sprint 144 sonrası `.tasks/` sadece arşiv manifest.

**T-144-018 — Rich sprint output (final report + metrics)**
- Agent: `doc-writer` | Skills: `documentation-writer`
- Files: `src/cli/helpers/sprint-summary-rich.ts`, `src/cli/commands/retro.ts`, tests
- Scope: `src/cli/`, `tests/cli/`
- Description: Sprint end summary 7-section rich output (ADR-020). Agent/Skill performance, task dependency map, cost breakdown, ADR compliance score.
- Kanıt: `deckent retro` → 7-section output.

#### Wave 5 — Test A baseline (2 task)

**T-144-019 — Test yazım: Memory V2 CLI (recall, remember, memory, memory_query)**
- Agent: `test-writer` | Skills: `testing-expert`
- Files: `tests/cli/recall.test.ts`, `tests/cli/remember.test.ts`, `tests/cli/memory.test.ts`, `tests/mcp/memory-query.test.ts`
- Scope: `tests/cli/`, `tests/mcp/`
- Description: 0 test olan 4 kritik dosya → her biri ≥10 test. Happy path, edge case, error path, integration with MemoryStore.
- Kanıt: vitest +40 test. Coverage ≥90% for 4 files.

**T-144-020 — Test yazım: heartbeat-daemon, mid-sprint-adapter, ci-reporter**
- Agent: `test-writer` | Skills: `testing-expert`
- Files: `tests/orchestra/heartbeat-daemon.test.ts`, `tests/orchestra/mid-sprint-adapter.test.ts`, `tests/orchestra/ci-reporter.test.ts`
- Scope: `tests/orchestra/`
- Description: 0 test olan 3 kritik orchestra dosyası → her biri ≥8 test.
- Kanıt: vitest +24 test. Coverage ≥85%.

### 3.3 Sprint 144 Sonu Gate (Karar 5-D)

Aynı 5-check chain safety gate.
PASS → Sprint 145 otomatik.
FAIL → Chain ABORT.

### 3.4 Sprint 144 Tahmini Metrikler

| Metrik | Hedef |
|--------|-------|
| Task sayısı | 20 |
| Opus task | 16 (P0/P1 kritik: god split, ADR-008, perf, ölü kod, operasyonel HIGH) |
| Sonnet task | 4 (P2: i18n temel, Türkçe locale, redact taşı, rich output) |
| Süre hard cap | 5 saat |
| Cost budget | $18 |
| Başarı kriteri | God objeler bölünmüş, ADR-008 Cycle 2 0, 29 ölü dosya silinmiş, operasyonel HIGH 6 closed |

---

## 4. Sprint 145 — "i18n 95 + Test A + Dokümantasyon + .deckent Temizlik + Observability + Feature Co-Evolve"

### 4.1 Sprint Teması
**Kalite + meta**: i18n 95 puan, test coverage A, dokümantasyon tam, .deckent temizlik politikası, Observability katmanı, feature-level brain co-evolve.

### 4.2 Task Listesi (~18 task)

#### Wave 1 — Feature Co-Evolve (Karar 4-C, 1 task)

**T-145-001 — Feature-level co-evolve (features-manifest + sync-docs)**
- Agent: `architect` | Skills: `typescript-expert`, `system-architect`
- Files: `.deckent/features-manifest.json` (canlı), `scripts/sync-docs.mjs` (yeni), `src/mcp/server.ts`, `src/cli/index.ts`, `docs/reference/mcp-tools.md` (auto-gen), `docs/reference/cli-commands.md` (auto-gen), `docs/reference/agents.md` (auto-gen), `docs/reference/skills.md` (auto-gen), tests
- Scope: `.deckent/`, `scripts/`, `src/mcp/`, `src/cli/`, `docs/reference/`, `tests/`
- Description:
  1. `features-manifest.json` canlı kaynak: MCP tools (22), CLI komutları (41+), agents (16), skills (21)
  2. Yeni tool/komut eklenince manifest update hook
  3. `sync-docs.mjs` manifest'ten `docs/reference/*` üretir (auto-gen)
  4. Sprint-finalizer + PR-merge hook tetikleyicisi
  5. Manifest schema zod validation
- Kanıt: Yeni MCP tool eklenince docs/reference/mcp-tools.md otomatik güncel.

#### Wave 2 — i18n 95 (Direktif 19, paralel, 4 task)

**T-145-002 — CLI tam i18n (35+ hardcoded string → messages.ts)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/cli/helpers/messages.ts`, `src/cli/commands/*.ts` (41+ dosya), `src/cli/helpers/*.ts`, tests
- Scope: `src/cli/`, `tests/cli/`
- Description: 35+ hardcoded İngilizce metin (output.ts, wizard.ts, doctor.ts, start.ts) messages.ts'ye taşı. TR/EN parity %100.
- Kanıt: `grep -rn "console\.log(['\"][A-Z]" src/cli/commands/` → 0 hardcoded string.

**T-145-003 — MCP tool i18n (description + schema)**
- Agent: `refactorer` | Skills: `typescript-expert`
- Files: `src/mcp/tools/*.ts`, `src/mcp/helpers/i18n.ts` (yeni), tests
- Scope: `src/mcp/`, `tests/mcp/`
- Description: 22 MCP tool description + schema error message TR/EN parity.
- Kanıt: `LANG=tr` MCP startup → TR tool descriptions.

**T-145-004 — Dashboard i18n gap (28 eksik ConfigPage anahtarı)**
- Agent: `frontend-designer` | Skills: `react-specialist`
- Files: `src/dashboard/src/i18n/tr.ts`, `src/dashboard/src/i18n/en.ts`, `src/dashboard/src/pages/Config.tsx`, tests
- Scope: `src/dashboard/`, `tests/dashboard/`
- Description: 28 eksik i18n anahtarı ConfigPage için. TR/EN parity tam.
- Kanıt: `tr.ts` ve `en.ts` key count eşit. ConfigPage test edilmiş TR/EN rendering.

**T-145-005 — Dashboard V2 uyum (memory state, ADR list, debt table)**
- Agent: `frontend-designer` | Skills: `react-specialist`, `typescript-expert`
- Files: `src/dashboard/src/pages/Memory.tsx`, `src/dashboard/src/hooks/useApi.ts`, `src/dashboard/src/components/DebtTable.tsx`, tests
- Scope: `src/dashboard/`, `tests/dashboard/`
- Description: Dashboard Memory V2 tam uyum. DB-first state. ADR list FTS5 search. Debt table DB query. useApi lazy refetch.
- Kanıt: Dashboard Memory sayfası DB entry'lerini live render.

#### Wave 3 — Test A + CI Stabilize (paralel, 3 task)

**T-145-006 — CI workflow yeşil (Sprint 141 matrix issue)**
- Agent: `ci-guardian` | Skills: `ci-testing`, `devops-engineer`
- Files: `.github/workflows/ci.yml`, tests
- Scope: `.github/workflows/`, `tests/ci/`
- Description: Sprint 141 CI orchestra 20.x fail + 22.x/18.x cancel issue. Root cause: matrix `fail-fast: false` yok. Fix + Node 22 uyumsuzluk çözüm.
- Kanıt: CI 3 matrix (18/20/22) PASS green.

**T-145-007 — Vitest pass %99.9 stabilize**
- Agent: `test-writer` | Skills: `testing-expert`
- Files: ~10-20 flaky/failing test dosyası (audit sonrası)
- Scope: `tests/`
- Description: Mevcut 12485 pass baseline stabilize. Flaky test'ler (timing-dependent, network mock) deterministik yapılır. God test'ler bölünür: init.test.ts (2270 LoC), commands.test.ts (1687 LoC).
- Kanıt: `vitest run` 5 ardışık run %100 pass.

**T-145-008 — Skill test coverage (21 built-in → 21 tested)**
- Agent: `test-writer` | Skills: `testing-expert`
- Files: `tests/skills/*.test.ts` (11 yeni)
- Scope: `tests/skills/`
- Description: 21 built-in skill → 10 test edilmiş + 11 test yazılır. Skill sandbox validation, AST check, manifest validation.
- Kanıt: `tests/skills/` 21 test file.

#### Wave 4 — Dokümantasyon (paralel, 4 task)

**T-145-009 — README.md + README-TR.md Memory V2 + MCP 22 + CLI 41+**
- Agent: `doc-writer` | Skills: `documentation-writer`
- Files: `README.md`, `README-TR.md`
- Scope: root
- Description: 11 sprint geride README → Memory V2 DB-first, better-sqlite3 dependency, 22 MCP tool, 41+ CLI komut, 16 agent, 21 skill güncel.
- Kanıt: README Sprint 145 state yansıtır.

**T-145-010 — AGENTS.md + CLAUDE.md + DECKENT.md + IDENTITY.md güncel**
- Agent: `doc-writer` | Skills: `documentation-writer`
- Files: `AGENTS.md`, `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md`, `.brain/PROJECT-IDENTITY.md`
- Scope: root, `.deckent/`, `.brain/`
- Description: 39 sprint geride AGENTS.md. Cross-validation: tüm .md dosyalarında sayı tutarlılığı (22 tool, 40 ADR, 41+ CLI, 12485+ test). brain co-evolve sprint-finalizer-hook çalıştığı için çoğu otomatik.
- Kanıt: Tüm .md dosyalarında sayılar eşleşir.

**T-145-011 — docs/architecture/memory-system.md rewrite + BLUEPRINT update**
- Agent: `doc-writer` | Skills: `documentation-writer`, `system-architect`
- Files: `docs/architecture/memory-system.md`, `DECKENT-MASTER-BLUEPRINT.md`
- Scope: `docs/`, root
- Description: Memory V2 DB-first mimarisini açıklayan dokümantasyon. DB schema, FTS5, turkishNormalize, relations, dual-layer search. BLUEPRINT Memory V2 section.
- Kanıt: Yeni docs/architecture/memory-system.md ≥300 satır.

**T-145-012 — docs/superpowers/ .npmignore ekle (Direktif 33)**
- Agent: `devops-engineer` | Skills: `devops-engineer`
- Files: `.npmignore`, `package.json` files field
- Scope: root
- Description: `docs/superpowers/` Deckent dev internal → npm package'a dahil olmamalı. `.npmignore` güncelle. Publish test: `npm pack --dry-run` → superpowers/ yok.
- Kanıt: `npm pack --dry-run` output'ta docs/superpowers/ yok.

#### Wave 5 — .deckent Temizlik + Observability + Config (Direktif 13, 21, 22, paralel, 4 task)

**T-145-013 — .deckent temizlik politikası + periyodik arşiv**
- Agent: `devops-engineer` | Skills: `devops-engineer`
- Files: `scripts/deckent-cleanup-policy.mjs` (yeni), `src/orchestra/sprint-finalizer.ts`, tests
- Scope: `scripts/`, `src/orchestra/`, `tests/`
- Description:
  - `config.json.bak*` retention: son 3 bak dosyası (eskilerini arşivle)
  - `sprint-NNN-events.jsonl` 5+ sprint öncesi → `.deckent/archive/events/` taşı
  - `sprint-NNN-seq` 3 sprint öncesi → arşiv
  - `sprint-NNN-layer3-scorecard.md` 3 sprint öncesi → arşiv
  - `.deckent/jobs/` aktif değilse son 1 gün hariç temizle
  - `.deckent/pids/` T-144-015 ile zaten çözüldü
  - `.deckent/routing/` Memory V2 uyum check
  - `.deckent/workspace/*.md` işlev doğrulaması
  - Öneri çıktısı: her 3 sprint'te bir Alperen'e "şu dosyalar arşivlenebilir" listesi
- Kanıt: Sprint 145 finalize sonrası `.deckent/` son 3 sprint canlı, önceki arşivde.

**T-145-014 — Observability katmanı (debug log + error hierarchy + ERRORS.md filter)**
- Agent: `architect` | Skills: `typescript-expert`
- Files: `src/core/debug-log.ts` (T-143-006'da yaratıldı, genişlet), `src/core/errors.ts`, `src/core/stack-detector.ts`, tests
- Scope: `src/core/`, `tests/core/`
- Description:
  - Error hierarchy unify: tüm errors `DeckentError` base'den extend. Mevcut `BrainError` → `DeckentError` migrate.
  - Structured error logging: `{timestamp, level, source, code, context, stack}` JSON format `stderr`'e.
  - ERRORS.md noise filter: `stack-detector.ts` ENOENT spam'ı stack kontrolünden önce proje stack'ini check (Cargo.toml sadece Rust projesinde).
  - `debugLog.error/warn/info/trace` 4 seviye. `DECKENT_DEBUG=1` env var.
- Kanıt: ERRORS.md noise <50 satır/sprint (önceki 400+).

**T-145-015 — Config katı yapı (Zod validation on load, Direktif 21)**
- Agent: `architect` | Skills: `typescript-expert`, `security-specialist`
- Files: `src/core/config.ts`, `src/core/config-types.ts`, `src/core/config-schema.ts` (yeni), tests
- Scope: `src/core/`, `tests/core/`
- Description:
  - Zod schema tüm config.json fields için
  - `loadConfig()` Zod validate, invalid config → throw ConfigError (boot fail)
  - project-stack.json buildTool "vite" → "tsc" düzeltilir
  - cost-config.json schema validation
  - Migration helper: eski flat config → yeni nested
- Kanıt: Invalid config ile boot fail. Valid config ile pass.

**T-145-016 — DECISIONS.md archive (Direktif 29)**
- Agent: `devops-engineer` | Skills: `git-expert`
- Files: `.brain/archive/decisions-root-pre-sprint145/DECISIONS.md`, root `.brain/DECISIONS.md` sil (T-143-009'da başlatılmıştı, kapanır)
- Scope: `.brain/`
- Description: T-143-009'da başlayan DECISIONS.md archive işinin finalizasyonu. Archive manifest, sha256 hash, referans güncellemesi (PROJECT-IDENTITY.md "See DECISIONS.md" → "See exports/decisions.md").
- Kanıt: `ls .brain/DECISIONS.md` → not found. `.brain/archive/` altında.

#### Wave 6 — Toplu Review Preparation (2 task)

**T-145-017 — Chain toplu review raporu üret**
- Agent: `architect` | Skills: `documentation-writer`, `system-architect`
- Files: `docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md` (yeni)
- Scope: `docs/audits/sprint-145/`
- Description: 3 sprint birleşik rapor:
  - Baseline vs final health scores (11 dimension)
  - 60 borç madde closure status
  - 5 karar execution trace
  - Chain safety gate pass/fail history
  - Remaining work (Sprint 146+)
  - Recommendations for Sprint 146 (Multi-provider/macOS/Windows)
- Kanıt: Rapor ≥500 satır, tüm metriklerle kanıt.

**T-145-018 — Sprint 146 önceki hazırlık**
- Agent: `architecture-planner` | Skills: `system-architect`
- Files: `.brain/sprints/sprint-146-preflight.md`
- Scope: `.brain/`
- Description: Sprint 146 tema: Multi-provider + macOS/Windows. Pre-flight checklist. Roadmap update (Sprint 146 → 147 → 148 → 149).
- Kanıt: Pre-flight doküman hazır.

### 4.3 Sprint 145 Sonu Gate + Toplu Review (Karar 5-D)

Chain safety gate + Alperen + Claude Code joint toplu review. Başarı kriterleri (1.1) karşılanıyor mu?

### 4.4 Sprint 145 Tahmini Metrikler

| Metrik | Hedef |
|--------|-------|
| Task sayısı | 18 |
| Opus task | 12 (kritik: co-evolve, CLI i18n, CI fix, vitest stabilize, doc updates, config strict, observability, review raporu) |
| Sonnet task | 6 (P2: MCP i18n, dashboard i18n, skill tests, .npmignore, cleanup policy, DECISIONS archive) |
| Süre hard cap | 4.5 saat |
| Cost budget | $15 |
| Başarı kriteri | 1.1 tablosu tüm hedefler karşılanır |

---

## 5. Risk Register

### 5.1 Sprint 143 Riskleri

| Risk | Olasılık | Etki | Mitigation | Escalation |
|------|----------|------|------------|------------|
| MCP disconnect fix regression | Orta | Yüksek | T-143-012 + T-143-017 E2E harness ile validate | Chain ABORT, fallback tmux mode |
| FTS5 fix edge case (boşluk/quote) | Düşük | Orta | T-143-006 test matrix: 15+ edge case | Sprint 144 fix task ekle |
| Backfill false positive relations | Orta | Düşük | Manuel gate (Alperen preview approve) | Yanlışlar DB'ye yazılmaz |
| Memory V2 migrasyon data loss | Düşük | Kritik | Pre-migration snapshot `.brain/memory.db.pre-143.bak` | Restore script ready |
| Core stabilite fix regresyon | Orta | Kritik | Doctor + E2E gate | Chain ABORT |

### 5.2 Sprint 144 Riskleri

| Risk | Olasılık | Etki | Mitigation | Escalation |
|------|----------|------|------------|------------|
| God split test regresyon | Yüksek | Orta | Test restoration her split task'ta zorunlu | Sprint 145 fix task |
| ADR-008 Cycle 2 refactor regresyon | Orta | Yüksek | Provider 3'lü (claude/codex/gemini) test matrix | Rollback (git revert) |
| Ölü kod silme referans kaçırma | Düşük | Orta | grep -rn pre-silme doğrulama | Git revert specific file |
| Auditor async regresyon | Düşük | Yüksek | Benchmark suite, canary run | Flag ile sync fallback |
| Docker HB deploy regresyon | Düşük | Kritik | 10-e2e test suite | Subprocess backend fallback |

### 5.3 Sprint 145 Riskleri

| Risk | Olasılık | Etki | Mitigation | Escalation |
|------|----------|------|------------|------------|
| i18n tam kapsam TR çevirileri eksik | Orta | Düşük | EN fallback default, TR incremental | Sprint 146 polish |
| CI matrix Node 22 uncovered issue | Orta | Orta | Canary PR önce | Revert CI config |
| Feature co-evolve auto-gen conflict | Orta | Orta | CUSTOM section korunur, AUTO section regen | Manual merge |
| .deckent cleanup policy data loss | Düşük | Yüksek | Archive önce, sil sonra | Restore from archive |
| Config Zod migration eski config reject | Orta | Kritik | Migration helper, backward compat | Fallback permissive mode |

---

## 6. Rollback Plan

### 6.1 Sprint Level Rollback

Her sprint sonu gate FAIL olursa:
1. Notification dispatcher → Alperen chat bar push
2. Chain ABORT — bir sonraki sprint tetiklenmez
3. Alperen opsiyonlar:
   - **Partial accept:** PASS olan task'lar tutulur, FAIL olanlar revert
   - **Full revert:** `git reset --hard <sprint-başı-commit>` → state restore
   - **Manuel fix:** Sorunu elle çöz, chain resume

### 6.2 Task Level Rollback

NO_GO task'lar:
1. Worker `.result` → NO_GO + notes
2. Brain FIX phase → 1 retry max
3. FIX de fail → task final NO_GO, borç olarak retro'ya

### 6.3 Data Rollback (Memory V2)

- Pre-sprint snapshot: `.brain/memory.db.pre-sprint-NNN.bak` (her sprint başı)
- Restore: `cp memory.db.pre-sprint-NNN.bak memory.db` (<1dk)
- FTS5 rebuild: `deckent memory rebuild`

### 6.4 Provider-Level Rollback

- Claude fail → codex fallback (config `fallback_provider`)
- Codex fail → gemini fallback
- Hepsi fail → chain ABORT

---

## 7. Toplu Review (Sprint 145 sonu)

Alperen + Claude Code joint audit. Çıktı `docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md` (T-145-017).

### 7.1 Review Soruları

1. 11 sağlık boyutu 1.1 hedefini karşılıyor mu?
2. 60 borç maddesinin kaçı closed?
3. Brain health 72 → 95+ gerçekleşti mi?
4. Memory V2 100/100 gerçek mi?
5. Chain safety gate hiç FAIL oldu mu? Neden?
6. MVP yasak ihlali oldu mu (worker'da "acaba" pattern'ı)?
7. Core bozulmadı mı (brain finalize/cleanup/heartbeat)?
8. Opus-only kuralı P0/P1'de ihlal edildi mi?

### 7.2 Sprint 146 Karar

Toplu review + brainstorming → Sprint 146 tema kararı. Tahmini roadmap:
- Sprint 146: Multi-provider (Codex + Gemini) + macOS/Windows dogfood
- Sprint 147: 100-task long-running live test + performance final
- Sprint 148: Documentation Finalization Sprint (388 .md tek tek review)
- Sprint 149: Public Beta GA

---

## 8. Onay Gate

Bu spec Alperen tarafından review edilmeli. Onay sonrası:
1. Spec git commit edilir
2. `superpowers:writing-plans` skill ile implementation plan + 3 sprint DIRECTIVES.md içerikleri yazılır
3. Implementation plan da Alperen onayından geçer
4. Sprint 143 DIRECTIVES canlı olur, chain başlar

**Alperen onayı:**
- ✅ Spec onaylı, plan yazımına geç
- ✏️ Spec'te değişiklik iste
- ❌ Spec reddet, brainstorming'e dön

---

## 9. Referanslar

### 9.1 Kaynak Dokümanlar
- `/home/alperen/deckent-dev/.deckent/sprint-god-analysis/FINAL-REPORT-TR.md` — 233 bulgu, 8 Alperen karar noktası
- `/home/alperen/deckent-dev/.deckent/sprint-god-analysis/brain/brain-state.md` — Memory V2 canlı DB doğrulama
- `/home/alperen/deckent-dev/.deckent/sprint-god-analysis/meta/*.md` — 9 cross-cutting meta rapor
- `/home/alperen/deckent-dev/docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` — Sprint 132 baseline (evrimleşme başlangıcı)

### 9.2 Memory Referansları
- `project_sprint140_selfanalysis.md`
- `project_sprint141_preflight.md` (SUPERSEDED, 18-task içeriği bu spec'e entegre)
- `project_sprint_numbering_reorg.md` (roadmap context)
- `project_memory_v2_db_first.md` (Memory V2 spec)
- `project_sprint139_notification_dispatcher.md` (event stream + notification)
- `project_doc_finalization_sprint.md` (Sprint 148 preview)
- `project_vision_product_not_service.md` (Direktif 33 publishing rule)
- `feedback_sprint140_cost_explosion_disaster.md` (cost gate motivation)
- `feedback_deckent_kill_approval_required.md` (T-143-016 panic guard motivation)
- `feedback_worker_honest_assessment.md` (MVP yasak kuralı motivation)
- `feedback_deckent_native_execution_rule.md` (chain yürütme modu)

### 9.3 ADR Referansları
- ADR-005 (deprecated) — Sync I/O (Sprint 144 T-144-005 async migration)
- ADR-006 — spawnSync security (Sprint 143 T-143-014 runtime wire)
- ADR-008 — Brain merkezi import (Sprint 144 T-144-004 Cycle 2 fix)
- ADR-010 — Minimal runtime dependencies (Sprint 143 T-143-018 amendment)
- ADR-022 — CLI/MCP parity (Sprint 143+144+145 cross-cutting)
- ADR-033 — Product not service (Direktif 33 publishing rule)
- ADR-035 — Verification Protocol (Sprint 143 T-143-014 Layer 4 wire)
- ADR-036 — ADR Governance (brain-self-audit)
- ADR-037 — Authority Matrix (T-143-016 panic guard, T-143-014 RBAC runtime)
- ADR-038 — Dead Code Disposition (Sprint 144 T-144-006+007 audit protocol)
- ADR-039 — Self-Modifying Task Detection (brain-state Sprint 140 forensic)

### 9.4 Brainstorming Kararları (bu spec'in temeli)
1. Soru 1: Operasyonel 18-task dağılımı — **B** (3 sprint'e dağıt)
2. Soru 2: FTS5 multi-word fix — **A** (query builder fix)
3. Soru 3: Relations — **C** (hibrit: backfill + write-time)
4. Soru 4: Brain co-evolve — **D** (A+B Sprint 143, C Sprint 145)
5. Soru 5: Chain safety — **D** (happy B, fail C fallback)

Alperen 8 karar noktası (FINAL-REPORT § 19):
1. Ölü kod — B+doğrulama hibrit
2. Memory V2 — A (tam migrasyon hemen)
3. ADR-008 — A (interface çıkar)
4. God split — A (4'ünü birden)
5. Güvenlik — A (tüm P0+P1 şimdi)
6. ADR-010 — C (amendment)
7. i18n — Direktif 19 override (95 puan tam)
8. Test — A (kritik yol + geniş)
