# ADR-020: Rich Sprint Output — 7-section summary (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Sprint sonuç çıktısı tek satır metric'ti. Kullanıcı kaç task tamamlandı, hangi dosyalar değişti, ne öğrenildi gibi bilgilere erişemiyordu.

**Decision (intent):** Tek-satır metric yerine **zengin çok-bölümlü** sprint çıktısı; ANSI renk + `NO_COLOR` env var desteği.

**Consequence:** Her sprint sonunda kullanıcı tam resmi görür; `NO_COLOR` ile CI-friendly düz metin.

**Note (verified current structure — deep-checked):** The original "7 sections: Header / Results / Changes / Tests / Agents / Learnings / Next Steps" list is **stale**. As implemented today:
- **`RETRO.md`** (`src/orchestra/sprint-retro-writer.ts`) has **5 sections**: `## Summary`, `## Highlights`, `## Issues`, `## Metrics`, `## Learnings` (plus a `### Quality Dimensions` subsection). Highlights/Issues are emitted only when non-empty.
- **`.brain/sprints/sprint-NNN.md`** (`src/orchestra/sprint-docs-updater.ts`) is a **task-oriented log** (`## Task {id}: {title}` → `### Description`), *not* the same structure as the retro (the "same 7-section" claim no longer holds).
- **`NO_COLOR`** is honored — verified in `src/cli/helpers/splash.ts` (plain text when `NO_COLOR` set).

The rich-multi-section decision stands; the concrete section set evolved (canonical = the modules above + `deckent retro` / `deckent history` output). Behavior unchanged; documentation alignment only.
