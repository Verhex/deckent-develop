# DIRECTIVES — 4056 D4 APPROVAL LIFECYCLE NORMALIZATION (codex; 2026-08-21)

## Outcome

Frozen execution contract `docs/governance/approval-lifecycle-d4-execution.md`
(`sha256:a9b5b42f8d66aa7e877a587bcf43523fe2bc00f2d224502bbe42d7f1efed4e97`)
uyarınca confirmation, autonomous-trigger, gateway-pairing ve broker-native pending
zincirlerini config-resolved TTL/SLA/risk authority ile production closure'a taşı.

## Global execution contract

- Provider: `codex`; canonical model: `gpt-5.6-sol`; effort: `high`.
- 50 task ve test write-set'i file-disjoint'tir; worker yalnız kendi `Files` setine yazar.
- Shared authority Task 3'tür: clock, üç-tier risk mapping, disposition allowlist ve
  monotonic policy tightening başka modülde kopyalanmaz.
- Defaults: confirmation 8h/[5m,30m,2h]/elevated; autonomous 1h/[2m,10m,30m]/
  elevated; pairing 10m/[1m,3m,7m]/critical; broker 30m ceiling/[2m,10m,20m]/routine.
- Broker effective expiry `min(producer expiry, profile ceiling)`; kısa expiry
  uzatılmaz. Critical timeout/rule asla allow/proceed üretmez.
- Stored v1 byte-shape ve signed digest restart boyunca korunur. Yeni write normalized
  version yazar; read-side sessiz rewrite/default injection yapmaz.
- Timeout system action'dır; late human decision FWW kaybeder. Confirmation park,
  autonomous no-replay, pairing no-grant ile settle edilir.
- Gate off yeni pending'i typed HOLD eder ama durable lifecycle drain/sweep devam eder.
- Yeni user-facing string yalnız `getMessage(key, lang)` EN/TR kataloğundadır.
- Her task yalnız kendi scoped testini koşar; repo-global `tsc` YASAK. Brain her
  wave sonunda `npx tsc --noEmit`, birleşik scoped battery ve `git diff --check` koşar.
- Opus design advisor blockers'ı kontrata işlendi; formal design seal owner kararıyla
  toplu analize ertelendi. Worker bunu DONE seal'i gibi raporlamaz.

## Task 1: Lifecycle config type surface
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/config-types.ts, tests/core/approval-lifecycle-config-types.test.ts
- Dependencies: none
### Description
`ApprovalConfig` ve resolved config'e dört origin profilli `approval.lifecycle`
shape'ini additive ekle; üç-tier risk ve typed disposition union'larını tanımla.
- Test: npx vitest run tests/core/approval-lifecycle-config-types.test.ts
### goNogo
- goCriteria: Input/resolved type yüzeyi exact ve backward-compatible.
- nogo: Runtime default/merge kopyası; scope dışı write; repo-global tsc.

## Task 2: Lifecycle config schema and defaults
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/config.ts, tests/core/approval-lifecycle-config-resolver.test.ts
- Dependencies: Task 1
### Description
Onaylı TTL/SLA defaults, strict finite validation, tightening-only layer admission ve
fail-closed gate-off semanticsini config ingress'e bağla; policy çözme Task 3'te kalır.
- Test: npx vitest run tests/core/approval-lifecycle-config-resolver.test.ts
### goNogo
- goCriteria: Defaults exact; weakening override typed reject; absent legacy parse güvenli.
- nogo: Clamp, local resolver veya mevcut kısa producer TTL'yi uzatma.

## Task 3: Canonical lifecycle policy authority
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-lifecycle-policy.ts, tests/core/approval-lifecycle-policy.test.ts
- Dependencies: Task 1, Task 2
### Description
Tek immutable resolver/digest, injected clock contract, legacy risk→riskTier mapping,
origin disposition allowlist ve in-flight monotonic tightening authority'sini kur.
- Test: npx vitest run tests/core/approval-lifecycle-policy.test.ts
### goNogo
- goCriteria: Tek snapshot authority; weakening yok; critical yalnız deny/park.
- nogo: Consumer-local table/clock; policy reload'da stage replay.

## Task 4: Versioned approval envelope
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-contract.ts, tests/core/approval-contract-lifecycle.test.ts
- Dependencies: none
### Description
V1 read compatibility korunarak origin, riskTier, blocking, policy digest, lifecycle
generation ve source lineage taşıyan yeni-write envelope'i ekle.
- Test: npx vitest run tests/core/approval-contract-lifecycle.test.ts
### goNogo
- goCriteria: V1 source shape değişmez; yeni write eksik tier/expiry kabul etmez.
- nogo: `risk`i kaldırma; v1'e enumerable default enjekte etme.

## Task 5: Durable store and cross-platform CAS
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-store.ts, src/core/approval-file-cas.ts, tests/core/approval-store-lifecycle.test.ts, tests/core/approval-file-cas-platform.test.ts
- Dependencies: Task 3, Task 4
### Description
Normalized store'u expiry-aware FWW CAS'e taşı; private fsync/rename ve async Windows
ACL adapter'ını shared primitive'te kur; unsupported platform typed HOLD versin.
- Test: npx vitest run tests/core/approval-store-lifecycle.test.ts tests/core/approval-file-cas-platform.test.ts
### goNogo
- goCriteria: V1 read-only; v2 atomic; decide sweep öncesi expiry'yi kaybedemez.
- nogo: Full-file stale overwrite; POSIX mode'u Windows proof sayma.

## Task 6: Broker timeout receipt parity
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-broker.ts, tests/core/approval-broker-timeout-receipt.test.ts
- Dependencies: Task 3, Task 4, Task 5
### Description
Broker `decide/expire` yolunu store ile aynı expiry-aware CAS ve system timeout receipt
semantiğine bağla; critical legacy allow defaultunu canonical disposition ile clamp et.
- Test: npx vitest run tests/core/approval-broker-timeout-receipt.test.ts
### goNogo
- goCriteria: Broker/store closure byte-semantically uyumlu; race FWW.
- nogo: Background sweep'e güvenme; critical allow/proceed.

## Task 7: Deterministic legacy migration
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-lifecycle-migration.ts, tests/core/approval-lifecycle-migration.test.ts
- Dependencies: Task 3, Task 4, Task 5
### Description
Confirmation/autonomous/pairing expiry-less legacy kayıtlarını source timestamp'ten
idempotent sınıflandır; invalid timestamp'i quarantine+receipt yap, sweep-now resetleme.
- Test: npx vitest run tests/core/approval-lifecycle-migration.test.ts
### goNogo
- goCriteria: Aynı bytes aynı disposition; source age korunur.
- nogo: Silent routine fallback, read-side rewrite veya quarantine gizleme.

## Task 8: Channel riskTier authenticator
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-channel-authenticator.ts, tests/core/approval-channel-risk-tier.test.ts
- Dependencies: Task 3, Task 4
### Description
Channel tier kararını canonical üç-tier envelope'e geçir; critical için mint/session
active daima fail-closed, legacy mapping yalnız Task 3 resolver'dan gelsin.
- Test: npx vitest run tests/core/approval-channel-risk-tier.test.ts
### goNogo
- goCriteria: `risk=high,riskTier=critical` karar yüzeyi açmaz.
- nogo: İkinci mapping table; nonce tüketerek critical reject.

## Task 9: Rules engine effective-tier guard
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-rules-engine.ts, tests/core/approval-rules-risk-tier.test.ts
- Dependencies: Task 4, Task 8
### Description
Static kind tier tablosunu automatable-kind allowlist'e daralt; policy kararını request
riskTier'dan al ve critical/unknown kind auto-decision'ını engelle.
- Test: npx vitest run tests/core/approval-rules-risk-tier.test.ts
### goNogo
- goCriteria: Routine/elevated rule critical'e karar yazamaz.
- nogo: details.kind'i risk authority sayma.

## Task 10: Lifecycle i18n catalog
- Model: gpt-5.6-sol
- Effort: high
- Files: src/cli/helpers/messages.ts, tests/cli/approval-lifecycle-messages.test.ts
- Dependencies: none
### Description
Expiry, SLA stage, quarantine, late decision, lifecycle-disabled, park/no-replay/
no-grant ve policy-transition user mesajlarını EN/TR eksiksiz ekle.
- Test: npx vitest run tests/cli/approval-lifecycle-messages.test.ts
### goNogo
- goCriteria: Her yeni key EN/TR çözülür; mechanism string-free kalır.
- nogo: User-visible hardcode veya ham typed code basma.

## Task 11: Confirmation lifecycle store
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/confirmation-store.ts, tests/core/confirmation-lifecycle.test.ts
- Dependencies: Task 3, Task 5, Task 7
### Description
Confirmation zarfına expiry/risk/policy/source/generation ekle; timeout UNDECIDABLE
park, quarantine, tombstone ve explicit successor/reissue idempotency'sini uygula.
- Test: npx vitest run tests/core/confirmation-lifecycle.test.ts
### goNogo
- goCriteria: Identical bytes idempotent; reviewed successor yeni id; eski receipt korunur.
- nogo: Settled kaydı silme/diriltme veya system timeout'u human yazma.

## Task 12: Durable confirmation producer
- Model: gpt-5.6-sol
- Effort: high
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/confirmation-durable-write.test.ts
- Dependencies: Task 11
### Description
Sprint/task/evidence/revision + attempt/generation lineage'ından successor key üret;
verdict downgrade'i yalnız durable confirmation create başarılıysa uygula.
- Test: npx vitest run tests/orchestra/confirmation-durable-write.test.ts
### goNogo
- goCriteria: Write failure verdict'i sahte pending'e düşürmez; reissue lineage exact.
- nogo: Clock/random kimlik veya durability hatasını debug-only yutma.

## Task 13: Confirmation CLI lifecycle parity
- Model: gpt-5.6-sol
- Effort: high
- Files: src/cli/commands/confirmations.ts, tests/cli/confirmations-lifecycle.test.ts
- Dependencies: Task 10, Task 11, Task 27, Task 29
### Description
List/decide/run yollarını expiry-aware store'a bağla; quarantine/stage/timeout'u i18n
göster ve late karar/reissue'yı typed davranışla işle.
- Test: npx vitest run tests/cli/confirmations-lifecycle.test.ts
- Smoke: node dist/cli/entry.js confirmations list --root . -> exit 0, localized lifecycle view
### goNogo
- goCriteria: Expired item karar alamaz; system timeout human görünmez.
- nogo: CLI-local expiry veya raw string.

## Task 14: Autonomous v1 canonical lifecycle
- Model: gpt-5.6-sol
- Effort: high
- Files: src/orchestra/autonomous/approval-adapter.ts, tests/orchestra/autonomous/approval-lifecycle.test.ts
- Dependencies: Task 3, Task 5, Task 6, Task 7
### Description
Legacy pending'i canonical record yap; EffectClass/risk, expiry ve policy lineage
persist et. Broker mirror yalnız aynı expiry'li projection olsun; accept fresh-read CAS kullansın.
- Test: npx vitest run tests/orchestra/autonomous/approval-lifecycle.test.ts
### goNogo
- goCriteria: Timeout park-with-alert; takeResolved/replay yok; tenant isolation.
- nogo: Mirror-time clock reset veya cached accept.

## Task 15: Goal-v2 request-clock TTL
- Model: gpt-5.6-sol
- Effort: high
- Files: src/orchestra/autonomous/mission-store/mission-approval-coordinator.ts, tests/orchestra/autonomous/mission-store/mission-approval-lifecycle.test.ts
- Dependencies: Task 3, Task 6
### Description
Mission approval request'ini publish-time injected clock ve resolved policy ile kur;
delayed dependency born-expired olmasın, risk-tagged/destructive critical kalsın.
- Test: npx vitest run tests/orchestra/autonomous/mission-store/mission-approval-lifecycle.test.ts
### goNogo
- goCriteria: Kısa existing TTL uzamaz; dependency block before claim.
- nogo: `item.createdAt + 15m` local constant.

## Task 16: Autonomous CLI decision parity
- Model: gpt-5.6-sol
- Effort: high
- Files: src/cli/commands/autonomous.ts, tests/cli/autonomous-approval-lifecycle.test.ts
- Dependencies: Task 10, Task 14, Task 15, Task 27
### Description
V2 production request factory ve v1 pending/approve/reject yüzeyini resolved policy,
fresh durable state ve typed late-decision sonucu ile bağla.
- Test: npx vitest run tests/cli/autonomous-approval-lifecycle.test.ts
- Smoke: node dist/cli/entry.js autonomous pending --root . -> exit 0, expiry-aware rows
### goNogo
- goCriteria: CLI broker/adapter ile aynı expiry/risk sonucunu verir.
- nogo: Direct decisions.json write veya local TTL.

## Task 17: Focused autonomous MCP guard
- Model: gpt-5.6-sol
- Effort: high
- Files: src/mcp/tools/autonomous-approval.ts, tests/mcp/autonomous-approval-lifecycle.test.ts
- Dependencies: Task 10, Task 14, Task 27, Task 29
### Description
Focused approve/reject MCP'yi fresh lifecycle transition'a bağla; expired/quarantine
itemi typed read result dışında mutate etme.
- Test: npx vitest run tests/mcp/autonomous-approval-lifecycle.test.ts
### goNogo
- goCriteria: Late approve decision/replay üretmez.
- nogo: MCP self-approval veya cached pending guard.

## Task 18: Broad autonomous MCP guard
- Model: gpt-5.6-sol
- Effort: high
- Files: src/mcp/tools/autonomous.ts, tests/mcp/autonomous-broad-approval-lifecycle.test.ts
- Dependencies: Task 10, Task 14, Task 27, Task 29
### Description
Broad pending/approve/reject actions'ı Task 17 ile aynı lifecycle adapter sonucuna bağla.
- Test: npx vitest run tests/mcp/autonomous-broad-approval-lifecycle.test.ts
### goNogo
- goCriteria: Focused/broad parity; expired mutation sıfır.
- nogo: İkinci karar motoru veya silent success.

## Task 19: Autonomous API lifecycle parity
- Model: gpt-5.6-sol
- Effort: high
- Files: src/api/autonomous-endpoint.ts, tests/api/autonomous-approval-lifecycle.test.ts
- Dependencies: Task 10, Task 14, Task 27, Task 29
### Description
API pending/status/approve/reject'i expiry-aware projection ve transition'a bağla;
tenant scope ve typed HTTP errors korunsun.
- Test: npx vitest run tests/api/autonomous-approval-lifecycle.test.ts
- Smoke: npx vitest run tests/api/autonomous-approval-lifecycle.test.ts -> real served endpoint proof
### goNogo
- goCriteria: Late approve 4xx typed, hiçbir replay/decision write yok.
- nogo: API-local time/risk table.

## Task 20: Incoming bot resolver lifecycle guard
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/incoming-command-resolver.ts, tests/connectors/incoming-approval-lifecycle.test.ts
- Dependencies: Task 10, Task 14, Task 27, Task 29
### Description
Phone-friendly resolver'da full/short id kararını fresh lifecycle state'e bağla;
expired autonomous iteme ack/replay üretme.
- Test: npx vitest run tests/connectors/incoming-approval-lifecycle.test.ts
### goNogo
- goCriteria: Prefix collision ve late decision fail-honest.
- nogo: Pending snapshot'a dayanarak accept.

## Task 21: Pairing transactional lifecycle store
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/gateway/gateway-access.ts, tests/connectors/gateway/gateway-access-lifecycle.test.ts
- Dependencies: Task 3, Task 4, Task 5, Task 7
### Description
Opaque pairingId + unique short code, project/tenant scope, canonical object-map/legacy
parser, reload-under-lock CAS, TTL/quarantine ve crash-atomic no-grant transition kur.
- Test: npx vitest run tests/connectors/gateway/gateway-access-lifecycle.test.ts
### goNogo
- goCriteria: Stale process diriltemez; expired/raced pairing grant vermez.
- nogo: Code'u primary identity yapmak veya private ACL'siz write.

## Task 22: Pairing producer exact scope
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/gateway/gateway-router.ts, tests/connectors/gateway/gateway-router-lifecycle.test.ts
- Dependencies: Task 21
### Description
Unauthorized `/use` producer'ı exact project/tenant/requesting principal scope'unu
pairing request'e aktarır; requesting chat critical kararı veremez.
- Test: npx vitest run tests/connectors/gateway/gateway-router-lifecycle.test.ts
### goNogo
- goCriteria: Broker envelope exact intended grantı temsil eder.
- nogo: Sadece chatKey veya requesting-chat self-decision.

## Task 23: Gateway daemon live reload
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/gateway/gateway-daemon.ts, tests/connectors/gateway/gateway-daemon-access-reload.test.ts
- Dependencies: Task 21, Task 22
### Description
Daemon access checks'i Task 21 read-through/CAS adapter'ına bağla; CLI kararını restart
olmadan görsün ve stale snapshot write yapmasın.
- Test: npx vitest run tests/connectors/gateway/gateway-daemon-access-reload.test.ts
### goNogo
- goCriteria: Cross-process read-after-write ve revoke görünürlüğü.
- nogo: Poll-local shadow map veya restart şartı.

## Task 24: Gateway pairing CLI parity
- Model: gpt-5.6-sol
- Effort: high
- Files: src/cli/commands/gateway.ts, tests/cli/gateway-pair-lifecycle.test.ts
- Dependencies: Task 10, Task 21, Task 27, Task 29
### Description
Pair list/approve/reject'i typed lifecycle state'e bağla; expired/quarantine pairing
grant vermez, view i18n lifecycle alanlarını gösterir.
- Test: npx vitest run tests/cli/gateway-pair-lifecycle.test.ts
- Smoke: node dist/cli/entry.js gateway pair list -> exit 0, expiry-aware output
### goNogo
- goCriteria: CLI/daemon CAS parity; no late grant.
- nogo: Direct allowlist write veya raw chat/code log.

## Task 25: Federated inbox parser parity
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-inbox-federation.ts, tests/core/approval-inbox-federation-parity.test.ts
- Dependencies: Task 11, Task 14, Task 21
### Description
Confirmation/autonomous/pairing lifecycle projection'ını canonical parsers üzerinden
kur; production pairing object-map, legacy array ve quarantine fail-honest görünür.
- Test: npx vitest run tests/core/approval-inbox-federation-parity.test.ts
### goNogo
- goCriteria: Gerçek object-map exact rows; expiry/risk/stage present.
- nogo: Array-only ikinci parser veya hardcoded summary.

## Task 26: Pending lifecycle index
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/pending-approvals.ts, tests/core/pending-approval-lifecycle-index.test.ts
- Dependencies: Task 5, Task 7, Task 11, Task 14, Task 21, Task 25
### Description
Startup/status index'ini expiry/quarantine aware yap; read-only query boş store yaratmaz,
source clock resetlemez ve hiçbir expiry-less row'u pending saymaz.
- Test: npx vitest run tests/core/pending-approval-lifecycle-index.test.ts
### goNogo
- goCriteria: Status tüm originlerde aynı durable truth'u verir.
- nogo: Corrupt origin'i gizleme veya read-time reissue.

## Task 27: Runtime expiry driver
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-expiry-driver.ts, tests/core/approval-expiry-driver-lifecycle.test.ts
- Dependencies: Task 6, Task 11, Task 14, Task 21, Task 26
### Description
Startup/scheduled sweep'i dört origin, monotonic policy tightening, timeout receipt ve
FWW settle queue ile genişlet; current critical guard Task 3'tür.
- Test: npx vitest run tests/core/approval-expiry-driver-lifecycle.test.ts
### goNogo
- goCriteria: Sweep idempotent; disable durumunda durable drain sürer.
- nogo: Timer authority veya broker-only sweep.

## Task 28: Durable SLA and outbox
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-sla.ts, tests/core/approval-sla.test.ts
- Dependencies: Task 3, Task 27
### Description
Initial/renotify/alternate/park-alert/expired state, stable generation-stage eventId,
durable outbox/cursor, short-TTL typed skip ve restart highest-stage coalesce kur.
- Test: npx vitest run tests/core/approval-sla.test.ts
### goNogo
- goCriteria: Strict monotonic; no reminder flood; expiry tek terminal event.
- nogo: Process timer state veya policy digest değişince duplicate event.

## Task 29: Timeout decision federation
- Model: gpt-5.6-sol
- Effort: high
- Files: src/orchestra/approval-decision-federation.ts, tests/orchestra/approval-decision-federation-timeout.test.ts
- Dependencies: Task 11, Task 14, Task 21, Task 27
### Description
Broker/system timeout'u confirmation park, autonomous park-with-alert/no-replay ve
pairing deny/remove/no-grant canonical settle-back'lerine bağla; mirror clock resetini kaldır.
- Test: npx vitest run tests/orchestra/approval-decision-federation-timeout.test.ts
### goNogo
- goCriteria: Üç legacy origin terminal truth'la eşleşir.
- nogo: Human decidedBy, replay, grant veya 24h local mirror constant.

## Task 30: Lifecycle audit evidence
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/audit-writer.ts, tests/core/audit-writer-approval-lifecycle.test.ts
- Dependencies: Task 27, Task 28
### Description
Shared audit primitive'te SLA stage, policy-transition, quarantine ve system timeout
receipt'lerini source/policy lineage ile persist et.
- Test: npx vitest run tests/core/audit-writer-approval-lifecycle.test.ts
### goNogo
- goCriteria: Stable event ids ve system actor; raw identity/secret yok.
- nogo: İkinci audit sink/schema.

## Task 31: SLA relay core
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-relay.ts, tests/core/approval-relay-sla.test.ts
- Dependencies: Task 3, Task 5, Task 6, Task 28, Task 30, Task 48
### Description
SLA outbox route/idempotency ve direct broker decide yolunu shared disposition/expiry
guard'a bağla; coalesced highest-stage delivery contractını koru.
- Test: npx vitest run tests/core/approval-relay-sla.test.ts
### goNogo
- goCriteria: Retry duplicate göndermez; critical fallback allow olamaz.
- nogo: Relay-local timeout table veya unchecked broker.decide.

## Task 32: Approval client attach and ack
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/approval-clients-wire.ts, tests/connectors/approval-clients-wire-sla.test.ts
- Dependencies: Task 31
### Description
Gerçek configured clients'a SLA event attach et; durable ack/cursor, unavailable route
evidence ve retry no-spam davranışı kur. Secret provisioning yapma.
- Test: npx vitest run tests/connectors/approval-clients-wire-sla.test.ts
### goNogo
- goCriteria: Ack restart-safe; channel unavailable typed evidence.
- nogo: Credential mutation veya in-memory-only cursor.

## Task 33: API runtime lifecycle composition
- Model: gpt-5.6-sol
- Effort: high
- Files: src/api/server.ts, tests/api/approval-lifecycle-runtime-wire.test.ts
- Dependencies: Task 2, Task 27, Task 28, Task 29, Task 30, Task 31, Task 32
### Description
Resolved config'i driver/SLA/relay/settle-back startup+scheduled lifecycle'ına bağla;
server stop/dispose timer ve outbox lease'lerini kapatsın.
- Test: npx vitest run tests/api/approval-lifecycle-runtime-wire.test.ts
- Smoke: npx vitest run tests/api/approval-lifecycle-runtime-wire.test.ts -> real dist server HTTP proof
### goNogo
- goCriteria: Config→sweep→relay→settle production chain tek composition.
- nogo: Raw config duck-type veya orphan interval.

## Task 34: Authenticated approvals CLI view
- Model: gpt-5.6-sol
- Effort: high
- Files: src/cli/commands/approvals.ts, tests/cli/approvals-lifecycle-view.test.ts
- Dependencies: Task 10, Task 25, Task 29, Task 30
### Description
Unified list/decide'ı lifecycle fields/quarantine/system receipts ile genişlet; decide
live-auth + expiry CAS'tan geçer, CLI stage/event üretmez.
- Test: npx vitest run tests/cli/approvals-lifecycle-view.test.ts
- Smoke: node dist/cli/entry.js approvals list --root . -> exit 0, lifecycle/quarantine view
### goNogo
- goCriteria: Read view shared; late decide terminal truth'u gösterir.
- nogo: CLI-local sweep/table veya self-approval.

## Task 35: Read-only approvals MCP view
- Model: gpt-5.6-sol
- Effort: high
- Files: src/mcp/tools/approvals.ts, tests/mcp/approvals-lifecycle-view.test.ts
- Dependencies: Task 10, Task 25, Task 29, Task 30
### Description
MCP inbox'a expiry/risk/stage/quarantine/audit alanlarını additive ekle; MCP karar,
stage, migration veya reissue üretmesin.
- Test: npx vitest run tests/mcp/approvals-lifecycle-view.test.ts
### goNogo
- goCriteria: CLI/MCP same durable rows; read-only contract korunur.
- nogo: MCP decide veya read sırasında write.

## Task 36: Telegram effective riskTier
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/approval-telegram.ts, tests/connectors/approval-telegram-risk-tier.test.ts
- Dependencies: Task 8
### Description
Button/view-only kararını normalized tier'a geçir; critical için sıfır action payload.
- Test: npx vitest run tests/connectors/approval-telegram-risk-tier.test.ts
### goNogo
- goCriteria: `risk=high,tier=critical` view-only; noncritical nonce korunur.
- nogo: Local risk map veya critical callback.

## Task 37: Slack effective riskTier
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/approval-slack.ts, tests/connectors/approval-slack-risk-tier.test.ts
- Dependencies: Task 8
### Description
Slack render/action policy'sini effective tier'a geçir; provisioning yapma.
- Test: npx vitest run tests/connectors/approval-slack-risk-tier.test.ts
### goNogo
- goCriteria: Critical action/deep-link yok; noncritical auth envelope aynı.
- nogo: Secret/config mutation.

## Task 38: Teams effective riskTier
- Model: gpt-5.6-sol
- Effort: high
- Files: src/connectors/approval-teams.ts, tests/connectors/approval-teams-risk-tier.test.ts
- Dependencies: Task 8
### Description
Teams render/action policy'sini effective tier'a geçir; provisioning yapma.
- Test: npx vitest run tests/connectors/approval-teams-risk-tier.test.ts
### goNogo
- goCriteria: Critical view-only; noncritical MAC flow korunur.
- nogo: Secret/config mutation.

## Task 39: Bot critical precheck
- Model: gpt-5.6-sol
- Effort: high
- Files: src/cli/commands/bot.ts, tests/cli/bot-approval-risk-tier.test.ts
- Dependencies: Task 8, Task 10
### Description
Bot CLI precheck ve render'ı riskTier'a bağla; critical'de decideChannel çağrılmasın.
- Test: npx vitest run tests/cli/bot-approval-risk-tier.test.ts
- Smoke: node dist/cli/entry.js bot status -> exit 0
### goNogo
- goCriteria: Critical CLI-only; user strings i18n.
- nogo: Stale `risk` authorization veya auth side effect.

## Task 40: Pairing no-access-grant integration
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/connectors/gateway/pairing-no-access-grant.integration.test.ts
- Dependencies: Task 21, Task 22, Task 23, Task 24, Task 27, Task 29
### Description
Parser→inbox→timeout/late-decision→daemon zincirinde expiry/race'in access grant
üretmediğini gerçek cross-process store ile kanıtla.
- Test: npx vitest run tests/connectors/gateway/pairing-no-access-grant.integration.test.ts
### goNogo
- goCriteria: No grant, no resurrection, terminal receipt correlated.
- nogo: Mock-only access adapter.

## Task 41: Autonomous no-replay integration
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/orchestra/autonomous/approval-no-replay.integration.test.ts
- Dependencies: Task 14, Task 16, Task 17, Task 18, Task 19, Task 20, Task 27, Task 29
### Description
Timeout ve tüm retained direct surfaces sonrası trigger replay/takeResolved/executor
çağrısı olmadığını aynı persisted record ile kanıtla.
- Test: npx vitest run tests/orchestra/autonomous/approval-no-replay.integration.test.ts
### goNogo
- goCriteria: Park-with-alert only, all surfaces late reject.
- nogo: Sadece unit mock veya explicit decision'ı timeout sayma.

## Task 42: Confirmation expiry and successor integration
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/core/confirmation-expiry-park.integration.test.ts
- Dependencies: Task 11, Task 12, Task 13, Task 27, Task 29
### Description
Confirmation timeout'un UNDECIDABLE park/tombstone olduğunu ve yeni evidence/revision
generation'ın successor üretebildiğini uçtan uca kanıtla.
- Test: npx vitest run tests/core/confirmation-expiry-park.integration.test.ts
### goNogo
- goCriteria: Old receipt preserved; same bytes idempotent; successor decidable.
- nogo: Tombstone delete veya permanent un-reissuable park.

## Task 43: Direct decision surface parity integration
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/core/approval-direct-surface-parity.integration.test.ts
- Dependencies: Task 13, Task 16, Task 17, Task 18, Task 19, Task 20, Task 24, Task 29
### Description
Confirmation/autonomous/pairing CLI/MCP/API/bot yollarının aynı expired/quarantine/FWW
sonucunu verdiğini ve hiçbir late side effect üretmediğini kanıtla.
- Test: npx vitest run tests/core/approval-direct-surface-parity.integration.test.ts
### goNogo
- goCriteria: Tüm retained surfaces canonical transition tüketir.
- nogo: Bir yüzeyde silent success veya local decision.

## Task 44: Full lifecycle closure correlation
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/core/approval-lifecycle-closure.integration.test.ts
- Dependencies: Task 25, Task 27, Task 28, Task 29, Task 30, Task 31, Task 32, Task 33, Task 34, Task 35
### Description
Aynı request lineage için config→producer→store/broker→SLA→relay/client→settle→
audit→CLI/MCP correlation'ını dört origin ve critical negative ile kanıtla.
- Test: npx vitest run tests/core/approval-lifecycle-closure.integration.test.ts
### goNogo
- goCriteria: Exact IDs/digests/receipts; no hidden pending.
- nogo: Fixture-local reimplementation veya test-only wiring.

## Task 45: Concurrency, restart and scale proof
- Model: gpt-5.6-sol
- Effort: high
- Files: tests/core/approval-lifecycle-concurrency-scale.integration.test.ts
- Dependencies: Task 5, Task 6, Task 7, Task 21, Task 27, Task 28, Task 29, Task 31, Task 32
### Description
Human-vs-timeout, process-vs-process, restart catch-up ve 10k pending altında FWW,
bounded sweep, stable outbox ve highest-stage delivery coalesce kanıtla.
- Test: npx vitest run tests/core/approval-lifecycle-concurrency-scale.integration.test.ts
### goNogo
- goCriteria: Deterministic terminal truth; duplicate notification/receipt yok.
- nogo: Unbounded full scan claim veya timer-only race test.

## Task 46: Platform proof and authority ratchet
- Model: gpt-5.6-sol
- Effort: high
- Files: scripts/lint-approval-lifecycle-authority.mjs, tests/scripts/lint-approval-lifecycle-authority.test.ts, tests/core/approval-lifecycle-platform.integration.test.ts
- Dependencies: Task 5, Task 7, Task 21, Task 27, Task 28
### Description
POSIX/macOS/Windows-native/WSL adapter conformance, private ACL/atomicity/unsupported
HOLD proof'u ve consumer-local TTL/risk/disposition table regression lint'i kur.
- Test: npx vitest run tests/scripts/lint-approval-lifecycle-authority.test.ts tests/core/approval-lifecycle-platform.integration.test.ts
### goNogo
- goCriteria: Platform capabilities honest; lint seeded violations yakalar.
- nogo: `process.platform` taklidi tek başına Windows proof veya warn-only lint.

## Task 47: Version-aware decision digest
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-decision-ingress.ts, tests/core/approval-decision-ingress-versioned-digest.test.ts, tests/core/approval-v1-mac-restart.integration.test.ts
- Dependencies: Task 4, Task 5, Task 8
### Description
Authorization digest'i source contract version'a bağla; stored signed v1 decision'ın
normalize+restart sonrası doğruluğunu ve v2 tier tamper mismatch'ini kanıtla.
- Test: npx vitest run tests/core/approval-decision-ingress-versioned-digest.test.ts tests/core/approval-v1-mac-restart.integration.test.ts
### goNogo
- goCriteria: Exact v1 MAC survives; v2 tier tamper fails.
- nogo: Low-confidence fallback digest veya enumerable v1 default.

## Task 48: Critical policy, fallback and WorkerGate
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-policy.ts, src/core/approval-fallback.ts, src/core/approval-worker-gate.ts, tests/core/approval-policy-fallback-risk-tier.test.ts, tests/core/approval-worker-gate-risk-tier.test.ts
- Dependencies: Task 3, Task 8, Task 47
### Description
Policy clamp, unattended fallback ve WorkerGate auto-approve/allowscope/fallback
yollarını normalized request tier + shared disposition authority'ye geçir.
- Test: npx vitest run tests/core/approval-policy-fallback-risk-tier.test.ts tests/core/approval-worker-gate-risk-tier.test.ts
### goNogo
- goCriteria: `risk=high,tier=critical` hiçbir allow/fallback grant üretmez.
- nogo: action.risk authority veya reachable-dashboard critical allow.

## Task 49: Allow-scope effective tier
- Model: gpt-5.6-sol
- Effort: high
- Files: src/core/approval-allowscope.ts, tests/core/approval-allowscope-risk-tier.test.ts
- Dependencies: Task 8, Task 47
### Description
Grant match/risk rank kararını normalized request riskTier'a bağla; critical scope grant
reuse etmez ve legacy five-level detail yalnız audit kalır.
- Test: npx vitest run tests/core/approval-allowscope-risk-tier.test.ts
### goNogo
- goCriteria: Tier elevation existing grantı invalidate eder.
- nogo: action.risk üzerinden grant reuse.

## Task 50: Nervous approval safety floor
- Model: gpt-5.6-sol
- Effort: high
- Files: src/nervous/approval-bridge.ts, tests/nervous/approval-bridge-risk-tier.test.ts
- Dependencies: Task 8, Task 47
### Description
Nervous bridge safety floor'u normalized tier'a geçir; critical request policy/rule ile
otomatikleşmez, exact lifecycle evidence taşır.
- Test: npx vitest run tests/nervous/approval-bridge-risk-tier.test.ts
### goNogo
- goCriteria: Critical bridge manual/park path; lower tiers backward-compatible.
- nogo: Stale request.risk clamp veya ikinci mapping.
