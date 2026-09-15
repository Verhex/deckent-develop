# R21 — canonical recovered-boundary audit reader

Observed UTC: 2026-09-14T14:23:01.048102+00:00. MASTER3178 / parent120 OPEN; owner-authorized ADR-D-007, DOGFOOD_HEALTH=DEGRADED.

## Change and production connection

`src/core/file-lock.ts:6666` validates one canonical recovered audit chain, including direct quarantine and resumed-generation lineage, timestamps, exact owner/fence, absence of the recovered active/quarantine generation. It uses existing bounded audit queries and canonical authority transaction; no new database or platform-specific storage path.

`src/core/file-lock.ts:6729` exposes exact-generation recovery resolution. Unknown/non-recovered boundary returns null; foreign generation and malformed recovery reject. This is a historical recovery proof, never an effect-completion receipt. The transaction helper can perform existing authority/schema preparation; this is not advertised as a filesystem-write-free API.

`src/core/file-lock.ts:7810` reuses the validator inside the existing recovery transaction after append/CAS removal and before commit. Malformed terminal publication rolls back. Existing recovery ingress thus exercises the validator; the new historical API is not yet wired to a partial-effect retention consumer.

## Evidence

- Scoped execution-fence suite: 73/73, exit0. Initial transform failed (duplicate variable, exit1); second run 68/69 (test assertion inserted into unrelated completion fixture, exit1); both corrected. Logs preserved.
- TypeScript: first exit2 (duplicate variable); corrected `tsc --noEmit` exit0.
- Isolated build exit0; main `npm run build:all` exit0, 27.031s.
- Main compiled binary identity: matching-build-identity, exit0.
- Main binary historical probe exit0 at 2026-09-14T14:22:21.031Z. Exact canonical762 recovery audit and quarantine match previously recorded evidence. Wrong fence rejects. Canonical sprint remains ABORTED/inactive/coordinator absent.
- Audit event: `77ccf374-dd7d-4b1a-b0d8-ebe65d1231fd`; JSON audit SHA256 `14efb3bf084a3a07d71a1deb3a3a4aeae15bb73b060f4f452bdfa1061912f17b`; lineage SHA256 `e08b499bee2754a2555837b7c015cbd5892dfd5fb2837619a96e3daeace1161d`. Probe output contains no new terminal disposition.
- Hermetic negative cases: orphan recovery event, pre-quarantine timestamp, foreign owner, retained active authority, wrong task/owner/nonce, wrong boundary ID. Direct recovery and resumed recovery remain distinguishable from completed boundaries. Later generation and projection-cleanup failure do not erase historical proof.

## Remaining exact blocker / next consumer

762-002 is NOT retained and startup remains blocked by the last measured STARTED_ATTEMPT_RECONCILIATION_REQUIRED. No new sprint, worker/provider call, cleanup, auth mutation, commit or push. 762001/004 dispositions unchanged. No XVerify/cross-platform completion claim.

Next: implement the immutable ABORTED_PARTIAL_EFFECT custody disposition and exact recovery ingress under this same approved recovery DAG. Bind released dispatch/provider lifecycle, prepared/applying/STEP journal prefix, native postimages and unapplied suffix, canonical ABORTED terminal receipt, and the now-readable recovered audit. Preserve inventory and reject committed/accepted/settled effect conflicts. Validate stopped resource custody and owner recovery fence before first-writer publication; health reader must verify the resulting disposition, not skip history. Do not change the existing no-effect STARTED_FAILED invariant. Future authorized effects on retained directories must not be mistaken for retroactive corruption of a historical retention receipt; live proof is captured at publication and durable provenance remains verified.

Return boundary: exact002 retention admitted via product consumer and startup health clear, then real max4 start canary. Foundation is LOCAL_VERIFIED, outer repair is HOLD.
