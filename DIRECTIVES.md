# DIRECTIVES — Sprint 242: Provider-Free Safe Fixes (WM-5-safe)

## Goal: WM-5 provider-free hard-enforce'un **iki düşük-risk parçası** (docker-spawn-path'e DOKUNMAZ → gece-güvenli): (a) MCP `deckent_run` `provider:'claude'` **hardcode'unu kaldır** → task'ın gerçek provider'ını onurla; (b) autonomous `task-mode-runner` **always-generic** worker'ı düzelt → CLI `run`'ın yaptığı gibi agent/skill resolve+inject et. **YÜKSEK-risk parçalar (CLAUDE_AUTH_REQUIRED guard + claudeArgs non-claude, spawn-backend-docker) bu sprint'te YOK** — gündüz-reviewed (deckent'in kendi docker-spawn'ı = gece-loop'un can damarı).

## Ortak kurallar
- **Backward-safe:** agent/skill resolution additive (resolve başarısız→generic fallback korunur); MCP-run provider artık task'tan gelir (claude default kalabilir ama hardcode değil — task.provider öncelikli). **i18n** muaf. **ESM `.js`.** No tech debt. ADR-066 (provider independence) realize.
- **.result kontratı** api-surface.md. Tier-0/internal → unit-test yeterli (MCP-run + autonomous flag-gated, ana sprint-path'e dokunmaz → orchestration-smoke gerekmez, ben tsc+test+build doğrularım).

---

## Task 1: 242-001 — MCP-run provider-free + autonomous agent/skill inject
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, api-builder, testing-expert
- Files: src/mcp/tools/run.ts, src/orchestra/task-mode-runner.ts, tests/mcp/run-provider-free.test.ts, tests/orchestra/task-mode-agent-inject.test.ts
- Scope: src/mcp/, src/orchestra/, tests/mcp/, tests/orchestra/

### Description
Önce oku: `src/mcp/tools/run.ts` (mevcut `provider:'claude'` hardcode, ~satır 63), `src/cli/commands/run.ts` (referans: `resolveAgentPrompt`/`resolveSkillPrompts`/`buildWorkerPrompt`/`spawnWorkerMultiProvider` deseni), `src/orchestra/task-mode-runner.ts` (mevcut generic `buildWorkerPrompt(task)`, ~satır 104-106).

**Fix A — MCP run provider-free:** `src/mcp/tools/run.ts`'te `provider:'claude'` hardcode'unu kaldır → task'ın provider'ını input/task'tan al (verilmezse config-default; ASLA literal 'claude' zorla). Mümkünse CLI-run gibi `spawnWorkerMultiProvider`/provider-resolution yoluna hizala (isAdapterProvider routing korunur). Minimum-diff.

**Fix B — autonomous agent/skill inject:** `src/orchestra/task-mode-runner.ts`'te generic `buildWorkerPrompt(task)` yerine CLI-run deseni: `resolveAgentPrompt(root, task)` + `resolveSkillPrompts(root, task)` → `buildWorkerPrompt(task, agentPrompt, skillPrompts)`. Resolve başarısız/boş→generic fallback (backward-safe). Autonomous task'lar artık domain-expertise + skill taşır (sprint task'larıyla parity).

**Kanıt:** `grep -c "provider:\s*'claude'" src/mcp/tools/run.ts` → 0 (hardcode gitti) · `grep "resolveAgentPrompt\|resolveSkillPrompts" src/orchestra/task-mode-runner.ts` → eklendi · `npx tsc --noEmit` temiz.

**Test (≥6):** `tests/mcp/run-provider-free.test.ts` — MCP-run task.provider'ı onurlar, literal-claude zorlamaz (2+); `tests/orchestra/task-mode-agent-inject.test.ts` — task-mode worker prompt'una agent/skill enjekte edilir, resolve-fail→generic fallback (3+); hermetik. Yeni testler yeşil + **mevcut mcp-run / task-mode testleri BOZULMAZ**.

**Smoke:** yok (MCP-run + autonomous flag-gated; ana CLI-start spawn-path etkilenmez). Ben tsc+test+build doğrularım.

---

**Beklenen:** 1/1 DONE. MCP-run artık provider-free; autonomous task'lar agent/skill taşır. Disk-verify: hardcode-0 + inject-var + fallback + tsc temiz + yeni test + mevcut testler yeşil + memory wipe-check. **docker-spawn-path (spawn-backend-docker) DOKUNULMADI** (gündüz-reviewed).

İlgili ADR: ADR-066 (provider independence) · ADR-027 (spawn backend) · ADR-041 (agent taxonomy). Memory: [[project_merged_product_flow_analysis]] (MCP-run hardcode + autonomous=generic bulguları) · [[sprint_241_effectclass_wire]] · [[feedback_trust_brain_eval_not_worker]].
</content>
