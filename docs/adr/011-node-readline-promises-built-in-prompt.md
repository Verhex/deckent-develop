# ADR-011: node:readline/promises — Built-in Prompt

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Decision:** İnteraktif prompt'lar (text, select, confirm) için `node:readline/promises` modülü kullanılır.
**Context:** `inquirer` (1.2MB) veya `prompts` (200KB) eklemek yerine Node 18+ built-in API yeterli. Basit wrapper'lar (`promptText`, `promptSelect`, `promptConfirm`) tüm init wizard ihtiyacını karşılıyor.
**Consequence:** Rich UI (autocomplete, fuzzy search) yok. Gerekirse Phase 3 TUI'da `ink` veya `blessed` eklenebilir.
