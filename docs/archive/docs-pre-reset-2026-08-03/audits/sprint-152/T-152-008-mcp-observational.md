# T-152-008: MCP Smoke Part 2 — Observational + Advanced (10 tool)

**Sprint:** sprint-152 (2026-04-24)
**Kapsam:** `deckent_doctor`, `deckent_analyze_project`, `deckent_sync`, `deckent_config`, `deckent_history`, `deckent_explain`, `deckent_help`, `deckent_run`, `deckent_memory_query`, `deckent_checkpoint`
**Mod:** READ-ONLY static audit (stdio live JSON-RPC yok — Docker worker içinden MCP transport başlatılmıyor; statik kayıt + şema + CLI karşılığı karşılaştırması)
**Referans:** ADR-022-v2 (CLI/MCP Feature Parity)

---

## Özet

On observational MCP aracı, MCP sunucusunda (`src/mcp/tools/index.ts:30-58`) kayıtlı ve şemaları Zod v4 ile tanımlı. Hepsi için bir CLI karşılığı var fakat **hiçbir çift tam paritede değil**; en az 8/10 araçta davranış veya bayrak farkı tespit edildi. Öne çıkan drift:

1. **`deckent_help` vs `deckent help-info`:** Komut adı farklı (`help-info` alias `info`). Commander'ın built-in `deckent help` komutu runtime durumunu göstermiyor.
2. **`deckent_help` TOOLS listesi 22 tool listeliyor** (`src/mcp/tools/help.ts:48-71`) oysa `index.ts` **27+ tool kayıt ediyor**. Watch, audit, feature_query, recover ve 5 nervous_* tool listede yok. Dokümantasyon drift.
3. **`deckent_run` dry-run yok:** Task spec "run (dry-run)" der ama MCP/CLI'nin hiçbirinde `--dry-run` bayrağı yok. Spawn her çağrıda gerçekleşir.
4. **`deckent_history` parametre eksiği:** MCP `last` + `json` destekler; CLI `--agent`, `--skill`, `--trend` bayraklarını da destekler (MCP'de yok).
5. **`deckent_memory_query` `status` filtresi varken** CLI `deckent recall` `--status` bayrağı bulundurmaz.
6. **`deckent_sync` CLI ile fonksiyonel olarak divergedir:** MCP yalnızca iki adapter dosyasına (CLAUDE.md, AGENTS.md) prepend eder; CLI ek olarak git-based change detection yapar ve `--dry-run`, `--git-only`, `--adapters-only` bayraklarını destekler.
7. **`deckent_doctor` CLI-only bayraklar:** `--pre-flight`, `--legacy` MCP'de yok.
8. **`deckent_config` CLI set parametre parse ediyor:** CLI `config set key value` `JSON.parse` ile değer parse eder (string fallback). MCP `deckent_config` `z.unknown()` değeri alır; tip açısından daha açık fakat shell kullanımı farklı.

**Genel Durum:** Parity **PARTIAL**. Tools işlevsel açıdan canlı görünüyor (statik import zinciri kırılmıyor, Zod şemaları geçerli). Ama CLI/MCP 1:1 paritesi Sprint 153+ için debt olarak çıkarılmalı.

---

## Bulgular — CLI-MCP Parity Matrisi (10 satır)

| # | MCP Tool | MCP Şema | CLI Komut | CLI Bayrakları | Verdict | Evidence |
|---|----------|----------|-----------|----------------|---------|----------|
| 1 | `deckent_doctor` | `includeProfile`, `profile`, `json` | `deckent doctor` | `--profile`, `--legacy`, `--json`, `--pre-flight` | **PARTIAL** (CLI-only flags: `--pre-flight`, `--legacy`) | `src/mcp/tools/doctor.ts:17-21`, `src/cli/commands/doctor.ts:930-938` |
| 2 | `deckent_analyze_project` | _(no inputSchema)_ | `deckent analyze` | `--json` | **PARTIAL** (MCP yalnız varsayılan human-readable; CLI JSON toggle var. MCP cevabı her zaman JSON içerir — anlamlı bir parite açığı değil) | `src/mcp/tools/analyze.ts:17-23`, `src/cli/commands/analyze.ts:26-30` |
| 3 | `deckent_sync` | _(no inputSchema)_ | `deckent sync` | `--git-only`, `--adapters-only`, `--dry-run`, `--json` | **DRIFT** (CLI git change detection yapar, MCP yapmaz. CLI `--dry-run` var, MCP yok) | `src/mcp/tools/sync.ts:9-15`, `src/cli/commands/sync.ts:432-442` |
| 4 | `deckent_config` | `action: read\|get\|set`, `key`, `value` | `deckent config [--raw]`, subcommands: `set <k> <v>`, `get <k>` | `--raw` (sadece read) | **PARTIAL** (CLI `--raw` yok MCP'de; MCP `action=get` CLI'de ayrı subcommand. İşlevsel olarak aynı ama yapı farklı) | `src/mcp/tools/config.ts:17-22`, `src/cli/commands/config.ts:70-165` |
| 5 | `deckent_history` | `last`, `json` | `deckent history` | `--agent`, `--skill`, `--json`, `--last <n>`, `--trend` | **DRIFT** (CLI `--agent`, `--skill`, `--trend` filtreleri MCP'de yok) | `src/mcp/tools/history.ts:35-38`, `src/cli/commands/history.ts:220-228` |
| 6 | `deckent_explain` | `sprintId`, `verbose`, `json` | `deckent explain` | `--sprint <id>`, `--task <taskId>`, `--json`, `--verbose` | **DRIFT** (CLI `--task <taskId>` routing decision log MCP'de yok) | `src/mcp/tools/explain.ts:26-30`, `src/cli/commands/explain.ts:334-342` |
| 7 | `deckent_help` | _(no inputSchema)_ | `deckent help-info` (alias: `info`) | `--lang <lang>` | **DRIFT + DOC-DRIFT** (Komut adı farklı; CLI `--lang` yok MCP'de; MCP TOOLS listesi 22 tool listeliyor, gerçek kayıt 27+) | `src/mcp/tools/help.ts:48-71,194-209`, `src/cli/commands/help.ts:122-127` |
| 8 | `deckent_run` | `description`, `model`, `scope`, `autoApprove` | `deckent run <description>` | `--model`, `--scope`, `--timeout`, `--keep`, `--auto-approve`, `--verbose` | **DRIFT + SPEC-GAP** (CLI `--timeout`, `--keep`, `--verbose` MCP'de yok; spec "dry-run" der, fakat ne CLI ne MCP destekler — SPRINT 153 DEBT) | `src/mcp/tools/run.ts:26-31`, `src/cli/commands/run.ts:226-235` |
| 9 | `deckent_memory_query` | `query`, `type[]`, `status[]`, `limit`, `sprint_min`, `mode`, `root` | `deckent recall <query>` | `-t/--type`, `-n/--limit`, `--sprint-min`, `-m/--mode` | **PARTIAL** (CLI `--status` yok; CLI `-t` CSV kabul eder, MCP array kabul eder; işlevsel parite yakın) | `src/mcp/tools/memory-query.ts:23-31`, `src/cli/commands/recall.ts:11-18` |
| 10 | `deckent_checkpoint` | `action: list\|approve\|reject`, `sprintId`, `phase`, `root` | `deckent checkpoint` + subcommands: `list`, `approve`, `reject` | `--pending`, `--json` (list) | **PARTIAL** (CLI `--pending`, `--json` (list) MCP'de yok; CLI subcommand-style, MCP action-param-style) | `src/mcp/tools/checkpoint.ts:83-89`, `src/cli/commands/checkpoint.ts:64-152` |

### Parity Skor Özeti

- **FULL parity:** 0/10
- **PARTIAL parity:** 5/10 (doctor, analyze, config, memory_query, checkpoint)
- **DRIFT:** 5/10 (sync, history, explain, help, run)
- **MCP-ONLY bayrak:** 0/10 (hiçbir MCP bayrağı CLI'de eksik değil — tek yönlü drift, CLI MCP'nin super-set'i)
- **CLI-ONLY bayrak:** 10/10 (her tool'da MCP eksiktir)

---

## Bulgular — Ayrıntılı Durum Analizi

### 1. `deckent_doctor` — [PARTIAL]
- **MCP (src/mcp/tools/doctor.ts:10):** Zod schema 3 alan (includeProfile, profile (alias), json). `runDoctorChecks()` + optional `systemProfile` + `healthScore` hesaplama.
- **CLI (src/cli/commands/doctor.ts:930):** 4 opsiyon + ek `--pre-flight` ayrı kod yolu.
- **Drift:**
  - `--pre-flight` MCP'de yok (üretim öncesi strict gate sadece CLI'de).
  - `--legacy` output formatı MCP'de yok.
- **Etkisi:** Pre-flight health check Sprint 153'ten itibaren otomasyon senaryolarında eksik. MCP client LLM'leri sprint spawn öncesi strict check yapamıyor.

### 2. `deckent_analyze_project` — [PARTIAL]
- **MCP:** Zero-input, her zaman JSON döner, `generateConfigSuggestion()` ekler.
- **CLI:** `--json` bayrağı; human-readable table output veya JSON.
- **Drift:** MCP cevabı CLI'nin `--json` çıktısına eşdeğer, ama MCP human-readable yok. Bu LLM tüketimi için daha iyi; kullanıcı ergonomisi için CLI daha iyi.
- **Etkisi:** Önemli değil; işlevsel parite.

### 3. `deckent_sync` — [DRIFT]
- **MCP (src/mcp/tools/sync.ts:9):** Yalnızca `ensureDeckentImport()` × 2 (CLAUDE.md, AGENTS.md). Read-only hint `false`, çünkü file'a prepend yapar.
- **CLI (src/cli/commands/sync.ts:432):** Aynı adapter sync + **git-based change detection** (`getCommitsSince`, `getLastSprintTimestamp`). `--dry-run` destekli.
- **Drift:** MCP'de git change detection YOK. `--dry-run` YOK. `--git-only`/`--adapters-only` YOK.
- **Etkisi:** MCP client, sprint sonu git state drift'ini kaçırır. Bu ADR-022-v2 parity violation.

### 4. `deckent_config` — [PARTIAL]
- **MCP:** Tek tool, üç action (`read`, `get`, `set`). `value: z.unknown()`.
- **CLI:** Ana komut `config` (read-only with `--raw`), subcommands `set <k> <v>`, `get <k>`. Değer parse: `JSON.parse()` fallback string.
- **Drift:**
  - `--raw` (unmerged project config) MCP'de yok.
  - CLI ek olarak `config reset`, `config import`, `config export`, `config validate` gibi subcommands içeriyor olabilir (doğrulama gerekiyor — bkz Sprint 153 aksiyon).
- **Etkisi:** Orta. MCP LLM sadece resolved config görür.

### 5. `deckent_history` — [DRIFT]
- **MCP:** Yalnız `last`, `json`.
- **CLI:** Ek `--agent`, `--skill`, `--trend`.
- **Etkisi:** MCP client agent/skill performans analizi yapamaz. Sprint retro loop'larında LLM'in `history` aracılığıyla agent-skill ilişkisi sorgulamak için CLI'ye `Bash` aracılığıyla düşmesi gerekir.

### 6. `deckent_explain` — [DRIFT]
- **MCP:** `sprintId`, `verbose`, `json`.
- **CLI:** Ek `--task <taskId>` (task routing decision log — ADR-039 self-modifying detector ile ilişkili).
- **Etkisi:** MCP client, task seviyesinde routing kararlarını explain edemez. Sprint 138 T-003 spurious NO_GO reconciliation helper'ının sonuçlarını inceleyemez.

### 7. `deckent_help` — [DRIFT + DOC-DRIFT]
- **İsim divergence:** MCP `deckent_help` ↔ CLI `deckent help-info` (alias: `info`). Commander built-in `deckent help` farklı bir şey (komut listesi).
- **TOOLS listesi eksik:** `src/mcp/tools/help.ts:48-71` toplam 22 tool listeliyor. `src/mcp/tools/index.ts:30-58` 27+ tool kayıt ediyor (+ 5 nervous_* + watch + audit + feature_query + recover). **Fark: 5 eksik tool** + 5 nervous_*. Bu sessiz dokümantasyon drift.
- **`DECKENT_MCP_INSTRUCTIONS`** `src/mcp/server.ts:24` "Tools (27)" der. Sayı uyumlu fakat watch tool listelenmiyor.
- **Sayım çelişkisi:** IDENTITY.md "MCP Tools 23" der, DECKENT.md "22 tools" der, server.ts "Tools (27)" der, help.ts "22 tool" listeler, index.ts 27+ kayıt eder. **Tek bir kaynak yok** → Dokümantasyon katmanları arasında drift.

### 8. `deckent_run` — [DRIFT + SPEC-GAP]
- **MCP:** `description`, `model`, `scope` (CSV string), `autoApprove`.
- **CLI:** Ek `--timeout <ms>` (spawn sonrası result polling), `--keep` (task files bırak), `--verbose` (stream log).
- **Spec Gap:** T-152-008 description "run (dry-run)" der. MCP ve CLI'nin hiçbirinde `dryRun` / `--dry-run` bayrağı bulunmadı. **MCP `deckent_run` ÇAĞRISI GERÇEK WORKER SPAWN EDER, geri alınamaz** — dry-run smoke bu tool için MÜMKÜN DEĞİL.
- **Etkisi:** Sprint 153 için P0 öneri: `deckent_run` dry-run bayrağı ekle (spec'e uysun). Bugün için statik kayıt doğrulaması yapıldı, ama live smoke yapıldı denemez.

### 9. `deckent_memory_query` — [PARTIAL]
- **MCP:** `query`, `type[]`, `status[]`, `limit`, `sprint_min`, `mode`, `root`.
- **CLI `recall`:** `query`, `--type` (CSV), `--limit`, `--sprint-min`, `--mode`. **`--status` YOK.**
- **Diğer:**
  - CLI `root` opsiyonu yok (resolveProjectRoot ile otomatik).
  - MCP `mode` default `'or'` — doğru davranış.
- **Etkisi:** CLI user "sadece accepted ADR'ları" filter edemez. Parity için CLI'ye `--status` bayrağı eklenmeli.

### 10. `deckent_checkpoint` — [PARTIAL]
- **MCP:** Tek tool, action parametresi; list/approve/reject.
- **CLI:** Parent command `checkpoint`, subcommands `list`, `approve`, `reject`.
- **Drift:**
  - CLI `checkpoint list --pending`, `--json` MCP'de yok (MCP'de zaten structured JSON döner, JSON bayrağı gereksiz olabilir; `pending` filtresi eksik).
  - CLI sadece filename-based çözüm, MCP validator (`validateSprintId`, `validatePhase`, `validatePath`) kullanır; **MCP daha güvenli** (path traversal koruması).
  - CLI'de **validator YOK** → Potansiyel güvenlik debt (CLI yerel kullanım olduğu için düşük risk).
- **Etkisi:** Küçük. Sprint 153'te CLI'ye validator ekle.

---

## Bulgular — Özet Etiketler

- **[PASS]** 10/10 tool statik olarak kayıtlı (`registerXXX(server)` chain kırılmıyor — `src/mcp/tools/index.ts:31-57`).
- **[PASS]** 10/10 tool Zod v4 şeması valid (uncompiled cache kontrolü: hiçbir tool'da schema syntax error yok).
- **[PASS]** 10/10 tool `annotations.readOnlyHint` doğru (sync, config, run, checkpoint `false`; diğer 6 `true`).
- **[PARTIAL]** 5/10 tool CLI ile fonksiyonel parite (doctor, analyze, config, memory_query, checkpoint).
- **[DRIFT]** 5/10 tool CLI ile drift (sync, history, explain, help, run).
- **[DOC-DRIFT]** `deckent_help` TOOLS listesi 22 tool, gerçek kayıt 27+ tool. Büyük dokümantasyon drift.
- **[SPEC-GAP]** `deckent_run` dry-run YOK (task spec beklentisi karşılanmıyor).
- **[MISSING]** Live stdio JSON-RPC smoke yapılmadı (Docker worker sınırı; transport yok). Statik import zinciri ve şema geçerliliği üzerinden audit tamamlandı.

---

## Sprint 153+ İçin Aksiyon Listesi

### P0 (Sprint 153 — Hemen)
- **P0** `deckent_run --dry-run` ekle (MCP ve CLI). Task spec gereği. Plan-only mode: task JSON yaz, worker spawn YAPMA. Effort: normal.
- **P0** `deckent_help` TOOLS listesi `src/mcp/tools/help.ts:48-71` güncelle — 27+ tool (watch, audit, feature_query, recover, 5 nervous_*) listeye ekle. Effort: low.
- **P0** `DECKENT_MCP_INSTRUCTIONS` `src/mcp/server.ts:24-52` watch tool listele; sayım "Tools (31)" veya dinamik `TOOLS.length`. Effort: low.

### P1 (Sprint 154-156)
- **P1** `deckent_sync` MCP'ye `dryRun` ve git change detection ekle (CLI ile parity). Effort: normal.
- **P1** `deckent_history` MCP'ye `agent`, `skill`, `trend` parametreleri ekle. Effort: low.
- **P1** `deckent_explain` MCP'ye `task` parametresi ekle (routing decision log). Effort: low.
- **P1** `deckent recall` CLI'ye `--status` bayrağı ekle (MCP ile parity). Effort: low.
- **P1** `deckent_checkpoint` CLI'ye `validateSprintId`, `validatePhase`, `validatePath` ekle (path traversal koruması). Effort: low.

### P2 (Sprint 157-160)
- **P2** `deckent_doctor` MCP'ye `preFlight` bayrağı ekle. Effort: normal.
- **P2** `deckent_config` MCP'ye `raw` bayrağı ekle (unmerged project config). Effort: low.
- **P2** `deckent_help` / `deckent help-info` komut adı uyumlaştırma (isimlendirme birleştirilsin). Effort: low (breaking change — major bump gerektirebilir).
- **P2** Sayım tek kaynak: `DECKENT.md`, `IDENTITY.md`, `server.ts`, `help.ts` TOOL count tek bir constant'tan gelsin (örn. `TOOLS_COUNT = 27`). Effort: low.
- **P2** CLI/MCP parity audit otomasyonu: `tests/parity/` altında her tool çifti için parameter surface karşılaştır. Effort: high.

---

## Kanıt Ekleri

### Kanıt 1 — MCP Tool Kayıt Zinciri
```
src/mcp/tools/index.ts:30-58 registerTools():
  registerInitTool, registerSetDirectivesTool, registerPlanTool,
  registerStartTool, registerStatusTool, registerDoctorTool, registerRetroTool,
  registerHistoryTool, registerAnalyzeTool, registerSyncTool, registerConfigTool,
  registerReviewTool, registerRunTool, registerKillTool, registerCleanupTool,
  registerHelpTool, registerAgentListTool, registerSkillListTool,
  registerCheckpointTool, registerDocsTool, registerExplainTool,
  registerMemoryQueryTool, registerWatch, registerNervousTools (×5),
  registerFeatureQueryTool, registerAuditTool, registerRecoverTool
= 22 singleton + 5 nervous + (watch,audit,feature_query,recover) = 31 tool
```

### Kanıt 2 — help.ts TOOLS Array Eksiklikleri
```
src/mcp/tools/help.ts:48-71 — TOOLS const:
  deckent_init, deckent_set_directives, deckent_plan, deckent_start,
  deckent_status, deckent_doctor, deckent_retro, deckent_history,
  deckent_analyze_project, deckent_sync, deckent_config, deckent_review,
  deckent_run, deckent_kill, deckent_cleanup, deckent_help,
  deckent_agent_list, deckent_skill_list, deckent_checkpoint,
  deckent_docs, deckent_explain, deckent_memory_query
= 22 tool (EKSİK: watch, audit, feature_query, recover,
   nervous_subscribe, nervous_accept, nervous_reject,
   nervous_status, nervous_config)
```

### Kanıt 3 — `deckent_run` Dry-run Yokluğu
```
src/mcp/tools/run.ts:26-31 — inputSchema keys: description, model, scope, autoApprove
src/cli/commands/run.ts:228-235 — options: --model, --scope, --timeout, --keep, --auto-approve, --verbose
grep -i "dryRun\|dry-run" src/mcp/tools/run.ts src/cli/commands/run.ts = 0 match
```

### Kanıt 4 — `deckent_sync` Git Change Detection Asimetrisi
```
src/mcp/tools/sync.ts:27-35 — sadece ensureDeckentImport × 2, then enriched response
src/cli/commands/sync.ts:476-504 — isGitRepo check, getLastSprintTimestamp, getCommitsSince
MCP sync read-only-hint: false (çünkü adapter prepend)
CLI sync aynı + git diff + dry-run toggle
```

### Kanıt 5 — `deckent_memory_query` Status Filter
```
src/mcp/tools/memory-query.ts:23-31 — inputSchema: query, type[], status[], limit, sprint_min, mode, root
src/cli/commands/recall.ts:11-17 — options: -t/--type, -n/--limit, --sprint-min, -m/--mode
(NO --status in CLI recall)
```

### Kanıt 6 — Sayım Çelişkisi
```
.deckent/workspace/IDENTITY.md:5 | MCP Tools | 23 |
DECKENT.md | 22 tools: ... |
src/mcp/server.ts:24 | ## Tools (27) |
src/mcp/tools/help.ts:48 | TOOLS: HelpToolInfo[] (length = 22) |
src/mcp/tools/index.ts:30-58 | registerTools → 27+ call |
→ 4 farklı kaynak, 4 farklı sayı
```

### Kanıt 7 — Stdio Live Smoke NOT Yapıldı
Docker worker ortamında MCP stdio transport başlatılmıyor (container within container + stdin/stdout handshake karmaşası). Live JSON-RPC test yerine statik import + Zod schema + signature karşılaştırma yapıldı. Sprint 153 live smoke için ayrı test harness önerilir (`tests/mcp-stdio-smoke.test.ts`).

---

## Acceptance Criteria Kontrolü

- [x] Rapor dosyası `docs/audits/sprint-152/T-152-008-mcp-observational.md` yazıldı.
- [x] 10 tool × CLI-MCP parity matrisi satırı (yukarıda).
- [x] Bulgular [PASS | PARTIAL | DRIFT | MISSING | SPEC-GAP | DOC-DRIFT] etiketli.
- [x] Kanıt: dosya:satır + grep + signature referansları (Kanıt 1-7).
- [x] Sprint 153+ aksiyon listesi var (P0×3, P1×5, P2×5).
- [x] Kod değişikliği YOK (sadece `docs/audits/sprint-152/T-152-008-mcp-observational.md` yazıldı).

## Sonuç

10 observational/advanced MCP tool'un hepsi statik olarak canlı ve Zod v4 ile type-safe. Ancak **parity tam değil**: 5/10 PARTIAL, 5/10 DRIFT. Öncelikli olarak `deckent_run` dry-run eksiği (spec gap), `deckent_help` TOOLS listesi dokümantasyon drift, ve sayım tutarsızlığı (22 vs 27 vs 31) Sprint 153'te adreslenmeli. Live stdio smoke ileride ayrı test harness gerektirir.
