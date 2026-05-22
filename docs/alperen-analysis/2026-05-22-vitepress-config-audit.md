# `docs/.vitepress/config.ts` Audit — VitePress Site Yapılandırması — 2026-05-22

**Kapsam:** `docs/.vitepress/config.ts` (209 satır) — nav + sidebar + `srcExclude` linklerinin disk gerçeğiyle tutarlılığı
**Metodoloji:** Sistematik debugging — her `link:` değeri `cleanUrls` kuralıyla (`/x/y` → `docs/x/y.md`) dosya sistemine karşı doğrulandı
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı (yayınlanan VitePress sitesi gezinme deneyimi)

---

## Özet

| Metrik | Değer |
|--------|-------|
| Toplam dahili navigasyon linki (nav + sidebar) | 44 |
| Çözülen (gerçek sayfa) | **7 farklı hedef** |
| Kırık (phantom sayfa) | **34 link → 30 farklı phantom hedef** |
| Gerçek ama navigasyonda görünmeyen sayfa (orphan) | **29** (guide/ 10 + reference/ 19) |
| Hiç var olmayan route grubu | `/api/` (7 link), `/blog/` (1 link) |

**Tek cümlede:** VitePress nav/sidebar, hiç var olmayan bir doküman yapısını tarif ediyor — gerçek 14 guide + 21 reference dosyasının yalnız 7'si menüden erişilebilir, geri kalan 29'u orphan, menü tıklamalarının %77'si 404.

---

## Kök Neden

`config.ts:13` yorumu: *"Sprint 172 C3: dead-link gate enabled."* — `governance-index-audit` ile **aynı kök neden**: Sprint 172 doc-reorg. `docs/guide/` + `docs/reference/` o reorg'da düz bir 14+21 dosya yapısına geçti; ama `config.ts` nav/sidebar **aspirasyonel/eski yapıyı** (`introduction`, `architecture`, `brain`, `auditor`, `mcp`, `plugins`, `cli-start/status/...`, `config-provider/sprint/...`, tüm `/api/*`) tarif etmeye devam ediyor. Dead-link gate (`ignoreDeadLinks: false`) açıldı ama config'in kendisi hizalanmadı.

**Önemli teknik nüans:** VitePress `ignoreDeadLinks` yalnız **markdown içeriğindeki** linkleri doğrular — `themeConfig.nav`/`sidebar` linkleri build sırasında dosya sistemine karşı **kontrol edilmez**. Yani bu kırık linkler build'i patlatmaz; bunun yerine **yayınlanan sitede tıklanınca 404'e giden menü öğeleri** üretir. (Build patlama riski ayrı: markdown içeriğindeki dead-link'ler — bkz. guide-docs-audit Kesişen Sorun #4.)

---

## Bulgu 1 — Phantom `/api/` route grubu (tüm `/api/*` ölü)

`docs/api/` dizini **hiç yok**. Buna rağmen config 7 yerde `/api/*` linkliyor:

- `nav` → "API Reference" `link: '/api/'`
- `nav` `activeMatch: '^/(guide|reference|api)/'` — var olmayan `api` route grubunu kapsıyor
- `/api/` sidebar bloğu — 6 öğe: `/api/`, `/api/rest`, `/api/health`, `/api/config`, `/api/sprint`, `/api/websocket`

Gerçekte API dokümantasyonu `docs/reference/`'da: `api.md`, `api-surface.md`, `api-examples.md`. Yani sayfa var, route yanlış.

---

## Bulgu 2 — Phantom `/blog/` nav linki

`nav` → `{ text: 'Blog', link: '/blog/' }`. `docs/blog/` dizini yok. Tıklanınca 404.

---

## Bulgu 3 — `/guide/` sidebar: 17 linkin 13'ü ölü

`docs/guide/` gerçek 14 dosya: `concepts, config-recovery, deckent-nedir, docker-backend, faq, first-sprint, getting-started, installation, nervous-system, quickstart, terminal, terminal-tr, troubleshooting, workers`.

| Sidebar linki | Durum |
|---------------|-------|
| `/guide/getting-started`, `/guide/first-sprint`, `/guide/concepts`, `/guide/workers` | ✅ var (4) |
| `/guide/introduction`, `/guide/configuration` | ❌ yok |
| `/guide/architecture`, `/guide/brain`, `/guide/auditor`, `/guide/skills` | ❌ yok (`skills` aslında `reference/skills.md`) |
| `/guide/mcp`, `/guide/mcp-tools`, `/guide/mcp-resources` | ❌ yok (`mcp-*` aslında `reference/`'da) |
| `/guide/plugins`, `/guide/writing-plugins`, `/guide/plugin-api`, `/guide/publishing-plugins` | ❌ yok |

`nav` da `/guide/architecture`, `/guide/mcp`, `/guide/plugins` linkliyor — üçü de ölü.

---

## Bulgu 4 — `/reference/` sidebar: 12 linkin 10'u ölü

`docs/reference/` gerçek 21 dosya. Sidebar yalnız `cli` + `config`'i doğru linkliyor:

| Sidebar linki | Durum |
|---------------|-------|
| `/reference/cli`, `/reference/config` | ✅ var (2) |
| `/reference/cli-start`, `cli-status`, `cli-config`, `cli-doctor`, `cli-finalize` | ❌ yok — gerçek dosya tek: `cli.md` + `cli-commands.md` |
| `/reference/config-provider`, `config-sprint`, `config-memory`, `config-auditor`, `config-output` | ❌ yok — gerçek dosya: `config.md` + `config-reference.md` |

---

## Bulgu 5 — 29 gerçek sayfa navigasyonda hiç yok (orphan)

Bu sayfalar `srcExclude`'da değil → **build ediliyor** ama nav/sidebar'da hiçbir giriş yok; kullanıcı yalnız içerik-içi link veya arama ile ulaşabilir:

- **guide/ (10):** `installation`, `terminal`, `terminal-tr`, `docker-backend`, `nervous-system`, `quickstart`, `faq`, `deckent-nedir`, `troubleshooting`, `config-recovery` — *gömülü web terminali (terminal.md) gibi amiral özellik dahil*
- **reference/ (19):** `agents`, `api`, `api-surface`, `api-examples`, `cli-commands`, `config-reference`, `features`, `glossary`, `health-check`, `managed-docs`, `marketplace`, `mcp-guide`, `mcp-resources`, `mcp-tools`, `migration-guide`, `multi-provider`, `performance`, `security`, `skills`

**Yan bulgu — reference/ duplikasyonu:** `cli.md`+`cli-commands.md`, `config.md`+`config-reference.md`, `api.md`+`api-surface.md`+`api-examples.md`, `mcp-guide.md`+`mcp-tools.md`+`mcp-resources.md` — hangisinin canonical olduğu belirsiz; sidebar tasarımı bu belirsizliği çözmeden yapılmış.

---

## Bulgu 6 — `srcExclude` yorumu yanlış

`config.ts:32` yorumu: *"Only guide/ and index.md are built as user-facing docs."*

Gerçek `srcExclude` listesi: `directives/`, `analysis/`, `archive/`, `release/`, `development/`, `architecture/`, `superpowers/`, `audits/`, `launch/`, `governance/`, `SPRINT-LOG.md`, `CHANGELOG.md`. Bu listede **olmayan** ve dolayısıyla **build edilen**: `reference/`, `adr/`, `design/`, `security/`, `vision/`, `KNOWN_ISSUES.md`, `ROADMAP-GOD-LEVEL.md`, `worker-guide.md`, `index.md`. Yorum "yalnız guide/ + index.md" diyor — yanlış; en az 5 dizin + 3 kök dosya daha yayınlanıyor.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Kullanıcı perspektifi (kritik):**
- VitePress sitesi bir OSS ziyaretçisinin **birincil temas yüzeyi**. Mevcut hâliyle: üst menüdeki "Architecture", "API Reference", "MCP Guide", "Plugin Development", "Blog" — **beşi de 404**. Sol sidebar'da guide bölümünde 13/17, reference bölümünde 10/12, api bölümünde 6/6 öğe 404.
- Aynı anda gerçek 29 sayfa (kurulum, docker, nervous, terminal, FAQ, tüm reference) menüden **görünmez** — yalnız arama veya şans eseri içerik linkiyle bulunur.
- Bu, "site canlı ama gezinilemez" durumudur — yayınlanırsa Deckent'in dokümantasyonu kırık izlenimi verir.

**Dogfooding perspektifi:**
- `governance-index-audit` ile birebir aynı Sprint 172 doc-reorg artığı; o audit `docs/governance/INDEX.md` + `docs.json` path'lerini düzeltti ama `config.ts` nav/sidebar atlandı — reorg temizliği eksik kaldı.
- `ignoreDeadLinks: false` "docs honest" hedefiyle açılmış (satır 13-14) ama themeConfig linklerini denetlemediği için bu yanlış güven veriyor: gate yeşil olsa bile navigasyon kırık.

---

## Gelecek Öneriler

1. **nav + sidebar gerçek dosya setine yeniden yazılmalı** — Bir **karar** gerekiyor: (a) nav/sidebar'ı mevcut 14 guide + 21 reference dosyasına göre baştan yaz (hızlı, dürüst); ya da (b) eksik 30 aspirasyonel sayfayı (`introduction`, `architecture`, `brain`, `auditor`, `mcp*`, `plugins*`, `/api/*`, `cli-*`, `config-*`) gerçekten oluştur (büyük efor). (a) önerilir — sonra eksik sayfalar ayrı iş kalemi.
2. **Phantom route gruplarını kaldır:** `/api/` sidebar bloğu + nav "API Reference" → `docs/reference/api.md`'ye repoint veya `/reference/` altına taşı; `/blog/` nav linki kaldırılmalı (blog yoksa).
3. **reference/ duplikasyonu çözülmeli:** `cli.md`↔`cli-commands.md`, `config.md`↔`config-reference.md`, `api.md`↔`api-surface.md`↔`api-examples.md`, `mcp-guide.md`↔`mcp-tools.md`↔`mcp-resources.md` — her küme için canonical seçilip diğeri redirect/silinmeli; sidebar ona göre kurulmalı.
4. **29 orphan sayfa sidebar'a bağlanmalı** — özellikle `installation`, `quickstart`, `docker-backend`, `nervous-system`, `terminal`, `faq` ve tüm `reference/`.
5. **`srcExclude` yorumu düzeltilmeli** (satır 32) — gerçek build kapsamını yansıtacak şekilde.
6. **themeConfig link doğrulaması CI'a eklenmeli** — `ignoreDeadLinks` nav/sidebar'ı kapsamadığı için `scripts/lint-links.mjs`'e config.ts `link:` değerlerini dosya sistemine karşı denetleyen bir adım eklenmeli; aksi hâlde bu regresyon sınıfı sessizce geri döner.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `docs/.vitepress/config.ts` 44 dahili navigasyon linki disk gerçeğine karşı doğrulandı: **34'ü kırık** (30 farklı phantom hedef), yalnız **7 gerçek sayfaya** ulaşıyor; ayrıca **29 gerçek sayfa** navigasyonda hiç görünmüyor. Kök neden Sprint 172 doc-reorg'un eksik temizliği — `governance-index-audit` ile aynı. Bu tur **kod/config değişikliği yapılmadı** — saf analiz; düzeltme (nav/sidebar yeniden yazımı) (a)/(b) kararı gerektirdiği için "Gelecek Öneriler"e bırakıldı. Tüm bulgular `cleanUrls` kuralıyla dosya sistemi kontrolü ile kanıtlandı.
