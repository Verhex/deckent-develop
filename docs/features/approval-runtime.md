# Approval Runtime — Runtime-Geneli Canlı Onay Zinciri (APR Pillar)

> **Config:** `approval_gate` (worker-enforcement) + `approval.api_decide` + kanal yüzeyleri
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

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `approval_gate` | `boolean` | `false` | **Enforcement anahtarı** — worker'ların riskli eylem öncesi `WorkerApprovalGate.guard()` çağırmasını açar. Kapalıyken zincir pasiftir (istek üretilmez). |
| `approval.api_decide` | `boolean` | `false` | HTTP API üzerinden karar vermeyi (`decide`) açar. Kapalıyken `/api/approvals` **salt-izleme**dir. |
| `repl_surface.approvals` | `boolean` | `false` | Terminal'i onay kanalı yapar (kart + karar) — bkz. [repl-surface.md](repl-surface.md). |
| (policy kuralları) | JSON | — | `.deckent/approvals-rules.json`: scope/risk eşleşmesine policy atar; kural yoksa contract default'ları geçerlidir. |

## Açınca ne değişir

- `require-approval` sınıfına düşen eylemler, karar gelene dek (veya timeout'ta fail-closed
  deny'a) bekler; karar telegram butonu, terminal kartı veya nervous üzerinden verilebilir.
- Her istek + karar audit-trail'e ve eventstream'e düşer — kim, neyi, hangi kanaldan onayladı izlenebilir.

## Kapalıyken garanti

Tüm flag'ler off → hiçbir istek doğmaz, hiçbir bekleme oluşmaz; 350-356 task'larının her birinde
flag-off byte-identity kanıtlandı.

## Riskler

- `approval_gate`'i **policy kuralları tanımlamadan** açmak her riskli eylemi contract
  default'una düşürür — önce `.deckent/approvals-rules.json` yazılmalı, sonra flag açılmalı.
- Timeout default 5 dk; kanal kapalıysa (terminal yok, bot down) sonuç fail-closed deny'dır —
  bu kasıtlıdır ("terminal kapalıysa run sonsuza kadar takılmasın", pivot §11.7).

## Kanıt

- Testler: approval-contract/broker/policy/store/relay/eventstream/worker-gate/fallback/masking/
  rules-load/expiry-driver aileleri (sprint 350-356; hermetik in-memory broker fake ile).
- Canlı: dashboard ApprovalsPanel + `GET /api/approvals` (izleme) landed; decide-API flag'li bekliyor.
