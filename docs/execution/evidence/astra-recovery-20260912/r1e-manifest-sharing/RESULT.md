# Approved cross-surface plan — first manifest-sharing package

Status LOCAL_VERIFIED / LATENCY_HOLD, DOGFOOD DEGRADED. Owner approved analysis plan in live conversation; implementation continues within MASTER120/R1. No new sprint or provider call.

Changed src/core/execution-effect-containment.ts: only parser-owned deeply immutable output identity is recognized via WeakSet. This is content validation reuse, not a persisted disk/admission/liveness cache. External JSON, clones, digest changes and phase mismatches retain full validation. Source nested immutability verified by recursive test.

Changed src/orchestra/execution-effect-store-adapter.ts: immutable baseline/final manifests shared inside existing Store operation snapshot with full identity/policy/admission/platform and exact artifact-reference key. Full native final fence remains; cache release at attempt boundary remains. No limits increased; snapshot candidate default OFF.

Verification:46/46 parser+Store adapter tests exit0; tsc exit0; build:all exit0. Native candidate10073.8ms exit1 DEADLINE_EXCEEDED, RSS512667648, heapUsed193635584. This is a censored failed measurement, not a demonstrated speedup or p95. No successful readiness returned. No benchmark repetition without changed hypothesis.

Next: existing proposal compiler invokes synchronous preflightPlanningExecutionAuthority before external planning (src/orchestra/run-proposal-compiler.ts:230). Analyse existing worker-thread adapter patterns and cancellation/result-generation contract before async host boundary change; async signature alone insufficient. Separately bound historical validation using existing authority/invalidation contracts. Do not return synthetic READY or replace full verification with file age. Engine GO, image/start parity, real worker canary and cross-surface closure remain open.
