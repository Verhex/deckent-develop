# ADR-003: vitest over Jest

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Use vitest for testing.
**Context:** Native ESM support, faster startup, v8 coverage provider, compatible API.
**Consequence:** Tests in `tests/` directory, `vitest.config.ts` at root.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: BOTH** (test-altyapı kanunu; user-projeleri de deckent'in test-discipline'ına güvenir).

**Re-verified:** vitest `^3.0.0` + `@vitest/coverage-v8` package.json'da; jest bağımlılığı/configi SIFIR (tek "jest" izi dashboard'ın `@testing-library/jest-dom` matcher-lib'i — vitest'le kullanılan DOM-matcher, ihlal değil) · v8 coverage-provider (`vitest.config.ts:22`) · `tests/` altında 1435 test-dosyası ✓. **Evrim:** tek-config → çift-config (`vitest.dashboard.config.ts` ayrı dashboard-suite); fork-bounding/CI-hermeticity ayarları config'e işlendi (ADR-087 Async I/O & Test Hermeticity Standard bu ADR'nin disiplin-tamamlayıcısıdır). md+db senkron (Alperen ADR-review).
