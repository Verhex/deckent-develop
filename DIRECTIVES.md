# DIRECTIVES — Sprint 074: Dokümantasyon Taraması + Güncelleme

## Goal: Sprint 073 test fix'leri ve Sprint 072 değişikliklerini yansıtacak şekilde tüm dokümantasyonu tara, güncelle ve tutarlı hale getir. doc-writer agent + documentation-writer skill aktif kullanılacak.

---

## Task 1: README.md Güncellemesi — Test Sayıları + Sprint Bilgisi
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: README.md
- Scope: README.md

### Description
README.md'deki istatistikleri güncelle:

A) Test sayısı: 12,160+ → 12,176+ (gerçek: 12,161 passed + 15 skipped = 12,176 total)
B) Sprint sayısı: 71+ → 73+ (sprint-071 + sprint-072 + sprint-073 tamamlandı)
C) Test dosyası sayısı: 476 test dosyası
D) Coverage bilgisi varsa güncelle
E) "Sprint 072: Tier generalizasyonu" ve "Sprint 073: Dogfooding test fix" bilgilerini yansıt
F) Version hâlâ 0.2.0-beta.3 — değişmedi

Sadece sayısal verileri ve sprint referanslarını güncelle. Yapıyı DEĞİŞTİRME.

**Kanıt:** `head -20 README.md` → güncel sayılar

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 2: CHANGELOG.md + docs/CHANGELOG.md Güncelleme
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: CHANGELOG.md, docs/CHANGELOG.md
- Scope: CHANGELOG.md, docs/

### Description
Sprint 072 ve 073 değişikliklerini CHANGELOG'a ekle. Keep a Changelog formatı:

Sprint 072 (zaten kısmen var — kontrol et):
- Changed: Plan tier generalizasyonu (max_plan→performance, max5x_plan→balanced, pro_plan→economic)
- Changed: Init wizard genel provider seçimi (Claude-specific kaldırıldı)
- Changed: Model API ID'leri güncellendi (claude-opus-4-6, claude-sonnet-4-6)
- Changed: sprint-controller.ts god object split — sprint-phases.ts extract
- Changed: README.md güncel özellikler

Sprint 073:
- Fixed: 100 test regresyonu düzeltildi (43 fs mock, 16 brain mock, 9 doctor logic, 23 stack/CI, 3 integration)
- Fixed: 0 fail, 12,161 test passed

docs/CHANGELOG.md'de detaylı format, root CHANGELOG.md'de özet.

**Kanıt:** `grep "sprint-073\|Sprint 073" docs/CHANGELOG.md` → entry var

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 3: .brain/ Dokümantasyon Tutarlılığı — RETRO, MEMORY, PROJECT-IDENTITY
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/PROJECT-IDENTITY.md, .brain/DECISIONS.md
- Scope: .brain/

### Description
.brain/ dosyalarını güncelle:

A) PROJECT-IDENTITY.md:
- Test sayısı: 12,176+ (12,161 passed + 15 skipped)
- Sprint sayısı: 73+
- Test dosyası: 476
- Son sprint: sprint-073 (dogfooding test fix)

B) DECISIONS.md: Sprint 072-073 ile ilgili yeni karar varsa ekle:
- Tier generalizasyonu kararı (ADR formatında)
- God object split kararı (sprint-phases.ts)

Sadece sayısal güncellemeler ve yeni ADR'ler. Mevcut içeriği DEĞİŞTİRME.

**Kanıt:** `grep "12,176\|73+" .brain/PROJECT-IDENTITY.md` → güncel

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 4: DECKENT.md + CLAUDE.md Tutarlılık Kontrolü
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: DECKENT.md, CLAUDE.md
- Scope: DECKENT.md, CLAUDE.md

### Description
DECKENT.md ve CLAUDE.md'deki referansları kontrol et ve güncelle:

A) Module sayıları doğru mu? (orchestra 42 modules, core 48 modules, vb.)
- sprint-phases.ts eklendi — orchestra modül sayısı artmış olabilir
B) Agent sayısı: 9 built-in → doğru mu? (doc-writer, test-writer, security-auditor, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian)
C) Skill sayısı: 11 built-in → doğru mu?
D) CLI komut sayısı: 33+ → doğru mu?
E) MCP tool/resource sayısı: 16 tools + 9 resources → doğru mu?
F) Test sayısı referansları güncelle

Sadece sayısal tutarsızlıkları düzelt. Yapıyı DEĞİŞTİRME.

**Kanıt:** `grep "modules\|built-in\|tools\|resources" CLAUDE.md` → tutarlı sayılar

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 5: docs/SPRINT-LOG.md Güncelleme
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/SPRINT-LOG.md
- Scope: docs/

### Description
docs/SPRINT-LOG.md dosyasına Sprint 072 ve 073 entry'lerini ekle:

Sprint 072: Faz 2 — Genel Kullanılabilirlik
- 5 task, X done, X tech debt, X no-go (git log'dan al)
- Tier generalizasyonu, init wizard, model IDs, README, god object split

Sprint 073: Dogfooding — Test Regression Fix
- 5 task, 5 done, 2 tech debt, 0 no-go
- 100 test fix (43+16+9+23+3), 17m 41s süre
- Agent: test-writer, Skill: testing-expert

Mevcut format ve stile uy.

**Kanıt:** `grep "Sprint 073\|sprint-073" docs/SPRINT-LOG.md` → entry var

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Quality Rules
- tsc --noEmit MUST pass (dokümantasyon source'a dokunmamalı)
- Mevcut testlerde 0 regresyon
- Tüm sayılar gerçek verilere dayalı olmalı — tahmin YAPMA
- Keep a Changelog formatına uy
- %100 GO hedefli