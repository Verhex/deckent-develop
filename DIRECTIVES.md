# DIRECTIVES — Sprint-B13: 21-task factory wave — decision outputs + catalog slices, Kahn-chained

## Goal

Twenty-one tasks advance in one Kahn-scheduled wave. Four production lines carry
dependency chains, the rest run scope-disjoint in parallel:

1. **ADR reconciliation line** (owner decision 2026-08-11): an authoritative memory
   recall feeds four normative-field-diff matrices (C1..C4) — the mandatory FIRST
   output of every crosswalk mandate; typing (SUCCESSOR/AMENDMENT) derives from the
   matrix, never from the Immutable flag alone.
2. **Persona line**: provider system-channel capability census (S0, widened per owner
   D-G to include channel-behaviour verification) feeds the capability seam types (S1)
   carrying `semantics: 'append' | 'replace'` and the D-H replace→HOLD rule as data.
3. **Agent catalog line**: S3 (prompt resolution folded into the resolver) feeds S4
   (CLI + MCP read-surface migration).
4. **Skill catalog line**: S3 (entrypoint + referenced-file authority, `resolveBody()`)
   feeds S4 (worker prompt path migration, byte-compared).

Parallel independents: dep-supply Phase-0 census · CI fail-open install fix ·
trust-anchor revision (codex-mandated) · CI required-checks architecture design ·
estimator/maxTokens ratification · xverify provider-authority RCA · CLI test-harness
silent-swallow fix · desktop Node-floor plumbing · Docs+Scripts vitest flake RCA.

Workers may READ any path named in their Scope, including src/ directories listed
purely for context; reading beyond Scope is not required by any task here.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host
admission.

## Execution Contract

- Behaviour outside each task's stated defect stays byte-identical; every test passing
  today still passes, unchanged.
- Do not weaken or delete an existing assertion to make new behaviour pass; report the
  conflict in result notes instead.
- Read the existing mechanism before designing; every code task EXTENDS something
  present. A second parallel mechanism is a NO-GO.
- Fail closed on ambiguity; nothing may make a destructive action easier to trigger.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, npm publish, or cleanup. Scoped vitest runs only.
- Tests are hermetic: tmpdir-based, no network, no live `.tasks`/`.deckent` writes,
  async spawn only (ADR-D-002).
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr).
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.
- Design/doc artifacts land under follow-up-works/ — docs/ is product documentation only.

---

## Task 1: Authoritative ADR recall for the five reverify designs (crosswalk packet §3)

- Files: follow-up-works/adr-recall-a1-a4-a5-a8-a9-2026-08-12.md
- Scope: follow-up-works/adr-recall-a1-a4-a5-a8-a9-2026-08-12.md, follow-up-works/, .brain/exports/, src/core/memory-store.ts
- Model: gpt-5.6-sol
- Dependencies: none

Measured: the OWASP-ASI-REVERIFY inventory names nine designs; the owner directed an
authoritative memory-export recall for A1, A4, A5, A8, A9 BEFORE their implementation
admission (sec-adr-crosswalk owner decisions, 2026-08-11).

Required: read the OWASP-ASI-REVERIFY document's A1/A4/A5/A8/A9 sections and the
exported decisions projection; for each design list every ADR it touches, quote the
CURRENT exported normative text of those ADRs verbatim, and state per design:
compatible / conflicting / needs-owner-clarification, with the exact clause cited.
Where the export may lag the DB, say so explicitly instead of guessing. Output is the
file named in Files — NEW. Proposes only.

**Test:** the document exists at the exact path with a section per design;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** paraphrasing ADR text instead of quoting, writing to memory.db, or a
compatibility verdict without a cited clause.

---

## Task 2: C1 normative-field-diff matrix — ADR-G-021 vs A6 D11

- Files: follow-up-works/adr-matrix-c1-g021-2026-08-12.md
- Scope: follow-up-works/adr-matrix-c1-g021-2026-08-12.md, follow-up-works/, .brain/exports/, src/core/deck-file.ts, src/core/
- Model: claude-opus-5
- Dependencies: Task 1

Measured (owner decision 2026-08-11): the C1 mandate is approved CONDITIONALLY — the
mandatory FIRST output is this matrix; the mandate falls if the matrix refutes it.
Codex cross-review: if D11 retires only dormant detector code there is NO conflict.

Required: a matrix document (the file named in Files — NEW): exact current normative
field(s) of ADR-G-021 (quoted) → the exact change A6 D11 proposes → every invariant
that stays untouched → the exact ADR-G-019 clause that authorizes (or does not
authorize) a successor for an Immutable:yes ADR. Then the code truth: is
`detectDeckentRepo` live on the rollback-guard/self-modify paths, and is
`enforceSelfModifyingTask` dormant? Cite file-and-line. Conclude: conflict real
(SUCCESSOR justified) / conflict void (mandate falls) / owner-clarification needed.

**Test:** document exists with the four matrix columns and a code-truth section;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** deriving the type from the Immutable flag alone, or a conclusion without
the code-truth citations.

---

## Task 3: C2 normative-field-diff matrix — ADR-G-029 vs A7

- Files: follow-up-works/adr-matrix-c2-g029-2026-08-12.md
- Scope: follow-up-works/adr-matrix-c2-g029-2026-08-12.md, follow-up-works/, .brain/exports/, src/api/terminal/command-guard.ts, src/api/terminal/
- Model: claude-opus-5
- Dependencies: Task 1

Measured (owner decision 2026-08-11, conditional approval): codex cross-review says
the crosswalk misrepresents A7 — its real decision is demoting regex guards to
telemetry after a replacement closure, not "guard runs for every SessionKind"; and
ADR-G-029 may already carry a 2026-07-18 amendment (unverified — verify it).

Required: same matrix structure as the C1 task: quoted current ADR-G-029 normative
text (verify the claimed 2026-07-18 amendment from the export), A7's exact proposed
change, untouched invariants, the authorizing ADR-G-019 clause. Code truth: the
delivered guard's actual coverage (`ctx.kind !== 'shell'` early-return at
command-guard.ts) versus the ADR's delivered claim. Conclude with the same
three-way verdict.

**Test:** document exists with matrix + code-truth + amendment-verification sections;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** repeating the crosswalk's A7 characterization without re-reading A7's own
text, or leaving the amendment claim unverified.

---

## Task 4: C3 normative-field-diff matrix — ADR-G-037 vs A2 rolling budget

- Files: follow-up-works/adr-matrix-c3-g037-2026-08-12.md
- Scope: follow-up-works/adr-matrix-c3-g037-2026-08-12.md, follow-up-works/, .brain/exports/, src/core/execution-budget.ts, src/core/
- Model: claude-opus-5
- Dependencies: Task 1

Measured (owner decision 2026-08-11, conditional approval): codex cross-review found
the crosswalk's invariant list incomplete — ADR-G-037's continuation claim/fencing,
bounded-context/no-full-replay, duplicate-event/cache accounting, thin-consumer and
final-only amendment rules were left out.

Required: the full matrix with the COMPLETE ADR-G-037 invariant enumeration (all nine
landing/budget authority clauses plus the five codex-named rules), A2's exact proposed
field changes, and which invariants A2 touches versus preserves. Code truth: the
current spend gate's WARN-ONLY behaviour cited at file-and-line. Same three-way verdict.

**Test:** document exists; the invariant enumeration section lists every ADR-G-037
clause; `node scripts/lint-links.mjs` stays green.

**NO-GO:** an invariant list shorter than the ADR's own clause count, or treating
warning-only cost evidence as host metering.

---

## Task 5: C4 normative-field-diff matrix — ADR-G-039 vs A3 audit integrity

- Files: follow-up-works/adr-matrix-c4-g039-2026-08-12.md
- Scope: follow-up-works/adr-matrix-c4-g039-2026-08-12.md, follow-up-works/, .brain/exports/, src/core/audit-writer.ts, src/core/
- Model: claude-opus-5
- Dependencies: Task 1

Measured (owner decision 2026-08-11, conditional approval): codex cross-review says
A3 does NOT treat HMAC wholly as an accident ("Event MAC + asymmetric checkpoint
birlikte") and the crosswalk fails to bind ADR-G-039's immutable pseudonym root,
exact key IDs, content-chained revisions, transactional owner-run migration and
missing-authority/no-fallback rules.

Required: the full matrix with the complete ADR-G-039 invariant enumeration, A3's
exact proposal re-read from its own text, and the separation the owner mandated:
unsafe fixed `AUDIT_HMAC_SECRET` implementation (cite audit-writer.ts) versus the
accepted key-custody architecture. Same three-way verdict.

**Test:** document exists with complete invariant enumeration + code citation;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** conflating the fixed-secret implementation defect with the custody
architecture, or dropping any of the five codex-named binding rules.

---

## Task 6: Persona S0 — provider system-channel capability census with behaviour verification

- Files: follow-up-works/persona-s0-provider-channel-census-2026-08-12.md
- Scope: follow-up-works/persona-s0-provider-channel-census-2026-08-12.md, follow-up-works/, src/providers/, src/core/, src/orchestra/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (owner decisions 2026-08-11): D-A yes; D-G widened — S0 must verify not just
flag existence but channel BEHAVIOUR (ignore/transform/truncate detection); D-H —
`replace` semantics is a spawn HOLD, only proven `append`/`preserve-provider-default`
channels are default candidates.

Required: for every provider adapter present in src/providers/, record from code and
from each adapter's own documented CLI/API surface: does a system-prompt channel
exist, its exact flag/field, its semantics (`append` | `replace` | unknown), byte
limits, and what evidence would prove behaviour (echo-test design per provider — not
executed here, designed). Names recalled from training data are claims to verify, not
facts — mark each `repo-verified` / `needs-live-verification` exactly as the parent
analysis does. Output: the census document with a per-provider table + the live
verification protocol for a later slice.

**Test:** document exists; every adapter directory in src/providers/ has a row;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** asserting an external flag as verified without code/doc evidence, or
running live provider calls from this task.

---

## Task 7: Persona S1 — capability seam types with D-H carried as data

- Files: src/core/provider.ts, src/core/agent-types.ts, tests/core/persona-channel-capability.test.ts
- Scope: src/core/provider.ts, src/core/agent-types.ts, src/core/, tests/core/persona-channel-capability.test.ts, follow-up-works/
- Model: claude-sonnet-5
- Dependencies: Task 6

Measured: the spawn contract has no persona slot today (provider.ts carries no
systemPrompt/renderMode field — verified 2026-08-11); the owner approved the seam
with D-H (`replace` → typed HOLD) and D-D (`degrade` default when no channel).

Required: TYPES AND DATA ONLY — extend the provider capability surface with an
optional `systemPromptChannel` descriptor: `{ supported: boolean; semantics: 'append'
| 'replace' | 'unknown'; maxBytes?: number; verified: boolean }`, defaulting absent =
unsupported. Add the pure resolution helper that maps a descriptor to a spawn
disposition: verified append → eligible; replace or unknown → HOLD-candidate; absent
→ degrade (per D-D). NO spawn-path behaviour change in this slice — no call site
consumes the helper yet; that wiring is a later owner-gated slice and this task's
result notes must say exactly which slice. Hermetic tests pin the mapping including
both D-H HOLD cases.

**Test:** `npx vitest run tests/core/persona-channel-capability.test.ts`

**NO-GO:** changing any spawn call-site behaviour, provider-name-keyed branches
(C4), or a default that spawns a `replace` channel.

---

## Task 8: Agent catalog S3 — prompt resolution folded into the resolver

- Files: src/core/agent-pool.ts, tests/core/agent-prompt-resolution.test.ts
- Scope: src/core/agent-pool.ts, src/core/, tests/core/agent-prompt-resolution.test.ts, follow-up-works/agent-catalog-authority-design-2026-08-11.md
- Model: claude-opus-5
- Dependencies: none

Measured (design §S3, S0-S2 landed in sprint-521): agent prompt content is still
read at consumer sites; the design demands prompt resolution behind the resolver so
every surface gets the same prompt truth with the layered precedence the owner
approved (project overrides outrank learned runtime records).

Required: fold prompt-content resolution into the S2 resolver: one `resolvePrompt`
path honoring layer precedence, typed prompt-degraded classification (D4 alignment),
and byte-identical output for every currently-passing case. The existing agent-pool
suite stays green UNMODIFIED (same constraint the S2 slice honored). Hermetic tests:
precedence across layers, degraded prompt classification, absent prompt.

**Test:** `npx vitest run tests/core/agent-prompt-resolution.test.ts tests/core/agent-pool.test.ts`

**NO-GO:** modifying tests/core/agent-pool.test.ts, a second prompt-read path
surviving, or output drift on any existing case.

---

## Task 9: Agent catalog S4 — CLI and MCP surfaces consume the read model

- Files: src/cli/commands/agent.ts, src/mcp/tools/agent-list.ts, tests/cli/agent-surface-readmodel.test.ts
- Scope: src/cli/commands/agent.ts, src/cli/commands/, src/mcp/tools/agent-list.ts, src/mcp/tools/, tests/cli/agent-surface-readmodel.test.ts, src/core/
- Model: claude-opus-5
- Dependencies: Task 8

Measured (design §S4): CLI and MCP still raw-scan agent directories instead of
consuming the S2/S3 read model — the exact clean-checkout vs machine-local
divergence row 7011 names.

Required: migrate the CLI agent listing and the MCP agent-list tool to the resolver's
read model; identical counts and ids between both surfaces and the resolver snapshot
on one tree; enabled/routability/provenance now visible in both payloads. If either
surface file differs from the names in Files, locate the real ones via the design's
call-site inventory and record the correction in result notes. Hermetic tests with
tmpdir fixture trees.

**Test:** `npx vitest run tests/cli/agent-surface-readmodel.test.ts`

**NO-GO:** leaving any raw directory scan on the migrated surfaces, or surface
payloads disagreeing with the resolver snapshot.

---

## Task 10: Skill catalog S3 — entrypoint and referenced-file authority

- Files: src/core/skill-pool.ts, tests/core/skill-body-resolution.test.ts
- Scope: src/core/skill-pool.ts, src/core/skill-types.ts, src/core/, tests/core/skill-body-resolution.test.ts, follow-up-works/skill-catalog-authority-design-2026-08-11.md
- Model: claude-opus-5
- Dependencies: none

Measured (design §S3, S1-S2 landed in sprint-521): declared entrypoints and
referenced files have no containment authority — a skill body is read wherever the
manifest points.

Required: `resolveBody()` on the catalog surface with containment + budget
enforcement per the design: `../` escape, symlink escape, missing referenced file,
over-budget package each produce a typed HOLD, never a partial prompt; a skill whose
entrypoint is not the default SKILL markdown injects correctly. Existing manifests
keep loading unchanged.

**Test:** `npx vitest run tests/core/skill-body-resolution.test.ts tests/core/skill-catalog-readmodel.test.ts`

**NO-GO:** a partial prompt on any containment failure, or breaking any of the
existing manifest loads.

---

## Task 11: Skill catalog S4 — worker prompt path migrates to the read model

- Files: src/core/skill-loading.ts, tests/core/skill-prompt-parity.test.ts
- Scope: src/core/skill-loading.ts, src/core/, src/orchestra/prompt-god-template.ts, tests/core/skill-prompt-parity.test.ts
- Model: claude-opus-5
- Dependencies: Task 10

Measured (design §S4, deliberately before S5): the worker prompt is the surface where
a wrong answer costs a provider call and poisons outcome learning; it must migrate
while the change is byte-comparable.

Required: migrate `resolveSkillPrompts`/skill-loading onto the S2 read model + S3
`resolveBody()`. Proof is BYTE-COMPARISON: an identical worker prompt for an
unchanged catalog against the current path, pinned in a hermetic test; the
project-conventions fallback and assigned-skill credit-removal behaviours preserved
with their existing tests green. If the real prompt-assembly file names differ from
Files, follow the design's call-site inventory and record corrections.

**Test:** `npx vitest run tests/core/skill-prompt-parity.test.ts`

**NO-GO:** any byte drift in the worker prompt for an unchanged catalog, or a second
skill-body read path surviving on the prompt route.

---

## Task 12: Dep-supply Phase 0a — install-ingress census script, receipt-only

- Files: scripts/audit-install-ingress.mjs, tests/scripts/install-ingress-census.test.ts
- Scope: scripts/audit-install-ingress.mjs, scripts/, tests/scripts/install-ingress-census.test.ts, .github/workflows/, src/orchestra/spawn-backend-docker.ts, package.json
- Model: claude-sonnet-5
- Dependencies: none

Measured (owner decision 2026-08-11: Phase 0 GO): the dep-supply evaluation's
pre-enforcement rule — no phase may claim coverage before exact ingress facts are
machine-derived. Codex şerh: "100% of known" is not a closed-world proof; the census
must type the unknown-ingress class explicitly.

Required: a report-only script (NEW, mirroring audit-operation-ingress.mjs's
conventions including a --write baseline) that statically enumerates: every `npm
ci`/`npm install`/`npx`/`yarn` invocation in workflows and package.json scripts,
every worker-container install call site in the docker backend, nested npm roots,
and the effective ignore-scripts posture per site; emits per-site records with
file-and-line and an explicit `unknownIngressClasses` section stating what static
analysis CANNOT see (shell-composed commands, future workflows). Register the script
in scripts/script-registry.json. Never fails the build.

**Test:** `npx vitest run tests/scripts/install-ingress-census.test.ts`

**NO-GO:** claiming closed-world coverage, executing any install, or wiring into CI
gates in this slice.

---

## Task 13: CI install fail-open closure — the three fail-open installs and floating npx

- Files: .github/workflows/ci.yml, .github/workflows/coverage.yml, tests/scripts/workflow-install-hygiene.test.ts
- Scope: .github/workflows/ci.yml, .github/workflows/coverage.yml, .github/workflows/, tests/scripts/workflow-install-hygiene.test.ts, tests/scripts/
- Model: claude-sonnet-5
- Dependencies: none

Measured (verified 2026-08-11): three dashboard-prefix installs swallow failure with
`|| true` (ci.yml lines ~243 and ~291, coverage.yml line ~35) — a failed dependency
install silently produces a green step.

Required: root-cause first — record in result notes WHY the `|| true` was added (git
blame the lines) and what breaks without it. Then remove the fail-open: the install
either succeeds, or the step fails visibly with its real error; if a legitimately
optional path exists, express it as an explicit conditional, never error-swallowing.
Add a hermetic workflow-hygiene test that parses the workflow files and fails on any
`install ... || true` pattern, pinning the closure. Do not change what any job
installs.

**Test:** `npx vitest run tests/scripts/workflow-install-hygiene.test.ts`

**NO-GO:** removing an install step entirely, changing installed packages, or a
hygiene test that allowlists the pattern it exists to ban.

---

## Task 14: Trust-anchor design revision under the six codex conditions

- Files: follow-up-works/trust-anchor-solo-design-rev2-2026-08-12.md
- Scope: follow-up-works/trust-anchor-solo-design-rev2-2026-08-12.md, follow-up-works/, .github/, docs/evidence/
- Model: claude-opus-5
- Dependencies: none

Measured (owner decision 2026-08-11: sent to revision, codex verdict UNSOUND): the
six revision conditions are recorded in the original document's OWNER DECISION
addendum — reversed rollout (GHEC/trustee feasibility FIRST), CODEOWNERS
self-protection, App integration_id pinning, webhook-based snapshot against the
transient loosen-merge-restore attack, a live negative test per mitigation ("can the
sole admin remove this?"), and the widened threat model (App-host compromise,
webhook replay/ref-TOCTOU, bot-policy compromise, ledger-write stoppage).

Required: a rev2 document (NEW file named in Files) restructured around those six
conditions, superseding the original's mitigation order; every mitigation carries
its negative-test definition and an explicit "who enforces this against the sole
admin" line. The original document stays untouched as the decision record.

**Test:** document exists addressing all six conditions; `node scripts/lint-links.mjs`
stays green.

**NO-GO:** editing the original document, creating any GitHub resource, or a
mitigation without its negative test.

---

## Task 15: CI required-checks architecture — closing the broken-main ingress

- Files: follow-up-works/ci-required-checks-design-2026-08-12.md
- Scope: follow-up-works/ci-required-checks-design-2026-08-12.md, follow-up-works/, .github/workflows/, docs/evidence/trust-anchor/
- Model: claude-opus-5
- Dependencies: none

Measured (2026-08-11 live incident): PR #120 merged with red CLI/Orchestra shards
because the merge queue re-runs only Type Check (the 535 optimization) and main-push
runs no test shards; PR #121 inherited a red wall it did not build and needed two
repair rounds. The Docs+Scripts shard is additionally `continue-on-error: true`, so
its real failures are structurally invisible.

Required: a design document weighing the exact options for this repo: which checks
become branch-protection/ruleset-required, what the merge queue re-runs, whether
main-push runs shards, what replaces `continue-on-error` on Docs+Scripts (the flake
RCA task feeds this), and the wall-clock cost of each option measured from recent
run durations (cite run ids). Owner decision points explicit; proposes only —
ruleset changes are owner-manual.

**Test:** document exists with a costed option table; `node scripts/lint-links.mjs`
stays green.

**NO-GO:** editing any workflow or ruleset in this task, or cost figures without
cited run evidence.

---

## Task 16: Estimator and worker-budget ratification — config truth with receipts

- Files: follow-up-works/budget-ratification-2026-08-12.md
- Scope: follow-up-works/budget-ratification-2026-08-12.md, follow-up-works/, .deckent/, src/core/cost-config-loader.ts, src/core/
- Model: gpt-5.6-sol
- Dependencies: none

Measured: two campaign-time owner overrides await permanent ratification — worker
`execution_budget.roles.worker.default.maxTokens` 50M in .deckent/config.json and the
estimator `output_tokens_by_effort` raise (50k/200k/400k) in .deckent/cost-config.json;
both were set to stop budget NO_GOs mid-campaign with "tune later" recorded.

Required: a ratification document: what each value gates (cite the exact loader/
admission code paths), the campaign evidence (which sprints hit the old limits, from
archived results), the risk of each value staying (runaway cost bound analysis), and
a recommended permanent value with alternatives. Read-only on both config files —
the change itself is owner-manual after the decision.

**Test:** document exists with code-path citations and per-value recommendation;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** editing either config file, or recommendations without archived-sprint
evidence.

---

## Task 17: XVerify provider-authority RCA — why a provisioned keyring still holds

- Files: follow-up-works/xverify-authority-rca-2026-08-12.md
- Scope: follow-up-works/xverify-authority-rca-2026-08-12.md, follow-up-works/, src/cli/commands/xverify.ts, src/cli/commands/, src/core/provider-authority.ts, src/core/, .analysis/xverify/
- Model: claude-opus-5
- Dependencies: none

Measured (2026-08-11, fresh dist): four `deckent xverify --author claude --verifier
codex` invocations all returned typed
`verifier-exact-invocation-composition-hold:xverify_provider_authority_unavailable`
while `provider-authority keyring init` refuses because a keyring ALREADY exists
(par-60a10a69, revision 1). The doctor separately warns the keyring is not
provisioned — two surfaces disagree about the same authority state.

Required: root-cause from code: trace the exact composition path that raises
`xverify_provider_authority_unavailable`, what authority artifact it requires for the
VERIFIER provider (codex), why an existing keyring does not satisfy it, and why
doctor's keyring probe disagrees with the keyring CLI. Read the four HOLD reports in
the xverify analysis directory as evidence. Output: RCA document with the exact
missing artifact named, the honest remedy commands (unexecuted), and whether the
doctor probe or the composition check is wrong — with a proposed born-row draft
validated by `node scripts/check-born-intake.mjs`. If the real source files differ
from the names in Files, locate them and record corrections.

**Test:** document exists naming the exact missing authority artifact with file-and-line
trace; the born-row draft passes the intake checker.

**NO-GO:** running keyring rotate/init or any credential mutation, or an RCA that
stops at the symptom without the composition trace.

---

## Task 18: CLI test-harness silent-swallow closure

- Files: tests/cli/commands.test.ts
- Scope: tests/cli/commands.test.ts, tests/cli/
- Model: claude-sonnet-5
- Dependencies: none

Measured (2026-08-11 repair session): `runCommand` in the combined CLI suite swallows
every non-commander error silently — a strict-ESM mock crash produced empty stdout
and hid a whole rot family for weeks; the diagnosis required hand-patching the catch.

Required: unexpected errors become visible without breaking intentional-error tests:
rethrow non-commander errors UNLESS the test opted in via an explicit
`expectCommandError` flag/helper; the tests that intentionally drive BrainError/
generic-error paths use the opt-in. Every test in the file stays green with the
harness change.

**Test:** `npx vitest run tests/cli/commands.test.ts`

**NO-GO:** a harness that still swallows unexpected errors by default, or weakening
any existing assertion.

---

## Task 19: Desktop Node-floor message derives from engines

- Files: src/desktop/src/renderer/app.ts, src/cli/helpers/messages.ts, tests/cli/desktop-floor-message.test.ts
- Scope: src/desktop/src/renderer/app.ts, src/desktop/src/renderer/, src/desktop/, src/cli/helpers/messages.ts, tests/cli/desktop-floor-message.test.ts
- Model: claude-sonnet-5
- Dependencies: none

Measured (2026-08-11): `desktop.error.node_not_found` hardcodes "Node.js 18+" in en
and tr while the engines floor is >=24 — the same drift class row 450 closed for the
doctor, on the desktop surface; the renderer mirrors getMessage {varName}
interpolation but receives no floor value.

Required: the message gains a `{floor}` placeholder (en+tr); the renderer's message
path receives the floor derived from the packaged manifest at build/runtime (follow
how the renderer already receives versioned values — extend that existing channel,
no new IPC mechanism). A hermetic test pins that no message key matching
/node/i carries a hardcoded major-version literal.

**Test:** `npx vitest run tests/cli/desktop-floor-message.test.ts`

**NO-GO:** a second floor-derivation implementation (reuse the row-450 pattern), or
leaving either language hardcoded.

---

## Task 20: Docs+Scripts vitest onTaskUpdate flake RCA

- Files: follow-up-works/vitest-ontaskupdate-flake-rca-2026-08-12.md
- Scope: follow-up-works/vitest-ontaskupdate-flake-rca-2026-08-12.md, follow-up-works/, .github/workflows/, vitest.config.ts, tests/scripts/, tests/docs/
- Model: gpt-5.6-sol
- Dependencies: none

Measured (recurring; latest 2026-08-11 run 31515424871): the Docs+Scripts shard
passes all tests (1698/1698) then exits 1 with `[vitest-worker]: Timeout calling
"onTaskUpdate"` — the workflow masks it with `continue-on-error: true`, which also
masks REAL failures (it hid part of the 2026-08-11 red wall).

Required: RCA from evidence: which suites run longest in the shard (from run logs),
what the vitest worker RPC timeout is and whether pool/timeout/reporter settings can
eliminate the class honestly (cite vitest config options from its docs), and the
recommended path to REMOVE `continue-on-error` (feeding the required-checks design).
Propose the exact config change, unapplied.

**Test:** document exists with the cited timeout mechanism and a concrete unapplied
remedy; `node scripts/lint-links.mjs` stays green.

**NO-GO:** applying config changes in this task, or recommending keeping
continue-on-error as the permanent state.

---

## Task 21: MASTER settlement notes for the 2026-08-11 decision day

- Files: follow-up-works/master-settlement-notes-2026-08-12.md
- Scope: follow-up-works/master-settlement-notes-2026-08-12.md, follow-up-works/, docs/
- Model: gpt-5.6-sol
- Dependencies: none

Measured: eight owner decisions (2026-08-11) live only as document addenda; the
MASTER-PLAN rows they touch (7011/7012 catalog slices, 526 trust-anchor, 7100
dep-supply, persona rows, crosswalk-born rows) need settlement-note drafts for the
owner's next MASTER window — MASTER-PLAN itself is read-only for this task.

Required: a notes document mapping each decision to the exact MASTER row(s) it
advances, with the receipt-grammar-ready settlement line drafted per row
(`;`-separated segments, no `=` inside description segments, standalone proof=
token), plus the born-row drafts this wave's tasks produce, each validated with
`node scripts/check-born-intake.mjs`. The owner pastes; this task only drafts.

**Test:** document exists; every drafted line names an existing MASTER row id;
intake-checker passes on every born draft.

**NO-GO:** editing docs/MASTER-PLAN.md, or drafting a DONE line for work this wave
has not verified.
