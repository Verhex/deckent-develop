# DIRECTIVES — Sprint-B11: eight-task factory wave two

## Goal

Eight MASTER-PLAN rows advance: the credential exposure taxonomy rerun (2030) feeding
the runtime credential lifecycle design (4131); the invocation receipt design (4070);
the kernel ontology design (3010); the autonomous tenant authority slice (4021); the
config truth slice (470); the trust-anchor solo mitigation design (526); and the
owner-commissioned persona-as-system-prompt spawn analysis (agent design D4 addendum).
Task 2 declares a dependency on task 1; all other tasks are scope-disjoint. Analysis
artifacts belong under follow-up-works/ — docs/ is product documentation only.

Read visibility note for every documentation task: reading the repository sources for
EVIDENCE is expected and permitted — the write authority is what the Files line
constrains. State every claim with file-level evidence.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

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
- New user-facing text goes through the i18n message authority (`getMessage`, en+tr);
  CLI descriptions are plain strings matching the surrounding file.
- Zero hardcode (ADR-G-036): no model name or flow value literal on a code path.

---

## Task 1: Runtime-visible credential exposure taxonomy (row 2030, rerun)

- Files: follow-up-works/credential-exposure-taxonomy-2026-08-11.md
- Scope: follow-up-works/credential-exposure-taxonomy-2026-08-11.md, follow-up-works/, src/providers/, src/orchestra/, src/core/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 2030; first attempt refused honestly when its read view excluded the
sources): the current Docker Codex auth copy is not zero-exposure, and no honest
classification exists for how each provider credential is visible at runtime. A
partial artifact from the refused attempt exists at the target path recording the
evidence hold — REPLACE it with the completed taxonomy.

Required: classify every provider credential path the code ACTUALLY uses (read the
spawn backends, credential stores and provider adapters — they are inside your scope)
into host-only, env, tmpfs-copy, persistent-copy and enterprise custody — with
file-level evidence per classification, the exposure window and revocation story for
each, and the honest verdict for the Docker Codex auth copy. Owner decision points for
every tightening step. Document only; the src/ scope entries are for READ evidence —
writing any file outside follow-up-works is a NO-GO.

**Test:** the document exists at the exact path with every credential path classified;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** production or config edits, a classification without file-level evidence,
or claiming zero-exposure anywhere the code shows a copy.

---

## Task 2: Runtime credential lifecycle service contract (row 4131 first slice)

- Files: follow-up-works/runtime-credential-lifecycle-design-2026-08-11.md
- Scope: follow-up-works/runtime-credential-lifecycle-design-2026-08-11.md, follow-up-works/, src/api/, src/cli/, src/connectors/
- Model: claude-opus-5
- Dependencies: taxonomy

Measured (row 4131): API/terminal tokens and serve daemon descriptors are created,
published, rotated and retired by scattered call sites — dead PIDs, port reuse,
restarts, concurrent daemons and partial writes each have ad-hoc handling.

Required: a design document (the file named in Files — NEW) that inventories every
current credential/descriptor call site (api-token, terminal-token, serve-daemon
descriptors, bot pid publication) with file-level evidence; consumes task 1's
taxonomy classes for custody labeling (read its artifact from follow-up-works — the
declared dependency guarantees ordering); and specifies the single lifecycle service
the row demands — creation→publication→rotation→revocation→shutdown/crash retirement,
atomic and least-privilege, bound to project+tenant+principal+generation+endpoint+
expiry — sliced into admission-sized packages with proof obligations and owner
decision points. Proposes only; writes only its own file.

**Test:** the document exists at the exact path; `node scripts/lint-links.mjs` green.

**NO-GO:** production or config edits, losing the crash-retirement case, or custody
labels contradicting the taxonomy.

---

## Task 3: Immutable InvocationReceipt design and first slice map (row 4070)

- Files: follow-up-works/invocation-receipt-design-2026-08-11.md
- Scope: follow-up-works/invocation-receipt-design-2026-08-11.md, follow-up-works/, src/providers/, src/core/, src/orchestra/
- Model: claude-opus-5
- Dependencies: none

Measured (row 4070): every provider call must eventually carry an immutable
InvocationReceipt — requested/resolved/called identity, authority, fallback, usage and
settlement provenance — while today usage evidence lives across the budget-observation
chain, the provider-execution-observation store and per-provider usage streams
without one immutable per-call receipt.

Required: a design document (NEW) that maps today's per-call evidence surfaces with
file-level anchors (where a provider call's identity, authority resolution, fallback
decision, usage and settlement are recorded NOW); defines the receipt schema and its
immutability/chaining contract reusing the existing audit-chain patterns; states how
it composes with (not duplicates) the budget-observation and provider-observation
stores; slices implementation into admission-sized packages; and names the owner
decision points (retention, tenant fencing, redaction). Proposes only.

**Test:** the document exists at the exact path; `node scripts/lint-links.mjs` green.

**NO-GO:** production edits, a second usage-evidence mechanism (composition only), or
claims without file anchors.

---

## Task 4: Kernel ontology — canonical entities, ownership, transitions (row 3010)

- Files: follow-up-works/kernel-ontology-design-2026-08-11.md
- Scope: follow-up-works/kernel-ontology-design-2026-08-11.md, follow-up-works/, src/core/, src/orchestra/
- Model: claude-opus-5
- Dependencies: none

Measured (row 3010, 2026-07-27 code-truth, still live): `Flow` is used in three
unrelated senses (ScheduledFlow, RunFlow lifecycle, autonomous trace); entities carry
no causal ownership between Goal, Mission, Flow, Run, WorkItem, Attempt and Operation
even though the Brain contract names that chain as canonical.

Required: a design document (NEW) that inventories every entity noun in src/core and
src/orchestra with its actual current meaning(s) and file anchors; proposes the
canonical entity table — identity scheme, owner, allowed transitions, invariants,
versioning — resolving each name collision with an explicit rename-or-alias route;
maps the canonical chain onto the existing stores; slices the migration into
admission-sized packages that never break running lifecycles mid-migration; and names
the owner decision points. Proposes only.

**Test:** the document exists at the exact path; `node scripts/lint-links.mjs` green.

**NO-GO:** production edits, an ontology that renames without a migration route, or
unanchored claims.

---

## Task 5: Fail-closed tenant authority for autonomous ingress (row 4021 first slice)

- Files: src/orchestra/autonomous/approval-adapter.ts, tests/orchestra/autonomous-tenant-authority.test.ts
- Scope: src/orchestra/autonomous/approval-adapter.ts, src/orchestra/autonomous/, tests/orchestra/autonomous-tenant-authority.test.ts
- Model: gpt-5.6-sol
- Dependencies: none

Measured (row 4021): autonomous read, mutation, approval and reactive ingress must
resolve one tenant/project scope from a verified principal — a non-admin foreign or
tenant-less strict caller must obtain no metadata, existence signal or mutation
authority. Today the approval adapter accepts callers without a single fail-closed
tenant resolution.

Required: root-cause first — read the autonomous ingress surfaces (the approval
adapter at minimum; inventory the others in the result notes) and record which today
resolve tenant scope and which accept tenant-less callers. Then the FIRST slice: the
approval ingress (approve/reject/pending) resolves exactly one tenant/project scope
from the verified principal via the existing principal machinery (PRINCIPAL-001 is
DONE — consume it, never reimplement), fails closed typed for foreign or tenant-less
strict callers WITHOUT leaking existence, and keeps solo-mode default-tenant
behaviour byte-identical. Hermetic tests pin: solo passes unchanged, foreign caller
gets the typed refusal with no metadata, tenant-less strict caller likewise.

**Test:** `npx vitest run tests/orchestra/autonomous-tenant-authority.test.ts`

**NO-GO:** changing solo-mode behaviour, a second principal/tenant resolver, or a
refusal that leaks existence metadata.

---

## Task 6: Config leaf metadata from one canonical source (row 470 first slice)

- Files: scripts/lint-config-truth.mjs, tests/scripts/config-truth-gate.test.ts
- Scope: scripts/lint-config-truth.mjs, tests/scripts/config-truth-gate.test.ts, scripts/
- Model: gpt-5.6-terra
- Dependencies: none

Measured (row 470, CFG-03/CFG-04): 164 config leaves need a no-missing and equality
gate — leaf metadata and default production must come from one canonical source, and
the manifest backend default must consume the same source; today defaults drift
between config-types, the config loader and the manifest.

Required: a fail-closed lint (the .mjs named in Files — NEW) that enumerates the
config leaves from the canonical typed source (read src/core/config-types.ts and the
loader read-only), compares every leaf's default against what the runtime
config-loading path would produce, and reports missing or divergent leaves typed; a
test driving it against the real repo (recording the current pass/fail truth in the
result notes honestly — if leaves diverge TODAY, the lint proves it and the count is
the finding, not a reason to weaken the gate) plus fixture divergences. NOT wired
into CI chains in this slice.

**Test:** `npx vitest run tests/scripts/config-truth-gate.test.ts`

**NO-GO:** editing any config source or default to make the gate pass, or wiring
into CI here.

---

## Task 7: Trust-anchor solo mitigation package design (row 526)

- Files: follow-up-works/trust-anchor-solo-design-2026-08-11.md
- Scope: follow-up-works/trust-anchor-solo-design-2026-08-11.md, follow-up-works/, .github/, docs/evidence/
- Model: claude-sonnet-5
- Dependencies: none

Measured (row 526): the solo-account structural mitigations are named by the row —
out-of-repo canonical check via a GitHub App with a separate integration identity, a
bot machine-account with a path-scoped required-reviewer rule on
.github/workflows/** and the validator paths, a nightly ruleset snapshot into an
append-only ledger the org owner cannot write, and a GHEC-trial evaluation.

Required: a design document (NEW) that reads the existing trust-anchor evidence
(docs/evidence/trust-anchor/, the workflows, the ruleset facts recorded in ledger
row 520) and specifies each of the four mitigations concretely for THIS repository:
exact GitHub resources to create, their identity separation argument, the failure
modes each mitigation closes (mapped to the xverify-E mechanical variants recorded on
row 520), rollout order, and the owner actions versus automatable steps. Honest cost
notes (GHEC trial, App hosting). Proposes only.

**Test:** the document exists at the exact path; `node scripts/lint-links.mjs` green.

**NO-GO:** creating any GitHub resource, editing workflows, or a mitigation without
an identity-separation argument.

---

## Task 8: Persona-as-system-prompt agent spawning across providers (owner D4 addendum)

- Files: follow-up-works/persona-systemprompt-spawn-analysis-2026-08-11.md
- Scope: follow-up-works/persona-systemprompt-spawn-analysis-2026-08-11.md, follow-up-works/, src/providers/, src/orchestra/
- Model: claude-opus-5
- Dependencies: none

Measured (owner decision D4 addendum on the agent catalog design, 2026-08-11): the
owner proposes spawning deckent agents by injecting the agent persona as a system
prompt at the provider CLI/API boundary — the `claude -p` append-system-prompt
pattern generalized — instead of only prepending persona text into the user prompt,
and asks for an analysis across the most popular ~20 providers in both API and
subscription modes.

Required: an analysis document (NEW) with three parts. (1) Code truth: how each
CURRENT deckent provider adapter (read src/providers/) injects persona/system
content today — exact command/flag/API-field per adapter with file anchors, and
whether a true system-role channel is used or the persona rides the user prompt.
(2) Capability matrix: for the popular provider set (the adapters present in the
repo plus the majors you can enumerate from training — label anything unverifiable
as needs-live-verification, NEVER invent a flag), whether a system-prompt injection
channel exists in CLI mode, API mode and subscription mode, and its shape. (3)
Design proposal: a provider-neutral persona-injection contract for the spawn layer —
where the persona resolves from the (freshly owner-decided) agent catalog, how it
degrades on providers without a system channel, and admission-sized implementation
slices with owner decision points. Proposes only.

**Test:** the document exists at the exact path with all three parts;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** production edits, inventing provider flags without a needs-live-
verification label, or a design that hardcodes provider names on code paths instead
of adapter capability declarations.
