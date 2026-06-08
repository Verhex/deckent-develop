# Sprint 172 Doc-Reorg + OSS GA Implementation Plan

> **For agentic workers:** Bu plan Sprint 172 DIRECTIVES.md'nin kaynağıdır. Faz sırası A→C→B bağlayıcı. Steps checkbox (`- [ ]`).

**Goal:** OSS GA öncesi dokümantasyonu (1) kullanıcı-yanıltan drift'lerden arındır, (2) drift'i kalıcı önleyen auto-gen pipeline kur, (3) ideal ağaca yeniden yapılandır — public flip Faz A+C sonrası açılır.

**Architecture:** 3 faz, **tek sprint, sıralı A→C→B**. Faz A = GA-blocking doc-honesty (kod gerçeğine hizala). Faz C = tek-hakikat auto-gen (sayılar script'ten, manuel drift biter). Faz B = yapısal reorg (taşı/birleştir/sil, geri-dönülebilir). GA flip kapısı = A+C tam; B paralel/sonra, GA'yı bloklamaz.

**Tech Stack:** Markdown, Node ESM `.mjs` auto-gen scriptleri, `commander.help()`, MemoryStore (ADR/agent DB→md), VitePress (`ignoreDeadLinks:false`), git.

**Girdi (bağlayıcı):** `docs/audits/sprint-171/00-SYNTHESIS.md` §4 (ideal ağaç §4.1, dosya→hedef §4.2, ignore §4.3) + `docs/audits/sprint-171/00-VERIFICATION-LOG.md` (C-05/07, C-13, C-14, BA-03, BA-05 doğrulanmış verdict'ler).

**Kararlar (Alperen, 2026-05-16):**
- Yapı: 3 faz tek sprint, sıralı A→C→B; GA flip A+C sonrası.
- TR/EN: **EN kanonik + TR tam paralel korunur**. README.md/VISION.md = EN (kanonik OSS vitrin); README-TR.md/VISION-TR.md = TR tam çeviri, first-class, silinmez, drift-audit'e tabi. Hiçbir TR dosya birleştirilmez/silinmez.
- Archive: `git rm --cached` + `.gitignore` (dosya diskte kalır, git-untrack, geri-dönülebilir). memory.db'ye DOKUNULMAZ. Önce DB-parity doğrulama task'ı.

---

# FAZ A — Doc-Honesty (GA-BLOCKING, önce)

Kod gerçeği = tek-hakikat. Her task: doc'u koda hizala (kod doğru olan yerlerde doc düzeltilir; davranış değişmez).

### Task A1: C-05/C-07 — `dependency_pipeline_enabled` provenance drift

**Files:** Modify `DECKENT.md:51`, `.contracts/api-surface.md:83`

- [ ] **Step 1:** Kod gerçeğini doğrula: `grep -n "dependency_pipeline_enabled" src/core/config.ts` → `:600 default true`, `:883 ?? true`; `.deckent/config.json:198 false` (bu proje bilinçli override).
- [ ] **Step 2:** `DECKENT.md:51` düzelt: `"Sprint 167 flip: dependency_pipeline_enabled: true — Wave scheduling goes live"` → `"dependency_pipeline_enabled: kod default true (config.ts:600). deckent-dev bu projede bilinçli false (.deckent/config.json:198) — Wave geçişleri Brain manuel (ADR-047). Kullanıcı projelerinde default true = otomatik wave."`
- [ ] **Step 3:** `.contracts/api-surface.md:83` düzelt: çelişen provenance ("default since Sprint 156" vs DECKENT.md "Sprint 167") → tek doğru köken: `"config.ts:600 default true; provenance: Sprint 156 eklendi, Sprint 169 H5 doğrulandı. Bu projede .deckent/config.json ile false."`
- [ ] **Step 4:** Kanıt: `grep -n "deckent-dev bu projede bilinçli false" DECKENT.md` → eklendi. Çelişki kalmadı (iki dosya tek köken).
- [ ] **Step 5:** Commit: `docs(sprint-172-A1): C-05/07 dependency_pipeline_enabled provenance drift fix`

### Task A2: C-13 RBAC + C-14 verify-gate — enforcement honesty

**Files:** Modify `CLAUDE.md` (Gotchas/Scope enforcement satırı), `.deckent/workspace/IDENTITY.md`, `.brain/exports/summary.md` üretimi değil (auto-gen — kaynak DB memory entry düzeltilir), `.claude/rules/worker-default.md` (verify ifadesi)

- [ ] **Step 1:** Doğrula (VERIFICATION-LOG'dan): `authority-enforcer.ts:29` "always soft"; `worker.ts:480 return true`; ADR-037 `decisions.md:1825` "runtime enforcement henüz tam değil"; `worker-rbac.test.ts` Test 2/3 soft test-kilitli. `enforceVerifyLoop`/`runTestVerifyLoop` 0-caller.
- [ ] **Step 2:** `CLAUDE.md` Gotchas "Scope enforcement: ... ADR-037 RBAC runtime enforcement" → `"Scope enforcement: Auditor git diff --stat ile İZLER (dedektif). ADR-037 RBAC = compile-time lint + audit-trail; runtime advisory/soft (Layer-2 ADR-037 V1.0'da kasıtlı eksik — ihlal warn+emit, bloke ETMEZ). Hard-flip gelecek ADR-037 V2."`
- [ ] **Step 3:** `IDENTITY.md` "ADR-037 ... RBAC runtime enforcement" geçen yerleri "RBAC compile-time + audit-trail (runtime soft)" olarak düzelt.
- [ ] **Step 4:** `worker-default.md` Verify Loop: "Run tsc/vitest before done" = prompt talimatı (advisory) olduğu netleştir — "deckent bunu kod-enforce ETMEZ (enforceVerifyLoop wire'lı değil — bkz post-GA integrity-V2); worker dürüstlüğü esastır" notu ekle.
- [ ] **Step 5:** Kanıt: `grep -ni "runtime enforcement" CLAUDE.md IDENTITY.md` → "soft/advisory" niteleyici var, çıplak "runtime enforcement" iddiası yok.
- [ ] **Step 6:** Commit: `docs(sprint-172-A2): C-13/C-14 RBAC+verify-gate enforcement honesty (soft/advisory netleştirme)`

### Task A3: BA-03 — ADR-010 amendment (7 runtime dep)

**Files:** Modify `docs/adr/010-*.md` (veya DB entry adr-010 — kanonik DB ise MemoryStore üzerinden), `.brain/exports/decisions.md` (auto-gen — re-export)

- [ ] **Step 1:** Doğrula: `node -e "console.log(require('./package.json').dependencies)"` → 7 dep (@modelcontextprotocol/sdk, @noble/ed25519, @noble/hashes, better-sqlite3, commander, telegraf, zod) + optional discord.js. ADR-010 metni "yalnızca commander".
- [ ] **Step 2:** ADR-010'a **Amendment** bölümü ekle (supersede değil — accepted kalır): `"## Amendment (Sprint 172): Orijinal 'yalnızca commander' kararı Sprint 044 CLI-only dönemine aitti. Sonraki accepted ADR'ler ek runtime dep'leri gerekçelendirdi: @modelcontextprotocol/sdk←ADR-017 (MCP-Native), better-sqlite3←Memory V2 (DB-first), telegraf/discord.js←ADR-016 (Connector), zod←plan Zod validation, @noble/*←ADR-014 (.deck secret). Güncel ilke: 'minimal, her biri accepted-ADR-gerekçeli runtime bağımlılık' — keyfi ekleme hâlâ yasak (chalk/inquirer/lodash reddi geçerli)."`
- [ ] **Step 3:** Kanıt: ADR-010 Amendment'ta 7 dep'in her biri bir ADR'ye map'li. `npm run lint:adr` geçer.
- [ ] **Step 4:** Commit: `docs(sprint-172-A3): ADR-010 amendment — 7 dep ADR-gerekçeli (Sprint 044 metni güncellendi)`

### Task A4: C-41/BD-01 — README 5-drift badge (manuel düzeltme, kalıcı çözüm Faz C)

**Files:** Modify `README.md`, `README-TR.md`

- [ ] **Step 1:** Gerçek sayıları topla: testler `npx vitest run 2>&1 | tail` (gerçek pass), dashboard sayfa `ls src/dashboard/pages | wc -l`, MCP tool `grep -c registerTool src/mcp/server.ts` (gerçek), ADR `node -e "..." getByType('adr').length`, agent `ls .deckent/agents | wc -l` (built-in 15 + custom ayrımı).
- [ ] **Step 2:** README.md 5 drift'i gerçek değerle değiştir (test sayısı, dashboard sayfa, MCP tool, ADR sayısı, agent custom+2). README-TR.md aynı değerlerle senkron (EN kanonik, TR paralel — karar).
- [ ] **Step 3:** Kanıt: README.md'deki her sayı Step 1 komut çıktısıyla eşleşir (Faz C bunu auto-gen'e bağlayacak — manuel düzeltme geçici köprü).
- [ ] **Step 4:** Commit: `docs(sprint-172-A4): README 5-drift badge gerçek değer (TR senkron)`

### ⛔ GA-GATE-A: Faz A tamamlandı doğrulaması
- [ ] A1-A4 commit'li; `grep` kanıtları geçer; hiçbir kod/test değişmedi (sadece .md + ADR); `npm run lint:adr` + `tsc --noEmit` temiz.

---

# FAZ C — Auto-Gen Pipeline (tek-hakikat, drift'i kalıcı önler)

Manuel sayı = drift kaynağı. Her sayı/liste tek script'ten üretilir; CI'da stale-check gate.

### Task C1: `scripts/update-readme-stats.mjs` — README/IDENTITY badge auto-gen

**Files:** Create `scripts/update-readme-stats.mjs`; Modify `README.md`/`README-TR.md`/`.deckent/workspace/IDENTITY.md` (marker blokları), `package.json` (script + prebuild hook), Test `tests/scripts/update-readme-stats.test.ts`

- [ ] **Step 1 (RED):** Test yaz — `update-readme-stats.mjs --check` stale badge'de exit≠0, güncel'de 0. RED (script yok).
- [ ] **Step 2 (GREEN):** Script: gerçek kaynaklardan oku (vitest count, `ls dashboard/pages`, `grep registerTool`, `getByType('adr').length`, `ls .deckent/agents`), README/README-TR/IDENTITY'deki `<!-- AUTOGEN:stat -->...<!-- /AUTOGEN -->` bloklarını değiştir. `--check` modu (CI gate) + `--write` modu.
- [ ] **Step 3:** README.md/README-TR.md/IDENTITY.md'ye AUTOGEN marker blokları ekle (A4 manuel değerleri marker içine al).
- [ ] **Step 4:** `package.json`: `"docs:stats": "node scripts/update-readme-stats.mjs --write"`, `"docs:stats:check": "node scripts/update-readme-stats.mjs --check"`; `prepublishOnly`'ye `--check` ekle.
- [ ] **Step 5 (GREEN doğrula):** `npm run docs:stats:check` exit 0; testler PASS.
- [ ] **Step 6:** Commit.

### Task C2: MCP tool/resource + ADR index + CLI ref + agents auto-gen

**Files:** Create `scripts/gen-reference-docs.mjs`; Modify `docs/reference/mcp-tools.md`, `mcp-resources.md`, `docs/adr/README.md`, `docs/reference/cli.md`, `docs/reference/agents.md` (hepsi AUTOGEN); Test `tests/scripts/gen-reference-docs.test.ts`

- [ ] **Step 1 (RED):** Test — gen-reference-docs `--check` stale'de fail.
- [ ] **Step 2 (GREEN):** Script 5 üretici: (a) MCP tools `src/mcp/server.ts` registerTool parse → mcp-tools.md; (b) MCP resources → mcp-resources.md; (c) ADR index `store.getByType('adr')` → docs/adr/README.md tablo; (d) CLI `commander` program introspect → cli.md; (e) agents `store`/`.deckent/agents` → agents.md.
- [ ] **Step 3:** `--check` CI gate + `--write`. `package.json` `docs:ref` + `docs:ref:check`, `prepublishOnly` ekle.
- [ ] **Step 4 (doğrula):** `npm run docs:ref:check` exit 0; üretilen sayılar Faz A değerleriyle tutarlı.
- [ ] **Step 5:** Commit.

### Task C3: `lint:link` dead-link gate + VitePress `ignoreDeadLinks:false`

**Files:** Modify `docs/.vitepress/config.ts`; Create `scripts/lint-links.mjs`; Modify `package.json`

- [ ] **Step 1 (RED):** Test/script — repo'daki .md kırık relatif link'leri tespit eder, kırık varsa exit≠0. RED (mevcut kırık link'ler — SYNTHESIS Wave 4 "VitePress sidebar ölü link katmanı").
- [ ] **Step 2 (GREEN):** `scripts/lint-links.mjs` (relatif .md link + anchor doğrula). `config.ts` `ignoreDeadLinks: false`. `package.json` `lint:link`.
- [ ] **Step 3:** Mevcut kırık link'leri düzelt (Faz B taşımaları link kıracak — bu gate Faz B'yi korur).
- [ ] **Step 4:** Commit.

### ⛔ GA-GATE-C: Faz C + GA flip eligibility
- [ ] C1-C3 commit'li; `npm run docs:stats:check && npm run docs:ref:check && npm run lint:link` hepsi exit 0; `prepublishOnly` gate'leri içerir.
- [ ] **OSS GA FLIP AÇIK:** Faz A (honesty) + Faz C (drift-proof) tam → public flip + beta.2 yayını Alperen onayıyla yapılabilir. Faz B paralel/sonra devam eder, GA'yı bloklamaz.

---

# FAZ B — Yapısal Reorg (geri-dönülebilir, GA-blocking değil)

SYNTHESIS §4.1 ideal ağaç + §4.2 dosya→hedef. Her taşımadan sonra `lint:link` (C3 gate) çalışır.

### Task B1: DB-parity doğrulama (archive git rm ÖN-KOŞULU)

**Files:** Create `scripts/verify-archive-db-parity.mjs` (read-only)

- [ ] **Step 1:** Script: her `.brain/archive/sprint-*.md` + `retro-sprint-*.md` için DB'de karşılık (`store` sprint/retro entry) var mı kontrol et (read-only SELECT). BA-05 backfill sonrası 167 dahil.
- [ ] **Step 2:** Rapor: parity-OK listesi vs DB'de-eksik listesi. **DB'de eksik olan HİÇBİR dosya git rm edilmez** (önce backfill — BA-05 deseni).
- [ ] **Step 3:** Kanıt: `node scripts/verify-archive-db-parity.mjs` → "N dosya parity-OK, M eksik". M>0 ise B2 sadece parity-OK'leri untrack eder, M için ayrı backfill task'ı.
- [ ] **Step 4:** Commit (script + parity raporu).

### Task B2: `.gitignore`/`.npmignore` + archive `git rm --cached`

**Files:** Modify `.gitignore`, `.npmignore` (yoksa create); git untrack

- [ ] **Step 1:** `.gitignore`'a SYNTHESIS §4.3 blokunu ekle (NEXT-SESSION, .brain/archive/sprint-*-tasks/, sprint-*.md, retro-sprint-*.md [yalnız B1 parity-OK], memory.db.bak-*, .deckent/archive/metrics/, .test/, .test-e2e-sprint-*).
- [ ] **Step 2:** `.npmignore` oluştur: §4.3 npmignore (docs/audits/, .audit/, .deckent/, .brain/, deckent-hub/, examples/, scripts/).
- [ ] **Step 3:** `git rm --cached -r` SADECE B1 parity-OK + ignore kapsamı (dosyalar diskte kalır). memory.db ASLA.
- [ ] **Step 4:** Kanıt: `git status` temiz-ish; `npm pack --dry-run` paket boyutu düşmüş, internal state yok; dosyalar diskte mevcut (`ls .brain/archive | head`).
- [ ] **Step 5:** Commit.

### Task B3: Kök dosya → docs/ taşıma (SYNTHESIS §4.2)

**Files:** git mv + link fix per §4.2 tablo

- [ ] **Step 1:** Taşı (git mv, sonra `lint:link` her birinde): `BETA-TRACKER.md`→`docs/release/beta-tracker.md`; `COMPETITIVE-ANALYSIS.md`→`docs/vision/competitive-analysis.md`; `ROADMAP-GOD-LEVEL.md`(root+docs)→`docs/vision/roadmap.md` (birleştir); `BLUEPRINT.md`/`DECKENT-MASTER-BLUEPRINT.md`→`docs/vision/blueprint.md` (birleştir); `VISION.md`→`docs/vision/VISION.md`; `VISION-TR.md`→`docs/vision/VISION-TR.md` (**TR korunur — karar**); `.contracts/api-surface.md`→`docs/reference/api-surface.md` (CLAUDE.md @ref güncelle).
- [ ] **Step 2:** Sil (internal scratch): `NEXT-SESSION.md`, `next-session-prompt.md`, `docs/analysis/full-audit.md` (archive'da var).
- [ ] **Step 3:** Redirect 1-satır: `docs/CHANGELOG.md`→root CHANGELOG; `docs/launch/CONDUCT.md`→root CODE_OF_CONDUCT.
- [ ] **Step 4:** Kanıt: `npm run lint:link` exit 0 (taşıma sonrası 0 kırık); CLAUDE.md/DECKENT.md @ref'leri geçerli.
- [ ] **Step 5:** Commit.

### Task B4: worker-guide 3→1 + ADR-046 dup merge + reference rename

**Files:** consolidate per §4.2

- [ ] **Step 1:** `docs/development/worker-guide.md` + `docs/worker-guide.md` + `.deckent/workspace/WORKER-GUIDE.md` → `docs/guide/workers.md` (canonical); workspace dosyası 1-satır refer (runtime @ref kırılmasın — doğrula).
- [ ] **Step 2:** ADR-046 iki dosya (`046-brain-self-update-hook.md` + `046-brain-self-update-hook-architecture.md`) → tek dosya + Amendment section; DB adr-046 entry ile tutarlı.
- [ ] **Step 3:** 3 reference çifti lowercase tutarlı rename + link fix (audits-149 uyumsuzluğu).
- [ ] **Step 4:** Kanıt: `npm run lint:link` exit 0; ADR-046 tek dosya; DB↔FS ADR parity (B1 deseni).
- [ ] **Step 5:** Commit.

### Task B5: deckent-hub kararı + examples workspace fix

**Files:** `examples/quickstart/package.json`, deckent-hub disposition

- [ ] **Step 1:** `examples/quickstart/package.json` `workspace:*` → `^1.0.0-beta.1` (OSS'te workspace protokolü çözülmez).
- [ ] **Step 2:** deckent-hub kararı (SYNTHESIS "karar" flag): git submodule mi inline+pubkey mi → **Alperen mini-onay** (bu task'ta escalate, otonom değil).
- [ ] **Step 3:** Commit.

### ⛔ GATE-B: Reorg tamamlandı
- [ ] B1-B5 commit'li; `npm run lint:link` + `docs:stats:check` + `docs:ref:check` + `tsc --noEmit` + `npx vitest run` (orchestra+full) hepsi temiz; `npm pack --dry-run` temiz paket; CLAUDE.md/DECKENT.md tüm @ref geçerli; ideal ağaç (SYNTHESIS §4.1) ile diff minimal.

---

## Wave Yapısı (DIRECTIVES için)

| Wave | Task'lar | Bağımlılık |
|------|----------|------------|
| 1 (Faz A) | A1, A2, A3, A4 | paralel (farklı dosyalar) |
| GATE-A | — | A1-4 DONE |
| 2 (Faz C) | C1, C2, C3 | C3 ⊃ A (link'ler A sonrası stabil) |
| GATE-C / **GA FLIP** | — | C1-3 DONE → public flip eligible |
| 3 (Faz B) | B1 → B2 (B1 parity şart) → B3, B4 (B3∥B4) → B5 | B2 blockedBy B1; B3/B4 blockedBy C3 (lint:link gate) |
| GATE-B | — | B1-5 DONE |

Provider: claude. Audit-only DEĞİL — bu sprint dosya YAZAR (doc-reorg). TDD: Faz C scriptleri (kod) RED-GREEN zorunlu; Faz A/B doc — kanıt = grep + `lint:link`/`docs:*:check` gate'leri.

## Kapsam Dışı (ayrı işler)
- **Post-GA integrity-hardening V2:** C-13 RBAC hard-flip + C-14 verify-gate wire + BA-05 ADR-046 hook crash-safe (davranış-değiştiren mimari — bu doc sprinti DEĞİL).
- **Sprint 172 coverage re-audit:** SYNTHESIS §5.3 ~92 potansiyel coverage-gap (core/orchestra alt-dizin tam-liste) — ayrı mini re-audit cycle.
- AEGIS manifesto (ADR-061) public içeriği — `docs/aegis/` iskeleti B3'te oluşur ama içerik ayrı (ADR-061 kapsamı).

## Self-Review (writing-plans)
- Spec coverage: SYNTHESIS §4.1/4.2/4.3 her satırı bir B-task'a map'li; doğrulanmış doc-honesty (C-05/07/13/14/BA-03/C-41) Faz A'da; 3 Alperen kararı (A→C→B, EN+TR paralel, git rm --cached) gömülü. ✓
- Placeholder: yok — her task exact dosya + komut + kanıt. ✓
- Tip/isim tutarlılığı: AUTOGEN marker konvansiyonu C1/C2 ortak; `lint:link` C3'te tanımlanıp B3/B4 gate'i. ✓
