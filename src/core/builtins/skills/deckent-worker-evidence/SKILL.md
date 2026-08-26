# Deckent Worker Evidence

## Kanıt Sırası

Önce diskte doğrula, sonra iddia et. Bir worker'ın `status` çıktısı, sohbet mesajı,
exit code'u veya kendi `.result` notu tek başına audit kanıtı değildir. Canonical
sonuç host tarafından disk diff'i ve yakalanmış komut çıktısından yeniden türetilir.

1. Scope içindeki değişikliklerin gerçekten diskte olduğunu doğrula.
2. Görevde ilan edilen exact verification komutunu gerçek çalıştır; komutu ve
   gerçek exit code ile ilgili stdout/stderr'i kaydet. Koşmadığın testi geçmiş
   gösterme; status özeti gerçek koşum çıktısının yerine geçmez.
3. Her go/no-go kriterini ayrı, gözlenen kanıtla kapat.
4. En son `.tasks/task-<id>.result` ingress claim'ini yaz.

## `.result` Kanıt Disiplini

Görev promptundaki güncel schema her zaman otoritedir. En azından şu iddiaları
doğru ve ölçülebilir tut:

- `filesChanged`: yalnız gerçekten oluşturulan/değiştirilen project dosyaları;
  heartbeat, proposal ve result lifecycle artefaktlarını ürün değişikliği sayma.
- Satır sayıları: disk diff'iyle uyumlu gerçek integer değerler; host bunları
  bağımsız yeniden ölçer.
- `testVerification.commands`: yalnız gerçekten çalıştırılmış exact komutlar.
  `testsPassed` ancak required verification sonucu PASSED ise `true` olur.
- `testVerification.outcome`: zincirli bir komutun erken adımı başarısız olursa
  tüm declared command `FAILED` olur; `&&` sonrasındaki test hiç başlamadıysa onu
  ayrı bir başarılı koşum gibi sunma.
- `criteriaEvidence`: her compiled criterion ID için bir satır ve gözlenen kanıt.
  NO-GO criterion'unda `MET`, yasak durumun gerçekleştiği anlamına gelir.
- `notes`: tek string. Provider/model veya token kullanımı uydurma; host admission
  ve invocation kayıtlarından bunları ekler.

`.result` worker ingress claim'idir; canonical settled result ya da kendi kendini
doğrulayan audit receipt değildir.

## Dürüst Verdict

- `DONE`: tüm GO kriterleri kanıtla `MET`, tüm forbidden/NO-GO kriterleri `UNMET`
  ve required verification gerçek koşumla geçmiştir.
- `GO_WITH_TECH_DEBT`: core koşullar kapalıdır; yalnız minor açık işler vardır.
  Exact açık criterion ID'lerini `techDebtCriterionIds` içinde ve kalan işi
  `residualDebt` alanında belirt.
- `NO_GO`: critical kriter açık, declared verify başarısız/çalışamaz veya scope /
  ADR engeli vardır. Başarısızlığı başarıya yuvarlama.

Typed NO_GO somut olmalıdır: hangi criterion ID, hangi komut veya authority
engeli, gözlenen hata ve neden scope içinde kapatılamadığı. `NO_GO` durumunda açık
criterion'u `UNVERIFIED`/`UNMET` gerçeğine göre işaretle; yasak koşul gerçekten
oluştuysa ilgili NO-GO statement'ı `MET` olur. Boş “testler geçmedi” notu yeterli
değildir.

Örnek typed biçim: `criterion-go-… UNVERIFIED — <exact command> exit 1; lint
<path>:<line> ihlali bildirdi; dosya write scope dışında olduğu için bu worker
onarımı yapamaz.` Bu bir şablondur; path, exit ve hata metnini gözlemlemeden
doldurma.

## Disk Kanıtı Status'tan Önce Gelir

- “Worker DONE dedi” değişikliğin diskte olduğu anlamına gelmez.
- Process exit `0`, task başarı kanıtı değildir; yalnız komutun o exit ile
  bittiğini gösterir.
- `deckent status`, worker PID'i veya terminalde görünen `DONE` etiketi project
  dosyasının yazıldığını ya da declared gate'in geçtiğini ispatlamaz.
- `.verify-ran` gibi verifier-owned marker'ları worker üretmez.
- Dependency settlement'ını raw attempt `.result` dosyasından varsayma; promptta
  verilen host-evaluated lineage verdict'i kullan.
- Yazılamayan, okunamayan veya scope dışı kanıtı varmış gibi anlatma; typed NO_GO
  yaz ve exact eksik authority'yi belirt.

## Proof-of-Function

`src/cli/commands/`, `src/dashboard/` veya `src/api/` gibi user-surface değişikliği
Tier-1'dir. Unit test veya mock-only test tek başına DONE değildir.

1. Ürünün gerçek build/binary entrypoint'ini çalıştıran bounded bir `Smoke:` komutu
   belirle; fake adapter veya test içindeki reimplementation kullanma.
2. Gerçek CLI stdout, served HTML/HTTP response veya kullanıcıya görünür state'i
   beklenen değerle karşılaştır.
3. Komutu gerçek build/binary üzerinden gerçekten koş ve çıktı/exit bilgisini
   kaydet. Test-double, source fonksiyonunu doğrudan çağırma veya “host sonra
   koşacak” ifadesi run-proven kanıt değildir.
4. Gerçek-binary kanıtı yoksa görevin policy'sine göre GO_WITH_TECH_DEBT veya
   critical ise NO_GO seç; mock testini proof-of-function diye sunma.

Internal `src/core/` işi Tier-0 olduğunda görevde ilan edilen targeted unit gate
yeterli olabilir. Görev promptunun exact verify authority'sini genişletme.

## Son Kontrol

- Diskteki project diff ile `filesChanged` aynı mı?
- Exact declared command gerçekten koştu mu ve sonucu aynen raporlandı mı?
- Her criterion polarity doğru yorumlandı mı?
- User-surface işinde gerçek binary ve gerçek kullanıcı çıktısı kanıtlandı mı?
- Verdict eksik kanıtı gizlemek yerine onu doğru tipe taşıyor mu?

## Anti-Patterns

- Status satırını, worker mesajını veya `.result` notunu audit kanıtı saymak.
- Çalıştırılmamış testi PASSED yazmak ya da exit `0`ı ürün başarısı saymak.
- Lifecycle dosyalarını `filesChanged` ürün listesine eklemek.
- Critical açıkken DONE; minor olmayan açığı GO_WITH_TECH_DEBT ile gizlemek.
- User-surface özelliğini mock-only testle “çalışıyor” ilan etmek.
