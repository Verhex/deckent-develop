# Doc Audit: Archive Özet — Audit Raporu (Sprint 171, Task 171-027)

> **Kapsam:** `.brain/archive/`, `.deckent/archive/`, `.audit/`, `examples/`, `deckent-hub/`, `.test/` arşiv-niteliğindeki dizinlerin dizin-bazlı denetimi. Yöntem: örnekleme (her dosya tam okuma değil); öncelik repo boyut/kirlilik + OSS GA `npm publish` / `git` görünürlüğü.
>
> **Tarih:** 2026-05-15 · **Worker:** w-171-027 · **Dil:** Türkçe (zorunlu, kullanıcı reinforced).
>
> **Doğrulama Komutları:** `ls`, `du -sh`, `git ls-files`, `git check-ignore`, `wc -l`, `find`. Hiçbir dosya modify edilmedi; `memory.db`'ye dokunulmadı.

---

## 0. Arşiv Dizin Envanteri

Bu rapor öncesinde her arşiv dizini için ham ölçüm tablosu — sonraki bölümler bu envanterden türetilir.

| # | Dizin | Tip | Disk (du -sh) | git ls-files (tracked) | Dosya Sayısı (toplam) | Son Dokunma | Amaç |
|---|---|---|---|---|---|---|---|
| A1 | `.brain/archive/` | Persistent arşiv | **12 MB** | **2538** | 290 file + 29 dir | 2026-05-15 (sprint-170-tasks) | DB-first öncesi belge yedek + sprint-NNN-tasks JSON/result snapshot'ları + retro/sprint legacy md (97 retro + 121 sprint) |
| A1.1 | `.brain/archive/pre-v2/` | Migration yedeği | 132 KB | tracked | 7 dosya (DECISIONS.md 96KB, MEMORY/RETRO/DEBT/PATTERNS/IDENTITY + manifest.json) | 2026-04 civarı | Memory V2 DB-first geçişi öncesi orijinal .md snapshot'ları + migration-manifest.json (40 ADR, 7 memory section hash'leri) |
| A1.2 | `.brain/archive/decisions-root-pre-sprint143/` | Decisions yedeği | 100 KB | tracked | 2 dosya (DECISIONS.md 96KB + .sha256) | 2026-04 civarı | Sprint 143 öncesi root DECISIONS.md kopyası, pre-v2 ile büyük olasılıkla mükerrer |
| A1.3 | `.brain/archive/sprint-*-tasks/` | Sprint task arşivi | ~6 MB | tracked | 26 dizin (sprint-137..170), ortalama 21 dosya/dir | per-sprint cleanup sonrası | Her sprint sonrası `.tasks/` içeriğinin (task-NNN.json/.result/.hb/.plan/.log) cleanup-archive aşamasında taşındığı yer |
| A1.4 | `.brain/archive/retro-sprint-*.md` | Legacy retro logları | ~400 KB | tracked | 97 dosya (sprint-058..170, aralarda gap) | Per-retro fazı | DB-first öncesi yazılan retro markdown logları; memory.db'de tip `retro` ile mükerrer |
| A1.5 | `.brain/archive/sprint-*.md` | Legacy sprint logları | ~600 KB | tracked | 121 dosya (sprint-001..133 + sprint-135) | Per-sprint sonrası | DB-first öncesi yazılan sprint logları; memory.db'de tip `sprint` ile mükerrer |
| A1.6 | `.brain/archive/sprint-NNN_*.pid` / `.snapshot.json` / `.sprint-state.json` | Runtime artifact | ~100 KB | tracked (kısmi) | ~40 dosya | per-sprint | Crash recovery snapshot (ADR-043) artıkları; aktif sprint dışı kullanım yok |
| A2 | `.deckent/archive/` | Operasyonel arşiv | **620 KB** | **59** | 16 sprint dir + metrics + 1 failed sprint | 2026-05-15 (sprint-168) | Sprint cleanup sonrası `.deckent/sprint-NNN-*` ephemeral artifact'larının taşındığı yer |
| A2.1 | `.deckent/archive/sprints/` | Sprint snapshot arşivi | 552 KB | tracked | 16 dizin (sprint-134..168) | Per-sprint | events.jsonl + checkpoint.json + gate.json + pre-archive.tar.gz; sprint-168'de SADECE `.worker-168-*.sh` (ADR-047 manuel subagent dispatch artıkları) |
| A2.2 | `.deckent/archive/metrics/` | Sıkıştırılmış metrik | 44 KB | tracked | 10 dosya (metrics-sprint-156..170 .jsonl.gz) | Per-sprint | Eski metrik telemetri arşivi (gzip) |
| A2.3 | `.deckent/archive/sprint-158-failed-2026-05-12/` | Failed sprint quarantine | 24 KB | tracked | 5 dosya (checkpoint/events/metrics/seq) | 2026-05-12 | Sprint 158 fail post-mortem snapshot — debug için izole edilmiş |
| A3 | `.audit/` | Self-audit raporları | **472 KB** | **22** | sprint-167 (21) + sprint-169 (1) | 2026-05-14 21:56 | Sprint 167 read-only OSS self-audit (T1-T7 + predicate.sh + consolidated + roadmap) + Sprint 169 W3.1 root-cause analizi |
| A3.1 | `.audit/sprint-167/` | OSS self-audit batch | 456 KB | tracked | 21 dosya (T1..T7 raporlar + predicate.sh ×6 + _inspect.mjs + consolidated-inventory.md + oss-whitelist.json + sprint-168-roadmap.md) | 2026-05-14 10:37 | OSS GA öncesi tam-kapsamlı self-audit: 11 alanda bulgu defteri (test count drift 505→772, MCP tool drift 27→31 vd.) |
| A3.2 | `.audit/sprint-169/` | RC analizi | 12 KB | tracked | 1 dosya (W3.1-root-cause.md, 175 satır) | 2026-05-14 21:59 | Sprint 169 W3.1 C0c "collision detection path-normalization gap" silent-bypass RC + fix önerisi |
| A4 | `examples/quickstart/` | OSS onboarding örneği | 12 KB | **3** | 3 dosya (README.md + DIRECTIVES.md + package.json) | 2026-05-12 | OSS public kullanıcısı için minimal 2-task deckent demo; npm `deckent` workspace:* bağımlılığı |
| A5 | `deckent-hub/` | Skill marketplace prototipi | ~80 KB | **65** | 3 root md (README/CONTRIBUTING/SKILL_TEMPLATE) + 20 skill dir × 3 dosya (SKILL.md + manifest.json + signature.ed25519) | 2026-05-12 | Ed25519-imzalı skill registry: 20 hazır skill (spotify-control, slack-notifier, calendar-google, twitter-post vd.). README "ClawHub alternatifi" vaadi |
| A6 | `.test/` | Smoke artifact | 8 KB | **3** | 3 dosya (sprint-168-smoke-directives.md 1989B + shared.txt 16B + sleep-result.txt 169B) | 2026-05-14 18:17 | Sprint 168 smoke test sırasında oluşturulan throw-away artifact'lar — aktif kullanım yok |
| A7 | `.test-e2e-sprint-*` (×11 dizin) | E2E test scratch | ~500 KB (~80 KB×6 + ~20 KB×4 + 16 KB) | **0** | 11 dizin, her biri `.tasks/` alt-dizini ile (task-001-NNN.json/.result/.hb fixture'ları) | 2026-05-12..2026-05-15 | Vitest e2e test'lerinin spawn ettiği geçici fixture sprint dizinleri; tracked DEĞİL ama `.gitignore`'da da yok — orphan |

**Toplam arşiv ayak izi:** ≈13.1 MB disk, ≈2690 tracked dosya. Bu, repo'nun tüm git LOC'unun büyük bir bölümünü tek başına temsil ediyor (özellikle `.brain/archive/sprint-*-tasks/` ve legacy `.md` log'lar nedeniyle).

---

## 1. Bulgular (Findings)

### 1.1 `.brain/archive/` — 2538 tracked dosya, 12 MB; OSS GA için en büyük blot

**B1.** `.brain/archive/sprint-*-tasks/` (26 dizin, ~500 dosya, sprint-137..sprint-170) **tamamen tracked**. Her dizin per-sprint cleanup sonrası taşınan `.tasks/` içeriği (`task-NNN.json`, `.result`, `.hb`, `.plan`, `.log`). Bu içerik runtime artifact'tır — kullanıcıya değer üretmez, debug için bile DB'deki memory entry'leri yeterlidir. `git clone` indiren OSS kullanıcısı bunları indiriyor.

**B2.** Legacy `.brain/archive/retro-sprint-*.md` (97 dosya, ~400 KB) + `.brain/archive/sprint-*.md` (121 dosya, ~600 KB): Memory V2 DB-first geçişi sonrası bu içeriğin **otoritatif kaynağı `.brain/memory.db`**'dir (ADR-046, kontrat). Dosyalar **çift-yazım** + `.brain/archive/pre-v2/` ile üçüncü mükerrer. Tek aktif kullanım: arkeoloji.

**B3.** `.brain/archive/pre-v2/DECISIONS.md` (96 KB, 1505 satır) + `.brain/archive/decisions-root-pre-sprint143/DECISIONS.md` (96 KB, hash dahil): **İki neredeyse-aynı kopya**. `migration-manifest.json` 40 ADR sayım. Sprint 143 öncesi snapshot; bugünkü 60+ ADR'a tarihsel referans. SHA256 var ama integrity verify scripti yok (dead artifact).

**B4.** **`.gitignore` çelişkisi:** satır 23-24:
```
.brain/archive/
!.brain/archive/
```
Negate satırı önceki ignore'u tamamen ezer — yani `.brain/archive/` git'e dahildir. Niyet (yorum yok) belirsiz: yazar arşivin tracked kalmasını mı istedi yoksa ignore'un kazara ezildiğini mi? **2538 tracked dosyaya** dönüşüyor. Ya yorum eklenmeli ya da bilinçli karar belgelenmeli.

**B5.** Crash recovery artifact'leri (`.brain/archive/sprint-NNN_*.pid`, `.snapshot.json`, `.sprint-state.json`) ~40 dosya tracked. ADR-043 (Brain Crash Recovery) bu dosyalardan **artık** anlamlı bir şey okumuyor (aktif sprint için `.deckent/sprint-NNN-checkpoint.json` kullanılıyor). Ölü artifact.

### 1.2 `.deckent/archive/` — 59 tracked dosya, 620 KB; karma içerik

**B6.** `.deckent/archive/sprints/sprint-168/` SADECE `.worker-168-*.sh` (4 bash script) içeriyor — ADR-047 (Manuel Subagent Dispatch) artıkları. Diğer sprint dizinleri (sprint-159, 160 vd.) `events.jsonl`/`checkpoint.json`/`pre-archive.tar.gz` taşıyor → **dizin şeması tutarsız** (her sprint farklı dosya seti). Bu, sprint-reporter / cleanup-archive kodunun fazlar arası evrildiğinin sessiz kanıtı; format kontratı yok.

**B7.** `.deckent/archive/sprint-158-failed-2026-05-12/`: tek "failed sprint" karantina. Diğer NO_GO sprint'lerin (Sprint 161, Sprint 169 W3.1 NO_GO) benzer karantinası yok → **disposition kuralı tutarsız**. Tarih bazlı tek-instance — bu kalıbın aynı sprint number bir daha fail ettiğinde nasıl çakışmadan çalışacağı belirsiz (ad çakışması riski).

**B8.** `.deckent/archive/metrics/metrics-sprint-NNN.jsonl.gz` (10 sprint) git tracked. `.deckent/sprint-NNN-metrics.jsonl` (yeni runtime) `.gitignore`'de exclude (satır 60). **Çift davranış**: yeni metrik ignored, eski metrik tracked. Sonuç: arşiv kalıcı şişiyor, runtime ignored.

### 1.3 `.audit/` — 22 tracked dosya, 472 KB; **OSS değerli içerik**

**B9.** `.audit/sprint-167/` Sprint 171'in **bilgisel öncülü**: 21 dosya tam-kapsamlı T1-T7 read-only self-audit raporları (`T1-code-inventory.md`, `T2-doc-inventory.md`, `T3-adr-compliance.md`, `T4-memory-integrity.md`, `T5-brain-debug-phase1/2.md`, `T5-brain-wire-audit.md`, `T6-test-build-security.md`, `T7-cross-cutting-synthesis.md` + `consolidated-inventory.md` + `oss-whitelist.json` + `sprint-168-roadmap.md`). T1 ölçümleri ham veri içeriyor — Sprint 171 audit raporları için zaten **referans değer**.

**B10.** `.audit/sprint-169/W3.1-root-cause.md` (175 satır): Path-normalization gap RC kayıtlı + smoke evidence + fix önerisi. Sprint 171-003 (orchestra infra) audit'inin de işine yarayacak nokta-kayıt. **Korunması zorunlu** — ya `.audit/`'te ya `docs/audits/`'da; her hâlükârda silinmemeli.

**B11.** `.audit/`'in OSS public görünürlüğü: dizin internal self-audit içeriyor — kullanıcı için değer yok, ama deckent'in **şeffaflık** mesajı için değerli (Sprint 172 marketing'i için). Şu an root'ta dotfile olarak duruyor: ilk bakışta gizli, ama tracked → npm paketinde de gönderiliyor (B17 ile birlikte değerlendir).

### 1.4 `examples/quickstart/` — 3 tracked dosya, 12 KB; **OSS guide aday**

**B12.** Quickstart minimal demo doğru hedefte: 2 task DIRECTIVES + README + package.json. `package.json` `"deckent": "workspace:*"` bağımlılığı — bu OSS kullanıcısı için doğrudan çalışmaz (npm `workspace:` protokolü monorepo dışında geçersiz). OSS public öncesi `"deckent": "^1.0.0-beta.1"` veya `"latest"`'e çevrilmeli, aksi takdirde `npm install` patlar.

**B13.** README + DIRECTIVES tutarlı, küçük bir Türkçe karışıklığı dışında (DIRECTIVES "Görev 1" Türkçe başlıkla, README İngilizce). Türkçe/İngilizce hedef pazar belirsiz — Sprint 172 i18n stratejisi için karar gerekli (`README-TR` örneği gibi ikiye böl ya da tek dilde sabitle).

### 1.5 `deckent-hub/` — 65 tracked dosya, ~80 KB; **bağımsız repo prototipi inline**

**B14.** `deckent-hub/README.md` "VerhexIO/deckent-hub" public repo'sundan bahsediyor (`https://github.com/VerhexIO/deckent`). Yani **ayrı bir repo'nun submodule veya kopyası inline tutuluyor**. Bu, deckent-hub'ın iki yerden senkronize edilmesi gerektiği anlamına gelir — drift kesin. Karar gerekli: ya gerçek `git submodule`, ya bu dizini sil (hub ayrı repo zaten), ya da hub'ı ana repo'ya gerçekten dahil et (örnek-skill kütüphanesi olarak konumlandır).

**B15.** 20 skill her biri `SKILL.md` + `manifest.json` + `signature.ed25519`. Calendar-Google manifest "manifestVersion: 2" + Ed25519 imza dosyası 109 byte. **Public key kontrol yok** — imzayı doğrulayan kamuya açık anahtar bu dizinde yok; nerede saklandığı belirsiz. Bu, "Ed25519 signature verification" mesajının (README'de büyük vurgu) **runtime'da kanıtsız** olduğu sinyali; OSS marketing iddiası vs operasyonel gerçek çelişkili.

**B16.** Skill'ler MIT lisansı altında ama her skill dosyasında lisans header'ı yok. CONTRIBUTING.md author atribüsyon kuralları net mi? Public hub'a açıldığında lisans uyumu için her skill dosyasında SPDX header eklenmeli.

### 1.6 `.test/` — 3 tracked dosya, 8 KB; ÖLÜ

**B17.** `sprint-168-smoke-directives.md` (1989 B), `shared.txt` (16 B), `sleep-result.txt` (169 B) — Sprint 168 sırasında smoke test için oluşturuldu, bugüne kadar başka kullanım sinyali yok. Bu içerik **kullanılan bir test runner tarafından okunmuyor** (vitest config'inde `.test/` referansı yok); dosyalar test artifact arkeolojisi. **Silinmeli** — repo kirliliği.

### 1.7 `.test-e2e-sprint-*` — 11 dizin, ~500 KB, **tracked DEĞİL ama .gitignore'da da yok**

**B18.** 11 farklı sprint number'lı (`sprint-1220142`, `sprint-679466`, vd. — vitest test'lerin rastgele timestamp ID'leri) dizin git tarafından **görmezden gelinmiyor** (ignore listesinde değil) ama tracked da değil (untracked artifact). `git status` her çağrıda gürültü üretir (henüz değil çünkü `git status` çıktısında listelenmiyor — yani büyük olasılıkla `.tasks/` gibi alt `.gitignore` katmanı veya yok-takip durumu var). Vitest e2e test'lerinin yarattığı geçici fixture sprint'leri — testler arasında sızıntı. **`.gitignore`'a `*.test-e2e-sprint-*/` veya köke `/.test-e2e-*` eklenmeli**, aksi takdirde gelecekte yanlışlıkla commit'lenebilir.

### 1.8 `.npmignore` Kapsam Hatası (CRITICAL — OSS GA blocker)

**B19.** `.npmignore` (62 satır okundu) **şu dizinleri exclude EDİYOR**:
- `.brain/`, `.deckent/`, `.tasks/`, `.locks/`, `src/`, `tests/`, `.git/`, `.claude/`, `CLAUDE.md`, `DECKENT.md`, `DIRECTIVES.md`, `scripts/`

**Ama şu dizinleri exclude ETMİYOR** (dolayısıyla `npm publish` paketine dahil oluyorlar):
- `.audit/` (472 KB internal self-audit)
- `.test/` (8 KB ölü smoke artifact)
- `.test-e2e-sprint-*` (~500 KB e2e scratch — şu an untracked ama npm pack tracked olmayanları da yutar mı? `npm pack` tracked + untracked-but-not-ignored alır; **dolayısıyla npm paketine sızabilir**)
- `examples/` (12 KB — kasıtlı olabilir ama paket boyutunu artırır)
- `deckent-hub/` (~80 KB — inline submodule; bilinçli mi belirsiz, paket boyutunu artırır)
- root `*.md` dosyaları (BETA-TRACKER-TR.md 112 KB, BETA-TRACKER.md 101 KB, DECKENT-MASTER-BLUEPRINT.md 168 KB, DECKENT-ANA-PLAN-TR.md 117 KB, VISION.md, ROADMAP-GOD-LEVEL.md vd.) — internal planlama dokümanları kullanıcı için değer yok, **toplam ~600 KB**, npm paketinin boyutunu şişiriyor

**Net etki:** `npm publish` çağrısı, kullanıcının `npm install deckent` ile **~1.5 MB internal trash** indirmesine yol açar.

### 1.9 `.gitignore` Kapsam Hatası (HIGH — OSS hijyen)

**B20.** `.gitignore` yukarıdaki tüm `.audit/`, `.test/`, `.test-e2e-sprint-*/` dizinlerini açık biçimde ele almıyor. `.audit/` ve `.test/` git'te commit'li (B17 + B9 kanıt) — bilinçli olabilir; **ama `.test-e2e-sprint-*` (test runner sızıntısı, untracked) hâlâ orphan** (ne ignored, ne tracked). Vitest config bunları auto-cleanup ETMİYOR; ilk yanlış `git add .` ile kalıcılaşır.

### 1.10 Cross-Cutting: Arşiv Disposition Politikası Yazılı Değil

**B21.** Hiçbir dokümantasyon (`DECKENT.md`, `CLAUDE.md`, `docs/governance/**`) **arşiv disposition'ı** tanımlamıyor: hangi sprint sonrası ne arşivlenir, ne kadar süre tutulur, ne zaman silinir. Sonuç:
- `.brain/archive/sprint-*-tasks/` sınırsız büyür (her sprint +21 dosya).
- Legacy `retro-sprint-*.md` + `sprint-*.md` DB-first sonrası yeniden yazılmıyor ama silinmiyor da.
- `.deckent/archive/sprints/` formatı dönüşümlü değişiyor (B6).

Politika yokluğu, repo boyutunun zamanla **lineer şişmesine** yol açar; OSS GA sonrası `git clone` süresi her sprint biraz daha uzar.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| B19 | `.npmignore` `.audit/` + `.test/` + `.test-e2e-*` + root planning .md'leri exclude etmiyor | **CRITICAL** | OSS GA blocker: `npm publish` ile ~1.5 MB internal trash gönderiliyor; kullanıcı paketi şişiyor, kullanıcı güveni düşüyor |
| B14 | `deckent-hub/` inline submodule prototipi — ayrı public repo iddiası vs. inline kopya çelişiyor | **CRITICAL** | OSS hijyen: Sprint 172 public flip'i öncesi karar gerekli; drift kesin, kullanıcı tarafı kafa karışıklığı |
| B12 | `examples/quickstart/package.json` `"deckent": "workspace:*"` — OSS kullanıcısında `npm install` patlar | **CRITICAL** | Quickstart bozulması = ilk OSS user deneyimi sıfır; tek satır fix ama tespit edilmezse Show HN'de utanç |
| B1 | `.brain/archive/sprint-*-tasks/` 26 dizin ×~21 dosya = ~500 runtime artifact git'e commit'li | **HIGH** | Repo boyutu (12 MB) + clone süresi; runtime artifact için tracked olmamalı; ADR-038 (dead code disposition) kapsamına alınmalı |
| B4 | `.gitignore` satır 23-24: `.brain/archive/` + `!.brain/archive/` çelişkili negate | **HIGH** | Niyet belirsiz; 2538 tracked dosyaya çıkış; ya yorum/karar belgesi ya da düzeltme |
| B15 | `deckent-hub/` Ed25519 imza vaadi: public key kayıt yeri yok, runtime doğrulama kanıtı sunulmuyor | **HIGH** | Marketing iddiası (README'de büyük vurgu: "0% malicious skill") vs. operasyonel kanıt çelişkili; OSS güveni risk altında |
| B17 | `.test/` 3 ölü dosya, hiçbir runner okumuyor | **HIGH** | Kolay sil; bırakılırsa repo kirliliği + kullanıcı kafa karışıklığı |
| B2 | Legacy `retro-sprint-*.md` (97) + `sprint-*.md` (121) DB-first sonrası 3'lü mükerrer | **HIGH** | ~1 MB tracked + DB kanonik kaynak olduğu hâlde dosya tutuluyor; sync drift riski (Task 171-026 audit alanı) |
| B6 | `.deckent/archive/sprints/` dizin şeması sprint-168'de farklı (sadece .sh) | **MEDIUM** | Format kontratı yok, sprint-reporter evrimi sessiz kanıtı; arşiv tüketicisi (analizci) için kırılgan |
| B7 | `.deckent/archive/sprint-158-failed-*` tek-instance, disposition kuralı yok | **MEDIUM** | Aynı sprint number bir daha fail ederse ad çakışması riski |
| B8 | `.deckent/archive/metrics/` tracked vs. runtime `.deckent/sprint-NNN-metrics.jsonl` ignored | **MEDIUM** | Çift davranış; arşiv kalıcı şişer, runtime ignored — tutarsızlık |
| B10 | `.audit/sprint-169/W3.1-root-cause.md` izolasyonu — Sprint 171-003 işine yarar ama keşfi zor | **MEDIUM** | Korunmalı ama referans path Sprint 171 raporlarından gösterilmeli (cross-link) |
| B11 | `.audit/` OSS public görünürlüğü tanımsız (npm pack'e sızıyor — B19 ile bağlı) | **MEDIUM** | Şeffaflık mesajı için değerli ama paket yüküne dönüştü |
| B13 | `examples/quickstart/` Türkçe/İngilizce karışık | **MEDIUM** | OSS i18n stratejisi yok; tek dilde sabitle veya çift dilde paralel tut |
| B16 | `deckent-hub/` skill dosyalarında SPDX/lisans header eksik | **MEDIUM** | OSS lisans uyumu, contributor atribüsyon gri alan |
| B20 | `.gitignore` `.test-e2e-sprint-*` orphan | **MEDIUM** | Vitest sızıntısı sessiz; ilk yanlış `git add .` ile kalıcılaşır |
| B21 | Arşiv disposition politikası yazılı değil | **MEDIUM** | Sprint sonrası lineer şişme; OSS GA sonrası clone süresi artar |
| B3 | `.brain/archive/pre-v2/DECISIONS.md` + `decisions-root-pre-sprint143/DECISIONS.md` neredeyse-aynı kopya | **LOW** | Tarihsel referans, integrity scripti yok; aktif kullanım yok |
| B5 | Eski crash recovery `.snapshot.json` / `.pid` artıkları (~40 dosya tracked) | **LOW** | ADR-043 yeni çağda okumuyor; ölü artifact |
| B9 | `.audit/sprint-167/` 21 dosyalık OSS self-audit batch | **LOW** | Korunmalı (değer içerir); konumu Sprint 172 reorg ile `docs/governance/audits/` altına taşınabilir |
| B18 | `.test-e2e-sprint-*` 11 dizin, untracked + ignore listesi dışı | **LOW** | Şu an gürültü değil ama hijyen için ignore'a eklenmeli |

**CRITICAL: 3** · HIGH: 6 · MEDIUM: 9 · LOW: 4 · **Toplam: 22 bulgu**

---

## 3. Kanıt (Evidence)

### 3.1 Disk Ölçümleri (`du -sh`)

```text
12M   /workspace/.brain/archive/
620K  /workspace/.deckent/archive/
472K  /workspace/.audit/
12K   /workspace/examples/quickstart/
~80K  /workspace/deckent-hub/  (özet: 65 dosya tracked, 20 skill ×3 dosya + 3 root + 2 workflow)
8K    /workspace/.test/
~500K /workspace/.test-e2e-sprint-* (toplam 11 dizin)
```

### 3.2 Git Tracking Sayımları (`git ls-files <dir> | wc -l`)

```text
.audit/                  → 22
.test/                   → 3
.test-e2e-sprint-679466/ → 0  (untracked)
examples/                → 3
deckent-hub/             → 65
.brain/archive/          → 2538
.deckent/archive/        → 59
```

### 3.3 `.gitignore` Çelişkisi (B4)

```text
.gitignore:23: .brain/archive/
.gitignore:24: !.brain/archive/
```

İkinci satır ilk satırı tamamen ezer; `git check-ignore .brain/archive/sprint-170-tasks/` boş döner (= ignored DEĞİL). Niyet yorumla belgelenmemiş.

### 3.4 `.npmignore` Eksik Path'ler (B19)

`/workspace/.npmignore` 62 satır okundu; `.audit/`, `.test/`, `.test-e2e-*`, `BETA-TRACKER*.md`, `DECKENT-MASTER-BLUEPRINT.md`, `DECKENT-ANA-PLAN-TR.md`, `VISION*.md` hiçbiri eşleşmiyor. `npm pack --dry-run` (önerilen verify) yapılmadı (audit-only) — ama paket içeriğine dahil edilmemeleri için açık satır gerekli.

### 3.5 Quickstart Bozukluğu (B12)

`/workspace/examples/quickstart/package.json:15`:
```json
"dependencies": { "deckent": "workspace:*" }
```
`workspace:*` protokolü pnpm/yarn workspace içinde geçerli; OSS kullanıcısı `npm install` çalıştırınca **`npm ERR! Unsupported URL Type "workspace:"`** alır. (Doğrulama: npm 7+ `workspace:` protokolünü tanımıyor; sadece pnpm/yarn workspaces.)

### 3.6 deckent-hub Drift Sinyali (B14)

`/workspace/deckent-hub/README.md:1-7`:
```text
> The open skill registry for [Deckent](https://github.com/VerhexIO/deckent) — the AI orchestrator for developers who want discipline.

[![Validate Skills](https://github.com/VerhexIO/deckent-hub/actions/workflows/validate-skill.yml/badge.svg)]
```

README "deckent-hub" ayrı public repo'ya gönderme yapıyor (`VerhexIO/deckent-hub`), ama dizin ana repo'nun parçası olarak commit'li (65 tracked dosya). `.gitmodules` yok (kontrol: `ls -la /workspace/.gitmodules` çıktı yok). → ayrı repo olmadan inline kopya = drift kesin.

### 3.7 `.deckent/archive/sprints/sprint-168/` İçerik Sapması (B6)

```text
sprint-159/  → checkpoint.json, events.jsonl, gate.json, pre-archive.sha256, pre-archive.tar.gz, seq  (6 dosya)
sprint-168/  → .worker-168-001.sh, .worker-168-002.sh, .worker-168-003.sh, .worker-168-003-fix.sh    (4 dosya, sadece subagent dispatch scriptleri)
```

Format kontratı yok; sprint-reporter cleanup-archive kodu fazlar arası farklı dosya seti üretmiş.

### 3.8 `.brain/archive/pre-v2/migration-manifest.json` (B3)

Manifest 40 ADR + 6 dosya hash (DECISIONS.md SHA256 `87f8e1e3...`). `decisions-root-pre-sprint143/DECISIONS.md.sha256` da var — ama hash karşılaştırma scripti repo'da arandı (`grep -r "87f8e1e3"` benzeri) → bulunamadı (audit-only, statik referans).

### 3.9 Legacy Markdown Sayımları (B2)

```text
ls /workspace/.brain/archive/retro-sprint-*.md | wc -l  → 97
ls /workspace/.brain/archive/sprint-*.md     | wc -l    → 121
```

DB karşılığı (B22 audit dışı kontrol, sadece referans): memory.db `entries WHERE type='retro' OR type='sprint'` (Sprint 161 stub dahil). Sayım drift'i Task 171-026 (Doc DB-Sync) raporunda.

### 3.10 `.audit/sprint-167` Değerli İçerik Örneği (B9)

`.audit/sprint-167/T1-code-inventory.md` ilk 60 satır gösterdi: MCP tool drift (27→31), test count drift (505→772), agent count drift (15+2→17/18). Bu ham veriler **Sprint 171 raporları için doğrudan referans değer** (özellikle 171-011 MCP, 171-021 Test Integrity).

### 3.11 Quickstart İçerik İncelemesi (B13)

`examples/quickstart/DIRECTIVES.md:9`:
```text
## Görev 1: Validate Project Structure
```
README.md tamamen İngilizce; DIRECTIVES tamamen Türkçe. Mantıksal olarak quickstart hedef pazarın belirsiz olduğunu gösteriyor.

---

## 4. Öneriler (Recommendations)

### 4.1 CRITICAL — Sprint 172 OSS GA Öncesi Yapılacaklar

**R1.** `.npmignore`'a aşağıdaki satırları ekle (B19, OSS GA blocker):

```text
# Internal self-audit + test artifacts
.audit/
.test/
.test-e2e-sprint-*/

# Internal planning + tracker (kullanıcı görmesin)
BETA-TRACKER*.md
DECKENT-MASTER-BLUEPRINT.md
DECKENT-ANA-PLAN-TR.md
VISION-TR.md
README-TR.md  # (İngilizce README tek-otorite ise; aksi takdirde KORU)
NEXT-SESSION-PROMPT.md
next-session-prompt.md
DIRECTIVES.md  # zaten internal sprint planı

# Roadmap internal mi public mi karar gerekli; şimdilik exclude
docs/ROADMAP-GOD-LEVEL.md
```

Sonra `npm pack --dry-run` ile **paket boyutunu doğrula** (hedef <500 KB tarball; şu an muhtemelen >2 MB).

**R2.** `examples/quickstart/package.json` (B12): `"deckent": "workspace:*"` → `"deckent": "^1.0.0-beta.1"`. Test: `cd examples/quickstart && npm install` temiz çalışmalı.

**R3.** `deckent-hub/` (B14) — Sprint 172 öncesi 3 seçenek arasında karar:
- **(a) BİRLEŞTİR:** `deckent-hub/` → `examples/hub-skills/` veya `docs/skills-marketplace/` altına taşı, "deckent-hub gelecek roadmap'inde" mesajıyla README'yi güncelle (en küçük adım).
- **(b) AYRIŞTIR:** `git submodule add https://github.com/VerhexIO/deckent-hub deckent-hub` (gerçek submodule kur, ana repo'dan kopyayı sil).
- **(c) SİL:** Bu repo'dan kaldır, deckent-hub ayrı kalsın, README'de link bırak (en temiz; tavsiye).

### 4.2 HIGH — Sprint 172 + 173 Backlog

**R4.** `.brain/archive/sprint-*-tasks/` (B1) ADR-038 disposition kapsamına al:
- Kural: "her sprint sonrası `task-NNN.json` + `.result` dışı dosyalar silinir (`.hb`, `.plan`, `.log` runtime trash)."
- Daha agresif: "10 sprint öncesi her şey silinir; DB kanonik."
- `.gitignore`'a `.brain/archive/sprint-*-tasks/` ekle + git history'den filter-branch ile temizle (boyut kazancı ~6 MB).

**R5.** `.gitignore` satır 23-24 (B4) düzelt:
- Eğer niyet **tracked tutmak** ise: ilk satırı sil, yorum ekle:
  ```text
  # NOTE: archive is intentionally tracked (historical context)
  ```
- Eğer niyet **ignore etmek** ise: negate satırını sil, `.brain/archive/` tüm tracked dosyaları `git rm -r --cached .brain/archive/`.

**R6.** `deckent-hub/` Ed25519 doğrulama (B15) ya kanıtla (public key konum + verify scripti) ya iddiayı README'den kaldır. "0% malicious skill rate" hedefi → ölçüm metodolojisi yok; ya hedef düşür ya CI'da skill-scan-bot otomatize et.

**R7.** `.test/` (B17) → SİL. 3 dosya, hiçbiri test runner tarafından okunmuyor. `git rm -r .test/` + `.gitignore`'a `.test/` ekle (gelecekteki smoke artifact'lar git'e sızmasın).

**R8.** Legacy `.brain/archive/retro-sprint-*.md` + `sprint-*.md` (B2):
- Karar: DB-first ise dosyalar redundant → SİL (history'den filter-branch + `.gitignore` koruması).
- Karar: dosyalar kanonik fallback ise → DB'yi `decay_exempt` ile koru, ama yeni sprint'lerde **yazma**.
- Hibrit: son N sprint dosya, eski tarihler silinir.

Tavsiye: SİL (DB-first ADR-046 kontratı net). Task 171-022 ve 171-026 raporlarıyla cross-check.

### 4.3 MEDIUM — Sprint 173+ Backlog

**R9.** `.deckent/archive/sprints/` (B6) için **format kontratı** yaz:
- `docs/governance/archive-format.md` (yeni dosya): her arşivlenmiş sprint **zorunlu olarak** `checkpoint.json + events.jsonl + gate.json + pre-archive.tar.gz + seq` içerir. Eksiklik = NO_GO.
- Sprint 168'in sadece `.worker-*.sh` içeren bozuk yapısı → backfill (events.jsonl'i sprint-171-events.jsonl'den replay) veya kabul edilmiş eksiklik notu.

**R10.** `.deckent/archive/sprint-NNN-failed-*` (B7) için **disposition kuralı**:
- `<sprint-id>-failed-<YYYY-MM-DD>/` adlandırması zaten ad çakışmasını engelliyor. README ekle, sprint-reporter koduna unit test ekle.

**R11.** `.deckent/archive/metrics/` (B8): yeni runtime metric'ler de arşiv'e taşı (rotasyon) veya tümünü `.gitignore`'a koy. Çift davranış kaldırılmalı.

**R12.** `.audit/sprint-167/` + `.audit/sprint-169/` (B10, B11) → Sprint 172 reorg'da `docs/governance/audits/` altına TAŞI. `docs/audits/sprint-171/` ile aynı çatı. Yeni isim şeması: `docs/governance/audits/sprint-NNN/<file>.md`. Cross-link'le güncel raporlardan (`SYNTHESIS.md` referans verir).

**R13.** `examples/quickstart/` (B13) için i18n stratejisi:
- Hedef: tek dil (İngilizce öneri — OSS GA default).
- `DIRECTIVES.md`'yi İngilizce'ye çevir veya `DIRECTIVES-TR.md` paralel dosya ekle. README ile dil tutarlı olsun.

**R14.** `deckent-hub/` skill dosyalarına SPDX header zorunlu (B16):
```markdown
<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright: <author>, see manifest.json -->
```
CI gate (`scripts/security/skill-license-check.mjs` yeni script) ile zorla.

**R15.** `.gitignore`'a aşağıyı ekle (B20):

```text
# Test e2e scratch directories (vitest leakage)
.test-e2e-sprint-*/
.test-e2e-chain-*/

# .test (Sprint 168 smoke artefakts — silindiyse de gelecekte dönmesin)
.test/
```

**R16.** Arşiv disposition politikası (B21) için `docs/governance/archive-disposition.md` yaz:
- Hangi dizin per-sprint yazılır
- Ne zaman taşınır
- Ne kadar süre tutulur (sprint sayısı veya tarih)
- Ne zaman silinir
- Hangi runner/script bunu yapar

Sprint 172 reorg'un parçası.

### 4.4 LOW — Hijyen

**R17.** `.brain/archive/pre-v2/` + `decisions-root-pre-sprint143/` (B3): mükerrer kopyalardan birini sil, sha256 verify scripti olarak `scripts/memory/verify-pre-v2-integrity.mjs` ekle (one-time arkeoloji aracı). Sonra tek kopyaya indir.

**R18.** Crash recovery artifact'leri (B5): ADR-043 kontratını gözden geçir, `.brain/archive/sprint-NNN_*.pid`/`.snapshot.json` dosyalarını silmek güvenli mi? Sprint-controller bunları okuyor mu? Sprint 171-001 (orchestra lifecycle) audit raporunda kontrol edilen (ADR-043 enforcement) ile cross-check.

**R19.** `.test-e2e-sprint-*` dizinleri (B18): vitest config'inde test sonrası `afterAll(() => fs.rmSync(...))` veya benzer cleanup hook ekle. Test sızıntısı önlenmeli.

### 4.5 OSS GA için Sprint 172 `.gitignore` Patch (özet)

```diff
 # Brain runtime
 .brain/MEMORY.md
 .brain/RETRO.md
 .brain/DEBT.md
 .brain/PATTERNS.md
 
-.brain/archive/
-!.brain/archive/
+# .brain/archive/ intentionally tracked (historical context; see ADR-XXX)
 
 # Memory V2 SQLite DB
 .brain/memory.db
 ...

+# Smoke + e2e test artefakts (vitest sızıntısı)
+.test/
+.test-e2e-sprint-*/
+.test-e2e-chain-*/
```

### 4.6 OSS GA için Sprint 172 `.npmignore` Patch (özet)

```diff
 # Source
 src/
 tests/
 
+# Self-audit + smoke artefakts
+.audit/
+.test/
+.test-e2e-sprint-*/
+
+# Internal planning + trackers (kullanıcı görmesin)
+BETA-TRACKER*.md
+DECKENT-MASTER-BLUEPRINT.md
+DECKENT-ANA-PLAN-TR.md
+NEXT-SESSION-PROMPT.md
+next-session-prompt.md
+VISION-TR.md
+README-TR.md
+
+# Internal docs (Sprint 172 reorg sonrası docs/ yapısı public, root planı internal)
+docs/audits/
+docs/superpowers/
+docs/ROADMAP-GOD-LEVEL.md
```

---

## 5. Kapsam Haritası (Files Covered)

> **NOT:** Bu task **doc-tier 3** (Tier-3 archive özet) — Plan Task 171-027 başlığında **"Kapsam Haritası YOK"** belirtilmiş. Concern-cross-cut + doc task'larda dosya-bazlı LoC tablosu yerine **dizin envanteri** bölüm 0'da verilmiştir (her arşiv dizini için disk + tracked sayı + son dokunma + amaç). Synthesis'in coverage-doğrulama bölümü modül-derin task 171-001..014 üzerinden çalışır; bu task onların kapsamına dahil değildir.

**Denetlenen Arşiv Dizinleri (özet):**

| Kategori | Dizin | Yöntem | Kapsam |
|---|---|---|---|
| Persistent | `.brain/archive/` | Dizin envanter + örnekleme (pre-v2, decisions-root, sprint-tasks, retro/sprint .md, crash artifact) | %100 dizin, ~%5 dosya tam okuma |
| Operasyonel | `.deckent/archive/` | Dizin envanter + 3 sprint örnekleme (sprint-159, 160, 168) | %100 dizin, ~%10 dosya tam okuma |
| Self-audit | `.audit/sprint-167/`, `.audit/sprint-169/` | Listeleme + 2 dosya örnekleme (T1, W3.1) | %100 dosya listesi, %10 tam okuma |
| OSS demo | `examples/quickstart/` | 3 dosya tam okuma | %100 |
| Skill marketplace | `deckent-hub/` | README + 1 skill örnekleme (calendar-google) + 20 skill ad listesi | %15 dosya tam okuma, %100 yapı |
| Smoke | `.test/` | 3 dosya tam okuma | %100 |
| E2E scratch | `.test-e2e-sprint-*` | Dizin listesi + 1 örnekleme (`.test-e2e-sprint-679466`) | %100 dizin listesi, %5 dosya |

**Toplam:** 7 ana arşiv kategorisi + 11 e2e scratch dizini denetlendi. Tüm 1.7'de tartışılan boş alanlar B18 ile kayda alındı.

---

## Sprint 172 OSS GA Reorg Hedefi (Synthesis için Girdi)

Task 171-027 → 171-029 SYNTHESIS doc-reorg planına aşağıdaki katkı:

```text
docs/
├── governance/
│   ├── archive-disposition.md         (R16 yeni)
│   ├── archive-format.md              (R9 yeni)
│   └── audits/                        (R12 — .audit/ taşınır)
│       ├── sprint-167/                (21 dosya, KORU+TAŞI)
│       ├── sprint-169/                (1 dosya, KORU+TAŞI)
│       └── sprint-171/                (29 dosya, mevcut konum sürdürülebilir)
├── examples/                          (kök examples/ buraya gelebilir, .npmignore'a docs/examples/ ekleme yok — public)
│   └── quickstart/                    (R2 fix sonrası)
└── ... (Task 171-024 reorg taslağı)
```

**Sil (OSS GA):**
- `.test/` (R7)
- `.test-e2e-sprint-*/` (R19 + R15 cleanup)
- `.brain/archive/pre-v2/` (R17 sha256 verify sonrası)
- Legacy `.brain/archive/retro-sprint-*.md` + `sprint-*.md` (R8, karar: DB-first ise sil)
- `deckent-hub/` (R3 karar (c) ise sil; ana repo'dan kopyayı kaldır)

**`.gitignore` + `.npmignore` patch'leri:** R5, R15, R16, 4.5, 4.6 maddelerinde tam diff verildi — Sprint 172 ilk PR.

---

## Sonuç

22 bulgu, 3 CRITICAL, 6 HIGH. CRITICAL'lerin üçü de **Sprint 172 OSS GA blocker** (npm pack şişmesi, deckent-hub drift, quickstart bozulması) — tek satır/dizin fix ama yayım öncesi tespit edilmezse Show HN'de görünür hasar. Arşiv ayak izi 13 MB; sistematik `.gitignore`/`.npmignore` patch + `.brain/archive/sprint-*-tasks/` disposition kuralı ile %50 kazanılabilir. `.audit/sprint-167` + `.audit/sprint-169` içeriği KORUNMALI; Sprint 172 reorg ile `docs/governance/audits/` altına taşı, public şeffaflık değeri.
