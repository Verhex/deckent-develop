---
name: feedback_directive_kanit_letter_vs_goal
description: "Directive kanıt-grep'i hedefi değil lafzı ölçerse worker dürüstçe DONE der ama gerçek hedef tutmaz. Sprint 211 F5 wire-gap: prompt-evolution+adaptive-agent 'caller ≥1' kanıtını def-dosyası içi sayımla geçti ama hâlâ 0-external-caller dormant."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Sprint 211 (2026-06-01) disk-verify bulgusu: F5 "dormant→canlı wire" task'ları (211-009 prompt-evolution, 211-010 adaptive-agent) worker tarafından **dürüstçe DONE** işaretlendi ve kanıt-grep'lerini geçti — ama modüller hâlâ **0 external caller** (gerçekten çağrılmıyor). Sadece 211-011 cross-sprint-analyzer gerçekten canlı (evolve.ts CLI çağırıyor).

**İki kök neden (worker sahtekarlığı DEĞİL — directive tasarım kusuru):**
1. **Kanıt-grep def-dosyasını sayıyordu.** Directive: `grep -rc "adaptAgent|AdaptiveAgent|adaptive-agent" src/ | grep -v test → caller ≥1`. Bu grep tanım dosyasının (adaptive-agent.ts) kendi içindeki eşleşmeleri de sayar → worker modüle internal helper ekleyip kanıtı sağlar, ama hiçbir DIŞ modül çağırmaz. "caller ≥1" lafzen doğru, hedefen (runtime'da gerçekten çağrılıyor) yanlış.
2. **Tek-dosya/tek-scope bölünmesi "wire et" ile "çağıracak modülü" ayırdı.** 211-010 scope=src/agents/ → outcome-tracker.ts'ye (src/orchestra/) caller ekleyemezdi. Worker bunu notunda DÜRÜSTÇE bildirdi ("wiring to outcome-tracker is outside scope.filesWrite"). Doğru davrandı ama hedef yapısal olarak imkânsızdı.

**Why:** Evrimsel mimari ([[project_deckent_god_level_vision]]) ana farklılaştırıcı. "wire DONE" ama 0-caller = modül hâlâ ölü kod. Roadmap'e "F5-001/002 DONE" yazıldı ama gerçek runtime entegrasyon yok — doc-gerçek sapması riski ([[feedback_trust_brain_eval_not_worker]] diske güven prensibinin directive-tasarım versiyonu).

**How to apply (gelecek "wire/dormant→canlı" directive'leri):**
- **Kanıt-grep'i def-dosyasını DIŞLA:** `grep -rl "X" src/ | grep -v test | grep -v "<def-file>.ts"` → external caller ≥1. Lafız = hedef olsun.
- **Wire task'ının scope'u, çağıracak modülü İÇERSİN.** "prompt-evolution'ı outcome-tracker'a bağla" task'ının scope.filesWrite'ı HEM prompt-evolution.ts HEM outcome-tracker.ts (veya sprint-controller call-site) olmalı. Aksi halde wire yapısal imkânsız.
- **Alternatif:** wire'ı çağıran modülün sahibi task'a ver ("outcome-tracker'a evolvePrompt çağrısı ekle"), modül-tanımı task'a değil.
- Disk-verify'da her "wire/canlı" iddiası için external-caller grep'i ÇALIŞTIR — worker self-assessment'a değil diske güven.

**✅ DOĞRULANDI (Sprint 212, 2026-06-01):** Bu ders DIRECTIVES'e uygulanınca işe yaradı. Sprint 212'de 6 F5 modülü (prompt-evolution, adaptive-agent, agent-genealogy, agent-retirement, specialization-drift, prompt-rollback) dormant→canlı bağlandı — HER task'ın scope.filesWrite'ı çağıran modülü içerdi (sprint-reporter/outcome-tracker/promotion-pipeline) ve kanıt-grep def-dosyasını dışladı. Disk-verify: 6/6 gerçek external caller (sprint 211'in 0-caller tuzağı tekrar ETMEDİ). Reçete: (1) wire-task scope = modül + çağıran, (2) kanıt `grep -rl X src/ | grep -v test | grep -v "<def>.ts" → ≥1`.

İlgili: [[feedback_trust_brain_eval_not_worker]] (diske güven), [[feedback_fix_prompt_quality]] (CLI index.ts wire gap benzeri), [[feedback_agent_routing_imbalance]] (aynı sprint diğer kusur), [[project_deckent_god_level_vision]] (evrimsel mimari değeri).
