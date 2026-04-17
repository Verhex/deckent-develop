# Analysis: src/cli/commands/watch.ts
**Task ID:** 141-003 | **LoC:** 178

## 1. Amacı
Tmux split-view watch mode. --follow ile worker pane attach. Subprocess log tail desteği.

## 2. Public API
- `registerWatch(program)`, `cleanupWatchWindow()`, `getTaskProvider(root, taskId)`, `watchSubprocessLog(root, taskId)`

## 3. İç + Dış Bağımlılıklar
- `../../orchestra/tmux.js` (isSessionActive, createWatchLayout, attachToWorkerPane, TmuxError)

## 4. Complexity
Cyclomatic: ~5. Provider routing, sprint stale detection, tmux/subprocess branch.

## 5. Type Safety ✅ Acceptable.

## 6. ADR Compliance
✅ DECKENT_WATCH_SPLIT env var via process.env — düzenli ama geçici; better: parameter.

## 7-13.
`computeSplitRatio()`: terminal width aware — UX iyileştirme ✅.
Security: `spawn('tail', ['-f', logPath])` — logPath user input değil ✅.
Verdict: ANALYZED
