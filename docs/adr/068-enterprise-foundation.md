# ADR-068: Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows

**Status:** accepted

**Date:** 2026-05-31 · promoted 2026-06-11 (Sprint 281 ADR-review — üç katman da shipped)

---

## Context

F4 sub-project hedefi: Deckent'i kurumsal ortamlarda çalıştırılabilir hale getirmek — SOC2/GDPR uyumlu audit trail, OIDC/SSO auth, scheduled flow runtime ve çok-kiracılı yetkilendirme. Sprint 205 itibarıyla F4'ün ilk bileşenleri implement edilmiş ancak resmi ADR kaydı yoktu.

F3 (Process Mode) sprint 205'te tamamlanan bileşenler:
- `src/core/scheduled-flow.ts` — ScheduledFlow tipi + parseCronExpr + nextRun iskeleti (Sprint 205 Task 5)
- `src/core/flow-registry.ts` — CRUD + JSON persist (Sprint 205 Task 6)
- `src/cli/commands/flow.ts` — `deckent flow list/add` CLI (Sprint 205 Task 7)

F4'ün Sprint 205'te başlayan bileşeni:
- `src/core/audit-query.ts` — mevcut event-stream üzerinden tenant/action/time-range filtreli sorgu (Sprint 205 Task 8)

Bu bileşenler ADR-034 (multi-project isolation) ve ADR-067 (process mode + tenant isolation) üzerine inşa edilmiştir.

---

## Decision

Enterprise Foundation üç katmandan oluşur:

**Katman 1: Scheduled Flows**
- `ScheduledFlow` tipi zorunlu alanlar: `id`, `cronExpr`, `action`, `tenantId`, `enabled`.
- `parseCronExpr(expr)` — 5-alan standart cron parse + validation (`* */5 0-23` gibi aralık ve joker).
- `nextRun(flow, from)` — bir sonraki çalışma zamanı hesabı iskeleti (basit, tam scheduler değil).
- `FlowRegistry` — in-memory CRUD + `.deckent/flows/<tenantId>/flows.json` persist.
- `deckent flow list | add` CLI (ADR-012 register pattern).

**Katman 2: Audit Query**
- `queryAudit(params)` — mevcut event-stream (event-stream.ts) üzerinden okuma; yeni audit yazımı yok.
- Filtre boyutları: `tenantId`, `action`, `timeRange` (`from`/`to` ISO 8601).
- Çıktı: `AuditQueryResult[]` — timestamp, action, tenantId, payload özeti.
- Read-only — mevcut audit chain ve HMAC imzasını değiştirmez.

**Katman 3: Multi-Tenant Yetkilendirme (ileride)**
- ADR-067 `TenantContext` üzerine OIDC/SSO yetkilendirme katmanı eklenir (F4-001).
- Audit export API (F4-002) audit-query.ts üzerine inşa edilir.
- Rate/resource limits (F4-003) tenant-scoped throttle ile yönetilir.

---

## Consequences

**Positive:**
- Scheduled flows F3 temelini tamamlar — Process Mode'un kronik olarak eksik olan cron katmanını kapatır.
- Audit query read-only tasarımı mevcut audit chain'i bozmaz — zero regression riski.
- `tenantId` parametresi her katmanda taşınır — F4-001 OIDC entegrasyonu sonradan refactor gerektirmez.
- `'local'` tenant default backward-compat — Sprint Mode etkilenmez (ADR-067 ile tutarlı).

**Negative:**
- Gerçek cron scheduler runtime (k8s CronJob, OS cron) F3-003 kapsamında — bu ADR yalnızca tip + parse katmanı.
- Audit export compliance (SOC2/GDPR sertifikasyon paketi) F4-002'de ayrı ADR gerektirecek.
- `audit-query.ts` şu an event-stream dosya I/O'ya bağlı — veritabanı-backed audit store ileride migration gerektirebilir.

---

## Alternatives Considered

- **Her bileşen için ayrı ADR** — scheduled-flow, flow-registry ve audit-query ayrı ADR'ler olabilirdi. Ancak bunlar aynı F4 enterprise hedefini paylaşan küçük bileşenler; tek foundation ADR'si daha az overhead oluşturur. Gelecekte bileşen büyüdüğünde supersede edilebilir.
- **Audit için harici SIEM entegrasyonu (Datadog, Splunk)** — runtime dep ekler, self-hosted senaryolarda çalışmaz, ADR-010 (tek runtime dep) ile çelişir. Event-stream üzerinden read-only query daha az bağımlılık.
- **Flow registry için SQLite (memory.db)** — memory.db sprint/ADR/memory verisi için tasarlanmış; flow runtime verisi farklı schema ve lifecycle gerektirir. Ayrı JSON persist daha temiz izolasyon sağlar.

---

## References

- Sprint 205 Task 5 — `src/core/scheduled-flow.ts` (ScheduledFlow, parseCronExpr, nextRun)
- Sprint 205 Task 6 — `src/core/flow-registry.ts` (FlowRegistry, CRUD, persist)
- Sprint 205 Task 7 — `src/cli/commands/flow.ts` (deckent flow list/add)
- Sprint 205 Task 8 — `src/core/audit-query.ts` (queryAudit, AuditQueryResult)
- ADR-034: Multi-Project Isolation — Per-Project Security Boundaries
- ADR-067: Process Mode + Tenant Isolation — F3 Foundation
- ROADMAP F3/F4: Process Mode + Enterprise sub-project tracker

---

## Amendment — Sprint 281 (2026-06-11, ADR-review): proposed → accepted + god-level boşluk-haritası

**Classification: BOTH** (enterprise-temel ürünün kendisi).

**Terfi gerekçesi (ADR-042/053 emsali — üç katman da shipped, kod-doğrulandı):**
- **Katman-1 ✅:** `flow-registry.ts` + `flow.ts` CLI + `parseCronExpr` (:46) + **full-cron `nextRun`** (AUT-4; "iskelet" aşıldı) + flow→backlog bridge (AUT-3 — flow'lar gerçekten koşar).
- **Katman-2 ✅:** `queryAudit` (:65, read-only) + üstüne **audit-HMAC chain** (S261; memory-store `audit_prev_hmac`/`audit_hmac`) + `audit-integrity.ts` + SIEM HTTP transport (`siem-transport-http.ts`).
- **Katman-3 ✅ ("ileride" değil, İNDİ):** OIDC exchange endpoint canlı (`server.ts:745`, 277-007, config-gated, RS256-pinned/PKCE/fail-closed) + `/api/auth/me` RBAC-rolleri + enterprise rate-limits (**ADR-074**) + `strict_tenant` (S261) + auth-precedence (**ADR-076**). Teslim-eden ADR'ler: 074 (RBAC/Audit/Rate), 076 (auth-precedence), 277-007 (OIDC).

**⚖️ Dürüst derinlik-değerlendirmesi (Alperen sorusu: "yüzeysel mi, god-level mi?"):** Bu temel **gerçek ve ciddi mühendisliktir, yüzeysel değildir** (OIDC güvenlik detayları, HMAC-zincir, guard'lı terminal). Ancak **god-level-enterprise'a YARI YOLDUR** — kalan boşluklar (hepsi zaten haritalı, yeni iş açılmadı):
1. **Yönetim-düzlemi yok** — Enterprise UI salt-okunur; admin UI'dan tenant/rol/rate CRUD yapamaz (UX-denetim 2026-06-11 bulgu #6 → F7/DESK-1 control-plane).
2. **RBAC statik** — 3 sabit rol; custom-rol/izin-matrisi/per-resource ACL yok.
3. **Enforcement advisory** — ADR-037 V1.0 soft; enterprise hard-enforcement V2 hard-flip'te (post-GA).
4. **Tenant izolasyonu config-seviyesi** — path-scoping + flag; runtime izolasyon (k8s pod-exec F3-003) inşa edilmedi.
5. **Provisioning yok** — OIDC login-only; SCIM/directory-sync yok.
6. **Audit-export/compliance-paketi yok** (F4-002) — SIEM-transport var, paketleme yok; SOC2 bilinçli-kapsam-dışı (ADR-033) ama MOD-SPLIT enterprise-layer'ı compliance-evidence tooling taşıyabilir.

md+db senkron (Alperen ADR-review).
