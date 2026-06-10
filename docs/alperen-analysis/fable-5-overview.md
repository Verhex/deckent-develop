# Fable 5 Sahada: 2,7 Milyar Token'lık Gerçek Veriyle Bir Haftanın Hikâyesi

Salı akşamı saat dokuz civarında ekranımdaki sayaç yüzde yüzü gösterdi. Claude aboneliğimin haftalık kullanım hakkı bitmişti. Bir saat sonra iki şey birden oldu: limit sıfırlandı ve Anthropic'in yeni amiral modeli Fable 5 hesabımda belirdi.

Ertesi gün öğleden sonra sayaca tekrar baktım. Yüzde 41. Daha bir gün bile geçmemişti.

İşte bu yazı o iki sayının, yüzde yüz ile yüzde 41'in arasındaki farkı anlama çabasının ürünü. Elimde iki haftaya yayılan, dört farklı modelden geçen, 2,7 milyar token'lık gerçek kullanım kaydı vardı. Oturup hepsini analiz ettim. Çıkan sonuçlar hem benim çalışma şeklimi değiştirdi hem de "yapay zekâ aboneliği aslında neyi ölçüyor" sorusuna veriyle cevap verdi.

Baştan söyleyeyim: Bu yazıdaki her sayı, sistemin kendi tuttuğu resmi kullanım kayıtlarından geliyor. Tahmin yok, hissiyat yok. Nereden emin olduğumu yazının sonunda ayrıca anlatacağım.

## Önce sahneyi tanıyalım

Ben tek başıma kod yazan biri değilim; bir ekip yönetiyorum. Ama ekibim insanlardan oluşmuyor. Deckent adında kendi geliştirdiğim bir orkestra şefi, işleri küçük görevlere bölüyor ve her görevi ayrı bir yapay zekâ işçisine dağıtıyor. Bu işçiler izole kutularda paralel çalışıyor, kod yazıyor, test koşuyor, sonuçlarını raporluyor. Ben de en üstte kararları veriyorum.

Böyle bir düzenin yakıtı token. Token dediğim şey, modelin okuyup yazdığı metin parçacıkları; kabaca hece gibi düşünebilirsiniz. Her işçi çalıştıkça token tüketiyor ve abonelik planının haftalık bir tavanı var. Tavana çarptığınızda her şey duruyor.

Geçen hafta o tavana çarptık. Tam da bu yüzden elimde nadir bulunan bir şey oluştu: tavanın tam dolduğu an ile sıfırlandıktan sonraki ilk ölçüm. İki sabit nokta. Tersine mühendislik için ihtiyacınız olan her şey.

## Limit aslında neyi sayıyor?

Herkesin kafasındaki ilk tahmin şu: "Limit, attığın istek sayısıyla dolar." İkinci tahmin: "Hayır, toplam token sayısıyla dolar." İkisini de test ettim.

Yöntem basitti. Limitin yüzde yüz dolduğu haftanın tüm kayıtlarını topladım: 11.624 istek, 10,35 milyon üretilen token. Sonra sıfırlanma ile yüzde 41 ölçümü arasındaki 19 saatin kayıtlarını topladım: 2.683 istek, 2,65 milyon üretilen token. Eğer limit istek sayıyorsa, ikinci pencerenin birinciye oranı yüzde 41'e denk gelmeliydi.

Gelmedi. İstek sayısı oranı yüzde 23 ile 26 arasında çıktı. Ham token oranı da yüzde 26 civarında kaldı. Önbellek dahil tüm token'ları saysam yüzde 20. Hiçbiri 41'i açıklamıyordu.

Sonra aklıma başka bir şey geldi. Ya limit, token'ları değil de token'ların parasal karşılığını sayıyorsa? Her modelin resmi bir fiyat etiketi var; pahalı model token başına daha çok, ucuz model daha az. Kullanımı bu etiketlerle çarpıp topladığımda oran yüzde 40 ile 43 arasına oturdu. Tam isabet.

Yani tablo şu: Abonelik limiti ne istek sayar ne çıplak token. Kullanımınızın piyasa değerini sayar. Pahalı modelle yazılan her cümle, ucuz modelle yazılanın katları kadar yer kaplar.

Bu testin yan ürünü olarak iki şey daha öğrendim ve ikisi de en az ana bulgu kadar değerli.

Birincisi: Modelin daha önce okuduğu metni hatırlamasına önbellek deniyor ve önbellekten yapılan okumalar limiti pratikte hiç doldurmuyor. O hafta 2,7 milyar token'lık önbellek okuması yapmışım. Sayaçtaki etkisi sıfıra yakın. Buna karşılık önbelleğe ilk kez yazmak, normal okumadan daha pahalıya sayılıyor. Bu ayrım kulağa teknik bir detay gibi geliyor ama birazdan göreceğiniz gibi faturanın yarısından fazlası tam buradan çıkıyor.

İkincisi: Fable 5 şu an aboneliklerde ücretsiz deneme penceresinde. Faturaya yansımıyor. Ama limit sayacına tam ağırlığıyla, yani en pahalı model etiketiyle yansıyor. "Bedava model" hipotezini de test ettim; eğer Fable sayılmasaydı 19 saatlik kullanım limitin sadece yüzde 6'sını doldurmuş olmalıydı. Oysa yüzde 41'deydik. Bedava sandığınız şey sayacı dolduruyor. Fatura ayrı, kota ayrı.

## Dört model, dört karakter

Elimdeki kayıtlar dört modeli kapsıyor: en güçlü ve en yeni olan Fable 5, bir önceki amiral Opus, dengeli orta sınıf Sonnet ve en küçük üye Haiku. Aynı işi her birine tek başına yaptırsaydım ne olurdu sorusunun cevabı, model seçiminin ne kadar belirleyici olduğunu gösteriyor.

Geçen haftanın iş yükünü sabit tutup modeli değiştirerek hesapladım. Her şeyi yalnızca Fable'a yaptırsaydım haftalık hak 2,8 günde biterdi; cuma sabahını göremezdim. Yalnızca Opus kullansaydım 5,5 günde biterdi ki geçen hafta kabaca böyle yaşandı. Yalnızca Sonnet kullansaydım hafta rahat çıkar, üstüne pay kalırdı. Yalnızca Haiku ile aynı hak neredeyse dört haftaya yeterdi.

Peki Fable bu pahalılığın karşılığını veriyor mu? Hız ve derinlik tarafında evet, hem de fazlasıyla. Geldiği geceden ertesi öğlene kadarki sürede Fable bana 1,87 milyon token'lık üretim yaptı. Kıyas için: Opus'un koca bir haftalık üretimi 7,77 milyondu. Fable yarım günde, Opus'un haftalık çıktısının dörtte birini üretti. O gece boyunca yedi otomatik çalışma turu tamamlandı, on dokuz bin satırdan fazla kod ve doküman üretildi ve işlerin neredeyse tamamı ilk denemede, elle düzeltme gerektirmeden kabul edildi. Kalite şikâyetim yok; tam tersine, ilk seferde doğruluk oranı elimdeki en iyi seviye.

Sürpriz, en ucuz modelden geldi. Kayıtlara göre Haiku'nun istek başına maliyeti, kendinden büyük olan Sonnet'in iki katı çıktı. Nasıl olur? Cevap yine önbellekte. Sonnet'i uzun oturumlarda çalıştırıyorduk; bir kez okuduğunu oturum boyunca hatırlıyor, tekrar tekrar bedavaya kullanıyordu. Haiku'yu ise hep kısa, tek atımlık işlere koşturmuştuk. Her çağrıda hafızası sıfırdan yazılıyordu ve o yazma işlemi pahalı. Etikette ucuz olan model, kullanım şekli yüzünden pratikte pahalıya geldi.

Bu cümleyi yazının en önemli cümlesi sayıyorum: Ucuz model her zaman ucuz çağrı demek değildir. Çağrının şekli, modelin fiyat etiketini yenebilir.

## İşi doğru modele vermek

Bütün bu analizden sonra düzeni değiştirdim. Artık Fable yalnızca planlama ve gerçekten zor işlerde devreye giriyor. Zorlu görevler Opus'a, gündelik geliştirme Sonnet'e, küçük dokümantasyon işleri Haiku'ya gidiyor. Sektörde buna katmanlama deniyor; bizim evdeki adı "işi ehline ver".

Sonuç ölçülebilir. Eski düzende, her şeyi Fable'a yaptırdığım turlarda görev başına ortalama maliyet 2,3 ile 2,5 dolar değerindeydi. Katmanlı düzende aynı kalitedeki görevler 0,58 ile 0,88 dolar aralığına indi. Üçte bire yakın bir düşüş ve yirmi görevlik bir turda yirmide yirmi başarı. Kaliteden tek bir şey vermeden.

Bu arada veri, en pahalı hatanın ne olduğunu da gösterdi. Bir gece, tüm işçileri Fable ile koşan bir tur tam ortasında limit tavanına çarptı. İşçiler yarıda kesildi, sistem onları tekrar tekrar başlatmaya çalıştı, her deneme bağlamı baştan yükledi. O turda görev başına maliyet 7,70 dolara fırladı; normalin üç katı. Beş görevlik o talihsiz tur, sonraki otuz iki görevlik iki turun toplamı kadar yaktı. Ders net: en büyük israf, yanlış model seçimi bile değil; duvara çarptıktan sonra körlemesine tekrar denemek.

Bir itiraf daha. İşçilerime her görevin sonunda "ne kadar token harcadın" diye sorduruyordum ve raporladıkları sayılara güveniyordum. Analiz sırasında bu beyanları gerçek kayıtlarla karşılaştırdım. İşçilerin beyanı, gerçeğin ortalama yüzde 30'u. Üç ila beş kat eksik bildiriyorlar. Kötü niyetten değil; kendi tüketimlerini görebilecekleri bir sayaç yok, tahmin ediyorlar. Çıkardığım kural şu ve sanırım insan ekipler için de geçerli: Harcamayı harcayana sormayın. Sayacı bağımsız tutun.

## Perde arkası: faturanın yarısı görünmeyen yerde

Limitin parasal değer saydığını öğrenince doğal soru şu oluyor: peki bizim parasal değerimiz nereye gidiyor? Cevap beni şaşırttı. Harcamanın yüzde 57 ile 63'ü, modelin ürettiği cevaplara değil, az önce bahsettiğim önbellek yazmalarına gidiyor. Üretilen asıl içerik yüzde 36 ile 41 arasında. Geri kalanı yuvarlama hatası kadar.

Ve o önbellek yazmalarının da yarıdan fazlası tek bir kaynaktan geliyor: her işçinin işe başlarken tüm proje bağlamını sıfırdan yüklemesi. Aynı kuralları, aynı dokümanları, aynı talimatları her işçi kendi hafızasına ayrı ayrı yazıyor. On işçi, on kopya. Üstelik üretici firmanın kendi dokümantasyonu bunun çözümünü açıkça tarif ediyor: aynı anda başlatılan istekler birbirinin hafızasını göremez; önce bir tanesini başlatıp ilk cevabı bekler, sonra kalanları salarsanız hepsi ilk işçinin yüklediği ortak hafızadan bedavaya okur.

Bu düzeltmeyi henüz tam uygulamadım; sıradaki iş listemin başında duruyor. Hesaplı beklentim, hiçbir içeriği kısaltmadan, sadece başlatma sırasını ve dosya düzenini değiştirerek toplam tüketimi yüzde 40 civarında düşürmek. Aynı haftalık hakla iki kat iş demek bu.

## Beş ders

Bu iki haftanın özetini beş cümleye sığdırmak gerekirse:

1. Abonelik limiti istek ya da token saymaz; kullanımınızın parasal değerini sayar. Pahalı model her cümlede katlanarak yer kaplar.
2. Önbellekten okumak bedavadır, önbelleğe yazmak pahalıdır. Sistemlerinizi okumayı çoğaltıp yazmayı azaltacak şekilde kurun.
3. Bedava görünen model kotanızı tam fiyatından doldurabilir. Fatura ile kota ayrı defterlerdir.
4. Ucuz model pahalı çağrı üretebilir. Maliyeti model etiketi değil, çağrının şekli belirler.
5. Tüketim raporunu tüketene sormayın. Bağımsız sayaç tutun; bizde beyan ile gerçek arasında üç kat fark çıktı.

Ve bir altıncısı, belki en insanisi: Duvara çarptığınızda durup nedenini anlamadan tekrar denemeyin. Bizim en pahalı gecemiz, ısrarın gecesiydi.

## Bu sayılara neden güvenebilirsiniz?

Yazıdaki tüm veriler, sistemin her API çağrısı için tuttuğu resmi kullanım kayıtlarından derlendi; bunlar tahmin değil, sunucunun döndürdüğü gerçek sayımlar. Mükerrer kayıtlar ayıklandı. Analiz 1 ile 10 Haziran 2026 arasını, 14 binden fazla isteği ve dört modeli kapsıyor. Limit formülü üretici tarafından yayınlanmadığı için oradaki bulgu iki sabit ölçüm noktasına dayalı bir çıkarımdır; payına yüzde 10'luk bir hata payı bırakıyorum. Web arayüzündeki kullanım bu kayıtlarda görünmediği için kapsam dışıdır. Parasal değerler abonelikte fiilen ödenmez; modellerin resmi fiyat etiketleriyle hesaplanmış kullanım ağırlıklarıdır.

---

## Veri Eki: Grafik üretmek isteyenler için

Aşağıdaki tablolar yazıdaki tüm grafiklenebilir veriyi içerir. Herhangi birini kopyalayıp claude.ai ya da chatgpt.com gibi bir araca yapıştırın ve önerilen komutu verin; yazıya görsel olarak ekleyebileceğiniz grafikler üretilecektir.

### Tablo 1. Limit hipotez testi (hangi metrik yüzde 41'i açıklıyor?)

| Hipotez | Hesaplanan oran | Gözlenen değer | Sonuç |
|---|---|---|---|
| İstek sayısı | %23 ile %26 | %41 | Elendi |
| Ham üretilen token | %26 | %41 | Elendi |
| Tüm token (önbellek dahil) | %20 | %41 | Elendi |
| Parasal değer (önbellek okuma hariç) | %40 ile %43 | %41 | Doğrulandı |
| Parasal değer (Fable bedava sayılırsa) | %6 | %41 | Elendi |

Önerilen grafik ve komut: "Bu tabloyu yatay çubuk grafiğe çevir; her çubuk bir hipotezin hesaplanan oranı olsun, yüzde 41'e dikey bir referans çizgisi ekle, doğrulanan satırı farklı renkle vurgula."

### Tablo 2. Aynı haftalık iş yükü tek modelde koşsaydı

| Senaryo | Haftalık hakkın yüzdesi | Hak ne zaman biter |
|---|---|---|
| Yalnız Fable 5 | %254 | 2,8 günde |
| Yalnız Opus | %127 | 5,5 günde |
| Yalnız Sonnet | %76 | Bitmez (9,2 günlük kapasite) |
| Yalnız Haiku | %25 | Bitmez (27,6 günlük kapasite) |

Önerilen grafik ve komut: "Bu tabloyu çubuk grafiğe çevir; %100 seviyesine 'haftalık limit' etiketli yatay çizgi ekle; %100 üstü çubukları kırmızı tonla."

### Tablo 3. Harcamanın bileşenleri (limit sayacındaki ağırlık payları)

| Bileşen | Token hacmindeki payı | Limit sayacındaki payı |
|---|---|---|
| Önbellek okuma | %96,3 | %0 |
| Önbellek yazma | %3,3 | %57 ile %63 |
| Üretilen içerik | %0,4 | %36 ile %41 |
| Girdi | %0,1 | %1 ile %2 |

Önerilen grafik ve komut: "Bu tabloyu yan yana iki halka (donut) grafiğe çevir: solda token hacmi payları, sağda limit sayacı payları. Aynı bileşen iki grafikte aynı renkte olsun; kontrastı vurgula."

### Tablo 4. İstek başına maliyet ve önbellek isabet oranı (model karakterleri)

| Model | İstek başına değer (dolar eşdeğeri) | Önbellek isabet oranı |
|---|---|---|
| Sonnet | 0,022 | %95 |
| Haiku | 0,045 | %48 |
| Opus | 0,089 | %98 |
| Fable 5 | 0,127 | %98 |

Önerilen grafik ve komut: "Bu tabloyu saçılım (scatter) grafiğine çevir: x ekseni istek başına değer, y ekseni isabet oranı, her nokta model adıyla etiketli. Haiku noktasına 'düşük isabet, yüksek birim maliyet' notu ekle."

### Tablo 5. Görev başına gerçek maliyet, altı çalışma turu (model düzeninin etkisi)

| Çalışma turu | Model düzeni | Görev sayısı | Görev başına değer (dolar eşdeğeri) |
|---|---|---|---|
| Tur A | Sonnet ağırlıklı | 15 | 0,58 |
| Tur B | Tümü Fable | 12 | 2,27 |
| Tur C | Tümü Fable | 5 | 2,47 |
| Tur D | Tümü Fable, limit kesintili | 5 | 7,70 |
| Tur E | Katmanlı (Opus+Sonnet+Haiku) | 20 | 0,88 |
| Tur F | Katmanlı (Sonnet ağırlıklı) | 12 | 0,58 |

Önerilen grafik ve komut: "Bu tabloyu zaman sıralı çubuk grafiğe çevir; tümü-Fable çubuklarını bir renkte, katmanlı çubukları başka renkte göster; kesintili turu desenli dolguyla işaretle ve üzerine 'limit kesintisi + tekrar denemeler' notu ekle."

### Tablo 6. Fable 5'in ilk yarım günü, Opus'un tam haftasına karşı

| Ölçüm | Fable 5 (ilk 19 saat) | Opus (7 gün) |
|---|---|---|
| Üretilen token | 1,87 milyon | 7,77 milyon |
| İstek sayısı | 2.683'ün içinde 1.789 | 11.624'ün içinde 8.114 |
| Not | 7 çalışma turu, 19 bin satırdan fazla üretim | Haftalık limitin ana tüketicisi |

Önerilen grafik ve komut: "Bu tabloyu saat başına üretim hızına çevirip iki çubukla karşılaştır: Fable 19 saatlik ortalaması ile Opus 168 saatlik ortalaması. 'Yarım günde haftalık üretimin dörtte biri' başlığını kullan."

### Tablo 7. İşçi beyanı ile bağımsız sayaç arasındaki fark

| Ölçüm | Değer |
|---|---|
| İşçi beyanlarının gerçeğe oranı (ortalama) | %30 |
| En düşük gözlenen oran | %8 |
| En yüksek gözlenen oran | %68 |
| İncelenen görev sayısı | 69 |

Önerilen grafik ve komut: "Bu veriyle bir gösterge (gauge) ya da tek çubuklu karşılaştırma yap: 'beyan edilen' %30 dolu, 'gerçek' %100 referans; alt başlık olarak 'tüketimi tüketene sormayın' yaz."
