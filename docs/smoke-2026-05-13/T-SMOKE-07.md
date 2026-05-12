# deckent_doctor — MCP Tool Reference

## Overview

`deckent_doctor` is a read-only health-check tool that diagnoses the Deckent environment before or after a sprint. It runs a battery of checks across the runtime, workspace files, and external tool dependencies, then returns a `healthScore` (0–100) and a `recommendations` list so you know exactly what to fix. Use it when a sprint fails unexpectedly, before starting a new sprint, or any time you suspect an environment issue.

The tool is idempotent and non-destructive — it never writes to disk. Running it multiple times is safe and encouraged.

---

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `includeProfile` | boolean | `false` | Append system profile: CPU core count, total/free RAM, recommended max workers, and detected Claude subscription tier. |
| `profile` | boolean | `false` | Alias for `includeProfile` — identical behaviour. |
| `json` | boolean | `false` | Return raw JSON without the human-readable summary wrapper. Useful for programmatic consumption or CI pipelines. |

---

## Health Checks

`deckent_doctor` runs **15 checks** grouped into three categories:

### Runtime Dependencies (required)

| Check | What It Verifies | Required |
|-------|-----------------|----------|
| **Node.js** | Node.js is installed and `>=18`. | Yes |
| **git** | `git` binary is available. Needed for rollback, safety points, and branch management. | Yes |
| **Claude CLI** | `claude` binary is installed. Optionally verifies authentication (`claude config get account`). | Yes |
| **Write Permissions** | `.tasks/` and `.brain/` directories are writable. | Yes |

### Optional Tool Availability

| Check | What It Verifies | Required |
|-------|-----------------|----------|
| **Platform** | macOS / Linux / WSL2 fully supported; Windows only with `subprocess` backend. | No |
| **tmux** | Required when `spawn_backend = tmux` (default for Claude provider). Skipped for `subprocess` or `docker` backends. | Conditional |
| **Docker** | Available when `spawn_backend = docker` or `auto`. Verifies daemon + `deckent-worker:latest` image exists. | Conditional |

### Workspace & Brain State

| Check | What It Verifies | Required |
|-------|-----------------|----------|
| **Workspace** | `.deckent/` directory exists. Missing → run `deckent init`. | No |
| **Brain Dir** | `.brain/` directory exists with required files (MEMORY.md, DEBT.md, DECISIONS.md). | No |
| **Directives** | `DIRECTIVES.md` exists and is not empty. | No |
| **Brain Budget** | Memory entry count ≤ 900 lines. Over budget → `deckent cleanup --decay`. | No |
| **Debt** | Checks for CRITICAL tech-debt items in DEBT.md. | No |
| **Locks** | Stale lock files in `.locks/` older than 5 minutes. Run `deckent cleanup` to remove them. | No |
| **.deck Security** | `.deck` secret file is not tracked by git. | No |
| **Gitignore** | `memory.db` and WAL files are listed in `.gitignore` and not tracked by git. | No |

---

## healthScore & Recommendations

The tool computes a `healthScore` between 0 and 100:

```
healthScore = (passedChecks / totalChecks) * 100  (rounded)
```

For every **failed** check, a human-readable fix hint is added to the `recommendations` array:

```json
{
  "healthScore": 87,
  "recommendations": [
    "Fix: Brain Budget — 950/900 lines — OVER BUDGET, run cleanup --decay",
    "Fix: Locks — 2 stale lock(s) — run `deckent cleanup` to remove stale locks"
  ]
}
```

A score of **100** means all checks passed. Re-run doctor after each fix until you reach 100.

---

## NOT READY: What It Means

`NOT READY` (reported by `deckent doctor` CLI output as `ok: false`) means at least one **required** check has failed. Required checks are:

- Node.js `>=18` not found or too old
- `git` binary missing
- `Claude CLI` not installed
- Write permissions denied on `.tasks/` or `.brain/`

When `ok: false`, Brain will refuse to start a sprint because workers cannot execute safely. Non-required checks (tmux, Docker, Brain Budget, Debt, Locks) do not block sprint start — they generate warnings only.

**Fix workflow:**
1. Run `deckent_doctor` → read `recommendations`
2. Apply the suggested fix (install missing tool, grant permissions, etc.)
3. Run `deckent_doctor` again
4. Repeat until `healthScore` reaches 100

---

## Memory V2 Integration

`deckent_doctor` checks the Memory V2 (SQLite) state as part of the Brain Dir check:

- Verifies `.brain/` directory structure exists
- Confirms required export files are present (`MEMORY.md`, `DEBT.md`, `DECISIONS.md`)
- Verifies `memory.db` is **not** tracked by git (data-safety check)
- Reports Brain Budget as total DB entry count vs. the 900-line threshold

If the memory database is missing, it can be rebuilt from `.md` exports via `deckent memory rebuild`.

---

## System Profile (optional)

With `includeProfile: true`, the response includes:

```json
{
  "systemProfile": {
    "cpuCores": 8,
    "totalMemMB": 16384,
    "freeMemMB": 9142,
    "recommendedMaxWorkers": 4,
    "subscription": "pro",
    "subscriptionMethod": "env"
  }
}
```

`recommendedMaxWorkers` is derived from available RAM and CPU count, giving a safe upper bound for parallel worker spawning.

---

## Usage Examples

### MCP (Claude / Cursor)

```json
{ "tool": "deckent_doctor" }
```

```json
{ "tool": "deckent_doctor", "includeProfile": true }
```

```json
{ "tool": "deckent_doctor", "json": true }
```

### CLI

```bash
deckent doctor
deckent doctor --profile
deckent doctor --json
```

---

## When To Use

| Situation | Action |
|-----------|--------|
| Sprint failed unexpectedly | Run `deckent_doctor` — check for stale locks or missing tools |
| Before starting a new sprint | Confirm `healthScore: 100` |
| After installing Deckent in a new environment | Verify all required checks pass |
| Stale locks suspected | Look for `Locks` check failure + recommendations |
| Memory over budget | Look for `Brain Budget` check failure |
