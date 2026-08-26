# Independent Design Critic Pass — Approval Surface — 2026-08-26

## Verdicts

- **Current product closure:** **NO-GO**
- **Audit artifact quality:** **PASS WITH RUNTIME HOLDS**
- **Formal cross-provider XVerify:** **HOLD / yapılmadı**

Bu pass implementation analizinden sonra ayrı bir sorgulama turu olarak yapıldı. `deckent-design-dna`, `deckent-agentic-ux`, `deckent-enterprise-ux`, `deckent-product-design` ve `deckent-design-critic` ilkeleri uygulandı. Bağımsız provider çağrısı değildir; bu nedenle XVerify/seal diye sunulmaz.

## Critic soruları ve hükümler

### 1. Aynı kullanıcı niyeti her surface'te aynı protected effect'i mi üretir?

**NO-GO.** MCP `run autoApprove=true` defaultu ile CLI false defaultu ayrışır; `approve` hem plan adoption hem protected decision hem permission mode için kullanılır. Checkpoint/autonomous/nervous aynı effect'i canonical CLI auth zinciri dışında üretebilir. APR-002/003/004/009 zayıf semantic parity iddiasını yeterli disk kanıtıyla çürütür.

### 2. Read-only ve capability negative-space kullanıcıya doğru anlatılıyor mu?

**NO-GO.** `deckent_approvals` açıklaması doğru fakat server catalogu renamed protected writers taşır. Dashboard/API GET polling de write yapar. Ürün dili tool-name düzeyinde değil effect/capability düzeyinde doğrulanmalıdır. APR-001/003 yerinde kalır.

### 3. Progressive disclosure güvenliği gizli side entrance yaratmadan sağlıyor mu?

**REVISE.** Critical channel card'ın view-only olması doğru; VS Code non-critical butonları ise gerekli auth/idempotency capability'si olmadan render edilir. Kontrolün görünür ama sürekli başarısız olması “fail-closed” güvenliğini ürün doğruluğuna çevirmiyor. Capability handshake ve nedenli disabled/deep-link state gerekir. APR-008 yerinde kalır.

### 4. Solo'dan enterprise'a tenant/principal/audit ayrımı korunuyor mu?

**NO-GO.** Canonical envelope tenant/principal binding taşırken legacy checkpoint, nervous, gateway ve review stores aynı contractı zorunlu kılmaz. Ham ack booleans target/principal/tenant digest'i bırakmaz. Bu, milyon-scale multi-tenant sistemde forensic attribution ve revocation'ı imkânsızlaştırır. APR-002/004/005/009 severity düşürülemez.

### 5. Approval ve consent aynı kavram mı olmalı?

**Hayır.** Plan adoption, worker permission mode ve budget/scope/prompt exception aynı `allow/deny` protection domain'i değildir. Fakat hepsi explicit intent, target binding, expiry ve receipt ister. Completion planın iki exhaustive family yaklaşımı, rastgele tek broker union'ından daha doğru product modelidir; owner admission kararı açık tutulmuştur.

### 6. Fail-closed iddiaları dürüst mü?

**Kısmen PASS.** Rules engine removability ve channel authenticator local checks code-truth ile doğrulanır. Channel consumer wiring gap'i güvenlik bypass'ı değil, safe denial/availability defect'idir. Audit bunu CRITICAL yerine HIGH sınıflandırarak doğru ayrımı korur. VS Code da missing idempotency'de fail-closed olur; fakat advertised control product-quality defect'idir.

### 7. Lifecycle bütün producer universe'ünde finite ve observable mı?

**NO-GO.** Nullable/absent TTL sınıfları ve API-only expiry driver composition varken D4 completion claim'i yapılamaz. Read sırasında sweep'i kaldırmak tek başına çözüm değildir; all-host driver wiring önce gelmelidir. APR-001 ve APR-006'nın birlikte planlanması zorunludur.

## Critic ile yapılan düzeltmeler

- Gate ack'leri durable pending üretmediği için APR-006'dan çıkarıldı; APR-009'da call-scoped consent/audit gap'i olarak tutuldu.
- Rules-engine için finding açılmadı; mevcut fail-closed davranış positive proof olarak kaydedildi.
- Channel gap “authority bypass” diye abartılmadı; global verifier eksikliği nedeniyle safe-denial wiring defect'i olarak HIGH tutuldu.
- Plan adoption MCP protected-decision leak sayılmadı; ayrı consent capability olarak owner decision listesine taşındı.
- Bot action finite native TTL'si kabul edildi; yalnız federated discovery/timeout receipt gap'i raporlandı.

## Admission guardrails

Ana-şerit hiçbir finding'i yalnız UI label değiştirerek kapatmamalı. Closure; canonical application service, signed authority, finite lifecycle, consumer validation ve exact negative-space proof birlikte olmadıkça `DONE` değildir. Runtime/real-device/cross-platform kanıtları bu salt-analysis artifact'ında yoktur ve admission sırasında typed HOLD olarak korunmalıdır.
