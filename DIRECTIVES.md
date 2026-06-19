# DIRECTIVES — Sprint: Autonomous v2 MissionScheduler (dogfood + CC-verify)

## Goal: `docs/superpowers/plans/2026-06-19-autonomous-v2-scheduler.md` planını uygula — `runMissionScheduler` (MissionStore üzerinde concurrent, race-free runtime: serial atomic-claim + concurrent-execute, mission settlement, abort-drain). **Additive** — tek yeni dosya `src/orchestra/autonomous/mission-store/mission-scheduler.ts`; canlı autonomous loop'a (runtime-loop.ts/execute-dispatcher.ts/autonomous.ts/backlog.ts) DOKUNMA → mevcut autonomous suite trivial-yeşil. TDD (failing-test → impl → green), tam kod planda. Tek task = tek dosya.

## Ortak kurallar (BAĞLAYICI)
- **Plan-dosyasını OKU** (`docs/superpowers/plans/2026-06-19-autonomous-v2-scheduler.md`) — tam kod + 3 TDD-task + testler orada; SIRAYLA uygula (hepsi aynı `mission-scheduler.ts` + test dosyasını kurar). **Cerrahi** — yalnız Files/Scope. **ESM** `.js` import-suffix. **sprint-293'ün MissionStore'unu tüket** (`./mission-types.js`, `./sqlite-mission-store.js`). **Race-free** = `store.claimItem` (atomic); `false` → re-query. **No busy-spin** = `Promise.race(inFlight)`. **Fail-safe** = dispatch-error → item failed; checkMissionComplete try/catch. **Hermetik test** (tmpdir-db, afterEach, no spawnSync; ≤5ms timer overlap için OK). `tsc --noEmit` temiz. **Canlı autonomous loop'a DOKUNMA.** **No haiku.**

---

## Task 1: MissionScheduler — concurrent race-free runtime (plan Task 1-3)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-scheduler.ts, tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
Planın **Task 1 + Task 2 + Task 3** bölümlerini SIRAYLA uygula (tek dosya `mission-scheduler.ts` + tek test dosyası). `mission-scheduler.ts`: `DispatchFn`, `MissionSchedulerOptions`, `MissionSchedulerSummary`, `runMissionScheduler(store, dispatch, opts)` + internal `checkMissionComplete`. Loop: **serial atomic-claim** (`store.claimItem`) up to free slots + **concurrent dispatch** (inject edilen `dispatch`, AWAIT etme) + `inFlight`/`poolSize` gate (makeBoundedPool YOK) + settle'da `updateItemStatus` writeback + `checkMissionComplete` (tüm item'lar terminal → `updateMissionStatus` completed/failed + `setMissionProgress` + `onMissionSettled` hook). Abort → `Promise.allSettled(inFlight)` drain → 'aborted'. Plandaki tam kodu + tüm testleri (concurrency-bound peak===poolSize, race-free each-once, settlement completed/failed, throw→failed, abort-drain, idle-drained, Type-1+Type-2) birebir uygula.

**Kanıt:** `grep -nE "runMissionScheduler|claimItem|Promise.race\(inFlight\)|onMissionSettled" src/orchestra/autonomous/mission-store/mission-scheduler.ts` → eklendi; `npx vitest run tests/orchestra/autonomous/mission-store/mission-scheduler.test.ts` → yeşil.
**Test:** plandaki tüm testler — **concurrency-bound (4 item/poolSize 2 → peak===2, hepsi done), race-free (each dispatched once), settlement (all done→completed / any fail→failed + onMissionSettled tam-1-kez), throw→failed+loop devam, abort→drain+no-running, empty→drained, Type-1+Type-2 eşzamanlı→ikisi completed**. Gerçek SqliteMissionStore + fake-dispatch ile tmpdir'de assert et.

---

**Beklenen:** Tek worker `mission-scheduler.ts`'i plana göre TDD ile kurar. Sprint-sonu: `tsc --noEmit` temiz; `npx vitest run tests/orchestra/autonomous/` → scheduler testleri + sprint-293 mission-store testleri + mevcut autonomous suite yeşil (additive, canlı loop dokunulmadı). CC disk-verify eder.
