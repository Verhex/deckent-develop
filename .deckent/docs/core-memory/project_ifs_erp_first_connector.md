---
name: project_ifs_erp_first_connector
description: "İlk ERP connector = IFS ERP (Alperen 2026-06-11). 🟢 read-side LANDED 2026-06-15: IFS driver + modüler src/core/erp/ + config→connector binding process/autonomous'a wire (erp.read canlı, opt-in, secret-from-env); erp.write AYRI ARC; gerçek IFS round-trip post-beta"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

**Karar (Alperen, 2026-06-11, faz-2 core-analizi sırasında):** Deckent'in **ilk gerçek ERP connector'ı IFS ERP** olacak. Beta sonrası **IFS ERP test-ortamında enterprise testlere** başlanacak.

**Bağlam:** core/ dormant-taraması `erp-driver-{sap,odoo,dynamics}` (680 LoC) üçlüsünün yazılmış ama `erp-connector.ts` ErpDriver-seam'ine hiç register edilmediğini buldu. Bu üçlü referans/iskelet; **canlı hedef IFS** — seam'in ilk gerçek tüketicisi `erp-driver-ifs` olur.

**🟢 read-side LANDED (2026-06-15, read-first — commit `103f99d4` + `e0ac534c`):**
- **IFS Cloud OData driver** `src/core/erp/ifs/driver.ts` = seam'in ilk gerçek tüketicisi (projection-REST `/main/ifsapplications/projection/v1/<Proj>/<Entity>`, IFS-IAM bearer, read-only re-check, secret redaction, hermetik injectable-fetch, 8 test). odoo/sap/dynamics = reference-impl.
- **Modüler `src/core/erp/` modülü** (Alperen kararı: "tüm erpler modüler, her erp ayrı component"): `connector.ts`/`handler.ts`/`factory.ts`/`index.ts` + per-vendor `ifs|odoo|sap|dynamics` klasörleri. ADR-008-güvenli (core→core); MOD-SPLIT'e (deckent-solo/enterprise) hazır tek `index.ts` yüzeyi — ileride enterprise-layer'a tek-parça taşınır.
- **Binding** `buildErpConnectorFromConfig(cfg, env)` (driver-agnostic ifs/odoo/sap/dynamics/in-memory) **process-runtime + autonomous runtime-loop'a wire** → `config.erp.enabled` ise `{erp:{connector}}` ile erp.read handler kurulur. **Opt-in/geriye-uyumlu**; **secret HER ZAMAN env'den** (`tokenEnv`, default `DECKENT_ERP_TOKEN`) — credential asla config.json'da. `erp?` config-types + ResolvedConfig + her iki loadConfig projeksiyonuna eklendi (config-strip deseni).
- **Real-binary kanıt**: `deckent serve` + config.erp(in-memory) → POST /api/process/submit erp.read → `status:"completed"` (handler kurulmasa "failed"). Her erp.read → ENT-3 audit hash-chain (fine-tune trace-data). Doküman `docs/reference/enterprise-depth.md §12` (config şablonu + read-only sözleşme). MASTER-PLAN CORE-W5 = `[x]` read-side.
- **read-first kararı**: erp.write park-gated kaldı (driver'lar tasarımca read-only).

**Kalan:** (a) **gerçek IFS round-trip** = IFS test-ortamı creds + entity/projection haritası (post-beta, ARC-I); (b) **erp.write = AYRI ARC** — read-only invariant'ı 4 katmanda ters çevirir + geri-dönülmez harici-mutasyon (kayıt-sistemi) → CompiledMutation + per-vendor write-driver (CSRF/ETag/idempotency) + sert approval-gate (EffectClass critical-irreversible) + compensation/dry-run + ayrı write-credential; gerçek ERP test-ortamı olmadan doğrulanamaz.

**İlişkili:** [[project_deckent_everyone_everywhere]] (ERP senaryosu), [[project_autonomous_first_dogfood_grand_vision]] (erp.read capability), [[project_community_pro_split_strategy]] (enterprise-layer / MOD-SPLIT). MASTER-PLAN CORE-W5 + ARC-I.
