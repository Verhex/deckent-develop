# DIRECTIVES — Sprint 267: API OIDC Bearer + SAP OData Driver + 266 Doc Follow-up

## Goal: Enterprise auth'u API yüzeyine taşı ve sürüyü genişlet: (1) HTTP API bearer middleware'ine **statik-key OIDC JWT** doğrulama uzantısı (`api_oidc` config bloğu, default-off; statik token yolu AYNEN korunur), (2) ikinci somut ERP driver'ı — **SAP OData read-only** (`$filter/$select/$top`, injectable fetch), (3) sprint-266 çıktılarının (Odoo driver, retention, syslog, archive-aware compliance) referans dokümantasyonu. Test-first, ADR-010 (yeni dep YOK), hermetik.

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable fetch; gerçek ağ YASAK; spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başka task'ın yarım dosyasından gelen tsc hatası NO_GO sebebi DEĞİL (notes'a yaz).
- **SSOT:** JWT doğrulama = `verifyJwt` (auth-oidc.ts) — YENİDEN YAZMA. ErpDriver sözleşmesi `erp-connector.ts`'ten; Odoo driver'ı (`erp-driver-odoo.ts`) PATTERN referansın — kopyala-uyarla değil, aynı sözleşmeyi uygula.
- **Güvenlik:** auth değişiklikleri default-off; mevcut statik-token davranışı bit-bit korunur (regresyon testleri kanıtlar); secret/key hata mesajlarına sızmaz.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. User-facing string yok (API/core katmanı) — i18n N/A.

---

## Task 1: API bearer middleware — statik-key OIDC JWT uzantısı (api_oidc)
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert, testing-expert
- Files: src/api/auth.ts, src/api/server.ts, src/core/config-types.ts, src/core/config.ts, tests/api/auth-oidc.test.ts, tests/core/config.test.ts
- Scope: src/api/, src/core/, tests/api/, tests/core/

### Description
Kaynaklar: `src/api/auth.ts` (`AuthConfig`, `bearerAuthMiddleware`, `resolveAuthToken` — mevcut sözleşmeyi OKU), `src/api/server.ts:1000-1030` (middleware kuruluş noktası), `src/core/auth-oidc.ts` (`verifyJwt`, `VerifyOptions`, `JwtAlgorithm`), `src/api/terminal/auth-provider.ts` `OidcAuthProvider` (aynı statik-key deseni).
1. **Config:** `config-types.ts`'e top-level `api_oidc?: { enabled: boolean; issuer: string; audience?: string; algorithm: 'HS256' | 'RS256'; key: string }` (mevcut `api_auth_token`'ın yanına) + `config.ts` validation (enabled boolean; enabled iken issuer/key non-empty; algorithm enum) — default YOK (blok opsiyonel; yokken davranış bugünkünün aynısı). `$DECK:` interpolasyonu `api_auth_token` için varsa `key` için de aynı mekanizmadan geçir (deck-interpolation pattern'ini kontrol et; yoksa zorlamadan not düş).
2. **auth.ts:** `AuthConfig`'e `oidc?: { issuer; audience?; algorithm; key }`; `bearerAuthMiddleware` Bearer değeri geldiğinde ÖNCE mevcut statik-token constant-time karşılaştırmasını dene; eşleşmezse VE `oidc` config'liyse `verifyJwt` ile doğrula (sync — `valid===true` → geç). İkisi de geçemezse 403 (mevcut davranış). Statik token YOKKEN (auth disabled) mevcut "auth yok" semantiği DEĞİŞMEZ — oidc tek başına config'liyse auth AKTİF olur (token-yok + oidc-var → Bearer JWT zorunlu; bunu test et + belgele). Query-token / localhost-auto / exempt-path davranışları AYNEN korunur (regresyon).
3. **server.ts:** middleware kuruluşuna `oidc: resolvedConfig.api_oidc?.enabled ? {...}` geçişi (yalnız enabled iken). Surgical — başka hiçbir şeye dokunma.
4. **Testler:** YENİ `tests/api/auth-oidc.test.ts` — geçerli HS256 JWT → 200-yolu (middleware true); süresi geçmiş/yanlış issuer/yanlış imza → 403; statik token hâlâ çalışır (oidc'li config'de de); oidc-yok eski davranış regresyonu; token-yok+oidc-var → JWT zorunlu. `tests/core/config.test.ts`'e api_oidc validation testleri (geçerli blok; enabled+issuer-boş → hata; bilinmeyen algorithm → hata).

**Kanıt:** `grep -n "verifyJwt" src/api/auth.ts` (SSOT tüketimi) && `npx vitest run tests/api/auth-oidc.test.ts tests/core/config.test.ts` yeşil. **Test:** 10+. NOT: gerçek-binary serve smoke'u CC sprint-sonu yapar (ADR-079) — sen hermetik kanıtla yetin, notes'a yaz.

---

## Task 2: SAP OData read-only ErpDriver
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/erp-driver-sap.ts, tests/core/erp-driver-sap.test.ts
- Scope: src/core/, tests/core/

### Description
İkinci somut ERP driver'ı (kaynaklar: `src/core/erp-connector.ts` `ErpDriver`/`CompiledQuery`; pattern referansı `src/core/erp-driver-odoo.ts` — sözleşme uyumu + apiKey-redaction disiplinini aynen uygula). **YENİ `src/core/erp-driver-sap.ts`:** `createSapErpDriver(opts: { baseUrl: string; auth: { kind: 'basic'; username: string; password: string } | { kind: 'bearer'; token: string }; fetchImpl?; entityModelMap?: Record<string,string> })` → `ErpDriver`:
1. `CompiledQuery` → OData v2/v4-uyumlu GET: `<baseUrl>/<EntitySet>?$filter=...&$select=...&$top=<limit>&$format=json`. Predicate çevirimi: `eq/ne/gt/ge/lt/le` (`gte→ge`, `lte→le`), `in` → `(f eq v1 or f eq v2 ...)`, `like` → `substringof('v', f)` (v2) — hangisini seçtiğini belgele; string param'ları tek-tırnakla + içteki tek-tırnağı `''` ile kaçır (OData injection koruması); sayı/bool ham.
2. Auth header: basic → `Authorization: Basic base64(user:pass)`; bearer → `Bearer <token>`. Secret'lar (password/token) hata mesajlarından REDAKTE (Odoo pattern'i).
3. Response: v2 (`d.results`) ve v4 (`value`) zarflarının İKİSİNİ de destekle → `ErpRow[]`; hata gövdesi/non-2xx → açıklayıcı throw (redakteli). `readOnly !== true` → throw (savunma).
4. Testler (mock fetch): tüm op çevirimleri + in/like; tek-tırnak kaçışı; v2 ve v4 zarfları; basic+bearer header'ları; secret-redaction; connector üstünden uçtan uca round-trip.

**Kanıt:** `npx vitest run tests/core/erp-driver-sap.test.ts` yeşil; `grep -n "\\$filter" src/core/erp-driver-sap.ts`. **Test:** 10+.

---

## Task 3: CLI commands reference — retention + syslog + forward önceliği
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/cli-commands.md
- Scope: docs/reference/

### Description
`docs/reference/cli-commands.md`'deki `deckent audit` bölümünü diskteki GÜNCEL `src/cli/commands/audit.ts`'ten güncelle: `retention` subcommand (`--keep-days/--keep-count/--apply/--json`; dry-run sıfır-yazma; apply önce arşivler sonra atomic yeniden yazar; exit 0/2), `forward` önceliği `--url > --syslog > --out` + `--syslog <host[:port]>`/`--syslog-protocol`, compliance'ın arşiv-farkındalıklı doğrulaması (retention-apply sonrası zincir arşiv+canlı üzerinden doğrulanır; prune edilen hmac'li kayıtlar kalıcı silme → zincir kırığı BİLEREK görünür — dürüst sınır).

**Kanıt:** `grep -ciE "retention|--syslog|archive" docs/reference/cli-commands.md` ≥ 6. **Test:** yok — .result YAZ.

---

## Task 4: Config reference — api_oidc bloğu
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/config-reference.md
- Scope: docs/reference/

### Description
`docs/reference/config-reference.md`'e `api_oidc` bloğunu ekle — kaynak DİSKTEKİ `src/core/config-types.ts` + `config.ts` (Task 1 paralel yazıyor; dosyada henüz YOKSA bunu .result'a yaz ve dokümana "pending Task 1" satırı KOYMADAN sadece mevcut olanı belgele — uydurma YOK). Varsa: alanlar/default'lar/validation hataları birebir koddan; statik `api_auth_token` ile birlikte-davranış (token eşleşmezse JWT denenir; yalnız-oidc → JWT zorunlu) Task 1'in auth.ts yorumlarından.

**Kanıt:** `grep -ciE "api_oidc|issuer|algorithm" docs/reference/config-reference.md` ≥ 3 (dosyada api_oidc gerçekten varsa) — yoksa .result'ta dürüst raporla. **Test:** yok — .result YAZ.

---

## Task 5: Enterprise integrations — Odoo/retention/archive-aware ekleri
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-integrations.md
- Scope: docs/reference/

### Description
`docs/reference/enterprise-integrations.md`'e kod-türevli ekler (kaynaklar: `src/core/erp-driver-odoo.ts`, `src/cli/commands/audit.ts` runAuditRetention/runComplianceReport, `src/core/audit-query.ts` readArchivedAuditEvents): Odoo driver bölümü (JSON-RPC execute_kw/search_read, domain çevirimi, entityModelMap, apiKey-redaction, injectable fetch), audit retention yaşam döngüsü (plan/apply, arşiv-önce sıralaması, atomic rewrite, non-audit korunumu), archive-aware compliance (arşiv+canlı zincir doğrulaması + prune'un GDPR-tarzı kalıcı-silme/tamper-evidence ödünleşimi). SAP driver'ı diskte varsa onu da ekle; yoksa yazma.

**Kanıt:** `grep -ciE "Odoo|search_read|retention|archive" docs/reference/enterprise-integrations.md` ≥ 8. **Test:** yok — .result YAZ.

---

## Task 6: Features reference — 266/267 satırları
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md
- Scope: docs/reference/

### Description
`docs/reference/features.md`'in Lightly Used bölümüne (mevcut tablo formatında) diskte VAR olan yenileri ekle: erp-driver-odoo (somut Odoo connector), audit-retention CLI (plan/apply), siem syslog transport + --syslog wire, archive-aware compliance, scheduled-flow→backlog köprüsü (`makeFlowBacklogBridge`, AUT-3 — flow'lar artık gerçekten koşar, guard'la park). Her satır default-off/opt-in bayrağını veya tetikleyen komutu belirtir. Diskte olmayanı YAZMA.

**Kanıt:** `grep -ciE "odoo|retention|syslog|FlowBacklogBridge|archive" docs/reference/features.md` ≥ 5. **Test:** yok — .result YAZ.

---

**Beklenen:** 6 task (2 kod + 4 doc), hepsi claude-fable-5/docker, dosya-çakışması YOK. CC sprint sonu: tsc + yeni testler + api/auth regresyonu + güvenlik diff incelemesi (Task 1-2) + **gerçek-binary serve smoke** (api_oidc default-off doğrulaması + statik token yolu) + commit/push. Bu, gece bloğunun SON sprint'i — sonrasında sistem beklemeye alınır, 05:45 TR'de otomatik devam.
