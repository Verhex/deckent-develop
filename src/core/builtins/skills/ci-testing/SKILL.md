---
doc_rank: 50
status: active
last_updated: 2026-08-26
---

# CI Testing Expert

## Role

Use the repository's declared commands and the smallest relevant shard to diagnose
CI failures. A local green run is evidence only when it reproduces the CI job's
build inputs, platform assumptions, and exit status.

## Current Deckent Shards

The GitHub Actions test matrix is split by ownership: Core + Agents, Orchestra,
CLI, remaining API/MCP/integration groups, Docs + Scripts, Dashboard, and an
informational Windows leg. `Shards Green` fans the seven test jobs into one
aggregate gate. The Docs + Scripts job is job-level `continue-on-error`; Windows
is informational and its test step also allows failure. Neither setting turns a
skipped or red shard into evidence that its behavior was covered.

Run the task-declared targeted command first. When reproducing a workflow failure,
copy that job's Node version, environment, pool, and timeout rather than inventing
a generic `npm test` command.

### Prebuild for real-binary tests

Tests that spawn the packaged CLI do not execute TypeScript sources. They require
`dist/cli/entry.js`. The current Orchestra and CLI jobs therefore build before
their Vitest step:

```bash
npx tsc
node scripts/copy-assets.mjs
```

Keep this prebuild in every shard that contains real-binary tests. Today those are
the Orchestra and CLI shards; do not copy the step into unrelated shards without
a real-binary dependency. A missing `dist/cli/entry.js` in such a shard is CI
setup failure, not evidence that the asserted product behavior failed. Do not
silently replace a real-binary test with an in-process mock to avoid the prebuild.

## Policy Gates and Ratchets

### Secret baseline

The secret-baseline implementation is `scripts/security/secret-baseline.mjs`. It
scans tracked files and fails on an unallowlisted secret-pattern hit. In CI it is
reached through the repository's lint/gate chain, so do not invent a standalone
workflow step. Treat a hit as real until reviewed. Remove or rotate a real secret;
for a fixture, prefer equivalent non-secret-looking test data. `--build-baseline`
rewrites `.secrets-baseline` and is an explicit, manually reviewed allowlist
operation—not a routine way to turn the gate green.

### Hermeticity and mocks

`node scripts/lint-test-hermeticity.mjs` derives filesystem, process, network, and
other effects from the test graph. Its unresolved-effect and production-inventory
fingerprints are ratchets: drift must be explained and fixed or deliberately
rebaselined from eligible evidence. Follow the script's build-free eligibility
rules when rebaselining; do not lower a count, edit a digest, or add a mock merely
to satisfy the snapshot.

Tests must use suite-owned temporary directories and restore environment, cwd,
timers, and mocks. Never read or mutate tracked workspace state, `.deckent` runtime
authority, home-directory configuration, or a developer's existing `dist/` as a
fixture. A mock is acceptable only when it preserves the contract under test;
duplicated mock factories and stale export shapes are drift, not isolation.

## Cross-Platform Filesystem Lesson

On Windows, `FlushFileBuffers` can return `EPERM` for a read-only file handle. Code
that reopens a written file to fsync it must use update mode (`'r+'`), not `'r'`,
before syncing and closing. Preserve tests for both the open mode and successful
fsync path; do not skip the behavior on Windows to make the informational leg green.

## Honest Exit Capture

Never diagnose a command through `cmd | head` or `cmd | tail`: the displayed exit
code normally belongs to the pager, not the command that failed. Capture the real
status without a pipeline:

```bash
cmd > /tmp/deckent-check.log 2>&1
status=$?
cat /tmp/deckent-check.log
echo "$status"
```

When a pipeline is unavoidable under Bash, inspect `${PIPESTATUS[0]}` immediately.
Do not report green from truncated output with an unproven producer exit code.

## Failure Triage

1. Read the failing assertion and the exact job configuration.
2. Classify setup failures first: missing dist output, native rebuild, wrong Node
   matrix leg, unavailable platform capability, or contaminated workspace state.
3. Reproduce the narrow shard with the same prerequisites.
4. Fix the product or fixture contract. Do not weaken assertions, add retries, raise
   timeouts, or introduce skips before identifying the root cause.
5. Run exactly the verification commands authorized for the task and retain their
   true exit codes.

DONE requires evidence from the declared checks. Do not claim nonexistent commands
such as `test:ci-sim`, fixed coverage thresholds, or an always-required full-suite
run when the repository or task does not declare them.
