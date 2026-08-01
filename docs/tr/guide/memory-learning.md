# Memory, recall ve learning

## Product-user perspektifi

Deckent product memory'si repository-host instruction memory değil, `.brain/memory.db`'dir. ADR, memory, sprint record, debt, pattern, retrospective, chat, audit material, relation/history, document tracking ve KPI projection saklar. [Kanıt: `AGENTS.md:69-73`; `src/core/memory-store.ts:100-338`; `docs/tr/db.md` içindeki gerçek PRAGMA inventory]

## Recall

`recall <query>`; type filter, result limit, minimum sprint, OR/AND FTS token joining ve JSON output destekler. “Goal Mission Flow” için gerçek query beş mixed memory/ADR/sprint result döndürdü ve normalized match'leri işaretledi. [Kanıt: `src/cli/commands/recall.ts:11-50`; gerçek `recall ... --json`, 2026-08-01]

```bash
node dist/cli/entry.js recall "Goal Mission Flow" --json
```

Operator broad context yerine authority aradığında dar type filter kullanın—örneğin architecture change öncesi yalnız ADR recall. Search ranking evidence retrieval'dır, policy precedence değildir. [Kanıt: yukarıdaki recall option'ları; precedence `AGENTS.md:116-127`]

## Remember ve relations

`remember <note>`, optional tags/title ile typed memory yazar. `memory relations list|review`, relation state'i sunar. Bunlar DB authority üzerinde mutation/read operation'dır ve tenant/source semantics'e uymalıdır. [Kanıt: `src/cli/commands/remember.ts:11-45`; `src/cli/commands/memory.ts:202-264`; `src/core/memory-store.ts`]

Audit'te remember/rebuild/export/backup mutation çalıştırılmadı. [Kanıt: owner write boundary]

## Statistics, export, rebuild, backup

Gerçek `memory stats` run 1.764 entry ve schema v1 bildirdi; ADR, audit, chat, debt, finding, identity, memory, pattern, retro ve sprint type'larına ayrıldı. Bu dated repository snapshot'tır. [Kanıt: real output, 2026-08-01]

`memory export`, DB content'i `.brain/exports/*.md` içine project eder; `memory rebuild` reverse import yapar; `memory backup`, SQLite backup/checkpoint behavior kullanır. Generated Markdown data/projection'dır, policy authority değildir. [Kanıt: `src/cli/commands/memory.ts:17-200`; `AGENTS.md:112-114`]

## ADR memory

Current governance accepted ADR authority'nin `memory.db` içinde yaşadığını söyler; Markdown ADR copy'leri canonical decision store değil historical/generated view'dır. Retrieval yine precedence ve scope'a uyar; ADR owner/system veya Immutable Law'u override etmez. [Kanıt: `AGENTS.md:69-73,116-127`; `src/core/memory-store.ts`; `docs/tr/governance/adr-system.md`]

## Training trace

Canlı truth command, `training-trace` için code `ok`, wired `ok`, enabled `on`, proof `ok` bildirdi. `src/orchestra/sprint-phases.ts` içinde callsite ve `.deckent/traces/sprint-worker.jsonl` içinde recent journal buldu. [Kanıt: gerçek `truth --json`, 2026-08-01; `src/orchestra/output-collector.ts:28-89`; `src/orchestra/sprint-phases.ts:2539-2558,2953-2977`]

Default config trace'i universally on yapmaz; recording call `training_trace.enabled` koşuluna bağlı ve fail-soft'tur. Dogfood project'in enabled olması global default iddiası değildir. [Kanıt: aynı source line'ları; manifest truth contract]

## Evolution ve promotion

`evolve report`, cross-sprint agent/skill trend'lerini okur. Promotion pipeline temporary entity'leri evaluate edebilir, permanent pool'a promote edebilir veya underperformer'ı disable edebilir; physical promotion consequential'dır ve reporting'den ayrıdır. [Kanıt: `src/cli/commands/evolve.ts:48-73`; `src/orchestra/promotion-pipeline.ts:63-267`]

Feature manifest promotion'ı lightly used sınıflandırır. Current routing consumption ve settlement proof olmadan automatic learning'i fully closed production loop diye anlatmayın. [Kanıt: manifest `promotion-pipeline`; production-wiring rule]

## Dogfood / repository gerçeği

| Capability | State | Evidence |
|---|---|---|
| DB-first memory | ✅ canlı | 1.764-row real snapshot, FTS table/trigger, active CLI |
| Recall | ✅ canlı | real JSON query |
| Export/rebuild/backup | ✅ registered | help/source verified; mutation-run yok |
| Training trace | ✅ dogfood'da canlı | code+wired+enabled+recent proof |
| Promotion/demotion | ⚠️ kısmi | implementation var; manifest lightly-used |
| Closed outcome→routing→promotion loop | ⚠️ kısmi | birden çok organ var; end-to-end production closure certified değil |

Schema detayı [Database reference](../db.md) içindedir.
