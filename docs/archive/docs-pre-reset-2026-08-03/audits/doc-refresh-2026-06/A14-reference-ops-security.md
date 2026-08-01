# A14 — Reference Ops & Security Audit

**Sprint:** 345  
**Task:** 345-014  
**Auditor:** w-345-014 (doc-writer / security-auditor)  
**Date:** 2026-06-28  
**Scope:** `docs/reference/performance.md`, `resource-profile.md`, `health-check.md`, `security.md`, `migration-guide.md`

---

## Audit Method

Each doc was read in full, then cross-referenced line-by-line against:

- `src/cli/commands/doctor.ts` — all check functions, runDoctorChecks(), Node version gate
- `src/cli/commands/doctor-checks.ts` — checkPlatform, isRunningInWSL
- `src/agents/worker.ts:566-608` — `checkWorkerAuthority()`, RBAC enforcement
- `src/monitor/auditor.ts:670-689` — `isFileInScope()` implementation
- `src/orchestra/spawn-backend-docker.ts` — memory defaults, swap ratio, WORKER_NODE_OPTIONS
- `src/core/system-profile.ts` — `calcRecommendedMaxWorkers()` formula
- `src/orchestra/resource-report.ts` — `parseResourceLog()`, `summarizeByTask()`
- `src/orchestra/sprint-finalizer.ts:472-540` — Brain config write
- ADR-037 authority matrix (V1.0 + Sprint 281 amendment)

---

## Summary

| Doc | Status | Critical Issues | Moderate | Minor |
|-----|--------|-----------------|----------|-------|
| `health-check.md` | ⚠ NEEDS UPDATE | 3 | 0 | 1 |
| `security.md` | ⚠ NEEDS UPDATE | 2 | 1 | 0 |
| `migration-guide.md` | ⚠ NEEDS UPDATE | 0 | 1 | 0 |
| `resource-profile.md` | ✓ ACCURATE | 0 | 0 | 1 |
| `performance.md` | ✓ ACCURATE | 0 | 0 | 1 |

---

## health-check.md

### CRITICAL-1: Node.js check enforces ≥18, not ≥24

**Doc claim** (Check 2, line 83–86):
> "Node is in PATH; version ≥ 24"

**Code reality** (`src/cli/commands/doctor.ts:114-127`):
```typescript
if (major < 18) {
  return { ..., message: `${version} found but >=18 required — ...`, required: true };
}
return { ..., message: `${version} (>=18 required)`, required: true };
```

The health check enforces `>=18`, not `>=24`. ADR-001 (amended 2026-06-11) sets the *architecture floor* at Node 24+, but the runtime gate in `doctor.ts` still checks `major < 18`. The doc's "version ≥ 24" claim reflects the ADR intent, not what the code actually blocks.

**Impact:** Users on Node 18–23 will pass `deckent doctor` but run below the ADR-001 validated baseline.

**Fix:** Update check 2 in the catalog table to say "version ≥ 18 (runtime gate); ADR-001 requires ≥ 24 for full validation." Separately, `doctor.ts` should be updated to enforce `>=24` per ADR-001 (tracked as ADR-001-W).

---

### CRITICAL-2: Brain Dir check verifies different files than documented

**Doc claim** (Check 8, line 162–169):
> "Checks `.brain/` directory and required export files (`exports/summary.md`, `exports/decisions.md`, `exports/memory.md`)."

**Code reality** (`src/cli/commands/doctor.ts:209-232`):
```typescript
const hasV2Decisions =
  existsSync(join(brainPath, MEMORY_DB_FILE))        // .brain/memory.db
  || existsSync(join(brainPath, DECISIONS_EXPORT_RELATIVE)); // .brain/exports/decisions.md
const hasLegacyDecisions = existsSync(join(brainPath, DECISIONS_FILE)); // .brain/DECISIONS.md
```

The code checks only whether `memory.db` **or** `exports/decisions.md` (or legacy `DECISIONS.md`) exists. It does **not** check `exports/summary.md` or `exports/memory.md`. Those two files are never tested.

**Fix:** Update the "What it verifies" column and the detail paragraph to reflect the actual two-path check: "memory.db (V2 primary) or exports/decisions.md (V2 generated) or legacy DECISIONS.md."

---

### CRITICAL-3: Brain Budget counts DB entries, not export file lines

**Doc claim** (Check 10, line 196–201):
> "Counts lines in `.brain/exports/*.md` files and compares to the configured budget."

Also, sample output in Section 4.2 of `performance.md`:
```
# ✓ Brain Budget  247/600 lines
```

**Code reality** (`src/cli/commands/doctor.ts:252-271`):
```typescript
function getMemoryEntryCount(projectRoot: string): number {
  const store = new MemoryStore(dbPath);
  try { return store.totalCount(); }   // counts rows in memory.db
  ...
}
function checkBrainBudget(root: string, memoryBudget = 900): DoctorCheck {
  const lines = getMemoryEntryCount(root);   // DB entries, NOT file lines
```

The metric is **SQLite row count from `memory.db`**, not line count of export files. The word "lines" in the message is a legacy label from before Memory V2 (SQLite migration). The default budget is **900** (not 600 as the example implies).

**Fix:** Update the check description and the example output:
- "Counts entries in `.brain/memory.db` (via MemoryStore.totalCount())"
- Default threshold: 900 (not 600)

---

### MINOR-1: Example budget output uses wrong default threshold

The sample `deckent doctor` output in performance.md section 4.2 shows `247/600 lines` and the over-budget threshold implies 600. The `checkBrainBudget` default is `memoryBudget = 900` (`doctor.ts:263`). Update the example to show 900.

---

## security.md

> **Preamble — ADR-037 V1.0 enforcement reality:**  
> Layer 2 (runtime hard-block) is **intentionally absent in V1.0** and is a post-GA V2 flip. `checkWorkerAuthority()` returns `true` (allows the write) even on a detected violation unless the caller passes `enforceRbac: true`. This is the canonical source of truth per ADR-037 header note (amended Sprint 281). Any security doc that implies hard blocking for CLI/tmux workers overstates the V1.0 guarantee.

### CRITICAL-1: Trust boundary diagram overstates enforcement

**Doc claim** (Section 6, line 301-302):
> "Each boundary is enforced independently — a compromised Worker cannot escalate to Brain-level writes, and the Auditor cannot create tasks or spawn agents."

**Code reality** (`src/agents/worker.ts:600-605`):
```typescript
// ADR-037 V2 hard-deny: honor enforce_rbac flag when on; soft (allow) when off.
if (opts?.enforceRbac === true) {
  return false;
}
return true;  // violation detected but ALLOWED — advisory/soft
```

A worker writing outside its scope is **logged and emitted to event stream** (Layer 3 audit trail) but **not blocked** in V1.0. The statement "cannot escalate to Brain-level writes" is aspirational design intent, not V1.0 enforcement reality. The Auditor detects it post-hoc via `git diff --stat`.

**Fix:** Amend the trust boundary paragraph to accurately state the V1.0 enforcement level:
> "In V1.0, scope violations are detected and logged (audit trail), but not hard-blocked for CLI/tmux workers. Docker/local-model workers can optionally hard-block with `enforceRbac: true`. Full hard-block (Layer 2) is a V2 goal per ADR-037."

---

### CRITICAL-2: Configuration Security section incorrectly states Brain cannot write config

**Doc claim** (Section 8, line 333):
> "Brain reads this file but cannot write it."

**ADR-037 authority matrix:**
```
| `.deckent/config.json` | ✅ WRITE | Konfigürasyon güncelleme (config set komutu) |
```

**Code reality** (`src/orchestra/sprint-finalizer.ts:472`):
> "writes updated values to .deckent/config.json"

`sprint-finalizer.ts` writes updated `last_sprint_id` and self-learning config suggestions back to `.deckent/config.json`. Brain has this permission by design (e.g., `deckent config set`). The claim "cannot write it" is factually wrong.

**Fix:** Replace with accurate claim:
> "Brain may update limited config fields (e.g., `last_sprint_id`) at sprint end via `sprint-finalizer`. Brain cannot write Operator-level fields like `DIRECTIVES.md` or `AGENTS.md`. Workers have no access to the config file."

---

### MODERATE-1: Module Import Security section omits advisory-soft caveat

**Doc claim** (Section 7, line 312-313):
> "Brain is the **only** module that imports from tmux, auditor, worker | `tsc --noEmit` + code review"

**ADR-037 reality:** The authority-enforcer check is advisory/soft (Layer 1 = compile-time lint, but enforcement is via `npm run lint:adr` and code review — not a hard build failure). Also, ADR-008 was refined in Sprint 281 to define the "Brain-family" (sprint-controller, spawn-backend, etc.) as the set that may import auditor/worker, not literally just `brain.ts`.

The Section 7 table's one-line description is accurate but the simplification to "Brain is the only module" is incorrect post-god-object split (ADR-024/026). Brain-family modules (sprint-phases, sprint-spawner, spawn-backend, etc.) also import these.

**Fix:** Update to: "Brain-family modules (sprint-controller + extracted phase organics) are the only modules that may import tmux/auditor/worker — per ADR-008 Sprint 281 amendment."

---

## migration-guide.md

### MODERATE-1: DECKENT.md migration verification expects non-existent doctor checks

**Doc claim** (Section 3, lines 199-202):
```bash
deckent doctor
# Expected: ✓ DECKENT.md found
# Expected: ✓ CLAUDE.md references DECKENT.md
```

**Code reality** (`src/cli/commands/doctor.ts:1263-1275`, `runDoctorChecks()`):

The function runs exactly 15 checks: Platform, Node.js, git, tmux, Docker, Claude CLI, Workspace, Brain Dir, Directives, Brain Budget, Debt, Locks, .deck Security, Write Permissions, Gitignore. **There is no check for DECKENT.md or CLAUDE.md references.** These expected outputs will never appear.

**Fix:** Replace with an accurate verification step:
```bash
# Verify DECKENT.md exists and is referenced
ls DECKENT.md && grep -l "@DECKENT.md" CLAUDE.md AGENTS.md

# Then run doctor to confirm overall project health
deckent doctor
```

---

## resource-profile.md

### VERIFIED — ACCURATE

| Claim | Source | Verdict |
|-------|--------|---------|
| `DEFAULT_WORKER_MEMORY_LIMIT = '4g'` | `spawn-backend-docker.ts:48` | ✓ |
| `DEFAULT_WORKER_MEMORY_SWAP = '6g'` | `spawn-backend-docker.ts:49` | ✓ |
| `WORKER_NODE_OPTIONS = 'NODE_OPTIONS=--max-old-space-size-percentage=75'` | `spawn-backend-docker.ts:310` | ✓ |
| Node heap = 75% of container limit | `spawn-backend-docker.ts:308-310` | ✓ |
| swap = memory × 1.5 (kind-based) | `spawn-backend-docker.ts:89` | ✓ |
| `parseResourceLog` / `summarizeByTask` in `resource-report.ts` | `src/orchestra/resource-report.ts:39,63` | ✓ |
| Resource monitor best-effort (never stops sprint) | Monitor error handling | ✓ |

### MINOR-1: Import path in Section 9 is source-relative, not package-importable

The code snippet shows:
```typescript
import { parseResourceLog, summarizeByTask } from 'src/orchestra/resource-report.js';
```

This is a source-relative documentation style — it works in the context of the deckent project with TypeScript path resolution, but it's not a standard Node.js import path. For clarity, add a note that this is for internal use within the deckent source tree.

---

## performance.md

### VERIFIED — ACCURATE

| Claim | Source | Verdict |
|-------|--------|---------|
| Worker count formula: `max(1, min(floor(freeMemMB / 400), cpuCores - 1, 30))` | `system-profile.ts:6-17` | ✓ |
| `deckent plan --dry-run` | `src/cli/commands/plan.ts:89` | ✓ |
| `deckent start --dry-run` | `src/cli/commands/start.ts:165` | ✓ |
| Brain Budget default 900 (in Section 4.3 description) | `doctor.ts:263` | ✓ |

### MINOR-1: Brain Budget example output uses wrong threshold (600 vs 900)

Section 4.2 shows:
```
# ○ Brain Budget  612/600 lines — OVER BUDGET, run cleanup --decay
```

The actual default threshold is 900 (`doctor.ts:263: checkBrainBudget(root, memoryBudget = 900)`). Update the sample output to show 900.

---

## Linked Dead Checks

All internal links between the 5 docs were checked:

| Link | Target | Status |
|------|--------|--------|
| `performance.md` → `config-reference.md` | `docs/reference/config-reference.md` | ✓ exists |
| `performance.md` → `multi-provider.md` | `docs/reference/multi-provider.md` | ✓ exists |
| `security.md` → `docs/adr/README` | `docs/adr/` dir | ✓ exists |
| `security.md` → `../guide/concepts.md` | `docs/guide/concepts.md` | ✓ exists |
| `security.md` → `config-reference.md` | `docs/reference/config-reference.md` | ✓ exists |
| `migration-guide.md` → (self-contained) | — | ✓ |
| `health-check.md` → `docs/guide/docker-backend.md` | — | ⚠ file not found |
| `resource-profile.md` → `config-reference.md` | `docs/reference/config-reference.md` | ✓ exists |
| `resource-profile.md` → `../guide/docker-backend.md` (implied) | — | — |

**Dead link found:** `health-check.md` line 313 references `docs/guide/docker-backend.md` which does not exist in the repository.

---

## Action Items

| ID | Doc | Severity | Action |
|----|-----|----------|--------|
| A14-01 | health-check.md | CRITICAL | Fix check 2: Node.js gate is >=18 in code; add note that ADR-001 requires >=24 |
| A14-02 | health-check.md | CRITICAL | Fix check 8: Brain Dir checks memory.db OR exports/decisions.md (not summary/memory exports) |
| A14-03 | health-check.md | CRITICAL | Fix check 10: Brain Budget counts DB entries (not file lines); fix default to 900 |
| A14-04 | security.md | CRITICAL | Trust boundary: add V1.0 advisory caveat — scope violations are logged, not blocked for CLI/tmux |
| A14-05 | security.md | CRITICAL | Config Security: Brain CAN write limited config fields (sprint-finalizer, ADR-037) |
| A14-06 | migration-guide.md | MODERATE | DECKENT.md verification: remove non-existent doctor check expectations; use manual file check |
| A14-07 | security.md | MODERATE | Module Import Security: update "Brain only" to "Brain-family" per ADR-008 Sprint 281 amendment |
| A14-08 | health-check.md | MINOR | Dead link to `docs/guide/docker-backend.md` |
| A14-09 | performance.md | MINOR | Brain Budget sample output: change 600 to 900 |
| A14-10 | resource-profile.md | MINOR | Add note that import path in Section 9 is source-relative |

---

## RBAC Enforcement Accuracy Summary (ADR-037)

The most important cross-cutting finding for this audit batch is that **security.md overstates V1.0 enforcement strength**. The canonical source per ADR-037 header note (re-verified in Sprint 281):

| Layer | Status | Mechanism |
|-------|--------|-----------|
| Layer 1 — Compile-time lint | ✅ ACTIVE | `npm run lint:adr`, scope in task JSON |
| Layer 2 — Runtime hard-block | ⚠ ADVISORY | `checkWorkerAuthority()` warns + emits but returns `true` (allows) unless `enforceRbac: true` |
| Layer 3 — Audit trail | ✅ ACTIVE | Event stream replay, `git diff --stat` scan by Auditor |

Docs that describe Docker workers as "hard block" are accurate for the Docker path (where `enforceRbac` can be set). Docs that imply CLI/tmux workers are hard-blocked are inaccurate for V1.0. This must be explicit everywhere it matters — especially the trust boundary diagram and the threat model table in `security.md`.
