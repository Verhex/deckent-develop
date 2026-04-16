# Analysis: src/mcp/tools/review.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 134 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Sprint review MCP tool'u. Tamamlanan sprint'in task sonuçlarını okur, GO/NO_GO/GO_WITH_TECH_DEBT kararları verir. `auto=true` modunda DONE+testsPassed task'ları otomatik onaylar. Brain ve kullanıcı tarafından sprint değerlendirmesinde kullanılır. `enrichResponse` ile zenginleştirilmiş JSON döner.

## 2. Public API
- `registerReviewTool(server: McpServer): void` — Tool kaydı. JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → TASKS_DIR
- `../../core/config.js` → loadConfig
- `../../core/utils.js` → getNextSprintId
- `../helpers/enrich.js` → enrichResponse
- Döngüsel bağımlılık riski: YOK

## 4. Dış Bağımlılıklar
- `zod/v4` — schema validasyon (ADR-010 uyumlu — zod peer dep)
- `@modelcontextprotocol/sdk` — MCP server tipi
- `node:fs`, `node:path` — built-in

## 5. Complexity
- Fonksiyon sayısı: 2 (loadTaskResults, registerReviewTool callback)
- Max cyclomatic: ~4 (loadTaskResults — nested if/for/try)
- En karmaşık: `loadTaskResults` satır 25-65

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as TaskData` satır 50 — unsafe JSON.parse cast ama arayüz tüm fieldları optional, güvenli
- `as TaskResultData` satır 56 — aynı durum
- Non-null `!`: 0
- **İYİ** — type safety düzgün

## 7. ADR Compliance
- **ADR-006** (spawnSync): N/A — spawnSync kullanmıyor
- **ADR-008** (brain import): ✅ — brain'den import yok, core/'dan import
- **ADR-010** (deps): ✅ — sadece zod, @modelcontextprotocol/sdk
- **ADR-022** (CLI/MCP parity): ✅ — CLI `deckent review` karşılığı mevcut
- **ADR-033** (product vision): ✅ — telemetri yok
- **ADR-037** (RBAC): ⚠️ — readOnlyHint: true ama auto-approve mantığı write-like davranış
- **Memory V2**: ❌ — review tool DB'ye sorgu yapmıyor, dosya bazlı task okuma

## 8. Test Coverage
- Dedicated test dosyası: **YOK** (`tests/mcp/tools/review.test.ts` mevcut değil)
- `tests/mcp/tools/misc-tools.test.ts` içinde olabilir ama dedicated coverage yok
- **P1 GAP**

## 9. TODO/FIXME/HACK Inventory
- Hiç yok ✅

## 10. Dead Code
- `loadConfig(root)` satır 82 — config yükleniyor ama dönen değer kullanılmıyor → **DEAD CALL**
- `getNextSprintId` sprint ID hesaplama mantığı tartışmalı — `num-1` yaparak "önceki sprint"i arıyor

## 11. Security
- JSON.parse try/catch içinde → güvenli
- Dosya yolu injection riski yok — TASKS_DIR sabit
- **Düşük risk**

## 12. Memory V2 Uyumu
- DB-first DEĞİL — task dosyalarını diskten okuyor (bu doğru, task'lar DB'de değil)
- Eski .md parse: YOK ✅
- MemoryStore import: YOK (gerekmez de)

## 13. i18n
- Hardcoded İngilizce: "No tasks found for review." satır 89
- TR/EN dual: YOK → **i18n gap**

## 14. Dokümantasyon Tutarlılığı
- MCP tool description: ✅ Detaylı ve doğru
- JSDoc: YOK
- annotations.readOnlyHint: true → ama auto-approve mode dosya yazmıyor, sadece karar veriyor — **tutarlı**

## 15. Performance
- Sync I/O: readFileSync ×3, existsSync ×3, readdirSync ×2 — her çağrıda tüm task dosyaları okunuyor
- Hot path DEĞİL — on-demand MCP tool
- **Kabul edilebilir**

## 16. Öneriler
- **P1:** Dedicated test dosyası eksik — review.test.ts oluşturulmalı
- **P2:** `loadConfig(root)` satır 82 dönen değer kullanılmıyor — ya kaldırılmalı ya da config'e dayanan mantık eklenmeli
- **P2:** i18n — "No tasks found" mesajı locale-aware olmalı
- **P3:** JSDoc eklenmeli

## Verdict: ANALYZED
