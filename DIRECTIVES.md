# DIRECTIVES — Sprint 266: ERP Odoo Driver + Audit CLI Tamamlama + Sprint-265 Doc Follow-up

## Goal: Sprint-265'in açtığı enterprise read-side yüzeyini tamamla: (1) İLK SOMUT ERP driver'ı — Odoo JSON-RPC read-only `ErpDriver` (injectable fetch, hermetik), (2) `deckent audit` CLI'ını bitir: syslog forward wire + retention (dry-run/apply) subcommand, (3) sprint-265 çıktılarının (JWKS, OidcAuthProvider, SIEM transports, erp.read) kod-türevli dokümantasyonu. Tümü test-first, ADR-010 (yeni dep YOK), default-off/opt-in.

## Ortak kurallar
- **TDD + hermetik:** önce RED test; tmpdir + injectable fetch/socket; gerçek ağ YASAK; spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başka task'ın yarım dosyasından gelen tsc hatası NO_GO sebebi DEĞİL (notes'a yaz).
- **SSOT:** ErpConnector'ın compile/validation mantığını YENİDEN YAZMA — driver yalnız `CompiledQuery`'yi Odoo çağrısına çevirir. Retention'da `planRetention` (audit-retention.ts) TÜKETİLİR, yeniden-implementasyon YOK.
- **i18n:** user-facing string yalnız Task 2'de → `getMessage` en/tr.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş.

---

## Task 1: Odoo read-only ErpDriver (JSON-RPC search_read)
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/erp-driver-odoo.ts, tests/core/erp-driver-odoo.test.ts
- Scope: src/core/, tests/core/

### Description
İlk somut ERP connector driver'ı (kaynaklar: `src/core/erp-connector.ts` — `ErpDriver = (compiled: CompiledQuery) => Promise<readonly ErpRow[]>`, `CompiledQuery` { entity, fields, predicates(field/op/placeholders 1-based), params, limit, operation:'read', readOnly:true }; Odoo External API: JSON-RPC 2.0 `/jsonrpc`, service `object`, method `execute_kw`, model method `search_read`).
**YENİ `src/core/erp-driver-odoo.ts`:** `createOdooErpDriver(opts: { url: string; db: string; uid: number; apiKey: string; fetchImpl?: ...; entityModelMap?: Record<string,string> })` → `ErpDriver`:
1. `CompiledQuery` → Odoo `search_read` çağrısı: entity → model adı (`entityModelMap[entity] ?? entity`); predicates+params → Odoo domain listesi (`eq→'='`, `ne→'!='`, `gt/gte/lt/lte→'>','>=','<','<='`, `in→'in'`, `like→'ilike'` — placeholder indeksleri 1-based, `params`'tan çöz); fields → `fields` kwarg; limit → `limit` kwarg.
2. JSON-RPC zarfı: `{ jsonrpc:'2.0', method:'call', params:{ service:'object', method:'execute_kw', args:[db, uid, apiKey, model, 'search_read', [domain], { fields, limit }] }, id }`. POST `opts.url` (http/https doğrula). Response: `result` array → `ErpRow[]`; `error` alanı varsa açıklayıcı throw (Odoo error.data.message'ı dahil et); non-2xx → throw.
3. Güvenlik: `compiled.readOnly !== true` veya `operation !== 'read'` → throw (savunma katmanı; connector zaten garanti eder). apiKey hata mesajlarına ASLA yazılmaz.
4. `fetchImpl` injectable; default `globalThis.fetch` (yoksa açıklayıcı throw).
5. Testler (mock fetch): domain çevirimi tüm op'lar için; entityModelMap; limit/fields geçişi; Odoo error → throw (mesaj apiKey İÇERMEZ); non-2xx → throw; uçtan uca: `createErpConnector({ driver })` + registerEntity ile gerçek connector üstünden round-trip.

**Kanıt:** `npx vitest run tests/core/erp-driver-odoo.test.ts` yeşil; `grep -n "search_read" src/core/erp-driver-odoo.ts`. **Test:** 10+.

---

## Task 2: audit CLI tamamlama — syslog forward wire + retention subcommand
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/audit.ts, src/cli/helpers/messages.ts, tests/cli/audit-readside.test.ts
- Scope: src/cli/, tests/cli/

### Description
Kaynaklar: `src/cli/commands/audit.ts` (forward subcommand + runSiem* helper pattern'i), `src/core/siem-transport-syslog.ts` (`createSyslogSiemTransport`, `sendImpl` injectable), `src/core/audit-retention.ts` (`planRetention(entries, policy)` → `RetentionPlan`; policy şeklini dosyadan oku).
1. **Syslog wire:** `forward` subcommand'a `--syslog <host[:port]>` + `--syslog-protocol <udp|tcp>` (default udp) opsiyonları; öncelik: `--url` > `--syslog` > `--out`. Yeni helper `runSiemSyslogForward(root, sprintId, host, port, protocol, sendImpl?)` (injectable sendImpl — hermetik test); başarı çıktısı yeni i18n anahtarı (en/tr).
2. **Retention subcommand:** `deckent audit retention --sprint <id> [--keep-days N] [--keep-count N] [--apply] [--json]`: `readAuditEvents` → `planRetention` → dry-run'da plan özetini yaz (keep/drop sayıları, i18n); `--apply` verilirse: kalan event'leri sprint stream dosyasına GERİ YAZMAK yerine ayrı arşiv dosyasına mı, in-place mi — `audit-retention.ts`'in plan sözleşmesine ve dosyadaki yoruma uy (in-place yeniden yazım gerekiyorsa atomic yaz + hash-chain bütünlüğünü BOZMA: plan chain-contiguous partition veriyor — dosyaya yalnız `keep` kısmını yaz). Apply olmadan HİÇBİR yazma yapma. Exit: dry-run 0; apply başarı 0; hata 2.
3. i18n anahtarları en/tr; testler: syslog yolu (sendImpl mock → RFC5424 mesaj sayısı), retention dry-run (yazmaz) + apply (atomic yeniden yazım + sonradan `readAuditEvents` keep-set'i döner + `verifyAuditChain` intact kalır) + boş stream.

**Kanıt:** `grep -n "createSyslogSiemTransport\|planRetention" src/cli/commands/audit.ts` (tüketim) && `npx vitest run tests/cli/audit-readside.test.ts` yeşil. **Test:** 8+.

---

## Task 3: Enterprise integrations reference — sprint-265 çıktıları
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-integrations.md
- Scope: docs/reference/

### Description
`docs/reference/enterprise-integrations.md`'e kod-türevli bölümler ekle (kaynaklar: `src/core/auth-jwks.ts`, `src/api/terminal/auth-provider.ts` OidcAuthProvider, `src/core/siem-transport-http.ts`, `src/core/siem-transport-syslog.ts`, `src/core/capability-handlers-erp.ts`): JWKS akışı (HTTPS-only, TTL cache, kid-rotation, RS256-pin, fail-closed reason kodları), OidcAuthProvider (sync-contract sınırı + statik key + AUTH_DISABLED bypass-yok invariantı), SIEM transport'lar (http: forwarder-retry sözleşmesi; syslog: RFC5424/facility-13, CLI wire durumunu Task 2 sonrası gerçeğe göre yaz — emin değilsen "CLI wire: bkz cli-commands" de), erp.read handler + in-memory driver (Odoo driver'ı Task 1 paralel yazılıyor — varsa dosyadan doğrula, yoksa "first concrete driver: Odoo (in progress)" deme, SADECE diskte ne varsa onu yaz). Mevcut bölümlere dokunma.

**Kanıt:** `grep -ciE "JWKS|OidcAuthProvider|RFC5424|erp.read" docs/reference/enterprise-integrations.md` ≥ 8. **Test:** yok — .result YAZ.

---

## Task 4: Enterprise depth — JWKS/OIDC/transport ekleri
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-depth.md
- Scope: docs/reference/

### Description
`docs/reference/enterprise-depth.md`'in mevcut SSO/OIDC ve SIEM bölümlerini sprint-265 gerçeğiyle güncelle (kaynaklar Task 3'tekiyle aynı): "JWKS fetch follow-up" ibarelerini kapanmış olarak işaretle (`auth-jwks.ts` referansıyla), SIEM "network transports roadmap" ibaresini http(CANLI --url)/syslog(modül hazır) gerçeğine çevir, OidcAuthProvider'ı terminal auth bölümüne ekle. YALNIZ bayatlamış cümleleri düzelt + kısa ekler — bölüm yeniden-yazımı YOK.

**Kanıt:** `grep -ciE "auth-jwks|OidcAuthProvider|siem-transport" docs/reference/enterprise-depth.md` ≥ 4. **Test:** yok — .result YAZ.

---

## Task 5: Autonomous operations — forward --url/--syslog ekleri
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/autonomous-operations.md
- Scope: docs/guide/

### Description
`docs/guide/autonomous-operations.md`'in audit read-side bölümünü (Sprint 264'te eklendi) güncelle: `audit forward --url <https-endpoint>` HTTP yolu (öncelik --out'un üstünde) + "network transport yok" dürüst-sınır cümlesini yeni gerçeğe çevir (http CANLI; syslog modülü hazır, CLI wire'ı Task 2'de — diskte audit.ts'te `--syslog` görürsen onu da belgele, görmezsen follow-up olarak bırak). Kaynak: `src/cli/commands/audit.ts` (diskteki GÜNCEL hali).

**Kanıt:** `grep -ciE "\-\-url|syslog" docs/guide/autonomous-operations.md` ≥ 3. **Test:** yok — .result YAZ.

---

**Beklenen:** 5 task (2 kod + 3 doc), hepsi claude-fable-5/docker, dosya-çakışması yok. Doc task'ları DİSKTEKİ güncel kodu okur (paralel kod task'larının bitmemiş çıktısını VARSAYMAZ). CC sprint sonu: tsc + yeni testler + audit/cli regresyon + retention apply'ın chain-bütünlüğü doğrulaması + gerçek-binary smoke.
