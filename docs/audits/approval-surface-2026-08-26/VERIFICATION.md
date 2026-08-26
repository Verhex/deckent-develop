# Approval Surface Audit Verification — 2026-08-26

## Frozen scope

- Base/head code truth: `9a05b96b6421da120f28df4461f38661f09df015`
- Branch: `lane/approval-audit-20260826`
- Worktree: `/tmp/deckent-lane-approval-audit`
- Mode: salt-okuma/statik analiz. Production code, tests, config, `.deckent`, `.brain`, sprint/run/approval state'i mutate edilmedi.
- Source custody: `EVIDENCE-MANIFEST.json` 42 source/protocol dosyası ve 9 MASTER WorkID satırı için SHA-256 taşır.

## Altı exact cevap

### Q1: ANSWERED — Read yolunda mutation kaldı mı?

**Evet.** `GET /api/approvals` (`src/api/server.ts:1428-1432`) ve `GET /api/approvals/:id` (`src/api/server.ts:1454-1464`) read request sırasında `persistPolicyTransitions()` + `sweepExpired()` çağırır; bunlar receipt/decision file yazabilir. Ayrıca `ApprovalStoreWatch` poll'u (`src/core/approval-store-watch.ts:118-128`), nervous store list helper'ı (`src/nervous/approval-bridge.ts:259-273`) ve gateway pair list (`src/cli/commands/gateway.ts:68-82`) sweep ile state mutate eder. Yalnız `readPendingApprovals` runtime projection düzeltmesi gerçekten saf kalmıştır (`src/core/pending-approvals.ts:118-138,192-199`). Hüküm: 4050 residual **OPEN**, 4056-D4 discovery-purity claim'i entrypoint-wide kapanmamış.

### Q2: ANSWERED — Checkpoint bypass bugün ne kadar geniş?

**CLI ve MCP hâlâ direct JSON mutate ediyor.** CLI `writeFileSync` (`src/cli/commands/checkpoint.ts:48-61`) ve MCP eşdeğeri (`src/mcp/tools/checkpoint.ts:52-74`) approve/reject için canonical decision ingress'i atlıyor. Federation settle-back seam'i mevcut (`src/orchestra/approval-decision-federation.ts:590-602`) fakat bu handlers ona bağlı değil. Integration cost: reusable decision application service extraction + checkpoint typed origin/lifecycle + CLI TTY delegation + MCP decision removal + CAS settle-back + catalog/i18n/tests. Hüküm: CFG-004 **CONFIRMED / CRITICAL**.

### Q3: ANSWERED — 10+ producer matrixi tamam mı?

**Evet, 16 satırlık matrix üretildi; product zinciri tamam değil.** `SURFACE-MATRIX.md` 13 business producer sınıfını ve 3 decision-channel/consumer sınıfını broker, federation, origin/risk, TTL/disposition ve receipt eksenlerinde gösterir. Yedi federated origin ile dört lifecycle origin bütün universe'ü kapsamaz. Gate ack, runflow ve settlement review inbox/broker dışında; nervous/panic/checkpoint/runflow/review finite lifecycle eksiği taşır.

### Q4: ANSWERED — MCP protected decision negative proof geçiyor mu?

**Hayır, FAIL.** `deckent_approvals` read-only olsa da checkpoint, autonomous ve nervous/panic MCP tools protected karar/effect üretir. Server bunları aynı catalogda advertise eder (`src/mcp/server.ts:72-103`). Writer lease authentication değildir. Plan adoption ve routine ack ayrı consent sınıflarıdır; bunların adlandırılması da CFG-017 nedeniyle typed ayrım ister.

### Q5: ANSWERED — Rules engine ve channel authenticator drift etti mi?

**Rules engine core claim'i PASS:** yalnız `provider-evidence-probe` automatable; critical asla değil; rule her mint/validate'te fresh-load edilir; edit/disable/remove digest/session'ı öldürür (`src/core/approval-rules-engine.ts:53-146`). **Channel authenticator local claim'i PASS:** critical/malformed deny, one-shot nonce, expiry, binding ve live authorization recheck sürer (`src/core/approval-channel-authenticator.ts:46-155`). **Fakat channel production consumer wiring'i REVISE:** global authority channel verifier taşımadığı için persisted channel envelope restart/downstream validation'da fail-closed olur (`src/core/approval-authority-runtime.ts:157-161,261-281`). Güvenlik gevşemesi yok; end-to-end D3 closure yok.

### Q6: ANSWERED — Süresiz pending sınıfı kaldı mı?

**Evet.** Nervous `timeoutMs=null`, panic ve checkpoint expiry'siz rows, runflow `AWAITING_APPROVAL` ve settlement review pending kayıtları finite disposition taşımıyor. Bot action 1h native TTL taşısa da federated inbox expiry/timeout settlement'ı yansıtmıyor. Üstelik expiry driver yalnız API server production composition'ında instantiate ediliyor. Hüküm: D4 universe-wide closure **FAIL**.

## Yöntem

1. Brief/protocol, AGENTS authority, Deckent identity, current owner decisions, North Star/reconciliation kaynakları ve ilgili Deckent design/agentic/enterprise/product/critic skill talimatları eksiksiz okundu.
2. Producer discovery; `approval`, `approve`, `reject`, `accept`, `decide`, `acknowledge`, `sweepExpired`, `persistPolicyTransitions`, `ApprovalExpiryDriver` sembolleriyle core/orchestra/CLI/MCP/API/connectors/VS Code yüzeylerinde yapıldı.
3. Her bulgu producer→ingress→durable state→consumer/settle-back call chain'iyle doğrulandı. Bir yorum veya tool annotation tek başına kanıt sayılmadı.
4. Historical CFG-004/017 kayıtları `git show d2e9a1247:.../DRIFT-REGISTER.md` ile okundu; current code üzerinde yeniden doğrulandı.
5. Bulgular bağımsız critic pass'te security boundary, product truthfulness, enterprise tenancy, lifecycle ve cross-surface semantics eksenlerinde yeniden sorgulandı (`CRITIC-REVIEW.md`).
6. Source ve MASTER WorkID content digests fail-closed validator'a bağlandı; MASTER line-number pin'i kullanılmadı.

## Koşulan read-only komut sınıfları

```text
git -C /home/alperen/deckent-dev fetch origin
git -C /home/alperen/deckent-dev worktree add /tmp/deckent-lane-approval-audit -b lane/approval-audit-20260826 origin/main
git fetch origin && git rebase origin/main
git status --short
git rev-parse HEAD
git rev-parse origin/main
rg -n / rg --files (producer, mutation, expiry, authority ve WorkID discovery)
nl -ba <source> | sed -n <bounded ranges>
git show --stat --oneline d2e9a1247
git show d2e9a1247:<config-audit-drift-register>
sha256sum <audited sources>
node --input-type=module -e <WorkID content digest calculation>
```

Final artifact verification ve git allowlist sonuçları bu dosyanın sonundaki `Settlement verification` bölümüne settlement commit'inden önce işlenecektir.

## HOLD / koşulmayan kanıtlar

- Live approval/decision/checkpoint üretme özellikle yasaktı; hiçbir happy-path live decision koşulmadı.
- Sprint/run/state mutation, build, production test battery ve real binary çalıştırılmadı; salt-analysis brief'i bunları authorize etmiyor.
- Telegram/Slack/Teams gerçek-cihaz, VS Code extension-host ve multi-process restart proof koşulmadı. Bunlar completion plan exit criteria'sıdır.
- Different-provider XVerify yapılmadı. `CRITIC-REVIEW.md` role-separated statik critic pass'tir; formal independent-provider seal değildir.
- Windows native/WSL/macOS storage/CAS ve million-scale benchmark mevcut code üzerinde bu lane'de yeniden koşturulmadı.

Bu HOLD'lar bulguları zayıflatmaz; production closure veya runtime PASS iddiası kurulmasını engeller.

## Settlement verification

Bu bölüm final doğrulama turunda exact sonuçlarla güncellenecektir.
