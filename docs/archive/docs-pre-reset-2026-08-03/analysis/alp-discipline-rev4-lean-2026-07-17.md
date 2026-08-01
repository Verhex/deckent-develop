# Alp Discipline — Rev-4.2 · **v1.0 ÇEKİRDEK — DONDURULDU (Alperen-onayı, 2026-07-18)**

> **Rev-4.1 → Rev-4.2 (2026-07-18, Fable-5 taze-göz incelemesi → Alperen "kabul edildi"):**
> iki mikro-düzeltme işlendi ve metin **v1.0 çekirdeği olarak donduruldu.** Bundan sonraki
> değişiklik-kanıtı metin-analizinden değil, **kullanımdan** gelir; ilk kullanım-kanıtı
> inceleme-turunun kendisiydi (ESSENCE'ın gerçek ajan-tüketicisi tarafından tüketilmesi).
> Kalan iş metne değil, yayına aittir: repo-bölünmesi · EN-çeviri + EN-essence mikro-onayı ·
> repo-host.

> **Rev-4 → Rev-4.1 (2026-07-18, iki-analiz mutabık: uygula-ve-dondur):** yedi cerrahi düzeltme
> — hiçbiri aparat eklemez; ikisi *silinmiş öğretici cümlelerin geri konması* (sahip tanımı,
> İlke-4 köprüsü), biri *yanlış-tasnif düzeltmesi* (solo hüküm çekirdeğe döner), biri *üç
> AI-yüzeyi → bir*, üçü *ifade-inceltme* (kayıp tanımı · "yetki alanı içinde" · coğrafi-isim
> soyutlaması). Net etki: çekirdek ~40-60 kelime uzar, taşınabilirlik değişmez, iki gerçek
> okunabilirlik açığı + bir ajan-güvenlik açığı kapanır. Künye: en altta.

> **Bu revizyonun sebebi (dürüst kayıt):** Rev-1→Rev-3 boyunca her tur "nasıl daha sağlam"
> diye ittik; her tur bir edge-case, bir kabuk, bir yönetişim-katmanı ekledi. İki bağımsız
> analiz aynı şeyi söyledi, Alperen aynı şeyi istedi: **soru yanlıştı.** Global bir disiplin
> için mesele "nasıl daha sağlam" değil, **"nasıl daha taşınabilir."** Yayılan disiplinler
> sağlam olanlar değil, bir kişinin diğerine tek nefeste aktarabildikleridir.
>
> Bunu disiplinin kendi diliyle söylemek gerekirse: **Rev-3 kendi İlke-2'sini ihlal etti** —
> kanıtlanmış gereksinime değil, *hayal edilen suistimale* genişledi (sahte-acil, sessiz
> sabotaj, gamed-tetik…). Bunlar iyi-niyetli yetkin uygulayıcının kullanımından değil,
> "birisi bunu nasıl kötüye kullanır" sorusundan doğdu — ve o soru **denetimin/güvenliğin
> işidir, disiplinin değil.** Rev-4 geri adım atıyor: çekirdek, iyi-niyetli yetkin
> uygulayıcının kendi kendine çıkaramayacağı **tek şeyi** öğretir; gerisini onun yargısına
> bırakır.
>
> **Rev-3 çöpe atılmadı** — `alp-discipline-universal-draft-2026-07-17.md` olduğu gibi
> korunuyor. O apparatus (EDGE-CASES, GOVERNANCE, CONFORMANCE, VERSIONING, şemalar, deckent
> profili) yanlış değil; yalnız **çekirdeğin değil, uygulamanın** malzemesi — ve deckent'in
> kendi Faz-2'sinin zaten ihtiyaç duyacağı şey. İlke-4 diliyle: tehlikeli-yol kapatılmadı,
> **kayıtla saklandı**; başarısız-deney de kalıcı ilerlemedir.

---

## Hedef repo yapısı (yalın)

```text
alp-discipline/
├── README.md            — ne · kime · nasıl okunur (5 dk)
├── DISCIPLINE.md        — çekirdek: amaç · 6 tanım · 4 ilke · üstün-norm · non-goal'ler (aşağıda)
├── ESSENCE.md           — 100-150 kelime, akılda-kalan + AI-prompt sürümü
├── APPLYING.md          — ZORUNLU DEĞİL uygulama rehberi. BÜYÜME KURALI (v1): en çok 3-4 madde,
│                          her biri KANITLANMIŞ-gereksinim (gerçek kullanımda sorulmuş soru); hayal-
│                          edilen-suistimal (sahte-acil · gamed-tetik · sabotaj-semantiği) arşivde kalır
├── EXAMPLES.md          — çok-alan örnekleri. v1.0 çıkışında ≥2 yazılım-DIŞI örnek DOLU olmalı
│                          (araştırma + operasyon) — yoksa "koddan bağımsız" iddiası İlke-1'ce kanıtsız
├── translations/
│   ├── tr.md            — Türkçe (kaynak dil; DISCIPLINE.md EN olduğunda buraya ayna)
│   └── en.md
├── ACKNOWLEDGEMENTS.md  — "Created by Alperen Sartacoglu."
└── LICENSE              — CC-BY-4.0 (metin)
```

**Rev-3'ten fark:** EDGE-CASES / GOVERNANCE / CONFORMANCE / VERSIONING / profiles/ / schemas/
çekirdek repodan çıktı. Bunlar ayrı bir izlek: *Alp Discipline **implementations*** (deckent
entegrasyonu · agent-prompt şablonu · JSON şemaları · kurumsal benimseme modeli). Marka kuralı:
**disiplin tek ve basit kalır; uygulamaları sınırsız olabilir.**

**Deckent'in rolü değişti:** kaynak/otorite/referans-norm **değil**, yalnız *disiplinin ilk
kapsamlı uygulama örneği* — ana repoda bulunması bile şart değil, ayrı bir case-study olur.

---

# DISCIPLINE.md — çekirdek taslak `[hedef: ~1200-1500 kelime, 5-8 dk, teknik-geçmiş gerektirmez]`

## Amaç

Bu bir karar disiplinidir — proje-yönetim metodu, zanaat kılavuzu veya uyum-standardı değil.
Tek işi vardır: **bir insanın ya da bir AI ajanının bir sınırla karşılaştığı anda daha doğru
karar vermesini sağlamak.** Nasıl uygulanacağını okuyucuya bırakır; kendi bürokrasisini
üretmez. **Alan, sektör ve rol fark etmeksizin** — bir insan da, bir AI ajanı da — aynı dört
ilkeyi okuyup kendi bağlamında ne yapacağını çıkarabilmelidir.

## Altı taşıyıcı tanım

- **Sınır** — geçilmemesi kararlaştırılmış çizgi. Yumuşak (gerekçeyle sapılabilir), sert
  (yalnız gereksinim açar) veya temel/değişimi-özel-sürece-bağlı olabilir.
- **Sahip** — bir sınır üzerinde *bugün* yorumlama ve değiştirme yetkisi olan taraf; sınırı ilk
  koyanla aynı olmak zorunda değildir (**köken ≠ yetki**). Bağlama göre değişir: amir, müşteri,
  etik-kurul, fon-veren — ya da solo çalışmada bir başka anki *sen* (bkz. İlke 2).
- **Hedef ≠ yaklaşım** — hedef *ne* başarmak istediğin; yaklaşım *nasıl* denediğin. İkisini
  ayırmak bu disiplinin en çok işe yarayan tek hamlesidir.
- **Gereksinim** — hedefin nesnel olarak *zorunlu* kıldığı şey. Tercih değildir; rahatsızlık
  değildir; "başka yol yok" demek değildir — tükenmiş alternatiflerle *kanıtlanan* şeydir.
- **Kayıp** — bilinçli-yetkili bir ödünleşme *değil*, **beyan edilmiş hedefe veya kabul edilmiş
  ölçüte** karşı doğrulanabilir bir kötüleşme (başta öngörülmemiş olabilir; süreç içinde görünür
  hale gelmesi yeter). Kabul edilmiş trade-off'u "kayıp" diye işaretlemek disiplinin suistimalidir.
- **İrtifa** — kararın *ne kadar büyük* olduğu değil, **hangi seviyedeki gerçeği değiştirdiği:**
  yerel müdahale (*yama*) · sınırlı ama bütünlüklü değişiklik (*dilim*) · sistem-düzeyi değişiklik
  (*tasarım*) · kural/yönetişim değişikliği (*anayasa*).
- **Non-goal** — bilinçli olarak *yapmayacağın* şey. Geçerli bir non-goal'un çekim kuvveti
  vardır (söylenmeseydi biri yapardı); onu adlandırmak gerçek bir karardır.

---

## İlke 1 — Önce negatif alanı çiz

Pozitif tasarım sonsuz yöne açılabilir; onu işe dönüştüren negatif alandır. Ve bir sınırı
*listelemek* ile *anlamak* aynı şey değildir: **hayalinde ihlal edemediğin bir sınırı
anlamamışsındır.** O yüzden ne yapacağını tasarlamadan önce ne yapmayacağını adlandır — ve
taşıyıcı/en-riskli sınırlar için gerçekçi bir ihlal örneği vererek anladığını kanıtla.

Bir non-goal'un geçerli olup olmadığını üç soru söyler: **çekim kuvveti** (söylenmeseydi yetkin
uygulayıcı yapar mıydı?) · **karar bilgisi** (dışarıda bırakmak gerçek bir karar mıydı?) ·
**gözlemlenebilir ihlal** (gerçekleşse fark edilir miydi?). Bir non-goal'ü kaldırmak da bir
sınır-değişikliğidir; sessizce düşürülmez.

*Anti-pattern:* boş non-goal · ihlal-koşulsuz liste · ritüel doldurma.

## İlke 2 — Genişleme gereksinime verilir, yaklaşıma değil

Resmî bir istisna yolu var olduğu anda sınırın psikolojisi değişir — duvar müzakere masasına
dönebilir. Bu yüzden mekanizmanın nesnesi **ihlal değil, gereksinimdir.** **Sınırın canını
acıtması, yanlışlığının kanıtı değildir; çoğunlukla çalıştığının kanıtıdır** — *ama yalnız
çoğunlukla:* bazen acı, sınırın yanlış kurulduğunu gösterir, ve o vaka İlke 3'ün konusudur.

Sınır seni engellediğinde sırayla:

1. **Neyi engelliyor — yaklaşımını mı, hedefi mi?** Yasak soru "*bu sınırı nasıl aşarım?*";
   zorunlu soru "*hedef tam olarak neyi gerektiriyor?*". Sınır yaklaşımını engelliyorsa işini
   yapıyordur; tek meşru hamle sınır içinde başka yaklaşım aramaktır — vakaların çoğu burada
   biter.
2. **Gereksinim, tükenmiş alternatiflerle kanıtlanır** — tercih değil, tükenme. Arama derinliği
   kararın etkisine ve geri-döndürülebilirliğine orantılıdır (sonsuz araştırma da karar-felci
   de kaçıştır).
3. **Tek-seferliği yapısaldan ayır.** Tek-seferlik gereksinim gerekçelendirilir ve **emsal
   oluşturmaz** — "geçen sefer verilmişti" bir gerekçe değildir; emsal-zinciri sınır-çürümesinin
   ta kendisidir. Yapısal (tekrarlayan) gereksinim istisna biriktirmez; **sınırın kendisini
   değiştirir.**

**Kendine genişleme verme.** Kararı sınırın sahibi verir; sen yalnız taşırsın — mekanizma bir
yetki değil, bir *ses kanalıdır.* **Sahip sensen ayrım zamansaldır** (solo çalışmanın çoğunluk
vakası): karar-veren-sen ile uygulayan-sen aynı an değildir; kaydı bırakmak, uygulama-kipindeki
seni karar-kipindeki sana taşır — bu yüzden *"ben sahibim, o hâlde serbestim"* bu ilkeyi ters
okumaktır. (Kayıt alanları, süre-dolumu, tekrar-eşiği gibi mekanikler zorunlu değildir; isteyen
için APPLYING.md'de.)

*Anti-pattern:* emsal göstermek · yaklaşımın acısını gereksinim diye anlatmak · tüketim-kanıtı
olmadan "başka yol yok" demek.

## İlke 3 — Kayba giden rotada dürüst duruş

En pahalı kayıplar, birilerinin gördüğü ama söylemediği kayıplardır. Bu ilke **yukarı-yönlü
dürüstlüğü lisanslar:** yön-koyana kanıtlı itiraz, sadakatin en yüksek biçimidir.

Ayrım önce yapılır: *yaklaşımının* engellenmesi İlke 2'dir; **rotanın/hedefin kendisinin**
kayba gitmesi İlke 3'tür. Duruş kanıt-kapılıdır — **rahatsızlık kanıt değildir, doğrulama
kanıttır.** Doğrulanmış kanıt mevcut rotanın kayba gittiğini gösteriyorsa, rotayı kim koymuş
olursa olsun (süreç sahibi, müşteri, amir, kullanıcı dahil) **uygulamadan önce dur**; kanıtı ve
**en küçük karşı-öneriyi** karar sahibine ilet — ve *"hiç yapmama"* geçerli bir karşı-öneridir.

**Karar sahibinde kalır.** **Yetki alanı içinde**, bilgilendirilmiş ısrar sahibin hakkıdır;
disiplinin garantisi itaatsizlik değil, **kanıtın karardan önce sahibine ulaşmış olmasıdır.** Sonrası: uygula (kayıt
düşerek) ya da resmî çekil. **Asla** sessiz uygulama, sessiz sabotaj, gizli yavaşlatma.

**Üstün normlar (tek hüküm):** Hiçbir karar sahibi; hukuka aykırılığı, insan güvenliğine açık
zararı, temel hak ihlalini veya bilerek yanıltmayı yalnızca **ısrar ederek** meşru kılamaz —
bu dört norm disiplinin taşınmaz zeminidir. Disiplin bu noktada saf-prosedür değildir.

**Zararı sınırlama (tek hüküm):** Aktif ve geri-döndürülemez zarar ilerliyorsa (çöken sistem,
ilerleyen veri kaybı, istismar edilen açık), yetkini genişletmeden önce **zararı en dar ve
güvenli biçimde sınırla**, sonra kararı yetkiliye taşı. Bu bir genişleme değil, triyajdır. Bir
AI ajanı için varsayılan **güvenli-durmadır**; ötesi ancak açıkça verilmişse. (Mekanik ve
eskalasyon-kanalları: APPLYING.md.)

*Anti-pattern:* bilinen-kötüyü sessizce uygulamak · his-temelli itiraz · karşı-önerisiz ret ·
İlke-3'ü İlke-2'nin kanıt-yükünden kaçış-kapısı yapmak.

## İlke 4 — Doğru irtifa, kalıcı adım

Yanlış-irtifa birinci-sınıf hatadır: anayasa-işini yama diye yapmak felaket, yamayı anayasa-işi
diye yapmak felçtir. **İrtifa "ne kadar iş", kalıcılık "hangi dürüstlükte iş" sorusudur — bu iki
şey tek ilkede birleşir, çünkü geçiştirmenin en verimli üreteci yanlış-irtifadır.** O yüzden işe
başlamadan **irtifanı beyan et** — yama · dilim · tasarım · anayasa. Adım boyunu bilinçli seç; ve **karar-olgunluğunu çift yönlü sor:** *"Bu karar şimdi
olgun mu? Beklemek hangi kanıtı satın alır; gecikmek hangi kaybı yaratır?"* — bu soru
**kanıt-yeterliliği** hakkındadır, takvim hakkında değil.

İrtifa değişiyorsa yeniden beyan et; **sessiz irtifa-kayması yasaktır.** Ve düşük irtifa, üst
sınıf bir sınırı aşma yetkisi üretmez: **"bu yalnız küçük bir yama" bir yetki cümlesi
değildir** — iş temel bir sınıra dokunduğu anda yeniden sınıflandırılır ya da durur.

Her adım **kalıcı olarak ilerletmeli:** sessiz borç yok, sahte tamamlanma yok, kalan iş
adlandırılmış. Kalıcı ilerleme yalnız çalışan-çıktı değildir — **belirsizliğin azalması, yanlış
hipotezin elenmesi, tehlikeli yolun kayıtla kapanması da kalıcı ilerlemedir.** Geçiştirmek
hiçbir irtifada meşru değildir.

*Anti-pattern:* süresiz "geçici" çözüm · tamamlanma tiyatrosu · beyansız irtifa-kayması ·
"küçük yama" diyerek temel sınıra dokunmak.

---

## Disiplinin kendi non-goal'leri

*(kendi İlke-1'ini uyguluyor — davranış-tabanlı ihlal göstergeleriyle:)*

- **Proje-yönetim metodu değildir** — *ihlal:* seremoni/rol/kadans zorunlu kılan hüküm.
- **Zanaat disiplini değildir** — *ihlal:* araç/teknoloji/üslubu evrensel ilke diye dayatmak.
- **Uyum-checklist'i değildir** — *ihlal:* anlama-testlerini kutucuğa indirmek.
- **Yetki devri değildir** — *ihlal:* karar yetkisini sahipten uygulayıcıya taşıyan okuma.
- **Zamanlama/önceliklendirme yönetimi değildir** — *ihlal:* metne takvim/kadans/öncelik kuralı.

## AI ve özet yüzeyi

Bir AI ajanının (veya hızlı-hatırlamanın) tüketeceği yüzey **tektir** ve ayrı tutulur:
dört-madde çapa + beş yönlendirme-sorusu + **dört taban-kısıt**, hepsi tek yerde → **ESSENCE.md**.
Bu dosya (DISCIPLINE.md) kanondur; ESSENCE onun daima-mevcut, kayıpsız-olmayan çapasıdır — üç
ayrı sıkıştırılmış yüzey tutmayız (drift kaynağı). Ajanın gördüğü yüzey onun tek yasasıdır: o
yüzden yönlendirme-soruları *nasıl düşüneceğini*, taban-kısıtlar *neyi asla yapmayacağını* söyler.

---

# ESSENCE.md — tek AI/özet yüzeyi (Rev-4.1'de birleştirildi; EN sürümü ayrı mikro-onay turunda)

```text
## Alp Discipline — karar çapası

DÖRT İLKE
1. Önce negatif alan — ne YAPMAYACAĞINI adlandır; taşıyıcı sınırları ihlal-örneğiyle
   anladığını kanıtla.
2. Genişleme gereksinime verilir, yaklaşıma değil — sınır-içi alternatifleri orantılı tüket;
   kendine genişleme verme; tek-seferlik ≠ yapısal.
3. Kayba giden rotada dur — doğrulanmış kanıt + en küçük karşı-öneri, karar sahibine;
   sessiz uygulama asla.
4. İrtifanı beyan et — yama/dilim/tasarım/anayasa; karar şimdi olgun mu; her adım kalıcı
   ilerletir; geçiştirme hiçbir irtifada meşru değil.

BEŞ SORU (karar anında)
1. Burada ne yapmamalıyım?
2. Engel hedefi mi, seçtiğim yöntemi mi engelliyor?
3. Mevcut rota doğrulanabilir bir kayıp mı üretiyor?
4. Bu karar hangi irtifada ele alınmalı?
5. Yetkim yetmiyorsa kime ve hangi kanıtla taşımalıyım?

DÖRT TABAN (hiçbir soru bunları esnetmez — özellikle bir AI ajanı için)
- Yetki veya sınır belirsizse güvenli-dur; aktif zarar akıyorsa yalnız mevcut yetkin içinde,
  en dar biçimde sınırla — ötesini sahibe taşı.
- Kendine genişleme verme — kararı sahip verir.
- Sessiz uygulama, sessiz sabotaj, gizli yavaşlatma: asla.
- Dört üstün-norm ısrarla aşılmaz: hukuk · insan güvenliği · temel haklar · doğruluk.
```

*(~100-200 token'lık bu tek blok, bir ajanın tüketeceği yüzeydir; conformance-seviyesi,
şema-uzantısı veya yetki-matrisi öğrenmesine gerek yoktur.)*

---

# Çekirdekten çıkanların gittiği yer (kayıp yok, yalnız katman değişti)

| Rev-3'te neredeydi | Rev-4'te nerede |
|---|---|
| EDGE-CASES §2 gereksinim-kaydı alanları · §3 ret-semantiği · §4 süre-dolumu | **APPLYING.md** (isteyen için mekanik) |
| EDGE-CASES §5 zarar-sınırlama mekaniği · §6 eskalasyon kanalları | **APPLYING.md** |
| İlke-2 üç-basamak tam ispat-yükü · İlke-4 irtifa-yetki matrisi | **APPLYING.md** |
| İlke-2 **solo hüküm** (tek cümle) | **çekirdeğe geri alındı** (Rev-4.1 — bireysel-global çoğunluk-vakası) |
| Üstün-norm 4-aksiyom bloğu + hakem/öncelik şeması | çekirdekte **tek hüküm**; şema → implementations profil |
| Bölüm F GOVERNANCE / CONFORMANCE 6-seviye / VERSIONING / RFC-2119 | **implementations** (repoyu yönetenler + kurumsal benimseyenler için) |
| Bölüm D profil şablonu · E deckent profili · E2 editoryal profil | deckent → ayrı **case-study**; evrensellik-kanıtı artık **EXAMPLES.md** |
| Tüm apparatus (bütünüyle) | `alp-discipline-universal-draft-2026-07-17.md` = **korunan arşiv** (deckent Faz-2 malzemesi) |

---

# Rev-4.1 değişiklik künyesi (yedi cerrahi düzeltme)

1. **Sahip = 7. tanım** — çekirdekte 6+ kez taşıyıcı rolde ama tanımsızdı; "bugünkü yetki; köken ≠ yetki".
2. **İlke-2 solo hüküm çekirdeğe döndü** — solo, uç-vaka değil bireysel-global *çoğunluk*-vakası; "ben sahibim = serbestim" ters-okumasını kapatır (yanlış-tasnif düzeltmesi — Rev-4 onu APPLYING'e sürmüştü).
3. **İlke-4 köprü-cümlesi geri kondu** — "irtifa=ne kadar iş / kalıcılık=hangi dürüstlükte iş, tek ilkede birleşir…"; Rev-1 regresyonuydu, öğretici sınıfından.
4. **Üç AI-yüzeyi → bir** (ESSENCE.md) + **dört taban-kısıt** eklendi (belirsizlikte-dur · kendine-genişleme-yok · sessiz-uygulama-asla · üstün-normlar) — beş soru ajana *nasıl düşüneceğini* söylüyordu, *neyi asla yapmayacağını* söylemiyordu; ajanın tek yasası o yüzeydir.
5. **"Kayıp" tanımı** — "öngörülebilir" darlığı kaldırıldı → "beyan edilmiş hedefe/ölçüte karşı doğrulanabilir kötüleşme (sonradan görünür olabilir)".
6. **"Yetki alanı içinde"** — "bilgilendirilmiş ısrar sahibin hakkıdır" tek-başına-alıntıda fazla-mutlaktı; üstün-norm sınırını cümleye taşıdı.
7. **Coğrafi-isim soyutlandı** — Tokyo/São Paulo (test, amaç değil; EN'de göze batardı) → "alan, sektör ve rol fark etmeksizin".

# Rev-4.2 değişiklik künyesi (Fable-5 tüketici-testi; 2 mikro-düzeltme → FREEZE)

8. **ESSENCE taban-satır-1 kapsamlandı** — "Belirsizlikte güvenli-dur; aktif zararı, yetkini
   genişletmeden en dar biçimde sınırla" çifte-sıkıştırmaydı ve ajan-tüketicide çift yönlü
   misfire üretiyordu (*over-stop:* her belirsizlikte durma → felç; *over-act:* "sınırla"nın
   örtük eylem-ruhsatı okunması). Yeni hali belirsizliği **yetki/sınır**a kapsar, eylemi
   **mevcut yetki içine** alır, kuyruğa eskalasyonu ekler ("ötesini sahibe taşı") —
   DISCIPLINE-çekirdeğindeki "varsayılan güvenli-durma; ötesi ancak açıkça verilmişse"
   hükmüyle bire-bir hizalanır. *(Taban-bloğu Rev-4.1'de doğdu; ilk gerçek tüketici-testini
   bu turda gördü — yeni cephe değil, 4. düzeltmenin tamamlanması.)*
9. **"Epistemik hazır-olma" → "kanıt-yeterliliği"** — Rev-3 glossu kesimde düşmüş, Yunanca
   terim çıplak kalmıştı; "teknik-geçmiş gerektirmez" iddiasıyla çelişiyordu. Terim atıldı,
   anlam korundu.

# Karar durumu

| | |
|---|---|
| **Bu revizyon** | **Rev-4.2 — v1.0 ÇEKİRDEK, DONDURULDU** (Alperen-onayı 2026-07-18: "kabul edildi") |
| **Freeze-sonrası kural** | Metne değişiklik yalnız **kullanım-kanıtıyla** açılır (dokümanın kendi İlke-2'si); metin-analizi turları kapandı |
| **Açık gate — CEVAP** | Rev-3 apparatus'u **şimdilik hiçbir yerde aktif olmasın:** korunan-arşiv olarak dursun; deckent kendi Faz-2'sinde *kanıtladığı* maddeyi geri çağırsın. APPLYING.md **yeni bloat-havuzu olmasın** → büyüme-kuralı repo-ağacında sabit. |
| **Kalan iş (yayın)** | repo-bölünmesi · EN kanonik çeviri + EN-essence mikro-onayı · repo-host (sıralama Alperen; SURF-treni öncelikli) |
| **EN-turu notları** | (a) *dilim* → kavramsal EN: `bounded coherent change` (düz `slice` belirsiz); yama/tasarım/anayasa = patch/design/constitution, tanımlar sektör-bağımsız. (b) Dil-yapısı: kök `DISCIPLINE.md`+`ESSENCE.md` = kanonik EN; TR → `translations/tr/` ayna + kaynak-provenance notu. |
| **Korunan** | *gereksinim* (istisna DEĞİL — İlke-2 içgörüsü o kelimede); öğretici cümleler ("sınırın canını acıtması…", "hayalinde ihlal edemediğin sınırı anlamamışsındır"); *temel* sınır-sınıfı ≠ *anayasa* irtifa-seviyesi (Rev-4 kesim-yan-ürünü, korunur). |
