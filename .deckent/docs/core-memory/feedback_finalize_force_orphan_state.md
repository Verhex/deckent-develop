---
name: feedback_finalize_force_orphan_state
description: "finalize --force sprint-state'i COMPLETED yapmıyor + pids temizlemiyor → sonraki start \"orphan sprint\" hatası; manuel temizlik"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Bug (2026-06-02, Sprint 222):** `deckent finalize --force` RETRO/MEMORY/config yazar AMA `.deckent/sprint-state.json`'ı `COMPLETED` yapmaz (`status:ACTIVE, phase:EXECUTE` kalır) + `.deckent/pids/<sprint>.pid` (dead PID) temizlemez. Sonuç: bir sonraki `deckent start` → **"Error: Orphan sprint detected: sprint-NNN (PID xxx is dead). Run with --auto-approve to auto-archive, or --force to skip."**

**Why:** Orphan-detection `sprint-state.json status==ACTIVE` + ilgili PID dead kombinasyonuna bakar. finalize --force bu iki marker'ı temizlemediği için tamamlanmış sprint "orphan" görünür, yeni sprint'i bloke eder.

**How to apply (hızlı çözüm — manuel temizlik):**
```bash
# 1. sprint-state COMPLETED yap
node -e "const fs=require('fs');const f='.deckent/sprint-state.json';const s=JSON.parse(fs.readFileSync(f,'utf8'));s.status='COMPLETED';s.phase='DONE';fs.writeFileSync(f,JSON.stringify(s,null,2))"
# 2. dead PID marker sil
rm -f .deckent/pids/<sprint>.pid .deckent/pids/<sprint>.snapshot.json
# 3. doğrula
deckent start --dry-run   # orphan hatası gitmiş olmalı
```
Alternatif (deckent'in önerdiği): `deckent start --auto-approve` (orphan auto-archive) veya `--force` (skip check) — ama bunlar orphan-state'i bırakır/atlar, temiz değil.

**Gelecek iş maddesi (Sprint 223+):** finalize (özellikle --force) sprint-state.json'ı COMPLETED yapmalı + pids temizlemeli (orphan bırakmamalı). İlgili: [[feedback_brain_synthetic_nogo_disk_verify]] (finalize-force downgrade), [[feedback_deckent_kill_approval_required]].

**EK bulgular (2026-06-10, sprint-267 kurtarması):** zaten-finalize edilmiş sprint'te `finalize --force` yeniden koşarsa:
- **FINALIZE-RECOUNT:** agent/skill stats'ı İKİNCİ kez sayar — worker .result'larında `evaluationDecision` boş olduğu için hepsini **başarısız-use** olarak işler (uses+N, success+0 → success-rate düşer).
- **FINALIZE-ARCHIVE-BLIND:** yalnız `.tasks/`'taki task'ları görür — arşivlenmiş task'lar (267-003) toplam/retro'dan düşer ("6/6" yerine "5/5"), Duration=0ms yazar.
- memory.db sprint-log/retro entry'lerini ve managed-docs metriklerini bu yarı-doğru veriyle ÜZERİNE yazar (CC'nin elle düzelttiği kayıtlar dahil). Düzeltme reçetesi: committed-doğru dosyaları `git checkout`, DB'yi `MemoryStore.update()` ile yeniden yaz, `deckent memory export`.
Fix adayları RESUME-RACE paketiyle birlikte (MASTER-PLAN EK 2026-06-09/10 satırı).
