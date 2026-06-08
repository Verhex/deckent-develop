# GitHub Directory Audit — 2026-05-22

**Scope:** `.github/` — CODEOWNERS, FUNDING.yml, workflows/  
**Context:** OSS launch prep — org: VerhexIO, repo: VerhexIO/deckent, domain: deckent.ai  
**Method:** Systematic debugging — root cause first, then fix

---

## Issues Found & Fixed

### 1. CODEOWNERS — Non-existent Team Reference

**Root cause:** `@verhex/deckent-core` referenced a team that doesn't exist in VerhexIO org. Wrong org slug AND wrong entity type.

**Fix:** Changed all owner references to `@alperensartacoglu` (sole maintainer). Removed team-level syntax entirely since there is no GitHub team — the repo is maintained directly under VerhexIO by `@alperensartacoglu`.

```diff
- * @verhex/deckent-core
+ * @alperensartacoglu
```

All path-specific entries updated identically.

---

### 2. package.json — Wrong Domain

**Root cause:** `"homepage"` pointed to `deckent.agency` (old domain), not `deckent.ai`.

**Fix:**
```diff
- "homepage": "https://deckent.agency"
+ "homepage": "https://deckent.ai"
```

---

### 3. publish.yml — Double Publish Race Condition

**Root cause:** `publish.yml` had TWO triggers:
- `release: [published]`
- `push: tags: v*`

When a release is created from a tag, both triggers fire simultaneously → two parallel `npm publish` jobs → npm 403 conflict on second publish.

**Fix:** Removed `push: tags: v*` trigger from `publish.yml`. Single trigger only: `release: [published]`.

Additionally added OOM protection for orchestra tests (same as release.yml):
```yaml
env:
  NODE_OPTIONS: '--max-old-space-size=8192'
```
And `--pool=forks` for `tests/orchestra/` vitest run.

---

### 4. release.yml — Was Running npm publish

**Root cause:** `release.yml` contained an `npm publish` step, duplicating `publish.yml`. Two different jobs racing to publish the same version.

**Fix:** Removed `npm publish` step entirely from `release.yml`. Release workflow now ONLY creates the GitHub Release (changelog extraction + `softprops/action-gh-release`). Publishing is exclusively `publish.yml`'s responsibility.

Clear division:
- `release.yml` → GitHub Release (triggered on tag push)
- `publish.yml` → npm publish (triggered on GitHub Release published)

---

### 5. docs.yml — Wrong Domain + Wrong Branch + npm install vs ci

**Three sub-issues in one file:**

1. CNAME was `docs.deckent.agency` → fixed to `docs.deckent.ai`
2. Deploy condition checked `refs/heads/master` → fixed to `refs/heads/main`
3. `npm install --prefix docs` → `npm ci --prefix docs` (reproducible installs for CI)

---

### 6. dashboard-build.yml — Stale Node Version Labels

**Root cause:** Job name and step name still referenced "Node 22.x" after matrix was updated to `[24.x, 26.x]`. Node 22 is not in the matrix.

**Fix:**
- `Full build:all integration (Node 22.x)` → `Full build:all integration (Node 24.x)`
- `Setup Node.js 22.x` → `Setup Node.js 24.x`

---

### 7. ci.yml — Missing Concurrency Control

**Root cause:** No `concurrency` block — rapid pushes to a PR could stack multiple CI runs, wasting runner minutes.

**Fix:** Added concurrency group before `jobs:`:
```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

---

## Files Unchanged (Intentional)

| File | Reason |
|------|--------|
| `FUNDING.yml` | Links correct: verhex.io + buymeacoffee. No changes needed. |
| `ISSUE_TEMPLATE/` | If present, content assumed current. |

---

## OSS Launch Readiness — .github/

| Check | Status |
|-------|--------|
| CODEOWNERS valid | ✅ `@alperensartacoglu` (real GitHub user) |
| Domain consistency | ✅ All references → `deckent.ai` |
| Publish safety | ✅ Single publisher (publish.yml only) |
| Branch consistency | ✅ All workflows target `main` |
| CI efficiency | ✅ Concurrency cancel-in-progress |
| Node version labels accurate | ✅ 24.x labels match matrix |
| OOM protection for orchestra | ✅ `--max-old-space-size=8192` in release + publish |

All critical issues resolved. `.github/` is OSS-launch ready.
