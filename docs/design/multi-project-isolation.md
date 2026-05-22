# Multi-Project Isolation Design Document

**ADR Reference:** ADR-034
**Status:** Approved
**Date:** 2026-04-11
**Author:** architect agent (Sprint 134, Task 12)

---

## 1. Overview

Deckent supports multiple projects on a single user machine. Each project maintains its own `.deckent/`, `.brain/`, `.tasks/`, and `.locks/` directories. This document formalizes the isolation boundaries, enumerates threat vectors, specifies mitigation patterns, and defines a comprehensive test strategy.

**Critical distinction: multi-project != SaaS multi-tenant.** This design addresses a single user running multiple Deckent projects side by side on the same machine. It explicitly does NOT address shared-server scenarios with thousands of tenants — that model is permanently banned by ADR-033.

---

## 2. Architecture Overview

### 2.1 Per-Project Directory Layout

Each Deckent project root contains:

```
project-root/
  .deckent/          # Project config, agent pool, skill pool, metrics
    config.json      # Project-specific configuration overrides
    agents/          # Temp and custom agents for this project
    skills/          # Temp and custom skills for this project
    metrics.jsonl    # Local observability data (append-only)
  .brain/            # Decision records, memory, retrospectives (Memory V2 DB-first)
    memory.db        # SQLite database — single source of truth (Memory V2, Sprint 167+)
    exports/         # Auto-generated markdown views from memory.db
      decisions.md   # ADR list (generated)
      memory.md      # Sprint learnings (generated)
      debt.md        # Tech debt table (generated, root DEBT.md removed Sprint 186)
      summary.md     # Context summary (generated)
    sprints/         # Per-sprint log files
  .tasks/            # Sprint task files (ephemeral per sprint)
    task-*.json      # Task definitions
    task-*.result    # Task results
    task-*.hb        # Heartbeat files
    task-*.plan      # Worker execution plans
    task-*.log       # Worker logs
  .locks/            # File locks (ephemeral per sprint)
```

> **Note (2026-05-22 audit):** Memory V2 DB-first migration (Sprint 167+) changed the `.brain/` layout. The primary storage is `memory.db`; `.md` files in `exports/` are generated views. The root `DEBT.md` file was removed in Sprint 186 (Task #4). `credentials.enc` per-project encryption was planned but not implemented — see Section 4.2.

### 2.2 Isolation Guarantees

| Property | Guarantee | Mechanism |
|----------|-----------|-----------|
| File isolation | Project A cannot read Project B's `.deckent/` files | Scope enforcement in `isWithinScope()` |
| Credential isolation | Project A cannot decrypt Project B's credentials | AES-256-GCM with per-project key derivation |
| Config isolation | Project config overrides are per-project | 3-layer config merge (ADR-004) |
| Lock isolation | Project A's locks do not affect Project B | Lock files scoped to `.locks/` within project root |
| Memory isolation | Project A's `.brain/` is independent of Project B | Per-project directory, no cross-reference |
| Sprint isolation | Sprint state is per-project | `.tasks/` scoped to project root |

### 2.3 Global vs Project-Specific Configuration

The 3-layer config merge (ADR-004) defines: hardcoded defaults -> `~/.deckent/config.json` (global) -> `.deckent/config.json` (project).

**Global config fields** (shared across all projects):
- `brain_provider` / `worker_provider` / `fallback_provider` — Provider preferences
- `max_workers` — Default worker concurrency limit
- `brain_planning` — Default planning mode (ai/structured/auto)
- `min_tier` / `mode_preset` — Default model tier and mode

**Project-specific fields** (never leak to global):
- `verify_loop` — Whether to run tsc+vitest verification
- `auto_archive_directives` — Whether to archive DIRECTIVES after sprint
- `dependency_pipeline_enabled` — Feature flag for task dependencies
- Agent/skill pool — Stored in `.deckent/agents/` and `.deckent/skills/`
- Sprint history — Stored in `.brain/sprints/`

**Environment-only fields** (never stored in config files):
- `OPENAI_API_KEY` — Codex provider authentication
- `GOOGLE_API_KEY` — Gemini provider authentication
- Session tokens — Claude Code session-based auth

---

## 3. Threat Model

### 3.1 Threat T1: Sibling Project Scope Bypass via Symlink

**Attacker model:** A malicious or misconfigured task in Project A creates a symlink pointing to Project B's source code. The worker's `isWithinScope()` check sees the symlink path (within scope) but the actual file resides in Project B (outside scope).

**Attack vector:**
```bash
# Project A root: /home/user/project-a
# Project B root: /home/user/project-b
cd /home/user/project-a/src/
ln -s /home/user/project-b/src/secret.ts ./borrowed.ts

# Worker in Project A writes to "src/borrowed.ts"
# isWithinScope("src/borrowed.ts", { directories: ["src/"] }) => true
# But the actual file is /home/user/project-b/src/secret.ts
```

**Impact:** HIGH — Unauthorized read/write access to sibling project source code.

**Mitigation:** Symlink-aware scope enforcement (Section 4.1).

### 3.2 Threat T2: Credential Leakage via Global Config

**Attacker model:** A project stores API keys in `.deckent/config.json` instead of environment variables. The global config merge inadvertently propagates these keys to sibling projects.

**Attack vector:**
```json
// Project A's .deckent/config.json (WRONG — keys should be env vars)
{
  "openai_api_key": "sk-abc123..."
}
```

If the config merge doesn't filter sensitive fields, Project B could inherit this key via global config fallback.

**Impact:** MEDIUM — Credential exposure across projects.

**Mitigation:**
- API keys are NEVER stored in config files — only environment variables
- Config merge explicitly excludes fields matching `/key|secret|token|password/i`
- Per-project credential encryption (AES-256-GCM) for project-specific secrets

### 3.3 Threat T3: Global State Pollution

**Attacker model:** Project A modifies global config (`~/.deckent/config.json`) as a side effect of a sprint operation. Project B, started subsequently, inherits the polluted global state.

**Attack vector:**
```typescript
// Bug in sprint-controller: accidentally writes to global config
writeFileSync(join(homedir(), '.deckent/config.json'), projectConfig);
```

**Impact:** LOW-MEDIUM — Unexpected behavior in sibling projects.

**Mitigation:**
- Config write operations always target project-local `.deckent/config.json`
- Global config is read-only from Deckent's perspective (user edits manually)
- Config write function validates target path against project root

### 3.4 Threat T4: Symlink Cycle Denial of Service

**Attacker model:** A circular symlink chain causes `realpathSync()` to enter an infinite resolution loop or consume excessive resources.

**Attack vector:**
```bash
cd /home/user/project-a/src/
ln -s ./b.ts ./a.ts
ln -s ./a.ts ./b.ts
```

**Impact:** LOW — Worker process hangs or crashes.

**Mitigation:**
- `fs.realpathSync()` natively detects symlink cycles and throws `ELOOP`
- `isWithinScope()` catches `ELOOP` and converts to `ScopeViolationError`
- Worker timeout (120s) acts as a secondary defense

### 3.5 Threat T5: Hardlink Bypass

**Attacker model:** Instead of symlink, a hardlink is created to a file in Project B. `realpathSync()` does not resolve hardlinks (they share the same inode).

**Attack vector:**
```bash
ln /home/user/project-b/src/secret.ts /home/user/project-a/src/secret.ts
```

**Impact:** LOW — Hardlinks require write access to target directory, and Node.js `fs` treats hardlinks as regular files.

**Mitigation:**
- Hardlink creation across project boundaries requires filesystem-level access that scope enforcement already prevents during worker execution
- Workers cannot create hardlinks to files they don't own (scope check prevents writing to Project B)
- Accepted risk: pre-existing hardlinks are not detected. This is documented as a known limitation.
- Future: optional `fs.statSync().ino` inode comparison for defense-in-depth (not in Sprint 134 scope)

### 3.6 Threat T6: Path Traversal via Relative Paths

**Attacker model:** Worker constructs a path with `../` segments to escape scope.

**Attack vector:**
```typescript
isWithinScope("src/../../../project-b/secret.ts", scope);
```

**Impact:** MEDIUM — Scope escape via path normalization gaps.

**Mitigation:**
- `isWithinScope()` already calls `normalize()` which collapses `..` segments
- With symlink-aware enhancement, `realpathSync()` additionally resolves to absolute path
- Normalized path is checked against scope directories

---

## 4. Mitigation Patterns

### 4.1 Symlink-Aware Scope Enforcement

The core mitigation is enhancing `isWithinScope()` in `src/agents/worker.ts`:

```typescript
export function isWithinScope(
  filePath: string,
  scope: TaskScope,
  projectRoot?: string,
): boolean {
  const normalizedFile = normalize(filePath).split(sep).join('/');

  // Resolve symlinks to get the real path
  let resolvedFile = normalizedFile;
  if (projectRoot) {
    const absolutePath = join(projectRoot, normalizedFile);
    try {
      const realPath = realpathSync(absolutePath);
      const projectRealPath = realpathSync(projectRoot);
      // Convert back to relative path from project root
      if (realPath.startsWith(projectRealPath + '/')) {
        resolvedFile = realPath.slice(projectRealPath.length + 1)
          .split(sep).join('/');
      } else {
        // Real path is outside project root — scope violation
        return false;
      }
    } catch (err: unknown) {
      // ELOOP = circular symlink — deny access
      // ENOENT = target doesn't exist — check with normalized path
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ELOOP') return false;
        // ENOENT: file doesn't exist yet (new file creation) — fall through to normal check
      }
    }
  }

  // Check against scope directories
  for (const dir of scope.directories) {
    const normalizedDir = normalize(dir).split(sep).join('/');
    const dirWithSlash = normalizedDir.endsWith('/')
      ? normalizedDir
      : `${normalizedDir}/`;
    if (resolvedFile.startsWith(dirWithSlash) || resolvedFile === normalizedDir) {
      return true;
    }
  }

  // Check against explicit filesWrite
  for (const f of scope.filesWrite) {
    const normalizedWrite = normalize(f).split(sep).join('/');
    if (resolvedFile === normalizedWrite) {
      return true;
    }
  }

  return false;
}
```

**Key behaviors:**
- When `projectRoot` is provided, symlinks are resolved via `realpathSync()`
- If resolved path is outside project root, access is denied immediately
- `ELOOP` (circular symlink) results in denial
- `ENOENT` (file doesn't exist yet — e.g., new file creation) falls through to normal path check
- When `projectRoot` is not provided, behavior is unchanged (backward compatible)

### 4.2 Credential Isolation Pattern

> **⚠️ NOT YET IMPLEMENTED (2026-05-22 audit):** The per-project HKDF key derivation described below was planned in Sprint 134 but not built. Actual implementation (`src/core/credentials.ts`) uses a **single global master key** stored in `~/.deckent/.keyring`, shared across all projects. Credentials are stored at `~/.deckent/credentials/<provider>.json` (global, not per-project). The `credentials.enc` per-project file is never created. The cross-project credential decryption protection described here does **not** currently apply.

Per-project credential encryption (planned):

```
Encryption key = HKDF(machine_key, project_root_path_hash)  ← NOT IMPLEMENTED
Cipher = AES-256-GCM                                         ← implemented (global key)
Storage = .deckent/credentials.enc                           ← NOT IMPLEMENTED
```

The intent: each project derives a unique encryption key from a machine-level secret and the project root path hash. Until this is implemented, the single global master key is used and credentials are not per-project isolated at the cryptographic level.

### 4.3 Config Boundary Enforcement

> **⚠️ NOT YET IMPLEMENTED (2026-05-22 audit):** The `writeProjectConfig()` function shown below does not exist in `src/core/config.ts`. Config writes use `writeFileSync()` directly without symlink-aware path validation. Practical risk is low: sprint operations do not write to global config in practice (verified by code tracing). This is a planned defense-in-depth layer, not an active mitigation.

Config write operations (planned, not yet implemented):

```typescript
function writeProjectConfig(projectRoot: string, config: ProjectConfig): void {
  const targetPath = join(projectRoot, '.deckent', 'config.json');
  // Validate: target must be within project root
  const resolvedTarget = realpathSync(dirname(targetPath));
  const resolvedRoot = realpathSync(projectRoot);
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error('Config write target outside project root');
  }
  writeFileSync(targetPath, JSON.stringify(config, null, 2));
}
```

---

## 5. Test Strategy

### 5.1 Unit Tests — Symlink Scope Enforcement

Located in `tests/agents/worker.test.ts`:

| Test | Description | Expected Result |
|------|-------------|-----------------|
| symlink-in-scope | Symlink target within scope directory | `isWithinScope()` returns true |
| symlink-out-of-scope | Symlink target outside scope directory | `isWithinScope()` returns false |
| recursive-symlink | Circular symlink (ELOOP) | `isWithinScope()` returns false |
| no-projectRoot | `projectRoot` not provided | Backward compatible behavior |
| new-file-creation | `ENOENT` (file doesn't exist) | Falls through to normal check |
| path-traversal | `../` segments in path | Normalized and checked correctly |

### 5.2 Integration Tests — Multi-Project Isolation

> **⚠️ NOT YET IMPLEMENTED (2026-05-22 audit):** None of the integration tests below exist in `tests/integration/`. `mcp-sprint-isolation.test.ts` tests MCP tool isolation, not multi-project filesystem isolation. These tests were planned for Sprints 135-140 but were not built.

These tests require filesystem setup with actual symlinks (planned):

| Test | Description | Status |
|------|-------------|--------|
| cross-project-symlink | Create symlink from Project A to Project B file, verify scope rejection | ❌ Not implemented |
| concurrent-sprints | Run sprints in two projects simultaneously, verify no state leakage | ❌ Not implemented |
| credential-isolation | Verify credential from Project A cannot be decrypted in Project B context | ❌ Not implemented |
| config-isolation | Modify Project A config, verify Project B is unaffected | ❌ Not implemented |
| lock-isolation | Acquire lock in Project A, verify no conflict in Project B | ❌ Not implemented |

### 5.3 Security Regression Tests

| Test | Sprint Origin | Regression Target |
|------|--------------|-------------------|
| Sprint 132 MEDIUM #10 | symlink scope bypass | `isWithinScope()` with symlink |
| Sprint 132 LOW #4 | sibling project access | Cross-project path rejection |
| Sprint 133 credential | per-project encryption | Key derivation per project root |

---

## 6. Performance Impact Analysis

### 6.1 `realpathSync()` Overhead

Each `isWithinScope()` call with `projectRoot` adds one `realpathSync()` system call. Benchmark estimates:

| Operation | Time (p50) | Time (p99) |
|-----------|-----------|-----------|
| `normalize()` only | 0.001ms | 0.005ms |
| `normalize()` + `realpathSync()` | 0.05ms | 0.3ms |
| `normalize()` + `realpathSync()` (symlink chain depth 5) | 0.1ms | 0.5ms |

**Impact assessment:** Negligible. `isWithinScope()` is called per file write operation (not per line or per character). A typical task writes 5-20 files, adding < 10ms total overhead.

### 6.2 Mitigation for Hot Paths

If performance becomes a concern in future sprints:
- Cache `realpathSync(projectRoot)` at worker startup (project root doesn't change during execution)
- Cache resolved paths per worker session (LRU, max 100 entries)
- Skip symlink resolution for paths that don't contain symlink characters (heuristic — no `->` in `ls -la`)

---

## 7. Known Limitations

1. **Hardlinks** — `realpathSync()` does not detect hardlinks. A pre-existing hardlink to an out-of-scope file will pass scope check. Mitigation: workers cannot create cross-project hardlinks during execution (scope check prevents write). Pre-existing hardlinks are a system administrator concern.

2. **Race conditions** — Between `realpathSync()` and the actual file operation, a symlink could be created (TOCTOU). Mitigation: worker processes are trusted within their scope; the attack would require concurrent filesystem modification by an adversary. Accepted risk for single-user model.

3. **OS-specific behavior** — `ELOOP` detection varies:
   - Linux: max 40 symlink resolutions
   - macOS: max 32 symlink resolutions
   - Windows: symlinks require special privileges
   
   Accepted: Deckent targets macOS, Linux, WSL2. Windows symlink behavior is documented but not tested.

4. **Mount points** — If a scope directory is a mount point to an external filesystem, `realpathSync()` will resolve within that mount. This is expected behavior — mount configuration is the user's responsibility.

---

## 8. Implementation Plan

> **Historical note (2026-05-22 audit):** This section reflects Sprint 134 planning. We are currently at Sprint 186. Sprint 134 deliverables were completed; the future sprint roadmap (135-150) was not executed.

### Sprint 134 (Completed — 2026-04-11)

1. ✅ **Symlink-aware `isWithinScope()`** — Implemented in `src/agents/worker.ts:492`
2. ✅ **Unit tests** — Implemented in `tests/agents/worker.test.ts:559`
3. ✅ **ADR-034** — Formal decision record in memory.db
4. ✅ **This design doc** — `docs/design/multi-project-isolation.md`

### Future Sprints (Roadmap — NOT YET DONE as of Sprint 186)

| Sprint Target | Enhancement | Status |
|--------------|------------|--------|
| 135-140 | Integration tests with actual multi-project filesystem setup | ❌ Not done |
| 135-140 | Config write validation (prevent global config writes from sprint operations) | ❌ Not done |
| 140-145 | Optional inode comparison for hardlink detection | ❌ Not done |
| 140-145 | `isWithinScope()` path cache for performance optimization | ❌ Not done |
| 145-150 | Security regression test suite automation | ❌ Not done |

---

## 9. Appendix: Related ADRs

| ADR | Relationship |
|-----|-------------|
| ADR-004 | 3-Layer Config Merge — defines the config hierarchy this design formalizes |
| ADR-006 | spawnSync Security Pattern — command injection prevention, complementary to scope enforcement |
| ADR-008 | Brain Merkezi Import — module boundary rules, prevents circular cross-project references |
| ADR-033 | Product Vision — permanently bans SaaS multi-tenant, establishing the "single user, local machine" context for this design |

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| Multi-project | Single user, multiple Deckent projects on the same machine |
| Multi-tenant | Multiple users/organizations sharing a hosted service (BANNED by ADR-033) |
| Scope | Set of directories and files a worker is allowed to modify |
| Symlink | Symbolic link — filesystem entry pointing to another path |
| Hardlink | Filesystem entry sharing the same inode as another file |
| ELOOP | OS error code for circular symlink detection |
| TOCTOU | Time-of-check to time-of-use — race condition class |
| Per-project key | Cryptographic key derived from machine secret + project root path hash |

---

*Document generated by architect agent, Sprint 134 Task 12. Last updated: 2026-05-22 (audit — stale sections annotated, Memory V2 layout updated, unimplemented mitigations flagged).*
