# deckent — Product and Runtime Reference

## Identity
Canonical ürün kimliği ve execution-authority tanımı: `.deckent/workspace/IDENTITY.md`.
`@file` import çözmeyen host'lar bu dosyayı doğrudan açıp okur.

> **Aktif yön kararları taşındı** — bu iç-pivot notu artık `.analysis/hermes-vs-deckent-direction-decisions.md`
> içinde tutuluyor (CLAUDE.md operating_rules'ta da özetlenir); DECKENT.md yalnız mekanik/işlevsel
> referans kalır, tekrar-eden iç-strateji notu barındırmaz.

## Rules
- Canonical authority chain Goal → Mission → Flow → Run → WorkItem → Attempt → Operation'dır; Brain bu authority'yi supervise eder, worker kendi scope veya authority'sini genişletemez
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Her run typed terminal veya resumable settlement'a ulaşır; `PAUSED`/`HOLD` geçerli durumlar, belirsiz/stale `running` değildir
- `DIRECTIVES.md` is the binding execution contract for an active run after owner/system instructions
- Runtime limits and retention budgets come from effective config; this document does not freeze live values

## Providers
- Deckent's product contract is provider-neutral. Provider identities and adapters are discovered from effective config + the runtime registry; this file is not a provider catalog
- Brain/worker/auditor provider, exact model, effort and backend are resolved per role from effective config, registry and capability evidence
- Role-aware fallback: `provider_fallback.brain|worker|auditor` → `provider_fallback.global` → legacy single `fallback_provider`; `provider_fallback.auditor_provider` selects the Auditor primary
- Configured order is authoritative, but fallback is never an availability claim: auth, backend/model reachability, limit evidence and execution-budget admission must still pass
- Model Registry: live/cached catalog plus bundled offline fallback — `src/core/model-registry.ts`; inspect with `deckent models list`
- Runtime model identity is the exact registered provider API ID (`id === apiId`); aliases are migration inputs only and are rejected in authored tasks
- Provider-agnostic selection uses `model_strategy.brain_tier` / `model_strategy.worker_tier`; tier resolution returns a registered exact API ID
- Planning mode: brain_planning = 'ai' | 'structured' | 'auto'

## Agents & Skills
- Canlı agent listesi `docs/reference/agents.md` ve `deckent agents`; canlı skill listesi registry/`deckent skills` yüzeyidir. Bu belgede sayı tutulmaz
- Agent pool: `.deckent/agents/*/agent.json`; retention/eviction effective config ve policy'den çözülür
- Skill registry: .deckent/skills/*/skill.json — AST sandbox validation
- Task routing: task-router.ts assigns agent + skills + provider per task

## MCP Integration
- Tool/resource sayıları bu belgede tutulmaz. Canonical canlı liste koddan auto-generated
  `docs/reference/mcp-tools.md` içindedir (`npm run docs:ref`)
- MCP server entrypoint provider/host bağımsızdır: `npx deckent-mcp`; registration şekli seçili
  host adapterının capability/config yüzeyinden gelir

## Memory V2 — DB-First Architecture
- **Storage:** SQLite (better-sqlite3) — single source of truth, .md files are generated exports
- **Search:** FTS5 full-text search with dual-layer Turkish normalize (TR/EN/DE %100 recall)
- **Product/user memory authority:** `.brain/memory.db` (gitignored; asla routine cleanup hedefi değildir)
- **Deckent-dev dogfood core-memory authority:** `.deckent/docs/core-memory/MEMORY.md` + aynı dizindeki referanslar; product memory değildir
- **Exports:** `.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` (git-tracked)
- **Schema:** 5 tables (entries, tags, relations, entry_history, schema_version) + FTS5 virtual table
- **Brain auto-query:** Task DNA → ilgili ADR/pattern/memory otomatik sorgulanır (PLAN, SPAWN, EVALUATE)
- **CLI:** `deckent recall "sorgu"`, `deckent remember "not"`, `deckent memory rebuild|export|stats`
- **MCP:** `deckent_memory_query` tool — cross-source hafıza arama
- **Config:** `.deckent/config.json` → `memory.backend`, `memory.search`, `memory.decay_after_sprints`

## Mandatory Architecture Rules
Generated canlı durum projection'ı: `.brain/exports/summary.md` (gerektiğinde doğrudan oku;
runtime authority değildir).

## Architecture Decision Records
- `.brain/memory.db` = accepted ADR authority; `docs/adr/*.md` ve `.brain/exports/decisions.md` review/search projectionlarıdır
- `.deckent/decisions/*.json` = **SDL** (Sprint Decision Log) — tactical decisions, audit trail, optional
- Dependency execution davranışı effective config'ten okunur; dependency-aware scheduling
  ADR-G-026'ya, manuel dogfood recovery yalnız ADR-D-007'ye tabidir. Bu belge canlı
  boolean/default veya worker sayısı stamp etmez

## Context
- `DIRECTIVES.md` — yalnız DIRECTIVES-backed aktif run için bağlayıcı execution contract
- `.brain/exports/summary.md` — generated status/knowledge projection
- `docs/reference/api-surface.md` — transport ve runtime contract haritası

## Environment
Build: `npm run build` (tsc + copy-assets) | Full: `npm run build:all` (+ dashboard vite) | Dev: `npm run dev` (tsc --watch)
Test: `npm test` (vitest run) | Watch: `npm run test:watch` | Coverage: `npm run test:coverage` | Dashboard: `npm run test:dashboard`
Lint: `npm run lint` (tsc --noEmit) | ADR: `npm run lint:adr` | Errors: `npm run lint:errors` | Links: `npm run lint:link`

## Boot
Bootstrap rehberi: `.deckent/workspace/BOOT.md` (host import çözmüyorsa doğrudan aç-oku).

---

## Workflow Guide — Is Akisi Rehberi

Deckent'in Goal → Mission → Flow → Run authority zinciri çeşitli adapter yüzeylerinden
yürütülebilir. Aşağıdaki sprint akışı, DIRECTIVES-backed CLI/MCP adapterının compatibility
workflow'udur; ürünün bütünü veya tek execution authority'si değildir:

1. **`deckent_init`** — Projeyi başlat. `.deckent/`, `.brain/`, `.tasks/` dizinlerini ve seçili host adapterının provider-neutral kural/reference projection'larını oluşturur. Desteklenen her environment/project scope'unda bir kez çalıştırılır.

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
- Model: <exact-registered-model-api-id>
- Provider: <registered-provider-id>
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
- Model: <exact-registered-model-api-id>
- Provider: <registered-provider-id>
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
| Model | Kayıtlı tam provider API ID | Kullanılacak exact model; legacy alias'lar reddedilir, canlı katalog için `deckent models list` |
| Provider | Kayıtlı provider ID | Bu task'ı hangi provider adapterı koşsun (per-task override; erişilebilirlik kanıtı değildir) |
| Effort | low, normal, high | Tahmini **is YUKU** (timeout/butce/token-tahmin). Reasoning-derinligi DEGIL — onun icin ModelEffort |
| ModelEffort | Adapter capability'sinin kabul ettiği değer | Modelin **reasoning DERİNLİĞİ**; supported değer registry/adapter metadata'sından gelir. Effort (iş-yükü) ile karıştırma |
| Backend | Kayıtlı execution-backend ID | Task'ı belirli backend'e zorlar; provider/backend compatibility ve capability admission ayrıca doğrulanır |
| Auth | Kayıtlı auth-mode ID | Per-task auth modu; gerekli credential/entitlement adapter contractından çözülür |
| Skills | skill-id listesi | Uzmanlik alani (virgul ile ayir) |
| Files | dosya yollari | Degistirilecek dosyalar |
| Scope | dizin yollari | Izin verilen dizinler |
| Kanit | shell komutu | Tamamlanma kaniti |
| Test | test sayisi + aciklama | Beklenen testler |

---

## Sprint Lifecycle — Sprint Yasam Dongusu (run, eskiden "sprint")

Bir sprint 8 fazdan olusur:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → COMPLETE  <!-- cleanup = komut, faz değil (SprintPhase enum; hizalama 2026-08-01) -->
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
// mode: "ai" → registered provider/model ile LLM-assisted planlama
// mode: "structured" → Kural tabanli, deterministik
// mode: "auto" → Proje boyutuna gore otomatik sec

// deckent_start
{ sprintId: "sprint-001", dryRun: false, root: "/path/to/project" }

// deckent_status
{ watch: false, json: false, root: "/path/to/project" }

// deckent_config
{ action: "read", root: "/path/to/project" }
{ action: "set", key: "max_workers", value: "<positive-integer-or-auto>", root: "/path/to/project" }

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

Model adları ve catalog üyeleri bu dosyada tutulmaz. Canonical kimlik `id === apiId`'dir.
Güncel catalog presence için `deckent models list`; gerçek kullanılabilirlik için auth/account,
backend/model reachability, entitlement, limit ve finite-budget evidence birlikte doğrulanır.
Authored task exact registry ID kullanır; tier-based seçim exact ID'yi runtime'da çözer.

### Tier

| Tier | Aciklama |
|------|----------|
| `premium_plus` | En yüksek capability sınıfı; exact model registry'den çözülür |
| `premium` | Karmaşık görev/mimari sınıfı; exact model registry'den çözülür |
| `standard` | Genel geliştirme sınıfı; exact model registry'den çözülür |
| `economy` | Düşük-maliyet/düşük-risk sınıfı; exact model registry'den çözülür |

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

Provider listesi registry/effective config'ten gelir. Her provider adapterı aynı contractı
karşılar: exact identity, auth/account, reachability, entitlement/limit, usage/metering,
execution backend, settlement ve gerektiğinde landing capability. Eksik capability sessiz
fallback değil typed `HOLD/UNSUPPORTED` üretir.

Brain, Worker ve Auditor icin fallback sirasi ayri tanimlanabilir:

```json
{
  "providers": {
    "brain": "<registered-provider-id>",
    "worker": "<registered-provider-id>"
  },
  "provider_fallback": {
    "brain": ["<registered-fallback-id>"],
    "worker": ["<registered-fallback-id>"],
    "auditor_provider": "<registered-provider-id>",
    "auditor": ["<registered-fallback-id>"],
    "global": ["<registered-fallback-id>"],
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
deckent config set max_workers <positive-integer-or-auto>
deckent config set providers.brain <registered-provider-id>
deckent config set routing_engine <registered-routing-engine-id>
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
# Seçilen host adapterının documented MCP restart/reconnect akışını uygula
```

---

## Built-in Agents (temsili alt-küme; canlı liste: `docs/reference/agents.md`)

> ADR-G-023: Agent/skill taxonomy; test görevi task-bazlı yönetilir.

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

## Built-in Skills (temsili alt-küme; canlı liste: registry + `src/core/builtins/skills/`)

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
| `code-simplifier` | Kod sadestirme, karmasiklik azaltma, temizlik |
| `docker-expert` | Dockerfile, compose, container optimizasyon |
| `frontend-design` | UI component, CSS, responsive tasarim |
| `git-expert` | Git is akisi, branch stratejisi, merge yonetimi |
| `graphql-expert` | GraphQL schema, resolver, subscription |
| `migration-expert` | Framework gecisi, versiyon yukseltme, API migration |
| `monorepo-expert` | Monorepo yonetimi, workspace, paket bagimliliklari |
| `system-architect` | Sistem mimarisi, tasarim desenleri, olceklenebilirlik |
