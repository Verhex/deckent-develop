# DIRECTIVES — codex-prefix T8 CANARY (tek-codex-task; 2026-08-21)

## Goal

Prefix-mimarisinin gerçek-binary canary'si: bayraklar açıkken
(prompt.codex_core_channel + codex_suppress_project_doc) codex worker'ının
çekirdek-disiplini model_instructions_file kanalından aldığını, inline-core'un
düştüğünü ve AGENTS.md'nin user-role'e girmediğini CANLI koşuda kanıtlamak.
Görev gerçek-iş taşır (canary yapay-yük değildir). Tek görev; codex.

## Task 1: AI-operatör dersi 26 (pgrep kendi-desen tuzağı; iki dil senkron)

### Description
docs/tr/playbook/ai-operator-lessons.md ve docs/en/playbook/ai-operator-lessons.md
dokümanlarına ders 26 eklenir (mevcut format; changelog'a 2026-08-21 satırı):
(26) pgrep/grep ile süreç-bekleme yazarken DESEN KENDİ komut-satırını da
eşleyebilir — `bash -c "... pgrep -f 'X' ..."` zinciri X'i kendi metninde
taşıdığından kendini bulur ve sonsuz bekler (bugün iki vaka: settlement-zinciri
'dist/cli/entry.js start' desenini kendi bot-start metninde buldu; watcher
kendi verdict-desenini bekledi). Çare: pgrep çıktısından kendi-PID/desen-taşıyan
shell'leri ele (`grep -v $$`ya da desen-parçalama 'st''art'), ya da beklemeyi
PID-bazlı yap (`kill -0 <pid>`), süreç-adına değil.
İki dil madde-eşdeğer olmalı.
- Files: docs/tr/playbook/ai-operator-lessons.md, docs/en/playbook/ai-operator-lessons.md
- Test: npx tsc --noEmit
- Model: gpt-5.6-sol

### GO Criteria
Ders 26 iki dosyada mevcut ve madde-eşdeğer; changelog 2026-08-21 güncel;
mevcut numaralandırma bozulmadı; diff yalnız bu iki dosyada.
