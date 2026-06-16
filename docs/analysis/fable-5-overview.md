# Fable 5 Sahada: 6 Milyar Token'lık Gerçek Veriyle On Bir Günün Hikâyesi

Salı akşamı saat dokuz civarında ekranımdaki sayaç yüzde yüzü gösterdi. Claude aboneliğimin haftalık kullanım hakkı bitmişti. Bir saat sonra iki şey birden oldu: limit sıfırlandı ve Anthropic'in yeni amiral modeli Fable 5 hesabımda belirdi.

Ertesi gün öğleden sonra sayaca tekrar baktım. Yüzde 41. Daha bir gün bile geçmemişti. Sonraki iki günde sayaç önce 51'e, sonra 76'ya tırmandı ve ben her durakta oturup kayıtları yeniden ölçtüm.

İşte bu yazı o sayıların arasındaki farkları anlama çabasının ürünü. Elimde on bir güne yayılan, dört farklı modelden geçen, 25 binden fazla istek ve 6 milyar token'ı aşan gerçek kullanım kaydı var. Oturup hepsini analiz ettim. Çıkan sonuçlar hem benim çalışma şeklimi değiştirdi hem de "yapay zekâ aboneliği aslında neyi ölçüyor" sorusuna veriyle cevap verdi. Yol boyunca iki teorim sahada çöktü ve kendi ölçüm sistemimde utandıran bir kusur buldum; onları da saklamadan anlatacağım.

Baştan söyleyeyim: bu yazıdaki her sayı, sistemin kendi tuttuğu resmi kullanım kayıtlarından geliyor. Tahmin yok, hissiyat yok. Nereden emin olduğumu yazının sonunda ayrıca anlatacağım.

## Önce sahneyi tanıyalım

Ben tek başıma kod yazan biri değilim; bir ekip yönetiyorum. Ama ekibim insanlardan oluşmuyor. Deckent adında kendi geliştirdiğim bir orkestra şefi, işleri küçük görevlere bölüyor ve her görevi ayrı bir yapay zekâ işçisine dağıtıyor. Bu işçiler izole kutularda paralel çalışıyor, kod yazıyor, test koşuyor, sonuçlarını raporluyor. Ben de en üstte kararları veriyorum.

Böyle bir düzenin yakıtı token. Token dediğim şey, modelin okuyup yazdığı metin parçacıkları; kabaca hece gibi düşünebilirsiniz. Her işçi çalıştıkça token tüketiyor ve abonelik planının haftalık bir tavanı var. Tavana çarptığınızda her şey duruyor.

Geçen hafta o tavana çarptık. Tam da bu yüzden elimde nadir bulunan bir şey oluştu: sayacın değerini kesin bildiğim anlar. Başta iki taneydi, tavanın dolduğu an ile sıfırlanma sonrası ilk ölçüm. On bir günün sonunda bu sayı dörde çıktı ve hikâyeyi tahminden ölçüme çevirdi.

## Limit aslında neyi sayıyor?

Herkesin kafasındaki ilk tahmin şu: "Limit, attığın istek sayısıyla dolar." İkinci tahmin: "Hayır, toplam token sayısıyla dolar." İkisini de test ettim.

Yöntem basitti. Limitin yüzde yüz dolduğu haftanın tüm kayıtlarını topladım: 11.624 istek, 10,35 milyon üretilen token. Sonra sıfırlanma ile yüzde 41 ölçümü arasındaki 19 saatin kayıtlarını topladım: 2.683 istek, 2,65 milyon üretilen token. Eğer limit istek sayıyorsa, ikinci pencerenin birinciye oranı yüzde 41'e denk gelmeliydi.

Gelmedi. İstek sayısı oranı yüzde 23 ile 26 arasında çıktı. Ham token oranı da yüzde 26 civarında kaldı. Önbellek dahil tüm token'ları saysam yüzde 20. Hiçbiri 41'i açıklamıyordu.

Sonra aklıma başka bir şey geldi. Ya limit, token'ları değil de token'ların parasal karşılığını sayıyorsa? Her modelin resmi bir fiyat etiketi var; pahalı model token başına daha çok, ucuz model daha az. Kullanımı bu etiketlerle çarpıp topladığımda oran yüzde 40 ile 43 arasına oturdu. Tam isabet.

İki noktayla kurulan bir formüle yüzde on hata payı bırakmıştım; güçlü bir iddia için iki nokta azdı. Şans bana iki nokta daha verdi. Sayaç 41'den 51'e çıkarken hesapladığım tüketim, formülün öngördüğü aralığın içinde kaldı. 51'den 76'ya çıkan ikinci pencerede ise öngörünün tam ortasına düştü. Aynı formül birbirinden bağımsız dört noktada tutuyorsa, o artık tahmin değil, çalışan bir sayaçtır. Hata payım yüzde beşe indi ve haftalık hakkın parasal karşılığı netleşti: yaklaşık 650 dolar eşdeğeri.

Yani tablo şu: Abonelik limiti ne istek sayar ne çıplak token. Kullanımınızın piyasa değerini sayar. Pahalı modelle yazılan her cümle, ucuz modelle yazılanın katları kadar yer kaplar.

Bu testin yan ürünü olarak iki şey daha öğrendim ve ikisi de en az ana bulgu kadar değerli.

Birincisi: Modelin daha önce okuduğu metni hatırlamasına önbellek deniyor ve önbellekten yapılan okumalar limiti pratikte hiç doldurmuyor. Yalnızca o ilk haftada 2,7 milyar token'lık önbellek okuması yapmışım; on bir günün toplamı 5,9 milyar. Sayaçtaki etkisi sıfıra yakın. Buna karşılık önbelleğe ilk kez yazmak, normal okumadan daha pahalıya sayılıyor. Bu ayrım kulağa teknik bir detay gibi geliyor ama birazdan göreceğiniz gibi faturanın yarısından fazlası tam buradan çıkıyor.

İkincisi: Fable 5 şu an aboneliklerde deneme penceresinde. Faturaya yansımıyor. Ama limit sayacına tam ağırlığıyla, yani en pahalı model etiketiyle yansıyor. "Bedava model" hipotezini de test ettim; eğer Fable sayılmasaydı 19 saatlik kullanım limitin sadece yüzde 6'sını doldurmuş olmalıydı. Oysa yüzde 41'deydik.

## 200 dolarlık abonelik aslında ne satın alıyor?

Haftalık hakkın parasal karşılığını öğrenince, herkesin merak ettiği soruyu kendime sordum: aylık 200 dolarlık abonelik ne kadar API kullanımına denk geliyor? Bu sorunun iki dürüst cevabı var, çünkü ortada iki ayrı defter var.

Birinci defter, sayacın saydığı. Haftalık hak yaklaşık 650 dolar eşdeğeri iş demek; bu ayda yaklaşık 2.800 dolar ediyor. Yani 200 dolarlık abonelik, kota tabanında yaklaşık on dört kat kaldıraç sağlıyor. Her 1 dolarlık abonelik, 14 dolarlık API işçiliği satın alıyor.

İkinci defter, API'nin keseceği gerçek fatura. Sayaç önbellek okumalarını saymıyor ama API sayar. Kotanın tamamını doldurduğumuz haftada 2,7 milyar önbellek okuması vardı; aynı trafik API'den geçseydi fatura haftada yaklaşık 2.000 dolar, ayda 8.500 dolar civarı olurdu. Abonelik fiyatının kırk katından fazla. Şu farkla: bu çarpan bizim önbellek yoğun çalışma şeklimize özgü. Önbelleği bizim kadar verimli kullanmayan birinde fatura tabanlı kaldıraç, kota tabanlı on dört kata doğru geriler. Aboneliğin gerçek değeri sabit değil; sistemi nasıl kurduğunuza bağlı olarak 14 ile 40 kat arasında bir yerde duruyor.

## Dört model, dört karakter

Elimdeki kayıtlar dört modeli kapsıyor: en güçlü ve en yeni olan Fable 5, bir önceki amiral Opus, dengeli orta sınıf Sonnet ve en küçük üye Haiku. Aynı işi her birine tek başına yaptırsaydım ne olurdu sorusunun cevabı, model seçiminin ne kadar belirleyici olduğunu gösteriyor.

Geçen haftanın iş yükünü sabit tutup modeli değiştirerek hesapladım; taban, az önce kalibre ettiğim 650 dolarlık haftalık hak. Her şeyi yalnızca Fable'a yaptırsaydım hak 2,7 günde biterdi. Yalnızca Opus kullansaydım 5,4 günde biterdi ki geçen hafta kabaca böyle yaşandı. Yalnızca Sonnet kullansaydım hafta rahat çıkar, üstüne pay kalırdı. Yalnızca Haiku ile aynı hak neredeyse dört haftaya yeterdi.

Peki Fable bu pahalılığın karşılığını veriyor mu? Hız ve derinlik tarafında evet, hem de fazlasıyla. Geldiği geceden ertesi öğlene kadarki sürede Fable bana 1,87 milyon token'lık üretim yaptı. Kıyas için: Opus'un koca bir haftalık üretimi 7,77 milyondu. Fable yarım günde, Opus'un haftalık çıktısının dörtte birini üretti. O gece boyunca yedi otomatik çalışma turu tamamlandı, on dokuz bin satırdan fazla kod ve doküman üretildi ve işlerin neredeyse tamamı ilk denemede, elle düzeltme gerektirmeden kabul edildi. Kalite şikâyetim yok; tam tersine, ilk seferde doğruluk oranı elimdeki en iyi seviye.

Sürpriz, en ucuz modelden geldi. Kayıtlara göre Haiku'nun istek başına maliyeti, kendinden büyük olan Sonnet'in iki katı çıktı. Nasıl olur? Cevap yine önbellekte. Sonnet'i uzun oturumlarda çalıştırıyorduk; bir kez okuduğunu oturum boyunca hatırlıyor, tekrar tekrar bedavaya kullanıyordu. Haiku'yu ise hep kısa, tek atımlık işlere koşturmuştuk. Her çağrıda hafızası sıfırdan yazılıyordu ve o yazma işlemi pahalı. Etikette ucuz olan model, kullanım şekli yüzünden pratikte pahalıya geldi. Teşhisten sonra çağrı şeklini düzelttik; Haiku'nun önbellek isabeti yüzde 48'den 84'e çıktı. Hâlâ filonun en düşüğü ama yön doğru.

Bu cümleyi yazının en önemli cümlesi sayıyorum: Ucuz model her zaman ucuz çağrı demek değildir. Çağrının şekli, modelin fiyat etiketini yenebilir.

## İşi doğru modele vermek

Bütün bu analizden sonra düzeni değiştirdim. Artık Fable yalnızca planlama ve gerçekten zor işlerde devreye giriyor. Zorlu görevler Opus'a, gündelik geliştirme Sonnet'e, küçük dokümantasyon işleri Haiku'ya gidiyor. Sektörde buna katmanlama deniyor; bizim evdeki adı "işi ehline ver".

Sonuç ölçülebilir. Eski düzende, her şeyi Fable'a yaptırdığım turlarda görev başına ortalama maliyet 2,3 ile 2,5 dolar değerindeydi. Katmanlı düzende aynı kalitedeki görevler 0,58 ile 0,88 dolar aralığına indi. Üçte bire yakın bir düşüş ve yirmi görevlik bir turda yirmide yirmi başarı. Kaliteden tek bir şey vermeden.

## Perde arkası: faturanın yarısı görünmeyen yerde

Limitin parasal değer saydığını öğrenince doğal soru şu oluyor: peki bizim parasal değerimiz nereye gidiyor? Cevap beni şaşırttı. Harcamanın yüzde 56 ile 63'ü, modelin ürettiği cevaplara değil, az önce bahsettiğim önbellek yazmalarına gidiyor. Üretilen asıl içerik yüzde 36 ile 43 arasında. Bu oran on bir günün her penceresinde aynı çıktı; tesadüf değil, düzenin karakteri.

O önbellek yazmalarının da yarıdan fazlası tek bir kaynaktan geliyor: her işçinin işe başlarken tüm proje bağlamını sıfırdan yüklemesi. Aynı kuralları, aynı dokümanları, aynı talimatları her işçi kendi hafızasına ayrı ayrı yazıyor. On işçi, on kopya.

Kağıt üzerinde çözüm hazırdı. Üretici firmanın dokümantasyonu, aynı anda başlatılan isteklerin birbirinin hafızasını göremediğini, ama önce bir isteği başlatıp ilk cevabı bekledikten sonra kalanları salarsanız hepsinin ilk işçinin yüklediği ortak hafızadan bedavaya okuyacağını anlatıyor. Beklentim, hiçbir içeriği kısaltmadan, sadece başlatma sırasını değiştirerek toplam tüketimi yüzde 40 civarında düşürmekti.

Denedim. Çalışmadı. Bizim işçiler izole kutularda ayrı oturumlar açıyor ve üreticinin önbelleği bu oturumlar arasında paylaşılmıyor; birinin ısıttığı hafızayı diğeri göremiyor. Güzel teori sahada yarım günde yanlışlandı, ben de mekanizmayı kapattım. Ders ucuz sayılır: varsayımı üretimde büyütmeden önce küçük ölçekte test etmek, bu yazının en az formül kadar değerli alışkanlığı.

İşe yarayan başka bir şey çıktı: her işçinin sırtındaki bagajı küçültmek. Talimat metinlerindeki tekrarları teke indirdim, en hacimli kural dokümanını işçiyi gerçekten ilgilendiren özetiyle değiştirdim, blokların sırasını önbelleğin lehine yeniden dizdim. İçerikten tek kelime feda etmeden, saf ölçümde görev başına maliyet 0,67 dolardan 0,45 dolara indi; yüzde 33 kazanç.

Ama bu kazancın bir huyu var: kendiliğinden eriyor. Sonraki turlarda sisteme eklenen her yeni talimat, her yeni özellik o bagajı sessizce geri büyüttü ve görev başına maliyet 0,54 ile 0,70 bandına geri tırmandı. Optimizasyon bir kerelik zafer değil, sürekli bütçe disipliniymiş. Bagajı bir kez küçültmek yetmiyor; yeniden şişmesini engelleyen bir bekçi gerekiyor.

## Kendi sayacım da yalan söyledi

Bu işe başlarken kendime bir kural koymuştum: tüketim raporunu tüketene sorma. İşçilerden kendi kullanım rakamlarını raporlamalarını istemiştik; 69 görevlik örneklemde beyanlar gerçeğin ortalama yüzde 30'u çıktı. En dürüst beyan bile gerçeğin üçte ikisinde kalıyordu. İşçi kendi tüketimini göremiyor ve formu boş bırakmamak için dolduruyor. Çözüm bağımsız sayaçtı; sistemin resmi kayıtlarından okuyan ayrı bir ölçer kurduk.

Sonra bu yazı için o sayacın kendisini denetledim ve keşke daha önce yapsaymışım dedirten bir şey buldum. Model fiyat tablosundaki bayat bir kayıt yüzünden sayaç iki modelin tüketimini sıfır sayıyormuş. Kendi ölçerimiz gerçeğin 2,4 kat altını raporluyormuş ve bunu fark ettirecek bir uyarı da hiç devreye girmemiş. Token sayımı doğruydu; bozuk olan parasal çevrimdi. Aynı gün düzelttik ama ders kalıcı: yalnız beyanlara değil, kendi ölçüm zincirinize de düzenli çapraz sağlama yapın. Sessizce sıfır yazan bir sayaç, hiç olmayan sayaçtan tehlikelidir.

## Yeni cephe: klavyenin başındaki adam

On bir günün en şaşırtıcı sonucu işçilerle ilgili bile değildi. İşçi filosunu terbiye ettikten sonra son günün kayıtlarına baktım: harcamanın yüzde 58'i artık filodan değil, benim klavye başındaki interaktif oturumlarımdan geliyordu. Tek bir uzun inceleme oturumu, üç tam çalışma turunun toplamından pahalıya gelmişti.

Sebebi yine önbellek. İnsan çalışırken düşünüyor, okuyor, çay koyuyor. O molalar beş dakikalık hafıza penceresini öldürüyor ve her dönüşte tüm bağlam yeniden yazılıyor. Bunu bir de en pahalı modelle yapıyorsanız, sayaç siz ekrana bakarken koşuyor. İşi doğru modele vermek kuralı, anlaşılan yalnız makineler için değil; insan koltuğu da bir model seçimi ve artık en pahalı koltuk orası.

## Yedi ders

Bu on bir günün özetini yedi cümleye sığdırmak gerekirse:

1. Abonelik limiti istek ya da token saymaz; kullanımınızın parasal değerini sayar. Pahalı model her cümlede katlanarak yer kaplar.
2. Önbellekten okumak bedavadır, önbelleğe yazmak pahalıdır. Sistemlerinizi okumayı çoğaltıp yazmayı azaltacak şekilde kurun.
3. Bedava görünen model kotanızı tam fiyatından doldurabilir. Fatura ile kota ayrı defterlerdir.
4. Ucuz model pahalı çağrı üretebilir. Maliyeti model etiketi değil, çağrının şekli belirler.
5. Tüketim raporunu tüketene sormayın ve bağımsız sayacınızı da düzenli denetleyin. Bizde beyanlar üç kat, kendi sayacımız 2,4 kat yanılttı.
6. Optimizasyon kazançları kendiliğinden erir. Kazancı bir kez almak yetmez; geri büyümeyi yakalayan bir bekçi şarttır.
7. En pahalı koltuk sizin koltuğunuz olabilir. Model seçimi disiplini klavye başındaki insan için de geçerlidir.

Ve bir sekizincisi, belki en insanisi: Duvara çarptığınızda durup nedenini anlamadan tekrar denemeyin. Bizim en pahalı gecemiz, ısrarın gecesiydi.

## Bu sayılara neden güvenebilirsiniz?

Yazıdaki tüm veriler, sistemin her API çağrısı için tuttuğu resmi kullanım kayıtlarından derlendi; bunlar tahmin değil, sunucunun döndürdüğü gerçek sayımlar. Mükerrer kayıtlar ayıklandı. Analiz 1 ile 11 Haziran 2026 arasını, 25 binden fazla isteği, 6,2 milyar token'ı (5,9 milyarı önbellek okuması) ve dört modeli kapsıyor. Limit formülü üretici tarafından yayınlanmadığı için oradaki bulgu bir çıkarımdır; ama artık birbirinden bağımsız dört ölçüm noktasında doğrulanmış bir çıkarım ve hata payını yüzde 5 olarak veriyorum. Web arayüzündeki kullanım bu kayıtlarda görünmediği için kapsam dışıdır. Parasal değerler abonelikte fiilen ödenmez; modellerin resmi fiyat etiketleriyle hesaplanmış kullanım ağırlıklarıdır.

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

### Tablo 2. Formülün dört doğrulama noktası

| Pencere | Sayaçtaki hareket | Formülün öngördüğü tüketim | Ölçülen tüketim | Sonuç |
|---|---|---|---|---|
| 7 günlük tam hafta | %0'dan %100'e | (kalibrasyon bazı) | ~650 dolar eşdeğeri | baz nokta |
| Reset sonrası 19 saat | %0'dan %41'e | (kalibrasyon bazı) | ~267 dolar eşdeğeri | baz nokta |
| Ertesi gün 4,5 saat | %41'den %51'e | 59 ile 72 dolar | 70,9 dolar | doğrulandı |
| Sonraki 21,5 saat | %51'den %76'ya | 156 ile 169 dolar | 162,7 dolar | doğrulandı (aralığın tam ortası) |

Önerilen grafik ve komut: "Son iki satırı öngörülen-aralık (hata çubuğu) üzerine ölçülen-değer noktası olarak çiz; başlık 'Dört noktada tutan formül artık tahmin değil, sayaçtır'."

### Tablo 3. 200 dolarlık abonelik ne satın alıyor?

| Defter | Haftalık | Aylık | Aboneliğe oranı |
|---|---|---|---|
| Abonelik fiyatı | ~46 dolar | 200 dolar | 1 kat |
| Sayacın saydığı kota (önbellek okuma hariç) | ~650 dolar eşdeğeri | ~2.800 dolar eşdeğeri | ~14 kat |
| API'nin keseceği gerçek fatura (önbellek okumalar dahil, bizim kullanım şekli) | ~2.000 dolar | ~8.500 dolar | ~40 kat |

Not: 40 kat çarpanı, trafiğin yüzde 96'sının önbellek okuması olduğu bizim düzenimize özgüdür; önbellek verimliliği düşük kullanımda fatura tabanlı kaldıraç 14 kata doğru geriler.

Önerilen grafik ve komut: "Bu tabloyu üç çubuklu logaritmik karşılaştırmaya çevir: abonelik fiyatı, kota değeri, fatura değeri; her çubuğun üstüne kat çarpanını yaz."

### Tablo 4. Aynı haftalık iş yükü tek modelde koşsaydı

Bütçe tabanı: dört noktayla kalibre edilen haftalık hak, yaklaşık 650 dolar eşdeğeri.

| Senaryo | Haftalık hakkın yüzdesi | Hak ne zaman biter |
|---|---|---|
| Yalnız Fable 5 | %262 | 2,7 günde |
| Yalnız Opus | %131 | 5,4 günde |
| Yalnız Sonnet | %78 | Bitmez (8,9 günlük kapasite) |
| Yalnız Haiku | %26 | Bitmez (26,8 günlük kapasite) |

Önerilen grafik ve komut: "Bu tabloyu çubuk grafiğe çevir; %100 seviyesine 'haftalık limit' etiketli yatay çizgi ekle; %100 üstü çubukları kırmızı tonla."

### Tablo 5. Harcamanın bileşenleri (limit sayacındaki ağırlık payları)

| Bileşen | Token hacmindeki payı | Limit sayacındaki payı |
|---|---|---|
| Önbellek okuma | %96,4 | %0 |
| Önbellek yazma | %3,2 | %56 ile %63 |
| Üretilen içerik | %0,4 | %36 ile %43 |
| Girdi | %0,1 | %1 ile %2 |

Önerilen grafik ve komut: "Bu tabloyu yan yana iki halka (donut) grafiğe çevir: solda token hacmi payları, sağda limit sayacı payları. Aynı bileşen iki grafikte aynı renkte olsun; kontrastı vurgula."

### Tablo 6. İstek başına maliyet ve önbellek isabet oranı (model karakterleri)

| Model | İstek başına değer (dolar eşdeğeri) | Önbellek isabet oranı |
|---|---|---|
| Sonnet | 0,022 | %95 |
| Haiku | 0,045 | %48 |
| Opus | 0,089 | %98 |
| Fable 5 | 0,127 | %98 |

Not: Bu tablo, sorunun teşhis edildiği haftanın fotoğrafıdır. Çağrı şekli düzeltmeleri sonrası 11 Haziran ölçümünde Haiku'nun isabet oranı %84'e çıktı; hâlâ en düşük, ama yön doğru.

Önerilen grafik ve komut: "Bu tabloyu saçılım (scatter) grafiğine çevir: x ekseni istek başına değer, y ekseni isabet oranı, her nokta model adıyla etiketli. Haiku noktasına 'düşük isabet, yüksek birim maliyet' notu ve %48'den %84'e düzelme okunu ekle."

### Tablo 7. Görev başına gerçek maliyet, yedi çalışma turu (model düzeninin etkisi)

| Çalışma turu | Model düzeni | Görev sayısı | Görev başına değer (dolar eşdeğeri) |
|---|---|---|---|
| Tur A | Sonnet ağırlıklı | 15 | 0,58 |
| Tur B | Tümü Fable | 12 | 2,27 |
| Tur C | Tümü Fable | 5 | 2,47 |
| Tur D | Tümü Fable, limit kesintili | 5 | 7,70 |
| Tur E | Katmanlı (Opus+Sonnet+Haiku) | 20 | 0,88 |
| Tur F | Katmanlı (Sonnet ağırlıklı) | 12 | 0,58 |
| Tur G | Katmanlı + bagaj küçültme | 6 | 0,56 |

Not: Bagaj küçültmenin saf etkisi, model karışımından arındırılmış Sonnet bazlı ölçümde görülür: görev başına 0,67'den 0,45'e, yüzde 33 düşüş. Sonraki turlarda bu değer 0,54 ile 0,70 bandına geri tırmandı; yazıdaki "kazanç kendiliğinden erir" bulgusunun verisi budur.

Önerilen grafik ve komut: "Bu tabloyu zaman sıralı çubuk grafiğe çevir; tümü-Fable çubuklarını bir renkte, katmanlı çubukları başka renkte göster; kesintili turu desenli dolguyla işaretle ve üzerine 'limit kesintisi + tekrar denemeler' notu ekle."

### Tablo 8. Fable 5'in ilk yarım günü, Opus'un tam haftasına karşı

| Ölçüm | Fable 5 (ilk 19 saat) | Opus (7 gün) |
|---|---|---|
| Üretilen token | 1,87 milyon | 7,77 milyon |
| İstek sayısı | 2.683'ün içinde 1.789 | 11.624'ün içinde 8.114 |
| Not | 7 çalışma turu, 19 bin satırdan fazla üretim | Haftalık limitin ana tüketicisi |

Önerilen grafik ve komut: "Bu tabloyu saat başına üretim hızına çevirip iki çubukla karşılaştır: Fable 19 saatlik ortalaması ile Opus 168 saatlik ortalaması. 'Yarım günde haftalık üretimin dörtte biri' başlığını kullan."

### Tablo 9. Beyan ile bağımsız sayaç arasındaki fark

| Ölçüm | Değer |
|---|---|
| İşçi beyanlarının gerçeğe oranı (ortalama) | %30 |
| En düşük gözlenen oran | %8 |
| En yüksek gözlenen oran | %68 |
| İncelenen görev sayısı | 69 |
| Kendi sayacımızdaki fiyat hatasının boyutu | 2,4 kat düşük raporlama |

Önerilen grafik ve komut: "Bu veriyle bir gösterge (gauge) ya da tek çubuklu karşılaştırma yap: 'beyan edilen' %30 dolu, 'gerçek' %100 referans; alt başlık olarak 'tüketimi tüketene sormayın, kendi sayacınızı da denetleyin' yaz."
