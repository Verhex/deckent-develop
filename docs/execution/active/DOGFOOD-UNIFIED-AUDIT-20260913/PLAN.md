# Birleşik dogfood audit planı

Owner canlı talimatıyla hazırlanıp aynı turda kaynak analizi yürütüldü. Bu paket çözüm uygulaması değildir. Önceki cross-surface plan, R1 kanıtları ve752 canary korunur. İş SSOT'u MASTER; audit bulgusu otomatik admission/DONE üretmez.

## Soru

Deckent bir kullanıcı/enterprise isteğini tüm girişlerinde doğru yetkiyle kabul edip gerçek worker'a verebiliyor, Brain/Auditor/Nervous ile izleyebiliyor, sonuç/effect/verification/settlement'ı kalıcı bağlayabiliyor ve bütün yüzeylerde aynı anlamla sunabiliyor mu? Çalışmayan halkaların ilk kullanıcı etkisi ve bağımlılık sırası nedir?

## Tek inceleme zinciri

1. Kimlik ve yerleşim: tenant/principal/project/checkout/runtime-root/config/backend.
2. Intake: CLI,Terminal,Desktop,API,MCP,Goal/Mission/Autonomous/Process,connectors/extensions.
3. Plan: structured/AI ayrımı, scope, verification, schema, approval ve exact snapshot.
4. Admission/dispatch: provider kapasitesi, image/native authority, task/persona/skill doğumu.
5. Yürütme: worker ownership, heartbeat, bounded concurrency, output/effect ve cancellation.
6. Supervision: Brain,Auditor,Nervous; detect→decision→action→evidence.
7. Terminality: result/effect/verification/settlement/archive/recovery, restart ve idempotency.
8. Projection: status/read-model/API/SSE/Terminal/Desktop/Dashboard, stale/offline/unknown.
9. Enterprise: authorization, isolation, audit/retention, usage, policy revision, ölçek ve platform matrisi.

Her aşama aynı invocation/attempt kimliğine bağlanır. Yüzey başına ayrı doğruluk tanımı kurulmaz.

## Yöntem ve teslimler

- Mevcut6568-dosyalık önceki envanter yeniden alınır; her tracked dosya tek primary domaine ayrılır. Bu sayı içerik denetimi sayısı değildir.
- Bağlantılar producer→durable state→consumer→ingress→policy olarak kaynakta izlenir. Direkt arama ve callback registration birlikte incelenir; yorum authority değildir.
- Canlı mevcut752 ve751 kanıtları tekrar run açılmadan kullanılır. Çelişen eski raporlar silinmez; güncel sonucun neden farklı olduğu açıklanır.
- Bulgu: kimlik, sınıf, güven, kullanıcı etkisi, exact source, mevcut kanıt, bilinmeyen, çözüm yönü ve kapanış testi.
- Bu aşamada test/build/run/provider çağrısı, raw DB/secret okuma, cleanup veya ürün kodu mutation yok. Yalnız rapor ve envanter yazımı.
- REPORT.md birleşik sonuç; MANIFEST.json kaynak/evidence hashleri ve UTC; INVENTORY.jsonl domain ve review coverage. Önceki kanıt hashleri manifestte korunur.

## Kapsam dürüstlüğü

Bu tur static source/previous-runtime evidence audit'idir; bütün6568 dosyanın satır satır incelendiği veya bütün platformlarda canlı test yapıldığı iddia edilmez. Connectors/enterprise DB işlemleri, uzak worker, native Desktop ve platform failover canlı hücreleri explicit UNKNOWN kalır. Sonraki verification programı raporda tanımlanır; mock veya route varlığı live success değildir.

## Audit sonrası karar

Önce birleşik bulgular gözden geçirilir. Sonra tek bounded paket: start/exact admission ve erken lifecycle yayınını düzelt; image/config prerequisites'i koru; tek worker doğum canary. Performans/event-loop ve cross-surface proof ona bağımlı izlenir. Yeni mega-refactor, timeout artışı, authority bypass veya bütün açıkları tek sprintte çözme yok.
