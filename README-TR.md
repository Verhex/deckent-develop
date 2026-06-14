<!-- Dil: TR | Teknik terimler EN kalır -->

<p align="center">
  <img src="docs/assets/logo.png" width="140" alt="deckent — devre kraken amblemi" />
</p>

<h1 align="center">deckent</h1>

<p align="center"><strong>Gerçekten teslim eden — ve hatırlayan AI geliştirme ekibi.</strong></p>

<!-- AUTOGEN:START id="badges" -->
<p align="center">
<a href="https://www.npmjs.com/package/deckent"><img src="https://img.shields.io/npm/v/deckent.svg" alt="npm version" /></a>
<a href="https://github.com/VerhexIO/deckent"><img src="https://img.shields.io/badge/tests-22800%2B-brightgreen" alt="tests" /></a>
<a href="https://github.com/VerhexIO/deckent"><img src="https://img.shields.io/badge/coverage-88%25-brightgreen" alt="coverage" /></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" /></a>
<a href="https://github.com/VerhexIO/deckent"><img src="https://img.shields.io/badge/sprints-285%2B-teal" alt="sprints" /></a>
<a href="https://github.com/VerhexIO/deckent"><img src="https://img.shields.io/badge/version-v1.0.0--beta.1-orange" alt="version" /></a>
<a href="https://github.com/VerhexIO/deckent/actions"><img src="https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci" alt="CI" /></a>
</p>
<!-- AUTOGEN:END id="badges" -->

---

**deckent**, düz dille yazdığınız bir hedefi çalışan, test edilmiş yazılıma dönüştürür.

Ne istediğinizi `DIRECTIVES.md`'ye yazarsınız. deckent işi planlar, **10 AI worker'a kadar paralel** olarak — her biri kendi izole kapsamında — çalıştırır, **her** sonucu GO / NO-GO kriterlerine göre değerlendirir, başarısız olanı yeniden dener ve öğrendiklerini bir veritabanına yazarak **bir sonraki** çalışmayı daha akıllı yapar. İstediğiniz modeli getirin — zaten ödediğiniz bir `claude` / `codex` / `gemini` aboneliği, herhangi bir OpenAI-uyumlu API ya da **sıfır API anahtarıyla tamamen yerel bir Ollama modeli**.

Bu, tek bir dosyayı tahmin eden yalnız bir asistan değildir. Gerçek bir yaşam döngüsü, gerçek kalite kapıları ve büyüyen bir belleği olan disiplinli, çok-agent'lı bir motordur.

```bash
npm install -g deckent
deckent init          # projenizi kurun
deckent               # onunla konuşun — ya da DIRECTIVES.md yazıp `deckent start`
```

---

## deckent'i farklı kılan ne

| | |
|---|---|
| **Prompt değil, gerçek bir yaşam döngüsü** | Her çalışma 8 fazlı bir sprint'tir: `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`. Hiçbir şey "tek-atış ve umut et" değildir. |
| **Paralel, kapsamlı, bağımlılık-farkında** | Aynı anda 10 worker çalışır. Bir dependency graph (Kahn topolojik sıralama) onları dalgalara böler — bağımsız görevler birlikte koşar, bağımlılar yalnız girdileri DONE olunca açılır. |
| **Her sonuç yargılanır** | Brain her görevi değerlendirir: `GO`, `NO-GO` veya `GO_WITH_TECH_DEBT` — rubric skorlama ve kullanıcıya-dönük değişiklikler için gerçek-binary proof-of-function ile. Başarısızlıklar FIX fazında, hatayı bağlam olarak alıp yeniden denenir. |
| **Büyüyen bellek** | Öğrenimler, mimari kararlar, desenler ve borç bir SQLite veritabanına (FTS5 tam-metin, TR/EN/DE-farkında) kaydedilir. Sonraki sprint ilgili olanı otomatik hatırlar. `deckent recall "docker heartbeat"` onu anında arar. |
| **Mimari önerilmez, uygulanır** | 89 Architecture Decision Record (ADR) her worker'ın prompt'una bağlayıcı kısıt olarak enjekte edilir. Bir ADR'yi ihlal edecek worker durur ve bunun yerine bir değişiklik önerir. |
| **Tasarımdan provider-bağımsız** | Vendor kilidi yok. Zaten sahip olduğunuz aboneliklerle tüm bir karışık-filoyu — Claude brain + Codex/Gemini worker'lar — **token başına API faturası olmadan** çalıştırın. Ya da Ollama ile tamamen yerel gidin. |

---

## Hızlı başlangıç

İki dakikadan kısa sürede bir sprint çalıştırın.

```bash
# 1 — Kurulum
npm install -g deckent          # veya: npx deckent@latest init

# 2 — Başlatma (.deckent/, .brain/, DIRECTIVES.md, CLAUDE.md adapter oluşturur)
cd benim-projem
deckent init

# 3 — Nasıl çalışmak istediğinizi seçin:

# A) Konuşarak — sadece onunla konuşun
deckent

# B) Yapılandırılmış sprint
#    DIRECTIVES.md'yi hedeflerinizle düzenleyin, sonra:
deckent start                   # planla → spawn → execute → evaluate
deckent status --watch          # canlı ilerleme

# C) Web paneli
deckent serve                   # http://localhost:3100
```

`deckent init` dilinizi, teknoloji yığınınızı ve hangi provider CLI'larının kurulu olduğunu otomatik tespit eder — ve onayınızla eksikleri kurmaya yardım eder.

---

## Bir sprint nasıl çalışır

```
                 DIRECTIVES.md  (hedefleriniz, düz dille)
                         │
                  ┌──────▼──────┐
                  │    BRAIN     │   hedefleri + belleği okur, kapsamlı görevler
                  │  (plan)      │   planlar; model · agent · skill · provider atar
                  └──────┬──────┘
            dalga 1   ┌──┼───┐   dalga 2 (dalga 1 = DONE olunca açılır)
                 ┌───▼─┐ ┌─▼───┐ ┌─────┐
                 │ W1  │ │ W2  │ │ W3  │   paralel, her biri izole kapsamda
                 └───┬─┘ └─┬───┘ └──┬──┘   (Docker / tmux / subprocess)
                     └──────┼───────┘
                  ┌─────────▼────────┐         ┌──────────────────┐
                  │ BRAIN (evaluate) │◄────────┤  AUDITOR (tara)   │
                  │  GO / NO-GO /    │         │  kalp atışı,      │
                  │  TECH_DEBT       │         │  kapsam ihlali    │
                  └─────────┬────────┘         └──────────────────┘
                  NO-GO ──► FIX (bağlamla retry)    DONE ──► RETRO ──► BELLEK
```

1. **Tanımla** — hedefleri `DIRECTIVES.md`'ye yaz (ya da `deckent chat` seninle birlikte taslaklasın).
2. **Planla** — Brain hedeflerini *artı* ilgili geçmiş öğrenimleri okur, sonra kapsamlı, öncelikli, bağımlılık-sıralı görevler yazar.
3. **Uygula** — paralel worker'lar inşa eder, test eder, raporlar. Her biri kendi dosyalarına kilitlidir; Auditor sınırları gerçek zamanlı izler.
4. **Değerlendir** — her görev bir karar alır. NO-GO görevler yeniden denenir. Sprint asla yarım bırakılmaz.
5. **Hatırla** — öğrenimler, kararlar ve borç belleğe yazılır ve bir sonraki sefer otomatik hatırlanır.

Tek-atış mı istiyorsunuz? **Task modu** (`deckent mode task`) sprint mekanizmasını atlar ve tek bir isteği uçtan uca çalıştırır — hızlı komutlar ve yaşam-asistanı kullanımı için ideal.

---

## Özellikler

### Orkestrasyon
- **8 fazlı sprint yaşam döngüsü** — PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP
- **Paralel çok-worker çalıştırma** — 10 worker'a kadar, her biri izole kapsamda
- **Dependency pipeline** — görevler Kahn topolojik sıralamayla dalgalara dizilir; bağımlılar yalnız girdileri DONE olunca açılır
- **Üç spawn backend, worker-bazlı** — Docker (izole, graceful shutdown), tmux veya subprocess — her worker bağımsız bir backend *ve provider* koşabilir
- **GO / NO-GO / TECH_DEBT değerlendirmesi** — rubric skorlama, code-verified-done mantığı, dürüst tech-debt indirimleri
- **FIX fazı** — başarısız görevler hatayı bağlam alıp yeniden denenir; çapraz-bağımlılık önceliği
- **Çökme kurtarma** — checkpoint/resume takılan bir sprint'i geri yükler; orphan-görev yeniden-değerlendirme

### Bellek ve zeka
- **Memory V2 (DB-first)** — SQLite + FTS5 tam-metin arama, çift katmanlı Türkçe/İngilizce/Almanca normalize; `.md` dosyaları üretilen export'tur, veritabanı tek doğruluk kaynağıdır
- **`deckent recall` / `remember`** — ADR'ler, sprint öğrenimleri, desenler ve borç boyunca anında arama ve not alma
- **Brain auto-query** — Task DNA → ilgili ADR'ler, desenler ve öğrenimler PLAN, SPAWN ve EVALUATE'te otomatik çekilir
- **ADR yönetişimi** — 89 Architecture Decision Record (MADR v3) worker prompt'larına bağlayıcı kısıt olarak enjekte edilir ve CI'da doğrulanır
- **Routing Engine V2** — çok-sinyalli skorlama görev başına doğru agent + skill + provider'ı atar; sonuçlar bir öğrenme döngüsünü besler
- **Evolution pipeline** — geçici agent/skill'ler performansla kalıcı havuza terfi eder, başarısızlıkla düşer
- **Nervous System** — boşta worker, routing anomalisi, kapsam çakışması, agent-sağlık düşüşü ve borç trendi izleyip aksiyon öneren proaktif meta-orkestratör

### Agent'lar ve skill'ler
- **15 yerleşik agent** — security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist
- **21 yerleşik skill** — typescript-expert, testing-expert, react-specialist, security-specialist, docker-expert, python-expert, anthropic-sdk ve daha fazlası
- **Plugin sistemi** — `.deckent/plugins/`'e bir `manifest.json` + `SKILL.md` bırakarak yeniden kullanılabilir yetenek ekleyin

### Provider özgürlüğü
- **Birinci-sınıf abonelik CLI'ları** — `claude` (Anthropic), `codex` (OpenAI), `gemini` (Google). Bir CLI kurulu ve giriş yapılmışsa deckent worker'larını aboneliğinizle sürer — API anahtarı yok, token-başı maliyet yok
- **OpenAI-uyumlu API'ler** — DeepSeek, Qwen, GLM, OpenRouter, vLLM ve benzerleri, tek bir adapter üzerinden
- **Tamamen yerel Ollama** — sıfır API anahtarı, sıfır bulut çağrısı
- **Karışık filolar** — aynı sprint'te Claude brain + Codex/Gemini worker'lar; görev başına seçin ya da Brain yönlendirsin
- **Model registry** — tek doğruluk kaynağı: 13 model, 4 tier, provider-agnostik tier eşdeğerliği

### Güvenlik ve kalite
- **Kapsam uygulaması** — worker'lar yalnız atanmış `scope.filesWrite` içine yazabilir; Auditor `git diff --stat` ile izler
- **RBAC yetki matrisi** — ADR-037 Brain ↔ Auditor ↔ Worker rolleri, kurcalama-belirten denetim kaydıyla
- **AST sandbox** — her skill çalışmadan önce AST ile doğrulanır; keyfi kod enjeksiyonu yok
- **Proof-of-function** — kullanıcıya-dönük değişiklikler yalnız unit test değil gerçek-binary koşu geçmeli (ADR-079)
- **`.deck` sırları** — token'ları `$DECK:MY_TOKEN` olarak referans alın; çalışma anında çözülür, asla commit edilmez
- **Cost gate** — sprint-öncesi tahmin, onaylamadıkça kaçak harcamayı engeller

### Yüzeyler
- **Etkileşimli REPL** — `deckent` çalıştırıp onunla konuşun; markdown render, slash komutları, oturum ortasında model/provider değiştirme
- **Web paneli** — 16 sayfa (React + Vite + Tailwind): canlı durum, worker'lar, directives, memory explorer, borç, geçmiş, config, chat, nervous system, evolution, enterprise ve gömülü web terminali (WebSocket üzeri PTY, token-auth + audit)
- **MCP sunucusu** — stdio üzeri 34 tool + 8 resource, böylece herhangi bir MCP istemcisi (Claude Code, Cursor, …) deckent'i sürebilir
- **Otonom motor** — recurring (cron), one-off ve reactive tetikleyicili kalıcı backlog; deckent bir kuyruğu kendi başına işler
- **Connector'lar** — bildirim ve uzaktan-tetikleme için Discord, Telegram ve WhatsApp adapter'ları

### Enterprise temeli
- **Çok-tenant izolasyon**, **audit query**, **OIDC / SSO** panel girişi, **rol-tabanlı erişim kontrolü**, **zamanlanmış akışlar** ve **olay-güdümlü webhook'lar** — hepsi aynı MIT kod tabanında, gated "Enterprise Edition" olmadan

> Deneysel: sıfırdan bir **native agentic REPL** (`deckent --native`, flag-gated, varsayılan kapalı) kendi agent loop'unu bir API ya da yerel Ollama üzeri gerçek native tool-use ile koşar — kendi-barındırılabilir, fine-tune-edilebilir bir deckent çekirdeğinin temeli.

---

## İlkelerimiz

**"Open source for open world."** Tek MIT ürünü — dizüstündeki tek geliştiriciden 10.000 kişilik kuruluşa. Çok-agent orkestrasyonun tüm gücü herkese; **ayrı bir Enterprise Edition yok, gated özellik yok** (ADR-033).

1. **Önce Açık Kaynak** — MIT lisansı, kamuya açık repo, topluluk odaklı. Asla ücretli duvar arkasında bir şey yok.
2. **Kolaylık Yerine Disiplin** — kalite kapıları, kapsam uygulaması ve denetim kayıtları bir nedenden var. deckent bunları atlamaz.
3. **Provider-Agnostik, Kilitli Değil** — herhangi bir model, herhangi bir backend; hiçbir provider ayrıcalıklı değil.
4. **Bellek Büyür** — her sprint sistemi daha akıllı yapar. Öğrenimler kalıcıdır, hatırlanır ve uygulanır.

---

## Gereksinimler

| Gereksinim | Sürüm | Kontrol |
|------------|-------|---------|
| Node.js | >= 24 | `node --version` |
| git | herhangi | `git --version` |
| **En az bir provider** | herhangi | bir abonelik CLI'ı (`claude` / `codex` / `gemini`), bir OpenAI-uyumlu API anahtarı (DeepSeek / Qwen / GLM) **veya** yerel `ollama` |
| tmux | isteğe bağlı (Linux/macOS) | `tmux -V` |
| Docker | isteğe bağlı (izole worker) | `docker --version` |

Linux, macOS ve Windows (WSL2) üzerinde çalışır.

---

## Konfigürasyon

Config `.deckent/config.json` (proje) ve `~/.deckent/config.json` (global) içinde yaşar, yerleşik varsayılanlar üzerine birleştirilir (`defaults → global → project → env`). En çok kullanılan birkaç anahtar:

| Seçenek | Varsayılan | Açıklama |
|---------|------------|----------|
| `deckent_style` | `"sprint"` | Çalışma modu: `sprint` veya `task` |
| `mode` | `"balanced"` | Model strateji preset'i: `performance` · `balanced` · `economic` · `api` |
| `brain_provider` / `worker_provider` | `"claude"` | Brain / worker provider'ı |
| `spawn_backend` | `"docker"` | Worker backend: `docker` · `tmux` · `subprocess` |
| `ollama_host` | _(boş)_ | Yerel Ollama endpoint'i, örn. `http://127.0.0.1:11434` |
| `max_workers` | `6` | Eşzamanlılık tavanı (10'a kadar) |
| `sprint_timeout_minutes` | `0` | Sert sprint timeout; `0` = sınırsız |

Tam referans: [docs/reference/config-reference.md](docs/reference/config-reference.md).

---

## MCP entegrasyonu

deckent bir MCP sunucusu sunar, böylece herhangi bir MCP-uyumlu AI aracı onu sürebilir:

```bash
claude mcp add deckent -- npx deckent-mcp     # herhangi bir MCP istemcisi aynı şekilde çalışır
```

**34 MCP tool** + **8 MCP resource**. Bkz. [docs/reference/mcp-guide.md](docs/reference/mcp-guide.md).

---

## Dokümantasyon

- [Başlarken](docs/guide/getting-started.md) · [İlk Sprint](docs/guide/first-sprint.md) · [Sohbet Modu](docs/guide/chat-mode.md)
- [Multi-Provider Rehberi](docs/reference/multi-provider.md) · [Docker Backend](docs/guide/docker-backend.md)
- [Mimari](docs/architecture/architecture.md) · [Sprint Yaşam Döngüsü](docs/architecture/sprint-lifecycle.md) · [Bellek Sistemi](docs/architecture/memory-system.md)
- [Konfigürasyon Referansı](docs/reference/config-reference.md) · [MCP Rehberi](docs/reference/mcp-guide.md)
- [Tarif: REST API Ekle](docs/cookbook/add-rest-api.md) · [Tarif: Bug Düzelt](docs/cookbook/fix-bug.md)
- [Sorun Giderme](docs/development/troubleshooting.md)

---

## Katkıda Bulunma

deckent açık kaynaktır ve katkılar memnuniyetle karşılanır. Geliştirme kurulumu, test rehberi, kod standartları ve PR süreci için [CONTRIBUTING.md](CONTRIBUTING.md) okuyun. Katılarak [Davranış Kuralları](CODE_OF_CONDUCT.md)'mızı kabul edersiniz. Güvenlik sorunları? Bkz. [SECURITY.md](SECURITY.md).

---

## Lisans

MIT — [Alperen @ Verhex](https://deckent.ai)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent) · **Website:** [deckent.ai](https://deckent.ai) · **English:** [README.md](README.md)

<!-- AUTOGEN:START id="stat-counts" -->
- **34 MCP tools** + **8 MCP resources**
- **15 built-in agents** (+2 custom)
- **21 built-in skills**
- **16 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
