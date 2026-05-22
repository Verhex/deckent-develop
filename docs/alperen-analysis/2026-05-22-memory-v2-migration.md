# Memory V2 — Saf DB-First Geçişinin Tamamlanması — 2026-05-22

**Kapsam:** Memory V2 (SQLite DB-first) geçişinin yarım kalan kısmının tamamlanması — legacy `.brain/` kök `.md` yazıcılarının sökülmesi
**Metodoloji:** Sistematik debugging (kanıt → kök neden → düzeltme) + TDD (RED → GREEN)
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı + **iki perspektifin etkileşimi**

---

## Özet

Memory V2, projenin hafızasını (ADR, sprint öğrenimleri, tech debt, pattern, identity) tek bir SQLite veritabanında (`.brain/memory.db`) toplayan mimaridir. `.brain/exports/*.md` dosyaları bu DB'den üretilen **salt-görünüm** export'larıdır.

Geçiş yarım kalmıştı: temiz export katmanı (`runMemoryExport`) eklenmiş ama **legacy V1 dosya-yazıcıları hiç sökülmemişti**. `.brain/`'e üç koordinasyonsuz sistem yazıyordu:

1. **DB-export** — temiz (`exports/{summary,decisions,memory,debt}.md`)
2. **Legacy kök yazıcılar** — `writeRetrospective`→`MEMORY.md`+`RETRO.md`, auditor→`PATTERNS.md`, `recordRollbackInDebt`→`DEBT.md`
3. **Identity'nin 4 ayrı bozuk sistemi** — `PROJECT-IDENTITY.md`, managed `IDENTITY.md`, DB `identity` entry, `update-readme-stats`

"Silme" commit'leri hep kozmetikti: dosyayı git'ten siliyor ama writer kodunu bırakıyordu — dosya her sprint yeniden diriliyordu.

Bu çalışma (B6–B14) legacy yazıcıların tamamını söktü. **memory.db artık tek kaynak; `.brain/exports/*.md` tek görünüm.**

---

## Yapılan İş (B6–B14)

Önceki oturumlar Faz 1 (gizli mantık hataları), Task #4 (DEBT.md), Faz 3 (kullanıcı-tarafı init/gitignore) ile temeli atmıştı. Bu oturum kalan altı görevi tamamladı:

### B6 — `PROJECT-IDENTITY.md` yazıcısı tam söküm
`updateProjectIdentity` (her sprint finalize'da `.brain/PROJECT-IDENTITY.md` yazıyordu) + CLI/MCP init stub'ları + içerik üretici helper'lar (`generateProjectIdentity`, vitest/coverage tarayıcıları) söküldü. Identity tek kaynağı artık memory.db `identity` entry'si + managed `.deckent/workspace/IDENTITY.md`.
**Kanıt:** RED testi — `init` PROJECT-IDENTITY.md yazıyordu (`expected 0, got 1`) → yazıcılar sökülünce GREEN.

### B10 — Debt entry `sprint_id` NULL düzeltmesi
`handleEvaluation`'ın debt insert'i `sprint_id: task.sprintId` kullanıyordu; `Task.sprintId` opsiyonel olduğu için yokken debt satırı NULL `sprint_id` ile düşüyordu — sprint-range hafıza sorguları, escalation ve decay bu satırları sessizce atlıyordu. Fix: yoksa `task.id`'den (`NNN-MMM`) sprint türetiliyor. deckent-dev DB'sinde 122 legacy NULL satır backfill edildi.

### B7 — `PATTERNS.md` yazıcısı söküm
`addRecurringPatternsToFile` (ölü kod) kaldırıldı. `detectPatterns` DB-yazıcı olarak yeniden yazıldı — auditor ihlal pattern'lerini memory.db `pattern` entry'lerine yazıyor (scan-loop'taki çift inline blok içine katlandı).

### B9 — DB `identity` entry tazeleme bağlantısı
DB `identity` entry'si 2026-04-16'dan beri donuktu (hiçbir şey sprint sonrası tazelemiyordu). `syncIdentityToDb` eklendi — managed `IDENTITY.md`'i DB entry'sine mirror'lıyor; `runPostFinalizeHooks` Step 1b olarak bağlandı.

### B8 — `MEMORY.md` / `RETRO.md` yazıcısı söküm
`writeRetrospective` artık yalnızca memory.db'ye yazıyor (RETRO.md/MEMORY.md dosya yazımı + archive kaldırıldı). 4 finalizer yan-yazıcısı (rubric/adaptive/code-verified/gate-failure) DB retro entry'sine append ediyor. `deckent retro`, MCP `retro`, `deckent explain` (CLI+MCP), `api/server` `/api/memory`, `deckent sync` ve `doctor` brain-dir check'i DB'ye/exports'a bağlandı.

### B14 — Disk temizliği
`.brain/{MEMORY,RETRO,PATTERNS,DEBT,PROJECT-IDENTITY}.md` silindi. `ERRORS.md` korundu (hâlâ dosya-tabanlı hata logu — DB'ye taşınmadı).

---

## Uygulanan Değişiklikler

| Alan | Değişiklik |
|------|-----------|
| `orchestra/sprint-retro-writer.ts` | `writeRetrospective` dosya yazımı söküldü; `appendRetroSection` DB-helper eklendi |
| `orchestra/sprint-finalizer.ts` | PROJECT-IDENTITY bloğu kaldırıldı; 4 RETRO.md append → `appendRetroSection` |
| `orchestra/sprint-docs-updater.ts` / `sprint-docs-helpers.ts` | `updateProjectIdentity` + render helper'ları + `addRecurringPatternsToFile` söküldü |
| `orchestra/debt-manager.ts` | debt insert `sprint_id` türetme fallback'i (B10) |
| `core/identity-generator.ts` | `syncIdentityToDb` + post-finalize Step 1b |
| `monitor/auditor.ts` | `detectPatterns` → memory.db `pattern` entry yazıcısı |
| `cli/commands/{retro,explain,retro-parser,sync,doctor,doctor-checks,init-steps}.ts` | RETRO.md/MEMORY.md okuyucuları + sync yazıcısı + doctor health → DB-first |
| `mcp/tools/{retro,explain,init}.ts` | MCP retro/explain DB-first; init stub'ları kaldırıldı |
| `api/server.ts` | `/api/memory` → `exports/memory.md` görünümü |
| `.brain/` | 5 legacy kök `.md` dosyası silindi |
| Testler | ~70 test DB-tabanlı yeniden yazıldı; `write-retrospective.test.ts` eklendi; tüm B-görevleri TDD RED→GREEN |

**Doğrulama:** `tsc --noEmit` temiz; tam test paketi 16.700 test geçti; geçiş kaynaklı 0 regresyon (kalan başarısızlıklar github/workflows, docs config, nervous config gibi önceden var olanlar).

---

## Perspektif 1 — Deckent Dogfooding (Deckent'i geliştiren)

- **Hata dogfooding ile görüldü.** Yarım geçiş, deckent'in **kendi üzerinde çalışması** sayesinde keşfedildi: deckent-dev'in `.brain/`'inde 3 koordinasyonsuz yazıcı, donuk dosyalar (identity 2026-04-16'dan, IDENTITY.md sprint-173'ten), `DEBT.md` format bozulması (7-vs-9 sütun, trailing-newline yok → satır birleşmesi) gözle görülür hale gelmişti.
- **deckent-dev DB'si entegrasyon testidir.** 122 NULL `sprint_id` debt satırı ve donuk `identity` entry'si — bunlar dogfooding artefaktlarıydı; hem hatayı kanıtladılar hem de düzeltmeyi doğruladılar.
- **Risk düşük, geri-bildirim hızlı.** deckent-dev'de bir geçiş hatası = can sıkıcı ama kurtarılabilir (Alperen görür). Bu, agresif refactor'a (legacy yazıcıların tam sökümü) güven verdi.

## Perspektif 2 — Deckent Ürün Kullanıcısı (Deckent'i kendi projesinde kullanan)

- **Düzeltme ürün-genelinde.** Legacy yazıcılar **koşulsuz, her kullanıcı projesinde** çalışıyordu. Her `deckent init` artık saf DB-first kuruluyor — `.brain/` kök `.md` stub'ı üretilmiyor.
- **5 MB binary commit durdu.** `deckent init` `updateGitignore`'u `memory.db`'yi ignore etmiyordu (Faz 3/B11'de düzeltildi) — kullanıcı 5 MB'lık binary'yi commit'liyordu.
- **Sessiz veri kaybı önlendi.** Aynı hata kullanıcıya gitseydi: kullanıcının `.brain/`'inde koordinasyonsuz yazıcılar, donuk identity, bozuk debt tablosu — fark edilmeden. Kullanıcı için risk yüksek, geri-bildirim yok.
- **CLI/MCP paritesi.** MCP `deckent_init` ile CLI `deckent init` artık aynı DB-first kuruluşu üretiyor.

## Perspektif 3 — İki Perspektifin Etkileşimi

Bu geçişin asıl öğretici yanı, iki perspektifin **birbirini nasıl beslediği ve birbiriyle nasıl gerildiğidir.**

**1. Dogfooding hatayı bulur, kullanıcı perspektifi disiplini dayatır.**
deckent-dev'in `.brain/`'i hatayı görünür kıldı (dogfooding'in hızlı geri-bildirimi). Ama düzeltmenin *nasıl* yapılacağını **kullanıcı riski** belirledi: her writer söküldükten sonra graceful no-op (`existsSync` guard'ları), TDD RED→GREEN zorunluluğu, kısmi-DB durumlarında çökmeme — bunlar deckent-dev için "aşırı" görünebilir ama kullanıcı projesinde sessiz veri kaybını önleyen tek şey. Dogfooding "neyi düzelt"i, kullanıcı perspektifi "ne kadar dikkatli düzelt"i söyledi.

**2. Tek kod tabanı, iki veri gerçekliği — B10 bu gerilimin somut hâli.**
deckent-dev'in DB'si 186 sprintlik tarihçeyle dolu; taze bir kullanıcı projesi boş başlar. B10'da bu ayrıştı: **kod düzeltmesi** (debt insert `sprint_id` fallback'i — ürüne giden, tüm kullanıcıları koruyan) ile **veri backfill'i** (deckent-dev'in 122 legacy NULL satırı — yalnızca dogfooding örneğine özel data-op) bilinçle ayrı tutuldu. "Ne ship edilir, ne yerel hijyendir" ayrımı bu migration'ın tekrar eden kararıydı (B9 identity entry'si de aynı: kod wire ship edilir, deckent-dev'in donuk entry'si bir sonraki finalize'da kendiliğinden tazelenir).

**3. Dogfooding, kullanıcı deneyiminin "sıfırıncı kullanıcısı"dır.**
`deckent init`'in DB-first kuruluşu, `deckent retro`/`explain`'in DB'den okuması, `doctor`'ın `memory.db` varlığını kontrol etmesi — bunların hepsi önce deckent-dev'de "ilk kullanıcı" olarak test edildi. deckent-dev'de `doctor`'ın `MEMORY.md eksik` diye kalıcı yanlış-alarm vermesi (B8'de düzeltildi), bir kullanıcının yaşayacağı kafa karışıklığının önizlemesiydi.

**4. Gerilim: dogfooding kolaylığı vs. kullanıcı saflığı.**
deckent-dev `.brain/exports/`'unda tasarım dokümanları (`sprint-144/145` spec'leri, `cli-mcp-parity-gap.md`) birikmişti — dogfooding sırasında "elverişli yer" olduğu için. Ama `exports/` kullanıcı için **yalnızca üretilen görünüm** olmalı. Bu yanlış-yerleşim (B14'te işaretlendi, silinmedi) tam da dogfooding kolaylığının ürün saflığını kirlettiği noktadır — bu yüzden kullanıcı kararına bırakıldı.

**Sonuç:** Memory V2 geçişi, "deckent'i deckent ile geliştirmek" ile "deckent'i bir ürün olarak teslim etmek" arasındaki sağlıklı döngünün örneğidir: dogfooding sorunu *bulur* ve *doğrular*; kullanıcı perspektifi düzeltmenin *standardını* belirler; ikisi ayrıştığında (veri vs. kod) bu ayrım bilinçle yönetilir.

---

## Gelecek Öneriler / Açık Tartışma

1. **DB → `.md` tam export prosedürü (tartışma — Alperen 2026-05-22).** Şu an `exports/` yalnızca 4 görünüm üretir (summary/decisions/memory/debt). İki gerekçe daha kapsamlı bir export'u gündeme getiriyor:
   - **LLM'ler SQL yazamayabilir** — Brain/Worker/Auditor memory.db'yi sorgulamak için `MemoryStore` API'sine bağımlı; ham SQL üretmeleri kırılgan. Salt-okunur `.md` görünümleri LLM-dostu fallback'tir.
   - **Kullanıcı DB tercihini değiştirebilir** — backend SQLite dışına çıkarsa (ör. Postgres, ya da DB'siz mod), tam `.md` export'u taşınabilir tek-kaynak olur.
   Öneri: memory.db'deki **her** entry tipini (`sprint`, `retro`, `pattern`, `identity` dahil) kapsayan bir `runFullMemoryExport` prosedürü — `exports/`'u DB'nin tam, insan+LLM okunur aynası yapmak.
2. **`exports/` orphan temizliği.** `cli-mcp-parity-gap.md`, `sprint-144-cli-mcp-audit.md`, `sprint-145-*.md` — `exports/` otomatik-üretilen değil; `docs/`'a taşınmalı veya (eskimişse) silinmeli. Kullanıcı kararı bekliyor.
3. **ADR-046 hook kronik açığı.** Post-GA integrity-V2 kapsamında ele alınmalı (bkz. Sprint 167 DB-gap kaydı).
4. **`ERRORS.md` DB'ye taşınması.** Tek kalan dosya-tabanlı kök store; uzun vadede `type='error'` entry'leri olarak DB'ye alınabilir.
