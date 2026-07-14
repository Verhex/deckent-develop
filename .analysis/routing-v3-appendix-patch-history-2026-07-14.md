# APPENDIX — ROUTING PATCH HISTORY (kanıt-ajanı tam-çıktısı, 2026-07-14)
> Ana-rapor: `.analysis/routing-v3-system-debug-2026-07-14.md` §6. Yöntem: git log --follow (5 routing-dosyası) + scar-yorumları + MASTER-PLAN/ADR-index.

## Counting unit
A "patch" = one distinct scar/campaign ID. ROUTE-1 landed as 8 commits in one day; born-589..593 is one commit covering 5 born-IDs. So: **~22 distinct routing patch campaigns across ~30 commits**, on top of the original mechanism. Baseline (not counted): Sprint 029 agent-pool core (8365c0e2), routing-engine v2 `ca4a1f04` (2026-03-26).

## CHRONOLOGICAL TIMELINE

| # | Sprint/scar id | date | WHAT was patched | WHY (failure it answered) | file(s) / ref |
|---|---|---|---|---|---|
| 1 | Sprint 069 (`f0934fe3`) | 2026-03-27 | agent precision, dynamic skill budget, outcome learning, tempAgent | early tuning | intent-classifier, routing-engine, activation-engine, agent-pool |
| 2 | Sprint 124 (`064bb5d4`) | 2026-04-09 | Context-Aware Routing | routing ignored task context signal | routing-engine.ts |
| 3 | Sprint 197 (`e875ec12`) | 2026-05-26 | Persona-task matcher + threshold tuning | persona/task confidence mis-scored | agent-pool.ts |
| 4 | Sprint 204 (`46682b30`) — 204-003/004 | 2026-05-31 | inject built-in `implementation` candidacy (architect@6 / refactorer@7); stale temp-agent demote + react-template stack-guard | built-ins declared NO impl rule → every implementation task fell to scope-blind `temp-react-ts-specialist` (impl@6) | agent-pool.ts:120-172 |
| 5 | Sprint 205 (`10a6ae03`) — 205-001 | 2026-05-31 | live-validation test: implementation→built-in (anti-temp guarantee) | regression guard so temp agents can't re-win impl tasks | agent-pool.ts:138; activation-engine.ts:380 |
| 6 | Sprint 209 (`70960318`) — 209-001..005, **ADR-072** | 2026-06-01 | domain-match bonus (+3); classifier diversification; skill routing diversification | refactorer's impl@7 tied/beat EVERY domain specialist | routing-engine.ts:99-116; intent-classifier.ts:202-209 |
| 7 | Sprint 210 — 210-004/007, **ADR-073** | 2026-06-01 | routing-live-diversity guard (no agent 75-100%); FIX-phase agent selection | runtime proof of 209 balance + FIX re-routing | tests/core/routing-live-diversity.test.ts; debt-manager.ts:495 |
| 8 | Sprint 212 (`b7b324bc`) — 212-008 | 2026-06-01 | skill→agent affinity (`SKILL_AGENT_MAP`, +3) | agent selection still **collapsed to refactorer ~75% of a sprint** | activation-engine.ts:370-406 |
| 9 | Sprint 216/218 (`54ab7c45`/`c514a8d3`) | 2026-06-01/02 | `USER_SURFACE_BONUS` (+8) | surface-owning specialists not winning their own surface work | routing-engine.ts:237-259 |
| 10 | WM-7 dual (`3d981ec7`) | 2026-06-09 | soft language-mismatch penalty (stack-aware) | `typescript-expert` routed onto a Go project | routing-engine.ts:118-125 |
| 11 | ROUTE-1 B1–B4 (8 commits) | 2026-06-18 | B1 comment-sweep→refactor; B2 surface-gate + path-proxy suppression; B3 kind-gated scoring; B4 intent→skill maps + honest-empty + skill-floor | doc edit touching `src/api/` **hijacked by api-builder** (path-proxy); cleanup misclassified as implementation | routing-engine.ts:160-167,942,1558; intent-classifier.ts:166-177; task-router.ts:224 |
| 12 | PCOMP-W5/W5b/W5C (`ec91a409`) | 2026-07-01 | agent-role axis + role-mismatch (−3); secure-coding extraction; kind-affinity (flag) | security-auditor (review persona) on implementation task; "Sprint-211 refactorer-heavy nüks" | agent-pool.ts:179-239; routing-engine.ts:1212-1255 |
| 13 | born-470 (Sprint 359 `06947b09`, default-OFF) | 2026-07-02 | curated scope-path→domain extraction, flag-gated | REPL/Ink task under `src/cli/repl/` → api-builder on shared path segment | routing-engine.ts:445-494 |
| 14 | R-1b (`7abe0d51`) | 2026-07-08 | flip born-470 default-ON + `terminal-ui`→terminal-ux-engineer | born-470 shipped OFF → CLI/REPL still to api-builder (**re-patch of #13**) | routing-engine.ts:501-504,876-881 |
| 15 | born-589/590/591 (`ae84a4f9`, sprint-393) | 2026-07-10 | domain-ALIAS; activation zod-validation + surfaced silent drops; dilution fix | detectDomains vocab ≠ rule vocab → **dead rules never fire**; malformed manifests silently dropped | routing-engine.ts:519; agent-pool.ts:323,385,901 |
| 16 | born-594 (`a54878e1`, sprint-395) | 2026-07-10 | test-dominant ownership bonus (+8) ci-guardian/bug-fixer | test-sweeps classify `implementation`; ci-guardian EXCLUDES implementation → overrideWarning 9/9 sprint-391 | routing-engine.ts:303-355 |
| 17 | born-622/638/641 (S-402/403) | 2026-07-11 | decision journal; Write-capable fallback; collapse el-fix | born-641 (P0): malformed `secure-coding` manifest **crashed V2-routing on every task ~10 days**, swallowed to debugLog → silent second-path assignments | routing-engine.ts:52-96,799,1132 |
| 18 | PCOMP-6 D3 / S-440 (`b7e1f430`) | 2026-07-14 | remove double-count (keyword+ratio); refactorer-test-guard; ci-guardian bonus | intent double-scored → refactorer skew persisted | routing-engine.ts:1410 |
| 19 | PCOMP-6 D4 / S-441 (`6e276b0d`) | 2026-07-14 | double-threshold; **REMOVE ROUTE-1 B4 skill-floor** | "relevance-inversion" — low-relevance skills forced by #11's floor (**patch reversing a patch**) | routing-engine.ts:1558,1688-1730 |
| 20 | PCOMP-8 U1 / S-442 (`e0cef74c`) | 2026-07-14 | `containsWord` word-boundary; G1b demotion; metadata hygiene | `'ci'`⊂"içindeki", `'cd'`⊂flowId-hex → 4/4 tasks devops | word-match.ts:6; intent-classifier.ts:291-298 |
| 21 | PCOMP-8 F2 / S-443 (`1886fb32`) | 2026-07-14 | classifier PROSE-only (goNogo-strip) | goNogo text bled into classification → 21/26 refactorer | intent-classifier.ts:65 |
| 22 | S-444 F3 (`dae88b1f`) | 2026-07-14 | implementer-era + Sprint-204 injection scrub | refactorer auto-winning generic impl (P4) | agent-pool.ts:120-143 |

## FAILURE-CLASS SUMMARY
- **catch-all-skew: 6 patches** (209→210→212→W5C→440→444) — most re-patched class
- **domain-blindness/path-proxy: 6** (124, 216, WM-7, born-470, R-1b, born-589); born-470→R-1b = same mechanism patched twice
- temp-agent-skew: 3 (069, 204, 205; 205-guard re-preserved at 444)
- confidence-semantics: ~4 (197, ROUTE-1 B4, 441-inversion, G1b); B4 floor later REMOVED as harmful
- keyword-collision: ~3 · test-signal: 3 (210-007, born-594, 440) · goNogo-contamination: 2 (442, 443)
- mechanism-integrity: ~5 (born-590/591/622/638/641)

**Bottom line:** ~22 campaigns / 3.5 months; 7 of 8 failure classes recurred (6 of them 3+ times); patches reversed/re-preserved earlier patches; born-641 = mechanism silently collapsing on every task for ~10 days behind a swallowed exception.
