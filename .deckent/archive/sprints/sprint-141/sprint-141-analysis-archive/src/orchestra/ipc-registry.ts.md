# Analysis: src/orchestra/ipc-registry.ts
**Task ID:** 141-002 | **LoC:** 271

## 1. Amaci (1-2 cumle)
Merkezi IPC kanal kayit sistemi: subprocess worker'lar icin WorkerChannel registry ve tmux/docker worker'lar icin dosya bazli soru/cevap IPC mekanizmasi saglar. Sprint 135 T-004 ile worker-ipc.ts'den cekilen ve genisleten modul.

## 2. Public API (export listesi)
- `getChannelRegistry(): ChannelRegistry`
- `registerWorkerChannel(taskId, channel): void`
- `unregisterWorkerChannel(taskId): void`
- `getQuestionPath(projectRoot, taskId): string`
- `getAnswerPath(projectRoot, taskId): string`
- `writeQuestionFile(projectRoot, question): void`
- `readQuestionFile(projectRoot, taskId): WorkerQuestion | undefined`
- `writeAnswerFile(projectRoot, answer): void`
- `readAnswerFile(projectRoot, taskId): BrainAnswer | undefined`
- `cleanupQuestionFiles(projectRoot, taskId): void`
- `askBrain(projectRoot, taskId, workerId, question, options?): Promise<BrainAnswer>`
- `handleWorkerQuestion(projectRoot, taskId): BrainAnswer | undefined`
- `checkWorkerQuestions(projectRoot, taskIds, collectedIds): string[]`

## 3. Ic + Dis Bagimliliklar
- **Icsel:** `node:fs`, `node:path`
- **Dissal:**
  - `../agents/worker-ipc.js` (ChannelRegistry, WorkerChannel, WorkerSideChannel)
  - `../core/constants.js` (TASKS_DIR)
  - `../core/task-types.js` (WorkerQuestion, BrainAnswer, QuestionAction)
  - `../core/utils.js` (debugLog)

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 12 export edilen fonksiyon
- `askBrain()`: async polling loop + IPC channel dual-mode — yuksek complexity
- Toplam cyclomatic rough: ~18

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `JSON.parse(raw) as WorkerQuestion/BrainAnswer` — tip assertion, guvenli
- `any` kullanimi: yok
- Non-null assertion: yok

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- ADR-008: `../agents/worker-ipc.js` import — agents/ import edilmis, ADR-008 kontrol edilmeli
- ADR-008 aciklamasi: "Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker" — orchestra/ipc-registry'nin agents/'i import etmesi potansiyel ihlal
- Dosya bazli fallback: tmux/docker backend'ler icin polling (60s timeout)
- ADR-010: runtime dep yok — compliant

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/orchestra/ipc-registry.test.ts` beklenir

## 8. TODO/FIXME/HACK inventory
- `handleWorkerQuestion()`: "Future: integrate with Human Checkpoint for interactive approval" — belgelenmis TODO

## 9. Dead Code Candidates
- `cleanupQuestionFiles()` — sadece `askBrain()` tarafindan cagrilir

## 10. Security Findings
- `.question` ve `.answer` dosyalarini okur/yazar — sadece ic task dosyalari
- JSON parse ile dogrulama yok — malformed JSON gracefully null donduruyor

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile iliskisi yok — task IPC dosyalari
- Tamamen uyumlu

## 12. Oneriler (Sprint 142+ input)
- ADR-008 uyumu: `../agents/worker-ipc.js` importunu review edin
- `askBrain()` pollIntervalMs parametresi daha yuksek (2-3s) olabilir — 1s cok agresif

## 13. Verdict: ANALYZED
