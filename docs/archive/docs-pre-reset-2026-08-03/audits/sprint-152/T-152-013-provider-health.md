# T-152-013: Provider Health Matrix + Multi-Provider Readiness

**Sprint:** 152 (post-migration read-only audit)
**Date:** 2026-04-24
**Worker:** w-152-013 (docker, opus)
**Scope:** Read-only — no source changes, only evidence gathering + report.

---

## Özet

Post-migration sonrası yalnızca **Claude** sağlayıcısı canlı. OAuth session token `max` subscription ile geçerli ve audit zamanında ~7.8 saat ömrü kalmış (expires 2026-04-24T20:19Z). **Codex ve Gemini CLI'leri hiç yüklü değil**, ilgili `OPENAI_API_KEY` / `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` env var'ları da set değil, `.deck` secret dosyası da mevcut değil. Yani multi-provider USP (ROADMAP §4 Phase 2) **teknik olarak aktif değil** — ne CLI ne API-key ne subscription yolu açık.

`model-registry.ts` 13 model × 3 provider × 4 tier mapping'i **SAĞLAM**: 3 Claude + 6 Codex + 4 Gemini = 13 ✅, tier eşdeğerlik haritaları (opus↔gpt-5↔gemini-2.5-pro; sonnet↔gpt-4.1↔gemini-2.5-flash; haiku↔gpt-5-mini↔gemini-2.0-flash) **getEquivalent()** üzerinden canlı. Config `auth_mode: subscription` + `providers: { brain: claude, worker: claude }`, `fallback_provider` tanımlı **DEĞİL** — bu bir tek-nokta-arıza riskidir.

Rate-limit açısından: `max_workers: 6` mode=performance'da, sistem profili 32 CPU + 30 GB RAM ile `recommendedMaxWorkers: 30` veriyor. 6 worker paralel Claude OAuth session'ında rate-limit yazılım tarafında **hiç throttle/backoff yok** — Claude Max planı beş saatlik sliding window kotasına güveniliyor. Son üç sprint (149/150/151) retro/result dosyalarında 429/rate-limit kaydı **yok**; ancak 12 worker gibi daha yüksek paralellik denenmedi.

---

## Bulgular

### A. Claude CLI Session Auth

- **[PASS]** Claude CLI yüklü — `which claude` → `/usr/local/bin/claude`, `claude --version` → `2.1.119 (Claude Code)`.
- **[PASS]** OAuth credential dosyası mevcut: `~/.claude/.credentials.json` (mode `0600`, sadece node user okuyabiliyor).
- **[PASS]** Subscription: `max`, scope listesi `['user:file_upload', 'user:inference', 'user:mcp_servers', 'user:profile', 'user:sessions:claude_code']` — Claude Code worker spawn için gereken tüm scope'lar açık.
- **[PASS]** Token expiry: `expiresAt=1777061940492` → `2026-04-24T20:19:00.492Z` → audit anında ~**7.79 saat** ömrü kalmış. Sprint 152 beklenen süre 90-150 dk, rahat sığıyor.
- **[PASS]** `refreshToken` var → oturum yenilenebilir, CLI kendi başına yapar.
- **[PASS]** `detectAvailableProviders()` canlı çalıştırıldı, `claude.available=true`, `authMethod='session'` döndü (kanıt: `node -e "..."` çıktısı, raporun altında ekler bölümünde).
- **[DRIFT]** Claude CLI versiyon string'i `"2.1.119 (Claude Code)"` — `formatDetectedProviders()` bunu `v2.1.119 (Claude Code)` olarak basıyor (parantez dahil). İleride semver parse ederken `v2.1.119` kesilmeli. Kozmetik ama `deckent doctor` çıktısında anomali gibi görünüyor.

**Expiry Risk (Sprint 152 için):** düşük. Audit tamamlanma süresi ≤ 150 dk, expiry ~8 saat — tampon yeterli. Sprint 153 başlangıcında Alperen'in Claude CLI'ye yeniden login olması **gerekmeyecek** (refreshToken otomatik rotate eder).

---

### B. Codex (OpenAI) CLI

- **[MISSING]** `which codex` → exit 1, binary yok.
- **[MISSING]** `OPENAI_API_KEY` env var **set değil** (kanıt: `${OPENAI_API_KEY:+YES}${OPENAI_API_KEY:-NO}` = `NO`).
- **[MISSING]** `DECKENT_OPENAI_API_KEY` env var **set değil**; `.deck` dosyası workspace root'ta **yok** (`ls /workspace/.deck` → not found, `ls ~/.deck` → not found).
- **[PASS]** Kod tarafı hazır: `src/providers/codex.ts` 371 LoC, `detectCodex()`, `detectAuthMode()` (api_key | subscription | none), `detectCliVariant()` (rust | node), `createCodexAdapter()` factory, tier mapping (`CODEX_TIER_MODELS`) tümü mevcut.
- **[PASS]** Bootstrap logic: `bootstrapProviders()` Codex'i **unavailable** olarak `skipped` listesine alıyor, default olarak Claude'a düşüyor (`.deckent/provider-cache.json` kanıtı: `"registered":["claude"]`, `"defaultProvider":"claude"`).
- **[FAIL — Sprint 152 için critical-blocker DEĞİL, ama Phase 2 blocker]**  ROADMAP §4 Phase 2 (Sprint 152-160) ve özellikle Sprint 164 "Multi-Provider Freedom" USP'si için Codex aktivasyonu zorunlu; Sprint 152 READ-ONLY audit olduğundan bugün blocker değil. Sprint 153+ activate edilmeli.
- **[DRIFT]** DECKENT.md'deki Codex yönergesi "set `OPENAI_API_KEY`" yazıyor, ama kod aslında `DECKENT_OPENAI_API_KEY` de kabul ediyor (`codex.ts:113`). Doktor/init önerileri ikisini de anmalı.

---

### C. Gemini CLI

- **[MISSING]** `which gemini` → exit 1, binary yok.
- **[MISSING]** `GOOGLE_API_KEY` **set değil**; `DECKENT_GOOGLE_API_KEY` **set değil**.
- **[PASS]** Kod tarafı hazır: `src/providers/gemini.ts` 565 LoC (üç provider içinde en geniş); REST API fallback var (`GEMINI_AUTH_HEADER = 'x-goog-api-key'`, `GEMINI_API_BASE = '.../v1beta/models'`), `parseGeminiOutput()` hem json hem stream-json destekliyor.
- **[PASS]** Registry Gemini'de `premium_plus` tier'a unique model atamış (`gemini-3.1-pro-preview`) — OpenAI o3 ile aynı tier, Claude'da karşılığı **yok** (Claude sadece `premium` tier'a kadar çıkıyor, kayıtlı premium_plus Claude modeli henüz yok).
- **[MISSING]** ROADMAP §8 Phase 2 Sprint 164 "Groq + Fireworks + Together AI" eklenmiş ama **Gemini aktivasyonu hâlâ eksik**. Phase 2 provider-parity için Gemini önce bağlanmalı.

---

### D. model-registry.ts Integrity (ADR Tier Generalization — ADR-023)

| Item | Status | Kanıt |
|------|--------|-------|
| Toplam model | **[PASS]** 13 | `modelRegistry.getAllModels().length === 13` |
| Provider sayısı | **[PASS]** 3 | `modelRegistry.getAllProviders()` → `['claude','codex','gemini']` |
| Tier sayısı | **[PASS]** 4 | `economy`, `standard`, `premium`, `premium_plus` |
| Claude model sayısı | **[PASS]** 3 | opus(premium), sonnet(standard), haiku(economy) |
| Codex model sayısı | **[PASS]** 6 | o3(premium_plus), gpt-5(premium), gpt-4.1(standard), o4-mini(standard), gpt-5-mini(economy), gpt-4.1-mini(economy) |
| Gemini model sayısı | **[PASS]** 4 | gemini-3.1-pro-preview(premium_plus, preview), gemini-2.5-pro(premium), gemini-2.5-flash(standard), gemini-2.0-flash(economy) |
| `premium_plus` üye | **[DRIFT]** 2 | o3 + gemini-3.1-pro-preview. Claude premium_plus eşdeğeri **yok** → tier fallback `premium`'a düşer (`getEquivalent('opus','codex')='gpt-5'`, doğru). |
| Eşdeğerlik: opus → codex | **[PASS]** | `gpt-5` (aynı `premium` tier) |
| Eşdeğerlik: opus → gemini | **[PASS]** | `gemini-2.5-pro` |
| Eşdeğerlik: sonnet → codex | **[PASS]** | `gpt-4.1` |
| Eşdeğerlik: sonnet → gemini | **[PASS]** | `gemini-2.5-flash` |
| Eşdeğerlik: haiku → codex | **[PASS]** | `gpt-5-mini` |
| Eşdeğerlik: haiku → gemini | **[PASS]** | `gemini-2.0-flash` |
| apiId alanı | **[PASS]** tüm modellerde mevcut | opus'un apiId'si **`claude-opus-4-6`** (ancak sistem Opus 4.7'de çalışıyor — aşağıdaki drift'e bak) |
| contextWindow | **[PASS]** opus 1M, sonnet 200K, haiku 200K, gpt-5 1M, gemini-2.5-pro 1M, gemini-3.1-pro-preview 2M |
| costPerMillion | **[PASS]** 13 model için değerler dolu |
| capabilities alanı | **[PASS]** 13 model için 5'li bayrak seti (streaming, toolUse, vision, codeExecution, reasoning) |
| status alanı | **[PASS]** 12 model `ga`, 1 model `preview` (gemini-3.1-pro-preview) |

**[CRITICAL DRIFT — Opus apiId Güncel Değil]:** `model-registry.ts:47` `opus.apiId = 'claude-opus-4-6'` olarak sabit. Ancak IDENTITY.md + Anthropic knowledge güncellemesi Opus 4.7 (`claude-opus-4-7`) kullanılabilir olduğunu söylüyor. CLAUDE.md system prompt de "Opus 4.7: `claude-opus-4-7'" diyor. Bu bir model-registry drift'i — Sprint 153+ aşamasında `resolveApiId('opus')` REST API çağrısı yaparsa Anthropic'e eski ID gönderecek. Claude CLI subscription modunda CLI tarafı mapping yaptığı için bugün sessiz kalıyor, ama `auth_mode: 'api'` yapıldığında kırılabilir.

---

### E. Auth Fallback: Subscription vs API Mode

| Mode | Config Anahtarı | Bugünkü Değer | Davranış |
|------|-----------------|---------------|----------|
| subscription | `auth_mode: 'subscription'` | **AKTİF** | CLI OAuth session kullanılır, ANTHROPIC_API_KEY aranmaz, `.deck` loading **atlanır** (bkz `provider.ts:500-504`) |
| api | `auth_mode: 'api'` | — | `.deck` + env-var zinciri kullanılır, ANTHROPIC_API_KEY zorunlu |
| hybrid | `auth_mode: 'hybrid'` | — | Her iki yol da denenir, .deck override eder |

- **[PASS]** Subscription mode runtime'da aktif (`.deckent/config.json:52` = `"auth_mode": "subscription"`).
- **[MISSING]** `.deck` dosyası yok → `loadDeckSecrets()` boş dönerdi (ama subscription'da hiç çağrılmıyor zaten).
- **[MISSING]** `ANTHROPIC_API_KEY` env var set değil → `auth_mode: 'api'` seçilirse Claude adapter kırılır.
- **[MISSING]** `fallback_provider` config'de tanımlı **değil** (grep kanıtı: sadece eski `.bak` dosyasında geçiyor). Bu şu anlama gelir: Claude provider düşerse `resolveProviderWithFallback()` `ProviderUnavailableError` fırlatır — **tek-nokta-arıza**. Claude session expire olduğunda otomatik fallback YOK.
- **[PASS]** Bootstrap idempotent: `.deckent/provider-cache.json` `configHash: "claude|claude|"` — aynı config tekrar bootstrap edilirken skip eder.

---

### F. Rate Limiting — 6 Worker Paralel Claude CLI Davranışı

**System profili (bugün):**
- 32 CPU thread (AMD Ryzen 9 9950X3D)
- 30.9 GB total mem, 27.2 GB free
- `calcRecommendedMaxWorkers(27160 MB, 32)` → `Math.max(1, Math.min(67, 31, 30))` = **30**
- Bu yazılımsal teorik tavan; pratik ise **Anthropic Max plan sliding-window kota**sıyla sınırlı.

**Config (bugün):**
- `mode: 'performance'` → `max_workers: 6` (ADR-023 sonrası tier generalization ile uyumlu).
- `modes.api.max_workers: 10` (sadece API mode'da önerilen, ANTHROPIC_API_KEY gerekli).

**Kod tarafı:**
- **[PASS]** `resolveMaxWorkersNumeric()` (sprint-utils.ts:103) `"auto"` keyword'ünü `getSystemProfile().recommendedMaxWorkers`'a resolve eder. Mevcut config literal `6` kullanıyor, auto değil.
- **[MISSING]** Claude adapter'ında (`src/providers/claude.ts`, `src/orchestra/tmux.ts`) **rate-limit/throttle/backoff** tek satır yok (grep `rate|429|throttle|backoff` → 0 match). Tüm hız kontrolü Anthropic'in CLI ve API tarafına delege edilmiş durumda.
- **[MISSING]** `src/core/token-counter.ts` mevcut, `usage_tracker` yok. Claude CLI kendi 5-saatlik kota sayacını dahili tutuyor; `deckent doctor` bu sayacı okuyup yazıyor **mu?** — hayır, doctor.ts içinde `usage/5-hour/usage_limit` eşleşmesi yok (sadece "memory usage" pattern'i var).
- **[UNKNOWN — Sprint 153 canlı ölçüm gerek]** Eski WSL'de (2026-04-21 öncesi) default `max_workers: 3` kullanılıyordu → 0 rate-limit raporu var. Yeni donanımda `max_workers: 6` → 6 paralel Claude Code oturumu henüz **canlı sprint'te ölçülmedi** (Sprint 152 bu audit; Sprint 153 first real spawn with 6 workers).

**Risk:** Claude Max planın sliding-window'una 6 paralel worker (her biri opus) aynı anda birkaç milyon token basarsa "Usage limit reached" hatası alınabilir → adapter bunu parse edip ne yapar?

- **[GAP]** Hatalı Claude CLI çıktısı (örn. `Usage limit reached`) `.tasks/task-XXX.result` yazılmadan bırakılırsa Sprint 140 `.result-missing` guard sayesinde **NO_GO** verilir, ama bu **rerun-on-quota-refresh** pattern'i **yok**. Sprint 153+ 6-worker-mode gerçekten kotayı aşarsa Brain otomatik rerun planlamaz.

---

### G. Bootstrap Output (Canlı)

`detectAvailableProviders()` çıktısı (kanıt ekleri bölümüne tam JSON):

```
Providers:
  ✔ claude v2.1.119 (Claude Code) (session) — models: opus, sonnet, haiku
  ✘ codex (not configured) — models: o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini
  ✘ gemini (not configured) — models: gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
```

- **[PASS]** Claude `available=true`, authMethod=`session`.
- **[PASS]** Codex/Gemini `available=false` + adapter registry'ye register edilmiyor (provider-cache "registered":["claude"]).
- **[PASS]** Default provider `claude` — doğru.

---

## Provider Matrisi (Post-Migration 2026-04-24)

| Provider | CLI | Version | Auth | Env-Var | .deck | Registered | Models (GA) | Tier'lar |
|----------|-----|---------|------|---------|-------|------------|-------------|----------|
| **Claude** | ✅ `/usr/local/bin/claude` | 2.1.119 | OAuth session, max plan, 7.79h TTL | ANTHROPIC_API_KEY ❌ | ❌ | ✅ default | opus, sonnet, haiku | premium, standard, economy |
| **Codex** | ❌ not installed | — | none | OPENAI_API_KEY ❌, DECKENT_OPENAI_API_KEY ❌ | ❌ | ❌ skipped | o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini | premium_plus, premium, standard×2, economy×2 |
| **Gemini** | ❌ not installed | — | none | GOOGLE_API_KEY ❌, DECKENT_GOOGLE_API_KEY ❌ | ❌ | ❌ skipped | gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | premium_plus (preview), premium, standard, economy |

---

## Sprint 153+ İçin Aksiyon Listesi

### [P0] — Sprint 153'te yapılmalı

1. **[P0]** `fallback_provider` config'e eklensin — bugün `claude` tek sağlayıcı ve düşerse sprint komple durur. Tercih: `fallback_provider: 'codex'` + Codex aktivasyonu; veya geçici olarak `fallback_provider: 'claude'` ile aynı provider'ı yazıp yazılım tarafı hata mesajını netleştir. Effort: **low** (~30 dk).
2. **[P0]** `model-registry.ts:47` `opus.apiId = 'claude-opus-4-6'` → `'claude-opus-4-7'`. Claude Opus 4.7 resmi versiyonu (system prompt da bunu söylüyor). `auth_mode: 'api'` seçilirse eski model id 404 verir. Effort: **low** (~15 dk), test eklemek kolay.
3. **[P0]** Claude CLI quota-exhaustion guard — `src/providers/claude.ts` worker log'larında `"Usage limit reached"` veya `"429"` pattern'i bulursa `.tasks/task-XXX.result` yerine özel bir `QUOTA_EXHAUSTED` status yazsın; Brain evaluator bu status'u **NO_GO değil, "defer"** olarak işaretleyip otomatik rerun listesine alsın. Effort: **normal** (~2 saat).

### [P1] — Sprint 154-155

4. **[P1]** Codex CLI kurulumu (Rust rewrite veya Node legacy) + `DECKENT_OPENAI_API_KEY` `.deck` dosyasına eklensin. Sprint 164 "Multi-Provider Freedom" USP'si için zorunlu. Effort: **normal** (~1-2 saat CLI install + auth test).
5. **[P1]** Gemini CLI kurulumu + `DECKENT_GOOGLE_API_KEY`. `gemini-3.1-pro-preview` `premium_plus` tier'da eşsiz değer (Claude'da `premium_plus` yok). Effort: **normal**.
6. **[P1]** `deckent doctor` — Codex/Gemini SKIP satırına "opsiyonel, sadece multi-provider için gerekli" açıklaması eklensin. Bugün SKIP kritik hata gibi görünüyor ama değil. Effort: **low**.
7. **[P1]** `.deck` secret file gitignore'a eklensin + `deckent init` örnek `.deck.example` üretsin. Effort: **low**.

### [P2] — Sprint 156+

8. **[P2]** Rate-limit sliding-window gözlemcisi: Claude Max plan 5-saatlik kotayı `deckent status` içinde görüntüleyen basit sayaç. `src/core/usage-tracker.ts` (yeni) + `src/cli/commands/doctor.ts` entegrasyonu. Effort: **normal**.
9. **[P2]** Claude opus `premium_plus` tier eşdeğeri tanımlansın (yeni `claude-opus-5` hayali model, veya `opus-4-reasoning` status=preview). `getEquivalent('o3','claude')` bugün fallback `'opus'` döndürüyor, ama bir tier aşağı — tier-strict mode isteyen kullanıcı için belirsiz. Effort: **low** (sadece registry güncelleme).
10. **[P2]** `formatDetectedProviders()` çıktısında versiyon string'i `"2.1.119 (Claude Code)"` → sadece `"2.1.119"` parse edilsin, parantez kısmı `variant` alanına taşınsın. Effort: **low** (cosmetic).
11. **[P2]** `auth_mode: 'hybrid'` aktivasyon rehberi — hem subscription hem API key varsa hangi yol seçiliyor? Bugün kod `.deck` override > env var > session; bu dokümante edilmeli. Effort: **low** (docs only).

---

## Multi-Provider Activation Roadmap (Sprint 153-164)

| Sprint | Hedef | Kanıt/Blocker |
|--------|-------|---------------|
| **153** | fallback_provider + opus apiId fix + quota guard | P0 üç madde |
| **154** | Codex CLI install + DECKENT_OPENAI_API_KEY .deck ekle + 1 task codex ile spawn testi | Alperen API key almalı |
| **155** | Gemini CLI install + DECKENT_GOOGLE_API_KEY + tier-based routing E2E test | Google API key |
| **156-158** | Multi-provider load balancing (routing V4), cost-aware tier selection | model-registry ready |
| **159** | Groq + Fireworks + Together AI (ROADMAP §8) provider adapter skeleton | yeni adapter scaffold |
| **160** | 3+ provider canlı smoke (`deckent status --providers`), `deckent_doctor` green | Sprint 157 signatures |
| **164** | "Multi-Provider Freedom" USP tam aktif, 5+ provider marketing copy | Phase 2 Sprint 152-160 bitmiş olmalı |

---

## Kanıt Ekleri

### E1. Claude CLI Version
```
$ which claude && claude --version
/usr/local/bin/claude
2.1.119 (Claude Code)
```

### E2. Codex + Gemini Absent
```
$ which codex; echo "---codex-end---"; which gemini; echo "---gemini-end---"
---codex-end---
---gemini-end---
```
(Both `which` exit with code 1, silent output.)

### E3. Env Vars
```
OPENAI_API_KEY_set=NO
GOOGLE_API_KEY_set=NO
ANTHROPIC_API_KEY_set=NO
```

### E4. Claude Credential Fields (non-secret only)
```
keys: [ 'claudeAiOauth' ]
has_access_token: true
has_refresh_token: true
expires_at_ms: 1777061940492
expires_ISO: 2026-04-24T20:19:00.492Z
scopes: [ 'user:file_upload', 'user:inference', 'user:mcp_servers',
         'user:profile', 'user:sessions:claude_code' ]
subscription: max
```

### E5. detectAvailableProviders() Live Output
```json
[
  { "name": "claude", "available": true, "version": "2.1.119 (Claude Code)",
    "authMethod": "session", "models": ["opus","sonnet","haiku"] },
  { "name": "codex", "available": false, "authMethod": "none",
    "models": ["o3","gpt-5","gpt-4.1","o4-mini","gpt-5-mini","gpt-4.1-mini"] },
  { "name": "gemini", "available": false, "authMethod": "none",
    "models": ["gemini-3.1-pro-preview","gemini-2.5-pro","gemini-2.5-flash","gemini-2.0-flash"] }
]
```

### E6. modelRegistry Totals (live)
```
total: 13
providers: [ 'claude', 'codex', 'gemini' ]
claude: opus(premium), sonnet(standard), haiku(economy)
codex: o3(premium_plus), gpt-5(premium), gpt-4.1(standard), o4-mini(standard),
       gpt-5-mini(economy), gpt-4.1-mini(economy)
gemini: gemini-3.1-pro-preview(premium_plus), gemini-2.5-pro(premium),
        gemini-2.5-flash(standard), gemini-2.0-flash(economy)
```

### E7. Tier Equivalence Map (live)
```
opus → codex: gpt-5
opus → gemini: gemini-2.5-pro
sonnet → codex: gpt-4.1
sonnet → gemini: gemini-2.5-flash
haiku → codex: gpt-5-mini
haiku → gemini: gemini-2.0-flash
```

### E8. System Profile (bugün)
```
cpus: 32
totalMemMB: 30906
freeMemMB: 27160
byMem: 67 byCpu: 31
recommendedMaxWorkers: 30
```

### E9. Provider Cache State
```json
{ "registered": ["claude"], "defaultProvider": "claude",
  "cachedAt": "2026-04-24T12:16:29.728Z", "configHash": "claude|claude|" }
```

### E10. Config Excerpts
- `.deckent/config.json:52` → `"auth_mode": "subscription"`
- `.deckent/config.json:47-50` → `"providers": { "brain": "claude", "worker": "claude" }`
- `.deckent/config.json:92` → `"max_workers": 6`
- `"fallback_provider"` anahtarı config'de **YOK** (grep kanıtı).

### E11. Rate-Limit/Throttle Scan
```
$ grep -rE "rate[_-]?limit|rateLimit|429|throttle|backoff" src/providers/claude.ts src/orchestra/tmux.ts
(no matches)
```

---

## Self-Assessment

- Kapsam: CLI versiyon, auth state, env var, `.deck`, model-registry doğruluğu, tier eşdeğerliği, bootstrap output, rate-limit kod taraması, config drift, roadmap activation sırası — **tamamı kapsandı**.
- Kod değişikliği: **yok** (READ-ONLY).
- Kanıt: 11 ek bölümü canlı komut çıktılarıyla belgelendi.
- Eksik: Claude Max planın 5-saatlik sliding-window kotası **canlı ölçülmedi** (Sprint 152 read-only olduğu için). Sprint 153 ilk 6-worker sprint'inde ölçülmeli.

**Sprint 153+ için kritik 3 aksiyon (tekrar, net):**
1. `fallback_provider` config'e eklensin.
2. `model-registry.ts` opus.apiId `claude-opus-4-7`'ye güncellensin.
3. Claude quota-exhausted hata yakalama + auto-defer.
