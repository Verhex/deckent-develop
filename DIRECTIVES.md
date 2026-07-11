# DIRECTIVES — SPRINT-412: RC-2 TRANSACTIONAL-INIT + DOCTOR-TWIN + SCHED-2 CHECKPOINT-V2

## Goal
RC-treni dilim-2 (543: dürüst-init INIT-01/02) + born-651 doctor-ikiz-dedup + SCHED-treni dilim-2
(527: checkpoint-v2, öne-serpme — Alperen-onaylı). Tasarım-SSOT: `docs/analysis/beta-blocker-sweep-2026-07-11.md`
(INIT bulguları) + `docs/analysis/scheduler-unify-design-2026-07-11.md` (checkpoint-restore MRR bölümü).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST (mock-only = GO_WITH_TECH_DEBT).
- REPRODUCE-FIRST: fix'ten önce mevcut hatalı davranışı RED testle kanıtla.
- i18n-FIRST: user-facing HER yeni string getMessage(key, lang) ile (en+tr çifti).
- Test hermetik: tmpdir, async spawn (spawnSync YASAK), ≤16GB; dokunduğun modülü import eden mevcut testleri de koş.
- Cross-platform: POSIX + Windows dalları; desteklenmeyen yol dürüst-degrade (loud-warn), sessiz asla.

## Task 1: RC2-A — init outcome-makinesi: READY · SETUP_INCOMPLETE · FAILED dürüst-çıkış (INIT-01)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/cli/commands/init.ts, src/cli/commands/init-wizard.ts, src/cli/helpers/wizard.ts, src/cli/helpers/messages.ts, tests/cli/init-outcome-honesty.test.ts
- Scope: src/cli/commands/, src/cli/helpers/, tests/cli/
- Dependencies: none
### Description
KANIT (sol-sweep INIT-01 + CC disk-verify): provider/auth YOKKEN init exit 0 + "You're ready"
basıyor — `buildProviderWizardSteps` (src/cli/helpers/wizard.ts:~236) no-provider durumunda sessizce
Claude-fallback config üretir; init.ts (~537) finalDoctor başarısızsa yalnız "N issue(s) remaining"
PRINT eder, exit-code'a dönüşmez ve next-steps/"ready" koşulsuz basılır (init.ts:~579). Yabancı
kullanıcı ilk-10-dakikada yalan-READY görür. GÖREV: (1) init'e üç-durumlu OUTCOME sözleşmesi:
READY (kullanılabilir provider+auth kanıtı VAR; exit 0) · SETUP_INCOMPLETE (kurulum yazıldı ama
en az bir kullanım-engeli var: provider-CLI yok, auth yok, required-doctor-check FAIL; exit 2) ·
FAILED (init adımı gerçekten patladı — failedSteps dolu; exit 1); (2) outcome bloğu çıktının SONUNDA
net basılır: durum + engel-listesi + her engel için TEK-SATIR exact-remediation (komut örneğiyle);
SETUP_INCOMPLETE'ta "You're ready" ASLA basılmaz — yerine "kurulum tamam, kullanım için şunlar
eksik" dili; (3) no-provider fallback'i SESSİZ Claude-seçimi olmaktan çıkar: fallback yine yazılır
(config geçerli kalsın) ama outcome'u SETUP_INCOMPLETE'a çeker ve engel-listesine girer;
(4) tüm yeni metinler getMessage en+tr; mevcut init akış-adımları ve wizard etkileşimi DEĞİŞMEZ
(yalnız sonuç-raporlama + exit-code); --yes non-interactive yolu da aynı sözleşmeyi verir.
RED-first: PATH'ten provider-CLI'ları arındırılmış tmpdir'de bugünkü init'in exit 0 + ready
bastığını kanıtla, sonra GREEN (exit 2 + SETUP_INCOMPLETE + remediation). exit-code'ları tüketen
mevcut testler/scriptler varsa envanterle (grep) ve kırılanları güncelle — sessiz bırakma.
Smoke: node dist/cli/entry.js init --yes (provider-CLI'sız PATH, tmp-proje) → çıktıda SETUP_INCOMPLETE + exit-code 2
### goNogo
- goCriteria: RED-reproduce testi (bugün: no-auth → exit 0 + ready) + GREEN (üç-outcome + exit 0·2·1 sözleşmesi + remediation-satırları); no-provider fallback artık sessiz-READY üretmiyor; i18n en+tr; --yes yolu testli; mevcut init testleri yeşil.
- nogo: outcome yalnız print olup exit-code'a bağlanmazsa NO_GO; hardcoded user-facing string NO_GO; wizard etkileşim-akışı değiştirilirse NO_GO.

## Task 2: RC2-B — backend-transaction: Docker CLI+daemon+image birlikte-değerlendirme (INIT-02)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/core/system-capacity.ts, src/cli/commands/init-steps.ts, src/cli/commands/init.ts, src/cli/helpers/messages.ts, tests/cli/init-backend-transaction.test.ts
- Scope: src/core/, src/cli/commands/, src/cli/helpers/messages.ts, tests/cli/
- Dependencies: Task 1
### Description
KANIT (sol-sweep INIT-02 + CC disk-verify): backend seçimi yalnız `docker --version`a bakar
(src/core/system-capacity.ts:~40-46 spawnSync probe) — CLI kurulu ama DAEMON ölü/ulaşılamazken
config'e spawn_backend:docker yazılıp kalıyor; sonraki daemon-probe yalnız image-offer'ı atlar,
config'i subprocess'e GERİ ÇEVİRMEZ (init.ts:~206/269, init-steps.ts:~215). Kullanıcının ilk
sprint'i ölü-daemon'a çarpar. GÖREV: (1) system-capacity'ye (ya da uygun yere) ayrı daemon-probe:
`docker info` (async spawn, ~3-5s timeout) → dockerCli / dockerDaemon AYRI sinyaller; (2) backend
seçimi TRANSACTION olur: docker ancak CLI+daemon İKİSİ de canlıysa seçilir; CLI-var-daemon-yok →
spawn_backend:subprocess yazılır + dürüst-mesaj ("Docker CLI bulundu ama daemon çalışmıyor —
subprocess backend'e düşüldü; docker'a geçmek için: <komut> sonra deckent config set
spawn_backend docker"); (3) image-offer reddedilirse/başarısızsa da config docker'da BIRAKILMAZ —
subprocess'e düş + aynı-desen mesaj (kullanıcı bilinçli docker istiyorsa remediation-komutu verilir);
(4) bu geçişler Task-1'in outcome-bloğuna engel DEĞİL bilgi-notu olarak akar (backend-düşmesi
SETUP_INCOMPLETE sebebi değildir — sistem kullanılabilir); (5) i18n en+tr. RED-first: daemon-ölü
senaryoyu probe-injection'la simüle et (gerçek docker'a bağımlı test YASAK — spawn enjekte edilebilir
olsun) → bugünkü kodun docker yazdığını kanıtla → GREEN subprocess+mesaj.
Smoke: node dist/cli/entry.js init --yes (docker-CLI'sız PATH, tmp-proje) → config.json spawn_backend=subprocess + çıktıda dürüst backend-satırı
### goNogo
- goCriteria: daemon-probe CLI-probe'dan ayrı ve enjekte-edilebilir; CLI-var-daemon-yok RED→GREEN (config subprocess + remediation-mesaj); image-decline yolu da config'i docker'da bırakmıyor; i18n en+tr; mevcut init/system-capacity testleri yeşil.
- nogo: gerçek-docker'a bağımlı (CI'da flaky) test yazılırsa NO_GO; daemon-yokken config'te docker kalırsa NO_GO.

## Task 3: DOCTOR-TWIN — born-651: runDoctorChecks canlı-ikizini öldür (tek canonical liste)
- Model: sonnet | Agent: refactorer | Effort: medium | Provider: claude
- Files: src/cli/commands/doctor.ts, src/cli/commands/doctor-checks.ts, tests/cli/doctor-checks.test.ts, tests/cli/doctor-twin-dedup.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
KANIT (born-651, sprint-411 CC canlı-vakası): doctor.ts:~1708 LOKAL `runDoctorChecks` kendi
check-listesini kurar; canlı `deckent doctor` (doctor.ts:~2224) ONU çağırır — doctor-checks.ts'teki
kardeş-fonksiyona eklenen check gerçek-binary'de görünmedi (411-002'de yaşandı; CC iki listeye
senkron-yorumla ekledi — o geçici yorum kaldırılacak). born-505 (410-003) yalnız
runPreFlightHealthCheck ikizini teklemişti. GÖREV: (1) İKİ listenin fark-envanterini çıkar
(check-adı bazında; notes'a yaz) — fark varsa davranış-koruyan birleşim kur (canlı doctor'ın
bugün bastığı check-seti DEĞİŞMEZ; yalnız kaynak tekleşir); (2) canonical liste TEK yerde yaşar
(tercih: doctor-checks.ts), doctor.ts kendi gövdesini silip delege eder / re-export eder —
dış-import yüzeyi (başka modüller doctor.ts'ten runDoctorChecks import ediyorsa) kırılmaz;
(3) yeni pin-test: "bir check YALNIZ canonical listeye eklendiğinde gerçek runDoctorChecks
çıktısında görünür" (411-002 vakasının regresyon-kilidi) + "doctor.ts içinde ikinci bir
DoctorCheck[] listesi yok" statik-kanıt (kaynak-okuma testi kabul); (4) 16-sayı-pini canonical'a
taşınır. REPRODUCE: fark-envanteri RED-kanıt sayılır (iki listenin bugün ayrışabildiğini göster).
Smoke: node dist/cli/entry.js doctor (subprocess+dolu-.deck tmp-projede) → '.deck Subprocess Visibility' satırı hâlâ basılır
### goNogo
- goCriteria: doctor.ts'te ikinci check-listesi kalmaz (statik-kanıt testli); canlı doctor check-seti davranış-aynı (önce-sonra envanteri notes'ta); dış-import yüzeyi korunur (tsc temiz); 411-002 regresyon-kilidi testi var; mevcut doctor testleri yeşil.
- nogo: canlı doctor'ın bastığı check-seti sessizce değişirse NO_GO; delegasyon yerine üçüncü kopya oluşursa NO_GO.

## Task 4: SCHED2 — checkpoint-v2: MRR restore'da kaybolmaz (strangler dilim-2)
- Model: sonnet | Effort: high | Provider: claude
- Files: src/orchestra/sprint-checkpoint.ts, src/orchestra/sprint-controller.ts, tests/orchestra/checkpoint-mrr-restore.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/scheduler-unify-design-2026-07-11.md` — "Checkpoint-restore MRR
semantiği" bölümü + Sprint-2 dilimi. KANIT (CC disk-verify): checkpoint yalnız üç ayrık küme yazar —
completedTasks=isTerminalStatus(DONE|NO_GO) (sprint-checkpoint.ts:~176 + ~558-563), pendingTasks=PENDING,
activeWorkers=EXECUTING|CLAIMED → checkpoint anında ZATEN-MRR olan task ÜÇ KÜMENİN DE DIŞINDA kalır;
restore üç kümenin union'ından liste kurar (~652) → MRR task restore'da KAYBOLUR. Ayrıca stale-active
worker restore'da MRR'a çevrilirken (~688+) downstream cascade çalışmaz (controller EVALUATE'a
sıçrar, sprint-controller.ts:~1167). GÖREV (dilim-2 — reducer'a bağlama DEĞİL, o dilim-6):
(1) checkpoint şeması v2: schemaVersion alanı + TAM task-durum haritası (her task: id, status,
fixForTaskId varsa, sıra korunur) + remainingQueue + activeWorkers + lastDecisionSeq (yoksa 0);
v1-writer yerine v2 yazılır, ACİL-ROLLBACK: env DECKENT_CHECKPOINT_V1=1 eski-writer'ı geri açar;
(2) DUAL-READER: v1 checkpoint'ler okunmaya devam eder (legacy decoder — eksik task'ları yalnız
aynı sprint'in persisted task-kayıtlarından tamamlar, bulamazsa dürüst-warn); (3) restore-semantiği
born-610 sözlüğüne bağlanır: MRR terminal-non-satisfying — restore edilen sprint'te ZATEN-MRR task
kaybolmaz (haritada taşınır), stale-active→MRR dönüşümünün PENDING descendant'ları (direkt+transitif)
restore-yolunda cascade-skip işaretlenir (mevcut cascadeSkipped sözleşmesiyle: sentetik-NO_GO +
cascadeSkipped:true — fix/xfix üretmez) ve bu task'lar için spawn SIFIR; scheduler-truth
predicate'lerini ve (uygunsa) sprint-411'in scheduler-state helper'ını KULLAN, yeniden-icat etme;
(4) test: v2 round-trip (MRR'lı sprint → checkpoint → restore → MRR aynen + descendant'lar
cascade-skip + spawn-çağrısı yok) + v1-decoder yolu + rollback-env yolu. KAPSAM-DIŞI: reducer,
closure'lar, planDispatch, FIFO — dokunma.
### goNogo
- goCriteria: v2 şema + dual-reader + rollback-env üçü de testli; zaten-MRR round-trip'te kaybolmuyor; stale-active→MRR descendant'ları restore'da cascade-skip (fix-üretmez, cascadeSkipped:true) + spawn sıfır kanıtı; tests/orchestra/ tamamı yeşil.
- nogo: reducer·closure·planDispatch·FIFO'ya dokunulursa NO_GO; v1 okunamaz hale gelirse NO_GO; MRR restore'da hâlâ kayboluyorsa NO_GO.
