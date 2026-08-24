# CURSOR-PROVIDER-001: Production Image, Catalog, and Isolated Auth Closure

## Goal
Close the remaining Cursor production wiring for MASTER outcome 7091 without creating reports or docs/evidence: make the production image build surface install Cursor, keep canonical Cursor models visible when the remote catalog omits them, and bridge the host Cursor session into Docker through a credential-only cross-platform auth authority. Root operator owns post-terminal build, image, real-binary, auth, and different-provider XVerify proof.

## Execution contract
- DOGFOOD_MODE=ON. Allocate the run ID only through canonical allocator authority.
- Four-task dependency DAG: Tasks 1, 2, and 3 execute concurrently; Task 4 is the production fan-in and depends on Tasks 1 through 3.
- No docs/evidence, MASTER, follow-up, ADR, changelog, provider login/auth mutation, execution-authority, Brain-memory, generated projection, or live database mutation by workers.
- Preserve every unrelated dirty file. Never delete `.brain/memory.db` or clean `.tasks` manually.
- No `npm run build`, `npm run build:all`, Docker image build, provider login, or full suite during the active run. Hermetic scoped Vitest and `npx tsc --noEmit` are allowed.
- Production wiring must close producer -> consumer -> CLI/runtime entrypoint -> policy/config. Test-only imports are not completion.
- All user-facing CLI strings use `getMessage(key, lang)` with English and Turkish entries. No new hardcoded visible text.
- Provider/model/worker selection and concurrency are resolved only from effective config, registry, auth, reachability, limits, dependency DAG, and collision policy. Do not encode provider or model choice in task output.
- Cursor auth must expose only the exact credential file, never the complete host config directory. Honor XDG config authority, native Windows APPDATA authority, and honest fallback semantics without platform-specific silent behavior.
- Task-local acceptance is scoped source verification. The root operator performs the mandatory fresh-dist and real production image proof only after the run is terminal, because builds are forbidden while the run is active.

## Task 1: Cursor production image CLI and complete image-command i18n
- Files: src/cli/commands/image.ts, src/cli/helpers/messages.ts, tests/cli/image-build.test.ts, tests/cli/f1005-ollama-image.test.ts, tests/cli/helpers/messages.test.ts
- Scope: src/cli/, tests/cli/
- Type: feature
- Goal: Add `withCursor` to the typed image build options, emit the exact `INSTALL_CURSOR=true` Docker build argument, and expose `deckent image build --with-cursor`. Migrate every user-visible string touched or already emitted by the image command, including option descriptions, dry-run lines, missing Dockerfile guidance, and Docker-launch errors, into existing `getMessage` English/Turkish authority. Preserve cwd-independent packaged Dockerfile resolution, shell-free argument vectors, existing provider flags, deprecated `--image`, and honest non-zero failures. Tests must prove the Cursor argument, complete EN/TR message coverage, spaces in paths, no Docker spawn on dry-run/missing Dockerfile, and adjacent Ollama behavior. Do not build an image during the run.

## Task 2: Canonical Cursor catalog visibility
- Files: src/core/model-catalog.ts, tests/core/model-catalog.test.ts, tests/core/model-catalog-bootstrap.test.ts, tests/core/catalog-apiid-merge.test.ts, tests/core/catalog-merge-id.test.ts
- Scope: src/core/, tests/core/
- Type: fix
- Goal: Make every successful remote or cached catalog result retain canonical registry definitions that the external catalog omits, including all four Cursor models, while letting fresh external definitions override matching canonical API identities where their evidence is authoritative. Preserve deterministic order, provider/api-id identity, cache source metadata, warnings, offline fallback, bootstrap behavior, and no duplicate logical model. Tests cover remote omission of Cursor, cached omission, matching override, deterministic order, and registry bootstrap. Do not hardcode Cursor as a one-off CLI special case.

## Task 3: Cross-platform Cursor Docker auth isolation
- Files: src/core/provider-command-spec.ts, src/orchestra/spawn-backend-docker.ts, tests/core/provider-command-spec.test.ts, tests/orchestra/spawn-backend-docker.test.ts, tests/orchestra/docker-provider-auth.test.ts, tests/orchestra/docker-auth-precedence.test.ts, tests/orchestra/spawn-backend-docker-probe.test.ts, tests/providers/docker-bounded-reachability-evidence.test.ts
- Scope: src/core/, src/orchestra/, tests/core/, tests/orchestra/, tests/providers/
- Type: feature
- Goal: Encode Cursor's container auth destination and add `auth.json` to the provider credential allowlist. Resolve the host credential root from XDG_CONFIG_HOME on Unix-like/WSL hosts, APPDATA on native Windows, and the documented home fallback, using explicit sanitized path authority rather than mounting the complete host config tree. Thread the resolved host source independently from the task-private container destination through both the credential broker and direct isolation path. Preserve file-only mounts, permission hardening, refresh broker locking, missing-required-file fail-closed behavior, API-only behavior, and every existing Claude/Codex/Gemini path. Tests cover Linux, macOS, native Windows, WSL/XDG override, unsafe or relative env input, required-file absence, probe use, and no full-directory mount.

## Task 4: Cursor production wiring fan-in
- Files: tests/integration/cursor-production-wiring.integration.test.ts
- Scope: tests/integration/
- Dependencies: Task 1, Task 2, Task 3
- Type: test
- Goal: Add one integration battery that imports and exercises the actual production modules across the three seams: image build argument generation through the CLI handler, canonical-plus-remote catalog resolution exposing all Cursor model identities, and Cursor credential-only Docker auth preparation with the correct task-private destination. Assert that no full config/home directory is mounted, no provider auth file is mutated, existing provider behavior remains available, and the named Cursor verifier model resolves through the real registry/catalog chain. Run this test plus the exact adjacent scoped batteries and `npx tsc --noEmit`; do not modify production code or build dist/image during the run.

## Outcome acceptance
- The run is terminal with every exact implementation lineage settled; terminal state alone is not production closure.
- Post-terminal fresh `npm run build:all` exposes `deckent image build --with-cursor` from dist and the active bot/runtime is restarted on the fresh binary.
- A production `deckent-worker:latest` build with Cursor enabled contains a runnable `cursor-agent` at the expected version and preserves existing provider CLIs.
- A fresh container reaches the real host Cursor session only through the isolated credential bridge; no host provider directory is mounted.
- `deckent models list --provider cursor` exposes the four canonical Cursor models even when the external catalog omits them.
- A real different-provider Cursor XVerify attempt uses the configured Cursor model, records the provider call and provider-reported usage, and produces a terminal durable receipt; any provider limit or unavailable evidence remains typed HOLD and does not become DONE.
- Scoped tests, TypeScript, image-command i18n gates, real-binary proof, and canonical archive/finalizer integrity are green before landing.
