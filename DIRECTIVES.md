# DIRECTIVES — SPRINT-416: TRACE-TRUTH P0 DİLİMİ (549 CAPTURE · 550 INGEST · 551 FIX-TRACE)

## Goal
TRACE-TRUTH treni (Alperen, 2026-07-12; MASTER-PLAN 549-559, memory
project_trace_truth_train_2026_07_12) ilk dilimi — ölçüm-gerçeği + korpus-dürüstlüğü. Kural:
554/555 (metering/turn-economy) BU üçlü düzelmeden koşulmaz. **Alperen kararı: bu trende model=opus.**
552 TRACE-V2 sonraki sprint. Trace-korpusu SP-2 moat'ının hammaddesi — veri-kaybı geri-dönüşsüz sınıf.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST: fix'ten önce hatalı davranışı RED testle kanıtla (docker'a GERÇEK bağımlılık YASAK — spawn/exec enjekte-edilebilir olsun).
- Test hermetik: tmpdir, async spawn (test-kodunda spawnSync YASAK), ≤16GB.
- `.deckent/traces/sprint-worker.jsonl` CANLI dosya — testler ona DOKUNMAZ (tmpdir-fixture).

## Task 1: TT549 — CAPTURE-TRUTH: docker-log yakalama 1MiB'ta kesiliyor (%44 korpus kesik, usage-patch ölüyor)
- Model: opus | Effort: high | Provider: claude
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-capture-truth.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (trace-audit, CC-doğrulanmış): `docker logs` çağrısı spawnSync ile **maxBuffer'sız** (Node
default 1MiB) ve **error/status kontrolsüz** (src/orchestra/spawn-backend-docker.ts:~2141) →
trace-korpusunun %44'ü (16/36) kesik; kesiklerin TAMAMI 1.075–1.171MB bandında (sabit-boyut
imzası — başka açıklama yok). Aynı kesik terminal-envelope'u ve **usage-patch'i** de öldürüyor →
cost-heuristic 293× sapma (413-001 vakası). GÖREV: (1) yakalama STREAM-tabanlı olur: `docker logs`
async-spawn + stdout/stderr chunk'ları doğrudan hedef-dosyaya/buffer'a akıtılır — sabit-buffer
üst-sınırı YOK (makul emniyet-tavanı 256MB, aşımda dürüst-truncation-marker + loud-warn; sessiz-kesme
ASLA); (2) exit/error dürüst: spawn-error, non-zero-exit, sinyal → adlı loud-warn + eldeki-kısmî-veri
`captureIncomplete:true` işaretiyle teslim (kayıp gizlenmez); (3) spawn enjekte-edilebilir
(worker-image-check.ts SpawnImpl deseni — testler gerçek-docker'sız); (4) usage-patch'in aynı
akıştan beslendiğini doğrula — kesik-fix'iyle patch'in de kurtulduğunu ayrı test-case'le pinle
(memory-uyarısı: [[project_resolvetokenusage_wire_is_harmful]] — usage-patch KONTRATINA dokunma,
yalnız girdisinin tam-veri olmasını sağla); (5) RED-first: enjekte-spawn'la >1MiB sahte-log →
bugünkü kodun ~1MiB'ta kestiğini + error-yutmayı kanıtla → GREEN: tam-boyut + marker-yok +
error-yolu dürüst. tests/orchestra/ blast'ı koş.
### goNogo
- goCriteria: RED (1MiB-kesme + error-yutma) → GREEN (stream, tavan-aşımı marker'lı, exit-dürüst); spawn-injectable; usage-patch tam-veri pinli (kontrat değişmedi-diff-kanıt); tests/orchestra tamamı yeşil.
- nogo: maxBuffer-büyütme-yaması (stream'siz) yeterli sayılırsa NO_GO; sessiz-truncation kalırsa NO_GO; gerçek-docker'a bağımlı test NO_GO; usage-patch kontratı değişirse NO_GO.

## Task 2: TT550 — RESULT-INGEST-IDNORM: malformed result-taskId phantom-fix + trace-kaybı üretiyor (+üçüncü-neden kazısı)
- Model: opus | Effort: high | Provider: claude
- Files: src/orchestra/result-collector.ts, tests/orchestra/result-ingest-idnorm.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (trace-audit, ≥2 CANLI vaka: 412-003 + 409-002): worker result-dosyasına taskId'yi
`task-XXX` (prefix'li) yazarsa buildResultsMap (src/orchestra/result-collector.ts:~286)
VERBATIM-index'lediği için lookup-MISS → tek kökten ÜÇ zarar: (a) phantom fix-worker doğar
($2.23/4.25dk — "impl zaten worktree'de" diyen boş-fix), (b) trace kaybolur, (c) NO_GO-label
kaybolur (korpus-bias). GÖREV: (1) ingest-noktasında taskId-NORMALİZASYON: `task-` prefix'i
soyulur + dosya-adından türetilen expected-taskId ile içerik-taskId karşılaştırılır — uyuşmazlıkta
LOUD-WARN (hangi dosya, hangi iki değer) + normalize-edilmiş kabul (veri atılmaz); normalize
TEK ingest-noktasında olur (downstream ikinci-normalize İCAT ETME); (2) **ÜÇÜNCÜ-NEDEN KAZISI
(görevin yarısı bu):** 404-002 vakasında ID DÜZGÜNKEN de result düşmüş — result-collector
ingest-yolunu (glob/timing/lock/collectedIds) forensik oku, olası kök(ler)i kanıt-satırlarıyla
notes'a yaz; reproduce edebiliyorsan RED-test + fix, edemiyorsan dürüst 'reproduce-edilemedi +
şüpheli-mekanizma-listesi' (uydurma-fix YASAK); (3) RED-first: `task-412-003` içerikli
result-fixture → bugünkü map-miss kanıtı → GREEN: normalize + warn + fix-task doğmaz (debt-manager
yoluna sızmadığını handleEvaluation-seviyesinde pinle). ⚠ Bu dosyada sprint-414 shadow-driver
kancası var — o bölgeye DOKUNMA. tests/orchestra/ blast'ı koş.
### goNogo
- goCriteria: RED (verbatim-miss) → GREEN (tek-nokta normalize + loud-warn + phantom-fix-doğmaz pini); üçüncü-neden kazısı kanıt-satırlı (fix VEYA dürüst-bulgu); shadow-kancası byte-korunur; tests/orchestra tamamı yeşil.
- nogo: normalize birden-çok noktaya kopyalanırsa NO_GO; uyuşmazlık sessiz-kabul edilirse NO_GO; üçüncü-neden bölümü boş/genel-geçerse NO_GO.

## Task 3: TT551 — FIX-PHASE-TRACE: FIX-fazı trace yazmıyor → korpus success-biased (0 NO_GO etiketi)
- Model: opus | Effort: high | Provider: claude
- Files: src/orchestra/sprint-phases.ts, src/orchestra/trace-recorder.ts, tests/orchestra/fix-phase-trace.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (trace-audit): recordSprintWorkerTrace YALNIZ EVALUATE-fazında çağrılıyor
(src/orchestra/sprint-phases.ts:~2121) — runFixPhase trace YAZMIYOR → NO_GO→FIX→DONE yörüngeleri
(SFT için EN değerli örnekler: hata+düzeltme çifti) ve ara-NO_GO verdict'leri kayıt-dışı; mevcut
36-kayıtlık korpus 27 DONE / 9 debt / **0 NO_GO** (success-biased). GÖREV: (1) FIX-fazına
trace-wire: EVALUATE'teki recordSprintWorkerTrace çağrı-desenini AYNEN izle (yeniden-icat yok;
recorder tek-API kalır — trace-recorder.ts yoksa fonksiyonun gerçek ev-dosyasını bul ve Files'ı
ona göre uygula, notes'a yaz); fix-worker'ın trace'i orijinal-attempt'ten AYRI kayıt olur;
(2) meta-alanları: attempt (1..n), retryOf (orijinal taskId), purpose ('fix'|'xfix'|'original'),
verdict (evaluation-sonucu — NO_GO dahil); MEVCUT kayıt-şemasını KIRMA (yeni alanlar additive;
mevcut tüketici pipeline.ts okumaya devam eder — grep'le tüketici-envanteri notes'a); (3) RED-first:
fix-yolu fixture'ında bugün trace-YAZILMADIĞI kanıtı → GREEN: fix-attempt kaydı + NO_GO-verdict'li
orijinal kaydı + additive-şema; (4) canlı-dosyaya dokunmadan tmpdir-fixture. tests/orchestra/ blast.
### goNogo
- goCriteria: RED (fix-fazı 0-trace) → GREEN (fix+orijinal ayrı-kayıt, attempt/retryOf/purpose/verdict alanları); şema additive (mevcut-tüketici testleri yeşil + envanter notes'ta); recorder tek-API; tests/orchestra tamamı yeşil.
- nogo: ikinci bir recorder-API doğarsa NO_GO; mevcut şema-alanı kırılırsa NO_GO; NO_GO-verdict hâlâ kayıt-dışıysa NO_GO.
