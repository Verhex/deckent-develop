# W1 — Security & Multi-Tenancy Audit (Sprint 132)

**Date:** 2026-04-10
**Worker:** W1 (security-auditor)
**Skills:** security-specialist, typescript-expert
**Sprint:** 132 — Full 360° Enterprise Readiness Audit

---

## Executive Summary

Deckent'in güvenlik yüzeyi, bir yerel-öncelikli (local-first) CLI aracı olarak makul bir seviyededir; ancak **enterprise multi-tenant dağıtım için birkaç kritik ve yüksek öncelikli boşluk** mevcuttur. En kritik bulgular: (1) Plugin hook sistemi, `import()` ile doğrulama olmaksızın keyfi JavaScript/TypeScript modüllerini çalıştırabilir — imza doğrulaması veya izin listesi yoktur. (2) API HTTP sunucusu, GET endpoint'lerinde varsayılan olarak kimlik doğrulama gerektirmez; yalnızca POST endpoint'leri korunmaktadır. (3) MCP stdio transport'u herhangi bir kimlik doğrulama/yetkilendirme katmanı içermez. (4) Docker worker container'ları `--dangerously-skip-permissions` bayrağıyla çalıştırılır ve proje dizini read-write olarak mount edilir. Genel güvenlik postürü, tek-kullanıcılı yerel geliştirme için ORTA, enterprise multi-tenant ortam için DÜŞÜK seviyededir.

---

## Methodology

### Taranan Dosyalar (25 dosya, ~8.500 satır)

| Dosya | LoC | Tarama Alanı |
|-------|-----|-------------|
| `src/core/credentials.ts` | 194 | Credential storage, permissions |
| `src/core/config.ts` | ~1110 | 3-layer merge, env injection, validation |
| `src/core/deck-file.ts` | ~160 | .deck secret loading, git tracking |
| `src/core/plugin.ts` | 455 | Plugin lifecycle, npm/git/local install |
| `src/core/plugin-hooks.ts` | 796 | Hook registration, dynamic import |
| `src/core/marketplace/skill-sandbox.ts` | 397 | Regex + AST scanning, quarantine |
| `src/core/marketplace/marketplace-auth.ts` | 151 | Marketplace token storage |
| `src/agents/worker.ts` | 997 | Scope enforcement, file locking, verify |
| `src/monitor/auditor.ts` | 612 | Heartbeat scan, boundary violations |
| `src/orchestra/spawn-backend-docker.ts` | 333 | Docker container spawn, isolation |
| `src/api/server.ts` | 785 | HTTP API, auth, CORS, rate limiting |
| `src/api/rate-limiter.ts` | 96 | Token-bucket rate limiter |
| `src/mcp/server.ts` | ~80 | MCP tool registration, stdio |
| `Dockerfile.worker` | ~30 | Worker container image |
| `docker-compose.yml` | ~20 | Compose service definition |

### Tarama Pattern'leri

- `process.env\.`, `API_KEY`, `TOKEN`, `SECRET`, `password`, `credentials` (grep)
- `execSync`, `spawnSync`, `exec(` — komut enjeksiyon yüzeyi (137 kullanım)
- `readFileSync`, `writeFileSync` — senkron I/O sayımı (605 kullanım)
- `as any`, `@ts-ignore`, `@ts-expect-error` — tip güvenliği gevşeklikleri (1 kullanım)
- `pathToFileURL`, `import(` — dinamik modül yükleme
- `--dangerously-skip-permissions` — izin atlama kullanımı (13 kullanım)

### Karşılaştırma Standartları

- OWASP Top 10 2021
- CWE Top 25 (2023)
- Node.js Security Best Practices

---

## Findings

| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | **CRITICAL** | Supply-Chain | `src/core/plugin-hooks.ts:138-139` | Plugin hook modülleri `await import(fileUrl)` ile doğrulama olmaksızın yükleniyor. İmza doğrulama, hash kontrolü veya izin listesi yok. Kötü niyetli bir plugin manifesti, `hooks.beforeSprint` alanıyla keyfi JS kodu çalıştırabilir. | Herhangi bir kullanıcı tarafından `.deckent/plugins/` altına yerleştirilen bir plugin, tam Node.js erişimi elde eder — dosya sistemi, ağ, alt süreç dahil. | Plugin hook'ları için imza doğrulama veya hash-tabanlı beyaz liste uygulayın. En azından, sandbox dışında `import()` kullanmadan önce hook dosyasını `skill-sandbox.ts` tarama sürecinden geçirin. |
| 2 | **CRITICAL** | Sandbox | `src/core/plugin.ts:278-329` | `installFromNpm()` fonksiyonu `spawnSync('npm', ['install', ...])` çalıştırarak npm paketini indirip kurar. npm paketleri `postinstall` script'leri çalıştırabilir — bu tamamen sandbox'sız bir keyfi kod çalıştırma vektörüdür. | Kötü niyetli bir npm paketi, install sırasında sistemde keyfi komut çalıştırır. | npm install'a `--ignore-scripts` bayrağını ekleyin. Plugin install sonrası `skill-sandbox.ts` ile tarama zorunlu kılın. |
| 3 | **HIGH** | API / OWASP-A01 | `src/api/server.ts:293-299` | HTTP API, yalnızca POST endpoint'lerinde Bearer token doğrulaması yapıyor. Tüm GET endpoint'leri (`/api/status`, `/api/config`, `/api/memory`, `/api/debt`, `/api/tasks`, `/api/history`) kimlik doğrulama gerektirmiyor. Herhangi bir yerel süreç, hassas sprint verilerine, konfigürasyona ve bellek içeriğine erişebilir. | Aynı makinede çalışan başka uygulamalar veya kötü niyetli script'ler, Deckent'in iç durumunu okuyabilir. Config verileri API key referanslarını, provider ayarlarını ve proje yapısını içerir. | GET endpoint'lerine de Bearer token doğrulaması ekleyin. CORS origin kontrolünü sıkılaştırın — şu anda `localhost:*` kabul ediliyor. |
| 4 | **HIGH** | API / OWASP-A01 | `src/mcp/server.ts:1-80` | MCP server, stdio transport üzerinden çalışıyor ve hiçbir kimlik doğrulama/yetkilendirme katmanı içermiyor. MCP tool handler'ları (`deckent_kill`, `deckent_cleanup`, `deckent_start`) yıkıcı operasyonlar gerçekleştirebilir. stdio transport'un doğası gereği yerel erişim gerektirir, ancak enterprise ortamda MCP proxy veya ağ transport kullanılıyorsa bu bir güvenlik açığıdır. | MCP aracılığıyla erişim sağlayan herhangi bir istemci, sprint'leri başlatabilir, worker'ları öldürebilir ve dosyaları temizleyebilir. | MCP server'a tool-seviyesi yetkilendirme ekleyin. Yıkıcı araçlar (`kill`, `cleanup`, `start`) için ek onay mekanizması uygulayın. |
| 5 | **HIGH** | Docker / OWASP-A05 | `src/orchestra/spawn-backend-docker.ts:94,150-152` | Docker worker container'ları: (a) `--dangerously-skip-permissions` bayrağıyla çalıştırılıyor, (b) proje dizini `-v ${dir}:${CONTAINER_WORKSPACE}` ile read-write mount ediliyor, (c) host kullanıcısının `~/.claude` dizini read-write mount ediliyor. Bir worker, tüm proje dosyalarını ve Claude kimlik bilgilerini okuyup değiştirebilir. | Kötü niyetli bir task veya hatalı bir worker, projedeki herhangi bir dosyayı değiştirebilir. Claude auth token'ları da dahil olmak üzere kimlik bilgileri sızdırılabilir. | Proje dizinini read-only mount edip sadece `.tasks/` ve worker'ın scope'undaki dizinleri read-write yapın. `~/.claude` mount'unu read-only yapın. `--security-opt=no-new-privileges` ekleyin. |
| 6 | **HIGH** | Credentials / OWASP-A02 | `src/core/credentials.ts:74-81` | API key'leri JSON dosyaları olarak `~/.deckent/credentials/` altında düz metin (plaintext) saklanıyor. `chmod 0600` uygulanıyor, ancak OS keychain entegrasyonu yok. Dosya sistemi erişimi olan herkes (aynı kullanıcı, root) bu dosyaları okuyabilir. | API anahtarları (Anthropic, OpenAI, Google) düz metin olarak diskte duruyor. Disk sızıntısı, yedekleme ifşası veya aynı kullanıcı olarak çalışan başka süreçler bunlara erişebilir. | OS keychain entegrasyonu (macOS Keychain, Linux secret-service) ekleyin. En azından dosyaları şifreli saklayın (AES-256-GCM + kullanıcı parolası). |
| 7 | **HIGH** | Credentials / OWASP-A02 | `src/core/marketplace/marketplace-auth.ts:75-81` | Marketplace token'ı `~/.deckent/credentials/marketplace.json` içinde düz metin saklanıyor. credentials.ts ile aynı sorun — `chmod 0600` dışında ek koruma yok. | Marketplace token'ı sızdırılırsa, saldırgan kullanıcı adına skill yayınlayabilir veya kötü niyetli skill'leri indirtebilir (supply chain). | `CredentialManager` ile birleştirin ve OS keychain desteği ekleyin. |
| 8 | **HIGH** | Docker / OWASP-A05 | `src/orchestra/spawn-backend-docker.ts:166-172` | API key'leri (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`) Docker container'larına `-e` bayrağıyla ortam değişkeni olarak aktarılıyor. Bu değerler `docker inspect`, `/proc/1/environ` veya container log'ları üzerinden okunabilir. | Container'a erişimi olan herkes (veya container escape durumunda) tüm API key'lerine erişir. | Docker secrets veya tmpfs dosya mount'u kullanarak key'leri aktarın. Ortam değişkenleri yerine dosya bazlı secret injection kullanın. |
| 9 | **HIGH** | Credentials / OWASP-A02 | `src/core/deck-file.ts:84-95` | `.deck` dosyası proje kök dizininde düz metin secret'lar içeriyor (`DECKENT_CLAUDE_API_KEY`, `DECKENT_OPENAI_API_KEY` vb.). `doctor.ts:804` satırında git'e commit edilme uyarısı var, ancak `.deck` dosyası otomatik olarak `.gitignore`'a eklenmiyor. | Secret'lar yanlışlıkla git geçmişine commit edilebilir. | `deckent init` sırasında `.deck` dosyasını otomatik olarak `.gitignore`'a ekleyin. Init sonrası kontrol edip uyarı verin. |
| 10 | **MEDIUM** | IsolationAndTenancy | `src/agents/worker.ts:704-722` | Worker scope enforcement `isWithinScope()` fonksiyonu `normalize()` + string prefix kontrolü yapıyor. Ancak symlink'ler kontrol edilmiyor — bir worker, scope dışındaki bir dizine symlink oluşturup ardından bu symlink üzerinden dosya yazabilir. | Scope sınırlarının atlatılması, izolasyonu etkisiz kılar. | `fs.realpathSync()` ile hedef yolun gerçek konumunu çözümleyip scope kontrolü uygulayın. |
| 11 | **MEDIUM** | IsolationAndTenancy | `src/agents/worker.ts:172-229` | Dosya kilitleme mekanizması `O_EXCL` ile atomik oluşturma sağlıyor — bu iyi. Ancak TOCTOU yarışma penceresi hâlâ mevcut: `existsSync(lockPath)` kontrolü ile `openSync(lockPath, O_EXCL)` arasında başka bir işlem lock dosyasını oluşturabilir. O_EXCL catch bloğu bu durumu yakalıyor ancak hata mesajı yanıltıcı olabilir. | Pratikte düşük olasılıklı, ama yüksek worker paralelliğinde teorik yarışma durumu. | Mevcut O_EXCL implementasyonu yeterli. TOCTOU penceresini daraltmak için existsSync kontrolünü kaldırıp doğrudan O_EXCL deneyin (try-first yaklaşımı). |
| 12 | **MEDIUM** | IsolationAndTenancy | Genel mimari | İki farklı proje aynı makinede eşzamanlı sprint çalıştırabilir. Her proje kendi `projectRoot` yoluna göre `.tasks/`, `.locks/`, `.brain/` kullanıyor — bu doğru izolasyon. Ancak global state (CredentialManager, global config `~/.deckent/`) paylaşımlı. İki sprint aynı anda credential dosyasını güncellerse yarışma durumu oluşabilir. | Düşük olasılık ancak enterprise ortamda dikkat gerektiren durum. | Credential yazma işlemleri için dosya seviyesinde kilit (flock) uygulayın. |
| 13 | **MEDIUM** | InputValidation / OWASP-A03 | `src/api/server.ts:431-434` | Statik dosya servisi path traversal kontrolü yapıyor (`resolved.startsWith(resolve(staticDir))`) — bu doğru. Ancak `req.url` doğrudan `resolve()` ile birleştiriliyor; URL-encoded traversal (`%2e%2e%2f`) Node.js HTTP parser'ı tarafından decode edilir ama `resolve` bunu yakalayamayabilir. | Düşük: `startsWith` kontrolü çoğu traversal denemesini yakalıyor. | URL'yi decode edip normalize ettikten sonra path traversal kontrolü uygulayın. |
| 14 | **MEDIUM** | Supply-Chain | `src/core/plugin.ts:332-354` | `installFromGit()` fonksiyonu `spawnSync('git', ['clone', source, tmpDir])` ile herhangi bir git URL'sini klonlayabilir. URL doğrulaması yapılmıyor. | Kötü niyetli git repo'ları büyük dosyalar, git hook'ları veya submodule'lar aracılığıyla zarar verebilir. | Git clone'a `--depth 1 --single-branch` ekleyin. git hook'ları devre dışı bırakmak için `--config core.hooksPath=/dev/null` kullanın. |
| 15 | **MEDIUM** | Sandbox | `src/core/marketplace/skill-sandbox.ts:38-49` | Skill sandbox'u regex + AST taraması yapıyor — bu iyi bir başlangıç. Ancak gerçek runtime izolasyonu (`vm2`, `isolated-vm`, Web Worker) yok. Taramadan geçen bir skill, tam Node.js erişimine sahiptir. | Obfuscated veya tarama kalıplarından kaçan kötü niyetli kod, sandbox'u atlayabilir. Örneğin: `const e = 'ev'; const a = 'al'; globalThis[e+a]('...')` AST tarafından yakalanıyor ama daha karmaşık obfuscation yakalanmayabilir. | Runtime sandboxing (isolated-vm veya separate process + IPC) ekleyin. Regex + AST taramasını ön filtre olarak koruyun, ancak tek güvenlik katmanı olarak güvenmeyin. |
| 16 | **MEDIUM** | Docker / OWASP-A05 | `Dockerfile.worker:1-30` | Worker container imajı `node:22-slim` tabanlı — güncelleme politikası tanımlı değil. `apt-get update` build sırasında çalışıyor ama CVE takibi yok. Ayrıca `chmod 777 /tmp/deckent-home` tüm kullanıcılar için yazılabilir — container içinde ek bir kullanıcı bu dizine erişebilir. | Güncellenmemiş base image, bilinen güvenlik açıklarını taşıyabilir. | Base image'i sabitlenmiş digest ile pin'leyin. `chmod 777` yerine `chmod 700` kullanın. CVE tarama adımı (trivy/grype) ekleyin. |
| 17 | **LOW** | Credentials / OWASP-A09 | `src/orchestra/spawn-backend-docker.ts:129` | Worker heartbeat güncellemeleri `echo` ile shell'den yazılıyor — JSON verisi template literal'lerle oluşturuluyor. taskId'de özel karakter varsa (teorik) injection riski. | Çok düşük: taskId formatı `NNN-NNN` ile sınırlı. | taskId format doğrulamasını spawn öncesi uygulayın. |
| 18 | **LOW** | API / OWASP-A09 | `src/api/server.ts:498,536` | Sprint başlatma ve worker öldürme olayları `console.log` ile loglanıyor. Yapılandırılmış güvenlik günlüğü (structured audit log) yok — kim, ne zaman, hangi IP'den, hangi endpoint. | Enterprise ortamda denetim izi (audit trail) eksikliği compliance sorunlarına yol açar. | Yapılandırılmış JSON audit log ekleyin (timestamp, IP, user, action, result). |
| 19 | **LOW** | IsolationAndTenancy | `docker-compose.yml:1-20` | Compose dosyasında `.deckent` ve `.brain` dizinleri volume olarak mount ediliyor — ancak container `DECKENT_API_PORT` ile çalışıyor ve `healthcheck` sadece `/health` endpoint'ini kontrol ediyor. Ağ izolasyonu (network policy) veya kaynak limiti yok. | Compose service, aynı Docker ağındaki diğer container'lar tarafından erişilebilir. | `network_mode: none` veya özel Docker ağı tanımlayın. Memory/CPU limitleri ekleyin. |
| 20 | **LOW** | Credentials / OWASP-A02 | `src/orchestra/spawn-backend-docker.ts:156-157` | Host `~/.claude` dizini container'a read-write mount ediliyor. Claude CLI session token'ları burada saklanır. Container içinden token sızdırılabilir. | Session token ifşası — ancak container zaten kullanıcı yetkileriyle çalışıyor. | Mount'u read-only (`:ro`) yapın. Session-env yazması için ayrı bir tmpfs kullanın. |
| 21 | **INFO** | API | `src/api/server.ts:136-139` | CORS origin kontrolü `localhost:*` ve `127.0.0.1:*` kabul ediyor. Bu, yerel makinedeki herhangi bir web sayfasının API'ye istek gönderebilmesine izin verir. | Yerel XSS veya kötü niyetli yerel uygulama, dashboard API'sine cross-origin istek gönderebilir. | CORS origin'i sadece dashboard port'uyla sınırlayın (`http://localhost:3100`). |
| 22 | **INFO** | Sandbox | `src/core/marketplace/skill-sandbox.ts:204-211` | `BUILTIN_TRUSTED_SKILLS` sabit listesi sadece 5 skill içeriyor: `typescript-expert`, `react-expert`, `node-expert`, `test-expert`, `doc-expert`. Gerçekte 21 built-in skill var — geri kalan 16 skill trusted listede değil. | Fonksiyonel sorun: isTrusted() kontrolü built-in skill'ler için bile false dönebilir. | Built-in skill listesini `skill-pool.ts`'deki gerçek listeyle eşleştirin. |
| 23 | **INFO** | Credentials | Genel | `readFileSync` 605 kez, `writeFileSync` eşdeğer sıklıkta kullanılıyor. Bunların büyük çoğunluğu task dosyaları, heartbeat'ler ve lock dosyaları için. Hassas veri (credential) yazımı sadece `credentials.ts` ve `marketplace-auth.ts` içinde `mode: 0o600` ile yapılıyor — bu doğru. | Bilgilendirici — dosya izinleri tutarlı uygulanıyor. | - |

---

## Metrics

- **Dosya tarandı:** 25
- **Toplam bulgu:** 23
- **CRITICAL:** 2
- **HIGH:** 7
- **MEDIUM:** 7
- **LOW:** 4
- **INFO:** 3
- **OWASP kategorileri tespit edildi:** A01 (Broken Access Control), A02 (Cryptographic Failures), A03 (Injection), A05 (Security Misconfiguration), A08 (Data Integrity — supply chain), A09 (Security Logging Failures)
- **execSync/spawnSync kullanımı:** 137 occurrence, 37 dosya
- **Senkron dosya I/O (readFileSync/writeFileSync):** 605 occurrence, 132 dosya
- **`--dangerously-skip-permissions` kullanımı:** 13 occurrence (docker, tmux, subprocess, claude backends)
- **`as any` / `@ts-ignore` / `@ts-expect-error`:** 1 occurrence (src/cli/commands/spawn.ts)

---

## Evidence

### Finding #1 — Plugin Hook Arbitrary Code Execution

**Dosya:** `src/core/plugin-hooks.ts:126-154`

```typescript
export async function loadHookModule(
  pluginDir: string,
  hookPath: string,
): Promise<HookCallback | null> {
  const fullPath = join(pluginDir, hookPath);
  if (!existsSync(fullPath)) { /* ... */ return null; }
  try {
    const fileUrl = pathToFileURL(fullPath).href;
    const mod = await import(fileUrl);          // ← ARBITRARY CODE EXECUTION
    const fn = mod.default ?? mod;
    if (typeof fn !== 'function') { /* ... */ return null; }
    return fn as HookCallback;
  } catch (err) { /* ... */ }
}
```

`import()` ile yüklenen modül, tam Node.js runtime erişimine sahiptir. Herhangi bir dosya I/O, ağ çağrısı veya subprocess oluşturma yapılabilir. `plugin.ts:validateManifest()` manifest alanlarını doğruluyor ama hook dosyasının içeriğini TARAMIYOR.

### Finding #2 — npm Install postinstall Scripts

**Dosya:** `src/core/plugin.ts:285-289`

```typescript
const result = spawnSync(
  'npm',
  ['install', '--prefix', tmpDir, packageName],
  { encoding: 'utf8', timeout: 60_000 }
);
```

`--ignore-scripts` bayrağı yok. npm paketi `package.json` → `"scripts": { "postinstall": "rm -rf /" }` içerebilir.

### Finding #3 — HTTP API GET Endpoints Without Auth

**Dosya:** `src/api/server.ts:293-299`

```typescript
// Auth check for API routes (POST and mutating endpoints)
if (url.startsWith('/api/') && method === 'POST') {
  if (!checkAuth(req, apiToken ?? null)) {
    sendError(res, 401, 'Unauthorized — provide Authorization: Bearer <token>');
    return;
  }
}
```

GET endpoint'leri bu koşulun dışında kalıyor. `/api/config`, `/api/memory`, `/api/debt` gibi hassas endpoint'ler korunmuyor.

### Finding #5 — Docker Worker Full Project RW Access

**Dosya:** `src/orchestra/spawn-backend-docker.ts:150-157`

```typescript
// Project mounted read-write — workers need to create/edit files in scope
'-v', `${dir}:${CONTAINER_WORKSPACE}`,
// .tasks/ mounted read-write (results, heartbeats, prompts)
'-v', `${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}`,
// .locks/ mounted read-write (file locking)
'-v', `${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks`,
// Claude auth — mount host credentials into container HOME (rw)
'-v', `${join(home, '.claude')}:${containerHome}/.claude`,
```

Proje dizini tümüyle read-write. Worker'ın scope enforcement'ı sadece yazılımsal (auditor `git diff` kontrolü), container seviyesinde zorlama yok.

### Finding #6 — Plaintext Credential Storage

**Dosya:** `src/core/credentials.ts:74-81`

```typescript
const entry: CredentialEntry = {
  provider,
  key,                              // ← PLAINTEXT API KEY
  storedAt: new Date().toISOString(),
};
const filePath = this.credentialFilePath(provider);
writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 
  { encoding: 'utf-8', mode: 0o600 });
```

API key düz metin JSON olarak saklanıyor. `chmod 0600` temel koruma sağlıyor ancak disk sızıntısı, yedekleme veya root erişimi durumunda yetersiz.

### Finding #8 — Docker Environment Variable API Keys

**Dosya:** `src/orchestra/spawn-backend-docker.ts:166-172`

```typescript
const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DECKENT_DEBUG'];
for (const key of envKeys) {
  if (process.env[key]) {
    dockerArgs.push('-e', `${key}=${process.env[key]}`);
  }
}
```

API key'leri container'a ortam değişkeni olarak aktarılıyor. `docker inspect <container>` ile okunabilir.

### Finding #10 — Scope Enforcement Missing Symlink Check

**Dosya:** `src/agents/worker.ts:704-722`

```typescript
export function isWithinScope(filePath: string, scope: TaskScope): boolean {
  const normalizedFile = normalize(filePath).split(sep).join('/');
  for (const dir of scope.directories) {
    const normalizedDir = normalize(dir).split(sep).join('/');
    const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
    if (normalizedFile.startsWith(dirWithSlash) || normalizedFile === normalizedDir) {
      return true;
    }
  }
  // ... filesWrite check
  return false;
}
```

`normalize()` symlink'leri çözmez. Bir worker, scope içinde bir symlink oluşturabilir: `docs/audits/escape -> /etc/passwd`.

### Finding #15 — Skill Sandbox: Regex + AST, No Runtime Isolation

**Dosya:** `src/core/marketplace/skill-sandbox.ts:38-49, 77-175`

Skill sandbox iki katmanlı tarama yapıyor:
1. **Regex taraması:** 10 pattern (eval, Function, child_process, fs, process.env, globalThis, Proxy, net)
2. **AST taraması:** TypeScript compiler API ile derin analiz — obfuscated eval, bracket access, dynamic import

Bu, **statik analiz tabanlı bir sandbox** — gerçek runtime izolasyonu değil. Taramadan geçen kod, tam Node.js erişimine sahiptir.

---

## Recommendations (Sprint 133+)

### CRITICAL (Sprint 133)

1. **Plugin hook modül yükleme güvenliği:** `loadHookModule()` çağrılmadan önce hook dosyasını `SkillSandbox.validateSkillSafety()` ile taramamalı. Uzun vadede: hook'ları subprocess veya `isolated-vm` içinde çalıştırın.

2. **npm install `--ignore-scripts` bayrağı:** `installFromNpm()` fonksiyonuna `'--ignore-scripts'` argümanını ekleyin. Bu tek satırlık bir değişiklik, kritik bir supply chain vektörünü kapatır.

### HIGH (Sprint 133-134)

3. **HTTP API tüm endpoint'lere auth:** GET endpoint'lerine de Bearer token doğrulaması ekleyin. Varsayılan: auth aktif, token otomatik üretilsin.

4. **Docker worker scope isolation:** Proje dizinini read-only mount edin, sadece worker'ın scope'undaki dizinleri ayrı read-write mount olarak ekleyin. `~/.claude` mount'unu read-only yapın.

5. **Docker secret injection:** API key'lerini ortam değişkenleri yerine Docker secrets veya tmpfs dosya mount ile aktarın.

6. **Credential encryption:** `CredentialManager`'a AES-256-GCM şifreleme katmanı ekleyin. Uzun vadede: OS keychain entegrasyonu.

7. **`.deck` dosyası `.gitignore` koruması:** `deckent init` sırasında otomatik ekleyin.

### MEDIUM (Sprint 134+)

8. **Symlink çözümleme:** `isWithinScope()` fonksiyonuna `realpathSync` entegrasyonu.

9. **MCP yetkilendirme:** Yıkıcı MCP araçları için ek güvenlik katmanı.

10. **Git clone güvenliği:** `--depth 1 --single-branch --config core.hooksPath=/dev/null` bayrakları.

11. **Runtime skill sandbox:** `isolated-vm` veya subprocess + IPC bazlı gerçek izolasyon.

12. **CORS sıkılaştırma:** Origin kontrolünü sadece dashboard port'uyla sınırlayın.

13. **Dockerfile güvenliği:** Base image pin'leme, CVE tarama, `chmod 777 → 700`.

---

## Context7 References

### OWASP Top 10 2021 Eşleme

| Finding | OWASP | CWE |
|---------|-------|-----|
| #1 Plugin arbitrary code | A08 (Software and Data Integrity Failures) | CWE-502 (Deserialization of Untrusted Data) |
| #2 npm postinstall | A08 (Software and Data Integrity Failures) | CWE-829 (Inclusion of Functionality from Untrusted Control Sphere) |
| #3 GET endpoints no auth | A01 (Broken Access Control) | CWE-862 (Missing Authorization) |
| #4 MCP no auth | A01 (Broken Access Control) | CWE-862 (Missing Authorization) |
| #5 Docker RW mount | A05 (Security Misconfiguration) | CWE-732 (Incorrect Permission Assignment for Critical Resource) |
| #6 Plaintext credentials | A02 (Cryptographic Failures) | CWE-312 (Cleartext Storage of Sensitive Information) |
| #7 Marketplace plaintext | A02 (Cryptographic Failures) | CWE-312 |
| #8 Docker env API keys | A02 (Cryptographic Failures) | CWE-214 (Invocation of Process Using Visible Sensitive Information) |
| #9 .deck git exposure | A02 (Cryptographic Failures) | CWE-540 (Inclusion of Sensitive Information in Source Code) |
| #10 Symlink bypass | A01 (Broken Access Control) | CWE-59 (Improper Link Resolution Before File Access) |
| #13 Path traversal | A03 (Injection) | CWE-22 (Path Traversal) |
| #14 Git clone no validation | A08 (Software and Data Integrity Failures) | CWE-829 |
| #15 Sandbox bypass | A08 (Software and Data Integrity Failures) | CWE-693 (Protection Mechanism Failure) |
| #18 No audit logging | A09 (Security Logging and Monitoring Failures) | CWE-778 (Insufficient Logging) |

### Node.js Security Best Practices (Referanslar)

- **Credential storage:** Node.js Security Cheat Sheet — "Never store secrets in plaintext config files. Use OS keychain (macOS Keychain, GNOME Keyring) or encrypted vaults."
- **Dynamic import security:** "Avoid `import()` with user-controlled paths. Always validate and whitelist module paths."
- **Docker container hardening:** "Run containers as non-root, use read-only rootfs (`--read-only`), drop all capabilities (`--cap-drop ALL`), enable no-new-privileges."
- **npm supply chain:** "Use `--ignore-scripts` for untrusted packages. Audit with `npm audit` before install."
- **File locking:** "Node.js fs does not provide advisory file locking. Use O_EXCL for atomic creation. Consider `proper-lockfile` for robust cross-process locking."
