# NEXT-SESSION-PROMPT — Sprint 150 Hazırlık

> **Amaç:** Sprint 150 başlatılırken bu dosya okunur, içindeki "Task Kalemleri" DIRECTIVES.md'ye taşınır.
> **Şu an:** `DIRECTIVES.md` bilinçli olarak boş — Sprint 149 re-run kararı verildi, yeni direktif yazılmıyor.
> **Not:** Bu dosya manuel toparlama günlerinde (2026-04-21 ve sonrası) biriken ufak-orta kapsamlı işlerin kaydıdır. Büyük özellik/ADR işleri `docs/superpowers/specs/` altında ayrı spec dosyasına yazılır.

---

## 0. Sprint 149 Re-Run Bağlamı

- Sprint 149 fail oldu (detay Sprint 149 retro'da).
- Sprint 150 öncesi **manuel toparlama günü** devam ediyor — bu dosyaya biriken task'lar Sprint 150 direktiflerine dönüşecek.
- `DIRECTIVES.md` dolu bırakılırsa Sprint 149 re-run planlaması karışır → **boş tutuluyor**.

---

## 0.1 İki-Persona Analiz Kuralı (zorunlu lens)

Deckent **iki kişilikli bir üründür** — her dosya analizi bu iki lensle yapılır:

### Persona A — `deckent-dev` (self-hosting, kendi kendini geliştiren)
- Bu proje dizini (`/home/alperen/deckent-dev`). 15+ sprint geçmişi, git history, dogfood.
- Soru: "Bu dosya bizim geliştirme akışımıza hizmet ediyor mu?"

### Persona B — `deckent-prod` (milyon user projesine npm'den kurulacak ürün)
- Soru setleri:
  1. **Kurulum anı:** `npx deckent init` sonrası bu dosya oluşturuluyor mu? (bundled / detected / elle mi?)
  2. **İhtiyaç:** User projesinde bu dosyaya gerçekten gerek var mı?
  3. **Doğruluk:** User bilgisizce doğru doldurur mu? Otomatik detect varsa kapsayıcı mı?
  4. **Kenar durumlar:** Monorepo, polyglot, unusual stack, adversarial input dayanıklı mı?
  5. **Override:** User manuel düzeltmek isterse mekanizma var mı, dokümante mi?
  6. **Bundle status:** `npm pack --dry-run` bu dosyanın şablonunu/seed'ini içeriyor mu?

**Kural:** Bugün itibarıyla `.deckent/` altındaki her dosya bu iki lensle değerlendirilir. Analiz çıktısı NEXT-SESSION-PROMPT'a bu iki bölümle girer.

---

## 1. Bugün Manuel Çözülen İşler (2026-04-21)

### 1.1 `.deckent/sprint-*-ipc/` orphan temizliği + kalıcı fix
**Durum:** ✅ Tamamlandı — Sprint 150'ye carry-over YOK.

**Yapılanlar:**
- 435 orphan `sprint-<13-digit-timestamp>-ipc/` dizin silindi (`.deckent/` 449→90 entry).
- Test izolasyonu: `tests/mcp/tools/start.test.ts` + `tools.test.ts` + `branch-coverage.test.ts` + `tools-enrichment-004.test.ts`'e `node:child_process.fork` + `node:fs.{mkdirSync,writeFileSync,rmSync}` mock eklendi.
- Production savunma: `src/mcp/tools/start.ts`'de `writeFileSync` + `fork()` try/catch → fail'de ipcDir temizleniyor. `isConfigOnlyIpcDir()` helper eklendi — child status/result/error yazmadıysa post-mortem değeri yok, exit code ≠ 0'da bile silinir.
- `tsc --noEmit` temiz, etkilenen 6 test dosyası 85/85 pass, 0 yeni orphan.

**Bilinen sınırlama (Sprint 150 task candidate):**
- `cleanOrphanIpcDirs` (src/core/orphan-cleaner.ts:305) hâlâ dead code — wire etmek `start-detached-fork.integration.test.ts` ile çakışıyordu (test iki orphan dir bekliyor). Live-PID check ile birlikte tekrar wire edilebilir.

### 1.3 `.deckent/generate-load-report.mjs` kaldırıldı
**Durum:** ✅ Tamamlandı — Sprint 150'ye carry-over YOK.

**Kısa kök-neden:**
- Sprint 134 "manual recovery Step C" throwaway script — yazarın 1. satırında "Safe to delete after Sprint 134 closes" notu.
- İşlev Sprint 136 commit `6875bfb` ile `src/orchestra/sprint-finalizer.ts:970` içine entegre edildi (her sprint bitişinde otomatik `generateLoadReport()` → `docs/audits/<sprint.id>/load-test-report.md`).
- 13 sprint (134→149) boyunca dokunulmadı, hiçbir runtime/test/CI referansı yok — grep zero hits.
- Silme: `rm .deckent/generate-load-report.mjs`. Git history (`2bc39da`) ile erişilebilir.

**Kardeş dosya:** `.deckent/run-self-audit.mjs` da aynı turda silindi — detay Section 1.5.

### 1.2 `.deckent/features-manifest.json` canlılaştırma (T-145-001 revive)
**Durum:** ⏸️ **Sprint 150'ye devredildi** (bu oturumda 4-6 saat çalışma gerekir, manuel toparlama temposuyla uyumsuz).

**Arka plan:**
- Sprint 139 T-139-038 tarafından "Dead Code Audit Step 2" olarak üretilmiş statik JSON.
- Runtime'da hiçbir `src/` kodu okumuyor (grep zero hits).
- Sprint 145 T-145-001'de generator'a bağlanma planlanmıştı ama task başka işe dönüştü.
- İçerik stale: `learning-decay.ts` silinmiş ama manifest henüz yansıtmamış.
- Test (`tests/core/features-manifest.test.ts`) sadece şema doğrulaması yapıyor, içerik ↔ kod uyumunu test etmiyor.

**Sprint 150 yapılacak (~800-900 LoC, 4-6 saat):**
1. `scripts/sync-manifest.mjs` — `scripts/dead-code-audit.mjs` genişletmesi, manifest auto-generate.
2. `src/orchestra/sprint-finalizer.ts`'e RETRO phase hook — sprint bitiminde regenerate.
3. `src/cli/commands/features.ts` — `deckent features [--category]` CLI.
4. `src/mcp/tools/feature-query.ts` — `deckent_feature_query` MCP tool.
5. `tests/core/features-manifest.test.ts` güçlendir: her `files[]` entry gerçekten var mı, `active` entry'ler gerçekten import ediliyor mu, `dead` entry'ler gerçekten @deprecated mi.
6. Manifest'i regenerate et — stale içeriği düzelt (learning-decay drop, current sprints update).
7. `docs/reference/features.md` manifest'ten auto-gen.

**Kazanımlar:**
- Runtime: dead code guard, dormant detection, ADR-038 canlı takip, routing hint, Nervous System watchlist input.
- User: `deckent features` CLI, dead code self-cleaning önerisi, upgrade etkisi şeffaflığı, competitive edge (OpenClaw'a karşı "self-aware" messaging).

### 1.4 `.deckent/project-stack.json` iki-persona analizi (no-op bugün, 3 bulgu Sprint 150'ye taşındı)
**Durum:** ✅ Dosya sağlıklı — dokunulmadı. Analiz 3 kritik bulguyla sonuçlandı.

**Persona A (deckent-dev) skoru: 9.5/10.**
- Canlı writer: `src/core/stack-detector.ts` (mtime-based staleness, 13 izlenen dosya).
- 7 canlı okuyucu: skill-selector, routing-engine V2, sprint-planner, mid-sprint-adapter, decision-engine (V1 legacy), init-steps, analyzer.
- 19 test dosyası kapsama.
- ADR-019 dokümante, `config.language_override` esnek geçiş.
- İçerik taze (detectedAt bugün, Sprint 149 başlangıcı).
- Minor: `framework: react` sub-project kaynaklı single-value kısıt — dev impact düşük.

**Persona B (deckent-prod) değerlendirmesi:**
- **Happy path (%80 user):** Node/TS/Python — `deckent init` fresh detect, zero user config, doğru dolar.
- **13 dil tam kapsama:** typescript, javascript, python, rust, go, java, kotlin, csharp, swift, dart/flutter, ruby, php, c/cpp — hepsi detector + STACK_COMMANDS eşleşmiş.
- **4-layer detection robust:** user override → exclusive framework (Cargo.toml/go.mod) → file-count → fallback.
- **Kenar durumlar:**
  - Monorepo (pnpm 3+ level): `scanSubProjectPackageJsons` 2-level derin tarar, daha derin workspace'te eksik.
  - Unusual stack (Clojure/Elixir/COBOL): `language: unknown` fallback, user `language_override` ile düzeltmeli.
  - 50+ subproject: `dependencies[]` length-cap yok, şişebilir.
- **Adversarial input güvenli:** `readJsonSafe` + `lang in STACK_COMMANDS` guard.

**3 BULGU (analiz çıktısı):**

1. 🟥 **BULGU 1 (P0, user tarafından 2026-04-20 dün doğrulandı):** Built-in 16 agent + 21 skill JSON dosyaları `npm pack --dry-run` çıktısında **yok**. `dist/` altında sadece TS kodu + rule-templates + pricing-baseline mevcut. `agent.json`/`skill.json`/`PROMPT.md`/`SKILL.md` npm bundle'da **sıfır**. User `deckent init` çalıştırdığında built-in agent/skill pool fiziksel olarak oluşmuyor — sadece temp agents (project-stack tabanlı) yaratılıyor. Bu Beta GA blocker, prod ürünün fundamental gap'i. **→ T-150-005'e taşındı.**

2. 🟨 **BULGU 2 (P2):** `framework` single-value. Monorepo multi-context (backend Express + frontend React + docs VitePress) suboptimal routing. Önerilen tasarım:
   ```json
   { "framework": "react", "frameworks": { "main": "cli", "dashboard": "react", "docs": "vitepress" } }
   ```
   Sprint 151+ aday. **→ Section 3.4'e not düşüldü.**

3. 🟩 **BULGU 3 (reference implementation positive pattern):** `project-stack.json` diğer canlılaştırma task'ları için kopyalanacak ideal pattern — writer + mtime cache + staleness + override + multi-consumer + test. **→ T-150-002 açıklamasına "reference: project-stack.json pattern" notu eklendi.**

### 1.5 `.deckent/run-self-audit.mjs` kaldırıldı + prod gap keşfedildi
**Durum:** ✅ Silme tamamlandı — Sprint 150'ye carry-over YOK. Prod keşfi → T-150-006.

**Persona A (dev):** Silindi.
- Sprint 134 "manual recovery Step D.3" throwaway kardeş, `generate-load-report.mjs` ile aynı profil.
- 15 sprint (134→149) boyunca dokunulmadı, `2bc39da` tek commit.
- `runSelfAuditGate` fn CANLI (finalizeSprint:898 her sprint otomatik çağırır), ama MJS script'i çağıran yok — grep zero hits in src/tests/scripts/CI.
- Hardcoded `'sprint-134'`, hardcoded output path, `'../dist/orchestra/sprint-finalizer.js'` göreli yol → generalize edilebilir değil.
- Silme: `rm .deckent/run-self-audit.mjs`. Git history (2bc39da) ile erişilebilir. `.deckent/` 89 → 88 entry.

**Persona B (prod) — kritik keşif:**
- `runSelfAuditGate()` aşırı canlı production feature ama CLI ve MCP yüzeyinde **YOK**. User `deckent audit <sprint-id>` veya `deckent recover` çalıştıramaz.
- User sprint crash yaşarsa (dev-deckent'in başına geldiği gibi: Sprint 139 coordinator panic kill, Sprint 140 $42 disaster, Sprint 144 IPC leak) manuel recovery imkansız — elinde ne MJS recovery helper'ı ne CLI komutu var.
- Bu dosyanın **fikri** user-facing bir ürüne dönüşmeli: **biz yaptık deckent'e ekledik (finalizeSprint auto call) peki user tarafı?** İki-persona kuralının birebir uygulandığı keşif.
- **→ T-150-006 task'ı olarak kaydedildi.**

### 1.10 `.deckent/docs.json` iki-persona analizi — **registry core dosyası, public repo geçişi kritik** (bugün dokunulmadı, P0 private→public leak riski keşfedildi)
**Durum:** ⏸️ **Tartışma açık** — dosyaya dokunulmadı. Alperen direktifi: "buda /home/alperen/deckent-dev/.deckent/docs.json core dosyalardan birisi zaten şuan private repoyuz bunu açık repoya taşıyacağız."

**Kritik keşif:** Registry iki persona ihlali taşıyan **tek** dosya — dev-private config ile user-bootstrap template arasında ayrım **yok**. Public repo'ya olduğu gibi taşınırsa GİZLİ dosyaların varlığı ele verilecek.

**Fiziksel durum:** 47 satır, 1675 byte, JSON schema v1, 7 managed-doc entry. Git-tracked (2026-04-08'den beri). Gitignore'da değil.

---

**Dosya içeriği referans (7 entry):**

```json
{
  "version": 1,
  "docs": [
    { "id": "claude-md",       "path": "CLAUDE.md",                       ... },
    { "id": "vision-en",       "path": "VISION.md",                       ... },
    { "id": "vision-tr",       "path": "VISION-TR.md",                    ... },
    { "id": "beta-tracker-en", "path": "BETA-TRACKER.md",                 ... },   // 🟥 GİZLİ
    { "id": "beta-tracker-tr", "path": "BETA-TRACKER-TR.md",              ... },   // 🟥 GİZLİ
    { "id": "identity-md",     "path": ".deckent/workspace/IDENTITY.md",  ... },
    { "id": "blueprint-md",    "path": "DECKENT-MASTER-BLUEPRINT.md",     ... }    // 🟥 GİZLİ
  ]
}
```

Her entry 4 alan: `id` (cache anahtarı), `path` (hedef doküman), `autoSections` (auto-generate bölümler), `protectedSections` (el ile yazılan, dokunulmaz bölümler).

---

**Kaynak kodu zinciri:**

| Rol | Dosya | Satır | İşlev |
|-----|-------|-------|-------|
| Constant | `src/core/constants.ts` | 23 | `DOCS_CONFIG_FILE = '.deckent/docs.json'` |
| Load/Save | `src/orchestra/managed-docs/docs-config.ts` | 31-53 | `loadDocsConfig` + `saveDocsConfig` |
| CRUD | `src/orchestra/managed-docs/docs-config.ts` | 61-110 | `addDoc`, `removeDoc`, `getDoc`, `generateDocId` |
| Consumer | `src/orchestra/managed-docs/managed-doc-runner.ts` | 27, 148 | RETRO phase + standalone CLI |
| CLI | `src/cli/commands/docs.ts` | 18-140 | `deckent docs add`, `docs remove`, `docs list`, `docs run` |
| MCP | `src/mcp/tools/docs.ts` | — | `deckent_docs` tool (add/remove/list/run) |
| Bootstrap | `src/cli/commands/init-steps.ts` | 553-560 | User init → **sadece `claude-md` 1 entry** |
| Bootstrap (MCP) | `src/mcp/tools/init.ts` | 209-212 | Aynı 1 entry bootstrap |

**CLI yüzeyi tam:** `deckent docs add <path>` (user ekler) / `deckent docs remove <pathOrId>` / `deckent docs list` / `deckent docs run [--no-cache]`. MCP parity tam (ADR-022-V2).

---

**Persona A (deckent-dev) — 5 bulgu:**

1. 🟥 **BULGU 1 (P0, public repo geçişinin DEAL-BREAKER'ı):** Registry'de **3 GİZLİ dosya kaydı var** — `BETA-TRACKER.md`, `BETA-TRACKER-TR.md`, `DECKENT-MASTER-BLUEPRINT.md`. Memory `project_release_strategy.md`: "ASLA dışarı çıkmayacak GİZLİ." Memory `project_doc_finalization_sprint.md` Section 5.2: "Private Repo'da Kalacak." docs.json olduğu gibi public repo'ya giderse **isimler leak** olur. User projelerine `npx deckent init` gelen default config'te bu 3 entry görmemeli.

2. 🟥 **BULGU 2 (P0, iki-persona ihlali):** Registry **iki amaç karıştırıyor**:
   - **Amaç A (dev-private):** deckent-dev'in kendi 7 managed-doc ayarı (blueprint metric inject, beta-tracker current status güncelle, vision sprint history inject vb).
   - **Amaç B (user-bootstrap template):** User `deckent init` sonrası hangi managed-doc'larla başlayacak?
   - Gerçek: `init-steps.ts:553-560` **kodda hardcoded `claude-md` bootstrap** yapıyor, docs.json dosyası user'a kopyalanmıyor. Yani **Amaç B zaten kodda**, docs.json **sadece Amaç A**. Ama dosya `.deckent/` altında, git-tracked, karışık duyuruyor.
   - **Doğru ayrım:** `.deckent/docs.json` **dev-private** (gitignore'a alınacak veya private repo'ya taşınacak). User bootstrap template ise `src/cli/commands/init-templates.ts` veya benzer kod katmanında.

3. 🟥 **BULGU 3 (P1, `identity-md` path sıkıntısı):** `identity-md` entry'si `path: ".deckent/workspace/IDENTITY.md"`. **İç dosyayı dış dosyaymış gibi managed-doc yapıyor.** Auto-generated `.deckent/` artifact'i kendi içinde auto-generate ediliyor — döngüsel mantık. User projelerinde bu dosya runtime'da oluşur (init sonrası), managed-doc olmasına gerek yok (zaten `writeStackAndDeckentFile` dev sprint reporter'ı yazıyor). **Dead wire** veya redundant.

4. 🟨 **BULGU 4 (P2, versioning):** `"version": 1` — schema versioning var ama migration path yok. V2'ye geçilirse eski config'ler ne olur? `loadDocsConfig` sadece `version` varlığını kontrol ediyor, gerçek sürüm kontrol yapmıyor. Future-proofing eksik.

5. 🟩 **BULGU 5 (pozitif — clean CLI/MCP parity):** `deckent docs add/remove/list/run` komutları MCP'de birebir var. Test coverage `tests/orchestra/managed-docs/docs-config.test.ts` kapsıyor. `generateDocId` fonksiyonu path'i deterministic ID'ye çeviriyor (`docs/ARCHITECTURE.md` → `docs-architecture-md`). ADR-029 (Managed-Docs Universalization) ve ADR-032 (i18n Pattern) canlı.

---

**Persona B (deckent-prod) — 6 soru / 4 bulgu:**

1. **Kurulum anı:** User `deckent init` sonrası `.deckent/docs.json` dosyası oluşturuluyor — **ama sadece `{ version: 1, docs: [{id: 'claude-md', path: 'CLAUDE.md', ...}] }` 1 entry ile**. Gerisi user ekler (`deckent docs add <path>`). ✅ **Bootstrap doğru minimal**, dev-deckent'in 7 entry'si sadece dev-repo'da var.
2. **İhtiyaç:** User için yararlı — managed-docs opt-in özelliği. `deckent docs add README.md` yaparak README'nin bazı bölümlerini auto-generate edebilir (örn. Sprint History, Build Status). User customize hakkı tam.
3. **Doğruluk — user bilgisizce doğru dolduracak mı?**
   - 🟨 **autoSections + protectedSections kavramı belirsiz:** User "autoSection ne demek?" sorar. Doküman eksik. `docs/reference/` altında user guide yok.
   - 🟨 **`deckent docs add` interaktif prompt yok:** User path ekler ama autoSections parametresini bilmezse boş gider, `docs run` hiçbir şey değiştirmez ("no_auto_sections" reason). UX eksik.
4. **Kenar durumlar:**
   - 🟥 **Path güvenlik:** User `deckent docs add ../../etc/passwd --autoSection="hack"` yazarsa ne olur? `addDoc` path validation yapıyor mu? `docs-config.ts:61-75` sadece duplicate check var. Path traversal guard eksik → **P1 güvenlik debt**.
   - 🟥 **Absolute path:** User `deckent docs add /absolute/path/X.md`. `managed-doc-runner.ts:41` `join(ctx.projectRoot, entry.path)` yapıyor. Absolute path win32'de farklı davranır. Normalize + guard eksik.
   - 🟨 **Duplicate path farklı ID:** User 2x ekler — ikinci eklenti mevcut entry'yi override eder (`docs-config.ts:66-70`), duplicate yok. ✅
5. **Override:** `deckent docs list/add/remove` var, env var override yok, CLI full coverage. MCP parity tam. ✅
6. **Bundle status:** `.deckent/docs.json` runtime artifact, bundle'da **olmamalı**. Doğrulandı (package.json files[] sadece dist + bin + README + LICENSE, `.deckent/` yok).

---

**Private → Public Repo Geçişi — 3 seçenek:**

**Seçenek 1 (Alperen'in direktifi doğrudan uygulanırsa):** `.deckent/docs.json` olduğu gibi public repo'ya taşınır.
- 🟥 **KIRMIZI:** GİZLİ dosya isimleri (`BETA-TRACKER.md`, `DECKENT-MASTER-BLUEPRINT.md`) leak olur. `project_release_strategy.md` memory ihlali.
- 🟥 User `.deckent/docs.json` açınca "Neden benim projemde DECKENT-MASTER-BLUEPRINT.md entry var?" sorar. Semantik kayma: dev-deckent'in iç dosyaları user'ın config template'i gibi görünür.

**Seçenek 2 (minimal bootstrap, dev-private):** `.deckent/docs.json` **public repo'da olmaz** — gitignore'a alınır. User init `init-steps.ts:553-560`'tan 1 entry ile başlar. Dev-deckent kendi docs.json'ını lokal/private repo'da tutar.
- ✅ Gizlilik korunur.
- ✅ User deneyimi net (1 entry default).
- 🟨 Dev-deckent'in iş akışı aynı, ama docs.json git-tracked değilse bir başka makineye setup taşınırken kaybolur — dev kendi lokal backup'ını tutmalı (veya private repo'da `.deckent/docs.json.dev-private.template` olarak).

**Seçenek 3 (split, hem public hem private):** İki dosya:
- `src/cli/commands/init-templates/docs.json.template` — public repo'da, user init'in kanonik template'i (1-2 minimal entry).
- `.deckent/docs.json` — dev-deckent'in canlı runtime config'i, **private repo'da**.
- ✅ Temiz ayrım.
- ✅ User template kaynak kodda yaşar (kod değişikliği ile değişir, manuel `.deckent/docs.json` update gerektirmez).
- 🟨 `init-steps.ts:553-560` şu an hardcoded 1 entry — template'e çıkarılması kod refactor gerektirir.

**Dev tavsiyem:** **Seçenek 3** — private/public ayrımı net + future-proof. User bootstrap kaynak koda, dev runtime config lokal/private kalır. Sprint 150 T-150-011 atomik scope.

---

**4 BULGU özeti:**

1. 🟥 **BULGU 1 (P0 public repo DEAL-BREAKER):** 3 GİZLİ dosya kaydı (`BETA-TRACKER.md`, `BETA-TRACKER-TR.md`, `DECKENT-MASTER-BLUEPRINT.md`). Public repo'ya taşınırsa memory kuralı ihlali + user confusion.

2. 🟥 **BULGU 2 (P0 iki-persona ihlali):** Registry dev-private ile user-bootstrap template amaçlarını karıştırıyor. Ayrıştırma gerekli.

3. 🟥 **BULGU 3 (P1 güvenlik):** `addDoc` path traversal + absolute path guard yok. User adversarial path ekleyebilir (`../../etc/passwd` vs). Security debt.

4. 🟨 **BULGU 4 (P2 user UX):** autoSections/protectedSections kavramı user-facing doküman yok. `deckent docs add` interaktif prompt yok. Beta GA user experience boşluğu.

---

**T-150-011 (P0 Beta GA blocker, ONAYLI 2026-04-21 — Seçenek 3 kilit): `.deckent/docs.json` Private/Public Split + Bootstrap Template + Path Safety**

> **Alperen onayı 2026-04-21:** "EVAT başarılı kabul edildi." → Seçenek 3 (template kaynak kodda + runtime lokal) kilitlendi, T-150-011 final scope.

- **Model:** opus
- **Effort:** normal
- **Skills:** typescript-expert, security-specialist, testing-expert, documentation-writer, git-expert
- **Files:** `.gitignore`, `src/cli/commands/init-templates/docs.json.template` (YENİ), `src/cli/commands/init-steps.ts`, `src/mcp/tools/init.ts`, `src/orchestra/managed-docs/docs-config.ts`, `src/orchestra/managed-docs/types.ts`, `tests/orchestra/managed-docs/docs-config.test.ts`, `tests/orchestra/managed-docs/docs-path-safety.test.ts` (YENİ), `tests/cli/commands/docs-add-interactive.test.ts` (YENİ), `docs/reference/managed-docs.md` (YENİ), `.deckent/docs.json` (dev-deckent lokal — public repo dışı)
- **Scope:** `.gitignore`, `src/cli/`, `src/orchestra/managed-docs/`, `tests/`, `docs/reference/`, `.deckent/`

- **Description:** BULGU 1+2+3+4 atomik fix.

  **Uygulama planı (6 adım):**

  1. **Template dosyası oluştur (Seçenek 3):** `src/cli/commands/init-templates/docs.json.template` — user init'in kanonik default'u. Minimum 1 entry (`claude-md`), opsiyonel olarak `README.md` için 2. entry eklenebilir (README-driven projelerde yararlı). Template'i `init-steps.ts:553-560` yerine kullanan `seedDocsConfig(root)` helper yaz.
  2. **Dev-deckent docs.json gitignore:** `.gitignore` satır ekle `.deckent/docs.json` (sadece bizim repo için). Public repo geçişinde bu dosya **taşınmaz**, private lokal backup olarak Alperen kendi makinesinde/private-mirror repo'da tutar. Alternatif: `.deckent/docs.json.example` public repo'ya, `.deckent/docs.json` dev-private.
  3. **Path safety (BULGU 3):** `addDoc` içinde path validation:
     - Absolute path reddet → `throw new Error('Absolute paths not allowed')` veya normalize to relative.
     - Path traversal guard → `../` içeren path'leri reddet.
     - Projectroot dışı path reddet (`resolve(projectRoot, path).startsWith(projectRoot)` check).
     - Test: `addDoc('../../etc/passwd', ...)` → throws, config değişmez.
  4. **User UX (BULGU 4):** `deckent docs add <path>` interaktif prompt:
     - `path` verildi mi yoksa interaktif mi? Tek parametre varsa hemen ekle, yoksa prompt zinciri: "Path:" → "Auto-sections (virgülle ayır, boş geç):" → "Protected sections (virgülle ayır, boş geç):" → confirm.
     - `node:readline/promises` (ADR-011 mevcut pattern).
     - Non-interactive ortam (CI, script) flag: `--no-prompt` veya `--path ... --auto ... --protected ...`.
  5. **Doküman (BULGU 4):** `docs/reference/managed-docs.md` YENİ:
     - autoSections/protectedSections kavramları net açıklama.
     - 5+ user scenario: "README'ye sprint metrikleri inject et", "Docs klasöründe API reference auto-generate et", "CHANGELOG sprint history ile besle", vb.
     - AI-first dil (T-150-009 config.md felsefesiyle tutarlı) — AI orchestrator'ların managed-docs semantic'ini doğru yorumlaması için.
  6. **Test matrix (15+ yeni test):**
     - Template: `seedDocsConfig` çalışır, user `.deckent/docs.json` doğru içerikle oluşur.
     - Gitignore: `.deckent/docs.json` dev-deckent'te untrack test (meta-dogfood — gitignore-invariant.test.ts T-150-010'da yazılmıştı, genişletilir).
     - Path safety: `addDoc('../../etc/passwd')` throws, `addDoc('/absolute/x.md')` throws (veya normalize), `addDoc('docs/architecture.md')` kabul eder.
     - Interactive prompt: mock stdin, 3-step prompt akışı test edilir.
     - Non-interactive flag: `deckent docs add path --no-prompt --auto="A,B"` prompt atlar.
     - Dev-deckent live migration: T-150-011 PLAN phase ilk adımı `.deckent/docs.json` gitignore'a eklenip `git rm --cached` yapar.

- **Kanıt:**
  - `git ls-files --error-unmatch .deckent/docs.json` → exit ≠ 0 (untracked after migration)
  - `cat src/cli/commands/init-templates/docs.json.template` → 1-2 entry template
  - Fresh `deckent init` tmp project → `.deckent/docs.json` 1 entry (`claude-md`)
  - `deckent docs add ../../etc/passwd` → `Error: path traversal not allowed`, exit 1
  - `deckent docs add` (arg yok) → interactive prompt (mock test)
  - `cat docs/reference/managed-docs.md | wc -l` → ≥ 200 satır
  - `npx vitest run tests/orchestra/managed-docs/ tests/cli/commands/docs-add-interactive.test.ts` → all pass

- **Test:** 15+ yeni test (yukarıdaki matrix).

**Kazanımlar:**
- **Gizlilik (P0):** Public repo geçişinde `BETA-TRACKER.md` + `DECKENT-MASTER-BLUEPRINT.md` referansları leak olmaz. `project_release_strategy.md` memory kuralı korunur.
- **User:** `deckent init` temiz minimal config verir. `deckent docs add` interaktif prompt ile kavram zorlaması yok. `docs/reference/managed-docs.md` AI + human anlaşılır referans.
- **Security:** Path traversal + absolute path guard — adversarial user input kapsamı kapandı. Beta GA'da security audit gate'e girer.
- **İki-persona disiplin:** Registry amacı netleşir — dev runtime config (private) vs user bootstrap template (public kodda). Gelecek dosyalarda bu pattern referans olur.
- **Rakip edge:** OpenClaw managed-docs feature'ı yok — Deckent'in "auto-managed project docs" capability'si launch messaging'in parçası.

**İlişkili memory:**
- `project_release_strategy.md` — çift repo stratejisi, GİZLİ dosya listesi (BLUEPRINT + ANA-PLAN-TR); bu task memory kuralını kod düzeyinde uygular.
- `project_doc_finalization_sprint.md` Section 5 — Public/Private Split stratejisi; Sprint 146 doc finalization'ın minyatür dogfood uygulaması.
- `feedback_two_persona_analysis.md` — "biz yaptık deckent'e ekledik peki user tarafı?" sorusunun 10. canlı uygulaması.

### 1.9 `.deckent/cache/` altı — `managed-docs-cache.json` iki-persona analizi (bugün dokunulmadı, P0 git tracking bug keşfedildi)
**Durum:** ⏸️ **Tartışma açık** — dosyaya dokunulmadı. Critical git tracking bug var (gitignore listesinde ama git-tracked), Sprint 150 T-150-010 atomik fix scope'a girecek.

**Fiziksel durum:** `.deckent/cache/` altında tek dosya — `managed-docs-cache.json` (1329 byte, 38 satır, 7 cache entry). Dizin boyutu 8KB. Dün (2026-04-20) güncellendi — bu oturumda dokunulmadı.

**Cache içerik özeti (7 entry):**

| Cache key | Hedef doküman | autoSections | protectedSections | updatedAt |
|-----------|--------------|--------------|-------------------|-----------|
| `claude-md` | `CLAUDE.md` | Sprint Metrics, Active Debt, Agent Performance | Architecture, Commands | 2026-04-16 |
| `vision-en` | `VISION.md` | Deckent by the Numbers, Sprint History, Sprint Metrics | Vision, Mission, Competitive Analysis, Roadmap, Values, Tech Decisions, Target Users | 2026-04-10 |
| `vision-tr` | `VISION-TR.md` | Sayılarla Deckent, Sprint History, Sprint Metrics | Vizyon, Misyon, Rakip Analizi, Yol Haritası, Değerler, Teknoloji Kararları, Hedef Kullanıcılar | 2026-04-10 |
| `beta-tracker-en` | `BETA-TRACKER.md` | Current Status, Sprint Metrics, Sprint History | Phase Plan, Competitive Analysis, Verified Blockers, Bug Tracker, Action Plan | 2026-04-20 |
| `beta-tracker-tr` | `BETA-TRACKER-TR.md` | Mevcut Durum, Sprint Metrics, Sprint History | Faz Planı, Rakip Analizi, Doğrulanmış Engeller, Bug Tracker, Aksiyon Planı | 2026-04-20 |
| `identity-md` | `.deckent/workspace/IDENTITY.md` | Project Status | (none) | 2026-04-20 |
| `blueprint-md` | `DECKENT-MASTER-BLUEPRINT.md` | Live Metrics | (none) | 2026-04-20 |

**Her entry 3 alan:**
- `entryHash`: template + autoSections + protectedSections + maxLines JSON'un SHA-1'i (generator input signature).
- `fileHash`: hedef doküman içeriğinin SHA-1'i (son yazılmış hali).
- `updatedAt`: cache yenilenme timestamp'i (ISO 8601).

**Karar mantığı (`managed-doc-runner.ts:61-72`):** `cached.entryHash === entryHash && cached.fileHash === fileHash` ise doküman yeniden üretilmez (`reason: 'cached_no_change'`). İki hash de eşleşirse jenerator işi atlanır — runtime optimizasyon.

---

**Kaynak kodu zinciri (tek-kaynak yüzeyleri):**

| Rol | Dosya | Satır | İşlev |
|-----|-------|-------|-------|
| Writer | `src/orchestra/managed-docs/doc-cache.ts` | 44-49 | `writeDocCache` — atomik JSON write |
| Reader | `src/orchestra/managed-docs/doc-cache.ts` | 30-42 | `readDocCache` — fail-safe parse |
| Hash fn | `src/orchestra/managed-docs/doc-cache.ts` | 26-28 | `contentHash` — SHA-1 |
| Clear fn | `src/orchestra/managed-docs/doc-cache.ts` | 54-56 | `clearDocCache` — `deckent docs run --no-cache` için |
| Consumer #1 | `src/orchestra/managed-docs/managed-doc-runner.ts` | 33-124 | Sprint RETRO fazı + CLI `deckent docs run` + MCP `deckent_docs run` |
| Consumer #2 | `src/orchestra/sprint-docs-updater.ts` | 115 | Sprint lifecycle entegrasyonu |
| Registry kaynak | `.deckent/docs.json` | — | 7 managed-doc entry tanımı |
| ADR-031 | `docs/architecture/adr-031-content-hash-cache.md` | — | "Content Hash Cache" accepted, Sprint 131 |
| Test | `tests/orchestra/managed-docs/managed-doc-runner.test.ts` | — | Cache skip/refresh/miss testleri |

**3 entry point aynı cache'i kullanır:**
1. Sprint RETRO fazı (otomatik) — her sprint sonunda cache yenilenir.
2. `deckent docs run` CLI (manuel) — user standalone çalıştırır.
3. `deckent_docs run` MCP tool (AI orchestrator) — Claude Code / Codex / Gemini'den.

---

**Persona A (deckent-dev) — 4 bulgu, 3 pozitif:**

1. 🟥 **BULGU 1 (P0 git tracking bug):** `.gitignore:37` satırında `.deckent/cache/` yazılı, **ama `managed-docs-cache.json` hâlâ git-tracked**. Kanıt: `git ls-files --error-unmatch .deckent/cache/managed-docs-cache.json` exit 0, `git status --porcelain` → ` M .deckent/cache/managed-docs-cache.json`. Kök-neden: Dosya Sprint 133 commit `06b7c8a`'da git repo'ya eklendi, gitignore **sonradan** yazıldı. Git davranışı: zaten track edilen dosya gitignore'a eklense bile track'te kalır. `git rm --cached` gerekli. Sonuç: her sprint cache güncellendikçe commit diff'inde gürültü — son 15 sprint'te bu dosya sürekli "Modified" olarak görünüyor.

2. 🟥 **BULGU 2 (P1 ADR-031 referans bozuk):** Cache ADR-031 (Content Hash Cache) tarafından tasarlandı ama `.brain/exports/decisions.md` listelemede ADR-031 status ACCEPTED olmasına rağmen, `managed-docs-cache.json` dosyası **ADR-031'i referans etmiyor** (yorum satırı, metadata alanı yok). User doküman zincirini (`cache.json → doc-cache.ts → ADR-031`) izleyemez. Küçük ama "self-aware" iddiası için gap.

3. 🟨 **BULGU 3 (P2 updatedAt zaman dilimi):** `updatedAt` field'ları UTC ISO 8601 (`2026-04-20T21:34:40.405Z`). Memory kuralı `feedback_timezone_trt.md` "TRT sunum zorunlu" — kullanıcıya gösterirken +3 çevirilmeli. Cache dosyasında UTC saklanması doğru (storage UTC + sunum TRT pattern), ama user `cat .deckent/cache/...` yaptığında UTC görür. Beta GA user experience nöte — CLI/MCP tarafında `deckent docs status` komutu TRT gösterirse sorun değil. Test edilmemiş.

4. 🟩 **BULGU 4 (pozitif — referans pattern):** Cache fail-safe disiplin çok iyi:
   - `readDocCache` JSON parse fail → `{}` döner, crash yok (satır 38-41).
   - `writeDocCache` mkdir recursive guard (satır 47).
   - `managed-doc-runner` write fail → `debugLog` + continue (satır 123).
   - SHA-1 collision-safe local cache için yeterli (crypto auth için değil).
   - 3 entry point aynı cache'i güvenle kullanır — concurrency issue observed değil (RETRO + CLI + MCP aynı anda çalışmıyor tasarım olarak).
   - **Bu pattern T-150-004 observability rotation ve T-150-008 sprint file retention için referans modül.**

**Pozitif #2:** 56 LoC minimal, tek amaç, hiçbir "feature creep" yok. Modül temizliğinin canlı örneği.

**Pozitif #3:** 6 test dosyası kapsama (`tests/orchestra/managed-docs/` altı). ADR-029/030/031/032 canlı verified.

---

**Persona B (deckent-prod) — 6 soru:**

1. **Kurulum anı:** User `deckent init` sonrası `.deckent/cache/` **oluşmaz** (runtime artifact). `.deckent/docs.json` bootstrap edilir — **sadece `claude-md` tek entry** (`init-steps.ts:553-560`). User 1 yönetilen doc ile başlar, 7 değil. Dev-deckent'teki 7 entry manuel eklendi (`deckent docs add` CLI veya doğrudan docs.json düzenleme). ✅
2. **İhtiyaç:** User için **kritik değil ama yararlı** — managed-docs özelliği opt-in. User `deckent docs run` çalıştırmazsa ya da hiçbir autoSection eklemezse cache oluşmaz. Cache varsa 2. sprint RETRO'da runtime tasarrufu (doğrudan kanıt yok ama hash karşılaştırma jenerator çağrısından ucuz).
3. **Doğruluk — user bilgisizce doğru dolduracak mı?** Cache **user tarafından dokunulmamalı** — internal optimization. Ama user bunu bilmez, dosya adı `managed-docs-cache.json` self-explanatory. Silerse ne olur? `readDocCache` `{}` döner, jenerator her şey yeniden üretir, sadece hız kaybı. Zarar yok. ✅
4. **Kenar durumlar:**
   - 🟨 **Monorepo:** Her subproject kendi `.deckent/cache/` sahibi (projectRoot bağımlı path). Çakışma yok. ✅
   - 🟨 **`deckent docs run --no-cache`:** `clearDocCache` export edildi (doc-cache.ts:54), `--no-cache` flag CLI'da var mı kontrol edilmeli. `cli/commands/docs.ts:143` `runManagedDocUpdates(ctx)` çağırıyor ama `--no-cache` bayrağı `clearDocCache` invoke ediyor mu tespit etmedim — Sprint 150 T-150-010 scope'unda.
   - 🟥 **Dev-deckent git tracking bug (BULGU 1) user projelerinde de olabilir:** User `git add .` yaparsa ilk sprint commit'te cache dahil olur, sonra gitignore etkisini yitirir. User "neden her sprint cache diff'i var?" sorar. T-150-010 fix user projelerinde de aynı sorunu önlemeli (`.gitignore` invariant validation + bootstrap ölçüt).
   - 🟨 **Concurrent `docs run`:** 2 paralel CLI çağrısı race condition? `writeFileSync` atomik değil (Node.js non-atomic, dosya corruption riski). Düşük olasılıklı — user 2 anda `deckent docs run` çalıştırmaz. Ama tasarım güvenli değil; `.deckent/cache/managed-docs-cache.json.tmp` → rename pattern yok.
5. **Override:** `deckent docs run --no-cache` (varsa), manuel silme (`rm .deckent/cache/managed-docs-cache.json`), `clearDocCache` export. ✅ Ama `deckent cache clear` gibi user-facing komut yok — `deckent docs run --no-cache` sadece bu run için skip yapar, kalıcı silmez (kontrol gerek).
6. **Bundle status:** `.deckent/cache/` runtime artifact, bundle'da **olmamalı**. Doğrulama:`grep -n "cache" package.json` — bundle'da yok. ✅

---

**3 BULGU özeti:**

1. 🟥 **BULGU 1 (P0 git tracking bug, dev + prod ortak):** `managed-docs-cache.json` git-tracked (Sprint 133 legacy), gitignore sonradan eklendi → untrack edilmedi. Her sprint commit diff'inde gürültü, user projelerinde aynı risk. **Fix:** `git rm --cached .deckent/cache/managed-docs-cache.json` + test "gitignore invariant" — T-150-010 scope.

2. 🟨 **BULGU 2 (P2 missing metadata):** Cache dosyası ADR-031 referans yorum/metadata içermiyor. User zinciri izleyemez. **Fix:** `_meta` key ekle (`{"_meta": {"adr": "ADR-031", "generatedBy": "managed-doc-runner.ts"}}`) — düşük maliyet, self-aware kazanım.

3. 🟩 **BULGU 3 (pozitif referans pattern):** `doc-cache.ts` 56 LoC minimal + fail-safe + test coverage — T-150-004 observability rotation ve T-150-008 sprint file retention için iskelet. Diğer canlı cache'ler (cost-config 1h cache, config mtime cache) bu pattern'i takip etmiyor, konsolide edilmeli Sprint 151+.

---

**T-150-010 (P1): Managed-Docs Cache Git Tracking Fix + Metadata Annotation**
- **Model:** sonnet
- **Effort:** low
- **Skills:** git-expert, typescript-expert, testing-expert, documentation-writer
- **Files:** `.gitignore` (invariant test trigger), `src/orchestra/managed-docs/doc-cache.ts`, `src/orchestra/managed-docs/types.ts`, `tests/orchestra/managed-docs/doc-cache.test.ts` (yeni), `tests/orchestra/gitignore-invariant.test.ts` (yeni), `.deckent/cache/managed-docs-cache.json` (bugünkü dev dosyası — untrack)

- **Scope:** `.gitignore`, `src/orchestra/managed-docs/`, `tests/orchestra/`, `.deckent/cache/`

- **Description:** Section 1.9 BULGU 1+2 atomik fix. Üç adım:
  1. **`git rm --cached .deckent/cache/managed-docs-cache.json`** — dosyayı untrack et (diskteki dosya silinmez). Tek commit ile dev-deckent git history temizlenir. Task PLAN phase ilk adımı.
  2. **Metadata annotation:** `doc-cache.ts` `DocCache` type'ına opsiyonel `_meta` key ekle; `writeDocCache` yazarken `{ _meta: { adr: 'ADR-031', generatedBy: 'managed-doc-runner.ts', schemaVersion: 1 }, ...cacheEntries }` şeklinde kaydet. `readDocCache` `_meta`'yı filtreleyip entry'lere sadece user doc ID'leri sokar (backward-compat).
  3. **Gitignore invariant test:** `tests/orchestra/gitignore-invariant.test.ts` — her sprint baseline check. `.deckent/cache/`, `.deckent/sprint-*-events.jsonl`, `.deckent/jobs/`, `.deckent/metrics.jsonl` vs **hiçbiri git-tracked olmamalı**. Test `git ls-files .deckent/ | grep -E "cache/|sprint-.*-ipc/|jobs/"` → boş beklenir. Bu testler Beta GA user projelerinde de aynı invariant'ı doğrular (user cloned Deckent repo'dan install ederse kirli state inherit etmez).

- **Kanıt:**
  - `git ls-files .deckent/cache/managed-docs-cache.json` → boş (untracked after fix)
  - `git status --porcelain .deckent/cache/` → boş ya da sadece untracked işareti (`??`)
  - `head -5 .deckent/cache/managed-docs-cache.json` → `"_meta"` key ilk satırda
  - `npx vitest run tests/orchestra/gitignore-invariant.test.ts tests/orchestra/managed-docs/doc-cache.test.ts` → all pass
  - `grep -c ADR-031 .deckent/cache/managed-docs-cache.json` → ≥ 1

- **Test:** 6+ yeni test:
  - `readDocCache` `_meta` filter (backward-compat: eski cache'ler `_meta` yok → entry olarak parse edilmez).
  - `writeDocCache` `_meta` auto-insert.
  - `clearDocCache` `_meta` korur (sadece entry'ler sıfırlanır).
  - gitignore invariant `.deckent/cache/` untracked (current dev state doğrulaması).
  - gitignore invariant 7 gitignored path (cache, sprint-*-events, seq, checkpoint, metrics, jobs, ipc) — hiçbiri git-tracked değil.
  - Concurrent write safety (bonus, opsiyonel): 2 paralel `writeDocCache` sonrası JSON valid olmalı (atomic write pattern ya da advisory warning).

**Kazanımlar:**
- **Dev:** git diff gürültüsü sıfırlanır (son 15 sprint boyunca her sprint cache değişikliği commit'e karıştı). `M .deckent/cache/managed-docs-cache.json` git status'ta bir daha görünmez.
- **User:** Beta GA kurduğunda cache dosyası git-tracked olmaz — "neden her commit'te diff var?" sorusu ortaya çıkmaz.
- **Observability:** Cache dosyası açıldığında self-documenting — ADR-031 + schema version + generator module. AI orchestrator (Claude Code / Codex) cache şemasını okuyup doğru yorumlayabilir (T-150-009 AI-first config felsefesiyle uyumlu).
- **Governance:** gitignore invariant test sprint health gate'e eklenir — user projesinde de aynı invariant uygulanır, dev-deckent bug'ı tekrar etmez.
- **Rakip edge:** OpenClaw'ın managed-docs hash cache yok — Deckent launch messaging'e: "Deckent documents live-update themselves, skip rewrites when content unchanged — powered by content-hash cache."

**İlişkili memory:** `feedback_two_persona_analysis.md` — gitignore bug her iki personada da sorun (dev git noise + prod user-confusion). `feedback_timezone_trt.md` — BULGU 3 (updatedAt UTC saklama, TRT sunumu) — `deckent docs status` komut sunumu kontrol edilmeli.

### 1.8 `.deckent/config.json` iki-persona analizi — en kritik user-facing dosya (bugün dokunulmadı, tartışma devam)
**Durum:** ⏸️ **Tartışma açık** — dosyaya dokunulmadı. Alperen direktifi: "config.json un etki-ihtiyaç-referans ve çift bakış açısıyla incelemesini yapalım."

**Fiziksel durum:** 188 satır, 60+ key, 4 seviye derin yuvalama, **4 farklı naming convention karışık** (camelCase + snake_case + grouped + flat).

---

**Kök-neden — neden "dev config'i" 188 satır, "user init config'i" 4 satır?**

| Kanal | Kaynak | İçerik |
|-------|--------|--------|
| **`createDefaultConfig()`** | `src/core/config.ts:502-611` | 60+ key, hiyerarşik, full schema — **runtime'da merge edilir** |
| **`writeConfig()`** | `src/cli/commands/init-steps.ts:192-235` | **Sadece 4-5 key** → `{mode, language, projectName, model_strategy, spawn_backend}` |
| **Auto-migration** | `src/core/config-migration.ts:91,253,351,379` | Her Deckent upgrade'de yeni default key'leri user dosyasına yazar (bizim 188 satırlık config böyle şişmiş) |
| **Runtime merge** | `loadConfig()` config.ts:644-670 | 3-layer deepMerge: defaults → global → project |

**Sonuç:** User `deckent init` sonrası `.deckent/config.json`'ı açınca 5 satır görür:
```json
{
  "mode": "balanced",
  "language": "tr",
  "projectName": "my-app",
  "model_strategy": {"brain_tier": "premium", "worker_tier": "standard", ...},
  "spawn_backend": "docker"
}
```
Bu **doğru tasarım** — user 188 satırlık overwhelm almaz. 55+ key gizli defaults olarak runtime'da enjekte olur. Ama **fallback-risk**: user bir key'i değiştirmek isterse doküman olmadan hangi key'in var olduğunu bilmez, `deckent config set` komutuna güveniyor.

**Bizim repo'da 188 satır anomali** — 16 sprint boyunca her yeni feature (nervous_system, timeout, memory_budget, adaptive_config vb) auto-migration ile dosyaya yazılmış. User projelerinde bu uzun sürece maruz kalmazlar; tek sprint kullanıp silseler dahi 5 satır kalır.

---

**Persona A (deckent-dev) — canlı anahtarların kaynak kod referansları:**

Tüm 60+ key'in kullanım sayımı (src/ grep, >2 referans = canlı):

| Kategori | Key örnekleri | Min-max ref sayısı | Durum |
|----------|---------------|--------------------|-------|
| Backend | `spawn_backend`, `claude_backend`, `docker_image`, `docker_timeout` | 6-23 | ✅ Canlı |
| Modes | `mode`, `modes.*`, `max_workers` | 15+ | ✅ Canlı |
| Providers | `brain_provider`, `worker_provider`, `providers.*`, `provider_overrides` | 8+ | ✅ Canlı |
| Model | `model_strategy`, `cost_optimization`, `auth_mode` | 5-9 | ✅ Canlı |
| Sprint | `fix_phase_enabled`, `max_fix_retries`, `coverage_threshold`, `sprint_timeout_minutes`, `sprint_checkpoint_interval` | 2-7 | ✅ Canlı |
| Auditor | `scan_interval`, `heartbeat_timeout`, `boundary_enforcement`, `lock_stale_threshold` | 4-8 | ✅ Canlı |
| Memory | `memory_budget`, `decay_after_sprints`, `patterns_enabled`, `project_identity_enabled` | 6-12 | ✅ Canlı (V1+V2 çift) |
| Rollback | `rollback_policy` | 8 | ✅ Canlı |
| Routing | `routing_engine`, `max_reroutes`, `reroute_on_tech_debt`, `agent_min_score`, `adaptive_config` | 3-7 | ✅ Canlı |
| Cleanup | `cleanup_delay_ms` | 3 | ✅ Canlı (düşük okuma = tek wire) |
| Search/Docs | `search_enabled`, `search_provider`, `search_cache_ttl` | 4 | ✅ Canlı |
| Notifications | `notify_on_complete`, `notify_channel`, `notify_url` | 4 | ✅ Canlı (null default = dormant) |
| Telemetry | `telemetry_enabled`, `telemetry_anonymous` | 4 | ✅ Canlı (disabled default) |
| Output | `output_splash`, `output_mode`, `output_theme` | 4-6 | ✅ Canlı |
| Nervous System | `nervous_system.*` (5 aktif + 5 reserved detector) | 20+ | ✅ Canlı (Sprint 148'den beri) |
| Human | `human_checkpoints` | 4 | ✅ Canlı |
| Style | `deckent_style`, `detected_env`, `multi_ide_mode` | 4 | ✅ Canlı |

**Sonuç:** **Hiçbir key dead config değil** — hepsi en az 2 yerde okunuyor. Hardcode vs config çatışma taraması:

**🟥 Hardcode bulgu 1 (P1): `max_workers` fallback `4` ALTI yerde hardcoded**
```
src/orchestra/sprint-phases.ts:172  maxWorkers: ... : 4
src/cli/commands/plan.ts:53         maxWorkers: ... : 4
src/cli/commands/start.ts:287       maxWorkers: ... : 4
src/cli/commands/start.ts:342       maxWorkers: ... : 4
src/mcp/tools/plan.ts:57            maxWorkers: ... : 4
src/mcp/tools/start.ts:74           maxWorkers: ... : 4
```
User config.json'da `max_workers` hiç yoksa fallback=4. Ama `feedback_max_workers` memory kuralı "HARD LIMIT 3-4" — **fallback 4 üst sınırda**. User'ın sistemine göre 2 olabilmeli; hardcoded fallback sistemi iğnelemez. Tek yere konsolide edilmeli: `DEFAULT_MAX_WORKERS` constant.

**🟥 Hardcode bulgu 2 (P1): MODE_PRESETS iki yerde duplicate**
```
src/core/config.ts:84-105          (DEFAULT_MODES: performance 8, balanced 5, economic 3, api 10)
src/core/mode-presets.ts:45-78     (aynı performance 8, balanced 5, economic 3, api 10)
```
**Tek-kaynak-prensibi ihlali.** Birini güncellerken diğeri unutulursa drift. `config.ts` `mode-presets.ts`'i import etmeli. Ayrıca **performance: 8** canlı ama Alperen kuralı HARD LIMIT 3-4 → preset kendisi kural ihlal ediyor (canlı bizim config'de 4, ama user yeni init'te performance seçerse 8 düşer). 

**🟥 Hardcode bulgu 3 (P2): `sprint-docs-updater.ts:90` içinde `max_workers: 8` hardcoded** — doc template dışı mı runtime mı kontrol gerek (muhtemelen docs snippet).

---

**🟥 Şema bulgu 1 (P0 user confusion): DUPLICATE spawn backend fields — KARAR 2026-04-21: KALDIR**

Bizim canlı config.json:
```json
"spawn_backend": "docker",   // satır 6
"claude_backend": "docker",  // satır 93
```
İki key **aynı amaç** ama farklı loader path'leri:
- `spawn_backend`: `'docker' | 'tmux' | 'subprocess' | 'auto'` (config-types.ts:79) — worker runtime seçimi (Docker container / tmux session / child_process)
- `claude_backend`: `'tmux' | 'subprocess' | 'mcp'` (config-types.ts:118) — Claude CLI execution mode

**Ama bizim değerlerimiz** `spawn_backend: "docker"` + `claude_backend: "docker"` — ikincisi schema'da "docker" **geçerli değer değil** (sadece tmux/subprocess/mcp). Canlı config schema violation içeriyor.

**Alperen sorusu 2026-04-21:** "duplicate yapının bir işe yaramıyor mu claude_backend'i dockere bağlayabilir miyiz?"

**Cevap:** Hayır, mümkün değil — `claude_backend: 'docker'` semantik olarak çelişki:
- `spawn_backend: 'docker'` zaten "worker'ı Docker container içinde çalıştır" diyor → Claude CLI o container'ın içinde koşacak zaten. Üst seviyede "docker container" spawn eden + alt seviyede "Claude'u docker ile çalıştır" aynı cümleyi iki kez söylüyor.
- `claude_backend`'in anlamı: Claude CLI **process'inin hangi kabukta** koşacağı (tmux session vs child_process vs ileride MCP native). Docker container **zaten bir kabuk** — çift kabuk mantığı yok.
- `spawn_backend: 'docker'` olduğunda `claude_backend` **runtime'da kullanılmaz** (spawn-backend.ts Docker path'i Claude CLI'ı doğrudan `claude` komutuyla çağırır, claude_backend'i sormaz). Yani canlı config'deki `"claude_backend": "docker"` **zaten okunmuyor** — dead config.

**KARAR:** `claude_backend` key'i kaldırılacak. `spawn_backend` tek kanonik kaynak. (T-150-009 scope)

---

**🟥 Şema bulgu 1b: DUPLICATE provider fields — KARAR: KALDIR**

Bizim canlı config.json:
```json
"providers": { "brain": "claude", "worker": "claude" },
"brain_provider": "claude",
"worker_provider": "claude"
```
Alperen kararı 2026-04-21: "**duplicate key kaldıralım**" → flat `brain_provider/worker_provider` deprecated, `providers.*` grouped tek kanon. Migration script user dosyasından flat'i siler eğer grouped varsa.

---

**🟥 Şema bulgu 2 (P1): DUPLICATE provider fields — KARAR: flat DEPRECATED, grouped KANON**

Şu an hem `providers.brain/worker` (grouped) hem `brain_provider/worker_provider` (flat) aynı dosyada. `loadConfig` (config.ts:707-712) "grouped takes precedence" diyor — yani flat dead read. Migration script v2 grouped varsa flat'i silecek.

---

**🟨 Şema bulgu 3 — DÜZELTİLDİ (P2, design doğru): `max_workers` top-level + mode preset — KARAR 2026-04-21: KALACAK, USER OVERRIDE**

Başlangıç analizimde top-level `max_workers: 3` "dead config" dedim — **yanlış teşhis**. Alperen kararı 2026-04-21:

> "top level bizim kendi custom ayarımız bunu deckent-dev için planladık kullanıcı kendi ayarlarını yapabilmeli config.json özelliği bu."

**Doğru tasarım:** 
- `modes.*.max_workers` = **preset defaults** (hardcoded, Deckent'in standart modelleri) — performance 8 / balanced 5 / economic 3 / api 10. Bu değerler **değişmeyecek**, Deckent vizyon ürünü olarak bu presetlerle kalır.
- Top-level `max_workers` = **user override** — user projesinde kişisel tercih. User 50 worker birden çalıştırmak isterse top-level set eder, mode preset'i override eder.
- **Memory kuralı `feedback_max_workers` ("HARD LIMIT 3-4") revize edilmeli:** bu kural sadece **dev-deckent self-hosting ortamının kapasite sınırı** (Alperen'in WSL2 makinesi 5+ worker kaldırmıyor). Product-level hard limit değil. User preset 8-10 seçebilir, top-level 50 yapabilir, **sistem kapasitesine göre karar kendisinin**.
- **Hardcode fallback `4` 6 yerde** (`sprint-phases.ts:172`, plan.ts, start.ts, mcp tools) — **doğru tasarım**, hiç config yoksa güvenli orta değer. Bunu tek constant'a çevirmek `DEFAULT_MAX_WORKERS`'a düşürmek refactor, ama **değer değişmeyecek**, ürün kararı = kalsın.

**Yapılacak (T-150-009 scope):**
- `feedback_max_workers` memory güncelle: "WSL2 dev-deckent lokal limit 3-4, product-level kural değil" diye not düş.
- `config.ts:84-105` DEFAULT_MODES ile `mode-presets.ts:45-78` arasındaki duplicate tanım → tek kaynak (mode-presets.ts) import edilsin (tek-kaynak prensibi — standart preset değerleri değişmesin ama tek yerde yazılsın).
- `docs/reference/config.md` user'a açıklasın: "preset defaults ÜST limitini mode belirler; sen top-level `max_workers` ile istediğin sayıyı override edebilirsin, 50 bile çalışabilir, sistemin kaldıracağı senin sorumluluğun."

---

**🟨 Şema bulgu 4 (P2): Naming convention tutarsızlığı**

Aynı dosyada 4 farklı stil:
- `snake_case` (çoğunluk): `spawn_backend`, `coverage_threshold`, `max_fix_retries`
- `camelCase`: `actionOverrides` (nervous_system.actionOverrides satır 116), `throttle_ms`, `group_info_window_ms`
- `grouped nested`: `providers.brain`, `nervous_system.detectors.stale_worker.enabled`
- `kebab-hypen`: yok (şanslıyız)

User editörde autocomplete alamaz, ezberlemek zor. Tek stile geçiş breaking change — migration + alias map gerekir.

---

**🟩 Pozitif bulgu: Adaptif yazım disiplini iyi**

- `createDefaultConfig()` 100% type-safe (DeckentConfig interface'ine uyum zorunlu).
- `validateConfig()` `writeConfig` sonrası çalışıyor (config.ts:741).
- Config cache mtime-based, invalidation doğru.
- Env var override var: `DECKENT_MODE`, `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_LANGUAGE`, `DECKENT_STYLE`, `DECKENT_CONFIG_RELOAD` (config.ts:683-703).

---

**Persona B (deckent-prod) — 6 soru:**

1. **Kurulum anı:** User `deckent init` sonrası **5 satırlık config** görür (tasarım doğru). Auto-detect çalışır: mode wizard (`deckent init` interactive), Docker varsa `spawn_backend: docker` otomatik, Windows'ta `subprocess` otomatik. ✅
2. **İhtiyaç:** Config.json user için kritik — hangi provider/mode/spawn backend. Ama 55+ default key user için overhead. ✅
3. **Doğruluk — user bilgisizce doğru doldurur mu?**
   - 🟨 **Mode seçimi belirsiz:** `performance/balanced/economic/api` user'a açıklanmadan seçtiriliyor. Alperen not etti: "deckent initte sistem ayarlaraı seçtiriyor performance balacnded." User "bu ne fark eder?" sorusuna cevap bulamaz. Launch messaging'de karşılaştırma matrisi gerekir (T-150-009 candidate).
   - 🟨 **`model_strategy.auto_upgrade: true` default:** User maliyet korkusu yaşar, "auto_upgrade" ne demek? Doküman yok.
   - 🟨 **`rollback_policy: 'never'` default:** Safety açısından zayıf. "on_failure" güvenli default olurdu ama breaking; ADR tartışması gerekir.
4. **Kenar durumlar:**
   - 🟥 **User API key secret'ı config'e koyarsa:** `api_auth_token` config-types.ts:178'de var. User dosyasına yazarsa git-tracked olursa (kim `.gitignore` unutur?) leak. Şu an gitignore'da (satır 27), **güvende**. Ama Beta GA'da user warn edilmeli.
   - 🟨 **Monorepo / workspace:** Her subproject kendi `.deckent/config.json`'a sahip mi, yoksa root'tan mı miras alınır? `loadConfig(projectRoot?)` parametre var, her subproject ayrı. İyi tasarım ama doküman yok.
   - 🟥 **Config file corruption:** JSON parse fail → loadConfig crash? Evet — catch yok (config.ts:666-678 `readJsonFile` parse fail throws). User `deckent config` çalıştıramaz, tüm CLI öldü. Self-healing gerek.
5. **Override:** `deckent config read/set` CLI komutu var. MCP'de `deckent_config` tool var. Env var override 6 key için çalışıyor. ✅ Ama 60 key'in 54'ünü CLI ile değiştirmek mümkün mü, test edilmedi.
6. **Bundle status:** `.deckent/config.json` runtime artifact, bundle'da yok. Doğru tasarım. ✅

---

**Alperen'in "dün gördüm, basic config" gözlemi doğrulandı:** User init sonrası config 5 satır. Ama **bizim 188 satırlık dosya dev-only anomali** (auto-migration şişirmesi).

**Alperen'in "oto kur seçeneği test edilmedi" hatırlatması:** `src/cli/auto-setup.ts` bulundu (selectMode fn satır 30). Alperen'in "sistem RAM-ekran kartı-proje otonom bulması" hedefi için **sistem kapasite detection henüz yok**. 
- Mevcut: subscription-based mode selection (auto-setup.ts:30-80) — Claude Max/Pro/API'ye göre mode öner.
- Yok: RAM/CPU/GPU/disk quota/network latency detection → `max_workers` auto-tune.
- Yok: Project size detection (LoC/test count/sprint complexity) → `coverage_threshold` adaptive default.
- Alperen direktif: "bu sonranın işi" → Sprint 151+ aday, bugün kapsam dışı.

---

---

## Alperen 5 Karar Matrisi (2026-04-21) — T-150-009 final scope kilitleniyor

| # | Konu | Karar | Kaynak |
|---|------|-------|--------|
| 1 | **Mode preset `max_workers` (performance 8 / balanced 5 / economic 3 / api 10)** | **KALACAK** — bunlar Deckent standart modelleri. User customize edebilir, hardcoded fallback yerine preset kaldığı yerde duruyor. "worker harc coded olmalı kullanıcı belki 50 worker birden çalıştıracak kendisine kalmalı" | Alperen 2026-04-21 |
| 2 | **Top-level `max_workers`** | **KALACAK** — user custom ayar. "top level bizim kendi custom ayarımız... kullanıcı kendi ayarlarını yapabilmeli config.json özelliği bu" | Alperen 2026-04-21 |
| 3 | **`claude_backend: "docker"` schema violation + `spawn_backend` ile duplicate** | **KALDIR** — Alperen sorusuna cevaben: docker semantik çelişki (çift kabuk), dead read. | Alperen 2026-04-21 |
| 4 | **`brain_provider/worker_provider` (flat) + `providers` (grouped) duplicate** | **KALDIR — flat deprecated, grouped kanon** | Alperen 2026-04-21 "duplicate key kaldıralım" |
| 5 | **`api` mode rename (`subscription`/`managed`) gerekli mi?** | **HAYIR, api kalacak** | Alperen 2026-04-21 "hayır api kalacak" |
| 6 | **`rollback_policy` default `never → on_failure` değişimi** | **HAYIR, `never` kalacak** | Alperen 2026-04-21 "rollback policy never olarak kalsın" |
| 7 | **Naming convention (camelCase/snake_case) + alias gerekli mi?** | **ALIAS YOK. `docs/reference/config.md` yeterli** | Alperen 2026-04-21: "alisalar direkt hiç bilmeyen kullanıcı anlayabilsin ama config.md bırakmakta yeterli olur- çünkü ai orchestrator ai modellerinde okuyup config işlevlerini bileceği bir yapı olmalı ürünümüzü ai modelleri ve insanlar kullanacak" |
| 8 | **System capacity auto-detection (RAM/CPU/GPU)** | **Sprint 150'ye al** (şimdilik MVP, Sprint 151'de detaylandır) | Alperen 2026-04-21 "system capacityi bu sprinte yazalım şmdilik sonra detaylandıracağız" |

**Kritik insight Alperen direktifinden:** Deckent'in config doküman felsefesi **AI-first + human-parallel**. Config.md'yi AI agent'lar (Claude Code / Codex / Gemini CLI) okuyup ürünü yönetecek, aynı zamanda teknik user da okuyabilecek. Alias yok çünkü AI model tutarlı terminoloji bekler, alias kaosa yol açar. **Tek kanon, net doküman, AI + human parity.** Bu launch messaging'in temeli (T-150-009 kapsamında `docs/reference/config.md`'ye AI-orchestrator oriented başlangıç paragrafı eklenecek).

---

**4 BULGU revize (Alperen kararlarıyla):**

1. 🟥 **BULGU 1 (P0, ONAYLI): DUPLICATE dead keys kaldırılacak** — `claude_backend` (schema violation + semantik çelişki), flat `brain_provider/worker_provider` (grouped kanon varken dead). Migration script v2 bu iki duplicate'i siler. Top-level `max_workers` **KALIR** (user custom override, doğru tasarım).

2. 🟥 **BULGU 2 (P1, ONAYLI): MODE_PRESETS iki yerde tanımlı** — `config.ts:84-105` ve `mode-presets.ts:45-78`. Tek kaynak `mode-presets.ts`, `config.ts` import etsin. **Preset değerleri değişmiyor** (performance 8, balanced 5, economic 3, api 10 — Deckent standart modelleri).

3. 🟥 **BULGU 3 (P1, ONAYLI): `docs/reference/config.md` — AI + human dual-audience tam matris** — 60 key: kategori + type + default + açıklama + hangi modül okur + env var override (varsa) + mode preset override'ı nasıl çalışır. Başlık paragrafı: "Bu doküman Deckent config sisteminin tek kanon referansıdır. AI orchestrator'ları (Claude Code, Codex, Gemini) ve insan geliştiricilerin birlikte okuyup anlaması için yazılmıştır. Alias yoktur — her key tek kanonik isimle geçer."

4. 🟥 **BULGU 4 (P1, ONAYLI): Self-healing gap — corrupted config.json recovery** — parse fail throws → tüm CLI ölür. Catch + rename (`.bak.<timestamp>`) + fresh default write + user warn.

5. 🟨 **YENİ BULGU 5 (P2, ONAYLI Sprint 150): System Capacity Auto-Detection MVP** — Alperen "system capacityi bu sprinte yazalım şimdilik sonra detaylandıracağız." MVP kapsamı: `os.totalmem()` + `os.cpus().length` + Docker varlığı → `max_workers` + `spawn_backend` smart default. Sprint 151'de GPU/network latency/disk quota genişletilecek.

---

**T-150-009 FINAL SCOPE (karar kilit — Sprint 150'de atomik uygulanacak)**

- **Model:** opus
- **Effort:** high
- **Skills:** typescript-expert, testing-expert, documentation-writer, devops-engineer
- **Files:** `src/core/config-migration.ts`, `src/core/config.ts`, `src/core/config-types.ts`, `src/core/mode-presets.ts`, `src/cli/commands/init-steps.ts`, `src/cli/auto-setup.ts` (genişletme), `src/core/system-capacity.ts` (YENİ), `tests/core/config-migration.test.ts`, `tests/core/config-corrupted-recovery.test.ts` (YENİ), `tests/core/system-capacity.test.ts` (YENİ), `docs/reference/config.md` (YENİDEN YAZ), `.deckent/config.json` (bugünkü dev dosyası clean-up migration ile)
- **Scope:** `src/core/`, `src/cli/`, `tests/core/`, `docs/reference/`, `.deckent/`

**Uygulama planı (7 adım):**

1. **Duplicate key removal migration (Alperen karar 3+4):**
   - `config-migration.ts`'e yeni migration step ekle: "v2-duplicate-remover".
   - Eğer `spawn_backend` varsa → `claude_backend`'i sil (schema violation + çelişki).
   - Eğer `providers.brain` varsa → top-level `brain_provider`'ı sil.
   - Eğer `providers.worker` varsa → top-level `worker_provider`'ı sil.
   - Tüm silme işlemleri **atomik** (writeFileSync tek seferde), `debugLog` ile iz bırak.
   - **Top-level `max_workers` ve preset `max_workers` KORUNUR** (Alperen karar 1+2).

2. **MODE_PRESETS konsolidasyonu (BULGU 2):**
   - `config.ts:84-105`'teki DEFAULT_MODES duplicate silinsin.
   - `config.ts` `mode-presets.ts`'den import etsin.
   - Preset değerleri değişmiyor (performance 8, balanced 5, economic 3, api 10).
   - Hardcode `max_workers` fallback `4` 6 yerde kalmaya devam — Alperen karar "hardcoded fallback doğru tasarım."

3. **Self-healing corrupted config recovery (BULGU 4):**
   - `readJsonFile` yerine `loadConfig`'e catch bloğu ekle.
   - Parse fail olursa: `config.json` → `config.json.corrupted.<ISO-timestamp>.bak` rename, fresh `createDefaultConfig()` yaz, stderr'e warning: "Config dosyanız bozulmuştu, yedeklendi: <path>. Defaults ile devam ediliyor. Düzeltme için `deckent config read`."
   - Test: corrupt JSON inject → CLI crash olmasın, fresh config ile devam etsin.

4. **System Capacity Auto-Detection MVP (Alperen karar 8):**
   - `src/core/system-capacity.ts` yeni modül:
     ```typescript
     export interface SystemCapacity {
       totalRamGB: number;        // os.totalmem() / 1e9
       freeRamGB: number;         // os.freemem() / 1e9
       cpuCores: number;          // os.cpus().length
       dockerAvailable: boolean;  // spawnSync('docker', ['--version'])
       platform: NodeJS.Platform; // os.platform()
     }
     export function detectSystemCapacity(): SystemCapacity;
     export function suggestMaxWorkers(cap: SystemCapacity): number;
     export function suggestSpawnBackend(cap: SystemCapacity): 'docker' | 'subprocess' | 'tmux';
     ```
   - `suggestMaxWorkers` heuristic MVP:
     - `totalRamGB < 4` → 1 worker
     - `totalRamGB 4-8` → 2 worker
     - `totalRamGB 8-16` → 3-4 worker (cpuCores'a bağlı)
     - `totalRamGB > 16` → min(cpuCores-2, 8) worker
   - `suggestSpawnBackend` heuristic:
     - `platform === 'win32'` → 'subprocess' (zaten mevcut kural)
     - `dockerAvailable` → 'docker'
     - aksi → 'subprocess' (veya 'tmux' varsa)
   - `init-steps.ts` `writeConfig`'e entegre: eğer user config'te `max_workers` yoksa **suggest**et değer yaz, auto-detected olduğunu comment'le belirt (JSON comment değil ama `"_auto_detected": { "max_workers": true }` meta key ile).
   - Alperen direktifi: "**şimdilik MVP, sonra detaylandıracağız**" → Sprint 151 aday: GPU (nvidia-smi), network latency, disk quota, Claude subscription tier.

5. **`docs/reference/config.md` tam yeniden yaz (BULGU 3):**
   - AI + human dual-audience başlık paragrafı (yukarıda taslak).
   - 60 key tam matrisi, kategori bazlı 15+ başlık:
     - Identity (projectName, language, last_sprint_id, detected_env, deckent_style)
     - Modes & Models (mode, modes.*, model_strategy, providers, brain_provider flat=deprecated, ...)
     - Backend & Runtime (spawn_backend, docker_image, docker_timeout, multi_ide_mode)
     - Memory (memory.*, memory_budget, decay_after_sprints, patterns_enabled, project_identity_enabled)
     - Sprint Lifecycle (fix_phase_enabled, max_fix_retries, coverage_threshold, max_reroutes, reroute_on_tech_debt, sprint_timeout_minutes, sprint_checkpoint_interval, cleanup_delay_ms)
     - Auditor (scan_interval, heartbeat_timeout, boundary_enforcement, lock_stale_threshold, auto_clean_locks)
     - Rollback & Safety (rollback_policy, human_checkpoints, auth_mode, api_auth_token, plugin_require_signature)
     - Evaluation (evaluation_rubric, rubric_max_retries, adaptive_thresholds, agent_min_score, adaptive_config)
     - Routing (routing_engine, routing_config.*)
     - Search & Docs (search_enabled, search_provider, search_cache_ttl, auto_docs)
     - Notifications (notify_on_complete, notify_channel, notify_url) vs Nervous System notifications (ayrı)
     - Telemetry (telemetry_enabled, telemetry_anonymous)
     - Output (output_splash, output_mode, output_theme, output_render_mode)
     - Timeout (timeout.docker_min/max, tmux_min/max, subprocess_min/max, effort_base, loc_scaling_enabled, history_scaling_enabled, runtime_extension_enabled)
     - Nervous System (enabled, mode, actionOverrides, safety_floor, notifications, detectors, history_retention_days)
     - Collaboration (collaboration.*) — varsa
   - Her key için: **Type** / **Default** / **Env var override (varsa)** / **Okuyan modüller** / **User guide**. Terminoloji AI orchestrator'ların tutarlı anlaması için net.
   - Başlangıç/kurulum senaryoları: "Temel init", "Docker'lı gelişmiş", "Claude Max + api mode", "Monorepo subproject config", "Multi-IDE ortam."
   - Migration changelog: v1 → v2 duplicate key removal.

6. **Live migration Alperen'in `.deckent/config.json`'ı:** Task ilk adımında dev-deckent dosyası live migrate → 188 satırdan ~120 satıra (duplicate keys silinmiş, MODE_PRESETS tek kaynaktan). Validation sonrası auto-saved.

7. **Test matrix (25+ yeni test):**
   - Migration: `claude_backend` removal (spawn_backend ile birlikte), flat provider removal (grouped ile birlikte), top-level max_workers korunur, mode preset max_workers korunur.
   - MODE_PRESETS single-source: `getModePreset('performance').max_workers === 8` (import'tan), `config.ts`'de DEFAULT_MODES yok.
   - Corrupted recovery: JSON syntax error, empty file, null root, binary garbage → 4 senaryo, her biri fresh default + rename.
   - System capacity: mock `os.totalmem()` (4/8/16/32 GB), mock `os.cpus()` (2/4/8/16 core), mock docker available/unavailable → suggest fns doğru değerler döner.
   - Auto-detect wire: `writeConfig` capacity MVP sonrası `max_workers` suggest eder, user override'da kalır.
   - `docs/reference/config.md` lint: markdown linter + her key config-types.ts'de tanımlı mı cross-check.

**Kanıt:**
- `jq 'has("claude_backend")' .deckent/config.json` → false (migration sonrası)
- `jq 'has("brain_provider")' .deckent/config.json` → false (migration sonrası, grouped varken)
- `jq '.max_workers' .deckent/config.json` → number (top-level korundu, user custom)
- `grep -c "max_workers:" src/core/config.ts` → 0 (MODE_PRESETS oradan silindi)
- `deckent config read --repair` → corrupted scenario'da fresh default döner
- `docs/reference/config.md | wc -l` → ≥ 800 satır (60 key × ~13 satır ortalama)
- `npx vitest run tests/core/config-migration.test.ts tests/core/config-corrupted-recovery.test.ts tests/core/system-capacity.test.ts` → all pass

**Kazanımlar:**
- **Dev:** 188 satırlık config.json temizlenir, tek-kaynak prensibi uygulanır, self-healing eklendi.
- **User:** `deckent init` auto-capacity detection ile sistemine uygun `max_workers` gelir. Customize hakkı elinde (50 worker isterse yapar). Config.md dosyası AI-first net referans.
- **Beta GA:** "Config doğru mu dolacak?" sorusuna net cevap — auto-detect + user override + doc + self-heal katmanları hazır.
- **AI orchestrator parity:** Claude Code / Codex / Gemini CLI hepsi aynı config.md'yi okur, tutarlı davranır. Launch messaging'in temeli.

**İlişkili memory:** `feedback_max_workers` GÜNCELLENMELİ — "WSL2 dev-deckent lokal limit 3-4, product hard limit değil. User customize edebilir." `feedback_two_persona_analysis.md` kuralının net bir dogfood uygulaması (BULGU 1-5 hep iki persona lensinden çıktı).

### 1.7 Sprint-prefixed dosya aileleri — 6 aile × iki-persona analizi (bugün dokunulmadı, tartışma için doğrulama tamamlandı)
**Durum:** ⏸️ **Tartışma açık** — bu oturumda dosyalara dokunulmadı. Alperen direktifi: "burada işlem yapma gerçekten doğrulanmış ve kanıtlanmış bulguları detaylı inceleyip tartışalım." → Aksiyon kararları sonraki turda verilecek, T-150-008 önerisi hazır.

**Fiziksel envanter (2026-04-21, `.deckent/` root):**

| Aile | Dosya sayısı | Toplam boyut | Örnek isim | Format | Yazıcı | Amacı |
|------|--------------|--------------|------------|--------|--------|-------|
| `-events.jsonl` | 11 | ~89 KB | sprint-149-events.jsonl | JSON-line, append-only | `src/orchestra/event-stream.ts:193` (`appendFileSync`) | ADR-035 protokolü: Brain↔Worker↔Auditor iletişim telemetrisi (sequence + source + target + channel + payload) |
| `-seq` | 10 | 20 byte (hepsi 2 byte) | sprint-149-seq | plain text integer | `src/orchestra/event-stream.ts:129` (`writeFileSync`) | events.jsonl sequence counter — monotonic per-sprint |
| `-checkpoint.json` | 6 | ~6 KB | sprint-149-checkpoint.json | JSON | `src/orchestra/sprint-checkpoint.ts:162` (`writeFileSync`) | Sprint state snapshot (resume için): completedTasks + pendingTasks + activeWorkers + brainPhase + eventStreamOffset + depGraph |
| `-checkpoint-seq` | 6 | 6 byte (hepsi 1 byte) | sprint-149-checkpoint-seq | plain text integer | `src/orchestra/sprint-checkpoint.ts:97` (`writeFileSync`) | Checkpoint counter — kaç checkpoint yazıldı (Sprint 149'da 5 oldu) |
| `-gate.json` | 9 | ~3.3 KB | sprint-149-gate.json | JSON | `src/orchestra/sprint-finalizer.ts:919-921` (`writeFileSync`) | Brain Self-Audit Gate sonucu: tsc + vitest + honesty + observability → overallGate PASS/GATE_FAILURE |
| `-pre-archive.tar.gz` + `.sha256` | 6 + 6 = 12 | ~245 KB | sprint-149-pre-archive.tar.gz | gzip tar | `src/orchestra/task-restoration.ts:74-91` (`spawnSync('tar')` + `writeFileSync` hash) | CLEANUP öncesi `.tasks/task-NNN-*` dosyalarının hash-verified snapshot'ı (rollback safety) |
| **Makine üretimi toplam** | **50 dosya** | **~343 KB** | — | — | — | — |
| `-layer3-scorecard.md` | 7 | ~143 KB | sprint-139-layer3-scorecard.md | Markdown | **Koordinatör manuel** (git commit 2bc39da ve sonrası) | Sprint 134+ "Layer 3 Scorecard" 17-criterion manual verification — forensic trail |
| `-verifier-log.md` | 1 | 494 byte | sprint-137-verifier-log.md | Markdown | Koordinatör manuel | Sprint 137 tek-off verifier output |
| `-session-starter.md` | 1 | 11 KB | sprint-139-session-starter.md | Markdown | Koordinatör manuel | Sprint 139 handoff doc |
| `-emergency-assessment.md` | 1 | 18 KB | sprint-140-emergency-assessment.md | Markdown | Koordinatör manuel | Sprint 140 $42 disaster post-mortem |
| **İnsan üretimi toplam** | **10 dosya** | **~172 KB** | — | — | — | — |
| **GRAND TOTAL** | **60 dosya** | **~515 KB** | — | — | — | — |

---

**Kök-neden analizi — neden birikiyorlar?**

1. **Makine üretimi 6 aile için cleanup/retention kodu YOK.** `grep -rn "unlinkSync\|rmSync" src/orchestra/` sonuçları event-stream/checkpoint/gate/pre-archive'i hiç içermiyor. Dosyalar yazıldıkça birikiyor, sprint lifecycle'ın hiçbir fazında silinmiyor. Bu bilinçli bir tasarım kararı (forensic trail + resume capability) ama **retention policy yok** = sonsuz büyüme.
2. **İnsan üretimi 4 aile**, koordinatörün manuel commit ettiği sprint-spesifik artifact'ler. Yazıcı yok, arşiv rolü dışında hiçbir canlı runtime tarafından okunmuyor.
3. **Gitignore asimetrik:** 6 makine dosyası gitignore'da (satır 42-48), commit edilmez (günlük artifact). 4 insan dosyası gitignore'da **değil** — deliberately git-tracked forensic dökümanlar (Sprint 134 recovery commit 2bc39da, Sprint 141 commit 1ab0115 vb).
4. **Pre-archive mantığı retention-intent'li ama eksik:** `task-restoration.ts:42-101` CLEANUP öncesi snapshot üretiyor, "rollback safety" amacıyla. Ama rollback ihtiyacı yoksa snapshot'lar ebediyete kadar duruyor. Eski snapshot'ların geri dönme ihtimali pratikte sıfır (Sprint 144'e Sprint 150'de rollback? mümkün değil).

---

**Persona A (deckent-dev) — her aile için canlılık değerlendirmesi:**

| Aile | Halen canlı mı? | Kanıt | Sorun |
|------|-----------------|-------|-------|
| `-events.jsonl` | ✅ Aktif (Sprint 149 yazıldı) | ADR-035 foundation, 16 channel code, fail-safe writer | Retention yok — 11 sprint 89KB, Sprint 1000'de ~8MB |
| `-seq` | ✅ Aktif (counter canlı) | event-stream.ts:129 every `writeEvent` | Sprint bitince `-seq` dosyası artık kullanılmaz — dead after sprint |
| `-checkpoint.json` | ✅ Aktif (Sprint 149'da 5 checkpoint) | sprint-checkpoint.ts her N=5 task completion | Sprint DONE olduktan sonra checkpoint'in değeri yok (resume gerekmeyecek) |
| `-checkpoint-seq` | ✅ Aktif | sprint-checkpoint.ts:97 | Sprint bitince dead — kardeş `-seq` ile aynı |
| `-gate.json` | ✅ Aktif (Sprint 143-149'da var) | sprint-finalizer.ts:919 her finalize'da yazılır | Beta GA için user-consumable — silmek **yanlış**, arşivlemek doğru |
| `-pre-archive.tar.gz`+`.sha256` | ✅ Aktif (Sprint 144-149) | task-restoration.ts | Rollback pencere kapandıktan sonra (1 sprint sonra?) değeri yok |
| `-layer3-scorecard.md` | ⏸️ Koordinatör discretion (Sprint 134-139 yazıldı, 140-149 yok) | Git blame 2bc39da-sonrası | Forensic trail, kalmalı ama `docs/audits/sprint-NNN/` altına taşınmalı |
| `-verifier-log.md` | ⏸️ Sprint 137 tek-off | — | Forensic trail, taşınmalı |
| `-session-starter.md` | ⏸️ Sprint 139 tek-off | — | Forensic trail, taşınmalı |
| `-emergency-assessment.md` | ⏸️ Sprint 140 disaster post-mortem | — | Forensic trail, taşınmalı |

**Dev sorunlar:**
- 🟨 **.deckent/ root dizin şişmesi:** 60 sprint-prefixed dosya root'ta karmaşa yaratıyor. `ls .deckent/` çıktısı okunamaz (bugün %67 gürültü).
- 🟨 **Gate.json arşivleme pattern eksik:** Sprint 150'de Sprint 144-149 gate.json'larını okumak için `for s in 144..149; do jq .overallGate .deckent/sprint-${s}-gate.json; done` çalıştırmak gerekli, canlı reader yok.
- 🟩 **Forensic trail iyi korunmuş:** `-layer3-scorecard.md` dosyaları git history'de duruyor, hiç kaybolmadı.

---

**Persona B (deckent-prod) — altı soru × 6 makine + 4 insan = 10 aile:**

1. **Kurulum anı (`deckent init`):** Hiçbiri `deckent init` sonrası oluşmaz (all runtime-generated). `init-steps.ts` bundling gerekmez. ✅
2. **İhtiyaç:**
   - `-events.jsonl` + `-seq`: **User için kritik** — Sprint 150+'da `deckent_status` / `deckent_explain` MCP tool'ları event stream'den cross-source history okuyacak. Beta GA user-facing.
   - `-checkpoint.json` + `-checkpoint-seq`: **User için kritik** — long-running sprint crash'te resume capability (ADR-035 MVP).
   - `-gate.json`: **User için kritik** — T-150-006 `deckent audit` CLI bu dosyayı user'a gösterecek.
   - `-pre-archive.tar.gz`: **User için kritik** — Sprint 150 crash recovery pipeline'ının temel taşı. `deckent recover` (T-150-006) bu snapshot'tan task'ları restore edecek.
   - `-layer3-scorecard.md` vb: **User için değil** — bunlar dev-deckent'in koordinatör forensic artifact'leri, user projelerinde oluşmaz.
3. **Doğruluk:** User bilgisizce doğru dolduramaz — hepsi runtime auto-write. User manuel dokunmamalı.
4. **Kenar durumlar:**
   - 🟥 **Sprint 1000'da `.deckent/` dizin şişmesi:** Makine üretimi 6 aile × 1000 sprint = 6000+ dosya. `readdirSync` yavaşlar, user'ın `ls .deckent/` çıktısı chaos. Retention policy şart.
   - 🟥 **Disk dolması:** events.jsonl her sprint ~6KB, pre-archive ~40KB, çarpan 1000 sprint = 46MB/sprint-katı. Disk quota düşük user projelerinde kritik.
   - 🟨 **Beta GA user confusion:** User `.deckent/sprint-047-pre-archive.tar.gz`'i görünce "bu ne, neden burada, silebilir miyim?" sorar. Self-explanatory naming yetmez, doküman gerekir.
   - 🟨 **Concurrent sprint çakışması:** İki sprint aynı anda yazarsa (Multi-IDE Sprint 134 ADR-034) `-seq` counter race — event stream sequence yolu bozulur. Multi-project isolation sadece project root seviyesinde, sprint-level çakışma observed değil ama tartışılmalı.
5. **Override:** User silmek isterse manuel `rm` dışında mekanizma yok. `deckent cleanup` mevcut CLI komutu ama sprint-archived file'ları siliyor, bu 6 aileye dokunmuyor.
6. **Bundle status:** `.deckent/sprint-*` runtime artifact, bundle'da olmamalı. Doğrulandı (gitignore'da hep, npm pack'te yok).

---

**3 BULGU (analiz çıktısı):**

1. 🟥 **BULGU 1 (P0 Beta GA blocker, prod-critical):** 6 makine dosya ailesi için retention policy yok. Sprint 1000'de `.deckent/` dizininde 6000+ dosya birikir, user projelerinde disk/performans sorunu. User-facing `deckent_status` ve Beta GA launch messaging'in karşısına "Deckent disk dolduruyor" user feedback'i çıkar. Sprint 150 → T-150-008 kapsamında kalıcı fix.

2. 🟨 **BULGU 2 (P1, dev + prod ortak):** `.deckent/` root düz — 60 sprint dosyası karmaşa. Klasör yapısı önerisi:
   ```
   .deckent/
     runtime/                    (gitignored, active sprint only)
       sprint-149-events.jsonl
       sprint-149-seq
       sprint-149-checkpoint.json
       sprint-149-checkpoint-seq
     archive/                    (gitignored, retention N=10 sprint)
       sprint-144/
         events.jsonl
         checkpoint.json
         pre-archive.tar.gz
         pre-archive.sha256
         gate.json
       sprint-145/...
     forensic/                   (git-tracked, koordinatör artifact'leri)
       sprint-134-layer3-scorecard.md
       sprint-137-verifier-log.md
       sprint-139-session-starter.md
       sprint-140-emergency-assessment.md
   ```
   Ama **dikkat**: path değişikliği 3 modülü etkiler (event-stream.ts, sprint-checkpoint.ts, task-restoration.ts, sprint-finalizer.ts) + 15+ test + gitignore. Big-bang risk. Alternatif: hierarchy yerine sadece **retention** ekle, path aynı kalsın (daha az invasive).

3. 🟩 **BULGU 3 (pozitif pattern):** Makine üretimi 6 aile arasında **fail-safe write discipline** çok iyi — hepsi try/catch + debugLog + never-crash. ADR-035 protocol versioning var. Bu yazım disiplini T-150-004 observability rotation task'ına referans pattern olarak alınabilir.

---

**Açık tartışma soruları (Alperen kararı bekliyor):**

1. **Retention stratejisi nedir?**
   - Option A: **Keep-last-N-sprint** (örn. N=10) — N+1. sprint'te en eski silinir. Basit, öngörülebilir.
   - Option B: **Size-based** (`.deckent/archive/` >1GB'da en eski silinir). Disk-aware ama sprint sayısı değişken.
   - Option C: **Hibrit** (N=10 + size cap 500MB). Conservative.
   - Option D: **Archive + compress** (eski sprint'ler .tar.gz'e yutulur, `.deckent/archive/sprints-001-099.tar.gz`). Max yoğunluk.
   - **Dev tavsiye:** Option C (güvenli default + user config override).

2. **`.deckent/runtime/archive/forensic/` klasör yapısına geçmeli miyiz, yoksa flat kalıp sadece retention mi?**
   - Flat + retention: düşük risk, 4 modül değişmez, sadece yeni cleanup fn eklenir.
   - Hierarchy: temiz UX, breaking change, path hardcoded 20+ yerde — migration script gerekir.
   - **Dev tavsiye:** Flat + retention MVP (T-150-008), hierarchy Sprint 151+ (ADR değişikliği gerekir).

3. **Forensic manuel dosyalar `docs/audits/sprint-NNN/` altına taşınmalı mı?**
   - Evet: diğer audit artifact'leriyle (`load-test-report.md`, `FINAL-EXECUTIVE-REPORT.md`) birlikte durur, dev-deckent tutarlılık kazanır.
   - `docs/audits/sprint-134/layer3-scorecard.md` + `docs/audits/sprint-139/session-starter.md` + `docs/audits/sprint-140/emergency-assessment.md`.
   - User projelerinde bu dosyalar oluşmaz, sadece dev-deckent self-hosting artifact'i. Dev housekeeping task, kolay.
   - **Dev tavsiye:** EVET, tek git commit'te taşı. T-150-008 kapsam dışı alt-adım.

4. **`-seq` ve `-checkpoint-seq` counter dosyaları sprint bitince ölü mü?**
   - `-seq`: events.jsonl append etmek için gerekli. Sprint bitince yeni event yazılmaz → dead.
   - `-checkpoint-seq`: yeni checkpoint yazılmaz → dead.
   - **Ama:** resume capability için checkpoint okunabilir. Yalnızca checkpoint okumak için `-checkpoint-seq` gerekli değil (checkpointNumber JSON içinde var zaten).
   - **Dev tavsiye:** Sprint DONE phase'ta 2 counter dosyası silinsin (ufak win, 2 dosya/sprint azalma).

5. **gate.json arşivleme vs silme?**
   - Silme yanlış: T-150-006 `deckent audit <sprint-id>` tarihsel gate'e erişim ister.
   - Arşivleme doğru: `.deckent/archive/sprint-NNN/gate.json` retention penceresi içinde kalır.
   - **Dev tavsiye:** Retention scope'a dahil et, silme yok.

**Karar çıkmadan dosyalara dokunulmayacak.** Alperen 5 soruya yanıt verince T-150-008 final scope'a kilitlenecek. 

**→ T-150-008 (DRAFT, karar bekliyor):** `.deckent/` Sprint-Prefixed File Retention + Archive Pipeline.

---

### 1.6 `.deckent/safety-point.json` iki-persona analizi (stale artifact + cleanup sözleşmesi kırık)
**Durum:** ⏸️ **Sprint 150'ye devredildi (T-150-007)** — bugün dosyaya dokunulmadı (feature canlı, sessiz silme tehlikeli: paralel bir sprint start'ı aynı anda safety point yazarsa yarış).

**Dosya özeti:** 8 satır, 178 byte. İçerik:
```json
{
  "id": "sprint-149",
  "branchName": "deckent-backup-sprint-149",
  "commitSha": "ac50c92a11ff30d2e168030cf1fc1b05a860a4cc",
  "createdAt": "2026-04-20T21:02:26.883Z",
  "wasClean": false
}
```

**Persona A (deckent-dev) — 4 canlı bulgu, stale artifact + contract gap:**
1. **Kaynak kodu canlı:** `src/orchestra/rollback.ts` 294 LoC — `createSafetyPoint` (git branch + optional stash+pop) / `rollback` (hard reset) / `deleteSafetyPoint` (git branch -D) / `saveSafetyPoint` / `loadSafetyPoint`. Test coverage: `tests/orchestra/rollback.test.ts` var.
2. **Çağrı noktaları:** `sprint-phases.ts:211-212` (PLAN phase — create + save), `sprint-phases.ts:431` (runRollbackCheck — delete on success), `sprint-phases.ts:421` (auto-rollback all-NO_GO). Yani feature aktif, sprint lifecycle'ın ayrılmaz parçası.
3. **Kırık sözleşme:** `deleteSafetyPoint` satır 201-204 **sadece git branch silir** — `SAFETY_POINT_FILE` path'inde JSON dosyası silinmiyor. `saveSafetyPoint`'in simetrik partner'i (`deleteSafetyPointFile` veya `rmSync` çağrısı) eksik. Sonuç: her sprint bitiminde JSON "son sprint'in anısı" olarak kalır.
4. **Stale artifact doğrulaması:** `git branch --list 'deckent-backup-*'` → 17 eski sprint backup branch (sprint-047…sprint-140), ama `deckent-backup-sprint-149` **YOK**. JSON Sprint 149'u işaret ediyor ama karşılık gelen branch hiçbir yerde değil. İki olası kök-neden:
   - (a) Sprint 149 rollback tetiklendi (all-NO_GO), branch temizlendi, JSON unutuldu (delete sözleşmesi kırık olduğu için).
   - (b) Safety point hiç başarılı oluşturulamadı (fork error, stash fail, …), JSON eski halde kaldı (atomik değil: save mutlak ama create optional catch'te).
   Hangisi olursa olsun **bu dosyanın var olması = contract break**.

**Persona B (deckent-prod) — altı soru / 3 bulgu:**
1. **Kurulum anı:** `.deckent/safety-point.json` user projesinde `deckent init` sonrası **oluşmaz** — sadece ilk sprint PLAN phase'ta yazılır (runtime artifact). Bundled seed gerekmiyor, `.gitignore`'a eklendiği doğrulandı (grep git-tracked check). ✅
2. **İhtiyaç:** User projeleri için git rollback feature'ı **kritik güvenlik ağı** — user sprint başlatıp kod tarandıktan sonra tüm task'lar NO_GO olursa, Deckent otomatik olarak sprint öncesi SHA'ya geri dönebilmeli. OpenClaw'ın olmayan özelliği (rakip analizi). ✅
3. **Doğruluk:** Runtime-only yazılır, user manuel düzenlemez. ✅
4. **Kenar durumlar:**
   - 🟨 User'ın git repo'su yoksa: `isCleanWorkingTree` `git status` fail → `false` döner, `createSafetyPoint` content'i boş SHA ile çalışır, `DECKENT_E051` fırlatır → catch'e düşer (sprint-phases.ts:213), rollback feature **sessizce devre dışı** kalır. User uyarılmaz. → Beta GA'da observability debt.
   - 🟥 User dirty tree ile sprint başlatırsa: `createSafetyPoint` stash yapar → `git stash pop` ile geri yükler. Ama stash ↔ pop arasında yarışma durumu varsa (concurrent git op, hook), user'ın çalışması kaybolabilir (line 133-137 stash pop fail edince sadece `console.warn`, hata thrown değil). → Prod'da user loss riski, P1.
   - 🟨 User `rollback: { enabled: false }` config'te ayarlarsa: `sprint-phases.ts:209` gate'i atlatır, JSON oluşmaz. Config dokümante mi? `docs/reference/config.md` kontrol gerek → T-150-007 scope'unda.
5. **Override:** `rollbackEnabled` config key mevcut (ad henüz tam taranmadı, grep "rollback" yapılacak). User feature'ı kapatabilir. ✅
6. **Bundle status:** `.deckent/safety-point.json` runtime artifact → bundle'da olmamalı, gitignore'da olmalı. Doğrulandı: git-tracked **değil**, bundle'da **yok**. ✅

**3 BULGU (analiz çıktısı):**

1. 🟥 **BULGU 1 (P1, dev-prod ortak):** `deleteSafetyPoint` git branch siler **ama JSON dosyası kalır**. Cleanup sözleşmesi asimetrik. Sonuç: `.deckent/safety-point.json` her sprint sonrası güncellenmez ama silinmez de → user/dev projesinde **yanıltıcı artifact** (diff/log'ta görünür, sanki bir rollback capability hazır gibi, ama branch yok). → T-150-007 kapsamında.

2. 🟨 **BULGU 2 (P1, prod):** No-git-repo fallback **silent** — `createSafetyPoint` fail ederse rollback feature sessizce devre dışı kalır. User bilgilendirilmez. → T-150-007 kapsamında observability ekle (`debugLog` yerine visible warning + config.rollback.disabledReason).

3. 🟥 **BULGU 3 (P0, prod user-loss riski):** Dirty tree + stash fail kombinasyonunda user'ın uncommitted changes'i **console.warn ile gömülüp kaybolabilir**. Beta GA'da user data loss riski. → T-150-007 kapsamında stash fail-hard path (throw error + recovery instructions).

**Karar:** Stale artifact'in silinmesi + cleanup sözleşmesinin onarılması + observability + user-loss guard — **tek atomik Sprint 150 task'ı**. Parçalı fix yok ("borç ödüyoruz"). → **T-150-007**.

---

## 2. Sprint 150 Task Kalemleri — Öncelik Sıralı

> Her task için: **Model** / **Effort** / **Skills** / **Files** / **Scope** / **Description** + **Kanıt** + **Test** formatı. Sprint 150 başlatıldığında DIRECTIVES.md'ye bu formatla aktarılır.

### T-150-001 (P0): `cleanOrphanIpcDirs` wire-up with live-PID check
- **Model:** sonnet
- **Effort:** normal
- **Skills:** typescript-expert, testing-expert
- **Files:** `src/core/orphan-cleaner.ts`, `src/mcp/tools/start.ts`, `tests/core/orphan-cleaner-ipc.test.ts`
- **Scope:** `src/core/`, `src/mcp/tools/`, `tests/core/`
- **Description:** `cleanOrphanIpcDirs` fonksiyonu mevcut (dead code) — canlı-PID check ile wire edilecek. Her `deckent_start` öncesi çağrılır, live child process'lerin dir'lerini korur (PID liveness check via `process.kill(pid, 0)`). `start-detached-fork.integration.test.ts` concurrent test'iyle çakışmamalı.
- **Kanıt:** `grep -rn "cleanOrphanIpcDirs" src/` → start.ts'de aktif çağrı; `npx vitest run tests/core/orphan-cleaner-ipc.test.ts tests/mcp/tools/start-detached-fork.integration.test.ts` → all pass.
- **Test:** 3+ test (dead PID removal, live PID preservation, concurrent start isolation).

### T-150-002 (P0): Feature Manifest Canlılaştırma (tam scope)
- **Model:** opus
- **Effort:** high
- **Skills:** typescript-expert, testing-expert, documentation-writer
- **Files:** `scripts/sync-manifest.mjs`, `src/orchestra/sprint-finalizer.ts`, `src/cli/commands/features.ts`, `src/mcp/tools/feature-query.ts`, `tests/core/features-manifest.test.ts`, `docs/reference/features.md`, `.deckent/features-manifest.json`
- **Scope:** `scripts/`, `src/orchestra/`, `src/cli/commands/`, `src/mcp/tools/`, `tests/core/`, `docs/reference/`, `.deckent/`
- **Description:** Section 1.2'deki 7 adımı uygula. Generator + hook + CLI + MCP + test güçlendirme + regenerate + docs auto-gen.
- **Kanıt:** `node scripts/sync-manifest.mjs --dry-run` → 27+ feature listelenir; `deckent features --category=dormant` → 6 feature döner; `deckent_feature_query` MCP tool aktif.
- **Test:** 15+ yeni test (generator output, hook trigger, CLI args, MCP tool schema, content-vs-code integrity).

### T-150-003 (P1): Feature Manifest Stale Content Fix (T-150-002 prerequisite)
- **Model:** sonnet
- **Effort:** low
- **Skills:** typescript-expert
- **Files:** `.deckent/features-manifest.json`
- **Scope:** `.deckent/`
- **Description:** T-150-002 generator tamamlandıktan sonra mevcut içeriği güncelle — `learning-decay.ts` dead entry'sini düşür, `evidenceSprints` listelerini Sprint 140-149 ile güncelle, yeni Sprint 138-149 feature'larını ekle (event-stream v1.1, authority-enforcer Sprint 139 integration vb).
- **Kanıt:** `jq '.dead[].id' .deckent/features-manifest.json` → `learning-decay` yok; `jq '.active[0].evidenceSprints | max'` ≥ `"sprint-149"`.
- **Test:** T-150-002 kapsamında content-integrity testi bu task'ı da doğrular.

### T-150-004 (P0): Observability Rotation + SprintId Tagging + Dead Read Path Cleanup (kalıcı `.deckent/metrics.jsonl` çözümü)
- **Model:** opus
- **Effort:** high
- **Skills:** typescript-expert, testing-expert, performance-optimizer
- **Files:** `src/core/observability.ts`, `src/core/observability-rotation.ts` (yeni), `src/core/config.ts`, `src/core/config-types.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-finalizer.ts`, `src/mcp/tools/status.ts`, `tests/core/observability.test.ts`, `tests/core/observability-rotation.test.ts` (yeni), `.deckent/config.json`
- **Scope:** `src/core/`, `src/orchestra/`, `src/mcp/tools/`, `tests/core/`, `.deckent/`
- **Description:** `.deckent/metrics.jsonl` şu an append-only, rotation yok, sprintId tag yok, Sprint 135'ten beri tek dosyada 15 sprint telemetrisi birikti (256KB, 2209 satır, %94'ü 3 metric). Orta vade sonsuz çözüm:
  1. **Rotation policy:** size-based (>1MB) ve sprint-based (her sprint bitişinde) rotate → `.deckent/archive/metrics/metrics-<sprint-id>.jsonl.gz`. Config key: `observability.rotation: { maxSizeMB: 1, archiveFormat: 'gzip', keepLastN: 10 }`. 3-layer config merge'e entegre.
  2. **SprintId tagging:** `initObservability(root, sprintId)` signature'a sprintId eklenir, `metric/trace/log` otomatik tag'ler. Retro-kompat: eski "unknown" tag'li entry'ler hâlâ okunur.
  3. **Dead read path cleanup:** `src/mcp/tools/status.ts:80` `sprint-NNN-metrics.jsonl` okuma kodu — ya yazıcı tarafını wire et (per-sprint ayrı dosya, rotation ile tutarlı), ya da sil (dead code). Karar task içinde: rotation yaklaşımı per-sprint'i natural yapar → yazıcı wire edilmeli, status.ts canlı consumer olur.
  4. **Bugün yapılan archive:** Sprint 150 başlangıç adımında `.deckent/metrics.jsonl` (varsa) → `.deckent/archive/metrics/metrics-pre-sprint-150.jsonl.gz` taşınır, yeni rotation policy canlı.
  5. **Metric efficiency:** Top-3 metric (hb.stale/collect.batch/result.collected) %94. Sampling/aggregation düşün: `hb.stale` her scan yerine sadece **değişiklik olduğunda** emit (counter delta). Konfigüre edilebilir.
- **Kanıt:**
  - `ls .deckent/archive/metrics/*.gz` → en az 1 arşiv dosya var
  - `du -sh .deckent/metrics.jsonl` → <1MB (veya sprint bitişinde 0)
  - `jq 'select(.tags.sprintId)' .deckent/metrics.jsonl | wc -l` → tüm canlı entry'ler sprintId'li
  - `grep "sprint-NNN-metrics.jsonl" src/mcp/tools/status.ts` → ya canlı çağrı var ya da dead read path silindi
  - `deckent config read | grep rotation` → rotation policy config'te
- **Test:** 10+ yeni test:
  - Rotation trigger (size threshold, sprint boundary)
  - Archive gzip format integrity (roundtrip read)
  - keepLastN enforcement (11. arşivde 1. silinir)
  - SprintId auto-injection (mock initObservability, assert tag'lenmiş)
  - Retro-kompat (eski "unknown" tagli entry'ler `generateLoadReport`'ta görülür)
  - status.ts per-sprint okuma (yazıcı wire edilmişse)
  - Config 3-layer merge (rotation opts default → global → project)
  - Sprint 140 disaster-benzeri anomali: 1500+ satır tek sprint → rotation tetiklenir

**Kazanımlar:**
- **Runtime:** Dosya asla patlamaz (user projelerinde Beta GA'da kritik). Sprint-segmented analysis mümkün (`generateLoadReport(sprintId)` gerçekten sprint-specific).
- **User:** `.deckent/` dizin boyutu sabit kalır (sprint başına ≤1MB arşiv × keepLastN). Sprint 140 disaster-benzeri anomali kaybolmaz — arşivde korunur.
- **Dashboard/MCP:** `status.ts`'in `sprint-NNN-metrics.jsonl` okuma kodu canlı olur → per-sprint dashboard fetching çalışır.
- **Governance:** Observability loop tam — yazım + rotation + segmentation + okuma + rapor + arşiv, altı katman da canlı.

**Bugün yapıldı (Sprint 150 prerequisite YOK — sadece referans):** `.deckent/metrics.jsonl` 256KB, dokunulmadı. Sprint 150'de T-150-004 rotation + archive adımıyla arşivlenip rotate edilecek. **Sprint 150 öncesi manuel temizlik yapma** — task'ın prerequisite'i sıfır dosya olmalı, canlı dosyayla testler de anlamlı.

### T-150-005 (P0 — Beta GA blocker): Built-in Agent + Skill Bundle Pipeline
- **Model:** opus
- **Effort:** high
- **Skills:** typescript-expert, testing-expert, devops-engineer, documentation-writer
- **Files:** `package.json` (files[]), `src/core/agent-pool.ts`, `src/core/skill-registry.ts`, `src/core/builtins/` (yeni), `src/cli/commands/init-steps.ts`, `scripts/bundle-builtins.mjs` (yeni), `tests/e2e/init-builtin-seed.test.ts` (yeni), `tests/core/agent-pool.test.ts`, `.deckent/agents/*/`, `.deckent/skills/*/`
- **Scope:** `package.json`, `src/core/`, `src/cli/commands/`, `scripts/`, `tests/`, `.deckent/`
- **Description:** **User tarafı kritik gap (kullanıcı 2026-04-20 tarihinde canlı doğruladı):** `npm pack --dry-run` çıktısında 16 built-in agent + 21 built-in skill JSON/MD dosyaları **yok**. User `npx deckent init` sonrası `.deckent/agents/` ve `.deckent/skills/` altında fiziksel built-in dosyalar oluşmuyor — sadece temp agents (project-stack tabanlı) yaratılıyor. Deckent çalışır gibi görünür (kod içinden keyword match ile agent adları referans ediliyor) ama:
  - Dashboard'da built-in listelenmez
  - `deckent agent list` boş/eksik döner
  - User agent customize edemez (PROMPT.md yok, hangi dosya override edilecek?)
  - ADR-041 agent taxonomy reform user projesinde uygulanamaz

  **Uygulama planı:**
  1. `src/core/builtins/agents/<id>/{agent.json,PROMPT.md}` ve `src/core/builtins/skills/<id>/{skill.json,SKILL.md}` kanonik seed directory yapısı — deckent-dev'deki `.deckent/agents/` ve `.deckent/skills/` kaynak alınır.
  2. `scripts/bundle-builtins.mjs` — `.deckent/` (dev) → `src/core/builtins/` sync script. Pre-publish hook.
  3. `package.json` files[] içine `dist/core/builtins/` eklenir; tsc build bu dizini kopyalar (veya copy-files script).
  4. `init-steps.ts` → `clearStaleCaches` sonrası **`seedBuiltins()`** çağrısı: `dist/core/builtins/` → user'ın `.deckent/agents/` + `.deckent/skills/` seed et. Idempotent: mevcut user override'ları korur (writeIfNotExists pattern).
  5. `agent-pool.ts` / `skill-registry.ts` — seed eksikse fallback olarak kod içi keyword match çalışmaya devam (backward compat).
  6. `tests/e2e/init-builtin-seed.test.ts` — tmp dir'de `deckent init` çalıştır → 16 agent + 21 skill fiziksel dosya kontrolü.
  7. CI: `npm pack --dry-run | grep -c "builtins/agents"` ≥ 16 check.
- **Kanıt:**
  - `npm pack --dry-run 2>&1 | grep "builtins/agents/.*\.json" | wc -l` → ≥ 16
  - `npm pack --dry-run 2>&1 | grep "builtins/skills/.*\.json" | wc -l` → ≥ 21
  - tmp dir e2e: `cd /tmp/test && npx deckent init && ls .deckent/agents/security-auditor/agent.json` → exists
  - `deckent agent list` → 16 built-in görünür
- **Test:** 12+ yeni test:
  - Bundle script idempotent (dev → src/core/builtins roundtrip)
  - npm pack contents invariant (agent count, skill count)
  - init e2e seed (tmp project, 16+21 file check)
  - User override korunur (writeIfNotExists pattern)
  - agent-pool fallback (seed yoksa keyword match)
  - PROMPT.md / SKILL.md content integrity
  - Cross-platform (Windows path separator)

**Kazanımlar:**
- **User:** `npx deckent init` sonrası fiziksel olarak kullanılabilir 16 agent + 21 skill. Customize edebilir, override edebilir, dashboard'da görür.
- **ADR-041:** Agent taxonomy reform user projesinde de uygulanabilir — horizontal skill / vertical agent ayrımı user-facing.
- **Beta GA unblocker:** Bu gap kapanmadan Public Beta GA verilemez — Deckent "self-aware" iddiası çöker çünkü kullanıcıda dosyalar yok.
- **Dogfood:** deckent-dev'deki `.deckent/agents/` user ortamında da aynı olur — paritenin kanıtı.

### T-150-002 GÜNCELLEME (reference implementation notu)
T-150-002 (Feature Manifest Canlılaştırma) uygulanırken **`project-stack.json` pattern'i reference implementation** olarak alınacak: writer module + mtime cache + staleness check + `config.override` mekanizması + multi-consumer wire + 15+ test. `src/core/stack-detector.ts` canlı örnek; generator modülü aynı iskeletle yazılsın.

### T-150-006 (P1): `deckent audit` + `deckent recover` user-facing CLI + MCP yüzeyi
- **Model:** opus
- **Effort:** high
- **Skills:** typescript-expert, testing-expert, api-builder, documentation-writer
- **Files:** `src/cli/commands/audit.ts` (yeni), `src/cli/commands/recover.ts` (yeni), `src/mcp/tools/audit.ts` (yeni), `src/mcp/tools/recover.ts` (yeni), `src/orchestra/sprint-finalizer.ts` (export genişletme), `src/core/orphan-cleaner.ts`, `tests/cli/commands/audit.test.ts` (yeni), `tests/cli/commands/recover.test.ts` (yeni), `tests/mcp/tools/audit.test.ts` (yeni), `tests/mcp/tools/recover.test.ts` (yeni), `docs/reference/cli.md`, `README.md`
- **Scope:** `src/cli/commands/`, `src/mcp/tools/`, `src/orchestra/`, `src/core/`, `tests/`, `docs/reference/`
- **Description:** **User tarafı kritik gap (Section 1.5 BULGU'dan):** `runSelfAuditGate()` production feature aşırı canlı ama CLI ve MCP yüzeyinde **YOK**. Dev-deckent Sprint 134'te crash olduğunda throwaway `.deckent/run-self-audit.mjs` ile recovery yaptı. User aynı durumu yaşarsa (Sprint 139 coordinator panic kill, Sprint 140 $42 disaster, Sprint 144 IPC leak — hepsi user'ın başına da gelecek) elinde recovery aracı yok. "Biz yaptık deckent'e ekledik peki user tarafı?" sorusunun tam cevabı.

  **Uygulama planı:**
  1. **`deckent audit <sprint-id>`** CLI komutu — `runSelfAuditGate(sprintId, projectRoot)` çağırır, `SelfAuditResult` JSON'u stdout + `.deckent/<sprint-id>-gate.json`'a yazar. Exit code: PASS → 0, GATE_FAILURE → 1.
  2. **`deckent_audit` MCP tool** — `{ sprintId: string }` parametresi, readOnly: true, destructive: false. CLI ile birebir parity (ADR-022-V2).
  3. **`deckent recover <sprint-id>`** CLI komutu — audit + orphan cleanup + stale lock clear + task archive pipeline. Sprint yarım kalmışsa yeniden execute edilebilir hale getirir. Interactive prompt (confirm before destructive ops).
  4. **`deckent_recover` MCP tool** — destructive: true, autoApprove false default.
  5. `sprint-finalizer.ts` → `runSelfAuditGate` zaten export ediliyor (line 228), CLI/MCP katmanları thin wrapper.
  6. Docs: `docs/reference/cli.md`'ye komut referansı + recovery workflow (user'ın "sprint crash oldu ne yapmalıyım?" senaryosuna adım adım cevap).
  7. README'ye "Crash recovery" bölümü.
- **Kanıt:**
  - `deckent audit sprint-149 --json | jq '.overallGate'` → "PASS" veya "GATE_FAILURE" döner
  - `deckent recover sprint-149 --dry-run` → temizlenecekler listesi stdout
  - `deckent_audit` MCP tool registered: `deckent_help | grep audit` → tool listesinde
  - Crash scenario e2e: tmp project'te sprint yarıda kes → `deckent recover` → sprint yeniden başlatılabilir
- **Test:** 15+ yeni test:
  - CLI `deckent audit` PASS/FAIL/WARNING yolları
  - CLI `deckent recover` --dry-run vs live
  - MCP tool schema validation
  - MCP tool destructive flag enforcement
  - Crash recovery e2e (tmp project, simulated crash)
  - Exit code matrix
  - Multi-sprint audit (geçmiş sprint'in gate.json'ı var mı kontrol)

**Kazanımlar:**
- **User:** Sprint crash/hang durumunda **sahipsiz kalmaz**. Deckent'in kendi başına getirdiği T-014 Brain Self-Audit Gate her user projesinde de çalışabilir hale gelir.
- **Beta GA:** "Crash recovery story" user doc'unda somut komutla cevap bulur. Launch messaging: "Deckent knows how to recover itself — and you."
- **Dev-prod parity:** deckent-dev Sprint 134'te elle yaptığı adım user'da tek komuta iner. Dogfood paritesi.
- **MCP/CLI parity (ADR-022-V2):** Her CLI komut MCP'de de var — yeni ADR amendment gerektirmez, zaten kural bu.

**İlişkili memory:** `feedback_two_persona_analysis.md` — "biz yaptık peki user tarafı?" kuralının ilk uygulama ürünü.

### T-150-007 (P1): Safety-Point Lifecycle Onarımı + User-Loss Guard
- **Model:** opus
- **Effort:** normal
- **Skills:** typescript-expert, testing-expert
- **Files:** `src/orchestra/rollback.ts`, `src/orchestra/sprint-phases.ts`, `src/core/errors.ts`, `tests/orchestra/rollback.test.ts`, `tests/orchestra/sprint-phases-rollback.test.ts` (yeni), `docs/reference/config.md`, `.deckent/safety-point.json` (bugünkü stale dosya)
- **Scope:** `src/orchestra/`, `src/core/errors.ts`, `tests/orchestra/`, `docs/reference/`, `.deckent/`
- **Description:** Section 1.6 BULGU 1+2+3 tek atomik task — safety-point.json cleanup sözleşmesinin onarımı + user-loss guard + observability.

  **Uygulama planı:**
  1. **`deleteSafetyPoint` genişletme (BULGU 1):** `rollback.ts:201` — git branch delete'ten sonra `SAFETY_POINT_FILE` path'inde `rmSync({ force: true })` çağrısı ekle. Cleanup simetrik olur (save ↔ delete file partner'i tam).
  2. **`deleteSafetyPointFile` helper export:** `saveSafetyPoint` / `loadSafetyPoint` / `deleteSafetyPointFile` üçlüsü tek modülde simetrik. Public API.
  3. **Orphan temizlik (stale artifact fix):** Sprint 150 PLAN phase başında `cleanOrphanSafetyPoint(projectRoot)` — disk'te JSON var ama `loadSafetyPoint().id !== currentSprintId` ise JSON sil (önceki sprint'in safety point'i temizlenmemiş demek). Live sprint branch'ini kontrol et, gerçekten orphan ise sil, live ise dokunma.
  4. **No-git-repo visible warning (BULGU 2):** `createSafetyPoint` → `git rev-parse --git-dir` pre-check. Git repo yoksa `throw ErrorRegistry.createError('DECKENT_E053', {...})` — sprint-phases.ts:213 catch'i warning log yerine `config.rollback.disabledReason` state'ine yazar. User `deckent config read` veya `deckent_status` ile görebilir.
  5. **Stash fail-hard (BULGU 3):** `rollback.ts:133-137` — stash pop fail olursa `console.warn` yerine explicit error mesajıyla throw (recovery instructions: "Run `git stash list` to see your changes, `git stash pop` manually"). Sprint start abort edilir — yarım durumla devam etme.
  6. **Test genişletme:**
     - `tests/orchestra/rollback.test.ts`: `deleteSafetyPoint` JSON dosyasını siliyor mu (yeni assertion).
     - `cleanOrphanSafetyPoint` unit test (stale detection, live preservation).
     - No-git-repo fail path (tmp dir without .git).
     - Stash pop fail throw (git mock).
     - `tests/orchestra/sprint-phases-rollback.test.ts` (yeni) — PLAN→SPAWN→RETRO lifecycle'ta JSON doğru yazılıyor/siliniyor mu.
  7. **Doc:** `docs/reference/config.md`'ye `rollback.enabled` / `rollback.policy` / `rollback.disabledReason` alanları eklenir; user'ın "rollback nedir, ne zaman tetiklenir, nasıl kapatılır" sorularına yanıt.
  8. **Bugünkü stale dosyayı temizleme:** Task PLAN phase ilk adımında bugünkü `.deckent/safety-point.json` (sprint-149 referans) silinir — `cleanOrphanSafetyPoint` live-çalışmasının ilk kanıtı.
- **Kanıt:**
  - `cat .deckent/safety-point.json 2>&1` → "No such file" (sprint başında temizlenmiş, sonrasında Sprint 150'nin SAFETY_POINT yazılır, sprint sonunda tekrar silinir).
  - `git branch --list 'deckent-backup-*' | wc -l` → Sprint 150 sonrası 0 veya tek bir live branch (eski 17 branch de tespit edilip T-150-007 scope'unda temizlenirse — opsiyonel alt-adım).
  - `grep -n "rmSync.*SAFETY_POINT_FILE" src/orchestra/rollback.ts` → yeni cleanup call var.
  - `deckent config read | jq '.rollback.disabledReason'` → null (normal repo) veya "no_git_repo" (git-less project).
  - `npx vitest run tests/orchestra/rollback.test.ts tests/orchestra/sprint-phases-rollback.test.ts` → all pass.
- **Test:** 8+ yeni test (delete cleanup file, orphan detection, orphan preservation of live, no-git warning, stash fail throw, lifecycle integration, config doc schema, git-less fallback).

**Kazanımlar:**
- **Runtime:** `.deckent/safety-point.json` her sprint sonrası temizlenir — yanıltıcı stale artifact yok. Dev-deckent'te de user projesinde de diff/log temiz.
- **User:** Sprint başlatırken uncommitted changes varsa artık **kesin koruma** — stash fail olursa sprint başlatılmaz, user önce durumu düzeltir. Data loss riski sıfır.
- **Observability:** Rollback disabled ise **görünür** (config field + deckent_status). Silent disable yok. Beta GA user doc'unda "no-git-repo projelerde ne olur?" sorusuna somut cevap.
- **Dogfood:** Section 1.6 bugünkü stale dosya — Sprint 150 PLAN phase'ın ilk canlı çalışması (self-hosting kanıtı).
- **Rakip edge:** OpenClaw'ın rollback feature'ı yok — Deckent'in "sprint öncesi safety point + auto-rollback" story'si launch messaging'in parçası olabilir ("Deckent never loses your work — not even on catastrophic sprint failure").

**İlişkili memory:** `feedback_two_persona_analysis.md` — BULGU 3 "biz yaptık peki user tarafı?" sorusunun doğrudan cevabı (user-loss guard).

---

## 3. Biriken Diğer Küçük Fix'ler (bu oturum devam ederken)

> Bu bölüm **canlı güncellenir** — bugünkü manuel toparlamada her yeni bulgu burada kaydedilir.

### 3.1 `.deckent/` dizin hijyeni
- `.deckent/metrics.jsonl` — ✅ **T-150-004 kapsamında** (rotation + sprintId tag + dead read path cleanup — kalıcı sonsuz çözüm).
- `.deckent/jobs/` — 143 job dosyası birikmiş, rotasyon yok. Sprint 150 task candidate (T-150-???) — benzer rotation pattern uygulanabilir (keepLastN sprint).
- `.deckent/config.json.bak.*` — 3 backup dosya, manuel rotasyon. Sprint 150 task candidate — keep count policy (örn. son 5 backup).
- `.deckent/safety-point.json` — ✅ **T-150-007 kapsamında** (delete cleanup sözleşmesi + orphan temizlik + user-loss guard).
- `git branch --list 'deckent-backup-*'` → 17 eski backup branch (sprint-047…sprint-140). T-150-007 opsiyonel alt-adımı olarak **toplu temizlik** (sadece 30 günden eski branch'ler, current sprint branch'i koru). Alternatif: `deckent cleanup --safety-branches` ayrı CLI komutu (T-150-006 `deckent recover` scope'una da eklenebilir).

### 3.2 Test regressions (full suite'ten gelen)
- Bugün `npx vitest run` tam suite'te 80 test fail vardı (15396 pass / 80 fail / 31 skip). Bunlar bugün eklenen değişikliklerden değil — Sprint 148 sonrası bilinen regression. Sprint 150 triage task candidate.

### 3.3 `sprint-finalizer.ts` pre-existing tsc error
- Multiple task result'larda "pre-existing sprint-finalizer.ts:36 error" notu var. Scope dışında kalmış, hiç düzeltilmemiş. Sprint 150 P2 task candidate.

### 3.4 `project-stack.json` framework multi-value (Sprint 151+ aday)
- Section 1.4 BULGU 2 kaydı. Mevcut `framework: <single>` monorepo multi-context'te suboptimal. Önerilen genişletme:
  ```json
  {
    "framework": "react",
    "frameworks": { "main": "cli", "dashboard": "react", "docs": "vitepress" },
    "buildTool": "vite",
    "buildTools": { "main": "tsc", "dashboard": "vite" }
  }
  ```
- Etki: 7 consumer (skill-selector, routing-engine, planner, mid-sprint-adapter, decision-engine, init-steps, analyzer) scope-aware routing yapar. ~150-200 LoC + backward compat + test. Orta öncelik — Beta GA blocker değil. Sprint 151+ aday.

---

## 4. Sprint 150 Başlangıç Checklist

Sprint 150 başlatılmadan önce bu dosyayı okuyan Brain/koordinatör:
- [ ] Section 2'deki task'ları DIRECTIVES.md'ye aktar (format: `## Task N: <title>` + Model/Effort/Skills/Files/Scope/Description + Kanıt + Test).
- [ ] Section 3'teki "biriken fix'ler"i önceliğe göre ek task olarak değerlendir.
- [ ] Section 1'deki "tamamlandı" kalemlerini DIRECTIVES'e YAZMA — zaten yapıldı.
- [ ] Sprint 149 retro'yu oku (`.brain/archive/retro-sprint-149.md`) — fail sebepleri Sprint 150 planlamasında gözetilmeli.
- [ ] `NEXT-SESSION-PROMPT.md` bu dosya: Sprint 150 başladıktan sonra **sıfırlanır** (1 satıra düşürülür) — böylece Sprint 151 hazırlığı temiz bir sayfadan başlar.

---

**Son güncelleme:** 2026-04-21 (manuel toparlama günü — session devam ediyor | Sprint 150 task sayacı: 11 — T-150-001..011 | ONAYLI: T-150-009 (config) + T-150-010 (cache git) + T-150-011 (docs.json Seçenek 3 split) | T-150-008 hâlâ karar bekliyor)
