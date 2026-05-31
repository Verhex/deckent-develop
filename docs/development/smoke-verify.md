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

## Related

- `scripts/build-verify.ts` — post-build sanity checks (dist files, shebangs, size)
- `scripts/cli-smoke-test.sh` — per-command `--help` sweep against an already-built dist
- `scripts/sync-to-product.mjs` (Task 201-003) — produces the publish-staging snapshot this script verifies
