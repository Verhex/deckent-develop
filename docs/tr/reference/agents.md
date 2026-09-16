# Agent kataloğu

## Product-user perspektifi

Deckent işi filesystem-backed persona'lara route eder. Built-in worker'ın canonical prompt'u `.deckent/agents/<id>/PROMPT.md` dosyasıdır; pool loading project override → built-in fallback sırasını izler, definition doğrular ve temporary/user/learned entry destekler. Her persona'nın her task için eligible olduğunu varsaymak yerine effective pool'u `deckent agent list|info` ile incele. [Kanıt: `src/core/agent-pool.ts:18-104,264-320`; `src/cli/commands/agent.ts:221-523`]

İstenen “21+2” katalog burada 21 routable worker persona ile Brain ve Auditor control role'leri olarak temsil edildi. Repository bu yazımı named contract olarak tanımlamıyor; bu nedenle yorum OQ-21 onayına kadar `HOLD`'dur. [Kanıt: `.deckent/agents/` altında 21 `PROMPT.md`; `docs/analysis/OPEN-QUESTIONS-2026-08.md`, OQ-21]

| Worker persona | Primary output | Routing gerçeği / kısıtı | Canonical kanıt |
|---|---|---|---|
| `accessibility-auditor` | WCAG-focused finding ve remediation | Reviewer role; implement etmez, audit eder. | `.deckent/agents/accessibility-auditor/PROMPT.md`; `src/core/agent-role-contract.ts:8-26` |
| `api-builder` | REST/API implementation | Implementer; React/API domain map routing tarafından kullanılır. | `.deckent/agents/api-builder/PROMPT.md`; `src/core/agent-pool.ts:203-222` |
| `api-designer` | Transport-neutral request/result contract design | Hardcoded role/domain map'te yoktur; manifest alan sağlamazsa loader fallback implementer/generic olur. | `.deckent/agents/api-designer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31`; `src/core/agent-pool.ts:227-239` |
| `architect` | Architecture analysis ve ADR design | Prompt advise/analyze derken role map implementer der; ayrıca implementation candidacy score 6 alır. | `.deckent/agents/architect/PROMPT.md`; `src/core/agent-role-contract.ts:9`; `src/core/agent-pool.ts:122-176` |
| `architecture-planner` | System decomposition ve implementation planning | Analyst role, system domain. | `.deckent/agents/architecture-planner/PROMPT.md`; `src/core/agent-role-contract.ts:10`; `src/core/agent-pool.ts:203-222` |
| `bug-fixer` | Root-cause fix ve scoped regression proof | Implementer role, system domain. | `.deckent/agents/bug-fixer/PROMPT.md`; `src/core/agent-role-contract.ts:11`; `src/core/agent-pool.ts:203-222` |
| `ci-guardian` | Toolchain-aware CI/build/test health | Implementer role, test domain. | `.deckent/agents/ci-guardian/PROMPT.md`; `src/core/agent-role-contract.ts:17`; `src/core/agent-pool.ts:203-222` |
| `code-reviewer` | Severity-graded correctness/security/quality review | Reviewer role; implementation persona olarak kullanılmamalıdır. | `.deckent/agents/code-reviewer/PROMPT.md`; `src/core/agent-role-contract.ts:12` |
| `data-engineer` | Schema, query, migration ve pipeline | Implementer role, data domain. | `.deckent/agents/data-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:20`; `src/core/agent-pool.ts:203-222` |
| `devops-engineer` | CI/CD, container, deployment ve observability | Implementer role, devops domain. | `.deckent/agents/devops-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:21`; `src/core/agent-pool.ts:203-222` |
| `doc-writer` | Source-backed developer/user documentation | Implementer role, doc domain. | `.deckent/agents/doc-writer/PROMPT.md`; `src/core/agent-role-contract.ts:16`; `src/core/agent-pool.ts:203-222` |
| `frontend-designer` | Production UI/UX implementation | Implementer role, React domain. | `.deckent/agents/frontend-designer/PROMPT.md`; `src/core/agent-role-contract.ts:14`; `src/core/agent-pool.ts:203-222` |
| `i18n-specialist` | Message-catalog ve locale-quality işi | Hardcoded map'lerde yoktur; manifest override etmezse implementer/generic fallback kullanır. | `.deckent/agents/i18n-specialist/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |
| `implementer` | Neutral feature implementation | Kendi activation manifesti implementation floor'u sağlar; generic implementation temporary specialist'ten önce buraya route olmalıdır. | `.deckent/agents/implementer/PROMPT.md`; `src/core/agent-pool.ts:109-138` |
| `integration-engineer` | External-service adapter ve integration closure | Hardcoded map'lerde yoktur; manifest bildirmezse implementer/generic fallback kullanır. | `.deckent/agents/integration-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |
| `migration-specialist` | Framework/data upgrade ve compatibility migration | Implementer role, system domain. | `.deckent/agents/migration-specialist/PROMPT.md`; `src/core/agent-role-contract.ts:22`; `src/core/agent-pool.ts:203-222` |
| `observability-engineer` | Liveness, metrics, traces ve diagnosability | Hardcoded map'lerde yoktur; manifest bildirmezse implementer/generic fallback kullanır. | `.deckent/agents/observability-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |
| `performance-analyzer` | Measurement-backed bottleneck analysis | Analyst role, system domain. | `.deckent/agents/performance-analyzer/PROMPT.md`; `src/core/agent-role-contract.ts:19`; `src/core/agent-pool.ts:203-222` |
| `refactorer` | Behavior-preserving structural change | Implementer role, system domain; generic implementation candidacy bilinçli olarak kaldırılmıştır. | `.deckent/agents/refactorer/PROMPT.md`; `src/core/agent-role-contract.ts:13`; `src/core/agent-pool.ts:114-127` |
| `security-auditor` | Vulnerability ve compliance findings | Reviewer role, security domain. | `.deckent/agents/security-auditor/PROMPT.md`; `src/core/agent-role-contract.ts:18`; `src/core/agent-pool.ts:203-222` |
| `terminal-ux-engineer` | Ink/React CLI interaction design | Hardcoded map'lerde yoktur; manifest bildirmezse implementer/generic fallback kullanır. | `.deckent/agents/terminal-ux-engineer/PROMPT.md`; `src/core/agent-role-contract.ts:26-31` |

### Control role'leri (+2)

| Role | Sorumluluk | Authority boundary | Kanıt |
|---|---|---|---|
| Brain | Lifecycle'ı planlar, admit eder, supervise eder, evaluate/fix/settle eder. | Worker verdict'ünü terminal truth saymaz; host evidence ve policy gate'leri authority olarak kalır. | `src/orchestra/brain.ts`; `src/orchestra/sprint-controller.ts:698,1594-1596` |
| Auditor | Liveness, scope, disk, lock ve authority sinyallerini bağımsız scan eder. | Raporlar/doğrular; write authority role policy ile dashboard/lock yüzeylerine sınırlıdır. | `src/monitor/auditor.ts:1340-1501`; `src/core/rule-generator.ts:123-125` |

## Dogfood / repository gerçeği

- 21 worker ID'sinin yalnız 15'i `BUILTIN_AGENT_ROLES` ve `BUILTIN_AGENT_DOMAINS` içinde yer alır; altısı fallback veya loaded manifest kullanır. Bu documented behavior'dır, uydurulmuş specialization değildir. [Kanıt: `src/core/agent-role-contract.ts:8-31`; `src/core/agent-pool.ts:203-239`]
- Unknown/custom persona role için `implementer`, domain için `generic` default alır; malformed activation block load sırasında validate edilir. [Kanıt: `src/core/agent-role-contract.ts:26-31`; `src/core/agent-pool.ts:227-320`]
- Temporary agent'lar `.tasks/agents` altında yaşar; default pool ceiling 50, default maximum age beş sprinttir. [Kanıt: `src/core/agent-pool.ts:243-258`]

Orthogonal expertise pack'leri için [Skills](skills.md), role permission'ları için [Authority/RBAC](../governance/authority-rbac.md) belgesine bak.
