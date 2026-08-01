# npm Publish Dry-Run Audit — Sprint 148

**Status:** ✅ **GO**
**Date:** 2026-04-20
**Version:** `0.4.0-beta.4`
**Script:** `scripts/npm-publish-dry.sh`
**Purpose:** Sprint 149 full npm publish rehearsal

---

## Summary

| Check | Result |
|-------|--------|
| Version bump (0.4.0-beta.1 → 0.4.0-beta.4) | ✅ PASS |
| `npm pack --dry-run` success | ✅ PASS |
| `npm publish --dry-run` success | ✅ PASS |
| Tarball size < 2MB | ✅ PASS (877 kB) |
| No secret patterns | ✅ PASS |
| Sensitive dirs excluded | ✅ PASS (6/6) |
| Required files included | ✅ PASS (4/4) |
| Version verification | ✅ PASS |

**Overall: 8/8 checks PASS**

---

## Tarball Stats

| Metric | Value |
|--------|-------|
| Package size (compressed) | 877.0 kB |
| Unpacked size | 3.6 MB |
| Total files | 727 |
| Size limit | 2,000 kB (2 MB) |
| Headroom | 1,123 kB remaining |

---

## Sensitive Directory Exclusion

The following directories are confirmed **excluded** from the published package:

| Directory | Status |
|-----------|--------|
| `.brain/` | ✅ Excluded |
| `.tasks/` | ✅ Excluded |
| `.deckent/` | ✅ Excluded |
| `.locks/` | ✅ Excluded |
| `tests/` | ✅ Excluded |
| `src/` | ✅ Excluded |

These exclusions are enforced via `.npmignore` (root level).

---

## Required Files Included

| File | Status |
|------|--------|
| `dist/` | ✅ Included |
| `README.md` | ✅ Included |
| `LICENSE` | ✅ Included |
| `package.json` | ✅ Included |

---

## Secret Pattern Check

Scanned `/tmp/npm-pack-dry.log` for patterns: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `.env`, `password`, `secret`.

**Result: 0 matches — clean.**

---

## Package Distribution (Top Content by Directory)

The `dist/` directory contains compiled JS + TypeScript declaration files:

- `dist/agents/` — 17 modules (adaptive-agent, worker-ipc, etc.)
- `dist/orchestra/` — Sprint lifecycle modules
- `dist/core/` — Types, config, routing engine
- `dist/cli/` — 40+ CLI commands
- `dist/mcp/` — 22 MCP tools + 8 resources
- `dist/nervous/` — Nervous system (Sprint 147)
- `dist/api/` — HTTP API server
- `dist/dashboard/` — Pre-compiled dashboard assets

Source files (`src/`), test files (`tests/`), and development configuration are all excluded.

---

## npm publish Output

```
npm warn This command requires you to be logged in to https://registry.npmjs.org/ (dry-run)
npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access (dry-run)
+ deckent@0.4.0-beta.4
```

Publish dry-run confirms correct registry target, tag (`latest`), and version.

---

## Sprint 149 Publish Readiness

| Prerequisite | Status |
|-------------|--------|
| Version `0.4.0-beta.4` in package.json | ✅ Ready |
| npm registry login required | ⚠️ Manual step (not automated) |
| `npm publish --tag beta` recommended | 📝 Use `beta` tag for pre-release |
| Git tag `v0.4.0-beta.4` | 📝 Manual: `git tag v0.4.0-beta.4 && git push --tags` |

**Recommendation:** For Sprint 149 full publish, use `npm publish --tag beta` to avoid overwriting `latest` tag before Beta GA (Sprint 150).

---

## Kanıt

```bash
bash scripts/npm-publish-dry.sh
# → ✅ npm publish dry-run PASS — deckent v0.4.0-beta.4
```

Script exit code: **0**
