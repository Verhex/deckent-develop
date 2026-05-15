# Sprint 171 — Task 171-017 Audit Raporu: Cross-Cutting Güvenlik Denetimi

**Audit Tarihi:** 2026-05-15
**Worker:** w-171-017 (security-auditor / security-specialist)
**Model:** opus
**Mod:** audit-only (kaynak modify edilmedi; salt okunur)
**Kapsam:** `src/**` + `scripts/**` + `*.config*` + `.gitignore` + `.secrets-baseline` (cross-cutting)
**Çerçeve:** OWASP Top 10 + ADR-006 (`spawnSync` güvenlik pattern) + ADR-014 (`.deck` secret) + Sprint 172 OSS GA önkoşulları
**Dil:** Türkçe (ZORUNLU — sprint-171 worker kontratı)

---

## 1. Bulgular

Bu bölüm tüm kaynak ağacının güvenlik açısından kesik-katmanlı (cross-cutting) denetim
sonuçlarını listeler. Bulgular dört eksenli gruplandırılmıştır: (i) komut enjeksiyonu
ve `spawnSync` güvenlik pattern uyumu, (ii) yol manipülasyonu (path traversal),
(iii) gizli bilgi sızıntısı (secret leakage), (iv) kimlik doğrulama / yetkilendirme
ve diğer OWASP boyutları. Her bulgu için `file:line` kanıtı, risk gerekçesi ve
ilişkili ADR belirtilmiştir. Severity etiketleri Bölüm 2'deki dağılımla eşleşir.

### 1.1 Komut Enjeksiyonu ve `spawnSync` / `execSync` Güvenlik Pattern (ADR-006)

ADR-006 mandatory kuralı: "Tüm `spawnSync` çağrıları array argümanı kullanmalı,
`shell: true` yasak." `src/orchestra/authority-enforcer.ts:464-481` bu kuralı
runtime'da denetliyor — fakat birkaç noktada **ihlal** mevcut.

- **B-001 [CRITICAL] — `runTargetedTests` ve `runFullVitest` `shell: true` ile
  çağrılıyor.** Sıcak yol fonksiyonları sprint plug-in hook'undan tetiklenir;
  shell yorumu açık. Hatalı bir test dosya adı (örn. backtick veya `;` içeren)
  npx vitest komutuna shell üzerinden geçer ve arbitrary command execution'a
  yol açar. ADR-006 doğrudan ihlali. **Kanıt:**
  `src/core/plugin-hooks.ts:395-400` ve `src/core/plugin-hooks.ts:577-582`.

- **B-002 [HIGH] — `captureVitestBaseline` `shell: true` ile spawn yapıyor.**
  Baseline tracker modülü bilerek shell:true'yı taşıyor; aynı saldırı yüzeyi.
  ADR-006 ihlali. Bu fonksiyon orchestra fazlarından doğrudan çağrıldığı için
  blast radius B-001 ile aynı seviyede. **Kanıt:**
  `src/orchestra/baseline-tracker.ts:85-91`.

- **B-003 [HIGH] — Auditor evidence-grep komutu shell'e veriliyor.**
  `defaultRunGrepEvidence(cmd, projectRoot)` `spawnSync('sh', ['-c', cmd], ...)`
  pattern'ini kullanıyor. `cmd` parametresi `parseEvidenceCommand(task.description)`
  ile task description'dan çekiliyor — yani `DIRECTIVES.md`'yi yazan herkes
  Auditor sürecinde **shell çalıştırma** hakkı kazanıyor. Çok-kullanıcılı PR
  süreçlerinde ya da otomatik yapılan plan'larda saldırı yüzeyi. Bu Sprint
  138'de Auditor 3-pipeline verification'ın kasıtlı bir özelliği olabilir
  (Türkçe gereksinimi: zengin grep ifadeleri); fakat şu anda **doğrulama,
  whitelisting veya safe-shell sandboxing yok**. **Kanıt:**
  `src/monitor/auditor.ts:1610-1627` (`spawnSync('sh', ['-c', cmd], …)`),
  evidence parse: `src/monitor/auditor.ts:1466-1478`.

- **B-004 [MEDIUM] — `runStaticCheck` build komutunu boşlukla bölüyor.**
  `buildCmd.split(' ')` → quoted argümanlar bozulur; daha kötüsü kullanıcı
  `runStaticCheck` plugin hook'u içinden komut tanımlarsa (config.json), shell
  boşa boşa yorumlanır gibi *görünür* ama gerçek argv parse'ı parçalanır. Bu
  hata `argv-array` doğru kullanılsa bile beklenmeyen davranışa yol açar.
  **Kanıt:** `src/core/plugin-hooks.ts:370-379`.

- **B-005 [MEDIUM] — Sprint pre-flight `execSync` çağrıları template literal
  içeriyor.** `scripts/publish.ts:150-152` ve `scripts/validate-publish.ts:340,
  358, 371, 386, 410` `execSync(\`...${tag}...\`)` formundadır. `tag` ve
  `version` `package.json`'dan okunuyor (Brain-controlled), fakat publish
  scriptini özel ortamda koşan biri tag'i manipüle edebilir. OSS GA öncesi
  sertleştirme önerilir. **Kanıt:** `scripts/publish.ts:150-152`,
  `scripts/validate-publish.ts:340`.

- **B-006 [LOW] — Windows-only `shell: true` istisnaları belgelenmemiş.**
  `src/providers/subprocess.ts:148, 241`, `src/providers/claude.ts:190`,
  `src/core/provider.ts:234`, `src/core/plugin-hooks.ts:376` `shell:
  process.platform === 'win32'` koşulunu kullanıyor. Bu Claude CLI `.cmd`
  shim'lerini PATH'ten resolve etmek için **gerekli** ama ADR-006 metni
  istisnayı açıkça yazmıyor. Audit otomasyonu (authority-enforcer.ts:473)
  pattern'i `shell: true` literal'e bakıyor; `shell: variable` form'unu
  yakalayamıyor. ADR-006 amendment + auditor regex'i sertleştirme önerilir.
  **Kanıt:** `src/providers/subprocess.ts:147-148`,
  `src/orchestra/authority-enforcer.ts:473`.

- **B-007 [LOW] — `execSync('npm pack --dry-run 2>&1', …)` pipe semantiği shell
  yorumuna güveniyor.** `scripts/validate-publish.ts:298, 321`,
  `scripts/publish.ts:73`, `scripts/pack-test.ts:207` `execSync` ile pipe/redirect
  içeren komutlar çalıştırıyor. Sabit string'ler — risk düşük; ancak `execSync`
  kullanımı `spawnSync(['npm', 'pack', ...])` + iki ayrı stream'in birleşimi
  gibi safer pattern'le değiştirilmeli. **Kanıt:** `scripts/publish.ts:73`,
  `scripts/validate-publish.ts:298, 321`.

### 1.2 Yol Manipülasyonu (Path Traversal) ve Girdi Doğrulama

`src/core/validators.ts` modülü `validatePath()`, `validateTaskId()`,
`validateSprintId()`, `validatePhase()` helper'larını sunuyor — fakat çoğu
çağrı noktasında **kullanılmıyor**.

- **B-008 [HIGH] — MCP `deckent_kill` `taskId` doğrulaması yok.** `killTaskById(root,
  taskId)` `taskId`'yi inputSchema `z.string().optional()` ile alıyor; ancak
  format kontrolü ve `validateTaskId()` çağrısı yok. `taskId` `../../etc/passwd`
  gibi içerikle gönderilirse: doğrudan bir dosya okuma değil, fakat
  `f.endsWith(\`-${taskId}.json\`)` pattern + `JSON.parse(readFileSync(lockPath))`
  zinciri eksik karakterler için hatalı eşleşmeye yol açar; ayrıca
  `lock.taskId === taskId` karşılaştırması manipülasyonla normal worker'ın
  lock'unu silebilir. Kullanım MCP-public ise (Claude Code stdio kullanıcısı
  doğrudan tool input'u kontrol eder) saldırı yüzeyi açılır. **Kanıt:**
  `src/mcp/tools/kill.ts:14, 42-50, 87`.

- **B-009 [HIGH] — Docker spawn backend `taskId` doğrulaması yok.**
  `spawnSync('docker', ['run', ..., '--name', \`${CONTAINER_PREFIX}${taskId}\`])`
  ve `.worker-${taskId}.sh` dosya adı (kapsam: `src/orchestra/spawn-backend-docker.ts`
  içinde 30+ noktada yer alıyor) `validateTaskId()` çağrısı *olmadan* taskId
  kullanıyor. Tmux backend'de aynı çağrı `validateTaskId(taskId)` ile sertleştirilmiş
  (`src/orchestra/tmux.ts:109, 170, 198, 345`). Backend'ler arası **tutarsızlık**
  + Docker tarafında container ismi/script dosya adı injection penceresi açıkta.
  **Kanıt:** `src/orchestra/spawn-backend-docker.ts:31` (`CONTAINER_PREFIX`),
  `:268-269` (`scriptFileName = \`.worker-${taskId}.sh\``), tüm dosyada
  `validateTaskId` çağrısı yok (`grep` `validateTaskId` `src/orchestra/spawn-backend-docker.ts`
  → 0 hit), karşılaştırma: `src/orchestra/tmux.ts:109`.

- **B-010 [MEDIUM] — MCP araçları `root` parametresi için path doğrulaması
  yapmıyor.** `deckent_memory_query` (`src/mcp/tools/memory-query.ts:30, 34`),
  `deckent_nervous` (`src/mcp/tools/nervous.ts:188, 248`), `deckent_docs`
  (`src/mcp/tools/docs.ts:29`), `deckent_checkpoint`
  (`src/mcp/tools/checkpoint.ts:88`) opsiyonel `root: z.string()` alıyor; sonra
  `join(root, BRAIN_DIR, ...)` ile doğrudan dosya okuyor. Saldırı vektörü:
  istemci `root="/"` veya `root="/home/victim/.ssh"` geçerse SQLite veya text
  okuması arbitrary directory üzerinde gerçekleşir. Multi-tenant senaryolarda
  ADR-034 (Multi-Project Isolation) **runtime ihlali**. **Kanıt:**
  `src/mcp/tools/memory-query.ts:33-43`, `src/mcp/tools/nervous.ts:188-248`.

- **B-011 [PASS / İYİ] — HTTP API `workerId` regex doğrulaması var.**
  `src/api/server.ts:103` `WORKER_ID_RE = /^[a-zA-Z0-9-]+$/`, kullanım `:556`
  `if (!WORKER_ID_RE.test(workerId)) { sendError(res, 400, 'Invalid workerId') }`.
  Regex `validateTaskId()` ile aynı sınırı çiziyor. Bu pattern `kill.ts`'e de
  taşınmalı (B-008 önerisi). **Kanıt:** `src/api/server.ts:103, 553-556`.

### 1.3 Gizli Bilgi Sızıntısı (Secret Leakage) ve Redaksiyon

- **B-012 [MEDIUM] — `redactSensitive()` pattern set'i eksik.** Aktif redactor
  6 pattern içeriyor: `sk-`, `key-`, `Bearer`, URL password, OPENAI/ANTHROPIC/
  CLAUDE/API/SECRET/ACCESS/AUTH/PRIVATE_KEY env var. **Eksik kategoriler:**
  (a) `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GH_TOKEN` env var pattern yok —
  oysa Provider dokümantasyonu (`docs/reference/multi-provider.md:52-65`) bu
  isimleri öneriyor. (b) Google API key formatı `AIza[0-9A-Za-z_-]{35}` —
  redactor yakalamıyor. (c) GitHub PAT `gh[pousr]_…` — yakalamıyor. (d) JWT
  formatı `eyJ…\.eyJ…\.…` — yakalamıyor. (e) `postgres://`, `mongodb+srv://`,
  `redis://` URL'lerinde gömülü kimlik bilgisi yakalanmıyor (sadece
  `://user:pass@host` jenerik kalıbı var; protokol-spesifik vakalarda kayıp).
  Sonuç: log'lara, error message'lara, IPC dump'larına bu format'lar **redact
  edilmeden** yazılır. **Kanıt:** `src/core/redact-sensitive.ts:21-36`.

- **B-013 [MEDIUM] — İki ayrı redactor modülü, tutarsız pattern set'i.**
  `src/core/redact-sensitive.ts` (CLI/log) ve
  `src/orchestra/sensitive-redactor.ts:10-23` (Brain crash IPC) farklı pattern
  listeleri kullanıyor. Ortak bir kaynak (single source of truth) yok.
  Pattern eklendiğinde iki yerde de güncellenmesi gerekiyor — operasyonel
  bakım borcu + güvenlik açığı kaynağı. ADR-035 (Verification Protocol) tek
  source-of-truth pattern'ini önerirken, redaksiyon için aynı disiplin
  uygulanmıyor. **Kanıt:** `src/core/redact-sensitive.ts:21-36`,
  `src/orchestra/sensitive-redactor.ts:10-23`.

- **B-014 [MEDIUM] — `verify-gitignore.mjs` sadece `memory.db` kontrolü yapıyor.**
  Script `.brain/memory.db`, `.db-shm`, `.db-wal` üçlüsünü doğruluyor; oysa
  `.gitignore` listesi `.env`, `.env.*`, `.deck`, `*.pem`, `*.key`,
  `credentials.json` dosyalarını da maskeliyor. Bu kategoriler
  `git ls-files` ile doğrulanmıyor → bir geliştirici yanlışlıkla `.env`
  commit'lerse pre-publish gate yakalamaz. OSS GA öncesinde **kritik açık**.
  **Kanıt:** `scripts/verify-gitignore.mjs:21-25` (`CRITICAL_PATTERNS` listesi
  3 elemandan oluşuyor); karşılaştırma: `.gitignore` 60-72 satır arası
  (`.env`, `.env.*`, `.deck`, `*.pem`, `*.key`, `credentials.json`).

- **B-015 [HIGH] — `secret-baseline.mjs` 10 pattern OSS GA için **eksik**.**
  Mevcut: AWS, GitHub, OpenAI, Anthropic, Google, Discord, Telegram, Private
  Key, Generic ENV. **Eksik / önerilen:** (a) `npm_[a-z0-9]{36}` — NPM
  publish token; OSS GA için kritik. (b) `xox[baprs]-…` — Slack token.
  (c) `sk_live_…`, `pk_live_…` — Stripe. (d) `AC[a-f0-9]{32}` — Twilio.
  (e) `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` — SendGrid. (f) `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` — JWT. (g) Database URL
  (`postgres://`, `mongodb+srv://`, `mysql://` user:pass embedded). Ek olarak
  `simpleHash()` (`scripts/security/secret-baseline.mjs:40-44`) 32-bit
  multiplicative pattern; collision riski var. SHA-256 kısaltması daha güvenli.
  **Kanıt:** `scripts/security/secret-baseline.mjs:12-23` (10 pattern),
  `:40-44` (simpleHash).

- **B-016 [LOW] — Allowlist sadece 6 entry; kapsama meta'sı eksik.**
  `.secrets-baseline` (`/workspace/.secrets-baseline`) 6 allowlist kaydı
  içeriyor (Sprint 167/169 fixture'ları). Her entry'nin `note: "baseline-build"`
  alanı düz metin; *kim, ne zaman, hangi PR'da onayladı* metadata'sı yok.
  ADR-014 secret yönetim disiplini buraya taşınmalı. **Kanıt:**
  `/workspace/.secrets-baseline:1-30`.

- **B-017 [GOOD] — `.deck` secret pattern'i ADR-014 ile uyumlu, dokümante.**
  `KNOWN_DECK_KEYS` (`src/core/deck-file.ts:11-21`) tüm bilinen secret
  isimlerini açıkça listeliyor; parser `parseDeckFile()` shell injection riski
  taşımıyor (sadece KEY=VALUE parsing); `.gitignore`'da `.deck` korunuyor.
  Pozitif kontrol. **Kanıt:** `src/core/deck-file.ts:11-21`.

- **B-018 [INFO] — Hardcoded gizli bilgi taraması temiz.** `sk-[a-zA-Z0-9]{30,}`
  ve `AIza[a-zA-Z0-9_-]{30,}` regex'leri tüm `src/` ve `scripts/` ağacında
  yalnızca **test fixture** veya **dokümantasyon örneği** sonuçlarına dokunuyor
  (`tests/cli/helpers/redact-sensitive.test.ts:65`,
  `docs/reference/multi-provider.md:52`,
  `tests/providers/gemini.test.ts:493`). Bunlar `.secrets-baseline`'da
  allowlist'lenmiş. **Kanıt:** `grep -r "sk-[a-zA-Z0-9]\{30,\}" src/ scripts/`
  → boş; `grep -r "AIza[a-zA-Z0-9_-]\{30,\}" src/ scripts/` → boş.

- **B-019 [INFO] — Git tracked dosyalarda gerçek `.env` veya `.deck` yok.**
  `git ls-files` çıktısında `.deck`, `.env`, `.pem`, `.key`, `credentials.json`
  pattern'lerine eşleşen tek satır: `.secrets-baseline` ve `.secrets.baseline`
  (allowlist + detect-secrets manifest — meşru). **Kanıt:**
  `git ls-files | grep -E '\.deck$|\.env$|\.pem$|\.key$|credentials\.json$'`
  → `.secrets-baseline\n.secrets.baseline`.

### 1.4 Kimlik Doğrulama / Yetkilendirme + OWASP A01-A10 Diğer Eksenler

- **B-020 [HIGH] — Connector webhook signature doğrulaması yok.**
  `src/connectors/incoming-router.ts:32-46` `validateWebhookKey()` sadece
  pre-shared key (URL/header karşılaştırması) sağlıyor; standart webhook
  signature mekanizmaları (Discord HMAC, Telegram `secret_token` header,
  WhatsApp `X-Hub-Signature-256`) **uygulanmamış**. Webhook URL'sini bilen
  herkes (log leak, kazara paylaşım) sahte mesaj enjekte edebilir; nervous
  detector zinciri tetiklenebilir. OSS GA'dan sonra public deploy olursa
  saldırı vektörü. **Kanıt:** `src/connectors/incoming-router.ts:11-46`,
  `whatsapp-README.md:65-80` (sadece verifyToken).

- **B-021 [GOOD] — HTTP API Bearer auth sertleştirilmiş.** `src/api/auth.ts:32-53`
  `timingSafeEqual` + SHA-256 hash → eşit uzunlukta buffer karşılaştırması
  (length-leak side-channel kapalı). Default-deny (token yoksa 401).
  Mükemmel pattern. **Kanıt:** `src/api/auth.ts:32-53, 86-110`.

- **B-022 [MEDIUM] — `DECKENT_API_AUTH_DISABLED=1` env var auth'u tamamen
  kapatıyor.** Stderr warning yazılıyor (`src/api/auth.ts:71-76`) ama production
  ortamına bu bayrak yanlışlıkla taşınırsa açık API. Bayrak ismi daha
  korkutucu / explicit (örn. `DECKENT_DEV_AUTH_BYPASS_INSECURE_DO_NOT_USE_PROD`)
  ya da test-only build flag kontrolü altına alınmalı; veya production-build
  sürümünde derleme aşamasında çıkarılmalı. **Kanıt:** `src/api/auth.ts:71-76`.

- **B-023 [MEDIUM] — Rate limiter in-memory + tek instance.** `RateLimiter`
  (`src/api/server.ts:51-76`) `Map<string, RateLimitEntry>` — process restart
  ile sıfırlanır, dağıtılmış deployment'ta her instance ayrı bilgi tutar;
  attacker round-robin ile rate limit'i bypass edebilir. Tek-instance OSS
  beta için kabul edilebilir; doküman uyarısı eklenmeli. **Kanıt:**
  `src/api/server.ts:51-76`.

- **B-024 [LOW] — CSP başlığı `default-src 'none'` çok sıkı (dashboard kırılır mı?).**
  `SECURITY_HEADERS` (`src/api/server.ts:87-93`) `Content-Security-Policy:
  default-src 'none'; frame-ancestors 'none'`. Dashboard React app aynı
  origin'den serve ediliyor; CSP `script-src 'self'`, `style-src 'self'`,
  `connect-src 'self'` izinleri olmadan çalışmaz. Olası iki açıklama:
  (a) dashboard farklı endpoint'te ve auth gerekmiyor — header sadece API'ye
  uygulanıyor; (b) dashboard kırık ve fark edilmemiş. Test edilmeli; iyi
  yöndeki güvenlik niyeti yanlış uygulanmış olabilir. **Kanıt:**
  `src/api/server.ts:87-93`, dashboard root path muhtemelen `/`.

- **B-025 [LOW] — CORS `Access-Control-Allow-Origin: http://localhost:3100`
  template string ile sabit.** `src/api/server.ts:131-135` `sendJson()` her
  yanıta hard-coded localhost:3100 origin koyuyor. Ortam configurable değil
  — dashboard'u farklı port'tan deploy edenler için kırık (CORS hatası).
  Konfigure edilebilir olmalı. **Kanıt:** `src/api/server.ts:129-137`.

- **B-026 [INFO] — Otomatik dependency vulnerability scan (npm audit) CI
  gate'i yok.** `scripts/security/` altında secret-baseline var ama
  `npm audit --audit-level=high || exit 1` benzeri OWASP A06 (vulnerable
  components) gate'i yok. ADR-010 (commander.js tek runtime dep) saldırı
  yüzeyini minimize ediyor — yine de transitive dep'ler için periyodik audit
  şart. **Kanıt:** `ls scripts/security/` → sadece `secret-baseline.mjs`;
  `package.json scripts` → `npm audit` çağrısı yok.

- **B-027 [INFO] — Production'da verbose error mesajı sızdırma riski sınırlı.**
  `sendError(res, 500, err instanceof Error ? err.message : '...')`
  (`src/api/server.ts:140`) `err.message` kullanıyor — ama Bearer auth
  arkasında olduğu için kimliği doğrulanmamış istemciye sızmaz. Yine de
  message redaksiyonu (B-012/B-013 redactor uygulanırsa) eklenmeli.
  **Kanıt:** `src/api/server.ts:139-141, 547`.

- **B-028 [GOOD] — XSS ham HTML enjeksiyon yüzeyi temiz.** `dangerouslySetInnerHTML`,
  `innerHTML =`, `document.write` pattern'leri tüm `src/dashboard/` ağacında
  bulunamadı. React varsayılan auto-escape aktif. **Kanıt:** `grep -r
  "dangerouslySetInnerHTML\|innerHTML\s*=\|document\.write" src/dashboard/`
  → 0 hit.

- **B-029 [GOOD] — `eval` / `new Function` tüm `src/` içinde yok.** Sadece
  `src/core/marketplace/skill-sandbox.ts:32, 93, 97, 147` AST sandbox
  *detector* pattern'leri olarak görünüyor; gerçek `eval()` çağrısı yok.
  ADR-015 (TaskRouter) ve skill registry AST validation pozitif. **Kanıt:**
  `grep -rn "\beval\(\|new Function\(" src/` → sadece sandbox detector
  satırları.

- **B-030 [INFO] — Logging'de yapısal redaksiyon otomatik değil.**
  `console.log(\`[deckent] Worker killed via dashboard: ${workerId}\`)`
  (`src/api/server.ts:559`), `Plan requested via dashboard` (`:544`) düz
  string log'lar. WorkerId regex kontrolü olduğu için injection riski yok;
  ama gelecekte sensitive field (örn. taskDescription) log'a girerse otomatik
  redaksiyon devreye girmiyor. ADR-009 logging contract'ı redaktör
  middleware'ini standart yapabilir. **Kanıt:** `src/api/server.ts:544, 559,
  578`.

---

## 2. Severity

Bulguların severity'ye göre dağılımı (Sprint 168 input formatına uygun
4-field özet için kullanılır):

| Severity | Sayı | Bulgu Kodları | Etki Alanı |
|----------|------|---------------|------------|
| **CRITICAL** | 1 | B-001 | ADR-006 ihlali, sıcak yol RCE penceresi |
| **HIGH** | 5 | B-002, B-003, B-008, B-009, B-015, B-020 (6) | RCE/path traversal/connector spoofing, OSS GA blocker |
| **MEDIUM** | 9 | B-004, B-005, B-010, B-012, B-013, B-014, B-022, B-023, B-027 + B-024 (sınır) | Sertleştirme, redaksiyon eksiği, drift |
| **LOW** | 4 | B-006, B-007, B-016, B-025 | Bakım borcu, dokümantasyon |
| **GOOD/PASS** | 5 | B-011, B-017, B-021, B-028, B-029 | Doğrulanmış güvenli pattern |
| **INFO** | 5 | B-018, B-019, B-026, B-030 + B-024 (sınır) | Bilgi, gözlem |

> Not: B-024 sınır vakası — yanlış kurulmuş CSP UI kırılması = LOW; gerçek
> XSS yüzeyi açma riski = MEDIUM. Test sonucuna göre re-classify edilmeli.

### 2.1 OSS GA Blocker Listesi (Sprint 172 öncesi mutlaka kapatılmalı)

OSS public flip öncesinde **mutlaka** ele alınması gereken bulgular:

| Kod | Severity | Özet | Süresi |
|-----|----------|------|--------|
| B-001 | CRITICAL | `runFullVitest`/`runTargetedTests` `shell: true` kaldırılmalı | 1 sprint |
| B-002 | HIGH | `captureVitestBaseline` `shell: true` kaldırılmalı | 1 sprint |
| B-008 | HIGH | MCP `kill` `taskId` `validateTaskId()` çağrısı eklenmeli | 1 task |
| B-009 | HIGH | Docker spawn-backend `taskId` `validateTaskId()` eklenmeli (tüm noktalarda) | 1 task |
| B-014 | MEDIUM | `verify-gitignore.mjs` `.env` / `.deck` / `*.pem` / `credentials.json` kontrolüyle genişletilmeli | 1 task |
| B-015 | HIGH | `secret-baseline.mjs` pattern set'i NPM/Slack/Stripe/JWT/DB-URL ile genişletilmeli | 1 task |
| B-020 | HIGH | Connector webhook signature verification (HMAC) — Discord/Telegram/WhatsApp standartları | 1 sprint |
| B-022 | MEDIUM | `DECKENT_API_AUTH_DISABLED` daha açık ve geri çekilemez bayrak ismine taşınmalı | 1 task |

---

## 3. Kanıt

Her bulgu file:line referansı Bölüm 1'de yer almaktadır. Bu bölüm temel
kanıt komutlarını ve özet `grep` çıktılarını topluca yeniden listeler ki
denetçi bulguları yeniden üretebilsin.

### 3.1 ADR-006 İhlal Tespiti (Komut Enjeksiyonu)

```
$ grep -rn "shell:\s*true" src/
src/core/plugin-hooks.ts:399:    shell: true,
src/core/plugin-hooks.ts:581:    shell: true,
src/orchestra/baseline-tracker.ts:90:      shell: true,
```

Üç literal `shell: true`. Buna ek olarak `shell: process.platform === 'win32'`
6 noktada bulunuyor (Windows shim resolution — ADR-006 amendment ihtiyacı
B-006).

```
$ grep -n "spawnSync('sh'" src/
src/monitor/auditor.ts:1613:    const result = spawnSync('sh', ['-c', cmd], {
```

Bir `sh -c` çağrısı; `cmd` task description'dan parse ediliyor (B-003).

### 3.2 `validateTaskId` Kapsama Boşlukları

```
$ grep -rln "validateTaskId" src/
src/core/validators.ts
src/orchestra/decision-logger.ts
src/orchestra/tmux.ts
src/mcp/tools/checkpoint.ts
src/mcp/tools/docs.ts
```

Sadece 4 modül validator'ı çağırıyor. **Kapsamda olmalı ama yok:**
`src/orchestra/spawn-backend-docker.ts` (B-009),
`src/mcp/tools/kill.ts` (B-008), `src/mcp/tools/run.ts`,
`src/mcp/tools/status.ts` (taskId-aware sorgu), `src/orchestra/spawn-backend.ts`.

### 3.3 Redaksiyon Pattern Karşılaştırması

`src/core/redact-sensitive.ts:21-36`: 6 regex pattern.
`src/orchestra/sensitive-redactor.ts:10-23`: 6 regex pattern (örtüşmez).
`scripts/security/secret-baseline.mjs:12-23`: 10 regex pattern.

Üç farklı kaynakta üç farklı pattern listesi → tek source-of-truth eksik
(B-013).

### 3.4 OSS Pre-Flip Tracked Secret Taraması

```
$ git ls-files | grep -E '\.deck$|\.env$|\.pem$|\.key$|credentials\.json$'
.secrets-baseline
.secrets.baseline
```

Yalnızca iki dosya — her ikisi de meşru baseline (B-019). Gerçek secret
sızıntısı bulunamadı.

```
$ grep -rEn 'sk-(proj-)?[A-Za-z0-9_-]{40,}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36,}' src/ scripts/
```

→ 0 hit. Tüm gerçek-format anahtarlar test fixture (`tests/`) ya da
dokümantasyon örneği (`docs/`); allowlist'te (B-018).

### 3.5 Webhook Signature Doğrulaması Yokluğu

```
$ grep -rn "signature\|HMAC\|createHmac" src/connectors/
(0 satır — eşleşme yok)
```

Sadece `validateWebhookKey()` (pre-shared key) bulunuyor (`incoming-router.ts:32`)
— gerçek HMAC veya `X-Hub-Signature` doğrulama implement edilmemiş (B-020).

### 3.6 Zod inputSchema Kapsama

MCP araçları çoğunlukla `z.string()` opsiyonel parametre alıyor; `regex()`
ya da `.refine()` ile string format'ı dayatma yapan tek tool **yok**:

```
$ grep -rn "z\.string().*regex" src/mcp/tools/
(0 satır)
```

Hâlbuki `taskId`, `sprintId`, `workerId`, `root` parametreleri için Zod
seviyesinde format kontrolü idealdir (B-008/B-009/B-010 önerisi).

### 3.7 Redactor Pattern Eksiği — Pratik Test

```
input  : "GOOGLE_API_KEY=AIzaSyD1234567890abcdefghijklmnopqrstuv"
çıktı  : "GOOGLE_API_KEY=AIzaSyD1234567890abcdefghijklmnopqrstuv"  (UNCHANGED)
```

`redactSensitive()` GOOGLE_API_KEY env var'ını da değer formatını da
yakalamadı. Beklenen: `GOOGLE_API_KEY=[REDACTED]` (B-012 kanıtı).

---

## 4. Öneriler

Aşağıdaki öneriler Sprint 172 OSS GA önkoşul listesi için (Kapı 1) ve
Sprint 173+ için (Kapı 2) sıralanmıştır. Her öneri için (a) hedef bulgu,
(b) eylem, (c) etki, (d) tahmini efor verilmiştir.

### 4.1 OSS GA Blocker'lar (Sprint 172 — Kapı 1)

**Ö-001 → B-001/B-002:** `runTargetedTests`, `runFullVitest`,
`captureVitestBaseline` fonksiyonlarındaki `shell: true` kaldırılsın;
`spawnSync('npx', ['vitest', 'run', ...args], {shell: false})` olsun.
`stdio` opsiyonları `['pipe', 'pipe', 'pipe']` standardize edilsin. Test:
authority-enforcer regex `shell:\s*true` ihlal taraması CI gate olarak
eklensin (mevcut çağrı zaten var ama hata `accept` ediliyor).
Etki: ADR-006 tam uyum. **Efor:** 0.5 gün.

**Ö-002 → B-003:** Auditor evidence-grep komutu için iki katmanlı koruma:
(a) `parseEvidenceCommand()` `grep`/`rg`/`test`/`find` whitelist'i ile
sınırlansın — başka binary çağırılırsa `null` dönsün; (b) `spawnSync('sh', ['-c', ...])`
yerine `spawnSync(binary, args, {shell: false})` formuna çevrilsin
(parser'ı evidence komut yapısını anlayacak şekilde güncellemek gerek).
Etki: DIRECTIVES.md kaynaklı RCE penceresi kapanır. **Efor:** 1 gün.

**Ö-003 → B-008:** `src/mcp/tools/kill.ts:14` ve `:91` arası `validateTaskId(taskId)`
çağrısı eklensin (try/catch içinde 400 yanıtı). Zod schema da
`z.string().regex(/^[\w-]+$/).max(100)` olarak sertleştirilsin.
Etki: Path traversal + lock injection kapanır. **Efor:** 0.25 gün.

**Ö-004 → B-009:** Docker spawn-backend `spawnContainer()` ve `monitorContainer()`
fonksiyonlarına `validateTaskId(taskId)` eklensin. `task-router.ts` içinde
de plan aşamasında validation çağrısı eklensin (defense-in-depth). Tmux
backend zaten doğru yapıyor — pattern oraya bakılarak çoğaltılsın.
Etki: Backend tutarsızlığı + container/script-name injection kapanır.
**Efor:** 0.5 gün.

**Ö-005 → B-014:** `verify-gitignore.mjs` `CRITICAL_PATTERNS` listesi
`.env`, `.env.*`, `.deck`, `*.pem`, `*.key`, `credentials.json` ve
`secrets/` ile genişletilsin. CI'da `npm run validate:publish` zinciri
script'i çağırıyorsa kapı sağlanır. **Efor:** 0.25 gün.

**Ö-006 → B-015:** `secret-baseline.mjs` pattern set'ine eklenmesi
gereken regex'ler (öncelik sırasıyla):
- `npm_[A-Za-z0-9]{36}` — NPM token (publish gate için en kritik)
- `xox[baprs]-[A-Za-z0-9-]{10,}-[A-Za-z0-9-]{10,}` — Slack
- `(?:sk|pk)_(?:test|live)_[A-Za-z0-9]{24,}` — Stripe
- `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` — JWT
- `(?:postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^@\s]+:[^@\s]+@` — DB URL
- `SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}` — SendGrid
- `AC[a-f0-9]{32}` — Twilio Account SID

`simpleHash()` SHA-256 kısaltmasıyla değiştirilsin (collision'a karşı
güvenli). **Efor:** 0.5 gün.

**Ö-007 → B-020:** Discord/Telegram/WhatsApp connector'ları için webhook
HMAC doğrulaması:
- Discord: `X-Signature-Ed25519` + `X-Signature-Timestamp` (ed25519
  public key — Discord her uygulama için ayrı PK verir).
- Telegram: `X-Telegram-Bot-Api-Secret-Token` constant-time karşılaştırma.
- WhatsApp/Meta: `X-Hub-Signature-256` HMAC-SHA256 (`crypto.createHmac`).

`validateWebhookKey()` korunabilir ama signature doğrulaması paralel
zorunlu hale getirilmeli. Connector başına ayrı modül + timing-safe
helpers (`auth.ts:32-53` pattern'i tekrar kullanılabilir). **Efor:**
2 gün (her connector için ~0.5 gün + test).

**Ö-008 → B-022:** `DECKENT_API_AUTH_DISABLED` env var'ı kaldırılsın;
yerine `package.json` `scripts.dev` içinde test-only Bearer token
otomatik üretip stderr'e basan bir helper konulsun. Production build'de
auth bypass kod yolu compile-time `process.env.NODE_ENV === 'production'`
kontrolüyle elenmeli (tree-shake). **Efor:** 0.5 gün.

### 4.2 Sertleştirme — Sprint 173+ (Kapı 2)

**Ö-009 → B-004:** `runStaticCheck` `buildCmd.split(' ')` yerine
shell-words tarzı parser ya da config seviyesinde `cmd: string[]` olarak
saklama. **Efor:** 0.5 gün.

**Ö-010 → B-005/B-007:** `scripts/publish.ts`, `scripts/validate-publish.ts`,
`scripts/pack-test.ts` `execSync` çağrıları `spawnSync(binary, [...args])`
+ stdout/stderr birleştirme helper'ı ile değiştirilsin. **Efor:** 1 gün.

**Ö-011 → B-006:** ADR-006 metni Windows-only `shell: true` istisnasını
açıkça yazsın (örn. `// ADR-006-EXEMPT: windows-shim-resolution` comment
gerekçesi). Authority-enforcer regex sertleştirilsin: `shell:\s*(?:true|process\.platform)`.
**Efor:** 0.25 gün (ADR amendment + regex update).

**Ö-012 → B-010:** MCP araçlarında `root` parametresi `validatePath(process.cwd(), root)`
ile sınırlandırılsın. Eğer multi-project kullanım ihtiyacı varsa
ADR-034 kapsamında *whitelist'lenmiş project root listesi*ne karşı
doğrulama yapılsın. **Efor:** 0.5 gün.

**Ö-013 → B-012/B-013:** Tek bir `src/core/sensitive-patterns.ts` modülü
oluşturulsun; `redact-sensitive.ts` ve `sensitive-redactor.ts` aynı
listeden import etsin. Pattern listesi B-015 önerisindeki regex'lerle
hizalansın → **üç dosya, tek pattern listesi**. **Efor:** 0.5 gün.

**Ö-014 → B-016:** `.secrets-baseline` her allowlist entry'sine
`approvedBy`, `approvedAt`, `pr` (URL veya commit SHA) alanları eklensin.
Build script'i bu alanları zorunlu kılsın (eksikse exit 1). **Efor:**
0.5 gün.

**Ö-015 → B-023:** Rate limiter en azından dokümantasyonda
"single-tenant only" olarak işaretlensin; multi-instance deploy için
Redis/SQLite tabanlı paylaşımlı sayaç önerisi notu eklensin. **Efor:**
0.1 gün.

**Ö-016 → B-024/B-025:** CSP başlığı dashboard için gerekli `script-src
'self'`, `style-src 'self' 'unsafe-inline'` (Tailwind için), `connect-src
'self'` izinleriyle güncellensin. CORS origin config'ten okunsun
(`api_cors_origin: string`). **Efor:** 0.5 gün (test için manuel browser).

**Ö-017 → B-026:** `package.json scripts` içine `audit:deps`:
`npm audit --audit-level=high` eklensin; CI'da pre-publish gate yapılsın
(`scripts/prepublish.ts` zaten var — buraya eklenebilir). **Efor:**
0.25 gün.

**Ö-018 → B-027/B-030:** API server `console.log` çağrılarına otomatik
`redactSensitive()` middleware eklensin. ADR-009 logging contract
amendment'i ile tüm `[deckent]` prefix'li log'larda redactor zorunlu
kılınsın. **Efor:** 0.5 gün.

### 4.3 Sürekli Güvenlik (CI / Operasyonel)

**Ö-019:** Aşağıdaki gate'ler CI'da pre-publish'e bağlansın:
- `node scripts/security/secret-baseline.mjs` (mevcut)
- `node scripts/verify-gitignore.mjs` (mevcut, ama B-014 ile güçlendirildikten sonra)
- `npm audit --audit-level=high` (B-026 / Ö-017)
- `npx tsc --noEmit` (mevcut — type-safety = security boundary)
- Authority-enforcer custom rule: `shell:\s*true` (mevcut, ama hata `error` seviyesine çıkarılsın)

**Ö-020:** `docs/SECURITY.md` (proje kök) güncellensin: vulnerability
disclosure policy + responsible disclosure email + 90-gün açıklama süresi
gibi standart maddeler eklensin. OSS public flip için bu dosya GitHub
Security tab'ında zorunludur. (Bulgu kapsamında değil — sadece OSS
checklist hatırlatması.)

---

> **Self-review:** Rapor 4 zorunlu bölüm dolu (Bulgular / Severity / Kanıt /
> Öneriler). Her bulgu file:line kanıtlı (≥30 file:line referansı).
> Cross-cut task → Kapsam Haritası YOK (plan §Worker Contract). Çıktı dili
> tam Türkçe + diakritik (ç/ğ/ı/ö/ş/ü) korundu. OSS-GA blocker'lar (Bölüm
> 2.1) ayrı tabloda işaretlendi. Severity dağılımı Sprint 168 input
> formatına uygun.
