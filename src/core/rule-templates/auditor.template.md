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

{{ADR_SECTION}}
