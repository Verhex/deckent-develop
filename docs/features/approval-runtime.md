# Approval Runtime — Runtime-Geneli Canlı Onay Zinciri (APR Pillar)

> **Config:** `approval.gate_enabled` (worker-enforcement) + `approval.api_decide` +
> `approval.authority` + kanal yüzeyleri
> (`repl_surface.approvals`, nervous bridge) · **Default:** tümü off
> **Kaynak:** `src/core/approval-*.ts` (11 modül) + `src/cli/repl/approval-card.tsx` +
> `src/api/` /api/approvals + dashboard ApprovalsPanel · **Doğuş:** sprint-350→356 (APR ailesi)
> **Pivot bağlamı:** "runtime-wide ApprovalBroker — çok-ortam canlı onay" (2026-06-29 pivot P0)

## Ne yapar

Deckent runtime'ının HER katmanından (worker, autonomous engine, bot, REPL) doğabilecek riskli
eylemleri **tek onay omurgasından** geçirir. Zincir:

```
istek → ApprovalBroker.submit() → policy engine → [auto-approve | notify | require-approval | deny]
      → file-backed store (.deckent/approvals/) → relay (kanal fan-out) → karar (decide)
      → eventstream + audit → isteyene verdict
```

| Halka | Modül | Rolü |
|-------|-------|------|
| Contract | `approval-contract.ts` | zod-şema kanon: 7 scope (`file-read/file-write/shell-exec/git-mutation/network/credential/lifecycle`) × 5 risk (`none→critical`) × 4 policy (`auto-approve/notify/require-approval/deny`) × 4 karar (`allow/deny/defer/escalate`). |
| Broker | `approval-broker.ts` | `submit`/`decide`/`awaitDecision` — isteğin yaşam döngüsü. |
| Policy | `approval-policy.ts` + `approval-rules-load.ts` | `.deckent/approvals-rules.json`'dan kural yükler; scope+risk → policy kararı. |
| Store | `approval-store.ts` | Dosya-tabanlı, atomic-write, **restart-survivable** (`.deckent/approvals/`). |
| Relay | `approval-relay.ts` | Kanal fan-out: telegram / terminal / nervous — karar hangi kanaldan gelirse gelsin broker'da tek kez settle olur. |
| Worker gate | `approval-worker-gate.ts` | `guard(action)` — riskli eylem öncesi worker bekler; timeout'ta **fail-closed** fallback (`DENY_FALLBACK_RESOLVER`). |
| Masking | `approval-masking.ts` | Ham argümanlar hiçbir kanala sızmaz — maskelenmiş kopya taşınır. |
| Expiry | `approval-expiry-driver.ts` | Süresi geçen istekleri defaultAction'a düşürür. |
| Attended authority | `approval-authority-runtime.ts` | Landing-unsupported remote execution için approval-only custody, verified live session, immutable proposal ve exactly-once dispatch claim'ini tek process runtime'ında compose eder. |

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `approval.gate_enabled` | `boolean` | `false` | **Enforcement anahtarı** — worker'ların riskli eylem öncesi `WorkerApprovalGate.guard()` çağırmasını açar. Kapalıyken bu genel worker-action gate pasiftir. |
| `approval.api_decide` | `boolean` | `false` | HTTP API karar endpoint'ini açar. Attended execution kararı için tek başına yetki değildir; aşağıdaki authority + verified OIDC de zorunludur. |
| `approval.authority.enabled` | `boolean` | `false` | Approval-only production authority composition'ını açar. Runtime **open-only** çalışır; key üretmez/taşımaz/döndürmez. Eksik veya doğrulanamayan custody durumunda typed HOLD döner. |
| `approval.authority.tenant_id` | `string` | — | Runtime'ın exact tenant binding'i. İstek, OIDC claim'i, karar ve dispatch aynı tenant'a bağlanır. |
| `approval.authority.oidc.*` | object | — | `authority_ref`, tenant/role claim adları, auth/session yaş sınırları ve isteğe bağlı `required_acr`/`required_amr` step-up koşulları. |
| `repl_surface.approvals` | `boolean` | `false` | Terminal'i onay kanalı yapar (kart + karar) — bkz. [repl-surface.md](repl-surface.md). |
| (policy kuralları) | JSON | — | `.deckent/approvals-rules.json`: scope/risk eşleşmesine policy atar; kural yoksa contract default'ları geçerlidir. |

## Açınca ne değişir

- `require-approval` sınıfına düşen eylemler, karar gelene dek (veya timeout'ta fail-closed
  deny'a) bekler; karar telegram butonu, terminal kartı veya nervous üzerinden verilebilir.
- Her istek + karar audit-trail'e ve eventstream'e düşer — kim, neyi, hangi kanaldan onayladı izlenebilir.

## Kapalıyken garanti

Tüm flag'ler off → hiçbir istek doğmaz, hiçbir bekleme oluşmaz; 350-356 task'larının her birinde
flag-off byte-identity kanıtlandı.

## Attended hard-stop güven sınırı

Landing-capable unattended execution bu istisnaya ihtiyaç duymaz. Bir backend yalnız
`unsupported`/hard-stop yoluyla çalışabilecekse:

1. exact tenant/project/run/task/attempt/provider/API-model/backend/budget/policy ve
   task/prompt/scope/acceptance digest'leri host-owned immutable proposal'a yazılır;
2. yalnız signature/issuer/audience/expiry doğrulanmış ve `auth_time`/ACR/AMR politikasını
   geçen OIDC step-up, runtime-wide Broker'a karar yazabilir;
3. final pre-dispatch gate request, decision, live session ve exact proposal'ı yeniden
   doğrulayıp first-writer dispatch claim'i üretir;
4. duplicate/restart invocation mevcut dispatch'i adopt/reconcile edemiyorsa HOLD olur;
   ikinci backend callback açılmaz.

Static bearer, localhost, TTY, OS username, `autoApprove`, REPL literal actor, RPC
`decidedBy` ve MCP stdio attended authority değildir. API, Goal-v2, CLI run/task-mode,
MCP run, sprint initial/queue/fix/respawn ve process yüzeyleri aynı injected runtime'ı
tüketir. Goal-v2 mission-policy approval'ı ile attended execution approval'ı ayrıdır;
iki politika da uygulanıyorsa ikisi de geçmelidir.

Approval decision keyring'i provider truth/limit keylerinden farklı host-global
`keys/approval-decision/v1` domain'indedir ve worker/project mount'larına girmez.
Provisioning/rotation normal runtime'ın işi değildir. Native Windows için doğrulanmış
DACL/DPAPI/CNG adapter'ı bulunana kadar authority dürüstçe HOLD kalır.

## Riskler

- `approval_gate`'i **policy kuralları tanımlamadan** açmak her riskli eylemi contract
  default'una düşürür — önce `.deckent/approvals-rules.json` yazılmalı, sonra flag açılmalı.
- Timeout default 5 dk; kanal kapalıysa (terminal yok, bot down) sonuç fail-closed deny'dır —
  bu kasıtlıdır ("terminal kapalıysa run sonsuza kadar takılmasın", pivot §11.7).

## Kanıt

- Testler: approval-contract/broker/policy/store/relay/eventstream/worker-gate/fallback/masking/
  rules-load/expiry-driver aileleri (sprint 350-356; hermetik in-memory broker fake ile).
- Attended authority: approval-only keyring/session/OIDC/proposal/receipt/dispatch-claim
  testleri; gerçek HTTP OIDC decision → process reopen → exact single-claim kanıtı.
- Canlı provider/paid worker canary yoktur; key provisioning/rotation ve rollout
  owner/admin kapısıdır.
