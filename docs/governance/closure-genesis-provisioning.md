# Closure OS — Genesis Trust-Anchor Provisioning Procedure

> Status: **executable REPORTED procedure**. This document + `scripts/closure-ledger/genesis-anchor.mjs`
> are the "external owner fingerprint / signed Git authority" that `resolveTrustAnchors()` names when it
> holds `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` at genesis (see `closure-os-sidecar-ledger.md` §5). Running the
> ceremony writes **no** ledger event, receipt, signature, or MASTER/priority mutation. It is not the
> Phase‑5 signer/writer.

## 1. Why genesis is a separate, owner-verified PR

The Closure OS sidecar-ledger's root of trust is the **reviewed parent** — the trust-anchor keys committed
at `merge-base HEAD origin/main`, never the working tree. A key added in its own PR **cannot authorize
itself** (`resolveTrustAnchors()` refuses same-PR self-vouch; genesis with no parent file is a typed
`TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` HOLD). Therefore the first anchor's authority cannot come from code — it
comes from **the owner reviewing the fingerprint and merging this PR**. The merge is the root-of-trust act.

## 2. Two provisioning modes — pick by how the private key is held

| Mode | Private key | When |
|---|---|---|
| **`--adopt-public-key` (CANONICAL)** | held in a hardware token / KMS / OS keychain; **the tool never sees it** | production root of trust; cross-platform |
| `--generate` (software-key BOOTSTRAP) | the tool creates a plaintext PKCS8 file key **outside the repo**, POSIX `0600` enforced+verified | dev/bootstrap on POSIX only; **refused on Windows** (`GENESIS_WINDOWS_KEY_CUSTODY_UNVERIFIABLE`) |

The `--generate` mode is an honest software-key bootstrap. It does **not** provide hardware or keychain
custody and never claims "cross-platform secure private-key storage". For a real root of trust, generate the
key inside your HSM/KMS/keychain and use `--adopt-public-key`.

The **fingerprint** both modes emit is:
```
sha256:<lowercase-hex of sha256( SPKI DER bytes of the ed25519 public key )>
```
DER (not PEM): the PEM envelope's line-wrap/EOL vary by platform, so a PEM-based digest is not portable. The
fingerprint manifest is a pure function of the public anchor — recompute it with `--verify`.

## 3. Fail-closed guarantees (both modes)

- **Preflight.** Every destination (`--private-out`, `--anchors-out`, `--fingerprint-out`) is checked
  **absent** before any keygen. Any existing path → non-zero exit + a stable `reasonCode`, nothing written.
- **No overwrite, no symlink-follow.** The private key is created with `O_EXCL`, so it never overwrites an
  existing file and never follows a final symlink; public outputs are `O_EXCL` too.
- **Mode verified.** On POSIX the private key's mode is verified to be exactly `0600` after write; otherwise
  it fails closed.
- **Repo containment.** `--private-out` inside the repo (directly or via a symlink that resolves into it) →
  `GENESIS_PRIVATE_OUT_IN_REPO`.
- **All-or-nothing.** A partial failure rolls back only the files this run created; a pre-existing artifact
  is never modified or deleted. The private key is never printed to any stream.

Reason codes: `GENESIS_MISSING_INPUT`, `GENESIS_PRIVATE_OUT_IN_REPO`, `GENESIS_PRIVATE_OUT_EXISTS`,
`GENESIS_ANCHORS_OUT_EXISTS`, `GENESIS_FINGERPRINT_OUT_EXISTS`, `GENESIS_PRIVATE_MODE_UNVERIFIED`,
`GENESIS_WINDOWS_KEY_CUSTODY_UNVERIFIABLE`, `GENESIS_PUBLIC_KEY_INVALID`, `GENESIS_PUBLIC_KEY_NOT_ED25519`,
`GENESIS_ROTATIONS_NOT_ALLOWED`, `GENESIS_NON_CONFORMANT`.

## 4. Canonical owner identity

There is **no canonical producer** of `tenantId`/`projectId` in code — the genesis anchor **defines** the
pair, and any future Phase‑5 writer's approval subject MUST carry exactly these values (the gate cross-checks
`subject.tenantId/projectId === anchor.tenantId/projectId`). The canonical values for this repository:

```
keyId:      closure-owner-genesis-v1
tenantId:   main
projectId:  deckent
```

## 5. Run it (owner, on a trusted machine)

### 5a. Canonical — adopt a hardware/KMS/keychain public key
```sh
# Export ONLY the public key from your HSM/KMS/keychain to an SPKI PEM file, then:
node scripts/closure-ledger/genesis-anchor.mjs --adopt-public-key ./owner-genesis-public.pem \
  --key-id closure-owner-genesis-v1 --tenant-id main --project-id deckent \
  --anchors-out     docs/governance/closure-trust-anchors.json \
  --fingerprint-out docs/governance/closure-trust-anchors.fingerprints.json
```
The tool validates the key is Ed25519 (`GENESIS_PUBLIC_KEY_NOT_ED25519` otherwise), emits the public anchor +
fingerprint manifest, and **never touches a private key**.

### 5b. Software-key bootstrap (POSIX only)
```sh
node scripts/closure-ledger/genesis-anchor.mjs --generate \
  --key-id closure-owner-genesis-v1 --tenant-id main --project-id deckent \
  --private-out "$HOME/.deckent-secrets/closure-genesis-private.pem" \
  --anchors-out     docs/governance/closure-trust-anchors.json \
  --fingerprint-out docs/governance/closure-trust-anchors.fingerprints.json
```
`--private-out` MUST be outside the repo; the key is written `0600` and its path (never its content) is
reported. On Windows this mode refuses — use `--adopt-public-key`.

## 6. Verify, custody, adopt (the single owner decision)

1. **Verify the fingerprint** independently and confirm it matches what the tool printed:
   ```sh
   node scripts/closure-ledger/genesis-anchor.mjs --verify docs/governance/closure-trust-anchors.json
   ```
   The printed `anchors[].fingerprint` MUST equal the value from step 5 and any value you computed yourself.
2. **Custody the private key.** In `--adopt-public-key` it already lives in your HSM/KMS/keychain. In the
   software bootstrap, move `--private-out` into hardware-backed / secrets-manager custody. Never commit it,
   never place it under the repo tree, never paste it anywhere.
3. **Adopt.** Commit `closure-trust-anchors.json` + `closure-trust-anchors.fingerprints.json` onto this PR
   branch, confirm the fingerprint in review, and **merge**. Once merged, the anchor exists at the reviewed
   parent and `resolveTrustAnchors()` stops holding `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` — genesis is
   provisioned. **The merge — by the owner, after fingerprint verification — is the only act that grants the
   anchor authority.**

## 7. Rotation boundary (contract, not built here)

The genesis anchor carries **no rotations** (`predecessor: null`). After genesis, a working-tree key not
committed at the reviewed parent is trusted **only** via a rotation receipt closure-canonical-v1 over
`{ newKeyId, newPublicKeyPem, tenantId, projectId, signedByKeyId }`, ed25519-signed by a **reviewed-parent**
key (`TRUST_ANCHOR_UNAUTHORIZED_ROTATION` otherwise). Depth is **1**. The signer that produces rotation
receipts is Phase‑5 and is **not** part of this package; `buildFingerprintManifest` refuses a rotations-bearing
doc (`GENESIS_ROTATIONS_NOT_ALLOWED`).

## 8. What the tool + gate reject (negative guarantees)

Exercised in `genesis-anchor.mjs --self-check` and `tests/governance/closure-genesis-anchor.test.ts`:

| Forgery / hazard | Typed rejection |
|---|---|
| Tampered / non-PEM public key | `TRUST_ANCHOR_BAD_PEM` |
| Non-ed25519 public key (adopt) | `GENESIS_PUBLIC_KEY_NOT_ED25519` |
| Malformed public key (adopt) | `GENESIS_PUBLIC_KEY_INVALID` |
| Unknown top-level / anchor field | `TRUST_ANCHOR_UNKNOWN_FIELD` |
| `schemaVersion` ≠ 1 | `TRUST_ANCHOR_SCHEMA` |
| Duplicate `keyId` | `TRUST_ANCHOR_DUPLICATE_KEYID` |
| Missing / empty required field | `TRUST_ANCHOR_MALFORMED` |
| A "genesis" doc carrying a rotation | `GENESIS_ROTATIONS_NOT_ALLOWED` |
| Existing private/anchors/fingerprint destination | `GENESIS_{PRIVATE,ANCHORS,FINGERPRINT}_OUT_EXISTS` (no overwrite) |
| Symlink at `--private-out` | `GENESIS_PRIVATE_OUT_EXISTS` (O_EXCL, target untouched) |
| Private path inside the repo | `GENESIS_PRIVATE_OUT_IN_REPO` |
| POSIX mode not 0600 after write | `GENESIS_PRIVATE_MODE_UNVERIFIED` |
| Windows software file-key | `GENESIS_WINDOWS_KEY_CUSTODY_UNVERIFIABLE` |

## 9. Sequence context

Foundation PR (verifier, merged) → **this genesis trust-anchor PR (owner verifies fingerprint, merges)** →
Phase‑5 writer (ApprovalBroker subject/claim submit + immutable batch bundle + ed25519 signer + owner
private-key custody) → exact dry-run batch digest → single authenticated owner approval → ledger append +
atomic projections.
