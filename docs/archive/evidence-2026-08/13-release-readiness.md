# 13 — Release-readiness boundary

**Date:** 2026-08-22
**Mode:** read-only release-boundary enumeration
**Verdict:** **NO-GO for tag, publish, or GA**

The current repository record does not satisfy the unified release gate. This note records the boundary only. It does not create a release, change a version, authorize a remote operation, or infer owner approval.

## Rebaseline is not a release

`0.100.0` is the version and changelog **rebaseline**, not evidence of a shipped release and not GA.

The transition brief and canonical `RELEASE-001` row agree on the two-step boundary:

1. The completed first step reset the package/changelog narrative from the cancelled `1.0.0-beta` direction to `0.100.0`.
2. That step was explicitly **tagless**: no Git tag, GitHub Release, or npm publish was made.
3. A real release is a separate future step, permitted only after `RELEASE-001` and its proof chain close.

The engineering ledger in `docs/CHANGELOG.md` reinforces this separation: post-rebaseline headings are sprint identifiers, not product-version tags, and product release notes remain a separate canonical concern.

## Current release boundary

| Required boundary | Current canonical state | Proof still required before release |
| --- | --- | --- |
| Platform proof | `PLATFORM-PROOF-001` is `OPEN` with `L=0`, `X=0`; its truth is partial only. | Artifact-backed real-binary certification across Linux, macOS, Windows native, WSL, Docker, and every declared remote target. A single-host or CLI-only result cannot stand in for the matrix. |
| Packaging and documentation | `PACKAGING-001` is `OPEN`; `DOCS-PRODUCT-001` is `BLOCKED`. Existing source/dist parity evidence is narrow and does not close distribution. | Reproducible CLI, daemon, Desktop, service, and container packages; current product docs in six languages; executable examples; exact release-note/version/package parity; installation and rollback proof. Desktop still lacks signed macOS/Windows artifacts and an implemented updater/rollback path in the recorded code truth. |
| Soak and release blockers | `RELEASE-001` is `BLOCKED`, with `L=0`, `X=0`, `S=0`. `LOAD-CHAOS-001` is also `OPEN` with live, cross-platform, and scale dimensions at zero. | A 72-hour declared-platform soak, zero release blockers, and the applicable load/fault/recovery evidence. A typed HOLD, an earlier sprint completion, or a scoped passing check is not soak evidence. |
| Signed artifacts and supply chain | `PACKAGING-001` requires reproducible signed artifacts, SBOM, provenance, update channels, and rollback; these are not closed. | Release-candidate artifacts bound to source/version, signatures, SBOM and provenance, verification across the declared platforms, and rollback evidence. No existing archive manifest or compiled-path parity observation is a substitute for signed release artifacts. |
| Owner publish authority | `RELEASE-001` carries `G2,G5` and requires owner publish approval. Automatic npm publish and GitHub Release creation were removed; canonical publication is owner-manual. | Fresh, exact-scope owner decision and remote-operation authority after all technical proofs pass. Silence, an old approval, a scheduling statement, beta intent, or this note cannot supply or extend that authority. |

## Packaging and publish sub-gates

The adjacent public/beta route is not complete either:

- `RELEASE-BETA-001` is `OPEN`; it does not relax the GA conditions.
- `NPM-CHANNEL-001` is `OPEN`. It still requires a whitelist audit of the tarball, owner-run beta publication, preservation of the `latest` tag, and a fresh-machine `npx` smoke.
- `DOCS-TRUTH-PASS-001` remains `OPEN` in the canonical ledger despite prior candidate evidence.
- The checked provider-observation source/dist parity is valid only for that scoped compiled path. It is not an npm tarball, Desktop, container, signature, provenance, or clean-install proof.
- The verified sprint archive is retention/integrity evidence, not a releasable or signed product-artifact set.

## Fail-closed decision

The release decision remains **NO-GO** while any required dependency or proof is absent. Specifically, no one may claim that `0.100.0` is published or GA, create a tag or GitHub Release, publish to npm, move a dist-tag, or infer the owner's authorization from historical text.

The earliest honest next decision is a proof review after platform certification, packaging/docs closure, the full soak with zero blockers, signed-artifact verification, and rollback evidence all exist. Only then may the owner issue a fresh publish decision bound to the exact candidate and remote action. Until that point, `0.100.0` means rebaseline only.
