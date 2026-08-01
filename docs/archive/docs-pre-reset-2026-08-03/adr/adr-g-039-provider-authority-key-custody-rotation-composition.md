# ADR-G-039: Provider Authority Key Custody, Rotation & Composition

**Status:** accepted

**Sprint:** _To be backfilled_

**Class:** ADR-G · **Scope:** global+project · **Immutable:** no · **Source:** user · **Enforcement-Level:** hard

---

Status: accepted. Owner: Alperen. Date: 2026-07-23.

**Decision:** Provider dispatch authority is host-global and versioned. Secret keyring revisions live only below the platform dataDir; ProviderTruth and ProviderLimit ledgers live below stateDir. The keyring has one active signing key, retired verify-only keys, an immutable account-pseudonym root, content-chained append-only revisions, and exact key IDs on every signed store record. HKDF-SHA256 domain separation is mandatory for truth integrity, limit integrity, and account pseudonymization. Raw account identity is never persisted; correlation is tenant/provider/auth-mode scoped HMAC. A missing or unsafe keyring, missing tenant/policy/account/producer authority, unknown historical key, or unverifiable schema causes a typed pre-dispatch HOLD; it never selects another key or fallback provider. Solo mode may default tenant to local; enterprise mode without an explicit verified tenant must HOLD. Legacy Truth/Limit schema migration is explicit, transactional, owner-run, and never constructor-implicit. Composition may boot the control plane unavailable, but cannot grant provider dispatch until all authorities are present. Key rotation and schema key-id support are one coherent delivery boundary. Approval ingress, recurring-trigger occurrence ledger, and sealed evidence archive remain separate dependent slices under their already approved contracts.
