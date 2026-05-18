# Analysis: src/cli/entry.ts
**Task ID:** 141-003 | **LoC:** 41

## 1. Amacı
CLI entry point. Node version guard, unhandledRejection handler, SIGINT/SIGTERM graceful shutdown.

## 2. Public API
Yok (executable entry).

## 3. İç + Dış Bağımlılıklar
- `./index.js` (buildProgram)
- `./helpers/process.js` (handleCliError)
- `../../orchestra/sprint-controller.js` (interruptActiveSprint)
- `../../orchestra/tmux.js` (killAllSessions)

## 4. ADR Compliance
✅ ADR-025: Graceful Shutdown — SIGINT → interruptActiveSprint + killAllSessions ✅
Node version guard: major < 18 → process.exit(1) ✅

## 5. Security Findings
`process.on('unhandledRejection', ...)` — error log + exit code set ✅

## 13. Verdict: ANALYZED
