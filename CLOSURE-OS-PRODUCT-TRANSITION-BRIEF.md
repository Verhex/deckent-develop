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
3. Ayrı bir priority namespace'i açılmayacak; `T00–T99` önerisi reddedildi. Canonical `P0/P1/P2` korunacak ve yalnız açık satırlar owner-reviewed disposition turunda dürüst re-triage görecek; terminal satırlar değişmeyecek.
4. Doğrulama plan öncesine ve ilk üretim geçişine yaklaştırılacak; “preventable third pass” ayrı KPI olacaktır.
5. İlk Closure Health/KPI projection'ı mevcut generated kaynaklardan script ile üretilecek; KPI takibi kendi başına manuel scope'a dönüşmeyecektir.

### 3.5 Gate sistemi ürünün tamamını temsil edecek şekilde yeniden tasarlanacak

Owner adjudication (2026-08-12): Sprint 524'te üretilen generic `GATE_FAILURE`, ürün-geneli
settlement hükmü olarak geçerli değildir. Mevcut gate code-centric ve yüzeyseldir; scoped code
testindeki bir honesty-trigger ifadesini global ürün başarısızlığına yükseltirken Deckent'in gerçek
ürün kapsamını değerlendirmez. Sprint 524 terminal receipt'i owner tarafından `COMPLETE` kabul
edilmiştir; mevcut gate kaydı yalnız legacy/code-audit sinyali olarak korunur.

Deckent yalnız kod üreten bir developer tool değildir. Aynı ürün yüzeyi:

- bireysel asistan olarak araştırma, iletişim ve e-posta işlerini;
- pazar, rekabet, ürün ve veri analizini;
- sipariş, üretim, operasyon ve agentic süreç yönetimini;
- finansal analiz, nakit akışı ve kontrollü karar desteğini;
- solo geliştirici, team, şirket ve enterprise ölçeğini;
- milyonlarca kullanıcı, proje, tenant, dil ve environment'ı

aynı governance-by-construction altında taşımalıdır. Bu nedenle gelecek gate authority'si tek bir
`tsc + vitest + honesty-regex` sonucunu ürün hükmü sayamaz. Evrensel kernel; identity, authority,
scope, consent/approval, provenance, evidence, side-effect, persistence, recovery ve settlement
invariantlarını enforce eder. Task-kind/capability adapterları ise kendi domain kanıtlarını sağlar:

| Capability ailesi | Örnek acceptance evidence |
|---|---|
| Code/development | Build, test, static analysis, security, runtime wiring, cross-platform binary proof |
| Research/market | Kaynak authority, freshness, coverage, contradiction, methodology ve citation integrity |
| Communication/email | Principal, recipient, consent, content review, delivery receipt, privacy ve reversal/remediation |
| Order/operations | Authorization, idempotency, inventory/fulfillment reconciliation, exception ve audit trail |
| Finance/cash flow | Source ledger, period/currency/accounting basis, reconciliation, uncertainty ve approval separation |
| Enterprise agentic control | Tenant/RBAC, policy, segregation of duties, SLO, audit, retention ve reversible recovery |

Gelecek outcome generic `GATE_FAILURE` değil; hangi gate profile/criterion/authority'nin hangi
kanıtla doğrulandığını, refute edildiğini veya `HOLD` kaldığını açıklayan typed settlement olmalıdır.
Unknown veya desteklenmeyen capability code gate'e zorlanmaz; dürüst typed `HOLD` verir. Exact
yeniden tasarım ürünün mevcut closure hedefleri tamamlandıktan sonra, mevcut `EVALUATION-001`,
`GOAL-ACCEPTANCE-001`, `KERNEL-SETTLEMENT-001` ve `SPRINT-HONESTY-001` outcome'ları altında
disposition edilir; bu karar yeni root veya B16 scope'u doğurmaz.

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

### 4.4 Owner availability ve gece otonomi kontratı (13–26 Ağustos 2026)

Bu takvim Alperen'in projede yalnız karar vereceği anlamına gelmez; 10 iş günlük aktif execution
penceresidir. Agent/worker'lar admitted scope içinde üretim, doğrulama ve closure işlerini gün boyunca
yürütür. Owner availability yalnız admission, yön, approval, review ve settlement kararlarının servis
kapasitesidir; agent execution saatleriyle aynı havuzda sayılmaz.

| Zaman/sıklık | Owner servis kontratı |
|---|---|
| 08:00–00:00, Europe/Istanbul (`UTC+3`) | Telegram bildirimi sonrası normal beklenti 30 dakika; planlama/garanti SLA'sı 45 dakika |
| Karar batching | Dört saatte bir karar batch'i; konservatif planlama üst sınırı günde dört × 45 dakikalık owner penceresi |
| Hafta içi | Toplantı/acil durum istisnası dışında 45 dakikalık SLA |
| Hafta sonu | Müsaitlik değişken; erişilebilir olduğunda aynı 45 dakikalık SLA. 10 iş günü baseline kapasitesine zorunlu execution günü olarak eklenmez |
| 00:00–08:00, Europe/Istanbul (`UTC+3`) | Uyku/quiet hours; owner yanıtı beklenmez, önceden admitted otonom çalışma zorunludur |

Operasyon semantiği:

- 45 dakika bir **response SLA**'sıdır; timeout sonunda sessiz veya otomatik onay üretmez.
- Owner kararı bekleyen work item typed `owner_pending`/`HOLD` olur; bağımsız DAG lane'leri ve başka admitted package işleri ilerlemeye devam eder.
- Gece kuyruğu 00:00'dan önce dependency, filesWrite, budget, proof ve rollback sınırlarıyla hazırlanır; owner gate'i gerektirmeyen işler 00:00–08:00 arasında çalışır.
- Gece otonomisi yetki genişletmez: destructive işlem, external iletişim/yayın, credential/auth mutation, yeni scope admission veya karar gerektiren irreversible side effect fresh owner authority olmadan yapılmaz.
- Telegram teslimi başarısızsa karar verilmiş sayılmaz; notification delivery typed olarak kaydedilir ve karar bir sonraki owner penceresine taşınır.
- Bir karar bağımlılığının tüm filoyu boşta bırakmaması için scheduler, aynı closure outcome içindeki bağımsız lane'leri ve sonraki admitted, collision-free işleri hazır tutar.
- Toplantı/acil durum sapmaları actual owner-latency metriğine yazılır; plan bu istisnaları sahte SLA ihlali veya otomatik scope gerekçesi yapmaz.

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

## 10. Karara bağlanan uygulama sırası (mantık-karar turu, 2026-08-12)

Sol çapraz-analizi + owner onayıyla bağlanan sıra (önceki taslak sıranın yerine geçer):

1. Sprint 524 terminal receipt'inin disk-truth doğrulaması ve kabulü.
2. Zorunlu host-run canlı xverify smoke — geçemiyorsa dürüst typed `unavailable/HOLD` kaydı (kalan katman: codex reachability evidence-source).
3. Source/dist identity uzlaştırması — mevcut `BINARY_IDENTITY_WARN` + provider-observation HOLD'ları owner-koordinasyonlu build/reconnect akışıyla kapatılır.
4. Read-only Level × Lane side projection üretimi + owner disposition turu; aynı pencerede açık satırların dürüst P0/P1/P2 re-triage önerileri üretilir.
5. B16 Closure OS Bootstrap admission (exact scope, dependencies, filesWrite, receipts).
6. Repo temizliği ve migration — YENİ satır açılmaz; mevcut ledger satırları (`REPO-MIGRATION`, `REPO-CLEANUP-APPLY`, `DOCS-ARCHIVE`, `STATE-PRUNE`) G3/G5 gate'leriyle yürütülür; yeni repo geçişi son adımdır.
7. Yedi günlük gerçek Closure Health verisi sonrası P50/P80 ETA yayını; owner-onaylı müsaitlik takvimiyle kapasite hesabı.
8. Ayrı release-governance package'ında iki-adımlı `0.100.0` (tag'sız rebaseline commit → RELEASE-001 gate'leri kapanınca gerçek release).

İlk üç adımın owner-adjudicated durumu:

| Adım | Durum | Kanıt/yorum |
|---:|---|---|
| 1 | `COMPLETE` | 13/13 terminal receipt + tarball digest doğrulandı; legacy code-only `GATE_FAILURE` owner kararıyla ürün settlement hükmü değildir |
| 2 | `TYPED_HOLD_ACCEPTED` | Opus→Sol tier tabanı geçti; composition `xverify_candidate_evidence_unavailable` ile dürüst durdu; Fable→Sol tier düzeltmesi owner-approved implementation bekliyor |
| 3 | `PARTIAL` | Source/dist identity uzlaştı ve binary warning kayboldu; unresolved provider-observation kayıtları ayrı authority reconciliation olarak açık |

## 11. Karar kaydı

| Karar | Statü | Authority/not |
|---|---|---|
| Closure OS çalışma modeline geçiş | Kabul edildi; uygulama Sprint 524 sonrası | Alperen + Fable/Codex analiz uzlaşısı |
| Payda `Committed Outcomes` olacak | Kabul edildi | Owner yönü; exact schema B16'da |
| Finding otomatik release backlog olmaz | Kabul edildi | Owner admission gerekir |
| Level × Lane önce side projection | Kabul edildi | Fable düzeltmesiyle uzlaşıldı |
| Priority için `T00–T99` namespace | REDDEDİLDİ (2026-08-12) | Çift numaralandırma gereksiz; P0/P1/P2 canonical kalır + dürüst re-triage (aşağıda) |
| Planner/settlement motoru B16'ya alınmayacak | Kabul edilen bootstrap sınırı | Gerçek kanıt sonrası yeniden değerlendirilecek |
| UI/UX backend ile aynı outcome altında paralel yürür | Kabul edildi | Contract-first join barrier |
| Desktop ve Terminal aynı runtime'ın client'larıdır | Canonical product direction | North Star/Reconciliation |
| İlk UI dogfood adayı read-only Run Inspector | Aday | Dependency frontier sonrası admission |
| External product dogfood | Yön hedefi; mevcut scope değil | NATIVE-DEV sonrası canary |
| `1.0.0-beta` iptal, başlangıç `0.100.0` | Kabul edildi | Alperen, 2026-08-12 |
| Her version bump canonical changelog ile izlenir | Kabul edildi | Release package'ında uygulanacak |
| **Mantık-karar turu (2026-08-12; sol çapraz-analizi + owner onayı):** | | |
| Priority ekseni: P0/P1/P2 canonical kalır; dürüst re-triage yapılır | Kabul edildi | "Her şey P0 olamaz" — açık satırlarda şeffaf yeniden dağıtım; terminal satır priority'sine dokunulmaz; öneri üretimi §10 adım-4 disposition turunda |
| Born satırları YERİNDE kalır; ayrım generated `Born View` projection'da | Kabul edildi | Fiziksel taşıma = shadow-ledger/deletion (validator); terfi = imzalı disposition geçişi veya linked outcome, satır taşıma değil |
| Sınıflandırma authority: sidecar karar-defteri | Kabul edildi | Projection non-authoritative; owner disposition/terfi kararları append-only versioned sidecar'a (receipt'li) yazılır; projection her üretimde defteri uygular; exact şema B16-öncesi projection işinde |
| B16-öncesi sıra: sol sırası (§10) | Kabul edildi | Receipt → canlı xverify smoke/HOLD → identity uzlaşı → projection+disposition → B16 → mevcut ledger satırlarıyla temizlik/migration |
| İlk post-B16 outcome: Run Observation, `RUN-INSPECTOR-001` üzerinden | Kabul edildi | Yeni satır açılmaz; ilk paket = inspector read-model genişletme + Desktop `sprint-live-service` emekliliği (status split-brain kapanışı); Desktop+Terminal read-only surface obligation |
| Kapasite: 10 iş günü + owner-onaylı müsaitlik takvimi | Kabul edildi | ≤2h/gün varsayımı atıldı; owner takvim beyan eder, plan ona kurulur; P50/P80 ancak 7 günlük gerçek kuyruk/servis verisiyle |
| `0.100.0` iki adım: tag'sız rebaseline + gate'li release | Kabul edildi | Adım-1 yalnız version+changelog commit'i (yeni repoda, TAG YOK); adım-2 RELEASE-001 gate'leri kapanınca ayrı release package |
| Publish authority: owner-manual CANONICAL | Kabul edildi | `release.yml`'den npm-publish adımı kaldırılacak (workflow yalnız build+validate+release-notes); npm publish daima Alperen elle — çifte-authority çatışması kapandı |
| `gpt-5.6-sol` model tier'ı `premium_plus` olacak | Kabul edildi | Owner, 2026-08-12; global model registry amendment olarak uygulanacak, hardcoded xverify bypass yapılmayacak |
| Sprint 524 generic `GATE_FAILURE` ürün settlement hükmü değildir | Kabul edildi | Owner adjudication: code-centric legacy signal; 524 receipt `COMPLETE` kabul edildi |
| Gate authority Deckent'in çok-domain ürün kapsamına göre baştan tasarlanacak | Kabul edildi, ileriki closure | Code-only gate değil; task-kind/capability evidence adapterları + universal governance kernel; önce mevcut ürün closure hedefleri |
| Sidecar karar-defteri revizyon 2 kontratı | Kabul edildi | Owner, 2026-08-12; `docs/governance/closure-dispositions.jsonl`, typed event/authority proof/external anchor/append-only gate (§12.1) |
| 13–26 Ağustos owner karar-servis kontratı | Kabul edildi | 08:00–00:00 UTC+3, Telegram sonrası 45 dk garanti SLA, dört saatlik batch cadence; 00:00–08:00 otonom execution zorunlu (§4.4) |

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

Mantık-karar turu (2026-08-12) önceki beş açık maddenin TAMAMINI karara bağladı (bkz. §11).
Kalan açık maddeler:

- `release.yml` npm-publish adımının kaldırılması — RELEASE-001 kapsamında; 0.100.0 adım-1'inden önce yapılmalı.
- Codex reachability evidence-source (xverify son katmanı) — §10 adım-2'nin canlı smoke'unu mümkün kılar; yoksa typed HOLD. **2026-08-12 canlı smoke kaydı:** `xv-1786534081751` — Opus→Sol tier-taban geçti, kompozisyon dürüst typed HOLD: `xverify_candidate_evidence_unavailable`. `xv-1786534007938` Fable→Sol tier çelişkisini kanıtladı; owner `gpt-5.6-sol → premium_plus` registry amendment'ını onayladı. Source değişikliği ve yeni smoke henüz uygulanmadı.

### 12.1 Sidecar karar-defteri kontratı — revizyon 2 (owner-approved, 2026-08-12)

Kabul edilen "sidecar karar-defteri" kararının exact kontratı — §10 adım-4 projection işi bu
kontratı eksiksiz uygular; daha zayıf bir şema canonical sayılamaz:

- **Konum:** `docs/governance/closure-dispositions.jsonl` — repo-tracked, append-only; geçmiş event satırı silinmez veya değiştirilmez. Düzeltme yeni `supersede/revoke` event'iyle yapılır.
- **Authority ayrımı:** MASTER work identity/state ledger'ının authority'sidir. Sidecar Level×Lane, born disposition, admission ve priority-decision authority'sidir. Generated Active/Born/Closure Health view'ları non-authoritative projection'dır.
- **Typed event şeması (v1):** `{schemaVersion, seq, eventId, recordedAt, rowRef, decision, authorityProof, evidenceRefs, supersedesSeq?, previousEventDigest, eventDigest}`. `rowRef`, `workId + rowDefinitionDigest + masterSourceDigest` taşır. `decision`, kind'a göre typed union'dır; belirsiz genel `from/to` çifti değildir.
- **Decision kind'ları:** `level-lane-disposition`, `priority-retriage`, `born-promotion`, `admission`, `supersede`, `revoke`. Level, Lane, priority ve admission-state enum'ları tek schema registry'den gelir.
- **Owner authority proof:** salt `actor` string'i yeterli değildir. Her event authenticated owner decision receipt/signature referansı taşır; reviewed batch commit-bound settlement receipt ile kapanır. İmza/receipt authority unavailable ise event canonical promotion yapamaz ve typed `HOLD` kalır.
- **Hash zinciri:** canonical JSON encoding version ve digest algorithm şemada sabittir. Her event önceki digest'i bağlar; her reviewed batch'in head digest'i repo dışı/externally anchored evidence snapshot veya mevcut Git trust authority'ye receipt ile bağlanır. Salt dosya-içi `prevDigest`, bütün dosyanın yeniden yazılmasına karşı yeterli sayılmaz.
- **Projection semantiği:** producer eventleri `seq` sırasında uygular. Bilinmeyen row, definition/source digest drift'i, sequence gap, kırık chain, authority-proof eksikliği veya çakışan active decision ilgili satırı typed `HOLD` yapar; sessiz atlama/fallback yoktur.
- **Priority uygulaması:** yalnız açık satırlar owner-reviewed batch ile MASTER Priority kolonuna taşınır; terminal satırlara dokunulmaz. Commit ve settlement receipt uygulanan exact `seq` aralığını ve head digest'i taşır.
- **Makine-gate:** `scripts/lint-closure-dispositions.mjs`; schema/enum, canonical digest, chain, row/source identity, authority proof, active-decision conflict ve merge-base'e göre byte-prefix append-only diff'i doğrular. Bypass/unknown environment açık typed HOLD verir.

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
