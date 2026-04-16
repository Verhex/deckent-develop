# Analysis: src/mcp/tools/status.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 464 | **Effort:** max

## 1. Amacı
Sprint durumunu raporlayan MCP tool. `deckent_status` olarak kayıtlı. Dashboard dosyasını okur, job state'i kontrol eder, event stream tail, worker output'ları, metric snapshot, phase countdown, backend breakdown, dependency graph gibi zengin veri setini döndürür. Batch'teki en büyük ve en karmaşık dosya. Sprint izleme için birincil araç.

## 2. Public API
- `registerStatusTool(server: McpServer): void` — tek export
- JSDoc: ✅ Internal helper fonksiyonları için JSDoc mevcut (readEventStreamTail, readLastOutputs, readMetricSnapshot, computePhaseCountdown, buildBackendBreakdown, loadDepGraphFiles)

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DASHBOARD_FILE, TASKS_DIR, DECKENT_DIR
- `./job-runner.js` → readLatestJobState
- `../helpers/enrich.js` → enrichResponse()
- `../helpers/format.js` → formatStatusResponse, wrapResponse, StatusData type
- `../../monitor/sprint-state.js` → getCurrentSprintId()
- `../../monitor/dashboard-manager.js` → readDashboardSafe()
- `../../core/utils.js` → debugLog()
- `../../core/output-formatter.js` → formatStatus, resolveOutputMode, OutputMode type
- Döngüsel bağımlılık riski: **DÜŞÜK** — tek yönlü, monitor/ sadece core/ kullanır

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, existsSync, readdirSync), `node:path` (join) — Node built-in
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 9 (readEventStreamTail, readLastOutputs, readMetricSnapshot, computePhaseCountdown, buildBackendBreakdown, loadDepGraphFiles, buildProgressBar, computeEta, loadAgentSkillAssignments) + registerStatusTool
- Max cyclomatic: ~15 (registerStatusTool handler — çok sayıda conditional path)
- En karmaşık fonksiyon: registerStatusTool handler (satır 266-461) — **195 satır**
- **P2**: Handler çok uzun — alt fonksiyonlara bölünmeli

## 6. Type Safety
- `as unknown`: 4 kullanım
  - Satır 30: `JSON.parse(line) as unknown` — ✅ güvenli
  - Satır 342: `dashResult.state as unknown as Record<string, unknown>` — ⚠️ çift cast, dashboard state tipi zayıf
  - Satır 346: `state['agents'] as unknown[]` — ⚠️ runtime type guard yok
  - Satır 347: `state['alerts'] as unknown[]` — ⚠️ runtime type guard yok
- `any`: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- **P2**: Dashboard state erişimi type-safe değil — bracket notation + as unknown

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A
- **ADR-008 brain import**: ✅ UYUMLU — orchestra/ import yok, sadece core/ ve monitor/. JSDoc'larda açıkça belirtilmiş: "File-system based to avoid ADR-008 import cycle (status.ts must not import orchestra/)" — **MÜKEMMEL bilinçli tasarım**
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent status` ile paralel. MCP ek olarak json, verbose, outputMode parametreleri sunar.
- **ADR-033**: ✅
- **Memory V2 DB-first**: N/A — status dosya bazlı (dashboard, tasks, events), DB'ye erişmiyor

## 8. Test Coverage
- tests/mcp/tools/status.test.ts: **MEVCUT** ✅
- tests/mcp/tools/status-agents.test.ts: **MEVCUT** ✅ — agent assignment test
- tests/mcp/tools/status-history.test.ts: **MEVCUT** ✅
- tests/mcp/tools/status-rich.test.ts: **MEVCUT** ✅ — rich output test
- **4 test dosyası** — en iyi coverage'a sahip tool

## 9. TODO/FIXME/HACK Inventory
- **YOK** — temiz

## 10. Dead Code
- Kullanılmayan export: YOK
- `TaskData` interface (satır 199-203): Sadece loadAgentSkillAssignments'da kullanılıyor — ✅ local type

## 11. Security
- **JSONL parse**: JSON.parse try-catch ile korunuyor ✅
- **File read**: Tüm okumalar try-catch ile korunuyor ✅
- **Path construction**: Sprint ID'den oluşturulan dosya yolları — sprintId format kontrolü yok. Kötü niyetli sprintId ile path traversal mümkün (örn: `../../../etc/passwd`). Düşük risk — sprintId brain tarafından üretilir.
- **P3**: sprintId sanitize edilmeli

## 12. Memory V2 Uyumu
- ✅ N/A — status tool Memory DB'ye erişmiyor, doğru mimari
- Dashboard ve task dosyalarından okur — file-based status

## 13. i18n
- outputMode enum'da typo: `'explainatory'` (doğrusu: `'explanatory'`), `'standart'` (doğrusu: `'standard'`) — satır 263
- **P2**: Typo — enum değerleri düzeltilmeli. Bu bir breaking change olabilir, migration gerekir.
- İngilizce string'ler: "No active sprint.", "Sprint completed" — kabul edilebilir

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Çok detaylı ve doğru
- JSDoc: ✅ Internal helper fonksiyonları document edilmiş — **batch'teki en iyi dokümantasyon**
- annotations: readOnlyHint=true, destructiveHint=false, idempotentHint=true — ✅ DOĞRU

## 15. Performance
- Sync I/O: readFileSync (readEventStreamTail, readLastOutputs, readMetricSnapshot, buildBackendBreakdown, loadDepGraphFiles, loadAgentSkillAssignments) — **20+ sync I/O çağrısı**
- **P2**: Hot path — status sık çağrılır. Çok sayıda sync dosya okuması büyük sprint'lerde yavaşlık yaratabilir
- Özellikle readLastOutputs: her .out dosyasını okur, O(n) task sayısı kadar readFileSync
- loadAgentSkillAssignments: her task JSON'u okur

## 16. Öneriler
- **P1**: outputMode enum typo'ları düzeltilmeli: 'explainatory' → 'explanatory', 'standart' → 'standard'
- **P2**: Handler 195 satır — buildStatusResponse() gibi alt fonksiyonlara bölünmeli
- **P2**: Dashboard state erişimi için typed interface kullanılmalı (`as unknown as Record` yerine)
- **P2**: Sync I/O sayısı yüksek — caching veya lazy loading düşünülmeli
- **P3**: sprintId path sanitize

## Verdict: ANALYZED
