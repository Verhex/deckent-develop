# Analysis: src/cli/entry.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 41 | **Effort:** max

## 1. Amaç
CLI giriş noktası (entry point). Node.js versiyon kontrolü (>=18), unhandled rejection handler, graceful shutdown (SIGINT/SIGTERM) ve program başlatma. Shebang (`#!/usr/bin/env node`) ile doğrudan çalıştırılabilir. SIGINT sırasında aktif sprint'i interrupt edip tmux session'larını kapatır.

## 2. Public API
Export yok — bu dosya uygulama giriş noktası, doğrudan `node` ile çalıştırılır.
- `#!/usr/bin/env node` shebang ✓
- `onSignal(signal: string): void` — private (dosya scope)

## 3. İç Bağımlılıklar
- `./index.js` → `buildProgram`
- `./helpers/process.js` → `handleCliError`
- `../../orchestra/sprint-controller.js` → `interruptActiveSprint`
- `../../orchestra/tmux.js` → `killAllSessions`

**KRİTİK ADR-008 ANALİZİ**: entry.ts doğrudan `sprint-controller` ve `tmux` import ediyor.
- ADR-008: "Brain (sprint-controller) is the ONLY module that imports from tmux"
- Bu dosya CLI entry point — brain değil. Ama tmux'u import ediyor!
- **BULGU**: entry.ts `killAllSessions` import ediyor (tmux.ts'den). ADR-008'e göre sadece Brain/sprint-controller tmux import etmeli.
- **KARŞI ARGÜMAN**: entry.ts bir CLI entry point, graceful shutdown için tmux cleanup gerekli. Bu bir "infrastructure" import, ADR-008'in amacı modüler business logic separation. CLI entry point bu kuralın dışında tutulabilir.
- Severity: P2 (ADR-008 teknik ihlali, ama amacı karşılamak için makul argüman var)

## 4. Dış Bağımlılıklar
Doğrudan dış bağımlılık yok. `commander` dolaylı (index.ts aracılığıyla). ADR-010: TAM ✓

## 5. Complexity
- Fonksiyon sayısı: 1 (onSignal)
- Max cyclomatic: 2 (if signal === 'SIGINT')
- En karmaşık fonksiyon: `onSignal` (satır 23) — tek if

## 6. Type Safety
- `any` sayısı: 0 ✓
- `reason: unknown` (satır 18): Doğru — catch unknown pattern ✓
- `err: unknown` (satır 38): Doğru ✓
- `(major ?? 0) < 18` (satır 10): Nullish coalescing güvenli ✓
- Tip güvenliği: MÜKEMMEL

## 7. ADR Compliance
- ADR-005: N/A (sync I/O yok)
- ADR-006 spawnSync: Kullanmıyor ✓
- ADR-008: **TEKNİK İHLAL** — tmux.ts import (yukarıda detaylı açıklama)
- ADR-010: TAM ✓
- ADR-025 Graceful Shutdown: `interruptActiveSprint()` çağrısı ✓ — ADR-025 tam uyum
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/cli/entry.test.ts` → **MEVCUT DEĞİL** ❌
- **TEST GAP**: CLI entry point test edilmiyor
  - SIGINT handler, Node version guard, unhandled rejection — test yok
  - Severity: P2 (entry point güvenilirlik riski)

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
Dead code: YOK ✓ — tüm satırlar aktif

## 11. Security
- `process.exit(0)` (satır 32): SIGINT sonrası exit code 0
  - **BULGU**: SIGINT sonrası exit code 0 yerine 130 olmalı (Unix convention: 128 + signal_number)
  - Severity: P3 (convention violation, CI/CD scriptlerinde yanlış algılanabilir)
- Unhandled rejection handler: `handleCliError` ile yakalanıyor ✓
- `process.versions.node.split('.')` — güvenli, Node.js garanti ✓

## 12. Memory V2 Uyumu
N/A — Entry point, DB ile doğrudan etkileşim yok.

## 13. i18n
- Hardcoded EN: "deckent requires Node.js >= 18", "Received {signal}, exiting…"
- Severity: P3 (sistem mesajları, düşük i18n öncelik)

## 14. Dokümantasyon Tutarlılığı
- DECKENT.md: entry point belirtilmemiş ama `package.json` bin alanı doğru referans veriyor
- JSDoc: N/A (entry point, export yok)

## 15. Performance
- Sync I/O: 0 ✓
- `interruptActiveSprint()` ve `killAllSessions()` sync çağrılar — shutdown sırasında kabul edilebilir
- Startup overhead: Minimal (import chain lazy değil ama Node.js ESM module caching)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | ADR-008 tmux import — `sprint-controller` aracılığıyla shutdown yapılmalı veya ADR-008'e entry point istisnası ekle |
| P2 | Test dosyası oluşturulmalı — SIGINT handler, version guard testleri |
| P3 | SIGINT exit code: 0 → 130 (Unix convention) |
| P3 | Hardcoded EN mesajlar |

## Verdict: ANALYZED
