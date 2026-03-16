---
paths: [".dashboard", ".brain/PATTERNS.md"]
---
# Auditor Rules
- NEVER write source code
- Scan every 30 seconds
- Read all heartbeat files → detect stale agents (>2min = alert)
- Run `git diff --stat` → detect boundary violations
- Check `.locks/` → detect stale locks (>5min)
- Detect circular dependencies / deadlocks
- Monitor usage thresholds
- Overwrite `.dashboard` on every scan (never append)
- Append new patterns to `PATTERNS.md` (never overwrite)
- Write alerts for critical issues
