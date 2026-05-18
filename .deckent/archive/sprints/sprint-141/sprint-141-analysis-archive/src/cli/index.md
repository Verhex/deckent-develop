# Analysis: src/cli/index.ts
**Task ID:** 141-003 | **LoC:** 105

## 1. Amacı
CLI program builder. 40+ komutları register eder ve program döner.

## 2. Public API
- `buildProgram(): Command`

## 3. Kayıtlı Komutlar (42 komut)
init, start, plan, status, attach, spawn, kill, retro, cleanup, doctor, config, history, plugin, upgrade, onboard, analyze, archive-debt, dashboard, serve, web, sync, watch, run, test-run, agent, skill, review, finalize, explain, set-directives, heartbeat, checkpoint, docs, output, cost, **recall, remember, memory** (Memory V2 yeni komutlar)

## 4. Memory V2 Uyumu
✅ recall, remember, memory komutları register edilmiş (satır 39-41, 99-101)

## 5. ADR Compliance
✅ ADR-012: register<Name>(program) Pattern — tüm komutlar bu pattern'i izliyor

## 13. Verdict: ANALYZED
