<!-- Dil: TR | Teknik terimler EN -->

# deckent

**Yapay zeka gelistirme ekibiniz, orkestre edilmis.**

[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-12196%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-78%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v0.2.0--beta.3-orange)](https://github.com/VerhexIO/deckent)

Deckent, dogal dili calisan koda donusturen bir AI agent orkestrasyon CLI'dir. Hedeflerinizi yazin; Deckent gorevleri planlar, paralel AI worker'lar atar, kaliteyi izler ve sonuclari teslim eder -- hepsi tek bir sprint icinde.

<!-- ![demo](docs/assets/demo.gif) -->

## 30 Saniyede Baslangi

```bash
# Global olarak kur
npm install -g deckent

# Projende baslat
cd my-project
deckent init

# Hedeflerini DIRECTIVES.md'ye yaz, sonra calistir
deckent start
```

---

## Nasil Calisir

Deckent uc adimli bir dongu izler:

1. **Tanimla** -- Ne istedigini `DIRECTIVES.md` dosyasina yaz
2. **Planla** -- Brain hedeflerini okur ve kapsamli, oncelikli gorevler olusturur
3. **Calistir** -- Paralel AI worker'lar kodu yazar, test eder ve sonuclari raporlar

```
                    DIRECTIVES.md
                         |
                    [ Brain: Plan ]
                    /    |    \
              Worker1  Worker2  Worker3   (paralel, kapsamli)
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
|   | degerl.) |---->| Worker N |     |  uyarir) |                 |
|   +----------+     +----------+     +----------+                 |
|        |                                   |                     |
|   .brain/            .tasks/          .dashboard                 |
|   (bellek,           (task JSON,      (canli durum)              |
|    borc,              sonuclar,                                  |
|    desenler)          heartbeat'ler)                             |
+------------------------------------------------------------------+
```

- **Brain** -- Gorevleri planlar, model atar, sonuclari degerlendirir, desenlerden ogrenir
- **Workers** -- Gorevleri paralel yurutur (tmux veya subprocess ile), her biri plan-kod-test-rapor dongusunu tamamlar
- **Auditor** -- Heartbeat'leri izler, sinir ihlallerini tespit eder, kaliteyi denetler

---

## Temel Ozellikler

- **Sprint Yasam Dongusu** -- Yapilandirilmis PLAN, SPAWN, EXECUTE, EVALUATE, RETRO, DECAY fazlari her sprint'in tamamlanmasini saglar
- **Coklu Worker Paralel Calistirma** -- Ayni anda 10'a kadar AI worker, her biri izole bir kapsamda calisir
- **Bellek ve Ogrenme** -- Brain ogrenimleri `.brain/MEMORY.md`'de, desenleri `PATTERNS.md`'de saklar ve her sprint ile gelistirir
- **Auditor Kalite Kapisi** -- Surekli izleme: stale heartbeat tespiti, sinir ihlali taramasi, Kahn algoritmasi ile kilitlenme tespiti
- **GO / NO-GO Degerlendirme** -- Her gorev sonucu belirlenmis kriterlere gore degerlendirilir. NO-GO gorevler kaydedilir ve istege bagli olarak yeniden denenir
- **Coklu Provider Destegi** -- Claude (varsayilan), OpenAI Codex ve Google Gemini ile calisir. Rol bazli (brain, worker) veya gorev bazli yapilandirma
- **Provider Yedekleme Zinciri** -- Birincil provider basarisiz mi? Model esdegerligi eslesmesiyle otomatik yedek provider'a gecis
- **Kullanim Duyarli Planlama** -- Claude plan kullaniminiza gore (5 saatlik ve haftalik esikler) sprint boyutunu otomatik ayarlar
- **Stack Algilayan Baslangic** -- Proje stack'inizi (Python, Go, Rust, Java, C#, Swift, Ruby, PHP, Dart, Kotlin, TypeScript) algilar ve build/test komutlarini otomatik yapilandirir
- **TempAgent ve TempSkill** -- Kod tabaninizin konvansiyonlarina gore projeye ozel agent ve skill'ler otomatik uretir
- **Yerlesik Dokumantasyon** -- `.deckent/docs/` ile hizli baslangic, directive rehberi ve yapilandirma referansi gelir
- **Yerel Windows Destegi** -- `shell:true` ile tam subprocess backend, periyodik heartbeat guncellemeleri ve UTF-8 destegi
- **Plugin Sistemi** -- Ozel hook'lar, komutlar ve desenlerle Deckent'i genisletin
- **MCP Entegrasyonu** -- Sorunsuz Claude Code IDE entegrasyonu icin 17 MCP tool + 9 resource
- **Web Dashboard** -- Gercek zamanli SSE guncellemeleriyle React + Vite + Tailwind dashboard
- **Uluslararasilastirma** -- Ingilizce ve Turkce dil destegi yerlesik
- **Review Arsiv Yedegi** -- Sprint review, cleanup sonrasinda bile arsivden okuyarak calisir
- **Beta Guncelleme Is Akisi** -- Yerel beta kurulumu icin `deckent upgrade --local <path.tgz>`

---

## Karsilastirma

| Ozellik | deckent | Cursor | Devin | Aider | Claude Code (tek basina) |
|---------|---------|--------|-------|-------|--------------------------|
| Coklu agent paralel calistirma | Evet (10 worker'a kadar) | Hayir | Evet | Hayir | Hayir |
| Sprint yasam dongusu yonetimi | Evet | Hayir | Kismi | Hayir | Hayir |
| Hedeflerden otomatik gorev planlama | Evet (AI + structured) | Hayir | Evet | Hayir | Hayir |
| Sinir denetimli kalite auditor | Evet | Hayir | Hayir | Hayir | Hayir |
| Sprint'ler arasi bellek ve ogrenme | Evet | Hayir | Kismi | Hayir | Hayir |
| Gorev bazli GO/NO-GO degerlendirme | Evet | Hayir | Hayir | Hayir | Hayir |
| Kullanim duyarli otomatik kisitlama | Evet | Yok | Yok | Yok | Hayir |
| Acik kaynak | Evet (MIT) | Hayir | Hayir | Evet | Kismi |
| MCP entegrasyonu | Evet (17 tool) | Yok | Yok | Yok | Yok |
| Web dashboard | Evet | Yerlesik | Yerlesik | Hayir | Hayir |
| Coklu provider destegi | Evet (Claude, Codex, Gemini) | Hayir | Hayir | Evet | Hayir |
| Cevrimdisi calisma (yerel modeller) | Planli | Evet | Hayir | Evet | Hayir |

---

## Platform Destegi

| Platform | Durum | Notlar |
|----------|-------|--------|
| Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch) | **TAM** | Birincil gelistirme platformu |
| macOS (12+) | **TAM** | Tum ozellikler desteklenir |
| Windows (WSL2 ile) | **TAM** | Onerilen Windows kurulumu -- Ubuntu/Debian WSL2 kullanin |
| Yerel Windows (cmd / PowerShell) | **TAM** | `shell:true` ile subprocess backend, periyodik heartbeat, UTF-8 destegi |

> **Windows kullanicilari:** Yerel Windows, subprocess backend ile tam olarak desteklenir. WSL2, tmux tabanli is akislari icin bir secenek olmaya devam eder. `deckent doctor` platform uyumlulugunu dogrular.

---

## Gereksinimler

| Gereksinim | Surum | Kontrol |
|------------|-------|---------|
| Node.js | >= 18 | `node --version` |
| git | herhangi | `git --version` |
| Claude Code CLI | herhangi | `claude --version` |
| tmux | herhangi (istege bagli) | `tmux -V` |
| OpenAI Codex CLI | herhangi (istege bagli) | `codex --version` |
| Google Gemini API | herhangi (istege bagli) | `GOOGLE_API_KEY` env var |

**Claude Aboneligi:** Pro, Max 5x, Max 20x veya API key (kullandikca ode). Diger provider'lar (Codex, Gemini) kendi API key'leriyle calisir.

**Desteklenen Isletim Sistemleri:** macOS, Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch), Windows (WSL2 ile)

---

## Kurulum

```bash
npm install -g deckent
```

Dogrulama:

```bash
deckent --version
deckent doctor
```

---

## CLI Kullanimi

### Proje Baslat

```bash
cd my-project
deckent init
```

Cikti:

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

### Sprint Baslat

```bash
# DIRECTIVES.md'ye hedeflerini yaz, sonra:
deckent start

# Calistirmadan plani onizle:
deckent start --dry-run

# Tum worker arac izinlerini otomatik onayla:
deckent start --auto-approve
```

### Durumu Kontrol Et

```bash
deckent status

# Her 2 saniyede otomatik yenile:
deckent status --watch

# Makine tarafindan okunabilir cikti:
deckent status --json
```

Ornek cikti:

```
Sprint sprint-001 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  001-001     EXECUTING   sonnet   5s ago
  001-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running
```

### Calistirmadan Planla

```bash
deckent plan
```

### Saglik Kontrolu

```bash
deckent doctor
```

Cikti:

```
  node_version   v20.11.0 (>=18 required)     [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
  claude_cli     claude 1.2.3                  [pass]
  workspace      .deckent/ found               [pass]
```

### Tum Komutlar

| Komut | Aciklama |
|-------|----------|
| `deckent init` | Etkilesimli kurulum sihirbazi |
| `deckent onboard` | Tam uyarlama (global + proje yapilandirmasi) |
| `deckent start` | Tam sprint yasam dongusunu calistir |
| `deckent plan` | Sonraki sprint'i planla (sadece planlama modu) |
| `deckent status` | Canli dashboard goster |
| `deckent attach` | tmux oturumuna baglan |
| `deckent spawn <id>` | Elle bir worker baslat |
| `deckent kill <id>` | Belirli bir worker'i durdur |
| `deckent retro` | Sprint retrospektifini calistir |
| `deckent cleanup` | Sprint dosyalarini arsivle ve worker'lari durdur |
| `deckent doctor` | Sistem sagligini kontrol et |
| `deckent config` | Yapilandirmayi goster/duzenle |
| `deckent config set <key> <value>` | Bir yapilandirma degerini ayarla |
| `deckent usage` | Mevcut plan kullanimini goster |
| `deckent history` | Sprint gecmisini ve metrikleri goster |
| `deckent plugin install <name>` | Bir plugin kur |
| `deckent plugin list` | Kurulu plugin'leri listele |
| `deckent analyze` | Proje stack'ini ve boyutunu analiz et |
| `deckent archive-debt` | Cozulmus teknik borcu arsivle |
| `deckent dashboard` | Terminal TUI dashboard |
| `deckent serve` | HTTP API sunucusunu baslat |
| `deckent web` | Web dashboard + API sunucusu (localhost:3100) |
| `deckent upgrade` | Deckent'i guncelle (beta icin `--local <path.tgz>`) |
| `deckent sync` | Adapter dosyalarini DECKENT.md ile senkronize et |
| `deckent watch` | Canli tmux bolunmus gorunum |
| `deckent test` | Proje testlerini calistir |
| `deckent set-directives` | Sprint directive'lerini ayarla |
| `deckent finalize` | Mevcut sprint'i sonlandir |
| `deckent run <cmd>` | Rastgele komut calistir |
| `deckent explain <topic>` | Bir kavram veya komutu acikla |
| `deckent quick-start` | Yeni projeler icin hizli baslangic sihirbazi |
| `deckent skill` | Kurulu skill'leri listele veya yonet |
| `deckent skill-marketplace` | Skill marketplace'i gezin ve kur |
| `deckent agent` | Agent havuzunu yonet (listele, incele, sifirla) |
| `deckent review` | Son sprint sonuclarini incele |
| `deckent config migrate` | Yapilandirmayi en son sema surumune tasi |

---

## MCP Entegrasyonu

Deckent, Model Context Protocol uzerinden Claude Code ile entegre olur. Kayit icin:

```bash
claude mcp add deckent -- npx deckent mcp
```

Veya `deckent init` otomatik olarak kayit yapsin.

### MCP Tool'lar (17)

| Tool | Aciklama |
|------|----------|
| `deckent_init` | Proje yapisini baslat |
| `deckent_set_directives` | Sprint hedeflerini DIRECTIVES.md'ye yaz |
| `deckent_plan` | Sprint planini onizle |
| `deckent_start` | Arka planda sprint baslat |
| `deckent_status` | Mevcut sprint durumunu getir |
| `deckent_doctor` | Saglik kontrollerini calistir |
| `deckent_retro` | Son retrospektifi oku |
| `deckent_history` | Sprint gecmisini goruntule |
| `deckent_analyze_project` | Proje stack'ini analiz et |
| `deckent_sync` | Adapter dosyalarini senkronize et |
| `deckent_config` | Yapilandirmayi goster veya guncelle |
| `deckent_usage` | Mevcut plan kullanimini goster |
| `deckent_review` | Son sprint sonuclarini incele |
| `deckent_run` | Proje baglaminda rastgele komut calistir |
| `deckent_kill` | Belirli bir worker'i durdur |
| `deckent_cleanup` | Sprint dosyalarini arsivle ve worker'lari temizle |
| `deckent_help` | Calisma zamani yetenekleri, durum bilgisi ve is akisi rehberi |

### MCP Resource'lar (9)

| Resource URI | Icerik |
|--------------|--------|
| `deckent://dashboard` | Canli sprint dashboard |
| `deckent://directives` | Mevcut DIRECTIVES.md |
| `deckent://memory` | Gecmis sprint'lerden ogrenilenler |
| `deckent://debt` | Teknik borc kalemleri |
| `deckent://config` | Proje yapilandirmasi |
| `deckent://retro` | Son sprint retrospektifi |
| `deckent://usage` | Mevcut plan kullanim metrikleri |
| `deckent://tasks` | Aktif gorev listesi ve durumlari |
| `deckent://agents` | Agent havuzu ve performans istatistikleri |

---

## Yapilandirma

Yapilandirma `.deckent/config.json` (proje) ve `~/.deckent/config.json` (global) dosyalarinda bulunur. Proje yapilandirmasi global'i gecersiz kilar.

### Temel Secenekler

| Secenek | Tip | Varsayilan | Aciklama |
|---------|-----|-----------|----------|
| `mode` | string | `"performance"` | Plan katmani: `performance`, `balanced`, `economic`, `api` |
| `language` | string | `"en"` | Cikti dili: `en`, `tr` |
| `projectName` | string | `"deckent-project"` | Dashboard ve loglar icin proje adi |
| `brain_planning` | string | `"auto"` | Planlama modu: `ai`, `structured`, `auto` |
| `brain_provider` | string | `"claude"` | Brain icin provider: `claude`, `codex`, `gemini` |
| `worker_provider` | string | `"claude"` | Worker'lar icin provider: `claude`, `codex`, `gemini` |
| `fallback_provider` | string | -- | Basarisizlikta yedek provider |
| `modes.<mode>.max_workers` | number | degisken | Maksimum paralel worker sayisi |
| `modes.<mode>.brain_model` | string | degisken | Brain'in planlama icin kullandigi model |
| `modes.<mode>.default_model` | string | degisken | Worker'lar icin varsayilan model |
| `modes.<mode>.haiku_allowed` | boolean | degisken | Brain'in haiku atayip atayamayacagi |

### Plan Katmanlari

| Katman | Maks Worker | Brain Model | Varsayilan Model |
|--------|-------------|-------------|------------------|
| `performance` | 8 | opus | opus |
| `balanced` | 5 | sonnet | opus |
| `economic` | 3 | sonnet | sonnet |
| `api` | 10 | opus | sonnet |

**Eski takma adlar:** `max_plan`, `max5x_plan`, `pro_plan` hala kabul edilir ve yeni katman adlarina otomatik tasinir.

### Coklu Provider Destegi

Deckent uc AI provider ile calisir. Rol bazli veya gorev bazli yapilandirilabilir:

| Provider | Modeller | Ortam Degiskeni |
|----------|----------|-----------------|
| Claude (varsayilan) | opus, sonnet, haiku | Oturum dogrulamasi veya `ANTHROPIC_API_KEY` |
| Codex (OpenAI) | gpt-5, gpt-4.1, gpt-5-mini | `OPENAI_API_KEY` |
| Gemini (Google) | gemini-2.5-pro, gemini-2.5-flash | `GOOGLE_API_KEY` |

Provider'lar arasi model esdegerligi: opus = gpt-5 = gemini-2.5-pro (premium), sonnet = gpt-4.1 = gemini-2.5-flash (standard), haiku = gpt-5-mini (economy).

Tam rehber icin [docs/reference/multi-provider.md](docs/reference/multi-provider.md) dosyasina bakin.

Tam yapilandirma referansi icin [docs/reference/config-reference.md](docs/reference/config-reference.md) dosyasina bakin.

---

## Web Dashboard

```bash
deckent web     # localhost:3100 adresinde acilir
```

React + Vite + Tailwind -- 4 sayfa (Dashboard, Ayarlar, Gecmis, Bellek), SSE gercek zamanli guncellemeler, koyu/acik tema.

---

## HTTP API

```bash
deckent serve   # Sadece API, localhost:3100
```

16 endpoint + SSE akisi. Tam referans icin [docs/reference/api.md](docs/reference/api.md) dosyasina bakin.

---

## Calisma Alani Yapisi

`deckent init` sonrasinda:

```
my-project/
  DECKENT.md             # Tek dogru kaynak (agent yapilandirmasi)
  DIRECTIVES.md          # Hedefleriniz -- her sprint oncesi duzenleyin
  CLAUDE.md              # Claude Code adaptoru
  AGENTS.md              # Genel agent adaptoru
  .deckent/
    config.json          # Calisma zamani yapilandirmasi
    workspace/           # Kimlik, araclar, baslangic sirasi
    docs/                # Yerlesik rehberler (hizli baslangic, directive, yapilandirma)
    agents/              # Agent havuzu (yerlesik + gecici agent'lar)
    skills/              # Skill kayit defteri (yerlesik + gecici skill'ler)
    plugins/             # Kurulu plugin'ler
    i18n/                # Dil dosyalari
  .brain/
    MEMORY.md            # Ogrenilenler (otomatik guncellenir)
    DEBT.md              # Teknik borc kaydi
    PATTERNS.md          # Tespit edilen desenler
    RETRO.md             # Son sprint retrospektifi
    DECISIONS.md         # Mimari kararlar
    sprints/             # Sprint bazli loglar
  .tasks/                # Task JSON dosyalari (Brain tarafindan yonetilir)
  .locks/                # Dosya kilitleri (worker'lar tarafindan yonetilir)
```

---

## Katkida Bulunma

Gelistirme ortami kurulumu, test rehberi, kod standartlari ve PR sureci icin [CONTRIBUTING.md](CONTRIBUTING.md) dosyasina bakin.

---

## Dokumantasyon

- [Hizli Baslangic Rehberi](docs/guide/quickstart.md)
- [API Referansi](docs/reference/api.md)
- [Yapilandirma Referansi](docs/reference/config-reference.md)
- [Coklu Provider Rehberi](docs/reference/multi-provider.md)
- [Mimari](docs/architecture/architecture.md)
- [Sprint Yasam Dongusu](docs/architecture/sprint-lifecycle.md)
- [MCP Rehberi](docs/reference/mcp-guide.md)
- [Plugin Rehberi](docs/development/plugin-guide.md)
- [Sorun Giderme](docs/development/troubleshooting.md)
- [SSS](docs/guide/faq.md)

---

## Lisans

MIT -- [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Web Sitesi:** [deckent.agency](https://deckent.agency)
