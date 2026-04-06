# DIRECTIVES — Sprint 095: Stats Sync + RETRO Doğrulama Sprint'i

## Goal: MCP reconnect sonrası yeni kodun çalıştığını doğrulamak için minimal sprint. Bu sprint bittiğinde agent.json/manifest.json stats güncellenmiş olmalı, RETRO.md'de Skill Performance tablosu görünmeli.

---

## Task 1: Skill İsim Uyumsuzluğu Düzeltme
- Model: sonnet
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: .deckent/routing/learnings.json
- Scope: .deckent/

### Description
learnings.json'daki 4 skill ID'si .deckent/skills/ altındaki manifest'lerle eşleşmiyor:
- `refactoring-expert` → manifest'te `refactorer` olarak olabilir veya hiç yok
- `security-expert` → manifest'te `security-specialist`
- `ci-cd-expert` → manifest'te `ci-testing`
- `frontend-expert` → manifest'te `react-specialist`

A) .deckent/skills/ altındaki tüm manifest ID'lerini listele
B) learnings.json'daki skill ID'leriyle karşılaştır
C) Eşleşmeyen ID'ler varsa learnings.json'da düzelt (manifest ID'sine göre rename)
D) Veya manifest'te alias/redirect ekle

**Kanıt:** `node -e "..."` ile learnings skill ID'leri ve manifest ID'leri tam eşleşiyor

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- Bu sprint'in asıl amacı finalizeSprint'in yeni kodla çalışarak stats sync ve RETRO skill tablosunu doğrulamak
