# Analysis: src/core/plugin-loader.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 162 | **Effort:** max

## 1. Amaç (detaylı)
Plugin güvenlik katmanı. Hook modülleri `import()` ile yüklenmeden önce 3 katmanlı savunma sağlar: (1) SkillSandbox AST taraması — tehlikeli kod pattern'lerini tespit eder, (2) SHA-256 imza doğrulaması — dosya bütünlüğü kontrolü, (3) İzin verilen dizin listesi — plugin'lerin sadece belirlenen dizinlerden yüklenmesini sağlar. Defense-in-depth yaklaşımı.

## 2. Public API
- `computeFileHash(filePath): string` — SHA-256 hash hesaplama. JSDoc ✅
- `verifyPluginSignature(pluginDir, manifest): boolean` — İmza doğrulama. JSDoc ✅
- `scanPluginSandbox(pluginDir, projectRoot): SafetyReport` — AST sandbox tarama. JSDoc ✅
- `PluginSecurityConfig` interface — Güvenlik yapılandırması. Alan JSDoc'ları ✅
- `PluginSecurityResult` interface — Doğrulama sonucu
- `validatePluginSecurity(plugin, config): PluginSecurityResult` — Ana güvenlik doğrulama. JSDoc ✅

## 3. İç Bağımlılıklar
- `./plugin.js` → PluginManifest, Plugin, PluginSecurityError
- `./marketplace/skill-sandbox.js` → SkillSandbox, SafetyReport
- **Döngüsel bağımlılık riski:** Yok. plugin-loader → plugin (type-only), plugin-loader → marketplace/skill-sandbox.

## 4. Dış Bağımlılıklar
- `node:crypto` → createHash (SHA-256)
- `node:fs` → existsSync, readFileSync
- `node:path` → join, resolve
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 4 public
- Max cyclomatic complexity: ~6 (`validatePluginSecurity` — 3-step sequential validation)
- En karmaşık fonksiyon: `validatePluginSecurity` (satır 89-161) — 72 satır, 3 validation step

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- Non-null `!`: **0** ✅
- Unsafe cast: **0** ✅
- **Mükemmel type safety.** Tüm fonksiyonlar strongly-typed.

## 7. ADR Compliance
- ADR-006: N/A — spawnSync kullanmıyor ✅
- ADR-008: ✅
- ADR-010: ✅
- ADR-033: ✅ — Lokal dosya hash, ağ çağrısı yok
- ADR-034: ✅ — `allowed_paths` ile proje izolasyonu
- ADR-037 (RBAC): Dolaylı — plugin güvenlik enforcement'ı RBAC benzeri
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/core/plugin-security.test.ts` ✅
- Mock kalitesi: SkillSandbox mock'lanması, fs mock'lanması beklenir
- Edge case: unsigned plugin, invalid signature, path traversal, sandbox failure

## 9. TODO/FIXME/HACK Inventory
- **Hiç yok.** ✅

## 10. Dead Code
- Tüm exportlar `plugin-hooks.ts` tarafından kullanılıyor.
- `computeFileHash`: `verifyPluginSignature` içinde + potansiyel dış kullanım.

## 11. Security
- **SHA-256 imza:** ✅ — Sadece entrypoint dosyasının hash'i kontrol ediliyor. Plugin dizininde birden fazla dosya varsa diğer dosyalar doğrulanmıyor. **P2 — partial coverage.** Ancak AST sandbox bunu telafi ediyor.
- **Path traversal koruması:** `resolve()` ile normalize ediliyor, `startsWith()` ile allowed_paths kontrolü. ✅
- `PluginSecurityError`: Uygun hata sınıfı.
- **Defense-in-depth:** 3 katman (path → sandbox → signature) doğru sırada. Fail-fast: ilk başarısızlıkta `return result`. ✅

## 12. Memory V2 Uyumu
- N/A. Güvenlik modülü hafıza ile etkileşmiyor. ✅

## 13. i18n
- Hata mesajları İngilizce: "Plugin ... rejected", "outside allowed paths", "failed sandbox scan", "no signature", "signature mismatch". Internal güvenlik mesajları — i18n gereksiz.

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅ Mükemmel.
- Header comment (satır 1-6): 3 katmanlı savunma açıklaması doğru.
- `validatePluginSecurity` JSDoc validation order'ı (1-2-3) doğru.

## 15. Performance
- Sync I/O: readFileSync ×1 (hash computation), existsSync ×1 (entrypoint check)
- SkillSandbox.validateSkillSafety: AST parse — plugin yükleme sırasında bir kez çağrılır.
- Hot path: Hayır.

## 16. Öneriler
- **P2 — Tek dosya hash:** Sadece entrypoint hash'i doğrulanıyor. Plugin'in diğer dosyaları (hook modules, config) doğrulanmıyor. `manifest.hooks` tarafından referans edilen dosyaların da hash'lenmesi gerekebilir.
- **P3 — Hash algorithm flexibility:** Sadece SHA-256 destekleniyor. Gelecekte SHA-3 veya BLAKE3 eklenebilir — `PluginSignature.algorithm` alanı zaten var ama sadece 'sha256' kabul ediliyor.

## Verdict: ANALYZED
