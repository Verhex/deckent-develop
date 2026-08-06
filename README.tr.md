# Deckent

**Goal'leri governed ve evidence-backed work'e dönüştüren provider-neutral, local-first Agent OS.**

Deckent; Assistant, parallel Worker'lar ve Platform control plane'i tek authority chain çevresinde birleştirir: `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`. Terminal ve Desktop primary operator surface'lerdir; CLI, MCP, API, process/autonomous girişleri ve connectors adapter'dır; Dashboard bir observability projection'dır. [Kanıt: `.deckent/workspace/IDENTITY.md:2-10,16-17`]

[English documentation](docs/en/overview.md) · [Türkçe dokümantasyon](docs/tr/overview.md) · [Güncel gerçeklik farkları](docs/analysis/CODE-DOC-DIFF-2026-08.md)

## Neden var?

Kullanışlı bir agent runtime yalnız code üretmemelidir. Deckent provider ve model policy'yi çözer, dependency-aware work'ü ayrıştırır, write scope'u sınırlar, Attempt ve Operation'ları kaydeder, sonuçları değerlendirir, evidence settlement yapar, memory tutar ve recovery yolları sunar. Bu sorumluluklar güncel orchestration, configuration, memory, authority ve RunFlow modüllerinde görülebilir. [Kanıt: `src/orchestra/sprint-controller.ts`; `src/orchestra/dependency-scheduler.ts`; `src/core/config.ts`; `src/core/memory-store.ts`; `src/core/run-flow-store.ts`; `src/core/task-settlement-authority.ts`]

Ürün aynı anda iki kitle için tasarlanır: düşük sürtünmeyle control isteyen solo kullanıcı ve multi-project, multi-tenant, cross-platform policy/audit isteyen kurumlar. macOS, Linux, Windows native ve WSL2 üzerinde çalışmalı; bir capability yoksa açıkça fail etmelidir. [Kanıt: `AGENTS.md:13-35`; `.deckent/workspace/IDENTITY.md:6,15`]

## Installation contract

npm package; `deckent` ve `deckent-mcp` binary'lerini sunar, Node.js `>=24.0.0` ister ve compiled `dist` ağacını yayımlar. [Kanıt: `package.json:2-20,115-123`]

Published-package installation için bildirilen komut `npm install -g deckent`'tir. Bu documentation audit network ve global state mutation yapan bu komutu **çalıştırmadı**; registry installation publish pipeline doğrulayana kadar `HOLD`'dur. Repository build komutu `npm run build:all`, bu yeniden-yazımdan hemen önce owner tarafından çalıştırıldı. [Kanıt: `package.json:22-38`; owner run bildirimi, 2026-08-01; `docs/analysis/OPEN-QUESTIONS-2026-08.md`]

## Doğrulanmış beş dakikalık orientation

Aşağıdaki dört komut 2026-08-01'de güncel compiled binary üzerinde gerçekten çalıştırıldı. Hepsi read-only'dir: binary identity'yi, readiness'i, onboarding preview'ını ve mevcut run authority'yi okur.

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js onboard --plan-only --json
node dist/cli/entry.js status --json
```

Gözlenen checkpoints:

- Version; `1.0.0-beta.1`, Node `v24.15.0`, Linux bildirdi; exit 0.
- Doctor `ok: true` döndürdü; honest summary bu workspace'te 15 ready ve required olmayan 2 missing check bildirdi; exit 0.
- Onboarding; `applied: false` olan project-scoped, balanced config plan döndürdü; logged-in Claude ve Codex session'larını tespit etti ve planı yazmadı; exit 0.
- Status; `active: false`, `lifecycle: IDLE` ve exact current-run task set dışındaki dört unresolved interval için dürüst provider-observation `HOLD` döndürdü; exit 0.

[Kanıt: dört komutun real-binary output'u, 2026-08-01; read-only contract'lar `src/cli/commands/doctor.ts:2190-2245`, `src/cli/commands/onboard.ts:301-316,502-546`, `src/cli/commands/status.ts:725-781,1024-1040`]

Gerçek work başlatma burada doğrulanmış gibi sunulmaz. Audit'in sprint/run/autonomous execution komutu çalıştırması açıkça yasaklandı. Bu yüzden exact execution proof uydurulmadı; typed `HOLD` olarak kaydedildi. [Kanıt: owner boundary; `docs/analysis/OPEN-QUESTIONS-2026-08.md` OQ-20]

## Bir workflow seçin

| İhtiyaç | Surface | Güncel user contract | Repository gerçeği |
|---|---|---|---|
| Conversational control | Argümansız `deckent` veya `deckent chat --native` | Interactive agentic REPL | Argümansız çağrı native chat'e yönlenir; interactive TTY, Ink REPL kullanır. [Kanıt: `src/cli/entry.ts:51-107,157-171,664-713`] |
| Goal preview / governed start | `deckent do <goal>` | Varsayılan preview; RunFlow v2 açıkken `--run --yes` explicit non-interactive start yoludur | Proposal compilation gerçek provider call'dır; RunFlow yolu başlamadan da proposal persist edebilir, bu nedenle audit'te çalıştırılmadı. [Kanıt: `src/cli/commands/do.ts:132-179,219-357,440-517`] |
| Structured lifecycle | `plan`, `start`, `status`, `review`, `retro` | Planlama, execution, observation, adjudication, learning | Tüm command/help contract'ları canlı; state-changing path'ler bu audit'te yalnız help ile doğrulandı. [Kanıt: `src/cli/commands/plan.ts:121-205`; `src/cli/commands/start.ts:329-345`; `src/cli/commands/status.ts:1024-1040`; `src/cli/commands/review.ts:184-224`; `src/cli/commands/retro.ts:334-342`] |
| One-shot work | `run <description>` | Sprint cycle olmadan tek task yürütür | Aynı `run` parent lifecycle alias'larını da taşır; bu belgelenmiş bir CLI ambiguity'dir. [Kanıt: `src/cli/commands/run.ts:451-476,920-939`] |
| Durable process work | `process submit/status/result` | Bir `ExecutionRequest` submit eder; side effect approval için park edebilir | CLI surface kayıtlıdır ve process service'lere gider. [Kanıt: `src/cli/commands/process.ts:142-190`] |
| Continuous work | `autonomous …` | Durable backlog, approvals, status ve loop control | Manifest runtime'ı active ama default-off işaretler; MCP parity eksiği ve attach-only reactive bridge kaydeder. [Kanıt: `.deckent/settings/features-manifest.json`; `src/cli/commands/autonomous.ts:1710-1946`] |
| Remote/programmatic control | HTTP/SSE ve MCP | API server ve 49 MCP tool / 8 resource | 49 tool kayıtlıdır; CLI/MCP parity gate hâlâ baseline ile 37 CLI-only ve 1 MCP-only gap kabul eder. [Kanıt: `src/mcp/tools/index.ts:68-125`; `src/mcp/server.ts`; `npm run lint:parity`, 2026-08-01] |

## Product capabilities

- Deterministic, evaluation-backed lifecycle orchestration, dependency scheduling, FIX retry'ları, checkpoints, retrospectives ve rollback policy. [Kanıt: `src/orchestra/sprint-phases.ts`; `src/orchestra/dependency-scheduler.ts`; `src/orchestra/sprint-checkpoint.ts`; `src/orchestra/rollback.ts`]
- Hard-coded product provider yerine effective config, model registry, live authority, reachability, limits ve budget'tan provider-neutral routing. [Kanıt: `.deckent/workspace/IDENTITY.md:10`; `src/core/config.ts`; `src/core/model-registry.ts`; `src/core/routing/route-task-v3.ts`]
- SQLite/FTS5 tabanlı DB-first memory; relation/history, document freshness, KPI store'ları, recall ve export/backup operation'ları. [Kanıt: `src/core/memory-store.ts:100-338`; `src/core/memory-query.ts`; `src/cli/commands/memory.ts`; `src/cli/commands/recall.ts:11-20`]
- Runtime-wide approval, authority, audit, scope ve immutable settlement contract'ları. [Kanıt: `src/core/approval-broker.ts`; `src/orchestra/authority-enforcer.ts`; `src/core/task-settlement-authority.ts`; `src/core/invocation-receipt-store.ts:705-850`]
- Native REPL, terminal dashboard, web/API server, Desktop, VS Code extension, connectors, CLI ve MCP surface'leri. [Kanıt: `src/cli/entry.ts:664-713`; `src/cli/commands/dashboard.ts:147-214`; `src/cli/commands/serve.ts:72-80`; `src/desktop`; `src/extensions/vscode`; `src/connectors`; `src/mcp`]
- 211 visible CLI command path, 49 canonical MCP tool, 8 resource ve 31 built-in skill sayım veya projection ile doğrulandı. Identity projection ayrıca “21 built-in + 2 custom” agent bildirirken güncel project ve built-in prompt ağaçlarının her biri 21 persona içeriyor; exact ek-iki mapping OQ-21'de `HOLD` kalır. [Kanıt: recursive `buildProgram()` ve `TOOL_CATALOG` introspection ile filesystem sayımları, 2026-08-01; `.deckent/workspace/IDENTITY.md:19-29`; `docs/analysis/OPEN-QUESTIONS-2026-08.md`]

## Güncel repository gerçeği

Detaylı dokümanlardaki status label'ları:

- `✅ canlı`: source wiring vardır ve güncel runtime evidence iddiayı destekler.
- `⚠️ kısmi`: code vardır; flag, eksik proof, parity gap veya production closure iddiayı sınırlar.
- `🔜 roadmap`: design/history vardır fakat current production closure yoktur.

Feature manifest şu anda 21 active, 4 lightly used, 9 dormant ve 1 dead entry listeler. Canlı `truth --json` check beş truth contract bildirdi: training trace code/wired/enabled/proven; tool surface, worker approval gate ve routing journal runtime proof'suz; prompt-gate-block detected callsite olmadan tek half-wire candidate. [Kanıt: `.deckent/settings/features-manifest.json`; real `node dist/cli/entry.js features --json` ve `truth --json` output'ları, 2026-08-01]

Son dogfood handoff unattended production reliability'yi certify etmez: Codex audit 0/31 intervention-free run kaydeder ve sıralı certification ladder isteyen settlement/gate contradiction'ları belgeler. Bunlar product language arkasına saklanmaz; [Güncel sürtünmeler](docs/tr/operations/current-frictions.md) ve [fark raporuna](docs/analysis/CODE-DOC-DIFF-2026-08.md) bakın. [Kanıt: `docs/MASTER-PLAN.md` — RECOVERY-BORN-488 ailesi, RECOVERY-BORN-490-REPLAY-CERTIFICATION-001 ve CODEX-MAIN-001 karar satırı]

## Dokümantasyon haritası

- [Başlangıç](docs/tr/guide/getting-started.md)
- [Run lifecycle](docs/tr/guide/run-lifecycle.md)
- [Execution modes](docs/tr/guide/execution-modes.md)
- [Interactive surfaces](docs/tr/guide/interactive-surfaces.md)
- [Feature catalog](docs/tr/features/catalog.md)
- [CLI reference](docs/tr/cli.md)
- [MCP reference](docs/tr/mcp.md)
- [Database reference](docs/tr/db.md)
- [Configuration](docs/tr/configuration.md)
- [Tam çift-dilli dokümantasyon index'i](docs/index.md)
- [Code–documentation fark raporu](docs/analysis/CODE-DOC-DIFF-2026-08.md)

## Constitutional constraints

Deckent'in üç Immutable Law'u Dual Lens + Scale, Every Environment ve Never MVP'dir. Tam governance yorumu [Immutable Laws](docs/tr/governance/immutable-laws.md) içinde belgelenir. [Kanıt: `AGENTS.md:9-35`]

License: MIT. [Kanıt: `package.json:90-91`; `LICENSE`]

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-34143%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-492%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

<!-- AUTOGEN:START id="stat-counts" -->
- **49 MCP tools** + **8 MCP resources**
- **21 built-in agents**
- **30 built-in skills**
- **20 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
