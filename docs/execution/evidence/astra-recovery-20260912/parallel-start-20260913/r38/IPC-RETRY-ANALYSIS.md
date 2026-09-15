# Bounded next analysis — pending worker IPC unavailable

Read-only. Do not run a sprint, mutate source/runtime/auth or create receipts. Scope MASTER3178 existing R33–R38 recovery.

Trace resolveExactAttemptIpcAuthority through private capture/cursor/output reads and IPC state parser to collector. Identify exact error classes/codes that positively prove temporary storage/transport unavailability versus identity/content/receipt contradiction; missing authority is unknown, not proof of transient failure. Show path:line and hashes.

Specify the smallest typed producer -> report -> collector contract with finite retry and existing lifecycle containment/park, preserving healthy live workers, sibling settlement and dependent tasks. A retry budget exhausted on a running worker must not mint TaskResult, declare it absent, silently mark COMPLETE, or retire its only coordinator. Avoid string-only classification and new parallel retry engines.

Identify existing config budget/monotonic deadline and ownership/invalidation surfaces. Prove a transient first poll then successful second poll, exhausted unavailable with genuine containment/park, and tampered private receipt with immediate contradiction; real Store/Docker proof requirements separate from fixture claims. Examine whether pending capture failure caching poisons all later polls, and how a fresh successful read can supersede only the transient observation without deleting immutable evidence.
