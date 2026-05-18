# Analysis: src/orchestra/spawn-backend-docker.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 493 | **Effort:** max

## 1. Amaci (detayli)
Docker spawn backend. Her worker'ı izole Docker container'ında çalıştırır. Container setup: project readonly mount, .tasks/ RW mount, Claude auth mount, API key injection, timeout guard, heartbeat loop, EXIT/SIGTERM trap'leri. Sprint 139'da 5-sprint exit-137 bug'ı için fsync_file + SIGTERM 15s grace period eklendi. Ayrıca prompt file archive (sprint cleanup) fonksiyonu içerir.

## 2. Public API
- `DockerSpawnBackend` (class implements SpawnBackend) — JSDoc ✓
  - `spawn(taskId, model, prompt, opts?)` — JSDoc ✓ (detailed container setup)
  - `kill(taskId)` — JSDoc ✓ (Sprint 139 graceful stop documentation)
  - `list()` — JSDoc ✓
  - `isAvailable()` — JSDoc ✓
- `isDockerAvailable()` → boolean — JSDoc yok
- `archivePromptFiles(tasksDir, sprintId, retention?)` → {archived, cleaned} — JSDoc ✓

## 3. Ic Bagimliliklar
- `../core/types.js` (ModelType)
- `../core/constants.js` (TASKS_DIR)
- `../core/utils.js` (debugLog)
- `./spawn-backend.js` (SpawnBackend, SpawnBackendOptions, SpawnBackendError)
- Döngüsel bağımlılık riski: YOK

## 4. Dis Bagimliliklar
- `node:child_process` (spawnSync, spawn) — Docker CLI çağrıları
- `node:fs` (writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, rmdirSync) — ağır fs kullanımı
- `node:path` (join, resolve)
- `node:crypto` (randomBytes) — prompt ID
- `node:os` (homedir, totalmem) — Docker config
- ADR-010 uyumu: ✓ (tümü Node.js built-in)

## 5. Complexity
- Fonksiyon sayısı: 6 exported + 2 private (verifyResultAfterStop, monitorContainer)
- Max cyclomatic complexity: `spawn()` (satır 50-226) ≈ CC 12 — 177 satır, birçok conditional (image check, WSL2 check, env key loop, docker args build)
- `monitorContainer()` (satır 310-413) ≈ CC 10 — exit code reconciliation, fsync, log extract, cleanup
- `archivePromptFiles()` (satır 439-492) ≈ CC 5

## 6. Type Safety
- `as string[]` — satır 397, 455, 472 (`readdirSync()` return — TS overload selection)
- `as { selfAssessment?: string }` — satır 340 (JSON.parse result, unvalidated)
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓
- Non-null `!`: 0 ✓
- **P2**: Satır 340 — `JSON.parse(raw) as { selfAssessment?: string }` — no Zod validation. If .result file is corrupted/malicious, `selfAssessment` could be any value. Belt-and-suspenders: only checks 'DONE' | 'GO_WITH_TECH_DEBT' — safe in practice.

## 7. ADR Compliance
- **ADR-006 spawnSync**: spawnSync used extensively for Docker CLI calls (image check, stop, kill, rm, logs). UYUMLU — ADR-006 is about security of spawnSync for external commands. Docker CLI is controlled binary, args are sanitized. ✓
- **ADR-008**: orchestra/ → core/ only ✓
- **ADR-010**: Node.js built-ins only ✓
- **ADR-027 Hybrid Spawn Backend**: Docker backend IS the preferred 'auto' first choice ✓
- **ADR-034 Multi-Project Isolation**: Container mounts project dir — each container is isolated ✓
- **Memory V2**: N/A

## 8. Test Coverage
- `tests/unit/spawn-backend-docker.test.ts` — EXISTS ✓
- Test location: tests/unit/ — inconsistent (should be tests/orchestra/ per convention)
- archivePromptFiles tested? Needs verification.
- monitorContainer: hard to unit test (async, docker wait subprocess). E2E tests in tests/docker/ may cover.

## 9. TODO/FIXME/HACK inventory
- NONE ✓

## 10. Dead Code
- No `@deprecated`
- All methods reachable via SpawnBackend interface
- `archivePromptFiles` called from sprint cleanup — verified in sprint-finalizer
- `.worker-*.sh` cleanup in monitorContainer (satır 396-406) — only when `containers.size === 0`. Could be race-prone if tasks finish near-simultaneously.

## 11. Security
- **CRITICAL**: Satır 97 `--dangerously-skip-permissions` — IMMUTABLE Deckent standard. Workers get full write access inside container. Container isolation (Docker namespace) is the security boundary. ✓ acceptable.
- **Container escape**: Project dir mounted with full RW (satır 163 `-v ${dir}:${CONTAINER_WORKSPACE}`). Worker CAN modify any file in project dir. Scope enforcement is at Auditor level (git diff check), not container level.
- **Env key passing**: Satır 182-187 — ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY passed via `-e` flag. These are visible in `docker inspect`. Risk: LOW (single-user system, Docker containers are ephemeral).
- **Claude auth mount**: Satır 168 `~/.claude:${containerHome}/.claude` mounted RW. If container is compromised, attacker gets Claude session tokens. Risk: LOW (container lifetime is bounded by timeout).
- **fsync_file dd trick**: Satır 130 — `dd if="$1" of="$1.fsync" bs=4096 conv=fsync && mv "$1.fsync" "$1"` — POSIX portable fsync. Creative solution for Alpine containers without Python. ✓
- **Shell injection**: scriptContent built with string interpolation (satır 124-143). Variables `taskId`, `promptFileName` come from sanitized task IDs (format: `NNN-NNN`). Risk: MINIMAL.
- **SQL injection**: N/A

## 12. Memory V2 Uyumu
- N/A — no memory operations

## 13. i18n
- No user-facing strings
- Log messages English — acceptable

## 14. Dokumantasyon Tutarliligi
- spawn() JSDoc: detailed container setup documentation ✓
- kill() JSDoc: Sprint 139 fix documentation, 4-step sequence ✓
- isDockerAvailable missing JSDoc — minor
- Code comments are extensive and accurate — Sprint 137, 138, 139 references ✓

## 15. Performance
- spawnSync calls: image check (satır 56), stop (satır 247), kill fallback (satır 253), rm (satır 261), logs (satır 375), availability (satır 299) — 6 sync Docker CLI calls per lifecycle. Each with timeout guard ✓
- writeFileSync: prompt file (satır 87), worker script (satır 144), heartbeat (satır 213), timeout marker (satır 203) — 4 sync writes per spawn. Acceptable for one-time operations.
- monitorContainer uses async `docker wait` with event handler — non-blocking ✓
- fsyncSync for host-side verification (satır 278, 323-325) — necessary for data integrity

## 16. Oneriler
- **P1**: Satır 163 — project dir mounted RW. Consider read-only mount with only `.tasks/`, `.locks/`, and scope directories as RW overlays. This would provide container-level scope enforcement instead of relying solely on Auditor git diff checks.
- **P2**: Test file misplacement — `tests/unit/spawn-backend-docker.test.ts` should be `tests/orchestra/`
- **P2**: `.worker-*.sh` cleanup race condition (satır 400-403) — `containers.size === 0` check is not atomic. Between check and unlink, another container may start. Low probability but possible.
- **P3**: `isDockerAvailable()` duplicated as class method AND standalone function — deduplicate

## Verdict: ANALYZED
