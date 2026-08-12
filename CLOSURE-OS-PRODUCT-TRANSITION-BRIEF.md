# Closure OS ve Ürün Yüzeyleri Geçiş Özeti

## Executive Summary

- **Çalışma modeli değişecek.** Başarı, ledger satırı veya üretilen task sayısıyla değil; owner tarafından admission verilmiş, production-wired ve receipt ile kapanmış `Committed Outcome` sayısıyla ölçülecek.
- **UI/UX ayrı bir backlog olmayacak.** Kullanıcıya dönük her closure package; canonical contract, runtime/application service, Desktop, Terminal ve gerçek-process proof lane'lerini aynı outcome altında taşıyacak.
- **Deckent kendi arayüzüne kademeli taşınacak.** Önce live read-only observation, sonra guarded preview, protected control ve en son günlük Deckent geliştirmesini taşıyan native dogfood promotion'ı yapılacak.
- **Sürüm konumlandırması geri alındı.** `1.0.0-beta` yönü iptal edildi; yeni başlangıç sürümü `0.100.0` olacak. Her version bump gerçek shipped delta ve canonical changelog kaydıyla eşleşecek.
- **Bu dosya çalışma notudur, execution authority değildir.** Sprint 524 terminal settlement'ından sonra Codex + Fable kontrolü, owner karar turu ve canonical repo düzenlemeleri için tek temiz giriş olarak kullanılacaktır.

## 1. Dokümanın statüsü ve sınırı

| Alan | Değer |
|---|---|
| Statü | `WORKING DRAFT` |
| Tarih | 2026-08-12 |
| Amaç | Sprint 524 sonrası Closure OS, UI/UX paralel yürütme, dogfood ve release-policy planına dönüşecek bulgu/kararları tek yerde toplamak |
| Authority | Yok; `docs/MASTER-PLAN.md`, repo-local core memory, owner admission ve terminal receipts authority olmaya devam eder |
| İş admission etkisi | Bu dosyaya madde eklenmesi backlog/root outcome doğurmaz |
| Değişiklik politikası | Yeni konuşma maddeleri önce buraya eklenir; owner kararı verilince canonical hedeflere kayıpsız taşınır |

Bu doküman canlı Sprint 524 task tanımlarını, `DIRECTIVES.md`'yi veya generated projection'ları değiştirmez. Buradaki sayısal snapshot'lar planning input'tur; settlement truth değildir.

## 2. Sorunun doğrulanmış çerçevesi

Deckent yaklaşık 20 günlük çalışma dönemine 233 iş olarak algılanan bir kapsamla başladı; bugün generated active view 491 ledger satırı, 429 active ve 62 terminal satır gösteriyor. Bu iki sayı doğrudan karşılaştırılabilir birer ürün-kapsamı ölçüsü değildir:

- 429 active satırın önemli bölümü root outcome değil; parent outcome'u üretilebilir ve doğrulanabilir parçalara ayıran nested child'lardır.
- Bazı yeni işler gerçek production-wiring, authority, security veya proof eksiklerinin geç bulunmasından doğmuştur.
- Born-and-closed işlerin aynı dönemin throughput'una katılması ilerlemeyi olduğundan yüksek gösterebilir.
- Yeni bulgunun doğrudan release backlog'una girmesi scope musluğunu açık bırakır.
- Doğrulamanın geç gelmesi aynı işi üçüncü ve dördüncü kez ele alma maliyeti üretir.

Dolayısıyla mevcut ledger hem gerçek risk keşfini hem de accounting genişlemesini aynı paydada topluyor. “Kaç iş kaldı?” ve “ne zaman biter?” soruları Level × Lane disposition yapılmadan yalnız raw row count ile güvenilir cevaplanamaz.

## 3. Closure OS kararları

### 3.1 Yeni payda: Committed Outcomes

Plan sağlığı aşağıdaki katmanlarla izlenecek:

| Level | Anlamı | Kapsam hesabına etkisi |
|---|---|---:|
| Outcome | Kullanıcı/ürün/operasyon açısından bağımsız kapanış değeri | `+1` |
| Package | Outcome'u production closure'a taşıyan admission birimi | Outcome altında |
| Task | Package execution parçası | Kapsamı büyütmez |
| Check/Proof | Test, xverify, receipt, binary veya recovery kanıtı | Kapsamı büyütmez |
| Finding | Yeni gözlem; henüz disposition verilmemiş | Otomatik backlog olmaz |

Lane, işin türünü; Level ise plan içindeki muhasebe seviyesini ifade eder. Level × Lane sınıflandırması canonical ledger satır kimliklerini topluca yeniden yazmadan önce generated side projection'da kurulmalıdır.

### 3.2 Admission kuralı

Her bulgu kaydedilir, ancak yalnız owner admission ile şu disposition'lardan birini alır:

- mevcut committed outcome altında child/proof;
- ayrı committed outcome;
- discovery;
- future/deferred;
- duplicate/superseded/disposed;
- typed `HOLD`.

Born finding'in kayda girmesi ile release scope'a girmesi aynı işlem olmayacaktır.

### 3.3 Closure package kontratı

Bir package aşağıdaki zinciri birlikte kapatır:

```text
canonical producer
  -> application service / consumer
  -> entrypoint veya protocol ingress
  -> policy/config enablement
  -> Desktop + Terminal adoption (uygunsa)
  -> persisted readback / resume
  -> real-process proof
  -> settlement receipt
```

Test-only import, fixture-local reimplementation, screenshot-only görünüm veya sentetik agent verdict'ü `DONE` için yeterli değildir.

### 3.4 B16 bootstrap düzeltmeleri

Fable değerlendirmesiyle uzlaşılan düzeltmeler:

1. Level × Lane önce generated side projection'da tutulacak; identity-definition toplu drift'i yaratılmayacak.
2. Planner/settlement motorunun riskli yeniden yazımı ilk 14 günlük bootstrap'a alınmayacak; önce DIRECTIVES/package convention ile gerçek kanıt toplanacak.
3. Priority adı mevcut `P00–P04` program kodlarıyla çakışmayacak; önerilen tier namespace'i `T00–T99` olacak. Exact mapping owner kararına tabidir.
4. Doğrulama plan öncesine ve ilk üretim geçişine yaklaştırılacak; “preventable third pass” ayrı KPI olacaktır.
5. İlk Closure Health/KPI projection'ı mevcut generated kaynaklardan script ile üretilecek; KPI takibi kendi başına manuel scope'a dönüşmeyecektir.

## 4. Hız, bitiş tahmini ve iki haftalık kapasite

### 4.1 Eski tahmin neden dondurulmalı?

Raw 429 satırı eşit büyüklükte iş kabul eden bir ETA veya adam-saat hesabı güvenilir değildir. Outcome, child, proof ve discovery birbirinden ayrılmadan verilen tek tarih yanıltıcı olur. Sprint 524 sonrası ilk iş, mevcut miktarı küçültmek değil, doğru paydayı üretmektir.

### 4.2 Kullanılacak hız metrikleri

| Metrik | Tanım | Neyi önler? |
|---|---|---|
| Mature Burn | Dönem başında committed olan outcome'lardan dönem içinde receipt ile kapananlar | Born-and-closed survivor bias |
| Born Rate | Dönem içinde bulunan finding ve owner-admitted yeni outcome'lar ayrı ayrı | Scope büyümesinin gizlenmesi |
| Net Scope Change | Admitted new outcomes eksi closed mature outcomes | “Çalıştıkça daha çok iş var” körlüğü |
| Verified Closure Throughput | Production-wired ve receipt'li kapanış / zaman | Sentetik DONE şişmesi |
| Preventable Third Pass | Geç contract/review nedeniyle üçüncü işleme dönen package oranı | Rework görünmezliği |
| WIP Age | Aktif package'ın admission'dan terminal receipt'e yaşı | Askıda paralellik |

### 4.3 İki haftalık hesap yöntemi

Sınıflandırma sonrasında iki ayrı kapasite hesaplanmalıdır:

```text
Gerekli verified execution hours/day
  = remaining committed weighted hours / kullanılabilir execution day

Gerekli owner hours/day
  = admission + karar + approval + review + settlement owner hours
    / kullanılabilir owner day
```

Agent/worker execution saati ile Alperen'in owner/decision saati aynı kapasite havuzunda gösterilmeyecektir. İlk yedi günlük Closure OS verisi sonrasında P50 ve P80 bitiş bandı üretilecek; tek nokta tarihi verilmemelidir.

İki haftada kapanış hedefi ancak şu üç koşul birlikte sağlanırsa admission almalıdır:

- committed outcome sınırı dondurulmuş;
- günlük verified closure kapasitesi P80 ihtiyacını karşılıyor;
- born finding'ler otomatik olarak aynı iki haftalık scope'a girmiyor.

## 5. UI/UX backend ile paralel, fakat bağımsız olmayacak

`d45360713` (`docs(product): persist desktop and terminal north star`) ürün yönünü kalıcılaştırdı; UI implementation'ını tamamlamadı. Mevcut Electron/React Desktop, classic/NOVA shell'leri, token pipeline, typed renderer client'ı, terminal RPC ve smoke test altyapısı paralel uygulamayı mümkün kılıyor. Risk, bu temelin ikinci bir runtime/state authority'ye dönüşmesidir.

### 5.1 Tek outcome, paralel lane'ler

| Lane | Sorumluluk | Başlama kapısı |
|---|---|---|
| Contract | Canonical state, command, schema, reason code, stable ID ve examples | İlk ve tek-yazarlı |
| Runtime | Application service, authority, persistence ve protocol ingress | Contract freeze |
| Desktop | Aynı canonical contract'ın Electron/React client'ı | Contract freeze |
| Terminal | Aynı canonical contract'ın terminal/TUI client'ı | Contract freeze |
| Proof | Cross-process parity, persistence, reconnect, a11y ve recovery | Lane join |

UI task'leri ayrı root outcome üretmez. Kullanıcıya dönük committed outcome'un `surface obligation` alanı `N/A`, `read-only`, `control` veya `full workflow` olarak açıkça disposition edilir.

### 5.2 Production closure kuralı

```text
Outcome DONE
  = runtime/service
  + protocol
  + Desktop consumer
  + Terminal consumer
  + same logical identity/provenance
  + persisted readback/resume
  + real binary/process proof
```

Contract fixture'ları paralel üretim için kullanılabilir; fixture-only veya mock-only UI staged artifact'tır ve production `DONE` sayılmaz.

### 5.3 Başlayabilecek, contract bekleyen ve bekletilecek UI işleri

| Durum | İşler |
|---|---|
| Staged başlayabilir | Golden Workflow state/interaction spec; semantic agent/run/approval durumları; tokens; accessibility/focus/loading/error recovery; presentational components |
| Contract freeze sonrası | Read-only Run Inspector; Conversation → Run; Provider Connections; Desktop ve Terminal parity |
| Authority closure sonrası | Start/approve/pause/resume gibi mutation yüzeyleri |
| Bekletilecek | MCP Hub — MCPV2/trust cutover sonrasına; full workspace layout — Desktop Reborn + Surface Contract sonrasına |

İlk güçlü UI dogfood adayı read-only Run Inspector'dır. Eksik cost, evidence veya MCP alanları fake data ile doldurulmaz; typed `unavailable` olarak gösterilir. Exact sıra B16 sonrası dependency frontier ile belirlenir.

### 5.4 Shared-file collision sınırı

Parallel worker'lar disjoint `filesWrite` scope kullanmalıdır. Aşağıdaki alanlar serial/single-owner chokepoint'tir:

- protocol/API contract types;
- `src/cli/helpers/messages.ts` i18n catalog;
- canonical design-token sources;
- Desktop entry/router ve shell selection;
- package/release metadata.

Backend service modülleri ile renderer component dosyaları contract freeze sonrasında paralel yürüyebilir.

## 6. Deckent'i kendi arayüzüne taşıma ladder'ı

| Aşama | Surface yetkisi | Promotion kanıtı |
|---|---|---|
| 0 — Contract/replay lab | Versioned fixtures, component ve interaction | A11y, state coverage; production claim yok |
| 1 — Live read-only | Run, worker, log, evidence observation | Real process, reconnect, monotonic state |
| 2 — Guarded preview | Plan/propose/inspect; reversible preview | Canonical reason codes ve preview parity |
| 3 — Protected control | Start/approve/pause/resume | ApprovalBroker, persistence, recovery, fallback |
| 4 — Primary Deckent dogfood | Deckent günlük geliştirmesi | Desktop ↔ Terminal aynı run continuity; `NATIVE-DEV-001` kanıtı |
| 5 — External product canary | Gelecekte tek non-critical ürün | NATIVE-DEV closure sonrası ayrı owner admission |

Deckent'i bitirip diğer ürünleri Deckent ile geliştirmek yön hedefidir; mevcut release scope değildir. Bu hedef kaybedilmeden `NATIVE-DEV-001` sonrasına adoption canary olarak bağlanacaktır.

UI hiçbir aşamada execution truth'u `localStorage` veya renderer-local state ile sahiplenmez; yalnız preferences gibi açıkça client-owned state lokal kalabilir. Desktop ve Terminal aynı runtime'ın client'larıdır.

## 7. UI + Closure OS KPI seti

| KPI/guardrail | Başlangıç hedefi |
|---|---:|
| UI task'lerinin committed package'a bağlılığı | `%100` |
| Yeni bağımsız UI root outcome | `0` |
| Bir package'tan uzun fixture/mock-only bekleyen slice | `0` |
| Duplicate Desktop/Terminal lifecycle authority | `0` |
| UI tarafından tahmin edilen cost/status/approval truth | `0` |
| User-facing hardcoded string | `0` |
| Preventable third pass | `0` yönü |
| Promote edilmiş workflow adımlarında aynı logical ID/provenance | `%100` |
| Keyboard/focus/error-recovery gate | Her promotion'da pass |

Ana ürün metriği ekran/component sayısı değil, Golden Workflow'un Desktop ve Terminal'de aynı canonical authority ile production-wired kapanan adım oranıdır.

## 8. Version ve changelog politikası

### 8.1 Owner kararı

- `1.0.0-beta` ürün konumlandırması iptal edilmiştir.
- Yeni version başlangıcı `0.100.0` olacaktır.
- `1.0.0`, yalnız beta dışı ürün olgunluğunu kanıtlayan ilerideki açık promotion gate ile verilecektir.
- Sprint 524 canlıyken package/version/changelog mutation yapılmayacaktır.

### 8.2 Geçişte doğrulanması gereken mevcut gerçek

- `package.json` ve `package-lock.json` şu anda `1.0.0-beta.1` taşır.
- Kök `CHANGELOG.md` kendisini canonical per-version release notes olarak tanımlar.
- `docs/CHANGELOG.md` sprint-level kayıtlar üretmektedir ve aktif Sprint 524 tarafından değiştirilmektedir.
- Release workflow, tag, package artifact ve iki changelog yüzeyinin writer/consumer rolleri geçiş package'ında yeniden doğrulanmalıdır.

### 8.3 Hedef changelog kontratı

Her version bump:

- gerçek shipped/verified delta'ya dayanır;
- canonical `Unreleased` alanından version section'a promotion ile taşınır;
- `Added`, `Changed`, `Fixed`, `Removed`, `Security` ve gerektiğinde `Breaking/Migration` anlamlarını doğru kullanır;
- package version, lockfile, tag, artifact ve release note arasında exact parity sağlar;
- otomatik sprint log'u ile kullanıcıya dönük release note'u birbirine karıştırmaz;
- eski release geçmişini sessizce yeniden yazmaz;
- empty veya yalnız task-listesi olan release note ile yayınlanamaz.

Version artış büyüklüğü takvim veya sprint numarasına göre değil, owner-approved release policy ve kullanıcıya yayımlanan değişiklik sınıfına göre belirlenecektir.

## 9. B16 öncesi kritik kapılar

UI veya Closure OS planı aşağıdaki sınırları bypass edemez:

1. Sprint 524/B15 truthful terminal settlement ve terminal receipt.
2. XVerify unlock'ın real host-binary smoke kanıtı veya dürüst typed `unavailable/HOLD` sonucu.
3. Sprint terminal olduktan sonra source/dist identity'nin owner-koordinasyonlu build/reconnect akışıyla uzlaştırılması.
4. Sprint worktree diff'i, branch ancestry ve landing kapsamının disk ground truth ile kontrolü.
5. MASTER ve generated projection digest/lint parity.
6. Owner'ın ekleyeceği kritik maddelerin `B16 blocker`, `B16 child` veya `post-B16` disposition'ı.
7. B16 için exact package, dependency frontier, shared-file owner'ları ve receipt authority.

B16'nın görevi Closure OS bootstrap'tır: classification projection, admission/tiering convention ve script-derived health ölçümü. B16, riskli planner-engine rewrite veya bağımsız büyük UI feature package ile şişirilmez. UI tarafı contract/component harness olarak staged ilerleyebilir; production promotion dependency-bound package'larda yapılır.

## 10. Sprint 524 sonrası önerilen karar ve uygulama sırası

1. Sprint 524 settlement truth'unu ve landing durumunu doğrula.
2. Bu working brief'e Alperen'in kalan maddelerini ekle.
3. Codex ve Fable ile bulgu/çelişki kontrolü yap; görüşleri authority değil review evidence olarak kaydet.
4. MASTER satırlarını Level × Lane için machine-suggested side projection'a çıkar.
5. Owner disposition/admission turunda outcome sınırı ve T-tier önerisini karara bağla.
6. B16 Closure OS Bootstrap package'ını exact scope, dependencies, filesWrite ve receipts ile admit et.
7. Yedi günlük gerçek Closure Health verisi topla; mature burn, born rate, WIP age ve third-pass oranını ölç.
8. İki haftalık P50/P80 ETA ve owner/worker kapasite ihtiyacını yeniden hesapla.
9. Sonraki capability package'larına Desktop + Terminal surface obligation'ı ekle.
10. Ayrı owner-approved release-governance package'ında `0.100.0` ve changelog cutover'ını uygula.

## 11. Karar kaydı

| Karar | Statü | Authority/not |
|---|---|---|
| Closure OS çalışma modeline geçiş | Kabul edildi; uygulama Sprint 524 sonrası | Alperen + Fable/Codex analiz uzlaşısı |
| Payda `Committed Outcomes` olacak | Kabul edildi | Owner yönü; exact schema B16'da |
| Finding otomatik release backlog olmaz | Kabul edildi | Owner admission gerekir |
| Level × Lane önce side projection | Kabul edildi | Fable düzeltmesiyle uzlaşıldı |
| Priority için `T00–T99` namespace | Öneri | Owner final mapping bekliyor |
| Planner/settlement motoru B16'ya alınmayacak | Kabul edilen bootstrap sınırı | Gerçek kanıt sonrası yeniden değerlendirilecek |
| UI/UX backend ile aynı outcome altında paralel yürür | Kabul edildi | Contract-first join barrier |
| Desktop ve Terminal aynı runtime'ın client'larıdır | Canonical product direction | North Star/Reconciliation |
| İlk UI dogfood adayı read-only Run Inspector | Aday | Dependency frontier sonrası admission |
| External product dogfood | Yön hedefi; mevcut scope değil | NATIVE-DEV sonrası canary |
| `1.0.0-beta` iptal, başlangıç `0.100.0` | Kabul edildi | Alperen, 2026-08-12 |
| Her version bump canonical changelog ile izlenir | Kabul edildi | Release package'ında uygulanacak |

## 12. Açık maddeler

Alperen'in ekleyeceği sonraki 1–2 madde bu bölüme kaydedilecek. Her madde için şu disposition tamamlanmalıdır:

```text
Bulgu/karar:
Neden önemli:
Mevcut evidence:
Level:
Lane:
Mevcut outcome'a bağlanacağı yer:
Admission statüsü:
B16 ilişkisi:
Owner kararı:
```

Henüz açık olan ana kararlar:

- B16 öncesindeki owner-critical maddelerin exact listesi ve sırası.
- İlk post-B16 closure outcome'u ve ona bağlanacak UI surface obligation.
- `T00–T99` exact tier anlamları ve migration yöntemi.
- İki haftalık hedefin 10 iş günü mü, 14 takvim günü mü olduğu; owner availability sınırı.
- `0.100.0` cutover'ının geçmiş tag/release truth ile exact migration ve yayın tarihi.

## 13. İncelenen canonical girdiler

- [`docs/MASTER-PLAN.md`](docs/MASTER-PLAN.md)
- [`docs/generated/master-plan-active.md`](docs/generated/master-plan-active.md)
- [`docs/design/DECKENT-DESKTOP-TERMINAL-NORTH-STAR.md`](docs/design/DECKENT-DESKTOP-TERMINAL-NORTH-STAR.md)
- [`docs/design/DECKENT-DESKTOP-TERMINAL-RECONCILIATION.md`](docs/design/DECKENT-DESKTOP-TERMINAL-RECONCILIATION.md)
- [`DIRECTIVES.md`](DIRECTIVES.md)
- [`.brain/exports/summary.md`](.brain/exports/summary.md) — generated evidence, policy authority değil
- [`CHANGELOG.md`](CHANGELOG.md)
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
- Commit `d453607136d35e9b7ffae8638f8ef073a8dd7c5a`

UI/UX referans araması generic dark/neon/glass “AI interface” yönünü önerdiği için negative control olarak kullanılmıştır; canonical `Precision Instrument` yönü korunur. Aramadan yalnız error recovery, asynchronous feedback, keyboard/focus, ARIA ve reduced-motion kalite girdileri alınmıştır.
