# DIRECTIVES — Sprint 189: God-Level Push Day 1 — OSS GA Foundations + Provider Repair (2 dalga, 16 task)

## Goal: Sprint 188 self-analysis bulgularının P0 alt-kümesi + WrongStack OSS GA blokerleri (WS-Z1/Z3) + provider CLI repair (F-1/F-2) + API surface test başlangıcı. Bu sprint **kod-değiştirici** (ADR-053 code-development task tipi) — Sprint 188 analysis-only sürecinin somut fix sürümü. Master plan referansı: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` (Faz 1, Sprint 189 — Foundations Fix). 1 Haziran 2026 beta launch hedefi için 8 günlük god-level push'un 1. günü.

Tüm task'lar için ortak kurallar:
- Worker yalnızca `scope.filesWrite` içine yazar; scope dışına dokunmak yasak (ADR-037 advisory + audit-trail).
- Her task **test ile geçer** — vitest descriptors `tests/` altında, minimum 3 test (mutlu/edge/hata). Audit task'ları test gerektirmez (tipini description belirtir).
- Her bulgu `dosya:satır` kanıtıyla belgelenir (`grep -n` / dosya kontrolü).
- Honest self-assessment — ADR ihlali tespit edilirse worker `NO_GO` + ADR amendment proposal yazar (ADR-036).
- `.brain/memory.db` dokunulmaz; CLI/MCP ile çağrılır (write yetkisi `core/memory-*.ts` yolundan).
- Build sonrası `tsc --noEmit` temiz dönmeli; vitest tam suite'ten **ek regresyon getirmemeli** (mevcut 36 fail baseline — yeni fail eklemek NO_GO).
- Worker sonunda kanıt komutu çıktısını `.result` notes alanına yapıştırır.

---

## DALGA 1 — Foundations P0 (8 task, kod-değiştirici)

---

## Task 1: 189-001 — `core/notify.ts` ADR-008 ihlali fix (dependency inversion)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/notify.ts, src/core/notify-registry.ts, src/orchestra/event-bus.js
- Scope: src/core/, src/orchestra/, tests/core/

### Description
Sprint 188 self-analysis (3 worker bağımsız buldu): `src/core/notify.ts:17` `import { eventBus } from '../orchestra/event-bus.js'` — ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) ihlali. core/ modülleri orchestra/'ya import edemez (yön: orchestra → core, core → ∅).

**Fix yöntemi (dependency inversion):**
1. `src/core/notify-registry.ts` oluştur — `setNotificationDispatcher(fn)` + `getNotificationDispatcher()` API.
2. `src/core/notify.ts:17` eventBus import'unu kaldır; yerine `getNotificationDispatcher()` kullan (init-time set edilir, lazy).
3. `src/orchestra/event-bus.ts` (veya bootstrap yerinde) import-time `setNotificationDispatcher(eventBus.emit.bind(eventBus))` çağrısı ekle.
4. authority-enforcer.ts:496-518 ihlal tespit kodu artık 0 ihlal raporlamalı.
5. Test: notify.ts → orchestra import etmediğini doğrula; dispatcher injection wire'ı test edilsin; event payload yapısı korunmuş olsun.

**Kanıt:** `grep -n "from '../orchestra" src/core/notify.ts` → 0 sonuç + `npx vitest run tests/core/notify.test.ts tests/orchestra/event-bus.test.ts` → temiz.
**Test:** 3+ test — (a) dispatcher set sonrası notify çalışır, (b) dispatcher set olmadan graceful fallback, (c) payload shape korunur.

---

## Task 2: 189-002 — Coverage threshold kapısı + CI gate (WrongStack WS-Z1)
- Model: opus
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: vitest.config.ts, .github/workflows/ci.yml, package.json
- Scope: ., .github/

### Description
WrongStack analizinin OSS GA bloker maddesi WS-Z1: `vitest.config.ts:8` `coverage:{}` blok var ama `thresholds` alanı yok; CI `.github/workflows/ci.yml:188` coverage job çalışıyor ama build kırmıyor (rapor only).

**Yöntem (kalibreli floor):**
1. `npm run test:coverage` çalıştır → mevcut gerçek coverage'ı oku (provider v8). Toplamı + her dimension (lines/functions/branches/statements) topla.
2. `vitest.config.ts` `coverage` bloğuna `thresholds: { lines: X, functions: Y, branches: Z, statements: W }` ekle — her değer **mevcut değerin %5 altına** kalibre edilsin (örn. mevcut %62 ise floor %57).
3. CI'da `npm run test:coverage` job'u non-zero exit ile build'i kırması doğrulanmalı (vitest threshold violation = exit 1).
4. `docs/CHANGELOG.md` Unreleased'a "feat(ci): coverage threshold gate aktif (floor X% lines, Y% functions, ...)" ekle.
5. README ve CONTRIBUTING'e (varsa) "coverage threshold ratchet" notu — her sprint floor %1 yukarı çıkarılır.

**Kanıt:** `cat vitest.config.ts | grep -A 5 thresholds` → 4 floor değeri görünür + CI workflow file'da non-zero exit beklentisi belge'de.
**Test:** Audit task — yeni test yok; mevcut testler regresyona uğramamalı.

---

## Task 3: 189-003 — MCP_INSTRUCTIONS 27→31 + 4 eksik tool + lint regression-guard
- Model: sonnet
- Effort: normal
- Skills: anthropic-sdk, documentation-writer
- Files: src/mcp/server.ts, scripts/lint-mcp-instructions.mjs, .github/workflows/ci.yml
- Scope: src/mcp/, scripts/, .github/, tests/mcp/

### Description
Sprint 188 P0: `src/mcp/server.ts:33` `DECKENT_MCP_INSTRUCTIONS` dizgisi "## Tools (27)" diyor ve `deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover` 4 tool listede yok. MCP istemcileri (Claude Code, Cursor, IDE) sistem kapasitesinin %88'ini görüyor.

**Yöntem:**
1. `src/mcp/tools/index.ts`'i oku → gerçek register edilen tool sayısı + adlarını çıkar (mevcut 31; doğrula `registerXxxTool` çağrıları).
2. `src/mcp/server.ts:33` `DECKENT_MCP_INSTRUCTIONS` dizgisini:
   - "## Tools (27)" → "## Tools (31)"
   - Eksik 4 tool'u kısa açıklama ile listeye ekle (mevcut formatla aynı).
3. `scripts/lint-mcp-instructions.mjs` oluştur — `DECKENT_MCP_INSTRUCTIONS` içindeki tool sayısı + adları ↔ `tools/index.ts` register çağrıları otomatik karşılaştırır. Drift varsa non-zero exit.
4. `.github/workflows/ci.yml` lint job'una bu script'i ekle.
5. `package.json` `"lint:mcp": "node scripts/lint-mcp-instructions.mjs"` script entry.

**Kanıt:** `node scripts/lint-mcp-instructions.mjs` → "OK: 31 tools, 31 in instructions" + `grep "Tools (31)" src/mcp/server.ts` → match.
**Test:** 3+ test — (a) script lint başarılı dönüyor, (b) drift senaryosu non-zero, (c) yanlış tool adı non-zero.

---

## Task 4: 189-004 — `docs/reference/api.md` Memory V2 stale referans temizliği
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/reference/api.md, tests/docs/api-md-no-stale-refs.test.ts
- Scope: docs/reference/, tests/docs/

### Description
Sprint 188 P0: `docs/reference/api.md` 8 bağımsız satırda `MEMORY_FILE`, `DECISIONS_FILE`, `DEBT_FILE` .md constant'ları + `.brain/MEMORY.md` / `.brain/DEBT.md` referansları — Memory V2 DB-first geçişinden (Sprint 165-166 + sprint 187 B6-B14) sonra obsolete. OSS kullanıcı/AI dokümanı izlediğinde silinmiş legacy `.md` dosyalarına yönlendiriliyor.

**Yöntem:**
1. `grep -nE "MEMORY_FILE|DECISIONS_FILE|DEBT_FILE|\.brain/MEMORY\.md|\.brain/DEBT\.md" docs/reference/api.md` ile her satırı tespit et.
2. Her satır için bağlamı oku → Memory V2 API'sine güncelle:
   - `MEMORY_FILE` → `memory.db (SQLite, type='memory' entries)` veya `searchMemory({ type: ['memory'] })`
   - `DECISIONS_FILE` → `memory.db type='adr'` veya `store.getByType('adr')`
   - `DEBT_FILE` → `memory.db type='debt'` veya `searchMemory({ type: ['debt'] })`
   - `.brain/MEMORY.md` / `.brain/DEBT.md` → `.brain/exports/memory.md` veya `.brain/exports/debt.md` (auto-generated read-only views)
3. Memory V2 search API örnekleri ekle (FTS5 dual-layer).
4. tests/docs/ altına api-md doğruluk testi — stale ref yokluğu doğrula.

**Kanıt:** `grep -cE "MEMORY_FILE|DECISIONS_FILE|DEBT_FILE|\.brain/MEMORY\.md|\.brain/DEBT\.md" docs/reference/api.md` → 0.
**Test:** 3+ test — (a) stale ref tarama 0, (b) Memory V2 API örneklerinin syntax doğruluğu, (c) link target geçerli.

---

## Task 5: 189-005 — `docs/reference/cli.md` + `cli-commands.md` PROJECT-IDENTITY.md temizliği
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: docs/reference/cli.md, docs/reference/cli-commands.md, tests/docs/no-stale-identity-refs.test.ts
- Scope: docs/reference/, tests/docs/

### Description
Sprint 188 P0: `docs/reference/cli.md:220,981` + `docs/reference/cli-commands.md:196` `PROJECT-IDENTITY.md` dosyasına atıf yapıyor. Bu dosya Sprint 166 ADR-046'da kaldırıldı (`.deckent/workspace/IDENTITY.md` managed-docs ile değiştirildi).

**Yöntem:**
1. `grep -n "PROJECT-IDENTITY" docs/reference/cli.md docs/reference/cli-commands.md` ile her satırı tespit.
2. `deckent finalize` açıklamasında "MEMORY.md, RETRO.md, PROJECT-IDENTITY.md güncellenir" → "memory.db güncellenir + `.deckent/workspace/IDENTITY.md` (managed-docs) sync edilir" yazımına dönüştür.
3. Yan etkili "MEMORY.md, RETRO.md" cümlelerini de Memory V2'ye uygunla (`memory.db` + `.brain/exports/memory.md` auto-generated views).

**Kanıt:** `grep -c "PROJECT-IDENTITY" docs/reference/cli.md docs/reference/cli-commands.md` → 0:0.
**Test:** 3+ test — (a) PROJECT-IDENTITY ref 0, (b) IDENTITY.md ref doğru path, (c) finalize açıklaması memory.db içerir.

---

## Task 6: 189-006 — Dashboard `StatusPage` 404 fix (App.tsx wire)
- Model: sonnet
- Effort: low
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/App.tsx, src/dashboard/src/routes.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
Sprint 188 P0: `src/dashboard/src/pages/StatusPage.tsx` işlevsel (3 API çağrısı içeriyor) ama `App.tsx`'de import/route yok — dashboard 7 sayfa iddiasının 1'i 404.

**Yöntem:**
1. `src/dashboard/src/App.tsx` aç → mevcut route yapısını anla (muhtemel `react-router-dom` + Routes/Route).
2. `<Route path="/status" element={<StatusPage />} />` ekle; gerekli import.
3. `src/dashboard/src/routes.tsx` ile senkronize et veya `App.tsx`'in tek source-of-truth kabul edilirse routes.tsx'i sil/refactor (api-dashboard-consistency.md follow-up).
4. Navigation menüsünde (Sidebar veya benzeri) Status sayfası linkini ekle.
5. Dashboard test — StatusPage route mevcut ve render ediliyor.

**Kanıt:** `grep -n "StatusPage\|/status" src/dashboard/src/App.tsx` → import + Route entries görünür + `npm run test:dashboard` temiz.
**Test:** 3+ dashboard test — (a) /status route mevcut, (b) StatusPage render ediliyor mock API ile, (c) navigation link aktif state.

---

## Task 7: 189-007 — Provider CLI detection RC + `deckent doctor --providers`
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/providers/gemini.ts, src/providers/codex.ts, src/providers/claude.ts, src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, src/mcp/tools/doctor.ts
- Scope: src/providers/, src/cli/commands/, src/mcp/tools/, tests/providers/, tests/cli/

### Description
Alperen 2026-05-23 raporu: "Gemini + Codex CLI kurdum ama görmüyor". Ön-doğrulama (2026-05-23 01:42): `which gemini` + `which codex` + `which claude` üçü de PATH'te VAR — `/home/alperen/.nvm/versions/node/v24.15.0/bin/`. Ancak `GeminiAdapter().isAvailable()` ve `CodexAdapter().isAvailable()` her ikisi `false` döndü. RC binary-detection değil — auth/version/wrapper check fail.

**Yöntem:**
1. `src/providers/gemini.ts:271 isAvailable()` + `codex.ts:176 isAvailable()` kodlarını oku → fail eden tam adım belirle (binary spawn? auth check? response parsing?).
2. Adapter logic'i debug — `--verbose` mode + log ekle (deckent doctor için kullanılır).
3. Düzeltme stratejisi:
   - PATH binary varsa + spawn başarılıysa **partial available** dönsün (auth eksik ama runtime var)
   - Auth eksikse açık mesaj — "Codex CLI mevcut, OPENAI_API_KEY veya `codex login` gerekli"
   - Versiyon kontrolü minor mismatch'te uyarı, fail değil
4. `src/cli/commands/doctor.ts` + `doctor-checks.ts` — yeni `--providers` opsiyonu eklenmeli: her provider için (binary status, version, auth status, model list) tablo çıktısı.
5. `src/mcp/tools/doctor.ts` paralel parite (deckent_doctor MCP'de aynı bilgiyi sun).

**Kanıt:**
- `deckent doctor --providers` → 3 provider için (Claude/Codex/Gemini) detaylı tablo
- `node -e "import('./dist/providers/gemini.js').then(m => new m.GeminiAdapter().isAvailable()).then(console.log)"` → mantıklı `true`/`false` + neden
**Test:** 3+ test per provider (9+) — (a) binary PATH'te + auth yok → partial, (b) binary yok → false, (c) tam mevcut → true.

---

## Task 8: 189-008 — `deckent_start` MCP cost-gate ekleme (Sprint 140 $42 aşımı tekrarı önleme)
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/mcp/tools/start.ts, src/cli/commands/start.ts, src/core/cost-gate.ts
- Scope: src/mcp/, src/cli/, src/core/, tests/mcp/, tests/cli/

### Description
Sprint 188 cli-mcp-parity P0: `mcp/tools/start.ts:38-50` cost-gate yok; CLI `cli/commands/start.ts:335-384` pre-spawn budget check var. Sprint 140 $42 aşımı MCP-side hâlâ mümkün. ADR-022-v2 (CLI/MCP Feature Parity) gereği eşitlenmeli.

**Yöntem:**
1. CLI `start.ts:335-384` cost gate logic'i ortak helper'a çıkar (`src/core/cost-gate.ts` — yeni dosya).
2. MCP `tools/start.ts` aynı helper'ı çağırır — config'ten estimated cost, budget threshold, override flag (`force`/`acknowledgeCost`) oku.
3. Tahmin > budget olduğunda MCP tool result `{ error: 'COST_GATE_EXCEEDED', estimated, budget, override }` yapısal hata döndür.
4. `autoApprove`/`acknowledgeCost` MCP inputSchema'sına eklenmeli — kullanıcı bilinçli onay verebilsin (Task 9 ile paralel ama bu task'ta sadece cost-gate kısmı).
5. MCP server.ts DECKENT_MCP_INSTRUCTIONS'da `deckent_start` açıklamasına "cost gate aktif" notu (Task 3 ile koordine).

**Kanıt:** `grep -n "COST_GATE\|costEstimate\|budget" src/mcp/tools/start.ts` → match + CLI ile aynı helper kullanımı (`grep -l "from.*cost-gate" src/mcp/tools/`).
**Test:** 3+ test — (a) budget altı → start çalışır, (b) budget üstü + override yok → COST_GATE_EXCEEDED, (c) budget üstü + override true → start.

---

## DALGA 2 — Parity + Security + Test Sağlığı (8 task)

---

## Task 9: 189-009 — `deckent_kill` MCP `force`/`userExplicit` + `autoApprove` parite
- Model: opus
- Effort: normal
- Skills: anthropic-sdk, typescript-expert
- Files: src/mcp/tools/kill.ts, src/mcp/tools/start.ts
- Scope: src/mcp/, tests/mcp/

### Description
Sprint 188 cli-mcp-parity P1: `mcp/tools/kill.ts:86-89` CLI'ın `--force` / `--user-explicit` panic-guard bypass'ı yok; `mcp/tools/start.ts:140` `autoApprove` hardcoded `true` (CLI default `false`).

**Yöntem:**
1. `kill.ts` inputSchema'ya `force: z.boolean().optional()` + `userExplicit: z.boolean().optional()` ekle.
2. Handler içinde panic-guard bypass logic'i CLI ile paralel (cli/commands/kill.ts:303-307 referans).
3. `start.ts:140` `autoApprove` default'u `false` yap; CLI ile eşitle. Eski davranışı isteyen kullanıcı için `autoApprove: true` opsiyonel param olarak kalmalı.
4. `feedback_sprint_kill_always_ask_user` kuralı korunur — kill için **Alperen onayı** her zaman default. `force` + `userExplicit` her ikisi true olsa bile yine warn ile loglanır.

**Kanıt:** `grep -n "force\|userExplicit\|autoApprove" src/mcp/tools/kill.ts src/mcp/tools/start.ts` → schema ve handler match.
**Test:** 3+ test — (a) kill no-force panic-guard'da bloklanır, (b) force+userExplicit ile bypass, (c) start autoApprove default false.

---

## Task 10: 189-010 — SECURITY.md threat model + ADR-037 advisory notu (WrongStack WS-Z3)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer, security-specialist
- Files: SECURITY.md, README.md, docs/security/threat-model.md
- Scope: ., docs/security/, tests/docs/

### Description
WrongStack analizi WS-Z3 OSS GA bloker: `SECURITY.md` "Supported Versions" tablosu `0.1.x — Yes` diyor (proje `1.0.0-beta.1`); tehdit modeli yok. ADR-037 V1.0 advisory/soft (scope ihlali bloke etmiyor, warn/emit eder); README "strict role boundaries" yanıltıcı.

**Yöntem:**
1. `SECURITY.md` "Supported Versions" tablosu `1.0.0-beta.x — Yes` + `< 1.0` legacy notu.
2. **Tehdit Modeli** bölümü ekle — `docs/security/threat-model.md` ayrı dosya (daha detaylı) + SECURITY.md kısa özet:
   - Saldırı yüzeyi: worker code execution (sandbox), provider API key sızıntısı, multi-project boundary, MCP server stdio
   - Mevcut savunmalar: ADR-014 `.deck` secret, ADR-034 multi-project isolation, ADR-037 RBAC, `spawn-safety.ts` whitelist
   - **Dürüstçe belge:** ADR-037 V1.0 advisory/soft (runtime scope warn-but-don't-block, audit-trail kayıt); V2 hard-flip post-GA planlı.
3. README "strict role boundaries" → "**advisory** role boundaries with audit trail (hard enforcement V2 post-GA)" güncelle.
4. Vulnerability disclosure prosedürü netleştir — `security@<domain>` veya GitHub security advisory.

**Kanıt:** `grep -n "1.0.0-beta" SECURITY.md` → match + `grep -n "Threat Model\|Tehdit" SECURITY.md docs/security/threat-model.md` → match + README'de ADR-037 advisory notu.
**Test:** 3+ test — (a) SECURITY.md version current, (b) threat-model.md doc structure (≥6 başlık), (c) README "strict" → "advisory" güncellenmiş.

---

## Task 11: 189-011 — API endpoint envanteri + E2E HTTP test suite başlangıcı
- Model: opus
- Effort: high
- Skills: api-builder, testing-expert
- Files: src/api/server.ts, tests/api/server.test.ts, tests/api/endpoints.test.ts, docs/reference/api-endpoints.md
- Scope: tests/api/, docs/reference/, src/api/

### Description
Alperen 2026-05-23: "API tarafını test etmedik. onu test etmek istiyorum". Sprint 188 api-dashboard-consistency.md: `src/api/` 5 doğrudan + 10 terminal = 15 modül; endpoint envanteri yok, E2E HTTP test'i yok.

**Yöntem:**
1. `src/api/server.ts` ve `src/api/terminal/*` modüllerini oku → tüm HTTP endpoint'leri (path + method + auth + handler) listele.
2. `docs/reference/api-endpoints.md` envanter dosyası yaz — tablo: METHOD | PATH | AUTH | DESCRIPTION | DASHBOARD-USED.
3. `tests/api/endpoints.test.ts` E2E test suite başlangıcı — her endpoint için happy path:
   - Test server boot helper (vitest beforeAll)
   - undici veya supertest ile fetch
   - Beklenen status + response shape doğrula
4. SSE endpoint test (varsa `/api/events`) — event stream consumer.
5. Rate limiting + auth middleware test'i temel hatları (G-4/G-5 için altyapı).

**Kanıt:** `wc -l docs/reference/api-endpoints.md` → ≥40 satır + `npx vitest run tests/api/endpoints.test.ts` → en az 5 endpoint için happy path geçer.
**Test:** 5+ test (endpoint başına 1 happy path) — envanter task'ı + E2E altyapı.

---

## Task 12: 189-012 — `IDENTITY.md` MCP 27→31 sync + AUTOGEN drift fix
- Model: sonnet
- Effort: low
- Skills: documentation-writer, typescript-expert
- Files: .deckent/workspace/IDENTITY.md, src/core/identity-generator.ts
- Scope: .deckent/, src/core/, tests/core/

### Description
Sprint 188 P0: `.deckent/workspace/IDENTITY.md:30` "MCP Tools: 27" (yanlış); satır 16 AUTOGEN bloğu "31 tools" (doğru) — **aynı dosyada çelişki**. ADR-046 Brain Self-Update Hook AUTOGEN bloğu güncelliyor ama satır 30 "Project Status" tablosu manuel ve drift'te.

**Yöntem:**
1. `IDENTITY.md:30` "MCP Tools: 27" → "31" düzelt.
2. `src/core/identity-generator.ts` Brain Self-Update Hook (sprint-finalizer integration) → Project Status tablosunun da AUTOGEN bloğunda olduğunu doğrula. Drift varsa AUTOGEN kapsamını genişlet (Project Status table = managed-docs).
3. Drift regression-guard: `scripts/lint-identity-md.mjs` veya mevcut managed-docs validator'a Project Status table'ı dahil et.
4. Sprint 188 ile aynı paterni kontrol — başka AUTOGEN drift olabilir mi (CLI Commands 55+ vs 46 örneği).

**Kanıt:** `grep -n "MCP Tools" .deckent/workspace/IDENTITY.md` → "31" + AUTOGEN block'unda olmalı.
**Test:** 3+ test — (a) IDENTITY.md MCP count 31, (b) AUTOGEN block kapsamı Project Status'u içerir, (c) drift test (manuel düzenleme regenerate'le ezilir).

---

## Task 13: 189-013 — `.claude/rules/auditor.md` PATTERNS.md → memory.db rule güncelleme
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Files: .claude/rules/auditor.md, .claude/rules/brain.md, .claude/rules/worker-default.md
- Scope: .claude/rules/, tests/docs/

### Description
Sprint 188 agents-monitor-health.md: `.claude/rules/auditor.md:12` "Append new patterns to PATTERNS.md (never overwrite)" — legacy paradigma. Sprint 187 B7 fix sonrası `monitor/auditor.ts:1068-1071` artık `memory.db type='pattern'` entries upsert ediyor; rule metni güncellenmedi.

**Yöntem:**
1. `auditor.md:12` "PATTERNS.md append" → "memory.db `pattern` entries upsert via MemoryStore" güncelle.
2. brain.md ve worker-default.md'de benzer legacy `.md` paradigma referansı varsa düzelt.
3. Auditor rule "scan every 30 seconds" doğru mu — `monitor/auditor.ts` config oku.
4. Rule dosyalarındaki ADR list (`Active ADR Constraints`) AUTOGEN değil — managed-docs olmalı mı karar; bu sprint'te sadece doc text fix.

**Kanıt:** `grep -n "PATTERNS.md" .claude/rules/*.md` → 0 sonuç + `grep -n "memory.db" .claude/rules/auditor.md` → match.
**Test:** 3+ test — (a) PATTERNS.md ref 0, (b) memory.db pattern ref match, (c) other rule .md drift yok.

---

## Task 14: 189-014 — `directives-stress-simulator.mjs` koruma + `validate-publish` duplicate temizlik
- Model: sonnet
- Effort: normal
- Skills: devops-engineer
- Files: scripts/directives-stress-simulator.mjs, scripts/validate-publish.ts, scripts/validate-publish.mjs, package.json
- Scope: scripts/, tests/scripts/

### Description
Sprint 188 scripts-build-config.md:
1. `scripts/directives-stress-simulator.mjs` DIRECTIVES.md'yi koruma-sız üzerine yazar — kullanıcı yanlışlıkla çalıştırırsa veri kaybı.
2. `scripts/validate-publish.ts` (Sprint 149, eski) ↔ `scripts/validate-publish.mjs` (Sprint 180, yeni, aktif) duplicate; `.ts` testi inaktif kodu test ediyor.

**Yöntem (1 - stress-simulator koruma):**
- Script başında onay gate: `--force` veya `DECKENT_STRESS_SIMULATE=1` env yoksa stdout uyarı + exit 1.
- Backup mekanizması: çalıştırma öncesi DIRECTIVES.md'yi `.tmp/directives-backup-$(date).md`'ye kopyala.
- Script üst kısma 5 satır UYARI yorumu.

**Yöntem (2 - validate-publish duplicate):**
- `validate-publish.ts` Sprint 149'dan beri obsolete. Karar: ya promote-rename (yeni .mjs ile değiştir) ya da arşivle (`scripts/archive/validate-publish.ts.bak`).
- package.json script entry'sini `.mjs`'e bağla; `.ts` referansı varsa kaldır.
- `tests/scripts/validate-publish.test.ts` `.mjs`'i test eder şekilde güncelle.

**Kanıt:**
- `node scripts/directives-stress-simulator.mjs` (env'siz) → uyarı + exit 1
- `ls scripts/validate-publish*` → tek aktif dosya + opsiyonel `.bak`
**Test:** 3+ test — (a) stress sim force'suz fail, (b) force ile backup yazılır, (c) validate-publish tek dosya.

---

## Task 15: 189-015 — Test fail 36 kategorize + Sprint 190 fix plan (audit)
- Model: opus
- Effort: high
- Skills: testing-expert, ci-testing
- Files: docs/audits/sprint-189/test-fail-categorize.md
- Scope: docs/audits/

### Description
Sprint 188 adr-test-health.md "43 fail" iddiası vardı; 2026-05-23 doğrulama: gerçek **36 fail / 16695 passed / 47 skipped (16778 toplam)**. Sprint 188 audit-only oldu, regresyon mu baseline drift mi netleşmedi.

Bu task **audit task** (ADR-053 audit type) — kod değiştirmez, sadece fail'leri kategorize edip Sprint 190 fix plan'ını yazar.

**Yöntem:**
1. `npm test 2>&1 | tee /tmp/sprint-189-full-test.log` çalıştır → tam fail listesini al.
2. Her fail için dosya:satır + test adı + error mesajı çıkar.
3. Kategorilere ayır (Sprint 188 raporu kategorileri + yeni keşifler):
   - **CI workflow** (release.test.ts gibi): release.yml + npm publish + provenance eksikliği
   - **Docs config**: tests/docs/, tests/config/ — managed-docs hash/structure
   - **Nervous**: tests/nervous/ — 12 detector + integration (runtime context gerekli)
   - **Docker E2E**: tests/docker/, tests/e2e/ — Docker daemon + multi-provider gereksinim
   - **Rules refactor**: tests/agents/worker-verify*, tests/scripts/ — DORMANT kod
4. Her kategori için: kaç fail, hangi modüllerde, fix efforu (low/normal/high), Sprint 190 task adayı.
5. Rapor `docs/audits/sprint-189/test-fail-categorize.md` (50+ satır, kanıtlı kategori tablosu, Sprint 190 task önerileri).

**Kanıt:** `wc -l docs/audits/sprint-189/test-fail-categorize.md` → ≥50 + `grep -c "^## " docs/audits/sprint-189/test-fail-categorize.md` → ≥6 kategori.
**Test:** Audit task — test yok.

---

## Task 16: 189-016 — CHANGELOG sprint-reporter otomatik update wire (WrongStack WS-Z2 follow-up)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, src/orchestra/sprint-finalizer.ts, docs/CHANGELOG.md
- Scope: src/orchestra/, tests/orchestra/

### Description
WrongStack WS-Z2 backfill: `docs/CHANGELOG.md` zaten sprint188'e kadar güncel (ön-doğrulama 2026-05-23). Yani backfill (A-2) obsolete — ancak **otomatik update mekanizması var mı doğrula + güçlendir**.

**Yöntem:**
1. `src/orchestra/sprint-reporter.ts` veya `sprint-finalizer.ts`'te CHANGELOG güncelleme kodunu bul; **yoksa ekle**.
2. Sprint sonu hook (`runPostFinalizeHooks`) → CHANGELOG.md "Unreleased" veya "[1.0.0-beta.1-sprint{N}]" entry oluşturur:
   - Added: yeni feature'lar (DONE task'lar)
   - Changed: refactor / improvement task'lar
   - Fixed: bug fix task'lar
3. Worker `.result` notes alanını parse et — `Added:` / `Changed:` / `Fixed:` prefix'li satırları topla.
4. Mevcut sprint183-188 entry'leri doğru formatta mı kontrol et; format violation varsa ADR-009 stil kuralı + amendment.
5. Test: dummy sprint çalıştırılınca CHANGELOG.md güncelleniyor.

**Kanıt:** `grep -n "CHANGELOG" src/orchestra/sprint-reporter.ts src/orchestra/sprint-finalizer.ts` → match (eğer yoksa task fix bunu ekledi) + `head -10 docs/CHANGELOG.md` → yeni entry görünür.
**Test:** 3+ test — (a) sprint end → CHANGELOG append, (b) Added/Changed/Fixed parsing, (c) duplicate entry önleme.

---

## Sprint Sonu Notu

Bu sprint kod-değiştirici (ADR-053 code-development) — Sprint 188 analysis-only sonrası ilk fix sürümü. Beklenen sonuçlar:
- 36 test fail baseline'ı **artmamalı** (Task 15 kategorize edecek, fix Sprint 190'da)
- ADR-008 1 ihlal → 0 ihlal (Task 1)
- MCP tool drift 27→31 her 3 yerde (Task 3, 12)
- 3 provider CLI detection net (Task 7)
- 6 yeni script + test eklenir; 4 yeni doc dosyası
- Tahmini süre: 1.5-2 saat (2 dalga × ~8 task paralel)

Sprint 189 retro otomatik yazılır (sprint-reporter.ts). Bu DIRECTIVES'te retro task **YOK** — `feedback_no_retro_task_in_directives` kuralı.
