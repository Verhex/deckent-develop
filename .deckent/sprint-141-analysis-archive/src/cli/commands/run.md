# Analysis: src/cli/commands/run.ts
**Task ID:** 141-003 | **LoC:** 333

## 1. Amacı
Sprint olmadan tek task çalıştırma komutunu uygular. `deckent run <description>` — one-shot worker spawn.

## 2. Public API (export listesi)
- `registerRun(program: Command): void`
- `createRunTaskId(): string`
- `buildRunTask(taskId, description, model, scopeDir): object`
- `cleanupRunTask(projectRoot, taskId): void`
- `readHeartbeat(projectRoot, taskId): { sequence, status, timestamp } | null`
- `waitForRunResult(projectRoot, taskId, timeoutMs): Promise<TaskResult | null>`
- `streamWorkerLog(projectRoot, taskId, timeoutMs): Promise<void>`
- `RunCommandOpts` interface
- `SingleTaskResult` interface

## 3. İç + Dış Bağımlılıklar
- `../../orchestra/brain.js` (buildWorkerPrompt)
- `../../orchestra/sprint-controller.js` (resolveAgentPrompt, resolveSkillPrompts)
- `../../core/utils.js` (readJsonSafe)
- `../commands/spawn.js` (spawnWorkerMultiProvider)

## 4. Complexity
Cyclomatic: ~8 (fs.watch/fallback, heartbeat stale check, verbose log streaming)

## 5. Type Safety
`RunCommandOpts` interface ✅
`readJsonSafe<TaskResult>` — generic ✅
`createReadStream` + offset tracking — doğru pattern

## 6. ADR Compliance
✅ ADR-001: ESM import
`autoApprove: true` hardcoded — satır 242 "Deckent standard" yorumu ✅

## 7. Test Coverage
Test: `tests/cli/run.test.ts`

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`_runTaskCounter` — module-level counter, thread-safe değil ama single-process ortamda OK

## 10. Security Findings
`streamWorkerLog` — readFileSync ile offset tracking, kullanıcı input değil ✅

## 11. Memory V2 Uyumu
N/A.

## 12. Öneriler
fs.watch + fallback setInterval dual-track ✅
Heartbeat stale detection (STALE_THRESHOLD=3) — iyi pattern

## 13. Verdict: ANALYZED
