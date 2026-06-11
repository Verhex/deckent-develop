# ADR-087: Async I/O & Test Hermeticity Standard

**Status:** accepted

**Date:** 2026-06-11

**Supersedes:** ADR-005 (Synchronous I/O — deprecated)

---

**Decision:** Hot-path I/O and ALL subprocess spawning MUST be asynchronous; ALL tests MUST be hermetic. This is the active, agent-injected successor to the deprecated ADR-005, elevating the rule from a buried deprecated-Note + the CLAUDE.md hermeticity section into an enforced architecture decision that **every worker model (Claude / Codex / Gemini) reads** via ADR prompt-injection.

**Rules (binding for all workers):**
1. **No `spawnSync` for subprocesses** — use async `spawn` (`node:child_process`). `spawnSync` blocks the event loop → CI timeouts + O(n) scan contention (Sprint 279 WK-7: the auditor's 30s scan ran a per-worker `spawnSync('docker', …)`). Use async `spawn` + `Promise.allSettled` batching. **Sole sanctioned exception:** the ADR-006 spawnSync security pattern (argument-array, no shell) for short, trusted, non-hot-path one-shots.
2. **Hot-path file/network I/O async** — loops, scan cycles, worker dispatch, large reads. A one-shot small config read at startup (`readFileSync` of a <1KB JSON) MAY stay sync — the Sprint 132 perf failure was hot-path, not startup.
3. **Tests hermetic** — all I/O under `os.tmpdir()`; never read gitignored local state (`.deckent/config.json`, `.brain/memory.db`, `~/.deckent`, `.deck/`); no real network/docker; assume a fresh checkout. Verify with `npm run test:ci-sim`.

**Context:** ADR-005 deprecated the synchronous-I/O decision after Sprint 132 hot-path performance problems, but its replacement guidance lived ONLY in a *deprecated* ADR's Note plus the CLAUDE.md worker rules — never as an accepted, prompt-injected ADR. Deprecated ADRs do not carry active law to the agents (Alperen 2026-06-11 ADR review: "deprecated ADR işe yaramaz; async + hermeticity diğer modeller de görmeli"). This ADR closes that governance gap.

**Consequence:** New code uses async `spawn` + hermetic tests; reviewers/auditor flag new `spawnSync` (outside the ADR-006 exception). Residual `spawnSync` (Sprint 279 WK-7: ~15 in `auditor.ts` incl. the ADR-006 enforcement string + `gatherCiBaseline`) is tracked for migration in MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-087-W". Auditor liveness probes are already async-batched (Sprint 279). Cross-ref: ADR-006 (sanctioned spawnSync security pattern), CLAUDE.md "Test Hermeticity", `.claude/rules/karpathy-discipline.md` (CUSTOM — Test Hermeticity).
