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
authority'si icat etmez). Fingerprint = `sha256`(**SPKI DER**), deterministik/recomputable. Araç repo'ya
**private key YAZMAZ** (in-repo path reddi), yalnız public anchor + fingerprint manifest emit eder. **Bu
PR'da gerçek anchor commit YOK** — anchor'ı owner ceremony (kendi makinesinde keygen, private key custody,
fingerprint doğrula) provision eder; authority yalnız owner-verified **reviewed-parent merge**'den gelir.
Negatif forgery seti (BAD_PEM/UNKNOWN_FIELD/SCHEMA/DUPLICATE_KEYID/MALFORMED/self-vouch rotation/in-repo
key reddi) tool `--self-check` + `tests/governance/closure-genesis-anchor.test.ts`'te. tenantId/projectId'in
**canonical producer'ı YOK** → owner ceremony input'u; Phase-5 writer'ın approval subject'i birebir eşleşmeli.

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
