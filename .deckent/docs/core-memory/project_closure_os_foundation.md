# Closure OS Sidecar Ledger — Foundation Kararı (2026-08-15)

**Tip:** project / kalıcı-durum (law değil; genişletme değil, referans-karar).

Phase-4 **foundation COMPLETE** — bir **mekanizma + governance foundation** kapanışıdır, **ürün
wiring değildir** ve **canlı ledger mutation'ı yoktur** (ledger boş; gate `nothing to validate (OK)`).
Sidecar decision-ledger, MASTER'dan ayrı bir **Level×Lane + admission + priority-karar** authority'sidir;
projections yalnız-okuma türevdir ve truth kaynağı değildir.

## Sabitlenen kararlar
- **Root-of-trust = reviewed-parent** (merge-base `origin/main`): bir key **kendi eklendiği PR'da
  kendini yetkilendiremez**; rotation ancak parent-key'in ed25519-imzaladığı rotation receipt'iyle;
  genesis/çözülemez git → typed HOLD `TRUST_ANCHOR_BOOTSTRAP_UNRESOLVED` (in-repo self-sign yok).
- **Historical batch** = immutable snapshot bundle; imzalı digest'ler **arşivlenen byte'lardan**
  yeniden hesaplanır (current MASTER'dan DEĞİL); payload tamper → `AUTHORITY_SNAPSHOT_INTEGRITY_MISMATCH`.
- **Append-only hash chain** + **transactional four-view projection** (tek atomik `current.json` swap).
- **HOLD ≠ closure** — typed HOLD asla başarı/kapanış değildir.
- Mutation yalnız **authenticated batch authority + append-only gate + projection settlement** ile;
  elle MASTER/ledger sınıflandırması veya **sahte receipt YASAK**.

## Genesis provisioning TOOL sevk edildi (2026-08-16 — ayrı genesis PR)
`scripts/closure-ledger/genesis-anchor.mjs` + [`docs/governance/closure-genesis-provisioning.md`](../../../docs/governance/closure-genesis-provisioning.md):
buildless ceremony/verify aracı, **SOLE validator** `parseTrustAnchorsDoc`'u reuse eder (ikinci şema
authority'si icat etmez). Fingerprint = `sha256`(**SPKI DER**), deterministik/recomputable. **İki mod
(Codex security re-audit sonrası):** `--adopt-public-key` (CANONICAL — hardware/KMS/keychain public key'i
alır, private'e dokunmaz) ve `--generate` (software-key bootstrap; plaintext PKCS8 repo-DIŞI, POSIX 0600
enforce+verify; **Windows'ta typed HOLD**). **Fail-closed:** private/anchors/fingerprint hedefleri önce
absent preflight; private key **O_EXCL** (overwrite/symlink-follow yok) + mode-verify; partial failure yalnız
bu-koşum-dosyaları rollback; private key hiçbir stream'de. Araç repo'ya **private key YAZMAZ**
(in-repo/symlink-into-repo reddi), yalnız public anchor + fingerprint manifest emit eder. **Bu PR'da gerçek
anchor commit YOK** — anchor'ı owner ceremony provision eder; authority yalnız owner-verified
**reviewed-parent merge**'den gelir. Stable reasonCode'lar (`GENESIS_*`) + negatif forgery seti tool
`--self-check` (21/21) + `tests/governance/closure-genesis-anchor.test.ts` (13/13)'te. Canonical owner
identity: keyId=`closure-owner-genesis-v1`, tenantId=`main`, projectId=`deckent`. tenantId/projectId'in
**canonical producer'ı YOK** → owner ceremony input'u; Phase-5 writer'ın approval subject'i birebir eşleşmeli.
**Round-2 security re-audit (2026-08-16):** (A) `createPublicKey` private PEM'den public türetiyor → adopt artık
PRIVATE KEY envelope'ını createPublicKey'den ÖNCE reddeder (`GENESIS_PRIVATE_KEY_INPUT_FORBIDDEN`) — "no private
material" envelope-guard ile KANITLI. (B) **SOLE validator** (`parseTrustAnchorsDoc` + `resolveTrustAnchors`,
`lint-closure-dispositions.mjs`) artık anchor.publicKeyPem VE rotation.newPublicKeyPem için tek `ed25519PublicPemProblem`
helper'ıyla: tam bir SPKI PUBLIC KEY bloğu + private-envelope YASAK (`TRUST_ANCHOR_PRIVATE_KEY_FORBIDDEN`) + ed25519
type (`TRUST_ANCHOR_BAD_KEY_TYPE`) zorunlu — P-256/RSA/private anchor artık trusted-set'e giremez; parent-imzası bile
non-ed25519 rotation'ı launder edemez (key-type önce). Gate self-check 131/131, genesis tool self-check 23/23,
genesis vitest 18/18. İkinci validator icat edilmedi (helper gate içinde reuse).

## Phase-5 (KURULMADI — kod olarak yok)
ed25519 **SIGNER** + owner private-key custody · gerçek **ApprovalBroker writer** · gerçek
**receipt/ledger-event** · **MASTER state/priority mutation** · provider çağrısı · **owner ceremony ile
gerçek genesis anchor commit** (tool hazır; anchor henüz yok).

## Sıra
foundation PR merge → **ayrı genesis trust-anchor PR** (tool açıldı; owner ceremony koşup public
anchor+fingerprint commit + fingerprint doğrula + merge eder) → Phase-5 writer →
exact dry-run digest → **tek authenticated owner approval** → ledger append + atomic projections.

Extended spec: [`docs/governance/closure-os-sidecar-ledger.md`](../../../docs/governance/closure-os-sidecar-ledger.md) ·
Transition brief §14: [`CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md`](../../../CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md).
