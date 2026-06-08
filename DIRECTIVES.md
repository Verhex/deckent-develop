# DIRECTIVES — Sprint 245: Per-Provider Rule-File Sync (WK-9)

## Goal: `.codex/rules/` ve `.gemini/rules/`'ı `.claude/rules/` ile parity'ye getir (W-K item 9 drift). Bugün codex/gemini worker'ları ZAYIF kural koşuyor: `worker-default.md` 110sat (vs .claude 137 — Karpathy 4-Discipline + Proof-of-Function eksik) + `karpathy-discipline.md` HİÇ YOK. ADR-018/013 bunların sync-üretilmesini söyler. **DOC/CONFIG-ONLY — sıfır kod/test riski, sprint-spawn-path'e dokunmaz.**

## Ortak kurallar
- **Parity:** .claude/rules içeriğini kaynak al; provider-spesifik kelimeleri uyarlа (örn. "Claude Code worker" → "Codex worker"/"Gemini worker") ama disiplin/kural İÇERİĞİ birebir aynı (Karpathy 4-Discipline + Proof-of-Function + Verify Loop dahil). i18n muaf (rule-doc EN). No tech debt. Tier-0 → test yok; doğruluk = .claude ile içerik-parity.

---

## Task 1: 245-001 — .codex + .gemini rules → .claude parity
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, docs
- Files: .codex/rules/worker-default.md, .gemini/rules/worker-default.md, .codex/rules/karpathy-discipline.md, .gemini/rules/karpathy-discipline.md
- Scope: .codex/, .gemini/

### Description
Önce oku: `.claude/rules/worker-default.md` (137sat — Karpathy anchor + Proof-of-Function bölümleri dahil), `.claude/rules/karpathy-discipline.md` (154sat), ve mevcut `.codex/rules/worker-default.md` / `.gemini/rules/worker-default.md` (110sat, eksik).

1. **worker-default.md parity:** `.codex/rules/worker-default.md` ve `.gemini/rules/worker-default.md`'yi `.claude/rules/worker-default.md` ile içerik-parity'ye getir — **eksik Karpathy 4-Discipline anchor + Proof-of-Function (Tier-1 user-surface) bölümlerini ekle** + Verify Loop honesty-note. Provider adını uyarla (Codex/Gemini worker), kural-içeriği birebir.
2. **karpathy-discipline.md ekle:** `.claude/rules/karpathy-discipline.md`'yi `.codex/rules/` ve `.gemini/rules/`'a kopyala (içerik aynı; "Deckent Worker Anchor" jenerik, provider-agnostik — olduğu gibi).

**Kanıt:** `.codex/rules/karpathy-discipline.md` + `.gemini/rules/karpathy-discipline.md` var · `grep -c "Karpathy\|Proof-of-Function" .codex/rules/worker-default.md .gemini/rules/worker-default.md` ≥ 4 (her biri) · satır-sayısı .claude'a yakın (±%10).

**Test:** yok (rule-doc sync).
**Smoke:** (doc) disk-verify — Brain/ben iki provider rule-set'inin .claude ile parity'sini kontrol eder.

---

**Beklenen:** 1/1 DONE. codex/gemini worker'ları artık .claude ile aynı disiplin koşar (Karpathy + Proof-of-Function). Disk-verify: 2 karpathy-discipline.md eklendi + 2 worker-default.md parity (Karpathy+PoF) + içerik .claude-uyumlu.

İlgili: [[project_merged_product_flow_analysis]] (W-K rule-drift) · ADR-018 (multi-env config gen) · ADR-013 (adapter) · [[project_karpathy_skill_discipline]].
</content>
