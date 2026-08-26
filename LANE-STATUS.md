# Lane Status — CI Repair + Test Slim

- Status: `HOLD_ADMISSION`
- Lane: `lane/ci-repair-20260826`
- Worktree: `/tmp/deckent-lane-ci-repair`
- Base: `567ecaf887891099dfc8c79989dc580a80870b25`
- Phase: `B`
- Phase-B lease: `ACTIVE`
- Src files changed: `0`
- Physical test inventory: `2.923 → 2.859` (`−64`)
- Physical sources retired / new canonical targets: `66 / 2`
- Wire: `117 → 78`
- Static calls: `37.791 → 37.733`
- Merge equality: `57/57 PASS` (`1.305` titles, `2.915` assertions)
- Secret Scan: `PASS`
- CI-R001 + F1–F5: `LOCAL_VERIFIED`
- Full suite: `FAIL — 13 files / 118 tests / 3 errors`
- Coverage: `THRESHOLDS PASS — lines %86,52 / functions %95,22 / branches %83,77; command FAIL (103 tests)`
- 20-gate lint: `HOLD — allowlist dışı stale canonical ratchets`
- Implementation commit: `d25b2ddb1c89e0dec04edc03f1f4e67bce537367`
- Remote advisory: `NO_BRANCH_RUNS` — branch ve exact SHA sorguları `[]`
- Remote branch admission: `PUSHED — admission main-lane authority'de`

Scoped Faz-B işi tamamlandı ve assertion zayıflatma yoktur. Admission HOLD'u test-slim
merge'lerinden değil, `tests/hermeticity/runtime-write-guard.ts:523-529` local
secure-open interposition kökü ile allowlist dışındaki canonical hermeticity/mock
ratchet'larından gelir. Exact kanıt ve önerilen diffs:
`docs/audits/ci-repair-2026-08-26/HANDOFF.md` ve `FINDINGS.md`.
