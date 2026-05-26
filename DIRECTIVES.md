# DIRECTIVES — Sprint 195: Pre-Beta Hardening + Vizyon Kıvılcımı (3 dalga, 4 task + 1 opsiyonel)

## Goal: 1 Haziran 2026 OSS GA beta launch'a 5 gün kala kritik Brain hastalığını tedavi et (sentetik NO_GO 5 kaynağına disk-verify gate), pre-beta hijyeni tamamla (CHANGELOG 30-sprint backfill + ADR-037 V2 disclosure), ve 4-CLI multi-provider vizyonu için models.dev startup wire ile ilk kıvılcımı bırak. Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` Faz 1 cleanup + Faz 2 başlangıç. Sprint 194 kanıtı: Brain dishonest NO_GO + 1633 LoC manuel rescue maliyeti tekrarlanamaz, bu sprint'in 1. task'ı tam olarak bu probleme çözüm.

---

## Tüm task'lar için ortak kurallar

- Worker yalnızca `scope.filesWrite` içine yazar; scope dışına dokunmak yasak (ADR-037 advisory).
- Her task **test ile geçer** — vitest minimum 3 test (mutlu/edge/hata). Doc task'ları test gerektirmez (sadece structure check audit).
- `dosya:satır` kanıtı zorunlu, `.result` notes'una kanıt komutu çıktısı yapıştır.
- ADR ihlali → NO_GO + amendment proposal.
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan; **DB silmek YASAK**.
- Sprint sonu tsc temiz + test regresyon yok.
- **Dishonest result YASAK** — notes'ta iddia edilen LoC delta disk'le çakışmalı (Sprint 194 192-012 dishonest detector aktif).
- **Sprint çalışırken /login, claude logout YASAK** — auth touchpoint silent fail riski ([[feedback_no_auth_touch_during_sprint]]).
- **API mode YASAK** — DIRECTIVES'te `- Auth: api` satırı YOK; tüm task'lar subscription mode default. Tier 1 = 30K tok/min cap, organizasyonu Tier 2'ye yükseltmeden API yolu açılmıyor ([[project_api_mode_deferred_post_beta]]).
- **Karpathy 4-disciplines** zorunlu: Think Before Coding (.plan dosyası), Simplicity First (YAGNI), Surgical Changes (minimum diff), Goal-Driven Execution (her satır goCriteria'ya hizalı).

---

## DALGA 0 — Brain Sentetik NO_GO Disk-Verify Gate (1 task — ZORUNLU İLK)

> **Neden tek başına:** Sprint 191/192/194 kanıtı — Brain `.result` boş gördüğünde sentetik NO_GO yazıyor (filesChanged:[], linesAdded:0), AMA worker disk'te gerçek kod yazmış olabiliyor. Sprint 194'te 1633 LoC manuel rescue gerekti. Bu fix olmadan Sprint 195'in diğer task'ları da risk altında — paradoks gibi görünse de Brain bu task'ı çalıştırırken DA aynı bug etkisi var. Manuel disk-verify ile bu task'ın land etmesini garanti edeceğim.

---

## Task 1: 195-001 — Brain disk-verify gate (sentetik NO_GO 5 kaynak fix, W-INTEGRITY)
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/disk-verify.ts, src/orchestra/result-collector.ts, src/orchestra/honest-gate.ts, src/orchestra/sprint-checkpoint.ts, src/core/task-types.ts, tests/orchestra/disk-verify.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

**Problem (5 sentetik NO_GO yazımı kaynağı, derin keşif 2026-05-26):**

1. `src/orchestra/spawn-backend-docker.ts:330-331` container EXIT trap shell heredoc — `git diff --name-only` dosya sayısı 0 ise sentetik NO_GO JSON yazıyor (LoC delta hesaplamıyor!)
2. `src/orchestra/result-collector.ts:461-484` `.timeout` marker varsa ve `.result` yoksa sentetik NO_GO yazıyor (backend-agnostic)
3. `src/orchestra/honest-gate.ts:160` early return `if (filesChanged.length === 0) return { dishonest: false }` — sentetik NO_GO'da FILES_NOT_TOUCHED/LOC_DELTA_MISMATCH atlanıyor
4. `src/orchestra/sprint-checkpoint.ts:596-607` recovery stale EXECUTING task'lara inline NO_GO writeFileSync (mid-write crash riski)
5. MCP stale config → SPAWN_FAILED → fallback NO_GO (kaynak: result-collector aynı)

**Çözüm — Yeni helper modül + 4 callsite gate:**

1. **`src/orchestra/disk-verify.ts` (YENİ, ~120 LoC):**
   - `verifyDiskAgainstClaim(projectDir, scope)` fonksiyonu — `git diff --numstat HEAD -- ${scope.filesWrite}` çağrısı + `git ls-files --others --exclude-standard -- ${scope.directories}` çağrısı + result aggregate
   - Return: `{ hasDiskEvidence: boolean, linesAdded: number, untrackedFiles: string[] }`
   - Helper'lar test seam için inject edilebilir (`gitDiffNumstatProvider` ve `gitLsOthersProvider` ayrı export)
   - Karpathy D2 (Simplicity First): sadece git çağrısı + parse, başka iş yok

2. **`src/core/task-types.ts` — TaskStatus enum'a ekle:**
   - `MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED'` (Brain disk-verify "kod var ama .result yok" durumunda)

3. **`src/orchestra/result-collector.ts:461-484` öncesi gate:**
   - Sentetik NO_GO yazmadan ÖNCE `verifyDiskAgainstClaim()` çağır
   - Eğer `hasDiskEvidence` → sentetik NO_GO yerine `MANUAL_REVIEW_REQUIRED` status + disk evidence notes
   - audit event emit: `BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH`

4. **`src/orchestra/honest-gate.ts:160` düzelt:**
   - Early return'u kaldır — `filesChanged=[]` durumunda da disk-verify çalışsın
   - Yeni HonestyViolation kodu: `MISSING_RESULT_BUT_DISK_HAS_WORK`

5. **`src/orchestra/sprint-checkpoint.ts:596-607` recovery gate:**
   - Inline NO_GO writeFileSync ÖNCE `verifyDiskAgainstClaim()` çağır
   - Eğer disk'te kod varsa → status `MANUAL_REVIEW_REQUIRED` + recovery log entry

6. **`tests/orchestra/disk-verify.test.ts` (YENİ, ≥12 test):**
   - (a) git diff 0 dosya → hasDiskEvidence: false
   - (b) git diff 100 LoC + 2 dosya → hasDiskEvidence: true, linesAdded: 100
   - (c) untracked dosyalar tespit → untrackedFiles: ['...']
   - (d) scope.filesWrite'ı respect → scope dışı dosyalar yakalanmaz
   - (e) result-collector integration: .timeout + .result yok + disk'te kod → MANUAL_REVIEW_REQUIRED
   - (f) result-collector: .timeout + .result yok + disk'te kod YOK → sentetik NO_GO (eski davranış korunur)
   - (g) honest-gate integration: filesChanged=[] + disk'te kod → MISSING_RESULT_BUT_DISK_HAS_WORK
   - (h) honest-gate: filesChanged=[] + disk boş → {dishonest: false} (eski davranış)
   - (i) sprint-checkpoint recovery: stale EXECUTING + disk'te kod → MANUAL_REVIEW_REQUIRED
   - (j) sprint-checkpoint recovery: stale EXECUTING + disk boş → NO_GO (eski davranış)
   - (k) audit event emit kanal kanıtla
   - (l) edge case: git command fail (sandbox) → fail-open (sentetik NO_GO eski davranış, log warn)

**Kanıt:**
- `grep -n "verifyDiskAgainstClaim" src/orchestra/ | wc -l` → ≥4 callsite
- `grep -n "MANUAL_REVIEW_REQUIRED" src/core/task-types.ts` → 1 match
- `npx vitest run tests/orchestra/disk-verify.test.ts` → 12+ pass
- `npx tsc --noEmit` → clean
- `npx vitest run tests/orchestra/result-evaluator.test.ts tests/orchestra/spawn-backend-docker.test.ts` → no regression (pre-existing 6 fail dışında)

**Test:** ≥12 test (yukarıdaki a-l listesi).

---

## DALGA 1 — Pre-Beta Hijyen (2 task, paralel)

> Sprint 189-194 sonrası dokümantasyon/transparency borçları. Brain 195-001 land ettikten SONRA başlar (scope çakışması yok ama Brain disk-verify gate olmadan diğer task'lar da risk).

---

## Task 2: 195-002 — CHANGELOG Sprint 157-194 backfill scripti
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, documentation-writer
- Files: scripts/changelog-backfill.mjs, docs/CHANGELOG.md
- Scope: scripts/, docs/

### Description

**Problem:** `docs/CHANGELOG.md` son giriş "Sprint 156 (2026-05-12)". Sprint 157-194 = **38 sprint backfill borcu**. Master plan W-A A-2 P0 maddesi. v1.0.0-beta.1 npm publish için CHANGELOG public dokümantasyon.

**Çözüm:**

1. **`scripts/changelog-backfill.mjs` (YENİ, ~120 LoC):**
   - `.brain/memory.db` SQLite'tan `sprint` type entries oku (Sprint 157-194 range)
   - Her sprint için: `sprintId`, `title`, `total tasks`, `DONE count`, `summary` extract
   - `docs/CHANGELOG.md`'a "## [Sprint NNN] - YYYY-MM-DD" format ekle, Added/Changed/Fixed sub-section
   - Sprint task outcome'larından (DONE'ların başlıkları) Added/Changed/Fixed kategorile (heuristic: title'da "feat" → Added, "fix" → Fixed, "refactor" → Changed, default Changed)
   - Script idempotent — mevcut sprint giriş varsa skip
   - CLI: `node scripts/changelog-backfill.mjs --since sprint-157 --until sprint-194`
   - Output: `docs/CHANGELOG.md` updated

2. **Manuel review:** Script'in çıktısı taslak, kullanıcı (Alperen) review ederse manuel düzeltme yapar. Sprint 195'te otomatik wire (sprint-reporter'a entegrasyon) zaten Sprint 189'da landed (`src/orchestra/doc-updaters/changelog.ts`).

**Kanıt:**
- `wc -l docs/CHANGELOG.md` → öncesi ~149 satır, sonrası ≥500 satır (~10 satır per sprint × 38 sprint)
- `grep -c "^## \[Sprint" docs/CHANGELOG.md` → öncesi <10, sonrası ≥38
- `head -5 docs/CHANGELOG.md` → en güncel giriş Sprint 194
- `npx tsc --noEmit` → clean (script `.mjs` ESM, transpile gerekmez)

**Test:** Script structure test (input range → output count) + idempotency test, 3+ test.

---

## Task 3: 195-003 — SECURITY.md ADR-037 V2 disclosure + README pre-beta durumu
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: SECURITY.md, README.md
- Scope: SECURITY.md, README.md

### Description

**Problem:** SECURITY.md'de ADR-037 V1.0 advisory durumu yazılı ama V2 hard-flip tarihi belirsiz. Kullanıcı beta launch öncesi transparent disclosure ister. README'de v1.0.0-beta.1 statu beklentisi.

**Çözüm:**

1. **`SECURITY.md` (~20 satır eklenti):**
   - Mevcut `## ADR-037 Authority Matrix (V1.0 Advisory)` bölümüne ek paragraf:
     - "V2 hard-runtime enforcement is planned for post-GA (target: Sprint 200+, post-2026-06-15). Until then, scope violations are detected via `git diff --stat` audit-trail and emit BRAIN→AUDITOR warning events but do NOT block worker execution."
   - "Known limitations" bölümüne 1 satır: "Symlink resolution within scope enforcement is incomplete (ADR-034 Sprint 132 MEDIUM #10 open). Targeted for V2 alongside ADR-037 hardening."

2. **`README.md` (~10 satır eklenti):**
   - Trinity vision tablosundan sonra "Status" mini-bölüm:
     - "Version: 1.0.0-beta.1 (June 2026 OSS GA)"
     - "Active providers: Claude (Anthropic CLI), Codex (OpenAI CLI), Gemini (Google CLI). Cursor planned post-GA."
     - "Auth: subscription default. API mode opt-in per-task via DIRECTIVES `- Auth: api` (requires Anthropic Tier 2+ for parallel sprints)."

**Kanıt:**
- `grep -A 2 "V2 hard-runtime" SECURITY.md` → 2+ match (1 ana paragraf + 1 known limitation)
- `grep -A 2 "Version: 1.0.0-beta.1" README.md` → 1 match
- `npm run lint:link` → no broken link
- `npm run lint:adr` → no validation error (eğer var lint mevcut)

**Test:** Audit task, kanıt komut çıktıları yeterli. Test dosyası yazılmaz.

---

## DALGA 2 — Vizyon Kıvılcım (1 task)

> 4-CLI multi-provider vizyon ilk somut adımı. models.dev fetch + cache wire'ı %60 hazır, sadece startup bootstrap call eksik. Bu task land ederse provider catalog runtime'da güncel kalır.

---

## Task 4: 195-004 — models.dev bootstrap startup wire
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/entry.ts, src/core/model-catalog.ts, tests/core/model-catalog-bootstrap.test.ts
- Scope: src/cli/, src/core/, tests/core/

### Description

**Problem:** `src/core/model-catalog.ts:407-428` `loadCatalog()` 3-stage fallback hazır (fetch → cache → BUILTIN_MODELS) ama startup'tan çağrılmıyor. `.deckent/provider-cache.json` 145 byte schema-only (gerçek catalog değil). Çatal Kararı #1 (master plan 2026-05-23) gereği runtime fetch + 24h cache.

**Çözüm:**

1. **`src/core/model-catalog.ts` — Eğer `bootstrapFromCatalog()` zaten var değilse oluştur (~20 LoC):**
   - `async function bootstrapFromCatalog(options?: { offline?: boolean, force?: boolean }): Promise<void>`
   - `loadCatalog()` çağır → BUILTIN_MODELS override (ModelRegistry singleton güncelle)
   - Network fail veya offline → silent fallback to BUILTIN_MODELS (mevcut davranış korunur)
   - Idempotent — birden fazla çağrı no-op

2. **`src/cli/entry.ts` startup hook (~5-10 LoC):**
   - `program.hook('preAction', async () => { await bootstrapFromCatalog({ offline: process.env.DECKENT_OFFLINE === '1' }); })`
   - Sadece subcommand çalıştırılmadan önce — `--help`, `--version` için skip
   - Network fail durumunda CLI bloke OLMAZ (5s timeout, mevcut model-catalog.ts içinde)

3. **`tests/core/model-catalog-bootstrap.test.ts` (YENİ, ≥4 test):**
   - (a) fetch başarılı → catalog override
   - (b) fetch fail + cache var → cache kullan
   - (c) fetch fail + cache yok → BUILTIN_MODELS
   - (d) offline:true → fetch skip, cache veya BUILTIN_MODELS

**Kanıt:**
- `grep -n "bootstrapFromCatalog" src/cli/entry.ts src/core/model-catalog.ts` → 2+ match (export + import)
- `DECKENT_OFFLINE=1 npx deckent status` → çalışır, network çağrısı yok
- `npx vitest run tests/core/model-catalog-bootstrap.test.ts` → 4+ pass
- `npx tsc --noEmit` → clean

**Test:** ≥4 test (yukarıdaki a-d).

---

## OPSİYONEL — DALGA 3 (eğer ilk 4 hızlı landerse)

## Task 5: 195-005 (OPSIYONEL) — Dockerfile.worker Codex/Gemini install + sanity guide
- Model: sonnet
- Effort: normal
- Skills: docker-expert, documentation-writer
- Files: Dockerfile.worker, docs/guide/multi-provider.md, tests/docker/worker-image-providers.test.ts
- Scope: Dockerfile.worker, docs/guide/, tests/docker/

### Description

**Önkoşul:** Sprint 195'in ilk 4 task'ı DONE landed. Eğer süre kalırsa.

**Çözüm:**

1. **`Dockerfile.worker:21-22` uncomment + install:**
   ```dockerfile
   RUN npm i -g @openai/codex
   RUN npm i -g @google/gemini-cli
   ```
2. **`docs/guide/multi-provider.md` (YENİ, ~80 satır):**
   - 3-CLI subscription default kullanımı
   - DIRECTIVES'te `- Provider: codex|gemini` opt-in
   - Auth credentials env passthrough açıkla (OPENAI_API_KEY, GOOGLE_API_KEY)
   - Container vs host CLI presence note
3. **`tests/docker/worker-image-providers.test.ts` (YENİ, ≥3 test):**
   - `docker run deckent-worker codex --version` → exit 0
   - `docker run deckent-worker gemini --version` → exit 0
   - `docker run deckent-worker claude --version` → exit 0 (regression)
   - Test skipIf(no docker)

**Kanıt:**
- `docker build -f Dockerfile.worker -t deckent-worker:test .` → success
- `docker run --rm deckent-worker:test sh -c "claude --version && codex --version && gemini --version"` → 3 version output
- Image size delta: `docker image inspect deckent-worker:test --format '{{.Size}}'` öncesi vs sonrası kayıt (notes'a yaz)

**Test:** ≥3 docker integration test (skipIf no docker env).

---

## Sprint Sonu Notu

Bu sprint **1 Haziran 2026 OSS GA beta launch'a 5 gün kala kritik kapanış**:
- Brain dishonest NO_GO 5 kaynak fix → veri/kod kaybı önlenir
- CHANGELOG 38-sprint backfill → npm publish'e hazır public doc
- ADR-037 V2 disclosure + README pre-beta status → transparent communication
- models.dev startup wire → 4-CLI vizyon ilk somut adımı
- (Opsiyonel) Codex/Gemini container install → 3-CLI multi-provider canlı

Beklenen sonuç: 4/4 DONE (zorunlu) + 0-1 opsiyonel. Brain disk-verify gate land ettiği için Sprint 196+ sentetik NO_GO riski büyük ölçüde azalır. Sprint 196 hedefi: beta paketleme + smoke test (Sprint 196-198 timeline 1 Haziran'a yetiştirir).

**Pre-beta uyarı:** Sprint 195 koşulurken /login, claude logout, MCP restart YASAK (running sprint'i kırar). Sprint başlamadan önce subscription credentials canlı doğrulanmış (`~/.claude/.credentials.json` mtime 2026-05-26 11:31, `claude -p` canlı yanıt verdi).

Next (Sprint 196 önizleme): npm publish v1.0.0-beta.1 packaging + Dockerfile.worker image build/push automation + final smoke test + beta announcement materyali.

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — Faz 1 kapanış + Faz 2 başlangıç.
