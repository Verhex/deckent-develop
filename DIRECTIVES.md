# DIRECTIVES — Sprint 077: Dokümantasyon Güncelleme + Push Hazırlık

## Goal: Sprint 073-076 sonuçlarını dokümantasyona yansıt. CHANGELOG, SPRINT-LOG, PROJECT-IDENTITY, MEMORY güncel olsun. Push'a hazır temiz state.

---

## Task 1: CHANGELOG + SPRINT-LOG Güncelleme
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/CHANGELOG.md, docs/SPRINT-LOG.md, CHANGELOG.md
- Scope: docs/, CHANGELOG.md

### Description
Sprint 076 değişikliklerini CHANGELOG ve SPRINT-LOG'a ekle:

Sprint 076:
- Fixed: Stale heartbeat root cause (finalizeHeartbeat + auditor DONE skip)
- Added: 10 dashboard API integration test
- Added: Graceful shutdown (SIGINT → interruptActiveSprint + killAllSessions)
- Changed: God object split faz 3 — result-collector.ts extract
- Changed: BETA-ROADMAP güncel

Root CHANGELOG.md'deki özeti de güncelle.

docs/SPRINT-LOG.md'ye Sprint 076 entry'si ekle.

Keep a Changelog formatı. Section başlıkları İngilizce, açıklamalar Türkçe.

**Kanıt:** `grep "Sprint 076\|sprint-076" docs/CHANGELOG.md docs/SPRINT-LOG.md` → entry var

**Test:** Bu task test gerektirmez.

---

## Task 2: .brain/ Güncelleme — PROJECT-IDENTITY + DECISIONS
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/PROJECT-IDENTITY.md, .brain/DECISIONS.md
- Scope: .brain/

### Description
.brain/ dosyalarını Sprint 076 sonuçlarıyla güncelle:

A) PROJECT-IDENTITY.md:
- Test sayısı: 12,196 (12,181 passed + 15 skipped)
- Sprint sayısı: 76+
- Yeni modüller: result-collector.ts, sprint-utils.ts
- Yeni dosyalar: VISION.md, .pre-commit-config.yaml, .secrets.baseline

B) DECISIONS.md: Yeni ADR'ler (varsa):
- ADR: Graceful shutdown stratejisi (SIGINT → interruptActiveSprint)
- ADR: God object split stratejisi (faz 1-3: phases → utils → result-collector)

Sadece sayısal güncellemeler ve yeni ADR'ler.

**Kanıt:** `grep "12,196\|76+" .brain/PROJECT-IDENTITY.md` → güncel

**Test:** Bu task test gerektirmez.

---

## Task 3: CLAUDE.md + DECKENT.md Modül Sayısı Güncelleme
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: CLAUDE.md, DECKENT.md
- Scope: CLAUDE.md, DECKENT.md

### Description
Yeni eklenen modülleri CLAUDE.md Architecture bölümüne ekle:

- orchestra/ altına: result-collector.ts açıklaması ekle (sprint-utils.ts zaten Sprint 075'te eklendi mi kontrol et)
- Modül sayılarını doğrula — `ls src/orchestra/*.ts | wc -l` ile gerçek sayıyı al

DECKENT.md'de de tutarlılı��ı kontrol et.

**Kanıt:** `grep "result-collector" CLAUDE.md` → var

**Test:** Bu task test gerektirmez.

---

## Quality Rules
- tsc --noEmit MUST pass (source'a dokunulmamalı)
- Mevcut testlerde 0 regresyon
- Tüm sayılar gerçek verilere dayalı
- %100 GO hedefli