# DIRECTIVES — Sprint: Multi-Provider Doc Dogfood (WM-1 / WM-7 user docs)

## Goal: Dogfood deckent's multi-provider fleet on 3 self-contained, god-level documentation tasks — one per provider (claude / codex / gemini) — that document the just-shipped WM-1 (ExecutionRequest unification) + WM-7 (stack-aware criteria/routing) + the agentic-OS + agentic-run-ecosystem positioning, for end users. **DOC-ONLY, Tier-0, zero-risk** (WM-7 doc-kind criteria → disk-verify only, NO test suite, NO tsc gate). i18n-clean prose (English docs).

## Ortak kurallar
- Doc-only → NO test suite, NO build. Disk-verify: file exists + required sections. Her worker `.tasks/task-XXX.result` yazmalı (selfAssessment DONE).
- Mevcut doc stiline uy (docs/reference, docs/vision). Hardcode örnek-değer yok; gerçek API yüzeyinden yaz.

---

## Task 1: DOC-1 — ExecutionRequest contract reference (WM-1)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/execution-request.md
- Scope: docs/reference/

### Description
Create `docs/reference/execution-request.md` documenting the canonical `ExecutionRequest` contract (`src/core/work-model.ts`) and the WM-1 single-task unification. Cover: the contract fields (core: description/kind/environment/requirements/scope/provider/model/goNogo; envelope: capabilityTarget/modelEffort/mode/actor/origin/correlationId/causationId/budget — note each is optional + consumed incrementally per feature); how `buildExecutionRequest` + `resolveToTask` (`src/orchestra/execution-request-builder.ts`) unify the 3 paths (`deckent run` / `deckent_run` MCP / autonomous); that `task.type` (TaskKind) is now set on every single-task run; and `resolveRiskClass()` deriving governance risk. Keep it a precise reference (tables + short examples), enterprise-grade.

**Kanıt:** `test -f docs/reference/execution-request.md && grep -c "ExecutionRequest" docs/reference/execution-request.md` → dosya var, contract belgelendi. **Test:** yok (doc-only).

---

## Task 2: DOC-2 — Stack-aware criteria & routing (WM-7)
- Provider: gemini
- Model: gemini-2.5-pro
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/stack-aware-routing.md
- Scope: docs/reference/

### Description
Create `docs/reference/stack-aware-routing.md` documenting WM-7: how deckent derives GO/NO-GO criteria + the coverage gate + skill/agent routing from the task kind × the detected project stack (`TechStackKind`). Cover: doc/audit tasks aren't judged by a build; code tasks get the detected stack's commands (Go→`go test ./...`, never `tsc`); the coverage gate exempts non-JS/TS code (measurement gap, not failure); the parametric `code-expert` skill (per-stack idioms + commands); stack-specialized prime agents (`temp-go-specialist` etc.); and the language-mismatch routing penalty (typescript-expert is never routed on a Go project) with `- Skills:`/`- Agent:` overrides bypassing it. User-facing, with a "works on any stack" framing.

**Kanıt:** `test -f docs/reference/stack-aware-routing.md && grep -ci "stack" docs/reference/stack-aware-routing.md` → dosya var. **Test:** yok (doc-only).

---

## Task 3: DOC-3 — Positioning: agentic-OS + agentic-run ecosystem
- Provider: codex
- Model: gpt-5
- Backend: docker
- ModelEffort: high
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/vision/agentic-run-ecosystem.md
- Scope: docs/vision/

### Description
Create `docs/vision/agentic-run-ecosystem.md` capturing the positioning: deckent is an **agentic-OS + agentic-run ecosystem** — install it, run it, ready+orchestrated, integrates everywhere, takes/gives data, understands structure, learns, and uses the models correctly. Map this to the Trinity (AI Assistant / AI System Worker / Developer Platform) × audience (end-user / developer / enterprise) matrix and the 6 everyone-everywhere scenarios. Reference how WM-1 (ExecutionRequest), WM-7 (stack-aware), and the multi-provider fleet realize it. Vision-doc tone, no marketing fluff — concrete capability mapping.

**Kanıt:** `test -f docs/vision/agentic-run-ecosystem.md && grep -ci "ecosystem" docs/vision/agentic-run-ecosystem.md` → dosya var. **Test:** yok (doc-only).

---

**Beklenen:** 3/3 DONE, 3 dosya disk'te, 3 provider (claude/codex/gemini) gerçekten koştu. Disk-verify: dosya + section + .result DONE. Mixed-fleet doc-dogfood — multi-provider değer gösterimi (WM-7 doc-kind criteria → tsc/test ZORUNLU DEĞİL).
