# Analysis: src/core/errors.ts
**Task ID:** 140-001 | **LoC:** 588

## 1. Amaci
Deckent hata sınıflandırma sistemi. `DeckentError` class, `ErrorRegistry` (60+ error code), ve `formatHumanError()` içerir. Her hata kodu için `whatHappened`, `why`, `howToFix` alanları ile kullanıcı dostu mesajlar sağlar.

## 2. Public API (export listesi)
- `DeckentError extends Error`
- `ErrorEntry` interface
- `ErrorRegistry` object (get, has, getAll, createError, register)
- `formatHumanError(error: DeckentError): string`

## 3. İç + Dış Bağımlılıklar
- Bağımlılık yok (standalone)

## 4. Complexity
- Error codes: E001-E066 (60+ kayıt)
- `formatHumanError()`: düşük complexity

## 5. Type Safety
- Mükemmel — `as const` registry, typed ErrorEntry

## 6. ADR Compliance
- **ADR-001** (ESM): UYUMLU
- DECKENT_E055 (`sprint coordinator already running`): koordinatör çoğaltma koruması uygulanmış

## 7. Test Coverage
- `tests/core/errors.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- E060-E066 (agent error codes) — bazıları kullanılmıyor olabilir. Grep gerektirir.

## 10. Security Findings
- `register()` metodu — external code'un hata kodu kaydetmesi açık. Plugin security riski minimal.

## 11. Memory V2 Uyumu
- N/A — bu modül Memory V2 ile doğrudan ilişkili değil

## 12. Öneriler
- E054 (`observability not initialized`) ve E055 iyi desenleme örneği

## 13. Verdict: ANALYZED
