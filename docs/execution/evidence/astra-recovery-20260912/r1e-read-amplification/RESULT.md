# R1-E bounded read amplification — implementation verified, latency HOLD

Owner-authorized recovery, DOGFOOD ON/DEGRADED. No auth mutation, no new sprint/provider call, no accepted-result or settlement fabrication.

Changes:
- CustodyReadSnapshot.releaseCachedValues releases owned payloads/semantic memo at admission boundaries. Original positive/negative file and scan observations remain until final native verification. Re-read after eviction must match the original fingerprint. Bounds unchanged:64MiB/10s. Statistics now include peakRetainedBytes (cache accounting, not RSS).
- Planning uses the existing startup readExactArchivedAttemptDisposition reader for full verified archived chains instead of replaying their cold accepted-result pipeline. Missing/corrupt chain still takes ordinary reconciliation. This is production reader parity, not an age-based skip.

Proof:
- snapshot + Store tests182/182 exit0.
- final snapshot + planning-route tests11/11 exit0.
- build:all exit0; diff check separately recorded.
- native candidate before parity:10504ms exit1 DEADLINE_EXCEEDED, rss453419008.
- native candidate after parity:10343ms exit1 DEADLINE_EXCEEDED, rss487944192.
- CPU diagnostic: ~3007ms native captured calls; canonical manifest/path validation and GC also material. Instrumented runs are diagnostics, not latency acceptance or p95 proof.
- one attempt-timing diagnostic (wrapper delegates unchanged reader) measured722-0011639ms,747-0012329ms,746-0021263ms before10s deadline. Loop reached only part of history. No retry without changed hypothesis/code.

Decision: snapshot candidate remains default OFF; latency proof FAILED. Historical whole-root readiness cannot be advertised GO. 751 retained negative receipt from prior package is preserved; .tasks remains empty.

Next exact admitted R1-E boundary: separate repeated validation of immutable artifact/manifest content from per-request policy and identity authority. Profile shows cost within individual attempts, not payload eviction (about1ms). Reuse parsed immutable manifest nodes only under exact proof and policy checks; do not increase timeout/cache caps, trust file age, skip stale evidence, or persist a success/liveness cache. Final native reread and discovery membership fence remain required. Then measure full uninstrumented candidate readiness and heap/peak ownership before enablement; no unconditional READY based on unit tests.

Cursor227 digest HOLD remains; neither its header nor test claim was silently accepted. No commit/push in this slice. Formal XVerify unavailable/HOLD; same-provider tests are local verification only.
