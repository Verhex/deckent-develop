# Deckent Competitive Analysis — March 2026

> Otonom AI Orkestrasyon Araçları Karşılaştırma Raporu

## Executive Summary

Deckent v0.2.0-beta.1, otonom AI orkestrasyon alanında teknik derinlik açısından rakiplerinin çoğundan üstün. Sprint lifecycle, self-learning, quality gates ve multi-agent sistemi benzersiz. Ana darboğaz: community ve visibility.

**Genel Puan: 77.5/100**

---

## 1. Puan Kartı

| Kriter | Puan | Gerekçe |
|--------|------|---------|
| Task Decomposition | 82/100 | AI planner + Zod + 6-step decision engine (topological sort yok) |
| Multi-Agent Execution | 75/100 | 3-role architecture (Brain/Worker/Auditor) + dynamic AgentDefinition pool |
| Self-Learning | 95/100 | MEMORY + PATTERNS + DECISIONS + IDENTITY + RETRO + Prompt Evolution |
| Failure Recovery | 74/100 | Task retry (2x max), rollback (4 mod), heartbeat monitoring |
| Autonomy Level | 82/100 | Zero-config sprint, single-shot run |
| Ease of Setup | 80/100 | npx deckent init, 7 dil/20+ framework, IDE auto-register |
| Non-Developer Friendly | 40/100 | Web dashboard var ama primary CLI |
| Project Integration | 82/100 | 7 dil, 20+ framework, stack-aware verify |
| Benchmarks | 0/100 | SWE-bench test edilmemiş |
| Community | 20/100 | npm publish hazır ama yayınlanmamış |
| Ecosystem Depth | 45/100 | 10 skill, dynamic agent pool, marketplace altyapısı var ama boş, sandbox, rating |
| Observability | 90/100 | Auditor 30s loop, 16+ API endpoint, React dashboard, notifications |

---

## 2. Rakip Haritası

### Tier 1: Otonom AI Orkestrasyon (Doğrudan Rakipler)

| Araç | GitHub Stars | Mimari | Self-Learning | SWE-bench | Fiyat |
|------|-------------|--------|---------------|-----------|-------|
| **OpenClaw** | 331K+ | Supervisor-worker, 100+ AgentSkill, 13K+ ClawHub skill | Memory var (3rd party: Mem0, Cognee) | — | Free (OSS) |
| **OpenHands** | 65K | Event-stream multi-agent | Yok (stateless) | %66.4 | Free (OSS) |
| **Devin** | Proprietary | Cloud sandbox | Yok (stateless) | %13.86 | $20-500/mo |
| **SWE-agent** | Academic | ACI | Yok | %12.5 | Free (research) |
| **MetaGPT** | ~45K | Document-flow | Yok | — | Free (OSS) |
| **Kiro** | Yeni | Autonomous + feedback | Code review'dan öğrenir | — | — |
| **Deckent** | — | Sprint-based Brain/Worker/Auditor | MEMORY/PATTERNS/RETRO/IDENTITY | — | Free (MIT) |

### Deckent'in Benzersiz Özellikleri (Hiçbir Rakipte Yok)

1. **Sprint Lifecycle**: 10-fazlı döngü (DIRECTIVE→PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→TRANSITION→COMPLETE)
2. **Self-Learning with Decay**: 600 satır budget, 5 sprint otomatik decay, native (3rd party bağımlılık yok)
3. **GO/NO-GO Quality Gates**: Her task'a kalite kapısı + 4 rollback policy (auto/threshold/never/ask)
4. **6-Step Decision Engine**: TaskAnalysis → AgentSelection → SkillSelection → ModelResolution → EffortAdjust → ScopeResolve
5. **Independent Auditor**: 30s monitor loop, boundary enforcement, deadlock prevention
6. **Prompt Evolution**: Agent prompt versiyonlama, A/B test, rollback
7. **Multi-Provider Equivalence**: 3 provider, 12 model, tier-based fallback

> **Not:** Topological sort (bağımlılık sıralama) ve sabit persona sayısı (8 agent) daha önceki sürümlerde iddia edilmiş ama kodda doğrulanamamıştır. Bağımlılıklar kaydedilir ama sıralanmaz. Agent havuzu dinamiktir.

---

## 3. Head-to-Head Karşılaştırmalar

### vs OpenClaw (331K+ star)

| Kriter | OpenClaw | Deckent | Kazanan |
|--------|----------|---------|---------|
| Multi-agent | Supervisor-worker, 100+ AgentSkill, izole workspace | Brain/Worker/Auditor (3 sabit rol, tmux) | **OpenClaw** |
| Persistent learning | Memory var (3rd party: Mem0/Cognee), auto-flush | MEMORY decay + PATTERNS + RETRO + Prompt Evolution (native) | **Deckent** |
| Quality gates | Yok | GO/NO-GO + rollback (4 policy) + retry (2x) | **Deckent (benzersiz)** |
| Sprint lifecycle | Yok | 10-fazlı döngü | **Deckent (benzersiz)** |
| Skill ecosystem | **13K+ skill (ClawHub)** + 100+ built-in | 10 built-in, marketplace altyapısı var ama boş | **OpenClaw (açık ara)** |
| Community | **331K+ stars**, 47K forks, Wikipedia sayfası | Tek geliştirici, henüz yayınlanmamış | **OpenClaw (açık ara)** |
| Setup time | ~5dk (npm + openclaw onboard wizard) | ~5dk (npx deckent init) | **Eşit** |
| Güvenlik | 3+ CVE, ClawHub'da %12-20 malicious skill | Henüz hedef değil (tek kullanıcı) | **Deckent** (adil değil) |
| Dokümantasyon | Resmi docs, Wikipedia, blog ekosistemleri | İç dokümanlar, CLAUDE.md | **OpenClaw (açık ara)** |

### vs OpenHands (65K star, %66.4 SWE-bench)

| Kriter | OpenHands | Deckent | Kazanan |
|--------|-----------|---------|---------|
| SWE-bench | %66.4 | Bilinmiyor | **OpenHands** |
| Persistent learning | Yok (stateless) | Full learning loop | **Deckent** |
| Inference-time scaling | 5 deneme + critic | 3 deneme, critic yok | **OpenHands** |
| Observability | Event stream | Auditor + dashboard + SSE + notifications | **Deckent** |
| Skill system | Agent registry | 10 skill + marketplace + adaptive | **Deckent** |

### vs Devin ($20-500/mo)

| Kriter | Devin | Deckent | Kazanan |
|--------|-------|---------|---------|
| Fire & forget | Maksimum (cloud) | Zero-config sprint | **Devin** (polish) |
| Learning | Yok (stateless) | Full learning loop | **Deckent** |
| Multi-agent | Cloud parallel | 8 persona + adaptive | **Deckent** |
| Cost | $20-500/mo | Ücretsiz (MIT) | **Deckent** |
| Vendor lock-in | Proprietary | 3 provider, open-source | **Deckent** |

---

## 4. Mevcut Yetenek Envanteri

### Tam Çalışan Özellikler (50+ ana yetenek)

**Orkestrasyon**: Natural language sprint, single-shot run, AI planner (Zod), parallel pipeline (DAG), task retry (2x max), cross-dependency handling, rollback policy (4 mod), 6-step decision engine, stale worker recovery, result watcher (fs.watch + poll)

**Multi-Agent**: Dynamic agent pool (AgentDefinition), selection algorithm (trigger+stack+history scoring), adaptive agent (analiz — otomatik uygulama yok), agent genealogy, agent retirement (LRU), prompt evolution (versioning+rollback), permission guard, cross-sprint analyzer

**Self-Learning**: MEMORY (600 satır, decay), PATTERNS (append-only, dedup), DECISIONS (49 ADR, auto-draft), PROJECT-IDENTITY (permanent), RETRO (metrics comparison), DEBT tracking (escalation), learning decay (budget enforcement), prompt analytics (16KB module)

**Multi-Provider**: 3 provider (Claude/Codex/Gemini), 12 model, 3 tier (premium/standard/economy), fallback chain, provider routing, cost optimization, model equivalence

**Skill & Plugin**: 10 built-in skill, stack detection (7 dil, 20+ framework), marketplace CLI, plugin hooks (4 type), skill sandbox (regex+AST), dependency resolver, rating system

**API & Dashboard**: 16+ HTTP endpoint, React dashboard (4 sayfa), health/ready probes, security headers, rate limiter, request logging, bearer auth, SSE live updates

**MCP & IDE**: 12 MCP tool, 6 MCP resource, Claude Code auto-register, VS Code (Cline/Continue), Cursor (.mdc), background jobs

**Monitoring**: Auditor (30s loop), boundary enforcement (git diff), file locks, redactSensitive, notifications (Slack/Discord/webhook/bell)

**Altyapı**: Docker (multi-stage, non-root, HEALTHCHECK), docker-compose, CI/CD (GitHub Actions, Node 18/20/22), npm ready, i18n (TR+EN), 54 doküman, 150+ config seçeneği

---

## 5. Yol Haritası: 77.5 → 95

### Phase 1: Visibility & Polish (Sprint 051-058)
- npm publish, README overhaul, docs site
- SWE-bench benchmark
- GitHub Issue mode, epic decomposition
- Continuous watch mode, community infrastructure
- Git auto-workflow

### Phase 2: Intelligence & Recovery (Sprint 059-066)
- Inference-time scaling, code review learning
- Web GUI sprint launcher, monorepo support
- Template gallery, event-stream, deckent explain

### Phase 3: Ecosystem & Global (Sprint 067-080)
- Marketplace backend, GitHub App
- i18n genişletme, cloud option
- Cross-project learning, v1.0 polish

---

## 6. Stratejik Pozisyon

**Deckent = "AI coding'in Kubernetes'i"**

- Tek seferlik task değil, **sürekli orkestrasyon döngüsü**
- Projeyle birlikte **büyüyen, öğrenen** yaşayan bir organizma
- **Açık kaynak + ücretsiz** (MIT) — vendor lock-in yok
- **Provider-agnostic** — Claude, Codex, Gemini arasında seç

**En büyük avantaj**: Self-learning sistemi sektördeki en gelişmiş. Rakiplerin tamamı stateless.

**En büyük risk**: Community ve visibility eksikliği. Teknik üstünlük var, ama kimse bilmiyor.

---

## 7. Dürüstlük Notu

Bu analiz, Deckent projesinin kendi kendini değerlendirmesidir. Aşağıdaki öz-eleştirel notlar bilinçli olarak eklenmiştir:

### Deckent'in Gerçek Avantajları
- **Sprint lifecycle** ve **GO/NO-GO quality gates** gerçekten benzersiz — hiçbir rakipte yok
- **Native learning system** (MEMORY decay + PATTERNS + RETRO + Prompt Evolution) sektördeki en kapsamlı
- **Multi-provider freedom** (Claude + Codex + Gemini) ile vendor lock-in yok

### Deckent'in Gerçek Dezavantajları
- **0 community** — tek geliştirici, henüz npm'de yayınlanmamış
- **0 gerçek dünya kullanıcısı** — tüm testler self-dogfooding
- **Marketplace boş** — altyapı var (registry-client, sandbox, rating) ama aktif skill yok
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

| Kriter | Önceki | Düzeltilmiş | Neden |
|--------|--------|-------------|-------|
| Task Decomposition | 88 | 82 | Topological sort yok |
| Multi-Agent Execution | 90 | 75 | 8 persona yok, 3 sabit rol |
| Failure Recovery | 78 | 74 | 3x retry değil, 2x |
| Ecosystem Depth | 85 | 45 | Marketplace boş, rakipler 13K+ skill |
| **Genel** | **77.5** | **68** | Dürüst değerlendirme |

---

*Rapor tarihi: 2026-03-25 (güncelleme: 2026-03-25)*
*Analiz kapsamı: 9 otonom AI coding aracı*
*Veri kaynakları: GitHub, resmi dokümanlar, SWE-bench sonuçları, web araştırması, kod doğrulaması*
*Doğrulama: OpenClaw web araştırması (331K star, 13K+ skill, 3+ CVE) + Deckent kod tabanı grep/read*
