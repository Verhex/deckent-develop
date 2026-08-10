# 06 — Runtime, Orchestration and Durability

## Güçlü temeller

- Mission store: SQLite WAL, normalized dependency graph, atomic mission+DAG creation.
- Claim/lease/fence ve revision kontrolleri.
- Approval outbox, restart hydration ve pre-claim validation.
- Immutable recovery journal ve parked reconciliation.
- RunFlow CAS, exact plan digest, StartAttempt journal.
- Dependency scheduler'da Kahn DAG ve continuous refill reducer.
- Result persistence'ta temp+rename/settlement authority desenleri.

Bu yapılar korunmalı; yeniden yazmak yerine canonical authority'ye compose edilmelidir.

## Critical: Goal-v2 HOLD-only

Canlı zincir oluşturulabilir fakat ilerleyemez:

```text
create-goal → Mission row → goal driver
            → brain/auditor admission candidates:{} → HOLD
            → worker authority forced HOLD → parked/throw
```

Production registry yalnız `task` runner taşır; sprint/capability/process açıkça unwired. Unit/integration testlerinde fake injected executors olması live closure kanıtı değildir.

## Goal terminal correctness

Scheduler tüm WorkItem'lar done olduğunda mission status'u `completed` yapar; Goal engine bu durumun acceptance/delivery tamamlanmadan false-positive olabileceğini kabul ederek process-local `finalized` set ile düzeltmeye çalışır. Status write ile external delivery arasındaki crash window receipt/fence içermez. Restart sonrası UI/SQL status ile gerçek user outcome ayrışabilir.

## Lifecycle phase contradiction

Executable controller RETRO/DECAY'den sonra gerçek CLEANUP çalıştırır, sonra COMPLETE'e geçer. `SprintPhase` enum'unda CLEANUP yoktur; emitted transition DECAY→COMPLETE kaydeder. `DECKENT.md` code block ve phase table da birbirini tutmaz. Bu yalnız doküman sorunu değil; telemetry/recovery/state consumer'larının farklı vocabulary görme riskidir.

## Cancellation semantiği

RunFlow API cancel, flow record'ı `CANCELLED` yapar fakat detached sprint process'i durdurmaz. Response bunu dürüstçe söyler; yine de ürün state'i ile effect state'i ayrıdır. Canonical cancellation effect-aware olmalı: requested → authority decision → signal delivered → process acknowledged/forced → resources released → settlement.

## Durability verdict

- Component durability: **STRONG/PARTIAL**
- Cross-component lifecycle durability: **UNWIRED**
- Goal delivery durability: **HOLD**
- Multi-process/HA durability: **NOT PROVEN**
- Runtime certification: **HOLD**, çünkü PAZARTESI kayıtlarında 0/31 intervention-free run ve current failure ratchet var.

## Acceptance gates

- Goal'ın creator→plan→dispatch→accept→deliver→settle zinciri gerçek provider ve binary ile kapanır.
- Crash injection her state boundary'de exactly-once/at-least-once contractı kanıtlar.
- UI/API/CLI/MCP aynı terminal truth'u okur.
- Cleanup phase canonical enum/event/read-model'de tek vocabulary olur.
- Cancel gerçek effect'i bounded şekilde durdurur veya typed `cancellation-pending/HOLD` döner.
- 31+ intervention-free run, deterministic pass criteria ve disk diff evidence ile sertifikalanır.
