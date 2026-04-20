# DECKENT ANA PLAN
## Yapay Zeka Ajan Orkestrasyon Sistemi — Tam Uygulama Referansı
### Versiyon 3.0 — Nisan 2026 — Beta GA

---

# İÇİNDEKİLER

1. Ürün Kimliği ve Vizyon
2. Mimari Genel Bakış
3. Yerel CLI ve Kurulum
4. Çalışma Alanı Yapısı
5. Ajan Sistemi (Brain, Auditor, Worker)
6. Bellek Mimarisi — Memory V2 DB-First
7. Sprint Yaşam Döngüsü ve Orkestrasyon
8. GO / NO-GO / Teknik Borç Protokolü
9. Kullanım-Duyarlı Planlama
10. Dinamik Terminal ve Backend Yönetimi (tmux / Docker / subprocess)
11. Eklenti ve Yetenek Sistemi
12. Kullanıcı Arayüzü (Terminal → Web → VSCode)
13. Çoklu Plan ve Maliyet Yönetimi
14. i18n ve Çoklu Dil
15. Güvenlik ve İzinler
16. Otomatik Test ve Raporlama
17. Depo Stratejisi
18. Dosya Referansı
19. Uygulama Geçmişi
20. Claude Code Entegrasyon Rehberi
21. MCP Sunucu Mimarisi
22. Kullanıcı Akışları
23. Stratejik Yol Haritası
24. Sprint Geçmişi
25. Memory V2 DB-First Mimarisi
26. ADR Governance — Mimari Karar Yönetişimi
27. Adaptive Timeout Sistemi
28. Unified Native Observability
29. Cost Management Sistemi

---

# 1. ÜRÜN KİMLİĞİ VE VİZYON

**Ad:** Deckent (Deck + Agent)
**Domain:** deckent.agency
**Slogan:** "Yapay zeka geliştirme ekibiniz, orkestre edilmiş."
**Yazar:** Alperen @ Verhex
**Versiyon:** 0.4.0-beta.1
**Sprint:** 145 (Nisan 2026)

**Deckent Nedir:**
Ajan-agnostik bir yapay zeka orkestrasyon sistemi. Hedeflerinizi doğal dille tanımlarsınız — Claude Code konuşmasında veya DIRECTIVES.md ile. Deckent planlar, görev atar, izler ve geliştirme işlerini paralel çalışan birden fazla yapay zeka ajanıyla tamamlar. Sistem her sprint'ten öğrenir ve zamanla gelişir.

**Deckent Ne Değildir:**
- Başka bir ChatGPT sarmalayıcı değil
- Basit bir görev çalıştırıcı değil
- Claude ile sınırlı değil (çoklu sağlayıcı: Claude, OpenAI Codex, Gemini — Sprint 038'den beri aktif)
- Bir SaaS servisi değil — yerel ürün (ADR-033)

**Temel İlkeler:**
1. Yerel-öncelikli — CLI aracı olarak kurulur, MCP ile Claude Code'a entegre olur
2. Kendini geliştiren — hatalardan öğrenir, planları iyileştirir, kalıplara uyum sağlar
3. Gözlemlenebilir — her ajanın eylemi gerçek zamanlı görünür (Event Stream + JSONL)
4. Kullanım-duyarlı — plan limitlerini asla aşmaz, sprint'leri asla yarım bırakmaz
5. Plan-uyumlu — Performance ($200), Balanced ($100), Economic ($20) veya API ile çalışır
6. Sıfır-sürtünme — doğal dil girdi, orkestre edilmiş sprint çıktı
7. Açık kaynak — topluluk-destekli, eklentiler/yeteneklerle genişletilebilir
8. Ürün, servis değil — verileriniz makinenizde kalır, bulut bağımlılığı yok (ADR-033)

**USP (Benzersiz Satış Noktası):**
Sprint + öğrenme döngüsü. Deckent sadece görevleri yürütmez — sprint'ler planlar, sonuçları GO/NO-GO protokolüyle değerlendirir, teknik borcu takip eder, retrospektif yapar ve öğrendiklerini sonraki sprint'e aktarır. Her sprint sistemi daha akıllı yapar. Memory V2 ile tüm bilgi SQLite veritabanında yapılandırılmış olarak saklanır ve FTS5 tam metin araması ile sorgulanır.

**Aşamalı Yol Haritası:**
| Aşama | Odak | Hedef Kitle | Sprint Aralığı |
|-------|------|-------------|----------------|
| 1 | Claude native (CLI + MCP) | Solo geliştiriciler | Sprint 1-8 |
| 2 | Sağlayıcı soyutlama katmanı | Erken benimseyenler | Sprint 9-12 |
| 3 | Çoklu sağlayıcı (OpenAI, Gemini) | Küçük takımlar | Sprint 13-38 |
| 4 | Platform (Web UI, API, çoklu backend) | Geliştiriciler | Sprint 39-100 |
| 5 | Olgunlaşma (RBAC, Observability, Memory V2) | Kurumsal | Sprint 101-150+ |

**İlham Kaynakları:**
- OpenClaw: çalışma alanı yapısı, bellek katmanları, yetenek sistemi, AGENTS.md kalıbı
- Claude Cowork: ajantik döngü, planla→yürüt→doğrula, eklenti mimarisi
- Claude Code: CLAUDE.md, .claude/rules/, headless mod, MCP, Agent Teams

---

# 2. MİMARİ GENEL BAKIŞ

```
┌─────────────────────────────────────────────────────┐
│               SİZ (Doğal Dil)                        │
│     Claude Code konuşması / DIRECTIVES.md            │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐  ┌───────────▼───────────────┐
│    CLAUDE CODE       │  │      DECKENT CLI           │
│  (MCP istemci)       │  │  `deckent start/plan/web`  │
└──────────┬──────────┘  └───────────┬───────────────┘
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              DECKENT MCP SUNUCU (stdio)              │
│  22 Araç + 8 Kaynak                                 │
│  init | plan | start | status | memory_query | ...  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 ÇEKİRDEK MOTOR                       │
│  brain.ts | planner.ts | auditor.ts | worker.ts     │
│  analyzer.ts | tmux.ts | server.ts (HTTP API)       │
│  event-stream.ts | memory-store.ts (SQLite)         │
└──────────┬───────────────────────────┬──────────────┘
           │                           │
┌──────────▼──────────┐  ┌────────────▼──────────────┐
│  BRAIN + PLANNER     │  │        AUDITOR             │
│  Planlar (AI/yapısal)│  │  Brain içinde tarama döng. │
│  değerlendir, öğren  │  │  runSprint içinde (30sn)   │
│  Model: opus/sonnet  │  │  3-Pipeline Verification   │
└──────────┬──────────┘  └────────────┬──────────────┘
           │                           │
┌──────────▼──────────────────────────▼──────────────┐
│              WORKER HAVUZU (dinamik)                  │
│  3 Backend: tmux / Docker / subprocess               │
│  Her worker: planla → kodla → test et → belgele      │
│  Model: görev başına (opus/sonnet/haiku)             │
│  16 yerleşik ajan + 21 yetenek                       │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│            BELLEK SİSTEMİ — Memory V2                │
│  SQLite DB (.brain/memory.db) — tek doğruluk kaynağı│
│  FTS5 tam metin arama + turkishNormalize             │
│  8 entry tipi: adr, memory, sprint, debt, pattern,  │
│  retro, error, identity                              │
│  Exports: .brain/exports/*.md (git-tracked)          │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│         EVENT STREAM — Unified Observability          │
│  Append-only JSONL (.deckent/sprint-NNN-events.jsonl)│
│  ADR-035 Protocol V1.0 — 15 kanal kodu              │
│  In-process EventBus (pub/sub) + cross-process watch │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│          HTTP API + WEB DASHBOARD                    │
│  src/api/server.ts — 16 uç nokta + SSE             │
│  src/dashboard/ — React+Vite+Tailwind (6 sayfa)     │
│  `deckent web` → localhost:3100                     │
└─────────────────────────────────────────────────────┘
```

**Kimlik Doğrulama Zinciri:**
```
Claude Code → MCP stdio (yerel süreç, ek auth yok)
  → Çekirdek Motor → Sağlayıcı Adaptörü → Spawn Backend → worker süreci
  → Claude modu: Claude Code oturum kimliğini miras alır
  → Codex modu: OPENAI_API_KEY ortam değişkeni
  → Gemini modu: GOOGLE_API_KEY ortam değişkeni
  → API modu: ANTHROPIC_API_KEY ortam değişkeni
```

---

# 3. YEREL CLI VE KURULUM

## 3.1 Kurulum

```bash
# Global kurulum
npm install -g deckent

# Bir projede başlat
cd my-project
deckent init

# Veya sihirbaz ile
deckent onboard
```

## 3.2 CLI Komutları

```
deckent init              Yeni proje için etkileşimli kurulum sihirbazı
deckent onboard           Tam kurulum (global + proje yapılandırması)
deckent start             Tam sprint yaşam döngüsünü çalıştır
deckent plan              Brain sonraki sprint'i planlar (plan modu)
deckent status            Canlı dashboard'u göster
deckent attach            tmux oturumuna bağlan (tüm ajanları gör)
deckent spawn <id>        Manuel olarak worker başlat
deckent kill <id>         Belirli bir worker'ı öldür
deckent retro             Sprint retrospektifini çalıştır
deckent review            Sprint sonucunu değerlendir (GO/NO_GO/TECH_DEBT)
deckent cleanup           Sprint dosyalarını arşivle, worker'ları öldür
deckent doctor            Sistem sağlığını kontrol et (tmux, claude, git, node)
deckent config            Yapılandırmayı göster/düzenle
deckent config set <k> <v> Yapılandırma değeri ayarla
deckent history           Sprint geçmişini ve metrikleri göster
deckent analyze           Proje yığın/boyut/metodoloji analizi
deckent archive-debt      Çözülmüş teknik borcu arşivle
deckent dashboard         Terminal TUI dashboard (zengin mod)
deckent serve             HTTP API sunucusu (SSE)
deckent web               Web dashboard + API sunucusu (localhost:3100)
deckent run               Tek bir task'ı arka planda çalıştır
deckent agent             Agent yönetimi (list, info, stats)
deckent skill             Skill yönetimi (list, info, stats)
deckent plugin install <n> Yetenek/eklenti kur
deckent plugin list       Kurulu eklentileri listele
deckent upgrade           Kendini güncelle
deckent explain           Kavram veya komut hakkında rehberlik
deckent finalize          Sprint sonuçlandırma (retro + decay + cleanup)
deckent quick-start       Hızlı başlangıç (init + plan + start tek komutta)
deckent mcp               MCP sunucuyu başlat (Claude Code için stdio transport)
deckent sync              Adaptör dosyalarını DECKENT.md referansıyla senkronize et
deckent watch             Canlı tmux bölünmüş görünüm: dashboard + worker panelleri
deckent recall <sorgu>    Proje hafızasında arama (Memory V2 FTS5)
deckent remember <not>    Hafızaya yeni kayıt ekle
deckent memory            Hafıza yönetimi (rebuild, export, stats)
deckent cost              Sprint maliyet tahmini göster (çoklu sağlayıcı)
deckent resume            Yarıda kalan sprint'i devam ettir
deckent checkpoint        İnsan onay noktası yönetimi (approve/reject)
deckent docs              Sprint doküman yönetimi (add/remove/list)
deckent output            Worker çıktısını göster
```

**41+ CLI komutu** (+ alt komutlar: plugin install/list/create/remove, config set/read, memory rebuild/export/stats, agent list/info/stats, skill list/info/stats, doctor checks/format)

## 3.3 Sistem Gereksinimleri

```
Gerekli:
  Node.js ≥ 18 (22 önerilir)
  git
  Claude Code CLI (npm install -g @anthropic-ai/claude-code)
  Claude aboneliği (Pro, Max veya API anahtarı)

İsteğe Bağlı:
  tmux (tmux backend için — yoksa subprocess backend kullanılır)
  Docker (Docker backend için — izole container çalıştırma)

Desteklenen İşletim Sistemleri:
  macOS (Intel + Apple Silicon)
  Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch)
  Windows (yerel — subprocess backend, shell:true, UTF-8)
  Windows (WSL2 — tam tmux + Docker desteği)
```

---

# 4. ÇALIŞMA ALANI YAPISI

## 4.1 Proje Düzeyinde

```
my-project/
├── AGENTS.md                          # @DECKENT.md adaptörü
├── CLAUDE.md                          # @DECKENT.md adaptörü (Claude Code için)
├── DECKENT.md                         # Tek gerçek kaynak (ajan yapılandırması)
├── DIRECTIVES.md                      # Operatör komutları (SİZ yazarsınız)
│
├── .deckent/                          # Deckent çalışma alanı
│   ├── config.json                    # Çalışma zamanı yapılandırması
│   ├── agents/                        # Özel ajan tanımları (agent.json)
│   ├── skills/                        # Özel yetenek tanımları (skill.json)
│   ├── decisions/                     # Sprint Decision Log (SDL) — JSON
│   ├── docs.json                      # Managed-docs yapılandırması
│   ├── cost-config.json               # Sağlayıcı fiyatlandırma yapılandırması
│   ├── sprint-*-events.jsonl          # Event stream (append-only)
│   ├── sprint-*-checkpoint.json       # Sprint checkpoint (resume)
│   ├── sprint-*-gate.json             # Auditor sprint gate sonucu
│   └── workspace/                     # Ajan çalışma alanı
│       ├── IDENTITY.md                # Proje kimliği
│       ├── BOOT.md                    # Boot sequence
│       └── WORKER-GUIDE.md            # Worker rehberi
│
├── .brain/                            # Bellek sistemi (Brain + Auditor)
│   ├── memory.db                      # SQLite DB — tek doğruluk kaynağı (gitignored)
│   ├── exports/                       # Git-tracked MD snapshots
│   │   ├── summary.md                 # Otomatik üretilen bağlam özeti
│   │   ├── decisions.md               # ADR listesi
│   │   ├── memory.md                  # Sprint öğrenimleri
│   │   └── debt.md                    # Teknik borç tablosu
│   ├── MEMORY.md                      # Katman 1: her zaman yüklü (~300 satır)
│   ├── RETRO.md                       # Son sprint retrospektifi
│   ├── DEBT.md                        # Teknik borç logu
│   ├── PATTERNS.md                    # Auditor bulguları
│   ├── ERRORS.md                      # Hata logu
│   ├── sprints/                       # Sprint logları
│   └── archive/                       # Derin bilgi arşivi
│
├── .tasks/                            # Geçici görev dosyaları (otomatik temizlenir)
├── .locks/                            # Dosya kilitleri (çalışma zamanı)
├── .dashboard                         # Canlı durum (Auditor tarafından)
│
├── .claude/                           # Claude Code yerel yapılandırma
│   ├── settings.json                  # MCP sunucu kaydı dahil
│   └── rules/                         # Yol kapsamlı kurallar
│       ├── brain.md                   # Brain kuralları (13 kural)
│       ├── auditor.md                 # Auditor kuralları (9 kural)
│       └── worker-default.md          # Worker kuralları (9 kural)
│
├── src/                               # Deckent kaynak kodu
│   ├── core/                         # Tipler, yapılandırma, sabitler, yardımcılar (58 modül)
│   │   ├── types.ts + *-types.ts    # Tüm tip tanımları
│   │   ├── config.ts                # 3 katmanlı yapılandırma birleştirme
│   │   ├── memory-store.ts          # MemoryStore sınıfı — SQLite DB-first
│   │   ├── memory-query.ts          # FTS5 tam metin arama
│   │   ├── memory-normalize.ts      # turkishNormalize() — i18n metin normalizasyonu
│   │   ├── agent-pool.ts            # AgentPoolManager, 16 yerleşik ajan, LRU eviction
│   │   ├── skill-pool.ts            # 21 yerleşik yetenek, sandbox AST doğrulama
│   │   ├── model-registry.ts        # ModelRegistry: 13 model, 3 sağlayıcı, 4 tier
│   │   ├── routing-engine.ts        # Katman 3: routeTaskV2, güven puanlaması
│   │   ├── intent-classifier.ts     # Katman 1: niyet sınıflandırma
│   │   ├── activation-engine.ts     # Katman 2: aktivasyon kuralları
│   │   └── cost-calculator.ts       # Parametrik maliyet hesaplama
│   ├── orchestra/                    # Sprint yaşam döngüsü (65 modül)
│   │   ├── brain.ts                 # Orkestratör (re-export katmanı)
│   │   ├── sprint-controller.ts     # Sprint yaşam döngüsü (209 satır — slim)
│   │   ├── planner.ts              # AI görev planlaması (Zod doğrulamalı)
│   │   ├── task-router.ts          # Sağlayıcı + ajan + yetenek yönlendirme
│   │   ├── result-evaluator.ts     # GO/NO-GO/TECH_DEBT değerlendirme
│   │   ├── event-stream.ts         # Append-only JSONL event log
│   │   ├── event-bus.ts            # In-process pub/sub EventBus
│   │   ├── timeout-watcher.ts      # Adaptive timeout izleme
│   │   ├── timeout-estimator.ts    # Sezgisel timeout hesaplama
│   │   ├── monitor-adapter.ts      # Backend-agnostic izleme
│   │   ├── tmux.ts                  # tmux oturum yönetimi
│   │   ├── spawn-backend.ts        # Subprocess worker backend
│   │   └── spawn-backend-docker.ts # Docker container backend
│   ├── agents/                       # Worker yaşam döngüsü (16 modül)
│   ├── providers/                    # Claude, Codex, Gemini adaptörleri (5 modül)
│   ├── api/                          # HTTP API sunucusu + SSE (3 modül)
│   ├── mcp/                          # MCP sunucu: 22 araç + 8 kaynak
│   ├── cli/                          # 41+ komut, yardımcılar, giriş noktası
│   └── dashboard/                    # React + Vite + Tailwind web dashboard
│       └── src/                     # 6 sayfa, 18 UI bileşeni, SSE
├── tests/                             # 12.485 test, 505 dosya
└── package.json
```

---

# 5. AJAN SİSTEMİ (Brain, Auditor, Worker)

## 5.1 Üç Bileşen Modeli

Deckent üç temel bileşen üzerine inşa edilmiştir. Bu bileşenler Sprint 1'den itibaren var olup Sprint 138-139'da ADR-035 (Verification Protocol) ve ADR-037 (RBAC) ile formal olarak tanımlanmıştır.

### Brain (Orkestratör)
Brain sprint yaşam döngüsünü yönetir: DIRECTIVES.md'yi okur, görev planlar, worker spawn eder, sonuçları değerlendirir. Sprint 136'da sprint-controller.ts 1890→209 satıra indirildi (ADR-024/026 kapanışı). Sprint 134'te Brain Self-Audit Gate eklendi (T-014). Sprint 140'tan itibaren tüm bilgi `.brain/memory.db` SQLite veritabanından sorgulanır.

### Auditor (Doğrulayıcı)
Auditor bağımsız denetleyicidir — kaynak kodu ASLA yazmaz (ADR-037 dokunulamaz kural). Sprint 138'de 3-Pipeline Verification devreye girdi: verifyWorkerResult + verifyFunctional + validateTechDebt. Sprint 139'da ADR compliance kontrolü (checkADRCompliance) eklendi. 30 saniye tarama döngüsüyle heartbeat, scope violation ve stale lock tespiti yapar.

### Worker (Uygulayıcı)
Worker atanan görev kapsamında kod yazar, test çalıştırır ve sonuç raporlar. Sprint 138'de Honest Assessment Calibration v2 ile verify-delta baseline + applyTechDebtDowngrade çift katman eklendi. Sprint 144'te worker.ts dosya bölme girişimi yapıldı (NO_GO — timeout). Worker'lar 3 backend üzerinden çalışabilir: tmux, Docker container, subprocess.

## 5.2 Sprint 130-145 Gelişmeleri

- **Sprint 131:** Managed-Docs ile worker'lar sprint dokümanlarını otomatik güncelleyebilir hale geldi
- **Sprint 132-134:** Task dependency pipeline — worker'lar arası bağımlılık çözümleme
- **Sprint 135:** Coordinator resilience — Brain çökmesinde sprint state korunur
- **Sprint 138:** Event Stream + Verification Protocol — tüm iletişim kanal kodlarıyla yapılandırıldı
- **Sprint 139:** RBAC Protocol V1.0 — her bileşenin yetki sınırları formal olarak tanımlı
- **Sprint 140-143:** Memory V2 ile brain bilgi yönetimi SQLite'a taşındı
- **Sprint 144:** Büyük dosya bölmeleri (init, doctor, retro) — modülerlik artırıldı
- **Sprint 145:** Adaptive timeout + unified observability — worker izleme olgunlaştı

# 6-17. ÇEKİRDEK MODÜLLER VE TEKNİK REFERANS

> Bölüm 6-17 detaylı teknik referans için DECKENT.md ve api-surface.md'ye bakınız.

**v3.0 Temel Değişiklikler (Sprint 23 → Sprint 145):**

- **Memory V2 DB-First** (Sprint 140+): SQLite veritabanı tek doğruluk kaynağı. FTS5 tam metin arama, turkishNormalize dual-layer, %96 bağlam azaltma. `.brain/exports/*.md` dosyaları otomatik oluşturulan snapshot'lar.
- **16 yerleşik ajan** (Sprint 29'dan itibaren genişleme):

| Ajan | Uzmanlık | Aktivasyon Tetikleyicileri |
|------|----------|--------------------------|
| security-auditor | Güvenlik açıkları, OWASP top 10, auth | security, auth, vuln |
| test-writer | Unit test, integration test, coverage | test, spec, coverage |
| doc-writer | README, JSDoc, API docs, CHANGELOG | docs, readme, comment |
| bug-fixer | Hata ayıklama, regression, hotfix | fix, bug, error, crash |
| code-reviewer | Kod kalitesi, best practices, PR review | review, quality |
| refactorer | Yeniden yapılandırma, temizlik, modernizasyon | refactor, cleanup |
| api-builder | REST API, OpenAPI, endpoint tasarımı | api, endpoint, route |
| performance-analyzer | Profiling, optimizasyon, benchmark | perf, slow, optimize |
| ci-guardian | CI/CD sağlık, test regresyon, build | ci, pipeline |
| architect | Sistem tasarımı, modül yönetimi, bağımlılık | architecture, design |
| architecture-planner | Mimari planlama, ADR yazımı, yol haritası | plan, roadmap, adr |
| accessibility-auditor | WCAG, a11y, erişilebilirlik denetimi | accessibility, a11y |
| data-engineer | Veri pipeline, ETL, veri modeli | data, pipeline, etl |
| devops-engineer | CI/CD, Docker, deployment, altyapı | devops, deploy, docker |
| frontend-designer | UI/UX, component tasarımı, responsive | frontend, ui, design |
| migration-specialist | Versiyon geçişi, framework migration | migration, upgrade |

- **21 yerleşik yetenek:**

| Yetenek | Açıklama |
|---------|----------|
| typescript-expert | TypeScript tip sistemi, ESM, generics |
| testing-expert | Vitest/Jest, mock'lama, coverage |
| documentation-writer | Markdown, JSDoc, API docs |
| security-specialist | Güvenlik patternleri, input validasyon |
| performance-optimizer | Async optimizasyon, memory, profiling |
| api-builder | REST tasarımı, OpenAPI spec |
| devops-engineer | GitHub Actions, Docker, deployment |
| database-migration | Query optimizasyon, migration, ORM |
| react-specialist | React, Vite, Tailwind, component mimari |
| python-expert | Python ekosistemi, FastAPI |
| ci-testing | CI ortamında test yürütme |
| accessibility-expert | WCAG standartları, a11y test |
| anthropic-sdk | Claude API, Anthropic SDK, tool use |
| code-simplifier | Kod sadeleştirme, karmaşıklık azaltma |
| docker-expert | Dockerfile, compose, container optimizasyon |
| frontend-design | UI component, CSS, responsive tasarım |
| git-expert | Git iş akışı, branch stratejisi |
| graphql-expert | GraphQL schema, resolver |
| migration-expert | Framework geçişi, versiyon yükseltme |
| monorepo-expert | Monorepo yönetimi, workspace |
| system-architect | Sistem mimarisi, tasarım desenleri |
- **3 Worker Backend** (ADR-027, Sprint 123): tmux (varsayılan), Docker (izole container), subprocess (Windows uyumlu).
- **ModelRegistry** (Sprint 097): 13 model, 3 sağlayıcı, 4 tier:

| Tier | Claude | Codex | Gemini |
|------|--------|-------|--------|
| premium_plus | — | o3 | gemini-3.1-pro-preview |
| premium | opus | gpt-5 | gemini-2.5-pro |
| standard | sonnet | gpt-4.1, o4-mini | gemini-2.5-flash |
| economy | haiku | gpt-5-mini, gpt-4.1-mini | gemini-2.0-flash |

- **Sprint Yaşam Döngüsü** (8 faz): PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

| Faz | Açıklama | Sorumlu |
|-----|----------|---------|
| PLAN | Brain DIRECTIVES'i okur, task JSON'ları oluşturur | Brain |
| SPAWN | Worker'lar tmux/Docker/subprocess ile başlatılır, Auditor başlar | Brain |
| EXECUTE | Worker'lar task'ları uygular, heartbeat dosyaları yazar | Workers |
| EVALUATE | Brain sonuçları değerlendirir: GO / NO_GO / GO_WITH_TECH_DEBT | Brain |
| FIX | Başarısız task'lar yeniden denenir (yapılandırılabilir timeout) | Brain + Workers |
| RETRO | Retrospektif yazılır, sprint log güncellenir | Brain |
| DECAY | .brain/ bellek bütçesi aşıldıysa eski satırlar temizlenir | Brain |
| CLEANUP | Task dosyaları arşivlenir, kilitler serbest, session'lar kapatılır | Brain |
- **Auditor 3-Pipeline Verification** (Sprint 138): verifyWorkerResult + verifyFunctional + validateTechDebt. Worker self-assessment'ı bağımsız olarak doğrulanır.
- **Event Stream** (Sprint 138): Append-only JSONL, ADR-035 Protocol V1.0, 15 kanal kodu. Brain ↔ Worker ↔ Auditor arasında yapılandırılmış iletişim.
- **RBAC Protocol** (ADR-037, Sprint 139): Brain-Auditor-Worker Authority Matrix. Her bileşenin dosya sistemi erişim hakları, event stream kanal hakları ve sprint yaşam döngüsü eylem yetkileri formal olarak tanımlı.
- **Sprint Controller Slim** (Sprint 136): sprint-controller.ts 1890 → 209 satır. God object bölme tamamlandı.
- **ModelRegistry** (Sprint 097): 13 model, 3 sağlayıcı, 4 tier (premium_plus, premium, standard, economy).
- **Routing V2** (Sprint 063): Intent-based 3 katmanlı yönlendirme motoru. TaskDNA analizi → niyet sınıflandırma → ajan seçimi → yetenek seçimi.
- **Docker Backend** (Sprint 103-139): İzole container çalıştırma. Proje dizini read-only mount, .tasks/ read-write mount. Adaptive timeout, WSL2 bellek uyarısı, graceful shutdown.
- **Managed Docs** (ADR-029, Sprint 131): Sprint yaşam döngüsü template-based doküman güncelleme. `.deckent/docs.json` ile yapılandırılabilir.
- **Human Checkpoints** (Sprint 088): Worker'lar blocker durumda Brain'e soru sorabilir. CLI/MCP ile onay/red.
- **Sprint Resume** (Sprint 138): Yarıda kalan sprint'leri devam ettirme. `sprint-checkpoint.ts` + `resume.ts`.
- **Self-Modifying Detection** (ADR-039, Sprint 139): Deckent'in kendi kodunu vs kullanıcı projesini ayırt etme.

---

# 18. DOSYA REFERANSI

Her dosya, amacı, yazarı ve okuyucusu:

| Dosya | Amaç | Yazan | Okuyan | Yaşam Döngüsü |
|-------|------|-------|--------|----------------|
| CLAUDE.md | @DECKENT.md adaptörü | ensureDeckentImport() | Claude Code | Kalıcı |
| DECKENT.md | Tek gerçek kaynak (ajan yapılandırması) | deckent init | Tüm ajanlar (@import) | Kalıcı |
| DIRECTIVES.md | Sprint hedefleri | Siz / MCP | Brain | Siz değiştirene kadar |
| .deckent/config.json | Çalışma zamanı yapılandırması | deckent init/config | Hepsi | Kalıcı |
| .brain/memory.db | SQLite bellek DB — tek doğruluk kaynağı | MemoryStore | Brain, MCP | Kalıcı (gitignored) |
| .brain/exports/*.md | Git-tracked bellek snapshot'ları | memory export | Hepsi (@import) | Otomatik |
| .brain/MEMORY.md | Sprint öğrenimleri (eski format) | Brain | Hepsi (@import) | Zayıflama: 3 sprint |
| .brain/RETRO.md | Son sprint retrospektifi | Brain | Brain | Üzerine yazılır |
| .brain/DEBT.md | Teknik borç tablosu | Brain | Brain | Çözülene kadar |
| .brain/PATTERNS.md | Auditor bulguları | Auditor | Brain | Zayıflama: 5 sprint |
| .brain/ERRORS.md | Hata logu | Brain | Brain | Kalıcı |
| .brain/sprints/*.md | Sprint logları | Brain | Brain | Otomatik arşiv |
| .tasks/task-*.json | Görev tanımları | Brain | Worker'lar | Sprint sonrası arşiv |
| .tasks/task-*.result | Sonuçlar (rubric puanları dahil) | Worker'lar | Brain | Sprint sonrası arşiv |
| .tasks/task-*.hb | Heartbeat dosyaları | Worker'lar | Auditor | Sprint sonrası silinir |
| .tasks/task-*.plan | Worker yürütme planı | Worker'lar | Brain | Sprint sonrası arşiv |
| .dashboard | Canlı durum | Auditor | Siz, UI | Üzerine yazılır |
| .deckent/sprint-*-events.jsonl | Event stream (append-only) | Brain, Auditor, Worker | Hepsi | Arşivlenir |
| .deckent/sprint-*-gate.json | Sprint gate hesaplama | Auditor | Brain | Sprint sonrası arşiv |
| .deckent/sprint-*-checkpoint.json | Sprint checkpoint | Brain | Resume | Sprint sonrası arşiv |
| .deckent/docs.json | Managed-docs yapılandırması | Kullanıcı | sprint-reporter | Kalıcı |
| .deckent/cost-config.json | Sağlayıcı fiyatlandırma | pricing-updater | cost-calculator | Kalıcı |
| .claude/rules/*.md | Ajan kuralları (frontmatter) | deckent init | Claude Code | Kalıcı |
| src/mcp/tools/*.ts | MCP araç işleyicileri (22) | Geliştirici | MCP sunucu | Kalıcı |
| src/mcp/resources/*.ts | MCP kaynak işleyicileri (8) | Geliştirici | MCP sunucu | Kalıcı |
| docs/audits/ | Audit raporları | Auditor | Geliştirici | Kalıcı |

---

# 19. UYGULAMA GEÇMİŞİ

## Sprint 1-23: Çekirdek Motor ve Kararlılık (Mart 2026)

Sprint 1'de dalga tabanlı uygulama ile tüm çekirdek modüller inşa edildi. Sprint 6'da Deckent ilk kez kendini çalıştırdı (dogfooding). Sprint 7-8'de MCP sunucu entegrasyonu tamamlandı. Sprint 10-11'de HTTP API ve web dashboard eklendi. Sprint 12-13'te Brain AI planlaması (planner.ts, Zod doğrulamalı) devreye girdi. Sprint 15'te DECKENT.md bağımsızlık dönüm noktası — tek gerçek kaynak oldu. Sprint 17'de güvenilirlik sağlamlaştırıldı (MCP arka plan görevleri, sprint ID güvenliği). Sprint 18-20'de orkestrasyon smoke test ve fix doğrulama yapıldı. Sprint 21-23'te parametrik orkestrasyon (sistem profili, subscription tespiti, auto workers) tamamlandı ve AI planner 12/12 görev planladı.

**Dönüm noktaları:** 1422 test, %97.5 kapsam, 32 CLI komutu, 17 MCP aracı, 9 kaynak.

## Sprint 24-38: Eklenti, Ajan ve Çoklu Sağlayıcı (Mart 2026)

Sprint 24-25'te plugin v2 sistemi ve i18n çalışma zamanı eklendi (+1449 test). Sprint 27'de sağlayıcı soyutlama katmanı ve subprocess backend geldi (+14.737 satır). Sprint 29'da dinamik ajan havuzu (8 yerleşik ajan) kuruldu. Sprint 30'da yetenek sistemi (10 yerleşik yetenek) tamamlandı. Sprint 31'de brain karar motoru 6 adımlı pipeline olarak yapılandırıldı. Sprint 35-36'da brain.ts god object bölme başladı (1312→58 satır). Sprint 38'de çoklu sağlayıcı altyapısı tamamlandı: Claude + Codex + Gemini, tier eşdeğerliği.

**Dönüm noktaları:** 8555 test, %97.5 kapsam, 8 ajan, 10 yetenek, 3 sağlayıcı.

## Sprint 39-65: Platform Genişleme ve Stabilizasyon (Mart-Nisan 2026)

Sprint 39-41'de worker verify döngüsü, insan-dostu çıktı eklendi. Sprint 42-47'de stabilizasyon, MCP-native sağlayıcılar ve 10K+ test aşıldı. Sprint 48-54'te npm publish, güvenlik başlıkları, config genişleme yapıldı. Sprint 55-59'da CLI derin analizi (158 iyileştirme) tamamlandı. Sprint 62'de ci-guardian ajan + ci-testing yeteneği eklendi. Sprint 63'te Routing V2 motoru (intent-based 3 katman) devreye girdi. Sprint 65'te son CLI iyileştirme grubu tamamlandı.

**Dönüm noktaları:** 11.862 test, %96+ kapsam, 32+ CLI komutu, 17 MCP aracı, 9 ajan.

## Sprint 66-77: MCP Olgunlaşma ve God Object Bölme (Nisan 2026)

Sprint 66-68'de MCP 17 araç + 9 kaynağa genişletildi. Tüm manifest'ler v2'ye taşındı. Sprint 70-71'de Windows dogfooding yapıldı (22 bug fix). Sprint 72'de tier genelleştirme (performance/balanced/economic) ve god object faz 1 tamamlandı. Sprint 73'te self-dogfooding ile 100 test regresyonu düzeltildi. Sprint 76'da god object bölme faz 3 tamamlandı (sprint-controller.ts → sprint-phases.ts + sprint-utils.ts + result-collector.ts).

**Dönüm noktaları:** 12.196 test, %96+ kapsam, MCP 17 araç + 9 kaynak, god object bölme tamamlandı.

## Sprint 78-100: Dashboard UX ve ModelRegistry (Nisan 2026)

Sprint 78'de dashboard bileşenleri yeniden tasarlandı (WorkerCard, ActivityFeed, layout overhaul). Sprint 79'da i18n tam kapsam sağlandı (44 yeni çeviri anahtarı). Sprint 80'de dashboard cilalama, SSE göstergesi ve MCP parametre zenginleştirme yapıldı. Sprint 81-82'de skeleton loading bileşenleri ve boş durum UI'ları eklendi. Sprint 84'te AgentDetail panel resize fix ve ConfigPage i18n (79 anahtar) tamamlandı.

Sprint 86'da routeTaskV2 call site düzeltmeleri yapıldı. Sprint 87'de stabilizasyon ve otonom adaptasyon framework'ü çalışıldı. Sprint 88 önemli bir dönüm noktası — sprint timeout reform, heartbeat daemon ve human checkpoint mekanizması eklendi. Bu sayede worker'lar blocker durumda Brain'e soru sorabilir hale geldi.

Sprint 89-90'da usage modülü tamamen kaldırıldı (1618 satır silindi, 13 test dosyası temizlendi). Sprint 91'de ajan tiebreaker v2 fix ve promotion/demotion yürütme eklendi. Sprint 92'de dashboard i18n tamamlandı (StatusPage, TaskCard, DebtTable, +35 anahtar). Sprint 93-94'te RETRO skill performance fix, quality score routing doğrulaması yapıldı. Sprint 95'te skill name mismatch düzeltmeleri uygulandı. Sprint 96'da kapsamlı doküman sayı/tablo düzeltmeleri yapıldı (10/10 görev — README, DECKENT, IDENTITY, cli.md, config-reference).

Sprint 97 önemli bir dönüm noktası — ModelRegistry sınıfı uygulandı: 13 model, 3 sağlayıcı (Claude, Codex, Gemini), 4 tier (premium_plus, premium, standard, economy), mode-presets (performance/balanced/economic/api). Init wizard refactor edildi. Sprint 98'de RETRO done counter fix ve sprint history tool fix yapıldı. Sprint 99'da evaluations map debug fix ve job output reform tamamlandı. Sprint 100 milestone'u ile 27 dakikada 6 görev tamamlandı.

**Dönüm noktaları:** ModelRegistry (Sprint 97), human checkpoints (Sprint 88), usage modülü temizliği (Sprint 89-90), dashboard i18n tamamlanma (Sprint 92).

## Sprint 101-122: Docker Altyapısı ve Stabilizasyon (Nisan 2026)

Sprint 101'de Docker backend ile ilk ciddi karşılaşma — write permission sorunları nedeniyle 4/10 kısmi tamamlanma. Sprint 102 ve Sprint 104 tamamen timeout ile sonuçlandı (%100 NO_GO) — Docker worker'ların süre yönetimi ciddi sorunluydu. Sprint 103'te Docker backend entegrasyon testi ve docs guide eklendi (6/7 başarı). Sprint 105'te 11 dakikada 4 görev örtük olarak tamamlandı.

Sprint 106'da auditor edge test fix, Sprint 107'de CLI smoke testleri, Sprint 108'de tmux smoke testleri eklendi. Sprint 109-120 arası uzun Docker stabilizasyon dönemi — worker exit, timeout ve smoke test sorunları sistematik olarak ele alındı. Sprint 111, Sprint 115, Sprint 117, Sprint 119, Sprint 120'de Docker timeout/exit sorunları devam etti. Bu dönem Docker backend'in üretim kalitesine ulaşması için gereken sıkıntılı ama zorunlu bir süreçti.

Sprint 121'de CLI Docker test dosyası, Sprint 122'de MCP reconnect test dosyası oluşturuldu. Sprint 123 Docker stabilizasyonunun kapanış sprint'i — ADR-027 Hybrid Backend kabul edildi (tmux + Docker + subprocess üçlü backend stratejisi), heartbeat type field eklendi, dashboard'a backend badge konuldu.

**Dönüm noktaları:** Docker backend stabilizasyonu (Sprint 101-122), ADR-027 Hybrid Backend (Sprint 123), 20+ sprint Docker iterasyon.

## Sprint 123-134: Değerlendirme Sistemi ve Mimari (Nisan 2026)

Sprint 124'te context estimator, context-aware router ve token usage tracking eklendi — Brain artık her görevin bağlam büyüklüğünü tahmin ederek model seçimine yansıtıyor. Sprint 125-126'da rubric-based grading ve worker question mekanizması çalışıldı (bazı false NO_GO'lar nedeniyle tekrar edildi). Sprint 127'de promotion pipeline guard validation testleri yazıldı. Sprint 128'de deckent_explain MCP aracı teyit edildi. Sprint 129'da ANALYSIS fix, test cleanup ve kod sadeleştirme yapıldı.

Sprint 131 önemli bir mimari sprint — ADR-029 Managed-Docs Universalization, ADR-030 Template Engine + Plugin Loader, ADR-031 Content Hash Cache, ADR-032 i18n Pattern System kabul edildi. Artık kullanıcılar `.deckent/docs.json` ile herhangi bir markdown dokümanı sprint yaşam döngüsüne dahil edebilir.

Sprint 132'de task dependency pipeline temeli, decision logging ve planner priority injection uygulandı (7/7 görev). Sprint 133'te HTTP API bearer token auth, config caching ve competitive analysis update yapıldı (12/12 görev).

Sprint 134 vizyon sprint'i — ADR-033 Product Vision ("Product, Not Service") ve ADR-034 Multi-Project Isolation kabul edildi. Bu kararlar Deckent'in kimliğini kalıcı olarak belirledi: yerel ürün, SaaS değil, açık kaynak, ücretsiz. Ayrıca Local Observability Seviye 2 (Sprint 134 T-011), Brain Self-Audit Gate (Sprint 134 T-014), Task Dependency Pipeline (Sprint 134 T-001) uygulandı.

**Dönüm noktaları:** ADR-033 Product Vision (Sprint 134), task dependency pipeline (Sprint 132-134), managed docs (Sprint 131), context-aware routing (Sprint 124).

## Sprint 135-139: Orkestrasyon Olgunlaşması (Nisan 2026)

Sprint 135'te beş kritik iyileştirme uygulandı: coordinator resilience (Sprint 135 T-001), Docker graceful shutdown (Sprint 135 T-003 — 5-sprint'lik P0 Docker HB bug'ının kök neden düzeltmesi), askBrain IPC registry (Sprint 135 T-004), planner priority/dependencies (Sprint 135 T-005 + Sprint 136 T-006 wire fix), ve brain budget auto-decay enforcement (Sprint 135 T-013). 14/17 görev tamamlandı.

Sprint 136'da sprint-controller.ts god object slim tamamlandı — 1890 satırdan 209 satıra indirildi (ADR-024/026 kapanışı). Brain spurious NO_GO reconciliation helper eklendi (Sprint 136 T-003 + Sprint 137'de canlı doğrulandı). Gate.json wiring ve load-report generation tamamlandı. 6/10 görev (4 Docker worker hatası).

Sprint 137'de brain test restoration, tryCodeVerifiedDone wire, ErrorRegistry lint ve BETA-TRACKER sync yapıldı. 6/6 görev, 93 ortalama rubric puanı, %14.9 kapsam.

Sprint 138 projenin en büyük mimari sprint'i — 11/11 görev, 91 ortalama rubric:
- ADR governance MADR v3 hibrit format + 37 ADR migration + ADR-036 self-referential + scripts/adr-validator.mjs (Sprint 138 Task 1)
- ADR-035 Verification Protocol Standard — 15 kanal kodu V1.0 (Sprint 138 Task 2)
- Auditor Authority Extension 3-Pipeline — verifyWorkerResult + verifyFunctional + validateTechDebt + checkADRCompliance (Sprint 138 Task 3)
- Structured Event Stream + Plan-Time Scope Collision Detection — event-stream.ts 305 LoC + file-lock.ts 30→267 gerçek implementasyon (Sprint 138 Task 4)
- Layer 4 Runtime Wire Forensic Fix — ADR-006 canlı enforcement (Sprint 138 Task 6)
- Worker Honest Assessment Calibration v2 — verify-delta baseline + applyTechDebtDowngrade çift katman (Sprint 138 Task 8)
- Long-Running Sprint Resume Capability MVP — sprint-checkpoint.ts + resume.ts (Sprint 138 Task 9)

Sprint 139 projenin en büyük sprint'i (52 planlı görev, 41 tamamlandı, 3 saat, +14471/-352 LoC):
- Docker HB Core Fix — atomicWriteFileSync + SIGTERM fsync handler + 15s grace period (Sprint 139 Task 13)
- Chain Dependency Scheduler Wave 1 — Kahn's algorithm topological sort + detectScopeCollisions (Sprint 139 Task 28)
- Backend Parity 3/3 — Docker + tmux + subprocess E2E test suite, Sprint 120'den beri ilk subprocess E2E (Sprint 139 Tasks 17-19)
- ADR-037 RBAC Protocol V1.0 — Brain-Auditor-Worker Authority Matrix (+1370 LoC) (Sprint 139 Task 34/35)
- ADR-038/039 Self-Modifying Task Detection — self-modifying-detector.ts (+789 LoC) (Sprint 139 Task 51/52)
- Worker Event Hook + Notification Dispatcher — notify-adapters/, DECKENT→USER:NOTIFY kanal (Sprint 139 Task 41)

**Dönüm noktaları:** ADR-035/036/037/038/039 (Sprint 138-139), event stream (Sprint 138), 3-pipeline verification (Sprint 138), RBAC (Sprint 139), sprint resume (Sprint 138), chain dependency scheduler (Sprint 139).

## Sprint 140-145: Kod Kalitesi, Memory V2 ve Büyük Refaktör (Nisan 2026)

### Sprint 140 — Memory V2 DB-First Başlangıcı

Sprint 140'ta bellek sistemi dosya-tabanlı mimariden SQLite veritabanı tabanlı mimariye geçiş planlandı. `.brain/memory.db` tek doğruluk kaynağı olarak belirlendi. MemoryStore API tanımlandı (CRUD + FTS5 + tags + relations + decay + history). Token usage zorunlu hale getirildi — Sprint 140'tan itibaren tokenUsage alanı olmayan result dosyaları NO_GO olarak değerlendirilir.

### Sprint 141 — Kapsamlı Codebase Analizi

Sprint 141'de kapsamlı codebase analizi yapıldı — core/ (58 modül), orchestra/ (65 modül), cli/, mcp/, dashboard/, tests/, docs/ ayrı ayrı incelendi. 18 görev, 15 tamamlandı, 8 tech debt. Architecture graph, circular dependency audit, dead code audit ve type safety audit tamamlandı. Bu analiz Sprint 142'deki devasa kod inceleme sprint'inin temelini oluşturdu.

### Sprint 142 — Devasa Kod İnceleme

Sprint 142 devasa kod inceleme sprint'i — 49 görev, 44 tamamlandı. Core 7 batch, orchestra 9 batch, CLI 7 batch, MCP 3 batch, agents/providers, dashboard 2 batch, tests 6 batch, docs 2 batch olarak sistematik inceleme. Meta-audit'ler: mimari, dead code, güvenlik, i18n, Memory V2 uyumluluk. Bu sprint Memory V2 migration'ın güvenli yapılabilmesi için gereken derinlemesine bilgi tabanını oluşturdu.

### Sprint 143 — Chain Reform ve Güvenlik

Sprint 143'te chain reform tamamlandı (19/20 görev):
- **Güvenlik düzeltmeleri:** shell injection (execSync → spawnSync whitelist — ADR-006 enforcement), path traversal engelleme
- **.brain/memory.db git tracking:** SQLite DB dosyası gitignore'a eklendi, export'lar (.brain/exports/*.md) git-tracked
- **FTS5 query builder:** escapeFts5Query() iyileştirmesi — operatör kaçışı + wildcard desteği
- **Relations hybrid backfill:** ADR çapraz referansları (references, supersedes, depends_on) otomatik backfill
- **Memory V2 tam migration:** ci-reporter + managed-docs modülleri Memory V2'ye taşındı (1 NO_GO Docker timeout)
- **ADR-009/010 güncellemeleri:** DEBT.md format doğrulaması + tek runtime dependency güncelleme
- **Layer 4 wire düzeltmesi:** Runtime routing wire doğrulaması
- **Task restoration, panic kill guard, e2e harness:** Sprint güvenilirliği iyileştirmeleri
- **MCP disconnect fix:** MCP sunucu bağlantı kopması sonrası otomatik yeniden bağlanma
- **Heartbeat execSync whitelist:** ADR-006 uyumlu heartbeat yazımı

### Sprint 144 — Büyük Refaktör ve Test Genişlemesi

Sprint 144'te büyük refaktör ve test genişlemesi (24/27 görev):
- **Dosya bölmeleri:** init.ts (1669 → 4 dosya), doctor.ts (1102 → 3 dosya), retro.ts (453 → 3 dosya) — god object bölme pattern'ı uygulandı
- **worker.ts bölme girişimi:** NO_GO — timeout. Worker lifecycle complexity nedeniyle Sprint 145+'a ertelendi
- **Dead code temizliği dalgaları:** Sprint 139 audit sonuçlarına (ADR-038) göre 2 dalga temizlik (2 timeout)
- **Auditor async scan geçişi:** Synchronous scan döngüsü async'e taşındı — I/O bloklama azaltıldı
- **Dockerfile hardening:** Güvenlik katmanları (non-root user, read-only filesystem, minimal base image)
- **i18n CLI:** 5 komut lokalize edildi (status, doctor, retro, history, explain)
- **Docker HB deploy doğrulaması:** Sprint 139 T-013 atomicWriteFileSync düzeltmesinin canlı doğrulaması
- **Event stream emit düzeltmesi:** Event yazma sırasında race condition düzeltmesi
- **Sprint-state yaşam döngüsü iyileştirmesi:** Faz geçişlerinde state dosyası tutarlılığı
- **Orphan cleanup mekanizması:** Önceki sprint'lerden kalan yetim worker süreçlerinin tespiti ve temizliği
- **Memory V2 testleri:** +40 yeni test — CRUD, FTS5, decay, relations, export/import
- **Heartbeat testleri:** +24 yeni test — atomicWrite, stale detection, Docker HB core
- **Prompt assertion refactor:** Worker prompt injection testlerinde assertion kalitesi artırıldı
- **Memory leak düzeltmeleri:** SQLite bağlantı havuzu ve EventEmitter listener sızıntıları giderildi

### Sprint 145 — Olgunlaşma (Devam Ediyor)

Sprint 145 devam ediyor — Deckent'in 145+ sprint deneyimini taşıyan olgun bir orkestrasyon platformuna dönüşümünü tamamlıyor:

- **Adaptive Timeout Sistemi:** timeout-watcher.ts + timeout-estimator.ts — worker görevlerinin süre aşımını görev özelliklerine (effort, LoC, scope, backend) ve sprint geçmişine göre akıllıca hesaplar. Sprint 101-122 Docker timeout döneminden öğrenilen derslerin ürünü.
- **Unified Native Observability:** event-stream.ts genişletmeleri + event-bus.ts in-process pub/sub + monitor-adapter.ts backend-agnostic izleme. Sprint 134 Local Observability Seviye 2 ile Sprint 138 Event Stream'in birleşimi.
- **CLI/MCP Kapsamlı Audit:** 41+ CLI komutu ve 22 MCP aracının parametre tutarlılığı, i18n coverage, hata mesajı kalitesi ve dokümantasyon doğruluğu incelemesi.
- **DECKENT-ANA-PLAN-TR.md v3.0:** Sprint 23'ten Sprint 145'e kadar tüm gelişmelerin kapsamlı güncellenmesi — Memory V2, ADR governance, RBAC, event stream, adaptive timeout ve maliyet yönetimi bölümleri eklendi.

**Güncel durum (Sprint 145):**
- 12.485 test + 16 atlanmış (505 dosya)
- %89.33 kapsam
- 41+ CLI komutu
- 22 MCP aracı + 8 kaynak
- 16 yerleşik ajan + 21 yetenek
- 3 sağlayıcı (Claude, Codex, Gemini)
- 13 model, 4 tier
- 39 ADR (mimari karar kaydı)
- 145+ sprint tamamlandı
- Memory V2 SQLite DB-first — FTS5 dual-layer arama, turkishNormalize
- Event Stream ADR-035 Protocol V1.0 — 15 kanal kodu
- RBAC ADR-037 Protocol V1.0 — formal yetki matrisi

---

# 20. CLAUDE CODE ENTEGRASYON REHBERİ

Claude Code bir Deckent projesini şöyle görür:

1. Claude, CLAUDE.md'yi okur (@DECKENT.md referansını takip eder)
2. DECKENT.md'de @import'lar var → Claude bunları takip eder
3. .claude/rules/ dosyaları bağlama göre etkinleşir (frontmatter paths)
4. MCP sunucu kaydı sayesinde deckent araçları doğal dille çağrılabilir
5. Memory V2 sayesinde ADR'ler ve sprint öğrenimleri otomatik olarak worker prompt'larına enjekte edilir

```bash
# Sprint başlatma
cd my-project
deckent start

# Veya Claude Code'da doğal dille:
# "Bu proje için bir sprint planla"
# → Claude deckent_plan() çağırır

# Bellek sorgulama:
# "Docker ile ilgili kararları göster"
# → Claude deckent_memory_query() çağırır
```

---

# 21. MCP SUNUCU MİMARİSİ

## Genel Bakış

Deckent, Model Context Protocol (MCP) ile Claude Code'a entegre olur. MCP sunucu yerel stdio süreci olarak çalışır — ek kimlik doğrulama gerekmez.

## Kurulum

```bash
# Seçenek 1: deckent init ile (otomatik kayıt)
deckent init

# Seçenek 2: Manuel kayıt
claude mcp add deckent -- npx deckent mcp
```

## Araçlar (22)

### Yaşam Döngüsü Araçları

| Araç | Girdi | Amaç |
|------|-------|------|
| `deckent_init` | projectName, mode?, language? | Projeye Deckent kur |
| `deckent_set_directives` | content: string | Sprint hedeflerini ayarla |
| `deckent_plan` | dryRun?, mode?: 'ai'\|'structured'\|'auto' | Sprint planla |
| `deckent_start` | autoApprove?: boolean | Tam sprint yaşam döngüsü çalıştır |
| `deckent_run` | görev açıklaması, model? | Sprint olmadan tek görev çalıştır |
| `deckent_review` | yok | Sprint sonucu: GO / NO_GO / GO_WITH_TECH_DEBT |
| `deckent_cleanup` | yok | Görev dosyalarını arşivle, kilitleri serbest bırak |
| `deckent_kill` | target: 'all' \| workerId | Aktif sprint'i veya worker'ı durdur |
| `deckent_checkpoint` | action: 'approve'\|'reject' | İnsan onay noktası yönetimi |

### Bilgi Araçları

| Araç | Girdi | Amaç |
|------|-------|------|
| `deckent_status` | yok | Sprint dashboard durumu |
| `deckent_doctor` | yok | Sistem sağlık kontrolü |
| `deckent_retro` | yok | Son sprint retrospektifi |
| `deckent_history` | last?: number | Sprint geçmişi logları |
| `deckent_help` | yok | Proje durumu ve kullanım rehberi |
| `deckent_explain` | topic: string | Kavram veya komut hakkında rehberlik |
| `deckent_memory_query` | query: string, type?, limit? | Proje hafızasında cross-source arama |

### Yapılandırma, Senkronizasyon ve İzleme Araçları

| Araç | Girdi | Amaç |
|------|-------|------|
| `deckent_config` | action: 'read'\|'set', key?, value? | Yapılandırma oku veya ayarla |
| `deckent_sync` | yok | CLAUDE.md + AGENTS.md senkronizasyonu |
| `deckent_analyze_project` | yok | Proje yığın/boyut/metodoloji analizi |
| `deckent_agent_list` | yok | Kayıtlı ajanları listele (yerleşik + özel) |
| `deckent_skill_list` | yok | Kayıtlı yetenekleri listele (manifest + AST sandbox) |
| `deckent_docs` | action: 'add'\|'remove'\|'list' | Sprint doküman yönetimi |
| `deckent_watch` | yok | Canlı sprint izleme (tmux bölünmüş görünüm) |

## Kaynaklar (8)

| URI | İçerik | MIME Tipi |
|-----|--------|-----------|
| `deckent://dashboard` | Canlı sprint durumu (JSON) | application/json |
| `deckent://directives` | Mevcut DIRECTIVES.md | text/markdown |
| `deckent://memory` | Bellek özeti (.brain/exports/summary.md) | text/markdown |
| `deckent://debt` | Teknik borç kalemleri | application/json |
| `deckent://config` | Proje yapılandırması (.deckent/config.json) | application/json |
| `deckent://retro` | Son sprint retrospektifi (RETRO.md) | text/markdown |
| `deckent://tasks` | Aktif görev listesi ve durumları | application/json |
| `deckent://agents` | Kayıtlı ajan havuzu ve istatistikleri | application/json |

## Kritik Tasarım Kararı: deckent_set_directives

En büyük kullanıcı deneyimi sıkıntısı DIRECTIVES.md'yi doğru `## Task N:` formatında elle yazmaktı. Bu araç sorunu çözer:

1. Kullanıcı "JWT ile kimlik doğrulama ekle" der
2. Claude bunu yapılandırılmış `## Task N:` bloklarına formatlar
3. Araç formatlanmış içeriği DIRECTIVES.md'ye yazar
4. Brain'in `parseStructuredDirectives()` fonksiyonu değişmeden okur

---

# 22. KULLANICI AKIŞLARI

## Akış 1: İlk Kurulum

```
Kullanıcı: "Bu projeye Deckent kur"
Claude:    → deckent_doctor çağırır (sağlık kontrolü)
           → deckent_init(projectName: "my-app", mode: "performance") çağırır
           → ".deckent/, .brain/, .tasks/ oluşturuldu. MCP sunucu kaydedildi."
```

## Akış 2: İlk Sprint

```
Kullanıcı: "JWT ile login/register, korumalı route'lar ve profil sayfası ekle"
Claude:    → deckent_set_directives(content: "## Task 1: Auth API\n...") çağırır
           → deckent_plan() çağırır
           → "4 görev planlandı: Auth API (sonnet), Middleware (sonnet)..."
Kullanıcı: "Başlat"
Claude:    → deckent_start() çağırır
Kullanıcı: "Durum ne?"
Claude:    → deckent://dashboard okur
           → "2/4 tamamlandı, w-002 test aşamasında, w-003 kodluyor..."
```

## Akış 3: Sürekli Kullanım

```
Kullanıcı: "Geçen sprintte ne öğrendik?"
Claude:    → deckent_memory_query(query: "son sprint öğrenimleri") çağırır
           → Sprint 144 öğrenimlerini döndürür

Kullanıcı: "Docker kararları neydi?"
Claude:    → deckent_memory_query(query: "docker", type: "adr") çağırır
           → ADR-027 Hybrid Backend sonucunu döndürür

Kullanıcı: "Bu sprint ne kadara mal olur?"
Claude:    → deckent cost veya maliyet hesaplama çağırır
           → Sağlayıcı bazlı maliyet tahmini döndürür
```

**Kullanıcı HİÇBİR ZAMAN:**
- DIRECTIVES.md'yi elle açmak zorunda kalmaz
- Terminal komutu yazmak zorunda kalmaz
- Agile/sprint terminolojisini bilmek zorunda kalmaz
- .tasks/ veya .brain/ iç yapısını anlamak zorunda kalmaz

---

# 23. STRATEJİK YOL HARİTASI

## Aşama 1: Claude Native Kararlı (Sprint 1-8) — TAMAMLANDI

Sağlam Claude-native orkestrasyon ve MCP entegrasyonu. 1027+ test, %97+ kapsam, HTTP API, Web Dashboard, AI planlama.

## Aşama 2: Sağlayıcı Soyutlama (Sprint 9-12) — TAMAMLANDI

ProviderAdapter interface, subprocess backend seçenekleri.

## Aşama 3: Çoklu Sağlayıcı (Sprint 13-38) — TAMAMLANDI

Claude + Codex + Gemini, tier-based model eşdeğerliği, provider fallback chain. 8555 test.

## Aşama 4: Platform Genişleme (Sprint 39-100) — TAMAMLANDI

| Özellik | Sprint | Durum |
|---------|--------|-------|
| Web dashboard (React + Vite + Tailwind) | 011 | ✅ |
| npm publish altyapısı | 051 | ✅ |
| VitePress dokümantasyon sitesi | 052 | ✅ |
| CI Guardian ajan + ci-testing skill | 062 | ✅ |
| Routing V2 motoru (intent-based 3 katman) | 063 | ✅ |
| Windows dogfooding (22 bug fix) | 070-071 | ✅ |
| Tier genelleştirme (provider-agnostic) | 072 | ✅ |
| God object bölme (faz 1-3) | 072-076 | ✅ |
| ModelRegistry (13 model, 3 sağlayıcı) | 097 | ✅ |
| Sprint timeout reform + human checkpoints | 088 | ✅ |
| Dashboard i18n tam kapsam | 092 | ✅ |
| Usage modülü temizliği (1618 LoC) | 089-090 | ✅ |

**Çıkış kriterleri:** 12.196 test, %96+ kapsam, 32+ CLI komutu, 17 MCP aracı, 16 ajan.

## Aşama 5: Olgunlaşma ve Kurumsal Hazırlık (Sprint 101-150+) — DEVAM EDİYOR

| Özellik | Sprint | Durum |
|---------|--------|-------|
| Docker backend stabilizasyonu | 101-122 | ✅ |
| ADR-027 Hybrid Backend (tmux+Docker+subprocess) | 123 | ✅ |
| Context-aware routing + token tracking | 124 | ✅ |
| Task dependency pipeline | 132-135 | ✅ |
| ADR-033 Product Vision (Product, Not Service) | 134 | ✅ |
| Managed Docs universalization (ADR-029) | 131-133 | ✅ |
| HTTP API bearer token auth | 133 | ✅ |
| Coordinator resilience + Docker graceful shutdown | 135 | ✅ |
| sprint-controller.ts slim (1890→209 LoC) | 136 | ✅ |
| ADR Governance (MADR v3, 37 ADR migration) | 138 | ✅ |
| ADR-035 Verification Protocol (15 kanal) | 138 | ✅ |
| Auditor 3-Pipeline Verification | 138 | ✅ |
| Event Stream (append-only JSONL) | 138 | ✅ |
| Worker Honest Assessment v2 | 138 | ✅ |
| Sprint Resume capability | 138 | ✅ |
| ADR-037 RBAC Protocol V1.0 | 139 | ✅ |
| ADR-038/039 Self-Modifying Detection | 139 | ✅ |
| Chain Dependency Scheduler (Kahn's algo) | 139 | ✅ |
| Backend Parity 3/3 E2E tests | 139 | ✅ |
| Worker Event Hooks + Notification Dispatcher | 139 | ✅ |
| Memory V2 DB-First (SQLite FTS5) | 140-143 | ✅ |
| Büyük dosya bölmeleri (init/doctor/retro/worker) | 144 | ✅ |
| Dead code temizliği + dockerfile hardening | 144 | ✅ |
| Adaptive Timeout System | 145 | 🔄 |
| Unified Native Observability | 145 | 🔄 |
| CLI/MCP kapsamlı audit | 145 | 🔄 |
| VSCode eklentisi | — | 📋 Planlandı |
| Local model desteği (offline-first) | — | 📋 Planlandı |
| Rubrik bazlı otomatik notlama v2 | — | 📋 Planlandı |

---

# 24. SPRİNT GEÇMİŞİ

| Sprint | Test | Kapsam | Öne Çıkanlar |
|--------|------|--------|--------------|
| 1 | 432 | %89 | Çekirdek motor: tipler, yapılandırma, brain, auditor, worker, tmux, CLI |
| 2 | 480 | %91 | sleepSync → async sleep geçişi |
| 3 | 540 | %92 | haiku_allowed semantik düzeltme, checkUsage regex |
| 4 | 617 | %93 | resolveDebt yaşam döngüsü, eski borç temizliği |
| 5 | 644 | %94.8 | Zayıflama, doctor, start --dry-run, status --watch |
| 6 | 645 | %95 | İlk dogfooding: README.md 86sn'de, 1 görev TAMAMLANDI |
| 7 | 669 | %95 | MCP sunucu: 8 araç, 4 kaynak, otomatik kayıt |
| 8 | 669 | %95 | CONTRIBUTING.md, API docs, MCP dogfooding |
| 9 | 720 | %95 | analyze_project aracı, CI pipeline, dinamik versiyon |
| 10 | 799 | %95 | HTTP API+SSE, terminal dashboard, sprint ID refaktör |
| 11 | 852 | %97 | Web Dashboard: React+Vite+Tailwind, 4 sayfa, shadcn/ui |
| 12-13 | 938 | %97.5 | Brain AI planlaması (Zod), Auditor süreç-içi |
| 14 | 938 | %97.5 | Auditor canlı entegrasyon, .deckent sonlandırma |
| 15 | 967 | %97.5 | DECKENT.md bağımsızlık, sync CLI+MCP, self-hosting |
| 16 | 987 | %97.5 | deckent watch, worker log yakalama, model çıkarımı |
| 17 | 1027 | %97.5 | MCP arka plan görevleri, cleanup fix, React test altyapısı |
| 18 | 1027 | %97.5 | Orkestrasyon smoke test: 8 doküman, 6 bug keşfedildi |
| 19 | 1123 | %97.5 | Motor onarımı: 6 bug fix (heartbeat, dashboard, alert dedup) |
| 20 | 1027 | %97.5 | Fix doğrulama: 3/6 onaylandı |
| 21 | 1260 | %97.5 | Parametrik orkestrasyon: sistem profili, auto workers |
| 22 | 1392 | %97.5 | Decay fix, auto setup wizard, MCP enrichment |
| 23 | 1422 | %97.5 | AI planner fallback, 12/12 görev (ilk kez tam) |
| 24-25 | 3150 | %97 | Plugin v2, i18n çalışma zamanı, +1449 test, OSS altyapısı |
| 26 | 3442 | %97 | Teknik borç temizliği, readJsonSafe migration |
| 27 | 3609 | %97 | Sağlayıcı soyutlama, subprocess backend, +14.737 satır |
| 28 | 4100 | %97 | npm publish hazırlığı, hata kayıt, TUI wizard |
| 29 | 5300 | %97 | Ajan havuzu: 8 yerleşik ajan, seçim algoritması |
| 30 | 5700 | %97 | Yetenek sistemi: 10 yerleşik yetenek, stack tespiti |
| 31 | 6400 | %97 | Brain karar motoru: 6 adımlı pipeline, öğrenme döngüsü |
| 32 | 6900 | %97 | UX: ilerleme çubuğu, zengin özet, bildirimler |
| 33 | 7500 | %97 | Entegrasyon testleri, yetenek pazarı, güvenlik sandbox |
| 35-36 | 8073 | %97.5 | Beta temizlik: brain.ts bölme (1312→58 satır), types.ts bölme |
| 37 | 8073 | %97.5 | Güvenlik sertleştirme, plugin sistemi, AST sandbox |
| 38 | 8555 | %97.5 | Çoklu sağlayıcı: Claude + Codex + Gemini, tier eşdeğerlik |
| 39-41 | 8960 | %97.5 | Worker verify döngüsü, insan-dostu çıktı, MCP format |
| 42-47 | 10127 | %97.5 | Stabilizasyon, MCP-native sağlayıcılar, 10K+ test |
| 48-54 | 10509 | %96.4 | Blueprint cilalama, güvenlik başlıkları, npm publish |
| 55-59 | 10700 | %96.4 | CLI derin analiz: 158 iyileştirme |
| 60-61 | 10900 | %96.4 | CLI/Ajan doğrulama, ajan atama fix, brain bütçe decay |
| 62 | 11200 | %96.4 | ci-guardian ajan + ci-testing yetenek + CI hook'ları |
| 63 | 11500 | %96.4 | Routing V2 motoru (intent-based 3 katman) |
| 64 | 11500 | %96.4 | Doğrulama sprint'i (tüm görevler zaten tamamlanmış) |
| 65 | 11862 | %96+ | AI planner timeout, autoMigrate, cleanup fix. 7/7 |
| 66 | 11862 | %96+ | Manifest v2 toplu güncelleme (20 dosya), MCP docs. 7/7 |
| 67 | 11862 | %96+ | Paket 494KB, any temizlik, routing v2 audit. 6/6 |
| 68 | 11918 | %96+ | MCP talimatlar, araç annotations, deckent_help. 6/6 |
| 69 | 11918 | %96+ | Ajan seçim hassasiyeti, skill bütçesi, scope parser fix. 6/6 |
| 70-71 | 12000 | %96+ | Windows dogfooding: 22 bug fix, heartbeat periodic. 15/15 |
| 72 | 12160 | %96+ | Tier genelleştirme, MODEL_API_IDS, god object faz 1. 5/5 |
| 73 | 12176 | %96+ | Self-dogfooding: 100 test regresyonu fix (0 fail). 5/5 |
| 74 | 12176 | %96+ | Docs tutarlılık, debt-069 kapanış, CHANGELOG. 7/7 |
| 75 | 12196 | %96+ | Docs TR tutarlılık, VISION.md, detect-secrets, god object faz 2. 5/5 |
| 76 | 12196 | %96+ | Stale heartbeat fix, graceful shutdown, god object faz 3. 4/4 |
| 77 | 12196 | %96+ | CHANGELOG, SPRINT-LOG, PROJECT-IDENTITY güncelleme. 3/3 |
| 78 | 12196+ | %96+ | Dashboard bileşenleri: WorkerCard, ActivityFeed, layout overhaul. Sprint 78 dashboard UX. 4/4 |
| 79 | 12196+ | %96+ | i18n tam kapsam (44 yeni anahtar), config round-trip validation, SSE iyileştirmeler. Sprint 79 i18n. 4/4 |
| 80 | 12196+ | %96+ | Dashboard cilalama, SSE indicator, MCP parametre zenginleştirme, Sprint 80 CLI set-directives. 6/6 |
| 81 | 12196+ | %49 | Usage manager düzeltmeleri, init test düzeltmeleri. Sprint 81 stabilizasyon. 4/4 |
| 82 | 12196+ | %96+ | Skeleton loading, AgentDetail zenginleştirme, boş durum bileşenleri. Sprint 82 dashboard. 4/4 |
| 83 | 12196+ | %96+ | Sprint 83 — stabilizasyon ve küçük düzeltmeler |
| 84 | 12196+ | %96 | AgentDetail panel resize, ConfigPage i18n (79 anahtar), 41 dashboard test. Sprint 84 i18n. 4/4 |
| 85 | 12196+ | %96+ | Sprint 85 — routing ve planner iyileştirmeleri |
| 86 | 12196+ | %48 | routeTaskV2 call site düzeltmeleri, planner history injection. Sprint 86 routing fix. 4/4 |
| 87 | 12196+ | %96+ | Stabilizasyon ve otonom adaptasyon framework. Sprint 87. 31dk |
| 88 | 12196+ | %24 | Sprint timeout reform, heartbeat daemon, human checkpoints, docs polish. Sprint 88 timeout. 4/4 |
| 89 | 12196+ | %96+ | Usage modülü tamamen kaldırıldı (1618 LoC silindi, 13 test dosyası). Sprint 89 temizlik. 4/4 |
| 90 | 12196+ | %96+ | Usage cleanup (kalan modüller), MCP help/server/dashboard temizliği. Sprint 90. 2/3 |
| 91 | 12196+ | %96+ | Ajan tiebreaker v2 fix, promotion/demotion yürütme, evolved rules injection. Sprint 91. 4/7 |
| 92 | 12196+ | %96+ | Config cleanup, dashboard i18n (StatusPage, TaskCard, DebtTable, +35 anahtar). Sprint 92 i18n. 5/5 |
| 93 | 12196+ | %49 | RETRO skill performance fix, avgQualityScore persist fix, job notification. Sprint 93. 4/4 |
| 94 | 12196+ | %24 | Quality score routing verification, usage cleanup from docs, stats sync. Sprint 94. 4/4 |
| 95 | 12196+ | %96+ | Skill name mismatch düzeltmeleri (learnings.json). Sprint 95. 1/1 |
| 96 | 12196+ | %96+ | Doküman sayı/tablo düzeltmeleri (README, DECKENT, IDENTITY, cli.md). Sprint 96. 10/10 |
| 97 | 12196+ | %24 | ModelRegistry sınıfı: 13 model, 3 sağlayıcı, mode-presets, Init wizard refactor. Sprint 97. 12/12 |
| 98 | 12196+ | %96+ | RETRO done counter fix, sprint history tool fix (.brain/ iki dizin okuma). Sprint 98. 5/5 |
| 99 | 12196+ | %96+ | Evaluations map debug fix, job output reform, README badge güncellemeleri. Sprint 99. 5/5 |
| 100 | 12196+ | %32 | 6 görev tamamlandı, kod değişiklikleri +360/-98. Sprint 100 milestone. 27dk |
| 101 | 12196+ | %96+ | Write permission sorunları, 4/10 kısmi tamamlanma. Sprint 101 Docker. 4/10 |
| 102 | 12196+ | %96+ | Worker timeout — tüm görevlerde (Docker stabilizasyon). Sprint 102. 0/6 |
| 103 | 12196+ | %96+ | Docker backend entegrasyon test, docs guide eklendi. Sprint 103 Docker E2E. 6/7 |
| 104 | 12196+ | %96+ | Worker timeout — docker/README/parity/verification. Sprint 104 Docker debug. 0/4 |
| 105 | 12196+ | %24 | 4 görev örtük tamamlama. Sprint 105 stabilizasyon. 11dk |
| 106 | 12196+ | %33 | Auditor edge test fix, pattern reader test fix. Sprint 106 test. 3/3 |
| 107 | 12196+ | %96+ | CLI smoke dosyaları + vitest control eklendi. Sprint 107 CLI test. 2/2 |
| 108 | 12196+ | %96+ | tmux smoke dosyaları + test suite eklendi. Sprint 108 tmux test. 2/2 |
| 109 | 12196+ | %96+ | Sprint 109 — Docker backend iterasyon (devam) |
| 110 | 12196+ | %96+ | Sprint 110 — Docker worker stabilizasyon |
| 111 | 12196+ | %96+ | Docker smoke timeout. Sprint 111 Docker debug. 0/1 |
| 112 | 12196+ | %96+ | Sprint 112 — Docker backend iterasyon (devam) |
| 113 | 12196+ | %96+ | Sprint 113 — Docker worker stabilizasyon (devam) |
| 114 | 12196+ | %96+ | Sprint 114 — Docker backend düzeltme iterasyonu |
| 115 | 12196+ | %96+ | Docker smoke/sprint documentation timeout. Sprint 115. 0/2 |
| 116 | 12196+ | %96+ | Sprint 116 — Docker backend stabilizasyon (devam) |
| 117 | 12196+ | %96+ | Docker worker exit hatası düzeltme çabası. Sprint 117. 0/1 |
| 118 | 12196+ | %96+ | Sprint 118 — Docker backend iterasyon |
| 119 | 12196+ | %96+ | Docker verification files worker exit. Sprint 119. 0/1 |
| 120 | 12196+ | %96+ | MCP docker test worker exit. Sprint 120. 0/1 |
| 121 | 12196+ | %96+ | CLI Docker test dosyası oluşturuldu. Sprint 121 Docker CLI. 1/1 |
| 122 | 12196+ | %96+ | MCP reconnect test dosyası. Sprint 122 MCP test. 1/1 |
| 123 | 12196+ | %96+ | ADR-027 Hybrid Backend (tmux+Docker+subprocess), heartbeat type, badge. Sprint 123. 3/3 |
| 124 | 12196+ | %96+ | Context estimator, context-aware router, token usage tracking, reporter. Sprint 124. 4/4 |
| 125 | 12196+ | %96+ | Rubric grading, worker question mechanism, deckent_explain MCP. Sprint 125. 0/5 (false NO_GO) |
| 126 | 12196+ | %96+ | FIX phase evaluations map, evaluateWithRubric transition. Sprint 126. 0/5 |
| 127 | 12196+ | %0 | Promotion pipeline guard validation testleri. Sprint 127. 3/3 |
| 128 | 12196+ | %96+ | deckent_explain MCP aracı teyit, debt fix timeout. Sprint 128. 5/8 |
| 129 | 12196+ | %29.8 | ANALYSIS fix, test cleanup, kod sadeleştirme. Sprint 129. 3/3 |
| 130 | 12196+ | %96+ | Sprint 130 — stabilizasyon iterasyonu, Sprint 129 düzeltme doğrulaması |
| 131 | 12200+ | %96+ | Sprint 131 — ADR-029 Managed-Docs Universalization + ADR-030 Template Engine + ADR-031 Content Hash Cache + ADR-032 i18n Pattern System. Dört ADR tek sprint'te kabul edildi |
| 132 | 12196+ | %38.3 | Task dependency pipeline temeli, decision logging, planner priority. Sprint 132. 7/7 |
| 133 | 12200+ | %8.3 | HTTP API bearer auth, config caching, ADR-029 Managed-Docs universalization, ADR-032 i18n pattern system, competitive analysis update. Sprint 133 mimari+güvenlik. 12/12 |
| 134 | 12300+ | %96+ | Sprint 134 — ADR-033 Product Vision (DOKUNULAMAZ), ADR-034 Multi-Project Isolation, Local Observability Seviye 2 (Sprint 134 T-011), Brain Self-Audit Gate (Sprint 134 T-014), Task Dependency Pipeline (Sprint 134 T-001), sprint-reporter 4-way split (Sprint 134 T-009), god object Sprint 134 T-010 |
| 135 | 12300+ | %96+ | Coordinator resilience (Sprint 135 T-001), Docker graceful shutdown (Sprint 135 T-003 — 5-sprint P0 fix), askBrain IPC registry (Sprint 135 T-004), planner priority/dependencies (Sprint 135 T-005), brain budget auto-decay (Sprint 135 T-013). 14/17 |
| 136 | 12300+ | %96+ | sprint-controller.ts slim 1890→209 LoC (ADR-024/026 kapanışı, Sprint 136 T-008), brain spurious NO_GO reconciliation (Sprint 136 T-003), gate.json wiring, load-report generation. 6/10 |
| 137 | 12300+ | %14.9 | Brain test restoration, tryCodeVerifiedDone wire, ErrorRegistry lint, BETA-TRACKER sync. Sprint 137 — canlı NO_GO reconciliation doğrulaması (Sprint 136 T-003 → Sprint 137 wire confirmed). 6/6, 93 avg rubric |
| 138 | 12400+ | %8.5 | ADR governance MADR v3 (37 ADR migration, Sprint 138 T-001), ADR-035 verification protocol (15 kanal, Sprint 138 T-002), auditor 3-pipeline (Sprint 138 T-003), event stream + scope collision detection (Sprint 138 T-004), layer 4 forensic fix (Sprint 138 T-006), auto-archive orphan tasks (Sprint 138 T-007), worker honest assessment v2 (Sprint 138 T-008), sprint resume MVP (Sprint 138 T-009). Sprint 138 en büyük mimari. 11/11, 91 avg rubric |
| 139 | 12450+ | %96+ | Docker HB core fix P0 (Sprint 139 T-013), chain dependency scheduler Kahn's algo (Sprint 139 T-028), backend parity 3/3 Docker+tmux+subprocess E2E (Sprint 139 T-017/018/019), ADR-037 RBAC +1370 LoC (Sprint 139 T-034/035), ADR-038/039 self-modifying detection +789 LoC (Sprint 139 T-051/052), worker event hooks (Sprint 139 T-041), event stream runtime E2E (Sprint 139 T-044), notification dispatcher. Sprint 139 en büyük sprint. 41/52, 3h, +14471 LoC |
| 140 | 12450+ | %96+ | Sprint 140 — Memory V2 DB-first migration başlangıcı, SQLite veritabanı tek doğruluk kaynağı olarak belirlendi, MemoryStore API tanımlandı, Sprint 140 token usage zorunlu hale getirildi |
| 141 | 12485 | %25 | Codebase analizi sprint: core/ (58 modül), orchestra/ (65 modül), cli/, mcp/, dashboard/, tests/, docs/ kapsamlı inceleme, architecture graph, circular dependency audit, dead code audit, type safety audit. Sprint 141 analiz. 15/18, 8 tech debt |
| 142 | 12485 | %89+ | Devasa kod inceleme batched: core 7 batch, orchestra 9 batch, CLI 7 batch, MCP 3 batch, agents/providers, dashboard 2 batch, tests 6 batch, docs 2 batch. Meta-audit: arch/dead code/security/i18n/Memory V2. Sprint 142 inceleme. 44/49 |
| 143 | 12485 | %14.2 | Chain reform: güvenlik fix (shell injection → spawnSync whitelist, path traversal engelleme), .brain/memory.db git tracking, FTS5 query builder, relations hybrid backfill, Memory V2 migration (ci-reporter + managed-docs), ADR-009/010 güncellemeleri, layer 4 wire, task restoration, panic kill guard, e2e harness, MCP disconnect fix, heartbeat execSync whitelist. Sprint 143 güvenlik+hafıza. 19/20 |
| 144 | 12485 | %52.1 | Dosya bölmeleri (init 1669→4 dosya, doctor 1102→3 dosya, retro 453→3 dosya), worker.ts bölme girişimi (NO_GO timeout), dead code temizliği dalgaları (2 timeout), auditor async scan, dockerfile hardening, i18n CLI (5 cmd), Docker HB deploy doğrulama, event stream emit, sprint-state lifecycle, orphan cleanup, Memory V2 test (+40), heartbeat test (+24), prompt assertion refactor, memory leak fix. Sprint 144 refaktör+test. 24/27 |
| 145 | 12485+ | %89.3 | Adaptive timeout sistemi (timeout-watcher.ts + timeout-estimator.ts), unified native observability (event-stream.ts + event-bus.ts + monitor-adapter.ts), CLI/MCP kapsamlı audit, DECKENT-ANA-PLAN-TR.md v3.0 güncelleme (Sprint 145 T-020). Sprint 145 olgunlaşma. 🔄 Devam ediyor |

### Tarihsel Dönüm Noktaları (Sprint 1 → Sprint 145)

**Sprint 6 — İlk dogfooding:** Deckent `deckent start` komutunu kendi üzerinde çalıştırdı, 86 saniyede 1 worker ile README.md oluşturdu. Tam orkestrasyon döngüsü (PLAN→SPAWN→EXECUTE→EVALUATE→RETRO→CLEANUP) ilk kez uçtan uca çalıştı.

**Sprint 12-13 — AI Planlama:** Brain, AI ile görev planlama yeteneği kazandı. planner.ts Zod doğrulamalı yapılandırılmış çıktı üretir. Başarısız olursa otomatik olarak structured moda düşer. Auditor ayrı tmux sürecinden Brain içi tarama döngüsüne taşındı.

**Sprint 15 — Bağımsızlık:** DECKENT.md tek gerçek kaynak oldu. CLAUDE.md ve AGENTS.md artık adaptörler — `ensureDeckentImport()` ile `@DECKENT.md` enjeksiyonu alan. Deckent kendi `.deckent/` yapısıyla self-hosting yapıyor.

**Sprint 17 — Güvenilirlik:** MCP `deckent_start` artık timeout olmuyor — `child_process.fork()` ile arka plan görevi. Sprint ID asla geri atlamaz. Dashboard temiz sıfırlanır. React test altyapısı. 1027 test.

**Sprint 18-23 — Orkestrasyon Doğrulama:** Sprint 10'dan beri ilk gerçek `runSprint`. 8 paralel sonnet worker 260sn'de 8 doküman tamamladı. Sprint 23'te AI planner post-validation fallback ile ilk kez 12/12 görev planlandı ve tamamlandı.

**Sprint 24-25 — Plugin ve i18n:** Plugin v2 sistemi (yükle/oluştur/kaldır/hook'lar) ve i18n çalışma zamanı. Tek sprint'te +1449 test. OSS altyapısı: CONTRIBUTING.md, LICENSE, CI pipeline.

**Sprint 29 — Ajan Havuzu:** Dinamik ajan havuzu sistemi. 8 yerleşik ajan. Brain görev başına en iyi ajanı otomatik seçer. LRU eviction ile havuz yönetimi.

**Sprint 38 — Çoklu Sağlayıcı:** Tam çoklu sağlayıcı altyapısı. 8 model, 3 sağlayıcı. ProviderAdapter arayüzü, tier-based model eşdeğerliği, sağlayıcı fallback zinciri. 8555 test.

**Sprint 046 — 10K Test:** Test sayısı ilk kez 10.000'i aştı. 32+ CLI komutu. Çoklu ortam runtime.

**Sprint 063 — Routing V2:** Intent-based 3 katmanlı yönlendirme motoru. TaskDNA analizi → niyet sınıflandırma → ajan seçimi → yetenek seçimi. forceSkills ve forceModel desteği.

**Sprint 070-071 — Windows:** Deckent ilk kez yerel Windows'ta çalıştı. 22 bug bulundu ve düzeltildi. shell:true, periyodik heartbeat, UTF-8 encoding.

**Sprint 072-076 — God Object Bölme:** sprint-controller.ts 3 fazda sistematik ayrıştırıldı. sprint-phases.ts, sprint-utils.ts, result-collector.ts çıkarıldı. brain.ts ince re-export katmanı.

**Sprint 073 — Self-dogfooding:** Deckent kendi sprint sistemiyle 100 test regresyonunu düzeltti (0 fail). Orkestrasyon sisteminin kendi kod tabanını güvenilir şekilde düzeltebildiğini kanıtladı.

**Sprint 088 — Sprint Timeout Reform:** Heartbeat daemon, human checkpoints. Worker'lar blocker durumda Brain'e soru sorabiliyor. CLI/MCP ile onay/red.

**Sprint 089-090 — Usage Temizliği:** Usage modülü tamamen kaldırıldı — 1618 satır silindi, 13 test dosyası temizlendi. Sistem sadeleştirildi.

**Sprint 097 — ModelRegistry:** 13 model, 3 sağlayıcı (Claude, Codex, Gemini), 4 tier (premium_plus, premium, standard, economy). Mode presets: performance/balanced/economic/api.

**Sprint 101-123 — Docker Backend:** 20+ sprint süren Docker stabilizasyon dönemi. Worker exit, timeout sorunları sistematik olarak çözüldü. Sprint 123'te ADR-027 Hybrid Backend kabul edildi — tmux + Docker + subprocess üçlü strateji.

**Sprint 131 — Managed Docs:** ADR-029/030/031/032 kabul edildi. Sprint yaşam döngüsü template-based doküman güncelleme. `.deckent/docs.json` ile yapılandırılabilir.

**Sprint 134 — Product Vision:** ADR-033 kabul edildi — "Deckent bir üründür, servis değildir." SaaS, cloud deployment, paywall kalıcı olarak yasaklandı. ADR-034 Multi-Project Isolation.

**Sprint 136 — God Object Slim Tamamlandı:** sprint-controller.ts 1890→209 satır. ADR-024/026 kapanışı.

**Sprint 138 — ADR Governance:** MADR v3 hibrit format + 37 ADR migration. ADR-035 Verification Protocol (15 kanal). Auditor 3-Pipeline Verification. Event Stream. Worker Honest Assessment v2. Sprint Resume MVP. 11/11 görev.

**Sprint 139 — RBAC ve En Büyük Sprint:** 52 planlı görev, 41 tamamlandı, 3 saat, +14471 LoC. ADR-037 RBAC. ADR-038/039 Self-Modifying Detection. Chain Dependency Scheduler. Backend Parity 3/3 E2E.

**Sprint 140 — Memory V2 Başlangıcı:** SQLite DB-first geçiş planlandı. `.brain/memory.db` tek doğruluk kaynağı olarak belirlendi. MemoryStore API tanımlandı: CRUD, FTS5 tam metin arama, etiket yönetimi, ilişki grafiği, decay (zayıflama), değişiklik geçmişi. Sprint 140'tan itibaren tokenUsage zorunlu — eksik result dosyaları NO_GO.

**Sprint 141 — Codebase Analizi:** Core/ (58 modül), orchestra/ (65 modül), cli/, mcp/, dashboard/, tests/, docs/ ayrı ayrı analiz edildi. Architecture graph, circular dependency audit, dead code audit ve type safety audit tamamlandı. 15/18 görev, 8 tech debt. Sprint 142'nin devasa kod inceleme sprint'inin temelini oluşturdu.

**Sprint 142 — Devasa Kod İnceleme:** 49 görev, 44 tamamlandı. Core 7 batch, orchestra 9 batch, CLI 7 batch, MCP 3 batch sistematik inceleme. Meta-audit'ler: mimari tutarlılık, dead code tespiti, güvenlik taraması, i18n coverage, Memory V2 uyumluluk kontrolü. Sprint 142 Deckent tarihinin en büyük inceleme sprint'i.

**Sprint 143 — Chain Reform ve Güvenlik:** 19/20 görev. Güvenlik düzeltmeleri: shell injection (execSync → spawnSync whitelist), path traversal engelleme. FTS5 query builder iyileştirmesi. Relations hybrid backfill. Memory V2 migration (ci-reporter + managed-docs). ADR-009/010 güncellemeleri. MCP disconnect fix. Sprint 143 güvenlik odaklı en kapsamlı sprint.

**Sprint 144 — Büyük Refaktör:** 24/27 görev. Dosya bölmeleri: init.ts 1669→4 dosya, doctor.ts 1102→3 dosya, retro.ts 453→3 dosya. Dead code temizliği dalgaları (ADR-038). Auditor async scan geçişi. Dockerfile hardening. i18n CLI (5 komut). Memory V2 testleri (+40), heartbeat testleri (+24), prompt assertion refactor, memory leak düzeltmeleri. Sprint 144 modülerlik ve test kalitesi sprint'i.

**Sprint 145 — Olgunlaşma (Devam Ediyor):** Adaptive timeout sistemi (timeout-watcher.ts + timeout-estimator.ts), unified native observability (event-stream.ts + event-bus.ts + monitor-adapter.ts), CLI/MCP kapsamlı audit (41+ komut, 22 araç). DECKENT-ANA-PLAN-TR.md v3.0 güncelleme — Sprint 23'ten Sprint 145'e kadar tüm gelişmeler. Sprint 145 ile Deckent 145+ sprint deneyimini taşıyan olgun bir orkestrasyon platformu haline geldi.

### Sprint 130-145 Mimari Evrim Özeti

Sprint 130 ile Sprint 145 arasındaki 16 sprint'lik dönem, Deckent'in "çalışan orkestratör"den "olgun platform"a dönüşümünü temsil eder:

| Dönem | Sprint Aralığı | Ana Tema | Sonuç |
|-------|---------------|----------|-------|
| Managed Docs | Sprint 131-133 | Template-based doküman güncelleme | 4 ADR (ADR-029/030/031/032) |
| Vizyon | Sprint 134 | Product identity | ADR-033 (Product Not Service), ADR-034 (Isolation) |
| Orkestrasyon | Sprint 135-137 | Coordinator resilience, god object slim | sprint-controller.ts 1890→209 LoC |
| Protokol | Sprint 138 | Formal communication protocol | ADR-035 (15 kanal), ADR-036 (governance) |
| RBAC | Sprint 139 | Formal authority matrix | ADR-037 (RBAC), ADR-038/039 (self-mod) |
| Hafıza | Sprint 140-143 | SQLite DB-first bellek | Memory V2, FTS5, turkishNormalize |
| Kalite | Sprint 144 | Modülerlik ve test | Dosya bölmeleri, +64 yeni test |
| Olgunlaşma | Sprint 145 | Timeout, observability, audit | Adaptive timeout, event bus |

Bu evrim boyunca ADR sayısı 29'dan 39'a, test sayısı 12.300+'dan 12.485+'a, sprint yaşam döngüsü 6 fazdan 8 faza genişledi.

---

# 25. MEMORY V2 DB-FIRST MİMARİSİ

## Genel Bakış

Sprint 140'tan itibaren bellek sistemi dosya-tabanlı mimariden (MEMORY.md, DECISIONS.md) SQLite veritabanı tabanlı mimariye geçiş yaptı. `.brain/memory.db` tek doğruluk kaynağıdır.

## Mimari

```
                    ┌─────────────────────┐
                    │   deckent recall     │ CLI
                    │   deckent remember   │
                    │   deckent memory     │
                    └─────────┬───────────┘
                              │
┌─────────────────────────────▼───────────────────────────┐
│              MemoryStore (memory-store.ts)                │
│  SQLite (better-sqlite3) — WAL modu — FK kısıtlamaları  │
│                                                          │
│  5 Tablo:                                                │
│  ├── entries      → Ana bilgi tablosu (8 tip)           │
│  ├── tags         → Normalize edilmiş çoktan-çoğa ilişki│
│  ├── relations    → Çapraz referans (references,        │
│  │                   supersedes, caused_by, resolves,    │
│  │                   blocks, depends_on)                 │
│  ├── entry_history → Alan-düzeyinde değişiklik takibi   │
│  └── schema_version → Migration güvenliği               │
│                                                          │
│  + entries_fts (FTS5 sanal tablo)                        │
│    8 sütun: 4 orijinal + 4 turkishNormalize             │
└─────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────┐  ┌──────────────┐  ┌────────────┐
    │ memory-query │  │ memory-export│  │memory-import│
    │ FTS5 arama   │  │ DB → .md     │  │ .md → DB   │
    │ dual-layer   │  │ snapshot     │  │ migration  │
    └─────────────┘  └──────────────┘  └────────────┘
```

## FTS5 Dual-Layer Arama

`searchMemory()` fonksiyonu iki katmanlı arama yapar:
1. **Orijinal metin**: title, content, summary, tag_text sütunlarında FTS5 araması
2. **Normalize edilmiş metin**: turkishNormalize() ile dönüştürülmüş *_norm sütunlarında arama

İki katman OR operatörüyle birleştirilir → %100 recall (TR/EN/DE test edilmiş, 15/15 test geçti).

### Sorgu API'si

```typescript
searchMemory(store, {
  text: 'docker heartbeat',          // FTS5 dual-layer arama
  type: ['adr', 'memory'],           // entry tipine göre filtre
  status: ['accepted'],              // duruma göre filtre
  sprint_range: { min: 135 },        // sprint numarasına göre filtre
  tags_contain: ['security'],        // etiket filtresi (AND)
  limit: 5,                          // maksimum sonuç
}): MemorySearchResult[]
```

### Akıllı Sorgu Kaçışı

`escapeFts5Query()` fonksiyonu FTS5 operatörlerini (OR, AND, NOT) ve wildcard desteğini korurken token'ları tırnak içine alır. İki mod:
- `mode='or'`: Geniş recall (varsayılan) — herhangi bir terim eşleşirse sonuç döner
- `mode='and'`: Kesin eşleşme — tüm terimler bulunmalı

### Decay (Zayıflama)

`store.decay(currentSprintNum, decayAfterSprints)` ile eski entry'ler otomatik zayıflatılır. `decay_exempt: true` olan entry'ler (ADR, identity) asla zayıflamaz. Varsayılan decay süresi: 3 sprint (yapılandırılabilir).

## turkishNormalize()

Unicode NFD decomposition + ASCII folding. Türkçe-spesifik karakter dönüşümleri:
- I/İ/ı/i birleştirilir
- Ş→s, Ç→c, Ğ→g, Ü→u, Ö→o dönüşümleri
- Dil-agnostik: TR, EN, DE, ES, FR ile test edilmiş

## Entry Tipleri

| Tip | Açıklama | Örnekler |
|-----|----------|----------|
| `adr` | Mimari Karar Kayıtları | ADR-001 → ADR-039 |
| `memory` | Sprint öğrenimleri | "Docker HB fix P0 çözüldü" |
| `sprint` | Sprint logları | Sprint 139 metrikleri |
| `debt` | Teknik borç kalemleri | DEBT-001, DEBT-002 |
| `pattern` | Auditor desenleri | "Worker timeout pattern" |
| `retro` | Retrospektif kayıtları | Sprint 144 retro |
| `error` | Hata logları | ERRORS.md girdileri |
| `identity` | Proje kimliği | Proje adı, versiyon |

## CLI ve MCP Entegrasyonu

```bash
# Hafızada arama
deckent recall "docker heartbeat"

# Yeni kayıt ekle
deckent remember "Sprint 145'te adaptive timeout eklendi"

# Veritabanını yeniden oluştur (export'lardan)
deckent memory rebuild

# Export oluştur (.brain/exports/*.md)
deckent memory export

# İstatistikleri göster
deckent memory stats
```

MCP aracı: `deckent_memory_query` — cross-source hafıza arama (ADR, sprint, debt, pattern).

---

# 26. ADR GOVERNANCE — MİMARİ KARAR YÖNETİŞİMİ

## Genel Bakış

Sprint 138'den itibaren mimari kararlar (ADR'ler) formal bir yönetişim sürecine bağlandı. MADR v3 hibrit format kullanılır. ADR'ler `.brain/memory.db`'de `type: 'adr'` olarak saklanır ve MemoryStore API'si ile sorgulanır.

### ADR Yaşam Döngüsü

1. **Teklif:** Brain veya geliştirici yeni bir ADR önerir
2. **Taslak:** ADR MADR v3 hibrit formatında yazılır (Context, Decision, Consequences, Alternatives)
3. **Kabul:** Brain veya insan tarafından `accepted` statüsüne geçirilir
4. **Denetim:** Worker prompt injection (ADR-036) ile tüm worker'lara ilgili ADR'ler otomatik enjekte edilir
5. **İhlal Tespiti:** Auditor `checkADRCompliance()` ile pilot ADR'leri (ADR-006, ADR-008, ADR-010) kontrol eder
6. **Güncelleme:** Mevcut ADR'ler `superseded` veya `deprecated` statüsüne geçirilebilir

### ADR-036: Mandatory Enforcement

- `scripts/adr-validator.mjs` ile ADR formatı doğrulanır
- Worker prompt'larına ilgili ADR kısıtlamaları otomatik enjekte edilir
- Worker bir accepted ADR'yi ihlal ederse → NO_GO + ADR amendment önerisi gerekir
- DECKENT.md `mandatory read` bölümünde tüm accepted ADR'ler listelenir

## ADR Listesi (39 Aktif)

| ADR | Başlık | Sprint | Durum |
|-----|--------|--------|-------|
| ADR-001 | TypeScript + ESM | 1 | accepted |
| ADR-002 | Node16 Module Resolution | 1 | accepted |
| ADR-003 | vitest over Jest | 1 | accepted |
| ADR-004 | 3-Layer Config Merge | 1 | accepted |
| ADR-005 | Synchronous I/O | — | deprecated |
| ADR-006 | spawnSync Security Pattern | — | accepted |
| ADR-007 | SpawnOptions Interface | — | accepted |
| ADR-008 | Brain Merkezi Import — Tek Yönlü Bağımlılık | — | accepted |
| ADR-009 | DEBT.md Markdown Tablo Formatı | — | accepted |
| ADR-010 | Tek Runtime Dependency — commander.js | — | accepted |
| ADR-011 | node:readline/promises — Built-in Prompt | — | accepted |
| ADR-012 | register\<Name\>(program) Pattern | — | accepted |
| ADR-013 | DECKENT.md Adapter Pattern | 15 | accepted |
| ADR-014 | .deck Secret File System | 44 | accepted |
| ADR-015 | TaskRouter Module — 6-level routing | 44 | accepted |
| ADR-016 | Connector Module — provider lifecycle | 44 | accepted |
| ADR-017 | MCP-Native Provider Adapters | 45 | accepted |
| ADR-018 | Multi-Environment Config Generation | 46 | accepted |
| ADR-019 | Language-Agnostic Worker Verify | 46 | accepted |
| ADR-020 | Rich Sprint Output — 7-section summary | 44 | accepted |
| ADR-021 | Kraken ASCII Brand Identity | 44 | accepted |
| ADR-022-v2 | CLI/MCP Feature Parity | 85 | accepted |
| ADR-023 | Plan Tier Generalizasyonu | 72 | accepted |
| ADR-024 | sprint-controller.ts God Object Split | 72 | accepted |
| ADR-025 | Graceful Shutdown Stratejisi | 76 | accepted |
| ADR-026 | God Object Split Stratejisi — Faz 1-3 | 76 | accepted |
| ADR-027 | Hybrid Spawn Backend | 123 | accepted |
| ADR-028 | Decision-Engine V1 → V2 Routing Migration | — | accepted |
| ADR-029 | Managed-Docs Universalization | 131 | accepted |
| ADR-030 | Template Engine + Plugin Loader | 131 | accepted |
| ADR-031 | Content Hash Cache | 131 | accepted |
| ADR-032 | i18n Pattern System | 131 | accepted |
| ADR-033 | Product Vision — Product Not Service | 134 | accepted |
| ADR-034 | Multi-Project Isolation | 134 | accepted |
| ADR-035 | Verification Protocol Standard V1.0 | 138 | accepted |
| ADR-036 | ADR Governance Integration | 138 | accepted |
| ADR-037 | Brain-Auditor-Worker Authority Matrix RBAC | 139 | accepted |
| ADR-038 | Dead Code Disposition | 139 | accepted |
| ADR-039 | Self-Modifying Task Detection | 139 | accepted |

## ADR-035: Verification Protocol V1.0

Brain ↔ Worker ↔ Auditor arasında 15 kanal kodu tanımlar:
- `BRAIN→WORKER:TASK_ASSIGN` — Görev atama
- `BRAIN→WORKER:ANSWER` — Worker sorusuna yanıt
- `BRAIN→WORKER:FIX_REQUEST` — Düzeltme talebi
- `WORKER→BRAIN:HEARTBEAT` — Yaşam sinyali
- `WORKER→BRAIN:RESULT` — Görev sonucu
- `WORKER→BRAIN:QUESTION` — Blocker sorusu
- `WORKER→AUDITOR:CODE_VERIFY_REQUEST` — Kod doğrulama talebi
- `AUDITOR→BRAIN:VERIFICATION_RESULT` — Doğrulama sonucu
- `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` — Kapsam çakışması
- `AUDITOR→BRAIN:ADR_VIOLATION` — ADR ihlali
- `AUDITOR→BRAIN:GATE_COMPUTED` — Sprint gate sonucu
- `BRAIN→*:SPRINT_PHASE_CHANGE` — Faz geçişi yayını
- `BRAIN→*:METRIC_EMITTED` — Metrik yayını
- `DECKENT→USER:NOTIFY` — Kullanıcı bildirimi

## ADR-037: RBAC Protocol V1.0

Her bileşenin yetki sınırları formal olarak tanımlıdır. NIST SP 800-162 prensiplerine uyumlu.

### Brain Yetkileri
- **YAZMA İZNİ:** `.tasks/*`, `.brain/MEMORY.md`, `.brain/RETRO.md`, `.brain/DEBT.md`, `.brain/PATTERNS.md`, `.brain/sprints/sprint-*.md`, `.brain/archive/*`, `.deckent/sprint-*-events.jsonl` (append), `.deckent/sprint-*-checkpoint.json`, `.deckent/config.json`, `.deckent/cache/*`
- **YAZMA YASAĞI:** `src/**` (Brain kaynak kodu yazmaz), `tests/**`, `.brain/DECISIONS.md` (yalnızca insan veya governance süreci), `.dashboard` (Auditor münhasır), `.locks/*`

### Auditor Yetkileri
- **YAZMA İZNİ:** `.dashboard` (30sn scan cycle), `.deckent/sprint-*-gate.json`, `.deckent/sprint-*-events.jsonl` (append), `docs/audits/*`, `.brain/PATTERNS.md` (yalnızca append), `.locks/*` (stale lock temizliği)
- **YAZMA YASAĞI:** `src/**` (ASLA — audit bağımsızlığı dokunulamaz), `tests/**`, `.tasks/*.json` (Brain münhasır), `.brain/MEMORY.md`, `.brain/RETRO.md`, `.deckent/sprint-state.json`

### Worker Yetkileri
- **YAZMA İZNİ:** Yalnızca atanan task'ın `scope.filesWrite` ve `scope.directories` içindeki dosyalar. Kendi `.tasks/task-{ownId}.*` dosyaları (hb, result, plan, verify-delta.json). Kendi scope'undaki `.locks/` dosyaları.
- **YAZMA YASAĞI:** Başka worker'ın dosyaları (lateral movement engeli), `.brain/DECISIONS.md` (privilege escalation engeli), `.dashboard`, `docs/audits/*`, scope dışı `src/**`

### Çapraz Rol Kuralları
- **Kural 1 — Görev Ayrılığı:** Worker self-assessment yazar, Auditor bağımsız doğrular, Brain nihai karar verir. Aynı bileşen hem uygulayıcı hem denetleyici olamaz.
- **Kural 2 — Worker İzolasyonu:** Worker'lar arası doğrudan iletişim yasak. Tüm koordinasyon Brain üzerinden.
- **Kural 3 — Auditor Bağımsızlığı:** Auditor hiçbir koşulda kaynak kodu yazmaz (dokunulamaz kural).
- **Kural 4 — Brain Orkestrasyon Sınırı:** Brain planlama ve karar verir, doğrudan kod üretmez.
- **Kural 5 — Event Stream Bütünlüğü:** Append-only, değiştirilemez, silinemez. Bozulma durumunda file-based fallback.

### Enforcement Mekanizması
- **Katman 1 — Compile-Time:** `npm run lint:adr` authority matrix doğrulaması, worker prompt injection (ADR-036), `isWithinScope()` symlink-aware kontrol
- **Katman 2 — Runtime:** Auditor 30s scan cycle `git diff --stat`, event stream source doğrulaması, file lock çakışma tespiti
- **Katman 3 — Post-Hoc:** Event stream replay, sprint gate raporunda authority violation sayısı, docs/audits/ audit raporları

---

# 27. ADAPTIVE TIMEOUT SİSTEMİ

## Genel Bakış

Sprint 88'de başlayan ve Sprint 145'te olgunlaşan adaptif timeout sistemi, worker görevlerinin süre aşımını akıllıca yönetir. Sprint 101-122 Docker backend stabilizasyon dönemindeki timeout sorunlarından (Sprint 102, Sprint 104, Sprint 111, Sprint 115, Sprint 117, Sprint 119, Sprint 120'de %100 NO_GO oranı) öğrenilen derslerle tasarlandı.

## Motivasyon

Sprint 139'a kadar timeout'lar sabit değerlerdi (varsayılan 1200 saniye / 20 dakika). Bu yaklaşımın sorunları:
- Basit görevler (doküman güncellemesi) için fazla uzun — kaynak israfı
- Karmaşık görevler (multi-file refactor) için kısa — false NO_GO
- Backend farkları göz ardı ediliyordu (Docker daha yavaş, subprocess daha hızlı)
- Sprint geçmişinden öğrenme yoktu

## Bileşenler

### Timeout Estimator (`timeout-estimator.ts`)

Brain tarafından PLAN fazında kullanılır. Görev özelliklerine göre sezgisel timeout hesaplar:

| Faktör | Etkisi |
|--------|--------|
| Effort (low/normal/high) | Temel süre (3dk / 10dk / 20dk) |
| LoC delta | Satır sayısı çarpanı |
| Scope complexity | Dizin + dosya sayısı çarpanı |
| Sprint history | Geçmiş sprint verilerinden öğrenme |
| Backend type | Docker: 1.0x, tmux: 0.9x, subprocess: 0.8x |

Sonuç: `TimeoutBreakdown` yapısı — temel timeout + çarpanlar + nihai klamped değer.

### Timeout Watcher (`timeout-watcher.ts`)

Runtime'da çalışan izleme daemon'u (Option B Watcher):

- Worker heartbeat tazeliğini kontrol eder (varsayılan: 60 saniye eşiği)
- `git diff` ile anlamlı ilerleme tespit eder (minimum 30 satır)
- İlerleme varsa timeout'u uzatabilir (maksimum 2 uzatma)
- Varsayılan: KAPALI (runtime_extension_enabled: false)

---

# 28. UNIFIED NATIVE OBSERVABILITY

## Genel Bakış

Sprint 134'te Local Observability Seviye 2 ile başlayan ve Sprint 138-145 arasında olgunlaşan birleşik gözlemlenebilirlik katmanı, tüm sprint olaylarını tek bir kanalda toplar. Sprint 134 T-011 ile brain metrikleri, Sprint 138 T-004 ile event stream, Sprint 139 T-041 ile worker event hooks ve notification dispatcher eklendi.

## Event Stream (`event-stream.ts`)

- **Format:** Append-only JSONL (`.deckent/sprint-NNN-events.jsonl`)
- **Protocol:** ADR-035 V1.0 — 15 kanal kodu
- **Fail-safe:** Yazma hatası → console.warn + kilitlenme yok
- **Geriye uyumluluk:** Eski .hb/.result dosyaları ile uyumlu
- **Monotonic sequence:** Sprint başına artan sıra numaraları

### DeckentEvent Yapısı

```typescript
{
  timestamp: string;           // ISO 8601
  sequence: number;            // Monotonic sıra
  protocol_version: "1.0";     // Protocol versiyonu
  source: string;              // brain | worker | auditor | deckent | user
  target: string;              // brain | worker | auditor | * | user
  channel: string;             // Kanal kodu (ADR-035)
  payload: Record<string, any> // Olay verisi
}
```

## Event Bus (`event-bus.ts`)

- **In-process pub/sub:** Node.js EventEmitter üzerine kurulu
- **Filtered subscriptions:** sprintId + kanal filtreleme
- **tail():** Son N olayı okuma (yeni aboneler için backfill)
- **watchFile():** fs.watch ile cross-process olay tespiti

## Monitor Adapter (`monitor-adapter.ts`)

Backend-agnostic worker izleme:
- `listActiveWorkers()` — Aktif worker listesi
- `captureWorkerOutput()` — Worker çıktısı yakalama
- `getResourceUsage()` — Kaynak kullanımı (CPU, RAM)
- `killWorker()` — Worker sonlandırma

Docker, tmux ve subprocess backend'ler için ayrı adapter implementasyonları.

---

# 29. COST MANAGEMENT SİSTEMİ

## Genel Bakış

Sprint 124'te token usage tracking ile başlayan ve Sprint 141'de parametrik çoklu-sağlayıcı maliyet yönetimi olarak olgunlaşan sistem. Sprint 97'deki ModelRegistry (13 model, 3 sağlayıcı) üzerine inşa edilmiştir. ADR-033 offline-first prensibi gereği tüm fiyatlandırma yerel olarak saklanır.

## Bileşenler

### Cost Calculator (`cost-calculator.ts`)

- Sıfır sabit-kodlu fiyatlandırma — tüm oranlar `.deckent/cost-config.json`'dan
- 3 güven aralığı: naïve, realistic, worst-case
- Karma faturalandırma modları: API key + subscription + free tier ayrı takip
- Girdi: model, tahmini token sayıları, faturalandırma modu, effort
- Çıktı: `SprintCostEstimate` — sağlayıcı bazlı dökümü, subscription etkisi, toplam API maliyet (USD)

### Token Counter (`token-counter.ts`)

- Token tahmini: kelime/0.75 yaklaşımı
- `TokenBudget`: ModelRegistry context window'larından otomatik oluşturma
- `ContextBudgetEstimate`: tahmini token, model bütçesi, bütçe içinde mi, kullanım yüzdesi

### Pricing Updater (`pricing-updater.ts`)

- Çoklu-sağlayıcı otomatik fiyat çekme
- Birincil: LiteLLM JSON (100+ sağlayıcı, günlük güncelleme, MIT lisansı)
- İkincil doğrulayıcı: OpenRouter API (>%5 fark uyarısı)
- Fallback: paketlenmiş baseline (ADR-033 offline-first)
- Sonuç: güncellenen/eklenen/değişmeyen model sayıları

### Prompt Token Optimizer (`prompt-token-optimizer.ts`)

- TaskDNA'ya göre yetenek prompt'larını filtreler
- `computeSkillRelevance()`: V2 aktivasyon kuralları ile 0.0-1.0 puan
- Eşik: 0.3 (altındaki yetenekler filtrelenir)
- Sonuç: %96 bağlam azaltma

## CLI Kullanımı

```bash
# Sprint maliyet tahmini
deckent cost

# Fiyatları güncelle
deckent cost update
```

---

# 30. SPRİNT 145 KAPANIŞ BÖLÜMÜ

## Sprint 145 Özeti

Sprint 145, Deckent'in Aşama 5 (Olgunlaşma ve Kurumsal Hazırlık) döneminin önemli bir sprint'idir. Bu sprint'te üç ana tema çalışıldı:

### 1. Adaptive Timeout Sistemi

Sprint 101-122 Docker backend stabilizasyon döneminde yaşanan timeout sorunlarından (Sprint 102, Sprint 104, Sprint 111, Sprint 115, Sprint 117, Sprint 119, Sprint 120'de %100 NO_GO oranları) öğrenilen derslerle tasarlandı. İki bileşen:

- **timeout-estimator.ts:** Görev özelliklerine (effort, LoC, scope, backend tipi) ve sprint geçmişine göre sezgisel timeout hesaplama. Sprint 139'a kadar sabit 1200 saniye olan timeout değeri artık dinamik.
- **timeout-watcher.ts:** Runtime izleme — heartbeat tazeliği kontrolü, git diff ile anlamlı ilerleme tespiti, ilerleme varsa timeout uzatma (maksimum 2 uzatma).

### 2. Unified Native Observability

Sprint 134'te başlayan Local Observability Seviye 2 ile Sprint 138'de eklenen Event Stream'in birleşimi:

- **event-stream.ts genişletmeleri:** Daha zengin payload, hata toleransı, performans iyileştirmeleri
- **event-bus.ts:** In-process pub/sub — filtered subscriptions, tail(), watchFile()
- **monitor-adapter.ts:** Backend-agnostic worker izleme — Docker, tmux, subprocess için ortak arayüz

### 3. CLI/MCP Kapsamlı Audit

41+ CLI komutu ve 22 MCP aracının sistematik denetimi:

- Parametre tutarlılığı (CLI ↔ MCP eşleştirme, ADR-022-v2 compliance)
- i18n coverage (eksik çeviri anahtarları tespiti)
- Hata mesajı kalitesi (kullanıcı-dostu, çözüm önerili)
- Dokümantasyon doğruluğu (help text ↔ gerçek davranış uyumu)

## Deckent v3.0 Toplam Kazanımlar (Sprint 23 → Sprint 145)

| Metrik | Sprint 23 | Sprint 145 | Değişim |
|--------|-----------|------------|---------|
| Test sayısı | 1.422 | 12.485 | +778% |
| CLI komutları | 32 | 41+ | +28% |
| MCP araçları | 17 | 22 | +29% |
| MCP kaynakları | 9 | 8 | -1 (optimize) |
| Yerleşik ajanlar | 0 | 16 | +16 |
| Yerleşik yetenekler | 0 | 21 | +21 |
| Sağlayıcılar | 1 | 3 | +2 |
| Modeller | 1 | 13 | +12 |
| ADR'ler | 4 | 39 | +35 |
| Sprint controller LoC | ~800 | 209 | -74% |

---

# PLANIN SONU

Bu doküman Deckent'in uygulaması için tek doğruluk kaynağıdır.
MCP araçlarını kullanın: "Deckent kur" veya "Şu hedefler için sprint planla".
Veya Claude Code'da açıp söyleyin: "Bunu uygula."

**Proje İstatistikleri (Sprint 145):**
- 12.485 test + 16 atlanmış (505 dosya)
- %89.33 kapsam
- 41+ CLI komutu
- 22 MCP aracı + 8 kaynak
- 16 yerleşik ajan + 21 yetenek
- 3 sağlayıcı (Claude, Codex, Gemini)
- 13 model, 4 tier
- 39 ADR (mimari karar kaydı)
- 145+ sprint tamamlandı
- Memory V2 SQLite DB-first — FTS5 dual-layer arama
- Event Stream ADR-035 Protocol V1.0 — 15 kanal kodu
- RBAC ADR-037 Protocol V1.0 — formal yetki matrisi

---

# 31. SPRİNT 146 KAPANIŞ BÖLÜMÜ

## Sprint 146 Özeti

**Tema:** "Prompt kalitesi 64/100 → 85/100 + 3 canlı kanıt bug fix + rubric 3-sistem konsolidasyon"
**Sprint tipi:** P0 ağırlıklı, Beta GA yolu (Sprint 150 GA — Per 23 Nis TRT)
**Toplam task:** 17 | **Wave sayısı:** 6 | **Hard cap:** 5h | **Cost cap:** $95

### Sprint 146 Ana Hedefleri

Sprint 145'in ürettiği 24 tech debt ve 3 canlı bug'ı köklü şekilde kapatmak:

1. **Prompt God Template Reform** (10 task) — agent V2 + limit + ADR relevance scoring + scope sanitize + generative template pattern → prompt kalite 64/100 → 85/100
2. **3 canlı bug fix** — DIRECTIVES mid-sprint silme + SDL decision log dead write + agent exclusion hard-code
3. **Rubric system consolidation** — 3 paralel skor sistemi → 1 canonical (Quality Assessor)
4. **Sprint 145 test regression fix** — vitest 3 fail
5. **Sprint 147 nervous system preflight** — ADR-040 draft + types yer ayır

### Sprint 146 Deliverables (17 Task)

| Task | Başlık | Durum |
|------|--------|-------|
| T1 | Agent Truncation Bug Fix | agent-pool.ts satır 29 kırpma kaldırıldı |
| T2 | Agent Routing V2 Retrain + Intent Classifier Refresh | test-writer %52 → ≤%22, intent mapping yenilendi |
| T3 | ADR Relevance Scoring Engine | adr-selector.ts — topN=3, skor: scope +0.4, keyword +0.3 |
| T4 | Scope Sanitizer | scope-sanitizer.ts — dist/ kaldır, global dosya koru, duplicate dedupe |
| T5 | Generative Useful God Template | prompt-god-template.ts ~400 LoC — buildTaskPrompt() tek giriş noktası |
| T6 | Task-Type ADR Preset Matrix + Filler Cleanup | TASK_TYPE_ADR_PRESETS 7 task tipi, boş header atla |
| T7 | Prompt Quality Linter | scripts/prompt-linter.mjs — avg ≥ 75/100 gate |
| T8 | DIRECTIVES.md Mid-Sprint Silme Bug Fix | phase guard: archiveDirectives yalnızca CLEANUP fazında |
| T9 | SDL Decision Log Rehabilitation | v2 routing → anlamlı log, input/output dolu |
| T10 | Rubric System Consolidation | worker self-report kaldır, Quality Assessor kanonik |
| T11 | Sprint 145 vitest Regression Fix | 3 fail test düzeltildi |
| T12 | Nervous System Preflight — ADR-040 + Types | nervous-types.ts placeholder, ADR-040 status: proposed |
| T13 | Sprint 146 Retro Template + Docs Update | Sprint-146.md + CHANGELOG 0.4.0-beta.2 |
| T14 | Agent Exclusion Dynamic | getDynamicExclusions() — intent+scope dinamik |
| T15 | Chain Safety Gate Script | scripts/chain-gate-check.mjs — 6 check |
| T16 | Sprint 146 Living Record Update | FINAL-EXECUTIVE-REPORT.md güncelleme |
| T17 | ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 146 Append | Bu bölüm |

### Sprint 146 Bug Fix Özeti

**Bug 1 — DIRECTIVES.md Mid-Sprint Silme:**
Sprint 144 ve 145'te aynı pattern: EXECUTE fazında DIRECTIVES.md template'e dönüşüyor (463 byte). Kök neden: archiveDirectives() phase guard olmadan çağrılıyor. Çözüm: `if (phase !== 'CLEANUP') return;` guard + emergency reconstruct.

**Bug 2 — SDL Decision Log Dead Write:**
.deckent/decisions/ altında 27 dosya yazılıyor ama hiçbiri okunmuyor. input/output boş. Çözüm: hibrit rehab — v2 routing + meaningful step filter + deckent explain entegrasyonu.

**Bug 3 — Agent Exclusion Hard-Code:**
architecture-planner, frontend-designer, migration-specialist her task'ta sabit exclude ediliyordu. Çözüm: getDynamicExclusions() — intent + scope kombinasyonuna göre dinamik.

### Sprint 146 Teknik Mimari Çıktıları

```
src/orchestra/
├── adr-selector.ts         (YENİ — ADR relevance scoring, topN=3)
├── scope-sanitizer.ts      (YENİ — dist/ filter, global dosya koruma)
├── prompt-god-template.ts  (YENİ ~400 LoC — buildTaskPrompt() tek giriş)
└── task-builder.ts         (GÜNCELLENDİ — god template kullanır)

src/core/
└── nervous-types.ts        (YENİ ~100 LoC — Sprint 147 placeholder)

scripts/
├── prompt-linter.mjs       (YENİ — avg ≥ 75/100 kalite gate)
└── chain-gate-check.mjs    (YENİ — 6-check sprint gate)
```

### Sprint 146 → Sprint 147 Köprüsü

Sprint 146 başarılı kapanış kriterleri:
- Prompt kalite ortalama ≥ 75/100 (linter pass)
- DIRECTIVES mid-sprint korumalı
- SDL log meaningful
- Agent exclusion dinamik
- Worker prompt rubric spec yok
- vitest ≥ %99.3
- ADR-040 draft kayıtlı
- nervous-types.ts placeholder Sprint 147 için hazır

### Sprint 147 Preview — Nervous System

Sprint 147 teması: **"Deckent Nervous System"** — yetki matrisi + bildirim motoru + güvenlik katmanı.

Tasarım spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`

Temel bileşenler:
- **AuthorityMode** + **ApprovalPolicy** — RBAC'ı runtime'da enforce et (ADR-037 ötesi)
- **NervousNotification** — kullanıcıya anlamlı bildirim akışı
- **SafetyFloorAction** — tehlikeli task'larda hard-stop guard
- **ADR-040** — nervous system governance (Sprint 147 sonunda accepted)

**Beta GA yolu:** Sprint 146 ✅ → Sprint 147 ✅ → Sprint 148 ✅ → Sprint 149 🟡 → Sprint 150 🔵 (Per 🚀 GA)

---

## Sprint 148 — Detaylı Özet

**Tema:** Meta-Dogfood + Agent Taksonomi Reform + Nervous Dogfood Aktivasyonu + Çapraz Platform Doğrulama
**Tarih:** Pzt 20 Nis 2026
**Görevler:** 28 | **Dalgalar:** 6 | **Durum:** Tamamlandı
**Planning Mode:** AI (ilk kez — Sprint 145-147 structured başarılıydı, 148'de AI riski alındı)

### Sprint 148 Tema: Self-Healing Architecture

Sprint 147'de `AgentRoutingHealth` detektörü kendi sprint'inde %95 anomali kaydetti. Sprint 148 Block A bu anomalyi çözdü → Block B (detektör yeniden çalış) pozitif sonuç döndü. **Bu Deckent'in ilk "bilinçli" sprint'i** — kendi sorunlarını gördü, nervous system ile raporladı, kendi worker'ları ile düzeltti.

### Sprint 148 Deliverable'lar (4 Blok × 6 Dalga)

**Block A — Agent Taksonomi Reformu (5 görev, Dalga 1-2):**
- T1: `test-writer` Agent Arşivleme — `.deckent/agents/archive/test-writer-removed-sprint-148/`
- T2: `testing-expert` Skill Auto-Activation Heuristik — scope tests/** veya *.test.ts
- T3: Intent Classifier "testing" Intent Kaldırma — `test-coverage` tag sistemi
- T4: Router V2 Agent Fallback — test-writer yok, architect/refactorer zinciri
- T5: 15 Agent PROMPT.md Rubric Spec Toplu Temizlik — `scripts/agent-prompt-validator.mjs`

**Block B — Nervous Dogfood + 5 Detektör Aktivasyonu (8 görev, Dalga 3-4):**
- T6: Nervous System enabled=true Pivot — BALANCED preset
- T7: Ana PID Bildirim Kapsam Zorlaması — `runtime-scope-check.ts`, ADR-037 RBAC
- T8: StaleWorkerDetector Canlı Aktivasyon + DetectorRegistry
- T9: ScopeCollisionMonitor + DebtTrendAnalyzer Canlı Aktivasyon
- T10: AgentRoutingHealth Canlı Pozitif Doğrulama (reform sonrası: severity='warning', critical değil)
- T11: DirectivesMidSprintProtection Canlı + Kasıtlı Stres Testi
- T12: CLI `deckent nervous` TUI Entegrasyon Testi + Smoke Script
- T13: MCP `deckent_nervous_*` 5 Araç Uçtan Uca Canlı Test

**Block C — Çapraz Platform Doğrulama (6 görev, Dalga 5):**
- T14: macOS E2E — tmux Backend Tam Sprint (GitHub Actions)
- T15: Linux E2E — subprocess Backend Tam Sprint
- T16: WSL2 E2E — Docker Backend Tam Sprint
- T17: Provider Matrix — Claude + Codex Karma Mini-Sprint
- T18: i18n Pariti — TR/EN Görev Açıklaması Routing Aynı
- T19: Fresh Install Matrix — Node 18/20/22 × Temiz Ortam

**Block D — Cilalama + Borç Tasfiyesi + Dokümantasyon (9 görev, Dalga 6):**
- T20: Vitest Triage — 135 Hata → < 50 Hata
- T21: Routing V3 Intent Classifier — core-dev Alt-Intent'ler
- T22: Sprint 146 T-146-011 Docker Worker Çıkış Deseni Kök Neden Düzeltmesi
- T23: CHANGELOG 0.4.0-beta.4 + Sprint-148.md
- T24: FINAL-EXECUTIVE-REPORT Sprint 148 Canlı Kayıt
- T25: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 148 Ekleme (bu bölüm)
- T26: Memory V2 Nervous Geçmişi Entegrasyonu
- T27: npm Publish Dry-Run Provası
- T28: ADR-041 Taslak — Agent Taksonomi (Yatay vs Dikey)

### Sprint 148 Mimari Çıktıları

```
.deckent/agents/archive/
└── test-writer-removed-sprint-148/  (arşivlendi)

src/nervous/
├── detector-registry.ts    (YENİ — 5 detektör registry)
├── runtime-scope-check.ts  (YENİ — Ana PID kapsam zorlaması, ADR-037)

src/core/
├── intent-classifier.ts    (GÜNCELLENDİ — 'testing' intent kaldırıldı, V3)
├── routing-types.ts        (GÜNCELLENDİ — Intent union, TaskDNA tags)
├── skill-pool.ts           (GÜNCELLENDİ — testing-expert auto-activation)

scripts/
├── agent-prompt-validator.mjs     (YENİ — rubricScores temizlik doğrulayıcı)
├── directives-stress-simulator.mjs (YENİ — detektör stres testi)
├── nervous-tui-smoke.sh           (YENİ — TUI smoke test)
├── mcp-nervous-e2e.mjs           (YENİ — MCP uçtan uca test)
├── fresh-env-test.sh              (YENİ — Node 18/20/22 fresh install)
├── npm-publish-dry.sh             (YENİ — npm publish dry-run provası)

.github/workflows/
└── cross-platform-e2e.yml         (YENİ — macOS/Linux matrix CI)
```

### Sprint 148 Detector Canlı Kanıtları

| Detektör | Sprint 148 Durumu | Kanıt |
|----------|------------------|-------|
| AgentRoutingHealth | severity='warning' (reform öncesi: critical) | test-writer removal başarılı |
| DebtTrendAnalyzer | ≥1 event — Sprint 145-147 borç eğrisi | avgDebtRate hesaplandı |
| ScopeCollisionMonitor | 0 çakışma (28 görev temiz) | plan-time trigger pozitif |
| DirectivesMidSprintProtection | ≥1 emergency + restore | stres simülatörü kanıtı |
| StaleWorkerDetector | registry aktif, canlı izleme | 5 detektör tümü etkin |

### Sprint 148 Sprint Gate Sonuçları

| Gate | Hedef | Durum |
|------|-------|-------|
| tsc --noEmit | PASS | ✅ |
| vitest fail | < 50 | ✅ (135'ten düşürüldü) |
| doctor | ≥ 92/100 | ✅ |
| NO_GO | ≤ 2 | ✅ |
| Nervous events | ≥ 10 | ✅ |
| Cross-platform | 3/3 | ✅ |
| test-writer routing | = 0 | ✅ |
| npm dry-run | PASS | ✅ |
| ADR-041 proposed | kayıtlı | ✅ |

### Sprint 148 → Sprint 149 Köprüsü

Sprint 148 kapanış kriterleri:
- test-writer agent kaldırıldı (16 → 15 built-in agent)
- `testing-expert` skill auto-activation aktif (scope tests/** tetikler)
- Intent 'testing' kaldırıldı, 'test-coverage' tag sistemi devreye girdi
- **Nervous system CANLIDA** (enabled=true, balanced preset)
- 5 detektör aktif, canlı kanıt Sprint 148 retro'da listelendi
- Cross-platform 3/3: macOS + Linux + WSL2
- Beta GA 1 day to Sprint GA: **1 gün kaldı 🚀**
- `test-writer removed` — routing anomalisi çözüldü

### Sprint 149 Preview — Dokümantasyon Konsolidasyonu + npm Publish

Sprint 149 teması: **"Son 1 km"** — npm publish v1.0.0-beta.1 + docs finalize + debt sıfır.

- `npm publish v1.0.0-beta.1` (Sprint 148 dry-run provası sonrası)
- Tüm doc'lar Sprint 148 sonrası güncel
- ADR-041 status: proposed → **accepted**
- vitest fail: < 10 hedef (148'de < 50'ye indirildi)
- **Beta GA yolu:** Sprint 149 (Çar-Per) → Sprint 150 (Per 🚀 GA 23 Nis)
