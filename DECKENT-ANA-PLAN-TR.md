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
- Claude ile sınırlı değil (gelecek: sağlayıcı soyutlama katmanıyla çoklu sağlayıcı)

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
│  9 Araç + 4 Kaynak                                  │
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
│  src/api/server.ts — 15 uç nokta + SSE             │
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
├── AGENTS.md                          # Ana ajan talimatları
├── CLAUDE.md → AGENTS.md              # Claude Code uyumluluğu için symlink
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
│   │   ├── server.ts               # 15 uç nokta + SSE akışı
│   │   └── watcher.ts              # Dashboard dosya izleyici
│   ├── cli/                          # CLI komutları (commander.js, 21 dosya)
│   ├── mcp/                          # MCP sunucu entegrasyonu
│   │   ├── server.ts                # Giriş noktası (McpServer + stdio)
│   │   ├── tools/                   # 9 araç işleyicisi
│   │   └── resources/               # 4 kaynak işleyicisi
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
- **HTTP API:** Tamamlandı (Sprint 10) — 15 uç nokta + SSE, `deckent serve` / `deckent web`
- **Worker heartbeat:** `buildWorkerPrompt` artık `.tasks/task-{id}.hb` dosyası oluşturma talimatı içeriyor.

---

# 18. DOSYA REFERANSI

Her dosya, amacı, yazarı ve okuyucusu:

| Dosya | Amaç | Yazan | Okuyan | Yaşam Döngüsü |
|-------|------|-------|--------|----------------|
| AGENTS.md | Ana talimatlar | deckent init + siz | Tüm ajanlar | Kalıcı |
| CLAUDE.md | Symlink → AGENTS.md | deckent init | Claude Code | Kalıcı |
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
| .dashboard | Canlı durum | Auditor | Siz, UI | Üzerine yazılır |
| .claude/rules/*.md | Ajan kuralları | deckent init | Claude Code | Kalıcı |
| .claude/settings.json | MCP sunucu kaydı | deckent init | Claude Code | Kalıcı |
| src/orchestra/planner.ts | AI görev planlaması (Zod) | Geliştirici | Brain | Kalıcı |
| src/core/analyzer.ts | Proje yığın/boyut analizi | Geliştirici | MCP, CLI | Kalıcı |
| src/api/server.ts | HTTP API (15 uç nokta + SSE) | Geliştirici | Web dashboard | Kalıcı |
| src/api/watcher.ts | Dashboard dosya izleyici | Geliştirici | API sunucu | Kalıcı |
| src/dashboard/ | Web Dashboard (React+Vite+Tailwind) | Geliştirici | Tarayıcı | Kalıcı |
| src/mcp/server.ts | MCP sunucu giriş noktası | Geliştirici | Claude Code | Kalıcı |
| src/mcp/tools/*.ts | MCP araç işleyicileri (9) | Geliştirici | MCP sunucu | Kalıcı |
| src/mcp/resources/*.ts | MCP kaynak işleyicileri (4) | Geliştirici | MCP sunucu | Kalıcı |
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

- CONTRIBUTING.md, tam API referansı (docs/API.md)
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

- HTTP API sunucusu (`src/api/server.ts`): 15 uç nokta + SSE akışı
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

---

# 20. CLAUDE CODE ENTEGRASYON REHBERİ

Claude Code bir Deckent projesini şöyle görür:

1. Claude, CLAUDE.md'yi okur (AGENTS.md'ye symlink)
2. AGENTS.md'de @import'lar var → Claude bunları takip eder
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

## Araçlar (9)

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

## Kaynaklar (4)

| URI | İçerik | MIME Tipi |
|-----|--------|-----------|
| `deckent://dashboard` | Canlı sprint durumu (JSON) | application/json |
| `deckent://directives` | Mevcut DIRECTIVES.md | text/markdown |
| `deckent://memory` | Öğrenilen kalıplar (.brain/MEMORY.md) | text/markdown |
| `deckent://debt` | Teknik borç kalemleri (tablo → JSON) | application/json |

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

**Çıkış kriterleri:** 938+ test, %97+ kapsam, kararlı MCP entegrasyonu, HTTP API, Web Dashboard, AI planlama.

## Aşama 2: Sağlayıcı Soyutlama (Sprint 9-12)

- `claude -p` yi sağlayıcı arayüzüne soyutla
- Sağlayıcı: Claude (native), OpenAI (gelecek), yerel LLM (gelecek)
- tmux başlatma kalır — sağlayıcı sadece model çağrımını etkiler

## Aşama 3: Çoklu Sağlayıcı (Sprint 13+)

- Brain Opus'ta (Claude), worker'lar GPT-4o'da (OpenAI) — karıştır eşleştir
- Maliyet optimizasyonu: pahalı görevler güçlü modellerde, basitler ucuzda

## Aşama 4: Platform Genişleme (Sprint 20+)

- Web dashboard (React + WebSocket)
- VSCode eklentisi (kenar çubuğu, durum çubuğu)
- Takım modu: paylaşılan sprint'ler, rol tabanlı erişim
- Bulut modu: uzak orkestrasyon (yerel tmux yok)

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

**İlk dogfooding sonucu (Sprint 6):** Deckent `deckent start` komutunu kendi üzerinde çalıştırdı, 86 saniyede 1 worker ile README.md oluşturdu. Orkestrasyon döngüsü (planla → başlat → yürüt → değerlendir → retro → temizle) uçtan uca tamamlandı.

**AI Planlama dönüm noktası (Sprint 12-13):** Brain, AI ile görev planlama yeteneği kazandı (Zod doğrulamalı). Başarısız olursa otomatik olarak yapısal ayrıştırmaya düşer. Auditor ayrı tmux sürecinden Brain içi tarama döngüsüne taşındı.

---

# PLANIN SONU

Bu doküman Deckent'in uygulaması için tek doğruluk kaynağıdır.
MCP araçlarını kullanın: "Deckent kur" veya "Şu hedefler için sprint planla".
Veya Claude Code'da açıp söyleyin: "Bunu uygula."
