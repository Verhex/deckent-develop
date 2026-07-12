# DIRECTIVES — SPRINT-427: 24 MİKRO-TASK — TERM-5 · SCHED-6 · TRACE-P2 · WIRE · GUARD · TIMEOUT

## Goal
Mikro-task dalga-sprint'i (Alperen-direktifi: bol küçük task + Dependencies grafiği):
TERM dilim-5 correlated-result-turn (Task 1-6) · SCHED dilim-6 cascade/restore-live (Task 7-10) ·
TT555-WIRE born-670 (Task 11-12) · 559 tool-allowlist (Task 13-14, opus) · 557 trace-segment
(Task 15-16, opus) · 558 redact-prefix (Task 17, opus) · born-672 guard'lar (Task 18-19) ·
born-671 store-taşıma (Task 20) · born-673 e2e (Task 21-22) · born-667 timeout (Task 23-24).
Tasarım-SSOT: `docs/analysis/term-flow-unify-design-2026-07-11.md` Sprint-5 satırı +
`docs/analysis/scheduler-unify-design-2026-07-11.md` Sprint-6 satırı; born-spec'ler `.analysis/born-backlog.json`.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/` runtime SALT-OKU · `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik; 15dk-forensik-sınırı. i18n-FIRST (REPL user-metni).
- TERM task'ları (1-6): terminal.run_flow_v2 flag'i ALTINDA — flag-off SIFIR davranış-değişimi.
- SCHED task'ları (7-10): scheduler.engine=reducer ALTINDA — legacy yol bit-eş kalır.

## Task 1: TERM5-FIN — sprint-finalizer rich completion-record (flowId'li)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/sprint-finalizer.ts, tests/orchestra/sprint-finalizer-runflow.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
Finalize çıktısına zengin completion-record ekle: flowId (varsa), verdict-özetleri (DONE/debt/NO_GO
sayıları), task-özet listesi — exit-code-only evaluate'in ölümüne veri-zemini (tasarım 'Ölecek parçalar').
Mevcut finalize davranışı bit-eş; record additive alan/dosya. Kayıt run-completion izleyicilerinin
okuyabileceği yerde (mevcut completion-artifact desenini İZLE, yeni mekanizma icat etme).
### goNogo
- goCriteria: additive record flowId+verdict+task-özet taşır; mevcut finalize çıktıları bit-eş; test yeşil.
- nogo: mevcut finalize alanı değişir/silinirse NO_GO.

## Task 2: TERM5-FEED — run-state-feed flowId-korelasyonu
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/helpers/run-state-feed.ts, tests/cli/run-state-feed-corr.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 1
### Description
Feed'in okuma-modeline flowId-korelasyonu ekle: Task-1'in rich completion-record'ı + detached-handle
flowId'siyle eşleşen completion-event'i typed döndür. flowId'siz eski kayıtlar aynen çalışır (legacy-yol).
### goNogo
- goCriteria: flowId'li kayıt correlated-event üretir; flowId'siz yol bit-eş; test yeşil.
- nogo: mevcut feed tüketicileri kırılırsa NO_GO.

## Task 3: TERM5-WATCH — run-completion-watch korelasyon (yanlış-eşleşme ölür)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/repl/run-completion-watch.ts, tests/cli/run-completion-watch-corr.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 2
### Description
Tasarım-riski: watcher bütün project-job'larını görüyor, handle korelasyon taşımıyor (multi-session
yanlış-eşleşme). Watch'a opsiyonel flowId-filtresi ekle (Task-2 feed'i üstünden); fs.watch+poll
dayanıklılığı AYNEN korunur; filtresiz çağrı bit-eş.
### goNogo
- goCriteria: flowId verilince yalnız o flow'un completion'ı düşer; filtresiz yol bit-eş; test yeşil.
- nogo: mevcut count-watcher davranışı değişirse NO_GO.

## Task 4: TERM5-QUEUE — chat-turn-queue correlated result-turn (idle-wake)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/repl/chat-turn-queue.ts, tests/cli/chat-turn-queue-runflow.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 3
### Description
Queue'ya correlated result-turn üretimi: Task-3 korelasyonlu completion → rich-result içerikli turn
(idle REPL uyanır; active-turn'de buffer). Mevcut bg_turns üreticisi (642) EMSAL — deseni izle;
run_flow_v2-off'ta yeni üretim yok.
### goNogo
- goCriteria: correlated completion idle'da turn üretir, active'de buffer'lanır; flag-off sıfır-üretim; test yeşil.
- nogo: mevcut queue tüketicileri kırılırsa NO_GO.

## Task 5: TERM5-CTRL — controller terminal-state reduce (correlated event'ten)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/repl/run-flow-controller.ts, tests/cli/run-flow-controller-complete.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 4
### Description
Controller'a completion-kanalı: correlated event → reducer'la DETACHED_RUNNING→COMPLETED/FAILED
(idempotent — aynı event ikinci kez no-op; digest/flowId uyuşmayan event YOK SAYILIR loud-log'la).
Mevcut propose/approve/startApproved yüzeyi değişmez.
### goNogo
- goCriteria: terminal-state geçişleri reducer üstünden; yanlış-flow event'i etkisiz; idempotent; test yeşil.
- nogo: mevcut controller-API kırılırsa NO_GO.

## Task 6: TERM5-UI — REPL result-turn render + i18n
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/cli/repl/app.tsx, src/cli/repl/run.tsx, src/cli/helpers/messages.ts, tests/cli/run-flow-result-turn.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 5
### Description
Task 4-5 zincirini REPL'e bağla: correlated result-turn transcript'te rich görünür (verdict-özet +
flowId); 426-002'nin mount-desenini İZLE (wireRunFlowMount emsal). Tüm yeni metin getMessage en+tr.
Flag-off sıfır-fark render-testle pinli.
### goNogo
- goCriteria: flag-on result-turn render'lı; flag-off sıfır-fark; i18n en+tr; test yeşil.
- nogo: flag-off fark NO_GO.

## Task 7: SCHED6-RED — reducer cascade/restore kararları
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/scheduler-reducer.ts, tests/orchestra/scheduler-reducer-cascade.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU: scheduler-tasarım Sprint-6 satırı + Riskler (persist-before-commit). Reducer'a CascadeSkip
karar-üretimi: NO_GO/MRR kökünden direct/transitive bağımlılar cascade-skip effect'i olarak sıralanır
(spawn üretilmez); restore-girdisinde 'zaten-skip' tekrar-üretilmez (idempotent karar).
### goNogo
- goCriteria: cascade kararları typed-effect; transitive kapanış doğru; idempotent; test yeşil.
- nogo: canlı spawn-yoluna dokunursa NO_GO.

## Task 8: SCHED6-EFF — CascadeSkip/WriteCheckpoint executor (persist-before-commit)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/scheduler-effects.ts, tests/orchestra/scheduler-effects-cascade.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 7
### Description
Executor'a CascadeSkip + WriteCheckpoint effect-yürütmesi: cascade-persist COMMIT'TEN ÖNCE diske
(tasarım-riski: crash sonrası cross-fix muafiyet-kanıtı kaybolmasın); replay'de duplicate-skip üretmez.
Mevcut SpawnTask/KillWorker yolları bit-eş.
### goNogo
- goCriteria: persist-before-commit sırası testle; replay-idempotent; mevcut effect'ler bit-eş; test yeşil.
- nogo: effect-sırası bozulursa NO_GO.

## Task 9: SCHED6-CKPT — checkpoint restore reducer-parity (MRR korunur)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/sprint-checkpoint.ts, tests/orchestra/checkpoint-cascade-restore.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 8
### Description
Restore-yolu reducer-cascade'le parite: 'zaten-MRR' restore'da kaybolmaz; stale-active→MRR
descendants'ı cascade-skip olur, spawn SIFIR (checkpoint-v2 dilim-2 garantisinin cascade-uzantısı).
### goNogo
- goCriteria: MRR-restore + descendant-skip fixture'lı; spawn sıfır kanıtlı; test yeşil.
- nogo: checkpoint-v2 şeması kırılırsa NO_GO.

## Task 10: SCHED6-COMP — cascade composition-testi + debt tek-yol
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/debt-manager.ts, tests/orchestra/scheduler-cascade-composition.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 9
### Description
Composition-kanıt (tasarım: 'reducer→atomic disk result→evaluate zincirinde -fix ve -xfix oluşmaz;
crash/replay duplicate-skip üretmez'): Task 7-9 zincirini tek fixture'da uçtan-uca; debt-manager'ın
cascade-kaynaklı debt kaydı tek-yoldan (çifte-kayıt ölür).
### goNogo
- goCriteria: -fix/-xfix doğmaz composition-fixture'la; crash/replay temiz; test yeşil.
- nogo: fixture sentetik-değil-canlıysa NO_GO.

## Task 11: WIRE-PROBE — sprint-start env-probe doldurma (born-670a)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/env-probe-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-670 spec'ini OKU. probeToolInventory (worker-verify-tool, artık async) sprint-start'ta BİR KEZ
koşar → SprintContext.toolInventory dolar → prompt-god-template'in mevcut buildEnvProbeBlock'u
CANLANIR (bugün hep boş). Probe-hatası fail-soft (boş inventory, sprint durmaz).
### goNogo
- goCriteria: prompt'a env-probe bloğu gerçek-veriyle girer (testle); fail-soft; test yeşil.
- nogo: sprint-start probe-hatayla kırılırsa NO_GO.

## Task 12: WIRE-VERIFY — worker-prompt verify-komut dürüstlüğü (born-670b)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/verify-commands-prompt.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 11
### Description
YALANCI-PROMPT ölür: prompt bugün 'call verify_task' diyor ama worker-yüzeyinde (claude-CLI) o tool
YOK. (a) resolveVerifyCommands ile çözülen SOMUT check/test komutları WORKER-GUIDE verify-bölümüne
enjekte edilir (worker stack-yanlış komutla tur yakmaz — 555 hedefi); (b) 'call verify_task' ibaresi
gerçekçi alternatife (PIPESTATUS kuralı + somut komutlar) çevrilir. Prompt-boyut-pini güncellenir.
### goNogo
- goCriteria: prompt'ta var-olmayan tool referansı SIFIR; somut komutlar stack'ten; boyut-pin güncel; test yeşil.
- nogo: prompt'ta yüzeyde-olmayan tool kalırsa NO_GO.

## Task 13: ALLOW-CORE — task-bazlı tool-allowlist çekirdeği (559)
- Model: opus | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/core/tool-allowlist.ts, tests/core/tool-allowlist.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
born-664/559 spec'ini OKU. YENİ saf modül: task (taskType/scope/agent) → izinli-tool-seti hesaplama;
42-tool tam-yüzey yerine tipik ~10-15; dynamic-discovery escape-hatch (worker gerekçeli ek-tool
isteyebilsin — mekanizmanın typed sözleşmesi burada, uygulaması Task 14'te). Saf/deterministik, IO yok.
### goNogo
- goCriteria: hesaplama saf+deterministik; escape-hatch sözleşmesi typed; kapsamlı tablo-testi; test yeşil.
- nogo: IO/config-okuma girerse NO_GO.

## Task 14: ALLOW-WIRE — allowlist'in prompt/yüzeye flag'li uygulanması (559)
- Model: opus | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/prompt-god-template.ts, src/orchestra/sprint-phases.ts, tests/orchestra/tool-allowlist-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 11, Task 12, Task 13
### Description
Task-13 çekirdeği worker-yüzeyine: tool-tanıtım/allowlist bölümü prompt'a flag'li (config
tools.allowlist_enabled, default OFF — off'ta bugünkü tam-yüzey bit-eş). Tool-yüzeyinin gerçek
enjeksiyon-noktasını KEŞFET ve notes'a yaz; Files-dışı yazım gerekiyorsa yapma → NO_GO + gerekçe.
### goNogo
- goCriteria: flag-on prompt'ta daraltılmış yüzey; flag-off bit-eş pinli; test yeşil.
- nogo: default-on yapılırsa NO_GO; Files-dışı yazım NO_GO.

## Task 15: TRSEG-WRITE — sprint-partitioned trace-segment + manifest (557)
- Model: opus | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/agent/trace-recorder.ts, src/core/trace-schema.ts, tests/agent/trace-segment.test.ts
- Scope: src/agent/, src/core/, tests/agent/
- Dependencies: none
### Description
born-662/557 spec'ini OKU. Trace yazımı sprint-partitioned append-only segment'lere + manifest +
stable kayıt-ID (task-attempt/fix bazlı — satır-no alıntısı eskimez). 552'nin schemaVersion/dual-read
düzeni KORUNUR (additive). Eski tek-dosya okuyucu kırılmaz.
### goNogo
- goCriteria: segment+manifest+stable-ID; dual-read korunur; append-only testli; test yeşil.
- nogo: 552 şeması kırılırsa NO_GO.

## Task 16: TRSEG-RETAIN — retention/compaction + eski-okuyucu (557)
- Model: opus | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/agent/trace-recorder.ts, tests/agent/trace-retention.test.ts
- Scope: src/agent/, tests/agent/
- Dependencies: Task 15
### Description
Segment retention/compaction politikası (yapılandırılabilir eşik; compaction manifest-güncellemeli,
atomik); okuyucular compaction sırasında tutarlı kalır (tmp+rename). Veri kaybı YASAK — compaction
birleştirir, silmez (retention-silme yalnız açık-eşik üstünde ve manifest'e işlenir).
### goNogo
- goCriteria: compaction atomik+kayıpsız; retention eşiği configurable; okuyucu-tutarlılık testli; test yeşil.
- nogo: sessiz veri-silme NO_GO.

## Task 17: REDACT-SK — sk-ant- uzunluk-bağımsız redaction (558)
- Model: opus | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/core/redact-sensitive.ts, tests/core/redact-prefix.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
born-663/558: `sk-` kuralı ≥20-char istiyor → 19-char test-fixture key'leri (sk-ant-test-111) diske
ulaşıyor. `sk-ant-` prefix'ine uzunluk-BAĞIMSIZ kural; mevcut genel `sk-` kuralı ve diğer desenler
bit-eş (false-positive genişlemesi yok — 'ask-ant' gibi gömülü eşleşme testi).
### goNogo
- goCriteria: sk-ant-* her uzunlukta redact; mevcut desenler bit-eş; sınır-durum testleri; test yeşil.
- nogo: genel sk- kuralı gevşetilirse NO_GO.

## Task 18: GUARD-EXTRACT — pre-start guard bloğu ayrıştırma (born-672a)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/pre-start-guards.ts, src/orchestra/sprint-phases.ts, tests/orchestra/pre-start-guards.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 14
### Description
born-672 spec'ini OKU. runPlanPhase'in dört yan-etkisi (safety-point git-dalı · pre-spawn CI/tsc gate ·
checkBuildStaleness · beforeSprint hooks) YENİ pre-start-guards.ts modülüne ayrışır; plan-fazı bu
modülü çağırır — davranış bit-eş (extract-refactor, sıra korunur).
### goNogo
- goCriteria: dört guard tek modülde; plan-fazı davranışı bit-eş (mevcut suite yeşil); test yeşil.
- nogo: guard-sırası/atlaması değişirse NO_GO.

## Task 19: GUARD-WIRE — snapshot-start yoluna guard'lar (born-672b)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/sprint-controller.ts, tests/orchestra/snapshot-start-guards.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 18
### Description
426-001'in dürüst güvenlik-gerilemesi kapanır: preplannedSprint (flag-on) dalı Task-18 guard-bloğunu
KOŞAR (safety-point + gate + staleness + hooks) — yalnız planlama atlanır, güvenlik atlanmaz.
Flag-off yol bit-eş.
### goNogo
- goCriteria: flag-on dalda dört guard koşar (testle); flag-off bit-eş; TERM dilim-6 cutover-önkoşulu kapanır; test yeşil.
- nogo: flag-off değişirse NO_GO.

## Task 20: STORE-CORE — run-flow-store'un core'a taşınması (born-671)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/core/run-flow-store.ts, src/cli/repl/run-flow-store.ts, src/mcp/tools/start.ts, src/cli/commands/start.ts, src/cli/repl/run-flow-controller.ts, tests/core/run-flow-store.test.ts, tests/cli/run-flow-store.test.ts, tests/orchestra/run-flow-reducer.test.ts
- Scope: src/, tests/
- Dependencies: Task 5
- Smoke: node dist/cli/entry.js start --help → exit 0 + usage metni
### Description
born-671/ADR-D-004 C3: store cli/repl'de ama mcp+cli tüketiyor (mcp→cli import ihlal-emsali).
Taşı: src/core/run-flow-store.ts (run-flow-contract zaten core'da); cli/repl'deki dosya SİLİNİR
(re-export shim BIRAKMA — tüm import'lar güncellenir); test dosyası tests/core/'a taşınır;
run-flow-reducer.test KNOWN_CONSUMERS pini güncellenir. Davranış bit-eş (salt taşıma).
### goNogo
- goCriteria: mcp→cli store-importu SIFIR; tüm tüketiciler core'dan; pin güncel; davranış bit-eş; test yeşil.
- nogo: davranış değişirse NO_GO; shim bırakılırsa NO_GO.

## Task 21: E2E-CLI — start snapshot-dalı CLI e2e testi (born-673a)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/cli/start-snapshot-branch.test.ts
- Scope: tests/cli/
- Dependencies: Task 20
### Description
cli/commands/start.ts'in --flow-id dalı action-handler seviyesinde e2e: runSprint mock'lu — flag-on+
geçerli-snapshot → preplannedSprint'le çağrı (fresh-replan yok); digest-uyuşmazlık → typed hata exit;
flag-off → legacy yol bit-eş. Hermetik (tmpdir store-fixture).
### goNogo
- goCriteria: üç dal (geçerli/uyuşmaz/flag-off) e2e; runSprint çağrı-şekli assert'li; test yeşil.
- nogo: gerçek sprint spawn ederse NO_GO.

## Task 22: E2E-MCP — start snapshot-dalı MCP e2e testi (born-673b)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/mcp/start-snapshot-branch.test.ts
- Scope: tests/mcp/
- Dependencies: Task 20
### Description
mcp/tools/start.ts'in aynı üç dalı MCP tool-handler seviyesinde (Task-21'in ikizi; ortak fixture
deseni kopyala-uyarla). Hermetik.
### goNogo
- goCriteria: üç dal e2e; test yeşil.
- nogo: gerçek sprint spawn ederse NO_GO.

## Task 23: TIMEOUT-TIER — model-tier-duyarlı timeout tabanı (born-667a, P0)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/timeout-estimator.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/timeout-estimator-tier.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/
- Dependencies: none
### Description
born-667 spec'ini OKU. effort_base tek-boyutlu (model-körü) — opus-worker'lar sonnet-tier sürede
timeout'landı (TT550/556 kurbanları). Config'e opsiyonel model-tier çarpanı (örn.
timeout.model_multiplier: {opus: 2.0, sonnet: 1.0, haiku: 0.5} — default'lar geriye-uyumlu:
çarpansız config bugünkü değerleri ÜRETİR); estimator model'i hesaba katar.
### goNogo
- goCriteria: çarpansız config bit-eş; opus-task süresi çarpanla büyür (testle); config-şema typed; test yeşil.
- nogo: mevcut dogfood timeout'ları değişirse (çarpan-tanımsızken) NO_GO.

## Task 24: RECON-DIFF — timeout-placeholder task-scope-diff sinyali (born-667b, P0)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/timeout-placeholder-scope-diff.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-667 spec'ini OKU. Timeout-placeholder'ın 'git diff shows N files' sinyali SPRINT-GENELİ diff
sayıyor (spawn-backend-docker.ts:283 civarı) — diğer worker'ların eş-zamanlı diff'i yanlış-pozitif
'work-present' üretip Spurious-NO_GO-reconcile'ı yanıltıyor (TT550 phantom-vakası). Sinyal task'ın
scope.filesWrite-kesişimli diff'ine daraltılır; kesişim-boş → workPresent=false dürüst yazılır.
### goNogo
- goCriteria: placeholder yalnız task-scope diff'ini sayar (testle); kesişim-boş dürüst; test yeşil.
- nogo: capture/stream-seam (549) bozulursa NO_GO.
