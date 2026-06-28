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

Accepted: **ADR-094**, **ADR-092**, **ADR-003**, **ADR-007**, **ADR-068**, **ADR-069**, **ADR-008**, **ADR-087**, **ADR-089**, **ADR-086**, **ADR-083**, **ADR-082**, **ADR-081**, **ADR-080**, **ADR-079**, **ADR-078**, **ADR-076**, **ADR-077**, **ADR-075**, **ADR-074**, **ADR-073**, **ADR-072**, **ADR-071**, **ADR-070**, **ADR-066**, **ADR-065**, **ADR-064**, **ADR-062**, **ADR-063**, **ADR-010**, **ADR-037**, **ADR-047**, **ADR-048**, **ADR-046**, **ADR-045**, **ADR-043**, **ADR-044**, **ADR-053**, **ADR-041**, **ADR-042**, **ADR-040**, **ADR-038**, **ADR-039**, **ADR-035**, **ADR-033**, **ADR-034**, **ADR-029**, **ADR-030**, **ADR-031**, **ADR-032**, **ADR-036**, **ADR-028**, **ADR-027**, **ADR-025**, **ADR-026**, **ADR-023**, **ADR-024**, **ADR-022**, **ADR-018**, **ADR-019**, **ADR-017**, **ADR-014**, **ADR-015**, **ADR-016**, **ADR-020**, **ADR-021**, **ADR-013**, **ADR-001**, **ADR-002**, **ADR-004**, **ADR-006**, **ADR-011**, **ADR-012**, **ADR-088**, **ADR-090**, **ADR-091**, **ADR-093**
<!-- AUTO-END -->

<!-- CUSTOM-START -->

<!-- CUSTOM-END -->
