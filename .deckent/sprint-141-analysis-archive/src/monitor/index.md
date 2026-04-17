# Analysis: src/monitor/index.ts
**Task ID:** 141-005-fix | **LoC:** 12

## 1. Amacı
`src/monitor/auditor.ts`'den seçili export'ları yeniden ihraç eden barrel file.

## 2. Public API
- createAlert, scanHeartbeats, checkBoundaryViolations, checkStaleLocks, detectDeadlocks, updateDashboard, detectPatterns, buildWorkerScopeMap, runScanCycle, startScanLoop

## 3. Dikkat
- Barrel'da `writeScanToDashboard`, `deduplicateAlerts` yok — external tüketici var mı kontrol edilmeli.

## 4. Verdict: ANALYZED
