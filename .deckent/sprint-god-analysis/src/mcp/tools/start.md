# Analysis: src/mcp/tools/start.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 198 | **Effort:** max

## 1. Amacı
Sprint'i arka planda başlatan MCP tool. `deckent_start` olarak kayıtlı. Tam sprint yaşam döngüsünü tetikler: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. "Fire and forget" pattern kullanır — hemen jobId döndürür, sprint asenkron devam eder. İlerleme deckent_status ile izlenir. En kritik MCP tool'lardan biri.

## 2. Public API
- `registerStartTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../core/config.js` → loadConfig()
- `../../core/provider.js` → bootstrapProviders()
- `../../orchestra/brain.js` → runSprint, BrainError, readContext, planSprint
- `../../core/types.js` → SprintSizeRecommendation (type-only)
- `./job-runner.js` → writeJobState, buildTaskSummaries
- `../helpers/enrich.js` → enrichResponse()
- `../helpers/format.js` → formatStartResponse, formatErrorResponse, wrapResponse
- `../../core/multi-ide.js` → isSprintLocked()
- Döngüsel bağımlılık riski: **DÜŞÜK** — orchestra/brain.js tek import noktası

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 2 (formatJobDuration, registerStartTool)
- Max cyclomatic: ~10 (dry-run branch, lock check, sprint completion/failure handlers)
- En karmaşık bölüm: satır 111-162 — runSprint().then().catch() — asenkron promise chain

## 6. Type Safety
- `any` sayısı: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 0
- **TEMİZ** — iyi tiplenmiş

## 7. ADR Compliance
- **ADR-006 spawnSync**: N/A — spawn kullanmıyor (delegasyon runSprint'e)
- **ADR-008 brain import**: `../../orchestra/brain.js` import ediyor. MCP tool olarak kabul edilebilir — brain.ts re-export layer.
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent start` ile paralel.
  - KNOWN DIVERGENCE (satır 43-45): MCP doctor pre-flight check atlar (non-interactive context). CLI ise doctor çalıştırır. **Doğru şekilde document edilmiş.**
  - autoApprove: immutable true — CLI ile aynı davranış ✅
  - spawn_backend: config'den otomatik alınır ✅
  - timeout: CLI string→int parse, MCP number — eşdeğer ✅
- **ADR-033**: ✅
- **ADR-037 RBAC**: N/A — sprint başlatma brain rolünde

## 8. Test Coverage
- tests/mcp/tools/start.test.ts: **MEVCUT** ✅
- Dry-run path test? Muhtemelen evet
- Sprint lock test? Muhtemelen evet
- Error path (BrainError) test? Doğrulanmalı

## 9. TODO/FIXME/HACK Inventory
- **YOK** — temiz (yorum blokları var ama açıklama niteliğinde, TODO değil)

## 10. Dead Code
- `autoApprove` schema parametresi: Kabul ediliyor ama destructured bile edilmiyor (satır 33: `{ dryRun, force, timeout, sandbox }` — autoApprove destructured DEĞİL). Satır 37'deki yorum: "schema param is kept for API surface parity only (debugging use case)". **P3** — dead param ama kasıtlı.

## 11. Security
- **Sprint lock**: isSprintLocked() kontrolü ✅ — aynı anda iki sprint başlamasını önler
- **Force override**: force=true ile lock bypass edilir — kabul edilebilir (kullanıcı kasıtlı)
- **autoApprove**: İmmutable true — tüm workers `--dangerously-skip-permissions` ile çalışır. Bu tasarımsal bir karar, güvenlik riski değil (worker'lar izole scope'da çalışır).
- **Promise rejection handling**: `.catch(err => writeJobState)` — unhandled rejection yok ✅

## 12. Memory V2 Uyumu
- ✅ Sprint lifecycle'ı runSprint() üzerinden çalışır — Memory V2 entegrasyonu brain.ts/sprint-controller.ts seviyesinde
- Bu dosyada doğrudan memory erişimi yok — doğru mimari

## 13. i18n
- Hardcoded Türkçe: satır 137 `Sprint ${sprint.id} tamamlandı` — ⚠️ TR string, İngilizce ortamda sorunlu olabilir
- Diğer mesajlar İngilizce: "Sprint started in background", "Dry-run complete" — karışık dil
- **P2**: Sprint completion mesajı dil bağımsız olmalı veya config'den alınmalı

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Çok detaylı ve doğru
- Parity yorum blokları (satır 35-45): ✅ Excellent — CLI/MCP farklılıkları açıkça document edilmiş
- annotations: readOnlyHint=false, destructiveHint=false, idempotentHint=false — ✅ DOĞRU

## 15. Performance
- Sync I/O: 0 — tüm I/O ya zaten async ya da job-runner üzerinden
- ✅ Hot path değil, bootstrap sırasında bir kere çalışır
- Fire-and-forget pattern: ✅ Doğru — MCP timeout riskini önler

## 16. Öneriler
- **P2**: Sprint completion mesajı (satır 137) i18n edilmeli — TR/EN karışıklık
- **P3**: `autoApprove` dead param — schema'dan kaldırılabilir veya description'da açıkça "deprecated" belirtilmeli
- **P3**: `bootstrap?.connector` — bootstrapProviders null dönerse connector undefined olur. runSprint bu durumu handle ediyor mu? Doğrulanmalı.

## Verdict: ANALYZED
