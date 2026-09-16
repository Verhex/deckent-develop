---
title: "What Is Deckent?"
document_type: living-reference
language: tr
status: active
last_updated: 2026-08-23
updated_by: "OpenAI Codex (GPT-5)"
---

# What Is Deckent?

> Bu belge, Deckent'i ve Deckent geliştirme işinin anlamını ADR analizleri boyunca aynı
> zeminde tutan yaşayan çalışma referansıdır. Bir ADR, policy veya yeni authority değildir.
> Çelişkide repository'nin canonical identity, vision, operating policy, source code ve
> `.brain/memory.db` authority zinciri kazanır.

## 1. Belgenin amacı

Deckent kararları aynı anda iki dünyada sonuç üretir:

1. Deckent'in kendi geliştirme süreci ve dogfooding kalitesi.
2. Deckent'i kendi workspace'inde kullanan gerçek kullanıcının ürün deneyimi.

Bu belge, tek tek ADR'leri analiz ederken bu iki lensin birbirine karışmasını veya birinin
diğerinin yerine geçmesini önlemek için tutulur. Buradaki amaç mevcut ADR'leri peşinen onaylamak,
değiştirmek ya da kapatmak değil; kararların değerlendirileceği ürün ve mühendislik modelini açık
hale getirmektir.

## 2. Deckent nedir?

Deckent; insan ve AI agent'ların yaptığı işi planlayan, yürüten, yöneten, kanıtlayan, hatırlayan ve
zamanla öğrenen **provider-neutral, local-first bir Agent OS ve AI runtime ekosistemidir**.

Deckent yalnızca bir coding agent, CLI wrapper, model router, dashboard veya sprint aracı değildir.
Execution, governance, memory, learning, evidence ve control plane katmanlarını tek bir governed
work sistemi altında birleştirir.

Canonical work authority zinciri şudur:

```text
Goal → Mission → Flow → Run → WorkItem → Attempt → Operation
```

Bu zincirin anlamı:

- **Goal:** Ulaşılmak istenen kalıcı sonuç.
- **Mission:** Goal'e hizmet eden bounded amaç ve sorumluluk alanı.
- **Flow:** İşin dependency, policy ve control noktalarıyla tanımlanmış yürütme grafiği.
- **Run:** Bir Flow'un belirli config, authority ve plan snapshot'ıyla başlatılmış icrası.
- **WorkItem:** Run içinde sonuç üreten atomik iş birimi.
- **Attempt:** Bir WorkItem'ın belirli agent/provider/context ile denenmesi.
- **Operation:** Dış dünyada etkisi veya kanıtı bulunan en alt yürütme eylemi.

Bu model yalnız software development için değildir. Yeni ürün geliştirme, bakım, günlük bilgi işi,
business sistemleri ve enterprise operasyonları aynı governed-work kernel'i üzerinde
çalışabilmelidir.

## 3. Ürün kimliğinin temel ilkeleri

### 3.1 Provider-neutral

Hiçbir provider veya model Deckent'in ürün kimliği değildir. Provider/model seçimi; effective
config, model registry, role policy, auth/account durumu, reachability, entitlement, usage/limit,
budget ve capability evidence birlikte çözülerek yapılır. Sessiz fallback veya instruction
metninden provider dayatılması doğru mimari değildir.

### 3.2 Local-first

Workspace state'i, memory, evidence ve artifacts yerel authority altında çalışabilir. Deckent'in
temel ürününün kullanılabilmesi için zorunlu Deckent cloud bağımlılığı bulunmaz. Cloud ve
Enterprise katmanları Core'u tamamlayabilir; Core'un bağımsızlığını ortadan kaldıramaz.

### 3.3 Governed execution

Authority, approval, capability, isolation, scope, budget, recovery ve settlement sonradan eklenen
kontroller değildir; yürütmenin parçasıdır. Sistem yalnızca bir sonucun üretilip üretilmediğini
değil, kimin hangi yetkiyle, hangi exact plan üzerinden ve hangi sınırlar içinde ürettiğini de
bilmelidir.

### 3.4 Evidence-backed completion

Bir worker'ın `DONE` demesi, bir testin yeşil olması veya bir dosyanın diskte görünmesi tek başına
completion değildir. Güvenilir kapanış; producer, consumer, ingress, policy, runtime enforcement,
disk attribution, evaluation, audit/gate, receipt ve terminal settlement zincirinin bağlanmasını
gerektirir.

### 3.5 Multi-surface, single authority

Terminal ve Desktop primary control/operator yüzeyleridir. CLI, API, MCP, autonomous/process ve
connector yüzeyleri aynı application-service authority'nin adapter'ları olmalıdır. Dashboard ise
bir karar authority'si değil, observability projection'ıdır.

Semantic parity her yüzeyin byte-identical veya aynı UX'e sahip olması demek değildir. Aynı iş
semantiği ve policy contract'ı korunurken her yüzey kendi ortamına uygun interaction modeli
sunabilir.

### 3.6 Her ölçekte ve her ortamda çalışma

Deckent; solo/basic kullanıcıdan dünyanın en büyük enterprise organizasyonlarına, tek projeden
milyonlarca project/tenant'a ve macOS, Linux, Windows native, WSL ile gelecekteki platformlara
kadar düşünülür. Platform farkları adapter arkasında çözülür; desteklenmeyen ortam dürüst ve typed
biçimde fail eder.

## 4. Assistant · Worker · Platform

Deckent üç tamamlayıcı deneyim üzerinden okunabilir:

- **Assistant:** Kullanıcının niyetini, context'ini, tercihlerini ve karar noktalarını anlayan
  etkileşim katmanı.
- **Worker:** Bounded scope ve capability içinde gerçek işi yapan execution katmanı.
- **Platform:** Authority, routing, policy, evidence, memory, learning, recovery ve lifecycle'ı
  yöneten sistem katmanı.

Bunlar üç ayrı ürün veya birbirinden kopuk runtime değildir. Aynı kernel, policy, evidence ve
learning contract'larının farklı rolleridir.

## 5. İki zorunlu lens

Her Deckent kararı aşağıdaki iki lens altında ayrı ayrı analiz edilir:

| Boyut | Dogfood / development lensi | Product / user lensi |
|---|---|---|
| Ana soru | Deckent kendi geliştirmesini daha güvenli, deterministik ve kanıtlanabilir yürütüyor mu? | Kullanıcının işini daha az cognitive load, daha fazla kontrol ve daha güvenilir sonuçla tamamlıyor mu? |
| Ortam | Deckent repository'si gerçek bir workspace/tenant gibi kullanılır. | Her dil, project, provider, platform ve organizasyon ölçeğindeki kullanıcı workspace'i. |
| Başarı kanıtı | Gerçek dirty worktree, concurrency, provider, approval, recovery ve settlement baskısı altında çalışması. | Kurulumdan terminal sonuca kadar anlaşılır, güvenli, portable ve dürüst ürün davranışı. |
| Başlıca risk | Repo-specific operasyon kuralını genel ürün contract'ı sanmak. | Güzel UX uğruna governance, authority veya evidence zincirini bypass etmek. |
| Kararın sınırı | Contributor/development seam'leri ürün özelliği gibi dışarı sızmamalı. | User-facing davranış Core invariant'larını zayıflatmamalı. |

Dogfooding Deckent'in ürün kimliği değildir; ürünün en yüksek basınçlı proving ground'udur. İyi bir
dogfood deneyimi tek başına user value kanıtlamaz. Benzer şekilde iyi görünen bir user surface,
gerçek governance/evidence/recovery contract'larını çalıştırmıyorsa Deckent açısından tamamlanmış
sayılmaz.

## 6. Deckent'i geliştirmek ne demektir?

Deckent geliştirmek yalnızca module eklemek, API yazmak, bir UI ekranı oluşturmak veya unit test'i
yeşile çevirmek değildir. Bir capability'nin production'da gerçek olması için aşağıdaki zincirin
kapanması gerekir:

```text
canonical producer
  → consumer
  → entrypoint / ingress
  → policy ve config enablement
  → runtime enforcement
  → evidence
  → terminal settlement
```

Bu nedenle Deckent geliştirme işi:

- canonical authority'yi belirler ve duplicate authority üretmez;
- capability'yi gerçek consumer ve surface'lere bağlar;
- effective config ve policy davranışını açıkça tanımlar;
- user-facing metni i18n sistemi üzerinden verir;
- cross-platform path, process, filesystem ve terminal farklarını adapter'larla çözer;
- provider/model bağımlılığını capability evidence arkasında tutar;
- isolation, approval, budget ve recovery failure path'lerini tasarlar;
- gerçek-binary ve production-wiring kanıtını üretir;
- sonuç ile evidence, routing, promotion ve learning trace arasındaki döngüyü kapatır.

Test-only import, fixture içinde yeniden uygulanmış logic veya consumer'ı olmayan yeni bir core
type, tek başına tamamlanmış capability değildir.

## 7. Core ve Enterprise ilişkisi

MIT Core eksiksiz, secure, local-first ve standalone bir ürün olarak kalmalıdır. Enterprise;
organizasyon ölçekli governance, operations, assurance ve yönetim yetenekleri ekleyebilir, fakat
Core'un public contract'larını tüketmelidir.

Enterprise katmanı:

- Core'u fork etmez;
- ikinci scheduler, policy engine veya evidence authority kurmaz;
- Core kullanıcılarının temel güvenlik ve çalışma yeteneklerini yapay biçimde eksiltmez;
- organization-scale ihtiyaçları additive ve ayrı lisanslanabilir katmanlarla karşılar.

Bu ayrım ADR analizinde özellikle önemlidir: “Enterprise ihtiyacı” duplicate kernel veya Core'da
bilinçli eksiklik gerekçesi olamaz.

## 8. Target architecture ile bugünkü implementation gerçeği

Canonical `Goal → … → Operation` modeli ürünün hedef authority zinciridir. Ancak bugünkü source
tek normalize edilmiş graph'a tamamen yakınsamış değildir. Mevcut runtime'da tarihsel ve kısmen
örtüşen yapılar bulunur:

- Mission/WorkItem SQLite store,
- event-sourced RunFlow state machine,
- Sprint/Task lifecycle,
- invocation ve task settlement receipts,
- henüz her yerde canonical olmayan Operation authority.

RunFlow; proposal, preview, approval, exact content-addressed plan snapshot, CAS revision, start,
running ve terminal state akışını taşır. Sprint engine; planning, scope/admission gates,
spawn/execute/evaluate/fix, typed pause/HOLD, RETRO/DECAY ve terminal receipt adımlarını uygular.

Bununla birlikte aşağıdaki alanlarda ADR bazında source ve live proof kontrolü gerekir:

- canonical work model consumer adoption'ı;
- bütün surface'lerin aynı application-service authority'ye yakınsaması;
- approval ve capability enforcement'ın tüm ingress'lerde eşit sertlikte olması;
- RBAC ve scope kurallarının type/lint/advisory seviyesinden runtime-hard seviyeye geçişi;
- Operation authority ve end-to-end evidence graph'ının normalization'ı;
- provider ve platform kombinasyonları için gerçek parity kanıtı.

Bir ADR'nin hedef mimariyi doğru tarif etmesi, o hedefin bugün production-wired olduğu anlamına
gelmez. Her analizde “karar doğru mu?” ve “karar gerçekten uygulanmış mı?” ayrı sorulardır.

## 9. ADR authority ve sınıflandırma modeli

ADR'lerin canonical SSOT'u `.brain/memory.db` içindeki ADR kayıtlarıdır. `docs/adr/` ve generated
exports projection'dır; kanıt ve erişim kolaylığı sağlarlar fakat DB authority'sinin yerine
geçmezler.

ADR sınıfları:

- **G — Global:** Deckent'in publisher-controlled global/product invariant'ları.
- **D — Development:** Deckent contributor ve repository dogfood/development kararları.
- **UG — User Global:** Kullanıcının bütün workspace'leri için tanımladığı sıkılaştırmalar.
- **UP — User Project:** Belirli bir project için tanımlanan kullanıcı kararları.

Genel precedence modeli `G > U > D` olarak okunur. User kararları global invariant'ları
gevşetemez; yalnız izin verilen alanda sıkılaştırabilir. Development kararları da repo operasyonunu
ürün constitution'ının üstüne çıkaramaz.

### 2026-08-23 projection gözlemi

Salt-okunur snapshot'ta `.brain/memory.db` içinde 52 accepted ADR görülürken `docs/adr/` index ve
top-level dosya projection'ında 51 ADR görüldü. `ADR-G-040` DB/export tarafında bulunurken
`docs/adr/` altında karşılık gelen projection dosyası bulunmadı.

Bu bir closure, kayıp veri veya otomatik düzeltme iddiası değildir. Yalnız ADR analiz setinin docs
dizininden değil canonical DB'den türetilmesi gerektiğini gösteren tarihli bir observation'dır.
Sayılar gelecekte değişebileceği için invariant olarak kullanılmamalıdır.

## 10. Tekil ADR analiz protokolü

Her ADR aşağıdaki sırayla incelenir:

1. **Identity:** Kararın gerçek intent'i ve koruduğu invariant nedir?
2. **Class ve authority:** G/D/UG/UP sınıfı doğru mu; kararın değiştirebileceği alan nedir?
3. **Dogfood etkisi:** Deckent development execution'ını nasıl iyileştiriyor veya sınırlıyor?
4. **User etkisi:** Gerçek kullanıcıya hangi value, maliyet, risk ve cognitive load'u getiriyor?
5. **Scale/environment:** Solo → enterprise ve Every Environment matrisinde davranışı nedir?
6. **Today/Tomorrow:** ADR yazıldığı tarihteki “Today” iddiası güncel source ile hâlâ doğru mu?
7. **Code presence:** Type, service, store, adapter ve surface karşılığı gerçekten var mı?
8. **Production wiring:** Producer → consumer → ingress → policy/config zinciri kapalı mı?
9. **Enforcement:** Prose, type, lint, test, runtime-hard veya advisory seviyelerinden hangisinde?
10. **Evidence:** Real-binary, disk attribution, receipt ve terminal settlement kanıtı var mı?
11. **Relations:** Başka ADR'lerle conflict, overlap, amendment veya supersession ilişkisi nedir?
12. **Disposition önerisi:** Keep, clarify, amend, merge, supersede veya retire seçeneklerinden
    hangisi kanıtla destekleniyor?

Analiz hiçbir ADR'yi kendiliğinden mutate etmez. Disposition önerisi ile canonical ADR/ledger
değişikliği farklı authority ve işlemlerdir.

## 11. Analizde kullanılacak kanıt sırası

Bir ADR'nin kendi metni, kendi uygulanmışlığının tek kanıtı değildir. İnceleme aşağıdaki kaynakları
birbirine karşı doğrular:

1. Canlı owner talimatı ve immutable laws.
2. [Workspace identity](../.deckent/workspace/IDENTITY.md) ve
   [Türkçe vision](tr/vision.md).
3. [Deckent-dev operating policy](governance/deckent-dev-operating-policy.md).
4. Canonical ADR kaydı: `.brain/memory.db`.
5. Current source, config, migrations ve public contracts.
6. Tests, lint/gates ve real-binary runtime evidence.
7. Docs ve generated projections.

Özellikle tarihli “Today” anlatıları current source, tests ve live evidence ile yeniden ölçülür.
Accepted statüsü, implementation'ın eksiksiz veya güncel olduğu anlamına gelmez.

## 12. Bu belgenin güncellenme contract'ı

Her güncellemede:

- front matter içindeki `last_updated` ve `updated_by` alanları değiştirilir;
- aşağıdaki history tablosuna yeni satır eklenir, eski satırlar korunur;
- yeni iddialar canonical docs ve current source ile doğrulanır;
- geçici snapshot bulguları tarihli observation olarak yazılır;
- bu belge üzerinden yeni product policy veya ADR authority üretilmez;
- target architecture ile current implementation birbirine karıştırılmaz.

## Update history

| Tarih | Güncelleyen model | Değişiklik |
|---|---|---|
| 2026-08-23 | OpenAI Codex (GPT-5) | İlk sürüm: ürün kimliği, development anlamı, dual-lens model, implementation gerçeği ve ADR analiz protokolü kaydedildi. |
