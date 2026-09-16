# Development and release operations

## Product-user perspective

Deckent is currently packaged as `0.100.0`. The npm package exposes two binaries, `deckent` and `deckent-mcp`, plus the package root and `deckent/sdk` import paths. The declared runtime floor is Node.js 24. [Evidence: `package.json:2-20,115-123`]

### Install and build surfaces

| Purpose | Command | What the repository actually runs |
|---|---|---|
| Install all workspaces | `npm run install:all` | Root, dashboard, and desktop each receive `npm ci`. [Evidence: `package.json:41`] |
| Core build | `npm run build` | Clean, TypeScript compile, then asset copy. [Evidence: `package.json:23`] |
| Full web build | `npm run build:all` | Clean, TypeScript compile, asset copy, dashboard build. [Evidence: `package.json:37-38`] |
| Desktop build | `npm run build:desktop` | Runs the desktop package build separately; it is not part of `build:all`. [Evidence: `package.json:73-76`] |
| Development compiler | `npm run dev` | TypeScript watch mode. [Evidence: `package.json:24`] |

The owner reported a successful `npm run build:all` before this documentation continuation. This audit did not rerun it because a build had just completed and project policy forbids rebuilding during an active sprint. [Evidence: owner message; `AGENTS.md:88-91`]

### Verification surfaces

The repository distinguishes core tests, watch, coverage, contained CI simulation, end-to-end surfaces, binary contracts, dashboard tests, desktop tests, TypeScript linting, and focused policy linters. [Evidence: `package.json:25-60,73-77`]

The composite `lint` performs core TypeScript, dashboard TypeScript, and `lint:gates`. `lint:gates` chains CLI/MCP parity, model literal, i18n hardcode, layer shim, hermetic test, gitignore, routing distribution, desktop API sync, manifests, built-ins drift, master-plan, and design-token checks. [Evidence: `package.json:39,42-60`]

Do not equate one test suite with publish readiness. The repository's production-wiring rule requires canonical producer→consumer→entrypoint→policy closure and real execution evidence for a changed surface. [Evidence: `AGENTS.md:42-55`]

### Generated documentation ownership

The following commands own generated projections:

```bash
npm run docs:ref
npm run docs:stats
npm run docs:master-plan
```

Their `:check` counterparts detect drift without intentionally rewriting outputs. `scripts/gen-reference-docs.mjs` parses MCP tools/resources, ADR input, CLI command source, and agent manifests, then writes deterministic AUTOGEN regions/targets. [Evidence: `package.json:66-71`; `scripts/gen-reference-docs.mjs:1-18,36-190,208-260`]

Manual and generated documents have different owners. Do not hand-edit `docs/generated/**`; run the owning pipeline under proper authority. `docs/MASTER-PLAN.md` is the planning SSOT and is not a generated target to rewrite casually. [Evidence: owner Tur-2 boundary; `scripts/lint-master-plan.mjs:3-10,49-51`]

Doc tracking is a separate live, opt-in capability: core scan/store modules persist document health; CLI and MCP expose scan/status actions; the API and dashboard project health; and sprint finalization can run a DB-only sync when `doc_tracking.sync_on_finalize:true`. Archived specs that label this entire surface “pending” are stale, but runtime adoption is not universal because the finalizer hook defaults off. [Evidence: `src/core/doc-tracking/scanner.ts:40`; `src/core/doc-tracking/store.ts`; `src/cli/commands/docs.ts:12-25`; `src/mcp/tools/docs.ts:18-41`; `src/api/docs-health-endpoint.ts:2-44`; `src/dashboard/src/nav-items.ts:69`; `src/orchestra/sprint-finalizer.ts:985-998,2564-2569`; `src/core/config-types.ts:1337`]

### Release gate

`npm run release` runs master-plan lint, docs stats check, generated reference check, identity lint, full build, and publish validation. `prepublishOnly` runs the same documentation/identity checks and core build. [Evidence: `package.json:64-72`]

`validate:publish` performs pack-size/category, Node-engine, entry-point, internal-state-leak, ADR/link lint, executable-bit, and dashboard-bundle checks. It uses `npm pack --dry-run --json --ignore-scripts`; malformed or empty pack evidence fails honestly. The script never publishes—Alperen performs `npm publish` manually after approval. [Evidence: `scripts/validate-publish.mjs:1-24,36-55,188-220`]

### Release operator checklist

1. Confirm no active sprint before build and coordinate any host-adapter restart. [Evidence: `AGENTS.md:88-91,139-143`]
2. Run the tests and focused validators appropriate to the changed surfaces. [Evidence: `package.json:25-60,73-77`]
3. Regenerate pipeline-owned documentation, then run its check mode. [Evidence: `package.json:66-71`; `scripts/gen-reference-docs.mjs:1-18`]
4. Run `npm run release`; investigate any gate failure rather than bypassing it. [Evidence: `package.json:64-72`]
5. Before any owner-requested commit/push, inspect `git branch -vv` because the worktree is shared. [Evidence: `AGENTS.md:91-94`]
6. Publishing remains a separate, explicit owner action. [Evidence: `scripts/validate-publish.mjs:20-23`]

### Upgrade and migration contract

`deckent upgrade` distinguishes `latest`, `beta`, and `canary` channels; detects global, local, npx, or unknown installation; can check registry state, show registry changelog metadata, install from a local package, save the previous version, and request rollback. The installation and rollback branches execute npm mutations and were help/source-verified only in this audit. [Evidence: `src/cli/commands/upgrade.ts:17-20,64-94,97-149,151-240,429-456`; real `upgrade --help` in the 211-path audit]

Package upgrade and project-data migration are separate operations:

| Data family | Current migration behavior | Operational rule |
|---|---|---|
| Config | Missing fields are filled, legacy mode/provider/model aliases are canonicalized, and v1 model strategy can migrate to tier/provider fields. Alias validation occurs before a migration mutates the parsed object. | Preview/backup the exact config, run the owning migrator, then compare effective config and provenance. [Evidence: `src/core/config-migration.ts:104-165,227-233,440-607`] |
| Memory DB | Additive, column-existence-guarded migrations preserve existing entries; destructive DROP/rebuild is explicitly excluded. | Verify schema version, row counts and recall/export after open. [Evidence: `src/core/memory-store.ts:183-255`] |
| Mission DB | Dedicated mission migration and the SQLite store own mission/work-item schema evolution. | Preserve lease, claim-fence, dependency and approval identities; do not edit rows manually. [Evidence: `src/orchestra/autonomous/mission-store/mission-migrate.ts`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`] |
| Provider observation DB | Source expects schema v2 while this workspace remains v1. | Owner-controlled backup/migration/smoke is still `HOLD`; documentation cannot perform it. [Evidence: real PRAGMA; `src/core/provider-execution-observation-store.ts:114-169`; OQ-07] |

After a package upgrade, the CLI checks whether the configured worker image matches the package and can propose/rebuild it. Image changes are runtime mutations and need a sprint-silent, owner-coordinated window. [Evidence: `src/cli/commands/upgrade.ts:377-425`; `src/core/worker-image-check.ts`; `AGENTS.md:88-91`]

### Built-ins and generated projections

Bundled agent/skill assets have a generated/runtime copy and project projection. `lint:builtins-drift` compares the bundle contract; manifest, identity, CLI/MCP, docs-reference and stats checks each have separate owners. A green TypeScript build does not imply those projections are current. [Evidence: `scripts/builtins-drift-check.mjs`; `scripts/bundle-builtins.mjs`; `package.json:45-71`]

The owner restored the pipeline-owned ADR/reference inputs after the reset and ran the owning generator; `docs:ref:check` is now 5/5 in sync. The unresolved issue is narrower: the ADR generator still reads 51 `docs/adr/*.md` projections although accepted authority is DB-first. OQ-26 tracks that input-authority decision; it is not represented as current output drift. [Evidence: owner-verified `docs:ref` run, 2026-08-02; `scripts/gen-reference-docs.mjs:88-133,234-249`; OQ-26]

### Develop-to-product publication boundary

The repository's sync script explicitly says the continuous two-repository model is retired. It is retained only as a one-time public-migration staging building block: dry-run partitions tracked files and performs bounded key-shape scanning; `--apply` extracts HEAD into a temporary/stated staging directory and prunes the exclusion list. It never commits or pushes. [Evidence: `scripts/sync-to-product.mjs:1-16,22-60,92-183`]

Historical launch posts, release notes, public-flip handoffs and changelog were retained in the immutable pre-reset archive. They are classified `TARİHSEL`: each is a dated event record, remains accessible for provenance, and is not republished as a current release/install claim. This classification does not assert fresh registry, clean-install, or cross-platform evidence. [Evidence: coverage matrix; archived source metadata; owner archive boundary]

## Dogfood / repository reality

| Gate or surface | State | Current repository finding |
|---|---|---|
| Full build | ✅ owner-verified | Owner reported `npm run build:all` completed before this pass. |
| Generated reference check | ✅ owner-verified | Owner restored pipeline-owned inputs/outputs and `docs:ref:check` reports 5/5 in sync. [Evidence: owner-verified pipeline run, 2026-08-02] |
| Master-plan lint | ✅ owner-verified | Restored identity projection cleared `IDENTITY_REGISTRY_MISSING`; lint reports 322 rows, 318 active items, and 22 receipts. [Evidence: owner-verified gate run, 2026-08-02] |
| Provider observation schema | ⚠️ migration HOLD | Live DB is v1 while source expects v2; release documentation cannot close a runtime migration. [Evidence: real PRAGMA; OQ-07] |
| Dashboard build cleanliness | ⚠️ friction | A clean/build output-policy conflict was observed and recorded. [Evidence: `PAZARTESI.md:47-52`] |
| Publish-grade autonomous certificate | 🔜 roadmap | The accepted audit requires the stabilization and certification ladder before that claim. [Evidence: `PAZARTESI.md:36-60`] |

Current publish-readiness status in this documentation audit remains **HOLD**: build and generated-doc gates are owner-verified green, but the provider-observation migration and publish-grade autonomous certificate remain open. No commit, push, release, or publish was performed. [Evidence: owner boundary; OQ-07; `PAZARTESI.md:36-60`]
