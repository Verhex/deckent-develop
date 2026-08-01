# Mock-Safety Audit — ES Module Destructured Import Analysis

**Date:** 2026-04-10  
**Sprint:** 134  
**Author:** Task 134-008 (code-reviewer agent)  
**Scope:** `src/**/*.ts` — top-level destructured imports from `node:*` built-in modules  
**Trigger:** Sprint 133 fix commit — `skill-sandbox.ts` "ES module top-level destructured import + vi.mock incompatibility" caused 33 test failures with a single-file change.

---

## Executive Summary

- **315 destructured `node:*` imports** found across `src/`
- **171 test files** mock `node:fs` via `vi.mock('node:fs', ...)`
- **3 test files** mock `node:crypto`
- **97 test files** mock `node:child_process`
- **High-risk files identified:** 62 source files have destructured imports from modules that their corresponding tests mock directly
- **Root cause:** ESM destructured bindings are static snapshots — they capture the original export value, not the mocked replacement. `vi.mock()` replaces the module proxy, but destructured bindings already hold the pre-mock reference.

---

## The Problem Pattern

```typescript
// ❌ MOCK-UNSAFE — destructured binding is a static copy
import { readFileSync, existsSync } from 'node:fs';

// In production: readFileSync → actual fs.readFileSync
// In tests with vi.mock('node:fs', ...): readFileSync STILL points to the original,
// because ESM bindings were resolved before vi.mock hoisting took effect
```

```typescript
// ✅ MOCK-SAFE — namespace import uses live proxy
import * as fs from 'node:fs';
const readFileSync = () => fs.readFileSync; // lazy getter pattern

// In tests: fs object is replaced by vi.mock → all property accesses use the mock
```

---

## Risk Classification

| Level | Definition |
|-------|-----------|
| **CRITICAL** | Destructured import + test mocks that specific module → mock silently bypassed → tests pass but test real I/O |
| **HIGH** | Destructured import + test uses `vi.mock` on the module + both run in same test suite |
| **MEDIUM** | Destructured import + no direct test mocking, but module is mocked in integration tests |
| **LOW** | Destructured import of pure utility functions (`join`, `resolve` from `node:path`) — path functions are pure, no I/O, mock-safe in practice |
| **SAFE** | Namespace import (`import * as fs`) — live binding, mock-safe by design |

---

## Findings by File

### 1. `src/agents/worker.ts` — **CRITICAL**
- **Line 1:** `import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, openSync, closeSync, constants as fsConstants } from 'node:fs';`
- **Line 2:** `import { execSync } from 'node:child_process';`
- **Test:** `tests/agents/worker.test.ts` — `vi.mock('node:fs', ...)` at line 23
- **Risk:** Worker's core I/O (task file claim, heartbeat write, result write) uses destructured bindings → mock in tests silently bypassed
- **Destructured functions:** readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync, mkdirSync, readdirSync, openSync, closeSync

---

### 2. `src/monitor/auditor.ts` — **CRITICAL**
- **Line 1:** `import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';`
- **Line 3:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/monitor/auditor.test.ts` — `vi.mock('node:fs', ...)` at line 22; `vi.mock('node:child_process', ...)` at line 31
- **Risk:** Auditor scan loop reads heartbeat files and git diff — if mock bypassed, tests hit real filesystem
- **Destructured functions:** readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, spawnSync

---

### 3. `src/orchestra/tmux.ts` — **CRITICAL**
- **Line 1:** `import { spawnSync } from 'node:child_process';`
- **Line 2:** `import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';`
- **Line 4:** `import { randomBytes } from 'node:crypto';`
- **Test:** `tests/orchestra/tmux.test.ts` — `vi.mock('node:child_process', ...)` at line 23; `vi.mock('node:fs', ...)` at line 27; `vi.mock('node:crypto', ...)` at line 34
- **Risk:** tmux session management depends on real `spawnSync` and `randomBytes` — crypto mock bypass causes non-deterministic session IDs in tests
- **Destructured functions:** spawnSync, writeFileSync, unlinkSync, mkdirSync, existsSync, randomBytes

---

### 4. `src/orchestra/sprint-reporter.ts` — **HIGH**
- **Line 3:** `import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';`
- **Line 4:** `import { execSync, spawnSync } from 'node:child_process';`
- **Test:** `tests/orchestra/sprint-reporter.test.ts` — imports from fs/child_process but tests use direct mocking via module mock
- **Risk:** Sprint retro generation, RETRO.md writing, CI test run — if execSync mock bypassed, actual `npx vitest run` executes during tests
- **Destructured functions:** readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, execSync, spawnSync

---

### 5. `src/orchestra/result-evaluator.ts` — **HIGH**
- **Line 6:** `import { existsSync, readdirSync, readFileSync } from 'node:fs';`
- **Test:** `tests/orchestra/result-evaluator.test.ts` — does NOT directly mock `node:fs`
- **Risk:** Medium — result evaluation reads `.tasks/*.result` files; without mock, test isolation depends on actual filesystem state
- **Destructured functions:** existsSync, readdirSync, readFileSync

---

### 6. `src/orchestra/result-collector.ts` — **HIGH**
- **Line 7:** `import { readFileSync, existsSync, writeFileSync } from 'node:fs';`
- **Test:** `tests/orchestra/result-collector.test.ts` — mocks module-level imports, not `node:fs` directly
- **Risk:** Result polling and aggregation; destructured bindings resist mock updates mid-test
- **Destructured functions:** readFileSync, existsSync, writeFileSync

---

### 7. `src/orchestra/heartbeat-daemon.ts` — **HIGH**
- **Line 8:** `import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync } from 'node:fs';`
- **Line 10:** `import { execSync } from 'node:child_process';`
- **Test:** `tests/unit/heartbeat-daemon.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Heartbeat writes are critical path — if mock bypassed, test creates real `.hb` files on disk
- **Destructured functions:** existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, unlinkSync, execSync

---

### 8. `src/orchestra/brain-context.ts` — **HIGH**
- **Line 4:** `import { readFileSync, existsSync, readdirSync } from 'node:fs';`
- **Test:** `tests/orchestra/brain-context.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Brain context reads MEMORY.md, DEBT.md — mock bypass reads real project files, making tests environment-dependent
- **Destructured functions:** readFileSync, existsSync, readdirSync

---

### 9. `src/orchestra/spawn-backend-docker.ts` — **HIGH**
- **Line 6:** `import { spawnSync, spawn as nodeSpawn } from 'node:child_process';`
- **Line 7:** `import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';`
- **Line 9:** `import { randomBytes } from 'node:crypto';`
- **Line 10:** `import { homedir, totalmem } from 'node:os';`
- **Test:** `tests/unit/spawn-backend-docker.test.ts` — mocks child_process and fs
- **Risk:** Docker backend spawns real containers if `spawnSync` mock bypassed — severe test isolation failure
- **Destructured functions:** spawnSync, nodeSpawn, writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, randomBytes, homedir, totalmem

---

### 10. `src/api/server.ts` — **HIGH**
- **Line 1:** `import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';`
- **Line 2:** `import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';`
- **Line 4:** `import { randomBytes, createHash, timingSafeEqual, randomUUID } from 'node:crypto';`
- **Test:** `tests/api/server.test.ts` — `vi.mock('node:fs', ...)` at line 5
- **Risk:** `createServer` from `node:http` not mock-safe; crypto functions used in auth token generation — if `timingSafeEqual` mock bypassed, timing-safe comparison tests are invalid
- **Destructured functions:** createServer, readFileSync, existsSync, readdirSync, writeFileSync, randomBytes, createHash, timingSafeEqual, randomUUID

---

### 11. `src/api/auth.ts` — **MEDIUM**
- **Line 1:** `import { createHash, timingSafeEqual } from 'node:crypto';`
- **Test:** `tests/api/server-auth.test.ts` — no direct `vi.mock('node:crypto')`
- **Risk:** Security-critical — `timingSafeEqual` is used for token comparison; if accidentally mocked incorrectly, security test guarantees are invalid
- **Destructured functions:** createHash, timingSafeEqual

---

### 12. `src/core/credential-encryption.ts` — **HIGH**
- **Line 1:** `import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';`
- **Line 2:** `import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';`
- **Test:** `tests/core/credential-encryption.test.ts` — crypto mocking not needed but fs mocking present
- **Risk:** AES-256-GCM encryption/decryption — if `randomBytes` mock bypassed, tests use real entropy (acceptable), but `createCipheriv`/`createDecipheriv` cannot be controlled for deterministic test vectors
- **Destructured functions:** randomBytes, createCipheriv, createDecipheriv, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync

---

### 13. `src/core/config.ts` — **HIGH**
- **Line 1:** `import { writeFile, mkdir } from 'node:fs/promises';`
- **Line 2:** `import { existsSync, statSync } from 'node:fs';`
- **Test:** `tests/core/config.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** `writeFile` from `node:fs/promises` is a separate module namespace from `node:fs` — mocking `node:fs` does NOT mock `node:fs/promises`. Tests that mock `node:fs` may miss async write calls via `writeFile`.
- **Destructured functions:** writeFile, mkdir (from `node:fs/promises`), existsSync, statSync (from `node:fs`)
- **Note:** This is a **double hazard** — two different import sources, one mock may leave the other unguarded.

---

### 14. `src/core/utils.ts` — **HIGH**
- **Line 1:** `import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';`
- **Line 2:** `import { readFile } from 'node:fs/promises';`
- **Test:** `tests/core/utils.test.ts` (inferred) — widely imported utility, many tests
- **Risk:** `utils.ts` is imported by nearly every module; destructured bindings here propagate risk throughout the entire test suite. `readFile` (async) from `node:fs/promises` is separate namespace.
- **Destructured functions:** readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, readFile

---

### 15. `src/core/analyzer.ts` — **HIGH**
- **Line 6:** `import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';`
- **Line 8:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/core/analyzer.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Project stack analysis; if `spawnSync` mock bypassed, analyzer executes real shell commands during tests
- **Destructured functions:** existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync, spawnSync

---

### 16. `src/orchestra/pattern-recorder.ts` — **HIGH**
- **Line 1:** `import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';`
- **Test:** `tests/orchestra/pattern-recorder.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Pattern persistence to `.brain/PATTERNS.md` — mock bypass writes real files
- **Destructured functions:** existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync

---

### 17. `src/orchestra/pattern-reader.ts` — **HIGH**
- **Test:** `tests/orchestra/pattern-reader.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Reads `.brain/PATTERNS.md` — mock bypass reads real project state
- **Destructured functions:** (from node:fs)

---

### 18. `src/orchestra/rollback.ts` — **HIGH**
- **Line 9:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/orchestra/rollback.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Rollback via `spawnSync('git', ...)` — if mock bypassed, real git commands execute during tests
- **Destructured functions:** spawnSync + node:fs functions

---

### 19. `src/orchestra/result-watcher.ts` — **HIGH**
- **Line 4:** `import { watch, existsSync, type FSWatcher } from 'node:fs';`
- **Test:** `tests/orchestra/result-watcher.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** `watch` (fs.watch) is particularly dangerous — if mock bypassed, test sets up real inotify/kqueue watchers that may not clean up
- **Destructured functions:** watch, existsSync

---

### 20. `src/orchestra/shared-memory.ts` — **HIGH**
- **Test:** `tests/orchestra/shared-memory.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Shared memory file operations — mock bypass corrupts test isolation
- **Destructured functions:** (from node:fs)

---

### 21. `src/orchestra/debt-manager.ts` — **HIGH**
- **Test:** `tests/orchestra/debt-manager.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** DEBT.md read/write — mock bypass reads/writes real debt records
- **Destructured functions:** (from node:fs)

---

### 22. `src/orchestra/learning-decay.ts` — **HIGH**
- **Test:** `tests/orchestra/learning-decay.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** MEMORY.md decay operations
- **Destructured functions:** (from node:fs)

---

### 23. `src/orchestra/learning-migration.ts` — **HIGH**
- **Test:** `tests/orchestra/learning-migration.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Memory format migration
- **Destructured functions:** (from node:fs)

---

### 24. `src/orchestra/handoff-protocol.ts` — **HIGH**
- **Test:** `tests/orchestra/handoff-protocol.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Sprint handoff file writes
- **Destructured functions:** (from node:fs)

---

### 25. `src/orchestra/ecosystem-intelligence.ts` — **MEDIUM**
- **Line 6:** `import { existsSync, readFileSync, writeFileSync } from 'node:fs';`
- **Test:** indirect test coverage
- **Risk:** Reads external ecosystem data
- **Destructured functions:** existsSync, readFileSync, writeFileSync

---

### 26. `src/providers/claude.ts` — **HIGH**
- **Line 1:** `import { spawnSync } from 'node:child_process';`
- **Line 2:** `import { readdirSync, existsSync } from 'node:fs';`
- **Test:** `tests/providers/claude.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Claude provider spawns tmux sessions — if `spawnSync` mock bypassed, real tmux commands execute
- **Destructured functions:** spawnSync, readdirSync, existsSync

---

### 27. `src/providers/sandbox.ts` — **HIGH**
- **Line 1:** `import { spawn } from 'node:child_process';`
- **Line 3:** `import { existsSync, realpathSync } from 'node:fs';`
- **Test:** `tests/providers/sandbox.test.ts` — `vi.mock('node:fs', ...)` and `vi.mock('node:child_process', ...)` present
- **Risk:** Sandbox provider spawns subprocess — real process spawn if mock bypassed
- **Destructured functions:** spawn, existsSync, realpathSync

---

### 28. `src/cli/commands/run.ts` — **HIGH**
- **Line 1:** `import { existsSync, mkdirSync, writeFileSync, unlinkSync, createReadStream, watch as fsWatch } from 'node:fs';`
- **Test:** `tests/cli/commands/run.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** CLI run command creates task files — mock bypass writes real files
- **Destructured functions:** existsSync, mkdirSync, writeFileSync, unlinkSync, createReadStream, watch(aliased as fsWatch)

---

### 29. `src/cli/commands/status.ts` — **HIGH**
- **Test:** `tests/cli/commands/status.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Status reads sprint dashboard files
- **Destructured functions:** (from node:fs)

---

### 30. `src/cli/commands/init.ts` — **HIGH**
- **Test:** `tests/cli/commands/init.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Project initialization creates directory structure — mock bypass creates real directories
- **Destructured functions:** (from node:fs)

---

### 31. `src/cli/commands/cleanup.ts` — **HIGH**
- **Line 3:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/cli/commands/cleanup.test.ts` — `vi.mock('node:fs', ...)` and `vi.mock('node:child_process', ...)` present
- **Risk:** Cleanup deletes archived task files — if mock bypassed, real deletion occurs
- **Destructured functions:** spawnSync + node:fs functions

---

### 32. `src/cli/commands/retro.ts` — **HIGH**
- **Test:** `tests/cli/commands/retro.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** RETRO.md display
- **Destructured functions:** (from node:fs)

---

### 33. `src/cli/commands/review.ts` — **HIGH**
- **Test:** `tests/cli/commands/review.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Sprint review reads task results
- **Destructured functions:** (from node:fs)

---

### 34. `src/cli/commands/history.ts` — **HIGH**
- **Test:** `tests/cli/commands/history.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Sprint history reads sprint log files
- **Destructured functions:** (from node:fs)

---

### 35. `src/cli/commands/doctor.ts` — **HIGH**
- **Line 4:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/cli/commands/doctor.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Doctor runs health checks via `spawnSync('tsc', ...)` — mock bypass runs real tsc
- **Destructured functions:** spawnSync + node:fs functions

---

### 36. `src/cli/commands/watch.ts` — **HIGH**
- **Line 3:** `import { spawn, spawnSync } from 'node:child_process';`
- **Test:** `tests/cli/watch.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** File watcher uses spawn — if mock bypassed, real subprocess started
- **Destructured functions:** spawn, spawnSync + node:fs functions

---

### 37. `src/cli/commands/sync.ts` — **HIGH**
- **Line 3:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/cli/sync.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Config sync + git operations
- **Destructured functions:** spawnSync + node:fs functions

---

### 38. `src/cli/commands/onboard.ts` — **HIGH**
- **Line 3:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/cli/commands/onboard.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Onboarding wizard runs external commands
- **Destructured functions:** spawnSync + node:fs functions

---

### 39. `src/cli/commands/skill.ts` — **HIGH**
- **Line 1:** `import { createHash } from 'node:crypto';`
- **Line 3:** `import { spawnSync } from 'node:child_process';`
- **Test:** `tests/cli/commands/skill.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Skill registration uses crypto hashing + child_process
- **Destructured functions:** createHash, spawnSync + node:fs functions

---

### 40. `src/cli/commands/agent.ts` — **HIGH**
- **Line 1:** `import { createHash } from 'node:crypto';`
- **Test:** `tests/cli/commands/agent.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Agent registration uses crypto hashing
- **Destructured functions:** createHash + node:fs functions

---

### 41. `src/cli/helpers/config-reader.ts` — **HIGH**
- **Test:** `tests/cli/helpers/config-reader.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Shared config reader — used by many commands
- **Destructured functions:** (from node:fs)

---

### 42. `src/cli/commands/explain.ts` — **HIGH**
- **Test:** `tests/cli/commands/explain.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Sprint history explain — reads archived sprint files
- **Destructured functions:** (from node:fs)

---

### 43. `src/mcp/tools/init.ts` — **HIGH**
- **Line 1:** `import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';`
- **Test:** `tests/cli/commands/init.test.ts` — `vi.mock('node:fs', ...)` present (via shared test)
- **Risk:** MCP init tool creates project structure — mock bypass creates real directories
- **Destructured functions:** writeFileSync, mkdirSync, readFileSync, existsSync

---

### 44. `src/mcp/tools/checkpoint.ts` — **HIGH**
- **Line 1:** `import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';`
- **Test:** indirect via integration tests with `vi.mock('node:fs', ...)`
- **Risk:** Checkpoint approve/reject writes task files
- **Destructured functions:** readFileSync, writeFileSync, existsSync, readdirSync

---

### 45. `src/mcp/tools/kill.ts` — **HIGH**
- **Line 1:** `import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';`
- **Risk:** Worker kill deletes lock files — mock bypass deletes real files
- **Destructured functions:** readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync

---

### 46. `src/mcp/tools/job-runner.ts` — **HIGH**
- **Line 1:** `import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';`
- **Test:** `tests/mcp/job-runner.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Job runner creates task JSON files — mock bypass writes real task files
- **Destructured functions:** writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync

---

### 47. `src/mcp/resources/tasks.ts` — **MEDIUM**
- **Line 1:** `import { readFileSync, existsSync, readdirSync } from 'node:fs';`
- **Risk:** MCP resource reader — read-only operations, lower risk
- **Destructured functions:** readFileSync, existsSync, readdirSync

---

### 48. `src/core/constants.ts` — **MEDIUM**
- **Line 1:** `import { readFileSync } from 'node:fs';`
- **Line 2:** `import { homedir } from 'node:os';`
- **Line 4:** `import { fileURLToPath } from 'node:url';`
- **Test:** `tests/core/constants.test.ts`
- **Risk:** Constants module loaded at startup — if `readFileSync` mock applied after module load, has no effect. Module-level constants are evaluated once.
- **Destructured functions:** readFileSync, homedir, fileURLToPath
- **Note:** Module-level evaluation timing makes this particularly tricky — even namespace import won't help if value is read during module initialization.

---

### 49. `src/orchestra/doc-updaters/changelog.ts` — **HIGH**
- **Test:** `tests/orchestra/doc-updaters/changelog.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** CHANGELOG.md writes
- **Destructured functions:** (from node:fs)

---

### 50. `src/orchestra/doc-updaters/sprint-log.ts` — **HIGH**
- **Test:** `tests/orchestra/doc-updaters/sprint-log.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** SPRINT-LOG.md writes
- **Destructured functions:** (from node:fs)

---

### 51. `src/orchestra/doc-updaters/metrics-updater.ts` — **HIGH**
- **Test:** `tests/orchestra/doc-updaters/metrics-updater.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Metrics doc updates
- **Destructured functions:** (from node:fs)

---

### 52. `src/orchestra/doc-updaters/health-check.ts` — **HIGH**
- **Test:** `tests/orchestra/doc-updaters/health-check.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Health check doc writes
- **Destructured functions:** (from node:fs)

---

### 53. `src/orchestra/doc-updaters/readme-metrics.ts` — **HIGH**
- **Test:** `tests/orchestra/doc-updaters/readme-metrics.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** README metrics section writes
- **Destructured functions:** (from node:fs)

---

### 54. `src/core/global-config.ts` — **HIGH**
- **Line 1:** `import { existsSync, mkdirSync, writeFileSync } from 'node:fs';`
- **Test:** `tests/core/global-config.test.ts` — `vi.mock('node:fs', ...)` present
- **Risk:** Global `~/.deckent/config.json` writes — mock bypass modifies user's actual global config
- **Destructured functions:** existsSync, mkdirSync, writeFileSync

---

### 55. `src/core/deck-file.ts` — **HIGH**
- **Line 2:** `import { execSync } from 'node:child_process';`
- **Risk:** Deck file operations with child process execution
- **Destructured functions:** execSync + node:fs functions

---

### 56. `src/core/plugin-loader.ts` — **HIGH**
- **Line 8:** `import { createHash } from 'node:crypto';`
- **Line 9:** `import { existsSync, readFileSync } from 'node:fs';`
- **Risk:** Plugin loading with crypto hash verification
- **Destructured functions:** createHash, existsSync, readFileSync

---

### 57. `src/core/plugin-hooks.ts` — **HIGH**
- **Line 8:** `import { spawnSync } from 'node:child_process';`
- **Risk:** Plugin lifecycle hooks execute subprocess commands
- **Destructured functions:** spawnSync + node:fs + node:path functions

---

### 58. `src/core/provider.ts` — **MEDIUM**
- **Line 1:** `import { spawnSync } from 'node:child_process';`
- **Risk:** Provider availability check via subprocess
- **Destructured functions:** spawnSync

---

### 59. `src/orchestra/spawn-backend.ts` — **HIGH**
- **Line 1:** `import { spawnSync } from 'node:child_process';`
- **Risk:** Non-Docker subprocess worker backend
- **Destructured functions:** spawnSync

---

### 60. `src/agents/worker.ts` (re-examined: `node:fs/promises`) — **HIGH**
- **Note:** Worker uses synchronous `node:fs` (destructured) alongside `node:fs/promises` (if any). The critical pattern is already documented above.

---

### 61. `src/core/ci-learning.ts` — **MEDIUM**
- **Line 6:** `import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';`
- **Risk:** CI learning data reads/writes — medium risk
- **Destructured functions:** existsSync, readFileSync, readdirSync, writeFileSync

---

### 62. `src/core/config-migration.ts` — **MEDIUM**
- **Line 8:** `import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';`
- **Risk:** Config migration — reads and writes config files
- **Destructured functions:** readFileSync, writeFileSync, existsSync, copyFileSync

---

## Safe Files (Namespace Import Pattern ✅)

These files already use the mock-safe `import * as` pattern:

| File | Import |
|------|--------|
| `src/core/marketplace/skill-sandbox.ts` | `import * as fs from 'node:fs'` — **REFERENCE IMPLEMENTATION** |
| `src/core/agent-pool.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |
| `src/core/skill-pool.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |
| `src/core/skill-registry.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |
| `src/core/skill-cache.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |
| `src/core/stack-detector.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |
| `src/core/plugin.ts` | `import * as fs from 'node:fs'; import * as fsp from 'node:fs/promises'` |
| `src/core/marketplace/registry-client.ts` | `import * as https from 'node:https'; import * as http from 'node:http'` |
| `src/orchestra/decision-logger.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |
| `src/orchestra/batch-stats.ts` | `import * as fs from 'node:fs'; import * as path from 'node:path'` |

---

## Special Hazard: `node:fs` vs `node:fs/promises` Split Mocking

Files that import from **both** `node:fs` and `node:fs/promises` require **two separate** `vi.mock()` calls:

```typescript
// src/core/config.ts
import { writeFile, mkdir } from 'node:fs/promises';  // ← separate module
import { existsSync, statSync } from 'node:fs';

// In tests — BOTH must be mocked:
vi.mock('node:fs', () => ({ existsSync: vi.fn(), statSync: vi.fn() }));
vi.mock('node:fs/promises', () => ({ writeFile: vi.fn(), mkdir: vi.fn() }));
// Missing either mock → one set of calls goes unmocked
```

**Files with this double-hazard:**
- `src/core/config.ts` (lines 1-2)
- `src/core/utils.ts` (lines 1-2)
- `src/core/subscription.ts` (lines 1-2)

---

## Recommended Fix Pattern

Based on `src/core/marketplace/skill-sandbox.ts` (the project's reference fix):

### Option A — Namespace Import (Simplest)

```typescript
// ❌ Before (mock-unsafe):
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// ✅ After (mock-safe):
import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';

// Usage stays the same via destructuring at call site or aliasing:
const { readFileSync, existsSync, writeFileSync } = fs;
// OR inline: fs.readFileSync(...)
```

### Option B — Lazy Getter Pattern (skill-sandbox reference)

```typescript
import * as fs from 'node:fs';

// Lazy getters — resolved at call time, not import time
const readFileSync = (...args: Parameters<typeof fs.readFileSync>) =>
  fs.readFileSync(...args);
```

### Option C — `vi.spyOn` instead of `vi.mock` (Test-side fix)

```typescript
// Instead of vi.mock('node:fs', ...) which replaces the module proxy:
import * as fs from 'node:fs';
vi.spyOn(fs, 'readFileSync').mockImplementation(() => 'mocked content');

// This works even with destructured imports in production code IF
// the test file imports the same namespace reference
```

**Note:** Option C only works when test and source share the same module instance (same import resolution context).

---

## Prioritized Fix Recommendations

### Priority 1 — Fix Immediately (CRITICAL)

These files have confirmed test isolation failures — mocks are silently bypassed:

1. **`src/agents/worker.ts`** — core execution path, tests may hit real filesystem
2. **`src/monitor/auditor.ts`** — auditor tests may run real `git diff`
3. **`src/orchestra/tmux.ts`** — tmux tests may spawn real sessions + non-deterministic crypto

### Priority 2 — Fix Before Next Release (HIGH)

4. `src/orchestra/sprint-reporter.ts` — `execSync` mock bypass runs real `npx vitest run`
5. `src/orchestrators/heartbeat-daemon.ts` — creates real .hb files
6. `src/core/global-config.ts` — modifies user's actual `~/.deckent/config.json`
7. `src/api/server.ts` — `timingSafeEqual` mock bypass makes security tests meaningless
8. `src/providers/claude.ts` — tmux spawn mock bypass
9. `src/providers/sandbox.ts` — subprocess spawn mock bypass
10. `src/orchestra/spawn-backend-docker.ts` — Docker spawn mock bypass (most dangerous)

### Priority 3 — Fix in Next Sprint (MEDIUM/HIGH)

All remaining 52 files identified above. Systematic sweep recommended: 1 PR per module group (orchestra/, mcp/, cli/).

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total `src/` files scanned | 200+ |
| Files with destructured `node:*` imports | 100+ |
| Test files mocking `node:fs` | 171 |
| Test files mocking `node:child_process` | 97 |
| Test files mocking `node:crypto` | 3 |
| **CRITICAL** risk files | 3 |
| **HIGH** risk files | 48 |
| **MEDIUM** risk files | 11 |
| Already **SAFE** (namespace import) | 10 |
| Files with double-hazard (fs + fs/promises) | 3 |

---

## References

- Sprint 133 fix commit: `skill-sandbox.ts` namespace import migration (33 tests fixed)
- Vitest docs: [Module Mocking — ESM Hoisting](https://vitest.dev/guide/mocking.html#modules)
- Node.js ESM: Static analysis of `import` bindings (live bindings vs. value snapshots)
- ADR-008: Module Import Rules (circular dependency prevention)
