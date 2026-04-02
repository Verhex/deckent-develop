# DIRECTIVES — Sprint 089: Otonom Adaptasyon Faz 2 + Kalan Tech Debt

## Goal: Faz 2 otonom adaptasyon hedeflerini tamamla — adaptive thresholds, mid-sprint reroute güçlendirme, kalan sessiz catch'ler, checkpoint CLI/MCP entegrasyonu. Self-improving orkestratörü tamamla.

---

## Task 1: Adaptive Thresholds — NO_GO Rate Bazlı Otomatik Ayar
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/result-evaluator.ts, src/core/config.ts, src/core/config-types.ts
- Scope: src/orchestra/, src/core/

### Description
Sprint sonuçlarına göre threshold'ları otomatik ayarlayan mekanizma ekle.

A) config-types.ts'e:
- `DeckentConfig.adaptive_thresholds?: boolean` zaten var (varsayılan false)
- `DeckentConfig.adaptive_config?: { min_samples: number; no_go_threshold: number; coverage_lookback: number }` ekle
- Varsayılanlar: min_samples=3, no_go_threshold=0.3, coverage_lookback=3

B) sprint-controller.ts'de RETRO fazına `applyAdaptiveThresholds()` ekle:
- Son N sprint'in NO_GO rate'ini hesapla (`.brain/sprints/` dosyalarından)
- NO_GO rate > %30 → `agent_min_score` değerini 1 düşür (min 1)
- NO_GO rate < %10 → `agent_min_score` değerini 1 artır (max 10)
- Coverage ortalaması < %70 → `coverage_threshold` değerini ortalamaya ayarla
- Değişiklikleri `.deckent/config.json`'a yaz + debugLog ile logla

C) result-evaluator.ts'de:
- `getRecentSprintStats(projectRoot: string, lookback: number)` fonksiyonu
- `.brain/sprints/sprint-NNN.md` dosyalarını parse et
- Return: `{ avgNoGoRate, avgCoverage, sprintCount }`

**Kanıt:** `grep "applyAdaptiveThresholds\|getRecentSprintStats" src/orchestra/sprint-controller.ts src/orchestra/result-evaluator.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 2: Mid-Sprint Reroute Güçlendirme — Max 3 + Config
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/mid-sprint-adapter.ts, src/core/config-types.ts, src/core/config.ts
- Scope: src/orchestra/, src/core/

### Description
Mid-sprint reroute mekanizmasını güçlendir.

A) config-types.ts'e:
- `DeckentConfig.max_reroutes?: number` zaten var (varsayılan 3)
- `DeckentConfig.reroute_on_tech_debt?: boolean` zaten var (varsayılan false)
- Doğrula: bu field'lar gerçekten config.ts defaults'ta ve loadConfig'de var mı

B) mid-sprint-adapter.ts'de:
- `MAX_REROUTES` sabitini `config.max_reroutes` ile değiştir (config parametre olarak al)
- Reroute tetikleme: NO_GO task'lar + opsiyonel GO_WITH_TECH_DEBT (`config.reroute_on_tech_debt`)
- Confidence threshold: sadece confidence > 0.7 ise reroute yap
- Her reroute'ta debugLog ile karar logla
- Reroute counter'ı task bazlı tut (task.routingMeta.rerouteCount)

C) sprint-controller.ts FIX fazında:
- `runFixPhase()` fonksiyonuna config geçir
- mid-sprint-adapter'a config'den max_reroutes ve reroute_on_tech_debt oku

**Kanıt:** `grep "max_reroutes\|reroute_on_tech_debt" src/orchestra/mid-sprint-adapter.ts` → 2+

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 3: Checkpoint CLI/MCP Entegrasyonu — Approve/Reject Komutları
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/cli/commands/checkpoint.ts, src/cli/index.ts, src/mcp/tools/checkpoint.ts, src/mcp/index.ts
- Scope: src/cli/, src/mcp/

### Description
Human checkpoint'leri CLI ve MCP'den approve/reject edebilmeyi sağla.

A) `src/cli/commands/checkpoint.ts` yeni dosya:
- `deckent checkpoint list` — bekleyen checkpoint'leri listele (`.deckent/checkpoints/` oku)
- `deckent checkpoint approve <sprintId> <phase>` — checkpoint status'u "approved" yap
- `deckent checkpoint reject <sprintId> <phase>` — checkpoint status'u "rejected" yap
- JSON dosyasını oku, status'u güncelle, geri yaz

B) `src/cli/index.ts`'de komutu kaydet

C) `src/mcp/tools/checkpoint.ts` yeni dosya:
- `deckent_checkpoint` MCP tool: action='list'|'approve'|'reject', sprintId, phase parametreleri
- Aynı mantık: `.deckent/checkpoints/` dizinini oku/yaz

D) `src/mcp/index.ts`'de tool'u kaydet

**Kanıt:** `ls src/cli/commands/checkpoint.ts src/mcp/tools/checkpoint.ts` → dosyalar var

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Task 4: Kalan Sessiz Catch Blokları — Son Dalga
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/*.ts, src/core/*.ts
- Scope: src/orchestra/, src/core/

### Description
Kalan ~20 sessiz catch bloğunu debugLog'a dönüştür.

A) Tüm `catch (e) { }` ve `catch { }` (boş gövdeli) blokları bul:
- `grep -rn "catch.*{[^}]*}" src/orchestra/ src/core/` ile tara
- Boş gövdeli veya sadece yorum olan catch blokları hedef

B) Her birini `catch (e) { debugLog('fonksiyonAdi:context', e); }` ile değiştir
- debugLog import'u yoksa ekle

C) Hedef: 0 sessiz catch bloğu kalmalı
- Utility fonksiyonları dahil (readJsonSafe, vb hariç — bunlar bilinçli olarak sessiz)

**Kanıt:** `grep -rn "catch.*{[\s]*}" src/orchestra/ src/core/ | wc -l` → 0

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail (pre-existing hariç)
- Adaptive thresholds configurable ve default off
- Mid-sprint reroute max 3 deneme, config'den okunur
- Checkpoint CLI + MCP çalışır
- 0 sessiz catch bloğu hedef
- %100 GO hedefli
