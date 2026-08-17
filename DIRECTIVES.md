# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-18 (7078 package-2 kapanışı sonrası truth-sync). Aktif run YOK.

- Son kapanan wave: **sprint-548 — HORIZON package 2** (3/4 dogfood-DONE; 004 scope-duvarı
  el-wire'landı). Shell-risk + tool-wide grant + audit event + parity + local-llm context
  LANDED; canlı testin token-brick bug'ı (quadratic re-count) fresh-token deltasıyla
  düzeltildi; SPAWN skill-persistence hayaleti emekli. Sol pre-commit xverify CONFIRMED
  (receipt …0b0921e01). Kanıt: MASTER 7078.
- Model dağıtımı (Alperen): worker default gpt-5.6-sol; per-task Model: satırlarıyla
  opus-5/sonnet-5 karışımı + her turda 1 task local-llm Qwen (agentic başarı analizi).

DOGFOOD_MODE=ON bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir.
