# Çapraz Doğrulama — `docs/audits/` 9-doküman authority-design seti (2026-08-06)

> **Bu oturumun yetkisi:** saf analiz · kontrol · düzenleme-önerisi. Kod değişikliği YOK,
> 9 dokümana in-place edit YOK. Bulgular tek approval batch'i olarak §10'da toplanır.
>
> **Devir hedefi:** ana iş-planı (MASTER-PLAN) session'ı — §11 doğrudan girdi.
>
> **MCP kapsam dışı (owner kararı, 2026-08-06):** MCP yüzeyindeki eksikler MCP güncellemesi
> sonrasına bırakıldı. Bu doküman MCP'yi analiz etmez; yalnız *MCP'ye bağlı deferred-dependency
> kenarlarını* §8'de işaretler.
>
> **Metod:** her doküman baştan sona okundu (11.001 satır / 544KB). Doğrulama üç kanaldan yapıldı:
> (a) code-truth atıflarının HEAD'e karşı kontrolü, (b) dokümanlar-arası seam/contract karşılaştırması,
> (c) MASTER-PLAN §7 ledger ID resolve + durum kontrolü.

## İçindekiler

| Bölüm | İçerik |
|---|---|
| §0 | Doğrulama tabanı (HEAD, hacim, mekanik ön-kontrol) |
| **§A** | **Okuma kaydı** — 9 doküman, okuma sırasıyla (A1–A9) |
| §1 | Doküman seti haritası + Bulgu numarası boşlukları |
| §2 | Authority seam register + 6 katmanlı ayrım |
| §3 | **Code-truth doğrulama sonuçları** (22 iddia, HEAD'e karşı) |
| §4 | Çatışma/boşluk register (C · D · U · O · **M**) |
| §5 | Birleşik DAG + doküman-arası dosya çakışması |
| §6 | MASTER-PLAN eşleme doğrulaması |
| §7 | Yasa ve kontrat conformance |
| §8 | MCP deferred-dependency kenarları |
| §9 | **Alperen kararı gerektiren maddeler (K1–K10)** |
| §10 | Önerilen doküman düzeltmeleri (E1–E14, uygulanmadı) |
| §11 | **Ana iş-planı session'ına devir girdisi** |
| §12 | **Komşu analiz korpuslarıyla reconciliation** (`codex-analysis/`, DOGFOOD-*, OWASP prompt) |
| **§13** | **Owner karar kaydı — Alperen, 2026-08-06 (BAĞLAYICI)** |
| §14 | K7 reddi — kabul edilen risk + MASTER-PLAN borç kaydı |
| §15 | K2-c — ApprovalBroker gereksinim matrisi (23 gereksinim × 7 doküman) |
| §16 | K5a — ADR crosswalk + ⚠️ **yeniden değerlendirme ihtiyacı** |
| **§17** | **Akıştaki session'a devir — detaylı iş planı (T1–T7)** |
| §18 | Codex OWASP transkripti — alım + çapraz doğrulama planı (X1–X8) ✅ |
| §19 | Transkript çapraz doğrulama SONUCU — 4 sahipsiz bulgu + 1 yeni kod bulgusu |
| **§20** | **DEVİR KAPANIŞI — bağlanmış kararlar + devir prompt'u** |

## 0. Doğrulama tabanı

| Alan | Değer |
|---|---|
| Branch | `train-2026-08-06-o` |
| HEAD | `77bc721ae` |
| Doküman seti | `docs/audits/*.md` — 9 dosya, untracked (`?? docs/audits/`) |
| Toplam hacim | 11.001 satır |
| Atıf sayısı | 253 `path:line` atıfı, 160 tekil dosya yolu |
| Yeni-dosya önerisi | 16 yol (diskte yok — beklenen; design proposal) |

**Mekanik ön-kontrol sonuçları (§3 detay):**

- 160 tekil atıflı yoldan 144'ü diskte mevcut; 16'sı dokümanların *önerdiği yeni* modül.
- Seam sembolleri kod-tarafında henüz yok (`LandingAuthority`, `ToolAuthority`, `PluginAdmission`,
  `EffectLedger`, `ProjectInventory`, `ContentProvenance`, `PrincipalAuthority`,
  `ProtectedMutation`, `ArtifactAdmission`, `TerminalProfile`, `RollingSpend`, `AuditAuthority`
  → 0 src dosyası). Tek istisna: **`ApprovalBroker` 42 src dosyasında mevcut** — yani
  terminal-session §12'nin entegre olduğu broker gerçek, uydurma değil.

---

## A. Okuma kaydı (doküman-başına, okuma sırasıyla)

> Her blok: karar durumu · ledger ID · iddia edilen enforcement sınıfı · sahiplendiği authority ·
> config namespace · ürettiği/tükettiği receipt · başka dokümanla kesişen yüzeyler · şüpheli noktalar.

### A1 — `plugin-admission-authority-design-2026-08-05.md` (610 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-05 OWASP Agentic Top 10 oturumu, Bulgu 1 |
| Ledger | `PLUGIN-SANDBOX-WIRE-001` (7031) ← parent `PLUGIN-SANDBOX-001` (7030) ← `SUPPLY-CHAIN-001` (7020) ← `ECOSYSTEM-001` (7000); OWASP `SEC-OWASP-ASI-001` (4190), ASI04 |
| Bugünkü sınıf | **UNWIRED** (güvenlik bileşenleri var, activation boundary'de zorunlu değil) |
| Sahiplendiği authority | Plugin Admission Authority: discovery → policy → full-artifact verify → typed admission → immutable artifact → activation |
| Config namespace | `plugins.admission.*`, `plugins.allowed_paths`, `plugins.trusted_publisher_keys`, `plugins.development_grants`, `plugins.revoked_publishers`, `plugins.max_artifact_files/bytes` |
| Enforcement enum | `enforce \| quarantine_optional` (§5.2) |
| Contract'lar | `ResolvedPluginAdmissionPolicy`, `VerifiedPluginArtifact` (branded/opaque), `PluginAdmissionDecision` (allow/quarantine/hold), `PluginAdmissionReceipt` |
| Receipt tutumu | §7.4: "canonical audit authority ile uyum" — **audit-authority-integrity'ye tabi olmayı açıkça kabul ediyor** |
| Work packages | W1 config → W2 contracts → W3 trust/signature → W4 production wiring → W5 receipt/i18n/docs → W6 real-binary/platform/XVerify |
| i18n tutumu | D8 açıkça `getMessage(key, lang)` + en/tr parity zorunlu kılıyor ✅ |
| Non-goal | 7030 runtime isolation, capability broker, **`MCP-TRUST-001` MCP supply-chain**, marketplace/SBOM (7020), agent/skill migration (7000) |

**Kesişen yüzeyler (hipotez — sonraki dokümanlarda test edilecek):**
- `VerifiedPluginArtifact` + `PluginAdmissionDecision` ↔ enforcement-module §11 "Canonical track D —
  Artifact Admission Authority" (absorb/supersede/duplicate?)
- Receipt şeması ↔ audit-authority-integrity §8 normative record contracts
- Trust store / publisher key lifecycle ↔ audit-authority-integrity §7 key authority ve lifecycle
- `plugins.*` config namespace ↔ diğer dokümanların config bölümleri (tek enforcement enum?)

**Şüpheli / kontrol edilecek noktalar:**
1. §2 baseline'daki 13 atıf satırı HEAD'e karşı doğrulanmalı (özellikle **UNWIRED** ve **ADVISORY**
   hükümlü 5 satır: `plugin-hooks.ts:166-189`, `sprint-controller.ts:1650-1655`,
   `plugin-hooks.ts:229-239`, `plugin.ts:190-199`, `config-types.ts:1261-1267`/`:1430-1441`).
2. §7.4 "Sprint ID plugin admission anında henüz doğmamışsa" — attempt-effect / audit-authority
   correlation-ID modeliyle aynı mı?
3. Önerilen yeni modül `src/core/plugin-admission.ts` (diskte yok) — enforcement-module track D ile
   aynı dosyayı mı hedefliyor? (inter-doc file collision adayı)

### A2 — `rolling-spend-budget-authority-design-2026-08-05.md` (765 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-05 OWASP oturumu, Bulgu 2 |
| Ledger | `LIMIT-SPEND-ENFORCE-001` (4091) ← `LIMIT-001` (4090); ilişkili `AUTHORITY-001` (4000), `RECEIPT-001` (4070), `APPROVAL-001` (4050), `COST-001` (10060); OWASP 4190, ASI08/ASI09 |
| Bugünkü sınıf | Karma: per-sprint estimate **ENFORCED** (override'lı) · rolling day/month **ADVISORY** · `enforce_spend_gate` **CONFIG-GATED** (adı davranışla çelişkili) |
| Sahiplendiği authority | `BudgetAuthority` — host-owned, multi-scope, atomic reservation/settlement + `SpendLease` |
| Config namespace | `cost_limits.spend_gate.{mode,daily_max_usd,monthly_max_usd,timezone,override_policy,reservation_ttl,landing_policy}` |
| Enforcement enum | `advisory \| enforce` (§9.1) — **plugin-admission'ın `enforce \| quarantine_optional`'ından farklı** |
| Contract'lar | `MoneyMicros` (bigint, fixed-point), `BudgetScope` (7 kind), `RollingBudgetPolicy`, `SpendAdmissionRequest`, `SpendLease` (fencingToken + boundIdentityDigest), 13 ledger entry kind |
| Receipt tutumu | §5.5: entry'de `previous hash/sequence` + idempotency + actor/principal → **audit-authority-integrity chain modeliyle örtüşme adayı**; açık "canonical audit authority" ifadesi yok (plugin-admission'daki kadar net değil) |
| Work packages | W1 money/policy → W2 ledger/adapters → W3 admission/lease → W4 all-ingress wiring → W5 landing/settlement → W6 approval/i18n/surfaces → W7 migration/proof |
| i18n tutumu | W6 açıkça `getMessage(key, lang)` + en/tr parity ✅ |
| Non-goal | Provider invoice API, subscription quota authority, **approval decision integrity (Bulgu 11 / `APPROVAL-001`)**, storage/compute cost (10060), finance/ERP connector |

**En güçlü bağımsız bulgu (§2.1):** rolling reader'ın canonical producer'ı yok —
`.deckent/settings/resource-log.jsonl`'e authoritative `costUsd` append eden production producer
repo-wide static call-graph'ta bulunamamış; `ResourceMonitor` aynı dosyaya yalnız Docker CPU/mem/net
sample'ı yazıyor, schema'da `costUsd` yok. Testler cost entry'lerini fixture olarak kendileri üretiyor
(`tests/orchestra/cost-gate-advisory.test.ts:69-97`). **Sonuç:** mevcut `readSpendWindow()` üzerine hard
block koymak sahte enforcement üretir. → Bu, §3'te doğrulanacak en yüksek değerli iddia.

**Kesişen yüzeyler:**
- `SpendLease` fencing/identity binding ↔ provider-neutral-worker'ın provider execution ingress authority'si
  (aynı `ProviderExecutionIngressAuthority` yüzeyi mi?)
- `attemptId` / attempt identity ↔ attempt-effect-attribution (attempt = ortak birincil kimlik)
- Ledger entry hash-chain ↔ audit-authority-integrity §6 cryptographic design + §8 record contracts
- Override → **ApprovalBroker** ↔ terminal-session §12 (aynı broker) ↔ enforcement-module §9 principal/RBAC
- `BudgetScope` 7-kind tenant/org/principal hiyerarşisi ↔ enforcement-module §9 principal model ↔
  content-provenance §20 tenancy modeli

**Şüpheli / kontrol edilecek noktalar:**
1. §2.1 "producer yok" iddiası — HEAD'e karşı doğrulanacak (en yüksek öncelik).
2. **`APPROVAL-001` / "Bulgu 11" bu 9-doküman setinde tasarlanmamış** ama W6 buna hard dependency.
   → set-dışı blocking dependency (§4'te `UNDEFINED-DEP` olarak tiplenecek).
3. `enforce_spend_gate` legacy migration'ı, plugin-admission'ın legacy `plugin_require_signature`
   migration'ıyla aynı kalıpta ama ortak "legacy config migration authority" tanımlanmamış.
4. `MoneyMicros.micros: bigint` — JSON/API/SQLite projection'da lossless taşıma; dashboard/API
   surface'inde `Number()` daralması riski (§7 conformance kontrolü).

### A3 — `audit-authority-integrity-design-2026-08-06.md` (1035 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, Bulgu 3 |
| Ledger | `AUDIT-001` (4120) ← `AUTHORITY-001` (4000); ilişkili `PRINCIPAL-001` (4010), `OPERATION-001` (4030), `RECEIPT-001` (4070), `TRUST-HANDOFF-001` (4180), `P02-654`/KMS-HSM (2240), `DATA-GOV-001` (10020), `ASSURANCE-PACK-001` (10080), OWASP 4190 |
| Bugünkü sınıf | **ADVISORY tamper evidence** (accidental corruption'a karşı sinyal; repo-owner/same-process/project-writer adversary'ye karşı kanıt değil) |
| Sahiplendiği authority | `AuditAuthority` — tek canonical append/key-epoch/checkpoint/anchor/verification/retention/receipt |
| Config namespace | audit profile/mode/key-provider/anchor requirements (§16 W1; **explicit key-yolu verilmemiş** — diğer dokümanlar kadar somut değil) |
| Enforcement enum | assurance mode: `unsealed \| host_sealed \| externally_anchored` (§4 D5) — **üçüncü ayrı enum** |
| Contract'lar | `AuditIntent`, `AuditRecordV3`, `AuditCheckpoint`, `AuditAnchorReceipt`, `AuditVerificationVerdict` (8-boyutlu), `AuditKeyProvider` |
| Receipt tutumu | **Bu doküman receipt authority'nin merkezidir** — D1: diğer receipt'ler yok olmaz, AuditAuthority onları "causal index" olarak mühürler; `receiptRefs` ile bağlanır |
| Work packages | W1 contracts → W2 key providers → W3 host ledger → W4 chain/checkpoint/anchor → W5 production wiring → W6 terminal/export → W7 redaction/retention → W8 migration/proof |
| i18n tutumu | W1 "i18n-clean typed errors; mechanism modules hardcoded user strings taşımaz" ✅ |
| Non-goal | KMS-admin'e karşı mutlak güven, provider/connector external effect truth, data governance bütünü (10020), **inter-agent event security (Bulgu 12/ASI07)**, **approval authenticity (Bulgu 11 / `APPROVAL-001`)** |

**En yüksek değerli doğrulanabilir iddia:** `AUDIT_HMAC_SECRET = 'deckent-audit'` source içinde sabit ve
**export edilmiş** (`src/core/audit-writer.ts:23-35`) → **Forgeable**. Ayrıca `audit-export.ts` default
secret'i de aynı sabit. Bu tek satır doğrulanırsa tüm audit assurance sınıfı çöker. → §3'te öncelikli.

**Bu doküman setin merkezi seam'i:** 8 dokümanın hepsi receipt üretiyor; bu doküman receipt/chain/anchor
authority'sini tanımlıyor. Dolayısıyla **`AUDIT-001` diğer 8 paketin ortak alt-yapısı** — DAG'da
yukarı-akış (upstream) konumda olmalı. Ancak dokümanlar bunu farklı netlikte kabul ediyor:
plugin-admission açıkça ("canonical audit authority ile uyum"), rolling-spend dolaylı (kendi hash-chain'i),
diğerleri §A4–A9'da kontrol edilecek.

**Kesişen yüzeyler:**
- `AuditRecordV3.sourceTrust: host_verified | provider_verified | worker_claim | caller_claim` ↔
  attempt-effect-attribution'ın attribution/provenance modeli ↔ content-provenance'ın trust modeli
  (**aynı 4-değerli enum mu, üç ayrı enum mu?** → yüksek öncelikli seam)
- `AuditKeyProvider` platform adapter matrisi (Linux keyring/macOS Keychain/Windows DPAPI-CNG/WSL/KMS) ↔
  terminal-session ve provider-neutral-worker'ın platform adapter matrisleri (ortak
  platform-capability registry mi, üç ayrı mı?)
- D10 `intent → authority_decision → effect/dispatch → settlement` lifecycle ↔ attempt-effect §11
  lifecycle ↔ project-inventory §13 "execution, effect ve landing separation" (**aynı faz adları mı?**)
- `OPERATION-001` operation catalog — audit completeness'in zorunlu girdisi, **bu sette tasarlanmamış**

**Şüpheli / kontrol edilecek noktalar:**
1. §2'de 17 baseline satırı; `writeAuditEvent()` "31 production/test-adjacent site" iddiası sayılabilir.
2. `PRINCIPAL-001` (4010) ve `OPERATION-001` (4030) bu sette doküman almamış ama D9/D10 bunlara
   hard-bağlı → set-dışı dependency (§4).
3. `sequence: bigint` + `MoneyMicros.micros: bigint` → JSON/SQLite bigint taşıma ortak sorunu;
   ortak "canonical integer persistence" kararı hiçbir dokümanda tek yerde tanımlı değil.
4. Bulgu numaralandırması: 1=plugin, 2=spend, 3=audit, 11=approval, 12=inter-agent(ASI07),
   16=plugin-sandbox. → OWASP oturumunda ≥16 bulgu var, sette 9 doküman. **Doküman-almamış bulgular
   §4/§9'da listelenecek.**

### A4 — `provider-neutral-worker-execution-authority-design-2026-08-06.md` (1200 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, Bulgu 4 |
| Ledger | `TOOL-AUTHORITY-001` (4060) ← `AUTHORITY-001` (4000); ilişkili `OPERATION-001` (4030), `CAPABILITY-001` (4040), `APPROVAL-001` (4050), `RECEIPT-001` (4070), `TRUST-HANDOFF-001` (4180), `ENV-ADAPTER-001` (8010), `CODEX-C3` (1270), `P02-640` (2100), `KERNEL-SETTLEMENT-001` (3040), `TEST-CONTAINMENT-001` (75), OWASP 4190 |
| Bugünkü sınıf | Karma; **Bulgu 4'ün önceki hükmü `PARTIAL` olarak düzeltilmiş** (§2.6): Codex/Gemini task-scoped write yokluğu CONFIRMED · Claude `Bash`'in `Write/Edit` path sınırını geçersiz kılması CONFIRMED · "üç provider'ın tüm guardrail'leri aynı biçimde kapalı" iddiası PARTIAL |
| Sahiplendiği authority | **Setin en büyük paketi** — 8 canonical component: `WorkerCapabilityEnvelopeAuthority`, `RuntimeConformanceAuthority`, `ExecutionEnvironmentAuthority`, `WorkspaceProjectionAuthority`, **`ToolAuthorityGateway`**, `ProcessSupervisor`, **`LandingAuthority`**, `ExecutionAuditBridge` |
| Config namespace | §15.1 semantic family (exact key adı bilinçli olarak implementation'a bırakılmış): worker enforcement mode, uncontained policy, required conformance tier, external tool mode, network profile, landing mode, scope violation policy, staging retention |
| Enforcement enum | `observe \| shadow \| enforce` (§15.1) — **dördüncü ayrı enum** |
| Tier enum | `BROKERED_TOOLS \| CONTAINED_NATIVE_TOOLS \| READ_ONLY_CONTAINED \| UNCONTAINED \| UNAVAILABLE` |
| Contract'lar | `WorkerCapabilityEnvelope V1` (23 alan), `RuntimeConformanceEvidence` (11 facet), `WorkspaceProjection`, `ToolGrant` (11 boyut), `LandingProposal`/`LandingReceipt` |
| Receipt tutumu | `ExecutionAuditBridge` trust konumu açıkça "Canonical AuditAuthority" → **`AUDIT-001`'e tabi olmayı kabul ediyor** ✅ |
| Work packages | W1 contracts → W2 envelope → W3 projection → W4 env adapters → W5 tool gateway → W6 provider cutover → W8 OOB supervisor → W7 landing closure → W9 network/secrets → W10 surfaces/ratchet |
| i18n tutumu | W10 "break-glass approval UX and i18n" — **dolaylı**; `getMessage` açıkça anılmıyor (plugin/spend/audit kadar net değil) ⚠️ |
| Non-goal | 13 maddelik "bu iş kapanmaz" listesi; en önemlisi: provider-specific flag eklemek, Docker'ı sandbox saymak, worker `filesChanged` beyanına güvenmek |

**Mevcut foundation'ı açıkça sahiplenmesi (değerli):** §5.2 "Mevcut `src/core/capability-*`,
`src/core/execution-landing-*` ve `src/orchestra/execution-landing-coordinator.ts` bu architecture'ın
foundation girdileridir; **paralel ikinci capability veya landing engine yazılmaz**." → Bu, en yüksek
duplicate-riskli alanı doküman içinden kapatıyor.

**Kesişen yüzeyler (bu doküman setin merkezî düğümü):**
- `ToolAuthorityGateway` (W5) ↔ enforcement-module §8 "track A — Tool ve scope authority" ↔
  terminal-session §9 execution containment → **3-yollu tool-admission seam'i (en yüksek öncelik)**
- `LandingAuthority` (W7) ↔ attempt-effect (tüm doküman) ↔ project-inventory §13 ↔
  content-provenance §17 → **4-yollu effect/landing seam'i (en yüksek collision riski)**
- `WorkerCapabilityEnvelope` ↔ terminal-session'ın execution authority'si (aynı envelope mı?)
- Platform adapter matrisi (Linux/OCI/macOS/Windows/WSL/K8s/remote/air-gapped) ↔ `ENV-ADAPTER-001`
  (8010) ↔ audit §7 key-provider platform matrisi ↔ terminal-session §16
- `.tasks/`+`.locks/` worker-visibility'sinin kaldırılması (§16.6) ↔ attempt-effect'in
  result/heartbeat modeli → **worker→host control-plane devri iki dokümanda da var**

**Şüpheli / kontrol edilecek noktalar (yüksek değerli):**
1. **DAG yön çelişkisi:** §18 DAG'ında `RECEIPT-001 + AUDIT-001 + KERNEL-SETTLEMENT-001` W7'nin
   **aşağı-akışında**; ama §21 "…`AUDIT-001` Bulgu 3 architecture'ı … için **hard dependency**'dir"
   diyor ve audit-authority §9.2 "pre-effect append olmadan effect capability mint edilmez" diyor.
   → Audit yukarı-akış mı aşağı-akış mı? **Tipli çelişki adayı (§4).**
2. §2 baseline'da 27 atıf var; en kritik dördü doğrulanacak: `sprint-spawner.ts:990-1037`
   (adapter provider Docker bypass), `execution-request-builder.ts:160-178` (`autoApprove` default
   `true`), `spawn-backend-docker.ts:5661-5665` (project root broad RW), `:6384-6407` (scope
   resolution fail-open), `spawn-backend-docker.ts:3529-3575` (allowlist'te unscoped `Bash`).
3. §18 DAG'ının tepesinde `OPERATION-001 + PRINCIPAL-001 + TENANT-001` → `CAPABILITY-001 +
   APPROVAL-001` var. **Bu 5 authority'nin hiçbiri bu 9-doküman setinde tasarlanmamış.**
   → Set, tasarlanmamış 5 foundation'ın üstünde duruyor (**en önemli yapısal bulgu**).
4. i18n taahhüdü zayıf (yalnız W10'da dolaylı) — Quality Bar i18n-FIRST'e göre eksik ⚠️

### A5 — `attempt-effect-attribution-authority-design-2026-08-06.md` (1383 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, Bulgu 5 |
| Ledger | **primary owner `TRUST-HANDOFF-001` (4180)**; mevcut dar foundation `RECOVERY-BORN-480-ATTRIBUTION-001` (3175); hard deps `TOOL-AUTHORITY-001` (4060), `KERNEL-SETTLEMENT-001` (3040), `RESULT-RECONCILIATION-001` (3261), `AUDIT-001` (4120), `ENV-ADAPTER-001` (8010); assurance parent 4190 |
| Bugünkü sınıf | **Bulgu 5 hükmü `PARTIAL` olarak düzeltilmiş** (§2.6): honest-gate self-report CONFIRMED · Auditor alert-only/untracked-kör CONFIRMED · "hiçbir production path'te host-side byte attribution yok" iması **REFUTED** (Docker path'te exact scoped baseline/reconciliation production-wired) · Docker foundation'ın complete attribution vermemesi CONFIRMED |
| Sahiplendiği authority | `EffectDiscoveryAuthority`, `EffectClassificationAuthority`, `AttemptEffectManifestV1`, `CanonicalDriftObservationV1`, evidence CAS |
| Config namespace | §15 — **key adı bilinçli olarak implementation'a bırakılmış**; davranış contract'ı normative |
| Enforcement enum | `observe \| shadow \| enforce` (§15.1) — **provider-neutral ile aynı** ✅ (ilk enum uyumu) |
| Contract'lar | `AttemptEffectManifestV1` (23 alan), `AttemptEffectEntryV1`, `EffectDiscoveryEvidenceV1`, `EffectClassificationDecisionV1`, `EffectAttributionReceiptV1`, `CanonicalDriftObservationV1` |
| Receipt tutumu | `AUDIT-001` "evidence dependency" olarak açık tabloda ✅ |
| Work packages | W1 vocabulary/contracts → W2 evidence CAS → W3 env discovery adapters → W4 classification → W5 provider wiring → W6 landing/settlement → W7 auditor/drift → W8 legacy migration → W9 assurance/XVerify |
| i18n tutumu | §19 "Human-readable strings mevcut i18n system üzerinden gelir; mechanism modules user-facing string hardcode etmez" ✅ |
| Non-goal | 6 non-goal + 15 maddelik "COMPLETE değildir" listesi |

**Seam'i kendi içinde kapatması (en değerli tasarım hijyeni):** D15 — "Bulgu 5 için **ikinci bir sandbox,
workspace veya landing implementation'ı yapılmaz**. Discovery ve manifest components, Bulgu 4'ün
`ExecutionEnvironmentAdapter`, capability envelope, Tool Gateway ve LandingAuthority flow'una bağlanır.
İki ayrı engine üretmek policy drift ve double-settlement yaratır." → 4-yollu landing seam'inin
**iki ucu doküman içinden birleştirilmiş**.

**Bağımsız yeni bulgu (§2.5) — ölçümün kendi yan etkisi:** baseline/after-hash hesabı
`git hash-object -w` kullanıyor (`spawn-backend-docker.ts:1980-2000`, `:2074-2086`) → `-w` ölçülen
blob'ları canonical `.git/objects`'e **yazıyor**. Sonuç: measurement kendi başına repository metadata
effect'i üretiyor, karantinaya alınmış attempt byte'ları canonical object DB'ye taşınıyor, multi-tenant'ta
bloat, evidence lifecycle repo GC'sine bağlanıyor. → Doğrulanacak (§3), yüksek değerli.

**Dürüstlük düzeltmesi (§2.3):** bugünkü Docker `VERIFIED` adı fazla geniş; kanıtladığı şey yalnız
"declared exact scope içindeki path'lerin baseline'a göre byte delta'sı" → hedef vocabulary'de
`SCOPED_DELTA_VERIFIED`. Bu, mevcut kodun **adını daraltan** bir migration önerisi (schema consumer'ları
`STRUCTURALLY_ATTRIBUTED` ile eşitlememeli).

**Kesişen yüzeyler + tespit edilen contract çatışması:**
- ⚠️ **`LandingReceipt` iki yerde tanımlı.** provider-neutral §6.5 `LandingReceipt` alanlarını sayıyor;
  attempt-effect §6.7 "Bulgu 4 contract'ı **genişletilmeden** exact refs ile bağlanır" diyor ama sonra
  `source AttemptEffectManifestV1`, `source classification decision`, `no omitted or extra effects proof`
  ekliyor → fiilen genişletme. **Tek birleşik `LandingReceiptV1` şeması gerekli (§4).**
- ⚠️ **Üç ayrı trust/provenance vocabulary'si:**
  · audit `sourceTrust: host_verified|provider_verified|worker_claim|caller_claim`
  · attempt-effect `provenanceQuality: STRUCTURAL|RECEIPT_CAUSAL|OBSERVED|AMBIGUOUS`
  · attempt-effect `assuranceState: STRUCTURALLY_ATTRIBUTED|SCOPED_DELTA_VERIFIED|OBSERVED_NOT_CAUSAL|AMBIGUOUS|UNAVAILABLE|HOLD`
  → Aynı soruyu ("bu kanıt ne kadar güçlü?") üç farklı enum yanıtlıyor. Birleşme/eşleme tablosu gerekli.
- Protected resource catalog (§9.4: `.git/**`, `.deckent/**`, `.tasks/**`, `.locks/**`, `.brain/**`,
  `DIRECTIVES.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, credentials, sockets, CI/release/signing) ↔
  enforcement-module §10 "Protected Mutation" ↔ content-provenance §13 "project policy/identity/ADR
  authority" → **3-yollu protected-surface seam'i**
- Monitoring-loss = authority suspension (§12.3) ↔ `TRUST-HANDOFF-001` hedefi ↔ provider-neutral
  `SUPERVISION_HOLD` → uyumlu ✅

**Şüpheli / kontrol edilecek noktalar:**
1. §2.1 honest-gate 6 satırı (`result-evaluator.ts:2380-2525`) — özellikle `filesWrite` boşsa `[]`
   dönmesi (fail-open) ve `*.md` exemption'ı → doğrulanacak.
2. §2.5 `git hash-object -w` → doğrulanacak.
3. §2.4 `sprint-work-attribution.ts:44-63` + `sprint-terminal-evidence.ts:649-723` → doğrulanacak.
4. §21.1 "Bu belge `docs/MASTER-PLAN.md` üzerinde mutation yapmaz" — ledger ID'ler MASTER-PLAN'da
   resolve ediyor mu? (`RECOVERY-BORN-480-ATTRIBUTION-001`, `RESULT-RECONCILIATION-001` özellikle) → §6

### A6 — `enforcement-module-disposition-authority-design-2026-08-06.md` (1567 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, Bulgu 6 |
| Ledger | **umbrella owner `SEC-ENFORCE-WIRE-001` (4200)**; domain owners `TOOL-AUTHORITY-001` (4060), `ENTERPRISE-AUTH-001` (4140), `TRUST-HANDOFF-001` (4180), `SUPPLY-CHAIN-001` (7020), `PLUGIN-SANDBOX-001` (7030), `AGENT-SKILL-001` (7010); assurance 4190 |
| Hard arch deps | **Açıkça 3 doküman:** provider-neutral (Bulgu 4), attempt-effect (Bulgu 5), plugin-admission (ortak trust-plane) → set-içi bağımlılığı header'da beyan eden **tek doküman** ✅ |
| Bugünkü sınıf | 4 exact API'nin tamamı **UNWIRED** (exact-function düzeyinde CONFIRMED); genelleme **PARTIAL** |
| Sahiplendiği authority | `PrincipalAuthority`, `AuthorizationAuthority`, `ProtectedMutation` + `RuntimeImpact`, `ArtifactAdmissionAuthority` (skill/plugin/agent/connector/extension), `StaticArtifactAnalyzer` |
| Enforcement enum | `observe \| shadow \| enforce` (§13.1) — provider-neutral ve attempt-effect ile **aynı** ✅ |
| Karar enum'ları | `AuthorizationDecision: ALLOW\|DENY\|HOLD` · `RuntimeImpact: CLEAR\|ACTION_REQUIRED\|HOLD` · `ArtifactAdmission: ADMIT\|REJECT\|HOLD` · `ArtifactActivation: ACTIVE\|ROLLED_BACK\|HOLD` · `ArtifactUse: ALLOW\|DENY\|HOLD` |
| Contract'lar | `ResolvedPrincipalV1`, `AuthorizationRequestV1`, `AuthorizationDecisionV1`, `ProtectedResourceClassificationV1` (11 sınıf), `RuntimeImpactDecisionV1`, `ArtifactCandidateV1`, `ArtifactInventoryV1`, `StaticAnalysisReportV1`, `ArtifactAdmissionDecisionV1`, `ArtifactActivationReceiptV1`, `ArtifactUseReceiptV1` |
| Receipt tutumu | §14.3 tamper-evident audit chain'e girer; raw token/secret/artifact içeriği payload'a girmez ✅ |
| Work packages | W1 reachability/disposition → W2 principal/authz → W3 tool/scope capability → W4 RBAC cutover → W5 protected/runtime-impact → W6 artifact inventory/provenance → W7 analyzer refactor → W8 admission/activation/use → W9 legacy retirement → W10 assurance/XVerify |
| i18n tutumu | §14.1 "Human-readable strings existing i18n mechanism'inden gelir; mechanism modules user-facing strings hardcode etmez" ✅ |
| Non-goal | 7 non-goal + 19 maddelik "COMPLETE değildir" |

**Bu doküman A4'teki 3. şüphemi kısmen çürütüyor (düzeltme):** `PRINCIPAL-001`'in *contract'ı* bu sette
tasarlanmış — §7.1 `ResolvedPrincipalV1`, §7.2/7.3 authorization request/decision, §9 track B ingress
resolution. Ledger sahibi `ENTERPRISE-AUTH-001` (4140). Yani "5 foundation tasarlanmamış" ifadesi
**`PRINCIPAL-001`+RBAC için geçerli değil**; hâlâ tasarlanmamış olanlar: `OPERATION-001` (4030,
operation catalog), `CAPABILITY-001` (4040), `APPROVAL-001` (4050 / Bulgu 11), `TENANT-001`,
`RECEIPT-001` (4070). → §4'te net liste.

**Seam'i kendi içinde kapatması:** D3 — `tool-scope-gate.ts` ayrı motor olmaz, canonical capability
modeline **absorb** edilir; §8.4 `scope-check.ts` primitive olarak korunur. D14 — "Plugin admission
belgesindeki trust roots ve key lifecycle **yeniden icat edilmez**". → 3-yollu tool seam'i ve
plugin↔artifact seam'i doküman içinden çözülmüş ✅

**Bağımsız yeni bulgular (yüksek risk sırası, §3.6):**
1. **Skill install/update active-store bypass** — `skill.ts:496-562` update **önce aktif skill'i siliyor**,
   sonra yeni Git/local bytes'ı scan/signature olmadan koyuyor; checksum install *sonrası* ve non-fatal
   (`:395-406`, `:465-477`); loader yalnız manifest shape doğruluyor (`skill-pool.ts:308-357`); atanan
   skill'in `SKILL.md` içeriği **doğrudan worker prompt'una** ekleniyor (`result-collector.ts:1001-1017`).
   → third-party instruction artifact'ı provenance/admission olmadan execution context'e giriyor.
2. **RBAC missing/unknown role = allow-all** — `nervous/authority-matrix.ts:303-333`; MCP start
   `mcp-operator` (`mcp/tools/start.ts:316`), CLI plan `cli-operator` (`cli/commands/plan.ts:548`)
   yalnız actor ID veriyor, role vermiyor → `enforce_rbac=true` iken bile permissive path.
3. Scope authority duplication / unwired gate (`tool-scope-gate.ts` default `advisory`, violation
   görünse de `allowed:true`).
4. Self-modification misleading semantics — Deckent dogfood'da flag ignore edilip **her zaman advisory**
   (`self-modifying-detector.ts:201-212`); `self_mod_enforce` key'i config schema'da **yok**.

**Kesişen yüzeyler + tespit edilen enum çatışması:**
- ⚠️ **Admission karar enum'u iki farklı:** plugin-admission `allow \| quarantine \| hold`
  vs enforcement-module `ADMIT \| REJECT \| HOLD`. Aynı trust-plane'i (D14) paylaşan iki doküman,
  aynı kararı iki enum ile veriyor. **Birleşme gerekli (§4).**
- ⚠️ **`quarantine` bir yerde karar, diğer yerde durum:** plugin'de decision değeri; enforcement'ta
  ayrı store/state (`Artifact quarantine`). Semantik hizalama gerekli.
- Protected resource catalog (§7.4, 11 sınıf: `ordinary_project`, `agent_instruction`,
  `workspace_trust`, `execution_config`, `package_lifecycle`, `ci_release`, `credential_policy`,
  `control_plane`, `runtime_source`, `binary_service`, `external_system`) ↔ attempt-effect §9.4
  protected catalog (path listesi) → **aynı katalog, biri sınıflı biri path-listeli.** Enforcement'ın
  sınıflı hali daha güçlü; attempt-effect'in listesi onun instance'ı olmalı.
- `ApprovalBroker` entegrasyonu (§10.5) ↔ terminal-session §12 ↔ rolling-spend §10 →
  **3-yollu approval seam'i**; `APPROVAL-001`/Bulgu 11 hepsinde hard dependency, hiçbirinde tasarlı değil.

**Şüpheli / kontrol edilecek noktalar:**
1. 4 API'nin "production caller yok" iddiası → §3'te doğrulanacak (dokümanın kendisi §21.3'te
   "bu belgedeki absence iddiasını **stale kabul edip kör kullanma**" diyor — sağlıklı öz-şüphe).
2. `skill.ts:496-562` delete-then-copy sırası → doğrulanacak (en yüksek riskli iddia).
3. `authority-matrix.ts:303-333` missing-role allow → doğrulanacak.
4. `self_mod_enforce` config key'inin yokluğu → doğrulanacak.

### A7 — `terminal-session-execution-authority-design-2026-08-06.md` (1212 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, Bulgu 7 |
| Ledger | **14 sahip** — assurance 4190, disposition `SEC-ENFORCE-WIRE-001` (4200), authority `PRINCIPAL-001` (4010), `TENANT-001` (4020), `OPERATION-001` (4030), `CAPABILITY-001` (4040), `APPROVAL-001` (4050), `TOOL-AUTHORITY-001` (4060), `API-SECURITY-001` (4130), `TRUST-HANDOFF-001` (4180); ürün `TERMINAL-001` (5000), `TERMINAL-TOOLS-001` (5010), `TERMINAL-XPLAT-001` (5090), `TERMINAL-CONTEXT-001` (5100) |
| Hard arch deps | provider-neutral (B4), attempt-effect (B5), enforcement-module (B6) — header'da beyan ✅ |
| Bugünkü sınıf | 10-satırlı matris: auth **ENFORCED** · `command-guard`/`prompt-guard` dar predicate için ENFORCED ama boundary olarak **ADVISORY/PARTIAL** · `allowShellKind` **CONFIG-GATED/PARTIAL** · AI allowlist **ENFORCED/PARTIAL** · resource controls **ENFORCED** · **session authorization / owner binding / execution containment / raw-shell approval = 4× UNWIRED (kritik)** |
| Önceki bulgu | **PARTIAL** — "non-loopback dahil tüm yollarda host default localhost" iddiası **artık geçersiz** (`createHttpServer()` resolved bind host'u manager'a geçiriyor); ama daha derin kök-neden: **PTY chunk/keystroke akışında regex command authority olamaz** |
| Sahiplendiği authority | `AuthenticationAuthority` (→VerifiedPrincipal), `SessionAuthorizationAuthority`, `SessionCapabilityGrant`, terminal `OperationCatalog` (12 operation), 3 profil (`managed`/`developer`/`break-glass`) |
| Config namespace | `terminal.allowShellKind` boolean → versioned session-policy profiles (13 logical alan); exact key implementation'a bırakılmış |
| Enforcement enum | `observe \| shadow \| enforce` (§11.3) ✅ |
| Receipt tutumu | §13 structured audit/receipt; **raw PTY keystroke/output default audit'e yazılmaz** invariant'ı korunuyor ✅ |
| Work packages | W1 reachability → W2 principal/operation/decision → W3 registry/ownership/fencing → W4 HTTP/WS/Desktop ingress cutover → W5 managed/developer profiles → W6 break-glass → W7 guard telemetry/retire → W8 audit/receipts/revocation → W9 every-env/scale/adversarial → W10 governance closure |
| i18n tutumu | ❌ **`getMessage` ve `i18n` kelimesi hiç geçmiyor (0/0).** §17 W4'te yalnız "UI visible denial/HOLD/recovery semantics". Quality Bar i18n-FIRST'e göre **eksik** |
| Non-goal | 8 non-goal + 22 maddelik "COMPLETE değildir" |

**İki YENİ kritik bulgu (önceki Bulgu 7'de yoktu):**
1. **Unknown `SessionKind` → shell fallback = fail-open double bypass** (§4.6). Compile-time type
   `ai|deckent|shell`, ama HTTP ingress runtime doğrulama yapmıyor: body `kind?: string` cast ediliyor
   (`api/server.ts:2633-2638`), `allowShellKind` yalnız exact `'shell'` bloklıyor (`:2639-2645`), input
   validator olmadan `SessionKind`'a cast (`:2656-2662`), manager lookup miss'inde `SHELL_CMD` fallback
   (`session-manager.ts:54-72`), metadata caller'ın bilinmeyen `kind`'ını saklıyor, command-guard
   `kind !== 'shell'` gördüğü için **tüm input'u muaf tutuyor** (`command-guard.ts:55`).
   → `allowShellKind=false` iken `kind:'other'` **raw shell açıyor** ve remote bind'de guard da çalışmıyor.
2. **Session owner yok → cross-tenant/cross-owner IDOR** (§4.7). `SessionMeta` principal owner
   taşımıyor (`terminal/types.ts:13-20`); `list()` tüm map'i dönüyor (`session-manager.ts:103-109`);
   `write/resize/attach/detach/kill` yalnız ID ile (`:115-163`); HTTP GET tenant filtresiz
   (`api/server.ts:2679-2684`), DELETE owner/tenant kontrolsüz (`:2686-2699`); WS client herhangi bir
   `sessionId` gönderip replay/attach/input/resize yapabiliyor (`ws-gateway.ts:221-267`);
   `tenantOf()` **hedef** session'ın tenant'ını alıyor (`:153-162`) → saldırgan audit'te **kurban tenant
   gibi görünüyor**. ASI03 + API IDOR + cross-tenant confidentiality/integrity breach.

**Ek yapısal bulgu (§4.8):** `AuthProvider.verify()` yalnız `boolean` dönüyor
(`terminal/auth-provider.ts:14-35`); HTTP handler principal'ı **ayrı** decode ediyor
(`api/server.ts:2610-2621`) ve `deriveRequestPrincipal()` kendi contract'ında JWT payload'ını
**signature doğrulamadan** okuduğunu, `authGateVerified:true` yoksa claims'in authorization için
trusted sayılmaması gerektiğini söylüyor (`auth-me-endpoint.ts:85-130`) — **terminal caller bu flag'i
vermiyor.** → credential verification ile principal resolution arasında structural split.

**Kesişen yüzeyler:**
- §9.1 "Bulgu 4'te kabul edilen provider-neutral worker execution authority bu terminal için de shared
  dependency'dir. **Terminal ayrı sandbox implementation'ı üretmemelidir.**" → tool/execution seam'i
  doküman içinden kapatılmış ✅
- §12 ApprovalBroker ↔ enforcement §10.5 ↔ rolling-spend §10 → 3-yollu; **`APPROVAL-001` hâlâ tasarlı değil**
- §6 5-katmanlı identity ayrımı (listener bind / transport peer / verified principal / session owner /
  execution target) ↔ enforcement §7.1 `ResolvedPrincipalV1` → uyumlu, birleştirilebilir
- §16 Every Environment matrisi (9 satır: +reverse proxy, +Desktop) ↔ provider-neutral §12.2 (8 satır)
  ↔ attempt-effect §8.7 (13 facet) → **üç ayrı platform matrisi; tek `ENV-ADAPTER-001` capability
  registry'sine indirgenmeli**

**ADR çatışması (Yasa 2 — ADR'ler ihlal edilemez) — bu, sette bunu açıkça ele alan TEK doküman:**
§21 — `docs/adr/adr-g-029-embedded-web-terminal.md` command/prompt guard'ı **delivered security guard**
ve RCE modelinin parçası olarak tanımlıyor (`:19-37`, `:115-119`); aynı ADR multi-tenant/remote
isolation'ı geleceğe bırakıyor (`:85-92`, `:107-111`). Doküman doğru prosedürü öneriyor: sessiz in-place
rewrite YOK → **typed amendment veya successor ADR**. → §7/§9'da owner kararı.

**Ledger boşluğu (owner kararı gerektiriyor):** §22 — "bu closure birden fazla parent'a dağıldığı için
**exact terminal session/execution authority outcome child'ı açılması gerekebilir. Bu belge ID
uydurmaz.**" → MASTER-PLAN'a yeni child satırı gerekip gerekmediği Alperen kararı.

**Şüpheli / kontrol edilecek noktalar:**
1. §4.6 unknown-kind zinciri (6 adım) → doğrulanacak, **en yüksek öncelik** (exploit edilebilir).
2. §4.7 IDOR zinciri → doğrulanacak, **en yüksek öncelik**.
3. §4.1 `serve.ts:72-103` loopback-only + `config.ts:255-262` default'lar → doğrulanacak.
4. i18n taahhüdü yok → §7 conformance bulgusu.

### A8 — `project-inventory-scope-admission-authority-design-2026-08-06.md` (1297 satır)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, **Bulgu 9** |
| **MCP notu** | ⭐ "**Bulgu 8** owner kararıyla `MCPV2.md` planı ve production cutover sonrasındaki fresh code-truth değerlendirmesine **DEFERRED/HOLD** bırakılmıştır. Bu belge MCPv1 trust tasarımı yapmaz." → **Bulgu 8 = MCP; owner tarafından zaten ertelenmiş.** Kullanıcının bu oturumdaki MCP-erteleme talimatıyla birebir uyumlu ✅ |
| Ledger | disposition `SEC-ENFORCE-WIRE-001` (4200), assurance 4190, truth `TRUTH-BASELINE-001` (40), authority `CAPABILITY-001` (4040), `TOOL-AUTHORITY-001` (4060), `TRUST-HANDOFF-001` (4180), platform `ENV-ADAPTER-001` (8010), exact-plan/RunFlow → güncel `KERNEL-001` DAG'ı |
| Hard arch deps | provider-neutral (B4), attempt-effect (B5), enforcement-module (B6) ✅ |
| Bugünkü sınıf | 10-satırlı matris: legacy `runSprint` gate Git-success **ENFORCED/PARTIAL** · legacy Git/gate failure **ADVISORY/fail-open** · **RunFlow evidence unavailable ENFORCED** (güçlü, fail-closed) · `--force-scope` **CONFIG/CALLER-GATED/PARTIAL** · dynamic FIX re-gate **ADVISORY/fail-open** · prompt-gate lints **ADVISORY/fail-soft** · auto-resolution **PARTIAL/fail-open** · runtime write scope **UNWIRED/PARTIAL** |
| Önceki bulgu | Exact **CONFIRMED** (legacy fail-open gerçek); genelleme **PARTIAL** — RunFlow plan service typed `SCOPE_GATE_HOLD` üretiyor ve approval'ı reddediyor |
| Sahiplendiği authority | `ProjectInventoryAuthority` (VCS-neutral; Git bir adapter), `ScopeAdmissionAuthority`, `ExecutionAdmission` revalidation, dynamic repair authority |
| Evidence enum | `AVAILABLE \| EMPTY_BASELINE \| NOT_REQUIRED \| UNSUPPORTED \| UNAVAILABLE \| STALE \| DRIFTED \| CONFLICT` (8 durum) |
| Karar enum | `ALLOW \| DENY \| HOLD \| NOT_REQUIRED` — **4. değer `NOT_REQUIRED` diğer dokümanlarda yok** |
| Enforcement enum | `observe \| shadow \| enforce` (§15.2) ✅ |
| Work packages | W1 reachability → W2 identity/inventory contracts → W3 Git adapter → W4 non-Git/remote adapters → W5 scope admission → W6 RunFlow cutover → W7 execution admission/drift → W8 dynamic repair → W9 execution/effect/landing integration → W10 legacy retirement → W11 assurance/docs/governance |
| i18n tutumu | ❌ **`getMessage`=0, `i18n`=0.** §23'te yalnız "English/Turkish user-visible reference **parity** korunmalı" (docs parity, mekanizma i18n'i değil) ⚠️ |
| Non-goal | 10 non-goal + 22 maddelik "COMPLETE değildir" |

**En değerli katkı — 4-yollu landing seam'inin çözüm anahtarı (§13.1):** üç ayrı soru asla tek
`scope gate` boolean'ında birleşemez:
1. **Scope Admission** — planlanan path mantıklı/izinli mi? (bu doküman)
2. **Execution Capability** — worker hangi resource üzerinde hangi operation'ı gerçekten yapabilir? (B4)
3. **Effect/Landing** — ne değişti, kime ait, canonical state'e alınabilir mi? (B5)
→ **Bu ayrım, §4'teki "4-yollu landing çakışması" hipotezini çürütüyor:** çakışma değil, üç ayrı
katman. content-provenance §17 kontrol edilince kesinleşecek.

**"Akışı bloklamama" ile fail-open'ı ayıran model (§9.4) — Yasa 6 ile uyumlu:** evidence unavailable
olduğunda *her şey* aynı biçimde bloklanmıyor; operation/effect sınıfına göre: read-only →
`NOT_REQUIRED` olabilir · strong staging containment varsa attempt'e admit + **landing HOLD** ·
protected mutation → HOLD+approval · dynamic repair → **repair HOLD ama unrelated run devam** ·
unsupported → honest HOLD. Bu, "bütün run değil yalnız evidence-dependent effect/landing durur" ilkesi.

**Bağımsız yeni bulgular:**
1. **Legacy fail-open bilinçli ve kod-yorumunda yazılı** (§4.1): `sprint-controller.ts:1915-1918`
   comment'i "Fail-OPEN: a git failure never blocks a legitimate sprint" diyor; catch **tüm
   non-`BrainError` exception'ları** yutuyor (`:1986-1989`) → Git yok, non-Git proje, yanlış root,
   permission/corruption, maxBuffer, evaluator exception hepsi **sessiz permissive**.
2. **`spawnSync` canonical path'te** (`sprint-controller.ts:1918-1921`) — event-loop blocking;
   RunFlow tarafı doğru yapıyor (async, 10s timeout, 64MiB limit, `run-flow-plan-service.ts:286-336`).
3. **Auto-resolution memory/disk divergence** (§4.11): scope memory'de değişiyor, task JSON write
   failure yalnız debug log (`sprint-controller.ts:1945-1957`) → in-memory task, `.tasks/task-*.json`,
   approval bytes ve recovery reader **farklı scope görebilir**.
4. **Exact start'ta ikinci authority** (§4.6): approved immutable plan yüklenmiş olsa da `runSprint()`
   içindeki legacy Git acquisition **tekrar** çalışıp latest tracked-file'a karşı classify ediyor →
   approved plan için runtime ad-hoc heuristic ikinci policy engine gibi davranıyor.
5. **Dağınık Git okumaları** (§4.10): `sprint-planner.ts:916-939` (fail-soft), `planner.ts:1545-1559`
   (best-effort), task builder, prompt rendering — aynı project truth farklı zaman/root/timeout/
   failure/empty semantics ile yeniden üretiliyor.

**Kesişen yüzeyler:**
- `TRUTH-BASELINE-001` (40) — bu sette **yalnız bu dokümanın** kullandığı truth/evidence sahibi
- `ScopeAdmission` ↔ enforcement §8 track A ↔ provider-neutral §7.1 write class'ları → **§13.1
  ayrımıyla çözülmüş**
- Drift class'ları (§11.4, 6 sınıf) ↔ attempt-effect `CanonicalDriftObservationV1` (§6.6, 4 durum)
  → ⚠️ **iki farklı drift taksonomisi**; biri plan-öncesi baseline drift'i, diğeri post-landing
  canonical drift'i. Ayrı olmaları doğru olabilir ama **isim çakışması** açıkça ayrılmalı.
- Terminal states (§16.2, 10 typed state: `PROJECT_IDENTITY_HOLD`, `SCOPE_SUSPECT_HOLD`,
  `LANDING_SCOPE_HOLD`…) ↔ provider-neutral §14 HOLD taksonomisi (`LANDING_SCOPE_HOLD` **ikisinde de
  var** ✅ — ilk paylaşılan reason code)

**Şüpheli / kontrol edilecek noktalar:**
1. §4.1 `sprint-controller.ts:1888-1989` fail-open zinciri + comment metni → doğrulanacak.
2. §4.4 `run-flow-plan-service.ts:286-336` async/typed unavailable + `:858-869` `SCOPE_GATE_HOLD`
   → doğrulanacak (bu dokümanın **REFUTE** ettiği kısım; en değerli düzeltme).
3. §4.11 `sprint-controller.ts:1945-1957` write failure debug-only → doğrulanacak.
4. §24 "Güncel ledger'da exact owner child yoksa **yeni child gerekebilir**" → owner kararı (§9).

### A9 — `content-provenance-context-integrity-authority-design-2026-08-06.md` (1932 satır — setin en büyüğü)

| Alan | İçerik |
|---|---|
| Karar durumu | KABUL EDİLDİ — Alperen, 2026-08-06 OWASP oturumu, **Bulgu 10** |
| Öncelik | ⭐ **P0** — birincil risk **ASI06 Memory & Context Poisoning**; ASI01/07/09 ile birleşince ASI02/05/08/10'a yayılıyor. Sette **ASI'nin 10'unu da** haritalayan tek doküman |
| Ledger | ⚠️ **`CONTENT-PROVENANCE-001` = ÖNERİLEN yeni satır** (MASTER-PLAN'da yok — bu **beklenen ve dürüst**: doküman "Güncel canonical ledger'da bu outcome'u bütün olarak sahiplenen exact child görünmüyor… `AUTHORITY-001` + `SEC-OWASP-ASI-001` altında P0 owner satırını Alperen onayına sunmalıdır. Bu belge Work ID/order uydurmaz" diyor). Mevcut bağlar: 4190, `PROMPT-001` (9020), `MEMORY-AUTHORITY-001` (190), `RECOVERY-BORN-483/485`, `TRUST-HANDOFF-001`, `AGENT-SKILL-001`, `SKILLMD-INGEST-001` (7120), `MCP-TRUST-001` (7040), `PRINCIPAL-001`, `TENANT-001`, `CAPABILITY-001`, `TOOL-AUTHORITY-001`, `AUDIT-001` |
| Hard arch deps | ⭐ **5 doküman** (setin en bağımlısı): B4, B5, B6, B7, B9 |
| **MCP kararı** | "Owner'ın önceki kararı korunur. MCPv1 trust çözümü bu belgede tasarlanmaz. `MCPV2.md` production cutover sonrasında fresh code-truth değerlendirmesi yapılacaktır. Bu belgenin tek MCP şartı: MCPV2 adapter'larının ortak `ContentArtifact` contractını tüketmesi ve **call consent'i content trust ile karıştırmaması**." ✅ |
| Bugünkü sınıf | 13-satırlı matris. Önceki bulgu **PARTIAL — core gap confirmed**: genel content provenance/taint savunması yok (CONFIRMED); ama "her channel tamamen işaretsiz" fazla geniş (dar foundations var: RunFlow source digest **ENFORCED-narrow**, Memory V2 `source` alanı, ADR taxonomy, native `system/user/tool` rolleri, terminal prompt guard, native permission gate) |
| Sahiplendiği authority | `ContentProvenanceAuthority`, `ContextCompiler` + `ProviderContextCapability`, `MemoryIntegrityAuthority`, project trust enrollment + ADR authority, skill/persona delegated authority, `AgentMessageEnvelope` |
| Config namespace | ⭐ **Açık key veriyor** (§18.1): `content_provenance.mode` = `observe\|shadow\|enforce` · `.unknown_content` = `data_only` · `.binding_provenance_missing` = `hold` · `.project_policy_trust` = `explicit` · `.memory_promotion` = `verified_only` |
| Enforcement enum | `observe \| shadow \| enforce` ✅ |
| Karar enum | `ALLOW_AS_POLICY \| ALLOW_AS_DELEGATED \| ALLOW_AS_DATA \| QUARANTINE \| HOLD` — **5. ayrı karar enum'u** |
| Trust modeli | ⭐ **Tek "trust score" reddediliyor** — 6 bağımsız eksen: authenticity · instruction authority · evidence quality · confidentiality · integrity state · origin risk. Instruction authority sınıfları: `HOST_CORE \| OWNER_POLICY \| PROJECT_POLICY \| DELEGATED_INSTRUCTION \| ADVISORY \| DATA_ONLY \| QUARANTINED` |
| Work packages | W1 reachability → W2 ontology/contracts → W3 ingress adapters → W4 Context Compiler/provider capability → **W5 memory laundering closure (ilk security slice)** → W6 project policy/ADR → W7 skill/persona → W8 inter-agent → W9 tool/web/MCPV2 → W10 capability/effect/landing → W11 human trust UX/audit → W12 cache/storage/scale → W13 rollout/retire/assurance |
| i18n tutumu | §26'da "English/Turkish user-visible strings **i18n mechanism üzerinden gelmelidir**" ✅ (docs-reconciliation listesinde; mekanizma taahhüdü olarak zayıf ama var) |
| Non-goal | 11 non-goal + 28 maddelik "COMPLETE değildir" + **50 maddelik adversarial proof catalog** (setin en büyüğü) |

**P0 bulgu #1 — stored memory provenance laundering (§4.2, §5.1) — setin en somut exploit zinciri:**
```
worker result note (worker-controlled)
  → buildSprintMemoryContent() ilk 120 karakteri/ilk cümleyi alır
     (sprint-retro-writer.ts:555-580)
  → learningContent, mem-<sprint> row'una source:'brain' ile yazılır (:794-799, :851-873)
  → parent worker artifact / attempt identity / result digest / evaluation ref KORUNMAZ
  → sonraki planda sprint-planner.ts:171-174 yalnız "## <title>" + raw content birleştirir
     (source, status, tenant_id, metadata DÜŞER)
  → planner.ts:293-342 tek `CONTEXT:` bloğunda yüksek-priority MEMORY olarak modele gider
```
→ **Tek sprintteki rogue/compromised worker sonraki sprint planner kararlarını kalıcı etkileyebiliyor**;
poison normal result/retro akışından geldiği için meşru görünüyor. Sınıf: "ENFORCED persistence of
unsafe transform; provenance policy ABSENT". Dokümanın kendi ifadesiyle **ilk implementation slice'ının
sahibi** (W5).

**P0 bulgu #2 — repo-controlled project info system-role privilege elevation (§4.3, §5.2):**
`IMMUTABLE_CORE` + `.deckent/soul.md` + `DECKENT.md` + `.deckent/workspace/IDENTITY.md` **aynı string'de**
birleşiyor (`agent/identity.ts:10-26`, `:52-68`) ve OpenAI-compatible adapter bunu tek `role:'system'`
mesajı olarak gönderiyor (`provider-tooluse/openai.ts:74-81`). → Cloned/untrusted workspace native
Terminal agent'ın goal/persona'sını **system authority düzleminde** etkileyebiliyor. `identity.ts`
comment'i immutable core'u "non-overridable" diyor; **aynı system string'inin başında olmak
deterministik non-override garantisi değil.**

**P1 bulgular:** ADR `source_authority`/`enforcement_level` persist edilip binding kararında
tüketilmiyor (§5.3) · inter-agent free text'te causal/evaluation authority yok (§5.4, CONFIG-GATED) ·
worker provider projection tüm trust class'larını tek string'e flatten ediyor (§5.5) ·
`stablePrefixKey()` yalnız `tenantId::taskClass` — project ID yok (§5.6, **UNWIRED/latent**, production
caller'ı yok) · tool-call consent ↔ result trust karışması (§5.7).

**⭐ 4-yollu landing seam hipotezini kesin olarak ÇÖZEN bölüm (§17.1) — dört ayrı soru:**
1. **Content** — bu bytes nereden geldi, hangi authority ile kullanılabilir? (bu doküman)
2. **Capability** — bu principal bu operation/resource'u şimdi çağırabilir mi? (B4/B6)
3. **Effect** — gerçekte hangi bytes değişti, hangi attempt'e ait? (B5)
4. **Landing** — bu attributable effect persistent state'e kabul edilebilir mi? (B4 W7 + B5 W6)
"Bu authorities causal refs ile bağlıdır fakat **birbirinin yerine geçmez**." §17.2: `OWNER_POLICY`
content bile tek başına tool grant değil — ContentDecision **capability'yi genişletemez**.
→ project-inventory §13.1 (3 soru) + bu §17.1 (4 soru) birlikte: **çakışma yok, katmanlı ayrım var.**

**Kesişen yüzeyler:**
- `AgentMessageEnvelope` (§15) ↔ audit `AUDIT-001` Bulgu 12/ASI07 non-goal'ü → ⚠️ audit dokümanı
  inter-agent güvenliği "Bulgu 12/ASI07 ayrı kapsamdadır" diye kapsam dışı bırakıyordu; **bu doküman
  onu üstleniyor** (§15). → Bulgu 12'nin sahibi belirsizlikten çıkıyor ✅ (§4'te kayıt)
- §11.5 protected authority set ↔ `prompt-segmentation.ts:174-221` `findUnprotected()` mevcut foundation
- §12 Memory ontology ↔ `MEMORY-AUTHORITY-001` (190) ↔ ADR-G-035 (ürün user-memory `.brain/memory.db`)
- §20.3 prompt cache key ↔ `PROMPT-001` (9020)

**Şüpheli / kontrol edilecek noktalar:**
1. §4.2 laundering zinciri (4 dosya, 6 satır aralığı) → **doğrulanacak, en yüksek öncelik**.
2. §4.3 `identity.ts:52-68` + `openai.ts:74-81` tek system string → doğrulanacak.
3. §4.13 `stablePrefixKey()` = `tenantId::taskClass` ve **production caller'ı olmadığı** iddiası →
   doğrulanacak (latent/UNWIRED sınıflandırmasının doğruluğu buna bağlı).
4. §4.6 `worker_comms` default-off (`config-types.ts:154-164`) → doğrulanacak (risk sınıfının
   CONFIG-GATED kalması buna bağlı).

---

## 1. Doküman seti haritası

| # | Bulgu | Doküman | Primary ledger | Set-içi hard dep | Yeni ledger satırı? |
|---|---|---|---|---|---|
| A1 | 1 | plugin-admission (08-05) | `PLUGIN-SANDBOX-WIRE-001` (7031) | — (ilk) | Hayır — 7031 mevcut |
| A2 | 2 | rolling-spend-budget (08-05) | `LIMIT-SPEND-ENFORCE-001` (4091) | — | Hayır — 4091 mevcut |
| A3 | 3 | audit-authority-integrity | `AUDIT-001` (4120) | — | Hayır |
| A4 | 4 | provider-neutral-worker | `TOOL-AUTHORITY-001` (4060) | — | Hayır |
| A5 | 5 | attempt-effect-attribution | `TRUST-HANDOFF-001` (4180) | B4 | Hayır |
| A6 | 6 | enforcement-module-disposition | `SEC-ENFORCE-WIRE-001` (4200) | B4, B5, B1 | Hayır |
| A7 | 7 | terminal-session-execution | 14 sahip (child gerekebilir) | B4, B5, B6 | ⚠️ **Belki** — doküman soruyor |
| — | **8** | **MCP — doküman YOK** | `MCP-TRUST-001` (7040) | — | **DEFERRED/HOLD (owner)** |
| A8 | 9 | project-inventory-scope | `TRUTH-BASELINE-001` (40) + 4200 | B4, B5, B6 | ⚠️ **Belki** — doküman soruyor |
| A9 | 10 | content-provenance-context | ⚠️ **`CONTENT-PROVENANCE-001` = önerilen** | B4, B5, B6, B7, B9 | ✅ **Evet** — P0, açıkça öneriliyor |

**Bulgu numarası boşlukları (OWASP oturumunda ≥16 bulgu, sette 9 doküman):**

| Bulgu | Konu | Durum |
|---|---|---|
| 8 | MCP trust | **Owner kararıyla DEFERRED/HOLD** — MCPV2 cutover sonrası fresh değerlendirme ✅ |
| 11 | Approval decision integrity (`APPROVAL-001` 4050) | ❌ **Doküman YOK** — ama 3 doküman (A2 W6, A3, A6, A7) buna **hard dependency** |
| 12 | Inter-agent communication security (ASI07) | ⚠️ A3 kapsam dışı bıraktı; **A9 §15 üstlendi** (`AgentMessageEnvelope`) — sahiplik çözüldü ✅ |
| 13, 14, 15 | ? | ❌ **Hiçbir dokümanda anılmıyor** — kayıp/kapanmış/başka isimle mi belirsiz |
| 16 | Plugin runtime process isolation (`PLUGIN-SANDBOX-001` 7030) | ❌ **Doküman YOK** — A1 parent closure olarak işaretliyor |

→ **Kayıp bulgu listesi §9'da owner kararına sunuluyor.**

---

## 2. Authority seam register

Aynı runtime authority'sini iddia eden dokümanlar. **Sonuç: setin seam hijyeni beklenenden çok
daha iyi** — dokümanlar birbirini header'da hard-dependency olarak beyan edip sahiplik devrediyor.

| Authority | Sahip | Tüketiciler | Çakışma durumu |
|---|---|---|---|
| `ToolAuthorityGateway` | **A4 §8 (W5)** | A6 §8 (absorb, D3) · A7 §9.1 (shared dep) · A8 §13.2 · A9 §17.2 | ✅ **ÇÖZÜLMÜŞ** — A6 D3 "ayrı motor olmaz", A7 §9.1 "terminal ayrı sandbox üretmemelidir" |
| `LandingAuthority` | **A4 §13 (W7)** | A5 §6.7+W6 · A8 §13.4 · A9 §17.5 | ✅ **ÇÖZÜLMÜŞ** — A5 D15 "ikinci sandbox/workspace/landing implementation'ı yapılmaz" |
| `ExecutionEnvironmentAdapter` | **A4 §12 (W4)** | A5 W3 · A7 §9.1 · A8 §8.5 · A9 §21 | ✅ ÇÖZÜLMÜŞ — hepsi `ENV-ADAPTER-001` (8010) altında |
| `AuditAuthority` / receipt chain | **A3 (4120)** | A1 §7.4 · A4 `ExecutionAuditBridge` · A5 §21.1 · A6 §14.3 · A7 §13 · A9 §19.4 | ✅ ÇÖZÜLMÜŞ — 6 doküman açıkça tabi oluyor. **A2 tek istisna** (§5.5 kendi hash-chain'i, açık ifade yok) ⚠️ |
| `PrincipalAuthority` / RBAC | **A6 §7.1+§9 (W2)** | A7 §7.2 (`AuthenticationAuthority`) · A9 §10.2 | ⚠️ **KISMEN** — A6 `ResolvedPrincipalV1`, A7 ayrı `AuthenticationAuthority` sonucu tanımlıyor; **birleştirilmeli** |
| `ArtifactAdmission` | **A6 §11 (W6–W8)** | A1 (plugin-specific trust roots) | ⚠️ **ENUM ÇAKIŞMASI** — bkz §4-C1 |
| Protected resource catalog | **A6 §7.4** (11 sınıf) | A5 §9.4 (path listesi) · A9 §13 | ⚠️ **KISMEN** — A6'nın sınıflı hali kanonik olmalı, A5'in listesi instance'ı |
| `ApprovalBroker` | ❌ **SAHİPSİZ** (`APPROVAL-001` / Bulgu 11) | A2 §10 · A6 §10.5 · A7 §12 · A8 §10 · A9 §18.4 | ❌ **UNDEFINED-DEP** — 5 doküman tüketici, 0 tasarım |
| `OperationCatalog` | ❌ **SAHİPSİZ** (`OPERATION-001` 4030) | A3 D10 · A4 §18 · A7 §7.3 (terminal-specific 12 op) | ❌ **UNDEFINED-DEP** |
| `CapabilityEnvelope` | **A4 §6.1 (W2)** | A5 · A6 · A7 §7.4 (`SessionCapabilityGrant`) · A8 · A9 | ⚠️ A7 kendi grant tipini tanımlıyor — envelope'un session-profili mi, ayrı tip mi? |
| Content/context | **A9** | — (en aşağı akış) | ✅ Tek sahip |
| Project inventory | **A8** | A9 §21 (non-Git/greenfield) | ✅ Tek sahip |
| Budget/spend | **A2** | A4 §6.1 `budgetRef` · A7 quotas | ✅ Tek sahip |

**Katmanlı ayrım — setin en güçlü tasarım kararı (A8 §13.1 + A9 §17.1 birlikte):**

```
1. CONTENT   — bu bytes nereden geldi, hangi authority ile kullanılabilir?        → A9
2. SCOPE     — planlanan path mantıklı/izinli mi?                                 → A8
3. CAPABILITY— bu principal bu operation/resource'u şimdi çağırabilir mi?         → A4 + A6
4. EFFECT    — gerçekte hangi bytes değişti, hangi attempt'e ait?                 → A5
5. LANDING   — bu attributable effect persistent state'e kabul edilebilir mi?     → A4 W7 + A5 W6
6. EVIDENCE  — bütün kararlar tamper-evident zincirde mi?                         → A3
```
Bu 6 katman **çakışmıyor, sıralanıyor.** Başlangıç hipotezim ("4-yollu landing çakışması") **çürütüldü.**

---

## 3. Code-truth doğrulama sonuçları

HEAD `77bc721ae`'e karşı 22 yüksek-değerli iddia test edildi. **Sonuç: 22/22 doğrulandı; hiçbir
doküman iddiası çürütülmedi.** İki iddia dokümanın söylediğinden **daha güçlü** çıktı.

| # | İddia | Doküman | Kanıt | Verdict |
|---|---|---|---|---|
| V1 | `AUDIT_HMAC_SECRET = 'deckent-audit'` sabit + **export** | A3 §2 | `audit-writer.ts:35`; docstring: "Exported so an independent verifier can recompute a written record's hmac" + "tracked follow-up: a production deployment should thread a single config/secret-manager-sourced secret" | ✅ **CONFIRMED** — kod yorumu boşluğu kendisi kabul ediyor |
| V2 | `registerPluginHooks(plugin, securityConfig?)` config yoksa validation atlanır | A1 §2 | `plugin-hooks.ts:166-190` `if (securityConfig) {…}` | ✅ CONFIRMED |
| V2b | Plugin hatası stderr + sonraki plugin | A1 §2 | `plugin-hooks.ts:231-239` "Non-fatal — log and continue" | ✅ CONFIRMED |
| V2c | `runSprint` → `loadPluginHooks(projectRoot)` options'sız | A1 §2 | `sprint-controller.ts:1654-1655` — **üstelik `catch { debugLog(...) }` içinde** | ✅ **CONFIRMED+** (dokümandan daha zayıf durum) |
| V3 | `checkSpendGate` warn-only | A2 §2 | `cost-gate.ts:237` docstring: "**warn-only, never blocks**" | ✅ CONFIRMED |
| V3b | `enforce_spend_gate` adı davranışla çelişkili | A2 §2 | `cost-config-loader.ts:78-81`: "Warn-only — sprint is never blocked. Default: false." | ✅ CONFIRMED (kelimesi kelimesine) |
| V4 | `resource-log.jsonl`'e `costUsd` yazan production producer YOK | A2 §2.1 | `resource-monitor.ts`'de `costUsd` **0 eşleşme**; yalnız reader `cost-config-loader.ts:414-419` | ✅ **CONFIRMED** — en yüksek değerli bulgu doğru |
| V5 | `filesWrite` boşsa `[]` (fail-open) | A5 §2.1 | `result-evaluator.ts:2381-2382` | ✅ CONFIRMED |
| V5b | `*.md` post-hoc exemption (control dosyaları hariç) | A5 §2.1 | `result-evaluator.ts:2409-2414` + `CONTROL_MD_FILES` | ✅ CONFIRMED |
| V6 | `git hash-object -w` canonical `.git/objects`'e yazıyor | A5 §2.5 | `spawn-backend-docker.ts:1989`, `:2076` | ✅ CONFIRMED |
| V7 | Project root broad RW mount | A4 §2.3 | `spawn-backend-docker.ts:5664` `['-v', dir:CONTAINER_WORKSPACE]`; yorum: "implementation workers **retain the project read-write mount**" | ✅ CONFIRMED |
| V7b | Allowlist'te unscoped `Bash` | A4 §2.4 | `spawn-backend-docker.ts:3574` `Read,Write(…),Edit(…),Bash,Glob,Grep` | ✅ CONFIRMED |
| V7c | `autoApprove` default `true` | A4 §2.1 | `execution-request-builder.ts:177` `input.autoApprove ?? true` | ✅ CONFIRMED |
| V8 | 4 enforcement API'sinin production caller'ı yok | A6 §2 | `createScopeGate` 0 prod/1 test · `enforceSelfModifyingTask` 0/1 · `requireSafe` 0/1 · `worker.checkWorkerAuthority` 0 prod (nervous versiyonu `backlog-trigger.ts:32`, `sprint-runtime.ts` ile **wired** — A6 bunu doğru ayırıyor) | ✅ CONFIRMED |
| V9 | `self_mod_enforce` config schema'da yok | A6 §3.4 | Yalnız `self-modifying-detector.ts` yorum/reason string'lerinde (`:198`, `:241`, `:248`); `config-types.ts`/`config.ts`'de **yok** | ✅ CONFIRMED |
| V10 | Missing/unknown role → allow-all | A6 §3.3 | `authority-matrix.ts:303-333`: "No actor / no role / unknown role → `permit` (allow-all; backward-compatible)" | ✅ CONFIRMED (kelimesi kelimesine) |
| V11 | Unknown `SessionKind` → `SHELL_CMD` fallback | A7 §4.6 | `session-manager.ts:71` `(KIND_CMD[input.kind] ?? SHELL_CMD)(input)` | ✅ CONFIRMED |
| V11b | Guard `kind !== 'shell'` ise tüm input'u muaf tutuyor | A7 §4.6 | `command-guard.ts:55` `if (ctx.kind !== 'shell') return [];` | ✅ CONFIRMED |
| V11c | — | — | **EK BULGU:** `session-manager.ts:120` `host: this.opts.host ?? 'localhost'` → opts.host undefined ise `'localhost'` → `LOCALHOST_HOSTS` → **üçüncü bypass yolu** | ⚠️ **YENİ** |
| V12 | `SessionMeta` principal/owner/project taşımıyor | A7 §4.7 | `terminal/types.ts:13-20` = `{id, kind, tenantId, createdAt, status, exitCode}` | ✅ CONFIRMED |
| V12b | `list()` tüm map'i döndürüyor | A7 §4.7 | `session-manager.ts:106-108` | ✅ CONFIRMED |
| V13 | `AuthProvider.verify()` yalnız boolean | A7 §4.8 | `auth-provider.ts:15-26` `verify(): boolean`, `verifyAsync(): Promise<boolean>` | ✅ CONFIRMED |
| V14 | Legacy scope gate bilinçli fail-open | A8 §4.1 | `sprint-controller.ts:1917` yorum: "**Fail-OPEN: a git failure never blocks a legitimate sprint**"; `:1986-1988` `catch { if BrainError throw; debugLog(…) // git/other failure → fail-open }`; `:1919` `spawnSync` | ✅ CONFIRMED (kelimesi kelimesine) |
| V14b | Task JSON write failure debug-only | A8 §4.11 | `sprint-controller.ts:1957` `catch (wErr) { debugLog('…scopeGateAdopt:persist', wErr); }` | ✅ CONFIRMED |
| V15 | Memory laundering zinciri | A9 §4.2 | `sprint-planner.ts:173` `memEntries.map(e => '## ${e.title}\n${e.content}')` (source düşüyor) + `sprint-retro-writer.ts:828/843/859/948/962/983` `source: 'brain'` | ✅ **CONFIRMED** — P0 zincir gerçek |
| V15b | Native identity tek system string | A9 §4.3 | `agent/identity.ts:52-69` `parts.join('\n\n')` — IMMUTABLE_CORE + soul + DECKENT.md + IDENTITY.md | ✅ CONFIRMED |
| V15c | `stablePrefixKey` = `tenantId::taskClass`, production caller YOK | A9 §4.13 | `prompt-segmentation.ts:232-234`; grep: yalnız tanım, **0 çağrı** | ✅ CONFIRMED — UNWIRED/latent sınıflandırması doğru |
| V16 | RunFlow gerçekten fail-closed | A8 §4.4 (REFUTE) | `run-flow-plan-service.ts:287-339` async `spawn` + 10s timeout + 64MiB + typed `unavailable`; `SCOPE_GATE_HOLD` `:470`, `:480` | ✅ CONFIRMED — **A8'in kendi genellemeyi çürütmesi haklı** |
| V17 | `worker_comms` default-off | A9 §4.6 | `config-types.ts:155` "Opt-in — **absent block = disabled**" | ✅ CONFIRMED |
| V19 | Skill update önce siliyor, checksum sonra + non-fatal | A6 §3.5 | `skill.ts:542`, `:550` `rmSync(skillDir, …)`; install `--force` `:384`, `:459` aynı sınıf; checksum `:394-405` **cpSync sonrası** + "checksum is optional — skip on failure" | ✅ **CONFIRMED** — en yüksek riskli iddia doğru |
| V20 | `SKILL.md` doğrudan worker prompt'una, digest'siz | A6/A9 | `result-collector.ts:1005-1017` `readFile(skillPath)` → `{name, content}` | ✅ CONFIRMED |

**Doğrulama hükmü:** Codex'in code-truth baseline'ları **güvenilir**. Satır numaraları ±3 satır
içinde isabetli. Dokümanların kendi öz-şüphesi ("bu belgedeki absence iddiasını stale kabul edip kör
kullanma") sağlıklı ama bu tur için **gereksiz temkin** çıktı — iddialar HEAD'de hâlâ geçerli.

---

## 4. Çatışma ve boşluk register

### C — CONTRADICTION (tipli çelişki; birleştirme gerekli)

| ID | Konu | Detay | Etkilenen | Öneri |
|---|---|---|---|---|
| **C1** | Admission karar enum'u | A1 `allow \| quarantine \| hold` vs A6 `ADMIT \| REJECT \| HOLD`. Aynı trust-plane (A6 D14 "plugin admission trust roots yeniden icat edilmez") iki enum ile karar veriyor. Ayrıca `quarantine` A1'de **karar değeri**, A6'da **ayrı store/state** | A1 §7.3, A6 §7.9 | Tek `AdmissionDecision`: `ADMIT \| QUARANTINE \| REJECT \| HOLD`; quarantine hem karar hem durum olarak açıkça tanımlı |
| **C2** | `LandingReceipt` iki tanım | A4 §6.5 alanları sayıyor; A5 §6.7 "Bulgu 4 contract'ı **genişletilmeden** bağlanır" diyor ama `sourceManifest`, `classificationDecision`, `no omitted/extra effects proof` **ekliyor** | A4 §6.5, A5 §6.7 | Tek `LandingReceiptV1`; A5'in alanları A4'ün şemasına **normatif ekleme** olarak yazılsın |
| **C3** | Üç/dört trust-vocabulary'si | A3 `sourceTrust: host_verified\|provider_verified\|worker_claim\|caller_claim` · A5 `provenanceQuality: STRUCTURAL\|RECEIPT_CAUSAL\|OBSERVED\|AMBIGUOUS` · A5 `assuranceState` (6 değer) · A9 6-eksenli model | A3 §8.2, A5 §6.2+D4, A9 §9.1 | A9'un **6-eksenli modeli kanonik**; A3/A5 enum'ları o eksenlere **eşleme tablosu** ile bağlansın (tek enum'a indirgeme değil) |
| **C4** | Enforcement mode enum'u | `observe\|shadow\|enforce` **6 dokümanda** (A4,A5,A6,A7,A8,A9) ✅ · A1 `enforce\|quarantine_optional` · A2 `advisory\|enforce` · A3 `unsealed\|host_sealed\|externally_anchored` (assurance modu, farklı eksen — meşru) | Tümü | `observe\|shadow\|enforce` kanonik rollout enum'u; A1/A2 buna migrate; A3'ün assurance modu **ayrı eksen olarak korunsun** |
| **C5** | Drift taksonomisi | A8 §11.4 6 sınıf (plan-öncesi baseline drift) vs A5 §6.6 4 durum (post-landing canonical drift) | A5, A8 | Ayrı olmaları **doğru**; isimler açıkça `BaselineDrift` / `CanonicalDrift` olarak ayrılsın |
| **C6** | Principal contract'ı | A6 §7.1 `ResolvedPrincipalV1` vs A7 §7.2 `AuthenticationAuthority` sonucu (11 fact) | A6, A7 | A6 kanonik producer; A7'nin listesi terminal-specific **adapter gereksinimi** olarak yazılsın |
| **C7** | Karar enum'ları çoğalması | `ALLOW\|DENY\|HOLD` (A6) · `+NOT_REQUIRED` (A8) · `ALLOW_AS_POLICY\|ALLOW_AS_DELEGATED\|ALLOW_AS_DATA\|QUARANTINE\|HOLD` (A9) · `CLEAR\|ACTION_REQUIRED\|HOLD` (A6 runtime impact) | A6, A8, A9 | Farklı authority'lerin farklı karar uzayı olması meşun; ancak **ortak `HOLD` semantiği + ortak reason-code registry** zorunlu kılınsın |

### D — DUPLICATE (çözülmüş; kayıt için)

| ID | Konu | Durum |
|---|---|---|
| D1 | Tool/scope authority 3-yollu | ✅ A6 D3 absorb + A7 §9.1 shared-dep ile çözülmüş |
| D2 | Landing 4-yollu | ✅ A5 D15 + A8 §13.1 + A9 §17.1 ile katmanlı ayrıma dönüşmüş |
| D3 | Platform adapter matrisi 4 yerde (A3 §7, A4 §12.2, A5 §8.7, A7 §16, A8 §18, A9 §21) | ⚠️ **Kısmen** — hepsi `ENV-ADAPTER-001`'e atıf yapıyor ama **6 ayrı facet listesi** var; tek capability registry'ye indirgenmeli |
| D4 | Protected resource catalog 3 yerde | ⚠️ Kısmen — A6'nın sınıflı hali kanonik seçilmeli |

### U — UNDEFINED-DEP (set-dışı bağımlılık; tasarım yok)

| ID | Ledger | Tüketici sayısı | Kritiklik |
|---|---|---|---|
| **U1** | `APPROVAL-001` (4050) / **Bulgu 11** | **5** (A2 §10 W6, A3 §19, A6 §10.5, A7 §12, A9 §18.4) | 🔴 **En kritik** — A2 W6 açıkça "Bulgu 11 kapanmadan override capability enable edilmez"; A7 break-glass'ın tamamı buna bağlı |
| **U2** | `OPERATION-001` (4030) operation catalog | **3** (A3 D10 completeness, A4 §18, A7 §7.3) | 🟠 A3'ün completeness reconciler'ı bu katalog olmadan çalışamaz |
| **U3** | `CAPABILITY-001` (4040) | **5** (A4, A6, A7, A8, A9) | 🟠 A4 §18 DAG'ının tepesinde |
| **U4** | `TENANT-001` (4020) | **3** (A4 §18, A7, A9 §20.2) | 🟡 |
| **U5** | `RECEIPT-001` (4070) immutable receipts | **4** (A2, A3, A4, A7) | 🟡 A3 bunu "causal index" olarak mühürlüyor ama üretici tanımı yok |
| **U6** | `PLUGIN-SANDBOX-001` (7030) / **Bulgu 16** | 2 (A1 D10 parent closure, A6 W8) | 🟠 A1 açıkça "7030 kapanmadan 'plugins are sandboxed' denemez" |
| **U7** | `MCP-TRUST-001` (7040) / **Bulgu 8** | 3 (A1 non-goal, A8 not, A9 §16.4) | ✅ **Owner kararıyla DEFERRED** — §8 |

**Yapısal hüküm:** 9 doküman, tasarlanmamış **5 foundation authority** (U1–U5) üzerinde duruyor.
A4 §18 DAG'ının tepesi `OPERATION-001 + PRINCIPAL-001 + TENANT-001 → CAPABILITY-001 + APPROVAL-001`.
`PRINCIPAL-001` kısmen A6 §7.1 ile karşılanıyor; kalan 4'ü açık. → **§11 devir girdisinin ilk maddesi.**

### O — ORDERING (DAG yön çelişkisi)

| ID | Detay | Çözüm önerisi |
|---|---|---|
| **O1** | A4 §18 DAG'ında `RECEIPT-001 + AUDIT-001 + KERNEL-SETTLEMENT-001` W7 landing'in **aşağı-akışında**; ama A4 §21 "`AUDIT-001` … **hard dependency**'dir" ve A3 §9.2 "security-critical operation intent/decision record'u commit olmadan **effect capability mint edilmez**" | **A3 iki yönlü**: (a) `AuditIntent`/pre-effect append **yukarı-akış** (capability mint'ten önce), (b) checkpoint/anchor/completeness **aşağı-akış** (settlement sonrası). A4 DAG'ı bu ikiliyi ayırmalı |

### M — MISSING-RECALL (Kanun 2 ihlali — setin en önemli sistemik bulgusu)

**9 dokümanın 8'i HİÇBİR ADR'ye atıf yapmıyor.** Yalnız A7 (terminal) `adr-g-029`'u anıyor ve
doğru prosedürü (amendment/successor, sessiz rewrite yok) öneriyor.

Kanun 2: *"spec/NL yazmadan ÖNCE alan-ADR-recall zorunlu; çelişki = önce amendment-önerisi."*
Repo'da 51 ADR (38'i G-serisi) var. Konu-alanı doğrudan örtüşen, **hiç anılmayan** ADR'ler:

| ADR | Kapsam | Etkilenen doküman | Neden kritik |
|---|---|---|---|
| **ADR-G-020** *Authority, Roles, Flow & Enforcement (Multi-Mode RBAC)* — `accepted` | Authority anayasası + **hardening roadmap** | **A6 (Bulgu 6), A4, A2** | 🔴 ADR-037 RBAC V1.0'ı **absorbe ediyor** (`Crosswalk: ADR-037 → ADR-G-020`) ve A6'nın önerdiği işi **adıyla** planlıyor: `AUTHORITY-SSOT` (§103: "authority-enforcer.ts + nervous/authority-matrix.ts — not yet a single SSOT"), Layer-2 **`HARD-flip`**, `POLICY-ENGINE-EVAL`. Ayrıca flag-gated enforcement vein'de **`B1 enforce_rbac` ve `B6 cost_limits.enforce_spend_gate`** zaten listeli (§108) → **A2'nin işi de burada** |
| **ADR-G-029** *Embedded Web Terminal* — `accepted (provisional)`, **`Immutable: yes`** | Terminal PTY/WS/guard | A7 ✅ (tek doğru recall) | 🟠 A7 çatışmayı doğru tespit ediyor. **Ek nüans:** ADR zaten `AUDIT-WIRE` (no-op sink) ve `TERM-CONFIG-WIRE` (hardcoded TerminalConfig) boşluklarını **kendisi kaydetmiş**. `Immutable: yes` → amendment/successor **zorunlu**, in-place düzeltme yasak |
| **ADR-G-036** *Zero-hardcode model/flow* | Kanun 10 | **Tümü** (9/9 config bölümü) | 🟠 Her doküman "exact key adı implementation'a bırakıldı" diyor — bu doğru ama ADR-G-036 ratchet'i ile hizalanmalı |
| **ADR-G-035** *Memory architecture* | `.brain/memory.db` ürün-belleği | **A9 §12** | 🟠 A9 `MemoryIntegrityAuthority` tasarlıyor; ADR-G-035 mevcut mimariyi tanımlıyor |
| **ADR-G-018** *Verification protocol & event stream* | Event stream | **A3 §2** (`event-stream.ts` baseline'ı) | 🟡 |
| **ADR-D-005** *Dependency policy* | Yeni bağımlılık admission'ı | A3 (KMS/HSM/Vault), A4 (OCI/sandbox), A9 (CAS) | 🟡 Yeni crypto/platform adapter'ları dep gerektirebilir |

**Risk:** ADR-G-020 zaten kabul edilmiş bir hardening roadmap taşıyorken A6'nın aynı işi bağımsız
tasarlaması → **çifte governance framing**. Aynı işin iki ayrı "kabul edilmiş karar" kaydı olur.

**Bu bir doküman kalitesi kusuru değil, prosedür boşluğu:** her doküman §"başka session'a girdi"
bölümünde "ADR truth drift'ini typed amendment ile çöz" diyor — yani **iş devredilmiş, yapılmamış.**
Kanun 2 recall'un **spec yazılmadan ÖNCE** olmasını istiyor. → §10-E1 düzeltme önerisi.

---

## 5. Birleşik DAG ve doküman-arası dosya çakışması

### 5.1 Birleşik faz DAG'ı

Dokümanların 9 ayrı DAG'ı tek zincire indirildiğinde:

```
FAZ 0 — TASARLANMAMIŞ FOUNDATION (set-dışı, §4-U)
  OPERATION-001(4030) · CAPABILITY-001(4040) · APPROVAL-001(4050/Bulgu 11) · TENANT-001(4020) · RECEIPT-001(4070)
        │  (PRINCIPAL-001 kısmen A6 §7.1 ile karşılı)
        ▼
FAZ 1 — EVIDENCE TABANI (her şeyin altında)
  A3 AUDIT-001 W1 contracts + W2 key providers + W3 host ledger
        │  ⚠️ A3'ün pre-effect append'i FAZ 2'nin capability mint'inden ÖNCE olmak zorunda (§4-O1)
        ▼
FAZ 2 — EXECUTION ÇEKİRDEĞİ (setin merkezi)
  A4 TOOL-AUTHORITY-001 W1 contracts → W2 envelope → W3 projection → W4 env adapters
        │
        ├──────────────► A6 W2 principal/authz (ENTERPRISE-AUTH-001) ── paralel
        │
        ▼
FAZ 3 — GATEWAY + SCOPE
  A4 W5 ToolAuthorityGateway · A4 W9 network/secrets
  A6 W3 tool/scope capability (absorb tool-scope-gate) · A8 W2–W5 inventory + scope admission
        ▼
FAZ 4 — CUTOVER
  A4 W6 provider/backend launch cutover · A4 W8 OOB supervisor
  A8 W6–W7 RunFlow cutover + execution admission/drift
  A6 W4 RBAC cutover · A6 W5 protected mutation/runtime impact
  A7 W2–W4 terminal principal/registry/ingress cutover
        ▼
FAZ 5 — EFFECT + LANDING
  A5 W1–W5 (contracts/CAS/discovery adapters/classification/provider wiring)
  A4 W7 LandingAuthority closure  ←→  A5 W6 landing/settlement integration
  A5 W7 auditor/drift · A8 W8–W9 repair authority + effect/landing integration
        ▼
FAZ 6 — CONTENT (en aşağı akış; 5 hard dep)
  A9 W2–W4 ontology/ingress/Context Compiler
  A9 W5 memory laundering closure  ← ⭐ A9'un kendi seçtiği İLK security slice
  A9 W6–W10 project policy/ADR · skill · inter-agent · tool/web · capability entegrasyonu
        ▼
FAZ 7 — ARTIFACT + SUPPLY CHAIN (yan koldan bağlanır)
  A1 W1–W6 plugin admission · A6 W6–W8 artifact inventory/analyzer/admission
        ▼
FAZ 8 — SPEND (bağımsız kol; yalnız ingress'te birleşir)
  A2 W1–W3 money/ledger/lease → W4 all-ingress wiring (FAZ 4 ile birleşir) → W5 landing/settlement
        │  ⚠️ A2 W6 override → APPROVAL-001'e HARD BLOK
        ▼
FAZ 9 — RETIRE + ASSURANCE (hepsinin sonrası)
  A6 W9 legacy retirement · A7 W7 guard retire · A8 W10 legacy cutover
  Tüm dokümanların W-son: every-environment real-binary + cross-provider XVerify
```

**Kritik yol (en uzun zincir):** FAZ 0 → A3 → A4 W1-W7 → A5 → A9 W5. `APPROVAL-001` (U1) ve
`OPERATION-001` (U2) tasarlanmadan FAZ 2'nin tamamı **admission-eksik** kalır.

### 5.2 Doküman-arası dosya çakışması (hiçbir doküman bunu kontrol etmedi)

Her doküman kendi içindeki collision'ı uyarıyor; **doküman-arası** çakışma ilk kez burada ölçüldü.
Aynı dosyayı ≥3 doküman touchpoint olarak listeliyorsa **aynı trende paralel worker'a verilemez.**

| Dosya | Doküman sayısı | Dokümanlar | Serileştirme hükmü |
|---|---|---|---|
| `src/core/config-types.ts` | **6** | A1, A2, A3, A6, A7, A9 | 🔴 **Tek worker, tek slice.** Setin en büyüğü. Her doküman config alanı ekliyor |
| `src/core/config.ts` | **6** | A1, A2, A3, A4, A6, A7 | 🔴 **Tek worker, tek slice** |
| `src/orchestra/sprint-controller.ts` | **4** | A1 (plugin ingress), A2 (dispatch), A8 (scope gate), A9 | 🔴 Serileştir |
| `src/orchestra/sprint-spawner.ts` | 3 | A4, A6, A9 | 🟠 Serileştir |
| `src/orchestra/sprint-planner.ts` | 3 | A6, A8, A9 | 🟠 Serileştir |
| `src/orchestra/result-collector.ts` | 3 | A2, A6, A9 | 🟠 Serileştir |
| `src/core/errors.ts` | 3 | A1, A2, A3 | 🟠 Serileştir (typed reason code'lar) |
| `src/cli/helpers/messages.ts` | 3 | A1, A2, A3 | 🟠 Serileştir (i18n key'ler) |
| `src/orchestra/spawn-backend-docker.ts` | 2 (27 atıf) | A4, A5 | 🟠 Aynı fazda (FAZ 4/5) — koordineli |
| `src/api/server.ts` | 2 (13 atıf) | A3, A7 | 🟡 |
| `src/providers/{claude,codex,gemini}.ts` | 2 her biri | A4, A9 | 🟡 |
| `src/orchestra/execution-landing-coordinator.ts` | 2 | A2, A4 | 🟡 |
| `src/core/task-result-settlement.ts` | 2 | A2, A5 | 🟡 |
| `src/mcp/tools/start.ts` | 2 | A2, A6 | ⏸️ **MCP — deferred (§8)** |
| `src/api/terminal/{ws-gateway,prompt-guard}.ts` | 2 | A7, A9 | 🟡 |
| `src/agent/loop.ts` | 2 | A6, A9 | 🟡 |
| `src/core/skill-pool.ts` | 2 | A6, A9 | 🟡 |

**Öneri:** `config-types.ts` + `config.ts` için **tek birleşik config-authority slice'ı** açılsın
(9 dokümanın config namespace'ini tek şema/migration turunda toplayan). Aksi halde 6 doküman aynı
dosyada ardışık merge conflict üretir ve legacy migration semantiği parçalanır.

---

## 6. MASTER-PLAN eşleme doğrulaması

43 ledger ID'nin tamamı `docs/MASTER-PLAN.md`'ye karşı kontrol edildi.

| Durum | Sayı | Detay |
|---|---|---|
| ✅ Resolve ediyor | **42/43** | Tümü mevcut satırlara bağlanıyor |
| ⚠️ Resolve etmiyor | **1** | `CONTENT-PROVENANCE-001` — **beklenen ve dürüst**: A9 bunu açıkça "önerilen yeni P0 satır, `AUTHORITY-001` + `SEC-OWASP-ASI-001` altında, Alperen onayına sunulmalı" olarak işaretliyor ve "Work ID/order uydurmaz" diyor |

**Tek-atıflı (dolayısıyla kırılgan) ID'ler** — ledger'da yalnız 1 kez geçiyor, drift riski yüksek:
`PLUGIN-SANDBOX-WIRE-001`, `LIMIT-SPEND-ENFORCE-001`, `TRUST-HANDOFF-001`, `SEC-ENFORCE-WIRE-001`,
`MCP-TRUST-001`, `SKILLMD-INGEST-001`, `RECOVERY-BORN-480-ATTRIBUTION-001`,
`RECOVERY-BORN-485-PROMPT-POLICY-001`. → Devir session'ı bu 8 satırın **güncel state/evidence'ını**
öncelikle doğrulamalı (dokümanların hepsi bunu zaten istiyor).

**Yeni child satırı gerekebilir diyen 3 doküman:** A7 (terminal — 14 parent'a dağılmış), A8
(shared Project Inventory Authority), A9 (`CONTENT-PROVENANCE-001` — kesin). Üçü de "ID/order
uydurmaz, owner'a sunar" diyor ✅ — bu **doğru davranış**, MASTER-PLAN §3.3 satır invariant'larına saygı.

**Hiçbir doküman MASTER-PLAN'ı mutate etmemiş** — 6 doküman bunu açıkça beyan ediyor. Doğrulandı:
`git status` MASTER-PLAN'da değişiklik göstermiyor ✅

---

## 7. Yasa ve kontrat conformance

| Kural | Sonuç | Detay |
|---|---|---|
| **Kanun 1** (ölçek + MVP-yasağı + agentic-OS) | ✅ **Güçlü** | Her doküman multi-tenant/million-scale bölümü taşıyor (A2 §12 W2, A3 §10.3, A4 §19.7, A5 §14.4, A6 §15.3, A7 §15, A8 §17.3, A9 §20). MVP izi yok — aksine A4/A9 "ikinci implementation yapılmaz" diyerek genişliği koruyor |
| **Kanun 2** (ADR'ler ihlal edilemez, **önce recall**) | 🔴 **İHLAL** | **8/9 doküman ADR-recall yapmamış.** Yalnız A7 `adr-g-029`'u anıyor. ADR-G-020/G-036/G-035/G-018/D-005 hiç anılmıyor. Detay §4-M |
| **Kanun 3** (kanıt=çalışan kod + onay-akışı) | ✅ | Her doküman "unit-green ≠ DONE", real-binary + producer→consumer→ingress→policy zinciri şartı koyuyor; "Explicit non-goals ve yanlış COMPLETE iddiaları" bölümleri örnek kalitede |
| **Kanun 4** (Türkçe + SSOT) | ✅ | Anlatım Türkçe, teknik terim EN. SSOT'a saygı: hiçbiri MASTER-PLAN mutate etmiyor |
| **Kanun 6** (fix-döngüsünü kır; her sprint ≥1 ileri iş) | ✅ | Setin tamamı ileri/vizyon işi (güvenlik mimarisi), bug-fix turu değil. A8 §9.4 ve A9 §18.3 "akışı bloklamama" modeliyle bunu açıkça koruyor |
| **Kanun 8** (mikro-task + dependency DAG) | ✅ | Her doküman W-paketleri + DAG + "task ID değildir, implementation session Goal/Mission/Flow'a çevirir" diyor |
| **Kanun 9** (proof-of-function + blocker bildirimi) | ✅ **Örnek** | Blocker'lar peşinen bildirilmiş: A2 W6 "Bulgu 11 kapanmadan enable edilmez", A1 D10 "7030 kapanmadan sandbox denemez" |
| **Kanun 10** (0-hardcode) | ✅ | Hiçbir doküman model adı/akış değeri literal'i dayatmıyor. Aksine A4 §15.1 ve A8 §15.1 "instruction metni ikinci config SSOT'si değildir" diyor. ⚠️ Tek eksik: **ADR-G-036 ratchet'ine atıf yok** (§4-M) |
| **Kanun 11** (memory-iş ayrımı) | ✅ | Dokümanlar iş; memory'ye yazılacak kalıcı-durum iddiası yok |
| **Kanun 12** (kod + iş-özeti birlikte) | ⚠️ **Kısmen** | Dokümanlar derin teknik; her birinin §1 "Sonuç — tek cümle" bölümü var ✅ ama **düz-Türkçe iş-tanımı/karar özeti yok**. 11.000 satır Alperen'in kod açmadan karar vermesini zorlaştırıyor → §10-E5 |
| **Kanun 14** (cross-provider xverify) | ✅ **Örnek** | 9/9 doküman "fresh different-provider XVerify; unavailable ise typed HOLD; same-provider self-verify yasak" şartını acceptance gate'ine koymuş |
| **Quality Bar: i18n-FIRST** | ⚠️ **Eşitsiz** | `getMessage` atıfı: A1 (2) ✅, A2 (1) ✅ · A3 "i18n-clean typed errors" ✅ · A5 §19 ✅ · A6 §14.1 ✅ · A9 §26 ✅ · **A4 zayıf** (yalnız W10'da dolaylı) · **A7 ve A8: `getMessage`=0, `i18n`=0** ❌ → §10-E4 |
| **Quality Bar: §3.3A wiring closure** | ✅ **Örnek** | 9/9 doküman "test-only import / isolated module / unit-green ≠ DONE" ve canonical producer→consumer→ingress→policy zincirini şart koşuyor. A9 §22 sonu: "W2/W3 isolated modules test-green olsa bile production consumers yoksa capability `UNWIRED/HOLD` kalır" |
| **Quality Bar: no tech debt by default** | ✅ | Her doküman non-goal + "yanlış COMPLETE" listesiyle borç bırakmayı açıkça yasaklıyor |
| **Every Environment (Kanun 1/2)** | ✅ ama **parçalı** | 6 ayrı platform/facet matrisi (§4-D3) — tek `ENV-ADAPTER-001` capability registry'sine indirgenmeli |

---

## 8. MCP — deferred dependency kenarları

**Owner kararı (bu oturumda teyit edildi + A8/A9'da zaten kayıtlı):** MCP eksikleri MCP güncellemesi
(MCPV2 cutover) sonrasına bırakıldı. Bu doküman MCP'yi **analiz etmiyor.** Aşağıdakiler yalnız
DAG'da açık bırakılacak kenarlardır:

| Kaynak | MCP bağımlılığı | Deferred-edge tipi |
|---|---|---|
| A8 header | "**Bulgu 8** owner kararıyla `MCPV2.md` planı ve production cutover sonrasındaki fresh code-truth değerlendirmesine **DEFERRED/HOLD**" | Bulgu-level erteleme ✅ |
| A9 header + §16.4 | "MCPv1 trust çözümü tasarlanmaz. Tek MCP şartı: MCPV2 adapter'ları ortak `ContentArtifact` contractını tüketsin ve **call consent'i content trust ile karıştırmasın**" | Contract-consumption şartı |
| A9 §4.14 | `native-tool-registry.ts:639-655` confirm-tier + raw `ToolResult`; `MCPV2.md:77-83` P2 `server/discover`/`ttlMs`/`cacheScope` planı | Kod-truth notu, çözüm yok |
| A1 §13 | `MCP-TRUST-001` non-goal — "MCP server supply-chain trust bu paket kapsamı dışında" | Non-goal beyanı ✅ |
| A2 §4 + W4 | `src/mcp/tools/start.ts` spend-lease ingress'i — **MCP dosyası touchpoint** | ⏸️ MCP güncellemesi sonrası |
| A6 §9.1 + W2 | MCP ingress principal'ı: "paired host/session principal, **generic `mcp-operator` label değil**" (`mcp/tools/start.ts:316`) | ⏸️ MCP güncellemesi sonrası |
| A4 §8.1 + W5 | Tool sınıfında MCP = "brokered canonical MCP client" | Gateway tool-class'ı |

**Hüküm:** MCP erteleme **tutarlı ve doküman-içinde kayıtlı.** Ancak `src/mcp/tools/start.ts` iki
dokümanın (A2 W4, A6 W2/W4) touchpoint'i → MCP güncellemesi bu iki paketin **ingress cutover'ını
bloklar**. Devir session'ı bunu explicit dependency-edge olarak taşımalı, sessiz atlamamalı.

---

## 9. Alperen kararı gerektiren maddeler

> ⚠️ **Bu bölüm tarihsel bağlamdır.** Kararlar verildi — bağlayıcı olan **§13**'tür.

| # | Karar | Bağlam | Öneri |
|---|---|---|---|
| **K1** | **Codex'in yeni-bulgu listesi (11–16) diske kaydedilecek mi?** | ✅ §12.1 ile **kısmen çözüldü**: prompt'un 10 önceki bulgusu **tam hesapta** (9 doküman + MCP deferred). `Bulgu 11/12/16` = Codex'in **kendi yeni bulguları**; ham yanıt **repo'da yok**. `Bulgu 11` 5 dokümanın hard dependency'si ama **tam metni kurtarılamıyor**; 13/14/15 var mı belirsiz | Codex OWASP yanıtının "Yeni bulgular" bölümü `docs/audits/`'e kaydedilsin (analiz-only artifact). Aksi halde `APPROVAL-001` tasarımı kaynak bulgu metnini kaybetmiş başlar |
| **K2** | **`APPROVAL-001` / Bulgu 11 doküman alacak mı?** | 5 doküman hard dependency; A2 W6 ve A7 break-glass'ın tamamı bloklu | 🔴 **Öncelik: yüksek.** Bu tasarlanmadan FAZ 4'ün approval kolları açılamaz |
| **K3** | **`OPERATION-001` (4030) operation catalog doküman alacak mı?** | A3'ün completeness reconciler'ı, A4 §18 DAG tepesi, A7 §7.3 buna bağlı | 🟠 A7 terminal-specific 12 operasyonu tanımlamış — genel katalog bunun üstüne kurulabilir |
| **K4** | **`PLUGIN-SANDBOX-001` / Bulgu 16 doküman alacak mı?** | A1 açıkça "7030 kapanmadan 'plugins are sandboxed' denemez"; A6 W8 runtime capability sahibi olarak işaretliyor | 🟠 A4'ün sandbox/staging mimarisi bunun altyapısı olabilir — ayrı doküman gerekmeyebilir |
| **K5a** | **ADR crosswalk borcu** (§4-M) | 8/9 doküman ADR-recall yapmamış. ADR-G-020 A6/A2/A4'ün işini **adıyla** planlıyor (`AUTHORITY-SSOT`, Layer-2 `HARD-flip`, `B1 enforce_rbac`, `B6 enforce_spend_gate`) — bu bir **çelişki değil, mevcut governance mandate'i**; dokümanları **güçlendiriyor** | **Crosswalk referansı yeterli, amendment gerekmez.** Devir session'ının ilk task'ı: 9 doküman × ilgili ADR referansı |
| **K5b** | **ADR amendment/successor gereken vakalar** | 🔴 **ADR-G-029** (`Immutable: yes`) command/prompt guard'ı **delivered enforcement** olarak ilan ediyor; A7 regex-on-PTY-chunk'ın command authority olmadığını kanıtlıyor → **gerçek çelişki**. Muhtemel ikinci vaka: ADR-G-020'nin §Enforcement satırı, missing-role allow→deny flip'i accepted posture'ı değiştiriyorsa | ADR-G-029 için **amendment veya successor zorunlu** (in-place rewrite yasak — `Immutable: yes`). ADR-G-020 için flip'in posture değişikliği olup olmadığı değerlendirilsin |
| **K6** | **Yeni ledger satırları onayı** | A9 `CONTENT-PROVENANCE-001` (P0, kesin) · A7 terminal child (belki) · A8 inventory child (belki) | A9 için **evet** öneriliyor (MASTER-PLAN'da karşılığı yok, P0). A7/A8 için mevcut parent'lar yeterli olabilir |
| **K7** | **Birleşik config-authority slice'ı açılsın mı?** | `config-types.ts` 6 doküman, `config.ts` 6 doküman touchpoint (§5.2) | **Evet öneriliyor** — aksi halde 6 doküman aynı dosyada ardışık conflict + parçalı legacy migration |
| **K8** | **Enum birleştirmeleri (§4-C1…C7) tek "contract harmonization" task'ı olsun mu?** | 7 tipli çelişki; hiçbiri mimari değil, hepsi şema hizalaması | **Evet öneriliyor** — FAZ 1 öncesi, ucuz, tüm dokümanları etkiliyor |
| **K9** | **Bu 9 doküman + bu çapraz doğrulama commit edilecek mi?** | `docs/audits/` şu an **untracked** (`?? docs/audits/`) | Karar sizin. Commit edilirse ledger'a "3195 dilim-keşfi" benzeri satır gerekir |
| **K10** | **A2'nin audit-authority'ye tabiiyeti açık yazılsın mı?** | A2 §5.5 kendi hash-chain'ini tanımlıyor; diğer 6 doküman `AUDIT-001`'e açıkça tabi | **Evet öneriliyor** — tek satırlık düzeltme, ikinci chain authority riskini kapatır |

---

## 10. Önerilen doküman düzeltmeleri (UYGULANMADI — onay batch'i)

Kanun 3 gereği hiçbiri uygulanmadı.

**Karar durumu (§13):** `E1a`/`E1b` → **T3'e taşındı** (K5a/K5b ✅, kapsam §16.4 ile büyüdü) ·
`E2`,`E3`,`E6`,`E12` (merge) ve `E8`,`E9`,`E14` (eşleme) → **PROVISIONAL** (K8 çekingen; owner teyidi
bekliyor) · `E4` (A7/A8 i18n), `E5` (düz-Türkçe özet), `E7` (A2 audit tabiiyeti — K10 ✅ daraltılmış),
`E10`, `E11`, `E13` → **uygulanabilir**, T3/T7 turunda.

| # | Doküman | Düzeltme | Gerekçe | Boyut |
|---|---|---|---|---|
| **E1a** | **8/9** (A7 hariç) | Her dokümana **"ADR crosswalk"** alt-bölümü: ilgili ADR'ler + mevcut roadmap kalemleriyle eşleme (ADR-G-020 `AUTHORITY-SSOT`/`HARD-flip`/`B1`/`B6`, ADR-G-036, ADR-G-035, ADR-G-018, ADR-D-005) | 🔴 Kanun 2. **Çelişki değil, mandate eşlemesi** — dokümanları güçlendirir | Orta |
| **E1b** | A7 (+ gerekirse A6) | **Amendment/successor ADR önerisi** — ADR-G-029'un "command/prompt guard = delivered enforcement" iddiası için. `Immutable: yes` → in-place rewrite yasak | 🔴 Gerçek ADR çelişkisi. A7 §21 zaten doğru prosedürü söylüyor; eksik olan **exact amendment metni** | Orta |
| **E2** | A1 + A6 | Admission karar enum'unu birleştir (§4-C1) | Aynı trust-plane iki enum | Küçük |
| **E3** | A4 + A5 | Tek `LandingReceiptV1` şeması; A5'in alanları normatif ekleme olarak (§4-C2) | Contract drift | Küçük |
| **E4** | **A7 + A8** | i18n taahhüdü ekle: user-facing string `getMessage(key, lang)` + en/tr parity; mekanizma modülü string-free | Quality Bar i18n-FIRST; ikisi de 0 atıf | Küçük |
| **E5** | 9/9 | Her dokümana **düz-Türkçe iş-özeti** (½ sayfa: ne bozuk, ne yapılacak, ne kazanılacak, ne bekliyor) | Kanun 12 — Alperen kod açmadan karar verebilsin | Orta |
| **E6** | A4 | §18 DAG'ında `AUDIT-001`'i **ikiye ayır**: pre-effect append = yukarı-akış, checkpoint/anchor = aşağı-akış (§4-O1) | Yön çelişkisi | Küçük |
| **E7** | A2 | §5.5'e "canonical `AuditAuthority` (`AUDIT-001`) ile uyum" cümlesi (K10) | İkinci chain authority riski | Tek satır |
| **E8** | A5 + A8 | Drift taksonomilerini `BaselineDrift` / `CanonicalDrift` olarak adlandır (§4-C5) | İsim çakışması | Küçük |
| **E9** | A3 + A5 + A9 | Trust vocabulary **eşleme tablosu**: A9'un 6 ekseni kanonik, A3/A5 enum'ları oraya map (§4-C3) | 4 ayrı vocabulary | Orta |
| **E10** | A5 + A6 | Protected resource catalog: A6 §7.4 sınıflı hali kanonik, A5 §9.4 listesi instance (§4-D4) | Çift katalog | Küçük |
| **E11** | 6 doküman | Platform/facet matrislerini tek `ENV-ADAPTER-001` capability registry'sine referansla (§4-D3) | 6 ayrı matris | Orta |
| **E12** | A6 + A7 | Principal contract'ı: A6 §7.1 kanonik producer, A7 §7.2 terminal adapter gereksinimi (§4-C6) | Çift principal tipi | Küçük |
| **E13** | A7 | §4.6'ya **üçüncü bypass yolu** ekle: `session-manager.ts:120` `host: this.opts.host ?? 'localhost'` (V11c) | Bu doğrulamada bulundu, dokümanda yok | Tek satır |
| **E14** | 9/9 | Ortak **reason-code registry** referansı (§4-C7) — `HOLD` semantiği tek yerde | Karar enum çoğalması | Orta |

**Not:** E1 ve E5 dışındakiler mekanik/şema hizalaması. E1 (ADR recall) tek başına bir mini-analiz
turu; devir session'ının ilk task'ı olarak yapılması daha verimli olabilir (K5).

---

## 11. Ana iş-planı session'ına devir girdisi

> Bu bölüm, "süreci devredeceğiz" hedefinin çıktısıdır. Ana iş-planı (MASTER-PLAN) session'ı bunu
> **doğrudan** okuyup Goal/Mission/Flow DAG'ına çevirebilir. Bu oturum kod/ADR/MASTER-PLAN mutate
> etmedi.

### 11.1 Girdi paketi

1. **9 authority-design dokümanı** — `docs/audits/*-design-*.md` (11.001 satır). Karar durumu:
   9/9 **KABUL EDİLDİ** (Alperen, 2026-08-05/06 OWASP Agentic Top 10 oturumları, Bulgu 1–10).
2. **Bu çapraz doğrulama** — `docs/audits/CROSS-VERIFICATION-2026-08-06.md`. §A okuma kaydı,
   §3 doğrulama sonuçları, §4 çatışma register'ı, §5 birleşik DAG + collision matrisi.
3. **Owner kararları** — §9 (K1–K10) cevaplandıktan sonra bağlayıcı.
4. **Komşu korpuslar (§12 ile ilişkileri netleştirildi):**
   - `CODEX-OWASP-ASI-PROMPT.md` — **aktif girdi**, bu setin görev tanımı; 10 önceki bulgunun kanonik listesi
   - `codex-analysis/` (18 rapor, 2026-08-03) — **ortogonal + daha eski** program-düzeyi denetim.
     ⭐ WP3/WP4 == bu setin U1–U5 foundation açığı (**bağımsız doğrulama**); WP0/WP1 bu setin
     hiç değinmediği ön koşulları taşıyor (canonical reconciliation, 591-failure test baseline)
   - `DOGFOOD-IS-SIRASI.md` + `DOGFOOD-HANDOVER.md` — **süpersede**; tanımladıkları SSOT-003
     deadlock'u 2026-08-06'da `GR-2026-08-06-SSOT-SPLIT-01` ile çözüldü (READY: 0 → 12)

### 11.2 Kabul edilebilir baseline (doğrulanmış)

- **22/22 code-truth iddiası HEAD `77bc721ae`'de geçerli** (§3). Codex baseline'ları güvenilir;
  satır numaraları ±3 satır isabetli. Devir session'ı yine fresh reachability çıkarmalı (her
  doküman bunu zaten istiyor) ama **iddiaları sıfırdan yeniden keşfetmesi gerekmiyor.**
- **Seam hijyeni iyi** (§2): tool/landing/execution çakışmaları dokümanların kendi içinde
  (A5 D15, A6 D3, A7 §9.1) çözülmüş. 6 katmanlı ayrım (content→scope→capability→effect→landing→evidence)
  **çakışma değil sıralama.**
- **42/43 ledger ID resolve ediyor** (§6). Tek istisna A9'un açıkça önerdiği yeni satır.

### 11.3 İş sırası önerisi

| Sıra | İş | Neden |
|---|---|---|
| **0** | §9 K1–K10 owner kararları | Kapsam ve ledger netleşmeden DAG kurulamaz |
| **1** | **ADR recall turu** (E1/K5) — 9 doküman × ilgili ADR crosswalk + amendment/successor önerileri | 🔴 Kanun 2. ADR-G-020 A6/A2/A4'ün işini adıyla planlıyor; çifte governance riski |
| **2** | **Contract harmonization** (K8/E2,E3,E8,E9,E10,E12,E14) — enum/şema hizalaması | Ucuz, tüm dokümanları etkiliyor, FAZ 1 öncesi yapılmalı |
| **3** | **Foundation açığı** (K2,K3,K4) — `APPROVAL-001`, `OPERATION-001`, `PLUGIN-SANDBOX-001` tasarım kararı | 5 doküman bu 3'üne hard-bağlı; FAZ 2 bunlar olmadan admission-eksik |
| **4** | **Birleşik config-authority slice** (K7) | `config-types.ts`/`config.ts` 6× collision |
| **5** | FAZ 1 → FAZ 9 (§5.1 birleşik DAG) | Kritik yol: A3 → A4 → A5 → A9 W5 |
| **⚠️ paralel** | **`codex-analysis` WP0/WP1 ön koşulu** — canonical reconciliation + trust-signal floor (591-failure test baseline, CI/docs drift) | Bu güvenlik seti WP0/WP1'e **hiç değinmiyor**; `codex-analysis` bunları WP3/WP4'ün (= U1–U5) ön koşulu sayıyor. §12.2 |

### 11.4 İlk implementation slice adayı

Dokümanların kendi önerileri karşılaştırıldığında iki güçlü aday:

| Aday | Kaynak | Lehine | Aleyhine |
|---|---|---|---|
| **A9 W5 — stored-memory laundering closure** | A9 §22 kendi seçimi | P0, en somut exploit zinciri (V15 doğrulandı), dogfood'u doğrudan etkiliyor (Brain kendi memory'sini okuyor) | 5 hard dep (B4,B5,B6,B7,B9); A9 kendisi "W2/W3/W4 closure'ına dependency-bound tut, **isolated patch yapma**" diyor |
| **A3 W1–W3 — audit contracts + key provider + host ledger** | Birleşik DAG FAZ 1 | Her şeyin altında; `AUDIT_HMAC_SECRET` (V1) en net tek-satır güvenlik açığı; 6 doküman buna tabi | Uzun; tek başına user-visible değer üretmiyor |

**Öneri:** ikisini **ayrı trenlere** koymak yerine, FAZ 1 (A3 W1-W3) ilk tren; A9 W5 ikinci tren
(A9'un kendi dependency şartına uyarak). Ancak `AUDIT_HMAC_SECRET` düzeltmesi tek başına küçük ve
yüksek getirili — ayrı atomik slice olarak öne alınabilir (kod yorumu bile "tracked follow-up" diyor).

### 11.5 Devir session'ının yapmaması gerekenler

- Bu dokümanlardaki satır numaralarını **kör kullanmak** — hepsi fresh reachability istiyor (bu
  oturum 22 tanesini doğruladı, kalanı doğrulanmadı).
- 9 dokümandan herhangi birini **tek başına implement etmek** — set-içi hard dep'ler (§1) ihlal olur.
- **MCP'ye dokunmak** — owner kararıyla deferred (§8). `src/mcp/tools/start.ts` touchpoint'leri
  explicit blocked-edge olarak taşınmalı.
- Enum/şema çatışmalarını (§4-C) implementation sırasında **ad-hoc çözmek** — K8 tek turda kapatmalı.
- ADR recall'u (§4-M) implementation'a **ertelemek** — Kanun 2 recall'un spec'ten önce olmasını istiyor.

### 11.6 Bu oturumun kapanış hükmü

**Doküman seti implementation'a devredilmeye hazır — üç ön koşulla:**
1. §9 owner kararları (özellikle K1 kayıp bulgular, K2 `APPROVAL-001`, K5 ADR recall borcu),
2. §4-M ADR recall turu (Kanun 2),
3. §4-C enum/contract harmonization (7 tipli çelişki).

Bu üçü kapanmadan implementation başlarsa: çifte governance framing (ADR-G-020 vs A6),
admission-eksik FAZ 2 (`APPROVAL-001` yok), ve 6 dokümanın `config-types.ts`'de ardışık conflict'i
beklenir. Üçü de **ucuz** — hiçbiri mimari değişiklik gerektirmiyor.

---

## 12. Komşu analiz korpuslarıyla reconciliation

Repo'da bu 9 dokümanın yanında üç ayrı, untracked analiz korpusu var. İlişkileri buraya
netleştirildi ki devir session'ı yeniden keşfetmesin.

### 12.1 `CODEX-OWASP-ASI-PROMPT.md` — **kaynak görev tanımı** (bu setin girdisi)

Bu, 9 dokümanı doğuran Codex görevinin prompt'u. `SEC-OWASP-ASI-001` (4190) bağlamında,
**XVERIFY-PROVIDER-SEPARATION** kapsamında ikinci-provider bağımsız analizi: "önceki analiz Claude
(Fable 5) tarafından yapıldı; sen aynı soruyu SIFIRDAN incele ve önceki bulguları
CONFIRMED / REFUTED / PARTIAL olarak hükme bağla."

**⭐ Bu, §1'deki "Bulgu numarası boşlukları" sorusunu kapatıyor (K1 ÇÖZÜLDÜ):**

Prompt **tam 10 önceki bulgu** listeliyor. Eşleme:

| Prompt bulgusu | Konu | Doküman |
|---|---|---|
| 1 | Plugin-hook security pipeline sprint yolundan çalışmıyor | A1 ✅ |
| 2 | `enforce_spend_gate` yalnız uyarı | A2 ✅ |
| 3 | `AUDIT_HMAC_SECRET` sabit string | A3 ✅ |
| 4 | Runtime write-scope yalnız claude'da; codex/gemini `allowedToolsFlag: null` | A4 ✅ |
| 5 | BOUNDARY_VIOLATION honest-gate worker beyanına güveniyor | A5 ✅ |
| 6 | Dört enforcement modülü UNWIRED | A6 ✅ |
| 7 | Terminal command-guard loopback'te inert | A7 ✅ |
| **8** | **Klonlanan reponun `.mcp.json`'ı default güvenilir; 3. parti MCP için imza/consent/provenance yok** (`mcp-client/config.ts:46,57`) | ⏸️ **DEFERRED (owner)** |
| 9 | Scope gate git-failure'da fail-open | A8 ✅ |
| 10 | Genel content-provenance/taint savunması yok | A9 ✅ |

→ **10/10 bulgu hesapta: 9 doküman + 1 (MCP) owner kararıyla ertelenmiş.** Boşluk yok.

**Peki `Bulgu 11`, `Bulgu 12`, `Bulgu 16` nedir?** Prompt'un §4 çıktı şartı: *"Yeni bulgular —
önceki analizde OLMAYAN, kendi bulduğun güvenlik açıkları… **en değerli bölüm budur**."* Yani
11+ numaralı bulgular **Codex'in kendi yeni bulguları**, 10'un üstünden numaralanmış.

⚠️ **Yeni bulgu (bu doğrulamada çıktı): Codex'in yeni-bulgu listesi (11–16) diske kaydedilmemiş.**
`grep "Bulgu 11|12|13|16"` yalnız 9 tasarım dokümanının içinde (referans olarak) ve bu dosyada
eşleşiyor. Ham Codex OWASP yanıtı repo'da yok. Sonuç:
- `Bulgu 11` (approval decision integrity) → **5 doküman hard dependency** ama **tam metni yok**
- `Bulgu 12` (inter-agent / ASI07) → A3 kapsam dışı bıraktı, A9 §15 üstlendi — metni yok
- `Bulgu 16` (plugin runtime process isolation) → A1 parent closure — metni yok
- `Bulgu 13, 14, 15` → hiç anılmıyor; **var mı yok mu belirlenemiyor**

→ **K1 yeniden çerçevelendi** (§9). Soru artık "bulgular nerede?" değil: *"Codex'in yeni-bulgu
listesi diske kaydedilecek mi?"* Kaydedilmezse `APPROVAL-001` tasarımı kaynak bulgu metnini
kaybetmiş olarak başlar.

### 12.2 `codex-analysis/` — **program-düzeyi denetim, ORTOGONAL ve DAHA ESKİ**

| Alan | `codex-analysis/` | `docs/audits/` (bu set) |
|---|---|---|
| Tarih / commit | 2026-08-03 · `aeb60c6b` | 2026-08-05/06 |
| Kapsam | **Bütün-ürün denetimi** — vizyon-fit, plan SSOT, lifecycle, runtime, provider routing, güvenlik, ürün yüzeyleri, learning, test/CI, platform/scale, docs truth, kritik yol, risk register, WP DAG, efor | **Yalnız güvenlik** — OWASP ASI, 9 authority tasarımı |
| Çıktı | 18 rapor + `appendices/` | 9 authority-design + handoff |
| Verdict | Vision **GO** · Architecture **CONDITIONAL GO** · Docs/MASTER **REPLAN REQUIRED** · Goal-v2 **NO-GO/HOLD** | Her doküman **KABUL EDİLDİ** (implementation girdisi) |
| DAG | WP0–WP11 (program) | W1–W13 (domain, doküman-başına) |

**Hüküm: aynı korpus değil, birbirinin yerine geçmez.** `codex-analysis` = program haritası;
`docs/audits` = güvenlik domain'inin derinleşmesi. **Ancak kesişim var ve önemli:**

⭐ **`codex-analysis` WP4 = bu setin U1–U5 foundation açığı.** WP4'ün tanımı birebir:
*"Principal/Tenant/Capability/Approval/Budget/Audit — depends WP3 — exit gate: **Every effectful
Operation fail-closed policy**"*. Yani:

```
codex-analysis WP3 (Canonical lifecycle + Operation authority)  ==  U2 (OPERATION-001)
codex-analysis WP4 (Principal/Tenant/Capability/Approval/…)     ==  U1+U3+U4+U5
```

→ Bu setin "tasarlanmamış 5 foundation" bulgusu **bağımsız olarak `codex-analysis` tarafından da
tespit edilmiş** ve WP3→WP4 sırasına yerleştirilmiş. İki analiz **birbirini doğruluyor.**
Ayrıca `codex-analysis` WP0 (canonical reconciliation, ≥1 READY root) ve WP1 (trust-signal floor:
591-failure test baseline) bu setin **hiç değinmediği** ön koşulları taşıyor.

**Devir session'ı için sonuç:** güvenlik seti `codex-analysis` WP3/WP4'ün *içeriğini* dolduruyor;
`codex-analysis` ise WP0/WP1'in *ön koşulunu* söylüyor. İkisi çelişmiyor — **birleştirilmeli.**

### 12.3 `DOGFOOD-IS-SIRASI.md` + `DOGFOOD-HANDOVER.md` — **SÜPERSEDE EDİLMİŞ (deadlock çözüldü)**

Bu ikisi 2026-08-06 sabahı (HEAD `c321b911`, ledger 383 satır, **0 READY**) MASTER-PLAN'ın
salt-okunur projection'ı olarak yazılmış ve makine-zorunlu bir **closure deadlock**'u belgeliyor:

```
SSOT-003 Evidence'ı "pending under APPROVAL-001, RECEIPT-001, KERNEL-SETTLEMENT-001, AUDIT-001"
  → validator DONE_EVIDENCE_PENDING ile DONE'ı reddediyor (lint-master-plan.mjs:2973,2979)
  → o dört iş transitively PRINCIPAL-001'e bağlı
  → PRINCIPAL-001'in DependsOn'ı SSOT-003
  ⇒ kapalı döngü; Rota B'nin 20 işinden hiçbiri dep-OK olamıyor
```

Önerilen çıkış: `SSOT-003`'ü (a) validator + (b) settlement-closure olarak bölmek.

**Bu deadlock ARTIK ÇÖZÜLMÜŞ — doğrulandı:**

| Kanıt | Değer |
|---|---|
| `c321b911..HEAD` arası commit | **46** (projection bayat) |
| MASTER-PLAN satır 335 | `GR-2026-08-06-SSOT-SPLIT-01` — **Alperen G1 onayı, `ONE_SHOT` consumed@2026-08-06T06:38:58Z**; "DOGFOOD-IS-SIRASI §2.4 — MASTER §3.3 kuralının uygulaması"; "deadlock (DONE_EVIDENCE_PENDING) **yapısal çözülür**, **PRINCIPAL-001 dep-OK olur**" |
| MASTER-PLAN satır 589 | `SSOT-003` durumu **`DONE`** (2026-08-06); settlement-closure kapsamı `SSOT-SETTLEMENT-001` child'ına (satır 534) taşınmış; ID sabit kaldığı için inbound dependency'ler düzenlenmemiş |
| MASTER-PLAN READY sayısı | **12** (0 değil) |

→ **Hüküm: `DOGFOOD-IS-SIRASI.md` ve `DOGFOOD-HANDOVER.md` tüketilmiş/süpersede.** Tanımladıkları
tek fiilî adım (SSOT-003 bölmesi) uygulandı. §11.3'teki iş sırası **aktif bir owner-onaylı iş
sırasıyla çelişmiyor** — o iş sırası tamamlandı.

**⭐ Ama kritik bir bağlantı bırakıyorlar:** SSOT-003'ün Evidence'ında deadlock'u yaratan dört
işten **üçü bu setin U1/U5 undefined-dep'leri** — `APPROVAL-001`, `RECEIPT-001`, `AUDIT-001`
(dördüncüsü `KERNEL-SETTLEMENT-001`, A4/A5'in terminal dependency'si). Yani:

> Bu setin "tasarlanmamış foundation" bulgusu, ledger'ın kendi deadlock geçmişinde **adı adına**
> kayıtlı. `AUDIT-001` (= A3) ledger'ın kendi tarihinde bir **unblocker** olarak anılıyor.

→ Bu, §11.4'teki "FAZ 1 = A3 (AUDIT-001) ilk tren" önerisini **bağımsız olarak destekliyor**.

### 12.4 Reconciliation hükmü

| Korpus | Durum | Devir session'ı ne yapmalı |
|---|---|---|
| `CODEX-OWASP-ASI-PROMPT.md` | **Aktif girdi** — bu setin görev tanımı | Oku; K1 için yeni-bulgu listesinin kaydı kararını al |
| `codex-analysis/` (18 rapor) | **Ortogonal + daha eski (08-03)** | WP0/WP1 ön koşullarını bu setin FAZ'larıyla birleştir; WP3/WP4 == U1–U5 |
| `DOGFOOD-IS-SIRASI.md` | **Süperseder — deadlock çözüldü** | Arşive al veya "consumed 2026-08-06" notu düş |
| `DOGFOOD-HANDOVER.md` | **Süperseder — devri tamamlandı** | Arşive al |
| **bu dosya** | **Aktif devir girdisi** | §11 |

---

## 13. Owner karar kaydı — Alperen, 2026-08-06

> Bu bölüm §9'daki karar maddelerinin **verilmiş hâlidir.** §9 artık tarihsel bağlamdır;
> bağlayıcı olan burasıdır. Hiçbiri uygulanmadı — uygulama akıştaki session'ın işidir (§17).

| # | Karar | Verdict | Gerekçe / kapsam |
|---|---|---|---|
| **K1** | Codex yeni-bulgu listesi | ✅ **(a) KAYDEDİLECEK** | HEAD 46 commit ilerlemiş olsa da *o çalışmalar bu alanda değildi*, bulgu metni geçerliliğini koruyor. → §17-T1 |
| **K2** | `APPROVAL-001` kapsamı | ✅ **(c) hedefli baseline + tüketici-gereksinim matrisi** | Tam authority tasarımı değil. 21 modüllü mevcut altyapı sahiplenilecek. → §15 |
| **K3** | `OPERATION-001` operation catalog | ⏸️ **ERTELENDİ** | A3 `completeness: unknown` ile teslim edilir; katalog A4/A7 cutover'ları gerçek operation kümesini gösterdikten sonra aşağıdan-yukarı yazılır |
| **K4** | `PLUGIN-SANDBOX-001` / Bulgu 16 | ✅ **Öneri kabul: ayrı ince tasarım, DÜŞÜK öncelik** | A4'ün attempt/staging/landing modeli in-process senkron hook şekline uymuyor → zorlanmayacak. A1 7031 tek başına değer üretir; 7030 yalnız *ürün-iddiası* kilidini açar |
| **K5a** | ADR crosswalk | ✅ **Öneri kabul** · ⏭️ **kapsam hükmü T3'e devredildi** (Alperen, 2026-08-06) | Karar ("crosswalk yeterli, amendment gerekmez") 6 un-cited ADR varsayımıyla verildi; doğrulama **~20 ADR + 4 doğrudan-alan çakışması** buldu (2'si `Immutable: yes`, 2'si `Enforcement-Level: hard`) → §16. **Owner hükmü:** her çakışmanın "crosswalk mı / reconciliation mı / amendment mı" hükmü **T3'ün kanıtlı analiz turunda** üretilecek; karar T3 çıktısı üzerinden verilecek. Şimdi karar verilmedi |
| **K5b** | ADR-G-029 | ✅ **Öneri kabul: SUCCESSOR ADR** | Amendment değil. A7 bir düzeltme değil model değişimi (5-katmanlı kimlik + session authorization + 3 profil + 4 UNWIRED kritik) |
| **K6** | Yeni ledger satırları | ✅ **Öneri kabul** | A9 `CONTENT-PROVENANCE-001` → **EVET** (P0, sahibi yok). A7/A8 child'ları → **ERTELENDİ** (sahipleri var, dağınık; W1 dependency haritasından sonra kanıtlı karar) |
| **K7** | Birleşik config slice | ❌ **REDDEDİLDİ** | *"Dar tanım şimdiyi kurtarsa sonra bize teknik borç oluşturur; şu an yapmamak daha mantıklı, sonradan bu turu borç olarak MASTER-PLAN'dan ele alır güncelleriz."* → §14 |
| **K8** | Contract harmonization | 🟡 **ÇEKİNGEN / PROVISIONAL** | *"İyi düşünmeliyiz; şu an öneri makul ama yarın kararım değişebilir."* → E2/E3/E6/E12 (merge) ve E8/E9/E14 (eşleme) **PROVISIONAL**; teyit olmadan uygulanmaz |
| **K9** | Commit | ❌ **COMMIT YOK — untracked kalacak** | *"HEAD ve main tutarsızlıklarımızda kayıp yaşamayalım."* Bu oturumun çıktısı **dokümantasyon + iş planı**; akıştaki session'a "bu dokümanı uygun zamanda iş planına ekle" denecek |
| **K10** | A2'nin audit tabiiyeti | ✅ **Daraltılmış öneri kabul** | A2'nin kendi transaction log'u meşru (atomic multi-bucket reservation, `BEGIN IMMEDIATE`). Yasak olan: **bağımsız tamper-evidence iddiası.** Spend kararlarının audit event'leri `AUDIT-001` üzerinden |

### 13.1 Kararların birbirine etkisi

- **K7 reddi**, §5.2'nin 6-yollu `config-types.ts`/`config.ts` çakışmasını **DAG serileştirme kısıtına** çevirir (aynı anda tek doküman config'e dokunur) + MASTER-PLAN'a borç satırı (§14).
- **K3 + K4 ertelemesi** kritik yolu kısaltır: A3 `completeness` boyutu olmadan, A1 7030 olmadan ilerler.
- **K8 provisional**, FAZ 1 öncesi harmonization adımını **opsiyonel** yapar → implementation session enum çatışmalarını *kendi slice'ında* çözerse §4-C register'ı referans olarak kalır.
- **K9**, bu setin tamamının **untracked** kalması demek → §17'de durabilite riski açıkça taşınıyor.

---

## 14. K7 reddi — kabul edilen risk ve MASTER-PLAN borç kaydı

### 14.1 Kararın dayanağı

Dar kapsamlı config slice (migration authority + conflict semantics + namespace rezervasyonu) bugünü
kurtarır ama **yarım kalmış bir authority** bırakır: key adları tanımsız, her doküman kendi
namespace'ini kendi turunda açar, ve "migration authority" mevcut olmayan key'ler için yazılmış olur.
Bu, kendisi teknik borçtur. Owner hükmü: **borcu gizlemek yerine açıkça kaydet, sonra tam çöz.**

### 14.2 Bu kararla kabul edilen riskler (kayıt için)

| Risk | Somut etki | Hafifletme |
|---|---|---|
| 6-yollu dosya çakışması | `config-types.ts` (A1,A2,A3,A6,A7,A9) ve `config.ts` (A1,A2,A3,A4,A6,A7) ardışık merge conflict | **DAG serileştirme kısıtı:** aynı trende yalnız bir doküman config'e dokunur (§17-T7) |
| 4 legacy boolean bağımsız migrate edilir | `plugin_require_signature` (A1) · `enforce_spend_gate` (A2) · `enforce_rbac` (A6) · `allowShellKind` (A7) — dördü de "çelişki → typed HOLD, sessiz precedence yok" istiyor; ayrı ayrı yazılırsa **4 farklı conflict semantiği** doğar | İlk migrate eden doküman semantiği kurar; sonrakiler **ona atıf yapmak zorunda** (§17-T7 acceptance şartı) |
| Namespace çarpışması | İki doküman aynı config alt-ağacını farklı şekilde tanımlayabilir | §4-C register'ı + `ADR-G-001` (Layered Config & Scope Precedence) referansı |
| Borcun kaybolması | Sonraki tur bu turu hatırlamaz | **MASTER-PLAN borç satırı** (§14.3) — Kanun 4 |

### 14.3 MASTER-PLAN'a eklenecek borç satırı (taslak — ID/order owner'ın)

> Bu taslak MASTER-PLAN'a **yazılmadı**. §3.3 satır invariant'ları ve `G1 FILE` onayı gerekir.

```text
Work ID önerisi : CONFIG-AUTHORITY-CONSOLIDATION-001
Faz             : P00 (TRUTH) veya P04 (Runtime-wide authority) — owner kararı
Outcome         : 9 OWASP authority dokümanının config namespace'ini tek şema/migration
                  authority'sinde birleştir; 4 legacy boolean için tek versioned migration +
                  conflict→typed-HOLD semantiği; ADR-G-001 scope precedence'ına bağla
Priority        : P1 (borç; blocker değil)
DependsOn       : ilk config'e dokunan authority slice'ının kapanışı
Gate            : G1
Durum           : OPEN
Acceptance      : Tek migration authority; 4 legacy key tek conflict semantiği; hiçbir doküman
                  kendi ad-hoc precedence'ını taşımaz; three-layer config roundtrip; en/tr parity
Evidence        : docs/audits/CROSS-VERIFICATION-2026-08-06.md §5.2 (6-yollu çakışma matrisi),
                  §14 (K7 reddi ve kabul edilen riskler) — Alperen kararı 2026-08-06
```

---

## 15. K2-c — ApprovalBroker gereksinim matrisi ve baseline görev tanımı

### 15.1 Mevcut altyapı (doğrulanmış code-truth)

```
21 modül · src/core/approval-*.ts
  approval-authority-keyring.ts    sign(payload)→{keyId,mac} · verify(keyId,payload,mac)
                                   status: active|retired · revisionHash() · content-chained revisions
                                   createHmac + timingSafeEqual (simetrik MAC)
  approval-decision-ingress.ts     ApprovalDecisionIntegrityAuthority  ← tip ADIYLA mevcut
  approval-file-cas.ts             openSync(tmp,'wx',0o600) — first-writer-wins, O_EXCL
  approval-oidc-authenticator.ts   OIDC principal
  approval-store.ts · -store-watch · -expiry-driver · -policy · -rules-load · -allowscope
  approval-masking · -relay · -notify-dedup · -eventstream · -live-session · -fallback
  approval-broker.ts               tombstone okuma; approvalTombstoneSchema
  approval-worker-gate.ts · attended-execution-approval.ts · pending-approvals.ts
Production tüketici (12+): tool-dispatch · term-rpc · attended-execution-approval
                          · pending-approvals · result-collector · connectors/callback-router
                          · tool-availability · agent-pool · skill-pool · global-store
Grep sonucu: signature=0 · nonce=0 · oneShot=0 · consumed=0  (terim olarak yok; `mac` kullanılıyor)
```

⭐ **Kritik bağlam (§16'da bulundu):** `ADR-G-039` (accepted, hard) şunu söylüyor: *"**Approval
ingress**, recurring-trigger occurrence ledger, and sealed evidence archive remain separate dependent
slices **under their already approved contracts**."* → **Approval ingress'in zaten onaylı bir
contract'ı var.** Baseline oradan başlamalı; sıfırdan gereksinim türetmemeli.

Ayrıca G-039 keyring modelini (bir aktif signing key · retired verify-only · content-chained
append-only revisions · her signed record'da exact key ID · **HKDF-SHA256 domain separation zorunlu**)
zaten karara bağlamış. `approval-authority-keyring.ts` bunun approval'a uygulanmış hâli.
→ Benim §"HMAC simetrik zaafı" gözlemim **düzeltilmeli**: HMAC burada kaza değil, **kabul edilmiş
G-039 tasarımı**. Bulgu 11 muhtemelen daha dar bir şeyi işaret ediyor.

### 15.2 Tüketici gereksinim matrisi — **7 doküman** (5 değil)

`ApprovalBroker`/`APPROVAL-001`'e açık hard-dependency 5 dokümanda; ama **gereksinim yüzeyi 7 doküman.**

| # | Gereksinim | A2 | A4 | A5 | A6 | A7 | A8 | A9 |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| G1 | Authenticated principal + assurance | ✅ | | | ✅ | ✅ | ✅ | ✅ |
| G2 | Tenant/project/org binding | ✅ | | | ✅ | ✅ | ✅ | ✅ |
| G3 | **Exact proposal digest**; scope/target/TTL/secret değişirse **yeni karar** | | | | | ✅ | ✅ | ✅ |
| G4 | Exact policy ID + **version/revision** | ✅ | | | ✅ | ✅ | ✅ | ✅ |
| G5 | **TTL** (kısa) + idle + **no-auto-renew** | ✅ | ✅ | ✅ | | ✅ | ✅ | ✅ |
| G6 | **Nonce / non-replay ID** | ✅ | | | | | ✅ | ✅ |
| G7 | **Single-use / one-shot** grant | ✅ | ✅ | ✅ | | | | ✅ |
| G8 | Justification / reason code / ticket ref | ✅ | | ✅ | | | ✅ | ✅ |
| G9 | Approver authority (kim onayladı) | ✅ | | | | | ✅ | |
| G10 | **Consume / revoke state** | ✅ | | | | ✅ | ✅ | ✅ |
| G11 | **Signed** approval receipt | | | | ✅ | ✅ | | ✅ |
| G12 | once / session / **persistent** grant kısıtı; high-risk'te persistent **yasak** | | | | ✅ | ✅ | | |
| G13 | Exact amount (microUSD) + period ID | ✅ | | | | | | |
| G14 | Exact run/admission/attempt ID | ✅ | ✅ | ✅ | | | ✅ | ✅ |
| G15 | Exposure özeti (fs/network/process/secret) onayda **görünür** | | | | ✅ | ✅ | | ✅ |
| G16 | Executable/artifact identity | | | | ✅ | ✅ | | |
| G17 | Attendance (attended/unattended) explicit | | ✅ | ✅ | | ✅ | | |
| G18 | **Compliance/training/promotion eligibility'den çıkarma** | | ✅ | ✅ | ✅ | ✅ | | ✅ |
| G19 | Identity/policy yoksa **onay yok** (fail-closed) | ✅ | | | ✅ | ✅ | ✅ | ✅ |
| G20 | Approval store unavailable → **HOLD**, fail-open yok | ✅ | | | ✅ | ✅ | ✅ | ✅ |
| G21 | Exact suspect path seti (blanket boolean değil) | | | | | | ✅ | |
| G22 | Confidentiality / egress ceiling | | | | | | | ✅ |
| G23 | Post-use review / post-run drift scan | | | ✅ | | | | ✅ |

**En çok istenen (≥5 doküman):** G1, G2, G4, G5, G14, G18, G19, G20.
**En az karşılanmış görünen (grep=0):** G6 nonce · G7 one-shot · G10 consumed · G11 signature (adı `mac`).

### 15.3 Akıştaki session'ın baseline görevi (K2-c uygulaması)

1. `ADR-G-039`'un işaret ettiği **onaylı approval-ingress contract'ını bul ve oku** — baseline'ın çıpası.
2. 21 modülü §15.2'nin **23 gereksinimine** karşı sınıfla: `ENFORCED / CONFIG-GATED / ADVISORY / UNWIRED / ABSENT`.
3. 12+ production tüketicinin hangi gereksinimi hangi yolla tükettiğini haritalandır.
4. **Bulgu 11'in exact zaafını** §17-T1 ile gelen bulgu metninden eşle; tahmin etme.
5. Çıktı: **ince disposition dokümanı** — hangi gereksinim mevcut, hangisi eksik, hangisi
   G-039'un kararıyla zaten çözülü, hangisi gerçekten yeni tasarım gerektiriyor.
6. Bu doküman 7 dokümanın approval kollarının blocking'ini **ya açar ya daraltır**; tam authority
   tasarımına ancak baseline "eksik yeni tasarım gerektiriyor" derse geçilir.

---

## 16. K5a — ADR crosswalk ve ⚠️ kararın yeniden değerlendirme ihtiyacı

### 16.1 Neden dayanak değişti

K5a kararı ("crosswalk yeterli, amendment gerekmez") **6 un-cited ADR** varsayımıyla verildi.
ADR envanteri çıkarıldığında (51 ADR, 38'i G-serisi) gerçek tablo:

- **~20 ADR** 9 dokümanın alanını yönetiyor,
- bunlardan **4'ü doğrudan-alan çakışması** (dokümanın tasarladığı şeyin *kendisi* zaten kabul edilmiş karar),
- **2'si `Immutable: yes`** (anayasa-sınıfı) → amendment/successor prosedürü zorunlu,
- **2'si `Enforcement-Level: hard`** → advisory değil, bağlayıcı.

### 16.2 🔴 Doğrudan-alan çakışmaları (yeni bulgu)

| ADR | Durum | Çakıştığı doküman | Neden kritik |
|---|---|---|---|
| **ADR-G-037** *Execution Budget Landing, Continuation & Metering Authority* | `accepted` · **hard** · Immutable: no · amended 2026-07-25 | 🔴 **A2 (rolling-spend) — neredeyse tüm alan** | 9 maddelik karar zaten şunları içeriyor: immutable owner hard budget primary ceiling, landing asla genişletmez/reset etmez, cumulative continuation, `execution_budget.landing` owner-authored + `reserve_ratio` policy digest'te + **product default YOK**, lifecycle `RUNNING→LANDING_REQUESTED→LANDED\|HARD_STOP`, LANDED **immutable host-owned checkpoint receipt** ister ve DONE/NO_GO değildir, continuation claim checkpoint digest'ine bağlı **first-writer-wins** ve yeni hard budget alamaz. **A2 bunu hiç anmıyor** ve kendi `SpendLease.state='landing'` + graceful-landing modelini bağımsız tasarlıyor |
| **ADR-G-039** *Provider Authority Key Custody, Rotation & Composition* | `accepted` · **hard** | 🔴 **A3 (audit key lifecycle) + A4 §10 (provider credential)** | Zaten karara bağlı: keyring revisions **yalnız platform dataDir altında**, ledger'lar stateDir altında, **bir aktif signing key + retired verify-only**, immutable account-pseudonym root, **content-chained append-only revisions**, her signed record'da exact key ID, **HKDF-SHA256 domain separation zorunlu**, missing/unsafe keyring → **typed pre-dispatch HOLD, asla fallback**, rotation + schema key-id **tek coherent delivery boundary**. A3 bunları `AuditKeyProvider` adıyla **yeniden** tasarlıyor. ⭐ Ayrıca: *"Approval ingress … under their **already approved contracts**"* → K2'nin çıpası |
| **ADR-G-021** *Self-Modifying Detection — Dogfood ↔ User-Project Discrimination* | `accepted` · **`Immutable: yes`** · Enforcement: runtime detection + rollback-guard | 🔴 **A6 D11 + §3.4** | A6 açıkça bu modeli **retire etmeyi** öneriyor: "Deckent package adı veya `src/core/` prefix'i security taxonomy değildir" → generic Protected Mutation. Ama ADR-G-021 tam olarak bu discrimination'ı anayasa-sınıfı karar olarak taşıyor. **İkinci amendment/successor vakası** |
| **ADR-G-029** *Embedded Web Terminal* | `accepted (provisional)` · **`Immutable: yes`** | 🔴 **A7** | K5b ile **kararlaştırıldı: successor ADR** ✅ |
| **ADR-G-020** *Authority, Roles, Flow & Enforcement* | `accepted` | 🟠 A6, A2, A4 | Roadmap kalemleri adıyla: `AUTHORITY-SSOT`, Layer-2 `HARD-flip`, `B1 enforce_rbac`, `B6 enforce_spend_gate`. **Çelişki değil mandate** — crosswalk yeterli. Tek soru: missing-role allow→deny flip'i accepted posture'ı değiştiriyor mu? |

### 16.3 Tam crosswalk tablosu (doküman → yönetici ADR'ler)

| Doküman | Doğrudan yönetici ADR'ler | Sınıf |
|---|---|---|
| **A1** plugin-admission | `G-005` secret file system · `G-023` agent/skill taxonomy · `G-030` consent-based provisioning · `D-005` dependency policy · `G-001` layered config | crosswalk |
| **A2** rolling-spend | 🔴 **`G-037` execution budget landing (hard)** · `G-020` (B6 enforce_spend_gate) · `G-008` provider abstraction/native-usage · `G-001` config | **çakışma** |
| **A3** audit-authority | 🔴 **`G-039` key custody (hard)** · `G-018` verification protocol & event-stream · `G-031` enterprise foundation (tenant·RBAC·**audit**) · `D-005` (KMS/HSM dep) | **çakışma** |
| **A4** provider-neutral-worker | `G-014` spawn backend/options/observation · `G-002` **spawnSync security pattern** · `G-005` secret files · `G-025` process resilience/recovery · `G-011` surface parity · `G-020` · `G-037` §3 (attendance ≠ autoApprove) | crosswalk (+1 kısmi) |
| **A5** attempt-effect | `D-009` **worker-result boundary normalization** · `G-009` evaluation integrity (proof-of-function) · `G-025` recovery/observability · `G-028` work taxonomy & evaluation | crosswalk |
| **A6** enforcement-disposition | 🔴 **`G-021` self-modifying (Immutable)** · `G-020` authority/RBAC · `G-031` enterprise foundation · `G-023` agent/skill · `G-030` consent · `D-012` terminal risk language | **çakışma** |
| **A7** terminal-session | 🔴 **`G-029` embedded web terminal (Immutable)** → successor ✅ · `G-034` native agentic terminal · `G-031` tenant/RBAC · `D-012` terminal risk language · `G-011` surface parity · `G-013` graceful shutdown | **çakışma (karara bağlandı)** |
| **A8** project-inventory | `G-002` **spawnSync security** (V14: legacy gate `spawnSync` kullanıyor) · `G-017` multi-project isolation · `G-001` layered config · `G-026` dependency-wave execution | crosswalk |
| **A9** content-provenance | 🔴 **`G-027` prompt lifecycle & worker-context** · `G-035` memory architecture · `G-004` instruction-file adapter · `G-032` self-learning loop · `G-017` multi-project isolation | **çakışma adayı** |
| **Tümü** | `G-036` zero-hardcode · `G-019` **ADR governance & 4-layer taxonomy** (amendment prosedürünün kendisi) · `D-002` test hermeticity · `G-001` config precedence | crosswalk |

### 16.4 Kapsam hükmü — T3'e devredildi (Alperen, 2026-08-06)

K5a "crosswalk yeterli" kararı **A1/A4/A5/A8 + genel ADR'ler için geçerlidir.** Dört doküman için
crosswalk yetmiyor; ancak **hangi eylemin gerektiği şimdi karara bağlanmadı** — owner hükmü, hükmün
`T3`'ün kanıtlı analiz turunda üretilmesi ve kararın o çıktı üzerinden verilmesidir.

| Doküman | ADR | Sınıf | Durum |
|---|---|---|---|
| A7 | `G-029` (`Immutable: yes`) | Model değişimi | ✅ **Successor** — K5b ile karara bağlandı |
| A6 | `G-021` (`Immutable: yes`, runtime detection + rollback-guard) | A6 D11 modeli retire ediyor | ⏭️ **T3(c)** — amendment mi successor mı, kanıtla belirlenecek |
| A2 | `G-037` (`hard`, 9 maddelik landing/continuation/metering kararı) | Alan neredeyse birebir | ⏭️ **T3(d)** — A2 G-037'yi *uyguluyor* mu, lifecycle'ını *değiştiriyor* mu? |
| A3 | `G-039` (`hard`, keyring/rotation/HKDF/HOLD) | A3 paralel `AuditKeyProvider` tasarlıyor | ⏭️ **T3(e)** — genişletme mi, model değişimi mi? |

**T3'ün üretmesi gereken:** her satır için (i) iki metnin madde-madde örtüşme tablosu, (ii) örtüşmeyen
kısımların listesi, (iii) tiplenmiş hüküm önerisi (`crosswalk` / `reconciliation` / `amendment` /
`successor`) + gerekçe, (iv) amendment/successor ise `ADR-G-019` prosedürüne uygun taslak.
**T3 karar vermez; kanıtlı öneri üretir.**

**Olası kazanç (T3 doğrularsa):** A2 ve A3 sıfırdan tasarım yerine **kabul edilmiş kararın uzantısı**
olur → mimari kapsam daralır, çifte governance framing kalkar, iki dokümanın W-paketleri kısalır.

---

## 17. Akıştaki session'a devir — detaylı iş planı

> **Bu bölüm devir paketidir.** Bu oturum analiz/kontrol/dokümantasyon yaptı; **kod, ADR, MASTER-PLAN
> ve git mutation YOK** (K9: commit yapılmadı, `docs/audits/` untracked kalıyor).
>
> **Akıştaki session'a verilecek talimat:** *"`docs/audits/CROSS-VERIFICATION-2026-08-06.md`'yi oku;
> §13 owner kararlarıdır, §17 iş planıdır. Bu dokümanı ve §17'deki task'ları uygun zamanda
> MASTER-PLAN iş planına ekle."*

### 17.0 Devir öncesi durum çıpası

| Alan | Değer |
|---|---|
| Branch / HEAD | `train-2026-08-06-o` / `77bc721ae` |
| Bu setin git durumu | **untracked** (`?? docs/audits/`) — K9 kararı |
| Doğrulama kapsamı | 22 code-truth iddiası ✅ · 43 ledger ID ✅ · 51 ADR envanteri ✅ |
| Owner kararı | §13 — 11 madde, 2026-08-06 |
| **Durabilite riski (kabul edilmiş)** | 11.001 satır **kabul edilmiş** tasarım + 1341 satır doğrulama untracked worktree'de. Worktree kaybı = toplam kayıp. Owner kararı: HEAD/main tutarsızlığı riski daha büyük |

### 17.1 Task listesi

Her task: **girdi → çıktı → kapanış kanıtı → bağımlılık.** Hiçbiri kod yazmıyor (T7 hariç, o da
implementation kapısı). Task ID'leri bu dokümana özgü; MASTER-PLAN Work ID'si değildir.

---

**T1 — Codex OWASP transkriptini kaydet** · K1(a) · ⏳ **AKTİF ADIM** · kapsam **tüm transkript**e genişletildi (Alperen, 2026-08-06) → alım contract'ı **§18.1**

- **Girdi:** Codex OWASP ASI görevinin (bkz. `CODEX-OWASP-ASI-PROMPT.md`) yanıt transkripti — §4 "Yeni bulgular"
- **Çıktı:** `docs/audits/codex-owasp-asi-response-2026-08-05.md` (analiz-only artifact)
- **Precedent:** `codex-analysis/xverify-e-2026-08-03.md` — Codex yanıtları bu repo'da **kaydediliyor**; OWASP yanıtı kaydedilmemiş, tek istisna
- **Neden 🔴:** `Bulgu 11` **7 dokümanın** gereksinim kaynağı (§15.2) ama **tam metni repo'da yok**. `Bulgu 13/14/15`'in varlığı bilinmiyor. T2 bunu bekliyor
- **⚠️ Bu oturum yapamaz:** transkript bu oturumun context'inde değil. Kaynak, Codex görevini koşan session
- **Kapanış:** dosya mevcut; 5 zorunlu bölüm tam; Bulgu 11+ metinleri okunabilir; 9 dokümanın atıf numaraları eşleşiyor
- **Bağımlılık:** —
- **Ardından zorunlu:** **T1-V** — transkript çapraz doğrulaması (§18.2, X1–X8). **Devir kapısı:**
  X1–X8 tamamlanmadan ana session'a devir yapılmaz (§18.4)

---

**T2 — Approval baseline + gereksinim eşlemesi** · K2(c)

- **Girdi:** §15.1 (21 modül envanteri) · §15.2 (23 gereksinim × 7 doküman matrisi) · T1 çıktısı · `ADR-G-039`'un işaret ettiği **onaylı approval-ingress contract'ı**
- **Çıktı:** ince disposition dokümanı — 23 gereksinim × `ENFORCED/CONFIG-GATED/ADVISORY/UNWIRED/ABSENT`
- **Yöntem:** §15.3'ün 6 adımı. **G-039'un onaylı contract'ından başla**, sıfırdan gereksinim türetme
- **Kapanış:** her gereksinimin sınıfı file:line kanıtlı; 12+ tüketicinin tüketim yolu haritalı; Bulgu 11'in exact zaafı eşlenmiş; "yeni tasarım gerekiyor mu" hükmü verilmiş
- **Bağımlılık:** T1 (Bulgu 11 metni). T1 gelmezse baseline **kör tarama** olur — bunu raporla, gizleme

---

**T3 — ADR crosswalk + amendment/successor önerileri** · K5a/K5b · ⚠️ **kapsam büyüdü**

- **Girdi:** §16 (crosswalk tablosu + 4 doğrudan-alan çakışması) · `ADR-G-019` (ADR governance & 4-layer taxonomy — amendment prosedürünün kendisi)
- **Çıktı:**
  - (a) 9 dokümana eklenecek **"ADR crosswalk"** alt-bölüm metinleri (E1a)
  - (b) **A7/G-029 successor ADR** taslağı (K5b kararı ✅)
  - (c) **A6/G-021** için amendment-mi-successor-mu analizi + taslak (⚠️ owner kararı bekliyor)
  - (d) **A2/G-037 reconciliation:** A2 G-037'yi uyguluyor mu, lifecycle'ını değiştiriyor mu? Değiştiriyorsa amendment taslağı
  - (e) **A3/G-039 reconciliation:** A3 `AuditKeyProvider`'ı G-039 keyring'inin **genişletmesi** olarak yeniden ifade et; asimetrik checkpoint imzası "bir aktif signing key" modelini değiştiriyorsa amendment taslağı
- **⏭️ Devredilen hüküm (Alperen, 2026-08-06):** K5a'nın kapsam sorusu (O1) T3'e bırakıldı.
  T3, (c)/(d)/(e) için **karar vermez** — her biri için (i) madde-madde örtüşme tablosu,
  (ii) örtüşmeyen kısımlar, (iii) tiplenmiş hüküm önerisi + gerekçe, (iv) gerekiyorsa
  `ADR-G-019` prosedürüne uygun taslak üretir. Karar bu çıktı üzerinden Alperen'e sunulur
- **Kapanış:** her doküman ≥1 ADR'ye atıflı; 4 çakışmanın her biri `crosswalk`/`reconciliation`/`amendment`/`successor` olarak tiplenmiş + gerekçeli; hiçbir `Immutable: yes` ADR in-place değiştirilmemiş
- **Bağımlılık:** —. **Öncelik yüksek ve T7'yi kapılıyor:** T3(d)/(e) A2 ve A3'ün mimari kapsamını
  daraltabilir → ilk tren A2/A3 içeriyorsa **T3 önce koşmalı**, yoksa emekliye ayrılacak bir tasarım
  implement edilir

---

**T4 — MASTER-PLAN eklemeleri (öneri paketi, uygulama owner onayıyla)** · K6 + K7 + K9

- **Girdi:** §6 (42/43 resolve) · §14.3 (config borç satırı taslağı) · K6 kararı
- **Çıktı:** `G1 FILE` exact manifest ile owner'a sunulacak öneri paketi:
  1. **`CONTENT-PROVENANCE-001`** — A9'un P0 owner satırı (K6 ✅ EVET). `AUTHORITY-001` + `SEC-OWASP-ASI-001` altında; ID/order canonical şema kurallarıyla
  2. **`CONFIG-AUTHORITY-CONSOLIDATION-001`** — K7 borç satırı (§14.3 taslağı)
  3. **Bu dokümanın evidence referansı** — hangi satır(lar)ın Evidence'ına `docs/audits/CROSS-VERIFICATION-2026-08-06.md` girecek (muhtemelen `SEC-OWASP-ASI-001` 4190)
  4. **9 tasarım dokümanının evidence referansı** — 4190 ve ilgili domain satırlarına
- **Kapanış:** exact manifest + baseline hash + her satırın Outcome/DependsOn/Truth/Acceptance/Evidence hücresi hazır; **owner'a SUNULDU, uygulanmadı**
- **Bağımlılık:** T3 (ADR referansları Evidence'a girecek)
- **⚠️ K9 notu:** T4 MASTER-PLAN mutation'ıdır ve `docs/audits/` untracked. Evidence bir untracked dosyaya atıf yapacaksa **ya bu set commit edilir ya evidence içeriği satıra özetlenir** → owner kararı gerekiyor (yeni açık madde)

---

**T5 — Foundation açığı disposition** · K3 + K4 kararlarının kaydı

- **Girdi:** §4-U (U1–U7) · K3 (ertelendi) · K4 (ince tasarım, düşük öncelik)
- **Çıktı:** her foundation için tiplenmiş disposition:
  - `APPROVAL-001` (U1) → **T2 baseline** (K2-c)
  - `OPERATION-001` (U2) → **ERTELENDİ** (K3); A3 `completeness: unknown` ile teslim; A4/A7 cutover'ları sonrası aşağıdan-yukarı
  - `CAPABILITY-001` (U3) → A4 §6.1 `WorkerCapabilityEnvelope` fiilen tasarım taşıyor → **kapsam kontrolü gerekiyor**, ayrı doküman gerekmeyebilir
  - `TENANT-001` (U4) → `ADR-G-031` (Enterprise Foundation: tenant·RBAC·audit) + `ADR-G-017` (multi-project isolation) zaten karar taşıyor → **crosswalk yeterli olabilir**
  - `RECEIPT-001` (U5) → A3'ün "causal index" modeli tüketici; üretici tanımı açık
  - `PLUGIN-SANDBOX-001` (U6) → **ince tasarım, düşük öncelik** (K4); A1 7031 bağımsız settle olabilir
  - `MCP-TRUST-001` (U7) → **DEFERRED** (owner, MCPV2 cutover sonrası)
- **⭐ Ek kapsam (§20.1, Alperen 2026-08-06):** 6 yeni bulgunun tamamı tiplenmiş —
  `11`→K2-c/T2 · `12-a`→A9 W8 · `12-b`→A8 W5+W7 · `13`→A5 W6 · `14`→A5 §2.1+D7 (zaten kapsanmış) ·
  `15`→A4 W6 · `O8`→A4 W6. **ASI08** → mevcut `RECOVERY-BORN-490-DESCENDANT-CANCELLATION-001`
  satırı yeterli (§20.2). **Sahipsiz kalem yok** — T5 bu atamaları doğrular, yeniden türetmez
- **Kapanış:** 7 foundation + 6 yeni bulgunun her biri ya tasarım-var ya ertelendi ya crosswalk-yeterli olarak tiplenmiş; hiçbiri "belirsiz" kalmıyor
- **Bağımlılık:** T3 (U3/U4 için ADR crosswalk kararı belirleyici)

---

**T6 — `codex-analysis` ile birleştirme** · §12.2

- **Girdi:** `codex-analysis/16-work-package-dag.md` (WP0–WP11) · `codex-analysis/14-critical-path-prioritization.md` · §5.1 (bu setin FAZ 0–9)
- **Çıktı:** tek birleşik program DAG'ı. Doğrulanmış eşleme: **WP3 == U2 (`OPERATION-001`)** · **WP4 == U1+U3+U4+U5**
- **Kritik:** `codex-analysis` WP0 (canonical reconciliation, ≥1 READY root) ve WP1 (trust-signal floor — **591-failure test baseline**, CI/docs drift) bu güvenlik setinin **hiç değinmediği** ön koşullar. WP0'ın bir parçası (SSOT-003 bölmesi) 2026-08-06'da kapandı; kalanı açık
- **Kapanış:** hangi güvenlik FAZ'ı hangi WP'nin içinde/sonrasında; WP0/WP1 kalan işleri listeli
- **Bağımlılık:** —

---

**T7 — Implementation kapısı: ilk tren tanımı**

- **Girdi:** T2–T6 çıktıları · §5.1 birleşik DAG · §11.4 ilk-slice adayları
- **Çıktı:** ilk trenin Goal/Mission/Flow DAG'ı + `DIRECTIVES.md` projection'ı
- **Aday sıralaması (bu doğrulamanın desteklediği):**
  1. **`AUDIT_HMAC_SECRET` düzeltmesi** — atomik, küçük, yüksek getirili; kod yorumu bile "tracked follow-up" diyor (V1). ⚠️ T3(e) ile birlikte: G-039 keyring'ini genişletmek mi, ayrı mı?
  2. **A3 W1–W3** (audit contracts + key provider + host ledger) — 6 doküman buna tabi; `AUDIT-001` ledger'ın kendi deadlock geçmişinde **unblocker** olarak anılıyor (§12.3)
  3. **A9 W5** (memory laundering closure) — P0, en somut exploit (V15); ama A9 kendisi "W2/W3/W4 closure'ına dependency-bound tut, **isolated patch yapma**" diyor
- **🔴 K7 reddinden gelen zorunlu kısıt:** aynı trende **yalnız bir doküman** `config-types.ts`/`config.ts`'e dokunur. İlk dokunan **conflict semantiğini kurar**; sonraki dokümanlar **ona atıf yapmak zorundadır** (acceptance şartı). 4 legacy boolean: `plugin_require_signature` · `enforce_spend_gate` · `enforce_rbac` · `allowShellKind`
- **Kapanış:** owner start gate'i (§12 update protocol); admission §10.1 bütçesine uygun
- **Bağımlılık:** T2, T3, T5 (en azından)

---

### 17.2 Task bağımlılık grafiği

```
T1 (Codex TAM transkript) ──▶ T1-V (X1–X8 çapraz doğrulama) ──▶ T2 (approval baseline)
                                        │  DRIFT/HARDENED/LOST varsa
                                        └──▶ §A, §1, §3, §6, §15.2 düzeltmesi
                                    │
T3 (ADR crosswalk + 4 reconciliation) ──┼──▶ T5 (foundation disposition)
        │                               │         │
        │                               ▼         ▼
        └──────────────────────────▶ T4 (MASTER-PLAN öneri paketi)
                                              │
T6 (codex-analysis birleştirme) ──────────────┤
                                              ▼
                                    T7 (ilk tren tanımı) ──▶ implementation
```

`T3` ve `T6` bağımsız — paralel yürüyebilir. `T1` zaman-duyarlı ve `T2`'yi kilitliyor.

### 17.3 Akıştaki session'ın yapmaması gerekenler

- **Commit / push** — K9: bu set untracked kalıyor. Alperen istemedikçe git mutation yok
- **MASTER-PLAN mutation** — T4 yalnız **öneri paketi** üretir; uygulama `G1 FILE` + owner onayı
- **`Immutable: yes` ADR'yi in-place düzeltmek** — G-029 ve G-021 için amendment/successor prosedürü (`ADR-G-019`)
- **K8 harmonization'ı uygulamak** — PROVISIONAL; owner teyidi olmadan E2/E3/E6/E8/E9/E12/E14 uygulanmaz
- **MCP'ye dokunmak** — deferred (§8); `src/mcp/tools/start.ts` touchpoint'leri blocked-edge
- **Satır numaralarını kör kullanmak** — bu oturum 22 tanesini doğruladı; kalanı doğrulanmadı
- **Bulgu 11'i tahmin etmek** — T1 gelmezse "kör tarama yapıldı" diye **raporla**

### 17.4 Bu oturumdan devredilen açık maddeler

| # | Açık madde | Kime |
|---|---|---|
| **O1** | ⏭️ **T3'e devredildi** (Alperen, 2026-08-06) — A6/G-021, A2/G-037, A3/G-039 için crosswalk yetmiyor. T3(c)/(d)/(e) kanıtlı hüküm önerisi üretir; karar o çıktı üzerinden verilir. §16.4 | T3 → sonra **Alperen** |
| **O2** | ✅ **KAPANDI** (2026-08-06): transkript eklendi (`owasp-agentic-top-10-codex-only-transcript-2026-08-05--2026-08-06.md`, 71 mesaj, SHA-256 doğrulandı) ve X1–X8 koşuldu → §19 | — |
| **O3** | T4 evidence paradoksu: MASTER-PLAN satırı untracked dosyaya atıf yapabilir mi, yoksa evidence satıra özetlenmeli mi? (K9'un yan etkisi) | **Alperen** |
| **O4** | ✅ **KAPANDI** (§19.0): Bulgu 13 = honest-gate exception fail-open · 14 = Markdown muafiyeti · 15 = git-worker-guard bypass. Numaralandırma = 10 + yeni-bulgu indeksi | — |
| **O5** | K8 teyidi/reddi | **Alperen** (yarın) |
| **O6** | `CAPABILITY-001` (U3) ayrı doküman gerekiyor mu — A4 §6.1 kapsamı yeterli mi? | T5 |
| **O7** | ✅ **KAPANDI** (Alperen, 2026-08-06): doğal sahibine atandı — 13→A5 W6 · 15→A4 W6 · 12-a→A9 W8 · 12-b→A8 W5+W7. ASI08: mevcut `RECOVERY-BORN-490-…` satırı yeterli, ince tasarım gerekmez → **§20.1/§20.2** | — |
| **O8** | ✅ **KAPANDI** (Alperen, 2026-08-06): **A4 §2.4 + W6** kapsamına alındı (touchpoint'lerinde `sprint-spawner.ts` zaten var) → **§20.1** | — |
---

## 18. Codex OWASP transkripti — alım ve çapraz doğrulama planı

> **Owner kararı (Alperen, 2026-08-06):** *"Codex session transkript edilebilir. Tüm transkripti
> audits altına ekleyelim, sonra cross-verification'ı yapalım, sonra ana session'a işi devredelim."*
>
> **Sıra güncellendi:** T1 (transkript alımı) → **T1-V (transkript çapraz doğrulaması, bu bölüm)** →
> T2…T7 → devir. §17.2 bağımlılık grafiği bu adımı T1'in hemen ardına alır.

### 18.1 Alım contract'ı

| Alan | Değer |
|---|---|
| Hedef yol | `docs/audits/codex-owasp-asi-transcript-2026-08-05.md` |
| Kapsam | **Tüm transkript** (yalnız §4 "Yeni bulgular" değil) — prompt echo + 5 zorunlu çıktı bölümü |
| Sınıf | **analiz-only artifact** — policy üretmez, karar authority'si değildir |
| Precedent | `codex-analysis/xverify-e-2026-08-03.md` (Codex yanıtları bu repo'da kaydediliyor) |
| Git durumu | **untracked** (K9 kararı geçerli) |
| Provenance başlığı | Kaynak prompt (`CODEX-OWASP-ASI-PROMPT.md`), provider/model, oturum tarihi, doğrulanan HEAD, XVERIFY-PROVIDER-SEPARATION notu |

**Beklenen 5 bölüm** (prompt'un zorunlu çıktı formatı):
1. Yönetici özeti (≤10 satır)
2. **ASI01–ASI10 tablosu** — mekanizma (file:line) → enforcement sınıfı → not → en kritik gap → MASTER-PLAN satırı (bilinmiyorsa `LEDGER-UNKNOWN`)
3. **Önceki-bulgu hükümleri** — 10 madde × `CONFIRMED`/`REFUTED`/`PARTIAL` + kanıt satırı
4. **Yeni bulgular** — Bulgu 11+ (prompt: *"en değerli bölüm budur"*)
5. **Sıralı risk listesi** — exploit-olasılığı × etki, ilk 5

### 18.2 Çapraz doğrulama — 8 kontrol

Transkript geldiğinde koşulacak kontroller. Her biri **tiplenmiş sonuç** üretir:
`MATCH` · `DRIFT` (doküman transkriptten sapmış) · `HARDENED` (transkript `UNVERIFIED` demiş, doküman
kesinleştirmiş) · `LOST` (transkriptte var, dokümanda yok) · `ADDED` (dokümanda var, transkriptte yok).

| # | Kontrol | Neden kritik | Etkilediği bölüm |
|---|---|---|---|
| **X1** | **Bulgu 11 metni ↔ §15.2 gereksinim matrisi** — 23 gereksinimi *tüketicilerden* türettim, bulgudan değil. Bulgunun işaret ettiği exact zaaf matriste var mı? Matriste olup bulguda olmayan var mı? | §15.2 tüm K2-c baseline'ının hedef listesi. Yanlışsa T2 yanlış yeri arar | §15.2 · T2 |
| **X2** | **Bulgu 13/14/15 var mı?** | O4 kapanır; varsa **sahipsiz bulgu** olarak §1'e girer ve doküman ihtiyacı owner kararına çıkar | §1 · O4 · T5 |
| **X3** | **10 önceki bulgunun hükümleri ↔ dokümanların beyanı** — A4 "Bulgu 4 PARTIAL", A5 "Bulgu 5 PARTIAL", A8 "CONFIRMED", A9 "PARTIAL — core gap confirmed", A6 "exact CONFIRMED / genelleme PARTIAL", A7 "PARTIAL" diyor. Transkriptin hükümleriyle **birebir** uyuyor mu? | Doküman kendi kaynağının hükmünü değiştirmişse tüm baseline sınıflandırması şüpheli olur | §A (A1–A9) · §3 |
| **X4** | **ASI01–ASI10 tablosu ↔ dokümanların ASI eşlemesi** — §1'de ölçtüm: A9 10/10 ASI · A8 6 · A7 2 · A2 2 · A1 1 · A3 1 · A5 1 · A6 1 · **A4 sıfır ASI atfı**. Transkriptin tablosu bu dağılımı destekliyor mu? A4'ün ASI'siz olması normal mi? | ASI kapsama boşluğu = `SEC-OWASP-ASI-001` (4190) assurance eşlemesinde delik | §1 · §7 · T4 |
| **X5** | **`LEDGER-UNKNOWN` → atanmış ID sıçraması** — prompt açıkça *"bilmiyorsan `LEDGER-UNKNOWN` yaz, uydurma"* dedi. Transkriptte `LEDGER-UNKNOWN` olan bir alan, tasarım dokümanında kesin bir Work ID'ye bağlanmışsa **doğrulanmamış sıçrama**dır | §6'da 42/43 ID resolve etti — ama *doğru* satıra mı bağlandı, ayrı soru | §6 · T4 |
| **X6** | **`UNVERIFIED` işaretlerinin korunması** — prompt: *"Belirsizlikte tahmin yazma."* Dokümanlarda 3 yerde `UNVERIFIED` korunmuş (A2 §2.1 harici resource-log producer'ı · A9 §4.7 provider-internal message graph · A9 §16.3 provider CLI web internals). Transkriptte başka `UNVERIFIED` var mı ve doküman onu kesinleştirmiş mi? | `HARDENED` bulgu = kanıtsız iddia üzerine mimari kurma riski | §3 · §A |
| **X7** | **Kanıt satırı kaybı** — prompt bulgusu 4 `provider-command-spec.ts:129,145` diyor; A4 `:119-136`,`:138-152` gösteriyor (uyumlu). Diğer 9 bulgunun file:line'ları dokümanlara **tam** taşındı mı, daraltıldı mı? | Daraltılmış kanıt = doğrulanmamış kapsam küçültmesi | §3 · §A |
| **X8** | **Yeni bulguların doküman-sahipliği** — Bulgu 11 (sahipsiz, 7 tüketici) · 12 (A9 §15 üstlendi) · 16 (sahipsiz, A1 parent closure) · 13/14/15 (X2 belirleyecek). Her yeni bulgu ya bir dokümanın kapsamında ya açıkça sahipsiz olarak listeli olmalı | Sahipsiz bulgu sessizce kaybolur — bu setin en büyük yapısal riski | §1 · §4-U · T5 |

### 18.3 Çıktı

`docs/audits/CROSS-VERIFICATION-2026-08-06.md` içine **§19 — Transkript çapraz doğrulama sonucu**:
X1–X8 tablosu + tiplenmiş sonuçlar + etkilenen bölümlerin düzeltmeleri. `DRIFT`/`HARDENED`/`LOST`
bulunursa ilgili §A bloğu ve §3 satırı **düzeltilir** (bu oturumun kendi hatası olarak kaydedilir).

### 18.4 Devir kapısı

Ana session'a devir **X1–X8 tamamlanmadan yapılmaz.** Gerekçe: §15.2 (T2'nin hedef listesi),
§1 (bulgu haritası), §3 (baseline sınıflandırması) ve §6 (ledger eşlemesi) transkript doğrulanmadan
**türetilmiş** durumda — kaynağa karşı sınanmamış. Devir paketinin çıpası transkript olmalı.
---

## 19. Transkript çapraz doğrulama sonucu (X1–X8)

**Kaynak:** `docs/audits/owasp-agentic-top-10-codex-only-transcript-2026-08-05--2026-08-06.md`
— 3.625 satır / 173 KB · 71 Codex mesajı · gövde SHA-256 `b0d37ea2…345586e1` · ilk `2026-08-05T10:18:35Z`,
son `2026-08-06T07:32:17Z` · byte-for-byte doğrulandı (Alperen).

**Ana çıktı:** `Codex 006 — final_answer` prompt'un 5 zorunlu bölümünü taşıyor. `Codex 007+` bulgu-başına
derinleşme. Tüm 5 bölüm mevcut ✅

### 19.0 ⭐ Bulgu numaralandırması ÇÖZÜLDÜ

Codex'in "Yeni bulgular" bölümü **kendi içinde 1–6** olarak numaralı. Tasarım dokümanlarının
`Bulgu 11/12/16` atıfları = **10 + yeni-bulgu indeksi**:

| Doküman atfı | Codex yeni-bulgu | Konu | Kanıt |
|---|---|---|---|
| **Bulgu 11** | Yeni #1 | **Approval decision-file forgery** — CONFIG-GATED, kritik | `approval-contract.ts:193-209` · `approval-broker.ts:469-545` · `approval-worker-gate.ts:250-317` · `spawn-backend-docker.ts:5625-5665` · `config.ts:1521-1525` |
| **Bulgu 12** | Yeni #2 | **Unsigned event ile scope auto-expansion** | `event-stream.ts:326-372`, `:389-428` · `sprint-phases.ts:1881-1917` |
| **Bulgu 13** | Yeni #3 | **Honest-gate verifier exception fail-open** | `sprint-phases.ts:1686-1713` |
| **Bulgu 14** | Yeni #4 | **Out-of-scope Markdown genel muafiyeti** | `result-evaluator.ts:2365-2378`, `:2409-2414` |
| **Bulgu 15** | Yeni #5 | **Git worker guard bypass + Windows unsupported** | `git-worker-guard.ts:1-17`, `:92-114`, `:223-231` |
| **Bulgu 16** | Yeni #6 | **Plugin sandbox yerine host-process execution** | `plugin-hooks.ts:78-91`, `:129-155` |

→ **O4 KAPANDI.** 13/14/15 mevcut ve tanımlı. Toplam bulgu: **10 önceki + 6 yeni = 16.**

### 19.1 X1 — Bulgu 11 metni ↔ §15.2 gereksinim matrisi · `PARTIAL MATCH — matris yanlış ağırlıklı`

Bulgu 11'in **exact locus'u**, benim tüketicilerden türettiğim 23 gereksinimden çok daha dar:

```
approval-contract.ts:207   authorization: approvalDecisionAuthorizationSchema.optional()
                           kod yorumu: "A Goal-v2 allow is never authority unless this
                                        envelope passes host validation"   ← niyet var, zorunluluk yok
approval-broker.ts:469-545 dışarıdan yazılan .decision.json'da yalnız schema/request/file
                           eşleşmesi doğrulanıyor → karar settle ediliyor
approval-worker-gate.ts    sonuç yalnız decision.decision === 'allow' üzerinden kabul
spawn-backend-docker.ts    Docker worker project root'a RW → .deckent/approvals YAZILABİLİR
config.ts:1523             approval.gate_enabled ?? false   ← etki gate açıkken doğar
```

**Sonuç:** §15.2 matrisi *yanlış değil* ama **bulguyu yansıtmıyor** — 23 gereksinim içinde bu forgery
yolu yalnız `G11 signed approval receipt` olarak, **düşük ağırlıkta** temsil edilmiş. Kaynak bulgu ise
tek somut exploit zinciri gösteriyor.

**§15.2 düzeltmesi (bu doğrulamanın kendi hatası):** iki gereksinim **birinci sınıf** hâline getirilmeli:
- **G11a** — authorization envelope **zorunlu** (`.optional()` kaldırılır); envelope host validation'dan geçmeden `allow` authority değildir
- **G24** — decision store **worker write scope dışında**; `.deckent/approvals` project RW mount içinde kalamaz

→ **T2 baseline'ının 1. hedefi bu iki madde**; 23 gereksinim geri kalanı çevresel.

### 19.2 X2 — Bulgu 13/14/15 · `RESOLVED` → §19.0

### 19.3 X3 — 10 bulgunun hükümleri ↔ dokümanların beyanı

| # | Codex hükmü | Doküman beyanı | Sonuç |
|---|---|---|---|
| 1 | CONFIRMED | A1: "toplam sınıf **UNWIRED**" | `MATCH` |
| 2 | CONFIRMED | A2: baseline **ADVISORY** | `MATCH` |
| 3 | CONFIRMED | A3: "toplam sınıf **ADVISORY tamper evidence**" | `MATCH` |
| **4** | **CONFIRMED** | A4 §2.6: "Önceki Bulgu 4 hükmü **PARTIAL**'dır" | 🔴 **`DRIFT`** |
| 5 | PARTIAL | A5 §2.6: "**PARTIAL**" | `MATCH` ✅ |
| 6 | CONFIRMED | A6 §2.1: "exact-function düzeyinde **CONFIRMED**; genelleme **PARTIAL**" | `MATCH+` (rafine, açıklanmış) |
| 7 | CONFIRMED (*"hüküm yalnız loopback kapsamındadır"*) | A7: "**PARTIAL**" | `MATCH` — **özde aynı**, etiket farklı; A7 gerekçesini açıklıyor |
| 8 | PARTIAL | MCP — doküman yok (deferred) | `N/A` |
| 9 | CONFIRMED | A8: "**CONFIRMED**" | `MATCH` ✅ |
| 10 | CONFIRMED (web-exploit caller `UNVERIFIED`) | A9: "**PARTIAL — core gap confirmed**" | `MATCH` — özde aynı; A9 compound ifadeyi rafine ediyor ve açıklıyor |

**🔴 Tek gerçek drift — #4/A4:** Codex `CONFIRMED` dedi; A4 `PARTIAL`'a çevirdi. A4'ün gerekçesi
savunulabilir (Claude+Docker external containment alıyor, Codex host `full-auto` broad workspace
sandbox taşıyor → "üç provider'ın guardrail'leri **aynı biçimde** kapalı" iddiası fazla geniş). Ama
A4 **kendi kaynağının hükmünü geçersiz kıldığını beyan etmiyor.** A7 ve A9 aynı durumda gerekçesini
açıklıyor; A4 açıklamıyor.
→ **Düzeltme (E15):** A4 §2.6'ya "bu hüküm Codex'in `CONFIRMED` verdict'ini şu gerekçeyle daraltır" cümlesi.

### 19.4 X4 — ASI01–ASI10 kapsaması · 1 sahipsiz risk

Codex'in genel notu: **8/10 ASI "Zayıf", 2 "Orta", hiçbiri "Güçlü" değil.**

| Bulgu | Sonuç |
|---|---|
| **ASI08 — Cascading Failures** | 🔴 **SAHİPSİZ.** Codex sınıfı `ENFORCED`/Orta, kritik gap: *"başlatılmış redundant descendants ve external side effects tam olarak iptal/contain edilmiyor"*, ledger: `RECOVERY-BORN-490-DESCENDANT-CANCELLATION-001` (`MASTER-PLAN:802`). **9 tasarım dokümanının hiçbirinde yok** (grep = 0) |
| A4'ün ASI atfı = 0 | A4, Codex'in **#1 sıralı riskinin** (ASI02/ASI05) sahibi ama kendi metninde hiç ASI kodu taşımıyor → `SEC-OWASP-ASI-001` (4190) assurance eşlemesinde kozmetik ama gerçek delik |
| Kalan 9 ASI | Tasarım dokümanı kapsamında ✅ |

### 19.5 X5 — `LEDGER-UNKNOWN` ve ledger eşleme sapması

| Kontrol | Sonuç |
|---|---|
| ASI07 = **`LEDGER-UNKNOWN`** (kaynakta) | ✅ **Meşru çözüm** — A9 §15 `AgentMessageEnvelope` ile üstlendi ve **yeni satır önerdi** (`CONTENT-PROVENANCE-001`). Uydurma ID yok. Prompt'un "uydurma" yasağına uyulmuş |
| **ASI06 ledger sapması** | 🟠 **`LOST`.** Codex: `LEARNING-001` (`:947`) + `TRAINING-TRACE-001` (`:948`) + `PROMPT-001` (`:949`). A9: `MEMORY-AUTHORITY-001` + `PROMPT-001`; **`LEARNING-001` ve `TRAINING-TRACE-001`'e sıfır atıf** (ikisi de MASTER'da var: 8 ve 4 kayıt). A9 §14.3 training-trace'i anıyor ama ledger'a bağlamıyor → ASI06'nın **learning/promotion ekseni sahipsiz** |
| Diğer ASI eşlemeleri | Kaynakta exact satır numaralı (`MASTER-PLAN.md:834`, `:841`, `:850`…) ve dokümanlarla uyumlu ✅ |

### 19.6 X6 — `UNVERIFIED` işaretlerinin korunması

| Kaynak `UNVERIFIED` | Doküman | Sonuç |
|---|---|---|
| Web'e özgü exploit caller'ının runtime davranışı (bulgu 10 hükmü) | A9 §16.3 `UNVERIFIED` | ✅ `PRESERVED` |
| `scope_auto_expand_enabled` canonical config declaration/authoring yolu (ASI07 + yeni #2) | — | 🔴 **`LOST`** — Bulgu 12'nin tamamıyla birlikte (§19.8) |
| **Ters yön:** A2 §2.1 "canonical billed-spend producer yok" (`UNVERIFIED` harici süreç için) | Kaynakta **yok** | ✅ **`ADDED`** — Codex bu boşluğu bulmamış; A2'nin özgün katkısı, bu oturumda **V4 ile doğrulandı** (`resource-monitor.ts`'de `costUsd` = 0 eşleşme). Krediye değer |

### 19.7 X7 — Kanıt satırı kaybı ve **yeni kod bulgusu**

| # | Kontrol | Sonuç |
|---|---|---|
| 1 | Bulgu 4 kanıt satırları | ✅ A4 **kaynaktan daha hassas** (`:97-117`/`:119-136`/`:138-152` vs `:97-153`) |
| 2 | Bulgu 2 — `cost-gate.ts:295-352` | 🟠 **`LOST`.** Kaynak bu bloğu atıflıyor; kodda açıkça: *"WARN-ONLY — never blocks. The **HARD pre-spawn block** (refuse-unless-acknowledged) is a **deliberate post-beta follow-up** — see **TODO(phase2) at the two call sites**."* A2'de bu satıra **0 atıf**. Kayıp: kodun kendi kabul ettiği deferral + **iki exact call site** |
| 3 | **İki allowlist builder** | 🔴 **YENİ BULGU** (aşağıda) |

**🔴 Yeni bulgu — iki allowlist builder arasındaki invariant sapması**

Kaynak `sprint-spawner.ts:946-958`'i atıflıyor; A4 yalnız `spawn-backend-docker.ts:3529-3575`'i. İkisi
farklı davranıyor:

```
spawn-backend-docker.ts:3567-3575   buildDockerAllowedTools()
  inspectionOnly = filesWrite.length === 0 && filesRead.length > 0
  writeSource    = filesWrite.length > 0 ? filesWrite : (inspectionOnly ? [] : directories)
  → filesWrite VARSA directories write grant'e KATILMAZ  ✅ (A4 §2.4'ün "değerli correction"ı)
  → filesWrite BOŞ + filesRead varsa → yalnız '.tasks/'  ✅ (read-only semantiği)

sprint-spawner.ts:416-430           buildAllowedWriteTargets()
  raw = ['.tasks/', ...task.scope.directories, ...task.scope.filesWrite]
  → directories KOŞULSUZ write grant'e katılıyor        ❌
  → inspectionOnly semantiği YOK                        ❌
  → tüketiciler: :1132, :1185, :1226, :1249 (subprocess/tmux/host yolları)
```

**Neden önemli:** `scope.directories`'in implicit write grant olmaması **üç dokümanın açık
invariant'ı** — A5 D6 ("`directories` read/context kapsamıdır; implicit write wildcard değildir"),
A6 D5 ("legacy `directories` write acceptance kaldırılır"), A8 §7-9 (aynı). Docker yolu bu invariant'ı
**zaten sağlıyor**; non-Docker spawn yolu **sağlamıyor** ve **hiçbir doküman bunu kaydetmemiş.**

**Not — kendi hipotezimin çürütülmesi:** ilk okumada `sprint-spawner.ts:957`'deki
`: 'Read,Write,Edit,Bash,Glob,Grep'` (tamamen unscoped) dalını "fail-open fallback" sandım.
**REFUTED:** `raw` her zaman `'.tasks/'` içeriyor, dolayısıyla `writeTargets` boş olamaz ve o dal
pratikte erişilemez. Gerçek bulgu unscoped fallback değil, **directories-merge sapması**dır.

### 19.8 X8 — Yeni bulguların doküman-sahipliği · 🔴 4 SAHİPSİZ

| Bulgu | Sahip | Doğrulama |
|---|---|---|
| **11** Approval decision-file forgery | 🔴 **SAHİPSİZ** — 7 doküman tüketici, tasarım yok | K2-c/T2 kapsamına alındı ✅ |
| **12** Unsigned event → scope auto-expansion | 🔴 **SAHİPSİZ** | `scope_auto_expand` · `attemptedPath` · `sprint-phases.ts:1881-1917` → **9 dokümanda grep = 0.** A9 §15 `AgentMessageEnvelope`'u *genel* olarak tasarlıyor ama **bu exploit yolunu hiç anmıyor**. A3'ün "Bulgu 12 ayrı kapsamdadır" beyanı doğruydu; A9 boşluğu kapatmadı |
| **13** Honest-gate verifier exception fail-open | 🔴 **SAHİPSİZ** | `sprint-phases.ts:1686-1713` → **9 dokümanda grep = 0.** Kod doğrulandı: *"Gate faults log + **treat-as-honest fallback**"* ve `: { result: rawResult, honest: true }`. A5 honest-gate'i `result-evaluator.ts:2380-2525` üzerinden ele alıyor; **exception yolunu kapsamıyor** |
| **14** Out-of-scope Markdown muafiyeti | ✅ **KAPSANMIŞ** | A5 §2.1 + D7 ("post-hoc extension exemption yoktur") |
| **15** Git worker guard bypass | 🔴 **SAHİPSİZ** | `git-worker-guard.ts` → **9 dokümanda grep = 0.** A4 §2.3 yalnız shim'in *mount edilmesini* anıyor (`spawn-backend-docker.ts:5388-5406`) ve D-seviyesinde "denylist containment yerine geçmez" diyor; **modülün kendi bypass'larını** (`$1`-only kontrol, `git -C … stash`, absolute real-git path, **Windows unsupported**) kaydetmiyor |
| **16** Plugin host-process execution | ⏸️ **Sahipsiz-by-design** | A1 D10 açıkça 7030'a devrediyor; K4 kararı ✅ |

### 19.9 Toplam hüküm

| Sınıf | Sayı | Kalemler |
|---|---|---|
| `MATCH` | 7 | Bulgu hükümleri 1,2,3,5,6,9 + ASI07 `LEDGER-UNKNOWN` çözümü |
| `MATCH` (etiket farkı, açıklanmış) | 2 | Bulgu 7 (A7), Bulgu 10 (A9) |
| 🔴 `DRIFT` | 1 | **Bulgu 4** — Codex `CONFIRMED` → A4 `PARTIAL`, beyan edilmeden (→ E15) |
| 🟠 `LOST` | 3 | ASI06 ledger ekseni (`LEARNING-001`+`TRAINING-TRACE-001`) · `cost-gate.ts:295-352` TODO+call-site'lar · `scope_auto_expand` `UNVERIFIED`'ı (Bulgu 12 ile) |
| 🔴 `UNOWNED` | **4 bulgu + 1 ASI** | **Bulgu 11, 12, 13, 15** + **ASI08** |
| ✅ `ADDED` (doküman katkısı) | 2 | A2 §2.1 billed-spend producer yokluğu · A4'ün kaynaktan hassas satır aralıkları |
| 🔴 `NEW` (bu doğrulamada bulundu) | 1 | **İki allowlist builder invariant sapması** (`buildAllowedWriteTargets` vs `buildDockerAllowedTools`) |
| ❌ `HARDENED` | **0** | Hiçbir doküman `UNVERIFIED` bir iddiayı kesinleştirmemiş ✅ |

**Genel değerlendirme:** tasarım dokümanları kaynağa **büyük ölçüde sadık** — 0 `HARDENED`, 1 beyan
edilmemiş drift, 3 ayrıntı kaybı. Asıl problem sadakat değil **kapsama**: 6 yeni bulgunun **4'ü
sahipsiz** ve ASI08 hiç ele alınmamış. Bunlar sessizce kaybolacak sınıftaydı; transkript alınmasa
tespit edilemezdi.

### 19.10 Bu doğrulamanın kendi düzeltmeleri

| # | Bölüm | Düzeltme |
|---|---|---|
| **E15** | A4 §2.6 | "Bu hüküm Codex'in `CONFIRMED` verdict'ini şu gerekçeyle daraltır…" beyanı ekle (X3 drift) |
| **E16** | §15.2 | `G11a` (authorization envelope **zorunlu**) + `G24` (decision store worker write scope dışı) birinci sınıf gereksinim olarak ekle; T2'nin 1. hedefi yap (X1) |
| **E17** | §1 + §4-U | **Bulgu 11/12/13/15 + ASI08** → sahipsiz kalem olarak kaydet; owner disposition gerekiyor (X8, X4) |
| **E18** | A9 | ASI06 ledger eşlemesine `LEARNING-001` + `TRAINING-TRACE-001` ekle (X5) |
| **E19** | A2 | `cost-gate.ts:295-352` + iki `TODO(phase2)` call-site'ını baseline'a ekle (X7) |
| **E20** | A4 | `buildAllowedWriteTargets` (`sprint-spawner.ts:416-430`) sapmasını §2.4'e ekle; W6 cutover kapsamına al (X7 yeni bulgu) |
| **E21** | §19.0 | Bulgu numaralandırma tablosunu §1'e projekte et (tarihsel netlik) |
---

## 20. Devir kapanışı — bağlanmış kararlar ve devir prompt'u

> **Owner kararları, Alperen 2026-08-06 (4/4 öneri kabul).** Bu bölüm bu oturumun **son** çıktısıdır.

### 20.1 O7 + O8 — sahipsiz kalemlerin ataması `KAPANDI`

**Karar: doğal sahibine ata.** Dördü de **mevcut W-paketlerine** oturuyor → yeni ledger satırı,
yeni doküman ve ek analiz turu gerekmiyor.

| Kalem | Sahip | Hedef bölüm | W-paketi | Gerekçe |
|---|---|---|---|---|
| **Bulgu 13** — honest-gate verifier exception fail-open (`sprint-phases.ts:1686-1713`; kod: *"Gate faults log + **treat-as-honest fallback**"* → `{result: rawResult, honest: true}`) | **A5** attempt-effect | §2 baseline + §13.3 honest-gate disposition | **A5 W6** (landing/settlement integration — touchpoint'lerinde `sprint-phases.ts` **zaten var**) | Honest-gate disposition A5'in alanı; A5 §13.3 `findBoundaryViolations`'ı daraltıyor ama **exception yolunu** kapsamıyor. Hedef davranış: verification yapılamaması `honest:true` değil **typed HOLD** |
| **Bulgu 15** — git worker guard bypass (`git-worker-guard.ts:1-17`, `:92-114`, `:223-231`: yalnız `$1` kontrolü · `git -C … stash` / absolute real-git path bypass · **Windows unsupported**) | **A4** provider-neutral | §2.3 baseline (mevcut "Git commands / Narrow denylist" satırının altına) | **A4 W6** (provider/backend cutover — shim üç yola da mount ediliyor: `spawn-backend-docker.ts:5388-5405`, `tmux.ts:306-309`, `subprocess.ts:408-423`) | A4 §8.3 zaten "command-name denylist containment yerine geçmez" diyor; modülün **exact bypass'ları** ve Windows boşluğu bu tezi kanıta bağlıyor |
| **O8** — iki allowlist builder invariant sapması (`buildAllowedWriteTargets` `sprint-spawner.ts:416-430` `directories`'i **koşulsuz** write grant'e katıyor + `inspectionOnly` semantiği yok; `buildDockerAllowedTools` katmıyor) | **A4** provider-neutral | §2.4 (mevcut "Claude allowlist gerçeği" bölümüne) | **A4 W6** (touchpoint'lerinde `sprint-spawner.ts` **zaten var**) | `directories ≠ implicit write grant` **üç dokümanın açık invariant'ı** (A5 D6, A6 D5, A8 §7). Docker yolu sağlıyor, non-Docker spawn yolu sağlamıyor. Tüketiciler: `sprint-spawner.ts:1132, :1185, :1226, :1249` |
| **Bulgu 12** — unsigned event → scope auto-expansion · **İKİYE BÖLÜNÜR** | | | | |
| ↳ **12-a** event integrity yarısı (`event-stream.ts:326-372` imzasız yazım · `:389-428` schema/sender doğrulaması olmadan cast) | **A9** content-provenance | §15 `AgentMessageEnvelope` | **A9 W8** (inter-agent communication authority) | A9 §15 envelope'u SharedMemory/handoff için tasarlıyor; **event-stream kanalını kapsamı içine almalı**. A3'ün "Bulgu 12 ayrı kapsamdadır" beyanı doğruydu — A9 boşluğu genel tasarımla kapatmadı |
| ↳ **12-b** scope-widening yarısı (`sprint-phases.ts:1881-1917`: yalnız channel+taskId kontrol edip `attemptedPath`'i `filesWrite` scope'una ekliyor; `scope_auto_expand_enabled === true`, consumer default `false`, canonical config authoring yolu **`UNVERIFIED`**) | **A8** project-inventory/scope | §9 Scope Admission Authority + §11.3 spawn-time revalidation | **A8 W5** (scope admission) + **A8 W7** (execution admission/drift) | A8'in invariant'ı: "Override narrows; never blankets" ve "No second policy engine". **İmzasız event'in scope genişletmesi** tam bu invariant'ın ihlali. Codex'in `UNVERIFIED` işareti **korunmalı** — dışarıdan etkinleştirilebilirlik kanıtlanmadı |

**Kapanış kanıtı (T5 için):** 6 yeni bulgunun tamamı artık tiplenmiş —
`11`→K2-c/T2 · `12-a`→A9 W8 · `12-b`→A8 W5+W7 · `13`→A5 W6 · `14`→A5 §2.1+D7 (zaten kapsanmış) ·
`15`→A4 W6 · **+ O8**→A4 W6. Sahipsiz kalem **yok**.

### 20.2 ASI08 disposition `KAPANDI`

**Karar: mevcut ledger satırı yeterli; ince tasarım gerekmez.**

- Codex sınıfı: **`ENFORCED`** / not **Orta** — 10 ASI içinde en iyi iki nottan biri (dependency
  cascade containment production'da bağlı: `sprint-phases.ts:2599-2643`, `dependency-scheduler.ts:307-346`,
  `result-collector.ts:1954-2054`).
- Kritik gap: *"başlatılmış redundant descendants ve external side effects tam olarak iptal/contain
  edilmiyor"* → exact ledger sahibi **`RECOVERY-BORN-490-DESCENDANT-CANCELLATION-001`**
  (`docs/MASTER-PLAN.md:802`) **mevcut**.
- **Hüküm:** ASI08 bu 9-doküman setinin **bilinçli kapsam dışıdır**; sahibi ledger'da var, tasarım
  dokümanı gerekmiyor. `SEC-OWASP-ASI-001` (4190) assurance eşlemesinde bu satır ASI08'in kanıt
  taşıyıcısıdır.
- **Yan not (kozmetik, kayıt için):** A4 hiç ASI kodu taşımıyor (§1) hâlbuki Codex'in **#1 sıralı
  riskinin** (ASI02/ASI05) sahibi. 4190 eşlemesi için A4'e ASI atfı eklenmesi E-listesinde
  (katmanda) kalır.

### 20.3 Düzeltme uygulama politikası — **katman kuralı** `KAPANDI`

**Karar: 9 tasarım dokümanına in-place düzeltme YOK.**

**Gerekçe:** 9 doküman Codex çıktısıdır ve **KABUL EDİLDİ**. In-place edit iki şeyi bozar:
(a) onaylanmış artifact'ın **byte-identity**'si, (b) **XVERIFY-PROVIDER-SEPARATION** — hangi provider
ne dedi ayrımı. Düzeltilmiş hâl teknik olarak **yeni onay** isterdi.

**Uygulanan kural:**

| Katman | Durum | İçerik |
|---|---|---|
| `docs/audits/*-design-*.md` (9 dosya) | 🔒 **byte-sabit** | Codex'in kabul edilmiş tasarımı. Bu oturum **dokunmadı** |
| `docs/audits/owasp-agentic-top-10-codex-only-transcript-*.md` | 🔒 **byte-sabit** | Kaynak Codex analizi (SHA-256 `b0d37ea2…`) |
| `docs/audits/CROSS-VERIFICATION-2026-08-06.md` (bu dosya) | ✍️ **düzeltme katmanı** | Tüm doğrulama, drift/loss kaydı, atamalar, kararlar, iş planı |

**Sonuç:** `E15`–`E21` (§19.10) ve `E1a`–`E14` (§10) **hepsi bu katmanda kayıtlı, hiçbiri
uygulanmadı.** Her biri exact hedef bölümüyle birlikte duruyor. Ana session **üç katmanı birlikte
okur**; tasarım dokümanı ile düzeltmesi arasındaki fark her zaman izlenebilir kalır.

**Byte-sabitlik kanıtı (2026-08-06T18:56Z ölçümü):**

```text
docs/audits/plugin-admission-authority-design-2026-08-05.md                      Aug  5 17:01  🔒
docs/audits/rolling-spend-budget-authority-design-2026-08-05.md                  Aug  5 19:33  🔒
docs/audits/audit-authority-integrity-design-2026-08-06.md                       Aug  6 00:27  🔒
docs/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md     Aug  6 01:21  🔒
docs/audits/attempt-effect-attribution-authority-design-2026-08-06.md            Aug  6 01:46  🔒
docs/audits/enforcement-module-disposition-authority-design-2026-08-06.md        Aug  6 07:43  🔒
docs/audits/terminal-session-execution-authority-design-2026-08-06.md            Aug  6 08:31  🔒
docs/audits/project-inventory-scope-admission-authority-design-2026-08-06.md     Aug  6 08:58  🔒
docs/audits/content-provenance-context-integrity-authority-design-2026-08-06.md  Aug  6 09:57  🔒
docs/audits/owasp-agentic-top-10-codex-only-transcript-2026-08-05--2026-08-06.md Aug  6 16:55  🔒
docs/audits/CROSS-VERIFICATION-2026-08-06.md                                     Aug  6 18:56  ✍️
git status --porcelain docs/audits/  →  ?? docs/audits/     (K9: untracked, commit yok)
```

Dokuz tasarım dokümanının ve transkriptin mtime'ları özgün üretim anlarında; bu oturum **yalnız
düzeltme katmanına** yazdı. Ana session bu satırı **yeniden ölçerek** katman bütünlüğünü doğrulayabilir.

### 20.4 Devir paketi — **tek dosya + prompt** `KAPANDI`

**Karar: ayrı devir dokümanı yazılmaz.** Bu dosya tek SSOT; ana session'a aşağıdaki prompt verilir.

```text
deckent'te OWASP Agentic Top 10 güvenlik seti implementation'a hazırlanıyor. İşi devralıyorsun.

OKU (sırayla):
  1. docs/audits/CROSS-VERIFICATION-2026-08-06.md
       §13 owner kararları (BAĞLAYICI) · §17 iş planı (T1–T7) ·
       §19 transkript çapraz doğrulama sonucu · §20 devir kapanışı
  2. docs/audits/owasp-agentic-top-10-codex-only-transcript-2026-08-05--2026-08-06.md
       kaynak Codex analizi — 16 bulgu (10 önceki + 6 yeni), ASI01–ASI10, sıralı risk listesi
  3. docs/audits/*-design-*.md — 9 authority tasarımı (KABUL EDİLDİ · byte-sabit · DÜZENLEME YOK)

BAĞLAM:
- 9 doküman 2026-08-05/06 OWASP oturumlarında KABUL EDİLDİ. Bir Claude oturumu bunları çapraz
  doğruladı: 22/22 code-truth iddiası HEAD 77bc721ae'de geçerli · 0 HARDENED · 1 beyan edilmemiş
  drift (A4/Bulgu 4) · 3 ayrıntı kaybı · 4 sahipsiz bulgu + 1 yeni kod bulgusu tespit edilip
  doğal sahiplerine atandı (§20.1).
- docs/audits/ UNTRACKED ve öyle kalacak (K9 kararı). Commit yok.
- 9 dokümana in-place düzeltme YOK — düzeltmeler cross-verification katmanında (§19.10, §10).

İLK ÜÇ İŞİN:
  A. §17.0 durum çıpasını doğrula. Branch/HEAD kaymışsa §3'ün 22 doğrulamasını yeniden koş;
     kaymamışsa iddiaları sıfırdan keşfetme.
  B. T3'ü koş — ADR crosswalk + 4 doğrudan-alan reconciliation:
       A7/ADR-G-029 (Immutable, successor kararlı) · A6/ADR-G-021 (Immutable) ·
       A2/ADR-G-037 (hard) · A3/ADR-G-039 (hard).
     T3 KARAR VERMEZ — kanıtlı hüküm önerisi üretir ve Alperen'e sunar (§16.4).
     T3, A2/A3'ün mimari kapsamını daraltabilir; ilk tren onları içeriyorsa T3 ÖNCE koşar.
  C. T2'yi koş — approval baseline. §15.2 matrisi + §19.1 düzeltmesi: G11a (authorization
     envelope ZORUNLU) ve G24 (decision store worker write scope dışı) birinci hedef.
     Çıpa: ADR-G-039'un işaret ettiği onaylı approval-ingress contract'ı.

SINIRLAR (ihlal etme):
- Commit/push yok. MASTER-PLAN mutation yok — T4 yalnız G1 FILE öneri paketi üretir.
- Immutable: yes ADR'ye (G-021, G-029) in-place dokunma → amendment/successor, ADR-G-019 prosedürü.
- MCP'ye dokunma — Bulgu 8 owner kararıyla DEFERRED (MCPV2 cutover sonrası fresh değerlendirme).
- K8 contract harmonization PROVISIONAL — owner teyidi olmadan E2/E3/E6/E8/E9/E12/E14 uygulanmaz.
- Satır numaralarını kör kullanma: §3'te 22'si doğrulandı, kalanı doğrulanmadı.
- Sahipsiz bulgu bırakma — §20.1 atamaları bağlayıcı; yeni bulgu çıkarsa aynı biçimde tiple.

AÇIK MADDELER: §17.4 — O1 (T3'e devredildi) · O3 (evidence paradoksu) · O5 (K8 teyidi) ·
O6 (CAPABILITY-001 kapsamı). O2, O4, O7, O8 KAPANDI.
```

### 20.5 Oturum kapanış durumu

| Alan | Değer |
|---|---|
| Okunan | 9 tasarım dokümanı (11.001 satır) + Codex transkripti (3.625 satır) + 51 ADR envanteri + 4 komşu korpus |
| Doğrulanan | **22/22** code-truth iddiası · **43** ledger ID (42 resolve + 1 önerilen) · **X1–X8** transkript çapraz doğrulaması |
| Üretilen | `docs/audits/CROSS-VERIFICATION-2026-08-06.md` — 22 bölüm |
| Owner kararı | **15 madde:** K1–K10 (K5a/K5b ayrı) + O7 + O8 + düzeltme politikası + devir biçimi |
| Kapanan açık madde | O2 (transkript) · O4 (Bulgu 13/14/15) · O7 (sahipsiz atama) · O8 (allowlist sapması) |
| Devreden açık madde | O1 (→T3) · O3 (evidence paradoksu) · O5 (K8 teyidi) · O6 (`CAPABILITY-001`) |
| Kod / ADR / MASTER-PLAN / git mutation | **YOK** |
| Git durumu | `docs/audits/` **untracked** (K9) — kabul edilmiş durabilite riski (§17.0) |
| Devir | §20.4 prompt'u ile akıştaki session'a |

**Bu oturumun hükmü:** doküman seti implementation'a devredilmeye hazır. Kaynak transkripte karşı
doğrulandı, sahipsiz kalem bırakılmadı, ADR borcu tiplendi ve T3'e bağlandı, düzeltmeler
provenance-koruyan katmanda kayıtlı. Kalan üç açık madde (O3, O5, O6) implementation'ı bloklamıyor;
O1 T3'ün çıktısıyla kapanacak.
