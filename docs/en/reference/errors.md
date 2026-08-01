# Exit and error reference

## Product-user perspective

`DeckentError` carries a stable code plus message, suggestion, optional documentation link, “what happened,” “why,” and recovery steps. The CLI renders rich fields to stderr; an uncaught fatal error is redacted, best-effort logged under `.deckent/crashes/`, and exits 1. A diagnostic command may also return nonzero while still producing valid JSON, so automation must evaluate both the process exit and the response contract. [Evidence: `src/core/errors.ts:5-25,680-760`; `src/cli/helpers/error-handler.ts:14-88`; real-binary `connect --json`, 2026-08-01]

### Registered error codes

The table is the complete static `ErrorRegistry` snapshot. Recovery details are emitted by the formatter; the message column is the canonical short meaning. [Evidence: `src/core/errors.ts:27-666`]

| Code | Canonical message | Area |
|---|---|---|
| `DECKENT_E001` | tmux not found | prerequisite/backend |
| `DECKENT_E002` | claude CLI not found | provider prerequisite |
| `DECKENT_E003` | no DIRECTIVES.md | planning input |
| `DECKENT_E004` | config invalid | configuration/boundary input |
| `DECKENT_E005` | scope violation | authority |
| `DECKENT_E006` | lock conflict | concurrency |
| `DECKENT_E007` | usage exceeded | budget/admission |
| `DECKENT_E008` | build failed | verification |
| `DECKENT_E009` | git not found | prerequisite |
| `DECKENT_E010` | node version too low | prerequisite |
| `DECKENT_E020` | config file not found | CLI config |
| `DECKENT_E021` | import file not found | CLI config import |
| `DECKENT_E022` | invalid JSON in import file | CLI config import |
| `DECKENT_E023` | skill manifest not found | skill catalog |
| `DECKENT_E024` | invalid skill name | skill catalog |
| `DECKENT_E025` | skill already exists | skill catalog |
| `DECKENT_E026` | git clone failed | skill install |
| `DECKENT_E027` | cloned repo missing manifest | skill install |
| `DECKENT_E028` | invalid manifest.json | skill catalog |
| `DECKENT_E029` | source path not found | skill install |
| `DECKENT_E030` | source must be a directory | skill install |
| `DECKENT_E031` | agent config not found | agent catalog |
| `DECKENT_E032` | invalid agent name | agent catalog |
| `DECKENT_E033` | agent already exists | agent catalog |
| `DECKENT_E034` | manifest not found for publish | marketplace |
| `DECKENT_E035` | failed to parse manifest | marketplace |
| `DECKENT_E036` | not authenticated for marketplace | marketplace |
| `DECKENT_E037` | malformed global config | global config |
| `DECKENT_E038` | failed to read config file | configuration I/O |
| `DECKENT_E039` | skill name must be non-empty | skill/capability input |
| `DECKENT_E040` | pipeline must have at least 1 step | legacy multi-agent pipeline |
| `DECKENT_E041` | pipeline step has invalid agentId | legacy multi-agent pipeline |
| `DECKENT_E042` | pipeline step has invalid phase | legacy multi-agent pipeline |
| `DECKENT_E043` | pipeline has duplicate phase | legacy multi-agent pipeline |
| `DECKENT_E044` | shared memory write: invalid key | shared memory |
| `DECKENT_E045` | shared memory write: invalid writerId | shared memory |
| `DECKENT_E046` | handoff: missing task IDs | handoff |
| `DECKENT_E047` | handoff: empty artifacts | handoff |
| `DECKENT_E048` | handoff not found | handoff |
| `DECKENT_E049` | circular dependency detected | scheduler |
| `DECKENT_E050` | failed to stash changes | rollback safety point |
| `DECKENT_E051` | failed to get commit SHA | rollback safety point |
| `DECKENT_E052` | failed to create safety branch | rollback safety point |
| `DECKENT_E053` | rating must be 1-5 integer | marketplace rating |
| `DECKENT_E054` | observability not initialized | metrics/tracing |
| `DECKENT_E055` | sprint coordinator already running | lifecycle singleton |
| `DECKENT_E056` | not a git repository | rollback safety point |
| `DECKENT_E057` | stash pop failed — uncommitted changes trapped in stash | rollback safety point |
| `DECKENT_E060` | invalid JSON in task file | worker task input |
| `DECKENT_E061` | task file not found | worker task input |
| `DECKENT_E062` | shared context write: invalid key | worker communication |
| `DECKENT_E063` | shared context write: invalid agentId | worker communication |
| `DECKENT_E064` | agent already has active experiment | agent evolution |
| `DECKENT_E065` | experiment not found | agent evolution |
| `DECKENT_E066` | experiment is not active | agent evolution |
| `DECKENT_E067` | rule template not found | host rule generation |
| `DECKENT_E068` | sprint outcomes file not found | outcome learning |
| `DECKENT_E069` | failed to parse outcomes file | outcome learning |
| `DECKENT_E070` | task not found in sprint outcomes | outcome learning/provider capability |
| `DECKENT_E071` | failed to write outcomes file | outcome learning |
| `DECKENT_E072` | catalog source HTTP fetch failed | model catalog enrichment |
| `DECKENT_E073` | KPI definition formula error | KPI engine |
| `DECKENT_E074` | Directives-builder input invalid | planning contract |
| `DECKENT_E075` | path resolution failed | tool-exec filesystem boundary |
| `DECKENT_E076` | cross-verification prompt contract rejected | xverify authority |
| `DECKENT_E077` | execution authority evidence invalid | execution/settlement authority |
| `DECKENT_E078` | execution admission contract rejected | budget/backend admission |
| `DECKENT_E079` | Docker lifecycle safety contract failed | container lifecycle authority |

### Runtime-emitted codes outside the registry

| Code | Runtime meaning | Registration state | Evidence |
|---|---|---|---|
| `DECKENT_E081` | Docker image not found | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E082` | Docker port/name collision class | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E083` | Docker resource limit | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E084` | Unknown container-start failure | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E085` | Docker daemon unavailable | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E086` | Docker daemon permission denied | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E087` | Docker CLI absent | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E088` | Provider CLI missing in image | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E089` | Container ownership conflict | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E090` | Container authority unavailable | Not in `ErrorRegistry` | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E091` | Continuous-dispatch/recovery/settlement authority conflict family | Not in `ErrorRegistry`; emitted with reason suffixes | `src/orchestra/result-collector.ts:1659`; `src/orchestra/spawn-backend-docker.ts:4298-4770` |

`DECKENT_E080` has no source occurrence. `DECKENT_E100` and `DECKENT_E999` occur only as synthetic test inputs for extensibility/unknown-code behavior and are not production registry entries. [Evidence: repository-wide `rg "DECKENT_E"`, 2026-08-01; `tests/core/errors.test.ts:114-136`]

## Exit behavior

- Success is normally exit 0; command-level readiness diagnostics may intentionally set nonzero while returning structured JSON. [Evidence: real-binary `connect --json`, exit 1 with valid payload, 2026-08-01]
- Fatal uncaught exceptions/rejections exit 1 after redaction and best-effort crash logging. [Evidence: `src/cli/helpers/error-handler.ts:70-112`]
- A code printed in a result note is not automatically a `DeckentError`; consumers must preserve the surrounding typed contract and reason suffix. [Evidence: `src/orchestra/spawn-backend-docker.ts:4298-4770`]

## Dogfood / repository reality

⚠️ The registry stops at E079, while live source emits E081–E091. This means `ErrorRegistry.createError()` cannot supply the documented rich recovery fields for those codes; the mismatch is a code-doc diff, not normalized away here. [Evidence: `src/core/errors.ts:27-666,680-710`; `src/orchestra/spawn-backend-docker.ts:2447-2461`]
