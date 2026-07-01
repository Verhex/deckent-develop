---
name: feedback_wiring_pct_vs_user_working
description: "Feature %'leri iç-wiring'i ölçer, kullanıcının gerçekten kullanabildiğini DEĞİL. Durum raporlarken end-to-end user surface'leri (serve/chat/UI) gerçekten dene, sadece 'wired' deme."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Sprint 212 sonrası (2026-06-01) Alperen canlı denedi: MASTER-PLAN "F2 native chat ~%90, F7 dashboard ~%75" diyordu ama kullanıcı olarak: `deckent chat` çalışmadı (host claude/codex CLI PATH'te gerekiyor — Path B), `npx deckent serve` çalışmadı (POST 401, API token dashboard'a inject edilmiyor — `DECKENT_API_AUTH_DISABLED=1` workaround), web UI/UX kötü.

**Why:** Feature yüzdeleri **iç-wiring**i ölçüyor ("loop kuruldu, fonksiyon var"), **kullanıcı-gözü çalışan UX**'i değil. "Wired" ≠ "kullanılabilir". Developer-face (Sprint Mode) gerçekten çalışıyor (212 sprint dogfood) ama Assistant/Company-face yüzeyleri wiring var, user-ready değil. Bu boşluk raporlarda gizleniyordu.

**How to apply:**
- Durum raporlarken **iki ayrı eksen** kullan: (1) wiring/% (iç), (2) user-working (uçtan-uca gerçekten çalışıyor mu). İkisini karıştırma.
- Bir yüzey "DONE/%X" demeden önce **kullanıcının çalıştıracağı komutu gerçekten dene** (serve, chat) veya kodda uçtan-uca yolu doğrula (token inject ediliyor mu, host-CLI gerekiyor mu).
- [[feedback_trust_brain_eval_not_worker]] (diske güven) prensibinin UX versiyonu: feature-flag/% değil, gerçek kullanıcı akışı kanıt.
- Yeni yüzey (IDE ext) eklemeden ÖNCE mevcut yüzeyleri (serve/chat/dashboard) user-ready yap (Sprint 213 Wave A).

İlgili: [[feedback_trust_brain_eval_not_worker]], [[feedback_directive_kanit_letter_vs_goal]] (lafız≠hedef benzeri), [[project_deckent_runtime_ecosystem]].
