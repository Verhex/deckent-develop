# A23 — Development Guides Audit
*Auditor: w-345-023 (sonnet) | Sprint 345 | 2026-06-28*

Scope: `docs/development/dashboard-guide.md`, `plugin-guide.md`, `repo-sync.md`, `troubleshooting.md`  
Evidence: verified against `src/dashboard/`, `src/cli/commands/`, `scripts/sync-to-product.mjs`, `package.json`

---

## Summary

| Guide | Status | Issues |
|-------|--------|--------|
| dashboard-guide.md | ⚠️ STALE | 2 issues (page count, output dir) |
| plugin-guide.md | ✅ ACCURATE | — |
| repo-sync.md | ⚠️ STALE | 1 issue (EXCLUDE path name) |
| troubleshooting.md | ⚠️ STALE | 1 issue (nvm version in §2.1) |

---

## 1. dashboard-guide.md

### 1.1 — ISSUE: Page count "16 pages" is outdated

**Claim (line 149):** "Dashboard Pages (16)"

**Evidence:** `src/dashboard/src/App.tsx` — 20 routes defined:

```
/              DashboardPage
/settings      SettingsPage
/debt          DebtPage
/history       HistoryPage
/memory        MemoryPage
/config        ConfigPage
/chat          ChatPage
/status        StatusPage
/evolution     EvolutionPage
/nervous       NervousPage
/autonomous    AutonomousPage          ← not in guide
/enterprise    EnterprisePage
/memory-explorer  MemoryExplorerPage
/workers       WorkersPage
/directives    DirectivesPage
/docs-health   DocsHealthPage          ← not in guide
/missions      MissionsPage            ← not in guide
/kpi           KpiTrendPage            ← not in guide
/login         LoginPage
/auth/callback CallbackPage
```

Four pages absent from the guide table: `/autonomous`, `/docs-health`, `/missions`, `/kpi`. Header count `(16)` should be `(20)`.

**Fix needed:** Update page count to 20 and add the 4 missing route rows.

---

### 1.2 — ISSUE: Dashboard output directory is wrong for canonical build

**Claim (overview, line 10):** "Built assets are output to `src/dashboard/dist/`"

**Evidence:** `scripts/build-dashboard.mjs` (line 49):
```js
run('npx', ['vite', 'build', '--outDir', '../../dist/dashboard', '--emptyOutDir'], dashDir);
```

`src/cli/helpers/dashboard-dir.ts` (comment, lines 2–7):
```
// The web dashboard is built to <pkg>/dist/dashboard
// (`vite build --outDir ../../dist/dashboard`).
// (Previous bug: web.ts/serve.ts used join(projectRoot, 'src/dashboard/dist').)
```

The canonical `npm run build:dashboard` writes to **`dist/dashboard/`** at the package root, NOT `src/dashboard/dist/`. The runtime serve layer (`getDashboardStaticDir`) resolves to `dist/dashboard` relative to the installed package. The `src/dashboard/dist/` path only arises if you manually run `cd src/dashboard && npm run build` (Vite default) — but that path is unused at runtime.

**Fix needed:** Overview sentence should read "Built assets are output to `dist/dashboard/` (canonical) or `src/dashboard/dist/` (manual `cd src/dashboard && npm run build`)."

---

### 1.3 — Verified correct

| Claim | Source | Status |
|-------|--------|--------|
| React 19 | `src/dashboard/package.json` → `react@^19.0.0` | ✅ |
| Vite 6 | `devDependencies` → `vite@^6.0.0` | ✅ |
| Tailwind 4 | `tailwindcss@^4.0.0` + `@tailwindcss/vite` plugin | ✅ |
| lucide-react | `lucide-react@^0.468.0` | ✅ |
| recharts | `recharts@^2.15.0` | ✅ |
| `npm run build:all` = `clean && tsc && copy-assets && build:dashboard` | `package.json` scripts | ✅ |
| `npm run build:dashboard` → `node scripts/build-dashboard.mjs` | `package.json` scripts | ✅ |
| `npm run lint` = `tsc --noEmit && tsc --noEmit -p src/dashboard` | `package.json` scripts | ✅ |
| `npm run tsc:dashboard` | `package.json` scripts | ✅ |
| `npm run test:dashboard` = `vitest run --config vitest.dashboard.config.ts` | `package.json` scripts | ✅ |
| `npm run install:all` = `npm ci && npm ci --prefix src/dashboard` | `package.json` scripts | ✅ |
| `cd src/dashboard && npm run dev` → `vite` | `src/dashboard/package.json` scripts | ✅ |
| `deckent serve` `--port 3100`, `--host 127.0.0.1`, `--dev`, `--dev-port 5173` | `src/cli/commands/serve.ts` | ✅ |
| `deckent web` deprecated (use `deckent serve`) | `src/cli/commands/web.ts` line 30 | ✅ |
| Tailwind 4 CSS-first (no tailwind.config.js) via `@tailwindcss/vite` | `src/dashboard/vite.config.ts` | ✅ |

---

## 2. plugin-guide.md

### 2.1 — Fully verified

All claims verified against `src/core/plugin.ts` and `src/cli/commands/plugin.ts`:

| Claim | Source | Status |
|-------|--------|--------|
| Plugin dir `.deckent/plugins/<name>/` | `plugin.ts` line 22 | ✅ |
| Required manifest fields: name, version, description, entrypoint | `validateManifest()` in core/plugin.ts | ✅ |
| model must be `opus` / `sonnet` / `haiku` | manifest validation | ✅ |
| `"enabled": false` deactivates without removing | `scanPlugins()` reads `enabled` field | ✅ |
| Hook points: beforeSprint, afterSprint, beforeTask, afterTask | plugin type interfaces | ✅ |
| `deckent plugin create <name>` | plugin.ts line 216 | ✅ |
| `deckent plugin install <source>` (npm / git / local) | core/plugin.ts `installFromNpm`, `installFromGit`, `installFromLocal` | ✅ |
| `deckent plugin update <source>` | plugin.ts line 57 | ✅ |
| `deckent plugin list [--json]` | plugin.ts line 76 | ✅ |
| `deckent plugin info <dir>` | plugin.ts line 114 | ✅ |
| `deckent plugin test <name>` | plugin.ts line 142 | ✅ |
| `deckent plugin remove <name>` | plugin.ts line 36 | ✅ |
| System plugins (`"system": true`) cannot be removed | verified in removePlugin() | ✅ |
| No enable/disable CLI subcommand — edit manifest.json directly | no such subcommand in plugin.ts | ✅ |

No inaccuracies found. Guide is complete for the implemented surface.

---

## 3. repo-sync.md

### 3.1 — ISSUE: EXCLUDE path discrepancy

**Claim (line 60):** EXCLUDE list includes `docs/alperen-analysis/`

**Evidence:** `scripts/sync-to-product.mjs` `EXCLUDE` array:
```js
'docs/analysis/',
```

The script uses `docs/analysis/`, not `docs/alperen-analysis/`. Likely a rename that was not reflected in the doc.

**Fix needed:** Update the EXCLUDE list in repo-sync.md to match the actual path in the script (`docs/analysis/`), or investigate whether a rename happened and update both.

---

### 3.2 — Verified correct

| Claim | Source | Status |
|-------|--------|--------|
| `node scripts/sync-to-product.mjs` → dry-run (default) | script line 8 (no --apply = dry-run) | ✅ |
| `--apply` → writes to temp staging dir | script `apply` branch | ✅ |
| `--staging=/path` → custom staging dir | script `--staging` option | ✅ |
| Security scan: `sk-ant-[A-Za-z0-9_-]{20,}`, `AIza[A-Za-z0-9_-]{30,}` | KEY_PATTERNS in script | ✅ |
| Files >5MB skipped in security scan | `MAX_SCAN_BYTES = 5 * 1024 * 1024` | ✅ |
| `tests/` and `__fixtures__/` paths skipped | `KEY_FIXTURE_ALLOW` in script | ✅ |
| Abort on key match: `{ ok: false, abort: "security" }` | script abort path | ✅ |
| Script does NOT commit or push — human-controlled | script comment + implementation | ✅ |
| `scripts/clean-clone-smoke.mjs` referenced | file exists in `scripts/` | ✅ |
| `docs/adr/065-develop-product-repo-split.md` referenced | file exists in `docs/adr/` | ✅ |

---

## 4. troubleshooting.md

Coverage note: 867-line guide, 7 sections, 22 symptoms. Deep-verified §1–§2, §5–§7 (all command-based fixes); §3–§4 (MCP and tmux) skimmed — commands are plausible and match CLI surface, not re-executed.

### 4.1 — ISSUE: §2.1 nvm version inconsistency

**Claim (§2.1 "Option 1: Fix the underlying issue", line 154):**
```bash
nvm install 22 && brew install tmux
```

**Evidence:**
- ADR-001: Node 24+ is the validated runtime floor.
- `package.json` `engines`: `"node": ">=24.0.0"`.
- Same file, §1.2 solution (line 54): `nvm install 24`.
- Same file, §6 doctor table (line 642): `nvm install 24`.

The §2.1 fix is internally inconsistent with the rest of the guide and with ADR-001. Installing Node 22 would not satisfy the ≥24 requirement and would still fail doctor checks.

**Fix needed:** Change line 154 from `nvm install 22` to `nvm install 24`.

---

### 4.2 — Verified correct

| Claim | Source | Status |
|-------|--------|--------|
| `deckent cleanup --decay` — decay option | `src/cli/commands/cleanup.ts` line 79 | ✅ |
| `deckent attach` command | `src/cli/commands/attach.ts` exists | ✅ |
| `deckent archive-debt` command | `src/cli/commands/archive-debt.ts` exists | ✅ |
| `npm run test:ci-sim` → `node scripts/test-ci-sim.mjs` | `package.json` scripts | ✅ |
| `scripts/test-ci-sim.mjs --dry-run` | file exists in `scripts/` | ✅ |
| §6 doctor table: Node ≥ 24, `nvm install 24` | correct (see 4.1 for §2.1 conflict) | ✅ |
| §7.1 `npm run lint` = `tsc --noEmit && tsc --noEmit -p src/dashboard` | `package.json` scripts | ✅ |
| §7.1 `npm run dev` = `tsc --watch` | `package.json` scripts | ✅ |
| ADR-087 hermetic test pattern (mkdtemp + afterEach cleanup) | matches ADR-087 spec | ✅ |
| ESM import `.js` extension required (ADR-002) | correct, enforced by Node16 resolution | ✅ |
| Reference link `docs/adr-index.md` | file exists | ✅ |
| Reference link `docs/architecture/architecture.md` | file exists | ✅ |
| Reference link `docs/architecture/memory-system.md` | file exists | ✅ |
| Reference link `docs/reference/config.md` | file exists | ✅ |
| Reference link `docs/reference/api-surface.md` | file exists | ✅ |
| Reference link `docs/guide/architecture-overview.md` | file exists | ✅ |
| §1.2 stale doctor message note (`>=18 required` shown, actual floor is ≥24) | self-documented in guide | ✅ |

**Note — ADR count:** §7 references "89 ADRs" in `docs/adr-index.md`. The auditor.md active-ADR list has 77 IDs; the DB may contain additional deprecated/superseded ADRs not in the active list. Not flagged as a critical error — the authoritative count is `store.getByType('adr')` in memory.db.

---

## Action Items

| Priority | File | Location | Fix |
|----------|------|----------|-----|
| P1 | `troubleshooting.md` | §2.1 line 154 | `nvm install 22` → `nvm install 24` |
| P2 | `dashboard-guide.md` | §"Dashboard Pages (16)" table | Add 4 missing pages; update count to 20 |
| P2 | `dashboard-guide.md` | Overview line 10 | Clarify output dir: `dist/dashboard/` (canonical) |
| P3 | `repo-sync.md` | EXCLUDE list | `docs/alperen-analysis/` → `docs/analysis/` (verify rename) |

P1 = correctness bug (wrong Node version — contradicts ADR-001 and rest of guide)  
P2 = staleness (misleads developer about project structure)  
P3 = doc/code drift (script is authoritative; may be a post-rename doc lag)
