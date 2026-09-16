# Deckent Design Skill Research and Adoption Decision

Status: owner-approved in design-lane; not landed to main

Date: 2026-08-25

Owner approval: Alperen, live instruction, 2026-08-25

Scope: Deckent product, Desktop, Terminal, Dashboard observability and shared design-system work

## Outcome

Deckent will not use a generic style database as product-design authority. The retired
ui-ux-pro-max package is replaced by a Deckent-native suite with a canonical source, explicit
domain routing, deterministic Codex/Claude projections and an independent evidence-backed critic.

The suite optimizes for product truth, agentic interaction semantics, long-session operator
clarity, accessibility, cross-surface parity, enterprise governance and implementation closure.
It does not optimize for style roulette or fast mockup novelty.

## Evaluation criteria

A candidate pattern was considered useful only when it met the relevant criteria below:

1. It has a clear trigger boundary and does not claim every design task.
2. It uses progressive disclosure instead of loading an encyclopedia into every turn.
3. It separates durable product rules from task-specific aesthetic exploration.
4. It turns subjective review into inspectable criteria and repeatable validation.
5. It supports real rendered-state comparison, accessibility and interaction evidence.
6. It does not fetch mutable remote instructions as runtime authority.
7. It can operate across Codex and Claude without semantic drift.
8. It respects Deckent product semantics, i18n, platform breadth and solo-to-enterprise scale.

## Source findings

| Source | Useful evidence | Deckent disposition |
|---|---|---|
| [OpenAI Skills documentation](https://developers.openai.com/codex/skills) | Concise discovery metadata, progressive loading and skill-local resources | Adopt the loading model and narrow descriptions |
| [OpenAI skill-creator](https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md) | Degrees of freedom, validators, scenario evaluation and concise instructions | Adopt as packaging and validation discipline |
| [OpenAI frontend-app-builder](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/skills/frontend-app-builder/SKILL.md) | Concept-to-browser iteration and rendered comparison | Selectively adopt visual comparison; reject image-first product authority |
| [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) | Portable metadata, instructions and resources with staged loading | Adopt for cross-host portability |
| [Anthropic skill best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Concision, freedom calibrated to task risk, real-use tests and validation loops | Adopt |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | Strong anti-template art direction, deliberate typography, motion and critique | Selectively adopt; it lacks Deckent agentic and enterprise semantics |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) | Practical interface and accessibility audit rules | Vendor or pin selected rules; never make mutable remote content runtime authority |
| [Google Labs DESIGN.md](https://github.com/google-labs-code/design.md) | Durable design context, token export, diff and lint concepts | Selectively adopt the persistent-contract and drift-gate ideas |
| [Impeccable](https://github.com/pbakaus/impeccable) | Product/operate separation, browser inspection, critique and deterministic detectors | Selectively adopt review patterns; do not install blanket taste as authority |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [ARIA APG](https://www.w3.org/WAI/ARIA/apg/) | Current testable accessibility criteria and interaction patterns | Normative baseline where applicable |
| [Design Tokens Format Module](https://www.designtokens.org/tr/drafts/format/) | Portable token types, aliases and group semantics | Directional standard; current repository format remains implementation truth |

## Why ui-ux-pro-max is retired

The local package was a broad searchable style/color/font/stack database with generic
recommendations and large duplicated payloads. Its Codex and Claude SKILL.md files had already
drifted. It also mixed unrelated stack prescriptions, style roulette and default visual recipes
with product-design decisions.

Those properties are actively harmful for Deckent:

- generic visual popularity can override product semantics;
- glass, glow, gradient and framework defaults can masquerade as identity;
- recommendations are not grounded in Deckent runtime states or authority boundaries;
- the package does not model Goal, Mission, Flow, Run, approvals, evidence or recovery;
- accessibility and enterprise governance are checklists rather than product structure;
- duplicated host copies have no parity gate.

Removal is therefore a replacement, not a capability reduction.

## Installation decision

No third-party design skill is installed wholesale. The useful patterns are adopted as reviewed
principles inside Deckent-owned packages; upstream repositories remain evidence, not runtime
instruction authority. This avoids mutable remote rules, dependency surprises, provider-specific
commands and imported taste becoming product policy. A future vendored rule set must be pinned,
license-reviewed, provenance-recorded and covered by the same evaluation corpus before admission.

## Adopted architecture

The canonical packages live under docs/design/skills. The same packages are projected
byte-for-byte to .claude/skills and .codex/skills by:

    node docs/design/tools/sync-design-skills.mjs --write
    node docs/design/tools/sync-design-skills.mjs --check

The manifest owns both the active suite and retired names. The write mode only replaces declared
managed packages and removes declared retired packages; it does not mutate unrelated skills.

The active suite is:

| Skill | Authority |
|---|---|
| deckent-design-dna | Entry router and non-negotiable product/design contract |
| deckent-product-design | Product model, journeys, IA and progressive complexity |
| deckent-agentic-ux | Agent/run semantics, autonomy, intervention, evidence and recovery |
| deckent-visual-language | Precision Instrument art direction and interaction expression |
| deckent-design-system | Components, tokens, variants and cross-surface governance |
| design-tokens-pipeline | Existing DTCG source/build/output wiring and drift proof |
| deckent-workspace-design | Desktop workspace, docking, focus and multi-platform behavior |
| deckent-terminal-design | CLI/TUI hierarchy, keyboard, stream and color degradation |
| deckent-enterprise-ux | Tenant, policy, approval, audit, secret and cost control UX |
| deckent-design-critic | Independent evidence-backed PASS, REVISE or NO-GO review |

## Authority and interaction model

Repository reality wins over a mockup. The current successor direction is Precision Instrument:
calm, formal, precise and dense where the job requires it. Execution semantics create hierarchy;
color and motion communicate meaning. Generic AI gradients, decorative glow, sci-fi HUD language,
template dashboards and default component-library appearance are not the default. NOVA may only
exist as an explicitly chosen operator visualization preset.

Durable identity decisions remain interactive. The design agent presents materially distinct
directions against the same workflow, states trade-offs and failure risks, and waits for owner
selection before treating a direction as authority. Minor implementation details that stay inside
an accepted contract do not create artificial approval pauses.

The sequence is:

1. Repository reality and exact product states.
2. Golden Workflow and failure/recovery variants.
3. Repeated interaction patterns.
4. Component contracts.
5. Primitive, semantic and component tokens.
6. Real-surface implementation evidence.
7. Independent critic verdict.

M0–M2 foundation gaps remain explicit dependencies; visual polish cannot relabel an unwired or
semantically false surface as production-complete.
