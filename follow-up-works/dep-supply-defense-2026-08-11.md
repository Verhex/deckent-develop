# npm Supply-Chain Defense: Product Evaluation

**Date:** 2026-08-11  
**Decision owner:** Alperen  
**Audience:** Deckent product, runtime, CI, and security owners  
**Status:** evaluation only; no runtime, CI, configuration, or dependency change is authorized by this document

## Executive decision

Deckent should treat dependency installation as an execution-authority problem, not only as a CI hygiene check. The same product orchestrates untrusted project work in worker containers, invokes provider CLIs, and installs its own dependency graph in CI. A compromised package can therefore enter through two distinct trust domains:

- **tenant/project ingress:** a worker runs `npm ci` against a project-controlled manifest and lockfile;
- **Deckent release ingress:** CI installs Deckent's own direct and transitive packages before tests, builds, or publication.

ADR-D-005 already provides the correct policy foundation: dependencies are selected on merit, the lockfile resolves exact versions, rationale belongs in a living inventory, and audit is advisory today. It does **not** yet provide product-level install-script containment, provenance admission, transitive-change review, or an enforceable SBOM/audit gate.

The recommended direction is a staged, fail-closed **Dependency Execution Broker** spanning worker and CI adapters. Phase 0 first produces exact evidence and compatibility data. Later enforcement is owner-gated per trust domain. A global `ignore-scripts` switch is not recommended as the final design because Deckent has native/build-time packages whose legitimate scripts must be classified and deliberately admitted.

## Evidence boundary and confidence

This evaluation distinguishes facts from implementation proposals.

| Evidence class | What is established for this evaluation | Confidence and limitation |
|---|---|---|
| Task-measured repository evidence | Workers run `npm ci` in containers; workers may run arbitrary provider CLIs; Deckent CI installs hundreds of packages; build logs expose an `allowScripts` posture. | These are the measured inputs of MASTER row 7100. The task's bounded read authority did not permit reopening worker, workflow, manifest, lockfile, or build-log paths, so exact call-site names and the literal `allowScripts` value are not reproduced here. Phase 0 makes those facts machine-derived before enforcement. |
| Binding policy evidence | ADR-D-005 makes `package.json` the dependency source of truth, requires a rationale and governing ADR per runtime dependency, requires exact lockfile resolution, and describes `npm audit` as advisory/`continue-on-error` pending an audit/SBOM hard gate. | Binding for this task. Its 2026-06-30 snapshot is explicitly non-canonical and must not be used as a current count. |
| Existing analysis evidence | The live analysis catalog says the former dependency reference moved during docs reset and its permanent home remains open (`DOCS-DEPS-HOME`). It also records a nested docs npm project whose ownership and install policy are unresolved. | Repository evidence in `platform-execution-authority-adapters-2026-08-05.md` and `CODE-DOC-DIFF-2026-08.md`; these are additional inventory gaps, not proof of current install execution. |
| Proposal | Broker, receipts, script allowlisting, quarantine, provenance, SBOM, and promotion gates below. | Requires owner decisions and implementation tasks; none is current behavior. |

**Pre-enforcement rule:** no phase may claim coverage until Phase 0 records the exact worker call sites, every CI install step, package-manager/version, workspace root, flags, effective `allowScripts` value, lockfile, cache boundary, network boundary, and produced artifacts. Unknown or contradictory posture is typed `HOLD`, never interpreted as secure.

## Actual ingress-surface inventory

### 1. Worker-container project install

The measured worker path runs `npm ci` inside a container. Its inputs are the checked-out project's `package.json` and lockfile, not Deckent's dependency inventory. `npm ci` gives deterministic resolution relative to that lockfile, but package lifecycle scripts can execute during installation unless the effective package-manager policy blocks them. Those scripts execute at the worker's authority level and can read mounted workspace data, consume environment credentials, reach the network when permitted, alter generated files, or prepare a binary used later in the task.

Trust boundary:

`tenant repository + lockfile → container npm client → lifecycle/native build processes → workspace/cache/network/output`

Product implication: ADR-D-005 governs Deckent's own admitted dependencies; it does not authorize dependencies chosen by every tenant repository. Worker installation therefore needs tenant- and project-scoped policy, evidence, and exceptions.

### 2. Worker provider-CLI execution

Workers may invoke arbitrary provider CLIs. A CLI can be a globally installed binary, a package-local executable, or a dynamically resolved package command. The exact forms must be captured in Phase 0 because their risks differ:

- an image-baked, digest-pinned CLI belongs to the worker-image supply chain;
- a lockfile-installed local CLI belongs to project install policy;
- a dynamic resolver such as an unpinned package runner adds registry lookup and execution after admission and must be denied or explicitly brokered;
- a host-mounted CLI crosses the container/image trust boundary and requires its own identity receipt.

“Provider authenticated” is not “CLI artifact trusted.” Provider auth, executable provenance, version identity, and runtime capability admission are separate authorities.

### 3. Deckent CI dependency install

Deckent's workflows install hundreds of packages before downstream checks and artifacts. This is a privileged ingress because install-time code can affect test results, generated output, caches, credentials, and release artifacts. Each workflow/job is a separate consumer even when it uses the same lockfile: permissions, secrets, runner image, cache restore keys, and artifact publication change the blast radius.

Phase 0 must enumerate all install forms, including root and nested npm projects. The existing analysis records a separate docs npm project with its own manifest, lock, and toolchain; its current ownership is unresolved, so it must remain an explicit `HOLD` until the live workflow relationship is proven.

### 4. `allowScripts` posture in build logs

Row 7100 says build logs expose an `allowScripts` posture. A log-visible posture is evidence, but not yet an authority contract: it may be package-manager-version-specific, workspace-specific, warning-only, or bypassed by a different install path. Because the literal log value and its producing command are outside this task's bounded read evidence, this document does not invent whether the current posture is allow, deny, or selective.

Required closure is an install receipt containing the effective script policy and observed script set. CI must compare the receipt with declared policy. A warning alone cannot satisfy the gate. Worker and CI policies must be evaluated independently; secure CI defaults do not imply secure tenant installs.

### 5. ADR-D-005 dependency-policy ingress

ADR-D-005 currently supplies four useful controls:

- merit-based selection rather than a dependency-count cap;
- `package.json` as the current direct-dependency source of truth;
- exact resolution through `package-lock.json`, while manifest ranges may use caret syntax;
- rationale/governing-ADR inventory plus advisory inventory-drift and `npm audit` checks.

Residual product gaps are explicit in that ADR: inventory synchronization remains open, audit is non-blocking, SBOM hard-gating is future work, and the inventory drift check is deliberately lenient. Exact resolution constrains version choice but does not prove that the resolved artifact, maintainer account, registry response, or transitive package is trustworthy.

## Threat-to-surface map

| Threat class | Worker-container install | Provider CLI | Deckent CI | Why current controls are insufficient | Required evidence/control |
|---|---|---|---|---|---|
| Install-script execution | A tenant lockfile can select packages with `preinstall`, `install`, or `postinstall`; native builds run with worker authority. | A dynamically obtained CLI can execute package lifecycle code before the CLI entry point; an image-baked CLI can carry prior build-time compromise. | Install-time code can access job token, cache, workspace, and later artifacts. | Lockfile pinning controls resolution, not script capability. A log warning or implicit package-manager default is not policy. | Default-deny discovery install; reviewed package/script allowlist; isolated rebuild lane; effective-policy and executed-script receipt. |
| Typo-squat / update hijack | A malicious direct name or newly poisoned locked version enters with a project change. | Misspelled or floating CLI names can resolve directly to attacker code. | A direct range/lock update can admit a hijacked maintainer release. | `npm ci` faithfully installs a malicious lockfile. Rationale inventory may notice direct names but not publisher/account compromise. | Registry/name policy; no floating execution; signed review of manifest+lock delta; provenance and artifact-integrity verification. |
| Lockfile drift | Manifest/lock mismatch should make `npm ci` fail, but alternate commands, nested workspaces, or regenerated locks can escape the expected path. | Global/dynamic CLI resolution may have no project lockfile. | Different jobs/package-manager versions or hidden nested projects can consume different locks. | A root lockfile is not proof that every ingress uses it; cache restore can obscure provenance. | Canonical install manifest listing command, cwd, package-manager identity, lock digest, registry, and cache digest; reject undeclared install roots. |
| Transitive compromise | A reviewed direct dependency can pull a compromised transitive artifact already represented in a changed lock. | CLI packages bring their own transitive graph. | Hundreds of packages expand maintainer and artifact trust; compromise can taint build output without changing direct inventory. | ADR-D-005's rationale table is direct-dependency oriented; `npm audit` is vulnerability intelligence, not compromise detection. | Full graph diff, SBOM, integrity/provenance checks, new-package/new-maintainer policy, behavioral containment, and artifact lineage. |

Cross-cutting threats include registry/DNS substitution, poisoned caches, compromised base images or package-manager binaries, credential exfiltration, and policy-file tampering. These are relevant only where the Phase 0 inventory proves the corresponding boundary; they must not be converted into generic gates detached from a real ingress.

## Defense architecture

The proposed product boundary is a provider-neutral **Dependency Execution Broker** called by each execution adapter before any package install or package-derived CLI execution. It should use the same policy shape across macOS, Linux, native Windows, WSL, and containers while platform adapters report unsupported isolation honestly.

The broker evaluates a typed request containing tenant, project/run/attempt, trust domain (`worker-project`, `worker-provider-cli`, `deckent-ci`, or future domains), working directory, package-manager executable identity, command/flags, registry, manifest and lock digests, image/runner identity, cache identity, network policy, secret exposure class, and requested output class. Its durable receipt records the effective policy, resolution graph digest, script decision and observed executions, provenance result, SBOM digest, exceptions, and downstream artifact lineage.

Policy is layered rather than global:

- organization baseline;
- tenant policy;
- project policy;
- trust-domain profile;
- exact, expiring owner exception.

An exception names package, version/integrity, script, platform, purpose, expiry, and approver. Wildcard package exceptions and silent fallback are invalid. Receipts must be secret-free, tamper-evident, and bounded in retention/cardinality for million-project scale.

## Phased design and owner decision points

### Phase 0 — Ingress Census and Receipt-Only Observation

**Bound:** worker container installs, every provider-CLI acquisition/execution form, every CI install job, nested npm roots, effective `allowScripts`, package-manager versions, registries, caches, secrets, and output consumers. No enforcement and no command rewrite.

**Deliverables:** machine-derived ingress catalog; per-install receipt schema; baseline of lifecycle scripts and native builds; lock/SBOM graph digest; discrepancies emitted as typed observations. Sensitive environment values are classified, never copied into receipts.

**Why first:** the current measured facts prove multiple ingresses but the bounded evidence does not prove exact call sites or a uniform script posture. Enforcing a guessed default could either leave an unobserved path open or break legitimate native packages.

**Exit evidence:** 100% of known install and package-derived CLI events emit receipts in representative Linux, macOS, Windows-native, WSL, and container lanes; unsupported lanes report typed `unavailable/HOLD`.

**Owner decisions:** approve the canonical broker/receipt authority and retention policy; decide whether nested docs tooling is active, archived, or separately owned; define which environment/secret classes may ever coexist with install execution.

### Phase 1 — Deterministic Resolution and Script Containment

**Bound:** deny undeclared install roots and floating package execution; perform dependency materialization with scripts disabled, then rebuild only an exact package/version/integrity/script allowlist in a restricted lane. Initially gate Deckent CI and dogfood workers; tenant rollout remains observe/warn until compatibility evidence meets the owner threshold.

**Deliverables:** exact package-manager and lock-digest admission; cache provenance and namespace fencing; script allowlist with expiry; restricted rebuild sandbox with minimal mounts, no release secrets, and default-deny network; artifact promotion receipt.

**Why now:** install scripts provide the shortest path from registry content to code execution. Separation preserves legitimate native/build dependencies without granting the whole graph ambient authority.

**Decision gate:** any package that cannot build under the restricted lane is `HOLD` pending explicit exception, replacement, or prebuilt-artifact strategy; there is no silent “run normally” fallback.

**Owner decisions:** choose CI fail-closed date; choose tenant default progression (`observe → warn → enforce`) and compatibility threshold; approve initial exact script exceptions and their maximum lifetime; decide whether dynamic package runners are forbidden or require interactive approval.

### Phase 2 — Change Admission, Provenance, and Graph Review

**Bound:** changes to manifests, lockfiles, registries, package-manager identity, provider CLI artifacts, and worker base images. No general source-code review policy is added.

**Deliverables:** semantic lockfile diff; direct/transitive additions and publisher changes; registry allowlist; integrity and available registry provenance verification; immutable image/CLI identities; risk-tiered owner approval for new or materially changed graph nodes.

**Why second:** after arbitrary install-time execution is contained, the system can make graph identity a reliable promotion input instead of asking reviewers to inspect lockfile noise manually.

**Decision gate:** missing provenance is not automatically malicious, but its treatment is explicit per trust domain: deny, require owner exception, or admit with reduced capabilities and a typed residual risk.

**Owner decisions:** select accepted registries and provenance standards; set thresholds for new package, maintainer/publisher change, age, and download reputation; decide which exceptions require a second credential or external verifier; decide whether tenant policy may be weaker than the Deckent release baseline.

### Phase 3 — SBOM, Vulnerability/Compromise Intelligence, and Promotion Gates

**Bound:** the resolved graph and promoted artifacts from Phases 1–2. Scanners advise; the broker owns the admission verdict.

**Deliverables:** deterministic SBOM tied to lock, install receipt, image, and produced artifact; blocking policy for defined severity/exploitability/fix-availability combinations; malware/compromise intelligence adapters; exception SLA; re-evaluation when intelligence changes.

**Why third:** ADR-D-005 already calls for an audit/SBOM hard gate, but severity-only `npm audit` blocking creates noisy or unsafe incentives. Artifact-linked evidence and typed exception policy are prerequisites for an enterprise gate.

**Decision gate:** fail closed when required intelligence is unavailable for release promotion; worker behavior during intelligence outage is separately owner-selected (deny, quarantined execution, or no-network reduced-capability mode).

**Owner decisions:** approve blocking matrix and SLA; select intelligence authorities; decide offline/air-gapped evidence freshness; approve SBOM format, signing authority, disclosure, and retention.

### Phase 4 — Continuous Revalidation and Multi-Tenant Productization

**Bound:** previously admitted dependency graphs, active worker images, cached artifacts, and provider CLIs. It does not mutate customer repositories automatically.

**Deliverables:** event-driven re-evaluation on advisory, provenance, publisher, registry, or policy change; cache revocation; impacted-run/artifact query; tenant-scoped dashboards/API; fleet canary and rollback; append-only decision history.

**Why last:** a lockfile can remain byte-identical while knowledge about its contents changes. Continuous defense closes that time gap, but only after identities and receipts are stable.

**Owner decisions:** choose revalidation latency by tier; define quarantine versus revoke semantics for running work; approve customer notification and override authority; set data residency, retention, and rate limits.

## Rollout invariants and acceptance evidence

- The worker path and CI path share a contract but never share implicit policy or tenant data.
- Every bypass is exact, expiring, attributable, and visible in the receipt.
- Policy or verifier unavailability produces a typed result; no platform silently downgrades.
- Install jobs never receive release secrets before dependency execution is contained and admitted.
- Caches are content-addressed and fenced by tenant, policy digest, platform, package-manager identity, lock digest, and script decision.
- A downstream artifact is promotable only when its lineage points to an admitted install receipt.
- Audit/SBOM findings are inputs; a scanner does not directly become execution authority.
- Existing ADR-D-005 merit rationales remain required. The broker complements rather than replaces human dependency selection.

Proof-of-function for each enforced phase requires real binary/workflow runs, not mock-only tests: a known lifecycle script is denied, an exact approved native rebuild succeeds, a lock mutation changes the receipt, a poisoned/foreign cache is rejected, an unavailable verifier yields the configured typed outcome, and the promoted artifact resolves back to its SBOM and install receipt.

## Alternatives rejected

| Alternative | Reason rejected |
|---|---|
| Keep `npm audit` advisory only | It detects a subset of known vulnerabilities and neither contains scripts nor proves provenance. |
| Block on all `npm audit` findings immediately | Severity alone lacks exploitability, fix availability, artifact lineage, and exception semantics; it would be noisy without closing install-time execution. |
| Global `ignore-scripts` forever | It breaks legitimate native/build dependencies and tends to create undocumented bypass commands. Script separation plus exact rebuild admission is enforceable. |
| Trust `npm ci` because the lockfile is pinned | Determinism can reproduce a compromised artifact exactly. It does not secure dynamic CLIs, alternate roots, caches, publishers, or scripts. |
| Review direct dependencies only | Most executable content is transitive; provider CLIs and worker projects have graphs outside Deckent's direct inventory. |
| One shared allowlist for CI and all tenants | It violates tenant isolation and conflates Deckent's release risk with customer project requirements. |

## Recommended owner disposition

Approve **Phase 0 only** as the next product slice, with no enforcement semantic change. Require its output to return the exact ingress catalog, literal `allowScripts` posture per install, representative compatibility measurements, and proposed default profiles. Then make separate owner decisions for CI enforcement, dogfood workers, and tenant defaults before Phase 1.

This is not an MVP recommendation: Phase 0 must design the full cross-platform, multi-tenant receipt and policy contract needed by all phases. Its bounded rollout prevents an unverified security assumption from becoming a production authority.

## Repository anchors

- Binding task input: MASTER row 7100 / task 513-005 measured evidence.
- Binding policy: ADR-D-005, “Dependency Policy & Inventory (Merit-Based + Security Discipline),” supplied in the task contract.
- Existing analysis: `platform-execution-authority-adapters-2026-08-05.md`, section 9, records the dependency-inventory home gap.
- Existing analysis: `CODE-DOC-DIFF-2026-08.md`, DOC-04, records the unresolved nested docs npm toolchain.

Paths above are repository-relative prose references rather than Markdown links so this scoped artifact does not assert that relocated or unresolved targets are linkable.

---

## OWNER DECISIONS (Alperen, 2026-08-11 — codex cross-review sonrası)

- **Phase 0: GO** (ingress census, receipt-only). Codex şerhi içselleştirildi: "100% of known"
  closed-world kanıtı sayılmaz; census bilinmeyen-ingress sınıfını açıkça typed bırakır.
- **Acil fix B13'e:** 3 CI install'daki `|| true` fail-open (ci.yml:243,291; coverage.yml:35)
  kaldırılır + `npx` floating-acquisition yasağı eklenir (doğrulanmış bulgu).
- **Phase 1 kabul şartı (codex):** broker bootstrap'ı bağımsız-pinned olmalı (denetleyeceği ilk
  `npm ci`'dan ÖNCE devrede); tenant `observe/warn` dönemi bile secretsiz + default-deny network
  install lane şartıyla. Repo gerçeği not: kök `.npmrc` `ignore-scripts=true` + exact
  `better-sqlite3` rebuild zaten mevcut modeldir; Phase 1 bunu genelleştirir.
- Codex verdict: SOUND-WITH-GAPS; yukarıdaki şartlar boşlukları kapatır.
