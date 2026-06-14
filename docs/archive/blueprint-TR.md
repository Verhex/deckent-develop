<!-- Dil: TR | Teknik terimler EN -->

# DECKENT — BLUEPRINT (TR)
## Açık Bir Ajanın God-Level Orkestrasyon + Enterprise Katmanı
### Sürüm 3.2 — Haziran 2026 — Verhex (Sprint 219'da oluşturuldu)

> **Doküman rolü (Alperen 2026-06-02 — SSOT bölünmesi):** `blueprint-TR.md` = **deckent NE ve NEREDE** (kimlik, kabiliyet, mimari-as-built, konumlanma) — Türkçe SSOT-of-identity. `docs/MASTER-PLAN-TR.md` = **NASIL geliştiriyoruz** (yol haritası, sıralama, kalan iş — geliştirme SSOT). `docs/vision/VISION-TR.md` ve bu doküman birbirini tamamlar; bu doküman daha geniş kimlik anlatısı taşır, VISION-TR.md daha kısa stratejik özet sunar. İngilizce ana sürüm: [`blueprint.md`](./blueprint.md). MASTER-PLAN TR: [`docs/MASTER-PLAN-TR.md`](../MASTER-PLAN-TR.md).

> **Deckent nedir:** **açık bir ajanın god-level orkestrasyon + enterprise katmanı**, tek bir kullanıcının aynı gücü zahmetsizce kullanabileceği kadar kolaylaştırılmış — **tek MIT ürün**, solo geliştiricinin laptopundan 10.000 kişilik kuruma kadar. **"Open source for open world."** Mimari **core + enterprise-layer** ayrımı üzerinedir: core katman her kullanıcının çalıştırdığı çok-ajanlı orkestrasyondur; enterprise katman (RBAC, audit, multi-tenant, scheduled flows) çatallanmadan bunun üstüne oturur. ([[project_deckent_positioning]])

> **Nereye gidiyor — otonom agentic runtime:** on-demand sprintlerin ötesinde, deckent **tanımlı yetki sınırları içinde sürekli ve otonom** çalışır — kuruma kurarsın, siparişleri izler, analiz eder, MRP kontrol eder ve müşteri taleplerine RBAC + onay sınırları içinde aksiyon alır. Temeli: Process Mode (F3) + scheduled-flows + nervous approval + Capability Broker (F8 ERP) + ADR-037 authority matrix. **"Deckent orchestered for everyone everywhere"** — 6 bağlamda (yeşil-alan / aktif-geliştirme / bakım / günlük-iş / ERP / enterprise). ([[project_deckent_everyone_everywhere]])

---

## İÇİNDEKİLER

1. Kimlik ve Vizyon
2. Ne Yapar (Üç Yüz: AI Developer / System Worker / Assistant)
3. Mimari — As-Built (Brain · Auditor · Worker · Provider · Memory)
4. Memory V2 — DB-First (SQLite + FTS5)
5. Sprint Yaşam Döngüsü ve GO / NO-GO / Tech Debt Protokolü
6. Konumlanma — "Open Source for Open World" (Kıyaslama, Karşıtlık Değil)
7. 6 Senaryo — "Everyone Everywhere"
8. Native Agentic Deckent (Sprint 216–219)
9. Otonom Agentic Runtime Vizyonu (Sprint 220+)
10. Güvenlik ve RBAC Authority Matrix (ADR-037)
11. İlgili Belgeler ve Tarihsel Bağlam

---

## 1. KİMLİK VE VİZYON

**Ad:** Deckent (Deck + Agent)
**Alan:** deckent.ai
**Slogan:** "Senin AI geliştirme takımın, orkestre edilmiş."
**Yazar:** Alperen @ Verhex
**Lisans:** MIT

**Deckent NE değildir:**
- Bir ChatGPT sarmalayıcısı değildir
- Basit bir task runner değildir
- Yalnızca Claude'a bağlı değildir (multi-provider: Claude · Codex · Gemini · Ollama · OpenAI-compatible fleet)
- "X'in açık kaynak alternatifi" değildir — kendi sağlam konumu olan ayrı bir ürün

**Çekirdek İlkeler:**
1. **Native-first** — bir CLI aracı gibi kurulur, Claude Code'a MCP üzerinden entegre olur, argümansız `deckent` çağrısı agentic REPL açar (Sprint 219+).
2. **Self-evolving** — hatalarından öğrenir, planlarını iyileştirir, desenleri uyarlar (Memory V2 + retro).
3. **Observable** — her ajanın aksiyonu real-time görünür (dashboard 8 sayfa · SSE · watch · tmux).
4. **Usage-aware** — plan limitlerini asla aşmaz, sprint'i asla yarım bırakmaz.
5. **Plan-compatible** — Pro ($20), Max ($100-200) abonelik VEYA API (subscription-CLI = ücretsiz worker).
6. **Zero-friction** — doğal dil giriş, orkestre edilmiş sprint çıkış.
7. **Open source** — community-driven, plugin/skill ile genişletilebilir, "open source for open world".

**USP (Benzersiz Değer Önerisi):**
Sprint + öğrenme döngüsü. Deckent yalnızca task yürütmez — sprint planlar, sonuçları GO/NO-GO protokolüyle değerlendirir, tech debt izler, retro çalıştırır ve öğrenimleri bir sonraki sprint'e besler. Her sprint sistemi daha akıllı yapar.

**Bugün nerededir (Sprint 285+):**
- **Native REPL** (Sprint 219–285, ADR-081/083/084) üretimde: argümansız `deckent` → full-scope terminal REPL — gerçek LLM round-trip, Ink tabanlı görsel, 5-provider paritesi (claude / codex / gemini / ollama / openai-compatible), slash-komutlar, agentic dispatch. **Sprint 285:** tur-içi tool kuyruğu + per-tool onay kapısı (god-level tool-use UX).
- **Otonom motor** (Sprint 220+, ADR-064/068/071) **main'e merge edildi ve çalışıyor**: dayanıklı backlog (`backlog.json`), 3-kapı yönetişim (RBAC → per-task-policy → EffectClass-risk), recurring/one-off/reactive tetikleyiciler, `deckent autonomous` CLI + `deckent_autonomous` MCP tool. Yerel-model otonom (Ollama qwen3.6) canlı kanıtlı.
- **Nervous System** (ADR-040, Sprint 138+) aktif: 12 dedektör, proaktif meta-orkestratör (observer → detector → decision → proposer → dispatcher → executor), authority-matrix, `deckent nervous_*` MCP tools + REPL bridge.
- **Dashboard** (Sprint 219–285): 16 sayfa (Dashboard, Chat, Config, Debt, Directives, Enterprise, Evolution, History, Memory, MemoryExplorer, Nervous, Settings, Status, Workers, Login, Callback). `deckent serve` → auth-kapılı HTTP API + SSE.
- **Memory V2 DB-first** (Sprint 140+, ADR-088): SQLite + FTS5 dual-layer Türkçe normalize, `deckent recall/remember`, `deckent_memory_query` MCP tool. %96 context-window azaltması.
- Sürüm: `1.0.0-beta.1` (npm publish gate Alperen manuel). **MCP**: 34 tool + 8 resource. **CLI**: 55+ komut. **Agent**: 15 built-in + 2 custom. **Skill**: 21 built-in. **Provider**: 4 (claude/codex/gemini/ollama) + OpenAI-compatible. **Model**: 13 / 4 tier.

---

## 2. NE YAPAR — ÜÇ YÜZ, BİR MOTOR (Trinity)

> **"Deckent bir AI Assistant, bir AI System Worker ve bir AI Developer olacak. Şirketler, geliştiriciler ve günlük insanlar hepsi kullanabilecek. Hedef hep buydu."** — Alperen, 2026-05-20

Deckent **tek motorla üç yüz** sunar (Brain + MCP tools + Memory + Agent pool + Nervous System + Hybrid Mode).

| Yüz | Hedef | Ne yapar | Mod | Bugünkü olgunluk |
|-----|-------|----------|-----|-----------------|
| **AI Developer** | Solo dev, takım, ajans | Sprint orkestrasyon, multi-agent yürütme, kalite kapıları, retro öğrenme, refactor ve review | Sprint Mode | ~%95 — `v1.0.0-beta.1` hazır |
| **AI System Worker** | Şirket — operasyon, IT, finans, müşteri deneyimi | İş otomasyonu, sistem entegrasyonu, scheduled flow, audited yürütme, uzun süreli arka plan işleri | Process Mode | ~%60 — F3 başladı, terminal F8 ERP bağlanıyor |
| **AI Assistant** | Günlük insanlar — öğrenci, freelancer, ev, herkes | Konuşmaya dayalı planlama, hatırlatma, kişisel hafıza, gündelik akış yardımı | Chat Mode | ~%35-40 — Path B canlı, Path C native agentic Sprint 219'da |

Bunlar **üç ürün değil — aynı ürünün üç modudur.** Aynı MCP tool'ları geliştiricinin sprint'ini orkestre ederken şirketin raporlama job'ını otomatize eder ve günlük kullanıcının sorusuna yanıt verir. Hybrid Mode mimarisi (ADR-042) bunu başından öngördü.

---

## 3. MİMARİ — AS-BUILT

```
┌─────────────────────────────────────────────────────┐
│        SEN (Doğal Dil / Komut / Dashboard)            │
│   Claude Code · `deckent` (REPL) · DIRECTIVES.md     │
└──────────┬──────────────────────┬──────────────────┘
           │                      │
┌──────────▼─────────┐  ┌─────────▼──────────────────┐
│   CLAUDE CODE       │  │   DECKENT CLI / REPL       │
│  (MCP client)       │  │   `deckent start/plan/web` │
└──────────┬─────────┘  └─────────┬──────────────────┘
           │                      │
┌──────────▼──────────────────────▼──────────────────┐
│         DECKENT MCP SERVER (stdio)                  │
│  34 Tool + 8 Resource                              │
│  init · plan · start · status · memory_query ...    │
│  audit · recover · feature_query · watch · nervous_*│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              CORE ENGINE                             │
│  brain.ts · planner.ts · auditor.ts · worker.ts     │
│  task-router.ts · provider.ts · server.ts (HTTP)    │
└──────────┬───────────────────────────┬──────────────┘
           │                           │
┌──────────▼─────────┐  ┌─────────────▼──────────────┐
│   BRAIN + PLANNER   │  │        AUDITOR              │
│  Plan (AI/struct),  │  │  In-process scan loop       │
│  evaluate, learn    │  │  Brain runSprint içinde     │
│  Model: opus/sonnet │  │  (30sn döngü, tmux yok)     │
└──────────┬─────────┘  └─────────────┬──────────────┘
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              WORKER POOL (dinamik)                   │
│  tmux / subprocess / Docker — Brain talebine göre   │
│  Her worker: plan → kod → test → doc → rapor        │
│  Model: task başına (opus/sonnet/haiku/codex/gemini)│
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│        MEMORY V2 — DB-FIRST (.brain/)                │
│  SQLite (memory.db) — tek hakikat kaynağı           │
│  FTS5 full-text (dual-layer TR/EN normalize)        │
│  9 entry tipi: ADR · memory · sprint · debt ·       │
│  pattern · retro · error · identity · audit         │
│  Auto-export: .brain/exports/                       │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│        HTTP API + WEB DASHBOARD                      │
│  src/api/server.ts — 16 endpoint + SSE              │
│  src/dashboard/ — React+Vite+Tailwind (16 sayfa)    │
│  `deckent web` → localhost:3100                     │
└─────────────────────────────────────────────────────┘
```

**Provider katmanı (multi-fleet):** ProviderAdapter arabirimi `spawn(opts) · checkUsage() · isAvailable() · supportedModels[] · name` sunar. Bugün canlı 8-provider fleet: Claude (subscription/API), Codex (OpenAI), Gemini (Google), Ollama (yerel), OpenAI-compatible (Groq / Together / Fireworks / vb.). Brain provider-agnostic; `spawnWorkers()` `SpawnBackendFactory.create()` çağırır.

**Spawn backend (üçlü):** tmux (Linux/macOS varsayılan, canlı terminal) · subprocess (Windows + headless) · Docker (CI/CD + izolasyon). Her worker kendi izole ortamında çalışır.

**Core + Enterprise-Layer ayrımı (önemli):** core = sprint + brain + worker + memory + dashboard temeli; enterprise-layer = RBAC (ADR-037) + audit query + multi-tenant + scheduled flows + identity broker. **Çatallama gerekmez** — aynı kod tabanı her iki modu da koşar; enterprise-layer flag'lerle açılır.

---

## 4. MEMORY V2 — DB-FIRST

Önceki sürümler `.brain/MEMORY.md` ve `DECISIONS.md` gibi düz metin dosyalarına yazıyordu. Sprint 130+ ile SQLite tek hakikat kaynağı oldu:

- **DB yolu:** `.brain/memory.db` (gitignore, exportlardan yeniden inşa edilir).
- **Şema:** `entries` ana tablo + `tags` + `relations` + `entry_history` + FTS5 `entries_fts` (4 + 4 = 8 sütun; orijinal + Türkçe-normalize edilmiş).
- **Arama:** `searchMemory()` dual-layer FTS5 — TR ve EN aynı sorguda %100 recall.
- **Export:** `.brain/exports/summary.md · decisions.md · memory.md · debt.md` git-tracked snapshot, sprint sonunda yeniden üretilir.
- **API:** `MemoryStore.insert · upsert · getByType · search · decay · history` — Brain bu API üzerinden çalışır, dosya parse etmez.
- **CLI:** `deckent recall "sorgu"` · `deckent remember "not"` · `deckent memory rebuild|export|stats`.
- **MCP:** `deckent_memory_query` — cross-source hafıza arama.

**Sonuç:** %96 context-window azaltma (Sprint 130 ölçümü); ground-truth tek yerde; turkce/english/almanca dahil i18n %100 recall.

---

## 5. SPRINT YAŞAM DÖNGÜSÜ

8 faz:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP
```

| Faz | Açıklama | Sorumlu |
|-----|----------|---------|
| **PLAN** | Brain DIRECTIVES.md'yi okur, task JSON'larını üretir | Brain |
| **SPAWN** | Worker'lar tmux/subprocess/Docker ile spawn edilir; Auditor başlar | Brain |
| **WAVE_BUILD** | `dependency_pipeline_enabled: true` ise Kahn topological wave sıralaması (ADR-045) | Brain |
| **EXECUTE** | Worker'lar task'ları uygular, heartbeat yazar | Workers |
| **EVALUATE** | Brain sonuçları değerlendirir: GO / NO_GO / GO_WITH_TECH_DEBT | Brain |
| **FIX** | Başarısız task'lar yeniden denenir (configurable timeout) | Brain + Workers |
| **RETRO** | Retrospektif memory.db'ye yazılır; öğrenimler hasat edilir | Brain |
| **DECAY** | `.brain/` bütçesi aşıldıysa eski satırlar temizlenir | Brain |
| **CLEANUP** | Task dosyaları arşivlenir, kilitler bırakılır, session'lar kapatılır | Brain |

**GO / NO-GO / TECH_DEBT protokolü:**
- `DONE` — tüm goCriteria kanıtlı yerine getirildi; çalışan sonuç var.
- `GO_WITH_TECH_DEBT` — çekirdek kriterler karşılandı, ufak boşluk açıkça not edildi.
- `NO_GO` — en az bir kritik kriter karşılanmadı; FIX fazına gider.

**Proof-of-Function gate (ADR-079):** user-surface task (`src/cli/`, `src/dashboard/`, `src/api/`) → Tier-1; mock-only test = GO_WITH_TECH_DEBT (DONE değil). `Smoke:` direktifi gerçek-binary çalıştırılır, başarısız ise downgrade edilir.

---

## 6. KONUMLANMA — "OPEN SOURCE FOR OPEN WORLD"

**Anlatı:** Deckent **karşı-X değildir** — açık dünyaya katkı, kendi konumunu kendi değer önerisiyle netleştiren bir ürün.

**Deckent'in özgün değer önerisi:**
- **Evrimsel mimari** — core + enterprise-layer ayrımı: aynı kod tabanı, çatallanmadan ölçeklenir
- **Dependency-pipeline waves** — Kahn topological sıralama ile paralel ve sıralı görev yürütme
- **Memory V2 FTS5** — SQLite + dual-layer Türkçe normalizasyon, %96 context azaltma
- **Multi-provider** — Claude, Codex, Gemini, Ollama, OpenAI-compatible; provider-agnostik mimari
- **Nervous System** — 12 dedektörle proaktif meta-orkestratör; onay-kapısı ile otonom güvenliği
- **Otonom motor** — dayanıklı backlog, 3-kapı yönetişim (RBAC → policy → EffectClass-risk)
- **ADR-governance** — 89 kabul edilmiş ADR; mimari kararlar zorunlu kısıt olarak uygulanır
- **MIT açık kaynak** — self-hosted, on-prem, topluluk odaklı

**Deckent'in özgün şekli:** **core + enterprise-layer** ayrımı + **6-senaryo kapsama** + **üç-yüz tek-motor**. Bu şekli korumak demek: tek kullanıcılı bireyselden 10.000 kişilik kurumsala kadar **aynı ürün** çatallanmadan ölçeklenir.

---

## 7. 6 SENARYO — "EVERYONE EVERYWHERE"

Deckent **tek bir hedef kitleye** değil, **6 ayrı bağlama** hizmet eder (her biri için aynı MCP/CLI/dashboard yüzeyi):

| # | Senaryo | Kim | Kullanım | Olgunluk |
|---|---------|-----|---------|----------|
| 1 | **Sıfırdan başla** (greenfield) | Yeni proje açan dev | `deckent init` → DIRECTIVES → `deckent start` | %95 |
| 2 | **Aktif geliştirme** (in-dev) | Kod yazan ekip | Sprint paralel, multi-agent, Memory V2 | %95 |
| 3 | **Maintained** | Bakımdaki proje | Bug-fix sprint, refactor, ADR governance | %90 |
| 4 | **Günlük iş** (daily-tasks) | Her gün küçük işler | `deckent chat` (Path B canlı), agentic REPL (Sprint 219+) | %50 |
| 5 | **ERP entegrasyonu** | Operasyon / IT | Capability Broker (F8), scheduled flows, audit | %40 |
| 6 | **Enterprise** | 100-10000 kişi | RBAC + multi-tenant + audit query + SSO/SIEM | %30 |

Her senaryo aynı **core**'u paylaşır; üst senaryolar **enterprise-layer**'ın daha fazla bileşenini açar (RBAC zorunluluğu, audit query, tenant isolation, SSO).

---

## 8. NATIVE AGENTIC DECKENT (Sprint 216–219)

**Hedef:** `deckent` argümansız çağrıldığında `claude` gibi davransın — doğrudan native agentic conversational REPL açsın. Kullanıcı doğal dille konuşur → deckent **kendi sprint/status/memory/dosya aksiyonlarını** alır (onay-kapısıyla).

**Sprint 219 dalgaları (özet):**
- **Dalga A — Native REPL:** argümansız `deckent` → agentic chat launch; `deckent chat --native` gerçek round-trip kanıtlı; REPL UX (prompt, history, çok-satır, exit, Ctrl-C) god-level.
- **Dalga B — Agentic Tool-Use:** REPL'de doğal dil → MCP/deckent aksiyon dispatch + riskli aksiyon onay-kapısı + session persist (memory.db).
- **Dalga C — F2 Streaming:** `/api/chat/stream` SSE token-stream; REPL + dashboard akan cevap render.
- **Dalga D — Dashboard Kalıcı-Fix:** Layout/Sidebar tek-kaynak navItems + render-based test + cache-bust 8-sayfa garanti.
- **Dalga E — TR MASTER-PLAN + ADR-081:** Türkçe MASTER-PLAN; ADR-081 native agentic deckent yönü.
- **Dalga F — Kimlik Dokümanı + Otonom Temel:** bu doküman (blueprint-TR) + İngilizce blueprint güncel + `autonomous-runtime.ts` iskeleti.
- **Dalga G — Plan-Akış Wire-Gap:** routing routeTaskV2 wire (surface-bonus plan'da devrede) + Smoke-field plannerTaskToParams (Proof-of-Function gate input'lu).

---

## 9. OTONOM AGENTIC RUNTIME (Sprint 220+)

**Vizyon (Alperen):** on-demand sprintlerin ötesinde, deckent **sürekli + otonom + yetki-sınırlı** çalışsın. Bir kuruma kurulur:
- Müşteri talebi gelir → analiz eder → MRP sorgular → onay-kapısı içinde aksiyon alır → audit kaydı yazar.
- Sipariş güncellemesi → ilgili kişiyi bildirir → süreç durumunu izler.
- KPI sapması → Brain'i tetikler → düzeltme sprint'i planlar.

**Yapı taşları (mevcut):**
- F3 Process Mode + scheduled flows (Sprint 167+).
- Nervous System meta-orchestrator + approval queue (ADR-040, Sprint 138+).
- Capability Broker F8 ERP (read-first, aksiyon önerisi + onaylı çalıştırma).
- ADR-037 Brain-Auditor-Worker Authority Matrix RBAC V1.0.
- ADR-068 Enterprise Foundation (audit query + multi-tenant + scheduled).
- ADR-069/071 F3 Autonomous Mode + F4 RBAC/Tenant/Audit (proposed).

**As-built (Sprint 220+):** Otonom motor **main'e merge edildi ve çalışıyor** — `deckent autonomous start` komutu motoru uçtan uca yürütür. Durable backlog (`backlog.json`), 3-kapı yönetişim, recurring/one-off/reactive tetikleyiciler, crash-recovery, `config.autonomous.*` (varsayılan kapalı). Yerel-model otonom: sıfır-maliyet **qwen3.6 (Ollama, host)** worker otonom biçimde gerçek bir doküman iyileştirmesi üretti — Phase-1 kanıtlı canlı.

**Sınır:** Otonom mod **yetki sınırları içinde** çalışır — RBAC dışı aksiyon, onay-kapısı reddi, hassas adım için kesin onay gerektirir. "Bu otonom" demek "bu kontrolsüz" demek değildir.

---

## 10. GÜVENLİK VE RBAC AUTHORITY MATRIX (ADR-037)

**Üç-yüz authority matrix:**
| Rol | Ne yapabilir | Ne yapamaz |
|-----|-------------|-----------|
| **Brain** | Plan, evaluate, retro, decay, cleanup; tüm dosyalara read | Worker code'una doğrudan write (sadece task üzerinden) |
| **Auditor** | scan, alert, ADR compliance check, doc-sync mismatch detect, pattern record | Source code yazmaz (NEVER); destructive komut çağırmaz |
| **Worker** | scope.filesWrite içinde yaz, scope.filesRead içinde oku, heartbeat yaz, result yaz | scope dışı dosya yazma, scope dışı git komutu, `npm publish`, sprint-state mutation |

**Runtime statüsü (V1.0):** compile-time lint + audit-trail aktif; **runtime advisory/soft** (V1.0 Layer-2 kasıtlı eksik — ihlal `git diff --stat` ile Auditor tarafından warn + emit, **bloke ETMEZ**). Hard-flip post-GA V2'ye planlanır.

**Honest-gate:** Worker self-flag eder (örn. BOUNDARY_VIOLATION → NO_GO), Brain FIX/cascade uygular. Auditor alert yayar.

**Self-modifying detection (ADR-039):** deckent-dev üzerinde dogfood çalışırken kendi kaynağını mutating task'lar tespit edilir (Sprint 139 catastrophic lesson — git-guard aktif).

**Path A — kullanıcı projeleri:** RBAC + scope enforcement default açık; deckent kullanıcının repo'sunu kendi şartlarında değiştirir.
**Path B — deckent-dev:** RBAC advisory; manual wave dispatch (ADR-047); git-guard aktif.

---

## 11. İLGİLİ BELGELER VE TARİHSEL BAĞLAM

**Birincil (canlı):**
- [`blueprint.md`](./blueprint.md) — İngilizce ana SSOT-of-identity (bu dokümanın İngilizce karşılığı + tarihsel sprint bölümleri).
- [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) — geliştirme SSOT (nasıl-inşa-edilir, sprint sıralama, F1-F10 kalan iş).
- [`docs/MASTER-PLAN-TR.md`](../MASTER-PLAN-TR.md) — Türkçe MASTER-PLAN (Sprint 219'da oluşturuldu).
- [`docs/vision/VISION.md`](./VISION.md) · [`docs/vision/VISION-TR.md`](./VISION-TR.md) — kısa stratejik özet (vizyon, misyon, kategori, faz).
- [`docs/vision/competitive-analysis.md`](./competitive-analysis.md) — kıyaslama matrisi (kıyas, karşıtlık değil).
- [`docs/vision/roadmap.md`](./roadmap.md) — eski roadmap (MASTER-PLAN'a konsolide edildi, provenance için korunur).

**ADR'ler (mimari karar zinciri):**
- `.brain/exports/decisions.md` — tüm aktif ADR'ler (MADR v3, exports'tan üretilir).
- Anahtar: ADR-001 (TS+ESM), ADR-008 (Brain merkezî), ADR-010 (tek runtime dep), ADR-029/030 (managed-docs), ADR-035 (verification protocol), ADR-037 (authority matrix), ADR-040 (nervous system), ADR-042 (hybrid mode), ADR-046 (brain self-update), ADR-064 (TOPP wave-barrier), ADR-079 (proof-of-function DoD), ADR-080 (dashboard god-level).

**Sprint geçmişi:**
İngilizce `blueprint.md` §24 Sprint History tarihsel zaman çizgisini içerir — Sprint 1'den bugüne. Sprint 130'da Memory V2 DB-first geçiş; Sprint 138-145 ADR governance + Nervous System; Sprint 162-166 stability mührü; Sprint 167-211 public beta arc; Sprint 216-219 native agentic + dashboard kalıcı-fix.

---

## NOT — Doküman Bakımı

Bu doküman managed-docs (ADR-029/030) **dışında** durur; içerik elle bakım gerektirir. Live Metrics ve sayım blokları yoktur — code-derived sayımlar `blueprint.md` (EN) tarafında otomatik tutulur, bu doküman daha çok anlatı/positioning. Stale-detection için: bu dokümanı her büyük yön değişikliğinden sonra (native-agent sprint 285+ güncellemeleri, F4 enterprise, autonomous milestones) yeniden okuyup gerekiyorsa güncelle. Sprint sayım rakamları için `blueprint.md` Live Metrics ya da `deckent status` referans alınmalı. Son güncelleme: Sprint 286.

> **"Open source for open world."** — Deckent felsefesi.
