# Fable 5 Sahada: 6 Milyar Token'lık Gerçek Veriyle On İki Günün Hikâyesi

Salı akşamı saat dokuz civarında ekranımdaki sayaç yüzde yüzü gösterdi. Claude aboneliğimin haftalık kullanım hakkı bitmişti. Bir saat sonra iki şey birden oldu: limit sıfırlandı ve Anthropic'in yeni amiral modeli Fable 5 hesabımda belirdi.

Ertesi gün öğleden sonra sayaca tekrar baktım. Yüzde 41. Daha bir gün bile geçmemişti. Sonraki günlerde sayaç önce 51'e, sonra 76'ya tırmandı. Bu sabah, sıfırlanmadan tam 60 saat sonra, yüzde 92'yi gösteriyor. Ama bu sefer panik yok; çünkü artık o sayacın nasıl çalıştığını biliyorum, ne aldığımı da biliyorum.

İşte bu yazı o iki bilginin hikâyesi. Elimde on iki güne yayılan, dört modelden geçen, 26 bin istek ve 6 milyar token'ı aşan gerçek kullanım kaydı var. Bir yanda abonelik sayacının tersine mühendisliği: limit neyi sayıyor, neyi saymıyor, ne kadar hassas öngörülebiliyor. Öbür yanda işçiliğin kendisi: Fable 5 üç günde fiilen ne üretti, parasının karşılığını verdi mi, nereye oturtulunca verimli oluyor. Yol boyunca iki teorim sahada çöktü, kendi ölçüm sistemimde utandıran bir kusur buldum ve en pahalı koltuğun kimin koltuğu olduğunu öğrendim. Hiçbirini saklamadan anlatacağım.

Baştan söyleyeyim: bu yazıdaki her sayı ya sistemin kendi tuttuğu resmi kullanım kayıtlarından ya da git geçmişinden geliyor. Tahmin yok, hissiyat yok. Nereden emin olduğumu yazının sonunda ayrıca anlatacağım.

## Önce sahneyi tanıyalım

Ben tek başıma kod yazan biri değilim; bir ekip yönetiyorum. Ama ekibim insanlardan oluşmuyor. Deckent adında kendi geliştirdiğim bir orkestra şefi, işleri küçük görevlere bölüyor ve her görevi ayrı bir yapay zekâ işçisine dağıtıyor. Bu işçiler izole kutularda paralel çalışıyor, kod yazıyor, test koşuyor, sonuçlarını raporluyor. Ben en üstte kararları veriyorum. Filoda dört model var: en güçlü ve en yeni olan Fable 5, bir önceki amiral Opus, dengeli orta sınıf Sonnet ve en küçük üye Haiku.

Böyle bir düzenin yakıtı token. Token dediğim şey modelin okuyup yazdığı metin parçacıkları; kabaca hece gibi düşünebilirsiniz. Her işçi çalıştıkça token tüketiyor ve abonelik planının haftalık bir tavanı var. Tavana çarptığınızda her şey duruyor.

Geçen hafta o tavana çarptık. Tam da bu yüzden elimde nadir bulunan bir şey oluştu: sayacın değerini kesin bildiğim anlar. Başta iki taneydi. On iki günün sonunda bu sayı altıya çıktı ve hikâyeyi tahminden ölçüme çevirdi.

## Limit aslında neyi sayıyor?

Herkesin kafasındaki ilk tahmin şu: "Limit, attığın istek sayısıyla dolar." İkinci tahmin: "Hayır, toplam token sayısıyla dolar." İkisini de test ettim.

Yöntem basitti. Limitin yüzde yüz dolduğu haftanın tüm kayıtlarını topladım: 11.624 istek, 10,35 milyon üretilen token. Sonra sıfırlanma ile yüzde 41 ölçümü arasındaki 19 saatin kayıtlarını topladım: 2.683 istek, 2,65 milyon üretilen token. Eğer limit istek sayıyorsa, ikinci pencerenin birinciye oranı yüzde 41'e denk gelmeliydi.

Gelmedi. İstek sayısı oranı yüzde 23 ile 26 arasında çıktı. Ham token oranı da yüzde 26 civarında kaldı. Önbellek dahil tüm token'ları saysam yüzde 20. Hiçbiri 41'i açıklamıyordu.

Sonra aklıma başka bir şey geldi. Ya limit, token'ları değil de token'ların parasal karşılığını sayıyorsa? Her modelin resmi bir fiyat etiketi var; pahalı model token başına daha çok, ucuz model daha az. Kullanımı bu etiketlerle çarpıp topladığımda oran yüzde 40 ile 43 arasına oturdu. Tam isabet.

İki noktayla kurulan bir formüle güvenmek için iki nokta azdı. Şans bana dört nokta daha verdi:

Sayaç 41'den 51'e çıkarken ölçtüğüm tüketim 70,9 dolar eşdeğeriydi; formülün öngördüğü aralık 59 ile 72 arasıydı. Tuttu. 51'den 76'ya çıkan pencerede formül 156 ile 169 arası diyordu; ölçüm 162,7 çıktı, aralığın tam ortası. Dün akşamdan bu sabaha, 76'dan 92'ye çıkan pencerede formül 98 ile 111 arası bekliyordu; ölçüm 103,6. Yine orta nokta.

Altıncı sınav hepsinden güçlüydü, çünkü bir pencere değil bütün bir dönemdi. Sayaç salı gecesi sıfırlanmıştı ve bu sabah 92'yi gösteriyordu. Formül doğruysa, sıfırlanmadan bu yana ölçtüğüm tüm tüketimin haftalık hakkın yüzde 92'sine denk gelmesi gerekiyordu. Topladım: 60 saatin tamamı 602 dolar eşdeğeri, yani 651 dolarlık haftalık hakkın yüzde 92,5'i. Tek tek pencereler değil, dönemin bütünü de sayaçla örtüşüyor. Aynı formül altı bağımsız ölçümde tutuyorsa o artık tahmin değil, çalışan bir sayaç modelidir. Hata payım yüzde ikiye indi ve haftalık hakkın parasal karşılığı netleşti: yaklaşık 650 dolar eşdeğeri.

Yani tablo şu: abonelik limiti ne istek sayar ne çıplak token. Kullanımınızın piyasa değerini sayar. Pahalı modelle yazılan her cümle, ucuz modelle yazılanın katları kadar yer kaplar.

Bu testin bir yan ürünü daha oldu: Fable 5 şu an aboneliklerde deneme penceresinde, faturaya yansımıyor. Ama limit sayacına tam ağırlığıyla, yani en pahalı model etiketiyle yansıyor. "Bedava model" hipotezini ayrıca test ettim; Fable sayılmasaydı 19 saatlik kullanım limitin sadece yüzde 6'sını doldurmuş olmalıydı. Oysa yüzde 41'deydik. Bedava model, bedava limit demek değil.

## Peki önbellek okuması gerçekten hiç mi sayılmıyor?

Burada bir parantez açmam gerekiyor, çünkü ilk yazıdan sonra en çok bu soru geldi ve haklı bir soru.

Önce kavramı netleştireyim. Modelin daha önce okuduğu metni hatırlamasına önbellek deniyor. Resmi fiyat tablosuna göre önbelleğe ilk kez yazmak, normal girdinin 1,25 katı fiyatla; önbellekten okumak ise girdinin 0,1 katı fiyatla ücretlendiriliyor. Yani API faturasında okuma yüzde 90 indirimli ama bedava değil. Makul soru şu: abonelik sayacı da okumaları aynı yüzde 10 oranıyla sayıyor olamaz mı?

Bu hipotezi, resmi çarpanları hesaba dahil ederek test ettim. Daha ilk haftanın verisinde okuma yüzde 10'la sayılınca oran 37,5 civarına geliyordu; gözlenen 41'in altında, yakın ama tutmuyor. Asıl kesin cevabı bu haftanın büyük sayıları verdi. Dün geceki 16 puanlık pencerede 261 milyon token'lık önbellek okuması vardı. Bunlar yüzde 10'dan sayılsaydı sayaca 184 dolar daha eklenmesi, pencerenin 44 puan oynaması gerekirdi. Gözlenen 16 puan. Son 60 saatin tamamında ise 2 milyar token okuma var; yüzde 10'dan sayılsaydı dönem toplamı 2.067 dolar ederdi, haftalık hakkın üç katından fazla. Sayaç daha çarşamba sabahı dolmuş olurdu. Oysa 92'deyiz.

Üstüne bir de üst sınır hesabı yapılabiliyor. O 16 puanlık pencerede okuma dışı tüketim 103,6 dolar, pencerenin matematiksel tavanı 110,7 dolar. Okumalara kalabilecek pay en fazla 7 dolar, üstelik 261 milyon token için. Bu, önbellek okumasının sayaçtaki ağırlığının resmi API oranının en fazla yüzde dördü, pratikte sıfır olduğu anlamına geliyor.

Sonuç, iki ayrı defterin kesin kanıtı: API faturası okumaları yüzde 10'dan sayar, abonelik sayacı hiç saymaz. Yalnızca ilk haftada 2,7 milyar token'lık önbellek okuması yapmışım; on iki günün toplamı 6 milyar. Sayaçtaki etkisi sıfıra yakın. Buna karşılık önbelleğe yazmak hem faturada hem sayaçta normal okumadan pahalı. Bu ayrım kulağa teknik bir detay gibi geliyor ama birazdan göreceğiniz gibi, harcamanın yarısından fazlası tam buradan çıkıyor ve verimli kullanımın bir numaralı kaldıracı da bu.

## 200 dolarlık abonelik aslında ne satın alıyor?

Haftalık hakkın parasal karşılığını öğrenince, herkesin merak ettiği soruyu kendime sordum: aylık 200 dolarlık abonelik ne kadar API kullanımına denk geliyor? Bu sorunun iki dürüst cevabı var, çünkü ortada iki ayrı defter var.

Birinci defter, sayacın saydığı. Haftalık hak yaklaşık 650 dolar eşdeğeri iş demek; bu ayda yaklaşık 2.800 dolar ediyor. Yani 200 dolarlık abonelik, kota tabanında yaklaşık on dört kat kaldıraç sağlıyor. Her 1 dolarlık abonelik, 14 dolarlık API işçiliği satın alıyor.

İkinci defter, API'nin keseceği gerçek fatura. Sayaç önbellek okumalarını saymıyor ama API sayar. Kotanın tamamını doldurduğumuz haftada 2,7 milyar önbellek okuması vardı; aynı trafik API'den geçseydi fatura haftada yaklaşık 2.000 dolar, ayda 8.500 dolar civarı olurdu. Abonelik fiyatının kırk katından fazla. Şu farkla: bu çarpan bizim önbellek yoğun çalışma şeklimize özgü. Önbelleği bizim kadar verimli kullanmayan birinde fatura tabanlı kaldıraç on dört kata doğru geriler. Aboneliğin gerçek değeri sabit değil; sistemi nasıl kurduğunuza bağlı olarak 14 ile 40 kat arasında bir yerde duruyor.

## Dört model, dört karakter

Aynı işi her modele tek başına yaptırsaydım ne olurdu sorusunun cevabı, model seçiminin ne kadar belirleyici olduğunu gösteriyor. Limitin dolduğu haftanın iş yükünü sabit tutup modeli değiştirerek hesapladım; taban, az önce kalibre ettiğim 650 dolarlık haftalık hak.

Her şeyi yalnızca Fable'a yaptırsaydım hak 2,7 günde biterdi. Yalnızca Opus kullansaydım 5,4 günde biterdi ki geçen hafta kabaca böyle yaşandı. Yalnızca Sonnet kullansaydım hafta rahat çıkar, üstüne pay kalırdı. Yalnızca Haiku ile aynı hak neredeyse dört haftaya yeterdi.

Sürpriz, en ucuz modelden geldi. Kayıtlara göre Haiku'nun istek başına maliyeti, kendinden büyük olan Sonnet'in iki katı çıktı. Nasıl olur? Cevap yine önbellekte. Sonnet'i uzun oturumlarda çalıştırıyorduk; bir kez okuduğunu oturum boyunca hatırlıyor, tekrar tekrar bedavaya kullanıyordu. Haiku'yu ise hep kısa, tek atımlık işlere koşturmuştuk. Her çağrıda hafızası sıfırdan yazılıyordu ve o yazma işlemi pahalı. Etikette ucuz olan model, kullanım şekli yüzünden pratikte pahalıya geldi. Teşhisten sonra çağrı şeklini düzelttik; Haiku'nun önbellek isabeti yüzde 48'den 84'e çıktı. Hâlâ filonun en düşüğü ama yön doğru.

Bu cümleyi yazının en önemli cümlelerinden biri sayıyorum: ucuz model her zaman ucuz çağrı demek değildir. Çağrının şekli, modelin fiyat etiketini yenebilir.

## Fable ile üç gün: virtüözü nereye oturttuk?

Şimdi madalyonun öbür yüzüne, işçiliğin kendisine gelelim. Sayacı yüzde 92'ye getiren o 60 saatte ne aldık?

İlk gece tanışma gecesiydi. Fable geldiği geceden ertesi öğlene kadarki sürede 1,87 milyon token'lık üretim yaptı. Kıyas için: Opus'un koca bir haftalık üretimi 7,77 milyondu. Fable yarım günde, eski amiralin haftalık çıktısının dörtte birini üretti. O gece yedi otomatik çalışma turu tamamlandı, on dokuz bin satırdan fazla kod ve doküman üretildi ve işlerin neredeyse tamamı ilk denemede, elle düzeltme gerektirmeden kabul edildi. Kalite şikâyetim yok; tam tersine, ilk seferde doğruluk oranı elimdeki en iyi seviye.

Asıl karar ondan sonraki iki günde verildi. Fable'ı üretim bandından çektim ve baş mimar koltuğuna oturttum. Kayıtlar bu kararı net gösteriyor: 60 saatte Fable'ın klavye başı ve ana terminal kullanımı 1.879 istek, işçi olarak kullanımı 1.042 istek. Trafiğinin çoğunluğu artık kod yazan işçi değil; düşünen, denetleyen, planlayan beyin.

O koltukta neler çıktı? Hepsi commit kayıtlarında duruyor. Projenin anayasası sayılan 78 mimari karar, on dört parti halinde, her iddia kodla yüzleştirilerek baştan sona denetlendi; iki yeni karar yazıldı, biri düzeltildi. Ardından kod tabanının kendisi on iki katman halinde dosya dosya gezildi; yalnız çekirdek taramasında 148 modül elden geçti. Dağınık yol haritası, tek madde kaybetmeden 13 iş hattına indirgendi ve kapsama mekanik olarak doğrulandı. Sıfırdan bir alt sistem tasarlandı: kaynak hakemi dediğimiz bir kabul kontrol mekanizmasının spesifikasyonu yazıldı, altı bağımsız denetimden geçirildi. Bu denetimlerin üçünü Fable'ın kendisine, birbirini görmeden yaptırdım; bulgularla mekanizma yeniden kuruldu ve on dört görevlik bir uygulama planına bağlandı. Bu arada ürün tarafı boş durmadı: sohbet ve kontrol paneli deneyimini hedefleyen üç sprint'i Fable planladı, katmanlı işçi filosu uyguladı, sonuçları yine Fable değerlendirdi. Sonuncusunda panele gerçek zamanlı veri akışı bağlandı; sistemin kalp atışından ekrana yansıma gecikmesi 153 milisaniye olarak ölçüldü. Terminal arayüzündeki inatçı bir hatanın kök neden haritası çıkarıldı ve bir sonraki sprint'in görev listesine çevrildi. Hatta bu yazının dayandığı ölçüm zincirinin kendisindeki dört kırık halkayı da aynı gün içinde teşhis edip kapatan oydu.

Toplam: 60 saatte 109 commit, sprint 264'ten 285'e uzanan kesintisiz bir iş hattı. İnsan tarafında tek kişi var ve o kişi bu hafta neredeyse hiç kod yazmadı. Yönetti.

Kayıtlardan çıkan karakter profili de net. Fable'ın resmi fiyat etiketi Opus'un tam iki katı; istek başına parasal ağırlığı filodaki her şeyin üstünde, ortalama 0,127 dolar eşdeğeri. Önbellek disiplini kusursuz: interaktif oturumlarda isabet oranı yüzde 98,9. Sorun savurganlık değil; sorun, her oturumun ilk yazımının pahalı olması ve beş dakikayı aşan her düşünme molasının o yazımı tekrarlatması. Nitekim interaktif Fable harcamasının yüzde 58'i önbellek yazımı çıktı; klavye başında düşünürken sayaç, siz tek kelime üretmeden de koşuyor. İşçi olarak ise Fable düpedüz lüks: 1.042 istekle 157 dolar eşdeğeri yaktı; Sonnet işçileri 2.847 istekle bunun yarısından azını, 66 dolar yakmıştı. Fable'ı rutin işçiliğe koşmak, virtüöze nota taşıtmak gibi bir şey.

## İşi doğru modele vermek

Bütün bu analizden sonra düzen oturdu: Fable yalnızca planlama, mimari karar, kör denetim ve gerçekten zor problemlerde. Zorlu görevler Opus'a, gündelik geliştirme Sonnet'e, küçük dokümantasyon işleri Haiku'ya. Sektörde buna katmanlama deniyor; bizim evdeki adı "işi ehline ver".

Sonuç ölçülebilir. Her şeyi Fable'a yaptırdığım turlarda görev başına ortalama maliyet 2,3 ile 2,5 dolar değerindeydi. Katmanlı düzende aynı kalitedeki görevler 0,58 ile 0,88 dolar aralığına indi. Üç dört kat fark ve yirmi görevlik bir turda yirmide yirmi başarı. Kaliteden tek bir şey vermeden.

Peki yüzde 92'lik faturayı sonunda kim ödedi? Röntgen üç kesitte çekiliyor. Modele göre: Fable yüzde 64, Opus yüzde 22, Sonnet yüzde 11, Haiku yüzde 3. Çarpıcı olan şu ki Fable toplam üretimin token olarak yalnız yüzde 39,5'ini yaptı ama sayacın yüzde 64'ünü doldurdu. Premium etiket her cümlede iki kat yer kaplıyor. Yüzeye göre: işçi filosu yüzde 53, benim interaktif oturumlarım yüzde 47. Bileşene göre: önbellek yazımı yüzde 57, üretilen içerik yüzde 41, ham girdi yüzde 2. Token hacminin yüzde 97'sini oluşturan önbellek okumalarının payı: sıfır.

Temponun fotoğrafı da şu: 60 saatte yüzde 92, gece uykuları çıkınca saatte yaklaşık 15 dolar eşdeğeri aktif yakım demek. Bu tempoyla haftalık hak 44 aktif saat sürüyor. Önceki hafta Opus ağırlıklı düzen limiti beş buçuk günde bitirmişti; Fable'ı beyin koltuğuna alan bu düzen daha az istekle, daha az ham token'la benzer hızda bitiriyor. Çünkü sayaç token değil değer sayıyor ve Fable'ın değeri çift tarifeden yazılıyor.

## Perde arkası: faturanın yarısı görünmeyen yerde

Harcamanın yüzde 57'sinin önbellek yazımına gittiğini söyledim. Bu oran üç haftadır her ölçüm penceresinde aynı çıkıyor; tesadüf değil, düzenin karakteri. O yazmaların da yarıdan fazlası tek bir kaynaktan geliyor: her işçinin işe başlarken tüm proje bağlamını sıfırdan yüklemesi. Aynı kurallar, aynı dokümanlar, aynı talimatlar her işçinin hafızasına ayrı ayrı yazılıyor. On işçi, on kopya.

Kağıt üzerinde çözüm hazırdı. Üretici firmanın dokümantasyonu, paralel başlatılan isteklerin birbirinin hafızasını göremediğini, ama önce bir isteği başlatıp ilk cevabı bekledikten sonra kalanları salarsanız hepsinin ortak hafızadan bedavaya okuyacağını anlatıyor. Beklentim, içerikten hiçbir şey kısmadan, sadece başlatma sırasını değiştirerek toplam tüketimi yüzde 40 civarında düşürmekti.

Denedim. Çalışmadı. Bizim işçiler izole kutularda ayrı oturumlar açıyor ve üreticinin önbelleği bu oturumlar arasında paylaşılmıyor; birinin ısıttığı hafızayı diğeri göremiyor. Güzel teori sahada yarım günde yanlışlandı, ben de mekanizmayı kapattım. Ders ucuz sayılır: varsayımı üretimde büyütmeden önce küçük ölçekte test etmek, bu yazının en az formül kadar değerli alışkanlığı.

İşe yarayan başka bir şey çıktı: her işçinin sırtındaki bagajı küçültmek. Talimat metinlerindeki tekrarları teke indirdim, en hacimli kural dokümanını işçiyi gerçekten ilgilendiren özetiyle değiştirdim, blokların sırasını önbelleğin lehine yeniden dizdim. İçerikten tek kelime feda etmeden, saf ölçümde görev başına maliyet 0,67 dolardan 0,45 dolara indi; yüzde 33 kazanç.

Ama bu kazancın bir huyu var: kendiliğinden eriyor. Sonraki turlarda sisteme eklenen her yeni talimat, her yeni özellik o bagajı sessizce geri büyüttü ve görev başına maliyet 0,54 ile 0,70 bandına geri tırmandı. Optimizasyon bir kerelik zafer değil, sürekli bütçe disipliniymiş. Bagajı bir kez küçültmek yetmiyor; yeniden şişmesini engelleyen bir bekçi gerekiyor.

Bir de israfın şampiyonu var. Limit kesintisine denk gelen bir gece, sistem duvara çarpa çarpa tekrar denemeye devam etti. O turda görev başına maliyet 7,70 dolara fırladı; normalin üç katından fazla. Beş görevlik o tur, sonraki otuz iki görevlik iki turun toplamı kadar yaktı. Duvara çarptığınızda durup nedenini anlamadan tekrar denemeyin; bizim en pahalı gecemiz, ısrarın gecesiydi.

## Kendi sayacım da yalan söyledi

Bu işe başlarken kendime bir kural koymuştum: tüketim raporunu tüketene sorma. İşçilerden kendi kullanım rakamlarını raporlamalarını istemiştik; 69 görevlik örneklemde beyanlar gerçeğin ortalama yüzde 30'u çıktı. En dürüst beyan bile gerçeğin üçte ikisinde kalıyordu. İşçi kendi tüketimini göremiyor ve formu boş bırakmamak için dolduruyor. Çözüm bağımsız sayaçtı; sistemin resmi kayıtlarından okuyan ayrı bir ölçer kurduk.

Sonra o sayacın kendisini denetledim ve keşke daha önce yapsaymışım dedirten bir şey buldum. Model fiyat tablosundaki bayat bir kayıt yüzünden sayaç iki modelin tüketimini sıfır sayıyormuş. Kendi ölçerimiz gerçeğin 2,4 kat altını raporluyormuş ve bunu fark ettirecek bir uyarı da hiç devreye girmemiş. Token sayımı doğruydu; bozuk olan parasal çevrimdi. Aynı gün düzelttik ama ders kalıcı: yalnız beyanlara değil, kendi ölçüm zincirinize de düzenli çapraz sağlama yapın. Bu sabahki yüzde 92 kontrolü tam olarak o ritüeldi ve formülü bir kez daha doğruladı. Sessizce sıfır yazan bir sayaç, hiç olmayan sayaçtan tehlikelidir.

## Yeni cephe: klavyenin başındaki adam

On iki günün en şaşırtıcı sonucu işçilerle ilgili bile değildi. İşçi filosunu katmanlamayla terbiye ettikten sonra son pencerelerin kayıtlarına baktım: harcamanın yüzde 58'i, sonra yüzde 63'ü artık filodan değil, benim klavye başındaki oturumlarımdan geliyordu. Tek bir uzun mimari inceleme oturumu 65 dolar eşdeğerine mal olmuştu; üç tam çalışma turunun toplamından pahalı.

Sebebi yine önbellek. İnsan çalışırken düşünüyor, okuyor, çay koyuyor. O molalar beş dakikalık hafıza penceresini öldürüyor ve her dönüşte tüm bağlam yeniden yazılıyor. Bunu bir de en pahalı modelle yapıyorsanız sayaç, siz ekrana bakarken koşuyor. Son pencerede toplam yakımın yüzde 56'sı tek başına interaktif Fable'dı. İşi doğru modele vermek kuralı anlaşılan yalnız makineler için değil; insan koltuğu da bir model seçimi ve artık en pahalı koltuk orası.

## Dokuz ders

On iki günün özetini dokuz cümleye sığdırmak gerekirse:

1. Abonelik limiti istek ya da token saymaz; kullanımınızın parasal değerini sayar. Pahalı model her cümlede katlanarak yer kaplar.
2. Önbellekten okumak sayaçta bedavadır, API faturasında yüzde 10'dur; önbelleğe yazmak her iki defterde de pahalıdır. Sistemlerinizi okumayı çoğaltıp yazmayı azaltacak şekilde kurun.
3. Bedava görünen model kotanızı tam fiyatından doldurabilir. Fatura ile kota ayrı defterlerdir.
4. Ucuz model pahalı çağrı üretebilir. Maliyeti model etiketi değil, çağrının şekli belirler.
5. En güçlü modelin yeri üretim bandı değil, beyin koltuğudur. Plan, denetim ve mimari karar orada üç dört kat daha fazla iş döndürür.
6. Tüketim raporunu tüketene sormayın ve bağımsız sayacınızı da düzenli denetleyin. Bizde beyanlar üç kat, kendi sayacımız 2,4 kat yanılttı.
7. Optimizasyon kazançları kendiliğinden erir. Kazancı bir kez almak yetmez; geri büyümeyi yakalayan bir bekçi şarttır.
8. En pahalı koltuk sizin koltuğunuz olabilir. Model seçimi disiplini klavye başındaki insan için de geçerlidir.
9. Duvara çarptığınızda durup nedenini anlamadan tekrar denemeyin. Bizim en pahalı gecemiz, ısrarın gecesiydi.

## Kapanış: yüzde 8 ile dört buçuk gün

Şu an elde kalan, haftalık hakkın yüzde 8'i; yaklaşık 52 dolar eşdeğeri. Sıfırlanma salı gecesi, dört buçuk gün sonra. Aktif tempomuzla bu, üç buçuk saatlik Fable yoğun çalışma demek. Önümüzdeki dört günün planı bu yüzden kendiliğinden yazılıyor: Fable yalnız ertelenemeyecek kararlarda, uzun okuma oturumları Opus'ta, geri kalan her şey Sonnet ve Haiku'da.

Fable'ın bedava penceresi 22 Haziran'da kapanıyor; o günden sonra bu hesaplar fatura tarafında da gerçeğe dönüşecek. Ama 60 saatin bilançosu şimdiden tek cümleye sığıyor: Fable 5, doğru koltuğa oturtulduğunda haftalık limitin üçte ikisine bir ekibin haftalarca uğraşacağı mimari işi sığdırıyor; yanlış koltuğa oturtulduğunda aynı limiti iki buçuk günde bitiriyor. Seçim sayacın değil, sizin.

## Bu sayılara neden güvenebilirsiniz?

Yazıdaki tüm kullanım verileri, sistemin her API çağrısı için yerel olarak tuttuğu resmi kayıtlardan derlendi; bunlar tahmin değil, sunucunun döndürdüğü gerçek sayımlar. Mükerrer kayıtlar mesaj kimliğiyle ayıklandı. İşçilerin kendi beyanları kullanılmadı. Üretim iddiaları (commit, sprint, satır sayıları) git geçmişinden alındı. Analiz 1 ile 12 Haziran 2026 arasını, 26 bin civarı isteği, 6,25 milyar token'ı (6 milyarı önbellek okuması) ve dört modeli kapsıyor; Fable dönemi tek başına 60 saat, 8.548 istek ve 2 milyar önbellek okuması demek. Fiyat çarpanları (önbellek yazımı 1,25 katı, okuması 0,1 katı) Anthropic'in resmi fiyat dokümanından alındı ve hesaplara dahil edildi. Limit formülü üretici tarafından yayınlanmadığı için sayaç modeli bir çıkarımdır; ancak altı bağımsız ölçümde yüzde 2 hata payı içinde doğrulanmıştır. Web arayüzündeki kullanım bu kayıtlarda görünmediği için kapsam dışıdır. Parasal değerler abonelikte fiilen ödenmez; modellerin resmi fiyat etiketleriyle hesaplanmış kullanım ağırlıklarıdır. Sayaç yüzdesi tam sayıya yuvarlanarak okunur, bu da ölçümlere artı eksi bir puanlık pay bırakır.

---

## Veri Eki: Grafik üretmek isteyenler için

Aşağıdaki tablolar yazıdaki tüm grafiklenebilir veriyi içerir. Herhangi birini kopyalayıp claude.ai ya da chatgpt.com gibi bir araca yapıştırın ve önerilen komutu verin; yazıya görsel olarak ekleyebileceğiniz grafikler üretilecektir.

### Tablo 1. Limit hipotez testi (hangi metrik yüzde 41'i açıklıyor?)

| Hipotez | Hesaplanan oran | Gözlenen değer | Sonuç |
|---|---|---|---|
| İstek sayısı | %23 ile %26 | %41 | Elendi |
| Ham üretilen token | %26 | %41 | Elendi |
| Tüm token (önbellek dahil) | %20 | %41 | Elendi |
| Parasal değer, okuma resmi %10 oranıyla | %37,5 | %41 | Elendi (yakın ama tutmuyor) |
| Parasal değer, okuma hariç | %40 ile %43 | %41 | Doğrulandı |
| Parasal değer, Fable bedava sayılırsa | %6 | %41 | Elendi |

Önerilen grafik ve komut: "Bu tabloyu yatay çubuk grafiğe çevir; her çubuk bir hipotezin hesaplanan oranı olsun, yüzde 41'e dikey bir referans çizgisi ekle, doğrulanan satırı farklı renkle vurgula."

### Tablo 2. Formülün altı doğrulama noktası

| Sınav | Pencere | Sayaç hareketi | Formülün öngörüsü | Ölçülen | Sonuç |
|---|---|---|---|---|---|
| 1 | 7 günlük tam hafta | %0'dan %100'e | (kalibrasyon bazı) | ~650 dolar eşdeğeri | baz nokta |
| 2 | Sıfırlama sonrası 19 saat | %0'dan %41'e | (kalibrasyon bazı) | ~267 dolar eşdeğeri | baz nokta |
| 3 | 4,5 saat | %41'den %51'e | 59 ile 72 dolar | 70,9 dolar | doğrulandı |
| 4 | 21,5 saat | %51'den %76'ya | 156 ile 169 dolar | 162,7 dolar | doğrulandı (aralığın ortası) |
| 5 | 15 saat (7'si aktif) | %76'dan %92'ye | 98 ile 111 dolar | 103,6 dolar | doğrulandı (aralığın ortası) |
| 6 | 60 saatlik tam dönem | %0'dan %92'ye | ~599 dolar (%92) | 602,1 dolar (%92,5) | doğrulandı (bütünleme) |

Önerilen grafik ve komut: "3 ile 6 arası satırları öngörü aralığı (hata çubuğu) üzerine ölçülen değer noktası olarak çiz; başlık 'Altı sınavda tutan formül artık tahmin değil, sayaçtır'."

### Tablo 3. Önbellek okuması büyük ölçek testi (resmi %10 oranı sayaçta geçerli mi?)

| Senaryo | %76'dan %92'ye penceresi | 60 saatlik dönem |
|---|---|---|
| Okuma sayılmaz modeli (ölçülen) | 103,6 dolar, 16 puan eder | 602 dolar, %92,5 eder |
| Okuma resmi %10'la sayılsaydı | 288 dolar, 44 puan ederdi | 2.067 dolar, %318 ederdi |
| Sayaçta gözlenen | 16 puan | %92 |

Not: API faturası okumaları gerçekten %10'dan sayar; abonelik sayacı saymaz. Okuma ağırlığının üst sınırı resmi oranın %4'ü.

Önerilen grafik ve komut: "İki gruplu çubuk grafik yap; her grupta 'okuma sayılmaz' ve 'okuma %10' çubukları olsun, gözlenen değere yatay referans çizgisi ekle."

### Tablo 4. 200 dolarlık abonelik ne satın alıyor?

| Defter | Haftalık | Aylık | Aboneliğe oranı |
|---|---|---|---|
| Abonelik fiyatı | ~46 dolar | 200 dolar | 1 kat |
| Sayacın saydığı kota (önbellek okuma hariç) | ~650 dolar eşdeğeri | ~2.800 dolar eşdeğeri | ~14 kat |
| API'nin keseceği gerçek fatura (okumalar dahil, bizim kullanım şekli) | ~2.000 dolar | ~8.500 dolar | ~40 kat |

Not: 40 kat çarpanı, trafiğin %97'sinin önbellek okuması olduğu bizim düzenimize özgüdür; önbellek verimliliği düşük kullanımda fatura tabanlı kaldıraç 14 kata doğru geriler.

Önerilen grafik ve komut: "Bu tabloyu üç çubuklu logaritmik karşılaştırmaya çevir: abonelik fiyatı, kota değeri, fatura değeri; her çubuğun üstüne kat çarpanını yaz."

### Tablo 5. Aynı haftalık iş yükü tek modelde koşsaydı

Bütçe tabanı: altı noktayla kalibre edilen haftalık hak, yaklaşık 650 dolar eşdeğeri.

| Senaryo | Haftalık hakkın yüzdesi | Hak ne zaman biter |
|---|---|---|
| Yalnız Fable 5 | %262 | 2,7 günde |
| Yalnız Opus | %131 | 5,4 günde |
| Yalnız Sonnet | %78 | Bitmez (8,9 günlük kapasite) |
| Yalnız Haiku | %26 | Bitmez (26,8 günlük kapasite) |

Önerilen grafik ve komut: "Bu tabloyu çubuk grafiğe çevir; %100 seviyesine 'haftalık limit' etiketli yatay çizgi ekle; %100 üstü çubukları kırmızı tonla."

### Tablo 6. İstek başına maliyet ve önbellek isabet oranı (model karakterleri)

| Model | İstek başına değer (dolar eşdeğeri) | Önbellek isabet oranı |
|---|---|---|
| Sonnet | 0,022 | %95 |
| Haiku | 0,045 | %48 |
| Opus | 0,089 | %98 |
| Fable 5 | 0,127 | %98 |

Not: Bu tablo, sorunun teşhis edildiği haftanın fotoğrafıdır. Çağrı şekli düzeltmeleri sonrası Haiku'nun isabet oranı %84'e çıktı; hâlâ en düşük, ama yön doğru.

Önerilen grafik ve komut: "Bu tabloyu saçılım (scatter) grafiğine çevir: x ekseni istek başına değer, y ekseni isabet oranı, her nokta model adıyla etiketli. Haiku noktasına %48'den %84'e düzelme okunu ekle."

### Tablo 7. Fable döneminin model kırılımı (60 saat, sayaç payları)

| Model | İstek | Üretilen token | Sayaç payı (dolar eşdeğeri) | Sayaç payı (%) |
|---|---|---|---|---|
| Fable 5 | 2.921 | 3,09 milyon | 386,5 | %64,2 |
| Opus | 1.910 | 2,71 milyon | 131,0 | %21,8 |
| Sonnet | 2.847 | 1,62 milyon | 65,9 | %10,9 |
| Haiku | 870 | 0,41 milyon | 18,7 | %3,1 |
| Toplam | 8.548 | 7,83 milyon | 602,1 | %100 |

Önerilen grafik ve komut: "Yan yana iki halka grafik: solda üretilen token payları, sağda sayaç payları; Fable'ın üretimde %39,5 iken sayaçta %64,2 olmasını vurgula."

### Tablo 8. Harcamanın bileşenleri (60 saat)

| Bileşen | Token hacmindeki payı | Limit sayacındaki payı |
|---|---|---|
| Önbellek okuma | %97,1 (2,04 milyar) | %0 |
| Önbellek yazma | %2,5 (52,1 milyon) | %57,0 |
| Üretilen içerik | %0,4 (7,8 milyon) | %41,3 |
| Ham girdi | %0,06 (1,25 milyon) | %1,7 |

Önerilen grafik ve komut: "Bu tabloyu yan yana iki halka grafiğe çevir: solda token hacmi payları, sağda limit sayacı payları. Aynı bileşen iki grafikte aynı renkte olsun; kontrastı vurgula."

### Tablo 9. Yüzey kırılımı: işçi filosu mu, klavye başı mı?

| Pencere | İnteraktif (beyin) payı | İşçi filosu payı |
|---|---|---|
| 60 saatlik dönem toplamı | %46,6 (280,6 dolar) | %53,4 (321,5 dolar) |
| %51'den %76'ya penceresi | %58,5 | %41,5 |
| %76'dan %92'ye penceresi | %63,1 (65,4 dolar) | %36,9 (38,2 dolar) |

Önerilen grafik ve komut: "Yığılmış yüzde çubuk grafiği, üç pencere; başlık 'En pahalı koltuk artık klavyenin başı'."

### Tablo 10. Görev başına gerçek maliyet, yedi çalışma turu (model düzeninin etkisi)

| Çalışma turu | Model düzeni | Görev sayısı | Görev başına değer (dolar eşdeğeri) |
|---|---|---|---|
| Tur A | Sonnet ağırlıklı | 15 | 0,58 |
| Tur B | Tümü Fable | 12 | 2,27 |
| Tur C | Tümü Fable | 5 | 2,47 |
| Tur D | Tümü Fable, limit kesintili | 5 | 7,70 |
| Tur E | Katmanlı (Opus, Sonnet, Haiku) | 20 | 0,88 |
| Tur F | Katmanlı (Sonnet ağırlıklı) | 12 | 0,58 |
| Tur G | Katmanlı, bagaj küçültmeli | 6 | 0,56 |

Not: Bagaj küçültmenin saf etkisi, model karışımından arındırılmış Sonnet bazlı ölçümde görülür: görev başına 0,67'den 0,45'e, yüzde 33 düşüş. Sonraki turlarda bu değer 0,54 ile 0,70 bandına geri tırmandı; yazıdaki "kazanç kendiliğinden erir" bulgusunun verisi budur.

Önerilen grafik ve komut: "Bu tabloyu zaman sıralı çubuk grafiğe çevir; tümü Fable çubuklarını bir renkte, katmanlı çubukları başka renkte göster; kesintili turu desenli dolguyla işaretle ve üzerine 'limit kesintisi ve tekrar denemeler' notu ekle."

### Tablo 11. Fable 5'in üretim bilançosu

| Kalem | Değer |
|---|---|
| İlk 19 saatte üretilen token | 1,87 milyon (Opus'un tam haftası: 7,77 milyon) |
| İlk gece | 7 otomatik çalışma turu, 19.000+ satır |
| 60 saatte commit | 109 |
| Sprint hattı | 264'ten 285'e |
| Mimari karar denetimi | 78 karar, 14 parti, tek oturum 65 dolar eşdeğeri |
| Kod analizi | 12 katman, yalnız çekirdekte 148 modül |
| Yeni alt sistem tasarımı | 1 spesifikasyon, 6 kör denetim, 14 görevlik plan |
| Ürün sprint'i | 3 adet; gerçek zamanlı panel gecikmesi 153 ms ölçüldü |

Önerilen grafik ve komut: "İlk satırı saat başına üretim hızına çevirip iki çubukla karşılaştır: Fable'ın 19 saatlik ortalaması ile Opus'un 168 saatlik ortalaması. 'Yarım günde haftalık üretimin dörtte biri' başlığını kullan."

### Tablo 12. Beyan ile bağımsız sayaç arasındaki fark

| Ölçüm | Değer |
|---|---|
| İşçi beyanlarının gerçeğe oranı (ortalama) | %30 |
| En düşük gözlenen oran | %8 |
| En yüksek gözlenen oran | %68 |
| İncelenen görev sayısı | 69 |
| Kendi sayacımızdaki fiyat hatasının boyutu | 2,4 kat düşük raporlama |

Önerilen grafik ve komut: "Bu veriyle bir gösterge (gauge) ya da tek çubuklu karşılaştırma yap: 'beyan edilen' %30 dolu, 'gerçek' %100 referans; alt başlık olarak 'tüketimi tüketene sormayın, kendi sayacınızı da denetleyin' yaz."
