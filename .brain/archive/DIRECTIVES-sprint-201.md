# DIRECTIVES — Sprint 201: Product Polish — Public Hazırlık (3 dalga, 6 task)

## Goal: deckent'in public OSS reposuna (VerhexIO/deckent) taşınmasından ÖNCE iki ön-koşulu kapat: (1) **deckent son haliyle canlı çalışsın** — bu sprint'in kendisi dogfood kanıtıdır (container-path gate + disk-verify + subscription mode tümü canlı koşar), (2) **public-yüz içerikleri elden geçir** — README + user docs (guide/reference) kullanıcıya göre düzenlensin, W-H doc-drift long-tail kapansın, develop→ürün yayın otomasyonu kurulsun. Sprint sonunda deckent "çalışıyor + vitrin temiz" kanıtlanmış olur.

Bağlam:
- Repo taşıma duraklatıldı: `VerhexIO/deckent` PRIVATE yapıldı (içerik korundu, hazır olunca public). Ön-koşul: çalıştır + içerik düzenle.
- `deckent-develop` = geliştirme reposu (tam history), `deckent` = ürün reposu (temiz snapshot) — ADR'leştirilecek konumlandırma.
- Bu sprint deckent dogfood ile koşar (subscription) → aynı zamanda "deckent son haliyle çalışıyor mu" ön-koşulunu canlı test eder.
- Baseline 28 fail (Sprint 200), artmasın.

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — API mode YASAK ([[project_api_mode_deferred_post_beta]]). Sprint `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY` ile başlatılır.
- Worker yalnızca scope.filesWrite içine yazar (ADR-037 + honest-gate)
- **Host-facing config'lere `/workspace` mutlak yolu YAZMA** — `$CLAUDE_PROJECT_DIR` kullan (Sprint 200 container-path gate aktif, ihlali otomatik düzeltir ama prompt-disiplini önce gelir)
- Her kod task'ı vitest minimum 4 test (mutlu/edge/hata/regresyon); doc task'ı 3 test yeterli (yapı + içerik + link check)
- `dosya:satır` kanıtı zorunlu, `.result` notes'una kanıt komutu çıktısı yapıştır
- Sprint sonu `npx tsc --noEmit` temiz + test regresyon yok (28 baseline, artmasın)
- **Dishonest result YASAK** — linesAdded claim disk'le çakışmalı ([[feedback_trust_brain_eval_not_worker]])
- Sprint çalışırken /login, claude logout, MCP restart YASAK ([[feedback_no_auth_touch_during_sprint]])
- Karpathy 4-disipline: `.plan` first, YAGNI, surgical, goal-driven

---

## DALGA 0 — Public-Yüz İçerik (2 task, paralel)

## Task 1: 201-001 — README + landing içerik kullanıcı-dostu elden geçirme
- Model: opus
- Effort: normal
- Skills: documentation-writer, typescript-expert
- Files: README.md, README-TR.md, docs/index.md, docs/guide/getting-started.md, docs/guide/installation.md, docs/guide/quickstart.md, tests/docs/readme-quality.test.ts
- Scope: docs/, tests/docs/

### Description
**Amaç:** Public OSS'ye giden README + landing'i ilk-izlenim kalitesine çıkar. Şu an 306 satır, yapı iyi (Quickstart/How It Works/Multi-Provider) ama public-launch için netlik gerekli.

**Çözüm:**
1. **README.md** gözden geçir:
   - İlk 30 satır: deckent nedir → 1 cümle değer önermesi + 1 GIF/komut örneği + npm install
   - "Quickstart" bloğu copy-paste çalışır mı kontrol et (`npm i -g deckent` → `deckent init` → `deckent start`)
   - Badge'ler doğru repo (`VerhexIO/deckent`) gösteriyor (zaten ✓, doğrula)
   - Broken internal link YOK (silinen docs/superpowers, docs/launch'a referans varsa temizle)
2. **README-TR.md** paralel güncelle (TR/EN parity)
3. **docs/index.md** (VitePress landing) README ile tutarlı
4. **docs/guide/{getting-started,installation,quickstart}.md** — kurulum akışı net, kopyalanabilir

**Kanıt:**
- `grep -c "VerhexIO/deckent" README.md` → ≥3 (badge + link)
- Broken link: `grep -oE "docs/(superpowers|launch|directives|audits|alperen-analysis)" README.md docs/index.md` → 0
- `npx vitest run tests/docs/readme-quality.test.ts` → 3+ pass
**Test:** ≥3 (badge-repo doğru, broken-link yok, quickstart-komut-bütünlüğü)

---

## Task 2: 201-002 — W-H doc-drift long-tail kapat (api.md + reference temizlik)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/reference/api.md, docs/reference/cli.md, docs/reference/cli-commands.md, docs/reference/config.md, tests/docs/reference-drift.test.ts
- Scope: docs/reference/, tests/docs/

### Description
**Amaç:** `docs/reference/` dosyalarını CANLI ground-truth'a karşı denetle ve bulduğun gerçek drift'i düzelt. Önceki keşif: `api.md` Memory V2 stale + `cli.md` PROJECT-IDENTITY referansları ZATEN TEMİZ (0) — bu yüzden sabit-string kovalama YOK, canlı karşılaştırma YAP. "Zaten temiz, +0/-0 DONE" YAZMA — gerçek drift bul veya dürüstçe "drift yok, doğrulandı" raporla (kanıt komutlarıyla).

**Çözüm (her madde için önce ölç, sonra düzelt):**
1. **MCP tool sayısı:** `docs/reference/mcp-tools.md` + `api.md` ↔ canlı `src/mcp/server.ts` tool registry (gerçek sayı). Drift varsa düzelt.
2. **CLI komut sayısı:** `docs/reference/cli.md` + `cli-commands.md` ↔ `deckent --help` çıktısı (gerçek komut listesi). Eksik/fazla komut sync.
3. **Config alanları:** `docs/reference/config.md` ↔ `.deckent/config.json` + `src/core/config.ts` DEFAULT (eksik/eski alan var mı).
4. **Glossary/health-check/security** reference dosyalarında ölü link veya kaldırılmış-özellik referansı taraması.

**Kanıt (her biri sayı VEYA "drift yok" kanıtı):**
- MCP: `grep -oE "[0-9]+ (MCP )?tools?" docs/reference/mcp-tools.md | head -1` ↔ canlı registry sayısı — eşit
- CLI: `deckent --help` komut sayısı ↔ cli.md tablo satırı — eşit
- config: config.md'de geçen ama config.json'da OLMAYAN alan → 0
- `npx vitest run tests/docs/reference-drift.test.ts` → 3+ pass
**Test:** ≥3 (mcp-tool-count sync, cli-command-count sync, config-field parity)
**Honest note:** Worker bir maddeyi zaten-temiz bulursa onu "verified clean" diye işaretler (kanıt komutu çıktısıyla), uydurma drift YARATMAZ.

---

## DALGA 1 — Geliştirme Altyapısı (2 task)

## Task 3: 201-003 — develop→ürün yayın senkronizasyon script'i
- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: scripts/sync-to-product.mjs, docs/development/repo-sync.md, tests/scripts/sync-to-product.test.ts
- Scope: scripts/, docs/development/, tests/scripts/

### Description
**Amaç:** `deckent-develop` (geliştirme) → `deckent` (ürün) tek-yönlü yayın otomasyonu. Bu sprint'te ürün reposu manuel snapshot ile oluşturuldu; bunu tekrarlanabilir script'e bağla.

**Çözüm:**
1. **scripts/sync-to-product.mjs** (~150 LoC):
   - `git archive HEAD` → temiz staging (tracked-only)
   - EXCLUDE listesi (Model A): `.brain/`, `.deckent/archive/`, `docs/{superpowers,directives,launch,release,development,archive,audits,alperen-analysis,core-memory}`, kişisel kök md'ler (RESUME-MONDAY, DECKENT-ANA-PLAN, NERVOUS-TODO, DIRECTIVES.md), runtime state (config.json, provider-cache, ci-baseline)
   - Güvenlik gate: sk-ant/AIza gerçek-key taraması (test fixture hariç) → bulursa ABORT
   - `--dry-run` (default): ne çıkar ne kalır raporu; `--apply`: staging dizinine yaz
   - Orphan commit YOK (script sadece staging hazırlar, push insan elinde — public-publish blast-radius)
2. **docs/development/repo-sync.md** — iki-repo modeli + script kullanımı + push'un neden manuel olduğu
3. Exclude listesi script içinde tek `EXCLUDE` array — bu sprint'in manuel listesiyle birebir

**Kanıt:**
- `node scripts/sync-to-product.mjs --dry-run` → exclude/keep raporu + güvenlik PASS
- `grep -c "sk-ant\|AIza" scripts/sync-to-product.mjs` → ≥1 (güvenlik gate var)
- `npx vitest run tests/scripts/sync-to-product.test.ts` → 4+ pass
**Test:** ≥4 (exclude uygulanır, güvenlik-gate gerçek-key yakalar, dry-run yazmaz, idempotent)

---

## Task 4: 201-004 — İki-repo konumlandırma ADR + audit-report immutable note
- Model: sonnet
- Effort: normal
- Skills: documentation-writer, system-architect
- Files: docs/adr/065-develop-product-repo-split.md, docs/architecture/architecture.md, tests/docs/adr-065.test.ts
- Scope: docs/adr/, docs/architecture/, tests/docs/

### Description
**Amaç:** İki-repo modelini kalıcı mimari karar olarak belgele + bu oturumda tespit edilen audit-report drift'ini not et.

**Çözüm:**
1. **docs/adr/065-develop-product-repo-split.md** (MADR v3 hibrit):
   - Bağlam: dogfood = devasa sprint internals (.brain 2554, .deckent/archive 1511) kullanıcı için gürültü
   - Karar: `deckent-develop` (geliştirme, tam history) + `deckent` (ürün, temiz orphan snapshot, sync-to-product ile)
   - Sonuç: npm paketi (`files: dist+bin+README+LICENSE`) değişmez; GitHub vitrini temiz
   - Alternatifler: tek-repo (reddedildi — vitrin/internal çatışması), git-subtree (reddedildi — orphan-history kırılgan)
2. **docs/architecture/architecture.md** — repo-split'e kısa referans
3. **Audit-report immutable note:** ADR'ye veya architecture'a "geçmiş sprint audit raporları (`docs/audits/sprint-NNN/`) immutable, otomatik sayaç-güncellemesi dışı" notu. Kök neden: Sprint 200'de bir otomatik sayaç `docs/audits/sprint-139/dead-code-report.md`'deki tarihsel `864`'ü güncel `870`'e değiştirdi (geri alındı). Managed-docs `docs.json` 11 yönetilen doc içeriyor (CLAUDE/VISION/beta-tracker/IDENTITY/blueprint/AGENTS/TOOLS/BOOT/WORKER-GUIDE) — `docs/audits/` bu listede DEĞİL ve olmamalı; not bunu açıkça belgeler.

**Kanıt:**
- `ls docs/adr/065-*.md` → 1 dosya, MADR formatı (Context/Decision/Consequences)
- `grep -c "deckent-develop\|deckent.*ürün\|product repo" docs/adr/065-*.md` → ≥3
- `npx vitest run tests/docs/adr-065.test.ts` → 3+ pass
**Test:** ≥3 (ADR-065 var + MADR yapı, repo-split kararı, immutable-note)

---

## DALGA 2 — Canlı Doğrulama (1 task + 1 opsiyonel)

## Task 5: 201-005 — Clean-clone smoke verify (deckent son haliyle çalışıyor kanıtı)
- Model: opus
- Effort: high
- Skills: devops-engineer, ci-testing
- Files: scripts/clean-clone-smoke.mjs, docs/development/smoke-verify.md, tests/scripts/clean-clone-smoke.test.ts
- Scope: scripts/, docs/development/, tests/scripts/

### Description
**Amaç:** "deckent son haliyle çalışıyor" ön-koşulunu otomatik kanıtla. Sprint'in kendisi dogfood ama ek olarak temiz-clone senaryosunu doğrula.

**Çözüm:**
1. **scripts/clean-clone-smoke.mjs** (~120 LoC):
   - Geçici dizinde sync-to-product staging'inden (veya HEAD archive) temiz kopya
   - `npm ci` → `npm run build` → `npx tsc --noEmit` → exit 0 kontrol
   - `node dist/cli/entry.js --version` + `--help` (CLI çalışıyor)
   - `node dist/cli/entry.js init <tmp>` → built-in agents/skills üretiliyor mu
   - Rapor: her adım PASS/FAIL
2. **docs/development/smoke-verify.md** — clean-clone smoke prosedürü
3. Bu task'ın kendisi container-path gate'i de canlı test eder (worker host-facing dosya yazarsa)

**Kanıt:**
- `node scripts/clean-clone-smoke.mjs` → tüm adımlar PASS exit 0
- `npx vitest run tests/scripts/clean-clone-smoke.test.ts` → 4+ pass
**Test:** ≥4 (build-step, cli-version, init-builtins, fail-propagation)

---

## Task 6 (OPSİYONEL): 201-006 — Test baseline 28 → ≤20 attack
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Files: tests/ (kategorize edilen fail'ler), src/ (gerekirse)
- Scope: tests/, src/

### Description
**Önkoşul:** Sprint hızlı landerse. Baseline 28 fail (Sprint 200 sonrası). En kolay 8 fail kapatılır.
**Çözüm:** `npx vitest run 2>&1 | grep -A2 "FAIL"` ile fail'leri grupla, en kolay (doc-sync/snapshot/count-drift) 8'i düzelt.
**Kanıt:** `npx vitest run 2>&1 | grep "Tests"` → öncesi 28 fail, sonrası ≤20
**Test:** ≥8 fail yeşil

---

## Sprint Sonu Notu

**Beklenen sonuç:** 5/5 zorunlu DONE + 0-1 opsiyonel. Sprint 201 = deckent canlı-çalışıyor kanıtı (dogfood + clean-clone smoke) + public-yüz içerik (README/docs polish + W-H drift kapanış) + develop→ürün yayın otomasyonu + iki-repo ADR.

**Sprint sonrası:** deckent ön-koşulları kapanır → repo taşıma (private→public) tekrar gündeme gelebilir. Push insan elinde kalır (public-publish blast-radius).

**Pre-flight (sprint başlatmadan ÖNCE):**
1. `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY bash -c 'echo $ANTHROPIC_API_KEY'` → EMPTY (subscription garanti)
2. `claude --version` + `ls ~/.claude/.credentials.json` → subscription canlı
3. `npm run build` + `/mcp restart` (Sprint 200 değişiklikleri)
4. `node -e "const c=require('./.deckent/config.json'); console.log(c.max_workers, c.worker_memory_limit)"` → 6, 2g
5. Başlat: `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY npx deckent start --auto-approve`

**Tahmini süre:** 2-3 saat (5 zorunlu). Subscription quota ~25-30 mesaj.

İlgili memory:
- [[project_api_mode_deferred_post_beta]] — API mode yasak
- [[feedback_no_auth_touch_during_sprint]] — sprint çalışırken auth touch yasak
- [[feedback_trust_brain_eval_not_worker]] — disk-verify ground truth
- [[project_june1_beta_roadmap]] — beta launch hedefi
- [[feedback_brain_synthetic_nogo_disk_verify]] — disk-verify gate
