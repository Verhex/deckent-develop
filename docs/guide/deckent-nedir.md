# DECKENT TAM DURUM ANALİZİ

> Son güncelleme: 2026-03-26 (Sprint 065) | Kaynak: Codebase tam tarama | 247 .ts kaynak dosya, 75.105 satır kod, 11.862 test, 469 test dosyası

---

## 1. DECKENT TAM OLARAK NEDİR

Deckent, **Claude Code CLI üzerine kurulu bir AI ajan orkestrasyon sistemidir**. Tek başına bir AI modeli değildir — Anthropic'in Claude CLI'ını (`claude` komutu) altyapı olarak kullanarak birden fazla AI ajanını koordine eder.

**Ne yapar:**
- Bir yazılım projesinde yapılması gereken işleri (DIRECTIVES.md) okur
- Bu işleri görevlere (task) böler ve her birine uygun model atar (opus/sonnet/haiku/gpt-4.1/o3/o4-mini/gemini-2.5-pro/gemini-2.5-flash)
- tmux oturumları veya subprocess backend uzerinden paralel worker'lar spawn eder (tmux artik opsiyonel)
- Her worker bagimsiz bir AI CLI instance'idir (Claude, OpenAI veya Gemini)
- Auditor sürekli izler: sınır ihlali, kilitlenme, stale agent tespiti
- Sprint sonunda değerlendirme, retrospektif ve bellek yönetimi yapar

**Multi-Provider Desteği (Sprint 038):**
Deckent artık 3 farklı AI provider'ı destekliyor: Claude (Anthropic), Codex (OpenAI), Gemini (Google). Aynı sprint'te farklı provider'lar kullanılabilir. Her görev için en uygun model+provider çifti otomatik seçilir. Provider fallback zinciri sayesinde kota aşımı veya hata durumunda bir sonraki provider'a geçiş yapılır — maliyet optimizasyonu ve yüksek erişilebilirlik sağlanır.

**Ne DEĞİLDİR:**
- Bir AI modeli değil — Claude'u araç olarak kullanır
- Bir IDE eklentisi değil — terminal (CLI) tabanlıdır
- Bir CI/CD aracı değil — geliştirme zamanında çalışır
- Sadece kod yazmaz — planlama, izleme, değerlendirme ve bellek yönetimi de yapar

**Teknoloji:**
- Dil: TypeScript (ESM)
- Runtime: Node.js >=18
- Test: Vitest (8.555+ test, 265 test dosyası)
- Build: tsc
- Bagimsizlik: Claude CLI / OpenAI CLI / Google Gemini CLI, git (tmux opsiyonel — subprocess backend ile calismadan kaldirilabilir)
- Desteklenen Modeller: opus, sonnet, haiku (Claude) | gpt-4.1, o3, o4-mini (Codex) | gemini-2.5-pro, gemini-2.5-flash (Gemini) — toplam 8 model

---

## 2. ÇALIŞMA MODELİ

### Adım Adım Sprint Akışı

```
DIRECTIVES.md → Brain okur → Plan oluştur → Task JSON'lar yaz
    → tmux session aç → Worker'lar spawn et → Auditor tarama başlat
    → Worker'lar çalışır (heartbeat yazar) → Result dosyaları oluşur
    → Brain değerlendirir (DONE/GO_WITH_TECH_DEBT/NO_GO)
    → NO_GO varsa fix task oluştur → Retrospektif yaz → Decay çalıştır
    → Cleanup → Sprint tamamlandı
```

### Veri Akışı

```
Kullanıcı
  │
  ├─→ CLI (25 komut) ──→ Brain (orchestrator)
  ├─→ MCP (10 tool) ───→ Brain
  ├─→ HTTP API (16 endpoint) ─→ Brain
  │
  Brain
  │  ├─→ Planner (AI/structured) → Task JSON dosyaları (.tasks/)
  │  ├─→ tmux → Worker spawn (her biri ayrı Claude CLI)
  │  ├─→ Auditor (30s döngü) → .dashboard güncellemesi
  │  └─→ Debt Manager → .brain/DEBT.md
  │
  Worker (tmux window)
  │  ├─→ .tasks/task-{id}.hb (heartbeat)
  │  ├─→ .tasks/task-{id}.result (sonuç)
  │  └─→ .locks/{file}.lock (dosya kilidi)
  │
  Dashboard (.dashboard JSON)
  │  ├─→ CLI dashboard/status/watch komutları
  │  ├─→ HTTP /api/status + SSE /api/events
  │  └─→ Web Dashboard (React SPA)
```

### Claude Code Bağımlılığı

Deckent, `claude` CLI komutunu iki yerde doğrudan çağırır:
1. **Planner** (`src/orchestra/planner.ts`): `claude -p {prompt} --model {model} --output-format json` — sprint planlaması için
2. **Worker spawn** (`src/orchestra/tmux.ts`): `claude -p {promptFile} --model {model}` — görev yürütme için

Her worker bağımsız bir Claude CLI process'idir. Deckent'in kendisi AI kararları almaz — Claude'a delege eder.

---

## 3. CLI KOMUTLARI

**Toplam: 25 komut** | 21 tam uygulama | 4 stub

### Sprint Yönetimi (5 komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent init` | src/cli/commands/init.ts | `--auto`, `--manual` | Tam | Proje başlatma: dizin yapısı, config, şablonlar, i18n, profil tespiti |
| `deckent plan` | src/cli/commands/plan.ts | `--no-confirm`, `--structured` | Tam | Sprint planla (çalıştırma), görev tablosu göster, onay iste |
| `deckent start` | src/cli/commands/start.ts | `--auto-approve`, `--dry-run`, `--force`, `--watch`, `--sandbox-mode` | Tam | Sprint başlat: plan → spawn → çalıştır. `--dry-run` spawn atlar, `--sandbox-mode` stub |
| `deckent status` | src/cli/commands/status.ts | `--watch`, `--json` | Tam | Dashboard durumu göster. `--watch` 2s yenileme, `--json` ham JSON |
| `deckent test` | src/cli/commands/test-run.ts | `--keep`, `--timeout {ms}` | Tam | Test sprint'i: retro/memory/decay atlanır. `--keep` cleanup atlar |

### Worker & Süreç Yönetimi (4 komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent spawn {taskId}` | src/cli/commands/spawn.ts | — | Tam | Tek bir görev için worker spawn et |
| `deckent kill {taskId}` | src/cli/commands/kill.ts | — | Tam | Çalışan worker'ı sonlandır (tmux kill-window) |
| `deckent attach` | src/cli/commands/attach.ts | — | Tam | tmux orkestra oturumuna bağlan |
| `deckent run {description}` | src/cli/commands/run.ts | `--model`, `--scope {dir}` | Tam | Tek seferlik görev: sprint döngüsü olmadan çalıştır (5dk timeout) |

### İzleme & Dashboard (3 komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent dashboard` | src/cli/commands/dashboard.ts | `--interval {ms}` | Tam | Terminal dashboard: worker'lar, progress bar, alert'ler, Unicode border |
| `deckent watch` | src/cli/commands/watch.ts | `--follow {taskId}` | Tam | tmux split view: dashboard + worker pane'leri |
| `deckent doctor` | src/cli/commands/doctor.ts | `--profile` | Tam | Sistem sağlığı: 10 kontrol (Node, git, tmux, Claude CLI, workspace, brain, debt, lock). `--profile` CPU/RAM/worker önerisi |

### Analiz & Geçmiş (3 komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent analyze` | src/cli/commands/analyze.ts | `--json` | Tam | Proje stack tespiti: framework, dil, test, CI, boyut, metodoloji önerisi |
| `deckent history` | src/cli/commands/history.ts | — | Tam | Sprint geçmişi: görev sayısı, tamamlanma oranı, coverage, süre |
| `deckent retro` | src/cli/commands/retro.ts | — | Tam | Son sprint retrospektifi (.brain/RETRO.md) |

### Konfigürasyon & Sistem (4 komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent config` | src/cli/commands/config.ts | alt komutlar: `set`, `export`, `import` | Tam | Config göster/ayarla/dışa aktar/içe aktar |
| `deckent sync` | src/cli/commands/sync.ts | — | Tam | Adapter dosyalarını (CLAUDE.md, AGENTS.md) DECKENT.md ile senkronize et |
| `deckent cleanup` | src/cli/commands/cleanup.ts | `--decay` | Tam | Sprint sonrası temizlik: task dosyaları sil, opsiyonel bellek decay |
| `deckent archive-debt` | src/cli/commands/archive-debt.ts | — | Tam | Çözülmüş debt item'ları DEBT-ARCHIVE.md'ye taşı |

### Sunucu & Web (2 komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent serve` | src/cli/commands/serve.ts | `--port {number}` | Tam | HTTP API sunucusu başlat (varsayılan port 3100, SSE desteği) |
| `deckent web` | src/cli/commands/web.ts | `--port`, `--dev` | Tam | Web dashboard başlat (frontend + backend). `--dev` Vite dev server |

### Plugin Sistemi (1 komut, 4 alt komut)

| Komut | Dosya | Flag'ler | Durum | Açıklama |
|-------|-------|----------|-------|----------|
| `deckent plugin list` | src/cli/commands/plugin.ts | — | Tam | Yüklü plugin'leri listele |
| `deckent plugin info {dir}` | src/cli/commands/plugin.ts | — | Tam | Plugin detayları göster |
| `deckent plugin create {name}` | src/cli/commands/plugin.ts | — | Tam | Plugin scaffold oluştur (manifest.json, SKILL.md, README.md) |
| `deckent plugin install {name}` | src/cli/commands/plugin.ts | — | **Stub** | Henüz uygulanmadı |

### Stub Komutlar (1 komut)

| Komut | Dosya | Durum | Mesaj |
|-------|-------|-------|-------|
| `deckent plugin install` | src/cli/commands/plugin.ts | **Stub** | Henuz uygulanmadi |

### Yeni Tam Uygulamalar (Sprint 28)

| Komut | Dosya | Durum | Aciklama |
|-------|-------|-------|----------|
| `deckent onboard` | src/cli/commands/onboard.ts | **Tam** | Interaktif wizard: Claude tespit, sistem profil, config onerisi |
| `deckent upgrade` | src/cli/commands/upgrade.ts | **Tam** | npm view ile versiyon kontrolu, --check flag, npm install -g |
| `deckent usage` | src/cli/commands/usage.ts | **Tam** | UsageTracker'dan veri okuma, --json, --sprint filtre |

---

## 4. MCP TOOL'LARI

**Toplam: 10 tool** | Kayıt: `src/mcp/server.ts` | SDK: `@modelcontextprotocol/sdk` | Transport: stdio

| # | Tool Adı | Dosya | Parametreler | Açıklama |
|---|----------|-------|-------------|----------|
| 1 | `deckent_init` | src/mcp/tools/init.ts | `projectName` (zorunlu), `mode` (max_plan/max5x_plan/pro_plan/api), `language` (en/tr) | Proje başlat, dizin yapısı oluştur |
| 2 | `deckent_set_directives` | src/mcp/tools/directives.ts | `content` (zorunlu) | DIRECTIVES.md yaz, görev sayısı ve model dağılımı döndür |
| 3 | `deckent_plan` | src/mcp/tools/plan.ts | `dryRun` (varsayılan true), `mode` (ai/structured/auto) | Sprint planla, wave dağılımı ve risk analizi döndür |
| 4 | `deckent_start` | src/mcp/tools/start.ts | `autoApprove` (varsayılan false) | Sprint'i arka planda başlat (fire-and-forget), jobId döndür |
| 5 | `deckent_status` | src/mcp/tools/status.ts | — | Dashboard durumu: progress, ETA, worker özeti, alert'ler |
| 6 | `deckent_doctor` | src/mcp/tools/doctor.ts | `includeProfile` (varsayılan false) | Sağlık kontrolleri: 10 check, skor, öneriler |
| 7 | `deckent_retro` | src/mcp/tools/retro.ts | — | Son sprint retrospektifi + highlight'lar (max 5) |
| 8 | `deckent_history` | src/mcp/tools/history.ts | `last` (varsayılan 5) | Sprint geçmişi + trend tespiti (improving/declining/stable) |
| 9 | `deckent_analyze_project` | src/mcp/tools/analyze.ts | — | Proje stack analizi, config önerileri |
| 10 | `deckent_sync` | src/mcp/tools/sync.ts | — | Adapter dosya senkronizasyonu, değişiklik sayısı |

### MCP Resource'ları (5 adet)

| # | URI | MIME | Dosya | Açıklama |
|---|-----|------|-------|----------|
| 1 | `deckent://dashboard` | application/json | src/mcp/resources/dashboard.ts | Canlı sprint durumu (JSON) |
| 2 | `deckent://directives` | text/markdown | src/mcp/resources/directives.ts | DIRECTIVES.md içeriği |
| 3 | `deckent://memory` | text/markdown | src/mcp/resources/memory.ts | .brain/MEMORY.md içeriği |
| 4 | `deckent://debt` | application/json | src/mcp/resources/debt.ts | Teknik borç item'ları (DebtItem[]) |
| 5 | `deckent://config` | application/json | src/mcp/resources/config.ts | Proje konfigürasyonu |

### Response Enrichment

Tüm MCP tool response'ları `enrichResponse()` ile zenginleştirilir (`src/mcp/helpers/enrich.ts`):

```json
{
  "...originalResponse",
  "_enriched": {
    "summary": "Sprint planlandı, 8 görev oluşturuldu",
    "hints": ["Planı onaylamak için deckent_start kullanın"],
    "timestamp": "2026-03-20T..."
  }
}
```

tr/en lokalizasyon destekli.

---

## 5. HTTP API

**Sunucu:** `src/api/server.ts` | **Port:** 3100 (varsayılan) | **Bind:** 127.0.0.1 | **Auth:** Opsiyonel Bearer token (POST'lar için)

### GET Endpoint'leri (11 adet)

| Endpoint | Dönen Veri | Açıklama |
|----------|-----------|----------|
| `GET /api/status` | Dashboard JSON veya 404 | Aktif sprint durumu |
| `GET /api/sprint` | Sprint objesi (id, metrics, tasks) | Son sprint log'u |
| `GET /api/history` | Sprint geçmişi dizisi | Tüm sprint kayıtları |
| `GET /api/config` | Config JSON | Proje konfigürasyonu |
| `GET /api/doctor` | Check sonuçları + skor | Sağlık kontrolü |
| `GET /api/memory` | `{content: string}` | Brain belleği |
| `GET /api/debt` | `{content: string}` | Teknik borç içeriği |
| `GET /api/job/:jobId` | JobState (RUNNING/COMPLETE/FAILED) | Arka plan iş durumu |
| `GET /api/worker/:taskId/log` | `{taskId, log, task}` | Worker görev log'u |
| `GET /api/events` | SSE stream (JSON) | Gerçek zamanlı dashboard güncellemeleri |
| `GET /static/*` | HTML/CSS/JS | Web dashboard dosyaları (SPA fallback) |

### POST Endpoint'leri (5 adet)

| Endpoint | Body | Dönen Veri | Açıklama |
|----------|------|-----------|----------|
| `POST /api/start` | `{autoApprove?: boolean}` | `{jobId, status}` (202) | Sprint başlat |
| `POST /api/plan` | `{directive?, mode?}` | Sprint plan objesi | Sprint planla |
| `POST /api/kill/:workerId` | — | `{success: true}` | Worker sonlandır |
| `POST /api/set-directives` | `{content: string}` | `{success, taskCount}` | DIRECTIVES.md güncelle |
| `POST /api/config` | `Record{string, unknown}` | Güncel config | Config güncelle (merge) |

### HTTP Durum Kodları

| Kod | Anlam |
|-----|-------|
| 200 | Başarılı |
| 202 | Sprint başlatıldı (arka plan) |
| 400 | Geçersiz istek (JSON, parametre, schema) |
| 401 | Yetkisiz (Bearer token eksik/hatalı) |
| 404 | Kaynak bulunamadı (aktif sprint yok) |
| 405 | İzin verilmeyen metod |
| 409 | Çakışma (sprint zaten çalışıyor) |
| 500 | Sunucu hatası |

---

## 6. WEB DASHBOARD

**Konum:** `src/dashboard/src/` | **Framework:** React | **Tema:** Dark (zinc-900/800) | **Veri:** SSE + REST API

### Sayfalar (4 adet)

| Sayfa | Dosya | İçerik |
|-------|-------|--------|
| **Dashboard** | pages/DashboardPage.tsx | Canlı sprint izleme: agent tablosu, progress bar, ETA, alert'ler, faz badge'i (9 faz renk kodlu), yeni sprint modalı, agent detay drawer |
| **History** | pages/HistoryPage.tsx | Sprint geçmiş tablosu: ID, görev sayısı, tamamlanma, No-Go oranı, coverage, süre. SprintChart trend grafiği |
| **Memory** | pages/MemoryPage.tsx | Sekmeli arayüz: Memory tab (MEMORY.md markdown render), Debt tab (DEBT.md tablo) |
| **Settings** | pages/SettingsPage.tsx | Config editörü: mode, language, brain_model, default_model, maxWorkers. Doctor sağlık paneli |

### Bileşenler

| Bileşen | Dosya | İşlev |
|---------|-------|-------|
| Layout | Layout.tsx | Navigasyon, tema, responsive yapı |
| NewSprintModal | NewSprintModal.tsx | Yeni sprint tetikleme formu |
| AgentDetail | AgentDetail.tsx | Genişletilebilir ajan bilgisi |
| SprintChart | SprintChart.tsx | Trend görselleştirme |
| DebtTable | DebtTable.tsx | Teknik borç tablosu |
| SimpleMarkdown | SimpleMarkdown.tsx | Markdown render |
| ThemeProvider | ThemeProvider.tsx | Dark tema yönetimi |

### Hook'lar

| Hook | İşlev |
|------|-------|
| `useSSE(url)` | EventSource bağlantısı, 3s otomatik yeniden bağlanma |
| `useApi{T}(url)` | Fetch + loading/error/refetch state yönetimi |

### SSE Akışı

```
Web Dashboard ←── SSE (/api/events) ←── Watcher (src/api/watcher.ts)
                                              │
                                    .dashboard dosya değişikliği
                                    (500ms debounce)
                                              │
                                    Auditor 30s tarama döngüsü
```

---

## 7. AJAN SİSTEMİ

### Brain — Master Orchestrator
**Dosya:** `src/orchestra/brain.ts` (975 satır, 15 export)

Brain, sistemin **tek karar vericisidir**. ADR-008'e göre yalnızca Brain, tmux/auditor/worker modüllerini import eder.

**Temel Fonksiyonlar:**

| Fonksiyon | Açıklama |
|-----------|----------|
| `readContext()` | DIRECTIVES, MEMORY, RETRO, DEBT, PATTERNS, DECISIONS, mevcut task'lar, git status, dosya ağacı okur |
| `checkUsage()` | `claude -p /usage` ile 5 saatlik ve haftalık kullanım yüzdelerini ölçer |
| `adjustSprintSize()` | Kullanıma göre sprint boyutunu ayarlar: minimal/reduced/full |
| `planSprint()` | CRITICAL debt → öncelik fix, AI planner → structured fallback, deadlock tespiti, task JSON yazımı |
| `spawnWorkers()` | max_workers kadar task spawn eder, kalanları kuyruğa alır |
| `waitForResults()` | fs.watch ile .result dosyalarını izler, kuyruktan yeni task'lar spawn eder |
| `evaluateResult()` | DONE / GO_WITH_TECH_DEBT / NO_GO değerlendirmesi |
| `runSprint()` | 8 fazlı master orkestrasyon (bkz. Bölüm 10) |
| `pauseSprint()` | Aktif task'ları PAUSED'a geçirir, .paused dosyaları yazar |
| `resumeSprint()` | PAUSED → PENDING, marker dosyaları temizler |
| `checkAndAutoPause()` | Kullanım eşiği aşılırsa otomatik duraklat |
| `cleanup()` | Worker'ları öldür, lock'ları serbest bırak, .tasks dosyalarını sil |

**Hata Yönetimi:** `BrainError(message, phase)` — hangi fazda hata olduğunu izler.

### Agent Havuzu (Sprint 29)

Deckent, gorevlere otomatik olarak uzmanlasmis agent atayabilir:

- **8 yerlesik agent:** security-auditor, test-writer, doc-writer, code-reviewer, refactorer, bug-fixer, api-builder, performance-analyzer
- **Brain entegrasyonu:** planSprint sirasinda her gorev icin keyword+scope bazli otomatik agent secimi
- **Multi-agent pipeline:** Sirali agent calistirma, shared context ile ajanlar arasi iletisim
- **CLI:** `deckent agent list`, `deckent agent create`, `deckent agent enable/disable`
- **Dashboard:** Agent kolonu (cyan=uzman, dim=genel)

### Skill Sistemi (Sprint 30)

Deckent, proje teknolojisine gore dinamik skill secimi yapar:

- **10 yerlesik skill:** typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer
- **Stack detection:** Proje teknolojisini otomatik tespit (TypeScript, React, Python, Rust, Go, Docker) ve sonuclari cache'ler
- **Brain entegrasyonu:** Her gorev icin uygun skill secimi ve SKILL.md prompt enjeksiyonu (1500 karakter/skill, 4000 toplam limit)
- **CLI:** `deckent skill list`, `deckent skill create`, `deckent skill install`

### Karar Motoru (Sprint 31)

Deckent, 6 adimli karar motoru ile gorev atamasini otomatiklestirir:

- **Decision Engine:** 6 adimli pipeline (analiz -> agent -> skill -> model -> effort -> scope)
- **Task Analyzer:** Gorev tipi cikarimi (code/test/doc/security/refactor/devops/config), karmasiklik puanlamasi
- **Decision Logger:** Kararlari .tasks/decisions/ dizinine kaydet, replay ile yeniden calistir
- **Ogrenme dongusu:** Sprint sonrasi agent+skill+model kombinasyonlarini kaydet, basarili kombinasyonlari puanla (success*2 - fail*3 - recency penalty)
- **Learning Decay:** Eski ogrenme verilerini temizle, ozete sıkıstır
- **Learning Migration:** PATTERNS.md'yi ogrenme formatina donustur

### Multi-Agent Isbirligi (Sprint 31)

- **Paralel pipeline:** Topological sort ile bagimlilik-duyarli yurutme dalgalari
- **Paylasimli bellek:** Worker'lar arasi key-value iletisim, TTL destekli
- **Catisma cozumleme:** Ayni dosyaya yazma/scope cakismasi tespiti, 3 cozum stratejisi
- **Result merger:** Worker sonuclarini birlestir (dosya tekillestime, agirlikli coverage)
- **Handoff protokolu:** Bagimli gorevler arasi artifact aktarimi

### Adaptive Agent (Sprint 31)

- **Prompt etkinlik analizi:** Prompt basari oranini olc, iyilestirme onerileri sun
- **A/B testi:** Prompt varyantlarini karsilastir (minimum 4 ornek, 50/50 dagilim)
- **Surumleme:** Maksimum 10 surum, aktif surum secimi, budama
- **Geri alma:** Basarisiz prompt'lari otomatik geri al (<%50 basari, 3 kullanim sonrasi)
- **Metrikler:** Performans panosu (trend, en iyi/en kotu surum)

### UX Sistemi (Sprint 32)

- **Ilerleme cubugu (Progress bar):** Canli ilerleme cubugu, ETA hesaplayici (agirlikli ortalama), worker durum tablosu, kuyruk gorunumu, terminal genisligine uyum
- **Bildirimler:** Terminal zili, webhook (POST+retry), Discord embeds (renk kodlu), Slack Block Kit, event filtreleme
- **Sprint ozeti:** Kategorize dosya degisiklikleri (kaynak/test/config/docs), agent performans tablosu, akilli oneriler (maksimum 5), onceki sprint ile karsilastirma
- **Interaktif inceleme:** `deckent review` komutu — gorev bazinda onayla/reddet/yeniden dene, --auto modu, inceleme raporlari
- **Tema:** NO_COLOR/FORCE_COLOR destegi, 6 renk (success/error/warning/info/muted/accent)
- **Cikti modlari:** --quiet (sadece hatalar), --verbose (debug), --normal (varsayilan)
- **Ilerleme kaliciligi:** Baglanti kopmasinda durum kaydet/yukle

### Marketplace ve Entegrasyon (Sprint 33)

- **Skill Marketplace:** Skill arama, yayinlama, puanlama, bagimlillik cozumleme (topolojik siralama), uzak registry istemcisi
- **Adaptive Agent Ileri:** Sprint arasi analiz (basari/coverage trendleri), uzmanlik kaymasi tespiti (skor 0-1), otomatik emeklilik (<%30 basari), prompt evrim logu, agent soy agaci
- **Analytics:** Kullanim grafikleri, basari kartlari, agent karsilastirma, skill isi haritasi verileri
- **Performans:** Agent cache (LRU 100 girdi), skill cache (500KB), token sayaci (kelime/0.75 tahmini), lazy loader, toplu istatistik
- **Guvenlik:** Skill sandbox (suphe tespiti + karantina), izin korumasi (agent kendi kendini degistirme ve yetki yukseltme engeli)

### Worker — Görev Yürütücü
**Dosya:** `src/agents/worker.ts` (350 satır, 14 export)

Her worker bir tmux window'unda bağımsız Claude CLI instance'ı olarak çalışır.

**Yaşam Döngüsü:**

```
readTask → claimTask (PENDING→CLAIMED) → acquireLock → writeTaskPlan
  → [kod yaz/test et] → writeHeartbeat (her dosya değişikliğinde)
  → writeResult → releaseAllLocks
```

**Kapsam Zorlama:**
- `isWithinScope(filePath, scope)` — dosyanın scope.directories veya scope.filesWrite içinde olup olmadığını kontrol eder
- `ScopeViolationError` — kapsam dışı dosya erişiminde fırlatılır

**İlerleme Hesaplama:**
- EXECUTING=10%, CODING=30+6*min(files,5), TESTING=70%, DOCUMENTING=85%, DONE=100%

**Hata Sınıfları:**
- `TaskClaimError` — PENDING olmayan veya atanmış task'ı claim etme
- `LockError` — dosya kilidi çakışması
- `ScopeViolationError` — kapsam ihlali

### Auditor — İzleme & Uyarı
**Dosya:** `src/monitor/auditor.ts` (557 satır, 14 export)

Auditor **asla kaynak kodu yazmaz**. 30 saniyelik döngülerle sistemi tarar.

**Tarama Kapsamı:**

| Kontrol | Eşik | Alert Seviyesi |
|---------|------|----------------|
| Stale heartbeat | >120s (2dk) | CRITICAL |
| Sınır ihlali | `git diff --stat` vs scope | WARNING |
| Stale lock | >300s (5dk) | WARNING |
| Deadlock | Kahn's algorithm (döngüsel bağımlılık) | CRITICAL |
| Pattern tespiti | İhlal gruplama + PATTERNS.md | INFO |

**Dashboard Güncellemesi:**
- Her taramada `.dashboard` dosyası üzerine yazılır (append değil)
- Agent durumları, progress, alert'ler birleştirilir
- Maksimum 50 alert tutulur

---

## 8. BELLEK SİSTEMİ

### 3 Katman

| Katman | Dosyalar | Max Satır | Süre | Açıklama |
|--------|---------|-----------|------|----------|
| **Kısa Vadeli** | .tasks/*.json, .hb, .result, .plan, .log | — | Sprint süresi | Aktif sprint verileri, sprint sonunda silinir |
| **Orta Vadeli** | .brain/RETRO.md, .brain/DEBT.md, .brain/PATTERNS.md | 60/∞/80 | Birkaç sprint | Sprint retrospektifi (üzerine yazılır), borç (decay ile yönetilir), pattern'lar |
| **Uzun Vadeli** | .brain/MEMORY.md, .brain/DECISIONS.md, .brain/sprints/ | 100/∞/50 per file | Proje ömrü | Kümülatif öğrenmeler, mimari kararlar, sprint log'ları |

### Dosya İçerikleri

| Dosya | Format | İçerik |
|-------|--------|--------|
| `.brain/MEMORY.md` | Markdown | Sprint öğrenmeleri: pattern'lar, kararlar, teknik notlar. Max 100 satır, header korunarak kırpılır |
| `.brain/RETRO.md` | Markdown | Son sprint retrospektifi: metrikler, önceki sprint karşılaştırması, sonuçlar. Max 60 satır, her sprint üzerine yazılır |
| `.brain/DEBT.md` | Pipe-delimited tablo | Teknik borç: ID, açıklama, kaynak task/sprint, öncelik (NORMAL/HIGH/CRITICAL), sprintsOpen, resolved durumu |
| `.brain/PATTERNS.md` | JSON array | `PatternEntry[]`: pattern adı, occurrence sayısı, ilk/son tespit sprint'i, çözüldü mü |
| `.brain/DECISIONS.md` | Markdown | Mimari karar kayıtları (ADR formatı) |
| `.brain/sprints/sprint-NNN.md` | Markdown | Sprint log: görevler, sonuçlar, metrikler. Max 50 satır per dosya |

### Bellek Bütçesi

```
.brain/ toplam: max 600 satır (BRAIN_TOTAL_LINE_BUDGET)
├── MEMORY.md: max 200 satır
├── RETRO.md: max 100 satır
├── PATTERNS.md: max 80 satır
├── DEBT.md: bütçeden hariç (ayrı yönetilir)
├── DECISIONS.md: bütçeden hariç
└── sprints/: bütçeden hariç (80 satır per dosya)
```

### Decay Mekanizması

`runDecay()` (`src/orchestra/debt-manager.ts`) sprint sonunda çalışır:

1. **Resolved debt temizliği:** `shouldRemoveResolvedDebt()` — çözülmüş + 3 sprint geçmiş → sil, çözülmüş + <3 sprint → tut
2. **Memory kırpma:** `trimMemoryWithHeader()` — ilk 10 satır (header) korunur, ortadan kırpılır, son bölüm tutulur
3. **Debt eskalasyonu:** `escalateDebt()` — 2 sprint açık: NORMAL→HIGH, 3 sprint açık: NORMAL→CRITICAL

**Decay Tetikleme:**
- Sprint sonunda otomatik (DECAY fazı)
- `deckent cleanup --decay` ile manuel
- `force=true` ile bütçe altında bile çalıştırılabilir

---

## 9. PLANLAMA SİSTEMİ

### 3 Planlama Modu

| Mod | Nasıl Çalışır | Ne Zaman Kullanılır |
|-----|--------------|---------------------|
| **ai** | Claude CLI'a prompt gönderir, Zod schema ile doğrular | Karmaşık, multi-module sprint'ler |
| **structured** | DIRECTIVES.md'yi `## Görev N:` / `## Task N:` regex ile parse eder | Basit, önceden tanımlanmış görevler |
| **auto** (varsayılan) | Önce AI dener, başarısız olursa structured'a düşer | Genel kullanım |

### AI Planner Detay

**Dosya:** `src/orchestra/planner.ts` (156 satır)

```
buildPlanPrompt() → callBrainPlanner() → parsePlannerResponse()
```

- **Prompt dili:** Türkçe
- **Model:** Config'deki brain_model (varsayılan: opus)
- **Timeout:** 60 saniye
- **Doğrulama:** Zod `PlannerResultSchema` — min 1 task, her task'ta title/description/model/effort/priority/scope/goNogo
- **Fallback:** AI boş/hatalı dönerse → `plannerResult = null` → structured planner'a düş
- **Post-validation:** AI'ın döndürdüğü task sayısı directive'deki görev sayısıyla karşılaştırılır, eksikse structured'a düşülür

### Model Skor Sistemi

**Dosya:** `src/orchestra/model-selector.ts` (168 satır)

`calculateModelScore(title, description, scope)`:

| Kriter | Puan |
|--------|------|
| 2+ dizin scope | +3 |
| Mimari anahtar kelimeler (refactor, migration, cross-cutting) | +2 |
| 10+ dosya scope | +3 |
| 5-9 dosya scope | +2 |
| 2-4 dosya scope | +1 |
| Sadece docs/config | -2 |
| Tek dizin | -1 |
| Sadece test | -1 |

**Model Atama:**
- Skor >= 4 → **opus** (karmaşık mimari)
- Skor <= -1 → **haiku** (trivial)
- Diğer → **sonnet** (standart)

### Effort & Priority

**Effort:** low / normal / high — worker'ın tahmini çalışma süresi
**Priority:** CRITICAL / HIGH / NORMAL / LOW — sıralama ve kaynak atama

**CRITICAL debt → Otomatik öncelik fix task'ı:** `planSprint()` CRITICAL borçları tespit eder ve sprint planına fix task olarak ekler.

---

## 10. SPRİNT YAŞAM DÖNGÜSÜ

### 8 Faz

```
┌─ 1. PLAN ─────────────────────────────────────────────────┐
│  readContext() → checkUsage() → adjustSprintSize()        │
│  → planSprint() (AI/structured) → task JSON'lar yazılır   │
└───────────────────────────────────────────────────────────┘
         │
┌─ 2. SPAWN ────────────────────────────────────────────────┐
│  spawnWorkers() — max_workers kadar tmux window aç        │
│  startScanLoop() — auditor 30s döngü başlat               │
│  Kalan görevler kuyruğa alınır                            │
└───────────────────────────────────────────────────────────┘
         │
┌─ 3. EXECUTE ──────────────────────────────────────────────┐
│  waitForResults() — fs.watch ile .result izle             │
│  Bir worker bitince kuyruktan sonraki task spawn edilir    │
│  Worker'lar: claim → lock → kod yaz → test → result yaz   │
└───────────────────────────────────────────────────────────┘
         │
┌─ 4. EVALUATE ─────────────────────────────────────────────┐
│  evaluateResult() per task:                               │
│  • DONE — başarılı, lock serbest, status DONE             │
│  • GO_WITH_TECH_DEBT — DONE + debt entry oluştur          │
│  • NO_GO — status NO_GO + fix task oluştur                │
│  resolveDebt() — tamamlanan task'ların borçlarını çöz     │
└───────────────────────────────────────────────────────────┘
         │
┌─ 5. FIX ──────────────────────────────────────────────────┐
│  handleCrossDependencies() — NO_GO bağımlılık analizi     │
│  Fix task'lar spawn edilir, sonuçları beklenir             │
│  Retry: max 2 deneme, backoff 0→30s                       │
└───────────────────────────────────────────────────────────┘
         │
┌─ 6. RETRO ────────────────────────────────────────────────┐
│  calculateMetrics() → writeRetrospective() → RETRO.md     │
│  writeSprintLog() → .brain/sprints/sprint-NNN.md          │
│  updateProjectDocs() → CHANGELOG, README, HEALTH          │
│  MEMORY.md güncelle                                       │
└───────────────────────────────────────────────────────────┘
         │
┌─ 7. DECAY ────────────────────────────────────────────────┐
│  runDecay() — resolved debt temizliği (3 sprint kuralı)   │
│  Memory kırpma, pattern temizliği                         │
│  Bütçe kontrolü: .brain/ < 600 satır                      │
└───────────────────────────────────────────────────────────┘
         │
┌─ 8. CLEANUP ──────────────────────────────────────────────┐
│  cleanup() — worker'ları öldür, lock'ları serbest bırak   │
│  .tasks/ dosyalarını sil (.json, .plan, .hb, .result,     │
│  .paused, .log) → dashboard COMPLETE                      │
└───────────────────────────────────────────────────────────┘
```

### Faz Detayları

| Faz | SprintPhase Enum | Auditor Aktif | Worker Aktif |
|-----|-----------------|---------------|--------------|
| PLAN | PLAN | Hayır | Hayır |
| SPAWN | SPAWN | Başlıyor | Başlıyor |
| EXECUTE | EXECUTE | Evet (30s döngü) | Evet |
| EVALUATE | EVALUATE | Evet | Hayır |
| FIX | FIX (opsiyonel) | Evet | Evet (fix worker'lar) |
| RETRO | RETRO | Hayır | Hayır |
| DECAY | DECAY | Hayır | Hayır |
| CLEANUP | COMPLETE | Hayır | Hayır |

### Task Queue (Wave Sistemi)

```
12 görevli sprint, max_workers=8:
  Dalga 1: 8 worker spawn (paralel)
  Kuyruk: 4 görev bekliyor
  Worker 1 biter → Kuyruktan görev 9 spawn
  Worker 3 biter → Kuyruktan görev 10 spawn
  Worker 5 biter → Kuyruktan görev 11 spawn
  Worker 2 biter → Kuyruktan görev 12 spawn
```

---

## 11. PLUGİN SİSTEMİ

**Dosya:** `src/core/plugin.ts` (364 satır) | **Konum:** `.deckent/plugins/`

### Plugin v2 Yapısı

```
.deckent/plugins/
└── my-plugin/
    ├── manifest.json    ← Plugin tanımı (zorunlu)
    ├── SKILL.md         ← Ajan talimatları
    └── README.md        ← Kullanım dokümanı
```

### manifest.json Şeması

```json
{
  "name": "my-plugin",           // zorunlu
  "version": "1.0.0",           // zorunlu
  "description": "Açıklama",    // zorunlu
  "entrypoint": "SKILL.md",     // zorunlu
  "triggers": ["keyword"],      // opsiyonel
  "permissions": ["src/"],      // opsiyonel
  "hooks": {                    // opsiyonel
    "beforeSprint": true,
    "afterSprint": true
  },
  "model": "sonnet",            // opsiyonel
  "enabled": true,              // opsiyonel
  "dependencies": []            // opsiyonel
}
```

### Plugin Yönetim Fonksiyonları

| Fonksiyon | Açıklama |
|-----------|----------|
| `loadPlugin(dir)` | manifest.json oku, doğrula, Plugin döndür |
| `listPlugins(dir)` | Tüm enabled plugin'leri listele |
| `scanPlugins(root)` | .deckent/plugins/ tara |
| `enablePlugin(name, dir)` | manifest'te enabled=true yap |
| `disablePlugin(name, dir)` | manifest'te enabled=false yap |
| `installPlugin(source, dir)` | Lokal path veya git URL'den yükle (duplikat engeli) |
| `removePlugin(name, dir)` | Plugin dizinini sil (sistem plugin kontrolü) |
| `createPlugin(name, dir)` | Scaffold oluştur: manifest.json + SKILL.md + README.md |
| `validateManifest(raw, dir)` | Zorunlu alanları kontrol et |

### Plugin Hook'ları

**Dosya:** `src/core/plugin-hooks.ts` (102 satır)

| Hook | Tetiklenme Zamanı | Context |
|------|-------------------|---------|
| `beforeSprint` | Sprint planlamasından önce | sprintId, tasks[], config, projectRoot |
| `afterSprint` | Sprint tamamlandıktan sonra | sprint, projectRoot |
| `beforeTask` | Task yürütmeden önce | task, projectRoot |
| `afterTask` | Task tamamlandıktan sonra | task, result, projectRoot |

Hook hataları **non-fatal**: hata loglanır ama sprint/task devam eder.

---

## 12. GÜVENLİK MODELİ

### 4 Seviyeli Güvenlik

| Seviye | Mekanizma | Uygulama Noktası |
|--------|-----------|-----------------|
| **1. Scope Zorlama** | Task'a atanan dizin/dosya sınırları | Worker: `isWithinScope()`, Auditor: `checkBoundaryViolations()` |
| **2. Dosya Kilitleme** | Atomik lock dosyaları (O_EXCL) | Worker: `acquireLock()`, `.locks/` dizini |
| **3. Kullanım Eşikleri** | 5 saatlik ve haftalık API limitleri | Brain: `checkUsage()`, `checkAndAutoPause()` |
| **4. HTTP Auth** | Opsiyonel Bearer token | API sunucusu: POST endpoint'leri |

### Scope Kuralları

```json
{
  "scope": {
    "directories": ["src/cli/", "tests/cli/"],
    "filesRead": ["src/core/types.ts", "DIRECTIVES.md"],
    "filesWrite": ["src/cli/commands/new-cmd.ts"]
  }
}
```

- Worker **yalnızca** `directories` ve `filesWrite` içine yazabilir
- Worker `filesRead` içindeki dosyaları okuyabilir
- Auditor `git diff --stat` ile her 30s'de kontrol eder
- İhlal → WARNING alert + PATTERNS.md kaydı

### Lock Mekanizması

```json
// .locks/{filepath-with-__-separators}.lock
{
  "filePath": "src/cli/commands/init.ts",
  "ownerWorkerId": "worker-001-001",
  "acquiredAt": "2026-03-20T...",
  "taskId": "026-001"
}
```

- **Atomik oluşturma:** `O_EXCL` flag ile race condition önlenir
- **İdempotent:** Aynı worker aynı lock'u tekrar alabilir
- **Stale tespiti:** >300s (5dk) olan lock'lar Auditor tarafından uyarılır
- **Cleanup:** Sprint sonunda tüm lock'lar serbest bırakılır

### Kullanım Eşikleri (Subscription Bazlı)

| Plan | 5 Saatlik | Haftalık | Max Workers |
|------|-----------|----------|-------------|
| max_plan | %80 | %60 | 8 |
| max5x_plan | %70 | %50 | 5 |
| pro_plan | %60 | %40 | 3 |
| api | %100 | %100 | 10 |

Eşik aşılırsa: sprint otomatik duraklatılır (`checkAndAutoPause`), worker sayısı azaltılır, model downgrade edilir.

### localhost Binding

HTTP API **yalnızca 127.0.0.1'e** bağlanır — dış ağdan erişilemez. CORS yalnızca localhost origin'lerine izin verir.

---

## 13. YAPILAMAYAN / EKSİK OLANLAR

### Stub Komutlar (Henuz Uygulanmamis)

| Ozellik | Dosya | Durum | Alternatif |
|---------|-------|-------|------------|
| `deckent plugin install` | src/cli/commands/plugin.ts | Stub | Manuel kurulum |

### Sprint 28 ile Tam Uygulama Gecen Komutlar

| Ozellik | Dosya | Durum | Aciklama |
|---------|-------|-------|----------|
| `deckent onboard` | src/cli/commands/onboard.ts | Tam | Interaktif wizard: Claude tespit, sistem profil, config onerisi |
| `deckent upgrade` | src/cli/commands/upgrade.ts | Tam | npm view ile versiyon kontrolu, --check flag |
| `deckent usage` | src/cli/commands/usage.ts | Tam | UsageTracker entegrasyonu, --json, --sprint filtre |

### Eksik / Kısıtlı Özellikler

| Özellik | Durum | Açıklama |
|---------|-------|----------|
| **Sandbox Mode** | Temel uygulama var | `start --sandbox-mode` SandboxSpawnBackend kullanir: bellek limiti, scope zorlama, ag kisitlamasi |
| **Usage Tracking** | Tam | UsageTracker: model/token/call sayimi, sprint bazli ve kumulatif raporlama (.deckent/usage/) |
| **Remote Plugin Install** | Kisitli | Git URL destegi var ama npm registry destegi yok |
| **Multi-Project** | Yok | Tek proje dizininde calisir, cross-project orkestrasyon yok |
| **API Key Dogrulamasi** | Tam | Credentials yonetimi: ~/.deckent/credentials/ ile guvenli key saklama (0600 izin) |
| **Worker Iletisimi** | IPC + dosya | Worker IPC: process.send tabanli MessageChannel (subprocess backend). Dosya tabanli heartbeat fallback olarak korunuyor |
| **Test Coverage Raporlama** | Tam | CoverageValidator: vitest JSON ciktisi parse, %5 esik ile dogrulama, evaluateResult entegrasyonu |
| **Rollback** | Tam | Git safety point (branch) sprint oncesi, basarisiz sprint'te otomatik rollback teklifi |
| **Subprocess Backend** | Tam | tmux olmadan child_process.spawn ile worker calistirma. SpawnBackendFactory: config.spawn_backend'e gore secim |
| **Zero-Config Mode** | Tam | `deckent start "aciklama"` ile tek satirda sprint baslat, gecici DIRECTIVES.md olusturulur |
| **Provider Abstraction** | Tam | ProviderAdapter + ProviderRegistry: Brain'i spawn mekanizmasindan bagimsizlastirir |
| **Global Config** | Tam | ~/.deckent/config.json: global ayarlar, proje config ile merge (proje oncelikli) |

### Sprint 28 Yeni Ozellikler (npm Publish Prep)

| Ozellik | Durum | Aciklama |
|---------|-------|----------|
| **npm Publish Pipeline** | Tam | .npmignore, prepublish validation, build-verify, pack-test, publish scripts |
| **Error UX** | Tam | DeckentError + ErrorRegistry, 10 hata kodu, platform bazli cozum onerileri |
| **Interactive Onboard Wizard** | Tam | Claude tespit, sistem profil, config onerisi |
| **Telemetry Altyapisi** | Tam | Opt-in TelemetryCollector, PII temizleme, varsayilan kapali |
| **TUI Wizard Framework** | Tam | WizardStep: select/input/confirm, non-interactive mode destegi |
| **Enhanced --version** | Tam | Node.js, OS, tmux, claude durum bilgisi + --version-json |

### Bilinen Teknik Borclar (Sprint 025-026)

Son iki sprint'te çeşitli item'lar `GO_WITH_TECH_DEBT` olarak kapatıldı:
- package.json `files` field düzeltmesi
- CODEOWNERS, dependabot.yml, FUNDING.yml
- GitHub Actions release workflow
- readJsonSafe import migration (brain.ts, debt-manager.ts, auditor.ts)
- Bazı test suite'leri tamamlama

---

## 14. METRİKLER

### Kod Tabanı

| Metrik | Değer |
|--------|-------|
| Toplam .ts dosya | 689 |
| Toplam kaynak kodu | ~96.428 satır |
| Test sayisi | 8.555+ (tumu geciyor) |
| Test dosyasi | 265 |
| Test süresi | ~38s |

### Kritik Modül Boyutları

| Modül | Dosya | Satır | Export Sayısı |
|-------|-------|-------|---------------|
| Brain | src/orchestra/brain.ts | 975 | 15 |
| Auditor | src/monitor/auditor.ts | 557 | 14 |
| Types | src/core/types.ts | 470 | 30+ (enum/interface/type) |
| Plugin | src/core/plugin.ts | 364 | 9 |
| Worker | src/agents/worker.ts | 350 | 14 |
| Config | src/core/config.ts | 341 | 4 |
| Debt Manager | src/orchestra/debt-manager.ts | 300 | 6 |
| Sprint Reporter | src/orchestra/sprint-reporter.ts | 287 | 7 |
| Tmux | src/orchestra/tmux.ts | 269 | 10 |
| Utils | src/core/utils.ts | 257 | 9 |
| Task Builder | src/orchestra/task-builder.ts | 219 | 4 |
| Model Selector | src/orchestra/model-selector.ts | 168 | 6 |
| Planner | src/orchestra/planner.ts | 156 | 3 |

### Arayüz Yüzeyi

| Arayüz | Adet |
|--------|------|
| CLI komutlari | 28 (27 tam, 1 stub) |
| MCP tool'ları | 10 |
| MCP resource'ları | 5 |
| HTTP GET endpoint'leri | 11 |
| HTTP POST endpoint'leri | 5 |
| Web dashboard sayfaları | 4 |
| Plugin hook'ları | 4 |
| Doc updater'lar | 4 |

### Sprint Geçmişi (Test Trendi)

```
Sprint 18: 1.027 test
Sprint 19: 1.123 test (+96)
Sprint 20: 1.260 test (+137)
Sprint 21-22: 1.402 test (+142)
Sprint 23-24 (Mega): 3.150 test (+1.748)
Sprint 25-26: 3.442 test (+292)
Sprint 27-30: 3.609 test (+167) — provider abstraction, subprocess backend, usage tracker, rollback, worker IPC, zero-config
Sprint 28 (npm publish): 4.100+ test (+491) — error registry, TUI wizard, onboard/upgrade real, telemetry, publish pipeline
Sprint 29 (Agent Pool): 5.300+ test (+314) — agent havuzu, 8 yerlesik agent, agent selector, multi-agent pipeline, shared context
Sprint 30 (Skill System): 5.700+ test (+435) — skill sistemi, 10 yerlesik skill, stack detection, prompt enjeksiyonu, skill selector, registry, CLI komutlari
Sprint 31 (Brain Decision Engine): 6.272+ test (+572) — karar motoru, ogrenme dongusu, paralel pipeline, paylasimli bellek, catisma cozumleme, adaptive agent
Sprint 32 (UX Polish): 6.811+ test (+539) — ilerleme cubugu, ETA, bildirimler (terminal/webhook/Discord/Slack), interaktif inceleme, tema, cikti modlari
Sprint 33 (Integration + Marketplace + Analytics): 7.370+ test (+559) — entegrasyon testleri (3 proje tipi), skill marketplace, adaptive agent ileri (kayma/emeklilik/soy agaci), analytics verisi, performans onbellekleme, guvenlik (sandbox/izin korumasi)
Sprint 34-037 (Beta Cleanup + Mimari Refactor): 8.000+ test (+630) — brain.ts split, spawn-backend tasinmasi, types.ts parcalanmasi, non-null assertion refactor, barrel export temizligi, auditor queue fix, PromptAnalytics birlestirme
Sprint 38 (Multi-Provider): 8.555+ test (+555) — Claude/Codex/Gemini provider destegi, provider-aware model secimi, fallback zinciri, mixed sprint, 8 model destegi
```

### Konfigürasyon Modları

| Mod | Brain Model | Default Model | Haiku | Max Workers | Bütçe |
|-----|------------|---------------|-------|-------------|-------|
| max_plan | opus | opus | Evet | 8 | — |
| max5x_plan | sonnet | opus | Evet | 5 | — |
| pro_plan | sonnet | sonnet | Hayır | 3 | — |
| api | opus | sonnet | Evet | 10 | $5/sprint |

---

### Multi-Provider Desteği (Sprint 038)

| Özellik | Durum | Açıklama |
|---------|-------|----------|
| **Multi-provider** | Tam | Claude (Anthropic), Codex (OpenAI), Gemini (Google) — 3 provider |
| **Provider-aware model secimi** | Tam | Görev karmaşıklığı ve kullanıma göre model+provider çifti otomatik seçimi |
| **Provider fallback zinciri** | Tam | Kota aşımı veya hata → bir sonraki provider'a otomatik geçiş |
| **Mixed sprint** | Tam | Aynı sprint'te birden fazla provider kullanımı, görev başına provider atama |
| **Desteklenen modeller** | 8 model | opus, sonnet, haiku | gpt-4.1, o3, o4-mini | gemini-2.5-pro, gemini-2.5-flash |
| **Maliyet optimizasyonu** | Tam | Ucuz model/provider tercih edilir, karmaşık görevlerde güçlü model seçilir |
| **Platform matris** | Tam | macOS, Linux, WSL2 — tüm platformlarda çok-provider konfigürasyonu doğrulandı |

---

*Bu dokuman, deckent code base'inin tam taramasiyla olusturulmustur. Kaynak: 700+ TypeScript dosyasi, ~96.428 satir kod, 8.555+ test, 38 sprint.*
