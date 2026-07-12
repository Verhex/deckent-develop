# DIRECTIVES — SPRINT-418: TT554 METERING-TRUTH + TT553 HOST-LIFECYCLE + SEC-04 CATALOG-LAZY

## Goal
TRACE-treni P1 dilimi (549-kilidi AÇILDI — ölçüm-işleri artık koşulabilir) + RC-6'dan SEC-04.
**TRACE-task'ları model=opus (Alperen).** born-667 dersi: 20-dakika forensik-sınırı geçerli.
SSOT: MASTER-PLAN 553/554 + sweep-raporu SEC-04; memory project_trace_truth_train_2026_07_12 +
[[project_resolvetokenusage_wire_is_harmful]] (554 için ZORUNLU-OKU) + feedback_zero_hardcode_live_data.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST: fix'ten önce hatalı davranışı RED testle kanıtla.
- i18n-FIRST (user-facing CLI metni); test hermetik (tmpdir, async spawn, ≤16GB).
- ZAMAN-DİSİPLİNİ: 20dk içinde koda başla; bulamadığını dürüstçe 'açık' bırak.

## Task 1: TT554 — METERING-TRUTH: tarife/capability-drift + ledger-eksiği + estimator + reporter (COST-10X ölçüm-tabanı)
- Model: opus | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/core/model-registry.ts, src/core/token-counter.ts, src/orchestra/sprint-reporter.ts, src/core/cost-ledger.ts, tests/core/metering-truth.test.ts
- Scope: src/core/, src/orchestra/, tests/core/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): memory project_resolvetokenusage_wire_is_harmful — usage-patch/result-collector
KONTRATINA DOKUNMA (born-562 regresyon-dersi); bu task yalnız TARİFE/ESTİMATÖR/REPORTER katmanı.
KANIT (trace-audit 554): (1) model-registry sonnet-5 tarife 3/15 — provider-envelope 5/25 ima
ediyor (%40 düşük; 413-002/003 vakası: provider $8.48'in yalnız $5.08'i=%59.9 ledger'da) + ctx
1M-vs-200K & maxOut 128K-vs-32K capability-drift (model-registry.ts:~68) + haiku yardımcı-maliyet
ledger-dışı ($0.0127); (2) estimatedTokens 8-10× düşük (chars/4 — CLI system-prompt + tool-schema
+ connector yüzeyi hesapta yok; token-counter.ts'in eski 5.6× notuyla tutarlı); (3) reporter:
coverage=NaN% + Total-Tasks attempt/task karışımı (5-vs-4). GÖREV: (1) TARİFE/CAPABILITY
canlı-doğrulama: registry'deki her claude-model satırı için provider-envelope'tan (trace/ledger'daki
gerçek usage-cost oranları) türetilen ORAN-testi — hardcode-düzeltme değil, kanıt-tablosuyla
düzeltme (zero-hardcode-live-data: sayılar canlı-kaynak referanslı; sonnet-5 5/25 + ctx/maxOut
gerçek değerleri kanıtla-yaz); haiku yardımcı-çağrıları ledger'a girer; (2) provider modelUsage →
ledger köprüsü + LOCAL-vs-PROVIDER variance-alert (eşik-aşımında loud-warn — sessiz-sapma ölür);
(3) estimator: chars/4 çıplak-metin yerine bileşen-farkındalıklı (system-prompt + tool-schema
sabit-yükleri; kalibrasyon-katsayısı gerçek-trace'ten türetilir, kaynak-notu koda yazılır);
(4) reporter: coverage-NaN fix + attempt-vs-task ayrımı (5-attempt/4-task doğru basılır) +
files-changed/cost gerçek-alanları. RED-first her kalem için (mevcut yanlış-değer assert'le
kanıtlanır). ⚠ BUILD-GATE: bu kod-fix'i Alperen build+restart'ına kadar MCP'de görünmez — notes'a yaz.
### goNogo
- goCriteria: 4 kalem RED→GREEN; tarife/ctx değerleri kanıt-referanslı (hardcode-yamasız); variance-alert testli; usage-patch/result-collector kontratı byte-korunur (diff-kanıt); tests/core+orchestra ilgili-aile yeşil.
- nogo: usage-patch kontratına dokunulursa NO_GO (born-562); tarife kanıtsız-elle yazılırsa NO_GO; variance sessiz kalırsa NO_GO.

## Task 2: TT553 — HOST-LIFECYCLE: heartbeat HOST-sinyaline döner (worker dosya-disiplini ölür)
- Model: opus | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/agents/worker.ts, src/orchestra/heartbeat-monitor.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/host-lifecycle-heartbeat.test.ts
- Scope: src/agents/, src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (trace-audit 553): lifecycle worker'ın .hb-dosya-yazma DİSİPLİNİNE emanet — trace'te
hardcoded-ts hb `2026-07-11T00:00:00.000Z` 33× (WORKER-GUIDE ihlali; disk .hb tek-obje olduğundan
görünmüyordu) + worker'lar manuel .hb/date tool-call'larıyla israf + stale-hb yanlış-kill →
412-003 phantom-fix zinciri. GÖREV: liveness HOST-sinyalinden türer, worker yalnız SEMANTIC
currentAction yayınlar: (1) liveness-kaynağı platform-adapter matrisiyle (Yasa #2):
docker=container-state+log-activity · subprocess=process-alive(pid) + stdout/stderr-activity ·
tmux=pane-activity; adapter arayüzü tek (hostLivenessProbe), platform-dalları içerde;
Windows-subprocess dalı dürüst (tasklist/pid-probe ya da process-handle); (2) .hb dosyası
GERİYE-UYUMLU kalır (okuyucular kırılmaz) ama LIVENESS kararı artık host-sinyalinden; .hb yalnız
currentAction taşıyıcısı (yazılamazsa kill-sebebi DEĞİL); hardcoded/bayat-ts artık yanlış-kill
üretemez (RED: bayat-ts .hb + canlı-host-sinyal fixture'ında bugün kill kararı çıktığını kanıtla
→ GREEN: canlı sayılır); (3) stale-eşiği host-sinyal-yokluğuna göre; kill-kararı log'unda hangi
sinyalin öldüğü adlı-yazılır; (4) WORKER-GUIDE/worker-prompt'taki manuel-hb talimatı
sadeleşir (currentAction-only). Mevcut heartbeat-testleri güncellenir — davranış-değişimi
(dosya-yazamayan-ama-canlı worker artık ölmez) AYRI test-case'le pinli.
### goNogo
- goCriteria: hostLivenessProbe adapter (docker/subprocess/tmux + Win-dalı) testli; bayat-ts RED→GREEN (yanlış-kill ölür); .hb geriye-uyumlu (okuyucu-testleri yeşil); kill-log adlı-sinyalli; tests/orchestra tamamı yeşil.
- nogo: .hb-format kırılırsa NO_GO; tek-platform fix'i (adapter'sız) NO_GO; liveness hâlâ dosya-mtime'a bağlıysa NO_GO.

## Task 3: SEC04 — model-catalog fetch'i lazy: her CLI-komutu network'e çıkmasın (RC-6 dilimi)
- Model: sonnet | Agent: bug-fixer | Effort: medium | Provider: claude
- Files: src/cli/entry.ts, src/core/model-catalog.ts, src/cli/helpers/messages.ts, tests/cli/catalog-lazy-bootstrap.test.ts
- Scope: src/cli/, src/core/model-catalog.ts, tests/cli/
- Dependencies: none
### Description
KANIT (sol-sweep SEC-04): argümanlı HER CLI-komutu preAction-hook'unda (src/cli/entry.ts:~1130)
catalog-bootstrap ediyor — warm-cache/offline yoksa models.dev'e 5s-timeout'lu GET (enterprise/
airgap'te her `deckent status` bile dış-çağrı; AS-7 offline-pillar çelişkisi). GÖREV: (1) fetch
LAZY olur: yalnız MODEL-BAĞIMLI akışlar tetikler (plan/start/run/models/chat sınıfı — komut-
sınıflandırmasını command-registry'den türet, elle-liste İCAT ETME; registry'de uygun alan yoksa
minimal ekle); status/doctor/history/config gibi okuma-komutları network'süz; (2) network-policy
GÖRÜNÜR: fetch olacağı zaman stderr'e tek-satır bilgi (i18n; DECKENT_OFFLINE=1 ya da mevcut
offline-config'i varsa ONA saygı — envanterle, yeniden-icat etme); (3) warm-cache davranışı
DEĞİŞMEZ (cache varken sıfır-network aynı kalır); (4) RED-first: bugün `status`-sınıfı bir komutun
fetch-yoluna girdiğini enjekte-fetch'le kanıtla → GREEN: girmiyor; model-bağımlı komut hâlâ
fetch'liyor + policy-satırı basıyor.
Smoke: DECKENT_OFFLINE=1 deckent status → network-denemesiz exit 0 (CC post-sprint kurulu-binary ile koşar)
### goNogo
- goCriteria: komut-sınıflandırması registry-türevli; status-sınıfı RED→GREEN network'süz; model-bağımlı yol + policy-satırı testli; warm-cache yolu byte-davranış-aynı; i18n en+tr; mevcut cli testleri yeşil.
- nogo: elle-komut-listesi hardcode'lanırsa NO_GO; warm-cache davranışı değişirse NO_GO; offline-config zaten varsa ve yok-sayılırsa NO_GO.
