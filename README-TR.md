<!-- Dil: TR | Teknik terimler EN kalır -->

<p align="center">
  <img src="docs/assets/logo.png" width="140" alt="Deckent — devre kraken amblemi" />
</p>

# deckent

**Gerçekten Çalışan AI Agent Orkestrasyonu.**

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-20668%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![coverage](https://img.shields.io/badge/coverage-88.58%25-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-255%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

Deckent, hedeflerinizi çalışan yazılıma dönüştüren açık kaynaklı bir AI agent orkestrasyon CLI'dir. `DIRECTIVES.md`'ye ne istediğinizi yazın; Deckent görevleri planlar, paralel AI worker'lar çalıştırır, kalite kapılarını uygular ve sonuçları tam denetim kaydıyla teslim eder.

<!-- ![demo](docs/assets/demo.gif) -->

---

## Trinity: Deckent'in Üç Yüzü

Deckent, kullanım şeklinize göre üç farklı rol üstlenir:

| Yüz | Açıklama | Giriş Noktası |
|-----|----------|---------------|
| **AI Asistan** | Konuşma arayüzü — doğal sohbet, soru, beyin fırtınası veya `deckent chat` ile görev tetikleme | `deckent chat` |
| **AI Sistem Worker'ı** | Otonom çok-agent motoru — planla, başlat, uygula, değerlendir, tekrar dene | `deckent start` |
| **Geliştirici Platformu** | Genişletilebilir orkestrasyon temeli — özel agent'lar, skill'ler, provider'lar, MCP entegrasyonu | `deckent init` |

Bu üç yüz birbirinden ayrı modlar değildir — birlikte çalışırlar. Planlamak için sohbet edin, uygulamak için başlatın, büyütmek için genişletin.

---

## Neden Deckent

**Devin, Cursor ve Aider güçlü araçlardır — ama farklı sorunları çözerler.** Devin bireysel kodlama görevlerini iyi otomatikleştirir; ancak yapılandırılmış kalite kapıları ve sprint'ler arası öğrenme eksiktir. Cursor ve GitHub Copilot editör içi önerilerde mükemmeldir; fakat paralel worker'lar ve doğrulama döngüleriyle çok dosyalı, çok adımlı projeleri orkestre etmez. Aider yetenekli bir çift programcısıdır; ancak sprint yaşam döngüsü ve bellek olmaksızın tek iş parçacıklı çalışır.

**Deckent farklı bir konumlanma sergiler.** 10'a kadar paralel AI worker üzerinde tam 8 fazlı sprint yaşam döngüsü çalıştırır (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP). Her görevin tanımlı kapsamı, GO/NO-GO kriterleri ve gerçek zamanlı sınır ihlali izleyen bir Auditor'ı vardır. Bir görev başarısız olduğunda, FIX aşaması hata bağlamıyla yeniden dener. Sprint bittiğinde öğrenilenler SQLite belleğine kaydedilir ve bir sonraki sprint'te otomatik olarak hatırlanır.

**Sonuç, her sprint'le büyüyen bir sistemdir.** Her sprint bir öncekinin üzerine inşa edilir. Mimari kararlar (ADR'ler) uygulanır. Agent performansı izlenir ve evrilir. Teknik borç kayıt altına alınır ve gün yüzüne çıkar. Deckent yalnızca bir kodlama asistanı değil — zamanla daha akıllı hale gelen disiplinli bir AI geliştirme ekibidir.

---

## Hızlı Başlangıç

İlk sprint'inizi 5 dakikada çalıştırın:

```bash
# Kurulum (veya npx kullanın — global kurulum gerekmez)
npm install -g deckent

# Projenizi başlatın
cd benim-projem
deckent init

# Seçenek A: Sohbet arayüzü
deckent chat

# Seçenek B: Sprint arayüzü (yapılandırılmış)
deckent set-directives   # hedeflerinizi tanımlayın
deckent start            # planla + başlat + uygula
deckent status           # ilerlemeyi canlı izleyin
```

`deckent init` sonrasında `DIRECTIVES.md`'yi sprint hedeflerinizle düzenleyin. Kalanını Deckent halleder.

---

## Nasıl Çalışır

### Sprint Modu (yapılandırılmış çok-agent)

```
              DIRECTIVES.md (hedefleriniz)
                       |
                [ Brain: Plan ]
               /      |      \
         Worker1   Worker2   Worker3   (paralel, kapsamlı)
               \      |      /
               [ Brain: Evaluate ]
                       |
             GO / NO-GO / TECH_DEBT
```

1. **Tanımla** — `DIRECTIVES.md`'ye hedefleri yaz
2. **Planla** — Brain hedefleri okur, kapsamlı öncelikli görevler oluşturur
3. **Uygula** — Paralel AI worker'lar inşa eder, test eder ve sonuçları raporlar
4. **Değerlendir** — Her görev GO / NO-GO / TECH_DEBT kararı alır

### Görev Modu (tek seferlik)

```
  Kullanıcı Girdisi → [ Görev Çalıştırıcı ] → Worker → Sonuç
```

Hızlı komutlar, hatırlatıcılar ve yaşam asistanı kullanım senaryoları için tek görev uygulaması.

---

## Mimari

```
+------------------------------------------------------------------+
|                         deckent CLI                              |
+------------------------------------------------------------------+
|                                                                  |
|   +----------+     +----------+     +----------+                |
|   |  Brain   |---->| Worker 1 |     | Auditor  |                |
|   | (planlar,|---->| Worker 2 |     | (tarar,  |                |
|   | değerlen.|---->| Worker N |     |  uyarır) |                |
|   +----------+     +----------+     +----------+                |
|        |                                   |                    |
|   .brain/            .tasks/          .dashboard                |
|   (bellek DB,        (görev JSON,     (canlı durum)             |
|    ADR'ler,           sonuçlar, hb)                             |
|    desenler)                                                     |
+------------------------------------------------------------------+
|         Nervous System — Proaktif Meta-Orkestratör               |
+------------------------------------------------------------------+
```

Dört temel modül:

- **[Brain](docs/architecture/brain.md)** — Görevleri planlar, modelleri atar, sonuçları değerlendirir, SQLite belleği aracılığıyla sprint'ler boyunca öğrenir
- **[Worker'lar](docs/architecture/workers.md)** — Görevleri paralel olarak uygular (tmux, subprocess veya Docker), her biri planla-kodla-test et-raporla döngüsüyle
- **[Auditor](docs/architecture/auditor.md)** — Kalp atışlarını izler, sınır ihlallerini tespit eder, kalite kapılarını uygular
- **[Memory V2](docs/architecture/memory.md)** — SQLite + FTS5, çift katmanlı TR/EN normalize, ham markdown'a kıyasla %96 bağlam azaltımı

---

## Temel Özellikler

### Temel Orkestrasyon
- **Sprint Yaşam Döngüsü** — 8 fazlı yapılandırılmış döngü: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP
- **Çok-Worker Paralel Uygulama** — Aynı anda 10'a kadar AI worker, her biri izole kapsamda
- **GO / NO-GO Değerlendirmesi** — Her görev sonucu tanımlı kriterlere göre değerlendirilir; NO-GO görevler FIX aşamasında yeniden denenir
- **Auditor Kalite Kapısı** — Eski kalp atışı tespiti, sınır ihlali taraması, Kahn algoritmasıyla kilitlenme tespiti
- **İkili Mod** — `sprint` (geliştirici orkestrasyonu) veya `task` (tek seferlik yaşam asistanı)

### Zeka ve Bellek
- **Memory V2 DB-First** — SQLite + FTS5 tam metin araması, çift katmanlı Türkçe/İngilizce normalize
- **Brain Auto-Query** — Görev DNA → ilgili ADR'ler/desenler/öğrenmeler PLAN, SPAWN, EVALUATE aşamalarında otomatik sorgulanır
- **Nervous System** — Proaktif meta-orkestratör: boşta kalma tespiti, yönlendirme anomalisi uyarıları, agent sağlık izleme
- **Çoklu Provider Desteği** — Claude, OpenAI Codex, Google Gemini — 4 tier'da 13 model

### Güvenlik ve Emniyet
- **AST Sandbox** — Tüm skill'ler çalıştırılmadan önce AST doğrulamasından geçer; keyfi kod enjeksiyonu yok
- **Kapsam Uygulaması** — Worker'lar yalnızca atanmış `scope.filesWrite` dosyalarına dokunabilir — Auditor `git diff --stat` ile uygular
- **RBAC Protokolü** — ADR-037 Brain-Auditor-Worker yetki matrisi, denetim kaydıyla
- **`.deck` Gizli Değer** — Sırları `$DECK:MY_TOKEN` olarak referans alın; asla git'e commit edilmez

---

## OSS İlkeleri

Deckent dört değişmez ilke üzerine inşa edilmiştir (ADR-033):

1. **Önce Açık Kaynak** — MIT lisansı, kamuya açık repo, topluluk odaklı. Ücretli duvar arkasında özellik yok.
2. **Kolaylık Yerine Disiplin** — Kalite kapıları, kapsam uygulaması ve denetim kayıtları bir nedenden dolayı var. Deckent bunları atlamaz.
3. **Çoklu Provider, Kilitli Değil** — Claude, Codex ve Gemini desteklenir. Tasarım gereği provider bağımlılığı yok.
4. **Bellek Büyür** — Her sprint sistemi daha akıllı yapar. Öğrenilenler kalıcıdır, hatırlanır ve gelecek sprint'lerde uygulanır.

---

## Gereksinimler

| Gereksinim | Sürüm | Kontrol |
|------------|-------|---------|
| Node.js | >= 24 | `node --version` |
| git | herhangi | `git --version` |
| Claude Code CLI | herhangi | `claude --version` |
| tmux | herhangi (isteğe bağlı, Linux/macOS) | `tmux -V` |
| OpenAI Codex CLI | herhangi (isteğe bağlı) | `codex --version` |
| Google Gemini CLI | herhangi (isteğe bağlı) | `gemini --version` |

**Claude Aboneliği:** Pro, Max 5x, Max 20x veya API anahtarı. `deckent init` her şeyi otomatik tespit eder ve onayınızla eksik provider CLI'larını kurar.

---

## Kurulum

```bash
# Önerilen — global kurulum gerekmez
npx deckent@latest init

# Veya global kurulum
npm install -g deckent && deckent init

# Doğrulama
deckent --version    # 1.0.0-beta.1
deckent doctor       # sistem sağlık kontrolü
deckent web          # http://localhost:3100 web paneli
```

---

## Katkıda Bulunma

Katkılar memnuniyetle karşılanır. Geliştirme kurulumu, test rehberi, kod standartları ve PR süreci için [CONTRIBUTING.md](CONTRIBUTING.md) okuyun.

---

## Dokümantasyon

- [Başlarken](docs/guide/getting-started.md)
- [İlk Sprint](docs/guide/first-sprint.md)
- [Sohbet Modu](docs/guide/chat-mode.md)
- [Tarif: REST API Ekle](docs/cookbook/add-rest-api.md)
- [API Referansı](docs/reference/api.md)
- [Konfigürasyon Referansı](docs/reference/config-reference.md)
- [MCP Rehberi](docs/reference/mcp-guide.md)
- [Mimari](docs/architecture/architecture.md)
- [Sprint Yaşam Döngüsü](docs/architecture/sprint-lifecycle.md)

---

## Lisans

MIT — [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Website:** [deckent.agency](https://deckent.agency)
**English README:** [README.md](README.md)

<!-- AUTOGEN:START id="stat-counts" -->
- **32 MCP tools** + **8 MCP resources**
- **15 built-in agents** (+2 custom)
- **21 built-in skills**
- **12 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
