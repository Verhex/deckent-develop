# Nervous System

## Approvals ve Nervous tek ürün yeteneğidir

Ürün vaadi basit: **Deckent otonom çalışır, insan ilgisi gerektiğini fark eder ve yetkili kişi
karar vermeden kritik bir sınırı geçemez.** Kullanıcıların "Nervous" ve "Approvals" adlı iki ayrı
sistemi işletmesi gerekmemelidir.

Nervous dikkat katmanıdır: run ve project signal'larını izler, risk veya fırsatı fark eder, neden
ilgi gerektiğini açıklar ve bir action önerir. Approvals consent katmanıdır: exact kritik action'ı
bekletir, kararı yetkili kişiye gösterir ve allow veya deny sonucunu kaydeder. Allow sonrasında
executor yalnız onaylanan action'ı uygular; settlement gerçekte ne olduğunu kaydeder. Proposal
asla permission değildir; approval da action'ın başarıyla tamamlandığının kanıtı değildir.

### Bugün çalışanlar

- Runtime approval core canlıdır. Durable request/decision, authenticated terminal kararı,
  expiry, worker risk gate'leri ve exact attended-execution claim'leri production consumer taşır.
- Nervous observer, detector, proposal, CLI control ve persisted history taşır; fakat observer her
  run tarafından universal biçimde sürülmez ve default olarak disabled'dır. Legacy normal ve
  panic yolları henüz tek authority değildir.
- Signed receipt'ler seçili governance workflow'ları için tamper-evident audit temeli sağlar.
  Henüz her runtime approval'ın signature'ı değildir ve öyle satılmamalıdır.

### Hedef deneyim

1. Deckent bir durumu gözlemler ve neden ilgi gerektiğini açıklar.
2. Tek attention inbox; önerilen action, risk, scope, cost, expiry ve olası etkiyi gösterir.
3. Yetkili kişi exact action'ı bir kez allow veya deny eder.
4. Deckent yalnız onaylanan action'ı uygular; authority eksik veya stale ise fail-closed olur.
5. Aynı kayıt gerçek sonucu gösterir: applied, failed, expired, cancelled veya compensated.

Terminal, Desktop, API, connector ve CLI aynı request, decision ve outcome state'ini tüketir. MCP
güvenli read/notification yüzeyi olarak kalır ve agent'ın kendini onaylamasına izin vermez.
Cryptographic signature bu deneyimin arkasındaki tamper-evident audit katmanıdır; normal
kullanıcının anlaması gereken ikinci bir ceremony değildir.

Müşteriye anlatılacak özet:

> Deckent kendi başına çalışır; fakat kritik sınırları yalnız yetkili insan geçirebilir ve her
> kritik karar ile sonuç sonradan kanıtlanabilir.

Bu birleşik deneyim onaylı hedeftir, completion iddiası değildir. Açık iş; her Nervous
proposal'ını tek ApprovalBroker üzerinden geçirip truthful effect settlement'a bağlayan production
wiring'dir.

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
