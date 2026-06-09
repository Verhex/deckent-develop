# DIRECTIVES — Sprint 249: Mixed-Fleet Showcase (claude + codex + gemini + ollama) — DOC-1 + guards

## Goal: Real §14 progress across the FULL provider fleet, simultaneously. 15 independent, Tier-0, distinct-file tasks (mostly DOC-1 beta docs + 3 claude guard/test). Each provider runs its own real worker (OAuth/subscription). Demonstrates god-level mixed-fleet orchestration on genuine work. **All DOC/script/test, zero spawn-path risk, CI-safe.**

## Ortak kurallar
- Accuracy = code/exports gerçeğine uyum. Docs İngilizce (user-facing guide/cookbook). No tech debt. No anti-X bashing (factual comparison only). Tier-0 doc → test yok; script/test tasks → kendi doğrulamasını koşar. Her worker `.tasks/task-XXX.result` yazmalı. Sadece kendi `Files` dosyanı yaz, başka dosyaya dokunma.

---

## Task 1: 249-001 — benchmark/memory-v2 (verify the 96% claim)
- Provider: claude
- Model: opus
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/benchmark/memory-v2.md
- Scope: docs/benchmark/

### Description
Create `docs/benchmark/memory-v2.md`. Read `.brain/exports/summary.md` (~4K chars loaded vs full memory.db) and `src/core/memory-store.ts` / `memory-export.ts` to HONESTLY assess the "96% context reduction" claim (DB-first + generated exports vs loading everything). State the method, what is measured (export-size vs full-DB/legacy-md), the real numbers you can derive, and qualify the claim if it cannot be exactly reproduced. Do NOT inflate — if it's ~96% under stated assumptions, say so with the assumption; if not, give the honest figure.

**Kanıt:** `docs/benchmark/memory-v2.md` var · method + measured numbers + honest qualification of the 96% claim · başka dosya değişmedi. DONE.

**Test:** yok. **Smoke:** disk-verify — ben sayıları exports/koda karşı kontrol ederim.

---

## Task 2: 249-002 — lifecycle + API-surface diagrams
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/lifecycle-diagram.md
- Scope: docs/reference/

### Description
Create `docs/reference/lifecycle-diagram.md` with two accurate **mermaid** diagrams: (1) the 8-phase sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP) with the WAVE_BUILD note, and (2) the architecture layer map (cli→orchestra→core / agents / nervous / monitor / providers). Source of truth: `docs/reference/api-surface.md` + DECKENT.md. Add a one-line caption under each diagram.

**Kanıt:** dosya var · 2 ```` ```mermaid ```` bloğu · 8 faz doğru sırada · katman haritası · başka dosya değişmedi. DONE.

**Test:** yok. **Smoke:** disk-verify (mermaid syntax + faz sırası).

---

## Task 3: 249-003 — lint-cli-mcp-parity guard (report-only)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing
- Files: scripts/lint-cli-mcp-parity.mjs
- Scope: scripts/

### Description
Create `scripts/lint-cli-mcp-parity.mjs` (ESM, Node built-ins only, ADR-010). It lists CLI commands (scan `src/cli/commands/*.ts` register functions) vs MCP tools (scan `src/mcp/` tool registrations) and prints a parity report (commands without an MCP tool + MCP tools without a CLI). **Report-only: always `process.exit(0)`** — do NOT wire into the `lint` script / CI yet (note that wiring is a follow-up in a comment). Run it once to confirm it executes without throwing.

**Kanıt:** dosya var · `node scripts/lint-cli-mcp-parity.mjs` exit 0 + bir rapor basar · package.json/CI DEĞİŞMEDİ (wiring deferred, yorumda belirtilmiş). DONE.

**Test:** kendi koşusu (node ile çalıştır, exit 0). **Smoke:** disk-verify + ben node ile koşarım.

---

## Task 4: 249-004 — lint-i18n-hardcode guard (report-only)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing
- Files: scripts/lint-i18n-hardcode.mjs
- Scope: scripts/

### Description
Create `scripts/lint-i18n-hardcode.mjs` (ESM, Node built-ins only). It scans `src/cli/commands/*.ts` for likely hardcoded user-facing strings (e.g. `console.log("...")` / `process.stdout.write("...")` with natural-language literals not routed through `getMessage`) and prints a report with file:line. **Report-only: always `process.exit(0)`** — do NOT wire into CI yet (comment that wiring + allowlist tuning is a follow-up). Run once to confirm it executes.

**Kanıt:** dosya var · `node scripts/lint-i18n-hardcode.mjs` exit 0 + rapor basar · package.json/CI DEĞİŞMEDİ. DONE.

**Test:** kendi koşusu. **Smoke:** disk-verify + node koşusu.

---

## Task 5: 249-005 — provider-parity fleet regression test
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: testing-expert
- Files: tests/orchestra/provider-parity-fleet.test.ts
- Scope: tests/orchestra/

### Description
Create `tests/orchestra/provider-parity-fleet.test.ts` (vitest, hermetic). Assert the Sprint 248 parity contract: `isAdapterProvider` (from `src/orchestra/sprint-utils.js`) returns `true` for `'ollama'`, `'codex'`, `'gemini'` and `false` for `'claude'`. Also assert `modelRegistry.get('gpt-5')?.apiId === 'gpt-5.5'` (codex wire model). Keep it small (no spawning, pure unit). Run the test and confirm it passes.

**Kanıt:** dosya var · `npx vitest run tests/orchestra/provider-parity-fleet.test.ts` yeşil · başka dosya değişmedi. DONE.

**Test:** bu task'ın kendisi test; koş + geç. **Smoke:** ben vitest ile koşarım.

---

## Task 6: 249-006 — why-deckent comparison (factual)
- Provider: codex
- Model: gpt-5
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/comparison/why-deckent.md
- Scope: docs/comparison/

### Description
Create `docs/comparison/why-deckent.md`: a FACTUAL positioning doc — what Deckent is (multi-agent sprint orchestrator: Brain plans, Workers execute in scope, Auditor monitors; multi-provider; DB-first memory; ADR governance). Describe its distinctive capabilities (mixed-fleet multi-provider, evolutionary agent/skill pool, autonomous mode, MIT/no-gate) WITHOUT bashing or naming competitors negatively — "open source for open world", strengths-stated-positively. No invented benchmarks.

**Kanıt:** dosya var · Deckent capability'leri factual · rakip-kötüleme YOK · uydurma sayı YOK. DONE.

**Test:** yok. **Smoke:** disk-verify (factual + no-bashing).

---

## Task 7: 249-007 — cookbook: first sprint
- Provider: codex
- Model: gpt-5
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/01-first-sprint.md
- Scope: docs/cookbook/

### Description
Create `docs/cookbook/01-first-sprint.md`: a step-by-step recipe — `deckent init` → write DIRECTIVES → `deckent plan` → `deckent start` → `deckent status` → `deckent review` → `deckent retro`. Use real command names (verify against DECKENT.md workflow). Short, copy-pasteable, with a one-paragraph intro.

**Kanıt:** dosya var · init→…→retro adımları gerçek komut adlarıyla · başka dosya değişmedi. DONE.

**Test:** yok. **Smoke:** disk-verify (komut adları doğru).

---

## Task 8: 249-008 — cookbook: multi-provider fleet
- Provider: codex
- Model: gpt-5
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/02-multi-provider-fleet.md
- Scope: docs/cookbook/

### Description
Create `docs/cookbook/02-multi-provider-fleet.md`: how to run a mixed-fleet sprint — per-task `- Provider:` / `- Model:` overrides in DIRECTIVES (claude/codex/gemini/ollama), subscription/OAuth (no API key needed for claude/codex/gemini CLIs; ollama local). Note `plan --structured` honors overrides. Show a 3-task DIRECTIVES snippet with three providers. (This recipe documents the very feature this sprint dogfoods.)

**Kanıt:** dosya var · per-task Provider/Model override örneği · 3-provider snippet · subscription notu. DONE.

**Test:** yok. **Smoke:** disk-verify (override sözdizimi DIRECTIVES formatına uygun).

---

## Task 9: 249-009 — architecture overview (EN)
- Provider: codex
- Model: gpt-5
- Effort: normal
- Agent: architect
- Skills: system-architect
- Files: docs/guide/architecture-overview.md
- Scope: docs/guide/

### Description
Create `docs/guide/architecture-overview.md`: an EN overview of Deckent's architecture — orchestra/ (sprint lifecycle, planning, routing), core/ (types, config, agent/skill pools, model-registry, memory), agents/ (worker execution), nervous/ (proactive meta-orchestrator), monitor/, providers/, cli/, mcp/, dashboard/. One short paragraph per layer + the one-way dependency rule (ADR-008: Brain is the only orchestrator importing tmux/auditor/worker). Source: CLAUDE.md Architecture section + api-surface.md.

**Kanıt:** dosya var · tüm ana katmanlar · ADR-008 tek-yönlü bağımlılık notu. DONE.

**Test:** yok. **Smoke:** disk-verify (katman isimleri koda uyumlu).

---

## Task 10: 249-010 — cookbook: memory recall
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/03-memory-recall.md
- Scope: docs/cookbook/

### Description
Create `docs/cookbook/03-memory-recall.md`: a recipe for project memory — `deckent recall "<query>"`, `deckent remember "<note>"`, `deckent memory rebuild|export|stats`. Note Memory V2 is DB-first (SQLite FTS5) with generated .md exports. Short + copy-pasteable.

**Kanıt:** dosya var · recall/remember/memory komutları · DB-first notu. DONE.

**Test:** yok. **Smoke:** disk-verify (komut adları doğru).

---

## Task 11: 249-011 — cookbook: autonomous mode
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/04-autonomous-mode.md
- Scope: docs/cookbook/

### Description
Create `docs/cookbook/04-autonomous-mode.md`: a high-level recipe for autonomous mode — the engine continuously runs a backlog (recurring + one-off + reactive) under approval/policy/risk gates. Describe enabling it and that risk-tagged operations park for approval. Keep it conceptual + short (do not invent flag names you cannot confirm; describe the concept and point to `deckent help`).

**Kanıt:** dosya var · autonomous kavramı + approval/risk-gate notu · uydurma flag YOK. DONE.

**Test:** yok. **Smoke:** disk-verify.

---

## Task 12: 249-012 — getting-started (EN)
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/getting-started-en.md
- Scope: docs/guide/

### Description
Create `docs/guide/getting-started-en.md`: an EN getting-started — what Deckent is (one paragraph), install/prereqs (Node >=24, a provider CLI logged in OR ollama local), `deckent init`, first sprint pointer (link to cookbook/01), and where memory/ADRs live. Friendly, concise, accurate.

**Kanıt:** dosya var · ne-olduğu + prereq + init + first-sprint pointer. DONE.

**Test:** yok. **Smoke:** disk-verify (prereq/komutlar doğru).

---

## Task 13: 249-013 — feature matrix
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/feature-matrix.md
- Scope: docs/guide/

### Description
Create `docs/guide/feature-matrix.md`: a markdown table of major Deckent capabilities across surfaces (CLI / MCP / Dashboard) — e.g. plan, start, status, review, retro, memory recall, agent/skill list, autonomous, nervous. Mark availability per surface (✅/—). Base it on DECKENT.md (CLI commands + 32 MCP tools + dashboard pages). Do not overstate — if unsure, leave the cell blank with a note.

**Kanıt:** dosya var · CLI/MCP/Dashboard sütunlu yetenek tablosu · overstate YOK. DONE.

**Test:** yok. **Smoke:** disk-verify (DECKENT.md ile tutarlı).

---

## Task 14: 249-014 — glossary (ollama, small)
- Provider: ollama
- Model: qwen3.6:27b
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/glossary.md
- Scope: docs/

### Description
Create `docs/glossary.md`: a SHORT glossary (one line each) of ~10 core Deckent terms: Brain, Worker, Auditor, Sprint, DIRECTIVES, Scope, Heartbeat, Tier, Provider, ADR. Keep each definition to a single concise sentence. Small, single-file, low-stakes.

**Kanıt:** dosya var · ~10 terim, her biri 1 satır tanım. DONE.

**Test:** yok. **Smoke:** disk-verify (terimler doğru).

---

## Task 15: 249-015 — cookbook: status & watch (ollama, small)
- Provider: ollama
- Model: qwen3.6:27b
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/05-status-and-watch.md
- Scope: docs/cookbook/

### Description
Create `docs/cookbook/05-status-and-watch.md`: a SHORT recipe — `deckent status` (live progress), `deckent status --watch` (live), `deckent status --json` (raw). 4–8 lines total. Small, single-file, low-stakes.

**Kanıt:** dosya var · status/watch/json kısa recipe. DONE.

**Test:** yok. **Smoke:** disk-verify.

---

**Beklenen:** 15 task, 4 provider eşzamanlı (claude 5 / codex 4 / gemini 4 / ollama 2). Disk-verify ground truth: 15 distinct dosya gerçek içerikle + her `.result` doğru provider/model alanı. claude script/test'leri koşar-geçer; ollama küçük-scope (NO_GO olursa bilinen sınır, force-recover YOK). Gate-kanıtlı parity üzerine ilk büyük mixed-fleet dogfood.

İlgili: F1-P (parity) · F1-009r (live-keys mixed sprint) · DOC-1 · PARITY-1 · AS3-1 · ADR-066 · [[sprint_248_provider_parity]].
