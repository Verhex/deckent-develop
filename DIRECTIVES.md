# A3 EVENT-TRUTH DALGASI (DEVAM) — hb-rewire · CLI-status-readiness · MCP/API-parity · evidence-harness

## Goal

sprint-674'un devami: dalga-1'de landen ve dist'e alinan altyapi (hb primitive'i 674-001,
append-disiplini 674-003, read-model CAS + resolveRunStatusReadiness 674-004, authority
flow-terminal join 674-005, dependency shape-fix 674-008) uzerine kalan dort is kapanir:
kalan hb yazicilarinin primitive'e rewire'i, CLI status'un readiness kontratina gecisi,
MCP/API parity ve dalga evidence-harness'i. sprint-674 ABORTED-kapanis nedeni eski-dist
dependency-bug'iydi; fix artik dist'te — ayni imza (DONE bagimliliga "Pending") tekrar
GORULMEMELI. Owner-onayli plan: /home/alperen/.claude/plans/snuggly-doodling-stream.md

## Execution contract

- Otorite: main'deki kontratlar; assertion zayiflatilmaz. Kesif-referanslari task
  Description'larinda exact dosya:satir olarak verilmistir — once oku, sonra degistir.
- Yalniz kendi Files listendeki dosyalara yaz; Reads listendekileri OKU. Scope disina cikma.
- 0-hardcode: yeni esik/deger yok; davranis-degisimleri typed ve geriye-uyumlu.
- Legacy `.hb` semasi ve `pid` alani KORUNUR (subprocess process-pid probe girdisi, TT553);
  canonicalize etmek YASAK. `.hb` "ONCE at start" kadansi 7094-F1d owner-karari — kadans
  DAYATILMAZ, yalniz yazim-yarisi guard'lanir.
- Sozlesme degisiminde test yeniden-ifade edilir (guard gevsetme degil, 3210 emsali).
- Testler hermetik (tmpdir); VITEST_MAX_FORKS=2. Urun-kontrat celiskisinde NO_GO + exact kanit.
- Aktif run sirasinda build/provider-auth/bot mutation YASAK.
- Scoped vitest yesili tek basina yetmez: degistirdigin dosyalar icin `npx tsc --noEmit`
  SIFIR hata olmali (674-001/005 dersi: union-daraltma hatalari vitest'ten kacip build'i
  kirdi); tsc ciktisini result notes'a yaz.

## Task 1: kalan bagimsiz hb yazicilarinin primitive'e rewire'i
- Files: src/agents/agentic-worker-entry.ts, src/agents/http-agentic-worker.ts, src/agents/worker-approval-env.ts, src/providers/subprocess.ts, src/providers/gemini.ts, src/providers/ollama.ts, tests/agents/worker-heartbeat-single-writer.test.ts
- Reads: src/core/worker-activity-heartbeat.ts, src/agents/worker.ts
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/agents/worker-heartbeat-single-writer.test.ts
### Description
674-001'in landen primitive'i `writeTaskHeartbeatFile` (Reads listesindeki core
worker-activity-heartbeat modulunde export mevcut — o module YAZMA, yalniz import et;
imzayi ve WorkerHeartbeatFileWriteResult donusunu OKU) alti inline writeFileSync .hb
yazimina uygulanir: agentic-worker-entry.ts:134-155,
http-agentic-worker.ts:570 civari, subprocess.ts:702-718 (15s periyodik timer :559-563
dahil), gemini.ts:797-810, ollama.ts:778-791, worker-approval-env.ts:53-66. Sema degisimi
YOK; her cagri mevcut payload'ini aynen uretir, yalniz yazim primitive uzerinden akar.
worker-approval-env.ts'deki read-modify-write TOCTOU penceresi primitive'in monotonic
guard'li refresh'iyle kapanir (yarisda asla gerileme). spawn-backend-docker.ts'e DOKUNMA
(zaten atomic+canonical). YENI test 3 it: yarisan iki yazicida dosya asla gerilemez;
approval-refresh sequence monotonic artar; provider yazicisi primitive uzerinden yazar
(tmpdir kaniti).

## Task 2: CLI status — sweep senkron + UNAVAILABLE yerine readiness + dedup + fixRetry render
- Files: src/cli/commands/status.ts, tests/cli/status-json-contract.test.ts, tests/cli/status-paused-render.test.ts, tests/cli/commands/status.test.ts
- Reads: src/core/run-status-read-model.ts, src/core/run-status-authority.ts, src/orchestra/run-flow-death-sweep.ts, src/cli/helpers/messages.ts, tests/cli/status-read-model-wire.test.ts, src/cli/helpers/output.ts, src/cli/helpers/process.ts, src/cli/helpers/shutdown-hooks.ts, src/core/types.ts, src/monitor/sprint-state.ts
- Priority: HIGH
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/cli/status-json-contract.test.ts tests/cli/status-paused-render.test.ts tests/cli/commands/status.test.ts tests/cli/status-read-model-wire.test.ts
### Description
Altyapi HAZIR ve dist'te: resolveRunStatusReadiness + fixRetry projeksiyonu
(src/core/run-status-read-model.ts, 674-004) ve authority flow-terminal join (674-005).
(a) status.ts:836-838 fire-and-forget sweep (`void import().then().catch(()=>{})`) kalkar;
sweepDeadDetachedRuns (SYNC, run-flow-death-sweep.ts:80) statik import ile hem human hem
JSON yollarinin basinda authority-okumadan ONCE cagrilir; sonucu JSON'da
`deathSweep:{closed,skipped}` alani, hatasi typed uyari satiri (getMessage en+tr; sessiz
yutum biter). (b) :863-880 ve :1042-1044'teki `lifecycle:'UNAVAILABLE'` sentezi kalkar:
lifecycle DAIMA authority.lifecycle; yeni `readiness` alani resolveRunStatusReadiness'ten;
HOLD durumunda `error:{code:'RUN_STATUS_READ_MODEL_UNAVAILABLE',disposition:'HOLD'}`
korunur (kod adi degismez). requiresPersistedRunStatusReadModel:331-350 export imzasi
korunarak paylasilan predicate'e delege eder. (c) dedup: :579-614 yerel task-loader →
loadCanonicalRunTasks (run-status-read-model.ts:198-241); :616-673 logical-progress
kopyasi → read-model'in tek projeksiyon fonksiyonu; :1085-1096 elle-quiescent →
isQuiescentRunAuthority(:369-377); :1098 ham .dashboard re-read kaldirilir (authority zaten
okuyor). (d) blocked task render'inda fixRetry disposition satirlari (getMessage en+tr;
`retry-pending` ve `budget-exhausted` ayri metin). Test yeniden-ifadesi:
status-json-contract.test.ts:438-463 UNAVAILABLE pinleri → readiness kontrati;
status-paused-render.test.ts'e PAUSED+resumable pini (top-level lifecycle PAUSED kalir,
readiness HOLD degil); sweep'in cagrildigini assert eden YENI it. Gercek-binary status
kaniti landing'de host tarafindan kosulur — in-sprint dist-smoke yok.

## Task 3: MCP + API readiness parity
- Files: src/mcp/tools/status.ts, src/api/status-reconcile.ts, tests/api/status-reconcile.test.ts, tests/mcp/status-readiness-parity.test.ts
- Reads: src/core/run-status-read-model.ts, src/core/run-status-authority.ts, src/cli/commands/status.ts, tests/mcp/status-failed-tasks.test.ts
- Priority: NORMAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/mcp/status-readiness-parity.test.ts tests/api/status-reconcile.test.ts tests/mcp/status-failed-tasks.test.ts
### Description
mcp/tools/status.ts:387-391 canonicalHasLiveProjection (drift'li: PAUSED istisnasiz → hep
HOLD; PID-kanitli ACTIVE'de CLI-render/MCP-HOLD celiskisi) → resolveRunStatusReadiness'e
delege (674-004 ile dist'te hazir); :393-413 HOLD govdesinde :397 `lifecycle:'UNAVAILABLE'`
→ authority.lifecycle + `readiness:'HOLD'`. api/status-reconcile.ts:142-146 uclu-liste →
ayni predicate; :174-191 UNAVAILABLE blogu → lifecycle authority.lifecycle + readiness
(alerts ve error kodlari korunur; dashboard web UI 'UNAVAILABLE'a branch etmiyor —
dogrulandi, davranis kaybi yok). YENI parity testi 3 it: ayni tmpdir fixture'larinda
(PAUSED+resumable / unproven-ACTIVE / kanitli-olu-flow ABORTED) CLI buildStatusJsonSnapshot
+ MCP dali + API reconcileStatusResponse lifecycle+readiness ciktilari birebir ES. Olu
run-state-feed.ts'e DOKUNMA (A4 finding). Gercek-binary uc-yuzey kaniti landing'de host
tarafindan kosulur.

## Task 4: dalga evidence harness
- Files: tests/integration/event-truth-wave-evidence.test.ts
- Reads: src/core/worker-activity-heartbeat.ts, src/core/run-status-read-model.ts, src/core/run-status-authority.ts, src/orchestra/task-builder.ts, src/cli/commands/status.ts
- Priority: LOW
- Dependencies: Task 1, Task 2, Task 3
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/integration/event-truth-wave-evidence.test.ts
### Description
Dalganin DoD'sini tek hermetik regresyon-bekcisinde pinle (A2 Task-7 emsali; gercek-binary
kanitlar landing'de host tarafindan ayrica kosulur): (1) yarisan iki .hb yazimi → dosya
asla gerilemez; (2) yarisan iki publishCanonicalRunStatusReadModel → revision
strict-advance, kayip yok; (3) kanitli-olu-flow fixture → authority ABORTED+resumable:false
ve CLI/MCP/API lifecycle+readiness parity; (4) obje-form filesChanged'li dependency →
prompt blogunda gercek dosya listesi, "(Pending)" yok. (4 it; tmpdir, gercek dosya-yollari,
mock-suz core cagrilari.)
