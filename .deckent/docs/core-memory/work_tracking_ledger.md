---
name: work_tracking_ledger
description: "İş-takip SSOT pointer — kanonik canlı-defter = docs/MASTER-PLAN.md §10 (Sequencing) + §10A. Bu dosya = Claude-memory aynası: son sprint highlight + hâlâ-açık follow-up. Tam sprint kayıtları .brain/memory.db'de (sprint/retro)."
metadata:
  node_type: memory
  type: project
  originSessionId: consolidated-2026-06-18
---

> **SSOT = `docs/MASTER-PLAN.md` §10 (Sequencing) + §10A.** İş ekle/çıkar/güncelle ORADA yapılır ([[feedback_masterplan_living_ledger]]). Bu dosya ince aynadır. Tam sprint kayıtları `.brain/memory.db` (type=sprint/retro). Bu memory, 2026-06-18'de 11 ayrı sprint-memory'nin (sprint 238-261 + overnight_loop) **kayıpsız konsolidasyonudur**.

## Son sprint highlights (238 → 261)
- **EK 2026-06-23/24 (gece — autonomous çok-sprint dogfood):** sprint-319 (12 task, opus, $0) **scope-collision nervous-gate sonsuz re-notify loop**unda takıldı (otonom-loop-killer); işi sağlıklı+kurtarıldı (**9 DONE `025e941c`, tsc=0, 0 yeni-regresyon** + 2 doğru honest-NO_GO + 1 collision-blocked). Loop-killer bug **✅ ÇÖZÜLDÜ** (B-COLLISION-HANG 6 fix `e40e1bdf` + executor-always-live `fa18603d`). Detay+follow-up: MASTER-PLAN §10 "EK 2026-06-23/24". (Kaynak: silinen `.deckent/OVERNIGHT-REPORT.md`.)
- **EK 2026-06-18 (el-kodlama, TDD) — Doc-Tracking Faz 1+2 + Flaky-Stab → main (temiz-ff):** ADR-090 doc-tracking (DCR `doc_rank` + gövde-hash + multi-signal stale + `deckent docs track` CLI + code-drift + `--check` CI-gate + sprint-finalize hook + MCP `deckent_docs track-*` + `GET /api/docs/health` + dashboard "Docs Health"); Tier-1 proof (serve 200/401, 832 doc). Flaky-stab: heartbeat mtime-backdate + finalize 45s-timeout + docker `DECKENT_DOCKER_E2E` opt-in. CLAUDE.md binding-rules promote edildi. **push BEKLEMEDE** (main origin'den ~24 ileri); `/mcp restart` Alperen (build:all yapıldı). Diğer-session 47 uncommitted dosyası her merge'de korundu.
- **238–242 (WM zinciri):** canonical work-model SSOT (`src/core/work-model.ts`) → rubric/router/adr consumer → provider-free MCP-run + EffectClass→autonomous policy-gate wire. Hepsi DONE+disk-verified. Brain-integrity INT-1 kanıtlandı (memory.db büyüdü, wipe yok).
- **248 (provider parity):** codex/gemini gerçek host-adapter worker route (isAdapterProvider). DONE.
- **249 (mixed-fleet forensics):** ilk 4-provider/15-task dogfood; orkestrasyon çalıştı, eval/routing misfire; MF-1..3 fixed.
- **252 (provider-aware spawn):** ProviderCommandSpec + per-provider OAuth mount; codex/gemini docker'da canlı. DONE.
- **254 (followup):** lazy adapter re-bootstrap + billing-follows-auth (F1-CB ✅ subscription/local=$0) + claude `--effort` wire (canlı). DONE.
- **261 (contract-enforced):** ExecutionRequest contract-aware→enforced (16 task: policy/RBAC-bridge/audit-hmac/strict-tenant/recurring-backlog/ExecutionPool). DONE, 419 test.

## Açık follow-up'lar (MASTER-PLAN §10'a da işlenmeli)
- **Sprint 319 (gece 06-23/24, collision-hang ÇÖZÜLDÜ sonrası kalan 2 P1):** (1) 9 DONE task'ın **per-task faithful-test authenticity audit'i** (`025e941c`, suite-green ama testlerin gerçekliği denetlenmedi); (2) **007/008/010'u CC-el-kodla** (evalResult-dedup riskli-LIVE+sync · alert-dedup sahte-SSOT · waitForResults-KES collision-blocked). Henüz commit YOK.
- **Sprint 261 artığı:** live spawn-path RBAC/policy wire · nervous tick consolidation · cron-module yerleşimi · capability-broker bind.
- **Mixed-fleet (249/252):** MF-4..MF-9 · gemini docker shell-escaping · host buildArgs unification · F1-IMG/PSL-6.
- **Provider tech-debt (248):** F1-PD/F1-AD — apiId/model hardcode → otonom subscription-model detection.
- **Effort/model (254):** config-default model-effort · gemini 429/login-hang · WM-1b routing affinity.
- **WM cleanup (238):** duplicate-enum kaldırma (additive-safe).

> **Kullanım:** Yeni sprint bitince → buraya 1 satır highlight ekle, kapanan follow-up'ı çıkar, kalıcı ders/açık-iş MASTER-PLAN §10'a yaz. Tek iş-takip memory'si budur.
