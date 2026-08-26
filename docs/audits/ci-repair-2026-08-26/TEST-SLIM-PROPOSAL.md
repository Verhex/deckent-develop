# Test Load Retirement Proposal — 2026-08-26

## Teknik özet

Mevcut korpus `2.923` test dosyası, `718.051` satır ve statik olarak sayılabilen
`37.791` `it/test` çağrısı taşıyor. Sonuç, “40K testin çoğu eski ve silinebilir” değildir:
byte-identical dosya sayısı **0**, yorum/whitespace normalize edildiğinde identical dosya
sayısı yine **0** ve aynı-layer basename gruplarının çoğunda literal test başlığı örtüşmesi
yoktur. Korpus büyük, fakat önemli bölümü benzersiz davranış taşımaktadır.

Kontrollü indirim üç ayrı karar ister:

1. **Owner'ın dosya-bazında onaylayabileceği çekirdek emeklilik listesi:** 7 dosya;
   4 full-skip docs, 1 archived README suite ve 2 dönem-pinli config suite. Ham silme
   yalnız canlı kapsama tam ise; aksi durumda aynı committe assertion taşıma zorunlu.
2. **Assertion-preserving fiziksel konsolidasyon:** cross-surface parity dışındaki 18
   aynı-layer grup, `36 → 18` dosya. Burada test/assertion sayısı düşürülmez.
3. **Profiling şartlı wire dalgası:** 117 raw `*wire*` dosyasından parity/öncelikli
   sınıflarla çakışmayan 115 dosya. İlk hedef `≤78` dosya; exact test-title/assertion ve
   coverage multiset'i korunmadan hiçbir dosya emekli edilmez.

Bu üç dalganın dosya hedefi `2.923 → ≤2.861` (`−62`, `−%2,12`). Bu kasıtlı olarak
“−%20 dosya” gibi kanıtsız bir hedef değildir. Runtime hedefi, mevcut kırmızı snapshot'ın
12,20 dakikalık critical path'ini sağlıklı üç-koşu medianı oluşunca `−%15` ile
`≤10,37 dk`ya indirmektir (`≥1,83 dk`). Mevcut run kırmızı olduğu için bu süre yalnız
provisional baseline'dır; green rebaseline olmadan kazanım iddiası kurulamaz.

Faz-A'da hiçbir `tests/**` veya `vitest.config.ts` dosyası değiştirilmemiştir. Aşağıdaki
liste ancak owner dosya/ID onayı **ve** ana-şerit `lease-aktif` beyanı birlikte geldikten
sonra Faz-B allowlist'ine girer.

## Ölçüm kapsamı ve tanımlar

- **Dosya denominator'ı:** `tests/**` altında `*.test.ts|tsx|js|mjs`; tam `2.923`.
- **Satır:** LF satır sayımı; tam `718.051`.
- **Statik test çağrısı:** `it/test` ile `.skip/.skipIf/.todo/.concurrent/.each` çağrı
  tokenları; generated parameterized vaka sayısı değildir. Tam `37.791`, dolayısıyla
  ürün dilindeki “~39K/40K test” için karşılaştırılabilir proxy'dir.
- **Runtime:** aynı WSL lane, Node `24.15.0`, Vitest `3.2.4`; `VITEST_MAX_FORKS=1/2`
  komutlarında gözlenen wall duration. Tek dosya maliyeti uydurulmadı; yalnız gerçekten
  birlikte koşulan kümeye süre yazıldı.
- **Coverage floor:** lines `82`, functions `89`, branches `80`, statements `82`.
  Aktif assertion taşıması source coverage multiset'ini korumalı; threshold düşürmek
  veya exclude genişletmek kabul değildir.
- **RETIRE:** raw delete için canlı eşdeğer koruma var.
- **MERGE_THEN_RETIRE:** unique assertion aynı committe adı verilen canlı suite'e taşınır;
  sonra kaynak dosya silinir.
- **HOLD:** bugün eşdeğer canlı koruma kanıtı eksik veya base suite kırmızı.

## 2.923 dosyanın disjoint sınıflandırması

Aşağıdaki sıra önceliklidir; bir dosya ilk eşleştiği sınıfa yazılmıştır. Böylece toplam
tam `2.923` eder ve wire/bloat gibi örtüşen etiketler iki kez sayılmaz.

| Öncelik | Disjoint sınıf | Dosya | Karar |
|---:|---|---:|---|
| 1 | `tests/integration/**` | 37 | **KORU** — brief ile sabit yüksek davranış değeri |
| 2 | Tam-skip docs | 4 | Dosya-bazlı `RETIRE` / `MERGE_THEN_RETIRE`; aşağıda |
| 3 | Env-gated E2E | 2 | **KORU ve ayrıştır** — mock/unit default, gerçek entegrasyon protected opt-in gate |
| 4 | Cross-surface olmayan same-layer lexical grup | 36 | 18 assertion-preserving merge adayı |
| 5 | `tests/unit/**` yetim dizini | 4 | **TAŞI**, silme yok; davranış orchestra eşlerinden ayrık |
| 6 | Cross-layer basename veya `*parity*` ailesi | 157 | **KORU** — raw set 160, önceki sınıflarla 3 çakışma |
| 7 | Filename dönem-pinleri | 27 | 2 davranış-örtüşük aday; kalanları **KORU** |
| 8 | `*wire*` ailesi | 115 | Profiling + assertion-map şartlı konsolidasyon; raw set 117 |
| 9 | 500+ satır süper-şişkin dosyalar | 165 | Silme yok; hotspot/refactor profili; raw set 199 |
| 10 | Kanıt üretmeyen remainder | 2.376 | **KORU** — adaylık kanıtı yok |
|  | **Toplam** | **2.923** |  |

Ek doğrulamalar:

- Basename'i birden fazla dosyada geçen raw grup: `74` (brief snapshot'ındaki 73'e göre
  +1 base drift); bunun `56` grubu farklı top-level surface'ler arasında ve korunuyor.
- Filename'i `parity` içeren dosya: `36`; cross-layer union: `160` dosya.
- Boy dağılımı brief ile birebir: `<80=384`, `80–199=1.129`, `200–499=1.211`,
  `500+=199`.
- `orchestra=748`, `core=643`, `cli=606`; birlikte `1.997` dosya (`%68,32`) ve
  `497.898` satır. Remainder `926` dosya / `220.153` satırdır.

## Owner-onay yüzeyi: dosya-bazlı emeklilik listesi

Her satır ayrı onaylanabilir. `MERGE_THEN_RETIRE` satırı yalnız assertion taşıması ile
atomik olarak uygulanabilir; kaynak dosyanın tek başına silinmesi onay kapsamı değildir.

| ID / sınıf / karar | Dosya(lar) | Satır | Koşum maliyeti | GEREKÇE | Kapsama-kanıtı | Risk-notu |
|---|---|---:|---|---|---|---|
| TSR-001 · tam-skip · `RETIRE` | `tests/docs/vitepress.test.ts` | 243 | Docs 5-file ölçümünün parçası: 0,691 sn; 38/38 runtime skip | Tamamı `describe.skip`; artık bulunmayan VitePress topology ve archived content'i pinliyor. Aktif davranış yok. | Bugünkü docs topology: `tests/docs/docs-structure.test.ts`; generated reference doğruluğu: `tests/docs/cli-reference.test.ts`; link gate: `scripts/lint-links.mjs`. | Düşük. VitePress yeniden ürün kararı olursa yeni current-contract suite gerekir; bu eski suite restore edilmez. Src coverage etkisi yok. |
| TSR-002 · tam-skip · `RETIRE` | `tests/docs/readme-quality.test.ts` | 90 | Aynı 0,691 sn küme; 5/5 skip | Dosya kendi yorumunda archived corpus olduğunu söylüyor; badge/repo/link/quickstart frozen copy testleri çalışmıyor. | Sayısal/current README truth: `tests/docs/readme-number-truth.test.ts`; quickstart: `tests/docs/quickstart.test.ts`; link gate: `scripts/lint-links.mjs`; generated sayılar: `tests/scripts/update-readme-stats.test.ts`. | Düşük-orta. Exact public-repo URL adedi canlı gate'te yok; bu sayı ürün sözleşmesi sayılmamalı. Src coverage etkisi yok. |
| TSR-003 · tam-skip · `MERGE_THEN_RETIRE` | `tests/docs/no-stale-identity-refs.test.ts` | 55 | Aynı 0,691 sn küme; 6/6 skip | İki eski CLI doc yolu artık generated output'a taşınmış. Raw delete exact `PROJECT-IDENTITY` negative-space niyetini kaydeder. | Canlı generated producer/determinism: `tests/docs/cli-reference.test.ts`; reference truth: `tests/docs/reference-drift.test.ts`. Faz-B'de `PROJECT-IDENTITY` yokluğu + current identity path assertion'ı `cli-reference.test.ts`ye taşınır. | Orta. **Bugün exact negative assertion eksik**, dolayısıyla assertion taşınmadan raw delete yasak. Src coverage etkisi yok. |
| TSR-004 · tam-skip · `MERGE_THEN_RETIRE` | `tests/docs/blueprint-current.test.ts` | 33 | Aynı 0,691 sn küme; 1/1 skip | `docs/vision/VISION.md` successor varsayımı da eskimiş; current authority `docs/en/vision.md` + TR twin. | Current vision link'i `tests/docs/readme-number-truth.test.ts`; doc honesty `tests/docs/doc-honesty.test.ts`. Faz-B'de anti-X/product-positioning assertion'ı current EN/TR vision dosyalarına karşı `doc-honesty.test.ts`ye taşınır. | Orta. **Bugün content-equivalent canlı assertion yok**; taşıma olmadan silme yasak. |
| TSR-005 · kapsam-çakışığı · `MERGE_THEN_RETIRE` | `tests/docs/readme.test.ts` | 106 | Aynı 0,691 sn küme; 2 pass + 11 skip | 11 archived assertion parse ediliyor; kalan existence ve English-heading kontrolleri ayrı current docs gate'lerinde tutulabilir. | Existence `tests/docs/docs-structure.test.ts`; README current facts `tests/docs/readme-number-truth.test.ts`. English-heading assertion'ı ikinci dosyaya taşınır; 11 skipped assertion emekli edilir. | Orta. English-heading regex'i taşınmadan silme yok. Src coverage etkisi yok. |
| TSR-006 · dönem-pini · `MERGE_THEN_RETIRE` | `tests/core/config-sprint063.test.ts` | 234 | Config 3-file ölçümü: 1,30 sn; 72/72 pass | Migration ve enum-error davranışı current config suite'lerinde tekrar doğrulanıyor; sprint-number dosyası ayrı fixture/bootstrap yineliyor. | Migration: `tests/core/config-migration.test.ts`; enum validation + `loadConfig`: `tests/core/config.test.ts`; successor cross-check: `tests/core/config-sprint064.test.ts`. Unique error-message assertions named targetlara taşınır. | Orta-yüksek. Literal title overlap `0`; davranış eşlemesi assertion-level yapılmalı. Coverage summary thresholdlardan düşemez. |
| TSR-007 · dönem-pini · `MERGE_THEN_RETIRE` | `tests/core/config-sprint064.test.ts` | 217 | Aynı 1,30 sn küme; 11 call | `needsMigration`, file migration, dry-run ve enum-format davranışı canonical config suites'inde mevcut; sprint fixture'ı duplicated setup taşıyor. | `tests/core/config-migration.test.ts` ve `tests/core/config.test.ts`. `config-sprint063` onaylanmasa bile ona coverage kanıtı olarak güvenilmez. | Orta-yüksek. `063` ile aynı committe siliniyorsa her iki dosyanın unique assertion matrix'i canonical hedeflere taşınmalı. |

Bu liste `7 dosya / 978 satır` kapsar. Runtime kazanımı küçük olabilir; amacı önce
çalışmayan/yanlış-topology kararlarını temizlemektir. Aktif assertion sayısı
zayıflatılmaz. Full-skip 4 dosyada toplam 50 runtime-skipped test, `readme.test.ts` ile
birlikte 61 skipped declaration emekli olur.

## 18 same-layer fiziksel konsolidasyon adayı

Raw tarama 25 same-layer lexical grup buldu. `core/config` ayrı production modülleridir;
`init`, `memory-query`, `recover`, `run`, `sync`, `watch` ise aynı zamanda cross-surface
basename ailesindedir ve DOKUNMA sınıfına alındı. Kalan 18 grup `36 dosya / 8.759 satır /
659 statik test çağrısıdır`.

Küme yerel olarak default config altında 47 dosya (2 Dashboard dosyası exclude) şeklinde
38,41 sn'de koştu; `tests/cli/commands/init.test.ts`te base'e ait 76 kırmızı bulunduğu için
bu süre yalnız referanstır. Aşağıdaki satırlarda file-level süre uydurulmadı; maliyet
kolonu aynı ölçülmüş küme denominator'ını taşır.

| ID | Dosya(lar) → canonical hedef | Satır / call | Koşum-maliyeti tahmini | GEREKÇE | Kapsama-kanıtı | Risk-notu |
|---|---|---:|---|---|---|---|
| TSM-001 | `tests/cli/chat.test.ts` + `tests/cli/commands/chat.test.ts` → `tests/cli/commands/chat.test.ts` | 586 / 19 | 38,41 sn küme; file-level bilinmiyor | Aynı CLI command family, iki bootstrap. | Bugün iki named suite; merge sonrası exact 19-title/assertion manifest canonical dosyada. | Orta: native/command mock boundary korunmalı. |
| TSM-002 | `tests/cli/chat-native.test.ts` + `tests/cli/commands/chat-native.test.ts` → nested target | 457 / 19 | Aynı küme | Aynı native chat producer'ı, iki setup. | İki mevcut dosyanın exact title/assertion manifest'i; ayrı bir wire suite varmış gibi kapsama yazılmaz. | Orta: real transport ile command parsing karıştırılmaz. |
| TSM-003 | `tests/cli/chat-slash-registry.test.ts` + `tests/cli/commands/chat-slash-registry.test.ts` → nested target | 353 / 39 | Aynı küme | Registry/command bootstrap tek fixture olabilir. | İki mevcut suite'in exact title/assertion manifest'i. | Orta: registry ordering assertions korunmalı. |
| TSM-004 | `tests/cli/dashboard.test.ts` + `tests/cli/commands/dashboard.test.ts` → nested target | 477 / 30 | Aynı küme | Aynı command family. | İki mevcut suite; Dashboard React testleri bu merge'e dahil değildir. | Orta: subprocess/mock ayrımı. |
| TSM-005 | `tests/cli/error-handler.test.ts` + `tests/cli/helpers/error-handler.test.ts` → helper target | 287 / 27 | Aynı küme | Aynı helper davranışı iki konumda. | İki mevcut suite; exact error-code/title manifest'i. | Yüksek: i18n ve redaction negative-space kaybolamaz. |
| TSM-006 | `tests/cli/messages.test.ts` + `tests/cli/helpers/messages.test.ts` → helper target | 1.089 / 134 | Aynı küme | Message catalog tek production helper'a bağlı. | İki mevcut suite; EN/TR key parity assertion sayısı korunur. | Yüksek: i18n-FIRST; key veya locale coverage düşemez. |
| TSM-007 | `tests/cli/native-transport.test.ts` + `tests/cli/repl/native-transport.test.ts` → REPL target | 178 / 13 | Aynı küme | Aynı transport module family. | İki mevcut suite; transport state/title manifest'i. | Orta: platform/TTY koşulları korunur. |
| TSM-008 | `tests/cli/onboard.test.ts` + `tests/cli/commands/onboard.test.ts` → nested target | 408 / 31 | Aynı küme | Aynı command lifecycle. | İki mevcut suite; prompt/noninteractive cases aynen taşınır. | Yüksek: provider auth mutation test doubles dışına çıkamaz. |
| TSM-009 | `tests/cli/commands/output.test.ts` + `tests/cli/helpers/output.test.ts` → yeni `tests/cli/output.test.ts` | 1.140 / 89 | Aynı küme | Command/helper output aynı semantic family; tek top-level suite okunabilirliği artırır. | İki mevcut suite; exact 89-call manifest. | Yüksek: ANSI/JSON/TTY/i18n segmentleri ayrı describe'larda kalmalı. |
| TSM-010 | `tests/cli/recall.test.ts` + `tests/cli/commands/recall.test.ts` → nested target | 333 / 14 | Aynı küme | Aynı recall command + MemoryStore bootstrap. | İki mevcut suite; DB/query cases aynen taşınır. | Yüksek: SQLite lifecycle ve tenant isolation korunur. |
| TSM-011 | `tests/cli/splash.test.ts` + `tests/cli/helpers/splash.test.ts` → helper target | 99 / 14 | Aynı küme | İki küçük splash suite; 1 literal title overlap var. | İki mevcut suite; overlap semantik olarak eşit kanıtlanmadan assertion silinmez. | Düşük-orta: ANSI/non-TTY. |
| TSM-012 | `tests/cli/sprint-summary-rich.test.ts` + `tests/cli/helpers/sprint-summary-rich.test.ts` → helper target | 569 / 45 | Aynı küme | Aynı formatter family. | İki mevcut suite; output-mode + lineage fields exact korunur. | Yüksek: legacy snapshot yerine semantic assertions korunmalı. |
| TSM-013 | `tests/dashboard/terminal-api.test.ts` + `tests/dashboard/terminal/terminal-api.test.ts` → flat target | 129 / 14 | Default koşuda exclude; dashboard gate ayrı | Aynı Dashboard API client family. | `vitest.dashboard.config.ts` altında iki suite. | Orta: default suite süresine kazanım yazılamaz. |
| TSM-014 | `tests/mcp/helpers/format.test.ts` + `tests/mcp/tools/format.test.ts` → yeni `tests/mcp/format.test.ts` | 680 / 68 | 38,41 sn küme | Format helper/tool semantic family; iki literal title overlap. | İki mevcut suite; MCP wire/JSON content assertions korunur. | Yüksek: helper ve public tool surface negative-space'i ayrılmalı. |
| TSM-015 | `tests/mcp/help.test.ts` + `tests/mcp/tools/help.test.ts` → tool target | 400 / 26 | Aynı küme | Aynı help tool family. | İki mevcut suite; tool registration gate ayrıca korunur. | Orta: public help contractı. |
| TSM-016 | `tests/mcp/job-runner.test.ts` + `tests/mcp/tools/job-runner.test.ts` → tool target | 345 / 20 | Aynı küme | Aynı job runner tool family. | İki mevcut suite; timeout/error cases exact taşınır. | Yüksek: async lifecycle ve cleanup. |
| TSM-017 | `tests/mcp/resources.test.ts` + `tests/mcp/resources/resources.test.ts` → flat target | 972 / 48 | Aynı küme | Aynı resource registry/read family. | İki mevcut suite + MCP resource count gates. | Yüksek: URI, tenant scope ve error shape. |
| TSM-018 | `tests/nervous/stale-worker.test.ts` + `tests/nervous/detectors/stale-worker.test.ts` → detector target | 257 / 9 | Aynı küme | Aynı detector family. | İki mevcut suite; state transition cases aynen taşınır. | Yüksek: false-positive worker death detection. |

**Önemli negatif bulgu:** 2.923 dosyada byte-identical veya normalize-identical çift yok.
Bu 18 grup “duplicate assertion deletion” listesi değildir. Literal title overlap yalnız
3 başlıktır; title eşitliği de davranış eşitliği kanıtı sayılmaz. Faz-B merge validator'ı
önce/sonra test-title + assertion-source manifest'ini eşit görmeden kaynak dosyayı silemez.

## Dönem-pinleri: 28 dosyanın yalnız ikisi aday

Filename regex'i 28 dosya buldu. Yalnız TSR-006/007 davranış bazında modern suite'lerle
örtüşüyor. Kalan 26 dosya adındaki `sprint/faz/f101x/w` nedeniyle emekli edilemez;
özellikle `tests/integration/sprint-044-modules.test.ts` mutlak KORU sınıfındadır.

```text
tests/agents/scope-w1-escalation.test.ts
tests/config/nervous-faz1-smoke.test.ts
tests/connectors/identity-faz3-e2e.test.ts
tests/connectors/identity/factory-faz3.test.ts
tests/core/f1012-config-registry.test.ts
tests/core/identity-config-faz3.test.ts
tests/core/live-w1-staleHb.test.ts
tests/e2e/sprint-160-smoke.test.ts
tests/integration/sprint-044-modules.test.ts
tests/monitor/gate-w1-boundary-alert.test.ts
tests/nervous/bootstrap-w3-event-emit.test.ts
tests/nervous/gate-w2-lethal.test.ts
tests/nervous/integration/regression-sprint-146.test.ts
tests/nervous/live-w1b-adaptive.test.ts
tests/nervous/nerv-w1-predicate.test.ts
tests/nervous/nerv-w1b.test.ts
tests/orchestra/data-w1-tokenusage.test.ts
tests/orchestra/f1014-auth-isolation.test.ts
tests/orchestra/ollama-model-flow-236.test.ts
tests/orchestra/promote-w1.test.ts
tests/orchestra/promote-w1b.test.ts
tests/orchestra/prompt-w1.test.ts
tests/orchestra/scope-w1b.test.ts
tests/orchestra/sprint2-debt.test.ts
tests/orchestra/state-w1-taxonomy.test.ts
tests/orchestra/tel-w1-reason.test.ts
```

## Env-gated E2E: silme değil, dürüst gate ayrıştırması

| Sınıf / dosya | Satır | Ölçülen maliyet | GEREKÇE | Kapsama-kanıtı / öneri | Risk-notu |
|---|---:|---:|---|---|---|
| kapsam-çakışığı · `tests/e2e/docker-backend.test.ts` | 1.818 | İki E2E dosyası birlikte 4,79 sn; 67 pass + 13 skip | `DECKENT_DOCKER_E2E=1` hiçbir workflow'da set değil, fakat dosyada çok sayıda aktif unit/parity testi de var. Bütün dosyayı exclude etmek canlı coverage siler. | Aktif unit/parity describe'ları default suite'te kalır. Yalnız gerçek Docker isteyen vakalar `*.opt-in.test.ts`e taşınır; dedicated Linux job env'i açar. | Yüksek: gerçek Docker gate çalışmadan “covered” denemez; PR maliyeti ile nightly güveni ayrı raporlanır. |
| kapsam-çakışığı · `tests/e2e/provider-smoke.test.ts` | 480 | Aynı 4,79 sn küme | Yalnız gerçek-provider vakaları `DECKENT_PROVIDER_INTEGRATION=1`; mock registry/fallback/model tests aktif ve değerlidir. | Aktif mock suites default'ta; üç credential-bearing integration case protected GitHub Environment altında explicit job'a taşınır. | CRITICAL: PR/fork context'ine provider secret açılmaz; same-provider self-verification yapılmaz. |

Karar önerisi: **ikisini de tüm-file opt-in exclude etme**. Unit/mock davranışları default'ta
tut; yalnız external dependency isteyen vakaları ayrı filename'e böl ve gerçek dedicated
gate'i çalıştır. Böylece “toplandı ama hiç doğrulanmadı” görünmezliği biter; coverage floor
aktif unit cases üzerinden düşmez.

## `tests/unit/`: 4 dosya taşınır, emekli edilmez

| Dosya | Satır / call | Hedef | GEREKÇE / kapsama-kanıtı | Risk-notu |
|---|---:|---|---|---|
| `tests/unit/heartbeat-daemon.test.ts` | 167 / 8 | `tests/orchestra/heartbeat-daemon-unit.test.ts` | Orchestra eşinden davranışça ayrık; yalnız dizin taxonomy tekilleşir. | Dosya silinip assertion kaybı yok; rename history korunur. |
| `tests/unit/promotion-pipeline.test.ts` | 213 / 10 | `tests/orchestra/promotion-pipeline.test.ts` | Production owner orchestra; başka duplicate yok. | Built-in/non-built-in policy assertions korunur. |
| `tests/unit/spawn-backend-docker.test.ts` | 372 / 19 | `tests/orchestra/spawn-backend-docker-unit.test.ts` | Orchestra'daki büyük sibling'dan ayrık error classification cases. | Birleştirme yerine rename; mock hoist collision önlenir. |
| `tests/unit/sprint-utils.test.ts` | 383 / 36 | `tests/orchestra/sprint-utils-unit.test.ts` | Utility cases ayrık; taxonomy düzeltmesi. | State-file cleanup tests hermetic kalır. |

Net dosya/runtime kazanımı `0`; bu öneri yalnız ownership ve discovery kalitesidir.

## `*wire*` ailesi: 117 dosyayı assertion koruyarak modül kümelerine indir

Raw aile `117 dosya / 28.831 satır / 1.070 statik call`dır. Dağılım:

| Layer | Dosya | Satır | Call |
|---|---:|---:|---:|
| orchestra | 48 | 14.451 | 405 |
| cli | 33 | 6.426 | 319 |
| core | 10 | 2.265 | 114 |
| api | 9 | 1.486 | 45 |
| agents + agent | 7 | 1.150 | 59 |
| connectors | 5 | 1.890 | 59 |
| dashboard + nervous + providers | 5 | 1.163 | 69 |

Öneri raw silme değildir:

1. Her dosya için production ingress → consumer → receipt/gate etiketi çıkar.
2. Cross-surface parity ile çakışan 2 dosya ve public-adapter negative-space testleri
   korunur.
3. Kalan 115 dosya module-owner kümelerine alınır; ilk acceptance hedefi `≤78` dosyadır.
4. Test title, path/line bilgisinden bağımsız normalize edilmiş assertion-expression digest'i,
   mocked module set ve coverage file map'i before/after eşitlenir. Eşitlenmeyen cluster
   `HOLD` kalır.
5. Shared fixture yalnız setup maliyetini azaltır; mutable singleton veya cross-test state
   paylaşımı yaratamaz.

Risk **yüksek**: wire dosyaları production wiring closure kanıtıdır. “Aynı import var”
silme kanıtı değildir.

## `spawn-backend-docker`: 63 tüketici bir silme sinyali değil

Exact `.js` referansı 63 test dosyasında bulunuyor. Toplam metin referansı 85 dosya;
farkın içinde source-text ve documentation checks var. Öneri:

- Docker CLI/daemon/image error fixture'larını tek hermetic factory'de topla.
- Import eden 63 dosyayı davranış segmentlerine ayır: auth, lifecycle, settlement,
  timeout, trace, resource/mount, real Docker.
- Segmentler arası assertion taşımadan dosya silme yok.
- `tests/e2e/docker-backend.test.ts` içindeki aktif unit cases önce orchestra segmentine,
  gerçek Docker cases opt-in gate'e ayrılır.

Coverage kanıtı mevcut 63 named consumer + `tests/orchestra/spawn-backend-docker.test.ts`
+ `tests/orchestra/spawn-backend-docker-probe.test.ts` + gerçek Docker gate üçlüsüdür.
Risk CRITICAL; ortak mock factory production davranışını yeniden implement edemez.

## Süper-şişkin dosyalar: deletion değil hotspot programı

| Dosya | Satır | Öneri | Canlı kapsama / risk |
|---|---:|---|---|
| `tests/scripts/clean-active-execution-guard.test.ts` | 4.154 | Scenario data builder + platform adapter matrices; serial hotspot profile | Clean authority security gate; CRITICAL, assertion silme yok. |
| `tests/scripts/lint-master-plan.test.ts` | 3.377 | Fixture corpus dedupe, parser cases table-driven | Governance ledger gate; CRITICAL. |
| `tests/monitor/auditor.test.ts` | 3.078 | Pure scanner vs runtime I/O describe isolation | Auditor truth surface; HIGH. |
| `tests/orchestra/brain.test.ts` | 3.070 | State-machine segment fixtures; global mocks kaldır | Orchestration core; CRITICAL. |
| `tests/orchestra/cross-verify-wire.test.ts` | 2.971 | Provider/receipt scenarios table-driven, no provider merge | XVerify closure; CRITICAL. |
| `tests/scripts/lint-test-hermeticity.test.ts` | 2.969 | Rule corpus fixture extraction | Test safety gate; CRITICAL. |
| `tests/orchestra/sprint-controller.test.ts` | 2.850 | Phase-specific setup factories | Lifecycle authority; CRITICAL. |
| `tests/orchestra/task-builder.test.ts` | 2.827 | Input family matrices | Scope/acceptance contract; HIGH. |
| `tests/cli/commands/doctor.test.ts` | 2.473 | Check-family fixtures | User-facing diagnosis; HIGH/i18n. |
| `tests/orchestra/sprint-reporter.test.ts` | 2.351 | Projection fixtures, snapshot-free semantic assertions | Reporting truth; HIGH. |
| `tests/cli/commands/init.test.ts` | 2.201 | Önce mevcut 76 base failure kapat; sonra setup segments | Şu an HOLD; kırmızı testi slim paketiyle maskeleme. |
| `tests/core/task-execution-fence.test.ts` | 2.093 | Fence scenario matrices | Concurrency authority; CRITICAL. |
| `tests/cli/commands.test.ts` | 2.022 | Command-family modulesine taşı | Büyük mock graph; HIGH. |
| `tests/core/config.test.ts` | 1.928 | Canonical hedef olarak kalır; migration fixtures ortaklaştır | Config SSOT; HIGH. |
| `tests/e2e/docker-backend.test.ts` | 1.818 | Unit vs real-integration ayrımı | Yukarıdaki protected opt-in kararı; CRITICAL. |

199 adet 500+ satır dosya vardır. Bu tablo ilk 15 hotspot'tur; file split tek başına
yük azaltımı sayılmaz, hatta file count'u artırabilir. Başarı yalnız median wall time,
peak RSS ve coverage eşitliğiyle kabul edilir.

## Partial-skip ve cross-surface koruma kararları

- `tests/docs/CHANGELOG.test.ts`, `api-md-no-stale-refs.test.ts`,
  `doc-pillars-links.test.ts`, `readme-number-truth.test.ts`,
  `reference-drift.test.ts`, `release-checklist.test.ts`,
  `security-md-current.test.ts` partial-skip'tir; aktif davranış taşıdıkları için raw
  delete adayı değildir. Skipped assertions ayrı owner satırı olmadan temizlenmez.
- `tests/cli/{init,run,sync,watch}.test.ts`,
  `tests/mcp/{memory-query,recover}.test.ts` same-layer lexical çakışma gösterse de aynı
  basename başka public surface'te de vardır; cross-surface parity DOKUNMA kuralıyla HOLD.
- `tests/core/config.test.ts`, `tests/core/doc-tracking/config.test.ts`,
  `tests/core/routing/config.test.ts` aynı basename ama ayrı production modülleridir;
  mükerrer değildir.
- `tests/integration/**`teki 37 dosyanın hiçbiri retirement listesinde değildir.

## Vitest/config ve workflow önerileri

Faz-B onayı olmadan uygulanmayacak exact policy:

1. `vitest.config.ts` default `include` korunur; geniş `tests/e2e/**` exclude eklenmez.
2. Yalnız ayrıştırılmış `*.opt-in.test.ts` dosyaları default exclude'a girer. Explicit
   `DECKENT_OPT_IN_E2E=1` koşusunda exclude kaldırılır.
3. Docker integration Linux'ta bounded scheduled/manual job; provider integration
   protected GitHub Environment ve owner-controlled credentials altında ayrı job.
4. `maxForks` CI `2`, local `4` mevcut memory budget kanıtı olmadan değiştirilmez.
5. Global `testTimeout=10000` yükseltilmez. Gerçek Docker/provider case'leri kendi bounded
   timeout'unu taşır; timeout artırımı performans regresyonunu gizleyemez.
6. Coverage threshold veya `src/**` exclude listesi düşürülemez/genişletilemez.
7. Her consolidation cluster için before/after üç-run median, peak RSS, test title count,
   pass/skip count ve `coverage-summary.json` karşılaştırılır.

## Ölçülmüş baseline ve acceptance hedefleri

| Ölçüm | Baseline | Acceptance |
|---|---:|---:|
| Test dosyası | 2.923 | `≤2.861` (`−62`) — 7 retirement + 18 same-layer + 37 wire consolidation |
| Statik call | 37.791 | Aktif call için zorunlu düşüş hedefi **yok**; assertion weakening yasak. En fazla 61 dead/skipped declaration açık owner onayıyla çıkar. |
| Docs retirement bundle | 5 dosya, 0,691 sn; 2 pass + 61 skip | Active 2 assertion taşındıktan sonra pass; kazanım ayrı ölçülür, uydurulmaz. |
| Config retirement bundle | 3 dosya, 1,30 sn; 72/72 pass | Canonical 2 dosya içinde aynı davranış/coverage; median mevcut değerden kötüleşmez. |
| Env E2E bundle | 2 dosya, 4,79 sn; 67 pass + 13 skip | Default aktif 67 korunur; gerçek integration dedicated gate'te gerçekten PASS/HOLD raporlar. |
| Same-layer bundle | default-collected 47 dosya, 38,41 sn; base `init`te 76 fail | Önce base green; sonra 3-run median `−%15` hedefi, assertion/title/coverage eşitliği. |
| Remote critical path | Docs+Scripts 731,74 sn = 12,20 dk, kırmızı snapshot | Green rebaseline sonrası `≤10,37 dk` (`≥1,83 dk`, `−%15`) |
| Remote beş primary shard runner-time | 1.730,65 sn = 28,84 dk; fail-fast/cancel etkili | Yalnız tüm shard'lar green olduktan sonra 3-run median yeniden baseline edilir; mevcut sayı savings claim'i değildir. |

## Limitler ve robustness

- CI snapshot'ı kırmızı; fail-fast, timeout ve early-exit süreleri tam green koşumu temsil
  etmez. Bu nedenle minute hedefi provisional, kazanım iddiası değildir.
- Static regex parameterized `.each` vaka sayısını açmaz; 37.791 yalnız stabil proxy'dir.
- Literal test-title overlap davranış eşitliği kanıtı değildir; yalnız yanlış “duplicate”
  varsayımını çürütmek için kullanıldı.
- File merge import graph, Vitest mock hoisting ve shared singleton state yüzünden test
  davranışını değiştirebilir. Her merge kendi izolasyon kanıtını taşır.
- Full-skip test src coverage üretmez; config/wire merge'leri coverage map'i korumalıdır.
- Grafik eklenmedi: zaman serisi veya trend yerine her dosyanın exact karar satırı ve tekrar
  üretilebilir sayaçlar denetim otoritesidir; grafik bu lookup yüzeyini iyileştirmeyecekti.

## Önerilen karar sırası

1. Owner `TSR-001..007` ve `TSM-001..018` satırlarını tek tek `approve/hold/deny` eder.
2. Ana-şerit mevcut 70-file CI regression paketini kapatıp green measurement baseline'ı
   üretir; bu testler emeklilikle maskelenmez.
3. Ana-şerit açıkça `lease-aktif` der. İki koşuldan biri yoksa Faz-B başlamaz.
4. Faz-B önce Secret Scan fixture diff'ini, sonra docs/config retirement'ı, sonra
   same-layer merge'leri küçük commits halinde uygular.
5. Wire dalgası ancak ilk pilot cluster üç-run median ve assertion/coverage equality
   kanıtını geçerse genişler.
6. Landing: tam lokal full-suite + 20 named gate yeşil; remote sonuçlar sınıf adıyla
   raporlanır, “repo green” genellemesi yapılmaz.

## Açık kararlar

- Docker gerçek-integration gate'i PR-required mı, nightly-required mı olmalı?
- Provider protected environment için hangi owner-controlled credential/usage budget
  admission'ı kullanılmalı?
- `TSR-003/004` assertion taşıma hedefleri owner tarafından current product authority
  olarak kabul ediliyor mu?
- Wire hedefi `115 → ≤78` yeterli mi, yoksa ilk green profiling sonrası modül bazında
  daha düşük/üst sınır mı konmalı?
