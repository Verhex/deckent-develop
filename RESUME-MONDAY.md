# Pazartesi Resume Prompt — Deckent Sprint 193

**Tarih:** 2026-05-24 (Cumartesi gece) → Pazartesi devam
**Sebep:** Haftalık Claude limit doldu; Sprint 192'de auth-loss silent fail yaşandı
**Hedef:** 1 Haziran 2026 OSS GA beta launch (5 gün kaldı)

---

## Pazartesi başlangıçta kullan (kopyala-yapıştır)

```
Sprint 192'yi 12/19 disk-verified DONE ile bitirdik (Brain raporu yanıltıcıydı). Sprint 193 DIRECTIVES hazır: W-AUTH (auth-loss fix) + Sprint 192 7 carry-over + RAM deney 12 worker × 2g canlandırma + Karpathy L-8/L-9 + Sprint 191/192 retroactive reclassify (14 task / 5 dalga).

Önce auth durumunu doğrula:
1. `claude auth status` (veya `ls -la ~/.claude/.credentials.json`)
2. Eğer auth fail → /login YAP (sprint başlamadan önce!)
3. Auth OK ise: `npm run build && npx deckent plan && npx deckent start --auto-approve`

Sprint başladıktan sonra ASLA /login, claude logout, credential edit ÇALIŞTIRMA — memory: [[feedback_no_auth_touch_during_sprint]].

Sprint 193 başlayınca canlı izleme moduna geç:
- Wave 0: 193-001 W-AUTH worker pre-spawn auth check (ZORUNLU İLK, ~15dk)
- Wave 1: 193-002..008 paralel 7 carry-over (~60-90dk)
- Wave 2-4: 193-009..014 retroactive reclassify + telemetri + validate (~45dk)

Beklenen: 14/14 DONE, sıfır auth-fail, RAM deney peak <6GB toplam, agent stats düzelir.

Master plan: docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md
Memory: ~/.claude/projects/-home-alperen-deckent-dev/memory/
```

---

## Pre-flight kontrol listesi (Pazartesi sabah)

| ✓ | Kontrol | Komut |
|---|---------|-------|
| [ ] | Auth durumu | `ls -la ~/.claude/.credentials.json` (tarih kontrolü) |
| [ ] | Working tree clean | `git status --short` |
| [ ] | Build clean | `npm run build` (tsc + copy-assets) |
| [ ] | DIRECTIVES Sprint 193 | `head -1 DIRECTIVES.md` → "Sprint 193" |
| [ ] | Config sane | `grep "max_workers\|brain_planning" .deckent/config.json` |
| [ ] | MCP fresh | `/mcp restart` (Claude Code'da, build sonrası) |
| [ ] | Docker temiz | `docker ps --format '{{.Names}}'` boş |

---

## Sprint 193 task özeti

**DALGA 0 (1 task — ZORUNLU İLK):**
- 193-001 W-AUTH worker pre-spawn auth health check + fail-fast

**DALGA 1 (7 task — Sprint 192 carry-over):**
- 193-002 dishonest worker result detector (W-INTEGRITY I-8)
- 193-003 RAM config 12 worker × 2g deney (W-M M-1)
- 193-004 NODE_OPTIONS --max-old-space-size-percentage (W-M M-2)
- 193-005 adaptive scheduler host-detector (W-M M-3)
- 193-006 ram-telemetry retro'ya (W-M M-7)
- 193-007 5 ek agent PROMPT.md Karpathy (L-8)
- 193-008 5 ek skill SKILL.md Karpathy (L-9)

**DALGA 2 (1 task):**
- 193-009 Sprint 191+192 retroactive bulk reclassify

**DALGA 3 (2 task):**
- 193-010 W-AUTH A-2 auth health monitor pre-flight
- 193-011 W-INTEGRITY I-1 telemetri tamamlama (auth_failed event)

**DALGA 4 (3 task):**
- 193-012 EVALUATE entry guard validate (Sprint 191 191-007 + Sprint 192 192-009 kombine)
- 193-013 task-builder Karpathy injection runtime test
- 193-014 DEFERRED enum cascade exclusion

---

## Sprint 192'den 3 önemli öğrenim (kalıcı memory)

1. **[[feedback_no_auth_touch_during_sprint]]** — Sprint çalışırken /login YASAK
2. **[[feedback_no_synthetic_results]]** — Sentetik NO_GO YASAK, liveness check zorunlu (Sprint 191/192 hotfix landed)
3. **[[feedback_docker_oom_false_no_go]]** — Docker OOM/auth-fail durumunda disk verify zorunlu

---

## Beta launch 1 Haziran (5 gün kaldı) — kalan dalgalar

- Sprint 193 (Pazartesi): carry-over + W-AUTH + RAM deney + Karpathy L-8/L-9 = **14 task**
- Sprint 194 (Salı): W-E evolutionary architecture başlangıç + Karpathy L-10/L-11 + dashboard reborn
- Sprint 195 (Çarşamba): Trinity Chat Path A (embedded) + W-K dead code wire-up
- Sprint 196-198 (Perş-Cuma-Pazartesi 31 Mayıs): 1.0.0-beta.1 → 1.0.0 packaging + npm publish + smoke test
- Sprint 200+ (1 Haziran sonrası): hardening + million-user roadmap

---

## Bilinen acil P0 (Sprint 193 öncesi gözlemler)

- ✅ Brain hotfix in-memory cache → process restart zorunlu (yeni Brain process eski kod çalıştırıyor)
- ⚠ Agent stats çarpıtılmış: architect %27, temp-react-ts-specialist %0 → 193-009 reclassify düzeltir
- ⚠ Worker honest-reporting Karpathy etkisiyle iyileşiyor — 192-002/192-003 örnekleri (DIRECTIVES baseline'ını yalanladı, kanıt komutu hatasını yakaladı)
- ⚠ RAM kullanımı %2-9 (cap'in %91'i boşa) → 193-003 deney 12×2g

---

## Hızlı komut referansı

```bash
# Status
deckent status
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
git log --oneline -10

# Disk-verify Sprint sonuçları
for i in $(seq -w 1 14); do
  TID="193-0$i"
  [ -f .tasks/task-$TID.result ] && grep "evaluationDecision\|linesAdded" .tasks/task-$TID.result | head -2
done

# Reclassify (192-003 CLI mevcut, dist/cli/entry.js)
node dist/cli/entry.js agent reclassify --sprint sprint-191 --task 191-002 --decision DONE --reason "..."

# Kill + recover (acil durum)
deckent kill --all && deckent cleanup && deckent recover
```

---

İyi pazartesiler. 🚀
