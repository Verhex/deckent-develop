<!-- Dil: TR | Teknik terimler EN -->

# deckent

**Disiplin isteyen geliştiriciler için AI orkestratör.**

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-16697%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-172%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent)
<!-- AUTOGEN:END id="badges" -->

Deckent, iki modlu bir AI agent orkestrasyon CLI'dir: geliştiriciler için yapılandırılmış çok-agent sprint'leri sunan **Sprint Mode** ve tek seferlik yaşam asistanı görevleri için **Task Mode**. Hedeflerinizi yazın; Deckent görevleri planlar, paralel AI worker'lar atar, kaliteyi izler ve sonuçları disiplinle teslim eder.

<!-- AUTOGEN:START id="stat-counts" -->
- **31 MCP tools** + **8 MCP resources**
- **15 built-in agents** (+2 custom)
- **21 built-in skills**
- **7 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->

> **AST-sandbox'lanmış skill'ler • Nervous System • Memory V2 (SQLite FTS5) • 3 backend • 3 provider • cross-platform**

<!-- ![demo](docs/assets/demo.gif) -->

---

## Hızlı Başlangıç

```bash
npm install -g deckent

# Geliştirici iş akışı (Sprint Mode)
deckent init
deckent mode sprint
# DIRECTIVES.md'ye hedeflerini yaz, sonra:
deckent start

# Yaşam asistanı (Task Mode)
deckent mode task
deckent run "Günün sonuna kadar PR'ı gözden geçirmeyi hatırlat"
```

---

## Sprint 166'da Yenilikler

- **ADR-046** — Brain Self-Update Hook Mimarisi: post-finalize hook zinciri (memoryExport → adrInsert → ruleRegen → updateProjectDocs) artık resmi olarak tanımlandı ve zorunlu hale getirildi.
- **Veri bütünlüğü kapanışı** — 100 debt satırına `sprint_id` geri dolduruldu, 9 sprint memory kaydı tamamlandı, doc-sync ground-truth doğrulaması (3 katmanlı savunma) gelecekteki agent sayısı sapmalarını engelliyor.

---

## İki Mod: Sprint + Task

Deckent tek bir komutla iki farklı modda çalışır:

| Mod | Komut | Kullanım Alanı |
|-----|-------|----------------|
| **Sprint** | `deckent mode sprint` | Yapılandırılmış çok-agent geliştirme: PLAN→SPAWN→EXECUTE→EVALUATE→RETRO |
| **Task** | `deckent mode task` | Tek seferlik yaşam asistanı: tek görev, anlık çalıştırma, sprint yükü yok |

```bash
deckent mode show           # Mevcut modu göster
deckent mode sprint         # Sprint moduna geç (geliştirici iş akışı)
deckent mode task           # Task moduna geç (yaşam asistanı)
deckent mode auto           # Bağlama göre otomatik tespit (git + DIRECTIVES.md → sprint)
deckent mode global task    # Global varsayılanı ayarla
```

`deckent_style` config anahtarı tercihinizi oturumlar arasında saklar. Task Mode, tam yaşam asistanı deneyimi sunar — tek seferlik görevler, boşta kalma tespiti ve bağlayıcı bildirimler.

---

## Nasıl Çalışır

### Sprint Mode

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

1. **Tanımla** — `DIRECTIVES.md` dosyasına hedeflerini yaz
2. **Planla** — Brain hedefleri okur, kapsamlı öncelikli görevler oluşturur
3. **Çalıştır** — Paralel AI worker'lar kodu yazar, test eder ve sonuçları raporlar
4. **Değerlendir** — Her görev GO / NO-GO / TECH_DEBT kararı alır

### Task Mode

```
  Kullanıcı Girdisi → [ Task Runner ] → Worker → Sonuç
```

Tek görev yürütme. PLAN/SPAWN fazları yok. Hızlı komutlar, hatırlatmalar ve yaşam asistanı kullanım senaryoları için idealdir.

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
|   (bellek DB,        (task JSON,      (canlı durum)              |
|    kararlar,          sonuçlar,                                  |
|    desenler)          heartbeat'ler)                             |
+------------------------------------------------------------------+
|         Nervous System — Proaktif Meta-Orkestratör              |
+------------------------------------------------------------------+
```

- **Brain** — Görevleri planlar, modelleri atar, sonuçları değerlendirir, sprint'ler arası öğrenir
- **Workers** — Görevleri paralel yürütür (tmux, subprocess veya Docker); plan-kod-test-rapor döngüsü
- **Auditor** — Heartbeat'leri izler, sınır ihlallerini tespit eder, kaliteyi denetler
- **Nervous System** — Proaktif meta-orkestratör: anomali tespiti, boşta kalma durumu, routing desenleri, bağlamsal bildirimler

---

## Temel Özellikler

### Çekirdek Orkestrasyon
- **Sprint Yaşam Döngüsü** — 8 fazlı yapılandırılmış döngü: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP
- **İki Mod** — `deckent_style: 'sprint' | 'task'` — geliştirici orkestrasyonu veya tek seferlik yaşam asistanı
- **Çoklu Worker Paralel Çalıştırma** — Aynı anda 10'a kadar AI worker, her biri izole kapsamda
- **GO / NO-GO Değerlendirme** — Her görev sonucu belirlenen kriterlere göre değerlendirilir; NO-GO görevler kaydedilir ve isteğe bağlı yeniden denenir
- **Auditor Kalite Kapısı** — Stale heartbeat tespiti, sınır ihlali taraması, Kahn algoritması ile kilitlenme tespiti

### Güvenlik ve Emniyet
- **AST Sandbox** — Tüm skill'ler çalıştırılmadan önce AST doğrulamasından geçer. Keyfi kod enjeksiyonu yok. OpenClaw'ın 13K+ skill hub'ında yaklaşık %20'si zararlı olarak işaretlenirken, Deckent'in sandbox'ı her skill'i çalıştırmadan önce doğrular
- **Kapsam Zorunluluğu** — Worker'lar yalnızca atanan `scope.filesWrite` kapsamındaki dosyalara dokunabilir — Auditor bunu `git diff --stat` ile denetler
- **RBAC Protokolü** — ADR-037 Brain-Auditor-Worker yetki matrisi; kesin rol sınırları
- **`.deck` Gizli Bilgi Interpolasyonu** — Config'de `$DECK:BENIM_TOKEN` olarak gizli bilgilere başvurun — sırlar runtime'da şifreli `.deck` dosyasından yüklenir, asla commit edilmez

### Zeka ve Bellek
- **Nervous System** — Proaktif meta-orkestratör (ADR-040): boşta kalma tespiti, routing anomali uyarıları, agent sağlık izleme, bağlamsal bildirimler
- **Memory V2 DB-First** — SQLite + FTS5 tam metin arama, çift katmanlı Türkçe/İngilizce normalize, ham markdown'a göre %96 bağlam azaltımı. `deckent recall "docker heartbeat"` ile ilgili ADR'ler ve sprint öğrenimleri anında bulunur
- **Brain Otomatik Sorgu** — Görev DNA'sı → ilgili ADR'ler/desenler/öğrenimler PLAN, SPAWN, EVALUATE fazlarında otomatik sorgulanır
- **Öz-Öğrenme** — Brain, sprint sonuçlarından (NO_GO oranı, coverage, süre) config önerileri üretir

### Agent'lar ve Skill'ler
- **15 Yerleşik Agent** — security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist
- **21 Yerleşik Skill** — typescript-expert, testing-expert, react-specialist, security-specialist, docker-expert ve 16'sı daha
- **Temp Agent ve Skill Üretimi** — Kod tabanı konvansiyonlarından projeye özel agent ve skill'ler otomatik üretir
- **Agent Evrim Pipeline'ı** — Performansa dayalı temp'ten kalıcıya terfi; başarısızlıkta geri alım

### Altyapı
- **3 Backend** — tmux (Linux/macOS), subprocess (native Windows dahil tüm platformlar), Docker (izole container'lar)
- **3 Provider** — Claude (varsayılan), OpenAI Codex, Google Gemini — 13 model, 4 katman
- **Katman Tabanlı Routing** — Model adları yerine `brain_tier: 'premium'`; ModelRegistry, provider'a göre en uygun modeli seçer
- **Yapılandırılabilir Timeout'lar** — Görev ve sprint bazlı timeout, `sprint_timeout_minutes: 0` sınırsız için
- **Human Checkpoint'ler** — Plan, evaluate, fix fazlarında yapılandırılabilir onay noktaları
- **MCP Entegrasyonu** — Claude Code IDE entegrasyonu için 31 tool + 8 resource
- **Web Dashboard** — React + Vite + Tailwind, 7 sayfa, SSE gerçek zamanlı güncellemeler, TR/EN dil değiştirici

### Cross-Platform
- **Linux** — Tam (Ubuntu 20+, Debian 11+, Fedora 38+, Arch)
- **macOS** — Tam (12+)
- **Windows WSL2** — Tam (tmux iş akışları için önerilir)
- **Native Windows** — Tam (subprocess backend, `shell:true`, UTF-8 desteği)

---

## Karşılaştırma

> Nisan 2026 — ayrıntılı karşılaştırma için [tam rekabet analizi](docs/analysis/competitive-analysis.md) sayfasına bakın.

| Özellik | **deckent** | Cursor Agents | Devin | OpenClaw | Claude Code |
|---------|-------------|--------------|-------|----------|-------------|
| Sprint yaşam döngüsü (8 faz) | **Evet** | Hayır | Kısmi | Hayır | Hayır |
| Çoklu agent paralel çalıştırma | **Evet** (10 worker) | Sınırlı | Evet | Evet (100+ AgentSkill) | Hayır |
| Hedeflerden otomatik görev planlama | **Evet** (AI + structured) | Hayır | Evet | Hayır | Hayır |
| Skill'ler için AST sandbox | **Evet** | Hayır | Hayır | Hayır | Hayır |
| Sınır denetimli kalite auditor | **Evet** | Hayır | Hayır | Hayır | Hayır |
| Nervous System (proaktif meta-orkestratör) | **Evet** | Hayır | Hayır | Hayır | Hayır |
| Memory V2 (SQLite FTS5, sprint'ler arası öğrenme) | **Evet** | Hayır | Hayır | 3rd party | Hayır |
| İki mod (sprint + task) | **Evet** | Hayır | Hayır | Hayır | Hayır |
| `.deck` gizli bilgi interpolasyonu | **Evet** | Hayır | Hayır | Hayır | Hayır |
| Görev bazlı GO/NO-GO değerlendirme | **Evet** | Hayır | Hayır | Hayır | Hayır |
| Açık kaynak | **Evet** (MIT) | Hayır | Hayır | Evet (OSS) | Hayır |
| MCP entegrasyonu | **Evet** (31 tool, 8 resource) | Kısmi | Hayır | Sınırlı | Native |
| Web dashboard | **Evet** (7 sayfa) | Yerleşik | Yerleşik | Hayır | Hayır |
| Çoklu provider (Claude, Codex, Gemini) | **Evet** | Hayır | Hayır | Sınırlı | Hayır |
| Yerleşik agent sayısı | **15** | — | — | 100+ | — |
| Yerleşik skill sayısı | **21** | — | — | 13K+ (hub, ~%20 zararlı) | — |
| Test coverage | **%89.33** | — | — | — | — |
| Fiyat | **Ücretsiz (MIT)** | $20-40/ay | $20-500/ay | Ücretsiz | Ücretsiz |

---

## Gereksinimler

| Gereksinim | Sürüm | Kontrol |
|------------|-------|---------|
| Node.js | >= 18 | `node --version` |
| git | herhangi | `git --version` |
| Claude Code CLI | herhangi | `claude --version` |
| tmux | herhangi (isteğe bağlı, Linux/macOS) | `tmux -V` |
| OpenAI Codex CLI | herhangi (isteğe bağlı) | `codex --version` |
| Google Gemini API | herhangi (isteğe bağlı) | `GOOGLE_API_KEY` env var |

**Claude Aboneliği:** Pro, Max 5x, Max 20x veya API key (kullandıkça öde). Diğer provider'lar (Codex, Gemini) kendi API key'leriyle çalışır.

---

## Kurulum

```bash
npm install -g deckent
```

Doğrulama:

```bash
deckent --version    # 1.0.0-beta.1
deckent doctor
```

---

## CLI Kullanımı

### Proje Başlat

```bash
cd my-project
deckent init
```

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

### Modunu Ayarla

```bash
deckent mode sprint   # Geliştirici orkestrasyonu (varsayılan)
deckent mode task     # Yaşam asistanı (tek seferlik görevler)
deckent mode auto     # Bağlama göre otomatik tespit
```

### Sprint Başlat (Sprint Mode)

```bash
# DIRECTIVES.md'ye hedeflerini yaz, sonra:
deckent start

# Çalıştırmadan planı önizle:
deckent start --dry-run

# Tüm worker araç izinlerini otomatik onayla:
deckent start --auto-approve
```

### Tek Seferlik Görev Çalıştır (Task Mode)

```bash
deckent mode task
deckent run "İndirme klasörünü dosya türüne göre düzenle"
deckent run "GitHub issue'sundaki bellek sızıntısı sorusuna yanıt taslağı oluştur"
```

### Durumu Kontrol Et

```bash
deckent status
deckent status --watch   # Her 2 saniyede otomatik yenile
deckent status --json    # Makine tarafından okunabilir çıktı
```

```
Sprint sprint-149 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  149-001     EXECUTING   sonnet   5s ago
  149-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running
```

### Belleği Sorgula

```bash
deckent recall "docker heartbeat"              # Cross-source FTS5 arama
deckent recall "ADR-037 RBAC"                 # Mimari kararları bul
deckent remember "Cuma'ya kadar deploy dondurulmuş"  # Not kaydet
deckent memory stats                           # Bellek DB istatistikleri
deckent memory export                          # DB → .md anlık görüntü dışa aktar
```

### Sağlık Kontrolü

```bash
deckent doctor
```

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
| `deckent mode [show\|sprint\|task\|auto\|global]` | Çalışma modunu al/ayarla |
| `deckent start` | Tam sprint yaşam döngüsünü çalıştır |
| `deckent plan` | Sonraki sprint'i planla (sadece planlama modu) |
| `deckent status` | Canlı dashboard göster |
| `deckent run <cmd>` | Görev çalıştır (task modunda tek seferlik, sprint modunda kuyruğa ekler) |
| `deckent attach` | tmux oturumuna bağlan |
| `deckent spawn <id>` | Elle bir worker başlat |
| `deckent kill <id>` | Belirli bir worker'ı durdur |
| `deckent retro` | Sprint retrospektifini oku |
| `deckent cleanup` | Sprint dosyalarını arşivle ve worker'ları durdur |
| `deckent doctor` | Sistem sağlığını kontrol et |
| `deckent audit <sprint-id>` | Bir sprint için Brain Self-Audit Gate çalıştır |
| `deckent recover <sprint-id>` | Çökmüş veya yarım kalmış sprint'i kurtar |
| `deckent config` | Yapılandırmayı göster/düzenle |
| `deckent config set <key> <value>` | Bir yapılandırma değerini ayarla |
| `deckent history` | Sprint geçmişini ve metrikleri göster |
| `deckent analyze` | Proje stack'ini ve boyutunu analiz et |
| `deckent dashboard` | Terminal TUI dashboard |
| `deckent serve` | HTTP API sunucusunu başlat |
| `deckent web` | Web dashboard + API sunucusu (localhost:3100) |
| `deckent recall <sorgu>` | Proje belleğini ara (ADR'ler, öğrenimler, borç) |
| `deckent remember <not>` | Belleğe not kaydet |
| `deckent memory [rebuild\|export\|stats]` | Bellek DB yönetimi |
| `deckent skill` | Kurulu skill'leri listele veya yönet |
| `deckent skill publish <yol>` | DeckentHub'a skill yayınla (Ed25519 imzalı) |
| `deckent features [--category]` | Özellik manifestini listele (active\|dormant\|dead\|all) |
| `deckent agent` | Agent havuzunu yönet (listele, incele, sıfırla) |
| `deckent review` | Son sprint sonuçlarını incele |
| `deckent upgrade` | Deckent'i güncelle (beta için `--local <path.tgz>`) |
| `deckent sync` | Adapter dosyalarını DECKENT.md ile senkronize et |
| `deckent explain <konu>` | Bir kavram veya komutu açıkla |
| `deckent heartbeat` | Tek seferlik heartbeat kontrolü (`--daemon` arka planda) |
| `deckent checkpoint` | Human checkpoint'leri onayla/reddet |

---

## MCP Entegrasyonu

Deckent, Model Context Protocol üzerinden Claude Code ile entegre olur:

```bash
claude mcp add deckent -- npx deckent mcp
```

Veya `deckent init` otomatik olarak kayıt yapsın.

### MCP Tool'lar (31)

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
| `deckent_kill` | Belirli bir worker'ı durdur |
| `deckent_cleanup` | Sprint dosyalarını arşivle ve worker'ları temizle |
| `deckent_help` | Çalışma zamanı yetenekleri, durum bilgisi ve iş akışı rehberi |
| `deckent_agent_list` | Kayıtlı agent'ları listele (yerleşik ve geçici) |
| `deckent_skill_list` | Kayıtlı skill'leri manifest bilgisiyle listele |
| `deckent_checkpoint` | Human checkpoint'leri onayla/reddet |
| `deckent_docs` | Yerleşik dokümantasyonu yönet ve sun |
| `deckent_explain` | Sprint geçmişini ve sonuçlarını açıkla |
| `deckent_memory_query` | Cross-source bellek araması (ADR, sprint, borç, desen) |
| `deckent_audit` | Herhangi bir sprint için Brain Self-Audit Gate çalıştır (READ-ONLY) |
| `deckent_recover` | Çökmüş veya takılmış sprint'i kurtar (DESTRUCTIVE) |
| `deckent_feature_query` | Özellik manifestini sorgula (active/dormant/dead/all) |
| `deckent_watch` | Sprint event'lerini gerçek zamanlı akış olarak izle |
| `deckent_nervous_subscribe` | Nervous System bildirimlerine abone ol |
| `deckent_nervous_accept` | Bekleyen nervous bildirimini kabul et |
| `deckent_nervous_reject` | Bekleyen nervous bildirimini reddet |
| `deckent_nervous_status` | Nervous System mevcut durumu |
| `deckent_nervous_config` | Nervous detector'ları yapılandır |

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
| `deckent_style` | string | `"sprint"` | Çalışma modu: `sprint` (geliştirici) veya `task` (yaşam asistanı) |
| `mode` | string | `"performance"` | Plan katmanı: `performance`, `balanced`, `economic`, `api` |
| `language` | string | `"en"` | Çıktı dili: `en`, `tr` |
| `brain_planning` | string | `"auto"` | Planlama modu: `ai`, `structured`, `auto` |
| `brain_provider` | string | `"claude"` | Brain için provider: `claude`, `codex`, `gemini` |
| `worker_provider` | string | `"claude"` | Worker'lar için provider: `claude`, `codex`, `gemini` |
| `fallback_provider` | string | — | Başarısızlıkta yedek provider |
| `spawn_backend` | string | `"tmux"` | Worker backend: `tmux`, `subprocess`, `docker` |
| `sprint_timeout_minutes` | number | `60` | Sabit sprint timeout; `0` sınırsız için |

### Plan Katmanları

| Katman | Maks Worker | Brain Model | Varsayılan Model |
|--------|-------------|-------------|------------------|
| `performance` | 8 | opus | opus |
| `balanced` | 5 | sonnet | opus |
| `economic` | 3 | sonnet | sonnet |
| `api` | 10 | opus | sonnet |

### Çoklu Provider Desteği

| Provider | Modeller | Ortam Değişkeni |
|----------|----------|-----------------|
| Claude (varsayılan) | opus, sonnet, haiku | Oturum doğrulaması veya `ANTHROPIC_API_KEY` |
| Codex (OpenAI) | o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini | `OPENAI_API_KEY` |
| Gemini (Google) | gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | `GOOGLE_API_KEY` |

**3 provider'da 13 model.** Katman eşdeğerliği: `premium_plus` (o3, gemini-3.1-pro-preview), `premium` (opus, gpt-5, gemini-2.5-pro), `standard` (sonnet, gpt-4.1, o4-mini, gemini-2.5-flash), `economy` (haiku, gpt-5-mini, gpt-4.1-mini, gemini-2.0-flash).

Tam rehber için [docs/reference/multi-provider.md](docs/reference/multi-provider.md) dosyasına bakın.

### `.deck` Gizli Bilgi Interpolasyonu

Gizli bilgileri commit etmeden config'de kullanın:

```json
{
  "connectors": {
    "discord": { "enabled": true, "token": "$DECK:DISCORD_TOKEN" },
    "telegram": { "enabled": true, "token": "$DECK:TELEGRAM_TOKEN" }
  }
}
```

Sırlar runtime'da `.deck` dosyasından yüklenir. `.deck` dosyası varsayılan olarak gitignore'dur.

Tam yapılandırma referansı için [docs/reference/config-reference.md](docs/reference/config-reference.md) dosyasına bakın.

---

## Docker Backend (İzole Worker'lar)

Worker'lar izole Docker container'larında çalışır — worker'lar arası dosya çakışması olmaz.

```bash
docker build -f Dockerfile -t deckent-worker:latest .
npx deckent config set spawn_backend docker
```

- Proje read-only olarak mount edilir (`/workspace`)
- `.tasks/` read-write olarak mount edilir (sonuçlar, heartbeat'ler)
- Root olmayan kullanıcı ile çalıştırma (`deckent` kullanıcısı)
- Ayarlanabilir timeout: `npx deckent config set docker_timeout 1800` (varsayılan: 1200s)

Tam rehber için [docs/guide/docker-backend.md](docs/guide/docker-backend.md) dosyasına bakın.

---

## Nervous System

Nervous System, sprint'lerle birlikte çalışan proaktif bir meta-orkestratorüdür:

<!-- ![deckent nervous TUI](docs/assets/nervous-tui.png) -->
> Ekran görüntüsü Sprint 151'de gelecek — canlı TUI için `deckent nervous`

- **Detector'lar** — Stale task'lar, boşta kalma durumu (task mode), routing anomalileri, agent sağlığı için tak-çalıştır detector'lar
- **Bildirimler** — Event bus üzerinden bağlamsal uyarılar; Sprint 149+ ile Discord/Telegram connector'lar
- **Task Mode Boşta Kalma** — Task modunda, 5 dakikadan uzun inaktvitede bildirim gönderir
- **Proaktif** — Polling gerekmez; detector'lar cron event'leri ve sprint yaşam döngüsü event'lerinde çalışır

---

## Web Dashboard

```bash
deckent web   # localhost:3100 adresinde açılır
```

React + Vite + Tailwind — 7 sayfa (Chat, Config, Dashboard, Geçmiş, Bellek, Ayarlar, Durum), SSE gerçek zamanlı güncellemeler, koyu/açık tema, TR/EN dil değiştirici.

<!-- ![dashboard ekran görüntüsü](docs/assets/dashboard.png) -->
> Tam ekran görüntüsü galerisi Sprint 151'de gelecek

---

## Çalışma Alanı Yapısı

`deckent init` sonrasında:

```
my-project/
  DECKENT.md              # Tek doğru kaynak (agent yapılandırması)
  DIRECTIVES.md           # Hedefleriniz — her sprint öncesi düzenleyin
  CLAUDE.md               # Claude Code adaptörü
  AGENTS.md               # Genel agent adaptörü
  .deckent/
    config.json           # Çalışma zamanı yapılandırması (deckent_style, mode, provider'lar)
    workspace/            # Kimlik, araçlar, başlangıç sırası
    docs/                 # Yerleşik rehberler (hızlı başlangıç, directive, yapılandırma)
    agents/               # Agent havuzu (yerleşik + geçici agent'lar, LRU eviction)
    skills/               # Skill kayıt defteri (yerleşik + geçici skill'ler, AST doğrulandı)
    plugins/              # Kurulu plugin'ler
    i18n/                 # Dil dosyaları (en, tr)
  .brain/
    memory.db             # SQLite DB — tek doğru kaynak (gitignored)
    exports/
      summary.md          # Otomatik oluşturulmuş bağlam özeti (git-tracked)
      decisions.md        # ADR listesi (git-tracked)
      memory.md           # Sprint öğrenimleri (git-tracked)
      debt.md             # Teknik borç (git-tracked)
    archive/              # Sprint bazlı loglar
  .tasks/                 # Task JSON dosyaları (Brain tarafından yönetilir)
  .locks/                 # Dosya kilitleri (worker'lar tarafından yönetilir)
  .deck                   # Gizli bilgi dosyası (gitignored — $DECK:ANAHTAR referansları)
```

---

## Kilitlenme Kurtarma

Deckent kendini nasıl kurtaracağını bilir — ve size de araçları verir.

```bash
# Herhangi bir geçmiş sprint için Brain Self-Audit Gate çalıştır
deckent audit sprint-150

# Çökmüş veya yarım kalmış sprint'i kurtar (etkileşimli, yıkıcı işlemler öncesi onay ister)
deckent recover sprint-150 --dry-run   # neyin temizleneceğini önizle
deckent recover sprint-150             # kurtarmayı çalıştır
```

```
Gate: PASS
tsc: pass, vitest: pass
Written: .deckent/sprint-150-gate.json
```

Bir sprint çalışma ortasında çökerse (ağ kesintisi, OOM, koordinatör paniği), `deckent recover` tek bir komutla audit + orphan temizleme + stale lock temizleme + task arşivleme işlemlerini yapar.

---

## DeckentHub — Skill Kayıt Defteri

DeckentHub, her skill'in şu özelliklere sahip olduğu seçici bir skill kayıt defteridir:
- **AST-sandbox'lanmış** — Çalıştırılmadan önce doğrulandı, keyfi kod enjeksiyonu yok
- **Ed25519 imzalı** — Yazar tarafından kriptografik olarak imzalandı
- **CI doğrulandı** — GitHub Actions her PR'da sandbox + imzayı doğrular

```bash
deckent skill publish ./my-skill   # İmzala + DeckentHub'a gönder
```

Hub, Sprint 150'de 20 seed skill ile başlatılıyor: spotify-control, telegram-bot, discord-moderator, calendar-google ve 16'sı daha.

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
- [Docker Backend Rehberi](docs/guide/docker-backend.md)
- [Sorun Giderme](docs/development/troubleshooting.md)
- [SSS](docs/guide/faq.md)

---

## Lisans

MIT — [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Web Sitesi:** [deckent.agency](https://deckent.agency)
