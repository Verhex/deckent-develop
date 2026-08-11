# DIRECTIVES — Sprint-B9: the catalog-authority vision pair, design-first

## Goal

Two MASTER-PLAN rows advance with design-first slices: the effective agent catalog
authority (7011) and the effective skill catalog authority (7012). Both are
G2-gated architecture rows — this wave produces the reviewed design artifacts and the
owner decision points, NOT the implementation; the implementation slices are admitted
separately after the owner reviews. Design artifacts belong under follow-up-works/ —
docs/ is product documentation only.

Provider, model, effort and effective concurrency are resolved from effective config,
registry, role policy, auth/reachability evidence, usage/limit authority and host admission.

## Execution Contract

- NO production code, NO config edits, NO schema files in this wave — design artifacts
  and result notes only. Reading the entire relevant source is expected and required.
- Fail closed on ambiguity; where the code truth is unclear, the design says so
  instead of guessing.
- Workers must not run `npm run build`, full `npm test`, provider login/auth mutation,
  sprint lifecycle commands, git commit, or cleanup.
- Zero hardcode thinking applies to the DESIGN too (ADR-G-036): no model or flow
  literals as design constants; everything resolves from registry/config.

---

## Task 1: Agent catalog authority — design and owner decision points (row 7011)

- Files: follow-up-works/agent-catalog-authority-design-2026-08-11.md
- Scope: follow-up-works/agent-catalog-authority-design-2026-08-11.md, follow-up-works/
- Model: claude-opus-5
- Dependencies: none

Measured (row 7011, 2026-08-10 code-truth): AgentPoolManager provides an effective
fallback chain, but the CLI, MCP and docs surfaces raw-scan directories instead of
consuming one authority; 18 agent-specific built-in/project drift items exist; a clean
checkout and a long-lived machine-local runtime disagree about the effective catalog.

Required: a single design document (the file named in Files — NEW) that: inventories
every current agent-discovery call site (CLI, MCP, API, terminal, dashboard, docs
generators, worker prompt assembly) with file-level evidence; defines the layered
authority model the row names — shipped built-in, project override, learned/runtime,
archive — with precedence, stable agent IDs, a versioned schema, and enabled/
routability/invalid/provenance states; specifies the single read model every surface
consumes and the determinism contract between clean checkout and machine-local
runtime; slices the implementation into admission-sized work packages with per-slice
proof obligations; and names every owner decision point explicitly (precedence order,
learned-agent promotion policy, archive semantics). The document proposes; it decides
nothing.

**Test:** the document exists at the exact path with every section above;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** production or config edits, a design that invents surfaces the code does
not have, or coverage claims without file-level evidence.

---

## Task 2: Skill catalog authority — design and owner decision points (row 7012)

- Files: follow-up-works/skill-catalog-authority-design-2026-08-11.md
- Scope: follow-up-works/skill-catalog-authority-design-2026-08-11.md, follow-up-works/
- Model: claude-opus-5
- Dependencies: none

Measured (row 7012): the skill surface adds layers agents do not have — generated/
learned skills (the first persisted one, project-conventions, landed this campaign),
quarantine and retirement, V3 profiles (the SKILLMD-INGEST family is BLOCKED on a V3
reconciliation receipt), declared entrypoints with referenced-file authority, and
effective sidecar stats — while CLI, MCP, worker prompts and docs each resolve skills
their own way today.

Required: a single design document (the file named in Files — NEW) mirroring the
agent design's structure: call-site inventory with file-level evidence (skill-pool,
skill-registry, temp generation, worker prompt injection, marketplace surfaces);
layered authority with precedence — shipped, project override, generated/learned,
quarantined, retired — path-safe stable IDs, versioned schema, entrypoint and
referenced-file authority, V3-profile state carried as data (the reconciliation
DECISION stays with the owner and the blocked row); the single read model for every
consumer including the worker prompt; the determinism contract; a scale note for the
row's 1000-skill multi-tenant lookup and cache invalidation obligation; admission-
sized implementation slices with proof obligations; and explicit owner decision
points. Proposes only.

**Test:** the document exists at the exact path with every section above;
`node scripts/lint-links.mjs` stays green.

**NO-GO:** production or config edits, deciding the V3 reconciliation, or coverage
claims without file-level evidence.
