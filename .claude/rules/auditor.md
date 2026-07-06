<!-- AUTO-START -->
---
paths: [".dashboard",".locks/*"]
---
# Auditor Rules
- NEVER write source code
- All brain knowledge is in `.brain/memory.db` (SQLite) — query via MemoryStore, never parse .md files
- ADR compliance: load ADRs from `store.getByType('adr')`, not from DECISIONS.md
- Write patterns to DB (upsert semantics): `store.insert({ type: 'pattern', ... })`
- Scan every 30 seconds
- Read all heartbeat files → detect stale agents (>2min = alert)
- Run `git diff --stat` → detect boundary violations
- Check `.locks/` → detect stale locks (>5min)
- Detect circular dependencies / deadlocks
- Monitor usage thresholds
- Overwrite `.dashboard` on every scan (never append)
- Write alerts for critical issues

## Agent & Skill Monitoring
- Track which agents and skills are assigned to active tasks
- Flag agent assignment failures in alerts
- Monitor agent utilization rate (assigned vs generic)

## Provider Health
- Check provider availability during scan
- Flag provider failures or timeouts in dashboard alerts
- Track mixed-provider sprint status (Claude + Codex/Gemini)

## Sprint Phase Tracking
- Track current sprint phase in dashboard
- Alert if phase duration exceeds expected thresholds
- Detect orphan workers from previous sprints


## Active ADR Constraints

Full ADR text + rationale live in `.brain/memory.db` (SSOT). Query with `deckent recall "<topic>"` or `store.getByType('adr')` — do NOT rely on a static copy. The list below is an id-only index; look any id up for its current constraint.

Accepted: **ADR-G-034**, **ADR-D-009**, **ADR-D-012**, **ADR-D-011**, **ADR-D-013**, **ADR-G-025**, **ADR-G-010**, **ADR-G-022**, **ADR-D-004**, **ADR-G-026**, **ADR-D-007**, **ADR-G-030**, **ADR-G-008**, **ADR-D-010**, **ADR-G-033**, **ADR-G-006**, **ADR-G-027**, **ADR-G-029**, **ADR-G-023**, **ADR-D-006**, **ADR-G-020**, **ADR-G-019**, **ADR-G-021**, **ADR-G-018**, **ADR-G-016**, **ADR-D-002**, **ADR-G-017**, **ADR-G-014**, **ADR-G-013**, **ADR-G-012**, **ADR-G-011**, **ADR-D-001**, **ADR-D-005**, **ADR-G-005**, **ADR-G-007**, **ADR-G-004**, **ADR-D-008**, **ADR-G-001**, **ADR-G-002**, **ADR-G-009**, **ADR-G-015**, **ADR-G-024**, **ADR-G-028**, **ADR-G-031**, **ADR-G-032**, **ADR-G-035**
<!-- AUTO-END -->

<!-- CUSTOM-START -->

<!-- CUSTOM-END -->
