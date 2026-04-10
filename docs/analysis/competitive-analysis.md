# Deckent Competitive Analysis — April 2026

> Otonom AI Orkestrasyon Araçları Karşılaştırma Raporu

## Executive Summary

Deckent v0.4.0-beta.1, otonom AI orkestrasyon alanında teknik derinlik açısından rakiplerinin çoğundan üstün. Sprint lifecycle, self-learning, quality gates ve multi-agent sistemi benzersiz. 130+ sprint, 89.33% coverage, 21 MCP tool, 16 built-in agent, 21 built-in skill ile olgunlaşmış bir platform. Ana darboğaz: community ve visibility.

**Genel Puan: 80/100**

---

## 1. Puan Kartı

| Kriter | Puan | Gerekçe |
|--------|------|---------|
| Task Decomposition | 85/100 | AI planner + Zod + 6-step decision engine, TaskDNA + routing v2 |
| Multi-Agent Execution | 80/100 | 3-role architecture (Brain/Worker/Auditor) + 16 built-in agent pool |
| Self-Learning | 95/100 | MEMORY + PATTERNS + DECISIONS + IDENTITY + RETRO + Prompt Evolution |
| Failure Recovery | 78/100 | Task retry (2x max), rollback (4 mod), heartbeat monitoring, FIX fazı |
| Autonomy Level | 85/100 | Zero-config sprint, single-shot run, DIRECTIVES auto-archive |
| Ease of Setup | 80/100 | npx deckent init, 7 dil/20+ framework, IDE auto-register |
| Non-Developer Friendly | 42/100 | Web dashboard (6 sayfa) var ama primary CLI |
| Project Integration | 85/100 | 7 dil, 20+ framework, stack-aware verify, MCP entegrasyonu |
| Benchmarks | 0/100 | SWE-bench test edilmemiş |
| Community | 22/100 | npm publish hazır ama yayınlanmamış |
| Ecosystem Depth | 72/100 | 21 built-in skill, 16 built-in agent, marketplace altyapısı, sandbox, rating |
| Observability | 92/100 | Auditor 30s loop, 21 MCP tool, 8 MCP resource, React dashboard (6 sayfa), SSE |

---

## 2. Rakip Haritası

### Tier 1: Otonom AI Orkestrasyon (Doğrudan Rakipler)

| Araç | GitHub Stars | SWE-bench | Fiyat | Lisans | Benzersiz Güç | Zayıflık |
|------|-------------|-----------|-------|--------|---------------|----------|
| **OpenClaw** | 331K+ | — | Ücretsiz | OSS | 13K+ ClawHub skill, 100+ built-in AgentSkill, devasa ekosistem | 3+ CVE, %12-20 malicious skill, memory sistemi tartışmalı |
| **OpenHands** | 65K+ | %66.4 | Ücretsiz | OSS | En yüksek SWE-bench skoru, event-stream multi-agent | Stateless (öğrenme yok), inference-time scaling sınırlı |
| **Devin** | Proprietary | %13.86 | $20-500/ay | Proprietary | Cloud sandbox, fire-and-forget | Pahalı, stateless, vendor lock-in, düşük SWE-bench |
| **Cursor Agents** | Proprietary | — | $20-40/ay | Proprietary | IDE entegrasyonu, agentic coding UX, geniş kullanıcı tabanı | Vendor lock-in, offline yok, multi-agent zayıf |
| **Copilot Cowork** | Proprietary | — | $19-39/ay | Proprietary | GitHub ekosistemine entegrasyon, PR otomasyonu | Microsoft bağımlılığı, sınırlı özerklik, workflow-only |
| **Deckent** | — | — | Ücretsiz | MIT | Sprint lifecycle, native learning, 21 MCP tool, 16 agent, 89.33% coverage | 0 community, marketplace boş, SWE-bench yok |

### Deckent'in Benzersiz Özellikleri (Hiçbir Rakipte Yok)

1. **Sprint Lifecycle**: 8-fazlı döngü (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP)
2. **Self-Learning with Decay**: 900 satır budget, 5 sprint otomatik decay, native (3rd party bağımlılık yok)
3. **GO/NO-GO Quality Gates**: Her task'a kalite kapısı + 4 rollback policy (auto/threshold/never/ask) + Rubric-based grading
4. **6-Step Decision Engine**: TaskAnalysis → AgentSelection → SkillSelection → ModelResolution → EffortAdjust → ScopeResolve
5. **Independent Auditor**: 30s monitor loop, boundary enforcement, deadlock prevention
6. **Prompt Evolution**: Agent prompt versiyonlama, A/B test, rollback
7. **Multi-Provider Equivalence**: 3 provider (Claude/Codex/Gemini), 13 model, tier-based fallback
8. **DIRECTIVES Auto-Archive**: Sprint sonunda DIRECTIVES.md otomatik arşivlenir, placeholder hazırlanır

> **Not:** Topological sort (bağımlılık sıralama) bilgilendirici kayıtlanır ama zorunlu sıralanmaz. Agent havuzu dinamiktir (16 built-in + temp pool).

---

## 3. Head-to-Head Karşılaştırmalar

### vs OpenClaw (331K+ star)

| Kriter | OpenClaw | Deckent | Kazanan |
|--------|----------|---------|---------|
| Multi-agent | Supervisor-worker, 100+ AgentSkill, izole workspace | Brain/Worker/Auditor (3 rol, 16 built-in agent, tmux/subprocess) | **OpenClaw** |
| Persistent learning | Memory var (3rd party: Mem0/Cognee), auto-flush | MEMORY decay + PATTERNS + RETRO + Prompt Evolution (native) | **Deckent** |
| Quality gates | Yok | GO/NO-GO + Rubric scoring + rollback (4 policy) + retry (2x) | **Deckent (benzersiz)** |
| Sprint lifecycle | Yok | 8-fazlı döngü + DIRECTIVES auto-archive | **Deckent (benzersiz)** |
| Skill ecosystem | **13K+ skill (ClawHub)** + 100+ built-in | 21 built-in skill, marketplace altyapısı var | **OpenClaw (açık ara)** |
| Community | **331K+ stars**, 47K forks, Wikipedia sayfası | Tek geliştirici, henüz yayınlanmamış | **OpenClaw (açık ara)** |
| MCP Integration | Sınırlı | **21 MCP tool, 8 MCP resource** | **Deckent** |
| Setup time | ~5dk (npm + openclaw onboard wizard) | ~5dk (npx deckent init) | **Eşit** |
| Güvenlik | 3+ CVE, ClawHub'da %12-20 malicious skill | Bearer auth, plugin sandbox (AST), signature doğrulama | **Deckent** |
| Test Coverage | — | **89.33%** (12,194+ test) | **Deckent** |

### vs OpenHands (65K star, %66.4 SWE-bench)

| Kriter | OpenHands | Deckent | Kazanan |
|--------|-----------|---------|---------|
| SWE-bench | **%66.4** | Bilinmiyor | **OpenHands** |
| Persistent learning | Yok (stateless) | Full learning loop (native) | **Deckent** |
| Inference-time scaling | 5 deneme + critic | 3 deneme, FIX fazı | **OpenHands** |
| Observability | Event stream | Auditor + dashboard (6 sayfa) + SSE + notifications | **Deckent** |
| Skill/Agent system | Agent registry | 21 skill + 16 agent + marketplace + adaptive | **Deckent** |
| MCP tools | Sınırlı | **21 MCP tool** | **Deckent** |
| Coverage | — | **89.33%** | **Deckent** |

### vs Devin ($20-500/mo, %13.86 SWE-bench)

| Kriter | Devin | Deckent | Kazanan |
|--------|-------|---------|---------|
| Fire & forget | Maksimum (cloud) | Zero-config sprint | **Devin** (polish) |
| SWE-bench | %13.86 | Bilinmiyor | — |
| Learning | Yok (stateless) | Full learning loop | **Deckent** |
| Multi-agent | Cloud parallel | 16 built-in agent + adaptive | **Deckent** |
| Cost | $20-500/ay | Ücretsiz (MIT) | **Deckent** |
| Vendor lock-in | Proprietary | 3 provider, open-source | **Deckent** |
| MCP integration | Yok | 21 MCP tool | **Deckent** |

### vs Cursor Agents ($20-40/mo)

| Kriter | Cursor Agents | Deckent | Kazanan |
|--------|--------------|---------|---------|
| IDE entegrasyonu | **Mükemmel (native)** | VS Code + JetBrains uzantısı üzerinden | **Cursor** |
| Sprint lifecycle | Yok | 8-fazlı döngü | **Deckent (benzersiz)** |
| Self-learning | Yok | Full learning loop | **Deckent** |
| Multi-agent | Sınırlı | 16 built-in agent | **Deckent** |
| MCP tools | Çalışır | 21 MCP tool (deckent native) | **Deckent** |
| Açık kaynak | Hayır | MIT | **Deckent** |

### vs Copilot Cowork ($19-39/mo)

| Kriter | Copilot Cowork | Deckent | Kazanan |
|--------|---------------|---------|---------|
| GitHub entegrasyonu | **Mükemmel (native)** | gh CLI üzerinden | **Copilot** |
| PR otomasyonu | Güçlü | Sprint sonrası manuel | **Copilot** |
| Sprint lifecycle | Yok | 8-fazlı döngü | **Deckent (benzersiz)** |
| Self-learning | Yok | Full learning loop | **Deckent** |
| Açık kaynak | Hayır | MIT | **Deckent** |
| MCP tools | Hayır | 21 MCP tool | **Deckent** |
| Test coverage | — | **89.33%** | **Deckent** |

---

## 4. Mevcut Yetenek Envanteri

### Tam Çalışan Özellikler (65+ ana yetenek)

**Orkestrasyon**: Natural language sprint, single-shot run, AI planner (Zod), parallel pipeline (DAG), task retry (2x max), cross-dependency handling, rollback policy (4 mod), 6-step decision engine, stale worker recovery, result watcher (fs.watch + poll), DIRECTIVES auto-archive

**Multi-Agent**: 16 built-in agent (security-auditor, test-writer, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist), dynamic agent pool (LRU eviction, max 50 temp), selection algorithm (trigger+stack+history scoring), adaptive agent, agent genealogy, prompt evolution (versioning+rollback), permission guard

**Self-Learning**: MEMORY (900 satır budget, decay), PATTERNS (append-only, dedup), DECISIONS (32+ ADR, auto-draft), PROJECT-IDENTITY (permanent), RETRO (metrics comparison), DEBT tracking (escalation), learning decay (budget enforcement), Rubric-based grading (4 kriter)

**Multi-Provider**: 3 provider (Claude/Codex/Gemini), 13 model, 4 tier (premium_plus/premium/standard/economy), fallback chain, provider routing, cost optimization, model equivalence

**Skill & Plugin**: 21 built-in skill, stack detection (7 dil, 20+ framework), marketplace CLI, plugin hooks (4 type), plugin sandbox (SkillSandbox AST + regex), SHA-256 imza doğrulama, `--ignore-scripts` güvenlik, dependency resolver, rating system

**API & Dashboard**: 21+ HTTP endpoint, Bearer auth middleware, React dashboard (6 sayfa), health/ready probes, security headers, rate limiter, request logging, SSE live updates

**MCP & IDE**: 21 MCP tool, 8 MCP resource, Claude Code auto-register, VS Code (Cline/Continue), Cursor (.mdc), background jobs, deckent_explain tool

**Monitoring**: Auditor (30s loop), boundary enforcement (git diff), file locks, redactSensitive, notifications (Slack/Discord/webhook/bell), Worker Question Mechanism (IPC + file fallback)

**Altyapı**: Docker backend (multi-stage, non-root, HEALTHCHECK, 10 e2e test), docker-compose, CI/CD (GitHub Actions, Node 18/20/22), npm ready, i18n (TR+EN), 54+ doküman, 150+ config seçeneği

**Test**: 12,194+ test, 89.33% coverage, Vitest framework, integration + unit + load test

---

## 5. Feature Matrix (Nisan 2026)

| Özellik | Deckent | OpenClaw | OpenHands | Devin | Cursor Agents | Copilot Cowork |
|---------|---------|----------|-----------|-------|--------------|----------------|
| MCP Tools | **21** | Sınırlı | Sınırlı | Yok | Evet | Hayır |
| Built-in Agents | **16** | 100+ | Registry | — | — | — |
| Built-in Skills | **21** | 13K+ (hub) | — | — | — | — |
| Sprint Lifecycle | **Evet** | Hayır | Hayır | Kısmi | Hayır | Hayır |
| Self-Learning | **Native** | 3rd party | Hayır | Hayır | Hayır | Hayır |
| GO/NO-GO gates | **Evet** | Hayır | Hayır | Hayır | Hayır | Hayır |
| Test Coverage | **89.33%** | — | — | — | — | — |
| Sprints (130+) | **130+** | — | — | — | — | — |
| Açık Kaynak | MIT | OSS | OSS | Hayır | Hayır | Hayır |
| Multi-provider | **3 (Claude/Codex/Gemini)** | Sınırlı | Evet | Hayır | Hayır | Hayır |

---

## 6. Yol Haritası: 80 → 95

### Phase 1: Visibility & Polish (Sprint 134-140)
- npm publish, README overhaul, docs site
- SWE-bench benchmark
- GitHub Issue mode, epic decomposition
- Continuous watch mode, community infrastructure

### Phase 2: Intelligence & Recovery (Sprint 141-150)
- Inference-time scaling, code review learning
- Web GUI sprint launcher, monorepo support
- Template gallery, event-stream

### Phase 3: Ecosystem & Global (Sprint 151-165)
- Marketplace backend (aktif skill'ler), GitHub App
- i18n genişletme, cloud option
- Cross-project learning, v1.0 polish

---

## 7. Stratejik Pozisyon

**Deckent = "AI coding'in Kubernetes'i"**

- Tek seferlik task değil, **sürekli orkestrasyon döngüsü**
- Projeyle birlikte **büyüyen, öğrenen** yaşayan bir organizma
- **Açık kaynak + ücretsiz** (MIT) — vendor lock-in yok
- **Provider-agnostic** — Claude, Codex, Gemini arasında seç
- **130+ sprint** deneyimi ile battle-tested orchestration

**En büyük avantaj**: Self-learning sistemi sektördeki en gelişmiş. Rakiplerin tamamı stateless.

**En büyük risk**: Community ve visibility eksikliği. Teknik üstünlük var, ama kimse bilmiyor.

---

## 8. Dürüstlük Notu

Bu analiz, Deckent projesinin kendi kendini değerlendirmesidir. Aşağıdaki öz-eleştirel notlar bilinçli olarak eklenmiştir:

### Deckent'in Gerçek Avantajları
- **Sprint lifecycle** ve **GO/NO-GO quality gates** gerçekten benzersiz — hiçbir rakipte yok
- **Native learning system** (MEMORY decay + PATTERNS + RETRO + Prompt Evolution) sektördeki en kapsamlı
- **Multi-provider freedom** (Claude + Codex + Gemini) ile vendor lock-in yok
- **89.33% test coverage** ile kanıtlanmış güvenilirlik
- **21 MCP tool** ile en kapsamlı MCP entegrasyonu

### Deckent'in Gerçek Dezavantajları
- **0 community** — tek geliştirici, henüz npm'de yayınlanmamış
- **0 gerçek dünya kullanıcısı** — tüm testler self-dogfooding
- **Marketplace aktif değil** — altyapı var (registry-client, sandbox, rating) ama aktif skill yok
- **SWE-bench skoru bilinmiyor** — benchmark henüz çalıştırılmamış
- **Adaptive agent pasif** — analiz eder ama otomatik değişiklik uygulamaz

### OpenClaw'ın Gerçek Güçleri
- **331K+ GitHub star**, 47K fork — tarihin en hızlı büyüyen OSS projesi
- **13K+ ClawHub skill** + 100+ built-in AgentSkill — devasa ekosistem
- **Battle-tested** — binlerce gerçek kullanıcı, aktif geliştirme, Wikipedia sayfası
- **Interactive wizard** (openclaw onboard) — kullanıcı dostu kurulum

### OpenClaw'ın Gerçek Zayıflıkları
- **3+ CVE**, CVSS 8.8 (ClawJacked — WebSocket token exfiltration)
- **ClawHub güvenlik sorunu** — %12-20 malicious skill, otomatik deploy script'leri
- **Memory sistemi eleştirileri** — "broken" olarak nitelendirilen makaleler var
- **Microsoft uyarısı** — "untrusted code execution" olarak sınıflandırılmış

### Düzeltilmiş Genel Skor

| Kriter | Mart 2026 | Nisan 2026 | Değişim |
|--------|-----------|------------|---------|
| Task Decomposition | 82 | 85 | +3 (routing v2, TaskDNA) |
| Multi-Agent Execution | 75 | 80 | +5 (16 agent, 21 skill) |
| Failure Recovery | 74 | 78 | +4 (FIX fazı, rubric grading) |
| Ecosystem Depth | 45 | 72 | +27 (21 skill, 16 agent, MCP 21) |
| Observability | 90 | 92 | +2 (dashboard 6 sayfa, 21 MCP) |
| **Genel** | **68** | **80** | **+12** |

---

## Sprint 134 Refresh — Product-Not-Service Manifesto (2026-04-11)

Sprint 134, Deckent'in rakipler arasındaki konumunu **felsefi olarak** resmileştirdi. Bu sprint'te yazılan ADR-033 (Product Vision) ve ADR-034 (Multi-Project Isolation), Deckent'in artık "araç mı, hizmet mi" sorusuna net bir cevap verdiğini ortaya koyar: **Deckent bir üründür, SaaS değildir**. Kurulur, çalıştırılır, biter. OpenClaw gibi `docker-compose up`, veya `npx deckent init && deckent start` gibi iki komutla kullanıma hazır olur.

### Dört Dokunulamaz Prensip (ADR-033'ten)

1. **Product, not service** — Biz hizmet sağlayıcı değiliz, biz hizmetin (yazılımın) kendisiyiz. Managed Deckent yok, cloud-hosted variant yok.
2. **Kur çalıştır kolay** — OpenClaw seviyesinde sadelik hedefi: en fazla iki komutluk kurulum.
3. **Açık kaynak ve ücretsiz** — MIT/Apache 2.0 permissive lisans. Enterprise edition yok, paywall yok, premium feature yok.
4. **Herkes için, herkese, her yerde** — Dil bariyeri (TR+EN+i18n), platform bariyeri (Linux/Mac/Win/WSL/Docker/ARM), provider bariyeri (Claude/Codex/Gemini + local model Ollama), cüzdan bariyeri (local model → 0$/ay) düşürülür.

### Rakip Yeniden Pozisyonlama (Sprint 134 sonrası)

| Rakip | Model | Deckent Pozisyonu | Neden |
|-------|-------|-------------------|-------|
| Devin (Cognition) | SaaS, kapalı, ~$500/ay | **KARŞI** | Felsefe tam zıt — hizmet satışı + bulut kilit |
| OpenHands | Open-source, self-hosted | **MÜTTEFİK** | Aynı açık kaynak + self-host değerleri |
| Cursor Agents | IDE eklentisi, kapalı | **KARŞI** | IDE-bound, closed-source, abonelik gerekir |
| Copilot Cowork | Microsoft servisi | **KARŞI** | Büyük şirket servisi, veri dışarı gider |
| **OpenClaw** | Open-source, Docker | **REFERANS MODEL** | Kur-çalıştır UX hedefi için altın standart |
| Aider | Open-source, CLI | **MÜTTEFİK** | Aynı açık + CLI + basitlik ruhu |

### Deckent'in Benzersiz Değeri

**OpenClaw'un kur-çalıştır kolaylığı + OpenHands'in open-source ruhu + Deckent'in sprint orchestration + self-learning döngüsü.** Üç rakibin güçlü yanları tek bir üründe, hiçbir rakibin paylaşmadığı "sprint lifecycle + brain/worker ayrımı + rubric grading + temp agent promotion" kombinasyonu ile.

### Sprint 134 Çıkarımı

Rakip tablosu artık Nisan 2026'nın ötesine bakıyor: **rakip tablosu iki sütunda anlam kazanıyor — "servis mi satıyor" / "ürün mü satıyor"**. Deckent "ürün mü" kategorisinde OpenClaw ve OpenHands ile birlikte duruyor; "servis mi" kategorisindeki Devin/Cursor/Copilot farklı bir oyun oynuyor. Deckent bu ayrımdan çekinmiyor — **iki pazarda değil, tek pazarda** oynayacak: açık kaynak, kur-çalıştır, milyonlarca bağımsız kurulum, bizim sunucumuz 0 kullanıcı taşır.

Referanslar: `.brain/DECISIONS.md` ADR-033 (Product Vision) + ADR-034 (Multi-Project Isolation), `docs/vision/roadmap.md` (Sprint 134-145 yol haritası), `project_vision_product_not_service.md` (kaynak karar).

---

*Rapor tarihi: 2026-04-10 (ilk sürüm), 2026-04-11 (Sprint 134 refresh)*
*Analiz kapsamı: 6 otonom AI coding aracı (Devin, OpenHands, OpenClaw, Cursor Agents, Copilot Cowork, Deckent)*
*Veri kaynakları: GitHub, resmi dokümanlar, SWE-bench sonuçları, web araştırması, kod doğrulaması*
*Doğrulama: Deckent kod tabanı — 21 MCP tool, 16 built-in agent, 21 built-in skill, 130+ sprint, 89.33% coverage*
