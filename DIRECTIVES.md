# DIRECTIVES — Sprint 098: Dokümantasyon + Sprint Output + History Fix

## Goal: RETRO Done sayacı düzelt, sprint history 5 sprint döndürsün, docs güncellemeleri (ModelRegistry, yeni agentlar/skilller), ANALYSIS güncelle. Sprint output tetiklenmesini doğrula.

---

## Task 1: RETRO Done Sayacı — GO_WITH_TECH_DEBT = Done Olarak Sayılmalı
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts
- Scope: src/orchestra/

### Description
RETRO.md Agent/Skill Performance tablosunda Done sütunu hep 0 veya düşük. GO_WITH_TECH_DEBT başarılı sonuçtur ve Done olarak sayılmalı.

A) `buildAgentPerformance()` fonksiyonunda evaluation kontrol mantığını incele:
- DONE → done++
- GO_WITH_TECH_DEBT → debt++ (ama Done'a da eklenmeli!)
- NO_GO → noGo++

B) Doğru mantık: Done = DONE + GO_WITH_TECH_DEBT (ikisi de başarılı tamamlama). Debt sütunu sadece GO_WITH_TECH_DEBT olanları gösterir. Mevcut yapıda Done sadece DONE'u sayıyor, GO_WITH_TECH_DEBT'i atlatıyor.

C) Aynı düzeltmeyi `buildSkillPerformance()` için de uygula.

**Kanıt:** Sprint çalıştırıldıktan sonra RETRO.md'de Agent Performance tablosunda Done > 0

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/sprint-reporter*.test.ts` → 0 fail.

---

## Task 2: Sprint History — Son 5 Sprint Döndürmeli
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, src/cli/commands/history.ts
- Scope: src/orchestra/, src/cli/

### Description
`deckent history --last 5` sadece 2 sprint döndürüyor. 97 sprint var ama çoğu görünmüyor.

A) Sprint log dosyalarının nerede tutulduğunu kontrol et:
- .brain/sprints/ altında sprint-NNN.md dosyaları var mı?
- history komutu hangi dizini okuyor?
- parseSprintLog() formatı güncel sprint log formatıyla uyuşuyor mu?

B) Sorunu teşhis et ve düzelt — muhtemelen:
- Sprint log dosyaları archive'a taşınmış ve history oraya bakmıyor
- Veya decay sırasında silinmiş
- Veya parse formatı uyuşmuyor

C) En az son 10 sprint'in history'de görünmesini sağla

**Kanıt:** `deckent_history --last 5` → 5 sprint döndürmeli

**Test:** `tsc --noEmit` temiz.

---

## Task 3: ANALYSIS-2026-04-02.md Güncel Durum Güncellemesi
- Model: opus
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/ANALYSIS-2026-04-02.md
- Scope: docs/

### Description
ANALYSIS yol haritasını Sprint 097 sonuçlarıyla güncelle.

A) Faz 2 Otonom Adaptasyon → TAMAMLANDI (ModelRegistry, tier-based routing, config v2)
B) Mevcut durum özetini güncelle:
- Toplam sprint: 97
- Agent: 18 (16 built-in + 2 temp)
- Skill: 21
- MCP: 19 tool + 8 resource
- CLI: 34+ komut
- ModelRegistry: 13 model, 3 provider, tek kaynak
C) P2 matrisindeki kalan maddeleri güncelle
D) Sprint 097 metriklerini ekle

**Kanıt:** `grep "Sprint 097\|ModelRegistry\|97" docs/ANALYSIS-2026-04-02.md | wc -l` → 3+

**Test:** Dosya valid markdown.

---

## Task 4: README + DECKENT.md ModelRegistry Özelliği Dokümante
- Model: opus
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: README.md, README-TR.md, DECKENT.md
- Scope: ./

### Description
ModelRegistry özelliğini ve yeni modelleri dokümante et.

A) README.md Features bölümüne ekle:
- "Model Registry: 13 models, 3 providers, tier-based routing"
- "Provider-agnostic config: brain_tier/worker_tier instead of model names"
- Model listesini güncelle (3 Claude + 6 OpenAI + 4 Gemini)

B) README-TR.md aynı güncellemeler

C) DECKENT.md:
- Model tablosunu güncelle (yeni modeller: gemini-3.1-pro-preview, gpt-4.1-mini)
- Tier açıklamasını ekle (premium_plus, premium, standard, economy)
- Agent sayısını güncelle (9→16 built-in, artı 2 temp)
- Skill sayısını güncelle (11→21)

**Kanıt:** `grep "Model Registry\|13 model\|16 built-in\|21.*skill" README.md DECKENT.md | wc -l` → 4+

**Test:** Dosyalar valid markdown.

---

## Task 5: PROJECT-IDENTITY + CLAUDE.md Sayı Güncellemeleri
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/PROJECT-IDENTITY.md, CLAUDE.md, .deckent/workspace/IDENTITY.md
- Scope: .brain/, ./, .deckent/

### Description
Sayıları güncelleye — yeni agent/skill/model sayıları.

A) PROJECT-IDENTITY.md:
- Agent: 16 built-in (9'dan güncelle)
- Skill: 21 (11'den güncelle)
- Sprint: 97+
- Core modules: model-registry.ts ve mode-presets.ts eklendi → sayı güncelle

B) CLAUDE.md:
- Agent sayısı: 16 built-in
- Skill sayısı: 21 built-in
- Core modules sayısı güncelle (model-registry.ts, mode-presets.ts eklendi)

C) IDENTITY.md:
- Agents: 16 built-in
- Skills: 21
- Sprints: 97+
- Features: ModelRegistry ekle

**Kanıt:** `grep "16 built-in\|21.*skill\|97" CLAUDE.md .brain/PROJECT-IDENTITY.md .deckent/workspace/IDENTITY.md | wc -l` → 6+

**Test:** Dosyalar valid markdown.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- RETRO Done sütunu GO_WITH_TECH_DEBT'i de saymalı
- History en az 5 sprint döndürmeli
- Tüm sayılar güncel (agent 16, skill 21, model 13, sprint 97)
- %100 GO hedefli
