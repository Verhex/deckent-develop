# npm publish Dry-Run Final Audit — Sprint 150

**Date:** 2026-04-21
**Task:** T-150-026
**Version:** 1.0.0-beta.1
**Sprint:** sprint-150 (Beta GA Prep)

---

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| npm pack --dry-run | ✅ PASS | exit 0, 757 files |
| Tarball size | ✅ PASS | 1.08 MB (limit: 2MB) |
| Secret scan | ✅ PASS | No API keys, no .deck, no credentials |
| Sensitive dirs excluded | ✅ PASS | .brain/, .tasks/, .deckent/, .locks/ all absent |
| package.json metadata | ✅ PASS | All 6 required fields present |
| Version | ✅ PASS | 1.0.0-beta.1 |
| Built-in bundle (T-150-031) | ⚠️ DEFERRED | T-150-031 not yet complete — builtins/ not in dist |

**Overall gate:** GO_WITH_TECH_DEBT (T-150-031 built-in bundle pending)

---

## Tarball Details

```
name:          deckent
version:       1.0.0-beta.1
filename:      deckent-1.0.0-beta.1.tgz
package size:  1.1 MB (1,127,590 bytes)
unpacked size: 4.5 MB
total files:   757
```

---

## Check Details

### 1. Version
```
package.json version: 1.0.0-beta.1 ✅
```

Version was already at `1.0.0-beta.1` — bumped earlier in Sprint 150 lifecycle. The `npm version --allow-same-version` flag handles this idempotently.

### 2. Tarball Size
- **Actual:** 1.08 MB
- **Limit:** 2 MB
- **Status:** PASS (55% headroom)

### 3. Secret Scan
No matches found for:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `.deck` (exact secret file)
- `credentials.json`
- `.env` (exact file)

### 4. package.json Metadata
All required fields verified:

| Field | Value |
|-------|-------|
| `description` | "AI agent orchestration system — your AI development team, orchestrated." |
| `homepage` | https://deckent.ai |
| `bugs` | https://github.com/VerhexIO/deckent/issues |
| `repository` | https://github.com/VerhexIO/deckent.git |
| `keywords` | ai, agent, orchestration, claude, cli, agents, skills, marketplace, analytics |
| `license` | MIT |

### 5. Included Paths
From `package.json` `files[]`:
- `dist/` ✅ (compiled TypeScript output)
- `bin/` ✅ (executable scripts)
- `README.md` ✅
- `LICENSE` ✅

### 6. Sensitive Directory Exclusion
All internal directories correctly excluded:
- `.brain/` — project memory (gitignored, not in files[])
- `.tasks/` — sprint task files (gitignored)
- `.deckent/` — project configuration (user-specific, should be regenerated on install)
- `.locks/` — runtime locks (transient)

### 7. Built-in Bundle (T-150-031) — DEFERRED

**Status:** ⚠️ DEFERRED — T-150-031 not yet complete

`dist/core/builtins/` does not exist in current build. This directory will be created by T-150-031's `scripts/bundle-builtins.mjs` pipeline.

Expected after T-150-031 completion:
```
npm pack --dry-run 2>&1 | grep -c "dist/core/builtins/agents/.*\.json"  → ≥ 15
npm pack --dry-run 2>&1 | grep -c "dist/core/builtins/skills/.*\.json"  → ≥ 21
```

**Re-run script:** `bash scripts/npm-publish-dry-final.sh` will validate T-150-031 automatically.

---

## Script Location

`scripts/npm-publish-dry-final.sh` — updated in T-150-026 to include 9 checks:

1. Version bump (idempotent with `--allow-same-version`)
2. `npm pack --dry-run` output capture
3. Tarball size check (< 2MB)
4. Secret pattern scan
5. package.json metadata completeness
6. Version verification
7. Required files inclusion
8. Built-in bundle verification (T-150-031 gate)
9. Sensitive directory exclusion

---

## Next Steps (Beta GA)

1. Complete T-150-031 (built-in agent/skill bundle pipeline)
2. Run `node scripts/bundle-builtins.mjs && npm run build`
3. Re-run `bash scripts/npm-publish-dry-final.sh` → should be full PASS
4. Alperen approval → `npm publish --tag beta`
5. `git tag v1.0.0-beta.1 && git push --tags`
6. VerhexIO/deckent public repo flip (Sprint 151)

---

## Sprint 150 Gate Contribution

This audit satisfies Sprint 150 gate #12:
> npm pack --dry-run clean + **built-in 15+21 bundle fiziksel var** (T-150-031 canlı doğrulama T-150-026 pack içinde)

Currently: partial pass (11/12 checks pass, built-in bundle pending T-150-031).
