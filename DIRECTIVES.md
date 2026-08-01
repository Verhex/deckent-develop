# DIRECTIVES — Sprint 490: Lifecycle Settlement Observation Canary

## Goal

Exercise Deckent's complete lifecycle on an isolated, non-product canary DAG: provider bootstrap,
config-resolved routing, bounded parallel dispatch, dependency release, an intentional
`NO_GO → FIX → DONE` lineage, exact result collection, terminal receipt publication, status
projection and post-run cleanup eligibility. No tracked product source or test file may be changed.

Provider, model, effort and concurrency decisions come exclusively from effective config, registry,
auth/reachability evidence, routing policy and runtime admission. This document does not override
those authorities.

## Observation Contract

- All task writes stay under `.deckent/runtime/lifecycle-canary/`.
- The first independent wave has six collision-free logical tasks, matching but not forcing the
  currently admitted worker capacity.
- Task `490-006` is a deliberate repair canary. Its original attempt must report honest `NO_GO`;
  only a generated FIX descendant may repair the fixture and settle the lineage.
- Task `490-009` depends on the repaired logical lineage, not merely the failed original attempt.
- No worker may run `npm run build`, a full test suite, provider login/auth mutation, git commit,
  cleanup, finalize or lifecycle control commands.
- Every task verifies only its exact scoped artifact with an async-safe Node command.
- Supervisor evidence to inspect: task/result/heartbeat/log/landing-proposal artifacts, provider
  concurrency, event sequence, FIX lineage, dependency unblock order, terminal receipt, canonical
  status read model and exact cleanup eligibility.

---

## Task 1: Publish alpha root artifact

- Files: .deckent/runtime/lifecycle-canary/alpha.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: none

Create `alpha.txt` with exactly:

```text
alpha=ready
source=independent
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/alpha.txt';const e='alpha=ready\nsource=independent\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Missing file, byte mismatch, out-of-scope write or synthetic DONE without disk proof.

## Task 2: Publish beta root artifact

- Files: .deckent/runtime/lifecycle-canary/beta.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: none

Create `beta.txt` with exactly:

```text
beta=ready
source=independent
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/beta.txt';const e='beta=ready\nsource=independent\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Missing file, byte mismatch, out-of-scope write or synthetic DONE without disk proof.

## Task 3: Publish gamma root artifact

- Files: .deckent/runtime/lifecycle-canary/gamma.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: none

Create `gamma.txt` with exactly:

```text
gamma=ready
source=independent
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/gamma.txt';const e='gamma=ready\nsource=independent\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Missing file, byte mismatch, out-of-scope write or synthetic DONE without disk proof.

## Task 4: Publish delta root artifact

- Files: .deckent/runtime/lifecycle-canary/delta.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: none

Create `delta.txt` with exactly:

```text
delta=ready
source=independent
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/delta.txt';const e='delta=ready\nsource=independent\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Missing file, byte mismatch, out-of-scope write or synthetic DONE without disk proof.

## Task 5: Publish epsilon root artifact

- Files: .deckent/runtime/lifecycle-canary/epsilon.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: none

Create `epsilon.txt` with exactly:

```text
epsilon=ready
source=independent
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/epsilon.txt';const e='epsilon=ready\nsource=independent\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Missing file, byte mismatch, out-of-scope write or synthetic DONE without disk proof.

## Task 6: Exercise intentional repair lineage

- Files: .deckent/runtime/lifecycle-canary/repair.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: none

This is a bounded lifecycle canary, not an implementation failure:

- On the original task `490-006`, read `repair.txt`, do not modify it, prove that it contains
  `state=broken`, and return honest `NO_GO` with reason `intentional-repair-canary`.
- On a generated FIX descendant for this task, replace the file atomically with exactly:

```text
state=repaired
authority=fix-descendant
```

Then read it back and return `DONE` only when the bytes match. No non-FIX attempt may claim GO.

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/repair.txt';const e='state=repaired\nauthority=fix-descendant\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Original attempt claims DONE, FIX is not spawned, repair bytes differ, or lineage evidence is missing.

## Task 7: Join alpha and beta

- Files: .deckent/runtime/lifecycle-canary/join-a.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-001, 490-002

Read both dependency artifacts, require their exact root payloads, then create `join-a.txt` with:

```text
join=a
inputs=alpha,beta
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/join-a.txt';const e='join=a\ninputs=alpha,beta\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Dependency content absent/mismatched, premature dispatch, output mismatch or out-of-scope write.

## Task 8: Join gamma and delta

- Files: .deckent/runtime/lifecycle-canary/join-b.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-003, 490-004

Read both dependency artifacts, require their exact root payloads, then create `join-b.txt` with:

```text
join=b
inputs=gamma,delta
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/join-b.txt';const e='join=b\ninputs=gamma,delta\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Dependency content absent/mismatched, premature dispatch, output mismatch or out-of-scope write.

## Task 9: Join repaired lineage and epsilon

- Files: .deckent/runtime/lifecycle-canary/join-repair.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-005, 490-006

Do not start from the original `490-006` NO_GO alone. Require the logical repair lineage to be
settled by a FIX descendant and require both exact input payloads. Then create `join-repair.txt`:

```text
join=repair
inputs=epsilon,repaired
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/join-repair.txt';const e='join=repair\ninputs=epsilon,repaired\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Original NO_GO is treated as dependency success, FIX settlement is absent, or output differs.

## Task 10: Build left branch

- Files: .deckent/runtime/lifecycle-canary/branch-left.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-007, 490-008

Verify both join artifacts and create `branch-left.txt`:

```text
branch=left
inputs=join-a,join-b
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/branch-left.txt';const e='branch=left\ninputs=join-a,join-b\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Premature dispatch, dependency mismatch or output mismatch.

## Task 11: Build right branch

- Files: .deckent/runtime/lifecycle-canary/branch-right.txt
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-001, 490-009

Verify both inputs and create `branch-right.txt`:

```text
branch=right
inputs=join-repair,alpha
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/branch-right.txt';const e='branch=right\ninputs=join-repair,alpha\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Repaired dependency lineage is unresolved, premature dispatch or output mismatch.

## Task 12: Validate left branch

- Files: .deckent/runtime/lifecycle-canary/left-valid.json
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-010

Verify the exact left branch and create `left-valid.json` as one canonical JSON line:

```json
{"branch":"left","valid":true}
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/left-valid.json';const e='{\"branch\":\"left\",\"valid\":true}\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Invalid JSON, extra fields, dependency mismatch or output mismatch.

## Task 13: Validate right branch

- Files: .deckent/runtime/lifecycle-canary/right-valid.json
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-011

Verify the exact right branch and create `right-valid.json` as one canonical JSON line:

```json
{"branch":"right","valid":true}
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/right-valid.json';const e='{\"branch\":\"right\",\"valid\":true}\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Invalid JSON, extra fields, dependency mismatch or output mismatch.

## Task 14: Publish final DAG proof

- Files: .deckent/runtime/lifecycle-canary/final.md
- Scope: .deckent/runtime/lifecycle-canary/
- Dependencies: 490-012, 490-013

Require both validation artifacts and the repaired lineage payload, then create `final.md` exactly:

```markdown
# Lifecycle Observation Complete
left=valid
right=valid
repair=recovered
```

**Test:** `node --input-type=module -e "import fs from 'node:fs';const p='.deckent/runtime/lifecycle-canary/final.md';const e='# Lifecycle Observation Complete\nleft=valid\nright=valid\nrepair=recovered\n';if(fs.readFileSync(p,'utf8')!==e)process.exit(1)"`

**NO-GO:** Any upstream proof is absent, FIX lineage is unresolved, output differs or DONE is synthetic.
