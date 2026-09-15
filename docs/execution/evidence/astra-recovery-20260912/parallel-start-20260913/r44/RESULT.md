# R44 — collector dispatch admission cutoff

PARTIAL / LOCAL_VERIFIED. 68 targeted tests passed (scheduler-spawn-executor + result-collector); build:all exit0. Official binary decision: {"status":"allow","reason":"matching-build-identity"}.

See SCOPE.md for wiring and remaining work. Closed-window test asserts no prompt, provider dispatch, kill or task mutation. Exact custody admission has a second check after asynchronous preparation. Existing admitted attempts are not canceled. No runtime canary or full deadline/drain/resume proof was run. Collector still exits its finite wait; controller/resume fix is outstanding. No new SIGKILL, timeout configuration change, receipt, settlement, commit or push. Broad recovery remains HOLD.
