# DIRECTIVES — Sprint 151: Beta GA Cutover + P0 Residual Debt

> **Sprint tipi:** Beta GA cutover — v1.0.0-beta.1 npm publish + public repo flip + community launch
> **Önceki sprint:** sprint-150 (37/41 DONE, ~1h 20m, 17/20 Beta GA gate açıldı) + Sprint 150A Hot Fix (H1..H7, ~68dk, DECKENT→USER:NOTIFY canlı)
> **Tema:** "Beta GA launch + P0 brain evaluator rubric fix + CLI 49 komut smoke + Docker HB debt final"
> **Toplam task:** 15 (8 roadmap Beta GA cutover + 7 P0 residual debt)
> **Hard cap:** 8h (28800000 ms)
> **Cost cap:** $100 soft alert
> **Planning mode:** structured
> **Hedef:** Çarşamba 22 Nis TRT Beta GA cutover + Show HN launch

## Referanslar (Canonical Anchor)

- **Master Roadmap:** `docs/ROADMAP-GOD-LEVEL.md` (Phase 1 Sprint 151 = Beta GA cutover)
- **Sprint 150 Retro:** `.brain/RETRO.md` (37/41 DONE, 4 NO_GO verification-blind pattern)
- **Hot Fix Memory:** `memory/project_sprint151_preflight_p0_bugs.md` (T-NEW-A/B/C/D detay)
- **Beta Tracker:** `BETA-TRACKER.md` (20-gate exit criteria, 17/20 açık)

## Goal

Sprint 151 Deckent'in **public launch sprint**'i. 15 task = 8 Beta GA cutover + 7 P0 residual debt (Sprint 150 + Hot Fix'ten taşınan).

**Paket 1 — Beta GA Cutover (T-151-001..008):** npm publish + public repo flip + Discord/Telegram bot launch + Show HN + Reddit + Twitter + Discord server + Dev.to post

**Paket 2 — P0 Residual Debt Fix (T-151-NEW-A..G):** Brain evaluator verification-blind + CLI smoke test + Docker HB debt + nervous bridge test + residual vitest fix + MODE_PRESETS consolidate + handoff polish

---

## KRİTİK KURAL — Koordinatör Disiplin

- `src/` müdahale YASAK (Sprint 144-150 lesson)
- `test-writer` agent YASAK (ADR-041)
- `deckent_kill` / `cleanup` / `docker stop` → Alperen açık onayı zorunlu (`feedback_deckent_kill_approval_required`)
- Nervous bridge canlı — sprint-started/task-done/task-no-go/sprint-finalized/human-checkpoint-required event'leri Alperen terminal'ine düşecek (H6 canlı kanıtı var)

---

# PAKET 1 — BETA GA CUTOVER (8 task)

## Task 1: npm publish HAZIRLIK + Alperen Handoff (PUBLISH WORKER TARAFINDAN ÇALIŞTIRILMAZ)

- Model: sonnet
- Effort: normal
- Skills: devops-engineer
- Files: package.json, CHANGELOG.md, docs/release/npm-publish-handoff.md
- Scope: ./, docs/release/

### KRİTİK — npm publish YASAK (feedback_npm_publish_alperen_approval)

> **Worker `npm publish` ÇALIŞTIRAMAZ.** Hiçbir tag, hiçbir versiyon için. Bu task `npm publish` HAZIRLIĞI yapar — Alperen'in elle çalıştıracağı tek komut için gerekli tüm kanıt + checklist'i toplar. Beta öncesi npm publish pipeline'ı tam kapsamlı düzenlenecek (Sprint 152+ candidate). Sebep: irreversible (72h unpublish policy + cache + npx kalıcılığı), brand güvenliği, pipeline reform planı.

### Description

Bu task **hazırlık + handoff dökümantasyonu** üretir. Sprint 151 sonunda Alperen'in elle çalıştıracağı tek komut: `npm publish --access public --tag beta`.

**İzin verilen komutlar (worker):**
- `npm pack --dry-run` (tarball içerik + boyut kontrolü)
- `npm whoami` (Alperen account login check)
- `npm info deckent` (mevcut versiyon kontrolü)
- `cat package.json` (version + publishConfig validation)

**Yasak komutlar (worker):**
- `npm publish` (her form, her tag, her zaman)
- CI auto-publish job ekleme

**Pre-flight checklist (worker üretir):**
1. `npm pack --dry-run` → tarball < 2MB, 0 warning, dosya listesi gizli pattern içermez (`.brain/`, `.deck`, `.deckent/`, `DECKENT-MASTER-BLUEPRINT.md`, `DECKENT-ANA-PLAN-TR.md`, `tests/`, `docs/audits/`)
2. `package.json`:
   - `version: "1.0.0-beta.1"` ✓
   - `publishConfig.access: "public"` ✓
   - `files` whitelist mevcut (gizli sızıntı koruması)
   - `engines.node: ">=18"` ✓
   - `bin` doğru (`deckent` CLI binary path)
3. `npm whoami` → Alperen NPM account onaylı (`alperensartacoglu` veya configured username)
4. CHANGELOG.md v1.0.0-beta.1 section yazılmış (Sprint 150 + Hot Fix bundle özeti)
5. `npm info deckent` → mevcut versiyon kontrolü (deckent paket adı boş veya Alperen'e ait)

**Handoff çıktısı:** `docs/release/npm-publish-handoff.md` — Alperen'in 5 dakika içinde okuyup karar verebileceği rapor:
- Pre-flight checklist (her satır PASS/FAIL + kanıt)
- Tarball içerik özeti (dosya sayısı, MB, gizli pattern raporu)
- "Alperen elle çalıştırması gereken komut: `npm publish --access public --tag beta`"
- Rollback plan (yanlış publish durumunda 72h `npm unpublish` window + alternatif: `npm deprecate`)
- Post-publish doğrulama: `npm info deckent@1.0.0-beta.1 version` + smoke test (`npx deckent@beta init` fresh tmp dir)

**Kanıt (worker):** `docs/release/npm-publish-handoff.md` mevcut + her checklist satırı PASS + tarball boyut/dosya raporu eklenmiş.

**Test:** Worker `npm pack` ile üretilen tarball'ı geçici dizinde extract eder + içerik audit eder (gizli dosya yok, bin executable, README doğru). PASS olduğunda Alperen onayı bekler.

**Alperen'in sırası (sprint sonrası):**
1. `docs/release/npm-publish-handoff.md` oku
2. Checklist tüm yeşil ise → terminalde elle: `npm publish --access public --tag beta`
3. Doğrulama: `npm info deckent@1.0.0-beta.1 version`
4. Smoke test: fresh tmp dir + `npx deckent@beta init`

---

## Task 2: Public Repo Flip — VerhexIO/deckent-dev → VerhexIO/deckent

- Model: sonnet
- Effort: high
- Skills: devops-engineer, git-expert
- Files: scripts/public-repo-sync.sh (T-150-027 hazırladı), .gitignore
- Scope: ./, scripts/

### KRİTİK — git push + visibility flip ALPEREN'İN ELLE ADIMLARI

> **Worker `git push` ÇALIŞTIRAMAZ + repo visibility değiştiremez.** Public flip irreversible (tweet/cache yayılır), `git push origin master` remote etkisi yaratır. Worker rsync + commit yapar, push + UI flip Alperen'in elle adımıdır.

### Description

Public repo açılışı **hazırlık + handoff**. `docs/release/public-repo-manifest.md`'deki exclude listesi uygulanır.

**Worker adımları (otomatik):**
1. `../deckent-public` dizini var mı kontrol (yoksa Alperen elle clone'lar — worker mkdir yapmaz)
2. `scripts/public-repo-sync.sh` rsync ile exclude list uygulanır:
   - Exclude: `.brain/`, `.deckent/`, `.deck`, `DECKENT-MASTER-BLUEPRINT.md`, `DECKENT-ANA-PLAN-TR.md`, `node_modules/`, `dist/`, `.tasks/`, `.locks/`
   - Include: `src/`, `tests/`, `docs/` (audits hariç gizli), `README.md`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`
3. `cd ../deckent-public && git add -A && git commit -m "feat: Deckent v1.0.0-beta.1 public launch"` — **commit OK, push DEĞİL**
4. Worker `git status` + `git log -1` ile commit doğrulaması yapar
5. Worker `docs/release/public-repo-flip-handoff.md` üretir (Alperen handoff)

**Yasak komutlar (worker):**
- `git push` (her remote, her branch)
- `gh repo edit --visibility public` (GitHub CLI ile flip)
- GitHub API çağrısı ile visibility değişikliği

**Alperen elle adımları (sprint sonrası):**
1. `cd ../deckent-public && git log -1` → worker commit'ini doğrula
2. `git push origin master`
3. GitHub UI: Settings → Danger Zone → Change visibility → Public
4. **Doğrulama:** `curl -s https://api.github.com/repos/VerhexIO/deckent | jq '.private'` → `false`

**Handoff çıktısı:** `docs/release/public-repo-flip-handoff.md`:
- Sync özet (kaç dosya kopyalandı, kaç MB, exclude raporu)
- Tarball içerik audit (gizli pattern sızıntısı yok)
- Commit SHA + diff stat
- Alperen elle 4 adımı (push + UI flip + doğrulama)
- Rollback plan (yanlış public flip → private'a geri çevir, ama tweet/cache kalıcı uyarısı)

**Kanıt (worker):** `../deckent-public/.git/refs/heads/master` mevcut + commit doğrulanmış + handoff dökümanı yazılmış.

**Test (Alperen sprint sonrası):** Fresh clone `git clone https://github.com/VerhexIO/deckent.git` + `cd deckent && npm install && npm run build` → 0 error.

---

## Task 3: Dashboard ChatPage.tsx (7. page)

- Model: opus
- Effort: high
- Skills: typescript-expert, react-specialist, frontend-design
- Files: src/dashboard/src/pages/ChatPage.tsx, src/dashboard/src/routes.tsx
- Scope: src/dashboard/

### Description

Dashboard'a 7. page: **Chat** — user Deckent ile konuşabilir (`deckent_style: "task"` mode'da), nervous system notification'ları canlı görür.

**Bileşenler:**
- `ChatInput` — user mesajı gönder (textarea + submit)
- `ChatHistory` — mesaj listesi (user + assistant ayrımı)
- `NotificationPanel` — DECKENT→USER:NOTIFY event stream'den son 10 event (SSE bağlantı `/api/events`)
- `TaskContextSidebar` — `deckent_run` ile başlatılan task'ın canlı status'u

**Route:** `/chat` — `routes.tsx`'e ekle

**Test:** `npx vitest run --config src/dashboard/vitest.config.ts tests/dashboard/chat-page.test.tsx` → 5+ test (input, history render, SSE connect, task launch, notification panel).

---

## Task 4: Discord Bot Deploy + Smoke Test

- Model: sonnet
- Effort: normal
- Skills: devops-engineer, typescript-expert
- Files: scripts/deploy-discord.sh, docs/launch/discord-bot-setup.md
- Scope: scripts/, docs/launch/

### Description

Alperen Discord app create (Deckent Community server), bot token `.deck` file'a yazacak. Deploy script ile bot canlıya alınır.

**Adımlar:**
1. Alperen: Discord Developer Portal'dan bot create, token al
2. Alperen: `.deck` dosyasına `DISCORD_TOKEN=xxx` ekler
3. Config: `.deckent/config.json` `connectors.discord.enabled: true, connectors.discord.token: "$DECK:DISCORD_TOKEN"`
4. `node scripts/deploy-discord.sh` — bot başlat, `!deckent status` komut test

**Smoke test:**
- Bot online görünmeli
- `!deckent help` → komut listesi
- Kullanıcıdan mesaj → incoming-router → nervous system event

**Kanıt:** Discord server'da canlı bot + 1 smoke test mesajı Discord log'larında.

---

## Task 5: Telegram Bot Deploy + Smoke Test

- Model: sonnet
- Effort: normal
- Skills: devops-engineer, typescript-expert
- Files: scripts/deploy-telegram.sh, docs/launch/telegram-bot-setup.md
- Scope: scripts/, docs/launch/

### Description

Aynı Discord gibi ama Telegram (@BotFather ile bot create, token `.deck`).

**Smoke test:**
- `/start` — karşılama mesajı
- `/status` — current sprint status
- `/help` — komut listesi

**Kanıt:** `@deckent_bot` (veya user name) Telegram'da canlı + 1 smoke test.

---

## Task 6: Show HN + Reddit + Twitter Announce Hazırlığı

- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: docs/launch/announce-hn.md, docs/launch/announce-reddit.md, docs/launch/announce-twitter-thread.md
- Scope: docs/launch/

### Description

Launch kanalı başına draft hazırla:

1. **Show HN post** (~200 kelime):
   - Title: "Show HN: Deckent — Open source AI orchestrator with sprint discipline + nervous system"
   - Body: tagline + USPs + 148 sprint battle-tested + solo dev + repo link + npm install komut

2. **Reddit posts** (r/LocalLLaMA, r/programming, r/opensource):
   - Her subreddit'e uygun ton (LocalLLaMA technical, programming developer-focused, opensource community-focused)

3. **Twitter thread** (10 tweet):
   - 1/ Tagline
   - 2-4/ Problem (OpenClaw gap)
   - 5-7/ USPs (Sprint + Nervous + AST)
   - 8/ Demo GIF/screenshot
   - 9/ Repo link
   - 10/ CTA (star + install)

**Ton:** Alperen brand — Türk dev community + developer-first + mütevazı solo dev hikayesi.

**Kanıt:** 3 draft dosya + Alperen review + yayın zamanı planlandı.

---

## Task 7: Discord Server Launch + Initial Channel Structure

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/launch/discord-server-setup.md, docs/launch/CONDUCT.md
- Scope: docs/launch/

### Description

**Alperen: Discord server create** (Deckent Community).

**Kanal yapısı:**
- 📢 `#announcements` — Alperen + moderator
- 💬 `#general` — community talk
- 🐛 `#bug-reports` — issue triage
- 🔧 `#help` — user questions
- 🎨 `#skill-showcase` — hub skill'leri showcase
- 🤖 `#deckent-bot` — bot commands + events

**Moderation:** CONDUCT.md (kod benim olsa değiştirmem, standard OSS) + temel roller (admin, moderator, contributor, user).

**Kanıt:** Server invite link, 6 kanal, roller set.

---

## Task 8: Dev.to + Hashnode Long-Form Post

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/launch/blog-devto-launch.md, docs/launch/blog-hashnode-launch.md
- Scope: docs/launch/

### Description

2 platform için ~1500 kelime long-form post:

**İçerik:**
1. Hook: "I built an AI orchestrator over 150 sprints — here's what I learned"
2. Problem: OpenClaw gap (%20 malicious skill, no sprint discipline)
3. Journey: solo dev, 6 ay Deckent yolculuğu, Memory V2 SQLite FTS5, AST sandbox, nervous system
4. Technical highlights: 3-layer config, event stream ADR-035, RBAC authority matrix, Hibrit retention
5. Result: v1.0.0-beta.1 open source launch
6. Call to action: install, star, skill publish

**Kanıt:** 2 draft + yayın zamanı (launch day T+2 saat).

---

# PAKET 2 — P0 RESIDUAL DEBT (7 task)

## Task 9 (T-151-NEW-A): DECKENT→USER:NOTIFY Runtime Smoke Test + Nervous Bridge E2E

- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/e2e/notify-sprint-lifecycle.test.ts (NEW), tests/e2e/nervous-bridge-delivery.test.ts (NEW)
- Scope: tests/e2e/

### Description

Hot Fix H6 canlı wire yaptı ama **E2E test eksik**. Alperen'in direktifi: "nervous sistemi test edelim".

**Test 1 — Sprint Lifecycle (`tests/e2e/notify-sprint-lifecycle.test.ts`):**
- Küçük 1-task sprint başlat (mock)
- 5 event sırayla görünmeli: sprint-started → task-done → sprint-finalized (veya task-no-go)
- Her event için: event stream `DECKENT→USER:NOTIFY` channel + dispatcher.dispatch çağrısı + adapter.send çağrısı (mock)

**Test 2 — Nervous Bridge (`tests/e2e/nervous-bridge-delivery.test.ts`):**
- Mock NervousNotification push (severity=critical, action=required)
- NervousDispatcher.dispatch çağrılır → bridgeToUserNotify paralel fire
- Assert: DECKENT→USER:NOTIFY event emit + human-checkpoint-required name

**Kanıt:** 2 e2e test file + 10+ test, `npx vitest run tests/e2e/notify-*.test.ts` PASS.

**Test:** Manuel ek — Sprint 151 sırasında sprint-started notification Alperen terminal'inde görünmeli (canlı kanıt log'da).

---

## Task 10 (T-151-NEW-B): CLI buildProgram Smoke Test Harness

- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: tests/cli/buildProgram-smoke.test.ts (NEW), scripts/cli-smoke-test.sh (NEW)
- Scope: tests/cli/, scripts/

### Description

Sprint 149 T-149-019 CLI publish duplicate regression nedeniyle 49 komut broken oldu. Bir daha olmasın diye CI-level smoke test harness.

**`tests/cli/buildProgram-smoke.test.ts`:**
```typescript
import { buildProgram } from '../../src/cli/index.js';

describe('buildProgram smoke', () => {
  it('does not throw on commander register', () => {
    expect(() => buildProgram()).not.toThrow();
  });

  it('registers all 49 commands without duplicates', () => {
    const program = buildProgram();
    const commands = program.commands.map(c => c.name());
    const duplicates = commands.filter((c, i) => commands.indexOf(c) !== i);
    expect(duplicates).toEqual([]);
    expect(commands.length).toBeGreaterThanOrEqual(49);
  });
});
```

**`scripts/cli-smoke-test.sh`:**
- `npx deckent --help` exit 0
- Her top-level command için `npx deckent <cmd> --help` exit 0
- Output: JSON rapor, CI fail trigger

**Kanıt:** Test PASS + script exit 0 + CI workflow (`.github/workflows/cli-smoke.yml`) tetikleme.

---

## Task 11 (T-151-NEW-C): 49 CLI Komut Tam Envanter + Smoke

- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer
- Files: docs/reference/cli-commands.md (NEW), tests/cli/cli-inventory.test.ts (NEW)
- Scope: docs/reference/, tests/cli/

### Description

Alperen direktifi: "tüm cli komutlarına tektek analiz çalışağıcaz"

**`docs/reference/cli-commands.md`:**
- 49 CLI komut envanteri (otomatik `buildProgram().commands` parse)
- Her komut için: name + description + options + example usage + related MCP tool (ADR-022-V2 parity)

**`tests/cli/cli-inventory.test.ts`:**
- 49 komut × 3 test senaryo = 147 smoke test
  - `--help` exit 0
  - Invalid arg → error (graceful fail, 0 crash)
  - Basic happy path (env-independent)

**Kanıt:** Inventory md 49 komut listelenmiş + ~147 test PASS.

---

## Task 12 (T-151-NEW-D): Brain Evaluator 5-in-1 Fix

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/orchestra/result-evaluator.ts, src/orchestra/quality-assessor.ts, src/agents/worker.ts, tests/orchestra/evaluator-*.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description

Sprint 150 retro'da keşfedilen 5 Brain evaluator bug'ını tek task'ta fix:

**D-1: Verification-task recognition**
- `filesChanged: []` + `testsPassed: true` + "already implemented" keyword → DONE (şu an NO_GO veriliyor)
- Heuristic: description içinde "verify", "Sprint N'de yapıldı", "already implemented" fuzzy match → verification task işareti

**D-2: Worker result schema enforcement**
- Worker template `src/agents/worker.ts` → `rubricScores`, `evaluationDecision`, `coverage` alanları zorunlu yaz
- Brain validator reject'e — eksik schema result → NO_GO gerekçesi "schema violation"

**D-3: FIX task context enrichment**
- `reason: "Task X evaluated as NO_GO"` generic → somut: "rubric.scope_compliance=0 (hedef ≥50), filesChanged empty ama description verification task değildi"
- FIX worker'a somut hata verilir, döngü kırılır

**D-4: Global build inheritance fix**
- Sprint ortası TSC fail → rubric düşüşü race condition
- Çözüm: `scope_compliance` hesaplarken **task'ın kendi dosyaları** için `tsc` check (worker scope filter), global state göz ardı
- Alternatif: Sprint-final snapshot TSC re-check

**D-5: Scope compliance heuristic relaxation**
- T-007/T-009 scope=0 pattern: worker `docs/`, `.deckent/` gibi OPSIONEL dosyalara dokundu diye 0
- Heuristic: whitelist `docs/**`, `.deckent/**` — scope dışı ama TASK INTENT ile tutarlı ise -20 puan (0 yerine 80)

**Test:** `tests/orchestra/evaluator-verification-task.test.ts` + `evaluator-schema.test.ts` + `evaluator-fix-context.test.ts` + `evaluator-scope-heuristic.test.ts` = 15+ test.

---

## Task 13 (T-151-NEW-E): Vitest 9 Residual Fail Fix

- Model: sonnet
- Effort: normal
- Skills: testing-expert, typescript-expert
- Files: tests/core/config-sprint064.test.ts, tests/integration/sprint-044-modules.test.ts, tests/core/error-handling-unification.test.ts, tests/core/error-registry-lint.test.ts
- Scope: tests/

### Description

Hot Fix H2 sonrası 9 residual fail:

- **5 fail** → H3 scope carry: `claude_backend` field removal test'leri (config-sprint064 + sprint-044-modules roundtrip) → `toHaveProperty('claude_backend')` assertion kaldır veya `not.toHaveProperty` yap
- **3 fail** → `task-mode-runner.ts` bare `throw new Error` whitelist (error-handling-unification + error-registry-lint): `ErrorRegistry.createError('DECKENT_E058_TASK_MODE_STYLE_MISMATCH', ...)` ile değiştir
- **1 fail** → `docker-backend concurrent task IDs` flaky race: `{ retry: 2 }` annotation veya `describe.serial`

**Hedef:** vitest 15720/15728 pass = %99.95 (şu an %99.94)

**Kanıt:** `npx vitest run 2>&1 | tail -5` → `0 failed | 15720+ passed`

---

## Task 14 (T-151-NEW-F): Docker HB + Vitest Timeout Nihai Fix (3-Sprint Debt Final)

- Model: opus
- Effort: high
- Skills: docker-expert, typescript-expert, testing-expert
- Files: src/orchestra/spawn-backend-docker.ts, src/agents/worker.sh, tests/docker/, tests/e2e/
- Scope: src/orchestra/, src/agents/, tests/

### Description

Sprint 146-148-150 boyunca Docker HB exit pattern + vitest subprocess timeout debt'i 3 sprint'tir sürüyor. Sprint 150 T-150-007 + H2 kısmi fix yaptı (timeout unhandled error kayboldu) ama kök neden tam çözülmedi.

**Kök neden 3 katman:**
1. **OOM kill path:** Container SIGKILL → `cleanup_result` trap çalışmıyor (SIGKILL untrappable)
2. **Partial write:** `.result` yazım sırasında kesilirse JSON corrupt
3. **Parent stdout buffer:** Subprocess `console.log` parent tarafından drain edilmeden container biterse output kaybı

**Fix plan:**
- **`worker.sh` EXIT trap + PRE_EXIT sync write:** Her file.ts değişikliğinde intermediate `.partial-result` yaz, EXIT trap'ta rename. OOM kill'de partial kalır → brain "NO_GO partial" olarak tanır (başlıca "result missing" ≠ "result corrupt")
- **`spawn-backend-docker.ts` graceful shutdown:** Container stop: SIGTERM → 15s grace → SIGKILL. Grace süresi konfigüre edilebilir (`docker_graceful_timeout_s: 15`)
- **Parent drain:** Container biterse parent `docker logs` + timeout 5s read → stdout korunur
- **Test:** E2E OOM reproducer (mem cap 100MB + infinite loop allocate) → .result NO_GO partial görünür.

**Kanıt:** `tests/e2e/docker-oom-reproducer.test.ts` PASS + Sprint 151 canlı Docker backend 0 timeout unhandled error.

---

## Task 15 (T-151-NEW-G): Nervous System 6-10 Detector Activation (Sprint 147 Plan)

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Files: src/nervous/detectors/*.ts (5 new), src/nervous/detector-registry.ts
- Scope: src/nervous/

### Description

Alperen direktifi: "nervous sistemi sürekli bildirim verecek şekilde". Şu an 5 detector aktif (idle, agent-routing-health, task-mode-idle, ..., ...). Sprint 147 plan'ında 6-10 detector eklenmesi planlandı:

**5 yeni detector:**
1. **BuildFailureRecurrence** — son N sprint'te tsc fail eden dosyalar → "dikkat: X dosyası 3 sprint üstüste fail" warning
2. **TokenSpikeDetector** — sprint cost > 2x ortalama → cost-guard alert (Sprint 140 $42 disaster muhafızı)
3. **AgentRoutingAnomaly** — aynı agent > 80% task alıyorsa (Sprint 147 test-writer 22/22 pattern) → ADR-041 enforce warning
4. **ScopeCollisionRate** — auditor'dan > 10 collision/sprint → planner refactor öneri
5. **NotificationDeliveryHealth** — H6 wire canlı, ama her notification adapter.send() başarısızsa → "nervous bridge broken" alert

**Detector interface:** `src/core/nervous-types.ts` zaten tanımlı (DetectorContext, DetectorResult).

**Test:** Her detector 3 test (positive, negative, edge) = 15 test.

**Kanıt:** `deckent nervous status` → 10 detector listelenmeli + Sprint 151 canlı en az 1 detector event emit.

---

# BAĞIMLILIK ZİNCİRİ

```
Wave 1 (paralel): T-151-001 (npm publish) + T-151-009 (notify e2e) + T-151-010 (CLI smoke harness)
Wave 2 (paralel): T-151-002 (public flip) + T-151-012 (evaluator fix) + T-151-013 (vitest residual)
Wave 3 (paralel): T-151-003 (ChatPage) + T-151-011 (CLI inventory) + T-151-014 (Docker HB final)
Wave 4 (paralel): T-151-004 (Discord) + T-151-005 (Telegram) + T-151-015 (detectors)
Wave 5 (paralel): T-151-006 (announce) + T-151-007 (Discord server) + T-151-008 (blog posts)
```

**Kritik bağımlılıklar:**
- T-151-001 (npm publish) ÖNCE → T-151-002 (public flip) npm'de kod varken daha iyi
- T-151-012 (evaluator fix) Sprint 151 SRPINT ORTASINDA canlı (kendi sprint'inde test edilir)
- T-151-004/005 Discord+Telegram sonunda (Alperen bot token setup)

---

# SPRINT 151 EXIT GATE

1. **tsc --noEmit 0 error** ✅
2. **vitest ≥ %99.95 pass** (9 → 0 fail hedef)
3. **npm publish v1.0.0-beta.1 CANLI** (`npm info deckent@beta` döner)
4. **Public repo flip DONE** (`https://github.com/VerhexIO/deckent` public erişilebilir)
5. **49 CLI komut smoke PASS** (buildProgram test + cli-inventory test)
6. **Discord+Telegram bot canlı** (smoke test kanıt)
7. **DECKENT→USER:NOTIFY E2E test PASS** (nervous bridge E2E)
8. **Brain Evaluator 5-in-1 fix DONE** (15+ test + Sprint 151 kendi NO_GO rate ≤ 2)
9. **Docker HB 3-sprint debt kapalı** (E2E OOM reproducer PASS)
10. **10 nervous detector aktif** (5 → 10)
11. **Beta GA Exit Gate 20/20** (coverage #3 + messaging #13 + hub #15 — hepsi bu sprint'te tamamlanır)
12. **Launch kanalları hazır** (Show HN + Reddit + Twitter + Discord server + Dev.to)

# FALLBACK

Katastrofik fail (< %60 completion):
- Sprint 151 archive, Sprint 152 re-run
- Beta GA cutover Perşembe 23 Nis'e kayar (1 gün gecikme kabul)

---

**Oluşturan:** Koordinatör (2026-04-22 Sprint 151 öncesi, Sprint 150 retro + Hot Fix 13 meta-dogfood + Alperen roadmap direktifi)
**Baseline:** Sprint 150A Hot Fix sonrası sağlam Deckent + Beta GA 17/20 gate açık + DECKENT→USER:NOTIFY canlı
**İlk komut:** `deckent_plan mode: 'structured'` — Alperen onayı bekliyor
