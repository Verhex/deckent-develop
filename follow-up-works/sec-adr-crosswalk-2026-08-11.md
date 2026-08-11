# Security ADR crosswalk and typed conflict routes — 2026-08-11

**Decision owner:** Alperen  
**Status:** proposal only — no ADR is amended, superseded, or otherwise changed by this document.

## Decision boundary

This is the owner-decision artifact for MASTER row 4191 (`SEC-ADR-CROSSWALK-001`). It crosswalks the nine approved authority designs recorded by the scoped 2026-08-11 re-verification. The evidence records that eight of those designs carried no direct ADR citation. This document therefore distinguishes an ADR ID evidenced by the scoped record from an unresolved governing-ADR recall; it does not invent missing authority.

`HOLD` below means: no implementation dependent on that authority relationship may treat the relationship as settled until the owner (or the authoritative memory-export review) records the governing ADR ID. It is not a product verdict.

## Nine-design governing-ADR crosswalk

| ID | Approved design / declared owner | Governing ADRs resolved by scoped evidence | Crosswalk status and required next action |
|---|---|---|---|
| A1 | `plugin-admission-authority-design-2026-08-05.md` / `PLUGIN-SANDBOX-WIRE-001` (7031) | None resolved in the allowed evidence. | `HOLD`: perform authoritative ADR recall before implementation; the design must not acquire an invented ADR relationship. |
| A2 | `rolling-spend-budget-authority-design-2026-08-05.md` / `LIMIT-SPEND-ENFORCE-001` (4091) | `ADR-G-037` — Execution Budget Landing, Continuation & Metering Authority. | Direct-field conflict; owner route is **AMENDMENT** below. |
| A3 | `audit-authority-integrity-design-2026-08-06.md` / `AUDIT-001` (4120) | `ADR-G-039` — Provider Authority Key Custody, Rotation & Composition. | Direct-field conflict; owner route is **AMENDMENT** below. |
| A4 | `provider-neutral-worker-execution-authority-design-2026-08-06.md` / `TOOL-AUTHORITY-001` (4060) | None resolved in the allowed evidence. | `HOLD`: authoritative ADR recall is required before implementation. |
| A5 | `attempt-effect-attribution-authority-design-2026-08-06.md` / `TRUST-HANDOFF-001` (4180) | None resolved in the allowed evidence. | `HOLD`: authoritative ADR recall is required before implementation. |
| A6 | `enforcement-module-disposition-authority-design-2026-08-06.md` / `SEC-ENFORCE-WIRE-001` (4200) | `ADR-G-021` — Self-Modifying Detection. | Direct-field conflict; owner route is **SUCCESSOR** below. |
| A7 | `terminal-session-execution-authority-design-2026-08-06.md` / authority owner `API-SECURITY-001` (4130) | `ADR-G-029` — Embedded Web Terminal (Remote PTY). | Direct-field conflict; owner route is **SUCCESSOR** below. |
| A8 | `project-inventory-scope-admission-authority-design-2026-08-06.md` / `TRUTH-BASELINE-001` (40) | None resolved in the allowed evidence. | `HOLD`: authoritative ADR recall is required before implementation. |
| A9 | `content-provenance-context-integrity-authority-design-2026-08-06.md` / `PROMPT-001` (9020), `MEMORY-AUTHORITY-001` (190), later dedicated owner 4125 | None resolved in the allowed evidence. | `HOLD`: authoritative ADR recall is required before implementation. The later creation of 4125 must not be projected backward as an ADR citation. |

The dependency-supply evaluation is intentionally excluded: the scoped evidence calls it the **tenth** document, not one of this row’s nine designs. Its explicitly cited governing policy is `ADR-D-005`.

## Direct-field conflicts — owner proposals

### C1 — A6 D11 versus ADR-G-021 self-modifying detection

| Field | Evidence |
|---|---|
| Conflicting ADR claim | “the proven, live consumers of `detectDeckentRepo` are: the **ROLLBACK-GUARD** … so deckent can never wipe its own uncommitted source; AND the agentic self-modify guard … write-elevation gated on `detectDeckentRepo`.” |
| Conflicting design claim | “A6 D11 bu modeli **retire etmeyi öneriyor**.” |
| Type | `SUCCESSOR` — `ADR-G-021` is `Immutable: yes`; in-place editing is prohibited. |
| Owner recommendation | Commission an `ADR-G-019`-governed successor proposal that preserves the proven rollback/self-protection invariant until a replacement proves equivalent protection. The proposal must decide whether D11 retires only dormant detector code or replaces the live detection family, enumerate migration/rollback evidence, and leave implementation on `HOLD` until approved. |

### C2 — A7 versus ADR-G-029 delivered command/prompt guard claim

| Field | Evidence |
|---|---|
| Conflicting ADR claim | “Sub-#2 (the security guard — command/prompt guard, outbound-limiter) has since been **delivered**.” |
| Conflicting design claim | “Command/prompt guard her `SessionKind` için çalışır (`shell` özel-durumu kalkar).” Scoped code-truth records `if (ctx.kind !== 'shell') return [];`, leaving `ai` and `deckent` sessions guardless. |
| Type | `SUCCESSOR` — `ADR-G-029` is `Immutable: yes`; in-place editing is prohibited. |
| Owner recommendation | Commission an `ADR-G-019`-governed successor proposal that narrows the delivered claim to its evidenced `shell` coverage or approves a kind-independent guard contract and its proof. Keep the existing ADR-acknowledged `AUDIT-WIRE` and `TERM-CONFIG-WIRE` gaps out of this conflict: the evidence says they are already recorded, while the direct conflict is only the delivered-guard claim. Block the A7 implementation row until the successor is owner-approved. |

### C3 — A2 rolling spend budget versus ADR-G-037 landing authority

| Field | Evidence |
|---|---|
| Conflicting ADR claim | “The immutable owner-authored hard budget remains the primary ceiling across an execution lineage. Landing never widens, resets or replaces it; all continuation-attempt consumption is cumulative.” Also: “`LANDED` requires an immutable host-owned checkpoint receipt and is neither DONE nor NO_GO.” |
| Conflicting design claim | Scoped evidence says A2’s rolling-spend design directly conflicts with the ADR’s already bound “9-maddelik landing/budget authority”; the current spend gate is “WARN-ONLY — never blocks.” |
| Type | `AMENDMENT` — `ADR-G-037` is `Immutable: no` and hard-enforced. |
| Owner recommendation | Authorize a bounded amendment proposal, not an implementation decision. It must state whether A2 is an implementation of ADR-G-037 or changes an authority field; preserve cumulative hard-ceiling, landing, attendance, provider-capability, and host-receipt invariants unless the owner explicitly changes them. Require a field-by-field compatibility matrix and reject any proposal that treats warning-only cost evidence as an authorized substitute for host metering. |

### C4 — A3 audit-authority integrity versus ADR-G-039 key custody

| Field | Evidence |
|---|---|
| Conflicting ADR claim | “The keyring has one active signing key, retired verify-only keys … HKDF-SHA256 domain separation is mandatory for truth integrity, limit integrity, and account pseudonymization.” |
| Conflicting design claim | Scoped evidence says A3 treats “HMAC + tek-aktif-imza-anahtarı + zorunlu HKDF-SHA256 domain separation” as an accident, while ADR-G-039 binds it as an accepted design. |
| Type | `AMENDMENT` — `ADR-G-039` is `Immutable: no` and hard-enforced. |
| Owner recommendation | Authorize an amendment proposal that separates the unsafe current fixed `AUDIT_HMAC_SECRET` implementation from the accepted key-custody architecture. It should retain the one-active/retired-verify-only and HKDF domain-separation contract, specify migration from the fixed secret, and bind approval ingress to its already approved dependent contract rather than redesigning it. Do not treat the design’s diagnosis as authorization to remove the ADR’s custody invariants. |

## Owner decision packet

1. Approve, reject, or revise the two successor-proposal mandates (C1, C2) under `ADR-G-019`.
2. Approve, reject, or revise the two amendment-proposal mandates (C3, C4).
3. Direct an authoritative memory-export recall for A1, A4, A5, A8, and A9 before their implementation admission.

Until those decisions are recorded, this crosswalk makes no product, ADR, or implementation change.

## Evidence basis

- `follow-up-works/OWASP-ASI-REVERIFY-2026-08-11.md`, §§8.2–8.3 and §9.2: nine-design inventory, four conflict types/routes, and bounded code-truth observations.
- `follow-up-works/dep-supply-defense-2026-08-11.md`, §§5 and repository anchors: the separately counted tenth evaluation and its `ADR-D-005` policy anchor.

---

## OWNER DECISIONS (Alperen, 2026-08-11 — codex cross-review sonrası)

- **C1-C4 mandate'leri: ŞARTLI ONAY.** Her proposal'ın zorunlu İLK çıktısı normative-field-diff
  matrisidir (exact eski alan → önerilen yeni alan → değişmeden korunan TÜM invariant'lar +
  immutable ADR'yi successor'lamaya yetki veren exact ADR-G-019 maddesi). Matris çürürse ilgili
  mandate düşer; tipleme (SUCCESSOR/AMENDMENT) matristen türetilir, `Immutable` bayrağından değil.
- **Paket madde 3: EVET** — A1/A4/A5/A8/A9 için authoritative memory-export recall B13'te tek
  mikro-task; sonuçları ilgili implementation satırlarına admission gate olarak bağlanır.
- Codex ikinci-görüş kaydı: verdict UNSOUND (tipleme mekaniği); şartlı-onay bu itirazı matris
  zorunluluğuyla içselleştirir. Kaynak: xverify bootstrap-seam analizi, 2026-08-11.
