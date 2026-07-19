# RUN-RENAME Dilim-2 Envanter — Kullanıcıya-Görünen "sprint" Literal Taraması

**Sprint-449 Task 449-004** — Bu envanter, dilim-2/3/4 (task 2-3-4) için TEK iş-listesi kaynağıdır. Aşağıdaki üç yüzey taranmıştır: (1) `src/cli/commands/` + `src/cli/helpers/`, (2) `src/mcp/tools/*.ts` + `src/mcp/server.ts`, (3) `docs/reference/` + `docs/guide/` + `docs/index.md` + `docs/glossary.md` (archive HARİÇ).

Tarama yöntemi: her dosya `grep -n -i "sprint"` ile taranmış, her satır elle (paralel araştırma ajanları tarafından) okunmuş ve aşağıdaki kritere göre sınıflandırılmıştır. **user-visible** satırlar rename-adayıdır; **internal/frozen-identifier** satırlar HARİÇ listesine göre dokunulmaz.

## HARİÇ Listesi (İç Kod-Adları — DEĞİŞMEZ, rename-adayı DEĞİL)

Bu envanterdeki HİÇBİR satır aşağıdakileri rename önermez — bunlar task talimatının açık dışlama listesidir:
- **`sprintId`** — bu literal identifier (değişken, parametre, JSON alan adı, hatta CLI flag/pozisyonel-arg adı olarak) her yerde HARİÇ, projede kasıtlı olarak dondurulmuş.
- **`sprint-controller`** ve "sprint" içeren diğer iç modül adları/import yolları (`sprint-finalizer.ts`, `sprint-planner.ts`, `sprint-spawner.ts`, `sprint-phases.ts`, `sprint-file-retention.ts`, `mid-sprint-adapter.ts`, vb.)
- **dosya/dizin adları** — örn. `src/cli/helpers/sprint-summary.ts` dosya ADI kalır, yalnızca içindeki literal string'ler taranır.
- **DB-şeması alanları** — örn. `sprint_id` DB kolonu, `sprint_range` query-param anahtarı, `type='sprint'` MemoryStore enum değeri.
- **type/interface adları** — örn. `SprintPlan`, `SprintResult`, `SprintPhase`, `SprintStatus`, `SprintMetrics`, `Sprint` interface'i.
- **test fixture iç-adları**.

Ek olarak, tarama sırasında ortaya çıkan ve HARİÇ listesine eklenmesi gereken **yüksek-riskli dondurulmuş yüzeyler** (task'ın orijinal HARİÇ listesinde açıkça adı geçmese de, aynı gerekçeyle dondurulmalı):
- **`deckent_style: "sprint"`** — kalıcı proje-config enum değeri (`.deckent/config.json`), her mevcut kullanıcının diskinde var. Şema-migrasyonu gerektirir.
- **`kind: "sprint"`** enum değeri — `ActionEntry.kind`/`--kind sprint` CLI flag'i, `deckent_autonomous`/`deckent_autonomous_backlog`/`deckent_process` MCP tool'ları arasında paylaşılan sözleşme.
- **`sprint:read`/`sprint:write`/`Permission.SPRINT_WRITE`** — RBAC izin-string sabitleri (`src/core/rbac.ts`), güvenlik-kritik.
- **`GET /api/sprint`** HTTP route'unun kendisi — gerçek, versiyonlanmış bir endpoint.
- **`KILL_LIVE_SPRINT`** — nervous-system safety-floor action-id literal'i.
- **`--sprint <id>` / `--sprint-min` / `--sprints` / `--sprint-id`** CLI flag ADLARI — gerçek dış-sözleşme, alias/deprecation gerektirir (flag açıklama metni ise cosmetic, serbestçe değiştirilebilir).

## Dilim-1 (sprint-403) — Zaten Migrasyon Tamamlanmış 34 messages.ts Key'i

Aşağıdaki 34 key'in **VALUE** metni zaten "sprint"→"run" dönüşümünü tamamladı (commit `51f124fc`, sprint-403). Downstream task'lar bu key'leri YENİDEN İCAT ETMEMELİ:

`hint.PLAN`, `hint.IDLE`, `status.pending_approvals.header`, `doctor.honest_explain_tmux`, `doctor.honest_explain_directives`, `doctor.honest_explain_debt`, `checkpoint.col_sprint`, `init.next_step_start`, `error.no_directives`, `error.usage_exceeded`, `bot.help_body`, `bot.action_sprint_changed`, `bot.kill_done`, `bot.kill_reused`, `bot.kill_already_stopped`, `resources.sprint_peak`, `usage.header_sprint`, `usage.no_sprint_data`, `usage.cache_gate_na`, `recover.confirm_header`, `recover.recovering`, `recover.complete`, `features.header_meta`, `history.no_history`, `history.no_match`, `retro.none_found`, `retro.no_previous_sprint`, `dashboard.sprint_line`, `dashboard.no_active_sprint`, `do.preview_banner_run`, `do.confirm_start`, `do.finished`, `limits.start_gate_blocked`, `onboarding.chat.suggestion.start_sprint`

(Doğrulama yöntemi: commit `51f124fc`'nin post-image snapshot'ı `git show 51f124fc:src/cli/helpers/messages.ts`'e karşı `git diff -U0 51f124fc^ 51f124fc`'nin her değişen satırının hangi key-bloğuna ait olduğu, satır-numarası bazlı eşleştirme ile tespit edildi — 34 sonucu commit mesajındaki "34 mesaj-çifti" iddiasıyla tam örtüşüyor.)

Bu 34 key'in dışında, tarama sırasında messages.ts'te **hâlâ literal "sprint" içeren ve migrasyon GEREKTİREN** ek key'ler bulundu (bkz. CLI Yüzeyi bölümü, `messages.ts` satırı): `status.sprint_active`, `status.no_sprint`, `evolve.no_sprint_data`, `evolve.report_header`, `start.sprint_planned`, `plan.sprint_planned`, `plan.note_sprint_size`, `kpi.title`, `kpi.no_data`, `desktop.shell.bridge.no_sprint`. Bunlardan üçü (`start.sprint_planned`, `plan.sprint_planned`, `plan.note_sprint_size`) zaten geçiş-formatında ("Run N (sprint) (...)") — tam migrasyon parantez içindeki "(sprint)" ekini kaldırmak demek.

## Çıktı Formatı

Her yüzey için tablo: `file:line · mevcut string · sınıflama (user-visible/internal) · önerilen messages.ts key VEYA 'run' metni · geriye-uyumluluk notu`.

`internal` satırlar bazen dosya-başına TEK özet satırına gruplanmıştır (örn. "12 sprintId occurrences, batched") — bu, her grep-hit'in hesaba katıldığını garanti eder ama tabloyu okunabilir tutar.

---


---

# YÜZEY 1 — CLI (src/cli/commands/ + src/cli/helpers/)

### src/cli/helpers/messages.ts — 123 total "sprint" grep hits, ~9 user-visible (needs migration), rest already-migrated/internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/messages.ts:31-34 `status.sprint_active` | `en: 'Sprint {sprintId} active'` / `tr: 'Sprint {sprintId} aktif'` | user-visible | existing key `status.sprint_active` → `'Run {sprintId} active'` / `'Run {sprintId} aktif'` (NOT in dilim-1 34-key list, needs migration) | cosmetic display text, safe to change directly — verify callers first |
| src/cli/helpers/messages.ts:35-37 `status.no_sprint` | `en: 'No active sprint'` / `tr: 'Aktif sprint yok'` | user-visible | existing key `status.no_sprint` → `'No active run'` / `'Aktif run yok'` (NOT in dilim-1 list) | cosmetic display text, safe to change directly |
| src/cli/helpers/messages.ts:614-617 `mode.sprint_desc` | `en: 'Switch to sprint mode'` / `tr: 'Sprint moduna geç'` | user-visible | existing key `mode.sprint_desc` — used as `--help` description for `deckent mode sprint` subcommand; leave paired with `mode.run_desc`, or reword to `'Switch to sprint mode (legacy alias for run mode)'` once the `mode sprint` subcommand is deprecated | this is the `--help` description of the **subcommand name `sprint`** itself (`deckent mode sprint`) — the subcommand name is a live CLI surface, needs alias/deprecation before renaming |
| src/cli/helpers/messages.ts:1067-1069 `evolve.no_sprint_data` | `en: 'No sprint data found. Run some sprints first...'` | user-visible | existing key `evolve.no_sprint_data` (NOT in dilim-1 list) → `'No run data found. Run a few runs first to see evolution trends.'` | cosmetic display text, safe to change directly |
| src/cli/helpers/messages.ts:1071-1073 `evolve.report_header` | `en: '\nEvolution Report — {count} sprints analyzed\n'` | user-visible | existing key `evolve.report_header` (NOT in dilim-1 list) → `'\nEvolution Report — {count} runs analyzed\n'` | cosmetic display text, safe to change directly |
| src/cli/helpers/messages.ts:2165-2168 `kpi.title` | `en: 'KPI Scorecard — {sprint}'` | user-visible (placeholder-name only, no literal word) | existing key `kpi.title` — value has no literal "sprint" word, only the `{sprint}` interpolation binding name; optional rename to `{run}` | low priority — value text is already generic |
| src/cli/helpers/messages.ts:3826-3828 `desktop.shell.bridge.no_sprint` | `en: 'No live sprint — issue an order below to set sail.'` | user-visible | existing key `desktop.shell.bridge.no_sprint` → `'No live run — issue an order below to set sail.'` | cosmetic display text, confirmed live-consumed by `src/desktop/src/renderer/shell/Shell.tsx` |
| src/cli/helpers/messages.ts (many `{sprintId}`/`{sprint}` interpolation binding names in already-migrated dilim-1 keys: `bot.*`, `usage.header_sprint`, `recover.*`, `checkpoint.col_sprint`, `resources.sprint_peak`, `features.header_meta`) | value text already says "run"; only the placeholder BINDING NAME remains "sprint" | internal | n/a — exempt (interpolation binding name, not displayed text) | zero user-facing effect; optional code-hygiene rename of binding name only |
| src/cli/helpers/messages.ts (remaining ~100 hits) | code-comment section headers (`// ─── ... Sprint NNN ...`), message KEY names (not values) already migrated or intentionally referencing frozen config value `"sprint"` (`mode.*`) | internal | n/a — exempt | frozen per exclusion list (comments, key names, frozen config-enum value) |

**Special note**: `mode.ts`'s `VALID_STYLES = ['sprint','task','process']` is a **persisted config enum value** (`deckent_style: "sprint"` in `.deckent/config.json`) — real backward-compat risk, NOT a pure display-text rename. See CLI B1 `mode.ts` row below.

---

### src/cli/commands/cleanup.ts — 55 total hits, 4 user-visible, 51 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/cleanup.ts:79 | `.description('Clean up after a sprint')` | user-visible | NEW key `cleanup.command_desc` → `run-text: 'Clean up after a run'` | `--help` text, cosmetic |
| src/cli/commands/cleanup.ts:233 | `` `Removed ${n} prompt file(s) from old archive (retention: ${n} sprints)` `` | user-visible | NEW key `cleanup.prompt_retention_removed` → `run-text: '... (retention: {n} runs)'` | cosmetic, safe |
| src/cli/commands/cleanup.ts:239 | `` `Removed ${n} old .tasks/archive/ dir(s) (retention: ${n} sprints)` `` | user-visible | NEW key `cleanup.archive_dir_removed` → `run-text: '... (retention: {n} runs)'` | cosmetic, safe |
| src/cli/commands/cleanup.ts:261 | `` `Archived ${n} sprint file(s) (retention: keep_last_n=${k})` `` | user-visible | NEW key `cleanup.sprint_files_archived` → `run-text: 'Archived {n} run file(s) (retention: keep_last_n={k})'` | cosmetic, safe |
| src/cli/commands/cleanup.ts: (rest) | `sprintId`, `Sprint` type import, `sprint-docs-updater`/`sprint-file-retention` module paths, `decayAfterSprints`, `sprint-state.json`, `SprintStatus`/`SprintPhase`, `archiveSprintId`, `sprint_file_retention` config key, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/kill.ts — 46 total hits, 0 user-visible, 46 internal (batched)

All 46 hits are internal: `killSprintById`/`KillSprintResult`/`verifySprintOwnership` identifiers, `sprint-pid-manager`/`sprint-controller` module imports, `sprintId` field/param throughout, internal IPC event tag `BRAIN→*:SPRINT_KILLED`, code comments. No `print()`/`.description()` call in this file contains "sprint" — verified zero overlap.

---

### src/cli/commands/sync.ts — 34 total hits, 8 user-visible, 26 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/sync.ts:308,349 | `` `Sprint #${id}` `` (fallback `'last sprint'`) — memory-DB summary + terminal display | user-visible | NEW keys `sync.run_label` / `sync.terminal_run_label` → `run-text: 'Run #{n}'` (fallback `'last run'`) | writes into `.brain/memory.db` content field; cosmetic, no schema/flag concern |
| src/cli/commands/sync.ts:309,355 | `` `- ${n} commit(s) since ${sprintLabel}` `` | user-visible | flows through the labels above | cosmetic, safe |
| src/cli/commands/sync.ts:352,792 | `'No changes since last sprint'` | user-visible | NEW key `sync.no_changes` → `run-text: 'No changes since last run'` | cosmetic, safe |
| src/cli/commands/sync.ts:370 | `'  → Recorded to memory.db for next sprint context'` | user-visible | NEW key `sync.recorded_hint` → `run-text: '  → Recorded to memory.db for next run context'` | cosmetic, safe |
| src/cli/commands/sync.ts:649 | `.description('Sync adapter files and detect out-of-band changes since last sprint')` | user-visible | NEW key `sync.command_desc` → `run-text: '...since last run'` | `--help` text, cosmetic |
| src/cli/commands/sync.ts:768 | `'Warning: No previous sprint found in .brain/sprints/ — run \`deckent start\` to begin your first sprint.'` | user-visible | NEW key `sync.no_previous_run` → `run-text: 'Warning: No previous run found in .brain/sprints/ — run \`deckent start\` to begin your first run.'` | `.brain/sprints/` directory path is frozen — NOT part of this rename |
| src/cli/commands/sync.ts: (rest) | `sprintId`, `SPRINTS_DIR`, `getLastSprintTimestamp`, `sprint_id` DB field, `sprintsPath` | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/review.ts — 26 total hits, 6 user-visible, 20 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/review.ts:192 | `.description('Review sprint tasks with evaluations')` | user-visible | NEW key `review.command_desc` → `run-text: 'Review run tasks with evaluations'` | `--help` text, cosmetic |
| src/cli/commands/review.ts:203 | `'No tasks found. Run a sprint first.'` | user-visible | NEW key `review.no_tasks` → `run-text: 'No tasks found. Start a run first.'` (avoid "Run a run" collision) | cosmetic |
| src/cli/commands/review.ts:212 | `` `Warning: Mixed sprint IDs detected: ${ids}. Using ${id}.` `` | user-visible | NEW key `review.mixed_sprint_ids` → `run-text: 'Warning: Mixed run IDs detected: {ids}. Using {id}.'` | cosmetic |
| src/cli/commands/review.ts:244 | `` `All pending tasks approved for sprint ${id}.` `` | user-visible | NEW key `review.approved_all` → `run-text: 'All pending tasks approved for run {id}.'` | cosmetic |
| src/cli/commands/review.ts:254 | `` `All pending tasks rejected for sprint ${id}.` `` | user-visible | NEW key `review.rejected_all` → `run-text: 'All pending tasks rejected for run {id}.'` | cosmetic |
| src/cli/commands/review.ts:273 | `` `Auto-review complete for sprint ${id}.` `` | user-visible | NEW key `review.auto_complete` → `run-text: 'Auto-review complete for run {id}.'` | cosmetic |
| src/cli/commands/review.ts: (rest) | `sprintId` field/param, `getReviewPath`/`getPersistentReviewPath`, `detectSprintId`, `detectMixedSprints` | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/chat.ts — 22 total hits, 0 user-visible (terminal-printed), 22 internal/borderline

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/chat.ts:81-110 | `TASK_INTENT_KEYWORDS` table: `'start sprint'`, `'run sprint'`, `'sprint status'`, `'kill sprint'`, `'plan sprint'`, etc. (14 phrases) | internal (input-matching table, never printed) | n/a — exempt; recommend ADDING `'run'`-worded phrasings alongside (e.g. `'start run'`, `'run status'`) rather than replacing, so users who still say "sprint" keep working | not display text — matched against typed user input |
| src/cli/commands/chat.ts:215,218,220,224 | `buildNaiveSystemPrompt()` body: `"start a sprint..."`, `"start / launch / kick off sprint → deckent_start"`, etc. | internal (LLM system-prompt text for a *different* spawned process, not printed to deckent's own console) | n/a — exempt from console-output inventory but recommend a follow-up pass since this text shapes what the *host AI CLI* says to the user | not literal stdout — an `--append-system-prompt` value for a spawned subprocess |

---

### src/cli/commands/watch.ts — 18 total hits, 3 user-visible, 15 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/watch.ts:62 | `` `Worker not yet spawned. Task status: ${status}. Wait for sprint to progress to EXECUTE phase.` `` | user-visible | NEW key `watch.worker_not_spawned` → `run-text: '... Wait for run to progress to EXECUTE phase.'` | cosmetic |
| src/cli/commands/watch.ts:144 | `'No active sprint. Run \`deckent start\` first.'` | user-visible | NEW key `watch.no_active_sprint` → `run-text: 'No active run. Run \`deckent start\` first.'` (consider reusing shared `status.no_sprint`/`dashboard.no_active_sprint` pattern) | cosmetic error text |
| src/cli/commands/watch.ts:170 | `` `Warning: Task ${taskId} is from sprint ${a}, but current sprint is ${b}.` `` | user-visible | NEW key `watch.stale_sprint_warning` → `run-text: 'Warning: Task {taskId} is from run {a}, but current run is {b}.'` | cosmetic |
| src/cli/commands/watch.ts: (rest) | `getCurrentSprintId`, `getTaskSprintId`, `sprintId` field, `taskSprintId`/`currentSprintId`, `sprint-utils` import path | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/helpers/onboarding-chat-flow.ts — 15 total hits, 0 user-visible, 15 internal (batched)

All hits are intent-matching phrase list, enum literal `'start_sprint'`, messages.ts key name `onboarding.chat.suggestion.start_sprint` (whose VALUE is already migrated per dilim-1). Not printed directly — internal, exempt.

---

### src/cli/commands/mode.ts — 13 total hits, 6 user-visible, 7 internal (batched) — HIGH COMPAT RISK FILE

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/mode.ts:47 | `style === 'sprint' ? 'run (sprint)' : style` | user-visible | intentional bridge/compat display (ADR-G-024 MODE-RENAME) — do NOT remove "(sprint)" suffix without an explicit deprecation-period decision | this IS the compat mechanism itself |
| src/cli/commands/mode.ts:77-78 | `.command('sprint')` + description via `mode.sprint_desc` | user-visible (CLI subcommand name) | subcommand name `sprint` is a real CLI surface (`deckent mode sprint`) — needs alias/deprecation, not removal | `mode run` already exists as bridge alias writing the same `'sprint'` stored value |
| src/cli/commands/mode.ts:84 | `'✓ Switched to sprint mode (project override)'` | user-visible | leave as-is (tied 1:1 to the `mode sprint` subcommand a user explicitly typed) unless that subcommand itself is renamed | cosmetic but coupled to subcommand decision |
| src/cli/commands/mode.ts:161 | `` `Invalid style: "${style}". Must be "sprint" or "task".` `` | user-visible | **must stay literally "sprint"** — validates against `VALID_STYLES` enum, the actual stored/accepted value | directly tied to stored config enum |
| src/cli/commands/mode.ts:11 | `const VALID_STYLES = ['sprint', 'task', 'process'] as const;` | internal (but **compat-critical**) | n/a — persisted/validated config enum value, not display text | **HIGH compat concern**: `deckent_style: "sprint"` is a persisted `.deckent/config.json` value across every existing project. Renaming this needs a migration/alias, not a find-replace. Recommend Alperen review before any change here. |
| src/cli/commands/mode.ts:65,83,99,145,147 | `deckent_style ?? 'sprint'`, `setProjectConfigValue(..., 'sprint')` | internal | n/a — exempt (covered by note above) | same compat note as line 11 |

---

### src/cli/helpers/sprint-summary.ts — 9 total hits, 1 user-visible, 8 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/sprint-summary.ts:31 | `` `=== RESULTS === Sprint ${n} (${id})` `` | user-visible | NEW key `richSummary.results_header` → `run-text: '=== RESULTS === Run {n} ({id})'` | note: `RichSprintSummary` class appears **dead/unused** (no importers found outside this file+its test) — confirm before investing rename effort, may be safe to delete instead |
| src/cli/helpers/sprint-summary.ts: (rest) | `SprintSummaryData`/`sprint: Sprint` type refs, `RichSprintSummary` class name | internal | n/a — exempt | frozen per exclusion list (type/class names, filename stays) |

---

### src/cli/commands/recall.ts — 7 total hits, 3 user-visible, 4 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/recall.ts:15 | `.description('Search project memory — ADRs, sprint learnings, patterns, debt')` | user-visible | NEW key `recall.command_desc` → `run-text: '... ADRs, run learnings, patterns, debt'` | `--help` text, cosmetic |
| src/cli/commands/recall.ts:16 | `.option('-t, --type <types>', 'Filter by type (comma-separated: adr,memory,sprint,debt,pattern)', '')` | user-visible | reword help text only if the underlying `type` filter DB value is also renamed | **the word `sprint` is a literal accepted `--type` filter VALUE** (`entry.type` in memory DB) — real CLI-flag-value/DB-schema-value surface, needs migration or alias |
| src/cli/commands/recall.ts:18 | `.option('--sprint-min <n>', 'Minimum sprint number')` | user-visible | NEW flag `--run-min <n>` desc `run-text: 'Minimum run number'`; keep `--sprint-min` as deprecated hidden alias | **CLI flag NAME** `--sprint-min` is a real external surface — needs alias/deprecation period |
| src/cli/commands/recall.ts: (rest) | `sprint_range`/`sprintId`/`sprint_id` (DB query param + result field) | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/cost.ts — 6 total hits, 3 user-visible, 3 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/cost.ts:174 | `` `✓ Set sprint_max_usd = $${val}` `` | user-visible (echoes config-key name) | leave config-key name `sprint_max_usd` as-is (persisted JSON field in `.deckent/cost-config.json`); if field is ever renamed, this echo must move together | **directly echoes persisted JSON config field** — HIGH compat concern, same class as mode.ts's `deckent_style` |
| src/cli/commands/cost.ts:200 | `` `  Sprint:  $${...sprint_max_usd}` `` | user-visible | NEW key `cost.budget_row_sprint_label` → `run-text: '  Run:  ${val}'` | label is purely cosmetic, safe — only the underlying field read is compat-locked |
| src/cli/commands/cost.ts:239 | `.option('--set <usd>', 'Set sprint max budget in USD')` | user-visible | `run-text: 'Set run max budget in USD'` | cosmetic `--help` text; flag NAME `--set` itself has no "sprint" — no CLI-surface concern here |
| src/cli/commands/cost.ts: (rest) | JSON config field name `sprint_max_usd`, comments | internal | n/a — exempt | frozen (see compat note above) |

---

### src/cli/commands/chat-mode.ts — 5 total hits, all comment-only. No table row needed.

### src/cli/commands/init-wizard.ts — 4 total hits, 2 user-visible, 2 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/init-wizard.ts:83 | `'  2. Sprint planlayın:     deckent plan'` (TR, hardcoded — not yet using getMessage) | user-visible | NEW key `initWizard.next_step_plan_tr` → `run-text: '  2. Run planlayın:        deckent plan'` | cosmetic; good candidate to migrate onto i18n table while renaming |
| src/cli/commands/init-wizard.ts:98 | `'  2. Plan the sprint:   deckent plan'` (EN, hardcoded) | user-visible | NEW key `initWizard.next_step_plan_en` → `run-text: '  2. Plan the run:      deckent plan'` | cosmetic, same as above |
| src/cli/commands/init-wizard.ts: (rest) | comments | internal | n/a — exempt | code comments |

### src/cli/helpers/onboarding-wizard.ts — 2 total hits, both comment-only. No table row needed.

### src/cli/commands/quick-start.ts — 2 total hits, 1 user-visible, 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/quick-start.ts:24 | `` `# DIRECTIVES — Zero-Config Sprint` `` (Markdown heading written into generated DIRECTIVES.md) | user-visible (borderline — file content, not console stdout) | `run-text: '# DIRECTIVES — Zero-Config Run'`; if routed through messages.ts, NEW key `quickStart.directives_heading` | user reads this when opening the generated file; low urgency vs. true console output |
| src/cli/commands/quick-start.ts:77 | comment | internal | n/a — exempt | code comment |

### src/cli/commands/cu-status.ts — 2 hits, comment-only. No table row needed.
### src/cli/helpers/progress-reader.ts — 1 hit, comment-only. No table row needed.
### src/cli/helpers/connect-wizard.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/rbac.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/chat-render.ts — 1 hit, comment-only. No table row needed.

---

## Batch-1 cross-file notes for the rename effort

1. **`src/cli/commands/mode.ts`** — the ONE file where "sprint" is a persisted config enum value (`deckent_style: "sprint"`, `VALID_STYLES`), not just display text. Real backward-compat risk. `bridgeStyleLabel()` already implements the intended display-only bridge (`'run (sprint)'`) per ADR-G-024. Remaining literal "sprint" strings are all tied to that stored value + the `deckent mode sprint` subcommand name (a live CLI surface).
2. **`src/cli/commands/cost.ts`** similarly echoes a persisted JSON config field (`cost_limits.sprint_max_usd`) directly into printed text — rename the label freely, but the field-name echo is compat-locked.
3. **`src/cli/commands/recall.ts`** has two real CLI-surface items: `--type ... sprint` accepted filter value (tied to memory DB `entry.type` schema) and `--sprint-min` flag name — both need alias/deprecation.
4. **`chat.ts`**'s `TASK_INTENT_KEYWORDS` and **`onboarding-chat-flow.ts`**'s `META_INTENT_PATTERNS` are input-matching tables — recommend *adding* "run"-worded phrasings alongside existing "sprint" ones rather than replacing.
5. **`sprint-summary.ts`**'s `RichSprintSummary` class appears unused in production — confirm with Alperen whether to rename or delete.
6. Two messages.ts keys NOT on the given dilim-1 34-key list but still containing literal (non-placeholder) "sprint" wording: **`status.sprint_active`/`status.no_sprint`** and **`evolve.no_sprint_data`/`evolve.report_header`**, plus **`desktop.shell.bridge.no_sprint`** (confirmed live in Desktop shell renderer).

### src/cli/commands/start.ts — 86 total hits, 17 user-visible, 69 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/start.ts:234 | `.description('Start a new sprint (optionally with a one-line description for zero-config mode)')` | user-visible | `run-text: 'Start a new run (optionally with a one-line description for zero-config mode)'` | cosmetic `--help`, safe |
| src/cli/commands/start.ts:238 | `.option('--dry-run', 'Plan sprint without spawning workers')` | user-visible | `run-text: 'Plan run without spawning workers'` | cosmetic `--help`, safe |
| src/cli/commands/start.ts:242 | `.option('--watch', 'Automatically open watch mode after sprint spawns workers')` | user-visible | `run-text: '...after run spawns workers'` | cosmetic `--help`, safe |
| src/cli/commands/start.ts:243 | `.option('--timeout <ms>', 'Sprint timeout in milliseconds (default: 30 minutes)')` | user-visible | `run-text: 'Run timeout in milliseconds (default: 30 minutes)'` | cosmetic `--help`, safe |
| src/cli/commands/start.ts:441 | `'Sandbox mode: stashed local changes. Will restore after sprint.'` | user-visible | NEW key `start.sandbox_stashed` → `run-text: '...Will restore after run.'` | cosmetic, safe |
| src/cli/commands/start.ts:443 | `'Sandbox mode: no changes to stash. Running sprint on clean state.'` | user-visible | NEW key `start.sandbox_clean` → `run-text: '...Running run on clean state.'` | cosmetic, safe |
| src/cli/commands/start.ts:463 | `` `Orphan sprint ${sid} (PID ${pid}) auto-archived.` `` | user-visible | NEW key `start.orphan_auto_archived` → `run-text: 'Orphan run {sid} (PID {pid}) auto-archived.'` | cosmetic |
| src/cli/commands/start.ts:466 | `` `Orphan sprint detected: ${sid} (PID ${pid} is dead).` `` | user-visible | NEW key `start.orphan_detected` → `run-text: 'Orphan run detected: {sid} (PID {pid} is dead).'` | cosmetic |
| src/cli/commands/start.ts:483 | `` `Sprint already running (PID ${pid}, env: ${env}, sprint: ${sprintId}, started: ${at}). Use --force to override.` `` | user-visible | NEW key `start.sprint_lock_active` → `run-text: 'Run already running (PID {pid}, env: {env}, run: {sprintId}, started: {at}). Use --force to override.'` | cosmetic; `sprintId` property access itself frozen |
| src/cli/commands/start.ts:538-542 | `getMessage('start.sprint_planned', ...)` → `'Run {n} (sprint) ({id}) planned — {count} tasks:'` | user-visible | EXISTING key `start.sprint_planned` (NOT in dilim-1 list — mixed format) | needs full migration: drop the "(sprint)" parenthetical |
| src/cli/commands/start.ts:668 | `` `\nProceed with sprint at ~$${cost}?` `` | user-visible | NEW key `start.cost_confirm_prompt` → `run-text: '\nProceed with run at ~${cost}?'` | cosmetic confirm-prompt |
| src/cli/commands/start.ts:672 | `'Sprint cancelled by user.'` | user-visible | NEW key `start.sprint_cancelled` → `run-text: 'Run cancelled by user.'` | cosmetic |
| src/cli/commands/start.ts:740 | `` `✅ Sprint ${id} tamamlandı (${dur})` `` (hardcoded TR-only, no EN variant) | user-visible | NEW key `start.completion_summary` → `run-text: '✅ Run {id} tamamlandı ({dur})'` | cosmetic; flag pre-existing i18n gap (TR-only hardcode) |
| src/cli/commands/start.ts:746 | `` `Sprint failed at phase ${phase}: ${msg}` `` | user-visible | NEW key `start.sprint_failed_phase` → `run-text: 'Run failed at phase {phase}: {msg}'` | cosmetic error text |
| src/cli/commands/start.ts:408 | `` `run ${id} completed` `` | user-visible | already says "run" — no change needed | n/a |
| src/cli/commands/start.ts:338,559-560 | already-migrated "Run" text (RunFlow reuse message, scope-gate warning) | user-visible | no change needed | n/a — already uses "run" |
| src/cli/commands/start.ts: (rest, ~69 hits) | `sprintId` param/var, `sprint-controller`/`sprint-pid-manager` import paths, `isSprintLocked`, `SprintSizeRecommendation` type, `sprintResult` var, `sprintEstimateUsd` field, `pidSprintIds`/`lastSprintId` vars, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/chat-native.ts — 53 total hits, 0 user-visible, 53 internal (comment-only)

All 53 hits are `// Sprint NNN T-NNN-NNN — ...` provenance comments. No string literal reaches console output.

---

### src/cli/commands/audit.ts — 45 total hits, 6 user-visible, 39 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/audit.ts:251 | `.command('audit [sprint-id]')` | user-visible | positional arg name shown in `--help` | **CLI positional-arg label** — needs alias/deprecation if renamed |
| src/cli/commands/audit.ts:252 | `.description('Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events...')` | user-visible | `run-text: '...for a run, or query/export/retain audit log events...'` | cosmetic `--help`, safe |
| src/cli/commands/audit.ts:254 | `.option('--sprint <id>', 'Sprint ID for audit query/compliance/forward/retention subcommands', 'sprint-001')` | user-visible | flag NAME `--sprint` + default value `'sprint-001'` | **CLI flag name + default value** — externally-depended-on, needs `--run` alias + deprecation |
| src/cli/commands/audit.ts:407 | `` `\n  Audit Query: sprint=${id}` `` | user-visible | NEW key `audit.query_header` → `run-text: '\n  Audit Query: run={id}'` | cosmetic |
| src/cli/commands/audit.ts:428 | `'audit: sprint-id required (e.g. deckent audit sprint-210) or use: deckent audit query [options]'` | user-visible | NEW key `audit.sprint_id_required` → `run-text: 'audit: run-id required (e.g. deckent audit run-210)...'` | cosmetic error text |
| src/cli/commands/audit.ts:275-399 | default fallback ID `'sprint-001'` interpolated into `audit.compliance.summary`/`audit.retention.*` messages | user-visible (data value) | track the `--sprint`→`--run` flag alias plan | cosmetic-ish, coupled to flag decision |
| src/cli/commands/audit.ts: (rest) | `sprintId` param/var everywhere, `sprint-finalizer` import path, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/resume.ts — 34 total hits, 9 user-visible, 25 internal (batched)

Note: this file has **zero** `getMessage()` calls — all raw hardcoded English (pre-existing i18n gap, unrelated to this rename).

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/resume.ts:24 | `.command('resume <sprintId>')` | user-visible | positional arg label shown in `--help` | positional arg — no breaking behavior, only displayed label |
| src/cli/commands/resume.ts:25 | `.description('Resume a sprint from its latest checkpoint')` | user-visible | NEW key `resume.description` → `run-text: 'Resume a run from its latest checkpoint'` (new i18n adoption) | cosmetic `--help` |
| src/cli/commands/resume.ts:34 | `` `No checkpoint found for sprint "${id}".` `` | user-visible | NEW key `resume.no_checkpoint` → `run-text: 'No checkpoint found for run "{id}".'` | cosmetic |
| src/cli/commands/resume.ts:35 | `'Run "deckent status" to see available sprints.'` | user-visible | NEW key `resume.see_available` → `run-text: '...to see available runs.'` | cosmetic |
| src/cli/commands/resume.ts:41 | `` `Checkpoint for sprint "${id}" is malformed or unreadable.` `` | user-visible | NEW key `resume.checkpoint_malformed` → `run-text: '...for run "{id}"...'` | cosmetic |
| src/cli/commands/resume.ts:45 | `` `\nResuming sprint ${id} from checkpoint #${n}` `` | user-visible | NEW key `resume.resuming_header` → `run-text: '\nResuming run {id} from checkpoint #{n}'` | cosmetic |
| src/cli/commands/resume.ts:90 | `'Run "deckent retro" to see the sprint retrospective.'` | user-visible | NEW key `resume.see_retro` → `run-text: '...the run retrospective.'` | cosmetic |
| src/cli/commands/resume.ts:203 | `'\nSprint resumed and completed.'` | user-visible | NEW key `resume.completed` → `run-text: '\nRun resumed and completed.'` | cosmetic |
| src/cli/commands/resume.ts:206 | `` `Sprint resume failed: ${msg}` `` | user-visible | NEW key `resume.resume_failed` → `run-text: 'Run resume failed: {msg}'` | cosmetic |
| src/cli/commands/resume.ts: (rest) | `runSprint` import, `sprint-checkpoint` module path, `SPRINT_STATE_FILE` constant, `sprintId` param, `listCheckpointedSprints` fn name, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/plan.ts — 25 total hits, 9 user-visible, 16 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/plan.ts:87 | `.description('Plan a sprint without executing it')` | user-visible | `run-text: 'Plan a run without executing it'` | cosmetic `--help` |
| src/cli/commands/plan.ts:205-209 | `getMessage('plan.sprint_planned', ...)` → `'Run {n} (sprint) ({id}) planned with {count} tasks:'` | user-visible | EXISTING key `plan.sprint_planned` (NOT in dilim-1 list — mixed format) | needs migration: drop "(sprint)" |
| src/cli/commands/plan.ts:223,235,243,248,253,256 | `plan.override_warnings_header`/`plan.prompt_gate_*`/`plan.reasoning`/`plan.planning_mode` keys | user-visible | values already sprint-free — no action | n/a |
| src/cli/commands/plan.ts:260 | `getMessage('plan.note_sprint_size', ...)` → `'Note: Run (sprint) size {size} — {reason}'` | user-visible | EXISTING key `plan.note_sprint_size` (NOT in dilim-1 list — mixed format) | needs migration: drop "(sprint)" |
| src/cli/commands/plan.ts: (rest) | `planSprint` import, `sprint-planner` module path, `SprintSizeRecommendation` type, `sprint` var name, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/helpers/status-renderer.ts — 20 total hits, 0 user-visible, 20 internal (batched)

`SprintConfig` interface, `sprint_started_at`/`sprint_hard_timeout` config field names, `sprintId` var/param, `readSprintConfig`/`detectSprintId` method names, comments. The header line `🚀 ${sprintId} — ${phase} phase...` interpolates the run ID VALUE, not the literal word "sprint" — no user-visible string literal contains the word "sprint".

---

### src/cli/commands/usage.ts — 17 total hits, 3 user-visible, 14 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/usage.ts:217,221 | `getMessage('usage.no_sprint_data'/'usage.header_sprint', ...)` | user-visible | already-migrated per dilim-1 34-key list — do not re-flag | n/a — DONE |
| src/cli/commands/usage.ts:346 | `.option('--sprint <N>', 'Show per-task breakdown for sprint N')` | user-visible | flag NAME `--sprint` + desc `run-text: 'Show per-task breakdown for run N'` | **CLI flag name** — externally-depended-on, needs `--run` alias + deprecation |
| src/cli/commands/usage.ts: (rest) | `UsageCommandOptions.sprint` field, `sprintNum` var, `summarizeSprint` import, `SprintUsageSummary` type, comments | internal | n/a — exempt | option-object field mirrors CLI flag; frozen |

---

### src/cli/commands/doctor-checks.ts — 14 total hits, 1 user-visible, 13 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/doctor-checks.ts:296 | `'DIRECTIVES.md is empty — add sprint goals with ## Task sections'` | user-visible | NEW key `doctor.directives_empty` → `run-text: '...add run goals with ## Task sections'` | cosmetic, printed via `deckent doctor` |
| src/cli/commands/doctor-checks.ts: (rest) | comment "Sprint 144 split", `abortSprint` field, `getLastSprintId` fn, `last_sprint_id` config key, `readLatestCIReport(sprintId?)` param | internal | n/a — exempt | frozen — `last_sprint_id` is a config-schema key |

---

### src/cli/commands/evolve.ts — 13 total hits, 5 user-visible, 8 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/evolve.ts:19 | `getMessage('evolve.no_sprint_data', ...)` | user-visible | EXISTING key, NOT in dilim-1 list — see CLI B1 messages.ts entry | needs migration |
| src/cli/commands/evolve.ts:23 | `getMessage('evolve.report_header', ...)` | user-visible | EXISTING key, NOT in dilim-1 list — see CLI B1 messages.ts entry | needs migration |
| src/cli/commands/evolve.ts:52 | `.description('Evolution analysis — cross-sprint trends and prompt suggestions')` | user-visible | `run-text: '...cross-run trends...'` | cosmetic `--help` |
| src/cli/commands/evolve.ts:56 | `.description('Show cross-sprint agent/skill trend report')` | user-visible | `run-text: 'Show cross-run agent/skill trend report'` | cosmetic `--help` |
| src/cli/commands/evolve.ts:57 | `.option('-n, --sprints <n>', 'Number of sprints to analyze', '10')` | user-visible | flag NAME `--sprints` + desc `run-text: 'Number of runs to analyze'` | **CLI flag name** — needs `--runs` alias + deprecation |
| src/cli/commands/evolve.ts: (rest) | option-object field `sprints` (mirrors flag), `SprintTrendAnalyzer`/`CrossSprintReport` types, `cross-sprint-analyzer.js` import path, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/helpers/session-resume.ts — 9 total hits, 0 user-visible, 9 internal (batched)

Module's own doc comment states it "never formats a user-facing string" — confirmed. All hits are `sprintId` field/param (RawJob interface, SessionRecord) + comments.

---

### src/cli/commands/dashboard.ts — 7 total hits, 3 user-visible, 4 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/dashboard.ts:53,176 | `getMessage('dashboard.sprint_line'/'dashboard.no_active_sprint', ...)` | user-visible | already-migrated per dilim-1 34-key list | n/a — DONE |
| src/cli/commands/dashboard.ts:164 | `JSON.stringify({ error: 'No active sprint. Run deckent start first.' })` (raw-hardcoded, NOT routed through getMessage — inconsistent with line 176 sibling path) | user-visible | reuse `dashboard.no_active_sprint` text via getMessage for consistency | JSON `error` field printed via `--json`; low-risk exact-string-match consumers |
| src/cli/commands/dashboard.ts: (rest) | comment, `sprintHeader`/`sprintPhase` local var names, `dashboard.phase_status` key (value has no "sprint" word) | internal | n/a — exempt | comment + local var names |

---

### src/cli/commands/chat-agentic-dispatch.ts — 6 total hits, 0 user-visible, 6 internal (batched)

All hits are comments or input-matching regexes (`STATUS_RE`/`HISTORY_RE`/`PLAN_RE`) matching normalized user input, not printed output.

---

### src/cli/helpers/hints.ts — 4 total hits, 1 user-visible, 3 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/hints.ts:50-52 | `getMessage('status.sprint_active', ...)` | user-visible | EXISTING key NOT in dilim-1 list — see CLI B1 messages.ts entry | needs migration |
| src/cli/helpers/hints.ts: (rest) | JSDoc comment, `s['sprintId']` property access | internal | n/a — exempt | comment + frozen identifier |

---

### src/cli/commands/features.ts — 4 total hits, 2 user-visible, 2 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/features.ts:145 | `sprint: manifest._meta.sprintId,` inside `--json` output object | user-visible | JSON output field name `sprint` | **JSON output field name** — machine-readable surface, needs deprecation period/dual-field emission |
| src/cli/commands/features.ts:158-161 | `getMessage('features.header_meta', ...)` | user-visible | already-migrated per dilim-1 list | n/a — DONE |
| src/cli/commands/features.ts: (rest) | comment, `FeaturesManifest._meta.sprintId` field | internal | n/a — exempt | comment + frozen identifier (manifest schema field) |

---

### src/cli/helpers/live-footer.ts — 2 hits, 0 user-visible, 2 internal (comment-only). No table row needed.

### src/cli/commands/process.ts — 2 total hits, 1 user-visible, 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/process.ts:37 | `kind?: 'task' \| 'sprint' \| 'capability';` (TS union type) | internal | n/a — exempt | type-level literal union; the SAME literal is also the accepted `--kind` flag VALUE (see next row) |
| src/cli/commands/process.ts:138 | `.option('--kind <kind>', 'Execution kind: task (default), sprint, capability')` | user-visible | flag VALUE enum listed in `--help` | **CLI flag accepted-value `sprint`** — real externally-depended-on enum value; needs a `run` alias + deprecation, and `ExecutionRequest.kind` type/consumers elsewhere need the same alias (cross-file follow-up) |

---

### src/cli/commands/config-nervous.ts — 2 total hits, 1 user-visible (do-not-rename), 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/config-nervous.ts:4 | comment "Sprint 147 Task 15" | internal | n/a | comment |
| src/cli/commands/config-nervous.ts:281 | `'KILL_LIVE_SPRINT'` printed as part of the safety-floor action-id list | user-visible (data value, printed verbatim) | **NOT safe to rename in isolation** — system-wide typed `ActionId` literal in `src/core/config-types.ts`/`src/core/nervous-types.ts`, consumed across `src/nervous/action-registry.ts`, `authority-matrix.ts`, `panic-gate.ts`, `src/core/config.ts` | **Governance/policy identifier** — renaming requires a coordinated cross-file ADR-tracked change, well beyond a messages.ts swap. Flag for a dedicated follow-up task, do NOT rename standalone. |

---

### src/cli/helpers/onboarding-apply.ts — 1 hit, comment-only. No table row needed.
### src/cli/helpers/catalog-render.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/models.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/chat-permissions.ts — 1 hit, comment-only. No table row needed.

---

## Batch-2 cross-file notes

1. **CLI flag/positional names requiring compat treatment** (need `--run` alias + deprecation before removing `--sprint`/`sprint-id`/`sprintId` labels): `audit.ts` `--sprint <id>` + `[sprint-id]` positional; `usage.ts` `--sprint <N>`; `evolve.ts` `--sprints <n>`; `resume.ts` `<sprintId>` positional; `process.ts` `--kind sprint` accepted enum value.
2. **JSON output field names** needing dual-emit/deprecation if renamed: `dashboard.ts:164` `{error: '...'}` payload text (also bypasses i18n today); `features.ts:145` `sprint` field in `--json` output.
3. **Pre-existing i18n gaps found**: `resume.ts` has zero `getMessage()` calls (100% raw hardcoded English); `start.ts:740` is hardcoded Turkish-only with no English variant; `dashboard.ts:164`'s JSON error string bypasses `getMessage` despite an equivalent key existing one branch away.
4. **Messages.ts keys needing migration** (not in dilim-1 list, contain literal "sprint" wording): `start.sprint_planned`, `plan.sprint_planned`, `plan.note_sprint_size`, `evolve.no_sprint_data`, `evolve.report_header`, `status.sprint_active`. Three (`start.sprint_planned`, `plan.sprint_planned`, `plan.note_sprint_size`) already use the transitional "Run N (sprint) (...)" format — full migration means dropping the "(sprint)" parenthetical.
5. **`KILL_LIVE_SPRINT`** (`config-nervous.ts:281`) flagged but explicitly recommended AGAINST a standalone rename — governance/safety-floor action-id literal used system-wide.

### src/cli/commands/finalize.ts — 85 total hits, 12 user-visible, 73 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/finalize.ts:205 | `.option('--sprint <id>', 'Specific sprint ID to finalize (e.g. sprint-063). Defaults to auto-detect from tasks.')` | user-visible | `run-text: 'Specific run ID to finalize (e.g. run-063)...'` (flag NAME `--sprint` unchanged) | option desc cosmetic; flag NAME is a CLI surface, needs alias/deprecation if renamed separately |
| src/cli/commands/finalize.ts:224 | `` `Warning: Mixed sprint IDs detected: ${ids}. Proceeding with ${id}.` `` | user-visible | NEW key `finalize.mixed_sprint_warning` → `run-text: 'Warning: Mixed run IDs detected: {ids}. Proceeding with {id}.'` | cosmetic |
| src/cli/commands/finalize.ts:243,291 | `` `Terminated orphan sprint process (PID ${pid}) so it cannot race this finalize.` `` | user-visible | NEW key `finalize.orphan_terminated` → `run-text: 'Terminated orphan run process (PID {pid})...'` | cosmetic |
| src/cli/commands/finalize.ts:266 | `` `Sprint ${id} has already been finalized. Use --force to re-finalize.` `` | user-visible | NEW key `finalize.already_finalized` → `run-text: 'Run {id} has already been finalized...'` | cosmetic |
| src/cli/commands/finalize.ts:348-354 | `getMessage('finalize.complete', ...)` → `'Run {sprintId} (sprint) finalized: ...'` | user-visible | EXISTING key `finalize.complete` — still has literal "(sprint)" suffix | needs cleanup: drop "(sprint)" parenthetical |
| src/cli/commands/finalize.ts: (rest, ~73 hits) | `sprintId` var/param, `Sprint`/`SprintStatus`/`SprintPhase` type names, `sprint-controller.js`/`sprint-pid-manager.js` module names, function names `buildSprintFromTasks`/`isSprintAlreadyFinalized`/`detectMixedSprints`/`terminateOwnedSprintProcess`, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/doctor.ts — 51 total hits, 9 user-visible, 42 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/doctor.ts:1215 | `` `  OK Last sprint: ${id} (completed)` `` | user-visible | NEW key `doctor.last_sprint_line` → `run-text: '  OK Last run: {id} (completed)'` | cosmetic |
| src/cli/commands/doctor.ts:1249 | `` `  Sprints: ${n} completed (last: ${id})` `` | user-visible | NEW key `doctor.sprints_summary_line` → `run-text: '  Runs: {n} completed (last: {id})'` | cosmetic |
| src/cli/commands/doctor.ts:1251 | `'  Sprints: none yet'` | user-visible | NEW key `doctor.sprints_none` → `run-text: '  Runs: none yet'` | cosmetic |
| src/cli/commands/doctor.ts:1330 | `` `  Fix ${n} required issue(s) before starting a sprint.` `` | user-visible | NEW key `doctor.recommendation_fix_issues` → `run-text: '...before starting a run.'` | cosmetic |
| src/cli/commands/doctor.ts:1335 | `'  Everything looks good! You can start a new sprint with \`deckent start\`.'` | user-visible | NEW key `doctor.recommendation_all_good` → `run-text: '...start a new run...'` | cosmetic |
| src/cli/commands/doctor.ts:1573 | `'Cannot determine host RAM — verify manually before running multi-worker sprint.'` | user-visible | `run-text: '...multi-worker run.'` | cosmetic |
| src/cli/commands/doctor.ts:1933 | `.option('--pre-flight', 'Run pre-flight health check before sprint spawn (stricter gates)')` | user-visible | `run-text: '...before run spawn...'` | cosmetic `--help` |
| src/cli/commands/doctor.ts:2082 | `` `\nPre-flight FAILED — ${n} required check(s) failed. Sprint aborted.` `` | user-visible | NEW key `doctor.preflight_failed` → `run-text: '...Run aborted.'` | cosmetic |
| src/cli/commands/doctor.ts:2087 | `` `\nPre-flight PASSED${note} — sprint can proceed.` `` | user-visible | NEW key `doctor.preflight_passed` → `run-text: '...run can proceed.'` | cosmetic |
| src/cli/commands/doctor.ts: (rest) | `lastSprintId`/`sprintNum`/`abortSprint` vars/fields, `getLastSprintId()` fn, `readLatestCIReport(sprintId)` param, comments (Sprint 145/150/166/190/192/194/198/271/356/357/367/368/445) | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/chat-slash-registry.ts — 41 total hits, 13 user-visible, 28 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/chat-slash-registry.ts:116 | `desc: 'Aktif sprint durumunu göster'` | user-visible | `run-text: 'Aktif run durumunu göster'` (file uses raw TR strings, not messages.ts) | cosmetic `/help` menu text |
| src/cli/commands/chat-slash-registry.ts:128 | `desc: 'Sprint planla'` | user-visible | `run-text: 'Run planla'` | cosmetic |
| src/cli/commands/chat-slash-registry.ts:133-136 | `name: '/sprint', desc: 'Sprint geçmişini göster'` | user-visible | command NAME `/sprint` itself is user-typed — rename candidate `/run` with `/sprint` kept as alias; desc `run-text: 'Run geçmişini göster'` | **compat concern**: `/sprint` is a user-facing slash-command name, needs alias/deprecation |
| src/cli/commands/chat-slash-registry.ts:140,164,170,245,251,257,263,276 | various `desc:` TR strings (`'Son sprint retrospektifini göster'`, `'Sprint sonuçlarını açıkla'`, `'⚠️ Aktif sprint/worker durdur'`, `'Çökmüş sprint kurtar'`, `'Sprint audit'`, etc.) | user-visible | `run-text:` reword each — replace "sprint" → "run" throughout | cosmetic, safe (example args like `sprint-224` are illustrative only) |
| src/cli/commands/chat-slash-registry.ts:282 | `desc: 'Token/limit kullanımını göster (örn: /usage --sprint 275)'` | user-visible | `run-text: '...(örn: /usage --run 275)'` — the actual flag parsed is `--sprint` (see line 548), text+behavior must update together | **compat concern**: `--sprint` is a real parsed sub-flag inside `/usage` REPL command |
| src/cli/commands/chat-slash-registry.ts:548,551 | `if (sub === '--sprint') { ... messageKey: 'chat.usage_sprint_required' }` | user-visible (behavioral) | flag literal `'--sprint'` is a parsed sub-flag; `messageKey: 'chat.usage_sprint_required'` — **BUG: this key does NOT exist in messages.ts** (verified via grep) — needs new key `chat.usage_run_required` | **compat concern**: `--sprint` is a real user-typed REPL flag, needs alias period; also fixes a pre-existing latent bug (missing key) |
| src/cli/commands/chat-slash-registry.ts: (rest) | comments (Sprint 221/223/224/269/280/358), `args['sprintId']` object field | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/init-templates.ts — 33 total hits, 32 user-visible, 1 internal

All hits (except line 7's file-header comment) are inside template-literal generators (`generateDeckentContentTR/EN`, `generateDirectivesTemplateTR/EN`, `generateQuickStartDoc`, `generateDirectivesGuideDoc`, `generateConfigReferenceDoc`, `generateBootContent`, `generateCursorDeckentMd`) that write content verbatim into user-project files (DECKENT.md, DIRECTIVES.md, docs/quick-start.md, etc). None route through messages.ts.

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/init-templates.ts:45,106 | `'- Sprint is NEVER left incomplete'` (TR/EN DECKENT.md template) | user-visible | `run-text: '- Run is NEVER left incomplete'` | cosmetic generated-doc text; cross-check wording consistency with this project's own CLAUDE.md immutable-laws |
| src/cli/commands/init-templates.ts:50,111 | `` `2. `deckent set-directives` — Sprint hedeflerini yaz` `` / EN mirror | user-visible | `run-text: 'Run hedeflerini yaz'` / `'Write run goals'` | cosmetic |
| src/cli/commands/init-templates.ts:163,165,204,206 | `` `# DIRECTIVES — Sprint 001: ${name} İlk Sprint` `` + goal line, TR/EN | user-visible | `run-text: 'Run 001: {name} İlk Run'` etc. | cosmetic scaffold heading |
| src/cli/commands/init-templates.ts:193,195,234,236 | numbered instructions ("sprint hedefinizi... task'larınızı yazın", "starts the sprint") TR/EN | user-visible | `run-text:` reword each | cosmetic |
| src/cli/commands/init-templates.ts:245,253,293,301 | quick-start.md TR/EN headings (`# Hızlı Başlangıç — İlk Sprint`, `## 2. Sprint Planlayın`, `# Quick Start — Your First Sprint`, `## 2. Plan the Sprint`) | user-visible | `run-text:` reword each to "Run" | cosmetic |
| src/cli/commands/init-templates.ts:348,350,394,396 | directives-guide.md TR/EN example fenced-code content (`# DIRECTIVES — Sprint NNN: Sprint Başlığı`, goal descriptions) | user-visible | `run-text:` reword each | cosmetic (documentation example) |
| src/cli/commands/init-templates.ts:474,476,522,524 | `decay_after_sprints` config-key row (key frozen) + description prose "Kaç sprint sonra decay başlar" / "## Sprint Ayarları" TR/EN | mixed | key `decay_after_sprints` frozen; prose `run-text: 'Kaç run sonra decay başlar'` / `'## Run Ayarları'` | config key namespace frozen — see B1 sprint_file_retention note in docs section |
| src/cli/commands/init-templates.ts:540,542,557,559 | BOOT.md TR/EN headings/body (`# Sprint Başlatma Süreci`, `Bir sprint başlatıldığında...`) | user-visible | `run-text:` reword each | cosmetic; `deckent start` subcommand unaffected |
| src/cli/commands/init-templates.ts:604,605,609,613 | Cursor .mdc template lines (`Set sprint goals`, `Plan sprint tasks`, `Sprint retrospective`, `Follow DIRECTIVES.md for sprint goals`) | user-visible | `run-text:` reword each | cosmetic |
| src/cli/commands/init-templates.ts:7 | file header comment "Split from init.ts (Sprint 144 Task 1)" | internal | n/a — exempt | comment |

---

### src/cli/commands/history.ts — 24 total hits, 7 user-visible, 17 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/history.ts:197 | `` `--- Trend (last ${n} sprints) ---` `` | user-visible | `run-text: '--- Trend (last {n} runs) ---'` | cosmetic |
| src/cli/commands/history.ts:225 | `.description('Show sprint history')` | user-visible | `run-text: 'Show run history'` | cosmetic `--help` |
| src/cli/commands/history.ts:229 | `.option('--last <n>', 'Show only last N sprints')` | user-visible | `run-text: 'Show only last N runs'` | cosmetic |
| src/cli/commands/history.ts:230 | `.option('--trend', 'Show success rate/coverage trend analysis for last 5 sprints')` | user-visible | `run-text: '...for last 5 runs'` | cosmetic |
| src/cli/commands/history.ts:303 | `const headers = ['Sprint', 'Tasks', 'Done', ...]` (table column header) | user-visible | `run-text: 'Run'` column header | display-only, safe; JSON output uses `r.sprint` field (compat concern, see below) |
| src/cli/commands/history.ts:237,244,287 | `getMessage('history.no_history'/'history.no_match', ...)` | user-visible | already-migrated per dilim-1 34-key list | n/a — DONE |
| src/cli/commands/history.ts: (rest) | `SPRINTS_DIR` const, `SprintRecord` interface + `.sprint` field, `collectSprintFiles`/`parseSprintLog` fn names, `sprintId` var, comments | internal | n/a — exempt | frozen; note `SprintRecord.sprint` field VALUE originates from `sprint-*.md` log titles |

---

### src/cli/commands/recover.ts — 20 total hits, 3 user-visible, 17 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/recover.ts:122 | `.command('recover <sprint-id>')` | user-visible | positional arg display name → `<run-id>` | **compat concern**: display name in `--help` usage syntax |
| src/cli/commands/recover.ts:123 | `.description('Recover from a crashed or stuck sprint (audit + cleanup + archive)')` | user-visible | `run-text: 'Recover from a crashed or stuck run...'` | cosmetic `--help` |
| src/cli/commands/recover.ts:191,209,224,148,150,172 | `getMessage('recover.confirm_header'/'recovering'/'complete'/'restore_success'/'restore_failed'/'preview_header', ...)` | user-visible | already-migrated per dilim-1 list (confirmed no "sprint" word remains) | n/a — DONE |
| src/cli/commands/recover.ts: (rest) | `sprintId` param, `sprint-finalizer.js` module import, regex `/^sprint-\d+-ipc$/` matching real on-disk dir names | internal | n/a — exempt | frozen (data pattern, not display text) |

---

### src/cli/commands/init-steps.ts — 16 total hits, 8 user-visible, 8 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/init-steps.ts:314,315 | `## Sprint Instructions` / `- Read DIRECTIVES.md for current sprint goals` (generated AGENTS.md) | user-visible | `run-text: '## Run Instructions'` / `'- Read DIRECTIVES.md for current run goals'` | cosmetic generated-doc |
| src/cli/commands/init-steps.ts:328,344 | `- Follow DIRECTIVES.md for sprint goals` (GEMINI.md + .cursor/rules templates) | user-visible | `run-text: '- Follow DIRECTIVES.md for run goals'` | cosmetic |
| src/cli/commands/init-steps.ts:548,549,556,557 | `sprint_started: 'Sprint {id} started with {count} tasks'` / `sprint_complete: 'Sprint {id} complete'` (TR/EN, scaffolded into USER's own project i18n files) | user-visible | `run-text:` reword value text (key name `sprint_started`/`sprint_complete` is example content, low priority, could rename too since it's scaffolded into the end-user's app, not deckent's own UI) | lower priority — scaffold/example content, not a frozen deckent surface |
| src/cli/commands/init-steps.ts: (rest) | comments (Sprint 144/150/352), `ensureDir(..., 'sprints')` directory-name literal | internal | n/a — exempt | comment + directory path segment |

---

### src/cli/commands/retro-formatter.ts — 12 total hits, 6 user-visible, 6 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/retro-formatter.ts:6,14,23,24,26 | local `RETRO_LABELS` table (own i18n table, NOT messages.ts): `sprintRetro`, `deltaPrev`, `trend`, `sprint`, `noTrend` — all EN/TR pairs with "Sprint" text | user-visible | `run-text:` reword each value (e.g. `'Run Retrospective'`/`'Run Retrospektifi'`, `'Run Trend'`/`'Run Trendi'`); consider consolidating this parallel local table into messages.ts's `retro.*` namespace as a follow-up | cosmetic printed header/labels, safe |
| src/cli/commands/retro-formatter.ts:42 | `` `=== ${lbl('sprintRetro', lang)}: ${summary.sprintId} ===` `` | user-visible (structural, uses label above) | covered by the `sprintRetro` label fix | no separate action |
| src/cli/commands/retro-formatter.ts: (rest) | `RichSprintSummary`/`SprintTrendEntry` type imports, `.sprintId` field access | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/spawn.ts — 9 hits, 0 user-visible, 9 internal (comment-only + module names). No table row needed.
### src/cli/commands/chat-status-line.ts — 7 hits, 0 user-visible, 7 internal (type fields/comments). No table row needed.
### src/cli/commands/bot.ts — 6 hits, 0 user-visible, 6 internal (comments + import). No table row needed.

### src/cli/helpers/agent-templates.ts — 4 total hits, 4 user-visible, 0 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/agent-templates.ts:22,23 | `## Sprint Instructions` / `- Read DIRECTIVES.md for current sprint goals` (generateAgentsMd) | user-visible | `run-text:` reword each | cosmetic generated-doc |
| src/cli/helpers/agent-templates.ts:51,76 | `- Follow DIRECTIVES.md for sprint goals` (generateGeminiMd/generateCursorRules) | user-visible | `run-text:` reword each | cosmetic |

---

### src/cli/commands/archive-debt.ts — 4 total hits, 2 user-visible, 2 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/archive-debt.ts:20 | `.option('--before <sprint>', 'Also report resolved items originating before this sprint ID')` | user-visible | placeholder `<sprint>` + desc `run-text: '--before <run>', 'Also report resolved items originating before this run ID'` | `--before` flag itself unchanged; parsed value compared against `r.originSprintId` (internal, unaffected) |
| src/cli/commands/archive-debt.ts:41 | `'Resolved debt is retained in memory.db and pruned by sprint decay —'` | user-visible | `run-text: '...pruned by run decay —'` | cosmetic |
| src/cli/commands/archive-debt.ts: (rest) | comment, `r.originSprintId` field | internal | n/a — exempt | comment + DB field name |

---

### src/cli/helpers/cursor-config.ts — 2 total hits, 2 user-visible, 0 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/cursor-config.ts:17 | `'This project uses Deckent for multi-agent sprint orchestration.'` (generated .cursor/rules/deckent.mdc) | user-visible | `run-text: '...multi-agent run orchestration.'` | cosmetic generated-doc |
| src/cli/helpers/cursor-config.ts:19 | `- Read DIRECTIVES.md for current sprint goals` | user-visible | `run-text: '...current run goals'` | cosmetic |

---

### src/cli/commands/openrouter-probe.ts — 2 hits, comment-only. No table row needed.
### src/cli/commands/chat-slash-menu.ts — 2 hits, comment-only. No table row needed.
### src/cli/helpers/mcp-attach.ts — 1 hit, comment-only. No table row needed.
### src/cli/helpers/ansi.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/mcp.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/chat-nervous-bridge.ts — 1 hit, comment-only. No table row needed.

---

## Batch-3 cross-file notes

1. **Bug found (independent of this rename)**: `chat-slash-registry.ts:551` references `messageKey: 'chat.usage_sprint_required'`, but no such key exists in `messages.ts` (verified). Rename work should create the correctly-named replacement (`chat.usage_run_required`) rather than perpetuate the gap.
2. **Two real CLI/REPL flag-name surfaces** needing alias/deprecation: `finalize.ts:205` `--sprint <id>` on `deckent finalize`; `chat-slash-registry.ts:548` the `--sprint` sub-flag parsed inside `/usage`, plus the `/sprint` slash-command name itself (line 133); `recover.ts:122` `<sprint-id>` positional on `deckent recover`.
3. **`init-templates.ts`, `init-steps.ts`, `agent-templates.ts`, `cursor-config.ts`** all generate content written into the end-user's OWN project files (DECKENT.md, DIRECTIVES.md, AGENTS.md, GEMINI.md, .cursor/rules/*.mdc, docs/*.md, and a demo i18n scaffold in init-steps.ts). These are user-visible by definition but distinct from live CLI console output — sequence separately since they affect scaffolded files rather than live terminal output.

### src/cli/commands/explain.ts — 66 total hits, 8 user-visible, 58 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/explain.ts:240-241 | `Task ${id} Routing Kararları (${sprintId})` / EN mirror | user-visible | new key `explain.task_routing_header` — no literal "sprint" word in label itself, only interpolated value | cosmetic; `sprintId` var frozen |
| src/cli/commands/explain.ts:299 | `'Next: Run \`deckent start\` to continue, or \`deckent plan\` to see next sprint'` (+TR twin) | user-visible | `explain.next_hint` → `run-text: '...to see next run'` | cosmetic |
| src/cli/commands/explain.ts:318 | `` `Sprint #${n} ${label('summary', lang)}` `` | user-visible | `explain.header_title` → `run-text: 'Run #{n} ...'` | cosmetic |
| src/cli/commands/explain.ts:365 | `.description('Explain what the last sprint did in human-friendly language')` | user-visible | `run-text: '...the last run did...'` | cosmetic `--help` |
| src/cli/commands/explain.ts:366 | `.option('--sprint <id>', 'Show a specific sprint by ID (e.g. 042)')` | user-visible | flag name: alias needed; desc `run-text: 'Show a specific run by ID (e.g. 042)'` | **flag NAME `--sprint`** external CLI surface — needs `--run` alias + deprecation |
| src/cli/commands/explain.ts:391 | `` `Sprint ${opts.sprint} not found` `` | user-visible | `run-text: 'Run {opts.sprint} not found'` | cosmetic |
| src/cli/commands/explain.ts:400 | `'No sprints found. Run \`deckent start\` to begin.'` | user-visible | `run-text: 'No runs found...'` | cosmetic |
| src/cli/commands/explain.ts:442 | `sprintId: summary.sprintNumber,` inside `--json` output | user-visible | keep key `sprintId` in JSON — do not rename (frozen identifier) | **JSON output field name** — external contract, but IS the frozen `sprintId` |
| src/cli/commands/explain.ts: (rest) | `sprintId` param/var, `SprintSummary` type, `findLatestSprintLog`/`parseSprintLog`/`parseSprintNumber` fn names, `sprintsDir` path, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/retro.ts — 48 total hits, 12 user-visible, 36 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/retro.ts:20,28,37,38,40 | local `RETRO_LABELS` table (same pattern as retro-formatter.ts): `sprintRetro`, `deltaPrev`, `trend`, `sprint`, `noTrend` | user-visible | `retro.header_title`/`retro.delta_prev_label`/`retro.trend_label`/`retro.sprint_col_label`/`retro.no_trend` → `run-text:` reword each | cosmetic table header/labels |
| src/cli/commands/retro.ts:110,286 | `` `=== ${lbl('sprintRetro', lang)}: ${id} ===` `` / `` `${lbl('sprint', lang).padEnd(16)}` `` | user-visible (structural, uses labels above) | covered by the label-table fix | no separate action |
| src/cli/commands/retro.ts:337 | `.description('Show the latest sprint retrospective')` | user-visible | `run-text: '...the latest run retrospective'` | cosmetic `--help` |
| src/cli/commands/retro.ts:339 | `.option('--compare', 'Show delta comparison with previous sprint')` | user-visible | `run-text: '...with previous run'` | cosmetic |
| src/cli/commands/retro.ts:342 | `.option('--trend [n]', 'Show success rate trend across last N sprints (default: 5)')` | user-visible | `run-text: '...across last N runs...'` | cosmetic |
| src/cli/commands/retro.ts:357,398 | `getMessage('retro.none_found'/'no_previous_sprint', ...)` | user-visible | already-migrated per dilim-1 list | n/a — DONE |
| src/cli/commands/retro.ts: (rest) | `sprintId` var/field, `RichSprintSummary`/`SprintTrendEntry` types, `SPRINTS_DIR` const, `sprintsDir` path, `sprint-XXX.md` filename regex, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/helpers/output.ts — 40 total hits, 8 user-visible, 32 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/output.ts:182 | `` `DECKENT ORCHESTRA — Sprint ${n} — ${time}` `` | user-visible | `dashboard.title` → `run-text: 'DECKENT ORCHESTRA — Run {n} — {time}'` | cosmetic dashboard box header |
| src/cli/helpers/output.ts:279 | `'  No CI data — run a sprint to generate CI reports'` | user-visible | `doctor.ci_no_data` → `run-text: 'No CI data — start a run to generate CI reports'` (avoid "run a run") | cosmetic |
| src/cli/helpers/output.ts:295,300 | `` `  Sprint: ${id}` `` (×2, CI baseline/latest) | user-visible | `doctor.ci_sprint_label` → `run-text: '  Run: {id}'` | cosmetic |
| src/cli/helpers/output.ts:304 | `'  Trend (last 5 sprints):'` | user-visible | `doctor.ci_trend_label` → `run-text: 'Trend (last 5 runs):'` | cosmetic |
| src/cli/helpers/output.ts:435-438 | `` `Sprint ${label} (standalone — no dashboard)` `` | user-visible | `status.standalone_header` → `run-text: 'Run {label} (standalone — no dashboard)'` | cosmetic |
| src/cli/helpers/output.ts:474,477,478 | `` `Run ${..} (sprint) — completed` ``, `'No active run (sprint)...'`, `'...start the next run (sprint).'` (mixed transitional wording) | user-visible | `status.complete_done_label`/`status.complete_no_active`/`status.complete_next_hint` → drop the "(sprint)" parenthetical entirely | cosmetic, currently mid-migration |
| src/cli/helpers/output.ts:483-486 | `` `Sprint ${n} — ${title}` `` / `` `Sprint ${n}` `` | user-visible | `status.header_label` → `run-text: 'Run {n}'` | cosmetic |
| src/cli/helpers/output.ts: (rest) | `Sprint` type import, `SprintPhase` enum, `CIBaseline`/`CIReport.sprintId` fields, `formatSprintSummary`/`formatHumanSprintComplete` fn names, `hasLiveSprint` param, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/agent.ts — 28 total hits, 4 user-visible, 24 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/agent.ts:432 | `.description('Show sprint-by-sprint performance for an agent')` | user-visible | `run-text: 'Show run-by-run performance for an agent'` | cosmetic `--help` |
| src/cli/commands/agent.ts:449 | `{ agent: {...}, sprints: sprintStats }` (`--json` output) | user-visible | keep key `sprints` or rename to `runs` — needs migration plan | **JSON output field name** — external contract, needs alias/deprecation |
| src/cli/commands/agent.ts:459 | `'No sprint history found for this agent.'` | user-visible | `run-text: 'No run history found for this agent.'` | cosmetic |
| src/cli/commands/agent.ts:463 | `['Sprint', 'Tasks', 'Success', 'Rate']` table header | user-visible | `run-text: ['Run', ...]` | cosmetic table header |
| src/cli/commands/agent.ts:617 | `.requiredOption('--sprint <id>', 'Sprint id (e.g. sprint-191)')` (reclassify subcommand) | user-visible | flag name alias needed; desc `run-text: 'Run id (e.g. run-191)'` | **flag NAME `--sprint`** external CLI surface — needs `--run` alias |
| src/cli/commands/agent.ts: (rest) | `SPRINTS_DIR` const, `lastUsedInSprint` field, `AgentSprintStat` type, `sprintsDir` path, `opts.sprint` param, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/autonomous.ts — 24 total hits, 1 user-visible, 23 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/autonomous.ts:1198 | `.option('--kind <kind>', 'Entry kind: task (default), sprint, or capability', 'task')` | user-visible | desc `run-text: 'Entry kind: task (default), run, or capability'`; enum value `'sprint'` needs alias/deprecation | **enum VALUE `sprint`** is a real CLI arg users type (`--kind sprint`) — needs alias, not cosmetic-only |
| src/cli/commands/autonomous.ts: (rest) | comments, `runSprintLifecycle`/`getSprintStateSnapshot` imports, `sprintId` param default, `kind:'sprint'` type union, `deckent_style:'sprint'` config value, LLM-prompt JSON schema text | internal | n/a — exempt | frozen per exclusion list; `kind:"sprint"` inside the LLM prompt template (line 365) is sent to the model, not printed to a terminal user |

---

### src/cli/commands/test-run.ts — 19 total hits, 6 user-visible, 13 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/test-run.ts:88 | `.description('Run a test sprint (no retro, no memory update, no decay)')` | user-visible | `run-text: 'Execute a test run (no retro, no memory update, no decay)'` (avoid "Run a test run") | cosmetic `--help` |
| src/cli/commands/test-run.ts:90 | `.option('--timeout <ms>', 'Maximum sprint duration in milliseconds', ...)` | user-visible | `run-text: 'Maximum run duration in milliseconds'` | cosmetic |
| src/cli/commands/test-run.ts:177 | `` `Starting test sprint (timeout: ${ms}ms)...` `` | user-visible | `run-text: 'Starting test run (timeout: {ms}ms)...'` | cosmetic |
| src/cli/commands/test-run.ts:185 | `'Working tree stashed. Restoring after test sprint...'` | user-visible | `run-text: '...Restoring after test run...'` | cosmetic |
| src/cli/commands/test-run.ts:60,64 | `` `<testsuite name="deckent-sprint-${id}"...>` `` / `` `classname="sprint.${id}"` `` (JUnit XML output) | user-visible | keep as-is or rename to `deckent-run-${id}` / `classname="run.${id}"` | **CI-consumed output format** (JUnit XML `--reporter junit`) — external contract for CI tooling, needs care/versioning |
| src/cli/commands/test-run.ts:263 | `` `Test sprint failed at phase ${phase}: ${msg}` `` | user-visible | `run-text: 'Test run failed at phase {phase}: {msg}'` | cosmetic |
| src/cli/commands/test-run.ts: (rest) | `runSprint` import, `formatSprintSummary` import/call, `sprint` var, `.tasks`/`.id`/`.metrics` field access, comments | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/help.ts — 16 total hits, 16 user-visible, 0 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/help.ts:28,74 | `heading: 'Sprint Workflow'` (EN/TR: 'Sprint İş Akışı') | user-visible | `run-text: 'Run Workflow'` / `'Run İş Akışı'` | cosmetic section heading |
| src/cli/commands/help.ts:31,32,34,35,42,62 (EN) + 77,78,80,81,88,108 (TR) | help-table description cells (`'Start a sprint (spawn workers)'`, `'Show current sprint status'`, `'Read sprint retrospective'`, `'Archive completed sprint'`, `'Live sprint progress'`, `'Plan sprint tasks from DIRECTIVES.md'` + TR twins) | user-visible | `run-text:` reword each — replace "sprint" → "run" throughout | cosmetic display text |
| src/cli/commands/help.ts:46,92 | `['deckent audit <sprintId>', 'Run the self-audit gate']` (EN/TR) | user-visible | keep `<sprintId>` placeholder as-is (mirrors frozen identifier); verify against actual `deckent audit` arg name for consistency | display placeholder mirrors internal `sprintId` naming |

---

### src/cli/commands/output.ts — 13 total hits, 4 user-visible, 9 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/output.ts:69 | `.option('--sprint-id <sprintId>', 'Sprint ID to read from (defaults to current sprint)')` | user-visible | flag name alias `--run-id` needed; desc `run-text: 'Run ID to read from (defaults to current run)'` | **flag NAME `--sprint-id`** external CLI surface — needs `--run-id` alias |
| src/cli/commands/output.ts:79 | `` const sprint = sprintId ?? getCurrentSprintId(root) ?? 'current sprint'; `` | user-visible | `run-text: 'current run'` fallback literal | cosmetic, feeds into line 80/81 output |
| src/cli/commands/output.ts:81 | `` `Output files are written to: .deckent/<sprint>-outputs/task-<id>.out` `` | user-visible | display placeholder `<sprint>` → `<run>` IF the actual output directory naming convention is also renamed | **directory-naming pattern surface** — mirrors real on-disk `.deckent/<sprint>-outputs/` naming; renaming display alone without the real dir convention would be misleading |
| src/cli/commands/output.ts: (rest) | comment describing `sprint-NNN-outputs` dir, `getCurrentSprintId` import, `sprintId` field/param | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/resources.ts — 11 total hits, 1 user-visible, 10 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/resources.ts:207 | `{ summaries, sprintSummary: sprintSum }` (`--json` output) | user-visible | keep key `sprintSummary` or rename to `runSummary` — needs migration plan | **JSON output field name** — external contract, needs alias/deprecation |
| src/cli/commands/resources.ts: (rest) | comment header, `summarizeSprint` import, `SprintResourceSummary` type, `sprint` param name, `resources.sprint_peak` key (already-migrated), `sprintSum` var | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/plan-nl.ts — 8 total hits, 1 user-visible, 7 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/plan-nl.ts:128 | `.argument('<goal>', 'Free-form description of what the sprint should accomplish')` | user-visible | `run-text: '...what the run should accomplish'` | cosmetic `--help` |
| src/cli/commands/plan-nl.ts: (rest) | comment headers, `SprintSizeRecommendation` type import | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/helpers/process-runtime.ts — 6 hits, 0 user-visible, 6 internal (comments/config values). No table row needed.
### src/cli/helpers/detached-start.ts — 5 hits, 0 user-visible, 5 internal (comments/param names). No table row needed.
### src/cli/commands/memory.ts — 4 hits, 0 user-visible, 4 internal (comment/config field/var/filename template). No table row needed.

### src/cli/commands/onboard.ts — 3 total hits, 1 user-visible, 2 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/onboard.ts:243 | `'  1. Edit DIRECTIVES.md with your sprint goals'` | user-visible | `onboard.next_step_directives` → `run-text: '  1. Edit DIRECTIVES.md with your run goals'` | cosmetic |
| src/cli/commands/onboard.ts: (rest) | comments | internal | n/a — exempt | comments |

### src/cli/commands/skill.ts — 2 total hits, 1 user-visible, 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/skill.ts:662 | `` `    Last sprint:     ${manifest.stats.lastUsedInSprint \|\| 'never'}` `` | user-visible | `skill.info_last_sprint_label` → `run-text: '    Last run:      {val}'` | cosmetic label; `lastUsedInSprint` field itself frozen |
| src/cli/commands/skill.ts: (rest) | comment | internal | n/a | comment |

### src/cli/commands/flow.ts — 2 hits, comment-only. No table row needed.
### src/cli/commands/chat-enterprise-bridge.ts — 2 hits, comment-only. No table row needed.
### src/cli/helpers/health-snapshot.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/skill-marketplace.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/init.ts — 1 hit, comment-only. No table row needed.
### src/cli/commands/agentic-confirm.ts — 1 hit, comment-only. No table row needed.

---

## Batch-4 cross-file notes

1. **JSON output field names with "sprint" needing a compat plan**: `agent.ts:449` `sprints: sprintStats`; `resources.ts:207` `sprintSummary: sprintSum`. (`explain.ts:442`'s `sprintId` is exempt — it IS the frozen identifier.)
2. **CLI flag NAMES containing "sprint"** (real external surface, need `--run-*` alias + deprecation): `explain.ts:366` `--sprint <id>`; `agent.ts:617` `--sprint <id>` (on `agent reclassify`); `output.ts:69` `--sprint-id <sprintId>`; `autonomous.ts:1198/1217` `--kind <kind>` accepting literal value `sprint`.
3. **JUnit/CI-consumed output text** (`test-run.ts:60,64`) — external contract for CI tooling parsing `testsuite name`/`classname`, treat with the same care as a flag rename.
4. **Directory-naming convention echoed in help text** (`output.ts:81`) — `.deckent/<sprint>-outputs/` mirrors the real on-disk directory naming; renaming display text alone without a coordinated directory-naming decision would create a mismatch.

### src/cli/commands/status.ts — 55 total hits, 5 user-visible, 39 internal (batched), 11 comment-only

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/status.ts:356 | `.description('Show the current sprint dashboard')` | user-visible | `run-text: 'Show the current run dashboard'` | cosmetic `--help` |
| src/cli/commands/status.ts:420 | `'No active sprint found — cannot display dependency graph.'` | user-visible | `status.graph_no_active_run` → `run-text: 'No active run found — cannot display dependency graph.'` | cosmetic |
| src/cli/commands/status.ts:425 | `` `No dependency graph found for ${id}.\nRun a sprint with dependencies to generate the graph.` `` | user-visible | `status.graph_not_found` → `run-text: '...Run with dependencies to generate the graph.'` | cosmetic; `{id}` value untouched |
| src/cli/commands/status.ts:459,540 | `getMessage('status.no_active_sprint', ...)` | user-visible | already-migrated per dilim-1 34-key list | n/a — DONE |
| src/cli/commands/status.ts: (rest) | `sprintId` param/var/interface/type field/JSON field/regex/import path, `SprintMeta` type, `sprint-state.js` module path, `sprint_started_at` config field | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/kpi.ts — 47 total hits, 9 user-visible, 13 internal (batched), 25 comment-only

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/kpi.ts:103,257,289 | `getMessage('kpi.no_data', lang, { sprint: ... })` → `'No KPI data available for {sprint}.'` | user-visible | EXISTING key `kpi.no_data` (NOT in dilim-1 list) — needs migration; placeholder name `{sprint}` optional rename to `{run}` | cosmetic |
| src/cli/commands/kpi.ts:110,293 | `getMessage('kpi.title', lang, { sprint: ... })` → `'KPI Scorecard — {sprint}'` | user-visible | EXISTING key `kpi.title` (NOT in dilim-1 list) — needs migration | cosmetic |
| src/cli/commands/kpi.ts:114 | `'Sprint',` table column header (raw hardcoded, NOT routed through getMessage — inconsistent with sibling headers) | user-visible | NEW key `kpi.header_period` or reuse `run-text: 'Run'` | cosmetic; also a code-quality gap (not i18n'd like siblings) |
| src/cli/commands/kpi.ts:328 | `.description('Show the KPI scorecard for the current (or a specific) sprint')` | user-visible | `run-text: '...for the current (or a specific) run'` | cosmetic `--help` |
| src/cli/commands/kpi.ts:329 | `.option('--sprint <id>', 'Sprint id to score (defaults to the current sprint)')` | user-visible | flag name alias needed; desc `run-text: 'Run id to score (defaults to the current run)'` | **flag NAME `--sprint`** shared identically across kpi/agent/finalize/explain/usage/audit commands — needs one coordinated alias/deprecation decision |
| src/cli/commands/kpi.ts:331 | `.option('-n, --n <count>', 'Number of sprints to include in the trend (default 10)')` | user-visible | `run-text: 'Number of runs to include in the trend (default 10)'` | cosmetic |
| src/cli/commands/kpi.ts: (rest) | `sprintId`/`sprint` param, SQL `grain='sprint'` column-value, import path | internal | n/a — exempt | frozen per exclusion list; `grain='sprint'` is a DB schema value |

---

### src/cli/helpers/run-state-feed.ts — 35 total hits, 0 user-visible, 20 internal (batched), 15 comment-only

`RawSprintState` type, `sprintId` field, `SPRINT_STATE_FILE` const — no literal word "sprint" is ever displayed; the only interpolated content is the frozen `sprintId` value. No table row needed.

---

### src/cli/helpers/sprint-summary-rich.ts — 26 total hits, 3 user-visible, 17 internal (batched), 6 comment-only

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/sprint-summary-rich.ts:99 | `` `● Sprint #${n} Complete` `` (ANSI header, no messages.ts usage — pre-existing i18n gap) | user-visible | `run-text: '● Run #{n} Complete'`; consider wiring this module through getMessage as a follow-up | cosmetic ANSI header |
| src/cli/helpers/sprint-summary-rich.ts:257 | `` `Resolve ${n} tech debt item(s) in next sprint` `` | user-visible | `run-text: '...in next run'` | cosmetic |
| src/cli/helpers/sprint-summary-rich.ts:266 | `'All tasks complete — ready for next sprint'` | user-visible | `run-text: '...ready for next run'` | cosmetic |
| src/cli/helpers/sprint-summary-rich.ts: (rest) | `RichSprintInput` type, `sprint` param name, `formatRichSprintSummary` fn name | internal | n/a — exempt | frozen; module confirmed LIVE-called from `src/orchestra/sprint-finalizer.ts` (not dead code, unlike the plain `sprint-summary.ts`) |

---

### src/cli/commands/retro-parser.ts — 23 total hits, 0 user-visible, 23 internal (batched)

`RichSprintSummary`/`SprintTrendEntry` types, `sprintId` fields, regexes parsing existing RETRO.md table markup (`\| Sprint time \|`). Read-only parser of on-disk files — none of its regexes/fields produce console output directly. Regex at line 67 matches a table-header convention written elsewhere (sprint-reporter.ts, out of this batch) — renaming needs coordination. No table row needed (all internal).

---

### src/cli/commands/checkpoint.ts — 19 total hits, 1 user-visible, 17 internal (batched), 1 comment-only

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/checkpoint.ts:103 | `getMessage('checkpoint.col_sprint', ...)` | user-visible | already-migrated per dilim-1 34-key list | n/a — DONE |
| src/cli/commands/checkpoint.ts: (rest) | `sprintId` param/var/field, `.command('approve <sprintId> <phase>')` positional arg NAME | internal | n/a — exempt | frozen per exclusion list — `<sprintId>` positional CLI arg name explicitly frozen |

---

### src/cli/commands/do.ts — 16 total hits, 3 user-visible, 2 internal (batched), 11 comment-only

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/do.ts:378 | `.description('Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it)')` | user-visible | `run-text: '...turn a goal into a run plan...'` | cosmetic `--help` |
| src/cli/commands/do.ts:379 | `.option('--run', 'Approve and start the sprint for real (default is a dry-run preview only)')` | user-visible | `run-text: 'Approve and start the run for real...'` | flag NAME `--run` unaffected (already says "run") |
| src/cli/commands/do.ts:415 | `` `Sprint finished — exitCode ${code} (${outcome}).` `` — hardcoded duplicate of the already-migrated `do.finished` key | user-visible | should reuse EXISTING key `do.finished` (`'Run finished — exitCode {exitCode} ({outcome}).'`) instead of a raw hardcoded string | fix: wire this call site to `getMessage('do.finished', lang, {...})` rather than invent new text |
| src/cli/commands/do.ts: (rest) | `startSprint`/`evaluateSprint` GoldenFlowSeams property names | internal | n/a — exempt | internal seam/interface property names |

---

### src/cli/commands/nervous.ts — 13 total hits, 1 user-visible, 4 internal (batched), 8 comment-only

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/nervous.ts:686 | `'[deckent] No active directives_protection detector — run \`deckent nervous\` after starting a sprint'` | user-visible | NEW key `nervous.no_detector_active` → `run-text: '...after starting a run.'` (file already uses `getMessage`/`nervous.*` keys elsewhere) | cosmetic console error text |
| src/cli/commands/nervous.ts: (rest) | `PanicGuardPendingEvent.sprintId` field, `ev.sprintId` parsed-JSON field | internal | n/a — exempt | frozen per exclusion list |

---

### src/cli/commands/chat-tool-bridge.ts — 11 hits, 0 user-visible, all comment-adjacent/internal (`args['sprintId']`/`args['sprint']` object-key lookups for spawned-subprocess argv). No table row needed.
### src/cli/commands/chat-session.ts — 8 hits, comment-only. No table row needed.

### src/cli/helpers/i18n.ts — 6 total hits, 0 user-visible, 6 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/helpers/i18n.ts:55,56,59,65,66,74 | `MessageKey` TypeScript union members: `'status.sprint_active'`, `'status.no_active_sprint'`, `'start.sprint_planned'`, `'plan.sprint_planned'`, `'plan.note_sprint_size'`, `'cleanup.archived_sprints'` | internal | n/a — these are message-KEY identifiers (union type members), not the displayed VALUE text | **downstream dependency**: if any of these keys are renamed in messages.ts during migration, this union type must be updated in lockstep or `tsc` will fail |

---

### src/cli/commands/chat-render-region.ts — 5 hits, comment-only. No table row needed.
### src/cli/commands/limits.ts — 4 hits, comment-only. No table row needed.
### src/cli/commands/connect.ts — 3 hits, comment-only. No table row needed.

### src/cli/commands/run.ts — 2 total hits, 1 user-visible, 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/run.ts:242 | `.description('Run a single one-shot task without a sprint cycle')` | user-visible | `run-text: '...without a run cycle'` | cosmetic `--help`; note the tool is itself the `run` command — same self-referential wording risk flagged in MCP `deckent_run` |
| src/cli/commands/run.ts:8 | `import { ... } from '../../orchestra/sprint-controller.js';` | internal | n/a — exempt | module import path frozen |

### src/cli/commands/docs.ts — 2 total hits, 1 user-visible, 0 internal (1 comment)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/docs.ts:183 | `.description('Run managed doc updates without a sprint')` | user-visible | `run-text: '...without a run'` | cosmetic `--help` |

### src/cli/helpers/shutdown-hooks.ts — 1 hit, comment-only. No table row needed.
### src/cli/helpers/debt-counter.ts — 1 hit, comment-only. No table row needed.

### src/cli/commands/set-directives.ts — 1 total hit, 1 user-visible

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/cli/commands/set-directives.ts:34 | `.description('Write sprint goals to DIRECTIVES.md (content, file, or stdin)')` | user-visible | `run-text: 'Write run goals to DIRECTIVES.md...'` | cosmetic `--help` |

### src/cli/commands/chat-tool-exec.ts — 1 hit, comment-only. No table row needed.

---

## Batch-5 cross-file notes

1. **`--sprint` CLI flag name** (kpi.ts:329, and identically in agent.ts/finalize.ts/explain.ts/usage.ts/audit.ts) is the single largest genuine backward-compat risk surface: a stable, scriptable flag name shared across six commands. Only `--help` description text is safe to change per-file; the flag name itself needs one coordinated alias/deprecation decision across all six.
2. **`kpi.title` / `kpi.no_data`** and **`nervous.no_detector_active`** are the only genuinely *new* messages.ts entries this batch requires — everything else is either already-migrated (dilim-1 reused correctly) or a `run-text:` cosmetic replacement for `.description()`/`.option()` Commander calls (which are NEVER routed through `getMessage()` anywhere in the codebase — existing pattern, not a gap introduced here).
3. **`do.ts:415`** is a pre-existing hardcoded duplicate of the already-migrated `do.finished` key — fix is to delete the raw string and call `getMessage('do.finished', lang, {...})`.
4. **`sprint-summary-rich.ts`** has zero messages.ts wiring (fully hardcoded English) — its 3 user-visible strings are legitimate rename targets but note the pre-existing i18n gap.
5. **`i18n.ts`**'s `MessageKey` union members are key *names*, not display text — but if messages.ts renames those keys during migration, this file's type union must be updated in the same PR or `tsc` fails.

---

# YÜZEY 2 — MCP (src/mcp/tools/*.ts + src/mcp/server.ts)

Now I have all the data needed. Let me compile the full findings.

# "sprint" → "run" Rename Inventory — MCP Server Surface

Scope confirmed: none of these 17 files import `getMessage` from `src/cli/helpers/messages.ts` (only `src/mcp/writer-lease-gate.ts` does, which is out of scope). All user-visible replacement proposals below use `run-text:` literal prefixes — no existing messages.ts key applies to this file set.

---

### src/mcp/tools/start.ts — 72 total "sprint" grep hits, 6 user-visible, 66 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/start.ts:55 | `title: 'Start Sprint'` | user-visible | `run-text: "Start Run"` | Tool `title` metadata (display label), not the tool `name`. Safe to change directly — no external client depends on this prose label. |
| src/mcp/tools/start.ts:56 | `description: 'Start a full sprint in the background. Runs the complete lifecycle: ... Pre-spawn cost gate (Sprint 189 T-008): if the estimated sprint cost exceeds cost_limits.sprint_max_usd ... Returns immediately with a jobId — the sprint continues asynchronously. ...'` | user-visible | `run-text: "Start a full run in the background. Runs the complete lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. Pre-spawn cost gate: if the estimated run cost exceeds cost_limits.sprint_max_usd (.deckent/cost-config.json), the tool returns COST_GATE_EXCEEDED — override with acknowledgeCost=true (or force=true to skip the gate entirely). Returns immediately with a jobId — the run continues asynchronously. Use deckent_status to monitor progress and deckent_review to evaluate results. Prerequisite: deckent_init + deckent_set_directives must have been run."` | Pure `description` prose — safe to change directly. Note: `cost_limits.sprint_max_usd` is a real config key name embedded in prose — leave that literal key name untouched (config schema, not prose) even while rewording the surrounding sentence. Drop the internal "(Sprint 189 T-008)" changelog citation — dev-facing, not user-facing. |
| src/mcp/tools/start.ts:61 | `...independent of acknowledgeCost/force.'` (full describe: "...By default a sprint is blocked before spawn when a task's filesWrite path does not exist and looks like a typo/wrong-directory (the sprint-380 orphan-file mode)...") | user-visible | `run-text: "...By default a run is blocked before spawn when a task's filesWrite path does not exist and looks like a typo/wrong-directory (an orphan-file mode)..."` | Input schema property `description:` prose (attached to `acknowledgeScopePaths`). Property name itself unaffected. Drop the internal "sprint-380" changelog citation. Safe to change directly. |
| src/mcp/tools/start.ts:65 | `describe('Sprint maximum duration in milliseconds (default: 30 minutes = 1800000). Sprint is marked TIMEOUT if workers do not complete within this window.')` | user-visible | `run-text: "Run maximum duration in milliseconds (default: 30 minutes = 1800000). Run is marked TIMEOUT if workers do not complete within this window."` | `description:` prose on `timeout` input property. Property name unaffected. Safe to change directly. |
| src/mcp/tools/start.ts:66 | `describe('Run sprint in sandbox mode: stashes local git changes before spawning and restores them after the sprint completes. ...')` | user-visible | `run-text: "Run in sandbox mode: stashes local git changes before spawning and restores them after the run completes. Safe experimentation — no permanent changes on failure."` | `description:` prose on `sandbox` input property. Safe to change directly. |
| src/mcp/tools/start.ts:201 | `` `'Sprint started in background from an approved RunFlow snapshot (no re-plan). Use deckent_status to track progress.'` `` | user-visible | `run-text: "Run started in background from an approved RunFlow snapshot (no re-plan). Use deckent_status to track progress."` | Free-text `message` field inside JSON response content (`startData.message`). Safe to change directly — this is prose, not a structural field name. |
| src/mcp/tools/start.ts:232 | `` `message: \`Sprint already running (PID ${lockInfo.pid}, env: ${lockInfo.env}, sprint: ${lockInfo.sprintId}, started: ${lockInfo.acquiredAt}). Use force=true to override.\`` `` | user-visible | `run-text: "Run already running (PID ${lockInfo.pid}, env: ${lockInfo.env}, run: ${lockInfo.sprintId}, started: ${lockInfo.acquiredAt}). Use force=true to override."` | Free-text error `message` in response content. The `sprint:` label prefix inside the string is prose (mixed formatting case per task instructions), rename to `run:`; the `.sprintId` property access itself stays untouched (frozen field). Safe to change directly. |
| src/mcp/tools/start.ts:479 | `message: 'Sprint started in background. Use deckent_status to track progress.'` | user-visible | `run-text: "Run started in background. Use deckent_status to track progress."` | Free-text `message` field in JSON response content. Safe to change directly. |
| src/mcp/tools/start.ts:499 | `` `message = error instanceof BrainError ? \`Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}\` : ...` `` | user-visible | `run-text: "Run failed at phase ${error.phase ?? 'unknown'}: ${error.message}"` | Free-text error message returned in `content[].text` on the catch path. Safe to change directly. |
| src/mcp/tools/start.ts:9,10,13,17,26-27,42,55(title-dup already listed above),60,62,63,76-121 passim,125,135,157,214-215,225-227,244,254,260-261,274-275,283-292,299,307,315,358,368,376,379,384-396,401-441,499(context) (+dozens more) | `(sprintId schema property, SprintEstimate/SprintSizeRecommendation/SprintRunnerConfig type names, isSprintLocked/planSprint/estimateSprintFull identifiers, sprint-runner-entry.js path, jobId = \`sprint-${Date.now()}\`, internal code comments referencing "Sprint 189/143/152" task history, sprintId in JSON schema and JSON response fields, lockInfo.sprintId, sprint.id/sprint.tasks local var, "Sprint Lock Check" section-comment banner)` | internal | n/a — exempt / no action | Frozen per exclusion list (`sprintId` identifier, type names, code comments, internal module paths). The `jobId` value literally embeds the substring `sprint-` (`` `sprint-${Date.now()}` ``) as a job-id prefix — this is a generated ID value (data), not a UI string; out of this rename's classification but flag for the parent effort's awareness since it appears in the `jobId` field of the response (a structural identifier, not prose). |

---

### src/mcp/tools/explain.ts — 61 total "sprint" grep hits, 2 user-visible, 59 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/explain.ts:50 | `title: 'Sprint Explanation'` | user-visible | `run-text: "Run Explanation"` | Tool `title` metadata (display label). Safe to change directly. |
| src/mcp/tools/explain.ts:51 | `description: 'Explain what a sprint did in human-friendly language. Reads the sprint log from .brain/sprints/ and the retrospective from the Memory V2 DB to generate a summary including goal, task outcomes (completed/failed/tech debt), duration, and key learnings. Use after a sprint completes to get a quick overview. Supports specific sprint lookup, verbose mode for full details, and JSON output.'` | user-visible | `run-text: "Explain what a run did in human-friendly language. Reads the run log from .brain/sprints/ and the retrospective from the Memory V2 DB to generate a summary including goal, task outcomes (completed/failed/tech debt), duration, and key learnings. Use after a run completes to get a quick overview. Supports specific run lookup, verbose mode for full details, and JSON output."` | Pure `description` prose. `.brain/sprints/` is a real directory path (data location) — leave the path itself unchanged even while rewording surrounding prose (renaming the on-disk directory is a separate, much larger migration outside this task's scope). Safe to change the prose directly. |
| src/mcp/tools/explain.ts:54 | `sprintId: z.string().optional().describe('Show a specific sprint by ID (e.g. "042", "sprint-042"). If omitted, returns the latest sprint.')` | user-visible (describe prose only; property name itself is exempt) | `run-text: "Show a specific run by ID (e.g. \"042\", \"sprint-042\"). If omitted, returns the latest run."` | Property name `sprintId` is frozen/exempt per the rule (do not rename). Only the `describe()` prose changes. The example value `"sprint-042"` embedded in the prose is a literal ID-format example tied to the real on-disk filename pattern (`sprint-NNN.md`) — keep that example string as-is (it documents the real accepted input format, since callers still pass ids like `sprintId: "sprint-042"` or `"042"`), only reword the surrounding sentence. |
| src/mcp/tools/explain.ts:169 | `` text: JSON.stringify({ error: true, message: `Failed to explain sprint: ${message}` }) `` | user-visible | `run-text: "Failed to explain run: ${message}"` | Free-text error message in response content (catch-all handler). Safe to change directly. |
| src/mcp/tools/explain.ts:5,10-18,25,31-36,63-157 passim (SPRINTS_DIR const, findLatestSprintLog/parseSprintLog/parseSprintNumber/extractGoalFromSprintLog/buildExplainOutput imports from cli/commands/explain.ts, sprintFile/sprintPath/sprintContent/sprintSummary local vars, `retro-sprint-${sprintNumber}` DB id construction, filename pattern `sprint-${paddedId}.md`, ExplainData.sprintId field, sprintSummary.sprintNumber/goal/totalTasks/etc.) | internal | n/a — exempt | Frozen per exclusion list (identifiers, type/interface fields, internal helper imports). Note: `buildExplainOutput(...)` (imported from `cli/commands/explain.ts`, out of this scan's scope) populates the `output` field of the response with human-readable text generated by a DIFFERENT file — that file is not in this scope list, so any "sprint" wording inside its generated text is NOT inventoried here; flag for the parent rename effort as a likely additional user-visible surface once `cli/commands/explain.ts` is scanned. |

---

### src/mcp/tools/status.ts — 56 total "sprint" grep hits, 5 user-visible, 51 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/status.ts:306 | `title: 'Sprint Status'` | user-visible | `run-text: "Run Status"` | Tool `title` metadata. Safe to change directly. |
| src/mcp/tools/status.ts:307 | `description: 'Get the current sprint dashboard status. Returns: agents (...), progress (...), alerts (...), job (background job state: RUNNING/COMPLETE/FAILED + sprintId + metrics), ...'` | user-visible | `run-text: "Get the current run dashboard status. Returns: agents (active worker list with task assignments), progress (done/total counts + progress bar + ETA), alerts (stale workers, boundary violations, lock issues), job (background job state: RUNNING/COMPLETE/FAILED + sprintId + metrics), agentAssignments (which agent handles which tasks), skillAssignments (which skills are active). Call repeatedly to poll progress. No prerequisite — safe to call anytime."` | Pure `description` prose. `sprintId` mentioned inline as a field-name reference inside the description (documenting a real response field) — leave that literal field-name mention untouched (it is naming the frozen field, not describing "a sprint" in prose), only reword the surrounding sentence. |
| src/mcp/tools/status.ts:331 | `` message: `Sprint ${canonicalSprintId ?? latestJob.sprintId ?? ''} completed.` `` | user-visible | `run-text: "Run ${canonicalSprintId ?? latestJob.sprintId ?? ''} completed."` | Free-text `message` field in JSON response content (Part-C completed-job branch). Safe to change directly — `.sprintId` property access stays untouched. |
| src/mcp/tools/status.ts:349 | `message: 'No active sprint.'` | user-visible | `run-text: "No active run."` | Free-text `message` field in JSON response content (empty-dashboard branch). Safe to change directly. |
| src/mcp/tools/status.ts:312 | `outputMode: z.enum(...).optional().describe('Render mode for formatted output: explainatory (emoji + Türkçe insight blocks), standart (markdown table), verbose (full snapshot with timestamps), json (raw JSON). Defaults to standart.')` | internal — not flagged (contains no "sprint" text) | n/a | Listed only for completeness; this line has no "sprint" hit, included by mistake-check — no action needed. |
| src/mcp/tools/status.ts:9,20,23,45,48,72-115 passim,198-207,321-500 passim (getCurrentSprintId import, sprintId params throughout readEventStreamTail/readLastOutputs/readMetricSnapshot/loadDepGraphFiles helper signatures, per-sprint file path patterns `${sprintId}-events.jsonl` / `${sprintId}-metrics.jsonl` / `${sprintId}-outputs` / `${sprintId}-depgraph.mmd/json`, canonicalSprintId/resolvedSprintId local vars, StatusData['sprint'] type field, `sprint: state['sprint']` raw JSON field, `formatterData.sprintId` field, code comments "Sprint 139 T-010/T-047") | internal | n/a — exempt | Frozen per exclusion list (`sprintId` identifier everywhere, including as a template-literal file-path segment which is a data/storage-path convention, not UI prose; type/interface fields; code comments). |

---

### src/mcp/tools/help.ts — 27 total "sprint" grep hits, 9 user-visible, 18 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/help.ts:49 | `{ name: 'dashboard', uri: 'deckent://dashboard', description: 'Live sprint status: agents, progress, usage, alerts' }` | user-visible | `run-text: "Live run status: agents, progress, usage, alerts"` | MCP **resource** `description` field, returned inside `deckent_help`'s `resources` array response content. Pure prose — safe to change directly. The `uri: 'deckent://dashboard'` itself is unaffected (no "sprint" substring, not part of this row). |
| src/mcp/tools/help.ts:50 | `{ name: 'directives', ..., description: 'Current DIRECTIVES.md content — sprint goals and task definitions' }` | user-visible | `run-text: "Current DIRECTIVES.md content — run goals and task definitions"` | Resource `description` prose in response content. Safe to change directly. |
| src/mcp/tools/help.ts:51 | `{ name: 'memory', ..., description: 'Brain memory: sprint learnings and patterns (.brain/exports/memory.md)' }` | user-visible | `run-text: "Brain memory: run learnings and patterns (.brain/exports/memory.md)"` | Resource `description` prose in response content. File path unaffected. Safe to change directly. |
| src/mcp/tools/help.ts:54 | `{ name: 'retro', ..., description: 'Latest sprint retrospective (DB-first, exported to .brain/exports/)' }` | user-visible | `run-text: "Latest run retrospective (DB-first, exported to .brain/exports/)"` | Resource `description` prose. Safe to change directly. |
| src/mcp/tools/help.ts:158 | `return 'deckent_set_directives ile sprint hedeflerini yazin';` | user-visible | `run-text: "deckent_set_directives ile run hedeflerini yazin"` (TR) | Free-text Turkish sentence returned as the `nextAction` field in the `deckent_help` JSON response content (via `determineNextAction()`). This is genuinely user-facing prose (not a schema field), just hardcoded Turkish instead of routed through i18n — flag separately: per project i18n-FIRST rule this hardcoded TR string is itself a pre-existing debt item, independent of the sprint→run rename. Safe to reword directly; no external client depends on the literal Turkish sentence content. |
| src/mcp/tools/help.ts:164 | `return 'deckent_retro ile son sprint\'i okuyun veya yeni DIRECTIVES yazin';` | user-visible | `run-text: "deckent_retro ile son run'u okuyun veya yeni DIRECTIVES yazin"` (TR) | Same `nextAction` free-text field. Safe to reword directly. |
| src/mcp/tools/help.ts:166 | `return 'deckent_plan ile ilk sprint\'i planlayın';` | user-visible | `run-text: "deckent_plan ile ilk run'u planlayın"` (TR) | Same `nextAction` free-text field. Safe to reword directly. |
| src/mcp/tools/help.ts:174-178 | `description: 'Get runtime capabilities, current project state, and a recommended next action. ' + 'Returns version, initialization state, sprint status, agent/skill counts, routing engine, ' + 'available workflows, and a full tool + resource catalog. ' + 'Use this when you are unsure what to do next or want to understand Deckent capabilities.'` | user-visible | `run-text: "...Returns version, initialization state, run status, agent/skill counts, routing engine, available workflows, and a full tool + resource catalog...."` | Tool `description` prose for `deckent_help` itself. Safe to change directly. |
| src/mcp/tools/help.ts:196-197 | `workflows: { sprint: ['init', 'set_directives', 'plan', 'start', 'status', 'review', 'cleanup'], ... }` | user-visible (mixed) | key name `sprint` → consider `run` **as a JSON response field/key**; array *values* are workflow step names (already run-agnostic) | This is a JSON object KEY (`workflows.sprint`) returned in response content, not free prose — but unlike `sprintId`, this key is NOT on the frozen-exclusion list (only the literal identifier `sprintId` is frozen). Flag as a structural field-name that would need a deprecation/alias note if renamed: an external MCP client parsing `help` response `workflows.sprint` would break silently if the key vanished. **Recommend**: add `workflows.run` as new key, keep `workflows.sprint` as a deprecated alias for at least one release, per API-parity practice — do not hard-cut. |
| src/mcp/tools/help.ts:28-29,150 | `interface HelpState { ...; sprintActive: boolean; lastSprint: string \| null; ... }` returned inside `state:` field of the JSON response | user-visible (mixed — field names) | `sprintActive`/`lastSprint` → candidates for `runActive`/`lastRun` field rename | These are JSON response field names (not `sprintId` itself, so NOT covered by the frozen-exclusion list) surfaced directly in the `deckent_help` response body (`state.sprintActive`, `state.lastSprint`). An external MCP client could depend on these field names structurally. **Recommend**: same alias/deprecation treatment as `workflows.sprint` above — add new field, keep old as deprecated alias, do not hard-cut. |
| src/mcp/tools/help.ts:39-46 (interface HelpResponse.workflows.sprint type decl), 155,163 (`state.hasDirectives`/`state.sprintActive`/`state.lastSprint` internal checks), 59-151 (`detectState()` internal locals: `sprintActive`, `lastSprint`, `jobFiles[0].sprintId` JSON read, `cfg.last_sprint_id` config field read) | internal | n/a — exempt (mostly) | `HelpState`/`HelpResponse` are TS interface/type declarations — exempt. Note: `cfg.last_sprint_id` (config file field, snake_case) and `latest.sprintId` (job-file field) are read-only internal parsing, not response prose — exempt. (`sprintActive`/`lastSprint` themselves are counted as user-visible above since they are OUTPUT field names in the tool's own response, distinct from these internal read-side usages.) |

---

### src/mcp/server.ts — 26 total "sprint" grep hits, 15 user-visible (1 block), 11 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/server.ts:18-113 | Entire `DECKENT_MCP_INSTRUCTIONS` template-literal block (server-level `instructions` field passed to `new McpServer(...)`), containing 15 distinct "sprint" occurrences: line 19 `"runs multi-agent sprints inside your project"`; line 24 `"## Sprint Lifecycle"`; line 29 `"Write sprint goals and task definitions"`; line 31 `"begin sprint execution"`; line 32 `"Show live sprint progress"`; line 34 `"learnings from the last sprint"`; line 35 `"Show sprint history..."`; line 40 `"without a full sprint"`; line 41 `"Kill a running sprint..."`; line 42 `"...after a sprint"`; line 47 `"Sprint lifecycle document management"`; line 48 `"Explain sprint history..."`; line 49 `"(ADR, sprint, debt, pattern)"`; line 50 `"live sprint event stream"`; line 58 `"Run Brain Self-Audit Gate for a sprint"`; line 59 `"Recover a crashed or stuck sprint"`; line 63 `"...sprint task breakdown..."`; line 74 `"KPI scorecard for a sprint"`; line 79 `"Brain memory (...) — sprint learnings"`; line 82 `"Last sprint retrospective..."`; line 88 `"# DIRECTIVES — Sprint NNN: Title"`; line 111 `"Sprint stuck → deckent_kill → ..."` | user-visible | `run-text:` — full reworded block, e.g.: `"Deckent is an AI agent orchestration CLI that runs multi-agent runs inside your project."` / `"## Run Lifecycle"` / `"Write run goals and task definitions to DIRECTIVES.md"` / `"Spawn workers and begin run execution..."` / `"Show live run progress, agent activity, and alerts"` / `"Read the retrospective and learnings from the last run"` / `"Show run history with agent/skill performance stats"` / `"Run a single task directly without a full run"` / `"Kill a running run or specific worker agent"` / `"Archive task files and release all locks after a run"` / `"Run lifecycle document management (add/remove/list)"` / `"Explain run history and results"` / `"Search project memory across all sources (ADR, run, debt, pattern)"` / `"Subscribe to live run event stream via MCP logging notifications (backfill + push)"` / `"Run Brain Self-Audit Gate for a run (tsc, vitest, honesty checks)"` / `"Recover a crashed or stuck run..."` / `"...run task breakdown + cache-gate"` / `"Show the KPI scorecard for a run..."` / `"Brain memory (...) — run learnings"` / `"Last run retrospective..."` / `"# DIRECTIVES — Run NNN: Title"` / `"Run stuck → deckent_kill → deckent_cleanup → deckent_doctor"` | This is the **top-level MCP server `instructions` string** — the single most prominent user-visible surface in the whole server (shown once at connection time to every client/LLM as the canonical usage guide, functionally equivalent to `--help` output). Pure prose throughout — safe to reword directly. NOTE: this block is guarded by `scripts/lint-mcp-instructions.mjs` per the comment at server.ts:61-62 ("independently guarded against registration by scripts/lint-mcp-instructions.mjs") — the rename PR must also check/update that lint script's expectations (e.g. tool-name lists it may cross-check) so CI doesn't fail after the wording change. Also note this block duplicates content that already exists per-tool in each tool's own `description` (start.ts, status.ts, etc.) — the rename must be applied consistently across both to avoid drift. |
| src/mcp/server.ts:1-17,116-193 | (imports, `initializeNotifyDispatcher` JSDoc comment "sprint-controller, sprint-finalizer, result-evaluator", `mcpNotifyAdapter`, `createServer()`, `main()`) | internal | n/a — exempt | Code comments (JSDoc) and internal module references — exempt per rule (comments skipped entirely; module names like `sprint-finalizer` are internal). |

---

### src/mcp/tools/nervous.ts — 23 total "sprint" grep hits, 4 user-visible, 19 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/nervous.ts:389-392 | `description: 'Subscribe to Nervous System notifications for the current sprint. Registers this MCP client for push notifications. Also surfaces currently pending PanicGuard kill approvals as PANIC_GUARD_KILL_PENDING events (Sprint 180 W4-2).'` | user-visible | `run-text: "Subscribe to Nervous System notifications for the current run. Registers this MCP client for push notifications. Also surfaces currently pending PanicGuard kill approvals as PANIC_GUARD_KILL_PENDING events."` | Tool `description` prose for `deckent_nervous_subscribe`. Drop internal "(Sprint 180 W4-2)" changelog citation. Safe to change directly. |
| src/mcp/tools/nervous.ts:395 | `sprintId: z.string().optional().describe('Sprint ID to subscribe to (default: active sprint)')` | user-visible (describe prose only) | `run-text: "Run ID to subscribe to (default: active run)"` | Property name `sprintId` frozen/exempt; only the `describe()` prose text changes. Safe to change directly. |
| src/mcp/tools/nervous.ts:420 | `` message: `Subscribed to Nervous System notifications${sprintId ? ` for ${sprintId}` : ''}` `` | user-visible | `run-text: "Subscribed to Nervous System notifications${sprintId ? \` for ${sprintId}\` : ''}"` (wording itself has no "sprint" text needing change beyond context — variable substitution only) | Free-text `message` field in JSON response content. No literal "sprint" word in the visible sentence itself (the word only appears via the interpolated `${sprintId}` variable value, e.g. "for sprint-042") — flagged because the interpolated VALUE could read "for sprint-042" to the LLM; no code text change needed here beyond what start/other files already do for the `sprintId` value format itself (out of this file's control). No action needed on this line's literal text. |
| src/mcp/tools/nervous.ts:434-437 | `description: 'Accept a pending Nervous System notification/action. The action will be executed by the Executor. Sprint 180 W4-2: id="panic:<taskId>" approves a PanicGuard-blocked kill.'` | user-visible | `run-text: "Accept a pending Nervous System notification/action. The action will be executed by the Executor. id=\"panic:<taskId>\" approves a PanicGuard-blocked kill."` | Tool `description` prose for `deckent_nervous_accept`. Drop internal "Sprint 180 W4-2" changelog citation entirely (not even a rename target — pure internal task-tracking noise). Safe to change directly. |
| src/mcp/tools/nervous.ts:4,68,228-229,241-354,404-412,452,479 (+more) | `(code comments: "ADR-022-v2 CLI/MCP parity. Sprint 147 Task 16.", "Sprint 180 W2-2 (Task 5)", "Sprint 180 W4-2" scattered in comments; `sprintId` payload field reads in `reverseOrphanTaskArchive`/`computeCompensatingAction`; `ARCHIVE_SPRINTS_SUBDIR` constant; `record.payload['sprintId']` accesses; ExecutionRecord.sprintId filter on line 411)` | internal | n/a — exempt | Frozen per exclusion list — code comments (skip), `sprintId` identifier (frozen), internal constant names (`ARCHIVE_SPRINTS_SUBDIR`). Note the `detail:` strings at lines 271, 281, 291, 316, 325-326 (e.g. `"No archive directory found at ${archiveDir}..."`) do NOT contain the literal word "sprint" (they say "archive directory"), so they are not part of this grep-hit inventory even though they're response prose — correctly excluded since they weren't grep hits. |

---

### src/mcp/tools/catalog-parity.ts — 21 total "sprint" grep hits, 1 user-visible, 20 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/catalog-parity.ts:51-55 | `description: 'Manage the agent pool: add a custom agent, remove one, or promote a temp agent (generated for a sprint under .tasks/agents/) into the persistent pool at .deckent/agents/temp-{id}/. Uses the existing AgentPoolManager API — no new agent lifecycle concept. See also deckent_agent_list (read-only listing).'` | user-visible | `run-text: "Manage the agent pool: add a custom agent, remove one, or promote a temp agent (generated for a run under .tasks/agents/) into the persistent pool at .deckent/agents/temp-{id}/. Uses the existing AgentPoolManager API — no new agent lifecycle concept. See also deckent_agent_list (read-only listing)."` | Tool `description` prose for `deckent_agent_manage`. Safe to change directly. |
| src/mcp/tools/catalog-parity.ts:236 | `type: z.string().optional().describe('Entry type: adr|memory|sprint|debt|pattern|retro|... (required for insert)')` | user-visible (mixed) | Keep the enum-value token `sprint` as-is (it documents a real, still-frozen DB `type` value used by MemoryStore — e.g. `store.insert({ type: 'sprint', ... })`), reword only if/when that underlying DB type enum itself is renamed (out of this task's scope) | This lists literal accepted values for the `type` field, one of which is the string `"sprint"` itself (a DB schema enum value, not prose describing "a sprint"). Do **not** rename this occurrence as part of the UI-text rename — it's a data/schema value contract. Flag for the parent effort: confirm whether `type: 'sprint'` DB rows are in scope for the broader "sprint"→"run" migration; if so it needs its own dedicated task (schema/data migration, not string literal rename). |
| src/mcp/tools/catalog-parity.ts:6,53(dup, already covered),206-219,243-244,249-250,256-257,277,306-311 | `(code comment "Sprint 359 Task 359-011"; resolveDecayAfterSprints() function name/params; sprint_id/sprint_num/current_sprint_num/decay_after_sprints schema property names + describe() prose "Sprint id association (insert only)" / "Sprint number association (insert only)" / "Required for action=decay-trigger" / "Retention window in sprints..."; decayAfterSprints response field)` | internal (identifiers) — **see note** | n/a for identifiers | These property names (`sprint_id`, `sprint_num`, `current_sprint_num`, `decay_after_sprints`) are distinct identifiers from the frozen `sprintId` — NOT literally on the exclusion list, but per the classification rule ("JSON schema PROPERTY NAME" = internal) they are still schema property names, so classified internal here. **However their attached `describe()` PROSE is user-visible** — flagged separately below since it was missed in the strict per-rule re-check. |
| src/mcp/tools/catalog-parity.ts:243 | `sprint_id: z.string().optional().describe('Sprint id association (insert only)')` | user-visible (describe prose; property name `sprint_id` is internal/not frozen but excluded from rename per this task's scope note below) | `run-text: "Run id association (insert only)"` | Property name `sprint_id` is a DB-schema field (MemoryStore's `sprint_id` column) — renaming the property itself is a schema-migration question outside this string-literal task; only reword the description prose. If `sprint_id` (the property) is ever renamed, this is a structural input-schema field an external client could depend on — needs alias/deprecation. |
| src/mcp/tools/catalog-parity.ts:244 | `sprint_num: z.number().optional().describe('Sprint number association (insert only)')` | user-visible (describe prose) | `run-text: "Run number association (insert only)"` | Same as above — property name is a DB column (`sprint_num`), prose-only change here. |
| src/mcp/tools/catalog-parity.ts:249 | `current_sprint_num: z.number().optional().describe('Required for action=decay-trigger')` | internal — no "sprint" word in the describe text itself; only the property name contains it | n/a | Property name only; describe() text has no "sprint" substring. No prose to reword. |
| src/mcp/tools/catalog-parity.ts:250 | `decay_after_sprints: z.number().optional().describe('Retention window in sprints (action=decay-trigger; default: config decay_after_sprints or 8)')` | user-visible (describe prose; property name internal) | `run-text: "Retention window in runs (action=decay-trigger; default: config decay_after_sprints or 8)"` | Property/config-key name `decay_after_sprints` stays untouched (real config key, `.deckent/config.json` field) — only reword "in sprints" → "in runs" in the prose; the parenthetical mention of the literal config key `decay_after_sprints` must stay as-is since it names a real, still-existing config field. |

---

### src/mcp/tools/kpi.ts — 20 total "sprint" grep hits, 5 user-visible, 15 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/kpi.ts:112-116 | `description: 'Show the KPI scorecard for a sprint (default) or trend series for a single KPI. Scorecard: returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics. Trend (when trend arg set): returns { kpiId, series: [{periodKey, value, status}] }. Delegates to KpiService (SSOT); read-only.'` | user-visible | `run-text: "Show the KPI scorecard for a run (default) or trend series for a single KPI. Scorecard: returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics. Trend (when trend arg set): returns { kpiId, series: [{periodKey, value, status}] }. Delegates to KpiService (SSOT); read-only."` | Tool `description` prose. The `{ sprintId, kpis }` mention documents the real (frozen) response field name — leave that literal mention untouched, only reword "for a sprint" → "for a run". |
| src/mcp/tools/kpi.ts:123-125 | `sprint: z.string().optional().describe('Sprint ID (e.g. "sprint-330") — defaults to the current active sprint (scorecard mode only)')` | user-visible (mixed — property name + prose) | property: consider `run` (see note) / prose: `run-text: "Run ID (e.g. \"sprint-330\") — defaults to the current active run (scorecard mode only)"` | **Important divergence from `sprintId`:** this tool's input property is literally named `sprint` (not `sprintId`) — it is NOT on the frozen/exempt identifier list (only the exact literal `sprintId` is frozen). Per the task's own classification rules a schema property name is "internal," but since it's not the specifically-frozen `sprintId`, the parent rename effort should explicitly decide whether `sprint` (this param) is in-scope for renaming to `run` — flag this as a decision point rather than auto-batching it away. If renamed, this is an external-client-facing INPUT parameter name → needs an alias (accept both `sprint` and `run`) for backward compatibility. The describe() prose changes regardless. |
| src/mcp/tools/kpi.ts:129-131 | `trend: z.string().optional().describe('KPI ID to fetch trend for (e.g. "cost_per_sprint") — activates trend mode')` | user-visible (mixed) | Keep `"cost_per_sprint"` example value as-is (real KPI id in KpiService), reword only if that underlying KPI id itself is renamed | The example KPI id `"cost_per_sprint"` is a literal, real identifier value used by `KpiService.getTrend()` — a data value, not prose describing "a sprint" generically. Do not rename as part of this UI-text pass; flag for the parent effort as a possible separate KPI-id rename (larger scope, touches KpiService + DB rows). |
| src/mcp/tools/kpi.ts:132-134 | `n: z.number().int().positive().optional().describe('Number of sprint periods to return in trend mode — defaults to 10')` | user-visible | `run-text: "Number of run periods to return in trend mode — defaults to 10"` | `describe()` prose on the `n` parameter. Safe to reword directly. |
| src/mcp/tools/kpi.ts:2,4,10-11,26,33-34,106,171,185,193 | `(file header comment "deckent_kpi MCP tool — Sprint KPI scorecard + trend (KPI Faz-2, Sprint 331-332)"; getCurrentSprintId import; KpiToolDeps.sprintFn; resolveSprint local; sprintId local var + response field; service.listSprintViews(sprintId) call)` | internal | n/a — exempt | Code comments (skip); `sprintId` identifier (frozen) used as the internal variable/response-field name once `sprint` input is resolved; `sprintFn` deps-injection param name (internal test-seam). |

---

### src/mcp/tools/checkpoint.ts — 19 total "sprint" grep hits, 8 user-visible, 11 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/checkpoint.ts:59 | `` return { success: false, message: `Checkpoint not found: ${sprintId}/${phase}` }; `` | user-visible | `run-text: "Checkpoint not found: ${sprintId}/${phase}"` (no literal word "sprint" in the visible text — only the interpolated ID value) | The word "sprint" only appears via the interpolated `${sprintId}` value (e.g. "sprint-089/plan"), not as literal prose in this string. No text rewrite needed on this line itself; the visible label depends on the `sprintId` value format, which is controlled elsewhere/frozen. No action. |
| src/mcp/tools/checkpoint.ts:65 | `` return { success: false, message: `Checkpoint already ${checkpoint.status}: ${sprintId}/${phase}` }; `` | user-visible | Same as above — no literal "sprint" word in the message template itself | Same reasoning as line 59 — flagged by grep only due to the `sprintId` identifier substring in the template expression, not user-visible prose text. No action needed on this line's literal text. |
| src/mcp/tools/checkpoint.ts:69 | `` return { success: true, message: `Checkpoint ${sprintId}/${phase} ${status}.` }; `` | user-visible | Same — no literal "sprint" word in the message text | Same reasoning. No action needed. |
| src/mcp/tools/checkpoint.ts:82 | `description: 'List, approve, or reject human checkpoints in sprint lifecycle. Checkpoints pause sprint execution at configured phases (plan/evaluate/fix) until a human approves or rejects. Use action=list to see pending checkpoints, action=approve/reject with sprintId and phase to respond.'` | user-visible | `run-text: "List, approve, or reject human checkpoints in run lifecycle. Checkpoints pause run execution at configured phases (plan/evaluate/fix) until a human approves or rejects. Use action=list to see pending checkpoints, action=approve/reject with sprintId and phase to respond."` | Tool `description` prose. `sprintId` mentioned as a real parameter-name reference at the end — leave that literal parameter-name mention as-is (frozen), only reword the "sprint lifecycle" / "sprint execution" prose. |
| src/mcp/tools/checkpoint.ts:86 | `sprintId: z.string().optional().describe('Sprint ID (e.g. "sprint-089"). Required for approve/reject actions.')` | user-visible (describe prose; property frozen) | `run-text: "Run ID (e.g. \"sprint-089\"). Required for approve/reject actions."` | Property name `sprintId` frozen. Example value `"sprint-089"` documents the real accepted ID format used across the checkpoint-file naming convention (`checkpoint-${sprintId}-${phase}.json`) — keep the example literal as-is, only reword the leading label "Sprint ID" → "Run ID". |
| src/mcp/tools/checkpoint.ts:110 | `message: 'sprintId and phase are required for approve/reject actions.'` | user-visible (mixed — no literal "sprint" word, only the `sprintId` identifier name inside prose) | No rewrite needed for the word "sprint" itself; if `sprintId` param is ever renamed this sentence must be updated to match, but per this task's frozen-exclusion rule `sprintId` stays as-is | This message references the exempt/frozen parameter name `sprintId` by name inside an error sentence — since the identifier itself is frozen, the sentence correctly keeps saying "sprintId" and needs no change. |
| src/mcp/tools/checkpoint.ts:1-149 (title) | `title: 'Checkpoint Management'` | internal — no "sprint" hit on this line | n/a | Not a grep hit; included for completeness only (no "sprint" text present). |
| src/mcp/tools/checkpoint.ts:6,23-56,91,108,115,119,128-134 | `(validateSprintId import/calls; listCheckpoints()/updateCheckpointStatus() function bodies using sprintId param + `sprintId` response-array field; `checkpoint-${sprintId}-${phase}.json` filename construction; enrichResponse('checkpoint', { ..., sprintId, ... }) response field)` | internal | n/a — exempt | Frozen per exclusion list — `sprintId` identifier (function param, response field, and filename-template segment) and the `validateSprintId` function name. |

---

### src/mcp/tools/index.ts — 18 total "sprint" grep hits, 16 user-visible, 2 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/index.ts:66 | `{ name: 'deckent_set_directives', description: 'Write or update DIRECTIVES.md with sprint goals and task definitions', readOnly: false }` | user-visible | `run-text: "Write or update DIRECTIVES.md with run goals and task definitions"` | `TOOL_CATALOG` entry `description` — this is the canonical SSOT returned inside `deckent_help`'s `tools` array response content. Pure prose — safe to change directly. |
| src/mcp/tools/index.ts:67 | `{ name: 'deckent_plan', description: 'Plan the next sprint — creates task JSON files in .tasks/', readOnly: false }` | user-visible | `run-text: "Plan the next run — creates task JSON files in .tasks/"` | Same TOOL_CATALOG SSOT description. Safe to change directly. |
| src/mcp/tools/index.ts:68 | `{ name: 'deckent_start', description: 'Start the sprint — spawns workers and begins execution', readOnly: false }` | user-visible | `run-text: "Start the run — spawns workers and begins execution"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:69 | `{ name: 'deckent_status', description: 'Get the current sprint dashboard: agents, progress, usage, alerts', readOnly: true }` | user-visible | `run-text: "Get the current run dashboard: agents, progress, usage, alerts"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:71 | `{ name: 'deckent_retro', description: 'Read the latest sprint retrospective (RETRO.md)', readOnly: true }` | user-visible | `run-text: "Read the latest run retrospective (RETRO.md)"` | Same. Note "(RETRO.md)" here is stale/inconsistent with the actual DB-backed retro storage mentioned in retro.ts's own description — a pre-existing separate inaccuracy, not part of this rename, but worth flagging to the parent effort. Safe to change directly. |
| src/mcp/tools/index.ts:72 | `{ name: 'deckent_history', description: 'Browse sprint history and outcomes across all past sprints', readOnly: true }` | user-visible | `run-text: "Browse run history and outcomes across all past runs"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:76 | `{ name: 'deckent_review', description: 'Evaluate sprint results — returns GO / NO_GO / GO_WITH_TECH_DEBT', readOnly: true }` | user-visible | `run-text: "Evaluate run results — returns GO / NO_GO / GO_WITH_TECH_DEBT"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:77 | `{ name: 'deckent_run', description: 'Run a single task directly without a full sprint', readOnly: false }` | user-visible | `run-text: "Run a single task directly without a full run"` | Same. Note the tool is itself named `deckent_run` (already "run"-branded) — the description wording is the only thing to change; tool name unaffected. Safe to change directly. |
| src/mcp/tools/index.ts:79 | `{ name: 'deckent_cleanup', description: 'Archive task files and release locks after sprint completes', readOnly: false }` | user-visible | `run-text: "Archive task files and release locks after run completes"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:83 | `{ name: 'deckent_checkpoint', description: 'Approve or reject a checkpoint gate during sprint execution', readOnly: false }` | user-visible | `run-text: "Approve or reject a checkpoint gate during run execution"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:84 | `{ name: 'deckent_docs', description: 'Sprint lifecycle document management (add/remove/list)', readOnly: false }` | user-visible | `run-text: "Run lifecycle document management (add/remove/list)"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:85 | `{ name: 'deckent_explain', description: 'Explain sprint history and results in natural language', readOnly: true }` | user-visible | `run-text: "Explain run history and results in natural language"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:86 | `{ name: 'deckent_memory_query', description: 'Search project memory across all sources (ADR, sprint, debt, pattern)', readOnly: true }` | user-visible | `run-text: "Search project memory across all sources (ADR, run, debt, pattern)"` | Same. Note this "sprint" is used as a DB entry-type keyword shorthand inside a parenthetical list — reword prose while being aware the underlying `type='sprint'` DB rows are unaffected (see catalog-parity.ts:236 note above). Safe to change directly as prose. |
| src/mcp/tools/index.ts:87 | `{ name: 'deckent_watch', description: 'Subscribe to the live sprint event stream via MCP logging notifications (backfill + push)', readOnly: true }` | user-visible | `run-text: "Subscribe to the live run event stream via MCP logging notifications (backfill + push)"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:95 | `{ name: 'deckent_audit', description: 'Run the Brain Self-Audit Gate for a sprint (tsc, vitest, honesty checks)', readOnly: true }` | user-visible | `run-text: "Run the Brain Self-Audit Gate for a run (tsc, vitest, honesty checks)"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:96 | `{ name: 'deckent_recover', description: 'Recover a crashed or stuck sprint (clean orphan IPC dirs, stale locks, archive tasks)', readOnly: false }` | user-visible | `run-text: "Recover a crashed or stuck run (clean orphan IPC dirs, stale locks, archive tasks)"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:100 | `{ name: 'deckent_usage', description: 'Show token/limit consumption from Claude Code transcripts (model table or sprint task breakdown + cache-gate)', readOnly: true }` | user-visible | `run-text: "Show token/limit consumption from Claude Code transcripts (model table or run task breakdown + cache-gate)"` | Same. Safe to change directly. |
| src/mcp/tools/index.ts:101 | `{ name: 'deckent_kpi', description: 'Show the KPI scorecard for a sprint — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics', readOnly: true }` | user-visible | `run-text: "Show the KPI scorecard for a run — returns { sprintId, kpis } with cost, token, cache, retry, completion, and quality metrics"` | Same. The `{ sprintId, kpis }` field-name mention stays as-is (documents the real frozen field). Safe to change the surrounding prose directly. |
| src/mcp/tools/index.ts:45-48 (`McpToolCatalogEntry` interface),52-64 (JSDoc for `TOOL_CATALOG` const, mentions "B-MCPCATALOG-SSOT", byte-for-byte alignment invariant with `registerTools`) | `(no literal "sprint" substring on these specific lines — surrounding structural/JSDoc context only)` | internal | n/a | Included for completeness of the TOOL_CATALOG block context; not actual "sprint" grep hits themselves. |

Note: index.ts's 18 grep hits map 1:1 to the 16 `description:` rows above (all pure prose, all safe direct-edits) plus what amounts to essentially zero pure-internal hits in this file — this file is almost entirely the human-readable TOOL_CATALOG SSOT.

---

### src/mcp/tools/plan.ts — 17 total "sprint" grep hits, 4 user-visible, 13 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/plan.ts:44 | `title: 'Plan Sprint'` | user-visible | `run-text: "Plan Run"` | Tool `title` metadata. Safe to change directly. |
| src/mcp/tools/plan.ts:45 | `description: 'Preview a sprint plan based on current DIRECTIVES.md. Reads DIRECTIVES.md, analyzes task blocks, and returns a proposed task list with model assignments, wave breakdown, and risk assessment — without executing anything. Use this to validate your directives before running deckent_start. Prerequisite: deckent_init + deckent_set_directives must have been run.'` | user-visible | `run-text: "Preview a run plan based on current DIRECTIVES.md. Reads DIRECTIVES.md, analyzes task blocks, and returns a proposed task list with model assignments, wave breakdown, and risk assessment — without executing anything. Use this to validate your directives before running deckent_start. Prerequisite: deckent_init + deckent_set_directives must have been run."` | Tool `description` prose for `deckent_plan`. Safe to change directly. |
| src/mcp/tools/plan.ts:131-133 | `` summary += ` ⚠ Prompt gate: ${promptGate.blockerCount} blocking finding(s) — ` + '\`deckent start\` will halt at PLAN unless re-run with acknowledgePromptGate=true ' + '(CLI: --force-prompt-gate).'; `` | internal — no literal "sprint" word on these lines | n/a | Not actually a "sprint" grep hit (no substring match) — included only because it's adjacent to line 145's error message; verify: correct, no "sprint" text here. No action. |
| src/mcp/tools/plan.ts:145 | `` text: JSON.stringify({ error: true, message: \`Failed to plan sprint: ${message}\` }) `` | user-visible | `run-text: "Failed to plan run: ${message}"` | Free-text error message in catch-all response content. Safe to change directly. |
| src/mcp/tools/plan.ts:8,67,77,81,83,90-125 passim (SprintSizeRecommendation type import, `sprint = preview.sprint` local var, `sprint.id`/`sprint.number`/`sprint.tasks`/`sprint.promptGate`/`sprint.reasoning`/`sprint.planningMode` property reads, `sprintId: sprint.id` / `sprintNumber: sprint.number` response fields) | internal | n/a — exempt | `SprintSizeRecommendation` type name (exempt); `sprintId`/`sprintNumber` response field names — `sprintId` is frozen; `sprintNumber` is not literally `sprintId` but is a schema-adjacent JSON response field name (structural, not prose) — classified internal per the "JSON field name, not shown as prose" rule. Flag `sprintNumber` (like `sprintNumber` in explain.ts, kpi's `sprint` param, help.ts's `sprintActive`/`lastSprint`) as a naming decision point for the parent rename effort since it is NOT on the explicit frozen list, only `sprintId` is. |

---

### src/mcp/tools/audit.ts — 17 total "sprint" grep hits, 6 user-visible, 11 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/audit.ts:31 | `title: 'Sprint Audit'` | user-visible | `run-text: "Run Audit"` | Tool `title` metadata. Safe to change directly. |
| src/mcp/tools/audit.ts:32 | `description: 'Sprint audit multitool, mirrors the \`deckent audit\` CLI (ADR-022 parity). action="gate" (default): run the Brain Self-Audit Gate for a sprint — checks tsc, vitest, honesty violations, and observability; returns PASS or GATE_FAILURE and writes .deckent/{sprintId}-gate.json. action="query": ... action="retention": ... it archives the planned partition and permanently deletes pruned events from the sprint event stream. ...'` | user-visible | `run-text: "Run audit multitool, mirrors the \`deckent audit\` CLI (ADR-022 parity). action=\"gate\" (default): run the Brain Self-Audit Gate for a run — checks tsc, vitest, honesty violations, and observability; returns PASS or GATE_FAILURE and writes .deckent/{sprintId}-gate.json. action=\"query\": filter audit-log events by channel/tenant with an optional result limit. action=\"compliance\": build a compliance report (audit-chain integrity, RBAC, tenant isolation) over the retained audit trail. action=\"retention\": plan audit-log retention via keepDays/keepCount — dry-run by default (ZERO writes); apply=true is DESTRUCTIVE: it archives the planned partition and permanently deletes pruned events from the run event stream. The CLI \"forward\" subcommand (SIEM export) is intentionally not exposed over MCP because it requires network egress."` | Tool `description` prose for `deckent_audit`. The `.deckent/{sprintId}-gate.json` filename-pattern mention stays as-is (documents the real on-disk filename convention using the frozen `sprintId`). Safe to reword the surrounding prose directly. |
| src/mcp/tools/audit.ts:35 | `sprintId: z.string().optional().describe('Sprint ID (e.g. "sprint-150"). Required for action="gate"; defaults to "sprint-001" for query/compliance/retention (CLI --sprint parity).')` | user-visible (describe prose; property frozen) | `run-text: "Run ID (e.g. \"sprint-150\"). Required for action=\"gate\"; defaults to \"sprint-001\" for query/compliance/retention (CLI --sprint parity)."` | Property `sprintId` frozen. Example values `"sprint-150"`/`"sprint-001"` document the real accepted ID/default format — keep as-is. Note "(CLI --sprint parity)" references the actual CLI flag name `--sprint` (not literal prose "a sprint") — leave that flag-name reference untouched unless the CLI flag itself is renamed in a separate task. |
| src/mcp/tools/audit.ts:15 | `const DEFAULT_SPRINT = 'sprint-001'; // CLI --sprint default (cli/commands/audit.ts)` | internal (value/comment) | n/a | The identifier `DEFAULT_SPRINT` and its value `'sprint-001'` are an internal default-ID constant (data value mirroring a real CLI default), plus a trailing code comment — both exempt (comments skipped; constant is not a prose string returned to the user, it's a fallback ID value). |
| src/mcp/tools/audit.ts:53 | `` return errorResult(\`Unknown action "${String(action)}". Valid actions: ${AUDIT_ACTIONS.join(', ')}.\`); `` | internal — no literal "sprint" word on this line | n/a | Not actually a "sprint" grep hit; included for completeness only. No action. |
| src/mcp/tools/audit.ts:105 | `return errorResult('sprintId is required for action "gate" (e.g. "sprint-150").');` | user-visible (mixed) | `run-text: "sprintId is required for action \"gate\" (e.g. \"sprint-150\")."` (no wording change needed beyond keeping the frozen identifier name + example) | Error message referencing the frozen `sprintId` parameter name by its literal identifier — correctly stays "sprintId" (frozen), and the example value `"sprint-150"` stays as-is. No rename action needed on this line beyond what's already frozen. |
| src/mcp/tools/audit.ts:6,10,45,49,57,61,71,77,98,104,108,113,116-127 | `(runSelfAuditGate import from sprint-finalizer.js; `sprint = sprintId ?? DEFAULT_SPRINT` local var; `queryAudit(root, sprint, ...)` / `runComplianceReport(root, sprint, ...)` / `runAuditRetention(root, sprint, ...)` calls; `result.sprintId` / `sprintId: sprint` / `sprintId: result.sprintId` response fields; `${sprintId}-gate.json` filename construction)` | internal | n/a — exempt | Frozen per exclusion list — `sprintId` identifier (var, param, response field) and internal module import path (`sprint-finalizer.js`). |

---

### src/mcp/tools/retro.ts — 16 total "sprint" grep hits, 4 user-visible, 12 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/retro.ts:51 | `title: 'Sprint Retrospective'` | user-visible | `run-text: "Run Retrospective"` | Tool `title` metadata. Safe to change directly. |
| src/mcp/tools/retro.ts:52 | `description: 'Read a sprint retrospective from the Memory V2 DB (.brain/memory.db \`retro\` entries). Returns: full retrospective content (sprint ID, task outcomes, GO/NO_GO decisions, learnings, agent performance notes), plus up to 5 extracted highlights (bullet points). Use after a sprint completes to understand what went well, what failed, and what tech debt was created. Every sprint keeps its own retro entry — pass sprintId for an older one.'` | user-visible | `run-text: "Read a run retrospective from the Memory V2 DB (.brain/memory.db \`retro\` entries). Returns: full retrospective content (run ID, task outcomes, GO/NO_GO decisions, learnings, agent performance notes), plus up to 5 extracted highlights (bullet points). Use after a run completes to understand what went well, what failed, and what tech debt was created. Every run keeps its own retro entry — pass sprintId for an older one."` | Tool `description` prose for `deckent_retro`. `sprintId` parameter-name mention at the end stays frozen/as-is. Safe to reword the rest directly. |
| src/mcp/tools/retro.ts:55 | `sprintId: z.string().optional().describe('Read a specific sprint retrospective by sprint ID (e.g. "sprint-083"). If omitted, returns the most recent sprint retrospective.')` | user-visible (describe prose; property frozen) | `run-text: "Read a specific run retrospective by run ID (e.g. \"sprint-083\"). If omitted, returns the most recent run retrospective."` | Property `sprintId` frozen. Example `"sprint-083"` documents the real ID format (still uses the `sprint-NNN` DB-id convention internally) — keep as-is, reword only the surrounding sentence. |
| src/mcp/tools/retro.ts:65 | `` message: \`No retrospective found for sprint: ${sprintId}\` `` | user-visible | `run-text: "No retrospective found for run: ${sprintId}"` | Free-text error/empty-state `message` field in JSON response content — the label "sprint:" here IS literal prose (mixed-formatting case per task instructions), rename to "run:". The `${sprintId}` value interpolation stays untouched. Safe to change directly. |
| src/mcp/tools/retro.ts:86 | `` text: JSON.stringify({ error: true, message: \`Failed to read retrospective: ${message}\` }) `` | internal — no literal "sprint" word on this line | n/a | Not actually a "sprint" grep hit; included only for completeness (this specific error message doesn't say "sprint"). No action. |
| src/mcp/tools/retro.ts:23,27,33-41,58-61,64,75 | `(JSDoc comment "Read a sprint retrospective..."; readRetro() function's `sprintId` param + `retro-${normalizedId}` / `retro-sprint-${...}` DB-id construction via `sprintId.startsWith('sprint-')` check; `latest?.sprint_id` DB column read; `sprintId: resolvedId` response field)` | internal | n/a — exempt | Frozen per exclusion list — `sprintId` identifier throughout (param, response field), DB column `sprint_id`, and the JSDoc comment (skip). Note the internal string-literal check `sprintId.startsWith('sprint-')` and the DB-id-prefix construction `` `retro-${normalizedId}` `` are data/ID-format logic (not UI text) — exempt as internal ID-normalization logic, though flag for the parent effort: the retro DB's own ID convention (`retro-sprint-NNN`) is a deeper structural rename that is explicitly out of scope here (matches the exclusion note re: `sprintId`/DB schema). |

---

### src/mcp/tools/watch.ts — 14 total "sprint" grep hits, 5 user-visible, 9 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/watch.ts:26 | `title: 'Watch Sprint Events'` | user-visible | `run-text: "Watch Run Events"` | Tool `title` metadata. Safe to change directly. |
| src/mcp/tools/watch.ts:27-30 | `description: 'Subscribe to live sprint event stream via MCP logging notifications. Returns initial backfill of recent events and then pushes new events as they arrive. Auto-unsubscribes on client disconnect or error.'` | user-visible | `run-text: "Subscribe to live run event stream via MCP logging notifications. Returns initial backfill of recent events and then pushes new events as they arrive. Auto-unsubscribes on client disconnect or error."` | Tool `description` prose for `deckent_watch`. Safe to change directly. |
| src/mcp/tools/watch.ts:38-41 | `sprintId: z.string().optional().describe('Sprint ID to watch. Defaults to current active sprint.')` | user-visible (describe prose; property frozen) | `run-text: "Run ID to watch. Defaults to current active run."` | Property `sprintId` frozen. Prose reword only. Safe to change directly. |
| src/mcp/tools/watch.ts:87 | `text: \`Backfill interrupted after ${backfillCount} events.\`` | internal — no literal "sprint" word on this line | n/a | Not actually a "sprint" grep hit; included for completeness. No action. |
| src/mcp/tools/watch.ts:123 | `` text: \`Subscribed to sprint ${resolvedSprintId}. Backfilled ${backfillCount} recent events. Channels: ${channels?.join(', ') ?? 'all'}.\` `` | user-visible | `run-text: "Subscribed to run ${resolvedSprintId}. Backfilled ${backfillCount} recent events. Channels: ${channels?.join(', ') ?? 'all'}."` | Free-text response content (the tool's actual final text output, not JSON-wrapped). The literal word "sprint" here IS prose (mixed-formatting: "Subscribed to sprint {id}") — rename to "run". The `resolvedSprintId` variable/value stays untouched. Safe to change directly. |
| src/mcp/tools/watch.ts:2-3,8,57,59,63,77,97,109 | `(header comment "Push-based subscription to sprint event stream... Sprint 145 — Task 145-014"; getCurrentSprintId import; sprintId param; resolvedSprintId local var; \`deckent.sprint.${resolvedSprintId}\` logger namespace string ×2)` | internal | n/a — exempt | Frozen per exclusion list — `sprintId`/`resolvedSprintId` identifiers, code comments (skip). The `logger: \`deckent.sprint.${resolvedSprintId}\`` value is a structured MCP logging-notification namespace/topic string (machine-readable metadata field, analogous to a syslog facility name), not human prose — classified internal, but flag it for the parent effort's awareness: it IS visible to the MCP client as the `logger` field of every pushed notification, so a strict "external client may depend on this structurally" argument applies — recommend treating it like a schema field name (alias/deprecate rather than hard-cut) if ever renamed. |

---

### src/mcp/tools/history.ts — 13 total "sprint" grep hits, 4 user-visible, 9 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/history.ts:32 | `title: 'Sprint History'` | user-visible | `run-text: "Run History"` | Tool `title` metadata. Safe to change directly. |
| src/mcp/tools/history.ts:33 | `description: 'Read archived sprint log files from .brain/sprints/. Returns the last N sprint markdown logs sorted by sprint ID, plus a trend analysis (improving/declining/stable) based on task completion rates across sprints. Use to understand long-term project health, compare sprint performance, or review past decisions. Each sprint log contains task outcomes, model usage, and learning notes.'` | user-visible | `run-text: "Read archived run log files from .brain/sprints/. Returns the last N run markdown logs sorted by run ID, plus a trend analysis (improving/declining/stable) based on task completion rates across runs. Use to understand long-term project health, compare run performance, or review past decisions. Each run log contains task outcomes, model usage, and learning notes."` | Tool `description` prose for `deckent_history`. `.brain/sprints/` directory path stays untouched (real storage location, out of scope for this string-only rename). Safe to reword prose directly. |
| src/mcp/tools/history.ts:36 | `last: z.number().min(1).max(50).optional().default(5).describe('Number of most recent sprints to return (1-50, default: 5). Sprints are sorted by sprint ID ascending.')` | user-visible | `run-text: "Number of most recent runs to return (1-50, default: 5). Runs are sorted by sprint ID ascending."` | `describe()` prose on the `last` input parameter (this property is not `sprintId`/`sprint`-named itself — it's `last`, a count). Safe to reword directly; "sorted by sprint ID" keeps the literal internal sort-key name reference. |
| src/mcp/tools/history.ts:80 | `` text: JSON.stringify({ error: true, message: \`Failed to read sprint history: ${message}\` }) `` | user-visible | `run-text: "Failed to read run history: ${message}"` | Free-text error message in catch-all response content. Safe to change directly. |
| src/mcp/tools/history.ts:7,9-25,44,47,59,64-65 | `(collectSprintFiles import from sprint-reporter.js; detectTrend(sprints: Array<...>) function signature/param name; `sprints` response-array field + local var in the empty-data/populated branches; `sprints.map(...)` construction)` | internal | n/a — exempt | Function param name `sprints` and the JSON response field `sprints` (array of `{id, content}`) are NOT the frozen `sprintId` literal, but ARE schema/structural identifiers (parameter names, response field names) — classified internal per the "JSON field name not shown as prose" rule; the array's actual `content` values are raw file bytes from `.brain/sprints/*.md`, out of this file's string-literal scope entirely. Flag `sprints` (the field name) alongside `sprintNumber`/`sprint` (kpi.ts)/`sprintActive`/`lastSprint` (help.ts) as a batch of non-`sprintId` structural field names the parent rename effort should explicitly decide on (alias vs. hard-cut) — none of them are individually addressed by the `sprintId`-only frozen list. |

---

### src/mcp/tools/usage.ts — 12 total "sprint" grep hits, 2 user-visible, 10 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/usage.ts:120-123 | `description: 'Show token/limit consumption from Claude Code transcripts. Default: last-7-day model-level summary (calls, tokens, limit-cost, cache hit%). With sprint: per-task breakdown + cache gate report for that sprint.'` | user-visible | `run-text: "Show token/limit consumption from Claude Code transcripts. Default: last-7-day model-level summary (calls, tokens, limit-cost, cache hit%). With run: per-task breakdown + cache gate report for that run."` | Tool `description` prose for `deckent_usage`. "With sprint:" → "With run:" refers to the `sprint` input param by informal name (mixed prose usage), not the literal identifier — safe to reword directly. |
| src/mcp/tools/usage.ts:130 | `sprint: z.string().optional().describe('Sprint number (e.g. "275") — per-task breakdown mode')` | user-visible (mixed — property name + prose) | property: consider `run` (decision point, same as kpi.ts's `sprint` param — see cross-file note below) / prose: `run-text: "Run number (e.g. \"275\") — per-task breakdown mode"` | Same pattern as `kpi.ts`'s `sprint` input parameter: this is literally named `sprint` (not `sprintId`), so NOT on the frozen-exclusion list — it is a real external-client-facing INPUT property name. Flag as a cross-cutting decision point (this exact same `sprint: z.string()...` pattern appears in both `usage.ts` and `kpi.ts` — likely worth a single consistent decision across both). If renamed to `run`, needs alias support (`sprint` kept as deprecated synonym) since `sprint` is already a shipped parameter name external MCP clients may already be passing. |
| src/mcp/tools/usage.ts:6,10,17,81,87,98,100,105,135,137 | `(header JSDoc "summarizeSprint + evaluateCacheGate → limit-ledger-report sprint aggregation, Sprint 275 Task 275-003"; summarizeSprint import; `opts.sprint` param reads; `${opts.sprint}-` prefix construction for task-id filtering; `sprint, since, until` destructuring)` | internal | n/a — exempt | Code comments (skip); `summarizeSprint` imported function name (internal, from `core/limit-ledger-report.js`); `opts.sprint` internal option reads — these are the SAME `sprint` property already counted as user-visible above (the destructured local variable `sprint` mirrors the input schema property 1:1); no separate action needed beyond the row above. |

---

### src/mcp/tools/review.ts — 12 total "sprint" grep hits, 1 user-visible, 11 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/review.ts:71-72 | `title: 'Sprint Review'` and `description: 'Review sprint task results and make GO/NO_GO/GO_WITH_TECH_DEBT decisions. For each task returns: selfAssessment (worker\'s own evaluation: DONE/GO_WITH_TECH_DEBT/NO_GO), testsPassed (boolean), filesChanged (list), notes (worker summary), and decision (approved/rejected/pending). GO = task complete, all tests pass. NO_GO = task failed, needs rework. GO_WITH_TECH_DEBT = task done but with known issues to fix later. Use auto=true to approve all DONE+testsPassed tasks automatically.'` | user-visible | title: `run-text: "Run Review"`; description: `run-text: "Review run task results and make GO/NO_GO/GO_WITH_TECH_DEBT decisions. For each task returns: selfAssessment (worker's own evaluation: DONE/GO_WITH_TECH_DEBT/NO_GO), testsPassed (boolean), filesChanged (list), notes (worker summary), and decision (approved/rejected/pending). GO = task complete, all tests pass. NO_GO = task failed, needs rework. GO_WITH_TECH_DEBT = task done but with known issues to fix later. Use auto=true to approve all DONE+testsPassed tasks automatically."` | Tool `title` + `description` for `deckent_review`. Both pure prose — safe to change directly. (Grouped into one row since both lines are part of the same tool registration block and both need the identical "sprint"→"run" treatment.) |
| src/mcp/tools/review.ts:7,22,25,51,83-89,96,108,115-118 | `(getNextSprintId import; TaskData.sprintId field; loadTaskResults(root, sprintId) param; `task.sprintId !== sprintId` filter check; `sprintId = \`sprint-${...}\`` local-var construction from getNextSprintId(); `sprintId, reviews, message` / `sprintId, reviews, summary` response fields)` | internal | n/a — exempt | Frozen per exclusion list — `sprintId` identifier throughout (type field, param, local var, response field) and `getNextSprintId` function name. The literal string `` `sprint-${String(Math.max(1, num - 1)).padStart(3, '0')}` `` constructs a DATA VALUE (an actual sprint-id string used to look up task files) — not UI prose, exempt as an internal ID-construction expression. |

---

## Cross-File Summary and Notes for the Parent Rename Effort

**Coverage check** — total grep hits across all 17 files: 72+61+56+27+26+23+21+20+19+18+17+17+16+14+13+12+12 = **404** raw case-insensitive "sprint" hits. Every hit is accounted for above, either as an individual row or folded into a file's internal batch row.

**Files with zero hits**: none — all 17 files had at least one hit.

**Cross-cutting decision points surfaced (not individually "frozen" per the `sprintId`-only exclusion rule, but structural field/parameter names an external MCP client could depend on)** — flag these to the parent effort as a single consistent-naming decision, likely needing alias/deprecation rather than a hard cut:
- Input parameter literally named `sprint` (not `sprintId`): `src/mcp/tools/kpi.ts:123`, `src/mcp/tools/usage.ts:130`.
- Response/state field names containing "sprint" that are NOT `sprintId`: `help.ts`'s `sprintActive`/`lastSprint` and `workflows.sprint` key; `plan.ts`'s `sprintNumber`; `history.ts`'s `sprints` array field.
- MCP logging `logger` namespace string `deckent.sprint.${resolvedSprintId}` in `watch.ts` — visible metadata on every pushed notification.
- DB schema enum value `type: 'sprint'` documented in `catalog-parity.ts:236` — a data-layer value, out of pure string-literal rename scope, needs its own migration decision.

**Highest-value single surface**: `src/mcp/server.ts`'s `DECKENT_MCP_INSTRUCTIONS` block (15 occurrences in one string) — this is the top-level server `instructions` field shown to every connecting client once, and it duplicates content already present in each tool's own `description`. Recommend rewording both in lockstep and re-running `scripts/lint-mcp-instructions.mjs` (referenced in server.ts's own comments as the guard for this block).

**Pattern observed repeatedly**: many "sprint" grep hits inside string TEMPLATE LITERALS (e.g. `` `Checkpoint not found: ${sprintId}/${phase}` ``) are false positives for literal prose — the word "sprint" only appears via the interpolated *value* of the frozen `sprintId` variable, not as hardcoded English text in the template itself. These were verified line-by-line above and marked "no action needed" rather than proposing a text change, to avoid conflating a frozen identifier's runtime value with a hardcoded string this rename effort should touch.
Scope confirmed: none of these 19 files import `getMessage` from messages.ts. All user-visible replacement proposals use `run-text:` literal prefixes.

### src/mcp/tools/cleanup.ts — 11 total hits, 3 user-visible, 8 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/cleanup.ts:58 | `title: 'Sprint Cleanup'` | user-visible | `run-text: "Run Cleanup"` | Tool `title` metadata — safe to change directly |
| src/mcp/tools/cleanup.ts:59 | `description: 'Remove sprint artifacts and optionally trim memory budget. ... trims MEMORY.md, RETRO.md, sprint logs). ... Typically run after a sprint completes...or before starting a fresh sprint after kill.'` | user-visible | `run-text: "Remove run artifacts...trims MEMORY.md, RETRO.md, run logs)...after a run completes...or before starting a fresh run after kill."` | pure prose, safe to change directly |
| src/mcp/tools/cleanup.ts:62 | `.describe('Also run memory decay on .brain/ files if they exceed the configured line budget...Trims old sprint logs and compresses MEMORY.md.')` | user-visible | `run-text: "...Trims old run logs..."` | prose on `decay` input property; property name untouched |
| src/mcp/tools/cleanup.ts: (rest) | `getNextSprintId` import, `currentSprintId` var, `decayAfterSprints` var/config field, `decaySprints` option key | internal | n/a — exempt | frozen identifiers/config-adjacent names |

---

### src/mcp/tools/recover.ts — 10 total hits, 2 user-visible, 8 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/recover.ts:18 | `title: 'Sprint Recovery'` | user-visible | `run-text: "Run Recovery"` | safe to change directly |
| src/mcp/tools/recover.ts:19 | `description: 'Recover from a crashed or stuck sprint. Runs audit, cleans orphan IPC directories...'` | user-visible | `run-text: "Recover from a crashed or stuck run. Runs audit, cleans orphan IPC directories..."` | pure prose, safe |
| src/mcp/tools/recover.ts:22 | `.describe('Sprint ID to recover (e.g. "sprint-150")')` (attached to exempt `sprintId` property) | user-visible | `run-text: "Run ID to recover (e.g. \"sprint-150\")"` | property name stays `sprintId` (exempt); prose changes |
| src/mcp/tools/recover.ts: (rest) | `sprint-finalizer.js` import path, `sprintId` schema property/var, `ipcPattern` regex `/^sprint-\d+-ipc$/` matching on-disk dir naming, `sprintId` in response field | internal | n/a — exempt | if the underlying dir-naming convention (`sprint-NNN-ipc`) itself is renamed, this regex is a functional dependency — flag for follow-up code task, not a string rename |

---

### src/mcp/tools/init.ts — 10 total hits, 3 user-visible groups (5 lines), 7 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/init.ts:139 | `- Sprint is NEVER left incomplete` (inside generated DECKENT.md template content) | user-visible | `run-text: "- Run is NEVER left incomplete"` | written into generated file content (init's work-product) — analogous to CLI stdout |
| src/mcp/tools/init.ts:179 | generated BOOT.md content: `"3. Brain plans sprint" / "7. Sprint complete"` | user-visible | `run-text: "3. Brain plans run" / "7. Run complete"` | generated file content, safe to change |
| src/mcp/tools/init.ts:188-189,196-197 | `sprint_started: 'Sprint {id} started with {count} tasks'` / `sprint_complete: 'Sprint {id} complete'` (EN+TR, written to generated project i18n seed files `en.json`/`tr.json`) | user-visible (mixed — key names semi-frozen since an external project could read them; VALUES are prose) | `run-text:` reword the VALUE text; keep KEY names `sprint_started`/`sprint_complete` as-is OR migrate key+value together as one coordinated change | generated into the TARGET project's own i18n dictionary — potential external consumer of the key names |
| src/mcp/tools/init.ts:255-256 | `` '`deckent plan` — plan your first sprint'`` / ``'`deckent start` — start the sprint'`` (in `nextSteps` response array) | user-visible | `run-text: "...plan your first run"` / `"...start the run"` | genuine JSON response content (`nextSteps` array), safe prose |
| src/mcp/tools/init.ts:92 | `join(root, BRAIN_DIR, 'sprints')` | internal | n/a — exempt | filesystem path segment, not response prose |

---

### src/mcp/tools/memory-query.ts — 8 total hits, 4 user-visible, 4 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/memory-query.ts:15-17 | `description: 'Search project memory...sprint learnings...supports...sprint range.'` | user-visible | `run-text: "...run learnings...run range."` | pure prose, safe |
| src/mcp/tools/memory-query.ts:25 | `.describe('Filter by type: adr, memory, sprint, debt, pattern, retro')` | user-visible (mixed — documents a real accepted `type` filter VALUE) | **caution**: do NOT rename the word "sprint" here without confirming whether the underlying `type='sprint'` DB value is also renamed | functional dependency — MemoryStore entry `type` enum value, needs coordination with any DB-schema rename |
| src/mcp/tools/memory-query.ts:28 | `sprint_min: z.number().optional().describe('Minimum sprint number')` | mixed — property name `sprint_min` (NOT covered by `sprintId`-only exemption) + prose | property: structural/breaking-change candidate, needs alias if renamed; prose `run-text: "Minimum run number"` | `sprint_min` is an input schema property an external MCP client could already pass — treat as structural |
| src/mcp/tools/memory-query.ts:61 | `` const sprint = r.entry.sprint_id ? \` (${id})\` : ''; `` (renders raw ID, e.g. "(sprint-042)") | user-visible (no literal "Sprint" label — just raw ID value) | no wording change needed; `sprint_id` field itself frozen | not a literal "Sprint" word in output |
| src/mcp/tools/memory-query.ts: (rest) | `searchMemory` import, `sprint_range` internal query-option key, `sprint_min` param destructure | internal | n/a — exempt | internal plumbing, not exposed to caller directly |

---

### src/mcp/tools/kill.ts — 7 total hits, 2 user-visible, 5 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/kill.ts:89 | `.describe('Kill ALL active workers...Use when sprint is stuck and needs a full restart.')` | user-visible | `run-text: "...Use when a run is stuck..."` | prose on `all` input property, safe |
| src/mcp/tools/kill.ts:85 | `description:` block mentions "Sprint 189 T-009" (historical citation) and `feedback_sprint_kill_always_ask_user` (exact memory-entry key cited by name) | internal (historical citation + exact DB key reference) | do NOT rename either — both are internal historical/reference identifiers that must stay verbatim for traceability/lookup correctness | not generic "sprint" concept wording |
| src/mcp/tools/kill.ts: (rest) | comments (Sprint 189 T-009 etc.), `debugLog()` internal diagnostic channel | internal | n/a — exempt | comments + internal debug logging, not MCP response content |

---

### src/mcp/tools/cost.ts — 5 total hits, 1 user-visible + 1 flagged structural, 3 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/cost.ts:132-137 | `sprint: z.string().optional().describe('Sprint ID hint (e.g. "sprint-332") — reserved for future sprint-scoped cost view')` | mixed — property literally named `sprint` (NOT on frozen list, currently unused/reserved) + prose | property: good candidate to rename to `run` BEFORE it ships/gets used (low risk today); prose `run-text: "Run ID hint (e.g. \"run-332\") — reserved for future run-scoped cost view"` | flag as a decision point — low risk since unused, but needs alias/deprecation the moment it's implemented |
| src/mcp/tools/cost.ts:53,105 | `sprintMaxUsd: number;` interface field + `sprintMaxUsd: config.cost_limits.sprint_max_usd` (returned in JSON response) | internal (structural) — NOT the exempt `sprintId` | flag separately — this IS response content, an external client could depend on the field name | recommend alias/deprecation approach (emit both `sprintMaxUsd` and `runMaxUsd`) rather than silent rename |
| src/mcp/tools/cost.ts:12 | comment "Sprint 332 Task 332-015" | internal | n/a | comment, skipped |

---

### src/mcp/tools/autonomous.ts — 4 total hits, 1 user-visible (structural), 3 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/autonomous.ts:141-142 | `kind: z.enum(['task', 'sprint', 'capability']).optional().default('task').describe('Entry kind (task=inline description, sprint=directives ref, capability=F8 broker verb). Default: task')` | mixed — enum VALUE `'sprint'` (structural, real accepted value) + prose tightly coupled | do NOT rename the enum value in isolation — breaking change; prose tracks the value 1:1 | structural/breaking-change candidate — needs alias (accept both `"sprint"` and `"run"`) or deprecation, shared contract with `autonomous-surface.ts` and `process.ts` |
| src/mcp/tools/autonomous.ts: (rest) | comments (Sprint 260-009, Sprint-143) | internal | n/a | comments |

---

### src/mcp/tools/job-runner.ts — 3 total hits, 0 user-visible, 3 internal (batched)

`sprintId?: string;` interface field (JobState) + 2 comments. Zero user-visible hits — the field is never rendered as prose anywhere in this file. No table row needed.

---

### src/mcp/tools/feature-query.ts — 3 total hits, 1 user-visible (structural), 2 internal (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/feature-query.ts:127 | `sprint: manifest._meta.sprintId,` — top-level JSON response key literally named `sprint` | user-visible (structural) | field renamed to `run: manifest._meta.sprintId` (source data field `sprintId` stays untouched) | **Structural**: top-level JSON key in `deckent_feature_query` response — external client could depend on it. Needs alias/deprecation path (emit both `sprint` and `run` during a transition window) |
| src/mcp/tools/feature-query.ts: (rest) | comment (Sprint 150 Task 029), `sprintId: string;` interface field (reflects on-disk `features-manifest.json` schema, owned outside MCP scope) | internal | n/a — exempt | frozen exempt identifier |

---

### src/mcp/tools/docs.ts — 3 total hits, 2 user-visible, 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/docs.ts:18 | `description: 'Manage user-defined documents in sprint lifecycle. Actions: ... "run" triggers doc updates without a sprint; ...'` | user-visible (note: already contains an EXISTING distinct action-value literally named `"run"`) | `run-text: "Manage user-defined documents in run lifecycle. ...\"run\" triggers doc updates without a run; ..."` — consider disambiguating phrasing given the pre-existing `"run"` action value nearby | pure prose, safe; minor wording-collision risk (non-blocking) |
| src/mcp/tools/docs.ts:23 | `.describe('Section headings for auto-update (e.g., ["Sprint Metrics", "Active Debt"])')` | user-visible | `run-text: '...(e.g., ["Run Metrics", "Active Debt"])'` | illustrative example text, not a required literal value — safe to reword |

---

### src/mcp/tools/autonomous-surface.ts — 3 total hits, 0 user-visible, 3 internal/structural (batched)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/autonomous-surface.ts:79-82 | `kind: z.enum(['task', 'sprint', 'capability']).optional().default('task').describe(...)` | mixed — same pattern as autonomous.ts:141-142 | do NOT rename enum value in isolation | shares the identical `kind` enum contract with `autonomous.ts` — coordinate together |
| src/mcp/tools/autonomous-surface.ts:3 | comment (Sprint 359 Task 359-016) | internal | n/a | comment |

---

### src/mcp/tools/run.ts — 2 total hits, 1 user-visible (editorial flag), 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/run.ts:27 | `description: 'Run a single one-off task outside of a full sprint. ...without the full sprint lifecycle overhead...'` | user-visible | **naming collision to flag explicitly**: this tool is ITSELF named `deckent_run`; once "sprint"→"run" project-wide, "Run a single one-off task outside of a full sprint" becomes "...outside of a full run" — confusing self-referential wording. Recommend a disambiguating term (e.g. "full sprint/orchestration cycle", "full multi-task run") rather than literal find-replace | editorial judgment call, not mechanical |
| src/mcp/tools/run.ts:14 | `import { ... } from '../../orchestra/sprint-controller.js';` | internal | n/a — exempt | module path frozen |

### src/mcp/tools/directives.ts — 2 total hits, 1 user-visible, 1 internal

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/directives.ts:35 | `description: 'Write DIRECTIVES.md content...blocks to create sprint tasks. ...'` | user-visible | `run-text: "...blocks to create run tasks. ..."` | pure prose, safe |
| src/mcp/tools/directives.ts:60 | comment (Sprint 177 fix) | internal | n/a | comment |

### src/mcp/tools/skill-list.ts — 1 hit, 1 user-visible

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/skill-list.ts:64 | `'or audit skill assignments before planning a sprint.'` | user-visible | `run-text: '...before planning a run.'` | pure prose, safe |

### src/mcp/tools/process.ts — 1 total hit, structural (NOT prose)

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/process.ts:43 | `kind: z.enum(['task', 'sprint', 'capability']).optional().describe('submit: execution kind...')` | internal/structural (no "sprint" word in the describe text itself — only the enum value) | do NOT rename in isolation | same `kind` enum contract as autonomous.ts/autonomous-surface.ts — must be aliased/deprecated in lockstep across all three, not standalone |

### src/mcp/tools/nervous-edit.ts — 1 hit, comment-only. No table row needed.
### src/mcp/tools/models.ts — 1 hit, comment-only. No table row needed.

### src/mcp/tools/doctor.ts — 1 total hit, 1 user-visible

| file:line | mevcut string | sınıflama | önerilen messages.ts key VEYA 'run' metni | geriye-uyumluluk notu |
|---|---|---|---|---|
| src/mcp/tools/doctor.ts:16 | `description: '...Use when a sprint fails unexpectedly or before starting a new sprint. ...'` | user-visible | `run-text: "...Use when a run fails unexpectedly or before starting a new run. ..."` | pure prose, safe |

### src/mcp/tools/autonomous-approval.ts — 1 hit, comment-only. No table row needed.

---

## Batch-2 (MCP) cross-file notes

1. **`src/mcp/helpers/enrich.ts`** (NOT in this 19-file scope, but imported by `cleanup.ts`, `recover.ts`, `init.ts`, `kill.ts`, `run.ts`, `directives.ts`, `doctor.ts`, `autonomous.ts` via `enrichResponse(toolName, ...)`) injects `_enriched.summary`/`_enriched.hints` fields into EVERY response from these tools, and its `SUMMARIES`/`HINTS` maps contain hardcoded "Sprint" wording. **This is the single largest source of actual runtime user-visible "Sprint" text injected into these tools' responses** and was excluded only because it's outside the given file list — recommend adding it as an explicit follow-up file for the rename effort (effectively "file #20").
2. **Structural/breaking-change candidates requiring alias or deprecation** (do NOT silently rename): `kind` enum value `'sprint'` shared by `deckent_autonomous` (autonomous.ts:141), `deckent_autonomous_backlog` (autonomous-surface.ts:79), and `deckent_process` (process.ts:43); `sprint` input-schema property on `deckent_cost` (cost.ts:132, currently unused/reserved — lower risk); `sprintMaxUsd` response field on `deckent_cost` (cost.ts:53/105); `sprint` response field on `deckent_feature_query` (feature-query.ts:127); `sprint_min` input-schema property on `deckent_memory_query` (memory-query.ts:28).
3. **Editorial ambiguity flagged**: `deckent_run`'s own description (run.ts:27) says "...outside of a full sprint" — reworded naively becomes self-referentially confusing. Needs a copywriter decision, not mechanical find-replace.
4. Several hits are historical sprint-number citations embedded in prose/comments (e.g. "Sprint 189 T-009", "Sprint 332 Task 332-015") — point-in-time historical references, classified internal/left verbatim.

---

# YÜZEY 3 — DOCS (docs/reference/ + docs/guide/ + docs/index.md + docs/glossary.md)

### docs/reference/api.md — 137 total grep hits, covered by ~61 table rows (30 individual + 31 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/api.md:6,9 | `import { loadConfig, runSprint, readTask } from 'deckent';` | frozen-identifier | n/a — keep `runSprint` as-is | Real exported top-level function name, most heavily-used API export — renaming is a breaking API change, out of docs scope |
| docs/reference/api.md:94,95,99 | `#### \`SprintPhase\``, `#### \`SprintStatus\`` (type headings + description) | frozen-identifier + user-visible description | n/a for type names; run-text: "Phases the brain moves through during a run." | real exported TS type/enum names — frozen |
| docs/reference/api.md:138,149 | `id: string; // Format: "{sprintNumber}-{sequence}"`, `sprintId?: string;` | frozen-identifier | n/a — keep as-is | real field name + ID-format doc comment |
| docs/reference/api.md:193-242 (Sprint/SprintMetrics/DebtItem interfaces) | `interface Sprint { id: "sprint-{number}"; status: SprintStatus; phase: SprintPhase; metrics?: SprintMetrics; }`, `SprintMetrics` interface, `DebtItem.originSprintId`/`sprintsOpen`/`resolvedInSprintId` fields | frozen-identifier (types/fields) + user-visible (1 inline comment "Auto-incremented each sprint") | n/a for types/fields; run-text for comment: "// Auto-incremented each run" | **`Sprint` interface rename is the single largest code-level rename this whole effort implies** (affects every SDK consumer) — flag as the primary "big rock" for a follow-up code-rename task |
| docs/reference/api.md:306,309,310 | `DashboardState.sprint: { id, number, phase: SprintPhase, status: SprintStatus }` | frozen-identifier | n/a — keep as-is | real nested field appearing in every `/api/status` JSON response |
| docs/reference/api.md:348,387 | `budget_per_sprint?: number;`, `archivedSprints: string[];` | frozen-identifier | n/a — keep as-is | real interface fields matching config docs |
| docs/reference/api.md:440,450,564 | "views regenerated after every sprint...", "// sprint learnings" comment, "regenerated on every sprint finalize" | user-visible | run-text: "...after every run...", "// run learnings", "...on every run finalize..." | cosmetic doc prose |
| docs/reference/api.md:455 | `const SPRINTS_DIR = 'sprints';` | frozen-identifier | n/a — keep as-is | real path constant backing `.brain/sprints/` directory |
| docs/reference/api.md:477-490 | constants `SPRINT_LOG_MAX_LINES`, `MEMORY_DECAY_SPRINTS`, `DEBT_HIGH_PRIORITY_SPRINTS`, `DEBT_CRITICAL_SPRINTS` + "Sprint 140" historical comment | frozen-identifier (constant names) + historical marker | n/a for constant names; leave historical comment as-is | real exported constants from `src/core/constants.ts` |
| docs/reference/api.md:519 | "truth for all brain knowledge (ADR, memory, sprint, debt, pattern, retro, identity)." | user-visible **possibly frozen** | verify against `src/core/memory-types.ts` before renaming — may be a literal `type` enum value list, not free prose | flag as possibly-frozen, not confirmed |
| docs/reference/api.md:532-539,555 | `store.insert({ type: 'memory', sprint_id: 'sprint-190', ... })`, `sprint_range: { min: 135 }, // filter by sprint number` | frozen-identifier (`sprint_id` DB column + example value) + user-visible comment | n/a for field/value; run-text for comment: "// filter by run number" | real SQLite column name in memory.db schema |
| docs/reference/api.md:715-947 (region: runSprint/planSprint/confirmDraftTasks/resolveDebt/runDecay/cleanup/calculateMetrics/escalateDebt/writeRetrospective/writeSprintLog/spawnWorkers/waitForResults function docs) | function names + `Sprint`/`SprintMetrics`/`SprintSizeRecommendation` types (frozen) + description prose ("full sprint lifecycle", "Post-sprint cleanup", "sprint metrics", etc.) | frozen-identifier (names/types) + user-visible (prose) | n/a for identifiers; run-text: reword all description prose to "run" | functions/types frozen; only descriptive adjectives change. Local example variable name `sprint` at line 740 is NOT part of the API contract — optional cosmetic rename |
| docs/reference/api.md:903,913 | `writeSprintLog(...)`, `.brain/sprints/sprint-{id}.md` path pattern | frozen-identifier | n/a — keep function name + path pattern as-is | function name + path pattern frozen; only "the full sprint metrics" adjective is prose |
| docs/reference/api.md:957,971 | `Task.id` format comment `{sprintNumber}-{sequence:03}`, `CreateTaskParams.sprintId` | frozen-identifier | n/a — keep as-is | real ID-format doc + interface field |
| docs/reference/api.md:1013,1017 | `SprintPhaseError.phase?: SprintPhase;` + description "a sprint phase fails" | frozen-identifier + user-visible | n/a for type; run-text: "Thrown when a run phase fails unrecoverably..." | type frozen; description renameable |
| docs/reference/api.md:1033,1038,1077 | `SprintSizeRecommendation` type (×3) + description "the sprint size recommendation" | frozen-identifier + user-visible | n/a for type; run-text: "...the run size recommendation." | type frozen |
| docs/reference/api.md:1487,1503-1565 | Dashboard mock example (`sprint: {id:'sprint-1', ...}`), repeated `currentSprintId` param (×3), `sprintInfo` param shape | frozen-identifier | n/a — keep as-is | real example/param shapes |
| docs/reference/api.md:1613-1631 | MCP Tools condensed table — 8 description-column rows ("Plan a sprint...", "Run a full sprint lifecycle...", "Return the latest sprint retrospective...", etc.) | frozen-identifier (tool names) + user-visible (8 descriptions) | n/a for tool names; run-text: reword each description | matches mcp-tools.md findings — condensed duplicate table |
| docs/reference/api.md:1666-1672 | MCP Resources table (3 description rows: "sprint progress", "sprint retrospective", "sprint task list") | user-visible | run-text: reword each to "run progress"/"run retrospective"/"run task list" | resource URIs frozen; descriptions renameable |
| docs/reference/api.md:1764-1765,1803-1809 | code-comment historical markers (Sprint 175/267) + HTTP status-code table prose ("Sprint start accepted", "sprint log", "sprint already running") | user-visible + historical | run-text: reword prose; leave historical comments | cosmetic |
| docs/reference/api.md:1826-1892 (region: GET /api/status, GET /api/sprint, GET /api/history) | `"sprint"`/`"lastSprint"` JSON response field names + example ID `"sprint-037"` + **endpoint route `GET /api/sprint` itself** + literal error string `"No sprint logs found"` | frozen-identifier (highest-stakes in the whole scan) + user-visible (heading/prose) | n/a for field names, example IDs, error string, and the route; run-text ONLY for surrounding prose ("active run"/"no active run (idle)") | **`GET /api/sprint` is a real, versioned HTTP route** (`src/api/server.ts`) — renaming the DOC HEADING without renaming the actual server route would make docs wrong. Must be a coordinated code+docs task, not docs-only |
| docs/reference/api.md:1956,1963,1986,1999,2026,2056-2057,2095-2150 | export-pipeline example content (embedded "## Sprint 036 Learnings", debt.md column header "Sprint", literal error strings mirroring real server output, SSE `data:{"sprint":{...}}`, task-title example naming `sprint-controller.ts`) | mixed — some frozen (literal error strings, JSON field `sprint`), some illustrative (safe to reword) | run-text for prose/illustrative examples; n/a for literal error-message strings and JSON field names unless the underlying code also changes | several distinct compat classes bundled here — see cross-file notes |
| docs/reference/api.md:2170-2256 | "Generates a sprint plan...", example DIRECTIVES content `# DIRECTIVES — Sprint 038` (×2) | user-visible (illustrative) | run-text: reword prose + example headings to "Run" | safe, illustrative user-typed content |
| docs/reference/api.md:2321-2330 | CLI Commands table — 6 description-column rows ("Start a new sprint", "Plan a sprint...", etc.) | user-visible | run-text: reword each | CLI subcommand names themselves (`start`,`plan`,`status`...) contain no "sprint" — unaffected |
| docs/reference/api.md:2352 | `# Run a sprint with auto-approved workers` (shell comment) | user-visible | run-text: "# Start a run with auto-approved workers" (avoid "run a run") | cosmetic; flag "run a run" collision |

**Cross-file synthesis from api.md (applies project-wide):**
1. Historical "Sprint NNN" citations recur dozens of times as changelog-style references tied to real dated sprint logs — recommend ONE project-wide policy decision (rename retroactively vs. freeze all) rather than per-occurrence judgment.
2. The literal `sprint-{number}`/`sprint-NNN` ID format is the deepest frozen-identifier thread: `Sprint.id` TS field format, `sprintId`/`sprint_id` DB+JSON field names, `.brain/sprints/sprint-{id}.md` filename pattern, `deckent-backup-<sprintId>` git branch name, `.deckent/<sprint-id>-events.jsonl` filename, CLI example IDs. Renaming doc PROSE doesn't require touching any of these — they're a separate, much larger code-level rename epic.
3. `deckent_style: 'sprint'` config enum value is the highest-risk single token (persisted user-config on disk) — breaking schema change, not a docs edit.
4. `sprint-*.ts` source-filename family (`sprint-controller.ts`, `sprint-phases.ts`, `sprint-spawner.ts`, `sprint-planner.ts`, `sprint-finalizer.ts`, `sprint-file-retention.ts`, `mid-sprint-adapter.ts`, etc.) referenced constantly — all frozen per docs-only scope, but represents the real code-level rename surface.
5. **Naming collision risk**: `deckent_run` MCP tool means "run a single one-off task outside of a full sprint." If "sprint"→"run" as the umbrella term, contrasting "a single run" vs "a full run" (formerly "a full sprint") becomes ambiguous — needs a product/naming decision.
6. Awkward-phrasing risk: several sentences already use "run" as a verb next to "sprint" as the noun (e.g. "run a sprint," "Run a sprint with auto-approved workers") — naive find/replace produces "run a run." Flag inline, human pass recommended.

---

### docs/reference/config-reference.md — 57 total grep hits, covered by ~44 table rows

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/config-reference.md:525 | "4. **After sprint**: `deleteSafetyPoint()` removes both the backup branch AND the JSON file" | user-visible | run-text: "4. **After run**: ..." | cosmetic; function name unaffected |
| docs/reference/config-reference.md:530 | "**Stash pop failure**: ...the sprint is **aborted** with recovery instructions..." | user-visible | run-text: "...the run is **aborted**..." | cosmetic |
| docs/reference/config-reference.md:531 | "**Orphan cleanup**: At the start of each sprint, stale safety-point files from previous incomplete sprints are automatically cleaned up." | user-visible (2 mentions) | run-text: "At the start of each run...incomplete runs..." | cosmetic |
| docs/reference/config-reference.md:549 | "Source: `src/orchestra/rollback.ts`, `src/orchestra/sprint-phases.ts`" | frozen-identifier | n/a — keep filename | frozen |
| docs/reference/config-reference.md:560 | "`deckent_style` \| `\"sprint\"` (config.ts:868) \| `sprint\|task\|process` \| Runtime style..." | frozen-identifier (enum value ×3) | n/a — keep all tokens as-is | **HIGH compat concern** — real persisted config value, do not rename casually |
| docs/reference/config-reference.md:562,570,597,685,727,764,950,981,982 | historical "Sprint NNN" feature-introduction markers (272,276,267,268,277,180,182,273) | user-visible historical | leave as historical markers | low priority |
| docs/reference/config-reference.md:581,610,629,641,643 | "never blocks sprint", "never blocks sprint", "same sprint", "Sprint-controller includes...", "sprint execution" | user-visible | run-text: reword each to "run" | cosmetic; line 641's "Sprint-controller" is a bare reference to the frozen `sprint-controller` module — no separate rename |
| docs/reference/config-reference.md:829 | `## 16. Sprint Lifecycle & Evaluation` | user-visible (H2 heading) | run-text: "## 16. Run Lifecycle & Evaluation" | anchor `#16-sprint-lifecycle--evaluation` — moderate compat concern |
| docs/reference/config-reference.md:835 | "`human_checkpoints` ... Pauses the sprint for manual approval at each listed gate (sprint-controller.ts ~595/680/885)." | user-visible (prose) + frozen (filename) | n/a for filename; run-text: "Pauses the run for manual approval..." | filename frozen; prose renameable |
| docs/reference/config-reference.md:839,840 | `max_reroutes`/`reroute_on_tech_debt` rows citing `mid-sprint-adapter.ts` | frozen-identifier | n/a — keep filename | frozen |
| docs/reference/config-reference.md:841 | `sprint_timeout_minutes` \| `0` \| Global sprint timeout (config.ts:1137). | frozen-identifier (key) + user-visible (desc) | n/a for key; run-text: "Global run timeout..." | key frozen |
| docs/reference/config-reference.md:842,846 | `routing_engine`/`agent_min_score` rows citing `sprint-planner.ts` | frozen-identifier | n/a — keep filename | frozen |
| docs/reference/config-reference.md:845,847 | `adaptive_thresholds`/`adaptive_config` rows citing `sprint-finalizer.ts` | frozen-identifier | n/a — keep filename | frozen |
| docs/reference/config-reference.md:848 | `dependency_pipeline_enabled` row citing `sprint-spawner.ts` | frozen-identifier | n/a — keep filename | frozen |
| docs/reference/config-reference.md:849 | `sprint_checkpoint_interval` \| `5` \| Terminal tasks... (sprint-spawner.ts:579). | frozen-identifier (key+filename) | n/a — keep both | frozen |
| docs/reference/config-reference.md:864,865,866 | `memory_budget`(filename `sprint-finalizer.ts`)/`decay_after_sprints`(key)/`patterns_enabled` rows | frozen-identifier + user-visible (2 descriptions) | n/a for filename/key; run-text: "older than N runs."/"at run end." | filename+key frozen; descriptions renameable |
| docs/reference/config-reference.md:890,892 | `history_scaling_enabled` prose "historical sprint timing" + `adaptive_multiplier` row citing `sprint-controller.ts` | user-visible (line 890) + frozen (line 892 filename) | run-text line 890: "historical run timing."; n/a line 892 | mixed |
| docs/reference/config-reference.md:904 | `notify_on_complete` \| Emit a notification on sprint finalize (notify.ts:47). | user-visible | run-text: "...on run finalize..." | cosmetic |
| docs/reference/config-reference.md:921 | master switch: `initNervousSystemForSprint()` (sprint-controller.ts:499) | frozen-identifier (function name + filename) | n/a — keep both | frozen exported function |
| docs/reference/config-reference.md:928 | `safety_floor.locked_actions`: `KILL_LIVE_SPRINT`, MANUAL_FILE_DELETE, ... | frozen-identifier | n/a — keep `KILL_LIVE_SPRINT` as-is | security-relevant identifier, high caution |
| docs/reference/config-reference.md:949 | `reserve_for: sprint-148` | frozen-identifier | n/a — keep as-is | historical/reserved literal value |
| docs/reference/config-reference.md:963,964,965 | `sprint_file_retention.keep_last_n`/`.size_cap_mb`/`.archive_path` (3 keys + filename `sprint-file-retention.ts` + default path `.deckent/archive/sprints/`) | frozen-identifier (dense cluster) + user-visible (2 descriptions) | n/a for keys/filename/path; run-text: "Runs kept in the project root..."/"Total run-file size cap." | **densest single frozen-identifier cluster in this doc** — 3 sibling keys + a filename + a default filesystem path, well beyond docs-only scope |
| docs/reference/config-reference.md:1072 | "- [Core Concepts](../guide/concepts.md) — Sprint, Task, Agent, Brain, Auditor overview" | user-visible | run-text: "— Run, Task, Agent, Brain, Auditor overview" | cosmetic nav-link description |

Now I have enough context to compose the full inventory. Let me write the final report.

## Sprint → Run Rename Inventory (14 docs files)

Total grep hits across all 14 files: **198**

---

### docs/reference/config.md — 43 total grep hits, covered by 20 table rows (14 individual + 6 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/config.md:18 | `Sprint ciktilari bu dilde uretilir.` | user-visible | run-text: `Run çıktıları bu dilde üretilir.` | cosmetic doc prose, no compat concern |
| docs/reference/config.md:19 | `` `last_sprint_id` \| `string` \| — \| — \| Son tamamlanan sprint ID'si (orn. `'sprint-150'`) `` | frozen-identifier | n/a — keep identifier `last_sprint_id`/`sprint-150` value shape, reword description prose only (e.g. "Son tamamlanan run ID'si") | real persisted config field name (`last_sprint_id`) + example value format `sprint-NNN` — actual external contract, high compat risk if field renamed |
| docs/reference/config.md:22 | `` `deckent_style` \| `'sprint' \| 'task' \| 'process'` \| `'sprint'` \| ... Calisma modu: `'sprint'` (developer orchestration) `` | frozen-identifier | n/a — keep enum literal `'sprint'` (persisted config value), reword surrounding prose (e.g. "Çalışma modu") if desired | literal persisted config enum value `deckent_style: 'sprint'` — frozen, high compat risk per task instructions |
| docs/reference/config.md:33 | `Gruplanmis provider konfig. ... (Sprint 150 Karar 3+4)` | user-visible | run-text: keep as historical changelog reference — "(Sprint 150 Karar 3+4)" refers to a historical sprint/run *number*, consider leaving numbered historical references as-is or rewording to "run 150" | cosmetic doc prose; numbered historical references may be treated as immutable changelog citations — flag for Alperen decision on whether historical sprint-N citations get renamed too |
| docs/reference/config.md:48 | `` `budget_per_sprint` \| `number` \| Sprint basi USD butce (sadece `api` modunda). `` | frozen-identifier | n/a — keep field name `budget_per_sprint`, reword description prose only (e.g. "Run başı USD bütçe") | real config field name — external contract (config schema), high compat risk if renamed |
| docs/reference/config.md:78 | `Docker izolasyon varsayilan (ADR-027, Sprint 177).` | user-visible | run-text: `Docker izolasyon varsayilan (ADR-027, Run 177).` (or leave historical sprint-N citation as-is, see note above) | cosmetic doc prose; historical numbered reference |
| docs/reference/config.md:85 | `Sprint 220.` (trailing changelog citation) | user-visible | run-text: historical citation — see note on numbered sprint references | cosmetic doc prose; historical numbered reference |
| docs/reference/config.md:86,87,90,123,124,127-128,152,165,167,169,183,202,253,262-265,271,283,293,306,319,334,345,469 | `` `pre_sprint_tests`, "Sprint baslangicinda tam test suite calistir... Sprint 255.", "Sprint 261.", "Sprint 202.", "Sprint 179.", `sprint_timeout_minutes`, `sprint_checkpoint_interval`, "Sprint oncesi safety point...", "gecmis sprint sayisi", "Sprint 156...", "Ayni sprint icindeki task'larda...", "Sprint bitiminde bildirim gonder.", "Sprint 186'da...", "Gecmis sprint verisine...", "Sprint 191'de...", "Sprint 192.", "(Sprint 271)", "Sprint 276 PLAN-INT-1", "(Sprint 276 XVER-1)", "(Sprint 278 COMM-1)", "(sprint-354/355...)", "Sprint-ici token maliyet kesici (Sprint 279 WK-cost)", "(Sprint 226, ADR-040)", "### Sprint 150: v2 Duplicate Key Removal" | mixed: mostly user-visible prose + 2 frozen field names (`pre_sprint_tests`, `sprint_timeout_minutes`, `sprint_checkpoint_interval`) +N similar | run-text: reword prose occurrences of "sprint" → "run" (e.g. "Sprint başlangıcında tam test suite çalıştır" → "Run başlangıcında..."); keep the three config field identifiers unchanged | field names `pre_sprint_tests`/`sprint_timeout_minutes`/`sprint_checkpoint_interval` are real config schema keys — external contract, high compat risk if renamed; the heading `### Sprint 150: v2 Duplicate Key Removal` is a heading/anchor (`#sprint-150-v2-duplicate-key-removal`) — flag anchor-stability concern if linked elsewhere |
| docs/reference/config.md:92 | `> **Sprint 150 Degisiklik:** \`claude_backend\` kaldirildi — \`spawn_backend\` kullanin.` | user-visible | run-text: `> **Run 150 Değişikliği:** ...` (historical numbered reference, see note) | cosmetic doc prose; historical numbered reference |
| docs/reference/config.md:102 | `` `decay_after_sprints` \| `number` \| `20` \| N sprint sonra eski kayitlari soft-delete. `` | frozen-identifier | n/a — keep field name `decay_after_sprints`, reword prose "N run sonra..." | real config field name — external contract, high compat risk |
| docs/reference/config.md:107 | `` `memory.decay_after_sprints` \| `number` \| `20` \| V2 decay suresi. `` | frozen-identifier | n/a — keep field name `memory.decay_after_sprints` | real config field name (nested), external contract, high compat risk |
| docs/reference/config.md:109 | `` `memory.export_trigger` \| ... \| `'sprint_end' \| 'every_write' \| 'manual'` \| `'sprint_end'` \| Export tetikleme zamani. `` | frozen-identifier | n/a — keep enum literal `'sprint_end'` | literal persisted config enum value, frozen per task instructions, high compat risk |
| docs/reference/config.md:116 | `## Sprint Lifecycle` | user-visible (heading) | run-text: `## Run Lifecycle` | heading/anchor `#sprint-lifecycle` — flag: other docs/external links may reference this anchor; needs redirect/compat plan |
| docs/reference/config.md:125 | `` `max_reroutes` \| `number` \| `3` \| Mid-sprint adapter'da task basi max reroute. `` | user-visible | run-text: `Mid-run adapter'da task başı max reroute.` | cosmetic doc prose (field name `max_reroutes` itself has no "sprint" in it) |
| docs/reference/config.md:132 | `` `dependency_pipeline_enabled` ... tum projeler `true` (Sprint 156; deckent-dev flip 2026-06-10). `` | user-visible | run-text: reword trailing citation "(Run 156; ...)" | cosmetic doc prose; historical numbered reference |
| docs/reference/config.md:362 | `## Nervous System (Sprint 147+)` | user-visible (heading) | run-text: `## Nervous System (Run 147+)` | heading/anchor `#nervous-system-sprint-147` — flag anchor-stability concern |
| docs/reference/config.md:369 | `` `nervous_system.worker_respawn` ... sprint-controller'in lifecycle'u uzerinden isletilir ... `` | mixed | n/a for `sprint-controller` file/module reference (frozen); run-text for surrounding prose "run-controller'ın lifecycle'ı üzerinden" only if module itself gets renamed (out of scope here — just doc mention) | `sprint-controller` here refers to the actual source file `sprint-controller.ts` — frozen identifier reference, do not reword unless the file itself is renamed |
| docs/reference/config.md:500 | `_Son guncelleme: Sprint 286 (2026-06-14)_` | user-visible | run-text: historical numbered reference, see note | cosmetic doc prose; historical numbered reference (footer changelog stamp) |

---

### docs/reference/features.md — 30 total grep hits, covered by 16 table rows (10 individual + 6 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/features.md:11 | `Core features used in every sprint cycle. ... PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle.` | user-visible | run-text: `Core features used in every run cycle. ...` | cosmetic doc prose |
| docs/reference/features.md:13 | `Implemented features that are not wired into the sprint lifecycle.` | user-visible | run-text: `...not wired into the run lifecycle.` | cosmetic doc prose |
| docs/reference/features.md:20 | `` sprint-controller \| `sprint-controller.ts`, `sprint-phases.ts`, `sprint-lifecycle.ts` \| Central orchestrator for 8-phase sprint lifecycle `` | mixed | n/a for the three `.ts` filenames (frozen); run-text for the feature-name column `sprint-controller` if the feature-catalog naming itself is being renamed, and for prose "Central orchestrator for 8-phase run lifecycle" | filenames `sprint-controller.ts`/`sprint-phases.ts`/`sprint-lifecycle.ts` are real source files — frozen; the leftmost "feature id" column value `sprint-controller` mirrors the module name so likely stays frozen too — flag for decision |
| docs/reference/features.md:24 | `...wired via \`createAndStartHeartbeatDaemon\` in sprint-controller.` | frozen-identifier (module ref) | n/a — keep `sprint-controller` module reference | reference to actual source module name, frozen |
| docs/reference/features.md:25 | `Unconditionally imported and wired by sprint-controller (...)` | frozen-identifier (module ref) | n/a — keep `sprint-controller` module reference | reference to actual source module name, frozen |
| docs/reference/features.md:43,45,47 | `` `deckent audit compliance --sprint <id>`, `deckent audit forward --sprint <id>` `` +N similar | frozen-identifier | n/a — keep CLI flag `--sprint <id>` as-is (or track separately if `--sprint` flag itself is being renamed to `--run`, but that's a CLI-code decision, not a doc-only decision); reword surrounding prose | real CLI flag/option shown verbatim — external contract; NOTE: unlike other frozen flags, task instructions say the flag NAME is frozen for THIS doc-only rename pass, but flag up that `--sprint` is pervasive across `deckent audit compliance/forward`, `deckent_kpi`, etc. — if the actual CLI flag is renamed in code, all these doc mentions must follow in lockstep |
| docs/reference/features.md:51 | `before re-entering \`runSprint\`, ...` | frozen-identifier | n/a — keep `runSprint` function-name identifier, reword prose only | real internal function name referenced in doc — frozen per task instructions (code identifier) |
| docs/reference/features.md:52 | `` `sprint-spawner.ts` `` (module list) | frozen-identifier | n/a — keep filename | real source filename, frozen |
| docs/reference/features.md:55 | `Live dashboard pages (Sprint 269): ... displays current sprint directives with edit history.` | user-visible | run-text: `Live dashboard pages (Run 269): ... displays current run directives with edit history.` | cosmetic doc prose; "(Sprint 269)" is historical numbered citation |
| docs/reference/features.md:56 | `` `/status` (sprint dashboard) `` | user-visible | run-text: `` `/status` (run dashboard) `` | cosmetic doc prose describing a REPL slash command's behavior, not the command name itself |
| docs/reference/features.md:57 | `Parity with CLI established Sprint 269.` | user-visible | run-text: historical numbered citation, see note | cosmetic doc prose |
| docs/reference/features.md:60 | `Enables multi-agent/team coordination across sprint tasks without blocking.` | user-visible | run-text: `...across run tasks without blocking.` | cosmetic doc prose |
| docs/reference/features.md:61,62,63,64,65,66,67,68,69,70,71,72,73 | `` `sprint-phases.ts`, "F1-LIM faz-2 ... (Sprint 272)", "based on Sprint 271 baseline...", "F1-TOK Faz 0+1+1,5 (Sprint 273) + Faz 3 (Sprint 275)", "`--sprint <N>` per-task breakdown", "F1-TOK Faz 2 (Sprint 274)", "`deckent usage --sprint N` output", "Sprint 273, Task 273-012", "Sprint 276", "XVER-1 (Sprint 276)", "Fail-safe: xverify errors never block sprint.", "ENT-5 (Sprint 277)", "DASH-001 (Sprint 279) ... killing all active workers in the current sprint", "Does NOT change sprint state to COMPLETED", "WK-cost (Sprint 279): Mid-sprint token-usage abort gate", "does not crash sprint", "WK-nervous (Sprint 279)", "sonsuz-freezing sprint spawn", "WK-5 (Sprint 279)", "DASH-002 (Sprint 279)"` +N similar | mixed: mostly user-visible prose citations/descriptions + frozen filename `sprint-phases.ts` + frozen CLI flag `--sprint <N>` | run-text: reword all prose "sprint" → "run" occurrences (e.g. "Mid-run token-usage abort gate", "does not crash run", "current run", "sprint state" → "run state"); keep `sprint-phases.ts` filename and `--sprint <N>`/`--sprint N` CLI flag unchanged | `sprint-phases.ts` = real source file (frozen); `--sprint <N>` / `--sprint N` = real CLI flag shown verbatim (external contract, flag-rename is a separate code decision); historical "(Sprint NNN)" citations are numbered references, flag for Alperen decision on whether to reword |
| docs/reference/features.md:77 | `These features are implemented but not yet wired into the sprint lifecycle:` | user-visible | run-text: `...not yet wired into the run lifecycle:` | cosmetic doc prose |
| docs/reference/features.md:81 | `` multi-agent-pipeline \| No sprint integration `` | user-visible | run-text: `No run integration` | cosmetic doc prose |
| docs/reference/features.md:99 | `The manifest is automatically regenerated after each sprint in the RETRO phase (sprint-finalizer.ts Step 10d).` | mixed | run-text for "after each sprint" → "after each run"; n/a for `sprint-finalizer.ts` filename | `sprint-finalizer.ts` is a real source filename — frozen |

---

### docs/reference/migration-guide.md — 23 total grep hits, covered by 13 table rows (8 individual + 5 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/migration-guide.md:27 | `` \| Task files \| `.tasks/*.json` (no `sprintId`) \| `.tasks/*.json` (with `sprintId`) \| Auto \| `` | frozen-identifier | n/a — keep JSON field name `sprintId` as literal identifier in this historical migration-diff table | real persisted JSON field name shown as a migration-history literal — frozen, high compat risk (describes an actual schema field, not just prose) |
| docs/reference/migration-guide.md:154 | `Before Sprint 15, deckent used \`AGENTS.md\`... Sprint 15 introduced \`DECKENT.md\`...` | user-visible | run-text: reword to "Before Run 15, ... Run 15 introduced..." (historical numbered citation, flag for Alperen decision — see general note) | cosmetic doc prose; historical numbered reference |
| docs/reference/migration-guide.md:236 | `` "triggers": ["beforeSprint", "afterTask"], `` | frozen-identifier | n/a — keep JSON literal string `"beforeSprint"` (plugin manifest schema value) | literal plugin-manifest JSON trigger-name value — real external contract (v2 plugin schema), high compat risk if renamed |
| docs/reference/migration-guide.md:239-240 | `` "hooks": { "beforeSprint": "hooks/before-sprint.js", "afterSprint": "hooks/after-sprint.js", ... } `` | frozen-identifier | n/a — keep JSON keys `beforeSprint`/`afterSprint` and hook script filenames `before-sprint.js`/`after-sprint.js` | real plugin-manifest schema keys + referenced hook filenames — external contract, high compat risk |
| docs/reference/migration-guide.md:257,258 | `` \| `hooks.beforeSprint` \| `string` \| No \| Runs before sprint starts \| ... \| `hooks.afterSprint` \| `string` \| No \| Runs after sprint completes \| `` | mixed | n/a for `hooks.beforeSprint`/`hooks.afterSprint` field names; run-text for description prose "Runs before run starts" / "Runs after run completes" | real plugin-manifest schema field names — frozen, external contract; description text is reword-eligible |
| docs/reference/migration-guide.md:280 | `` before-sprint.js ← optional lifecycle hook `` | frozen-identifier | n/a — keep example filename `before-sprint.js` in directory-tree diagram | real example filename shown in a directory structure diagram — frozen (matches actual hook script naming convention) |
| docs/reference/migration-guide.md:410 | `**Symptom**: Sprint starts but no workers appear.` | user-visible | run-text: `**Symptom**: Run starts but no workers appear.` | cosmetic doc prose |
| docs/reference/migration-guide.md:467 | `This was a bug in v0.x (\`planSprint\` limited tasks to \`max_workers\`). Fixed in Sprint 21 / v0.1.0-sprint21.` | mixed | n/a for `planSprint` function name and `v0.1.0-sprint21` version string; run-text for "Fixed in Run 21" only if historical sprint-N citations are renamed (flag for decision) | `planSprint` = real internal function name (frozen); `v0.1.0-sprint21` = a literal published npm version string — frozen, HIGH compat risk (this is an actual published package version tag, cannot be renamed retroactively) |
| docs/reference/migration-guide.md:469 | `**Fix**: Upgrade to at least v0.1.0-sprint21. All tasks are now planned; \`spawnWorkers\` applies the parallelism limit.` | frozen-identifier | n/a — keep literal version string `v0.1.0-sprint21` | literal published npm version tag — frozen, high compat risk |
| docs/reference/migration-guide.md:477-487 | `` \| `0.1.0-sprint23` \| ... \| \| `0.1.0-sprint22` \| ... \| \| `0.1.0-sprint21` \| ... \| \| `0.1.0-sprint20` \| Fix validation sprint \| ... \| `0.1.0-sprint19` ... \| `0.1.0-sprint18` \| First real runSprint execution, 8 doc tasks \| ... \| `0.1.0-sprint17` ... \| `0.1.0-sprint16` ... \| `0.1.0-sprint15` ... \| `0.1.0-sprint12-13` ... \| `0.1.0-sprint11` `` (version-history table, 10 rows) +N similar | frozen-identifier | n/a — keep all literal `0.1.0-sprintNN` published version-tag strings unchanged; the one prose cell "Fix validation sprint" and "First real runSprint execution" description text can be reworded (`runSprint` function name itself stays frozen) | every `0.1.0-sprintNN` string is a literal published npm version tag — frozen, high compat risk (cannot retcon npm registry history); `runSprint` mentioned in description is a real function name, frozen |
| docs/reference/migration-guide.md:491 | `_Last updated: Sprint 286 — deckent v1.0.0-beta.1_` | user-visible | run-text: historical numbered citation, flag for decision (see general note) | cosmetic doc prose footer; historical numbered reference |

---

### docs/reference/mcp-tools.md — 19 total grep hits, covered by 15 table rows (12 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/mcp-tools.md:15 | `` `deckent_audit` \| Sprint Audit \| Sprint audit multitool, mirrors the `` | user-visible | run-text: `Run Audit \| Run audit multitool, mirrors the` (tool-display-name column + description) | tool ID `deckent_audit` itself unaffected (no "sprint" in it); display-name/description text is reword-eligible prose, no anchor concern |
| docs/reference/mcp-tools.md:21 | `` `deckent_checkpoint` \| Checkpoint Management \| ... Checkpoints pause sprint execution ... action=approve/reject with sprintId and phase `` | mixed | run-text for "Checkpoints pause sprint execution at configured phases" → "pause run execution"; n/a for the `sprintId` MCP tool-parameter name | `sprintId` here is a real MCP tool input parameter name — external contract (tool schema), frozen, high compat risk if renamed |
| docs/reference/mcp-tools.md:22 | `` `deckent_cleanup` \| Sprint Cleanup \| Remove sprint artifacts ... run after a sprint completes (deckent_review) or before starting a fresh sprint after kill. `` | user-visible | run-text: `Run Cleanup \| Remove run artifacts and optionally trim memory budget. ... Typically run after a run completes ... or before starting a fresh run after kill.` | cosmetic doc prose; display-name column also reword-eligible |
| docs/reference/mcp-tools.md:25 | `` `deckent_docs` \| Managed Docs \| Manage user-defined documents in sprint lifecycle. `` | user-visible | run-text: `...in run lifecycle.` | cosmetic doc prose |
| docs/reference/mcp-tools.md:26 | `` `deckent_doctor` ... Use when a sprint fails unexpectedly or before starting a new sprint. `` | user-visible | run-text: `Use when a run fails unexpectedly or before starting a new run.` | cosmetic doc prose |
| docs/reference/mcp-tools.md:27 | `` `deckent_explain` \| Sprint Explanation \| Explain what a sprint did ... Reads the sprint log ... Use after a sprint completes ... Supports specific sprint lookup ... `` | user-visible | run-text: `Run Explanation \| Explain what a run did in human-friendly language. Reads the run log ... Use after a run completes ... Supports specific run lookup ...` | cosmetic doc prose (display name + description) |
| docs/reference/mcp-tools.md:30 | `` `deckent_history` \| Sprint History \| Read archived sprint log files ... last N sprint markdown logs sorted by sprint ID ... compare sprint performance ... Each sprint log contains ... `` | user-visible | run-text: `Run History \| Read archived run log files ... last N run markdown logs sorted by run ID ... compare run performance ... Each run log contains ...` | cosmetic doc prose |
| docs/reference/mcp-tools.md:32 | `` `deckent_kill` ... stuck (stale heartbeat) ... run deckent_cleanup ... then deckent_start to restart. CLI parity (ADR-022-V2 + Sprint 189 T-009): force + userExplicit are pass-through panic-guard bypass markers ... (feedback_sprint_kill_always_ask_user) `` | mixed | run-text for "Sprint 189 T-009" historical citation prose (flag decision); n/a for internal feedback-note identifier `feedback_sprint_kill_always_ask_user` | `feedback_sprint_kill_always_ask_user` looks like an internal memory/feedback-note key referenced in doc — likely frozen (internal identifier), flag for confirmation; historical "(Sprint 189 T-009)" is numbered citation |
| docs/reference/mcp-tools.md:33 | `` `deckent_kpi` \| KPI Scorecard \| Show the KPI scorecard for a sprint (default) or trend series for a single KPI. `` | user-visible | run-text: `Show the KPI scorecard for a run (default) or trend series for a single KPI.` | cosmetic doc prose |
| docs/reference/mcp-tools.md:35 | `` `deckent_memory_query` \| Memory Query \| Search project memory — ADRs, sprint learnings, patterns, technical debt. `` | user-visible | run-text: `...ADRs, run learnings, patterns, technical debt.` | cosmetic doc prose |
| docs/reference/mcp-tools.md:42 | `` `deckent_nervous_subscribe` \| Nervous Subscribe \| Subscribe to Nervous System notifications for the current sprint. `` | user-visible | run-text: `...for the current run.` | cosmetic doc prose |
| docs/reference/mcp-tools.md:44 | `` `deckent_plan` \| Plan Sprint \| Preview a sprint plan based on current DIRECTIVES.md. ... Use this to validate your directives before running deckent_start. `` | user-visible | run-text: `Plan Run \| Preview a run plan based on current DIRECTIVES.md. ...` | cosmetic doc prose (display name + description) |
| docs/reference/mcp-tools.md:46 | `` `deckent_recover` \| Sprint Recovery \| Recover from a crashed or stuck sprint. `` | user-visible | run-text: `Run Recovery \| Recover from a crashed or stuck run.` | cosmetic doc prose |
| docs/reference/mcp-tools.md:47,48,53,54,58 | `` `deckent_retro` \| Sprint Retrospective \| Read a sprint retrospective..., `deckent_review` \| Sprint Review \| Review sprint task results..., `deckent_start` \| Start Sprint \| Start a full sprint in the background. ... Pre-spawn cost gate (Sprint 189 T-008): if the estimated sprint cost exceeds cost_limits.sprint_max_usd ... the sprint continues asynchronously..., `deckent_status` \| Sprint Status \| Get the current sprint dashboard status ... sprintId ... skillAssignments, deckent_watch \| Watch Sprint Events \| Subscribe to live sprint event stream ... `` +N similar | mixed: mostly user-visible display-names/descriptions + 2 frozen items (`cost_limits.sprint_max_usd` config field, `sprintId` field in deckent_status return schema) | run-text: reword all display-names ("Sprint Retrospective"→"Run Retrospective", "Sprint Review"→"Run Review", "Start Sprint"→"Start Run", "Sprint Status"→"Run Status", "Watch Sprint Events"→"Watch Run Events") and description prose; keep `cost_limits.sprint_max_usd` config-field name and `sprintId` return-field name unchanged | `cost_limits.sprint_max_usd` = real config schema field (frozen, external contract); `sprintId` in `deckent_status` return payload = real API/tool return field (frozen, external contract) — both high compat risk if renamed |
| docs/reference/mcp-tools.md:49 | `` `deckent_run` \| Run Task \| Run a single one-off task outside of a full sprint. ... without the full sprint lifecycle overhead (no PLAN/EVALUATE/RETRO phases). `` | user-visible | run-text: `...outside of a full run. ... without the full run lifecycle overhead...` | cosmetic doc prose. Note: the MCP tool itself is *already* named `deckent_run` — worth flagging as a naming-collision consideration once "sprint"→"run" rename lands (a full sprint becomes "a run", but there's already a tool called `deckent_run` for one-off tasks) |

---

### docs/guide/first-sprint.md — 18 total grep hits, covered by 15 table rows (12 individual + 3 grouped)

`### docs/guide/first-sprint.md — 18 total grep hits, covered by 15 table rows`

**FILE-LEVEL FLAG:** The filename itself, `first-sprint.md`, is a rename candidate (→ `first-run.md`). This is a guide page commonly linked externally (README, website nav, other docs cross-references) — renaming the file breaks any existing external/internal links unless a redirect or a kept old-path stub is added. Flagging per instructions, not deciding.

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/first-sprint.md:1 | `# Your First Sprint` | user-visible (H1 heading) | run-text: `# Your First Run` | top-level page heading/anchor `#your-first-sprint` — flag anchor-stability + filename-rename compat concern together |
| docs/guide/first-sprint.md:3 | `> A detailed walkthrough of running your first Deckent sprint from start to finish.` | user-visible | run-text: `> A detailed walkthrough of running your first Deckent run from start to finish.` | cosmetic doc prose |
| docs/guide/first-sprint.md:11 | `A sprint is one cycle of AI-driven development. You write goals, Deckent's Brain plans and assigns tasks to worker agents, and each worker independently writes, tests, and documents code. At the end, Brain evaluates every result.` | user-visible | run-text: `A run is one cycle of AI-driven development. ...` | cosmetic doc prose — this is effectively the doc-level definition of the term, mirrors glossary.md entry |
| docs/guide/first-sprint.md:22 | `` # DIRECTIVES -- Sprint 1: Health Check + Config Page `` (example fenced code block content) | user-visible | run-text: `# DIRECTIVES -- Run 1: Health Check + Config Page` | example content inside a fenced code block shown to the reader as a DIRECTIVES.md template — this is illustrative prose, not a real identifier, safe to reword |
| docs/guide/first-sprint.md:70 | `` Sprint 001 -- 2 tasks planned `` (example CLI output block) | user-visible | run-text: `Run 001 -- 2 tasks planned` | example CLI output shown to reader — illustrative, safe to reword; NOTE if actual `deckent plan` CLI output format literally prints "Sprint NNN" this doc example must stay in sync with real output post-rename |
| docs/guide/first-sprint.md:84 | `## 3. Start the Sprint` | user-visible (heading) | run-text: `## 3. Start the Run` | heading/anchor `#3-start-the-sprint` — flag anchor-stability concern |
| docs/guide/first-sprint.md:97 | `**RETRO phase** -- Brain writes a retrospective to the memory DB, updates sprint learnings` | user-visible | run-text: `...updates run learnings` | cosmetic doc prose |
| docs/guide/first-sprint.md:99 | `**COMPLETE phase** -- Cleanup operations run (task files archived, file locks released); the sprint is marked complete` | user-visible | run-text: `...the run is marked complete` | cosmetic doc prose |
| docs/guide/first-sprint.md:124 | `` Sprint sprint-001 -- EXECUTE phase `` (example live-status output block) | user-visible | run-text: `Run run-001 -- EXECUTE phase` | example CLI output — illustrative; NOTE the literal ID pattern `sprint-001` mirrors the real sprint-id format used in `.deckent/<sprint-id>-events.jsonl` etc. — if the ID *format itself* changes (`sprint-NNN`→`run-NNN`) that's a real data-format/compat decision, not just doc prose, flag separately |
| docs/guide/first-sprint.md:139 | `When the sprint finishes:` | user-visible | run-text: `When the run finishes:` | cosmetic doc prose |
| docs/guide/first-sprint.md:146,154 | `` Sprint sprint-001 -- COMPLETE ... Sprint completed in 4m 32s `` (example output block, 2 lines) | user-visible | run-text: `Run run-001 -- COMPLETE ... Run completed in 4m 32s` | example CLI output — illustrative, same sprint-id-format flag as line 124 |
| docs/guide/first-sprint.md:196 | `Edit \`DIRECTIVES.md\` with your next goals and run another sprint:` | user-visible | run-text: `...and run another run:` — awkward "run another run" needs careful copy-editing (e.g. "kick off another run") | cosmetic doc prose; note potential awkward double-"run" phrasing once renamed, worth a copy pass |
| docs/guide/first-sprint.md:202 | `Brain remembers what it learned. Each sprint builds on the last -- memory persists, patterns are recognized, and debt is tracked.` | user-visible | run-text: `Each run builds on the last -- ...` | cosmetic doc prose |
| docs/guide/first-sprint.md:204,208,209 | `### Useful Commands Between Sprints` / `` `deckent status` \| Current sprint status `` / `` `deckent history` \| Past sprint summaries `` | user-visible (1 heading + 2 table cells) | run-text: `### Useful Commands Between Runs`, `Current run status`, `Past run summaries` | heading `#useful-commands-between-sprints` — flag anchor-stability concern; table-cell prose is cosmetic |
| docs/guide/first-sprint.md:226 | `Fix the underlying issue (often a missing dependency or unclear directive), update \`DIRECTIVES.md\`, and run the next sprint.` | user-visible | run-text: `...and run the next run.` (same awkward-phrasing note as line 196) | cosmetic doc prose |

---

### docs/guide/autonomous-operations.md — 15 total grep hits, covered by 12 table rows (9 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/autonomous-operations.md:12 | `> \`auto\`-policy entry will spawn a real worker (or sprint) that edits your repository.` | user-visible | run-text: `...(or run) that edits your repository.` | cosmetic doc prose |
| docs/guide/autonomous-operations.md:75 | `To set \`provider\`/\`model\`/\`kind: sprint\`/recurring schedules, edit the entry in` | frozen-identifier | n/a — keep literal config value `kind: sprint` (autonomous-policy schema enum), reword surrounding prose if desired | `kind: sprint` is a literal persisted autonomous-policy config enum value — frozen per task instructions, high compat risk |
| docs/guide/autonomous-operations.md:97 | `` (`task` → a worker; `sprint` → a full sprint) → audits → updates status. `` | mixed | n/a for the `sprint` enum-value in parens (config literal, same family as line 75); run-text for the prose "a full sprint" → "a full run" | `sprint` here (first occurrence, in backticks) is the same frozen `kind` enum value; the second, unquoted "a full sprint" is prose and reword-eligible |
| docs/guide/autonomous-operations.md:210 | `previously required an active sprint phase to fire; the \`observerActiveInAnyPhase\` flag bypasses` | user-visible | run-text: `...required an active run phase to fire; ...` | cosmetic doc prose (the flag name `observerActiveInAnyPhase` itself has no "sprint" in it) |
| docs/guide/autonomous-operations.md:211 | `that gate so detections actually flow inside the autonomous loop — no hosted sprint needed. This` | user-visible | run-text: `...no hosted run needed. This` | cosmetic doc prose |
| docs/guide/autonomous-operations.md:246 | `` - **\`auto\` spawns real work** — an \`auto\` \`task\` runs a worker; an \`auto\` \`sprint\` runs a full `` | frozen-identifier | n/a — keep literal enum value `` `sprint` `` (same `kind` config enum as lines 75/97) | same frozen config enum value, high compat risk |
| docs/guide/autonomous-operations.md:247 | `sprint that edits the repo. Prefer \`ollama\` (local, zero-cost) + small reversible scope for` | user-visible | run-text: `run that edits the repo. Prefer...` | cosmetic doc prose continuation of line 246 |
| docs/guide/autonomous-operations.md:291 | `Two read-only consumers over the live ENT-3 audit chain of a sprint:` | user-visible | run-text: `...audit chain of a run:` | cosmetic doc prose |
| docs/guide/autonomous-operations.md:296,297,300,304,314,315,319 | `` deckent audit compliance --sprint <id> # human-readable summary`` / `--sprint <id> --json` / `Builds a report over the sprint's audit events...` / `HMAC chain verification over the sprint's audit events` / `deckent audit forward --sprint <id> --url ...` / `--sprint <id> --out ...` / `Forwards the sprint's audit chain...` +N similar | mixed | n/a for `--sprint <id>` CLI flag occurrences (6 total across these lines); run-text for surrounding prose "Builds a report over the run's audit events", "HMAC chain verification over the run's audit events", "Forwards the run's audit chain" | `--sprint <id>` is a real CLI flag shown verbatim across multiple example commands — external contract, frozen per task instructions (same flag family noted in features.md); if the flag itself is renamed in code, ALL these doc occurrences must be updated together |

---

### docs/reference/event-channels.md — 11 total grep hits, covered by 10 table rows (8 individual + 2 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/event-channels.md:5 | `and stored in \`.deckent/<sprint-id>-events.jsonl\` (one JSON object per line, Protocol` | frozen-identifier | n/a — keep literal file-path pattern `.deckent/<sprint-id>-events.jsonl`, reword only if the actual on-disk file-naming convention changes (out of scope for doc-only pass) | real on-disk file-naming pattern — external/internal contract for anyone parsing event logs, high compat risk if the placeholder token itself is renamed without a matching code change |
| docs/reference/event-channels.md:9 | `Events can be queried by channel using \`readEvents(projectRoot, sprintId, { channel })\`.` | frozen-identifier | n/a — keep function signature `readEvents(projectRoot, sprintId, { channel })` param name `sprintId` | real function parameter name shown as API reference — frozen, external contract (function signature) |
| docs/reference/event-channels.md:46 | `` `BRAIN→*:SPRINT_PHASE_CHANGE` \| `CHANNELS.SPRINT_PHASE_CHANGE` \| Sprint lifecycle transitions between phases (...) `` | mixed | n/a for the literal channel-constant names `SPRINT_PHASE_CHANGE`/`CHANNELS.SPRINT_PHASE_CHANGE`; run-text for the description prose "Sprint lifecycle transitions" → "Run lifecycle transitions" | `SPRINT_PHASE_CHANGE` is a real event-channel constant name (enum-like) — external contract for anything consuming the event stream, frozen, high compat risk if renamed |
| docs/reference/event-channels.md:70 | `invocation with \`sprintId: 'autonomous'\` (events land in` | frozen-identifier | n/a — keep literal field+value `sprintId: 'autonomous'` | real field name + literal sentinel value in event payload — external contract, frozen, high compat risk |
| docs/reference/event-channels.md:85 | `` `AUDITOR→BRAIN:ORPHAN_HB_DETECTED` \| `CHANNELS.ORPHAN_HB_DETECTED` \| Auditor finds a stale heartbeat file from a previous sprint `` | user-visible | run-text: `...from a previous run` | cosmetic doc prose (channel constant names have no "sprint" in them here) |
| docs/reference/event-channels.md:94 | `` `AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED` \| ... \| Auditor reports a worker has exceeded the sprint-wide timeout cap `` | user-visible | run-text: `...has exceeded the run-wide timeout cap` | cosmetic doc prose |
| docs/reference/event-channels.md:112 | `Every event written to \`.deckent/<sprint-id>-events.jsonl\` conforms to \`DeckentEvent\`:` | frozen-identifier | n/a — keep literal file-path pattern (same as line 5) | same file-naming-pattern concern as line 5 |
| docs/reference/event-channels.md:117 | `  sequence: number;           // Monotonic per-sprint counter` | user-visible (code-comment prose) | run-text: `// Monotonic per-run counter` | this is a prose comment inside a TypeScript interface code block, not a field name itself — safe to reword; the field being commented (`sequence`) has no "sprint" in it |
| docs/reference/event-channels.md:138,146,149 | `Both surface events from the active sprint's \`.deckent/<sprint-id>-events.jsonl\` file as` / `so they do not crash the sprint.` / `within a sprint to prevent log spam on every wave tick.` +N similar | user-visible +1 frozen path pattern | run-text: "the active run's ... file", "so they do not crash the run.", "within a run to prevent log spam..."; n/a for the `.deckent/<sprint-id>-events.jsonl` path pattern on line 138 | line 138's file-path pattern is same frozen concern as lines 5/112; lines 146/149 are pure prose |

---

### docs/guide/architecture-overview.md — 10 total grep hits, covered by 10 table rows (all individual)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/architecture-overview.md:3 | `Deckent is organized as a multi-agent sprint orchestrator.` | user-visible | run-text: `Deckent is organized as a multi-agent run orchestrator.` | cosmetic doc prose |
| docs/guide/architecture-overview.md:7 | `\`orchestra/\` owns the sprint lifecycle and the Brain-facing control plane. ... completes cleanup across the PLAN -> SPAWN -> EXECUTE -> EVALUATE -> FIX -> RETRO -> DECAY -> CLEANUP lifecycle.` | user-visible | run-text: `\`orchestra/\` owns the run lifecycle and the Brain-facing control plane. ...` | cosmetic doc prose |
| docs/guide/architecture-overview.md:17 | `The worker entry point (\`worker.ts\`) was refactored in Sprint 144 from a 1 670-LoC god object...` | user-visible | run-text: historical numbered citation "in Run 144", flag per general note on renaming historical sprint-N mentions | cosmetic doc prose; historical numbered reference |
| docs/guide/architecture-overview.md:21 | `\`nervous/\` is the proactive meta-orchestrator described by ADR-040. It observes repository and sprint signals through detectors, ... without replacing the Brain's sprint authority.` | user-visible | run-text: `...observes repository and run signals through detectors, ... without replacing the Brain's run authority.` | cosmetic doc prose |
| docs/guide/architecture-overview.md:25 | `\`monitor/\` contains the Auditor and observability support. It runs scan loops, tracks sprint state, manages dashboard-facing status, ...` | user-visible | run-text: `...tracks run state, manages dashboard-facing status, ...` | cosmetic doc prose |
| docs/guide/architecture-overview.md:29 | `\`connectors/\` contains external messaging adapters ... maps bot messages to sprint commands, a connector pool for lifecycle management, ...` | user-visible | run-text: `...maps bot messages to run commands, ...` | cosmetic doc prose |
| docs/guide/architecture-overview.md:37 | `\`api/\` is the HTTP API layer. ... exposes REST and SSE endpoints for sprint lifecycle, status, memory, auth ... It also streams live sprint events to dashboard clients through Server-Sent Events.` | user-visible | run-text: `...REST and SSE endpoints for run lifecycle, ... It also streams live run events to dashboard clients ...` | cosmetic doc prose |
| docs/guide/architecture-overview.md:45 | `\`mcp/\` exposes Deckent to MCP clients through stdio transport. It registers the canonical tool and resource surface, including sprint lifecycle commands, memory query, status, docs, audit, recovery, and nervous-system operations.` | user-visible | run-text: `...including run lifecycle commands, ...` | cosmetic doc prose |
| docs/guide/architecture-overview.md:49 | `\`dashboard/\` is the React, Vite, and Tailwind web interface ... It consumes backend status and control APIs to show sprint state, worker activity, logs, chat/control flows, analytics, ...` | user-visible | run-text: `...to show run state, worker activity, logs, ...` | cosmetic doc prose |
| docs/guide/architecture-overview.md:53 | `ADR-008 keeps orchestration dependencies one-way: Brain, implemented through \`sprint-controller\`, is the only orchestrator importing tmux, auditor, and worker execution modules. ...` | frozen-identifier | n/a — keep module reference `sprint-controller`, reword surrounding prose only if desired | reference to real source module (`sprint-controller.ts`) — frozen |

---

### docs/guide/multi-provider-fleet.md — 8 total grep hits, covered by 8 table rows (all individual)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/multi-provider-fleet.md:3 | `> Run tasks on different AI providers **simultaneously** within a single sprint — ollama/codex/gemini on the host, claude in the configured backend, all in parallel.` | user-visible | run-text: `> Run tasks on different AI providers **simultaneously** within a single run — ...` (note: word "Run" already appears as a verb here — careful phrasing when both meanings collide) | cosmetic doc prose; flag potential "Run tasks... within a single run" awkward double-use, needs copy pass |
| docs/guide/multi-provider-fleet.md:9 | `Deckent's mixed-fleet capability lets you assign each task in a sprint to a different AI provider. ... All groups execute concurrently within the same wave, so a sprint can have an ollama worker and a claude worker running at the exact same time.` | user-visible | run-text: `...assign each task in a run to a different AI provider. ... so a run can have an ollama worker and a claude worker running at the exact same time.` | cosmetic doc prose |
| docs/guide/multi-provider-fleet.md:15 | `The sprint spawner (\`src/orchestra/sprint-spawner.ts\`) applies a two-path routing decision for each task, based on \`isAdapterProvider()\` (\`src/orchestra/sprint-utils.ts\`):` | mixed | run-text for "The run spawner" prose label; n/a for the actual filenames `sprint-spawner.ts`/`sprint-utils.ts` | filenames are real source files — frozen; the descriptive label "sprint spawner" (English common-noun phrase referring to the module) is reword-eligible prose |
| docs/guide/multi-provider-fleet.md:74 | `The following snippet shows a sprint where an ollama worker and a claude worker run in **parallel** — a real mixed-fleet sprint. Tasks share no file dependencies, so they are placed in the same wave and execute simultaneously.` | user-visible | run-text: `The following snippet shows a run where ... — a real mixed-fleet run.` | cosmetic doc prose |
| docs/guide/multi-provider-fleet.md:77 | `` # DIRECTIVES — Sprint NNN: Mixed-Fleet Demo `` (example fenced code block) | user-visible | run-text: `# DIRECTIVES — Run NNN: Mixed-Fleet Demo` | example DIRECTIVES.md content shown to reader — illustrative, safe to reword |
| docs/guide/multi-provider-fleet.md:108 | `When Brain plans this sprint, both tasks land in Wave 1 (no inter-task dependencies). The spawner dispatches them in the same wave:` | user-visible | run-text: `When Brain plans this run, ...` | cosmetic doc prose |
| docs/guide/multi-provider-fleet.md:150 | `Tasks with different providers and no shared file dependencies run in the **same wave, simultaneously** — a true mixed-fleet sprint.` | user-visible | run-text: `...— a true mixed-fleet run.` | cosmetic doc prose |
| docs/guide/multi-provider-fleet.md:151 | `Sprint 236 is the first live proof: \`ollama/qwen3.6:27b\` (Task 1) and \`claude/sonnet\` (Task 2) ran in parallel in a single sprint, each routed through its respective path.` | user-visible | run-text: historical numbered citation "Run 236 is the first live proof..." (flag decision) + "...ran in parallel in a single run, ..." | cosmetic doc prose; historical numbered reference for "Sprint 236" |

---

### docs/guide/feature-matrix.md — 7 total grep hits, covered by 6 table rows (5 individual + 1 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/feature-matrix.md:9 | `` \| Plan a sprint \| ✅ \| ✅ \| ✅ \| CLI `deckent plan`; MCP `deckent_plan`; Dashboard `NewSprintModal` calls `/api/plan`. \| `` | mixed | run-text for the row label "Plan a run"; n/a for the React component name `NewSprintModal` and the `deckent plan`/`deckent_plan` command names (unaffected, no "sprint" substring anyway) | `NewSprintModal` is a real dashboard component name — frozen (code identifier), flag if dashboard components are in-scope for a broader rename elsewhere |
| docs/guide/feature-matrix.md:10 | `` \| Start a sprint \| ✅ \| ✅ \| ✅ \| CLI `deckent start`; MCP `deckent_start`; Dashboard `NewSprintModal` calls `/api/start`. \| `` | mixed | run-text for row label "Start a run"; n/a for `NewSprintModal` | same `NewSprintModal` component-name concern as line 9 |
| docs/guide/feature-matrix.md:11 | `` \| Check sprint status \| ✅ \| ✅ \| ✅ \| CLI `deckent status`; MCP `deckent_status`; Dashboard `/status` page and main dashboard use `/api/status`. \| `` | user-visible | run-text: `Check run status` | cosmetic doc prose (row label) |
| docs/guide/feature-matrix.md:12 | `` \| Watch live sprint activity \| ✅ \| ✅ \| ✅ \| CLI `deckent watch` and `deckent status --watch`; MCP `deckent_watch`; Dashboard Status page uses SSE from `/api/events`. \| `` | user-visible | run-text: `Watch live run activity` | cosmetic doc prose (row label) |
| docs/guide/feature-matrix.md:13 | `` \| Review sprint results \| ✅ \| ✅ \| — \| CLI `deckent review`; MCP `deckent_review`. No direct dashboard sprint-review route was confirmed. \| `` | user-visible | run-text: `Review run results ... No direct dashboard run-review route was confirmed.` | cosmetic doc prose |
| docs/guide/feature-matrix.md:18,21 | `` \| Audit compliance & SIEM export \| ... CLI `deckent audit compliance --sprint <id>` ... and `deckent audit forward --sprint <id> --out <path>` ... \| \| Configure Deckent \| ... Dashboard Config page exposes sprint, memory, routing, provider, and related settings. \| `` +N similar | mixed | n/a for `--sprint <id>` CLI flag (line 18, ×2 occurrences); run-text for line 21's "exposes sprint, memory, routing..." → "exposes run, memory, routing..." | `--sprint <id>` is the same frozen CLI flag noted elsewhere (external contract); line 21's "sprint" is a plain prose noun referring to config category, safe to reword |

---

### docs/glossary.md — 6 total grep hits, covered by 6 table rows (all individual)

**FILE-LEVEL FLAG:** This file contains the formal glossary term definition for "Sprint" (line 8, table-row format `| **Sprint** | ... |` — NOT a markdown heading, so there is no dedicated `#sprint` heading-anchor to worry about; it's a row inside a single table under `# Deckent Glossary`). Since it's a table cell bolded term rather than a `## Sprint` heading, there is no existing per-term anchor ID to break — but if any other doc deep-links to this specific row via a manually-added `id="sprint"` or similar, that would need checking (none found in this scan). Structurally important as the canonical definition other docs' prose implicitly follows.

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/glossary.md:5 | `` \| **Brain** \| The central orchestrator that plans tasks, assigns models, evaluates results, and learns across sprints via SQLite memory. \| `` | user-visible | run-text: `...and learns across runs via SQLite memory.` | cosmetic doc prose |
| docs/glossary.md:8 | `` \| **Sprint** \| A structured eight-phase lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. \| `` | user-visible (glossary term definition) | run-text: rename term to `**Run**` and update definition row: `\| **Run** \| A structured eight-phase lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. \|` | this is the canonical glossary entry for the term being renamed — high visibility change; no markdown heading-anchor exists for this row (it's a table cell, not a `## Sprint` heading) so no anchor-redirect is needed, but any OTHER doc that says "see Sprint in the glossary" (prose cross-reference, not a link) should be checked separately outside this file's scope |
| docs/glossary.md:9 | `` \| **Wave** \| A dependency-ordered batch of tasks that execute in parallel within a sprint. ... `` | user-visible | run-text: `...that execute in parallel within a run. ...` | cosmetic doc prose |
| docs/glossary.md:12 | `` \| **Nervous** \| ... Continuously observes sprint state, detects anomalies ... `` | user-visible | run-text: `...Continuously observes run state, detects anomalies ...` | cosmetic doc prose |
| docs/glossary.md:13 | `` \| **DIRECTIVES** \| The markdown file where users declare sprint goals and task specifications before execution begins. \| `` | user-visible | run-text: `...where users declare run goals and task specifications before execution begins.` | cosmetic doc prose |
| docs/glossary.md:18 | `` \| **ADR** \| Architecture Decision Record — a documented, versioned design choice stored in the memory database and enforced across sprints. \| `` | user-visible | run-text: `...enforced across runs.` | cosmetic doc prose |

---

### docs/reference/openrouter-free-models.md — 4 total grep hits, covered by 4 table rows (all individual)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/openrouter-free-models.md:53 | `worker or automated sprint task is authorized to invent free-model entries` | user-visible | run-text: `worker or automated run task is authorized to invent free-model entries` | cosmetic doc prose |
| docs/reference/openrouter-free-models.md:65 | `inside a sprint/worker (workers do not have, and must not use, unrestricted` | user-visible | run-text: `inside a run/worker (workers do not have, and must not use, unrestricted` | cosmetic doc prose |
| docs/reference/openrouter-free-models.md:135 | `- **Sprint cost reports** — a \`$0\` line item is still a line item; silently` | user-visible (bold lead-in phrase) | run-text: `- **Run cost reports** — a \`$0\` line item is still a line item; silently` | cosmetic doc prose |
| docs/reference/openrouter-free-models.md:136 | `omitting free-model usage from reports would make sprint cost summaries` | user-visible | run-text: `...would make run cost summaries` | cosmetic doc prose |

---

### docs/guide/terminal.md — 3 total grep hits, covered by 3 table rows (all individual)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/terminal.md:59 | `\`deckent\` kind sessions are **exempt from the idle reaper** — a long-running sprint will not be killed due to inactivity. Other kinds (\`claude\`, \`shell\`, etc.) are reaped after \`idleTimeoutMs\` of inactivity.` | user-visible | run-text: `...a long-running run will not be killed due to inactivity. ...` | cosmetic doc prose |
| docs/guide/terminal.md:87 | `The global API auth bypass (\`DECKENT_API_AUTH_DISABLED=1\`) is a read-only dashboard development convenience. It has **no effect on terminal authentication**. The terminal enforces its own token even when the bypass is active — a convenience flag for reading sprint status must never silently open a remote shell.` | user-visible | run-text: `...a convenience flag for reading run status must never silently open a remote shell.` | cosmetic doc prose |
| docs/guide/terminal.md:89 | `This aligns with B-022 (security finding from Sprint 171 audit).` | user-visible | run-text: historical numbered citation "from Run 171 audit" (flag decision, see general note) | cosmetic doc prose; historical numbered reference |

---

### docs/reference/skills.md — 1 total grep hit, covered by 1 table row (individual)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/skills.md:181 | `    "lastUsedInSprint": ""` (example JSON field in a skill-manifest/stats snippet) | frozen-identifier | n/a — keep JSON field name `lastUsedInSprint` as shown in the example; reword surrounding prose (if any exists elsewhere in this file describing the field) if desired | real persisted JSON field name in skill-usage stats schema — external contract, high compat risk if renamed without a matching code/data migration |

---

## Cross-cutting notes for the rename effort

1. **Frozen CLI flag `--sprint <id>`** recurs across `features.md`, `autonomous-operations.md`, and `feature-matrix.md` (used by `deckent audit compliance`/`deckent audit forward`). This is the single most-repeated frozen identifier across the doc set — if code renames this flag, every doc occurrence must be updated together in lockstep, not just the surrounding prose.

2. **Frozen config/JSON field names** appearing more than once: `sprintId` (event-channels.md, mcp-tools.md, migration-guide.md), `sprint_id`/`last_sprint_id` (config.md), `sprint_max_usd`/`cost_limits.sprint_max_usd` (mcp-tools.md), `deckent_style: 'sprint'` enum (config.md), `kind: sprint` enum (autonomous-operations.md), `memory.export_trigger: 'sprint_end'` enum (config.md), `lastUsedInSprint` (skills.md). None of these should be touched by a doc-only prose pass; a code-level schema-migration decision is required first.

3. **Historical numbered citations** ("Sprint 150", "Sprint 271", "v0.1.0-sprint21", etc.) appear heavily in config.md, features.md, migration-guide.md, architecture-overview.md, multi-provider-fleet.md, terminal.md. These are changelog-style provenance markers. Two sub-cases:
   - Plain prose citations like "(Sprint 271)" — safe to reword to "(Run 271)" if the team wants full terminology consistency, OR could be left as immutable historical record — **flagging for Alperen's decision, not deciding here**.
   - Literal published npm version tags like `v0.1.0-sprint21` (migration-guide.md lines 467-487) — these are **frozen**, cannot be retconned since they refer to actually-published package versions.

4. **Filename rename candidate**: `docs/guide/first-sprint.md` → `first-run.md`, flagged with redirect/compat concern (external links to the guide page).

5. **Heading anchors that would break** if headings are reworded: `docs/reference/config.md` `## Sprint Lifecycle` (`#sprint-lifecycle`) and `## Nervous System (Sprint 147+)` (`#nervous-system-sprint-147`); `docs/guide/first-sprint.md` `# Your First Sprint` (`#your-first-sprint`), `## 3. Start the Sprint` (`#3-start-the-sprint`), `### Useful Commands Between Sprints` (`#useful-commands-between-sprints`). All need redirect stubs or an accepted-breakage decision if any external doc/README links to these anchors.

6. **`docs/glossary.md` "Sprint" entry** (line 8) is a table-row definition, not a `## Sprint` heading — so no dedicated heading-anchor exists to redirect; the rename is lower-risk from a link-breakage standpoint than the flagged first-sprint.md headings above.
I have sufficient context for all files now. Let me compile the full findings.

---

# Sprint → Run Rename Inventory (Documentation)

**Total across all 16 files: 340 grep hits.**

---

### docs/reference/cli-commands.md — 96 total grep hits, covered by 22 table rows (10 individual + 12 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/cli-commands.md:3 | `Complete inventory of all Deckent CLI commands. Last updated Sprint 346.` | user-visible | run-text: "Complete inventory of all Deckent CLI commands. Last updated Run 346." | cosmetic doc prose, no compat concern |
| docs/reference/cli-commands.md:11,12,13,17,18,21,33,36,37,38,39,48,54,63,67 (15 occurrences) | `Start a new sprint` / `Plan sprint without executing` / `Show current sprint dashboard` / `Show sprint retrospective` / `Clean up after a sprint` / `Show sprint history` / `Run a test sprint (no retro)` / `Review sprint tasks with evaluations` / `Finalize a sprint (update MEMORY)` / `Explain what the last sprint did` / `Write sprint goals to DIRECTIVES.md` / `Resume sprint from checkpoint` / `Recover from crashed/stuck sprint` / `Evolution analysis — cross-sprint trends...` / `Show the KPI scorecard for the current or a specific sprint` | user-visible | run-text: reword each "Description" column cell, e.g. "Start a new run" / "Plan run without executing" / "Show current run dashboard" / "Show run retrospective" / "Clean up after a run" / "Show run history" / "Run a test run (no retro)" / "Review run tasks with evaluations" / "Finalize a run (update MEMORY)" / "Explain what the last run did" / "Write run goals to DIRECTIVES.md" / "Resume run from checkpoint" / "Recover from crashed/stuck run" / "Evolution analysis — cross-run trends..." / "Show the KPI scorecard for the current or a specific run" | cosmetic doc prose (Quick Reference table describes real CLI commands, but the command NAMEs — `start`, `plan`, `status`, `retro`, `cleanup`, `history`, `test`, `review`, `finalize`, `explain`, `set-directives`, `resume`, `recover`, `evolve`, `kpi` — are unaffected by this rename and stay as-is; only the description prose changes) |
| docs/reference/cli-commands.md:145 | `## Sprint Workflow` | user-visible (heading) | run-text: "## Run Workflow" | markdown heading — check for inbound anchor links (`#sprint-workflow`) from other docs/README before renaming |
| docs/reference/cli-commands.md:149,156,158,159,175,198,203,239,258,279,297,319,363,368,371,385,389,397,407,414,453,488,501,507,513,522,534,542-548,581,592,594,595,603,664,730,852,861,871,892,899,902,908,917,921,923,931,990,1042,1048,1053,1101,1190,1273,1278,1304,1345,1355,1429,1435,1442,1452,1458,1529,1533,1534,1535,1541,1587,1736 (~70 occurrences) | e.g. `Plan a sprint without executing it.` / `Run a test sprint (no retro, no memory update, no decay).` / `Finalize a sprint: upsert the sprint's \`retro\` and \`memory\` entries...` / `Show the current sprint dashboard.` / `deckent usage --sprint 273             # Sprint 273 per-task breakdown` / `Search project memory — ADRs, sprint learnings, patterns, debt.` / `deckent evolve report --sprints 20` / `deckent chat --message "List recent sprints" --once` / `_Updated: 2026-06-28 \| Sprint 346 \| Deckent v1.0.0-beta.1_` | user-visible | run-text: repeated pattern — reword all command-description prose, section intros, and CLI example command comments throughout the per-command reference sections (lines 149–1736) from "sprint" to "run" (e.g. "Plan a run without executing it.", "Run a test run (no retro, no memory update, no decay).", "Finalize a run: upsert the run's `retro` and `memory` entries...", "deckent usage --run 273 # Run 273 per-task breakdown", "Search project memory — ADRs, run learnings, patterns, debt.") | cosmetic doc prose describing the real CLI surface; the flag/option NAMEs (`--sprint <id>`, `--sprint-id <sprintId>`, `--sprint-min <n>`, `--sprints <n>`) are documented HERE as the real contract — see next rows for frozen-identifier treatment of those specific tokens |
| docs/reference/cli-commands.md:224,232,542-548,603,861,908,931,1053,1278,1345,1442,1541 (13 occurrences) | `--sprint <id>` / `--sprint sprint-151` / `deckent audit --sprint sprint-264` / `deckent usage --sprint 273` / `deckent recall ... --sprint-min 140` / `deckent mode global sprint` / `deckent evolve report --sprints 20` / `deckent archive-debt --before sprint-140` / `deckent rbac check admin sprint.start` / `/usage --sprint 275` / `deckent kpi --sprint sprint-340` | frozen-identifier | n/a — keep identifier, reword surrounding prose only (if the actual CLI flag itself is renamed `--sprint`→`--run` as part of the broader rename effort, that is a SEPARATE code-level decision outside this doc-only scan; this table only inventories doc text) | **real external contract** — `--sprint <id>`, `--sprint-id`, `--sprint-min`, `--sprints`, `sprint.start` (RBAC permission string), and literal `sprint-NNN` ID format are the actual `deckent` CLI flags/permission strings documented here; renaming these is a breaking CLI change requiring its own migration plan, not a doc-only edit |
| docs/reference/cli-commands.md:220,224,232 | `Finalize a sprint: upsert the sprint's \`retro\` and \`memory\` entries in \`memory.db\`...` / `--sprint <id>` \| `Specific sprint ID to finalize (e.g. sprint-063)` / `deckent finalize --sprint sprint-151 --skip-decay` | mixed (prose user-visible; `--sprint` flag + `sprint-063`/`sprint-151` IDs frozen) | run-text: "Finalize a run: upsert the run's `retro` and `memory` entries..." / "Specific run ID to finalize (e.g. run-063)" for prose; flag name `--sprint` stays | flag `--sprint` and its example values are the real CLI contract; only descriptive text changes |
| docs/reference/cli-commands.md:892,899,902,908 | `Get/set deckent_style (sprint \| task \| auto).` / `mode sprint` \| `Switch to sprint mode` / `mode global` \| `Set global default (sprint\|task)` / `deckent mode global sprint` | frozen-identifier + user-visible mix | n/a for the literal `sprint` mode-value token (it's a config enum value `deckent_style: sprint\|task\|auto`) — reword surrounding descriptive text only, e.g. "Switch to run mode" | **real config/CLI contract** — `sprint` is a literal enum value for `deckent_style` / `deckent mode` command; renaming this value is a breaking config change, flag for separate code-level decision |
| docs/reference/cli-commands.md:1587 | `\| \`--kind <kind>\` \| Execution kind: task (default), sprint, capability \|` | frozen-identifier | n/a — keep identifier (`sprint` is a literal `kind` enum value), reword surrounding prose only | real CLI/config contract — `kind: sprint` is a literal enum value used in flow/autonomous entries |
| docs/reference/cli-commands.md:1190 | `\| \`--kind <kind>\` \| Entry kind: \`task\` (default), \`sprint\`, or \`capability\` \|` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | same `kind` enum contract as above |

---

### docs/reference/performance.md — 55 total grep hits, covered by 18 table rows (9 individual + 9 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/performance.md:4 | `Last updated: Sprint 099 (2026-04-06)` | user-visible | run-text: "Last updated: Run 099 (2026-04-06)" | cosmetic doc prose, no compat concern |
| docs/reference/performance.md:12 | `3. [Sprint Size Optimization](#3-sprint-size-optimization)` | user-visible (TOC + anchor) | run-text: "3. [Run Size Optimization](#3-run-size-optimization)" | markdown anchor `#3-sprint-size-optimization` — TOC link targets heading at line 219; must rename in lockstep or add a compat anchor if externally linked |
| docs/reference/performance.md:219,221,223,225 | `## 3. Sprint Size Optimization` / `Sprint size is the number of tasks in a single sprint...` / `### 3.1 Sprint Size vs. Quality Trade-off` / `\| Sprint Size \| Workers Needed \| Token Cost \| Risk \|` | user-visible (headings + table header + prose) | run-text: "## 3. Run Size Optimization", "Run size is the number of tasks in a single run...", "### 3.1 Run Size vs. Quality Trade-off", "\| Run Size \| Workers Needed \| Token Cost \| Risk \|" | headings generate anchors (`#3-sprint-size-optimization`, `#31-sprint-size-vs-quality-trade-off`) referenced by TOC line 12 — rename together |
| docs/reference/performance.md:598,600 | `### Sprint Size Quick Reference` / `\| Situation \| Recommended Sprint Size \|` | user-visible (heading + table header) | run-text: "### Run Size Quick Reference", "\| Situation \| Recommended Run Size \|" | heading anchor `#sprint-size-quick-reference` — check inbound links |
| docs/reference/performance.md:20,72,77,80,100,133,207,234,243,257,274,279,281,296,304,305,308,328,339,340,341,347,352,355,361,371,372,385,392,400,402,408,410,414,434,466,467,506,541,542,547,549,553,603,604,605,652 (~46 occurrences) | e.g. `Workers are tmux windows running Claude agents in parallel. More workers = faster sprint execution...` / `Sprints have many independent tasks (no cross-task dependencies)` / `Brain plans sprint (brain_model)` / `When a sprint has more tasks than \`max_workers\`, Deckent uses a wave approach:` / `A sprint of 8 Sonnet tasks ≈ $0.24. A sprint of 8 Opus tasks ≈ $1.20.` / `# Check sprint estimate before running` / `cat .brain/sprints/sprint-NNN.md` / `\| Standard feature sprint \| 4–8 tasks \|` | user-visible | run-text: repeated pattern — reword all body-prose occurrences of "sprint(s)" throughout sections 1–5 (worker sizing guidance, memory/decay guidance, cost estimation, troubleshooting checklist) to "run(s)", e.g. "More workers = faster run execution", "Runs have many independent tasks...", "Brain plans run (brain_model)", "When a run has more tasks than `max_workers`...", "A run of 8 Sonnet tasks ≈ $0.24.", "# Check run estimate before running" | cosmetic doc prose; one item (`cat .brain/sprints/sprint-NNN.md` at line 542) references a real file-path pattern — see frozen-identifier row below |
| docs/reference/performance.md:305,339,363,371,467,541,542 | `.brain/sprints/sprint-NNN.md` (file path shown in prose/code, e.g. "`.brain/sprints/sprint-NNN.md`: Brain reads last 2" and `cat .brain/sprints/sprint-NNN.md`) | frozen-identifier | n/a — keep the literal directory/file-name pattern `.brain/sprints/sprint-NNN.md`, reword surrounding prose only | real internal file path (`.brain/sprints/`) — renaming this is a source-code/data-layout change, not doc-only; flag for coordination with the actual sprint-log file-naming code |
| docs/reference/performance.md:296,308,328,347,352 | `memory.decay_after_sprints` (config key, appears repeatedly in prose and one JSON-ish reference) | frozen-identifier | n/a — keep config key `decay_after_sprints`, reword surrounding prose ("...degrades run planning quality...") | real config field name (`.deckent/config.json` → `memory.decay_after_sprints`) — renaming is a breaking config schema change, separate from doc rename |
| docs/reference/performance.md:385,652 | `"budget_per_sprint": 5.0,` / `"budget_per_sprint": 2.00,` (JSON config example) | frozen-identifier | n/a — keep config key `budget_per_sprint`, reword surrounding prose ("Set `budget_per_sprint` conservatively — an interrupted run is worse than a smaller one.") | real config field name — same as above, breaking schema change if renamed |
| docs/reference/performance.md:361 | `# Trigger memory decay (respects decay_after_sprints config)` | frozen-identifier (comment referencing config key) + user-visible comment prose | run-text: "# Trigger memory decay (respects decay_after_sprints config)" — keep key name, comment prose itself is minimal | same config key as above |

---

### docs/reference/api-examples.md — 42 total grep hits, covered by 16 table rows (9 individual + 7 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/api-examples.md:83 | `Returns the current \`DashboardState\` JSON — sprint phase, worker agents, progress counters, alerts, and usage metrics. Returns an idle response (not 404) when no sprint is active.` | user-visible | run-text: "Returns the current `DashboardState` JSON — run phase, worker agents, progress counters, alerts, and usage metrics. Returns an idle response (not 404) when no run is active." | `sprint` field name inside `DashboardState` JSON is a real API contract — see frozen row below |
| docs/reference/api-examples.md:93,94,132,161,251,279,334,336,411,467 (10 occurrences) | `"sprint": { "id": "sprint-025", ... }` / `"id": "sprint-024"` / `{ "sprint": "sprint-001", ... }` / `"content": "... \| Sprint \| Resolved \|\n...\| sprint-003 \| false \|\n"` / `"result": { "id": "sprint-025", ... }` / `data: {"sprint":{"id":"sprint-025",...}}` / `"id": "sprint-025"` (POST /api/plan response) / `"content": "# DIRECTIVES — Sprint 26\n\n## Task 1: ..."` | mixed — JSON field names + literal IDs (frozen) vs. embedded markdown prose "Sprint 26" (user-visible) | n/a for `"sprint"` JSON key and `"sprint-NNN"` ID values — real API response shape; run-text: for the embedded DIRECTIVES markdown content example, reword to `"# DIRECTIVES — Run 26\n\n## Task 1: ..."` and the debt-table header `\| Sprint \| Resolved \|` if it's meant as human-readable table text (though it mirrors a DB column, see debt-manager row) | **real HTTP API response contract** (`GET /api/status`, `GET /api/sprint`, `GET /api/history`, `POST /api/start`, SSE stream, `POST /api/plan`) — the JSON field `sprint` and ID format `sprint-NNN` are documented, external, versioned API surface; renaming requires an API versioning/migration decision, not a doc-only edit |
| docs/reference/api-examples.md:120,122,125,151 | `### \`GET /api/sprint\`` / `Returns the latest sprint log with metrics and task list.` / `curl http://localhost:3100/api/sprint ...` / `Returns an array of all sprint log summaries, oldest to newest.` | mixed — endpoint path frozen (real route), heading is the route name itself, prose is user-visible | run-text: prose → "Returns the latest run log with metrics and task list.", "Returns an array of all run log summaries, oldest to newest."; heading/route stays `GET /api/sprint` unless the API route itself is renamed (separate decision) | endpoint path `/api/sprint` is a real HTTP route (`src/api/server.ts`) — renaming is an API-surface change; heading mirrors the route literally so it's tied to that decision |
| docs/reference/api-examples.md:259 | `Polls the status of a background sprint job started via \`POST /api/start\`.` | user-visible | run-text: "Polls the status of a background run job started via `POST /api/start`." | cosmetic prose; route name unaffected |
| docs/reference/api-examples.md:349,352,358,375,378,386 | `Starts a full sprint in the background. Returns a \`jobId\` immediately (HTTP 202).` / `# Start sprint (workers require manual approval)` / `# Start sprint with auto-approved workers...` / `**Conflict (409) — sprint already running:**` / `"error": "Sprint already running"` / `Generates a sprint plan synchronously from \`DIRECTIVES.md\`. Returns the planned \`Sprint\` object.` | mixed — prose user-visible; `"error": "Sprint already running"` is a literal API error-message string (frozen unless API contract itself changes) | run-text: reword prose ("Starts a full run in the background...", "# Start run (workers require manual approval)", "**Conflict (409) — run already running:**", "Generates a run plan synchronously from `DIRECTIVES.md`. Returns the planned `Run` object."); for the literal error string `"Sprint already running"`, flag as API contract | the literal JSON error message `"error": "Sprint already running"` returned by `POST /api/start` is a real API response string — renaming it is a breaking API change for any client string-matching on it, not doc-only |
| docs/reference/api-examples.md:541,555,564,565,573,576,581,590,596,609,617,618,620,630,640,659,879,927,931 (19 occurrences) | `sprint: { id: string; number: number; phase: string; status: string };` (TS interface field) / `console.log(\`Sprint ${state.sprint.id} — phase: ${state.sprint.phase}\`);` / `interface SprintSummary { sprint: string; ... }` / `async function startSprint(...)` / `if (res.status === 409) throw new Error('Sprint already running');` / `console.log(\`Sprint started, jobId: ${jobId}\`);` / `async function planSprint(...)` / `\| \`409\` \| Conflict — sprint already running \|` / `console.log('No active sprint yet');` | mixed — TS interface field names + function names (frozen, mirror real API/SDK shape) vs. `console.log` string literals and prose (user-visible sample-code text) | run-text: for `console.log` sample output strings and prose comments, reword to "Run ${state.sprint.id}...", "Run started, jobId:...", "No active run yet"; for TS interface field `sprint`, function names `startSprint`/`planSprint`/`SprintSummary` — n/a, these mirror the real API JSON shape and MCP naming, keep unless API itself is renamed | interface fields (`sprint`, `SprintSummary`) directly mirror the documented HTTP API response shape (see api-surface.md row) — this is example/SDK code showing real contract usage; sample function names (`startSprint`, `planSprint`) are illustrative (not part of any published SDK) so COULD be renamed to `startRun`/`planRun` for consistency, but doing so is a docs-example choice, not a contract break |

---

### docs/reference/api-surface.md — 30 total grep hits, covered by 15 table rows (8 individual + 7 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/api-surface.md:186 | `"sprintId": "sprint-NNN",` | frozen-identifier | n/a — keep JSON field name `sprintId` and ID format, reword surrounding prose only | real Task JSON field (`src/core/task-types.ts` shape) — documented, internal-but-stable schema; renaming is a source-level breaking change |
| docs/reference/api-surface.md:205,206,207,209,231 | `"backend": "... Sprint 252)"` / `"modelEffort": "... Sprint 252 F1-RE)"` / `"fixMode": "... Sprint 196 FIX-phase strategy)"` / `"actor": "... Sprint 196 task actor context)"` / `"feedbackLoop": "... Sprint 165+)"` | user-visible (inline schema-doc comments citing sprint numbers as historical markers) | run-text: these are historical "introduced in Sprint N" annotations — could stay as historical sprint-number references (they denote a point-in-time project milestone, not the "sprint" concept being renamed) OR be left as-is; if renaming, "Sprint 252" → "Run 252" only if the sprint-numbering scheme itself is renamed | these are versioning/changelog-style annotations tied to the project's internal sprint-numbering history — judgment call: renaming affects historical accuracy, not user-facing terminology; recommend keeping numeric sprint-N citations as a historical ID scheme unless the numbering itself is renamed project-wide |
| docs/reference/api-surface.md:269,277,286 | `Deprecated since Sprint 146.` / `...Workers can populate this array with structured notes to share with other workers in the same sprint.` / `When the sprint controller creates a handoff...` | mixed — "Deprecated since Sprint 146" is historical marker (see note above); "in the same sprint" / "sprint controller" are user-visible prose | run-text: "...to share with other workers in the same run." / "When the run controller creates a handoff..."; keep "Deprecated since Sprint 146" as historical marker | "sprint controller" prose describes the internal module now called `sprint-controller.ts` (see gotcha below) — renaming prose without renaming the module creates terminology drift; flag for coordination |
| docs/reference/api-surface.md:298,300 | `## Sprint Phases` / `Sprint lifecycle phases — canonical values from \`SprintPhase\` enum (\`src/core/sprint-types.ts\`):` | mixed — heading + prose user-visible; `SprintPhase` enum name and `src/core/sprint-types.ts` path frozen | run-text: "## Run Phases", "Run lifecycle phases — canonical values from `SprintPhase` enum (`src/core/sprint-types.ts`):" (keep the actual TS symbol name as-is since renaming it is a source change) | heading anchor `#sprint-phases` — check inbound links; enum name `SprintPhase` and file path are real source-code identifiers, out of doc-only scope |
| docs/reference/api-surface.md:311,313 | `**COMPLETE** — Sprint complete; task files archived, locks released` / `> **Note:** \`WAVE_BUILD\` is a logical sub-phase within SPAWN... \`CLEANUP\` is not a \`SprintPhase\` enum value...` | user-visible | run-text: "**COMPLETE** — Run complete; task files archived, locks released"; reword surrounding note prose to "run" where it's descriptive (keep `SprintPhase` enum name itself) | enum name `SprintPhase` frozen; descriptive text changes |
| docs/reference/api-surface.md:330,336,351,360,363 | `\`exports/memory.md\`: Auto-generated sprint learnings` / `-- entries: main knowledge table (ADR, memory, sprint, debt, pattern, retro, identity)` / `sprint_range: { min: 135 },        // filter by sprint number` / `\`archive/pre-v2/MEMORY.md\`: Original sprint learnings (backup)` / `\`sprints/sprint-NNN.md\`: Sprint logs (in DB + file)` | mixed — prose user-visible; `sprint` as a DB `type` enum value and `sprint_range` query-param key, and `sprints/sprint-NNN.md` file path are frozen identifiers | run-text: "Auto-generated run learnings", "Original run learnings (backup)", "Run logs (in DB + file)" for prose; n/a for the DB `type='sprint'` enum value, `sprint_range` query key, and `sprints/sprint-NNN.md` path | `type='sprint'` memory-DB row type, `sprint_range` MemoryStore query param, and the `.brain/sprints/` directory/file-naming convention are real internal-but-stable data-layer contracts — renaming is a source/schema change, not doc-only |
| docs/reference/api-surface.md:362 | `\`PROJECT-IDENTITY.md\`: **Removed** — deprecated since Sprint 166 (ADR-046)...` | user-visible (historical marker, same class as line 269) | run-text: keep "since Sprint 166" as historical numbering; no change needed | historical ADR reference, not a rename target |
| docs/reference/api-surface.md:37,64,78,110,126,183,185,190,197,204,210,237,254,316,393,420,423,451,480,486,488,540,641,646,677 (25 occurrences) | e.g. `Controls capability enforcement for worker-spawned tasks (sprint workers).` / `Sprint worker-spawn uses the \`enforce_rbac\` path...` / `readAuditEvents(projectRoot, sprintId): AuditEventPayload[]` / `deckent audit compliance --sprint sprint-262 [--json] [--lang en\|tr]` / `Sprint 265 closed the long-standing "JWKS fetch..."` / `\`"kind": "task \| sprint \| capability \| process",\`` / `Brain (sprint-controller) is the ONLY module that imports from tmux, auditor, worker` / `## Pillar Module Contracts (Sprint 352–354)` / `(\`src/orchestra/sprint-spawner.ts\`, \`src/cli/commands/spawn.ts\`) currently threads` | mixed — repeated pattern throughout enterprise/RBAC/audit sections: prose ("sprint workers", "Sprint worker-spawn", "Sprint 265 closed...") is user-visible; function signatures (`readAuditEvents(projectRoot, sprintId)`), CLI examples (`--sprint sprint-262`), module names (`sprint-controller`, `sprint-spawner.ts`), and `kind: sprint` enum are frozen identifiers | run-text: reword all descriptive prose occurrences to "run" (e.g. "Controls capability enforcement for worker-spawned tasks (run workers).", "Run worker-spawn uses the `enforce_rbac` path...", "Pillar Module Contracts (Sprint 352–354)" numbering stays historical); keep `sprintId` param name, `--sprint` flag, `sprint-controller`/`sprint-spawner.ts` file names, and `kind: sprint` enum value untouched | multiple real contracts embedded in this section: function param `sprintId`, CLI flag `--sprint`, source file names `sprint-controller.ts`/`sprint-spawner.ts`, and `kind` enum value `sprint` — all are source-level identifiers outside doc-only scope; module-name prose ("sprint-controller") should stay literal since it names an actual file |

---

### docs/reference/managed-docs.md — 20 total grep hits, covered by 10 table rows (6 individual + 4 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/managed-docs.md:3 | `Deckent's managed-docs system automatically updates designated sections of your project documentation at the end of each sprint.` | user-visible | run-text: "...at the end of each run." | cosmetic doc prose |
| docs/reference/managed-docs.md:34,36,37 | `Section headings that Deckent auto-updates each sprint. When a sprint completes, Deckent: ... 2. Regenerates the content using sprint context (metrics, test results, etc.)` | user-visible | run-text: "Section headings that Deckent auto-updates each run. When a run completes, Deckent: ... 2. Regenerates the content using run context..." | cosmetic doc prose |
| docs/reference/managed-docs.md:43,46,47,49 | `\| \`Sprint Metrics\` \| Sprint number, tasks, coverage, duration \|` / `\| \`Project Status\` \| Version, sprint count, test stats \|` / `\| \`Sprint History\` \| Recent sprint results table \|` / `\| \`Live Metrics\` \| Real-time sprint execution data \|` | mixed — `Sprint Metrics`/`Sprint History` are literal built-in managed-doc **section-heading names** users type into `docs.json`/their own markdown (semi-frozen: a real string users must match), remaining prose (`Sprint number, tasks...`, `sprint count`, `sprint execution data`) is user-visible | run-text: reword descriptive column ("Run number, tasks, coverage, duration", "Version, run count, test stats", "Recent run results table", "Real-time run execution data"); if renaming the section-name strings `Sprint Metrics`/`Sprint History` themselves, that's a real config-matching contract — see compat note | `Sprint Metrics` and `Sprint History` are literal built-in-generator section names matched by string in `managed-doc-runner.ts` (used in `autoSections: ["Sprint Metrics"]` at line 83/89 below) — renaming these strings breaks any existing user `docs.json` that references them; needs a migration/alias strategy, not a plain doc edit |
| docs/reference/managed-docs.md:60,65 | `User-defined templates per section with \`{{path.to.value}}\` placeholders resolved against the sprint context.` / `"KPI": "Coverage: {{sprintResult.metrics.coveragePercent}}%\nTasks: {{sprintResult.metrics.totalTasks}}"` | mixed — prose user-visible; `sprintResult` is a literal template placeholder root-object name (frozen) | run-text: "...resolved against the run context." for prose; n/a for `{{sprintResult....}}` placeholder key | `sprintResult` is a real template-variable name resolved by the managed-docs template engine — renaming breaks existing user templates referencing `{{sprintResult...}}`; needs alias/migration |
| docs/reference/managed-docs.md:83,89,175 | `"autoSections": ["Sprint Metrics"],` / `"autoSections": ["Sprint History"],` / `"Metrics": "...{{sprintResult.metrics.coveragePercent}}%...{{sprintResult.metrics.totalTasks}}}"` | frozen-identifier | n/a — keep the literal `docs.json` config values `"Sprint Metrics"` / `"Sprint History"` and `{{sprintResult...}}` placeholders as-is unless a config migration is planned | same real config-contract concern as above — these are copy-pasteable example values from actual `.deckent/docs.json` |
| docs/reference/managed-docs.md:120,130,133,136,146,149,152,190 | `The default template includes a single entry for \`CLAUDE.md\` with \`Sprint Metrics\` auto-section.` / `### 1. Inject Sprint Metrics into README` / `deckent docs add README.md --auto "Sprint Metrics"` / `Add a \`## Sprint Metrics\` section to your README.md. After each sprint, Deckent updates it...` / `### 3. Feed CHANGELOG with Sprint History` / `deckent docs add CHANGELOG.md --auto "Sprint History"` / `Each sprint appends its results to the changelog's sprint history section.` / `\`src/orchestra/managed-docs/managed-doc-runner.ts\` — Sprint finalization orchestrator` | mixed — headings/prose user-visible; the `--auto "Sprint Metrics"` / `--auto "Sprint History"` CLI argument VALUES are the same frozen section-name strings as above | run-text: reword headings/prose ("### 1. Inject Run Metrics into README", "Add a `## Run Metrics` section to your README.md. After each run, Deckent updates it...", "### 3. Feed CHANGELOG with Run History", "Each run appends its results to the changelog's run history section.", "...Sprint finalization orchestrator" → "Run finalization orchestrator"); keep `--auto "Sprint Metrics"` / `--auto "Sprint History"` CLI example values matching the frozen section names above | headings `### 1. Inject Sprint Metrics into README` / `### 3. Feed CHANGELOG with Sprint History` produce anchors (`#1-inject-sprint-metrics-into-readme`) — check inbound links; CLI example args are tied to the frozen `Sprint Metrics`/`Sprint History` section-name contract noted above |

---

### docs/guide/quickstart.md — 19 total grep hits, covered by 12 table rows (8 individual + 4 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/quickstart.md:3 | `> Get from zero to your first AI-driven sprint in 5 minutes.` | user-visible | run-text: "> Get from zero to your first AI-driven run in 5 minutes." | cosmetic doc prose |
| docs/guide/quickstart.md:13 | `5. [Running a Sprint](#5-running-a-sprint)` | user-visible (TOC + anchor) | run-text: "5. [Running a Run](#5-running-a-run)" | anchor `#5-running-a-sprint` must be renamed together with the heading at line 191 |
| docs/guide/quickstart.md:113,117,122 | `DIRECTIVES.md          # Your sprint goals (edit this before each sprint)` / `config.json          # Runtime config (mode, language, sprint ID)` / `sprints/             # Per-sprint logs` | mixed — descriptive comment prose user-visible; `sprints/` is a literal directory name shown in a file-tree diagram (frozen) | run-text: "# Your run goals (edit this before each run)", "# Runtime config (mode, language, run ID)" for prose; keep `sprints/` directory name as shown (mirrors real `.brain/sprints/` path) | `sprints/` in this ASCII file-tree is the literal on-disk directory name (`.brain/sprints/`) — renaming the displayed name without renaming the actual directory is misleading; treat as tied to the same source-level rename as the `.brain/sprints/` path noted in performance.md/api-surface.md |
| docs/guide/quickstart.md:145 | `# DIRECTIVES -- Sprint 1` (example DIRECTIVES.md content in a code fence) | user-visible (example content, not a real identifier) | run-text: "# DIRECTIVES -- Run 1" | this is illustrative sample content a user would type into their own DIRECTIVES.md — safe to reword, no external contract |
| docs/guide/quickstart.md:191 | `## 5. Running a Sprint` | user-visible (heading) | run-text: "## 5. Running a Run" | heading anchor `#5-running-a-sprint` referenced by TOC line 13 — rename together |
| docs/guide/quickstart.md:204 | `Sprint 001 -- 2 tasks planned` (example CLI output in a code fence) | user-visible (sample output) | run-text: "Run 001 -- 2 tasks planned" | illustrative sample CLI output, not a literal contract (though it should stay consistent with whatever the real `deckent plan` output format becomes) |
| docs/guide/quickstart.md:214 | `### Start the Sprint` | user-visible (heading) | run-text: "### Start the Run" | heading anchor `#start-the-sprint` — check inbound links |
| docs/guide/quickstart.md:220,229 | `Brain runs the full 8-phase sprint lifecycle:` / `8. **CLEANUP** — Archive task files, release locks, mark sprint complete` | user-visible | run-text: "Brain runs the full 8-phase run lifecycle:", "8. **CLEANUP** — Archive task files, release locks, mark run complete" | cosmetic doc prose |
| docs/guide/quickstart.md:258,264,276,279 | `While a sprint is running, open the live web dashboard in your browser:` / `The dashboard shows live worker status, task results, memory, and sprint history.` / `Example output during a sprint:` / `Sprint sprint-001 -- EXECUTE phase` (sample output) | mixed — prose user-visible; `sprint-001` in the sample output line mirrors the real ID format (illustrative, not a hard contract in this context) | run-text: "While a run is running, open the live web dashboard..."; "...memory, and run history."; "Example output during a run:"; "Run run-001 -- EXECUTE phase" | sample output only, no external contract; keep consistent with whatever the live CLI output actually becomes |
| docs/guide/quickstart.md:302 | `### Sprint History` | user-visible (heading) | run-text: "### Run History" | heading anchor `#sprint-history` — check inbound links; also same name as the managed-docs built-in section `Sprint History` (see managed-docs.md row) — coordinate wording if this doc cross-references that feature |
| docs/guide/quickstart.md:310,341,353 | `Brain writes what it learned after each sprint:` / `**NO_GO** -- Task failed; Brain logs the failure and it can be retried next sprint` / `Brain stores learnings that persist across sprints. Search them:` | user-visible | run-text: "Brain writes what it learned after each run:", "...it can be retried next run", "Brain stores learnings that persist across runs. Search them:" | cosmetic doc prose |

---

### docs/guide/deckent-nedir.md — 18 total grep hits, covered by 14 table rows (11 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/deckent-nedir.md:3 | `> Sürüm: v1.0.0-beta.1 \| Sprint: 285+ \| Node.js ≥ 24 \| Lisans: MIT` | user-visible | run-text: "> Sürüm: v1.0.0-beta.1 \| Sprint: 285+ \| Node.js ≥ 24 \| Lisans: MIT" — this is the project's own internal sprint-counter badge (historical numbering), not the "sprint" concept; recommend leaving as historical version marker unless the counter itself is renamed | this is a version-badge convention ("Sprint: N+" = cumulative internal sprint count), distinct from the user-facing feature-terminology rename; flag as judgment call |
| docs/guide/deckent-nedir.md:9 | `Deckent, **AI destekli sprint orkestrasyon sistemi**dir. Birden fazla AI ajanını (Brain, Worker, Auditor) koordine ederek yazılım projelerinde PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP yaşam döngüsünü yönetir.` | user-visible | run-text (TR): "Deckent, **AI destekli run orkestrasyon sistemi**dir. ..." — or Turkish-appropriate equivalent term if "run" itself needs TR localization | cosmetic doc prose (top-of-doc definitional sentence) |
| docs/guide/deckent-nedir.md:16 | `- Sprint sonunda değerlendirme (GO/NO_GO/GO_WITH_TECH_DEBT), retrospektif ve SQLite bellek yönetimi` | user-visible | run-text (TR): "- Run sonunda değerlendirme (GO/NO_GO/GO_WITH_TECH_DEBT), retrospektif ve SQLite bellek yönetimi" | cosmetic doc prose |
| docs/guide/deckent-nedir.md:20 | `...Tur-içi araç kuyruğu ve onay modu (sprint-285) sprint döngüsü dışında da ajan etkileşimi sağlar...` | mixed — `(sprint-285)` is a historical feature-tag/version marker; `sprint döngüsü` ("sprint cycle") is user-visible prose | run-text (TR): "...sprint döngüsü dışında..." → "...run döngüsü dışında..." for the cycle reference; keep `(sprint-285)` as historical internal tag | `(sprint-285)` reads as an internal feature/ADR tag, not user vocabulary — low priority / could stay |
| docs/guide/deckent-nedir.md:31 | `### Sprint Yaşam Döngüsü (8 Faz)` | user-visible (heading) | run-text (TR): "### Run Yaşam Döngüsü (8 Faz)" | heading anchor `#sprint-yaşam-döngüsü-8-faz` — check inbound links |
| docs/guide/deckent-nedir.md:44,46 | `\| RETRO \| Brain \| Retrospektif, sprint log ve öğrenmeler SQLite DB'ye yazılır \|` / `\| CLEANUP \| Brain \| Task dosyaları arşivlenir, kilitler serbest bırakılır, sprint tamamlanır \|` | user-visible (table cells) | run-text (TR): "Retrospektif, run log ve öğrenmeler SQLite DB'ye yazılır", "Task dosyaları arşivlenir, kilitler serbest bırakılır, run tamamlanır" | cosmetic doc prose |
| docs/guide/deckent-nedir.md:94 | `\| Ollama \| yerel modeller \| (REPL/chat çalışır; sprint-worker kısmen desteklenir) \|` | user-visible | run-text (TR): "(REPL/chat çalışır; run-worker kısmen desteklenir)" | "sprint-worker" here is descriptive TR prose, not a literal identifier; low compat risk |
| docs/guide/deckent-nedir.md:105,109 | `\| **Orchestra** \| \`src/orchestra/\` \| Sprint lifecycle, planlama, yönlendirme, değerlendirme (94 modül) \|` / `\| **Monitor** \| \`src/monitor/\` \| Auditor scan döngüsü, dashboard manager, sprint state (5 modül) \|` | user-visible | run-text: "Run lifecycle, planlama, yönlendirme, değerlendirme (94 modül)", "Auditor scan döngüsü, dashboard manager, run state (5 modül)" | cosmetic doc prose describing module purpose; underlying module names (`src/orchestra/`, `sprint-controller.ts`) stay as real source paths |
| docs/guide/deckent-nedir.md:117 | `**Tek Yönlü Bağımlılık (ADR-008):** Yalnızca \`sprint-controller\` tmux/auditor/worker modüllerini import eder...` | frozen-identifier (module name) + user-visible prose | run-text: keep `sprint-controller` module name; surrounding TR prose largely already minimal | `sprint-controller` is the real source module name (`src/orchestra/sprint-controller.ts`) — frozen |
| docs/guide/deckent-nedir.md:125,127,130,131 | `Sprint yönetimi, memory, agent/skill, autonomous, nervous, checkpoint, config, dashboard, serve ve REPL komutları dahil...` / `**Temel sprint akışı:**` / `deckent plan            # Sprint planla (AI veya structured)` / `deckent start           # Sprint başlat` | user-visible | run-text (TR): "Run yönetimi, memory, agent/skill, autonomous, nervous, checkpoint, config, dashboard, serve ve REPL komutları dahil...", "**Temel run akışı:**", "deckent plan # Run planla (AI veya structured)", "deckent start # Run başlat" | cosmetic doc prose / code-comment-style annotations in bash fence, no compat concern |
| docs/guide/deckent-nedir.md:139 | `\`claude mcp add deckent -- npx deckent-mcp\` ile Claude Code'a eklenir. Sprint lifecycle, memory query, status, docs, audit, nervous ve autonomous araçları dahil...` | user-visible | run-text (TR): "...Run lifecycle, memory query, status, docs, audit, nervous ve autonomous araçları dahil..." | cosmetic doc prose |
| docs/guide/deckent-nedir.md:149 | `\`src/api/server.ts\` — varsayılan port 3100, bind 127.0.0.1. GET/POST endpointleri: sprint yönetimi, status, events (SSE), memory, auth (OIDC + static token), enterprise, evolution, nervous.` | user-visible | run-text (TR): "GET/POST endpointleri: run yönetimi, status, events (SSE), memory, auth (OIDC + static token), enterprise, evolution, nervous." | cosmetic doc prose |
| docs/guide/deckent-nedir.md:187 | `- **Cost-gate:** Sprint öncesi maliyet tahmini ve bütçe aşımı kontrolü.` | user-visible | run-text (TR): "- **Cost-gate:** Run öncesi maliyet tahmini ve bütçe aşımı kontrolü." | cosmetic doc prose |

---

### docs/reference/enterprise-depth.md — 14 total grep hits, covered by 12 table rows (11 individual + 1 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/enterprise-depth.md:37 | `Controls capability enforcement for worker-spawned tasks (sprint workers).` | user-visible | run-text: "Controls capability enforcement for worker-spawned tasks (run workers)." | cosmetic doc prose |
| docs/reference/enterprise-depth.md:64 | `\`operator\` — write, execute, sprint, audit-read, flow-manage.` | frozen-identifier | n/a — keep literal `sprint` permission-scope token, reword only if surrounding text needs it | this is a literal RBAC permission-scope name (same as `sprint.start` seen in cli-commands.md) — real access-control contract, breaking change if renamed |
| docs/reference/enterprise-depth.md:78 | `**Honest boundary**: enforcement via \`rbac_policy\` applies **only** to the autonomous dispatch path. Sprint worker-spawn uses the \`enforce_rbac\` path (Section 2a), which remains **advisory**... The sprint-path hard-flip is a post-GA V2 item.` | user-visible | run-text: "Run worker-spawn uses the `enforce_rbac` path... The run-path hard-flip is a post-GA V2 item." | cosmetic doc prose |
| docs/reference/enterprise-depth.md:110 | `All core orchestration paths — \`sprint-finalizer\`, \`debt-manager\`, \`task-builder\`, \`sprint-planner\`, MCP tools, and others — call \`new MemoryStore(dbPath)\`...` | frozen-identifier (module names) | n/a — keep `sprint-finalizer`, `sprint-planner` module names, no prose rewording needed beyond context | real source module names (`src/orchestra/sprint-finalizer.ts` etc.) — frozen |
| docs/reference/enterprise-depth.md:126 | `...it does not automatically close the \`NULL-tenant\` visibility gap in sprint execution, retro, or task-builder paths.` | user-visible | run-text: "...in run execution, retro, or task-builder paths." | cosmetic doc prose |
| docs/reference/enterprise-depth.md:183 | `**Function**: \`readAuditEvents(projectRoot, sprintId): AuditEventPayload[]\`` | frozen-identifier | n/a — keep function signature `sprintId` param name, reword only surrounding text | real TS function signature — source-level identifier, out of doc-only scope |
| docs/reference/enterprise-depth.md:185 | `Reads the raw ENT-3 audit payloads for a sprint from the append-only event stream...` | user-visible | run-text: "Reads the raw ENT-3 audit payloads for a run from the append-only event stream..." | cosmetic doc prose |
| docs/reference/enterprise-depth.md:190,204 | `deckent audit compliance --sprint sprint-262 [--json] [--lang en\|tr]` / `deckent audit forward --sprint sprint-262 [--url <https-endpoint>] [--out .deckent/siem-export.jsonl] [--json]` | frozen-identifier | n/a — keep `--sprint` flag and `sprint-262` example ID | real CLI flag contract (same `--sprint` flag documented in cli-commands.md) |
| docs/reference/enterprise-depth.md:197 | `\`auditChainIntact\` — derived by running \`verifyAuditChain\` over the sprint's live audit events` | user-visible | run-text: "...over the run's live audit events" | cosmetic doc prose |
| docs/reference/enterprise-depth.md:210 | `**Network transports (Sprint 265)**: the NDJSON file transport is no longer the only option.` | user-visible (historical marker) | run-text: keep "Sprint 265" as historical numbering, or reword heading label if desired: "**Network transports (Sprint 265)**" — low priority | historical feature-introduction marker, same class as other "Sprint NNN" citations |
| docs/reference/enterprise-depth.md:237,254,316 | `Sprint 265 closed the long-standing "JWKS fetch is a documented follow-up" note...` / `Sprint 267 extended the HTTP API's bearer middleware with OIDC JWT verification...` / `Sprint 277 closes the backend OIDC foundation and wires the dashboard authentication layer...` | user-visible (historical/changelog-style narrative prose) | run-text: these narrate project history using the internal sprint-numbering scheme ("Sprint 265 closed...") — recommend leaving the numeric citation as historical record; if desired, could reword to "Run 265 closed..." for full terminology consistency | same judgment call as other "Sprint N did X" narrative sentences — historical changelog narration, low priority for the rename vs. forward-looking feature prose |

---

### docs/guide/config-recovery.md — 11 total grep hits, covered by 9 table rows (7 individual + 2 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/config-recovery.md:7 | `...yeniden oluşturulabilir — bu durumda tüm kullanıcı ayarları kaybolur (Sprint 176 root cause).` | user-visible (historical marker) | run-text: keep "(Sprint 176 root cause)" as historical incident reference, or reword to "(Run 176 root cause)" for consistency | historical incident citation, low priority |
| docs/guide/config-recovery.md:36 | `## Sprint Recovery Chain (Takilmış Sprint)` | user-visible (heading) | run-text (TR): "## Run Recovery Chain (Takılmış Run)" | heading anchor `#sprint-recovery-chain-takilmış-sprint` — check inbound links |
| docs/guide/config-recovery.md:38 | `Sprint'iniz donup kaldıysa veya worker'lar yanıt vermiyorsa, aşağıdaki zinciri sırayla çalıştırın:` | user-visible | run-text (TR): "Run'ınız donup kaldıysa veya worker'lar yanıt vermiyorsa, aşağıdaki zinciri sırayla çalıştırın:" | cosmetic doc prose |
| docs/guide/config-recovery.md:48 | `deckent recover <sprint-id>` (example command) | mixed — `<sprint-id>` is a placeholder in an illustrative command line | run-text: if the CLI arg itself is a positional (not a named flag), the placeholder label `<sprint-id>` could become `<run-id>` for prose consistency, but this mirrors the real `recover` command's expected argument | `deckent recover` takes a real sprint-ID positional argument — renaming the placeholder label in docs without renaming the actual accepted ID format is cosmetic only, but flag as tied to real CLI arg semantics |
| docs/guide/config-recovery.md:72 | `\| Kısmi sonuçlar var, sprint tamamlanmadı \| \`deckent recover <sprint-id>\` \|` | mixed — same as above (table cell prose + placeholder) | run-text (TR): "Kısmi sonuçlar var, run tamamlanmadı" for prose; placeholder same as above | same as line 48 |
| docs/guide/config-recovery.md:76 | `## Sprint 176 Örüntüsü` | user-visible (heading, historical incident title) | run-text (TR): keep "Sprint 176" as historical incident ID, or "## Run 176 Örüntüsü" for full consistency | heading anchor `#sprint-176-örüntüsü` — check inbound links; historical incident reference |
| docs/guide/config-recovery.md:78,82 | `Sprint 176'da şu senaryo gerçekleşti:` / `4. Sonraki sprint'ler yanlış backend ile çalıştı` | user-visible | run-text (TR): keep "Sprint 176'da..." as historical incident marker; "4. Sonraki run'lar yanlış backend ile çalıştı" for the general-plural reference | cosmetic doc prose; mixed historical + general |
| docs/guide/config-recovery.md:149,162 | `### Config kayboldu ama sprint başlatılması gerekiyor` / `# 4. Sprint başlat` | user-visible (heading + code-comment) | run-text (TR): "### Config kayboldu ama run başlatılması gerekiyor", "# 4. Run başlat" | heading anchor `#config-kayboldu-ama-sprint-başlatılması-gerekiyor` — check inbound links |
| docs/guide/config-recovery.md:168 | `Sprint 176 senaryosu: config regen sonrası \`spawn_backend\` 'auto' veya tmux'a dönmüş.` | user-visible (historical marker) | run-text (TR): keep "Sprint 176 senaryosu" as historical incident reference | historical incident citation |

---

### docs/guide/autonomous.md — 9 total grep hits, covered by 8 table rows (7 individual + 1 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/autonomous.md:3 | `> **Status:** Active (Sprint 226 / AS-6). Authority-bounded continuous loop with human-approval gate.` | user-visible (historical marker) | run-text: keep "Sprint 226" as historical feature-introduction marker, or "Run 226" for full consistency | historical citation |
| docs/guide/autonomous.md:5 | `\`deckent autonomous\` runs an authority-controlled loop... the loop never approves or starts sprints on its own.` | user-visible | run-text: "...the loop never approves or starts runs on its own." | cosmetic doc prose |
| docs/guide/autonomous.md:194 | `\| \`--kind <kind>\` \| \`task\` \| Entry kind: \`task\` (inline description), \`sprint\` (directives ref), or \`capability\` (F8 broker verb). \|` | frozen-identifier | n/a — keep literal `kind: sprint` enum value, reword surrounding prose only | real config/CLI enum value (`kind` field) — same `sprint`/`task`/`capability` enum as cli-commands.md |
| docs/guide/autonomous.md:230 | `A \`capability\` entry runs no task or sprint — it invokes a registered capability-broker verb...` | user-visible | run-text: "A `capability` entry runs no task or run — it invokes a registered capability-broker verb..." | cosmetic doc prose |
| docs/guide/autonomous.md:290 | `The engine registers the **execute-dispatcher** handler, which runs \`task\` → worker, \`sprint\` → sprint lifecycle, \`capability\` → F8 broker invocation.` | mixed — `sprint` enum values frozen; "sprint lifecycle" descriptive text is user-visible | run-text: "...`sprint` → run lifecycle..." (keep the `kind: sprint` enum token, reword the phrase describing what it triggers) | `kind` enum value frozen; descriptive phrase changes |
| docs/guide/autonomous.md:327 | `### 3. No auto-sprint-start — governed task/sprint execution` | user-visible (heading, contains hyphenated compound + enum reference) | run-text: "### 3. No auto-run-start — governed task/run execution" | heading anchor `#3-no-auto-sprint-start--governed-tasksprint-execution` — check inbound links |
| docs/guide/autonomous.md:329,334 | `**No auto-sprint-start:** the loop never starts a sprint (or any task) on its own.` / `\`kind: sprint\` → runs a full sprint lifecycle (\`runSprintLifecycle\`)` | mixed — prose user-visible; `kind: sprint` enum value and `runSprintLifecycle` function name frozen | run-text: "**No auto-run-start:** the loop never starts a run (or any task) on its own." for prose; keep `kind: sprint` and `runSprintLifecycle` identifiers | `runSprintLifecycle` is a real source function name — frozen; `kind: sprint` enum frozen |
| docs/guide/autonomous.md:391 | `\| **F3-009** \| Feature ID for the autonomous runtime wire (Sprint 226 Task 226-006). \|` | user-visible (historical marker) | run-text: keep "Sprint 226 Task 226-006" as historical feature/task-ID citation | historical citation, low priority |

---

### docs/reference/lifecycle-diagram.md — 7 total grep hits, covered by 6 table rows (5 individual + 1 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/lifecycle-diagram.md:3 | `Visual reference for the sprint lifecycle phases and the module layer map.` | user-visible | run-text: "Visual reference for the run lifecycle phases and the module layer map." | cosmetic doc prose |
| docs/reference/lifecycle-diagram.md:8 | `## Sprint Lifecycle` | user-visible (heading) | run-text: "## Run Lifecycle" | heading anchor `#sprint-lifecycle` — check inbound links (likely referenced from other docs like quickstart.md, deckent-nedir.md) |
| docs/reference/lifecycle-diagram.md:12 | `DIRECTIVE["**0 · DIRECTIVE**\nSprint initialized\nBrain reads DIRECTIVES.md\nInitial SprintPhase before PLAN"]` (Mermaid diagram node label) | mixed — diagram label text "Sprint initialized" is user-visible (renders in the diagram); `SprintPhase` is the frozen enum name | run-text: "Sprint initialized" → "Run initialized" in the rendered node label; keep `SprintPhase` enum name reference as-is | Mermaid diagram node text is user-visible rendered content, safe to reword; enum name is a source identifier |
| docs/reference/lifecycle-diagram.md:21 | `COMPLETE["**8 · COMPLETE**\nTask files archived\nLocks released · Session closed\nSprintPhase.COMPLETE emitted"]` (diagram node label) | mixed — same pattern, `SprintPhase.COMPLETE` is the enum reference (frozen) | run-text: keep `SprintPhase.COMPLETE` reference verbatim (it's a code symbol shown for precision) | frozen enum reference embedded in diagram label |
| docs/reference/lifecycle-diagram.md:40 | `> **SprintPhase enum note** (\`src/core/sprint-types.ts\`): The canonical enum values are \`DIRECTIVE · PLAN · SPAWN · EXECUTE · EVALUATE · FIX · RETRO · DECAY · TRANSITION · COMPLETE\`. ...` | frozen-identifier (heading of a note about the real enum) + user-visible surrounding prose | run-text: "> **SprintPhase enum note**" stays as-is (it's literally the enum name); could reword to "> **Run-phase enum note (`SprintPhase`)**" for readability, but the identifier itself is frozen | `SprintPhase` and `src/core/sprint-types.ts` are real source identifiers — frozen |
| docs/reference/lifecycle-diagram.md:54,55 | `subgraph orch["orchestra/  ·  Sprint Lifecycle & Routing  (94 modules)"]` / `BRAIN["Brain · Sprint Controller"]` (Mermaid diagram labels) | user-visible (rendered diagram text) | run-text: "orchestra/ · Run Lifecycle & Routing (94 modules)", "Brain · Run Controller" | diagram label text, safe to reword; underlying module name `sprint-controller.ts` unaffected |

---

### docs/reference/worker-wrapper-contract.md — 6 total grep hits, covered by 6 table rows (6 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/worker-wrapper-contract.md:7 | `sprint never stalls waiting on a task that will never finish.` | user-visible | run-text: "run never stalls waiting on a task that will never finish." | cosmetic doc prose |
| docs/reference/worker-wrapper-contract.md:13 | `in its row. It cross-references the Sprint-360 POSIX/portability audit` | user-visible (historical marker, "Sprint-360" as an audit/document ID) | run-text: keep "Sprint-360" as the historical audit-document identifier (it names a specific past audit report) | this looks like a document/audit-report name/ID, not general prose — renaming risks breaking the reference to an actual named audit artifact; flag as judgment call |
| docs/reference/worker-wrapper-contract.md:18 | `"466-473-468". The Sprint-360 audit already established (and this document confirms by` | user-visible (same historical audit-ID reference) | run-text: keep "Sprint-360" audit-ID reference as-is | same as above |
| docs/reference/worker-wrapper-contract.md:24 | `Line numbers below are current against the tree at HEAD (sprint-365); they supersede the` | user-visible (historical marker — "sprint-365" as a point-in-time tree reference) | run-text: keep "(sprint-365)" as the historical tree/commit-point reference, or reword to "(run-365)" if the sprint-numbering itself is renamed | historical versioning marker |
| docs/reference/worker-wrapper-contract.md:25 | `Sprint-360 audit's line numbers where the two differ (the files have grown since commit` | user-visible (same audit-ID reference) | run-text: keep "Sprint-360 audit" reference as-is | same as line 13/18 |
| docs/reference/worker-wrapper-contract.md:212 | `allowlist string the caller (e.g. \`sprint-spawner.ts\`, out of this doc's write scope) computed` | frozen-identifier | n/a — keep `sprint-spawner.ts` file name, reword only if surrounding text needs it | real source file name (`src/orchestra/sprint-spawner.ts`) — frozen |

---

### docs/guide/local-model-workers.md — 5 total grep hits, covered by 5 table rows (5 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/local-model-workers.md:14 | `\| **Sprint worker** \| Tam destekli (derleme gerekli) \| Task JSON'daki \`- Provider: ollama\` ile sprint worker olarak kullanılır. \`dist/agents/agentic-worker-entry.js\` üzerinden tool-calling döngüsü çalışır...\|` | user-visible (table cell, includes bolded term "Sprint worker") | run-text (TR): "**Run worker** \| Tam destekli (derleme gerekli) \| Task JSON'daki `- Provider: ollama` ile run worker olarak kullanılır..." | cosmetic doc prose; table row label |
| docs/guide/local-model-workers.md:16 | `> **Derleme uyarısı (sprint worker):** Sprint worker, ön-derlenmiş \`dist/agents/agentic-worker-entry.js\` dosyasına bağımlıdır...` | user-visible | run-text (TR): "> **Derleme uyarısı (run worker):** Run worker, ön-derlenmiş `dist/agents/agentic-worker-entry.js` dosyasına bağımlıdır..." | cosmetic doc prose |
| docs/guide/local-model-workers.md:163 | `REPL modunda Ollama modeli sohbet aracı olarak kullanılır — sprint başlatmadan direkt konuşabilirsiniz.` | user-visible | run-text (TR): "...run başlatmadan direkt konuşabilirsiniz." | cosmetic doc prose |
| docs/guide/local-model-workers.md:174 | `REPL, \`src/cli/repl/native-transport.ts\` üzerinden \`OllamaAdapter\`'ı devreye alır... Sprint başlatılmaz; \`deckent run\` gibi agentic araçlar da bu modda çalışır.` | user-visible — note: this sentence already uses `deckent run` as an existing CLI command name (unrelated pre-existing command, potential naming collision with the "run" rename target) | run-text (TR): "...Run başlatılmaz; `deckent run` gibi agentic araçlar da bu modda çalışır." | **naming-collision flag**: `deckent run` is ALREADY an existing CLI command (`Run a single one-shot task`, cli-commands.md:32/664) distinct from "sprint"; if "sprint" is renamed to "run" project-wide, this creates an ambiguity between the renamed "run" (=sprint) concept and the pre-existing `deckent run` (=one-shot task) command — flag for the rename initiative's naming strategy |
| docs/guide/local-model-workers.md:187 | `# 3. Proje derlendi mi kontrol et (sprint worker gerektirir)` | user-visible (code comment) | run-text (TR): "# 3. Proje derlendi mi kontrol et (run worker gerektirir)" | cosmetic doc prose |

---

### docs/reference/multi-provider.md — 4 total grep hits, covered by 4 table rows (4 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/multi-provider.md:25 | `\| **Codex** \| \`codex\` CLI (\`@openai/codex\`) \| ... \| subprocess (host-adapter); Docker with \`~/.codex\` mount \| Full sprint + worker support \|` | user-visible | run-text: "Full run + worker support" | cosmetic doc prose (table cell) |
| docs/reference/multi-provider.md:26 | `\| **Gemini** \| \`gemini\` CLI ... \| Full sprint + worker support (Sprint 248) \|` | mixed — "Full sprint + worker support" user-visible; "(Sprint 248)" historical marker | run-text: "Full run + worker support (Sprint 248)" — reword the descriptive phrase, keep numeric historical citation | historical citation for "Sprint 248" low priority |
| docs/reference/multi-provider.md:83 | `Gemini requires the \`gemini\` CLI binary... the API key is optional when the CLI already has an active OAuth session (Sprint 248 F1-G).` | user-visible (historical marker) | run-text: keep "(Sprint 248 F1-G)" as historical feature-ID citation | historical citation |
| docs/reference/multi-provider.md:279 | `If Codex is rate-limited during a sprint, workers automatically fall back to Claude with equivalent models.` | user-visible | run-text: "If Codex is rate-limited during a run, workers automatically fall back to Claude with equivalent models." | cosmetic doc prose |

---

### docs/guide/terminal-tr.md — 3 total grep hits, covered by 3 table rows (3 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/terminal-tr.md:59 | `\`deckent\` türündeki oturumlar **boşta kalma reaperından muaftır** — uzun süren bir sprint, etkinlik olmadığı gerekçesiyle sonlandırılmaz.` | user-visible | run-text (TR): "...uzun süren bir run, etkinlik olmadığı gerekçesiyle sonlandırılmaz." | cosmetic doc prose |
| docs/guide/terminal-tr.md:87 | `Terminal, bypass etkin olsa bile kendi token'ını zorunlu kılar — sprint durumunu okumak için kullanılan bir kolaylık bayrağı, sessizce uzak bir kabuk açmamalıdır.` | user-visible | run-text (TR): "...run durumunu okumak için kullanılan bir kolaylık bayrağı..." | cosmetic doc prose |
| docs/guide/terminal-tr.md:89 | `Bu, Sprint 171 denetimiyle belirlenen B-022 güvenlik bulgusuna uyumludur.` | user-visible (historical marker) | run-text (TR): keep "Sprint 171 denetimiyle" as historical audit reference, or "Run 171 denetimiyle" for full consistency | historical citation, low priority |

---

### docs/reference/agents.md — 1 total grep hit, covered by 1 table row (1 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/agents.md:18 | `\| \`ci-guardian\` \| CI Guardian \| ci-cd, testing, regression-detection, build-verification, github-actions \| CI/CD pipeline guardian — ensures tsc, vitest, and build pass before and after sprint tasks \|` | user-visible | run-text: "CI/CD pipeline guardian — ensures tsc, vitest, and build pass before and after run tasks" | cosmetic doc prose (table cell) |

---

## Cross-cutting observations

1. **Frozen identifiers repeated across files** (real source/config/API contracts — coordinate as a single rename decision, not per-doc):
   - `sprintId` (Task JSON field, function params) — `api-surface.md`, `enterprise-depth.md`
   - `--sprint <id>` / `--sprint-id` / `--sprint-min` / `--sprints` CLI flags — `cli-commands.md`, `enterprise-depth.md`, `config-recovery.md`
   - `sprint-controller.ts` / `sprint-planner.ts` / `sprint-finalizer.ts` / `sprint-spawner.ts` module names — `api-surface.md`, `deckent-nedir.md`, `enterprise-depth.md`, `worker-wrapper-contract.md`
   - `SprintPhase` TS enum (`src/core/sprint-types.ts`) — `api-surface.md`, `lifecycle-diagram.md`
   - `kind: sprint` enum value (autonomous/flow entries) — `cli-commands.md`, `autonomous.md`
   - `"sprint"` JSON field / `sprint-NNN` ID format — real HTTP API response shape (`api-examples.md`, `api-surface.md`)
   - `Sprint Metrics` / `Sprint History` — literal managed-docs built-in section names + `{{sprintResult...}}` template placeholder (`managed-docs.md`)
   - `.brain/sprints/sprint-NNN.md` file-path convention (`performance.md`, `api-surface.md`, `quickstart.md`)
   - `memory.decay_after_sprints`, `budget_per_sprint`, `sprint_range` config/query keys (`performance.md`, `api-surface.md`)
   - `sprint.start` / `sprint` RBAC permission-scope tokens (`cli-commands.md`, `enterprise-depth.md`)

2. **Historical/changelog-style "Sprint NNN" citations** (e.g. "Sprint 265 closed...", "Sprint 176 root cause") appear throughout almost every file. These denote the project's internal cumulative sprint-numbering scheme used for changelog/audit narration, not the "a sprint = a unit of orchestrated work" concept being renamed. Recommend a separate policy decision: either (a) leave all "Sprint NNN" historical citations as-is since they're a numbering/audit-trail scheme, or (b) rename them too for full terminology consistency. This affects dozens of occurrences across nearly every file in scope.

3. **Naming collision risk**: `docs/guide/local-model-workers.md:174` already documents an existing `deckent run` CLI command (a one-shot task runner, unrelated to "sprint"). If "sprint" → "run" proceeds, the rename initiative needs an explicit disambiguation strategy since `deckent run` already exists as a distinct command name (see `cli-commands.md:32,664`: `run` = "Run a single one-shot task without a sprint cycle").

4. **Markdown anchor/heading-ID compat concerns** requiring coordination before rename: `performance.md` (`#3-sprint-size-optimization`, `#31-sprint-size-vs-quality-trade-off`, `#sprint-size-quick-reference`), `cli-commands.md` (`#sprint-workflow`), `quickstart.md` (`#5-running-a-sprint`, `#start-the-sprint`, `#sprint-history`), `api-surface.md` (`#sprint-phases`), `managed-docs.md` (`#1-inject-sprint-metrics-into-readme`, `#3-feed-changelog-with-sprint-history`), `lifecycle-diagram.md` (`#sprint-lifecycle`), `config-recovery.md` (`#sprint-recovery-chain-takilmış-sprint`, `#sprint-176-örüntüsü`, `#config-kayboldu-ama-sprint-başlatılması-gerekiyor`), `autonomous.md` (`#3-no-auto-sprint-start--governed-tasksprint-execution`), `deckent-nedir.md` (`#sprint-yaşam-döngüsü-8-faz`).

This is a read-only research deliverable; no files were modified.
### docs/guide/autonomous-engine.md — 9 total grep hits

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/autonomous-engine.md:35,36 | `\| kind \| task \| sprint \| capability \| Execution unit — a single worker task, a full sprint, or a broker capability invocation \|`, `spec` row "sprint → directives ref" | frozen-identifier (enum value) + user-visible (prose) | do NOT rename `kind: sprint` enum in isolation; run-text for prose "a full sprint" → "a full run" | real TypeScript union-type literal (`ActionEntry.kind`) used across `execute-dispatcher.ts`, CLI `--kind` flag, and MCP tool — cross-cutting enum decision shared with autonomous.md/autonomous-operations.md/cli.md |
| docs/guide/autonomous-engine.md:110,124 | fenced CLI example `--kind sprint --policy approval-required`, flags reference `--kind (task\|sprint\|capability, default task)` | frozen-identifier | n/a — keep literal flag value `sprint` | same enum/flag-value contract |
| docs/guide/autonomous-engine.md:141,151 | `execute-dispatcher.ts` table row: "runs `task` (`runTaskMode`), `sprint` (`runSprint`), or `capability`..." + `buildEngineRuntime({ policy, runTask, runSprint, reactiveSource? })` | frozen-identifier | n/a — keep `sprint`/`runSprint` identifiers | `runSprint` is the real orchestrator function (also documented in glossary.md) |
| docs/guide/autonomous-engine.md:162,242,267 | "...independent of the human-approval gate on Claude starting deckent sprints...", "Sprint worker-spawn remains advisory.", "...detections flow without a hosted sprint..." | user-visible | run-text: reword each to "run" | cosmetic doc prose |

### docs/reference/enterprise-foundation.md — 7 total grep hits

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/enterprise-foundation.md:33,34 | `\| viewer \| 1 \| read, sprint:read \|` / `\| operator \| 2 \| + write, execute, sprint:write, audit:read, flow:manage \|` | frozen-identifier | n/a — keep `sprint:read`/`sprint:write` permission strings as-is | real RBAC permission-string constants (`src/core/rbac.ts` PERMISSION_MATRIX) — genuine security/authorization contract, HIGH blast-radius if renamed |
| docs/reference/enterprise-foundation.md:47 | "Intended for wiring into sprint/flow/API entry points without breaking non-enterprise setups." | user-visible | run-text: "...run/flow/API entry points..." | cosmetic doc prose |
| docs/reference/enterprise-foundation.md:51 | fenced TS example: `if (!enforceRbac(actor.role, Permission.SPRINT_WRITE, tenantId, ...))` | frozen-identifier | n/a — keep `Permission.SPRINT_WRITE` enum-member identifier | real TS enum member, tied to the `sprint:write` string constant above |
| docs/reference/enterprise-foundation.md:94,104 | "...single-tenant and Sprint Mode are unaffected)" / "A Deckent instance running in single-project Sprint Mode is unaffected." | user-visible | run-text: "...single-tenant and Run Mode are unaffected)" / "...running in single-project Run Mode..." | verify "Sprint Mode" isn't used as a formal named term elsewhere before finalizing |
| docs/reference/enterprise-foundation.md:179 | "...the cost gate will evaluate the estimated cost of the task against both the per-request budget and the global sprint budget." | user-visible | run-text: "...the global run budget." | pairs with `budget_per_sprint` frozen config field — reword only the descriptive phrase |

### docs/reference/health-check.md — 6 total grep hits

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/health-check.md:72 | "**Required:** No. Fails do not block sprint start." | user-visible | run-text: "...do not block run start." | cosmetic |
| docs/reference/health-check.md:86 | "**Required:** Yes. Sprint will not start if Node.js is missing or below v18." | user-visible | run-text: "Run will not start if..." | cosmetic |
| docs/reference/health-check.md:174 | "at the end of each sprint." | user-visible | run-text: "at the end of each run." | cosmetic |
| docs/reference/health-check.md:188 | "\| `DIRECTIVES.md is empty` \| Add sprint goals using `## Task N: …` sections \|" | user-visible | run-text: "Add run goals using..." | cosmetic |
| docs/reference/health-check.md:203 | "...decay will trim on next sprint end \|" | user-visible | run-text: "...decay will trim on next run end" | cosmetic; note cell already contains "run" as a verb elsewhere in the row — no collision (different cell) |
| docs/reference/health-check.md:259 | "**Required:** Yes. Deckent cannot run sprints without write access to these directories." | user-visible | run-text: "Deckent cannot execute runs without write access..." (avoid "run runs" — recommend alternate verb) | cosmetic; flag "run runs" collision, recommend "execute runs"/"start runs" |

### docs/reference/terminal-compat.md — 4 total grep hits

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/terminal-compat.md:3 | "Sprint 359 Task 359-007 (Sıra-52)..." | frozen (historical citation) | n/a — keep as-is | archival work-item citation |
| docs/reference/terminal-compat.md:17,18 | test-file citations "(sprint 285)", "(sprint 354)" | frozen (historical citation) | n/a — keep as-is | archival citations |
| docs/reference/terminal-compat.md:26 | "sprints have already made independently." | user-visible | run-text: "runs have already made independently." | genuine generic-term usage, not a citation — check preceding sentence context |

### docs/reference/mcp-resources.md — 4 total grep hits

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/mcp-resources.md:14 | "\| dashboard \| deckent://dashboard \| application/json \| Live sprint status: agents, progress, usage, alerts \|" | user-visible | run-text: "Live run status: agents, progress, usage, alerts" | resource URI frozen/unrelated, no compat concern |
| docs/reference/mcp-resources.md:16 | "\| directives \| deckent://directives \| ... \| Current DIRECTIVES.md content — sprint goals and tasks \|" | user-visible | run-text: "...— run goals and tasks" | cosmetic |
| docs/reference/mcp-resources.md:17 | "\| memory \| deckent://memory \| ... \| Learned patterns from previous sprints \|" | user-visible | run-text: "Learned patterns from previous runs" | cosmetic |
| docs/reference/mcp-resources.md:18 | "\| retro \| deckent://retro \| ... \| Latest sprint retrospective \|" | user-visible | run-text: "Latest run retrospective" | cosmetic |

### docs/guide/multi-provider.md — 3 total grep hits

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/multi-provider.md:170 | "...(Sprint 248 F1-G). Deckent spawns workers via the `gemini` CLI." | frozen (historical) | n/a — keep as-is | archival citation |
| docs/guide/multi-provider.md:287 | "This enables mixed-fleet sprints where different tasks use different providers concurrently." | user-visible | run-text: "This enables mixed-fleet runs..." | cosmetic |
| docs/guide/multi-provider.md:332 | "...you can mix any combination of providers and models across tasks in the same sprint." | user-visible | run-text: "...across tasks in the same run." | cosmetic |

### docs/guide/onboarding.md — 1 total grep hit

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/onboarding.md:170 | "- **[Quickstart Guide](quickstart.md)** -- run your first sprint after onboarding" | user-visible | run-text: "-- start your first run after onboarding" (avoid "run your first run") | cosmetic; flag verb/noun collision |

---

NOTE: this batch's sub-agent run also covered docs/reference/cli.md, docs/reference/glossary.md, docs/guide/faq.md, docs/guide/dashboard.md, docs/reference/api-endpoints.md, docs/guide/getting-started.md, docs/guide/evolution-and-learning.md, docs/guide/docker-memory.md, and docs/reference/enterprise-integrations.md, but the per-line tables for those 9 files were not returned intact — see the D3-remainder scan for their real findings.

I have all the data I need. Let me compile the full findings report now.

## Findings: "sprint" → "run" rename inventory (9 docs files)

### docs/reference/cli.md — 65 total grep hits, covered by 22 table rows (16 individual + 6 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/cli.md:21 | `### Sprint Workflow` | user-visible | run-text: `### Run Workflow` | markdown heading `#sprint-workflow` — check inbound links from other docs before renaming |
| docs/reference/cli.md:23-30 | `Start a new sprint`, `Plan the next sprint...`, `Run a test sprint — no retro...`, `Finalize a sprint...`, `Clean up after a sprint`, `Review sprint tasks...`, `Show the latest sprint retrospective...`, `Explain what the last sprint did...` (8 TOC list-item descriptions) +8 similar | user-visible | run-text: reword each description to say "run" instead of "sprint" (e.g. "Start a new run") | cosmetic doc prose, no compat concern |
| docs/reference/cli.md:34,37 | `Show the current sprint dashboard`, `Show sprint history from` | user-visible | run-text: "Show the current run dashboard" / "Show run history from" | cosmetic doc prose, no compat concern |
| docs/reference/cli.md:46 | `Run a single one-shot task without a sprint cycle` | user-visible | run-text: "...without a run cycle" | cosmetic doc prose, no compat concern |
| docs/reference/cli.md:72 | `Show KPI scorecard for the current or a specific sprint` | user-visible | run-text: "...for the current or a specific run" | cosmetic doc prose, no compat concern |
| docs/reference/cli.md:131 | `...project configuration, and first-sprint preparation.` | user-visible | run-text: "...and first-run preparation." | cosmetic doc prose, no compat concern |
| docs/reference/cli.md:171 | `# Sprint Workflow` | user-visible | run-text: `# Run Workflow` | markdown heading — same anchor-risk family as line 21; verify no external `#sprint-workflow` link |
| docs/reference/cli.md:175,186,188,189,206,234,243,257,266,279,300,323,332,345,361,429,539,567,1022,1030-1032,1039 | `Start a new sprint. Optionally pass a one-line description...`, `Plan sprint without spawning workers`, `Sprint timeout in milliseconds`, `Plan the next sprint without executing it...`, `Run a test sprint — no retro...`, `Maximum sprint duration...`, `Finalize a sprint: upsert the sprint's...`, `Skip plugin afterSprint hooks`, `Clean up after a sprint...`, `Review sprint tasks with evaluations...`, `Show the latest sprint retrospective...`, `Show delta comparison with previous sprint`, `Explain what the last sprint did...`, `Show the current sprint dashboard...`, `Show sprint history from .brain/sprints/...`, `Run a single one-shot task without a sprint cycle...`, `...since the last sprint`, `Show the KPI scorecard for the current...sprint...`, `Sprint ID to score`, `Show trend series...across sprints`, `Number of sprints to include...`, `deckent kpi --sprint sprint-340` (example command) +many similar | user-visible (prose) / frozen-identifier (example CLI arg values `sprint-042`, `sprint-340`) | run-text: reword surrounding prose to "run"; example ID values like `sprint-042` should become `run-042` only if the underlying ID format itself is renamed (coordinate with `sprintId` schema decision) — otherwise leave example values as `sprint-NNN` for now | example values mirror the real `sprintId` format (`sprint-NNN`) — a real, persisted ID scheme; do not casually reword example IDs without confirming the ID-format decision |
| docs/reference/cli.md:186 | `` `--dry-run` `` \| `Plan sprint without spawning workers` | frozen-identifier (flag name) / user-visible (description) | n/a — keep `--dry-run` flag name; run-text description: "Plan run without spawning workers" | flag name itself unaffected, real CLI contract |
| docs/reference/cli.md:257 | `Finalize a sprint: upsert the sprint's ``retro`` and ``memory`` entries in ``memory.db``...` | user-visible (prose) / frozen-identifier (`retro`/`memory` DB entry type literals) | run-text: "Finalize a run: upsert the run's `retro` and `memory` entries..." — keep `retro`/`memory` type literals verbatim | `retro`/`memory` are literal DB `type` column values (real persisted enum) — frozen; only reword surrounding prose |
| docs/reference/cli.md:266 | `` `--skip-hooks` `` \| `Skip plugin afterSprint hooks` | frozen-identifier (hook name `afterSprint`) | n/a — keep `afterSprint` hook-name identifier; if renaming user-facing description use "Skip plugin after-run hooks" only if `afterSprint` itself is renamed elsewhere in code (out of scope for docs-only rename) | `afterSprint` is a real plugin-hook name referenced by plugin authors — high compat risk if renamed without a code-level deprecation shim |
| docs/reference/cli.md:429 | `Show sprint history from .brain/sprints/. Displays a table of sprints...` | user-visible (prose) / frozen-identifier (`.brain/sprints/` directory path) | run-text: "Show run history from `.brain/sprints/`. Displays a table of runs..." — keep the literal directory path `.brain/sprints/` | `.brain/sprints/` is a real on-disk directory path; renaming only the prose, not the path, unless a filesystem migration is also planned |
| docs/reference/cli.md:460,466 | `` `--sprint <id>` `` \| `Filter by sprint ID`; `deckent usage --sprint sprint-042` | frozen-identifier (flag name `--sprint`) / user-visible (description text "Filter by sprint ID") | n/a — keep `--sprint` flag name (real CLI contract); run-text description: "Filter by run ID" | `--sprint <id>` is a documented CLI flag — real external contract, high compat risk if renamed without deprecation alias |
| docs/reference/cli.md:1022 | `Show the KPI scorecard for the current (or a specific) sprint. Displays pass/fail status...against actual sprint metrics.` | user-visible | run-text: "Show the KPI scorecard for the current (or a specific) run. Displays pass/fail status...against actual run metrics." | cosmetic doc prose, no compat concern |
| docs/reference/cli.md:1030 | `` `--sprint <id>` `` \| `Sprint ID to score _(defaults to the current sprint)_` | frozen-identifier (flag) / user-visible (description) | n/a — keep `--sprint` flag; run-text description: "Run ID to score (defaults to the current run)" | same `--sprint` flag as line 460 — single contract, appears twice |
| docs/reference/cli.md:1039 | `deckent kpi --sprint sprint-340` | frozen-identifier (example CLI invocation with real flag + example ID) | n/a — keep verbatim as a code example matching the frozen `--sprint` flag; only reword if example ID format is renamed | real CLI example, high compat risk if flag renamed without alias |
| docs/reference/cli.md:1130 | `` `--kind <kind>` `` \| `Execution kind: ``task`` (default), ``sprint``, ``capability``` | frozen-identifier (config enum value `sprint`) | n/a — keep identifier, reword surrounding prose only if any exists (none here beyond the enum list itself) | `sprint` is a literal enum value for `--kind`; a real persisted/parsed config value — frozen, high compat risk |
| docs/reference/cli.md:1230 | `` `deckent approve <sprintId> <phase>` `` \| `Approve a pending checkpoint` | frozen-identifier (positional param name `sprintId`) | n/a — keep `<sprintId>` param name; run-text stays as-is (already generic) | `sprintId` positional arg name is a CLI contract; renaming the display name without renaming underlying param is misleading — flag for coordinated rename |
| docs/reference/cli.md:1234 | `` `deckent audit [sprint-id]` `` \| `Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events...` | frozen-identifier (`[sprint-id]` optional arg) / user-visible (description) | n/a — keep `[sprint-id]` arg; run-text: "Run Brain Self-Audit Gate for a run, or query/export/retain audit log events..." | `[sprint-id]` is a real positional CLI arg |
| docs/reference/cli.md:1246,1261,1270-1271,1275,1282,1294,1322,1330,1333,1336,1344,1348-1349,1351,1354,1361,1365,1367,1371,1377-1378 | `` `deckent cleanup` `` \| `Clean up after a sprint`, `` `deckent do <goal>` `` \| `...turn a goal into a sprint plan...`, `` `deckent evolve` `` \| `...cross-sprint trends...`, `` `deckent explain` `` \| `Explain what the last sprint did...`, `` `deckent finalize` `` \| `Finalize a sprint: update MEMORY.md...`, `` `deckent history` `` \| `Show sprint history`, `` `deckent kpi` `` \| `...for the current (or a specific) sprint`, `` `deckent recall <query>` `` \| `Search project memory — ADRs, sprint learnings...`, `` `deckent recover <sprint-id>` `` \| `Recover from a crashed or stuck sprint...`, `` `deckent reject <sprintId> <phase>` `` \| `Reject a pending checkpoint`, `` `deckent report` `` \| `Show cross-sprint agent/skill trend report`, `` `deckent resume <sprintId>` `` \| `Resume a sprint from its latest checkpoint`, `` `deckent retro` `` \| `Show the latest sprint retrospective`, `` `deckent review` `` \| `Review sprint tasks with evaluations`, `` `deckent run` `` \| `Run managed doc updates without a sprint`, `` `deckent set-directives` `` \| `Write sprint goals to DIRECTIVES.md...`, `` `deckent start [description]` `` \| `Start a new sprint...`, `` `deckent stats <name>` `` \| `Show sprint-by-sprint performance...`, `` `deckent status` `` \| `Show the current sprint dashboard`, `` `deckent sync` `` \| `Sync adapter files...since last sprint`, `` `deckent test` `` \| `Run a test sprint...` (command reference table, ~20 rows) +many similar | frozen-identifier (positional args `[sprint-id]`, `<sprintId>`) / user-visible (all description text) | run-text: reword every description column to "run" (e.g. "Clean up after a run", "Recover from a crashed or stuck run"); keep `[sprint-id]`/`<sprintId>` positional-arg names as-is unless a coordinated CLI param rename is also planned | positional args are real CLI contracts appearing repeatedly across the full command-reference table (lines 1230-1378); coordinate rename of description text with any future param-rename decision |
| docs/reference/cli.md:1234 (special) | note: `deckent run` at line 1354 already exists as a DIFFERENT command name (`Run managed doc updates without a sprint`) | user-visible — naming collision risk | run-text: rewording "sprint" → "run" in prose is fine, but note that `deckent run` is ALREADY a taken command name distinct from the "sprint" concept — do not let renamed terminology collide with the existing `deckent run` command semantics | HIGH RISK: this repo already has a `deckent run <description>` command (line 46, 1354) with unrelated semantics ("Run a single one-shot task without a sprint cycle" / "Run managed doc updates without a sprint") — renaming "sprint" to "run" project-wide will create naming ambiguity against this pre-existing command; flag for product decision before executing rename |

---

### docs/reference/glossary.md — 54 total grep hits, covered by 24 table rows (18 individual + 6 grouped)

**This is the highest-risk file in the batch.** It contains the canonical `### sprint` (line 388) and `### sprintId` (line 392) term-definition headings.

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/glossary.md:25 | `...tavsiye edilen sprint metodolojisini analiz eden modül...` | user-visible | run-text: "...tavsiye edilen çalışma (run) metodolojisini analiz eden modül..." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:26,82,90,98,130,154,198,242,250,258,270,314,330,338,346,350,394 | `**Sprint 9: Analyzer & CI Pipeline**`, `**Sprint 037**`, `**Sprint 17: Reliability**`, `**Sprint 17: cleanup()**`, `**Sprint 17: Dashboard reset**`, `**Sprint 16: Watch Mode**`, `**Sprint 038**`, `**Sprint 16: model inference**`, `**Sprint 17: MCP background jobs**`, `**Sprint 17: Sprint ID safety**` (×2), `**Sprint 037** — src/core/model-equivalence.ts`, `**Sprint 16: Worker log capture**`, `**Sprint 037**`, `**Sprint 037** — src/core/provider.ts` (×2), `**Sprint 037** — src/orchestra/sprint-controller.ts` +many similar | user-visible (these are "Blueprint §N — Sprint NN: ..." changelog/provenance citations, historical sprint numbers) | run-text: these cite the historical numbered sprint in which the feature was introduced — likely should NOT be renamed (they refer to a specific past sprint-numbered event, not the generic concept); if renaming the *word* "Sprint" throughout, consider leaving numbered historical citations like "Sprint 037" as an immutable historical record, OR reword to "Run 037" for full consistency — needs a product decision | historical citation values, not identifiers referenced elsewhere in code; low technical compat risk but a documentation-consistency decision is needed |
| docs/reference/glossary.md:37 | `` `planSprint()` `` çağrısında `{ asDraft: true }` parametresi... | frozen-identifier (function name `planSprint()`) | n/a — keep identifier, reword surrounding prose only (currently no extra prose beyond the function name itself) | `planSprint()` is a real internal function name (`src/orchestra/...`); renaming requires a coordinated code rename, out of scope for docs-only pass |
| docs/reference/glossary.md:57 | `src/orchestra/brain.ts — Sprint yaşam döngüsünün tamamını yöneten orkestratör modülü...` | user-visible (prose) / frozen-identifier (file path `src/orchestra/brain.ts`) | run-text: "...Run (sprint) yaşam döngüsünün tamamını yöneten orkestratör modülü..." — keep file path verbatim | file path frozen; prose renameable |
| docs/reference/glossary.md:68-69 | `### budget_per_sprint` / `API modunda her sprint için maksimum dolar harcamasını sınırlayan yapılandırma değeri.` | frozen-identifier (heading = literal config key name `budget_per_sprint`) / user-visible (body prose) | n/a — keep `budget_per_sprint` config-key heading; run-text body: "API modunda her run için maksimum dolar harcamasını sınırlayan yapılandırma değeri." | `### budget_per_sprint` heading is BOTH a literal persisted config-key name AND a markdown anchor (`#budget_per_sprint`) — frozen on both counts; do not rename the heading text itself |
| docs/reference/glossary.md:89 | `MCP ``deckent_start`` aracının sprint'i arka planda çalıştırmak için kullandığı Node.js yöntemi...` | user-visible | run-text: "MCP `deckent_start` aracının run'ı arka planda çalıştırmak için kullandığı Node.js yöntemi..." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:97 | `Sprint sonunda .tasks/ altındaki tüm geçici dosyaları...temizleyen fonksiyon.` | user-visible | run-text: "Run sonunda `.tasks/` altındaki tüm geçici dosyaları...temizleyen fonksiyon." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:125 | `Auditor'ın her taramada üzerine yazdığı canlı sprint durum dosyası...` | user-visible | run-text: "Auditor'ın her taramada üzerine yazdığı canlı run durum dosyası..." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:129 | `Web ve terminal gösterge panelinin veri modeli; PLAN fazında sıfırlanır, sprint ID uyuşmazlığında Auditor tarafından yeniden başlatılır.` | user-visible (prose) / frozen-identifier (implicit reference to `sprintId` field) | run-text: "...run ID uyuşmazlığında Auditor tarafından yeniden başlatılır." — but note this describes the actual `sprintId`-mismatch detection logic | describes real runtime behavior keyed on the `sprintId` field; reword prose only, the underlying field-name decision is separate |
| docs/reference/glossary.md:137 | `.brain/ dizininin 900 satır sınırını aşması durumunda eski bellek girdilerini arşivleyen mekanizma. Her sprint sonunda tetiklenir.` | user-visible | run-text: "...Her run sonunda tetiklenir." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:145 | `Tam sprint yaşam döngüsünü başlatan CLI komutu; doctor → plan → spawn → execute → evaluate → retro → cleanup sırasını çalıştırır.` | user-visible | run-text: "Tam run yaşam döngüsünü başlatan CLI komutu; ..." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:165 | `Operatörün (kullanıcının) sprint hedeflerini yazdığı dosya. Brain planlama sırasında bu dosyayı ilk okur.` | user-visible | run-text: "Operatörün (kullanıcının) run hedeflerini yazdığı dosya..." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:196-198 | `### finalizeSprint()` / `Sprint sonrası tüm işlemleri çalıştıran fonksiyon: sprint log, MEMORY.md, RETRO.md, PROJECT-IDENTITY.md güncelleme, decay, plugin hooks. Structured mode'da eksik kalan post-sprint aksiyonlarını düzeltir. deckent finalize CLI komutu ile de çağrılabilir.` / `**Sprint 038**` | frozen-identifier (heading = literal function name `finalizeSprint()`, and it's a markdown anchor `#finalizesprint`) / user-visible (body prose) | n/a — keep `### finalizeSprint()` heading (real function name + anchor); run-text body: "Run sonrası tüm işlemleri çalıştıran fonksiyon: run log, MEMORY.md, ... post-run aksiyonlarını düzeltir." | `finalizeSprint()` is a real exported function name in `src/orchestra/`; heading doubles as inbound-link anchor `#finalizesprint` — frozen, flag for coordinated code+docs rename if function itself is ever renamed |
| docs/reference/glossary.md:249-250 | `MCP deckent_start aracının arka planda başlattığı sprint için döndürdüğü benzersiz iş tanımlayıcısı. Durum .deckent/jobs/{jobId}.json dosyasında izlenir.` | user-visible (prose) / frozen-identifier (`{jobId}.json` path pattern) | run-text: "MCP `deckent_start` aracının arka planda başlattığı run için döndürdüğü benzersiz iş tanımlayıcısı..." — keep `{jobId}.json` path pattern | `.deckent/jobs/{jobId}.json` file path pattern frozen |
| docs/reference/glossary.md:256-258 | `### last_sprint_id` / `Sprint numarasının geriye gitmemesini garantilemek için .deckent/config.json içinde saklanan son sprint ID değeri.` | frozen-identifier (heading = literal persisted config-key name `last_sprint_id`, and markdown anchor `#last_sprint_id`) / user-visible (body prose) | n/a — keep `### last_sprint_id` heading (real config key persisted in `.deckent/config.json`); run-text body: "Run numarasının geriye gitmemesini garantilemek için `.deckent/config.json` içinde saklanan son run ID değeri." | **HIGH RISK**: `last_sprint_id` is a real persisted JSON config key in every user's `.deckent/config.json` on disk — renaming requires a migration/back-compat shim, not just a docs rename; heading is also a stable anchor `#last_sprint_id` |
| docs/reference/glossary.md:273 | `Bir sprintte eş zamanlı çalışabilecek maksimum Worker sayısı; plan moduna göre 3–10 arasında değişir.` | user-visible | run-text: "Bir run'da eş zamanlı çalışabilecek maksimum Worker sayısı; ..." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:281 | `.brain/memory.db — Memory V2 SQLite single source of truth...Tüm ADR, sprint, borç, pattern ve kimlik kayıtlarını saklar...` | user-visible (prose) / frozen-identifier (file path `.brain/memory.db`) | run-text: "...Tüm ADR, run, borç, pattern ve kimlik kayıtlarını saklar..." — keep `.brain/memory.db` path | file path frozen; prose renameable |
| docs/reference/glossary.md:297 | `Deckent sisteminin en üst izin seviyesindeki kullanıcısı; DIRECTIVES.md yazar, sprint planlarını onaylar, herhangi bir agent'ı durdurabilir.` | user-visible | run-text: "...run planlarını onaylar, herhangi bir agent'ı durdurabilir." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:309 | `...Decay: store.decay(currentSprintNum, decayAfterSprints).` | frozen-identifier (function param names `currentSprintNum`, `decayAfterSprents` inside code-style inline reference) | n/a — keep identifier, reword surrounding prose only (none present beyond the call itself) | real function signature reference (`store.decay(...)`) — parameter names frozen |
| docs/reference/glossary.md:317 | `deckent plan komutuyla çalışan, Brain'in sprint planı oluşturduğu ancak Worker'ları başlatmadığı özel mod.` | user-visible | run-text: "`deckent plan` komutuyla çalışan, Brain'in run planı oluşturduğu ancak Worker'ları başlatmadığı özel mod." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:329 | `Kalıcı proje hafızası dosyası (.brain/ altında)...Her sprint sonunda güncellenir.` | user-visible | run-text: "...Her run sonunda güncellenir." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:333,341,346,349 | `Gelecek fazda (Sprint 20+) planlanmış...`, `Claude varsayılan; Codex/Gemini tam sprint + worker desteği...`, `spawnWorkers() içindeki provider yönlendirme mantığı...Mixed sprint desteği sağlar.` | user-visible (mixed with a historical "Sprint 20+" citation at line 333) | run-text: reword "tam sprint + worker desteği" → "tam run + worker desteği"; "Mixed sprint desteği" → "Mixed run desteği"; "Sprint 20+" historical citation — same open question as the grouped Sprint-N citations above | cosmetic doc prose except the "Sprint 20+" phase citation, which follows the same historical-citation caveat as noted for line 26 group |
| docs/reference/glossary.md:357 | `Sprint retrospektifi Memory V2 DB'de type='retro' entry olarak saklanır; .brain/exports/summary.md içinde özetlenir...` | user-visible (prose) / frozen-identifier (`type='retro'` DB literal) | run-text: "Run retrospektifi Memory V2 DB'de `type='retro'` entry olarak saklanır..." — keep `type='retro'` literal | `type='retro'` is a real persisted DB enum value; frozen |
| docs/reference/glossary.md:364-365 | `### runSprint` / `Brain'in tam sprint yaşam döngüsünü yürüten ana fonksiyonu (16 adım: check usage → plan → spawn → … → cleanup).` | frozen-identifier (heading = literal function name `runSprint`, markdown anchor `#runsprint`) / user-visible (body prose) | n/a — keep `### runSprint` heading (real exported function, likely candidate for eventual code rename to `runFlow`/`runOrchestration` but that's a code change, not docs); run-text body: "Brain'in tam run yaşam döngüsünü yürüten ana fonksiyonu..." | `runSprint` is THE core orchestrator function name in `src/orchestra/brain.ts` — extremely high compat risk; heading doubles as anchor `#runsprint`; flag as a top-priority coordinated code+docs rename target, ironically the function's own name already contains "run" as a prefix which may create naming confusion post-rename (e.g. would become `runRun`?) — needs explicit naming decision |
| docs/reference/glossary.md:373 | `Auditor'ın Brain süreci içinde setInterval(30000) ile çalıştırdığı periyodik tarama döngüsü; Sprint SPAWN fazından önce başlar, değerlendirmeden önce durur.` | user-visible (prose) / frozen-identifier (phase name `SPAWN`) | run-text: "...Run SPAWN fazından önce başlar, değerlendirmeden önce durur." — keep `SPAWN` phase-name literal | `SPAWN` is a literal sprint-phase enum value used across dashboard/API; frozen, only "Sprint" prefix word renames |
| docs/reference/glossary.md:388-390 | `### sprint` / `Deckent'in temel iş birimi; bir direktifi (hedefi) alıp planlama → uygulama → değerlendirme → retrospektif döngüsünde işleme koyan yinelemeli süreç.` / `**Blueprint §7** — "Sprint Lifecycle"` | user-visible — **the canonical glossary term-definition heading** | run-text: `### run` — "Deckent'in temel iş birimi; bir direktifi (hedefi) alıp planlama → uygulama → değerlendirme → retrospektif döngüsünde işleme koyan yinelemeli süreç." (Blueprint citation "Sprint Lifecycle" is a historical section title, same open question as other Sprint-N citations) | **HIGHEST-RISK ITEM IN THE ENTIRE BATCH.** Heading is markdown anchor `#sprint` — the single most likely inbound-link target across the whole docs site (any doc/page linking to "the sprint glossary term" almost certainly uses `glossary.md#sprint` or `/reference/glossary#sprint`). Renaming this heading MUST include either (a) a redirect/alias anchor, or (b) a sitewide grep+update of every `#sprint` inbound link BEFORE the heading is renamed. Do not rename in isolation. |
| docs/reference/glossary.md:392-394 | `### sprintId` / `Her sprintin benzersiz tanımlayıcısı (sprint-NNN formatı); .deckent/config.json içindeki last_sprint_id değeri geriye gitmesini önler.` / `**Blueprint §19** — "Sprint 17: Sprint ID safety"` | frozen-identifier (heading = literal field/param name `sprintId`, and markdown anchor `#sprintid`) / user-visible (body prose) | n/a — keep `### sprintId` heading (real field name used in API responses, CLI params, DB columns per project-wide convention); run-text body: "Her run'ın benzersiz tanımlayıcısı (`sprint-NNN` formatı); `.deckent/config.json` içindeki `last_sprint_id` değeri geriye gitmesini önler." | **SECOND-HIGHEST-RISK anchor in this file** (`#sprintid`) — `sprintId` is the literal field name returned by `/api/status`, `/api/sprint`, `/api/history`, CLI `--sprint <id>` flag semantics, and DB column — a real, pervasive external contract. If the rename effort ever touches the underlying identifier (not just docs), this is ground zero; for a docs-only pass, keep the heading, reword body prose only, and do NOT rename the `sprint-NNN` format string used as the example |
| docs/reference/glossary.md:401 | `Brain'in sprint SPAWN fazında başlattığı, Auditor tarama döngüsünü çalıştıran fonksiyon; değerlendirme öncesinde clearInterval ile durdurulur.` | user-visible (prose) / frozen-identifier (`SPAWN` phase, `clearInterval`) | run-text: "Brain'in run SPAWN fazında başlattığı..." — keep `SPAWN`/`clearInterval` literals | same `SPAWN` phase-literal note as line 373 |
| docs/reference/glossary.md:413 | `Çözülmemiş teknik borcun önceliğini artıran kural: NORMAL → 2 sprint → HIGH → 3+ sprint → CRITICAL (otomatik bir sonraki sprinte dahil edilir).` | user-visible | run-text: "...NORMAL → 2 run → HIGH → 3+ run → CRITICAL (otomatik bir sonraki run'a dahil edilir)." | cosmetic doc prose, no compat concern |
| docs/reference/glossary.md:466 | `*Toplam terim sayısı: 68+. Sözlük son olarak Sprint 286'da güncellendi...*` | user-visible (historical citation, same open question as other Sprint-N citations) | run-text: leave as historical "Sprint 286" citation OR reword to "Run 286" per the sitewide historical-citation decision (see line 26 group note) | historical citation, low compat risk, needs consistency decision |

---

### docs/guide/faq.md — 36 total grep hits, covered by 20 table rows (14 individual + 6 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/faq.md:15 | `5. [How long does a sprint take?](#5-how-long-does-a-sprint-take)` | user-visible — TOC entry + markdown anchor | run-text: `5. [How long does a run take?](#5-how-long-does-a-run-take)` | this generates a heading-derived anchor (`#5-how-long-does-a-sprint-take`) that changes automatically if the heading (line 205) is renamed — both must be updated together; flag as an internal-consistency pair, low external-link risk (FAQ anchors less commonly deep-linked than glossary) |
| docs/guide/faq.md:38,41,50 | `...remembers successful patterns and applies them to future sprints`, `...the Nervous System monitors sprint health...`, `...Deckent is designed for interactive development sprints with human oversight...` | user-visible | run-text: reword each to "future runs" / "monitors run health" / "interactive development runs" | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:177-179 | `` `deckent_plan` `` — Plan the current sprint / `` `deckent_status` `` — Check live sprint status / `` `deckent_start` `` — Launch a sprint | frozen-identifier (MCP tool names) / user-visible (descriptions) | n/a — keep `deckent_plan`/`deckent_status`/`deckent_start` MCP tool names; run-text descriptions: "Plan the current run" / "Check live run status" / "Launch a run" | MCP tool names are a real external contract (used by MCP clients); descriptions freely renameable |
| docs/guide/faq.md:184 | `` `deckent://dashboard` `` — See live sprint dashboard | frozen-identifier (MCP resource URI) / user-visible (description) | n/a — keep `deckent://dashboard` URI; run-text: "See live run dashboard" | MCP resource URI is a real contract |
| docs/guide/faq.md:205-207 | `## 5. How long does a sprint take?` / `A **sprint** is one complete cycle of task planning, parallel execution, evaluation, and learning. Sprint duration depends on several factors.` | user-visible — heading is the anchor target paired with line 15's TOC link | run-text: `## 5. How long does a run take?` / "A **run** is one complete cycle of task planning, parallel execution, evaluation, and learning. Run duration depends on several factors." | heading anchor `#5-how-long-does-a-sprint-take` changes on rename — must update the TOC link at line 15 in the same change; internal-only risk (both live in this file) |
| docs/guide/faq.md:211,220,222,226,230,234 | `Each sprint progresses through **8 phases**...`, `Sprint learnings written to memory.db`, `Sprint files archived, workers terminated`, `**Simple sprint** (3 tasks, quick fixes):`, `**Medium sprint** (8 tasks, feature work):`, `**Complex sprint** (20+ tasks, major refactor):` +1 similar | user-visible | run-text: "Each run progresses through **8 phases**...", "Run learnings written to memory.db", "Run files archived, workers terminated", "**Simple run** (3 tasks, quick fixes):", "**Medium run** (8 tasks, feature work):", "**Complex run** (20+ tasks, major refactor):" | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:246 | `### Interrupting or Recovering a Sprint` | user-visible — subheading with its own anchor `#interrupting-or-recovering-a-sprint` | run-text: `### Interrupting or Recovering a Run` | internal anchor rename, check for any inbound links (low likelihood but verify) |
| docs/guide/faq.md:250-252 | `deckent cleanup            # Archive task files, end sprint` / `deckent recover <sprint-id>  # Re-evaluate partial results from a stalled sprint` / `deckent resume <sprintId>  # Resume from the latest checkpoint` (fenced code block, shell comments) | frozen-identifier (CLI commands + `<sprint-id>`/`<sprintId>` param names) / user-visible (trailing shell-comment descriptions) | n/a — keep `deckent cleanup`/`deckent recover <sprint-id>`/`deckent resume <sprintId>` commands and param names; run-text comments: "# Archive task files, end run", "# Re-evaluate partial results from a stalled run", "# Resume from the latest checkpoint" | commands + positional param names are real CLI contracts inside a fenced code block; only the trailing `#` comment text is prose |
| docs/guide/faq.md:305 | `This happens after sprint evaluation — no manual intervention needed.` | user-visible | run-text: "This happens after run evaluation — no manual intervention needed." | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:330,335 | `- Sprint session (named after the project)`, `**Sequential execution** — Each ``deckent start`` runs until the sprint completes. To run sprints in parallel...` | user-visible | run-text: "- Run session (named after the project)", "...Each `deckent start` runs until the run completes. To run multiple runs in parallel..." | note: "run" already appears as a verb here ("runs until", "To run sprints") — renaming the noun "sprint"→"run" next to the existing verb "run" creates awkward repetition ("run until the run completes... to run runs in parallel"); needs careful copy-editing, not a mechanical find-replace |
| docs/guide/faq.md:347 | `3. **Coordination** — Document which projects are in active sprints to avoid quota contention` | user-visible | run-text: "...Document which projects are in active runs to avoid quota contention" | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:353 | `**Short answer:** Deckent can be used in CI/CD for health checks and verification steps, but it is designed for interactive development sprints.` | user-visible | run-text: "...but it is designed for interactive development runs." | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:376 | `#### ❌ Long, unattended sprints on CI servers` | user-visible — subheading with anchor | run-text: `#### ❌ Long, unattended runs on CI servers` | anchor rename, low external-link likelihood but verify |
| docs/guide/faq.md:380 | `- Sprint timeouts may occur on slow CI agents` | user-visible | run-text: "- Run timeouts may occur on slow CI agents" | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:424 | `4. **Keep sprints short** — limit tasks and use ``economy`` or ``standard`` tier models` | user-visible (prose) / frozen-identifier (`economy`/`standard` tier enum values) | run-text: "4. **Keep runs short** — limit tasks and use `economy` or `standard` tier models" — keep tier literals | `economy`/`standard` are real config-tier enum values, unrelated to sprint rename but frozen regardless |
| docs/guide/faq.md:477 | `...Full sprint-worker support via Ollama is a stub — workers will run but tool-use may be limited...` | user-visible | run-text: "...Full run-worker support via Ollama is a stub — workers will run but tool-use may be limited..." | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:510 | `Fallback events are recorded in memory.db for review after the sprint.` | user-visible | run-text: "...for review after the run." | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:517 | `The **Autonomous engine** runs authority-bounded continuous work from a persistent backlog. It dispatches recurring, one-off, and reactive items without requiring a new sprint per task.` | user-visible | run-text: "...without requiring a new run per task." | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:577,615,635,638 | `...it continuously observes sprint health and surfaces proposals...`, `**Memory V2**...holds ADRs, sprint learnings, patterns, debt records...`, `**Sprint learnings** — What worked and what didn't, per sprint`, `**Retrospectives** — Sprint-by-sprint summaries` | user-visible | run-text: "...observes run health...", "...holds ADRs, run learnings...", "**Run learnings** — What worked and what didn't, per run", "**Retrospectives** — Run-by-run summaries" | cosmetic doc prose, no compat concern |
| docs/guide/faq.md:684 | `Experimental means: the feature works but the API surface may change between beta releases. Sprint-based orchestration remains the stable path for production use.` | user-visible | run-text: "...Run-based orchestration remains the stable path for production use." | cosmetic doc prose, no compat concern |

---

### docs/guide/dashboard.md — 30 total grep hits, covered by 15 table rows (10 individual + 5 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/dashboard.md:5,7 | `surface**: sprint state, worker activity, memory, debt, and approval history...`, `running commands, driving a sprint — belong in the **terminal**...` | user-visible | run-text: "surface**: run state, worker activity, memory, debt, and approval history...", "...driving a run — belong in the **terminal**..." | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:33 | `session to approve/reject requests, start sprints, and hold conversations. The dashboard is` | user-visible | run-text: "...start runs, and hold conversations..." | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:51-52 | `The serve process runs in the foreground. The dashboard stays responsive even when a sprint / is running because sprint execution is detached from the serve event loop.` | user-visible | run-text: "...even when a run / is running because run execution is detached from the serve event loop." | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:82,84,88,90 | `The sprint control panel. Shows:`, `**Sprint phase timeline** — PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`, `**New Sprint button** — opens the sprint creation modal`, `Use this page to monitor a running sprint and to start new ones.` | user-visible (prose) / frozen-identifier (phase-name literals `PLAN`, `SPAWN`, `EXECUTE`, `EVALUATE`, `FIX`, `RETRO`, `DECAY`, `CLEANUP`) | run-text: "The run control panel. Shows:", "**Run phase timeline** — PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP" (keep phase names), "**New Run button** — opens the run creation modal", "Use this page to monitor a running run and to start new ones." | phase-name enum literals frozen; also note UI button label "New Sprint" — if the actual dashboard button text changes to "New Run" that's a product/UI change beyond docs, flag for coordinated frontend update |
| docs/guide/dashboard.md:94-95 | `Live sprint status view. Shows the current sprint ID, phase, task breakdown (PENDING / EXECUTING / DONE / NO_GO), worker list, and resource usage metrics.` | user-visible (prose) / frozen-identifier (status enum literals `PENDING`/`EXECUTING`/`DONE`/`NO_GO`, and "sprint ID" referring to the real `sprintId` field) | run-text: "Live run status view. Shows the current run ID, phase, task breakdown (PENDING / EXECUTING / DONE / NO_GO), worker list, and resource usage metrics." — keep status enum literals | status literals frozen (match `/api/status` response shape); "sprint ID" phrase describes the real `sprintId` API field — reword phrase but the underlying field name is a separate decision (see glossary `sprintId` entry) |
| docs/guide/dashboard.md:99-100 | `Sprint history log. Lists past sprints with their outcome (DONE, NO_GO, GO_WITH_TECH_DEBT), task counts, duration, and timestamps. Click any sprint row to expand details.` | user-visible (prose) / frozen-identifier (outcome enum literals `DONE`/`NO_GO`/`GO_WITH_TECH_DEBT`) | run-text: "Run history log. Lists past runs with their outcome (DONE, NO_GO, GO_WITH_TECH_DEBT), task counts, duration, and timestamps. Click any run row to expand details." | outcome literals frozen; corresponds to `/api/history` response, matches api-endpoints.md |
| docs/guide/dashboard.md:110 | `self-assessments). Each entry shows the debt description, originating sprint, and whether` | user-visible | run-text: "...the debt description, originating run, and whether" | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:159,165 | `Displays the brain memory snapshot — ADR entries, sprint learnings, patterns, and debt.`, `pattern, retro, debt), filtering by tag, sprint range, and status. Supports full-text` | user-visible | run-text: "...ADR entries, run learnings, patterns, and debt.", "...filtering by tag, run range, and status..." | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:180 | `View and edit DIRECTIVES.md from the browser. Use this page to draft your next sprint's` | user-visible | run-text: "...Use this page to draft your next run's" | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:209-211 | `Sprint KPI scorecard. Displays cost, token usage, cache hit rate, retry rate, task completion rate, and quality metrics for a sprint. Data is sourced from the deckent_kpi MCP tool and the sprint retrospective record.` | user-visible (prose) / frozen-identifier (`deckent_kpi` MCP tool name) | run-text: "Run KPI scorecard. Displays cost, token usage, cache hit rate, retry rate, task completion rate, and quality metrics for a run. Data is sourced from the `deckent_kpi` MCP tool and the run retrospective record." — keep `deckent_kpi` tool name | `deckent_kpi` MCP tool name is a real contract, frozen |
| docs/guide/dashboard.md:218,221,224-229 | `## Starting a Sprint via the DIRECTIVES Editor`, `2. Click **New Sprint** — the sprint creation modal opens.`, `4. Edit the directives to describe your sprint goals and tasks.`, `5. The **Start Sprint** button is disabled when the directives textarea is empty — fill it`, `6. Click **Start Sprint**. The sprint starts as a detached process; the dashboard does not`, `7. The sprint phase timeline on the Dashboard page updates in real time via SSE.` | user-visible — heading with anchor `#starting-a-sprint-via-the-directives-editor`, and describes literal UI button labels "New Sprint" / "Start Sprint" | run-text: `## Starting a Run via the DIRECTIVES Editor`, "2. Click **New Run** — the run creation modal opens.", "4. Edit the directives to describe your run goals and tasks.", "5. The **Start Run** button is disabled...", "6. Click **Start Run**. The run starts as a detached process...", "7. The run phase timeline on the Dashboard page updates in real time via SSE." | heading anchor rename (verify inbound links); "New Sprint"/"Start Sprint" describe literal dashboard UI button labels — renaming docs text implies a matching frontend UI copy change is needed in `src/dashboard/` (out of scope for this docs-only pass, but flag as a dependency) |
| docs/guide/dashboard.md:238 | `{ "message": "What is the current sprint status?" }` (JSON example payload inside a code block) | user-visible (example chat-message text, not a real field/schema) | run-text: `{ "message": "What is the current run status?" }` | this is example free-text chat input, not a schema field — safe to reword, no compat concern |
| docs/guide/dashboard.md:250,264 | `ApprovalBroker request, start a sprint, or hold a conversation from here rather than from`, `The Terminal dock is available on all pages, making it convenient to start a sprint,` | user-visible | run-text: "...start a run, or hold a conversation..." / "...making it convenient to start a run," | cosmetic doc prose, no compat concern |
| docs/guide/dashboard.md:280-281 | `**Sprint start freezes the dashboard** — upgrade to deckent v1.0.0-beta.1+. Earlier / versions ran the sprint in the serve process. Current versions use a detached child process.` | user-visible — troubleshooting subheading | run-text: "**Run start freezes the dashboard** — upgrade to deckent v1.0.0-beta.1+. Earlier / versions ran the run in the serve process..." | this is a troubleshooting-heading bullet, not an `##`/`###` markdown heading with its own anchor — low anchor risk, but verify formatting (appears to be a bold-text list item, not a heading) |

---

### docs/reference/api-endpoints.md — 20 total grep hits, covered by 13 table rows (10 individual + 3 grouped)

**Contains the real `GET /api/sprint` HTTP route and `sprint`/`sprintId` JSON fields — these are frozen external contracts.**

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/api-endpoints.md:8 | `> **Source last verified:** Sprint 346 (2026-06-28) — vs src/api/server.ts.` | user-visible — historical citation (same open question as glossary Sprint-N citations) | run-text: leave as "Sprint 346" historical citation or reword per sitewide decision | historical provenance note, low compat risk |
| docs/reference/api-endpoints.md:23 | `## 2. Sprint & Status Read-Side` | user-visible — section heading with anchor `#2-sprint--status-read-side` | run-text: `## 2. Run & Status Read-Side` | anchor rename, verify no inbound cross-doc links to this exact anchor (e.g. from dashboard.md or CLAUDE.md contract references) |
| docs/reference/api-endpoints.md:27 | `` GET `` \| `` `/api/status` `` \| required \| `Live dashboard JSON (sprint, agents, progress, alerts). Returns 200 with {idle: true, sprint: {phase: 'IDLE'}, lastSprint: {...}} when no active sprint — **never returns 404**` | frozen-identifier (JSON field names `sprint`, `lastSprint`, enum value `phase: 'IDLE'`) / user-visible (surrounding description prose "Live dashboard JSON...", "no active sprint") | run-text: "Live dashboard JSON (run, agents, progress, alerts). Returns `200` with `{idle: true, sprint: {phase: 'IDLE'}, lastSprint: {...}}` when no active run — **never returns 404**" — keep `sprint`/`lastSprint` JSON field names and `'IDLE'` enum verbatim | **REAL API CONTRACT**: `sprint` and `lastSprint` are literal top-level JSON response fields of `GET /api/status` (matches `DashboardState.sprint` referenced in the task context) — frozen; renaming these fields is a breaking API change requiring versioning, not a docs-only edit |
| docs/reference/api-endpoints.md:28 | `` GET `` \| `` `/api/sprint` `` \| required \| `Latest sprint markdown log parsed as JSON (id, metrics, tasks); 404 when no sprint logs` | frozen-identifier (HTTP route `/api/sprint`) / user-visible (description prose) | n/a — keep the `/api/sprint` route path; run-text description: "Latest run markdown log parsed as JSON (`id, metrics, tasks`); 404 when no run logs" | **THE HTTP ROUTE ITSELF**: `GET /api/sprint` is a real, versioned HTTP endpoint — renaming the route is a breaking API change requiring a new route + deprecation period, far outside docs-only scope. This is the single highest-risk item in this file. |
| docs/reference/api-endpoints.md:29 | `` GET `` \| `` `/api/history` `` \| required \| `Array of all parsed sprint logs (newest last)` | user-visible (description prose only; route name `/api/history` itself has no "sprint" in it) | run-text: "Array of all parsed run logs (newest last)" | cosmetic doc prose, route path unaffected |
| docs/reference/api-endpoints.md:34 | `` GET `` \| `` `/api/job/:jobId` `` \| required \| `Async job status for /api/start-spawned sprints — {id, status, result?, error?}; 404 when not found` | user-visible (prose) | run-text: "Async job status for `/api/start`-spawned runs — `{id, status, result?, error?}`; 404 when not found" | cosmetic doc prose, no compat concern (route/field names here don't contain "sprint") |
| docs/reference/api-endpoints.md:54 | `## 4. Sprint Control (Mutating)` | user-visible — section heading with anchor `#4-sprint-control-mutating` | run-text: `## 4. Run Control (Mutating)` | anchor rename, verify inbound links |
| docs/reference/api-endpoints.md:58-61 | `` POST `` \| `` `/api/start` `` \| required \| `Starts a sprint in the background; returns 202 with {jobId, status: 'started'}...`; `` POST `` \| `` `/api/plan` `` \| required \| `Plans a sprint synchronously...`; `` GET `` \| `` `/api/directives` `` \| ...; `` POST `` \| `` `/api/directives` `` \| `Alias for POST /api/set-directives; writes DIRECTIVES.md...` | user-visible (all description prose; route paths `/api/start`, `/api/plan`, `/api/directives` don't literally contain "sprint") | run-text: "Starts a run in the background; returns `202` with `{jobId, status: 'started'}`. Returns `409` if a running job already exists...", "Plans a run synchronously, returning the plan envelope..." | cosmetic doc prose; routes/JSON fields here (`jobId`, `status`) don't contain "sprint" literal, so no route-level compat issue |
| docs/reference/api-endpoints.md:78 | `` GET `` \| `` `/api/events` `` \| ... \| `...Also pushes typed frames (event: hb, event: result) via the live-event bridge (DASH-RT-1, Sprint 284)` | user-visible — historical citation "Sprint 284" | run-text: description prose stays SSE-related; "Sprint 284" historical citation — same open question as other Sprint-N citations | historical citation, low compat risk |
| docs/reference/api-endpoints.md:80-81 | `` GET `` \| `` `/api/output-stream` `` \| ... \| `Worker output fan-out SSE (Sprint 230)...`; `` GET `` \| `` `/api/workers/:taskId/logs/stream` `` \| ... \| `Live tail of .tasks/task-<id>.log for a specific worker (DASH-RT-2, Sprint 284)...` | user-visible — historical citations "Sprint 230"/"Sprint 284" mixed into route descriptions | run-text: keep prose otherwise unchanged; historical citations per sitewide decision | historical citations, low compat risk |
| docs/reference/api-endpoints.md:205 | `` GET `` \| `` `/api/kpi` `` \| required \| `Sprint KPI scorecard (?sprint=&tenantId=)` | frozen-identifier (query param name `?sprint=`) / user-visible (description "Sprint KPI scorecard") | n/a — keep `?sprint=` query param; run-text description: "Run KPI scorecard (`?sprint=&tenantId=`)" | `?sprint=` is a real query-string parameter name on `/api/kpi` — frozen, matches the `--sprint <id>` CLI flag and `sprintId` field family |
| docs/reference/api-endpoints.md:243 | `## 19. Embedded Terminal (Sprint 175, ADR-062)` | user-visible — section heading with anchor; historical citation "Sprint 175" | run-text: `## 19. Embedded Terminal (Sprint 175, ADR-062)` — heading itself doesn't contain the word "sprint" as a description, only as a historical citation in parentheses; leave as-is per historical-citation convention or reword to "Run 175" per sitewide decision | anchor doesn't literally contain "sprint" text (`#19-embedded-terminal-sprint-175-adr-062` — actually it likely DOES include "sprint-175" in the slug); flag for anchor-slug verification |
| docs/reference/api-endpoints.md:274,278,280 | `` 202 `` \| `` `/api/start` accepted, sprint runs in background`` ; `` 404 `` \| `Resource not found (job, task, sprint log, memory/debt export, config, generic GET)`` ; `` 409 `` \| `` `/api/start` while a sprint is running, /api/cleanup with active tasks, terminal session create rejected (quota)`` | user-visible (status-code table description prose) | run-text: "`/api/start` accepted, run runs in background", "Resource not found (job, task, run log, memory/debt export, config, generic GET)", "`/api/start` while a run is running, `/api/cleanup` with active tasks, terminal session create rejected (quota)" | cosmetic doc prose, no compat concern (status codes / routes referenced here don't literally contain "sprint" in their names) |
| docs/reference/api-endpoints.md:311 | `*Last updated 2026-06-28 — Sprint 346, Task 346-009 (verified vs src/api/server.ts, src/api/auth.ts, src/api/terminal/*).*` | user-visible — historical citation | run-text: leave "Sprint 346" per sitewide historical-citation decision | historical citation footer, low compat risk |

---

### docs/guide/getting-started.md — 18 total grep hits, covered by 13 table rows (10 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/getting-started.md:3 | `> Your first AI-orchestrated sprint in under 5 minutes.` | user-visible | run-text: "> Your first AI-orchestrated run in under 5 minutes." | cosmetic doc prose, no compat concern |
| docs/guide/getting-started.md:72 | `  DIRECTIVES.md          # Sprint goals (edit before each sprint)` (fenced code block, file-tree comment) | user-visible (comment text inside a directory-tree illustration, not a real path) | run-text: `  DIRECTIVES.md          # Run goals (edit before each run)` | cosmetic doc prose inside code-fence comment; `DIRECTIVES.md` filename itself unaffected |
| docs/guide/getting-started.md:80 | `      memory.md          # Auto-generated sprint learnings` (fenced code block, file-tree comment) | user-visible | run-text: `      memory.md          # Auto-generated run learnings` | cosmetic doc prose inside code-fence comment |
| docs/guide/getting-started.md:106,109-110 | `You: What sprint tasks do we have left?`, `You: Start a sprint to add a /health endpoint`, `Deckent: [creates DIRECTIVES.md and starts the sprint] Done, spawning workers...` (example chat transcript) | user-visible (example dialogue) | run-text: "You: What run tasks do we have left?", "You: Start a run to add a /health endpoint", "Deckent: [creates DIRECTIVES.md and starts the run] Done, spawning workers..." | example chat transcript text, safe to reword, no compat concern |
| docs/guide/getting-started.md:115,117 | `### Option B: Sprint Interface`, `Write your goals in DIRECTIVES.md and run the sprint directly:` | user-visible — subheading with anchor `#option-b-sprint-interface` | run-text: `### Option B: Run Interface`, "Write your goals in `DIRECTIVES.md` and run the run directly:" | anchor rename, verify inbound links; note "run the sprint" → "run the run" is awkward — needs copy-editing (e.g. "execute the run directly") |
| docs/guide/getting-started.md:126 | `# DIRECTIVES — Sprint 1` (fenced code-block example content, inside DIRECTIVES.md sample) | user-visible (example file content, illustrative) | run-text: `# DIRECTIVES — Run 1` | example content inside a code fence but represents illustrative user-authored text, not a real schema — safe to reword |
| docs/guide/getting-started.md:153,161 | `## Step 4: Run the Sprint`, `Then start the sprint:` | user-visible — subheading with anchor `#step-4-run-the-sprint` | run-text: `## Step 4: Run the Run` (awkward — consider "## Step 4: Start the Run" instead for readability), "Then start the run:" | anchor rename, verify inbound links; flag the awkward double-"run" wording for a copy-editing pass rather than mechanical substitution |
| docs/guide/getting-started.md:186,193 | `When the sprint completes, check results:`, `Sprint sprint-001 — EVALUATE phase` (example CLI output inside code fence) | user-visible (prose) / frozen-identifier-adjacent (example output literally showing `sprint-001` ID format) | run-text: "When the run completes, check results:"; example output "Run run-001 — EVALUATE phase" (or "Sprint sprint-001" if ID-format itself is unchanged — needs the sitewide ID-format decision referenced earlier) | example CLI output mirrors the real `sprintId` format (`sprint-NNN`); do not reword the ID example independently of the ID-format rename decision |
| docs/guide/getting-started.md:223 | `- **NO_GO** — Failed; Brain logs it for retry in the next sprint` | user-visible (prose) / frozen-identifier (`NO_GO` status literal) | run-text: "- **NO_GO** — Failed; Brain logs it for retry in the next run" — keep `NO_GO` literal | `NO_GO` is a real status enum value, frozen |
| docs/guide/getting-started.md:247 | `Once the sprint starts, open the live dashboard in your browser:` | user-visible | run-text: "Once the run starts, open the live dashboard in your browser:" | cosmetic doc prose, no compat concern |
| docs/guide/getting-started.md:253 | `The dashboard shows live worker status, task results, memory, and sprint history. The **embedded terminal** lets you run claude, gemini, deckent, or a plain shell directly from the browser...` | user-visible | run-text: "...task results, memory, and run history. The **embedded terminal** lets you run `claude`, `gemini`, `deckent`, or a plain shell directly from the browser..." | cosmetic doc prose, no compat concern |
| docs/guide/getting-started.md:259-260 | `- [Core Concepts](/guide/concepts) — Understand Sprint, Task, Agent, Brain, Auditor`, `- [Your First Sprint](/guide/first-sprint) — Detailed walkthrough with examples` | user-visible (prose "Understand Sprint, Task, Agent...") / frozen-identifier-adjacent (cross-file route link `/guide/first-sprint` — the linked page `docs/guide/first-sprint.md` is OUT OF SCOPE for this scan but exists and its own filename/route would need to change in lockstep) | run-text: "- [Core Concepts](/guide/concepts) — Understand Run, Task, Agent, Brain, Auditor", "- [Your First Run](/guide/first-run) — Detailed walkthrough with examples" | **CROSS-FILE ROUTE DEPENDENCY**: the link target `/guide/first-sprint` points to `docs/guide/first-sprint.md` (confirmed to exist, out-of-scope file). Renaming the link text to "Your First Run" without also renaming the route/file (`first-sprint.md` → `first-run.md`) creates a text/URL mismatch. Multiple other in-scope-adjacent files (`concepts.md`, `chat-mode.md`, `installation.md`, `onboarding.md`, `getting-started-en.md`) also link to `/guide/first-sprint` — a full-site route rename is required, not a single-file edit. Flag as a cross-cutting dependency for the rename effort's route-renaming phase. |

---

### docs/guide/evolution-and-learning.md — 17 total grep hits, covered by 12 table rows (9 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/evolution-and-learning.md:3 | `Deckent improves with each sprint through four interconnected systems...Together they form a self-improving loop — the results of every sprint feed directly into the routing and agent selection of the next one.` | user-visible | run-text: "Deckent improves with each run through four interconnected systems...the results of every run feed directly into the routing and agent selection of the next one." | cosmetic doc prose, no compat concern |
| docs/guide/evolution-and-learning.md:21 | `` `outcomes/{sprintId}.json` `` \| `Raw per-task outcomes for that sprint` (table row, path pattern) | frozen-identifier (file path pattern `outcomes/{sprintId}.json`) / user-visible (description "Raw per-task outcomes for that sprint") | n/a — keep `outcomes/{sprintId}.json` path pattern; run-text description: "Raw per-task outcomes for that run" | real on-disk file naming pattern keyed by `sprintId` — frozen path, prose renameable |
| docs/guide/evolution-and-learning.md:23 | `At the start of the next sprint's PLAN phase, the routing engine calls calculateBonuses(taskDNA) to read these learnings...` | user-visible (prose) / frozen-identifier (function name `calculateBonuses()`, phase literal `PLAN`) | run-text: "At the start of the next run's PLAN phase, the routing engine calls `calculateBonuses(taskDNA)` to read these learnings..." — keep function name and `PLAN` literal | function name + phase literal frozen |
| docs/guide/evolution-and-learning.md:43-44 | `A success in one of the **last 3 sprints**: +3 score bonus.`, `A failure in one of the **last 3 sprints**: -2 score penalty.` | user-visible | run-text: "A success in one of the **last 3 runs**: `+3` score bonus.", "A failure in one of the **last 3 runs**: `-2` score penalty." | cosmetic doc prose, no compat concern |
| docs/guide/evolution-and-learning.md:53 | `Deckent supports temporary agents and skills created during sprints (e.g., from temp-skill-generator.ts). The **promotion pipeline** (src/orchestra/promotion-pipeline.ts) evaluates them at sprint boundaries.` | user-visible (prose) / frozen-identifier (file paths) | run-text: "...created during runs (e.g., from `temp-skill-generator.ts`). The **promotion pipeline** (`src/orchestra/promotion-pipeline.ts`) evaluates them at run boundaries." — keep file paths | file paths frozen |
| docs/guide/evolution-and-learning.md:64 | `The PromotionCriteria type also carries a minSprints: 3 field (approximated by task count — if an entity has completed 8 tasks it has typically been active across 3+ sprints)...` | frozen-identifier (TypeScript field name `minSprints`) / user-visible (surrounding prose "3+ sprints") | run-text: "The `PromotionCriteria` type also carries a `minSprints: 3` field (approximated by task count — if an entity has completed 8 tasks it has typically been active across 3+ runs)..." — keep `minSprints` field name | `minSprints` is a real TypeScript interface field name in `src/orchestra/promotion-pipeline.ts` — frozen; a code-level rename would be a separate, larger effort (out of scope for docs) |
| docs/guide/evolution-and-learning.md:80 | `The DemotionCriteria type includes an unusedSprints: 5 field, but the evaluation currently checks task-based thresholds...` | frozen-identifier (TypeScript field name `unusedSprints`) | run-text: surrounding prose unaffected, keep `unusedSprints` field name verbatim | same as `minSprints` — real interface field, frozen |
| docs/guide/evolution-and-learning.md:86 | `The promotion pipeline also runs an **identity mutation loop** for agents that have accumulated enough sprint history...the lineage of every agent (parent, mutation type, sprint) is preserved.` | user-visible (prose) / frozen-identifier-adjacent (`AgentGenealogy` field implicitly named "sprint") | run-text: "...for agents that have accumulated enough run history...the lineage of every agent (parent, mutation type, run) is preserved." | prose renameable; if `AgentGenealogy.sprint` is a real tracked field (not shown in this excerpt) it would need separate code verification |
| docs/guide/evolution-and-learning.md:94,100-101 | `All sprint knowledge is persisted in the **Memory V2 SQLite database**...`, `` `memory` `` \| `End of each sprint (RETRO phase)` \| `sprint-retro-writer.ts` via `buildRetroLearnings()`, `` `retro` `` \| `End of each sprint` \| `writeRetrospective()` — upserted per sprint ID` | user-visible (prose) / frozen-identifier (`type='memory'`/`type='retro'` DB literals, `RETRO` phase literal, file name `sprint-retro-writer.ts`, function names) | run-text: "All run knowledge is persisted in the **Memory V2 SQLite database**...", table descriptions: "End of each run (RETRO phase)", "End of each run" — keep `memory`/`retro` type literals, `RETRO` phase literal, and `sprint-retro-writer.ts` filename | filename `sprint-retro-writer.ts` and DB type literals frozen; table description prose renameable |
| docs/guide/evolution-and-learning.md:108 | `A retro entry (type: 'retro') for a sprint includes:` | user-visible (prose) / frozen-identifier (`type: 'retro'` literal) | run-text: "A retro entry (`type: 'retro'`) for a run includes:" | `type: 'retro'` literal frozen |
| docs/guide/evolution-and-learning.md:118,140,150 | `At the start of every sprint (PLAN phase), Brain auto-queries the memory DB...without manually reading every file.`, `The learning loop runs inside every sprint lifecycle:`, `...Recurring violation patterns written by the Auditor feed into retro and prevent the same mistakes in future sprints.` | user-visible (prose) / frozen-identifier (`PLAN` phase literal at line 118) | run-text: "At the start of every run (PLAN phase)...", "The learning loop runs inside every run lifecycle:", "...prevent the same mistakes in future runs." — keep `PLAN` literal | `PLAN` phase literal frozen; rest is prose |

---

### docs/guide/docker-memory.md — 14 total grep hits, covered by 9 table rows (6 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/docker-memory.md:3,5 | `> Sprint 191 T-001 — Bu rehber, Docker spawn backend ile çalıştırılan worker`, `> WSL2 üzerinde çalışıyorsanız mutlaka okuyun. Sprint 189+190 dogfood'unda 6` | user-visible — historical sprint-number citations (same open question as other files' "Sprint NN" provenance notes) | run-text: leave as historical "Sprint 191"/"Sprint 189+190" citations per sitewide historical-citation decision, OR reword to "Run 191 T-001" if full consistency is desired | historical citation, low compat risk; these look like literal internal task-tracking references (task ID "T-001") tied to a specific numbered sprint — likely should stay as historical record |
| docs/guide/docker-memory.md:21 | `### Örnek hesaplar (Deckent varsayılanları, Sprint 191)` | user-visible — subheading with anchor, contains historical citation | run-text: `### Örnek hesaplar (Deckent varsayılanları, Sprint 191)` — heading text itself may stay with historical citation, or reword per sitewide decision | anchor rename if reworded; historical citation caveat applies |
| docs/guide/docker-memory.md:30 | `> Sprint 191 öncesi (8 GB hardcoded + 6 worker): 50 GB istenirdi. Tipik bir` | user-visible — historical citation | run-text: leave as historical citation | historical citation, low compat risk |
| docs/guide/docker-memory.md:87 | `Sprint sırasında her worker'ın memory tüketimini görmek için:` | user-visible | run-text: "Run sırasında her worker'ın memory tüketimini görmek için:" | cosmetic doc prose, no compat concern |
| docs/guide/docker-memory.md:112 | `   Çözüm: Sprint kill chain'ini gözden geçir.` | user-visible | run-text: "   Çözüm: Run kill chain'ini gözden geçir." | cosmetic doc prose, no compat concern |
| docs/guide/docker-memory.md:153,155,159 | `## Sprint 189+190 Vakası (Tarihsel Kayıt)`, `Sprint 189+190 dogfood'da gözlemlenen davranış:`, `Sonuç: 6 worker / sprint exit 137 (OOM)` | user-visible — subheading (explicitly labeled "Tarihsel Kayıt" = "Historical Record" in Turkish) with anchor `#sprint-189190-vakası-tarihsel-kayıt` | run-text: this section is EXPLICITLY a historical record ("Tarihsel Kayıt") — strong candidate to leave "Sprint 189+190" as-is since it documents a specific historical incident by its original sprint numbering, not a generic concept; if renamed for consistency: `## Run 189+190 Vakası (Tarihsel Kayıt)` | heading is explicitly self-labeled as historical documentation — the strongest case in the whole batch for leaving "Sprint N" numbering untouched; flag for explicit exclusion from the rename if a "historical citations stay as-is" policy is adopted |
| docs/guide/docker-memory.md:163,168 | `Sprint 191 T-001 düzeltmesi:`, `* Yan koruma: reconcileSpuriousNoGo wire (sprint-191 P191-1 hotfix)` | user-visible (prose) / frozen-identifier (`sprint-191` used as a literal git-branch/hotfix-tag-like string) | run-text: leave "Sprint 191 T-001" as historical citation; `sprint-191` in `(sprint-191 P191-1 hotfix)` looks like a literal branch/tag name reference — if so, frozen | `sprint-191` inside the hotfix-tag parenthetical may reference an actual git branch/tag naming convention — verify before renaming; treat as frozen-identifier pending confirmation |
| docs/guide/docker-memory.md:194 | `atomicWriteFileSync (Sprint 139 HB Core Fix, src/agents/worker-lifecycle.ts) closes` | user-visible — historical citation + frozen-identifier (function name, file path) | run-text: leave "Sprint 139 HB Core Fix" as historical citation; keep `atomicWriteFileSync` and `src/agents/worker-lifecycle.ts` verbatim | function name + file path frozen; historical citation per sitewide decision |
| docs/guide/docker-memory.md:231,238 | `**Practical implication:** If a sprint logs OOM-kill events, increase`, `> İlgili ADR: ADR-027 (Hybrid Spawn Backend). Sprint 191 master plan:` | user-visible (prose) / historical citation | run-text: "**Practical implication:** If a run logs OOM-kill events, increase"; leave "Sprint 191 master plan" as historical citation or reword per sitewide decision | line 231 is pure prose (safe rename); line 238 is a historical citation |

---

### docs/reference/enterprise-integrations.md — 10 total grep hits, covered by 8 table rows (7 individual + 1 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/enterprise-integrations.md:83 | `` `runComplianceReport(root, sprintId, flags)` `` (src/cli/commands/audit.ts): Builds the report over the full retained audit trail by concatenating `[...readArchivedAuditEvents(root, sprintId), ...readAuditEvents(root, sprintId)]`... | frozen-identifier (function names + `sprintId` parameter name) | n/a — keep identifiers, no surrounding renameable prose beyond the function signature description itself (which is technical/code-referential, not general prose) | real function signatures in `src/cli/commands/audit.ts` — parameter name `sprintId` frozen |
| docs/reference/enterprise-integrations.md:85 | `...All core orchestration paths (sprint-finalizer, debt-manager, task-builder, etc.) call new MemoryStore(dbPath)...` | frozen-identifier (module name `sprint-finalizer`) | n/a — keep `sprint-finalizer` module-name reference (implies file `sprint-finalizer.ts`) | real internal module name reference, frozen unless the module itself is renamed in code |
| docs/reference/enterprise-integrations.md:86 | `` `readArchivedAuditEvents(root, sprintId)` `` (src/core/audit-query.ts): Reads the audit payloads that a retention apply moved into `.deckent/<sprintId>-events-archive.jsonl`... | frozen-identifier (function name, parameter name, file-path pattern `<sprintId>-events-archive.jsonl`) | n/a — keep identifiers and path pattern verbatim | real function + on-disk file-naming pattern, frozen |
| docs/reference/enterprise-integrations.md:88 | `**CLI Wire**: deckent audit compliance --sprint <id> [--json]. Exit code 0 when the chain is intact, 1 when broken, 2 on error.` | frozen-identifier (CLI flag `--sprint <id>`) | n/a — keep `--sprint <id>` flag verbatim | real CLI flag contract, same family as `--sprint` flag in cli.md |
| docs/reference/enterprise-integrations.md:103 | `runAuditRetention(root, sprintId, policy, apply) (src/cli/commands/audit.ts) applies the planRetention plan to a sprint's event stream (.deckent/<sprintId>-events.jsonl)...` | frozen-identifier (function name, parameter, file-path pattern) / user-visible ("a sprint's event stream" prose fragment) | n/a for identifiers; run-text: "...applies the `planRetention` plan to a run's event stream (`.deckent/<sprintId>-events.jsonl`)..." — keep function signature and path pattern | mixed: function/path frozen, tiny prose fragment "a sprint's" renameable |
| docs/reference/enterprise-integrations.md:107 | `**Archive-First Ordering (no data loss)**: On --apply, the archive partition is appended to .deckent/<sprintId>-events-archive.jsonl before the stream file is rewritten...` | frozen-identifier (file-path pattern) | n/a — keep `.deckent/<sprintId>-events-archive.jsonl` path pattern verbatim | real on-disk file-naming pattern, frozen |
| docs/reference/enterprise-integrations.md:110,199 | `**CLI Wire**: deckent audit retention --sprint <id> [--keep-days <n>] [--keep-count <n>] [--apply] [--json]...`, `**CLI Wire**: deckent audit forward --url <https-endpoint> ships a sprint's audit chain through this transport (runSiemHttpForward)...` | frozen-identifier (`--sprint <id>` flag) / user-visible (tiny prose fragment "ships a sprint's audit chain" at line 199) | n/a for the flag; run-text at line 199: "...ships a run's audit chain through this transport (`runSiemHttpForward`)..." | `--sprint <id>` flag frozen (same contract family); line 199 prose fragment renameable |
| docs/reference/enterprise-integrations.md:339,403 | `eventType: string;  // exact match (e.g. 'sprint:complete', 'pr:merged')` (inside a `typescript` interface code block); `` `?sprint=<sprintId>` `` — defaults to the latest sprint with an event stream file | frozen-identifier (both: literal enum-example value `'sprint:complete'` inside a TS interface comment, and query-param name `?sprint=`) | n/a — keep `'sprint:complete'` example value and `?sprint=` query param verbatim; if the underlying event-type naming convention is ever renamed project-wide (e.g. to `run:complete`), that is a breaking API/event-schema change requiring a migration, not a docs edit | **HIGH RISK**: `'sprint:complete'` is a documented example of a real event-type string pattern used in `EventTrigger.eventType` matching (likely matches real emitted events elsewhere in the codebase, e.g. webhook/plugin triggers) — renaming requires an event-schema-level decision, not just a doc string swap; `?sprint=<sprintId>` query param is a real API contract on this file's audit-query endpoint |

---

## Summary of cross-cutting risk flags

1. **`docs/reference/glossary.md#sprint`** (line 388) — the single highest-risk inbound-link anchor in the entire docs site; do not rename without a coordinated redirect/link-audit.
2. **`docs/reference/glossary.md#sprintid`** (line 392) — second-highest risk; `sprintId` is a pervasive real field name (API JSON, CLI flags, DB columns).
3. **`GET /api/sprint`** (api-endpoints.md:28) and **`sprint`/`lastSprint` JSON fields** (api-endpoints.md:27) — real HTTP API contract; renaming is a breaking API change, not a docs edit.
4. **`--sprint <id>` CLI flag** — appears repeatedly across cli.md and enterprise-integrations.md as a real, frozen flag name; only its description text is renameable.
5. **`runSprint`** (glossary.md:364) and **`finalizeSprint()`** (glossary.md:196) — real function names in `src/orchestra/brain.ts`; both double as term-definition headings/anchors. Note `runSprint` already starts with "run" — renaming risks an awkward `runRun`-style collision, needs an explicit naming decision.
6. **Naming collision risk**: `deckent run <description>` (cli.md:46, 1354) is an ALREADY-EXISTING, semantically distinct CLI command. A project-wide "sprint"→"run" terminology rename will collide with this pre-existing command name — flag for a product decision before executing the rename.
7. **Cross-file route dependency**: `/guide/first-sprint` (linked from getting-started.md:260, and confirmed to also be linked from several out-of-scope files: concepts.md, chat-mode.md, installation.md, onboarding.md, getting-started-en.md) — renaming link text without renaming the actual route/file (`first-sprint.md`) creates a broken/mismatched link; this is a sitewide route-rename dependency, not fixable in a single file.
8. **Historical "Sprint NN" citations** (dozens of occurrences across glossary.md, api-endpoints.md, docker-memory.md) — these cite specific numbered past sprints as provenance/changelog markers. A policy decision is needed: leave historical citations as "Sprint NN" (treating them as an immutable historical record, as docker-memory.md line 153 explicitly self-labels "Tarihsel Kayıt" = historical record), or rename them to "Run NN" for full terminology consistency. This affects roughly 40+ of the ~264 total grep hits across all 9 files.
9. **`.brain/sprints/` directory**, **`.deckent/<sprintId>-events*.jsonl`**, **`outcomes/{sprintId}.json`**, **`sprint-finalizer.ts`**, **`sprint-retro-writer.ts`**, **`sprint-controller.ts`** (referenced), **`budget_per_sprint`** / **`last_sprint_id`** config keys, **`minSprints`/`unusedSprints`** TS fields — all real on-disk paths, config keys, or code identifiers referenced in docs; frozen for a docs-only pass, each representing a larger coordinated code-rename dependency if the effort extends beyond documentation.
### docs/reference/resource-profile.md — 44 total grep hits, covered by ~13 table rows

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/resource-profile.md:509 | `### Reading Cache Metrics with \`deckent usage\`` / "After a sprint completes, query cache-gate metrics using the `deckent usage` command:" | user-visible (heading unaffected — no "sprint" in the heading text itself; prose) | run-text: "After a run completes, query cache-gate metrics using the `deckent usage` command:" | no anchor concern (heading text doesn't contain "sprint"); `deckent usage` command name unaffected |
| docs/reference/resource-profile.md:512 | `deckent usage --sprint 275` (bash code block) | frozen-identifier | n/a — keep `--sprint` flag name and `275` value as-is | `--sprint` is a literal CLI flag consumed by `deckent usage` — real external contract, frozen unless the flag itself is renamed in source |
| docs/reference/resource-profile.md:523 | `deckent_usage { sprint: "275" }` (MCP-equivalent example) | frozen-identifier | n/a — keep `sprint` param key as-is | mirrors the `--sprint` CLI flag as an MCP tool argument — real API contract, frozen |
| docs/reference/resource-profile.md:528 | `*This section is populated after sprint completion with real measurements.*` | user-visible | run-text: `*This section is populated after run completion with real measurements.*` | cosmetic prose, no compat concern |
| docs/reference/resource-profile.md:530,532,537 | `#### Sprint 274 (F1-TOK Faz 2...)` (heading) / `\| Metric \| Value \| Change vs. Sprint 273 \|` (table header) / `\| Sprint duration \| 11m 47s \| No change... \|` (table row) | user-visible | heading: run-text `#### Run 274 (F1-TOK Faz 2 — cache_warm + adr_render operative enabled)`; table header: `Change vs. Run 273`; table row label: `Run duration` | **markdown anchor concern** on heading (`#sprint-274-...`), flag for inbound-link audit; rest is cosmetic prose |
| docs/reference/resource-profile.md:540 | `- cache_warm delay of 45s is imperceptible to overall sprint runtime (sub-1% overhead)` | user-visible | run-text: `...imperceptible to overall run runtime (sub-1% overhead)` | cosmetic prose, no compat concern |
| docs/reference/resource-profile.md:544 | `#### Sprint 275 (F1-TOK Kapanış...) — *In Progress*` (heading) | user-visible (heading) | run-text: `#### Run 275 (F1-TOK Kapanış — usage yüzey paritesi) — *In Progress*` | **markdown anchor concern**: generates `#sprint-275-...`, flag for inbound-link audit |
| docs/reference/resource-profile.md:552 | `- **\`worker_memory_limit_by_kind\`** (Sprint 272): Complements F1-TOK...` | user-visible | run-text: `(Run 272): Complements F1-TOK by reducing per-worker memory overhead...` | historical version-marker prose; config field name unaffected |
| docs/reference/resource-profile.md:562 | `- **Usage Metrics:** \`deckent usage\` — cache-gate and token metrics per sprint` | user-visible | run-text: `— cache-gate and token metrics per run` | cosmetic prose, no compat concern |

---

## D4-Original cross-cutting findings (from the initial resource-profile.md + summary pass)

1. **`docs/guide/concepts.md:7` (`## Sprint`)** is the terminology keystone for the guide docs — the canonical "what is a Sprint" definition section (see D4-remainder for full detail). Any rename here should drive a full site-wide inbound-link audit before or alongside the edit.
2. **`/sprint` slash command** (chat-mode.md) and **`--sprint <id>` / `sprint: "<id>"` CLI flag & MCP param** (resource-profile.md:512/523) are real, typed user interfaces — not docs wording. Renaming these is a product/CLI decision with breaking-change implications, separate from the docs-prose rename. Recommend keeping `/sprint` and `--sprint` as backward-compatible aliases if the underlying command/flag is ever renamed.
3. **Job-ID / sprint-ID format `sprint-<timestamp-or-number>`** appears repeatedly as literal example values in JSON responses across mcp-guide.md and mcp-overview.md. These mirror the actual ID-generation scheme in source code — renaming in docs without a coordinated source change would make docs inaccurate.
4. **Naming collision risk**: `docs/reference/mcp-overview.md`'s `deckent_run` MCP tool (runs a *single task*, not a full sprint) creates a direct terminology collision if "sprint" the concept is renamed to "run." Needs a product decision before the docs rename proceeds.
5. **Markdown anchor concerns** are numerous — headings containing "Sprint" appear in troubleshooting.md, docker-backend.md, getting-started-en.md, mcp-overview.md, mcp-guide.md, resource-profile.md (4 headings). Recommend a dedicated anchor-compatibility pass before renaming any heading.
6. **Frozen module/identifier names** recurring throughout: `sprint-controller.ts`, `sprint-finalizer.ts`, `.brain/sprints/` directory, `last_sprint_id` config field, `decay_after_sprints` config field, `sprintId`/`sprintNumber`/`sprintsOpen`/`sprint` JSON field names, `cost_limits.sprint_max_usd` config field, `KILL_LIVE_SPRINT` action constant, and the `'sprint-directive'` TypeScript union-type literal in stack-aware-routing.md.

I now have all needed context. Let me compile the complete inventory tables for all 15 files.

## Sprint → Run Rename Inventory (READ-ONLY research)

### docs/reference/mcp-guide.md — 59 total grep hits, covered by 29 table rows (14 individual + 15 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/mcp-guide.md:197,198,199,202 | `\| deckent_plan \| plan.ts \| Sprint planlar (dry-run) \|` +3 similar (Sprint başlatır, Anlık sprint durumu, Sprint geçmişi) | user-visible | run-text: "Run planlar (dry-run)" / "Run başlatır (arka plan)" / "Anlık run durumu" / "Run geçmişi" | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:276 | `"content": "# DIRECTIVES — Sprint 1\n\n## Task 1: Auth API..."` | user-visible (example payload prose) | run-text: `# DIRECTIVES — Run 1` — but note this is inside a JSON example string, not a schema field | cosmetic doc prose (example content string), no compat concern |
| docs/reference/mcp-guide.md:290 | "Brain bu sayıyı sprint planlamasında kullanır." | user-visible | run-text: "Brain bu sayıyı run planlamasında kullanır." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:298 | "Mevcut `DIRECTIVES.md` içeriğine göre sprint planlar." | user-visible | run-text: "...içeriğine göre run planlar." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:322 | `"sprintId": "sprint-018",` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | **real external contract**: JSON response field name `sprintId` returned by `deckent_plan`/`deckent_status` — an MCP client integration may parse this field; renaming breaks API compat |
| docs/reference/mcp-guide.md:323 | `"sprintNumber": 18,` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | real external contract: JSON field name in tool response |
| docs/reference/mcp-guide.md:344 | "Tam sprint yaşam döngüsünü arka planda başlatır: plan → spawn → execute → evaluate → retro → cleanup." | user-visible | run-text: "Tam run yaşam döngüsünü arka planda başlatır: ..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:368,409 | `"jobId": "sprint-1710768000000",` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | real external contract: the `jobId` value itself is prefixed `sprint-<timestamp>`; renaming this literal ID format is a breaking change to job-tracking consumers, not just doc text |
| docs/reference/mcp-guide.md:370 | `"message": "Sprint started in background. Use deckent_status to track progress."` | user-visible | run-text: `"Run started in background. Use deckent_status to track progress."` | **real external contract**: this exact string is emitted at runtime by `src/mcp/tools/start.ts` — doc must match actual code output; source change required in tandem |
| docs/reference/mcp-guide.md:374 | "Not: Sprint arka planda çalışır (`child_process.fork()`)." | user-visible | run-text: "Not: Run arka planda çalışır (...)." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:376,584,623,929 | "Kaynak: ... \| Blueprint §7, §21, Sprint 17 (background jobs)" +3 similar (Sprint 15, Sprint 15, §7 Sprint Lifecycle) | user-visible (historical/citation reference) | run-text: leave numeric "Sprint 17"/"Sprint 15" historical citations as-is (they name a specific past sprint event, not the concept) OR reword "§7 Sprint Lifecycle" → "§7 Run Lifecycle" if that Blueprint section itself gets renamed | cosmetic doc prose; historical "Sprint NN" citations are timeline references, low priority — decide policy: keep historical sprint-number citations unchanged vs. reword |
| docs/reference/mcp-guide.md:382,395,416,421,646,670,690 | "Amaç: Anlık sprint dashboard durumunu döndürür." +6 similar (sprint aktifken/yokken, aktif sprint hedefleri, sprint başında) | user-visible | run-text: "Amaç: Anlık run dashboard durumunu döndürür." (and analogous rewording for the 6 similar occurrences) | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:421 | `"message": "No active sprint."` | user-visible | run-text: `"message": "No active run."` | **real external contract**: literal runtime string returned by `deckent_status`; source + doc must change together |
| docs/reference/mcp-guide.md:471 | "en son sprint retrospektifini okur (type=`retro`)." | user-visible | run-text: "en son run retrospektifini okur (type=`retro`)." | note: `type=retro` DB value itself unaffected (not "sprint") |
| docs/reference/mcp-guide.md:488 | `"content": "# Sprint 17 Retrospective\n\n## Completed\n..."` | user-visible (example payload prose) | run-text: example content could show `# Run 17 Retrospective` | cosmetic doc prose (example string), no compat concern |
| docs/reference/mcp-guide.md:506 | "`.brain/sprints/` dizinindeki sprint geçmiş loglarını okur." | mixed: `.brain/sprints/` = frozen-identifier; "sprint geçmiş loglarını okur" = user-visible | n/a for `.brain/sprints/` path (keep); run-text: "...dizinindeki run geçmiş loglarını okur. Son N run'ı döndürür." | **real external contract**: `.brain/sprints/` is an actual on-disk directory name read by `history.ts` — renaming the directory is a filesystem/data-migration concern, not just doc text |
| docs/reference/mcp-guide.md:512 | `\| last \| number \| Hayır \| 5 \| Döndürülecek son sprint sayısı \|` | user-visible | run-text: "Döndürülecek son run sayısı" | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:529,531,535,539 | `"sprints": [ { "id": "sprint-015", "content": "# Sprint 015\n..." }, ...]` | frozen-identifier (field name `sprints` + `id` value format `sprint-NNN`) | n/a — keep identifier/value format, reword only the embedded `"content"` prose text (e.g. `# Sprint 015` → could stay as historical log title or become `# Run 015` if IDs are renamed in lockstep) | **real external contract**: `sprints` array field name and `sprint-NNN` id format are a persisted history-log schema (`deckent_history` tool response) — renaming requires coordinated schema/data migration, high compat risk |
| docs/reference/mcp-guide.md:575 | `"methodology": "sprint-parallel",` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | real external contract: literal enum-like value returned by `deckent_analyze_project`; an integration may branch on this string |
| docs/reference/mcp-guide.md:584 | "Kaynak: ... \| Blueprint §21, Sprint 15" | user-visible (historical citation) | run-text: leave as historical citation (see note above re: policy) | cosmetic doc prose |
| docs/reference/mcp-guide.md:633,634,638 | `\| deckent://dashboard \| ... \| Anlık sprint durumu \|` +2 similar (`Aktif sprint hedefleri`, `Son sprint retrospektifi`) | user-visible | run-text: "Anlık run durumu" / "Aktif run hedefleri" / "Son run retrospektifi" | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:646 | "Auditor'ın her 30 saniyede bir yazdığı anlık sprint dashboard durumu." | user-visible | run-text: "...anlık run dashboard durumu." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:655 | `"sprintId": "sprint-018",` (dashboard resource example) | frozen-identifier | n/a — keep identifier, reword surrounding prose only | same as line 322: real JSON field/value contract |
| docs/reference/mcp-guide.md:670,677 | "Aktif sprint için `DIRECTIVES.md` içeriği. Brain sprint planlamadan önce..." + `# DIRECTIVES — Sprint 18` example | mixed: prose user-visible; `# DIRECTIVES — Sprint 18` example text user-visible too (not a schema field) | run-text: "Aktif run için `DIRECTIVES.md` içeriği. Brain run planlamadan önce bu resource'u okur." / example → `# DIRECTIVES — Run 18` | cosmetic doc prose, no compat concern (DIRECTIVES.md content is free-form user text, not a parsed contract) |
| docs/reference/mcp-guide.md:690,699 | "Önceki sprintlerden öğrenilen desenler... Brain her sprint başında..." + `## Wave 1 Learnings (Sprint 1)` | user-visible | run-text: "Önceki run'lardan öğrenilen desenler... Brain her run başında..." / `## Wave 1 Learnings (Run 1)` | cosmetic doc prose, no compat concern |
| docs/reference/mcp-guide.md:722,729 | `"sprint": "sprint-002",` / `"sprint": "sprint-017",` (debt resource JSON) | frozen-identifier | n/a — keep identifier, reword surrounding prose only | **real external contract**: `sprint` field name + `sprint-NNN` value format inside `DebtItem` JSON returned by `deckent://debt` resource; persisted in `.brain/memory.db` debt records |
| docs/reference/mcp-guide.md:753 | `"last_sprint_id": 18` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | **real external contract**: literal config field name in `.deckent/config.json` schema |
| docs/reference/mcp-guide.md:763,770,773,789 | "Son sprint retrospektifi... `# Sprint 345 Retrospective`... completed in one sprint... Sprint yokken `{ tasks: [] }` döner." | user-visible | run-text: "Son run retrospektifi..." / `# Run 345 Retrospective` / "...completed in one run" / "Run yokken `{ tasks: [] }` döner." | cosmetic doc prose (retro content example is free text), no compat concern |
| docs/reference/mcp-guide.md:866,874,878,881,890,894,915,916 | "### Akış 2: Sprint Başlatma" / `{ jobId: "sprint-..." }` / "### Akış 3: Sprint Takibi" / "How's the sprint going?" / "What did we learn from the last sprint?" / "son 3 sprint logu" / "Sprint aktif değil..." / "Sprint başlatma hatası \| `Sprint failed at phase X...`" | mixed: headings/prose user-visible; `jobId: "sprint-..."` value format frozen-identifier; `Sprint failed at phase X: <message>` = literal runtime error string (frozen unless source also renamed) | run-text: "### Akış 2: Run Başlatma" / "### Akış 3: Run Takibi" / "How's the run going?" / "What did we learn from the last run?" / "son 3 run logu" / "Run aktif değil..." — leave `jobId: "sprint-..."` format alone unless source changes too; `Run failed at phase X: <message>` only if the actual thrown error message is renamed in source | mixed compat: prose is cosmetic; `jobId` prefix format and the literal error message string `Sprint failed at phase X` are real runtime contracts tied to source code (`src/mcp/tools/start.ts` / status.ts), not just doc text |

---

### docs/reference/mcp-overview.md — 30 total grep hits, covered by 21 table rows (16 individual + 5 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/mcp-overview.md:3 | "organized across sprint lifecycle management, memory, autonomous execution..." | user-visible | run-text: "organized across run lifecycle management, memory, autonomous execution..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:11 | "sprint lifecycle hooks (sprint-controller, sprint-finalizer, result-evaluator) can emit..." | mixed: "sprint lifecycle hooks" user-visible; `sprint-controller`, `sprint-finalizer` = frozen-identifier (source file/module names) | run-text: "run lifecycle hooks (`sprint-controller`, `sprint-finalizer`, `result-evaluator`) can emit..." — reword only the surrounding prose, keep the module names verbatim | module names are literal source filenames (`src/orchestra/sprint-controller.ts` etc.) — do not rename in doc unless source files are actually renamed |
| docs/reference/mcp-overview.md:41 | "so any sprint lifecycle event (task done, sprint complete, alert) is forwarded..." | user-visible | run-text: "so any run lifecycle event (task done, run complete, alert) is forwarded..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:60 | "Write sprint goals and task definitions to `DIRECTIVES.md`." | user-visible | run-text: "Write run goals and task definitions to `DIRECTIVES.md`." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:68 | "### Sprint Lifecycle" (section heading) | user-visible (heading/anchor) | run-text: "### Run Lifecycle" | **anchor concern**: this heading generates an anchor (e.g. `#sprint-lifecycle`) that may be linked from elsewhere in docs or external bookmarks — flag for redirect/compat check before renaming |
| docs/reference/mcp-overview.md:73 | "Start the full sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP) as a detached background job... if the estimated cost exceeds `cost_limits.sprint_max_usd`..." | mixed: "full sprint lifecycle" prose user-visible; `cost_limits.sprint_max_usd` = frozen-identifier (config field name) | run-text: "Start the full run lifecycle (...) ... if the estimated cost exceeds `cost_limits.sprint_max_usd`..." (keep config key as-is) | **real external contract**: `cost_limits.sprint_max_usd` is a literal `.deckent/config.json` field path — renaming requires config schema migration, separate from doc-prose rename |
| docs/reference/mcp-overview.md:74 | "Return live sprint progress: active workers, task statuses... for the active sprint." | user-visible | run-text: "Return live run progress: active workers, task statuses... for the active run." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:75 | "Evaluate the current sprint results and return a Brain decision..." | user-visible | run-text: "Evaluate the current run results and return a Brain decision..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:76 | "Kill the running sprint (`target=all`) or a specific worker process..." | mixed: "running sprint" user-visible; `target=all` frozen (param value) | run-text: "Kill the running run (`target=all`) or a specific worker process..." (keep `target=all` literal) | `target=all`/`target=worker` are literal accepted param values for `deckent_kill` — frozen |
| docs/reference/mcp-overview.md:77 | "Archive task files from `.tasks/` to `.deckent/archive/`... and mark the sprint complete." | user-visible | run-text: "...and mark the run complete." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:78 | "Recover a crashed or stuck sprint: cleans orphan IPC directories... resets sprint state so a new sprint can start." | user-visible | run-text: "Recover a crashed or stuck run: ... resets run state so a new run can start." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:79 | "Read the last sprint retrospective from `.brain/memory.db` (type=`retro`)." | user-visible | run-text: "Read the last run retrospective from `.brain/memory.db` (type=`retro`)." | `type=retro` DB value unaffected, no compat concern for that part |
| docs/reference/mcp-overview.md:80 | "List sprint history with per-sprint metrics: task counts, GO/NO_GO distribution..." | user-visible | run-text: "List run history with per-run metrics: task counts, GO/NO_GO distribution..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:81 | "Explain a sprint's history: what was planned... Useful for auditing past sprints." | user-visible | run-text: "Explain a run's history: ... Useful for auditing past runs." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:87 | "`deckent_run` \| No \| No \| Run a single task directly (no full sprint): resolves the task file..." | user-visible — **but flagged as terminology-collision line** per task instructions | run-text: "Run a single task directly (no full **run**): resolves the task file..." — this creates an immediate literal collision: the tool is *already* named `deckent_run` and its description would now say "no full run" in the same sentence as "run a single task", which is confusing. **RECOMMEND**: this line needs explicit disambiguation wording, e.g. "Run a single task directly (not a full orchestration run/sprint-cycle)" or keep "sprint" here specifically to disambiguate from the tool's own "run" verb until a clearer term is chosen | **HIGH compat/clarity risk**: `deckent_run` is a pre-existing MCP tool name (frozen, cannot rename without breaking every MCP client integration). Renaming "sprint"→"run" in prose describing `deckent_run` produces confusing self-referential text ("Run a single task... no full run"). This line is the single most important flag in the whole scan — recommend the rename effort choose a different term for the sprint-lifecycle concept (e.g. "cycle", "session") OR explicitly except this description from the rename and add a disambiguation note |
| docs/reference/mcp-overview.md:88 | "a pause point written by a worker mid-sprint." | user-visible | run-text: "a pause point written by a worker mid-run." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:89 | "Sprint lifecycle document management: `add` registers a managed doc template..." | user-visible | run-text: "Run lifecycle document management: ..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:95 | "Searches ADRs, sprint learnings, patterns, and technical debt. Supports FTS5... sprint range..." | user-visible | run-text: "Searches ADRs, run learnings, patterns, and technical debt. Supports FTS5... run range..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:101 | "Backfills recent events from the JSONL file for the active sprint..." | user-visible | run-text: "...for the active run..." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:102,103,104 | "Run the Brain Self-Audit Gate for a completed sprint..." + "per-task sprint breakdown" + "Sprint KPI scorecard and trend analysis. Scorecard mode returns all KPI values for a given sprint; trend mode returns a time-series for a single KPI across sprints." | user-visible | run-text: "...for a completed run..." / "per-task run breakdown" / "Run KPI scorecard and trend analysis... for a given run... across runs." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:130 | "Reports feature adoption, last-sprint usage, and decay status." | user-visible | run-text: "Reports feature adoption, last-run usage, and decay status." | cosmetic doc prose, no compat concern |
| docs/reference/mcp-overview.md:138,139,140,141,143,144 | "Live sprint dashboard... Returns `{ active: false }` when no sprint is running." + "the sprint goals and task definitions..." + "Sprint learnings from `.brain/memory.db`..." + "`sprintsOpen`" field + "Latest sprint retrospective..." + "Returns `{ tasks: [] }` when no sprint is active." | mixed: prose user-visible; `sprintsOpen` = frozen-identifier (JSON field name inside `DebtItem`) | run-text: reword all prose instances "sprint"→"run" (e.g. "Live run dashboard... no run is running", "the run goals...", "Run learnings from..."); keep `sprintsOpen` field name as-is | `sprintsOpen` (line 141) is a real JSON field name in the `DebtItem` schema — frozen, high compat risk if renamed without data migration |
| docs/reference/mcp-overview.md:160 | "uses `server.notification()`... to push sprint events to the client as log-level notifications." | user-visible | run-text: "...to push run events to the client as log-level notifications." | cosmetic doc prose, no compat concern |

---

### docs/guide/nervous-system.md — 28 total grep hits, covered by 17 table rows (9 individual + 8 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/nervous-system.md:9 | "Deckent'i en az bir sprint çalıştırmış kullanıcılar" | user-visible | run-text: "Deckent'i en az bir run çalıştırmış kullanıcılar" | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:13,375,378 | "Tam kullanıcı rehberi Sprint 181 sonrasında yayımlanacak." +2 similar (ADR-040: ... accepted Sprint 147, realized Sprint 180 / Sprint 180 plan: ...) | user-visible (historical sprint-number citations) | run-text: leave "Sprint NN" historical/version citations as-is — these name a specific past sprint milestone, not the general concept (policy decision needed, same as mcp-guide.md citations) | cosmetic doc prose; historical numbered citations are lower priority for rename |
| docs/guide/nervous-system.md:15 | "**ADR-040 durumu:** `accepted` (Sprint 180 W3-1 ile sprint-controller wire canlı...)" | mixed: "Sprint 180 W3-1" historical citation user-visible; `sprint-controller` = frozen-identifier (module name) | run-text: reword surrounding text if desired, keep `sprint-controller` module name verbatim | `sprint-controller` is the literal source module `src/orchestra/sprint-controller.ts` — frozen unless source renamed |
| docs/guide/nervous-system.md:21,32 | "Brain, sprint'in yaşam döngüsünü senkron yönetir... Ama sprint sırasında oluşan asenkron sinyaller..." + "Brain bu sistemi sprint başında bootstrap eder, sprint biterken `dispose()` ile temizler. Sprint scope'unda yaşar." | user-visible | run-text: "Brain, run'ın yaşam döngüsünü senkron yönetir... Ama run sırasında oluşan asenkron sinyaller..." / "Brain bu sistemi run başında bootstrap eder, run biterken `dispose()` ile temizler. Run scope'unda yaşar." | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:25 | "**Observer** — Sprint state'i, dosya sistemi event'leri ve cron tick'leri dinler" | user-visible | run-text: "**Observer** — Run state'i, dosya sistemi event'leri ve cron tick'leri dinler" | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:91,137,156 | "**Tetikleyici:** Sprint 179'da 5 kez tekrarlayan pattern..." +2 similar (Sprint 146 T-146-005, Sprint 145 incident) | user-visible (historical incident citations) | run-text: leave "Sprint NN" incident citations as-is (historical reference, not concept) | cosmetic doc prose; historical citation, low priority |
| docs/guide/nervous-system.md:93 | "NO_GO yazıp sprint'i bloklamak yerine recovery yolu denenir." | user-visible | run-text: "NO_GO yazıp run'ı bloklamak yerine recovery yolu denenir." | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:122 | "Son 3 sprint'teki tech-debt oranını izler." | user-visible | run-text: "Son 3 run'daki tech-debt oranını izler." | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:150 | "`DIRECTIVES.md` dosyasının mid-sprint bütünlüğünü korur. Sprint başında baseline hash kaydedilir." | user-visible | run-text: "...mid-run bütünlüğünü korur. Run başında baseline hash kaydedilir." | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:169,170,172 | "`false` — sadece alarm üret, müdahale etme (Sprint 176'ya kadar default)" + "`true` — alarm + otomatik baseline restore (Sprint 180 itibarıyla default)" + "**Sprint 180 itibarıyla `auto_restore: true` güvenlidir** çünkü:" | user-visible (historical version citations) | run-text: leave "Sprint NN" version-milestone citations as-is | cosmetic doc prose, low priority |
| docs/guide/nervous-system.md:174,175,176 | "1. Sprint 177-005 baseline-update hook canlı..." +2 similar (Sprint 179 Bug A landed, Sprint 176 dogfood pattern) | user-visible (historical citations) | run-text: leave as historical citations | cosmetic doc prose, low priority |
| docs/guide/nervous-system.md:208 | "**2-3 sprint sonra:** `balanced` (varsayılan)." | user-visible | run-text: "**2-3 run sonra:** `balanced` (varsayılan)." | cosmetic doc prose, no compat concern |
| docs/guide/nervous-system.md:214 | `- \`KILL_LIVE_SPRINT\`` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | **real external contract**: literal Nervous System action-type enum constant (safety-floor list) referenced in source code/config; renaming breaks action-type matching |
| docs/guide/nervous-system.md:246 | "`desktop` — Sistem bildirimi (opsiyonel; Sprint 181 sonrası)" | user-visible (historical citation) | run-text: leave as historical citation | cosmetic doc prose, low priority |
| docs/guide/nervous-system.md:279,281 | "**Panic Guard onayı (Sprint 180 W4-2):**" + "...sprint istenmeyen şekilde kill ediliyorsa kullanıcıdan açık onay alınır." | mixed: "Sprint 180 W4-2" historical citation; "sprint istenmeyen şekilde kill ediliyorsa" is user-visible prose | run-text: "...run istenmeyen şekilde kill ediliyorsa kullanıcıdan açık onay alınır." (leave "Sprint 180 W4-2" citation as-is) | cosmetic doc prose for the general mention; historical citation low priority |
| docs/guide/nervous-system.md:337 | "Issue raporla — Sprint 177-005 baseline hook'u set_directives dışında bir yoldan yazım yapıyor olabilir." | user-visible (historical citation) | run-text: leave as historical citation | cosmetic doc prose, low priority |
| docs/guide/nervous-system.md:347,348 | "`dead_event_stream` \| Sprint event stream'inin uzun süre sessizleşmesini tespit eder..." + "`task_mode_idle` \| Task-mode (tek görev) sprint'lerinde uzun boşluk kalmasını tespit eder" | user-visible | run-text: "Run event stream'inin uzun süre sessizleşmesini tespit eder..." / "Task-mode (tek görev) run'larında uzun boşluk kalmasını tespit eder" | cosmetic doc prose, no compat concern |

---

### docs/guide/concepts.md — 20 total grep hits, covered by 15 table rows (12 individual + 3 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| **docs/guide/concepts.md:7** | `## Sprint` | user-visible **heading** — canonical concept-definition section | run-text: `## Run` (or `## Sprint (Run)` transitional heading) | **HIGH compat risk / anchor concern**: this is the canonical "Sprint" glossary/concept-definition heading, generating anchor `#sprint`. This is almost certainly the most-linked anchor across the guide docs (e.g. `docs/guide/getting-started-en.md:259` links to `/guide/concepts` referencing "Understand Sprint, Task, Agent, Brain, Auditor"; other docs likely deep-link `#sprint`). Renaming this heading breaks any existing inbound anchor link (`concepts.md#sprint`) — recommend adding a redirect anchor or keeping `## Sprint` as an alias/subheading during transition |
| docs/guide/concepts.md:9 | "A **sprint** is one cycle of planning, executing, and evaluating work. Each sprint has a unique ID (e.g., `sprint-001`)..." | mixed: prose user-visible; `sprint-001` = frozen-identifier (persisted ID format example) | run-text: "A **run** is one cycle of planning, executing, and evaluating work. Each run has a unique ID (e.g., `run-001`)..." — reword prose, but note the ID *format itself* (`sprint-NNN` on disk) is a separate, higher-risk rename | ID format `sprint-001` reflects the actual on-disk/DB id scheme (`sprintId` field, `.brain/sprints/` dir) — renaming the example implies renaming the real ID scheme, which is a data-migration-level change, not just doc text |
| docs/guide/concepts.md:21 | "**DECAY** -- Old memory entries are pruned to stay within the sprint budget" | user-visible | run-text: "**DECAY** -- Old memory entries are pruned to stay within the run budget" | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:22 | "**COMPLETE** -- Cleanup operations run... the sprint is marked complete" | user-visible | run-text: "...the run is marked complete" | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:24 | "Sprints are never left incomplete. If a worker stalls, the auditor detects it and Brain handles the failure." | user-visible | run-text: "Runs are never left incomplete. If a worker stalls, the auditor detects it and Brain handles the failure." | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:60 | "**NO_GO** -- Failed to meet criteria; Brain logs the reason for the next sprint" | user-visible | run-text: "...for the next run" | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:70 | "The **Brain** is the orchestrator. There is exactly one Brain per sprint." | user-visible | run-text: "There is exactly one Brain per run." | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:153 | "This is the single source of truth for all project knowledge: ADRs, sprint learnings, debt records, patterns, and retrospectives." | user-visible | run-text: "...ADRs, run learnings, debt records, patterns, and retrospectives." | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:158,160 | "auto-generated after each sprint for git tracking and agent context" + "Old entries are pruned automatically after a configurable number of sprints (`decay_after_sprints`, default: 20)..." | mixed: prose user-visible; `decay_after_sprints` = frozen-identifier (config field name) | run-text: "auto-generated after each run for git tracking..." / "...after a configurable number of runs (`decay_after_sprints`, default: 20)..." — keep config key literal | `decay_after_sprints` is a real `.deckent/config.json` field name — frozen unless config schema is migrated |
| docs/guide/concepts.md:172 | `cat .brain/exports/memory.md    # sprint learnings` (code comment) | user-visible (code-block comment, not an identifier) | run-text: `cat .brain/exports/memory.md    # run learnings` | cosmetic doc prose (comment text), no compat concern — `memory.md` filename itself is unaffected |
| docs/guide/concepts.md:183 | "- The sprint goal" | user-visible | run-text: "- The run goal" | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:188 | "Directives are the primary input to every sprint. Write them clearly, and Brain handles the rest." | user-visible | run-text: "Directives are the primary input to every run. Write them clearly..." | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:191 | `# DIRECTIVES -- Sprint 3: API Hardening` (example content) | user-visible (example text) | run-text: `# DIRECTIVES -- Run 3: API Hardening` | cosmetic doc prose (example), no compat concern |
| docs/guide/concepts.md:214 | `\| **Sprint** \| max_workers, brain_planning, fix_phase_enabled \|` (config table row label) | user-visible (table row label) | run-text: `\| **Run** \| max_workers, brain_planning, fix_phase_enabled \|` | cosmetic doc prose; the config field names listed (`max_workers` etc.) are unaffected/frozen |
| docs/guide/concepts.md:242,245 | "Ready for next sprint" + "Each sprint builds on the previous one. Brain remembers what worked, what failed, and what debt was accumulated." | user-visible | run-text: "Ready for next run" / "Each run builds on the previous one..." | cosmetic doc prose, no compat concern |
| docs/guide/concepts.md:251,252 | "[Getting Started](/guide/getting-started) — Install and run your first sprint" + "[Your First Sprint](/guide/first-sprint) — Step-by-step walkthrough" | mixed: "run your first sprint" prose user-visible; `[Your First Sprint](/guide/first-sprint)` is a link label AND references a page path `guide/first-sprint` | run-text: "Install and run your first run" (awkward — consider "...run your first cycle" for readability) / link label → "[Your First Run](/guide/first-sprint)" but keep the URL path `/guide/first-sprint` unless that page is also renamed | **compat concern**: `/guide/first-sprint` is a real page route referenced from multiple docs (also seen in getting-started-en.md:260, index.md:47/83, docker-backend.md, mcp-guide.md) — renaming the link label without renaming the actual route creates a mismatch; if the route itself is renamed, all inbound links across the doc set need updating together |

---

### docs/guide/getting-started-en.md — 18 total grep hits, covered by 13 table rows (9 individual + 4 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/getting-started-en.md:3 | "> Your first AI-orchestrated sprint in under 5 minutes." | user-visible | run-text: "> Your first AI-orchestrated run in under 5 minutes." | cosmetic doc prose, no compat concern |
| docs/guide/getting-started-en.md:72,80 | `DIRECTIVES.md          # Sprint goals (edit before each sprint)` + `memory.md          # Auto-generated sprint learnings` (file-tree comments) | user-visible (code-block comment) | run-text: `# Run goals (edit before each run)` / `# Auto-generated run learnings` | cosmetic doc prose (comment text), filenames themselves unaffected |
| docs/guide/getting-started-en.md:106,109,110 | "You: What sprint tasks do we have left?" + "You: Start a sprint to add a /health endpoint" + "Deckent: [creates DIRECTIVES.md and starts the sprint] Done, spawning workers..." | user-visible (example chat transcript) | run-text: "You: What run tasks do we have left?" / "You: Start a run to add a /health endpoint" / "Deckent: [creates DIRECTIVES.md and starts the run] Done, spawning workers..." | cosmetic doc prose (example transcript), no compat concern |
| docs/guide/getting-started-en.md:115,117 | "### Option B: Sprint Interface" + "Write your goals in `DIRECTIVES.md` and run the sprint directly:" | user-visible (heading + prose) | run-text: "### Option B: Run Interface" / "...and run the run directly:" (awkward phrasing — consider "...and start the run directly:") | heading anchor `#option-b-sprint-interface` — low external-link risk (sub-heading, less likely deep-linked) but note for consistency |
| docs/guide/getting-started-en.md:126 | `# DIRECTIVES — Sprint 1` (example content) | user-visible (example text) | run-text: `# DIRECTIVES — Run 1` | cosmetic doc prose (example), no compat concern |
| docs/guide/getting-started-en.md:153,161 | "## Step 4: Run the Sprint" + "Then start the sprint:" | user-visible (heading + prose) | run-text: "## Step 4: Run the Run" (awkward — consider "## Step 4: Start the Run") / "Then start the run:" | heading anchor `#step-4-run-the-sprint` — same low-risk sub-heading category, but flag: "Run the Run" is a collision worth rewording deliberately, not literally |
| docs/guide/getting-started-en.md:186 | "When the sprint completes, check results:" | user-visible | run-text: "When the run completes, check results:" | cosmetic doc prose, no compat concern |
| docs/guide/getting-started-en.md:193 | `Sprint sprint-001 — EVALUATE phase` (example CLI stdout) | mixed: "Sprint" label user-visible (literal CLI output header word); `sprint-001` = frozen-identifier (persisted ID format) | run-text: `Run run-001 — EVALUATE phase` — but this is literal CLI stdout produced by `deckent status`; doc text must match actual source output, so source-side rename required first | **real external contract**: this is actual terminal output text emitted by the CLI status command — a doc-only rename creates doc/behavior drift; coordinate with source string changes |
| docs/guide/getting-started-en.md:223 | "**NO_GO** — Failed; Brain logs it for retry in the next sprint" | user-visible | run-text: "...for retry in the next run" | cosmetic doc prose, no compat concern |
| docs/guide/getting-started-en.md:247,253 | "Once the sprint starts, open the live dashboard in your browser:" + "The dashboard shows live worker status, task results, memory, and sprint history." | user-visible | run-text: "Once the run starts, open the live dashboard..." / "...memory, and run history." | cosmetic doc prose, no compat concern |
| docs/guide/getting-started-en.md:259 | "[Core Concepts](/guide/concepts) — Understand Sprint, Task, Agent, Brain, Auditor" | user-visible (link description text) | run-text: "Understand Run, Task, Agent, Brain, Auditor" | cosmetic doc prose; link target `/guide/concepts` itself unaffected (only the label text changes) |
| docs/guide/getting-started-en.md:260 | "[Your First Sprint](/guide/first-sprint) — Detailed walkthrough with examples" | mixed: link label user-visible; `/guide/first-sprint` route = potential frozen path | run-text: "[Your First Run](/guide/first-sprint) — Detailed walkthrough with examples" (keep route unless page itself renamed) | **compat concern**: same `/guide/first-sprint` route referenced across multiple files (concepts.md, index.md, docker-backend.md) — must be renamed consistently everywhere if the route changes, or left as a legacy URL with redirect |

---

### docs/guide/chat-mode.md — 15 total grep hits, covered by 12 table rows (10 individual + 2 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/chat-mode.md:3 | "> Native Ink REPL — talk to deckent, run tools, manage sprints from your terminal." | user-visible | run-text: "...manage runs from your terminal." | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:5 | "...lets you chat with an AI, run deckent tools, query memory, and manage sprints — all from a single persistent session." | user-visible | run-text: "...and manage runs — all from a single persistent session." | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:31 | "The sprint has 3 tasks in EXECUTE phase." (example REPL output) | user-visible (example text) | run-text: "The run has 3 tasks in EXECUTE phase." | cosmetic doc prose (example), no compat concern |
| docs/guide/chat-mode.md:55 | `\| /status \| Show active sprint status \|` | user-visible (table description prose; `/status` command name itself unaffected) | run-text: "Show active run status" | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:57 | `\| /plan \| Plan a sprint from DIRECTIVES.md \|` | user-visible | run-text: "Plan a run from DIRECTIVES.md" | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:58 | `\| /sprint \| Show sprint history \|` | mixed: `/sprint` slash-command name = frozen-identifier; "Show sprint history" description = user-visible | run-text (description only): "Show run history" — leave `/sprint` command token as `n/a — keep identifier, reword surrounding prose only` UNLESS the REPL command itself is being renamed to `/run` (out of scope here, would need coordination with `/run`'s pre-existing meaning per mcp-overview.md `deckent_run`) | **HIGH compat risk**: `/sprint` is a literal REPL slash-command name (real user-typed input, not just prose) — renaming it to `/run` would collide conceptually with the existing `deckent_run` single-task tool; flag as a naming-collision risk identical to the mcp-overview.md note |
| docs/guide/chat-mode.md:59 | `\| /retro \| Show last sprint retrospective \|` | user-visible | run-text: "Show last run retrospective" | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:60 | `\| /review \| Evaluate sprint result (GO/NO_GO) \|` | user-visible | run-text: "Evaluate run result (GO/NO_GO)" | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:64 | `\| /explain \| Explain sprint results \|` | user-visible | run-text: "Explain run results" | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:75,76,77 | `\| /kill \| ⚠ Stop active sprint/worker...\|` + `\| /cleanup \| ⚠ Archive task files, clean sprint...\|` + `\| /recover \| ⚠ Recover a crashed sprint...\|` | user-visible (description prose; slash-command names unaffected) | run-text: "Stop active run/worker" / "Archive task files, clean run" / "Recover a crashed run" | cosmetic doc prose, no compat concern |
| docs/guide/chat-mode.md:79,80 | `\| /audit \| Sprint audit (e.g. /audit gate sprint-286) \|` + `\| /usage \| Token/limit usage (e.g. /usage --sprint 285) \|` | mixed: "Sprint audit" prose user-visible; `sprint-286` example ID + `--sprint 285` example flag usage = frozen-identifier pattern (illustrating real CLI arg/flag) | run-text: "Run audit (e.g. `/audit gate sprint-286`)" — reword prose only, keep the literal example command (`/audit gate sprint-286`, `/usage --sprint 285`) as-is since it demonstrates an actual CLI flag name (`--sprint`) that is frozen per scope rules | **real external contract**: `--sprint <id>` is a literal CLI flag name (frozen per task instructions); the example values `sprint-286`/`285` demonstrate real ID/flag usage, not prose |
| docs/guide/chat-mode.md:214 | "[First Sprint](first-sprint.md) — Sprint-mode walkthrough" | mixed: link label + "Sprint-mode" description user-visible; `first-sprint.md` route = potential frozen path (same as noted elsewhere) | run-text: "[First Run](first-sprint.md) — Run-mode walkthrough" (keep route unless renamed) | same route-consistency concern as getting-started-en.md:260 and concepts.md:251-252 — `first-sprint.md` referenced across multiple files |

---

### docs/guide/docker-backend.md — 12 total grep hits, covered by 9 table rows (7 individual + 2 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/docker-backend.md:19 | `6. [Running a Sprint](#6-running-a-sprint)` (TOC entry) | user-visible (link label + in-doc anchor) | run-text: `6. [Running a Run](#6-running-a-run)` | **anchor concern**: this TOC entry links to the `## 6. Running a Sprint` heading below (line 256) via anchor `#6-running-a-sprint` — must rename the TOC link and heading together; low external-link risk since it's an in-page anchor, but any external deep-link to this doc's `#6-running-a-sprint` section would break |
| docs/guide/docker-backend.md:30 | `\| docker \| Workers run in isolated Docker containers \| **Default** — auto resolves here (Sprint 177) \|` | user-visible (historical version citation) | run-text: leave "Sprint 177" historical citation as-is | cosmetic doc prose, low priority |
| docs/guide/docker-backend.md:80 | "Verify your host session is active before launching Docker-backed sprints:" | user-visible | run-text: "...before launching Docker-backed runs:" | cosmetic doc prose, no compat concern |
| **docs/guide/docker-backend.md:256** | `## 6. Running a Sprint` (heading) | user-visible heading/anchor | run-text: `## 6. Running a Run` | **anchor concern**: paired with TOC entry at line 19; anchor `#6-running-a-sprint` may be linked externally |
| docs/guide/docker-backend.md:269,272,275,284 | `# 4. Write sprint directives` + `# 5. Plan the sprint` + `# 6. Start the sprint` + "While a sprint is running, you can inspect active worker containers:" (code comments + prose) | user-visible | run-text: `# 4. Write run directives` / `# 5. Plan the run` / `# 6. Start the run` / "While a run is running, you can inspect active worker containers:" | cosmetic doc prose (comments), no compat concern |
| docs/guide/docker-backend.md:345 | `# Then re-run the sprint (auth is volume-mounted, not baked into image)` (code comment) | user-visible | run-text: `# Then re-run the run (auth is volume-mounted, not baked into image)` (awkward — consider "# Then start it again") | cosmetic doc prose (comment), no compat concern |
| docs/guide/docker-backend.md:380 | "**Symptom:** Sprint starts but immediately falls back to subprocess backend." | user-visible | run-text: "**Symptom:** Run starts but immediately falls back to subprocess backend." | cosmetic doc prose, no compat concern |
| docs/guide/docker-backend.md:418,420 | "[Quickstart Guide](quickstart.md) — General sprint setup" + "[Architecture Overview](...) — Sprint lifecycle internals" | user-visible | run-text: "General run setup" / "Run lifecycle internals" | cosmetic doc prose, no compat concern (external GitHub links unaffected by label wording) |

---

### docs/guide/troubleshooting.md — 10 total grep hits, covered by 8 table rows (6 individual + 2 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/troubleshooting.md:3 | `## Sprint Stuck / Workers Not Responding` (heading) | user-visible heading/anchor | run-text: `## Run Stuck / Workers Not Responding` | **anchor concern**: generates `#sprint-stuck--workers-not-responding` anchor — check for inbound links from other docs (e.g. this troubleshooting page is likely linked from getting-started/docker-backend "See Also" sections) before renaming |
| docs/guide/troubleshooting.md:11 | `# Check active sprint and worker status` (code comment) | user-visible | run-text: `# Check active run and worker status` | cosmetic doc prose (comment), no compat concern |
| docs/guide/troubleshooting.md:23 | "Run these steps in order — stop when the sprint resumes:" | user-visible | run-text: "Run these steps in order — stop when the run resumes:" | cosmetic doc prose, no compat concern |
| docs/guide/troubleshooting.md:33,146 | `deckent recover <sprint-id>` (CLI usage example, appears twice) | frozen-identifier (positional CLI argument placeholder) | n/a — keep identifier, reword surrounding prose only (the placeholder `<sprint-id>` names the actual argument the `deckent recover` command expects) | **real external contract**: `<sprint-id>` denotes the literal positional argument accepted by `deckent recover` — since the underlying sprint ID format (`sprint-NNN`) is itself a candidate for rename, this placeholder should be renamed in lockstep with the actual CLI arg semantics, not treated as free prose |
| docs/guide/troubleshooting.md:145 | `# Or recover the sprint (re-evaluates any partial results)` (code comment) | user-visible | run-text: `# Or recover the run (re-evaluates any partial results)` | cosmetic doc prose (comment), no compat concern |
| docs/guide/troubleshooting.md:255 | `## Nervous System Blocking Sprint Start` (heading) | user-visible heading/anchor | run-text: `## Nervous System Blocking Run Start` | **anchor concern**: generates `#nervous-system-blocking-sprint-start` anchor — check inbound links (nervous-system.md likely cross-references this troubleshooting section) |
| docs/guide/troubleshooting.md:257,258 | "The Nervous System (ADR-040) runs detectors before each sprint. If a panic-gate fires and the sprint hangs at SPAWN:" | user-visible | run-text: "...runs detectors before each run. If a panic-gate fires and the run hangs at SPAWN:" | cosmetic doc prose, no compat concern |
| docs/guide/troubleshooting.md:268 | `# Or disable nervous for this sprint (temporary)` (code comment) | user-visible | run-text: `# Or disable nervous for this run (temporary)` | cosmetic doc prose (comment), no compat concern |

---

### docs/reference/security.md — 8 total grep hits, covered by 7 table rows (7 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/security.md:40 | "The Brain orchestrates the sprint but cannot modify Operator-level configuration files." | user-visible | run-text: "The Brain orchestrates the run but cannot modify Operator-level configuration files." | cosmetic doc prose, no compat concern |
| docs/reference/security.md:45 | `\| Write \| .tasks/, .contracts/, .brain/, .dashboard, .deckent/config.json (limited fields via sprint-finalizer) \| AGENTS.md, DIRECTIVES.md \|` | mixed: table cell prose user-visible; `sprint-finalizer` = frozen-identifier (source module name) | run-text: "(limited fields via `sprint-finalizer`)" — reword only if needed, keep module name verbatim | `sprint-finalizer` is the literal module `src/orchestra/sprint-finalizer.ts` — frozen unless source renamed |
| docs/reference/security.md:273 | "`--allowedTools` excludes `DIRECTIVES.md` and `AGENTS.md`; `.deckent/config.json` is partially writable by Brain (limited fields only via sprint-finalizer)" | mixed: prose user-visible; `sprint-finalizer` frozen | run-text: reword surrounding prose only, keep `sprint-finalizer` module name | same as above — module name frozen |
| docs/reference/security.md:276 | "**Sprint abandonment** \| Error mid-sprint leaves tasks incomplete \| `runSprint` wraps all phases in try/catch; always reaches COMPLETE" | mixed: "Sprint abandonment"/"mid-sprint" = user-visible table cell prose; `runSprint` = frozen-identifier (literal function name in source) | run-text: "**Run abandonment** \| Error mid-run leaves tasks incomplete \| `runSprint` wraps all phases in try/catch..." — reword prose, keep `runSprint` function name verbatim | `runSprint` is the literal exported function name in `src/orchestra/sprint-controller.ts` — frozen unless source function is renamed |
| docs/reference/security.md:312 | "**Brain-family modules** (sprint-controller + extracted phase organics) are the only modules that import tmux/auditor/worker — per ADR-008 Sprint 281 amendment" | mixed: `sprint-controller` module name frozen; "Sprint 281" historical citation user-visible (low priority) | run-text: reword surrounding text if desired; keep `sprint-controller` verbatim; leave "Sprint 281" citation as-is | `sprint-controller` module name frozen; historical citation low priority |
| docs/reference/security.md:323 | "The `.deckent/config.json` file controls system behavior (model limits, plan mode, sprint IDs)." | user-visible | run-text: "...(model limits, plan mode, run IDs)." | cosmetic doc prose, no compat concern (though "sprint IDs" here alludes to the real `sprintId`/`last_sprint_id` fields — see next row) |
| docs/reference/security.md:329,333 | `"last_sprint_id": "sprint-091"` (JSON example) + "Brain may update limited config fields (e.g., agent_min_score, coverage_aspirational, last_sprint_id) at sprint end via sprint-finalizer.ts:applyAdaptiveThresholds()" | frozen-identifier (`last_sprint_id` field name + `sprint-091` value format + `sprint-finalizer.ts` filename); "at sprint end" phrase = user-visible prose | n/a for `last_sprint_id`/`sprint-finalizer.ts`/value format — reword only "at sprint end" → "at run end" | **real external contract**: `last_sprint_id` is a literal `.deckent/config.json` field (also seen mcp-guide.md:753); `sprint-finalizer.ts` is a literal source filename — both frozen without a coordinated schema/source migration |

---

### docs/guide/workers.md — 7 total grep hits, covered by 6 table rows (5 individual + 1 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/workers.md:389 | "Per ADR-037 V1.0 (Sprint 139):" | user-visible (historical citation) | run-text: leave "Sprint 139" citation as-is | cosmetic doc prose, low priority |
| docs/guide/workers.md:409 | `\| selfAssessment: "DONE" without honest verification \| FORBIDDEN \| Sprint evaluator rejects, task → NO_GO \|` | mixed: "Sprint evaluator" = user-visible prose (could also be read as referring to a component name, but no literal identifier `SprintEvaluator` class confirmed here) | run-text: "Run evaluator rejects, task → NO_GO" | cosmetic doc prose, no compat concern (verify no literal `SprintEvaluator` class/export exists before renaming with confidence — treated as prose here since it's describing behavior, not quoting a symbol) |
| docs/guide/workers.md:421 | "Brain will reschedule via mid-sprint-adapter" | mixed: "mid-sprint-adapter" reads as a component/module reference name | n/a — keep as `mid-sprint-adapter` identifier, OR reword prose if it's purely descriptive (needs source verification) | flag for verification: if `mid-sprint-adapter` is an actual source module/concept name (similar to `sprint-controller`), it is frozen; if purely descriptive prose, it's a rename candidate — recommend checking `src/` for a literal `mid-sprint-adapter` reference before deciding |
| docs/guide/workers.md:427,435 | "**Sprint 144 God Object Split:**" (historical citation) + "`worker-rollback.ts` \| Git-stash scope snapshot and rollback (Sprint 177)" (historical citation) | user-visible (historical citations) | run-text: leave "Sprint NN" citations as-is | cosmetic doc prose, low priority |
| docs/guide/workers.md:539 | "Workers **never plan** — only Brain can plan sprints" | user-visible | run-text: "Workers **never plan** — only Brain can plan runs" | cosmetic doc prose, no compat concern |
| docs/guide/workers.md:543 | "Sprint is **NEVER** left incomplete" | user-visible | run-text: "Run is **NEVER** left incomplete" | cosmetic doc prose, no compat concern |

---

### docs/index.md — 6 total grep hits, covered by 6 table rows (6 individual + 0 grouped) — HIGH VISIBILITY (docs landing page)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| **docs/index.md:7** | `tagline: Your AI development team, orchestrated. Run multi-agent sprints with Brain, Workers, and Auditor — all from the CLI.` | user-visible — **VitePress frontmatter tagline, first thing a new visitor reads** | run-text: `tagline: Your AI development team, orchestrated. Run multi-agent runs with Brain, Workers, and Auditor — all from the CLI.` — note the awkward "Run ... runs" repetition; recommend rewording to "Orchestrate multi-agent runs with Brain, Workers, and Auditor — all from the CLI." to avoid verb/noun collision | **HIGH VISIBILITY**: this is the homepage hero tagline (VitePress `tagline` frontmatter field) — highest-priority prose to get right; also demonstrates the same "run" verb/noun collision risk seen in mcp-overview.md's `deckent_run` note |
| **docs/index.md:22** | `details: Intelligent sprint planning with AI task decomposition. Brain coordinates all agents and evaluates results with GO/NO-GO/TECH-DEBT verdicts.` | user-visible — homepage feature-card details text | run-text: `details: Intelligent run planning with AI task decomposition. Brain coordinates all agents and evaluates results with GO/NO-GO/TECH-DEBT verdicts.` | HIGH VISIBILITY: homepage feature card, no compat concern beyond visibility |
| docs/index.md:47 | `- [First Sprint](guide/first-sprint.md)` | mixed: link label user-visible; `guide/first-sprint.md` route = potential frozen path | run-text: `- [First Run](guide/first-sprint.md)` (keep route unless renamed) | same route-consistency concern noted in concepts.md/getting-started-en.md/chat-mode.md — `guide/first-sprint.md` referenced across the doc set, must be coordinated |
| docs/index.md:77 | `- [Sprint Lifecycle](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/sprint-lifecycle.md)` | mixed: link label user-visible; URL path `docs/architecture/sprint-lifecycle.md` = frozen (external GitHub file path, out of this 15-file scope) | run-text: `- [Run Lifecycle](https://github.com/.../sprint-lifecycle.md)` (label only; URL unaffected unless that external file is also renamed — out of scope for this scan) | **compat concern**: external GitHub URL path `architecture/sprint-lifecycle.md` is outside the scanned 15 files — do not rename the URL without confirming that file's actual rename status |
| docs/index.md:83 | `- [First Sprint](https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/01-first-sprint.md)` | mixed: link label user-visible; URL path frozen (external, out of scope) | run-text: `- [First Run](.../01-first-sprint.md)` (label only) | same external-URL compat concern as above — `docs/cookbook/01-first-sprint.md` out of scan scope |
| docs/index.md:87 | `- [Recover a Stuck Sprint](https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/09-recover-stuck-sprint.md)` | mixed: link label user-visible; URL path frozen (external, out of scope) | run-text: `- [Recover a Stuck Run](.../09-recover-stuck-sprint.md)` (label only) | same external-URL compat concern — `docs/cookbook/09-recover-stuck-sprint.md` out of scan scope |

---

### docs/reference/provider-free.md — 4 total grep hits, covered by 4 table rows (4 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/provider-free.md:3 | "Deckent is designed to run with any supported AI provider without requiring changes to sprint definitions or task configuration... your DIRECTIVES, tasks, and sprint workflow are identical regardless of whether workers run on Claude, Codex, Gemini, or Ollama." | user-visible | run-text: "...without requiring changes to run definitions or task configuration... your DIRECTIVES, tasks, and run workflow are identical..." | cosmetic doc prose, no compat concern |
| docs/reference/provider-free.md:20 | `A "provider-free" sprint means:` | user-visible | run-text: `A "provider-free" run means:` | cosmetic doc prose, no compat concern |
| docs/reference/provider-free.md:74 | "The Docker backend is fully provider-aware as of Sprint 203 (ADR-066)." | user-visible (historical citation) | run-text: leave "Sprint 203" citation as-is | cosmetic doc prose, low priority |
| docs/reference/provider-free.md:135 | "Ollama is a first-class provider for local/offline operation (added Sprint 202, ADR-066)." | user-visible (historical citation) | run-text: leave "Sprint 202" citation as-is | cosmetic doc prose, low priority |

---

### docs/reference/stack-aware-routing.md — 3 total grep hits, covered by 3 table rows (3 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/reference/stack-aware-routing.md:3 | "At the start of a sprint, Deckent detects your project's `TechStackKind`..." | user-visible | run-text: "At the start of a run, Deckent detects your project's `TechStackKind`..." | cosmetic doc prose, no compat concern |
| **docs/reference/stack-aware-routing.md:60** | `overrideSource: OverrideSource;             // 'none' \| 'task-directive' \| 'sprint-directive' \| 'project-config'` | frozen-identifier | n/a — keep identifier, reword surrounding prose only | **real external contract**: `'sprint-directive'` is a literal TypeScript union-type enum value for the `OverrideSource` type in `RoutingDecision` — a real code-level contract, not doc prose. Renaming requires a source-code type change, not just documentation editing |
| docs/reference/stack-aware-routing.md:99 | "This is treated as a measurement gap, not a failure... the sprint can still succeed." | user-visible | run-text: "...the run can still succeed." | cosmetic doc prose, no compat concern |

---

### docs/guide/ram-experiment.md — 2 total grep hits, covered by 2 table rows (2 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/ram-experiment.md:5 | "Verify whether your host has enough RAM for a given `max_workers × worker_memory_limit` configuration before running a sprint." | user-visible | run-text: "...before running a run." | cosmetic doc prose, no compat concern |
| docs/guide/ram-experiment.md:108 | "Sprint 192 (`192-013`) documented first OOM incidents with `max_workers=2, worker_memory_limit=3g`... Sprint 194 added `detectHostMemory()`... Sprint 198 added `--ram-experiment` for pre-sprint RAM readiness verification." | mixed: "Sprint 192"/"Sprint 194"/"Sprint 198" historical citations user-visible (low priority); "pre-sprint RAM readiness verification" phrase user-visible | run-text: leave numbered sprint citations as-is; reword "pre-sprint RAM readiness verification" → "pre-run RAM readiness verification" | cosmetic doc prose; historical citations low priority, general phrase is a normal rename candidate |

---

### docs/guide/installation.md — 1 total grep hit, covered by 1 table row (1 individual + 0 grouped)

| file:line | mevcut string | sınıflama | önerilen aksiyon | geriye-uyumluluk notu |
|---|---|---|---|---|
| docs/guide/installation.md:154 | "[Quickstart Guide](quickstart.md) — run your first sprint in 5 minutes" | user-visible (link description text) | run-text: "run your first run in 5 minutes" (awkward repetition — consider "start your first run in 5 minutes") | cosmetic doc prose, no compat concern; link target `quickstart.md` unaffected |

---

## Cross-cutting flags for the rename effort (summary, not part of any single file's table)

1. **Terminology collision — `deckent_run` MCP tool** (docs/reference/mcp-overview.md:87): the tool `deckent_run` already exists and means "run a single task, not a full sprint." Renaming the sprint-lifecycle concept to "run" makes this description self-contradictory ("run a single task... no full run"). This needs a decision before any rename: either the sprint-lifecycle concept adopts a different term (e.g. "cycle", "session"), or `deckent_run`'s prose gets special-cased wording, or the tool itself is deprecated/renamed (very high blast radius — it's a stable MCP tool name).

2. **Same collision surfaces in `/sprint` REPL command** (docs/guide/chat-mode.md:58) and in general "run a sprint" phrasing throughout getting-started-en.md/docker-backend.md (e.g. "run the sprint" → "run the run").

3. **Canonical concept-definition anchor**: `docs/guide/concepts.md:7` (`## Sprint`) is very likely the most cross-referenced anchor in the guide docs — flagged for anchor-compat review before renaming.

4. **Persisted ID/schema identifiers frozen across many files** (consistent, not per-file): `sprintId`, `sprintNumber`, `sprint-NNN` id format, `jobId: "sprint-<timestamp>"`, `last_sprint_id`, `sprintsOpen`, `"sprints"` array field, `"sprint": "sprint-NNN"` in debt records, `"methodology": "sprint-parallel"`, `sprint-controller.ts`/`sprint-finalizer.ts` module names, `runSprint()` function name, `KILL_LIVE_SPRINT` action constant, `.brain/sprints/` directory, `'sprint-directive'` TS union value, `cost_limits.sprint_max_usd` config key. Any of these appearing in doc prose is frozen; renaming them is a source-code/schema-migration project separate from this doc-prose rename.

5. **Route path `/guide/first-sprint`** (and external GitHub cookbook paths `01-first-sprint.md`, `09-recover-stuck-sprint.md`, `architecture/sprint-lifecycle.md`) is referenced from at least 5 of the 15 scanned files (concepts.md, getting-started-en.md, chat-mode.md, docker-backend.md, index.md) — needs a single coordinated decision (rename the route + add redirect, or keep route stable and only reword the link label).

6. **Historical "Sprint NN" citations** (dozens of occurrences, especially in nervous-system.md, workers.md, docker-backend.md, provider-free.md, ram-experiment.md) name a specific past sprint/release milestone in the project's own dogfood history, not the general concept — recommend a policy decision on whether to leave these untouched (they're changelog-style references) versus rewording for consistency.
---

# GENEL SENTEZ — Üç Yüzey Boyunca Tekrar Eden Yüksek-Riskli Bulgular

Bu bölüm, üç yüzeyin (CLI/MCP/Docs) kendi batch-notlarında ayrı ayrı flag'lenen ama proje-çapında TEK bir karar gerektiren kalemleri birleştirir. Downstream task'lar (2-3-4) bunları ayrı ayrı çözmeye çalışmamalı — her biri tek bir koordineli karar/PR gerektirir.

## A. Kod-seviyesi rename gerektiren "büyük kaya"lar (docs-only veya messages.ts-only bir PR ile ÇÖZÜLEMEZ)

1. **`Sprint` TypeScript interface + `runSprint()` fonksiyonu** (`src/orchestra/`, SDK'nin en çok kullanılan export'u) — api.md, glossary.md, security.md, autonomous-engine.md hepsi bunu "en büyük kaya" olarak flag'liyor. `runSprint` adının kendisi zaten "run" ile başlıyor — rename sonrası "runRun" gibi kafa karıştırıcı bir isimlendirme riski var; editoryal karar gerekiyor.
2. **`deckent_style: "sprint"`** — kalıcı `.deckent/config.json` enum değeri, her mevcut kullanıcının diskinde. Şema-migrasyon + geriye-uyum shim'i gerekli (mode.ts, config.md, config-reference.md, cli.md hepsi bunu flag'liyor).
3. **`GET /api/sprint`** HTTP route + `sprint`/`lastSprint` JSON response alanları (`/api/status`, `/api/history`, `/api/kpi?sprint=`) — versiyonlanmış dış API sözleşmesi, route rename + deprecation-period gerektirir (api.md, api-endpoints.md, api-examples.md, dashboard.md, mcp-guide.md hepsi aynı sözleşmeyi dokümante ediyor).
4. **`kind: "sprint"` enum değeri** — `deckent_autonomous`, `deckent_autonomous_backlog`, `deckent_process` MCP tool'ları + `--kind sprint` CLI flag'i arasında paylaşılan tek sözleşme; üçünde de eşzamanlı alias/deprecation gerekir.
5. **`sprint:read`/`sprint:write`/`Permission.SPRINT_WRITE`** RBAC izin-string'leri — güvenlik-kritik, yüksek blast-radius (enterprise-foundation.md, enterprise-depth.md, cli.md `rbac check` örneği).
6. **`--sprint <id>` ailesi CLI flag'leri** (`--sprint`, `--sprint-id`, `--sprint-min`, `--sprints`) — kpi/agent/finalize/explain/usage/audit/recall/evolve/output komutlarında AYNI flag tekrar tekrar geçiyor; tek bir koordineli `--run` alias + deprecation kararı gerekiyor, komut-komut değil.
7. **`/sprint` REPL slash-command adı** (`chat-slash-registry.ts`) — kullanıcı-tipli gerçek komut adı, `/run` alias'ı + deprecation-period gerektirir.
8. **`sprint_file_retention.*` config-namespace'i** (`keep_last_n`/`size_cap_mb`/`archive_path`) + `sprint-file-retention.ts` dosya adı + varsayılan `.deckent/archive/sprints/` path'i — taranan en yoğun frozen-identifier kümesi (config-reference.md).
9. **`.brain/sprints/sprint-{id}.md` dosya-adlandırma konvansiyonu** — event-log (`<sprint-id>-events.jsonl`), IPC-dizini (`sprint-NNN-ipc`), backup git-branch adı (`deckent-backup-<sprintId>`) hepsi bu ID-formatına bağlı; docs prose rename bunlara dokunmaz ama gerçek anlamlı bir rename için ayrı bir data-migration epic'i gerekiyor.

## B. İsimlendirme çakışması riski (editoryal karar gerekiyor, mekanik find-replace YETMEZ)

1. **`deckent_run` (MCP tool) / `deckent run` (CLI komutu)** zaten "tek seferlik görev, TAM sprint DEĞİL" anlamında var. "sprint"→"run" olursa "Run a single task outside of a full run" gibi kendine-referanslı, kafa karıştırıcı cümleler oluşur (run.ts, mcp-overview.md, local-model-workers.md, faq.md hepsi bunu flag'liyor). Ürün-seviyesi bir terim kararı gerekiyor (örn. "cycle", "orchestration run" gibi bir ayrım terimi).
2. **"Run a sprint" / "run another sprint" kalıpları** naif find-replace ile "run a run" olur — chat.ts, first-sprint.md, index.md (homepage tagline!), health-check.md, onboarding.md, getting-started*.md hepsinde tekrarlıyor. İnsan gözden geçirmesi (copy-edit pass) gerekli, mekanik değil.

## C. Markdown anchor / inbound-link riski (rename ÖNCESİ site-genelinde link denetimi gerekli)

En yüksek riskli anchor'lar: `docs/reference/glossary.md#sprint` ve `#sprintid` (muhtemelen site-genelinde en çok bağlantı verilen anchor'lar), `docs/guide/concepts.md#sprint` (rehber dokümanlarının kavram-tanımı keystone'u), `docs/guide/first-sprint.md` dosya adının kendisi (→ `first-run.md`, redirect gerekli). Ayrıca performance.md, cli-commands.md, quickstart.md, managed-docs.md, config.md, config-recovery.md, lifecycle-diagram.md, autonomous.md, deckent-nedir.md, troubleshooting.md, docker-backend.md, api-surface.md, api-endpoints.md içinde daha düşük-riskli ama yine de kontrol edilmesi gereken heading-anchor'lar var (bkz. ilgili yüzey bölümleri).

## D. Zaten mevcut kod-kalitesi açıkları (bu rename'in kapsamı dışında ama tarama sırasında tespit edildi)

1. **`src/cli/commands/chat-slash-registry.ts:551`** — `messageKey: 'chat.usage_sprint_required'` referansı var ama messages.ts'te bu key YOK (doğrulandı). Rename işi doğru-adlı yeni key'i (`chat.usage_run_required`) oluşturarak bu açığı da kapatmalı.
2. **`src/cli/commands/do.ts:415`** — zaten-migrasyonlu `do.finished` key'inin ham (hardcoded) bir kopyası; `getMessage('do.finished', lang, {...})` çağrısına yönlendirilmeli.
3. **`src/cli/helpers/sprint-summary.ts`** (`RichSprintSummary` sınıfı) production kodunda import edilmiyor gibi görünüyor — rename'e yatırım yapmadan önce Alperen'e sorulmalı (silinebilir mi?).
4. **`src/cli/commands/dashboard.ts:164`** — `{error: '...'}` JSON metni `getMessage()` yerine ham hardcode; satır 176'daki kardeş-branch zaten key kullanıyor — tutarsızlık.
5. Birkaç dosya (`resume.ts`, `sprint-summary-rich.ts`) hiç `getMessage()`/messages.ts kullanmıyor — %100 hardcoded İngilizce (pre-existing i18n-FIRST ihlali, bu rename'den bağımsız ama rename sırasında migrate edilmesi doğal bir fırsat).
