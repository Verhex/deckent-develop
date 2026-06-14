# Clean-Clone Smoke Verify

Automated proof that **deckent works from a clean clone** — the entire toolchain (install → typecheck → build → CLI → `init` builtins) runs end-to-end against a fresh `git archive HEAD` snapshot, with no leakage from the working tree.

Run this before publishing, before cutting a release, or whenever you want a self-contained answer to "does deckent's source-of-truth still ship a working CLI?"

## Quick Run

```bash
node scripts/clean-clone-smoke.mjs
```

Exit code `0` → every step passed. Exit `1` → at least one step failed (details in the JSON report on stdout).

## Pipeline

The script runs these steps in order. The first failure aborts the rest:

| # | Step | What it proves |
|---|------|-----------------|
| 1 | `archive` | `git archive HEAD` produces a clean snapshot (tracked files only, no `.git`, no untracked state) |
| 2 | `npm ci` | Lockfile resolves cleanly against the registry; `node_modules/` is reproducible |
| 3 | `tsc --noEmit` | Snapshot type-checks without errors |
| 4 | `npm run build` | `dist/cli/entry.js` is produced |
| 5 | `cli --version` | Built CLI runs and reports a version (matches `/\d+\.\d+/`) |
| 6 | `cli --help` | Help text renders (contains Usage/Commands/Options) |
| 7 | `init builtins` | `node dist/cli/entry.js init <tmp>` populates `.deckent/agents/` and `.deckent/skills/` with at least one entry each |

## Flags

| Flag | Effect |
|------|--------|
| `--keep` | Don't `rm -rf` the temp dir after running — useful for inspecting what went wrong |
| `--skip-install` | Reuse a pre-existing `node_modules` (advanced — only for local iteration) |
| `--source=cwd` | Run the pipeline in the current working directory instead of a HEAD archive (no archive step) |

## Output Shape

JSON report on stdout:

```json
{
  "steps": [
    { "name": "archive", "status": "PASS", "durationMs": 412, "detail": "78 top-level entries" },
    { "name": "npm ci", "status": "PASS", "durationMs": 18420, "detail": "node_modules present" }
  ],
  "summary": { "pass": 7, "fail": 0, "total": 7 },
  "ok": true,
  "workDir": "/tmp/deckent-smoke-AbCd",
  "cleanedUp": true
}
```

Progress lines stream to stderr as `[smoke] PASS step-name (Nms)`.

## When to run

- Before `npm publish` (alongside `npm run validate:publish`)
- After touching `package.json`, `tsconfig.json`, or the build scripts
- After landing a sync from `deckent-develop` into the `deckent` product repo (verifies the snapshot is shippable — see ADR-065)

## Why not `cd && npm test`?

The working tree carries sprint state, archived task dirs, and untracked artifacts that can mask "this repo no longer builds from a clean snapshot" failures. `git archive HEAD` is the cheapest way to simulate a fresh clone without actually `git clone`-ing the remote.

## Programmatic Use

The script also exports its building blocks for tests and CI integrations:

```js
import { runSmoke, runStep } from './scripts/clean-clone-smoke.mjs';

const report = await runSmoke({ source: 'archive', skipInstall: false });
if (!report.ok) process.exit(1);
```

## User-Surface Proof-of-Function (ADR-079)

For tasks that touch user-facing surfaces (`src/cli/commands/`, `src/dashboard/`, `src/api/`), a separate permanent regression guard runs the real binary and asserts working behavior.

```bash
npm run test:e2e-surfaces
# or
node scripts/test-e2e-surfaces.mjs
```

This script (Sprint 216, ADR-079):

1. Finds a free ephemeral port via OS bind.
2. Spawns `node dist/cli/entry.js serve --port N --no-terminal` asynchronously in a sandbox HOME.
3. Waits up to 15 s for the ready signal in stdout.
4. Asserts:
   - `GET /` → HTTP 200 + HTML contains `__DECKENT_API_TOKEN__` (token auto-mint)
   - `GET /api/status` → HTTP 200 (auth succeeds via auto-minted token)
5. Kills the child process in a `try/finally` block (always cleans up).

Exit codes: `0` = all surfaces green, `1` = assertion failed, `2` = skipped (dist not built).

Skip guard: if `dist/cli/entry.js` is absent (fresh checkout without a build), the script exits `2` — not a failure. Run `npm run build:all` first for a full check.

The script exports `bootServer`, `findFreePort`, and assertion helpers for use in other tests.

---

## Other Smoke Scripts

| Script | Command / Purpose |
|--------|------------------|
| `scripts/clean-clone-smoke.mjs` | `node scripts/clean-clone-smoke.mjs` — full clean-clone pipeline (archive → npm ci → tsc → build → CLI boot) |
| `scripts/test-e2e-surfaces.mjs` | `npm run test:e2e-surfaces` — user-surface proof-of-function (ADR-079) |
| `scripts/build-verify.ts` | Post-build sanity checks (dist files, shebangs, size) |
| `scripts/cli-smoke-test.sh` | Per-command `--help` sweep against an already-built dist |
| `scripts/dashboard-e2e-smoke.mjs` | Dashboard end-to-end smoke (serves built dashboard, checks routes) |
| `scripts/serve-localhost-smoke.mjs` | `deckent serve` localhost integration check |
| `scripts/repl-smoke-verify.mjs` | Native REPL smoke (Ink/agentic tool-use, opt-in flag) |
| `scripts/validate-publish.mjs` | `npm run validate:publish` — pre-publish gate (run before `npm publish`) |

---

## Related

- `scripts/build-verify.ts` — post-build sanity checks (dist files, shebangs, size)
- `scripts/cli-smoke-test.sh` — per-command `--help` sweep against an already-built dist
- `scripts/test-e2e-surfaces.mjs` — ADR-079 user-surface permanent regression guard
- ADR-079 — Proof-of-Function DoD (Tier-0/Tier-1 classification, `Smoke:` directive, sprint-inner gate)
