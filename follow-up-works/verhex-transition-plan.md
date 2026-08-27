# VERHEX GEÇİŞ-PLANI — paket-yayın + repo-taşıma + rename (owner-karar dokümanı)

> **Silinme-tetiği (delete-on-consume):** Alperen aşağıdaki karar-listesini karara bağlayıp
> execution MASTER-satırlarına admission verdiğinde bu doküman SİLİNİR — kalıcı kayıt
> MASTER satır-kanıtı olur. (Result-notes-first kuralı, 2026-08-11.)
> Hazırlayan: ana-şerit, 2026-08-27 (owner isteği: "paket yayın ve repo taşıma işlerine bakalım").

## 1. Mevcut-durum envanteri (disk/registry-doğrulanmış)

| Varlık | Durum | Kanıt |
|---|---|---|
| npm `verhex` | ✅ REZERVLİ — 0.0.1, maintainer verhex | `npm view verhex` (2026-08-27) |
| npm `@verhex/deckent` | ❌ HENÜZ YOK (stub hazır) | E404; stub `~/verhex-deckent-reserve/` — owner: `npm publish --access=public` |
| npm `deckent` | ❌ ALINAMAZ (dedent-typosquat E403) | 2026-08-26 publish-denemesi |
| GitHub org | `Verhex` (owner'da) + `VerhexIO` (placeholder-user, redirect-koruma) | owner beyanı 2026-08-26 |
| Dev repo | `Verhex/deckent-develop` (public, bilinçli) — günlük geliştirme BURADA | git remote |
| Ürün repo | `Verhex/deckent` — HENÜZ AÇILMADI (temiz ürün-reposu olacak) | owner kararı |
| package.json | name=`deckent`, version=`0.100.0`, tagless-rebaseline | brief §8.2 |
| Release workflow | otomatik publish/Release KALDIRILDI; `validate:publish` verify-only + `changelog_section` gate | brief §8.2 |
| Pack gate | `pack_category_baseline` güncel (63-modül büyüme 2026-08-26'da baseline'landı) | scripts/pack-baseline.json |
| Rename analizi | codex-session'da sürüyor — EXECUTION ana-şeridin (owner ataması: "sonra senin işin") | owner 2026-08-26 |

## 2. Bağlayıcı sıralama-bağı (MASTER)

**3299 `RECOVERY-BORN-490-REPLAY-CERTIFICATION-001` başlığı gereği replay-ladder
sertifikasyonu "publish planning resumes" ÖNKOŞULUDUR.** Yani yayın-execution'ı,
onaylı ladder dalgası (3301→3302→3304→3299) kapanmadan başlayamaz. Bu plan o yüzden
"hazırlık şimdi, execution ladder-sonrası" kurgusundadır. (Ladder-dalga bağımlılıkları:
3300/3295/3303 şu an VERIFY — dalga-tasarımında önce bunların kapanış-doğrulaması gerekir.)

## 3. Faz planı

### F0 — Rezerv tamamlama (owner-manuel, BUGÜN yapılabilir)
`cd ~/verhex-deckent-reserve && npm publish --access=public` → `@verhex/deckent` scope'u
mühürlenir. Not: scope'lu publish için npm'de `verhex` org'unun var olması gerekir
(username `verhex` ise scope otomatik onundur). Riski yok; 0.0.1 placeholder.

### F1 — Rename execution (codex-analizi + owner-admission SONRASI, ana-şerit işi)
Kapsam-sınıfları (codex analizi netleştirecek; benim ön-envanterim):
- `package.json` name (`deckent`→`verhex`) + `bin` girdisi (komut adı KARAR-3).
- CLI görünür-adlar: i18n kataloğu üzerinden (mekanizma hazır — hardcode yok, düşük-risk).
- MCP server adı + tool-önekleri (`deckent_*`) — mevcut kullanıcı-config'leri kıran sınıf;
  alias-dönemi (eski ad → typed deprecation) tasarlanmalı (NEVER-MVP: sessiz kırılma yok).
- Docs/README/IDENTITY + repo-içi ürün-adı geçişleri (docs:stats/managed-doc regen'leri).
- `.deckent/` dizin-adı ve config-yolları: **büyük karar (KARAR-4)** — geçiş-dönemi çift-okuma
  (verhex-öncelikli, deckent-fallback + typed migration) gerektirir; codex analizinin ana konusu.

### F2 — Temiz ürün-repo (`Verhex/deckent`) hazırlığı
- Repo oluşturma (owner) + branch-protection + Actions secret'ları.
- **KARAR-1 (history-politikası):** (a) fresh-start (tek squash "genesis" commit — temiz,
  closure-ledger genesis-anchor'ı yeniden kurulur) vs (b) filtered-history (git-filter-repo ile
  runtime/dogfood-artefaktları ayıklanmış geçmiş — izlenebilirlik korunur, işçilik yüksek).
- CI workflow'ları port + secret-scan taze baseline + `.deckent/` dogfood-artefaktlarının
  ürün-repoya HİÇ girmemesi (packlist zaten ayırıyor; repo-düzeyi .gitignore sıkılaştırması).
- Publish ürün-repodan yapılır (owner kararı 2026-08-26: "publish öncesi geçeceğiz o repoya").

### F3 — Publish zinciri (owner-manuel tetik; brief §8 kontratı)
1. CHANGELOG: `Unreleased` → version-section promotion (gerçek shipped-delta; boş/task-listesi yasak).
2. `npm run validate:publish` (verify-only) + pack-baseline + 20-gate + mini-full-suite.
3. Version-KARAR-2: ilk public sürüm `0.100.x` mi devam, yoksa rename ile `0.101.0` mı
   (Changed+Breaking: ürün-adı) — önerim 0.101.0 (rename = kullanıcıya görünür delta).
4. `npm publish` — HER ZAMAN Alperen elle (CLAUDE.md komut-kuralı); tag/GitHub-Release
   politikası owner-approved release policy'ye göre (şu an tagless).

### F4 — `deckent-develop` read-only arşivleme
Ürün-repo canlı + ilk publish sonrası: deckent-develop'a archive/read-only (owner GitHub
ayarı); MASTER/closure-ledger authority'sinin hangi repoda yaşayacağı **KARAR-5** (önerim:
geliştirme deckent-develop'ta sürdüğü sürece authority orada kalır; tam-taşınma ayrı outcome).

## 4. Owner karar-listesi (bu dokümanın tüketim-koşulu)

1. **History-politikası:** fresh-start mı filtered-history mi? (Önerim: fresh-start —
   closure-ledger public-anchor zaten owner-verified; dev-tarihçesi deckent-develop'ta yaşamaya devam eder.)
2. **İlk public version:** 0.100.x devam mı, rename ile 0.101.0 mı? (Önerim: 0.101.0.)
3. **Bin/komut adı:** `verhex` mi, `deckent` alias'ıyla mı, ikisi mi? (Önerim: `verhex`
   birincil + bir major boyunca `deckent` alias + typed deprecation uyarısı.)
4. **`.deckent/` dizin geçişi:** çift-okuma migration mı, ilk-public'te tek-isim mi?
   (Codex analizi gelince netleşir — şimdilik açık.)
5. **MASTER/ledger authority repo'su:** taşınma zamanı/koşulu.
6. **F0 tetiği:** `@verhex/deckent` stub publish'ini ne zaman koşacaksın?

## 5. Riskler / notlar
- Ladder-önkoşulu (§2) atlanamaz — publish-execution admission'ı 3299 kapanışına bağlı.
- npm `verhex`~`vertex` benzerlik-riski publish'te AŞILDI (0.0.1 canlı) — isim güvende.
- GitHub redirect'leri: VerhexIO placeholder korunduğu sürece eski linkler kırılmaz.
- MCP tool-adı geçişi mevcut entegrasyonları (host-config'ler) kırar — alias-dönemi şart.
- Rename-execution sprint'leri DOGFOOD döngüsünden geçer (mode ON) — kendi ürünümüzle taşınırız.
