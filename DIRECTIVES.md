# DIRECTIVES — SPRINT-428: 13 MİKRO-TASK — WIRE-FINISH · TERM-6 CUTOVER · SCHED-7 FIFO · BUILD-GUARD

## Goal
born-674 WIRE-FINISH (Task 1-3: üç prompt-bloğunun ctx-doldurması — cache/turn-maliyet etkisi burada
doğar) · TERM dilim-6 canonical-cutover (Task 4-9, run_flow_v2 flag'i altında) · SCHED dilim-7
FIFO-safety (Task 10-11) · born-644/542 container-build-guard (Task 12) + kompozisyon-kanıtı (Task 13'ü 9'a katıldı).
Tasarım-SSOT: `docs/analysis/term-flow-unify-design-2026-07-11.md` Sprint-6 satırı + Riskler,
`docs/analysis/scheduler-unify-design-2026-07-11.md` Sprint-7 satırı; born-spec'ler `.analysis/born-backlog.json`.
NOT: dogfood `scheduler.engine=reducer` bu sprint'te CANLI (ilk gerçek koşu) — sorun görürsen notes'a yaz.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/` runtime SALT-OKU · `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik; 15dk-forensik-sınırı. i18n-FIRST (REPL user-metni).
- TERM task'ları (4-9): terminal.run_flow_v2 flag-off SIFIR davranış-değişimi.

## Task 1: W674A — ctx-doldurma: toolInventory + verifyCommands (born-674)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/task-builder.ts, tests/orchestra/ctx-population-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-674 spec'ini OKU. buildWorkerPrompt'un SprintContext kurulumunda: toolInventory =
readToolInventory(projectRoot, sprintId) (427-011'in persist'i) + verifyCommands =
resolveVerifyCommands(projectRoot) (worker-verify-tool) doldurulur → 427'nin env-probe ve
VERIFY-STEPS blokları GERÇEK veriyle render olur. Her ikisi fail-soft (hata → alan undefined,
prompt-build durmaz). Inventory-dosyası yoksa bugünkü davranış bit-eş.
### goNogo
- goCriteria: iki alan gerçek-kaynaktan dolar (testle); fail-soft; dosya-yoksa bit-eş; test yeşil.
- nogo: prompt-build hatayla kırılırsa NO_GO.

## Task 2: W674B — tools.allowlist_enabled flag'i + toolAllowlist ctx (born-674)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/core/config-types.ts, src/core/config.ts, src/orchestra/task-builder.ts, tests/orchestra/allowlist-flag-wire.test.ts
- Scope: src/core/, src/orchestra/, tests/orchestra/
- Dependencies: Task 1
### Description
Config'e tools.allowlist_enabled (typed, DEFAULT false) eklenir; flag-on iken buildWorkerPrompt
ctx.toolAllowlist = computeToolAllowlist(task…) (427-013 çekirdeği) doldurur → 427-014 bloğu canlanır.
Flag-off bugünkü tam-yüzey bit-eş (pinli). Dogfood config-DOSYASINA dokunma.
### goNogo
- goCriteria: flag typed+default-off; flag-on ctx dolar (testle); flag-off bit-eş pinli; test yeşil.
- nogo: default-on NO_GO; dogfood-config değişirse NO_GO.

## Task 3: W674C — üç-blok uçtan-uca render kanıtı (born-674)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/orchestra/prompt-blocks-e2e.test.ts
- Scope: tests/orchestra/
- Dependencies: Task 1, Task 2
### Description
Tmp-proje fixture'ında (gerçek stack-dosyalarıyla) probe→persist→buildWorkerPrompt zinciri koşar;
env-probe + VERIFY-STEPS + (flag-on) allowlist bloklarının GERÇEK-VERİ render'ı assert edilir
(mock-değil; probe'un kendisi injectable-fake'le hermetik tutulabilir ama resolve/render zinciri gerçek).
### goNogo
- goCriteria: üç blok gerçek-zincirle render (testle); hermetik; test yeşil.
- nogo: blok-metni mock'lanırsa NO_GO.

## Task 4: T6A — cli-bridge-tool-specs canonical-yol notu (TERM-6)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/repl/cli-bridge-tool-specs.ts, tests/cli/canonical-cutover-specs.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
Tasarım Sprint-6: flag-açıkken system-prompt/tool-tanıtımı 'canonical yol = deckent_propose_run'
der; ham set/plan/start tool'ları KALIR ama 'expert escape-hatch' etiketiyle. Flag-off metin bit-eş;
tool-sayı-pinleri iki-durumlu kalır.
### goNogo
- goCriteria: flag-on canonical-not + escape-hatch etiketi; flag-off bit-eş; pinler güncel; test yeşil.
- nogo: tool silinirse NO_GO.

## Task 5: T6B — DECKENT.md canonical-akış dokümantasyonu (TERM-6)
- Model: haiku | Agent: doc-writer | Effort: normal | Provider: claude
- Files: DECKENT.md
- Scope: DECKENT.md
- Dependencies: Task 4
### Description
DECKENT.md'de native-terminal iş-başlatma anlatımı canonical-akışa güncellenir: NL→propose_run→
gerçek-plan-önizleme→onay→snapshot-start→correlated-result (flag'li olduğu ve eski yolun expert
escape-hatch kaldığı DÜRÜSTÇE yazılır — flag-off default'u yanlış anlatma). Kod YOK, yalnız doc.
(soul.default.md'nin aynı-içerik güncellemesi CC/host-side yapılacak — scope-parser çok-noktalı
dosya-adı düşürme bug'ı nedeniyle bu task'a alınmadı, born-675.)
### goNogo
- goCriteria: DECKENT.md akışı doğru+dürüst anlatır; kod-değişikliği sıfır.
- nogo: koda dokunursa NO_GO.

## Task 6: T6C — do.ts compatibility-adapter (TERM-6; sync-stdio + DIRECTIVES-swap ölür)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/commands/do.ts, tests/cli/do-runflow-adapter.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
ÖNCE OKU: tasarım 'Ölecek parçalar' (defaultSpawnStart do.ts:119 · swapDirectives do.ts:96 ·
exit-code-only evaluate do.ts:163). Flag-açıkken `deckent do` RunFlow-yoluna delege eder:
proposal-compile→preview→(non-interactive onay semantiği: --yes şart, yoksa dürüst-red)→
snapshot-start→rich-result (426/427 servisleri — YENİDEN İCAT YOK); global DIRECTIVES-swap ve
sync-stdio spawn bu yolda YOK. Flag-off eski davranış bit-eş.
### goNogo
- goCriteria: flag-on delege-zinciri servislerle (testle); swap/sync-spawn flag-on yolda sıfır; flag-off bit-eş; test yeşil.
- nogo: flag-off değişirse NO_GO; ikinci akış-kopyası yazılırsa NO_GO.

## Task 7: T6D — plan-nl compatibility-preview-adapter (TERM-6)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/commands/plan-nl.ts, tests/cli/plan-nl-adapter.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
Tasarım: buildPlanNlIntent runtime-canonical kaynağı olarak ölür; plan-nl flag-açıkken
plan-preview-service'e delege eden compatibility-preview-adapter olur (çıktı-şekli korunur);
flag-off bit-eş.
### goNogo
- goCriteria: flag-on delege (testle); çıktı-şekli korunur; flag-off bit-eş; test yeşil.
- nogo: buildPlanNlIntent'e yeni tüketici eklenirse NO_GO.

## Task 8: T6E — cli/index route-wiring (TERM-6)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/index.ts, tests/cli/index-runflow-wiring.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 6, Task 7
### Description
do/plan-nl adapter'larının index-kayıtları flag-duyarlı bağlanır (yeni komut YOK — mevcut komutların
flag-on davranış-değişimi Task 6-7'de; burada yalnız kayıt/yönlendirme + help-metni tutarlılığı).
Flag-off bit-eş.
### goNogo
- goCriteria: kayıtlar tutarlı; flag-off bit-eş; test yeşil.
- nogo: yeni komut doğarsa NO_GO.

## Task 9: T6F — term-flow composition-pin testi (TERM-6)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/cli/term-flow-composition.test.ts
- Scope: tests/cli/
- Dependencies: Task 8
### Description
Tasarımın composition-gate'i: TEK fixture'da NL→typed-proposal→builder-validation→actual-preview→
digest-bound-approval→exact-snapshot→tek-detached-job(mock-spawn)→rich-result→idle-new-turn zinciri
(426/427 gerçek servis/reducer'larıyla, spawn mock). Duplicate-event double-start üretmez (risk-pini).
NOT: gerçek-binary 511-dogfood koşusu CC/host-side yapılacak — bu test onun hermetik ikizi.
### goNogo
- goCriteria: tam-zincir tek-fixture; double-start pini; gerçek servisler (mock yalnız spawn); test yeşil.
- nogo: zincir parçalanırsa NO_GO.

## Task 10: S7A — scheduler FIFO dependency-safety (SCHED-7)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/scheduler-reducer.ts, tests/orchestra/scheduler-fifo-dependency-safety.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU: scheduler-tasarım Sprint-7 satırı. Reducer'da blocked-head korunur + SONRAKİ eligible task
seçilir (kuyruk stall olmaz); MRR/NO_GO'lu dependency spawn DEĞİL cascade üretir (bypass geri
açılmaz). NOT: dogfood engine=reducer CANLI — legacy semantiği de bit-eş kalmalı.
### goNogo
- goCriteria: blocked-head + next-eligible fixture'lı; MRR/NO_GO-dep cascade; stall-yok; test yeşil.
- nogo: dependency-bypass açılırsa NO_GO.

## Task 11: S7B — FIFO config-migration + stall-pin güncelleme (SCHED-7)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/core/config-types.ts, src/core/config.ts, tests/orchestra/processqueue-stall.test.ts
- Scope: src/core/, tests/orchestra/
- Dependencies: Task 2, Task 10
### Description
Tasarım Sprint-7 config-migration: FIFO/dependency davranış-anahtarları typed-config'e (mevcut
local-cast idiom'ları resmileşir — 427-023 model_multiplier + scheduler.engine emsal);
processqueue-stall pinleri Task-10 davranışına senkron. Default'lar bugünkü davranışı ÜRETİR.
### goNogo
- goCriteria: typed-config geriye-uyumlu; stall-pinler güncel+yeşil; test yeşil.
- nogo: default davranış değişirse NO_GO.

## Task 12: B542 — container build-yasağı guard'ı (born-644)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-dist-guard.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-644/satır-542 spec'ini OKU: sprint-403'te worker container'da build koşup volume-mount'la
host-dist'i ezdi (ESM-cache zehirlenmesi). Guard: dist/ container'a READ-ONLY mount edilir
(docker run -v …:ro) — worker build'i container-içi kalır, host-dist ezilemez; mount-satırı testle
pinli. WORKER-GUIDE'daki build-yasağı metni zaten var — mekanik enforcement bu.
### goNogo
- goCriteria: dist ro-mount pinli; mevcut mount-davranışları bit-eş (yalnız ro-bayrağı); test yeşil.
- nogo: volume-yolu değişirse NO_GO; 549 stream-capture bozulursa NO_GO.

## Task 13: S7C — FIFO composition-kanıtı (SCHED-7 kapanışı)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/orchestra/scheduler-fifo-composition.test.ts
- Scope: tests/orchestra/
- Dependencies: Task 11
### Description
Task 10-11'in birleşik kanıtı: blocked-head+next-eligible+cascade davranışı driver→reducer→executor
tam-zincirde (427'nin composition-test desenini kopyala-uyarla); legacy-vs-reducer engine'de
davranış-eşdeğerliği (FIFO-dep-deliği İŞARETLİ-assert kalır).
### goNogo
- goCriteria: tam-zincir composition; iki-engine kıyası; test yeşil.
- nogo: fixture canlı-sprint'e dokunursa NO_GO.
