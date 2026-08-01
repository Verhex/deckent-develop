# Sprint 167 Memory Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** memory.db'de eksik olan Sprint 167 kayıtlarını (0 satır → BA-05 CONFIRMED) gerçek artefaktlardan türetilmiş, non-destructive upsert ile geri yükle. Uydurma YOK — her alan bir gerçek dosyaya izlenebilir.

**Architecture:** `fe35c49` (Sprint 166 backfill) precedent'inin birebir aynası: tek bağımsız `.mjs` script, `--dry-run` önizleme + `--apply` modu + PRE/POST state delta + APPLY öncesi taze `.bak`. Yazma SADECE `MemoryStore.upsert()` (insert-if-absent / field-level update + entry_history). DB silme/rebuild YOK ([[feedback_db_silmek_yasak]]). Sonra 4 `.md` export yeniden üretilir.

**Tech Stack:** Node ESM `.mjs`, `better-sqlite3` (MemoryStore), mevcut `scripts/sprint-166-memory-backfill.mjs` şablonu.

**HARD GATE:** Bu plan DB-write'tır. Audit boyunca DB read-only'di; bu İLK yazma. **Alperen onayı olmadan APPLY çalıştırılmaz.** Sunum → onay → execute.

---

## Kaynak Artefakt → Entry Eşlemesi (provenance, uydurma yok)

| Entry | type | Kaynak gerçek dosya(lar) |
|-------|------|--------------------------|
| `sprint-log-167` | sprint | `.brain/sprints/sprint-167.md` (metrics tablosu + 10 task durum tablosu birebir) |
| `retro-sprint-167` | retro | git `0da523c` (debug-phase1: 10 bug, 5 cluster, Sprint 168 Brain Repair seed) + `863de9a` (phase2: cluster×references + cascade graph) commit gövdeleri + `.deckent/sprint-167-gate.json` |
| `mem-sprint-167` | memory | `.audit/sprint-167/T1-code-inventory.md`, `T2-doc-inventory.md`, `T3-adr-compliance.md`, `T4-memory-integrity.md` (+ T5/T6/T7) audit deliverable özetleri |

**Pattern entry:** ATLANIR. 166'nın da pattern entry'si yok; 167 audit'inde net tekrar-eden ihlal pattern'i artefaktla kanıtlanmadıkça uydurma sayılır. (168'in `pattern-sprint-168-stale_heartbeat`'i runtime auditor üretimiydi, 167 read-only audit değil.)

**ADR entry:** ATLANIR. Sprint 167 = Read-Only Self-Audit, mimari karar ÜRETMEDİ (ADR'leri compliance-check etti, oluşturmadı). Yeni ADR uydurmak yasak.

## Entry Şekilleri (peer 166/168 kalıbı birebir — read-only doğrulandı)

```
sprint-log-167:
  id: 'sprint-log-167'  type: 'sprint'  title: 'Sprint 167 Log'
  sprint_id: 'sprint-167'  sprint_num: 167  status: 'active'  decay_exempt: false
  tags: ['sprint-167','self-audit','read-only','bug-cluster','sprint-168-seed']
  body: sprint-167.md tam içeriği (metrics + task tablosu)
  metadata: { source: '.brain/sprints/sprint-167.md', backfill: 'sprint-171-BA-05', precedent: 'fe35c49' }

retro-sprint-167:
  id: 'retro-sprint-167'  type: 'retro'  title: 'Sprint sprint-167 Retrospective'
  sprint_id: 'sprint-167'  sprint_num: 167  status: 'active'  decay_exempt: false
  tags: ['sprint-167','retro','self-audit','10-bug','5-cluster']
  body: Read-Only Self-Audit retrospektifi — 0da523c+863de9a commit gövdelerinden
        (10 bug / 5 cluster / Sprint 168 Brain Repair seed / 9 DONE 1 NO_GO 2 tech-debt)
  metadata: { source: 'git:0da523c,863de9a + .deckent/sprint-167-gate.json', backfill: 'sprint-171-BA-05' }

mem-sprint-167:
  id: 'mem-sprint-167'  type: 'memory'  title: 'Sprint sprint-167 Learnings'
  sprint_id: 'sprint-167'  sprint_num: 167  status: 'active'  decay_exempt: false
  tags: ['sprint-167','learnings','self-audit','dead-code','adr-compliance','memory-integrity']
  body: T1-T7 audit deliverable özet öğrenimleri (.audit/sprint-167/T*.md'den)
  metadata: { source: '.audit/sprint-167/T1..T7*.md', backfill: 'sprint-171-BA-05' }
```

`changedBy` = `'sprint-167-backfill'` (entry_history audit trail için).

---

## Task 1: Backfill script (fe35c49 şablonundan)

**Files:**
- Create: `scripts/sprint-167-memory-backfill.mjs`
- Reference (şablon, salt-oku): `scripts/sprint-166-memory-backfill.mjs`
- Source artifacts (salt-oku): `.brain/sprints/sprint-167.md`, `.audit/sprint-167/T1-code-inventory.md`, `T2-doc-inventory.md`, `T3-adr-compliance.md`, `T4-memory-integrity.md`, `.deckent/sprint-167-gate.json`

- [ ] **Step 1: 166 şablonunu oku** — `scripts/sprint-166-memory-backfill.mjs` (dry-run/apply/PRE-POST delta/.bak iskeleti). Aynen yeniden kullan, içerik 167'ye uyarla.

- [ ] **Step 2: Script yaz** — `scripts/sprint-167-memory-backfill.mjs`:
  - CLI: `node scripts/sprint-167-memory-backfill.mjs` (dry-run varsayılan) | `--apply` (yazar)
  - PRE state: `SELECT type,count(*) ... WHERE sprint_id='sprint-167'` (beklenen: 0)
  - 3 entry'yi yukarıdaki şekilden inşa et; body'ler gerçek dosyalardan `readFileSync` ile okunur (uydurma yok — sprint-167.md birebir; retro/mem audit özetleri kaynak alıntılı)
  - `--apply` değilse: entry id/type/title/tag/body-uzunluk/kaynak önizle, ÇIK (yazma yok)
  - `--apply` ise: önce `cp .brain/memory.db .brain/memory.db.bak-pre-sprint167-backfill-<ts>`; sonra her entry `store.upsert(input, 'sprint-167-backfill')`
  - POST state + DELTA tablosu yazdır (PRE 0 → POST 3)

- [ ] **Step 3: Dry-run çalıştır (YAZMA YOK)**

Run: `node scripts/sprint-167-memory-backfill.mjs`
Expected: 3 entry önizleme (sprint-log-167/retro-sprint-167/mem-sprint-167), "DRY-RUN — no writes", PRE sprint-167=0.

- [ ] **Step 4: ⛔ ONAY KAPISI** — dry-run çıktısını Alperen'e sun. **Onay olmadan Step 5 YOK.**

- [ ] **Step 5: APPLY (yalnız onay sonrası)**

Run: `node scripts/sprint-167-memory-backfill.mjs --apply`
Expected: `.bak` oluştu, 3 upsert OK, POST sprint-167: sprint=1 retro=1 memory=1, DELTA +3.

- [ ] **Step 6: Doğrula (read-only)**

Run:
```
node -e "const D=require('better-sqlite3');const db=new D('.brain/memory.db',{readonly:true});console.table(db.prepare(\"SELECT id,type,sprint_id,sprint_num,status FROM entries WHERE sprint_id='sprint-167'\").all());console.log('FTS:',db.prepare(\"SELECT count(*) c FROM entries_fts WHERE entries_fts MATCH 'sprint-167'\").get());db.close();"
```
Expected: 3 satır + FTS5 match ≥3 (dual-layer trigger sync — fe35c49'daki gibi). Peer-parity: 166/168 ile aynı id/type/status kalıbı.

- [ ] **Step 7: Export yeniden üret**

Run: `npx deckent memory export` (rebuild DEĞİL — sadece DB→.md snapshot)
Expected: `.brain/exports/{summary,memory}.md` 167 satırı içerir; Recent Learnings artık 167'yi atlamaz.

- [ ] **Step 8: Commit**

```bash
git add scripts/sprint-167-memory-backfill.mjs .brain/exports/summary.md .brain/exports/memory.md docs/audits/sprint-171/00-VERIFICATION-LOG.md
git commit -m "chore(sprint-167-memory): BA-05 backfill — sprint/retro/mem 167 (gerçek artefakt, fe35c49 precedent, non-destructive upsert)"
```
(`.brain/memory.db` gitignored — commit edilmez; `.bak-*` zaten .gitignore'da.)

---

## Rollback

APPLY sorunlu olursa: `cp .brain/memory.db.bak-pre-sprint167-backfill-<ts> .brain/memory.db` (Step 5 yedeği). upsert non-destructive olduğundan tek risk = yanlış body; rollback yedekle anında. DB silme/rebuild ASLA.

## Doğrulama Checklist (kapanış)

- [ ] PRE sprint-167 = 0, POST = 3 (sprint+retro+memory)
- [ ] Her entry body'si kaynak dosyaya izlenebilir (metadata.source), 0 uydurma alan
- [ ] FTS5 `sprint-167` match ≥3 (trigger sync OK)
- [ ] Peer-parity: id/type/status/decay_exempt 166-168 kalıbı
- [ ] exports/summary.md Recent Learnings 167'yi içerir
- [ ] `.bak` mevcut; DB silme/rebuild kullanılmadı; sadece upsert
- [ ] entry_history'de 3 create kaydı (changedBy='sprint-167-backfill')

## Kapsam Dışı (ayrı iş)

ADR-046 hook crash-safe/idempotent fix (kök sebep — gelecekte tekrar etmesin) = post-GA integrity-hardening V2 sprinti. Bu plan SADECE tarihsel 167 verisini kurtarır, hook'u onarmaz.
