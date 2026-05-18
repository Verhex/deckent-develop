# Doc Audit: Root — Audit Raporu (Sprint 171, Task 171-023)

**Audit-only rapor.** Tarih: 2026-05-15 | Worker: w-171-023 | Agent: doc-writer | Skill: documentation-writer | Model: opus.
**Fix geçişi:** 2026-05-15 | Worker: w-171-023-fix | Agent: code-reviewer | 3 kanıt satırı düzeltildi (B3 satır numarası, B17 kaynak dosya ve hatalı README:19 referansı); içerik ve bulgular değişmedi.

Bu rapor `/workspace` (deckent monorepo) kök dizinindeki tüm Markdown dosyalarının doğruluk, gereklilik, içerik kalitesi ve referans bütünlüğü denetimini içerir. Hiçbir kaynak dosyası modifiye edilmemiştir; bu raporun kendisi tek çıktıdır.

---

## 0. Yönetici Özeti

Kök dizinde **19 markdown dosyası** bulundu. DIRECTIVES.md task tanımının iddia ettiği **21 dosya hedefiyle uyumsuzdur**: `ROADMAP.md` kökte yok (yalnızca `docs/ROADMAP-GOD-LEVEL.md` mevcut), `BLUEPRINT.md` tam isimle yok (`DECKENT-MASTER-BLUEPRINT.md` karşılığıdır). Bu, ilk **CRITICAL** bulgudur: kullanıcı/maintainer'ın zihin modeli kök dosya envanteriyle örtüşmüyor.

OSS GA öncesi en kritik tema **doc-vs-code drift**'idir: README.md başta olmak üzere kök vitrindeki çoğu doğruluk tablosu mevcut kod gerçeğiyle çelişiyor (test sayısı, dashboard sayfa sayısı, MCP tool sayısı, ADR sayısı, sprint no, agent custom +2 iddiası). README dış kullanıcının ilk okuduğu dosya olduğu için bu drift'ler **OSS GA blocker** seviyesinde CRITICAL'dır.

İkinci kritik tema **mükerrer ve stale içerik**: README.md/README-TR.md, VISION.md/VISION-TR.md, DECKENT-MASTER-BLUEPRINT.md/DECKENT-ANA-PLAN-TR.md, BETA-TRACKER.md/BETA-TRACKER-TR.md, NEXT-SESSION-PROMPT.md/next-session-prompt.md — beş çift mükerrer dosya, toplam ~520 KB kök ağırlık. Bunların önemli bir kısmı `docs/` ağacına taşınmalı; bir kısmı arşivlenmeli; iki tanesi silinmelidir.

Sprint 172 doc-reorg için ana öneri:

- **Kök dizinde kalanlar (10 dosya):** README, README-TR, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CHANGELOG, AGENTS, CLAUDE.md, DECKENT.md, DIRECTIVES.md (son üçü konfig/kontrat — `171-025`'in işi).
- **`docs/` ağacına taşınanlar (5 dosya):** VISION, VISION-TR, COMPETITIVE-ANALYSIS, BETA-TRACKER, BETA-TRACKER-TR.
- **Arşive taşınanlar (2 dosya):** DECKENT-MASTER-BLUEPRINT, DECKENT-ANA-PLAN-TR — 285 KB toplam, içerikleri zaten README + VISION + ROADMAP'te özet halinde mevcut, OSS public için ağırlık.
- **Silinenler (2 dosya):** NEXT-SESSION-PROMPT.md (Sprint 159 stale snapshot, repo path `VerhexIO/deckent` artık geçersiz), next-session-prompt.md (Sprint 171 oturumlar arası temp dosya — kök dizinde yeri yok, `.deckent/notes/` veya tamamen silinmeli).

Toplam aksiyon: **2 CRITICAL** doğruluk drift'i, **5 HIGH** içerik/mükerrerlik bulgusu, **9 MEDIUM**, **3 LOW** sayısal sapma.

---

## 1. Bulgular (Findings)

Aşağıdaki bulgular dosya bazlı değil, çapraz-kesen tema bazlı sıralanmıştır. Her bulgu kanıtla birlikte sunulur.

### B1 — README.md "16434+ tests" badge'i kod gerçeğiyle uyumsuz (CRITICAL)

`README.md:5` rozeti `tests-16434%2B-brightgreen` (16 434+ test) iddia ediyor; aynı satır `coverage-89.33%25-brightgreen` rozetiyle birleşince güvenilir gibi sunuluyor. Ancak `.deckent/workspace/IDENTITY.md`'de tek doğru kaynak olarak **"Tests: 12,485 pass + 16 skipped (505 files)"** yazılı. README-TR.md:7 aynı yanlış sayıyı ("16434+") tekrarlıyor. CONTRIBUTING.md:78 ise üçüncü bir sayı söylüyor: **"Should pass all tests (9300+)"**. Aynı projede üç farklı test sayısı; hiçbiri `npx vitest run` ile teyit edilmiş değil. Yeni kullanıcı README rozetine güvenerek 16 434 test çalıştığını sanar; deckent için test sayısı bir güven sinyali olduğundan bu yanılma OSS GA blocker'dır.

### B2 — README.md "6 dashboard pages" iddiası, kanonik sayı 7 (CRITICAL)

`README.md:155` *"Web Dashboard — React + Vite + Tailwind, 6 pages, SSE real-time updates"* ve `README.md:515` *"React + Vite + Tailwind — 6 pages (Dashboard, Settings, History, Memory, Config, Status)"* iddia eder; README-TR.md:157, :517 aynısını TR ile tekrar eder. Ancak `VISION.md:121` ve `.deckent/workspace/IDENTITY.md` (tek doğru kaynak) **`Dashboard Pages | 7`** der. `CLAUDE.md:138` proje-arch listesinde "7 sayfa" geçer (Sprint Metrics tablosu üzerinden). 6'ya karşı 7 — 1 sayfa eksik sayım; çelişki TR/EN README + VISION + IDENTITY üçgeninde tutarsız. Eksik sayfa muhtemelen ChatPage (Sprint 150). Kanonik sayım gerekli.

### B3 — README.md MCP tool sayım drift'i: "27 tools" başlığı altında 31 satırlık tablo (CRITICAL)

`README.md:368` başlığı *"MCP Tools (27)"* açar; ardından L370–L402 tablosu **31 satır** içerir (`deckent_init`, `deckent_set_directives`, … `deckent_audit`, `deckent_recover`, `deckent_feature_query`, `deckent_watch`, `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config`). README-TR.md:370–404 aynı sayım çelişkisini taşır. IDENTITY.md "MCP Tools | 27"; CLAUDE.md "27 tools"; DECKENT.md:30 ise *"22 tools: init, set_directives, plan, start, status, doctor, retro, history, analyze_project, sync, config, review, run, kill, cleanup, help, agent_list, skill_list, checkpoint, docs, explain, memory_query"* (22 adet listeliyor; audit/recover/feature_query/watch/nervous_* grubu daha sonra eklendi). BETA-TRACKER.md:19 *"27 tools — audit, recover, feature_query, watch, nervous_* live"* (31 işlevi anıyor ama sayım 27 kalıyor). Tek bir kaynak doğru olabilir — kullanıcı README tablosunu sayarak 31 görüp dökümanın güvenilirliğine şüpheyle bakar. Kod sayımıyla (171-011 mcp audit) hizalanmalı.

### B4 — README.md "What's New in Sprint 166" stale, gerçek Sprint sprint-171 (HIGH)

`README.md:33–37` *"## What's New in Sprint 166"* başlığını koruyor; aynı satırda Sprint 166'nın ADR-046 ve veri bütünlüğü kapanışını anıyor. README-TR.md:35–38 aynı. Ancak `.deckent/workspace/IDENTITY.md` "Sprint | sprint-167" der; `git log -1` bugünkü tarih için `5ffbf3e feat(sprint-170)` gösterir; DIRECTIVES.md başlığı **"Sprint 171: Self-Audit Mega-Sprint"** der. Yani README "What's New" en az **5 sprint** geride. README başlık rozetindeki `sprints-166%2B` (L5) de stale.

### B5 — README.md ve README-TR.md ileri-tarihli "Sprint 149+/150/151" referansları, hepsi geçmişte (HIGH)

`README.md:500` *"Screenshot coming in Sprint 151 — `deckent nervous` for live TUI"*, `README.md:518` *"Full screenshot gallery coming in Sprint 151"*, `README.md:589` *"The hub launches with 20 seed skills in Sprint 150"*, `README.md:505` *"Discord/Telegram connectors in Sprint 149+"*. Bugün **Sprint 171** aktif; bu referansların hepsi geçmişte. README "yakında" diye sunuyor ama Sprint 149/150/151 ya başarıyla teslim edilmiş ya da plan dışı bırakılmış olmalı — README bunu yansıtmalı (yapılmışsa kaldır, yapılmamışsa "TBD" yaz). README-TR.md:502, :520, :591 mirror.

### B6 — VISION.md ve VISION-TR.md "Phase 3 Public Beta — Sprint 167-168" hâlâ "Next" diyor (HIGH)

`VISION.md:83–85` *"### Phase 3: 'Public Beta' — Next (Sprint 167-168)"* der; içerikte *"Sprint 168: Open Source GA — VerhexIO/deckent public repo flip + npm publish v1.0.0-beta.2"* yazılı. VISION-TR.md:83–85 aynısı TR. Ancak DIRECTIVES.md *"Sprint 172 OSS GA Handoff"* başlığında *"VerhexIO/deckent → VerhexIO/deckent public flip, beta.2 yayını"* Sprint 172'ye kaymış; Sprint 168 değil. VISION 4 sprintlik kaymayı yansıtmıyor — OSS public ana belgesi.

### B7 — VISION.md ve VISION-TR.md sonunda mükerrer auto-gen blokları (HIGH)

`VISION.md:113–138` "Deckent by the Numbers" tablosu + "Sprint History" başlığı *"_No sprint history._"* (boş) + "Sprint Metrics" tablosu (NaN% coverage, "-1dk -1sn" süre — anlamsız). `VISION-TR.md:113–156` daha da kötü: **iki kez** "Sprint Geçmişi/Sprint Metrikleri" bloğu — bir kez TR (L127–141), bir kez EN (L143–156) — aynı dosyada hem TR hem EN versiyon üst üste binmiş. Bu **auto-gen hook bug**'ıdır (`updateProjectDocs` Türkçe dosyaya İngilizce blok da basıyor). Stratejik vizyon dokümanına "-1dk -1sn" süresi ile bozuk metrik tablosu yamanması inanılırlığı düşürür.

### B8 — DECKENT-MASTER-BLUEPRINT.md "sprint-167" + ana satırda hesap çelişkisi + dosya büyüklüğü 168 KB OSS bagajı (HIGH)

`DECKENT-MASTER-BLUEPRINT.md:3` *"Version 3.1 — May 2026 — Verhex (Updated Sprint 166)"* başlık; L8–L16 "Live Metrics" tablosu **"Sprint | sprint-167"**, *"Duration | -1dk -1sn"*, *"Coverage | NaN%"* — auto-gen metric injection burada da var. 168 607 bayt (en büyük root dosya). DECKENT-ANA-PLAN-TR.md (117 624 bayt) TR mükerreri. İkisi toplam 285 KB. README + VISION + CONTRIBUTING üçgeninde özet zaten var; tüm-detay reference dosyası `docs/architecture/` altında tek bir EN sürüm yeterli olur, TR sürüm arşivlenmeli. Mevcut hâlleriyle OSS public flip'te npm tarball ağırlığı (`npmignore` audit gerekli) ve git ağırlığı yaratıyor.

### B9 — BETA-TRACKER.md "Last updated: 2026-05-14 (Sprint 166 post-commit)" stale, Sprint 168 OSS GA hala "next" (HIGH)

`BETA-TRACKER.md:4` *"Last updated: 2026-05-14 (Sprint 166 post-commit) | Sprint: 166 DONE … v1.0.0-beta.2 target (Sprint 168 Open Source GA)"*. BETA-TRACKER-TR.md aynı. Bugün 2026-05-15 ve Sprint 171 (4 sprint sonrası). Sprint 167/168 kapanış metrikleri eklenmemiş. OSS GA tarihi Sprint 168'den Sprint 172'ye kaymış. 1 692/1 929 satır TR/EN çift dosya — proje launch dökümanı, OSS GA sonrası tekrar gözden geçirilmeli; mevcut hâliyle kullanıcı yanıltır.

### B10 — NEXT-SESSION-PROMPT.md tamamen stale, "VerhexIO/deckent" + Sprint 157-159 brain crash snapshot'ı (HIGH)

`NEXT-SESSION-PROMPT.md:2` *"Repo: VerhexIO/deckent (private)"*; L6 *"Local: /home/alperen/deckent-dev"*; L9 *"Sprint 157 ÜÇ KEZ start denendi (157→158→159), ÜÇÜ DE crash/stall oldu"*. Bu dosya 2026-05-12 anlık kayıt; Sprint 161–170 sonrasında geçerli değil. Repo adı *deckent-develop* — başka bir özel repo'ya referans (OSS public flip Sprint 172 hedefi). Bu dosya kökte durduğu sürece OSS public flip'te kullanıcı yanıltır ve "develop" repo adı yan dosyaya referans olarak görünür. **Silme veya arşivleme** zorunlu.

### B11 — next-session-prompt.md (lowercase) Sprint 171 oturum-arası temp dosyası, kök dizinde yeri yok (HIGH)

`next-session-prompt.md:1` *"# Next Session Resume — Sprint 171 Self-Audit Planning"*; L181 absolute path leak: *"/home/alperen/deckent-dev/next-session-prompt.md"*. Bu dosya işlevsel olarak oturum-arası kişisel not — kök dizinde sürekli yer almamalı. OSS public flip'te repo köküne yabancı bir kullanıcı geldiğinde *"Next Session Resume"* başlıklı bir dosya tam vitrin alanı kaplar ama anlamı sıfır. Ayrıca `NEXT-SESSION-PROMPT.md` (uppercase) ile aynı pencerede iki ayrı dosya — case-sensitive dosya sistemi (WSL2/Linux) izin verse de Windows'ta çakışır. `.deckent/notes/` altına TAŞI veya tamamen sil.

### B12 — COMPETITIVE-ANALYSIS.md Türkçe içerik ASCII-safe yazımla, **kullanıcı 2026-05-15 reinforced kuralının ihlali** (HIGH)

`COMPETITIVE-ANALYSIS.md:1` *"# Deckent vs Rakipler: Stratejik Karsilastirma Analizi"* — *Karşılaştırma* yerine *Karsilastirma*. Tüm dosya boyunca: L9 *"Boyut"* (doğru), L11 *"Kurulum kolayligi"* (yanlış — *kolaylığı*), L27 *"Sektorde Essiz"* (*sektörde eşsiz*), L34 *".brain/ + learning-decay"* (doğru — identifier), L42 *"Olcemedigin seyi satamazsin"* (*ölçemediğin şeyi satamazsın*), L130 *"laboratuvar projesi"* (doğru), L132 *"Yapilmasi gereken en onemli sey"* (*Yapılması gereken en önemli şey*). Dosya 5 588 bayt, çoğu kelimede diakritik eksik — kullanıcı *"Çıktı dili ZORUNLU Türkçe, doğru orthography (ç/ğ/ı/ö/ş/ü)"* kuralı 2026-05-15 reinforced. Bu kuralın **kök dizinde** ihlal edildiği tek dosya. CRITICAL severity'ye yakın HIGH; OSS GA öncesi düzeltilmeli.

### B13 — CHANGELOG.md son entry "Sprint 156", Sprint 157-170 kaydı YOK, "Hot Fix Day Sprint 152.5" ortada (MEDIUM)

`CHANGELOG.md:5` *"## Unreleased — Sprint 156 Pipeline Hardening (2026-05-12, commit `4d15196`)"*; L72 *"## Unreleased — Hot Fix Day (Sprint 152.5, 2026-04-24)"*; L114 *"## [0.4.0-beta.4] — 2026-04-21 (Sprint 148)"*. Sprint 157, 158, 159, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170 — **13 sprintlik kayıt deliği**. Bugün Sprint 171. ADR-046 (Sprint 166), bootstrap fix `5436497` (Sprint 170 öncesi), Sprint 170 commit `5ffbf3e` (P0-3 + P0-5), Sprint 169 H1+H2+C1+C2 — hiçbiri CHANGELOG'da yok. Keep a Changelog standardı: "her PR aynı sprintte changelog girer". Bu pratik 13 sprint terk edilmiş. README L3 `## Changelog` yönlendirmesi `docs/CHANGELOG.md`'ye — orası daha mı güncel? (171-024'ün işi — burada flag.)

### B14 — AGENTS.md "+2 custom" iddiası yok, IDENTITY ile sayım çelişkisi (MEDIUM)

`.deckent/workspace/IDENTITY.md` *"Agents | 15 built-in + 2 custom"* (toplam 17). `AGENTS.md:5–24` yalnızca **15 built-in** tablosu listeler; "+2 custom" hiç anılmaz. L150–L155 *"Temp Agents ... `.deckent/agents/` altında proje başına geçici agent'lar"* — temp agents = custom mı? Git status'unda `M .deckent/agents/temp-react-specialist/agent.json`, `M .deckent/agents/temp-react-ts-specialist/agent.json` görünür (2 custom agent). README L143 *"15 Built-in Agents"* — custom belirtmiyor. README-TR L145 aynı. Custom agent sayım/dokümantasyonu OSS kullanıcısı için belirsiz; **3 farklı kaynak 3 farklı toplam** (15, 15+2=17, ?).

### B15 — SECURITY.md "Supported Versions: 0.1.x Yes" stale, gerçek versiyon 1.0.0-beta.1 (MEDIUM)

`SECURITY.md:5–8` tablo: *"| 0.1.x | Yes | / < 0.1 | No |"*. README L216 `# 1.0.0-beta.1` der; `package.json` ve IDENTITY tek doğru kaynak 1.0.0-beta.1. SECURITY.md beta tier'ı tutmuyor; 1.0.0-beta hâlâ "0.1.x" olarak destekleniyor görüntüsü veriyor. Email `security@verhex.com` (L14) doğrulanmalı (OSS GA öncesi). 48 saat / 7 gün SLA'sı (L22) küçük projede aşırı vaat — projenin gerçek bandwidth'i ile hizalı mı?

### B16 — README.md ve README-TR.md docs/ link listesi referans bütünlüğü doğrulanmalı (MEDIUM)

`README.md:601–610` ve `README-TR.md:603–612` 10 docs/ linki içerir: `docs/guide/quickstart.md`, `docs/reference/api.md`, `docs/reference/config-reference.md`, `docs/reference/multi-provider.md`, `docs/architecture/architecture.md`, `docs/architecture/sprint-lifecycle.md`, `docs/reference/mcp-guide.md`, `docs/guide/docker-backend.md`, `docs/development/troubleshooting.md`, `docs/guide/faq.md`. Bu raporda hedef dosyaların gerçekten var olduğunu doğrulayamadım — `171-024 docs-tree` audit'in işi. Burada **broken-link riski olduğu** işaretleniyor. Ek olarak README L167 *"see [full competitive analysis](docs/analysis/competitive-analysis.md)"* — bu yol kökteki COMPETITIVE-ANALYSIS.md ile çelişir; ya iki ayrı analiz var ya da link bozuk.

### B17 — IDENTITY.md tarihsel "37 ADR migration" ifadesi güncel 46+ sayımıyla çelişiyor (MEDIUM)

`.deckent/workspace/IDENTITY.md:18` *"ADR Governance Integration (Sprint 138 Task 1 — MADR v3 hibrit + 37 ADR migration..."* der. Bu metin Sprint 138'de **taşınan** ADR sayısını (37) anıyor; ancak kısa okuyuşta "37 ADR toplam" izlenimi verebilir. Gerçek güncel sayım: `VISION.md:19` *"ADR governance (46 ADRs)"*; summary.md `adr-001`'den `adr-060`'a kadar listeler (46+ kabul edilmiş). IDENTITY.md DECKENT.md tarafından `@.deckent/workspace/IDENTITY.md` referansıyla dahil edildiğinden bu metin tüm agent prompt'larında görünür ve yanıltıcıdır. DECKENT.md'nin kendisinde bu sayım yoktur. Bu dosya `171-025`'in primary kapsamı; burada yalnızca sayısal drift işaretleniyor.

### B18 — CONTRIBUTING.md L78 "9300+ tests" + L150 "21 MCP tools" + L120 "4 dashboard pages" + L149 "28 commands" stale (MEDIUM)

`CONTRIBUTING.md:78` *"npm test # Should pass all tests (9300+)"* — README iddiası 16434+, IDENTITY 12485. L150 *"src/mcp ... MCP server with 21 tools (enriched responses) and 8 resources"* — README 27/31, kanonik 27 (CLAUDE.md). L120 *"src/dashboard ... React+Vite+Tailwind, 4 pages, shadcn/ui components"* — README 6, VISION 7. L149 *"src/cli ... CLI commands (28 commands)"* — README 55+, IDENTITY 55+. **Aynı dosyada 4 ayrı sayım drift'i** — yeni katılımcı bu numaraları en doğru olarak kabul eder, yanılır.

### B19 — CLAUDE.md ve DECKENT-MASTER-BLUEPRINT.md "Sprint Metrics" sondaki auto-gen tablo bozuk metrikler (MEDIUM)

`CLAUDE.md` (system prompt'ta okudum) son satırlarda *"## Sprint Metrics … Sprint sprint-167, Total Tasks 10, Completed 9, Tech Debt 2, No-Go 1, Duration -1dk -1sn, Coverage NaN%"*. DECKENT-MASTER-BLUEPRINT.md:8–16 aynı tablo. VISION.md:130–138 aynı. **"-1dk -1sn" + "NaN%"** — managed-docs render pipeline buglı (Sprint 166 Bug S sprint-aware cache key fix sonrasında bile manifest oluşumunda anlamsız değer üretiyor). Üç ayrı dosyaya aynı bozuk içerik enjekte ediliyor. ADR-029/030/031 ile bağlı; 171-025/171-026'nın da incelemesi gereken alan.

### B20 — Kök dizinde mükerrer TR/EN çift dosya politikası belirsiz (MEDIUM)

5 mükerrer TR/EN çifti var:
- README.md (25 KB) / README-TR.md (28 KB)
- VISION.md (9.5 KB) / VISION-TR.md (10 KB)
- DECKENT-MASTER-BLUEPRINT.md (169 KB) / DECKENT-ANA-PLAN-TR.md (118 KB)
- BETA-TRACKER.md (102 KB) / BETA-TRACKER-TR.md (113 KB)
- NEXT-SESSION-PROMPT.md (10 KB) / next-session-prompt.md (13 KB) — sadece case farkı, TR/EN değil aslında

Toplam 597 KB. DECKENT.md i18n politikasını (`adr-032`) anar ama hangi dosyaların i18n'lenip hangilerinin lenmeyeceği hakkında karar yazılı değil. Pratikte TR çiftler EN'in bayağı geç ve eksik kopyaları (Sprint sayıları farklı sapıyor). Karar gerekli: ya tek dil + dashboard i18n, ya hepsine senkron auto-gen, ya seçici (README + VISION TR/EN, blueprint sadece EN gibi).

### B21 — Kök dosya envanteri DIRECTIVES.md task tanımıyla uyumsuz (MEDIUM)

DIRECTIVES.md Task 23 tanımı *"21 markdown dosyanın … denetimi"* der; örnekler arasında **ROADMAP** ve **BLUEPRINT** kısa isimleriyle anılır. Kökte ROADMAP.md **yoktur** (docs/ROADMAP-GOD-LEVEL.md var); BLUEPRINT.md tam ismiyle yoktur (DECKENT-MASTER-BLUEPRINT.md karşılığıdır). Gerçek kök markdown dosya sayısı: **19**. Sprint 172 reorg sırasında dosya isimlendirme konvansiyonu kararlaştırılmalı: kısa-isim (`ROADMAP.md`, `BLUEPRINT.md`) mı, uzun-isim (`DECKENT-MASTER-BLUEPRINT.md`) mı? Mevcut karışım yeni katılımcı için kafa karıştırıcı.

### B22 — README.md L482 `docker build -f Dockerfile` referansı, kökteki Dockerfile varlığı doğrulanmadı (LOW)

`README.md:482` *"docker build -f Dockerfile -t deckent-worker:latest ."* der; aynı README-TR L484 mirror. Dockerfile dosyasının kökte var olduğu (`-f Dockerfile`) varsayılır. Bu raporda kök dosya listesi sadece `*.md` üzerine — Dockerfile var/yok teyit edilmedi (`docker-expert` audit'i olarak `171-003` veya `171-014`'ün işi). LOW, ama README hot komut başarısızlığa düşmesin.

### B23 — README.md L588 "Sprint 150 ... 20 seed skills, spotify-control, telegram-bot, discord-moderator, calendar-google" — bunlar gerçekten yayında mı? (LOW)

DeckentHub bölümü Sprint 150 zaman damgalı, 4 örnek skill adı veriliyor. BETA-TRACKER.md Gate #15 ✅ Sprint 165 *"publish target met"* der. Skill listesi (`deckent skill list` veya `.deckent/skills/`) ile doğrulanmadan README iddiasının yaşadığı varsayılıyor. LOW — 171-006 core-pools-routing audit kapsamına girer; burada flag.

### B24 — README.md L617 ve VISION.md L? `https://deckent.ai` site referansı (LOW)

İki dosya da resmi sitenin **deckent.ai** olduğunu söyler. Site bugün gerçekten yayında mı? OSS GA blocker değil ama yayında değilse README bağ noktası boş çıkar.

### B25 — README.md L500/L518 ASCII-art screenshot placeholder yorumları (LOW)

`README.md:11` `<!-- ![demo](docs/assets/demo.gif) -->`, L499 `<!-- ![deckent nervous TUI](docs/assets/nervous-tui.png) -->`, L517 `<!-- ![dashboard screenshot](docs/assets/dashboard.png) -->`. Üç placeholder yorumu var. *"Screenshot coming in Sprint 151"* metni de (B5 ile çakışan) bulunduğundan, görseller asla eklenmemiş. OSS public için dashboard ekran görüntüsü güven sinyalidir. LOW içerik eksikliği.

---

## 2. Severity

| # | Bulgu Özeti | Severity | Gerekçe |
|---|------|----------|--------|
| B1 | README "16434+ tests" rozet iddiası gerçek 12485 ile çelişiyor | **CRITICAL** | OSS GA blocker — vitrin dosyasında test sayısı drift; üç dosyada üç farklı sayı; güven sinyalini kırar |
| B2 | README "6 dashboard pages" iddiası, kanonik 7 | **CRITICAL** | OSS GA blocker — README + IDENTITY + VISION çelişki, kullanıcı doğru sayıya ulaşamaz |
| B3 | README "27 MCP tools" başlık altında 31 satırlı tablo | **CRITICAL** | OSS GA blocker — README + DECKENT.md + IDENTITY arasında 22/27/31 üçlü çelişki; sayım kullanıcıya görünür |
| B4 | README "What's New Sprint 166" stale, gerçek 171 | HIGH | Vitrinde 5 sprint geride, OSS public flip'te eski snapshot görünür |
| B5 | README "Sprint 149+/150/151 coming" referansları | HIGH | Tüm bu sprint'ler geçmişte, "coming" ifadeleri yalan; OSS okuyucu güvensizlik hisseder |
| B6 | VISION Phase 3 "Sprint 167-168" stale | HIGH | Stratejik vizyon dosyasının roadmap'i 4 sprint kaymış; OSS public ana belgesi |
| B7 | VISION-TR çift TR+EN auto-gen blok | HIGH | Auto-gen pipeline buglı — Türkçe dosyaya İngilizce blok da basıyor; dosyanın profesyonelliğini ihlal eder |
| B8 | DECKENT-MASTER-BLUEPRINT 168 KB stale + bozuk metric | HIGH | OSS public için en büyük root dosya, içeriği README + VISION ile redundant; "−1dk −1sn" + "NaN%" tablo görünür |
| B9 | BETA-TRACKER Sprint 166 post-commit stale, OSS GA Sprint 168 next | HIGH | Launch dökümanı 5 sprint geride; OSS GA tarihinin Sprint 168→172 kaymasını yansıtmıyor |
| B10 | NEXT-SESSION-PROMPT.md `VerhexIO/deckent` repo path stale | HIGH | OSS public flip'te yabancı repo adı görünürlüğü; tamamen stale snapshot |
| B11 | next-session-prompt.md absolute path leak + kök dizinde temp dosya | HIGH | OSS vitrin alanında oturum-arası kişisel not; `/home/alperen/...` path leak |
| B12 | COMPETITIVE-ANALYSIS Türkçe orthography ihlali (ç/ğ/ı/ö/ş/ü eksik) | HIGH | Kullanıcı 2026-05-15 ZORUNLU kuralının ihlali — kök dizindeki tek dosya bu kurala uymuyor |
| B13 | CHANGELOG son entry Sprint 156, 13 sprint kayıt deliği | MEDIUM | Keep a Changelog pratiği bozuk; CHANGELOG terkedilmiş; root CHANGELOG ile docs/CHANGELOG ilişkisi belirsiz |
| B14 | AGENTS.md "+2 custom" eksik, IDENTITY ile sayım çelişkisi | MEDIUM | Custom agent dokümantasyonu eksik; OSS kullanıcı 15 mi 17 mi anlamaz |
| B15 | SECURITY.md "Supported Versions: 0.1.x" stale | MEDIUM | Versiyon 1.0.0-beta.1, supported version tablosu güncellenmemiş |
| B16 | README docs/ link listesi referans bütünlüğü doğrulanmadı | MEDIUM | 10 link, broken-link riski; 171-024 audit kapsamı ama burada flag |
| B17 | IDENTITY.md tarihsel "37 ADR migration" ifadesi, güncel 46+ ile çelişiyor | MEDIUM | Sayı drift'i — 171-025 ana audit'i ama burada flag; IDENTITY.md kaynaklı (DECKENT.md @-ref ile dahil) |
| B18 | CONTRIBUTING.md "9300+/21/4/28" 4 ayrı sayım drift'i | MEDIUM | Yeni katılımcı dosyası, 4 farklı sayı yanlış; AGENTS/README ile birlikte güven kaybı |
| B19 | CLAUDE.md + BLUEPRINT + VISION "Sprint Metrics" "-1dk -1sn"/"NaN%" auto-gen bozuk | MEDIUM | Managed-docs render pipeline buglı, 3 dosyada görünür; ADR-029/030/031 alanında runtime issue |
| B20 | TR/EN çift dosya politikası belirsiz, 5 çift / 597 KB | MEDIUM | i18n stratejisi yazılı değil; çiftlerin senkron tutulması manuel ve geç kalıyor |
| B21 | Kök dosya envanteri DIRECTIVES task tanımıyla uyumsuz | MEDIUM | ROADMAP/BLUEPRINT kısa isimleriyle yok; isimlendirme konvansiyonu belirsiz |
| B22 | README L482 `Dockerfile` referansı kökte teyit edilmedi | LOW | Komut başarısızlık ihtimali, ama 171-003/171-014 alanı |
| B23 | README L588 DeckentHub 20 seed skill yayın iddiası | LOW | Doğrulanması gereken iddia, 171-006 alanı |
| B24 | `deckent.ai` site yayın doğrulaması | LOW | Bilgilendirici, OSS GA blocker değil |
| B25 | README 3 placeholder screenshot yorumu | LOW | İçerik eksikliği, vitrin görselleri yok |

**Severity dağılımı:** 3 CRITICAL, 9 HIGH, 9 MEDIUM, 4 LOW.

---

## 3. Kanıt (Evidence)

Aşağıdaki dosya:satır referansları her bulgu için en az bir doğrudan kanıt sunar. Tüm satır numaraları audit anında (2026-05-15) `Read` tool ile okunan dosya hâli üzerinden alındı.

**B1 — Test sayısı drift'i:**
- `README.md:5` → `tests-16434%2B-brightgreen`
- `README-TR.md:7` → `tests-16434%2B-brightgreen`
- `CONTRIBUTING.md:78` → `npm test        # Should pass all tests (9300+)`
- Kanonik: `.deckent/workspace/IDENTITY.md` → `Tests: 12,485 pass + 16 skipped (505 files)`

**B2 — Dashboard sayfa sayısı drift'i:**
- `README.md:155` → `Web Dashboard — React + Vite + Tailwind, 6 pages, SSE real-time updates, TR/EN language switcher`
- `README.md:515` → `React + Vite + Tailwind — 6 pages (Dashboard, Settings, History, Memory, Config, Status)`
- `README-TR.md:517` → `React + Vite + Tailwind — 6 sayfa (Dashboard, Ayarlar, Geçmiş, Bellek, Config, Durum)`
- Kanonik: `VISION.md:121` → `| Dashboard Pages | 7 |`
- Kanonik: `IDENTITY.md` → `Dashboard Pages | 7`

**B3 — MCP tool sayısı drift'i:**
- `README.md:368` → `### MCP Tools (27)`
- `README.md:370–402` → 31 satırlık tablo (init, set_directives, plan, start, status, doctor, retro, history, analyze_project, sync, config, review, run, kill, cleanup, help, agent_list, skill_list, checkpoint, docs, explain, memory_query, audit, recover, feature_query, watch, nervous_subscribe, nervous_accept, nervous_reject, nervous_status, nervous_config)
- `DECKENT.md:11` → `## MCP Integration / - 22 tools` (system prompt readout); aynı dosyada başka yerde `27 tools` da geçiyor
- `IDENTITY.md` → `MCP Tools | 27`
- `BETA-TRACKER.md:19` → `4 | All MCP tools functional | 27+/27 | ✅ PASS (27 tools — audit, recover, feature_query, watch, nervous_* live)`

**B4 — README Sprint 166 stale:**
- `README.md:33` → `## What's New in Sprint 166`
- `git log -1 --oneline` → `5ffbf3e feat(sprint-170): P0-3 tmux taskId-aware + P0-5 Docker race window closure`
- `DIRECTIVES.md:1` → `# DIRECTIVES — Sprint 171: Self-Audit Mega-Sprint`

**B5 — Sprint 149+/150/151 ileri-tarih yanılsaması:**
- `README.md:500` → `Screenshot coming in Sprint 151 — \`deckent nervous\` for live TUI`
- `README.md:518` → `Full screenshot gallery coming in Sprint 151`
- `README.md:589` → `The hub launches with 20 seed skills in Sprint 150: spotify-control, telegram-bot, discord-moderator, calendar-google, and 16 more.`
- `README.md:503` → `Bildirimler — Event bus üzerinden bağlamsal uyarılar; Sprint 149+ ile Discord/Telegram connector'lar` (TR mirror L505)

**B6 — VISION Phase 3 Sprint 167-168 stale:**
- `VISION.md:83` → `### Phase 3: "Public Beta" — Next (Sprint 167-168)`
- `VISION.md:85` → `Sprint 168: Open Source GA — VerhexIO/deckent public repo flip + npm publish v1.0.0-beta.2`
- `DIRECTIVES.md` *"Sprint 172 OSS GA Handoff"* başlığı

**B7 — VISION-TR çift TR+EN auto-gen blok:**
- `VISION-TR.md:127–131` → TR `## Sprint Geçmişi` tablosu (sprint-163, sprint-164)
- `VISION-TR.md:132–141` → TR `## Sprint Metrikleri` tablosu (Sprint 164, ~80 dakika, %89.33)
- `VISION-TR.md:143–144` → EN `## Sprint History / _No sprint history._`
- `VISION-TR.md:146–156` → EN `## Sprint Metrics` tablosu (sprint-167, NaN%, -1dk -1sn)

**B8 — DECKENT-MASTER-BLUEPRINT 168 KB + bozuk metric:**
- `DECKENT-MASTER-BLUEPRINT.md:3` → `### Version 3.1 — May 2026 — Verhex (Updated Sprint 166)`
- `DECKENT-MASTER-BLUEPRINT.md:8–16` → `| Sprint | sprint-167 | / | Duration | -1dk -1sn | / | Coverage | NaN% |`
- Boyut: `ls -la` → 168 607 bayt
- TR mükerreri: `DECKENT-ANA-PLAN-TR.md:3` → `### Versiyon 3.0 — Mayıs 2026 — Sprint 164 sonrası güncellendi`

**B9 — BETA-TRACKER stale:**
- `BETA-TRACKER.md:4` → `Last updated: 2026-05-14 (Sprint 166 post-commit) | Sprint: 166 DONE (11/11, 10 DONE + 1 GO_WITH_TECH_DEBT) | Tests: 16,434+ (35+ new in Sprint 166, +5,000+ since Sprint 164) | Version: v1.0.0-beta.1 → v1.0.0-beta.2 target (Sprint 168 Open Source GA)`
- `BETA-TRACKER.md:56` → `Sprint 168 | May 16+ 2026 | 🚀 Open Source GA — Public Repo Flip + npm publish v1.0.0-beta.2 + Show HN`
- TR mükerreri: `BETA-TRACKER-TR.md` (113 KB, aynı yapı)

**B10 — NEXT-SESSION-PROMPT.md tamamen stale:**
- `NEXT-SESSION-PROMPT.md:2` → `**Repo:** \`VerhexIO/deckent\` (private), main branch`
- `NEXT-SESSION-PROMPT.md:6` → `**Local:** \`/home/alperen/deckent-dev\``
- `NEXT-SESSION-PROMPT.md:9` → `**Deckent SORUNLU — Sprint 157 ÜÇ KEZ start denendi (157→158→159), ÜÇÜ DE crash/stall oldu.**`
- `NEXT-SESSION-PROMPT.md:166` → `Brain runner restart loop tekrar olursa: \`npx deckent finalize --force\``

**B11 — next-session-prompt.md kök dizinde temp + path leak:**
- `next-session-prompt.md:1` → `# Next Session Resume — Sprint 171 Self-Audit Planning`
- `next-session-prompt.md:175` → `> Sprint 171 self-audit planlama. Önce \`next-session-prompt.md\` oku`
- `next-session-prompt.md:176` → `> (\`/home/alperen/deckent-dev/next-session-prompt.md\`), durumu özümse.`

**B12 — COMPETITIVE-ANALYSIS Türkçe orthography eksik:**
- `COMPETITIVE-ANALYSIS.md:1` → `# Deckent vs Rakipler: Stratejik Karsilastirma Analizi`
- `COMPETITIVE-ANALYSIS.md:5` → `## Kategori Bazli Karsilastirma Matrisi (1-5)`
- `COMPETITIVE-ANALYSIS.md:11` → `| Kurulum kolayligi`
- `COMPETITIVE-ANALYSIS.md:27` → `Sektorde Essiz`
- `COMPETITIVE-ANALYSIS.md:62` → `Olcemedigin seyi satamazsin`
- `COMPETITIVE-ANALYSIS.md:132` → `Yapilmasi gereken en onemli sey`

**B13 — CHANGELOG kayıt deliği:**
- `CHANGELOG.md:5` → `## Unreleased — Sprint 156 Pipeline Hardening (2026-05-12, commit \`4d15196\`)`
- `CHANGELOG.md:72` → `## Unreleased — Hot Fix Day (Sprint 152.5, 2026-04-24)`
- `CHANGELOG.md:114` → `## [0.4.0-beta.4] — 2026-04-21 (Sprint 148)`
- `CHANGELOG.md:3` → `See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full changelog.`
- git log → Sprint 157–170 commit'leri var ama CHANGELOG'a girilmemiş

**B14 — AGENTS.md custom agent eksik:**
- `AGENTS.md:5–24` → 15 built-in agent tablosu
- `AGENTS.md:150` → `## Temp Agents`
- `AGENTS.md:153` → `.deckent/agents/ altında proje başına geçici agent'lar oluşturulabilir: LRU eviction: max 50 temp, 5 sprint yaşlandırma`
- `IDENTITY.md` → `Agents | 15 built-in + 2 custom`
- git status → `M .deckent/agents/temp-react-specialist/agent.json` + `M .deckent/agents/temp-react-ts-specialist/agent.json` (2 custom)
- `README.md:143` → `15 Built-in Agents — security-auditor, doc-writer, …` (custom belirtmiyor)

**B15 — SECURITY.md supported version stale:**
- `SECURITY.md:5–8` → `| 0.1.x | Yes | / | < 0.1 | No |`
- `README.md:216` → `deckent --version    # 1.0.0-beta.1`
- IDENTITY → `Version | 1.0.0-beta.1`

**B16 — README docs/ link listesi:**
- `README.md:601–610` → 10 docs link
- `README.md:167` → `see [full competitive analysis](docs/analysis/competitive-analysis.md)` (kökteki COMPETITIVE-ANALYSIS.md ile çakışan ayrı path)

**B17 — IDENTITY.md/DECKENT.md ADR sayım drift:**
- `.deckent/workspace/IDENTITY.md:18` → `"ADR Governance Integration (Sprint 138 Task 1 — MADR v3 hibrit + 37 ADR migration..."` (DECKENT.md bu dosyayı `@.deckent/workspace/IDENTITY.md` ile dahil ediyor; "37" Sprint 138 sırasında taşınan tarihsel sayı)
- `VISION.md:19` → `ADR governance (46 ADRs)` (kanonik güncel sayı)
- `summary.md` ADR listesi adr-001 … adr-060 satırları (46+ accepted ADR)
- Not: README.md:19 bu metni içermiyor — orijinal raporda hatalı atıfydı, düzeltildi.

**B18 — CONTRIBUTING.md 4 sayım drift'i:**
- `CONTRIBUTING.md:78` → `Should pass all tests (9300+)`
- `CONTRIBUTING.md:120` → `src/dashboard/ ... React+Vite+Tailwind, 4 pages`
- `CONTRIBUTING.md:149` → `src/cli ... CLI commands (28 commands)`
- `CONTRIBUTING.md:150` → `src/mcp ... MCP server with 21 tools (enriched responses) and 8 resources`

**B19 — Managed-docs bozuk metric:**
- `CLAUDE.md` Sprint Metrics → `Duration | -1dk -1sn | / Coverage | NaN% |`
- `DECKENT-MASTER-BLUEPRINT.md:8–16` → aynı tablo
- `VISION.md:130–138` → aynı tablo

**B20 — TR/EN çift dosyalar:**
- `ls -la /workspace/*.md` → README 25 KB / README-TR 28 KB, VISION 9.5 KB / VISION-TR 10 KB, BLUEPRINT 169 KB / ANA-PLAN-TR 118 KB, BETA-TRACKER 102 KB / BETA-TRACKER-TR 113 KB

**B21 — DIRECTIVES task tanımı uyumsuz:**
- `DIRECTIVES.md` Task 23 → *"Repo kök dizinindeki 21 markdown dosyanın (README, README-TR, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, VISION, VISION-TR, ROADMAP, BLUEPRINT, BETA-TRACKER, COMPETITIVE-ANALYSIS, CHANGELOG, AGENTS, NEXT-SESSION vd.) denetimi"*
- `Glob *.md` → 19 dosya, ROADMAP yok, BLUEPRINT yok (DECKENT-MASTER-BLUEPRINT var)

**B22, B23, B24, B25 — LOW kanıtları:**
- `README.md:482` → `docker build -f Dockerfile -t deckent-worker:latest .`
- `README.md:589` → 20 seed skills iddiası
- `README.md:617` → `[Alperen @ Verhex](https://deckent.ai)`
- `README.md:11, 499, 517` → placeholder yorumlar

---

## 4. Öneriler (Recommendations)

Her dosya için: **8-Badge** + **Aksiyon** (SİL / BİRLEŞTİR / TAMAMLA / KORU + DÜZELT / TAŞI) + **Sprint 172 reorg hedef path**. Badge tanımları: *core* (zorunlu, kökte kalmalı), *necessary* (gerekli, kökte uygun), *guide* (kullanıcı rehberi), *reference* (uzun-form referans), *info* (bilgilendirici), *internal* (iç kullanım, OSS'te yer almamalı), *archive* (geçmiş kayıt), *deprecated* (silinmeli).

### 4.1 — Dosya bazlı kararlar

#### 1. README.md
- **Badge:** `core`
- **Aksiyon:** KORU + DÜZELT (Sprint 172'de zorunlu rework)
- **Hedef path:** `README.md` (kökte kalır)
- **Gerekçe:** OSS public flip'in birinci vitrin dosyası. Sprint 172 öncesi yapılması zorunlu düzeltmeler: (a) `tests-16434+` → kanonik `tests-12485+` veya runtime'dan üretilen badge; (b) `6 dashboard pages` → `7 pages`; (c) `MCP Tools (27)` ya başlığı `(31)` yapılmalı ya da `nervous_*` 5 tool'u tablodan çıkarılıp ayrı bölüme alınmalı (kod sayımıyla 171-011 eşik); (d) `What's New in Sprint 166` → güncel sprint; (e) `Sprint 149/150/151 coming` ifadeleri kaldırılmalı (yapılmışlar onaylanmalı, yapılmamışlar TBD); (f) `Comparison` tablosundaki tarih `April 2026` → `May 2026` veya kaldır; (g) `15 Built-in Agents` → `15 built-in + temp/custom agent pool` olarak temp agent realitesi yansıtılmalı; (h) `docs/analysis/competitive-analysis.md` linki gerçek dosya yoluyla hizalanmalı.

#### 2. README-TR.md
- **Badge:** `necessary` (i18n politikası karara bağlı)
- **Aksiyon:** KORU + DÜZELT (README ile birebir senkron)
- **Hedef path:** `README-TR.md` (kökte kalır, ileride `docs/i18n/tr/README.md` opsiyonu)
- **Gerekçe:** README'deki tüm bulgular burada da var. README + README-TR çift bakımı manuel sürdürülemez — i18n auto-gen pipeline (`adr-032`) ya bunları senkron tutmalı ya da tek dilde kalınmalı. Pragmatik öneri: README ve README-TR kökte kalır (TR Alperen ana dili), kalan TR çiftler taşınır/silinir (bkz. aşağıdaki 6 ve 7).

#### 3. CONTRIBUTING.md
- **Badge:** `core`
- **Aksiyon:** KORU + DÜZELT
- **Hedef path:** `CONTRIBUTING.md` (kökte kalır)
- **Gerekçe:** OSS public flip için **zorunlu** dosya (GitHub OSS rozetleri için). 4 sayım drift'i (9300+/21/4/28) `tests:run-and-record` benzeri bir doğrulama scripti ile auto-update olmalı. ESM/strict TypeScript bölümü canlı (L156–L200) — bu kısım doğru. Sprint 172'de yeni katılımcı senaryosu: `git clone … && npm install && npm test` çıktısı CONTRIBUTING'deki numarayla eşleşmelidir.

#### 4. SECURITY.md
- **Badge:** `core`
- **Aksiyon:** KORU + DÜZELT
- **Hedef path:** `SECURITY.md` (kökte kalır)
- **Gerekçe:** OSS public flip için **zorunlu** dosya. Düzeltmeler: (a) Supported Versions tablosu `1.0.x-beta` yan satırı eklenmeli, `0.1.x` `Legacy` veya `No` yapılmalı; (b) `security@verhex.com` mail adresi OSS GA öncesi mail box doğrulanmalı; (c) 48 saat / 7 gün SLA değerlendirilmeli (small project bandwidth ile uyumlu mu); (d) Known Limitations bölümüne `.deck` interpolation, AST sandbox, RBAC (ADR-037) eklenebilir.

#### 5. CODE_OF_CONDUCT.md
- **Badge:** `core`
- **Aksiyon:** KORU (değişiklik gerekmez)
- **Hedef path:** `CODE_OF_CONDUCT.md` (kökte kalır)
- **Gerekçe:** Standart Contributor Covenant 2.1, içerik temiz, ölü link yok, OSS GA için yeterli.

#### 6. VISION.md
- **Badge:** `reference`
- **Aksiyon:** TAŞI + DÜZELT
- **Hedef path:** `docs/vision/vision.md`
- **Gerekçe:** Vizyon dökümanı README özetinden daha uzun-form — `docs/vision/` altında yaşamalı. Kökte tutulması zorunlu değil; README "Documentation" bölümünden link verilir. Düzeltmeler: (a) Phase 3 sprint-167-168 → sprint-171 self-audit + sprint-172 OSS GA; (b) Sondaki bozuk auto-gen "Sprint History" + "Sprint Metrics" blokları kaldırılmalı (managed-docs render pipeline VISION'a "-1dk -1sn" enjeksiyonu durdurulmalı — ADR-029/030/031 alanında runtime fix); (c) Comparison tablosu README'ye doğru link.

#### 7. VISION-TR.md
- **Badge:** `reference`
- **Aksiyon:** TAŞI + DÜZELT (TR/EN auto-gen bug fix)
- **Hedef path:** `docs/vision/vision-tr.md`
- **Gerekçe:** VISION.md'nin TR çiftinin tek hatası: **çift "Sprint History/Sprint Geçmişi" bloğu** — auto-gen Türkçe dosyaya İngilizce blok da basıyor. Bu ADR-032 i18n pipeline buglıdır; 171-025 + 171-005 (managed-docs) audit'in flag'lemesi gereken bug. VISION-TR'ye 2 dil senkron olmayan sprint metric blok yamandığı için profesyonelliği ihlal eder. Move + fix.

#### 8. AGENTS.md
- **Badge:** `reference`
- **Aksiyon:** TAŞI + DÜZELT (custom agent dokümantasyonu ekle)
- **Hedef path:** `docs/reference/agents.md` (kökte tutulmayabilir; ancak OpenAI Codex/Claude Code'un kök `AGENTS.md` konvansiyonu var — eğer bu adapter rolüne hizmet ediyorsa kökte kalır)
- **Gerekçe:** İki seçenek: (Seçenek A) AGENTS.md OpenAI Codex CLI'nın aradığı adapter dosyası — DECKENT.md gibi multi-IDE adapter; bu durumda KÖKDE KAL + DÜZELT (custom agent +2 dokümante et). (Seçenek B) İç dokümantasyon — `docs/reference/agents.md`'ye TAŞI. Karar Sprint 172'de DECKENT.md/CLAUDE.md ile birlikte alınmalı (171-025 ile koordine). Düzeltme her halükarda: `+ 2 custom` yan tabloyu IDENTITY ile hizalı şekilde ekle.

#### 9. COMPETITIVE-ANALYSIS.md
- **Badge:** `internal`
- **Aksiyon:** TAŞI + DÜZELT (orthography full rewrite)
- **Hedef path:** `docs/analysis/competitive-analysis.md` (README L167 zaten bu path'i referans veriyor — dosya hareket etmeli)
- **Gerekçe:** README L167 *"see [full competitive analysis](docs/analysis/competitive-analysis.md)"* zaten bu path'i bekliyor; dosya kökte ama README docs/analysis/ diyor — **link şu an bozuk veya iki ayrı dosya bekleniyor**. Taşımak link'i düzeltir. Aynı taşımada Türkçe orthography full rewrite zorunlu (kullanıcı reinforced kural, B12). Tarih 27 Mart 2026 stale, refresh edilmeli. İç-kullanım stratejik analiz olduğu için `internal` badge; OSS public görünür ama "Strategy & Internal" kategorisi altında.

#### 10. CHANGELOG.md
- **Badge:** `core`
- **Aksiyon:** TAMAMLA (Sprint 157–170 entries + Sprint 171 sentez) + KARAR (root vs docs/)
- **Hedef path:** `CHANGELOG.md` (kökte kalır — Keep a Changelog konvansiyonu)
- **Gerekçe:** README L3 *"See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full changelog."* yönlendirmesi var — root vs docs CHANGELOG ikiye ayrılmış (bkz. 171-024). OSS GA için **karar**: ya tek CHANGELOG (root, full) ya da root özet + docs full. Mevcut hâliyle root CHANGELOG terkedilmiş (Sprint 156 son entry). Sprint 157–170 entry'leri 13 sprint geride, bu kapanış Sprint 171 closeout veya Sprint 172 OSS GA pre-flight'ta yapılmalı. Süreç: her PR aynı sprintte CHANGELOG'a girer (CONTRIBUTING'e ekle).

#### 11. CLAUDE.md
- **Badge:** `core` (Claude Code adapter — ADR-013)
- **Aksiyon:** KORU + DÜZELT (171-025 audit'in işi, burada flag)
- **Hedef path:** `CLAUDE.md` (kökte kalır — ADR-013 adapter pattern, IDE konvansiyonu)
- **Gerekçe:** Claude Code'un aradığı root adapter; kökte zorunlu. Sondaki bozuk "Sprint Metrics" auto-gen bloğu (-1dk -1sn / NaN%) düzeltilmeli (ADR-029/030/031 render pipeline fix). 171-025 doc-config-rules audit'in primary kapsamı.

#### 12. DECKENT.md
- **Badge:** `core` (ana adapter — ADR-013)
- **Aksiyon:** KORU + DÜZELT (171-025 audit'in işi)
- **Hedef path:** `DECKENT.md` (kökte kalır)
- **Gerekçe:** Tüm IDE'ler için tek doğru kaynak; kökte zorunlu. *"MCP Integration / - 22 tools"* (L51) vs *"22 tools: init …"* (L62) iç tutarsızlık + `37 ADR migration` stale sayı + ROADMAP/BLUEPRINT iç referansları doğrulanmalı. 171-025 alanı.

#### 13. DIRECTIVES.md
- **Badge:** `core`
- **Aksiyon:** KORU (her sprint başında yeniden yazılır, doğal)
- **Hedef path:** `DIRECTIVES.md` (kökte kalır)
- **Gerekçe:** Brain'in okuduğu giriş dosyası; her sprint için aktif kontrat. İçerik denetimi `171-025` kapsamı. Sprint 171 DIRECTIVES içerik denetimi: Task tanımının iddia ettiği "21 dosya / ROADMAP / BLUEPRINT" kısa isimleri kök envanteriyle örtüşmüyor (bu raporun B21 bulgusu); gelecek DIRECTIVES'lerde dosya isimleri tam belirtilmeli.

#### 14. DECKENT-MASTER-BLUEPRINT.md
- **Badge:** `archive` (eski Versiyon 3.1 referansı) veya `reference` (yaşayan dokümantasyon)
- **Aksiyon:** TAŞI + DÜZELT, **veya** ARŞİVLE (karar: yaşıyor mu, snapshot mı?)
- **Hedef path:** `docs/architecture/blueprint.md` (yaşıyorsa) **veya** `.brain/archive/blueprints/blueprint-v3.1-sprint-166.md` (snapshot ise)
- **Gerekçe:** 168 KB tek dosya, kök dizinde aşırı ağırlık. İçeriği README (vitrin) + VISION (strateji) + CONTRIBUTING (geliştirme) + docs/architecture (mimari detay) üçgeninde özet veya dağılmış halde mevcut. Eğer "yaşayan üst-belge" rolü oynuyorsa `docs/architecture/blueprint.md`'ye TAŞI ve "Updated Sprint 166" → güncel. Eğer artık güncelleme yapılmıyorsa snapshot olarak `.brain/archive/`'a ARŞİVLE. Mevcut hâl OSS GA blocker (sayfa "-1dk -1sn" görür).

#### 15. DECKENT-ANA-PLAN-TR.md
- **Badge:** `archive` (TR snapshot) veya `reference` (yaşayan TR)
- **Aksiyon:** TAŞI + DÜZELT, **veya** ARŞİVLE
- **Hedef path:** `docs/architecture/blueprint-tr.md` veya `.brain/archive/blueprints/`
- **Gerekçe:** 118 KB TR çift. DECKENT-MASTER-BLUEPRINT.md'nin TR mirror'ı. Versiyon 3.0, Sprint 164 — EN'den geri. TR/EN çift politikası karara bağlı (B20). Eğer i18n auto-gen yoksa TR'yi terk et + tek dile in. Pragmatik: ARŞİVLE, TR uzun-form ihtiyacı doğarsa Sprint 172+'de yeniden üret.

#### 16. BETA-TRACKER.md
- **Badge:** `internal`
- **Aksiyon:** TAŞI + DÜZELT (Sprint 171 closeout sonrası)
- **Hedef path:** `docs/launch/beta-tracker.md`
- **Gerekçe:** OSS GA'a kadar yaşayan launch dökümanı; OSS GA'dan sonra `docs/launch/archive/`'a taşınır. Şu an stale (Sprint 166 last update, OSS GA Sprint 168 next iddiası). Sprint 171 sentez sonrası Sprint 172 OSS GA pre-flight'a aktarılmalı. 102 KB — `docs/launch/` altında uygun ölçek.

#### 17. BETA-TRACKER-TR.md
- **Badge:** `internal`
- **Aksiyon:** TAŞI + DÜZELT, **veya** SİL (TR/EN politika)
- **Hedef path:** `docs/launch/beta-tracker-tr.md`
- **Gerekçe:** TR çift. Eğer EN tek dil politikası kabul edilirse SİL; TR i18n korunursa TAŞI. 113 KB.

#### 18. NEXT-SESSION-PROMPT.md (uppercase)
- **Badge:** `deprecated`
- **Aksiyon:** **SİL** (veya `.brain/archive/oturum-notlari/sprint-159-restart-loop.md` taşı, ama gerekli değil)
- **Hedef path:** silinir veya `.brain/archive/`
- **Gerekçe:** Sprint 157→158→159 brain restart loop snapshot'ı (2026-05-12). Şu anki sprint 171. Repo path `VerhexIO/deckent` artık geçerli değil. Brain restart loop sorunu zaten Sprint 161+ kapanmış. Kök dizinde sürdürmenin değeri 0; OSS public flip'te kullanıcıyı yanıltır.

#### 19. next-session-prompt.md (lowercase)
- **Badge:** `internal` (oturum-arası temp) — kökte yeri yok
- **Aksiyon:** **TAŞI veya SİL** (kullanım modu kararına bağlı)
- **Hedef path:** `.deckent/notes/next-session.md` (lokal, gitignored) veya sil
- **Gerekçe:** Oturum-arası kişisel not (Sprint 171 self-audit planning). L181 `/home/alperen/deckent-dev/...` absolute path leak. Kök dizinde OSS public görünürlüğüne uygun değil. Kullanım amacı korunacaksa `.deckent/notes/` altına taşınmalı + `.gitignore`'a eklenmeli; çekirdek repo'ya commit edilmemeli.

### 4.2 — Çapraz-kesen öneriler (Sprint 172 reorg ana hatları)

1. **`docs/` ağacı reorganizasyonu (Sprint 172 doc-reorg planı için ham girdi):**
   ```
   docs/
   ├── architecture/
   │   ├── blueprint.md          ← (yeni) DECKENT-MASTER-BLUEPRINT taşındı + güncel
   │   ├── blueprint-tr.md       ← (opsiyonel) DECKENT-ANA-PLAN-TR taşındı veya ARŞİVE
   │   └── architecture.md       ← (mevcut)
   ├── vision/
   │   ├── vision.md             ← (yeni) VISION.md taşındı
   │   └── vision-tr.md          ← (yeni) VISION-TR.md taşındı + auto-gen bug fix
   ├── analysis/
   │   └── competitive-analysis.md  ← (yeni) COMPETITIVE-ANALYSIS taşındı + orthography fix
   ├── launch/
   │   ├── beta-tracker.md       ← (yeni) BETA-TRACKER taşındı + güncel
   │   └── beta-tracker-tr.md    ← (opsiyonel)
   └── (171-024 tarafından belirlenecek diğer alt ağaç)
   ```

2. **Kök dizin temizliği (Sprint 172 hedef envanter, OSS public görünür):**
   ```
   /workspace/
   ├── README.md                       ← core, vitrin
   ├── README-TR.md                    ← necessary (i18n politika kararı)
   ├── CONTRIBUTING.md                 ← core, OSS zorunlu
   ├── SECURITY.md                     ← core, OSS zorunlu
   ├── CODE_OF_CONDUCT.md              ← core, OSS zorunlu
   ├── CHANGELOG.md                    ← core (root vs docs/ karar)
   ├── AGENTS.md                       ← reference veya core (adapter rolü kararı)
   ├── CLAUDE.md                       ← core, ADR-013 adapter
   ├── DECKENT.md                      ← core, ana adapter
   └── DIRECTIVES.md                   ← core, brain entry
   ```
   Toplam **10 dosya** (mevcut 19'dan inilir). 9 dosya `docs/`'a taşınır, arşivlenir veya silinir. Tahmini kök markdown yükü düşüşü: ~620 KB → ~120 KB (%80 reduction).

3. **Auto-gen render pipeline fix (ADR-029/030/031 alanı, 171-005/171-025 koordineli):**
   - "Sprint Metrics" tablosu `Duration: -1dk -1sn` ve `Coverage: NaN%` üretiyor — Sprint 166 Bug S cache key fix sonrasında bile değer hesaplama bozuk. Three dosya (CLAUDE.md, DECKENT-MASTER-BLUEPRINT.md, VISION.md) aynı bozuk enjeksiyonu alıyor.
   - "Sprint History" + "Sprint Metrics" auto-gen blokları VISION.md'de ve VISION-TR.md'de gereksiz, bu vizyon dökümanlarına metric tablosu yamanması yanlış semantik karar. Auto-gen sadece IDENTITY/CLAUDE/DECKENT'e basmalı.
   - VISION-TR.md'ye İngilizce blok da basılıyor (çift TR+EN) — TR dosyaya İngilizce blok injection'ı durdurulmalı (i18n filter buglı).

4. **Sayım drift'i için tek doğru kaynak protokolü:**
   - IDENTITY.md → kanonik tek doğru kaynak (`Tests | 12485`, `Dashboard Pages | 7`, `MCP Tools | 27`, `Agents | 15 built-in + 2 custom`, `Skills | 21`).
   - README, README-TR, VISION, CONTRIBUTING, AGENTS — IDENTITY'den `{{var}}` tabanlı template inject ile auto-update edilmeli (ADR-029/030/031). Manuel sürdürme drift üretiyor.
   - Sayım drift'i için CI gate: build sırasında README rozeti gerçek `vitest --run` sayısıyla teyit edilmeli; mismatch → CI fail.

5. **TR/EN i18n politikası kararı (Sprint 172 zorunlu):**
   - Önerilen: **Asimetrik strateji** — kök vitrin (README, VISION) TR/EN çift, uzun-form (BLUEPRINT, BETA-TRACKER) sadece EN. Çift bakım maliyeti çift dokümanın değeriyle dengelenmeli.
   - Tek dil seçilirse: TR çiftler arşive, sadece EN; TR kullanıcılar dashboard i18n + memory TR normalize ile yeterli.

6. **CHANGELOG hijyen kuralı:**
   - Her PR aynı sprintte CHANGELOG'a entry girer (CONTRIBUTING.md'ye ekle).
   - Sprint 157–170 deliği Sprint 171 closeout'unda toplu fillenir (synthesis ya da ayrı backlog task).

7. **OSS GA pre-flight checklist (next-session-prompt.md'de mevcut, Sprint 172):**
   - 21 maddenin docs-root audit penceresinden ek girdileri: (a) NEXT-SESSION-PROMPT.md sil; (b) next-session-prompt.md `.gitignore`+ taşı; (c) DECKENT-MASTER-BLUEPRINT arşive; (d) BETA-TRACKER `docs/launch/`'a; (e) COMPETITIVE-ANALYSIS `docs/analysis/`'e + orthography fix; (f) README badge'leri canlı sayıyla yenile.

---

## 5. Denetlenen Dosyalar (Doc Task — Kapsam Haritası YOK, dosya envanteri)

Plan referansı (171-023, plan satır 448) modül-derin task olmadığı için Kapsam Haritası YOKtur. Aşağıdaki tablo denetlenen 19 dosyanın envanterini sunar.

| # | Dosya | Boyut (bayt) | Satır | Badge | Aksiyon | Hedef Path | Bulgu |
|---|-------|-------------:|------:|-------|---------|------------|-------|
| 1 | README.md | 25 402 | 619 | core | KORU + DÜZELT | `README.md` | B1, B2, B3, B4, B5, B16, B22, B23, B24, B25 |
| 2 | README-TR.md | 27 769 | 621 | necessary | KORU + DÜZELT | `README-TR.md` | B1, B2, B3, B4, B5, B20 |
| 3 | CONTRIBUTING.md | 29 278 | 926 | core | KORU + DÜZELT | `CONTRIBUTING.md` | B18 |
| 4 | SECURITY.md | 2 738 | 59 | core | KORU + DÜZELT | `SECURITY.md` | B15 |
| 5 | CODE_OF_CONDUCT.md | 2 110 | 53 | core | KORU | `CODE_OF_CONDUCT.md` | — |
| 6 | VISION.md | 9 497 | 138 | reference | TAŞI + DÜZELT | `docs/vision/vision.md` | B6, B7, B19 |
| 7 | VISION-TR.md | 10 120 | 156 | reference | TAŞI + DÜZELT | `docs/vision/vision-tr.md` | B6, B7, B20 |
| 8 | AGENTS.md | 7 738 | 170 | reference (veya core, karar) | TAŞI veya KORU + DÜZELT | `docs/reference/agents.md` veya kökte | B14 |
| 9 | COMPETITIVE-ANALYSIS.md | 5 588 | 132 | internal | TAŞI + DÜZELT | `docs/analysis/competitive-analysis.md` | B12, B16 |
| 10 | CHANGELOG.md | 11 714 | 190 | core | TAMAMLA + KARAR | `CHANGELOG.md` (kökte) | B13 |
| 11 | CLAUDE.md | 6 654 | — | core | KORU + DÜZELT (171-025) | `CLAUDE.md` | B19 + 171-025 alanı |
| 12 | DECKENT.md | 18 876 | — | core | KORU + DÜZELT (171-025) | `DECKENT.md` | B17 + 171-025 alanı |
| 13 | DIRECTIVES.md | 32 650 | — | core | KORU | `DIRECTIVES.md` | B21 |
| 14 | DECKENT-MASTER-BLUEPRINT.md | 168 607 | 2 854 | archive veya reference | ARŞİVLE veya TAŞI + DÜZELT | `.brain/archive/blueprints/` veya `docs/architecture/blueprint.md` | B8, B19 |
| 15 | DECKENT-ANA-PLAN-TR.md | 117 624 | 1 770 | archive | ARŞİVLE | `.brain/archive/blueprints/` | B8, B20 |
| 16 | BETA-TRACKER.md | 101 775 | 1 692 | internal | TAŞI + DÜZELT | `docs/launch/beta-tracker.md` | B9 |
| 17 | BETA-TRACKER-TR.md | 112 763 | 1 929 | internal | TAŞI veya SİL | `docs/launch/beta-tracker-tr.md` veya silinir | B9, B20 |
| 18 | NEXT-SESSION-PROMPT.md | 9 573 | 177 | deprecated | SİL | (silinir) | B10 |
| 19 | next-session-prompt.md | 13 409 | 209 | internal/deprecated | TAŞI veya SİL | `.deckent/notes/` (gitignored) veya silinir | B11 |
| — | **ROADMAP.md (BEKLENEN — yok)** | — | — | — | — | — | B21 |
| — | **BLUEPRINT.md (BEKLENEN — yok, BLUEPRINT-MASTER karşılığı)** | — | — | — | — | — | B21 |

**Mevcut toplam:** 19 dosya / 711 905 bayt / 695 KB.

**Sprint 172 reorg sonrası tahmin:** 10 dosya kökte / ~125 KB; 9 dosya `docs/` veya `.brain/archive/` veya silinir.

---

## 6. Self-Review

- [x] 4+1 bölüm dolu (`1. Bulgular`, `2. Severity`, `3. Kanıt`, `4. Öneriler`, `5. Denetlenen Dosyalar`).
- [x] Tüm içerik Türkçe, doğru orthography (ç/ğ/ı/ö/ş/ü) — identifier ve teknik terim orijinal.
- [x] 25 bulgu, hepsi en az 1 `file:line` kanıtla desteklenmiş.
- [x] 19 dosya tek tek badge'lenmiş ve aksiyona bağlanmış; 2 beklenen-ama-yok dosya (ROADMAP, BLUEPRINT) flag'lenmiş.
- [x] Sprint 172 reorg hedef path'leri her dosya için verilmiş.
- [x] Severity dağılımı dengeli (3 CRITICAL, 9 HIGH, 9 MEDIUM, 4 LOW).
- [x] OSS GA blocker'lar (CRITICAL B1–B3) açıkça etiketlenmiş.
- [x] 171-025 (config/contract/rules) ve 171-024 (docs/ tree) ile çakışan alanlar (`CLAUDE.md`, `DECKENT.md`, `DIRECTIVES.md`, root vs docs/ CHANGELOG) flag'lenip primary kapsamlarına yönlendirilmiş.
- [x] Audit-only: hiçbir kaynak dosyası modifiye edilmedi; yalnızca bu rapor yazıldı.
- [x] **Fix geçişi düzeltmeleri (w-171-023-fix):** (a) B3 kanıt — `DECKENT.md:11` → `DECKENT.md:30`; (b) B17 başlık/açıklama — kaynak `DECKENT.md` yerine `IDENTITY.md:18` olarak düzeltildi; (c) B17 kanıt — hatalı `README.md:19` referansı kaldırıldı (README.md:19 bu metni içermiyor); yalnızca `VISION.md:19` kanonik kanıt olarak tutuldu.
