# core#23 — validators / work-model / worker-image-check

Cluster audit covering:
- `src/core/validators.ts` (123 lines)
- `src/core/work-model.ts` (473 lines)
- `src/core/worker-image-check.ts` (203 lines)

Grep scope: `src/**/*.ts` (excluding the definition file itself). Tests verified separately.

---

## Findings

### validators.ts

- [root-cause|low] **validatePath silently passes null bytes** — `src/core/validators.ts:31-45` — `resolve + normalize` pipeline does not detect `\0`; contrast with `validateTaskId:112-114` which explicitly `throw`s on `taskId.includes('\0')`. The gap is documented in `tests/core/validators.test.ts:33-38` via comment: *"taskId validator catches this"* — an unenforced call-site ordering dependency. If `validatePath` is called on user input that bypassed `validateTaskId`, null bytes reach the OS (Linux `open(2)` truncates at `\0`, silently opening a different file). Snippet: `const resolvedUser = resolve(resolvedBase, userPath); // no \0 check`

- [dead-test|low] **Misleading test name "rejects null byte injection attempt"** — `tests/core/validators.test.ts:33` — the test asserts `expect(result).toContain('/project/')` (no throw), but the name implies the function rejects. A reader expecting rejection-behavior from the test title would draw wrong security conclusions.

### work-model.ts

- [unwired|high] **`decisionTypeToKind` — zero production callers** — `src/core/work-model.ts:287` — `export function decisionTypeToKind(value: DecisionTaskType | string): TaskKind { switch (value) { case 'code': return 'code-development'; ... } }`. Grep `src/**/*.ts` for `decisionTypeToKind(` returns **zero** hits outside the file and tests. `src/core/decision-types.ts:21` mentions the function name in a JSDoc comment as a "canonical-import anchor" but does not call it. Test callers: `tests/core/work-model.test.ts:3` and `tests/core/wm2-canonical.test.ts:14`. File header (line 4): *"dead until a consumer migrates"*.

- [unwired|high] **`intentToKind` — zero production callers** — `src/core/work-model.ts:369` — `export function intentToKind(value: IntentType | string): TaskKind`. Grep for `intentToKind(` in `src/**/*.ts` returns zero production hits. `src/core/routing-types.ts:26` mentions name in a JSDoc anchor, no call. Test callers: `tests/core/work-model.test.ts:7` and `tests/core/wm2-canonical.test.ts:15`. The inverse adapter `taskKindToIntent` IS wired (`src/core/routing-engine.ts:315`, `src/orchestra/task-router.ts:290`) but the forward direction remains dead.

- [unwired|high] **`routerTypeToKind` — zero production callers** — `src/core/work-model.ts:323` — `export function routerTypeToKind(value: RouterTaskType | string): TaskKind`. Grep `src/**/*.ts` for `routerTypeToKind` returns zero hits outside the file and tests. Test caller: `tests/core/work-model.test.ts:5`.

- [unwired|high] **`adrSelectorToKind` — zero production callers** — `src/core/work-model.ts:341` — `export function adrSelectorToKind(value: AdrTaskType | string): TaskKind`. Grep for `adrSelectorToKind` in `src/**/*.ts` returns zero production hits. The inverse `taskKindToAdrDomain` IS wired (`src/orchestra/adr-selector.ts:320`). Test caller: `tests/core/work-model.test.ts:6`.

- [inconsistent|medium] **`taskKindToIntent` collapses `'test'` and `'code-development'` to `'implementation'`** — `src/core/work-model.ts:447-450` — both cases return `'implementation'`: `case 'code-development': return 'implementation'; case 'test': return 'implementation';`. The round-trip `'test' → taskKindToIntent → intentToKind → 'code-development'` (line 371: `case 'implementation': return 'code-development'`) loses test-task identity. `data` also collapses to `'implementation'` (line 466), giving three distinct task kinds an indistinguishable intent representation used in routing (`src/core/routing-engine.ts:315`).

- [inconsistent|medium] **`taskKindToAdrDomain` and `taskKindToIntent` both demote `'audit'` into the documentation bucket** — `src/core/work-model.ts:423` (`case 'audit': return 'docs'`) and `src/core/work-model.ts:453` (`case 'audit': return 'documentation'`). `'audit'` is a first-class `TaskKind` variant (line 34) and has its own `RubricTaskType` ('audit', line 210), yet it round-trips to `'documentation'` via both `adrDomain` and `intent` subsystems. The test at `work-model.test.ts:117-121` validates this collapsed round-trip rather than flagging the identity loss.

- [root-cause|medium] **4 "dead-until-migrate" forward adapters have no migration enforcement** — `src/core/work-model.ts:2-5` (header): *"This step is intentionally additive and 'dead until a consumer migrates'"*. The four unwired forward adapters (`decisionTypeToKind`, `intentToKind`, `routerTypeToKind`, `adrSelectorToKind`) all return `'generic'` for any unrecognized input (e.g. `default: return 'generic'` at lines 305, 318, 336, 364) — meaning a subtly wrong migration call-site would silently return `'generic'` with no error or warning. No runtime enforcement, no type narrowing that would catch wrong usage.

### worker-image-check.ts

- [root-cause|low] **`runDocker` error path leaves `collectStream` promises floating** — `src/core/worker-image-check.ts:92-99` — On `child.on('error', ...)` (line 95), the outer promise resolves immediately with a hardcoded result: `resolve({ code: -1, stdout: '', stderr: 'docker spawn failed' })`. However, `stdoutP = collectStream(child.stdout)` (line 92) and `stderrP = collectStream(child.stderr)` (line 93) are Promise objects created before the error fires; they are never awaited on this code path (the `void Promise.all([stdoutP, stderrP])` at line 103 is inside the `'close'` handler which does not fire after `'error'`). The streams self-close when Node.js GC collects the dead process, but the floating promises add GC pressure and are invisible to callers. Hermetic tests avoid this because `makeDockerSpawn` emits from `Readable.from([...])` which auto-ends.

- [inconsistent|low] **`DEFAULT_WORKER_IMAGE` literal duplicated in `spawn-backend-docker.ts:30`** — `src/core/worker-image-check.ts:25` — `export const DEFAULT_WORKER_IMAGE = 'deckent-worker:latest'`. `src/orchestra/spawn-backend-docker.ts:30`: `const DEFAULT_IMAGE = 'deckent-worker:latest'`. Comments (lines 16-18) acknowledge this is intentional (ADR-008 forbids `core/ → orchestra/` import), but the two literals can drift independently. The exported `DEFAULT_WORKER_IMAGE` is consumed correctly by test and CLI callers; the private `DEFAULT_IMAGE` in orchestra is the runtime source.

---

## Summary

**validators.ts** — Well-wired (all 5 exports have production callers; tests are comprehensive). Two low-severity issues: `validatePath` does not reject null bytes (unlike `validateTaskId`), creating an unenforced call-ordering security dependency; test name at line 33 misrepresents the behavior.

**work-model.ts** — 4 high-severity unwired exports (`decisionTypeToKind`, `intentToKind`, `routerTypeToKind`, `adrSelectorToKind`) — explicitly "dead until consumer migrates" per the file header, but test-covered to document their contracts. Two medium-severity inconsistencies: `taskKindToIntent` collapses `'test'`/`'code-development'`/`'data'` into indistinguishable `'implementation'` (used live in routing-engine), and `'audit'` kind is demoted to the `'documentation'` bucket in both ADR-domain and intent subsystems. Inverse/reverse adapters (`taskKindToRubric`, `taskKindToAdrDomain`, `taskKindToIntent`, `normalizeTechStack`, `resolveRiskClass`) are all wired.

**worker-image-check.ts** — Cleanly structured detection module. One low-severity root-cause: error path leaves two `collectStream` promises floating (safe in practice but unclean). One low-severity inconsistency: intentionally duplicated `DEFAULT_WORKER_IMAGE` literal with documented drift risk (ADR-008 boundary).
