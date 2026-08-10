# 05 — Canonical Work Model

## Hedef zincir

```text
Goal → Mission → Flow → Run → WorkItem → Attempt → Operation → Evidence → Settlement
```

Her node stable ID, tenant/project/principal scope, parent relation, immutable input digest, authority decision, attempt/fence, evidence refs ve terminal settlement taşımalıdır. Her surface aynı application service'i çağırmalı; surface kendi lifecycle'ını yeniden üretmemelidir.

## Bugünkü model

| Kavram | Current authority | Sorun |
|---|---|---|
| Execution request | `src/core/work-model.ts` | Canonical SSOT comment'i adoption durumuyla çelişiyor; governance alanları çoğunlukla optional |
| Goal | Mission kind `goal` | Ayrı parent entity değil; CLI Goal oluşturur ama live planning HOLD |
| Mission/WorkItem | SQLite mission store | En olgun normalized graph; diğer lifecycle'larla canonical link eksik |
| Flow/Run | RunFlow contract/store/coordinator | Durable plan/start var; Mission ve Sprint settlement'ına tek relation yok |
| Sprint/Task | Sprint controller/task JSON | Run adapter rolü var; phase vocabulary ve settlement ayrışıyor |
| Attempt | Mission claim, task lineage, StartAttempt | Birden çok attempt authority'si var |
| Operation | Yok | Routing `OperationType` yalnız classification etiketi; durable operation authority değil |
| Evidence | Birden çok receipt/journal/store | Common envelope/lineage yok |
| Settlement | task-result, task-receipt, sprint evidence, mission status | Terminal truth tek authority değil |

## Kritik gap: Operation

Vision'ın en küçük observable/effectful unit'i olan `Operation` için durable identity, effect class, principal, approval, budget, provider invocation, artifact/evidence ve settlement ilişkisi yoktur. Bu eksik, üst lifecycle'ların birbirine adapter ile bağlanmasını zorlaştırır ve policy/approval/budget/audit'i surface-specific yapar.

## Önerilen canonical contract

Yeni contract mevcut güçlü store'ları yeniden yazmamalı; normalize eden authority + adapters olmalıdır:

- `LifecycleId`: tenant/project scoped, sortable, collision-safe.
- `LifecycleRelation`: typed parent/child + source digest.
- `Operation`: effect class, capability, provider/tool target, risk, idempotency key.
- `Attempt`: claim/fence/lease, exact route/model/provider, budget reservation.
- `EvidenceEnvelope`: producer identity, sequence, content digest, immutable refs.
- `Settlement`: accepted/held/rejected/cancelled/failed/completed; authority and proof refs.
- `DeliveryReceipt`: user-visible outcome'un durable teslim kanıtı.

## Migration ilkeleri

1. Big-bang rewrite yok; mevcut MissionStore, RunFlow, Sprint ve settlement stores adapter arkasına alınır.
2. Dual-write yalnız bounded migration window ve reconciliation proof ile.
3. Legacy identity/attempt rows never silently upgraded; ownership bilinmiyorsa `legacy-unowned/HOLD`.
4. Her adapter contract test + live binary proof + crash recovery kanıtı taşır.
5. Canonical read model bütün surface'lerin tek sorgu contractı olur.

## Mihenk sorgusu

Sistem şu soruya tek sorgu ve immutable evidence ile cevap veremiyorsa canonical lifecycle tamamlanmış değildir:

> Bu Goal'ı kim oluşturdu; hangi Mission/Flow/Run/WorkItem/Attempt/Operation'lar üretildi; hangi authority ile çalıştırıldı; hangi evidence sonucu hangi settlement'a ulaştı ve kullanıcıya hangi durable receipt ile teslim edildi?
