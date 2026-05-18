# Analysis: src/cli/commands/kill.ts
**Task ID:** 141-003 | **LoC:** 224

## 1. Amacı
Çalışan worker'ları durdurur. Tek task veya --all seçeneği. Tmux ve subprocess backend desteği.

## 2. Public API (export listesi)
- `registerKill(program: Command): void`

## 3. İç + Dış Bağımlılıklar
- `../../orchestra/tmux.js` (killWorker, TmuxError)
- `../../orchestra/spawn-backend.js` (SpawnBackendFactory)
- `../../core/task-types.js` (getProviderForModel)

## 4. Complexity
Cyclomatic: ~8 (provider detection, tmux/subprocess fallback, all/single)

## 5. Type Safety
`ModelType` casting — acceptable

## 6. ADR Compliance
✅ ADR-006: spawnSync pattern (tmux kill via orchestra/tmux.js)
✅ Multi-provider: claude vs non-claude provider routing ✅

## 7. Test Coverage
Test: `tests/cli/kill.test.ts`

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
Yok.

## 10. Security Findings
`killWorker(id)` — tmux session adı task ID'den türetiliyor, array args ✅

## 11. Memory V2 Uyumu
N/A.

## 12. Öneriler
--all modunda `killWorker` başarısız olunca `PAUSED` status güncelleniyor ✅

## 13. Verdict: ANALYZED
