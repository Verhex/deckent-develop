# Open items — freeze baseline

Code references are navigation points, not fresh runtime proof. No automatic MASTER admission or closure.

| ID | Class | Source | Finding | Round |
|---|---|---|---|---|
| DRAIN-RESUME | BLOCKS_CURRENT_DONE | src/orchestra/sprint-controller.ts:3930 | Drain/disposition/resume-execute yok; canlı pending exact task EVALUATE E077 yoluna girebilir. | R42-R44 |
| TERM-ONLY | BLOCKS_CURRENT_DONE | src/orchestra/spawn-backend-docker.ts:5264 | Exact runner TERM-only; yeni SIGKILL owner tarafından kapsam dışı; sonlu provider retirement garantisi yok. | R43 |
| IPC-MUTATED | RELATED_BUT_NONBLOCKING | src/orchestra/spawn-backend-docker.ts:14594 | Inventory mutation transient sınıflandırması eksik; capture-cache poisoning riski. | R39/R43 |
| LANDING-WINDOW | RELATED_BUT_NONBLOCKING | src/orchestra/execution-effect-landing-coordinator.ts:1 | Acceptance/landing toplam wall-clock penceresi kanıtlanmadı. | R43 |
| E077-LEASE | RELATED_BUT_NONBLOCKING | src/orchestra/sprint-controller.ts:3930 | EVALUATE E077 sonrası lock/leadership retirement kanıtı yok. | R42 |
| COLD-EXIT | RELATED_BUT_NONBLOCKING | src/orchestra/spawn-backend-docker.ts:23998 | Coordinator ölümü sonrası provider exit cold-capture kanıtı yok. | R43 |
| QUERYLESS | RELATED_BUT_NONBLOCKING | src/cli/commands/recover.ts:1 | Querysiz HOLD operator recovery zinciri açık. | R38 |
| HEARTBEAT | RELATED_BUT_NONBLOCKING | src/orchestra/spawn-backend-docker.ts:23915 | Exact start/exit heartbeat tazelik kanıtı değildir; fresh daemon observation gerekir. | R43 |
| RAW-TIMER | RELATED_BUT_NONBLOCKING | src/orchestra/exact-docker-workspace-command.ts:55 | Raw timer-before-close davranışı sürer; seçilen production işlemleri thread izolasyonuyla korunur. | R31/R42 |
| SYNC-CUSTODY | RELATED_BUT_NONBLOCKING | src/core/task-attempt-custody-store.ts:6011 | Senkron custody I/O ana thread maliyeti açık; transport izolasyonu tüm native işi taşımaz. | R31 |
| HB-EXEC | RELATED_BUT_NONBLOCKING | src/monitor/heartbeat-daemon.ts:1 | Heartbeat execSync task başı maliyeti refaktör girdisi; bu pakette tekrar ölçülmedi. | R43 |
| REPLAY-PROOF | BLOCKS_CURRENT_DONE | src/orchestra/spawn-backend-docker.ts:17268 | Current-progress, missing outcome ve replay race gerçek birleşik kanıtı eksik. | R34-R38 |
| ABC-LIVE | BLOCKS_CURRENT_DONE | tests/orchestra/exact-held-containment-barrier.test.ts:1 | Gerçek A-C/B restart ve operator recovery kanıtı yok; fixture bunun yerine geçmez. | R41 |
| POLICY-GATE | BLOCKS_CURRENT_DONE | AGENTS.md:14 | K0 host parity, canonical decision anchor ve capsule alan gate kırmızıları; landing engeli. | R45 |
| LINT-PARITY | BLOCKS_CURRENT_DONE | src/mcp/tools/description-catalog.ts:1 | CLI/MCP description bindings lint kırmızı; bu paket düzeltme yetkisi vermiyor. | R45 |
| LAYER-D004-REBASE-20260915 | RELATED_BUT_NONBLOCKING | .deckent/settings/layer-shims.json | ADR-D-004 baseline re-anchored at refactor cutover; 19 findings retained in delta evidence, layering debt remains for refactor | R45-B |
| HERMETIC-GATE-STACK | BLOCKS_CURRENT_DONE | scripts/lint-test-hermeticity.mjs | Full lint stops with Maximum call stack size exceeded after graph traversal; outside R45-B repair scope | R45-B |
