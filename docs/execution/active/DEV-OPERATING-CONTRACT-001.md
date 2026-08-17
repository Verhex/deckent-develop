# Outcome Capsule — DEV-OPERATING-CONTRACT-001 (Paket A)

OUTCOME_ID: DEV-OPERATING-CONTRACT-001
DOGFOOD_MODE: OFF (kayıt — authority DEĞİL; aktif mode = host DECKENT-DEV-CONTROL bloğu)
OWNER_DECISION_REF: Alperen 2026-08-17 — dört onay (a: kanun 3/4/6 amendment · b: OFF + A→B sırası · c: Paket B ürün-kodu · d: landing/disposition) + owner-live-2026-08-17-direct-main
BASE_SHA: dbe03fb27e4c14226d01db7bbdee360826a3fe9c
BRANCH: MERGED — PR #130 → main a9018571d; devam eden truth/amendment işi doğrudan main'de (WORKSPACE_MODE=MAIN)
MODE: implement
ROLE: Fable 5 (Brain, max effort) — implementer + landing operator; Sonnet/Opus subagent delege serbest; kritik eleştiride Sol xverify (Kanun 14)

## Allowed mutations
- `docs/governance/deckent-dev-operating-policy.md` (yeni canonical)
- `AGENTS.md` + `CLAUDE.md` (yalnız OPERATING-POLICY bloğu ekleme)
- `scripts/lint-operating-policy.mjs` + `tests/scripts/lint-operating-policy.test.ts` + `package.json` (gate kaydı)
- `.deckent/docs/core-memory/` (kanun 3/4/6 amendment + MEMORY index + project_dev_operating_contract)
- `DIRECTIVES.md` (idle truth-sync)
- `docs/execution/active/` (bu capsule + train)
- `docs/MASTER-PLAN.md` (yalnız 3 yeni satır: 8100/8101/7140)
- Records residue commit'i (8c887987d — approval d disposition)

## Explicit exclusions
- Ürün runtime kodu (`src/**`) — Paket B'nin işidir (RUN-POLICY-DELIVERY-001)
- Yeni feature, MASTER genişletmesi (3 satır dışında), 🔒 Immutable Laws'a dokunma
- Cross-Platform E2E pre-existing kırmızısı (UNRELATED finding — owner admission bekler)
- Merge-queue kapsam değişikliği (Paket B)

## Verification manifest
- `npx vitest run tests/scripts/lint-operating-policy.test.ts` → yeşil
- `node scripts/lint-operating-policy.mjs` → OK + digest
- `npm run lint:gates` (yeni gate dahil) → yeşil
- `node scripts/lint-master-plan.mjs --check` → yeşil (495 satır)

## DONE
- Canonical policy + iki host bloğu byte-parity (digest raporlu) ✓ gate ile kanıtlı
- Kanun 3/4/6 amendment'ları core-memory'de uygulanmış
- Capsule hygiene gate'i (owner-admission + delete-on-consume) lint:gates'te
- DIRECTIVES idle truth-sync
- MASTER 8100/8101/7140 satırları + lint yeşil
- PR merge (queue) + bu capsule'ın SİLİNMESİ (delete-on-consume) → MASTER 8101 DONE

## Stop conditions
- Herhangi bir 🔒 Yasa/ADR çelişkisi → typed HOLD + amendment önerisi
- Scope dışı zorunlu değişiklik ihtiyacı → owner'a exact eksik authority raporu
- Main kırmızıya dönerse → bounded incident package (bkz. 8100) Paket A'nın önüne geçer
