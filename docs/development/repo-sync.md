# Repo Sync — develop → product

> Status: accepted (Sprint 201). See also: `docs/adr/065-develop-product-repo-split.md`.

## Two-repo model

| Repo | Purpose | Contains |
|------|---------|----------|
| `deckent-develop` | engineering, full history, sprint internals | everything — `.brain/`, `.deckent/archive/`, audits, sprint directives, alperen-analysis, private root markdowns |
| `deckent` | public product repo, clean snapshot | only what end users need — `src/`, `dist/` (on publish), `docs/{guide,reference,adr,architecture}/`, `package.json`, `README*`, `LICENSE` |

The npm package (`files: ["dist", "bin", "README*", "LICENSE"]` in `package.json`) is unaffected — `npm publish` works identically from either repo. The two-repo split is purely about GitHub visibility: the product repo gets a curated showcase, the develop repo keeps the full engineering record.

## Why a script + manual push

`scripts/sync-to-product.mjs` only **prepares a staging directory**. It does NOT commit, does NOT push, does NOT touch any remote. The push step is **deliberately human-controlled** because:

- A public-publish is irreversible: once `git push --force` lands on `deckent`, the snapshot is in the public history forever.
- The script applies an EXCLUDE list — if that list ever misses something sensitive (a new private doc category, a new runtime-state file), a fully-automated script would publish it before review.
- The author of the publish commit should be a human, not an agent.

The script's job is to make staging reproducible and to fail loudly on real API-key strings. The push is yours.

## Usage

### Dry-run (default)

```bash
node scripts/sync-to-product.mjs              # implicit
node scripts/sync-to-product.mjs --dry-run    # explicit, same behaviour
# stdout: JSON report — { ok, keep, drop, dropList, ... }
# stderr: "[sync] tracked=N keep=K drop=D"
```

The dry-run reads `git ls-files`, partitions into keep/drop, runs the security scan, and reports — **no files are written to disk**.

### Apply (prepare staging dir)

```bash
node scripts/sync-to-product.mjs --apply
# stdout: report incl. "staging": "/tmp/deckent-product-XXXXX"
```

`--apply` runs `git archive HEAD | tar -x` into a temporary directory, then prunes all EXCLUDE paths. The staging dir is left on disk for you to inspect and copy into the product-repo working tree.

### Custom staging dir

```bash
node scripts/sync-to-product.mjs --apply --staging=/path/to/empty/dir
```

Useful for CI or for placing the staging dir on a faster filesystem.

## The EXCLUDE list

The script keeps the exclude list as a single `EXCLUDE` array near the top of `scripts/sync-to-product.mjs`. It mirrors the Sprint 201 manual snapshot 1:1:

- **Directories** (prefix match, trailing `/`): `.brain/`, `.deckent/archive/`, `docs/superpowers/`, `docs/launch/`, `docs/release/`, `docs/development/`, `docs/archive/`, `docs/audits/`, `docs/alperen-analysis/`, `docs/core-memory/`
- **Retired historical paths still excluded if present in old branches:** `docs/directives/`, `NERVOUS-TODO.md`
- **Personal root markdowns**: `DIRECTIVES.md`, `RESUME-MONDAY.md`, `DECKENT-ANA-PLAN.md`, `DECKENT-ANA-PLAN-TR.md`
- **Runtime state**: `.deckent/config.json`, `.deckent/config.json.bak`, `.deckent/provider-cache.json`, `.deckent/ci-baseline.json`

To add or remove an entry, edit the `EXCLUDE` array and re-run the dry-run to confirm the new keep/drop counts make sense.

## Security gate

Every kept file (under 5 MB, excluding `tests/` and `__fixtures__/` paths) is scanned for two API-key shapes:

- Anthropic: `sk-ant-[A-Za-z0-9_-]{20,}`
- Google: `AIza[A-Za-z0-9_-]{30,}`

A single match aborts the run with `{ ok: false, abort: "security", violations: [...] }` and exit code 1. The script never writes a staging dir when the security gate trips, even with `--apply`.

If the scanner false-positives on a legitimate test fixture, place the fixture under `tests/` or rename to include `__fixtures__` in the path — both paths are skipped by design.

## Typical workflow

```bash
# 1. From deckent-develop, confirm what would be published.
node scripts/sync-to-product.mjs

# 2. If keep/drop counts look right and ok:true, prepare staging.
node scripts/sync-to-product.mjs --apply --staging=/tmp/deckent-stage

# 3. Inspect the staging dir.
ls /tmp/deckent-stage
diff -r /tmp/deckent-stage /path/to/local/deckent-product-checkout

# 4. Manually rsync / git-add-commit-push from the staging dir into the product repo.
#    (This step is intentionally NOT in the script.)
```

## Related

- `scripts/clean-clone-smoke.mjs` — verifies the staging archive boots cleanly end-to-end
- `docs/adr/065-develop-product-repo-split.md` — the architectural decision behind the split
