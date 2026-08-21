# Provider-limit observe-only and CAS authoring contract

Status: frozen recovery design, owner-approved 2026-08-21

## Decision boundary

Provider subscription usage is not uniformly measurable. Claude and Codex can
expose advisory percentage windows, while Cursor may expose no durable usage
window at all. A missing metric is not zero usage, and setting `blockAtRatio` to
`1.0` is not a legitimate way to disable enforcement: it silently recodes an
owner decision as a threshold and still blocks at exactly 100 percent.

The policy therefore has an explicit `ratioEnforcement` value:

- `enforce` is the default and preserves every existing configuration.
- `observe_only` retains the authored warn and block thresholds, evaluates
  pressure, and records a crossed block threshold as `threshold_observed`.
- A crossed ratio in `observe_only` does not itself produce HOLD.
- Unknown, unavailable, future-dated, stale, or incomplete evidence remains
  HOLD. `observe_only` never fabricates capacity.
- Absolute `minimumRemaining` floors remain enforced. The switch controls only
  ratio thresholds, not the existence of capacity or an absolute safety floor.

Parent authority may choose either mode. A project can tighten a parent
`observe_only` policy back to `enforce`, but it cannot widen parent `enforce` to
`observe_only`. Legacy policies normalize to explicit `enforce` in authority
snapshots and policy digests.

## Subscription adjudication composition

`cross_verify.allow_non_reservable_subscription_adjudication` and
`ratioEnforcement` solve different problems:

- The cross-verify flag allows one owner-budgeted verifier adjudication to use a
  typed `non_reservable_subscription` admission when advisory percent windows
  cannot support numeric reservation.
- `ratioEnforcement=observe_only` controls whether a measured ratio crossing
  blocks that bounded call.

The non-reservable arm still requires a subscription execution profile, at
least one percent window, live reachability, an owner-authored adjudication
token/wall-clock budget, exact provider/model identity, terminal
provider-reported usage, and settlement evidence. No reservation or USD usage
is forged.

## Multi-policy authoring transition

`provider-authority limits init` derives exactly one selector from live account
and limit evidence, then prepares an owner-visible transition against the
current global authority:

1. No authority produces a `create` plan.
2. A new exact selector produces an `add` plan and preserves every existing
   policy.
3. The same exact selector with different values produces an `update` plan and
   changes only that selector.
4. The same selector and values produce `unchanged` and no file mutation.

The prepared plan binds the current `authorityRef` as a CAS token. After owner
confirmation, the writer acquires an exclusive sidecar, reloads the config, and
refuses `provider_limits_authority_changed` if the token no longer matches. It
also refuses unreadable config, invalid policy composition, or a concurrent
writer. A successful transition computes a chained authority digest from the
previous authority, live proposal authority, and complete merged policy set.

Publication writes a private same-directory temporary file, flushes it, atomically
renames it over the config, restores owner-only permissions, and flushes the
directory where the platform supports it. The sidecar is removed only by its
holder. Unrelated global config fields are preserved from the reload performed
while the lock is held.

## Cursor boundary

This switch does not make Cursor or Grok 4.6 reachable. Current Cursor evidence
sources report all of the following independently:

- account identity HOLD;
- zero provider-limit windows;
- unsupported reachability;
- no Cursor binary in the current production worker image.

Because the selector must come from live truth, zero windows cannot be authored
as a placeholder policy and cannot enter the non-reservable percent-window arm.
Cursor remains typed HOLD until the separately admitted 7091 residual installs
the production binary, binds credential/account authority, supplies an honest
zero-window admission contract or real windows, adds verifier priority, and
passes an end-to-end `--verifier cursor` smoke.

## Verification contract

The scoped proof must show:

- legacy absent mode resolves to `enforce`;
- `observe_only` preserves `pressure=block` while returning ratio admission
  `allow` with `threshold_observed`;
- absolute floors and unknown/stale evidence remain HOLD;
- an advisory window above the ratio threshold may run the bounded probe only
  under explicit `observe_only`;
- an ordinary non-zero provider exit remains provider `rejected`; only explicit
  Docker socket/daemon evidence or runner-level failure is
  `backend_unreachable`;
- after observe-only admits a probe, a failed reachability result is
  `probe_unreachable`, never relabeled from the durable advisory snapshot's
  intentionally permanent HOLD;
- a versioned reachability source authority is part of probe freshness identity;
- the provider token budget and CLI transport envelope use separate units; the
  exact-response probe has a provider-neutral 64 KiB capture ceiling and
  overflow is `response_too_large`, never a false Docker outage;
  an older source revision remains durable evidence but cannot impose cooldown
  on corrected source semantics;
- exact-selector add/update preserves unrelated entries;
- stale CAS plans and concurrent writers cannot overwrite authority;
- real CLI authoring updates Codex and additively authors Claude without raw
  account identity or credential output;
- the reloaded authority has exactly the intended selectors and the canonical
  runtime resolver is ready.

Design, implementation, and result are independently cross-verified by a
provider different from Codex. HOLD or UNCLEAR is not a seal.
