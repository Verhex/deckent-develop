# R18 partial-mutation recovery — remaining contract

Do not turn terminal quarantine into in-flight with a string/state update.

Evidence: file-lock.ts:2854 monotonic SQL trigger requires existing quarantine in-flight for resumed ownership transfer. resumeExecutionLockIrreversibleBoundary:7076 explicitly rejects terminal quarantine. execution-effect-lock-adapter:518 publishes partial-mutation terminal quarantine after failed apply. recoverQuarantinedExecutionLock:7647 requires a verified attestation and closes old lock; it does NOT resume the original transaction. There is no src consumer. Calling it with a constant-true verifier would invent recovery authority and is forbidden.

Required application-service recovery contract:
- Bind exact project/tenant, task, attempt, generation, transaction digest, prepared/applying journal, all durable STEP receipts, current quarantine digest/fence, owner death, and owner-approved recovery action.
- Independently inspect actual native entries under pinned root and compare the exact durable applied prefix, next operation preimage, staged content references and all parent identities. Wrong root, symlink/hardlink, duplicate or missing steps, foreign concurrent mutations, ambiguous last step, stale fence and live owner remain HOLD.
- Preserve terminal quarantine/audit as history. A new explicit recovery transition must have authenticated evidence and successor fencing; existing in-flight-only SQL/audit guards cannot be weakened globally. Either a versioned recovery-boundary transition with validated lineage, or a new recovery transaction whose relation to original immutable effect/attempt is recognized by terminal validator, is necessary. The latter cannot masquerade as a provider attempt or synthesize usage.
- Atomically publish recovery authority and owner transition, retain exclusive maintenance protection, and reconcile native state before executing remaining authorized operations. No lease release window, no best-effort directory deletion, no manufactured terminal receipt.
- Verify resulting effect journal, accepted-result and task settlement through production readers; sprint ABORTED stays historical unless canonical lifecycle service supplies a successor/resume receipt. Generic recover housekeeping is not the effect recovery service.
- Shared derived-parent reuse also needs explicit durable contract: persistence validator currently requires absent preimages for every missing baseline ancestor. Merely skipping an existing directory breaks proof. Include identity/mode/containment and foreign-write rejection and exact provenance of the reused directory; preserve real directory-add semantics separately.

Current implementation in isolated tree: generic recovery now reports started attempts and refuses ordinary cleanup before any coordinator termination or reservation mutation. This is admission foundation only, dependency-bound to the recovery closure above. It does not recover 762.

## Aborted disposition amendment
Owner subsequently authorized force-finalize and manual repair.762 is terminalABORTED, so original-effect continuation above was not executed. Exact empty-derived-directory retention was independently verified and recorded through the existing terminal recovery API; original journal remains partial and task results unresolved. This closes the operator quarantine incident only. A future automatic resumable-effect capability still needs the successor contract above. Evidence: aborted-retention/.
