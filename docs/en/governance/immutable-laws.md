# The three Immutable Laws

The laws below are Deckent's constitution. They apply across prompts, models, sessions, environments, repository dogfood, and the product delivered to users. They are not optional presets and an agent cannot waive them. [Evidence: `AGENTS.md:12-38`]

## Product-user perspective

### Law 1 — DUAL LENS + SCALE

Every task, feature, and decision must be designed simultaneously for Deckent's orchestration quality and for the end-user experience. “User” includes a solo operator and the largest multi-tenant enterprise; internal plumbing alone is not a complete design. [Evidence: `AGENTS.md:18-23`]

Product consequences:

- A capability needs an understandable user workflow and an observable internal evidence path.
- Defaults must work for a solo project while policy, tenancy, audit, and capacity contracts can scale without changing the semantic model.
- Documentation must report both desired use and today's dogfood status; this is why every manual page separates those perspectives.

[Evidence: `AGENTS.md:18-23`; `.deckent/workspace/IDENTITY.md:5-10`]

### Law 2 — EVERY ENVIRONMENT

Every feature is designed for macOS, Linux, native Windows, WSL, and further environments behind platform adapters. Unsupported combinations must fail explicitly rather than silently selecting a different contract. [Evidence: `AGENTS.md:25-31`; `.deckent/workspace/IDENTITY.md:14-16`]

Product consequences:

- Paths, shells, process control, worker backends, credential resolution, and installation are platform concerns, not assumptions hidden in business logic.
- Provider, model, account, backend, and capability decisions come from runtime evidence and effective config.
- “Works on this machine” is diagnostic evidence, not cross-platform certification.

[Evidence: `AGENTS.md:80-110`; `src/core/state-paths.ts`; `src/core/system-profile.ts`; `src/orchestra/spawn-backend.ts`]

### Law 3 — NEVER MVP

Deckent does not use minimal-now/later-quality proposals as a design policy. Work is expected to be domain-expert, enterprise-grade, wired through production, and honest about incomplete authority. [Evidence: `AGENTS.md:33-37,40-64`]

Product consequences:

- A foundation-only module is not DONE unless its approved dependency chain includes the production closure and that closure succeeds.
- User-visible strings use the i18n system rather than being embedded in mechanism modules.
- Risky behavior is gated and verified before default enablement.
- An unresolved constraint is reported as typed HOLD, not hidden behind a success label.

[Evidence: `AGENTS.md:47-64,125-128`]

## Applying all three laws

| Decision question | Law 1 | Law 2 | Law 3 |
|---|---|---|---|
| Who benefits and who operates it? | Solo and enterprise users plus dogfood quality. | Tenants and hosts may differ. | Ownership and support model must be complete. |
| Where can it run? | User experience is consistent across surfaces. | Platform matrix is explicit. | Unsupported cells fail honestly. |
| What proves it works? | Product outcome and orchestration evidence. | Platform/provider-specific proof. | Production wiring plus real execution, not an isolated unit. |
| What if authority is missing? | Explain impact to user and operator. | Do not silently fall back across environment/provider. | Typed HOLD until authority exists. |

[Evidence: `AGENTS.md:12-64,80-110,125-128`]

## Dogfood / repository reality

| Governance layer | State | Current finding |
|---|---|---|
| Constitutional text | ✅ live | All three laws are present in the host contract and are above operating rules in precedence. [Evidence: `AGENTS.md:12-38,124-128`] |
| Identity alignment | ✅ live | Identity defines Trinity, both audiences, the platform matrix, provider neutrality, and the authority chain. [Evidence: `.deckent/workspace/IDENTITY.md:3-18`] |
| Proof-of-function enforcement | ⚠️ partial | The craft rule requires real-binary proof, but current autonomous certification remains HOLD. [Evidence: `AGENTS.md:47-61`; `PAZARTESI.md:36-60`] |
| Cross-environment certification | ⚠️ partial | State-path, system-profile and spawn-backend abstractions plus test scripts exist; this documentation run did not execute the full platform matrix. [Evidence: `src/core/state-paths.ts`; `src/core/system-profile.ts`; `src/orchestra/spawn-backend.ts`; `scripts/test-e2e-surfaces.mjs`] |
| Enterprise enforcement boundary | ⚠️ partial | Repository hooks/policies are not an unbypassable admin boundary; managed requirements are required for that claim. [Evidence: `AGENTS.md:124-128`] |

The laws define the required direction; the status table states what the current repository has actually proven. Neither substitutes for the other.
