# DIRECTIVES — Sprint 181 DEFERRED (Manual Recovery Active)

> **Status (2026-05-21):** Sprint 180 closed GO_WITH_GATE_FAILURE. Recovery işi Brain sprint olarak değil **Claude Code manuel** olarak yapılıyor. Sprint 181 adı bu fix'e atanmıyor — recovery tamamlandıktan sonra Sprint 181 yeniden spec'lenecek (devam işleri için: sub-project #3 + AEGIS realization + nervous Faz 2 + post-beta roadmap).

## Recovery scope (Claude Code yapacak)

Referans: `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §7 + `docs/superpowers/plans/2026-05-25-sprint-181-recovery-nervous-restart.md`

1. **W0 — Worker-rollback untracked-safe** (src/agents/worker-rollback.ts + tests/agents/worker-rollback-untracked-safety.test.ts) — P0 BLOCKER
2. **W1 — Sprint 179 self-security recovery (5 src/ + 5 tests):**
   - src/api/terminal/audit-integrity.ts (I4 HMAC chain)
   - src/api/terminal/command-guard.ts (I3 default-deny remote)
   - src/api/terminal/prompt-guard.ts (I1+I2 input pattern)
   - src/api/terminal/outbound-limiter.ts (I5 tenant quota)
   - src/cli/commands/audit-verify.ts (CLI tamper detect)
3. **W2 — Sprint 180 nervous core recovery (2 src/ + 2 tests):**
   - src/nervous/bootstrap.ts (createNervousSystemIfEnabled)
   - src/nervous/action-handlers.ts (4 MVP handlers)
4. **W3 — Sprint 180 NO_GO/GWT closure (5 task fix)**
5. **W4 — NERVOUS-TODO.md restore from mirror** (`/home/alperen/.claude/plans/deckent-i-inde-nervous-system-fuzzy-fern.md`)
6. **W5 — Beta launch smoke v1.0.0-beta.1**

Recovery 3-kaynak referansı (her src/ recovery task'ı için):
- `dist/<target>.js` (Sprint 179+180 build hala intact)
- `docs/superpowers/plans/2026-05-21-sub-project-2.md` §Task NN (TDD breakdown)
- `b6d6e7a3` commit notes + `.brain/exports/memory.md` Sprint 179/180 retro learning detail

## Sprint 181 yeniden plan (recovery sonrası)

Recovery tamamlandıktan sonra Sprint 181 spec/plan/DIRECTIVES yeniden yazılacak — **devam işleri** için:
- Nervous Faz 2 pilot (5 MVP detector balanced mode)
- Sub-project #3 başlangıç (multi-tenant + mTLS impl + k8s)
- Sub-project #4 başlangıç stub (enterprise SSO/SIEM/compliance)
- AEGIS methodology realization (ADR-061)
- Worker .result coverage zorunluluk (Sprint 180 W4-1 tam land)
- Dashboard nervous panel
- ROADMAP-GOD-LEVEL doc restore

Beta launch (June 1 2026) recovery sonrası — Alperen `npm publish v1.0.0-beta.1` manuel.
