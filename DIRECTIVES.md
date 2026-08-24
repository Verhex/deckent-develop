# APPROVAL-INGRESS-UNKNOWN-ID-001 — multi-wave fail-closed acceptance

## Goal

Canonical autonomous approval queue'da hiç var olmamış forged/stale request ID'lerinin API ve
MCP mutation ingress'lerinde aynı typed `APR_UNKNOWN_REQUEST` sonucu ile fail-closed
reddedildiğini; hiçbir decision yazılmadığını, durable refusal auditinin üretildiğini ve gerçek
runtime park producer'ı ile shared pending read consumer'ının tek canonical path kullandığını
normal dogfood lifecycle ile kabul et.

## Execution contract

- `DOGFOOD_MODE=ON`; run/sprint ID yalnız canonical allocator'dan gelir.
- Task 1 ve Task 2 bağımsız ilk wave'dir. Task 3 her ikisine bağlı ikinci wave'dir.
- Bütün tasklar read-only acceptance işidir; yalnız worker lifecycle `.hb`/`.result` yazıları
  yapılabilir. Project source/test/docs değişikliği NO-GO'dur.
- Her task yalnız declared exact targeted test commandını çalıştırır. Aktif run sırasında build,
  full suite, auth/config/bot mutation ve manual source edit yoktur.
- Worker `.result` ingress claim'dir; host disk state, exact test exit ve producer→consumer wiring
  zincirini bağımsız yeniden türetir.
- Yeni project dokümanı/evidence dosyası yazılmaz.

## Task 1: Core gate and API ingress acceptance
- Reads: src/orchestra/autonomous/approval-adapter.ts, src/api/autonomous-endpoint.ts, src/api/server.ts, src/core/constants.ts, tests/orchestra/autonomous-approval-adapter.test.ts, tests/api/autonomous-endpoint.test.ts
- Scope: src/orchestra/autonomous/, src/api/, src/core/, tests/orchestra/, tests/api/
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/autonomous-approval-adapter.test.ts tests/api/autonomous-endpoint.test.ts
### Description
Read-only acceptance yap. Core gate'in absent ID için typed `APR_UNKNOWN_REQUEST` fırlattığını,
decision üretmediğini ve durable `approval.unknown_request_rejected` auditini yazdığını; API
approve/reject route'larının aynı gate'i production server entrypoint'inden tüketip typed 403
döndürdüğünü exact test setiyle doğrula. Source/test/docs değiştirme.
### goNogo
- goCriteria: Exact two-file targeted test set exits zero; absent approve and reject both return APR_UNKNOWN_REQUEST; no decision is persisted; refusal audit is durable; API routes are composed in the production server; project file change yok
- nogo: Unknown ID produces success or a decision; API loses the typed code; core and API use divergent decision authority; exact targeted test kırmızı; herhangi bir project file değişiyor

## Task 2: MCP ingress and registry acceptance
- Reads: src/mcp/tools/autonomous-approval.ts, src/mcp/tools/index.ts, src/mcp/server.ts, src/orchestra/autonomous/approval-adapter.ts, src/core/constants.ts, tests/mcp/autonomous-approval.test.ts, tests/mcp/tools/index.test.ts
- Scope: src/mcp/, src/orchestra/autonomous/, src/core/, tests/mcp/
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/mcp/autonomous-approval.test.ts tests/mcp/tools/index.test.ts
### Description
Read-only acceptance yap. `deckent_autonomous_approve` ve `deckent_autonomous_reject` araçlarının
canonical pending resolver ve shared core gate'i tükettiğini, absent ID'yi typed MCP tool error
olarak döndürdüğünü, decisions dosyası üretmediğini ve iki tool'un production catalog/server
registration zincirinde bulunduğunu exact test setiyle doğrula. Source/test/docs değiştirme.
### goNogo
- goCriteria: Exact two-file targeted test set exits zero; both MCP mutation tools return APR_UNKNOWN_REQUEST for absent IDs; no decision is persisted; catalog and production registration contain both tools exactly once; project file change yok
- nogo: MCP manufactures a decision for an absent ID; typed code is lost; tool is test-only or absent from production registration; exact targeted test kırmızı; herhangi bir project file değişiyor

## Task 3: Canonical pending producer-to-consumer fan-in acceptance
- Reads: src/orchestra/autonomous/runtime-loop.ts, src/orchestra/autonomous/approval-adapter.ts, src/core/constants.ts, src/core/pending-approvals.ts, tests/orchestra/autonomous/approval-redrive.test.ts, tests/orchestra/autonomous-approval-adapter.test.ts, tests/api/autonomous-endpoint.test.ts, tests/mcp/autonomous-approval.test.ts
- Scope: src/orchestra/autonomous/, src/core/, tests/orchestra/, tests/api/, tests/mcp/
- Dependencies: Task 1, Task 2
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/autonomous/approval-redrive.test.ts tests/orchestra/autonomous-approval-adapter.test.ts tests/api/autonomous-endpoint.test.ts tests/mcp/autonomous-approval.test.ts
### Description
Wave-1 sonuçları dependency-satisfying ise read-only fan-in acceptance yap. Production autonomous
runtime'ın approval gate producer'ının `autonomousPendingPath` konumuna park ettiğini; shared
`readPendingApprovals` consumer'ının aynı resolver'dan okuduğunu ve gerçek parked ID'nin API/MCP
fail-closed guard tarafından yanlışlıkla reddedilmediğini exact test setiyle doğrula. Source/test/docs
değiştirme.
### goNogo
- goCriteria: Both dependencies terminal satisfying; exact four-file targeted test set exits zero; runtime producer and shared read consumer use one canonical pending path; real parked cross-process request remains actionable; forged request remains refused; project file change yok
- nogo: Dependency settlement bypass; producer and consumer path drift; real parked ID is refused or forged ID accepted; exact targeted test kırmızı; herhangi bir project file değişiyor

## Root acceptance after terminal finalization

Codex canlı PID/log/heartbeat ve task/result settlementını izler. Terminalden sonra compiled API
server'a forged approve/reject POST smoke ve compiled MCP stdio server'a iki gerçek tool call yapılır;
ikisinde typed `APR_UNKNOWN_REQUEST`, no-decision ve durable refusal audit diskten doğrulanır.
Canonical archive manifest/integrity ve legacy raw-write absence ayrıca ölçülür. Root scoped tests,
lint/typecheck ve build yalnız terminalden sonra yürütülür.
