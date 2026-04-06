<!-- Dil: TR | Teknik terimler EN -->

# deckent

**Yapay zeka geliştirme ekibiniz, orkestre edilmiş.**

[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-12193%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-95%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v0.3.0--beta.3-orange)](https://github.com/VerhexIO/deckent)

Deckent, doğal dili çalışan koda dönüştüren bir AI agent orkestrasyon CLI'dir. Hedeflerinizi yazın; Deckent görevleri planlar, paralel AI worker'lar atar, kaliteyi izler ve sonuçları teslim eder -- hepsi tek bir sprint içinde.

<!-- ![demo](docs/assets/demo.gif) -->

## 30 Saniyede Başlangıç

```bash
# Global olarak kur
npm install -g deckent

# Projende başlat
cd my-project
deckent init

# Hedeflerini DIRECTIVES.md'ye yaz, sonra çalıştır
deckent start
```

---

## Nasıl Çalışır

Deckent üç adımlı bir döngü izler:

1. **Tanımla** -- Ne istediğini `DIRECTIVES.md` dosyasına yaz
2. **Planla** -- Brain hedeflerini okur ve kapsamlı, öncelikli görevler oluşturur
3. **Çalıştır** -- Paralel AI worker'lar kodu yazar, test eder ve sonuçları raporlar

```
                    DIRECTIVES.md
                         |
                    [ Brain: Plan ]
                    /    |    \
              Worker1  Worker2  Worker3   (paralel, kapsamlı)
                    \    |    /
                    [ Brain: Evaluate ]
                         |
                  GO / NO-GO / TECH_DEBT
```

---

## Mimari

```
+------------------------------------------------------------------+
|                         deckent CLI                               |
+------------------------------------------------------------------+
|                                                                  |
|   +----------+     +----------+     +----------+                 |
|   |  Brain   |---->| Worker 1 |     | Auditor  |                 |
|   | (planlar,|---->| Worker 2 |     | (tarar,  |                 |
|   | değerl.) |---->| Worker N |     |  uyarır) |                 |
|   +----------+     +----------+     +----------+                 |
|        |                                   |                     |
|   .brain/            .tasks/          .dashboard                 |
|   (bellek,           (task JSON,      (canlı durum)              |
|    borç,              sonuçlar,                                  |
|    desenler)          heartbeat'ler)                             |
+------------------------------------------------------------------+
```

- **Brain** -- Görevleri planlar, model atar, sonuçları değerlendirir, desenlerden öğrenir
- **Workers** -- Görevleri paralel yürütür (tmux veya subprocess ile), her biri plan-kod-test-rapor döngüsünü tamamlar
- **Auditor** -- Heartbeat'leri izler, sınır ihlallerini tespit eder, kaliteyi denetler

---

## Temel Özellikler

- **Sprint Yaşam Döngüsü** -- Yapılandırılmış PLAN, SPAWN, EXECUTE, EVALUATE, RETRO, DECAY fazları her sprint'in tamamlanmasını sağlar
- **Çoklu Worker Paralel Çalıştırma** -- Aynı anda 10'a kadar AI worker, her biri izole bir kapsamda çalışır
- **Bellek ve Öğrenme** -- Brain öğrenimleri `.brain/MEMORY.md`'de, desenleri `PATTERNS.md`'de saklar ve her sprint ile geliştirir
- **Auditor Kalite Kapısı** -- Sürekli izleme: stale heartbeat tespiti, sınır ihlali taraması, Kahn algoritması ile kilitlenme tespiti
- **GO / NO-GO Değerlendirme** -- Her görev sonucu belirlenmiş kriterlere göre değerlendirilir. NO-GO görevler kaydedilir ve isteğe bağlı olarak yeniden denenir
- **Çoklu Provider Desteği** -- Claude (varsayılan), OpenAI Codex ve Google Gemini ile çalışır. Rol bazlı (brain, worker) veya görev bazlı yapılandırma
- **Provider Yedekleme Zinciri** -- Birincil provider başarısız mı? Model eşdeğerliği eşleşmesiyle otomatik yedek provider'a geçiş
- **Kullanım Duyarlı Planlama** -- Claude plan kullanımınıza göre (5 saatlik ve haftalık eşikler) sprint boyutunu otomatik ayarlar
- **Stack Algılayan Başlangıç** -- Proje stack'inizi (Python, Go, Rust, Java, C#, Swift, Ruby, PHP, Dart, Kotlin, TypeScript) algılar ve build/test komutlarını otomatik yapılandırır
- **TempAgent ve TempSkill** -- Kod tabanınızın konvansiyonlarına göre projeye özel agent ve skill'ler otomatik üretir
- **Yerleşik Dokümantasyon** -- `.deckent/docs/` ile hızlı başlangıç, directive rehberi ve yapılandırma referansı gelir
- **Yerel Windows Desteği** -- `shell:true` ile tam subprocess backend, periyodik heartbeat güncellemeleri ve UTF-8 desteği
- **Plugin Sistemi** -- Özel hook'lar, komutlar ve desenlerle Deckent'i genişletin
- **MCP Entegrasyonu** -- Sorunsuz Claude Code IDE entegrasyonu için 19 MCP tool + 8 resource
- **Web Dashboard** -- Gerçek zamanlı SSE güncellemeleriyle React + Vite + Tailwind dashboard
- **Uluslararasılaştırma** -- İngilizce ve Türkçe dil desteği yerleşik
- **Review Arşiv Yedeği** -- Sprint review, cleanup sonrasında bile arşivden okuyarak çalışır
- **Heartbeat Daemon** -- `deckent heartbeat --daemon` komutuyla arka planda lint/test gibi periyodik kontroller çalıştıran proaktif görev sistemi
- **Human Checkpoints** -- Denetimli otonom çalıştırmalar için `plan`, `evaluate` ve `fix` fazlarında yapılandırılabilir onay noktaları
- **Yapılandırılabilir Sprint Timeout** -- Sınırsız süreli sprint için `sprint_timeout_minutes: 0`, ya da dakika cinsinden sabit timeout ayarı
- **Beta Güncelleme İş Akışı** -- Yerel beta kurulumu için `deckent upgrade --local <path.tgz>`

---

## Karşılaştırma

| Özellik | deckent | Cursor | Devin | Aider | Claude Code (tek başına) |
|---------|---------|--------|-------|-------|--------------------------|
| Çoklu agent paralel çalıştırma | Evet (10 worker'a kadar) | Hayır | Evet | Hayır | Hayır |
| Sprint yaşam döngüsü yönetimi | Evet | Hayır | Kısmi | Hayır | Hayır |
| Hedeflerden otomatik görev planlama | Evet (AI + structured) | Hayır | Evet | Hayır | Hayır |
| Sınır denetimli kalite auditor | Evet | Hayır | Hayır | Hayır | Hayır |
| Sprint'ler arası bellek ve öğrenme | Evet | Hayır | Kısmi | Hayır | Hayır |
| Görev bazlı GO/NO-GO değerlendirme | Evet | Hayır | Hayır | Hayır | Hayır |
| Kullanım duyarlı otomatik kısıtlama | Evet | Yok | Yok | Yok | Hayır |
| Açık kaynak | Evet (MIT) | Hayır | Hayır | Evet | Kısmi |
| MCP entegrasyonu | Evet (19 tool) | Yok | Yok | Yok | Yok |
| Web dashboard | Evet | Yerleşik | Yerleşik | Hayır | Hayır |
| Çoklu provider desteği | Evet (Claude, Codex, Gemini) | Hayır | Hayır | Evet | Hayır |
| Çevrimdışı çalışma (yerel modeller) | Planlı | Evet | Hayır | Evet | Hayır |
| Heartbeat / proaktif görevler | Evet | Hayır | Hayır | Hayır | Hayır |

---

## Platform Desteği

| Platform | Durum | Notlar |
|----------|-------|--------|
| Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch) | **TAM** | Birincil geliştirme platformu |
| macOS (12+) | **TAM** | Tüm özellikler desteklenir |
| Windows (WSL2 ile) | **TAM** | Önerilen Windows kurulumu -- Ubuntu/Debian WSL2 kullanın |
| Yerel Windows (cmd / PowerShell) | **TAM** | `shell:true` ile subprocess backend, periyodik heartbeat, UTF-8 desteği |

> **Windows kullanıcıları:** Yerel Windows, subprocess backend ile tam olarak desteklenir. WSL2, tmux tabanlı iş akışları için bir seçenek olmaya devam eder. `deckent doctor` platform uyumluluğunu doğrular.

---

## Gereksinimler

| Gereksinim | Sürüm | Kontrol |
|------------|-------|---------|
| Node.js | >= 18 | `node --version` |
| git | herhangi | `git --version` |
| Claude Code CLI | herhangi | `claude --version` |
| tmux | herhangi (isteğe bağlı) | `tmux -V` |
| OpenAI Codex CLI | herhangi (isteğe bağlı) | `codex --version` |
| Google Gemini API | herhangi (isteğe bağlı) | `GOOGLE_API_KEY` env var |

**Claude Aboneliği:** Pro, Max 5x, Max 20x veya API key (kullandıkça öde). Diğer provider'lar (Codex, Gemini) kendi API key'leriyle çalışır.

**Desteklenen İşletim Sistemleri:** macOS, Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch), Windows (WSL2 ile)

---

## Kurulum

```bash
npm install -g deckent
```

Doğrulama:

```bash
deckent --version
deckent doctor
```

---

## CLI Kullanımı

### Proje Başlat

```bash
cd my-project
deckent init
```

Çıktı:

```
  Welcome to Deckent!

  ? Select your plan:
    > Performance -- 8 workers, premium model brain
      Balanced    -- 5 workers, standard model brain
      Economic    -- 3 workers, standard model only
      API (pay-as-you-go) -- 10 workers, any model

  Detected stack: TypeScript + Vitest + React
  ? Project name: my-project

  Next: Edit DIRECTIVES.md with your first goals, then run `deckent start`
```

### Sprint Başlat

```bash
# DIRECTIVES.md'ye hedeflerini yaz, sonra:
deckent start

# Çalıştırmadan planı önizle:
deckent start --dry-run

# Tüm worker araç izinlerini otomatik onayla:
deckent start --auto-approve
```

### Durumu Kontrol Et

```bash
deckent status

# Her 2 saniyede otomatik yenile:
deckent status --watch

# Makine tarafından okunabilir çıktı:
deckent status --json
```

Örnek çıktı:

```
Sprint sprint-001 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  001-001     EXECUTING   sonnet   5s ago
  001-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running
```

### Çalıştırmadan Planla

```bash
deckent plan
```

### Sağlık Kontrolü

```bash
deckent doctor
```

Çıktı:

```
  node_version   v20.11.0 (>=18 required)     [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
  claude_cli     claude 1.2.3                  [pass]
  workspace      .deckent/ found               [pass]
```

### Tüm Komutlar

| Komut | Açıklama |
|-------|----------|
| `deckent init` | Etkileşimli kurulum sihirbazı |
| `deckent onboard` | Tam uyarlama (global + proje yapılandırması) |
| `deckent start` | Tam sprint yaşam döngüsünü çalıştır |
| `deckent plan` | Sonraki sprint'i planla (sadece planlama modu) |
| `deckent status` | Canlı dashboard göster |
| `deckent attach` | tmux oturumuna bağlan |
| `deckent spawn <id>` | Elle bir worker başlat |
| `deckent kill <id>` | Belirli bir worker'i durdur |
| `deckent retro` | Sprint retrospektifini çalıştır |
| `deckent cleanup` | Sprint dosyalarını arşivle ve worker'ları durdur |
| `deckent doctor` | Sistem sağlığını kontrol et |
| `deckent config` | Yapılandırmayı göster/düzenle |
| `deckent config set <key> <value>` | Bir yapılandırma değerini ayarla |
| `deckent history` | Sprint geçmişini ve metrikleri göster |
| `deckent plugin install <name>` | Bir plugin kur |
| `deckent plugin list` | Kurulu plugin'leri listele |
| `deckent analyze` | Proje stack'ini ve boyutunu analiz et |
| `deckent archive-debt` | Çözülmüş teknik borcu arşivle |
| `deckent dashboard` | Terminal TUI dashboard |
| `deckent serve` | HTTP API sunucusunu başlat |
| `deckent web` | Web dashboard + API sunucusu (localhost:3100) |
| `deckent upgrade` | Deckent'i güncelle (beta için `--local <path.tgz>`) |
| `deckent sync` | Adapter dosyalarını DECKENT.md ile senkronize et |
| `deckent watch` | Canlı tmux bölünmüş görünüm |
| `deckent test` | Proje testlerini çalıştır |
| `deckent set-directives` | Sprint directive'lerini ayarla |
| `deckent finalize` | Mevcut sprint'i sonlandır |
| `deckent run <cmd>` | Rastgele komut çalıştır |
| `deckent explain <topic>` | Bir kavram veya komutu açıkla |
| `deckent quick-start` | Yeni projeler için hızlı başlangıç sihirbazı |
| `deckent skill` | Kurulu skill'leri listele veya yönet |
| `deckent skill-marketplace` | Skill marketplace'i gezin ve kur |
| `deckent agent` | Agent havuzunu yönet (listele, incele, sıfırla) |
| `deckent review` | Son sprint sonuçlarını incele |
| `deckent config migrate` | Yapılandırmayı en son şema sürümüne taşı |
| `deckent heartbeat` | Tek seferlik heartbeat kontrolü çalıştır (`--daemon` arka planda, `--interval <dk>` ile aralık ayarla) |

---

## MCP Entegrasyonu

Deckent, Model Context Protocol üzerinden Claude Code ile entegre olur. Kayıt için:

```bash
claude mcp add deckent -- npx deckent mcp
```

Veya `deckent init` otomatik olarak kayıt yapsın.

### MCP Tool'lar (19)

| Tool | Açıklama |
|------|----------|
| `deckent_init` | Proje yapısını başlat |
| `deckent_set_directives` | Sprint hedeflerini DIRECTIVES.md'ye yaz |
| `deckent_plan` | Sprint planını önizle |
| `deckent_start` | Arka planda sprint başlat |
| `deckent_status` | Mevcut sprint durumunu getir |
| `deckent_doctor` | Sağlık kontrollerini çalıştır |
| `deckent_retro` | Son retrospektifi oku |
| `deckent_history` | Sprint geçmişini görüntüle |
| `deckent_analyze_project` | Proje stack'ini analiz et |
| `deckent_sync` | Adapter dosyalarını senkronize et |
| `deckent_config` | Yapılandırmayı göster veya güncelle |
| `deckent_review` | Son sprint sonuçlarını incele |
| `deckent_run` | Proje bağlamında rastgele komut çalıştır |
| `deckent_kill` | Belirli bir worker'i durdur |
| `deckent_cleanup` | Sprint dosyalarını arşivle ve worker'ları temizle |
| `deckent_help` | Çalışma zamanı yetenekleri, durum bilgisi ve iş akışı rehberi |
| `deckent_agent_list` | Kayıtlı agent'ları listele (yerleşik ve geçici) |
| `deckent_skill_list` | Kayıtlı skill'leri manifest bilgisiyle listele |
| `deckent_checkpoint` | Human checkpoint'leri onayla/reddet |

### MCP Resource'lar (8)

| Resource URI | İçerik |
|--------------|--------|
| `deckent://dashboard` | Canlı sprint dashboard |
| `deckent://directives` | Mevcut DIRECTIVES.md |
| `deckent://memory` | Geçmiş sprint'lerden öğrenilenler |
| `deckent://debt` | Teknik borç kalemleri |
| `deckent://config` | Proje yapılandırması |
| `deckent://retro` | Son sprint retrospektifi |
| `deckent://tasks` | Aktif görev listesi ve durumları |
| `deckent://agents` | Agent havuzu ve performans istatistikleri |

---

## Yapılandırma

Yapılandırma `.deckent/config.json` (proje) ve `~/.deckent/config.json` (global) dosyalarında bulunur. Proje yapılandırması global'i geçersiz kılar.

### Temel Seçenekler

| Seçenek | Tip | Varsayılan | Açıklama |
|---------|-----|-----------|----------|
| `mode` | string | `"performance"` | Plan katmanı: `performance`, `balanced`, `economic`, `api` |
| `language` | string | `"en"` | Çıktı dili: `en`, `tr` |
| `projectName` | string | `"deckent-project"` | Dashboard ve loglar için proje adı |
| `brain_planning` | string | `"auto"` | Planlama modu: `ai`, `structured`, `auto` |
| `brain_provider` | string | `"claude"` | Brain için provider: `claude`, `codex`, `gemini` |
| `worker_provider` | string | `"claude"` | Worker'lar için provider: `claude`, `codex`, `gemini` |
| `fallback_provider` | string | -- | Başarısızlıkta yedek provider |
| `modes.<mode>.max_workers` | number | değişken | Maksimum paralel worker sayısı |
| `modes.<mode>.brain_model` | string | değişken | Brain'in planlama için kullandığı model |
| `modes.<mode>.default_model` | string | değişken | Worker'lar için varsayılan model |
| `modes.<mode>.haiku_allowed` | boolean | değişken | Brain'in haiku atayıp atayamayacağı |

### Plan Katmanları

| Katman | Maks Worker | Brain Model | Varsayılan Model |
|--------|-------------|-------------|------------------|
| `performance` | 8 | opus | opus |
| `balanced` | 5 | sonnet | opus |
| `economic` | 3 | sonnet | sonnet |
| `api` | 10 | opus | sonnet |

**Eski takma adlar:** `max_plan`, `max5x_plan`, `pro_plan` hala kabul edilir ve yeni katman adlarına otomatik taşınır.

### Çoklu Provider Desteği

Deckent üç AI provider ile çalışır. Rol bazlı veya görev bazlı yapılandırılabilir:

| Provider | Modeller | Ortam Değişkeni |
|----------|----------|-----------------|
| Claude (varsayılan) | opus, sonnet, haiku | Oturum doğrulaması veya `ANTHROPIC_API_KEY` |
| Codex (OpenAI) | gpt-5, gpt-4.1, gpt-5-mini | `OPENAI_API_KEY` |
| Gemini (Google) | gemini-2.5-pro, gemini-2.5-flash | `GOOGLE_API_KEY` |

Provider'lar arası model eşdeğerliği: opus = gpt-5 = gemini-2.5-pro (premium), sonnet = gpt-4.1 = gemini-2.5-flash (standard), haiku = gpt-5-mini (economy).

Tam rehber için [docs/reference/multi-provider.md](docs/reference/multi-provider.md) dosyasına bakın.

Tam yapılandırma referansı için [docs/reference/config-reference.md](docs/reference/config-reference.md) dosyasına bakın.

---

## Web Dashboard

```bash
deckent web     # localhost:3100 adresinde açılır
```

React + Vite + Tailwind -- 6 sayfa (Dashboard, Ayarlar, Geçmiş, Bellek, Config, Durum), SSE gerçek zamanlı güncellemeler, koyu/açık tema, TR/EN dil değiştirici.

---

## HTTP API

```bash
deckent serve   # Sadece API, localhost:3100
```

17 endpoint + SSE akışı. Tam referans için [docs/reference/api.md](docs/reference/api.md) dosyasına bakın.

---

## Çalışma Alanı Yapısı

`deckent init` sonrasında:

```
my-project/
  DECKENT.md             # Tek doğru kaynak (agent yapılandırması)
  DIRECTIVES.md          # Hedefleriniz -- her sprint öncesi düzenleyin
  CLAUDE.md              # Claude Code adaptörü
  AGENTS.md              # Genel agent adaptörü
  .deckent/
    config.json          # Çalışma zamanı yapılandırması
    workspace/           # Kimlik, araçlar, başlangıç sırası
    docs/                # Yerleşik rehberler (hızlı başlangıç, directive, yapılandırma)
    agents/              # Agent havuzu (yerleşik + geçici agent'lar)
    skills/              # Skill kayıt defteri (yerleşik + geçici skill'ler)
    plugins/             # Kurulu plugin'ler
    i18n/                # Dil dosyaları
  .brain/
    MEMORY.md            # Öğrenilenler (otomatik güncellenir)
    DEBT.md              # Teknik borç kaydı
    PATTERNS.md          # Tespit edilen desenler
    RETRO.md             # Son sprint retrospektifi
    DECISIONS.md         # Mimari kararlar
    sprints/             # Sprint bazlı loglar
  .tasks/                # Task JSON dosyaları (Brain tarafından yönetilir)
  .locks/                # Dosya kilitleri (worker'lar tarafından yönetilir)
```

---

## Katkıda Bulunma

Geliştirme ortamı kurulumu, test rehberi, kod standartları ve PR süreci için [CONTRIBUTING.md](CONTRIBUTING.md) dosyasına bakın.

---

## Dokümantasyon

- [Hızlı Başlangıç Rehberi](docs/guide/quickstart.md)
- [API Referansı](docs/reference/api.md)
- [Yapılandırma Referansı](docs/reference/config-reference.md)
- [Çoklu Provider Rehberi](docs/reference/multi-provider.md)
- [Mimari](docs/architecture/architecture.md)
- [Sprint Yaşam Döngüsü](docs/architecture/sprint-lifecycle.md)
- [MCP Rehberi](docs/reference/mcp-guide.md)
- [Plugin Rehberi](docs/development/plugin-guide.md)
- [Sorun Giderme](docs/development/troubleshooting.md)
- [SSS](docs/guide/faq.md)

---

## Lisans

MIT -- [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Web Sitesi:** [deckent.agency](https://deckent.agency)
