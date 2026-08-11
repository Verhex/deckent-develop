# Trust-Anchor Solo-Account Mitigation Package: Design

**Date:** 2026-08-11
**Decision owner:** Alperen
**Audience:** Deckent repository administration, CI/security owners
**Status:** design proposal only; no GitHub resource is created, no workflow is edited, no ruleset is changed, and no mitigation is enabled by this document

## Purpose

Row 526 names four structural mitigations for a single-named risk: `VerhexIO/deckent-develop` has exactly one human administrator (`@alperensartacoglu`, per `.github/CODEOWNERS`), and that same identity holds every layer of trust the repository's validator contract depends on — repo Settings/ruleset admin, workflow-file write access, and code-owner review authority. This document specifies, concretely and for this repository, how to close that single-point-of-failure with:

1. an out-of-repo canonical check via a GitHub App with a separate integration identity,
2. a bot machine-account with a path-scoped required-reviewer rule on `.github/workflows/**` and the validator paths,
3. a nightly ruleset snapshot into an append-only ledger the org owner cannot write, and
4. a GHEC-trial evaluation.

It proposes only. Creating any GitHub resource, editing a workflow, or shipping any of the four mitigations without an explicit identity-separation argument is out of scope for this task and is the stated NO-GO condition.

## Evidence read and an explicit scope gap

This design was written from the evidence this task's read authority actually grants (`follow-up-works/`, `.github/`, `docs/evidence/`):

| Source | What it establishes |
|---|---|
| `docs/evidence/trust-anchor/ruleset-20321963-2026-08-03.json` | The live branch-protection ruleset for `VerhexIO/deckent-develop`, `main`. Rules: `deletion`, `non_fast_forward`, `required_status_checks` naming four contexts — `Type Check` and `Validator Contract — {macos,ubuntu,windows}-latest`, all under `integration_id: 15368` (the GitHub Actions app). `bypass_actors: []`, `current_user_can_bypass: "never"`. |
| `docs/evidence/xplat-validator-contract/ci-run-receipts-2026-08-03.json` | OQ-XV-01 closure evidence; establishes that this repository already treats job-level vs run-level CI conclusions as distinct facts and records immutable run metadata for audit — a pattern this design reuses for the nightly ledger (Mitigation 3). |
| `.github/CODEOWNERS` | A single wildcard owner, `@alperensartacoglu`, for the entire tree, explicitly including `.github/` and `docs/`. No second reviewer identity exists today. |
| `.github/workflows/cross-platform-e2e.yml` (`validator-contract` job) | Tagged `TRUST-ANCHOR-001`: the validator verifies every active receipt's baselines against the parent of the commit that registered the receipt, via `git log -S<id>`. On a shallow clone (`fetch-depth: 1`) that registration commit is invisible, the lookup degrades to a HEAD anchor, and "the exact same-patch forgery this check exists to stop would pass again." The comment states plainly: "These three legs are the ruleset's required checks (20321963) — the enforcement guarantee lives here." |
| `.github/workflows/ci.yml` (`typecheck` job) | A second, independent note on the same failure class: `fetch-depth: 0` is required because `lint:gates → lint-master-plan`'s trust-anchor resolution is history-sensitive, and a prior shallow clone "degraded to a WARN pass" (referenced as `xverify-E`). |

**Gap, disclosed rather than guessed at:** the task names "the ruleset facts recorded in ledger row 520" and asks that failure modes be mapped to "the xverify-E mechanical variants recorded on row 520." Row 520's ledger text lives in `.brain/memory.db` and/or `docs/MASTER-PLAN.md`, neither of which is inside this task's declared read scope (`follow-up-works/`, `.github/`, `docs/evidence/`). Per this project's bounded-discovery rule, that text is not reproduced or guessed at here. What follows instead is reconstructed from the four in-repo, in-scope citations above, which independently describe the same mechanism (`TRUST-ANCHOR-001` / the `git log -S<id>` receipt-baseline check) and the same named degradation class (shallow-clone-collapses-to-HEAD-anchor, referred to inline as `xverify-E`). Whoever holds row-520 read access should reconcile that ledger's exact mechanical-variant list against the mapping below before this design is finalized; if the two disagree, the ledger is authoritative and this document's mapping should be corrected, not the reverse.

## Threat model

The repository's entire enforcement guarantee — the ruleset's three required `Validator Contract` legs plus `Type Check` — is anchored in resources every one of which the sole admin can unilaterally change:

- **The ruleset itself** (`20321963`) lives in repo Settings. `current_user_can_bypass: "never"` only means the admin cannot bypass an *active* rule on a single PR; it says nothing about the same admin editing the rule's required-check list, disabling `enforcement`, or deleting the ruleset outright via the same Settings UI or API.
- **The workflow files** that implement the checks (`.github/workflows/cross-platform-e2e.yml`, `.github/workflows/ci.yml`) are ordinary repo files. The sole `CODEOWNERS` entry for `.github/` is the same admin, so a PR removing `fetch-depth: 0` (the exact precondition `TRUST-ANCHOR-001` calls out as the forgery-enabling failure) can be authored and merged by one identity with no independent check.
- **The validator script itself** (`scripts/lint-master-plan.mjs`, exercised by `tests/scripts/lint-master-plan.test.ts`) is likewise ordinary repo content the same admin can weaken — e.g., turning a `FAIL-CLOSED` branch into a `WARN`-and-pass branch — while the job name `Validator Contract` keeps reporting green.

None of this implies malicious intent; it is a structural statement about a solo account: one compromised session, one mistaken merge, or one coerced action collapses every layer at once, because no layer's trust is rooted outside that one identity. The four mitigations below each move one piece of that trust outside the solo identity's direct write/edit reach, with an explicit note on how strong (cryptographic) or weak (procedural) that separation actually is.

## Mitigation 1 — Out-of-repo canonical check via a GitHub App with a separate integration identity

**Resources to create**

- A new GitHub App (e.g. `deckent-trust-anchor-verifier`), registered under an account/org distinct from `VerhexIO` — a dedicated verification identity whose credentials never live in this repository's secrets.
- App permissions: `contents: read`, `checks: write`, `metadata: read`. No `administration`, no `contents: write`.
- Installed on `VerhexIO/deckent-develop` only, receiving `push` and `pull_request` webhook events.
- A small, independently hosted webhook handler (outside GitHub Actions — e.g. a dedicated VM or a container host under the App owner's control) that, on each event: performs its own full-history `git fetch` (not trusting whatever `fetch-depth` the triggering workflow used), re-implements the `TRUST-ANCHOR-001` receipt-baseline check (`git log -S<id>` against the parent of the registering commit) from scratch, and posts a new required status check — e.g. `trust-anchor/external-canonical-check` — via the Checks API using the App's own installation token.
- Add `trust-anchor/external-canonical-check` to ruleset `20321963`'s `required_status_checks` list, alongside the existing four contexts.

**Identity-separation argument**

The App's private key and installation token are provisioned and stored outside `VerhexIO` and outside any secret the repo admin can read or rotate from within this repository. An admin who edits or deletes the in-repo workflow, or weakens `scripts/lint-master-plan.mjs`, cannot make this check pass, because it does not run that code and does not read repo secrets — it independently re-derives the same git-history fact from its own clone.

**Failure modes closed**

- The shallow-clone-collapses-to-HEAD-anchor class (`TRUST-ANCHOR-001` / `xverify-E`, as cited above) is closed structurally: the external App always fetches full history under its own control, so a workflow edit that removes `fetch-depth: 0` no longer affects this check's validity.
- The "edit the validator script itself to stop failing closed" class is closed because the external check is a separate implementation, not an invocation of the in-repo script — there is nothing in-repo to tamper with that this check trusts.
- It does **not** close ruleset tampering (removing this very check's name from `required_status_checks`); that is addressed by Mitigations 2–4 below, and is named as a residual risk if none of them are adopted.

**Rollout order:** first. It is the foundation the other three mitigations either extend (3) or protect (2, 4).

**Owner vs automatable:** Owner-only — creating the App, choosing/provisioning its hosting and account separation, generating and storing the private key outside this repo, and adding the resulting check name to the ruleset. The webhook handler code and the re-implemented history check are automatable engineering work once the App exists.

**Cost notes:** Low-frequency PR/push-triggered compute on a small VM or serverless function is on the order of a few dollars a month at this repository's current activity; a full `git fetch` workload favors a small persistent VM over edge/serverless platforms with tight egress limits. No GHEC dependency for this piece.

## Mitigation 2 — Bot machine-account with a path-scoped required-reviewer rule on `.github/workflows/**` and the validator paths

**Resources to create**

- A dedicated GitHub machine/bot account (e.g. `deckent-ci-guardian-bot`) with its own email, its own 2FA, and credentials stored separately from the sole admin's day-to-day login flow.
- Add the bot as a repository collaborator with `Write` permission (not `Admin`).
- Extend `.github/CODEOWNERS` with path-scoped entries naming the bot as required reviewer for exactly the paths this task calls "validator paths":
  ```
  .github/workflows/           @deckent-ci-guardian-bot
  scripts/lint-master-plan.mjs @deckent-ci-guardian-bot
  scripts/lint-mcp-instructions.mjs @deckent-ci-guardian-bot
  tests/scripts/lint-master-plan.test.ts @deckent-ci-guardian-bot
  ```
- Enable `require_code_owner_review: true` on a `pull_request`-type ruleset rule (either added to `20321963` or a new, narrower ruleset) with `required_approving_review_count: 1`, on the same branch target. Because GitHub rulesets scope by branch/tag rather than by file path, the actual path-scoping mechanism is `CODEOWNERS` — the ruleset only turns "code-owner review" from optional into required.
- A scripted approval policy running under the bot's own token (a GitHub Action or the same external host as Mitigation 1) that inspects the diff for the specific tamper patterns this design cares about — removal of `fetch-depth: 0`, removal of a required-check job, a softened `FAIL-CLOSED`-to-`WARN` change in the validator script — and approves or requests changes accordingly, rather than requiring a human to operate the bot manually for every PR.

**Identity-separation argument**

Once `require_code_owner_review` is enforced, a PR touching `.github/workflows/**` or the validator paths cannot merge on the sole admin's approval alone — the bot's independent approval is also required. This is a genuine procedural improvement: a single compromised or careless human session can no longer merge a tampering change unassisted. **Honest caveat:** if the same human who administers the repo also holds the bot's credentials and can trigger its approval logic manually, the separation is procedural, not cryptographic — its strength depends entirely on where the bot's token is stored and who can invoke it. The strongest version of this mitigation runs the bot's approval logic on infrastructure the sole admin does not have shell or secret access to (for example, the same externally hosted service as Mitigation 1, using its own service credential rather than a token the admin can export).

**Failure modes closed**

- Self-approved tampering with the exact `TRUST-ANCHOR-001` precondition (`fetch-depth: 0` removal) or the `Validator Contract` job definitions is closed, because that diff now requires the bot's automated policy check before merge.
- Silent weakening of the validator script's fail-closed behavior into a permissive `WARN` is closed the same way, since `scripts/lint-master-plan.mjs` is in the reviewed path list.

**Rollout order:** second, after Mitigation 1 exists (the bot's automated policy can call the external App's independent check as one input to its approval decision).

**Owner vs automatable:** Owner creates and secures the bot account (2FA, credential storage, granting `Write` access) — a trust-establishing action only the human admin can perform. The diff-policy script and Action wiring are automatable.

**Cost notes:** $0 direct cost — bot/machine accounts are free on GitHub, and its Action runs consume the repository's existing included Actions minutes.

## Mitigation 3 — Nightly ruleset snapshot into an append-only ledger the org owner cannot write

**Resources to create**

- A nightly scheduled job, hosted on the same externally controlled infrastructure as Mitigation 1 (reusing the App's installation token, since it is already a separate identity), that calls `GET /repos/VerhexIO/deckent-develop/rulesets` and `GET /repos/VerhexIO/deckent-develop/rulesets/20321963`, in the same shape as the existing manually captured `docs/evidence/trust-anchor/ruleset-20321963-2026-08-03.json`, but automated and running every night rather than captured once.
- An append-only store the org owner cannot write to. Two concrete options, recommended together:
  - **Primary — cryptographic enforcement:** an object store with immutability locking (e.g. Object Lock in Compliance mode), written using the App's own separate cloud credential, with a bucket/retention policy that denies delete-or-overwrite to every principal, including the account root, until the lock period expires. This is the one control in this package whose non-repudiation does not depend on GitHub's own privilege model at all.
  - **Secondary — free mirror:** a second git repository, outside `VerhexIO`, with its own branch protection disallowing force-push and deletion, that the nightly job also commits the snapshot to.
- Each entry: capture timestamp, the full ruleset JSON, its SHA-256, and the previous entry's hash (hash-chained), so a retroactive edit to any past entry — even in the secondary mirror — is independently detectable.

**Identity-separation argument**

Object Lock in Compliance mode is enforced by the storage vendor against every account principal, not by GitHub's permission model — an admin who edits or deletes ruleset `20321963` cannot also rewrite last night's already-locked snapshot of it. This makes the mitigation detective rather than preventive: it does not stop a ruleset downgrade, but it makes the downgrade provably visible with an unforgeable timestamp, closing the "nobody notices until a bad merge lands" failure mode.

**Failure modes closed**

- Silent ruleset relaxation (removing a required check, flipping `enforcement` to disabled, or deleting ruleset `20321963` entirely) becomes auditable: the ledger shows exactly when the required-check list or enforcement state changed, against an admin who cannot have altered the historical record.

**Rollout order:** third — depends on Mitigation 1's separate credential to perform the nightly authenticated read.

**Owner vs automatable:** Owner provisions the object-lock bucket (or equivalent) and sets its retention policy — a billing/account-level action. The nightly cron script and hash-chaining logic are automatable.

**Cost notes:** Nightly JSON snapshots of a few kilobytes cost a negligible, sub-dollar-per-year amount in object storage; the real cost is the one-time engineering setup, not a recurring GHEC-scale expense.

## Mitigation 4 — GHEC-trial evaluation

**What to evaluate**

Start a GitHub Enterprise Cloud trial (GitHub publishes a no-cost evaluation period for this) associated with the org, specifically to assess enterprise-only controls relevant to solo-account separation:

- **Enterprise-owned rulesets**, which sit above org/repo rulesets in GitHub's privilege hierarchy and can be configured so that an org owner cannot edit or delete them — a way to pin `trust-anchor/external-canonical-check` (Mitigation 1) as permanently required, closing the residual gap that any org admin can otherwise remove a check from ruleset `20321963`.
- **Enterprise-level 2FA/SSO enforcement**, which can separate "day-to-day repo access" from "the credential that can change enterprise policy" if the enterprise-owner identity is provisioned and operated distinctly from the org-owner session used for normal work.
- **Enterprise audit-log streaming** to an external destination, which strengthens Mitigation 3's ledger with a GitHub-native, second source of tamper-evident history.

**Identity-separation argument**

The separation here is enforced by GitHub's own privilege hierarchy (enterprise owner outranks org owner) rather than by the repository's own configuration — but only if the enterprise-owner credential is genuinely held and operated differently from the day-to-day org-owner session (for example, a hardware-key-gated account used exclusively for policy changes). For a true solo maintainer this is the same honest caveat as Mitigation 2: the technology can enforce separation, but only a deliberate operational decision makes that separation real rather than nominal.

**Failure modes closed**

Closes the residual gap left open by Mitigation 1 alone: an enterprise ruleset can require that `trust-anchor/external-canonical-check` remain in `required_status_checks` at a layer the repo/org admin cannot edit, removing the "just delete the required-check entry" bypass.

**Rollout order:** last. It requires the most owner effort and recurring cost, and there is nothing meaningful to lock at the enterprise layer until the App check, bot review, and ledger from Mitigations 1–3 already exist.

**Owner vs automatable:** Entirely owner-driven — trial signup, billing decision, enterprise policy configuration, and the operational decision on whether a genuinely separate enterprise-owner credential is realistic for a solo maintainer. Nothing here is delegable to an automated worker.

**Cost notes (honest):** The trial itself is free for its evaluation window. GHEC is a recurring per-seat monthly cost after the trial ends; the exact current price should be confirmed at trial signup rather than assumed from any figure written here, since GitHub's published enterprise pricing changes over time and this document does not treat a specific number as fact. Recommend using the trial purely to validate that enterprise-ruleset locking behaves as described above, then making a separate, explicit owner decision on whether the recurring cost is justified by the residual risk it closes.

## Overall rollout order

1. External GitHub App + independent canonical check (Mitigation 1) — foundation.
2. Bot machine-account + path-scoped required review on workflow/validator paths (Mitigation 2) — protects the App's required-check entry and the validator script from silent self-approved edits.
3. Nightly ruleset ledger, reusing the App's identity (Mitigation 3) — makes any remaining ruleset-level tampering detectable.
4. GHEC-trial evaluation (Mitigation 4) — evaluated last, to decide whether to close the one gap the first three leave open (an org admin can still remove a required-check entry from the ruleset itself).

## Residual risk after all four

Mitigations 1–3 are primarily **detective**, not preventive, for the one action none of them can fully block: the sole admin still holds repository Settings/ruleset-admin power and can, if determined, delete the App installation, remove the bot collaborator, or edit the ruleset directly. What 1–3 change is that every one of those actions becomes independently verifiable and time-stamped rather than silent. Only Mitigation 4, and only if its enterprise-owner credential is operated as a genuinely separate identity from day-to-day admin use, converts this from detective to preventive. A structurally complete answer to "solo account" ultimately requires either a second human trustee with independent org-owner rights, or the enterprise-ruleset lock from Mitigation 4 under real credential separation — this document surfaces that honestly rather than implying Mitigations 1–3 alone close the gap.

---

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
