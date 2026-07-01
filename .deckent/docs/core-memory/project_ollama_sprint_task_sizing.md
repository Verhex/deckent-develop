---
name: project_ollama_sprint_task_sizing
description: "Bulgu (gece-loop İter-6, 2026-06-08) — qwen3.6/ollama sprint-worker BÜYÜK agentic doc-task'ta NO_GO (artifact üretmedi); küçük-scope kuralı"
metadata: 
  node_type: memory
  type: project
  originSessionId: b58b9b9f-efad-4833-898a-df905f5ffc52
---

**Bulgu (2026-06-08, gece-loop İter-6 / Sprint 243 WK-8):** qwen3.6/ollama sprint-worker'ı **büyük agentic doc-task'ı tamamlayamadı** → 0/2 NO_GO, **archive/sprint-243 BOŞ (sıfır artifact: .result/.log yok)**. Disk-verify: hedef doc'lar (multi-provider.md x2) DEĞİŞMEMİŞ.

**Kök (muhtemel):** Task fazla büyüktü qwen3.6 için — **5 kod-dosyası oku + 2 doc'u accurate code-grounded rewrite + agentic-loop** (max-iter 25, ~74 tok/s). Autonomous-ollama'nın çalışan kanıtı (Sprint 238-öncesi, `ab8f25d8`) **küçük** bir doc'tu (+15 satır). Sprint-236 mixed-fleet de **basit** doc'tu. Büyük/karmaşık agentic task → qwen3.6 bütçeyi aşıyor/artifact üretmeden düşüyor. ( kırılganlık bağlamı.)

**KURAL (advisor "düşük-stakes qwen3.6" rafine):** qwen3.6/ollama worker = **KÜÇÜK + düşük-stakes** task (kısa doc katkısı, tek-dosya, basit). **Substantial / multi-file / code-grounded / accuracy-kritik = claude.** Gece-loop'ta local-model'i yalnız küçük-scope kalemlere route et.

**Açık follow-up (gündüz):** ollama sprint-worker neden sıfır-artifact düştü (max-iter mi, scope-enforce write-block mı docs/'a, agentic-harness sprint-context wrinkle mı) — `project_ollama_worker_stub_gap` + autonomous-RCA bağlamında incele. Brain "0/2" (1 planladım) → FIX-retry veya synthetic-double; kontrol et.

**Aksiyon:** WK-8 claude/sonnet'e re-route edildi (Sprint 244). memory.db NO_GO'da bile intact (260→265, wipe yok).

İlgili: [[sprint_242_provider_free_safe]] · [[project_deckent_core_model_and_provider]] · [[feedback_trust_brain_eval_not_worker]] (disk-verify gerçek-NO_GO'yu doğruladı).
</content>
