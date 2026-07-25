# deckent — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

> **Aktif yön kararları taşındı** — bu iç-pivot notu artık `.analysis/hermes-vs-deckent-direction-decisions.md`
> içinde tutuluyor (CLAUDE.md operating_rules'ta da özetlenir); DECKENT.md yalnız mekanik/işlevsel
> referans kalır, tekrar-eden iç-strateji notu barındırmaz.

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/ (MEMORY 300, RETRO 120, PATTERNS 150, sprint log 100 per file)

## Providers
- Core provider identities: `claude`, `codex`, `gemini`, `ollama`, `openrouter`; config-driven provider definitions can extend the runtime registry
- Default config: `providers: { brain: "claude", worker: "claude" }`; Claude workers use the Docker backend unless explicitly configured otherwise
- Role-aware fallback: `provider_fallback.brain|worker|auditor` → `provider_fallback.global` → legacy single `fallback_provider`; `provider_fallback.auditor_provider` selects the Auditor primary
- Configured order is authoritative, but fallback is never an availability claim: auth, backend/model reachability, limit evidence and execution-budget admission must still pass
- Model Registry: live/cached catalog plus bundled offline fallback — `src/core/model-registry.ts`; inspect with `deckent models list`
- Runtime model identity is the exact provider API ID (`id === apiId`). Legacy names such as `opus`, `sonnet`, `haiku` and `gpt-5` are migration inputs only and are rejected in authored tasks
- Provider-agnostic selection uses `model_strategy.brain_tier` / `model_strategy.worker_tier`; tier resolution returns a registered exact API ID
- Planning mode: brain_planning = 'ai' | 'structured' | 'auto'

## Agents & Skills
- 21 built-in agents + 31 built-in skills (src/core/builtins/{agents,skills} — canlı-sayım kaynağı) — aşağıdaki **Built-in Agents** / **Built-in Skills** bölümleri örnek/temsili bir alt-küme gösterir; tam liste `docs/reference/agents.md` + `src/core/builtins/skills/`.
- Agent pool: .deckent/agents/*/agent.json — LRU eviction (max 50 temp, 5 sprint age)
- Skill registry: .deckent/skills/*/skill.json — AST sandbox validation
- Task routing: task-router.ts assigns agent + skills + provider per task

## MCP Integration
- 47 tools — canlı/tam liste `docs/reference/mcp-tools.md` (AUTOGEN, `npm run docs:ref`); örnekler: init, set_directives, plan, start, status, doctor, retro, history, sync, config, review, run, kill, cleanup, help, **memory_query**, **autonomous**, **models**, nervous_subscribe, nervous_accept, nervous_reject, nervous_status, nervous_config, **process**, vb.
- 8 resources: dashboard, directives, memory, debt, config, retro, tasks, agents
- Canonical tool list is auto-generated — see `docs/reference/mcp-tools.md` (`npm run docs:ref`)
- Registration: `claude mcp add deckent -- npx deckent-mcp`

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
- **`dependency_pipeline_enabled`:** kod default `true` (Sprint 156 eklendi). **deckent-dev'de de artık `true`** (`.deckent/config.json`, flip 2026-06-10) — otomatik multi-wave canlı-kanıtlı (Sprint 279/280 kademeli wave yürütme; ADR-045 amendment). Kullanıcı projelerinde de default `true`. ADR-047 Brain-manuel wave artık fallback. Dependency-tatmin seti: `DONE ∪ MANUAL_REVIEW_REQUIRED` (Sprint 280, MRR-deadlock fix).

## Context
@DIRECTIVES.md
@.brain/exports/summary.md
@docs/reference/api-surface.md

## Environment
Build: `npm run build` (tsc + copy-assets) | Full: `npm run build:all` (+ dashboard vite) | Dev: `npm run dev` (tsc --watch)
Test: `npm test` (vitest run) | Watch: `npm run test:watch` | Coverage: `npm run test:coverage` | Dashboard: `npm run test:dashboard`
Lint: `npm run lint` (tsc --noEmit) | ADR: `npm run lint:adr` | Errors: `npm run lint:errors` | Links: `npm run lint:link`

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

## Native Terminal Work-Launching Flow — Terminal İş-Başlatma Akışı

### Canonical Flow (terminal.run_flow_v2 ON)

When `terminal.run_flow_v2` is enabled, the canonical entry point for launching work via the native
terminal is **`deckent_propose_run`**. The flow is:

```
Natural Language Intent
        ↓
  deckent_propose_run
        ↓
   Brain Plan Preview
   (tasks, gates, digest)
        ↓
  In-Terminal Card
  (approve/reject UI)
        ↓
   Snapshot Start
   (worker spawn)
        ↓
 Correlated Result
```

**Step-by-step:**

1. **Natural Language Intent** — You describe the work in plain language: "Add TypeScript strict mode to src/core", "Fix flaky test in utils", etc.

2. **`deckent_propose_run` Call** — The terminal agent proposes a run with your `intentSummary`. This call:
   - Generates a real Brain plan preview (task summaries, gate/policy results, content-addressed digest)
   - Never starts anything and never requires a confirmation prompt
   - Returns immediately with the preview compiled

3. **Plan Preview Card** — The terminal renders an in-terminal UI card showing:
   - Proposed tasks and their summaries
   - Any gate/policy checks (security, dependency, etc.)
   - Content digest (hash of the plan)
   - Your choices: **Approve**, **Reject**, or **Edit**

4. **Human Approval** — You review and approve the plan via the card (not a text prompt). This is the actual gate.

5. **Snapshot Start** — On approval, deckent snapshots the plan state and spawns workers.

6. **Correlated Result** — Workers report results linked back to the original proposal for audit and tracing.

### Legacy Flow (terminal.run_flow_v2 OFF, or expert escape hatch)

The prior work-launching flow remains available as an **expert low-level escape hatch**:

```
DIRECTIVES.md
      ↓
 deckent_set_directives
      ↓
  DIRECTIVES written
      ↓
  deckent_plan
      ↓
  .tasks/ JSON created
      ↓
  deckent_start
      ↓
  Workers spawn
```

This flow is useful when:
- You need precise manual control over task definitions and scope
- You're debugging or iterating on task structure
- `terminal.run_flow_v2` is disabled (the default)

**Explicit note:** When `terminal.run_flow_v2` is ON, this path is labeled an expert escape hatch in the native
terminal tool descriptions, and `deckent_propose_run` is the canonical entry point. When the flag is OFF, the
legacy flow is the only path available.

### Configuration

```json
{
  "terminal": {
    "run_flow_v2": false
  }
}
```

Set in `.deckent/config.json` (see `deckent config set terminal.run_flow_v2 true` via the CLI).

- **Default:** `false` (legacy flow active)
- **Canonical mode:** `true` (enables `deckent_propose_run` as the main entry point)

### Traceability & Audit

Both flows produce a result record linked to the initiating act:
- **Canonical flow:** Proposal ID → Plan preview digest → Approval event → Snapshot → Worker results
- **Legacy flow:** DIRECTIVES version → Plan JSON → Start event → Worker results

The Brain's memory system (`memory.db`) records both paths equally for audit and learning.

---

## DIRECTIVES Format Guide — DIRECTIVES Format Rehberi

DIRECTIVES.md dosyasi sprint hedeflerini tanimlar. Her task asagidaki formati izlemelidir:

```markdown
# DIRECTIVES — Sprint NNN: Sprint Basligi

## Goal: Sprint amacini bir paragrafta acikla.

---

## Task 1: Task Basligi
- Model: claude-sonnet-5
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
- Model: claude-haiku-4-5-20251001
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
| Model | Kayitli tam provider API ID (örn. claude-sonnet-5, gpt-5.6-sol) | Kullanilacak AI modeli; legacy alias'lar reddedilir, canli katalog icin `deckent models list` |
| Provider | claude, codex, gemini, ollama, openrouter veya kayitli provider | Bu task'i hangi provider kossun (per-task override; erisilebilirlik kaniti degildir) |
| Effort | low, normal, high | Tahmini **is YUKU** (timeout/butce/token-tahmin). Reasoning-derinligi DEGIL — onun icin ModelEffort |
| ModelEffort | claude: low/medium/high/xhigh/max · codex: minimal/low/medium/high | Modelin **reasoning DERINLIGI** (claude `--effort`, codex `model_reasoning_effort`). Opt-in; gemini/ollama desteklemez. Effort (is-yuku) ile karistirma. |
| Backend | docker, tmux, subprocess | Task'i belirli spawn-backend'e zorlar — host-adapter provider'i (codex/gemini/ollama) docker container'da kosturmak icin (varsayilan: codex/gemini/ollama host CLI, claude docker) |
| Auth | subscription, api | Per-task auth modu (api => ANTHROPIC_API_KEY zorunlu, ~/.claude mount atlanir) |
| Skills | skill-id listesi | Uzmanlik alani (virgul ile ayir) |
| Files | dosya yollari | Degistirilecek dosyalar |
| Scope | dizin yollari | Izin verilen dizinler |
| Kanit | shell komutu | Tamamlanma kaniti |
| Test | test sayisi + aciklama | Beklenen testler |

---

## Sprint Lifecycle — Sprint Yasam Dongusu (run, eskiden "sprint")

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

> **Tam araç listesi (48 araç) koddan otomatik türetilir — bkz. `docs/reference/mcp-tools.md`** (`npm run docs:ref`).
> Eskiden burada duran el-yazımı tablo **drift etmişti** (33 vs 35 vs 46); canonical generated referans tek-kaynaktır.
> Araç adları yukarıdaki `## MCP Integration` bölümünde listelenir; somut parametre örnekleri aşağıdadır.

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

Bu tablo bundled offline catalog'dan örnekler gösterir; sabit bir allowlist değildir.
Canonical kimlik `id === apiId`'dir. Güncel catalog presence için `deckent models list`,
gerçek kullanılabilirlik için ayrıca auth/backend/model reachability ve limit evidence kontrol edilir.

| Deger | Provider | Tier | Kullanim |
|-------|----------|------|---------|
| `claude-fable-5` | Claude | Premium+ | Karmasik mimari, kritik karar, multi-file refactor |
| `claude-opus-4-8` | Claude | Premium | Karmasik uygulama ve denetim |
| `claude-sonnet-5` | Claude | Standard | Genel gelistirme, bug fix, test yazimi |
| `claude-haiku-4-5-20251001` | Claude | Economy | Dokumantasyon ve dusuk-riskli degisiklik |
| `o3` | Codex | Premium+ | En yuksek seviye reasoning |
| `gpt-5.6-sol` | Codex | Premium | Cross-verify ve kapsamli reasoning |
| `gpt-5.6-terra` | Codex | Standard | Genel gelistirme ve reasoning |
| `gpt-5.6-luna` | Codex | Economy | Dusuk-maliyetli reasoning |
| `gpt-5.5` | Codex | Premium | Karmasik gorevler |
| `gpt-4.1` | Codex | Standard | Genel gelistirme |
| `o4-mini` | Codex | Standard | Hafif reasoning modeli |
| `gpt-5-mini` | Codex | Economy | Dusuk-maliyetli gorevler |
| `gpt-4.1-mini` | Codex | Economy | Dusuk maliyetli genel kullanim |
| `gemini-3.1-pro-preview` | Gemini | Premium+ | En yuksek seviye Gemini (preview) |
| `gemini-2.5-pro` | Gemini | Premium | Karmasik gorevler |
| `gemini-2.5-flash` | Gemini | Standard | Genel gelistirme |
| `gemini-2.0-flash` | Gemini | Economy | Dusuk-maliyetli gorevler |
| `vendor/model-id` | OpenRouter | Catalog/probe belirler | Exact vendor/model API ID; pricing evidence olmadan remote admission yok |
| `name:tag` | Ollama | Registry/inference belirler | Local model tag'i; canli endpoint ve model varligi ayrica dogrulanir |

### Tier

| Tier | Aciklama | Ornek Modeller |
|------|----------|----------------|
| `premium_plus` | En yuksek seviye, ileri reasoning | claude-fable-5, o3, gemini-3.1-pro-preview |
| `premium` | Karmasik gorevler, mimari kararlar | claude-opus-4-8, gpt-5.6-sol, gpt-5.5, gemini-2.5-pro |
| `standard` | Genel gelistirme, dengeli maliyet | claude-sonnet-5, gpt-5.6-terra, gpt-4.1, o4-mini, gemini-2.5-flash |
| `economy` | Basit gorevler, dusuk maliyet | claude-haiku-4-5-20251001, gpt-5.6-luna, gpt-5-mini, gpt-4.1-mini, gemini-2.0-flash |

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

| Deger | Execution surface | Admission notu |
|-------|-------------------|---------------|
| `claude` | Claude CLI; backend config'e gore Docker/tmux/subprocess | Session/API auth ve exact model reachability dogrulanir |
| `codex` | Codex CLI adapter | Auth, exact model reachability, limit ve budget evidence gerekir |
| `gemini` | Gemini CLI adapter | Auth, exact model reachability, limit ve budget evidence gerekir |
| `ollama` | Local Ollama adapter | Local endpoint ve exact model tag'i canli olmali |
| `openrouter` | OpenRouter API adapter | Exact `vendor/model` ID ve pricing evidence gerekir |

Brain, Worker ve Auditor icin fallback sirasi ayri tanimlanabilir:

```json
{
  "providers": {
    "brain": "claude",
    "worker": "codex"
  },
  "provider_fallback": {
    "brain": ["codex", "gemini"],
    "worker": ["claude", "openrouter"],
    "auditor_provider": "codex",
    "auditor": ["claude", "gemini"],
    "global": ["ollama"],
    "unattended": false
  }
}
```

Per-role zincir varsa global zincirin yerini alir; primary zincirden cikarilir ve
duplicate'ler configured order korunarak tekillestirilir. Bu config yalniz aday
sirasini tanimlar: bilinmeyen/stale limit veya kanitsiz reachability unattended
fallback'i available yapmaz.

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

## Built-in Agents (örnek — toplam 20, tam liste: `docs/reference/agents.md`)

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

## Built-in Skills (örnek — toplam 31, tam liste: `src/core/builtins/skills/`)

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
