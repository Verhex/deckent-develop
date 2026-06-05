---
name: project_deckent_self_git_mutation_bug
description: "🔴 deckent dogfood'da kendi git ağacına yıkıcı/otonom işlem yapıyor (reset --hard + otonom commit) → uncommitted iş kaybı; Sprint 218 P0"
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**🔴 KRİTİK (2026-06-01, Sprint 216→218 arası keşfedildi):** deckent kendi kaynak ağacında (deckent-dev dogfood) **iki yıkıcı/otonom git işlemi** yapıyor → commit-edilmemiş işi siliyor/ele geçiriyor.

**Bug 1 — worker-spawn git stash/reset:** `src/orchestra/rollback.ts` (`createSafetyPoint` → `git stash push -m deckent-safety-*`; `rollback` → `git reset --hard <sha>` satır ~191) + `src/agents/worker-rollback.ts` (`git stash --include-untracked` scoped). Sprint-217 dashboard'dan başlatılınca worker-spawn working tree'yi reset etti → **Sprint 216'nın TÜM uncommitted modified-file kod değişikliklerini sildi** (server.ts serve-fix, rubric-registry isUserSurfaceTask, routing-engine, task-builder). Untracked YENİ dosyalar (proof-of-function.ts vb.) kaldı → testleri commit'li ama kodu yok → CI 71 hata.

**Bug 2 — otonom commit:** Bir deckent süreci (test/sprint artığı) working tree'yi `"exit-trap-test"` mesajıyla OTONOM commit etti (benim `git commit`'im "nothing to commit" dedi çünkü zaten commit'lenmişti — commit 1ee490b5). deckent kendi git geçmişini yazıyor.

**Why:** Sprint 177 worker-rollback git-stash mekanizması user-project'te mantıklı (worker'ı izole et) ama **dogfood'da deckent KENDİ üstünde çalışıyor** → kendi commit-edilmemiş kaynağını siliyor/commit'liyor. ADR-039 self-modifying detection bunu ayırt edip deckent-dev tree'sini muaf tutmalıydı.

**How to apply:**
- **Sprint 218 P0:** worker-spawn (rollback.ts + worker-rollback.ts) deckent-dev tree'sinde stash/reset/commit YAPMASIN (ADR-039 exemption: self-project tespit → no-op rollback). Otonom commit kaynağını bul + kaldır.
- **Bu fix gelene kadar KORUMA:** (1) her sprint ÖNCESİ commit (commit'li iş stash/reset'te kaybolmaz), (2) sprint'i **dashboard'dan DEĞİL CLI'dan** başlat (dashboard-start tetikledi), (3) push öncesi `git log -1` ile commit mesajını + içeriği DOĞRULA (otonom commit kapmış olabilir).
- **Disk-verify dersi pekişti:** sprint sonrası `git status` + reflog kontrol et — uncommitted iş duruyor mu.

**🛟 KURTARMA YOLU (2026-06-02 doğrulandı — "kayıp" sandığımız iş kurtarılabilir):** Sprint 223 sırasında reflog `reset: moving to HEAD` tekrarladı, working tree sprint-222'ye döndü → TÜM Sprint 223 uncommitted WIP gitti SANDIK. AMA reset **`git stash`'e auto-stash** yapmış: `git stash list` → `stash@{0}: Teleport auto-stash` (313+ satır WIP orada duruyordu). **Olay sonrası İLK adım:** `git stash list` + `git stash show --stat stash@{0}` — iş çoğu zaman stash'tedir, pure-loss DEĞİL. Kurtarma: `git checkout stash@{0} -- <yol>` ile **seçici** al (çakışan/eskimiş dosyaları atla), `stash pop` DEĞİL `apply`/checkout (stash'i koru), durable commit'e taşı (stash kırılgan). Not: teleport/ultraplan handoff'u da auto-stash tetikleyebilir.

İlişkili: [[feedback_db_silmek_yasak]] (veri kaybı yasağı), [[project_dashboard_realrun_findings]] (dashboard-start donma + bu reset), [[feedback_build_mcp_restart_coordination]].
