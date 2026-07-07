<!-- Dil: TR | Teknik terimler EN kalır -->

<p align="center">
  <img src="docs/assets/logo.png" width="140" alt="deckent — devre kraken amblemi" />
</p>

<h1 align="center">deckent</h1>

<p align="center"><strong>Ne istediğinizi anlatın. Bir AI agent ekibinin onu inşa edişini izleyin — paralel, kalite kapılarıyla, onayladığınız bir bütçeyle ve bir sonraki sefer için her şeyi hatırlayarak.</strong></p>

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-28587%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![coverage](https://img.shields.io/badge/coverage-88.58%25-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-380%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

---

## 90 saniyelik tur

Kurun, bir projeye yöneltin ve bir şey isteyin:

```bash
npm install -g deckent
deckent init
deckent start "Express API'ye JWT kimlik doğrulaması ekle"
```

deckent hedefinizi okur, işi planlar ve — tek bir token harcamadan önce — faturayı gösterir:

```
🛡  Sprint Maliyet Tahmini
──────────────────────────────────────────────
Görevler:     5        Retry tamponu: 1.5×      Cache: %65
Token:        ~13.5k giriş · 7.5k çıkış
Maliyet (USD): gerçekçi $0.09   ·   en kötü $0.13
Bütçe:        $0.09 / $10.00  ✅ bütçe içinde

Bu sprint'i sürdür? (y/N)
```

Evet deyin ve bir **ekibin** işe koyulduğunu izleyin — tek bir dosyayı düzenleyen yalnız bir asistan değil, her biri kendi kapsamına kilitli, paralel çalışan birkaç agent:

```
Sprint 286 · 5 görev · 2 dalga

  ▸ 286-001  JWT middleware ekle            opus    EXECUTING
  ▸ 286-002  POST /auth/login endpoint      opus    EXECUTING
  ▸ 286-003  bcrypt parola hash'leme        sonnet  EXECUTING
    286-004  auth testleri                  sonnet  (001–003 bekler)
    286-005  auth akışını belgele           haiku   (002 bekler)

  Auditor: kapsamları izliyor · 0 ihlal
```

Bittiğinde her görevin bir kararı vardır ve deckent size gerçeği söyler — bir retry gerektireni de dahil:

```
✅ Sprint 286 tamamlandı  ·  2dk 45sn
   5/5 görev: 5 DONE · 0 TECH_DEBT · 0 NO_GO
   +287 / −8 satır · coverage %94
   4 ilk-denemede · 1 kendini-onardı (kendi test düzeltmesi) · 0 sınır ihlali
```

Ve büyüyen kısım — **hatırladı**. auth'a dokunan bir sonraki sprint'te Brain bunu otomatik geri çağırır:

```bash
$ deckent recall "jwt auth"
[adr]     JWT auth stratejisi — HS256, 1 saat geçerlilik (sprint 286)
[pattern] Express auth middleware req.user enjekte eder, route'lar arası tekrar kullanılır
[learning] Önceden yazılmış test fixture'ları iterasyon süresini ~%40 kısalttı
```

İşte deckent. İçeri bir cümle, dışarı planlanmış-ve-doğrulanmış bir özellik; maliyet baştan bilinir, dersler bir sonraki sefere saklanır.

---

## deckent aslında nedir

Kendinizi bir **tech lead** olarak düşünün; deckent de ekibiniz:

- **Brain** planlar. Hedeflerinizi *ve* projenin belleğini okur, işi kapsamlı görevlere böler, bağımlılığa göre sıralar ve her birine bir model, bir agent ve bir skill seti atar.
- **Worker'lar** inşa eder — **10'a kadar paralel**, her biri kendi dosyalarına kısıtlı, her biri plan → kod → test → rapor döngüsü koşar. Docker, tmux ya da subprocess olarak çalışabilirler ve tek bir sprint provider'ları bile karıştırabilir (Claude planlar, Codex/Gemini uygular).
- **Auditor** sınırları gerçek zamanlı izler — bayatlamış worker'lar, kapsam ihlalleri, deadlock'lar — ve asla kendisi kod yazmaz.
- **Bellek** onu büyütür. Kararlar, desenler, öğrenimler ve borç aranabilir bir SQLite veritabanında yaşar. Architecture Decision Record'lar her worker'ın prompt'una bağlayıcı kural olarak enjekte edilir. Sonraki sprint öncekinden daha akıllıdır.

Onu herhangi bir model çalıştırır — zaten ödediğiniz bir `claude` / `codex` / `gemini` aboneliği, herhangi bir OpenAI-uyumlu API ya da **sıfır API anahtarıyla** tamamen yerel bir **Ollama** modeli. Vendor kilidi yok, token-başı sürpriz yok.

---

## Kurulum

```bash
# Önerilen
npm install -g deckent      # ya da tek seferlik: npx deckent@latest

deckent --version           # 1.0.0-beta.1
deckent doctor              # uçuş-öncesi sağlık kontrolü
```

**Gereksinimler:** Node.js ≥ 24, git ve **en az bir provider** — bir abonelik CLI'ı (`claude` / `codex` / `gemini`), bir OpenAI-uyumlu API anahtarı ya da yerel `ollama`. İsteğe bağlı: izole worker'lar için tmux ve Docker. Linux, macOS ve Windows (WSL2) üzerinde çalışır.

```bash
cd benim-projem
deckent init
```

`deckent init` dilinizi, teknoloji yığınınızı ve hangi provider CLI'larına sahip olduğunuzu tespit eder — sonra `.deckent/` (durum + config), `.brain/` (bellek veritabanı), `DIRECTIVES.md` (hedefleriniz) ve MCP istemcilerinin de deckent'i sürebilmesi için bir `CLAUDE.md` adapter'ı oluşturur.

---

## İki çalışma biçimi

### 1 — Konuşarak

`deckent`'i argümansız çalıştırın ve onunla konuşun. Yanıtlar gerçek zamanlı akar ve markdown olarak render edilir; slash komutları, sohbetten çıkmadan tüm araç kutusunu verir:

```
deckent   claude   ~/benim-projem
komutlar için /help · ya da yazmaya başlayın

› auth modülü ne yapıyor?
› /recall "rate limiting"
› /status
› /plan
› /model sonnet        oturum ortasında model değiştir
› /provider ollama     oturum ortasında provider değiştir
```

Yan-etkili eylemler (dosya yazma, komut çalıştırma) çalışmadan önce sorar — bir kez ya da "bu araç için her zaman", sizin seçiminiz.

### 2 — Yapılandırılmış sprint'ler (run, eskiden "sprint")

Gerçek iş için hedefleri `DIRECTIVES.md`'ye yazarsınız ve tam bir sprint koşmasına izin verirsiniz. Mümkün olan en basit directive yalnızca bir hedef ve bir-iki görevdir — deckent'in router'ı model, agent ve skill'leri sizin için doldurur:

```markdown
# DIRECTIVES — Sprint 1: Login ekle

## Goal: Express API'ye bir JWT login endpoint'i ekle ve belgele.

---

## Task 1: Login endpoint'ini ekle
- Scope: src/auth/

### Description
email + parola doğrulayan ve bir JWT döndüren `POST /auth/login` ekle.
Parolaları bcrypt ile hash'le. Geçerli ve geçersiz kimlik bilgileri için test ekle.

---

## Task 2: Auth akışını belgele
- Model: haiku
- Scope: docs/

### Description
Login akışını ve JWT ömrünü açıklayan docs/auth.md oluştur.
```

```bash
deckent start            # planla → spawn → execute → evaluate
deckent start --dry-run  # planı çalıştırmadan gör
deckent status --watch   # canlı ilerleme, sürekli yenilenir
```

Daha fazla kontrol mü? Her görev isteğe bağlı directive'ler kabul eder:

| Directive | Ne yapar | Örnek |
|-----------|----------|-------|
| `- Model:` | Modeli zorla | `- Model: opus` |
| `- Effort:` | İş boyutu (timeout/bütçe) | `- Effort: high` |
| `- Agent:` | Uzman agent'ı zorla | `- Agent: security-auditor` |
| `- Skills:` | Skill zorla / hariç tut (`-` hariç tutar) | `- Skills: typescript-expert, -ci-testing` |
| `- Provider:` | Bu görevi belirli bir provider'da koş | `- Provider: codex` |
| `- Priority:` | `CRITICAL` / `HIGH` / `NORMAL` / `LOW` | `- Priority: HIGH` |
| `- Scope:` | Worker'ın yazabileceği dizinler | `- Scope: src/core/, tests/` |
| `- Dependencies:` | Başka bir görevden sonra koş (dalgalar) | `- Dependencies: W1-1` |

Bunları dışarıda bırakın, **Routing Engine** görevin kapsamına, niyetine ve proje yığınınıza göre sizin için seçsin.

---

## Ne göreceksiniz

deckent izlenmek için kuruldu, bir kara kutu olmak için değil.

**Canlı durum** (`deckent status --watch`) her worker'ı, fazını ve Auditor'ın uyarılarını anbean gösterir — `EXECUTING → TESTING → DONE` arasında ilerleyen görevler, agent ve skill atamaları, worker devir-teslimleri ve bir sonraki faz geri sayımı.

**Retrospektif** (`deckent retro`) her sprint sonunda otomatik yazılır — ne iyi gitti, neye dikkat gerek, agent performansı, öğrenimler ve son beş sprint boyunca bir trend:

```
=== Sprint Retrospektifi: 286 ===
  Görev 5/5 · No-Go 0 · Tech Debt 0 · Coverage %94 · 2dk 45sn

  Agent performansı
    claude   5 görev · 5 DONE · 0 borç · ort. coverage %94

  Öğrenimler
    • JWT middleware Express error handler'larıyla temiz entegre olur
    • Önceden yazılmış test fixture'ları iterasyon süresini ~%40 kısalttı

  Trend (son 5 sprint)
    286  tsc OK · +5 test · 0 regresyon
    285  tsc OK · +8 test · 1 regresyon
    284  tsc OK · +2 test · 2 regresyon
```

**Bellek** (`deckent recall "<sorgu>"` / `deckent remember "<not>"`) mimari kararlar, sprint öğrenimleri, desenler ve tech debt boyunca arar ve yazar — tam-metin, Türkçe/İngilizce/Almanca-farkında. **Review** (`deckent review`) merge'den önce görev başına bir `GO` / `NO-GO` kararı verir.

---

## Özellikler

### Orkestrasyon
- **8 fazlı sprint yaşam döngüsü** — `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`
- **Paralel worker'lar** — aynı anda 10'a kadar, her biri izole bir kapsamda
- **Dependency pipeline** — Kahn topolojik sıralaması görevleri dalgalara dizer; bağımlılar yalnız girdileri DONE'a ulaşınca açılır ve başarısız bir görev bağımlılarına bir `BLOCKED` zincirler
- **Üç backend, worker-bazlı** — Docker (varsayılan, container-izole + bellek-limitli + graceful shutdown), tmux ya da subprocess — ve her worker bağımsız bir backend *ve provider* koşabilir
- **GO / NO-GO / TECH_DEBT** — her sonuç rubric skorlamayla yargılanır; başarısızlıklar FIX fazında, hatayı bağlam alarak yeniden denenir
- **Çökme kurtarma** — checkpoint/resume takılan bir sprint'i geri yükler; orphan görevler yeniden değerlendirilir
- **Gerçekten sizi durduran bir cost gate** — sprint-öncesi tahmin, siz onaylayana (ya da `--force` geçene) kadar bütçe-aşan bir çalışmayı engeller

### Bellek ve zeka
- **Memory V2 (DB-first)** — çift katmanlı TR/EN/DE normalize'lı SQLite + FTS5 full-text arama; veritabanı doğruluk kaynağıdır, `.md` dosyaları üretilen export'lardır
- **Brain auto-query** — bir görevin "DNA"sı ilgili ADR'leri, desenleri ve öğrenimleri PLAN, SPAWN ve EVALUATE'te otomatik çeker
- **ADR yönetişimi** — Architecture Decision Record'lar her worker'ın prompt'una bağlayıcı kısıt olarak enjekte edilir; birini ihlal edecek bir worker durur ve bir değişiklik önerir
- **Routing Engine V2** — çok-sinyalli skorlama görev başına doğru agent + skill + provider atar; sonuçlar zamanla yeniden dengeleyen bir öğrenme döngüsünü besler
- **Evolution pipeline** — geçici agent/skill'ler performansa göre kalıcı havuza terfi eder, başarısızlıkta düşürülür
- **Nervous System** — boşta worker'ları, routing anomalilerini, kapsam çakışmalarını, agent-sağlık düşüşlerini ve borç trendlerini izleyip aksiyon öneren proaktif bir meta-orkestratör

### Agent'lar ve skill'ler
- **15 yerleşik agent** — security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist
- **21 yerleşik skill** — typescript-expert, testing-expert, react-specialist, security-specialist, docker-expert, python-expert, anthropic-sdk ve daha fazlası
- **Plugin'ler** — kendi yeniden-kullanılabilir yeteneklerinizi eklemek için `.deckent/plugins/` içine bir `manifest.json` + `SKILL.md` bırakın

### Güvenlik ve kalite
- **Kapsam uygulaması** — Auditor çalışma ağacının diff'ini alır (`git diff --stat`) ve bir worker'ın atanmış kapsamı dışındaki her yazımı işaretler; yerel/agentic worker'lar kapsam-dışı yazımları doğrudan reddeder
- **RBAC yetki matrisi (ADR-037)** — Brain / Auditor / Worker, kurcalama-belirten, HMAC-zincirli bir denetim kaydıyla ayrı rollere sahiptir
- **Spawn güvenliği** — worker'lar bir binary whitelist'e karşı dizi argümanlarıyla spawn edilir; shell-string enjeksiyonu yok
- **`.deck` sırları** — token'ları `$DECK:MY_TOKEN` olarak referans alın; çalışma anında çözülür, git'ten uzak tutulur
- **Proof-of-function (ADR-079)** — kullanıcıya-dönük değişiklikler yalnız bir unit test değil, gerçek-binary bir koşu geçmeli

### Yüzeyler
- **Etkileşimli REPL** — markdown streaming, slash komutları ve oturum-ortası model/provider değiştirmeyle `deckent`
- **Web paneli** — 20 sayfa (React + Vite + Tailwind): canlı durum, worker'lar, directives, memory explorer, borç, geçmiş, config, chat, nervous system, evolution, enterprise — artı gömülü bir web terminali (WebSocket üzeri PTY, token-auth + audit)
- **MCP sunucusu** — stdio üzerinde 46 tool + 8 resource, böylece herhangi bir MCP istemcisi (Claude Code, Claude Desktop, …) deckent'i sürebilir
- **Otonom motor** — recurring (cron), one-off ve reactive tetikleyicili kalıcı bir backlog; deckent bir kuyruğu kendi başına işler
- **Connector'lar** — bildirim ve uzaktan-tetikleme için Discord, Telegram ve WhatsApp
- **Enterprise temeli** — çok-tenant izolasyon, audit query, OIDC/SSO panel girişi (RS256-pinned JWT, PKCE), rol-tabanlı erişim, zamanlanmış akışlar ve webhook'lar — hepsi aynı MIT kod tabanında, gated edition yok

> **Deneysel:** sıfırdan bir **native agentic REPL** (`deckent --native`, flag-gated, varsayılan kapalı) kendi agent loop'unu bir API ya da yerel Ollama üzerinde gerçek native tool-use ile koşar — kendi-barındırılabilir, fine-tune-edilebilir bir deckent çekirdeğinin temeli.

---

## Kendi modelinizi getirin

deckent çekirdeğine kadar provider-agnostiktir. Provider'ları `.deckent/config.json` içinde yapılandırın; hiçbir provider ayrıcalıklı değil.

```jsonc
{
  "providers": { "brain": "claude", "worker": "claude" },  // kim planlar / kim inşa eder
  "auth_mode": "subscription"                              // "subscription" ($0, CLI girişinizi kullanır) ya da "api"
}
```

| Provider | Şununla kurun | Notlar |
|----------|---------------|--------|
| **Claude** | `claude` CLI (giriş yapılmış) | Abonelik = token başına $0. Ya da API modu için `ANTHROPIC_API_KEY`. |
| **Codex (OpenAI)** | `codex` CLI ya da `OPENAI_API_KEY` | |
| **Gemini** | `gemini` CLI ya da `GOOGLE_API_KEY` | |
| **OpenAI-uyumlu** | `openai_base_url` + `OPENAI_API_KEY` | DeepSeek, Qwen, GLM, OpenRouter, vLLM, … |
| **Ollama** | `ollama_host` + `native_model` | Tamamen yerel, **sıfır API anahtarı**, sıfır bulut çağrısı. |

**Abonelikler birinci sınıftır.** Bir provider'ın CLI'ı kurulu ve giriş yapılmışsa deckent worker'larını mevcut aboneliğinizle sürer — API anahtarı yok, token-başı fatura yok. Üçüne de sahipseniz tek bir sprint'te bir **karışık filo** koşabilirsiniz:

```markdown
## Task 1: Security audit
- Provider: codex
- Model: gpt-5

## Task 2: UI polish
- Provider: gemini

## Task 3: Core refactor       # config varsayılanını kullanır (Claude)
- Model: opus
```

Ya da model isimlerini tamamen atlayın ve **model registry**'nin (4 tier boyunca 14 model — `premium_plus` / `premium` / `standard` / `economy`) seçtiğiniz provider için eşdeğer modeli `model_strategy.brain_tier` / `worker_tier` üzerinden seçmesine izin verin. Fiyatlandırma canlı çekilir (paketlenmiş bir fallback ile), böylece maliyet tahminleri dürüst kalır.

→ Tam rehber: [docs/reference/multi-provider.md](docs/reference/multi-provider.md)

---

## Mimari

```
                 DIRECTIVES.md  (hedefleriniz, düz dille)
                         │
                  ┌──────▼──────┐   hedefleri + belleği okur, kapsamlı görevler
                  │    BRAIN     │   planlar, model · agent · skill · provider atar,
                  │  (plan)      │   bağımlılığa göre dalgalara dizer
                  └──────┬──────┘
            dalga 1  ┌───┼───┐   dalga 2 (dalga 1 = DONE olunca açılır)
                 ┌───▼─┐ ┌─▼───┐ ┌─────┐   paralel, her biri izole kapsamda
                 │ W1  │ │ W2  │ │ W3  │   (Docker / tmux / subprocess; herhangi provider)
                 └───┬─┘ └─┬───┘ └──┬──┘   plan → kod → test → rapor
                     └──────┼───────┘
        ┌──────────────────┐│┌──────────────────┐
        │ AUDITOR (tara)    ││ BRAIN (değerlendir)│  GO / NO-GO / TECH_DEBT
        │ kapsam, heartbeat │││ rubric + kanıt    │  NO-GO ─► FIX (bağlamla retry)
        └──────────────────┘│└─────────┬─────────┘  DONE  ─► RETRO ─► BELLEK (büyür)
        ┌───────────────────▼──────────────────────┐
        │   Nervous System — proaktif meta-orkestratör   │
        └──────────────────────────────────────────────────┘
```

Kod tabanı katmanlıdır: `orchestra/` (sprint motoru), `core/` (config, bellek, model registry, routing), `agents/` (worker yaşam döngüsü), `monitor/` (Auditor), `nervous/` (proaktif detector'lar), `providers/` + `mcp-client/` (model backend'leri), `api/` + `dashboard/` (web yüzeyleri), `mcp/` (MCP sunucusu) ve `cli/` (Commander + REPL).

→ [Mimari](docs/architecture/architecture.md) · [Sprint Yaşam Döngüsü](docs/architecture/sprint-lifecycle.md) · [Bellek Sistemi](docs/architecture/memory-system.md)

---

## MCP entegrasyonu

deckent bir MCP sunucusu sunar, böylece herhangi bir MCP-uyumlu araç onu sürebilir:

```bash
claude mcp add deckent -- npx deckent-mcp     # herhangi bir MCP istemcisi aynı şekilde çalışır
```

stdio üzerinde **46 tool + 8 resource**. → [docs/reference/mcp-guide.md](docs/reference/mcp-guide.md)

---

## İlkelerimiz

**"Open source for open world."** Tek bir MIT ürünü — dizüstündeki tek bir geliştiriciden 10.000 kişilik bir kuruluşa. Çok-agent orkestrasyonun tüm gücü, herkese verildi; **ayrı bir Enterprise Edition yok, gated özellik yok** (ADR-033).

1. **Önce Açık Kaynak** — MIT, kamuya açık, topluluk-güdümlü. Asla ücretli duvar arkasında bir şey yok.
2. **Kolaylık Yerine Disiplin** — kalite kapıları, kapsam uygulaması ve denetim kayıtları bir nedenle var; deckent onları atlamaz.
3. **Provider-Agnostik, Kilitli Değil** — herhangi bir model, herhangi bir backend; hiçbir provider ayrıcalıklı değil.
4. **Bellek Büyür** — her sprint sistemi daha akıllı yapar.

---

## Dokümantasyon

- [Başlarken](docs/guide/getting-started.md) · [İlk Sprint](docs/guide/first-sprint.md) · [Sohbet Modu](docs/guide/chat-mode.md)
- [Multi-Provider Rehberi](docs/reference/multi-provider.md) · [Docker Backend](docs/guide/docker-backend.md) · [Konfigürasyon Referansı](docs/reference/config-reference.md)
- [Mimari](docs/architecture/architecture.md) · [Sprint Yaşam Döngüsü](docs/architecture/sprint-lifecycle.md) · [Bellek Sistemi](docs/architecture/memory-system.md) · [MCP Rehberi](docs/reference/mcp-guide.md)
- [Tarif: REST API Ekle](docs/cookbook/add-rest-api.md) · [Tarif: Bug Düzelt](docs/cookbook/fix-bug.md) · [Sorun Giderme](docs/development/troubleshooting.md)

---

## Katkı ve güvenlik

Katkılar memnuniyetle karşılanır — bkz. [CONTRIBUTING.md](CONTRIBUTING.md) (deckent, deckent *ile* inşa edilir, yani katkı akışı ürünün kendisidir). Katılarak [Davranış Kuralları](CODE_OF_CONDUCT.md)'mızı kabul edersiniz. Bir açık mı buldunuz? Bkz. [SECURITY.md](SECURITY.md).

---

## Lisans

MIT — [Alperen @ Verhex](https://deckent.ai)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent) · **Website:** [deckent.ai](https://deckent.ai) · **English:** [README.md](README.md)

<!-- AUTOGEN:START id="stat-counts" -->
- **46 MCP tools** + **8 MCP resources**
- **17 built-in agents** (+2 custom)
- **29 built-in skills**
- **20 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
