# Sistem Taşıma Playbook — Deckent + Claude Memory + Sprint 151→152 Köprüsü

**Oluşturulma:** 2026-04-22 10:40 TRT
**Hazırlayan:** Koordinatör (Sprint 151 kapanış sonrası)
**Yeni sistem teslim:** Yarın (2026-04-23)
**Eski sistem kapanış:** Yarın (yeni sistem hazır olur olmaz)
**Hedef:** Sıfır kayıp ile yeni sistemde **Sprint 152 başlatabilir** durumda olmak

> **KURAL:** Bu dosya tek başına okunduğunda yeni sistemde tam restore yapılabilmeli. Eksik bir adım = veri/yetenek kaybı.

---

## 0. DURUM ÖZETİ — Yeni Sisteme Aktarılacak Aşamada

### 0.1 Sprint 151 Kapanış Durumu (taşıma anı)

| Özellik | Değer |
|---------|-------|
| **Aktif sprint** | sprint-151 — **CLEANUP fazı tamamlandı**, COMPLETE |
| **Sonuç** | 17/17 task (15 original + 2 fix recovery) — **GO_WITH_GATE_FAILURE** (vitest 1 fail) |
| **Süre** | 56 dakika 2 saniye |
| **NO_GO rate** | %0 (Sprint 138'den beri ilk %100 başarı) |
| **Code changes** | +4566/-42, 15 yeni test dosyası |
| **Beta GA Exit Gate** | 17/20 → 19/20 (T-151-009 + T-151-014 açıldı) |
| **Kalan 1 gate** | npm publish + public repo flip (Alperen elle) |

### 0.2 Git Durumu

- **Remote:** `https://github.com/VerhexIO/deckent-dev.git` (private)
- **Branch:** `master`
- **Lokal commit önde:** 0 (tüm Sprint 150 + 151 directives push edildi → `b087678`)
- **Uncommitted değişiklikler:** **VAR** — Sprint 151 worker output'ları henüz commit edilmedi (15+ task'ın src/, tests/, docs/, .brain/ yazımları)

> ⚠️ **KRİTİK:** Yeni sistemde clone yapmak yerine **mevcut working tree'yi de taşımak gerekiyor**, aksi halde Sprint 151'in tüm uncommitted output'u kaybolur (~4566 satır kod + 15 test dosyası + .brain/ memory updates).

### 0.3 Aktif Süreçler

| Süreç | PID | Aksiyon |
|------|-----|---------|
| **MCP server** (`node dist/mcp/server.js`) | 1036114 | Yeni sistemde restart (Claude Code MCP `/mcp restart`) |
| **Background sprint job** | yok (sprint-1776837567420 COMPLETE) | Aksiyon gerekmez |
| **Tmux sessions** | yok | Aksiyon gerekmez |
| **Docker containers (deckent-worker)** | 4 exited 5 gün önce | **YENİ SİSTEMDE temizle** (`docker rm` veya `docker system prune`) |

---

## 1. TAŞINACAK DOSYALAR — Tam Manifest

### 1.1 PROJE KÖKÜ — `/home/alperen/deckent-dev` (509MB toplam, ~290MB transfer)

#### A. KESİNLİKLE TAŞI (kaynak gerçek)

| Yol | Boyut | Açıklama |
|-----|-------|---------|
| `src/` | 152M | TypeScript kaynak kod (16 agent + 21 skill + 65+ orchestra modül) |
| `tests/` | 9.8M | 15728+ test (vitest) |
| `docs/` | 110M | Dökümantasyon, ADR, audits, launch drafts |
| `.git/` | 43M | **TÜM HISTORY** — kesinlikle taşı (clone tek başına yetersiz) |
| `.brain/` | 11M | **memory.db SQLite (2.3MB) + ERRORS + MEMORY + RETRO + PATTERNS + exports/** |
| `.deckent/` | 8.5M | Config, agent manifest, skill manifest, observability JSONL, archive |
| `.tasks/` | 1.4M | Sprint 151 archived task dosyaları (zaten archive/'a taşındı, yine de korunsun) |
| `.claude/` | (küçük) | `rules/` (brain.md, auditor.md, worker-default.md) + `settings.local.json` |
| `package.json` + `package-lock.json` | (küçük) | npm dependency manifest |
| `tsconfig.json` | (küçük) | TypeScript config |
| `vitest.config.ts` | (küçük) | Test runner config |
| `Dockerfile` + `docker-compose.yml` (varsa) | (küçük) | Worker container build |
| Kök `.md` dosyaları | (küçük) | README, DECKENT.md, DIRECTIVES.md, CLAUDE.md, CHANGELOG, NEXT-SESSION-PROMPT, DECKENT-MASTER-BLUEPRINT, DECKENT-ANA-PLAN-TR, BETA-TRACKER, **bu dosya (SYSTEM-MIGRATION-2026-04-22.md)** |
| `scripts/` | (küçük) | deploy-discord.sh, deploy-telegram.sh, public-repo-sync.sh, cli-smoke-test.sh |
| `.gitignore`, `.dockerignore` | (küçük) | İhmal listesi |

#### B. YENİ SİSTEMDE YENİDEN OLUŞTUR (taşıma)

| Yol | Boyut | Açıklama |
|-----|-------|---------|
| `node_modules/` | 167M | `npm install` ile yeniden inşa |
| `dist/` | 6.9M | `npx tsc` ile yeniden derle |
| Docker image `deckent-worker:latest` | — | `docker build` ile yeniden inşa (Dockerfile var) |

#### C. TAŞIMAMA (eski sistemde kalsın)

| Yol | Sebep |
|-----|-------|
| `.tasks/*.hb`, `.tasks/*.log` | Sprint 151 zaten kapandı, log archive'da |
| Çalışan PID'ler | Yeni sistemde yeni PID |
| Eski docker container'lar (4 exited) | Temizle: `docker rm $(docker ps -a -q --filter "name=deckent")` |

### 1.2 KULLANICI HOME — `/home/alperen/`

#### A. KESİNLİKLE TAŞI

| Yol | Açıklama |
|-----|---------|
| **`~/.claude/`** | **Tüm Claude Code state** — backup'lar, cache, file-history, history.jsonl, ide, paste-cache, plans |
| **`~/.claude/.credentials.json`** | Claude API credentials (mode 600) |
| **`~/.claude.json`** | Claude Code global config (34KB) |
| **`~/.claude/projects/-home-alperen-deckent-dev/`** | **PROJE-SPESIFIK CLAUDE SESSION HISTORY (jsonl dosyaları, binlerce — bu konuşma dahil)** |
| **`~/.claude/projects/-home-alperen-deckent-dev/memory/`** | **82 memory dosyası — auto-memory bütün öğrenimler** (`MEMORY.md` indeksi + her tipte `feedback_*`, `project_*`, `user_*`, `reference_*`) |
| `~/.config/gh/hosts.yml` | GitHub CLI auth token (gho_ OAuth, valid) |
| `~/.bashrc`, `~/.profile` | Shell config |

#### B. KONTROL ET, GEREKİRSE TAŞI

| Yol | Aksiyon |
|-----|---------|
| `~/.npmrc` | Yok şu an, NPM publish için yeni sistemde gerekirse `npm login` |
| `~/.ssh/` | Yok şu an, SSH gerekirse yeni sistemde `ssh-keygen` |
| `~/.docker/config.json` | Docker registry auth (varsa taşı) |

#### C. YENİ SİSTEMDE YENİDEN KUR

| Bağımlılık | Komut |
|-----------|-------|
| Node.js >= 18 (önerilen 22) | `nvm install 22` veya distro paket |
| npm | Node ile gelir |
| git | distro paket |
| Docker | `docker.io` veya Docker Desktop |
| tmux (opsiyonel) | distro paket |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` veya download |
| GitHub CLI (`gh`) | Apt/brew |

---

## 2. TAŞIMA ÖNCESİ HAZIRLIK (Eski Sistem Bugün)

### Adım 2.1 — Working Tree Snapshot Commit (KRİTİK)

Sprint 151 worker'ları 4566 satır kod yazdı + 15 yeni test dosyası, **henüz commit edilmedi**. Yeni sistemde `git clone` yetmeyecek; iki seçenek var:

**Seçenek A (önerilen): Sprint 151 commit ceremony eski sistemde yap**
```bash
# 7 mantıksal commit (DETAILED PLAN bölümünde)
# Sonra push:
git push origin master
# Yeni sistemde sadece git clone yeterli olur
```

**Seçenek B: Working tree'yi olduğu gibi taşı (commit etmeden)**
```bash
# rsync veya tar.gz ile uncommitted değişiklikler dahil tüm dizini taşı
# Yeni sistemde git status temiz olmaz, commit yeni sistemde yapılır
```

> 💡 **A'yı öneriyorum:** Yeni sistemde commit yaparsan author/timestamp drift olabilir, eski sistemde temiz commit + push daha güvenli.

### Adım 2.2 — Memory + Brain Export Doğrulaması

```bash
# Sprint 151 öğrenimleri DB'de mi?
sqlite3 .brain/memory.db "SELECT type, COUNT(*) FROM entries GROUP BY type;"
# Beklenen: adr=42, memory=11+, retro=N, pattern=N

# Exports güncel mi?
ls -la .brain/exports/*.md
# Hepsi 2026-04-22 olmalı (auto-generated Sprint 151 sonrası)

# Auto-memory dizini boyut
du -sh ~/.claude/projects/-home-alperen-deckent-dev/memory/
# 82 dosya, ~1-2MB civarı
```

### Adım 2.3 — Docker State Temizliği

```bash
# Sprint 151 öncesi 4 exited container var (5 gün önce)
docker ps -a --filter "name=deckent-w-" --format "{{.ID}}" | xargs -r docker rm
# Image korunsun, yeni sistemde rebuild zaten yapılacak
```

### Adım 2.4 — MCP Server Durdurma

```bash
# Background MCP process (PID 1036114)
# Yeni sistemde otomatik başlar Claude Code'la, eskide manuel kill gerekmez
# Sadece sistem kapanırken doğal terminate olacak
```

### Adım 2.5 — Sprint 152 NEXT-SESSION-PROMPT Yaz

Bu dosyayla birlikte `NEXT-SESSION-PROMPT.md` Sprint 152 versiyonu hazırlanacak (Bölüm 7'de detay).

---

## 3. TAŞIMA YÖNTEMLERİ — Üç Alternatif

### Yöntem A — `rsync` (önerilen, en hızlı, incremental)

**Avantaj:** node_modules atlayabilir, --exclude esnek, resume mümkün, network üzerinden
**Komut (eski sistemden yeni sisteme):**
```bash
# 1. Proje kökü
rsync -avzP --exclude 'node_modules' --exclude 'dist' \
  /home/alperen/deckent-dev/ \
  alperen@yeni-sistem-ip:/home/alperen/deckent-dev/

# 2. Claude memory + global state
rsync -avzP \
  /home/alperen/.claude/ \
  alperen@yeni-sistem-ip:/home/alperen/.claude/

# 3. Claude global config
rsync -avzP /home/alperen/.claude.json alperen@yeni-sistem-ip:/home/alperen/

# 4. GitHub CLI auth
rsync -avzP --rsync-path="mkdir -p ~/.config/gh && rsync" \
  /home/alperen/.config/gh/ \
  alperen@yeni-sistem-ip:/home/alperen/.config/gh/
```

### Yöntem B — `tar.gz` Bundle (offline, USB/external disk)

```bash
# Eski sistemde:
cd /home/alperen
tar -czf deckent-migration-$(date +%Y%m%d).tar.gz \
  --exclude='deckent-dev/node_modules' \
  --exclude='deckent-dev/dist' \
  deckent-dev/ \
  .claude/ \
  .claude.json \
  .config/gh/ \
  .bashrc .profile

# ~290MB tahmini, USB'ye kopyala
# Yeni sistemde:
cd /home/alperen
tar -xzf deckent-migration-20260422.tar.gz
```

### Yöntem C — `git push` + `~/.claude` rsync (hibrit)

**Sprint 151'i önce commit + push (Adım 2.1 Seçenek A), sonra:**
- Yeni sistem: `git clone https://github.com/VerhexIO/deckent-dev.git`
- Sadece `~/.claude/` + `~/.claude.json` rsync (memory + session history için zorunlu)
- node_modules + dist: yeni sistemde `npm install && npx tsc`

> 💡 **Bu en temiz yol** çünkü git remote her zaman güvenilir kaynak.

---

## 4. YENİ SİSTEM RESTORE — Adım Adım Checklist

### Adım 4.1 — Temel Bağımlılıklar Kur

```bash
# Linux distro (Ubuntu 22.04+ varsayım):
sudo apt update
sudo apt install -y git curl build-essential tmux

# Node.js 22 (nvm önerilen):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# Doğrula:
node -v   # v22.x
npm -v
git --version

# Docker (deckent worker container için ZORUNLU):
sudo apt install -y docker.io
sudo usermod -aG docker $USER
# Logout/login sonrası: docker ps çalışmalı

# Claude Code CLI:
npm install -g @anthropic-ai/claude-code
# Veya: https://claude.com/claude-code download

# GitHub CLI:
sudo apt install -y gh
```

### Adım 4.2 — Dosyaları Taşı (Yöntem A/B/C'den biri)

Yöntem C ile (en temiz):
```bash
mkdir -p ~/deckent-dev
cd ~/deckent-dev
git clone https://github.com/VerhexIO/deckent-dev.git .

# ~/.claude restore (rsync veya tar)
# rsync örneği:
rsync -avzP eski-sistem:/home/alperen/.claude/ ~/.claude/
rsync -avzP eski-sistem:/home/alperen/.claude.json ~/

# GitHub CLI auth
rsync -avzP eski-sistem:/home/alperen/.config/gh/ ~/.config/gh/
```

### Adım 4.3 — Build + Dependency

```bash
cd ~/deckent-dev
npm install            # 167MB node_modules yeniden inşa, ~2-5 dk
npx tsc                # dist/ derle, 0 error beklenir
# Doğrulama:
ls dist/cli/index.js dist/mcp/server.js   # Mevcut olmalı
```

### Adım 4.4 — Docker Worker Image Rebuild

```bash
cd ~/deckent-dev
docker build -t deckent-worker:latest -f Dockerfile .
# ~3-5 dk, sonunda image hazır
# Doğrulama:
docker images | grep deckent-worker
```

### Adım 4.5 — Auth Doğrulamaları

```bash
# GitHub:
gh auth status
# Beklenen: ✓ Logged in to github.com account AlbSar (gho_*)
# Eğer fail: gh auth login -h github.com -s repo,workflow -w

# Git push test (dry-run):
git push origin master --dry-run
# Beklenen: "Everything up-to-date" veya boş

# Claude Code:
claude --version   # 2.1.117+ olmalı
# MCP register kontrol:
claude mcp list
# Beklenen: deckent görünmeli (yoksa: claude mcp add deckent -- npx deckent mcp)
```

### Adım 4.6 — MCP Server Restart + Smoke

```bash
# Claude Code başlatınca MCP otomatik başlar.
# Manuel test:
node dist/mcp/server.js &
# Veya Claude Code içinde: /mcp restart

# Sağlık testi:
# Claude Code'a sor: "deckent_doctor çalıştır"
# Beklenen: 90+/100 (DECISIONS.md missing cosmetic OK)
```

### Adım 4.7 — Memory + Brain DB Doğrulama

```bash
# Memory V2 SQLite hâlâ okunuyor mu?
sqlite3 .brain/memory.db "SELECT COUNT(*) FROM entries;"
# Beklenen: 174+ (Sprint 151 sonrası)

# Auto-memory:
ls ~/.claude/projects/-home-alperen-deckent-dev/memory/ | wc -l
# Beklenen: 82+

# Index okunuyor mu?
head -5 ~/.claude/projects/-home-alperen-deckent-dev/memory/MEMORY.md
# Sprint 151 P0 + npm publish approval feedback'i en üstte olmalı
```

### Adım 4.8 — Vitest + Build Smoke

```bash
# TypeScript:
npx tsc --noEmit
# Beklenen: 0 error

# Vitest (kısa bir suite):
npx vitest run tests/core/config-sprint064.test.ts
# Beklenen: 11/11 PASS (Sprint 151 fix sonrası)

# Tam suite (uzun, opsiyonel):
npx vitest run
# Beklenen: 15727 PASS / 1 FAIL (Sprint 151 gate failure sebebi, Sprint 152 P0)
```

### Adım 4.9 — Sprint Status Sanity

```bash
# Sprint 151 COMPLETE görünüyor mu?
# Claude Code'a sor: "deckent_status"
# Beklenen: sprint-151 phase=COMPLETE, 0 active worker
```

---

## 5. SPRINT 151 COMMIT CEREMONY — Eski Sistemde Yapılacak

Yeni sisteme geçmeden önce 7 mantıksal commit + push:

```bash
# 1. Sprint 151 dashboard ChatPage
git add src/dashboard/src/pages/ChatPage.tsx src/dashboard/src/routes.tsx \
  src/dashboard/src/App.tsx src/dashboard/src/components/Layout.tsx \
  src/dashboard/src/i18n/en.ts src/dashboard/src/i18n/tr.ts \
  tests/dashboard/chat-page.test.tsx
git commit -m "feat(dashboard): ChatPage 7th page + i18n + 14 tests (T-151-003)"

# 2. Brain Evaluator 5-in-1 fix
git add src/orchestra/result-evaluator.ts src/orchestra/quality-assessor.ts \
  src/orchestra/debt-manager.ts tests/orchestra/result-evaluator.test.ts \
  tests/orchestra/evaluator-*.test.ts
git commit -m "feat(orchestra): Brain Evaluator 5-in-1 fix (verification-blind + schema + FIX context + scope heuristic) (T-151-012)"

# 3. Nervous System detector 6-10
git add src/nervous/detectors/ src/nervous/detector-registry.ts \
  tests/nervous/detectors/
git commit -m "feat(nervous): 5 new detectors (6→11) + 15 tests (T-151-015)"

# 4. Notify E2E test framework
git add tests/e2e/notify-sprint-lifecycle.test.ts \
  tests/e2e/nervous-bridge-delivery.test.ts
git commit -m "test(notify): 22 E2E tests for sprint lifecycle + nervous bridge (T-151-009)"

# 5. CLI smoke + envanter
git add tests/cli/buildProgram-smoke.test.ts tests/cli/cli-inventory.test.ts \
  scripts/cli-smoke-test.sh docs/reference/cli-commands.md
git commit -m "feat(cli): buildProgram smoke + 104 command inventory + smoke harness (T-151-010, T-151-011)"

# 6. Docker HB final fix
git add src/orchestra/spawn-backend-docker.ts src/agents/worker.sh \
  tests/e2e/docker-oom-reproducer.test.ts
git commit -m "fix(docker): 6-layer HB exit pattern (3-sprint debt final) (T-151-014)"

# 7. Launch docs + handoffs
git add docs/release/npm-publish-handoff.md docs/release/public-repo-flip-handoff.md \
  docs/release/public-repo-manifest.md scripts/public-repo-sync.sh \
  scripts/deploy-discord.sh scripts/deploy-telegram.sh \
  docs/launch/ package.json CHANGELOG.md
git commit -m "docs(launch): npm + repo flip handoff + Discord/Telegram + announce/blog (T-151-001..008)"

# 8. Brain memory + agent manifests + config
git add .brain/ .deckent/agents/ .deckent/skills/ .deckent/config.json \
  .deckent/sprint-151-events.jsonl .deckent/sprint-151-metrics.jsonl
git commit -m "chore(sprint-151): brain memory + agent/skill manifests + observability"

# 9. Migration playbook + Sprint 152 next-session prompt
git add SYSTEM-MIGRATION-2026-04-22.md NEXT-SESSION-PROMPT.md
git commit -m "docs(migration): system migration playbook + Sprint 152 handoff"

# Push:
git push origin master
```

> 📌 **Bu commit listesi tahmini.** Gerçek dosyalar `git status` çıktısına göre ayarlanmalı. Yarın yeni sistemde commit ceremony yaparsanız aynı pattern uygulayın.

---

## 6. KRİTİK NOTLAR + RİSKLER

### 6.1 ABSOLUTE Yapılmaması Gerekenler

- ❌ **`.brain/memory.db`'yi yeniden oluşturma** (`deckent memory rebuild` çalıştırma) — eski sistemden taze taşınmalı, 174 entry kaybolur
- ❌ **`~/.claude/projects/-home-alperen-deckent-dev/`'yi atlamak** — bu konuşma dahil tüm session history burada
- ❌ **`~/.claude/projects/.../memory/`'yi atlamak** — 82 auto-memory dosyası (npm publish kuralı, test-writer YASAK, two-persona, OpenClaw, max workers, kill approval, vs)
- ❌ **`gh auth status` invalid ile push denemek** — hata verir, önce `gh auth login -h github.com -s repo,workflow -w`
- ❌ **`docker prune --all --volumes`** — sadece deckent-worker container'ları sil, image korunsun
- ❌ **Sprint 151 working tree commit etmeden taşımak** — kayıp riski

### 6.2 RİSK MATRİSİ

| Risk | Olasılık | Etki | Mitigation |
|------|----------|------|-----------|
| Memory.db corrupt | Düşük | Yüksek (174 entry kayıp) | Yeni sistemde `sqlite3 .brain/memory.db "PRAGMA integrity_check;"` |
| ~/.claude memory taşınmazsa | Orta | Çok yüksek (82 auto-memory + tüm konuşma history) | Migration playbook'ta zorunlu adım, çift kontrol |
| GitHub auth fail | Düşük | Orta | gh OAuth token taze (`gho_`), 1 yıl geçerli |
| Sprint 151 uncommitted kayıp | Orta | Çok yüksek (4566 satır + 15 test) | Adım 5 commit ceremony + push, sonra taşı |
| node_modules version mismatch | Düşük | Düşük | `npm install` lock file ile aynısını kurar |
| Docker image yok | Yüksek (yeni sistem) | Orta | Adım 4.4 rebuild, ~5 dk |
| MCP server register edilmemiş | Yüksek | Orta | Adım 4.5'te `claude mcp list` + register |
| Vitest 1 fail (Sprint 151 gate failure) | %100 (zaten var) | Düşük | Sprint 152 P0, taşıma sırasında değişmez |

### 6.3 Dual-Boot Stratejisi (önerilen)

Yeni sistem hazır olunca **eski sistemi 1 hafta açık tut**:
- Yeni sistemde sorun çıkarsa eski sistemden tek dosya kopyala
- Sprint 152 başlatıp ilk sprint geçince eski sistem güvenle kapanır
- Yedek garantisi: çift backup

---

## 7. SPRINT 152 BAŞLANGIÇ HAZIRLIK — Yeni Sistemde Gün 1

### 7.1 NEXT-SESSION-PROMPT.md (Yeni Sistem İlk Açılış İçin)

Bu dosya proje kökünde olacak (commit edilmiş). Yeni sistemde Claude Code açıldığında ilk komut:

```
/cwd ~/deckent-dev
Önce SYSTEM-MIGRATION-2026-04-22.md ve NEXT-SESSION-PROMPT.md oku, sonra deckent_doctor çalıştır.
```

### 7.2 Sprint 152 Carry-Over P0 Listesi

Sprint 151'den taşınan ve **Sprint 152'de mutlaka ele alınacak** debt'ler:

| ID | Konu | Kaynak |
|----|------|-------|
| **P0-1** | **Notify Dispatcher Background Subprocess Wire Fix** | Bugün canlı tespit + Task #5 |
| **P0-2** | Vitest 1 residual fail (Sprint 151 GATE_FAILURE sebebi) | Sprint 151 RETRO |
| **P0-3** | Worker timeout root cause (Claude CLI session issue) | T-151-013 + T-151-014 NO_GO |
| **P0-4** | Beta GA 20/20 — Alperen elle: `npm publish` + `git push` + UI flip | T-151-001 + T-151-002 handoff hazır |
| **P1-1** | MCP/CLI parity reform (%49 parity keşfi) | T-151-011 |
| **P1-2** | Event stream Wave 2+ event'leri kaçırıyor | Bugün canlı tespit |
| **P1-3** | Status reader robustness (`Invalid count value` hata) | Bugün canlı tespit |
| **P2-1** | Brain Evaluator 5-in-1 runtime canlı doğrulama | T-151-012 (build sonrası dogfood) |
| **P2-2** | Nervous detector 6-10 runtime canlı | T-151-015 |

### 7.3 Sprint 152 Tema Önerisi

> **"Beta GA Final Polish + Notify Dispatcher Runtime Fix + Sprint 151 Carry-Over"**

Tahmini 10-12 task, 4-6 saat hard cap.

### 7.4 Beta GA Cutover (Alperen Elle Adımları — Yeni Sistem)

Yeni sistemde Sprint 152 başlamadan önce yapılabilecek 3 adım:

```bash
# 1. npm publish (T-151-001 handoff: docs/release/npm-publish-handoff.md)
npm whoami   # Login değilse: npm login
npm pack --dry-run   # Son tarball kontrol
npm publish --access public --tag beta
npm info deckent@1.0.0-beta.1 version

# 2. Public repo flip (T-151-002 handoff: docs/release/public-repo-flip-handoff.md)
cd ~
git clone https://github.com/VerhexIO/deckent-dev.git deckent-public  # veya yeni repo create
cd ~/deckent-dev
bash scripts/public-repo-sync.sh   # rsync exclude listesi uygular
cd ~/deckent-public
git push origin master
# GitHub UI: Settings → Danger Zone → Change visibility → Public

# 3. Doğrulama
curl -s https://api.github.com/repos/VerhexIO/deckent | jq '.private'
# Beklenen: false
```

---

## 8. ALPEREN'İN HEMEN ŞIMDIDEN AKLINDA TUTACAĞI

### 8.1 Mutlaka Yedekle

| Yer | İçerik | Tahmini Boyut |
|-----|--------|---------------|
| `~/deckent-dev/` (node_modules + dist hariç) | Tüm kaynak + .git + .brain + .deckent + .tasks | ~290 MB |
| `~/.claude/` | Tüm Claude Code state | ~5-10 MB |
| `~/.claude.json` | Global config | 35 KB |
| `~/.config/gh/` | GitHub CLI auth | <1 KB |
| `~/.bashrc`, `~/.profile` | Shell config | <10 KB |

**Toplam transfer:** ~300 MB

### 8.2 Yarın İlk İş

1. Yeni sistemde Bölüm 4 checklist'i sırayla uygula
2. Bölüm 4.5 → 4.9 doğrulamaları yapmadan Sprint 152 başlatma
3. Şu komutla bana ulaş:
   ```
   "Yeni sistemde Sprint 151 sonrası restore tamamlandı.
   SYSTEM-MIGRATION-2026-04-22.md Bölüm 4 checklist tamamen yeşil.
   Sprint 152 başlatabilir miyiz?"
   ```
4. Ben restore doğrulaması (doctor + status + memory query + auth check) yapıp Sprint 152 hazırlığına geçeceğim

### 8.3 İletişim

Yeni sistemde bu dosyayı (`SYSTEM-MIGRATION-2026-04-22.md`) okur okumaz tüm context'im hazır olur — auto-memory dosyaları + kod tabanı + brain DB sayesinde.

---

## 9. KAPANIŞ — Bugünlük İş Bitti

### Eski Sistem Yapılacaklar (Bugün)

- [ ] **(opsiyonel ama ÖNERİLEN)** Sprint 151 commit ceremony (Bölüm 5'teki 9 commit) + `git push origin master`
- [x] Sprint 151 RETRO oluşturuldu (`.brain/RETRO.md`)
- [x] Sprint 151 task dosyaları arşivlendi (.tasks/archive/)
- [x] Memory V2 export'ları güncel (Sprint 151 learnings dahil)
- [x] **SYSTEM-MIGRATION-2026-04-22.md** yazıldı (bu dosya)
- [ ] **NEXT-SESSION-PROMPT.md** Sprint 152 versiyonu yazılacak (taşıma sonrası ilk komut için)
- [ ] Migration commit + push (eski sistemde son ceremony)

### Yeni Sistem Yapılacaklar (Yarın)

- [ ] Bölüm 4 checklist tamamı (Adım 4.1 → 4.9)
- [ ] Beta GA Alperen elle 3 adım (Bölüm 7.4) — opsiyonel, Sprint 152 öncesi veya sırasında
- [ ] Sprint 152 başlatma (NEXT-SESSION-PROMPT.md ile)

---

**Hazırlayan:** Koordinatör
**Tarih:** 2026-04-22 10:40 TRT
**Sprint 151 Final:** GO_WITH_GATE_FAILURE — 17/17 (%100) — 56dk 2sn — NO_GO rate %0
**Beta GA Exit Gate:** 19/20 (1 kalan: Alperen elle npm publish + repo flip)
**Sonraki Yaşayan Belge:** NEXT-SESSION-PROMPT.md (Sprint 152 handoff)

🌃 **İyi geceler. Yarın yeni sistemden devam.**
