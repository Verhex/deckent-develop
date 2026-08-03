# Vizyon

Bu doküman Deckent'in ne olmak istediğini ve nedenini anlatır. Yön belgesidir, durum raporu değildir.

Bugün fiilen ne olduğunu kanıt ve statü etiketleriyle görmek için: [Genel bakış](./overview.md). Kayıtlı plan için: [Master Plan](../MASTER-PLAN.md). Bu dokümanın türetildiği kimlik kontratı için: `.deckent/workspace/IDENTITY.md`.

## Deckent nedir

Deckent **provider-neutral, local-first bir Agent OS / AI runtime ecosystem**'dir. [Kanıt: `.deckent/workspace/IDENTITY.md:3`]

Bir workspace'e kurduğunuz, araçlarınıza bağladığınız ve orkestre edilmiş bir execution katmanı olarak çalıştırdığınız yazılımdır. Amaç daha iyi bir sohbet kutusu değildir. Amaç, agentic iş için eksiksiz bir işletim döngüsüdür: niyeti al, ortamı anla, işi kabul et ya da reddet, doğru agent ve modele yönlendir, ilan edilmiş scope içinde yürüt, gerçek sistemlerle veri alışverişi yap, sonucu kriterlere karşı doğrula, kanıt ve memory'ye yaz, bir sonraki koşumu iyileştir.

Bu dokümandaki her şey bu cümleden türer.

## Deckent neden var

Sorunu tanımlayan üç tavan var.

**Tek asistanın tek context'i vardır.** Tek pencere, tek görev, tek bakış açısı, tek provider'ın kör noktaları. Paralellik, bağımsız doğrulama veya tek bir tura sığabilecek olandan fazla bilgi gerektiren iş sadece yavaşlamaz — kullanıcının göremediği biçimlerde güvenilmez hale gelir.

**Agent çıktısı iddia edilir, kanıtlanmaz.** Agentic araçların çoğu "model bitirdiğini söyledi" noktasında durur. Yeşil test kanıt değildir, self-report kanıt değildir, makul görünen bir diff çalışan sistem değildir. Kanıt zinciri olmadan otonomi, ölçekle birlikte büyüyen bir risktir.

**Sektör vendor etrafında konsolide oluyor.** Model seçimi, yürütme ortamı, memory ve audit giderek tek provider'ın bulutunda paketleniyor. Bu, öyle olmadığı güne kadar konforludur — kesinti, fiyat değişimi, politika değişimi ya da host'tan asla çıkmaması gereken bir iş yükü.

Deckent'in üçüne de cevabı aynıdır: yürütmeyi bir sohbet değil, yönetişimli, denetlenebilir ve provider-neutral bir sistem yapmak.

## Trinity: Assistant · Worker · Platform

Deckent'in ürün yüzeyinin üç yüzü, tek motoru vardır. [Kanıt: `.deckent/workspace/IDENTITY.md:5`]

| Yüz | Kullanıcının deneyimlediği | Motorun sorumluluğu |
|---|---|---|
| **Assistant** | Sohbet destekli yardım, planlama, kişisel bağlam, onaylar | Niyeti yönetişimli, denetlenebilir, yapılandırılmış işe çevirir |
| **Worker** | Mühendislik, operasyon, veri ve iç sistemler için arka plan ve zamanlanmış yürütme | Kabul edilmiş işi scope, provider, bütçe ve kanıt kısıtları altında yürütür |
| **Platform** | Genişletilebilir agent, skill, provider, MCP tool, connector ve proje-yerel orkestrasyon | Kalıcı orkestrasyon, memory, onay, routing, recovery, audit ve adapter'ları sağlar |

Bunlar üç ürün ve üç runtime değildir. Tek kernel, tek policy sistemi, tek kanıt zinciri ve tek öğrenme döngüsü paylaşmak zorundadırlar. Bu tek normalize edilmiş grafik, tamamlanmış değil hedef modeldir — mevcut kaynak hâlâ birkaç rol sözlüğü taşıyor ve tek uçtan uca tip grafiğini tam benimsemiş değil; [Genel bakış](./overview.md) ve [Authority ve RBAC](./governance/authority-rbac.md) bunu kayda geçiriyor. Chat'ten, CLI'dan, MCP'den, otonom bir zamanlamadan veya bir webhook'tan gelen istek; admission, routing ve spawn'a ulaşmadan önce aynı türde yapılandırılmış bir execution nesnesine dönüşür.

Bu üçü ayrı motorlara ayrıştığı an ürün ölür — bu yüzden paylaşılan kernel bir implementasyon detayı değil, vizyonun kendisidir.

## Kimin için

Hedef kitle **solo kullanıcıdan dünyanın en büyük kurumlarına: milyonlarca kullanıcı, proje, tenant ve environment** aralığını kapsar. [Kanıt: `.deckent/workspace/IDENTITY.md:6`]

Bu bir pazarlama aralığı değil, bir tasarım kısıtıdır. Aynı kurulu ürün her iki ucu da fork, yeniden yazım veya ayrı bir "enterprise edition" olmadan karşılamak zorundadır.

| Yüz / Kitle | Bireysel | Takım ve geliştirici | Enterprise |
|---|---|---|---|
| **Assistant** | Kişisel planlama, memory, düşük riskli otomasyon | Repo-farkında planlama, tasarım incelemesi, hata ayıklama, tek-seferlik koşumlar | Policy-farkında operasyon triyajı, audit sorgulama, onay yönlendirme |
| **Worker** | Yinelenen kişisel görevler, doküman ve gelen-kutusu biçimli işler | Orkestre koşumlar, review, migration, test ve doküman işi, otonom backlog | Tenant-kapsamlı zamanlanmış flow'lar, iş sistemi aksiyonları, onaylar, recovery, audit zinciri |
| **Platform** | Kurulabilir skill'ler, kişisel agent'lar, yerel model kullanımı | Özel agent, skill, provider, MCP uzantısı, stack konvansiyonları | Multi-tenant deployment, RBAC, SSO/SIEM kancaları, policy paketleri, imzalı uzantılar, capability brokering |

## Yürütme otorite zinciri

Deckent işi gevşek bağlı kavramlar yığını olarak değil, tek bir zincir olarak modeller: [Kanıt: `.deckent/workspace/IDENTITY.md:7`]

```
Goal → Mission → Flow → Run → WorkItem → Attempt → Operation
```

Her halkanın tanımı, kaynağı ve açık soruları [Glossary](./glossary.md) dosyasındadır. Bu doküman onları yeniden tanımlamaz.

Zincir, sistemdeki her etkinin yukarı doğru bir niyete, aşağı doğru bir aksiyona izlenebilir olması için vardır. Audit, recovery, maliyet atfı ve öğrenmenin aynı anda ve aynı kayıtlardan mümkün olmasını sağlayan şey budur. Bu zincire sahip olmayan agentic bir sistem ne yaptığını raporlayabilir; ama neden, kimin yetkisiyle, hangi maliyetle yaptığını ve tekrar yapıp yapamayacağını kanıtlayamaz.

## Altı yürütme bağlamı

"Her yerde" ifadesi somuttur. Altı bağlam demektir; her birinin kullanıcı biçimi farklı, döngüsü aynıdır — iste, kabul et, yönlendir, yürüt, doğrula, hatırla.

| Bağlam | Tipik istek | Motordan talep ettiği |
|---|---|---|
| **Sıfırdan proje** | "Bu sistemin ilk sürümünü ve dokümanlarını oluştur." | Proje analizi, planlama, paralel worker'lar, stack-farkında komutlar, testler, dokümanlar, retro |
| **Aktif geliştirme** | "Bu özelliği branch'i bozmadan uygula." | Scope-sınırlı düzenleme, agent/skill routing, provider seçimi, sonuç kriterleri, doğrulanabilir sonuç |
| **Bakımdaki kod tabanı** | "Şu hatayı düzelt ve bayat dokümanı güncelle." | Memory recall, karar-kaydı farkındalığı, dar scope, iş-türüne uygun kriterler |
| **Günlük iş** | "Bunu özetle, yanıtı taslakla, kontrol listesini güncelle." | Etkileşimli yüzeyler, kişisel memory, düşük riskli capability'ler, dışa dönük aksiyon öncesi onay |
| **İş sistemleri** | "Siparişleri kontrol et, stoğu karşılaştır, aksiyonu hazırla." | Capability target, connector kimliği, actor ve tenant bağlamı, türetilmiş risk, onay kapıları |
| **Enterprise runtime** | "Bu süreci bir departman için policy ve audit ile çalıştır." | RBAC, tenant izolasyonu, zamanlanmış origin, correlation soy zinciri, bütçe, audit ve SIEM entegrasyonu |

Aynı motor altısını da kapsamak zorundadır. Yalnız kod-biçimli olanları karşılayan bir sistem, Agent OS değil bir kodlama aracıdır.

## Deckent'i farklı kılan

Birbirini tutan üç özellik. [Kanıt: `.deckent/workspace/IDENTITY.md:17`]

**Deterministik, eval-backed orkestrasyon.** Yaşam döngüsü, modelin kendi kontrol akışını doğaçlaması değil; sabit ve denetlenebilir bir yürütme dizisidir. (Yürütülen sıra yerleşmiştir; kamuya açık faz *sözlüğü* değil — OQ-04, [Architecture](./architecture.md).) Sonuçlar, işin türüne uygun ilan edilmiş kriterlere karşı değerlendirilir — doküman içeriğine göre, audit bulgularına göre, kod ise kendi stack'inin komutlarına göre yargılanır. Determinizm koşumu tekrarlanabilir yapar; değerlendirme sonucunu güvenilir yapar.

**Yapı gereği yönetişim (governance by construction).** Yetki, scope, onay, bütçe ve tenancy; enterprise alıcılar için sonradan takılan seçenekler olarak değil, execution modelinin yapısal özellikleri olarak durmalıdır. Gerekli tasarım budur; bugünkü varsayılanlar bu kontrollerin birkaçını hâlâ opt-in, birkaç enforcement yolunu da advisory bırakıyor ve kontrol-bazlı dürüst statü [Authority ve RBAC](./governance/authority-rbac.md) dosyasında yaşıyor. Bir worker, işin gerektirdiği asgari scope ve capability'yi alır. Risk, işin ihtiyaç duyduğunu ilan ettiği şeylerden türetilir — yani birinin "düşük" diye set edebileceği değiştirilebilir bir alan değil, tek bir doğruluk kaynağı vardır. Bireysel kullanıcı ile regüle kurum aynı yönetişimli motoru çalıştırır; farkları policy'dedir, türde değil.

**Kapalı öğrenme döngüsü.** `outcome → evidence → routing → promotion → training trace`. Fiilen olan şey, bundan sonra olacak şeyi beslemelidir: sonuçlar routing'i, routing agent ve skill terfisini şekillendirir; tüm geçmiş planlama anında sorgulanabilir kalır. Yürütmeyi değiştirmeyen öğrenme bir log'dur. Bu döngünün organları uygulanmış ve memory katmanı canlıdır; uçtan uca üretim kapanışı ise henüz sertifikalı değildir — hangi halkaların kanıtlandığını [Memory ve öğrenme](./guide/memory-learning.md) söyler.

Bunların hiçbiri tek başına eşsiz değildir. Tek, kurulabilir, provider-neutral bir motorda birlikte tutulduklarında moat olurlar.

## Yüzey doktrini

**Terminal** birincil kontrol yüzeyidir: tool-driven, kademeli açılımlı (progressive disclosure), tam kontrol veren ve bilinçli olarak düşük bilişsel yüklü. **Desktop** aynı otoritenin native operatör yüzeyidir. **Dashboard** yalnızca bir observability projeksiyonudur — asla execution engine ve asla state authority değildir. API, CLI, MCP, otonom/process giriş noktaları ve connector'lar tek bir application-service authority üzerindeki adapter'lardır. [Kanıt: `.deckent/workspace/IDENTITY.md:8-9,16`]

Bu bir faz değil, kalıcı bir taahhüttür. Yüzeyler ürünün ömrü boyunca çoğalır; ikisi birden state sahibi olduğu an sistem, audit'in, recovery'nin ve öğrenmenin dayandığı tek doğruluğu kaybeder.

## Provider bağımsızlığı ve local-first

**Hiçbir provider Deckent'in kimliğinin parçası değildir.** Provider ve model seçimi effective config, runtime model registry ve canlı authority evidence üzerinden çözülür. [Kanıt: `.deckent/workspace/IDENTITY.md:10`]

Bağımsızlık, maliyet özelliği olmadan önce bir doğruluk özelliğidir: derin planlama daha güçlü bir tier alabilirken rutin iş daha ucuzunu alır, yerel modeller host'tan çıkmaması gereken işi yürütür, bağımsız doğrulama çıktıyı üretenden farklı bir provider talep edebilir, kesinti veya kota duvarı ise durma değil bir routing kararı haline gelir.

Local-first, veri için aynı anlama gelir. Proje durumu, memory, kanıtlar ve task artifact'ları projeyle birlikte yaşar. Deckent'in çalışması için bir Deckent bulutunun var olması gerekmez.

## Yönetici ilkeler

Her kararı, her oturumda, her prompt altında bağlayan üç yasa:

1. **Dual Lens + Scale** — her karar hem Deckent'in kendi orkestrasyon kalitesine hem son-kullanıcı deneyimine hizmet eder; tek kişiden milyonlarca kullanıcı, proje, tenant ve environment'a kadar tüm aralıkta.
2. **Every Environment** — tasarımlar baştan cross-platform, cross-language, multi-tenant ve ölçek için yapılır; desteklenmeyen platform sessizce değil dürüstçe başarısız olur.
3. **Never MVP** — iş, uzman-seviyesi ve enterprise-seviyesidir; bilerek geçici veya bilerek eksik tasarım tamamlanma sayılmaz.

Tam metin ve uygulanışı: [Immutable Laws](./governance/immutable-laws.md).

## Non-goal'ler (hedef olmayanlar)

Deckent'in ne olmadığını adlandırmak, vizyonu aşınmaya karşı korur.

- **Chat wrapper değildir.** Chat, run motoruna açılan giriş noktalarından biridir; ürünün kendisi değil.
- **Vendor kontrolündeki bir SaaS değildir.** Yürütmenize vendor'ın sahip olduğu barındırılan bir platform değil, yerel proje durumuna sahip kurulu yazılımdır.
- **Kılık değiştirmiş TypeScript-only araç değildir.** İş, fiilen içinde bulunduğu stack'e göre değerlendirilir. Bir Go projesi TypeScript build'iyle yargılanmaz; doküman test coverage'ıyla yargılanmaz.
- **Varsayılan olarak tek-provider değildir.** Doğru model kullanımı; provider, model, tier ve akıl-yürütme derinliğinin açıkça karar edilmesidir — config ve registry'den çözülür, asla hardcode isimlerden değil.
- **Kontrolsüz otonomi değildir.** Sistem nerede kendi başına hareket ederse etsin, yetki kullanıcıda kalır. Müdahalesiz uçtan uca yürütme bugün sertifikalı değildir; süregelen HOLD ve sertifikasyon merdiveni [Güncel sürtünmeler](./operations/current-frictions.md) dosyasındadır. Scope, onay kapıları, bütçeler ve audit trail bu otonominin bedelidir; önündeki engel değil.
- **Metrik vitrini değildir.** Agent, tool ve komut sayıları üretilmiş durum bilgisidir, kimlik değil. Bu dokümanda yer almazlar.

## Bu vizyonu ne yanlışlar

Yanlışlanamayan vizyon süstür. Aşağıdaki sinyaller, Deckent'in iddia ettiği şeye ulaşmadığı anlamına gelir:

- Üç yüz için üç motor gerekmesi — Assistant, Worker ve Platform'un ayrı kernel, policy veya state authority'lere ayrışması.
- Otonom koşumların, otomasyonu net-negatif yapacak sıklıkta insan müdahalesi olmadan uçtan uca tamamlanamaması.
- Kanıtın törene dönüşmesi — artifact'lar sonucu kanıtlamadığı halde settlement'ın geçmesi ve tamamlanmanın yeniden self-report'a düşmesi.
- Bağımsızlığın aşınması — ürünün gerçekte yalnız tek provider'da çalışması, diğerlerinin demo seviyesinde kalması.
- Yönetişimin yapısal bir özellik olmaktan çıkıp enterprise eklentisine dönüşmesi ve solo ile enterprise ürün arasında fork'a zorlaması.
- Öğrenmenin yürütmeyi değiştirmeyi bırakması — memory birikir ama planlama ve routing bu yüzden iyileşmez.
- Ölçeğin daraltarak elde edilmesi — motorun yalnız kod-biçimli işte çalışması ve diğer yürütme bağlamlarının sessizce yol haritasından düşmesi.

## Bu doküman ne değildir

- Durum raporu değildir. Doğrulanmış güncel durum, kanıtlar ve ⚠️/✅ etiketleriyle [Genel bakış](./overview.md) dosyasında yaşar.
- Yol haritası veya iş defteri değildir. Planlanan işin tek doğruluk kaynağı [Master Plan](../MASTER-PLAN.md)'dır.
- Kimlik kontratı değildir. Otorite `.deckent/workspace/IDENTITY.md`'dir; bu doküman onu açıklar ve yön ile gerekçeye genişletir. İkisi çeliştiğinde kimlik kontratı kazanır ve bu doküman güncellenir.
