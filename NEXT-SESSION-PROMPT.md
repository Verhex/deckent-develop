# Sprint 152 Handoff — Yeni Sistem İlk Açılış Prompt'u

**Oluşturuldu:** 2026-04-22 10:45 TRT (Sprint 151 kapanış + sistem taşıma kararı sonrası)
**Önceki session:** Sprint 151 başlatma → tamamlama → migration playbook (~5 saat)
**Sistem geçişi:** Eski WSL2 → Yeni sistem (2026-04-23 yarın)
**Ana referans:** `SYSTEM-MIGRATION-2026-04-22.md` (proje kökünde, 9 bölüm, kapsamlı)

---

## ⚠️ ÖNCELİK SIRASI — BU DOSYAYI OKUYAN İLK İŞ

**Eğer yeni sistemdeyim:** Önce `SYSTEM-MIGRATION-2026-04-22.md` Bölüm 4 checklist'in tamamlandığından emin ol.

**Eğer eski sistemdeyim ve "yeni session"ım:** Bu dosyayı oku, sonra durum özetini iste.

---

## Kimlik ve Ortam

- **Proje:** Deckent (AI agent orchestration CLI, TypeScript ESM)
- **Working directory:** `/home/alperen/deckent-dev` (eski) — yeni sistemde aynı path önerilir
- **Branch:** `master`
- **Remote:** `https://github.com/VerhexIO/deckent-dev.git` (private)
- **Sürüm:** 1.0.0-beta.1 (npm publish bekliyor — Alperen elle)
- **User:** Alperen — Türkçe yanıt zorunlu, UTC+3 TRT sunum
- **Platform:** Linux (WSL2 → yeni sistem hâlâ Linux)

---

## Sistem Taşıma Durumu (KRİTİK — İlk Kontrol)

```bash
# Yeni sistemde Sprint 152 başlatmadan önce kontrol et:

# 1. Migration playbook mevcut mu?
ls -la SYSTEM-MIGRATION-2026-04-22.md

# 2. Memory V2 DB taşındı mı?
sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries;"
# Beklenen: 174+ (Sprint 151 sonrası)

# 3. Auto-memory dosyaları taşındı mı?
ls ~/.claude/projects/-home-alperen-deckent-dev/memory/ | wc -l
# Beklenen: 82+ (en kritik dosyalar:
#   - feedback_npm_publish_alperen_approval.md (2026-04-22 yeni)
#   - feedback_two_persona_analysis.md
#   - feedback_deckent_kill_approval_required.md
#   - feedback_test_agent_removal.md
#   - feedback_max_workers.md
#   - feedback_timezone_trt.md
#   - feedback_openclaw_not_openhands.md
#   - project_sprint151_preflight_p0_bugs.md
#   - MEMORY.md (indeks))

# 4. Build sağlam mı?
npx tsc --noEmit
# Beklenen: 0 error

# 5. MCP server register mi?
claude mcp list
# Beklenen: deckent görünmeli, yoksa: claude mcp add deckent -- npx deckent mcp

# 6. GitHub auth çalışıyor mu?
gh auth status
git push origin master --dry-run
# Beklenen: ✓ Logged in + "Everything up-to-date"

# 7. Sprint 151 push edildi mi?
git log origin/master..HEAD --oneline | wc -l
# Beklenen: 0 (eski sistemde push yapılmış olmalı)
```

**Yukarıdaki 7 kontrolden HERHANGİ BİRİ FAIL ise:** `SYSTEM-MIGRATION-2026-04-22.md` Bölüm 4 ve 6'ya geri dön, eksik adımı tamamla.

---

## Sprint 151 Kapanış Özeti — Yeni Sistemde Bilmen Gerekenler

### Resmi Sonuç

| Metrik | Değer |
|--------|-------|
| **Karar** | GO_WITH_GATE_FAILURE (vitest 1 fail) |
| **Tamamlanan** | 17/17 task (15 original + 2 fix recovery) |
| **Süre** | 56 dakika 2 saniye |
| **NO_GO rate** | **%0** (Sprint 138'den beri ilk %100 başarı) |
| **Code changes** | +4566/-42, 15 yeni test dosyası |
| **Token total** | 1.2M (494K cache, %43 cost saving) |
| **Beta GA Exit Gate** | 17/20 → **19/20** (T-151-009 + T-151-014 açıldı) |

### Task Skor Tablosu (Hepsi DONE veya TD)

| Task | Sonuç | Quality | Not |
|------|------|---------|-----|
| 151-001 npm publish hazırlık | DONE | 75 | Worker disipline uydu, publish YASAK kuralı |
| 151-002 Public repo flip hazırlık | TD | 60 | clone yok (Alperen elle), handoff hazır |
| 151-003 Dashboard ChatPage | DONE | **100** | 471/471 test, full i18n |
| 151-004 Discord bot deploy | TD | 60 | Token yok (Alperen elle), --check çalıştı |
| 151-005 Telegram bot deploy | DONE | 75 | BotFather setup |
| 151-006 Show HN/Reddit/Twitter | DONE | 75 | 3 platform, ayrı ton |
| 151-007 Discord server setup | DONE | 75 | CONDUCT.md + 7 kanal |
| 151-008 Dev.to + Hashnode blog | DONE | 75 | 1375+1695 word |
| 151-009 Notify E2E test | DONE | 75 | 22/22 PASS, 420 LoC |
| 151-010 CLI buildProgram smoke | DONE | 75 | 5 test, "49→45 actual" düzeltti |
| 151-011 49 CLI envanter | DONE | 75 | 104 endpoint, MCP %49 parity keşfi |
| 151-012 Brain Evaluator 5-in-1 | DONE | **99** | 35 yeni test, 4053 PASS |
| 151-013 Vitest residual (orig) | NO_GO→DONE (fix) | 20→100 | TIMEOUT, fix worker zaten PASS olduğunu gördü |
| 151-014 Docker HB final (orig) | NO_GO→DONE (fix) | 20→95 | TIMEOUT, fix worker 6-katman fix yerinde gördü, 66/66 test PASS |
| 151-015 Nervous detector 6-10 | TD | 66 | 6→11 detector, 224/224 PASS |

### 🏆 Sprint 151 En Önemli 3 Kazanım

1. **`feedback_npm_publish_alperen_approval` ilk dogfood'da çalıştı** (T-151-001) — yeni memory kuralı production-ready
2. **Brain Evaluator 5-in-1 fix DONE** (T-151-012) — Sprint 152'de aktif olduğunda Sprint 150'nin 4 NO_GO verification-blind pattern kapanır
3. **NO_GO rate %0 + FIX phase canlı kanıt** — Brain `max_fix_retries: 2` config'i 2 NO_GO için 2 FIX worker spawn etti, ikisi de DONE

---

## Sprint 152 Hazırlık — P0 + P1 Carry-Over Listesi

Sprint 151'den taşınan ve **Sprint 152'de mutlaka ele alınacak** debt'ler:

### P0 (Beta GA Blocker)

| ID | Konu | Detay |
|----|------|-------|
| **P0-1** | **Notify Dispatcher Background Subprocess Wire Fix** | **CANLI BULGU 2026-04-22:** notify dispatcher MCP server initialize ediyor ama `deckent_start` background subprocess'te singleton state taşınmıyor. `DECKENT_PARENT_PID` env var spawn'a inject edilmiyor → CLI parent-TTY adapter `isAvailable: false` → 0 user notification. Fix: singleton init'i deckent worker entry point'inde de yap + env var inject. T-151-009 test framework'ü hazır (22/22 PASS regression guard). Beta GA UX gap. |
| **P0-2** | Vitest 1 residual fail | Sprint 151 GATE_FAILURE sebebi. Kaynak: muhtemelen `tests/docs/jsdoc.test.ts` (validateResultSchema JSDoc eksik) veya `tests/e2e/docker-backend.test.ts` (fsyncSync expect). Tek test, hızlı fix. |
| **P0-3** | Worker timeout root cause | T-151-013 + T-151-014 ikisi de **"Claude CLI session issue"** ile timeout (T-151-014-fix worker'ın notu). Sprint 152 worker spawn'da Claude CLI subprocess hang detection + auto-restart gerekli. |
| **P0-4** | Beta GA 20/20 — Alperen elle | T-151-001 + T-151-002 handoff hazır. Yeni sistemde: `npm publish --access public --tag beta` + `git clone deckent-public + sync + push + UI flip`. |

### P1

| ID | Konu | Detay |
|----|------|-------|
| **P1-1** | MCP/CLI parity reform | T-151-011 keşfi: 45 CLI komut, sadece 22 MCP'de (=%49 parity). ADR-022-V2 spec'i geride. |
| **P1-2** | Event stream Wave 2+ event'leri kaçırıyor | Sprint 151 event log 22 satırda durdu (15 task için ≥75 event beklenirdi). Observability gap. |
| **P1-3** | Status reader robustness | `Invalid count value: -70` hatası mid-sprint görüldü. EVALUATE→RETRO geçişinde reader race. |

### P2 (Runtime Doğrulama)

| ID | Konu |
|----|------|
| **P2-1** | Brain Evaluator 5-in-1 runtime canlı doğrulama (T-151-012 build sonrası dogfood) |
| **P2-2** | Nervous detector 6-10 runtime canlı (T-151-015) |

### Tema Önerisi

> **Sprint 152: "Beta GA Final Polish + Notify Dispatcher Runtime Fix + Sprint 151 Carry-Over"**
>
> Tahmini 10-12 task, 4-6 saat hard cap, opus-heavy

---

## Beta GA Cutover — Alperen Elle 3 Adım (Sprint 152 Öncesi VEYA Sırasında)

```bash
# 1. npm publish — handoff: docs/release/npm-publish-handoff.md
npm whoami   # Login değilse: npm login
npm publish --access public --tag beta
npm info deckent@1.0.0-beta.1 version

# 2. Public repo flip — handoff: docs/release/public-repo-flip-handoff.md
cd ~
# deckent-public repo henüz yok, GitHub UI'dan create
git clone https://github.com/VerhexIO/deckent.git deckent-public
cd ~/deckent-dev
bash scripts/public-repo-sync.sh
cd ~/deckent-public
git push origin master
# GitHub UI: VerhexIO/deckent → Settings → Danger Zone → Public

# 3. Doğrulama
curl -s https://api.github.com/repos/VerhexIO/deckent | jq '.private'   # → false
```

**Tamamlanırsa:** Beta GA 20/20 GATE AÇIK → Show HN/Reddit/Twitter launch hazır (T-151-006/007/008 draftları docs/launch/).

---

## Memory + Brain Önemli Referanslar

### Tartışmasız Kurallar (her sprint geçerli)

1. **`feedback_npm_publish_alperen_approval`** — Worker asla `npm publish` çalıştıramaz
2. **`feedback_deckent_kill_approval_required`** — `deckent_kill` / cleanup / docker stop Alperen onayı zorunlu
3. **`feedback_two_persona_analysis`** — Her analiz dev + prod milyon user lensi
4. **`feedback_test_agent_removal`** — test-writer agent YASAK (ADR-041)
5. **`feedback_timezone_trt`** — UTC+3 TRT sunum
6. **`feedback_openclaw_not_openhands`** — Rakip OpenClaw (NOT OpenHands)
7. **`feedback_max_workers`** V2 — WSL2 dev 3-4 worker / prod 50+ özgür

### Aktif ADR'lar

42 ADR (`.brain/exports/summary.md`):
- ADR-001..010: Temel (TS, ESM, vitest, config, security)
- ADR-022-V2: CLI/MCP parity (Sprint 152'de revizyon)
- ADR-035: Verification protocol
- ADR-037: RBAC authority matrix
- ADR-040: Nervous System
- ADR-041: Agent taxonomy (test-writer YASAK)
- ADR-042: Hybrid mode (proposed → Sprint 152'de accept potansiyeli)

### Aktif Memory V2

- DB: `.brain/memory.db` (174+ entry)
- Search: `deckent_memory_query` MCP tool
- Export: `.brain/exports/{summary,decisions,memory,debt}.md`
- Dual-layer i18n FTS5 (TR/EN/DE %100)

---

## İlk Komut — Yeni Session Açılışı

Yeni sistemde Claude Code açıldığında:

```
/cwd ~/deckent-dev
SYSTEM-MIGRATION-2026-04-22.md ve NEXT-SESSION-PROMPT.md oku.
Sonra Bölüm 4 checklist sonuçlarını paylaşacağım, tüm yeşil ise Sprint 152'ye geçelim.
```

Veya direkt:

```
"Yeni sistemde restore tamamlandı.
SYSTEM-MIGRATION-2026-04-22.md Bölüm 4: tüm yeşil.
Sprint 152 'Beta GA Final Polish + Notify Dispatcher Wire Fix'
DIRECTIVES yazımına geçelim mi?"
```

---

## Fallback — Yeni Sistemde Sorun Çıkarsa

| Sorun | Çözüm |
|-------|-------|
| Memory.db corrupt | `sqlite3 .brain/memory.db "PRAGMA integrity_check;"` → CORRUPT ise eski sistemden tekrar rsync |
| ~/.claude/memory eksik | Eski sistemden rsync (en kritik 82 dosya) |
| GitHub auth fail | `gh auth login -h github.com -s repo,workflow -w` |
| MCP register yok | `claude mcp add deckent -- npx deckent mcp` |
| TypeScript build error | `rm -rf node_modules && npm install && npx tsc` |
| Docker image yok | `docker build -t deckent-worker:latest -f Dockerfile .` |
| Sprint 151 commit yok (push edilmemiş) | Eski sistem hâlâ açıksa: oradan push, yoksa yeni sistemde commit ceremony (`SYSTEM-MIGRATION` Bölüm 5) |

---

**Hazırlayan:** Koordinatör (Sprint 151 + sistem taşıma kararı sonrası)
**Önceki sprint:** Sprint 151 GO_WITH_GATE_FAILURE 17/17 (%100) 56dk %0 NO_GO
**Bekleyen:** Sistem taşıma + Sprint 152 başlatma (yarın yeni sistemden)
**Migration master doc:** `SYSTEM-MIGRATION-2026-04-22.md` (proje kökü, 9 bölüm)

🌃 **Bugünlük iş bitti. Yarın yeni sistemde devam.**
