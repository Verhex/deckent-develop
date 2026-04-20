# Deckent Governance Documents Master Index

> Bu dizin, Deckent projesinin tüm yönetişim ve stratejik dokümanlarını tek noktadan listeler.
> Cross-document tutarlılık kontrolü: `node scripts/doc-consistency-check.mjs`

---

## Yaşayan Sicil (Living Records)
- [FINAL-EXECUTIVE-REPORT.md](../audits/sprint-132/FINAL-EXECUTIVE-REPORT.md) — Sprint 132+ executive audit, inline güncellenir her sprint
- [God Analysis FINAL-REPORT.md](../../.deckent/sprint-god-analysis/FINAL-REPORT.md) — Sprint 142 self-analysis + closure tracking

## Yapısal Plan (Static Plans)
- [DECKENT-ANA-PLAN-TR.md](../../DECKENT-ANA-PLAN-TR.md) — TR ana plan, her major sprint sonu güncellenir
- [DECKENT-MASTER-BLUEPRINT.md](../../DECKENT-MASTER-BLUEPRINT.md) — EN technical blueprint, her major sprint sonu güncellenir

## Beta Tracking
- [BETA-TRACKER.md](../../BETA-TRACKER.md) — EN beta GA roadmap
- [BETA-TRACKER-TR.md](../../BETA-TRACKER-TR.md) — TR beta GA yol haritası

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
