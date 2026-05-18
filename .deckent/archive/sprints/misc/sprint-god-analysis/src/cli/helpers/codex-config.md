# Analysis: src/cli/helpers/codex-config.ts
**Task ID:** 142-022 | **Model:** opus | **LoC:** 108 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
Codex (OpenAI CLI) için MCP yapılandırma dosyası üreten modül. `~/.codex/config.toml` (global) ve `.codex/config.toml` (proje) dosyalarını oluşturur/günceller. TOML formatında `[mcp_servers.deckent]` section'ını mevcut dosyaya ekler veya günceller. `deckent init` komutu tarafından çağrılır. ADR-018 (Multi-Environment Config Generation) implementasyonudur.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
- `function generateCodexConfig(projectRoot: string): { global: string; project: string }` — JSDoc: VAR ✓ (satır 14-17)
- `function mergeDeckentSection(toml: string): string` — JSDoc: VAR ✓ (satır 53-55) — Ayrıca exported (test erişimi için?)
- Internal: `upsertToml(filePath: string): void` — JSDoc: VAR ✓ (satır 29-31)
- Internal: `findNextSectionStart(toml: string, startIdx: number): number` — JSDoc: VAR ✓ (satır 88-90)
- **İYİ:** Tüm fonksiyonlarda JSDoc var.

## 3. İç Bağımlılıklar
- İç import: YOK — tamamen bağımsız.
- Döngüsel bağımlılık: YOK.

## 4. Dış Bağımlılıklar
- `node:fs` (existsSync, mkdirSync, readFileSync, writeFileSync)
- `node:path` (dirname, join)
- `node:os` (homedir)
- ADR-010: UYUMLU ✓ — sadece Node.js native modüller.

## 5. Complexity
- Fonksiyon sayısı: 4
- Max cyclomatic: ~6 (mergeDeckentSection, satır 56-85 — idx kontrol, trimmed uzunluk, before/after parçalama)
- En karmaşık: `mergeDeckentSection()` + `findNextSectionStart()` — TOML section parsing mantığı

## 6. Type Safety
- `any`: 0 | `@ts-ignore`: 0 | `@ts-expect-error`: 0 | `as unknown`: 0 | Non-null `!`: 0
- Satır 97: `lines[i]?.length ?? 0` ve satır 100: `lines[i] ?? ''` — optional chaining doğru kullanılmış ✓
- **MÜKEMMEL** type safety.

## 7. ADR Compliance
- ADR-005 (Synchronous I/O — deprecated): Bu modül sync I/O kullanıyor ama init-time tek seferlik çağrı olduğu için kabul edilebilir.
- ADR-006 (spawnSync): N/A — spawn yok.
- ADR-010: UYUMLU ✓
- ADR-018: UYUMLU ✓ — multi-env config generation.
- Memory V2: N/A.

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/codex-config.test.ts` — MEVCUT ✓

## 9. TODO/FIXME/HACK inventory
- Hiçbiri bulunamadı. ✓ Temiz.

## 10. Dead Code
- `mergeDeckentSection` public export — test erişimi için gerekli olabilir. Dış kullanım yoksa gereksiz export.
- Severity: P3.

## 11. Security
- **P2 SORUN:** `upsertToml` (satır 32-50) — `readFileSync` başarısız olursa catch bloğu boş content ile devam ediyor. Mevcut dosya korunmuyor — veri kaybı riski.
- **P2 SORUN:** `writeFileSync` — dosya yazarken atomik değil. Yazma sırasında crash olursa bozuk dosya kalabilir.
- **P1 SORUN:** `homedir()` ile global path — eğer proje farklı kullanıcı altında çalışıyorsa yanlış home dizinine yazar. Ancak bu beklenen davranış.
- Injection riski: DÜŞÜK — TOML content sabit string.
- Secret exposure: YOK.

## 12. Memory V2 Uyumu
- Memory erişimi yok. N/A. ✓

## 13. i18n
- TOML template İngilizce (doğal — config dosyaları). N/A.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 4/4 fonksiyonda mevcut ✓ — **MÜKEMMEL**
- Modül başlık yorumu var ✓

## 15. Performance
- Sync I/O sayısı: 5 (existsSync ×2, mkdirSync ×1, readFileSync ×1, writeFileSync ×1) — `upsertToml` iki kez çağrılır (global + project) → toplam 10 sync I/O.
- Hot path: HAYIR — init zamanı tek seferlik.
- Kabul edilebilir.

## 16. Öneriler (severity P0-P3)
- **P2:** Atomik yazma düşünülmeli — write-to-temp + rename pattern.
- **P2:** `catch` bloğundaki sessiz hata yutma (satır 42-44) — en azından console.warn ile uyarı vermeli.
- **P3:** `mergeDeckentSection` export gerekliliğini doğrula.
- **P3:** `tool_timeout_sec = 600` (10 dakika) — bu değer sabit kodlanmış, config'den alınabilir.

## Verdict: ANALYZED
