---
name: project_test_home_leak
description: "Bazı vitest testleri HOME'u OS-tmpdir yerine proje/cwd'ye işaret edince kök'e dotfile sızdırıyor (.deckent/.keyring secret, .codex/.gemini/.npm/.bash_history). Worker DEĞİL — host test izolasyon açığı. Sprint 215 fix."
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Sprint 214 (2026-06-01) bulgusu: proje kökünde `.deckent/.keyring` (64-hex AES master key — credential-encryption.ts), `.codex/config.toml` (deckent-mcp registration), `.gemini/projects.json`, `.npm/`, `.bash_history` (içerik: `echo MARKER_ONE/MARKER_TWO` = PTY/terminal test marker'ı) belirdi.

**KÖKEN — worker DEĞİL:** docker worker HOME=`/tmp/deckent-home` + proje `/workspace`'e read-only mount → worker host'a yazamaz. Bunlar **HOST-tarafı vitest testlerinden** geldi: bazı testler `HOME`'u proje/cwd'ye işaret eden izolasyonla çalışıyor → `homedir()` proje kökünü dönüyor (`credential-encryption.ts:26 KEYRING_DIR = join(homedir(),'.deckent')`) → araçlar (credential store, gemini-config, codex sync, npm, PTY-bash) config'lerini kök'e yazıyor.

**İşlevler:** `.keyring` = saklanan provider credential'larını şifreleyen master key (gerçek secret); `.codex`/`.gemini` = provider CLI'lara deckent-mcp registration (ADR-018 multi-env); `.npm` = npx cache; `.bash_history` = stray PTY test artifact.

**Risk + alınan önlem:** Sadece `.keyring` gerçek secret'tı — `.gitignore`'a guard eklendi (`.bash_history`/`.deckent/.keyring`/`.codex/`/`.gemini/`/`.npm/`/`.tmp-test/`/`.test-e2e-*/`). Commit'ten korundu.

**How to apply / fix (Sprint 215):** testler `HOME`'u `os.tmpdir()` altında bir sandbox'a set edip `afterEach`/`afterAll`'da temizlemeli — proje köküne ASLA sızdırmamalı. Etkilenen aileler: credential, gemini-config/codex-sync, embedded-terminal PTY (MARKER testleri). Bir test-HOME-isolation helper + lint guard (kök'te beklenmeyen dotfile → fail) önerilir.

İlgili: [[feedback_db_silmek_yasak]] (.deckent içeriği hassas), [[project_deckent_runtime_ecosystem]], [[feedback_wiring_pct_vs_user_working]].
