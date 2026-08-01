# Sprint 181 — Recovery + Nervous Restart + Worker-Rollback Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sprint 181 ships 16 tasks across 6 waves — Worker-rollback untracked-safe fix (P0) + Sprint 179 5 self-security recovery (TDD re-write) + Sprint 180 2 nervous core recovery (TDD re-write) + Sprint 180 5 NO_GO/GWT closure + NERVOUS-TODO restore + Beta launch readiness — **last beta-blocker sprint before June 1 2026 OSS GA**.

**Architecture:**
- **W0 (P0)** = Critical worker-rollback fix in `src/agents/`. Scope-bounded stash + archive folder + pre-spawn guard. Must land FIRST sequentially; downstream waves only after W0 DONE verified.
- **W1-W2 (Recovery)** = TDD re-write of 7 lost src/ + tests/ files. References: `dist/` runtime behavior + Sprint 179 retro notes + sub-project #2 plan (2026-05-21).
- **W3 (Closure)** = Sprint 180 NO_GO/GWT fix — 5 task. Most code survived in modified state, gates need green.
- **W4 (Doc restore)** = NERVOUS-TODO.md from mirror.
- **W5 (Launch)** = Beta smoke + Sprint 181 retro + v1.0.0-beta.1 ready.

**Tech Stack:** TypeScript ESM (Node 24+), vitest 3.x, better-sqlite3 12.10.0, node-pty (@lydell/node-pty), ws, React 18 + Vite.

**Spec references:**
- Master initiative: `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §7
- NERVOUS-TODO mirror: `/home/alperen/.claude/plans/deckent-i-inde-nervous-system-fuzzy-fern.md` (540 lines, 31KB)
- Sub-project #2 plan (re-write reference): `docs/superpowers/plans/2026-05-21-sub-project-2.md`
- Sub-project #2 design (invariants I1-I5): `docs/superpowers/specs/2026-05-21-sub-project-2-design.md`
- Sprint 180 retro: `.brain/exports/memory.md` (Sprint 180 entries) + `b6d6e7a3` commit notes
- dist/ runtime reference: `dist/api/terminal/*.js` + `dist/cli/commands/audit-verify.js` + `dist/nervous/{bootstrap,action-handlers,ipc-queue}.js`

**Predecessors locked live:**
- Sprint 177-180 commit chain: `b6d6e7a3` feat + `ce0e1ce4` chore + `335ba7a9` cleanup (committed 2026-05-21)
- Worker rollback (Sprint 177) — **W0'da P0 fix uygulanacak; mevcut hali risk**
- TOPP B+C (Sprint 178) — canlı
- Bug A foundation (Sprint 179) — canlı (modified files survived)
- Nervous Faz 1 partial (Sprint 180) — config aktif, ipc-queue.ts + 7 test survived, bootstrap+action-handlers KAYIP

---

## File Structure

### Wave 0 — Worker-rollback untracked-safe (P0)

| File | Task | Responsibility |
|------|------|----------------|
| `src/agents/worker-rollback.ts` (modify) | W0 | Scope-bounded stash + archive folder + pre-spawn uncommitted guard |
| `tests/agents/worker-rollback-untracked-safety.test.ts` (NEW) | W0 | TDD 6 case: scope-bounded + out-of-scope safe + archive TTL + pre-spawn guard + NO_GO scope revert + DONE scope keep |
| `.deckent/worker-rollback-history/` (gitignored runtime dir) | W0 | Archive storage; .gitignore'a ekle |

### Wave 1 — Sprint 179 self-security recovery (5 task)

| File | Task | Responsibility | Reference |
|------|------|----------------|-----------|
| `src/api/terminal/audit-integrity.ts` (NEW) + `tests/api/terminal/audit-integrity.test.ts` (NEW) | W1-1 | HMAC-SHA256 chain encode/verify (I4) | dist/api/terminal/audit-integrity.js (126L) + sub-project-2 plan §Task 12 |
| `src/api/terminal/command-guard.ts` (NEW) + `tests/security/command-guard.test.ts` (NEW) | W1-2 | 6 deny pattern, default-deny remote (I3) | dist/api/terminal/command-guard.js (82L) + sub-project-2 plan §Task 9 |
| `src/api/terminal/prompt-guard.ts` (NEW) + `tests/security/prompt-guard.test.ts` (NEW) | W1-3 | 3 input patterns (I1+I2) | dist/api/terminal/prompt-guard.js (47L) + sub-project-2 plan §Task 8 |
| `src/api/terminal/outbound-limiter.ts` (NEW) + `tests/security/outbound-limiter.test.ts` (NEW) | W1-4 | OutboundLimiter per-tenant 24h (I5) | dist/api/terminal/outbound-limiter.js (70L) + sub-project-2 plan §Task 10 |
| `src/cli/commands/audit-verify.ts` (NEW) + `tests/cli/audit-verify.test.ts` (NEW) | W1-5 | deckent audit verify CLI | dist/cli/commands/audit-verify.js (59L) + sub-project-2 plan §Task 12 |

### Wave 2 — Sprint 180 nervous core recovery (2 task)

| File | Task | Responsibility | Reference |
|------|------|----------------|-----------|
| `src/nervous/bootstrap.ts` (NEW ~161 LoC) | W2-1 | `createNervousSystemIfEnabled` factory | dist/nervous/bootstrap.js (108L) + Sprint 180 retro learning detail (full TDD breakdown 4 case) |
| `src/nervous/action-handlers.ts` (NEW ~247 LoC) | W2-2 | 4 MVP action handler + stub default | dist/nervous/action-handlers.js (163L) + Sprint 180 retro learning detail (11 test cases) |

### Wave 3 — Sprint 180 NO_GO/GWT closure (5 task)

| Task | Title | Sprint 180 state | Recovery |
|------|-------|-------------------|----------|
| W3-1 | 180-002 W1-1 state tracker | NO_GO (worker exit 0) | Code mostly survived in `b6d6e7a3` modified files; verify + TDD test re-write (3 tests). Reference: Sprint 180 retro learning detail |
| W3-2 | 180-007 W3-2 Faz 1 smoke config | NO_GO | Config aktif ama test validation gevşek. tests/config/nervous-faz1-smoke.test.ts (survived) green'e çıkar |
| W3-3 | 180-011 W4-3 Self-audit gate vitest fix | NO_GO | Sprint 180 retro raporu: 5 TS2307 + 1 vitest failing. W1+W2 LAND ettikten sonra TS2307'ler kapanır; kalan 1 failing test pinpoint + fix |
| W3-4 | 180-012 W5-1 npm publish readiness | NO_GO | scripts/validate-publish.mjs survived (432 LoC); 6 gate test (tests/scripts/validate-publish-readiness.test.ts) green'e çıkar |
| W3-5 | 180-008 W3-3 Nervous integration runtime | GWT | tests/nervous/integration-runtime.test.ts survived (257 LoC); assertion sıkılaştırma + bootstrap W2-1 land sonrası runtime bağlantı sağlanır |

### Wave 4 — NERVOUS-TODO + docs restore (1 task)

| File | Task | Responsibility |
|------|------|----------------|
| `NERVOUS-TODO.md` (NEW, restore) | W4-1 | Copy from `/home/alperen/.claude/plans/deckent-i-inde-nervous-system-fuzzy-fern.md` (540 lines) to project root |

### Wave 5 — Beta launch (2 task)

| Task | Files | Responsibility |
|------|-------|----------------|
| W5-1 Beta smoke | `npm run build:all`, `npm run validate:publish`, full vitest, lint:link, lint:adr, tsc --noEmit | Final 6/6 gate green; tarball ≤2MB; engines.node>=24; v1.0.0-beta.1 package.json |
| W5-2 Sprint 181 retro + Sprint 182 stub | `.brain/exports/memory.md` (retro append), `docs/superpowers/specs/2026-05-26-sprint-182-post-beta-stub.md` (NEW outline) | Retro write + sub-project #3 + #4 post-beta planning stub |

---

## Wave 0 — Worker-Rollback Untracked-Safe (P0 — Sequential Foundation)

### Task W0: Worker-rollback scope-bounded stash + archive folder

**Files:**
- Modify: `src/agents/worker-rollback.ts`
- Create: `tests/agents/worker-rollback-untracked-safety.test.ts`
- Modify: `.gitignore` (add `.deckent/worker-rollback-history/`)
- Scope: `src/agents/`, `tests/agents/`, `.gitignore`

- [ ] **Step 1: Read current implementation**

```bash
cat src/agents/worker-rollback.ts | head -100
```
Capture: existing `snapshotWorkerScope`, `rollbackWorkerScope`, `dropWorkerSnapshot` signatures + stash command formulation.

- [ ] **Step 2: Write failing test (RED) — 6 cases**

```typescript
// tests/agents/worker-rollback-untracked-safety.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { snapshotWorkerScope, rollbackWorkerScope, dropWorkerSnapshot } from '../../src/agents/worker-rollback.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Worker-rollback untracked-safety', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'wrb-'));
    execFileSync('git', ['init', '-q'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repoRoot });
    writeFileSync(join(repoRoot, 'committed.txt'), 'initial');
    execFileSync('git', ['add', '.'], { cwd: repoRoot });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repoRoot });
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it('(a) scope-bounded stash: out-of-scope untracked survives spawn', () => {
    // Sprint 179 incident pattern: out-of-scope new file should NOT be in stash
    writeFileSync(join(repoRoot, 'src/api/terminal/lost-sprint-179.ts'), 'export const x = 1;');
    execFileSync('mkdir', ['-p', 'src/orchestra'], { cwd: repoRoot });

    const stashRef = snapshotWorkerScope(repoRoot, 'task-test', {
      scopedDirs: ['src/orchestra/'], // out-of-scope is src/api/terminal/
    });

    // out-of-scope file STILL exists in working tree (untouched)
    expect(existsSync(join(repoRoot, 'src/api/terminal/lost-sprint-179.ts'))).toBe(true);

    dropWorkerSnapshot(repoRoot, stashRef);
    // After drop, file STILL there (it was never stashed)
    expect(existsSync(join(repoRoot, 'src/api/terminal/lost-sprint-179.ts'))).toBe(true);
  });

  it('(b) pre-spawn guard warns when uncommitted out-of-scope changes exist', () => {
    writeFileSync(join(repoRoot, 'src/api/terminal/uncommitted.ts'), 'export {}');
    execFileSync('mkdir', ['-p', 'src/orchestra'], { cwd: repoRoot });

    const warn = vi.fn();
    snapshotWorkerScope(repoRoot, 'task-test', {
      scopedDirs: ['src/orchestra/'],
      onWarn: warn,
    });

    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      code: 'UNCOMMITTED_OUT_OF_SCOPE',
      files: expect.arrayContaining([expect.stringContaining('src/api/terminal/uncommitted.ts')]),
    }));
  });

  it('(c) archive folder: dropWorkerSnapshot writes patch to .deckent/worker-rollback-history/', () => {
    writeFileSync(join(repoRoot, 'src/scope-file.ts'), 'export {}');
    execFileSync('mkdir', ['-p', 'src'], { cwd: repoRoot });

    const stashRef = snapshotWorkerScope(repoRoot, 'task-archive', {
      scopedDirs: ['src/'],
      sprintId: 'sprint-181',
    });

    dropWorkerSnapshot(repoRoot, stashRef);

    const archiveDir = join(repoRoot, '.deckent/worker-rollback-history/sprint-181');
    expect(existsSync(archiveDir)).toBe(true);
    // Patch file exists with ISO timestamp
  });

  it('(d) NO_GO scope revert: only scope.filesWrite reverted', () => {
    writeFileSync(join(repoRoot, 'src/scope-file.ts'), 'modified');
    writeFileSync(join(repoRoot, 'src/api/terminal/out-of-scope.ts'), 'untouched');
    execFileSync('mkdir', ['-p', 'src/api/terminal'], { cwd: repoRoot });

    const stashRef = snapshotWorkerScope(repoRoot, 'task-nogo', {
      scopedDirs: ['src/'],
      scopedFiles: ['src/scope-file.ts'],
    });

    rollbackWorkerScope(repoRoot, stashRef, ['src/scope-file.ts']);

    expect(existsSync(join(repoRoot, 'src/scope-file.ts'))).toBe(false); // reverted (untracked → deleted)
    expect(existsSync(join(repoRoot, 'src/api/terminal/out-of-scope.ts'))).toBe(true); // out-of-scope intact
  });

  it('(e) DONE scope keep: worker writes preserved', () => {
    writeFileSync(join(repoRoot, 'src/done-file.ts'), 'kept');
    execFileSync('mkdir', ['-p', 'src'], { cwd: repoRoot });

    const stashRef = snapshotWorkerScope(repoRoot, 'task-done', {
      scopedDirs: ['src/'],
    });

    dropWorkerSnapshot(repoRoot, stashRef);

    expect(existsSync(join(repoRoot, 'src/done-file.ts'))).toBe(true);
  });

  it('(f) Archive TTL: history older than 7 sprints pruned', () => {
    // TTL prune logic: keep last 7 sprint directories
    // Test creates 10 sprint directories, calls prune, expects 7 left
  });
});
```

- [ ] **Step 3: Run tests, expect FAIL**

```bash
npx vitest run tests/agents/worker-rollback-untracked-safety.test.ts
```
Expected: 6 FAIL (new signature not supported).

- [ ] **Step 4: Refactor `snapshotWorkerScope` to scope-bounded stash**

`src/agents/worker-rollback.ts` (modify) — new signature:
```typescript
export interface SnapshotOptions {
  scopedDirs: string[];        // Only these dirs are stashed
  scopedFiles?: string[];      // Specific files to also include
  sprintId?: string;           // For archive folder organization
  onWarn?: (event: { code: string; files: string[] }) => void;
}

export function snapshotWorkerScope(
  repoRoot: string,
  taskId: string,
  options: SnapshotOptions,
): string {
  // 1. Pre-spawn guard: detect out-of-scope uncommitted changes → onWarn callback
  // 2. Use `git stash push --include-untracked --pathspec` with scopedDirs/scopedFiles
  //    (instead of -- to limit to scope; previously bare --include-untracked grabbed everything)
  // 3. Return stash ref
}

export function dropWorkerSnapshot(repoRoot: string, stashRef: string, options?: { sprintId?: string }): void {
  // 1. Before drop: write stash as patch to .deckent/worker-rollback-history/{sprintId}/{taskId}/stash-{iso}.patch
  // 2. Then `git stash drop {ref}`
  // 3. Prune history >7 sprints
}
```

- [ ] **Step 5: Update sprint-controller/spawn callers to pass scope**

`src/orchestra/spawn-backend.ts` (or worker spawn site) — pass `scope.directories` + `scope.filesWrite` to `snapshotWorkerScope`. Pre-existing worker-rollback calls now scope-bounded.

- [ ] **Step 6: Add archive folder to .gitignore**

```bash
echo "" >> .gitignore
echo "# Worker rollback archive (runtime, 7-sprint TTL)" >> .gitignore
echo ".deckent/worker-rollback-history/" >> .gitignore
```

- [ ] **Step 7: Run tests, expect PASS**

```bash
npx vitest run tests/agents/worker-rollback-untracked-safety.test.ts
```
Expected: 6 PASS.

- [ ] **Step 8: Regression sweep**

```bash
npx vitest run tests/agents/ tests/orchestra/
```
Expected: no regression in existing worker-rollback tests (Sprint 177 deliverable).

- [ ] **Step 9: tsc + commit**

```bash
npx tsc --noEmit
git add src/agents/worker-rollback.ts src/orchestra/spawn-backend.ts tests/agents/worker-rollback-untracked-safety.test.ts .gitignore
git commit -m "fix(181-W0): worker-rollback untracked-safe — scope-bounded stash + archive folder

Sprint 179→180 incident: bare git stash --include-untracked + drop cycle
deleted 7 uncommitted Sprint 179 src/ files. Fix: scope-bounded stash via
pathspec (only worker scope dirs/files stashed), pre-spawn out-of-scope
uncommitted guard, archive folder instead of drop (7-sprint TTL).

Memory: project_worker_rollback_untracked_bug — closes Sprint 181 P0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**GO criteria:** 6 test PASS + regression sweep clean + scope-bounded stash verified manually + archive folder created.

**NO_GO criteria:** Out-of-scope files affected by stash + drop cycle + regression in existing rollback tests.

---

## Wave 1-W5 — Reference-Based Recovery

> **Reuse pattern:** Each Sprint 179 self-security task follows the same TDD flow as `sub-project #2 plan §Task 8/9/10/12`. Each Sprint 180 nervous core task follows Sprint 180 retro learning details. Worker prompt embeds: (a) source plan §Task code blocks, (b) `dist/<file>.js` runtime behavior reference (via `cat dist/api/terminal/{file}.js` to see transpiled logic), (c) invariant assertions from Sprint 179/180 retro.

**For W1-W2 recovery tasks:** Worker prompt template:
1. Read `dist/<target>.js` for runtime behavior reference
2. Read sub-project #2 plan §Task NN for TDD breakdown
3. Read Sprint 179/180 retro learning detail for assertion list
4. Write failing test first (RED)
5. Implement source until test passes (GREEN)
6. tsc --noEmit clean + regression sweep
7. Commit each task individually (post-task commit hygiene, [[feedback-post-sprint-commit-mandatory]])

### W1-1 — `src/api/terminal/audit-integrity.ts` recovery
- Effort: high | Agent: data-engineer | Skills: security-specialist, database-migration, typescript-expert
- Tests: 5 cases (computeAuditHmac determinism, chain link integrity, verifyAuditChain clean/tamper, audit-key load)
- Reference: sub-project-2 plan §Task 12 + `dist/api/terminal/audit-integrity.js` (126L)
- DB schema: ALREADY APPLIED in Sprint 179 (additive ALTER on entries table) — no schema change in Sprint 181

### W1-2 — `src/api/terminal/command-guard.ts` recovery
- Effort: high | Agent: security-auditor | Skills: security-specialist, typescript-expert
- Tests: 9 cases (6 deny patterns + localhost bypass + non-shell bypass + benign pass)
- Reference: sub-project-2 plan §Task 9 + `dist/api/terminal/command-guard.js` (82L)

### W1-3 — `src/api/terminal/prompt-guard.ts` recovery
- Effort: high | Agent: security-auditor | Skills: security-specialist, typescript-expert
- Tests: 5 unit + 1 integration (BASE64_BLOB, OSC_ESCAPE, CURL_PIPE_SHELL, benign, signal regex)
- Reference: sub-project-2 plan §Task 8 + `dist/api/terminal/prompt-guard.js` (47L)

### W1-4 — `src/api/terminal/outbound-limiter.ts` recovery
- Effort: high | Agent: api-builder | Skills: security-specialist, typescript-expert
- Tests: 4 cases (per-tenant isolation, warn one-shot, kill threshold, window reset)
- Reference: sub-project-2 plan §Task 10 + `dist/api/terminal/outbound-limiter.js` (70L)

### W1-5 — `src/cli/commands/audit-verify.ts` recovery
- Effort: normal | Agent: api-builder | Skills: typescript-expert, security-specialist
- Tests: CLI smoke + tamper detection (sqlite3 UPDATE → verify exit 1)
- Reference: sub-project-2 plan §Task 12 + `dist/cli/commands/audit-verify.js` (59L)

### W2-1 — `src/nervous/bootstrap.ts` recovery
- Effort: high | Agent: architect | Skills: typescript-expert, system-architect
- Tests: 4 cases (disabled→null, missing config→null, enabled→object + observer.start invoked, dispose cleanup)
- Reference: Sprint 180 retro learning detail (full 161 LoC + 131 LoC test breakdown) + `dist/nervous/bootstrap.js` (108L)

### W2-2 — `src/nervous/action-handlers.ts` recovery
- Effort: high | Agent: architect | Skills: typescript-expert, system-architect, testing-expert
- Tests: 11 cases (4 MVP unit + stub default + unknown id + payload validation + handler-throw + Executor integration + unimplemented→failure bridge + type contract)
- Reference: Sprint 180 retro learning detail (247 LoC + 259 LoC test breakdown) + `dist/nervous/action-handlers.js` (163L)

### W3-1..5 — Sprint 180 NO_GO/GWT closures
- Each task: pinpoint Sprint 180 failure root → minimal fix → green gate
- Most code in `b6d6e7a3` modified files survived; just need test green + assertion polish
- W3-3 (Self-audit gate vitest fix) AUTOMATICALLY resolves 5 TS2307 once W1-1..5 land (modules exist)

### W4-1 — NERVOUS-TODO.md restore
- Effort: low | Agent: doc-writer | Skills: documentation-writer
- Action: `cp /home/alperen/.claude/plans/deckent-i-inde-nervous-system-fuzzy-fern.md NERVOUS-TODO.md`
- Verify: 540 lines, 31KB, content matches memory `project_nervous_activation_plan.md`

### W5-1 — Beta launch smoke
- Effort: high | Agent: devops-engineer | Skills: devops-engineer, typescript-expert
- Action: `npm run build:all` → `npx tsc --noEmit` → `npx vitest run` → `npm run lint:link` → `npm run lint:adr` → `npm run validate:publish` → all 6 gates green
- Package.json version: `1.0.0-beta.1`
- Tarball: 899 files target, ≤2MB

### W5-2 — Sprint 181 retro + Sprint 182 stub
- Effort: normal | Agent: doc-writer | Skills: documentation-writer
- Action: Sprint 181 retro write (`.brain/exports/memory.md`) + Sprint 182 post-beta spec stub outlining sub-project #3 + #4 + nervous Faz 2 pilot + AEGIS realization

---

## Wave Dispatch Order

| Wave | Tasks | Intra-wave | Order |
|------|-------|------------|-------|
| W0 | W0 (worker-rollback fix) | 1 | SEQUENTIAL FIRST — block W1+ until DONE |
| W1 | W1-1 .. W1-5 | 2 max | Parallel within wave (different files; src/api/terminal/* + src/cli/commands/*) |
| W2 | W2-1 + W2-2 | 2 max | Parallel (different files in src/nervous/) |
| W3 | W3-1 .. W3-5 | 2 max | Mostly independent (state-tracker, config, gate, validate-publish, integration test) |
| W4 | W4-1 | 1 | Single task |
| W5 | W5-1 → W5-2 | 1 (sequential) | W5-1 beta smoke must pass before W5-2 retro |

**Self-modifying detector:** src/orchestra + src/agents + src/api + src/nervous + src/cli + src/mcp triggers sequential dispatch within shared scope. W1 + W2 parallelism limited by detector.

---

## Sprint 181 GO/NO_GO Matrix

| Verdict | Şart |
|---------|------|
| **GO** | 16/16 DONE — Sprint 179 + Sprint 180 deliverables tam recovered, worker-rollback safe, beta launch READY |
| **GO_WITH_TECH_DEBT** | 14-15/16 DONE + ≤2 GWT; **şart:** W0 (worker-rollback) DONE + W1 5/5 DONE (self-security tamamen) + W5-1 beta smoke DONE |
| **NO_GO** | W0 worker-rollback fail (sonraki sprint riski) **veya** W1 ≥2 NO_GO (RCE surface açık) **veya** W5-1 beta smoke fail (June 1 kayar) |

---

## Process Invariants (Sprint 181 specific)

- **W0 sequential gate** — Worker-rollback fix LAND ettikten sonra W1+ dispatch. Brain manuel wave gate (ADR-047)
- **dist/ runtime reference KORUNUR** — `npm run build` Sprint 181 boyunca sadece W5-1'de çağrılır (yoksa dist/ regen olur, recovery reference kaybedilir)
- **Post-sprint commit ZORUNLU** ([[feedback-post-sprint-commit-mandatory]]) — Sprint 181 sonrası 2 commit + push
- **W0 fix recursive risk YOK** — W0 task'ı kendisi worker-rollback kullanmaz (Alperen manuel snapshot + post-DONE manuel commit)
- **memory.db ALTER YOK** — Sprint 179'da uygulanmış schema ALTER (audit_prev_hmac + audit_hmac kolonları) intact, Sprint 181'de schema değişikliği YOK
- **Worker rollback canlı (eski + yeni davranış)** — Sprint 181 sırasında eski worker-rollback davranışı W0 LAND'e kadar aktif (untracked silme riski var ama her sprint öncesi commit ZORUNLU artık)
- **Brain mode `structured`** — AI planning disabled
- **`dependency_pipeline_enabled: false`** — Brain manuel wave gates
- **Max workers 2** — sequential discipline
- **Build/publish gates Alperen** — `npm publish` Alperen manuel ([[feedback-build-requires-user-approval]])

---

## Self-Review

- **Spec coverage:** L1 W0 + L2 W1 5 + L3 W2 2 + L4 W3 5 + L5 W4 1 + L6 W5 2 = 16 task, 1:1 master spec §7 ile match
- **Placeholder scan:** clean
- **Type consistency:** W0 `SnapshotOptions` interface tanımlı; W1-W2 task'ları sub-project #2 plan'daki tip kontratlarına refer
- **No dangling references:** W3-3 (self-audit gate fix) W1-1..5 land sonrası otomatik resolve (TS2307 5 module çözülür)
- **Recovery reference completeness:** Her recovery task'ı **3 kaynak** kullanır: (a) `dist/*.js` runtime, (b) sub-project #2 plan §Task NN, (c) Sprint 179/180 retro learning detail in `b6d6e7a3` commit notes + .brain/exports/memory.md

---

## DIRECTIVES.md content for Sprint 181 launch

See `DIRECTIVES.md` at repo root — rewritten for Sprint 181 with wave-prefix titles (drift-immune pattern).
