---
name: feedback_shared_worktree_branch_hazard
description: "deckent-dev tek worktree'de eşzamanlı Claude oturumları HEAD'i paylaşır → branch sürüklenir; git cerrahisinden önce branch-doğrula"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b58b9b9f-efad-4833-898a-df905f5ffc52
---

deckent-dev'de Alperen birden fazla Claude oturumunu **aynı dizinde** (tek `git worktree`, paylaşımlı HEAD) eşzamanlı çalıştırabiliyor. 2026-06-09: WM-7-eval'i `main`'e commit'ledikten SONRA başka bir oturum HEAD'i `feat/docs-json-ai-author`'a checkout edip kendi commit'ini (`3efe172e docs.json-AI-author spec`) attı; benim sonraki 2 commit'im (routing+planner-fix) farkında olmadan o branch'e düştü, main eksik+bozuk kaldı. Reflog `checkout: moving from main to feat/...` satırını gösterdi (benim yapmadığım).

**Why:** Paylaşımlı worktree'de HEAD global state — bir oturumun checkout'u diğerini etkiler; commit'ler branch'ler arası karışır; `git push origin main` o an current-branch'i değil main'i push eder (kafa karıştırıcı). **Ek failure-mode (2026-06-27, repo-temizlik):** `.git/index` de paylaşımlı. Ben `git mv`/`git rm` ile değişiklik stage edip commit'lemeden beklerken, başka oturum `git add -A`/`git commit -a` ile geniş commit attı → benim staged taşıma+silme'm onun `fix(token)` commit'ine (`a5e62a39`) **sızdı** ve push'landı. Geriye kalan `AD` (added-in-index/deleted-in-worktree) artığı commit'lenseydi silinen dosyayı diriltecekti.

**How to apply:** Her commit/push öncesi `git branch -vv` + `git status -sb` ile branch'i DOĞRULA. HEAD beklenenden (main) sürüklenmişse kör ilerleme — kullanıcıya bildir. Çok-adımlı git işinde (taşıma/silme) **stage-edip-bekleme**; başka oturum index'ini ezebilir/commit'ine alabilir → mümkünse pathspec'li tek `git commit -- <path>` ile hızlı kapat, sonra `git diff --cached --stat` + `git cat-file -e HEAD:<silinen>` ile sızma/artık denetle. Başka agent'ın commit'i (sen oluşturmadığın) varsa onu bozma; kendi commit'lerini `main`'e cherry-pick'le, feature branch'i dokunma. Kullanıcı onayıyla cherry-pick yaptıktan sonra mutlaka tsc + etkilenen suite'i koş + push'la doğrula. İlgili: [[sprint_254_followup_fixes]] · [[feedback_db_silmek_yasak]].
