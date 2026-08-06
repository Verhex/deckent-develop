# Deckent Active Work View

> Auto-generated from [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md). Do not edit by hand.
> Run `npm run docs:master-plan` to regenerate and `npm run lint:master-plan` to verify.

**Schema:** 3

**Source digest:** `sha256(normalized-lf-utf8):aa9ff18cd8096e955919b69f70c5edad32d35ea0cec5c0aaa8ea053a6462b1d0`

**Rows:** 388 total · 353 active · 35 terminal

## State summary

| State | Count |
|---|---:|
| OPEN | 258 |
| READY | 0 |
| IN_PROGRESS | 0 |
| BLOCKED | 67 |
| VERIFY | 28 |
| DONE | 35 |
| DEFERRED | 0 |
| DISPOSED | 0 |

## Active ledger

| Order | ID | State | Priority | Program | DependsOn | Blocker | Outcome |
|---:|---|---|---|---|---|---|---|
| 25 | `LEDGER-ISOLATED-COMMIT-PROOF-001` | OPEN | P2 | TRUTH | — | — | Canonical ledger uzlaştırmasının izole/fresh-clone commit kanıtı — SSOT-002 + SOURCE-MANIFEST-001 kapanışlarından taşınan canlı-kanıt boyutu |
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
| 171 | `DOCS-DEPS-HOME-001` | OPEN | P2 | TRUTH | — | — | Dependency-doku ile gerçek kurulum-ağacının (HOME/global adapterlar dahil) tek-kaynak hizası: docs/reference/dependencies.md kayıtları ile package.json/override gerçeği arasındaki drift sınıfı kapatılır |
| 180 | `DOCS-I18N-001` | OPEN | P1 | TRUTH | `DOCS-TOPOLOGY-001`, `DOCS-RELEASE-TRUTH-001` | — | Documentation i18n contract for en, tr, zh-Hans, es, ja and hi |
| 190 | `MEMORY-AUTHORITY-001` | OPEN | P0 | TRUTH | `SSOT-002` | — | Repo-local provider-neutral canonical memory; provider HOME surfaces projections only |
| 200 | `MEMORY-TRUTH-001` | BLOCKED | P1 | TRUTH | `MEMORY-AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Memory index count, stale watch, task-capacity and phantom ledger drift'lerini hükme bağla |
| 210 | `REPO-CLEANUP-001` | OPEN | P2 | TRUTH | `SSOT-002` | — | Repository filesystem, tracked-ephemeral and orphan disposition manifest |
| 220 | `REPO-CLEANUP-APPLY-001` | BLOCKED | P2 | TRUTH | `REPO-CLEANUP-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Apply approved repository-filesystem cleanup manifest |
| 230 | `MEMORY-SYNC-001` | OPEN | P0 | TRUTH | `MEMORY-AUTHORITY-001` | — | Provider-neutral revisioned memory sync and projections |
| 235 | `MEMORY-SURFACE-PROJECTION-001` | OPEN | P0 | TRUTH | `MEMORY-AUTHORITY-001`, `MEMORY-SYNC-001` | — | Rev-3 provider-agnostic core-memory projection across five assistant surfaces via shared workspace-sync service |
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
| 370 | `DOC-IMPACT-001` | BLOCKED | P1 | TRUTH | `KERNEL-SETTLEMENT-001`, `DOCS-RELEASE-TRUTH-001` | `DEPENDENCY_UNSATISFIED` | Finalization surfaces Worker `docImpact` as governed follow-up |
| 380 | `DEBT-GOVERNANCE-001` | BLOCKED | P0 | TRUTH | `SSOT-003`, `KERNEL-SETTLEMENT-001` | `DEPENDENCY_UNSATISFIED` | Technical/product/operational debt ingestion, ownership and closure authority |
| 400 | `HOST-STATE-001` | BLOCKED | P2 | OPS | `MEMORY-AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Provider HOME cache/session/history retention manifest |
| 410 | `HOST-STATE-APPLY-001` | BLOCKED | P2 | OPS | `HOST-STATE-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Apply approved recoverable HOME-state prune |
| 420 | `GIT-MAINT-REPORT-001` | BLOCKED | P2 | OPS | `OPS-BRANCH-001` | `DEPENDENCY_UNSATISFIED` | Read-only git object and pack health report |
| 430 | `GIT-MAINT-APPLY-001` | BLOCKED | P2 | OPS | `GIT-MAINT-REPORT-001` | `FRESH_DESTRUCTIVE_APPROVAL_REQUIRED` | Approved local repository maintenance and repack |
| 440 | `EXEC-TEMPO-001` | OPEN | P1 | OPS | — | — | Config-resolved high-parallelism execution tempo with batch-receipt owner approvals |
| 450 | `RUNTIME-FLOOR-001` | OPEN | P1 | TRUTH | `SSOT-003` | — | Tek runtime minimum sürüm contractı: package engines, doctor, onboarding ve release gate aynı floor'u ilan ve test eder |
| 460 | `ERROR-REGISTRY-001` | OPEN | P1 | TRUTH | `SSOT-003` | — | Emitted her typed error kodu tek registry'de message ve remediation ile kayıtlı; kullanıcıya görünen doküman aynı kaynaktan üretilir |
| 470 | `CONFIG-TRUTH-001` | OPEN | P1 | TRUTH | `SSOT-003` | — | Config leaf metadata ve default üretimi tek canonical kaynaktan; manifest backend default'u aynı kaynağı tüketir |
| 480 | `PROVIDER-OBS-MIGRATION-001` | OPEN | P1 | TRUTH | — | — | Provider-execution-observation DB'sinin owner-controlled v1→v2 migration'ı: backup, migrate, adoption proof |
| 490 | `MCP-ANNOTATION-SAFETY-001` | OPEN | P1 | TRUTH | — | — | MCP tool annotation'ları gerçek side-effect sınıfını söyler: destructive/RW path'ler RO ilan edilemez |
| 500 | `I18N-SURFACE-001` | OPEN | P1 | TRUTH | — | — | Ürün-yüzeyi runtime i18n/a11y enforcement: user-facing string'ler catalog'dan, lint tüm yüzeyleri kapsar |
| 510 | `CLI-VOCAB-001` | OPEN | P1 | TRUTH | — | — | Public CLI contract onarımı: yazım-hatalı enum'lar, run/sprint namespace çarpışması ve config read yüzeyi tek karara bağlanır |
| 520 | `TRUST-ANCHOR-001` | VERIFY | P0 | TRUTH | — | — | Validator admission trust anchor'ı gerçekten enforce edilir: receipt baseline'ı parent-diff'e karşı doğrulanır, owner authority authenticated olur |
| 524 | `VERIFY-HISTORICAL-CLOSURE-001` | OPEN | P2 | TRUTH | — | — | Historical-only VERIFY satırlarının (10 adet) receipt-gated kapanış dilimi: her satır için kanıt-durumu tiplenir (yeniden-doğrulanabilir / historical-yeterli / eksik-kanıt) ve kapanış turu Alperen onayıyla koşulur |
| 526 | `TRUST-ANCHOR-003` | OPEN | P1 | TRUTH | — | — | Solo-hesap yapısal mitigasyon paketi: out-of-repo canonical check (GitHub App ayrı integration-ID), bot machine-account + path-scoped required-reviewer, nightly ruleset-snapshot dış defteri, GHEC-trial değerlendirmesi |
| 530 | `CI-COVERAGE-JOB-WALL-001` | VERIFY | P1 | TRUTH | — | — | Coverage Report kronik kırmızı: enstrümante tam-suite 20dk step-cap duvarına çarpıyor (bugünün TÜM main koşularında ~21dk'da kill; yeşil veri noktası yok) + scanTestDir production-scale testi enstrümantasyon-yükünde 10s default test-timeout'una çarpıyor (11.9s ölçüldü) |
| 531 | `CI-COVERAGE-REVEALED-DEBT-001` | VERIFY | P1 | TRUTH | — | — | 530 duvar-kaldırımının açığa çıkardığı görünmez borç: yalnız-Coverage'da koşan test sınıfları (e2e/audits/backends/docker/nervous/governance/release/build/brain/workflows — hiçbir hızlı CI job'unda yoklar) 20-dk duvarı ardında haftalardır kör; ilk tam koşu (run 31056929295, 35179 test) 16 dosyada 55 gerçek kırık |
| 532 | `CI-VITEST-WORKER-CRASH-001` | OPEN | P2 | TRUTH | — | — | Docs+Scripts job'unun belgeli 'testler yeşil ama vitest onTaskUpdate worker-crash ile exit-1' flake sınıfı: run 31056929295'te 101/101 pass + exit-1 (job continue-on-error ile maskeli — job-level yeşil kanıtları kirletiyor) |
| 533 | `CI-HERMETIC-SCAN-DIST-BLIND-001` | VERIFY | P1 | TRUTH | — | — | Hermetic-lint taraması build-duyarlı: built ağaçta import-takibi dist dosyalarına girip analyzer girdisi üretiyor (+71, dist/core/errors.js — run 31074633586 kesin ölçüm; script başlığındaki 'baselines BUILD-FREE ölçülür' operasyon-yükünün kökü) — Coverage job'u build:all yaptığından ratchet testi yalnız orada düşüyor |
| 534 | `SSOT-SETTLEMENT-001` | OPEN | P0 | TRUTH | `APPROVAL-001`, `RECEIPT-001`, `KERNEL-SETTLEMENT-001`, `AUDIT-001` | — | MASTER settlement-closure authority: authenticated historical authority, external immutable/self-hosting-safe grant ledger, commit-bound settlement ve Git trust-anchor |
| 535 | `CI-ACTIONS-ECONOMY-001` | VERIFY | P1 | TRUTH | — | — | CI kaynak-ekonomisi yapısal düzenleme: her tren 3 tam-koşu tetikliyor (PR+merge_group+main-push ×2 workflow; günde ~35+35 koşu ölçüldü), merge-queue TÜM ci.yml'i koşuyor, Coverage (21-40dk) her merge'de, macos-ağır xplat job'ları her PR'da — repo PUBLIC olduğundan maliyet dakika-faturası değil duvar-saat + eşzamanlılık-kuyruğu + sinyal-gürültüsü |
| 536 | `ADR-BACKFILL-G039-001` | VERIFY | P2 | TRUTH | — | — | ADR-G-039 (2026-07-23 03:46, provider-authority key-custody) kaydının eksik Context bölümü ve 'To be backfilled' Sprint alanı — Coverage duvarı kalkınca decisions format-testi görünür kıldı (55-kırık envanterinin son kalemi) |
| 537 | `DOCKER-WRAPPER-HYGIENE-001` | VERIFY | P2 | TRUTH | — | — | Wrapper şablonunda HB_PID hiçbir yerde set edilmeden 3 yerde kill ediliyor (no-op ölü satırlar) + buildHeartbeatWrapperLoop docstring'i INERT-seam gerçeğiyle çelişiyor (531 docker-emekliliği typed gözlemi) |
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
| 1340 | `CODEX-C10` | BLOCKED | P1 | CODEX | `CODEX-C9`, `P02-656`, `IM-07`, `SLO-001` | `DEPENDENCY_UNSATISFIED` | Exact Codex surface/model/platform default rollout and rollback rehearsal |
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
| 3021 | `RUN-STATUS-AUTHORITY-001` | OPEN | P0 | KERNEL | — | — | Canonical sprint runtime status authority and stale-state reconciliation |
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
| 3161 | `RECOVERY-RESUME-001` | VERIFY | P0 | KERNEL | `RUN-STATUS-AUTHORITY-001` | — | Durable pause notification, approval and lease-safe resume continuation |
| 3162 | `PAUSED-FINALIZE-001` | OPEN | P0 | KERNEL | `RUN-STATUS-AUTHORITY-001` | — | Task projection'ı kayıp paused sprint için evidence-honest force-finalize settlement |
| 3163 | `RECOVERY-DECISION-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `KERNEL-SETTLEMENT-001` | — | Provider-neutral cold-lane recovery decision engine |
| 3164 | `RECOVERY-MODE-ADAPTERS-001` | OPEN | P0 | KERNEL | `RECOVERY-DECISION-001`, `MISSION-KIND-001`, `RUNFLOW-001` | — | Sprint, Run, Flow, Do, Autonomous, Mission and Process recovery adapters |
| 3165 | `RECOVERY-COMMAND-SERVICE-001` | OPEN | P0 | KERNEL | `RECOVERY-DECISION-001`, `RECOVERY-RESUME-001`, `APPROVAL-001` | — | Shared inspect, resume, settle and abort recovery application service |
| 3166 | `RECOVERY-TERMINATION-001` | OPEN | P0 | KERNEL | `RECOVERY-DECISION-001`, `RUNNER-PROTOCOL-001` | — | Ownership-fenced termination shared by kill, finalize, cleanup and mode shutdown |
| 3167 | `RECOVERY-STALE-PROJECTION-001` | OPEN | P0 | KERNEL | `RECOVERY-DECISION-001`, `KERNEL-SETTLEMENT-001` | — | Evidence-honest reconciliation of stale Run, Flow, job and dashboard projections |
| 3168 | `RECOVERY-ASSURANCE-001` | OPEN | P0 | KERNEL | `RECOVERY-MODE-ADAPTERS-001`, `RECOVERY-COMMAND-SERVICE-001`, `RECOVERY-TERMINATION-001`, `RECOVERY-STALE-PROJECTION-001` | — | Recovery failure-injection, every-environment and million-scale assurance matrix |
| 3169 | `RECOVERY-DOGFOOD-BORN-001` | OPEN | P0 | KERNEL | — | — | Mandatory born ledger for recovery dogfood discoveries |
| 3170 | `BUDGET-CONTINUATION-001` | OPEN | P0 | KERNEL | `LIMIT-001`, `RUNNER-PROTOCOL-001` | — | Landing, continuation reserve, task-kind budget sizing, timeout and measured termination contract |
| 3171 | `RECOVERY-BORN-480-HEARTBEAT-001` | OPEN | P0 | KERNEL | `WORKER-REGISTRY-001`, `RECOVERY-DECISION-001` | — | Worker-writable heartbeat can regress monotonic recovery evidence |
| 3172 | `RECOVERY-BORN-480-SCOPE-001` | OPEN | P0 | KERNEL | `PLANNER-001`, `RECOVERY-COMMAND-SERVICE-001` | — | Dependency output is unreachable from downstream recovery surface read scope |
| 3173 | `RECOVERY-BORN-480-HOLD-CLASSIFICATION-001` | OPEN | P0 | KERNEL | `PROVIDER-HOLD-001`, `RECOVERY-COMMAND-SERVICE-001` | — | Scope failure is misclassified as provider usage-limit hold |
| 3174 | `RECOVERY-BORN-480-EVALUATE-ORPHAN-001` | OPEN | P0 | KERNEL | `RECOVERY-DECISION-001`, `RECOVERY-STALE-PROJECTION-001`, `KERNEL-SETTLEMENT-001` | — | EVALUATE lock can strand NO_GO without FIX or truthful recovery command |
| 3175 | `RECOVERY-BORN-480-ATTRIBUTION-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `WORKER-REGISTRY-001` | — | Shared-worktree predecessor diff is attributed to a later failed attempt |
| 3176 | `RECOVERY-BORN-480-FIX-PRIORITY-001` | OPEN | P0 | KERNEL | `SCHEDULER-001`, `RECOVERY-BORN-480-EVALUATE-ORPHAN-001` | — | Priority FIX must outrank blocked dependants in collision and slot admission |
| 3177 | `RECOVERY-BORN-480-FORCE-FINALIZE-ORPHAN-001` | OPEN | P0 | KERNEL | `RECOVERY-TERMINATION-001`, `PAUSED-FINALIZE-001` | — | Force-finalize must retire or contain every matching recovery coordinator |
| 3178 | `RECOVERY-DO-DOGFOOD-001` | OPEN | P0 | KERNEL | `RECOVERY-COMMAND-SERVICE-001`, `DO-CUTOVER-001`, `RECOVERY-BORN-480-FORCE-FINALIZE-ORPHAN-001` | — | Next recovery slice through canonical `do` journey before Autonomous widening |
| 3179 | `RECOVERY-BORN-480-POSTBUILD-BINARY-001` | OPEN | P0 | ASSURANCE | `RECOVERY-ASSURANCE-001`, `TEST-676` | — | Immediate post-build recovery binary proof can exit zero with empty stdout |
| 3180 | `DO-CUTOVER-001` | BLOCKED | P0 | KERNEL | `RUNFLOW-001`, `PLANNER-001` | `DEPENDENCY_UNSATISFIED` | `do` becomes canonical intent→preview→approval→run journey |
| 3181 | `RECOVERY-BORN-481-EXACT-PROVIDER-PROJECTION-001` | OPEN | P0 | KERNEL | `RUNFLOW-001`, `DO-CUTOVER-001`, `AUTHORITY-001` | — | Digest-bound provider derivation cannot create post-approval task artifact drift |
| 3182 | `RECOVERY-BORN-481-FAILED-RUN-STATUS-001` | OPEN | P0 | KERNEL | `RUN-STATUS-AUTHORITY-001`, `RECOVERY-STALE-PROJECTION-001`, `RUNFLOW-001` | — | RUN_FAILED and dead coordinator reconcile to one truthful terminal or recoverable status |
| 3183 | `RECOVERY-BORN-481-DO-PREVIEW-APPROVAL-001` | OPEN | P0 | AUTHORITY | `DO-CUTOVER-001`, `RUNFLOW-001`, `APPROVAL-001` | — | Do preview approval executes the same immutable proposal instead of replanning |
| 3184 | `RECOVERY-BORN-481-GATE-TRUTH-001` | OPEN | P1 | KERNEL | `DO-CUTOVER-001`, `PLANNER-001`, `ZERO-HARDCODE-FLOW-001` | — | Scope-gate rejection cannot be reported as a zero-blocker prompt-gate failure |
| 3185 | `RECOVERY-BORN-482-CLOSED-SCOPE-001` | OPEN | P0 | AUTHORITY | `PLANNER-001`, `AUTHORITY-001`, `DO-CUTOVER-001` | — | Exact closed write allowlist is enforced before task artifact creation or dispatch |
| 3186 | `RECOVERY-BORN-482-AGGREGATE-DEPENDENCY-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `SCHEDULER-001`, `RECOVERY-BORN-480-FIX-PRIORITY-001` | — | Dependency release consumes aggregate evaluated settlement, not raw result presence |
| 3187 | `RECOVERY-BORN-482-FIX-AUTHORITY-001` | OPEN | P0 | KERNEL | `PLANNER-001`, `ROUTING-001`, `RECOVERY-BORN-480-SCOPE-001`, `RECOVERY-BORN-480-FIX-PRIORITY-001` | — | FIX projection carries the bounded authority and capable persona required by its diagnosed repair |
| 3188 | `RECOVERY-BORN-482-REPAIR-SETTLEMENT-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `RECOVERY-COMMAND-SERVICE-001`, `RUNFLOW-001`, `PAUSED-FINALIZE-001` | — | Exhausted repair lineage becomes resumable PAUSE/HOLD instead of false COMPLETE |
| 3189 | `RECOVERY-BORN-482-SUBSCRIPTION-ACCOUNTING-001` | OPEN | P0 | COST | `LIMIT-001`, `KERNEL-SETTLEMENT-001` | — | Subscription reference price cannot become billed USD or API budget consumption |
| 3190 | `AUTONOMY-CUTOVER-001` | BLOCKED | P0 | KERNEL | `GOAL-CANARY-001`, `RECOVERY-001` | `DEPENDENCY_UNSATISFIED` | Autonomous and Nervous execution through canonical kernel |
| 3191 | `RECOVERY-BORN-483-EVALUATION-HONESTY-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `EVALUATION-001`, `RECOVERY-BORN-482-REPAIR-SETTLEMENT-001` | — | Explicit failed mandatory deliverable cannot be rubric-promoted into allowed debt or terminal success |
| 3192 | `RECOVERY-BORN-483-PROVIDER-CONCURRENCY-001` | OPEN | P0 | PROVIDER | `PROVIDER-INGRESS-001`, `LIMIT-001`, `RUNNER-PROTOCOL-001` | — | Advertised worker concurrency must equal attainable provider execution concurrency |
| 3193 | `RECOVERY-BORN-483-XVERIFY-PAYLOAD-001` | OPEN | P0 | EVAL | `XVERIFY-WIRE-001`, `EVALUATION-001`, `RECEIPT-001` | — | Cross-provider XVerify receives complete digest-bound material evidence and gates promotion honestly |
| 3194 | `RECOVERY-BORN-483-PROMPT-AUTHORITY-001` | OPEN | P0 | AUTHORITY | `RUNFLOW-001`, `PROMPT-001`, `AUTHORITY-001` | — | Exact RunFlow worker prompt cannot ingest a stale competing execution directive |
| 3195 | `RECOVERY-BORN-485-TERMINAL-PUBLICATION-001` | VERIFY | P0 | KERNEL | — | — | Terminal authority publishes before archive and status never regresses during cleanup |
| 3196 | `RECOVERY-BORN-485-FIX-AUTHORITY-001` | OPEN | P0 | KERNEL | `WORKER-DISCOVERY-001`, `PLANNER-001` | — | FIX retries repair diagnosed read authority and refuse unchanged impossible contracts |
| 3197 | `RECOVERY-BORN-485-SEMANTIC-VERDICT-001` | OPEN | P0 | EVAL | `EVALUATION-001`, `TEST-DISCOVERY-001` | — | Passing evidence must exercise the acceptance-bound production consumer |
| 3198 | `RECOVERY-BORN-485-USAGE-BILLING-001` | OPEN | P0 | COST | `LIMIT-001`, `RECEIPT-001`, `SPRINT-HONESTY-001` | — | FIX lineage usage, billing and KPI projections resolve through logical task authority |
| 3199 | `RECOVERY-BORN-485-PROMPT-POLICY-001` | OPEN | P0 | AUTHORITY | `PROMPT-001`, `ROUTING-V3-CUTOVER-001` | — | Exact worker prompt preserves global run policy, forced skills and monotonic lifecycle instructions |
| 3200 | `PROCESS-CUTOVER-001` | OPEN | P1 | KERNEL | `MISSION-KIND-001`, `RECOVERY-001` | — | Process mode through canonical WorkItem and Attempt authority |
| 3210 | `SURFACE-CUTOVER-001` | BLOCKED | P0 | KERNEL | `DO-CUTOVER-001`, `AUTONOMY-CUTOVER-001`, `PROCESS-CUTOVER-001` | `DEPENDENCY_UNSATISFIED` | CLI, MCP, API, terminal, Desktop and connector adapters share use cases |
| 3220 | `PLANNER-001` | BLOCKED | P0 | KERNEL | `KERNEL-ONTOLOGY-001`, `AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Canonical planner authority and fail-loud structured parsing |
| 3230 | `WORKER-REGISTRY-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `PRINCIPAL-001` | — | Durable Worker identity, claim, heartbeat, capability and settlement registry |
| 3240 | `SPRINT-HONESTY-001` | OPEN | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `WORKER-REGISTRY-001` | — | Sprint completion metrics, linger and partial-result truth |
| 3241 | `PRODUCTION-WIRING-AUTHORITY-001` | VERIFY | P0 | KERNEL | `PLANNER-001`, `EVALUATION-001`, `TEST-DISCOVERY-001` | — | Production changes cannot settle without canonical consumer and enablement reachability |
| 3250 | `WORKER-DISCOVERY-001` | OPEN | P1 | KERNEL | `PLANNER-001`, `PROMPT-001` | — | Bounded discovery and scope-aware Worker prompt contract |
| 3252 | `WORKER-DISCOVERY-ADAPTERS-001` | OPEN | P2 | KERNEL | `TEST-DISCOVERY-001` | — | Vitest-dışı test-discovery adapter'ları (Jest, Pytest, diğer diller) + canlı heterojen-proje kanıtı |
| 3260 | `RESULT-INGEST-001` | BLOCKED | P0 | KERNEL | `KERNEL-SETTLEMENT-001` | `DEPENDENCY_UNSATISFIED` | Result identity normalization, quarantine and missing-trace root-cause closure |
| 3261 | `RESULT-RECONCILIATION-001` | VERIFY | P0 | KERNEL | — | — | Terminal-only atomic result ingestion and malformed-result reconciliation |
| 3270 | `RECOVERY-BORN-486-EXECUTE-FIX-QUIESCENCE-001` | VERIFY | P0 | KERNEL | `KERNEL-SETTLEMENT-001`, `SCHEDULER-001`, `RECOVERY-BORN-482-REPAIR-SETTLEMENT-001` | — | EXECUTE always yields to runnable work or FIX without a result-count deadlock |
| 3271 | `RECOVERY-BORN-486-FINALIZE-CONTAINMENT-001` | VERIFY | P0 | KERNEL | `RECOVERY-COMMAND-SERVICE-001`, `RUN-STATUS-AUTHORITY-001`, `RESULT-RECONCILIATION-001` | — | Finalize discovers only canonical tasks and publishes COMPLETE only after exact coordinator containment |
| 3272 | `RECOVERY-BORN-486-DOGFOOD-BUDGET-LOCALITY-001` | VERIFY | P0 | COST | `LIMIT-001`, `RECOVERY-BORN-482-SUBSCRIPTION-ACCOUNTING-001` | — | Dogfood tuning cannot turn per-task subscription limits into a global dispatch stop |
| 3273 | `RECOVERY-BORN-486-NERVOUS-COLLISION-001` | VERIFY | P1 | KERNEL | `SCHEDULER-001`, `RECOVERY-BORN-480-FIX-PRIORITY-001` | — | Nervous scope-collision decisions must execute real serialization or authority repair |
| 3274 | `RECOVERY-BORN-486-SCOPED-SELF-AUDIT-001` | VERIFY | P0 | KERNEL | `TEST-DISCOVERY-001`, `PRODUCTION-WIRING-AUTHORITY-001` | — | Automatic finalization audits only the settled affected-test manifest |
| 3275 | `RECOVERY-BORN-487-POST-SETTLEMENT-BINARY-001` | OPEN | P0 | KERNEL | `RECOVERY-BORN-485-TERMINAL-PUBLICATION-001`, `RECOVERY-BORN-486-SCOPED-SELF-AUDIT-001` | — | Built-binary verification is scheduled only after terminal settlement |
| 3276 | `RECOVERY-BORN-487-LANDING-PROPOSAL-WRITER-001` | OPEN | P1 | KERNEL | `BUDGET-CONTINUATION-001`, `RESULT-RECONCILIATION-001` | — | Worker landing proposals use a structured atomic writer and malformed evidence cannot pass silently |
| 3277 | `RECOVERY-BORN-487-CONCURRENT-TYPECHECK-001` | OPEN | P1 | ASSURANCE | `RECOVERY-BORN-486-SCOPED-SELF-AUDIT-001`, `PRODUCTION-WIRING-AUTHORITY-001` | — | Worker verification cannot judge unrelated concurrent partial writes |
| 3279 | `RECOVERY-BORN-487-CLEAN-HOLD-EXIT-001` | VERIFY | P0 | ASSURANCE | `RECOVERY-BORN-487-POST-SETTLEMENT-BINARY-001`, `RUN-STATUS-AUTHORITY-001` | — | Build cannot report success when clean is held by active execution authority |
| 3280 | `RECOVERY-BORN-487-CLEANUP-ARTIFACT-IDENTITY-001` | VERIFY | P0 | KERNEL | `RECOVERY-BORN-487-LANDING-PROPOSAL-WRITER-001`, `RUN-STATUS-AUTHORITY-001` | — | Cleanup consumes canonical task identity and retires only owned temporary residue |
| 3282 | `RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001` | OPEN | P0 | KERNEL | `KERNEL-ATTEMPT-001`, `KERNEL-SETTLEMENT-001`, `RECOVERY-BORN-482-REPAIR-SETTLEMENT-001` | — | Logical task lineage has one causal settlement authority across original, FIX and XFIX attempts |
| 3283 | `RECOVERY-BORN-488-DEPENDENCY-AUTHORITY-001` | VERIFY | P0 | KERNEL | `RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001`, `SCHEDULER-001`, `PROMPT-001` | — | Scheduler admission and worker prompt consume one aggregate dependency settlement |
| 3284 | `RECOVERY-BORN-488-REPAIR-DISPATCH-001` | OPEN | P0 | KERNEL | `RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001`, `RECOVERY-BORN-488-DEPENDENCY-AUTHORITY-001`, `RECOVERY-BORN-486-EXECUTE-FIX-QUIESCENCE-001` | — | Every admitted repair enters one durable runnable queue and is dispatched before quiescence |
| 3285 | `RECOVERY-BORN-488-LANDING-CHECKPOINT-001` | OPEN | P0 | KERNEL | `RECOVERY-BORN-487-LANDING-PROPOSAL-WRITER-001`, `BUDGET-CONTINUATION-001`, `RESULT-RECONCILIATION-001` | — | Host-owned structured landing checkpoint follows every material attempt mutation |
| 3286 | `RECOVERY-BORN-488-CONTINUOUS-REFILL-001` | OPEN | P0 | KERNEL | `RECOVERY-BORN-488-REPAIR-DISPATCH-001`, `SCHEDULER-001`, `RECOVERY-BORN-483-PROVIDER-CONCURRENCY-001` | — | Free execution capacity refills from the whole run graph after every settlement |
| 3287 | `RECOVERY-BORN-488-VERIFICATION-ISOLATION-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-487-CONCURRENT-TYPECHECK-001`, `RECOVERY-BORN-486-SCOPED-SELF-AUDIT-001`, `PRODUCTION-WIRING-AUTHORITY-001` | — | Attempt verification is isolated from unrelated concurrent workspace mutations |
| 3288 | `RECOVERY-BORN-488-REPAIR-CAPABILITY-001` | OPEN | P0 | KERNEL | `RECOVERY-BORN-488-REPAIR-DISPATCH-001`, `PRODUCTION-WIRING-AUTHORITY-001`, `ROUTING-V3-CUTOVER-001` | — | Repair routing binds write capability, scope closure and fresh-eyes policy without contradiction |
| 3289 | `RECOVERY-BORN-488-EVALUATION-TRUTH-001` | OPEN | P0 | EVAL | `RECOVERY-BORN-488-DEPENDENCY-AUTHORITY-001`, `RECOVERY-BORN-488-VERIFICATION-ISOLATION-001`, `RECOVERY-BORN-483-EVALUATION-HONESTY-001`, `PRODUCTION-WIRING-AUTHORITY-001` | — | Evaluation separates product defect from execution, authority, dependency and ambient verification failures |
| 3290 | `RECOVERY-BORN-488-RECOVERY-TERMINAL-001` | VERIFY | P0 | KERNEL | `PAUSED-FINALIZE-001`, `RECOVERY-BORN-487-FINALIZER-RECEIPT-HOLD-001`, `RUN-STATUS-AUTHORITY-001`, `RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001` | — | Resume and force-finalize publish truthful terminal or resumable operator outcomes |
| 3291 | `RECOVERY-BORN-488-STATUS-PROJECTION-001` | VERIFY | P0 | KERNEL | `RUN-STATUS-AUTHORITY-001`, `RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001`, `RECOVERY-BORN-488-RECOVERY-TERMINAL-001`, `RECOVERY-BORN-487-POST-SETTLEMENT-BINARY-001` | — | Every surface and metric projects one persisted logical run read model |
| 3295 | `RECOVERY-BORN-490-DESCENDANT-CANCELLATION-001` | OPEN | P0 | KERNEL | `SCHEDULER-001` | — | Successful lineage settlement cancels every not-yet-started redundant repair descendant |
| 3296 | `RECOVERY-BORN-490-PROVIDER-OBSERVATION-001` | OPEN | P1 | KERNEL | `PROVIDER-HOLD-001`, `RUN-STATUS-AUTHORITY-001` | — | Terminal retirement closes or scopes historical provider execution intervals |
| 3297 | `RECOVERY-BORN-490-CONTROLLER-TEST-CONTRACT-001` | OPEN | P1 | ASSURANCE | `RESULT-RECONCILIATION-001`, `RUN-STATUS-AUTHORITY-001` | — | Legacy monolithic controller fixtures satisfy fail-closed terminal and atomic status contracts |
| 3298 | `RECOVERY-BORN-490-SPRINT-LOG-PROJECTION-001` | OPEN | P1 | OBS | `RECOVERY-BORN-488-RECOVERY-TERMINAL-001`, `RECOVERY-BORN-490-TERMINALIZATION-EVENTS-001` | — | Human sprint log projects receipt-backed terminal COMPLETE and ABORTED truth exactly once |
| 3299 | `RECOVERY-BORN-490-REPLAY-CERTIFICATION-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-490-DESCENDANT-CANCELLATION-001`, `RECOVERY-BORN-490-PROVIDER-OBSERVATION-001`, `RECOVERY-BORN-490-CONTROLLER-TEST-CONTRACT-001`, `RECOVERY-BORN-490-SPRINT-LOG-PROJECTION-001` | — | Recovery replay ladder certifies isolated failure classes before publish planning resumes |
| 3300 | `RECOVERY-BORN-490-BUILD-DIGEST-GATE-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-487-POST-SETTLEMENT-BINARY-001`, `RECOVERY-BORN-490-SPRINT-LOG-PROJECTION-001` | — | Settled source is built once and source/dist identity is proven before binary replay |
| 3301 | `RECOVERY-BORN-490-NOT-DISPATCHED-SKIPPED-REPLAY-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-490-BUILD-DIGEST-GATE-001`, `RECOVERY-BORN-490-PRE-DISPATCH-SETTLEMENT-001` | — | Synthetic NOT_DISPATCHED and dependency SKIPPED states reach truthful terminal settlement |
| 3302 | `RECOVERY-BORN-490-LANDING-CHECKPOINT-REPLAY-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-490-BUILD-DIGEST-GATE-001`, `RECOVERY-BORN-488-LANDING-CHECKPOINT-001`, `RECOVERY-BORN-488-REPAIR-DISPATCH-001` | — | Sprint-488 landing and checkpoint defect classes recover through production authority |
| 3303 | `RECOVERY-BORN-490-MULTI-PROVIDER-REPLAY-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-490-BUILD-DIGEST-GATE-001`, `RECOVERY-BORN-490-PROVIDER-OBSERVATION-001` | — | Multi-provider smoke proves config-resolved routing, auth isolation and provider observation retirement |
| 3304 | `RECOVERY-BORN-490-FULL-SUITE-CERTIFICATION-001` | OPEN | P0 | ASSURANCE | `RECOVERY-BORN-490-NOT-DISPATCHED-SKIPPED-REPLAY-001`, `RECOVERY-BORN-490-LANDING-CHECKPOINT-REPLAY-001`, `RECOVERY-BORN-490-MULTI-PROVIDER-REPLAY-001` | — | One explicit full-suite run certifies the completed recovery train after all narrower gates |
| 3305 | `LIFECYCLE-VOCAB-001` | OPEN | P1 | KERNEL | — | — | Canonical lifecycle phase vocabulary'si tek: enum, controller event'leri, doküman ve terminal projection aynı listeyi gösterir |
| 3306 | `RECOVERY-NATIVE-PLATFORM-MATRIX-001` | OPEN | P2 | KERNEL | — | — | Recovery/finalize/status zincirinin native platform matrisi: Windows-native + macOS + namespace izolasyonu + Desktop/HA parity |
| 3307 | `RECOVERY-LIVE-CONTINUATION-PROOF-001` | OPEN | P2 | KERNEL | — | — | Canlı devam-kanıtları: fresh genuinely-PAUSED continuation, non-Sprint adapter'lar ve shared-digest'in tüm modlarda/ortamlarda kanıtı |
| 3310 | `SKILL-DURABILITY-001` | OPEN | P0 | KERNEL | — | — | PLAN'da üretilen skill FIX turlarında kaybolmaz: generated-skill durability |
| 3315 | `PROD-SPAWNSYNC-ASYNC-001` | OPEN | P1 | KERNEL | — | — | Worker-dispatch hot-path'indeki 4 senkron git çağrısı async'e taşınır ve spawnsync ratchet'inden düşürülür |
| 3320 | `BOT-LIFECYCLE-HONESTY-001` | OPEN | P1 | KERNEL | — | — | Bot daemon lifecycle dürüstlüğü: recovery-sınıfı stop komutları identity-guard'a takılmaz, SIGTERM pid dosyasını temizler |
| 3325 | `CLEAN-DASHBOARD-POLICY-001` | OPEN | P1 | ASSURANCE | — | — | `clean`'in dashboard-koru policy'si ile `build:dashboard`'ın boş-çıktı beklentisi tek kararda uzlaşır |
| 3343 | `PLATFORM-CLEAN-IDENTITY-ADAPTER-001` | OPEN | P1 | KERNEL | — | — | identity-stable delete adapter'ı Linux-only (/proc/self/fd + fdinfo mnt_id): macOS ve Windows'ta clean.mjs dürüst HOLD (E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED) — cross-platform-e2e'nin TÜM macos/windows job'ları npm run clean'de düşüyor (08-03'ten beri 40/40 kırmızı aile) |
| 3345 | `COMPOSITE-WORKER-001` | OPEN | P1 | KERNEL | `KERNEL-ATTEMPT-001` | — | Composite worker / nested team delegasyon kontratı: parent-child execution, authority tavanı, bütçe tavanı, concurrency limiti, completion/failure policy ve nested evidence tree |
| 3347 | `PLATFORM-EXEC-AUTH-W3-DARWIN-001` | OPEN | P1 | KERNEL | `PLATFORM-EXEC-AUTH-W1-INTERFACE-001`, `PLATFORM-EXEC-AUTH-W2-PROBE-001` | — | Darwin execution-authority adapter'ı: native openat-ailesi N-API modülü + W1 arayüzünün darwin impl'i + gerçek-Mac real-binary clean/lock kanıtı (W2 ölçümü: /dev/fd yolu ölü — native tek yol) |
| 4000 | `AUTHORITY-001` | OPEN | P0 | AUTHORITY | `SSOT-003` | — | Unified runtime authority parent |
| 4010 | `PRINCIPAL-001` | VERIFY | P0 | AUTHORITY | `SSOT-003` | — | VerifiedPrincipal across local, OIDC, workload and connector identities |
| 4020 | `TENANT-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001` | — | Canonical tenant/project/session scope enforcement |
| 4030 | `OPERATION-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001` | — | Versioned canonical operation catalog |
| 4040 | `CAPABILITY-001` | OPEN | P0 | AUTHORITY | `OPERATION-001`, `PRINCIPAL-001` | — | Capability authority and progressive disclosure contract |
| 4050 | `APPROVAL-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001`, `TENANT-001`, `OPERATION-001`, `CAPABILITY-001` | — | Runtime-wide durable ApprovalBroker |
| 4052 | `APPROVAL-READ-CROSSPLATFORM-PROOF-001` | OPEN | P2 | AUTHORITY | `APPROVAL-READ-PURITY-001` | — | Approval read-purity'nin cross-platform real-binary kanıtı |
| 4060 | `TOOL-AUTHORITY-001` | OPEN | P0 | AUTHORITY | `CAPABILITY-001`, `APPROVAL-001` | — | Task/operation-scoped tool and MCP allowlist |
| 4070 | `RECEIPT-001` | OPEN | P0 | AUTHORITY | `PRINCIPAL-001`, `TENANT-001` | — | Immutable InvocationReceipt for every provider call |
| 4080 | `REACHABILITY-001` | OPEN | P0 | AUTHORITY | `RECEIPT-001` | — | Capability and account-scoped reachability truth |
| 4090 | `LIMIT-001` | OPEN | P0 | AUTHORITY | `RECEIPT-001`, `REACHABILITY-001` | — | Unified provider/account/tenant/project budget and limit ledger |
| 4091 | `LIMIT-SPEND-ENFORCE-001` | OPEN | P1 | AUTHORITY | — | — | Kümülatif günlük/aylık harcama tavanı gerçek enforcement'a bağlanır: `enforce_spend_gate` semantiği ya typed hard-block (`COST_GATE_EXCEEDED`) üretir ya key dürüst şekilde yeniden adlandırılır |
| 4100 | `PROVIDER-INGRESS-001` | BLOCKED | P0 | AUTHORITY | `RECEIPT-001`, `REACHABILITY-001`, `LIMIT-001` | `PROVIDER_INGRESS_HOLD` | Provider authority composition for all production ingress |
| 4101 | `PROVIDER-HOLD-001` | VERIFY | P0 | AUTHORITY | `LIMIT-001` | — | Provider-scoped execution holds are independent from task and USD budget exhaustion |
| 4102 | `PROVIDER-HOLD-LIVE-PROOF-001` | OPEN | P2 | AUTHORITY | `PROVIDER-HOLD-001` | — | Provider-hold'un canlı kanıtları: login-recovery, mixed-provider continuation, expiry ve authoritative usage-source |
| 4110 | `ATTENDED-STOP-001` | OPEN | P0 | AUTHORITY | `APPROVAL-001`, `LIMIT-001` | — | Exact attended hard-stop approval authority |
| 4120 | `AUDIT-001` | OPEN | P0 | AUTHORITY | `RECEIPT-001`, `OPERATION-001` | — | Tamper-evident, tenant-scoped causal audit |
| 4130 | `API-SECURITY-001` | BLOCKED | P0 | AUTHORITY | `PRINCIPAL-001`, `TENANT-001`, `APPROVAL-001` | `DEPENDENCY_UNSATISFIED` | API authentication, authorization and config-secret containment |
| 4140 | `ENTERPRISE-AUTH-001` | OPEN | P0 | AUTHORITY | `TENANT-001`, `CAPABILITY-001`, `APPROVAL-001`, `AUDIT-001` | — | Community-safe and enterprise fail-closed profiles |
| 4150 | `ALP-RUNTIME-001` | OPEN | P1 | AUTHORITY | `OPERATION-001`, `APPROVAL-001` | — | Alp Discipline decision anchor in runtime agents and planners |
| 4160 | `MCP-LEASE-001` | VERIFY | P1 | AUTHORITY | `PRINCIPAL-001`, `OPERATION-001` | — | Multi-window MCP writer lease and authority-safe read/write split |
| 4170 | `APPROVAL-QOL-001` | BLOCKED | P1 | AUTHORITY | `APPROVAL-001`, `MCP-LEASE-001` | `DEPENDENCY_UNSATISFIED` | Approval classifier, cross-process expiry and notification dedupe closure |
| 4180 | `TRUST-HANDOFF-001` | OPEN | P1 | AUTHORITY | `TOOL-AUTHORITY-001`, `AUDIT-001` | — | Agent-çıktısından host-etkisine güven-aktarım zinciri: out-of-band telemetry, monitoring-loss=authority-suspension, egress gateway, Docker-socket default-deny, agent-üretimi dosya provenance'ı ve execution-capable config-mutation admission'ı |
| 4190 | `SEC-OWASP-ASI-001` | OPEN | P1 | AUTHORITY | — | — | OWASP Agentic Top 10 (ASI01–ASI10, 2026) öz-değerlendirme baseline'ı: her ASI riski için mevcut mekanizma → enforcement sınıfı (ENFORCED/ADVISORY/CONFIG-GATED/UNWIRED) haritası, gap register ve ilgili ledger satırlarına kanıt-bağlaması |
| 4200 | `SEC-ENFORCE-WIRE-001` | OPEN | P1 | AUTHORITY | — | — | Unwired/inert enforcement envanterinin tipli disposition'ı: yazılmış-ama-devrede-olmayan her güvenlik modülü wire-or-retire kararına bağlanır, sessiz-ölü enforcement kodu kalmaz |
| 5000 | `TERMINAL-001` | BLOCKED | P0 | TERMINAL | `KERNEL-001`, `AUTHORITY-001` | `DEPENDENCY_UNSATISFIED` | Terminal as canonical management and usage surface |
| 5010 | `TERMINAL-TOOLS-001` | OPEN | P0 | TERMINAL | `TOOL-AUTHORITY-001`, `SURFACE-CUTOVER-001` | — | Role-model tool surface and progressive disclosure |
| 5020 | `TERMINAL-DEV-001` | OPEN | P0 | TERMINAL | `DO-CUTOVER-001`, `TERMINAL-TOOLS-001` | — | Full codebase development loop inside Deckent terminal |
| 5030 | `TERMINAL-LIVE-001` | OPEN | P0 | TERMINAL | `WORKER-REGISTRY-001`, `KERNEL-SETTLEMENT-001` | — | Live Worker explanations, logs, progress and drill-down |
| 5040 | `TERMINAL-REPL-001` | OPEN | P1 | TERMINAL | `TERMINAL-LIVE-001` | — | REPL cursor, queue, streaming, cancellation and context stability |
| 5050 | `TERMINAL-REF-001` | OPEN | P1 | TERMINAL | `TERMINAL-TOOLS-001` | — | `@` references for files, resources, agents and skills |
| 5060 | `TERMINAL-ONBOARD-001` | OPEN | P1 | TERMINAL | `CM-01`, `PRINCIPAL-001` | — | Conversational setup, doctor and capability discovery |
| 5070 | `TERMINAL-AUTH-001` | BLOCKED | P0 | TERMINAL | `P02-635`, `P02-644` | `DEPENDENCY_UNSATISFIED` | Provider login/session binding and real auth probes |
| 5080 | `NATIVE-DEV-001` | BLOCKED | P1 | TERMINAL | `TERMINAL-DEV-001`, `DESKTOP-001` | `DEPENDENCY_UNSATISFIED` | Deckent terminal plus Desktop as Deckent's own primary development environment |
| 5090 | `TERMINAL-XPLAT-001` | OPEN | P1 | TERMINAL | `TERMINAL-REPL-001`, `ENV-ADAPTER-001` | — | Native terminal platform and accessibility certification |
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
| 6121 | `STATUS-SURFACE-PARITY-001` | VERIFY | P0 | PRODUCT | `RUN-STATUS-AUTHORITY-001` | — | CLI and MCP consume the same canonical sprint status projection |
| 6130 | `API-EVENT-001` | OPEN | P0 | API | `API-CONTRACT-001`, `KERNEL-SETTLEMENT-001`, `STORAGE-001` | — | Durable asynchronous jobs, event streams, webhooks and outbox delivery |
| 6140 | `API-DEVELOPER-001` | OPEN | P1 | API | `API-CONTRACT-001`, `SURFACE-PARITY-001` | — | OpenAPI, generated SDKs, CLI/MCP parity and compatibility lifecycle |
| 6150 | `API-OPERATIONS-001` | OPEN | P1 | API | `API-IDENTITY-001`, `LIMIT-001`, `API-EVENT-001` | — | Quotas, pagination, bulk operations, idempotency and regional operations |
| 6160 | `SURFACE-ADAPTER-001` | OPEN | P1 | PRODUCT | `APP-SERVICE-001`, `SURFACE-CONTRACT-001`, `CAPABILITY-001` | — | Web, mobile, voice, chat, IDE, CI and ERP thin-adapter expansion |
| 6165 | `DESKTOP-CUSTOMIZE-001` | OPEN | P1 | DESKTOP | `DESKTOP-REBORN-001` | — | User-facing interface personalization: theme/watch, font set and accent selection in the Desktop settings scene |
| 6170 | `DESIGN-SYSTEM-001` | OPEN | P1 | PRODUCT | — | — | Three-surface Deckent Design System (terminal, dashboard, desktop) with NOVA-core identity |
| 6180 | `ERP-AGENT-CONTRACT-001` | OPEN | P2 | CONNECTOR | — | — | Enterprise Application Agent Contract: ERP/iş-uygulaması agent'larına (Oracle AI Agent Studio, Fusion/NetSuite sınıfı) karşı discover_capabilities / invoke / stream_status / request_approval / commit_transaction / cancel / compensate_or_rollback / collect_audit sözleşmesi |
| 7000 | `ECOSYSTEM-001` | OPEN | P0 | ECOSYSTEM | `P02-647`, `SURFACE-CUTOVER-001`, `CAPABILITY-001`, `AUDIT-001` | — | Governed agent, skill, plugin, tool, MCP and extension ecosystem |
| 7010 | `AGENT-SKILL-001` | OPEN | P1 | ECOSYSTEM | `CAPABILITY-001` | — | Role/capability-complete agent and skill catalog |
| 7020 | `SUPPLY-CHAIN-001` | OPEN | P0 | SECURITY | `AGENT-SKILL-001`, `P02-650` | — | Signed agent, skill and plugin provenance |
| 7030 | `PLUGIN-SANDBOX-001` | OPEN | P0 | SECURITY | `SUPPLY-CHAIN-001`, `TOOL-AUTHORITY-001` | — | Plugin/skill runtime sandbox and capability enforcement |
| 7031 | `PLUGIN-SANDBOX-WIRE-001` | OPEN | P0 | SECURITY | — | — | Sprint yolundaki plugin-hook güvenlik kablolaması: `validatePluginSecurity` 4-adım pipeline'ı (allowed-path containment + AST tarama + SHA-256 integrity + Ed25519 publisher imzası) production `loadPluginHooks` çağrısına bağlanır ve `PluginSecurityError` fail-closed olur |
| 7040 | `MCP-TRUST-001` | OPEN | P0 | SECURITY | `PRINCIPAL-001`, `CAPABILITY-001`, `SUPPLY-CHAIN-001` | — | Outgoing MCP trust, identity and data-boundary authority |
| 7050 | `HUB-001` | BLOCKED | P1 | ECOSYSTEM | `SUPPLY-CHAIN-001`, `PLUGIN-SANDBOX-001` | `OWNER_DECISION_REQUIRED` | Production-ready Deckent Hub and signed distribution |
| 7060 | `TOOL-COMPUTER-001` | OPEN | P2 | TOOL | `TOOL-AUTHORITY-001`, `PLUGIN-SANDBOX-001` | — | Optional computer-use/browser automation pack |
| 7070 | `PROVIDER-EXTENSION-001` | OPEN | P1 | PROVIDER | `P02-637`, `P02-646`, `P02-647` | — | OpenRouter and future provider extensions through PAEP |
| 7080 | `IDE-ADAPTER-001` | OPEN | P2 | SURFACE | `APP-SERVICE-001`, `SURFACE-CONTRACT-001` | — | VS Code, JetBrains and future IDE adapters as non-canonical clients |
| 7090 | `ORPHAN-WIRE-001` | BLOCKED | P0 | TRUTH | `REPO-CLEANUP-001`, `SURFACE-CUTOVER-001` | `DEPENDENCY_UNSATISFIED` | Production import graph orphan disposition and wiring |
| 7100 | `DEP-SUPPLY-DEFENSE-001` | OPEN | P1 | SECURITY | — | — | npm dependency supply-chain savunmasını ürün özelliği olarak değerlendir: worker/CI install yollarında install-script guard, lockfile-integrity gate, bilinen-IOC taraması ve editör-hook (workspace-trust) koruması |
| 7110 | `A2A-INTEROP-001` | OPEN | P2 | ECOSYSTEM | — | — | A2A v1.0 interop yönü: inbound A2A server (Agent Card + task-lifecycle projection) ve outbound A2A provider adapter için owner kararı ve plan admission |
| 7120 | `SKILLMD-INGEST-001` | OPEN | P1 | ECOSYSTEM | — | — | Anthropic Agent-Skills (SKILL.md) open-standard ingest: `deckent skill import --format=skill-md` converter, typed `source` provenance ve frontmatter parser sertleştirmesi |
| 7130 | `AGENT-RUNTIME-ADAPTER-001` | OPEN | P2 | PROVIDER | `COMPOSITE-WORKER-001` | — | Harici agent-runtime adapter ailesi değerlendirmesi: generic ACP worker adapter + Hermes/OpenClaw/Codex-remote/ADK sınıfı runtime'ların governed composite worker olarak admission'ı |
| 8000 | `EVERY-ENV-001` | OPEN | P0 | XPLAT | `SSOT-003`, `TEST-PLATFORM-001` | — | Every-environment architecture and release parent |
| 8010 | `ENV-ADAPTER-001` | OPEN | P0 | XPLAT | `KERNEL-001`, `AUTHORITY-001` | — | PlatformAdapter contracts for process, paths, locks, IPC, credentials, terminal and services |
| 8020 | `INSTALL-SCOPE-001` | OPEN | P0 | ONBOARDING | `ENV-ADAPTER-001`, `MEMORY-AUTHORITY-001` | — | Global install plus project-scoped state and learning |
| 8030 | `PLATFORM-PROOF-001` | OPEN | P0 | XPLAT | `ENV-ADAPTER-001`, `TEST-PLATFORM-001` | — | Cross-platform CI, real-binary and hardware/OS certification |
| 8040 | `PACKAGING-001` | OPEN | P0 | RELEASE | `INSTALL-SCOPE-001`, `SUPPLY-CHAIN-001` | — | CLI, daemon, Desktop, service and container packaging supply chain |
| 8050 | `DOCS-PRODUCT-001` | BLOCKED | P0 | DOCS | `DOCS-ADR-SYNC-001`, `DOCS-I18N-001`, `SURFACE-PARITY-001` | `DEPENDENCY_UNSATISFIED` | Current code-truth architecture, guide, reference and operations docs |
| 8060 | `RELEASE-001` | BLOCKED | P0 | RELEASE | `TRUTH-BASELINE-001`, `PLATFORM-PROOF-001`, `PACKAGING-001`, `DOCS-PRODUCT-001` | `DEPENDENCY_UNSATISFIED` | Unified validate, soak, publish and rollback gate |
| 8070 | `REPO-MIGRATION-001` | OPEN | P0 | REPO | `REPO-CLEANUP-APPLY-001`, `DOCS-TOPOLOGY-001`, `MEMORY-AUTHORITY-001` | — | Rebaseline and execute repository cutover |
| 8080 | `OPERATIONS-PACK-001` | OPEN | P1 | OPS | `PACKAGING-001`, `STATE-RETENTION-001`, `AUDIT-001` | — | Install, backup, restore, diagnostics, support bundle and disaster recovery |
| 8090 | `RELEASE-BETA-001` | OPEN | P0 | RELEASE | `REPO-MIGRATION-001`, `NPM-CHANNEL-001`, `DOCS-TRUTH-PASS-001` | — | Owner-approved scoped beta gate: public repo flip plus npm beta channel ahead of RELEASE-001 GA |
| 8091 | `NPM-CHANNEL-001` | OPEN | P0 | RELEASE | — | — | npm name reservation and beta dist-tag channel under owner-manual publish |
| 8092 | `DOCS-TRUTH-PASS-001` | OPEN | P0 | DOCS | — | — | Beta-scope public README and top-level docs reality pass from current code truth |
| 8093 | `LAUNCH-COMMS-001` | OPEN | P1 | PRODUCT | `RELEASE-BETA-001` | — | Launch communications, demo assets and recurring social cadence |
| 8095 | `DOCS-VISION-002` | OPEN | P1 | DOCS | — | — | 2026-08 rekabet-sentezi vision amendment: hyperscaler control-plane tavanı, provider+runtime bağımsızlığı, recursive delegasyon cümlesi ve iki yeni non-goal (identity provider değil; başka bir agent runtime değil), en+tr paritesiyle |
| 9000 | `LEARNING-001` | OPEN | P0 | LEARNING | `KERNEL-001`, `AUDIT-001` | — | Closed, governed learning and evolution parent |
| 9010 | `TRAINING-TRACE-001` | OPEN | P0 | LEARNING | `KERNEL-SETTLEMENT-001`, `RECEIPT-001` | — | Training trace wired from attempt to accepted outcome |
| 9020 | `PROMPT-001` | OPEN | P0 | PROMPT | `KERNEL-ONTOLOGY-001`, `ALP-RUNTIME-001` | — | Compiled prompt contract and conflict-free task instructions |
| 9022 | `PROMPT-V3-GOLDEN-EVAL-001` | OPEN | P2 | PROMPT | `PROMPT-V3-001` | — | Prompt V3 golden-eval: temsilî on-task değerlendirmesi, gerçek heterojen worker'lar, cost/quality eşikleri |
| 9030 | `ROUTING-001` | OPEN | P0 | ROUTING | `PROMPT-001`, `AGENT-SKILL-001`, `REACHABILITY-001` | — | Routing V3 quality, diversity and evidence-driven adaptation |
| 9032 | `ROUTING-V3-LIVE-QUALITY-001` | OPEN | P2 | ROUTING | `ROUTING-V3-CUTOVER-001` | — | Routing V3 canlı kalite kanıtları: heterojen routing kalitesi, anti-collapse dağılım, rollback provası, cross-platform |
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
| 10070 | `ENTERPRISE-MODULARITY-001` | OPEN | P1 | ENTERPRISE | `ENTERPRISE-AUTH-001`, `STORAGE-001` | — | Solo/community/enterprise module boundaries without core forks |
| 10080 | `ASSURANCE-PACK-001` | OPEN | P0 | ASSURANCE | `DATA-GOV-001`, `LOAD-CHAOS-001`, `P02-655` | — | Security, privacy, reliability, performance and compliance evidence pack |
