# Alp Discipline — Evrensel Metin (Rev-3, v1.0-aday) + Repo Kimliği

> **Durum:** REV-3 ONAY TASLAĞI (v1.0-aday) — Alperen-onayı bekliyor · 2026-07-17
> **Rev-3 =** Rev-2 + ikinci adjudikasyon-turu + Alperen K1-K4 kararları (katmanlama ·
> üstün-norm-aksiyomları · containment→İlke-3 · conformance-6-seviye).
> Değişiklik künyesi: Bölüm H. Onay sonrası: repo-bölünmesi + EN kanonik çeviri.

---

## Bölüm A — Repo Kimliği

### A1. İsim ve alt-başlık

**`alp-discipline`** — sabit alt-başlıkla: **Alp Discipline — A Decision Discipline for
Boundary Work** *(TR: Sınır işi için bir karar disiplini)*.

### A2. Dil modeli (K3-tur1 onaylı)

**Authored source:** TR · **Normative international edition:** EN · **First-class normative
mirror:** TR (aynı sürüm numarası). Uyuşmazlıkta translation-resolution süreci (GOVERNANCE);
**geçici kural:** çözüm tamamlanana kadar son mutabık sürüm geçerlidir; yeni bir hükümde
uyuşmazlık varsa **daha dar, daha güvenli, daha az yetki üreten yorum** geçici olarak uygulanır.

### A3. Dosya yapısı (K1 — katmanlı)

```text
alp-discipline/
├── README.md
├── DISCIPLINE.md              # KARAR-ÇEKİRDEĞİ — yalın, ~10 dk okunur [Normative]
├── EDGE-CASES.md              # ENFORCEMENT-KABUĞU — uç-durum/suistimal semantiği [Normative]
├── ADOPTION.md                # üç-katman benimseme + mercek-notu [Informative]
├── GOVERNANCE.md              # sahiplik, değişim, katman-testi, çeviri [Normative]
├── CONFORMANCE.md             # 6 kümülatif seviye [Normative]
├── VERSIONING.md              # metin-semver + kapalı-küme bağı [Normative]
├── CHANGELOG.md
├── PROFILE-TEMPLATE.md        # [Profile-specific şablon]
├── profiles/deckent.md · profiles/editorial.md
├── essence/alp-essence.md · essence/alp-essence.tr.md
├── schemas/  (requirement-record · loss-route-objection · altitude-declaration) [Apache-2.0]
├── examples/ (software · operations · research · organizational-decision) [Example-only]
├── tr/  (README + DISCIPLINE tam ayna)
├── ACKNOWLEDGEMENTS.md · LICENSE (CC-BY-4.0) · LICENSE-CODE (Apache-2.0) · NOTICE
```

**Dosya-başı statü etiketi zorunludur:** her dosya `Normative | Informative |
Profile-specific | Example-only` etiketlerinden birini taşır — örnek-dosyadaki bir ifadenin
çekirdek-hüküm sanılmasını engeller.

### A4. Lisans — çift: CC-BY-4.0 (metin) + Apache-2.0 (şema/kod).

### A5. Atıf (K2-tur1) — yalnız: **`Created by Alperen Sartacoglu.`** Süreç kaydı
`ACKNOWLEDGEMENTS.md` + git-provenance.

---

## Bölüm B — DISCIPLINE.md (karar-çekirdeği, kanonik taslak, TR kaynak) `[Normative]`

# Alp Discipline

**A Decision Discipline for Boundary Work** — *Sınır işi için bir karar disiplini.*

## Bu nedir?

Alp Discipline bir **karar disiplinidir**. Bir zanaat disipliniyle yan yana kullanılmak üzere
tasarlanmıştır: zanaat disiplini *üretimin kalitesini* yöneten pratikler bütünüdür
(okuma-önce-yazma, sadelik, cerrahi değişiklik, hedefe-bağlılık gibi); Alp Discipline ise
üretimden önceki ve çevresindeki *kararı* yönetir. Koddan ve sektörden bağımsızdır — kararın
bir sınıra dokunduğu her işte geçerlidir.

İnsanlar ve AI ajanlar **aynı normatif çekirdeğe tabidir — ikisi için ayrı ahlak yoktur.**
Ancak yetki, hesap-verebilirlik ve eskalasyon mekanizmaları uygulayıcı-türüne göre farklıdır
ve profilde tanımlanır. AI ajanın **hesap-verebilirliği, profilde tanımlanan sorumlu insan
veya kurumsal otoritede kalır**; ajan tanımlı bir eskalasyon-kanalına ve belirsizlikte
güvenli-durma (fail-safe) davranışına muhtaçtır.

Bu doküman **karar-çekirdeğidir** ve yalın tutulur. Uç-durum, suistimal ve enforcement
semantiği ayrı bir normatif katmanda yaşar: **EDGE-CASES.md**. Ayrım-testi: bir hüküm
*karar-rehberi* ise buraya, *suistimal-savunması* ise kabuğa aittir (GOVERNANCE, katkı-kuralı).

## Kapsam koşulu

Bu disiplin **iyi-niyetli uygulayıcılar için tasarlanmıştır; yetkinlik-yönetiminin,
denetimin ve kötü-niyete-karşı güvenliğin yerine geçmez.** Uygulayıcının yeterli kanıt veya
güven düzeyi üretememesi, eskalasyon ya da güvenli-durma sebebidir. Failure-mode'lar yok
sayılmaz — adları ve semantiği kabuk-katmanında tanımlıdır (EDGE-CASES).

## Tanımlar

- **Sınır (boundary):** İşin bilinçli olarak içinde tutulduğu çerçeve. Sınır bir engel değil,
  bir *karardır*. Önem-sınıfları: **yumuşak** (tercih/varsayılan — *gerekçeli sapma genişleme
  sayılmaz; ancak görünür ve denetlenebilir olmalıdır*), **sert** (kural — yalnız İlke-2
  mekanizmasıyla), **anayasal** (yalnız kendi değişiklik-süreciyle; **gereksinim-kaydına
  kapalı**).
- **Sahip (owner):** Sınır üzerinde **güncel yorumlama ve değişiklik yetkisini** taşıyan
  insan, rol veya kurumsal otorite. Sınırı ilk koyan tarafla aynı olmak zorunda değildir
  (köken ≠ yetki).
- **Hedef ≠ yaklaşım:** *Hedef*, ulaşılmak istenen sonuç; *yaklaşım*, oraya seçilen yol.
  Disiplinin taşıyıcı kolonu: sınırlar çoğunlukla yaklaşımları engeller, hedefleri değil —
  İlke 2 ile İlke 3'ü ayıran eksen de budur.
- **Gereksinim (requirement):** Hedefin kendisinin zorunlu kıldığı şey — tercih, konfor veya
  alışkanlık değil. Kanıtlanabilir olmalıdır.
- **Kayıp (loss):** Beyan edilmiş hedefe, üstün-norma veya kabul edilmiş karar-ölçütüne karşı
  **doğrulanmış başarısızlık**. Bilinçli, görünür ve yetkili biçimde kabul edilmiş bir
  trade-off **tek başına kayıp değildir.**
- **İrtifa (altitude):** İşin ele alındığı seviye: **yama · dilim · tasarım · anayasa**.
  İrtifa ile sınır-sınıfı **bağımsız eksenlerdir** (hüküm: İlke 4).
- **Non-goal:** Bilinçli olarak *yapılmayacak* ilan edilen şey — **reddedilmiş bir cazibe**,
  alakasız bir uzaklık değil.

> **Çekirdek-küme hükmü:** V1.x çekirdeği aşağıdaki **dört ilkeden** oluşur. İlke eklemek,
> kaldırmak veya birleştirmek MAJOR sürüm değişikliğidir (VERSIONING).

---

## İlke 1 — Önce negatif alanı çiz

> **Ne yapacağını tasarlamadan önce ne yapmayacağını adlandır — ve taşıyıcı sınırları, ihlal
> koşulunu ve gerçekçi bir ihlal örneğini söyleyerek anladığını kanıtla.**

**Neden:** Pozitif tasarım sonsuz yöne açılabilir; onu işe dönüştüren negatif alandır. Ve
sınır *listelemek* ile *anlamak* aynı şey değildir: hayalinde ihlal edemediğin bir sınırı
anlamamışsındır.

**Nasıl:**
- Her plan, pozitif bölümden **önce** non-goals + ihlal-koşulları bölümü taşır.
- **Anlama-testi ölçek-kuralı:** İhlal-örneği yalnız *taşıyıcı/en-riskli* sınırlara; kalanı
  listelenir. Taşıyıcı-seçimi de beyan edilen bir karardır. Örnek **makul ve bağlama uygun**
  olmalıdır.
- **Geçerli non-goal 3-testi:** (1) *Çekim kuvveti* — söylenmeseydi yetkin uygulayıcı yapar
  mıydı? (2) *Karar bilgisi* — dışarıda bırakmak gerçek bir karar mıydı? (3) *Gözlemlenebilir
  ihlal* — gerçekleşse fark edilir miydi?
- Non-goal'ü kaldırmak da bir sınır-değişikliğidir; sessizce düşürülmez.

**Anti-pattern'ler:** Boş non-goal; ihlal-koşulsuz liste; ritüel doldurma; testi her sınıra
mekanik yayıp sahteleştirmek.

---

## İlke 2 — Genişleme gereksinime verilir, yaklaşıma değil

> **Sınır seni engellediğinde önce neyi engellediğini ayırt et: yaklaşımını mı, hedefi mi?
> Sınır-içi alternatifleri orantılı biçimde tüket; yalnız kanıtlanmış gereksinim genişleme
> sorusunu açar. Tek-seferliği yapısaldan ayır. Kendine genişleme verme.**

**Neden:** Resmî bir istisna yolu var olduğu anda sınırın psikolojisi değişir — duvar
müzakere masasına dönebilir. Mekanizmanın nesnesi bu yüzden **ihlal değil, gereksinimdir**.
Ters yönde: yasal istisna yolu olmayan sistemler yasadışı istisna üretir — bu ilke
enforcement'ın tersi değil, onu *sürdürülebilir* kılan basınç-tahliye valfidir.

**Nasıl — üç basamak:**
1. **Yaklaşım mı, hedef mi?** Yasak soru: *"Bu sınırı nasıl aşarım?"* Zorunlu soru: *"Hedef
   tam olarak neyi gerektiriyor?"* Sınır yaklaşımını engelliyorsa işini yapıyordur.
   **Sınırın canını acıtması, yanlışlığının kanıtı değildir; çoğunlukla çalıştığının
   kanıtıdır** — *ama yalnız çoğunlukla:* bazen acı, sınırın yanlış kurulduğunun kanıtıdır;
   o vaka İlke 3-köprüsünün konusudur. Bu basamakta tek meşru hamle sınır içinde başka
   yaklaşım aramaktır; vakaların çoğu burada biter.
2. **Gereksinim, orantılı biçimde tüketilmiş alternatiflerle kanıtlanır.** İspat yükü
   genişlemek isteyendedir; kanıtın türü **tercih değil, tükenmedir**. **Orantılılık:**
   arama derinliği kararın etkisine, geri-döndürülebilirliğine ve riskine orantılıdır —
   sonsuz araştırma da karar-felci de ihlaldir (kanıt-eşiği tablosu: EDGE-CASES).
3. **Tek-seferlik / yapısal çatalı.** Tek-seferlik gereksinim → **gereksinim-kaydı**:
   kapsamlı, süreli, **emsal oluşturmayan** kayıt — "geçen sefer verilmişti" gerekçe
   değildir; emsal-zinciri sınır-çürümesinin ta kendisidir. Yapısal gereksinim → **sınırın
   kendisi değişir** (amendment); istisna biriktirilmez. **Revizyon-tetiği bileşiktir:**
   tekrar-sayısı (varsayılan N=3) · ortak-neden · etki · tekrar-olasılığı; yüksek-etkili tek
   olay da tetikler. *Aynı-şekilli* = aynı sınıra aynı gereksinim-türüyle dokunan; kapsam/
   tarih/ifade farkı şekli değiştirmez.

**Yetki kuralı:** Uygulayıcı **kendine genişleme veremez** — mekanizma yetki değil, **ses
kanalıdır**; kararı sahip verir. Kayıtsız aşım, kanıt ne kadar parlak olursa olsun ihlaldir.
Anayasal sınırlar gereksinim-kaydına kapalıdır. *(Aktif-zarar acil durumu bu ilkenin istisnası
değildir — İlke 3'ün fail-safe hükmüne tabidir.)*

**Solo hüküm (uygulayıcı = sahip):** Ayrım zamansal ve kipseldir: karar-veren-sen ile
uygulayan-sen aynı an değildir. Gereksinim-kaydı, uygulama-kipindeki seni durdurup
karar-kipindeki sana — başka anda, başka yüzeyde — taşıyan kanaldır. Kuralları yazılı ve
değişim-süreçli kılmak, bugünün-seni geleceğin-sana bağlamaktır.

**Kabuk-referansı:** Kayıt-alanları, ret-semantiği, süre-dolumu ve suistimal-savunmaları →
EDGE-CASES §1-4.

**Anti-pattern'ler:** Emsal göstermek; yaklaşımın acısını gereksinim diye anlatmak; etiketsiz
aşım; tüketim-kanıtı olmadan "başka yol yok" demek.

---

## İlke 3 — Kayba giden rotada dürüst duruş

> **Ayrım kuralı:** İlke 3 yalnız *hedefin/rotanın kendisi* kayba gidiyorsa devreye girer;
> *yaklaşımının engellenmesi* İlke 2'nin konusudur. Önce İlke-2 sorusunu sor: "Hedefe sınır
> içinde başka yol var mı?" Varsa yol İlke 2'dir; doğrulanmış kanıt kaybın yaklaşım-seçiminden
> *bağımsız* olduğunu gösteriyorsa yol İlke 3'tür. (Kayıp tanımına dikkat: bilinçli-yetkili
> trade-off kayıp değildir — Tanımlar.)

> **Rotayı kim koymuş olursa olsun — süreç sahibi, müşteri, amir, kullanıcı dahil —
> doğrulanmış kanıt mevcut rotanın kayba gittiğini gösteriyorsa, uygulamadan önce dur;
> kanıtı ve en küçük karşı-öneriyi karar sahibine ilet.**

**Neden:** En pahalı kayıplar, birilerinin gördüğü ama söylemediği kayıplardır. Bu ilke
**yukarı-yönlü dürüstlüğü lisanslar**: yön-koyana kanıtlı itiraz, sadakatin en yüksek biçimidir.

**Nasıl:**
- Duruş **kanıt-kapılıdır**: rahatsızlık kanıt değildir; doğrulama kanıttır.
- **Dur / uyar eşiği:** Kayıp düşük-etkili ve geri-döndürülebilirse kayıtlı uyarıyla devam
  meşru olabilir; geri-döndürülemez, yüksek-etkili veya üstün-norma dokunuyorsa **durmak
  zorunludur**.
- Bildirim iki şey taşır: (a) kaybın kanıtı, (b) **en küçük karşı-öneri** — ve *"durmak/hiç
  yapmamak" geçerli bir karşı-öneridir*.
- **Karar sahibinde kalır.** Bilgilendirilmiş ısrar sahibin hakkıdır; disiplinin garantisi
  itaatsizlik değil, kanıtın karardan *önce* sahibine ulaşmış olmasıdır. Sonrası: uygula
  (kayıt düşerek) ya da resmî çekil (insan: görevden; ajan: gerekçeli NO-GO). **Asla:** sessiz
  uygulama, sessiz sabotaj, gizli yavaşlatma. *(Kanallar: EDGE-CASES §6.)*

**Üstün-norm aksiyomları:** Bu disiplin dört normu **devredilemez aksiyom** olarak tanır:
**yürürlükteki kanun · insan güvenliği · temel haklar · doğruluk yükümlülüğü.** Hiçbir
bilgilendirilmiş ısrar bunların üzerinde yetki üretmez; anayasal-sınıf kurallar da yalnız
kendi meşru süreçleriyle değişir — **anlık ısrar bir amendment değildir.** *Disiplin bu
noktada saf-prosedür değildir; bu dört norm onun taşınmaz zeminidir.* Profil bu seti
**genişletebilir, daraltamaz**; kaynak/öncelik/hakem tanımları profildedir (PROFILE-TEMPLATE).
Sahip erişilebilir ama zarar-üreten rotada ısrarcıysa: üstün-norm devredeyse duruş zorunludur;
değilse risk, bilgilendirilmiş sahibindir.

**Fail-safe ve zarar-sınırlama (containment):** Sahip erişilemiyorsa ve karar bekleyebiliyorsa
**güvenli-durma esastır — AI ajan için varsayılan davranış budur.** Aktif zarar akıyorsa
(çöken sistem, ilerleyen veri kaybı, istismar edilen açık) **zarar-sınırlama** devreye
girebilir: bu bir genişleme yetkisi değil, **triyajdır** — yalnız durdur/izole-et/geri-al;
minimum kapsam, süreli, otomatik kayıtlı, geriye-dönük onaylı. **Ajan için bu yetki evrensel
değildir; yalnız profil verirse vardır.** *(Mekanik + suistimal-savunması: EDGE-CASES §5.)*

**Köprü-vakası:** Sınırın *kendisi* kayıp üretiyorsa iki ilke birleşir — İlke 2'nin
kanıt-kapısından geçilir, İlke 3'ün kanalıyla taşınır; çıktı gereksinim-kaydı **değil**,
**sınır-değişikliği önerisidir** (amendment).

**Anti-pattern'ler:** Bilinen-kötüyü sessizce uygulamak; his-temelli itiraz; karşı-önerisiz
ret; ısrar-sonrası pasif-agresif direniş; İlke-3'ü İlke-2'nin kanıt-yükünden kaçış-kapısı
yapmak; kabul edilmiş trade-off'u "kayıp" diye işaretlemek.

---

## İlke 4 — Doğru irtifa, kalıcı adım

> **İşe başlamadan irtifanı beyan et: yama mı, dilim mi, tasarım mı, anayasa mı? Adım boyunu
> bilinçli seç — ama her adım kalıcı olarak ilerletmeli; bağlamı veya sınırı geçiştirmek
> hiçbir irtifada meşru değildir.**

**Neden:** Yanlış-irtifa birinci-sınıf hatadır: anayasa-işini yama diye yapmak felaket,
yamayı anayasa-işi diye yapmak felçtir. İrtifa *"ne kadar iş"*, kalıcılık *"hangi dürüstlükte
iş"* sorusudur — **bir ilkede birleşirler, çünkü geçiştirmenin en verimli üreteci
yanlış-irtifadır.**

**Nasıl:**
- Her işin başında **irtifa beyanı** — ve **karar-olgunluğu sorusu, çift yönlü:** *"Bu karar
  şimdi olgun mu? Beklemek hangi kanıtı satın alır; gecikmek hangi kaybı yaratır?"* Soru
  **epistemik hazır-olma** hakkındadır (iyi karar vermeye yetecek kanıt var mı) — takvim
  hakkında değil.
- İrtifa değişiyorsa **yeniden beyan**; sessiz irtifa-kayması yasaktır.
- **Ortogonallik hükmü:** İrtifa ve sınır-sınıfı bağımsız eksenlerdir. **Düşük irtifa beyanı,
  sert veya anayasal bir sınırı aşma yetkisi üretmez** — iş anayasal sınıra dokunduğu anda
  yeniden-sınıflandırılır veya durur. "Bu yalnız küçük bir yama" bir yetki-cümlesi değildir.
- Adım boyu bilinçli seçilir; evrensel metin hangisini seçeceğini değil, *bilinçli
  seçilmesini* yasalaştırır (profil sıkılaştırabilir).
- **Kalıcı adımın testi:** Sistem öncekinden daha *doğru* mu — sessiz borç yok, sahte
  tamamlanma yok, kalan iş adlandırılmış mı? Kalıcı ilerleme yalnız çalışan-çıktı değildir:
  **belirsizliğin azalması, yanlış hipotezin elenmesi, tehlikeli yolun kayıtlı kapanması da
  kalıcı ilerlemedir.**

**Guardrails:**
- **İrtifa-yetki çerçevesi** (profil eşler; varsayılanlar): yama→uygulayıcı/çalışır-kanıt/
  sonradan-örneklem · dilim→süreç-sahibi/kabul-ölçütleri/akran · tasarım→alan-sahibi/
  alternatif-analizi/etkilenen-taraflar · anayasa→sınır-sahibi/karşı-tez+etki-analizi/
  bağımsız-inceleme. **Solo-notu:** solo profilde satırlar zamansal-kip ayrımına iner —
  inceleme = kayıt + başka-anda-karar-kipindeki-sen.
- **Keşif bir irtifa değil, çalışma-modudur** — beyan edilir; çıktısı karar değil, **kanıttır**.

**Anti-pattern'ler:** Süresiz "geçici" çözüm; tamamlanma tiyatrosu; beyansız irtifa-kayması;
"küçük yama" diyerek anayasal sınıra dokunmak; keşfi karar diye satmak.

---

## Disiplinin kendi non-goal'leri

*(davranış-tabanlı ihlal göstergeleriyle:)*
- **Proje-yönetim metodu değildir** — ihlal: seremoni/rol/kadansı zorunlu kılan hüküm.
- **Zanaat disiplini değildir** — ihlal: araç/teknoloji/üslubu evrensel ilke olarak dayatmak.
- **Uyum-checklist'i değildir** — ihlal: anlama-testlerini kutucuğa indirmek.
- **Yetki devri değildir** — ihlal: karar yetkisini sahipten uygulayıcıya taşıyan okuma.
- **Zamanlama/önceliklendirme yönetimi değildir** — olgunluk-sorusu bir eksen değil, sorudur;
  ihlal: metne takvim/kadans/öncelik kuralı eklenmesi.

## Benimseme (özet — ADOPTION.md)

Üç katman: **tam metin** (referans) → **essence** (daima-mevcut çapa; bilinçli kayıplı —
*çapa odur, kanun tam metindir*) → **protokol** (schemas/; **önce ölç, sonra sertleştir**).
Çekirdek/kabuk ayrımı katman-testiyle korunur (GOVERNANCE, katkı-kuralı).

---

## Bölüm B2 — EDGE-CASES.md (enforcement-kabuğu, öz) `[Normative]`

**§1 Orantılılık kanıt-eşiği tablosu:** düşük-risk/geri-döndürülebilir → 1-2 makul alternatif ·
orta-etkili tasarım → temel alternatif-sınıfları · yüksek-risk/kalıcı → sistematik analiz +
doğrulanabilir eleme · anayasal → karşı-tez + etki-analizi + bağımsız inceleme.

**§2 Gereksinim-kaydı alanları:** kapsam · süre/son-kullanma · kanıt · onaylayan ·
**geri-alma, containment veya çıkış planı** — geri-döndürülemezlik varsa **açıkça beyan
edilir ve ek kanıt/onay eşiği uygulanır** (şema sahte-rollback'e zorlamaz). Emsal-yasağı
alan değil, sabittir.

**§3 Ret-semantiği:** Ret de kayıttır; revizyon-incelemesi verilen VE reddedilen kayıtların
desenine birlikte bakar. Kanıtsız tekrar-talep, sınır-sorunu değil uygulayıcı-yetkinlik
işaretidir.

**§4 Süre-dolumu:** Uygulayıcı **en yakın güvenli ve kararlı noktaya** döner veya ilerler;
anında duruş daha büyük zarar üretiyorsa yalnız güvenli-kapanış/containment noktasına kadar
devam edilir. **Yeni kapsam başlatılmaz.** Otomatik uzama yoktur.

**§5 Zarar-sınırlama mekaniği:** Tetik = aktif zarar + erişilemeyen sahip. Eylem-sınıfı:
**yalnız durdur / izole-et / geri-al**; yeni-durum-üreten ileri-yazma **yalnız izolasyon
amaçlıysa ve geri-döndürülebilirse** meşrudur. Minimum kapsam · süre-sınırı · otomatik kayıt ·
ilk fırsatta geriye-dönük onay · asla yeni özellik/kalıcı tasarım. **AI-ajan varsayılanı =
güvenli-durma; containment-yetkisi yalnız profil-verilidir.** **Sahte-acil çağrısı kendi
başına ihlal sınıfıdır** ve geriye-dönük incelemede değerlendirilir.

**§6 Eskalasyon kanalları:** İnsan — resmî çekilme; profil, whistleblowing dâhil dış-kanalları
tanımlayabilir. Ajan — gerekçeli NO-GO + profilde tanımlı eskalasyon-zinciri; zincir kopuksa
güvenli-durma.

**§7 Sahip-erişilebilir-ama-ısrarcı:** Üstün-norm devredeyse İlke-3 zorunlu-duruşu; değilse
bilgilendirilmiş risk sahibinindir — kayıt düşülür, uygulanır veya resmî çekilme.

---

## Bölüm C — Essence (değişmedi; EN-essence çeviri-turunda ayrı mikro-onay)

```text
## Alp Discipline (karar çapası)
1. Önce negatif alan — ne YAPMAYACAĞINI adlandır; taşıyıcı sınırları ihlal-örneğiyle
   anladığını kanıtla.
2. Genişleme gereksinime verilir, yaklaşıma değil — sınır-içi alternatifleri orantılı tüket;
   kendine genişleme verme; tek-seferlik ≠ yapısal.
3. Kayba giden rotada dur — doğrulanmış kanıt + en küçük karşı-öneri, karar sahibine;
   üstün-normlar ısrarla aşılmaz; sessiz uygulama asla.
4. İrtifanı beyan et — yama/dilim/tasarım/anayasa; karar şimdi olgun mu; her adım kalıcı
   ilerletir; geçiştirme hiçbir irtifada meşru değil.
```

## Bölüm D — Profil Şablonu (güncellenmiş parametre noktaları)

1. Sınır-sahipliği + amendment süreci · 2. Önem-sınıfı eşlemesi · 3. Kanıt standardı ·
4. Revizyon-tetiği parametreleri · 5. Kayıt şema-uzantıları · 6. İrtifa sözlüğü +
yetki-matrisi · 7. İlke-4 sıkılaştırması · 8. Uygulayıcı-türleri (yetki/hesap-verebilirlik/
eskalasyon/fail-safe) · 9. **Containment-yetkisi:** kime, hangi kapsamda verilir (verilmezse
ajan-varsayılanı güvenli-durmadır) · 10. **Üstün-norm uzantısı** (yalnız-genişletme):

```text
superiorNorms: aksiyomlar + profil-eklemeleri (ör. security-boundaries, domain-ethics)
priority: normlar-arası öncelik
adjudicator: normal=sahip · çatışma=governance-otoritesi · acil=en-dar-en-güvenli-yorum
integrityScope: doğruluk-yükümlülüğünün alan-tanımı (bilimsel/ticari/hukuki bağlama göre)
```

11. Essence-yüzeyleri + protokol-ratchet hedefleri.

> **Değişmez üst-kural:** Profil çekirdeği **sıkılaştırabilir/somutlaştırabilir; zayıflatamaz,
> tersine çeviremez, etkisizleştiremez.** Üstün-norm aksiyomları daraltılamaz.

## Bölüm E — Deckent Profili (referans uygulayıcı, güncellenmiş iskelet)

- Sınır-sahipliği: Alperen + ADR sistemi; anayasal = immutable-ADR + 3-Yasa. **ADR-immutability
  = solo-hükmün yaşayan kanıtı.**
- Kanıt standardı: Proof-of-Function ailesi. Revizyon-tetiği: N=3 + Brain bileşik-değerlendirme.
- İlke-4 sıkılaştırması: Yasa-3 — dilim-boyu seçilir, kalite pazarlıklanmaz.
- Uygulayıcı-türleri: insan=Alperen; ajan NO_GO→Brain→FIX/cascade; fail-safe=güvenli-durma.
- **Containment-yetkisi (profil-verili örnek):** yalnız Auditor-gözetimli durdur/izole/geri-al;
  geriye-dönük Alperen-onayı zorunlu; ileri-yazma yok.
- Entegrasyon: Faz-1 karar-yüzeyleri + ADR-önerisi; Faz-2 şema-ağırlıklı (schemas/ = Faz-2
  protokol-alanları). Conformance hedefi: **Enforced** — *ölçümün gerekçelendirdiği parçalar
  sertleştirilmiş* anlamında (→ Audited).

## Bölüm E2 — Editoryal Profil İskeleti (değişmedi — evrensellik kanıtı)

Yayın hattı: sahip=yayın yönetmeni; sert sınır="birincil kaynak görülmeden yayım yok";
anayasal="düzeltme politikası". Non-goal="bu dosyada yeni röportaj yok" (gerçek cazibe).
Gereksinim-kaydı=ambargolu-belgeye süreli-editör-onaylı erişim (emsalsiz). Kayıp-rotası=
kanıtla çelişen dayatma-başlık → kanıt + karşı-öneri yayın yönetmenine; doğruluk-yükümlülüğü
üstün-normsa durulur.

## Bölüm F — Yönetişim Belgeleri (güncellenmiş özler)

**GOVERNANCE.md:** sahip/maintainer · ilke-değişikliği=MAJOR · profil-zayıflatma-yasağı ·
**katkı-kuralı (katman-testi):** her hüküm-önerisi "karar-rehberi mi, suistimal-savunması mı?"
testiyle hedef-dosyasını bulur — DISCIPLINE şişmesi yapısal olarak engellenir ·
translation-resolution + **geçici-kural** (son-mutabık-sürüm; dar/güvenli yorum) ·
**RFC-2119 tanımı:** MUST/SHOULD/MAY yalnız normatif ana-cümlelerde; açıklamalar doğal dil ·
üstün-norm aksiyom-seti değişikliği = MAJOR.

**CONFORMANCE.md** — **kümülatif** 6 seviye:

| Seviye | Ölçüt |
|---|---|
| Referenced | Metin referanslanmış, sahipliği kabul edilmiş |
| Embedded | Essence karar-yüzeylerine yerleştirilmiş |
| Practiced | Kararlarda kullanıma dair **örnek kayıtlar** var |
| Structured | Temel kayıtlar standart şemalarla üretiliyor |
| Enforced | **Ölçümün gerekçelendirdiği** alanlar teknik/yönetsel kapılarla doğrulanıyor |
| Audited | Etkinlik ve uygunluk bağımsız/sürekli değerlendiriliyor |

**VERSIONING.md:** MAJOR = ilke anlamı/yetki-modeli/zorunluluğu VEYA ilke-sayısı VEYA
aksiyom-seti değişirse · MINOR = geriye-uyumlu ekleme · PATCH = anlam-değiştirmeyen düzeltme.
EN + TR aynı sürüm.

**ADOPTION.md notu (mercek-teşhisi):** Zanaatkâr-merceği yalın çekirdeği, standart-merceği
kabuk+yönetişimi okur — iki okuma da meşrudur; katmanlama bu farkın mimari cevabıdır.

## Bölüm G — Karar Durumu

| Karar | Durum |
|---|---|
| Tur-1: isim · lisans-çifti · atıf · dil-modeli · tempo · N-varsayılanı | ✅ |
| Tur-2 K1: katmanlama (çekirdek + EDGE-CASES kabuğu) | ✅ 2026-07-17 |
| Tur-2 K2: üstün-norm = aksiyom-ilanı + dürüst-itiraf + profil-genişletme | ✅ 2026-07-17 |
| Tur-2 K3: containment → İlke-3; ajan-varsayılan = güvenli-durma; yetki profil-verili | ✅ 2026-07-17 |
| Tur-2 K4: conformance 6-seviye kümülatif + Enforced-tanımı | ✅ 2026-07-17 |
| **Kalan** | Rev-3 içerik-onayı · repo-host · (onay-sonrası) EN-çeviri + EN-essence mikro-onayı |

## Bölüm H — Rev-2 → Rev-3 Değişiklik Künyesi

1. **K1:** Doküman katmanlandı — DISCIPLINE çekirdeği yalınlaştı; orantılılık-tablosu,
   kayıt-alanları, ret-semantiği, süre-dolumu, containment-mekaniği, eskalasyon-kanalları,
   ısrarcı-sahip → **EDGE-CASES.md** (Bölüm B2); ilkelerde tek-satır referanslar.
2. **K2:** Üstün-norm dört **devredilemez aksiyom** olarak ilan edildi + "saf-prosedür
   değiliz" dürüst-itirafı + profil yalnız-genişletir; kaynak/öncelik/hakem şeması
   PROFILE-TEMPLATE'e.
3. **K3:** Zarar-sınırlama İlke-2'den çıktı → İlke-3 fail-safe altına (triyaj olarak);
   ajan-varsayılanı güvenli-durma; containment-yetkisi profil-verili; "yalnız
   durdur/izole/geri-al, ileri-yazma yalnız izolasyon+geri-döndürülebilir" çizgisi.
4. **K4:** Conformance 6-seviye kümülatif; Practiced="örnek kayıtlar"; Enforced="ölçümün
   gerekçelendirdiği sertleştirme".
5. Tanımlar: **kayıp ≠ kabul-edilmiş trade-off** · sahip = güncel-yetki (köken≠yetki) ·
   yumuşak-sınır model-1 · irtifa⊥sınır-sınıfı.
6. İlke-3: ayrım-kuralına kayıp-tanımı bağı; anti-pattern'e "trade-off'u kayıp diye
   işaretlemek".
7. İlke-4: çift-yönlü olgunluk-sorusu (epistemik hazır-olma netleştirmesiyle) ·
   ortogonallik hükmü · yetki-tablosuna solo-notu · kalıcı-ilerleme başarısız-deneyi kapsar.
8. Kapsam-koşulu yeniden yazıldı ("yerine geçmez" formu); hesap-verebilirlik cümlesi
   düzeltildi (delege-eden → profilde-tanımlı sorumlu otorite).
9. Çekirdek-küme hükmü sürüme bağlandı (ilke-değişikliği = MAJOR).
10. Çeviri geçici-kuralı (son-mutabık + dar/güvenli yorum) A2 + GOVERNANCE'a.
11. Dosya-başı statü-etiketi kuralı (Normative/Informative/Profile-specific/Example-only).
12. GOVERNANCE: katman-testi katkı-kuralı oldu (CC-eki); RFC-2119 tanım-hükmü; ADOPTION'a
    mercek-teşhisi notu; EDGE-CASES.md dosya-ağacına eklendi.
