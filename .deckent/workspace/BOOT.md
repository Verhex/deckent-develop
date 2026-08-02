# Boot Sequence

> Canonical authority zinciri **Goal → Mission → Flow → Run → WorkItem → Attempt → Operation**'dır;
> aşağıdaki sprint-adım akışı bu zincirin sprint-adapter projeksiyonudur, ayrı bir authority değildir.

1. Brain reads `DIRECTIVES.md`
2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS from `.brain/memory.db`)
3. Brain plans sprint — AI mode (`deckent_plan mode:ai`) with Zod validation
4. Workers spawned via configured backend (tmux/subprocess/Docker), auditor scan loop starts (in-process)
5. Workers execute tasks, write heartbeats (`.hb` files), update progress
6. Brain waits for `.result` files, evaluates GO / NO_GO / GO_WITH_TECH_DEBT
7. Retrospective written to DB → memory update → decay → sprint complete

## Manual Recovery Chain

> **⚠️ UYARI:** Bu zincirin 1-2. adımları (kill/cleanup) owner (Alperen) onayı olmadan
> ÇALIŞTIRILAMAZ; onaysız tek güvenli adım read-only inceleme (`status` / `history` /
> `recover --dry-run`). Aşağıdaki 3-5. adımlar da canlı sprint durumunu mutasyona uğratır —
> onaysız çalıştırılamaz; owner onayı olmadan yalnız read-only/dry-run varyantları kullanılabilir.

If a sprint stalls, follow this chain in order:

```bash
# Step 1: Kill active workers (owner-onay gerekir)
deckent kill --all

# Step 2: Cleanup task files (owner-onay gerekir)
deckent cleanup

# Step 3: Recover orphan state (re-evaluates partial results) (owner-onay gerekir; onaysız
# yalnız `deckent recover --dry-run` — read-only preview — çalıştırılabilir)
deckent recover

# Step 4: Re-run specific task manually (owner-onay gerekir)
deckent run <task-id>

# Step 5: Spawn remaining tasks (auto-approve) (owner-onay gerekir)
deckent spawn --auto-approve
```

**MCP equivalent:**
```
deckent_kill    → { target: "all" }
deckent_cleanup → { root: "." }
deckent_recover → { root: "." }
deckent_run     → { taskId: "<task-id>" }
```
