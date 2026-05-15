# ADR-021: Kraken ASCII Brand Identity (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Context:** Deckent'in görsel bir kimliği yoktu. CLI araçlarında ilk izlenim önemli.

**Decision:** Kraken ASCII mascot: teal gövde (#4db8a4), gold DECKENT yazısı (#c4a855), dim tagline. `deckent --version` ve `deckent init` komutlarında splash gösterilir.

**Consequence:** Marka tanınırlığı artar. `NO_COLOR` veya `CI` env var varsa splash atlanır. ASCII art sabit string olarak `src/cli/splash.ts`'de tutulur, runtime üretilmez.
