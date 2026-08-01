# Database reference

## Product-user perspektifi

### Verification method ve scope

`.brain/` ve `.deckent/` altında altı SQLite authority file bulundu. Hepsi `better-sqlite3` ile `{ readonly: true, fileMustExist: true }` kullanılarak açıldı; 2026-08-01 tarihinde `PRAGMA user_version`, `PRAGMA table_info(<table>)`, `sqlite_master`, file size ve read-only row count alındı. Host'ta `sqlite3` shell bulunmadığı için aynı SQLite pragma'ları repository'nin native SQLite dependency'si üzerinden çalıştırıldı. [Kanıt: `better-sqlite3` import edip altı path'i read-only açan command, 2026-08-01; `package.json` içindeki `better-sqlite3` dependency]

Notation: `!`, `NOT NULL`; `PK1`, `PK2`, … SQLite primary-key position demektir. Row count'lar tarihli state snapshot'tır, schema constant değildir.

| File | Byte | `user_version` | Table | Source owner |
|---|---:|---:|---:|---|
| `.brain/memory.db` | 23.543.808 | 0 | FTS5 internals dahil 14 | `src/core/memory-store.ts:100-338`; `src/core/doc-tracking/store.ts:17-89`; `src/core/kpi/kpi-store.ts:142-281` |
| `.deckent/autonomous/autonomous.db` | 188.416 | 0 | 14 | `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:172-384` |
| `.deckent/identity.db` | 20.480 | 0 | 2 | `src/connectors/identity/identity-store.ts:19-114` |
| `.deckent/provider-execution-observations.db` | 102.400 | 1 | 2 | `src/core/provider-execution-observation-store.ts:114-169` |
| `.deckent/runtime/invocations.db` | 352.256 | 0 | 3 | `src/core/invocation-receipt-store.ts:705-850` |
| `.deckent/runtime/run-flow-store/run-flow-authority.sqlite` | 6.483.968 | 3 | 8 | `src/core/run-flow-store.ts:337-488` |

### `.brain/memory.db`

Bu product memory database'dir; repository-local host/agent core-memory file'larından ayrıdır. Entry, FTS projection, relation, history, document freshness ve KPI fact/projection saklar. [Kanıt: `AGENTS.md:69-73`; `src/core/memory-store.ts:100-338`; `src/core/doc-tracking/store.ts:17-89`; `src/core/kpi/kpi-store.ts:142-281`]

| Table | Row | Gerçek `PRAGMA table_info` column'ları |
|---|---:|---|
| `entries` | 1.764 | `id TEXT PK1`; `type TEXT!`; `source TEXT!`; `title TEXT!`; `content TEXT!`; `summary TEXT`; normalized/search field'ları `tag_text,title_norm,content_norm,summary_norm,tag_norm TEXT!`; `status,priority TEXT!`; `sprint_id TEXT`; `sprint_num INTEGER!`; `lang TEXT!`; `decay_exempt INTEGER!`; `metadata TEXT!`; `tenant_id TEXT`; `created_at,updated_at TEXT!`; `deleted_at,audit_prev_hmac,audit_hmac,adr_class,scope TEXT`; `immutable INTEGER`; `source_authority,enforcement_level TEXT` |
| `tags` | 26.265 | `entry_id TEXT PK1!`; `tag TEXT PK2!` |
| `relations` | 905 | `from_id TEXT PK1!`; `to_id TEXT PK2!`; `rel_type TEXT PK3!`; `created_at TEXT!` |
| `entry_history` | 3.035 | `id INTEGER PK1`; `entry_id TEXT!`; `field TEXT!`; `old_value,new_value TEXT`; `changed_by,change_type,changed_at TEXT!` |
| `schema_version` | 1 | `version INTEGER PK1`; `applied_at TEXT!` |
| `doc_tracking` | 1.929 | `path TEXT PK1`; `content_hash,last_updated,status,state,signals,tracked_code,first_seen,last_scanned TEXT`; `doc_rank INTEGER`; `stale_score,priority_score REAL` |
| `kpi_measurements` | 2.387 | `id TEXT PK1`; `tenant_id,measure_id TEXT!`; `value REAL!`; `kind,unit,sprint_id TEXT!`; `task_id TEXT`; `ts,tags TEXT!` |
| `kpi_rollups` | 2.343 | `tenant_id TEXT PK1!`; `measure_id TEXT PK2!`; `grain TEXT PK3!`; `period_key TEXT PK4!`; `agg_count INTEGER!`; `agg_sum REAL!`; `agg_min,agg_max,agg_last REAL`; `updated_at TEXT!` |
| `kpi_results` | 1.704 | `tenant_id TEXT PK1!`; `kpi_id TEXT PK2!`; `grain TEXT PK3!`; `period_key TEXT PK4!`; `value REAL!`; `target REAL`; `status,computed_at TEXT!` |
| `entries_fts` | 1.764 | FTS5 field'ları `title,content,summary,tag_text,title_norm,content_norm,summary_norm,tag_norm` |
| `entries_fts_config` | 1 | `k PK1!`; `v` |
| `entries_fts_data` | 789 | `id INTEGER PK1`; `block BLOB` |
| `entries_fts_docsize` | 1.764 | `id INTEGER PK1`; `sz BLOB` |
| `entries_fts_idx` | 775 | `segid PK1!`; `term PK2!`; `pgno` |

[Her satır için kanıt: gerçek read-only PRAGMA/COUNT çıktısı, 2026-08-01]

Memory migration authority kendi `schema_version` table'ını kullanır; kaydedilen row version `1`, applied date `2026-06-04`, SQLite `user_version` ise `0`'dır. FTS insert/update/delete trigger'ları virtual table'ı `entries` ile aligned tutar. [Kanıt: gerçek read-only query ve `sqlite_master`, 2026-08-01; `src/core/memory-store.ts:126-179,273-338`]

### `.deckent/autonomous/autonomous.db`

| Table | Row | Gerçek `PRAGMA table_info` column'ları |
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

[Her satır için kanıt: gerçek read-only PRAGMA/COUNT çıktısı, 2026-08-01; schema construction `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:172-384`]

Zero-row authority table'ların tamamı güncel mission store tarafından referans edilir; yalnız row count ile dead sınıflandırılamaz. Snapshot sadece capture anında bu database'e production path üzerinden row persist edilmediğini kanıtlar. [Kanıt: `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts:1172-2567` boyunca table-name referansları; PRAGMA/COUNT snapshot]

### `.deckent/identity.db`

| Table | Row | Gerçek `PRAGMA table_info` column'ları |
|---|---:|---|
| `social_identity` | 0 | `connector TEXT PK1!`; `external_id TEXT PK2!`; `tenant_id TEXT PK3!`; `principal_id,role TEXT!`; `verified INTEGER!`; `method,updated_at TEXT!` |
| `pending_verify` | 0 | `connector TEXT PK1!`; `external_id TEXT PK2!`; `code,email,tenant_id TEXT!`; `expires_at INTEGER!`; `attempts INTEGER!` |

[Kanıt: gerçek read-only PRAGMA/COUNT çıktısı, 2026-08-01; `src/connectors/identity/identity-store.ts:19-114`]

İki table'ın da active store consumer'ı vardır; zero row bu project snapshot'ta identity/pending-verification record bulunmadığı anlamına gelir, dead schema demek değildir. [Kanıt: `src/connectors/identity/identity-store.ts:38-114`]

### `.deckent/provider-execution-observations.db`

| Table | Row | Gerçek on-disk v1 column'ları |
|---|---:|---|
| `provider_execution_intervals` | 53 | `execution_id TEXT PK1`; `task_id,attempt_id,principal_digest,fence,start_json TEXT!`; `end_json TEXT`; `start_sequence INTEGER!`; `end_sequence INTEGER` |
| `provider_execution_contradictions` | 0 | `contradiction_id INTEGER PK1`; `principal_digest,payload_json TEXT!` |

[Kanıt: gerçek read-only PRAGMA/COUNT çıktısı, 2026-08-01]

Güncel source schema version `2` bildirir; nullable `run_id`, non-null `retired DEFAULT 0` ve run-scope index ekler. On-disk database hâlâ `user_version=1` ve iki column'ı da içermiyor. Read-only consumer v1'i bilerek legacy-unowned evidence olarak adapte eder; writable open v1'i v2'ye migrate eder. Bu controlled migration gerçekleşip doğrulanana kadar mevcut row'larda exact run ownership `HOLD`'dur. [Kanıt: `src/core/provider-execution-observation-store.ts:14,31-56,114-169`; gerçek PRAGMA snapshot]

### `.deckent/runtime/invocations.db`

| Table | Row | Gerçek `PRAGMA table_info` column'ları |
|---|---:|---|
| `invocation_project_bindings` | 1 | `root_digest TEXT PK1`; `project_id,created_at TEXT!` |
| `invocations` | 47 | `invocation_id TEXT PK1`; `tenant_id,project_id,idempotency_key TEXT!`; `schema_version INTEGER!`; `payload_json,payload_hash,created_at TEXT!` |
| `invocation_events` | 113 | `event_id TEXT PK1`; `invocation_id,tenant_id,project_id TEXT!`; `sequence INTEGER!`; `event_type,occurred_at,payload_json,payload_hash TEXT!`; `prev_hash TEXT`; `event_hash TEXT!` |

[Kanıt: gerçek read-only PRAGMA/COUNT çıktısı, 2026-08-01; `src/core/invocation-receipt-store.ts:705-850`]

Store receipt evidence için immutable update/delete guard kurar. [Kanıt: `src/core/invocation-receipt-store.ts:794-850`]

### `.deckent/runtime/run-flow-store/run-flow-authority.sqlite`

| Table | Row | Gerçek `PRAGMA table_info` column'ları |
|---|---:|---|
| `run_flow_records` | 321 | `kind TEXT PK1!`; `flow_id TEXT PK2!`; `ordinal INTEGER PK3!`; `sequence INTEGER`; `command_id,event_type TEXT`; `payload_json,payload_hash,created_at,source TEXT!` |
| `run_flow_commands` | 158 | `flow_id TEXT PK1!`; `command_id TEXT PK2!`; `payload_hash TEXT!`; `first_sequence,last_sequence,event_count INTEGER!`; `committed_at TEXT!` |
| `run_flow_projection_state` | 125 | `kind TEXT PK1!`; `flow_id TEXT PK2!`; `projected_ordinal INTEGER!`; `projected_at TEXT!` |
| `run_flow_store_meta` | 1 | `key TEXT PK1!`; `value TEXT!` |
| `run_flow_migration_issues` | 0 | `source_file TEXT PK1!`; `line_number INTEGER PK2!`; `reason,observed_at TEXT!` |
| `run_flow_start_attempt_identities` | 15 | `flow_id TEXT PK1!`; `generation INTEGER PK2!`; `attempt_id TEXT!`; `revision INTEGER!`; `plan_digest,tenant_id,correlation_id,idempotency_key,lineage_hash,created_at TEXT!` |
| `run_flow_start_attempt_journal` | 58 | `flow_id TEXT PK1!`; `generation INTEGER PK2!`; `sequence INTEGER PK3!`; `revision INTEGER!`; `plan_digest,attempt_id,state,payload_json,payload_hash,recorded_at TEXT!` |
| `run_flow_recovery_manifests` | 0 | `flow_id TEXT PK1!`; `generation INTEGER PK2!`; `attempt_id,payload_json,payload_hash,recorded_at TEXT!` |

[Her satır için kanıt: gerçek read-only PRAGMA/COUNT çıktısı, 2026-08-01; `src/core/run-flow-store.ts:337-488`]

Run-flow store `user_version=3` bildirir; güncel source bu version'a kadar create/migrate eder. Zero-row issue/recovery table'larının live read/write referansları vardır; structural dead table kanıtlanmamıştır. [Kanıt: gerçek PRAGMA; `src/core/run-flow-store.ts:337-488` ve table-name reference scan]

### Migration assessment

| Finding | Status |
|---|---|
| Provider observation code v2 ile disk v1 | Confirmed mismatch; controlled write-open migration pending. |
| Memory version tracking | Geçerli fakat `user_version=0` iken ayrı `schema_version` table kullanıyor. |
| Run-flow version tracking | `user_version=3`, güncel source ile aligned. |
| Autonomous, identity, invocation `user_version` | Hepsi 0; schema'lar `CREATE TABLE IF NOT EXISTS` ile kuruluyor, versioning kısmen row-level field'larda. Bu file'lardan tek başına unified migration policy görünmüyor. |
| Dead table | Kanıtlanmadı. Empty authority table'ların source referansı var; production reachability için execution evidence gerekir, row-count inference yetmez. |

[Kanıt: altı-database PRAGMA snapshot; yukarıdaki source constructor'lar; typed question `docs/analysis/OPEN-QUESTIONS-2026-08.md`]

## Dogfood / repository gerçeği

| Database gerçeği | Durum | Current finding |
|---|---|---|
| Altı-store inventory | ✅ doğrulandı | Altı file ve 43 table read-only PRAGMA/COUNT query ile okundu. |
| Memory authority | ✅ canlı | DB-first entry, search, relation, history, docs tracking ve KPI table'larında live row vardır. |
| RunFlow authority | ✅ canlı | Schema `user_version=3`; current record/journal row'ları vardır. |
| Provider observation | ⚠️ migration HOLD | Source v2 ile disk v1 farkı doğrulandı (OQ-07). |
| Unified migration governance | ⚠️ HOLD | Version mechanism store'lar arasında farklıdır (OQ-08). |
| Empty authority table | ⚠️ unknown reachability | Source reference vardır fakat zero row dead veya production-wired davranış kanıtlamaz (OQ-09). |
