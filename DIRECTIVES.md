# DIRECTIVES — Sprint 067: Post-Audit Kalan İşler + Dogfooding Fix'leri

## Goal: Audit'ten kalan tek P1 (paket boyutu), sprint-066 izlemesinden doğan 3 fix (job sonuç, retro detay, task status), kod kalitesi iyileştirmeleri (any temizliği). V2 routing ilk gerçek sprint'i — agent/skill atamalarını doğrula.

---

## Task 1: npm Paket Boyutu Optimizasyonu — 768KB → <500KB
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: .npmignore, package.json, tsconfig.json
- Scope: .npmignore, package.json, tsconfig.json

### Description
**A) .npmignore Optimizasyonu:** `npm pack --dry-run` ile paket icerigi analiz et. Gereksiz dosyalari tespit et: `*.map`, `*.d.ts.map`, `dist/**/*.test.*`, `dist/dashboard/` (dashboard ayri deploy ediliyorsa). `.npmignore`'a ekle.

**B) Paket Boyut Kontrolu:** `npm pack` ile paket olustur, boyutu olc. Hedef: <500KB. `du -sh *.tgz` ile dogrula.

**C) Build Artifact Temizligi:** `tsconfig.json` `declarationMap` false ise zaten map uretilmiyor — kontrol et. `sourceMap` prod build'de kapatilabilir mi degerlendir.

**Kanit:**
- `npm pack --dry-run 2>&1 | tail -5` → boyut <500KB
- `wc -l .npmignore` → yeni satirlar eklenmis

**Test:** 2+ test (paket boyut ve icerik kontrolu)

---

## Task 2: Job State Sprint Sonuçları — finalizeSprint → job file
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-controller.ts, src/mcp/tools/job-runner.ts
- Scope: src/orchestra/, src/mcp/tools/, tests/orchestra/, tests/mcp/

### Description
**A) finalizeSprint() → writeJobState enrichment:** Sprint tamamlandiginda `writeJobState()` cagirisina `tasks` ve `metrics` alanlarini ekle. Her task icin: taskId, title, evaluation (DONE/GO_WITH_TECH_DEBT/NO_GO), assignedAgent, assignedSkills, worker notes (ilk 200 karakter). Job dosyasina yazilsin.

**B) MCP status tool'da sonuc gosterimi:** `deckent_status` tool'u sprint COMPLETE oldugunda job dosyasindan task sonuclarini da dondurmeli.

**C) Terminal output icin job dosyasindaki sonuclari kullan:** Sprint bittikten sonra `deckent status` calistirildiginda cleanup_delay icinde .tasks/ dosyalari okunamazsa bile job dosyasindan sonuclari gosterebilmeli.

**Kanit:**
- `cat .deckent/jobs/sprint-*.json | grep -c "tasks"` → en az 1 (son sprint)
- Job dosyasinda `metrics.totalTasks`, `metrics.done` alanlari var

**Test:** 4+ test

---

## Task 3: Retro Detay Zenginlestirme — Worker Notes Aktarimi
- Model: sonnet
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-reporter.ts, src/orchestra/sprint-controller.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**A) writeRetrospective() → worker notes:** Retro yazarken her task'in .result dosyasindan `notes` alanini oku. Retro'daki "Learnings" bolumune task basina ilk 150 karakter notu ekle.

**B) Sprint log'a da notes aktar:** `.brain/sprints/sprint-NNN.md` dosyasina her task icin kisa not ekle.

**C) Task status PENDING → EXECUTING guncelleme:** `sprint-controller.ts` worker spawn edildiginde task JSON'daki `status` alanini `EXECUTING` olarak guncelle. Su an PENDING kaliyor.

**Kanit:**
- `grep "notes\|Notes" .brain/RETRO.md` → task notlari gorunuyor
- Spawn sonrasi `cat .tasks/task-*.json | grep '"status"'` → EXECUTING

**Test:** 4+ test

---

## Task 4: any Kullanimi Temizligi — 10 Adet, 7 Dosya
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/init.ts, src/cli/commands/spawn.ts, src/orchestra/temp-skill-generator.ts, src/orchestra/outcome-tracker.ts, src/orchestra/mid-sprint-adapter.ts, src/orchestra/sprint-controller.ts, src/orchestra/task-builder.ts
- Scope: src/cli/commands/, src/orchestra/

### Description
audit'te tespit edilen 10 `any` kullanimini `unknown` veya uygun tip ile degistir:
- init.ts (2 adet)
- spawn.ts (1 adet)
- temp-skill-generator.ts (3 adet)
- outcome-tracker.ts (1 adet)
- mid-sprint-adapter.ts (1 adet)
- sprint-controller.ts (1 adet)
- task-builder.ts (1 adet)

Her biri icin: `grep -n ": any\|as any" <dosya>` ile bul, uygun tip ile degistir, `tsc --noEmit` ile dogrula.

**Kanit:** `grep -rn ": any\|as any" src/ --include="*.ts" | grep -v "node_modules\|test" | wc -l` → 0 (veya sadece kasitli olanlar)

**Test:** tsc --noEmit temiz yeterli, ek test gerekmez.

---

## Task 5: V2 Routing Dogrulama — Audit + IDENTITY Guncelleme
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/analysis/full-audit-sprint065.md, .deckent/workspace/IDENTITY.md, .brain/PROJECT-IDENTITY.md
- Scope: docs/, .deckent/workspace/, .brain/

### Description
**A) Audit Raporu Guncelle:** `docs/analysis/full-audit-sprint065.md` dosyasindaki tum P1/P2/P3 maddelerini sprint 066-067'de cozulmus olarak isaretle. Her maddeye `[DONE sprint-066]` veya `[DONE sprint-067]` etiketi ekle.

**B) IDENTITY.md Guncelle:** Test sayisi (11,918), sprint sayisi (67+), modul sayilari guncelle.

**C) PROJECT-IDENTITY.md Guncelle:** Sprint 067 learnings, routing_engine: v2 default bilgisini ekle.

**Kanit:**
- `grep -c "DONE sprint-06" docs/analysis/full-audit-sprint065.md` → 10+
- `grep "11,9" .deckent/workspace/IDENTITY.md` → var

**Test:** Bu task test gerektirmez — dokumantasyon.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- V2 routing aktif — agent/skill atamalari dogru olmali
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
