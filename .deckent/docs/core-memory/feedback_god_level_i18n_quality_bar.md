---
name: feedback_god_level_i18n_quality_bar
description: "deckent'te doğrudan kod yazarken god-level/enterprise kalite çıtası — i18n-first (hardcode string YASAK), teknik borç bırakma, ilk seferde doğru"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

deckent üzerinde **doğrudan el-kodlama** yaparken (hybrid dogfood: REPL/TUI/CLI) god-level, enterprise-grade çalış. En kritik kural: **kullanıcıya görünen string'i ASLA hardcode etme** — tümü `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr) üzerinden. Mekanizma modülleri (TUI/render/controller) **string-free** olur; label'lar caller'dan enjekte edilir, İngilizce default.

**Why:** Alperen (2026-06-03) `chat-pinned-tui.ts`'e hardcode Türkçe koymamı yakaladı: "yarın i18n dil-bağımsız yapacağımızda bunlar hep teknik borç. god-level enterprise grade bir üründe bu şekilde mi çalışırsın." Her seferinde kaliteyi düzeltmek için prompt harcanıyor — bu israf.

**How to apply:** Kod yazmadan önce sor: "god-level/enterprise mi, i18n-temiz mi, borç bırakıyor mu?" User-facing metin → getMessage. Kısa-yol/placeholder/MVP yok; eksik bırakıyorsan açıkça işaretle. Kalıcı kural CLAUDE.md "⚠️ Quality Bar — Direct Hand-Coding" bölümüne eklendi (her oturum yüklenir). İlgili: [[feedback_no_minimum_no_mvp_deckent]] · [[feedback_proof_of_function_dod]] · [[project_deckent_god_level_vision]]
