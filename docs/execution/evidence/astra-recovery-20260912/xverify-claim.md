# Codex recovery review — one bounded Opus pass

Author codex/gpt-6-astra. Outcome RECOVERY-DO-DOGFOOD-001, parent120.
This is a source safety and wiring review, NOT a claim that dogfood works or is DONE.
The attached incremental patch is the authored change against a preserved mixed-main
baseline; whole HEAD diffs include other authors. Review current targeted source too.

Claim to test: historical rejection retirement is fail-closed on exact backend-issued
reader, unchanged source/custody/provider exit, no accepted result, actual daemon
absence, earlier task identity, and fresh terminal owning run. It never manufactures
accepted result/success/settlement or deletes evidence. Identify unsafe races, missing
authority, cold-restart gaps or unreachable producer-consumer links. No code edits.

Main targeted185/185 tests passed exit0; isolated tsc0. Transactional core build
44dd58bc-2b1c-48e8-93dd-4e7e6c042446 exit0; artifact
aefc2fa7c656e4eb90a17dd4f1114c0cbcda91960e76f2a9661f85344875cd6a.
Actual748 worker ran but schema rejected missing productionWiringEvidence basis;
Flow FAILED11:56:19Z. Effect landed before acceptance; no successful task settlement.
Corrected successor750 FAILED12:52:11Z at CLI orphan preflight BEFORE worker/controller.
Hence repaired rejection path still lacks live fan-in proof. External start exit0
contradicts failed Flow. Cursor owns start.ts; no force/autoarchive/cleanup was used.
Recommend exact safe CLI-to-controller ordering or typed recovery prerequisite;
PID death or Flow FAILED alone is insufficient authority to erase or start work.

Return CONFIRMED/REVISE/UNCLEAR with exact available path:line evidence and missing
proof. Separate source correctness from production closure. Never invent a receipt,
provider usage, platform proof or successful settlement. Current source excerpt scope
may be insufficient; explicitly request missing evidence rather than assume it.
