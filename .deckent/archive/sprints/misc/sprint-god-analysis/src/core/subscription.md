# Analysis: src/core/subscription.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 155 | **Effort:** max

## 1. Amaç (detaylı)
Claude subscription tier tespiti ve mode uyumluluk kontrolü modülü. Opus model erişilebilirliğini test ederek Max vs Pro abonelik tespiti yapar (`claude -p "respond with just your model name" --model opus`). Tespit edilen profili `.deckent/config.json` dosyasına kaydeder. PlanMode ile abonelik uyumluluğunu kontrol eder (örn: `max_plan` mode Pro'da uyumsuz). CLI tool erişilebilirlik kontrolü yapar.

## 2. Public API
- `checkModeCompatibility(profile, configMode): string | null` — Mode/subscription uyumluluk kontrolü. JSDoc ✅
- `detectSubscription(): SubscriptionProfile` — Subscription tier tespiti. JSDoc ✅
- `saveSubscriptionToConfig(profile, projectRoot?): Promise<void>` — Config'e kaydet. JSDoc ✅

## 3. İç Bağımlılıklar
- `./constants.js` → `PROJECT_CONFIG_PATH`
- `./utils.js` → `readJsonSafeAsync`
- `./types.js` → `SubscriptionProfile`, `PlanMode`
- **Döngüsel bağımlılık riski:** Yok.

## 4. Dış Bağımlılıklar
- `node:child_process` → `spawnSync`
- `node:fs/promises` → `writeFile`
- `node:path` → `join`, `resolve`
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 3 public + 1 private = 4
- Max cyclomatic complexity: ~6 (`detectSubscription` — CLI check + spawn + error handling)
- En karmaşık fonksiyon: `detectSubscription` (satır 67-133) — 66 satır, multiple error paths

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- Non-null `!`: **0** ✅
- `as readonly string[]` cast (satır 27-28): MAX_MODES/PRO_MODES readonly array → string[] for .includes(). TypeScript limitation workaround. **Güvenli.**
- `as Record<string, unknown>` (satır 149): Config okuma — readJsonSafeAsync ardından.

## 7. ADR Compliance
- ADR-006 (spawnSync): ✅ — `claude --version` 5s timeout, opus probe 15s timeout
- ADR-008: ✅
- ADR-010: ✅
- ADR-033 (product vision): ✅ — Subscription tespiti product feature, CLI tool probe lokal
- ADR-023 (tier generalization): ✅ — `PlanMode` tier-based, provider-agnostic
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/core/subscription.test.ts` ✅
- Mock kalitesi: spawnSync mock (claude CLI), writeFile mock
- Edge case: CLI not available, timeout, opus available/unavailable, config save failure

## 9. TODO/FIXME/HACK Inventory
- **Hiç yok.** ✅

## 10. Dead Code
- `isClaudeCliAvailable()` private — `detectSubscription` tarafından kullanılıyor ✅
- Tüm exportlar aktif.

## 11. Security
- **CLI execution:** `claude --version` ve `claude -p ... --model opus` — hardcoded komutlar, injection riski yok.
- `shell: process.platform === 'win32'` — Windows'ta shell kullanır (gerekli), Unix'te doğrudan exec.
- Config yazma: `writeFile` ile — atomic değil ama config dosyası single-writer. Düşük risk.
- **P3 — result.error.message:** satır 105 `result.error.message ?? ''` — `message` undefined olabilir, `??` ile handle ediliyor ✅.

## 12. Memory V2 Uyumu
- N/A. Subscription tespiti hafıza ile etkileşmiyor. ✅

## 13. i18n
- Uyarı mesajları İngilizce: "Warning: Config mode ... requires Max subscription" (satır 29), "Note: Config mode ... uses Pro plan settings" (satır 34).
- **P3:** Bu mesajlar CLI'da kullanıcıya gösterilir — i18n desteği düşünülebilir.

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅ Mükemmel.
- `detectSubscription` JSDoc 4 durum senaryosu (Success, Failure, CLI not found, Timeout) doğru.
- `checkModeCompatibility`: MAX_MODES ve PRO_MODES listesi güncel mi? `max5x_plan` mode → bu yeni bir mode mu? Types.ts'de tanımlı olmalı.

## 15. Performance
- spawnSync çağrıları: `claude --version` (5s), `claude -p ... --model opus` (15s) — toplam max 20s.
- Hot path: Hayır — genellikle init veya config sırasında bir kez çağrılır.
- Async: `saveSubscriptionToConfig` async — writeFile promises kullanıyor ✅.

## 16. Öneriler
- **P2 — Opus probe cost:** `detectSubscription` her çağrıda opus'a gerçek bir prompt gönderiyor — token harcıyor. Cache mekanizması olabilir (son tespit 24h geçerli gibi). `saveSubscriptionToConfig` zaten config'e yazıyor, ama `detectSubscription` cache okumayı desteklemiyor.
- **P3 — Windows shell:** `isClaudeCliAvailable` Windows'ta `shell: true` — `claude` PATH'te olmalı. PowerShell vs CMD farkı sorun yaratabilir.
- **P3 — max5x_plan:** `MAX_MODES` listesinde `'max5x_plan'` var — bu tier/mode'un varlığı types.ts'de doğrulanmalı.

## Verdict: ANALYZED
