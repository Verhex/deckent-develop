# Exit ve error reference

## Product-user perspektifi

`DeckentError`; stable code, message, suggestion, opsiyonel documentation link, “what happened,” “why” ve recovery step'leri taşır. CLI rich field'ları stderr'e render eder; uncaught fatal error redact edilir, best-effort `.deckent/crashes/` altına loglanır ve exit 1 verir. Diagnostic command valid JSON üretirken nonzero da dönebilir; automation hem process exit'i hem response contract'ını değerlendirmelidir. [Kanıt: `src/core/errors.ts:5-25,680-760`; `src/cli/helpers/error-handler.ts:14-88`; gerçek-binary `connect --json`, 2026-08-01]

### Registered error code'ları

Tablo static `ErrorRegistry` snapshot'ının tamamıdır. Recovery detail formatter tarafından gösterilir; message sütunu canonical kısa anlamdır. [Kanıt: `src/core/errors.ts:27-666`]

| Code | Canonical message | Alan |
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

### Registry dışındaki runtime-emitted code'lar

| Code | Runtime anlamı | Registration durumu | Kanıt |
|---|---|---|---|
| `DECKENT_E081` | Docker image not found | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E082` | Docker port/name collision class | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E083` | Docker resource limit | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E084` | Unknown container-start failure | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E085` | Docker daemon unavailable | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E086` | Docker daemon permission denied | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E087` | Docker CLI absent | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E088` | Provider CLI missing in image | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E089` | Container ownership conflict | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E090` | Container authority unavailable | `ErrorRegistry` içinde değil | `src/orchestra/spawn-backend-docker.ts:2447-2461` |
| `DECKENT_E091` | Continuous-dispatch/recovery/settlement authority conflict ailesi | `ErrorRegistry` içinde değil; reason suffix ile emit edilir | `src/orchestra/result-collector.ts:1659`; `src/orchestra/spawn-backend-docker.ts:4298-4770` |

`DECKENT_E080` source occurrence taşımaz. `DECKENT_E100` ve `DECKENT_E999` yalnız extensibility/unknown-code davranışı için synthetic test input olarak geçer; production registry entry değildir. [Kanıt: repository-wide `rg "DECKENT_E"`, 2026-08-01; `tests/core/errors.test.ts:114-136`]

## Exit davranışı

- Success normalde exit 0'dır; command-level readiness diagnostic, structured JSON üretirken bilinçli nonzero dönebilir. [Kanıt: gerçek-binary `connect --json`, valid payload ile exit 1, 2026-08-01]
- Fatal uncaught exception/rejection, redaction ve best-effort crash log sonrası exit 1 verir. [Kanıt: `src/cli/helpers/error-handler.ts:70-112`]
- Result note içinde yazılan code otomatik olarak `DeckentError` değildir; consumer çevresindeki typed contract ve reason suffix'i korumalıdır. [Kanıt: `src/orchestra/spawn-backend-docker.ts:4298-4770`]

## Dogfood / repository gerçeği

⚠️ Registry E079'da biterken live source E081–E091 emit eder. Bu nedenle `ErrorRegistry.createError()` bu code'lar için documented rich recovery field'larını üretemez; uyumsuzluk burada normalize edilmez, code-doc diff olarak kaydedilir. [Kanıt: `src/core/errors.ts:27-666,680-710`; `src/orchestra/spawn-backend-docker.ts:2447-2461`]
