# Deckent Nedir?

> Sürüm: v1.0.0-beta.1 | Sprint: 285+ | Node.js ≥ 24 | Lisans: MIT

---

## 1. Ürün Tanımı

Deckent, **AI destekli sprint orkestrasyon sistemi**dir. Birden fazla AI ajanını (Brain, Worker, Auditor) koordine ederek yazılım projelerinde PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP yaşam döngüsünü yönetir.

**Ne yapar:**
- Proje hedeflerini (DIRECTIVES.md) okur, AI planlama ile görevlere (task) böler
- Her göreve uygun model, agent ve skill atar; wave tabanlı bağımlılık sıralama uygular
- Docker, tmux veya subprocess backend üzerinden paralel worker'lar spawn eder
- Auditor süreci her 30s'de heartbeat, kapsam ihlali, kilit ve protokol kontrolü yapar
- Sprint sonunda değerlendirme (GO/NO_GO/GO_WITH_TECH_DEBT), retrospektif ve SQLite bellek yönetimi
- Multi-provider fleet (Claude, Codex, Gemini, Ollama + OpenAI-uyumlu HTTP) ile cost-optimized yürütme

**Native-Agent Yönü (Deneysel):**
Deckent aynı zamanda doğal dil arayüzü yönünde gelişmektedir. Argümansız çalıştırılan `deckent` komutu Ink tabanlı native REPL'i açar; `--native` bayrağıyla agentic tool-use akışı devreye girer. Tur-içi araç kuyruğu ve onay modu (sprint-285) sprint döngüsü dışında da ajan etkileşimi sağlar. Native-agent modu deneysel ve opt-in'dir (`DECKENT_NATIVE_AGENT` / `--native`).

**Ne DEĞİLDİR:**
- Bir AI modeli değil — Claude/Codex/Gemini/Ollama'yı araç olarak kullanır
- Bir IDE eklentisi değil — terminal (CLI) ve HTTP API tabanlıdır
- Bir CI/CD aracı değil — geliştirme sürecinde, developer önünde çalışır

---

## 2. Çalışma Modeli

### Sprint Yaşam Döngüsü (8 Faz)

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

| Faz | Yapan | Açıklama |
|-----|-------|----------|
| PLAN | Brain | DIRECTIVES.md okunur, AI/structured planlama, wave bağımlılık sıralaması (Kahn topolojik) |
| SPAWN | Brain | Worker'lar Docker/tmux/subprocess ile başlatılır, Auditor scan döngüsü başlar |
| EXECUTE | Worker | Görevler yürütülür: claim→lock→kod-yaz→test→heartbeat→result |
| EVALUATE | Brain | GO / NO_GO / GO_WITH_TECH_DEBT kararı, rubric scoring, borç kaydı |
| FIX | Brain + Worker | Başarısız görevler yeniden denenir (maks. 2 deneme) |
| RETRO | Brain | Retrospektif, sprint log ve öğrenmeler SQLite DB'ye yazılır |
| DECAY | Brain | `.brain/` bellek bütçesi (900 satır) aşıldıysa eski kayıtlar temizlenir |
| CLEANUP | Brain | Task dosyaları arşivlenir, kilitler serbest bırakılır, sprint tamamlanır |

### Dependency-Pipeline (Wave Yürütme)

`dependency_pipeline_enabled: true` (varsayılan) ile Kahn topolojik algoritması görevleri bağımlılık dalgalarına (wave) sıralar. Her dalga paralel çalışır, bir sonraki dalga yalnızca önceki dalganın bitmesi beklenmez — DONE veya MANUAL_REVIEW_REQUIRED görevler bir sonraki dalgayı açar (ADR-045, ADR-064 TOPP).

---

## 3. Ana Özellikler

### Memory V2 — DB-First (ADR-088)

Tüm proje belleği SQLite tabanlıdır. FTS5 tam-metin arama ile Türkçe/İngilizce dual-layer normalizasyon desteklenir.

- **Depolama:** `.brain/memory.db` (SQLite, 5 tablo + FTS5 sanal tablo)
- **Şema:** `entries`, `tags`, `relations`, `entry_history`, `schema_version` + FTS5 indeks
- **Arama:** `deckent recall "<sorgu>"` — %100 TR/EN/DE geri çağırma oranı
- **Dışa aktarma:** `.brain/exports/` — `summary.md`, `decisions.md`, `memory.md`, `debt.md`

### ADR Yönetimi (89 ADR, ADR-036)

Proje mimarisi 89 Architecture Decision Record ile yönetilir. Tüm worker'lara PLAN aşamasında ilgili ADR'ler enjekte edilir; ihlal → NO_GO + ADR değişiklik önerisi.

### Nervous System — Proaktif Meta-Orkestratör (ADR-040)

`nervous/` katmanı bağımsız bir gözlemci olarak çalışır: observer → detector-registry → decision-engine → proposer → dispatcher → executor → authority-matrix → history. 12 detector ile stale worker, kapsam çakışması, token spike, build başarısızlığı gibi sinyaller algılanır. Nervous onayları `deckent nervous accept/reject` veya MCP üzerinden yönetilir.

### Autonomous Engine (ADR-071)

Varsayılan kapalı (`autonomous.enabled: false`), opt-in otonom motor:

- **Tekrarlayan işler:** 5-alanlı cron kadansı (`--cron "0 3 * * *"`)
- **Kendi kendine iş üretimi:** Aktif teknik borçtan backlog adayı üretir (opt-in)
- **Capability broker:** `kind=capability` girdileri ile dosya, HTTP, DB ve mail işlemleri
- **RBAC politikası:** `autonomous.rbac_policy` ile izin sınırı; viewer rolü makine-başlatmalı işi reddeder
- **Denetim:** Hash-zincirli audit trail + SIEM NDJSON dışa aktarma

### Evolution Pipeline (ADR-075)

Görev sonuçlarına göre agent/skill etkinliği izlenir; yeterli kanıta sahip geçici agent/skill'ler kalıcı havuza taşınır (promote), başarısızlar düşürülür (demote). Outcome-tracker sinerjik kombinasyonları öğrenir.

### Multi-Provider Fleet

| Provider | Modeller | Tier Karşılığı |
|----------|----------|----------------|
| Claude | claude-fable-5, claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5 | premium_plus / premium / standard / economy |
| Codex | o3, gpt-5.5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini | premium_plus / premium / standard / standard / economy / economy |
| Gemini | gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | premium_plus / premium / standard / economy |
| Ollama | yerel modeller | (REPL/chat çalışır; sprint-worker kısmen desteklenir) |
| OpenAI-uyumlu | herhangi HTTP endpoint | custom tier |

Per-task provider override, fallback zinciri ve cost-gate ile maliyet yönetimi desteklenir.

---

## 4. Mimari Bileşenler

| Katman | Dizin | Rol |
|--------|-------|-----|
| **Orchestra** | `src/orchestra/` | Sprint lifecycle, planlama, yönlendirme, değerlendirme (94 modül) |
| **Core** | `src/core/` | Tipler, config, agent/skill pool, model registry, memory, routing engine (148 modül) |
| **Agents** | `src/agents/` | Worker yürütme, adaptive-agent, heartbeat (25 modül) |
| **Nervous** | `src/nervous/` | Proaktif meta-orkestratör, 12 detector, authority-matrix (14 modül) |
| **Monitor** | `src/monitor/` | Auditor scan döngüsü, dashboard manager, sprint state (5 modül) |
| **Connectors** | `src/connectors/` | Discord, Telegram, WhatsApp adaptörleri; incoming router; chat-bridge (16 modül) |
| **Providers** | `src/providers/` | Claude, Codex, Gemini, Ollama, OpenAI-uyumlu adaptörleri (7 modül) |
| **API** | `src/api/` | HTTP API sunucusu, SSE, rate limiter, enterprise endpoint'ler (18 modül) |
| **MCP** | `src/mcp/` | 37 araç + 8 kaynak; stdio transport (46 modül) |
| **CLI** | `src/cli/` | 55+ komut, helpers, REPL giriş noktası (89 komut dosyası) |
| **Dashboard** | `src/dashboard/` | React + Vite + Tailwind web arayüzü (16 sayfa) |

**Tek Yönlü Bağımlılık (ADR-008):** Yalnızca `sprint-controller` tmux/auditor/worker modüllerini import eder. `planner` yalnızca `core/`'dan okur; Auditor ve Worker task dosyaları üzerinden haberleşir.

---

## 5. Arayüz Yüzeyleri

### CLI (55+ Komut)

Sprint yönetimi, memory, agent/skill, autonomous, nervous, checkpoint, config, dashboard, serve ve REPL komutları dahil. Tam liste: `deckent --help` veya `docs/reference/cli-commands.md`.

**Temel sprint akışı:**
```bash
deckent init            # Proje başlat
deckent plan            # Sprint planla (AI veya structured)
deckent start           # Sprint başlat
deckent status --watch  # Canlı izle
deckent retro           # Retrospektif gör
deckent recall "sorgu"  # Belleği ara
```

### MCP (37 Araç + 8 Kaynak)

`claude mcp add deckent -- npx deckent-mcp` ile Claude Code'a eklenir. Sprint lifecycle, memory query, status, docs, audit, nervous ve autonomous araçları dahil. Tam liste: `docs/reference/mcp-tools.md`.

MCP kaynakları: `deckent://dashboard`, `deckent://directives`, `deckent://memory`, `deckent://debt`, `deckent://config`, `deckent://retro`, `deckent://tasks`, `deckent://agents`

### Dashboard (16 Sayfa)

`deckent serve` ile başlatılan React tabanlı web arayüzü. Sayfalar: Dashboard, Chat, Config, Debt, Directives, Enterprise, Evolution, History, Login, Memory, MemoryExplorer, Nervous, Settings, Status, Workers, Callback.

### HTTP API

`src/api/server.ts` — varsayılan port 3100, bind 127.0.0.1. GET/POST endpointleri: sprint yönetimi, status, events (SSE), memory, auth (OIDC + static token), enterprise, evolution, nervous. `Authorization: Bearer <token>` ile kimlik doğrulama.

---

## 6. Agent ve Skill Havuzu

### 15 Yerleşik Agent

| Agent | Uzmanlık Alanı |
|-------|----------------|
| security-auditor | Güvenlik açıkları, OWASP, auth |
| doc-writer | README, JSDoc, API docs, changelog |
| bug-fixer | Hata ayıklama, regression, hotfix |
| code-reviewer | Kod kalitesi, best practices |
| refactorer | Yeniden yapılandırma, temizlik |
| api-builder | REST API, OpenAPI, endpoint tasarımı |
| performance-analyzer | Profiling, optimizasyon, benchmark |
| ci-guardian | CI/CD sağlık, test regresyon, build |
| architect | Sistem tasarımı, modül yönetimi |
| architecture-planner | Mimari planlama, ADR yazımı |
| accessibility-auditor | WCAG, a11y, erişilebilirlik denetimi |
| data-engineer | Veri pipeline, ETL, veri modeli |
| devops-engineer | CI/CD, Docker, deployment |
| frontend-designer | UI/UX, component tasarımı |
| migration-specialist | Versiyon geçişi, framework migration |

### 21 Yerleşik Skill

`typescript-expert`, `testing-expert`, `documentation-writer`, `security-specialist`, `performance-optimizer`, `api-builder`, `devops-engineer`, `database-migration`, `react-specialist`, `python-expert`, `ci-testing`, `accessibility-expert`, `anthropic-sdk`, `code-simplifier`, `docker-expert`, `frontend-design`, `git-expert`, `graphql-expert`, `migration-expert`, `monorepo-expert`, `system-architect`

---

## 7. Güvenlik Modeli

- **Kapsam zorlama:** Worker'lar yalnızca `scope.filesWrite` ve `scope.directories` içine yazar. Auditor `git diff --stat` ile her 30s kontrol eder (ADR-037 advisory/soft; hard-flip V2 sonrası).
- **Dosya kilitleme:** Atomik lock dosyaları (O_EXCL) ile race condition önlenir. Stale lock (>5dk) Auditor tarafından uyarılır.
- **Authority matrix:** Brain/Auditor/Worker için 5 kilitli eylem safety-floor'u (ADR-037).
- **Spawn güvenliği:** allowlist tabanlı CLI parametre doğrulaması; Docker container izolasyonu.
- **Cost-gate:** Sprint öncesi maliyet tahmini ve bütçe aşımı kontrolü.
- **HTTP auth:** RS256 JWT (OIDC) veya static token; 127.0.0.1 binding.

---

## 8. Mevcut Durum

| Metrik | Değer |
|--------|-------|
| Sürüm | v1.0.0-beta.1 |
| Node.js | ≥ 24.0.0 |
| Platform | macOS, Linux, WSL2 |
| Test sayısı | 20.668+ (88.58% coverage) |
| MCP araç | 37 |
| MCP kaynak | 8 |
| CLI komut | 55+ |
| Dashboard sayfası | 16 |
| Yerleşik agent | 15 |
| Yerleşik skill | 21 |
| Provider | 4 (Claude/Codex/Gemini/Ollama) + OpenAI-uyumlu |
| Model | 14 (4 tier) |
| ADR | 89 |

### Kurulum

```bash
npm install -g deckent
deckent init
deckent plan
deckent start
```

Tam kurulum kılavuzu: `docs/guide/installation.md`
