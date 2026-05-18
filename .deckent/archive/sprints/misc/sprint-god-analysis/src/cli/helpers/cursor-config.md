# Analysis: src/cli/helpers/cursor-config.ts
**Task ID:** 142-022 | **Model:** opus | **LoC:** 90 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Cursor IDE için MCP yapılandırma ve kural dosyası üreten modül. `.cursor/mcp.json` (MCP server tanımı) ve `.cursor/rules/deckent.mdc` (Cursor rules) dosyalarını oluşturur/günceller. Mevcut `mcp.json` içeriğini korur, sadece `mcpServers.deckent` girdisini ekler/günceller. Rules dosyası her zaman üzerine yazılır (canonical kaynak). `deckent init` komutu tarafından çağrılır. ADR-018 implementasyonu.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `function generateCursorConfig(projectRoot: string): { mcpPath: string; rulesPath: string }` — JSDoc: VAR ✓ (satır 27-29)
- Internal: `upsertCursorMcp(filePath: string): void` — JSDoc: VAR ✓ (satır 42)
- Internal: `upsertCursorRules(filePath: string): void` — JSDoc: VAR ✓ (satır 79-80)
- **İYİ:** Tüm fonksiyonlarda JSDoc var.

## 3. İç Bağımlılıklar
- İç import: YOK — tamamen bağımsız.
- Döngüsel bağımlılık: YOK.

## 4. Dış Bağımlılıklar
- `node:fs` (existsSync, mkdirSync, readFileSync, writeFileSync)
- `node:path` (dirname, join)
- ADR-010: UYUMLU ✓ — sadece native modüller.

## 5. Complexity
- Fonksiyon sayısı: 3
- Max cyclomatic: ~5 (upsertCursorMcp — JSON parse + mcpServers type validation, satır 43-77)
- En karmaşık: `upsertCursorMcp()` (satır 43-77) — JSON read + merge + write

## 6. Type Safety
- `as Record<string, unknown>` (satır 56, 73) — **2 unsafe cast** ama JSON.parse sonrası zorunlu.
- `any`: 0 | `@ts-ignore`: 0 | `@ts-expect-error`: 0 | Non-null `!`: 0
- Satır 54-56: parsed nesne kontrolü (null check, typeof check, Array check) — **İYİ** defensive coding.

## 7. ADR Compliance
- ADR-005 (deprecated sync I/O): Sync I/O kullanıyor — init-time kabul edilebilir.
- ADR-010: UYUMLU ✓
- ADR-018: UYUMLU ✓ — multi-env config.
- Memory V2: N/A.

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/cursor-config.test.ts` — MEVCUT ✓

## 9. TODO/FIXME/HACK inventory
- Hiçbiri bulunamadı. ✓ Temiz.

## 10. Dead Code
- `DECKENT_RULES_CONTENT` sabiti ve `upsertCursorRules` — her ikisi kullanılıyor ✓
- Dead code yok.

## 11. Security
- **P2:** JSON.parse + `as Record<string, unknown>` — prototype pollution teorik riski (JSON.parse ile pratik değil ama savunmacı kod iyi).
- **P2:** `writeFileSync` atomik değil — yazma sırasında crash bozuk JSON bırakabilir.
- **P3:** `catch` bloğu (satır 57-60) sessiz hata yutma — mevcut config kaybolur.
- `DECKENT_MCP_ENTRY` sabit — injection riski yok.

## 12. Memory V2 Uyumu
- Memory erişimi yok. N/A. ✓

## 13. i18n
- Rules template İngilizce — IDE rules için kabul edilebilir.
- `@DECKENT.md` referansı — Cursor `.mdc` formatı `@` referanslarını destekliyor.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 3/3 ✓
- Template içeriği tutarlı.

## 15. Performance
- Sync I/O: ~8 (existsSync ×2, mkdirSync ×2, readFileSync ×1, writeFileSync ×2)
- Init-time tek seferlik — kabul edilebilir.

## 16. Öneriler (severity P0-P3)
- **P2:** Atomik yazma (temp + rename) düşünülmeli — codex-config ile aynı sorun.
- **P2:** Sessiz catch — en azından debug log.
- **P3:** `DECKENT_MCP_ENTRY.timeout = 600` sabit kodlanmış — config'den okunabilir.
- **P3:** codex-config ve cursor-config arasında kod tekrarı var (upsert pattern) — ortak yardımcı çıkarılabilir.

## Verdict: ANALYZED
