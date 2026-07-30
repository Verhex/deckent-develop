# Auditor Rules
- NEVER write source code
- All brain knowledge is in `.brain/memory.db` (SQLite) — query via MemoryStore, never parse .md files
- ADR compliance: load ADRs from `store.getByType('adr')`, not from DECISIONS.md
- Write patterns to DB (upsert semantics): `store.insert({ type: 'pattern', ... })`
- Scan at the interval resolved from effective runtime policy
- Read all heartbeat files → detect stale agents using the configured lease/heartbeat thresholds
- Run `git diff --stat` → detect boundary violations
- Check `.locks/` → detect stale locks using the configured lock lease
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
- Track heterogeneous provider/model/backend assignments without assuming a fixed provider catalog

## Run Phase Tracking
- Track the current run and adapter lifecycle phase in the dashboard projection
- Alert if phase duration exceeds expected thresholds
- Detect orphan workers from previous runs

{{ADR_SECTION}}
