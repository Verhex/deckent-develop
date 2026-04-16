# Analysis: src/mcp/tools/run.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 114 | **Effort:** max

## 1. Amacı
Tek bir one-off task çalıştıran MCP tool. `deckent_run` olarak kayıtlı. Sprint lifecycle'ı olmadan (PLAN/EVALUATE/RETRO yok) direkt bir worker spawn eder. Quick fix, tek test dosyası, doc güncelleme gibi izole işler için. Task JSON oluşturur, worker prompt'u build eder, SpawnBackendFactory ile worker spawn eder.

## 2. Public API
- `registerRunTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → TASKS_DIR
- `../../core/types.js` → ALL_MODELS, ModelType, Task (type-only kısmen)
- `./job-runner.js` → writeJobState
- `../helpers/enrich.js` → enrichResponse()
- `../../core/config.js` → loadConfig()
- `../../orchestra/spawn-backend.js` → SpawnBackendFactory
- `../../orchestra/brain.js` → buildWorkerPrompt()
- `../../orchestra/sprint-controller.js` → resolveAgentPrompt(), resolveSkillPrompts()
- Döngüsel bağımlılık riski: **DÜŞÜK** — orchestra/ tek yönlü import

## 4. Dış Bağımlılıklar
- `node:fs` (mkdirSync, writeFileSync), `node:path` (join) — Node built-in
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 2 (generateJobId, registerRunTool)
- Max cyclomatic: ~5
- Basit ve okunabilir

## 6. Type Safety
- `ALL_MODELS as unknown as readonly [string, ...string[]]` satır 28: ⚠️ Zod enum tip uyumsuzluğu — ALL_MODELS string[] ama z.enum() tuple istiyor. Workaround olarak çift cast kullanılmış.
- `task as Task` satır 69, 70, 71: ⚠️ Task interface'inin tüm zorunlu alanlarını karşılayıp karşılamadığı belirsiz. Oluşturulan obje (satır 43-64) Task arayüzüne tam uyumlu mu? `createdAt`, `sprintId: 'one-off'`, eksik alanlar olabilir.
- `model as ModelType` satır 81: ✅ Zod enum ile validate edilmiş
- `any`: 0
- `@ts-ignore`: 0

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A — SpawnBackendFactory.spawn() async
- **ADR-008 brain import**: brain.js ve sprint-controller.js import — kabul edilebilir (worker prompt build)
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent run` ile paralel
- **ADR-033**: ✅
- **ADR-037 RBAC**: Worker scope directories ile kısıtlanmış ✅

## 8. Test Coverage
- tests/mcp/tools/ altında run.test.ts: **MEVCUT DEĞİL** ❌
- **P1 GAP**: Dedicated test yazılmalı — spawn mock, task JSON generation, error paths

## 9. TODO/FIXME/HACK Inventory
- **YOK**

## 10. Dead Code
- `autoApprove` parametresi: Schema'da tanımlı, handler'da destructured, backend.spawn'a geçiriliyor ✅ — kullanılıyor

## 11. Security
- **Task dosya yazma**: writeFileSync ile task JSON yazılıyor — dosya yolu TASKS_DIR ile sınırlı ✅
- **Worker spawn**: SpawnBackendFactory üzerinden — backend güvenlik delegasyonu ✅
- **Scope**: Kullanıcı tanımlı scope directories — worker bu sınırlar içinde çalışır
- **autoApprove=true**: Worker `--dangerously-skip-permissions` ile çalışır — tasarımsal karar

## 12. Memory V2 Uyumu
- ✅ buildWorkerPrompt() DB'den ADR inject eder — doğru
- resolveAgentPrompt/resolveSkillPrompts DB-first — doğru

## 13. i18n
- Hardcoded İngilizce: "One-off task via MCP deckent_run", "Task completed successfully" — kabul edilebilir

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı
- annotations: readOnlyHint=false, destructiveHint=false, idempotentHint=false — ✅ DOĞRU

## 15. Performance
- Sync I/O: mkdirSync (1), writeFileSync (1) — minimal ✅
- ✅ Fire-and-forget pattern — performans sorunu yok

## 16. Öneriler
- **P1**: Dedicated test dosyası yazılmalı (tests/mcp/tools/run.test.ts)
- **P2**: `task as Task` cast güvenli mi doğrulanmalı — Task interface'inin tüm zorunlu alanları karşılanmalı. Partial<Task> kullanılarak compile-time kontrol sağlanabilir.
- **P2**: `ALL_MODELS as unknown as readonly [string, ...string[]]` workaround — ALL_MODELS'ın tipi tuple olarak tanımlanmalı (`as const`)
- **P3**: assignedAgent her zaman 'generic' — routing engine kullanılabilir

## Verdict: ANALYZED
