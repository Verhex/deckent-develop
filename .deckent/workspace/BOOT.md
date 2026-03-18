# Boot Sequence
1. Brain reads DIRECTIVES.md
2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS)
3. Brain plans sprint (AI mode with Zod validation)
4. Workers spawned via tmux, auditor scan loop starts (in-process)
5. Workers execute tasks, write heartbeats (.hb files)
6. Brain waits for results, evaluates (GO/NO-GO/TECH_DEBT)
7. Retrospective → memory update → decay → sprint complete
