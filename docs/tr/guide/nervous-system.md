# Nervous System

## Product-user perspektifi

Nervous System proactive observer/detector/proposal/action subsystem'dır. Runtime ve repository signal'larını izler, finding'leri gruplar ve human-governed suggestion sunar. Locked action'lar üzerinde kendine authority vermez. [Kanıt: `src/nervous/observer.ts:1-49,84-180`; `src/nervous/executor.ts`; `src/core/config.ts:1736-1782`]

## Signals ve detectors

Observer event bus, filesystem, cron ve sprint-lifecycle source'larını birleştirir. `.tasks`, `.brain`, `DIRECTIVES.md` ve `.deckent` izler; feedback loop önlemek için kendi high-churn output'unu filter eder. [Kanıt: `src/nervous/observer.ts:1-81`]

Registry 12 detector implement eder:

1. stale worker
2. scope collision
3. debt trend
4. agent routing health
5. directives protection
6. task-mode idle
7. build-failure recurrence
8. token spike
9. agent-routing anomaly
10. scope-collision rate
11. notification-delivery health
12. dead event stream

Her detector bağımsız enable edilir; bir detector failure diğerlerini abort etmeden loglanır. [Kanıt: `src/nervous/detector-registry.ts:1-22,24-75,99-190`]

Normal sprint behavior'da detector dispatch yalnız EXECUTE phase'inde ve 500 ms debounce ile çalışır. Autonomous context için explicit `activeInAnyPhase` construction option vardır; fakat feature manifest current autonomous start'ın observer'ı drive etmediğini söyler. [Kanıt: `src/nervous/observer.ts:110-160,217-260`; manifest `autonomous-runtime` ve `nervous-system`]

## Configuration ve safety floor

Fresh default `nervous_system.enabled=false`, balanced mode, no bypass ve live sprint kill, manual deletion, cost threshold, destructive git, accepted ADR deprecation için locked action'lar içerir. Notification default MCP/CLI/file'ı enable, Desktop'u disable eder. [Kanıt: `src/core/config.ts:1736-1782`]

Default block içinde beş detector enabled'dır ama system-level enabled flag false'tur. Sonraki altı detector ve dead-event-stream default-off'tur. Consumer hem parent flag'i hem detector flag'i evaluate etmelidir; yalnız child default okumak yanıltıcıdır. [Kanıt: aynı source line'ları]

## Operator surface

CLI dashboard, enable, accept, reject, edit, undo, history, recommendations, log, panic acceptance ve baseline refresh sunar. `config nervous` family authority preset ve per-action override yönetir. [Kanıt: `src/cli/commands/nervous.ts:712-839`; `src/cli/commands/config-nervous.ts`; real help audit]

Gerçek read-only `nervous history --limit 1`, rejected bir `SCOPE_COLLISION_REORDER` record döndürdü. Bu persisted history'yi kanıtlar; current automatic observer execution'ı değil. [Kanıt: real output, 2026-08-01]

## Dogfood / repository gerçeği

Feature manifest Nervous'u dormant sınıflandırır; çünkü observer sprint controller tarafından import edilmez ve activation CLI-driven'dır. Bu classification always-on behavior iddia eden archive prose'dan üstündür. [Kanıt: `.deckent/settings/features-manifest.json` `nervous-system`; source import scan]

| Layer | State | Constraint |
|---|---|---|
| Observer | ✅ implemented | production driver universal değil |
| Detector registry | ✅ implemented | parent default disabled; phase-gated |
| CLI governance | ✅ canlı surface | state-changing action audit'te çalıştırılmadı |
| Persisted history | ✅ observed | bir rejected record okundu |
| Autonomous reactive flow | ⚠️ kısmi | manifest'e göre attach-only |
| Always-on meta-orchestration | 🔜 roadmap | current wiring proof desteklemiyor |

Suggestion'ı permission saymayın. Locked/destructive action'lar hâlâ owner/system authority ve applicable approval gate ister. [Kanıt: `AGENTS.md:69-108`; `src/core/config.ts:1741-1751`]
