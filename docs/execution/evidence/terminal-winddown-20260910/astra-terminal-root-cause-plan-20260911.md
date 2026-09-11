# Terminal: bağımsız kök neden analizi ve uygulama sözleşmesi

Karar: mevcut operatör akışı ürün kabulünü geçmiyor. Önceki P4/path parity ve dar tablo kod ACCEPT'i bu canlı akışın kabulü değildir. Bu belge yalnız analiz ve plan; uygulama, MASTER mutation, build, test, provider çağrısı, commit/push yapılmadı.

## Kanıt sınırı

Kaynak HEAD: d4ae756e01c9801653789816dc1398ef0007c7b2. Kullanıcının paylaştığı oturum: chat-2026-09-10T23-21-12-047Z-cgl3nn. Bu oturumun çalışan dist digest'i/effective policy snapshot'ı okunmadı; kaynakla birebir runtime attribution HOLD. Kaynak üzerinden kesin davranış ile transcript'ten çıkarım aşağıda ayrıdır. Ham transcript, auth veya memory.db okunmadı. İnceleme tüm repo denetimi değildir; manifestte belirtilen ilgili dosyaların hedefli analizi yapıldı.

## 1. Okuma neden full-auto altında dahi sürekli izin istiyor?

Kesin kaynak zinciri:
- src/agent/loop.ts:281 writeTargets(args), tool/effect türünü almadan path/file_path/files alanlarını yazma hedefi topluyor.
- src/agent/loop.ts:992 her araç için bu listeyle checkSelfModifying çağrılıyor.
- src/agent/guards/self-modifying.ts:29 Deckent reposunda source prefix eşleşmesi elevation üretiyor.
- src/orchestra/self-modifying-detector.ts:31 kaynak prefix listesinde src/cli/ var.
- src/agent/loop.ts:1007 elevation tier=always yapıyor.
- src/agent/permission.ts:38 always-floor, full-auto kontrolünden önce ask döndürüyor.
- src/agent/native-permission-binding.ts:127 elevated/always/nested yalnız once seçeneği alıyor.
- Aynı yanlış hedef çıkarımı native-agent-bridge.ts:808,845,929 nested execution ve round projection içinde tekrarlanıyor.

Sonuç: read_file(path=src/cli/repl/ink-palette.ts), list_dir(path=src/cli/repl) ve grep(path=src/cli/repl) read-only olsa da self-modification floor'a girebilir. Transcript'teki konuma bağlı onaylar ve yalnız “1” görünmesiyle güçlü biçimde örtüşüyor. Canlı invocation receipt olmadan her onayı bu nedene atfetmiyoruz.

Cursor'un “full-auto wiring” açıklaması eksik: app.tsx:1936-1942 seçimi engine'e iletiyor; native-agent-bridge.ts:1625 session'a bağlıyor; session.ts:1703 mode değiştiriyor; loop.ts:1020 güncel mode'u okuyor. Öncelikli düzeltme yeni bir mode setter eklemek değil, gerçek effect sınıflandırmasıdır.

Uygulama:
1. Tool declaration/validated arguments üzerinden canonical read/write/delete/execute/network effect ve hedef resolver'ı.
2. Self-mod guard sadece gerçek mutation hedeflerine uygulanır. Tool adına gevşek “read” kontrolü veya tüm path'leri güvenli saymak yok.
3. Direct/nested/round-preview/pre-effect revalidation aynı resolver'ı kullanır; bilinmeyen capability read-only sayılmaz.
4. Explicit deny ve gerçek destructive/self-write floor korunur; mevcut sınırların yanlış okumalara uygulanması düzeltilir.
5. UI “neden izin?” gerekçesini effective decision üzerinden gösterir; full-auto etiketinin istisnaları görünür olur.

Kabul: aynı src/cli dosyasını okuma full-auto altında sıfır gereksiz prompt; aynı dosyaya mutation mevcut policy gereği onay; denied hedef çalışmaz; nested call aynı sonuç; path/args değişince eski karar kullanılamaz.

## 2. Onay ekranının üç ayrı sorunu

A. Menü doğruluğu: approval-card.tsx:108-127 seçenekleri lifetimes'a göre gösteriyor; messages.ts:7044 sabit “1/2/3 seç” basıyor. Tek seçenek varken 2/3 gösterilmesi kesin UI bug.

B. Bilişsel yük: native-permission-approval.ts:94 önce lifetime intent, :145 sonrası broker, :169 civarı trusted decision verification. Kullanıcı önce kapsam seçiyor, sonra başka görünümde “yes” ile auth veriyor. Round seçimi yalnız intent kartlarını grupluyor; broker authority kararlarını tekleştirmiyor (aynı dosya:180-195 açıklaması). “Bir kez tüm tur” seçiminin her sonraki broker istemini kaldıracağı varsayılamaz.

C. Scope anlamı: permission-types.ts:25 grantPatternFor session/always için '**' üretiyor. “Bu dosyaya oturum boyu izin” izlenimi verilmemeli; mevcut anlam bu araçla diğer kaynakları da kapsıyor. Dar kaynak izni tasarlanırsa canonical binding + rule store + doğrulama zinciri birlikte değiştirilir, yalnız etiket değiştirilmez.

Uygulama:
- Tek tutarlı izin akışında fiil, hedef, kapsam, gerekçe ve yalnız kullanılabilir tuşlar.
- Tek once seçeneğinde gereksiz lifetime seçme adımı kaldırılabilir; asıl yetkili karar/auth adımı korunur.
- “Dosyayı oku: … / Yalnız bu işlem / İzin ver / Reddet” gibi anlaşılır etiketler; UUID ve tenant ayrıntısı açılabilir ayrıntıda.
- Repo'nun authenticated CLI decision contractı korunur; widget tıklaması kendiliğinden yetki değildir. Gerçek authentication gerekiyorsa aynı akışın açık adımı olarak görünür.
- Approved → verified → executing → captured → delivered ayrı kayıt; kullanıcıya tek sakin faaliyet satırı ve hata halinde kesin aşama.
- Red/expiry/cancel/authority change/pending permission sırasında mode değişimi test edilir; eski isteğin sessiz onayı yok.

## 3. Bağlam dolmadan neden iş kesiliyor?

Kesin kod:
- loop.ts:1186 tüm transcript'teki retained tool body byte'larını topluyor; bu sadece son kullanıcının turu değil (context-budget.ts:69).
- execution-budget-policy.ts:123-124 varsayılan tek tool %5, retained tool toplamı %20. Bunlar provider bağlam penceresiyle aynı sınır değildir; canlı override ayrıca çözülmelidir.
- loop.ts:1188-1197 kalan payı batch çağrılarına bölüp broker'a maxRenderedBytes veriyor.
- tool-result-broker.ts:299 sıfır payda; :326 receipt metni bile sığmayınca hata.
- loop.ts:1167 handler daha önce çalışmış olabilir. :1201 mevcut ve kalan çağrılara aynı context-budget-hold metni; :1203 turn-end ve return. :1214 normal tool-result olayı hiç yayınlanmıyor.

Bu, “onaylandı ama sonuç yok” deneyimini doğrudan açıklayabilen bir zincirdir. Gösterilen hata fiziksel diskin dolduğunu kanıtlamaz. Footer'daki son request %4 ölçümü ile retained-result cap aynı ölçüm değildir; ayrıca son request, yeni tool çıktısı eklenmeden önce ölçülmüş olabilir.

Mevcut shrink neden yeterli değil:
- loop.ts:911 ön-batch ve :1252 son-batch shrink zaten var.
- tool-result-retention.ts:21-28 bir kez shrunk işaretli içeriği tekrar küçültmüyor.
- :40-41 preview'dan küçük içerikleri küçültmüyor.
- :81 hedef preview yine tek-tool payından türetiliyor. Çok sayıda orta boy sonuç birikip toplam payı doldururken hiçbiri bu eşiği aşmayabilir.
- Ön shrink sonrası yeterli yer gerçekten ayrılmadan execution devam edebiliyor.
- Broker receipt'i için ayrı güvence yok; son aşamada ref üretmek de aynı limitte başarısız olabilir.

Cursor'un “zorunlu content-ref ekle ve devam et” çözümü tek başına yetmez; sistem zaten ref yazıyor. Kapanması gereken sorun ref'in ve devam kontrolünün bütçesinin de tükenmesi.

## 4. Kesintisiz görev yürütme sözleşmesi

Mantıksal kullanıcı görevi ile provider request/round/working epoch ayrılmalı. Bir request'in bitmesi, storage spill veya otomatik compact görevi tamamlamaz. Kullanıcının iç bakım için “devam”, /renew veya /compact yazması gerekmez.

İşlem hattı:
1. Çağrı çalıştırılmadan önce küçük sonuç/receipt ve recovery kontrol payı ayrılır. Mutating çağrı önce çalıştırılıp sonra kayıt alanı aranmaz.
2. Tam sonuç durable capture edilir; model görünümü bunun bounded projection'ıdır. Capture başarısızlığı fake ref ile kapatılmaz.
3. Gerektiğinde önce preview küçültme, sonra eski sonuçları ref-only projection'a indirme, sonra doğrulanmış checkpoint/compact.
4. Pending batch ve call-result protokolü korunur; executed, not-started, cancelled ayrılır. Aynı side effect sırf teslim hatası yüzünden tekrar yürütülmez.
5. Yeni context generation'da aynı task identity ile otomatik devam edilir; sonuçlar mevcut capture'dan teslim edilir.
6. Her recovery'nin gerçekten alan açtığı ölçülür. İlerlemeyen compact/re-read döngüsü tekrarlanmaz; farklı strateji veya gerçek engel gösterilir.
7. Partial findings kullanıcıya gelir; ama bunlar tamamlanmış sonuç diye işaretlenmez. Kullanıcı input/cancel/steer erişimi her aşamada canlı kalır.

Zorunlu sınır: iptal, gerçek izin reddi, quota bitişi, unavailable provider veya disk arızasında sonsuz yürütme/başarı sözü verilemez. Bu hallerde görev korunarak açık blocked state ve kurtarma yolu sunulur; “hazır / sıra sende” ile başarısızlık gizlenmez. Otomatik fallback yalnız mevcut yetki/config içinde olur. Para/usage limitini yenilemek veya izni genişletmek recovery değildir.

## 5. P2 ve compact paket dışı kalamaz

work-budget-snapshot.ts:26 elapsedWorkMs=now-startedAtMs; guards/recursion.ts:79 aynı fark wall limitine tabi. Bu, adı work olsa da gerçek aktif çalışmadan ibaret bir sayaç değil. Kaynakta kullanıcı bekleme süresini dışlayan muhasebe bu formülde yok.

Gereken ayrı zamanlar: provider execution/wait, tool execution, permission wait, user idle, background job, total session age. Örtüşen aktiviteler basitçe toplanmaz. Internal working epoch rollover billing/account quotasını sıfırlamaz.

Compact kayıpsızlığı: özetin her ayrıntıyı koruduğu iddia edilmez. Ham içerik ve kararlar durable tutulur; hedef, kullanıcı düzeltmeleri, yetki, pending call kimlikleri, effect receipts, dosya sürümleri, açık bulgular ve provenance deterministik korunur. Özet immutable içerik ref'lerine bağlıdır. Restart ve compact ortasında crash recovery kabul testidir.

## 6. @master-plan: arama ve bağlama iki ayrı bozukluk

Kaynak:
- at-ref.ts:256 40.000 dosya cap; :260 dönen fonksiyon sorguyu kullanmıyor.
- :277 DFS cap'te kesiliyor; :279-281 dizinler eklenip tekrar cap uygulanıyor.
- chat-tool-exec.ts:93 synchronous DFS, depth 12; root gitignore yalnız basit directory-basename düzeyinde (:68).
- input-bar.tsx:132-133 sıfır eşleşmede menü null; “aranıyor / indeks eksik / sonuç yok” ayrımı yok.
- filterAtPaths (:143) case-insensitive basename prefix zaten destekliyor; mesele öncelikle fuzzy skor değil.
- run.tsx:587 reader verilen path'i cwd'ye göre doğrudan açıyor. Kullanıcı seçmeden @master-plan.md gönderirse docs/MASTER-PLAN.md basename çözümü yapılmıyor.
- at-ref.ts:37 token parser boşlukta kesiliyor, :202 seçilen path quoting yapılmadan ekleniyor; boşluklu dosya adları için de aynı uçtan uca contract eksik.
- run.tsx:599 dosyayı tamamıyla sync okuyor; büyük attachment descriptor üretimi bile UI thread'inde tam okuma/hash maliyeti taşıyor.

Disk gözlemi (23:43:58Z): kaynak algoritmasının read-only reconstruction'ında cap .deckent/archive/sprints/sprint-704/... içinde doldu; 40.000 dosya, 5.320 türetilmiş dizin; MASTER diskte var, tarananlar/adaylar içinde yok, master-plan eşleşmesi sıfır. Bu gerçek REPL testi değil; aynı sınırın mevcut dosya ağacındaki sonucudur.

Uygulama:
- Cancellable async query service; bounded index hafızası sorgu recall'ını sessiz düşürmez.
- Git varsa tracked + uygun untracked, yoksa platform FS adapter; ignore/negation ve hidden policy doğru; arşiv ve üretilmiş içerik explicit aranabilir, gerçek proje dosyalarını boğmaz.
- Exact path / exact basename / prefix / substring sıralaması. Yeni dosya/rename/delete ve cwd değişimi cache'i günceller.
- İndeks tamamlanmadan exact-path ve sorguya özgü arama; partial index, erişilemeyen dizin ve no match ayrılır.
- Tek anlamlı basename adayını path'e çöz; çoklu adayda kullanıcı seçimi, modelin tahminine bırakma.
- Seçim typed attachment olur; quoted/spaced/non-ASCII paths, cursor ortasında completion, paste, symlink, outside-root birlikte ele alınır.
- Büyük kaynak async descriptor + hash/version + bounded read ile teslim edilir; kaynak coverage byte/range bazında izlenir. Modelin “%85 okudum” iddiası metinden doğrulanmış sayılmaz.
- Cap'i 40k'dan 100k'ya büyütme veya .deckent'i bütünüyle saklama kalıcı çözüm sayılmaz.

## 7. Kullanıcı/asistan ayrımı ve zengin çıktı

Kesin görünüm kaynağı: transcript-turn-view.tsx:36-48 kullanıcı başlığını “Sen / mesajın” olarak basıyor; :71 head etiketi; :112 her seg için marginTop. app.tsx:589 her cevapta head ekliyor. İstenen görsel değişiklik mevcut owner kararıdır: kullanıcı metninin yanında sakin/soluk bar, gereksiz “Sen · mesajın” etiketi yok; assistant normal foreground'da düz akar. NO_COLOR'da da ayrım yapı/indent ile anlaşılır.

Dikey boşluk turn sınırında yönetilir; her streaming chunk'a ayrı paragraf marjı eklenmez. Tool, permission ve sonuç aynı olayın üç bağımsız başarı çıktısı gibi tekrar edilmez.

Tablo kabulü bütün renderer kabulü değildir:
- chat-render.ts:239 tabloda width fallback var.
- :193 renderCodeBlock maxTerminalWidth almıyor, :203 en uzun satırdan sınırsız box genişliği çıkarıyor. Kod/diff çerçeveleri terminalde yeniden wrap olup kenarları bozabilir.
- Modelin çizdiği kutu ve sentez sayılar gerçek PlanPreviewCard/ilerleme/approval çalıştığını kanıtlamaz.
- Canlı kısmi stream, final markdown, Ink frame ve gerçek terminal paint birbirinden ayrı katmanlardır. Paylaşılan bozuk satırların tam olarak hangi katmanda kaybolduğu PTY/raw-byte karşılaştırması olmadan kesin değil.
- [200~ gibi kaçış kalıntılarının kökü bu paste edilmiş kanıttan doğrulanamaz.
- TR/EN karışımı model output-language contractı için ayrı regression; string i18n tek başına bunu çözmez.

Kabul matrisi: prose/list/table/code/diff/quote/link, uzun path/URL, emoji/CJK/TR, ANSI16/256/truecolor/NO_COLOR, light/dark, narrow/wide, resize, paste, interrupted stream, native scrollback, pipe. İçerik sentinel ve ham çıktı karşılaştırmasıyla kayıp/duplicate aranır; yalnız “güzel göründü” yeterli değildir.

## 8. Cursor planıyla karar

Katıldığım: kaynakta budget abort, menü hint bug, head/spacing, gerçek Ink render test ihtiyacı, izin ve bütçe sorunlarının ayrı mekanizma olduğu.

Değiştirdiğim:
1. Full-auto setter ekleme yerine effect-aware self-mod root fix.
2. Yeni content-ref tek başına değil; reserved receipt capacity + çok aşamalı retained projection + same-task recovery.
3. Turn cap ismi yanıltıcı; tüm retained transcript muhasebesi hesaba katılmalı.
4. “Devam için /renew” metni ürün gereksinimini karşılamaz.
5. P2 work/idle ve gerçek PTY proof paket dışı bırakılamaz; kapanış dependency'sidir.
6. @ arama ve typed attachment aynı outcome'nun giriş dependency'sidir.
7. UI success, tool execution ve model delivery ayrı doğrulanır.
8. Tek dev commit yerine tek kullanıcı outcome'su altında bağımlılık sıralı, ayrı doğrulanabilir dilimler. Yeni mikro-ACCEPT'lerle outer sonuç DONE sayılmaz.

## 9. Uygulama sırası ve bitiş kapısı

A — Baseline: exact source/build identity, sanitized effective policy, aktif model/window measurement, kullanıcı senaryosunu gerçek binary'de kaydet. event/call/ref/approval/task kimliklerini ilişkilendir.
B — Permission root + decision UI: canonical effect resolver, once-only doğru menu, tek coherent authenticated karar akışı; direct/nested/pre-effect parity.
C — Continuity: durable capture/receipt rezervi, retained multi-level shrink, task/round ayrımı, automatic recovery; P2 gerçek zaman muhasebesi ve P3 compact bu dilimin dependency'leri.
D — References: async query/index/resolve/attach, @master-plan dahil büyük kaynak continuity üzerinden yürür.
E — Transcript/render: owner görünümü, tek spacing authority, width/height-aware code/table/diff, stream→scrollback kayıpsızlığı.
F — Entegre proof: gerçek provider, gerçek binary, fresh ve uzun yaşayan session, izinli/denied işler, büyük dosya ve background işi birlikte. Sonra bağımsız review ve canonical closure. Platformda kanıt yoksa verified denmez.

Tek kullanıcı kabul senaryosu:
1. Selam; model/tool gerektirmeyen istekte gereksiz dosya/izin yok.
2. @master-plan yaz; docs/MASTER-PLAN.md görünür, seçilir, typed ref olarak bağlanır.
3. Plan analizi biter; manuel devam/renew/compact yok. Coverage ile kısmi/tam iddia uyumludur.
4. Aynı yaşayan oturumda küçük kaynak okuma: full-auto altında yanlış self-mod prompt yok.
5. Gerçek kontrollü mutation: gerekiyorsa bir anlaşılır auth akışı; reddedilirse çalışmaz.
6. Sentetik zengin çıktı hiçbir tool gerektirmeden gelir; tablo/kod/diff içeriği kaybolmaz.
7. Uzun tool arka planda sürerken input/cancel/steer çalışır; provider bekleme ile tool progress ayrıdır.
8. Compact ve restart sonrasında hedef/kanıt/yetki korunur; side effect tekrar edilmez.
9. Quota, disk failure, network ve approval expiry injection'ları gerçek neden gösterir; fake success veya busy-spin yok.

Önerilen ölçülebilir UX kapıları (henüz ölçülmüş performans değildir): referans donanım/FS tanımlanarak input paint p95<=100ms, @ ilk faydalı sonuç p95<=300ms; yavaş/remote FS'de UI donmadan arama durumu gösterimi. Uzun sessiz dönemde bounded anlamlı durum güncellemesi; sahte yüzde veya ilerleme üretme yok. Model/provider latency'si ayrı raporlanır; her işi sabit saniyede bitirme sözü verilmez.

Bitiş kararı: unit/Ink green + source review tek başına yetmez. Yukarıdaki gerçek operator journey'nin fresh/long-session tekrarları, no-duplicate-effect, durable recovery, desteklenen platform matrisi ve bağımsız provider closure contractı tamamlanmadan ürün DONE yok. Önceden kabul edilmiş 114 test regresyon korumasıdır; bu yeni davranışların tamamına kanıt değildir.

## 10. Owner kararı ve bekleyen belirsizlik

Owner'ın bu mesajı analiz/plan yetkisidir, implementasyon başlatılmadı. User bar/prose ve manuel renew gerekmemesi kararları alınmış durumda; tekrar tasarım onayı istenmez. Henüz çözülmeyen politika tercihi olursa yalnız gerçek tradeoff sorulur: örneğin kalıcı araç izninin tüm kaynakları mı yoksa seçilen scope'u mu kapsayacağı. Mevcut geniş lifetime anlamı sessizce dar/güvenliymiş gibi sunulmaz.

Canlı izin receipt'i, çalışan build digest'i ve PTY/raw-byte output olmadan incident'in bütün ayrıntıları kesinleştirilemez. Bunlar baseline proof diliminde alınacak; kullanıcıdan tekrar aynı uzun hatalı oturumu yönetmesi beklenmeyecek.
