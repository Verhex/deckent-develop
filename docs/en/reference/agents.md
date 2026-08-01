# Agent catalog

## Product-user perspective

Deckent routes work to filesystem-backed personas. The canonical prompt for a built-in worker is `.deckent/agents/<id>/PROMPT.md`; pool loading follows project override → built-in fallback, validates definitions, and supports temporary/user/learned entries. Use `deckent agent list|info` to inspect the effective pool rather than assuming every persona is eligible for every task. [Evidence: `src/core/agent-pool.ts:18-104,264-320`; `src/cli/commands/agent.ts:221-523`]

The requested “21+2” catalog is represented here as 21 routable worker personas plus the Brain and Auditor control roles. The repository does not define that notation as a named contract, so the interpretation is `HOLD` pending OQ-21 confirmation. [Evidence: 21 `PROMPT.md` files under `.deckent/agents/`; `docs/analysis/OPEN-QUESTIONS-2026-08.md`, OQ-21]

| Worker persona | Primary output | Routing reality / constraint | Canonical evidence |
|---|---|---|---|
| `accessibility-auditor` | WCAG-focused findings and remediation | Reviewer role; audits rather than implements. | `.deckent/agents/accessibility-auditor/PROMPT.md`; `src/core/agent-role-contract.ts:8-26` |
| `api-builder` | REST/API implementation | Implementer; React/API domain map is used by routing. | `.deckent/agents/api-builder/PROMPT.md`; `src/core/agent-pool.ts:203-222` |
| `api-designer` | Transport-neutral request/result contract design | Unknown in the hardcoded role/domain maps, so loader fallback currently treats it as implementer/generic unless its manifest supplies fields. | `.deckent/agents/api-designer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31`; `src/core/agent-pool.ts:227-239` |
| `architect` | Architecture analysis and ADR design | Role map says implementer despite prompt saying advise/analyze; it also receives implementation candidacy score 6. | `.deckent/agents/architect/PROMPT.md`; `src/core/agent-role-contract.ts:9`; `src/core/agent-pool.ts:122-176` |
| `architecture-planner` | System decomposition and implementation planning | Analyst role, system domain. | `.deckent/agents/architecture-planner/PROMPT.md`; `src/core/agent-role-contract.ts:10`; `src/core/agent-pool.ts:203-222` |
| `bug-fixer` | Root-cause fix plus scoped regression proof | Implementer role, system domain. | `.deckent/agents/bug-fixer/PROMPT.md`; `src/core/agent-role-contract.ts:11`; `src/core/agent-pool.ts:203-222` |
| `ci-guardian` | Toolchain-aware CI/build/test health | Implementer role, test domain. | `.deckent/agents/ci-guardian/PROMPT.md`; `src/core/agent-role-contract.ts:17`; `src/core/agent-pool.ts:203-222` |
| `code-reviewer` | Severity-graded correctness/security/quality review | Reviewer role; should not be used as an implementation persona. | `.deckent/agents/code-reviewer/PROMPT.md`; `src/core/agent-role-contract.ts:12` |
| `data-engineer` | Schemas, queries, migrations, and pipelines | Implementer role, data domain. | `.deckent/agents/data-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:20`; `src/core/agent-pool.ts:203-222` |
| `devops-engineer` | CI/CD, containers, deployment, observability | Implementer role, devops domain. | `.deckent/agents/devops-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:21`; `src/core/agent-pool.ts:203-222` |
| `doc-writer` | Source-backed developer/user documentation | Implementer role, doc domain. | `.deckent/agents/doc-writer/PROMPT.md`; `src/core/agent-role-contract.ts:16`; `src/core/agent-pool.ts:203-222` |
| `frontend-designer` | Production UI/UX implementation | Implementer role, React domain. | `.deckent/agents/frontend-designer/PROMPT.md`; `src/core/agent-role-contract.ts:14`; `src/core/agent-pool.ts:203-222` |
| `i18n-specialist` | Message-catalog and locale-quality work | Not in hardcoded role/domain maps; fallback is implementer/generic unless manifest metadata overrides it. | `.deckent/agents/i18n-specialist/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |
| `implementer` | Neutral feature implementation | Own activation manifest supplies the implementation floor; generic implementation should route here before temporary specialists. | `.deckent/agents/implementer/PROMPT.md`; `src/core/agent-pool.ts:109-138` |
| `integration-engineer` | External-service adapters and integration closure | Not in hardcoded maps; fallback is implementer/generic unless declared by its manifest. | `.deckent/agents/integration-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |
| `migration-specialist` | Framework/data upgrade and compatibility migration | Implementer role, system domain. | `.deckent/agents/migration-specialist/PROMPT.md`; `src/core/agent-role-contract.ts:22`; `src/core/agent-pool.ts:203-222` |
| `observability-engineer` | Liveness, metrics, traces, and diagnosability | Not in hardcoded maps; fallback is implementer/generic unless declared by its manifest. | `.deckent/agents/observability-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |
| `performance-analyzer` | Measurement-backed bottleneck analysis | Analyst role, system domain. | `.deckent/agents/performance-analyzer/PROMPT.md`; `src/core/agent-role-contract.ts:19`; `src/core/agent-pool.ts:203-222` |
| `refactorer` | Behavior-preserving structural change | Implementer role, system domain; generic implementation candidacy was intentionally retired. | `.deckent/agents/refactorer/PROMPT.md`; `src/core/agent-role-contract.ts:13`; `src/core/agent-pool.ts:114-127` |
| `security-auditor` | Vulnerability and compliance findings | Reviewer role, security domain. | `.deckent/agents/security-auditor/PROMPT.md`; `src/core/agent-role-contract.ts:18`; `src/core/agent-pool.ts:203-222` |
| `terminal-ux-engineer` | Ink/React CLI interaction design | Not in hardcoded maps; fallback is implementer/generic unless declared by its manifest. | `.deckent/agents/terminal-ux-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |

### Control roles (+2)

| Role | Responsibility | Authority boundary | Evidence |
|---|---|---|---|
| Brain | Plans, admits, supervises, evaluates, fixes, and settles the lifecycle. | Does not treat a worker verdict as terminal truth; host evidence and policy gates remain authoritative. | `src/orchestra/brain.ts`; `src/orchestra/sprint-controller.ts:698,1594-1596` |
| Auditor | Independently scans liveness, scope, disk, locks, and authority signals. | Reports/verifies; write authority is constrained to dashboard/lock surfaces by role policy. | `src/monitor/auditor.ts:1340-1501`; `src/core/rule-generator.ts:123-125` |

## Dogfood / repository reality

- Only 15 of the 21 worker IDs are present in `BUILTIN_AGENT_ROLES` and `BUILTIN_AGENT_DOMAINS`; six rely on fallback or their loaded manifest. This is documented behavior, not inferred specialization. [Evidence: `src/core/agent-role-contract.ts:8-31`; `src/core/agent-pool.ts:203-239`]
- Unknown/custom personas default to role `implementer` and domain `generic`; a malformed activation block is validated at load time so one bad entry does not silently poison the pool. [Evidence: `src/core/agent-role-contract.ts:26-31`; `src/core/agent-pool.ts:227-320`]
- Temporary agents live under `.tasks/agents`, have a default pool ceiling of 50 and default maximum age of five sprints. [Evidence: `src/core/agent-pool.ts:243-258`]

See [Skills](skills.md) for orthogonal expertise packs and [Authority/RBAC](../governance/authority-rbac.md) for role permissions.
