# DIRECTIVES — Sprint 172: Doc-Reorg + OSS GA

## Spec + Plan Referansları

- **Plan (bağlayıcı kontrat):** `docs/superpowers/plans/2026-05-16-sprint-172-doc-reorg-plan.md` (commit `c0678c0`) — her worker kendi Task bölümünü + aşağıdaki **Worker Contract**'ı mutlaka okur. Per-task adım/dosya/kanıt orada.
- **Girdi:** `docs/audits/sprint-171/00-SYNTHESIS.md` §4 (ideal ağaç/dosya→hedef/ignore) + `docs/audits/sprint-171/00-VERIFICATION-LOG.md` (C-05/07, C-13, C-14, BA-03, BA-05 doğrulanmış verdict'ler).
- **Predecessor:** Sprint 171 self-audit + manuel fix-phase (Bug A/B + C-03/C-04 + TMUX-SF FIX, BA-05 backfill `0771f6d`). Bootstrap runtime aktif.
- **Kararlar (Alperen 2026-05-16):** 3 faz tek sprint sıralı A→C→B; EN kanonik + TR tam paralel korunur (hiçbir TR dosya silinmez/birleştirilmez); archive `git rm --cached` (disk'te kalır, geri-dönülebilir, DB-parity önce). memory.db'ye ASLA dokunulmaz.

## Goal

OSS GA öncesi dokümantasyonu (A) kullanıcı-yanıltan drift'lerden arındır, (C) drift'i kalıcı önleyen auto-gen pipeline kur, (B) ideal ağaca yeniden yapılandır. **GA flip kapısı = Faz A+C tam**; Faz B GA'yı bloklamaz, paralel/sonra. Sprint 171 fix-phase bootstrap'ı onardı; bu sprint dokümantasyonu public-ready yapar.

## Brain Planning Instructions

Mode: structured. Wave: 3 (Wave 1 = Faz A 4 paralel, Wave 2 = Faz C 3, Wave 3 = Faz B 5). Max workers: 4. `dependency_pipeline_enabled: false` → Wave geçişleri + GATE doğrulamaları Brain manuel (ADR-047, Sprint 164-171 kanıtlı). **GA-GATE-C sonrası Alperen checkpoint: public flip + beta.2 onayı** (deckent otomatik flip ETMEZ). Wave 2, GATE-A tüm DONE doğrulanmadan başlamaz; Wave 3, GATE-C doğrulanmadan başlamaz. B2 blockedBy B1 (DB-parity şart). Alperen review: sprint başlangıç (plan tablosu) + GA-GATE-C (flip) + finalize. Provider: claude.

## Worker Contract

Tüm worker'lar plan dosyasındaki kendi Task bölümünü + bu Worker Contract'ı mutlaka okur. Özet invariant:

- **Bu sprint dosya YAZAR** (Sprint 171 audit-only değildi — bu farklı): atanan task scope'undaki .md/script/config dosyaları modify edilir. Scope DIŞINA yazma YASAK (ADR-037, auditor `git diff --stat` izler).
- **TDD ZORUNLU (Faz C kod task'ları C1/C2/C3 + B1):** script = production kod → RED-GREEN-REFACTOR, test önce yazılır fail görülür. Faz A/B doc task'ları: kod yok, kanıt = `grep` + `npm run lint:link`/`docs:*:check` gate exit 0.
- **Çıktı dili:** doküman içeriği OSS public için **README.md/VISION.md/CONTRIBUTING vb. = İngilizce (kanonik)**; README-TR.md/VISION-TR.md = Türkçe tam paralel. Worker raporu/notları Türkçe. Hiçbir TR dosya silinmez/birleştirilmez (Alperen kararı).
- **memory.db kuralı:** SADECE read-only SELECT (B1 parity doğrulama). Yazma/DROP/rebuild KESİN YASAK. Archive temizliği `git rm --cached` (disk'te kalır).
- **Kod gerçeği = tek-hakikat:** Faz A'da doc koda hizalanır (kod doğru olan yerde doc düzeltilir, davranış DEĞİŞMEZ). Yeni ADR uydurulmaz; ADR-010 amendment (supersede değil).
- `.tasks/task-<id>.result`: `selfAssessment`, `filesChanged`, Faz C için `coverage` (test var); Faz A/B `coverage: null`.

## GO/NO_GO Criteria

**Faz-gate (plan ⛔ GATE'leri):**

- **GA-GATE-A:** A1-A4 commit'li; `grep` kanıtları geçer; hiçbir kod/test değişmedi (sadece .md+ADR); `npm run lint:adr` + `tsc --noEmit` temiz.
- **GA-GATE-C / OSS FLIP:** C1-C3 commit'li; `npm run docs:stats:check && docs:ref:check && lint:link` hepsi exit 0; `prepublishOnly` gate'leri içerir. **Bu kapı geçilince public flip + beta.2 Alperen onayıyla AÇIK.**
- **GATE-B:** B1-B5 commit'li; `lint:link`+`docs:stats:check`+`docs:ref:check`+`tsc --noEmit`+`npx vitest run` temiz; `npm pack --dry-run` temiz paket; CLAUDE.md/DECKENT.md tüm @ref geçerli.

**Sprint verdict:** **GO** = 3 gate tam. **GO_WITH_TECH_DEBT** = GA-GATE-A+C tam (GA açılabilir) + GATE-B kısmi (≤2 B-task re-iterate backlog). **NO_GO** = GA-GATE-A veya C ihlali (doc-honesty/auto-gen eksik → public flip YASAK).

**Kritik:** Faz B eksikliği GA'yı bloklamaz (kararla post-GA paralel). GA-blocking SADECE Faz A (honesty) + Faz C (drift-proof).

## Sprint 173+ Handoff

Post-GA: integrity-hardening V2 (C-13 RBAC hard-flip + C-14 verify-gate wire + BA-05 ADR-046 hook crash-safe — davranış-değiştiren, ayrı sprint), coverage re-audit (SYNTHESIS §5.3 ~92 potansiyel gap), AEGIS manifesto içeriği (ADR-061).

---

## Task 1: A1 — dependency_pipeline_enabled provenance drift

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: DECKENT.md, .contracts/api-surface.md
- Scope: ./

### Description

C-05/07 doğrulanmış doc-drift. Kod gerçeği: `config.ts:600` default `true`, `:883 ?? true`; `.deckent/config.json:198 false` (bu proje bilinçli override). `DECKENT.md:51` "Sprint 167 flip: true — Wave goes live" bu projede YANLIŞ + `api-surface.md:83` "default since Sprint 156" ile çelişen provenance. Plan Task A1 adımlarını izle: DECKENT.md:51 → kod default true + bu proje false (Brain manuel wave) açıklaması; api-surface:83 → tek doğru köken. Kod/config DEĞİŞMEZ, sadece iki doküman.

**Kanıt:** `grep -n "deckent-dev bu projede bilinçli false" DECKENT.md` → eklendi; iki dosyada çelişki yok.

**Test:** Doc-only — `grep` kanıtı + `tsc --noEmit` temiz (kod değişmedi teyidi).

---

## Task 2: A2 — RBAC + verify-gate enforcement honesty

- Model: sonnet
- Effort: normal
- Skills: system-architect, documentation-writer
- Agent: architect
- Files: CLAUDE.md, .deckent/workspace/IDENTITY.md, .claude/rules/worker-default.md
- Scope: ./

### Description

C-13 + C-14 doğrulanmış. `authority-enforcer.ts:29` "always soft", `worker.ts:480 return true`, ADR-037 `decisions.md:1825` runtime eksik kabul; `enforceVerifyLoop`/`runTestVerifyLoop` 0-caller. Doküman bunu "runtime enforcement" diye abartıyor. Plan Task A2: CLAUDE.md gotcha + IDENTITY → "RBAC compile-time lint + audit-trail; runtime advisory/soft (ADR-037 V1.0 Layer-2 kasıtlı eksik, hard-flip V2)"; worker-default verify → "prompt talimatı, kod-enforce değil". Kod/test DEĞİŞMEZ (hard-flip post-GA V2).

**Kanıt:** `grep -ni "runtime enforcement" CLAUDE.md .deckent/workspace/IDENTITY.md` → her geçiş "soft/advisory" niteleyicili.

**Test:** Doc-only — grep kanıtı; kod/test değişmedi (`git diff --stat src/ tests/` boş).

---

## Task 3: A3 — ADR-010 amendment (7 runtime dep)

- Model: sonnet
- Effort: normal
- Skills: system-architect
- Agent: architect
- Files: docs/adr/010-tek-runtime-dependency.md
- Scope: docs/adr/

### Description

BA-03 doğrulanmış: package.json 7 runtime dep, ADR-010 metni "yalnızca commander" (Sprint 044 CLI-only kalıntısı). Plan Task A3: ADR-010'a **Amendment** bölümü ekle (supersede DEĞİL — accepted kalır) — 7 dep'in her biri sonraki accepted ADR'ye map'li (@modelcontextprotocol/sdk←ADR-017, better-sqlite3←Memory V2, telegraf/discord←ADR-016, zod←plan validation, @noble←ADR-014). Güncel ilke: minimal + ADR-gerekçeli; keyfi ekleme hâlâ yasak. DB adr-010 entry ile tutarlı (kanonik DB ise MemoryStore upsert).

**Kanıt:** ADR-010 Amendment'ta 7 dep ADR-map'li; `npm run lint:adr` geçer.

**Test:** Doc-only — `npm run lint:adr` exit 0.

---

## Task 4: A4 — README 5-drift badge gerçek değer

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: README.md, README-TR.md
- Scope: ./

### Description

C-41/BD-01 doğrulanmış: README "16434+ tests / dashboard pages / 27 MCP tools / 60+ ADR / custom+2 agent" 5 drift bir arada (OSS ilk-vitrin yanılgı). Plan Task A4: gerçek değerleri komutla topla (vitest gerçek pass, `ls src/dashboard/pages`, `grep -c registerTool src/mcp/server.ts`, `getByType('adr').length`, `ls .deckent/agents`), README.md + README-TR.md senkron düzelt (EN kanonik, TR paralel — karar). Manuel düzeltme = Faz C auto-gen'e köprü.

**Kanıt:** README.md her sayı Step 1 komut çıktısıyla eşleşir; README-TR.md senkron.

**Test:** Doc-only — sayı↔komut eşleşme kanıtı.

---

## Task 5: C1 — update-readme-stats.mjs auto-gen + CI gate

- Model: opus
- Effort: high
- Skills: typescript-expert, ci-testing
- Agent: devops-engineer
- Files: scripts/update-readme-stats.mjs, README.md, README-TR.md, .deckent/workspace/IDENTITY.md, package.json, tests/scripts/update-readme-stats.test.ts
- Scope: scripts/, tests/scripts/, ./

### Description

Plan Task C1 (TDD ZORUNLU). RED: `--check` stale badge'de exit≠0 testi (script yok → fail). GREEN: script gerçek kaynaklardan okur (vitest count, dashboard pages, registerTool, ADR DB, agents), README/README-TR/IDENTITY'deki `<!-- AUTOGEN:stat -->` bloklarını değiştirir; `--check`/`--write` modları. A4 manuel değerleri marker içine alınır. package.json `docs:stats`/`docs:stats:check` + `prepublishOnly --check`.

**Kanıt:** `npm run docs:stats:check` exit 0; `tests/scripts/update-readme-stats.test.ts` PASS (RED→GREEN izlendi).

**Test:** TDD — stale-fail + güncel-pass + marker-replace 3+ test.

---

## Task 6: C2 — reference docs auto-gen (MCP/ADR/CLI/agents)

- Model: opus
- Effort: high
- Skills: typescript-expert, api-builder
- Agent: api-builder
- Files: scripts/gen-reference-docs.mjs, docs/reference/mcp-tools.md, docs/reference/mcp-resources.md, docs/adr/README.md, docs/reference/cli.md, docs/reference/agents.md, package.json, tests/scripts/gen-reference-docs.test.ts
- Scope: scripts/, tests/scripts/, docs/reference/, docs/adr/, ./

### Description

Plan Task C2 (TDD). RED: `--check` stale fail testi. GREEN: 5 üretici — MCP tools (`server.ts` registerTool parse), MCP resources, ADR index (`store.getByType('adr')` tablo), CLI (`commander` introspect), agents (DB/.deckent/agents). `--check` CI gate + `--write`. package.json `docs:ref`/`docs:ref:check` + prepublishOnly. Üretilen sayılar Faz A değerleriyle tutarlı.

**Kanıt:** `npm run docs:ref:check` exit 0; test PASS; mcp-tools.md sayısı `grep -c registerTool` ile eşleşir.

**Test:** TDD — 5 üretici × stale-fail/güncel-pass; 5+ test.

---

## Task 7: C3 — lint:link dead-link gate

- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Agent: devops-engineer
- Files: scripts/lint-links.mjs, docs/.vitepress/config.ts, package.json, tests/scripts/lint-links.test.ts
- Scope: scripts/, tests/scripts/, docs/.vitepress/, ./

### Description

Plan Task C3 (TDD). RED: script kırık relatif .md link'te exit≠0 (mevcut kırık link'ler — SYNTHESIS Wave 4). GREEN: `lint-links.mjs` (relatif link + anchor doğrula), `config.ts` `ignoreDeadLinks:false`, package.json `lint:link`. Mevcut kırık link'ler düzeltilir (bu gate Faz B taşımalarını korur — B3/B4 ön-koşulu).

**Kanıt:** `npm run lint:link` exit 0 (mevcut kırıklar düzeltildi); test PASS.

**Test:** TDD — kırık-link-fail + temiz-pass + anchor 3+ test.

---

## Task 8: B1 — archive DB-parity doğrulama (B2 ön-koşulu)

- Model: opus
- Effort: normal
- Skills: database-migration
- Agent: data-engineer
- Files: scripts/verify-archive-db-parity.mjs, docs/audits/sprint-171/archive-parity-report.md
- Scope: scripts/, docs/audits/sprint-171/

### Description

Plan Task B1. Read-only script: her `.brain/archive/sprint-*.md` + `retro-sprint-*.md` için DB'de karşılık (store sprint/retro entry) var mı (read-only SELECT, BA-05 backfill sonrası 167 dahil). Rapor: parity-OK vs DB-eksik liste. **DB-eksik HİÇBİR dosya git rm edilmez** (önce backfill — BA-05 deseni). memory.db SADECE read-only.

**Kanıt:** `node scripts/verify-archive-db-parity.mjs` → "N parity-OK, M eksik" raporu; M dosyaları B2 kapsamı dışı.

**Test:** Read-only script — parity raporu doğruluğu (örnek dosya DB-lookup spot-check).

---

## Task 9: B2 — .gitignore/.npmignore + archive git rm --cached

- Model: sonnet
- Effort: normal
- Skills: git-expert, devops-engineer
- Agent: devops-engineer
- Files: .gitignore, .npmignore
- Scope: ./
- Dependencies: ["172-008"]

### Description

Plan Task B2 (B1 parity ŞART). `.gitignore`'a SYNTHESIS §4.3 blok; `.npmignore` oluştur (§4.3 npmignore). `git rm --cached -r` SADECE B1 parity-OK + ignore kapsamı (dosyalar DİSKTE KALIR). memory.db ASLA. `npm pack --dry-run` temiz paket doğrula.

**Kanıt:** `npm pack --dry-run` internal state yok + boyut düştü; `ls .brain/archive | head` dosyalar diskte; `git status` temiz.

**Test:** Doc/git-only — `npm pack --dry-run` çıktı + disk-mevcudiyet kanıtı.

---

## Task 10: B3 — kök → docs/ taşıma + redirect

- Model: sonnet
- Effort: high
- Skills: documentation-writer, git-expert
- Agent: doc-writer
- Files: docs/vision/, docs/release/, docs/reference/, CLAUDE.md, DECKENT.md
- Scope: docs/, ./
- Dependencies: ["172-007"]

### Description

Plan Task B3 (C3 lint:link gate aktif olmalı). git mv per SYNTHESIS §4.2: BETA-TRACKER→docs/release/, COMPETITIVE-ANALYSIS→docs/vision/, ROADMAP-GOD-LEVEL(root+docs)→docs/vision/roadmap.md (birleştir), BLUEPRINT/MASTER-BLUEPRINT→docs/vision/blueprint.md, VISION.md+VISION-TR.md→docs/vision/ (**TR korunur**), .contracts/api-surface.md→docs/reference/ (CLAUDE.md @ref güncelle). Sil: NEXT-SESSION.md, next-session-prompt.md, docs/analysis/full-audit.md. Redirect: docs/CHANGELOG.md→root, docs/launch/CONDUCT.md→root. Her taşımada `npm run lint:link`.

**Kanıt:** `npm run lint:link` exit 0 (0 kırık); CLAUDE.md/DECKENT.md @ref'leri geçerli (`grep @.contracts` güncellenmiş).

**Test:** Doc-only — lint:link gate + @ref geçerlilik.

---

## Task 11: B4 — worker-guide 3→1 + ADR-046 dup merge + reference rename

- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Agent: doc-writer
- Files: docs/guide/workers.md, docs/adr/, docs/reference/
- Scope: docs/, .deckent/workspace/
- Dependencies: ["172-007"]

### Description

Plan Task B4. 3 worker-guide (docs/development/, docs/, .deckent/workspace/WORKER-GUIDE.md) → docs/guide/workers.md canonical; workspace 1-satır refer (runtime @ref kırılmaz — doğrula). ADR-046 iki dosya → tek + Amendment section, DB adr-046 tutarlı. 3 reference çifti lowercase rename + link fix. Her adımda `npm run lint:link`.

**Kanıt:** `lint:link` exit 0; ADR-046 tek dosya; DB↔FS ADR parity; workspace @ref runtime kırılmadı.

**Test:** Doc-only — lint:link + ADR-046 tekillik + @ref runtime smoke.

---

## Task 12: B5 — deckent-hub kararı + examples workspace fix

- Model: sonnet
- Effort: normal
- Skills: monorepo-expert
- Agent: refactorer
- Files: examples/quickstart/package.json
- Scope: examples/, ./

### Description

Plan Task B5. `examples/quickstart/package.json` `workspace:*` → `^1.0.0-beta.1` (OSS'te workspace protokolü çözülmez). deckent-hub disposition (SYNTHESIS "karar" flag): git submodule mi inline+pubkey mi — **Alperen mini-onay gerekli** (worker bu kararı VERMEZ, checkpoint question yazar, otonom ilerlemez).

**Kanıt:** examples/quickstart/package.json `^1.0.0-beta.1`; deckent-hub kararı Alperen checkpoint'e bağlı (worker önermez, sorar).

**Test:** Doc/config-only — package.json geçerli JSON + version resolve smoke.
