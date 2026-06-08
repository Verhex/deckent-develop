# DIRECTIVES — Sprint 247: ADR Index (DOC-1 slice)

## Goal: `docs/adr-index.md` (yeni) — tüm ADR'lerin (ADR-001..086+) tek-bakışta indeksi (W-H beta-doc eksiği). Kaynak: `.brain/exports/decisions.md` (108 adr-ref). ID + başlık + status + kısa-özet tablosu, kategorize. **DOC-ONLY, sıfır-risk.**

## Ortak kurallar
- Doğruluk = decisions.md ile uyum. i18n muaf. No tech debt. Tier-0 → test yok.

---

## Task 1: 247-001 — docs/adr-index.md
- Provider: claude
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer, docs
- Files: docs/adr-index.md
- Scope: docs/

### Description
`.brain/exports/decisions.md`'yi (ve gerekirse `.claude/rules/brain.md` ADR-listesini) oku. `docs/adr-index.md` oluştur: tüm ADR'leri (ADR-001..086+) **ID | Başlık | Status (accepted/proposed/deprecated) | 1-satır özet** tablosuyla listele. Mantıksal grupla (Foundation/Provider/Orchestra/Enterprise/Native-CLI vb.) veya numara-sırası. Üstte kısa "ADR nedir + nerede yaşar (memory.db SSOT, decisions.md export)" notu.

**Kanıt:** `docs/adr-index.md` var · ADR-001 + ADR-086 dahil · status sütunu var · `grep -c "ADR-0" docs/adr-index.md` ≥ 50. DONE.

**Test:** yok. **Smoke:** (doc) disk-verify — Brain/ben ADR sayısı + decisions.md uyumu kontrol eder.

---

**Beklenen:** 1/1 DONE. Tam ADR indeksi. Disk-verify: dosya + ≥50 ADR-ref + status sütunu + decisions.md uyumlu.

İlgili: ADR-036 (ADR governance) · [[project_merged_product_flow_analysis]] (W-H adr-index eksiği).
