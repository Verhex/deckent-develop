# Sprint 153 Handoff — Yarın Devam Prompt'u

**Oluşturuldu:** 2026-04-24 17:00 TRT
**Önceki session:** Sprint 152 (post-migration audit 27 rapor) + Sprint 152.5 Hot Fix Day (4 blocker fix) + git push master (billing RED)
**Ana referans:** `docs/ROADMAP-GOD-LEVEL.md` (Sprint 149-200 anchor, Phase 2 Sprint 153-160)
**Bu session'da üretilen canlı dokümanlar:**
- `docs/audits/sprint-152/T-152-001..027.md` (27 audit raporu, 500+ KB)
- `docs/KNOWN_ISSUES.md` (86 backlog item, 3 kategori)
- `CHANGELOG.md` unreleased entry (HF1..HF4)

---

## ⚠️ BU DOSYAYI OKUYAN İLK İŞ — 5 Dakikalık Sağlık Kontrolü

```bash
cd /home/alperen/deckent-dev

# 1. Git sync (master'da olduğuna emin ol)
git status --short | head -5
git log --oneline -5
# Son commit: 241513e fix(sprint-152.5): Hot Fix Day — 4 Beta GA launch blockers

# 2. Memory V2 DB canlı (better-sqlite3 host v137 binding)
node -e "const db = require('better-sqlite3')('/home/alperen/deckent-dev/.brain/memory.db',{readonly:true}); console.log('entries:', db.prepare('SELECT COUNT(*) as c FROM entries').get().c);"
# Beklenen: 176+ (Sprint 152 Learnings + HF entry'leri)

# 3. Docker worker image (Debian 13, GLIBC 2.41)
docker run --rm deckent-worker:latest bash -c "ldd --version | head -1"
# Beklenen: Debian GLIBC 2.41

# 4. MCP server Connected
claude mcp list 2>&1 | grep -i deckent
# Beklenen: deckent: node /home/alperen/deckent-dev/dist/mcp/server.js - ✓ Connected

# 5. Sprint 152 task cleanup
ls /home/alperen/deckent-dev/.tasks/task-152*.json 2>/dev/null | wc -l
# Beklenen: 0 (archive edildi); rapor dosyaları docs/audits/sprint-152/ altında
```

Herhangi biri FAIL ise: `docs/KNOWN_ISSUES.md` oku veya `deckent doctor` çalıştır.

---

## 📍 Nerede Kaldık

### Sprint 152 — Post-Migration Audit (Bugün 1. iş)
- 30 opus task, 45 dakika 13 saniye, **27 rapor dosyası yazıldı** (docs/audits/sprint-152/)
- Brain retro metrics yanıltıcı: "8/36 DONE, 28 NO_GO" → aslında 27 DONE (Brain rubric verification-blind bug)
- 86 bulgu: 42 PASS + 18 DRIFT + 12 FAIL + 8 MISSING + 6 PARTIAL
- Meta-dogfood kanıtı: **sprint kendi kendini denetlerken kendi evaluator bug'ını canlı yakaladı**

### Sprint 152.5 — Hot Fix Day (Bugün 2. iş, ~2 saat)
Pattern: Sprint 150A gibi Claude Code subagent'lar ile cerrahi müdahale (Deckent pipeline bypass).

| Fix | Etki | Commit |
|-----|------|--------|
| **HF1** Docker worker GLIBC 2.38 | `node:22-slim` → `node:24-trixie-slim` (glibc 2.41, Node 24 parity). Memory V2 DB container'da canlı — 176 entry okundu. | ✅ |
| **HF2** Brain verification task | `isVerificationTask` filesChanged=[] → srcChanges=[]. Audit task'lar artık DONE. | ✅ |
| **HF3** Rules silent catch | `rule-generator.ts` DB fail silent catch kaldırıldı. Rules dosyaları korunur. | ✅ |
| **HF4** MCP dry-run provider | `start.ts` `bootstrapProviders(config)` eklendi. CLI/MCP parity. | ✅ |
| **TS 8 error** | `satisfies BeforeSprintContext/AfterSprintContext` → explicit `const ctx`. | ✅ |

Commit: `241513e fix(sprint-152.5): Hot Fix Day — 4 Beta GA launch blockers + satisfies→ctx`
Push: `8434387..241513e master -> master` (origin/master sync)

### GitHub Actions — RED (Bilinen)
**Sebep:** GitHub Actions billing limit dolmuş (VerhexIO/deckent-dev). Tüm workflow'lar:
`"The job was not started because recent account payments have failed or your spending limit needs to be increased"`

**Çözüm tarihi:** **2026-05-02 Cumartesi** — Alperen CI/CD fix planı yapacak (billing + gerçek test fail'ları birlikte).

**Not:** Sprint 153-157 boyunca master push'lar Actions RED görecek. Bu **endişe değil**, billing sonrası rerun ile yeşillendirilir.

Auto-memory: `project_cicd_fix_2_may.md` — tarih + checklist kalıcı kayıtlı.

---

## 🎯 Sprint 153 — 2026-04-25 Cuma Plan Adayları

**Tema önerim:** **Smoke & Dogfood** — Beta GA öncesi canlı runtime doğrulama + Phase 2 preparatory (messaging + nervous wire).

ROADMAP Phase 2 resmi temasi: "WhatsApp Business API + Slack + Email" — ama gerçekçi olalım:
- WhatsApp onay bekliyor (external dependency)
- Slack/Email scaffold sıfırdan (400+ LoC, 1 sprint'te yetmez)
- Daha yüksek ROI: **mevcut Discord + Telegram'ı canlı test et** (kod hazır, sadece token)

### A. Canlı Etkileşim Doğrulama (P0)

#### A1. Telegram Bot Deploy + Canlı Smoke (~30 dk)
**Durum:** Kod %100 hazır (`src/connectors/telegram.ts` + `scripts/deploy-telegram.sh`). Sadece token.

**Alperen manuel adımlar:**
1. Telegram'da **@BotFather** ile yeni bot oluştur (`/newbot` → token al)
2. `.deck` dosyası oluştur/güncelle:
   ```
   TELEGRAM_TOKEN=8423:AAH...
   ```
3. Smoke test:
   ```bash
   bash scripts/deploy-telegram.sh --check-only
   # sonra
   bash scripts/deploy-telegram.sh
   ```
4. Telegram'dan `/start` komutu at, bot cevap veriyor mu

**Amaç:** Nervous System DECKENT→USER:NOTIFY kanalı Telegram'a ulaşıyor mu kanıtla. Sprint 151 T-151-009 22 E2E test vardı ama canlı kullanıcı yoktu.

#### A2. Discord Bot Deploy + Canlı Smoke (~30 dk)
**Benzer:** `src/connectors/discord.ts` + `scripts/deploy-discord.sh`. Alperen Discord bot token setup.

#### A3. Sprint Kick-off Canlı NOTIFY Testi (~10 dk)
Bir tane mini sprint başlat (1 task dummy), Telegram/Discord'a bildirim geliyor mu gör. Sprint 150A H6 "ℹ️ [deckent] Task H6 DONE" test modu idi — **bu sefer gerçek kullanıcıda**.

---

### B. Nervous System Analiz + Wire (P0)

**Durum** (Sprint 152 T-152-012 audit):
- **11 detector kodu mevcut:**
  - ✅ Active (5): `stale_worker`, `scope_collision`, `debt_trend`, `agent_routing`, `directives_protection`
  - ❗ Yeni kod ama wire yok (6): `agent_routing_anomaly`, `build_failure_recurrence`, `notification_delivery_health`, `scope_collision_rate`, `task_mode_idle`, `token_spike`
- **5 config orphan** (detector DOSYASI yok, config var): `dead_event_stream`, `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner`
- **`NervousObserver` SINIF VAR ama ÇAĞRILMIYOR** — `sprint-controller.ts` boot'ta `new NervousObserver(...)` eksik
- Sonuç: **1,300+ LoC dormant code**

#### B1. Nervous Observer Wire (~2 saat)
```typescript
// sprint-controller.ts runSprint() içinde, PLAN öncesi:
if (config.nervous_system?.enabled) {
  const observer = new NervousObserver(projectRoot, config);
  observer.start();
  sprint.nervousObserver = observer; // cleanup için ref
}
// CLEANUP sonrası:
if (sprint.nervousObserver) sprint.nervousObserver.stop();
```

#### B2. Config Schema + Detector Name Sync (~1 saat)
- `config.nervous_system.detectors` 10 entry → 11 entry (yeni kod dosyasına göre)
- 5 orphan entry `reserve_for: sprint-148` — **detector yazmayacaksak sil**. Sprint 139'da kaydedildi, hiç implement edilmedi.
- config schema Zod validator ekle — yanlış detector adı warn

#### B3. Canlı Detector Trigger Kanıt (~1 saat)
- Mini sprint koş, event log'a detector output yazılıyor mu gör
- `.deckent/events.jsonl` veya benzer — detector history persistence
- Telegram'a NOTIFY düşüyor mu

---

### C. Eklenen Özellik Coverage Check (P1)

ROADMAP §3.2 ve IDENTITY.md "Features" 150+ özellik sayıyor. Her sprint'te 10-20 eklendi, ama **canlı test edilmemiş olanlar var**. Sprint 153'te kısa smoke:

| Alan | Özellik | Canlı mı? |
|------|---------|-----------|
| **Memory V2** | FTS5 TR/EN/DE recall | T-152-011 proof (export proxy); canlı FTS5 query Sprint 153 A1 |
| **Routing V2** | Intent + activation + routing 3-layer | Sprint 151'de çalıştı, Sprint 152'de 26/30 doc-writer concentration — anomaly detector trigger'ladı mı? |
| **Checkpoint + Resume** | Sprint 138 Task 9, `.deckent/sprint-checkpoint.json` | Canlı kurtarma hiç test edilmedi (sprint kill yasak) — **dogfood imkansız** |
| **Token Usage Tracker** | Sprint 150 eklendi | Sprint 152'de 8.5K-45K output per task kayıtlı — canlı |
| **Event Stream** | 21+ kanal | Sprint 152'de 31 event kayıtlı (SCOPE_COLLISION, TASK_ASSIGN, HEARTBEAT, PHASE_CHANGE, METRIC_EMITTED, GATE_COMPUTED, LOAD_REPORT_WRITTEN) — **canlı ve zengin** |
| **Dashboard 7 page** | ChatPage Sprint 151 | 471 test PASS; canlı kullanım `npm run dev` Alperen ara ara |
| **Self-Modifying Detector** | ADR-039 Sprint 139 | Kod var, 32 test; **sprint-controller'da çağrı yok** — Sprint 153 B1 ile beraber wire |
| **ADR Governance Layer 4** | ADR-036 runtime enforcement | ADR-006/008/010 pilot; ADR-008 VIOLATION Sprint 152 audit — B+ wire genişletme |
| **Telegram/Discord** | Sprint 151 deploy | Token yok — Sprint 153 A1/A2 canlı test |

---

### D. Meta Bug Fixes (P0-P1)

Sprint 152 audit'ten çıkan kod seviye fix'ler:

#### D1. ADR-008 Violation Fix (~30 dk)
`src/core/notify.ts:17` → `'../orchestra/event-bus.js'` import (core→orchestra ters). Fix: notify.ts'yi `orchestra/`'ya taşı VEYA event-bus tipini core'a çıkar.

#### D2. ADR-038 batch-stats Removal (~15 dk)
`batch-stats.ts` 0 consumer ama dosya + test mevcut. Sil (ADR-038 kararı).

#### D3. Promotion Pipeline Double-Prefix Bug (~15 dk)
`promotion-pipeline.ts:117` `temp-${entityId}` + `entityId = 'temp-react-ts-specialist'` → `temp-temp-react-ts-specialist` path aranıyor. Fix: entityId normalize.

#### D4. Commander.js Unknown Subcmd Exit 1 (~15 dk)
`nervous subscribe` (yok) → "too many arguments" ama exit 0. CI false-pass riski. Fix: action('unknown'). 

---

### E. Ed25519 Real Keygen + 20 Seed Skill Sign (P1 — Beta GA Gate #15)

**Durum:** 20 seed skill placeholder signature (`ed25519:placeholder:awaiting-t149016-keygen:...`). Gate #15 "20 published + signed" → "signed" kısmı açılmamış.

**Task (~2 saat):**
1. `deckent skill keygen` (var mı kontrol et, yoksa yaz)
2. 20 seed skill'in her birine gerçek sign pass
3. `deckent skill install` path'inde Ed25519 verify ekle (şu an publish path'te var, install'da yok — güvenlik gap)

---

## 📝 Önerilen Sprint 153 DIRECTIVES Şablonu

```markdown
# DIRECTIVES — Sprint 153: Canlı Dogfood + Nervous Wire + Kod P0

## Goal
Beta GA öncesi canlı etkileşim kanıtı (Telegram + Discord bot), Nervous System 11 detector wire, Sprint 152 audit'ten gelen 4 kod P0 fix, Ed25519 real-sign pass. Task sayısı 10-12 (küçük sprint, odaklı).

## Task 1: Telegram Bot Deploy + Canlı Smoke
- Model: opus
- Effort: low
- Skills: devops-engineer
- Files: scripts/deploy-telegram.sh (değişiklik yok, sadece çalıştır)
- Scope: scripts/

### Description
Alperen .deck dosyasında TELEGRAM_TOKEN tanımlar. Worker `--check-only` ile doğrular, canlı smoke mesajı gönderir ve Telegram'dan yanıt log'lar. Kod değişikliği gerekmez — sadece canlı doğrulama.

## Task 2: Discord Bot Deploy + Canlı Smoke
(benzer)

## Task 3: Nervous Observer Wire (sprint-controller.ts)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-controller.ts, src/nervous/observer.ts, tests/nervous/
- Scope: src/orchestra/, src/nervous/, tests/nervous/

### Description
sprint-controller runSprint() içinde NervousObserver instantiate + start + cleanup. 1,300+ LoC dormant kod canlanacak. Test: 1 mini sprint koşusunda stale_worker detector trigger olmalı.

## Task 4: Nervous Config Schema Sync
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/core/config-types.ts, .deckent/config.json
- Scope: src/core/, .deckent/

### Description
5 orphan config entry (dead_event_stream, cost_threshold, prompt_quality, worker_output_variance, self_modifying_warner) Sprint 139'da reserved, hiç implement edilmedi. Sil veya kod ekle. Ek: 6 yeni detector (agent_routing_anomaly etc.) için config.json'a entry ekle.

## Task 5: ADR-008 Violation Fix
- Model: opus
- Effort: low
- Skills: system-architect, code-reviewer
- Files: src/core/notify.ts, src/orchestra/event-bus.ts (opsiyonel)
- Scope: src/core/, src/orchestra/

### Description
notify.ts orchestra/event-bus.js import (core→orchestra ters yön, ADR-008 ihlali). Ya notify.ts'yi orchestra/'ya taşı ya da event-bus tipini core'a çıkar. Layer 4 runtime enforcement pilot genişlet.

## Task 6: ADR-038 batch-stats Removal
- Model: opus
- Effort: low
- Skills: code-reviewer
- Files: src/core/batch-stats.ts (silmek), src/core/batch-stats-types.ts (varsa)
- Scope: src/core/, tests/core/

### Description
batch-stats.ts Sprint 139 ADR-038 "remove" listesinde ama dosya hâlâ var, 0 consumer. Sil, test'i sil.

## Task 7: Promotion Pipeline Double-Prefix Bug
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/promotion-pipeline.ts, tests/orchestra/promotion-pipeline.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
entityId `temp-react-ts-specialist` zaten temp-prefix ile geldiğinde pipeline `temp-temp-react-ts-specialist` path arıyor. Fix: startsWith normalize. Test: 1 test.

## Task 8: Commander.js Unknown Subcommand Exit 1
- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/cli/helpers/command-registry.ts (veya benzeri)
- Scope: src/cli/

### Description
nervous subscribe (yok) gibi unknown subcommand çağrıldığında exit 0 dönüyor (CI false-pass riski). Fix: action('command') veya unknownCommand listener + process.exit(1).

## Task 9: Ed25519 Keygen + 20 Seed Sign Pass
- Model: opus
- Effort: normal
- Skills: security-specialist
- Files: deckent-hub/skills/*/manifest.json (20 dosya), scripts/sign-seed-skills.mjs (yeni)
- Scope: deckent-hub/, scripts/

### Description
20 seed skill placeholder signature gerçek Ed25519 ile replace. Keygen pass, sign pass, verify pass. Beta GA Gate #15 "signed" kısmı açılır.

## Task 10: deckent skill install Ed25519 Verify Wire
- Model: opus
- Effort: normal
- Skills: security-specialist, typescript-expert
- Files: src/cli/commands/skill.ts (install path), tests/skills/install-verify.test.ts
- Scope: src/cli/, tests/skills/

### Description
Şu an `skill publish` AST sandbox + Ed25519 verify yapıyor ama `skill install` YAPMIYOR. Güvenlik gap. Install path'ine verify pipeline ekle.

## Task 11 (opsiyonel): Telegram/Discord Event Hook — Canlı NOTIFY
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/core/notification-dispatcher.ts (zaten var), tests/e2e/telegram-notify-live.test.ts (yeni)
- Scope: src/core/, tests/e2e/

### Description
DECKENT→USER:NOTIFY kanalı Telegram/Discord adapter'a gerçekten routing yapıyor mu canlı doğrula. Sprint 151 22 E2E mock test idi, şimdi bot canlı.
```

**Toplam:** 10-11 task, 1 task opsiyonel. Model: hepsi opus (analiz + kod). Süre: ~3-4 saat (6 worker paralel).

---

## 🧠 Kalıcı Kurallar — Hatırla

Auto-memory'de kayıtlı, her konuşmada canlı:
- **Sprint kill yasak** — her koşulda Alperen'e sor
- **Build Alperen'in kararı** — `tsc`, `vitest`, `docker build`, `npm publish` son doğrulama Alperen
- **Ship & iterate** — perfection paralysis yerine launch, community feedback ile P0 belirle
- **Hot Fix with Claude Subagents** pattern mevcut (Sprint 150A + 152.5), gerektiğinde kullan
- **Auto-memory korunması** — feedback_* dosyaları sistem taşıma gibi risklerde kaybolmamalı; `.brain/memory.db` DB-first mimarisi bu risk için tasarlandı
- **2026-05-02 Cumartesi** — CI/CD fix günü (billing + gerçek test fail'ları)

---

## 🎯 Açık Karar Noktaları (Sprint 153 Başında)

1. **DIRECTIVES spec onayla:** Yukarıdaki 10 task yaklaşımı mı, farklı bir açı mı? (ör. "önce Nervous wire, sonra Telegram")
2. **Model:** Hepsi opus mu, `economy` mode mu? (haiku yasak kalıcı)
3. **max_workers:** 6 (aktif) mı, Sprint 152.5 sonrası 8 deneme mi? (30 GB RAM rahat kaldırır)
4. **`.wslconfig`:** yazmadık; Sprint 153 başlamadan yazılsın mı (24 GB / 16 thread hard cap)?
5. **npm publish + public repo flip** (Sprint 152 H5): **Beta GA bekleyecek** dedin (bugün). Sprint 153'te mi, 2 Mayıs CI fix sonrası mı?

---

## Referans Dosyalar

- `docs/ROADMAP-GOD-LEVEL.md` — Sprint 149-200 master plan
- `docs/KNOWN_ISSUES.md` — 86 backlog item
- `docs/audits/sprint-152/T-152-*.md` — 27 audit raporu
- `CHANGELOG.md` — v1.0.0-beta.1 unreleased
- `SYSTEM-MIGRATION-2026-04-22.md` — migration playbook (tarihsel referans)
- `.brain/exports/summary.md` — 43 ADR + 176 entry live
- `.brain/RETRO.md` — Sprint 152 retro (false-NO_GO caveat ile oku)
- `.deckent/config.json` — performance mode, max_workers=6, haiku_allowed=false

**Önerilen session başlangıcı:**
1. Sağlık kontrolü çalıştır (yukarıdaki 5 komut)
2. `deckent_status` (MCP) ile mevcut durum
3. Bu doküman + `docs/ROADMAP-GOD-LEVEL.md` + `docs/KNOWN_ISSUES.md` oku
4. Sprint 153 DIRECTIVES şablonu Alperen onayla → plan (structured) → start

İyi sprintler. 🚀
