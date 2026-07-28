# Deckent Active Work View

> Auto-generated from [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md). Do not edit by hand.
> Run `npm run docs:master-plan` to regenerate and `npm run lint:master-plan` to verify.

**Schema:** 3

**Source digest:** `sha256(normalized-lf-utf8):4705dd6fabdec29f74e060bbbe7c099558095562b7789b1187b5204884de08ab`

**Rows:** 233 total · 233 active · 0 terminal

## State summary

| State | Count |
|---|---:|
| OPEN | 156 |
| READY | 0 |
| IN_PROGRESS | 0 |
| BLOCKED | 68 |
| VERIFY | 9 |
| DONE | 0 |
| DEFERRED | 0 |
| DISPOSED | 0 |

## Active ledger

| Order | ID | State | Priority | Program | DependsOn | Blocker | Outcome |
|---:|---|---|---|---|---|---|---|
| 10 | `SSOT-001` | VERIFY | P0 | TRUTH | — | — | 2026-07-26 legacy MASTER'ı byte-identical archive et |
| 20 | `SSOT-002` | VERIFY | P0 | TRUTH | `SSOT-001`, `SOURCE-MANIFEST-001`, `LEGACY-RESIDUAL-AUDIT-001` | — | Tüm kaynakları canonical, atomik ve dependency'li ledger'a uzlaştır |
| 30 | `SSOT-003` | VERIFY | P0 | TRUTH | `SSOT-001` | — | MASTER schema validator ve generated active views |
| 40 | `TRUTH-BASELINE-001` | BLOCKED | P0 | TRUTH | `TEST-675`, `TEST-676`, `TEST-HERMETIC-001` | `BASELINE_CONFLICT` | Current HEAD için tek reference test, build, binary ve environment baseline |
| 50 | `TEST-675` | OPEN | P0 | TRUTH | — | — | Testlerin live `.tasks` alanına yazmasını kaldır ve writer discovery ratchet'i kur |
| 60 | `TEST-676` | OPEN | P0 | TRUTH | — | — | Test koşumunda `dist` clean çağrısının fail-loud root cause'unu bul ve kapat |
| 70 | `TEST-HERMETIC-001` | OPEN | P0 | TRUTH | `TEST-675` | — | Project root, HOME, `.tasks` ve tracked-file test writer discovery/migration |
| 75 | `TEST-CONTAINMENT-001` | VERIFY | P0 | TRUTH | `TEST-675` | — | Process-birth, descendant ownership ve OS/OCI test containment authority foundation'ı |
| 80 | `TEST-SPAWN-001` | OPEN | P1 | TRUTH | `TEST-HERMETIC-001` | — | Test `spawnSync` policy ve async migration |
| 90 | `TEST-PLATFORM-001` | OPEN | P1 | TRUTH | `SSOT-003` | — | `tests/PLATFORM.md` ve enforcement'ı source-derived platform registry'ye bağla |
| 100 | `REPO-DECK-001` | OPEN | P0 | TRUTH | — | — | `.deck` secret'ını Docker context ve image layers'dan dışla |
| 110 | `HEARTBEAT-001` | OPEN | P1 | TRUTH | — | — | Default heartbeat template ile metachar guard çelişkisini gider |
| 120 | `STATE-RETENTION-001` | OPEN | P1 | TRUTH | `SSOT-002` | — | Runtime state/log retention, rotation, legal hold ve crash recovery contract |
| 130 | `STATE-PRUNE-001` | BLOCKED | P2 | TRUTH | `STATE-RETENTION-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Exact dry-run state prune manifest ve recoverable apply flow |
| 140 | `DOCS-TOPOLOGY-001` | OPEN | P1 | TRUTH | `SSOT-002` | — | `docs`, `docs1`, `.analysis` ve generated-doc topology kararını current consumer graph ile yeniden ver |
| 150 | `DOCS-ARCHIVE-001` | BLOCKED | P2 | TRUTH | `DOCS-TOPOLOGY-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Approved exact archive/git-mv manifestini uygulayıp links ve writers'ı güncelle |
| 160 | `DOCS-ADR-SYNC-001` | OPEN | P1 | TRUTH | `SSOT-003` | — | Accepted ADR DB↔filesystem full-content/digest parity gate |
| 170 | `DOCS-RELEASE-TRUTH-001` | OPEN | P1 | TRUTH | `DOCS-TOPOLOGY-001`, `SSOT-003` | — | Generated stats, references and release-doc truth authority |
| 180 | `DOCS-I18N-001` | OPEN | P1 | TRUTH | `DOCS-TOPOLOGY-001`, `DOCS-RELEASE-TRUTH-001` | — | Documentation i18n contract for en, tr, zh-Hans, es, ja and hi |
| 190 | `MEMORY-AUTHORITY-001` | OPEN | P0 | TRUTH | `SSOT-002` | — | Repo-local provider-neutral canonical memory; provider HOME surfaces projections only |
| 200 | `MEMORY-TRUTH-001` | BLOCKED | P1 | TRUTH | `MEMORY-AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Memory index count, stale watch, task-capacity and phantom ledger drift'lerini hükme bağla |
| 210 | `REPO-CLEANUP-001` | OPEN | P2 | TRUTH | `SSOT-002` | — | Repository filesystem, tracked-ephemeral and orphan disposition manifest |
| 220 | `REPO-CLEANUP-APPLY-001` | BLOCKED | P2 | TRUTH | `REPO-CLEANUP-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Apply approved repository-filesystem cleanup manifest |
| 230 | `MEMORY-SYNC-001` | OPEN | P0 | TRUTH | `MEMORY-AUTHORITY-001` | — | Provider-neutral revisioned memory sync and projections |
| 240 | `MEMORY-DB-001` | BLOCKED | P2 | TRUTH | `MEMORY-AUTHORITY-001` | `FRESH_DB_APPROVAL_REQUIRED` | Memory DB maintenance manifest and transactional apply |
| 250 | `ZERO-HARDCODE-PROVIDER-001` | OPEN | P1 | TRUTH | `CM-01` | — | Provider identity literal registry and lint ratchet |
| 260 | `ZERO-HARDCODE-FLOW-001` | OPEN | P1 | TRUTH | `KERNEL-ONTOLOGY-001` | — | Flow/state/action literal schema and lint ratchet |
| 270 | `SCRIPT-LIFECYCLE-001` | OPEN | P1 | TRUTH | `SSOT-002` | — | Script lifecycle and proof-harness registry |
| 280 | `SCRIPT-RETIRE-001` | BLOCKED | P2 | TRUTH | `SCRIPT-LIFECYCLE-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Exact replacement-proven script/test retirement |
| 290 | `TEST-ORPHAN-001` | BLOCKED | P2 | TRUTH | `TEST-HERMETIC-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Orphan benchmark, skips and test naming disposition |
| 300 | `TASK-RETENTION-001` | OPEN | P1 | TRUTH | `STATE-RETENTION-001` | — | Task artifacts and archive retention coverage |
| 310 | `ERROR-SEVERITY-001` | OPEN | P2 | TRUTH | `STATE-RETENTION-001` | — | Operational breadcrumb and error forensic severity truth |
| 320 | `OPS-BRANCH-001` | OPEN | P1 | TRUTH | `SSOT-001` | — | Branch, worktree, remote and unpushed-commit authority inventory |
| 330 | `OPS-RETIRE-001` | BLOCKED | P2 | TRUTH | `OPS-BRANCH-001` | `FRESH_REMOTE_APPROVAL_REQUIRED` | Approved branch and remote retirement |
| 340 | `XVERIFY-UX-001` | OPEN | P1 | TRUTH | `SSOT-003` | — | Xverify optional evidence, bounded path/range/symbol targeting and actionable preflight |
| 350 | `XVERIFY-TRUTH-001` | BLOCKED | P0 | TRUTH | `EVALUATION-001`, `RECEIPT-001` | `DEPENDENCY_UNSATISFIED` | Dispatch rejection, verifier abstention and semantic `UNCLEAR` remain distinct |
| 360 | `LEGACY-RESIDUAL-AUDIT-001` | VERIFY | P0 | TRUTH | `SSOT-001` | — | Audit all 199 historical closed claims for hidden residual work |
| 370 | `DOC-IMPACT-001` | BLOCKED | P1 | TRUTH | `KERNEL-SETTLEMENT-001`, `DOCS-RELEASE-TRUTH-001` | `DEPENDENCY_UNSATISFIED` | Finalization surfaces Worker `docImpact` as governed follow-up |
| 380 | `DEBT-GOVERNANCE-001` | BLOCKED | P0 | TRUTH | `SSOT-003`, `KERNEL-SETTLEMENT-001` | `DEPENDENCY_UNSATISFIED` | Technical/product/operational debt ingestion, ownership and closure authority |
| 390 | `SOURCE-MANIFEST-001` | VERIFY | P0 | TRUTH | `SSOT-001` | — | File-level digest and disposition manifest for all reconciliation sources |
| 400 | `HOST-STATE-001` | BLOCKED | P2 | OPS | `MEMORY-AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Provider HOME cache/session/history retention manifest |
| 410 | `HOST-STATE-APPLY-001` | BLOCKED | P2 | OPS | `HOST-STATE-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Apply approved recoverable HOME-state prune |
| 420 | `GIT-MAINT-REPORT-001` | BLOCKED | P2 | OPS | `OPS-BRANCH-001` | `DEPENDENCY_UNSATISFIED` | Read-only git object and pack health report |
| 430 | `GIT-MAINT-APPLY-001` | BLOCKED | P2 | OPS | `GIT-MAINT-REPORT-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Approved local repository maintenance and repack |
| 1000 | `CODEX-MAIN-001` | BLOCKED | P0 | CODEX | `SSOT-003`, `TEST-675`, `TEST-676`, `APPROVAL-001`, `RECEIPT-001`, `LIMIT-001` | `CONFIG_CUTOVER_INCOMPLETE` | Codex-main transition parent |
| 1010 | `CM-01` | BLOCKED | P0 | CODEX | `SSOT-003` | `CONFIG_CUTOVER_INCOMPLETE` | Canonical resolved provider/model contract across every ingress |
| 1020 | `CM-02` | OPEN | P0 | CODEX | `CM-01` | — | Sol, Terra and Luna entitlement evidence matrix |
| 1030 | `CM-03` | OPEN | P0 | CODEX | `CM-01` | — | No-silent provider, model, surface, billing or data-boundary fallback |
| 1040 | `CM-04` | OPEN | P0 | CODEX | `CM-01` | — | Cross-verify provider independence |
| 1050 | `CM-05` | OPEN | P0 | CODEX | `CM-01` | — | Provider authority inventory and cutover for all execution ingress paths |
| 1055 | `XVERIFY-WIRE-001` | BLOCKED | P0 | CODEX | `CM-04`, `PROVIDER-INGRESS-001`, `XVERIFY-UX-001` | `PROVIDER_INGRESS_HOLD` | Sprint and manual xverify share independent provider authority and bounded dispatch |
| 1057 | `CODEX-COMPAT-POLICY-001` | OPEN | P0 | CODEX | `CM-01` | — | Scoped Codex compatibility and integration policy evidence |
| 1060 | `PA-662` | VERIFY | P0 | CODEX | `CM-01` | — | Provider authority keyring provisioning, rotation and doctor proof |
| 1070 | `CODEX-ADMISSION-001` | BLOCKED | P0 | CODEX | `PROVIDER-INGRESS-001`, `ATTENDED-STOP-001`, `PA-662` | `PROVIDER_INGRESS_HOLD` | Exact attended Codex canary admission projection |
| 1080 | `FO-01` | OPEN | P0 | CODEX | `CM-02` | — | Usage capability contract |
| 1090 | `FO-02` | OPEN | P0 | CODEX | `FO-01` | — | Per-budget enforcement projection |
| 1100 | `FO-03` | OPEN | P0 | CODEX | `FO-02` | — | Final-only policy provenance in immutable execution snapshot |
| 1110 | `FO-04` | OPEN | P0 | CODEX | `FO-03`, `CM-05` | — | Exact single-use containment grant |
| 1120 | `FO-05` | OPEN | P0 | CODEX | `FO-04` | — | Common final-only dispatch wiring |
| 1130 | `FO-06` | OPEN | P0 | CODEX | `FO-04` | — | Host wall-clock and process-tree containment |
| 1140 | `FO-07` | BLOCKED | P0 | CODEX | `FO-05`, `FO-06`, `CODEX-ADMISSION-001`, `ATTENDED-STOP-001` | `CODEX_ATTENDED_LANDING_BOUNDARY_ABSENT` | Codex attended landing and hard-stop boundary |
| 1145 | `FO-07B` | OPEN | P0 | CODEX | `FO-09`, `P02-642`, `P02-647`, `P02-651A` | — | Codex unattended checkpoint-stop and terminal landing capability |
| 1150 | `FO-08` | OPEN | P0 | CODEX | `FO-05`, `FO-06`, `RECEIPT-001` | — | Final usage exactly-once settlement through canonical receipt authority |
| 1160 | `FO-09` | OPEN | P0 | CODEX | `FO-07`, `FO-08` | — | Provider attempt crash recovery |
| 1170 | `FO-10` | OPEN | P0 | CODEX | `FO-09` | — | Redacted final-only authority audit |
| 1175 | `FO-10-I18N` | OPEN | P0 | CODEX | `FO-09` | — | Runtime i18n for containment, landing and settlement states |
| 1180 | `FO-11` | OPEN | P0 | CODEX | `FO-10`, `FO-10-I18N` | — | Real-process final-only conformance harness |
| 1185 | `FO-12` | OPEN | P0 | CODEX | `FO-11`, `CODEX-C1`, `CM-01`, `CODEX-COMPAT-POLICY-001`, `CODEX-ADMISSION-001`, `ATTENDED-STOP-001` | — | Final-only Worker canary enablement |
| 1190 | `IM-01` | OPEN | P1 | CODEX | `P02-634`, `P02-642` | — | Codex surface protocol probe |
| 1200 | `IM-02` | OPEN | P1 | CODEX | `IM-01` | — | Canonical incremental usage event contract |
| 1210 | `IM-03` | OPEN | P1 | CODEX | `IM-02` | — | Real-time host usage stream |
| 1220 | `IM-04` | BLOCKED | P1 | CODEX | `IM-03`, `FO-07B` | `CODEX_INCREMENTAL_CONTROL_ABSENT` | Incremental in-flight enforcement |
| 1221 | `IM-05` | BLOCKED | P1 | CODEX | `IM-04` | `DEPENDENCY_UNSATISFIED` | Restart-safe live guard counters and landing reserve |
| 1222 | `IM-06` | BLOCKED | P1 | CODEX | `IM-05`, `FO-08`, `P02-648-CODEX` | `DEPENDENCY_UNSATISFIED` | Incremental-to-final authoritative reconciliation |
| 1223 | `IM-07` | BLOCKED | P1 | CODEX | `IM-06`, `P02-647`, `P02-649`, `P02-650`, `P02-651A`, `P02-651B-CODEX`, `P02-652`, `P02-655` | `DEPENDENCY_UNSATISFIED` | Signed scoped capability promotion and final-only exception retirement |
| 1230 | `CODEX-CANARY-001` | BLOCKED | P0 | CODEX | `FO-11`, `CM-03`, `CM-04` | `DEPENDENCY_UNSATISFIED` | C0–C10 dogfood canary ladder |
| 1235 | `P01-TRUTH-GATE` | BLOCKED | P0 | CODEX | `CM-01`, `CM-02`, `CM-03`, `CM-04`, `CM-05`, `CODEX-COMPAT-POLICY-001`, `PA-662`, `FO-01`, `FO-02`, `FO-03`, `FO-04`, `FO-05`, `FO-06`, `FO-07`, `FO-08`, `FO-09`, `FO-10`, `FO-11`, `CODEX-C0`, `CODEX-C1` | `DEPENDENCY_UNSATISFIED` | PAEP entry milestone for Codex runtime truth and compatibility containment |
| 1240 | `CODEX-C0` | BLOCKED | P0 | CODEX | `CM-01`, `CM-02`, `CM-03`, `CM-04`, `CM-05`, `CODEX-COMPAT-POLICY-001` | `DEPENDENCY_UNSATISFIED` | Static no-call preflight |
| 1250 | `CODEX-C1` | BLOCKED | P0 | CODEX | `FO-11` | `DEPENDENCY_UNSATISFIED` | Fake real-process fault matrix |
| 1260 | `CODEX-C2` | BLOCKED | P0 | CODEX | `CODEX-C0`, `CODEX-C1`, `CODEX-COMPAT-POLICY-001`, `CODEX-ADMISSION-001`, `FO-07`, `FO-08`, `FO-12` | `DEPENDENCY_UNSATISFIED` | Live no-authorized-side-effect canary |
| 1270 | `CODEX-C3` | BLOCKED | P0 | CODEX | `CODEX-C2`, `TOOL-AUTHORITY-001`, `P02-640`, `P02-642` | `DEPENDENCY_UNSATISFIED` | Live finite tool round-trip through Worker Bridge |
| 1280 | `CODEX-C4` | BLOCKED | P0 | CODEX | `CODEX-C3`, `FO-09` | `DEPENDENCY_UNSATISFIED` | Live cancellation and terminal settlement |
| 1290 | `CODEX-C5` | BLOCKED | P0 | CODEX | `CODEX-C4`, `TEST-675`, `TEST-676`, `FO-12`, `XVERIFY-WIRE-001` | `DEPENDENCY_UNSATISFIED` | Attended isolated Deckent microtask |
| 1300 | `CODEX-C6` | BLOCKED | P0 | CODEX | `CODEX-C5`, `FO-07B`, `P02-638`, `P02-639`, `P02-640`, `P02-642`, `P02-647`, `P02-648-CODEX`, `P02-651B-CODEX` | `DEPENDENCY_UNSATISFIED` | Unattended single-task canary |
| 1310 | `CODEX-C7` | BLOCKED | P0 | CODEX | `CODEX-C6`, `KERNEL-ATTEMPT-001`, `WORKER-REGISTRY-001` | `DEPENDENCY_UNSATISFIED` | Two-worker concurrency canary |
| 1320 | `CODEX-C8` | BLOCKED | P0 | CODEX | `CODEX-C7`, `KERNEL-SETTLEMENT-001`, `SPRINT-HONESTY-001` | `DEPENDENCY_UNSATISFIED` | Bounded full lifecycle micro-sprint |
| 1330 | `CODEX-C9` | BLOCKED | P0 | CODEX | `CODEX-C8`, `ENV-ADAPTER-001` | `DEPENDENCY_UNSATISFIED` | Platform canary matrix |
| 1340 | `CODEX-C10` | BLOCKED | P0 | CODEX | `CODEX-C9`, `P02-656`, `IM-07`, `SLO-001` | `DEPENDENCY_UNSATISFIED` | Exact Codex surface/model/platform default rollout and rollback rehearsal |
| 2000 | `P02-630` | BLOCKED | P0 | PAEP | `P01-TRUTH-GATE` | `DEPENDENCY_UNSATISFIED` | Provider Authority and Execution Control Plane parent |
| 2010 | `P02-631` | OPEN | P0 | PAEP | `P01-TRUTH-GATE` | — | Accepted PAEP ADR and ownership boundaries |
| 2020 | `P02-632` | VERIFY | P0 | PAEP | `CM-05` | — | Broker denial fail-closed on every backend |
| 2030 | `P02-633` | OPEN | P0 | PAEP | `P02-632` | — | Runtime-visible credential exposure taxonomy |
| 2040 | `P02-634` | OPEN | P0 | PAEP | `P02-631`, `CAPABILITY-001` | — | Versioned provider surface registry |
| 2050 | `P02-635` | OPEN | P0 | PAEP | `P02-631`, `P02-634` | — | Auth strategy registry |
| 2060 | `P02-636` | OPEN | P0 | PAEP | `P02-631`, `P02-634` | — | Versioned provider policy decision registry |
| 2070 | `P02-637` | OPEN | P0 | PAEP | `P02-634`, `P02-635`, `P02-636` | — | Secret-free Provider Adapter SPI and canonical events |
| 2080 | `P02-638` | OPEN | P0 | PAEP | `P02-631`, `P02-637`, `RECEIPT-001` | — | Signed opaque ProviderSessionLease |
| 2090 | `P02-639` | OPEN | P0 | PAEP | `P02-637`, `P02-638`, `OPERATION-001` | — | Versioned credential-less Worker Execution Protocol |
| 2100 | `P02-640` | OPEN | P0 | PAEP | `P02-638`, `P02-639`, `TOOL-AUTHORITY-001` | — | Worker MCP Bridge and provider translations |
| 2110 | `P02-641` | OPEN | P0 | PAEP | `P02-637`, `P02-638`, `P02-639`, `P02-640` | — | Claude host driver under PAEP |
| 2120 | `P02-642` | BLOCKED | P0 | PAEP | `P02-637`, `P02-638`, `P02-639`, `P02-640`, `FO-11`, `CM-02` | `CODEX_DRIVER_INCOMPLETE` | Codex host driver under PAEP |
| 2130 | `P02-643` | OPEN | P0 | PAEP | `P02-635`, `P02-636`, `P02-637`, `P02-639`, `P02-640` | — | Gemini personal, AI Studio and Vertex policy drivers |
| 2140 | `P02-644` | OPEN | P0 | PAEP | `P02-631`, `P02-635`, `P02-637` | — | Cross-platform host credential custody adapters |
| 2150 | `P02-645` | OPEN | P0 | PAEP | `P02-638`, `P02-639`, `P02-644` | — | Secure Worker Bridge transport matrix |
| 2160 | `P02-646` | OPEN | P0 | PAEP | `P02-634`, `P02-635`, `P02-636`, `P02-637`, `CM-03` | — | Full provider fallback boundary authority |
| 2170 | `P02-647` | OPEN | P0 | PAEP | `P02-637`, `P02-638`, `P02-639`, `P02-640`, `FO-11` | — | Recorded-fixture and real-process conformance kit |
| 2180 | `P02-648` | BLOCKED | P0 | PAEP | `P02-648-CODEX`, `P02-648-CLAUDE`, `P02-648-GEMINI` | `DEPENDENCY_UNSATISFIED` | Provider-scoped permissioned live behavioral canary parent |
| 2181 | `P02-648-CODEX` | BLOCKED | P0 | PAEP | `P02-642`, `P02-645`, `P02-647`, `P02-649`, `P02-651A`, `CODEX-C4` | `DEPENDENCY_UNSATISFIED` | Codex-scoped live behavioral canary |
| 2182 | `P02-648-CLAUDE` | BLOCKED | P0 | PAEP | `P02-641`, `P02-645`, `P02-647`, `P02-649`, `P02-651A` | `DEPENDENCY_UNSATISFIED` | Claude-scoped live behavioral canary |
| 2183 | `P02-648-GEMINI` | BLOCKED | P0 | PAEP | `P02-643`, `P02-645`, `P02-647`, `P02-649`, `P02-651A` | `DEPENDENCY_UNSATISFIED` | Gemini-scoped live behavioral canary |
| 2190 | `P02-649` | OPEN | P0 | PAEP | `P02-636`, `CODEX-COMPAT-POLICY-001` | — | Reviewed provider policy evidence pipeline |
| 2200 | `P02-650` | OPEN | P1 | PAEP | `P02-636`, `P02-649` | — | Signed declarative policy packs and adapter supply chain |
| 2210 | `P02-651` | BLOCKED | P0 | PAEP | `P02-651A`, `P02-651B` | `DEPENDENCY_UNSATISFIED` | Provider quarantine and emergency control plane parent |
| 2211 | `P02-651A` | OPEN | P0 | PAEP | `P02-649`, `P02-650` | — | Hermetic canary safety floor |
| 2212 | `P02-651B` | BLOCKED | P0 | PAEP | `P02-651B-CODEX`, `P02-651B-CLAUDE`, `P02-651B-GEMINI` | `DEPENDENCY_UNSATISFIED` | Provider-scoped live quarantine proof aggregate |
| 2213 | `P02-651B-CODEX` | OPEN | P0 | PAEP | `P02-648-CODEX`, `P02-650` | — | Codex-scoped live quarantine and rollback proof |
| 2214 | `P02-651B-CLAUDE` | OPEN | P0 | PAEP | `P02-648-CLAUDE`, `P02-650` | — | Claude-scoped live quarantine and rollback proof |
| 2215 | `P02-651B-GEMINI` | OPEN | P0 | PAEP | `P02-648-GEMINI`, `P02-650` | — | Gemini-scoped live quarantine and rollback proof |
| 2220 | `P02-652` | OPEN | P1 | PAEP | `P02-640`, `P02-642`, `P02-647`, `P02-648-CODEX` | — | Provider protocol fidelity and performance evidence |
| 2230 | `P02-653` | BLOCKED | P0 | PAEP | `P02-632`, `P02-633`, `P02-642`, `P02-644` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Credential exposure migration ladder |
| 2240 | `P02-654` | OPEN | P1 | PAEP | `P02-637`, `P02-644`, `P02-645`, `P02-649` | — | Enterprise identity, region and policy adapters |
| 2250 | `P02-655` | OPEN | P0 | PAEP | `P02-638`, `P02-646`, `P02-649`, `P02-651` | — | Redacted provider-attempt audit |
| 2260 | `P02-656` | BLOCKED | P0 | PAEP | `P02-648`, `P02-651`, `P02-652`, `P02-653`, `P02-654`, `P02-655`, `CODEX-C9` | `DEPENDENCY_UNSATISFIED` | PAEP rollout readiness and legacy authority retirement |
| 3000 | `KERNEL-001` | BLOCKED | P0 | KERNEL | `SSOT-003`, `TEST-675`, `TEST-676`, `CODEX-C5`, `APPROVAL-001`, `RECEIPT-001`, `LIMIT-001` | `DEPENDENCY_UNSATISFIED` | Goal→Mission→Flow→Run→WorkItem→Attempt→Operation canonical kernel parent |
| 3010 | `KERNEL-ONTOLOGY-001` | OPEN | P0 | KERNEL | `SSOT-003`, `OPERATION-001` | — | Canonical entity identities, ownership, transitions and invariants |
| 3020 | `KERNEL-STATE-001` | OPEN | P0 | KERNEL | `KERNEL-ONTOLOGY-001` | — | Durable event, snapshot and projection authority |
| 3030 | `KERNEL-ATTEMPT-001` | OPEN | P0 | KERNEL | `KERNEL-STATE-001`, `AUTHORITY-001` | — | Claim, lease, fencing, retry, cancellation and idempotency contract |
| 3040 | `KERNEL-SETTLEMENT-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `RECEIPT-001` | — | Canonical result, evidence, acceptance and terminal settlement |
| 3050 | `MISSION-KIND-001` | OPEN | P0 | KERNEL | `KERNEL-ONTOLOGY-001`, `KERNEL-ATTEMPT-001` | — | First-class task, sprint, capability and process runners |
| 3060 | `GOAL-DAG-001` | OPEN | P0 | KERNEL | `KERNEL-STATE-001` | — | Normalized Goal dependency DAG and bounded reconciliation |
| 3070 | `GOAL-POLICY-001` | OPEN | P0 | KERNEL | `GOAL-DAG-001`, `APPROVAL-001` | — | Runtime ApprovalBroker gate before claim |
| 3080 | `GOAL-ACCEPTANCE-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001` | — | Criterion-level Goal acceptance evidence |
| 3090 | `GOAL-PROVIDER-001` | OPEN | P0 | KERNEL | `CM-05`, `RECEIPT-001`, `LIMIT-001` | — | Model, reachability, budget and receipt authority in Goal paths |
| 3100 | `GOAL-CRASH-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001` | — | Goal claim/effect/settlement crash idempotency |
| 3110 | `GOAL-CUTOVER-001` | OPEN | P0 | KERNEL | `GOAL-DAG-001`, `MISSION-KIND-001` | — | Autonomous plan and legacy backlog migration into canonical missions |
| 3120 | `GOAL-CANARY-001` | BLOCKED | P0 | KERNEL | `GOAL-POLICY-001`, `GOAL-ACCEPTANCE-001`, `GOAL-PROVIDER-001`, `GOAL-CRASH-001`, `GOAL-CUTOVER-001` | `DEPENDENCY_UNSATISFIED` | Goal-v2 approval, dependency, receipt and recovery canaries |
| 3130 | `RUNFLOW-001` | OPEN | P0 | KERNEL | `KERNEL-STATE-001`, `KERNEL-SETTLEMENT-001` | — | Durable RunFlow coordinator as sole proposal/approval/run authority |
| 3140 | `SCHEDULER-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001` | — | Pure reducer and typed effect executor scheduler cutover |
| 3150 | `RUNNER-PROTOCOL-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `FO-06` | — | SpawnBackend protocol v2 |
| 3160 | `RECOVERY-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `RUNNER-PROTOCOL-001` | — | Cross-surface recovery leadership and orphan containment |
| 3170 | `BUDGET-CONTINUATION-001` | OPEN | P0 | KERNEL | `LIMIT-001`, `RUNNER-PROTOCOL-001` | — | Landing, continuation reserve, task-kind budget sizing, timeout and measured termination contract |
| 3180 | `DO-CUTOVER-001` | BLOCKED | P0 | KERNEL | `RUNFLOW-001`, `PLANNER-001` | `DEPENDENCY_UNSATISFIED` | `do` becomes canonical intent→preview→approval→run journey |
| 3190 | `AUTONOMY-CUTOVER-001` | BLOCKED | P0 | KERNEL | `GOAL-CANARY-001`, `RECOVERY-001` | `DEPENDENCY_UNSATISFIED` | Autonomous and Nervous execution through canonical kernel |
| 3200 | `PROCESS-CUTOVER-001` | OPEN | P1 | KERNEL | `MISSION-KIND-001`, `RECOVERY-001` | — | Process mode through canonical WorkItem and Attempt authority |
| 3210 | `SURFACE-CUTOVER-001` | BLOCKED | P0 | KERNEL | `DO-CUTOVER-001`, `AUTONOMY-CUTOVER-001`, `PROCESS-CUTOVER-001` | `DEPENDENCY_UNSATISFIED` | CLI, MCP, API, terminal, Desktop and connector adapters share use cases |
| 3220 | `PLANNER-001` | BLOCKED | P0 | KERNEL | `KERNEL-ONTOLOGY-001`, `AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Canonical planner authority and fail-loud structured parsing |
| 3230 | `WORKER-REGISTRY-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `PRINCIPAL-001` | — | Durable Worker identity, claim, heartbeat, capability and settlement registry |
| 3240 | `SPRINT-HONESTY-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `WORKER-REGISTRY-001` | — | Sprint completion metrics, linger and partial-result truth |
| 3250 | `WORKER-DISCOVERY-001` | OPEN | P1 | KERNEL | `PLANNER-001`, `PROMPT-001` | — | Bounded discovery and scope-aware Worker prompt contract |
| 3260 | `RESULT-INGEST-001` | BLOCKED | P0 | KERNEL | `KERNEL-SETTLEMENT-001` | `DEPENDENCY_UNSATISFIED` | Result identity normalization, quarantine and missing-trace root-cause closure |
| 4000 | `AUTHORITY-001` | OPEN | P0 | AUTHORITY | `SSOT-003` | — | Unified runtime authority parent |
| 4010 | `PRINCIPAL-001` | OPEN | P0 | AUTHORITY | `SSOT-003` | — | VerifiedPrincipal across local, OIDC, workload and connector identities |
| 4020 | `TENANT-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001` | — | Canonical tenant/project/session scope enforcement |
| 4030 | `OPERATION-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001` | — | Versioned canonical operation catalog |
| 4040 | `CAPABILITY-001` | OPEN | P0 | AUTHORITY | `OPERATION-001`, `PRINCIPAL-001` | — | Capability authority and progressive disclosure contract |
| 4050 | `APPROVAL-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001`, `TENANT-001`, `OPERATION-001`, `CAPABILITY-001` | — | Runtime-wide durable ApprovalBroker |
| 4060 | `TOOL-AUTHORITY-001` | OPEN | P0 | AUTHORITY | `CAPABILITY-001`, `APPROVAL-001` | — | Task/operation-scoped tool and MCP allowlist |
| 4070 | `RECEIPT-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001`, `TENANT-001` | — | Immutable InvocationReceipt for every provider call |
| 4080 | `REACHABILITY-001` | OPEN | P0 | AUTHORITY | `RECEIPT-001` | — | Capability and account-scoped reachability truth |
| 4090 | `LIMIT-001` | OPEN | P0 | AUTHORITY | `RECEIPT-001`, `REACHABILITY-001` | — | Unified provider/account/tenant/project budget and limit ledger |
| 4100 | `PROVIDER-INGRESS-001` | BLOCKED | P0 | AUTHORITY | `RECEIPT-001`, `REACHABILITY-001`, `LIMIT-001` | `PROVIDER_INGRESS_HOLD` | Provider authority composition for all production ingress |
| 4110 | `ATTENDED-STOP-001` | OPEN | P0 | AUTHORITY | `APPROVAL-001`, `LIMIT-001` | — | Exact attended hard-stop approval authority |
| 4120 | `AUDIT-001` | OPEN | P0 | AUTHORITY | `RECEIPT-001`, `OPERATION-001` | — | Tamper-evident, tenant-scoped causal audit |
| 4130 | `API-SECURITY-001` | BLOCKED | P0 | AUTHORITY | `PRINCIPAL-001`, `TENANT-001`, `APPROVAL-001` | `DEPENDENCY_UNSATISFIED` | API authentication, authorization and config-secret containment |
| 4140 | `ENTERPRISE-AUTH-001` | OPEN | P0 | AUTHORITY | `TENANT-001`, `CAPABILITY-001`, `APPROVAL-001`, `AUDIT-001` | — | Community-safe and enterprise fail-closed profiles |
| 4150 | `ALP-RUNTIME-001` | OPEN | P1 | AUTHORITY | `OPERATION-001`, `APPROVAL-001` | — | Alp Discipline decision anchor in runtime agents and planners |
| 4160 | `MCP-LEASE-001` | VERIFY | P1 | AUTHORITY | `PRINCIPAL-001`, `OPERATION-001` | — | Multi-window MCP writer lease and authority-safe read/write split |
| 4170 | `APPROVAL-QOL-001` | BLOCKED | P1 | AUTHORITY | `APPROVAL-001`, `MCP-LEASE-001` | `DEPENDENCY_UNSATISFIED` | Approval classifier, cross-process expiry and notification dedupe closure |
| 5000 | `TERMINAL-001` | BLOCKED | P0 | TERMINAL | `KERNEL-001`, `AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Terminal as canonical management and usage surface |
| 5010 | `TERMINAL-TOOLS-001` | OPEN | P0 | TERMINAL | `TOOL-AUTHORITY-001`, `SURFACE-CUTOVER-001` | — | Role-model tool surface and progressive disclosure |
| 5020 | `TERMINAL-DEV-001` | OPEN | P0 | TERMINAL | `DO-CUTOVER-001`, `TERMINAL-TOOLS-001` | — | Full codebase development loop inside Deckent terminal |
| 5030 | `TERMINAL-LIVE-001` | OPEN | P0 | TERMINAL | `WORKER-REGISTRY-001`, `KERNEL-SETTLEMENT-001` | — | Live Worker explanations, logs, progress and drill-down |
| 5040 | `TERMINAL-REPL-001` | OPEN | P1 | TERMINAL | `TERMINAL-LIVE-001` | — | REPL cursor, queue, streaming, cancellation and context stability |
| 5050 | `TERMINAL-REF-001` | OPEN | P1 | TERMINAL | `TERMINAL-TOOLS-001` | — | `@` references for files, resources, agents and skills |
| 5060 | `TERMINAL-ONBOARD-001` | OPEN | P0 | TERMINAL | `CM-01`, `PRINCIPAL-001` | — | Conversational setup, doctor and capability discovery |
| 5070 | `TERMINAL-AUTH-001` | BLOCKED | P0 | TERMINAL | `P02-635`, `P02-644` | `DEPENDENCY_UNSATISFIED` | Provider login/session binding and real auth probes |
| 5080 | `NATIVE-DEV-001` | BLOCKED | P0 | TERMINAL | `TERMINAL-DEV-001`, `DESKTOP-001` | `DEPENDENCY_UNSATISFIED` | Deckent terminal plus Desktop as Deckent's own primary development environment |
| 5090 | `TERMINAL-XPLAT-001` | OPEN | P0 | TERMINAL | `TERMINAL-REPL-001`, `ENV-ADAPTER-001` | — | Native terminal platform and accessibility certification |
| 5100 | `TERMINAL-CONTEXT-001` | OPEN | P0 | TERMINAL | `TERMINAL-REPL-001`, `PRINCIPAL-001`, `TENANT-001` | — | Multi-project, multi-session, local/remote and attach/detach context management |
| 5110 | `TERMINAL-COLLAB-001` | OPEN | P1 | TERMINAL | `TERMINAL-CONTEXT-001`, `APPROVAL-001`, `AUDIT-001` | — | Solo, team and enterprise collaboration without operator overload |
| 6000 | `SURFACES-001` | BLOCKED | P0 | PRODUCT | `KERNEL-001`, `AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Shared product surfaces parent |
| 6010 | `APP-SERVICE-001` | OPEN | P0 | PRODUCT | `SURFACE-CUTOVER-001` | — | Typed application-service layer |
| 6020 | `SURFACE-CONTRACT-001` | OPEN | P0 | PRODUCT | `APP-SERVICE-001`, `RECEIPT-001` | — | Versioned surface capability and truth receipts |
| 6030 | `DESKTOP-001` | OPEN | P0 | DESKTOP | `APP-SERVICE-001`, `ENV-ADAPTER-001` | — | First-class Desktop architecture and product foundation |
| 6040 | `DESKTOP-RUNTIME-001` | OPEN | P0 | DESKTOP | `APP-SERVICE-001`, `ENV-ADAPTER-001`, `RUNNER-PROTOCOL-001` | — | Managed-local, attach-local and remote managed runtime profiles |
| 6050 | `DESKTOP-SECURITY-001` | OPEN | P0 | DESKTOP | `PRINCIPAL-001`, `API-SECURITY-001` | — | Desktop session, IPC, deep-link, update and event-stream security |
| 6060 | `DESKTOP-ENTERPRISE-001` | OPEN | P1 | DESKTOP | `DESKTOP-RUNTIME-001`, `DESKTOP-SECURITY-001`, `ENTERPRISE-AUTH-001` | — | Enterprise Desktop governance and fleet operation |
| 6070 | `DESKTOP-REBORN-001` | OPEN | P0 | DESKTOP | `DESKTOP-RUNTIME-001`, `DESKTOP-SECURITY-001`, `SURFACE-CONTRACT-001` | — | Unique, accessible and function-complete Desktop experience |
| 6080 | `API-CONTRACT-001` | OPEN | P0 | API | `APP-SERVICE-001`, `SURFACE-CONTRACT-001` | — | Versioned public/internal API and event contracts |
| 6090 | `API-IDENTITY-001` | OPEN | P0 | API | `PRINCIPAL-001`, `TENANT-001`, `API-SECURITY-001` | — | OIDC, workload identity, tenant authorization and rate enforcement |
| 6100 | `CONNECTOR-IDENTITY-001` | OPEN | P0 | CONNECTOR | `PRINCIPAL-001`, `APPROVAL-001`, `APP-SERVICE-001` | — | Gateway and connector session identity, pairing and approval authority |
| 6110 | `DASHBOARD-OBS-001` | OPEN | P1 | DASHBOARD | `SURFACE-CONTRACT-001`, `AUDIT-001` | — | Dashboard as honest, read-oriented observability projection |
| 6120 | `SURFACE-PARITY-001` | BLOCKED | P0 | PRODUCT | `DESKTOP-REBORN-001`, `API-CONTRACT-001`, `CONNECTOR-IDENTITY-001`, `DASHBOARD-OBS-001` | `DEPENDENCY_UNSATISFIED` | Capability-by-capability parity and intentional negative-space matrix |
| 6130 | `API-EVENT-001` | OPEN | P0 | API | `API-CONTRACT-001`, `KERNEL-SETTLEMENT-001`, `STORAGE-001` | — | Durable asynchronous jobs, event streams, webhooks and outbox delivery |
| 6140 | `API-DEVELOPER-001` | OPEN | P1 | API | `API-CONTRACT-001`, `SURFACE-PARITY-001` | — | OpenAPI, generated SDKs, CLI/MCP parity and compatibility lifecycle |
| 6150 | `API-OPERATIONS-001` | OPEN | P0 | API | `API-IDENTITY-001`, `LIMIT-001`, `API-EVENT-001` | — | Quotas, pagination, bulk operations, idempotency and regional operations |
| 6160 | `SURFACE-ADAPTER-001` | OPEN | P1 | PRODUCT | `APP-SERVICE-001`, `SURFACE-CONTRACT-001`, `CAPABILITY-001` | — | Web, mobile, voice, chat, IDE, CI and ERP thin-adapter expansion |
| 7000 | `ECOSYSTEM-001` | OPEN | P0 | ECOSYSTEM | `P02-647`, `SURFACE-CUTOVER-001`, `CAPABILITY-001`, `AUDIT-001` | — | Governed agent, skill, plugin, tool, MCP and extension ecosystem |
| 7010 | `AGENT-SKILL-001` | OPEN | P1 | ECOSYSTEM | `CAPABILITY-001` | — | Role/capability-complete agent and skill catalog |
| 7020 | `SUPPLY-CHAIN-001` | OPEN | P0 | SECURITY | `AGENT-SKILL-001`, `P02-650` | — | Signed agent, skill and plugin provenance |
| 7030 | `PLUGIN-SANDBOX-001` | OPEN | P0 | SECURITY | `SUPPLY-CHAIN-001`, `TOOL-AUTHORITY-001` | — | Plugin/skill runtime sandbox and capability enforcement |
| 7040 | `MCP-TRUST-001` | OPEN | P0 | SECURITY | `PRINCIPAL-001`, `CAPABILITY-001`, `SUPPLY-CHAIN-001` | — | Outgoing MCP trust, identity and data-boundary authority |
| 7050 | `HUB-001` | BLOCKED | P1 | ECOSYSTEM | `SUPPLY-CHAIN-001`, `PLUGIN-SANDBOX-001` | `OWNER_DECISION_REQUIRED` | Production-ready Deckent Hub and signed distribution |
| 7060 | `TOOL-COMPUTER-001` | OPEN | P2 | TOOL | `TOOL-AUTHORITY-001`, `PLUGIN-SANDBOX-001` | — | Optional computer-use/browser automation pack |
| 7070 | `PROVIDER-EXTENSION-001` | OPEN | P1 | PROVIDER | `P02-637`, `P02-646`, `P02-647` | — | OpenRouter and future provider extensions through PAEP |
| 7080 | `IDE-ADAPTER-001` | OPEN | P2 | SURFACE | `APP-SERVICE-001`, `SURFACE-CONTRACT-001` | — | VS Code, JetBrains and future IDE adapters as non-canonical clients |
| 7090 | `ORPHAN-WIRE-001` | BLOCKED | P0 | TRUTH | `REPO-CLEANUP-001`, `SURFACE-CUTOVER-001` | `DEPENDENCY_UNSATISFIED` | Production import graph orphan disposition and wiring |
| 8000 | `EVERY-ENV-001` | OPEN | P0 | XPLAT | `SSOT-003`, `TEST-PLATFORM-001` | — | Every-environment architecture and release parent |
| 8010 | `ENV-ADAPTER-001` | OPEN | P0 | XPLAT | `KERNEL-001`, `AUTHORITY-001` | — | PlatformAdapter contracts for process, paths, locks, IPC, credentials, terminal and services |
| 8020 | `INSTALL-SCOPE-001` | OPEN | P0 | ONBOARDING | `ENV-ADAPTER-001`, `MEMORY-AUTHORITY-001` | — | Global install plus project-scoped state and learning |
| 8030 | `PLATFORM-PROOF-001` | OPEN | P0 | XPLAT | `ENV-ADAPTER-001`, `TEST-PLATFORM-001` | — | Cross-platform CI, real-binary and hardware/OS certification |
| 8040 | `PACKAGING-001` | OPEN | P0 | RELEASE | `INSTALL-SCOPE-001`, `SUPPLY-CHAIN-001` | — | CLI, daemon, Desktop, service and container packaging supply chain |
| 8050 | `DOCS-PRODUCT-001` | BLOCKED | P0 | DOCS | `DOCS-ADR-SYNC-001`, `DOCS-I18N-001`, `SURFACE-PARITY-001` | `DEPENDENCY_UNSATISFIED` | Current code-truth architecture, guide, reference and operations docs |
| 8060 | `RELEASE-001` | BLOCKED | P0 | RELEASE | `TRUTH-BASELINE-001`, `PLATFORM-PROOF-001`, `PACKAGING-001`, `DOCS-PRODUCT-001` | `DEPENDENCY_UNSATISFIED` | Unified validate, soak, publish and rollback gate |
| 8070 | `REPO-MIGRATION-001` | BLOCKED | P1 | REPO | `REPO-CLEANUP-APPLY-001`, `DOCS-TOPOLOGY-001`, `MEMORY-AUTHORITY-001` | `FRESH_REMOTE_APPROVAL_REQUIRED` | Rebaseline and execute repository cutover |
| 8080 | `OPERATIONS-PACK-001` | OPEN | P1 | OPS | `PACKAGING-001`, `STATE-RETENTION-001`, `AUDIT-001` | — | Install, backup, restore, diagnostics, support bundle and disaster recovery |
| 9000 | `LEARNING-001` | OPEN | P0 | LEARNING | `KERNEL-001`, `AUDIT-001` | — | Closed, governed learning and evolution parent |
| 9010 | `TRAINING-TRACE-001` | OPEN | P0 | LEARNING | `KERNEL-SETTLEMENT-001`, `RECEIPT-001` | — | Training trace wired from attempt to accepted outcome |
| 9020 | `PROMPT-001` | OPEN | P0 | PROMPT | `KERNEL-ONTOLOGY-001`, `ALP-RUNTIME-001` | — | Compiled prompt contract and conflict-free task instructions |
| 9030 | `ROUTING-001` | OPEN | P0 | ROUTING | `PROMPT-001`, `AGENT-SKILL-001`, `REACHABILITY-001` | — | Routing V3 quality, diversity and evidence-driven adaptation |
| 9040 | `EVALUATION-001` | OPEN | P0 | EVAL | `KERNEL-SETTLEMENT-001`, `CM-04` | — | Canonical evaluator, adversarial verification and proof boundary |
| 9050 | `PROMOTION-001` | OPEN | P0 | EVOLUTION | `TRAINING-TRACE-001`, `ROUTING-001`, `EVALUATION-001` | — | Outcome→routing→agent/skill/model promotion and rollback |
| 9060 | `LEARNING-DOGFOOD-001` | OPEN | P1 | LEARNING | `PROMPT-001`, `ROUTING-001`, `KERNEL-001` | — | Historical dogfood findings atomized and regression-proofed |
| 9070 | `FINE-TUNE-001` | OPEN | P2 | LEARNING | `TRAINING-TRACE-001`, `PROMOTION-001`, `DATA-GOV-001` | — | Deckent-core fine-tune only after trace/data/governance readiness |
| 10000 | `SCALE-001` | OPEN | P0 | SCALE | `SSOT-003`, `TRUTH-BASELINE-001` | — | Million-scale assurance parent |
| 10010 | `STORAGE-001` | OPEN | P0 | DURABILITY | `KERNEL-STATE-001`, `TENANT-001` | — | Transactional durable state backend and migration strategy |
| 10020 | `DATA-GOV-001` | OPEN | P0 | DATA | `TENANT-001`, `STORAGE-001`, `STATE-RETENTION-001` | — | Tenant data lifecycle, retention, encryption, residency and deletion authority |
| 10030 | `HA-001` | OPEN | P0 | RESILIENCE | `STORAGE-001`, `KERNEL-ATTEMPT-001` | — | Multi-node coordination, HA, failover and disaster recovery |
| 10040 | `SLO-001` | OPEN | P0 | OBS | `SURFACE-CONTRACT-001`, `AUDIT-001` | — | Product and platform SLI/SLO/error-budget contract |
| 10050 | `LOAD-CHAOS-001` | OPEN | P0 | ASSURANCE | `HA-001`, `SLO-001`, `PLATFORM-PROOF-001` | — | Load, soak, fault, chaos and noisy-neighbor certification |
| 10060 | `COST-001` | OPEN | P1 | COST | `LIMIT-001`, `SLO-001` | — | Provider, compute, storage and operator cost authority |
| 10070 | `ENTERPRISE-MODULARITY-001` | OPEN | P0 | ENTERPRISE | `ENTERPRISE-AUTH-001`, `STORAGE-001` | — | Solo/community/enterprise module boundaries without core forks |
| 10080 | `ASSURANCE-PACK-001` | OPEN | P0 | ASSURANCE | `DATA-GOV-001`, `LOAD-CHAOS-001`, `P02-655` | — | Security, privacy, reliability, performance and compliance evidence pack |
