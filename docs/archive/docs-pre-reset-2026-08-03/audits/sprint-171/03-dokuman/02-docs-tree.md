# docs/ Ağaç Denetimi — Sprint 171 Task 24

> **Denetim kapsamı:** `docs/` altındaki tüm markdown dosyaları.
> **Hariç tutulanlar:** `docs/audits/**` (kendi sprint çıktımız — recursion önle) ve `docs/superpowers/specs|plans/**` (Task 23 ve diğer audit'ler ilgileniyor; ayrıca bağlayıcı kontrat türünden tasarım dosyaları, doküman ağacı reorg konusu değil).
> **Toplam kapsanan dosya:** **183 markdown** (yukarıdaki exclude'lar düşülmüş hâl).
> **Çıktı dili:** Türkçe (DIRECTIVES Worker Contract zorunlu kuralı).
> **Yöntem:** dizin envanteri + her dosya için doğruluk/gereklilik/içerik/referans + 8-badge atama + Sprint 172 reorg önerisi.
> **Audit-only:** kaynak/test/config/db hiçbir dosya değiştirilmedi. Yalnızca tek rapor: bu dosya.

---

## 1. Bulgular

### 1.1 Yapısal Bulgular

**B1 — Doküman dağınıklığı (CRITICAL).** `docs/` dizini 17 farklı alt dizin + 4 kök dosya barındırıyor (CHANGELOG, KNOWN_ISSUES, ROADMAP-GOD-LEVEL, SPRINT-LOG, index, worker-guide). Aynı amaca hizmet eden dosyalar farklı kategorilerde tekrarlanıyor (3 roadmap, 3 worker-guide, 3 reference çifti — aşağıda). OSS GA öncesinde "yeni kullanıcı 30 saniyede ne okuyacak?" sorusunun cevabı belirsiz.

**B2 — VitePress sidebar ile dosya sistemi arasında derin tutarsızlık (CRITICAL).** `docs/.vitepress/config.ts:30-40` `srcExclude` listesi yedi alt dizini ve iki kök dosyayı build dışında bırakıyor: `directives/`, `analysis/`, `archive/`, `release/`, `development/`, `architecture/`, `reference/`, `SPRINT-LOG.md`, `CHANGELOG.md`. Aynı dosyada `config.ts:14` `ignoreDeadLinks: true` flag'i set, ve `config.ts:55-77` nav menüsü ile `config.ts:80-163` sidebar listesi `/guide/architecture`, `/guide/brain`, `/guide/workers`, `/reference/cli`, `/reference/config`, `/api/*` gibi onlarca ölü URL'e link veriyor. Yani VitePress sitesi yayınlandığında **sidebar'daki linklerin çoğu 404** dönecek; `ignoreDeadLinks` sadece build'i kırılmaktan kurtarıyor, son kullanıcı 404 yiyor.

**B3 — Kanonik `docs/index.md` çok zayıf.** `docs/index.md` sadece VitePress hero + 6 feature kartı (39 satır). README-TR/EN'in zenginliği yok; "Get Started" linki `guide/getting-started.md`'ye gidiyor (mevcut) ama nav'ın çoğu yere ölü link veriyor. Kullanıcı homepage'den bir adım derinleştiğinde çoğu zaman 404.

**B4 — `docs/` kök dosyaları kategori-ihlali.** `docs/CHANGELOG.md`, `docs/KNOWN_ISSUES.md`, `docs/ROADMAP-GOD-LEVEL.md`, `docs/SPRINT-LOG.md`, `docs/worker-guide.md` dosyaları herhangi bir alt dizine ait olmadan kökte duruyor. Kategori varsa kökte dosya olmamalı; yoksa kategori uydurulmalı. Bu beş dosyanın hedefi farklı (changelog→release/, known_issues→reference/, roadmap→vision/, sprint-log→sprint-log/, worker-guide→development/).

### 1.2 Mükerrerlik Bulguları

**B5 — Üç worker-guide aynı amaca hizmet ediyor (HIGH).** Her biri "worker yaşam döngüsü + heartbeat + result + scope" anlatıyor ama içerik ve uzunluk farklı:
- `.deckent/workspace/WORKER-GUIDE.md` (215 satır) — **kanonik kaynak**, worker prompt'unda referans (`Task → "See .deckent/workspace/WORKER-GUIDE.md"`).
- `docs/development/worker-guide.md` (707 satır) — uzun "Master Blueprint §5.3" türevi. Section 1-15 detaylı.
- `docs/worker-guide.md` (125 satır) — kısa çoğaltma; tek başına ne kanonik ne de uzun referans.

Üç dosyanın da içeriği zamanla drift edecek; tek kanonik ve diğerleri redirect/silme olmalı.

**B6 — Üç roadmap dosyası (HIGH).** Aynı amaç (gelecek planı), farklı kapsam:
- `docs/ROADMAP-GOD-LEVEL.md` (763 satır, 51KB) — Sprint 149-200 anchor, "OpenClaw'ın god-level üstün hali" iddiası.
- `docs/vision/roadmap.md` (391 satır, 13KB) — "Install it. Run it. Own it." product roadmap.
- `docs/release/roadmap.md` (4.5KB) — daha kısa release-time roadmap.

Kullanıcı hangisinin canlı plan olduğunu anlayamaz. Bir tane CANONICAL (vision/roadmap.md daha temiz), god-level şişkin doc → ya vision/roadmap-extended.md ya da `.deckent/internal/` altına çekilmeli, release/roadmap.md silinmeli.

**B7 — Üç reference çifti (HIGH).** `docs/reference/` altında üç ayrı dosya ikilemesi:
- `api.md` (2246 satır — programmatic TypeScript API) vs `api-examples.md` (969 satır — HTTP API integration). İsimler içerik ile uyumsuz: `api.md` "programmatic", `api-examples.md` aslında "http". Birleştirme veya açık adlandırma (`api-programmatic.md` + `api-http.md`) lazım.
- `cli.md` (935 satır — auto-generated `npm run docs:generate-cli`) vs `cli-commands.md` (1087 satır — Sprint 151 audit, "104 endpoint"). İkincisi eski + içerik şişirilmiş (IDENTITY.md "55+" diyor, `cli-commands.md` 104 diyor — Sprint 151'de yine drift). Birini sil.
- `config.md` (366 satır — kanonik TR/EN karışık, "alias yoktur" diyor) vs `config-reference.md` (556 satır — sade EN). İkisi de aynı kapsamı kaplıyor; tek dosya yeter.

**B8 — `docs/CHANGELOG.md` vs root `CHANGELOG.md` drift (HIGH).** Root `CHANGELOG.md:3` "See [docs/CHANGELOG.md] for the full changelog" diyor ama root dosyası Sprint 156'dan başlayarak detaylı manuel notlar içeriyor (190 satır), `docs/CHANGELOG.md` ise auto-generated görünüyor (2703 satır, Keep a Changelog format, sprint 169-170 zaten dup başlıkla yazılmış — `docs/CHANGELOG.md:9` ve `:22` ikisi de `[1.0.0-beta.1-sprint170]`). Tek kaynak (canonical) belirlenmeli; npm publish için root CHANGELOG.md npm standart yeri olduğundan kanon root olmalı, docs/ versiyonu silinmeli ya da redirect.

**B9 — `docs/launch/CONDUCT.md` vs root `CODE_OF_CONDUCT.md` mükerrer (NORMAL).** İkisi de Code of Conduct, ama:
- Root `CODE_OF_CONDUCT.md` Contributor Covenant.
- `docs/launch/CONDUCT.md` özelleştirilmiş "Deckent community" versiyonu.
İkisi farklılaşmış. GitHub repo'sunda kök zorunlu (community standards), launch/CONDUCT.md silinmeli; community-specific eklemeler kök dosyaya merge.

**B10 — ADR-046 iki dosya (NORMAL).** `docs/adr/046-brain-self-update-hook.md` (80 satır, "Sprint 169 H1 amendment") + `docs/adr/046-brain-self-update-hook-architecture.md` (348 satır, ana doc). ID çakışması: ADR-036 governance kuralları "her ADR tek dosyada" diyor; tek dosya + Amendment section daha iyi.

**B11 — `docs/analysis/full-audit.md` vs `docs/archive/full-audit-pre036.md` (LOW).** `docs/analysis/full-audit.md:1` zaten "ARCHIVED, kopya `docs/archive/full-audit-pre036.md`'de" notu var. Dolayısıyla `docs/analysis/full-audit.md` silinebilir — kopya archive'da zaten.

**B12 — `docs/launch/blog-devto-launch.md` vs `blog-hashnode-launch.md` (LOW).** Aynı blog yazısının iki platform-specific versiyonu. Front-matter farklı (dev.to: `published: false`, hashnode: `subtitle: ...`), giriş paragrafları farklı. Aynı kampanya. Kaynak dosya: ortak markdown + platform-front-matter overlay önerilir; ama OSS GA için iki ayrı kalabilir (platform farkı).

### 1.3 Doğruluk ve Güncellik Drifti

**B13 — `docs/.vitepress/config.ts` sidebar canlı kod ile uyumsuz (CRITICAL doc-vs-code).** Sidebar `'/guide/configuration'`, `'/guide/architecture'`, `'/guide/brain'`, `'/guide/workers'`, `'/guide/auditor'`, `'/guide/skills'`, `'/guide/mcp'`, `'/guide/mcp-tools'`, `'/guide/mcp-resources'`, `'/guide/plugins'`, `'/guide/writing-plugins'`, `'/guide/plugin-api'`, `'/guide/publishing-plugins'`, `'/reference/cli-start'`, ..., `/api/rest`, `/api/health`, ... gibi onlarca dosya gösteriyor; `docs/guide/`'da sadece 7 dosya (`concepts.md`, `deckent-nedir.md`, `docker-backend.md`, `faq.md`, `first-sprint.md`, `getting-started.md`, `quickstart.md`) var. Yani VitePress oluştuğu zaman sidebar'ın çoğu link 404. `ignoreDeadLinks: true` bu UX hatasını saklıyor.

**B14 — `docs/architecture/authority-matrix.md:3` ölü link (HIGH).** `.brain/DECISIONS.md#adr-037` linkine atıfta bulunuyor. `.brain/DECISIONS.md` dosyası **YOK** — Memory V2 DB-first migrasyonu sonrası `.brain/exports/decisions.md` kullanılıyor (Sprint 166, ADR-046). Aynı linkler `docs/audits/sprint-149/doc-review-report.md` (Sprint 149) ve `sprint-150/doc-review-report.md`'de de tespit edilmiş ama hâlâ düzeltilmemiş — kronik drift.

**B15 — `docs/development/brain-guide.md`, `dashboard-guide.md`, `troubleshooting.md`, `reference/performance.md` UPPERCASE referansları ölü (HIGH).** `ARCHITECTURE.md`, `API.md`, `CONFIG-REFERENCE.md`, `SPRINT-LIFECYCLE.md`, `MEMORY-SYSTEM.md` gibi linkler kullanılıyor; gerçek dosyalar lowercase (`architecture.md`, `api.md`, `config-reference.md`, `sprint-lifecycle.md`, `memory-system.md`). Linux/macOS'ta case-sensitive — 404 garanti.

**B16 — `docs/directives/INDEX.md` son güncelleme Sprint 065 (HIGH).** Tablo Sprint 027-065'i listeliyor; `docs/directives/` dizininde Sprint 100, 101, 102, 143, 144, 145 dosyaları VAR ama tabloda yok. INDEX dosyası tarihi `2026-03-26` — neredeyse iki ay eski. Otomatik üretim hook'u yok.

**B17 — `docs/reference/health-check.md` Sprint 065 (NORMAL).** "Last audit: 2026-03-26 (Sprint 065)" — Sprint 167 olduğumuza göre 100+ sprint güncellenmemiş. İçerikteki sayılar (test count, agent count) bugünkü gerçeklikle uyumsuz olabilir; doğrulayalım: IDENTITY.md `12,485 test, 15 agent` diyor — health-check.md o tarihte `~12,000 test` civarındaydı, drift sınırlı ama hâlâ stale işaret.

**B18 — `docs/guide/faq.md` "Sprint 065" (NORMAL).** "Last Updated: Sprint 065 | Language: English". Bir yıllık eski. FAQ kullanıcının ilk geleceği yerlerden biri; güncellenmemiş FAQ "ölü proje" sinyali verir.

**B19 — `docs/guide/deckent-nedir.md` "Sprint 099" (NORMAL).** "Son güncelleme: 2026-04-06 (Sprint 099)", "790+ kaynak dosya, 12.193+ test, 96%+ coverage" diyor. IDENTITY.md "12,485 test + 16 skipped, 89.33% coverage" diyor. Coverage iddiası gerçek değerden 7 puan yüksek + dosya sayısı çok düşük (94+76+20+... ≈ 200+ dosya bile vermek mümkün). Drift.

**B20 — `docs/guide/getting-started.md` ile `docs/guide/quickstart.md` mükerrer (NORMAL).** İkisi de "5 dakikada ilk sprint" üzerine. İçerikleri ufak farklı. Birini sil.

**B21 — `docs/release/release-notes.md` `v0.2.0-beta.1` (NORMAL).** Mevcut versiyon `1.0.0-beta.1` (IDENTITY.md), release-notes hâlâ 0.2.0 anlatıyor. Sprint 165/166 final state dosyaları varken bu dosya stale.

**B22 — `docs/release/public-repo-manifest.md` "Sprint 150 update — Sprint 151'de Alperen flip edecek" (NORMAL).** Sprint 167. Flip hâlâ yapılmadı (Sprint 171 GO → Sprint 172 OSS GA conditional). İçerik güncel değil; manifest "Sprint 172 conditional" tablosuyla yenilenmeli.

**B23 — `docs/release/sprint-165-final-state.md` sprint-specific snapshot (NORMAL).** Sprint 165 kapanış pozisyonu; iyi bir tarihsel artifact ama `release/` dizininde durması yanlış kategori. `archive/sprint-snapshots/` benzeri bir yere taşınmalı.

**B24 — `docs/reference/cli-commands.md` "104 endpoint" iddiası (NORMAL).** DECKENT.md ve IDENTITY.md "55+ CLI command" diyor. Sprint 151 audit'i `cli-commands.md`'i 45 ana + 59 alt = 104 endpoint olarak saymış — alt-komutları da sayıyor. Tek bir doğru kaynak yok; iki doc çelişiyor. Tek kanonik say (örn. `npm run docs:generate-cli` ile) → her yere yansıyacak.

**B25 — `docs/reference/features.md` auto-generated, kaynak değişikliklerinden geri kalmış olabilir (NORMAL).** "Run `node scripts/sync-manifest.mjs` to regenerate." — script çalıştırılmadığı sürece stale. Hooks ile bağlanmalı.

**B26 — `docs/architecture/agent-skill-architecture.md` "Historical" notu (NORMAL).** Header'da "pre-Sprint 029, mostly implemented" diyor; aktif reference değil. `archive/`'a taşı.

**B27 — `docs/sprint-log/Sprint-146.md` + `Sprint-148.md` sadece 2 dosya (LOW).** Eğer sprint log dizini ise 146, 147, 148, 149, ... olmalı; 2 dosya = abandoned dizin. `.brain/sprints/sprint-NNN.md` kanonik yer; bu dizin dağınık snapshot. Sil veya `.brain/`'a merge.

**B28 — `docs/SPRINT-LOG.md` 4611 satır tek dosya (LOW).** Tek bir dev günlüğü hâline gelmiş; çok büyük. `.brain/sprints/sprint-NNN.md` ile drift. İçerik dağıtılmalı veya tamamen silinmeli (DB-first sonrası gerek yok).

**B29 — `docs/KNOWN_ISSUES.md` Sprint 152 (LOW).** "Last updated: 2026-04-24 (Sprint 152 post-migration audit)". Sprint 167. 15 sprint eski. Her sprint güncellenmeli ya da otomatik üretilmeli.

**B30 — `docs/analysis/sprint-metrics.md` "Updated after each sprint" iddiası (NORMAL).** İlgili otomasyon hook'u yok; kullanıcıya yalan vaat.

**B31 — `docs/launch/announce-*.md` ve `discord/telegram-bot-setup.md` Sprint 151 hazırlığı (INFO).** OSS GA sırasında copy-paste kaynağı; flip sonrasına kadar internal/preparation. Şu an `docs/launch/` dizininde olmaları doğru ama yayın hazırken `docs/launch/archive/` benzeri bölünme gerekebilir.

### 1.4 Referans Bütünlüğü

**B32 — Cross-dizin link disiplini yok (NORMAL).** `docs/governance/INDEX.md` `../../DECKENT-ANA-PLAN-TR.md`, `../../.brain/exports/summary.md` gibi yukarı çıkan linklerle dolu — yapı değiştiğinde toplu kırılma riski. `docs/launch/announce-*`, `docs/release/*` çoğunlukla `VerhexIO/deckent` public path'i kullanıyor (doğru — flip sonrası geçerli olacak), `docs/release/sprint-165-final-state.md:152` yalnız `VerhexIO/deckent → VerhexIO/deckent` flip planını anlatıyor (bilgi amaçlı, sorun değil).

**B33 — `docs/architecture/architecture.md` "Sprint 100+" header'ı (INFO).** Header "Single comprehensive architectural reference" diyor ama Sprint 167. Hızlı arttığımız için sayılar geri kalmıştır; reorg sırasında refresh.

---

## 2. Severity

| Bulgu | Severity | Etki | Sınıflandırma |
|---|---|---|---|
| B1 Doküman dağınıklığı | CRITICAL | OSS-GA blocker — yeni kullanıcı kayıp | yapısal |
| B2 VitePress sidebar 404 üretiyor | CRITICAL | Yayınlanan dokümantasyon kırık | yapısal/UX |
| B13 Sidebar kod ile uyumsuz | CRITICAL | Doküman site UX kırık | doc-vs-code drift |
| B14 authority-matrix DECISIONS.md ölü link | HIGH | Mimari kaynak ölü | referans |
| B15 UPPERCASE referans ölü linkler | HIGH | Linux/macOS'ta 404 garanti | referans |
| B5 Üç worker-guide | HIGH | Drift kaynağı, OSS confusion | mükerrerlik |
| B6 Üç roadmap | HIGH | Hangisi kanon? | mükerrerlik |
| B7 Üç reference çifti | HIGH | İçerik confusion | mükerrerlik |
| B8 CHANGELOG drift | HIGH | npm publish artifact | mükerrerlik |
| B16 directives INDEX Sprint 065 stale | HIGH | Tablo gerçek dosya listesi ile farklı | doğruluk |
| B3 docs/index.md çok zayıf | HIGH | Homepage UX |  içerik |
| B4 Kök dosyalar kategori-ihlali | NORMAL | Düzen | yapısal |
| B9 launch/CONDUCT.md mükerrer | NORMAL | GitHub community standards uyum | mükerrerlik |
| B10 ADR-046 iki dosya | NORMAL | ADR governance | mükerrerlik |
| B17 health-check Sprint 065 | NORMAL | İçerik stale | güncellik |
| B18 faq Sprint 065 | NORMAL | İlk-temas UX | güncellik |
| B19 deckent-nedir Sprint 099 + sayı drift | NORMAL | Coverage/test sayısı yanlış | doğruluk |
| B20 getting-started + quickstart mükerrer | NORMAL | UX | mükerrerlik |
| B21 release-notes v0.2.0 | NORMAL | Sürüm bilgisi yanlış | güncellik |
| B22 public-repo-manifest Sprint 150 | NORMAL | Flip artifact stale | güncellik |
| B23 sprint-165-final-state yanlış kategoride | NORMAL | Düzen | yapısal |
| B24 cli-commands "104" çelişki | NORMAL | Sayı drift | doğruluk |
| B25 features.md auto-gen ama hook yok | NORMAL | Stale risk | süreç |
| B26 agent-skill-architecture historical | NORMAL | Aktif reference değil | düzen |
| B11 full-audit ile pre036 mükerrer | LOW | Açık archived | mükerrerlik |
| B12 devto/hashnode blog mükerrer | LOW | Kampanya copy | mükerrerlik |
| B27 sprint-log dizini 2 dosya | LOW | Abandoned dizin | düzen |
| B28 SPRINT-LOG.md 4611 satır | LOW | DB-first sonrası gereksiz | güncellik |
| B29 KNOWN_ISSUES Sprint 152 | LOW | Stale | güncellik |
| B30 sprint-metrics otomasyon iddiası | NORMAL | Yalan vaat | doğruluk |
| B31 launch artifacts hazırlık | INFO | Flip sonrası reorg | düzen |
| B32 Cross-dizin link disiplini | NORMAL | Reorg sırasında kırılma riski | referans |
| B33 architecture.md "Sprint 100+" | INFO | Header güncellenmemiş | güncellik |

**Toplam:** 3 CRITICAL, 8 HIGH, 16 NORMAL, 4 LOW, 2 INFO = 33 bulgu.

CRITICAL bulgular bu raporun başarısızlığı değil; aksine **bu raporun amacı** budur — OSS-GA öncesi yapısal blocker'ları yüzeye çıkarmak. Sprint 171 orchestration sağlığı bu bulgular fazla olduğu için NO_GO sayılmaz (DIRECTIVES dual-gate kuralı).

---

## 3. Kanıt

| Bulgu | Kanıt (file:line) |
|---|---|
| B2/B13 | `docs/.vitepress/config.ts:14` (`ignoreDeadLinks: true`), `:30-40` (`srcExclude`), `:55-77` (nav), `:80-163` (sidebar), `:82-122` (`/guide/architecture`, `/guide/brain` vb. yok), `:124-149` (`/reference/cli-start` vb. yok), `:150-163` (`/api/*` dizini bile yok) |
| B14 | `docs/architecture/authority-matrix.md:3` `[ADR-037](../../.brain/DECISIONS.md#adr-037-...)` → `.brain/DECISIONS.md` dosyası yok; geçmiş audit'ler `docs/audits/sprint-149/doc-review-report.md:546`, `docs/audits/sprint-150/doc-review-report.md:549` bu drift'i raporladı, hâlâ düzeltilmedi |
| B15 | `docs/development/brain-guide.md:3` `[ARCHITECTURE.md](ARCHITECTURE.md)` `[API.md]`; `docs/development/dashboard-guide.md:3` benzer; `docs/development/troubleshooting.md:3` `DECKENT-MASTER-BLUEPRINT.md §3.4, §5...` (kök doc geçerli) AMA `docs/reference/performance.md:3` `Reference: CONFIG-REFERENCE.md, ARCHITECTURE.md, SPRINT-LIFECYCLE.md` UPPERCASE → mevcut dosyalar lowercase |
| B5 | `.deckent/workspace/WORKER-GUIDE.md` (215 satır, prompt'tan ref), `docs/worker-guide.md:1-126` (125 satır), `docs/development/worker-guide.md:1-707` (707 satır, "§5.3 Worker Agent") |
| B6 | `docs/ROADMAP-GOD-LEVEL.md:1-5` ("CANONICAL — Sprint 149-200 anchor"), `docs/vision/roadmap.md:1-5` ("Install it. Run it. Own it."), `docs/release/roadmap.md` (4.5KB, ayrı kanon iddiası) |
| B7 | `docs/reference/api.md:1` ("Programmatic TypeScript API"), `docs/reference/api-examples.md:1` ("HTTP API"); `docs/reference/cli.md:3` ("Auto-generated"), `docs/reference/cli-commands.md:3-4` ("Sprint 151, 104 command endpoints"); `docs/reference/config.md:1-5` (kanonik iddiası), `docs/reference/config-reference.md:1-5` (paralel referans) |
| B8 | `CHANGELOG.md:3` ("See [docs/CHANGELOG.md] for full changelog") + `:5-46` Sprint 156 detayı; `docs/CHANGELOG.md:9` ve `:22` ikisi de `[1.0.0-beta.1-sprint170] - 2026-05-15` (auto-gen yinelenmiş) |
| B9 | `CODE_OF_CONDUCT.md:1` ("Contributor Covenant Code of Conduct"); `docs/launch/CONDUCT.md:1-7` ("Deckent community" özelleştirilmiş) |
| B10 | `docs/adr/046-brain-self-update-hook.md` (80 satır, "Sprint 169 amendment"), `docs/adr/046-brain-self-update-hook-architecture.md` (348 satır, ana doc) — iki ayrı dosya, aynı ID |
| B16 | `docs/directives/INDEX.md:39` `Son güncelleme: 2026-03-26 (Sprint 065)`; `docs/directives/` dizininde `sprint-100.md`, `sprint-101.md`, `sprint-102.md`, `sprint-143.md`, `sprint-144.md`, `sprint-145.md` mevcut ama INDEX tablosunda yok |
| B17 | `docs/reference/health-check.md:1-3` "Last audit: 2026-03-26 (Sprint 065)" |
| B18 | `docs/guide/faq.md:3` "Last Updated: Sprint 065 \| Language: English" |
| B19 | `docs/guide/deckent-nedir.md:3` "Son güncelleme: 2026-04-06 (Sprint 099) ... 790+ kaynak dosya, 12.193+ test, 96%+ coverage" — IDENTITY.md gerçek `12,485 test + 16 skipped, 89.33%` |
| B20 | `docs/guide/getting-started.md:3` "Your first AI-orchestrated sprint in under 5 minutes" vs `docs/guide/quickstart.md:3` "Get from zero to your first AI-driven sprint in 5 minutes" |
| B21 | `docs/release/release-notes.md:1` "Deckent v0.2.0-beta.1 — Release Notes" (mevcut: 1.0.0-beta.1) |
| B22 | `docs/release/public-repo-manifest.md:3` "Status: Sprint 150 güncellemesi — Sprint 151'de Alperen tarafından manuel olarak flip edilecek" — Sprint 167 hâlâ flip yok |
| B23 | `docs/release/sprint-165-final-state.md:1-5` (Sprint 165 spesifik snapshot, release/ kategorisi yerine archive aday) |
| B24 | `docs/reference/cli-commands.md:4` "Total: 45 top-level commands + 59 subcommands = 104 command endpoints" vs IDENTITY.md `CLI Commands: 55+` |
| B25 | `docs/reference/features.md:3` "Auto-generated from `.deckent/features-manifest.json`. Run `node scripts/sync-manifest.mjs` to regenerate." — hook bağlanmamış |
| B26 | `docs/architecture/agent-skill-architecture.md:3` "Status: Historical (mostly implemented). Note: pre-Sprint 029 ..." |
| B11 | `docs/analysis/full-audit.md:1` "ARCHIVED ... A copy of this file is preserved in `docs/archive/full-audit-pre036.md`" |
| B12 | `docs/launch/blog-devto-launch.md:1-6` front-matter vs `docs/launch/blog-hashnode-launch.md:1-10` front-matter (aynı başlık, farklı platform fields, içerik divergent) |
| B27 | `docs/sprint-log/` dizini sadece `Sprint-146.md` + `Sprint-148.md` içeriyor (`Sprint-147.md` ya da daha yenisi yok) |
| B28 | `wc -l docs/SPRINT-LOG.md` → 4611 satır; `.brain/sprints/sprint-NNN.md` kanonik kaynak |
| B29 | `docs/KNOWN_ISSUES.md:3` "Last updated: 2026-04-24 (Sprint 152 post-migration audit)" — Sprint 167 |
| B30 | `docs/analysis/sprint-metrics.md:3` "Tracking every sprint from inception to beta. Updated after each sprint." — manuel, otomasyon yok |
| B31 | `docs/launch/announce-final.md:1-3` "Sprint 165 GA ... Sprint 166 sonrası kullanıma hazır" |
| B32 | `docs/governance/INDEX.md:9-23` çoklu `../../...` cross-dizin linkler; reorg kırılma yüzeyi |
| B33 | `docs/architecture/architecture.md:3` "Version: Sprint 100+" |

---

## 4. Öneriler

### 4.1 Kısa Vade (Sprint 171→172 Geçiş, Pre-Public-Flip)

**Ö1 — VitePress sidebar gerçeklikle hizala (CRITICAL).** İki seçenek:
- **(a) Sidebar'ı temizle:** `config.ts` nav + sidebar'dan mevcut olmayan tüm linkleri çıkar. `ignoreDeadLinks: false` yap. Build kırılırsa bu doğru sinyal — eksik dosyaları ekleyene kadar build kırık kalmalı.
- **(b) Dosyaları üret:** Sidebar'da listelenen ama olmayan dosyaları (örn. `/guide/architecture.md`, `/guide/brain.md`, `/reference/cli-start.md`) gerçekten oluştur. Daha çok iş ama UX kazanan.

Önerilen: kısa vade (a), sonra Sprint 172 kapsamında (b) wave.

**Ö2 — Üç worker-guide → 1 (HIGH).** `.deckent/workspace/WORKER-GUIDE.md` kanonik. `docs/worker-guide.md` ve `docs/development/worker-guide.md` ya tam silin ya da tek satır redirect (`# Worker Guide\nMoved: see .deckent/workspace/WORKER-GUIDE.md`). Worker prompt çağrıları korunur.

**Ö3 — Üç roadmap → 1 (HIGH).** Kanon = `docs/vision/roadmap.md`. `docs/release/roadmap.md` sil. `docs/ROADMAP-GOD-LEVEL.md` ya vision/roadmap-internal.md'ye taşı + iç notlandır, ya da `.deckent/internal/roadmap-god-level.md`'e at (OSS public görünür değil).

**Ö4 — Reference çifti birleştir / yeniden isimlendir (HIGH).**
- `api.md` → `api-programmatic.md`; `api-examples.md` → `api-http.md` (içerik ile uyumlu isim).
- `cli.md` kanon (auto-gen); `cli-commands.md` sil.
- `config.md` kanon; `config-reference.md` sil.

**Ö5 — `docs/CHANGELOG.md` sil, root CHANGELOG.md kanon (HIGH).** npm publish artifact root'tadır. docs/ kopyası drift kaynağı; ya tek satır redirect ya da tam silme. Auto-gen scripti varsa root'a yazsın.

**Ö6 — Ölü linkleri düzelt (HIGH).**
- `docs/architecture/authority-matrix.md:3` → `.brain/DECISIONS.md` yerine `.brain/exports/decisions.md` veya DB-first sonrası `docs/adr/037-...md`'ye yönlendir.
- `docs/development/{brain,dashboard}-guide.md`, `troubleshooting.md`, `reference/performance.md` UPPERCASE `ARCHITECTURE.md/API.md/CONFIG-REFERENCE.md` → lowercase relative path. Otomatik düzeltme: `sed -i 's|ARCHITECTURE\.md|architecture/architecture.md|g'` benzeri ama dikkatli — Brain manuel düzelt.

**Ö7 — Kök dosyaları kategoriye taşı (NORMAL).**
- `docs/CHANGELOG.md` → sil (Ö5).
- `docs/KNOWN_ISSUES.md` → `docs/reference/known-issues.md` veya GitHub Issues'a göç.
- `docs/ROADMAP-GOD-LEVEL.md` → Ö3.
- `docs/SPRINT-LOG.md` → sil (DB-first sonrası gereksiz, kanonik `.brain/sprints/`).
- `docs/worker-guide.md` → sil (Ö2).
- `docs/index.md` kalır (VitePress entry).

**Ö8 — `docs/launch/CONDUCT.md` sil, root `CODE_OF_CONDUCT.md`'ye merge (NORMAL).** GitHub community standards root dosyasına bakar.

**Ö9 — ADR-046 tek dosyada birleştir (NORMAL).** ADR governance (ADR-036) tek-dosya-bir-ADR diyor. `docs/adr/046-brain-self-update-hook-architecture.md` kanon; `046-brain-self-update-hook.md` Amendment 2 olarak ana dosyaya merge sonra sil.

**Ö10 — Stale doc'ları işaretle veya güncelle (NORMAL).**
- `docs/reference/health-check.md`: "Last audit Sprint 167 (2026-05-15)" güncelle; sayıları IDENTITY.md ile hizala. Otomasyon hook'u ekle.
- `docs/guide/faq.md`: tarih + içerik refresh; veya "DRAFT - needs update" banner.
- `docs/guide/deckent-nedir.md`: sprint numarası + sayılar güncelle.
- `docs/release/release-notes.md`: `v1.0.0-beta.1` notlarına refresh, eski v0.2.0 ya arşivle ya da silme.
- `docs/release/public-repo-manifest.md`: Sprint 172 conditional flip tablosuyla yenile.
- `docs/directives/INDEX.md`: otomatik üretim scripti `node scripts/sync-directives-index.mjs` (yoksa ekle, varsa hook'la).

**Ö11 — Drift/snapshot dosyalarını arşivle (NORMAL).**
- `docs/release/sprint-165-final-state.md` → `docs/archive/sprint-snapshots/sprint-165.md`.
- `docs/security/sprint-156-review.md` → `docs/archive/security-reviews/sprint-156.md` (veya silme — Sprint 156 sonrası içerik geçerliliğini yitirdi mi kontrol).
- `docs/analysis/full-audit.md` → sil (B11 kopyası archive'da).
- `docs/architecture/agent-skill-architecture.md` → `docs/archive/design-historical/agent-skill-design.md`.
- `docs/analysis/cli-deep-analysis.md`, `cli-mcp-master-audit.md` → eskiler `archive/` altına; canlı durum reference/ + audits/sprint-171/ ile sağlanıyor.

**Ö12 — Smoke test çıktılarını arşivle (LOW).** `docs/smoke-2026-05-12/` ve `docs/smoke-2026-05-13/` (toplam 20 dosya) — bir kerelik smoke output. `docs/archive/smoke/2026-05-12/` ve `2026-05-13/` altına taşı; OSS public görünürlüğü gereksiz.

**Ö13 — `docs/sprint-log/` dizinini sil veya doldur (LOW).** Sadece 2 dosya (146, 148) abandoned. Ya `.brain/sprints/` ile drift kapat ya da tüm dizini sil. Tercih: sil — `.brain/sprints/` kanon.

### 4.2 Orta Vade (Sprint 172+)

**Ö14 — Auto-update hook ağı kur.** `docs/reference/features.md`, `cli.md`, `directives/INDEX.md` gibi auto-gen iddialı dosyalar her sprint sonu `npm run docs:sync` ile güncellensin. `managed-docs` sistemine (ADR-029/030) ekle.

**Ö15 — Cross-dizin link disiplini.** `docs/` içi linkler relative + lowercase kuralı. CI'da `markdown-link-check` veya kustom validator (`scripts/doc-consistency-check.mjs` zaten var — link check ekle).

**Ö16 — TR/EN i18n stratejisi netleştir.** Mevcut: `docs/guide/deckent-nedir.md` (TR), `docs/guide/faq.md` (EN), `docs/CHANGELOG.md` (TR), `README.md`+`README-TR.md` (root). ADR-032 i18n pattern var ama uygulanışı tutarsız. Sprint 172 reorg sırasında: per-doc dil tag'i + ortak nav.

---

## 5. Sprint 172 Doküman Reorg Önerisi

### 5.1 İdeal Ağaç (Hedef Durum)

```
/                                          # OSS public kullanıcının ilk gördüğü
├── README.md                              # EN, kanonik (necessary)
├── README-TR.md                           # TR (necessary)
├── CHANGELOG.md                           # npm publish artifact (necessary)
├── LICENSE                                # zaten var
├── CONTRIBUTING.md                        # (necessary)
├── CODE_OF_CONDUCT.md                     # Contributor Covenant (necessary)
├── SECURITY.md                            # vuln reporting (necessary)
└── docs/
    ├── index.md                           # VitePress entry, zengin homepage
    ├── .vitepress/
    │   └── config.ts                      # gerçek dosya yapısı ile hizalı sidebar
    ├── guide/                             # Tutorials + How-To (Diataxis: learning+task)
    │   ├── introduction.md                # NEW (boot kullanıcı)
    │   ├── getting-started.md             # quickstart birleşik
    │   ├── first-sprint.md
    │   ├── concepts.md
    │   ├── configuration.md               # NEW (top-level config nav hedef)
    │   ├── docker-backend.md
    │   ├── faq.md                         # güncellenmiş
    │   └── deckent-nedir.md               # TR overview, güncellenmiş
    ├── reference/                         # Diataxis: information
    │   ├── cli.md                         # auto-gen, kanon
    │   ├── api-programmatic.md            # eski api.md
    │   ├── api-http.md                    # eski api-examples.md
    │   ├── config.md                      # eski config.md
    │   ├── glossary.md
    │   ├── mcp-guide.md
    │   ├── multi-provider.md
    │   ├── migration-guide.md
    │   ├── managed-docs.md
    │   ├── marketplace.md
    │   ├── skills.md
    │   ├── security.md
    │   ├── performance.md
    │   ├── features.md                    # auto-gen
    │   ├── health-check.md                # auto-gen
    │   └── known-issues.md                # eski KNOWN_ISSUES.md, auto-gen
    ├── development/                       # Contributor / internal extension
    │   ├── agent-guide.md
    │   ├── brain-guide.md
    │   ├── dashboard-guide.md
    │   ├── plugin-guide.md
    │   ├── troubleshooting.md
    │   └── worker-guide.md                # uzun versiyon (kısa siler, .deckent kanon)
    ├── architecture/                      # Diataxis: explanation
    │   ├── architecture.md                # ana
    │   ├── agents.md
    │   ├── authority-matrix.md            # link düzeltilmiş
    │   ├── memory-system.md
    │   └── sprint-lifecycle.md
    ├── adr/                               # Architecture Decision Records (kanon)
    │   ├── 001-...md → 048-...md          # ADR-046 tek dosya, 049-052/054/056-059 ya doldur ya skip belgele
    │   ├── 053-task-type-taxonomy.md      # proposed
    │   ├── 055-hybrid-scoring-pipeline.md # proposed
    │   ├── 060-self-awareness-channels.md # proposed
    │   └── 061-aegis-methodology.md       # proposed
    ├── design/                            # Approved design docs
    │   └── multi-project-isolation.md
    ├── vision/                            # Product strategy
    │   ├── roadmap.md                     # KANON (god-level + release birleşik)
    │   ├── product-vision.md              # NEW (root VISION.md taşınmış olabilir)
    │   └── competitive-analysis.md        # eski docs/analysis/competitive-analysis.md
    ├── governance/                        # Living governance
    │   └── INDEX.md
    ├── launch/                            # OSS GA artifacts (Sprint 172 flip)
    │   ├── announce-final.md
    │   ├── announce-hn.md
    │   ├── announce-reddit.md
    │   ├── announce-twitter-thread.md
    │   ├── blog-devto-launch.md
    │   ├── blog-hashnode-launch.md
    │   ├── discord-bot-setup.md
    │   ├── discord-server-setup.md
    │   └── telegram-bot-setup.md
    ├── release/                           # Operational release ops
    │   ├── release-checklist.md
    │   ├── release-notes.md               # v1.0.0-beta.1+ kanon
    │   ├── npm-publish-handoff.md
    │   ├── public-repo-flip-handoff.md
    │   └── public-repo-manifest.md        # Sprint 172 conditional table
    ├── archive/                           # Donmuş geçmiş
    │   ├── full-audit-pre036.md
    │   ├── landing-page-content.md
    │   ├── observations/                  # Sprint 18-25
    │   ├── design-historical/
    │   │   └── agent-skill-design.md
    │   ├── sprint-snapshots/
    │   │   └── sprint-165.md
    │   ├── security-reviews/
    │   │   └── sprint-156.md
    │   ├── smoke/
    │   │   ├── 2026-05-12/
    │   │   └── 2026-05-13/
    │   └── analyses/                      # eski CLI/MCP audit'leri
    └── superpowers/                       # Tasarım kontratları (var)
        ├── specs/
        └── plans/
```

### 5.2 Dosya → Hedef Eşleme Tablosu

| Mevcut konum | Hedef konum | Eylem | Gerekçe |
|---|---|---|---|
| `CHANGELOG.md` (root) | `CHANGELOG.md` (root) | KAL | npm publish kanonik yeri |
| `docs/CHANGELOG.md` | — | SİL | drift; root kanon |
| `docs/ROADMAP-GOD-LEVEL.md` | `docs/vision/roadmap.md` | MERGE → sil | tek roadmap |
| `docs/vision/roadmap.md` | `docs/vision/roadmap.md` | KAL/GENİŞLET | kanonik roadmap |
| `docs/release/roadmap.md` | — | SİL | mükerrer |
| `docs/SPRINT-LOG.md` | — | SİL | `.brain/sprints/` kanon |
| `docs/sprint-log/` | — | SİL | abandoned |
| `docs/KNOWN_ISSUES.md` | `docs/reference/known-issues.md` | TAŞI + auto-gen hook | reference kategori |
| `docs/worker-guide.md` | — | SİL | `.deckent/workspace/WORKER-GUIDE.md` kanon |
| `docs/development/worker-guide.md` | `docs/development/worker-guide.md` | KAL (uzun ref) | development guide olarak |
| `docs/launch/CONDUCT.md` | — | SİL (içerik root'a merge) | community standards kök |
| `docs/adr/046-brain-self-update-hook.md` | `docs/adr/046-brain-self-update-hook-architecture.md` (amendment section) | MERGE → sil | tek-dosya-bir-ADR |
| `docs/architecture/agent-skill-architecture.md` | `docs/archive/design-historical/agent-skill-design.md` | TAŞI | historical, mostly implemented |
| `docs/analysis/full-audit.md` | — | SİL | archive/full-audit-pre036.md kopya |
| `docs/analysis/cli-deep-analysis.md` | `docs/archive/analyses/cli-deep-analysis.md` | TAŞI | eski snapshot |
| `docs/analysis/cli-mcp-master-audit.md` | `docs/archive/analyses/cli-mcp-master-audit.md` | TAŞI | eski snapshot |
| `docs/analysis/competitive-analysis.md` | `docs/vision/competitive-analysis.md` | TAŞI | vision/strategy |
| `docs/analysis/sprint-metrics.md` | `docs/reference/sprint-metrics.md` | TAŞI + otomasyon | reference + auto-gen |
| `docs/release/sprint-165-final-state.md` | `docs/archive/sprint-snapshots/sprint-165.md` | TAŞI | snapshot |
| `docs/security/sprint-156-review.md` | `docs/archive/security-reviews/sprint-156.md` | TAŞI | sprint-spesifik |
| `docs/release/release-notes.md` | — | YENİDEN YAZ (`v1.0.0-beta.1+`) | sürüm güncelle |
| `docs/release/public-repo-manifest.md` | KAL | YENİDEN YAZ (Sprint 172 conditional) | flip artifact |
| `docs/smoke-2026-05-12/` | `docs/archive/smoke/2026-05-12/` | TAŞI | smoke output |
| `docs/smoke-2026-05-13/` | `docs/archive/smoke/2026-05-13/` | TAŞI | smoke output |
| `docs/reference/api.md` | `docs/reference/api-programmatic.md` | YENİDEN İSİMLENDİR | isim-içerik uyum |
| `docs/reference/api-examples.md` | `docs/reference/api-http.md` | YENİDEN İSİMLENDİR | isim-içerik uyum |
| `docs/reference/cli.md` | KAL | KAL (auto-gen) | kanon |
| `docs/reference/cli-commands.md` | — | SİL | mükerrer + drift |
| `docs/reference/config.md` | KAL | KAL | kanon |
| `docs/reference/config-reference.md` | — | SİL | mükerrer |
| `docs/guide/getting-started.md` | KAL | MERGE quickstart içeriği | tek "ilk sprint" guide |
| `docs/guide/quickstart.md` | — | SİL (içerik getting-started'a merge) | mükerrer |
| `docs/guide/faq.md` | KAL | İÇERİK REFRESH | Sprint 167+ |
| `docs/guide/deckent-nedir.md` | KAL | İÇERİK REFRESH | sprint/test/coverage düzelt |
| `docs/reference/health-check.md` | KAL | İÇERİK REFRESH + auto-gen | sayılar IDENTITY.md ile |
| `docs/directives/` | `docs/archive/directives/` (Sprint 027-145) | TAŞI ARŞİVE | tarihsel | INDEX güncelle |
| `docs/directives/INDEX.md` | KAL (yeni yer) | OTOMATİK ÜRET | drift'i çöz |
| `docs/architecture/authority-matrix.md:3` | — | LİNK DÜZELT | DECISIONS.md → exports/decisions.md |
| `docs/development/brain-guide.md:3` | — | LİNK DÜZELT | lowercase |
| `docs/development/dashboard-guide.md:3` | — | LİNK DÜZELT | lowercase |
| `docs/development/troubleshooting.md` | — | LİNK DÜZELT | UPPERCASE references |
| `docs/reference/performance.md:3` | — | LİNK DÜZELT | lowercase |
| `docs/.vitepress/config.ts` | KAL | NAVI/SIDEBAR HİZALA + `ignoreDeadLinks: false` | UX kırık olmasın |

### 5.3 Hangi Root Dosya `docs/` Altına Taşınmalı?

| Root dosya | Karar | Yeni konum / gerekçe |
|---|---|---|
| `README.md` | KÖKDE KAL | GitHub repo standardı |
| `README-TR.md` | KÖKDE KAL | i18n çift |
| `CHANGELOG.md` | KÖKDE KAL | npm publish artifact |
| `CONTRIBUTING.md` | KÖKDE KAL | GitHub community standards |
| `CODE_OF_CONDUCT.md` | KÖKDE KAL | GitHub community standards |
| `SECURITY.md` | KÖKDE KAL | GitHub security tab |
| `LICENSE` (varsa) | KÖKDE KAL | npm publish |
| `VISION.md` | `docs/vision/product-vision.md` | TAŞI; root'tan referans link |
| `VISION-TR.md` | `docs/vision/product-vision-tr.md` | TAŞI |
| `ROADMAP*.md` (varsa root'ta) | `docs/vision/roadmap.md` ile MERGE | tek roadmap |
| `BETA-TRACKER.md` (102KB) | `docs/internal/beta-tracker.md` veya `.deckent/internal/` | TAŞI; OSS public görmemeli (devasa, internal milestone) |
| `BETA-TRACKER-TR.md` (113KB) | `docs/internal/beta-tracker-tr.md` veya `.deckent/internal/` | TAŞI; internal |
| `COMPETITIVE-ANALYSIS.md` | `docs/vision/competitive-analysis.md` | TAŞI; iki competitive-analysis var (`docs/analysis/`) — birleştir |
| `DECKENT-ANA-PLAN-TR.md` (118KB) | `.deckent/internal/master-plan-tr.md` veya `docs/internal/` | TAŞI; internal master plan, OSS public görmemeli |
| `DECKENT-MASTER-BLUEPRINT.md` (169KB) | `.deckent/internal/master-blueprint.md` veya `docs/internal/` | TAŞI; aynı sebep |
| `AGENTS.md` | `docs/reference/agents.md` veya kök kal | TAŞI veya kal; OSS için kullanışlı reference |
| `CLAUDE.md` | KÖKDE KAL | Claude Code agent rule kanonu |
| `DECKENT.md` | KÖKDE KAL | deckent CLI entry adapter |
| `DIRECTIVES.md` | KÖKDE KAL | sprint kontratı; sprint döngüsü |
| `NEXT-SESSION-PROMPT.md` + `next-session-prompt.md` | — | İKİSİ DE SİL veya `.deckent/internal/` ; UPPER/lower case duplicate (B-extra) |

> **Root dosyaları taşırken:** root'tan tek satır redirect (`# X\nMoved to: [docs/...](./docs/...)`) bırakmak GitHub veteran kullanıcılar için faydalı.

### 5.4 AEGIS (ADR-061) Hizalama Notu

ADR-061 metodolojisi mode-agnostic faz/rol/artifact terminolojisi getiriyor. Bu reorg AEGIS terminolojisi ile uyumlu olmalı: her dizin bir AEGIS rol/artifact'ine eşlensin (örn. `architecture/` → Explanation artifact, `guide/` → Onboarding, `reference/` → Authoritative information, `adr/` → Decision, `vision/` → Direction, `governance/` → Authority, `archive/` → Frozen history). Sprint 172 synthesis bu eşlemeyi netleştirsin.

---

## Ek: Dosya Envanteri ve 8-Badge Atamaları

> **Badge sözlüğü:**
> - **core** → deckent davranışını yöneten kanonik kontrat (silinmesi sistemi bozar)
> - **necessary** → OSS public için zorunlu (GitHub/npm standardı)
> - **guide** → tutorial / how-to (Diataxis learning/task)
> - **reference** → bilgi odaklı (Diataxis information)
> - **info** → mimari / tasarım açıklaması (Diataxis explanation)
> - **internal** → sadece proje içi / contributor
> - **archive** → arşiv, donmuş geçmiş
> - **deprecated** → tamamen ölü, silme adayı

### docs/ kökü

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `docs/index.md` | core | KAL + zenginleştir | VitePress entry |
| `docs/CHANGELOG.md` | deprecated | SİL | root CHANGELOG.md kanon |
| `docs/ROADMAP-GOD-LEVEL.md` | internal | MERGE → vision/ | tek roadmap |
| `docs/SPRINT-LOG.md` | deprecated | SİL | `.brain/sprints/` kanon |
| `docs/KNOWN_ISSUES.md` | reference | TAŞI → reference/ | reference kategori + auto-gen |
| `docs/worker-guide.md` | deprecated | SİL | `.deckent/workspace/WORKER-GUIDE.md` kanon |

### docs/adr/ (53 dosya, 52 unique ID)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| ADR-001..ADR-005, 049-052/054/056-059 | reference | RETROSPEKTİF — boşluklar belge | gap notu |
| ADR-006..ADR-048 (kabul edilmiş) | reference | KAL | mandatory constraint |
| ADR-046 (iki dosya) | reference | MERGE tek dosya | governance |
| ADR-042, 053, 055, 060, 061 (proposed) | reference | KAL | mimari pipeline |
| Tüm ADR'ler | reference | KAL (silme) | governance: ADR-036 zorunlu |

> Hep "reference" badge — ADR'ler bilgi odaklı, kanonik.

### docs/analysis/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `cli-deep-analysis.md` | archive | TAŞI → archive/analyses/ | eski snapshot |
| `cli-mcp-master-audit.md` | archive | TAŞI → archive/analyses/ | Sprint 055-057 audit |
| `competitive-analysis.md` | info | TAŞI → vision/ | strategy info |
| `full-audit.md` | deprecated | SİL | kopya archive'da |
| `sprint-metrics.md` | reference | TAŞI → reference/ + auto-gen | metrik referans |

### docs/architecture/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `agent-skill-architecture.md` | archive | TAŞI → archive/design-historical/ | "Historical, mostly implemented" |
| `agents.md` | info | KAL | aktif mimari |
| `architecture.md` | core | KAL + refresh header | "Sprint 100+" → "Sprint 167+" |
| `authority-matrix.md` | core | KAL + LİNK FİX | ADR-037 reference |
| `memory-system.md` | info | KAL | Memory V2 aktif |
| `sprint-lifecycle.md` | core | KAL | sprint kanonu |

### docs/archive/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `full-audit-pre036.md` | archive | KAL | tarihsel kayıt |
| `landing-page-content.md` | archive | KAL | eski landing |
| `observations/*.md` (6 dosya) | archive | KAL | Sprint 18-25 gözlem |

### docs/design/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `multi-project-isolation.md` | info | KAL | ADR-034 design |

### docs/development/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `agent-guide.md` | guide | KAL | contributor guide |
| `brain-guide.md` | guide | KAL + LİNK FİX | dev guide |
| `dashboard-guide.md` | guide | KAL + LİNK FİX | dev guide |
| `plugin-guide.md` | guide | KAL | plugin dev |
| `troubleshooting.md` | guide | KAL + LİNK FİX | dev guide |
| `worker-guide.md` | guide | KAL (uzun ref) | development context |

### docs/directives/ (28 dosya)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `INDEX.md` | reference | YERİNDE KAL + auto-gen hook | drift'i çöz |
| `sprint-027..sprint-145.md` (27 dosya) | archive | TAŞI → archive/directives/ | tarihsel kayıt |

### docs/governance/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `INDEX.md` | core | KAL + cross-doc link refresh | living governance index |

### docs/guide/ (7 dosya)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `concepts.md` | guide | KAL | core concepts |
| `deckent-nedir.md` | guide | REFRESH (Sprint 167+, sayılar) | TR overview |
| `docker-backend.md` | guide | KAL | docker how-to |
| `faq.md` | guide | REFRESH (Sprint 167+) | FAQ |
| `first-sprint.md` | guide | KAL | walkthrough |
| `getting-started.md` | guide | MERGE quickstart | tek "ilk sprint" guide |
| `quickstart.md` | deprecated | SİL (içerik getting-started'a merge) | mükerrer |

### docs/launch/ (10 dosya)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `CONDUCT.md` | deprecated | SİL (içerik root CODE_OF_CONDUCT.md'ye merge) | community standards kök |
| `announce-final.md` | internal | KAL | OSS launch artifact |
| `announce-hn.md` | internal | KAL | HN post |
| `announce-reddit.md` | internal | KAL | Reddit posts |
| `announce-twitter-thread.md` | internal | KAL | X thread |
| `blog-devto-launch.md` | internal | KAL | dev.to platform copy |
| `blog-hashnode-launch.md` | internal | KAL | hashnode platform copy |
| `discord-bot-setup.md` | internal | KAL | community ops |
| `discord-server-setup.md` | internal | KAL | community ops |
| `telegram-bot-setup.md` | internal | KAL | community ops |

### docs/reference/ (17 dosya)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `api.md` | reference | RENAME `api-programmatic.md` | TS API |
| `api-examples.md` | reference | RENAME `api-http.md` | HTTP API |
| `cli.md` | reference | KAL (kanon) | auto-gen |
| `cli-commands.md` | deprecated | SİL | mükerrer + drift |
| `config.md` | reference | KAL (kanon) | config tek doc |
| `config-reference.md` | deprecated | SİL | mükerrer |
| `features.md` | reference | KAL + auto-gen hook | feature manifest |
| `glossary.md` | reference | KAL | terminoloji |
| `health-check.md` | reference | REFRESH + auto-gen | sayılar IDENTITY.md ile |
| `managed-docs.md` | reference | KAL | ADR-029 reference |
| `marketplace.md` | reference | KAL | experimental |
| `mcp-guide.md` | reference | KAL | MCP referans |
| `migration-guide.md` | reference | KAL | upgrade guide |
| `multi-provider.md` | reference | KAL | provider matrisi |
| `performance.md` | reference | KAL + LİNK FİX | perf tuning |
| `security.md` | reference | KAL | security model |
| `skills.md` | reference | KAL | skill system |

### docs/release/ (7 dosya)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `npm-publish-handoff.md` | internal | KAL | release ops |
| `public-repo-flip-handoff.md` | internal | KAL | flip ops |
| `public-repo-manifest.md` | internal | REFRESH (Sprint 172 conditional) | manifest stale |
| `release-checklist.md` | internal | KAL | checklist |
| `release-notes.md` | internal | YENİDEN YAZ (v1.0.0-beta.1+) | versiyon drift |
| `roadmap.md` | deprecated | SİL | vision/roadmap.md kanon |
| `sprint-165-final-state.md` | archive | TAŞI → archive/sprint-snapshots/ | snapshot |

### docs/security/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `sprint-156-review.md` | archive | TAŞI → archive/security-reviews/ | sprint-spesifik |

### docs/smoke-2026-05-12/ (10 dosya) ve docs/smoke-2026-05-13/ (10 dosya)

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `T-SMOKE-01.md` ... `T-SMOKE-10.md` (her iki dizin) | archive | TAŞI → archive/smoke/2026-05-12/, 2026-05-13/ | smoke output |

### docs/sprint-log/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `Sprint-146.md`, `Sprint-148.md` | deprecated | SİL (dizinle birlikte) | `.brain/sprints/` kanon |

### docs/vision/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `roadmap.md` | core | KAL (kanon, god-level + release merge) | product roadmap |

### docs/.vitepress/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `config.ts` | core | NAV/SIDEBAR HİZALA + `ignoreDeadLinks: false` | UX kırık olmasın |
| `theme/index.ts`, `custom.css`, `public/*.svg` | info | KAL | tema |

### docs/superpowers/

| Dosya | Badge | Karar | Gerekçe |
|---|---|---|---|
| `specs/`, `plans/` (içerik exclude'da) | internal | KAL | tasarım kontratları |

### Özet Badge Dağılımı

| Badge | Sayı (yaklaşık) | Aksiyon Eğilimi |
|---|---|---|
| core | 6 (index, governance/INDEX, architecture/architecture, authority-matrix, sprint-lifecycle, vision/roadmap, vitepress/config.ts) | KAL/refresh |
| necessary | (kök 6 dosya — kapsam dışı) | KAL |
| guide | 12 (guide/ + development/) | KAL/REFRESH |
| reference | ~70 (adr/ 52 + reference/ 15 + KNOWN_ISSUES + sprint-metrics + features auto) | KAL/RENAME/SİL (mükerrer) |
| info | 6 (architecture/agents+memory-system, design/multi-project, vision/competitive, analysis/competitive, architecture.md refresh) | KAL |
| internal | ~18 (launch/ 9 + release/ 5 + superpowers/) | KAL |
| archive | ~45 (archive/ 7 + observations/ 6 + directives/ 27 taşı + smoke/ 20 taşı + sprint-snapshots + security-reviews + design-historical + analyses) | TAŞI |
| deprecated | ~10 (docs/CHANGELOG, docs/SPRINT-LOG, docs/worker-guide, quickstart, launch/CONDUCT, full-audit, cli-commands, config-reference, release/roadmap, sprint-log/) | SİL |

> Yukarıdaki sayım sınıflandırma yaklaşıktır; bazı dosyalar birden fazla badge'e uygun (örn. `KNOWN_ISSUES.md` aynı anda reference + güncellik gerektiriyor). Karar tablosunda kanonik tek badge atandı.

---

## Synthesis İçin Notlar (Task 29 Girdi)

1. **OSS-GA blocker (Kapı 2 CRITICAL):** B1, B2, B13 — VitePress sitesi yayınlandığında sidebar 404 üretiyor. Bu Sprint 172 OSS GA flip öncesi düzeltilmeli, aksi halde "deckent docs broken" ilk gün şikayeti.
2. **Doc-vs-code drift:** B14, B15, B19, B24 — kullanıcı dokümanı okuyup yanlış komut/dosya yolu deniyor. CRITICAL severity ama task-level NO_GO değil.
3. **Reorg ana iskelet:** §5.1 ideal ağaç + §5.2 dosya→hedef tablosu Task 29 doc-reorg sentezinin ana girdisi. Diğer audit'lerden gelen `docs-root` (Task 23), `docs-config-rules` (Task 25), `docs-archive` (Task 27) sonuçlarıyla birleştirilmeli.
4. **AEGIS (ADR-061) hizalama:** §5.4 mode-agnostic terminoloji önerisi.
5. **Otomasyon eksiklikleri:** Ö14 — `directives/INDEX.md`, `health-check.md`, `features.md`, `release/release-notes.md`, `KNOWN_ISSUES.md` gibi dosyaların auto-gen hook'u eksik; managed-docs sistemine (ADR-029/030) bağlanmalı.
6. **i18n stratejisi:** TR/EN dağılımı tutarsız (kimi dosya TR, kimi EN, kimi karışık). ADR-032 var ama uygulaması yok; Sprint 172'de netleştir.

---

_Bu rapor audit-only'dir; hiçbir kaynak/test/config/db dosyası değiştirilmemiştir. Sadece `docs/audits/sprint-171/docs-tree.md` yazıldı._
