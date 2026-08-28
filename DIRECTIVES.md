# MASTER 6181 DİLİM-2: KAYNAK-ÇEKME · OLAY-GEÇMİŞİ · TÜRKÇE ALARM · WATCH SERVİSİ

> Kaynak: `docs/governance/lane-briefs/competitive-intelligence-watch-2026-08-27.md` (owner-ADMIT
> 2026-08-27), lane-brief Task 2. Dilim-1 (baseline karşılaştırma çekirdeği) landed — `types.ts`,
> `baseline-catalog.ts`, `baseline.ts`, `competitor-universe.ts`, `terminology.ts`, `comparison.ts`,
> `significance-gate.ts`, `alarm-prompt.ts` mevcut ve bu dilim onların üstüne kurulur.
> Goal-v2 zamanlama, `deckent intelligence` CLI ve EN/TR docs DİLİM-3'tür; burada YAZILMAZ.

## Goal

Rakip sinyalini resmi kaynaklardan çeken, tarihsel olarak dedup eden, Türkçe kompakt alarm
üreten ve bunu dayanıklı bir kutuya yazan servis katmanını kur. Ağ erişimi enjekte edilebilir
bir `fetch` üzerinden olur; hiçbir test gerçek ağa çıkmaz.

Ürün karşılığı: bugün "rakip X şunu duyurdu" haberi geldiğinde onu Deckent'in kendi kanıt-bağlı
cetveline karşı tartan, aynı olayı ikinci kez alarma dönüştürmeyen ve çökme sonrası tekrar
göndermeyen bir yol yok. Bu dilim o yolu kurar.

## Execution contract

- Kalite barı aynen: i18n-FIRST · 0-hardcode (eşik/timeout/retry sayıları named export sabit veya
  parametre; kod-yolunda çıplak literal yok) · hermetik test (tmpdir, enjekte edilmiş fetch/saat,
  gerçek ağ ve gerçek `spawnSync` YOK) · mevcut-pattern.
- **Mevcut yüzeyleri yeniden İCAT ETME:** dayanıklı kutu `enqueueOwnerNotification`
  (`src/connectors/notification-delivery.ts`, stable-id parametresi `input.id` ile destekleniyor,
  `.deckent/runtime/owner-notifications.jsonl`); olay geçmişi `MemoryStore`'un `'custom'` entry
  tipi (`src/core/memory-types.ts`) — YENİ DB veya yeni dosya-formatı açılmaz.
- Test komutları TASK-SCOPED ve TEKİL.
- `src/intelligence/` dışına yalnız Task 4 dokunur ve orada da yalnız mevcut outbox fonksiyonunu
  çağırır; `notification-delivery.ts` DEĞİŞTİRİLMEZ.
- Gizlilik: hiçbir kayıt ham HTTP gövdesi, header veya credential taşımaz — bayt-sayısı ve
  `framedOutputDigest` (`src/core/output-digest.ts`) ile tarif edilir.

## Task 1: Resmi-kaynak çekme — typed kalite sözleşmesi ve sınırlı yeniden-deneme
- Files: src/intelligence/source-retrieval.ts, tests/intelligence/source-retrieval.test.ts
- Reads: src/intelligence/types.ts, src/core/output-digest.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/source-retrieval.test.ts
### Description
Kaynak önceliğini typed bir sözleşmeye çevir: `official-repo` · `official-release` ·
`official-docs` · `official-announcement` · `benchmark` — kapalı sözlük, sıralama veri olarak
tanımlı, koda gömülü sihirli sayı yok. Çekme yalnız ENJEKTE EDİLMİŞ bir `fetch` üzerinden olur
(imza parametre; üretimde `globalThis.fetch`, testte sahte). Sınırlı timeout + sınırlı
yeniden-deneme (sayılar named sabit); koşullu çekim durumu (ETag/Last-Modified) taşınır ve
değişmemiş kaynak `unchanged` döner. Ayrıştırma: GitHub release JSON, genel JSON feed ve Atom;
HTML'den yalnız güvenli metadata (başlık/tarih/kanonik link) — HTML gövdesi asla saklanmaz.
**Kısmi başarısızlık bütün koşuyu düşürmez:** her kaynak kendi typed sonucunu taşır
(`ok` | `unchanged` | `hold`), ama kanıt yetersizse sonuç typed `hold`'dur — uydurma boşluk yok.
Her sonuç bayt-sayısı ve `framedOutputDigest` ile tarif edilir; ham gövde tutulmaz.
Test: kaynak-önceliği sıralaması, sahte-fetch ile başarı/unchanged/hold yolları, timeout ve
yeniden-deneme sınırının aşılmaması, bozuk feed'in typed hold vermesi, HTML'den yalnız
metadata alınması, ham gövdenin hiçbir çıktıda geçmemesi.

## Task 2: Olay geçmişi — deterministik parmak-izi ve dedup
- Files: src/intelligence/event-history.ts, tests/intelligence/event-history.test.ts
- Reads: src/core/memory-store.ts, src/core/memory-types.ts, src/intelligence/types.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/event-history.test.ts
### Description
Rakip olay geçmişini KANONİK `.brain/memory.db` MemoryStore'un `'custom'` entry tipiyle sakla —
yeni DB açma. Her kayıt şu alanları ZORUNLU taşır: competitor, eventType, fingerprint, source,
publicationDate, detectionDate, reportedDate (başlangıçta boş olabilir), affectedCapability,
previousClassification, confidence. Parmak-izi deterministiktir ve aynı olayın mirror/rewrite
kopyalarını AYNI parmak-izine indirger (normalize edilmiş competitor + eventType + yetenek +
yayın-tarihi çekirdeğinden türetilir; başlık kelimesi kelimesine kullanılmaz). Buna karşılık
**material evolution** yeni parmak-izidir: sınıflandırma veya etkilenen yetenek değiştiyse yeni
olaydır, dedup edilmez. Yazım idempotenttir; aynı parmak-izi ikinci kez yazılmaz.
Test: mirror/rewrite dedup, material-evolution'ın yeni kayıt üretmesi, zorunlu alan eksikse typed
hata, idempotent yazım, tarih alanlarının ISO-8601 doğrulaması.

## Task 3: Türkçe kompakt alarm biçimlendirici
- Files: src/intelligence/alert-formatter.ts, tests/intelligence/alert-formatter.test.ts
- Reads: src/intelligence/types.ts, src/intelligence/comparison.ts, src/intelligence/baseline-catalog.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 2
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/alert-formatter.test.ts
### Description
Alarm metni TÜRKÇE ve kompakttır; zorunlu bölümleri taşır: ne oldu · hangi rakip · hangi yetenek
alanı · Deckent'in o alandaki mevcut statüsü · göreli sınıf · hangi boşluk boyutu · ne yapılabilir.
Her alarm, ilgili baseline girdisinin EXACT kod referanslarını (`evidenceRefs`) taşır — okuyucu
iddiayı koddan doğrulayabilsin. Uydurma yüzde/skor YASAK; yalnız typed sınıf ve kanıt referansı.
Biçimlendirici SAF fonksiyondur (I/O yok, saat enjekte edilir). Metin Türkçe olmakla birlikte
teknik terimler İngilizce kalır (repo üslubu).
Test: zorunlu bölümlerin tamlığı, baseline kod-referanslarının aynen geçmesi, skor-benzeri sayı
bulunmaması, aynı girdi→aynı metin (determinizm), eksik baseline girdisinde typed hata.

## Task 4: Watch servisi — dry-run saflığı ve çökme-güvenli sıra
- Files: src/intelligence/watch-service.ts, src/intelligence/index.ts, tests/intelligence/watch-service.test.ts
- Reads: src/intelligence/baseline.ts, src/intelligence/comparison.ts, src/intelligence/significance-gate.ts, src/intelligence/source-retrieval.ts, src/intelligence/event-history.ts, src/intelligence/alert-formatter.ts, src/connectors/notification-delivery.ts
- Priority: HIGH
- Agent: implementer
- Model: gpt-5.6-sol
- Dependencies: Task 3
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/intelligence/watch-service.test.ts
### Description
Zinciri tek serviste birleştir: baseline türet → kaynakları çek → sinyalleri karşılaştır →
significance gate → yeni olayları geçmişe yaz → alarm üret → dayanıklı kutuya yaz.
**Sıra çökme-güvenlidir:** alarm ÖNCE stable-id ile `enqueueOwnerNotification` çağrısıyla kutuya
yazılır, SONRA geçmişin `reportedDate` alanı güncellenir. Böylece çökme/replay durumunda aynı
stable-id ikinci kez yazılmaz (idempotent) ve hiçbir alarm sessizce kaybolmaz.
**Dry-run KESİNLİKLE mutasyon yapmaz:** olay geçmişi, bildirim kutusu ve kaynak-imleci
değişmez; dry-run yalnız ne olacağını döndürür. Servis tüm I/O'yu enjekte edilmiş seam'lerden
alır (fetch, store, outbox, saat) — testte gerçek ağ/DB yok.
Test: uçtan uca tek alarm üretimi, dry-run'da üç yüzeyin de değişmediği (geçmiş · kutu · imleç),
aynı olayın ikinci koşuda alarm üretmemesi, çökme-simülasyonunda (kutuya yazıldı ama reportedDate
güncellenmedi) replay'in ikinci bildirim üretmemesi, kısmi kaynak hatasının koşuyu düşürmemesi.
