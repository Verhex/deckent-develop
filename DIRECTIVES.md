# DIRECTIVES — Sprint 068: AI-Native Discoverability System

## Goal: Deckent'i kurulum sonrasi HER AI ortaminda (Claude, Cursor, Codex, VS Code) otomatik kesfedilebilir yap. MCP Server Instructions, zengin tool aciklamalari, deckent_help tool, DECKENT.md rehber, multi-ortam adapter. V2 routing ilk gercek sprint'i.

---

## Task 1: MCP Server Instructions — AI System Prompt Injection
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/mcp/server.ts
- Scope: src/mcp/

### Description
MCP SDK'nin `instructions` ozelligini kullan. McpServer constructor'a `instructions` string'i ekle. Bu metin MCP client baslatildiginda AI'nin system prompt'una otomatik enjekte edilir — TUM client'larda calisir (Claude Code, Cursor, Codex, VS Code, JetBrains).

Icerik:
- Deckent nedir (1 cumle)
- Is akisi: init → set_directives → plan → start → status → review → retro → cleanup
- Her tool'un 1 satirlik aciklamasi (16 tool + 9 resource)
- DIRECTIVES formati ornegi (## Task N: Title + Model/Effort/Skills/Files/Scope/Description)
- Sik kullanilan parametre degerleri (model: opus/sonnet/haiku, mode: ai/structured/auto)
- Hata durumunda ne yapilir (kill → cleanup → doctor)
- Sprint yasam dongusu: PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP

McpServer constructor'da: `{ name: 'deckent', version: DECKENT_VERSION, instructions: INSTRUCTIONS_TEXT }`

**Kanit:** `grep "instructions" src/mcp/server.ts` → instructions alani var

**Test:** 3+ test (instructions icerigi, format, uzunluk)

---

## Task 2: Tool Descriptions + Annotations Zenginlestirme
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/mcp/tools/init.ts, src/mcp/tools/directives.ts, src/mcp/tools/plan.ts, src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/mcp/tools/doctor.ts, src/mcp/tools/retro.ts, src/mcp/tools/history.ts, src/mcp/tools/analyze.ts, src/mcp/tools/sync.ts, src/mcp/tools/config.ts, src/mcp/tools/usage.ts, src/mcp/tools/review.ts, src/mcp/tools/run.ts, src/mcp/tools/kill.ts, src/mcp/tools/cleanup.ts
- Scope: src/mcp/tools/, tests/mcp/

### Description
16 MCP tool'un her birinin description'ini zenginlestir. MCP SDK v2 standartlarina uygun:

**Her tool icin:**
- Mevcut kisa description → detayli aciklama (ne yapar + ne zaman kullanilir + prerequisite + ornek)
- `annotations` ekle: `readOnlyHint: true/false`, `destructiveHint: true/false`, `idempotentHint: true/false`
- inputSchema alanlarinda `.describe()` ile parametre aciklamalari

**Oncelikli zenginlestirmeler:**
- `set_directives`: DIRECTIVES formati ornegi icermeli — `## Task N: Title` + alt basliklar
- `plan`: ai/structured/auto farklarini acikla
- `status`: Response alanlarini acikla (agents, alerts, progress, job)
- `review`: GO/NO_GO/GO_WITH_TECH_DEBT acikla
- `analyze_project`: Ne analiz ettigini detayli acikla
- `retro`: Ne dondurdugunu acikla

**Annotations ornekleri:**
- init: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- status: `{ readOnlyHint: true, destructiveHint: false }`
- kill: `{ readOnlyHint: false, destructiveHint: true }`
- cleanup: `{ readOnlyHint: false, destructiveHint: true }`

**Kanit:** `grep -c "annotations\|readOnlyHint" src/mcp/tools/*.ts` → 16 dosyada annotations var

**Test:** 4+ test (annotation varligi, description uzunlugu)

---

## Task 3: deckent_help Tool — Runtime Capabilities + State
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/mcp/tools/help.ts, src/mcp/tools/index.ts
- Scope: src/mcp/tools/, tests/mcp/

### Description
Yeni MCP tool: `deckent_help`. AI agent'lar calisma zamaninda Deckent'in tum yeteneklerini, mevcut proje durumunu ve sonraki adim onerisini sorgulayabilir.

**Dondurdugu JSON:**
```json
{
  "version": "0.68.0",
  "state": {
    "initialized": true/false,
    "hasDirectives": true/false,
    "sprintActive": true/false,
    "lastSprint": "sprint-067",
    "routingEngine": "v2",
    "agentCount": 9,
    "skillCount": 11
  },
  "nextAction": "Durum bazli onerilen sonraki adim",
  "workflows": {
    "sprint": ["init", "set_directives", "plan", "start", "status", "review", "cleanup"],
    "debug": ["doctor", "status", "kill", "cleanup"],
    "config": ["config read", "config set key value", "sync"]
  },
  "tools": [{ "name": "deckent_init", "description": "...", "readOnly": false }],
  "resources": [{ "name": "dashboard", "uri": "deckent://dashboard", "description": "..." }]
}
```

`nextAction` mantigi:
- initialized=false → "deckent_init ile projeyi baslatin"
- hasDirectives=false → "deckent_set_directives ile sprint hedeflerini yazin"
- sprintActive=true → "deckent_status ile ilerlemeyi izleyin"
- sprintActive=false && lastSprint → "deckent_retro ile son sprint'i okuyun veya yeni DIRECTIVES yazin"

index.ts'e register et.

**Kanit:** `grep "deckent_help" src/mcp/tools/index.ts` → register var

**Test:** 5+ test (state detection, nextAction logic, tool/resource listing)

---

## Task 4: DECKENT.md AI-Native Rehber Genisletme
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: DECKENT.md
- Scope: DECKENT.md

### Description
DECKENT.md'yi hem insan hem AI tarafindan tam anlasilir sekilde yeniden yaz. Bu dosya `deckent init` sonrasi tum ortamlarda (CLAUDE.md, AGENTS.md, .cursor/rules) referans alinan TEK kaynak.

**Eklenecek bolumler:**

A) **MCP Tool Referansi** — Tablo: Tool | Aciklama | Parametreler | ReadOnly | Ornek
B) **MCP Resource Referansi** — Tablo: Resource | URI | Icerik Tipi | Aciklama
C) **Is Akisi Rehberi** — Numarali adimlar: init → set_directives → plan → start → status → review → cleanup
D) **DIRECTIVES Format Rehberi** — Ornek DIRECTIVES ile aciklama: ## Task N, Model, Effort, Skills, Files, Scope, Description
E) **Sprint Yasam Dongusu** — 8 faz: PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP
F) **Parametre Referansi** — Model (opus/sonnet/haiku), Effort (low/normal/high), Mode (ai/structured/auto), Provider (claude/codex/gemini)
G) **Hata Cozum Rehberi** — Sprint takildi: kill → cleanup → doctor. Config sorunu: config read → config set

**Kanit:** `wc -l DECKENT.md` → oncekinden uzun + `grep "## MCP Tool\|## Workflow\|## DIRECTIVES" DECKENT.md`

**Test:** Bu task test gerektirmez — dokumantasyon.

---

## Task 5: deckent init Multi-Ortam Adapter
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/init.ts
- Scope: src/cli/commands/, tests/cli/commands/

### Description
`deckent init` calistiginda proje dizinindeki IDE/ortam klasorlerini algilayip uygun adapter dosyalari olusturur.

**Ortam algilama + adapter:**
- `.cursor/` varsa → `.cursor/rules/deckent.md` olustur (DECKENT.md referansi + Deckent workflow rehberi)
- `.vscode/` varsa → `.vscode/mcp.json` kontrol et, yoksa MCP kayit rehberi yaz
- `codex.md` kontrol: yoksa AGENTS.md'ye Codex-uyumlu referans ekle
- Tum adapter'lar `@DECKENT.md` referansi ile baslasın — tek kaynak prensibi (ADR-013)

**--all-envs flag:** Tum ortam adapter'larini zorla olustur (dizin yoksa olustur).

Mevcut Claude Code adapter mantigi (ensureDeckentImport) korunsun, yeni ortamlar ayni pattern'i kullansin.

**Kanit:** `ls .cursor/rules/deckent.md` → dosya var (cursor ortaminda)

**Test:** 4+ test (ortam algilama, adapter icerik, --all-envs)

---

## Task 6: V2 Routing E2E Dogrulama Testi
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: tests/orchestra/routing-v2-e2e.test.ts, tests/core/config.test.ts
- Scope: tests/orchestra/, tests/core/

### Description
V2 routing engine'in uctan uca dogru calistigini dogrulayan testler:

A) `loadConfig()` → `routing_engine: 'v2'` dondurmeli (config.json'daki deger ResolvedConfig'e aktarilmali)
B) V2 modda `routeTaskV2()` cagrilmali, `routingMeta` populated olmali
C) ci-guardian, `intent.primary: 'implementation'` olan task'lardan excluded olmali
D) DIRECTIVES `Skills: typescript-expert` → task.forceSkills: ['typescript-expert'] olarak aktarilmali
E) `extractGoNogoCriteria()` Kanit/Proof satirlarini goCriteria'ya aktarmali
F) `extractScopeFromDirective()` .deckent/ ve root dosyalari tanimali

**Kanit:** `npx vitest run tests/orchestra/routing-v2-e2e.test.ts` → tum testler gecmeli

**Test:** 10+ test (yukaridaki 6 senaryo + edge case'ler)

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- V2 routing AKTIF — agent/skill atamalari intent-based olmali
- MCP instructions TUM client'larda gorunmeli
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
