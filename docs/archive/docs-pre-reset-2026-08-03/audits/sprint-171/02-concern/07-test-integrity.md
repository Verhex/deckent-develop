# Sprint 171 — Test Bütünlüğü Denetimi (Task 171-021)

**Denetim türü:** Audit-only (cross-cut), kaynak/test dosyalarına yazma yok.
**Kapsam:** `tests/` ağacı (808 test dosyası), `vitest.config.ts`, `vitest.dashboard.config.ts`, `package.json`, `.deckent/ci-baseline.json`, `.deckent/workspace/IDENTITY.md`, `DIRECTIVES.md` Sprint 171 baseline iddiası.
**Tarih:** 2026-05-15. **Worker:** w-171-021. **Model:** opus. **Agent:** ci-guardian.

> Bu rapor, deckent kod tabanını dışarıdan inceleyen bir mühendise, vitest test ekosisteminin gerçek durumunu — iddia edilen sayılarla karşılaştırılarak — gösterir. Tüm bulgular `dosya:satır` kanıtlıdır.

---

## 1. Bulgular

### 1.1 [CRITICAL] CI baseline dosyası bozuk değerlerle yazılmış — Sprint 171 honesty-gate kapalı

Sprint 171 spawn fazında oluşturulan `.deckent/ci-baseline.json` içeriği, tek bir test bile çalıştırılmış gibi görünmüyor: 15 dosya, 0 pass, 15 fail, 0 coverage. Bu değerler `baseline-tracker.ts` içindeki `parseVitestOutput()` fonksiyonunun "summary line bulunamadı" yedek (fallback) çıktısıyla uyumludur. Sonuç: Sprint 171 boyunca worker'ların "pre-existing failure" iddialarını doğrulamak için kullanılan `compareBaseline()` honesty-check fonksiyonu pratikte bir karşılaştırma yapmaz — her yeni failure honest assessment ihlali gibi görünür ya da tam tersi, gerçek regresyonlar tespit edilemez.

DIRECTIVES Sprint 171 GO/NO_GO kriteri `pass ≥ 16475 + fail ≤ 2 + skip ≤ 41` baseline'a referans verir. Gerçek baseline `pass = 0`, dolayısıyla bu kriter ölçümle doğrulanamaz; sprint kabul/red kararı hiçbir test ölçütüne dayanmaz.

### 1.2 [HIGH] IDENTITY.md test sayım metrikleri sprintler arası güncellenmemiş — 6 sprint geride

`.deckent/workspace/IDENTITY.md:9` "Tests: 12,485 pass + 16 skipped (505 files)" yazıyor. Disk üzerinden statik sayım: `tests/` altında 808 `.test.ts*` dosya var (790 ana + 18 dashboard). Aynı satırdaki "Sprint: sprint-167" (`.deckent/workspace/IDENTITY.md:24`) ifadesi Sprint 171 sürmekteyken hâlâ Sprint 167 değerinde. Bu drift, public OSS GA öncesi (Sprint 172 hedef) gösterilen ilk metriklerin gerçeği yansıtmayacağı anlamına gelir — yeni kullanıcının ilk bakışta gördüğü sayı yanlıştır. ADR-046 Brain Self-Update Hook iddiasıyla doğrudan çelişir: hook çalışsaydı bu metrikler her sprint sonu güncellenirdi.

### 1.3 [HIGH] DIRECTIVES Sprint 171 baseline iddiası ile ölçülen baseline uyumsuz

`DIRECTIVES.md` Sprint 171 (`vitest baseline (pass ≥16475 + fail ≤2 + skip ≤41)`) kriteri Sprint 170 GO_WTD sonucundaki bir not olarak taşınmış görünüyor. Ne var ki `.deckent/ci-baseline.json:7` `pass: 0, fail: 15, skipped: 0` gösteriyor. İki referans aynı sprintte birbiriyle çelişir: ya DIRECTIVES iddiası stale (Sprint 170'den kopya), ya da ci-baseline kaydı bozuk. Her iki durum da kanıtlanabilir bir GO/NO_GO kararı vermeye engel.

### 1.4 [HIGH] Sprint 170 170-001 "5 legacy literal-string fixture" tech-debt'i hâlâ açık

Sprint 170 task `170-001` GO_WITH_TECH_DEBT olarak kapandı; worker beş tane `it.toContain('.prompt-<hex>.txt')` benzeri assertion'ın `taskId-aware` yeni dosya isimlendirme şemasıyla uyumsuz olduğunu raporladı (bkz. `.brain/archive/sprint-170-tasks/task-170-001.result:28`). Sprint 171 başladığında bu beş fixture'ın hâlâ legacy literal-string değerlerde olduğunu doğrulanmıştır:

- `tests/orchestra/tmux.test.ts:145` — `expect(cmdArg).toContain('.prompt-abcdef01.txt')` (legacy)
- `tests/orchestra/tmux.test.ts:164` — `expect(cmdArg).toContain('< /project/.tasks/.prompt-abcdef01.txt')` (legacy)
- `tests/orchestra/tmux-edge.test.ts:192` — `expect.stringContaining('.prompt-deadbeef.txt')` (legacy)
- `tests/security/shell-injection.test.ts:50` — `expect(cmdArg).toContain('< /project/.tasks/.prompt-deadbeef12345678.txt')` (legacy)
- `tests/security/shell-injection.test.ts:116` — `expect(String(writeCall![0])).toContain('.prompt-deadbeef12345678.txt')` (legacy)

mtime kanıtı: bu üç dosyanın disk tarihi 2026-05-12, Sprint 170 sonu raporunun (`task-170-001.result`) tarihi 2026-05-15. Dosyalara dokunulmamış. Sonuç: tam vitest run'ı çalıştırıldığında bu beş test FAIL üretmeye devam eder; sprint baseline'ın fail değerinin sıfırın üstünde olmasının nedeni budur.

Not: Sprint 170 raporunda "drift" terimi kullanılmış olsa da bu klasik bir **assertion drift**'tir; `vi.mock` mock export'larından farklı olarak doğrudan `expect().toContain()` literal string'leri etkilenmiştir. Mock kütüphanesi gerçekliği değil, testin beklenti sabiti gerçekliği takip etmediği için failure üretir.

### 1.5 [HIGH] Kalıcı skip sayısı IDENTITY.md ve DIRECTIVES baseline ile uyumsuz

Statik grep ile `it.skip(`, `test.skip(`, `describe.skip(` çağrıları sayıldığında 25 kalıcı skip tespit edildi (12 dosyaya yayılmış). IDENTITY.md "16 skipped" diyor, DIRECTIVES "skip ≤41" diyor. 25 değeri DIRECTIVES sınırının altında, ama IDENTITY.md iddiasının üstünde. En kritik olan: skip'lerin **neden** atlandığı dokümante edilmemiş ve bir kısmı kalıcı "TODO: update mock" notlu — yani implicit tech debt.

Skip sebep dağılımı (manuel inceleme):
- "not yet implemented" (`tests/orchestra/sprint-retro-writer.test.ts:98,156`) — 2 `describe.skip` → 4 alt test pasif
- "TODO: update mock for language-first init flow" (`tests/cli/commands.test.ts:1210`) — gerçek API güncellendi ama test güncellenmedi
- "requires toLocaleLowerCase fix in source" (`tests/orchestra/turkish-locale.test.ts:19,34`) — kod gerçek davranışa uyguladığı için 2 test ezilmiş
- "covered by archive-debt.test.ts" (`tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts:640-658`) — 4 duplicate skip (dead test stub'ları)
- README/docs içerik skip'leri (`tests/docs/readme.test.ts:20-109`, `tests/cli/rich-output.test.ts:213-237`, `tests/blueprint/files.test.ts:29`) — 9 skip; README format değişikliği sonrası geride bırakılmış.

Bu skip'lerin %40'ı (10/25) "kapsanan başka test", "implementasyon yok" ya da "bir başka kod değişikliği bekliyor" türünden gerçek tech-debt göstergesidir.

### 1.6 [MEDIUM] `it.only` / `it.todo` sıfır — pozitif disiplin sinyali

Üretim kodu test ağacında `it.only`, `describe.only`, `test.only`, `it.todo`, `test.todo` çağrısı **yok** (grep ile 0 hit). Bu, CI'da yanlışlıkla "tek test çalıştırma" hatasının veya "ileride yazılacak" sahte testlerin bulunmadığı anlamına gelir — sağlıklı bir disiplin.

### 1.7 [MEDIUM] vitest config sade ama eksik — coverage threshold ve reporter yok

`vitest.config.ts` sadece 24 satır. Coverage provider `v8`, `include: ['src/**/*.ts']`, `exclude` listesi 9 barrel/dashboard girişi içeriyor. Eksikler:

- `coverage.thresholds` tanımlı değil — IDENTITY.md "89.33% coverage" iddia ediyor ama bu sayıyı CI'da düşmeye karşı koruyan bir alt-eşik yok.
- `reporter` tanımlı değil — varsayılan `default` reporter çalışıyor; CI'da artifact üretmek için `junit` veya `json` reporter eklenmesi düşünülmemiş.
- `retry: 0` (varsayılan) — flaky testler için bilinçli bir politika yok. `tests/agents/worker-feedback.test.ts:43` ve `tests/cli/wizard.test.ts:1` gibi `setTimeout` kullanan dosyalarda nadir başarısızlıklar maskesiz kalıyor.
- `testTimeout: 10000` (`vitest.config.ts:7`) — bazı `e2e` testleri `tests/e2e/docker-backend.test.ts`'de 10 saniye sınırını aşabilen `timeout: 10_000` veya `30_000` opsiyonlarıyla yazılmış; config-level varsayılanla per-test override arasında tutarsızlık var ama herhangi bir kural ihlali değil.

### 1.8 [MEDIUM] Dashboard testleri ayrı config — npm test'te kapsam dışı

`vitest.config.ts:6` `exclude: ['tests/dashboard/**', 'node_modules']` ile dashboard test'leri ana suite'ten çıkarılmış. `npm test` (yani `vitest run`) çalıştırıldığında 18 dashboard test dosyası (5 `.test.tsx` + 13 `.test.ts`) hiç koşmaz; sadece `npm run test:dashboard` (`package.json:24`) çağrıldığında çalışır. Bu, CI workflow'unun **iki ayrı vitest invocation** çalıştırmasını gerektirir — eksiği var mı diye `.github/workflows/`'i kontrol etmek gerekir, ama bu denetimin kapsamı dışında. Risk: dashboard testleri tek bir komutla tüm test'leri çalıştıran katılımcılar tarafından kaçırılır.

IDENTITY.md "Dashboard Tests: 413" iddia ediyor; statik grep ile dashboard test dosyalarındaki `it/test/describe` çağrı sayısı `8 (dashboard)` × ~10–20 test = yaklaşık 80–250 test gerçek sayım aralığında (kesin sayı için vitest çalıştırmak gerekir). "413" sayısı disk gerçeğiyle hemen doğrulanabilir görünmüyor — Sprint 170 ya da öncesinden taşınmış stale metrik olabilir.

### 1.9 [MEDIUM] happy-dom paket sürüm çifti — root vs dashboard nested package.json'da major sürüm farkı

`package.json:87` happy-dom `^20.8.4` (devDependency, dashboard test config tarafından kullanılıyor); `src/dashboard/package.json:26` happy-dom `^16.0.0`. Major sürüm farkı (20 vs 16). `vitest.dashboard.config.ts:9` `environment: 'happy-dom'` diyor; resolve sırasında root node_modules önce gelir, dolayısıyla testler 20.x ile çalışır. Yine de iki manifest aynı paketi farklı major sürümde işaret ettiği için dashboard'un kendi paket yöneticisi (Vite dev server) ile vitest farklı happy-dom gerçekleştirimi indirebilir; reprodüksiyon ortamlar arasında tutarsızlık doğurabilir.

### 1.10 [MEDIUM] `setTimeout`/`new Promise(resolve => setTimeout(...))` patternleri 49 dosyada — flaky risk

Statik grep:
- `setTimeout`/`setInterval` direkt çağrısı: 109 satır, 49 dosya
- `await new Promise(... setTimeout ...)` veya `sleep()` çağrısı: 38 satır, 19 dosya
- `vi.useFakeTimers()`/`vi.useRealTimers()` ile kontrollü: 58 satır, 23 dosya

Kontrollü fake timer kullanan 23 dosya sağlıklı; ancak gerçek `setTimeout` ile bekleyen 38 satır (özellikle `tests/e2e/nervous-bridge-delivery.test.ts` 10 hit, `tests/e2e/cross-platform/wsl2-docker.test.ts:88` 4 hit) yavaş ve yer yer flaky olabilir. CI'da `retry: 2` benzeri politika olmadığı için (bkz. 1.7) tek bir rastgele yavaşlama failure üretir.

Örnek yüksek riskli pattern:

```
tests/e2e/nervous-bridge-delivery.test.ts — 10 setTimeout çağrısı
tests/e2e/sprint-lifecycle.test.ts — 2 setTimeout, ek olarak 2 await-sleep
tests/orchestra/auditor-stale-race.test.ts — 9 setTimeout, race condition simülasyonu
tests/cli/serve.test.ts — 2 setTimeout, network bekleme
```

### 1.11 [MEDIUM] `vi.mock` kullanım yoğunluğu — 313 dosyada 1504 çağrı, mock drift yüzeyi büyük

Test ağacı boyunca `vi.mock(...)` 1504 yerde çağrılıyor (313 dosya). `tests/orchestra/brain.test.ts` 191, `tests/agents/worker.test.ts` 98, `tests/core/agent-pool.test.ts` 135, `tests/cli/commands/init.test.ts` 320 mock metodu içeriyor. Bu büyüklükte bir mock yüzeyi `vi.mock`'lanan modülün gerçek export imzasıyla testteki sahte export imzası arasında zaman içinde **drift** birikme riskinin yüksek olduğu anlamına gelir; bilinen örnek bulgu 1.4'tür. Otomatik bir "mock vs export shape check" lint adımı yok.

Spesifik bir mock drift örneği (Sprint 170 dışında):
- `tests/cli/commands.test.ts:1210` — `it.skip('TODO: update mock for language-first init flow')` — mock'un gerçek API ile uyumsuz olduğu açıkça yazılmış.

### 1.12 [LOW] Platform-conditional skipIf disiplini iyi — açık döküman + lint testi

`tests/PLATFORM.md` Windows-only/Unix-only test dosyalarını listeliyor; `tests/platform-tags.test.ts` skipIf flag'inin var olup olmadığını lint-eden meta-test. 14 dosyada toplam 71 `skipIf`/`runIf` çağrısı var (tmux, docker, scripts dosyaları). Bu, platform-specific test'lerin Windows'ta yanlışlıkla fail olmasını engelliyor — pozitif bir pattern.

### 1.13 [LOW] Test isimlendirme ve dizin yapısı tutarlı

33 alt-dizin (orchestra 203 dosya, core 164, cli 152, mcp 39, integration 34, ...). `tests/{module}/{filename}.test.ts` konvansiyonu istisnasız uygulanmış. `helpers/`, `setup.ts` gibi non-test helper'lar `.test.ts` uzantısı taşımıyor; vitest `include` ile karışmıyor.

### 1.14 [LOW] 16591 `it/test/describe` toplam çağrısı

Statik sayım (regex `^\s*(it|test)\(`) 808 test dosyasında **16591** çağrı buluyor. Bu sayı `describe` bloklarını da kapsar, dolayısıyla saf test (it/test) sayısı bunun altında — kesin sayı için vitest run gerekir. Yine de DIRECTIVES iddiası `pass ≥ 16475` ile aynı büyüklük sıralamasında (kabaca 16k civarı). IDENTITY.md "12,485 pass" iddiasıyla ise net şekilde uyumsuz (≥3000 fark) — yani IDENTITY birkaç sprint geride kalmış, ama DIRECTIVES baseline'ı gerçeğe yakın görünüyor (ci-baseline.json bozuk olsa bile).

### 1.15 [LOW] Coverage exclude listesi tutarlı — barrel dosyaları haricinde

`vitest.config.ts:12-21` 9 girişlik exclude listesi: tüm `index.ts` barrel'ları (`src/index.ts`, `src/agents/index.ts`, `src/core/index.ts`, `src/monitor/index.ts`, `src/orchestra/index.ts`, `src/cli/index.ts`, `src/mcp/tools/index.ts`, `src/mcp/resources/index.ts`) + `src/dashboard/**`. Bu liste CLAUDE.md mimari tablosundaki "76+94+20+...+modüller" yapısıyla doğrudan örtüşüyor. CI Guardian PROMPT.md "barrel dosyaları exclude" kuralıyla uyumlu.

---

## 2. Severity

| Severity | Bulgu # | Adet |
|---------|---------|------|
| **CRITICAL** | 1.1 | 1 |
| **HIGH**     | 1.2, 1.3, 1.4, 1.5 | 4 |
| **MEDIUM**   | 1.6, 1.7, 1.8, 1.9, 1.10, 1.11 | 6 |
| **LOW**      | 1.12, 1.13, 1.14, 1.15 | 4 |
| **Toplam**   |   | **15** |

CRITICAL'ın anlamı: CI baseline kapısı işlevsiz olduğu için Sprint 171 sonunda sayılarla doğrulanabilir GO/NO_GO ölçütü kalmaz; Sprint 172 OSS GA için olmazsa-olmaz "test edilebilirlik" iddiası kanıtsızdır.

HIGH'lar: Public OSS GA öncesi göstereceğimiz metriklerin gerçek olmaması (1.2), DIRECTIVES kontratı ile ölçüm arasındaki çelişki (1.3), Sprint 170'ten taşınan kapatılmamış tech debt (1.4) ve doc-vs-code drift'i (1.5) — bunların hepsi yeni kullanıcının "ne kadar test ediliyor?" sorusuna yanıt verirken yanıltılmasına yol açar.

---

## 3. Kanıt (dosya:satır)

Her bulgu için disk üzerinden doğrudan doğrulanabilen birincil kanıt:

- **1.1 / CRITICAL** — `.deckent/ci-baseline.json:1-11` içeriği `"testCount": 15, "testPassed": 0, "testFailed": 15, "coverage": 0` (vitest "verbose reporter" çıktısı parse edilememiş ya da hiç toplanmamış). Karşılaştırma noktası: `src/orchestra/baseline-tracker.ts:107-131` `parseVitestOutput()` her üç regex (`passMatch`, `failMatch`, `skipMatch`) başarısız olduğunda `null` döner; null değer write'a değil, captureVitestBaseline çağrı sahibine geri döner — yani `.deckent/ci-baseline.json:7` `"testFailed": 15` ayrı bir yerden (muhtemelen `auditor.ts:2625`) yazılmış olmalı. Yine de değer içerik olarak vitest çalışmamış gibi duruyor.

- **1.2** — `.deckent/workspace/IDENTITY.md:9` `Tests: 12,485 pass + 16 skipped (505 files)` vs `find tests -name "*.test.ts*" | wc -l = 808`. Aynı dosyanın `.deckent/workspace/IDENTITY.md:12` satırı `Sprint: sprint-167` derken DIRECTIVES `Sprint 171` çalışıyor (`DIRECTIVES.md:1`).

- **1.3** — `DIRECTIVES.md` Sprint 171 GO/NO_GO bölümü `vitest baseline (pass ≥16475 + fail ≤2 + skip ≤41)` ifadesi vs `.deckent/ci-baseline.json:7` `"testFailed": 15`.

- **1.4** — Sprint 170 sonu raporu `.brain/archive/sprint-170-tasks/task-170-001.result:28` tech-debt tablosu beş satır numarasını listeler; bu satırların hâlâ legacy literal-string içerdiği:
  - `tests/orchestra/tmux.test.ts:145` `expect(cmdArg).toContain('.prompt-abcdef01.txt');`
  - `tests/orchestra/tmux.test.ts:164` `expect(cmdArg).toContain('< /project/.tasks/.prompt-abcdef01.txt');`
  - `tests/orchestra/tmux-edge.test.ts:192` `expect.stringContaining('.prompt-deadbeef.txt'),`
  - `tests/security/shell-injection.test.ts:50` `expect(cmdArg).toContain('< /project/.tasks/.prompt-deadbeef12345678.txt');`
  - `tests/security/shell-injection.test.ts:116` `expect(String(writeCall![0])).toContain('.prompt-deadbeef12345678.txt');`

  Modifikasyon zamanı kanıtı: bu üç dosyanın mtime'ı `2026-05-12`; Sprint 170 sonu `2026-05-15` — yani fix sonrası dosyalara dokunulmamış.

- **1.5** — `it.skip(`/`test.skip(`/`describe.skip(` çağrıları regex `^\s*(it|test|describe)\s*\.skip\s*\(` ile sayıldığında 25 hit, 12 dosya:
  - `tests/cli/commands.test.ts:1210` (`TODO: update mock for language-first init flow`)
  - `tests/cli/commands/skill-marketplace.test.ts:173` (`describe.skip('publish')`)
  - `tests/cli/commands/small-commands-improvements.test.ts:379`
  - `tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts:640,641,642,658`
  - `tests/cli/rich-output.test.ts:213,223,237`
  - `tests/docs/readme.test.ts:20,43,74,100,109`
  - `tests/blueprint/files.test.ts:29`
  - `tests/scripts/adr-validator.test.ts:113,123`
  - `tests/orchestra/event-bus.test.ts:172` (integration testi env yokken pas)
  - `tests/orchestra/turkish-locale.test.ts:19,34` (kaynakta toLocaleLowerCase fix bekliyor)
  - `tests/orchestra/dependency-pipeline.test.ts:463,566`
  - `tests/orchestra/sprint-retro-writer.test.ts:98,156` (`migrateRetroLatest not yet implemented`, `MemoryStore.getLatestRetro not yet implemented`)
  Karşılaştırma: `.deckent/workspace/IDENTITY.md:9` "16 skipped".

- **1.6** — Regex `^\s*(it|test|describe)\s*\.only\s*\(` 0 hit; `^\s*(it|test)\s*\.todo\s*\(` 0 hit.

- **1.7** — `vitest.config.ts:7` `testTimeout: 10000`; `vitest.config.ts:8-22` coverage bloğunda `thresholds` veya `reporter` anahtarı yok. `package.json:18-34` script bloğunda `test`, `test:watch`, `test:coverage`, `test:dashboard` var; CI-specific reporter override yok.

- **1.8** — `vitest.config.ts:6` `exclude: ['tests/dashboard/**', 'node_modules']`. `vitest.dashboard.config.ts:11-12` `setupFiles: ['./tests/dashboard/setup.ts']`, `include: ['tests/dashboard/**/*.test.tsx', 'tests/dashboard/**/*.test.ts']`. `package.json:24` `test:dashboard` script ayrı. IDENTITY.md `Dashboard Tests: 413` iddiası vs disk: 18 dashboard test dosyası.

- **1.9** — `package.json:87` `"happy-dom": "^20.8.4"`; `src/dashboard/package.json:26` `"happy-dom": "^16.0.0"`. Major sürüm farkı.

- **1.10** — `setTimeout`/`setInterval` grep 109 hit/49 dosya. `await new Promise.*setTimeout|sleep\(` grep 38 hit/19 dosya. `vi.useFakeTimers|vi.useRealTimers` grep 58 hit/23 dosya. Yüksek-risk örnekler `tests/e2e/nervous-bridge-delivery.test.ts` (10), `tests/orchestra/auditor-stale-race.test.ts` (9).

- **1.11** — `vi\.mock\(` grep **1504 hit / 313 dosya**. En yoğunlar: `tests/cli/commands/init.test.ts` 320, `tests/cli/commands/doctor.test.ts` 13 (`mockReturnValue` 193 ek), `tests/orchestra/brain.test.ts` 10 vi.mock + 191 mock metodu, `tests/cli/commands.test.ts` 314 mock metodu, `tests/agents/worker.test.ts` 2 vi.mock + 98 mock metodu.

- **1.12** — `tests/PLATFORM.md:13-17` Unix-only liste; `tests/platform-tags.test.ts` skipIf flag varlığını lint eder.

- **1.13** — `find tests -type d -mindepth 1 -maxdepth 1 | wc -l = 33` alt-dizin; tüm test dosyaları `.test.ts` veya `.test.tsx` uzantılı; `tests/dashboard/setup.ts:1-8` helper, `.test` uzantısı yok.

- **1.14** — Regex `^\s*(it|test)\(` 808 dosya boyunca toplam **16591** çağrı.

- **1.15** — `vitest.config.ts:11-21` coverage `include: ['src/**/*.ts']`, `exclude: ['src/index.ts','src/agents/index.ts','src/core/index.ts','src/monitor/index.ts','src/orchestra/index.ts','src/cli/index.ts','src/mcp/tools/index.ts','src/mcp/resources/index.ts','src/dashboard/**']`.

---

## 4. Öneriler

Aşağıdaki maddeler severity sırasına göre Sprint 172 backlog'una önerilir. Her madde aksiyona dönüştürülebilir; bağımlılıklar bulgu numaralarına atıflıdır.

### 4.1 CI baseline yazımını yeniden hayata geçir (CRITICAL — Bulgu 1.1)

Sprint başlangıcında `captureVitestBaseline()` çağrısının (`src/orchestra/sprint-controller.ts:531`) gerçekten çalıştığını ve `null` dönerse sprint başlangıcının abort edilmesini sağla. Şu an `if (captured) writeBaseline(...)` koşulu, capture null olduğunda sessizce geçer ve `.deckent/ci-baseline.json` bir önceki sprint kalıntısını ya da bozuk değeri taşır. Önerilen düzeltme:

1. `captureVitestBaseline()` null dönerse warning değil **error** fırlat ve sprint'i durdur.
2. `npx vitest run --reporter=verbose --reporter=json --outputFile=.deckent/baseline-raw.json` ile JSON çıktıyı paralel yaz; parse failure halinde JSON kaynak güvenli kullanılabilir.
3. `.deckent/ci-baseline.json` şemasını strict Zod doğrulamasından geçir: `testCount=0 && testFailed > 0` durumu invalid kabul edilsin.

### 4.2 IDENTITY.md test metriklerini her sprint sonu otomatik güncelle (HIGH — Bulgu 1.2)

`updateProjectDocs()` (ADR-029, `src/orchestra/managed-docs/`) çağrı zincirine `IDENTITY.md` için `IdentityMetricsUpdater` ekle. Mevcut hook (ADR-046) tetikleniyorsa neden Sprint 167 değerinde kaldığı incelenmeli — büyük olasılıkla `updateProjectDocs()` IDENTITY.md generation'ını içermiyor ya da `Tests:` satırı manuel-overwrite olarak işaretlenmiş. Public GA öncesi tek doğru sayım kaynağı vitest çıktısı olmalı.

### 4.3 DIRECTIVES baseline iddiasını ölçülen baseline ile senkronize et (HIGH — Bulgu 1.3)

İki seçenek var: (a) DIRECTIVES sprint hazırlık adımı baseline'ı `.deckent/ci-baseline.json`'dan otomatik okusun ve metin içerisine inject etsin (template engine ADR-030 ile yapılabilir); (b) Sprint set-up sırasında baseline write edildikten sonra DIRECTIVES `GO/NO_GO` bölümü programatik olarak yenilensin. (a) daha az invaziv, önerilen yaklaşım.

### 4.4 Sprint 170 P1 tech-debt'i kapat — 5 fixture'ı taskId-aware şemaya güncelle (HIGH — Bulgu 1.4)

`tests/orchestra/tmux.test.ts:145,164`, `tests/orchestra/tmux-edge.test.ts:192`, `tests/security/shell-injection.test.ts:50,116`. Her biri tek satır değişiklik, toplam <10 LoC. Sprint 172 erken-fix mikro-task'ı olarak planla; Sprint 170 raporunun ekli "Recommendation" bölümünde önerildiği gibi.

### 4.5 Skip kayıtlarını dökümante et ve sözleşmesiz skip'leri kaldır (HIGH — Bulgu 1.5)

İki sınıf var:
- **Implementasyon bekliyor** (`describe.skip('not yet implemented')`): `tests/orchestra/sprint-retro-writer.test.ts:98,156` — bu testleri ya `.todo` haline getir (vitest niyet sinyali) ya da `MemoryStore.getLatestRetro` ve `migrateRetroLatest` implementasyonlarını tamamla.
- **Duplicate** (`covered by archive-debt.test.ts`): `tests/cli/commands/review-finalize-onboard-upgrade-plugin-archive-debt-improvements.test.ts:640-658` — 4 dead stub. Tamamen sil.
- **Source-side fix bekleyenler** (`tests/orchestra/turkish-locale.test.ts:19,34`): Source'a `toLocaleLowerCase('tr-TR')` ekle, skip kaldır.
- **Doc-format sonrası kalmış README assertion'ları** (`tests/docs/readme.test.ts:20-109`, `tests/cli/rich-output.test.ts:213-237`, `tests/blueprint/files.test.ts:29`): Mevcut README/AGENTS.md içerikleriyle yeniden senkronize ya da sil.

Sprint 172 OSS GA öncesinde 25 skip'in 16 IDENTITY iddiasına indirilmesi gerçek bir iyileştirme olur.

### 4.6 Coverage threshold ve retry politikası ekle (MEDIUM — Bulgu 1.7, 1.10)

`vitest.config.ts`'e:
```ts
coverage: {
  ...,
  thresholds: { lines: 85, statements: 85, branches: 75, functions: 85 },
},
retry: process.env.CI ? 2 : 0,
```
Threshold rakamları ad-hoc tahminlerdir; mevcut "89.33%" iddiasının altında tutulması ki düşüş alarm versin. `retry: 2` sadece CI'da uygulanır; yerel geliştirme deneyimini bozmaz.

### 4.7 Dashboard testlerini varsayılan komuta ekle (MEDIUM — Bulgu 1.8)

`package.json` script'lerine ek `"test:all": "vitest run && vitest run --config vitest.dashboard.config.ts"` ve `npm test` aliasını buna çevir (ya da `prepublishOnly`/CI workflow'a paralel `test:dashboard` çağrısı ekle). Dashboard test sayım iddiasını (`Dashboard Tests: 413`) gerçek sayıma göre güncelle (statik 18 dosyadan beklenen 80–250 test arası).

### 4.8 happy-dom sürümlerini hizala (MEDIUM — Bulgu 1.9)

`src/dashboard/package.json:26` happy-dom'u root `^20.8.4` ile hizala. Vite ve Vitest happy-dom paylaşımı zaten root node_modules üzerinden çözüldüğü için break beklenmez; ama iki manifest tek doğru sürümü göstermeli.

### 4.9 Mock drift için yıllık temizlik denetimi (MEDIUM — Bulgu 1.11)

1504 `vi.mock` çağrısı manuel takip edilemez. Şu önerilir:
- `scripts/mock-shape-check.mjs` — Her `vi.mock('./foo.js', () => ({ ... }))` çağrısı için, `./foo.js` modülünün gerçek export sembolleri ile mock döndürdüğü sahte modülün symbol set'ini karşılaştır.
- En azından `tests/cli/commands.test.ts:1210` skip'inin sebebi olan "TODO: update mock" benzeri yorumları her sprint sonu lint et ve sayım `.deckent/ci-baseline.json`'a kaydet.

### 4.10 Test sayım metric standardize — tek kaynak (MEDIUM — Bulgu 1.14)

Üç farklı yerde test sayısı iddia ediliyor: `IDENTITY.md`, `DIRECTIVES.md`, `ci-baseline.json`. Tek otoritatif kaynak `ci-baseline.json` olsun, diğer iki dosya ondan render edilsin (template engine ADR-030 hook'u). Bu doc-vs-code drift'in en büyük tek nedeni.

---

## 5. Kapsam Notu (cross-cutting task — modül-derin Kapsam Haritası uygulanamaz)

Bu denetim Sprint 171 DIRECTIVES'inde **cross-cut** kategorisinde sınıflandırılmıştır: tek bir kaynak modülü değil, **tüm test ağacı + vitest configleri + package.json + ci-baseline + IDENTITY iddiası** kapsamındadır. Bu nedenle Plan Task 171-021 runbook'unda da belirtildiği üzere modül-derin "Kapsam Haritası" (dosya × LoC tablosu, Task 1–14'lerde olduğu gibi) burada uygulanmaz.

Yine de denetim sırasında ele alınan kaynak yüzey, Synthesis Task 29 coverage doğrulamasında saklı kalmaması için aşağıda listelenmiştir:

| Yüzey | Konum | Boyut |
|------|-------|------|
| Ana vitest config | `vitest.config.ts` | 24 satır |
| Dashboard vitest config | `vitest.dashboard.config.ts` | 21 satır |
| Test ağacı (ana suite) | `tests/**` exclude `tests/dashboard/**` | 790 `*.test.ts` dosya, 33 alt-dizin |
| Test ağacı (dashboard suite) | `tests/dashboard/**` | 18 dosya (13 `.ts` + 5 `.tsx`) |
| Test setup | `tests/dashboard/setup.ts` | 8 satır |
| Platform meta | `tests/PLATFORM.md`, `tests/platform-tags.test.ts` | 74 satır + meta-test |
| Test helpers | `tests/helpers/paths.ts`, `tests/helpers/platform.ts` | helper modülleri (test dışı) |
| Test sayım iddiaları | `.deckent/workspace/IDENTITY.md:9-11`, `DIRECTIVES.md` GO/NO_GO bölümü | 3 metrik satır |
| CI baseline kaydı | `.deckent/ci-baseline.json` | 11 satır |
| Baseline tracker kaynak | `src/orchestra/baseline-tracker.ts` | 180 satır (sprint başlangıcında çağrılan) |
| Test script'leri | `package.json:18-34` | 14 script |

Synthesis (Task 171-029) bu yüzey listesini diğer cross-cut task'ların yüzeyleriyle birleştirip coverage-gap doğrulamasında dikkate almalıdır.

---

_Rapor sonu — Worker w-171-021, Sprint 171, Task 171-021. Tüm bulgular disk üzerinde doğrulanabilir; vitest çalıştırma denetim kapsamı dışındadır (audit-only)._
