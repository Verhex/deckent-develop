# Approval Surface Completion Plan — 2026-08-26

## Outcome ve sequencing ilkesi

Amaç yeni MASTER satırı açmak değil; mevcut authority DAG'ını tek bir canonical producer → application service → verified ingress → consumer validation → lifecycle settlement zinciriyle kapatmaktır. Bir dilim yalnız unit-green ile kapanmaz: production composition, real entrypoint ve negative proof aynı receipt'te bulunur.

Bir dosya tek-yazar kuralı nedeniyle aşağıdaki tüm production dokunuşları ana-şerit işidir. Bu lane yalnız exact diff haritası sunar.

## Closure dalgaları

### W0 — Authority descriptor ve vocabulary kararı

**Bağ:** 4210, 4056/D1-D4, 6120.

- Exhaustive descriptor registry iki family ayırsın: `ProtectedApprovalOrigin` ve `ConsentIntentKind`.
- Her descriptor risk floor, blocking, TTL, timeout disposition, eligible decision channels, MCP capability class, receipt schema ve consumer validator'ı taşısın.
- `broker-native` unknown fallback olarak kullanılamasın; tanımsız producer quarantine/fail-closed olsun.
- CLI/MCP/API/Desktop/help/i18n/config types/projections bu registry'den türesin.

**Exit:** 16 matris satırının her biri bir descriptor veya intentional `READ_ONLY/CALL_SCOPED` exclusion ile temsil edilir; unknown class için compile-time exhaustive + runtime quarantine proof.

### W1 — Lifecycle driver ve discovery purity

**Bağ:** 4050, 4056/D4, 475.

- API GET/list/detail, approval watcher, nervous list ve gateway list write çağrılarını kaldır.
- `ApprovalExpiryDriver`ı API-only constructor'dan host-owned singleton/lease service'e çıkar; API, bot/REPL, Desktop/Terminal ve diğer long-lived composition roots aynı contractı taşır.
- Nervous, panic, checkpoint, runflow consent, settlement review ve bot action için finite lifecycle/disposition normalize et.

**Exit:** read-only-dir ve before/after tree digest testleri bütün discovery entrypoint'lerinde green; ayrı driver tick'i exact timeout receipt üretir; API server yokken de overdue closure çalışır; süresiz descriptor sıfır.

### W2 — Checkpoint ve legacy origin cutover

**Bağ:** 4054, 4056/D2a-D2b/D5, 4053.

- `approvals decide` orchestration'ını reusable canonical decision application service'e çıkar.
- Checkpoint producer typed V2 origin/risk/TTL ile broker'a yazsın; CLI TTY yalnız canonical service'e delege etsin; MCP approve/reject kaldırılır.
- Autonomous, nervous ve gateway direct CLI handlers aynı service'e delege edilir. Panic critical safety policy owner kararına göre canonical verified ingress veya strictly local emergency break-glass contractı kullanır.
- Settle-back adapters source digest/revision CAS, idempotency ve first-writer-wins ile korunur.

**Exit:** direct decision file/store mutation importları sıfır; unknown ID, wrong tenant, expired, replay, overwrite ve race negative battery; confirmation emeklilik desenine eş production call graph.

### W3 — MCP capability negative-space

**Bağ:** 4060, 4054, 4056/D5.

- MCP tool registry semantic capability metadata'sı üretir; `protected-decision.write` registration fail-closed.
- Checkpoint/autonomous/nervous/panic decision tools kaldırılır veya read-only status + CLI/Desktop deep-link'e dönüşür.
- Routine ack ancak W0 typed consent descriptor'ında açıkça eligible ise kalır; tool adı/schema `approve/allow/deny` kullanmaz.
- Writer lease concurrency control olarak kalır, authentication diye sınıflanmaz.

**Exit:** generated full-catalog negative scan; renamed aliases/action enums/indirect handlers için zero protected-write; golden MCP session protected effect üretemez, exact read projection üretir.

### W4 — Channel ve VS Code production wiring

**Bağ:** 4054, 4056/D3, 4130, 6120.

- Channel authority verifier durable/reconstructable registry olarak global `ApprovalDecisionAuthority` composition'ına inject edilir.
- Telegram/Slack/Teams binding revocation, nonce generation, expiry ve request digest consumer validation anında yeniden kontrol edilir.
- VS Code capability handshake + fresh OIDC step-up + one-shot idempotency kullanır; unsupported durumda control gizli/disabled ve sebebi görünürdür.

**Exit:** channel mint→disk→restart→protected consumer effect; revoke/replay/tamper/critical negative battery; VS Code real extension-host happy path ve missing-auth/idempotency negative proof; her kanal için ayrı real-device receipt veya typed `HOLD`.

### W5 — Consent parity ve completion certification

**Bağ:** 4056, 4210, 6120; CFG-017.

- `autoApprove`, plan adoption, budget/scope/prompt exceptions ayrı typed intents olur; defaults tüm surfaces'te tek descriptor authority'den gelir.
- `acknowledgePromptGate` fork-child propagation kapanır veya unsupported olarak girişte reddedilir.
- Settlement review ve runflow adoption finite lifecycle + principal/tenant/target digest/idempotency taşır.
- Cross-platform atomic/CAS/storage adapters Linux, macOS, Windows native ve WSL'de aynı contractı kanıtlar.

**Exit:** omitted/false/true surface parity battery; exact intent başka intent'i authorize edemez; million-scale bounded inbox/expiry; i18n EN/TR; real binary Terminal/Desktop/API/MCP negative-space; independent different-provider XVerify receipt.

## MASTER WorkID settlement haritası

| WorkID | Bu auditten bağlanan closure | Exit ölçüsü |
|---|---|---|
| 4050 `APPROVAL-BROKER-001` | APR-001 read purity + all-host driver | GET/list/poll zero write; driver-only receipt |
| 4053 `APPROVAL-INGRESS-UNKNOWN-ID-001` | W2 negative battery regression dependency | Unknown/mismatched target hiçbir settle-back üretemez |
| 4054 `APPROVAL-DECISION-AUTHORITY-001` | APR-002/003/004/007/008 | Her protected effect verified envelope tüketir; unsigned legacy never authorizes |
| 4056 `APPROVAL-SURFACE-UNIFICATION-001` | W0-W5 ana parent | Tüm producer/consent universe exhaustive; D1-D5 gerçek closure |
| 4060 `TOOL-AUTHORITY-001` | MCP capability negative-space | MCP protected decision grant sıfır; routine ack explicit |
| 475 `NERVOUS-CONFIG-001` | Nervous/panic finite lifecycle | Null/infinite pending yok; config-resolved disposition |
| 4130 `API-SECURITY-001` | VS Code/RPC fresh OIDC + tenant/idempotency | Static token upgrade yok; UI truthful capability |
| 4210 `CONFIG-AUTHORITY-CONSOLIDATION-001` | Generated origin/consent descriptors | authored→resolved→consumer round-trip; unknown fail-closed |
| 6120 `SURFACE-PARITY-001` | Consent defaults + intentional negative-space | Capability-by-surface matrix ve golden parity proof |

Validator bu tabloyu MASTER line number'larına pinlemez; WorkID satır içeriği SHA-256 digest'lerini `EVIDENCE-MANIFEST.json` üzerinden doğrular.

## Owner admission gereken semantik kararlar

1. Cost/scope/prompt exception ve runflow adoption canonical `ApprovalRequest` origin'i mi olacak, yoksa aynı verified authority primitives'i kullanan ayrı `ConsentIntent` ledger'ı mı? Öneri: ayrı intent types; protected allow/deny ile isim/permission paylaşmasın.
2. Panic guard: yalnız local break-glass mı, yoksa critical verified approval mı? Her iki durumda MCP yazma dışarıda ve immutable safety floor korunmalı.
3. MCP routine ack exact allowlist'i: hangi intentler non-human automation caller tarafından verilebilir? Default empty/fail-closed önerilir.
4. Channel verifier custody: restart sonrası session proof'ünü doğrulayacak durable binding/nonce authority'sinin tenant scope ve retention politikası.
5. Expiry service deployment: her process içinde lease'li singleton mı, yoksa host-owned dedicated lifecycle worker mı? Cross-platform crash/restart ownership kanıtı admission şartıdır.

Bu kararlar mevcut WorkID'lerin acceptance prose'una bağlanabilir; yeni ledger row gerekmez.

## Uygulama dokunuş haritası

Ana-şerit package planı en az şu production alanlarını seri hale getirmelidir:

- Core authority/lifecycle: `src/core/approval-{inbox-federation,lifecycle-policy,decision-ingress,authority-runtime,channel-authenticator}.ts`, `src/core/config-{types,ts}.ts`, expiry driver/composition.
- Origin adapters: `src/orchestra/approval-decision-federation.ts`, nervous/autonomous/checkpoint/gateway/runflow/review stores ve handlers.
- Surfaces: CLI approvals/checkpoint/autonomous/nervous/gateway/review/run/plan; MCP tool registry ve ilgili tools; API/RPC; VS Code bridge/panel; connector callbacks.
- Generated contracts: i18n catalogs, CLI/MCP help/capability metadata, API client/schema, surface matrix docs.
- Verification: authority negative battery, read-purity digest tests, TTL fake-clock/restart/CAS, cross-surface consent parity, real-binary and real-device receipts.

`src/core/approval-*`, config types ve surface registries collision-hot olduğu için W0→W5 seri landing; yalnız disjoint tests/fixtures paralel üretilebilir.
