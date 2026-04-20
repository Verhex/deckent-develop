# 🌅 Sprint 149 — Yarın Sabah Başlangıç Prompt'u

**Hazırlanma tarihi:** 2026-04-20 22:00 TRT (Sprint 148 post)
**Hedef başlangıç:** 2026-04-21 08:00-09:00 TRT (Çarşamba sabah)
**Süre tahmini:** Pre-flight 15dk + DIRECTIVES review 10dk + deckent_start + 3-4h canlı monitoring + commit ceremony 20dk = toplam 4-5h
**Kritik hedef:** Sprint 150 Perşembe Beta GA'ya giriş bileti

---

## 📋 YARIN SABAH KULLANILACAK PROMPT

Aşağıdaki metni yarın sabah ilk mesaj olarak gönder:

```
Sprint 149 canlı başlatma. Dün gece Sprint 148 tamamlandı (27/28 DONE, 1h 0m, ADR-041 proposed). DIRECTIVES.md 27 task hazır, ROADMAP-GOD-LEVEL.md anchor commit edildi.

Hemen yap:
1. 3 paralel komut — durum doğrula:
   - git log --oneline -5 (son commit 74bd29a ROADMAP olmalı)
   - git status --short (temiz olmalı)
   - ls .tasks/ (sadece archive/ olmalı)

2. DIRECTIVES.md'yi kısaca doğrula (27 task + 6 block + 15-gate):
   - wc -l DIRECTIVES.md (≥1400 satır)
   - grep -c "^## Task " DIRECTIVES.md (= 27)

3. Memory anchor recall:
   - project_roadmap_god_level.md (Sprint 149-200 plan)
   - feedback_openclaw_not_openhands.md (rakip OpenClaw)
   - feedback_test_agent_removal.md (test-writer yasak)

4. Pre-flight doctor kontrol:
   - npx deckent doctor (READY + 15 agent)
   - Ana sağlık görünsün

5. Orphan cleanup kontrol:
   - .tasks/ altında sadece archive/ var mı?
   - Varsa Sprint 148 artıkları archive'la

6. Sonra bana onay için 27 task özetli tablo göster. Ben "deckent_plan" ve "deckent_start" onayı verdiğimde sprint başlat.

Kurallar (değiştirme):
- test-writer agent YASAK (Sprint 148 reform kalıcı)
- Ana PID constraint: worker'da nervous.init() YASAK
- Sprint canlı iken src/ müdahale YASAK
- deckent_plan mode: 'structured' (AI mode 3 sprint fail, Sprint 149 structured)
- Hard cap: 8h, cost cap: $130 soft
- Fallback: katastrofik fail → Sprint 150 numaratör +1 (Beta GA 1 gün kayar)

Beta GA: Perşembe 23 Nis TRT sabit hedef. Sprint 149 bu hedefin ön koşulu.

Canlı monitoring 3-layer (Sprint 145-148 pattern):
- Layer 1 (MCP): deckent_status every 270s (cache window)
- Layer 2 (FS): .tasks/task-149-*.result + .hb dosyaları
- Layer 3 (Event): .deckent/events.jsonl channel distribution

Hadi başlayalım.
```

---

## 🎯 Sprint 149 Özeti (Prompt'tan Bağımsız Hatırlatma)

### 27 Task × 6 Block × 6 Wave

| Block | Task Aralığı | Tema | Key Deliverables |
|-------|--------------|------|-------------------|
| **A** | T1-T4 | Mode Architecture | `deckent_style` config, `deckent mode` CLI, task-mode-runner, task-mode-idle detector |
| **B** | T5-T9 | P0 Security + Debt | Dockerfile USER, .deck interpolation, Docker exit fix, scope sanitizer v2, auditor stale race |
| **C** | T10-T15 | Messaging Trio | IMessageConnector, Discord, Telegram, WhatsApp scaffold, ConnectorPool, webhook router |
| **D** | T16-T20 | DeckentHub + Ed25519 | signature.ts, deckent-hub repo, 20 seed skill, publish CLI, validate-skill.yml CI |
| **E** | T21-T24 | Doc Consolidation | README overhaul, AGENTS.md refresh, 388 .md review, TR/EN parity + link check |
| **F** | T25-T27 | Release Prep | ADR-041 accept + ADR-042 draft, npm pack --dry-run v1.0.0-beta.1, public repo manifest |

### Yeni Kod Tahmini
- **~1450 LoC yeni** (connectors 800 + security 150 + hub 400 + mode 100)
- **%65 reuse** (provider+dispatcher+sandbox+registry-client+credentials zaten var)
- **Opus ağırlıklı**: 15 task, Sonnet: 12 task

### Sprint 148'den Taşınan Debt (8 item entegre)
1. T-148-020 Vitest Docker exit → T-149-007
2. T-148-022 Docker HB partial → T-149-007 (birleşik)
3. Scope sanitizer false positive → T-149-008
4. Auditor stale race → T-149-009
5. AI mode provider error → Sprint 151'e ertelendi (structured mode kullanılıyor)
6. Dockerfile root → T-149-005
7. `.deck` interpolation → T-149-006
8. test-writer PROMPT.md sweep → T-149-022 AGENTS.md içinde

### 15-Gate Exit Criteria (Sprint 150 Beta GA kapısı)
1. tsc PASS ✅
2. vitest fail < 50 (Sprint 148: 135, hedef <50)
3. doctor ≥ 92
4. NO_GO ≤ 2
5. Nervous events ≥ 5
6. `test-writer` assigned = 0
7. cost < $130
8. ADR-041 accepted
9. `deckent_style` toggle canlı
10. Discord + Telegram smoke
11. 20 seed skill signed
12. npm pack dry-run clean
13. Dockerfile non-root
14. .deck interpolation canlı
15. Public repo sync manifest

---

## 🚦 Yarın Sabah Karar Noktaları

### Q1: AI Mode mu Structured mu?
**Varsayılan:** Structured (Sprint 145-148 AI mode 3 sprint fail — provider registry bug)
**Eğer Alperen "AI mode deneyelim" derse:** OK — fail olursa 2dk timeout + structured fallback

### Q2: Hard Cap 8h yeterli mi?
**Varsayılan:** 8h soft cap 27 task için (Sprint 148: 28 task 1h 0m baseline)
**Risk:** Block C messaging 6 task + Block D hub 5 task birlikte 3-4h alabilir
**Fallback:** 6h'te 20 task done ise Block E-F bir sonraki sabah Sprint 150 öncesi manuel

### Q3: WhatsApp Sprint 149'da scaffold-only mi yoksa aktive mi?
**Varsayılan:** Scaffold-only (Business API onayı 2-6 hafta) — Sprint 152+ aktivasyon
**Onay:** Alperen `whatsapp-web.js` (unofficial) istemedi, official API + bekleme

### Q4: Public Repo VerhexIO/deckent Sprint 149'da mı açılacak?
**Varsayılan:** HAYIR — Sprint 149 private içinde hazırlık, Sprint 150 Alperen manuel flip
**Gerekçe:** Alperen "geçişte tam kontrol yapacağım" dedi

### Q5: DeckentHub Ed25519 key Alperen'in mi olacak?
**Varsayılan:** Sprint 149'da `loadOrGenerateKeypair()` auto-gen (geliştirme için)
**Sprint 150'de:** Alperen kendi master keypair'ini üretir, seed skill'leri yeniden sign eder
**Çünkü:** Development key production key olmamalı

---

## 📍 Oturum Devamı İçin Önemli Referanslar

**Canonical Anchor Docs (okunacak):**
1. `docs/ROADMAP-GOD-LEVEL.md` — Sprint 149-200 master roadmap
2. `BETA-TRACKER.md` — 15-gate exit criteria
3. `DIRECTIVES.md` — 27 task detaylı (bu dosya)
4. `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` — Sprint 148 design (context)
5. `.brain/archive/retro-sprint-148.md` — Sprint 148 retro

**Memory Anchor'lar:**
1. `project_roadmap_god_level.md` — Sprint 149-200 kararları
2. `feedback_openclaw_not_openhands.md` — rakip OpenClaw (15. tekrar)
3. `feedback_test_agent_removal.md` — test-writer yasak
4. `feedback_deckent_native_execution_rule.md` — MCP + CLI + Brain, subagent-driven yasak
5. `feedback_deckent_kill_approval_required.md` — kill/cleanup sadece onaylı
6. `feedback_timezone_trt.md` — UTC+3 TRT gösterim
7. `project_sprint148_completed.md` (bir sonraki session'da yaz) — Sprint 148 kapanış

**Git Durumu:**
- HEAD: `74bd29a docs: anchor Sprint 149-200 god-level roadmap`
- Branch: master
- Remote sync: ✅ origin/master güncel
- Working tree: temiz (.tasks/ sadece archive/)

---

## 🎭 Motivasyon Notu

**Sprint 145-148 başarıları:**
- Sprint 145: 27/28, 1h 32m, adaptive timeout + observability
- Sprint 146: 16/17, 1h 2m, prompt god template reform
- Sprint 147: 23/23, **49m 34s, 0 TD, 0 NO_GO** — Deckent tarihinin en temiz sprint'i
- Sprint 148: 27/28, 1h 0m, meta-dogfood, ADR-041 proposed, cross-platform 3/3

**Sprint 149 hedefi:** 27/27 veya 26/27 DONE, ≤2 NO_GO, Sprint 150 Beta GA hazır.

**Vizyon:** Deckent = OpenClaw'ın god-level üstün hali (developer-first + life assistant, AST-sandboxed, sprint-disciplined).

**Alperen'in kararları sabit:**
- Dual mode (sprint + task) `deckent_style` config toggle
- Messaging trio (Discord + Telegram + WhatsApp)
- DeckentHub separate repo + Ed25519 signature
- Voice/Mobile milestone-gated (10K/50K star)
- Solo dev hikayesi = USP

**Sprint 150 Perşembe 23 Nis TRT = 1 gün 11 saat Sprint 149 başlangıcından.**

---

## ✅ Yarın Sabah Check-list

- [ ] Saat 08:00-09:00 TRT başlangıç
- [ ] Bu dosyadaki prompt'u ilk mesaj olarak gönder
- [ ] Koordinatör 3 paralel durum doğrulama yapacak
- [ ] Memory anchor recall (5 key memory)
- [ ] Doctor + orphan cleanup pre-flight
- [ ] 27 task özet tablo Alperen review
- [ ] **Alperen onay: deckent_plan**
- [ ] plan structured (AI mode fallback hazır)
- [ ] **Alperen onay: deckent_start**
- [ ] 8h hard cap timer başlar
- [ ] 3-layer monitoring (MCP + FS + event stream)
- [ ] Sprint 149 canlı izlem 2-4h
- [ ] Sprint 149 complete → 2-commit ceremony
- [ ] Push → remote sync
- [ ] Sprint 150 Beta GA pre-flight başlangıç

---

**💪 Sprint 148 başardık — Sprint 149 da başaracağız. Sprint 150 Perşembe Beta GA kesinleşti.**

**BAŞARACAĞIZ! 🚀🦞🧠**
