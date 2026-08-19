# DIRECTIVES — 7091 CURSOR-PROVIDER: cursor-agent provider adapter + xverify `--verifier cursor`

## Goal

MASTER 7091 (owner admission 2026-08-19: "cursor provider olarak kabul edip
modellerini kullanabilirsin; xverify'da grok 4.6 cursor üzerinden"). Cursor'un
`cursor-agent` CLI'sı (v2026.08.11+, login'li, gerçek-çağrı kanıtlı) deckent'in
provider-neutral runtime contract'ına TAM adapter olarak girer; birincil hedef
xverify'da `--verifier cursor --verifier-model cursor-grok-4.6-high` — codex'ten
tamamen bağımsız model ailesiyle üçüncü doğrulama rotası. Kanıtlı CLI sözleşmesi:
`cursor-agent --mode ask -p --trust --output-format json --model <id> "<prompt>"`
→ `{"type":"result","subtype":"success","is_error":false,"result":"…",
"session_id":"…","request_id":"…","usage":{"inputTokens":N,"outputTokens":N,
"cacheReadTokens":N,"cacheWriteTokens":N}}` (provider-reported usage MEVCUT).
`--mode ask` read-only (verifier izolasyonu), `-f/--force` yürütme izni (worker
modu), `--trust` dizin-güveni non-interactive zorunlu, `--list-models` katalog,
`cursor-agent status` login durumu ("✓ Logged in as <email>"; login komutu:
`cursor-agent login`). Binary npm'den DEĞİL kendi installer'ından gelir; global
`cursor-agent` PATH'te.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint. Tier-1
  gerçek-binary smoke (xverify --verifier cursor uçtan uca) sprint SONRASI Brain
  tarafından bot-safe build ile koşulur ve landing kaydına işlenir.
- 0-hardcode (KANUN 10): model kimlikleri YALNIZ registry katalog tanımına girer
  (`CODEX_PARITY_MODELS` emsali) — kod-yollarına model-adı literal'i gömülmez.
  FAZ-1 katalog kapsamı BİLEREK dar: yalnız `cursor-grok-4.6-{low,medium,high,xhigh}`
  ailesi (prefix `cursor-` → provider çıkarımı çakışmasız; `gpt-5.6-sol-*` gibi
  çakışma-riskli cursor id'leri SONRAKİ faz, bu sprintte girmez).
- XVerify default routing DEĞİŞMEZ: `DEFAULT_VERIFIER_PRIORITY`
  (src/core/cross-verify.ts:103) ve xverify.ts:610-612 inline fallback'ine cursor
  EKLENMEZ — cursor yalnız explicit `--verifier cursor` veya owner'ın
  `cross_verify.verifier_priority` config'iyle seçilir. Default'a girmesi ayrı
  owner kararıdır.
- Cross-platform (LAW 2): binary çağrıları `buildCliInvocation` üzerinden
  (win32 .cmd sarmalayıcı, codex.ts:229 emsali); path'ler node:path.
- i18n: user-facing yeni metin YALNIZ `getMessage(key, lang)` en+tr; messages.ts'e
  YALNIZ Task 6 yazar. Provider listeleri `{providers}` interpolasyonu ile
  (messages.ts:296-300 tasarım kuralı) — yeni sabit liste yazılmaz.
- Parallel execution ADMITTED; single-writer chokepoints (her görev YALNIZ kendi
  Files listesindeki src dosyalarına yazar; ortak dosya yok).
- Single-writer: ONLY Task 1 writes src/core/task-types.ts, src/core/types.ts,
  src/core/model-registry-types.ts, src/core/provider-capabilities.ts.
- Single-writer: ONLY Task 2 writes src/providers/cursor.ts,
  src/core/provider-command-spec.ts, src/core/provider.ts,
  src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-utils.ts,
  src/orchestra/result-collector.ts, src/api/terminal/types.ts,
  src/cli/commands/chat.ts, src/cli/commands/chat-provider-parity.ts.
- Single-writer: ONLY Task 3 writes src/core/model-registry.ts,
  src/core/cost-calculator.ts, src/cli/commands/models.ts.
- Single-writer: ONLY Task 4 writes src/core/provider-auth-probe.ts,
  src/core/provider-discovery.ts, src/cli/helpers/connect-wizard.ts,
  src/cli/commands/doctor.ts, src/core/provider-packages.ts, src/core/provisioner.ts.
- Single-writer: ONLY Task 5 writes src/providers/cursor-provider-evidence-sources.ts,
  src/providers/provider-authority-runtime-bootstrap.ts; ONLY Task 6 writes
  src/cli/helpers/messages.ts; ONLY Task 7 writes Dockerfile.worker,
  assets/Dockerfile.worker, src/core/worker-image-check.ts.
- Hermetic tests (tmpdir/injectable; gerçek `cursor-agent` çağrısı testte YOK —
  spawn mock'lanır; gerçek-binary kanıt sprint-sonrası Brain smoke'u). Scoped
  verification only. Echo the policy digest in your .result as runPolicyEvidence
  exactly as the prompt's Result contract instructs.
- `detected_env`/IDE anlamındaki mevcut `'cursor'` literal'lerine (environment.ts,
  wizard.ts, init-steps.ts, rule-generator.ts) DOKUNULMAZ — o ayrı namespace'tir;
  Task 1 `src/core/types.ts` union'ı yanına iki-namespace ayrım yorumu ekler.

## Task 1: Provider-union spine + capabilities satırı (compile-blocking küme tek görevde)
- Files: src/core/task-types.ts, src/core/types.ts, src/core/model-registry-types.ts, src/core/provider-capabilities.ts, tests/core/provider-capabilities.test.ts, tests/core/provider.test.ts, tests/core/task-types.test.ts
- Scope: src/core/, tests/core/
- Provider: codex
- Model: gpt-5.6-sol

### Description
1. `src/core/task-types.ts:64` `ProviderName` union'ına `'cursor'`;
   `:76` `PROVIDER_MODEL_MAP`'e cursor getter'ı (claude/:79 codex/:83 emsalleri —
   registry-canlı getter; buradan `config.ts:449 VALID_PROVIDERS` ve DIRECTIVES
   `- Provider:` parse'ı kendiliğinden düzelir, config.ts'e DOKUNMA);
   `:31-33` emsalinde `CursorModel` brand + `:180` emsalinde registry-backed
   `isCursorModel` predicate.
2. `src/core/types.ts:38` `ProviderNameExt` + `:42` `ALL_PROVIDER_NAMES`'e
   `'cursor'` (bu array iki xverify enum'unun TEK kaynağı — xverify.ts:454/461 +
   mcp/tools/xverify.ts:47/49 başka edit istemez); yanına IDE-`'cursor'`
   (DetectedEnv) ile provider-`'cursor'` ayrımını belirten kısa yorum.
3. `src/core/model-registry-types.ts:12` `RegistryProviderName`'e `'cursor'`
   (bunsuz hiçbir cursor modeli registry'ye giremez).
4. `src/core/provider-capabilities.ts:22` exhaustive `Record`'a `cursor` satırı
   (codex satırı emsal; capability alanları dürüst — bilinmeyen yetenek iddia
   edilmez). Bu dosya compile-blocking: union ile AYNI görevde.
5. Pin güncellemeleri: tests/core/provider-capabilities.test.ts:72,77,85,92,137
   uzunluk pinleri (+1); tests/core/provider.test.ts ve
   tests/core/task-types.test.ts içinde ALL_PROVIDER_NAMES veya
   PROVIDER_MODEL_MAP'i pinleyen assertion'lar.

### GO Criteria
- `npx tsc --noEmit` exit 0 (exhaustive Record dahil).
- `ALL_PROVIDER_NAMES` `'cursor'` içerir; `PROVIDER_MODEL_MAP.cursor` getter'ı
  registry'den okur; scoped testler yeşil.

## Task 2: CursorAdapter + komut-spec + factory/routing kayıtları
- Files: src/providers/cursor.ts, src/core/provider-command-spec.ts, src/core/provider.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-utils.ts, src/orchestra/result-collector.ts, src/api/terminal/types.ts, src/cli/commands/chat.ts, src/cli/commands/chat-provider-parity.ts, tests/providers/cursor.test.ts, tests/core/provider-command-spec.test.ts, tests/providers/cred-scrub-all-adapters.test.ts, tests/core/provider-detection.test.ts, tests/core/provider-bootstrap.test.ts
- Scope: src/providers/, src/core/, src/orchestra/, src/api/, src/cli/, tests/
- Provider: codex
- Model: gpt-5.6-sol
- Dependencies: Task 1

### Description
1. `src/providers/cursor.ts` (YENİ): `CursorAdapter implements ProviderAdapter`
   (src/core/provider.ts:267 contract; src/providers/codex.ts:127 şablon).
   `supportedModels` = canlı `modelRegistry.getByProvider('cursor')` getter'ı;
   `spawn()` `buildCliInvocation('cursor-agent', args, platform)` + credential
   scrub (`buildProviderChildEnv`) + `detached: platform !== 'win32'`;
   `buildCommand()` Goal'daki kanıtlı sözleşmeyle (`--mode ask -p --trust
   --output-format json --model <apiId>`; verifier-birincil kullanım read-only —
   yürütme modu ayrı opsiyonel bayrak, kör-default-on YOK); `isAvailable()` =
   binary PATH probe; `diagnoseAvailability()` `cursor-agent status` parse;
   `extractUsage()` result-JSON `usage` alanından (kanıtlı şema);
   `executionCostClass: 'remote'`; `liveUsageBudgetSupport` /
   `executionLandingCapability` dürüst değerler; `createCursorAdapter()` factory.
2. `PROVIDER_COMMAND_SPECS.cursor` (provider-command-spec.ts:96 haritasına):
   binary `cursor-agent`, baseArgs Goal sözleşmesi, `modelFlag:'--model'`,
   promptFeed — cursor-agent prompt'u pozisyonel arg alır; mevcut `promptFeed`
   tipinin desteklediği en dürüst değeri kullan; tip 'stdin'-tek ise ve stdin
   davranışı belgeden doğrulanamıyorsa spec'e minimal 'argument' varyantı ekle
   ve tek tüketicisini (`buildProviderCommand` :162) aynı görevde bağla;
   `oauthHomeDir` gerçek auth-state dizinine göre (doğrulanamıyorsa null +
   .result notu); `liveUsage:'final-only'`;
   `resolveToolScopeEnforcement` (:243) için `allowedToolsFlag:null` →
   RUNTIME_TOOL_SCOPE_UNENFORCED dürüst sonucu kabul.
3. Kayıtlar: F1 `provider.ts:1537 adapterFactories.cursor` + `:789
   detectAvailableProviders()`'a `detectCursor()` (codex :686 emsali); F2
   `spawn-backend-docker.ts:2734 USAGE_ADAPTER_FACTORIES`; F3 `chat.ts:309
   probeProviders`; F4 `chat-provider-parity.ts:51 cliExtraArgs` + `:241-270`
   (270'teki sabit İngilizce listeyi burada yeniden yazma — kaynağını
   ALL_PROVIDER_NAMES'e çevir; localize key ihtiyacını Task 6'ya .result ile
   bildir); `sprint-utils.ts:159 isAdapterProvider` + `spawn-backend-docker.ts:2984
   getProviderBinaryForModel` + `result-collector.ts:764
   CLI_USAGE_LOG_PROVIDERS` + `api/terminal/types.ts:3 AiTool`.
4. Testler: tests/providers/cursor.test.ts (YENİ — buildCommand bayt-kesin,
   extractUsage kanıtlı-JSON fixture, isAvailable mock-spawn, cred-scrub);
   provider-command-spec.test yeni cursor case'leri; cred-scrub-all-adapters +
   provider-detection + provider-bootstrap pin güncellemeleri.

### GO Criteria
- `getProviderCommandSpec('cursor')` non-null; `buildProviderCommand` çıktısı
  bayt-kesin test-pinli; adapter factory kaydı scoped-test-kanıtlı; tsc 0;
  scoped yeşil.

## Task 3: Model katalog (dar FAZ-1) + provider/tier çıkarımı + maliyet
- Files: src/core/model-registry.ts, src/core/cost-calculator.ts, src/cli/commands/models.ts, tests/core/model-registry.test.ts, tests/core/model-registry-parametric.test.ts, tests/core/model-identity.test.ts
- Scope: src/core/, src/cli/, tests/core/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. `CURSOR_MODELS` + `registerCursorParityModels()` (model-registry.ts:355/842
   `CODEX_PARITY_MODELS` emsali, opt-in — `BUILTIN_MODELS`'e GİRMEZ, builtin
   invariant bozulmaz): yalnız `cursor-grok-4.6-{low,medium,high,xhigh}`;
   tier'lar EXPLICIT (low=economy, medium=standard, high=premium,
   xhigh=premium_plus — infer'e bırakılmaz), her tier'da tek `preferredForTier`;
   capabilities dürüst; `status` uygun.
2. `inferProviderFromId` (:432): `cursor-` prefix → `'cursor'` — eşleşme sırası
   `gpt` dalıyla çakışmayacak şekilde (cursor- kendi başında eşleşir), pin'le
   kanıtla; `inferTierFromId` (:461): yalnız yanlış-çıkarım regresyonu pinlenir
   (katalog explicit-tier olduğundan davranış değişikliği minimum).
3. `cost-calculator.ts:481/507/580`: cursor subscription-sınıfı maliyet
   eşlemesi (claude emsalindeki subscription yaklaşımı; sessiz-sıfır YOK —
   bilinmeyen maliyet typed/explicit işaretlenir); `models.ts:46-48` renk +
   `:117` help metninde kaynak listeyi dinamikleştir (sabit yazma).
4. Pin güncellemeleri: model-registry.test:585 provider-sayısı invariantı
   (testin gerçek semantiğine göre dürüst güncelle), :15-660 model-sayısı
   pinleri (yalnız gerçekten etkilenenler), parametric prefix tablosu (:82-86),
   model-identity :52 `undefined` pini.

### GO Criteria
- `registerCursorParityModels()` sonrası `modelRegistry.getByProvider('cursor')`
  4 model döner, her tier'da tek preferred; builtin invariant korunur;
  scoped yeşil; tsc 0.

## Task 4: Auth-probe + discovery + connect/doctor/packages yüzeyi
- Files: src/core/provider-auth-probe.ts, src/core/provider-discovery.ts, src/cli/helpers/connect-wizard.ts, src/cli/commands/doctor.ts, src/core/provider-packages.ts, src/core/provisioner.ts, tests/core/provider-discovery.test.ts, tests/core/provider-auth-probe.test.ts
- Scope: src/core/, src/cli/, tests/core/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. `provider-auth-probe.ts:57` `AuthProbeProvider`'a cursor + probe fonksiyonu:
   `cursor-agent status` çıktı-parse ("Logged in" işareti → authenticated;
   çıkış kodu tek başına güvenilmez — codex :296-380 metin-parse disiplini) +
   `:470/:485-489` dispatch case.
2. `provider-discovery.ts:41 DISCOVERABLE_PROVIDERS`'a cursor;
   `connect-wizard.ts:56 CONNECT_PROVIDERS` + `:183
   PROVIDER_LOGIN_COMMAND.cursor = ['cursor-agent','login']`.
3. `doctor.ts` cursor satırları (~9 site: 458-460, 541, 572, 626-628, 843,
   847-856, 1696-1776, 2507) — install-tip npm DEĞİL, resmi installer'a işaret
   eden metin; MEVCUT key/pattern'lerle; yeni user-facing string gerekiyorsa
   hardcode ETME, ihtiyacı .result'la Task 6'ya bildir.
4. `provider-packages.ts:15/41`: cursor girdisi — npm paketi YOK; definePackage
   sözleşmesi npm-ad zorunluysa binary-only temsili en küçük tip-genişletmeyle
   ekle ve tüketicilerini aynı görevde bağla. `provisioner.ts:19/76/192` aynı
   dürüstlükle (kuramıyorsa typed missing-tool raporu, sahte kurulum yolu yok).
5. Pin: provider-discovery.test:29 `toEqual([...])` + provider-auth-probe.test.

### GO Criteria
- `probeProviderAuth('cursor')` mock'lu logged-in/logged-out iki durumda doğru
  typed sonuç; discovery/doctor scoped yeşil; tsc 0.

## Task 5: Evidence-sources + runtime-bootstrap kaydı (xverify admission kapısı)
- Files: src/providers/cursor-provider-evidence-sources.ts, src/providers/provider-authority-runtime-bootstrap.ts, tests/providers/cursor-provider-evidence-sources.test.ts, tests/providers/provider-authority-runtime-bootstrap.test.ts
- Scope: src/providers/, tests/providers/
- Provider: codex
- Model: gpt-5.6-sol
- Dependencies: Task 2

### Description
1. `cursor-provider-evidence-sources.ts` (YENİ):
   `claude-provider-evidence-sources.ts:22` (tek-scope, 73 satır) BAŞLANGIÇ
   şablonu + codex emsalinden (codex-provider-evidence-sources.ts:809) ÇİFT
   backend kaydı `['host-subprocess','docker']` — xverify verifier docker'da
   koşarken authoring probe host'ta çalışır. İçerik dürüst-minimal:
   reachability evidence (binary varlığı + `cursor-agent status` parse) +
   account-identity + usage-state için TYPED advisory/unavailable stub
   (cursor-agent'ın limit-okuma CLI'sı bu sprintte kanıtlanmadı — sahte yüzde
   ÜRETME; `CodexReachabilityUnavailableEvidenceSource` :662 dürüst-stub
   emsali).
2. `provider-authority-runtime-bootstrap.ts:47`
   `createLocalProviderEvidenceSourceRegistrations()`'a cursor kayıtları
   (claude :57 / codex :61 emsal satırları).
3. Testler: kayıt-seti pini (provider-authority-runtime-bootstrap.test) + yeni
   source'ların typed davranış testleri (mock-spawn; gerçek binary çağrısı yok).

### GO Criteria
- Registry'de cursor × iki-backend kayıtları test-kanıtlı; usage-state stub'u
  typed `unavailable/advisory` döner, asla uydurma snapshot; tsc 0; scoped yeşil.

## Task 6: i18n bakiyeleri + xverify-cursor battery
- Files: src/cli/helpers/messages.ts, tests/cli/xverify-cursor-battery.test.ts
- Scope: src/cli/, tests/cli/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1, Task 2, Task 3

### Description
1. messages.ts bayat sabit listeleri güncelle (en+tr çiftleri birlikte):
   :1652-1653 TLS notu, :5206-5207 sign-in listesi, :5398-5399 connect listesi —
   mümkün olan her yerde sabit listeyi `{providers}` interpolasyonuna çevir
   (tasarım kuralı :296-300); `desktop.shell.term.kind_cursor` YENİ key (en+tr);
   Task 2/4'ün .result'la bildirdiği key ihtiyaçlarını ekle
   (chat-provider-parity:270'in localize edilmesi dahil).
2. `tests/cli/xverify-cursor-battery.test.ts` (YENİ): (a) xverify CLI+MCP
   enum'ları `cursor`'ı kabul eder (ALL_PROVIDER_NAMES üzerinden); (b)
   `--author cursor --verifier cursor` self-verify ban typed hatası; (c)
   `selectVerifierProvider` cursor'ı yalnız taskProvider'dan farklıyken seçer;
   (d) `buildProviderCommand('cursor', <registry-preferred premium id>)`
   bayt-kesin render; (e) `DEFAULT_VERIFIER_PRIORITY` cursor İÇERMEZ pini
   (default-routing değişmedi kanıtı).
- Smoke: node dist/cli/entry.js xverify "smoke claim" --author claude --author-model claude-fable-5 --verifier cursor --verifier-model cursor-grok-4.6-high → typed sonuç döner (enum/spec hatası YOK) — sprint-sonrası Brain koşar.

### GO Criteria
- i18n gate (`node scripts/lint-i18n-hardcode.mjs`) yeşil; battery yeşil; en+tr
  key paritesi; tsc 0.

## Task 7: Worker-image kurulum yolu (Dockerfile + image-check)
- Files: Dockerfile.worker, assets/Dockerfile.worker, src/core/worker-image-check.ts, tests/core/worker-image-check.test.ts
- Scope: Dockerfile.worker, assets/, src/core/, tests/core/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 2

### Description
1. `Dockerfile.worker:35-39` emsalinde `ARG INSTALL_CURSOR=false` + koşullu
   kurulum — cursor-agent npm'de YOK; resmi installer non-interactive docker
   katmanında çalıştırılır ve `cursor-agent`'ı PATH'e koyar;
   `ca-certificates` TLS notu (:13-15) geçerli; `assets/Dockerfile.worker`
   kopyası senkron. İmaj bu sprintte BUILD EDİLMEZ — yalnız dosya + check
   kodu; gerçek imaj kanıtı sprint-sonrası Brain smoke'u.
2. `worker-image-check.ts:112` provider→container-CLI eşlemesine cursor;
   `:153-159` emsalinde `INSTALL_CURSOR=true` build-arg push'u.
3. Test: worker-image-check'in cursor dalı (build-arg üretimi + eşleme) pinlenir.

### GO Criteria
- worker-image-check cursor için doğru build-arg'ları üretir (test-kanıtlı);
  iki Dockerfile senkron; tsc 0; scoped yeşil.
