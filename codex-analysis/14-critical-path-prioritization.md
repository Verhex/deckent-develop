# 14 — Critical Path and Prioritization

## Doğru başlangıç kararı

İlk milestone “yeni Goal özelliği yaz” değildir. İlk milestone, hangi implementation işinin yapılacağını güvenilir biçimde seçen canonical plan ve quality truth üretmektir.

## Önerilen sıra

### Gate 0 — Reconciliation

- MASTER, PAZARTESI, 54 code-doc finding, strategic pivot ve current baseline reconcile.
- Duplicate/recovery-born items parent closure children'a bağlanır.
- P0 yeniden sınıflandırılır; en az bir `READY` root üretilir.

### Gate 1 — Trust signal floor

- Current failure baseline exact doğrulanır ve package owners atanır.
- Provider observation v2 run-binding live migration/adoption proof.
- CLI/MCP/API docs/count/Node floor/drift closure.
- CI hidden/fail-soft gates kapatılır.

### Gate 2 — Runtime stabilization

- PAZARTESI FAZ4a altı stabilization system ve P1 durable-write tests aynı production slices'da kapanır.
- Intervention-free certification ladder çalışır.

### Gate 3 — Authority spine

- Canonical Operation/Principal/Tenant/Capability/Approval/Budget/Receipt/Audit contracts.
- Existing store adapters ve migration evidence.

### Gate 4 — Live lifecycle closure

- Goal-v2 real role admission, executor registry, identity, acceptance ve delivery settlement.
- Shared application-service ve effect-aware cancellation.

### Gate 5 — Product journeys

- Terminal ve Desktop canonical surfaces.
- Assistant daily-work, business systems, UserMemory journeys.
- Dashboard monitoring-only boundary.
- Connectors/VS Code supported veya honest unsupported.

### Gate 6 — Assurance

- Every Environment, HA/scale, security/privacy, supply chain, accessibility, upgrade/rollback.

Gate 6 çalışmaları Gate 0'dan itibaren design/proof-track olarak paralel yürür; sona ertelenmez. Terminal closure yalnız dependency acceptance'ları kapandığında DONE olur.

## Priority policy

P0 etiketi şu dört sorudan en az birine evet demelidir:

1. Current autonomous execution incorrect/unsafe mı?
2. Truth/CI/settlement başka işleri yanlış DONE gösterebilir mi?
3. Tenant/security/authority boundary ihlali var mı?
4. Critical path'i doğrudan bloke ediyor mu?

Aksi halde P1/P2. “Recovery-born” olmak tek başına P0 gerekçesi değildir.
