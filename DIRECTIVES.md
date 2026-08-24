# RECOVERY-BORN-490-BUILD-DIGEST-GATE-001: Source/Dist/Provider Runtime Adoption

## Goal

Close the production consumer gap behind MASTER Work 3300: after a terminal run and a fresh
build, one immutable content-addressed receipt must prove that the invoked dist binary matches
the settled source, the ownership-bound live bot runtime adopted that exact build, and the
current provider-observation database lineage was verified against its immutable v1 preimage.
This is one outcome. It does not mutate MASTER, closure dispositions, provider rows, auth, or
documentation during the run.

## Execution contract

- DOGFOOD_MODE=ON. Allocate the run ID only through canonical allocator authority.
- Five-task DAG: Tasks 1, 2, and 3 execute concurrently; Task 4 depends on all three; Task 5
  depends on Task 4 and is the production fan-in.
- No docs/evidence, MASTER, follow-up, ADR, changelog, provider login/auth mutation,
  execution-authority, Brain-memory, generated projection, live database, or existing receipt
  mutation by workers. Preserve every unrelated dirty file.
- Never delete `.brain/memory.db`; never clean `.tasks` manually.
- No `npm run build`, `npm run build:all`, provider call, daemon restart, or full suite while the
  run is active. Hermetic Vitest, tmpdir-only compiled fixtures, and `npx tsc --noEmit` are allowed.
- Production wiring must close producer -> consumer -> CLI entrypoint -> immutable receipt store.
  Test-only imports or a pure reducer without a production caller are not completion.
- User-visible text is i18n-first through `getMessage(key, lang)` in English and Turkish.
- The receipt operation is verification/adoption only: provider DB mutation is always `none`.
  Missing preimage, schema drift, source/dist mismatch, legacy runtime identity, dead/reused PID,
  receipt conflict, path escape, symlink, or concurrent change must return a typed HOLD.
- Cross-platform design is mandatory. Runtime self-attestation uses the existing ownership-bound
  pid/start-token authority; unsupported ownership evidence is explicit HOLD, never Linux-only
  silent success.
- Root operator owns post-terminal `build:all`, bot restart/reconnect, real-binary dry-run/apply/
  replay, current DB byte-diff proof, MASTER projection, and formal XVerify when eligible.

## Task 1: Composite runtime-adoption contract and immutable store
- Files: src/core/runtime-adoption.ts, src/core/runtime-adoption-receipt-store.ts, tests/core/runtime-adoption.test.ts, tests/core/runtime-adoption-receipt-store.test.ts
- Scope: src/core/, tests/core/
- Type: feature
- Goal: Define a provider-neutral v1 plan and durable receipt binding the exact provider-observation adoption receipt identity/digest, current target database digest and lineage, Deckent build identity digest/source-tree identity, invoked entrypoint artifact digest, and ownership-bound live runtime identity. Implement canonical encoding, typed validation, plan digest, immutable content-addressed create-or-verify publication, fresh-process replay, tenant/environment scope derivation, strict permissions, atomic fsync publication, symlink/path/concurrency defenses, bounded discovery, and typed HOLD codes. The store must never mutate provider DB bytes or an existing receipt.
- Test: npx vitest run tests/core/runtime-adoption.test.ts tests/core/runtime-adoption-receipt-store.test.ts

## Task 2: Ownership-bound bot runtime build identity
- Files: src/connectors/bot-daemon.ts, tests/connectors/bot-daemon.test.ts, tests/connectors/bot-lifecycle-honesty.test.ts
- Scope: src/connectors/, tests/connectors/
- Type: feature
- Goal: Evolve the bot pid authority so the listener self-publishes a digest-bound runtime identity for the exact entrypoint bytes and build-identity bytes it loaded, alongside pid/startToken/project binding. Preserve safe parsing and compatibility for existing pid records, but mark legacy records as runtime-adoption-unavailable rather than promoting them. `inspectBotPid` must return the verified runtime identity only after the existing alive/start-token/project checks pass. Preserve Linux/macOS/Windows/WSL semantics through the existing process ownership adapter and keep start/stop/status behavior compatible.
- Test: npx vitest run tests/connectors/bot-daemon.test.ts tests/connectors/bot-lifecycle-honesty.test.ts

## Task 3: Fresh dist build-identity read model
- Files: src/cli/worktree-binary-authority.ts, tests/cli/worktree-binary-authority.test.ts, tests/cli/worktree-binary-authority-live.test.ts, tests/scripts/build-identity.test.ts
- Scope: src/cli/, tests/cli/, tests/scripts/
- Type: feature
- Goal: Add a reusable side-effect-free runtime build-identity read model that proves the executing module belongs to this checkout's `dist`, parses the exact build identity, recomputes current source-tree identity, hashes the build-identity and invoked entrypoint bytes with TOCTOU/symlink/size bounds, and returns either a normalized adoption binding or a typed HOLD. Diagnostic/source execution must not manufacture a dist identity. Preserve existing CLI binary authority decisions and cross-checkout fail-closed behavior.
- Test: npx vitest run tests/cli/worktree-binary-authority.test.ts tests/cli/worktree-binary-authority-live.test.ts tests/scripts/build-identity.test.ts

## Task 4: Provider-observation runtime adoption CLI composition
- Files: src/cli/commands/provider-observations.ts, src/cli/helpers/messages.ts, tests/cli/provider-observations-migration.test.ts, tests/cli/provider-observation-adoption-receipt.integration.test.ts, tests/cli/provider-observation-messages.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 1, Task 2, Task 3
- Type: feature
- Goal: Add an i18n-clean `provider-observations adopt-runtime` production subcommand with dry-run, explicit `--apply`, digest-bound `--plan-digest`, `--preimage`, and stable `--json`. It must run the existing current provider-adoption verification against the immutable preimage without database mutation, consume the fresh dist read model and verified running bot identity, publish or replay the provider adoption receipt, then publish or replay the composite runtime-adoption receipt. A partial first publication must be safely resumable/idempotent. Human output exposes bounded receipt IDs/reason codes, never raw provider identities, absolute paths, tokens, or database rows.
- Test: npx vitest run tests/cli/provider-observations-migration.test.ts tests/cli/provider-observation-adoption-receipt.integration.test.ts tests/cli/provider-observation-messages.test.ts

## Task 5: Real compiled producer-to-consumer fan-in
- Files: tests/integration/provider-observation-runtime-adoption.integration.test.ts
- Scope: tests/integration/
- Dependencies: Task 4
- Type: test
- Goal: Exercise the actual compiled CLI in a tmpdir from provider v1 preimage + current v2 DB through ownership-bound live bot start, adopt-runtime dry-run, digest-bound apply, and a fresh-process replay. Verify one canonical composite receipt, provider receipt linkage, exact source/dist/entrypoint/runtime bindings, zero database/WAL/SHM byte mutation, no temp residue, no raw identity leakage, and typed HOLDs for stale build, legacy pid record, dead/reused process, wrong plan digest, symlink, and concurrent target change. Import and call production modules only; no fixture-local reimplementation of authority logic.
- Test: npx vitest run tests/integration/provider-observation-runtime-adoption.integration.test.ts

## Outcome acceptance

- The dogfood run is terminal with all five lineages settled; terminal state alone is not closure.
- Post-terminal `npm run build:all` emits a fresh matching `dist/build-identity.json`; the active bot
  is restarted through its documented ownership-safe flow and publishes the new runtime identity.
- Real dist CLI `adopt-runtime` dry-run -> apply -> separate-process replay succeeds against the
  current DB and immutable v1 preimage, while database/WAL/SHM digests remain byte-identical.
- The composite receipt is content-addressed, canonical, immutable, provider-receipt-linked, and
  binds source tree -> dist build -> invoked entrypoint -> live PID/start token -> provider lineage.
- Scoped tests, adjacent legacy batteries, TypeScript/lint, archive/finalizer integrity, and real
  binary proof are green before landing. Any unsupported authority remains typed HOLD, not DONE.
