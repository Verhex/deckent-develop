# Trust-Anchor Solo-Account Mitigation Package: Design — Revision 2

**Date:** 2026-08-12
**Decision owner:** Alperen
**Audience:** Deckent repository administration, CI/security owners
**Supersedes:** `follow-up-works/trust-anchor-solo-design-rev2-2026-08-12.md` (rev1) — for mitigation *content and ordering only*. Rev1 is left byte-for-byte untouched and remains the decision record: it holds the codex cross-review verdict and the OWNER DECISION addendum that this revision answers.
**Status:** design proposal only. This document creates no GitHub App, no bot account, no repository, no ruleset, no storage bucket, and no webhook subscription. It edits no workflow and enables no mitigation. Every "create" below is a specification of what an owner would create, not a record of anything created.

## Why this revision exists

Rev1 was sent to revision on 2026-08-11 with a codex cross-review verdict of **UNSOUND**. Six conditions were recorded in its OWNER DECISION addendum. They are quoted here verbatim, in the original Turkish, so that no translation drift can be mistaken for the owner's instruction:

> 1. Rollout sırası ters çevrilir: GHEC/ayrı-trustee feasibility ÖNCE; dış App check bu üst katmana pinlenir.
> 2. Korumalı path'ler `.github/CODEOWNERS` dosyasının KENDİSİNİ kapsar (self-protection).
> 3. Mitigation 1 check'i yeni App'in `integration_id`'sine pinlenir (yalnız isimle değil).
> 4. Mitigation 3 polling yerine webhook+audit-log tabanlı olur (transient gevşet-merge-geri-yükle saldırısını yakalamak için); `bypass_actors` görünürlük sınırı belgelenir.
> 5. Her mitigation için canlı NEGATİF test tanımı zorunlu ("sole admin bunu sökebiliyor mu?").
> 6. Threat model genişletilir: App-host compromise, webhook replay/ref-TOCTOU, bot-policy compromise, ledger-yazım durdurma.

Working English restatement, used as this document's structure:

1. **Reverse the rollout.** Trust-root feasibility (GHEC enterprise layer, or a second human trustee) comes *first*; the external App check is pinned into that upper layer.
2. **CODEOWNERS self-protection.** The protected path set must include `.github/CODEOWNERS` itself.
3. **Pin by identity, not by name.** The Mitigation-1 check is pinned to the new App's `integration_id`, not merely to a context string.
4. **Event-driven, not sampled.** The ledger becomes webhook- plus audit-log-driven, to catch the transient loosen-merge-restore attack; the `bypass_actors` visibility limit is documented.
5. **A live negative test per mitigation** — literally: "can the sole admin remove this?"
6. **A widened threat model** covering App-host compromise, webhook replay and ref-TOCTOU, bot-policy compromise, and ledger-write stoppage.

Rev1's core failure was structural rather than factual. It ordered four controls so that the only layer capable of *preventing* anything (the enterprise layer) was evaluated last, after three layers whose enforcement depended on it. Every control in rev1's first three positions is removable by the identity it defends against, which means shipping them in that order produces green checks that assert more safety than they hold. This revision treats the trust root as a **gate**, not a finale.

### Conformance map

| Condition | Where answered | Status in this document |
|---|---|---|
| 1 — reversed rollout, App pinned to upper layer | §3 (ordering + DAG), §4 (L0), §5 (L1 pin target) | Structural: layer numbering itself reversed |
| 2 — CODEOWNERS self-protection | §7 (L3), path set `P1`–`P7`, NT-3.1/NT-3.2/NT-3.3 | Answered, plus three bypass paths rev1 missed |
| 3 — `integration_id` pinning | §5.3, invariant `INV-PIN`, NT-1.2 | Answered, with the concrete spoof it closes |
| 4 — webhook + audit log, `bypass_actors` limit | §6 (L2), §6.5 limits `VL-1`–`VL-5`, NT-2.2 | Answered; polling demoted to a backstop |
| 5 — live negative test per mitigation | §8 (suite), one `NT-*` block inside every layer | Answered; 14 tests, each with PASS/FAIL and evidence |
| 6 — widened threat model | §2, threats `T1`–`T8` | Answered; each threat routed to a layer or accepted |
| (standing) every mitigation names its enforcer | "Who enforces this against the sole admin" line in §4–§7 | Present in all four layers, including where the answer is "nobody" |

### NO-GO compliance

The task defining this revision names three NO-GO conditions. Each is addressed explicitly:

- *Editing the original document* — not done. Rev1 is unmodified; this is a new file, and every correction to rev1 appears here as a delta row in §10 rather than as an edit there.
- *Creating any GitHub resource* — not done. No App, account, repository, ruleset, or installation exists as a result of this document. §11 lists the owner actions that would create them, as future work requiring separate approval.
- *A mitigation without its negative test* — every layer in §4–§7 carries at least one `NT-*` block, and §8 tabulates all fourteen. A layer whose negative test cannot be defined is marked as such rather than shipped.

## §1 — Evidence base and the disclosed scope gap

This revision was written from the same read authority as rev1 (`follow-up-works/`, `.github/`, `docs/evidence/`), re-verified against disk on 2026-08-12:

| Source | What it establishes, as read |
|---|---|
| `docs/evidence/trust-anchor/ruleset-20321963-2026-08-03.json` | Ruleset `20321963`, `main-protection`, `target: branch`, `source_type: Repository`, `enforcement: active`, conditions `include: ["~DEFAULT_BRANCH"]`. Rules: `deletion`, `non_fast_forward`, and `required_status_checks` with `strict_required_status_checks_policy: true`, `do_not_enforce_on_create: false`, and four contexts — `Validator Contract — macos-latest`, `Validator Contract — ubuntu-latest`, `Validator Contract — windows-latest`, `Type Check` — each carrying `integration_id: 15368`. `bypass_actors: []`, `current_user_can_bypass: "never"`. |
| `.github/CODEOWNERS` | A default `* @alperensartacoglu` plus nine path entries (`src/orchestra/`, `src/core/`, `src/mcp/`, `src/cli/`, `src/agents/`, `src/monitor/`, `src/api/`, `docs/`, `.github/`, `tests/`), every one naming the same single identity. No second reviewer identity exists. Notably, no entry names `.github/CODEOWNERS` itself. |
| `.github/workflows/cross-platform-e2e.yml`, `validator-contract` job | The `TRUST-ANCHOR-001` comment at the `actions/checkout@v4` step: full history is required because the validator verifies each active receipt's baselines against the parent of the registering commit via `git log -S<id>`; at `fetch-depth: 1` the lookup "would degrade to an HEAD anchor, and the exact same-patch forgery this check exists to stop would pass again." The comment states the three legs are ruleset `20321963`'s required checks and that "the enforcement guarantee lives here." The step sets `fetch-depth: 0`. |
| `.github/workflows/ci.yml`, `typecheck` job | An independent second note on the same failure class: shallow clone once "degraded to a WARN pass", referenced inline as `xverify-E`. |
| `follow-up-works/trust-anchor-solo-design-rev2-2026-08-12.md` | Rev1 and its OWNER DECISION addendum — the source of the six conditions above. |

**Two facts read from the ruleset evidence that rev1 under-used, and that this revision builds on:**

- Every existing required check is already `integration_id`-pinned to `15368` (the GitHub Actions app). Condition 3 is therefore not a novel practice for this repository — it is the *existing* convention, which rev1's new check would have silently broken by being name-only. §5.3 treats the pin as an invariant, not an enhancement.
- `strict_required_status_checks_policy: true` and the `non_fast_forward` rule together narrow, but do not remove, the ref-TOCTOU window analysed as `T3` in §2.

**Disclosed gap, carried forward from rev1 unchanged.** The originating work refers to ruleset facts recorded in "ledger row 520" and to "the xverify-E mechanical variants" recorded there. That ledger text lives in `.brain/memory.db` and/or `docs/MASTER-PLAN.md`, neither of which is inside this task's read scope. Per the project's bounded-discovery rule it is neither reproduced nor guessed at. The mapping in §2 is reconstructed from the in-scope citations above, which independently describe the same mechanism and the same named degradation class. Whoever holds row-520 read access should reconcile that ledger against §2 before this design leaves revision status; **if the two disagree, the ledger is authoritative and this document is what gets corrected.**

## §2 — Widened threat model (condition 6)

Rev1 modelled exactly one adversary: the sole admin identity, acting through GitHub's UI or API. That model is why rev1 could conclude that moving trust "outside the repo" was sufficient. It is not: every control rev1 proposed introduces its own new trust anchor — a VM, a webhook secret, a bot token, a storage credential — and rev1 analysed none of them. This section names eight threats. Each is routed to the layer that answers it, or explicitly accepted.

### T1 — Sole-admin identity compromise or coercion (rev1's original threat)

One identity holds repo Settings/ruleset administration, write access to `.github/workflows/**`, write access to the validator script, and sole code-owner authority over the whole tree. One compromised session, one mistaken merge, or one coerced action collapses every layer simultaneously, because no layer's trust is rooted outside that identity.

Concrete tamper paths in this repository:

- **T1.a** Edit `.github/workflows/cross-platform-e2e.yml` to drop `fetch-depth: 0`, restoring the exact forgery precondition `TRUST-ANCHOR-001` names. The `Validator Contract` job keeps its name and keeps reporting green.
- **T1.b** Weaken `scripts/lint-master-plan.mjs` from a fail-closed branch to a `WARN`-and-pass branch — the `xverify-E` degradation, already observed once per `ci.yml`.
- **T1.c** Edit ruleset `20321963` to remove a required check from `required_status_checks`, or flip `enforcement` from `active`, or delete the ruleset.
- **T1.d** Add a bypass actor to the ruleset, leaving every rule nominally intact.

*Routed to:* L0 (§4) for prevention, L1 (§5) for T1.a/T1.b structurally, L2 (§6) for detection of T1.c/T1.d, L3 (§7) for merge-time gating.

### T2 — External App host compromise

Rev1's Mitigation 1 relocates the canonical check onto "a dedicated VM or container host under the App owner's control" and treats that relocation as the security property. It is not. An attacker who owns that host owns:

- the App's private key, and therefore the ability to mint installation tokens and post *any* check conclusion for *any* commit, including a green `trust-anchor/external-canonical-check` on a forged tree;
- the checker's own source and dependencies, so the "independent re-implementation" argument evaporates — the re-implementation is whatever the attacker says it is;
- in rev1's design, also the nightly ledger writer, because Mitigation 3 explicitly reuses the same host and the same credential. A single host compromise therefore defeats the check *and* the record that would have revealed it.

Note the asymmetry rev1 missed: `integration_id` pinning (condition 3) makes this threat *worse* in one narrow sense — once the ruleset trusts exactly one App identity, compromising that identity is a complete forgery capability with no competing signal.

*Routed to:* L1 §5.5 (deterministic, publicly recomputable attestations; key custody in a non-exportable KMS/HSM; dual independent verifiers; write-only ledger credential physically absent from the checker host).

### T3 — Webhook replay and ref-TOCTOU

Two distinct mechanics, both absent from rev1:

- **T3.a Replay.** GitHub signs webhook bodies with an HMAC over the shared secret. A signature proves authorship, not freshness. A recorded delivery — a benign `repository_ruleset` event from a healthy period, or a `check_suite` event for an already-verified commit — can be replayed to a naive handler, which will then either write a false "enforcement healthy" entry into the ledger or re-post a stale green verdict. Replay defence requires the handler to persist `X-GitHub-Delivery` identifiers, reject any repeat, and reject deliveries outside a bounded timestamp window. Anyone who can read the webhook secret (including from a repo secret, which is why the secret must never live in this repository) can also *forge*, not merely replay.
- **T3.b Ref-TOCTOU.** If the checker reacts to an event by fetching "the current tip of the ref it names", it validates a tree that may differ from the one the check gets attributed to. The correct binding is the immutable sha carried in the payload (`after`, or the pull-request `head.sha`): the checker must fetch that exact object, verify the fetched object hashes to that sha, and post the check run against that same sha and no other. A payload sha that is unreachable at fetch time must produce an explicit failure conclusion, never a skip — "I could not verify" and "I verified successfully" must not share an outcome. The `non_fast_forward` rule and `strict_required_status_checks_policy: true` (both present in the evidence) narrow this window on `main`, but neither closes it on pull-request head refs, which are force-pushable by design.

*Routed to:* L1 §5.4 (sha-binding rules `SB-1`–`SB-4`), L2 §6.3 (delivery-id ledger and replay window), NT-1.3 and NT-2.3.

### T4 — Bot-policy compromise

Rev1's Mitigation 2 makes a bot a required reviewer and then delegates the approve/reject decision to "a scripted approval policy … a GitHub Action or the same external host." If that policy runs as a GitHub Action, its source is an in-repo file that the sole admin owns and can edit — the reviewer's judgement becomes editable by the reviewed party, and the entire mitigation degrades to a rubber stamp with an extra step. Related mechanics rev1 did not address:

- **T4.a** The bot's approval must not survive a subsequent push. Without stale-review dismissal, an approved-then-amended PR carries a stale approval into merge. The evidence ruleset contains *no* `pull_request` rule at all today, so this property has to be created, not assumed.
- **T4.b** The bot must not be able to approve pull requests it authored.
- **T4.c** A code owner must hold write access to be a valid code owner. Revoking the bot's collaborator access silently disables the review requirement **without touching any file** — no diff, no PR, no CODEOWNERS change. This is the quietest bypass in the entire package.
- **T4.d** An unparsable or unknown-owner CODEOWNERS line is ignored by GitHub rather than failing closed. Renaming the bot, or introducing a subtle syntax error, silently drops the rule while the file still visibly "contains" it.

*Routed to:* L3 §7 (policy hosted outside the repo and sha-pinned; `dismiss_stale_reviews_on_push`; self-approval prohibition) and NT-3.2/NT-3.3/NT-3.4.

### T5 — Ledger-write stoppage (the dead-detector attack)

The strongest attack on a detective control is not forging its record — it is stopping the record. Delete the App installation, revoke the storage credential, block egress from the host, or simply let the process die. Afterwards, an empty ledger is indistinguishable from a quiet, healthy repository. Rev1's Mitigation 3 writes only when it has something to write, so **silence is its success state**, which makes stoppage free and invisible.

Sub-cases: installation deletion (after which no further webhooks arrive at all, including the `installation.deleted` event's own successors), credential revocation, object-lock retention expiry, host loss, and quiet network egress failure.

*Routed to:* L2 §6.4 — heartbeat entries on a fixed cadence regardless of activity, an independent watcher that alarms on *absence*, and freshness-coupling so that a dark detector fails merges closed instead of silently disabling detection. This is the mechanism that converts L2 from purely detective to partially preventive.

### T6 — Trust-root compromise or nominal separation at L0

Reversing the rollout makes L0 the new single point of failure. If the enterprise-owner or trustee credential is compromised, every pin below it is editable again. Worse and more likely for a solo maintainer: the separation may be *nominal* — the same human, the same browser session, the same recovery email, the same phone. Technology can enforce a hierarchy; only an operational decision makes the hierarchy real.

*Routed to:* L0 §4.4 (credential-custody requirements) and NT-0.3, which tests the operational reality rather than the configuration.

### T7 — Supply chain into the verifier

The external checker has dependencies. A compromised transitive dependency in the verifier reproduces T2 without needing host access. Cross-reference: `follow-up-works/dep-supply-defense-2026-08-11.md` covers the general control set; the verifier-specific requirement here is a lockfile-pinned, minimal, vendored dependency surface and a reproducible build, so that the deterministic-recomputation property in §5.5 actually holds.

*Accepted with mitigation:* the recomputation property in §5.5 bounds impact — a compromised verifier that returns a verdict a third party cannot reproduce is detectable.

### T8 — Platform trust (explicitly accepted)

Every control here assumes GitHub's API and webhook deliveries report the truth about the repository's own state. A GitHub-side compromise, or a platform bug in ruleset evaluation, is outside what any configuration in this package can detect. This is stated as an accepted assumption rather than left implicit; the object-lock ledger in L2 is the only component whose non-repudiation does not depend on GitHub's privilege model, and even it depends on GitHub having reported honestly at capture time.

### Threat-to-layer routing summary

| Threat | Primary answer | Secondary | Residual after full rollout |
|---|---|---|---|
| T1.a / T1.b workflow + validator tampering | L1 (independent re-derivation) | L3 (review gate) | Low — check does not run repo code |
| T1.c ruleset edit / delete | L0 (enterprise pin) | L2 (event detection) | Low with L0; detective-only without it |
| T1.d bypass-actor addition | L2 (event detection) | L0 | **Medium — see `VL-2`, visibility is token-bounded** |
| T2 App-host compromise | L1 §5.5 (recomputation, KMS custody) | L2 (separate write credential) | Medium — bounded, not eliminated |
| T3.a webhook replay | L2 §6.3 (delivery-id + window) | — | Low |
| T3.b ref-TOCTOU | L1 §5.4 (`SB-1`–`SB-4`) | — | Low |
| T4 bot-policy compromise | L3 §7.4 (external, sha-pinned policy) | L1 (independent second gate) | Medium |
| T5 ledger stoppage | L2 §6.4 (dead-man switch) | — | Low, if freshness-coupled |
| T6 L0 nominal separation | L0 §4.4 + NT-0.3 | — | **High for a genuinely solo maintainer** |
| T7 verifier supply chain | §5.5 recomputation + pinned deps | — | Medium |
| T8 platform trust | — | — | Accepted |

## §3 — Rollout order, reversed (condition 1)

### 3.1 The rule

**Nothing is built below a trust root that does not yet exist.** L0 — a layer that outranks the sole admin — is decided and provisioned *first*. Only then are L1, L2 and L3 built, and each is pinned into L0 as it comes up.

### 3.2 Why rev1's order was unsound, stated plainly

Rev1 ordered: App → bot → ledger → GHEC. Under that order, at every point before the last step, the sole admin can remove every control in minutes: delete the App installation, remove the bot collaborator, edit the ruleset. Rev1 acknowledged this in its closing paragraph and shipped the order anyway. Three consequences:

1. **False assurance is worse than no control.** A `trust-anchor/external-canonical-check` that appears in a ruleset and turns green on every PR reads, to any observer including a future auditor, as an enforced guarantee. If it is removable by the party it constrains, it is evidence of process, not evidence of enforcement.
2. **Effort is spent before the deciding answer is known.** If the L0 feasibility answer turns out to be "no GHEC budget and no available trustee," the correct design is materially different — see §3.4 — and the engineering for L1–L3 would have been built against the wrong assumption.
3. **The pin target must precede the pin.** Condition 1 requires the App check to be pinned into the upper layer. An enterprise-level ruleset cannot require a check that has no owning App, and an App check pinned only into a repo-level ruleset is pinned into something the admin edits.

### 3.3 The pin-order paradox, resolved

Point 3 above cuts both ways: L0 must exist before L1 is trusted, yet the *specific* pin (context name plus `integration_id`) cannot be written until the App exists and its integration id is known. L0 is therefore split into three steps, two of which bracket L1:

| Step | Name | Creates | Depends on |
|---|---|---|---|
| **L0.a** | Feasibility decision | Nothing — a written owner decision with an answer of `GHEC` / `TRUSTEE` / `BOTH` / `NEITHER` | — |
| **L0.b** | Trust-root provisioning | The enterprise layer and/or the trustee's independent org-owner identity; an enterprise-owned ruleset that repo/org admins cannot edit | L0.a ≠ `NEITHER` |
| **L1** | External canonical check | The App, its host, its key custody; the App's `integration_id` becomes known here | L0.b |
| **L0.c** | Pin | The `integration_id`-pinned required-check entry, written **into the L0.b enterprise ruleset**, not only into `20321963` | L1 |
| **L2** | Continuous enforcement-state attestation | Webhook subscriptions, audit-log stream, WORM ledger, dead-man watcher | L0.b, L1 |
| **L3** | Review self-protection | Bot account, CODEOWNERS path set, `pull_request` ruleset rule, external policy service | L0.b, L2 |

Dependency DAG:

```
L0.a (decide)
  └─> L0.b (provision trust root)
        ├─> L1 (external check)          ──> L0.c (pin L1 into L0.b's ruleset)
        ├─> L2 (attestation + dead-man)  ──> freshness signal consumed by L1 and L3
        └─> L3 (review gate)             ──> consumes L1 verdict + L2 freshness
```

### 3.4 If L0.a answers `NEITHER`

This is the branch rev1 had no answer for, and it is the likeliest branch for a solo maintainer. If neither a GHEC enterprise layer nor a second human trustee is available, the honest design position is:

- **Do not claim enforcement.** L1–L3 may still be built — they retain real value as detection and as friction — but the package is labelled **detective-only** in this document's status table, in the repository's own documentation, and in any audit artifact derived from it.
- **No green check may be described as an enforcement guarantee.** Specifically, the `TRUST-ANCHOR-001` comment's claim that "the enforcement guarantee lives here" would need a companion note stating that the guarantee is anchored in a single identity. (That is a rev1-and-later documentation follow-up, not an edit this task performs.)
- **Prefer L2 first.** Under `NEITHER`, detection is the only category that works, so the build order collapses to L2 → L1 → L3, and L3's value drops sharply because T4.c (silent collaborator-access revocation) has no enforcer at all.
- **Re-ask on a fixed cadence.** The feasibility answer is a function of budget and available people, both of which change; NT-0.1 re-tests it quarterly rather than treating one "no" as permanent.

## §4 — L0: Trust root above the sole admin

*(Rev1's Mitigation 4, promoted from last to first per condition 1.)*

### 4.1 What it is

A layer of GitHub's privilege hierarchy, or of the human org, that the sole repo/org admin identity cannot edit. Two viable forms; they are not mutually exclusive, and `BOTH` is the strongest answer:

- **GHEC form.** An enterprise account with **enterprise-owned rulesets**, which sit above org and repo rulesets and can be configured so an org owner cannot edit or delete them. This is the layer into which L0.c pins the L1 check. Two adjacent enterprise capabilities matter here and both feed later layers: **enterprise-level 2FA/SSO policy**, and **audit-log streaming** to an external destination — which L2 depends on (see §6.2), making the audit-log half of condition 4 itself a reason L0 must come first.
- **Trustee form.** A second human with independent org-owner rights, their own hardware-key-gated credential, and no shared recovery path with the primary admin. Weaker technically than an enterprise ruleset (a second owner can still be socially engineered, and either owner can act unilaterally in many org operations) but stronger in one dimension no configuration reaches: a second human can *notice*, *ask*, and *refuse*.

### 4.2 Who enforces this against the sole admin

**GitHub's own privilege hierarchy — enterprise owner outranks org owner — but only to the degree that the enterprise-owner credential is genuinely operated as a distinct identity.** If the same human, on the same machine, in the same browser session, holds both, the enforcement is nominal and the honest answer becomes: *nobody*. In the trustee form the enforcer is another person, whose independence is a social fact, not a technical one, and degrades the moment credentials or recovery paths are shared. NT-0.3 exists specifically because this line cannot be verified by reading configuration.

### 4.3 What it closes and what it does not

Closes: T1.c and T1.d become preventable rather than merely detectable — an enterprise ruleset requiring `trust-anchor/external-canonical-check` at a pinned `integration_id` cannot be relaxed from the repo or org level. It also removes the "just delete the required-check entry" bypass that rev1 left open across all of its first three mitigations.

Does not close: T6 (compromise or nominal separation of the root itself), T8. Does not, by itself, verify anything about the repository's content — L0 is an authority layer, not a check.

### 4.4 Credential-custody requirements (answering T6)

These are conditions on the *human process*, and none is verifiable by API:

- The enterprise-owner (or trustee) credential is gated by a hardware security key, not TOTP alone.
- It is used exclusively for policy changes — never for day-to-day repository work, never for CI, never stored in any password manager entry shared with the org-owner identity.
- It has a distinct recovery email and distinct recovery phone from the org-owner identity. A shared recovery path silently collapses the hierarchy.
- Its use is itself logged into the L2 ledger, so "the enterprise credential was used" is a visible event rather than a private one.

### 4.5 Negative tests

**NT-0.1 — Is the trust root feasible at all?**
*Question:* Can a layer above the sole admin actually be obtained?
*Environment:* Owner decision, no GitHub resource.
*Action:* Evaluate GHEC trial availability and cost against budget; evaluate trustee availability against real candidates.
*PASS:* A written answer of `GHEC`, `TRUSTEE`, or `BOTH`, with the credential-custody plan in §4.4 accepted.
*FAIL:* `NEITHER`, or an answer without a custody plan — which routes to §3.4 and downgrades the whole package to detective-only.
*Evidence:* An owner decision record with a date.
*Cadence:* Once at L0.a, then quarterly (budget and people change).
*On FAIL:* §3.4 applies; the package's status table is rewritten to say "detective-only", and no document may describe any check as enforced.

**NT-0.2 — Can the sole admin edit or delete the enterprise-owned ruleset?**
*Question:* Is the pin actually above the admin?
*Environment:* Rehearsal repository `RH` under the same enterprise, configured identically. Destructive.
*Precondition:* L0.b provisioned; an enterprise ruleset applies to `RH`.
*Action:* Authenticated **as the sole admin identity** (org-owner rights, not enterprise-owner), attempt in order: (a) edit the enterprise ruleset's required-check list via API; (b) delete the enterprise ruleset; (c) create a repo-level ruleset on `RH` that contradicts it; (d) merge a change to `RH` that would violate the enterprise rule.
*PASS:* (a) and (b) return HTTP 403 or the equivalent UI denial; (c) may succeed but does not weaken the enterprise rule; (d) is blocked.
*FAIL:* Any of (a), (b), or (d) succeeds. A silent partial success — the API accepting the call but the rule remaining — is also a FAIL until explained, because it indicates the tester is not testing what they think.
*Evidence:* Raw HTTP status codes and response bodies, plus the enterprise ruleset JSON before and after, hashed into the L2 ledger.
*Cadence:* At L0.b commissioning, then quarterly, and after any GitHub enterprise-plan change.
*On FAIL:* L0 is not a trust root. Every "pinned" claim in §5–§7 reverts to "removable by the sole admin" and the package is detective-only.

**NT-0.3 — Is the separation real, or nominal? (answering T6)**
*Question:* Can the sole admin reach the enterprise/trustee credential from their normal working context?
*Environment:* Operational audit; no destructive action against production.
*Action:* From the admin's day-to-day machine and browser profile, attempt to authenticate to the enterprise-owner (or trustee) account using only credentials, sessions, password-manager entries and recovery paths reachable from that context — including "forgot password" against the recovery email and phone on file.
*PASS:* Authentication is impossible without a physically separate factor the admin does not carry in their normal working context, **and** the recovery paths do not converge on an identity the admin controls.
*FAIL:* Successful authentication, or a recovery path that terminates at an admin-controlled mailbox or phone number.
*Evidence:* A signed attestation from whoever ran the exercise, recording each path tried and where it terminated.
*Cadence:* At commissioning, then semi-annually, and after any change to recovery contacts.
*On FAIL:* L0 is nominal. §4.2's honest answer becomes "nobody", and the package is detective-only regardless of what the configuration says.

### 4.6 Owner vs automatable, cost

Entirely owner-driven: trial signup, billing, enterprise policy configuration, credential custody, and the trustee conversation. Nothing is delegable to an automated worker. GHEC is a recurring per-seat cost after the trial window; **the current price must be confirmed at signup rather than taken from any figure written in this document** — published enterprise pricing changes, and this document does not treat any number as fact. The trustee form has no license cost and a real human cost.

## §5 — L1: External canonical check, pinned by App identity

*(Rev1's Mitigation 1, now second and now pinned into L0.)*

### 5.1 What it is

A GitHub App — call it `deckent-trust-anchor-verifier` — registered under an account distinct from `VerhexIO`, installed only on the target repository, whose independently hosted handler re-derives the `TRUST-ANCHOR-001` fact from its own full-history clone and posts a check run named `trust-anchor/external-canonical-check`.

Permissions, corrected from rev1:

| Permission | Rev1 | Rev2 | Why |
|---|---|---|---|
| `contents` | read | read | Clone and read history |
| `checks` | write | write | Post the check run |
| `metadata` | read | read | Baseline requirement |
| `administration` | *(absent)* | **read** | **Rev1's set cannot read the rulesets API, so its own Mitigation 3 could not have worked. See `VL-1`.** |
| `pull_requests` | *(absent)* | read | Bind checks to the correct head sha (`SB-2`) |
| `contents: write`, `administration: write` | — | **never** | The App must not be able to change what it verifies |

### 5.2 Who enforces this against the sole admin

**The App's separate key custody plus L0's enterprise-ruleset pin — in that combination and no other.** The key custody means the admin cannot post this check's verdict; the L0 pin means the admin cannot remove the requirement to have it. **Without L0, the honest answer is: nobody.** The admin cannot forge the check, but can delete the App installation or drop the check from ruleset `20321963` in under a minute, and rev1's ordering would have left exactly that state standing as the steady state for however long L0 took to arrive.

### 5.3 `INV-PIN` — pinning by `integration_id` (condition 3)

**Invariant `INV-PIN`:** the required-status-check entry for `trust-anchor/external-canonical-check` carries `integration_id: <the new App's id>`, where that id is neither null nor `15368`, and the entry is present in the **L0.b enterprise ruleset**, with the repo-level entry in `20321963` treated as a convenience duplicate rather than the authority.

Why a name-only pin is a real vulnerability, not a stylistic preference: GitHub matches required status checks by context string. If the entry omits `integration_id`, *any* actor able to publish a status with that exact context satisfies it — and the sole admin controls `.github/workflows/**`, so they can author a workflow step that posts a green `trust-anchor/external-canonical-check` status from the GitHub Actions app (`15368`). The entire external check is then satisfied by a three-line in-repo workflow edit, with no App compromise, no ruleset edit, and nothing visibly wrong in the required-checks list. Rev1's Mitigation 1 specified the entry by name only and was therefore defeatable by the very tamper path (`T1.a`, editing a workflow file) it was designed to close. This is the single most concrete correction in this revision.

Two supporting requirements:

- `integration_id` is captured **from the App's own installation metadata** at commissioning and recorded in the L2 ledger, so a later mismatch is detectable rather than arguable.
- L2 asserts `INV-PIN` on every enforcement-state evaluation (§6.3), not only at commissioning. A pin that is correct on day one and null on day ninety must alarm.

### 5.4 `SB-1`–`SB-4` — sha-binding rules (answering T3.b)

- **`SB-1`** The handler resolves the target commit **exclusively** from the immutable sha in the event payload (`after` for push, `pull_request.head.sha` for PR events). It never resolves a symbolic ref, never uses `HEAD`, never re-queries "the current tip".
- **`SB-2`** After fetching, the handler verifies that the fetched object's own hash equals the payload sha before performing any check logic.
- **`SB-3`** The check run is posted against that same sha and no other. The attestation body records the sha, so attribution is auditable after the fact.
- **`SB-4`** If the payload sha is unreachable at fetch time — deleted branch, garbage-collected PR head, network failure — the handler posts an explicit failing or `action_required` conclusion. **"Could not verify" and "verified successfully" must never share an outcome, and a skip is not an acceptable third state**, because a skipped required check on a strict ruleset is indistinguishable from a check that has not run yet.

The existing `non_fast_forward` rule on `main` and `strict_required_status_checks_policy: true` narrow this window for the default branch; neither applies to pull-request head refs, which is precisely where `SB-1` earns its place.

### 5.5 Host-compromise containment (answering T2 and T7)

Rev1 treated "hosted outside GitHub" as the security property. Four requirements make that claim survive T2:

- **`HC-1` Deterministic, publicly recomputable verdicts.** The attestation records every input — repository, commit sha, receipt id, resolved registering-commit sha, resolved baseline sha, verifier version and its dependency lock digest — so that any third party with read access to public git history can recompute the verdict independently. A compromised host can lie, but it cannot make its lie reproducible. This converts T2 from an undetectable forgery into a detectable disagreement.
- **`HC-2` Non-exportable key custody.** The App private key lives in a KMS or HSM as a non-exportable key; the host holds signing *permission*, not the key material. A host compromise then ends when the permission is revoked, rather than persisting for the key's lifetime.
- **`HC-3` Dual independent verifiers.** Two implementations, ideally by different authors and on different hosts, both posting attestations. Agreement is required; **disagreement is itself an alarm**, not a tiebreak to be resolved by picking the greener answer.
- **`HC-4` Write-only ledger credential, physically absent from the checker host.** Rev1 explicitly reused the App's identity and host for the nightly ledger, so one compromise took both. In rev2 the ledger's write credential grants object-create only, never delete or overwrite, and lives on separate infrastructure from the verifier. Cross-reference `follow-up-works/dep-supply-defense-2026-08-11.md` for the dependency-pinning half of `HC-1`.

### 5.6 What it closes

- **T1.a** (shallow-clone regression) is closed structurally: the external verifier always fetches full history under its own control, so removing `fetch-depth: 0` from `.github/workflows/cross-platform-e2e.yml` no longer affects this check's validity.
- **T1.b** (weakening `scripts/lint-master-plan.mjs`) is closed because the external check is a separate implementation, not an invocation of the in-repo script.
- **T3.b** is closed by `SB-1`–`SB-4`.
- Not closed by L1 alone: T1.c/T1.d (needs L0 + L2), T2 (bounded by §5.5, not eliminated).

### 5.7 Negative tests

**NT-1.1 — Can the sole admin remove this check?**
*Question:* Is the requirement itself removable?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, attempt: (a) delete the App installation from `RH`; (b) remove `trust-anchor/external-canonical-check` from the repo-level ruleset; (c) merge a PR to `RH` that would fail the external check.
*PASS:* (a) and (b) may succeed at the repo level — that is expected and is precisely why L0 exists — but (c) is still blocked by the enterprise-ruleset requirement, and both (a) and (b) surface as L2 alarms within the D-SLO of §8.2.
*FAIL:* (c) merges. That means the pin is not actually held at L0 and L1 is decorative.
*Evidence:* Merge attempt result, the enterprise ruleset JSON, and the corresponding L2 ledger entries.
*Cadence:* At L0.c commissioning, then quarterly.

**NT-1.2 — Can a green verdict be forged by name? (condition 3)**
*Question:* Does `INV-PIN` actually bind identity?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, add a workflow to `RH` that posts a successful status with context exactly `trust-anchor/external-canonical-check`, then open a PR whose content would fail the real external check and attempt to merge.
*PASS:* The merge remains blocked — GitHub does not accept the Actions-app status (`15368`) as satisfying an entry pinned to the verifier App's `integration_id`. Additionally, L2 raises an anomaly for a same-context status from an unexpected integration.
*FAIL:* The merge proceeds. `INV-PIN` is absent, misconfigured, or not being enforced at the layer that matters.
*Evidence:* The forged status payload with its integration id, the merge-attempt result, and the ruleset entry showing the pinned id.
*Cadence:* At commissioning, then quarterly, and after **any** ruleset edit — this test is the direct regression guard for condition 3.

**NT-1.3 — Does a moving ref defeat the check? (answering T3.b)**
*Question:* Is the verdict bound to the sha it claims?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* Open a PR at sha `A` (verifier passes), then force-push the head to sha `B` (content that must fail) while the check run for `A` is in flight or already green; attempt to merge.
*PASS:* The merge is blocked — the green run is attributed to `A` only, and `B` has no passing run. The handler, if it observes `B`, evaluates `B` independently.
*FAIL:* The merge proceeds on `A`'s green check, or the handler re-posts a verdict for `B` without re-deriving it.
*Evidence:* Both check runs with their `head_sha` fields, the force-push event, and the merge-attempt result.
*Cadence:* At commissioning, then quarterly, and after any handler change touching ref resolution.

**NT-1.4 — Is a compromised host's verdict detectable? (answering T2)**
*Question:* Does `HC-1` hold in practice?
*Environment:* Rehearsal repository `RH`, plus an independent recomputation performed on a machine unrelated to either verifier host.
*Action:* Have verifier A post a deliberately incorrect green attestation for a commit that should fail. Independently recompute from the attestation's recorded inputs. Confirm verifier B (`HC-3`) disagrees.
*PASS:* Recomputation contradicts the attestation, and the A/B disagreement raises an alarm rather than being silently resolved in favour of the passing verdict.
*FAIL:* Recomputation is impossible because the attestation omits inputs, or disagreement is auto-resolved toward "pass", or no second verifier exists.
*Evidence:* The attestation body, the recomputation transcript, and the disagreement alarm.
*Cadence:* At commissioning, then semi-annually.

### 5.8 Owner vs automatable, cost

Owner-only: App registration, account separation, key provisioning into KMS/HSM, and the L0.c pin. Automatable: the handler, the re-derived history check, the attestation format, and the recomputation tool for `HC-1`. Cost: low-frequency event-triggered compute on a small persistent VM — a full `git fetch` workload favours a persistent VM over edge/serverless platforms with tight egress limits — plus a second host for `HC-3` and KMS key charges. No GHEC dependency for L1 itself, though its *pin* depends on L0.

## §6 — L2: Continuous enforcement-state attestation (condition 4)

*(Rev1's Mitigation 3, rebuilt from nightly polling to event-driven, and promoted above the review gate because L3 consumes its freshness signal.)*

### 6.1 The attack that killed the polling design

Rev1 proposed a nightly snapshot of ruleset `20321963`. Against a sole admin, that design has a hole large enough to drive the entire threat through:

```
03:00:00  admin edits ruleset 20321963 — removes a required check
03:00:30  admin merges the tampering PR to main
03:01:00  admin restores the ruleset to its exact prior state
04:00:00  nightly snapshot runs — byte-identical to last night
```

The ledger records two identical states, twelve hours apart, with a successful merge between them and no anomaly. The tampering merge is now in `main` and the record affirmatively shows a healthy configuration. **A sampled control cannot detect a transient state change; it can only detect a persistent one.** Since the loosen-merge-restore sequence takes under a minute and is entirely within the sole admin's authority, sampling is the wrong instrument by construction — no sampling interval short of continuous fixes it.

### 6.2 Event-driven design

Two independent event sources, deliberately not sharing a failure mode:

**Source A — App webhooks.** The App subscribes to at least: `repository_ruleset` (created, edited, deleted), `branch_protection_rule`, `member` and `membership` (collaborator and permission changes — this is the only signal for T4.c), `repository` (visibility, transfer, default-branch change), `push` (with `after` sha), `pull_request` (opened, synchronize, closed/merged), `pull_request_review`, `check_suite`, `installation` and `installation_repositories` (the App's own removal), and `github_app_authorization`.

**Source B — enterprise/org audit-log streaming.** Streamed to an external destination under L0's control. This is a GitHub-side record with a different production path from webhooks, so a webhook outage does not blind both, and it captures actor identity for administrative actions more reliably than repo-scoped webhooks do. **Audit-log streaming is an enterprise capability — which is a second, independent reason condition 1's reversal is correct: half of condition 4 is not implementable before L0.b exists.**

**Source C (backstop only) — periodic full-state poll.** Retained from rev1, demoted to a reconciliation role at a modest interval. Its purpose is no longer detection; it is to catch *missed events* by comparing the replayed state (§6.3) against ground truth. A divergence between replayed and polled state is itself an alarm, because it means the event stream lost something.

### 6.3 `EnforcementState(t)` — the replayed fold

The ledger does not store samples. It stores an ordered, hash-chained event log, and derives enforcement state as a fold over that log:

- Each entry records: capture timestamp, event type, `X-GitHub-Delivery` id, actor, the full relevant payload, the payload's SHA-256, and the previous entry's hash. Hash-chaining makes a retroactive edit detectable even in a non-WORM mirror.
- **Replay defence (answering T3.a):** the handler persists every `X-GitHub-Delivery` id and rejects repeats; it rejects deliveries whose timestamp falls outside a bounded freshness window; and it verifies the HMAC signature — while recording that the signature proves authorship, not freshness. The webhook secret is stored with the App's credentials and **never** in this repository's Actions secrets, since anything readable by the sole admin is forgeable by the sole admin.
- **`EnforcementState(t)`** is the fold of all ruleset/protection events up to time `t`. Every merge into `main` is annotated with the enforcement state *at its own merge timestamp*, reconstructed from the log rather than from any sample. The 03:00 attack above then appears as: `ruleset weakened @03:00:00` → `merge under weakened state @03:00:30` → `ruleset restored @03:01:00`, with the merge permanently flagged.
- **Continuous invariant assertions**, evaluated on every state change, not only at commissioning: `INV-PIN` (§5.3) holds; `enforcement == "active"`; `bypass_actors == []`; the four existing contexts plus `trust-anchor/external-canonical-check` are all present; `strict_required_status_checks_policy == true`; `non_fast_forward` and `deletion` rules present; the bot retains write access (T4.c); the CODEOWNERS path set of §7.2 is intact and parses.
- **Storage:** primary is an object store with immutability locking in compliance mode, written with the `HC-4` write-only credential, denying delete and overwrite to every principal including the account root for the retention period. Secondary is a git mirror outside `VerhexIO` with force-push and deletion disabled. The primary is the only component in this entire package whose non-repudiation does not rest on GitHub's privilege model.

### 6.4 Dead-man switch (answering T5)

**Silence is a FAIL, never a PASS.** Three mechanisms:

- **`DM-1` Heartbeat.** The ledger receives a signed heartbeat entry on a fixed short cadence *regardless of activity*, asserting "detector alive, last delivery id `N`, invariants held at `t`". A healthy quiet day is therefore indistinguishable from a busy day in terms of ledger *liveness*, which is exactly the property stoppage attacks exploit when it is absent.
- **`DM-2` Independent watcher.** A watcher that does not run on the verifier host — ideally operated by the L0 trustee, or a commodity external uptime service — alarms on *absence* of a heartbeat beyond tolerance. The watcher's alarm destination must not be an inbox the sole admin can silently delete from; where that is unavoidable for a solo maintainer, it is recorded as a named residual (see §9).
- **`DM-3` Freshness coupling — the mechanism that makes L2 partly preventive.** The L1 check consults ledger freshness and **fails closed** when the last heartbeat is older than tolerance. Stopping the detector therefore stops merges instead of silently disabling detection. This inverts the incentive: an attacker who kills the ledger to hide their tracks blocks the very merge they were trying to land. The tolerance must exceed normal maintenance windows or it becomes an availability hazard; the trade-off is stated deliberately — **this design prefers a blocked merge to an unobserved one.**

### 6.5 `VL-1`–`VL-5` — `bypass_actors` visibility limits (condition 4, explicit)

The evidence file records `"bypass_actors": []` and `"current_user_can_bypass": "never"`. Both are weaker facts than they appear, and the limits must be documented rather than assumed away:

- **`VL-1` — Permission-bounded reads.** Reading a repository's rulesets, including `bypass_actors`, requires administration-level read. **Rev1's App permission set (`contents: read`, `checks: write`, `metadata: read`) cannot perform this read at all**, so rev1's own Mitigation 3 was not implementable as specified. Rev2 adds `administration: read` (§5.1). A token without it does not see an empty `bypass_actors`; it sees nothing, and must not report that absence as "empty".
- **`VL-2` — Layer-bounded visibility.** A repo-scoped read returns repo-level ruleset state. Bypass grants configured at the **org or enterprise layer**, or inherited from org-level rulesets applying to this repository, may not appear in the repo-scoped payload. An empty repo-level `bypass_actors` therefore does not prove that no actor can bypass. Complete coverage requires enumerating rulesets at every layer that applies to the ref — another dependency on L0 credentials.
- **`VL-3` — `current_user_can_bypass` is observer-relative.** The field describes the *token that made the request*, not the admin. The evidence file's `"never"` was captured under whatever identity ran that capture; **it is not evidence that the sole admin cannot bypass**, and must never be cited as such. Bypass capability must be asserted from the `bypass_actors` array itself, read with sufficient permission (`VL-1`) at every applicable layer (`VL-2`).
- **`VL-4` — Diff granularity.** The `repository_ruleset` `edited` webhook carries a changes object whose granularity is not guaranteed to enumerate `bypass_actors` membership changes field-by-field. The handler must therefore treat any `edited` event as "re-read full state and re-assert all invariants", never as "apply the reported diff".
- **`VL-5` — Deletion blindness.** If a ruleset is deleted, subsequent reads return nothing rather than a weakened state; and if the App installation is removed first, no deletion event is delivered at all. Only `DM-1`/`DM-2` distinguish "nothing to report" from "no longer able to report".

### 6.6 Who enforces this against the sole admin

**The storage vendor's object-lock retention, enforced against every account principal including the root — plus, for prevention rather than detection, `DM-3`'s freshness coupling.** The admin can still weaken the ruleset; what they cannot do is rewrite an already-locked entry recording that they did, or make the detector's silence look like health. **For the ledger's *contents*, the enforcer is the storage vendor. For the ledger's *continuity*, the enforcer is `DM-3` — and if `DM-3` is not implemented, the honest answer is: nobody, because a sole admin can stop a detector they administer.**

### 6.7 Negative tests

**NT-2.1 — Does the transient loosen-merge-restore attack get caught? (condition 4, the core test)**
*Question:* Does event-driven detection actually beat the sampling hole?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, execute the §6.1 sequence end to end: weaken the ruleset, merge a marked commit, restore the ruleset — the whole sequence inside 90 seconds.
*PASS:* The ledger contains three ordered, hash-chained entries; `EnforcementState(t)` at the merge timestamp shows the weakened state; the merge is permanently flagged as "merged under degraded enforcement"; an alarm fires within the D-SLO of §8.2. **Restoring the ruleset does not clear the flag** — this is the property under test.
*FAIL:* Any of: the ledger shows only the final restored state; the merge is not annotated; the alarm fires only after the restore and describes the state as healthy; the flag clears on restore.
*Evidence:* The three ledger entries with their delivery ids and hash chain, the annotated merge record, and the alarm with its timestamp.
*Cadence:* At commissioning, then monthly. This is the highest-value recurring test in the suite.

**NT-2.2 — Is a bypass actor visible? (condition 4, `VL-*`)**
*Question:* Do the documented visibility limits match reality?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, add a bypass actor to the repo-level ruleset on `RH`; separately, add one at the org layer if L0 permits. Observe what the App's read and the webhook payload each report.
*PASS:* The repo-level addition appears in the ledger with the actor named, within the D-SLO; **and** the org-level case is documented against `VL-2` — either it is visible (limit narrower than stated) or it is not (limit confirmed). Either outcome is a PASS provided §6.5 is updated to match observed behaviour.
*FAIL:* The addition is invisible at a layer §6.5 claims is covered, or the handler reports `bypass_actors: []` when its token lacked permission to read the field (`VL-1` violation — reporting absence as emptiness).
*Evidence:* Raw API responses including status codes, the webhook payload, and the ledger entry.
*Cadence:* At commissioning, then quarterly.

**NT-2.3 — Does a replayed delivery corrupt the record? (answering T3.a)**
*Question:* Is the ledger replay-resistant?
*Environment:* Rehearsal environment against the rehearsal handler.
*Action:* Capture a genuine healthy `repository_ruleset` delivery with its valid signature; re-deliver it verbatim after a real weakening event; separately re-deliver a stale `check_suite` delivery for an old commit.
*PASS:* Both are rejected on duplicate delivery id or freshness window; the rejection is itself logged; `EnforcementState(t)` is unchanged by the replay.
*FAIL:* Either replay is accepted, mutates state, or overwrites a truthful entry with a stale healthy one.
*Evidence:* Handler logs showing the rejection reason, and the ledger diff (which must be rejection entries only).
*Cadence:* At commissioning, then quarterly, and after any handler change.

**NT-2.4 — Can the sole admin stop the ledger without anyone noticing? (answering T5 — the dead-man test)**
*Question:* Does silence fail loudly?
*Environment:* Rehearsal repository `RH` plus its rehearsal ledger. Destructive.
*Action:* As the sole admin, in separate runs: (a) delete the App installation from `RH`; (b) revoke the ledger write credential; (c) block the host's egress to the ledger endpoint; (d) stop the handler process.
*PASS:* In every case the watcher (`DM-2`) alarms on missing heartbeat within tolerance, **and** `DM-3` causes the L1 check to fail closed so merges on `RH` are blocked while the detector is dark.
*FAIL:* Any case where the alarm does not fire, or where merges continue while the detector is dark. A dark detector that permits merges is the single most dangerous state in this package, because every downstream artifact keeps reporting green.
*Evidence:* Watcher alarm records with timestamps, a blocked-merge attempt, and the heartbeat gap in the ledger.
*Cadence:* At commissioning, then monthly.

**NT-2.5 — Does the ledger resist retroactive edits?**
*Question:* Is the WORM claim real?
*Environment:* The rehearsal ledger bucket.
*Action:* Using every credential available to the sole admin including the storage account root, attempt to overwrite and then delete a locked ledger object within its retention period. Separately, attempt a force-push to the secondary git mirror.
*PASS:* All attempts are denied by the storage vendor and by mirror branch protection; the hash chain over the surrounding entries still verifies.
*FAIL:* Any object is mutated or deleted, or the retention policy proves to be governance-mode (owner-overridable) rather than compliance-mode.
*Evidence:* Denied-request logs with status codes, the retention configuration, and a chain-verification transcript.
*Cadence:* At commissioning, then quarterly, and before any retention-period expiry.

### 6.8 Owner vs automatable, cost

Owner: provisioning the object-lock bucket and its compliance-mode retention policy (a billing/account-level action), enabling audit-log streaming at the enterprise layer, and choosing the `DM-2` watcher's alarm destination. Automatable: the handler, hash chaining, invariant assertions, the `EnforcementState` fold, the heartbeat, and the reconciliation poll. Cost: event-volume-scaled object writes of a few kilobytes each, plus the watcher; still small in absolute terms, and materially higher than rev1's nightly single-object write. The dominant cost remains one-time engineering.

## §7 — L3: Review self-protection (condition 2)

*(Rev1's Mitigation 2, moved last because its policy service consumes L2's freshness signal, and materially widened.)*

### 7.1 What it is

A dedicated machine account — `deckent-ci-guardian-bot` — with its own email and its own 2FA, added as a repository collaborator with `Write` (never `Admin`), named as required code owner for a protected path set, with `require_code_owner_review` made mandatory by a `pull_request` ruleset rule, and with its approve/reject decision made by a policy service hosted outside this repository.

### 7.2 The protected path set, including CODEOWNERS itself (condition 2)

Rev1 protected `.github/workflows/`, `scripts/lint-master-plan.mjs`, `scripts/lint-mcp-instructions.mjs`, and `tests/scripts/lint-master-plan.test.ts` — and left the file that defines those protections unprotected. The resulting bypass is two PRs long: PR 1 edits `.github/CODEOWNERS` to delete the bot lines, self-approved because `.github/` is owned by the admin; PR 2 then tampers freely. Condition 2 closes exactly this.

| Id | Path | Why |
|---|---|---|
| `P1` | `.github/CODEOWNERS` | **Self-protection.** Without it the whole set is one self-approved PR from deletion. |
| `P2` | `CODEOWNERS` (repository root) | GitHub resolves CODEOWNERS from `.github/`, then root, then `docs/`. Deleting `P1` promotes a pre-planted root file. Protecting the path denies the pre-plant. |
| `P3` | `docs/CODEOWNERS` | Same precedence hole one level lower; `docs/` is admin-owned today. |
| `P4` | `.github/workflows/` | The `TRUST-ANCHOR-001` precondition (`fetch-depth: 0`) and the required-check job definitions (T1.a). |
| `P5` | `scripts/lint-master-plan.mjs` | The validator itself — the `FAIL-CLOSED`-to-`WARN` path (T1.b). |
| `P6` | `scripts/lint-mcp-instructions.mjs` | Second validator, carried forward from rev1. |
| `P7` | `tests/scripts/lint-master-plan.test.ts` | Weakening the test that proves the validator fails closed is equivalent to weakening the validator. |

Two mechanical requirements rev1 omitted:

- **Ordering.** GitHub CODEOWNERS resolution is **last-match-wins**. The bot entries must appear *after* the existing `* @alperensartacoglu` default and after the existing `.github/` and `docs/` entries, or the broad admin-only rules silently win and the bot is never required. This is a file-ordering bug that would produce a config that looks correct and enforces nothing.
- **Parse-failure semantics (T4.d).** GitHub ignores unknown or unparsable owners rather than failing closed. A renamed bot or a subtle syntax error silently drops the rule while the file still visibly contains it. L2 therefore asserts CODEOWNERS validity as a continuous invariant (§6.3), and NT-3.3 tests it directly.

### 7.3 Ruleset rule required

A `pull_request` rule on the same branch target with `required_approving_review_count: 1`, `require_code_owner_review: true`, and **`dismiss_stale_reviews_on_push: true`** (answering T4.a). The evidence ruleset `20321963` contains no `pull_request` rule at all today, so all three of these are new state, not adjustments. Since rulesets scope by branch and tag rather than by file path, CODEOWNERS remains the actual path-scoping mechanism; the ruleset only turns code-owner review from optional into required. Per condition 1, this rule belongs in the L0 enterprise ruleset; a repo-level copy is a convenience duplicate.

### 7.4 Policy-service requirements (answering T4)

- **`BP-1` Hosted outside this repository.** The approval policy must not be an in-repo GitHub Action. If it is, the reviewed party edits the reviewer's judgement, and the mitigation is a rubber stamp. It runs on the L1 host or its own infrastructure, under a credential that is not storable in this repository's secrets.
- **`BP-2` Sha-pinned policy.** The policy's version is recorded in every approval it issues, so an approval can be traced to the exact logic that produced it.
- **`BP-3` No self-approval.** The bot must refuse to approve any pull request it authored.
- **`BP-4` Freshness-gated.** The bot refuses to approve while L2's heartbeat is stale — a dark detector must not be paired with an automated approver. This is why L3 comes after L2.
- **`BP-5` What the policy inspects,** at minimum: removal or weakening of `fetch-depth: 0` in any `P4` file; removal or renaming of a required-check job; any change converting a fail-closed branch to a warn-and-pass branch in `P5`/`P6`; any change to `P1`/`P2`/`P3` that removes, reorders below a broader rule, or renames a protected-path owner; and any deletion in `P7`.

### 7.5 Who enforces this against the sole admin

**The ruleset's `require_code_owner_review` rule — which is itself editable by the sole admin unless it lives in the L0 enterprise ruleset.** Absent L0, this control is self-referential and the honest answer is *nobody*. Even with L0, one gap has no configuration-level enforcer at all: **T4.c — the admin can revoke the bot's collaborator write access, which silently invalidates it as a code owner with no file change, no PR, and no diff.** Nothing in GitHub's model prevents an admin from managing collaborators. The only defence is detection (L2's `member`/`membership` events plus the continuous "bot retains write access" invariant) coupled to `DM-3`-style fail-closed behaviour. **This is stated as a limit, not solved.**

### 7.6 Negative tests

**NT-3.1 — Can the sole admin delete the CODEOWNERS protection? (condition 2)**
*Question:* Does self-protection hold?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, open a PR that removes the bot lines from `.github/CODEOWNERS`, approve it with the admin identity only, and attempt to merge.
*PASS:* The merge is blocked pending the bot's code-owner review, because `P1` names the bot as owner of the CODEOWNERS file itself; the policy service (`BP-5`) rejects the diff; the attempt appears in the L2 ledger.
*FAIL:* The merge succeeds on the admin's approval alone. That is rev1's two-PR bypass, still open.
*Evidence:* The blocked merge, the required-reviewers list shown by GitHub for the PR, and the ledger entry.
*Cadence:* At commissioning, then quarterly, and after any CODEOWNERS edit.

**NT-3.2 — Can the review requirement be removed without touching a file? (answering T4.c)**
*Question:* Is the quietest bypass detected?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, revoke the bot's collaborator write access on `RH` — changing no file — then open a PR touching `P4` and attempt to merge with only the admin's approval.
*PASS:* L2 alarms on the `member`/`membership` event and on the "bot retains write access" invariant within the D-SLO; the merge is blocked because the required-review rule is pinned at L0 and cannot be satisfied by an invalid code owner, or — if GitHub's behaviour is to silently drop the requirement — `DM-3`-style coupling blocks the merge instead.
*FAIL:* The merge proceeds with no alarm. Record which of the two PASS mechanisms actually held; if neither did, this is the package's quietest hole and must be recorded as an open residual in §9.
*Evidence:* The membership event, the invariant alarm, and the merge-attempt result.
*Cadence:* At commissioning, then quarterly.

**NT-3.3 — Does a corrupted CODEOWNERS silently disable the rule? (answering T4.d)**
*Question:* Does the config fail closed or fail quiet?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* In separate runs: (a) rename the bot in `.github/CODEOWNERS` to a non-existent account; (b) introduce a syntax error in the bot's line; (c) move the bot entries *above* the `* @alperensartacoglu` default. In each case attempt a `P4` change with only the admin's approval.
*PASS:* Every case raises an L2 CODEOWNERS-validity alarm, and merges of protected paths are blocked or flagged. Case (c) specifically must alarm on ordering, since last-match-wins makes it a silent disable.
*FAIL:* Any case where the requirement silently evaporates with no alarm and the merge proceeds.
*Evidence:* The CODEOWNERS diff, GitHub's own required-reviewers display for the PR, the alarm, and the merge result.
*Cadence:* At commissioning, then quarterly.

**NT-3.4 — Can the reviewed party edit the reviewer? (answering T4)**
*Question:* Does `BP-1` hold?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* As the sole admin, attempt to (a) locate the approval policy inside the repository and edit it to approve everything; (b) approve a `P5` diff with a stale bot review carried over from an earlier push; (c) have the bot approve a PR the bot itself authored.
*PASS:* (a) finds no in-repo policy to edit — the policy is external and sha-pinned; (b) is blocked by `dismiss_stale_reviews_on_push`; (c) is refused by `BP-3`.
*FAIL:* Any of the three succeeds.
*Evidence:* The absence of policy source in-repo, the dismissed-review record, and the refused self-approval.
*Cadence:* At commissioning, then quarterly.

**NT-3.5 — Does a dark detector stop the approver? (`BP-4`)**
*Question:* Is the freshness gate wired?
*Environment:* Rehearsal repository `RH`. Destructive.
*Action:* Stop the L2 heartbeat (reuse NT-2.4's setup), then open a benign `P4` PR the policy would normally approve.
*PASS:* The bot refuses to approve while the heartbeat is stale, stating the reason.
*FAIL:* The bot approves while detection is dark.
*Evidence:* The bot's refusal comment and the heartbeat gap.
*Cadence:* At commissioning, then quarterly.

### 7.7 Owner vs automatable, cost

Owner: creating and securing the bot account (2FA, credential storage, granting `Write`) — a trust-establishing action only a human admin can perform — and the L0-level ruleset rule. Automatable: the diff policy, the CODEOWNERS ordering/validity assertions, and the freshness gate. Cost: $0 direct — machine accounts are free — plus the external host for `BP-1`, shared with L1.

## §8 — The negative-test suite (condition 5)

### 8.1 How these tests are run without breaking production

Condition 5 says *live*. Most of these tests are, by nature, "weaken production and see what happens", which is not acceptable against `main`. Three test classes resolve this:

- **Class D — live destructive, rehearsal target.** Run for real against a dedicated rehearsal repository `RH`, configured identically to the production repository and covered by the same enterprise ruleset, App installation, bot, and ledger. `RH` is *specified* here, not created — creating it is a GitHub resource action and therefore out of scope for this document. Most tests are Class D.
- **Class S — live safe, production target.** Run against production where the expected outcome is a *denial*, so a PASS changes nothing: e.g. the bot attempting an administration-scoped API call and receiving 403, or a merge attempt that must be blocked.
- **Class O — observation, production target.** Assert invariants over live state and live events without attempting any mutation: `INV-PIN` present, `enforcement == "active"`, heartbeat fresh, CODEOWNERS parses and orders correctly.

A test that cannot be assigned to a class is recorded as unrunnable, and its mitigation's claimed status drops accordingly — an untested control is not a control.

### 8.2 Detection SLOs

For detective controls, PASS is not "blocked" — it is "**detected, with an unforgeable artifact, within the stated SLO**". Without an SLO, "eventually detected" is unfalsifiable.

| Signal | D-SLO (detect) | A-SLO (alarm reaches a human) |
|---|---|---|
| Ruleset created/edited/deleted (T1.c) | ≤ 60 s from the GitHub event | ≤ 5 min |
| Bypass actor added (T1.d) | ≤ 60 s | ≤ 5 min |
| Bot write access revoked (T4.c) | ≤ 60 s | ≤ 5 min |
| CODEOWNERS altered, invalid, or reordered (T4.d) | ≤ 5 min (next state evaluation) | ≤ 15 min |
| Heartbeat absence (T5) | ≤ 3 missed heartbeats | ≤ 15 min, and `DM-3` blocks merges immediately |
| Verifier A/B disagreement (T2) | Immediate, on posting | ≤ 15 min |
| Replayed or out-of-window delivery (T3.a) | Immediate, at ingest | Daily digest unless repeated |

`DM-3`'s merge-blocking tolerance must exceed the heartbeat D-SLO with margin, or routine jitter blocks merges. The trade-off is deliberate: **this package prefers a blocked merge to an unobserved one.**

### 8.3 Suite summary

| Test | Layer | Question | Class | Cadence | On FAIL |
|---|---|---|---|---|---|
| NT-0.1 | L0 | Is a trust root feasible at all? | O | Quarterly | §3.4 — package becomes detective-only |
| NT-0.2 | L0 | Can the admin edit the enterprise ruleset? | D | Quarterly | L0 is not a root; all pins revert to removable |
| NT-0.3 | L0 | Is the separation real or nominal? | O | Semi-annual | §4.2 answer becomes "nobody" |
| NT-1.1 | L1 | Can the admin remove the check? | D | Quarterly | L1 decorative without an L0 pin |
| NT-1.2 | L1 | Can a green verdict be forged by name? | D | Quarterly + after any ruleset edit | `INV-PIN` broken — condition 3 unmet |
| NT-1.3 | L1 | Does a moving ref defeat the check? | D | Quarterly | `SB-1`–`SB-4` unmet — T3.b open |
| NT-1.4 | L1 | Is a compromised host detectable? | D | Semi-annual | `HC-1`/`HC-3` unmet — T2 unbounded |
| NT-2.1 | L2 | Is loosen-merge-restore caught? | D | Monthly | Condition 4 unmet — sampling hole still open |
| NT-2.2 | L2 | Is a bypass actor visible? | D | Quarterly | `VL-*` wrong — §6.5 must be corrected |
| NT-2.3 | L2 | Does replay corrupt the record? | D | Quarterly | T3.a open — ledger untrustworthy |
| NT-2.4 | L2 | Can the ledger be stopped unnoticed? | D | Monthly | T5 open — the most dangerous state |
| NT-2.5 | L2 | Does the ledger resist retroactive edits? | D | Quarterly | WORM claim false — no non-repudiation |
| NT-3.1 | L3 | Can CODEOWNERS protection be deleted? | D | Quarterly + after CODEOWNERS edits | Condition 2 unmet — two-PR bypass open |
| NT-3.2 | L3 | Removable without touching a file? | D | Quarterly | T4.c open — quietest hole |
| NT-3.3 | L3 | Does corrupt CODEOWNERS fail quiet? | D | Quarterly | T4.d open |
| NT-3.4 | L3 | Can the reviewed party edit the reviewer? | D | Quarterly | `BP-1` unmet — bot is a rubber stamp |
| NT-3.5 | L3 | Does a dark detector stop the approver? | D | Quarterly | `BP-4` unmet |

Fourteen distinct mitigation-bearing controls across four layers, seventeen tests. **Every layer in §4–§7 carries at least one, satisfying condition 5 and the task's NO-GO on "a mitigation without its negative test."**

## §9 — Residual risk after full rollout

Stated honestly, with no layer credited for more than it does:

- **R1 — L0 is the new single point (T6).** Reversal does not eliminate the single point of failure; it *relocates* it to a layer that is harder to reach and, ideally, held by someone else. For a genuinely solo maintainer holding both identities, R1 is **high** and NT-0.3 is the only test that can reveal it, because configuration will look correct either way.
- **R2 — App-host compromise is bounded, not closed (T2).** `HC-1`–`HC-4` make forgery detectable by recomputation and disagreement; they do not prevent a compromised host from posting green in the window before anyone recomputes.
- **R3 — T4.c has no preventive answer.** An admin can revoke the bot's collaborator access with no file change. Detection plus fail-closed coupling is the whole defence. §7.5 states this rather than papering over it.
- **R4 — Bypass visibility is layer-bounded (`VL-2`).** Until every applicable ruleset layer is enumerated with sufficient permission, "no bypass actors" is a claim about what was readable, not about what exists.
- **R5 — Alarm destinations are administrable by the admin (`DM-2`).** For a solo maintainer, the alarm channel is often an inbox the alarmed-about party controls. `DM-3`'s merge-blocking is the only mechanism here that does not depend on someone reading an alert.
- **R6 — Availability cost of failing closed.** `DM-3` and `BP-4` convert detector outages into merge outages. That is the intended trade, and it will occasionally block legitimate work during maintenance.
- **R7 — Platform trust (T8) is accepted,** not mitigated.

**The structural conclusion, unchanged from rev1 and reinforced here:** a complete answer to "solo account" requires either a second human with genuinely independent authority, or an enterprise-ruleset lock operated under real credential separation. Layers L1–L3 are worth building either way, but under §3.4's `NEITHER` branch they are detection and friction, not enforcement, and this document requires them to be described that way.

## §10 — Delta against rev1

| # | Rev1 said | Rev2 says | Driver |
|---|---|---|---|
| 1 | Rollout: App → bot → ledger → GHEC | L0 trust root → L1 App → L2 attestation → L3 review, with the L0.a/L0.b/L1/L0.c pin sequence resolving the ordering paradox | Condition 1 |
| 2 | No answer if GHEC is unaffordable | §3.4 `NEITHER` branch: package explicitly labelled detective-only; no green check may be called enforcement | Condition 1, honesty |
| 3 | Protected paths: workflows + 2 scripts + 1 test | Adds `P1`–`P3` (`.github/CODEOWNERS`, root `CODEOWNERS`, `docs/CODEOWNERS`) closing the two-PR bypass and the precedence pre-plant | Condition 2 |
| 4 | CODEOWNERS entries listed with no ordering note | Last-match-wins ordering is mandatory; entries below the `*` default or the rule silently never applies | Condition 2, mechanical correctness |
| 5 | Check added to the ruleset by context name | `INV-PIN`: pinned to the App's `integration_id`, never null, never `15368`, asserted continuously — otherwise an in-repo workflow can post the same context name and satisfy it | **Condition 3 — the most concrete correction** |
| 6 | App permissions: `contents: read`, `checks: write`, `metadata: read` | Adds `administration: read` and `pull_requests: read`; without the former, rev1's own ledger could not read the rulesets API at all | Condition 4 / `VL-1` |
| 7 | Nightly ruleset snapshot | Webhook + audit-log event log with `EnforcementState(t)` replay; polling demoted to a reconciliation backstop | Condition 4 |
| 8 | `bypass_actors: []` and `current_user_can_bypass: "never"` cited as facts | `VL-1`–`VL-5`; in particular `current_user_can_bypass` is **observer-relative** and is not evidence about the admin | Condition 4 |
| 9 | Ledger reuses the App's host and credential | `HC-4`: write-only ledger credential on separate infrastructure, so one host compromise cannot take both check and record | Condition 6 / T2 |
| 10 | Silence = healthy | `DM-1`–`DM-3`: heartbeat, independent watcher, and freshness coupling that fails merges closed | Condition 6 / T5 |
| 11 | Bot policy "a GitHub Action or the external host" | `BP-1`: external and sha-pinned only — an in-repo Action lets the reviewed party edit the reviewer | Condition 6 / T4 |
| 12 | No stale-review or self-approval handling | `dismiss_stale_reviews_on_push: true`, `BP-3` no self-approval; noted that `20321963` has no `pull_request` rule today | Condition 6 / T4.a, T4.b |
| 13 | No ref-binding discussion | `SB-1`–`SB-4`: payload-sha-only resolution, hash verification, no skip state | Condition 6 / T3.b |
| 14 | No replay discussion | Delivery-id persistence + freshness window; signature proves authorship, not freshness | Condition 6 / T3.a |
| 15 | Failure modes described in prose | 17 negative tests with class, PASS/FAIL, evidence artifact, cadence, and a defined consequence on FAIL | Condition 5 |
| 16 | "Failure modes closed" per mitigation | Each layer additionally names **who enforces this against the sole admin**, including where the answer is "nobody" | Standing requirement |

## §11 — Exit criteria: what would let this design leave revision status

This document is a proposal. It should not be treated as accepted until all of the following hold, and each is an owner action requiring separate approval:

1. NT-0.1 has been answered in writing with `GHEC`, `TRUSTEE`, or `BOTH` — or answered `NEITHER`, in which case §3.4 is applied and the package is relabelled detective-only *before* any engineering begins.
2. The row-520 ledger has been reconciled against §2 by someone holding that read access, with §2 corrected on any disagreement (the ledger is authoritative).
3. The rehearsal target `RH` is specified and approved as a resource to create, since fourteen of seventeen tests are Class D and are unrunnable without it.
4. Costs are confirmed at signup rather than estimated here: GHEC per-seat, two verifier hosts, KMS, and object-lock storage.
5. Each layer's commissioning is gated on its own negative tests passing — **a layer whose negative test has never been run is not commissioned**, and this document's status table must say so rather than describing it as active.

Nothing in this document creates, enables, or modifies any of the above. It specifies them.


---

# İNHERİTED DECISION RECORD (v1'den taşındı; v1 delete-on-consume ile silindi)

## OWNER DECISION (Alperen, 2026-08-11 — codex cross-review sonrası)

**REVİZYONA GÖNDERİLDİ** (codex verdict: UNSOUND). Revizyon şartları:
1. Rollout sırası ters çevrilir: GHEC/ayrı-trustee feasibility ÖNCE; dış App check bu üst
   katmana pinlenir.
2. Korumalı path'ler `.github/CODEOWNERS` dosyasının KENDİSİNİ kapsar (self-protection).
3. Mitigation 1 check'i yeni App'in `integration_id`'sine pinlenir (yalnız isimle değil).
4. Mitigation 3 polling yerine webhook+audit-log tabanlı olur (transient gevşet-merge-geri-yükle
   saldırısını yakalamak için); `bypass_actors` görünürlük sınırı belgelenir.
5. Her mitigation için canlı NEGATİF test tanımı zorunlu ("sole admin bunu sökebiliyor mu?").
6. Threat model genişletilir: App-host compromise, webhook replay/ref-TOCTOU, bot-policy
   compromise, ledger-yazım durdurma.

