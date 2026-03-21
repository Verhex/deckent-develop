# DIRECTIVES — Sprint 030 (Subprocess Backend REAL Test)

## Goal: Verify subprocess backend works WITHOUT tmux. After tsc rebuild, brain.ts now reads config.spawn_backend. 4 analysis tasks.

---

## Task 1: Subprocess Backend Verification
- Files: tmp-test/subprocess-verify.md (new)
- Scope: tmp-test/

### Description
Analyze subprocess spawn backend. Read src/providers/subprocess.ts and src/core/spawn-backend.ts. Write report to tmp-test/subprocess-verify.md covering: 1) SubprocessSpawnBackend class, 2) spawn() creates child_process, 3) kill() terminates, 4) list() returns workers, 5) Log files in .tasks/, 6) Heartbeat generation, 7) SpawnBackendFactory auto-detection.

### Tests
- Report written to tmp-test/subprocess-verify.md

---

## Task 2: No-Tmux Verification
- Files: tmp-test/no-tmux-verify.md (new)
- Scope: tmp-test/

### Description
Verify NO tmux sessions exist during this sprint. Write to tmp-test/no-tmux-verify.md. Steps: 1) Run tmux ls and record output, 2) Check if deckent session exists, 3) Verify workers run as direct child processes not tmux windows, 4) Check .tasks/ for task files, 5) Confirm heartbeats exist, 6) brain.ts SpawnBackendFactory integration analysis, 7) Conclusion.

### Tests
- Report written to tmp-test/no-tmux-verify.md

---

## Task 3: Provider Abstraction Analysis
- Files: tmp-test/provider-verify.md (new)
- Scope: tmp-test/

### Description
Analyze provider abstraction. Read src/core/provider.ts, src/providers/claude.ts. Write to tmp-test/provider-verify.md covering: 1) ProviderAdapter interface, 2) ProviderRegistry, 3) ClaudeAdapter, 4) Error types, 5) buildCommand, 6) checkUsage, 7) Provider-backend relationship.

### Tests
- Report written to tmp-test/provider-verify.md

---

## Task 4: Sprint 27 Feature Summary
- Files: tmp-test/sprint27-summary.md (new)
- Scope: tmp-test/

### Description
Summarize ALL Sprint 27 features. Write to tmp-test/sprint27-summary.md covering: 1) Provider abstraction, 2) Spawn backends, 3) Usage tracking, 4) Coverage validation, 5) Rollback, 6) Worker IPC, 7) Zero-config, 8) Sandbox, 9) Global config, 10) Credentials. Include status: implemented/tested/integrated for each.

### Tests
- Report written to tmp-test/sprint27-summary.md

---

## Quality Rules
- Comprehensive markdown with code snippets
- All points addressed per task
