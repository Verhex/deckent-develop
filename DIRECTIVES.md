# DIRECTIVES — Sprint 270: Publish-Readiness — Kolay Kurulum + Doctor Auth-Probe + Docs Reality

## Goal: deckent publish edildiğinde KOLAYCA kurulup kullanılacak seviyeye gelsin (Odysseus 3-komut çıtası): paket/kurulum gate'leri sağlamlaşır (npm pack smoke, +x garantisi), doctor gerçek provider login-durumunu söyler (PSL-6), worker-image hazırlığı onaylı-otomasyon kazanır (F1-IMG/ADR-063), provider/güvenlik dokümanları kod-gerçeğine oturur (W-K #8/#9, threat-model). MİKRO-TASK + DEPENDENCY modeli (Alperen 2026-06-10) + MODEL-KATMANLAMA (fable yalnız planlama; opus=zor, sonnet=normal, haiku=doc).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable I/O; gerçek ağ YASAK; spawnSync YASAK (async spawn).
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başka task'ın yarım dosyasından gelen tsc hatası NO_GO sebebi DEĞİL (notes'a yaz).
- **Davranış korunumu:** mevcut yeşil testler yeşil kalır; her şey additive/opt-in; onaysız otomasyon YOK (ADR-063).
- **i18n-FIRST:** kullanıcıya görünen TÜM yeni string `getMessage(key, lang)` (en+tr).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. Tier-1 gerçek-binary smoke'ları CC sprint-sonu yapar (ADR-079) — hermetik kanıtla yetin, notes'a yaz.

---

## Task 1: validate-publish güçlendirme — exec-bit + dashboard-bundle assertion'ları
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: scripts/validate-publish.mjs, tests/scripts/validate-publish.test.ts
- Scope: scripts/, tests/scripts/

### Description
Kaynak: `scripts/validate-publish.mjs` (mevcut gate), `scripts/copy-assets.mjs:25` (`BIN_FILES = ['dist/cli/entry.js','dist/mcp/server.js']` + chmodSync 0o755 — SSOT olarak import et ya da listeyi tek yerden türet). CANLI BUG (bugün 2 kez): bare `tsc`/watch build'i entry.js'i exec-bit'siz yazınca npm-link global `deckent` "Permission denied" veriyor. validate-publish'e ekle: (1) BIN_FILES'ın her birinin diskte VAR ve EXECUTE bit'li olduğu; (2) `dist/dashboard/index.html` + en az bir `assets/index-*.js` bundle'ının var olduğu (dashboard'sız publish = hollow serve). Hata mesajları actionable ("npm run build:all koşun" gibi). Test: tmpdir'de sahte dist ağacıyla pass/fail senaryoları.

**Kanıt:** `npx vitest run tests/scripts/validate-publish.test.ts` yeşil; `node scripts/validate-publish.mjs` gerçek dist'te exit 0. **Test:** 5+.

---

## Task 2: npm pack hermetik smoke — paketten kurulan deckent gerçekten açılıyor
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/e2e/npm-pack-smoke.test.ts
- Scope: tests/e2e/

### Description
YENİ hermetik e2e: `npm pack --json` (async spawn, proje kökünde, tarball tmpdir'e) → tmpdir'de `npm install <tarball>` (offline-uyumlu: `--no-audit --no-fund`; registry'ye GİTMEMELİ — bağımlılıklar proje node_modules'tan `--install-links` veya pack'in bundled olmayışı sorun çıkarırsa dürüstçe skip-with-reason + notes) → kurulan `node_modules/.bin/deckent --version` koşar ve sürüm basar; `node_modules/deckent/dist/cli/entry.js` exec-bit'li. Timeout cömert (pack+install yavaş olabilir — test timeout 120s). CI'da ağır kalırsa `describe.skipIf(process.env.CI)` DEĞİL — hermetik kalmalı; süre sorunsa tek it() altında topla. Files alanındaki tek dosyaya yaz.

**Kanıt:** `npx vitest run tests/e2e/npm-pack-smoke.test.ts` yeşil. **Test:** 3+.

---

## Task 3: README quickstart — 3-komut kurulum çıtası
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: README.md
- Dependencies: 270-002
- Scope: ./

### Description
README'nin kurulum/quickstart bölümünü Odysseus 3-komut çıtasına getir (kaynak: gerçek komutlar — `npm install -g deckent` → `deckent init` → `deckent` (REPL) / `deckent serve` (dashboard); Task 2'nin smoke'u kurulum yolunu kanıtladı). Mevcut README yapısını koru (surgical — yalnız kurulum/quickstart bölümü); abartı/uydurma özellik YAZMA; TR/EN hangi dildeyse o dilde tutarlı. 3 komutun her birinin tek-satır açıklaması + ilk 60 saniyede ne görüleceği.

**Kanıt:** `grep -cE "npm install -g deckent|deckent init|deckent serve" README.md` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 4: dev/tsc exec-bit kaybı kökü — watch yolunda da +x garantisi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, ci-testing
- Files: package.json, scripts/copy-assets.mjs, tests/scripts/exec-bit-guard.test.ts
- Scope: ./package.json, scripts/, tests/scripts/

### Description
Kök: `npm run build` (tsc + copy-assets) +x basıyor (copy-assets.mjs:67-71) ama bare `tsc` / `npm run dev` (tsc --watch) entry.js'i exec-bit'siz yeniden yazıyor → npm-link global CLI kırılıyor (bugün 2 canlı vaka). Fix (minimal-yol, worker seçer + belgeler): ya (a) `dev` script'ini `tsc --watch` yerine watch-sonrası chmod'layan küçük bir wrapper'a bağla, ya (b) copy-assets'ten `ensureBinExecutable()` export edip hem build hem ayrı `npm run fix:bin` script'i olarak sun + README/CONTRIBUTING'e not. `.npmrc ignore-scripts=true` gotcha'sını UNUTMA (hook'a güvenme — bkz. proje memory'si): çözüm hook'suz çalışmalı. Test: tmpdir'de exec-bit'siz dosya → helper sonrası 0o755.

**Kanıt:** `npx vitest run tests/scripts/exec-bit-guard.test.ts` yeşil; `grep -n "ensureBinExecutable\|fix:bin" package.json scripts/copy-assets.mjs | head -3` ≥ 1 eşleşme. **Test:** 4+.

---

## Task 5: PSL-6 doctor auth-probe — CLI var ≠ login; gerçek oturum durumu
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert, devops-engineer
- Files: src/core/provider-auth-probe.ts, tests/core/provider-auth-probe.test.ts
- Scope: src/core/, tests/core/

### Description
PSL-6'nın çekirdeği (kaynaklar: `src/providers/*.ts` detect* fonksiyonları — GAP-4: CLI `--version` varlığını `authMethod:'session'` sayıyorlar; `src/core/provider-command-spec.ts` PSL-1 deseni). **YENİ `src/core/provider-auth-probe.ts`:** `probeProviderAuth(provider: 'claude'|'codex'|'gemini', opts: { spawnImpl?, timeoutMs? }): Promise<{ state: 'logged-in'|'logged-out'|'unknown'; detail?: string }>` — her provider için UCUZ, ağ-gerektirmeyen-ya-da-tek-istek probe komutu (örn. claude: `claude auth status`/config dosyası varlığı; codex: `codex login status` veya `~/.codex/auth.json` parse; gemini: `~/.gemini` oauth dosyası — HANGİ yöntemin gerçekte çalıştığını CLI --help/dosya-düzeninden DOĞRULA, koda yorumla belgele; emin olamadığın provider'da 'unknown' dön — UYDURMA). Secret içerikleri asla log'lama/dön'me. injectable spawn/fs ile hermetik testler: logged-in/out/unknown + timeout + missing-CLI senaryoları. Doctor wiring'i Task 6'da (bu task YALNIZ core modül).

**Kanıt:** `npx vitest run tests/core/provider-auth-probe.test.ts` yeşil; `grep -n "logged-out" src/core/provider-auth-probe.ts` ≥ 1. **Test:** 9+.

---

## Task 6: doctor wire — auth-probe satırları ("CLI var ama login DEĞİL" görünür)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: devops-engineer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/doctor.ts, tests/cli/doctor-auth-probe.test.ts
- Dependencies: 270-005
- Scope: src/cli/, tests/cli/

### Description
Task 5'in `probeProviderAuth`'unu doctor'a bağla (kaynak: `src/cli/commands/doctor.ts:521,590,768` authMethod kullanımları). Provider sağlık bölümünde her configured provider için probe sonucu: `logged-in` → mevcut OK satırı; `logged-out` → **[WARN] CLI present but NOT logged in — run <provider login cmd>**; `unknown` → mevcut davranış (regresyon yok). Probe'lar paralel + kısa timeout (doctor yavaşlamasın); i18n getMessage (en+tr). Mevcut doctor testleri yeşil kalır (ollama canlı-env testlerine DOKUNMA — bilinen pre-existing).

**Kanıt:** `npx vitest run tests/cli/doctor-auth-probe.test.ts` yeşil; `grep -n "probeProviderAuth" src/cli/commands/doctor.ts` ≥ 1. **Test:** 6+.

---

## Task 7: F1-IMG part 1 — worker-image readiness denetim modülü
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: docker-expert, typescript-expert, testing-expert
- Files: src/core/worker-image-check.ts, tests/core/worker-image-check.test.ts
- Scope: src/core/, tests/core/

### Description
F1-IMG'nin tespit yarısı (kaynaklar: `Dockerfile.worker` — hangi CLI'lar/build-arg'lar; MASTER-PLAN F1-005 ca-certificates vakası). **YENİ `src/core/worker-image-check.ts`:** `checkWorkerImage(opts: { image?: string; requiredProviders: string[]; spawnImpl? }): Promise<WorkerImageReport>` — injectable spawn ile `docker image inspect <image>` (yokluk → 'missing') + hafif `docker run --rm <image> sh -c '...'` probe'ları: configured provider CLI'ların varlığı (`command -v claude/codex/gemini`), `ca-certificates` (test -d /etc/ssl/certs + update-ca-certificates varlığı yeterli sinyal — belgele). Rapor: `{ state: 'ready'|'missing'|'stale', missingClis: [], missingCaCerts: bool, suggestedBuildCmd: string }` — suggestedBuildCmd gerçek build-arg'larla (`docker build -f Dockerfile.worker --build-arg INSTALL_CODEX=true ...`). AĞ YOK, gerçek docker YOK testlerde (spawn mock'ları). Doctor/consent wiring sonraki task'larda.

**Kanıt:** `npx vitest run tests/core/worker-image-check.test.ts` yeşil; `grep -n "suggestedBuildCmd" src/core/worker-image-check.ts` ≥ 1. **Test:** 8+.

---

## Task 8: F1-IMG part 2 — doctor satırı + consent-based rebuild önerisi (ADR-063)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: docker-expert, typescript-expert, testing-expert
- Files: src/cli/commands/doctor.ts, src/cli/helpers/messages.ts, tests/cli/doctor-image-check.test.ts
- Dependencies: 270-006, 270-007
- Scope: src/cli/, tests/cli/

### Description
Task 7'nin raporunu doctor'a bağla (Task 6 doctor.ts'i değiştirdiği için Dependencies ile SERİLEŞTİRİLDİ — onun üstüne otur): docker backend configured ise image-readiness satırı (`ready` → OK; `missing/stale` → [WARN] + eksiklerin listesi + `suggestedBuildCmd`). **Consent (ADR-063):** doctor'a `--fix-image` opsiyonu — yalnız bu bayrakla VE interaktif onay (`node:readline/promises`, ADR-011) sonrası suggestedBuildCmd'i async spawn ile koşar, çıktıyı akıtır; bayraksız/onaysız ASLA build koşmaz (default davranış değişmez). i18n en+tr. Testler: warn satırı render; --fix-image onay-evet → spawn çağrısı (mock); onay-hayır → spawn yok; bayraksız → spawn yok.

**Kanıt:** `npx vitest run tests/cli/doctor-image-check.test.ts` yeşil; `grep -n "fix-image" src/cli/commands/doctor.ts` ≥ 1. **Test:** 7+.

---

## Task 9: docs/reference/multi-provider.md — kod-gerçeği rewrite (W-K #8a)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/multi-provider.md
- Scope: docs/reference/

### Description
Bilinen drift (W-K detail-2 #8): doküman Gemini'yi API-only ima ediyor (gerçek: `gemini` CLI gerekli + OAuth session keyless çalışır — F1-G), ollama/deepseek/qwen/glm HİÇ yok (hepsi bootstrap-registered), şüpheli `codex auth login`/`gemini auth login` komutları. DİSKTEKİ koddan yeniden yaz: `src/providers/*.ts` detect/spawn gerçekleri, `src/core/model-registry.ts` model listesi, `provider-command-spec.ts` komut şekilleri, OAuth-mount docker davranışı (PSL-1). 8-provider tablo: provider → kurulum → auth yolu (session/api-key) → worker-backend (host-adapter/docker) → durum. Uydurma komut YAZMA — her komutu CLI --help gerçeğinden doğrula, doğrulayamadığını yazma.

**Kanıt:** `grep -ciE "ollama|deepseek|qwen|glm" docs/reference/multi-provider.md` ≥ 4. **Test:** yok — .result YAZ.

---

## Task 10: docs/guide/multi-provider.md — rehber senkronu (W-K #8b)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/multi-provider.md
- Dependencies: 270-009
- Scope: docs/guide/

### Description
Task 9'un yeniden yazdığı reference ile tutarlı rehber: adım-adım kurulum akışları (claude-only default → codex ekleme → gemini ekleme → ollama local), her adımda gerçek komutlar (Task 9'un doğruladıklarını referans al — Dependencies bu yüzden), mixed-fleet DIRECTIVES örneği (`- Provider:`/`- Model:` satırları). Şüpheli eski komutları sil.

**Kanıt:** `grep -ciE "ollama|Provider:" docs/guide/multi-provider.md` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 11: .codex/.gemini rules sync — Karpathy + worker-default parite (W-K #9)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, documentation-writer
- Files: .codex/rules/worker-default.md, .gemini/rules/worker-default.md, .gemini/rules/karpathy-discipline.md, tests/docs/rules-parity.test.ts
- Scope: .codex/, .gemini/, tests/docs/

### Description
Bilinen drift (W-K detail-2 #9): `.claude/rules/` kaynak; `.codex/.gemini` kopyaları eksik/kısa (worker-default 139 vs 112 satır — Karpathy anchor + Proof-of-Function bölümleri eksik olabilir; `.gemini/rules/karpathy-discipline.md` var mı belirsiz). ÖNCE diff'le gerçek durumu çıkar (.result'a yaz); SONRA `.claude/rules/worker-default.md` + `karpathy-discipline.md` içeriğini iki adapter'a senkronla (ADR-013/018 — kopya, çeviri değil; CUSTOM bölge marker'larını koru). YENİ `tests/docs/rules-parity.test.ts`: üç dizinde worker-default + karpathy dosyalarının kritik bölüm başlıklarının (Karpathy 4-Discipline, Proof-of-Function, Test Hermeticity) parite kontrolü — satır-birebir DEĞİL bölüm-varlığı (gelecek drift'i yakalar, kırılgan olmaz).

**Kanıt:** `npx vitest run tests/docs/rules-parity.test.ts` yeşil. **Test:** 4+.

---

## Task 12: threat-model — Worker Code Execution + eksik saldırı yüzeyleri
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, documentation-writer
- Files: docs/security/threat-model.md
- Scope: docs/security/

### Description
Pre-existing kırmızı test: `tests/docs/security-md-current.test.ts` "(b) covers required attack surfaces" — 'Worker Code Execution' bölümü bekliyor (testte istenen TÜM başlıkları testi OKUYARAK çıkar). `docs/security/threat-model.md` §3'e kod-gerçeğinden bölümler ekle: Worker Code Execution (worker'lar repo'da kod çalıştırır — scope advisory ADR-037 V1, docker izolasyonu, honest-gate; DÜRÜST sınırlar: runtime enforcement soft), gerekiyorsa diğer eksik yüzeyler (testin istediği). Mevcut bölüm yapısını/numaralandırmayı koru; pazarlama dili YOK, dürüst güvenlik duruşu (neyin enforce neyin advisory olduğu net).

**Kanıt:** `npx vitest run tests/docs/security-md-current.test.ts` yeşil. **Test:** mevcut test yeşil — .result YAZ.

---

## Task 13: AUT-3 bayat default-deny test beklentisi — davranış doğrula + güncelle
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: tests/cli/autonomous-command.test.ts
- Scope: tests/cli/

### Description
Pre-existing kırmızı: `tests/cli/autonomous-command.test.ts` "default-deny korunur — bilinmeyen tenant flow → audit 'denied'" testi `'pending'` görüyor. AUT-3 köprüsü (`464aaf5e`, `makeFlowBacklogBridge`) flow'ları hard-deny yerine backlog'a guard'lı PARK ediyor — muhtemel bilinçli davranış değişimi. ÖNCE kodu izleyerek doğrula: bilinmeyen-tenant flow'da OTO-EXEC gerçekten YOK mu (park = approval bekler, policy-gate'ten geçmeden koşmaz)? GÜVENLİYSE testi yeni sözleşmeye güncelle (audit 'pending' + oto-exec-yok assertion'ı GÜÇLENDİR — execute çağrılmadığını da assert et) + yorumla belgele. GÜVENLİ DEĞİLSE (park'tan onaysız koşma yolu varsa) testi DEĞİŞTİRME, NO_GO yaz + bulguyu notes'a (güvenlik regresyonu raporu).

**Kanıt:** `npx vitest run tests/cli/autonomous-command.test.ts` yeşil (ya da gerekçeli NO_GO). **Test:** mevcut suite yeşil.

---

## Task 14: serve ilk-koşu çıktısı — tek-blok kullanım rehberi (i18n)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/serve.ts, src/cli/helpers/messages.ts, tests/cli/serve-first-run-banner.test.ts
- Scope: src/cli/, tests/cli/

### Description
Kaynak: `src/cli/commands/serve.ts` (serve CLI wrapper — `src/api/server.ts`'e DOKUNMA, o ayrı task'ların alanıydı). İlk-koşu çıktısını kullanıcı-dostu tek-blok yap (getMessage en+tr): dashboard URL'i, hangi token'ın ne olduğu (API token HTML'e otomatik enjekte — localhost'ta ek adım YOK; terminal token ayrı), durdurma (Ctrl+C), `--port`/`--host` ipuçları. Mevcut log satırlarını kaldırma — düzenle/grupla (sıra + içerik testle sabitlenir, stdout capture mock'uyla hermetik). Amaç: `deckent serve` koşan yeni kullanıcı 10 saniyede ne yapacağını bilsin (Odysseus out-of-box çıtası).

**Kanıt:** `npx vitest run tests/cli/serve-first-run-banner.test.ts` yeşil; `grep -n "getMessage" src/cli/commands/serve.ts | head -2` ≥ 1. **Test:** 4+.

---

## Task 15: features.md — 269 satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md
- Scope: docs/reference/

### Description
`docs/reference/features.md`'e (mevcut tablo formatında) diskte VAR olan 269 eklemeleri: SPA-fallback token-inject (serve default), enterprise endpoints (4 GET), dashboard Workers/Directives sayfaları, REPL /autonomous //audit //directives slash'leri (bridge'li), MCP run modelEffort paritesi, loopback rate-limit muafiyeti (`rateLimitExemptLoopback`, default-on). Her satır tetikleyen komut/bayrakla. Diskte olmayanı YAZMA.

**Kanıt:** `grep -ciE "rateLimitExemptLoopback|/autonomous|enterprise/tenants|WorkersPage" docs/reference/features.md` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 16: config-reference — rateLimitExemptLoopback + terminal_oidc_jwks
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/config-reference.md
- Scope: docs/reference/

### Description
`docs/reference/config-reference.md`'e DİSKTEKİ koddan iki ekleme: (1) `terminal_oidc_jwks` bloğu (`src/api/server.ts` consult kodu — issuer/audience?/jwksUrl, default-off, JwksAuthProvider'a bağlanışı; Sprint 268); (2) serve `rateLimit` + `rateLimitExemptLoopback` davranışı (`HttpServerOptions` — default'lar, loopback muafiyeti gerekçesi; Sprint 269 follow-up). Alanlar/default'lar birebir koddan; uydurma YOK.

**Kanıt:** `grep -ciE "terminal_oidc_jwks|rateLimitExemptLoopback" docs/reference/config-reference.md` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 17: enterprise-integrations — Dynamics bölümü
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-integrations.md
- Scope: docs/reference/

### Description
`docs/reference/enterprise-integrations.md` ERP bölümüne Dynamics 365 driver'ı ekle (kaynak: DİSKTEKİ `src/core/erp-driver-dynamics.ts` — OData v4-only `/api/data/v<apiVersion>/`, bearer-only auth, native `in` + `contains` çevirimi (SAP'ın or-zincirinden farkı), apiVersion path-guard, token-redaction). Odoo/SAP bölümlerinin format/derinliğiyle tutarlı; koddan birebir, uydurma YOK.

**Kanıt:** `grep -ciE "dynamics|api/data/v" docs/reference/enterprise-integrations.md` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 18: cli-commands.md — doctor/serve/audit 269-270 eklemeleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/cli-commands.md
- Dependencies: 270-006, 270-008, 270-014
- Scope: docs/reference/

### Description
`docs/reference/cli-commands.md` güncellemeleri — DİSKTEKİ koddan (Dependencies: doctor/serve task'ları inmeden yazma; inmemiş olan varsa yalnız mevcut olanı belgele + .result'a not): doctor auth-probe satırları + `--fix-image` (Task 6/8), serve ilk-koşu çıktısı + rateLimit notu (Task 14), audit MCP-action paritesi notu (269). REPL slash bölümü varsa /autonomous //audit //directives ekle.

**Kanıt:** `grep -ciE "fix-image|auth-probe|logged in" docs/reference/cli-commands.md` ≥ 2. **Test:** yok — .result YAZ.

---

## Task 19: REPL i18n sözlük denetimi — yeni key'lerin en/tr bütünlüğü
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/cli/messages-completeness.test.ts
- Scope: tests/cli/

### Description
Kaynak: `src/cli/helpers/messages.ts` (en/tr sözlükler). YENİ guard testi: (1) en ve tr sözlüklerinin KEY kümeleri birebir eşit (eksik çeviri = kırmızı); (2) value'larda boş string yok; (3) `{param}` placeholder'ları iki dilde aynı küme (interpolasyon kırığı — bugünkü `{n}` vakasının sözlük-katmanı guard'ı). Mevcut bir benzer test varsa genişlet, yoksa yeni dosya. Bu test gelecekte her i18n eklemesinde drift'i yakalar.

**Kanıt:** `npx vitest run tests/cli/messages-completeness.test.ts` yeşil. **Test:** 3+.

---

## Task 20: MASTER-PLAN işaretlemeleri — 270 kapanan maddeler
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 270-005, 270-007, 270-011, 270-012
- Scope: docs/

### Description
`docs/MASTER-PLAN.md`'de bu sprint'in kapattığı maddeleri işaretle (Dependencies: ilgili task'lar inmeden işaretleme; inmemişleri İŞARETLEME + .result'a not): PSL-6 → doctor auth-probe kısmı ✅ (login-komut sarmalayıcısı kalan), F1-IMG → tespit+consent ✅ (otomatik-arkaplan kalan), W-K detail-2 #8 (multi-provider docs) ✅, #9 (rules sync) ✅, threat-model bölümü. Her işaretleme tek-satır ek ("✅ Sprint 270: ...") — mevcut metni SİLME, ekle. Diskte doğrulamadığını yazma (`ls`/`grep` ile kontrol et).

**Kanıt:** `grep -c "Sprint 270" docs/MASTER-PLAN.md` ≥ 3. **Test:** yok — .result YAZ.

---

**Beklenen:** 20 mikro task (12 kod/test + 8 doc), model-katmanlı (opus 5 · sonnet 8 · haiku 7 · fable 0 worker — planlama Brain'de), dependency zincirleri: 003→002 · 006→005 · 008→006,007 · 010→009 · 018→006,008,014 · 020→005,007,011,012 (wave makinesi gerçek yükte). Dosya-çakışmaları bağımlılıkla serileştirildi (doctor.ts: 006→008; messages.ts: 008 ve 014 farklı key-alanları — çakışırsa Brain FIX). CC sprint sonu: dep spot-check (plan sonrası) + tsc + yeni testler + gerçek-binary doğrulama (doctor çıktısı + serve banner + npm pack smoke) + commit/push + 🔨 BUILD sinyali. Sonraki: PLAN-INT-1 + XVER-1.
