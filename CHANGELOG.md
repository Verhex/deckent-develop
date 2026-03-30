# Changelog

See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full changelog.

## Latest: v0.2.0-beta.3 (2026-03-30)

### Sprint 073 — Test Regression Fix
- 100 test regresyonu düzeltildi (43 fs mock, 16 brain mock, 9 doctor, 23 stack/CI, 3 integration)
- 0 fail, 12,161 test passed

### Sprint 072 — Tier Generalizasyonu + God Object Split
- Plan tier generalizasyonu: `max_plan`→`performance`, `max5x_plan`→`balanced`, `pro_plan`→`economic`
- Init wizard provider-agnostic hale getirildi (Claude-specific kaldırıldı)
- Model API ID'leri güncellendi: `claude-opus-4-6`, `claude-sonnet-4-6`
- `sprint-controller.ts` god object split → `sprint-phases.ts` extract (7 faz fonksiyonu)

### Sprint 071 — Windows Dogfooding
- 22 Windows dogfooding bug fix (BUG-3..BUG-26)
- Init UX overhaul: stack-aware templates, docs, TempSkill/Agent
- Subprocess heartbeat periodic update, fallback .result, log capture
- `deckent upgrade --local` for closed beta workflow
