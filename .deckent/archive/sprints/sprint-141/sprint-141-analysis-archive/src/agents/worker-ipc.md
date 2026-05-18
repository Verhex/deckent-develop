# Analysis: src/agents/worker-ipc.ts
**Task ID:** 141-005-fix | **LoC:** 369

## 1. Amacı
Process-tabanlı IPC (İşlemler Arası İletişim). Brain-Worker arası mesaj kanalını yönetir. `child_process.fork()` IPC üzerine kurulu. tmux tabanlı worker'lar için fallback: file-based heartbeat. `ChannelRegistry` ile çok worker yönetimi.

## 2. Public API (export listesi)
- Types: `IPCMessageType`, `IPCMessage`, `HeartbeatPayload`, `StatusResponsePayload`, `IPCMessageHandler`
- Classes: `WorkerChannel`, `WorkerSideChannel`, `ChannelRegistry`
- Guard: `isIPCMessage`
- Re-exports from `orchestra/ipc-registry.js`: `getQuestionPath`, `getAnswerPath`, `writeQuestionFile`, `readQuestionFile`, `writeAnswerFile`, `readAnswerFile`, `cleanupQuestionFiles`, `askBrain`

## 3. İç + Dış Bağımlılıklar
- `node:child_process` — ChildProcess type only
- `orchestra/ipc-registry.js` — re-export (Sprint 135 T-004 migration)

## 4. Complexity
- Orta — event emitter wrapper, handler registry, re-exports

## 5. Type Safety
- `process as unknown as NodeJS.EventEmitter` — unsafe cast, ancak gerekli (Node.js type system limitation)
- `any` yok
- `isIPCMessage` type guard — iyi pattern

## 6. ADR Compliance
- ADR-008: IPC kanalı brain → worker arası; worker brain'e doğrudan import yapmıyor. UYUMLU.
- Re-export shim (Sprint 135 T-004) — backward compat için geçerli.

## 7. Test Coverage
- `tests/agents/worker-ipc.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- "Sprint 135 T-004: File-based IPC functions moved to orchestra/ipc-registry.ts" — re-export shim ne zaman silinecek?

## 9. Dead Code Candidates
- `WorkerSideChannel` — fork tabanlı spawn kullanılıyor mu gerçek sprint'lerde? tmux backend'de gereksiz.

## 10. Security Findings
- IPC mesaj validation: `isIPCMessage` type guard ✓
- `taskId` matching: sadece ilgili task mesajları handle eder ✓

## 11. Memory V2 Uyumu - İlgisiz.

## 12. Öneriler
- Re-export shim'i bir sonraki sprint'te temizle: doğrudan `orchestra/ipc-registry.js` import et.

## 13. Verdict: ANALYZED
