# Deckent Capability Maturity Analysis — Enterprise & Autonomous Layers

**Date:** 2026-06-09 · **Sprint:** 263 (Task 263-002) · **Author:** claude-fable-5 (doc-writer worker)
**Scope:** Quantitative BUILT / PARTIAL / MISSING assessment of deckent's enterprise + autonomous capability surface, with `file:line` anchors and grep-derived caller counts. All numbers were derived from the live tree at authoring time — none are estimated.

---

## 1. Methodology

Every number below is reproducible. The commands used:

| Measurement | Command |
|---|---|
| Module existence | `find src -name "<module>.ts" -not -path "*node_modules*"` |
| Module LoC | `wc -l <file>` |
| Production caller count | `grep -rln "from '.*/<module>\.js'" src --include="*.ts" \| grep -v "/<module>\.ts$"` (src/ only — tests/ excluded; self excluded) |
| Dynamic-import check | `grep -rn "import(" src --include="*.ts"` against the module path (catches non-static wires, e.g. nervous bootstrap) |
| Flag defaults | direct read of `src/core/config.ts` defaults block + `src/core/enterprise-config.ts` |
| Symbol anchors | `grep -n "^export \(class\|function\|const\)" <file>` |

**Classification rules (stated up front, applied uniformly):**

- **BUILT** — implemented + wired + reachable from a shipped production surface (CLI command registered in `src/cli/index.ts`, MCP tool registered in `src/mcp/tools/index.ts`, or the sprint pipeline). An *explicit opt-in command* (e.g. `deckent autonomous start`) counts as a production caller — the user invokes it deliberately, same as `deckent start`.
- **PARTIAL** — code exists but is dormant: zero production callers, OR only intra-cluster callers, OR enforcement is behind a default-off config flag with no complete invocation chain.
- **MISSING** — no implementation found.
- **Dormant seam** — a module with **zero production callers** outside its own cluster (test-only reachability). This is the key risk metric: code that ships in the npm package but can never execute.

Context: `src/` contains **580** `.ts` files total (`find src -name "*.ts" -not -path "*node_modules*" | wc -l`).

---

## 2. Enterprise Capability Scorecard (12 rows)

| # | Capability | Verdict | Anchor | LoC | Prod callers | Evidence |
|---|---|---|---|---|---|---|
| E1 | RBAC / authority matrix | **PARTIAL** | `src/core/rbac.ts:48` (`PERMISSION_MATRIX`), `src/nervous/authority-matrix.ts:38` (`STRICT_MATRIX`) | 129 + 381 | 5 + 2 | `rbac.ts` imported by 5 src files (`cli/index.ts`, `audit-query.ts`, `enterprise-config.ts`, `flow-registry.ts`, `policy-engine.ts`); CLI `deckent rbac` registered (`src/cli/index.ts:137`). **But** enforcement default-off: `rbac: { enabled: false }` (`src/core/enterprise-config.ts:35`); ADR-037 runtime is advisory/soft by design. `authority-matrix.ts` feeds `decision-engine.ts` + `panic-gate.ts` (nervous), gated by `nervous_system.enabled: false` (`src/core/config.ts:1044`). |
| E2 | Multi-tenancy | **PARTIAL** | `src/core/memory-store.ts:86` (`strictTenantIsolation`), `:124` (`tenant_id` column) | 1,296 (store) + 94 (`tenant-context.ts`) | tenantId threaded in **24** src files | `tenant_id` is schema-real (column + migration `memory-store.ts:201-202`) and `tenantId` appears in 24 src files (`grep -rln "tenantId" src`). **But** `strictTenantIsolation` defaults `false` (`memory-store.ts:90`; `strict_tenant_isolation ?? false` at `config.ts:1330`), and the code itself documents a cross-tenant read leak when off (`memory-store.ts:678-686`). `tenancy: { enabled: false }` (`enterprise-config.ts:34`). |
| E3 | Audit hash-chain | **BUILT** | `src/core/audit-writer.ts:20` (`chainHead`), `:90` (`prevHmac` chaining in `writeAuditEvent`) | 174 | 5 | Tamper-evident hmac chain (genesis seed `:16`, `prevHmac`/`hmac` fields `:35-38`). Imported by 5 src files (`audit-query.ts`, `audit-retention.ts`, `compliance-report.ts`, `rbac.ts`, `siem-forwarder.ts`); event producers in production code: `rbac.ts`, `audit-retention.ts`. CLI surfaces `deckent audit` + `deckent audit-verify` registered (`cli/index.ts:132-133`). Caveat: event *volume* depends on rbac/flow usage. |
| E4 | Audit lineage / query | **BUILT** | `src/core/audit-query.ts:61` (`queryAudit`) | 249 | 2 | Imported by `src/cli/commands/audit.ts` (shipped CLI surface) + `src/core/audit-export.ts` (121 LoC). 4 test files cover it. |
| E5 | SSO / OIDC | **PARTIAL** | `src/core/auth-oidc.ts:187` (`verifyJwt`), `src/core/auth-session.ts:26` (`SessionStore`) | 273 + 91 | **0 + 0** | Zero src importers for both files (1 test importer each). The terminal auth layer explicitly anticipates it as a *future* plug-in: "impls (OIDC, SSO, mTLS) plug in behind the same interface" (`src/api/terminal/auth-provider.ts:8`) — comment only, no import. **2 dormant seams.** |
| E6 | SIEM forwarding | **PARTIAL** | `src/core/siem-forwarder.ts:96` (`createSiemForwarder`) | 178 | **0** | Zero src importers (1 test importer). Imports `audit-writer.ts` (read side ready) but nothing constructs a forwarder in production. **Dormant seam.** |
| E7 | Compliance reporting | **PARTIAL** | `src/core/compliance-report.ts:52` (`generateComplianceReport`) | 86 | **0** | Zero src importers (1 test importer). **Dormant seam.** |
| E8 | Secret interpolation (`$DECK:`) | **BUILT** | `src/core/deck-interpolation.ts:3` (`DECK_PATTERN`) | 38 | 2 | Wired into config load (`src/core/config.ts:1365` interpolation section) + `src/mcp-client/config.ts`; consumed by connectors (`connector-bootstrap.ts:79,229` token checks; Discord/Telegram token docs). ADR-014 live end-to-end. |
| E9 | Credential vault manager | **PARTIAL** | `src/core/credentials.ts:54` (`CredentialManager`) | 265 | **0** | Zero src importers (2 test importers). Encrypted credential store exists (`EncryptedCredentialEntry:28`, `storeCredential:249`) but no production surface calls it — the live secret path is E8's `$DECK:` interpolation instead. **Dormant seam.** |
| E10 | Policy engine | **PARTIAL** | `src/core/policy-engine.ts:121` (`evaluatePolicy`) | 188 | **0** | Composes rbac + activation + condition layers (`PolicyLayers:68`) and imports `rbac.ts` + `tenant-context` types — but zero src files import policy-engine itself (1 test importer). **Dormant seam.** |
| E11 | Capability broker + handlers | **PARTIAL** | `src/core/capability-broker.ts:91` (`CapabilityRegistry`) | 371 + 203 + 211 + 72 = **857** (4-file cluster) | **0 external** | Closed island: broker is imported only by its own cluster (`capability-handlers.ts`, `capability-handlers-data.ts`, `capability-audit-bridge.ts`), and **nothing imports any of those 3**. Handlers exist for http-get/env-read/shell-exec (`capability-handlers.ts:191-193`) + db-query/mail-search (`capability-handlers-data.ts`). `work-model.ts:86-89` already defines `CapabilityTarget` for F8 — the consumer-side type is ready, the wire is not. **4 dormant seams.** |
| E12 | ERP connector | **PARTIAL** | `src/core/erp-connector.ts:200` (`ErpConnector`), `:374` (`createErpConnector`) | 376 | **0** | Zero src importers; `grep -rln "erp-connector\|ErpConnector" src` matches only the file itself (1 test importer). Largest single dormant module. **Dormant seam.** |
| E13 | Cost-gate budget | **BUILT** | `src/core/cost-gate.ts:111` (`evaluateCostGate`) | 214 | 2 | Called at `src/cli/commands/start.ts:379` and `src/mcp/tools/start.ts:173` — both shipped sprint-start surfaces; over-budget requires explicit `--force` / `acknowledgeCost` (`mcp/tools/start.ts:35`). Budget source: `cost_limits.sprint_max_usd` (`cost-config-loader.ts:73`, `cost-calculator.ts:389`). |

*(E8/E9 split the directive's single "secret vault" bullet into its two halves because their verdicts differ — the `$DECK:` half is live, the `CredentialManager` half is dormant.)*

---

## 3. Autonomous Capability Scorecard (6 rows)

| # | Capability | Verdict | Anchor | LoC | Prod callers | Evidence |
|---|---|---|---|---|---|---|
| A1 | Scheduled-flow cron | **BUILT** | `src/core/scheduled-flow.ts:42` (5-field cron parser), `src/core/flow-scheduler.ts:26` (`FlowScheduler` due-scan) | 202 + 79 + 116 (registry) + 143 (orchestra adapter) | 7 combined | Full chain: cron parse → `FlowScheduler` → `trigger-adapter.ts:52` (TriggerSource wrap) → composed in `runtime-loop.ts:211` ("backlog-due → scheduled-flow source → optional reactive") → driven by registered CLI commands `deckent flow` (`cli/index.ts:136`) + `deckent autonomous` (`cli/index.ts:139`). 7 src importers across the two scheduled-flow files; 13 test importers. Engine activation is explicit opt-in (`autonomous.enabled: false`, `config.ts:1035` — deliberate ADR-040 gating, invocation chain complete). |
| A2 | Recurring backlog re-enqueue | **PARTIAL** | `src/orchestra/autonomous/backlog.ts:146` (`reenqueueRecurring`) | 167 (backlog.ts is live) | **0 callers of the function** | The backlog module itself is well-wired (6 src importers) and the `recurring` trigger type is validated (`backlog.ts:14,27`). But `grep -rn "reenqueueRecurring" src` shows the function is **exported and never called** — recurring entries complete once and are never re-enqueued. Function-level dormant seam. |
| A3 | ExecutionPool wiring | **BUILT** | `src/orchestra/autonomous/execution-pool.ts:13` (`makeSerialPool`), `:28` (`makeBoundedPool`) | 67 | 2 | Imported by `cli/commands/autonomous.ts` + `execute-dispatcher.ts` — wired into the autonomous run path. Default `pool_size: 1` (`config.ts:1038`) → serial by default, bounded pool available. |
| A4 | Observer driving | **PARTIAL** | `src/nervous/observer.ts:92` (`NervousObserver`), `src/orchestra/sprint-controller.ts:448` (dynamic bootstrap import) | 474 | 5 | Two wires exist, both default-off: (1) sprint path — `loadNervousBootstrap()` dynamic-imports `nervous/bootstrap.js` (`sprint-controller.ts:448`), explicitly no-op when `nervous_system.enabled: false` (default, `config.ts:1044`); (2) autonomous reactive path — `NervousObserver` constructed at `cli/commands/autonomous.ts:227`, gated by `autonomous.reactive.enabled: false` (default, `config.ts:1039`). `runtime-loop.ts:150` marks the per-cycle observation tick *optional* ("Absent → no observer") and `:235` admits the real DetectorRegistry-backed tick is still open. |
| A5 | Work-generator | **PARTIAL** | `src/orchestra/autonomous/work-generator.ts:78` (`generateWorkCandidates`), `work-generator-source.ts:20` (`makeWorkGeneratorSource`) | 87 + 40 | **0 + 0** | Debt/TODO → backlog-candidate generation exists, and the TriggerSource adapter (which itself imports `execute-dispatcher`) is complete — but **neither file is imported anywhere** in src. Self-generated work, the core of autonomy, cannot currently fire. **2 dormant seams.** |
| A6 | MCP autonomous tool | **BUILT** | `src/mcp/tools/autonomous.ts:46` (`'deckent_autonomous'`) | 268 | registered | Registered in `registerAllTools` (`src/mcp/tools/index.ts:61`); mirrors CLI subcommands (status/start/stop/backlog actions, `:57`) per ADR-022 CLI/MCP parity. AUT-8, Sprint 260. |

---

## 4. Tallies

| Metric | Count |
|---|---|
| Total capabilities assessed | **19** (13 enterprise + 6 autonomous) |
| **BUILT** | **7** (E3 audit hash-chain, E4 audit query, E8 `$DECK:`, E13 cost-gate, A1 scheduled-flow, A3 ExecutionPool, A6 MCP tool) |
| **PARTIAL** | **12** |
| **MISSING** | **0** |

> Row-exact: BUILT = E3, E4, E8, E13, A1, A3, A6 = **7 rows**; PARTIAL = E1, E2, E5, E6, E7, E9, E10, E11, E12, A2, A4, A5 = **12 rows**; 7 + 12 = 19. Nothing assessed is MISSING — every capability named in the directive exists as code. Deckent's gap profile is **wiring, not absence**.

### Dormant seam inventory (the key risk metric)

Modules with **zero production callers** (test-only reachability), per the caller-count grep in §1:

| # | Module | LoC |
|---|---|---|
| 1 | `src/core/auth-oidc.ts` | 273 |
| 2 | `src/core/auth-session.ts` | 91 |
| 3 | `src/core/siem-forwarder.ts` | 178 |
| 4 | `src/core/compliance-report.ts` | 86 |
| 5 | `src/core/credentials.ts` | 265 |
| 6 | `src/core/policy-engine.ts` | 188 |
| 7 | `src/core/erp-connector.ts` | 376 |
| 8 | `src/core/capability-broker.ts` (intra-cluster only) | 371 |
| 9 | `src/core/capability-handlers.ts` | 203 |
| 10 | `src/core/capability-handlers-data.ts` | 211 |
| 11 | `src/core/capability-audit-bridge.ts` | 72 |
| 12 | `src/orchestra/autonomous/work-generator.ts` | 87 |
| 13 | `src/orchestra/autonomous/work-generator-source.ts` | 40 |

**Dormant seam count: 13 modules, 2,441 LoC** (≈ shipped-but-unreachable code), **plus 1 function-level seam** (`reenqueueRecurring`, `backlog.ts:146`, inside an otherwise-live module).

For scale: 2,441 dormant LoC sits behind 13 of the 580 src `.ts` files (2.2% of files). Every one of the 13 has tests (1–4 test importers each) — they are *verified* dormant code, which makes them cheap to wire and expensive to leave idle.

---

## 5. Top-5 Highest-Leverage Wiring Gaps (ranked)

1. **`reenqueueRecurring` → autonomous runtime loop** (`backlog.ts:146` → `runtime-loop.ts` cycle). One call-site away from making *recurring* autonomous work real; today a `recurring` backlog entry runs once, lands in `done`, and never fires again despite its cron being validated at intake (`backlog.ts:27`). Smallest diff on this list, largest behavioral unlock per line.

2. **`makeWorkGeneratorSource` → trigger composition** (`work-generator-source.ts:20` → the source array at `runtime-loop.ts:211`). Self-generated work (debt/TODO scanning → backlog candidates) is the defining feature of an autonomous engine; both halves are finished and the adapter already imports `execute-dispatcher`. Wiring = 1 import + 1 array element. Closes 2 of the 13 dormant seams (127 LoC).

3. **Capability broker cluster → dispatch path** (`capability-broker.ts:91` + 3 handler/bridge files → `execute-dispatcher` / `work-model.ts:86` `CapabilityTarget`). The consumer-side type for non-code work (mail/calendar/ERP/DB) already exists in `work-model.ts`; the broker, 5 concrete handlers, and the audit bridge (857 LoC, the largest dormant cluster) just need a dispatch branch that routes `capabilityTarget` work through the registry. Also the prerequisite for ever waking E12 (ERP, 376 LoC).

4. **`evaluatePolicy` → flow/self-dispatch enforcement point** (`policy-engine.ts:121` → `flow-runtime.ts` or `self-dispatch.ts`). The 3-layer policy composition (rbac × activation × condition) is the single choke-point that would convert RBAC from advisory (ADR-037 V1.0 soft) to enforced for autonomous dispatch — higher value than flipping `rbac.enabled` alone, because it gates *machine-initiated* actions where no human reviews each run.

5. **SIEM forwarder + compliance report → audit read-side** (`siem-forwarder.ts:96`, `compliance-report.ts:52` → `deckent audit` CLI or a scheduled flow). The hash-chain (E3) already produces tamper-evident events; these two read-side consumers (264 LoC combined) are each a one-call integration and are the difference between "has an audit log" and "enterprise can consume the audit log". Runner-up: OIDC into `api/terminal/auth-provider.ts:8`, whose interface comment explicitly reserves the slot.

---

*All counts derived 2026-06-09 from the working tree via the commands in §1. Re-run them to verify — none of the numbers above are estimates.*
