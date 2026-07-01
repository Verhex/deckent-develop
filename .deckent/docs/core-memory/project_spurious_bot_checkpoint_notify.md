---
name: project_spurious_bot_checkpoint_notify
description: "'Checkpoint plan onay bekliyor' bildirimi her sprint-start'ta çıkıyor ama GERÇEK gate YOK — çalışan agentic Telegram bot'u (deckent bot listen) üretiyor; sprint bloke değil, aksiyon gerekmez. §4G surface-gap bug."
metadata: 
  node_type: memory
  type: project
  originSessionId: d4f38f18-5c91-4207-b0a0-903c98297d01
---

**Tespit (2026-06-06, eleme yöntemiyle doğrulandı):** Her `deckent start` sonrası kullanıcı telefonuna "🚨 [deckent] Onay gerekiyor: Checkpoint plan onay bekliyor" düşüyor — ama **arkasında gerçek bloke-gate YOK.** Sprint normal koşuyor (EXECUTING, bloke değil). Elenen mekanizmalar: (1) sprint-controller `human_checkpoints` → config `[]`, `.deckent/checkpoints/` dizini yok (`waitForHumanApproval` `sprint-controller.ts:911` guard'lı, çağrılmadı); (2) `notify-log.jsonl` → `human-checkpoint-required` event'i yok; (3) `panic-guard` → mesajı farklı ("Worker blocked"); (4) Nervous → `nervous-pending.json` yok, nervous config `{}`.

**Kaynak:** Çalışan **agentic Telegram bot'u** (`deckent bot listen`, BOT-003 model-driven, `src/connectors/bot-agentic.ts`). LLM-driven olduğu için bildirim metnini kendi üretiyor (kodda birebir string yok) → sprint lifecycle'ını "onay gerekli" diye **yanlış ifade ediyor.** (Nervous system de KAPALI — config `{}`, state/process yok — yani oradan da gelmiyor.)

**KESİN KANIT (Alperen teyidi, 2026-06-06):** (1) `deckent checkpoint` listesi BOŞ (gerçek pending yok); (2) **onay VERİLMESE DE sprint devam ediyor** (sprint 233-237 boyunca her seferinde tamamlandı). → Notification %100 non-blocking + non-actionable false-alarm. Aksiyon GEREKMEZ.

**Why:** [[project_human_interaction_wire_gap]] "safe-but-deaf" surface-gap'i — bot "onay gerekli" anons ediyor ama gerçek gate yok = false/aksiyonsuz alarm; kullanıcı paniğe kapılıyor.

**How to apply:** Mesaj görülünce → sprint bloke DEĞİL, aksiyon gerekmez (yok say). Susturmak: `deckent bot stop` / `kill <bot.pid>` (`.deckent/bot.pid`). **Gerçek fix (§4G task adayı):** bot "onay gerekli" demeden önce gerçek pending kontrol etsin (`config.human_checkpoints` boş değil mi + `.deckent/checkpoints/*-pending` + `nervous-pending.json`); yoksa anons etmesin. Gerçek checkpoint olursa onay: `deckent checkpoint approve <sprintId> <phase>`. İlgili: [[project_human_interaction_wire_gap]] · [[feedback_wiring_pct_vs_user_working]].
