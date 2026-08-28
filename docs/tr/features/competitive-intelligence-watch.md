# Rekabet istihbaratı izleme

## Ne yapar

Rekabet istihbaratı izleme, yapılandırılmış resmî kaynakları getirir, enjekte edilmiş izleme politikasıyla yorumlar ve sınırlı kaynak makbuzları kaydeder. Uygun sinyalleri güncel kanıt baseline'ıyla karşılaştırır, kalıcı olayları tekilleştirir ve yeni raporlanabilir alarmlar için sahip bildirimlerini kuyruğa alabilir. Ham kaynak gövdeleri izleme sonucunda tutulmaz.

İzleme yalnız geçerli HTTPS kaynak tanımlarını kabul eder ve kayıtlı `intelligence.competitor-watch` ağ yeteneği üzerinden çalışır. Bir izleme çalışması alarm, bastırılmış ve sorun sayılarını; ayrıca her kaynak için bir makbuzu bildirir.

## Operatör komutları

Bu üç komutu kullanın:

```bash
deckent intelligence watch run [--dry-run] [--input <fixture>]
deckent intelligence schedule
deckent intelligence status
```

> **Bugünkü durum:** `watch run` henüz bir izlemeyi tamamlamıyor. Zincir, çekilen kaynağı
> karşılaştırılabilir sinyale çeviren üretim yorumlayıcısına ihtiyaç duyuyor ve bu adım henüz
> yazılmadı; bu yüzden watch capability'si bilerek kayıtsız bırakıldı ve komut, koşmuş gibi
> davranmak yerine tipli bir hata bildiriyor. `schedule` ve `status` bugün çalışıyor.

`watch run`, yapılandırılmış kaynakları yükler veya `--input <fixture>` ile belirtilen JSON kaynak fikstürünü kullanır. `--dry-run`, aynı getirme ve yorumlama yolunu olayları ya da kaynak imleçlerini kalıcılaştırmadan ve bildirim göndermeden önizler.

`schedule`, kanonik akışın var olmasını sağlar. İdempotenttir: sonraki çağrı başka akış oluşturmak yerine mevcut akışı bildirir. `status`, saklanan izleme olayı sayısını ve son çalışma değerini; son çalışma yoksa `hiç` değerini bildirir.

## Zamanlama ve telafi

Kanonik akış `intelligence.daily-competitor-watch`, `Europe/Istanbul` içinde `0 9 * * *` cron ifadesiyle tanımlıdır: her gün İstanbul yerel saatle 09:00. Akışı zamanlamak onu kaydeder; vadesi gelen oluşumları çalıştırmak için bir zamanlayıcı host'un akış çalıştırıcısını çağırması gerekir.

Akış, kalıcı imleçten (imleç yoksa oluşturulma zamanından) kesinlikle sonra gelen ve sağlanan saate kadar olan her kaçırılmış zamanlanmış oluşumu hesaplar. Kaçırılan oluşumları sırayla işler. Her dry-run olmayan oluşum için deterministik misyon/iş-öğesi çiftini ingest eder, izleme yeteneğini çağırır, sonra imleci yalnız yetenek tamamlandıktan sonra kaydeder. Dry run, yeteneği çağırır ancak misyon ingest etmez ve akış imleci kaydetmez.

## Hata ve kurtarma

Okunamayan baseline kanıtı typed `HOLD` üretir; kanıtlanmış karşılaştırma gibi sunulmaz. Getirme kaynak başına ayrıdır: her makbuz `ok`, `unchanged` veya `hold` taşır. HOLD'daki kaynak sorun üretir; diğer kaynaklar yine de çalışmayı tamamlayabilir.

Akış, tamamlanmamış yetenek sonucu veya çökmeden sonra imlecini ilerletmez. Misyon ve iş-öğesi tanımlayıcıları akış kimliği ve zamanlanmış oluşumdan türetilir. Bu nedenle misyon ingest sonrasındaki çökme yeniden çalıştırıldığında aynı tanımlayıcılar kullanılır; kalıcı olay geçmişi ve kararlı bildirim tanımlayıcıları tekrar oynatmada yinelenen etkileri önler.

## Sağlayıcı zenginleştirme

Sağlayıcı zenginleştirme şu anda `HOLD` durumundadır. Landed izleme, kanıtı zenginleştirmek, değiştirmek veya çıkarsamak için sağlayıcı çağırmaz. Yalnız yapılandırılmış resmî kaynak getirmesini ve enjekte edilmiş yorumlayıcıyı kullanır; bu nedenle sağlayıcı zenginleştirme okunamayan veya hold'daki kanıt için fallback değildir.

## Bildirimler ve önkoşullar

Dry-run olmayan alarm, canlı izleme yeteneğinde `MemoryStore`, enjekte edilmiş fetch/saat/kanıt/yorumlama bağımlılıkları ve `enqueueOwnerNotification` uygulayan bir outbox olduğunda kuyruğa alınabilir. Ayrıca geçerli kaynak tanımları ve kullanılabilir kanıt gerekir. Servis, olay geçmişini sahip bildirimini kuyruğa almadan önce yazar ve olayı sonra raporlanmış olarak işaretler. Dry-run modunda bu üç durum yüzeyinin hiçbirine yazmaz.

Yapılandırılmış bildirim teslim kanalı bu komutun kapsamı dışındadır: izleme, sağlanan dayanıklı outbox'a kuyruğa alır; operatörler aşağı akıştaki sahip-bildirimi teslim yolunu yapılandırmalı ve işletmelidir.
