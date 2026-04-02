# DIRECTIVES — Sprint 085: MCP/CLI Parity — Parametre Eşitleme + Eksik Komutlar

## Goal: ADR-022 uyumu: MCP tool parametrelerini CLI ile eşitle, eksik CLI/MCP komutlarını ekle. Altyapı komutları (attach, web, serve) CLI-only olarak belgelenir.

---

## Task 1: MCP Tool Parametre Zenginleştirme — init, start, status, doctor
- Model: sonnet
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/mcp/tools/init.ts, src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/mcp/tools/doctor.ts, src/mcp/tools/retro.ts, src/mcp/tools/history.ts
- Scope: src/mcp/

### Description
CLI'daki parametreleri MCP tool'larına ekle:

A) `deckent_init` — şu an 0 parametre, CLI'da 9 var. Ekle:
- `mode?: string` — plan tier (performance/balanced/economic/api)
- `language?: string` — dil (en/tr)
- `projectName?: string` — proje adı
- `force?: boolean` — mevcut yapıyı yeniden oluştur
- `auto?: boolean` — otomatik algılama modu (wizard atlama)

B) `deckent_start` — şu an sadece `autoApprove`. Ekle:
- `dryRun?: boolean` — plan göster, spawn etme
- `force?: boolean` — pre-flight atla
- `timeout?: number` — sprint max süresi (ms)
- `sandbox?: boolean` — sandbox modunda çalıştır

C) `deckent_status` — şu an 0 parametre. Ekle:
- `json?: boolean` — ham JSON çıktı
- `verbose?: boolean` — detaylı çıktı

D) `deckent_doctor` — şu an 0 parametre. Ekle:
- `profile?: boolean` — sistem profili göster
- `json?: boolean` — ham JSON çıktı

E) `deckent_retro` — 0 parametre. Ekle:
- `sprintId?: string` — belirli sprint'in retrosunu oku

F) `deckent_history` — 0 parametre. Ekle:
- `last?: number` — son N sprint
- `json?: boolean` — ham JSON çıktı

Her parametreyi Zod schema'sına ekle ve handler'da kullan. Parametreler opsiyonel — mevcut davranış bozulmamalı.

**Kanıt:** `grep "force\|dryRun\|json\|verbose\|profile" src/mcp/tools/init.ts src/mcp/tools/start.ts src/mcp/tools/status.ts src/mcp/tools/doctor.ts` → parametreler tanımlı

**Test:** `tsc --noEmit` temiz. Mevcut MCP testlerinde 0 regresyon.

---

## Task 2: CLI set-directives Komutu
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/set-directives.ts, src/cli/index.ts
- Scope: src/cli/

### Description
MCP'de `deckent_set_directives` var ama CLI'da yok. CLI komutu ekle:

A) `src/cli/commands/set-directives.ts` oluştur:
```bash
deckent set-directives --content "# DIRECTIVES — Sprint 086\n..."
deckent set-directives --file directives-draft.md
deckent set-directives  # stdin'den oku (pipe desteği)
```

B) Parametreler:
- `--content <string>` — doğrudan içerik
- `--file <path>` — dosyadan oku
- Parametre yoksa stdin'den oku (pipe: `cat draft.md | deckent set-directives`)

C) İçeriği DIRECTIVES.md'ye yaz (mevcut MCP tool ile aynı mantık)

D) Başarı mesajı: "DIRECTIVES.md updated ({N} task blocks detected)"

E) `src/cli/index.ts`'e (veya `commands/index.ts`'e) komutu register et

F) messages.ts'e çift dilli mesajlar ekle

**Kanıt:** `grep "set-directives\|setDirectives" src/cli/commands/set-directives.ts` → komut var

**Test:** `tsc --noEmit` temiz.

---

## Task 3: MCP agent_list + skill_list Tool'ları
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/mcp/tools/agent-list.ts, src/mcp/tools/skill-list.ts, src/mcp/tools/index.ts
- Scope: src/mcp/

### Description
CLI'da `deckent agent list` ve `deckent skill list` var ama MCP'de yok. Ekle:

A) `deckent_agent_list` MCP tool:
- Parametre: yok (tümünü listele)
- Dönüş: agent dizisi — her biri: id, name, type (built-in/temp), uses, successRate
- `.deckent/agents/` dizininden agent.json dosyalarını oku

B) `deckent_skill_list` MCP tool:
- Parametre: yok
- Dönüş: skill dizisi — her biri: id, name, category, triggers
- `.deckent/skills/` dizininden manifest.json dosyalarını oku

C) `src/mcp/tools/index.ts`'e her iki tool'u register et

D) Tool annotations: readOnlyHint=true, destructiveHint=false

**Kanıt:** `grep "agent_list\|skill_list" src/mcp/tools/index.ts` → register edilmiş

**Test:** `tsc --noEmit` temiz. MCP tool sayısı 17→19.

---

## Task 4: ADR-022 Parity Dokümantasyonu
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: .brain/DECISIONS.md, DECKENT.md
- Scope: .brain/, DECKENT.md

### Description
ADR-022'yi güncelleyerek CLI-only ve MCP-only komutları belgele:

A) `.brain/DECISIONS.md`'ye ADR-022 güncellemesi:
```
## ADR-022: CLI/MCP Feature Parity (Updated Sprint 085)

CLI-only komutlar (altyapı/terminal):
- attach, spawn, watch — tmux oturum yönetimi
- dashboard, web, serve — sunucu/UI başlatma
- upgrade, onboard — kurulum sihirbazları
- plugin install/list/create — eklenti yönetimi

MCP-only komutlar:
- (yok — tüm MCP tool'ların CLI karşılığı var)

Tam parity (19 MCP tool = 19 CLI komutu):
init, set-directives, plan, start, status, doctor, retro, history,
analyze, sync, config, usage, review, run, kill, cleanup, help,
agent-list (yeni), skill-list (yeni)
```

B) DECKENT.md'deki MCP tool sayısını 17→19 güncelle

**Kanıt:** `grep "ADR-022\|19 tools" .brain/DECISIONS.md DECKENT.md` → güncel

**Test:** Bu task test gerektirmez.

---

## Quality Rules
- tsc --noEmit MUST pass
- Mevcut MCP/CLI testlerinde 0 regresyon
- Yeni parametreler opsiyonel — mevcut davranış bozulmamalı
- MCP tool sayısı: 17→19
- CLI komut sayısı: 32→33 (set-directives eklendi)
- %100 GO hedefli
