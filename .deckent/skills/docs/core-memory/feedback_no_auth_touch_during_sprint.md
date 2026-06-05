---
name: feedback_no_auth_touch_during_sprint
description: "Sprint çalışırken /login, claude logout, ~/.claude/.credentials.json edit YASAK — worker container'lar Claude CLI auth kaybeder, silent fail (exitCode=0, .result boş)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ab1189ae-cd3b-4eb4-af83-29df68e2064b
---

**Kural (Alperen 2026-05-24, Sprint 192 dogfood):** Sprint çalışıyorken **HİÇBİR auth touchpoint çalıştırma** — /login, claude logout, ~/.claude/.credentials.json edit. Worker container'lar host'tan mount edilmiş credential dosyasını kullanır; auth refresh sırasında dosya değişir ve worker'lar Claude CLI'a bağlanamaz.

**Sonuç (failure mode):**
- Worker container `claude` komutunu çalıştırır
- Auth fail → CLI hata fırlatır ama subprocess exitCode=0 döner (silent)
- Worker `.result` yazmadan exit
- Brain "no result" → synthetic NO_GO (Sprint 191 hotfix worker-liveness gate buna aldanır, container "dead" olarak işaretler)
- Fix-task spawn olur → fix worker'lar da auth-lost → cascade silent fail

**Kanıt (Sprint 192, 2026-05-24):**
- Sprint başında /login → ~/.claude/.credentials.json yenilendi (471 byte timestamp 13:22)
- 6 worker (192-001..006) login öncesi spawn edildi → tümü real result
- 192-012..019 (8 task) login sonrası spawn edildi → hepsi silent fail (`{exitCode:0, notes:"Worker exited without writing result"}`)
- Brain raporu: 4 DONE / 20 NO_GO (yanıltıcı, gerçek 12 DONE)

**How to apply:**
1. Sprint başlatmadan ÖNCE auth status doğrula: `claude auth status` veya `ls -la ~/.claude/.credentials.json`
2. Sprint çalışırken `/login`, `claude logout`, credential edit YASAK — sprint bitene kadar bekle
3. Eğer auth zorunluysa: `deckent kill --all` → auth yenile → `deckent recover` ile sprint resume
4. Sprint 193+: W-AUTH stream — pre-spawn auth health check (worker spawn öncesi `claude --version && echo $?` validate), auth-fail durumunda fail fast (exitCode=1) so ki Brain "auth-lost" tag'iyle ayırt edebilsin

**RC pattern:**
- Claude CLI subprocess exitCode=0 ile auth fail döndürür (silent)
- Worker stdin/stdout boş — `.result` yazma adımına ulaşamaz
- Brain'in "exit clean ama .result yok" durumunda **liveness probe yetersiz**: container "dead" görür ama auth-fail vs gerçek crash ayırt edemez

**Sprint 193 fix önerisi (W-AUTH-1):** Worker startup'ta `claude auth status` çağır, fail ise `.result` ile `{selfAssessment:'NO_GO', notes:'AUTH_FAILED'}` yaz — Brain bunu real result olarak işler, synthetic NO_GO yazmaz, fix-task spawn etmez, retro'da "Auth failures: N" başlık çıkar.

**Related:** [[feedback_no_synthetic_results]] (sentetik NO_GO yasak), [[feedback_docker_oom_false_no_go]] (false NO_GO başka kaynak).
