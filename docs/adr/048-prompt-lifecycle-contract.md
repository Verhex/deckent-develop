# ADR-048: Prompt Lifecycle Contract

**Status:** accepted
**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)
**Date:** 2026-05-14
**Sprint:** Sprint 168 (Brain Repair Phase, Cluster E fix)

---

## Status

accepted (Sprint 168 C0e fix — Sprint 167 BUG-HH live evidence, cascade endpoint).

## Context

Sprint 167 audit's live forensic evidence (`.audit/sprint-167/T5-brain-debug-phase1.md` BUG-HH §393-468, `phase2.md` Cluster E §249-369) documented that `src/providers/claude.ts:129 _cleanupOrphanedPromptFiles()` was **non-selective**: every call to `ClaudeAdapter.kill(taskId)` deleted **every** `.tasks/.prompt-*.txt` file in the project, including the prompt files belonging to still-active workers.

This violated the implicit contract documented inline at `src/orchestra/spawn-backend-docker.ts:941-942` (Sprint 156 Task 4):

> `.prompt-*.txt` AND `.worker-*.sh` tmpfiles persist until sprint cleanup. Both are archived together by `archivePromptFiles()` during sprint cleanup phase.

Sprint 167 BUG-HH live replay: when **any** worker was killed (orphan cleanup, scope violation, retry-fix kill), the remaining active workers lost their `.prompt-*.txt` source and several wrote NO_GO stub `.result` files because the Claude CLI could not re-read the prompt mid-execution.

Cascade significance: this BUG-HH was the **endpoint** of Sprint 167's cascade chain. Any kill triggered by Cluster B (spawn-lock asymmetry), Cluster C (plan↔spawn disconnect), or Cluster A (sprint-finalizer step ordering) cascaded into BUG-HH and corrupted the entire sprint. Fixing C0e (this ADR) closes the cascade so that B/C/A fixes ship without downstream sprint corruption.

Three additional gaps surfaced from the forensic:

1. **No cross-sprint orphan handling.** If a sprint crashes mid-execution (Brain SIGKILL, power loss), its `.prompt-*.txt` files remain in `.tasks/` and pollute the next sprint's working set with no archival.
2. **No cross-backend uniformity.** Only the Docker backend had a documented persist-until-cleanup contract. The Subprocess (`spawn-backend.ts`) and Tmux (`tmux.ts`) backends had no contract comment, so future maintainers had no guarantee the lifecycle would remain consistent.
3. **Duplicate active-worker lookup.** `auditor.ts:2162-2168` already maintained an active-worker pattern (via `hb.workerId`), but the pattern was not shared as a helper. Selective filter on claude.ts needed an equivalent lookup (via `hb.taskId`, matching Docker prompt filename embedding `.prompt-{taskId}-{promptId}.txt`).

## Decision

`.tasks/.prompt-*.txt` and `.tasks/.worker-*.sh` tmpfiles follow this lifecycle contract across **all three** spawn backends (Docker, Tmux, Subprocess):

1. **Write at spawn:** Worker spawn writes prompt to `.tasks/` (Docker: `spawn-backend-docker.ts:226-232`; Tmux: `tmux.ts:writePromptFile()`; Subprocess: passes via argv/stdin, no file).
2. **Persist until sprint cleanup:** During the sprint, prompt files are PRESERVED. Per-worker `kill()` MUST NOT delete prompts belonging to other live workers.
3. **Archive at sprint cleanup:** `archivePromptFiles(tasksDir, sprintId)` (`spawn-backend-docker.ts:982`) is the single atomic operation that moves all `.prompt-*.txt` and `.worker-*.sh` files to `.tasks/archive/sprint-{sprintId}/`. Move (not delete) preserves post-mortem forensic value.
4. **Active filter at cleanup edge cases:** `ClaudeAdapter._cleanupOrphanedPromptFiles(activeTaskIds?)` applies a selective filter via the shared helper `getActiveWorkerIds()` (`src/core/active-workers.ts`). A prompt is deleted only when its embedded taskId is absent from the active heartbeat set. When the caller omits `activeTaskIds`, the helper auto-defaults to `getActiveWorkerIds(this.projectDir)`.
5. **Cross-sprint orphan cleanup:** `cleanupPreviousSprintOrphans(projectRoot, previousSprintId)` (`src/orchestra/sprint-lifecycle.ts`) is invoked at sprint startup. It calls `archivePromptFiles(tasksDir, previousSprintId)` — orphans from a crashed prior sprint are archived (not lost, not retained as noise).
6. **Cross-backend uniformity:** All three backends carry an inline `Sprint 168 C0e Cross-Backend Contract` comment so the persist-until-cleanup contract is discoverable from any backend source file.

## Architectural Principles

- **Single source of truth.** `archivePromptFiles()` in `spawn-backend-docker.ts:982` is the one atomic operation responsible for moving tmpfiles. Sprint-end cleanup, cross-sprint startup cleanup, and any future periodic sweeper all delegate to this function.
- **Active worker protection.** Selective filter via `getActiveWorkerIds()` (`src/core/active-workers.ts`). Helper returns `taskId` because Docker prompt filenames embed `taskId` (`.prompt-{taskId}-{promptId}.txt`). Auditor's existing `workerId`-based pattern (`auditor.ts:2162-2168`) is intentionally NOT replaced — it serves a different downstream (lock cleanup) and the two patterns are complementary.
- **Sprint boundary respected.** Intra-sprint kill DOES NOT trigger archive (cleanup is per-sprint-end). Cross-sprint orphans DO archive (the startup hook explicitly moves them to the previous sprint's archive folder).
- **Backend agnostic.** Three backends share the same lifecycle contract via inline `Sprint 168 C0e Cross-Backend Contract` markers; future backends (e.g. MCP) inherit the same contract.

## Consequences

**Positive:**

- BUG-HH eradicated — `_cleanupOrphanedPromptFiles()` protects active workers via taskId selective filter, so the Sprint 167 cascade endpoint is closed.
- Cluster B (spawn-lock asymmetry), Cluster C (plan↔spawn disconnect), Cluster A (sprint-finalizer step ordering) kill operations no longer corrupt the active worker set as a side effect.
- Three backends share an explicit, discoverable persist-until-cleanup contract — multi-provider users (Docker + Tmux + Subprocess) get consistent behavior.
- Cross-sprint orphans no longer pollute the next sprint's `.tasks/` — they are archived under the previous sprint id.
- `getActiveWorkerIds()` shared helper deduplicates the active-worker enumeration that previously lived only as an inline expression in `auditor.ts`; future callers (Sprint 168.5+) can reuse it.

**Negative:**

- During the sprint, `.tasks/.prompt-*.txt` files persist on disk — for a typical sprint with ~50-100 prompts at ~10KB each, this is ~500KB-1MB of disk space until sprint-end archive. Acceptable trade-off against forensic value.
- Tmux backend prompt filenames use random hex (`tmux.ts:60 writePromptFile`), NOT the embedded-taskId pattern of Docker. The selective filter `file.includes(\`-${id}-\`)` therefore does NOT protect tmux prompts (random hex tokens never match a taskId). Tmux prompt protection relies on tmux's per-window kill semantics (the prompt is only meaningful for the killed window) plus the sprint-end archive sweep, not on the selective filter. Subprocess backend writes no `.prompt-*.txt` at all, so the selective filter is also a no-op there. This asymmetry is intentional and documented inline in `tmux.ts:writePromptFile()` and `spawn-backend.ts` TmuxBackend.spawn().
- Sprint cleanup phase is a single atomic operation. If `archivePromptFiles()` fails partway, the next sprint's startup hook (`cleanupPreviousSprintOrphans`) recovers the remainder — but a fully-corrupted `.tasks/archive/` directory would require manual recovery (operator intervention).

## Compliance

**Verification (Sprint 168 test suite):**

- `tests/core/active-workers.test.ts` — 4 cases: taskId extraction, empty dir, malformed JSON tolerance, missing directory tolerance.
- `tests/providers/claude-cleanup-active-protected.test.ts` — 3 cases: explicit active list protection, default-from-heartbeat fallback, no-active legacy delete-all.
- `tests/orchestra/sprint-startup-prev-sprint-orphan.test.ts` — 3 cases: single orphan archive, empty-directory idempotency, multi-file archive.
- `tests/orchestra/cross-backend-prompt-uniformity.test.ts` — 2 cases: contract keyword presence across all 3 backends, Sprint 168 C0e marker presence on the two newly-annotated backends.

**Runtime evidence required for ratification:**

- Sprint 168 Brain otonom smoke test (Plan Section "Brain Otonom Smoke Test Runbook" — 3-task complex). Expected: kill of task 3 preserves prompts of tasks 1+2.
- Sprint 168.5 production replay: previous sprint's `.tasks/.prompt-*.txt` files must be archived into `.tasks/archive/sprint-168/` at Sprint 168.5 startup.

## Related ADRs

- **ADR-046**: Brain Self-Update Hook Architecture — Step 12 archive-directives pattern parallels this archive-prompts pattern; both share the "single atomic operation at sprint boundary" principle.
- **ADR-037**: Brain-Auditor-Worker Authority Matrix — RBAC scope. Sprint cleanup is a Brain authority; Auditor reads but does not write tmpfiles.
- **ADR-035**: Brain ↔ Worker ↔ Auditor Verification Protocol Standard. The `.prompt-*.txt` file is verification-channel evidence; protecting it preserves the chain.
- **ADR-038**: Dead Code Disposition — earlier audit established that tmpfiles have forensic value; this ADR formalizes the persist-until-cleanup contract that follows from that principle.

## References

- Sprint 167 T5 Brain Debug Phase 1: `.audit/sprint-167/T5-brain-debug-phase1.md` §393-468 (BUG-HH forensic).
- Sprint 167 T5 Brain Debug Phase 2: `.audit/sprint-167/T5-brain-debug-phase2.md` §249-369 (Cluster E cascade pattern).
- Sprint 168 plan: `docs/superpowers/plans/2026-05-14-sprint-168-plan.md` lines 409-832 (Task 1 C0e TDD steps).
- Sprint 168 spec v5: `docs/superpowers/specs/2026-05-14-sprint-168-design.md` Cluster E section.
- Sprint 156 Task 4: original `archivePromptFiles()` introduction (`spawn-backend-docker.ts:982-1011`) — the persist-until-cleanup contract this ADR extends.

---

> **Note (deep-verified vs code, Sprint 172):** §Decision 4 + §Architectural Principles kod ile **birebir doğrulandı:**
> - `_cleanupOrphanedPromptFiles(activeTaskIds?)` — opsiyonel param, yoksa `getActiveWorkerIds(this.projectDir)` default (`src/providers/claude.ts:147,150`); selective filter `active.some(id => file.includes(\`-${id}-\`))` (`:157`) ve Docker `.prompt-{taskId}-{promptId}.txt` yorumu birebir.
> - `getActiveWorkerIds()` (`src/core/active-workers.ts:67`) `.hb` dosyalarından `hb.taskId` döndürür; JSDoc'u (`:55-57`) "auditor.ts:2162-2168 workerId pattern KASITLI değiştirilmedi, iki pattern tamamlayıcı" der — §Arch Principles ile aynen. Tolerance (malformed/empty/missing → boş) test 4-case ile uyumlu.
> - **Pozitif nüans (ADR metninde yok):** `getActiveWorkerIds` ek olarak `PENDING_SPAWNS` (henüz `.hb` yazmamış spawn) ile **union** yapar — §Decision 4 kontratının süperseti (çelişki değil, erken-spawn koruması).
> - **Fonksiyon/test ✓:** `cleanupPreviousSprintOrphans` (`sprint-lifecycle.ts:236`, `archivePromptFiles` çağırır), `archivePromptFiles` (`spawn-backend-docker.ts:1003`); 4 test dosyası (`active-workers`, `claude-cleanup-active-protected`, `sprint-startup-prev-sprint-orphan`, `cross-backend-prompt-uniformity`) mevcut.
> - **Satır-ref drift'i:** ADR `claude.ts:129` → gerçek def `:147` (call `:123`); `archivePromptFiles` `:982` → gerçek export `:1003`. Fonksiyonlar mevcut, yalnız satır numaraları eski (kod büyüdü).
> - **§Decision 6 hassasiyet düzeltmesi:** "All three backends carry an inline `Sprint 168 C0e Cross-Backend Contract` comment" abartılıdır — C0e marker yalnız `src/orchestra/spawn-backend.ts` + `src/orchestra/tmux.ts`'te (2 yeni-annote backend); `claude.ts`/`spawn-backend-docker.ts`'te yoktur (Docker'da orijinal Sprint 156 persist-until-cleanup yorumu vardır). ADR'ın kendi §Compliance maddesi zaten daha hassas ("the two newly-annotated backends"); §Decision 6 ile §Compliance arasındaki ifade farkı §Compliance lehine okunmalıdır.
> - **Dangling ref:** §Context + §References'taki `.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` belirtilen yolda mevcut değil (transient `.audit/` — ADR-047 ile aynı; iddialar forensic formalizasyona dayanır). `docs/superpowers/plans|specs/2026-05-14-sprint-168-*` referansları mevcut ✓.
>
> Behavior unchanged; documentation alignment only.
