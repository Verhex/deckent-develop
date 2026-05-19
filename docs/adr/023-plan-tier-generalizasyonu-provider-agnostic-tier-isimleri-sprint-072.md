# ADR-023: Plan Tier Generalizasyonu — Provider-Agnostic Tier İsimleri (Sprint 072)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Plan tier isimleri Claude'a özgüydü: `max_plan`, `max5x_plan`, `pro_plan`. Bu isimler Codex ve Gemini kullanıcıları için anlamsızdı. Provider-agnostic bir CLI olarak Deckent, belirli bir sağlayıcıya atıfta bulunmamalı.

**Decision:** Tier isimleri genelleştirildi:
- `max_plan` → `performance` (en yüksek kalite, en yüksek maliyet)
- `max5x_plan` → `balanced` (kalite/maliyet dengesi)
- `pro_plan` → `economic` (düşük maliyet, temel görevler)
- `unlimited` korundu (sınırsız kullanım planları için)

Init wizard da güncellendi: "Select your Claude plan" → "Select your plan". Eski isimler geriye dönük uyumluluk için config migration'da alias olarak tanındı.

**Consequence:** Yeni kullanıcılar provider-agnostic terminoloji görür. Mevcut config'ler autoMigrateOnLoad ile otomatik güncellenir. Tüm belgeler yeni tier isimlerini kullanır. DECKENT.md ve CLAUDE.md provider.ts model equivalence tablosunu güncellenmiş tier isimleriyle gösterir.

**Note (verified vs `src/core/config.ts`):** `max_plan→performance`, `max5x_plan→balanced`, `pro_plan→economic` confirmed (alias map at `config.ts:75+`; `autoMigrateOnLoad` recognizes legacy names ✓). **Correction:** `unlimited` was **not preserved as a standalone tier** — it was remapped to **`api`** (`config.ts:78` → `unlimited: 'api'`, alias-only for backward compatibility). The canonical tier set is `VALID_MODES = ['performance', 'balanced', 'economic', 'api']` (`config.ts:91`); there is no live `unlimited` tier. Behavior unchanged; documentation alignment only.
