# Database reference

## Product-user perspective

### Verification method and scope

Six SQLite authority files were found under `.brain/` and `.deckent/`. They were opened with `better-sqlite3` using `{ readonly: true, fileMustExist: true }`; `PRAGMA user_version`, `PRAGMA table_info(<table>)`, `sqlite_master`, file size, and read-only row counts were captured on 2026-08-01. The host did not have the `sqlite3` shell, so the same SQLite pragmas were executed through the repository's native SQLite dependency. [Evidence: command importing `better-sqlite3` and opening the six paths read-only, 2026-08-01; `package.json` dependency `better-sqlite3`]

Notation: `!` means `NOT NULL`; `PK1`, `PK2`, … are SQLite primary-key positions. Row counts are a dated state snapshot, not schema constants.

| File | Bytes | `user_version` | Tables | Source owner |
|---|---:|---:|---:|---|
| `.brain/memory.db` | 23,543,808 | 0 | 14, including FTS5 internals | `src/core/memory-store.ts:100-338`; `src/core/doc-tracking/store.ts:17-89`; `src/core/kpi/kpi-store.ts:142-281` |
| `.deckent/autonomous/autonomous.db` | 188,416 | 0 | 14 | `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:172-384` |
| `.deckent/identity.db` | 20,480 | 0 | 2 | `src/connectors/identity/identity-store.ts:19-114` |
| `.deckent/provider-execution-observations.db` | 102,400 | 1 | 2 | `src/core/provider-execution-observation-store.ts:114-169` |
| `.deckent/runtime/invocations.db` | 352,256 | 0 | 3 | `src/core/invocation-receipt-store.ts:705-850` |
| `.deckent/runtime/run-flow-store/run-flow-authority.sqlite` | 6,483,968 | 3 | 8 | `src/core/run-flow-store.ts:337-488` |

### `.brain/memory.db`

This is the product memory database, distinct from repository-local host/agent core-memory files. It stores entries, FTS projection, relations, history, document freshness, and KPI facts/projections. [Evidence: `AGENTS.md:69-73`; `src/core/memory-store.ts:100-338`; `src/core/doc-tracking/store.ts:17-89`; `src/core/kpi/kpi-store.ts:142-281`]

| Table | Rows | Actual `PRAGMA table_info` columns |
|---|---:|---|
| `entries` | 1,764 | `id TEXT PK1`; `type TEXT!`; `source TEXT!`; `title TEXT!`; `content TEXT!`; `summary TEXT`; normalized/search fields `tag_text,title_norm,content_norm,summary_norm,tag_norm TEXT!`; `status,priority TEXT!`; `sprint_id TEXT`; `sprint_num INTEGER!`; `lang TEXT!`; `decay_exempt INTEGER!`; `metadata TEXT!`; `tenant_id TEXT`; `created_at,updated_at TEXT!`; `deleted_at,audit_prev_hmac,audit_hmac,adr_class,scope TEXT`; `immutable INTEGER`; `source_authority,enforcement_level TEXT` |
| `tags` | 26,265 | `entry_id TEXT PK1!`; `tag TEXT PK2!` |
| `relations` | 905 | `from_id TEXT PK1!`; `to_id TEXT PK2!`; `rel_type TEXT PK3!`; `created_at TEXT!` |
| `entry_history` | 3,035 | `id INTEGER PK1`; `entry_id TEXT!`; `field TEXT!`; `old_value,new_value TEXT`; `changed_by,change_type,changed_at TEXT!` |
| `schema_version` | 1 | `version INTEGER PK1`; `applied_at TEXT!` |
| `doc_tracking` | 1,929 | `path TEXT PK1`; `content_hash,last_updated,status,state,signals,tracked_code,first_seen,last_scanned TEXT`; `doc_rank INTEGER`; `stale_score,priority_score REAL` |
| `kpi_measurements` | 2,387 | `id TEXT PK1`; `tenant_id,measure_id TEXT!`; `value REAL!`; `kind,unit,sprint_id TEXT!`; `task_id TEXT`; `ts,tags TEXT!` |
| `kpi_rollups` | 2,343 | `tenant_id TEXT PK1!`; `measure_id TEXT PK2!`; `grain TEXT PK3!`; `period_key TEXT PK4!`; `agg_count INTEGER!`; `agg_sum REAL!`; `agg_min,agg_max,agg_last REAL`; `updated_at TEXT!` |
| `kpi_results` | 1,704 | `tenant_id TEXT PK1!`; `kpi_id TEXT PK2!`; `grain TEXT PK3!`; `period_key TEXT PK4!`; `value REAL!`; `target REAL`; `status,computed_at TEXT!` |
| `entries_fts` | 1,764 | FTS5 fields `title,content,summary,tag_text,title_norm,content_norm,summary_norm,tag_norm` |
| `entries_fts_config` | 1 | `k PK1!`; `v` |
| `entries_fts_data` | 789 | `id INTEGER PK1`; `block BLOB` |
| `entries_fts_docsize` | 1,764 | `id INTEGER PK1`; `sz BLOB` |
| `entries_fts_idx` | 775 | `segid PK1!`; `term PK2!`; `pgno` |

[Evidence for every row: actual read-only PRAGMA/COUNT output, 2026-08-01]

Memory migration authority uses its own `schema_version` table; the recorded row is version `1`, applied `2026-06-04`, while SQLite `user_version` remains `0`. FTS insert/update/delete triggers keep the virtual table aligned with `entries`. [Evidence: actual read-only query and `sqlite_master`, 2026-08-01; `src/core/memory-store.ts:126-179,273-338`]

### `.deckent/autonomous/autonomous.db`

| Table | Rows | Actual `PRAGMA table_info` columns |
|---|---:|---|
| `missions` | 4 | `id TEXT PK1`; `kind,status,tenant,title TEXT!`; `spec,created_by,deliver_to TEXT`; `render_as TEXT!`; `progress TEXT`; `created_at,updated_at TEXT!`; `completed_at,last_result TEXT` |
| `work_items` | 5 | `id TEXT PK1`; `mission_id,kind,status TEXT!`; `spec TEXT`; `policy,render_as TEXT!`; `progress,depends_on,trigger,claimed_at,claimed_by TEXT`; `created_at,updated_at TEXT!`; `last_result TEXT`; `revision INTEGER!`; `claim_registry_revision,claim_registry_digest,claim_attempt_id,claim_fence_token_hash TEXT` |
| `mission_graph_authorities` | 0 | `mission_id TEXT PK1`; `schema_version INTEGER!`; `authority_state TEXT!`; `graph_revision INTEGER!`; `graph_digest,source_kind TEXT!`; `activation_json,activation_digest,activated_at,quarantine_reason TEXT`; `updated_at TEXT!` |
| `work_item_dependencies` | 0 | `mission_id TEXT PK1!`; `work_item_id TEXT PK2!`; `dependency_item_id TEXT PK3!`; `admitted_revision INTEGER!`; `created_at TEXT!` |
| `work_item_dependency_readiness` | 0 | `mission_id TEXT PK1!`; `work_item_id TEXT PK2!`; `graph_revision,remaining_count,failed_count INTEGER!`; `updated_at TEXT!` |
| `mission_dependency_reconcile_queue` | 0 | `mission_id TEXT PK1!`; `upstream_item_id TEXT PK2!`; `upstream_revision INTEGER PK3!`; `outcome TEXT PK4!`; `cursor_work_item_id TEXT!`; `turn_seq INTEGER!`; `state,created_at,updated_at TEXT!` |
| `mission_graph_migration_evidence` | 0 | `mission_id TEXT PK1`; `source_digest,graph_digest,evidence_json,evidence_digest,created_at TEXT!` |
| `work_item_admission_fences` | 0 | `work_item_id TEXT PK1`; `schema_version INTEGER!`; `registry_revision,registry_digest,item_kind,runner_revision,item_definition_digest,created_at TEXT!` |
| `work_item_approvals` | 0 | `work_item_id TEXT PK1`; `request_id,request_json,publish_state,decision_state TEXT!`; `decision_json TEXT`; `created_at TEXT!`; `published_at,decided_at TEXT`; `updated_at TEXT!` |
| `mission_acceptance_decisions` | 0 | `mission_id TEXT PK1!`; `round INTEGER PK2!`; `contract_digest,decision_digest,record_json,created_at TEXT!` |
| `mission_engine_lease` | 0 | `singleton_id INTEGER PK1`; `owner_id TEXT!`; `epoch INTEGER!`; `lease_token_hash,acquired_at,renewed_at,expires_at TEXT!`; `expires_at_ms INTEGER!` |
| `mission_dispatch_recoveries` | 0 | `recovery_id TEXT PK1`; `attempt_id,payload_json,payload_hash,captured_at TEXT!` |
| `mission_dispatch_recovery_acknowledgements` | 0 | `recovery_id TEXT PK1`; `payload_json,payload_hash,acknowledged_at TEXT!` |

[Evidence for every row: actual read-only PRAGMA/COUNT output, 2026-08-01; schema construction `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:172-384`]

The zero-row authority tables are referenced by the current mission store and cannot be classified as dead from row count alone. The snapshot proves that their production path had not persisted rows in this database at capture time. [Evidence: table-name references throughout `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:1172-2567`; PRAGMA/COUNT snapshot]

### `.deckent/identity.db`

| Table | Rows | Actual `PRAGMA table_info` columns |
|---|---:|---|
| `social_identity` | 0 | `connector TEXT PK1!`; `external_id TEXT PK2!`; `tenant_id TEXT PK3!`; `principal_id,role TEXT!`; `verified INTEGER!`; `method,updated_at TEXT!` |
| `pending_verify` | 0 | `connector TEXT PK1!`; `external_id TEXT PK2!`; `code,email,tenant_id TEXT!`; `expires_at INTEGER!`; `attempts INTEGER!` |

[Evidence: actual read-only PRAGMA/COUNT output, 2026-08-01; `src/connectors/identity/identity-store.ts:19-114`]

Both tables have active store consumers; zero rows means no captured identity/pending-verification records in this project snapshot, not dead schema. [Evidence: `src/connectors/identity/identity-store.ts:38-114`]

### `.deckent/models.db`

| Table | Current schema columns |
|---|---|
| `model_activation` | `provider TEXT PK1!`; `model_id TEXT PK2!`; `active INTEGER!`; `updated_at TEXT!`; `actor TEXT!` |

This store records an owner's activation decision for each detected provider/model pair. Its composite primary key is `(provider, model_id)`. A model without a record is active, so the store is an opt-in denial list and its introduction does not narrow an existing project's eligible model pool. [Evidence: `src/core/model-activation-store.ts:50-57,84-109`]

### `.deckent/provider-execution-observations.db`

| Table | Rows | Actual on-disk v1 columns |
|---|---:|---|
| `provider_execution_intervals` | 53 | `execution_id TEXT PK1`; `task_id,attempt_id,principal_digest,fence,start_json TEXT!`; `end_json TEXT`; `start_sequence INTEGER!`; `end_sequence INTEGER` |
| `provider_execution_contradictions` | 0 | `contradiction_id INTEGER PK1`; `principal_digest,payload_json TEXT!` |

[Evidence: actual read-only PRAGMA/COUNT output, 2026-08-01]

Current source declares schema version `2` and adds nullable `run_id`, non-null `retired DEFAULT 0`, and a run-scope index. The on-disk database remains `user_version=1` and lacks both columns. Read-only consumers deliberately adapt v1 as legacy-unowned evidence; a writable open migrates v1 to v2. Until that controlled migration occurs and is verified, exact run ownership in the existing rows is `HOLD`. [Evidence: `src/core/provider-execution-observation-store.ts:14,31-56,114-169`; actual PRAGMA snapshot]

### `.deckent/runtime/invocations.db`

| Table | Rows | Actual `PRAGMA table_info` columns |
|---|---:|---|
| `invocation_project_bindings` | 1 | `root_digest TEXT PK1`; `project_id,created_at TEXT!` |
| `invocations` | 47 | `invocation_id TEXT PK1`; `tenant_id,project_id,idempotency_key TEXT!`; `schema_version INTEGER!`; `payload_json,payload_hash,created_at TEXT!` |
| `invocation_events` | 113 | `event_id TEXT PK1`; `invocation_id,tenant_id,project_id TEXT!`; `sequence INTEGER!`; `event_type,occurred_at,payload_json,payload_hash TEXT!`; `prev_hash TEXT`; `event_hash TEXT!` |

[Evidence: actual read-only PRAGMA/COUNT output, 2026-08-01; `src/core/invocation-receipt-store.ts:705-850`]

The store installs immutable update/delete guards for receipt evidence. [Evidence: `src/core/invocation-receipt-store.ts:794-850`]

### `.deckent/runtime/run-flow-store/run-flow-authority.sqlite`

| Table | Rows | Actual `PRAGMA table_info` columns |
|---|---:|---|
| `run_flow_records` | 321 | `kind TEXT PK1!`; `flow_id TEXT PK2!`; `ordinal INTEGER PK3!`; `sequence INTEGER`; `command_id,event_type TEXT`; `payload_json,payload_hash,created_at,source TEXT!` |
| `run_flow_commands` | 158 | `flow_id TEXT PK1!`; `command_id TEXT PK2!`; `payload_hash TEXT!`; `first_sequence,last_sequence,event_count INTEGER!`; `committed_at TEXT!` |
| `run_flow_projection_state` | 125 | `kind TEXT PK1!`; `flow_id TEXT PK2!`; `projected_ordinal INTEGER!`; `projected_at TEXT!` |
| `run_flow_store_meta` | 1 | `key TEXT PK1!`; `value TEXT!` |
| `run_flow_migration_issues` | 0 | `source_file TEXT PK1!`; `line_number INTEGER PK2!`; `reason,observed_at TEXT!` |
| `run_flow_start_attempt_identities` | 15 | `flow_id TEXT PK1!`; `generation INTEGER PK2!`; `attempt_id TEXT!`; `revision INTEGER!`; `plan_digest,tenant_id,correlation_id,idempotency_key,lineage_hash,created_at TEXT!` |
| `run_flow_start_attempt_journal` | 58 | `flow_id TEXT PK1!`; `generation INTEGER PK2!`; `sequence INTEGER PK3!`; `revision INTEGER!`; `plan_digest,attempt_id,state,payload_json,payload_hash,recorded_at TEXT!` |
| `run_flow_recovery_manifests` | 0 | `flow_id TEXT PK1!`; `generation INTEGER PK2!`; `attempt_id,payload_json,payload_hash,recorded_at TEXT!` |

[Evidence for every row: actual read-only PRAGMA/COUNT output, 2026-08-01; `src/core/run-flow-store.ts:337-488`]

The run-flow store reports `user_version=3`; current source creates and migrates through that version. Its zero-row issue/recovery tables have live read/write references, so no structural dead table was proven. [Evidence: actual PRAGMA; `src/core/run-flow-store.ts:337-488` and table-name reference scan]

### Migration assessment

| Finding | Status |
|---|---|
| Provider observation code v2 vs disk v1 | Confirmed mismatch; controlled write-open migration pending. |
| Memory version tracking | Valid but uses a `schema_version` table while `user_version` is 0. |
| Run-flow version tracking | `user_version=3`, aligned with current source. |
| Autonomous, identity, invocation `user_version` | All 0; schemas are created with `CREATE TABLE IF NOT EXISTS`, with versioning partly embedded in row-level fields. A unified migration policy is not evident from these files alone. |
| Dead tables | None proven. Empty authority tables all have source references; production reachability needs execution evidence, not a row-count inference. |

[Evidence: six-database PRAGMA snapshot; source constructors cited above; typed question `docs/analysis/OPEN-QUESTIONS-2026-08.md`]

## Dogfood / repository reality

| Database fact | State | Current finding |
|---|---|---|
| Six-store inventory | ✅ verified | Six files and 43 tables were read with read-only PRAGMA/COUNT queries. |
| Memory authority | ✅ live | DB-first entries, search, relations, history, docs tracking and KPI tables contain live rows. |
| RunFlow authority | ✅ live | Schema `user_version=3` and current records/journal rows are present. |
| Provider observation | ⚠️ migration HOLD | Source v2 versus disk v1 is confirmed (OQ-07). |
| Unified migration governance | ⚠️ HOLD | Version mechanisms differ across stores (OQ-08). |
| Empty authority tables | ⚠️ unknown reachability | Source references exist, but zero rows cannot prove dead or production-wired behavior (OQ-09). |
