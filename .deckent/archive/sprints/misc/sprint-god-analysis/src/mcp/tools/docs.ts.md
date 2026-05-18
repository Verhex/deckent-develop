# Analysis: src/mcp/tools/docs.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 140 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Managed docs yönetimi MCP tool'u. Sprint lifecycle'ında otomatik güncellenen dokümanları yönetir. 5 action destekler: add (dosya kaydet), remove (kayıt sil), list (tüm managed docs), update (section konfigürasyonu değiştir), run (docs güncelleme tetikle). ADR-029/030/031 managed-docs mimarisinin MCP arayüzü.

## 2. Public API
- `registerDocsTool(server: McpServer): void` — JSDoc YOK → **EKSİK**

## 3. İç Bağımlılıklar
- `../../orchestra/managed-docs/docs-config.js` → addDoc, removeDoc, loadDocsConfig, saveDocsConfig
- `../../orchestra/managed-docs/managed-doc-runner.js` → runManagedDocUpdates, buildStandaloneDocContext
- `../helpers/enrich.js` → (imported ama kullanılmamış mı? Hayır — kullanılmıyor!)
- Döngüsel bağımlılık: YOK
- **ADR-008 notu:** orchestra'dan import ediyor — utility modül olarak kabul edilebilir

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1 (handler — 5 action branch)
- Max cyclomatic: ~8 (5 if-else branch + error checks)
- En karmaşık fonksiyon: handler callback satır 31-137 — **107 satır tek fonksiyon, yüksek**

## 6. Type Safety
- `any`: 0
- Non-null `!`: 0
- Optional chaining kullanımı düzgün
- **İYİ**

## 7. ADR Compliance
- **ADR-008**: ⚠️ — orchestra/managed-docs'tan import (utility olarak kabul edilebilir)
- **ADR-022**: ✅ — CLI `deckent docs` karşılığı
- **ADR-029/030/031**: ✅ — managed-docs pattern'ı uygulayan MCP tool

## 8. Test Coverage
- Dedicated test: **YOK**
- **P1 GAP** — 5 action, state-modifying

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- `enrichResponse` satır 9'da import edilmiş — **hiçbir action branch'ında kullanılmıyor** → **UNUSED IMPORT, DEAD CODE**
- `existsSync` satır 4 — sadece `add` action'da satır 108'de kullanılıyor, `node:fs` import'u doğru

## 11. Security
- `file` parametresi `join(root, file)` ile kullanılıyor satır 108 → **path traversal riski**
- `file` string'i `addDoc` ve `removeDoc`'a geçiriliyor — bu fonksiyonlar sanitize ediyor mu?
- **P1 — input sanitizasyonu gerekli**

## 12. Memory V2 Uyumu
- N/A — managed docs sistemi file-based, Memory V2 ile doğrudan ilişkisi yok

## 13. i18n
- Hardcoded: "No managed documents configured.", "file is required", "Not found:", "No docs config found."
- **i18n gap**

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ İyi
- annotations: idempotentHint=true → ⚠️ `add` ve `remove` idempotent olabilir ama `run` idempotent olmayabilir (content generation)

## 15. Performance
- On-demand tool — hot path değil
- `run` action'ı tüm managed docs'u günceller → **büyük projede yavaşlayabilir**

## 16. Öneriler
- **P1:** `enrichResponse` unused import — kaldırılmalı veya response'lara eklenmeli
- **P1:** Dedicated test dosyası eksik
- **P1:** `file` parametresi path traversal koruması
- **P2:** Handler 107 satır — action bazlı fonksiyonlara bölünmeli
- **P3:** `idempotentHint` action bazlı olmalı (run ≠ idempotent)

## Verdict: ANALYZED
