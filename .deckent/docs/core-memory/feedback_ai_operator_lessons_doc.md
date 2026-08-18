---
name: feedback-ai-operator-lessons-doc
description: docs/{tr,en}/playbook/ai-operator-lessons.md yaşayan dokümandır — her sprint/çalışma deneyiminden sonra yeni ders + changelog satırı eklenir
metadata:
  type: feedback
---

# AI-Operatör Dersleri dokümanı — sprint-sonu güncelleme görevi (Alperen, 2026-08-18)

`docs/tr/playbook/ai-operator-lessons.md` + `docs/en/playbook/ai-operator-lessons.md`
ikilisi, deckent'i AI araçlarıyla süren kullanıcılara ve modellere öğretici YAŞAYAN
dokümandır: kendi kullanım hatalarım, dersler, hangi özelliğin/aracın nasıl
kullanılacağı.

**Why:** Kullanıcılar deckent'i AI ajanlarıyla sürecek; oturumlarda ödenen ders
bedelleri dokümante edilmezse her kullanıcı/model aynı hatayı yeniden öder.

**How to apply:** Her sprint/çalışma deneyiminden SONRA: yeni ders varsa iki dile de
"Hata → Neden → Doğru kullanım" kalıbında ekle; alttaki değişiklik günlüğüne tarihli
satır yaz; iki dil senkron tutulur (aynı dosya adı, ayna içerik). Landing zincirinin
doküman adımının parçasıdır — unutulursa landing eksiktir.
İlgili: [[feedback-worker-model-tier-routing]], [[feedback-xverify-claim-discipline]].
