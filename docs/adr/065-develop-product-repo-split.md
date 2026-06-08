# ADR-065: Develop / Product Two-Repo Split

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-31

**Sprint:** Sprint 201 (Task 201-004 — repo-split ADR + audit-report immutable note)

---

## Status

accepted — two-repo model adopted as of Sprint 201 pre-launch preparation.

---

## Context

Deckent's development history lives in a single internal repo (`deckent-develop`).
After 200+ sprints of dogfood the repo contains large internal directories that
are noise for public users:

| Directory | Approx. files | Contents |
|-----------|:------------:|----------|
| `.brain/` | 2 554 | sprint logs, memory.db exports, patterns, retro history |
| `.deckent/archive/` | 1 511 | archived task files from past sprints |
| `docs/audits/` | hundreds | per-sprint internal audit reports |
| `docs/alperen-analysis/`, `docs/superpowers/`, etc. | hundreds | internal analysis, Alperen-personal notes |
| `DIRECTIVES.md` | 1 | sprint-in-progress instructions (user noise) |

Publishing this raw history to a public GitHub repo creates two problems:

1. **Vitrin/internal conflict.** A prospective user landing on the GitHub page sees
   hundreds of internal files and thousands of sprint artifacts before reading a
   single line of product docs. Trust erodes.
2. **Security surface.** Sprint internals can embed partial API keys (captured
   during dogfood), personal notes, and in-progress decisions not meant for public
   consumption.

Additionally, Sprint 200 surfaced the **audit-report drift incident**: an automated
counter (`managed-docs` sprint-metrics generator) modified
`docs/audits/sprint-139/dead-code-report.md`, changing the historical dead-code
count `864` to the current `870`. The change was caught and reverted, but it
revealed a policy gap — historical audit reports were not explicitly marked as
immutable, and the managed-docs tooling had no guard against touching them.

---

## Decision

Maintain **two separate git repositories**:

| Repo | Purpose | History | Visibility |
|------|---------|---------|-----------|
| `deckent-develop` | Full development repo — sprint work, dogfood, internals | Complete history, all sprint artifacts | Private |
| `deckent` | Product repo — clean public snapshot for users and npm | Orphan commits (no internal history) | Public (VerhexIO/deckent) |

Synchronisation from develop → product is performed via the `scripts/sync-to-product.mjs`
script (ADR companion: Sprint 201 Task 201-003). The script:
- Uses `git archive HEAD` to extract only git-tracked files.
- Applies an EXCLUDE list that strips all internal directories.
- Runs a security gate (real key scan) before staging.
- Produces a staging directory; **push is always a manual human action** (public-publish blast-radius).

The npm package (`package.json` `files` field: `dist/`, `bin/`, `README.md`,
`LICENSE`) is unaffected by the repo split — it was already narrowly scoped.

### Audit-report Immutable Policy

Historical sprint audit reports (`docs/audits/sprint-NNN/`) are **immutable** after
the sprint that produced them closes. They record a verified snapshot of codebase
health at a point in time; retroactive counter updates destroy their evidentiary
value.

Enforcement:
- `docs/audits/` is **not** and **must not** be listed in `.deckent/docs.json`
  (the managed-docs registry). The managed-docs system touches only the 11
  explicitly registered docs (CLAUDE/VISION/beta-tracker/IDENTITY/blueprint/
  AGENTS/TOOLS/BOOT/WORKER-GUIDE).
- Any PR or sprint task that modifies a file under `docs/audits/sprint-NNN/`
  for a closed sprint must be blocked unless the change is purely additive
  (appending a post-hoc note) and is signed off by the product owner.
- Root cause of the Sprint 200 incident: the sprint-metrics generator ran over
  a file it should not have had access to. The generator now explicitly skips
  `docs/audits/**` paths.

---

## Consequences

### Easier
- Public GitHub vitrine (`VerhexIO/deckent`) contains only product-relevant files:
  `src/`, `dist/`, `docs/` (reference + guide), `README.md`, `LICENSE`.
- Internal sprint history remains fully intact in `deckent-develop` — no history loss.
- npm publish pipeline is unchanged (`npm publish` already uses the `files` field).
- Historical audit reports are protected from automated modification.

### Harder
- Every public release requires running `sync-to-product.mjs --apply` and then a
  manual `git push` to the product repo — one extra step per release cycle.
- Contributors who fork the product repo do not see sprint history; they must be
  directed to `deckent-develop` for full context.
- The EXCLUDE list in `sync-to-product.mjs` must be kept in sync with new
  internal directories. It is the single authoritative list — no config duplication.

### Risks
- **Stale EXCLUDE list.** If a new internal directory is created in `deckent-develop`
  and is not added to EXCLUDE before the next sync, it leaks into the product repo.
  Mitigation: `sync-to-product.mjs --dry-run` output is reviewed before `--apply`.
- **Orphan commit chain.** Product repo has no shared history with develop repo.
  `git blame` across repos is impossible. Mitigation: commit messages in the product
  repo reference the develop sprint ID (e.g., `"sync from deckent-develop sprint-201"`).

---

## Alternatives Considered

1. **Single public repo with `.gitignore` for internals** — rejected. `.gitignore`
   prevents tracking new files but cannot hide already-tracked files retroactively
   without `git rm --cached`. More importantly, the full sprint history (`.brain/`,
   `.deckent/archive/`, `docs/audits/`) would remain in the git object store and be
   visible via `git log --all`. The vitrin/internal conflict is not resolved.

2. **git-subtree / git-filter-repo to produce a filtered history** — rejected.
   `git filter-repo` produces a rewritten history that diverges from `deckent-develop`
   at the first commit. Any future cherry-pick or merge between the two repos becomes
   a manual conflict-resolution exercise. Orphan commits (our choice) are simpler:
   the product repo does not pretend to share history with the develop repo.

3. **Monorepo with path-scoped publish (`npm publish --workspace`)** — rejected.
   Deckent is a single npm package, not a monorepo of packages. A monorepo structure
   would add tooling complexity (Turborepo, Nx, or similar) with no benefit.

4. **Private npm registry for the product package** — rejected. The product vision
   (ADR-033) is an open-source tool; a private registry contradicts that goal.

---

## References

- ADR-033 (Product Vision — Product Not Service)
- ADR-036 (ADR Governance Integration)
- ADR-029 (Managed-Docs Universalization) — the 11-doc registry that explicitly
  excludes `docs/audits/`
- Sprint 201 Task 201-003 — `scripts/sync-to-product.mjs` implementation
- Sprint 200 incident: automated counter modified `docs/audits/sprint-139/dead-code-report.md`
  (historical `864` → `870`); change reverted in commit cf1ab8e2
