# R0 rejected-result negative closure — independent review
Author codex/gpt-6-astra. Review source correctness; do not claim production DONE.
Prior Opus review was UNCLEAR/HOLD on an earlier registry-only repair. NEW evidence:
we now persist a negative terminal disposition in the existing custody Store.
Core build committed 826bc2c2-4e71-4f2e-981f-b7549bd6c796; 128/128 selected tests exit0,
TypeScript exit0. Actual748 read-only recovery preview is in progress, no runtime closure claimed.

Review exact incremental.patch plus referenced source targets. Invariants:
- Worker result bytes stay immutable and unaccepted. New negative dispatch record
  binds exact admission, provider start/execution/exit, original result SHA,
  verified effect-landing chain with released workspace, all preserved artifacts,
  owner recovery fence and fresh daemon absence from the issuing backend.
- Store first-writer record revalidates on cold read and blocks attempt resurrection.
- Recovery schema-validation-only ingress MUST never publish acceptance for valid results.
- CLI recovery requires exact FAILED Flow/process closure and fresh owner fence.
- Planning readiness and startup discovery consume the same negative record.
- Old stopped-unlanded and committed-release-pending distinctions stay intact.
- New 5 tests exercise real Store/lifecycle producers over a hermetic OS adapter,
  including fresh Store, conflict/corruption, source mismatch and no late acceptance.
  They are not a native filesystem/provider closure receipt.
- CLI child-terminal reporting and foreign-state archive protection are scoped repairs.

Find only concrete BLOCKS_CURRENT_DONE issues in this delta (auth/race/replay/production
wiring/incorrect failure retirement), with path:line and fix direction. Separate
source pass from outstanding live closure, latency, all-surface R1, and platform proof.
Do not conflate negative failure closure with a successful task/accepted result.
