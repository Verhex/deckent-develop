# DIRECTIVES — Sprint 264: Feature-Doc Reality Sync + Init-Test Hygiene (12 tasks, all fable)

## Goal: 2026-06-10 gecesi CANLIYA alınan beş otonom/enterprise wiring'in (recurring re-enqueue, work-generator, kind=capability broker dispatch, rbac_policy enforcement, audit compliance/forward read-side) kullanıcı-yüzü dokümantasyonunu KOD GERÇEĞİNDEN türeterek doc ağacına işlemek + api-surface sözleşmesini backlog formatıyla güncellemek + kronik kırmızı init-test kümesini (22 test, readline-mock 10s timeout) GERÇEK fix'le yeşertmek. Sprint DOC+TEST-only — `src/` DEĞİŞMEZ (tek istisna yok; test task'ı yalnız `tests/cli/` yazar).

## Ortak kurallar
- **Kod gerçeğinden türet:** Her doc task'ı, Description'da işaret edilen kaynak dosyaları OKUYARAK yazar — tahmin/eski doc kopyası YASAK. Bayrak adları, default değerler, CLI flag'leri birebir kaynaktan.
- Mevcut doc'un yapısını/dilini koru (surgical ekleme; EN doc'lar EN, deckent-nedir TR). Mevcut bölümleri yeniden yazma — yeni özellik bölümü/satırı EKLE, bariz bayat satırı düzelt.
- Bu sprint'te eklenen davranışların hepsi DEFAULT-OFF — doc'larda bunu açıkça belirt (autonomous.enabled, work_generator.enabled, rbac_policy.enabled).
- `src/` dokunmak YASAK. Tek yazar / tek dosya. **`.tasks/task-XXX.result` YAZ** (yoksa NO_GO).
- Doc task'ları için tsc/test koşma (doc-only). Task 11 yalnız kendi Kanıt komutunu koşar.

---

## Task 1: Autonomous engine internals doc — yeni dispatch yolları
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/autonomous-engine.md
- Scope: docs/guide/

### Description
`docs/guide/autonomous-engine.md`'e 2026-06-10 wiring'lerini ekle (kaynak: `src/orchestra/autonomous/runtime-loop.ts`, `backlog.ts`, `execute-dispatcher.ts`, `policy-gate.ts`, `work-generator-source.ts`):
1. **Recurring cadence**: `applyRecurringReenqueue` her tick'te due olan `done` recurring entry'leri `pending`'e çevirir (yalnız-değişince-persist); `queryDue` artık pending recurring'i surface eder ("pending recurring = şimdi due"; kadans flip-anında gate'lenir).
2. **Trigger source önceliği**: backlog → scheduled-flow → reactive → work-generator (en düşük).
3. **kind=capability dispatch**: entry `spec.capabilityTarget` → `CapabilityRegistry.invoke` (never-throw `CapabilityResult`); composition `createAuditedCapabilityRegistry` (handler seti + audit-bridge → ENT-3 hash-chain).
4. **3-gate güncellemesi**: policyGate artık `deny` döndürebilir (rbac_policy enabled iken) → cycle `denied`, approval'a düşmez.
5. **EffectClass capability kuralı**: read-only verb seti → pure; diğerleri → critical-irreversible (risk-tagged park).

**Kanıt:** `grep -ciE "applyRecurringReenqueue|capabilityTarget|work-generator|rbac_policy|deny" docs/guide/autonomous-engine.md` ≥ 8. **Test:** yok (doc-only) — .result YAZ.

---

## Task 2: Autonomous user guide — backlog add yeni yüzeyleri
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/autonomous.md
- Scope: docs/guide/

### Description
`docs/guide/autonomous.md`'e kullanıcı örnekleri ekle (kaynak: `src/cli/commands/autonomous.ts` registerAutonomous — flag adlarını birebir koddan doğrula):
1. Recurring entry: `deckent autonomous backlog add --id nightly --title "..." --cron "0 3 * * *"` (5-alan cron; bozuk cron intake'te reddedilir, i18n).
2. Capability entry: `... --kind capability --capability fs.read --args '{"path":"package.json"}' [--connector odoo]` (eksik verb / bozuk JSON hataları).
3. Work-generator: `.deckent/config.json` → `autonomous.work_generator { enabled, interval_ms }` — aktif debt kayıtları otomatik backlog candidate olur (HIGH/CRITICAL → risk-tagged park).
4. MCP parity: `deckent_autonomous` backlog_add aynı paramları destekler (cron/capability/capabilityArgs/connector).

**Kanıt:** `grep -ciE "cron|--kind capability|work_generator|connector" docs/guide/autonomous.md` ≥ 6. **Test:** yok — .result YAZ.

---

## Task 3: Autonomous operations guide — governance + audit ops
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/autonomous-operations.md
- Scope: docs/guide/

### Description
`docs/guide/autonomous-operations.md`'e operasyon bölümleri ekle (kaynak: `src/cli/commands/audit.ts`, `src/orchestra/autonomous/runtime-loop.ts`):
1. **RBAC enforcement ops**: `autonomous.rbac_policy { enabled, role }` — viewer rolü `execute` iznine sahip DEĞİL → flag açık + role yükseltilmemişse makine-başlatmalı iş hard-deny (cycle `denied`, audit'e düşer). Operator/admin → izinli.
2. **Audit read-side**: `deckent audit compliance --sprint <id> [--json]` (chain-integrity + rbac/tenant kontrol bayrakları; kırık zincirde exit 1) ve `deckent audit forward --sprint <id> --out <path>` (SIEM NDJSON export; gerçek network transport henüz YOK — dürüstçe belirt).
3. Parked entry akışı (mevcut approve/reject bölümü varsa ona bağla; yoksa kısa akış).

**Kanıt:** `grep -ciE "rbac_policy|compliance|forward|denied" docs/guide/autonomous-operations.md` ≥ 6. **Test:** yok — .result YAZ.

---

## Task 4: Enterprise depth reference — read-side + enforcement
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-depth.md
- Scope: docs/reference/

### Description
`docs/reference/enterprise-depth.md`'e ekle (kaynak: `src/core/audit-query.ts` readAuditEvents, `src/core/compliance-report.ts`, `src/core/siem-forwarder.ts`, `src/core/capability-runtime.ts`, `src/cli/commands/audit.ts`):
1. **Audit read-side**: `readAuditEvents` (kanal-filtreli ham AuditEventPayload, prevHmac/hmac intact) + `deckent audit compliance` (controls: rbacEnforcement / tenantIsolation / auditChainIntact — config kaynakları: `autonomous.rbac_policy.enabled`, `strict_tenant_isolation`) + `deckent audit forward` (NDJSON file transport; HTTP/syslog transport = roadmap).
2. **Capability audit**: her capability invocation `capability.success|error` action'ıyla ENT-3 hash-chain'e yazılır (`createAuditedCapabilityRegistry` emit → `writeAuditEvent`).
3. **RBAC enforcement dilimi**: ADR-037 advisory→enforced ilk dilim = autonomous dispatch (`rbac_policy`), sprint worker-spawn hâlâ advisory (Task.requirements yok) — dürüst sınırı yaz.

**Kanıt:** `grep -ciE "readAuditEvents|compliance|siem|capability\.(success|error)|rbac_policy" docs/reference/enterprise-depth.md` ≥ 8. **Test:** yok — .result YAZ.

---

## Task 5: Config reference — yeni anahtarlar
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/config-reference.md
- Scope: docs/reference/

### Description
`docs/reference/config-reference.md`'e `autonomous` bloğunun yeni alt-anahtarlarını ekle (kaynak: `src/core/config-types.ts` autonomous bloğu + `src/core/config.ts` default/validation — default değerleri birebir koddan al):
- `autonomous.work_generator { enabled: false, interval_ms: 600000 }` — debt→backlog candidate üretimi; throttle semantiği.
- `autonomous.rbac_policy { enabled: false, role: 'viewer' }` — makine-başlatmalı dispatch RBAC gate'i; geçerli roller admin|operator|viewer; validation hataları.
Mevcut `autonomous.reactive` satırı formatına uy.

**Kanıt:** `grep -ciE "work_generator|rbac_policy|interval_ms" docs/reference/config-reference.md` ≥ 5. **Test:** yok — .result YAZ.

---

## Task 6: CLI commands reference — audit + backlog yeni flag'ler
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/cli-commands.md
- Scope: docs/reference/

### Description
`docs/reference/cli-commands.md`'de (kaynak: `src/cli/commands/audit.ts`, `src/cli/commands/autonomous.ts` — flag listelerini koddan doğrula):
1. `deckent audit` bölümüne `compliance` ve `forward` alt-komutlarını ekle (`--sprint`, `--json`, `--out`, `--lang`; exit code'lar: compliance kırık zincirde 1).
2. `deckent autonomous backlog add` bölümüne `--cron`, `--kind capability`, `--capability`, `--args`, `--connector` flag'lerini ekle.

**Kanıt:** `grep -ciE "audit (compliance|forward)|--cron|--capability|--connector" docs/reference/cli-commands.md` ≥ 5. **Test:** yok — .result YAZ.

---

## Task 7: Features reference — yeni yetenek satırları
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md
- Scope: docs/reference/

### Description
`docs/reference/features.md`'e (mevcut format neyse ona uyarak) şu yetenekleri ekle/güncelle: recurring backlog (cron cadence canlı), self-generated work (debt→backlog, flag-gated), capability dispatch (F8 broker, kind=capability), autonomous RBAC enforcement (rbac_policy), audit compliance/SIEM export. Her satıra default-off bayrağını işle. Kaynak doğrulama: `src/orchestra/autonomous/runtime-loop.ts`, `src/cli/commands/audit.ts`.

**Kanıt:** `grep -ciE "recurring|work.generator|capability|rbac_policy|compliance" docs/reference/features.md` ≥ 6. **Test:** yok — .result YAZ.

---

## Task 8: Feature matrix guide — satır güncellemeleri
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/feature-matrix.md
- Scope: docs/guide/

### Description
`docs/guide/feature-matrix.md`'deki ilgili satırları güncelle: F8 Capability Broker artık canlı-dispatch'li (built+wired), F10 policy-engine autonomous yolu enforced, ENT-5 SIEM/compliance read-side tüketicili, AUT recurring+work-gen canlı. Matrisin mevcut durum-notasyonunu koru (✅/🔄/⬜ neyse o). Yalnız bu satırları değiştir — başka satıra dokunma.

**Kanıt:** `grep -ciE "capability|policy|siem|recurring" docs/guide/feature-matrix.md` ≥ 4. **Test:** yok — .result YAZ.

---

## Task 9: Event channels reference — capability audit aksiyonları
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/event-channels.md
- Scope: docs/reference/

### Description
`docs/reference/event-channels.md`'de `DECKENT→AUDIT:EVENT_WRITTEN` kanalının payload-action sözlüğüne `capability.success` / `capability.error` aksiyonlarını ekle (kaynak: `src/orchestra/autonomous/runtime-loop.ts` writeAuditEvent çağrısı — tenantId/actor/target/metadata alanlarını birebir yaz). Kanal bölümü yoksa AUDIT kanalı altına kısa alt-bölüm aç.

**Kanıt:** `grep -ciE "capability\.(success|error)" docs/reference/event-channels.md` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 10: API surface contract — autonomous backlog formatı
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/api-surface.md
- Scope: docs/reference/

### Description
`docs/reference/api-surface.md`'e (inter-agent contract dosyası — CLAUDE.md'den @-ref'li) yeni bölüm ekle: **".deckent/autonomous/backlog.json File Format"** — kaynak `src/orchestra/autonomous/backlog-types.ts` + `backlog.ts` validateBacklogEntry'den birebir: BacklogEntry alanları (id/title/kind task|sprint|capability /spec{description,directivesRef,scopeDir,capabilityTarget{capability,args,connector}}/policy/provider/model/trigger recurring{cron}|one-off|reactive{detector}/status/tenant/lastRun/lastResult), validation kuralları (capability→capabilityTarget zorunlu; recurring→cron zorunlu), status yaşam döngüsü (pending→running→done|failed; recurring done→pending re-enqueue). Mevcut bölümlerin formatını (JSON şema bloğu) izle. Mevcut içeriğe dokunma — yalnız yeni bölüm ekle.

**Kanıt:** `grep -ciE "backlog|capabilityTarget|recurring" docs/reference/api-surface.md` ≥ 6. **Test:** yok — .result YAZ.

---

## Task 11: Init-test kümesi gerçek fix — readline-mock timeout
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: ci-guardian
- Skills: ci-testing, testing-expert
- Files: tests/cli/commands.test.ts
- Scope: tests/cli/

### Description
`tests/cli/commands.test.ts`'teki kronik kırmızı `init command` kümesini (22 test, her biri 10000ms timeout'ta düşüyor) GERÇEK kök-neden fix'iyle yeşert. Bilinen profil: readline/promises mock'u init'in beklediği soruyu cevaplamıyor → init promise'i asılı kalıyor → testler timeout. KURALLAR: (1) `src/` DOKUNMA — yalnız test dosyası; (2) testleri skip/todo/delete ETME, assert'leri zayıflatma; (3) mock'u init'in gerçek readline kullanımıyla (kaynağı oku: `src/cli/commands/init.ts` + kullandığı prompt helper'ı) eşleştir; (4) hermetik kalsın (tmpdir, no spawnSync). Fix sonrası küme deterministik geçmeli.

**Kanıt:** `npx vitest run tests/cli/commands.test.ts` → **0 failed** (çıktıyı .result notes'a yapıştır). **Test:** mevcut 105 descriptor'ın tamamı geçer; yeni test gerekmez.

---

## Task 12: deckent-nedir (TR) — otonom yetenek özeti
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/deckent-nedir.md
- Scope: docs/guide/

### Description
`docs/guide/deckent-nedir.md` (Türkçe tanıtım) içindeki otonom-mod anlatımını güncelle: deckent artık (hepsi opt-in) tekrarlayan işleri cron kadansıyla yeniden kuyruklar, aktif teknik borçtan kendine iş üretir, kod-dışı işleri (dosya-okuma/HTTP/DB/mail) capability broker'la güvenli yürütür, makine-başlatmalı işleri RBAC ile sınırlar ve denetim zincirini uyumluluk raporu/SIEM export'uyla dışa verir. Mevcut dokümanın tonunu ve TR dilini koru; 1-2 paragraf + gerekiyorsa kısa madde listesi. Abartı YOK — default-off gerçeğini belirt.

**Kanıt:** `grep -ciE "cron|capability|RBAC|SIEM|uyumluluk" docs/guide/deckent-nedir.md` ≥ 4. **Test:** yok — .result YAZ.

---

**Beklenen:** 12 task, hepsi claude-fable-5/docker. 11 DOC + 1 TEST-infra. `src/` değişimi SIFIR (CC verify'da `git diff --stat src/` boş olmalı). CC sprint sonu: doc'ların kod-gerçeği doğrulaması (flag adları/default'lar koda karşı), Task 11 için gerçek `vitest run` tekrarı, `.result` denetimi.
