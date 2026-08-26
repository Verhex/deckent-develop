# Approval Surface Matrix — 2026-08-26

## Hüküm

Audit base'i `9a05b96b6421da120f28df4461f38661f09df015` üzerinde tek bir runtime-wide approval yüzeyi henüz yoktur. Canonical `ApprovalBroker` zinciri; finite TTL, typed lifecycle ve signed decision envelope açısından güçlüdür. Buna karşılık federated inbox yalnız yedi legacy origin'i projekte eder, canonical lifecycle top-level origin vocabulary yalnız dört origin taşır ve en az dokuz producer sınıfı legacy/direct state authority'sinde kalır.

Bu matris iki kavramı özellikle ayırır:

- **Protected decision:** bir effect'i `allow/deny/approve/reject` ile yetkilendirir; principal, tenant, target revision/digest, expiry, nonce/idempotency ve doğrulanabilir receipt ister.
- **Consent/acknowledgement:** plan adoption, worker permission mode veya budget/scope/prompt istisnası gibi ayrı niyet sınıfıdır. Bunları `approve` adlı ham boolean'a indirgemek authority genişletir; protected decision ile aynı isim altında birleşmeleri doğru değildir.

Durum sözlüğü: `CANONICAL` = broker + verified ingress; `MIRRORED` = broker'a kopyalanıyor fakat legacy producer/consumer hâlâ authority; `LEGACY` = doğrudan store/file mutation; `CALL_SCOPED` = durable pending üretmiyor; `READ_ONLY` = karar üretemiyor.

## Producer × channel × envelope × lifecycle matrisi

| # | Producer sınıfı | Giriş/karar kanalları | Broker / federated inbox | Typed origin + riskTier | TTL / timeout disposition | Audit/decision receipt | Disk hükmü |
|---:|---|---|---|---|---|---|---|
| 1 | Broker-native worker/tool/attended request | CLI TTY, OIDC API/RPC, REPL, channel relay, rules-engine; MCP inbox read-only | `CANONICAL`; runtime store | V2 `broker-native`; lifecycle risk floor | Finite, default 30m; expiry driver + FWW timeout receipt | Signed/MAC decision envelope, idempotency ve SLA journal | En güçlü zincir; yalnız API composition'da scheduler var (`src/api/server.ts:2491-2646`) |
| 2 | Confirmation (`cnf-*`) | `approvals decide`; legacy confirmation CLI karar vermiyor | `MIRRORED`; federated inbox var | V2 `confirmation`, typed risk floor | 8h; timeout `park-undecidable`, run blocking | Broker receipt + settle-back | Legacy decision CLI emekli (`src/cli/commands/confirmations.ts:137-151`); iyi cutover örneği |
| 3 | Nervous notification | CLI/MCP/bot `accept/reject` | Inbox + decision mirror var; legacy side entrance açık | Inbox origin `nervous`; mirror top-level'da `broker-native`, risk typed değil | `timeoutMs` nullable; `null` süresiz | Legacy IPC/remove + optional broker mirror | `LEGACY/MIRRORED`; doğrudan karar ve süresiz pending kalır |
| 4 | Panic guard | CLI/MCP `accept/reject` | Inbox var; decision federation allowlist'inde kasıtlı dışarıda | Inbox origin `panic-guard`; lifecycle/risk zarfı yok | Expiry yok | Accepted marker / pending unlink; verified decision receipt yok | `LEGACY`; critical safety effect'i renamed MCP/CLI write ile açılabilir |
| 5 | Autonomous trigger | CLI/MCP dedicated approve/reject, generic MCP autonomous action | Inbox + decision mirror var | V2 migration `autonomous-trigger`, risk floor mevcut | 1h; `park-alert`, no-replay lifecycle | Legacy decisions.json + broker mirror | `MIRRORED`; direct `gate.accept/reject` side entrances authority olmaya devam ediyor |
| 6 | Checkpoint | CLI/MCP approve/reject | Inbox + decision mirror/settle-back seam var | Inbox origin `checkpoint`; mirror top-level `broker-native`, risk yok | Expiry/disposition yok | Checkpoint JSON `status` doğrudan overwrite | `LEGACY/MIRRORED`; CFG-004 CRITICAL bypass doğrulandı |
| 7 | Cost gate acknowledgement | CLI `--force`, MCP `acknowledgeCost` | Broker/inbox yok | Ham boolean; principal/tenant/target digest/risk zarfı yok | `CALL_SCOPED`; TTL N/A | Durable authority receipt yok | Ayrı `budget-override` consent türü olmalı; protected decision diye sunulmamalı |
| 8 | Prompt-quality gate acknowledgement | CLI `--force-prompt-gate`, MCP `acknowledgePromptGate` | Broker/inbox yok | Ham boolean; zarf yok | `CALL_SCOPED`; MCP fork-child'a taşınmıyor | Durable authority receipt yok | Semantic parity bozuk; MCP true bugün effect üretmeyebilir (`src/mcp/tools/start.ts:98-106`) |
| 9 | Scope-path gate acknowledgement | CLI `--force-scope`, MCP `acknowledgeScopePaths` | Broker/inbox yok | Ham boolean; zarf yok | `CALL_SCOPED`; TTL N/A | Durable authority receipt yok | Ayrı `scope-exception` consent + exact normalized path-set digest gerekir |
| 10 | Bot action park | Connector command router | Federated inbox var; decision federation yok | Inbox `bot-action`; top-level lifecycle/risk yok | Native 1h execution check; inbox stale row'u expiry ile filtrelemiyor | File delete/take; typed timeout receipt yok | Finite execution TTL var, fakat discovery/settlement lifecycle eksik |
| 11 | Runflow consent / plan adoption | CLI, API/RPC, REPL, MCP `plan approve:true` | Broker/inbox yok; ayrı revision/digest service | Flow/revision/planDigest var; approval risk/origin zarfı yok | `AWAITING_APPROVAL` için expiry yok | Runflow event/decision kaydı var; live human authority değil | Güçlü CAS semantiği var ama süresiz ve yüzey terimleri/defaultları driftli |
| 12 | Gateway pairing | CLI pair approve/reject; API/connector flows | Inbox + lifecycle migration var; direct CLI authority açık | V2 `gateway-pairing`, critical risk | 10m; `deny-expire`, no grant; scheduled sweep yalnız API composition'da | Pairing decision/timeout receipt | Lifecycle iyi, decision ingress kötü: CLI doğrudan `decidePairing` çağırır |
| 13 | Settlement review | CLI interactive/bulk; MCP review projection read-only | Broker/inbox yok | Review target/decision var; principal/tenant/risk zarfı yok | Pending review için expiry/disposition yok | `.tasks` / `.brain` review state JSON | `LEGACY`; bulk direct write, indefinite pending ve cross-tenant authority kanıtı yok |
| 14 | Rules-engine automated decision | CLI rules apply + xverify polling consumer | Canonical broker ingress; producer değil decision actor | `authorityRef=approval-rules-engine:v1`; request lifecycle risk'i kullanır | Session 120s; rule fresh-load; critical impossible | MAC envelope + idempotency | `CANONICAL`; removable/fail-closed iddiası code-truth ile doğrulandı |
| 15 | Telegram/Slack/Teams live channel decision | Relay cards/bot callback | Canonical ingress ile mint; global consumer validation wiring eksik | `authorityRef=approval-channel:v1`; critical view-only | Request expiry + one-shot nonce + live binding recheck | MAC envelope üretilir | Mint tarafı fail-closed; global verifier channel authenticator taşımadığı için protected consumer/restart doğrulaması kopuk |
| 16 | VS Code approval decision | Panel button → RPC `approval.decide` | Canonical RPC handler hedeflenmiş | Sunucu OIDC ingress ister | Request/session expiry; idempotency mandatory | Sunucu receipt üretir | İstemci `Idempotency-Key` göndermediği için kontrol advertise edilse de fail-closed olarak sürekli reddedilir |

## Federation kapsama farkı

- `FederatedOrigin` yalnız yedi origin taşır: confirmation, autonomous-trigger, nervous, panic-guard, checkpoint, bot-action, gateway-pairing (`src/core/approval-inbox-federation.ts:27-35`). Gate ack'leri, runflow consent ve settlement review bu inbox'ta yoktur.
- Canonical lifecycle config yalnız dört top-level origin taşır: confirmation, autonomous-trigger, gateway-pairing, broker-native (`src/core/config-types.ts:240-245`). Checkpoint ve nervous mirror edilirken top-level `broker-native` olur; özgün origin yalnız serbest-form `details.origin` içinde kalır (`src/orchestra/approval-decision-federation.ts:123-142`). Bu nedenle per-origin risk/TTL/disposition policy'si typed biçimde çözülemez.
- Decision federation yalnız confirmation/checkpoint/nervous/autonomous-trigger origin'lerini kabul eder; panic/bot action ve kalan producer'lar canonical decide yoluna girmez (`src/orchestra/approval-decision-federation.ts:59-69`).

## MCP intentional negative-space

`deckent_approvals` tek başına doğru biçimde read-only'dir (`src/mcp/tools/approvals.ts:13-43`). Fakat server aynı katalogda şu protected write yeteneklerini advertise eder:

- `deckent_checkpoint` → `approve/reject` (`src/mcp/tools/checkpoint.ts:78-120`)
- generic `deckent_autonomous` → `approve/reject` (`src/mcp/tools/autonomous.ts:138-148,394-419`)
- `deckent_autonomous_approve/reject` (`src/mcp/tools/autonomous-approval.ts:59-166`)
- `deckent_nervous_accept/reject`, panic marker dahil (`src/mcp/tools/nervous.ts:452-549`)

Writer lease bu kararları authenticate etmez; yalnız MCP write serialization uygular (`src/mcp/writer-lease-gate.ts:68-96`). Dolayısıyla “MCP protected decision read-only” negatif kanıtı base'te **FAIL** eder.

Plan adoption (`deckent_plan approve:true`) ve one-shot gate ack'leri protected allow/deny ile aynı şey değildir. Ancak typed consent vocabulary ve explicit capability taxonomy oluşana kadar `approve` etiketi MCP negative-space'ini belirsizleştirir; ürün yüzeyi bunları ayrı göstermelidir.
