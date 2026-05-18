# Analysis: src/core/subscription.ts
**Task ID:** 141-001 | **LoC:** 154

## 1. Amaci (1-2 cumle)
Claude abonelik tier'ini (Max vs Pro) opus modeli yoklama ile otomatik tespit eder ve mode uyumluluğunu kontrol eder. Tespit sonucunu `.deckent/config.json`'a yazar.

## 2. Public API (export listesi)
- `checkModeCompatibility(profile, configMode): string | null` — mode uyumluluğu kontrolu
- `detectSubscription(): SubscriptionProfile` — claude CLI probe ile tier tespiti
- `saveSubscriptionToConfig(profile, projectRoot?): Promise<void>` — config'e kaydet

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./constants.js`, `./utils.js` (readJsonSafeAsync)
- **Node.js:** `node:child_process` (spawnSync), `node:fs/promises` (writeFile), `node:path`
- **Kullanildiği yerler:** setup.ts, doctor.ts, CLI init komutu

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- 3 public fonksiyon + 1 private (isClaudeCliAvailable)
- `detectSubscription()`: spawnSync + 4 farkli return path (timeout, error, success, fail)
- Cyclomatic rough: 12 (cok sayida if/return)

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any`: 0
- `@ts-ignore`: 0
- Non-null assertion: 0
- `result.error.message ?? ''` guvenli erişim

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- ADR-006 (spawnSync): `spawnSync('claude', ...)` kullaniliyor — ADR-006 security pattern dogrulanmali
  - Shell injection: args array kullaniliyor, `shell: true` sadece Windows'ta — UYUMLU
  - Timeout 15s set edilmis — UYUMLU
- ADR-001 (ESM): `.js` import uzantilari — UYUMLU

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- `tests/core/subscription.test.ts` MEVCUT olmali
- `spawnSync` mock gerektiriyor

## 8. TODO/FIXME/HACK inventory
- `// safe: widening PlanMode[] to string[] for .includes()` yorumlu workaround
- Windows'ta `shell: process.platform === 'win32'` — shell injection riski potansiyel, dokumante edilmeli

## 9. Dead Code Candidates
- `MAX_MODES` ve `PRO_MODES` sabi listeler — config-types.ts ile senkronize mi? Drift riski var

## 10. Security Findings
- `spawnSync('claude', [...])` — shell injection korumalı (args array)
- Windows `shell: true` — shell injection riski; `claude` binary adlari inject edilemez (hardcoded) ama potansiyel risk
- `saveSubscriptionToConfig()`: config dosyasina async write — concurrent write riski minimal

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile dogrudan iliskisi yok
- `saveSubscriptionToConfig()` JSON dosyasina yazıyor (.deckent/config.json) — bu file-based, Memory V2 dis dunya
- Abonelik profili MemoryStore'a kaydedilmiyor; gerekirse `identity` tipinde entry olabilir

## 12. Oneriler (Sprint 142+ input)
- `MAX_MODES`/`PRO_MODES` config-types.ts'den import edilmeli (duplication)
- Abonelik tespiti zaman asimi (15s) uzun; background probe ile non-blocking yapilabilir
- `saveSubscriptionToConfig()` atomic write pattern uygulamali

## 13. Verdict: ANALYZED
