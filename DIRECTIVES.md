# DIRECTIVES — SPRINT-403: RUN-RENAME D1 + GATE-FLAG-THREAD + FLAKE + NESTED-HONESTY (510 · 519-kalan · 525 · 526)

## Goal
Alperen-direktifi (2026-07-11): kullanıcı-yüzeyi "sprint"→"run" kelime-revizyonu BAŞLASIN (dilim-1: i18n değerleri);
628 gate-flag'inin start-yüzeylerine bağlanması; CI-yeşil için duvar-saati flake ailesi; call_tool dürüstlük kalanları.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · build YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: RUN-RENAME-D1 — sprint→run kullanıcı-yüzeyi kelime-revizyonu (dilim-1: messages.ts)
- Model: sonnet | Agent: refactorer
- Files: src/cli/helpers/messages.ts
- Scope: src/cli/helpers/, tests/
- Dependencies: none
### Description
KARAR (Alperen 2026-07-06, MASTER-PLAN satır-492+510): kullanıcı-yüzeyinde "sprint" kelimesi → "run"
(run=iş-koşusu; İÇ kod-adları/mesaj-KEY'leri DEĞİŞMEZ). Bugün messages.ts'de ~153 "sprint" occurrence
var ve CLI "Run 402 (sprint) (sprint-402)" gibi karışık basıyor. DİLİM-1 kapsamı: YALNIZ
src/cli/helpers/messages.ts içindeki en+tr DEĞER-metinlerinde görünen "Sprint/sprint" kelimesini
"Run/run"a çevir. SINIRLAR: (1) mesaj KEY-adları (örn. `sprint.started`) AYNEN kalır — key-rename
ayrı dilim; (2) `{sprintId}` gibi interpolasyon-değişken adları ve içine gelen "sprint-403" gibi
DATA değerleri kalır (onlar veri, display-şablon değil); (3) TR metinde de teknik terim "run"
kullanılır (kod/terim EN kuralı, örn. "Run tamamlandı"); (4) "sprint" kelimesi bir KOMUT-adını
(`deckent start` argümanı vb.) veya dosya-yolunu aktarıyorsa DOKUNMA. Değer-değişimlerinden etkilenen
TÜM test-beklentilerini senkronla (affected-testleri `node scripts/affected-tests.mjs --changed
src/cli/helpers/messages.ts --json` ile bul; docs/guides/affected-tests-gate.md rehber). Kalan
occurrence'ları (inline-string'ler, başka dosyalar) notes'a dilim-2 envanteri olarak grep-listeyle yaz.
### goNogo
- goCriteria: messages.ts değer-metinlerinde kullanıcı-görünür "sprint" kelimesi kalmadı (key-adları/veri-interpolasyonları hariç — grep-kanıtı notes'ta); en+tr paritesi korunur (tests/i18n yeşil); etkilenen tüm test-beklentileri senkron; dilim-2 envanteri notes'ta.
- nogo: key-rename yapılırsa (kapsam-aşımı) NO_GO; test-senkronsuz bırakılırsa NO_GO.

## Task 2: GATE-FLAG-THREAD — 628-kalan: --force-prompt-gate CLI + MCP acknowledgePromptGate
- Model: sonnet | Agent: api-builder
- Files: src/cli/commands/start.ts, src/mcp/tools/start.ts, tests/cli/start-prompt-gate-flag.test.ts, docs/reference/api-surface.md
- Scope: src/cli/, src/mcp/, tests/cli/, docs/reference/
- Dependencies: none
### Description
402-001 runSprint'e `RunSprintOptions.acknowledgePromptGate` + `decidePromptGateBlock`'u indirdi
(sprint-controller.ts) ama start-yüzeyleri henüz geçirmiyor. FIX: start.ts'e `--force-prompt-gate`
opsiyonu (mevcut `--force-scope` deseninin BİREBİR simetriği — start.ts:168 option-tanımı +
start.ts:462 `acknowledgeScopePaths: opts.forceScope === true` geçiş-noktası); MCP
src/mcp/tools/start.ts input-şemasına `acknowledgePromptGate` alanı (acknowledgeScopePaths'in yanına)
ve runSprint çağrısına threading. RED test: bugün flag yok (option-parse hatası / şema-alanı yok) →
fix sonrası flag geçince RunSprintOptions.acknowledgePromptGate=true ulaşır (composition-pin:
start.ts kaynağında `acknowledgePromptGate: opts.forcePromptGate === true` satırı + MCP şema-alanı
assert). docs/reference/api-surface.md deckent_start şemasını belgeliyorsa güncelle (402-001
docImpact-notu).
### goNogo
- goCriteria: CLI flag + MCP alanı canlı (composition-pin testli); mevcut start/gate testleri yeşil (tests/cli/start-gate-exit.test.ts 3/3 + prompt-gate-start-path 16/16 dahil); api-surface doc güncel (varsa).
- nogo: flag tanımlanıp runSprint'e GEÇİRİLMEZSE (yarım-wire) NO_GO.

## Task 3: FLAKE-WALLCLOCK — born-632: duvar-saati assert ailesi hermetikleştir
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing
- Files: tests/cli/shutdown-hooks.test.ts, tests/orchestra/sprint-spawner-throttle.test.ts
- Scope: tests/
- Dependencies: none
### Description
İki kanıtlı CI-flake: (1) tests/cli/shutdown-hooks.test.ts 'collectively bounded' `elapsed>=4500`
assert'i — VITEST_MAX_FORKS=2 tam-koşuda 3157ms ölçüldü (fork-baskısı timer-coalescing; standalone
yeşil); (2) tests/orchestra/sprint-spawner-throttle.test.ts '<50ms' assert'i CI'da 522ms ölçtü
(rerun'la yeşillendi). FIX: her ikisini fake-timer'a (`vi.useFakeTimers`) geçir — davranış-anlamını
koruyarak (throttle SIRALAMASINI/çağrı-sayısını asserte et, duvar-saatini değil); fake-timer
uygulanamayan yerde yük-dayanıklı tolerans-bandı + gerekçe-yorumu. EK-görev: aynı sınıftaki diğer
adayları tara — `grep -rn "toBeLessThan(\(50\|100\|200\))" tests/` + `elapsed`/`Date.now()` assert
desenleri — bulguları fix ETMEDEN envanter olarak notes'a yaz (dilim-2 kararı Brain'in).
### goNogo
- goCriteria: iki dosya fake-timer/dayanıklı-bant ile hermetik (VITEST_MAX_FORKS=2 tam cli+orchestra koşusunda yeşil — kanıt notes'ta); davranış-anlamı korunur (throttle/bound semantiği hâlâ asserte ediliyor, test içi boşaltma YOK); aday-envanteri notes'ta.
- nogo: assert silinip yerine hiçbir anlamlı kontrol konmazsa NO_GO.

## Task 4: NESTED-HONESTY — born-633: call_tool nested-dispatch dürüstlük ailesi (4 kalem)
- Model: sonnet | Agent: refactorer
- Files: src/cli/repl/native-tool-registry.ts, src/cli/repl/native-agent-bridge.ts, tests/cli/nested-dispatch-honesty.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
607'nin BEFORE-done P2 kalanları — iç-başarısızlık dışarıya "başarılı" görünüyor: (1) nested handler
ok:false dönerse dispatchToolCall status:'executed' + dış ok:true basıyor (native-tool-registry.ts:407-408)
→ ToolResult-unwrap: iç ok:false → dış ok:false + iç error-metni korunur; (2) parity-deny throw'u
status:'error'/[mcp-error] etiketiyle raporlanıyor → policy-deny AYRI sınıf: status:'denied' (veya
mevcut status-enum'una uygun dürüst-etiket) + '[approval-denied]'-ailesi etiketi (telemetri + modelin
kendi hata-görüşü için); (3) nested ask'te confirm 'a'=hep-izin-ver sunuluyor ama parity persist
etmiyor (bilinçli) → nested-yolda 'a' seçeneğini 'yalnız bu sefer' anlamına indir (once'a degrade
ZATEN var — kullanıcıya görünen etiketi dürüstleştir; string'ler caller-injected/i18n-uyumlu kalsın);
(4) nested exec toolSink/trace'e görünmüyor → call_tool üzerinden koşan hedef-tool çağrısı da
toolSink'e (ve varsa turn-trace'e) kaydedilsin — dış call_tool kaydının İÇİNDE nested-işaretli
(TRN-614 pillar bağlantısı: trace'te kaybolmasın). RED-testler: her kalem için önce bugünkü maskeleme
davranışını kanıtla, sonra fix.
### goNogo
- goCriteria: 4 kalem için RED→GREEN test çifti; iç-fail dışarı ok:false; policy-deny ayrı-sınıf etiket; nested confirm-etiketi dürüst; nested exec toolSink-görünür (nested-işaretli); native-tool-registry + bridge'i import eden tüm testler yeşil (calltool-exec-wire dahil).
- nogo: yalnız (1) yapılıp diğer kalemler sessizce atlanırsa NO_GO (dürüst-eksik=DEBT kabul, sessiz-eksik değil).
