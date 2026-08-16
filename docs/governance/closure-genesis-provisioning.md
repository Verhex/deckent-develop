# Closure OS — Genesis Trust-Anchor Provisioning Procedure

> Status: **executable REPORTED procedure**. This document + `scripts/closure-ledger/genesis-anchor.mjs`
> are the "external owner fingerprint / signed Git authority" that `resolveTrustAnchors()` names when it
> holds `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` at genesis (see `closure-os-sidecar-ledger.md` §5). Running the
> ceremony writes **no** private key into the repository, **no** ledger event, **no** receipt, **no**
> signature, and **no** MASTER/priority mutation. It is not the Phase‑5 signer/writer.

## 1. Why genesis is a separate, owner-verified PR

The Closure OS sidecar-ledger's root of trust is the **reviewed parent** — the set of trust-anchor keys
committed at `merge-base HEAD origin/main`, never the working tree. A key added in its own PR **cannot
authorize itself** (`resolveTrustAnchors()` refuses same-PR self-vouch; genesis with no parent file is a
typed `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` HOLD, never a silent pass). Therefore the first anchor's
authority cannot come from code — it comes from **the owner reviewing the fingerprint and merging this
PR**. The merge is the root-of-trust act; the fingerprint the owner verifies is the thing under review.

This is why the genesis anchor ships as its **own** PR, distinct from the Phase‑4 foundation PR that
built the verifier and from the Phase‑5 PR that will build the signer/writer.

## 2. What the ceremony produces

| Artifact | Location | Committed? | Secret? |
|---|---|---|---|
| Owner **private** key (PKCS8 PEM) | a path **outside** the repo, chosen via `--private-out` | **NEVER** | **YES** — owner custody only |
| Public trust anchor | `docs/governance/closure-trust-anchors.json` | yes (public key only) | no |
| Fingerprint manifest | `docs/governance/closure-trust-anchors.fingerprints.json` | yes | no |

The **fingerprint** is defined as:

```
sha256:<lowercase-hex of sha256( SPKI DER bytes of the ed25519 public key )>
```

DER (not PEM) is used because the PEM envelope's line-wrap and EOL vary by platform/tool, so a PEM-based
digest is not portable; the DER is the canonical key encoding. The fingerprint manifest is a **pure,
deterministic function of the public anchor** — anyone with the committed anchor can recompute it
byte-for-byte (`--verify`) and confirm it independently.

## 3. Run the ceremony (owner, on a trusted machine)

Choose the anchor identity. There is **no canonical producer** of `tenantId`/`projectId` in code today —
the genesis anchor **defines** the canonical pair, and any future Phase‑5 writer's approval subject MUST
carry exactly these values (the gate cross-checks `subject.tenantId/projectId === anchor.tenantId/projectId`,
`AUTHORITY_TENANT_MISMATCH`/`AUTHORITY_PROJECT_MISMATCH` otherwise). Pick them deliberately.

```sh
node scripts/closure-ledger/genesis-anchor.mjs --generate \
  --key-id      <owner-chosen key id, e.g. closure-owner-genesis-2026> \
  --tenant-id   <owner-chosen tenant identity> \
  --project-id  <owner-chosen project identity> \
  --private-out "$HOME/.deckent-secrets/closure-genesis-private.pem" \
  --anchors-out     docs/governance/closure-trust-anchors.json \
  --fingerprint-out docs/governance/closure-trust-anchors.fingerprints.json
```

- `--private-out` MUST be **outside** the repository; the tool **refuses** any in-repo path (symlink-safe).
- The private key is written with `0600` perms and is **never printed** — only its path and the fingerprint
  are echoed to stderr.
- Prefer a hardware-key-gated / OS keychain store for `--private-out`, not a plaintext home file, for a
  production root of trust.

## 4. Verify, custody, adopt (the single owner decision)

1. **Verify the fingerprint.** Re-derive it independently and confirm it matches what `--generate` printed:
   ```sh
   node scripts/closure-ledger/genesis-anchor.mjs --verify docs/governance/closure-trust-anchors.json
   ```
   The printed `anchors[].fingerprint` MUST equal the fingerprint from step 3, and MUST equal any value you
   computed on your own machine. This equality is the whole review.
2. **Custody the private key.** Move `--private-out` into hardware-backed / secrets-manager custody. Never
   commit it; never place it under the repo tree; never paste it into a chat or issue.
3. **Adopt.** Commit `closure-trust-anchors.json` + `closure-trust-anchors.fingerprints.json` onto this PR
   branch, confirm the fingerprint in review, and **merge**. Once merged, the anchor exists at the reviewed
   parent and `resolveTrustAnchors()` stops holding `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` — genesis is
   provisioned. **The merge — by the owner, after fingerprint verification — is the only act that grants the
   anchor authority.**

## 5. Rotation boundary (contract, not built here)

The genesis anchor carries **no rotations** (`predecessor: null`). After genesis, a working-tree key that is
not committed at the reviewed parent is trusted **only** via a rotation receipt closure-canonical-v1 over
`{ newKeyId, newPublicKeyPem, tenantId, projectId, signedByKeyId }`, ed25519-signed by a **reviewed-parent**
key (`TRUST_ANCHOR_UNAUTHORIZED_ROTATION` otherwise). Depth is **1**: a rotation-added key cannot authorize
another rotation in the same change. The signer that produces rotation receipts is Phase‑5 and is **not**
part of this package.

## 6. What the tool + gate reject (negative guarantees)

Exercised in `genesis-anchor.mjs --self-check` and `tests/governance/closure-genesis-anchor.test.ts`, all
reusing the SOLE gate validator `parseTrustAnchorsDoc` (no second schema authority is invented):

| Forgery | Typed rejection |
|---|---|
| Tampered / non-PEM public key | `TRUST_ANCHOR_BAD_PEM` |
| Unknown top-level or anchor field | `TRUST_ANCHOR_UNKNOWN_FIELD` |
| `schemaVersion` ≠ 1 | `TRUST_ANCHOR_SCHEMA` |
| Duplicate `keyId` | `TRUST_ANCHOR_DUPLICATE_KEYID` |
| Missing / empty required field | `TRUST_ANCHOR_MALFORMED` |
| A "genesis" doc carrying a rotation | fingerprint manifest refuses it (genesis has no rotations) |
| One-byte key edit | different fingerprint (tamper-evident) |
| Private-key path inside the repo | ceremony refuses, writes nothing |

## 7. Sequence context

Foundation PR (verifier, merged) → **this genesis trust-anchor PR (owner verifies fingerprint, merges)** →
Phase‑5 writer (ApprovalBroker subject/claim submit + immutable batch bundle + ed25519 signer + owner
private-key custody) → exact dry-run batch digest → single authenticated owner approval → ledger append +
atomic projections.
