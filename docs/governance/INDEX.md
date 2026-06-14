# Deckent Governance Documents Master Index

> Bu dizin, Deckent projesinin tüm yönetişim ve stratejik dokümanlarını tek noktadan listeler.
> Cross-document tutarlılık kontrolü: `node scripts/doc-consistency-check.mjs`

---

## Yaşayan Sicil (Living Records)
- [FINAL-EXECUTIVE-REPORT.md](../audits/sprint-132/FINAL-EXECUTIVE-REPORT.md) — Sprint 132+ executive audit, inline güncellenir her sprint
- [God Analysis FINAL-REPORT.md](../../.deckent/archive/sprints/misc/sprint-god-analysis/FINAL-REPORT.md) — Sprint 142 self-analysis + closure tracking (Sprint 172 doc-reorg ile arşive taşındı)

## Yapısal Plan (Static Plans)
- [blueprint.md](../vision/blueprint.md) — EN technical blueprint (Sprint 172 doc-reorg: `DECKENT-MASTER-BLUEPRINT.md` → `docs/vision/blueprint.md`)

## Beta Tracking
- [beta-tracker.md](../release/beta-tracker.md) — EN beta GA roadmap (Sprint 172 doc-reorg: `BETA-TRACKER.md` → `docs/release/beta-tracker.md`)
- [beta-tracker-tr.md](../release/beta-tracker-tr.md) — TR beta GA yol haritası (Sprint 172 doc-reorg: `BETA-TRACKER-TR.md` → `docs/release/beta-tracker-tr.md`)

## Kimlik (Identity)
- [DECKENT.md](../../DECKENT.md) — Project root identity adapter
- [.deckent/workspace/IDENTITY.md](../../.deckent/workspace/IDENTITY.md) — Workspace identity
- [.brain/exports/summary.md](../../.brain/exports/summary.md) — Auto-generated brain summary

---

## Drift Check Komutları

| Doküman | Son güncelleme komutu | Güncelleme sıklığı |
|---|---|---|
| ANA-PLAN-TR | Major sprint task | Her major sprint |
| MASTER-BLUEPRINT | Major sprint task | Her major sprint |
| FINAL-EXECUTIVE | Her sprint inline + append | Her sprint sonrası |
| God Analysis | Closure status update | İhtiyaç halinde |
| BETA-TRACKER (EN+TR) | Her sprint M0-M9 progress | Her sprint sonrası |
| DECKENT.md | İhtiyaç halinde | Yapısal değişikliklerde |
| IDENTITY.md | Sprint metadata değişiminde | Her sprint sonrası |
| summary.md | `deckent memory export` (auto) | Otomatik |

---

## Cross-Doc Tutarlılık Kontrolü

```bash
# Tüm dokümanlar arası numerik tutarlılık kontrolü
node scripts/doc-consistency-check.mjs

# Beklenen çıktı: her metrik için tüm dokümanlar eşleşmeli
# Exit code 0 = tutarlı, 1 = tutarsızlık var
```

### İzlenen Metrikler
- Sprint numarası
- MCP tool sayısı
- CLI command sayısı
- Agent sayısı (built-in)
- Skill sayısı (built-in)
- Test sayısı (yaklaşık)
- Provider sayısı
