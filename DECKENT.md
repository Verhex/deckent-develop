# deckent — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/ (MEMORY 300, RETRO 120, PATTERNS 150, sprint log 100 per file)

## Providers
- Default: Claude (docker backend, session auth)
- Optional: Codex (set OPENAI_API_KEY), Gemini (set GOOGLE_API_KEY)
- Config: brain_provider, worker_provider, fallback_provider in .deckent/config.json
- Model Registry: 13 models, 3 providers, 4 tiers — single source of truth (model-registry.ts)
- Tier equivalence: premium_plus (o3, gemini-3.1-pro-preview), premium (opus↔gpt-5↔gemini-2.5-pro), standard (sonnet↔gpt-4.1↔o4-mini↔gemini-2.5-flash), economy (haiku↔gpt-5-mini↔gpt-4.1-mini↔gemini-2.0-flash)
- Provider-agnostic config: brain_tier/worker_tier instead of model names
- Planning mode: brain_planning = 'ai' | 'structured' | 'auto'

## Agents & Skills
- 15 built-in agents: security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist
- 21 built-in skills: typescript-expert, testing-expert, documentation-writer, security-specialist, performance-optimizer, api-builder, devops-engineer, database-migration, react-specialist, python-expert, ci-testing, accessibility-expert, anthropic-sdk, code-simplifier, docker-expert, frontend-design, git-expert, graphql-expert, migration-expert, monorepo-expert, system-architect
- Agent pool: .deckent/agents/*/agent.json — LRU eviction (max 50 temp, 5 sprint age)
- Skill registry: .deckent/skills/*/skill.json — AST sandbox validation
- Task routing: task-router.ts assigns agent + skills + provider per task

## MCP Integration
- 22 tools: init, set_directives, plan, start, status, doctor, retro, history, analyze_project, sync, config, review, run, kill, cleanup, help, agent_list, skill_list, checkpoint, docs, explain, **memory_query**
- 8 resources: dashboard, directives, memory, debt, config, retro, tasks, agents
- Registration: `claude mcp add deckent -- npx deckent mcp`

## Memory V2 — DB-First Architecture
- **Storage:** SQLite (better-sqlite3) — single source of truth, .md files are generated exports
- **Search:** FTS5 full-text search with dual-layer Turkish normalize (TR/EN/DE %100 recall)
- **DB path:** `.brain/memory.db` (gitignored, rebuilt from exports)
- **Exports:** `.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` (git-tracked)
- **Schema:** 5 tables (entries, tags, relations, entry_history, schema_version) + FTS5 virtual table
- **Brain auto-query:** Task DNA → ilgili ADR/pattern/memory otomatik sorgulanır (PLAN, SPAWN, EVALUATE)
- **CLI:** `deckent recall "sorgu"`, `deckent remember "not"`, `deckent memory rebuild|export|stats`
- **MCP:** `deckent_memory_query` tool — cross-source hafıza arama
- **Config:** `.deckent/config.json` → `memory.backend`, `memory.search`, `memory.decay_after_sprints`

## Mandatory Architecture Rules
@.brain/exports/summary.md

## Architecture Decision Records
- `.brain/exports/decisions.md` = **ADR** (Architecture Decision Record) — generated export from memory.db, MADR v3 hibrit format, mandatory read for all agents
- `.deckent/decisions/*.json` = **SDL** (Sprint Decision Log) — tactical decisions, audit trail, optional
- **`dependency_pipeline_enabled`:** kod default `true` (`config.ts:600`, Sprint 156 eklendi). deckent-dev bu projede bilinçli `false` (`.deckent/config.json:198`) — Wave geçişleri Brain manuel (ADR-047). Kullanıcı projelerinde default `true` = otomatik wave (ADR-045).

## Context
@DIRECTIVES.md
@.brain/exports/summary.md
@docs/reference/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: tsc
Test: npx vitest run
Lint: tsc --noEmit

## Boot
@.deckent/workspace/BOOT.md

---

## Workflow Guide — Is Akisi Rehberi

Deckent ile tipik bir sprint akisi asagidaki adimlari izler:

1. **`deckent_init`** — Projeyi baslat. `.deckent/`, `.brain/`, `.tasks/` dizinlerini olusturur. CLAUDE.md, DECKENT.md, DIRECTIVES.md referanslarini ekler. Her ortamda (Claude Code, Cursor, VS Code) bir kez calistirilir.

2. **`deckent_set_directives`** — Sprint hedeflerini yaz. DIRECTIVES.md dosyasini gunceller. Asagidaki DIRECTIVES Format Rehberini kullanarak task'lari tanimla.

3. **`deckent_plan`** — Sprint planla. DIRECTIVES.md'yi okur, task JSON dosyalarini `.tasks/` altinda olusturur. `mode: 'ai'` ile yapay zeka tabanli planlama, `mode: 'structured'` ile kural tabanli planlama.

4. **`deckent_start`** — Sprinti baslat. Worker'lari tmux veya subprocess olarak spawn eder, Auditor scan dongusu baslar. `--dry-run` ile task listesini goruntule, spawn etme.

5. **`deckent_status`** — Ilerlemeyi izle. Aktif worker'lar, tamamlanan task'lar, alertler ve coverage bilgisini gosterir. `--watch` ile canli izleme, `--json` ile ham JSON ciktisi.

6. **`deckent_review`** — Sprint sonucunu degerlendir. GO / NO_GO / GO_WITH_TECH_DEBT karari verir. Hangi task'larin basarisiz oldugunu ve tech debt birakilip birakilmayacagini gosterir.

7. **`deckent_retro`** — Retrospektif oku. RETRO.md ozetini, ogrenimleri ve bir sonraki sprint icin onerileri gosterir.

8. **`deckent_cleanup`** — Sprinti temizle. Task dosyalarini arsivler, kilitleri serbest birakir, tmux sessionlarini kapatir.

---

## DIRECTIVES Format Guide — DIRECTIVES Format Rehberi

DIRECTIVES.md dosyasi sprint hedeflerini tanimlar. Her task asagidaki formati izlemelidir:

```markdown
# DIRECTIVES — Sprint NNN: Sprint Basligi

## Goal: Sprint amacini bir paragrafta acikla.

---

## Task 1: Task Basligi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/config.ts, src/core/types.ts
- Scope: src/core/

### Description
Task'in ne yapacagini detayli acikla. Hangi degisiklikler yapilacak,
hangi fonksiyonlar eklenecek/degistirilecek, neden gerekli oldugunu belirt.

**Kanit:** `grep "yeniOzellik" src/core/config.ts` → eklendi

**Test:** 3+ test (temel davranis, edge case, hata durumu)

---

## Task 2: Diger Task
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: README.md, docs/guide.md
- Scope: docs/

### Description
...
```

### Alan Aciklamalari

| Alan | Gecerli Degerler | Aciklama |
|------|-----------------|----------|
| Model | opus, sonnet, haiku | Kullanilacak AI modeli |
| Effort | low, normal, high | Tahmini is yuku |
| Skills | skill-id listesi | Uzmanlik alani (virgul ile ayir) |
| Files | dosya yollari | Degistirilecek dosyalar |
| Scope | dizin yollari | Izin verilen dizinler |
| Kanit | shell komutu | Tamamlanma kaniti |
| Test | test sayisi + aciklama | Beklenen testler |

---

## Sprint Lifecycle — Sprint Yasam Dongusu

Bir sprint 8 fazdan olusur:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

| Faz | Aciklama | Sorumlu |
|-----|----------|---------|
| **PLAN** | Brain DIRECTIVES'i okur, task JSON'larini olusturur | Brain |
| **SPAWN** | Worker'lar tmux/subprocess ile baslatilir, Auditor baslar | Brain |
| **EXECUTE** | Worker'lar task'lari uygular, heartbeat dosyalari yazar | Workers |
| **EVALUATE** | Brain sonuclari degerlendirir: GO / NO_GO / GO_WITH_TECH_DEBT | Brain |
| **FIX** | Basarisiz task'lar yeniden denenir (yapilandirilabilir timeout) | Brain + Workers |
| **RETRO** | Retrospektif yazilir: RETRO.md, sprint log guncellenir | Brain |
| **DECAY** | .brain/ bellek butcesi asildiysa eski satirlar temizlenir | Brain |
| **CLEANUP** | Task dosyalari arsivlenir, kilitler serbest, session'lar kapatilir | Brain |

---

## MCP Tool Reference — MCP Arac Referansi

| Tool | Aciklama | ReadOnly | Destructive |
|------|----------|----------|-------------|
| `deckent_init` | Projeyi baslat, dizinleri olustur, ortam adapter'larini kur | Hayir | Hayir |
| `deckent_set_directives` | DIRECTIVES.md'yi guncelle, sprint hedeflerini tanimla | Hayir | Hayir |
| `deckent_plan` | DIRECTIVES'i oku, task JSON'larini olustur | Hayir | Hayir |
| `deckent_start` | Sprint'i baslat, worker'lari spawn et | Hayir | Hayir |
| `deckent_status` | Aktif sprint durumunu goster (worker'lar, alertler, ilerleme) | Evet | Hayir |
| `deckent_doctor` | Codebase sagligini kontrol et, sorunlari tespit et | Evet | Hayir |
| `deckent_retro` | Son sprint retrospektifini goster | Evet | Hayir |
| `deckent_history` | Sprint gecmisini listele | Evet | Hayir |
| `deckent_analyze_project` | Proje stack'ini, bagimlilikları, sagligi analiz et | Evet | Hayir |
| `deckent_sync` | Konfigurasyon ve manifest'leri senkronize et | Hayir | Hayir |
| `deckent_config` | Konfigurasyon oku veya guncelle | Hayir | Hayir |
| `deckent_review` | Sprint sonucunu degerlendir: GO / NO_GO / GO_WITH_TECH_DEBT | Evet | Hayir |
| `deckent_run` | Tek bir task'i arka planda calistir | Hayir | Hayir |
| `deckent_kill` | Aktif sprint'i veya belirli worker'lari durdur | Hayir | **Evet** |
| `deckent_cleanup` | Task dosyalarini arsivle, sprint'i temizle | Hayir | **Evet** |
| `deckent_help` | Runtime yetenekleri, proje durumu ve kullanim rehberi goster | Evet | Hayir |
| `deckent_agent_list` | Kayitli agent'lari listele (built-in ve temp) | Evet | Hayir |
| `deckent_skill_list` | Kayitli skill'leri listele (manifest ve AST sandbox info) | Evet | Hayir |
| `deckent_checkpoint` | Checkpoint approve/reject | Hayir | Hayir |
| `deckent_docs` | Sprint lifecycle dokuman yonetimi (add/remove/list) | Hayir | Hayir |
| `deckent_explain` | Sprint gecmisini ve sonuclarini acikla | Evet | Hayir |
| `deckent_memory_query` | Proje hafizasinda cross-source arama (ADR, sprint, debt, pattern) | Evet | Hayir |

### Parametre Ornekleri

```typescript
// deckent_init
{ root: "/path/to/project", projectName: "my-app" }

// deckent_set_directives
{ content: "# DIRECTIVES — Sprint 001\n## Task 1: ...", root: "/path/to/project" }

// deckent_plan
{ mode: "ai", root: "/path/to/project" }
// mode: "ai" → AI tabanli planlama (GPT/Claude)
// mode: "structured" → Kural tabanli, deterministik
// mode: "auto" → Proje boyutuna gore otomatik sec

// deckent_start
{ sprintId: "sprint-001", dryRun: false, root: "/path/to/project" }

// deckent_status
{ watch: false, json: false, root: "/path/to/project" }

// deckent_config
{ action: "read", root: "/path/to/project" }
{ action: "set", key: "max_workers", value: "4", root: "/path/to/project" }

// deckent_kill
{ target: "all", root: "/path/to/project" }
{ target: "worker", workerId: "w-001-003", root: "/path/to/project" }
```

---

## MCP Resource Reference — MCP Kaynak Referansi

| Resource | URI | Icerik | Aciklama |
|----------|-----|--------|----------|
| dashboard | `deckent://dashboard` | JSON | Aktif sprint durumu: worker'lar, fazlar, alertler, metrikler |
| directives | `deckent://directives` | Markdown | Mevcut DIRECTIVES.md icerigi |
| memory | `deckent://memory` | Markdown | Brain bellek ozeti: ogrenim, kararlar, desenler |
| debt | `deckent://debt` | Markdown | Teknik borc tablosu: acik ve cozulmus maddeler |
| config | `deckent://config` | JSON | Guncellenmis proje konfigurasyonu |
| retro | `deckent://retro` | Markdown | Son sprint retrospektif raporu |
| tasks | `deckent://tasks` | JSON | Mevcut sprint task listesi ve durumlari |
| agents | `deckent://agents` | JSON | Kayitli agent havuzu, istatistikler, kullanim oranlari |

---

## Parameter Reference — Parametre Referansi

### Model

| Deger | Provider | Tier | Kullanim |
|-------|----------|------|---------|
| `opus` | Claude | Premium | Karmasik mimari, kritik karar, multi-file refactor |
| `sonnet` | Claude | Standard | Genel gelistirme, bug fix, test yazimi |
| `haiku` | Claude | Economy | Dokumantasyon, basit degisiklik, format duzenlemesi |
| `o3` | Codex | Premium+ | En yuksek seviye reasoning (OPENAI_API_KEY gerekli) |
| `gpt-5` | Codex | Premium | opus esdegeri (OPENAI_API_KEY gerekli) |
| `gpt-4.1` | Codex | Standard | sonnet esdegeri |
| `o4-mini` | Codex | Standard | Hafif reasoning modeli |
| `gpt-5-mini` | Codex | Economy | haiku esdegeri |
| `gpt-4.1-mini` | Codex | Economy | Dusuk maliyetli genel kullanim |
| `gemini-3.1-pro-preview` | Gemini | Premium+ | En yuksek seviye Gemini (GOOGLE_API_KEY gerekli, preview) |
| `gemini-2.5-pro` | Gemini | Premium | opus esdegeri (GOOGLE_API_KEY gerekli) |
| `gemini-2.5-flash` | Gemini | Standard | sonnet esdegeri |
| `gemini-2.0-flash` | Gemini | Economy | haiku esdegeri |

### Tier

| Tier | Aciklama | Ornek Modeller |
|------|----------|----------------|
| `premium_plus` | En yuksek seviye, ileri reasoning | o3, gemini-3.1-pro-preview |
| `premium` | Karmasik gorevler, mimari kararlar | opus, gpt-5, gemini-2.5-pro |
| `standard` | Genel gelistirme, dengeli maliyet | sonnet, gpt-4.1, o4-mini, gemini-2.5-flash |
| `economy` | Basit gorevler, dusuk maliyet | haiku, gpt-5-mini, gpt-4.1-mini, gemini-2.0-flash |

### Effort

| Deger | Aciklama | Ornek |
|-------|----------|-------|
| `low` | <1 saat, minimal degisiklik | Yorum guncelleme, kucuk duzeltme |
| `normal` | 1-3 saat, orta kapsamli | Yeni fonksiyon, test ekleme |
| `high` | 3+ saat, buyuk degisiklik | Yeni modul, mimari degisiklik, refactor |

### Planning Mode

| Deger | Aciklama |
|-------|----------|
| `ai` | AI tabanli planlama — DIRECTIVES'i yorumlar, akilli task bolunumu |
| `structured` | Kural tabanli — deterministik, hizli, AI API kullanmaz |
| `auto` | Proje boyutuna gore otomatik: kucuk→structured, buyuk→ai |

### Provider

| Deger | Backend | Konfigürasyon |
|-------|---------|---------------|
| `claude` | Claude Code (tmux) | Varsayilan, oturum kimlik dogrulamasi |
| `codex` | OpenAI Codex | `OPENAI_API_KEY` env var gerekli |
| `gemini` | Google Gemini | `GOOGLE_API_KEY` env var gerekli |

---

## Error Resolution Guide — Hata Cozum Rehberi

### Sprint Takildi / Dondu

```bash
# 1. Aktif worker'lari durdur
deckent kill --all

# 2. Task dosyalarini temizle
deckent cleanup

# 3. Codebase sagligini kontrol et
deckent doctor

# 4. Gerekirse yeniden baslat
deckent start
```

### MCP Araciligi ile:
```
deckent_kill  → { target: "all" }
deckent_cleanup → { root: "." }
deckent_doctor → { root: "." }
```

### Konfigurasyon Sorunu

```bash
# Mevcut konfigurasyon'u oku
deckent config read

# Belirli bir degeri guncelle
deckent config set max_workers 4
deckent config set brain_provider claude
deckent config set routing_engine v2
```

### Build Hatasi (tsc --noEmit)

1. Hata mesajini oku — hangi dosya, hangi satir
2. Ilgili tipleri kontrol et (`src/core/*-types.ts`)
3. Import yollarini dogrula (`.js` uzantisi gerekli — ESM)
4. `tsc --noEmit` tekrar calistir

### Test Basarisizligi

1. Basarisiz test'in dosyasini tespit et
2. `npx vitest run path/to/failing.test.ts` ile izole calistir
3. Mock'larin guncellenmis export'lari icerip icermedigini kontrol et
4. `npx vitest run` — tam suite calistir

### Worker .result Birakmadi (False NO_GO)

- Worker tmux session'inda calisiyor olabilir: `tmux ls` ile kontrol et
- `.tasks/task-NNN.hb` heartbeat dosyasini kontrol et — son timestamp
- `deckent status` ile worker durumunu gozlemle
- Gerekirse: `deckent kill --worker w-NNN-NNN`

### MCP Server Eski Kod Calistiriyor

```bash
# Build et
tsc

# MCP server'i yeniden baslat (long-lived process cache'i temizler)
# Claude Code'da: /mcp restart veya Claude'u yeniden baslat
```

---

## Built-in Agents (15)

> ADR-041 (Sprint 166 reconfirmed): Tüm testing agent'ları kaldırıldı — test görevi task-bazlı yönetiliyor.

| Agent | Uzmanlik | Aktivasyon |
|-------|----------|------------|
| `security-auditor` | Guvenlik aciklari, OWASP top 10, auth | security/auth/vuln anahtar kelimeleri |
| `doc-writer` | README, JSDoc, API docs, CHANGELOG | docs/readme/comment anahtar kelimeleri |
| `bug-fixer` | Hata ayiklama, regression, hotfix | fix/bug/error/crash anahtar kelimeleri |
| `code-reviewer` | Kod kalitesi, best practices, PR review | review/quality/refactor anahtar kelimeleri |
| `refactorer` | Yeniden yapilandirma, temizlik, modernizasyon | refactor/cleanup/migrate anahtar kelimeleri |
| `api-builder` | REST API, OpenAPI, endpoint tasarimi | api/endpoint/route/schema anahtar kelimeleri |
| `performance-analyzer` | Profiling, optimizasyon, benchmark | perf/slow/optimize anahtar kelimeleri |
| `ci-guardian` | CI/CD saglik, test regresyon, build | ci/pipeline/test anahtar kelimeleri |
| `architect` | Sistem tasarimi, modul yonetimi, bagimlilk analizi | architecture/design/module anahtar kelimeleri |
| `architecture-planner` | Mimari planlama, ADR yazimi, yol haritasi | plan/roadmap/adr anahtar kelimeleri |
| `accessibility-auditor` | WCAG, a11y, erisilebilirlik denetimi | accessibility/a11y/wcag anahtar kelimeleri |
| `data-engineer` | Veri pipeline, ETL, veri modeli | data/pipeline/etl anahtar kelimeleri |
| `devops-engineer` | CI/CD, Docker, deployment, altyapi | devops/deploy/docker anahtar kelimeleri |
| `frontend-designer` | UI/UX, component tasarimi, responsive | frontend/ui/design anahtar kelimeleri |
| `migration-specialist` | Versiyon gecisi, framework migration | migration/upgrade/deprecation anahtar kelimeleri |

## Built-in Skills (21)

| Skill | Aciklama |
|-------|----------|
| `typescript-expert` | TypeScript tip sistemi, ESM, generics, decorators |
| `testing-expert` | Vitest/Jest, mock'lama, coverage, test stratejisi |
| `documentation-writer` | Markdown, JSDoc, API docs, changelog |
| `security-specialist` | Guvenlik patternleri, input validasyon, kriptografi |
| `performance-optimizer` | Async optimizasyon, memory, profiling |
| `api-builder` | REST tasarimi, OpenAPI spec, versiyonlama |
| `devops-engineer` | GitHub Actions, Docker, deployment pipeline |
| `database-migration` | Query optimizasyon, migration, ORM |
| `react-specialist` | React, Vite, Tailwind, component mimari |
| `python-expert` | Python ekosistemi, FastAPI, veri islemleri |
| `ci-testing` | CI ortaminda test yurutme, regresyon algilama |
| `accessibility-expert` | WCAG standartlari, a11y test, erisilebilirlik |
| `anthropic-sdk` | Claude API, Anthropic SDK, tool use, agent SDK |
| `code-simplifier` | Kod sadestirme, karmasiklik azaltma, temizlik |
| `docker-expert` | Dockerfile, compose, container optimizasyon |
| `frontend-design` | UI component, CSS, responsive tasarim |
| `git-expert` | Git is akisi, branch stratejisi, merge yonetimi |
| `graphql-expert` | GraphQL schema, resolver, subscription |
| `migration-expert` | Framework gecisi, versiyon yukseltme, API migration |
| `monorepo-expert` | Monorepo yonetimi, workspace, paket bagimliliklari |
| `system-architect` | Sistem mimarisi, tasarim desenleri, olceklenebilirlik |
