# DECKENT ANA PLAN
## Yapay Zeka Ajan Orkestrasyon Sistemi — Tam Uygulama Referansı
### Versiyon 2.1 — Mart 2026 — Verhex

---

# İÇİNDEKİLER

1. Ürün Kimliği ve Vizyon
2. Mimari Genel Bakış
3. Yerel CLI ve Kurulum
4. Çalışma Alanı Yapısı
5. Ajan Sistemi (Brain, Auditor, Worker)
6. Bellek Mimarisi (3 Katman)
7. Sprint Yaşam Döngüsü ve Orkestrasyon
8. GO / NO-GO / Teknik Borç Protokolü
9. Kullanım-Duyarlı Planlama
10. Dinamik Terminal Yönetimi (tmux)
11. Eklenti ve Yetenek Sistemi
12. Kullanıcı Arayüzü Yol Haritası (Terminal → Web → VSCode)
13. Çoklu Plan Uyumluluğu
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

---

# 1. ÜRÜN KİMLİĞİ VE VİZYON

**Ad:** Deckent (Deck + Agent)
**Domain:** deckent.agency
**Slogan:** "Yapay zeka geliştirme ekibiniz, orkestre edilmiş."
**Yazar:** Alperen @ Verhex

**Deckent Nedir:**
Ajan-agnostik bir yapay zeka orkestrasyon sistemi. Hedeflerinizi doğal dille tanımlarsınız — Claude Code konuşmasında veya DIRECTIVES.md ile. Deckent planlar, görev atar, izler ve geliştirme işlerini paralel çalışan birden fazla yapay zeka ajanıyla tamamlar. Sistem her sprint'ten öğrenir ve zamanla gelişir.

**Deckent Ne Değildir:**
- Başka bir ChatGPT sarmalayıcı değil
- Basit bir görev çalıştırıcı değil
- Claude ile sınırlı değil (çoklu sağlayıcı: Claude, OpenAI Codex, Gemini — Sprint 038'den beri aktif)

**Temel İlkeler:**
1. Yerel-öncelikli — CLI aracı olarak kurulur, MCP ile Claude Code'a entegre olur
2. Kendini geliştiren — hatalardan öğrenir, planları iyileştirir, kalıplara uyum sağlar
3. Gözlemlenebilir — her ajanın eylemi gerçek zamanlı görünür
4. Kullanım-duyarlı — plan limitlerini asla aşmaz, sprint'leri asla yarım bırakmaz
5. Plan-uyumlu — Pro ($20), Max ($100-200) veya API ile çalışır
6. Sıfır-sürtünme — doğal dil girdi, orkestre edilmiş sprint çıktı
7. Açık kaynak — topluluk-destekli, eklentiler/yeteneklerle genişletilebilir

**USP (Benzersiz Satış Noktası):**
Sprint + öğrenme döngüsü. Deckent sadece görevleri yürütmez — sprint'ler planlar, sonuçları GO/NO-GO protokolüyle değerlendirir, teknik borcu takip eder, retrospektif yapar ve öğrendiklerini sonraki sprint'e aktarır. Her sprint sistemi daha akıllı yapar.

**Aşamalı Yol Haritası:**
| Aşama | Odak | Hedef Kitle | Sprint Aralığı |
|-------|------|-------------|----------------|
| 1 | Claude native (CLI + MCP) | Solo geliştiriciler | Sprint 1-8 |
| 2 | Sağlayıcı soyutlama katmanı | Erken benimseyenler | Sprint 9-12 |
| 3 | Çoklu sağlayıcı (OpenAI, Gemini) | Küçük takımlar | Sprint 13+ |
| 4 | Platform (Web UI, VSCode, API) | Kurumsal | Sprint 20+ |

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
│  10 Araç + 5 Kaynak                                 │
│  init | set_directives | plan | start | analyze ... │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 ÇEKİRDEK MOTOR                       │
│  brain.ts | planner.ts | auditor.ts | worker.ts     │
│  analyzer.ts | tmux.ts | server.ts (HTTP API)       │
└──────────┬───────────────────────────┬──────────────┘
           │                           │
┌──────────▼──────────┐  ┌────────────▼──────────────┐
│  BRAIN + PLANNER     │  │        AUDITOR             │
│  Planlar (AI/yapısal)│  │  Brain içinde tarama döng. │
│  değerlendir, öğren  │  │  runSprint içinde (30sn)   │
│  Model: opus/sonnet  │  │  (tmux yok)                │
└──────────┬──────────┘  └────────────┬──────────────┘
           │                           │
┌──────────▼──────────────────────────▼──────────────┐
│              WORKER HAVUZU (dinamik)                  │
│  tmux pencereleri — Brain tarafından talebe göre     │
│  Her worker: planla → kodla → test et → belgele      │
│  Model: görev başına (opus/sonnet/haiku)             │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│              BELLEK SİSTEMİ (.brain/)                 │
│  Katman 1: MEMORY.md (her zaman yüklü, ~100 satır) │
│  Katman 2: sprint logları (sprint başına, otomatik)  │
│  Katman 3: derin bilgi (aranabilir arşiv)           │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│          HTTP API + WEB DASHBOARD                    │
│  src/api/server.ts — 16 uç nokta + SSE             │
│  src/dashboard/ — React+Vite+Tailwind (4 sayfa)     │
│  `deckent web` → localhost:3100                     │
└─────────────────────────────────────────────────────┘
```

**Kimlik Doğrulama Zinciri:**
```
Claude Code → MCP stdio (yerel süreç, ek auth yok)
  → Çekirdek Motor → tmux → claude -p (Claude Code oturumunu miras alır)
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
deckent cleanup           Sprint dosyalarını arşivle, worker'ları öldür
deckent doctor            Sistem sağlığını kontrol et (tmux, claude, git, node)
deckent config            Yapılandırmayı göster/düzenle
deckent config set <k> <v> Yapılandırma değeri ayarla
deckent usage             Mevcut plan kullanımını göster
deckent history           Sprint geçmişini ve metrikleri göster
deckent analyze           Proje yığın/boyut/metodoloji analizi
deckent archive-debt      Çözülmüş teknik borcu arşivle
deckent dashboard         Terminal TUI dashboard (zengin mod)
deckent serve             HTTP API sunucusu (SSE)
deckent web               Web dashboard + API sunucusu (localhost:3100)
deckent plugin install <n> Yetenek/eklenti kur
deckent plugin list       Kurulu eklentileri listele
deckent upgrade           Kendini güncelle
deckent mcp               MCP sunucuyu başlat (Claude Code için stdio transport)
deckent sync             Adaptör dosyalarını DECKENT.md referansıyla senkronize et
deckent watch            Canlı tmux bölünmüş görünüm: dashboard + worker panelleri
```

## 3.3 Sistem Gereksinimleri

```
Gerekli:
  Node.js ≥ 18 (22 önerilir)
  git
  tmux (ilk çalıştırmada yoksa otomatik kurulur)
  Claude Code CLI (npm install -g @anthropic-ai/claude-code)
  Claude aboneliği (Pro, Max veya API anahtarı)

Desteklenen İşletim Sistemleri:
  macOS (Intel + Apple Silicon)
  Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch)
  Windows (WSL2 ile — yerel Windows planlanıyor)
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
│   └── workspace/                     # Ajan çalışma alanı
│
├── .brain/                            # Bellek sistemi (Brain + Auditor)
│   ├── MEMORY.md                      # Katman 1: her zaman yüklü (~100 satır)
│   ├── DECISIONS.md                   # Mimari Karar Kayıtları
│   ├── DEBT.md                        # Teknik borç logu
│   ├── PATTERNS.md                    # Auditor bulguları
│   ├── RETRO.md                       # Son sprint retrospektifi
│   ├── sprints/                       # Katman 2: sprint başına loglar
│   └── archive/                       # Katman 3: derin bilgi
│
├── .tasks/                            # Geçici görev dosyaları (otomatik temizlenir)
├── .locks/                            # Dosya kilitleri (çalışma zamanı)
├── .dashboard                         # Canlı durum (Auditor tarafından)
│
├── .claude/                           # Claude Code yerel yapılandırma
│   ├── settings.json                  # MCP sunucu kaydı dahil
│   └── rules/                         # Yol kapsamlı kurallar
│
├── src/                               # Deckent kaynak kodu
│   ├── core/                         # Tipler, yapılandırma, sabitler, yardımcılar
│   │   └── analyzer.ts             # Proje yığın/boyut analizi
│   ├── orchestra/                    # Brain + Planner + tmux orkestrasyon
│   │   ├── brain.ts                 # Sprint yaşam döngüsü orkestratörü
│   │   ├── planner.ts              # AI görev planlaması (Zod doğrulamalı)
│   │   └── tmux.ts                  # tmux oturum yönetimi
│   ├── agents/                       # Worker yaşam döngüsü
│   ├── monitor/                      # Auditor izleme
│   ├── api/                          # HTTP API + SSE
│   │   ├── server.ts               # 16 uç nokta + SSE akışı
│   │   └── watcher.ts              # Dashboard dosya izleyici
│   ├── cli/                          # CLI komutları (commander.js, 21 dosya)
│   ├── mcp/                          # MCP sunucu entegrasyonu
│   │   ├── server.ts                # Giriş noktası (McpServer + stdio)
│   │   ├── tools/                   # 10 araç işleyicisi
│   │   └── resources/               # 5 kaynak işleyicisi
│   └── dashboard/                    # Web Dashboard (React+Vite+Tailwind)
│       └── src/                     # 4 sayfa, 14 UI bileşeni, SSE
├── tests/                             # Birim + entegrasyon testleri
└── package.json
```

---

# 5-17. AJAN SİSTEMİ VE ÇEKİRDEK MODÜLLER

> Bölüm 5-17 İngilizce Blueprint ile aynıdır. Teknik referans için DECKENT-MASTER-BLUEPRINT.md'ye bakınız.

**Önemli v2.1 Değişiklikleri:**
- **Auditor artık tmux'ta ayrı çalışmıyor.** Brain'in `runSprint` fonksiyonu içinde `startScanLoop()` ile süreç-içi çalışıyor (Faz 2.5). Sprint bittiğinde `clearInterval` ile durduruluyor (Faz 3.5).
- **Planner modülü eklendi** (`src/orchestra/planner.ts`): AI ile görev planlaması, Zod doğrulaması. Sadece `core/` modülünden import eder (ADR-008).
- **`brain_planning` yapılandırması:** `'ai'` | `'structured'` | `'auto'` (varsayılan: auto). AI önce dener, başarısız olursa yapısal ayrıştırmaya düşer.
- **Terminal Dashboard:** Tamamlandı (Sprint 10) — `deckent status` ve `deckent dashboard`
- **Web Dashboard:** Tamamlandı (Sprint 11) — React+Vite+Tailwind, 4 sayfa, shadcn/ui, SSE
- **HTTP API:** Tamamlandı (Sprint 10) — 16 uç nokta + SSE, `deckent serve` / `deckent web`
- **Worker heartbeat:** `buildWorkerPrompt` artık `.tasks/task-{id}.hb` dosyası oluşturma talimatı içeriyor.
- **DECKENT.md adaptör deseni** (Sprint 15): DECKENT.md tek gerçek kaynak. CLAUDE.md ve AGENTS.md artık symlink değil, `ensureDeckentImport()` ile `@DECKENT.md` enjekte ediliyor (katkısal, asla yıkıcı değil).
- **`deckent sync` komutu** (Sprint 15): Adaptör dosyalarını (CLAUDE.md, AGENTS.md) DECKENT.md referansıyla senkronize eder.

---

# 18. DOSYA REFERANSI

Her dosya, amacı, yazarı ve okuyucusu:

| Dosya | Amaç | Yazan | Okuyan | Yaşam Döngüsü |
|-------|------|-------|--------|----------------|
| AGENTS.md | @DECKENT.md adaptörü | deckent init (ensureDeckentImport) | Tüm ajanlar | Kalıcı |
| CLAUDE.md | @DECKENT.md adaptörü | ensureDeckentImport() | Claude Code | Kalıcı |
| DECKENT.md | Tek gerçek kaynak (ajan yapılandırması) | deckent init (writeIfNotExists) | Tüm ajanlar (@import ile) | Kalıcı |
| DIRECTIVES.md | Komutlarınız | Siz / MCP | Brain | Siz değiştirene kadar |
| .deckent/config.json | Çalışma zamanı yapılandırması | deckent init/config | Hepsi | Kalıcı |
| .brain/MEMORY.md | Öğrenilen kalıplar | Brain | Hepsi (@import) | Zayıflama: 3 sprint |
| .brain/DECISIONS.md | Mimari kararlar | Brain | Brain, Auditor | Kalıcı |
| .brain/DEBT.md | Teknik borç | Brain | Brain | Çözülene kadar |
| .brain/PATTERNS.md | Auditor bulguları | Auditor | Brain | Zayıflama: 5 sprint |
| .brain/RETRO.md | Son sprint retro | Brain | Brain | Üzerine yazılır |
| .brain/sprints/*.md | Sprint logları | Brain | Brain | Otomatik arşiv |
| .tasks/task-*.json | Görev tanımları | Brain | Worker'lar | Sprint sonrası silinir |
| .tasks/task-*.result | Sonuçlar | Worker'lar | Brain | Sprint sonrası silinir |
| .tasks/task-*.log | Worker terminal çıktısı | tmux pipe-pane | Brain, API, siz | Sprint sonrası silinir |
| .dashboard | Canlı durum | Auditor | Siz, UI | Üzerine yazılır |
| .claude/rules/*.md | Ajan kuralları | deckent init | Claude Code | Kalıcı |
| .claude/settings.json | MCP sunucu kaydı | deckent init | Claude Code | Kalıcı |
| src/orchestra/planner.ts | AI görev planlaması (Zod) | Geliştirici | Brain | Kalıcı |
| src/core/analyzer.ts | Proje yığın/boyut analizi | Geliştirici | MCP, CLI | Kalıcı |
| src/api/server.ts | HTTP API (16 uç nokta + SSE) | Geliştirici | Web dashboard | Kalıcı |
| src/api/watcher.ts | Dashboard dosya izleyici | Geliştirici | API sunucu | Kalıcı |
| src/dashboard/ | Web Dashboard (React+Vite+Tailwind) | Geliştirici | Tarayıcı | Kalıcı |
| src/mcp/server.ts | MCP sunucu giriş noktası | Geliştirici | Claude Code | Kalıcı |
| src/mcp/tools/*.ts | MCP araç işleyicileri (10) | Geliştirici | MCP sunucu | Kalıcı |
| src/mcp/resources/*.ts | MCP kaynak işleyicileri (5) | Geliştirici | MCP sunucu | Kalıcı |
| .deckent/workspace/TOOLS.md | Ortam araçları/komutları | deckent init | Worker'lar | Kalıcı |
| .deckent/workspace/BOOT.md | Ajan başlatma sırası | deckent init | Tüm ajanlar | Kalıcı |
| .deckent/plugins/ | Kurulu eklentiler dizini | deckent init | Eklenti sistemi | Kalıcı |
| .deckent/i18n/*.json | i18n mesaj şablonları | deckent init | CLI | Kalıcı |

---

# 19. UYGULAMA GEÇMİŞİ

## Sprint 1: Çekirdek Motor (Mart 2026)

Dalga tabanlı uygulama, 5 dalga, tüm modüller inşa edildi ve test edildi:
- Dalga 1: Çekirdek tipler, yapılandırma, sabitler (src/core/)
- Dalga 2: tmux yöneticisi, auditor, worker (paralel)
- Dalga 3: Brain orkestratör (src/orchestra/brain.ts)
- Dalga 4: CLI iskeleti (commander.js ile 16 komut)
- Dalga 5: Birim + entegrasyon testleri

## Sprint 2-5: Yaşam Döngüsü Sağlamlaştırma

- Sprint 2: Asenkron geçiş (sleepSync → async sleep)
- Sprint 3: Semantik düzeltmeler (haiku_allowed, checkUsage regex)
- Sprint 4: Borç çözümleme yaşam döngüsü (resolveDebt, eski borç temizliği)
- Sprint 5: Zayıflama, doctor, start, dashboard, kapsam (644 test, %94.83)

## Sprint 6: İlk Dogfooding

Deckent ilk kez kendini çalıştırdı:
- deckent start ile README.md oluşturuldu
- Süre: 86 saniye, 1 görev TAMAMLANDI
- Uçtan uca orkestrasyon döngüsü kanıtlandı

## Sprint 7: MCP Sunucu Entegrasyonu

- 8 MCP aracı + 4 kaynak (stdio transport)
- Sıfır-sürtünme Claude Code entegrasyonu
- .claude/settings.json'a otomatik kayıt
- 24 yeni test, toplam 669, 0 regresyon

## Sprint 8: Dokümantasyon ve MCP Dogfooding

- CONTRIBUTING.md, tam API referansı (docs/reference/api.md)
- MCP dogfooding: Deckent'in kendi MCP araçlarıyla geliştirme
- 669 test, %95 kapsam

## Sprint 9: Analiz Aracı ve CI Pipeline

- 9. MCP aracı: `deckent_analyze_project` (proje yığın/boyut/metodoloji tespiti)
- GitHub Actions ile CI pipeline
- package.json'dan dinamik versiyon
- `deckent archive-debt` komutu
- Zenginleştirilmiş sprint geçmişi
- 720 test, %95 kapsam

## Sprint 10: HTTP API ve Terminal Dashboard

- HTTP API sunucusu (`src/api/server.ts`): 16 uç nokta + SSE akışı
- Terminal TUI dashboard (`deckent dashboard`)
- Sprint ID refaktörü (kod tabanında tutarlı format)
- `deckent serve` ve `deckent web` CLI komutları
- 799 test, %95 kapsam

## Sprint 11: Web Dashboard

- React + Vite + Tailwind web dashboard (`src/dashboard/`)
- 4 sayfa: Dashboard, Ayarlar, Geçmiş, Bellek
- shadcn/ui bileşen kütüphanesi (14 UI bileşeni)
- SSE ile gerçek zamanlı güncellemeler
- SprintChart (Recharts), DebtTable, NewSprintModal
- Karanlık/aydınlık tema, mobil uyumlu
- 852 test, %97 kapsam

## Sprint 12-13: Brain AI Planlaması ve Auditor Süreç-İçi

- Planner modülü (`src/orchestra/planner.ts`): Zod doğrulamalı AI görev planlaması
- `BrainPlanningMode`: 'ai' | 'structured' | 'auto' yapılandırması
- DRAFT görev durumu + `confirmDraftTasks()`
- Auditor tmux'tan süreç-içi tarama döngüsüne taşındı
- `writeScanToDashboard()` tarama sonuçlarını dashboard'a birleştir
- `buildWorkerPrompt` artık heartbeat dosyası oluşturma talimatı içeriyor
- `.deckent/` yapı eklemeleri: TOOLS.md, BOOT.md, plugins/, i18n/
- 938 test, %97.5 kapsam

## Sprint 14: Auditor Canlı Entegrasyon (devam ediyor)

- Auditor gerçek tarama döngüsü SPAWN ve EXECUTE fazları arasında çalışıyor
- `startScanLoop` / `clearInterval` yaşam döngüsü `runSprint` içinde
- Worker heartbeat prompt talimatları tamamlandı
- `.deckent/` yapı sonlandırması
- 938 test, %97.5 kapsam

## Sprint 15: Deckent Bağımsızlık + Self-Hosting

- DECKENT.md tek gerçek kaynak olarak belirlendi (AGENTS.md+CLAUDE.md symlink deseninin yerini aldı)
- `ensureDeckentImport()` paylaşımlı yardımcı (`src/core/utils.ts`): katkısal, asla yıkıcı değil
- Init artık CLAUDE.md'yi üzerine yazmıyor — `ensureDeckentImport()` kullanıyor
- Yapılandırma birleştirme: mevcut `.deckent/config.json` alanları korunuyor
- Blueprint kalitesinde kural şablonları: brain.md (13 kural), auditor.md (9 kural), worker-default.md (9 kural) frontmatter ile
- `deckent sync` CLI komutu + `deckent_sync` MCP aracı (10. araç)
- `deckent://config` MCP kaynağı (5. kaynak)
- Self-hosting: deckent-dev kendi `.deckent/` yapısını çalıştırıyor
- DEBT-002 kapatıldı (checkUsage sprint-003'te çözüldü)
- 967 test, %97.5 kapsam, 29 yeni test, 0 regresyon

## Sprint 16: İzleme Modu, Worker Logları, Ajan Detay

- `deckent watch` CLI: canlı tmux bölünmüş görünüm, `--follow` flag
- Worker log yakalama: tmux pipe-pane → `.tasks/task-{id}.log`
- `deckent start --watch` flag: sprint öncesi izleme penceresi oluşturur
- GET `/api/worker/:taskId/log` endpoint: görev JSON + worker log
- AgentDetail React bileşeni: 3 saniye polling, Sheet paneli
- `inferModelFromDirective()` sezgisel model seçimi: opus/sonnet/haiku
- `.brain/` dogfooding: sprint-015.md, ADR-013, MEMORY.md güncellendi
- 987 test, %97.5 kapsam, 20 yeni test, 0 regresyon

## Sprint 17: Güvenilirlik + Test Altyapısı + Dokümantasyon

- MCP `deckent_start` arka plan görevleri: `child_process.fork()`, hemen `jobId` döndürür, MCP timeout yok
- `.deckent/jobs/{jobId}.json` ile görev durumu takibi (RUNNING/COMPLETE/FAILED)
- `deckent_status` aktif görev durumunu gösteriyor
- `cleanup()` tüm görev dosya uzantılarını kapsıyor (.json, .plan, .hb, .result, .paused, .log), sprint prefix koruması, 24 saat eski dosya tespiti
- Sprint ID güvenliği: `.deckent/config.json`'da `last_sprint_id`, yapılandırma ve dosya taramasının max değeri — asla geri atlamaz
- Dashboard sıfırlama: PLAN fazında fresh DashboardState, sprint ID uyuşmazlığında auditor sıfırlama
- React test altyapısı: `src/dashboard/vitest.config.ts` (happy-dom), AgentDetail + DashboardPage testleri
- `test:dashboard` npm script'i
- 1027 test, %97.5 kapsam, 40 yeni test, 0 regresyon

## Sprint 18: Orkestrasyon Smoke Test — 10 Paralel Doküman Görevi

- Sprint 10'dan bu yana ilk gerçek `runSprint` çalıştırması — uçtan uca orkestrasyon doğrulandı
- 10 doküman görevi planlandı, 8'i çalıştırıldı (max_workers=8 görev sayısı limiti olarak yorumlandı — bug)
- 8 doküman üretildi (~135 KB): GLOSSARY, TROUBLESHOOTING, SECURITY, MCP-GUIDE, MEMORY-SYSTEM, SPRINT-LIFECYCLE, CONFIG-REFERENCE, WORKER-GUIDE
- 8 sonnet worker paralel çalıştı, tümü 260 saniyede tamamlandı
- 3 DONE, 5 GO_WITH_TECH_DEBT, 0 NO_GO
- 6 bug keşfedildi: planner görev limiti, heartbeat zaman damgası, dashboard ilerleme gecikmesi, alert tekrar sorunu, doküman coverage kriterleri, DEBT.md test hatası
- Gözlem raporu: docs/archive/observations/SPRINT-18-OBSERVATION.md
- 1027 test (sadece doküman sprint'i — yeni test yok), %97.5 kapsam, 0 regresyon

## Sprint 19: Motor Onarımı — 6 Bug Fix

- Sprint 18'deki 6 bug'ın tamamı ele alındı: heartbeat zaman damgası, dashboard ilerleme, alert tekrar engelleme, inferModelFromDirective, doküman görev kriterleri, otomatik doküman güncelleme
- 8/8 görev tamamlandı (6 DONE, 2 GO_WITH_TECH_DEBT), 760 saniye
- `isDocTask()`: doküman scope'ları için coverage kontrolü atlanıyor
- `updateProjectDocs()`: sprint sonrası dokümanlar otomatik güncelleniyor
- +96 test (1027→1123), +1555 kaynak satırı, 0 regresyon
- Gözlem raporu: docs/archive/observations/SPRINT-19-OBSERVATION.md

## Sprint 20: Fix Doğrulama

- Sprint 19 düzeltmelerinin sistematik doğrulaması — 3/6 GEÇTI
- Heartbeat zaman damgası: GEÇTI (0 stale alert)
- Dashboard ilerleme: GEÇTI (done sayacı doğru)
- Alert tekrar engelleme: GEÇTI (0 tekrar alert)
- Görev kuyruğu: BAŞARISIZ (planner hala max_workers ile sınırlı — Sprint 21'de düzeltildi)
- 8/14 görev planlandı (planner bug'ı aktif), 113 saniye
- 1027 test (doğrulama sprint'i), 0 regresyon
- Gözlem raporu: docs/archive/observations/SPRINT-20-OBSERVATION.md

## Sprint 21: Parametrik Orkestrasyon

- `system-profile.ts`: CPU, RAM, önerilen worker sayısı tespiti (`getSystemProfile()`)
- `subscription.ts`: Claude plan tespiti (`detectSubscription()`) — max_20x/max_5x/pro/api/unknown
- `resolveTaskModel()`: katmanlı model seçimi (scope → karmaşıklık → plan → kullanım)
- `resolveEffectiveWorkers()`: config "auto" ise sistem profilinden otomatik worker sayısı
- `deckent test` + `deckent run` CLI komutları (26→28 komut)
- Planner görev kuyruğu düzeltmesi: `planSprint` TÜM görevleri planlıyor, `spawnWorkers` parallelism sınırını uyguluyor
- DEBT.md decay bug'ı tekrar oluştu (3. kez) — Sprint 22'de kalıcı fix
- 8/8 görev (7 DONE, 1 TECH_DEBT), +137 test (1123→1260), 631 saniye
- Gözlem raporu: docs/archive/observations/SPRINT-21-OBSERVATION.md

## Sprint 22: Decay Fix + Auto Setup + MCP Enrichment

- `shouldRemoveResolvedDebt()` + `parseSprintNumber()`: resolved entry'ler 3 sprint boyunca korunuyor (DEBT-002 artık korunuyor)
- Auto Setup Wizard (`auto-setup.ts`): `generateSetupRecommendation()` — subscription + sistem profili + proje boyutu
- MCP Enrichment (`enrich.ts`): `enrichResponse()` tüm 10 tool'a `_enriched: { summary, hints, timestamp }` ekliyor
- CLI Hints (`hints.ts`, `messages.ts`): `getContextualHints()` faz bazlı öneriler, `getMessage()` lokalize mesajlar (tr/en)
- `doctor --profile`: sistem profili gösterimi (CPU, RAM, worker, subscription)
- AI planner hala 8/12 döndürüyor — Sprint 23'te post-validation fix
- 8 görev (6 DONE, 2 TECH_DEBT), +132 test (1260→1392), ~150 saniye

## Sprint 23: AI Planner Post-Validation Fallback + 12-Görev Doğrulama

- AI planner post-validation: AI `parseStructuredDirectives()` sayısından az döndürürse → `plannerResult = null`, structured mod'a düşüyor
- İlk kez 12/12 görev planlandı ve tamamlandı — görev kuyruğu dalga mekanizması doğrulandı (8 worker + 4 kuyruk)
- 11 doğrulama dokümanı (`tmp-test/`): Sprint 22 özelliklerini onaylıyor
- Planlama modu: `fallback` (AI 8 döndürdü, directive'de 12 vardı → structured fallback 12 oluşturdu)
- 12 görev (8 DONE, 4 TECH_DEBT, 0 NO_GO), 321 saniye
- +30 test (1392→1422), 55 test dosyası, 0 regresyon

---

# 20. CLAUDE CODE ENTEGRASYON REHBERİ

Claude Code bir Deckent projesini şöyle görür:

1. Claude, CLAUDE.md'yi okur (@DECKENT.md referansını takip eder)
2. DECKENT.md'de @import'lar var → Claude bunları takip eder
3. .claude/rules/ dosyaları bağlama göre etkinleşir
4. MCP sunucu kaydı sayesinde deckent araçları doğal dille çağrılabilir

```bash
# Sprint başlatma
cd my-project
deckent start

# Veya Claude Code'da doğal dille:
# "Bu proje için bir sprint planla"
# → Claude deckent_plan() çağırır
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

## Araçlar (10)

### Yaşam Döngüsü Araçları

| Araç | Girdi | Eşleşme | Amaç |
|------|-------|---------|------|
| `deckent_init` | projectName, mode?, language? | init.ts iskeleti | Projeye Deckent kur |
| `deckent_set_directives` | content: string | DIRECTIVES.md yazar | Sprint hedeflerini ayarla |
| `deckent_plan` | dryRun?: boolean | readContext → planSprint | Sprint planla, görev listesi döndür |
| `deckent_start` | autoApprove?: boolean | runSprint() | Tam sprint yaşam döngüsü çalıştır |

### Bilgi Araçları

| Araç | Girdi | Eşleşme | Amaç |
|------|-------|---------|------|
| `deckent_status` | yok | .dashboard okur | Sprint dashboard durumu |
| `deckent_doctor` | yok | runDoctorChecks() | Sistem sağlık kontrolü |
| `deckent_retro` | yok | RETRO.md okur | Son sprint retrospektifi |
| `deckent_history` | last?: number | .brain/sprints/ okur | Sprint geçmişi logları |
| `deckent_analyze_project` | yok | analyzeProject() | Proje yığın/boyut/metodoloji analizi |
| `deckent_sync` | yok | ensureDeckentImport() | CLAUDE.md + AGENTS.md'yi @DECKENT.md ile senkronize et |

## Kaynaklar (5)

| URI | İçerik | MIME Tipi |
|-----|--------|-----------|
| `deckent://dashboard` | Canlı sprint durumu (JSON) | application/json |
| `deckent://directives` | Mevcut DIRECTIVES.md | text/markdown |
| `deckent://memory` | Öğrenilen kalıplar (.brain/MEMORY.md) | text/markdown |
| `deckent://debt` | Teknik borç kalemleri (tablo → JSON) | application/json |
| `deckent://config` | Proje yapılandırması (.deckent/config.json) | application/json |

## Kritik Tasarım Kararı: deckent_set_directives

En büyük kullanıcı deneyimi sıkıntısı DIRECTIVES.md'yi doğru `## Görev N:` formatında elle yazmaktı. Bu araç sorunu çözer:

1. Kullanıcı "JWT ile kimlik doğrulama ekle" der
2. Claude bunu yapılandırılmış `## Görev N:` bloklarına formatlar
3. Araç formatlanmış içeriği DIRECTIVES.md'ye yazar
4. Brain'in `parseStructuredDirectives()` fonksiyonu değişmeden okur

---

# 22. KULLANICI AKIŞLARI

## Akış 1: İlk Kurulum

```
Kullanıcı: "Bu projeye Deckent kur"
Claude:    → deckent_doctor çağırır (sağlık kontrolü)
           → deckent_init(projectName: "my-app", mode: "max_plan") çağırır
           → ".deckent/, .brain/, .tasks/ oluşturuldu. MCP sunucu kaydedildi."
```

## Akış 2: İlk Sprint

```
Kullanıcı: "JWT ile login/register, korumalı route'lar ve profil sayfası ekle"
Claude:    → deckent_set_directives(content: "## Görev 1: Auth API\n...") çağırır
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
Claude:    → deckent://memory ve deckent_history() okur

Kullanıcı: "Teknik borç durumu?"
Claude:    → deckent://debt okur
           → "3 açık kalem, 1 YÜKSEK öncelik (2 sprinttir çözülmemiş)"

Kullanıcı: "Karanlık mod desteği ekle"
Claude:    → deckent_set_directives → deckent_plan → [kullanıcı onaylar] → deckent_start
```

**Kullanıcı HİÇBİR ZAMAN:**
- DIRECTIVES.md'yi elle açmak zorunda kalmaz
- Terminal komutu yazmak zorunda kalmaz
- Agile/sprint terminolojisini bilmek zorunda kalmaz
- .tasks/ veya .brain/ iç yapısını anlamak zorunda kalmaz

---

# 23. STRATEJİK YOL HARİTASI

## Aşama 1: Claude Native Kararlı (Sprint 1-8)

**Hedef:** Sağlam Claude-native orkestrasyon ve MCP entegrasyonu.

| Sprint | Odak | Durum |
|--------|------|-------|
| 1 | Çekirdek motor (brain, auditor, worker, tmux, CLI) | Tamamlandı |
| 2 | Asenkron geçiş, yaşam döngüsü sağlamlaştırma | Tamamlandı |
| 3 | Semantik düzeltmeler, kullanım ayrıştırma | Tamamlandı |
| 4 | Borç çözümleme yaşam döngüsü | Tamamlandı |
| 5 | Zayıflama, doctor, dashboard, kapsam | Tamamlandı |
| 6 | İlk dogfooding (kendini çalıştırma) | Tamamlandı |
| 7 | MCP sunucu (8 araç, 4 kaynak) | Tamamlandı |
| 8 | Dokümantasyon, API docs, MCP dogfooding | Tamamlandı |
| 9 | Analiz aracı, CI, dinamik versiyon, archive-debt | Tamamlandı |
| 10 | HTTP API+SSE, terminal dashboard, sprint ID refaktör | Tamamlandı |
| 11 | Web Dashboard (React+Vite+Tailwind, 4 sayfa) | Tamamlandı |
| 12-13 | Brain AI planlaması, Auditor süreç-içi, .deckent yapısı | Tamamlandı |
| 14 | Auditor canlı entegrasyon, .deckent sonlandırma | Tamamlandı |
| 15 | Deckent bağımsızlık, self-hosting, DECKENT.md, sync | Tamamlandı |
| 16 | İzleme modu, worker logları, ajan detay, model çıkarımı | Tamamlandı |

**Çıkış kriterleri:** 1027+ test, %97+ kapsam, kararlı MCP entegrasyonu, HTTP API, Web Dashboard, AI planlama, DECKENT.md bağımsızlık.

## Aşama 2: Sağlayıcı Soyutlama (Sprint 9-12) — TAMAMLANDI

- `claude -p` sağlayıcı arayüzüne soyutlandı (ProviderAdapter interface)
- Sağlayıcı: Claude (native), OpenAI Codex, Google Gemini — tümü aktif
- tmux + subprocess backend seçenekleri

## Aşama 3: Çoklu Sağlayıcı (Sprint 13-38) — TAMAMLANDI

- Brain Opus'ta (Claude), worker'lar farklı sağlayıcılarda — karıştır eşleştir
- Maliyet optimizasyonu: tier-based model eşdeğerliği (premium/standard/economy)
- Provider fallback chain: birincil → ikincil → üçüncül

## Aşama 4: Platform Genişleme (Sprint 039-065) — DEVAM EDİYOR

- [x] Web dashboard (React + Vite + Tailwind) — Sprint 011
- [ ] VSCode eklentisi (kenar çubuğu, durum çubuğu) — stub oluşturuldu
- [x] npm publish altyapısı — Sprint 051
- [x] VitePress dokümantasyon sitesi — Sprint 052
- [x] CI Guardian ajan + ci-testing skill — Sprint 062
- [x] Routing v2 engine (intent-based 3-layer) — Sprint 063
- [x] 33+ CLI komutu, 10 MCP aracı, 8+1 ajan, 11 skill
- [ ] Bulut modu: uzak orkestrasyon

---

# 24. SPRİNT GEÇMİŞİ

| Sprint | Test | Kapsam | Öne Çıkanlar |
|--------|------|--------|--------------|
| 1 | 432 | %89 | Çekirdek motor: tipler, yapılandırma, brain, auditor, worker, tmux, CLI |
| 2 | 480 | %91 | sleepSync → async sleep geçişi |
| 3 | 540 | %92 | haiku_allowed semantik düzeltme, checkUsage regex |
| 4 | 617 | %93 | resolveDebt yaşam döngüsü, eski borç temizliği |
| 5 | 644 | %94.83 | Zayıflama, doctor, start --dry-run, status --watch |
| 6 | 645 | %95 | İlk dogfooding: README.md 86 saniyede oluşturuldu, 1 görev TAMAMLANDI |
| 7 | 669 | %95 | MCP sunucu: 8 araç, 4 kaynak, otomatik kayıt, 24 yeni test |
| 8 | 669 | %95 | CONTRIBUTING.md, API docs, MCP dogfooding |
| 9 | 720 | %95 | analyze_project aracı, CI pipeline, dinamik versiyon, archive-debt |
| 10 | 799 | %95 | HTTP API+SSE, terminal dashboard, sprint ID refaktör |
| 11 | 852 | %97 | Web Dashboard: React+Vite+Tailwind, 4 sayfa, shadcn/ui |
| 12-13 | 938 | %97.5 | Brain AI planlaması (planner.ts, Zod), Auditor süreç-içi, .deckent yapısı |
| 14 | 938 | %97.5 | Auditor canlı entegrasyon, .deckent sonlandırma |
| 15 | 967 | %97.5 | DECKENT.md bağımsızlık, ensureDeckentImport, sync CLI+MCP, self-hosting, DEBT-002 kapatıldı, 10 araç 5 kaynak |
| 16 | 987 | %97.5 | deckent watch, worker log yakalama, start --watch, ajan detay görünümü, model çıkarımı |
| 17 | 1027 | %97.5 | MCP arka plan görevleri, cleanup düzeltme, sprint ID güvenliği, dashboard sıfırlama, React test altyapısı |
| 18 | 1027 | %97.5 | Orkestrasyon smoke test: 8 doküman, S10'dan beri ilk gerçek runSprint, 6 bug keşfedildi |
| 19 | 1123 | %97.5 | Motor onarımı: 6 bug fix (heartbeat, dashboard, alert dedup, model çıkarımı, doküman kriterleri, otomatik doküman) |
| 20 | 1027 | %97.5 | Fix doğrulama: 3/6 onaylandı (heartbeat, dashboard, alert dedup), planner hala kırık |
| 21 | 1260 | %97.5 | Parametrik orkestrasyon: sistem profili, subscription, resolveTaskModel, auto workers, test+run CLI |
| 22 | 1392 | %97.5 | Decay fix, auto setup wizard, MCP enrichment 10/10, CLI hints, doctor --profile |
| 23 | 1422 | %97.5 | AI planner fallback fix, 12/12 görev (ilk kez), görev kuyruğu dalga mekanizması doğrulandı |
| 24-25 | 3150 | %97 | Plugin v2 sistemi, i18n çalışma zamanı, +1449 test, OSS altyapısı (CONTRIBUTING, LICENSE, CI) |
| 26 | 3442 | %97 | Teknik borç temizliği, readJsonSafe migration, entegrasyon testleri |
| 27 | 3609 | %97 | Sağlayıcı soyutlama, subprocess backend, 13 yeni modül, +14.737 satır |
| 28 | 4100 | %97 | npm publish hazırlığı, hata kayıt sistemi, TUI wizard, onboard/upgrade |
| 29 | 5300 | %97 | Ajan havuzu: 8 yerleşik ajan, seçim algoritması, CLI komutları |
| 30 | 5700 | %97 | Yetenek sistemi: 10 yerleşik yetenek, stack tespiti, yetenek enjeksiyonu |
| 31 | 6400 | %97 | Brain karar motoru: 6 adımlı pipeline, öğrenme döngüsü, uyarlanır ajan |
| 32 | 6900 | %97 | UX: ilerleme çubuğu, zengin özet, bildirimler, etkileşimli inceleme |
| 33 | 7500 | %97 | Entegrasyon testleri, yetenek pazarı, güvenlik sandbox |
| 35-36 | 8073 | %97.5 | Beta temizlik: brain.ts bölme (1312→58 satır), types.ts bölme, barrel temizlik |
| 37 | 8073 | %97.5 | Güvenlik sertleştirme, plugin sistemi, AST sandbox, JSDoc |
| 38 | 8555 | %97.5 | Çoklu sağlayıcı: Claude + Codex + Gemini adaptörleri, tier eşdeğerlik |
| 039-041 | 8960 | %97.5 | Worker verify döngüsü, insan-dostu çıktı, MCP format |
| 042-047 | 10127 | %97.5 | Stabilizasyon, MCP-native sağlayıcılar, 10K+ test, çoklu ortam |
| 048-054 | 10509 | %96.4 | Blueprint cilalama, güvenlik başlıkları, npm publish, config genişleme |
| 055-059 | 10700 | %96.4 | CLI derin analiz: 158 iyileştirme, init/plan/start/status/doctor/retro |
| 060-061 | 10900 | %96.4 | CLI/Ajan doğrulama, ajan atama fix, brain bütçe decay |
| 062 | 11200 | %96.4 | ci-guardian ajan + ci-testing yetenek + CI hook'ları |
| 063 | 11500 | %96.4 | Routing v2 motoru (intent-based 3 katman) + forceSkills desteği |
| 064 | 11500 | %96.4 | Doğrulama sprint'i (tüm görevler zaten tamamlanmış) |
| 065 | 11862 | %96+ | AI planner timeout, autoMigrate, cleanup fix, analyzer birleştirme. 7/7 tamamlandı |

**İlk dogfooding sonucu (Sprint 6):** Deckent `deckent start` komutunu kendi üzerinde çalıştırdı, 86 saniyede 1 worker ile README.md oluşturdu. Orkestrasyon döngüsü (planla → başlat → yürüt → değerlendir → retro → temizle) uçtan uca tamamlandı.

**AI Planlama dönüm noktası (Sprint 12-13):** Brain, AI ile görev planlama yeteneği kazandı (Zod doğrulamalı). Başarısız olursa otomatik olarak yapısal ayrıştırmaya düşer. Auditor ayrı tmux sürecinden Brain içi tarama döngüsüne taşındı.

**Bağımsızlık dönüm noktası (Sprint 15):** DECKENT.md tek gerçek kaynak oldu. CLAUDE.md ve AGENTS.md artık `ensureDeckentImport()` ile `@DECKENT.md` enjeksiyonu alan adaptörler — katkısal, asla yıkıcı değil. Deckent artık kendi `.deckent/` yapısıyla self-hosting yapıyor.

**Güvenilirlik dönüm noktası (Sprint 17):** MCP `deckent_start` artık timeout olmuyor — sprint'i `child_process.fork()` ile arka plan görevi olarak çalıştırır. Sprint ID asla geri atlamaz (yapılandırma tabanlı güvenlik). Dashboard sprint'ler arasında temiz sıfırlanır. React test altyapısı bileşen testlerini mümkün kılar. Toplam 1027 test.

**Orkestrasyon dönüm noktası (Sprint 18):** Sprint 10'dan bu yana ilk gerçek `runSprint`. 8 paralel sonnet worker 260 saniyede 8 doküman görevi tamamladı. Tam yaşam döngüsü (PLAN→SPAWN→EXECUTE→EVALUATE→RETRO→CLEANUP) uçtan uca çalıştı. 6 bug keşfedildi — planner görev kuyruğu, heartbeat zaman damgaları, dashboard ilerleme, alert tekrar sorunu, doküman değerlendirme kriterleri, borç tablosu testi.

**Motor onarımı dönüm noktası (Sprint 19):** Sprint 18'deki 6 bug'ın tamamı düzeltildi. +96 test. `isDocTask()` ve `updateProjectDocs()` eklendi. Heartbeat, dashboard ve alert dedup Sprint 20 doğrulamasında çalıştığı onaylandı.

**Parametrik orkestrasyon dönüm noktası (Sprint 21):** Sistem profili tespiti, subscription tespiti, katmanlı model seçimi, otomatik worker sayısı. `deckent test` ve `deckent run` CLI komutları. Planner görev kuyruğu nihayet düzeltildi — tüm görevler max_workers'dan bağımsız planlanıyor. +137 test.

**Tam orkestrasyon dönüm noktası (Sprint 23):** AI planner post-validation fallback — AI directive'deki görev sayısından az döndürürse structured mod'a düşüyor. İlk kez 12/12 görev planlandı ve tamamlandı. Görev kuyruğu dalga mekanizması (8 worker + 4 kuyruk) uçtan uca doğrulandı. Toplam 1422 test.

**Mega sprint dönüm noktası (Sprint 24):** Plugin v2 sistemi (yükle/oluştur/kaldır/hook'lar), i18n çalışma zamanı, tek sprint'te +1449 test. OSS altyapısı: CONTRIBUTING.md, LICENSE, CI pipeline. Test sayısı 1701'den 3150'ye fırladı.

**Ajan havuzu dönüm noktası (Sprint 29):** Dinamik ajan havuzu sistemi. 8 yerleşik ajan (security-auditor, test-writer, doc-writer, code-reviewer, refactorer, bug-fixer, api-builder, performance-analyzer). Brain görev başına en iyi ajanı otomatik seçer.

**Çoklu sağlayıcı dönüm noktası (Sprint 38):** Tam çoklu sağlayıcı altyapısı. 8 model, 3 sağlayıcı (Claude, Codex, Gemini). ProviderAdapter arayüzü, tier-based model eşdeğerliği, sağlayıcı fallback zinciri. Aynı sprint'te birden fazla sağlayıcı kullanılabilir.

**10K test dönüm noktası (Sprint 046):** Test sayısı ilk kez 10.000'i aştı. 32+ CLI komutu. Çoklu ortam runtime.

**CLI derin analiz dönüm noktası (Sprint 055-059):** Tüm 33+ CLI komutunun kapsamlı analizi — 158 iyileştirme fırsatı tespit edildi ve sistematik olarak çözüldü.

**CI Guardian dönüm noktası (Sprint 062):** CI-farkında ajan sistemi. ci-guardian ajan + ci-testing yetenek. Üç yeni hook: beforeSprint, afterTask, afterSprint. Sprint'ten sprint'e CI öğrenme.

**Routing v2 dönüm noktası (Sprint 063):** Intent-based 3 katmanlı yönlendirme motoru. Niyet sınıflandırma → ajan seçimi → yetenek seçimi. forceSkills ve forceModel desteği.

**CLI tamamlanma dönüm noktası (Sprint 065):** Son CLI iyileştirme grubu: AI planner timeout, config autoMigrate, cleanup fix, spawn scope enforcement, analyzer birleştirme. 11.862 test, 469 test dosyası, 247 kaynak dosya, 75.105 satır.

---

# PLANIN SONU

Bu doküman Deckent'in uygulaması için tek doğruluk kaynağıdır.
MCP araçlarını kullanın: "Deckent kur" veya "Şu hedefler için sprint planla".
Veya Claude Code'da açıp söyleyin: "Bunu uygula."
