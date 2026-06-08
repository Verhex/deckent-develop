# Sprint 171 Self-Audit — Okuma Sırası

29 audit raporu + sentez. Önerilen sıra: **önce `00-SYNTHESIS.md`** (yönetici özeti + 262 bulgu severity-sıralı backlog + 47 CRITICAL + verdict + Sprint 172 doc-reorg planı + coverage doğrulama). Sentez sana hangi raporlarda kritik bulgu yoğunlaştığını söyler; sonra ilgili raporlara in.

Sentez sonrası klasör sırası: `01-modul-derin` → `02-concern` → `03-dokuman` → `04-db`.

## 00 — Sentez (ÖNCE OKU)

| Dosya | Task | İçerik |
|---|---|---|
| `00-SYNTHESIS.md` | 171-029 | Konsolide backlog, OSS-GA blocker'lar, AEGIS hizalama, doc-reorg planı, coverage doğrulama, verdict önerisi (GO_WITH_TECH_DEBT) |

## 01 — Modül-Derin (her dosya kendi dizinini char-level denetler, Kapsam Haritası içerir)

| # | Dosya | Task | Kapsam |
|---|---|---|---|
| 01 | orchestra-lifecycle | 171-001 | sprint-controller, brain, planner, task-builder, result-evaluator, result-collector, sprint-reporter, decision-steps |
| 02 | orchestra-routing | 171-002 | task-router, outcome-tracker, quality-assessor, mid-sprint-adapter, rule-evolver, debt-manager, rubric-registry |
| 03 | orchestra-infra | 171-003 | tmux, spawn-backend(-docker), promotion-pipeline, event-stream, file-lock, doc-updaters, managed-docs |
| 04 | core-types-config | 171-004 | types, config (3-layer), model-registry, mode-presets, condition-evaluator, manifest-migrator |
| 05 | core-memory | 171-005 | memory-store/query/normalize/types/export/import (SQLite FTS5, relations, decay) |
| 06 | core-pools-routing | 171-006 | agent-pool, skill-pool/registry, provider, routing-engine, intent-classifier, activation-engine |
| 07 | agents | 171-007 | worker, adaptive-agent + tüm agents/ (claim, lock, heartbeat, RBAC) |
| 08 | nervous | 171-008 | observer→detector→decision→proposer→dispatcher→executor, authority-matrix |
| 09 | monitor-connectors | 171-009 | auditor scan, dashboard-manager, sprint-state + discord/telegram/whatsapp |
| 10 | providers-api | 171-010 | claude/codex/gemini adapter + HTTP server/SSE/rate-limit |
| 11 | mcp | 171-011 | server, 27 tool, 8 resource, helpers |
| 12 | cli | 171-012 | 55+ komut, helpers, entry |
| 13 | dashboard | 171-013 | React+Vite+Tailwind, a11y, XSS yüzeyi |
| 14 | extensions-scripts | 171-014 | VS Code extension + 45 script (⚠ FIX edildi — Bug A/B, bkz 00-SYNTHESIS) |

## 02 — Concern Cross-Cutting (tüm kod tabanını enine keser)

| # | Dosya | Task | Kapsam |
|---|---|---|---|
| 01 | dead-code | 171-015 | Kullanılmayan export, ulaşılamaz dal, ESM `.js` uzantı, import cycle |
| 02 | adr-compliance | 171-016 | 46+ ADR kod enforcement vs doküman, DB↔FS senkron, drift |
| 03 | security | 171-017 | OWASP, command injection, path traversal, secret leakage |
| 04 | performance | 171-018 | Sync I/O hot path, memory leak, async anti-pattern, N+1 |
| 05 | type-safety | 171-019 | any/unknown, unsafe assertion, missing return type, strict |
| 06 | error-handling | 171-020 | Yutulan hata, boundary try/catch, fail-safe/fallback |
| 07 | test-integrity | 171-021 | 807 test gerçek coverage, flaky, mock drift, vitest baseline |
| 08 | memory-db-integrity | 171-022 | Schema, FTS5 index, relations FK, decay, entry_history, export drift |

## 03 — Doküman (tier'lı)

| # | Dosya | Task | Kapsam |
|---|---|---|---|
| 01 | docs-root | 171-023 | Kök 19-21 .md doğruluk+gereklilik+içerik+referans + 8-badge (⚠ FIX edildi) |
| 02 | docs-tree | 171-024 | docs/ ağacı + Sprint 172 reorg önerisi |
| 03 | docs-config-rules | 171-025 | rules (claude/gemini/cursor), api-surface, CLAUDE/DECKENT/IDENTITY/BOOT — kod gerçeği |
| 04 | docs-dbsync | 171-026 | Sprint log + export + legacy .md vs memory.db senkron diff |
| 05 | docs-archive | 171-027 | Arşiv dizinleri envanter + sil/taşı/koru + .gitignore/.npmignore |

## 04 — DB Karar/Referans Integrity

| # | Dosya | Task | Kapsam |
|---|---|---|---|
| 01 | db-decision-integrity | 171-028 | memory.db her entry, relations graph, entry_history, kırık [[ref]], decay, ADR DB↔FS |

## 99 — Runtime Artifact (audit değil)

| Dosya | Not |
|---|---|
| load-test-report | deckent runtime load/wave telemetry — deliverable dizinine sızdı (küçük bulgu, 00-SYNTHESIS'te kayıtlı) |

---

## Sprint Bütünlük Notu (incelerken aklında olsun)

Bu sprint **2 P0 orchestration bug'ı** ortaya çıkardı (meta-dogfood) — `00-SYNTHESIS.md` ve memory'de kayıtlı:

- **Bug A:** Schema gate `testsPassed`'i zorunlu sayıyor; bootstrap fix P0-1 sadece `coverage`'ı relax etti. 171-014 + 171-023 bu yüzden schema NO_GO aldı (içerik suçsuz, rubric 95-100). OSS GA P0.
- **Bug B:** Brain FIX spawn etti ama fix çıktısını re-evaluate etmedi (attempt-2 yok); CLEANUP `.result` silince TERMINAL `NO_GO=0` yanlış raporladı. Gerçek eval ledger: 27 DONE / 2 NO_GO. OSS GA P0.

14-extensions-scripts (171-014) ve 03-dokuman/01-docs-root (171-023) raporları FIX worker tarafından yeniden üretildi — içerik güncel ve kaliteli, sadece Brain'in karar defteri reconcile edilmedi.
