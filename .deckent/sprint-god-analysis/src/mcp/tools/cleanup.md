# Analysis: src/mcp/tools/cleanup.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 139 | **Effort:** max

## 1. Amacı
Sprint artifactlarını temizleyen MCP tool. `deckent_cleanup` olarak kayıtlı. .tasks/ ve .locks/ dizinlerindeki dosyaları siler. Opsiyonel olarak memory decay çalıştırır (.brain/ dosyalarını budget dahilinde tutar). dryRun modu ile silme önizlemesi sunar. Sprint tamamlandıktan sonra veya kill sonrası çağrılır.

## 2. Public API
- `registerCleanupTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → TASKS_DIR, LOCKS_DIR, BRAIN_DIR, MEMORY_DB_FILE, PROJECT_CONFIG_PATH
- `../../core/utils.js` → getNextSprintId()
- `../../core/memory-store.js` → MemoryStore class
- `../../orchestra/brain.js` → runDecay()
- `../helpers/enrich.js` → enrichResponse()
- Döngüsel bağımlılık riski: **DÜŞÜK**

## 4. Dış Bağımlılıklar
- `node:fs` (existsSync, readFileSync, readdirSync, unlinkSync), `node:path` (join) — Node built-in
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 5 (getMemoryEntryCount, listCleanableFiles, cleanLocks, cleanTasks, registerCleanupTool)
- Max cyclomatic: ~8 (dryRun/decay branches + error handling)
- Basit ve okunabilir

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `as unknown`: 0
- Non-null `!`: 0
- `as { memory_budget?: number; decay_after_sprints?: number }` satır 75: ✅ güvenli — JSON parse sonucu
- **TEMİZ**

## 7. ADR Compliance
- **ADR-008 brain import**: `../../orchestra/brain.js` import (runDecay) — kabul edilebilir
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent cleanup` ile paralel
- **ADR-033**: ✅
- **Memory V2 DB-first**: ✅ getMemoryEntryCount() MemoryStore.totalCount() kullanır — DB-first

## 8. Test Coverage
- tests/mcp/tools/ altında cleanup.test.ts: **MEVCUT DEĞİL** ❌
- **P1 GAP**: Dedicated test yazılmalı — özellikle dryRun, decay, cleanTasks edge case'leri

## 9. TODO/FIXME/HACK Inventory
- **YOK**

## 10. Dead Code
- listCleanableFiles: Sadece dryRun'da kullanılıyor, cleanTasks aynı filtreyi duplicate ediyor. **P3** — tek fonksiyon haline getirilebilir.

## 11. Security
- **unlinkSync**: Task dosyaları ve lock dosyaları siliniyor. Dosya yolları TASKS_DIR ve LOCKS_DIR ile sınırlı — path traversal riski yok ✅
- **Race condition**: İki MCP istemci aynı anda cleanup çağırırsa? unlinkSync ENOENT fırlatır ama try-catch ile yakalanıyor ✅
- **Decay**: runDecay brain memory üzerinde çalışır — güvenli

## 12. Memory V2 Uyumu
- ✅ **TAM UYUMLU**:
  - getMemoryEntryCount(): MemoryStore + totalCount() — DB-first ✅
  - Eski countBrainLines() YOK ✅
  - runDecay(): brain.js üzerinden — DB-first decay ✅

## 13. i18n
- Hardcoded İngilizce: hata mesajları — kabul edilebilir

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı
- annotations: readOnlyHint=false, destructiveHint=true, idempotentHint=false — ✅ DOĞRU (silme işlemi)
- DECKENT.md MCP tablosunda destructive=Evet — ✅ Tutarlı

## 15. Performance
- Sync I/O: readdirSync, unlinkSync (çok sayıda), readFileSync, existsSync
- **14 sync I/O çağrısı** — cleanup bağlamında kabul edilebilir

## 16. Öneriler
- **P1**: Dedicated test dosyası yazılmalı (tests/mcp/tools/cleanup.test.ts)
- **P2**: Sprint ID hesaplama (satır 111-112) kırılgan — `sprint-001` → `sprint-000` (0 → -1). `Math.max(1, num - 1)` var ama edge case: `sprint-NaN` durumunda parseInt NaN döner.
- **P3**: listCleanableFiles ve cleanTasks duplicate filtre — tek fonksiyon + dryRun flag

## Verdict: ANALYZED
