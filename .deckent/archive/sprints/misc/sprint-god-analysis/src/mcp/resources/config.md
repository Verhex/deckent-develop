# Analysis: src/mcp/resources/config.ts
**Task ID:** 142-026 | **Model:** opus | **LoC:** 36 | **Effort:** max

## 1. Amacı
MCP resource olarak `deckent://config` URI'sini kayıt eder. .deckent/config.json dosyasını okur, JSON olarak validate eder ve döner. Proje yapılandırmasının (mode, language, projectName, brain_planning) MCP istemcilere sunulması için. Dosya-tabanlı — doğru.

## 2. Public API
- `registerConfigResource(server: McpServer): void` — tek export, JSDoc YOK → **EKSIK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → PROJECT_CONFIG_PATH
- Döngüsel: YOK

## 4. Dış Bağımlılıklar
- `node:fs`, `node:path` — built-in
- `@modelcontextprotocol/sdk` — ADR-010 uyumlu

## 5. Complexity
- Fonksiyon sayısı: 1
- Max cyclomatic: ~4 (existsSync + try/catch + JSON.parse validate)
- Basit

## 6. Type Safety
- `any`: 0, cast: 0, `!`: 0
- **TEMIZ**

## 7. ADR Compliance
- **ADR-008:** ✅
- **ADR-010:** ✅
- **ADR-022:** ✅
- **Memory V2:** N/A (config dosyası)

## 8. Test Coverage
- Test: resources.test.ts → deckent://config (5 test)
- Edge cases: dosya yok, geçersiz JSON, geçerli JSON, URI kontrol, readFileSync hata
- **İYİ COVERAGE**

## 9. TODO/FIXME/HACK Inventory
- Yok

## 10. Dead Code
- `JSON.parse(text)` satır 25 — validate amaçlı çağrılıyor, sonucu kullanılmıyor → tasarım gereği (validate-only)

## 11. Security
- Config dosyasının ham içeriği döndürülüyor — hassas veri içerebilir (API key'ler config'e konulmamalı)
- **P3:** Secret filtering düşünülebilir ama config.json secret içermemesi gerekir (credential-encryption.ts ayrı)

## 12. Memory V2 Uyumu
- N/A — config dosyası, DB'de değil

## 13. i18n
- Error mesajları EN: "Config not found. Run deckent init first.", "Cannot parse config"
- **MINOR**

## 14. Dokümantasyon Tutarlılığı
- JSDoc: **EKSIK**
- DECKENT.md: ✅ config resource listelenmiş

## 15. Performance
- readFileSync + JSON.parse — **KABUL EDİLEBİLİR**

## 16. Öneriler
- **P3:** JSDoc ekle
- **P3:** Error mesajlarında i18n desteği düşünülebilir

## Verdict: ANALYZED
