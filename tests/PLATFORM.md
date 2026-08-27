---
doc_rank: 50
status: active
last_updated: 2026-03-22
content_hash: sha256:297cf180f713e298a65eb847c272ea00ac1e17c6b07f49dff9d2397418f6d14e
---

# Platform-Specific Test Guide

This document describes which test files are platform-specific and how to run
platform-conditional tests.

## Categories

Tests fall into three families: **Unix-Only** (skipped on Windows via
`describe.skipIf(isWindows)`), **Windows-Only** (required-only on
windows-native), and **All-Platforms** (no platform gate — the default; the
generated block below closes with their exact count). The generated registry
lists every gated file per platform:

<!-- AUTOGEN:START id="platform-registry" -->
_Derived by `scripts/gen-platform-registry.mjs` from `describe.skipIf` / `it.skipIf` gates and `process.platform` guards actually present across `tests/**/*.test.ts(x)`. Do not hand-edit this block — run `node scripts/gen-platform-registry.mjs --write` to regenerate; `tests/scripts/platform-registry.test.ts` fails closed when this block drifts from source truth._

### `linux`

**Excluded** (skipped when running on this platform):

_None at this time._

**Required-only** (skipped unless running on this platform — note: WSL also reports `process.platform === 'linux'`, so these also run under WSL):

| File | Line | Block | Test/Suite name |
|------|------|------|------|
| `tests/scripts/clean-active-execution-guard.test.ts` | 3348 | it | unlinks top-level and nested symlinks without traversing their targets |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3394 | it | retains the exact maintenance generation after a partial clean mutation fails |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3508 | it | retains authority when a pre-mutation callback mutates and throws |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3596 | it | surfaces an uncertain pinned-directory handle close as a typed hold |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3680 | it | keeps deletion rooted at the pinned dist identity across a parent symlink swap |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3821 | it | keeps authority on the module-owned project identity across a root replacement |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3943 | it | rechecks legacy execution evidence at the final pre-mutation boundary |

### `macos`

**Excluded** (skipped when running on this platform):

_None at this time._

**Required-only** (skipped unless running on this platform):

_None at this time._

### `windows-native`

**Excluded** (skipped when running on this platform):

| File | Line | Block | Test/Suite name |
|------|------|------|------|
| `tests/cli/worktree-binary-authority-live.test.ts` | 130 | it | enforces the same HOLD through an npm-link-shaped executable symlink |
| `tests/cli/worktree-binary-authority.test.ts` | 368 | it | rejects a symlinked build identity instead of hashing its target |
| `tests/core/prompt-cost-canary-receipt-store.test.ts` | 75 | it | defends store links, permissions, and bounded discovery |
| `tests/core/provider-execution-observation-adoption-receipt-store.test.ts` | 270 | it | rejects a group-writable shared project control directory |
| `tests/core/provider-execution-observation-reconciliation-receipt-store.test.ts` | 27 | it | rejects unsafe links, permissive paths, and over-bounded discovery |
| `tests/governance/closure-genesis-anchor.test.ts` | 109 | it | --generate: private key mode is exactly 0600 (POSIX) |
| `tests/governance/closure-genesis-anchor.test.ts` | 149 | it | GUARD: a symlink at --private-out is refused (O_EXCL) and its target is untouched |
| `tests/hermeticity/global-setup.test.ts` | 74 | it | rejects a symlink anywhere in the dist snapshot |
| `tests/hermeticity/runtime-write-guard.test.ts` | 322 | it | derives module authority from the physical file behind a symlink |
| `tests/mcp/server-entrypoint.test.ts` | 35 | it | accepts a POSIX executable symlink that resolves to the module |
| `tests/mcp/server.test.ts` | 108 | it | recognizes an executable symlink as the module filesystem identity |
| `tests/orchestra/tmux-edge.test.ts` | 64 | describe | TmuxError |
| `tests/orchestra/tmux-edge.test.ts` | 98 | describe | isSessionActive edge cases |
| `tests/orchestra/tmux-edge.test.ts` | 126 | describe | ensureSession edge cases |
| `tests/orchestra/tmux-edge.test.ts` | 162 | describe | spawnWorker edge cases |
| `tests/orchestra/tmux-edge.test.ts` | 252 | describe | killWorker edge cases |
| `tests/orchestra/tmux-edge.test.ts` | 289 | describe | listWorkers edge cases |
| `tests/orchestra/tmux-edge.test.ts` | 334 | describe | cleanupPromptFile edge cases |
| `tests/orchestra/tmux-provider-cli.test.ts` | 30 | describe | TMUX-PROVIDER-CLI (364-003, born-481 parity) |
| `tests/orchestra/tmux-timeout-parity.test.ts` | 26 | describe | buildWorkerCommand — tmux timeout parity (born-466) |
| `tests/orchestra/tmux.test.ts` | 64 | describe | isSessionActive |
| `tests/orchestra/tmux.test.ts` | 86 | describe | ensureSession |
| `tests/orchestra/tmux.test.ts` | 122 | describe | spawnWorker |
| `tests/orchestra/tmux.test.ts` | 235 | describe | killWorker |
| `tests/orchestra/tmux.test.ts` | 258 | describe | listWorkers |
| `tests/orchestra/tmux.test.ts` | 279 | describe | startAuditor |
| `tests/orchestra/tmux.test.ts` | 342 | describe | destroy |
| `tests/orchestra/tmux.test.ts` | 365 | describe | sendKeys |
| `tests/orchestra/tmux.test.ts` | 381 | describe | cleanupPromptFile |
| `tests/orchestra/tmux.test.ts` | 388 | describe | attach |
| `tests/orchestra/tmux.test.ts` | 403 | describe | createWatchLayout |
| `tests/orchestra/tmux.test.ts` | 457 | describe | attachToWorkerPane |
| `tests/orchestra/tmux.test.ts` | 513 | describe | buildWorkerCommand |
| `tests/orchestra/tmux.test.ts` | 631 | describe | buildClaudeCommand alias |
| `tests/orchestra/tmux.test.ts` | 643 | describe | spawnWorker with adapter |
| `tests/orchestra/tmux.test.ts` | 680 | describe | taskId validation in public functions |
| `tests/orchestra/tmux.test.ts` | 734 | describe | startAuditor with adapter |
| `tests/orchestra/turn-economy-2.test.ts` | 155 | it | RED: a command piped to a pager MASKS the real exit code (is_error:false) |
| `tests/scripts/ci-sim-signal-restore.test.ts` | 179 | it | literal PTY Ctrl+C follows the real npm-terminal signal shape without displacing state |
| `tests/scripts/dist-clean-guard.test.ts` | 256 | it | recognizes symlink invocation as the direct clean entrypoint |
| `tests/scripts/dist-clean-guard.test.ts` | 277 | it | uses physical source authority under --preserve-symlinks-main |
| `tests/scripts/scripts.test.ts` | 357 | describe | OSS Scripts |
| `tests/scripts/test-ci-sim.test.ts` | 150 | it | fails closed on an explicit untracked external symlink |
| `tests/scripts/test-ci-sim.test.ts` | 160 | it | fails closed on a dirty tracked external symlink |
| `tests/scripts/test-ci-sim.test.ts` | 168 | it | rejects a symlinked parent before reading tracked content |
| `tests/scripts/test-ci-sim.test.ts` | 202 | it | materializes a symlinked worktree dependency root as an independent directory |
| `tests/scripts/test-ci-sim.test.ts` | 224 | it | rejects a dependency symlink outside node_modules |
| `tests/scripts/test-ci-sim.test.ts` | 505 | it | does not expose completion until an owned delayed grandchild can no longer resurrect HOME |

**Required-only** (skipped unless running on this platform):

_None at this time._

### `wsl`

**Excluded** (skipped when running on this platform):

_None at this time._

**Required-only** (skipped unless running on this platform):

_None at this time._

### Measured-Capability Gates

Skip conditions gated on a measured capability probe (an actual attempted operation, e.g. a real symlink write) rather than a raw platform literal — a probed capability, not a platform guess.

| File | Line | Block | Capability | Test/Suite name |
|------|------|------|------|------|
| `tests/scripts/lint-master-plan.test.ts` | 2815 | it | `!symlinkCapability.supported` | refuses a generated target symlink instead of writing through it |
| `tests/scripts/lint-master-plan.test.ts` | 2832 | it | `!symlinkCapability.supported` | returns structured scan exit 2 for source and projection symlinks |
| `tests/scripts/lint-master-plan.test.ts` | 2964 | it | `!symlinkCapability.supported` | executes the real CLI contract when invoked through a symlink |
| `tests/scripts/lint-master-plan.test.ts` | 3181 | describe | `!gitCapability.supported` | real-git forgery scenarios |

### Behavior-Differs Guards

Non-skip `if (process.platform ...)` branches inside test bodies — the test still runs on every platform but asserts a different expectation depending on the result.

| File | Line | Tag | Direction |
|------|------|------|------|
| `tests/agent/scratch-checkpoint.test.ts` | 68 | `windows-native` | asserts differently OFF windows-native |
| `tests/agent/tool-result-broker.test.ts` | 207 | `windows-native` | asserts differently OFF windows-native |
| `tests/agent/tool-result-broker.test.ts` | 222 | `windows-native` | asserts differently OFF windows-native |
| `tests/api/token-redaction.test.ts` | 153 | `windows-native` | asserts differently OFF windows-native |
| `tests/api/token-redaction.test.ts` | 195 | `windows-native` | asserts differently OFF windows-native |
| `tests/api/token-redaction.test.ts` | 229 | `windows-native` | asserts differently OFF windows-native |
| `tests/cli/at-ref.test.ts` | 328 | `windows-native` | asserts differently ON windows-native |
| `tests/cli/native-agent-scratch-wire.test.ts` | 251 | `windows-native` | asserts differently ON windows-native |
| `tests/cli/repl/session-ledger.test.ts` | 139 | `windows-native` | asserts differently OFF windows-native |
| `tests/connectors/gateway/gateway-access-lifecycle.test.ts` | 75 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/approval-broker-timeout-receipt.test.ts` | 125 | `windows-native` | asserts differently ON windows-native |
| `tests/core/approval-broker.test.ts` | 87 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/config-heal-preimage.test.ts` | 69 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/config-heal-race.test.ts` | 113 | `windows-native` | asserts differently ON windows-native |
| `tests/core/config-write-authority.test.ts` | 89 | `windows-native` | asserts differently ON windows-native |
| `tests/core/deck-file-secret-lifecycle.test.ts` | 66 | `windows-native` | asserts differently ON windows-native |
| `tests/core/deck-file-secret-lifecycle.test.ts` | 76 | `windows-native` | asserts differently ON windows-native |
| `tests/core/pid-liveness.test.ts` | 44 | `windows-native` | asserts differently ON windows-native |
| `tests/core/task-result-settlement.test.ts` | 264 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/task-result-settlement.test.ts` | 289 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/task-result-settlement.test.ts` | 312 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/task-result-settlement.test.ts` | 334 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/task-result-settlement.test.ts` | 344 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/task-result-settlement.test.ts` | 369 | `windows-native` | asserts differently OFF windows-native |
| `tests/core/task-result-settlement.test.ts` | 454 | `windows-native` | asserts differently OFF windows-native |
| `tests/e2e/docker-backend.test.ts` | 529 | `windows-native` | asserts differently ON windows-native |
| `tests/helpers/platform.test.ts` | 25 | `macos` | asserts differently ON macos |
| `tests/native/exec-authority-native.test.ts` | 135 | `macos` | asserts differently ON macos |
| `tests/orchestra/docker-backend-fixpack.test.ts` | 58 | `windows-native` | asserts differently OFF windows-native |
| `tests/orchestra/docker-backend-fixpack.test.ts` | 70 | `windows-native` | asserts differently OFF windows-native |
| `tests/orchestra/docker-backend-fixpack.test.ts` | 81 | `windows-native` | asserts differently OFF windows-native |
| `tests/scripts/clean-active-execution-guard.test.ts` | 3320 | `linux` | asserts differently OFF linux |
| `tests/scripts/clean-active-execution-guard.test.ts` | 4062 | `linux` | asserts differently OFF linux |
| `tests/scripts/test-ci-sim.test.ts` | 188 | `windows-native` | asserts differently OFF windows-native |
| `tests/scripts/test-ci-sim.test.ts` | 196 | `windows-native` | asserts differently OFF windows-native |

### Unclassified `skipIf` Conditions

_These `skipIf` conditions matched no rule in `classifyCondition()` — extend the generator rather than leaving them silently uncovered._

| File | Line | Block | Raw condition |
|------|------|------|------|
| `tests/blueprint/sprint-history.test.ts` | 11 | describe | `!BLUEPRINT_EXISTS` |
| `tests/cli/cli-bin-invocation.test.ts` | 134 | describe | `!HAS_DIST` |
| `tests/cli/gemini-parity-gated.test.ts` | 29 | describe | `!process.env['GEMINI_API_KEY']` |
| `tests/cli/gemini-parity-gated.test.ts` | 357 | describe | `!process.env['GEMINI_API_KEY']` |
| `tests/cli/recovery-lifecycle-binary.integration.test.ts` | 85 | describe | `NESTED_FORK_RUNNER` |
| `tests/cli/run-rename-smoke.test.ts` | 203 | describe | `DIST_ABSENT` |
| `tests/cli/run-rename-smoke.test.ts` | 256 | it | `HISTORY_HEADER_STALE` |
| `tests/cli/run-rename-smoke.test.ts` | 306 | it | `MESSAGES_STALE` |
| `tests/cli/status-authority-closure-race.test.ts` | 261 | describe | `NESTED_FORK_RUNNER` |
| `tests/cli/status-json-contract.integration.test.ts` | 162 | describe | `!DIST_AVAILABLE \|\| NESTED_FORK_RUNNER` |
| `tests/cli/status-json-contract.test.ts` | 226 | describe | `NESTED_FORK_RUNNER` |
| `tests/cli/term-slice-541-544-e2e.test.ts` | 228 | describe | `DIST_ABSENT` |
| `tests/cli/term-slice-541-544-e2e.test.ts` | 256 | it | `DIST_STALE` |
| `tests/cli/worktree-binary-authority-live.test.ts` | 68 | describe | `!HAS_REBUILT_BINARY` |
| `tests/config/nervous-faz1-smoke.test.ts` | 25 | describe | `!hasConfig` |
| `tests/config/nervous-faz1-smoke.test.ts` | 42 | it | `!nervousEnabled` |
| `tests/core/builtins/catalog-sync-parity.test.ts` | 93 | it | `!inPool` |
| `tests/core/builtins/catalog-sync-parity.test.ts` | 122 | it | `!inPool` |
| `tests/core/cross-verify-evidence-broker.test.ts` | 192 | describe | `!pinnedRuntimeAvailable` |
| `tests/core/cross-verify-evidence-broker.test.ts` | 625 | describe | `!pinnedRuntimeAvailable` |
| `tests/core/nervous-enabled-integration.test.ts` | 38 | it | `!hasProjectConfig \|\| !projectNervousEnabled` |
| `tests/dashboard/dashboard-build-smoke.test.ts` | 59 | it | `!BUILD_OUTPUT_PRESENT` |
| `tests/dashboard/dashboard-build-smoke.test.ts` | 66 | it | `!BUILD_OUTPUT_PRESENT` |
| `tests/docker/worker-image-providers.test.ts` | 54 | it | `!dockerAvailable(` |
| `tests/docker/worker-image-providers.test.ts` | 65 | it | `!dockerAvailable(` |
| `tests/docker/worker-image-providers.test.ts` | 76 | it | `!dockerAvailable(` |
| `tests/docs/release-notes-beta.test.ts` | 20 | describe | `!fileExists` |
| `tests/e2e/cli-smoke.e2e.test.ts` | 114 | describe | `DIST_ABSENT` |
| `tests/e2e/cli-smoke.e2e.test.ts` | 137 | it | `MESSAGES_STALE` |
| `tests/e2e/cross-platform/linux-subprocess.test.ts` | 12 | describe | `os.platform(` |
| `tests/e2e/cross-platform/linux-subprocess.test.ts` | 179 | describe | `!isLinux` |
| `tests/e2e/cross-platform/linux-subprocess.test.ts` | 248 | describe | `!isLinux` |
| `tests/e2e/cross-platform/linux-subprocess.test.ts` | 303 | describe | `!isLinux` |
| `tests/e2e/cross-platform/linux-subprocess.test.ts` | 350 | describe | `!isLinux` |
| `tests/e2e/cross-platform/linux-subprocess.test.ts` | 397 | describe | `!isLinux` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 12 | describe | `!tmuxAvailable` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 13 | describe | `os.platform(` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 135 | describe | `!tmuxAvailable` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 151 | describe | `!tmuxAvailable` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 217 | describe | `!tmuxAvailable` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 259 | describe | `!tmuxAvailable` |
| `tests/e2e/cross-platform/macos-tmux.test.ts` | 309 | describe | `!tmuxAvailable` |
| `tests/e2e/cross-platform/wsl2-docker.test.ts` | 12 | describe | `!dockerAvailable` |
| `tests/e2e/cross-platform/wsl2-docker.test.ts` | 13 | describe | `!isWSL2` |
| `tests/e2e/cross-platform/wsl2-docker.test.ts` | 166 | describe | `!dockerAvailable` |
| `tests/e2e/cross-platform/wsl2-docker.test.ts` | 188 | describe | `!dockerAvailable` |
| `tests/e2e/docker-backend.test.ts` | 856 | it | `!dockerAvailable \|\| !dockerE2eRequested \|\| dockerE2eChild` |
| `tests/e2e/docker-backend.test.ts` | 949 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 973 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 989 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 1015 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 1033 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 1065 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 1101 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 1144 | it | `!dockerE2eEnabled` |
| `tests/e2e/docker-backend.test.ts` | 1185 | it | `!dockerE2eEnabled` |
| `tests/e2e/kpi-surface-smoke.test.ts` | 217 | describe | `DIST_ABSENT` |
| `tests/e2e/npm-pack-smoke.test.ts` | 10 | describe | `process.env.CI` |
| `tests/e2e/provider-smoke.test.ts` | 85 | it | `process.env.DECKENT_PROVIDER_INTEGRATION !== '1'` |
| `tests/e2e/provider-smoke.test.ts` | 132 | it | `process.env.DECKENT_PROVIDER_INTEGRATION !== '1'` |
| `tests/e2e/provider-smoke.test.ts` | 171 | it | `process.env.DECKENT_PROVIDER_INTEGRATION !== '1'` |
| `tests/e2e/serve-endpoints-smoke.test.ts` | 198 | describe | `DIST_ABSENT` |
| `tests/e2e/tmux-backend.test.ts` | 11 | describe | `!tmuxAvailable` |
| `tests/e2e/tmux-backend.test.ts` | 286 | describe | `!tmuxAvailable` |
| `tests/kpi/kpi-cli.smoke.test.ts` | 132 | it | `!DIST_AVAILABLE` |
| `tests/orchestra/deck-worker-isolation.test.ts` | 74 | describe | `!dockerUp` |
| `tests/platform-tags.test.ts` | 41 | describe | `isWindows` |
| `tests/platform-tags.test.ts` | 67 | describe | `isWindows` |
| `tests/providers/codex-integration.test.ts` | 24 | describe | `!codexAvailable` |
| `tests/providers/gemini-integration.test.ts` | 17 | describe | `!hasGemini` |
| `tests/release/packed-install-contract.test.ts` | 166 | describe | `SKIP` |

### All Other Test Files

2791 of 2862 test files under `tests/` carry no platform-conditional gate detected above and run identically on every supported platform.
<!-- AUTOGEN:END id="platform-registry" -->

## How Platform Conditions Work

Each Unix-only file declares a flag at module level:

```typescript
const isWindows = process.platform === 'win32';
```

Each top-level `describe` block in the file uses:

```typescript
describe.skipIf(isWindows)('suite name', () => {
  // tests
});
```

On Linux and macOS `isWindows` is `false`, so all suites run normally.
On Windows `isWindows` is `true`, so vitest marks the suites as skipped — no
errors are thrown and the test run still passes.

## Running Tests

### All platforms (skip Windows-incompatible suites automatically)

```bash
npx vitest run
```

### Unix-only files explicitly

```bash
npx vitest run tests/orchestra/tmux.test.ts tests/orchestra/tmux-edge.test.ts tests/scripts/scripts.test.ts
```

### Verify skipIf flags are present

```bash
npx vitest run tests/platform-tags.test.ts
```

## Adding New Platform-Specific Tests

1. Add `const isWindows = process.platform === 'win32';` near the top of the file (after imports).
2. Wrap every top-level `describe` block with `describe.skipIf(isWindows)(...)`.
3. Add the file to the Unix-Only table above.
4. Update `tests/platform-tags.test.ts` to verify the skipIf pattern is present.
