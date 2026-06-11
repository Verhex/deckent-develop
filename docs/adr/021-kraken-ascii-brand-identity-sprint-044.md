
# ADR-021: Kraken ASCII Brand Identity (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Deckent'in görsel bir kimliği yoktu. CLI araçlarında ilk izlenim önemli.

**Decision:** Kraken ASCII mascot: teal gövde (#4DB8A4), bold-gold DECKENT yazısı (#C4A855), dim "AI Agent Orchestrator" tagline.

**Consequence:** Marka tanınırlığı artar. ASCII art sabit string olarak tutulur, runtime üretilmez.

**Note (verified — deep-checked vs `src/cli/helpers/splash.ts`):**
- **Path:** `src/cli/helpers/splash.ts` (not `src/cli/splash.ts`). `KRAKEN_ASCII` is a fixed `const` string; not generated at runtime — ✓.
- **Colors verified accurate:** `TEAL = \x1b[38;2;77;184;164m` → `#4DB8A4`; `BOLD_GOLD = \x1b[1;38;2;196;168;85m` → `#C4A855`; version + tagline dim.
- **Visibility gate:** splash is shown when **`config.output_splash` is true** (`showSplashIfEnabled` returns `null` otherwise) — not hard-wired to `--version`/`init`.
- **`NO_COLOR` correction:** with `NO_COLOR` set the splash is **NOT skipped** — `showSplash` returns the **plain-text** splash (Kraken + `DECKENT v<ver>` + tagline, no ANSI). There is **no `CI` env-var handling** in `splash.ts` (the original "NO_COLOR/CI → splash skipped" wording was inaccurate).

Behavior unchanged; documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: user-product** (marka = ürün ilk-izlenimi).

**Re-verified (Note'un tüm iddiaları gövdeden doğru):** `KRAKEN_ASCII` sabit const (`splash.ts:4`, runtime-üretim yok) · TEAL `38;2;77;184;164` = #4DB8A4 (:12) · BOLD_GOLD `1;38;2;196;168;85` = #C4A855 (:13) · NO_COLOR → plain-text döner, atlanmaz (:23-30) · CI env-handling yok ✓.

**Yeni bulgu — `output_splash` config-düğmesi no-op (dormant çift):** `showSplash` canlı ama yalnız **ilk sprint'te** tüketiliyor (`sprint-phases.ts:665-669`, `sprint.number===1`, gate'siz doğrudan çağrı). Config-gate'li wrapper **`showSplashIfEnabled` = zero-caller**; `output_splash` key'i her katmanda mevcut (default `true` `config.ts:1117`, şema `:1890`, dashboard ConfigPage + i18n en/tr) ama onu okuyan kod hiç çağrılmıyor → kullanıcı ayarı değiştirse davranış değişmez. "Settings özellikler kayıp" deseninin birebir örneği. **İş kaydı: ADR-021-W** (MASTER-PLAN) — sprint-phases çağrısını `showSplashIfEnabled`'a bağla (gerçek gate) veya knob'u şemadan kaldır; dashboard ConfigPage yüzeyi de hizalanır. md+db senkron (Alperen ADR-review).
