# ADR-067: Process Mode + Tenant Isolation — F3 Foundation

**Status:** proposed

**Date:** 2026-05-31

---

## Context

Deckent üç yüz hedefler: AI Developer (Sprint Mode), AI Asistan (Chat Mode), AI System Worker (Process Mode). Process Mode, şirketlerin Deckent'i background agent olarak çalıştırabileceği, scheduled flows, multi-tenant izolasyon ve audit chain'in olduğu mimaridir. F3 sub-project bu yüzü hedefler.

Sprint 204 itibarıyla Process Mode için temel kararlar alınmıştır:
1. **Tenant izolasyon modeli**: Her tenant kendi `isolationRoot` dizinine sahip (`.deckent/tenants/<tenantId>/`). Sprint izolasyonu, task lock'ları, memory snapshots — hepsi tenant-scoped.
2. **tenantId resolver**: `resolveTenant()` — env `DECKENT_TENANT_ID` veya config `tenantId` alanından okur; yoksa `'local'` default (single-tenant/geliştirici modu).
3. **Path scoping**: `TenantContext.isolationRoot` = `<projectRoot>/.deckent/tenants/<tenantId>`. Tüm tenant-scoped I/O bu yol üzerinden yapılır.

Bu kararlar `src/core/tenant-context.ts` skeleton ile hayata geçirilmiştir (Sprint 204 Task 8).

---

## Decision

- `TenantContext` tipi zorunlu alanlar: `tenantId` (string), `isolationRoot` (string), `createdAt` (ISO 8601).
- `resolveTenant(projectRoot, config?)` — deterministik resolver: env önceliği > config > `'local'`.
- Tüm Process Mode bileşenleri (scheduled flows, cron, session dispatch) `TenantContext`'i parametre olarak alır.
- `'local'` tenant = single-tenant/geliştirici modu — Sprint Mode ile backward-compatible.
- Multi-tenant gerçek runtime (k8s pod-exec, audit shard) F3-002/F3-003 ile gelecek.

---

## Consequences

**Positive:**
- Sprint Mode etkilenmez — `tenantId: 'local'` mevcut davranışı korur.
- Process Mode yeni bileşenleri başından tenant-scoped — sonradan refactor yok.
- `isolationRoot` path helper her tenant için dosya sistemi izolasyonu sağlar.

**Negative:**
- F3-002 (scheduled flows) ve F3-003 (k8s pod-exec) henüz implement edilmedi — bu ADR sadece tip + resolver kararını kapsar.
- Gerçek çok-kiracılı yetkilendirme (OIDC, audit shard) F4 kapsamında.

---

## Alternatives Considered

- **Global singleton tenant state** — test izolasyonunu bozar, parallel sprint desteği yok.
- **Config-only tenant ID (env yok)** — CI ortamlarında env override esnekliği kaybolur.
- **Flat `.deckent/<tenantId>-*` prefix** — dizin izolasyonu yerine prefix karmaşası yaratır.

---

## References

- Sprint 204 Task 8 — `src/core/tenant-context.ts` skeleton (tenant isolation foundation)
- ADR-034: Multi-Project Isolation — Per-Project Security Boundaries
- ADR-062: Embedded Web Terminal (tenant-scoped session hook interface mevcut)
- ROADMAP F3: Process Mode sub-project tracker

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (Process Mode = üçüncü ürün-yüzü; multi-tenancy = enterprise-ürün).

**Re-verified:** `TenantContext` + `resolveTenant` birebir (env `DECKENT_TENANT_ID` → config → `'local'`; `tenant-context.ts:37/43`) ✓ · **F3-002 çekirdeği İNDİ:** scheduled-flow full-cron `nextRun` (`core/scheduled-flow.ts:140`, AUT-4) + flow→backlog bridge (AUT-3 `makeFlowBacklogBridge`) + durable backlog/3-gate/ExecutionPool/capability-dispatch — **otonom motor (F3-009) fiilen Process-Mode'un agentic runtime'ıdır** ve büyük ölçüde inşa edilmiştir (flag-gated, default-off).

**🔴 Threading-kararı GERÇEKLEŞMEDİ — tenant farklı şekle dağıldı:** `resolveTenant` **0-caller (dormant)**; "tüm Process-Mode bileşenleri `TenantContext` parametre alır" kararı yerine tenant-gerçekliği şöyle indi: `strict_tenant` config-flag (Sprint 261) + memory-store `tenant_id` kolonu (tenant-scoped entries/audit) + audit-MCP tenant-scope + backlog entry'de düz `tenant?: string`. **Accept-günü karar:** ya `TenantContext`-threading'i gerçekten wire et, ya bu Decision'ı gerçekleşen-şekle (config-flag + kolon + alan) amend et — ikisi birden değil.

**Terminoloji hizalamaları (ADR-042 Sprint-281 amendment ile):**
1. Context'teki "Chat Mode" ifadesi → Chat/REPL bir **etkileşim-yüzeyidir**; yürütme-style üçlüsü **`sprint | task | process`**'tir (Alperen gerekçesi: "sprint evrensel kavram değil" + "task-mode agentic değil" → process = uzun-ömürlü + agentic üçüncü style).
2. **"auto" adlandırma-çakışması (accept-günü çözülmeli):** `deckent mode auto` = bağlamdan sprint|task **auto-DETECT** komutu; "**autonomous engine**" = sürekli-çalışan motor (F3-009, Process-Mode runtime'ı). İki "auto" farklı kavram — kullanıcı-karışıklığı riski; Process-Mode style-entegrasyonunda adlandırma netleştirilir.

md+db senkron (Alperen ADR-review).
