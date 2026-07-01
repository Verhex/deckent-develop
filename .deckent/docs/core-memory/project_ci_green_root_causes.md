---
name: project_ci_green_root_causes
description: "Aylardır kırık CI Sprint 214'te yeşertildi. Kök neden ailesi: green-local ≠ green-CI (non-hermetic testler + 2-core teardown RPC starvation). 8 fix deseni — gelecekte CI kırılırsa ilk buraya bak."
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Sprint 214 (2026-06-01): GitHub Actions CI aylardır kırmızıydı; lokal `vitest run` 0-fail olduğu için fark edilmiyordu. "coverage report + build'e asla ilerlemiyor" — çünkü test job'ları + Coverage job exit-1 veriyordu. **Tüm kök neden ailesi: green-local ≠ green-CI.** 8 fix ile tam yeşil oldu (commit zinciri `5d7ab9d0..b67c000`).

**Desen A — Non-hermetic testler (gitignored lokal state'e bağımlı):** CI fresh-checkout'ta `.deckent/config.json` ve `.brain/memory.db` YOK (gitignored), dev makinede VAR → lokal pass, CI ENOENT/null fail.
- `spawn-backend-docker.test.ts` + `nervous-faz1-smoke.test.ts`: live `.deckent/config.json` okuyordu → **skip-if-absent** (try/catch + `describe.skipIf`/`ctx.skip()`; collection-time okuma da fail eder → describe-skipIf şart).
- `tools.test.ts` deckent_retro: Memory V2'ye geçmiş (MemoryStore/memory.db), eski `readFileSync` mock'u ölüydü → **MemoryStore mock**.

**Desen B — Kırılgan assertion:** `task-builder-skill.test.ts` section-boundary (`split('\n=== ')`) env'e göre kayıyordu (`===3000`→`>=3000`).

**Desen C — Blocking subprocess worker'ı donduruyor (EN SIK NÜKSEDEN):** Bir testte `execSync`/`spawnSync` ile 60s+ süren subprocess (build/pack/script) → vitest worker event-loop'u tüm o süre BLOKE → worker→main `onTaskUpdate` RPC heartbeat servis edilemez → birpc **~60s default timeout**'ta (vitest user-config'i ile AYARLANAMAZ; main tarafı `timeout:0`, worker default) abort → "Timeout calling onTaskUpdate" → **tüm testler PASS olsa bile exit 1**. Fix: **async `spawn`** + await (CLAUDE.md hermetiklik). DİSKRİMİNATÖR: fail eden dosyanın süresi ~60000ms'e dayanır (örn. scripts.test.ts 60041ms). `maxForks=1` BU SORUNU ÇÖZMEZ (boş çekirdek bırakır ama event-loop yine bloke → contention DEĞİL, blocking-call). Coverage job'unu da vurur (flaky, coverage instrumentation süreyi 60s üstüne iter) → docs+scripts deterministik + coverage flaky AYNI kök. **Nüks tarihçesi:** Sprint 214 dead-code-audit (spawnSync→async); 2026-06-06 scripts.test.ts kaçırılmıştı (`execSync('npm run build')`) → async'e çevrildi (commit 90594fff). Her execSync/spawnSync'li test dosyasında ağır-op TARA (`grep -lE 'execSync|spawnSync' tests/`).

**Desen D — Coverage teardown RPC starvation (asıl Coverage-job blocker'ı):** Tüm testler PASS ama bitişte her fork v8-coverage'ı main'e serialize ederken **2-core runner**'da yarışıp teardown RPC starve → exit 1. Fix: `vitest.config.ts` → `pool:'forks'` + `poolOptions.forks.maxForks: process.env.CI ? 2 : undefined` + `teardownTimeout: 30000`. (Lokal full parallelism korunur.)

**Desen E — Docs dead-link:** vitepress `ignoreDeadLinks:false` + yeni doc'lar `srcExclude`'lu (architecture/development) veya repo-root (SECURITY/DECKENT) sayfalara link → 7 dead-link build-fail. Fix: in-docs hedefler absolute-path, dışı GitHub URL (external link kontrol edilmez).

**How to apply:** CI kırılırsa `gh run view <id> --log-failed` → fail dosyasını LOKAL çalıştır (pass ederse non-hermetic, Desen A). Coverage-job teardown timeout = Desen D. **Kalıcı çözüm (Sprint 215):** `npm run test:ci-sim` (clean-state lokal run, CI'yi taklit) + CI-hermeticity lint (test gitignored state okumasın) + ci-guardian/ci-testing routing.

---

**2026-06-28 — İKİNCİ büyük "aylardır kırık" turu (commit zinciri `19279732..e35e313c`, 16/16 job + 4 workflow yeşil).** Kök-neden bu sefer FARKLI ve hepsini maskeliyordu:

**Desen F — package-lock.json drift = `npm ci` EUSAGE (BU TURUN ASIL KÖKÜ):** package.json ≠ package-lock.json (openai+transitive deps eksikti) → HER job'ın `npm ci`'ı patlıyor → testler HİÇ koşmuyor → ~48 latent failure görünmüyor. Fix: `npm install --package-lock-only` ile sync. **Prevention (kalıcı):** ci.yml'e **`lockfile-sync` guard job** eklendi (ilk+hızlı koşar, `npm install --package-lock-only` + `git diff --exit-code package-lock.json` → drift'i kriptik EUSAGE yerine actionable mesaja çevirir). Lock fix'lenince alttaki ~48 failure yüzeye çıktı (aylarca birikmiş test-rot + bir önceki kampanyanın revert'leri).

**Desen G — `process.exit(0)` piped-stdout'u truncate eder:** `dead-code-audit.mjs` --json 150KB+ stdout üretip sonra `process.exit(0)` → son pipe-buffer flush edilmeden process ölüyor (dosya-redirect çalışır, PIPE truncate olur) → test JSON `summary` tail'ini kaçırıp fail. Fix: `process.exit(0)` → `process.exitCode = 0` (event-loop stdout'u drain etsin). DİSKRİMİNATÖR: doğrudan-koşu dosyaya tam, ama test-spawn capture eksik byte (`len < file bytes`).

**Desen H — coverage-only test gerçek process leak'i (sadece Coverage'da patlar):** `tests/nervous/`, `tests/backends/`, `tests/extensions/`, `tests/unit/`, `tests/e2e/` HİÇBİR sharded job'da yok (test-core/orchestra/cli/remaining path'lerinde değil) → SADECE Coverage full-suite'te koşar. `gate-w2-lethal.test.ts` non-lethal guard testleri gerçek `SubprocessSpawnBackend.spawn('claude')` tetikliyordu → CI'da `spawn claude ENOENT` **async** (sync try/catch kaçırır) → "Unhandled Error" → 1709 dosya PASS + threshold OK olsa bile vitest exit 1 ("Errors: N errors"). Fix: `SubprocessSpawnBackend`'i subclass-no-op-spawn mock'la (guard wrapper'da, ayrı → korunur). KURAL: coverage exit-1 + 0 test-fail + threshold-OK → log'da **"Vitest caught N unhandled errors"** ara (Desen D'nin teardown-RPC'sinden farklı).

**Desen I — Coverage job dist-bağımlı e2e için `build:all` ister:** Coverage full-suite `npm-pack-smoke` (dist/cli/entry + mcp/server + **dist/dashboard/index.html** tarball assert) + `cli-bin-invocation` (skip-if-no-dist) içerir. CI fresh-checkout'ta dist YOK → fail. Fix: coverage job'a `npm install --prefix src/dashboard` + **`npm run build:all`** (sadece `build` dashboard üretmez; lokalde `clean` stale dist/dashboard'ı koruduğu için yanıltıcı geçer).

**Desen J — untracked dosya + committed-referans = CI dead-link:** `adr/README.md` regenerate edildi (ADR-093'ü indeksler) ama `093-*.md` **untracked** → diskte var (lokal vitepress build geçer), CI fresh-checkout'ta yok → dead-link fail. KURAL: doc regenerate sonrası `git status docs/` ile referans-edilen yeni dosyalar tracked mı doğrula.

**Desen K — orchestra 26.x flaky-timeout:** vitest-subprocess spawn'lı test (C-04 `defaultRunVitestScopeCheck`) 10s default-timeout'u 26.x runner CI-yükünde aşar (24.x geçer). Fix: o teste `}, 60_000)`.

İlgili: [[project_test_home_leak]] (aynı aile), [[feedback_wiring_pct_vs_user_working]] (green-local≠çalışan), [[feedback_trust_brain_eval_not_worker]], [[feedback_vitest_16gb_local_cap]] (lokal full-suite OOM/WSL-crash).
