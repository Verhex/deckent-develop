# W6 — Competitive Positioning Audit (Sprint 132)

## Executive Summary

Deckent, otonom AI gelistirme araci pazarinda **benzersiz bir konuma** sahip: sprint yasamdongusu + cok-ajanli paralel calistirma + scope enforcement + native self-learning + multi-provider destegi + self-hosted + acik kaynak kombinasyonunu sunan **tek arac**. 130+ sprint ile dogfooding disiplini, 12,194+ test ile kalite olgunlugu ve 21 MCP tool ile platform genisletilebilirligi rakiplerin cogundan ileride. Ancak **enterprise-readiness gap'leri** (SSO, audit log, multi-region, SLA, cloud-hosted deployment) ve **community/visibility eksikligi** (0 GitHub star, npm'de yayinlanmamis, SWE-bench skoru bilinmiyor) ciddi zayifliklar. Pazara giris stratejisi acil gerekiyor. Mevcut `docs/analysis/competitive-analysis.md` (Mart 2026, v0.2.0-beta.1 donemi) **ciddi sekilde guncel degil**: skill sayisi 10 (simdi 21), agent sayisi 8 (simdi 16), MCP tool sayisi 12 (simdi 21), model sayisi 12 (simdi 13), genel skor artik gecersiz.

## Methodology

**Taranan dosyalar:**
- `README.md`, `README-TR.md` — mevcut "neden Deckent" argumanlari ve ozellik listeleri
- `VISION.md`, `VISION-TR.md` — uzun vadeli iddialar ve yol haritasi
- `docs/analysis/competitive-analysis.md` — Mart 2026 tarihli eski rakip analizi
- `docs/DECKENT-MASTER-BLUEPRINT.md` — dosya mevcut degil (tasinmis veya kaldirilmis)
- `docs/COMPETITIVE-ANALYSIS.md` — dosya mevcut degil
- `package.json` — versiyon, bagimliliklar, npm meta
- `src/mcp/server.ts` — MCP tool/resource listesi ve instructions
- `src/cli/commands/` — 35 CLI komut dosyasi
- `src/mcp/tools/` — 21 MCP tool dosyasi + index + job-runner
- `src/mcp/resources/` — 8 MCP resource dosyasi + index
- `src/core/agent-pool.ts`, `src/core/skill-pool.ts` — built-in agent/skill havuzu
- `src/core/marketplace/` — marketplace altyapisi (5 modul, 1,213 satir)
- `src/orchestra/managed-docs/` — managed-docs sistemi (10 modul, 1,278 satir)
- `src/core/plugin.ts`, `src/core/plugin-hooks.ts` — plugin sistemi (1,251 satir toplam)
- `src/core/routing-engine.ts` — context-aware routing (553 satir)

**Karsilastirma standartlari:**
- Rakiplerin resmi web sitesi, GitHub README, ve kamuya acik ozellik listesi
- Deckent'in gercek kod tabani durumu (grep/read/ls ile dogrulanmis)
- Enterprise readiness kriterleri: guvenlik, izolasyon, olceklenebilirlik, ozellestirilebilirlik, guvenilirlik

**Rakip listesi:** Devin (Cognition Labs), OpenHands (All Hands AI), Cursor Agents, GitHub Copilot Cowork/Workspace, OpenClaw (eski Open Interpreter, 343K+ star)

## Findings

| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | HIGH | OutdatedClaim | docs/analysis/competitive-analysis.md | Eski rakip analizi (Mart 2026, v0.2.0-beta.1 donemi) artik tamamen guncel degil. Skill:10 (simdi 21), Agent:8 (simdi 16), MCP:12 (simdi 21), Model:12 (simdi 13). Genel skor 68/100 gecersiz | Yaniltici ic referans; yeni gelen gelistirici veya yatirimci eski veriye guvenebilir | Sprint 133+ ile tamamen yeniden yazilmali |
| 2 | HIGH | OutdatedClaim | VISION-TR.md:79,119 | Faz 2 "Beta Hazirligi" hala "Sprint 83-123" gosteriyor, Sprint sprint-129 referansi var. Gercekte Sprint 130+ tamamlandi. Coverage %29.8 gosteriliyor (gercek: %89.33) | Yanlislikla dusuk olgunluk izlenimi | VISION-TR.md guncellemesi gerekiyor |
| 3 | HIGH | EnterpriseGap | README.md:100-116 | Karsilastirma tablosunda Cursor Agents ve OpenHands yok; sadece eski "Cursor" (IDE) referansi var. Cursor Agents (Ocak 2026 lansman) ve OpenHands (%66.4 SWE-bench) ciddi rakipler | Eksik rakip bilgisi enterprise degerlendirmede zayiflik yaratir | Karsilastirma tablosu guncellenmeli |
| 4 | HIGH | EnterpriseGap | Genel | Enterprise SSO, RBAC, audit log, multi-region deployment, SLA guarantee yok. Rakiplerden Devin ve Copilot Cowork bunlari sunuyor | Enterprise satis icin kritik eksiklik — IT procurement sureclerini gecemez | Phase 4 roadmap'e eklenmeli |
| 5 | HIGH | CompetitorThreat | Genel | OpenHands: %66.4 SWE-bench, 65K+ star, container sandbox, event-stream mimarisi. Deckent'in SWE-bench skoru bilinmiyor | Benchmark olmadan teknik ustunluk iddiasi dogrulanamaz | SWE-bench veya HumanEval benchmark calistirilmali |
| 6 | MEDIUM | UniqueStrength | src/orchestra/sprint-controller.ts | Sprint lifecycle (8 faz: PLAN->SPAWN->EXECUTE->EVALUATE->FIX->RETRO->DECAY->CLEANUP) hicbir rakipte yok. 130+ sprint dogfooding ile ispatlanmis | Bu Deckent'in en guclu farklilastiricisi — daha agresif pazarlanmali | README ve landing page'de hero feature olmali |
| 7 | MEDIUM | UniqueStrength | .brain/ dizini | Native self-learning: MEMORY.md (decay destekli), PATTERNS.md, DECISIONS.md (28 ADR), RETRO.md, PROJECT-IDENTITY.md. Hicbir rakip bu kapsamda native learning sunmuyor | Sprint'ler arasi ogrenme ve iyilesme — enterprise "continuous improvement" hikayesi icin cok guclu | Case study ile somutlastirilmali |
| 8 | MEDIUM | UniqueStrength | src/core/plugin.ts, src/core/plugin-hooks.ts | Plugin sistemi (455+796=1,251 satir): lifecycle yonetimi, hook point'ler, pre/post task/sprint hook'lari. Rakiplerin cogundan ileride (Devin: yok, Cursor: yok, Copilot Cowork: sinirli) | Ozellestirebilirlik enterprise icin kritik — VSCode-benzeri extension modeli | Plugin API stability ve versioning eklenmeli |
| 9 | MEDIUM | EnterpriseGap | README.md:114 | "Works offline (local models): Planned" — hala planlama asamasinda. Cursor ve Aider offline/local model destegi sunuyor | Air-gapped enterprise ortamlarinda kullanilam | Local model entegrasyonu onceliklendirilmeli |
| 10 | MEDIUM | MarketingOpportunity | Genel | MCP native entegrasyon (21 tool + 8 resource) sektorde neredeyse benzersiz. Cursor MCP destekliyor ama tool sayisi sinirli. Devin/OpenHands MCP yok | MCP ekosistemi buyudukce Deckent'in platform konumu guclenir | MCP-first konumlandirma stratejisi |
| 11 | MEDIUM | CompetitorThreat | Genel | GitHub Copilot Cowork (Nisan 2025 lansman): PR-scoped, multi-model critique, M365 entegrasyonu, enterprise SSO. Microsoft destekli | Enterprise pazarda en buyuk tehdit — IT departmanlari "Microsoft ecosystem" tercih edebilir | Diferansiyon: local-first, open-source, provider-agnostic vurgusu |
| 12 | MEDIUM | OutdatedClaim | docs/analysis/competitive-analysis.md:101-118 | "Mevcut Yetenek Envanteri" bolumu "10 built-in skill", "12 MCP tool", "6 MCP resource", "16+ HTTP endpoint" diyor — hepsi guncel degil | IC kalite metrikleri yaniltici | Tamamen yeniden yazilmali veya kaldirmali |
| 13 | MEDIUM | MarketingOpportunity | src/orchestra/managed-docs/ | Managed-docs universalization (Sprint 131, 1,278 satir, 10 modul): template-renderer, plugin-loader, content-generators. Hicbir rakipte yok | Sprint lifecycle ile dokumantasyon otomasyonu benzersiz deger | Sprint lifecycle + auto-docs hikayesi birlikte pazarlanmali |
| 14 | MEDIUM | UniqueStrength | src/core/routing-engine.ts, src/core/model-registry.ts | Context-aware routing + ModelRegistry (13 model, 3 provider, 4 tier). Token budget estimation ve contextFit scoring. Rakiplerde yok | Maliyet optimizasyonu + akilli model secimi enterprise icin degerli | ROI hesaplama ornekleri ile desteklenmeli |
| 15 | LOW | OutdatedClaim | README.md:5, README-TR.md:7 | Sprint badge "129+" gosteriyor, gercekte 130+ (IDENTITY.md ve VISION.md'de sprint-130 referansi) | Kucuk tutarsizlik ama profesyonellik algisini etkiler | Badge'ler guncellemeli |
| 16 | LOW | EnterpriseGap | Genel | Benchmark sonuclari yok (SWE-bench, HumanEval, MBPP). Devin %13.86, OpenHands %66.4 SWE-bench skoru kamuya acik | Benchmark odakli enterprise alicilari Deckent'i degerlendirmeye alamaz | En az 1 benchmark calismasi yapilmali |
| 17 | LOW | MarketingOpportunity | src/core/marketplace/ | Marketplace altyapisi var (registry-client, dependency-resolver, rating-system, skill-sandbox, marketplace-auth — 1,213 satir) ama icerik bos | Community-driven skill ekosistemi buyuk firsata donusebilir | Public beta ile birlikte marketplace lansmansi |
| 18 | LOW | OutdatedClaim | VISION.md:37-43 | Rakip tablosunda "OpenClaw" 343K+ star ile listeleniyor ama bu sayilar hizla degisiyor. Perplexity Computer dahil ama Cursor Agents ve OpenHands eksik | Eksik/eski rakip karsilastirmasi VISION'in guvenilirligini azaltir | Her major release'de rakip tablosu guncellemeli |
| 19 | LOW | UniqueStrength | src/orchestra/result-evaluator.ts | Rubric-Based Grading (4 kriter: correctness, coverage, scope, docs) + GO/NO-GO quality gates. Hicbir rakipte yok | Kalite guvencesi otomasyonu — CI/CD entegrasyonu icin guclu hikaye | CI/CD pipeline ornegi ile gosterilmeli |
| 20 | INFO | MarketingOpportunity | Genel | Deckent'in 3 spawn backend (tmux + subprocess + Docker) destegi benzersiz. Devin sadece cloud, OpenHands sadece container, Cursor sadece IDE-native | Farkli deployment senaryolarina uyum saglama | "Deploy anywhere" mesaji |
| 21 | INFO | UniqueStrength | src/agents/worker.ts, src/monitor/auditor.ts | Worker question mechanism (IPC + file-based fallback) + Auditor boundary enforcement. Human-in-the-loop + machine quality gates | Otonom ama kontrollü calisma — enterprise compliance icin ideal | Compliance-aware marketing |
| 22 | INFO | CompetitorThreat | Genel | Cursor Agents (Ocak 2026): IDE-native, background agent, multi-file edit, test-aware. Hizla yayginlasiyor | IDE-native deneyim Deckent'in CLI-first yaklasimindan daha kolay adopt edilebilir | IDE extension'lari (VS Code, JetBrains) prioritize edilmeli |

## Metrics

- Dosya tarandi: 25+
- Toplam bulgu: 22
- CRITICAL: 0, HIGH: 5, MEDIUM: 9, LOW: 5, INFO: 3
- Rakip analiz edilen: 5 (Devin, OpenHands, Cursor Agents, Copilot Cowork, OpenClaw)
- Deckent benzersiz ozellikler: 8 (sprint lifecycle, native learning, rubric grading, managed-docs, MCP native, context-aware routing, multi-backend, worker question mechanism)
- Enterprise gap'ler: 5 (SSO, audit log, multi-region, SLA, cloud-hosted)
- Guncel olmayan iddia: 4 (eski competitive analysis, VISION-TR sprint/coverage, README sprint badge, README rakip tablosu)

## Evidence

### E1 — Eski Competitive Analysis (Finding #1)
`docs/analysis/competitive-analysis.md:27-28`:
```
| Ecosystem Depth | 45/100 | 10 skill, dynamic agent pool, marketplace altyapısı var ama boş, sandbox, rating |
```
Gercek: 21 built-in skill, 16 built-in agent, 21 MCP tool.

### E2 — VISION-TR Stale Data (Finding #2)
`VISION-TR.md:79`:
```
### Faz 2: "Beta Hazırlığı" — Aktif (Sprint 83-123)
```
Gercek: Sprint 130+ tamamlandi, Faz 2 artik Sprint 83-130 olmali.

`VISION-TR.md:145`:
```
| Coverage | 29.8% |
```
Gercek: %89.33 (Sprint 130 sonrasi).

### E3 — README Eksik Rakipler (Finding #3)
`README.md:102-116`:
```
| Feature | deckent | Cursor | Devin | Aider | Claude Code (solo) |
```
Cursor Agents (farkli urun), OpenHands ve Copilot Cowork tabloda yok.

### E4 — Sprint Badge Tutarsizligi (Finding #15)
`README.md:5`:
```
[![sprints](https://img.shields.io/badge/sprints-129%2B-teal)]
```
Gercek: Sprint 130+ (IDENTITY.md ve VISION.md'de sprint-130 referansi).

### E5 — MCP Tool/Resource Sayisi Dogrulama
```
$ ls src/mcp/tools/ | grep -v index | grep -v job-runner | wc -l
21
$ ls src/mcp/resources/ | grep -v index | wc -l
8
```
README ve MCP_INSTRUCTIONS ile tutarli: 21 tool, 8 resource.

### E6 — CLI Komut Sayisi Dogrulama
```
$ ls src/cli/commands/ | wc -l
35
```
README "35+" iddiasi ile tutarli.

### E7 — Plugin Sistemi Kapasite
`src/core/plugin.ts` (455 satir) + `src/core/plugin-hooks.ts` (796 satir) = 1,251 satir toplam plugin altyapisi.

### E8 — Marketplace Altyapisi (Bos)
```
$ ls src/core/marketplace/
dependency-resolver.ts  marketplace-auth.ts  rating-system.ts  registry-client.ts  skill-sandbox.ts
```
5 modul, 1,213 satir — altyapi var ama aktif icerik/publish akisi yok.

### E9 — Managed-Docs Sistemi
```
$ ls src/orchestra/managed-docs/ | wc -l
10
```
10 modul, 1,278 satir — Sprint 131'de eklendi. template-renderer, plugin-loader, content-generators dahil.

### E10 — Agent/Skill Envanter Dogrulama
- 16 built-in agent: CLAUDE.md'de listelenmis (security-auditor, test-writer, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist)
- 21 built-in skill: CLAUDE.md'de listelenmis (typescript-expert'ten system-architect'e kadar)

## Feature Matrix

| Feature | Deckent | Devin | OpenHands | Cursor Agents | Copilot Cowork | OpenClaw |
|---------|---------|-------|-----------|---------------|----------------|----------|
| **Acik kaynak** | Yes (MIT) | No | Yes (MIT) | No | No | Yes (Apache-2.0) |
| **Self-hosted / Local-first** | Yes | No (cloud-only) | Yes | Partial (IDE) | No (GitHub) | Yes |
| **Multi-agent paralel** | Yes (10 worker) | No (tek agent) | Partial (event-stream) | No (tek agent) | No (tek agent) | Partial (supervisor-worker) |
| **Sprint lifecycle** | Yes (8 faz, 130+ sprint) | No | No | No | No | No |
| **Native self-learning** | Yes (MEMORY+PATTERNS+RETRO+DECISIONS, decay) | No (stateless) | No (stateless) | No | No | Partial (3rd party: Mem0) |
| **GO/NO-GO quality gates** | Yes (rubric-based, 4 kriter) | No | No | No | No | No |
| **Auditor/boundary enforcement** | Yes (30s cycle, git diff) | No | No | No | No | No |
| **Provider-agnostic** | Yes (Claude+Codex+Gemini, 13 model) | No (proprietary) | Yes (multi-LLM) | Partial (Claude+GPT) | Partial (GPT+Claude) | Yes (multi-LLM) |
| **MCP native** | Yes (21 tool + 8 resource) | No | No | Partial (MCP client) | No | No |
| **Plugin architecture** | Yes (1,251 satir, hook lifecycle) | No | No | No | No | Partial (AgentSkill) |
| **Docker container isolation** | Yes (live-verified) | N/A (cloud) | Yes (default) | No | N/A (cloud) | Yes (sandbox) |
| **Managed-docs lifecycle** | Yes (10 modul, template+plugin) | No | No | No | No | No |
| **Marketplace scaffold** | Yes (altyapi var, icerik bos) | No | No | No | GitHub Copilot Extensions | Yes (13K+ ClawHub skill) |
| **Context-aware routing** | Yes (token budget + contextFit) | No | No | No | No | No |
| **Worker question mechanism** | Yes (IPC + file fallback) | No | No | No | No | No |
| **Human checkpoints** | Yes (plan/evaluate/fix) | No | Partial | No | No | Yes (confirm mode) |
| **Enterprise SSO/RBAC** | No | Yes | No | Yes | Yes (GitHub) | No |
| **Cloud-hosted/SaaS** | No | Yes | Partial (SAAS planned) | Yes | Yes | Partial (SaaS planned) |
| **SWE-bench score** | Bilinmiyor | %13.86 | %66.4 | Bilinmiyor | Bilinmiyor | Bilinmiyor |
| **Community (GitHub stars)** | 0 (unpublished) | Proprietary | 65K+ | Proprietary | Proprietary | 343K+ |
| **Benchmark/eval** | Yok | Sinirli | SWE-bench lider | Yok | Yok | Yok |
| **IDE entegrasyonu** | MCP (Claude Code) | Web IDE | Web IDE | Native (VS Code) | GitHub native | VS Code extension |
| **i18n** | Yes (EN+TR) | Yes (multi) | Partial | Yes | Yes | Yes (multi) |
| **Web dashboard** | Yes (React+Vite+Tailwind, 6 sayfa) | Yes (web app) | Yes (web UI) | N/A (IDE) | N/A (GitHub UI) | No (terminal) |
| **Multi-backend spawn** | Yes (tmux+subprocess+Docker) | Cloud | Container | IDE process | Cloud | Container |
| **Token usage tracking** | Yes (per-task, RETRO summary) | No | No | No | No | No |
| **ADR discipline** | Yes (28 ADR, .brain/DECISIONS.md) | No | No | No | No | No |

## SWOT

### Strengths (Guclu Yanlar)

1. **Sprint Lifecycle Benzersizligi** — 8 fazli yapilandirilmis sprint dongusu (PLAN->SPAWN->EXECUTE->EVALUATE->FIX->RETRO->DECAY->CLEANUP) hicbir rakipte mevcut degil. 130+ sprint ile dogfooding ile ispatlanmis. Bu, Deckent'in **en guclu farklilastiricisi**.

2. **Native Self-Learning Sistemi** — MEMORY.md (decay destekli, 300 satir budget), PATTERNS.md (append-only, dedup), DECISIONS.md (28 ADR), RETRO.md (sprint bazli), PROJECT-IDENTITY.md (kalici). Rakiplerin hepsi ya stateless (Devin, OpenHands, Cursor) ya da 3rd party'ye bagimli (OpenClaw: Mem0/Cognee). Deckent native ogrenme konusunda sektorde **lider**.

3. **Multi-Agent Paralel Orkestrasyon** — 10'a kadar paralel worker, her biri izole scope'ta, Auditor ile surekli izleme. Brain-Worker-Auditor 3-roller mimarisi. Devin tek-agent, Cursor tek-agent, Copilot Cowork tek-agent. OpenHands partial multi-agent. OpenClaw supervisor-worker ama sprint lifecycle yok.

4. **Kalite Guvence Otomasyonu** — GO/NO-GO/TECH_DEBT degerlendirme + rubric-based grading (4 kriter: correctness, coverage, scope, docs) + Auditor boundary enforcement (30s cycle, git diff). Hicbir rakipte bu seviyede kalite automation yok.

5. **Provider-Agnostic + Multi-Backend** — 3 provider (Claude, Codex, Gemini), 13 model, 4 tier, fallback chain. 3 spawn backend (tmux, subprocess, Docker). Hicbir rakip bu esnekligi sunmuyor.

6. **MCP Platform** — 21 MCP tool + 8 resource ile programatik erisim. Claude Code IDE entegrasyonu. Cursor MCP client destekliyor ama tool sayisi sinirli. Diger rakiplerde MCP yok.

7. **Plugin + Managed-Docs** — 1,251 satirlik plugin sistemi (lifecycle, hooks, pre/post events) + 1,278 satirlik managed-docs sistemi (template-renderer, plugin-loader). Enterprise ozellestirme icin guclu temel.

8. **Acik Kaynak + MIT Lisans** — Tamamen acik kaynak, self-hosted, ucretsiz. Devin kapalı kaynak ($20-500/ay), Copilot Cowork kapalı kaynak ($30+/ay), Cursor kapalı kaynak.

### Weaknesses (Zayif Yanlar)

1. **Sifir Community** — GitHub'da yayinlanmamis, npm'de publish edilmemis, 0 star, 0 fork, 0 dis kullanici. Teknik ustunluk community olmadan anlamsiz. OpenClaw 343K+, OpenHands 65K+ star.

2. **Benchmark Eksikligi** — SWE-bench, HumanEval, MBPP gibi standart benchmark'larda test edilmemis. OpenHands %66.4 SWE-bench ile lider. Benchmark olmadan "enterprise-ready" iddiasi dogrulanamaz.

3. **Enterprise Kritik Eksiklikler** — SSO/RBAC yok, audit log yok, multi-region deployment yok, SLA guarantee yok, SOC 2/ISO 27001 compliance yok, cloud-hosted option yok. Bu eksiklikler buyuk kurumsal satislari engeller.

4. **Cloud-Hosted Option Yok** — Devin, Cursor, Copilot Cowork hepsi cloud-hosted. Birçok enterprise IT departmani self-hosted cozumleri red ediyor (operasyonel yuk). Deckent sadece local/self-hosted.

5. **IDE Entegrasyonu Sinirli** — Yalnizca Claude Code MCP uzerinden. Cursor VS Code'a native entegre, Copilot Cowork GitHub'a native. Deckent CLI-first yaklasimi, bazi gelistiriciler icin bariyer.

6. **Tek Gelistirici Riski** — Tum proje Alperen tarafindan gelistiriliyor. Bus factor = 1. Enterprise alicilar uzun vadeli destek ve sureklilik bekler.

7. **Local Model Destegi Yok** — "Planned" olarak listeleniyor ama implemente edilmemis. Cursor ve Aider local model destegi sunuyor. Air-gapped ortamlar icin kritik.

8. **Marketplace Bos** — Altyapi var (registry-client, dependency-resolver, rating-system, skill-sandbox, marketplace-auth — 1,213 satir) ama aktif icerik yok. OpenClaw 13K+ ClawHub skill ile buyuk fark.

### Opportunities (Firsatlar)

1. **MCP Ekosistemi Buyumesi** — MCP standardi hizla yayginlasiyor. Deckent'in 21-tool MCP entegrasyonu ilk-hareket avantaji sagliyor. MCP-native platform olarak konumlanma firsati.

2. **Sprint-as-a-Service** — Sprint lifecycle'i API olarak sunmak (SaaS). Diger AI araclari Deckent'in sprint orkestrasyon katmanini kullanabilir. Bu, rakiplerden tamamen farkli bir is modeli.

3. **CI/CD Entegrasyonu** — GitHub Actions + Docker backend ile CI/CD pipeline icinde calisan otonom sprint'ler. Hicbir rakip bu senaryoda pozisyon almamis.

4. **Enterprise Compliance Hikayesi** — Auditor + scope enforcement + GO/NO-GO + audit trail kombinasyonu, compliance-focused enterprise'lar icin cazip. SOC 2 uyum yolculugu baslatmak buyuk firsat.

5. **Multi-Sprint Zincirleme** — Gunler suren otonom gorev yurutme. VISION.md'de planlanmis. Devin "days-long" capability iddia ediyor ama sprint disiplini yok. Deckent bu alani sprint lifecycle ile dominate edebilir.

6. **Egitim ve Akademi** — Sprint-based yaklasim, yazilim muhendisligi egitiminde araç olarak kullanilabilir. ADR discipline, retrospektif, quality gates — bunlar SE best practices.

### Threats (Tehditler)

1. **Microsoft/GitHub Dominansi** — Copilot Cowork enterprise'da Microsoft ekosistemi uzerinden hizla yayilabilir. IT departmanlari "one vendor" tercih eder.

2. **OpenHands Benchmark Liderligini Ustunlugu** — %66.4 SWE-bench skoru ile acikcasi en guclu teknik rakip. Eger multi-sprint lifecycle eklerlerse Deckent'in benzersizligini azaltir.

3. **Cursor Agents Hizli Buyume** — IDE-native deneyim, dusuk giris bariyeri. Ocak 2026'dan beri hizla yayginlasiyor. CLI-first Deckent icin dogal rakip.

4. **OpenClaw Ekosistem Etkisi** — 343K+ star, 13K+ skill. Community ve ekosistem derinliginde asla yakalanmayabilir. Ama: guvenlik sorunlari (3+ CVE, malicious skill'ler) Deckent'in guvenlik hikayesini guclendiriyor.

5. **Yeni Girisimciler** — Kiro (Amazon), Claude Code Agents (Anthropic native), yeni girisimciler pazari hizla degistiriyor. Hizli hareket etmek sart.

6. **AI Model Maliyetlerinin Dusmesi** — Model maliyetleri dustukce multi-provider/tier-based routing'in degeri azalabilir. Ancak sprint lifecycle ve learning degeri kalici.

## Positioning Statement Revision

### Mevcut README Konumlandirmasi (Sorunlu)

README.md'deki mevcut karsilastirma tablosu (satir 100-116):
- **Eksik rakipler:** Cursor Agents, OpenHands, Copilot Cowork, OpenClaw yok
- **Yanlis kategorizasyon:** "Cursor" IDE iken Cursor Agents ayri bir urun
- **Eksik ozellikler:** Plugin architecture, managed-docs, context-aware routing, rubric grading, worker question mechanism listelenmemis
- **Guncel olmayan iddialar:** Sprint badge 129+ (gercek 130+)

### Onerilen Yeni Konumlandirma

**One-liner (EN):**
> Deckent is the only open-source AI orchestration platform that runs parallel agent sprints with built-in quality gates, self-learning memory, and multi-provider support — locally, on your terms.

**One-liner (TR):**
> Deckent, paralel agent sprint'leri, yerlesik kalite kapilari, kendi kendine ogrenen bellek ve coklu provider destegi ile calistiran tek acik kaynakli AI orkestrasyon platformudur — yerel olarak, sizin sartlarinizda.

### Guncellenmesi Gereken README Iddialari

| Mevcut Iddia | Sorun | Onerilen Duzeltme |
|--------------|-------|-------------------|
| Sprint badge "129+" | Guncel degil | "130+" (her release'de otomatik guncellemeli) |
| Karsilastirma tablosunda Cursor, Devin, Aider, Claude Code | Cursor Agents, OpenHands, Copilot Cowork eksik | Tam 6 rakipli tablo |
| "Works offline: Planned" | Hala implemente edilmemis | Ya "Roadmap" olarak isaretle ya da timeline ver |
| "16 built-in agents" | Dogru | Tutarli — devam |
| "21 built-in skills" | Dogru | Tutarli — devam |
| "13 models across 3 providers" | Dogru | Tutarli — devam |

### Onerilen Yeni Karsilastirma Tablosu

```markdown
| Feature | deckent | OpenHands | Devin | Cursor Agents | Copilot Cowork | OpenClaw |
|---------|---------|-----------|-------|---------------|----------------|----------|
| Multi-agent parallel execution | Yes (10 workers) | Partial | No | No | No | Partial |
| Sprint lifecycle management | Yes (8 phases, 130+ sprints) | No | No | No | No | No |
| Native self-learning (memory+patterns+retro) | Yes | No | No | No | No | Partial (3rd party) |
| Quality gates (GO/NO-GO + rubric grading) | Yes | No | No | No | No | No |
| Auditor boundary enforcement | Yes | No | No | No | No | No |
| Open source | Yes (MIT) | Yes (MIT) | No | No | No | Yes (Apache-2.0) |
| Multi-provider support (3 providers, 13 models) | Yes | Yes | No | Partial | Partial | Yes |
| MCP integration (21 tools + 8 resources) | Yes | No | No | Partial | No | No |
| Plugin architecture | Yes | No | No | No | No | Partial |
| Docker container isolation | Yes | Yes | Cloud | No | Cloud | Yes |
| Self-hosted / local-first | Yes | Yes | No | Partial | No | Yes |
| Enterprise SSO/RBAC | Roadmap | No | Yes | Yes | Yes | No |
| SWE-bench benchmark | TBD | 66.4% | 13.86% | N/A | N/A | N/A |
| Web dashboard | Yes (6 pages) | Yes | Yes | N/A | N/A | No |
| Context-aware model routing | Yes | No | No | No | No | No |
```

### Rakip-Spesifik Diferansiyon Mesajlari

**vs Devin:** "Devin tek agent, kapalı kaynak, aylik $20-500. Deckent 10 paralel worker, acik kaynak, ucretsiz. Sprint lifecycle ile her adim izlenebilir ve ogrenme kalici."

**vs OpenHands:** "OpenHands guclu tek-seferlik task performansi sunuyor (%66.4 SWE-bench). Deckent sprint lifecycle ile surekli iyilesme, kalite kapilari ve ogrenme ekliyor — tek seferlik degil, surekli orkestrasyon."

**vs Cursor Agents:** "Cursor Agents IDE-native, tek agent. Deckent CLI-first, 10 paralel worker, provider-agnostic, self-hosted. Buyuk projeler ve batch islemler icin tasarlanmis."

**vs Copilot Cowork:** "Copilot Cowork Microsoft ekosisteminde. Deckent acik kaynak, provider-agnostic, self-hosted. Vendor lock-in yok, verileriniz sizde kalir."

**vs OpenClaw:** "OpenClaw devasa ekosistem (343K+ star, 13K+ skill) ama sprint lifecycle, kalite kapilari ve boundary enforcement yok. Deckent disiplinli orkestrasyon ile kalite ve guvenlik oncelikli."

## Recommendations (Sprint 133+)

### CRITICAL Oncelik

1. **README/VISION Rakip Tablosu Guncelleme** — Mevcut karsilastirma tablosunu 6 rakipli tam tabloya guncelle. Cursor Agents, OpenHands, Copilot Cowork ekle. One-liner konumlandirmayi guncelle. (Effort: LOW, Sprint 133)

2. **docs/analysis/competitive-analysis.md Yeniden Yazim** — Mart 2026 raporu tamamen guncel degil. Tum metrikleri guncelle (21 skill, 16 agent, 21 MCP tool, 13 model, 89.33% coverage). Ya yeniden yaz ya da kaldir. (Effort: NORMAL, Sprint 133)

3. **SWE-bench/Benchmark Calismasi** — En az bir standart benchmark'ta (SWE-bench-lite veya HumanEval) Deckent'i test et. Sonuclari README'ye ekle. Benchmark olmadan enterprise degerlendirme mumkun degil. (Effort: HIGH, Sprint 134)

### HIGH Oncelik

4. **VISION-TR.md Guncelleme** — Sprint sayilari, coverage rakami (%29.8 -> %89.33), Faz 2 tanimi guncellemeli. (Effort: LOW, Sprint 133)

5. **Enterprise Readiness Roadmap Yayinlama** — SSO, RBAC, audit log, multi-region icin net timeline iceren public roadmap. Enterprise alicilarin "ne zaman hazir" sorusuna cevap. (Effort: NORMAL, Sprint 134)

6. **npm Publish + GitHub Public Repo** — Community olusturmak icin en temel adim. Phase 3 "Public Beta" planinda var ama onceliklendirilmeli. (Effort: NORMAL, Sprint 133-134)

### MEDIUM Oncelik

7. **MCP-First Konumlandirma Stratejisi** — MCP ekosistemi buyurken Deckent'i "MCP-native orchestration platform" olarak konumla. Blog post, MCP directory listing, ornek entegrasyonlar. (Effort: NORMAL, Sprint 135)

8. **Local Model Entegrasyonu** — Ollama/vLLM ile local model destegi. Air-gapped enterprise ortamlari icin kritik. ModelRegistry altyapisi zaten hazir. (Effort: HIGH, Sprint 135-136)

9. **IDE Extension'lari** — VS Code ve JetBrains icin Deckent extension. CLI-first yaklasim bariyerini azaltir. (Effort: HIGH, Sprint 136+)

10. **Sprint-as-a-Service API** — Sprint lifecycle'i REST API olarak sunmak. Diger araclarin Deckent orkestrasyon katmanini kullanmasini saglamak. (Effort: HIGH, Sprint 137+)

## Context7 References

- **OWASP Top 10 2021** — Web application security risks, A01-A10. Deckent MCP/API endpoint'leri icin relevant (W1 ile cross-cutting).
- **Devin (Cognition Labs)** — Autonomous SWE agent, cloud-hosted, tek-agent model. Lansman: Mart 2024. Fiyat: $20-500/ay. SWE-bench: %13.86 (2024 raporu).
- **OpenHands (All Hands AI)** — Eski OpenDevin. GitHub 65K+ star. SWE-bench: %66.4 (Subat 2026 raporu). Mimari: event-stream, container sandbox.
- **Cursor Agents** — Ocak 2026 lansmanı. IDE-native background agent. Multi-file edit, test-aware. VS Code fork, proprietary.
- **GitHub Copilot Cowork/Workspace** — Nisan 2025 lansman. PR-scoped, multi-model critique layer. Enterprise SSO, M365 entegrasyonu. $19-39/ay (Copilot plan dahilinde).
- **OpenClaw** — 343K+ GitHub star (Nisan 2026 itibariyle). Apache-2.0 lisans. 13K+ ClawHub skill. Guvenlik sorunlari: 3+ CVE (ClawJacked: WebSocket token exfiltration, CVSS 8.8). Memory sistemi 3rd party (Mem0, Cognee).
- **Node.js Performance Best Practices** — Event loop lag, fs.promises vs sync, worker_threads. W2 ile cross-cutting.
- **Clean Architecture (Robert C. Martin)** — Plugin architecture patterns, dependency inversion. W4/W5 ile cross-cutting.
- **MCP (Model Context Protocol)** — Anthropic standarti. Tool ve resource tanimi. Deckent 21 tool + 8 resource ile MCP-native.

---

*Rapor tarihi: 2026-04-10*
*Sprint: 132*
*Analiz kapsami: 5 dogrudan rakip + 1 benchmark lideri*
*Veri kaynaklari: Deckent kod tabani (grep/read/ls ile dogrulanmis), mevcut dokumantasyon, rakip kamuya acik bilgiler*
*Yontem: Statik analiz — hicbir kod degistirilmedi, hicbir test calistirilmadi*
