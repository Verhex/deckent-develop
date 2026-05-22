# DIRECTIVES — Sprint 188: Deckent Self-Analysis (analysis-only, 2 dalga)

## Goal: Deckent'in sunduğu özelliklerin tutarlılığını ve doğruluğunu uçtan uca denetle. Worker'lar deckent'in kendi kod tabanını, MCP/CLI yüzeyini, dokümanlarını ve yardımcı sistemlerini analiz eder ve bulgu raporları üretir. Bu sprint ANALYSIS-ONLY: hiçbir kaynak kod / doküman / config DEĞİŞTİRİLMEZ — her worker yalnızca `docs/audits/sprint-188/` altına kendi rapor dosyasını yazar. Dalga 1 envanteri/gerçeği tespit eder; Dalga 2 çapraz tutarlılığı W1 raporlarına dayanarak denetler.

Tüm task'lar için ortak kurallar:
- Worker yalnızca `docs/audits/sprint-188/<rapor>.md` dosyasını YAZAR. `src/`, `docs/`, `scripts/`, config dahil her şey SALT-OKUNUR — analiz için okunur, asla değiştirilmez.
- Her bulgu `dosya:satır` kanıtıyla belgelenir (`grep -n` / dosya kontrolü).
- Rapor en az 40 satır ve en az 7 adet `## ` başlık bölümü içermelidir.
- Rapor sonunda "Özet" ve "Sprint 189 Follow-up" bölümleri olmalı.
- tsc/vitest çalıştırılmaz (kaynak kod değişmiyor — task tipi `audit`, ADR-053).

---

## Task 1: W1-T01 — CLI komut envanteri ve bütünlük denetimi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: docs/audits/sprint-188/cli-command-inventory.md
- Scope: docs/audits/

### Description
`src/cli/commands/` ve `src/cli/entry.ts` + `src/cli/index.ts` denetlenir. Kontroller:
1. Tüm `register*(program)` modüllerini listele; toplam komut sayısını say.
2. IDENTITY.md/DECKENT.md "55+/56+ CLI commands" iddiasını gerçek sayıyla karşılaştır.
3. Her komutun `.description()`, `.option()` ve `.action()` bütünlüğü — eksik help/handler var mı.
4. `register*` tanımlı ama `index.ts`'te wire edilmemiş (ölü) komut var mı.
5. ADR-012 `register<Name>(program)` desenine uymayan komut var mı.

**Kanıt:** `grep -rn "export function register" src/cli/commands/` çıktısı + komut sayısı; her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 2: W1-T02 — MCP araç ve resource envanteri
- Model: sonnet
- Effort: normal
- Skills: anthropic-sdk
- Files: docs/audits/sprint-188/mcp-tool-inventory.md
- Scope: docs/audits/

### Description
`src/mcp/tools/` ve MCP server kayıt katmanı denetlenir. Kontroller:
1. Tüm `registerXxxTool` modüllerini listele; toplam tool sayısını say.
2. **Bilinen tutarsızlık:** DECKENT.md "31 tools" ↔ IDENTITY.md Project Status "27" ↔ MCP server instructions "27". Gerçek sayıyı tespit et, hangi belgeler yanlış belirt.
3. Her tool'un Zod `inputSchema`, `annotations` (readOnly/destructive/idempotent) ve handler bütünlüğü.
4. 8 MCP resource'un (`deckent://...`) kaydı ve doğruluğu.
5. Kayıtlı ama server'a wire edilmemiş ölü tool var mı.

**Kanıt:** `grep -rn "registerTool\|register.*Tool" src/mcp/` + tool sayısı; her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 3: W1-T03 — core/ çekirdek modül sağlığı
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: docs/audits/sprint-188/core-health.md
- Scope: docs/audits/

### Description
`src/core/` (90 modül) çekirdek altyapısı denetlenir. Kontroller:
1. config.ts — 3-katman merge (defaults→global→project) tutarlı mı, `dependency_pipeline_enabled` default değeri.
2. routing-engine.ts + intent-classifier + activation-engine — 3-katman routing bütünlüğü.
3. model-registry.ts — 13 model, 3 provider, 4 tier; DECKENT.md iddialarıyla uyum.
4. memory-store/memory-query/memory-export/memory-import — Memory V2 DB-first bütünlüğü, ölü export fonksiyonu var mı.
5. Genel: ölü kod adayları, `*-types.ts` tip bütünlüğü, ESM `.js` uzantı uyumu.

**Kanıt:** modül listesi + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 4: W1-T04 — orchestra/ sprint lifecycle sağlığı
- Model: opus
- Effort: high
- Skills: system-architect
- Files: docs/audits/sprint-188/orchestra-health.md
- Scope: docs/audits/

### Description
`src/orchestra/` (76 modül) sprint yaşam döngüsü denetlenir. Kontroller:
1. sprint-controller — 8 faz akışı (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP) bütünlüğü.
2. planner / task-builder / task-router — planlama + routing zinciri.
3. result-evaluator / quality-assessor — GO/NO_GO/TECH_DEBT değerlendirmesi.
4. **ADR-008 import sınırları** — Brain merkezi import; planner yalnızca core/'dan import ediyor mu; circular dependency var mı.
5. debt-manager / sprint-reporter — Memory V2 sonrası DB-first tutarlılık.

**Kanıt:** modül listesi + ADR-008 ihlal taraması + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 5: W1-T05 — agents/ + monitor/ sağlığı
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: docs/audits/sprint-188/agents-monitor-health.md
- Scope: docs/audits/

### Description
`src/agents/` (20 modül) ve `src/monitor/` denetlenir. Kontroller:
1. worker.ts — task claim, file locking, heartbeat, result write bütünlüğü.
2. adaptive-agent.ts — runtime agent adaptasyonu, ölü mü canlı mı.
3. monitor/auditor — scan loop, pattern tespiti (Memory V2 `pattern` entry), boundary violation.
4. dashboard-manager + sprint-state-tracker — gözlemlenebilirlik.
5. ADR-008 — auditor/worker brain import etmiyor mu.

**Kanıt:** modül listesi + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 6: W1-T06 — nervous/ + connectors/ + providers/ sağlığı
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: docs/audits/sprint-188/nervous-connectors-providers-health.md
- Scope: docs/audits/

### Description
`src/nervous/`, `src/connectors/`, `src/providers/` denetlenir. Kontroller:
1. nervous/ — ADR-040 meta-orchestrator; observer/detector-registry/decision-engine/proposer/dispatcher/executor; canlı mı yarı-wire mi (half-wired dormant iddiası).
2. connectors/ — Discord/Telegram/WhatsApp adapter'ları + incoming-router; gerçekten çalışır mı yoksa stub mu.
3. providers/ — Claude/Codex/Gemini adapter'ları (5 modül); ProviderAdapter arayüz uyumu.
4. Her alt-sistemin DECKENT.md/IDENTITY.md'deki iddialarla uyumu.

**Kanıt:** modül listesi + canlı/dormant/stub sınıflandırması + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 7: W1-T07 — api/ + dashboard/ tutarlılığı
- Model: sonnet
- Effort: normal
- Skills: react-specialist
- Files: docs/audits/sprint-188/api-dashboard-consistency.md
- Scope: docs/audits/

### Description
`src/api/` (4 modül) ve `src/dashboard/` denetlenir. Kontroller:
1. api/server — HTTP endpoint listesi, SSE, rate limiting.
2. dashboard — 7 sayfa iddiası doğru mu; her sayfa hangi API endpoint'i kullanıyor.
3. API endpoint ↔ dashboard tüketimi tutarlı mı; dashboard'un çağırdığı ama olmayan endpoint, ya da hiç tüketilmeyen endpoint.
4. Ölü route / ölü sayfa / ölü component.

**Kanıt:** endpoint listesi + sayfa listesi + eşleme tablosu + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 8: W1-T08 — scripts/ + build/test config envanteri
- Model: sonnet
- Effort: normal
- Skills: devops-engineer
- Files: docs/audits/sprint-188/scripts-build-config.md
- Scope: docs/audits/

### Description
`scripts/` dizini ve build/test konfigürasyonu denetlenir. Kontroller:
1. `scripts/` içindeki tüm script'leri listele; her birinin amacı, güncelliği.
2. `package.json` script'leri — her biri çalışır mı, hangi `scripts/` dosyasını çağırıyor, ölü script var mı.
3. tsconfig.json + vitest config'leri (vitest.config + vitest.dashboard.config) tutarlılığı.
4. Hiçbir yerden referans verilmeyen (ölü) script dosyası var mı.

**Kanıt:** script listesi + package.json script eşlemesi + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 9: W1-T09 — feature envanteri ve doğruluk denetimi
- Model: opus
- Effort: high
- Skills: system-architect
- Files: docs/audits/sprint-188/feature-inventory.md
- Scope: docs/audits/

### Description
Deckent'in ilan edilen özellikleri ile kod gerçeği karşılaştırılır. Kontroller:
1. IDENTITY.md "Features" listesi + DECKENT.md + README.md'deki tüm ilan edilen özellikleri çıkar.
2. Her özellik için: kodda gerçekten wire'lı mı (canlı) / yarı-wire / dormant / dead / yalnızca iddia.
3. "ilan vs gerçek" envanter tablosu — her özelliğin durumu + kanıt dosyası.
4. Memory V2 sonrası özellik tariflerinin güncelliği.

**Kanıt:** özellik envanter tablosu (canlı/dormant/dead sütunu) + her satır `dosya:satır` kanıtı.
**Test:** Audit task — test yok.

---

## Task 10: W2-T10 — CLI↔MCP parity tam haritası
- Model: opus
- Effort: high
- Skills: system-architect
- Files: docs/audits/sprint-188/cli-mcp-parity.md
- Scope: docs/audits/
- Dependencies: 188-001, 188-002

### Description
W1-T01 (CLI envanteri) ve W1-T02 (MCP envanteri) raporlarını `docs/audits/sprint-188/` altından OKU ve ground-truth al. Kontroller:
1. Her yetenek için: CLI komutu VAR mı + MCP tool'u VAR mı — tam eşleme tablosu.
2. Tek tarafta olan yetenekler (yalnız CLI / yalnız MCP) — kasıtlı mı eksiklik mi.
3. Parametre paritesi — ADR-022 / ADR-022-v2 (CLI/MCP Feature Parity); CLI option'ları ↔ MCP inputSchema alanları örtüşüyor mu.
4. Aynı yetenek CLI ve MCP'de aynı çekirdek mantığa mı gidiyor yoksa kod yolu ayrışmış mı (drift).
5. Davranış farkları — varsayılan değer, çıktı biçimi.

**Kanıt:** tam CLI↔MCP eşleme tablosu + parite-boşluğu listesi + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.

---

## Task 11: W2-T11 — doc↔kod drift denetimi
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: docs/audits/sprint-188/doc-code-drift.md
- Scope: docs/audits/
- Dependencies: 188-001, 188-002, 188-009

### Description
W1-T01/T02/T09 envanter raporlarını ground-truth alıp doküman↔kod tutarlılığı denetlenir. Kontroller:
1. CLAUDE.md, DECKENT.md, README.md, AGENTS.md — kod gerçeğiyle uyumsuz iddialar (modül sayıları, komut/tool sayıları, sürüm).
2. `docs/reference/` — API/CLI/MCP referans dokümanları kod gerçeğiyle uyumlu mu.
3. Bayat referanslar — kaldırılmış dosya/fonksiyona atıf (Memory V2 legacy izleri dahil).
4. W1 envanterindeki "ilan vs gerçek" farklarının dokümanlara yansıyıp yansımadığı.

**Kanıt:** doc↔kod uyumsuzluk tablosu (belge:satır ↔ kod gerçeği) + her bulgu kanıtlı.
**Test:** Audit task — test yok.

---

## Task 12: W2-T12 — ADR uyumu + test sağlığı denetimi
- Model: opus
- Effort: high
- Skills: system-architect, testing-expert
- Files: docs/audits/sprint-188/adr-test-health.md
- Scope: docs/audits/
- Dependencies: 188-003, 188-004, 188-005, 188-006, 188-009

### Description
W1 kod-sağlığı raporlarını (T03-T06, T09) ground-truth alıp ADR uyumu ve test sağlığı denetlenir. Kontroller:
1. 64 ADR ↔ kod gerçeği — accepted ADR'lerin koda uygulanma durumu (özellikle ADR-008 import, ADR-037 RBAC, ADR-045 wave, ADR-046 hook).
2. proposed ADR'ler (adr-055 Hybrid Scoring, adr-060 Self-Awareness, adr-061 AEGIS) — durum gerçekçi mi, kodda iz var mı.
3. Test paketi durumu — `tests/` envanteri, bilinen ~31 başarısız testin tasnifi (kategori: workflows / docs config / nervous / docker-e2e / rules-refactor).
4. Coverage durumu ve belirgin coverage boşlukları.

**Kanıt:** ADR uyum tablosu + test-fail tasnif tablosu + her bulgu `dosya:satır`.
**Test:** Audit task — test yok.
