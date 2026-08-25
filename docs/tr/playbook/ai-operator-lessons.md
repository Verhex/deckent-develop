# Deckent AI-Operatör Dersleri — Saha Notları

> **Yaşayan doküman.** Deckent'i bir AI ajanıyla (Claude, Codex, yerel model…) süren
> herkes için: gerçek çalışma oturumlarında yapılan hataların ve çıkarılan derslerin
> damıtılmış hâli. Her ders "Hata → Neden → Doğru kullanım" kalıbındadır. Deckent'i
> süren modele de bu dokümanı bağlam olarak verin — aynı hataları tekrar etmesin.
> Her sprint/çalışma deneyiminden sonra güncellenir (sondaki değişiklik günlüğüne bakın).
> İngilizce karşılığı: `docs/en/playbook/ai-operator-lessons.md`.

---

## 1. Plan onaylandıktan sonra task artifact'lerine ASLA elle dokunma

**Hata:** Plan onaylandıktan sonra `.tasks/task-XXX.json` dosyasına elle dependency
eklendi. Run, `TASK_ARTIFACT_CONTENT_CONFLICT` ile hiçbir worker doğmadan öldü.

**Neden:** `deckent plan` onayı bir plan-digest üretir; start makinesi artifact'leri bu
digest'e karşı doğrular (exact-plan, fail-closed). Elle edit = digest uyuşmazlığı =
dürüst red.

**Doğru kullanım:** Dependency'ler DIRECTIVES.md'de task bloğunun altına satır olarak
yazılır — parser bunu destekler:

```markdown
## Task 2: xverify CLI waiting signal (depends on Task 1)
- Files: src/cli/commands/xverify.ts
- Dependencies: Task 1
```

Başlıktaki "(depends on Task 1)" YALNIZ insan içindir; DAG'a `- Dependencies:` satırı
girer. Plan çıktısındaki "Etkin dalgalar" satırından dependency'nin gerçekten dalgalara
yansıdığını doğrula (`1:[1,3] 2:[2]` gibi).

## 2. Model-tier yönlendirmesi: kritik yüzey → üst tier, kesin akış → alt tier

**Hata:** Kritik loop-wiring görevi sonnet'e, deterministik test görevi en güçlü modele
atandı. Owner düzeltti: "model ve görev seçimi aşırı başarısız".

**Doğru kullanım:** Kapasite sırası (bu repo için): `gpt-5.6-sol > claude-opus-5 >
claude-sonnet-5`; terra/luna = sonnet-eşdeğeri ve altı. Çekirdek tasarım / runtime
authority / belirsizliği yüksek iş → üst tier. İyi-spesifiye test, fixture,
deterministik dönüşüm, dokümantasyon → sonnet sınıfı. Planı başlatmadan ÖNCE atamaları
bu kurala karşı gözden geçir.

## 3. Disk kanıtı olmadan ilerleme iddiası yok

**Hata:** "Sprint çalışıyor" varsayımıyla beklendi; gerçekte detached child sessizce
ölmüştü (task'lar PENDING, heartbeat yok).

**Doğru kullanım:** Canlılık iddiası şu dört kanıtın kesişimidir: heartbeat dosyası
mtime'ı taze + process gerçekten yaşıyor (`kill -0` sınıfı kontrol) + log tail akıyor +
`.result` diskte. Status/projection çıktısı kanıt DEĞİLDİR. Run-flow'un gerçek son
durumu `.deckent/runtime/run-flow-store/<flowId>.events.jsonl` son satırındadır —
`RUN_FAILED` oradan okunur.

## 4. Bir hata = DUR; retry fırtınası yasak

**Hata:** Bir sprint hatası üzerine, düzeltmenin hatalı yola gerçekten ulaştığı
doğrulanmadan üç kez yeniden başlatıldı (biri stale `dist/` ile). Üç sprint çöpü doğdu.

**Doğru kullanım:** İlk hatada dur. Tam-zincir kök-neden analizi offline yapılır:
düzelt → test → build → dist'ten disk-kanıtı → TEK yeniden deneme. "Belki bu sefer
olur" diye restart atılmaz. Stale `dist/` uyarısını (`DECKENT_BINARY_IDENTITY_WARN`)
asla yok sayma — önce `npm run build`.

## 5. Onay kuyruğunu İZLE — sessiz bekleme tuzağı

**Hata:** `deckent xverify` 16 dakika "takıldı" sanıldı; gerçekte bir
reachability-probe onayı (`aprp-…`) kuyruğa düşmüş, karar bekliyordu — hiçbir çıktı
basılmadan.

**Doğru kullanım:** Uzun süren her komutta ilk refleks: `deckent approvals list`.
Onaylar tek-kullanımlıktır ve koşuya bağlıdır — eski bir koşunun onayı yenisine
taşınmaz; her koşu kendi onayını ister. Karar canlı-doğrulamalı kanaldan verilir
(interaktif `deckent approvals decide <id> --allow`). Otomasyonda bir izleyici döngü
kurup yeni `aprp-` kayıtlarını anında yakala.

## 6. Pipe, exit code'u maskeler

**Hata:** `komut | tail; echo $?` — okunan şey `tail`'in exit'iydi; gerçek hata yutuldu.

**Doğru kullanım:** Gerçek exit code'u ayrı yakala:
`komut > out.log 2>&1; echo "EXIT=$?"`. Deckent'in kendi tool-result zinciri de aynı
ilkeyle çalışır (exit-code truth): sen de betiklerinde aynı dürüstlüğü uygula.

## 7. Hangi bütçe neyi öldürüyor — bil ve config'ten yönet

**Hata:** Bir worker, aggregate token devre-kesicisiyle SIGKILL yedi; bir native oturum
45 dk duvar-saatinde kalıcı ölü-döngüye düştü; bir verifier 100k token / 300s / sprint
başına 1 doğrulama tavanında sürekli UNCLEAR kaldı.

**Doğru kullanım:** Üç ayrı bütçe ailesi vardır ve üçü de `.deckent/config.json`
`execution_budget` altından yönetilir (kodda sabit yok):
- `roles.worker/brain/auditor` — sprint worker'larının token/turn tavanları
- `native_agent` — native terminal oturumunun round/tool-call/duvar-saati/token profili
- `purposes.*` (örn. `xverify-adjudication`) — amaç-özel tavanlar

Uzun işte plan gecikmesi bütçe patlaması üretiyorsa tavanı config'te yükselt; kodu
bükme, sessiz fallback ekleme.

## 8. XVerify iddia disiplini: statik, diff'ten karar verilebilir, nokta-iddia

**Hata:** "Regression testi loop'u iki kez sürüyor ve şunu kanıtlıyor" gibi
çalışma-zamanı davranış iddiaları verildi — hakem diff'ten karar veremez, sonuç
UNCLEAR/HOLD.

**Doğru kullanım:** Commit'ten ÖNCE, `--files` + `--diff` + `--target` ile; her iddia
dosya içeriğinden okunarak doğrulanabilir olmalı ("X dosyası Y fonksiyonunda Z
parametresini bildirir" gibi). Evrensel iddialar ("hiçbir yerde X yok") makine-gate
işidir, hakeme sorulmaz. HOLD/UNCLEAR kapanış DEĞİLDİR — dürüst kanıt olarak receipt'iyle
kaydedilir; kapanış typed verdict + gerçek çağrı + usage + durable receipt ister.

## 9. Scope dışına yazma — dürüst tech-debt bırak

**İyi örnek (hatanın tersi):** Bir worker, görevinin gerektirdiği iki satırlık
değişikliğin kendi `filesWrite` scope'u DIŞINDA olduğunu gördü; scope ihlali yapmak
yerine `GO_WITH_TECH_DEBT` + tam tarifli açık-madde bıraktı ve handoff notu yazdı.
Kapanış, yetkili el tarafından dakikalar içinde yapıldı.

**Doğru kullanım:** Scope dışı keşif = `.result` notes'a yaz, inline düzeltme yapma.
Bağımlı task'a `.tasks/handoffs/` üzerinden ihtiyaç bildir. Sahte DONE'dan dürüst
NO_GO/tech-debt her zaman daha ucuzdur — FIX döngüsü bunun için vardır.

## 10. Yaşam-döngüsü sırası: recover → finalize → cleanup — ve temiz `.tasks`

**Hata:** `npm run build`, `.tasks` altında settle olmamış artifact'ler yüzünden
clean-gate HOLD'una takıldı; cleanup "run-orphaned" ile reddetti.

**Doğru kullanım:** Sıra her zaman: `deckent recover <sprint> --force` (gerekirse) →
`deckent finalize --sprint <id> [--force]` → `deckent cleanup`. Kanıt dosyaları
silinmez, `.tasks/archive/` altına taşınır. `rm .tasks/*` YASAKTIR — arşivleme
kanonik komutla veya archive dizinine taşıyarak yapılır. Ölü xverify twin-task'ları
da `.tasks`'ta kalıp clean-gate'i tutabilir — settle sonrası arşivle.

## 11. MASTER-PLAN hücre grameri

**Hata:** Evidence hücresine `core|discoverable` yazıldı — ham `|` hücreyi böldü, lint
kırıldı. Bir başka append hücreyi 10.000 karakter sınırının üstüne taşırdı.

**Doğru kullanım:** Hücre içinde ham pipe yok (`/` kullan); evidence bounded tutulur
(sınır aşımında eski metni receipt kaybetmeden sıkıştır); her satır değişikliğinden
sonra `npm run docs:master-plan` + `node scripts/lint-master-plan.mjs --check`.

## 12. Build sonrası dünya değişir

**Doğru kullanım:** Her kod değişikliğinden sonra build al; long-lived MCP process'i
eski `dist/`'i cache'ler — host adapterının restart/reconnect akışını uygula. Sprint
ÇALIŞIRKEN build alma (ESM cache + worker auth kaybı). User-surface değişikliği,
gerçek binary'den koşturulmuş kanıt olmadan DONE değildir (mock/unit yeşili yetmez).

## 13. Scoped-yeşil borcu landing'de ödenir — tam suite'i landing'de koş

**Hata:** Sprint politikası gereği ("sprint sırasında full-suite yok") üç dalga boyunca
yalnız scoped test koşuldu; landing'de tam suite 11 dosyada 18 kırmızı verdi — hepsi
yeni davranışlara karşı bayatlamış ESKİ test pinleriydi (truth-stats, model-identity,
yeni envelope shape'leri).

**Neden:** Scoped koşu, değişikliğin KENDİ testlerini kanıtlar; değişikliğin başka
testlerin pinlediği davranışları değiştirdiğini görmez. Bu borç birikir ve faiziyle
landing'de ödenir.

**Doğru kullanım:** TAM suite (`VITEST_MAX_FORKS=2` bellek tavanıyla) landing borç-ödeme
adımıdır — **kadans owner kararıyla 3 landing'de birdir (Alperen 2026-08-19)**; aradaki
landinglerde scoped testler + gate'ler (hermetic, i18n, operating-policy, master-plan)
yeterlidir. Full koşunun kırmızılarını triage et: kod hatası mı, bayat pin mi? Bayat
pinleri yeni davranışa tarihli açıklama yorumuyla hizala ("hangi dalga değiştirdi" yaz).
Ayrıca: yaygın kullanılan bir options tipine yeni alanı REQUIRED ekleme — fail-closed
semantikle (`=== true` tüketimi) optional ekle; aksi hâlde her test literal'i churn'e
girer.

## 14. Bulgu ≠ iş: raporla, owner karar versin

**Doğru kullanım:** Çalışma sırasında görülen scope-dışı her bulgu tek satır olarak
raporlanır; MASTER'a otomatik iş olarak girmez — owner admission'ı gerekir. Tekrarlayan
darboğaz döngüleri (tek-worker'a düşme, FIX-erişilemez, attribution döngüsü) görülür
görülmez owner'a bildirilir.

---

## 15. Scope'u dizin-genişliğinde ver; nokta-dosya scope'u fix zincirini boğar

**Yanlış:** Task'a yalnız değişecek dosyaların nokta listesi verildi. Worker bloklayıcıyı
komşu dosyada buldu (bayat test pini, ikinci bir resolver) — yazma yetkisi yok, dürüst
NO_GO. FIX task'ı ebeveynin AYNI dar scope'unu miras aldı → fix-fix de aynı duvara
çarptı → çözülemez döngü; sprint duraklatıldı (arka arkaya üç sprint bu sınıftan yaralandı).

**Doğru kullanım:** DIRECTIVES'te `Files:` odak listesidir ama `Scope:` ilgili dizinleri
ve muhtemel komşu test/pin dosyalarını kapsayacak genişlikte verilir (ör. yalnız
`tests/cli/lang-authority.test.ts` değil `tests/cli/` + `tests/cli/helpers/`).
Başlatırken/sürdürürken bilinçli genişleme için `--force-scope` bayrağı vardır — kullan.
Worker'ın `replan-proposal` bıraktığını görürsen bu bir scope-genişletme talebidir:
kararı bekletme, ya genişletilmiş scope'la yeniden planla ya da bloklayıcıyı ADR-D-007
el-tamamlamasıyla kapat.

## 16. XVerify onayı CANLI kanaldan ve koşu başına — eski onay yeni kanıt-tazelemeye geçmez

**Yanlış:** XVerify arka planda başlatıldı, süreç çıktıktan sonra onay verilmeye
çalışıldı (onay süreç-ömürlü — buharlaşmıştı). İkinci hata: retry koşusu YENİ bir
approval id üretti; eski id'ye verilmiş onay yeni kanıt-tazeleme isteğine geçmedi
(`approval_untrusted` fail-closed reddi — doğru davranış).

**Doğru kullanım:** XVerify koşarken stderr'deki `waiting-approval:<aprp-…>` sinyalini
CANLI izle ve HER yeni id'yi süreç çıkmadan `deckent approvals decide <id> --allow`
ile karara bağla; bir koşu birden çok onay isteyebilir (kanıt-tazeleme dahil).
`limit_hold`/cooldown türü HOLD'lar pencere dolunca kendiliğinden açılır — HOLD kapanış
değildir, sakin retry planla.

---

## 17. Pin-Taraması Pre-Flight — değişen sembolün test-pinleri görev Files'ına

**Kural:** Her DIRECTIVES görevinden önce (1) değişecek/silinecek export sembollerini
listele, (2) `grep -rln <sembol> tests/` çıkan HER dosyayı görevin Files'ına ekle,
(3) silinen dosyanın kendi test dosyası da Files'a, (4) chokepoint'in üretici+tüketici
ucu aynı görevde. Kaynak: sprint-563'te 9 NO_GO'nun ~%55'i bu tek sınıftı;
sprint-564'te kural uygulandı ve komşu-pin NO_GO'su SIFIR çıktı — kanıtlı işe yarıyor.

## 18. Exit-0 + bozuk `.result` = görünmez settlement kilidi — teşhis kanıt zinciriyle, onarım içerik-verbatim

**Vaka (sprint-564):** Worker `notes` alanına ham newline + escape'siz gömülü JSON yazdı
→ `.result` geçersiz JSON. Konteyner exit **0** olduğundan host'un "bozuk-result'ı NO_GO
ile ez" dalı hiç tetiklenmedi (o dal yalnız exit≠0'da). Attribution reconcile ilk
`JSON.parse`'ta patladı, finalization closure YAZMADAN sessiz döndü, `recover --resume`
her seferinde `E091:recovery-settlement-timeout` attı — hata mesajı kök nedenden üç
katman uzaktaydı.

**Teşhis disiplini:** E091 gördüğünde sırayla İZLE: settlement attempt dizininde
`closure.json`/`settled.json` var mı → yoksa monitor'ün finalize yolunda hangi adım
erken `return` ediyor → o adımın girdisini (`.result`) elle parse et. Üç komut:
`ls <settlement-attempt-dir>`, `docker ps -a | grep <task>`, `node -e "JSON.parse(...)"`.

**Onarım disiplini (ADR-D-007):** (1) Forensik yedek al; (2) `.result`'ın YALNIZ
encoding'ini onar — içerik/verdict bayt-anlamıyla verbatim kalır (NO_GO → NO_GO);
(3) el-editlerin scoped dosyalara değdiyse spawn-baseline blob'larını (`git cat-file
blob <hash>`) geçici geri koy ki attribution ölü worker'a SENİN işini atfetmesin —
dürüst sonuç `VERIFIED filesChanged=[]`; (4) engine'in sunduğu tipli terminali kullan
(`finalize --force` → ABORTED, hiçbir unresolved COMPLETE'e yükselmez); (5) el-editleri
geri uygula + testleri yeniden koş. Sonuç fabrikasyonsuz dürüst kapanıştır.

## 19. Evaluator dürüstlüğü cezalandırmasın — test-uygulanamaz görev sınıfında `testsPassed` sinyal değildir

**Vaka (sprint 568-574):** Doküman görevinde "araç çalıştırmak yasak" kısıtı altında
dürüstçe `testsPassed:false` yazan worker'lar DOC_WRITE correctness kuralınca NO_GO
edildi; "tests passed" uyduran kardeş görevler DONE geçti. 573-006'da attempt + 3 fix
DÖRDÜ de aynı cezayla düştü (~$0.93 boşa) — kusur worker'da değil kuralda olduğundan
fix döngüsü çıkışsızdı.

**Neden:** `scoreCorrectness` her görev sınıfında `testsPassed`e 60 puan bağlıyordu;
doc/audit sınıfında test yüzeyi yoktur — alan orada kalite sinyali değil, dürüstlük
turnusoludur ve tersine çalışır.

**Doğru kullanım:** Doc/audit sınıfında `testsPassed` nötrdür (dürüst false = uyduran
true — ikisi de aynı puan; yalan primi de ceza da yok). Worker'ın kendi NO_GO beyanı
ise tavandır: rubrik puanı onu asla DONE'a yükseltemez; yalnız kanıt-tabanlı reconcile
probe'ları kaldırabilir. Bir görev sınıfında art arda aynı gerekçeli NO_GO görürsen
worker'ı değil evaluator kuralını sorgula.

## 20. NO_GO→debt→"Task N" kayması zinciri — index-form dependency debt-prepend'e karşı savunmasızdı

**Vaka (sprint 572-574 stabilite koşusu):** R1'in kapanışı `escalateDebt` ile eski
debt'leri critical'e geri yükseltti (deprioritize workaround'u tek-tur ömürlü); R2
planına 2 debt-fix PREPEND edildi; `- Dependencies: Task 1` referansı debt-DAHİL
listeye index'lendiği için dürüst görevler debt-fix'lere bağlandı (`573-004←573-001`,
scheduler-shadow disk kanıtı); başarı-raporu-notlu debt-fix'ler dürüst NO_GO'layınca
FIX bütçesi bitti ve 8 görevin 4'ü hiç koşmadan run park edildi — R3 aynı kaderi
birebir tekrarladı (kartopu).

**Neden:** Beş halkanın her biri tek başına makul; bileşimi felaket. Kök kod defekti
"Task N"/integer ref'lerin debt dahil tam-listeye index'lenmesiydi (yazar debt
prepend'lerini GÖREMEZ — numaralandırması directive'e göredir).

**Doğru kullanım:** (1) Index-form ref'ler artık yalnız directive alt-listesine
bağlanır (7094-R D1); debt'e bilerek bağlanmak istersen açık slot-id yaz. (2) Ardışık
ölçüm/deney koşularında debt yönetimi TUR BAŞINA yapılır — tek seferlik deprioritize
escalation'a yenilir. (3) Success-echo debt (notu salt başarı kanıtı) artık
injector'da atlanır; bir "Fix debt" görevi doğuyorsa notunda eyleme dönüştürülebilir
eksik aranır. (4) Breaker pause mesajındaki `bloke←kök` kenarları hangi zincirin
parked ettiğini söyler — teşhise oradan başla.

---

## 21. Genis-yuzeyli landing kadans-sayacini SIFIRLAR — full-suite borcu katlanarak birikir

**Vaka (2026-08-20 kadans mutabakati):** Full-suite kadansi (3 landing'de bir) geregi
kosulan suite 38 kirmizi / 36.963 yesil verdi. Teshis-fani sonucu: kirmizilarin SIFIRI
o gunku evaluation-dalgasindan; tamami onceki landing'lerin hizalanmamis borcuydu —
en buyugu cursor-provider landing'i (sprint-565): 7 test dosyasi (spawnSync mock'lari,
4→5 provider pinleri) hic guncellenmemisti; ustune dunku dalgalarin scoped-battery
DISI pinleri (post-rubric zinciri, totalTokens projeksiyonu, truthStore mock'u) ve
7 baseline/projeksiyon gate'i eklendi.

**Neden:** Scoped-yesil + gate'ler dar-dalga icin yeter; ama PROVIDER ekleme gibi
genis-yuzeyli bir landing onlarca uzak suite'in pinine dokunur. Kadans bekleyince bu
borc gorunmez birikir ve 3. landing'in sahibi, kendisinden olmayan 38 kirmizinin
teshis-faturasini oder (2 paralel teshis-agent'i + ~1 saat mutabakat).

**Dogru kullanim:** (1) Genis-yuzeyli landing (yeni provider, yeni statu-sozlugu,
genis rename) kadans-sayacini BEKLEMEZ — kendi full-suite'ini kosar ve sayaci
sifirlar. (2) Kadans-suite kirmizisinda ilk soru "benim mi, birikmis mi" — degisen
dosyalarla import-kesisimi kaniti (temiz HEAD agacinda tekrar-kosum) siniflandirmayi
kesinlestirir. (3) Mutabakat hizalamalari fixture'in AMACINI korur: B3-tavani
fixture'i kirdiginda dogru hamle karari gevsetmek degil fixture'a gercek kosu-izi
eklemektir. (4) Suite-yuku altinda tek-instance flake (run-flow-store WAL kilidi)
izole tekrar-kosumla teyit edilir — kirmizi sayilmaz, kayda gecer.

---

## 22. Onay watcher'ları ZAMAN-SINIRLI kurulur ve oturum sonunda temizlenir

**Hata:** Geçici otomasyon için kurulan "gelen her onayı ver" döngüsü oturumdan sonra
çalışmaya devam etti. Bu zombi-watcher, sonraki koşuların onaylarını bağlamdan bağımsız
vererek hem güvenlik riski hem de kanıt kirliliği üretti.

**Doğru kullanım:** Watcher'a baştan açık bir süre ve koşu/oturum kapsamı ver; oturumun
terminalinde watcher'ı durdur ve gerçekten kapandığını doğrula. Kalıcı otomasyon için
watcher kullanma: ürünleşmiş ikame approval-rules motorudur. Kural tarafından verilen
her karar, kökenini denetlenebilir biçimde taşıyan `decidedBy: rule:<id>` zarfıyla
kaydedilir.

## 23. Impl mührü yeşil olsa bile CANLI sonuç kanıtı bütünleşme defektini yakalar

**Vaka (D2b-2a):** Implementation mührü yeşildi; buna rağmen ingress ön-kontrolü ile
tüketici doğrulamasındaki eksikler ancak gerçek koşuda görünür oldu. Statik ve
implementasyon-odaklı kanıt, üretim zincirinin tüketici ucunu tek başına kapatmadı.

**Doğru kullanım:** Impl mührünü canlı sonuç kanıtının yerine koyma. Gerçek ingress'ten
gerçek tüketiciye kadar koşuyu çalıştır ve gözlenen sonucu kaydet. Consumer doğrulama
pinlerini implementasyon pinlerinden AYRI yaz; böylece üretici doğru görünürken
tüketicinin sözleşmeyi yanlış yorumlaması bağımsız olarak yakalanır.

## 24. XVerify target aralığını yazmadan önce `wc -l` çalıştır ve çıktısını OKU

**Hata:** Dosya uzunluğu ölçülmeden target satır aralığı yazıldı; aynı aralık hatası üç
kez tekrarlandı ve doğrulama otomatik olarak UNCLEAR'a düştü.

**Doğru kullanım:** Önce hedef dosyada `wc -l <dosya>` çalıştır, dönen sayıyı gerçekten
oku, sonra yalnız mevcut satırları kapsayan target aralığını yaz. Ölçülmeden seçilmiş
bir target doğrulanabilir kanıt değildir: ölçmeden target = otomatik-UNCLEAR.

## 25. Kaynak değiştiyse süreç tamamlanmadan `npm run build:all` ZORUNLUDUR

**Hata:** Kaynak değişikliği build alınmadan dogfood edildi; çalışan `dist/` eski
kaldığı için yeni özellik koşuda görünmedi.

**Doğru kullanım (Alperen, 2026-08-21):** Kaynak değiştiyse süreç-tamamlama öncesinde
`npm run build:all` çalıştır ve `dist = src` eşitliğini doğrula. Sprint ÇALIŞIRKEN
build alma yasağı aynen geçerlidir; önce sprint terminal olur. Build sonrasında
long-lived bot ve MCP süreçlerine aktif host adapterının restart/reconnect ritüelini
uygula, ardından dogfood kanıtını taze binary üzerinden üret.

## 26. `pgrep`/`grep` bekleme deseni kendi komut satırını eşleyebilir

**Hata:** Süreç bekleyen bir `bash -c "... pgrep -f 'X' ..."` zinciri, `X` desenini
kendi komut satırında taşıdığı için kendini buldu ve sonsuza kadar bekledi. Bugün iki
kez görüldü: settlement zinciri `dist/cli/entry.js start` desenini kendi bot-start
metninde buldu; watcher da kendi verdict desenini bekledi.

**Neden:** `pgrep -f` ve benzer `grep` kontrolleri yalnız hedef sürecin adını değil,
tam komut satırını tarar. Arama desenini taşıyan bekleyici shell de sonuç kümesine
girebilir.

**Doğru kullanım:** `pgrep` çıktısından kendi PID'ini veya deseni taşıyan shell'leri
çıkar (`grep -v $$`), deseni komut satırında birebir bulunmayacak şekilde parçala
(`'st''art'`) ya da süreç-adı yerine yakalanmış PID'i bekle (`kill -0 <pid>`).

## 27. Dogfood terminali landing kaniti degildir — root consumer bataryasi ayri bir gate'tir

**Vaka (Sprint-622):** Run 8/8 `COMPLETE` oldu ve task-scope testleri yesildi. Buna
ragmen root landing denetimi uc production acigi yakaladi: digest-bound recovery
manifesti gercek mutation tarafindan tuketilmiyordu; status reconciliation modulu
canonical status entrypoint'ine bagli degildi; strict TaskResultV1 writer legacy
top-level result contractini kirip adjacent worker testlerinde 22 failure uretiyordu.

**Dogru kullanim:** Dogfood terminal receipt'i orchestration surecinin bittigini
kanitlar; production closure'i tek basina kanitlamaz. Landing oncesi (1) yeni authority
icin gercek production import/call-site ara, (2) producer ve consumer'i ayni testte
calistir, (3) degisen public contractin komsu legacy bataryasini kos, (4) ancak bu
root consumer gate'i yesilse MASTER'a `LOCAL_VERIFIED` yaz. Task-scope yesili ile
root-wiring yesilini raporda ayri adlandir.


## 28. Bayat MASTER sayıları hipotezdir — migrasyon seçmeden önce SQLite ve Git'i ölç

**Hata:** Önce gerçekte hangi veritabanı baytlarının bulunduğu kanıtlanmadan, bayat
bir MASTER sayısına göre migrasyon planlandı. Bu, hedef biçime zaten gelmiş fakat
adoption receipt'i eksik bir veritabanında mutation'ı yeniden oynatabilir.

**Doğru kullanım:** Planlamadan önce SQLite header'ını, integrity sonucunu, canlı
schema/schema version'ı ve ilgili row sayılarını ölç; sonra beklenen v1 durumunun exact
Git preimage'ıyla karşılaştır. Ölçülen veritabanı hâlâ v1 ise migrasyon planla. Zaten
mutate edilmiş fakat durable receipt yoksa tekrar migrate etme: ölçülmüş preimage ve
current state'e karşı adoption prepare/proof akışını kullan. Authority'ler uyuşmuyor
veya eksikse HOLD'da dur. MASTER metni ve sayıları yalnız discovery ipucudur, mutation
authority'si değildir; HOLD mühür değildir.

## 29. Acceptance görevin execution boundary'sinde bulunur

**Kanıt (sprint-1780659451557):** Archived manifest `terminalOutcome: ABORTED`
kaydeder; recovery directive'i 20 görevin 7'sinin tamamlandığını, 13'ünün unresolved
kaldığını gösterir. Çünkü implementation görevinin mandatory testi, blocked durumdaki
gelecek bir göreve verilmişti. Retained terminal/recovery kanıtı authority'dir;
recovery predecessor'ı geriye dönük COMPLETE yapmaz.

**Kural:** Mandatory task-local test, o görevin execution boundary'sinde zaten var
olmalı veya görev tarafından co-owned edilmelidir. Gelecek dependent, predecessor'ın
acceptance kanıtını sağlayamaz. Implementation ile exact testini tek node yap ya da
implementation'ı testi daha önce üreten completed prerequisite'e bağla. Acceptance'ı
gelecekteki dependent'a yönlendirme.

**Recovery:** Zorunlu test yoksa typed failure'ı koru ve unresolved descendants ile
run'ı `ABORTED` settle et. Testi implementation node'una veya completed prerequisite'e
taşıyan düzeltilmiş DAG ile yeni recovery lineage çalıştır. Bu worker/provider suçu
değil, dependency-boundary kusurudur.

## 30. Mixed read/write scope compiled prompt'ta eksiksiz korunur

**Kanıt (sprint-628):** İlk üç worker'ın persisted task projection'ında exact
`filesRead` girdileri vardı; write-capable prompt branch'i ise yalnız henüz oluşmamış
evidence dizinini render etti. Worker'lar authorized source'ları compiled prompt'ta
göremediği için doğru biçimde `NO_GO` verdi. FIX girişimleri aynı bozuk composition'ı
miras aldı; retry onarım üretmedi.

**Kural:** `filesRead` ve `filesWrite` bağımsız authority kümeleridir; ikisini ayrı
sanitize ve render et. Write varlığı reads'i asla silmemeli. Authored non-empty read
kümesinin tamamı normalization sırasında reddedilirse sessiz daraltılmış prompt'la
dispatch etmek yerine compilation açıkça fail-closed olmalı. Multi-task run öncesinde
temsilî bir mixed-scope prompt compile et ve bütün exact read/write hedeflerinin
korunduğunu doğrula. Scope kaynaklı worker `NO_GO`'su aynı prompt'a yeni provider
attempt harcama gerekçesi değil, host composition defect kanıtıdır.

---

## Değişiklik günlüğü (her sprint deneyiminden sonra güncelle)

- **2026-08-23 — sprint-628 mixed-scope recovery**: Ders 30 eklendi (`filesRead`
  ve `filesWrite` bağımsız compiled-prompt authority'leridir; dispatch öncesi temsilî
  mixed-scope conformance koşar; aynı bozuk prompt'u retry etmek recovery değildir).
- **2026-08-22 — dependency-local acceptance recovery**: Ders 29 eklendi (mandatory
  task-local test execution anında var veya co-owned olmalı; forward acceptance edge
  typed `ABORTED` settle olur ve predecessor yeniden yazılmadan düzeltilmiş DAG ile
  recovery yürür).
- **2026-08-22 — provider-observation migrasyon doğrulaması**: Ders 28 eklendi
  (migrasyon seçmeden önce SQLite header/schema/row ve Git preimage ölçümü; zaten
  mutate edilmiş fakat receipt'siz adoption ayrımı; HOLD mühür değildir).
- **2026-08-22 — Sprint-622 root landing denetimi**: Ders 27 eklendi (dogfood
  `COMPLETE` orchestration terminalidir, production landing kaniti degildir; root
  import/call-site, producer-consumer ve adjacent legacy bataryasi ayri gate'tir).
- **2026-08-21 — kendi-desenini eşleyen süreç bekleyicisi**: Ders 26 eklendi
  (`pgrep -f`/`grep` bekleyicisinin kendi komut satırını eşleyip sonsuz beklemesi;
  kendi PID'ini/shell'leri eleme, deseni parçalama veya `kill -0 <pid>` kullanma).
- **2026-08-21 — canlı kanıt ve operasyon hijyeni güncellemesi**: Ders 22–25 eklendi
  (zaman-sınırlı watcher ve `decidedBy: rule:<id>` approval-rules zarfı; impl mühründen
  ayrı canlı consumer kanıtı; XVerify target öncesi okunmuş `wc -l`; kaynak değişikliğinde
  sprint-terminalinden sonra `npm run build:all`, bot/MCP restart ve taze-binary dogfood).
- **2026-08-20 — EVALUATION-001 ilk tugla + kadans mutabakati**: Ders 21 eklendi
  (genis-yuzeyli landing kadans-sayacini sifirlar; kadans kirmizisinda once
  benim-mi-birikmis-mi siniflandirmasi; fixture-amaci korunarak hizalama;
  suite-yuku flake'i izole teyit).
- **2026-08-19 — 7094-R onarım paketi (sprint 572-574 stabilite koşusu)**: Ders 19
  (evaluator dürüstlük-cezası: doc/audit sınıfında `testsPassed` nötr, self-NO_GO
  tavan) ve Ders 20 (NO_GO→debt→"Task N" kayması 5-halka zinciri; index-form ref'ler
  directive-only, success-echo debt skip, tur-başına debt yönetimi) eklendi. Kaynak
  olaylar: 573-006'nın 4× aynı-gerekçeli NO_GO'su, 573/574'te 4/8 görevin parked
  kalması, `573-004←573-001` scheduler-shadow kanıtı, escalateDebt'in deprioritize
  workaround'unu tek turda geri alması.
- **2026-08-19 — sprint-564 (NATIVE-SESSION-LEDGER) + E091 kurtarma vakası**: Ders 17
  bölümleşti (564'te uygulandı: komşu-pin NO_GO=0) ve Ders 18 eklendi (exit-0 + bozuk
  `.result` settlement kilidi: teşhis zinciri, içerik-verbatim encoding onarımı,
  baseline blob-restore ile dürüst sıfır-iş attribution, `finalize --force` ABORTED
  terminali). Kaynak olaylar: 004 zincirinin 3× dürüst NO_GO'su (fix-scope-inheritance
  2. vaka), fix-fix'in corrupt-result'u, `recover --resume` E091 döngüsü, ADR-D-007
  el-kapama (bridge `nextTurnIndex` + ContentWriter tek-namespace wiring), clean-gate'in
  xverify PENDING-stub/NO_TASK_RECEIPT kilidi (yeni kısır-döngü sınıfı bulgusu).
- **2026-08-18 — ilk sürüm** (sprint-550…556 dönemi): 13 ders damıtıldı. Kaynak
  olaylar: retry-storm krizi (550-552), NT-correction dalgası (553), NT-06 progressive
  disclosure + tier-düzeltmesi (554), plan-sonrası el-edit çakışması (555),
  `- Dependencies:` sözdizimi keşfi + kanal-onarım sprint'i (556), xverify
  approval-bekleme/bütçe RCA'sı, Qwen canlı-tur bulguları (7083).
- **2026-08-18 — sprint-556 landing güncellemesi**: Ders 13 eklendi (scoped-yeşil
  borcu + required-alan churn'ü) — kaynak: 556 el-kapamasında 11 dosya / 18 bayat
  pinin tek seferde ödenmesi.
- **2026-08-18 — sprint-558/559 dalgası**: Ders 15 (dizin-genişliği scope +
  `--force-scope` + replan-proposal okuma) ve Ders 16 (xverify canlı-onay disiplini,
  koşu-başına aprp, HOLD≠kapanış) eklendi. Kaynak olaylar: 558'in fix-scope-mirası
  kilidi ve ABORTED force-finalize'ı; 559'un kesinti sonrası manuel spawn'la
  sürdürülmesi; terminal-kilitlenme RCA'sının 3-koşu xverify kompozisyonu
  (A: `0d4f3666…` CONFIRMED, B: `752b074e…` CONFIRMED, C: onay-canlılık dersiyle
  yeniden koşuldu).
- **2026-08-19 — sprint-563 + NO_GO taksonomisi (Ders-17: Pin-Taraması Pre-Flight)**: Günün
  9 NO_GO'sunun SIFIRI yanlış koddu; ~%55'i tek sınıf — değişen/silinen sembollerin MEVCUT
  test-pinleri görev Files'ında değildi ve fix aynı dar scope'u miras aldı. KURAL: her
  DIRECTIVES görevinden önce (1) değişecek/silinecek export sembollerini listele,
  (2) `grep -rl <sembol> tests/` çıkan HER dosyayı Files'a ekle, (3) silinen dosyanın kendi
  test dosyası da Files'a, (4) chokepoint üretici+tüketici ucu aynı görevde. İkincil sınıflar:
  altyapı kesintisi (AUTH/wrapper — fix budget'sız doğuyor, bulgu), üretici-tüketici ayrımı,
  el-edit yarışı (owner kuralıyla kapandı). Ayrıca: spec varsayımını worker ölçümle
  düzeltebilir — Commander 'web'→serve önerisi üretmiyor (edit-distance), test gerçeğe pinlenir.
- **2026-08-18 — sprint-562 (@ref tool-mediated read) + owner kuralı**: OWNER KURALI
  playbook'a girdi: sprint/task ÇALIŞIRKEN kaynak/test dosyasına el-müdahalesi YOK —
  worker'la yarış hem attribution kirletir hem dist-değişti uyarısı üretir; el-tamamlaması
  yalnız (a) worker dürüst NO_GO ile durduysa ve blocker'ın dosyası hiçbir CANLI worker'ın
  scope'unda değilse (bridge expose örneği) ya da (b) sprint terminal olduktan sonra yapılır.
  Bugünkü iki yarış-NO_GO'su (worker editten önce okudu) bu kuralın kanıtı. İkinci ders:
  büyük-model canlı kanıtı zorlanmaz — PTY reprosu timeout'ларsa hermetik battery +
  disk-trace kanıtı yeter, akıcı-tur doğrulaması owner oturumuna bırakılır (dürüst kayıtla).
- **2026-08-18 — sprint-561 (skill-unlock) + native-probe teslimi**: Ders 15'in
  üçüncü canlı örneği — `.deckent/skills/` persist yetkisi scope-gate'te düşünce
  001 fix zinciri kazanamazdı; çözüm worker'ın KENDİ authority'sini izole
  scratch-emit'le koşturan ADR-D-007 el-persist oldu (30/30, idempotens kanıtlı).
  İki yeni bulgu sınıfı: provider AUTH kesintisi task'ı NO_GO'lar VE fix task'ı
  budget'sız doğurur (spawn fail-closed bloklar — fix-builder boşluğu); llama.cpp
  ROUTER bare /props'ta n_ctx=0 raporlar — probe model-scoped `props?model=`
  birincil olmalı ve ŞARTSIZ bağlanmalı (config-gate'li probe, config'siz
  oturumda sahte INPUT_CONTEXT_AUTHORITY_UNAVAILABLE üretir).
- **2026-08-18 — sprint-560 (7086 context-lifecycle)**: Ders 16'ya iki ek işledi:
  commit-kimliği xverify iddiasına gömülmez (kanal evidence-digest'i zaten taşır)
  ve chokepoint dosyaları görevlere tahsis ederken ÜRETİCİ-TÜKETİCİ zincirini düşün —
  003'ün ihtiyacı tam da 1/2'ye tahsisli dosyalardaydı; çözüm terminal-yazarların
  serbest kalmasıyla ADR-D-007 üretici el-tamamlaması + fix'in tüketici tarafı oldu.
  Sözleşme değiştiren sprint'in landing-borcu (eski fallback/notice/string-send
  pinleri) tek geçişte yeni typed sözleşmeye hizalandı; canlı Qwen kanıtı taze
  binary + gerçek sunucuyla alındı.
- **2026-08-25 — sprint-662…666 gece-maratonu (epoch-3 Claude)**: Dört yapısal ders.
  (1) **DIRECTIVES yalnız son-ÇALIŞAN örnekten türetilir** — gramer ezberden yazılmaz:
  `Files:`/`Reads:`/`Test:` anahtarları yerine serbest-metin scope satırı yazmak iki run'ı
  (662 prompt-gate, 663 boş-scope E077) doğmadan öldürdü; çalışan 661 dosyası baştan beri
  eldeydi. (2) **Şekil-değiştiren cutover'da tüketici-envanteri tek-projeksiyonla kapatılır**:
  TaskResultV1 `filesChanged` objeleşince nokta-yama köstebek-oyunu oldu (664 iki, 665 iki
  ayrı string-API çökmesi); kalıcı çözüm `normalizeChangedPaths` tek-projeksiyonu ve 10
  tüketicinin ona bağlanmasıydı — hata-imzasının stack'i `.brain/ERRORS.md`'den okunur,
  metriklerdeki tarih hangi run'ın attığını söyler. (3) **Koordinatör ölse de worker-hasadı
  kaybolmaz**: `.result`'lar disk'te kalır; brain-eval'i declared-scoped testlerle elle koşup
  hasadı landing'e almak ADR-D-007'nin meşru dar-yoludur — restart-containment'ın false-NO_GO
  damgası kaskad-belirtisidir, işin kendisi değil. (4) **Fan-in/read-only görevler
  acceptance-türüyle işaretlenir** — aksi halde kod-rubriği zero-diff'i correctness diye
  kırar; 661-futility makinesi (`REPEATED_ZERO_DIFF_NO_GO → escalateReplan`) döngü yerine
  tipli-eskalasyon verdi ve bu davranış İSTENEN üründür.
- **2026-08-25 — seal-penceresi dersi (sprint-667/668/669)**: Terminal-özet baskısı mühür-anı
  DEĞİLDİR — doğal-COMPLETE kuyruğu cleanup_delay+linger ile ~3-5 dakika sonra outermost-seal'e
  girer; pencere dolmadan "seal yok" yargısı verilmez (668'de erken-yargıyla yanlış
  "erken-çıkış" teşhisi kondu; 669 breadcrumb'ları gerçeği gösterdi). İkinci ders: tek-vakadan
  genelleme yapmadan önce enstrümante-et-ve-tekrar-üret — iki kalıcı-breadcrumb (controller
  terminal-tail + outermost enter/sealed) bir koşuda kesin-teşhis verdi ve üründe kaldı.
- **2026-08-25 — Reads-eksiği + deterministik DIRECTIVES-hattı dersi (sprint-670)**: Repair-dalgası
  DIRECTIVES'inde `Reads:` satırı yoktu; bounded-discovery worker'ların src-kontratını okumasını
  doğru şekilde engelledi ve 13 task'ın 8'i "scope izin vermedi" dürüst-NO_GO'suyla döndü — model
  yeteneği değil, BİLGİ-ERİŞİMİ hatasıydı ve tek yazım-eksiğinin bedeli koca bir FIX-fazıydı.
  Kalıcı çözüm üç parça: (1) DIRECTIVES asla plan-modu onayı olmadan yazılmaz; (2) içerik
  deterministik üretilir (`scripts/gen-repair-directives.mjs` — Reads listesi test-dosyalarının
  import-taramasından, LLM-tahmini sıfır); (3) start-öncesi `npm run lint:directives` gerçek
  DERLENMİŞ parser'la (reimplementasyon değil) doğrular — D_NO_READS_FOR_SRC bu dersin typed
  kalıcılaşmasıdır ve aynı araç 670-DIRECTIVES'inde 13/13 BLOCK yakalayarak kendini kanıtladı.
  Yan-ders: izleme-gürültüsü ana-oturuma basılmaz — sessiz nöbetçi-subagent yalnız bulgu taşır.
