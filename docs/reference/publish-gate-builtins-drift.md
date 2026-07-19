# Publish Gate: Builtins Drift (`builtins_drift`)

**Context:** Sprint 451, task 451-002 · **Status:** Active in `npm run lint:gates` · **Exit codes:** 0 (clean) | 1 (new drift) | 2 (scan error / missing baseline)

---

## Overview

The **builtins drift gate** enforces a no-new-drift ratchet across the live catalog (`.deckent/agents` and `.deckent/skills`) and the shipped baseline (`src/core/builtins/agents` and `src/core/builtins/skills`). It detects when developers/dogfood modify the live catalog (either during development or in a sprint) in ways that diverge from what new projects receive at `deckent init` time.

This gate is NOT a canonicality decision (it does not merge or arbitrate which side is correct). It is a **consciousness gate**: drift beyond a pinned baseline must be deliberate, reviewed, and documented in `git diff` so that the gap is visible and intentional.

---

## What the Gate Checks

### Two-Tree Comparison

The gate compares two directory trees, file-by-file:

| Tree | Path | Purpose |
|---|---|---|
| **Live catalog** | `.deckent/agents/` and `.deckent/skills/` | Deckent's working development catalog — modified during sprints, used by `deckent do` and dogfood runs. |
| **Shipped baseline** | `src/core/builtins/agents/` and `src/core/builtins/skills/` | Frozen snapshot shipped in the npm package and seeded onto fresh projects via `deckent init`. |

### Drift Detection

For each item (agent or skill), the gate checks:

1. **Presence**: Is the item only in the live catalog, only in the shipped baseline, or in both?
2. **Content** (if present in both): Do the manifest files (`.json`) and documentation (`.md`) match exactly?

The gate normalizes before comparing:
- Drops `stats` fields (moved to gitignored sidecar per ADR-605; they are implementation noise, not canonical drift).
- Sorts JSON keys for order-independence.

### Grandfathered Baseline

A file `.deckent/builtins-drift-baseline.json` contains a list of "known drift" items — the ~40 entries that have always differed between the two trees. This baseline is **grandfathered** (accepted without judgment) because:

- The decision to allow these differences lives in domain expertise, not in this gate. See `docs/analysis/builtins-drift-inventory-2026-07-11.md` for Alperen's detailed rationale.
- The gate's job is to prevent *new* drift from silently appearing; it does not reverse old decisions.

**Format:** `.deckent/builtins-drift-baseline.json`
```json
{
  "note": "builtins-drift-check ratchet baseline...",
  "generatedFrom": "node scripts/builtins-drift-check.mjs --write",
  "driftKeys": [
    "agents::only-a::agent-name",
    "agents::diff::another-agent::manifest",
    "skills::only-b::skill-name",
    ...
  ]
}
```

Each `driftKey` uniquely identifies a drift item (category + kind + file path). A new key not in this list will fail `--check`.

---

## Failure Output

When the gate detects NEW drift (items not in the baseline), it fails with exit code **1** and prints both stdout and stderr:

### STDERR (actionable detail)
```
[builtins-drift-check] FAIL: 3 new drift item(s) beyond baseline:
agents::diff::my-agent::manifest
skills::only-a::experimental-skill
skills::diff::core-skill::doc
If intentional, run `node scripts/builtins-drift-check.mjs --write` to grandfather it (diff-visible in review).
```

### Exit codes
| Code | Meaning | Action |
|---|---|---|
| `0` | Baseline green; no new drift detected. | Proceed; publish gate passes. |
| `1` | New drift detected beyond the baseline. | Developer must decide: intentional or unintended? Re-pin or rollback. |
| `2` | Scan error (e.g., malformed manifest, missing baseline). | Regenerate baseline or fix filesystem state. See stderr for details. |

---

## Resolving Drift

### Scenario: Intentional New Drift

If new drift is deliberate (e.g., a new agent added to `.deckent/agents/` during dogfood that should not yet ship):

1. **Re-pin the baseline** to include the new drift:
   ```bash
   node scripts/builtins-drift-check.mjs --write
   ```
   This regenerates `.deckent/builtins-drift-baseline.json` to include the current live state.

2. **Review the diff:**
   ```bash
   git diff .deckent/builtins-drift-baseline.json
   ```
   The updated baseline will show exactly which drift keys are new. This is intentional — the diff is part of the review process.

3. **Commit** the updated baseline as part of your PR/commit. The drift is now grandfathered in the new baseline and will not fail future checks.

### Scenario: Unintended Drift

If the gate detects drift you did not expect:

1. **Investigate:** Run the detailed report:
   ```bash
   node scripts/builtins-drift-check.mjs --json
   ```
   Or the human-readable version:
   ```bash
   node scripts/builtins-drift-check.mjs
   ```

2. **Decide:** Either roll back the change (restore the shipped version) or commit to grandfathering it by re-pinning the baseline (intentional path above).

---

## Lint:Gates Integration

### Wiring

The gate is part of the `npm run lint:gates` chain. The npm script:

```json
{
  "scripts": {
    "lint:gates": "... && node scripts/builtins-drift-check.mjs --check"
  }
}
```

It runs **after** other lint gates (ADR, link validation, etc.) and is itself async-spawned to capture both stdout and stderr separately (necessary for the failure detail to reach developers; older execSync-based wiring dropped stderr, causing silent failures).

### Performance

**Measured runtime (Sprint 451, task 451-002):** 3 sequential runs showed median **117 ms** (min 113 ms, max 163 ms), well below the ~3 second "negligible" threshold.

- Filesystem scan: ~100 ms (list dirs, read ~80 manifest/doc files from both trees).
- JSON comparison: <1 ms per file.
- Baseline load/diff: <10 ms.

This gate imposes no measurable publish-time cost and can scale to 1000+ catalog items without concern.

---

## Baseline Regeneration

### Initial Baseline (First Setup)

If `.deckent/builtins-drift-baseline.json` is missing, the gate will fail with exit code **2**:

```bash
[builtins-drift-check] no baseline at .deckent/builtins-drift-baseline.json.
  Run `node scripts/builtins-drift-check.mjs --write` to pin the current (reviewed) drift state, then re-run --check.
```

**First-time fix:**
```bash
node scripts/builtins-drift-check.mjs --write
```

This is a one-time operation when joining the project or after a clean checkout.

### Updating the Baseline

**IMPORTANT:** The baseline is **intentionally not auto-regenerating**. This is a feature: every baseline change is diff-visible in git, preserving intent and auditability.

To deliberately update the baseline (e.g., after adding new agents or modifying existing ones):
```bash
node scripts/builtins-drift-check.mjs --write
git diff .deckent/builtins-drift-baseline.json  # Review what changed
git add .deckent/builtins-drift-baseline.json
git commit -m "update builtins drift baseline"
```

---

## Manifest Normalization (Implementation Detail)

The gate normalizes manifests to prevent noise-induced false positives:

- **Stats fields:** Dropped entirely. These contain per-agent performance stats that moved to a gitignored sidecar (`.deckent/agent-stats-ledger.jsonl`) per ADR-605. They are not part of canonical agent behavior.
- **Key order:** JSON is sorted by key before comparison, so reordering keys does not trigger drift detection.
- **Depth:** Normalization applies recursively, so nested objects are also sorted.

This means:
```json
{
  "stats": { "totalUses": 42 },
  "name": "my-agent"
}
```

is equivalent to:

```json
{
  "name": "my-agent"
}
```

for drift-detection purposes.

---

## Common Cases

### Adding a New Agent/Skill to `.deckent/`

1. Add the agent/skill to `.deckent/agents/new-name/` or `.deckent/skills/new-name/`.
2. Run `npm run validate:publish` (or `npm run lint:gates`).
3. Gate fails: `agents::only-a::new-name` is new drift.
4. If intentional, re-pin: `node scripts/builtins-drift-check.mjs --write` and commit.
5. Gate passes on next run.

### Modifying an Existing Agent's Manifest in `.deckent/`

1. Edit `.deckent/agents/my-agent/agent.json`.
2. Run the gate.
3. If the edit is intentional, re-pin and commit.
4. If accidental, revert the edit.

### Agent Already Drifted; Baseline Has It

If `.deckent/builtins-drift-baseline.json` already lists `agents::diff::my-agent::manifest`, modifying the agent will **not** fail the gate. The baseline "protects" known drift — only *new* keys are detected.

To revert a drifted agent back to the shipped version:
```bash
rm -rf .deckent/agents/my-agent
```

Then re-pin the baseline to remove the key:
```bash
node scripts/builtins-drift-check.mjs --write
```

---

## References

- **Source:** `scripts/builtins-drift-check.mjs` — the gate implementation.
- **Wiring:** `package.json` scripts block, `npm run lint:gates` chain.
- **Baseline:** `.deckent/builtins-drift-baseline.json` (gittracked, regenerated by developers).
- **Analysis:** `docs/analysis/builtins-drift-inventory-2026-07-11.md` — Alperen's decision rationale for grandfathered drift.
- **Task context:** Sprint 451, task 451-002 (lint:gates wiring + performance measurement).
- **ADR-605:** Agent stats sidecar (context for why stats fields are normalized out).

---

## Troubleshooting

| Problem | Diagnosis | Fix |
|---|---|---|
| Gate fails with "no baseline" | `.deckent/builtins-drift-baseline.json` missing. | Run `node scripts/builtins-drift-check.mjs --write` once. |
| Unexpected "new drift" after merging | Another branch added/modified agents; your baseline is stale. | Fetch main, merge, run `git reset --hard origin/main`, then re-check. |
| Manifest comparison says "JSON diff" but files look the same | Key order differs, or `stats` field was removed. Run `--json` to see exact diff keys. | Expected; key order does not matter. Re-pin if intentional or revert if accidental. |
| Gate hangs or times out | Filesystem or permission issue; scan is stuck. | Check disk space and file permissions in `.deckent/`. |
