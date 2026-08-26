# Approval Surface Drift Register — 2026-08-26

## Özet

Current product closure verdict: **NO-GO**. Dedup sonrası 9 finding vardır: 3 CRITICAL, 6 HIGH. Bulgular yalnız audited base `9a05b96b6421da120f28df4461f38661f09df015` için code-truth hükmüdür; production edit yapılmamıştır.

Severity tanımı: `CRITICAL` protected effect'in auth/tenant/decision boundary'sini aşar veya read-only promise'ini tersine çevirir; `HIGH` lifecycle, surface veya producer parity'sini güvenilmez kılar. Product disposition'ın tamamı mevcut MASTER WorkID'lerine bağlanır; yeni ledger satırı önerilmez.

## APR-001 — Read/discovery yolu hâlâ state mutate ediyor

- **Severity / disposition:** HIGH · `BLOCKS_CURRENT_DONE` · WorkID 4050 + 4056/D4.
- **Kanıt:** `GET /api/approvals` çağrısı `persistPolicyTransitions()` ve `sweepExpired()` çalıştırır (`src/api/server.ts:1425-1443`); `GET /api/approvals/:id` aynısını yapar (`src/api/server.ts:1452-1470`). Bu iki fonksiyon policy/timeout receipt ve decision file yazabilir (`src/core/approval-store.ts:622-660,700-727`). `ApprovalStoreWatch.runScan` her poll öncesi write sweep yapar (`src/core/approval-store-watch.ts:66-70,118-128`). `listNervousPendingFromStore` de listeleme sırasında sweep eder (`src/nervous/approval-bridge.ts:259-273`). Gateway CLI `pair list` expiry sweep çağırır (`src/cli/commands/gateway.ts:68-82`). Buna karşılık `readPendingApprovals` runtime projection'ı artık saftır (`src/core/pending-approvals.ts:118-138,192-199`).
- **Etki:** Dashboard/Desktop polling, bot/REPL watcher veya operator `list` çağrısı disk state'i ve receipt'leri değiştirebilir. D4 “discovery purity” mührü bütün entrypoint'leri kapsamıyor.
- **Ana-şerit exact diff:** API GET, watcher scan, nervous list ve gateway list'ten lifecycle write çağrılarını kaldır. Önce `ApprovalExpiryDriver`ı API'ye özgü composition olmaktan çıkarıp bütün long-lived host composition'larında tek instance/lease ile wire et; kısa-ömürlü CLI için explicit maintenance command veya host service kullan. Read projection overdue satırı görünür ama actionable olmayan typed `expired_projected` olarak döndürsün; durable settlement yalnız driver/decision service yapsın. Read-only filesystem regression testleri API list/detail, watcher, nervous ve gateway list için zorunlu olsun.
- **Kabul kanıtı:** pre/post recursive file digest eşitliği; overdue fixture'da GET/list başarılı, zero write; ayrı driver tick'i tam bir FWW timeout receipt üretir.

## APR-002 — Checkpoint CLI/MCP doğrudan JSON authority'si

- **Severity / disposition:** CRITICAL · `BLOCKS_CURRENT_DONE` · WorkID 4054 + 4056/D2/D5; CFG-004 doğrulandı.
- **Kanıt:** CLI `updateCheckpointStatus` JSON'u okuyup `status` alanını değiştirerek `writeFileSync` yapar; approve/reject handler'ları doğrudan bunu çağırır (`src/cli/commands/checkpoint.ts:48-61,135-173`). MCP eşdeğeri aynı direct overwrite'ı yapar ve schema `approve/reject` advertise eder (`src/mcp/tools/checkpoint.ts:52-74,78-120`). Federation settle-back seam'i vardır (`src/orchestra/approval-decision-federation.ts:590-602`) fakat bu girişler ona delege edilmez.
- **Etki:** principal, tenant, riskTier, request revision/digest, expiry, one-shot nonce, live-auth ve idempotency olmadan protected checkpoint effect'i authorize edilir; unknown-ID/CAS yarışları file overwrite semantiğine düşer.
- **Ana-şerit exact diff:** `approvals decide` içindeki canonical target-resolution → mirror → authenticated ingress → settle-back akışını reusable application service'e çıkar. CLI checkpoint approve/reject yalnız TTY/live-auth ile bu servise delege etsin. MCP checkpoint schema'sından approve/reject kaldırılıp list/get projection bırakılmalı. Checkpoint producer V2 `checkpoint` origin + riskTier + finite policy ile broker'a yazmalı; settle-back yalnız doğrulanmış decision envelope ve expected source digest/CAS ile JSON consumer durumunu güncellemeli.
- **Dokunuş haritası:** `src/cli/commands/approvals.ts`, `src/cli/commands/checkpoint.ts`, `src/mcp/tools/checkpoint.ts`, `src/mcp/server.ts`, `src/mcp/tools/index.ts`, `src/orchestra/approval-decision-federation.ts`, lifecycle config/types, i18n catalog, checkpoint/approval CLI+MCP+federation tests ve CLI help surface contractları.
- **Kabul kanıtı:** direct `writeFileSync` karar yolu sıfır; TTY happy path signed envelope + settle-back; tenant/tamper/replay/expired/CAS race fail-closed; MCP negative test tool catalogunda checkpoint decision capability bulamaz.

## APR-003 — MCP protected-decision negative-space'i isim değiştirmiş araçlarla delik

- **Severity / disposition:** CRITICAL · `BLOCKS_CURRENT_DONE` · WorkID 4054, 4056/D2/D5, 4060.
- **Kanıt:** `deckent_approvals` read-only olsa da MCP checkpoint, generic autonomous, dedicated autonomous approve/reject ve nervous accept/reject araçları protected effect üretir (`src/mcp/tools/checkpoint.ts:78-120`; `src/mcp/tools/autonomous.ts:138-148,394-419`; `src/mcp/tools/autonomous-approval.ts:59-166`; `src/mcp/tools/nervous.ts:452-549`). Server bunları `deckent_approvals`ın “deciding is CLI-only” açıklamasıyla aynı katalogda advertise eder (`src/mcp/server.ts:72-103`). Panic accept kolu accepted marker da yazar (`src/mcp/tools/nervous.ts:477-500`).
- **Etki:** Capability adı değişse de protection boundary değişmez. MCP caller human step-up olmadan autonomous, nervous, checkpoint ve panic effect'lerini authorize edebilir.
- **Ana-şerit exact diff:** MCP registry için semantic capability class üret: `approval.read`, `consent.ack.routine`, `protected-decision.write`. MCP manifest/registration gate'i son sınıfı fail-closed reddetsin; legacy decision tool'larını kaldır veya read-only projection/deep-link'e çevir. Tool annotations'a güvenme; registration-time generated negative allowlist + AST/contract test kullan. `plan-adoption` ve ack türlerini protected decision'dan ayrı typed consent olarak açıkça sınıflandır.
- **Kabul kanıtı:** tüm registered MCP tool şemalarının recursive capability taraması; protected decision action/handler sıfır; bypass isimleri ve aliases için negative tests; writer lease'in auth kanıtı sayılmadığını pinleyen test.

## APR-004 — Federation additive kaldı; legacy side entrances authoritative

- **Severity / disposition:** CRITICAL · `BLOCKS_CURRENT_DONE` · WorkID 4054 + 4056/D2/D5 + 4130.
- **Kanıt:** CLI autonomous `gate.accept/reject`i doğrudan çağırır (`src/cli/commands/autonomous.ts:1700-1720`); CLI nervous/panic IPC/marker state'ini doğrudan değiştirir (`src/cli/commands/nervous.ts:566-680`); gateway pair approve/reject `access.decidePairing`e doğrudan gider (`src/cli/commands/gateway.ts:84-141`). Federation mirror/settle-back varlığı bu side entrance'ları emekli etmemiştir. Confirmation CLI'nin yalnız canonical komuta yönlendirmesi doğru emeklilik desenidir (`src/cli/commands/confirmations.ts:137-151`).
- **Etki:** Aynı logical request hem verified broker ingress hem legacy direct store üzerinden karara bağlanabilir; first-writer, idempotency, principal ve audit anlamı entrypoint'e göre değişir.
- **Ana-şerit exact diff:** Her origin için tek application-service karar portu oluştur; legacy CLI/API/channel handlers yalnız bu porta delege etsin. Store methodlarını `settleBackVerifiedDecision(envelope, expectedDigest)` dışında package-private yap; direct mutation importlarına production lint ratchet koy. Confirmation emeklilik desenini autonomous/nervous/gateway/panic'e uygula. Panic safety-floor için owner-approved ayrı critical policy kullan; MCP yazma açma.
- **Kabul kanıtı:** producer başına tek ingress call graph; direct store decision imports sıfır; same request için concurrent multi-surface FWW/CAS; legacy commands parity ile aynı durable result, fakat auth'suz çağrı fail-closed.

## APR-005 — Inbox/origin envelope “tüm producer” iddiasını karşılamıyor

- **Severity / disposition:** HIGH · `BLOCKS_CURRENT_DONE` · WorkID 4056/D1/D4 + 4210.
- **Kanıt:** federated inbox type'ı yalnız yedi origin taşır (`src/core/approval-inbox-federation.ts:27-35`) ve reader yalnız bunları birleştirir (`src/core/approval-inbox-federation.ts:342-354`). Cost/prompt/scope ack, runflow consent ve settlement review görünmez. Canonical lifecycle origins yalnız dörttür (`src/core/config-types.ts:240-245`). Checkpoint/nervous mirror'i typed origin yerine `broker-native` kullanır (`src/orchestra/approval-decision-federation.ts:123-142`).
- **Etki:** “tek inbox / origin bazlı policy” claim'i producer universe'ünü temsil etmez; risk/TTL/disposition config'i serbest-form details alanına güvenmek zorunda kalır.
- **Ana-şerit exact diff:** Önce owner semantic kararına göre exhaustive discriminated union üret: protected approval origins ve ayrı consent kinds. Inbox projection, lifecycle policy, federation, config schema, surface catalog ve receipts aynı generated descriptor registry'den türesin. Unknown producer/kind fail-closed `quarantined`, asla `broker-native` fallback olmasın.
- **Kabul kanıtı:** exhaustive compile-time switch + runtime unknown quarantine; matrixteki her producer için source→inbox→decision/consent→consumer chain; origin-specific policy round-trip.

## APR-006 — D4 finite-lifecycle kapsamı tamamlanmadı

- **Severity / disposition:** HIGH · `BLOCKS_CURRENT_DONE` · WorkID 4056/D4 + 475.
- **Kanıt:** nervous `timeoutMs` nullable (`src/core/nervous-types.ts:105-139`) ve prune yalnız numeric timeout'ı işler (`src/nervous/approval-bridge.ts:232-249`); panic/checkpoint inbox rows expiry taşımaz (`src/core/approval-inbox-federation.ts:198-262`). Runflow awaiting-approval contractında expiry/disposition yoktur. Settlement review state'i pending timestamp taşır fakat TTL yoktur (`src/cli/commands/review.ts:14-28,328-370`). Bot action native 1h TTL taşısa da federated row expiry'yi projekte/settle etmez (`src/connectors/bot-action-store.ts:20-73,94-145`; `src/core/approval-inbox-federation.ts:264-289`). `ApprovalExpiryDriver`ın tek production constructor'ı API server'dadır (`src/api/server.ts:2575-2646`).
- **Etki:** API server çalışmayan host composition'larında lifecycle settlement polling write'larına bağımlıdır; nervous/panic/checkpoint/runflow/review süresiz kalabilir, bot inbox stale görünür.
- **Ana-şerit exact diff:** Her durable pending/consent type'ına finite effective expiry, typed disposition ve lifecycle generation ekle. Config-resolved policy hiçbir origin/kind için `null/infinite` kabul etmesin. Driver'ı cross-host singleton/lease service olarak compose et; expired projection ile durable settle'ı ayır. Bot stale row için timeout receipt üret. Million-scale bounded index/scan ve clock-skew adapter'ı tanımla.
- **Kabul kanıtı:** producer universe'ünde `expiresAt`/disposition eksik satır sıfır; driver olmadan host start fail-closed/degraded; fake-clock timeout/no-replay/restart/CAS; 10k+ pending bounded sweep.

## APR-007 — Channel authenticator fail-closed, fakat consumer authority wiring'i eksik

- **Severity / disposition:** HIGH · `BLOCKS_CURRENT_DONE` · WorkID 4054 + 4056/D3.
- **Kanıt:** channel authenticator critical/malformed risk'i reddeder; nonce tüketir, request expiry/binding/live authorization'ı mint ve validate anında yeniden kontrol eder (`src/core/approval-channel-authenticator.ts:46-50,98-155`). Ancak global `decisionAuthority` yalnız base + rules authenticator ile kurulur (`src/core/approval-authority-runtime.ts:157-161`). `decideChannel` ephemeral channel authenticator'lı ingress yaratır (`src/core/approval-authority-runtime.ts:261-281`), fakat protected consumers global authority ile validation yapar (`src/core/attended-execution-approval.ts:653,801`). Channel authenticator yoksa ingress authorityRef routing'i base session'a düşüp fail-closed olur (`src/core/approval-decision-ingress.ts:308-315`).
- **Etki:** Button tap signed karar üretebilir, fakat restart veya downstream protected-effect consumer bunu güvenilir sayamaz. Güvenli red vardır; D3 end-to-end closure yoktur.
- **Ana-şerit exact diff:** Durable/reconstructable channel authority verifier registry'yi runtime global authority'nin channel slot'una inject et. Session proof chat/tenant/principal/binding/request digest/nonce generation/expiry'ye bağlı olsun; revocation live recheck sürsün. Ephemeral in-memory nonce production authority olmasın. Unknown/restart-missing verifier asla base auth'a fallback etmesin.
- **Kabul kanıtı:** mint→persist→process restart→consumer validation happy path; revoke/expired/replay/tamper/unknown binding fail-closed; critical card view-only; Telegram/Slack/Teams gerçek-cihaz ayrı receipt.

## APR-008 — VS Code karar kontrolü advertise ediliyor ama zorunlu ingress kanıtını göndermiyor

- **Severity / disposition:** HIGH · `BLOCKS_CURRENT_DONE` · WorkID 4056/D3 + 4130 + 6120.
- **Kanıt:** panel non-critical satırlarda allow/deny button render eder (`src/extensions/vscode/src/deckent-panel.ts:153-167`). RPC bridge body gönderir ama yalnız `Content-Type` ve static `Authorization` header'ı ekler; `Idempotency-Key` yoktur (`src/extensions/vscode/src/rpc-bridge.ts:98-127`). Server RPC handler missing idempotency'yi karardan önce reddeder ve fresh OIDC ister (`src/api/rpc-write-handlers.ts:174-211`). Route ayrıca config flag'e bağlıdır (`src/api/server.ts:1555-1574`).
- **Etki:** Kontrol görünürken deterministik olarak başarısızdır; static API token fresh human session kanıtı değildir. Kullanıcı “karar verdim” zannedebilir.
- **Ana-şerit exact diff:** Panel capability handshake ile `canDecide` + reason alsın; fresh OIDC/step-up session ve one-shot idempotency key olmadan controls görünmesin veya disabled + actionable deep-link olsun. Bridge header/body contractını generated API client'tan üret. Critical her zaman view-only kalsın.
- **Kabul kanıtı:** enabled flag + fresh OIDC + idempotency ile real extension-host decision; missing/expired/replay disabled/fail-closed; static token never upgrades; accessibility status announcement.

## APR-009 — Consent vocabulary ve defaults surface'e göre anlam değiştiriyor

- **Severity / disposition:** HIGH · `BLOCKS_CURRENT_DONE` · WorkID 4056 + 4210 + 6120; CFG-017 doğrulandı.
- **Kanıt:** MCP `deckent_run autoApprove` default `true` (`src/mcp/tools/run.ts:44-54`), CLI `run` default `false` (`src/cli/commands/run.ts:468-479`). MCP start ack booleans taşır ve prompt ack'in fork child'a ulaşmadığını kod yorumu açıkça söyler (`src/mcp/tools/start.ts:73-106`). MCP plan `approve:true` ile plan adoption/persistent runflow state üretir (`src/mcp/tools/plan.ts:43-130`); CLI `--yes` interrogation ve plan adoption'ı birlikte auto-confirm eder (`src/cli/commands/plan.ts:211-236,604`). Cost/scope/prompt gates authority receipt yerine boolean okur (`src/core/cost-gate.ts:35-72,112-219`; `src/core/scope-gate.ts:50-71,609-655`; `src/orchestra/prompt-gate.ts:48-73,389-460`).
- **Etki:** Aynı operator intent surface'e göre permission posture, persistence ve gate bypass davranışı değiştirir. “approve” sözcüğü protected decision, plan adoption ve worker tool permission'ı birbirine karıştırır.
- **Ana-şerit exact diff:** `ConsentIntent` discriminated union tanımla: `plan-adoption`, `worker-permission-mode`, `budget-override`, `scope-exception`, `prompt-quality-exception`, `checkpoint-decision`. Her record target/revision/digest/principal/tenant/surface/issuedAt/expiresAt/idempotency/auditRef taşısın; defaultlar descriptor registry'den üretilecek ve tüm surfaces aynı explicitness'i kullanacak. Unsupported propagation girişte typed reject olsun, sessiz no-op olmasın.
- **Kabul kanıtı:** CLI/MCP/API/Desktop contract snapshot parity; omitted/false/true üçlüsü behavior proof; prompt ack fork propagation; plan adoption ile protected decision capability'leri birbirinin yerine kullanılamaz.

## Dedup ve dışarıda bırakılan iddialar

- APR-002 yalnız checkpoint exact bypass'ıdır; APR-003 MCP-wide negative-space; APR-004 ise MCP dışındaki systemic legacy side entrances. Aynı satırlar yalnız cross-reference edilir, finding sayısı şişirilmez.
- Gate ack'leri durable pending üretmediği için “süresiz pending” diye sayılmadı; APR-009 consent/audit authority gap'i olarak sınıflandı.
- MCP `review auto` projection'ında persistence kanıtı bulunmadı; protected decision leak diye raporlanmadı.
- Rules-engine için drift finding açılmadı: allowlist, critical deny, fresh load ve removal/digest revalidation code-truth'te duruyor. Channel finding güvenlik bypass'ı değil, fail-closed production wiring gap'idir.
