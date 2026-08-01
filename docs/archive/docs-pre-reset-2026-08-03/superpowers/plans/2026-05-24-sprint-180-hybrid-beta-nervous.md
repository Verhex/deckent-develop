# Sprint 180 — Hybrid Beta MUST + Nervous Faz 1 + Panic Guard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint 180 ships 13 tasks across 6 waves — Beta MUST cleanup (worker coverage zorunluluk + gate fix + npm publish + OSS docs) + Nervous Faz 1 Smoke activation (NERVOUS-TODO §11.2-3) + Panic Guard UI (Sprint 179 keşif) — last beta-blocker sprint before June 1 2026 OSS GA launch.

**Architecture:**
- **Layer 1 (Beta MUST)** = targeted fixes in existing `src/agents/`, `src/orchestra/` (worker-verify coverage), `tests/`, `package.json` scripts, root `README.md` + `docs/guide/*`. Sıfır mimari değişiklik.
- **Layer 2 (Nervous Faz 1)** = NERVOUS-TODO §11.2 6-step plan, 2 NEW files in `src/nervous/` (bootstrap + action-handlers) + sprint-controller wire + 1 NEW IPC queue + config schema sync. Mevcut nervous core 7K LoC + 32 test dosyası **dokunulmaz** — sadece consumer wiring.
- **Layer 3 (Panic Guard UI)** = Layer 2 Step E IPC queue altyapısını paylaşır, CLI + MCP path live, no new infra.

**Tech Stack:** TypeScript ESM (Node 24+), vitest 3.x, better-sqlite3 12.10.0, JSONL append-only audit, file-based IPC queue (`.deckent/nervous-ipc/`).

**Spec references:**
- Master initiative: `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §6
- NERVOUS-TODO baseline: `/home/alperen/deckent-dev/NERVOUS-TODO.md` (2026-05-20 audit, 540 satır)
- ADR-040 (Nervous System Architecture, accepted Sprint 147): `docs/adr/040-nervous-system-architecture.md`
- ADR-064 (TOPP continuous-dispatch, Sprint 178 ADR): canlı, plan etkilenmez
- Sub-project #2 design (W4-W5 self-security): `docs/superpowers/specs/2026-05-21-sub-project-2-design.md`

**Predecessors locked live:**
- Sprint 177: Worker rollback (`src/agents/worker-rollback.ts`)
- Sprint 178: TOPP B+C continuous-dispatch (`src/orchestra/result-collector.ts:planDispatch`)
- Sprint 179: Bug A foundation (`src/orchestra/result-evaluator.ts:getAggregateVerdict`) — nervous Faz 1'de stale-worker + dead-event-stream detector aggregate verdict üzerinden çalışacak

---

## File Structure

### Layer 1 — Beta MUST cleanup (4 task)

| File | Task | Responsibility |
|------|------|----------------|
| `src/agents/worker-verify.ts` (modify) | W4-1 | vitest `--coverage` JSON output parse + emit real number to `.result.coverage`; null/0 reject path |
| `src/orchestra/quality-assessor.ts` (modify) | W4-1 | Coverage=0 yerine null → "unmeasured" partial credit (75'e değil 90'a kadar overall puan); coverage zorunlu olmayan task type'lara escape (doc, audit) |
| `tests/agents/worker-verify-coverage.test.ts` (NEW) | W4-1 | TDD 4 case: gerçek coverage parse + null reject + escape hatch + Quality Scorer integration |
| `tests/[SELF_AUDIT_FAILING_TEST].test.ts` (modify) | W4-3 | Sprint 179 self-audit gate'in raporladığı 1 vitest failing — incelenip fix edilecek (gate failure path) |
| `package.json`, `scripts/validate-publish.mjs` (modify) | W5-1 | npm publish v1.0.0-beta.1 readiness — `validate:publish` smoke pass + `npm pack --dry-run` files list audit |
| `README.md`, `docs/guide/installation.md`, `docs/guide/quickstart.md`, `docs/guide/getting-started.md` (modify) | W5-2 | OSS GA docs review — Sprint 178 doc updates'in üzerine son hijyen + install matrix + landing-page-content tutarlılığı |

### Layer 2 — Nervous Faz 1 Smoke (6 task) — NERVOUS-TODO §11.2 6-step

| File | Task | Responsibility |
|------|------|----------------|
| `src/core/config.ts`, `src/core/config-types.ts` (modify) | W0 | Step F — 6 eksik detector default schema (task_mode_idle, build_failure_recurrence, token_spike, agent_routing_anomaly, scope_collision_rate, notification_delivery_health) + dead_event_stream `reserve_for` clear + Zod validation |
| `src/orchestra/sprint-state-tracker.ts` (modify) | W1-1 | Step B — `getSprintStateSnapshot()` export — aktif sprint snapshot (sprintId, currentPhase, activeWorkers, totalTasks, completedTasks) |
| `src/nervous/bootstrap.ts` (NEW) | W1-2 | Step A — `createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider)` fabrika — observer + decision + proposer + dispatcher + executor + history pipeline wire + dispose cleanup |
| `src/nervous/action-handlers.ts` (NEW, ~150 LoC) | W2-1 | Step C — İlk 4 action handler: WORKER_RESPAWN (spawn-backend respawn), ORPHAN_TASK_ARCHIVE (archive-orphans helper), STALE_LOCK_RELEASE (file-lock release), DEAD_EVENT_STREAM_CLEANUP (event-bus prune). Diğer 26 action stub `{outcome:'unimplemented'}` |
| `src/nervous/ipc-queue.ts` (NEW), `src/mcp/tools/nervous.ts` (modify) | W2-2 | Step E — file-based IPC queue (`.deckent/nervous-ipc/{pending,resolved}/*.json`). MCP `nervous_accept/reject` → IPC write → Executor.resolveApproval polling read. Backward-compat: nervous inactive ise mevcut "stub history-only" davranışı korunur |
| `src/orchestra/sprint-controller.ts` (modify) | W3-1 | Step D — `runSprint()` başında `createNervousSystemIfEnabled()` call + finally `nervous?.dispose()`. Default-off respect: `enabled: false` → null early return |
| `.deckent/config.json` (modify) | W3-2 | Faz 1 smoke config: `nervous_system.enabled: true`, detector 3'lü subset (stale-worker, dead-event-stream, directives-protection), authority mode `strict`, severity_min `critical` |
| `tests/nervous/integration-runtime.test.ts` (NEW) | W3-3 | Integration test — gerçek `createNervousSystemIfEnabled()` + fake sprint state + en az 1 detector trigger + `.deckent/nervous-history.jsonl` boş değil + dispatcher file channel yazıyor |

### Layer 3 — Panic Guard UI (2 task)

| File | Task | Responsibility |
|------|------|----------------|
| `src/cli/commands/nervous.ts` (modify), `src/mcp/tools/nervous.ts` (modify) | W4-2 | Panic guard onay UI — Layer 2 W2-2 IPC queue altyapısı. CLI: `deckent nervous accept-panic <task-id>` + MCP: panic event'i `deckent_nervous_subscribe` queue'sune emit + accept/reject path |
| `.deckent/config.json`, `tests/nervous/directives-protection-auto-restore.test.ts` (modify), `docs/guide/nervous-system.md` (NEW kısa giriş, full guide Sprint 181) | W5-3 | `directives_protection.auto_restore` → true (Bug A landed + Sprint 177-005 baseline hook canlı, [[project-panic-guard-no-approval-ui]] çözüldü) + Sprint 149 doc borcu kısa giriş (Nervous nedir, nasıl açılır, hangi detector ne yapar — full guide post-beta Sprint 181) |

---

## Wave 0 — Config Foundation (sequential, single task)

### Task W0: Config schema sync — Step F

**Files:**
- Modify: `src/core/config.ts` (extend `DEFAULT_CONFIG.nervous_system.detectors`)
- Modify: `src/core/config-types.ts` (DetectorConfig interface — 6 yeni field)
- Modify: `src/core/config.ts` (Zod schema validation — 6 yeni detector)
- Create: `tests/core/nervous-config-schema.test.ts`
- Scope: `src/core/`, `tests/core/`

- [ ] **Step 1: Audit current default**

```bash
node -e "console.log(JSON.stringify(require('./dist/core/config.js').DEFAULT_CONFIG.nervous_system.detectors, null, 2))"
```
Beklenen: 6 detector eksik (task_mode_idle, build_failure_recurrence, token_spike, agent_routing_anomaly, scope_collision_rate, notification_delivery_health). dead_event_stream'de `reserve_for: 'sprint-148'` field var.

- [ ] **Step 2: Write failing test (RED)**

```typescript
// tests/core/nervous-config-schema.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config.js';

describe('Nervous config schema sync', () => {
  it('(a) 6 missing detectors default enabled=false', () => {
    const d = DEFAULT_CONFIG.nervous_system.detectors;
    expect(d).toHaveProperty('task_mode_idle.enabled', false);
    expect(d).toHaveProperty('build_failure_recurrence.enabled', false);
    expect(d).toHaveProperty('token_spike.enabled', false);
    expect(d).toHaveProperty('agent_routing_anomaly.enabled', false);
    expect(d).toHaveProperty('scope_collision_rate.enabled', false);
    expect(d).toHaveProperty('notification_delivery_health.enabled', false);
  });

  it('(b) dead_event_stream no longer carries reserve_for', () => {
    const d = DEFAULT_CONFIG.nervous_system.detectors.dead_event_stream;
    expect(d).not.toHaveProperty('reserve_for');
    expect(d.enabled).toBe(false); // still disabled by default
  });

  it('(c) Zod schema accepts new keys without error', () => {
    // Round-trip parse: serialize DEFAULT_CONFIG, parse back, assert equality
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npx vitest run tests/core/nervous-config-schema.test.ts
```
Expected: 3 FAIL (fields missing).

- [ ] **Step 4: Extend DEFAULT_CONFIG**

`src/core/config.ts` — 6 yeni detector default + dead_event_stream'den `reserve_for` field sil:

```typescript
detectors: {
  // ... existing 6 detectors ...
  task_mode_idle: { enabled: false },
  build_failure_recurrence: { enabled: false },
  token_spike: { enabled: false },
  agent_routing_anomaly: { enabled: false },
  scope_collision_rate: { enabled: false },
  notification_delivery_health: { enabled: false },
  dead_event_stream: { enabled: false }, // reserve_for removed
},
```

- [ ] **Step 5: Extend DetectorConfig interface**

`src/core/config-types.ts` — 6 yeni field optional, default false semantics.

- [ ] **Step 6: Update Zod validation**

`src/core/config.ts` — schema'da 6 yeni detector key tanımı + `reserve_for` field opsiyonel kaldır.

- [ ] **Step 7: Run test, expect PASS**

```bash
npx vitest run tests/core/nervous-config-schema.test.ts
```
Expected: 3 PASS.

- [ ] **Step 8: tsc + commit**

```bash
npx tsc --noEmit
git add src/core/config.ts src/core/config-types.ts tests/core/nervous-config-schema.test.ts
git commit -m "feat(180-W0): nervous config schema sync — 6 detector default + dead_event_stream reserve clear"
```

**GO criteria:** 3 test PASS; backward-compat preserved (loadConfig deep merge zaten eksik key'leri default'tan fold ediyor); tsc clean.

**NO_GO criteria:** Schema break (existing config dosyalarında parse error); detector default true (opt-out anti-pattern).

---

## Wave 1-W5 — Detailed Steps

> **Reused pattern:** Steps follow same RED→GREEN TDD as Sprint 179 plan. Detayları sub-project #2 plan'ı + NERVOUS-TODO §11.2 referans verir. Burada her task için yalnızca özet adımlar — tam kod blokları + test surface task spawn olduğunda worker prompt'una embed edilir.

### W1-1: sprint-state-tracker `getSprintStateSnapshot()` — Step B

**Files:** Modify `src/orchestra/sprint-state-tracker.ts`, Create `tests/orchestra/sprint-state-snapshot.test.ts`

`getSprintStateSnapshot(): SprintStateSnapshot` export — { sprintId, currentPhase, activeWorkers: number, totalTasks, completedTasks }. NERVOUS-TODO §11.2 Step B referans. Sprint 161+ phase observability altyapısını kullanır.

**GO:** 3 test PASS (active sprint snapshot + idle state + phase change).
**NO_GO:** Snapshot stale veya phase change miss.

### W1-2: nervous bootstrap fabrika — Step A

**Files:** Create `src/nervous/bootstrap.ts` (~80 LoC), Create `tests/nervous/bootstrap.test.ts`

```typescript
export function createNervousSystemIfEnabled(
  config: DeckentConfig,
  projectRoot: string,
  sprintStateProvider: SprintStateProvider,
): { observer: NervousObserver, dispose: () => void } | null {
  if (!config.nervous_system?.enabled) return null;
  // Observer + DecisionEngine + Proposer + Dispatcher + Executor + History instantiate
  // Wire 'detection' event chain
  // Return dispose() for cleanup
}
```

**GO:** 4 test PASS (enabled=false → null + enabled=true → object + dispose cleanup + observer.start invoked).
**NO_GO:** Observer instantiate edilmez veya dispose memory leak.

### W2-1: 4 action handler — Step C

**Files:** Create `src/nervous/action-handlers.ts` (~150 LoC), Create `tests/nervous/action-handlers.test.ts`

4 MVP handler:
- `WORKER_RESPAWN(taskId)` → spawn-backend.respawnWorker()
- `ORPHAN_TASK_ARCHIVE(sprintId)` → archive-orphans helper call
- `STALE_LOCK_RELEASE(filePath)` → file-lock.release()
- `DEAD_EVENT_STREAM_CLEANUP(sprintId)` → event-bus prune

Diğer 26 action: `{outcome: 'unimplemented', actionId}` stub.

**GO:** 4 unit + 1 integration test PASS (handler chain + stub default + dispatcher emit).
**NO_GO:** Action handler exception propagation + Executor handle çökmesi.

### W2-2: IPC queue MCP→Executor — Step E

**Files:** Create `src/nervous/ipc-queue.ts`, Modify `src/mcp/tools/nervous.ts` (accept/reject path live), Create `tests/nervous/ipc-queue.test.ts`

`.deckent/nervous-ipc/pending/*.json` queue: MCP `nervous_accept(id)` → IPC write; Executor 1s polling read → resolveApproval; resolved/*.json'a taşı. Backward-compat: nervous inactive ise stub history-only davranış.

**GO:** 5 test PASS (write + read + resolved move + concurrent IPC + backward-compat inactive).
**NO_GO:** IPC race condition veya inactive case'de regression.

### W3-1: sprint-controller wire — Step D

**Files:** Modify `src/orchestra/sprint-controller.ts`, Modify `tests/orchestra/sprint-controller-nervous-wire.test.ts`

`runSprint()` başında `const nervous = createNervousSystemIfEnabled(...)`, finally `nervous?.dispose()`. Default-off respect.

**GO:** 3 test PASS (enabled=true → bootstrap call + enabled=false → no call + sprint complete → dispose call).
**NO_GO:** Wire missing veya dispose miss → memory leak.

### W3-2: Faz 1 smoke config

**Files:** Modify `.deckent/config.json` (this project + template), Create `tests/config/nervous-faz1-smoke.test.ts`

```json
"nervous_system": {
  "enabled": true,
  "mode": "strict",
  "detectors": {
    "stale_worker": { "enabled": true, "threshold_ms": 180000 },
    "dead_event_stream": { "enabled": true, "threshold_ms": 600000 },
    "directives_protection": { "enabled": true, "auto_restore": false }
  },
  "notifications": {
    "severity_min": "critical"
  }
}
```

**GO:** Config validation PASS + smoke detector list 3.
**NO_GO:** Config validation fail veya detector >3 enabled.

### W3-3: Integration runtime test

**Files:** Create `tests/nervous/integration-runtime.test.ts`

Gerçek `createNervousSystemIfEnabled()` + fake sprint state + en az 1 detector trigger (stale-worker fake heartbeat) + assert `.deckent/nervous-history.jsonl` boş değil + dispatcher file channel yazıyor.

**GO:** Integration test PASS (pipeline yaşıyor + 1 event emit).
**NO_GO:** Pipeline çağrılmıyor veya history yazılmıyor.

### W4-1: Worker .result coverage zorunluluk — Layer 1 Beta MUST

**Files:** Modify `src/agents/worker-verify.ts`, Modify `src/orchestra/quality-assessor.ts`, Create `tests/agents/worker-verify-coverage.test.ts`

vitest `--coverage --reporter=json-summary` → coverage-summary.json parse → `.result.coverage` = total.lines.pct (number). Null/0 → reject + retry. Quality Scorer Coverage=null (escape: doc, audit task) → "unmeasured" partial credit (overall 90 ceiling).

**GO:** 4 test PASS (vitest parse + null reject + escape hatch + Quality Scorer integration); Sprint 179 retro'daki 9 TECH_DEBT pattern reproduce edilmez.
**NO_GO:** Coverage parse fail veya escape hatch yanlış uygulanır (TECH_DEBT regress).

### W4-2: Panic guard onay UI — Layer 3 synergy

**Files:** Modify `src/cli/commands/nervous.ts`, Modify `src/mcp/tools/nervous.ts`, Create `tests/cli/nervous-accept-panic.test.ts`

Layer 2 W2-2 IPC queue altyapısını kullan. CLI: `deckent nervous accept-panic <task-id>` → IPC write. MCP: `deckent_nervous_subscribe` event akışında "PANIC_GUARD_KILL_PENDING" emit + `deckent_nervous_accept` ile onay. Sprint 179 dogfood'da 3 task'ta yaşandı, fix retry fallback'iyle çalıştı.

**GO:** 3 test PASS (CLI accept → IPC write + MCP subscribe → event emit + accept → resolveApproval).
**NO_GO:** Panic event emit edilmez veya accept path miss.

### W4-3: Vitest 1 failing test fix — Self-audit gate

**Files:** TBD — Sprint 179 self-audit gate output "vitest: 1 failing tests" detayı incele + ilgili test'i tamir et

**GO:** Self-audit gate exit 0 (vitest 0 failures); ilgili test yeşil.
**NO_GO:** Gate failure devam (Sprint 181'e debt).

### W5-1: npm publish v1.0.0-beta.1 readiness

**Files:** Modify `package.json` (version + scripts), Modify `scripts/validate-publish.mjs`, Create `tests/scripts/validate-publish-readiness.test.ts`

`npm run validate:publish` smoke pass: (1) `npm pack --dry-run` files ≤ 2MB, (2) engines.node >=24, (3) main/types entry points exist, (4) no internal state (e.g. `.deckent/` or `.brain/`), (5) ADR validation clean, (6) lint:link clean. Final smoke ama publish KOŞMAZ ([[feedback-build-requires-user-approval]]).

**GO:** validate:publish exit 0; 6 readiness gate PASS.
**NO_GO:** Tar smoke fail veya internal state leak.

### W5-2: OSS GA docs review

**Files:** Modify `README.md`, `docs/guide/installation.md`, `docs/guide/quickstart.md`, `docs/guide/getting-started.md`, run `npm run lint:link`

Sprint 178 doc updates üzerine hijyen: install matrix kontrol, landing-page-content tutarlılığı, Node 24/26 + better-sqlite3 12.10 referans tutarlılığı. lint:link exit 0.

**GO:** lint:link exit 0; manuel `Open in Browser` smoke (quickstart adımları diskten okunabilir).
**NO_GO:** Broken link veya stale node version reference.

### W5-3: auto_restore → true + nervous doc kısa giriş

**Files:** Modify `.deckent/config.json` (`nervous_system.directives_protection.auto_restore: true`), Modify `tests/nervous/directives-protection-auto-restore.test.ts`, Create `docs/guide/nervous-system.md` (kısa giriş, full Sprint 181)

Bug A landed (Sprint 179) + Sprint 177-005 baseline hook canlı → auto_restore=true güvenli. Sprint 149 doc borcu için kısa giriş: Nervous nedir, nasıl açılır (`enabled: true`), 3 Faz 1 detector ne yapar, authority mode'lar nasıl seçilir. Full user guide Sprint 181'de.

**GO:** Test PASS (auto_restore=true ile baseline DRIFT rollback yapmıyor — Sprint 177-005 hook canlı); doc en az 200 satır; lint:link clean.
**NO_GO:** Auto_restore rollback Sprint 176 dogfood pattern tetikler (regress).

---

## Wave Dispatch Order (Brain manual, ADR-047)

| Wave | Tasks | Intra-wave | Note |
|------|-------|------------|------|
| W0 | Config schema sync | 1 (single) | Foundation — other waves depend on schema |
| W1 | W1-1 (state tracker) + W1-2 (bootstrap) | 2 | Independent files; max_workers 2 OK |
| W2 | W2-1 (handlers) + W2-2 (IPC queue) | 2 | Independent files (nervous/action-handlers.ts vs nervous/ipc-queue.ts + mcp/tools/nervous.ts) |
| W3 | W3-1 (controller wire) + W3-2 (smoke config) + W3-3 (integration test) | 1 (sequential) | W3-1 sprint-controller self-modifying; W3-2 config edit; W3-3 depends on W3-1+W3-2 live |
| W4 | W4-1 (coverage) + W4-2 (panic UI) + W4-3 (gate fix) | 2 | Independent (worker-verify vs cli/mcp vs failing test) |
| W5 | W5-1 (npm publish) + W5-2 (docs) + W5-3 (auto_restore + nervous doc) | 2 | Independent (package.json vs docs/guide/ vs config + nervous doc) |

Self-modifying ZORUNLU sequential: `src/orchestra/`, `src/agents/`, `src/cli/`, `src/api/`, `src/nervous/`, `src/mcp/` hepsi self-modifying-detector tetikler → wave içinde max 1 worker olabilir (config max_workers=2 ama detector cap'liyor).

---

## Sprint 180 GO/NO_GO Matrix

| Verdict | Şart |
|---------|------|
| **GO** | 13/13 DONE — beta launch ready, nervous Faz 1 live, panic UI functional |
| **GO_WITH_TECH_DEBT** | 11-12/13 DONE + ≤2 GWT; **şart:** L2 nervous activation (W0+W1+W2+W3 hepsi) DONE + L1 beta MUST (W4-1 coverage + W5-1 npm publish) DONE. W5-2 docs veya W5-3 auto_restore GWT olabilir. |
| **NO_GO** | Nervous bootstrap fail veya integration test fail (rollback `enabled: false` ile config-driven, code rollback gerekmez) veya npm publish smoke fail |

**Rollback flow:**
- Layer 2 nervous regress → `.deckent/config.json` → `nervous_system.enabled: false`. Code intact, dormant'a geri döner. NERVOUS-TODO §11.6 risk analizi.
- Layer 1 coverage regress → worker-verify.ts revert (worker-rollback auto-revert canlı).
- Layer 3 panic UI regress → Layer 2 IPC queue altyapısı korunur, sadece CLI/MCP path geri stub.

---

## Testing Strategy

| Wave | Test surface | Target | Command |
|------|--------------|--------|---------|
| W0 | Unit + Zod schema | 6 detector default + dead_event_stream reserve clear | `npx vitest run tests/core/nervous-config-schema.test.ts` |
| W1 | Unit | Bootstrap fabrika + state snapshot | `npx vitest run tests/nervous/bootstrap.test.ts tests/orchestra/sprint-state-snapshot.test.ts` |
| W2 | Unit + integration | Action handlers + IPC queue race | `npx vitest run tests/nervous/action-handlers.test.ts tests/nervous/ipc-queue.test.ts` |
| W3 | Integration + smoke | Sprint-controller wire + Faz 1 smoke config + runtime pipeline | `npx vitest run tests/nervous/integration-runtime.test.ts tests/orchestra/sprint-controller-nervous-wire.test.ts` |
| W4 | Unit + Quality Scorer integration | Coverage parse + panic UI + gate fix | `npx vitest run tests/agents/worker-verify-coverage.test.ts tests/cli/nervous-accept-panic.test.ts` |
| W5 | Validate:publish smoke + lint:link + doc | npm pack tar audit + OSS docs hijyen + nervous doc | `npm run validate:publish && npm run lint:link` |

### Sprint sonu smoke E2E

`deckent serve` + `deckent start` dogfood:

1. **Nervous Faz 1 live:** `deckent_nervous_status` → 3 detector active + history not empty
2. **Coverage zorunluluk:** Bir test task spawn et + sahte coverage=0 → worker-verify reject + retry
3. **Panic guard UI:** Stuck worker scenario → kill blocked event → `deckent nervous accept-panic <id>` → kill complete
4. **directives_protection auto_restore:** Mid-sprint DIRECTIVES.md değişikliği → Sprint 177-005 baseline hook → no rollback
5. **npm pack audit:** `npm pack --dry-run` → 899 files target + 2MB ≤ tar + engines.node>=24

---

## Process Invariants (Sprint 180 specific)

- **Worker rollback canlı (Sprint 177)** — every NO_GO src/ reverts
- **TOPP B+C canlı (Sprint 178)** — wave-barrier-free fan-out
- **Bug A foundation canlı (Sprint 179)** — aggregate verdict downstream tracking
- **Worker coverage zorunluluk LAND ediyor (W4-1)** — Quality Scorer Coverage=0 fake DONE bertaraf
- **Nervous default-off respect** — `if (!enabled) return null` early gate, atıl davranış aynen
- **Brain mode `structured`** — AI planning disabled
- **Self-modifying sequential** — src/orchestra + src/nervous + src/api + src/agents + src/cli + src/mcp
- **`dependency_pipeline_enabled: false`** — Brain manuel wave gates (ADR-047)
- **Max workers 2** — sequential discipline
- **`.brain/memory.db` ASLA silinmez** — additive ALTER only ([[feedback-db-silmek-yasak]])
- **`.deckent/config.json` git'te tracked kalır** ([[feedback-config-json-git-rm-yasak]])
- **`deckent kill/cleanup` (canlı sprint) Alperen onayı** ([[feedback-sprint-kill-always-ask-user]])
- **Build/publish gates Alperen kararı** — `npm run validate:publish` smoke worker çalıştırır ama `npm publish` Alperen manuel ([[feedback-build-requires-user-approval]])

---

## Self-Review

- **Spec coverage:** L1 4 task + L2 8 task + L3 1 task hibrit = 13 task, 1:1 master spec §6 ile match. NERVOUS-TODO §11.2 6-step + §11.3 Faz 1 smoke 1:1 implement.
- **Placeholder scan:** W4-3 (vitest 1 failing test) TBD — Sprint 180 başlamadan önce Sprint 179 self-audit raporu okunup ilgili test pinpoint edilir.
- **Type consistency:** `SprintStateSnapshot` W1-1'de tanımlı, W1-2 bootstrap'ta ve W2-1 action-handlers'da kullanılır. `IPCMessage` W2-2'de tanımlı, W4-2 panic UI'da kullanılır.
- **No dangling references:** Tüm export'lar owning task'ta tanımlı; downstream task'lar tip import eder.
- **NERVOUS-TODO uyumu:** §11.10 4 kararsızlık noktası locked decisions olarak Crisis Stab §6a'da çözüldü (file-based IPC, beta öncesi smoke, integration test runtime, Task Mode post-beta).

---

## DIRECTIVES.md content for Sprint 180 launch

See `DIRECTIVES.md` at repo root — rewritten for Sprint 180 with wave-prefix titles (Sprint 179 drift-immune pattern korunur).
