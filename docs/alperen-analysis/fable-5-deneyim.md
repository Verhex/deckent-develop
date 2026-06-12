# Fable 5 ile 60 Saat: Haftalık Limitin %92'si ve Karşılığında Aldıklarımız

Salı gecesi saat onda Anthropic'in yeni amiral modeli Fable 5 hesabımda belirdi. Bugün Cuma değil — Perşembe sabahı saat ona geliyor ve haftalık kullanım sayacım %92'yi gösteriyor. Aradan geçen süre: 60 saat.

Bu yazı o 60 saatin hikâyesi. İki soruya birden cevap veriyor: **Fable 5'i gerçek işte nasıl kullandık, ne aldık?** Ve **bu kullanım abonelik sayacını tam olarak nasıl doldurdu?** İlk soruyu üretim kayıtlarıyla, ikincisini sistemin her API çağrısı için tuttuğu resmi kullanım kayıtlarıyla cevaplayacağım. Yazıda tahmin yok; her sayı ya bir git commit'i ya da sunucunun döndürdüğü token sayımı.

Önceki yazımda bu sayacın *neyi* saydığını tersine mühendislikle çıkarmıştım: limit, istek ya da token değil, kullanımın **model-fiyatıyla ağırlıklı parasal karşılığını** sayıyor. O yazı formülün dört bağımsız noktada tuttuğunu göstermişti. Bu yazıda formül iki sınavdan daha geçecek — biri 60 saatlik bir bütünleme sınavı — ve okuyucuların en çok sorduğu soruyu veriyle kapatacağım: *"Önbellek okumaları API'de yüzde 10'dan faturalanıyor; sayaç da öyle saymıyor mu?"* Saymıyor. Kanıtıyla göstereceğim.

## Sahne: Bir orkestra şefi ve yeni gelen virtüöz

Kurulumum değişmedi: deckent adında kendi geliştirdiğim bir orkestratör, işleri görevlere bölüyor ve her görevi izole bir yapay zekâ işçisine dağıtıyor. Dört model çalışıyor: Fable 5 (en güçlü, en pahalı), Opus (bir önceki amiral), Sonnet (orta sınıf), Haiku (en küçük).

Önceki haftanın dersinden çıkan katmanlama kuralı şuydu: *işi ehline ver*. Fable yalnızca planlama, mimari karar ve gerçekten zor problemlere; Opus zorlu görevlere; Sonnet gündelik geliştirmeye; Haiku dokümana. Bu 60 saat, o kuralın ilk tam ölçekli sınavıydı.

## Birinci Perde — Fable 5 fiilen ne yaptı?

### İlk gece: yarım günde, eski amiralin haftalık üretiminin dörtte biri

Fable'ın geldiği geceyi önceki yazıda anlatmıştım ama rakam tekrara değer: ilk 19 saatte 1,87 milyon token üretti — Opus'un koca bir haftada ürettiği 7,77 milyonun dörtte biri. O gece yedi otomatik çalışma turu tamamlandı, on dokuz bin satırdan fazla kod ve doküman üretildi, işlerin neredeyse tamamı ilk denemede kabul edildi.

### Sonraki iki gün: beyin koltuğu

Asıl hikâye ondan sonra başladı. Fable'ı işçi olarak değil, **baş mimar koltuğuna** oturttuk. 60 saatin kayıtlarında Fable'ın interaktif (klavye başı + ana terminal) kullanımı 1.879 istek; işçi olarak kullanımı 1.042 istek. Yani Fable trafiğinin çoğunluğu artık kod yazan işçi değil, düşünen, denetleyen, planlayan beyin.

O koltukta neler çıktı? Hepsi commit kayıtlarında:

- **78 mimari kararın (ADR) tam denetimi.** 14 parti halinde, her iddia kod okunarak doğrulandı; iki yeni ADR yazıldı, bir tanesinin durumu düzeltildi. Projenin "anayasası" ilk kez baştan sona kodla yüzleştirildi.
- **12 katmanlı kod analizi.** Çekirdek, orkestra, sağlayıcılar, API, CLI, bağlayıcılar — yalnız çekirdek taramasında 148 modül — dosya dosya gezildi ve bulgular ana plana işlendi.
- **Ana planın yeniden örgütlenmesi.** Dağınık yol haritası, hiçbir madde kaybetmeden 13 iş hattına indirgendi; kapsama mekanik olarak doğrulandı.
- **Bir alt sistemin sıfırdan tasarımı.** Kaynak-hakemi (resource arbiter) spesifikasyonu yazıldı, altı bağımsız denetimden geçirildi — üçü Fable'ın kendisine, birbirini görmeden yaptırıldı — denetim bulgularıyla mekanizma yeniden kuruldu ve 14 görevlik uygulama planına bağlandı.
- **Üç ürün sprint'inin planlanıp değerlendirilmesi.** Sohbet ve kontrol paneli deneyimini hedefleyen üç sprint'i Fable planladı, katmanlı işçi filosu uyguladı, Fable değerlendirdi. Sonuncusunda panele gerçek zamanlı veri akışı bağlandı; kalp atışından ekrana gecikme 153 milisaniye olarak ölçüldü.
- **Kendi ölçüm zincirimizin onarımı.** Bu yazının dayandığı sayaç altyapısındaki dört kırık halka aynı gün içinde teşhis edilip kapatıldı.
- **Bir hata avının kök-neden haritası.** Terminal arayüzündeki çok-adımlı eylem hatası için beş katmanlı şüpheli haritası çıkarıldı ve bir sonraki sprint'in görev listesine çevrildi.

Toplam: 60 saatte **109 commit**, sprint 264'ten 285'e uzanan bir iş hattı. Bunun insan tarafında tek kişi var ve o kişi bu hafta neredeyse hiç kod yazmadı; yönetti.

### Fable'ın karakteri: rakamlarla

Kayıtlardan çıkan profil net:

- **İstek başına en pahalı model:** Fable'ın resmi fiyat etiketi Opus'un tam iki katı (milyon token başına 10/50 dolar; Opus 5/25). İstek başına ortalama parasal ağırlığı filodaki her şeyin üstünde.
- **Önbellek disiplini mükemmel:** İnteraktif Fable oturumlarının önbellek isabet oranı %98,9. Yani sorun savurganlık değil; sorun, her oturumun **ilk yazımının** pahalı olması ve beş dakikayı aşan her düşünme molasının o yazımı tekrarlatması.
- **İnteraktif Fable yakımının yarıdan fazlası önbellek yazımı.** 60 saatte interaktif Fable 229,6 dolar eşdeğeri yaktı; bunun 133 doları (%58) önbellek yazımı, 92 doları üretilen içerik. Klavye başında düşünürken sayaç, siz bir şey üretmeden de koşuyor.
- **İşçi olarak Fable lüks:** İşçi-Fable 1.042 istekle 156,9 dolar eşdeğeri yaktı — Sonnet işçilerinin 2.847 istekle yaktığının (65,9 dolar) 2,4 katı, üçte biri kadar istekle. Fable'ı rutin işçiliğe koşmak, virtüöze nota taşıtmak.

## İkinci Perde — Sayaç bu 60 saati nasıl saydı?

### Formülün beşinci ve altıncı sınavı

Önceki yazının formülü şuydu: sayaç, `girdi + üretim + önbellek-yazımı × 1,25`'i her modelin resmi fiyatıyla çarpıp topluyor; **önbellek okumalarını saymıyor**. Dört bağımsız noktada doğrulanmıştı; haftalık hak yaklaşık 651 dolar eşdeğeri.

Bu hafta iki sınav daha verdi:

**Beşinci nokta — dün akşamdan bu sabaha:** Sayaç %76'dan %92'ye çıktı; 16 puan, formüle göre 98–111 dolar eşdeğeri tüketim demek. Pencerenin kayıtlarını topladım: **103,59 dolar.** Aralığın tam ortası.

**Altıncı sınav — 60 saatlik bütünleme:** Bu, öncekilerden daha güçlü bir test. Sayaç salı gecesi sıfırlandı; şu an %92. Formül doğruysa, sıfırlamadan bu yana ölçtüğüm *tüm* tüketimin 651 doların %92'sine denk gelmesi gerekir. Ölçtüm: 60 saatin toplamı **602,11 dolar** — 651'in **%92,5'i.** Tek tek pencereler değil, dönemin tamamı, yuvarlama payı içinde sayaçla örtüşüyor. Formül artık bir hipotez değil; altı bağımsız ölçümde ve bir tam-dönem integralinde tutan, ±%2 hassasiyetli çalışan bir sayaç modeli.

### Okuyucu sorusu: "Önbellek okuması yüzde 10'dan sayılmıyor mu?"

Resmî fiyat tablosu şöyle der: önbelleğe yazmak girdi fiyatının 1,25 katı (bir saatlik önbellekte 2 katı), önbellekten **okumak** girdi fiyatının 0,1 katı — yani %90 indirimli ama bedava değil. API faturasında bu kesinlikle böyle. Makul soru şu: abonelik sayacı da okumaları %10'dan sayıyor olamaz mı?

Bu hipotezi bu haftanın verisiyle, resmi çarpanları hesaba **dahil ederek** test ettim:

Dün akşamki 16 puanlık pencerede 261 milyon token önbellek okuması var. Bunlar resmi %10 oranıyla sayılsaydı sayaca **184 dolar daha** eklenmesi, pencerenin 288 dolar = **44 puan** oynaması gerekirdi. Gözlenen: 16 puan. 60 saatin tamamında ise 2,04 **milyar** okuma var; %10'dan sayılsaydı dönem toplamı 2.067 dolar ederdi — haftalık hakkın **üç katı**. Sayaç daha salı gecesi dolmuş olurdu. Oysa %92'deyiz.

Daha sıkı bir üst sınır da çıkıyor: 16 puanlık pencerede okuma-dışı tüketim 103,6 dolar; pencerenin tavanı 110,7 dolar. Okumalara kalan pay en fazla 7 dolar — 261 milyon token için. Bu, önbellek okumasının sayaçtaki ağırlığının resmi API oranının **en fazla yüzde dördü**, pratikte sıfır olduğu anlamına gelir.

Sonuç iki defterli muhasebenin kesin kanıtı: **API faturası okumaları %10'dan sayar; abonelik sayacı hiç saymaz.** Bu fark aboneliğin gizli cömertliği — ve birazdan göreceğiniz gibi, verimli kullanımın bir numaralı kaldıracı.

### %92'nin anatomisi: kim, neyi, ne kadar yaktı?

60 saatlik 602 doların röntgeni üç kesitte:

**Modele göre:** Fable %64,2 (386,5 dolar) · Opus %21,8 (131 dolar) · Sonnet %10,9 (65,9 dolar) · Haiku %3,1 (18,7 dolar). Çarpıcı olan şu: Fable, toplam üretimin (token olarak) yalnız %39,5'ini yaptı ama sayacın %64'ünü doldurdu. Premium etiket her cümlede iki kat yer kaplıyor.

**Yüzeye göre:** İşçi filosu %53,4 · interaktif (klavye + ana terminal) %46,6. Ama eğilim tek yönlü: son 16 puanlık pencerede interaktifin payı %63'e çıktı. Filoyu katmanlamayla terbiye ettik; **artık en pahalı koltuk, benim koltuğum.** O koltukta da Fable oturuyor: son pencerede tek başına toplam yakımın %56'sı interaktif Fable.

**Bileşene göre:** Önbellek yazımı %57 · üretilen içerik %41,3 · ham girdi %1,7. Token hacminin %97'sini oluşturan önbellek okumalarının sayaç payı: %0. Faturanın yarıdan fazlasının "görünmeyen yerde" (önbellek yazımında) olduğu bulgusu üçüncü haftadır değişmiyor — bu bir anomali değil, bu düzenin fiziği.

### Hız: Fable ile yaşamanın temposu

60 saatte %92, ortalama 10 dolar-eşdeğeri/saat demek; ama gece uykuları çıkınca aktif çalışma temposu **~15 dolar/saat**. Bu tempoyla haftalık hak 44 aktif saat sürüyor. Önceki hafta Opus-ağırlıklı düzen limiti 5,5 günde bitirmişti; Fable'ı beyin koltuğuna alan bu düzen, daha az istek ve daha az ham token'la, benzer hızda bitiriyor — çünkü sayaç token değil değer sayıyor ve Fable'ın değeri çift tarifeden yazılıyor.

Bir not daha: Fable abonelikte hâlâ deneme penceresinde, faturaya yansımıyor. Ama bu 60 saat bir kez daha gösterdi ki sayaca **tam ağırlığıyla** yansıyor. Bedava model, bedava limit demek değil.

## Üçüncü Perde — Verimli kullanım: veriden çıkan beş senaryo

Bunların hiçbiri teori değil; beşi de bu kayıtlarda ölçüldü.

**1. Katmanla — ama denetimi üst kata ver.** Görev başına maliyet, tümü-Fable turlarında 2,3–2,5 dolar; katmanlı turlarda 0,58–0,88 dolar. Üç-dört kat fark, kalite kaybı sıfır (bir turda 20/20 başarı). Fable'ın doğru yeri üretim bandı değil: plan, mimari karar, kör-denetim, kök-neden analizi. Oradaki bir saatlik Fable, banttaki on saatlik Fable'dan fazlasını döndürüyor.

**2. Önbellek okuması sayaçta bedava — bunu mimariye çevir.** 60 saatte 2 milyar token'lık bağlam okuması yaptık ve sayaca etkisi sıfırdı. Verimin kuralı: okumayı çoğalt, yazmayı azalt. Pratikte: uzun inceleme oturumunu kesintisiz bloklar halinde yürüt (beş dakikalık önbellek ömrü dolmadan), oturum ortasında uzun molalar verme — her mola, dönüşte tam bağlamın 1,25 katı tarifeyle yeniden yazılması demek. İnteraktif Fable yakımımızın %58'i tam bu molaların faturası.

**3. Kazanç bekçisiz erir.** İşçi sırt çantasını küçülten optimizasyon görev başına maliyeti %33 düşürmüştü; üç sprint sonra, sisteme eklenen her yeni talimat kazancı sessizce geri yedi ve maliyet eski bandına döndü. Optimizasyon tek seferlik zafer değil; prompt boyutuna regresyon eşiği koymadıysanız, kazandığınızı kaybedeceksiniz.

**4. En pahalı israf, limit ölüsü geceki ısrar.** Limit kesintisine denk gelen turda görev başına maliyet 7,70 dolara fırladı — normalin 3,3 katı; beş görevlik o tur, sonraki 32 görevlük iki turun toplamı kadar yaktı. Duvara çarptıysanız tekrar denemeyin; bekleyin ya da işi sıraya koyun.

**5. Ölçüm zincirinizi de denetleyin.** İşçilerin kendi tüketim beyanları gerçeğin %30'uydu; bağımsız sayacımız bile bayat bir fiyat kaydı yüzünden 2,4 kat düşük sayıyormuş. Tüketimi tüketene sormayın — ve kendi sayacınıza da üç ayda bir değil, her sıfırlamada çapraz sağlama yapın. Bu haftaki %76→%92 kontrolü tam olarak o ritüeldi ve formülü beşinci kez doğruladı.

## Kapanış: %8 ile dört buçuk gün

Şu an elde kalan: hakkın %8'i, yaklaşık 52 dolar eşdeğeri. Sıfırlanma salı gecesi — dört buçuk gün sonra. Aktif tempomuzla bu, **üç buçuk saatlik** Fable-yoğun çalışma demek. Önümüzdeki dört günün planı bu yüzden kendiliğinden yazılıyor: Fable yalnız sıfırlamaya kadar ertelenemeyecek kararlarda; geri kalan her şey Sonnet ve Haiku'da; uzun okuma oturumları Opus'ta.

60 saatin bilançosunu tek cümleye sıkıştırmak gerekirse: **Fable 5, doğru koltuğa oturtulduğunda haftalık limitin üçte ikisine, bir ekibin iki haftada çıkaramayacağı mimari işi sığdırıyor — yanlış koltuğa oturtulduğunda aynı limiti iki buçuk günde bitiriyor.** Seçim sayacın değil, sizin.

## Bu sayılara neden güvenebilirsiniz?

Tüm kullanım verileri, sistemin her API çağrısı için yerel olarak tuttuğu resmi kayıtlardan (sunucunun döndürdüğü gerçek token sayımları) derlendi; mükerrer kayıtlar mesaj kimliğiyle ayıklandı. İşçilerin kendi beyanları kullanılmadı (önceki analizde gerçeğin ~%30'u çıkmışlardı). Üretim iddiaları (commit, sprint, satır sayıları) git geçmişinden alındı. Dönem: 9 Haziran 22:00 — 12 Haziran 10:00 (TR), 8.548 istek, 9,1 milyon girdi+üretim token'ı, 2,04 milyar önbellek okuması; 1–12 Haziran genel toplamı 26 bin istek ve 6,2 milyar token. Fiyat çarpanları (önbellek yazımı 1,25×, okuma 0,1×) Anthropic'in resmi fiyat dokümanından alındı ve hesaplara dahil edildi. Limit formülü üretici tarafından yayınlanmadığı için sayaç modeli bir çıkarımdır; ancak altı bağımsız pencere ve bir tam-dönem toplamıyla ±%2 içinde doğrulanmıştır. Web arayüzü kullanımı bu kayıtlarda görünmez, kapsam dışıdır. Parasal değerler abonelikte fiilen ödenmez; resmi fiyat etiketleriyle hesaplanmış kullanım ağırlıklarıdır. Sayaç yüzdesi tam sayıya yuvarlanarak okunur (±1 puan).

---

## Veri Eki: Grafik üretmek isteyenler için

Tabloları kopyalayıp bir yapay zekâ aracına yapıştırın ve önerilen komutu verin.

### Tablo 1. Formülün doğrulama noktaları (artık 6)

| Sınav | Pencere | Sayaç hareketi | Formül beklentisi | Ölçülen | Sonuç |
|---|---|---|---|---|---|
| 1-2 | İlk hafta + sıfırlama sonrası 19 saat | %100 / %41 | (kalibrasyon) | — | baz noktalar |
| 3 | 4,5 saat | %41→%51 | 59–72 $ | 70,9 $ | ✅ |
| 4 | 21,5 saat | %51→%76 | 156–169 $ | 162,7 $ | ✅ tam orta |
| **5 (yeni)** | 15 saat (≈7 aktif) | %76→%92 | 98–111 $ | **103,6 $** | ✅ tam orta |
| **6 (yeni)** | 60 saatlik tam dönem | %0→%92 | 651 $'ın %92'si ≈ 599 $ | **602,1 $ (%92,5)** | ✅ bütünleme |

Önerilen grafik: "3-6. satırları öngörü-aralığı (hata çubuğu) + ölçüm noktası olarak çiz; başlık 'Altı sınavda tutan sayaç modeli'."

### Tablo 2. Önbellek okuması hipotez testi (resmi %10 oranı sayaçta geçerli mi?)

| Senaryo | %76→%92 penceresi | 60 saatlik dönem |
|---|---|---|
| Ölçülen (okuma=0 modeli) | 103,6 $ → 16 puan ✅ | 602 $ → %92,5 ✅ |
| Okuma resmi %10'la sayılsaydı | 288 $ → 44 puan ❌ | 2.067 $ → %318 ❌ |
| Gözlenen | 16 puan | %92 |

Not: API faturası okumaları gerçekten %10'dan sayar; abonelik sayacı saymaz. Okuma ağırlığı üst sınırı: resmi oranın ≤%4'ü.

Önerilen grafik: "İki gruplu çubuk grafik — her grupta 'okuma=0 modeli' ve 'okuma=%10 modeli' çubukları + gözlenen değere yatay çizgi."

### Tablo 3. 60 saatin model kırılımı (limit sayacı payları)

| Model | İstek | Üretilen token | Önbellek isabet | Sayaç payı ($) | Sayaç payı (%) |
|---|---|---|---|---|---|
| Fable 5 | 2.921 | 3,09M | %94,7–98,9 | 386,5 | %64,2 |
| Opus 4.8 | 1.910 | 2,71M | %96–99 | 131,0 | %21,8 |
| Sonnet 4.6 | 2.847 | 1,62M | %96,2 | 65,9 | %10,9 |
| Haiku 4.5 | 870 | 0,41M | %82,6 | 18,7 | %3,1 |
| **Toplam** | **8.548** | **7,83M** | %97,5 | **602,1** | **%100** |

Önerilen grafik: "Yan yana iki halka: solda üretilen-token payları, sağda sayaç payları; Fable'ın %39,5 üretim → %64,2 sayaç farkını vurgula."

### Tablo 4. Yüzey kırılımı ve devrilme eğilimi

| Pencere | İnteraktif (beyin) payı | İşçi filosu payı |
|---|---|---|
| 60 saat toplamı | %46,6 (280,6 $) | %53,4 (321,5 $) |
| %51→%76 penceresi | %58,5 | %41,5 |
| %76→%92 penceresi | %63,1 (65,4 $) | %36,9 (38,2 $) |

Önerilen grafik: "Yığılmış %100 çubuk, üç pencere; başlık 'En pahalı koltuk artık klavyenin başı'."

### Tablo 5. Harcamanın bileşenleri (60 saat)

| Bileşen | Token hacmi payı | Sayaç payı |
|---|---|---|
| Önbellek okuma | %97,1 (2,04 milyar) | %0 |
| Önbellek yazma | %2,5 (52,1M) | %57,0 |
| Üretilen içerik | %0,4 (7,8M) | %41,3 |
| Ham girdi | %0,06 (1,25M) | %1,7 |

Önerilen grafik: "İki halka (hacim vs sayaç), aynı bileşen aynı renk."

### Tablo 6. Fable'ın 60 saatlik üretim bilançosu (git kayıtları)

| Kalem | Değer |
|---|---|
| Commit | 109 |
| Sprint hattı | 264 → 285 |
| ADR denetimi | 78 ADR, 14 parti, tek oturum 65 $ eşdeğeri |
| Kod analizi | 12 katman (yalnız çekirdekte 148 modül) |
| Yeni alt sistem tasarımı | 1 spec + 6 kör denetim + 14 görevlik plan |
| Ürün sprint'i | 3 (gerçek zamanlı panel: 153 ms ölçülü) |
| İlk gece üretimi | 7 otomatik tur, 19.000+ satır |

### Tablo 7. Verimlilik senaryolarının ölçülmüş etkileri

| Senaryo | Ölçüm |
|---|---|
| Katmanlama (görev başına maliyet) | 2,3–2,5 $ → 0,58–0,88 $ (3–4×) |
| Prefix küçültme | −%33 (bekçisiz 3 sprintte geri eridi) |
| Limit-ölüsü ısrar | 7,70 $/görev (normalin 3,3 katı) |
| İşçi beyanı vs gerçek | %30 |
| Kendi sayacımızın hatası | 2,4× düşük (bayat fiyat kaydı) |
| Aktif tempo | ~15 $/saat → haftalık hak 44 aktif saat |
