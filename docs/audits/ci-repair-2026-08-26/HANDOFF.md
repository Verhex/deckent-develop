# CI Repair + Test Slim Faz-B Handoff — 2026-08-26

## Sonuç

Owner-onaylı test-slim paketi ve CI-R001/F1–F5 test onarımları tamamlandı. Fiziksel test
korpusu `2.923 → 2.859`, wire ailesi `117 → 78` oldu. Merge equality denetimi
`57/57 PASS`: `1.305` test title/registration ve `2.915` structural assertion
fingerprint'i, import modülleri ve mock-factory yüzeyi korunmuştur.

Teslim durumu dürüstçe `HOLD_ADMISSION`dır. Exact local full-suite ve coverage koşuları,
approved F1–F5 dışında kalan ortak runtime-write-guard secure-open kökünde kırmızıdır;
coverage ölçümü yine de lines/functions/branches floor'larının üçünü de geçmiştir;
`npm run lint` ise allowlist dışındaki stale canonical ratchet'larda durur. Bu lane
production `src/**` veya canonical gate scriptlerine taşmamıştır. Branch review/admission
için push edilir, fakat ana-şerit bu HOLD'ları kapatmadan landing-green sayılamaz.

<!-- HANDOFF-JSON
{
  "schemaVersion": 2,
  "receiptId": "ci-repair-test-slim-phase-b-2026-08-26-v1",
  "lane": "lane/ci-repair-20260826",
  "baseSha": "567ecaf887891099dfc8c79989dc580a80870b25",
  "phase": "B",
  "phaseBLease": "ACTIVE",
  "deliveryStatus": "HOLD_ADMISSION",
  "writeAllowlist": [
    "tests/**",
    "vitest.config.ts",
    "scripts/security/secret-baseline.mjs",
    "docs/audits/ci-repair-2026-08-26/**",
    "LANE-STATUS.md"
  ],
  "testInventory": {
    "before": 2923,
    "after": 2859,
    "netReduction": 64,
    "physicalSourcesRetired": 66,
    "newCanonicalTargets": 2,
    "defaultBefore": 2840,
    "defaultAfter": 2777,
    "dashboardBefore": 83,
    "dashboardAfter": 82,
    "wireBefore": 117,
    "wireAfter": 78,
    "staticCallsBefore": 37791,
    "staticCallsAfter": 37733
  },
  "mergeEquality": "57/57 PASS",
  "mergeTitles": "1305/1305",
  "mergeAssertions": "2915/2915",
  "secretScan": "PASS",
  "fullSuite": "FAIL_13_FILES_118_TESTS_3_ERRORS",
  "coverage": "THRESHOLDS_PASS_COMMAND_FAIL_103_TESTS",
  "coverageTotals": {
    "lines": "86.52% >= 82%",
    "functions": "95.22% >= 89%",
    "branches": "83.77% >= 80%"
  },
  "lint": "HOLD_STALE_CANONICAL_RATCHETS",
  "srcFilesChanged": 0,
  "admissionAuthority": "main-lane"
}
HANDOFF-JSON -->

## Sayısal sonuç

| Alan | Önce | Sonra | Delta / kanıt |
|---|---:|---:|---|
| Fiziksel test dosyası | 2.923 | 2.859 | `−64 / −%2,19` |
| Default Vitest dosyası | 2.840 | 2.777 | `−63` |
| Dashboard dosyası | 83 | 82 | `−1` |
| Test satırı | 718.051 | 716.502 | `−1.549` |
| Statik `it/test` call | 37.791 | 37.733 | `−58`; merge assertion düşüşü yok |
| Wire dosyası | 117 | 78 | `−39 / −%33,33` |
| Wire registration | 1.038 | 1.038 | title+mode multiset eşit |
| Wire scoped süre | 44,71 sn | 34,57 sn | `−10,14 sn / −%22,68` |
| F4 provider observations | 45,81 sn | 11,89 sn | `−33,92 sn / −%74,0` |

Fiziksel olarak `66` source kaldırılıp `2` yeni canonical target oluşturulduğu için net
delta `−64`dür. Default same-layer kümesi `34 dosya / 656 pass → 17 dosya / 656 pass`;
Dashboard kümesi ayrı config altında `2/14 → 1/14` PASS oldu. Merge title manifest'i
`active/skip/skipIf/todo` mode'unu da içerdiğinden her modülün before/after pass-skip
registration semantiği aynıdır.

## TSR-001..007: emeklilik ve assertion taşıma kanıtı

| ID | Kaldırılan kaynak | Canlı kapsama / hedef:assertion | Risk kapanışı |
|---|---|---|---|
| TSR-001 | `tests/docs/vitepress.test.ts` | 38/38 declaration zaten `describe.skip`; current topology `tests/docs/docs-structure.test.ts`, generated reference `tests/docs/cli-reference.test.ts`, link gate `scripts/lint-links.mjs`. | Src coverage üretmeyen retired VitePress topology; raw retire owner-onaylı. |
| TSR-002 | `tests/docs/readme-quality.test.ts` | 5/5 skip; README truth `tests/docs/readme-number-truth.test.ts`, quickstart `tests/docs/quickstart.test.ts`, links `scripts/lint-links.mjs`. | Archived frozen copy; aktif assertion yok. |
| TSR-003 | `tests/docs/no-stale-identity-refs.test.ts` | `tests/docs/cli-reference.test.ts: rejects the retired project-identity path and preserves the current identity authority` — EN/TR generated docs'ta `PROJECT-IDENTITY` yokluğu + current `.deckent/workspace/IDENTITY.md` existence. | Proposal'daki unique negative/current-path niyeti canlı current-authority suite'e taşındı. |
| TSR-004 | `tests/docs/blueprint-current.test.ts` | `tests/docs/doc-honesty.test.ts: keeps current EN/TR vision positioning free of retired anti-X framing` — EN/TR anti-X/anti-Devin negative-space + current independent-execution-plane anchors. | Retired path yerine canonical EN/TR vision ikilisi doğrulanıyor. |
| TSR-005 | `tests/docs/readme.test.ts` | Non-empty/existence `tests/docs/docs-structure.test.ts`; `tests/docs/readme-number-truth.test.ts: is written in English without Turkish section headings` dört exact negative heading assertion'ını taşır. 11 archived skip declaration owner kararıyla emekli. | İki aktif davranış canlı; skipped frozen content current sözleşme diye yeniden yazılmadı. |
| TSR-006 | `tests/core/config-sprint063.test.ts` | `tests/core/config-migration.test.ts` içindeki `TSR-006` segmenti: migration/loadConfig + enum error-format title/assertion'larının tamamı fiziksel taşındı. | TSR-006/007 group: `3 dosya / 72 test / 210 assertion → 1 / 72 / 210`. |
| TSR-007 | `tests/core/config-sprint064.test.ts` | `tests/core/config-migration.test.ts` içindeki `TSR-007` segmenti: needsMigration, file migration/backup, dry-run, value preservation ve enum error-format assertion'larının tamamı fiziksel taşındı. | Aynı group equality; assertion zayıflatma yok. |

## TSM-001..018: source → canonical target

Her satırda title + assertion structural multiset, import module set ve mock-factory
export yüzeyi `PASS`tir. TSM-009/014 iki eski source'tan yeni canonical dosya üretir;
diğer satırlar tek source'u mevcut target'a fiziksel birleştirir.

| ID | Kaldırılan source | Canonical target | Test | Assertion | Equality |
|---|---|---|---:|---:|---|
| TSM-001 | `tests/cli/chat.test.ts` | `tests/cli/commands/chat.test.ts` | 19→19 | 70→70 | PASS |
| TSM-002 | `tests/cli/chat-native.test.ts` | `tests/cli/commands/chat-native.test.ts` | 19→19 | 39→39 | PASS |
| TSM-003 | `tests/cli/chat-slash-registry.test.ts` | `tests/cli/commands/chat-slash-registry.test.ts` | 39→39 | 85→85 | PASS |
| TSM-004 | `tests/cli/dashboard.test.ts` | `tests/cli/commands/dashboard.test.ts` | 30→30 | 56→56 | PASS |
| TSM-005 | `tests/cli/error-handler.test.ts` | `tests/cli/helpers/error-handler.test.ts` | 27→27 | 49→49 | PASS |
| TSM-006 | `tests/cli/messages.test.ts` | `tests/cli/helpers/messages.test.ts` | 134→134 | 228→228 | PASS |
| TSM-007 | `tests/cli/native-transport.test.ts` | `tests/cli/repl/native-transport.test.ts` | 13→13 | 46→46 | PASS |
| TSM-008 | `tests/cli/onboard.test.ts` | `tests/cli/commands/onboard.test.ts` | 31→31 | 41→41 | PASS |
| TSM-009 | `tests/cli/commands/output.test.ts` + `tests/cli/helpers/output.test.ts` | `tests/cli/output.test.ts` | 89→89 | 134→134 | PASS |
| TSM-010 | `tests/cli/recall.test.ts` | `tests/cli/commands/recall.test.ts` | 14→14 | 24→24 | PASS |
| TSM-011 | `tests/cli/splash.test.ts` | `tests/cli/helpers/splash.test.ts` | 14→14 | 17→17 | PASS |
| TSM-012 | `tests/cli/sprint-summary-rich.test.ts` | `tests/cli/helpers/sprint-summary-rich.test.ts` | 45→45 | 106→106 | PASS |
| TSM-013 | `tests/dashboard/terminal/terminal-api.test.ts` | `tests/dashboard/terminal-api.test.ts` | 14→14 | 21→21 | PASS |
| TSM-014 | `tests/mcp/helpers/format.test.ts` + `tests/mcp/tools/format.test.ts` | `tests/mcp/format.test.ts` | 68→68 | 116→116 | PASS |
| TSM-015 | `tests/mcp/help.test.ts` | `tests/mcp/tools/help.test.ts` | 26→26 | 45→45 | PASS |
| TSM-016 | `tests/mcp/job-runner.test.ts` | `tests/mcp/tools/job-runner.test.ts` | 20→20 | 36→36 | PASS |
| TSM-017 | `tests/mcp/resources/resources.test.ts` | `tests/mcp/resources.test.ts` | 48→48 | 92→92 | PASS |
| TSM-018 | `tests/nervous/stale-worker.test.ts` | `tests/nervous/detectors/stale-worker.test.ts` | 9→9 | 22→22 | PASS |

## WIRE-001..039: source → canonical target

Bu `39` satır raw wire sayısını yalnız physical merge ile `117 → 78` indirir.
`PHASE-B-EQUALITY.json` her satır için title+mode, assertion fingerprint, import ve
mock-factory exact checks'ini makine-okunur taşır.

| ID | Kaldırılan source | Canonical target | Test | Assertion | Equality |
|---|---|---|---:|---:|---|
| WIRE-001 | `tests/agents/worker-approval-dispatcher-wire.test.ts` | `tests/agents/worker-approval-gate-real-wire.test.ts` | 20→20 | 40→40 | PASS |
| WIRE-002 | `tests/agents/adaptive-agent-wire.test.ts` | `tests/agents/worker-heartbeat-authority-wire.test.ts` | 13→13 | 35→35 | PASS |
| WIRE-003 | `tests/agents/workergate-wire.test.ts` | `tests/agents/worker-verify-isolation-wire.test.ts` | 21→21 | 37→37 | PASS |
| WIRE-004 | `tests/api/acceptance-confirmation-runtime-wire.test.ts` | `tests/api/approval-lifecycle-runtime-wire.test.ts` | 7→7 | 26→26 | PASS |
| WIRE-005 | `tests/api/approval-history-wire.test.ts` | `tests/api/approval-expiry-wire.test.ts` | 16→16 | 41→41 | PASS |
| WIRE-006 | `tests/api/terminal-config-wire.test.ts` | `tests/api/terminal-audit-wire.test.ts` | 14→14 | 32→32 | PASS |
| WIRE-007 | `tests/api/terminal/server-command-guard-wire.test.ts` | `tests/api/server-tenant-scope-wire.test.ts` | 5→5 | 11→11 | PASS |
| WIRE-008 | `tests/cli/flow-wire.test.ts` | `tests/cli/autonomous-flow-wire.test.ts` | 5→5 | 11→11 | PASS |
| WIRE-009 | `tests/cli/tool-repl-wire.test.ts` | `tests/cli/calltool-exec-wire.test.ts` | 34→34 | 79→79 | PASS |
| WIRE-010 | `tests/cli/native-flag-wire.test.ts` | `tests/cli/help-surface-wire.test.ts` | 29→29 | 65→65 | PASS |
| WIRE-011 | `tests/cli/repl-mcp-wire.test.ts` | `tests/cli/mcp-broker-wire.test.ts` | 27→27 | 95→95 | PASS |
| WIRE-012 | `tests/cli/provider-limits-claude-docker-wire.test.ts` | `tests/cli/provider-limits-authoring-wire.test.ts` | 11→11 | 35→35 | PASS |
| WIRE-013 | `tests/cli/repl-agentic-wire.test.ts` | `tests/cli/repl-agentic-enterprise-wire.test.ts` | 13→13 | 59→59 | PASS |
| WIRE-014 | `tests/cli/repl-status-line-wire.test.ts` | `tests/cli/repl-banner-wire.test.ts` | 11→11 | 16→16 | PASS |
| WIRE-015 | `tests/cli/repl-slash-wire.test.ts` | `tests/cli/repl-do-slash-wire.test.ts` | 9→9 | 25→25 | PASS |
| WIRE-016 | `tests/cli/slash-mode-wire.test.ts` | `tests/cli/repl-slash-registry-wire.test.ts` | 10→10 | 38→38 | PASS |
| WIRE-017 | `tests/cli/repl/app-surface-wire.test.tsx` | `tests/cli/repl-surface-wire.test.tsx` | 36→36 | 89→89 | PASS |
| WIRE-018 | `tests/cli/repl/approval-xproc-wire.test.ts` | `tests/cli/app-approval-wire.test.tsx` | 18→18 | 43→43 | PASS |
| WIRE-019 | `tests/cli/trn2-repl-trace-wire.test.ts` | `tests/cli/trace-wire.test.ts` | 27→27 | 61→61 | PASS |
| WIRE-020 | `tests/connectors/approval-clients-wire-sla.test.ts` | `tests/connectors/approval-clients-wire.test.ts` | 21→21 | 47→47 | PASS |
| WIRE-021 | `tests/connectors/capabilities/bootstrap-wire.test.ts` | `tests/connectors/capabilities/enablement-wire.test.ts` | 11→11 | 18→18 | PASS |
| WIRE-022 | `tests/core/approval-probe-rule-wire.integration.test.ts` | `tests/core/cfg-apr-wire.test.ts` | 21→21 | 42→42 | PASS |
| WIRE-023 | `tests/core/erp-1-readwire.test.ts` | `tests/core/deck-broker-audit-wire.test.ts` | 23→23 | 63→63 | PASS |
| WIRE-024 | `tests/core/notify-wire.test.ts` | `tests/core/hook-dispatch-wire.test.ts` | 24→24 | 56→56 | PASS |
| WIRE-025 | `tests/core/models-dev-wire.test.ts` | `tests/core/provider-concurrency-admission-wire.test.ts` | 16→16 | 38→38 | PASS |
| WIRE-026 | `tests/core/spawn-safety-wire.test.ts` | `tests/core/plugin-sandbox-wire.test.ts` | 30→30 | 68→68 | PASS |
| WIRE-027 | `tests/nervous/panic-gate-wire.test.ts` | `tests/nervous/nervous-apr-wire.test.ts` | 15→15 | 40→40 | PASS |
| WIRE-028 | `tests/orchestra/specialization-drift-wire.test.ts` | `tests/orchestra/adaptive-agent-outcome-wire.test.ts` | 13→13 | 47→47 | PASS |
| WIRE-029 | `tests/orchestra/finalizer-cells-wire.test.ts` | `tests/orchestra/acceptance-all-branches-wire.test.ts` | 8→8 | 33→33 | PASS |
| WIRE-030 | `tests/orchestra/tool-allowlist-wire.test.ts` | `tests/orchestra/allowlist-flag-wire.test.ts` | 18→18 | 38→38 | PASS |
| WIRE-031 | `tests/orchestra/ctx-population-wire.test.ts` | `tests/orchestra/coordination-wire.test.ts` | 12→12 | 24→24 | PASS |
| WIRE-032 | `tests/orchestra/docker-provider-observation-wire.test.ts` | `tests/orchestra/docker-heartbeat-authority-wire.test.ts` | 6→6 | 29→29 | PASS |
| WIRE-033 | `tests/orchestra/handoff-prune-wire.test.ts` | `tests/orchestra/handoff-recovery-wire.test.ts` | 13→13 | 34→34 | PASS |
| WIRE-034 | `tests/orchestra/resource-monitor-wire.test.ts` | `tests/orchestra/metering-live-wire.test.ts` | 23→23 | 56→56 | PASS |
| WIRE-035 | `tests/orchestra/prompt-evolution-wire.test.ts` | `tests/orchestra/prompt-evolution-retro-wire.test.ts` | 15→15 | 53→53 | PASS |
| WIRE-036 | `tests/orchestra/planner-smoke-wire.test.ts` | `tests/orchestra/prompt-rollback-wire.test.ts` | 10→10 | 27→27 | PASS |
| WIRE-037 | `tests/orchestra/sprint-restart-reconcile-wire.test.ts` | `tests/orchestra/scheduler-collision-reorder-wire.test.ts` | 9→9 | 17→17 | PASS |
| WIRE-038 | `tests/orchestra/sprint-terminal-controller-wire.test.ts` | `tests/orchestra/sprint-finalizer-terminal-wire.test.ts` | 19→19 | 75→75 | PASS |
| WIRE-039 | `tests/orchestra/worker-approval-gate-wire.test.ts` | `tests/orchestra/provider-routing-production-wire.test.ts` | 13→13 | 45→45 | PASS |

## CI-R001 ve F1–F5

| ID | Sonuç | Kanıt |
|---|---|---|
| CI-R001 | Secret-benzeri fixture kısaltıldı; classifier/regex/baseline unchanged. | Classifier PASS + Secret Scan PASS. |
| F1 | Fixed host-class budget + typed child IPC; 10K/digest/heap assertions aynı. | Targeted PASS; coverage örneği first 6,11 sn/replay 3,67 sn. |
| F2 | Stats refresh yalnız tmpdir; dört tracked generator target byte-equality pinli. | Targeted PASS. |
| F3 | `r+` temp descriptor + pre-rename fsync exact regression pini. | Targeted PASS. |
| F4 | Supported prebuilt real binary; worker env isolation; bounded timeout. | `12/12 PASS`, `45,81 → 11,89 sn`. |
| F5 | Cursor XDG positive ve credential-unavailable negative capability matrisi. | Docker+probe `46/46 PASS`. |

## Verification ve admission

| Gate | Sonuç | Dürüst yorum |
|---|---|---|
| Equality validator | `57/57 PASS` | 1.305 title + 2.915 assertion; import/mock yüzeyi tam. |
| Secret Scan | `PASS` | 6.873 tracked file; unallowlisted hit yok. |
| Default wire | `76 dosya / 1.038 test PASS` | 34,57 sn; iki Dashboard wire ayrı config'te. |
| Dashboard wire | `2 dosya / 42 test PASS` | Dashboard default dışı gerçeği korundu. |
| F4 real-binary | `12/12 PASS` | CI env ile 11,89 sn. |
| F5 Docker/probe | `46/46 PASS` | Positive + negative capability paths. |
| Full suite | `FAIL` | 2.777 dosya: 2.758 pass, 13 fail, 6 skip; 38.980 test: 38.721 pass, 118 fail, 141 skip; 3 error; 1.148,18 sn. |
| Coverage | `THRESHOLDS PASS / COMMAND FAIL` | 261.265 line'dan 226.072 covered = `%86,52`; 12.172 function'dan 11.591 = `%95,22`; 83.268 branch'ten 69.757 = `%83,77`. Floor'lar sırasıyla `82/89/80`; fakat aynı runtime-write-guard zincirinde `103` test kırmızı olduğu için komut exit `1`. |
| `npm run lint` | `HOLD` | root/dashboard tsc PASS; canonical hermeticity digest ve mock path ratchet'ları allowlist dışında stale. |

Full-suite'teki status-renderer ANSI kırmızıları Codex host'un ambient `NO_COLOR=1`
değeriydi; `env -u NO_COLOR` ile iki dosya `78/78 PASS` oldu ve coverage koşusunda da
yeşildir. Kalan baskın kök `tests/hermeticity/runtime-write-guard.ts:523-529`dir:
read-only secure-open descriptor'larını write sayıp downstream authority suite'lerini
`secure-open-unsupported` olarak maskeler. Exact öneriler `FINDINGS.md` CI-F004/005/006
içindedir.

Coverage öncesi sayısal yüzde baseline'ı authority bildirimiyle verilmedi ve lane'in
rebase-sonrası ilk exact full-suite'i zaten aynı guard kökünde kırmızıydı; bu nedenle
uydurma bir before→after yüzde delta'sı yazılmamıştır. Bunun yerine test-slim equality
manifest'i aynı 1.305 registration ve 2.915 assertion fingerprint'ini koruduğunu,
post-change coverage artifact'i de üç floor'un tamamının sırasıyla `+4,52`, `+6,22` ve
`+3,77` puan üstünde kaldığını kanıtlar. Coverage komutu yaklaşık 23 dakika sonunda
raporlarını yazıp `103` test failure nedeniyle exit `1` dönmüştür.

## Landing kararı

- `LOCAL_VERIFIED`: scoped equality, Secret Scan, TSR/TSM/wire, CI-R001, F1–F5.
- `LOCAL_FULL_SUITE`: kırmızı; green iddiası yok.
- `LOCAL_20_GATE`: stale allowlist-dışı ratchet nedeniyle HOLD.
- `REMOTE_ADVISORY`: branch push sonrası sınıflandırılacak.
- `ADMISSION`: ana-şerit yetkisinde ve bu teslimde `HOLD_ADMISSION`.
