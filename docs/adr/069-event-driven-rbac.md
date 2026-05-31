# ADR-069: Event-Driven Triggers + RBAC — F3 Webhook & F4 Role-Based Access Control

**Status:** proposed

**Date:** 2026-05-31

---

## Context

Sprint 206 iki yeni bileşen ekledi:

**F3-003 — Event-Driven Triggers (`event-trigger.ts`)**
Scheduled flows (ADR-068, F3-002) yalnızca cron-tabanlı tetikleyicileri destekliyordu. Webhook veya external event kaynaklı akışlar için tip + eşleştirme katmanı yoktu. `matchTrigger(event, triggers)` fonksiyonu gelen bir event'i kayıtlı trigger listesiyle karşılaştırarak hangi flow'ların tetikleneceğini belirler. Gerçek HTTP webhook listener bu ADR kapsamı dışındadır — yalnızca tip + matcher katmanı tanımlanmıştır.

**F4-001 — RBAC Role-Based Access Control (`rbac.ts`)**
F4 enterprise alt-projesi audit-query (ADR-068 Katman 2) ile başladı; ancak erişim denetimi yoktu. Herhangi bir tenant, herhangi bir kaynağa erişebiliyordu. `can(role, action, tenantId)` check fonksiyonu role → permission matrisini tanımlar. Gerçek auth/session entegrasyonu bu ADR kapsamı dışındadır — iskelettir.

Her iki bileşen de ADR-067 (`TenantContext`, `tenantId` zorunlu alan) üzerine inşa edilmiştir.

---

## Decision

### EventTrigger (F3-003)

`EventTrigger` tip tanımı:
```typescript
export interface EventTrigger {
  id: string;
  eventType: string;   // 'webhook' | 'custom' | 'system'
  source: string;      // trigger kaynağı (URL, servis adı, vb.)
  action: string;      // tetiklenecek flow action'ı
  tenantId: string;    // ADR-067 zorunlu alan
  enabled: boolean;
}
```

`matchTrigger(event, triggers)` semantiği:
- `tenantId` eşleşmesi zorunlu — tenant izolasyonu ADR-067 ile tutarlı.
- `eventType` eşleşmesi zorunlu.
- `enabled: false` olan trigger'lar atlanır.
- Eşleşen trigger'lar döndürülür (çoklu eşleşme desteklenir).

### RBAC (F4-001)

`Role` ve `Permission` tanımı:
```typescript
export type Role = 'admin' | 'operator' | 'viewer';

export enum Permission {
  READ   = 'read',
  WRITE  = 'write',
  DELETE = 'delete',
  ADMIN  = 'admin',
}
```

`can(role, action, tenantId)` matrix:
- `admin`: tüm izinler (READ + WRITE + DELETE + ADMIN)
- `operator`: READ + WRITE
- `viewer`: yalnızca READ
- `tenantId` parametresi tenant-scoping için geçirilir; gerçek tenant doğrulaması F4-002'de eklenir.

Bilinmeyen rol → tüm izinler reddedilir (fail-secure).

---

## Consequences

**Positive:**
- event-trigger.ts webhook/event akışını scheduled-flow ile aynı tenant-scoping modelinde birleştirir.
- RBAC iskelet fail-secure — bilinmeyen rol tüm izinleri reddeder, sonradan genişletmek güvenli.
- `tenantId` her iki bileşende zorunlu — ADR-067 ile tam uyum.
- HTTP webhook listener gereksinimsiz — matcher test edilebilir, bağımsız.

**Negative:**
- event-trigger.ts gerçek HTTP listener içermiyor — F3-003 tam tamamlanmadı, ek sprint gerekecek.
- `can()` gerçek auth session'a bağlı değil — F4-002'de OIDC/SSO entegrasyonu gerektirir.
- Role permission matrix hard-coded — kullanıcı-tanımlı rol genişletmesi F4-003 kapsamı.

---

## Alternatives Considered

- **Tam HTTP webhook server (F3-003 kapsamında)** — runtime dependency (http server) ekler, ADR-010 (tek runtime dep) ile çelişir; scope ≤200 LoC kısıtını aşardı. Tip + matcher iskeleti daha sonra HTTP katmanına kolayca bağlanabilir.
- **OIDC/SSO tam entegrasyon (F4-001 kapsamında)** — 200+ LoC, harici auth provider bağımlılığı, sprint effort=normal ile uyumsuz. İskelet → sonraki sprint progressif artış stratejisi tercih edildi.
- **Rol tabanlı config (JSON roles.json)** — hard-coded matrix config yükünü ortadan kaldırır ama runtime I/O ve validation ekler. Çok küçük bir set için overdesign — ADR-010 minimal dep prensibiyle çelişir.
- **tenant-aware can() yerine global can()** — ADR-067 izolasyon garantisini zayıflatır. `tenantId` parametresi şimdi taşınmalı yoksa F4-002 refactor maliyeti artar.

---

## References

- Sprint 206 Task 5 — `src/core/event-trigger.ts` (EventTrigger, matchTrigger, tenantId)
- Sprint 206 Task 8 — `src/core/rbac.ts` (Role, Permission, can())
- ADR-067: Process Mode + Tenant Isolation — F3 Foundation
- ADR-068: Enterprise Foundation — Audit Query + Multi-Tenant + Scheduled Flows
- ROADMAP F3-003: event-driven webhook triggers → `✅ DONE Sprint 206-005`
- ROADMAP F4-001: RBAC iskelet → `🟡 Sprint 206-008 (Role+Permission+can())`
