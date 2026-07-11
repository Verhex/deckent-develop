# DIRECTIVES — SPRINT-417: WIN-EXITCODE-KİLİDİ + TT550-DAR + TT552 TRACE-V2

## Goal
born-665 (P0, XPLAT-matrix kırmızı-kilidi) + TT550'nin küçültülmüş yeniden-koşusu (sprint-416'da
2× worker-timeout; born-667) + TT552 TRACE-V2 (SP-2 moat önkoşulu). TRACE-treni kuralı sürüyor:
554/555 bu tren bitmeden koşulmaz. **TRACE-task'ları model=opus (Alperen).**
SSOT: MASTER-PLAN 560 + 550 + 552; memory project_trace_truth_train_2026_07_12.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST: fix'ten önce hatalı davranışı RED testle kanıtla.
- Test hermetik: tmpdir, async spawn, ≤16GB; `.deckent/traces/` canlı-dosyalarına DOKUNMA.
- ZAMAN-DİSİPLİNİ (born-667 dersi): forensik-okumayı sınırla — 20dk içinde koda başla; bulamadığını dürüstçe 'açık' bırak, timeout'a sürüklenme.

## Task 1: WIN665 — Windows init exit-code ezilmesi: SETUP_INCOMPLETE basıyor, exit 1 dönüyor (XPLAT-kilidi)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/cli/commands/init.ts, src/cli/entry.ts, scripts/xplat-install-smoke.mjs, tests/cli/init-exitcode-contract.test.ts
- Scope: src/cli/, scripts/, tests/cli/
- Dependencies: none
### Description
KANIT (ba3190db Cross-Platform E2E, windows-latest İLK koşu): packed-install + binary-resolve OK;
kurulu `deckent.cmd` ile `init --yes` çıktısı DOĞRU ('Setup outcome: SETUP_INCOMPLETE' +
blocker-bloğu) AMA süreç **exit 1** döndü (sözleşme: SETUP_INCOMPLETE=2); ubuntu+macos aynı akışta
exit 2 doğru. ŞÜPHELİLER (born-665): (a) entry/commander global-error-handler'ı ya da init-akışında
outcome-SONRASI bir adım Windows'ta hata verip process.exitCode'u 1'e eziyor (log'da DEP0190
shell:true spawn-uyarıları var — cursor-detect/MCP-yazım/provisioning-artığı adaylar); (b) exitCode
set-edildikten sonra printError+exitCode=1 yazan yol; (c) .cmd-shim errorlevel (düşük-olasılık).
GÖREV: (1) init'in exit-code YAŞAM-DÖNGÜSÜNÜ oku: `process.exitCode` set-noktaları + onu
SONRADAN yazabilecek her yol (grep 'exitCode' src/cli/ — envanter notes'a); outcome-sonrası
adımların (cursor/MCP/ide-adapter yazımları, doctor, provisioning) hata-yollarında exitCode'a
dokunanları bul; (2) SÖZLEŞME-KORUMASI: outcome-exitCode set edildikten sonra HİÇBİR non-fatal
adım onu EZEMEZ — merkezi koruma (örn. outcome-kararı en-son yazılır ya da 'finalExitCode'
kilidi); Windows-spesifik hata veren adım ayrıca dürüst-warn'lanır ama exit-sözleşmesini bozmaz;
(3) xplat-smoke'a teşhis-artırımı: init'in stderr'i AYRI yakalanıp FAIL halinde son-20-satırı
loga basılır (bir-sonraki CI-koşusu kesin-kanıt versin); (4) RED-first (platform-agnostik):
outcome-sonrası-adımı-hata-veren fixture'da bugün exitCode'un ezildiğini kanıtla → GREEN: sözleşme
korunur. KESİN Windows-kanıtı push-sonrası CI'dadır — notes'a 'CI-doğrulama-bekliyor' yaz, DONE
iddiasını buna göre dürüst ver (kod+test+lokal-kanıt = GO_WITH_TECH_DEBT kabul edilebilir).
Smoke: node scripts/xplat-install-smoke.mjs → XPLAT SMOKE OK (linux)
### goNogo
- goCriteria: exitCode-yazar envanteri notes'ta; ezen-yol RED→GREEN (sözleşme-kilidi); smoke stderr-teşhisi eklendi; linux-smoke yeşil; mevcut init testleri yeşil.
- nogo: sözleşme-kilidi olmadan yalnız tekil-adım yamanırsa NO_GO; exitCode envanteri boşsa NO_GO.

## Task 2: TT550D — result-ingest taskId-normalize (DAR kapsam — kazı YOK)
- Model: opus | Agent: bug-fixer | Effort: medium | Provider: claude
- Files: src/orchestra/result-collector.ts, tests/orchestra/result-ingest-idnorm.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
YENİDEN-KOŞU (sprint-416'da 2× worker-timeout — bu kez DAR: yalnız normalize; 'üçüncü-neden
kazısı' KAPSAM-DIŞI, born-655'te açık kalır). KANIT: worker result'a taskId'yi `task-XXX` yazarsa
buildResultsMap (result-collector.ts:~286) verbatim-index → lookup-miss → phantom-fix + trace-kaybı
+ NO_GO-label-kaybı (canlı: 412-003, 409-002). GÖREV: (1) TEK ingest-noktasında normalize:
`task-` prefix soyulur; dosya-adından türeyen expected-id ile içerik-id uyuşmazlığında LOUD-WARN
(dosya + iki değer) + normalize-kabul; (2) RED-first: `task-XXX` fixture → bugünkü miss → GREEN:
normalize + warn + phantom-fix doğmaz (handleEvaluation-seviyesi pin); (3) sprint-414
shadow-driver kancasına ve sprint-411 scheduler-state bölgesine DOKUNMA. 20-dakika-kuralı: bu task
küçük — uzatma.
### goNogo
- goCriteria: RED→GREEN tek-nokta normalize + loud-warn + phantom-fix-doğmaz pini; shadow/scheduler-state bölgeleri byte-korunur; tests/orchestra tamamı yeşil.
- nogo: normalize çoklanırsa NO_GO; sessiz-kabul NO_GO; kazıya girilirse (kapsam-aşımı) NO_GO.

## Task 3: TT552 — TRACE-V2: sidecar/projection ayrımı + prompt-inject + gerçek tool_calls + quarantine
- Model: opus | Effort: high | Provider: claude
- Files: src/agent/trace-recorder.ts, src/orchestra/sprint-phases.ts, src/core/trace-schema.ts, scripts/trace-pipeline/pipeline.ts, tests/orchestra/trace-v2-schema.test.ts
- Scope: src/agent/, src/orchestra/, src/core/, scripts/trace-pipeline/, tests/orchestra/
- Dependencies: none
### Description
KANIT (MASTER-PLAN 552 + trace-audit): bugünkü trace SFT-kullanılamaz — 0 system/user mesajı
(task-prompt YOK), 0 native tool_calls, TÜM tool-mesajları boş tool_call_id (403-001: 1868 orphan),
~%66 telemetri-gürültüsü (thinking_tokens/init/rate-limit), kaynak ts/seq düşürülüyor, Read
çift-temsil, truncation yalnız downstream (pipeline.ts:176). GÖREV (549+551 temeli üstüne
anlam-katmanı): (1) ŞEMA-V2 + schemaVersion alanı + ESKİ-OKUYUCU korunur (dual-read; mevcut
tüketici-envanterini grep'le çıkar, notes'a); (2) TELEMETRY-SIDECAR ↔ TRAINING-PROJECTION AYRIMI:
ham-akış telemetrisi ayrı kanala (sidecar), eğitim-kaydında yalnız konuşma+tool-akışı; (3)
SYSTEM+TASK-PROMPT INJECT: worker'ın gerçek prompt'u arşivden (.tasks arşivindeki .prompt-*.txt
deseni — gerçek ev-yolunu bul, notes'a) kayda system/user mesajları olarak bağlanır; (4) GERÇEK
tool_calls: assistant-mesajlarında native tool_calls dizisi + tool-result'larda EŞLEŞEN
tool_call_id (orphan-sınıfı ölür); ts/seq kaynaktan taşınır; Read çift-temsili tekleşir; (5)
INCOMPLETE-QUARANTINE: kesik/eksik kayıt (captureIncomplete, id-eşleşmesiz, prompt'suz)
corpus-DIŞI damgalanır (quarantine:true + neden) — sessizce eğitim-setine sızmaz; (6) RED-first:
mevcut-format örnek-kaydında SFT-kusurlarını (orphan-id, telemetri-oranı, prompt-yokluğu) assert'le
kanıtla → GREEN: v2-kayıt aynı fixture'dan temiz üretilir. Dosya-adları farklıysa (trace-schema.ts/
pipeline yolu) gerçek evlerini bul, Files-amaçlarına sadık uygula, sapmaları notes'a yaz.
### goNogo
- goCriteria: schemaVersion+dual-read (eski-okuyucu testli); sidecar/projection ayrımı; prompt-inject gerçek-arşivden; tool_call_id eşleşmesi (orphan=0 yeni-kayıtta); quarantine damgası; RED(SFT-kusurları)→GREEN; tüketici-envanteri notes'ta; tests/orchestra tamamı yeşil.
- nogo: eski-okuyucu kırılırsa NO_GO; telemetri eğitim-projeksiyonunda kalırsa NO_GO; quarantine'siz kesik-kayıt corpus'a girerse NO_GO.
