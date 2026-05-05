# T-152-025: Git State Hijyen + SYSTEM-MIGRATION Yaşam Döngüsü

**Sprint:** sprint-152 (READ-ONLY audit)
**Worker:** docker-152-025 (Claude opus)
**Tarih:** 2026-04-24
**Kapsam:** Git çalışma ağacı durumu, core.fileMode davranışı, WSL taşıması artifact'leri, origin/master senkronu, SYSTEM-MIGRATION dosyası dispozisyonu

## Özet

Sistem taşıması (2026-04-22: eski WSL → yeni Ryzen 9 / 30 GB) sonrası ilk çalışan sprint-152 kickoff'unda `git status` 41 satır gösteriyor (13 M, 12 D, 16 ??). Bu satırların çoğu beklenen sprint runtime davranışı (PID dosyaları arşiv taşınması, sprint-152 config toggle'ları, DIRECTIVES yenilenmesi) — ancak **4 gerçek regresyon** tespit edildi: `.claude/rules/{auditor,brain,worker-default}.md` dosyaları 91 satır kaybetmiş (AUTO-START/AUTO-END otomatik ADR blokları stripped), `.claude/settings.local.json` 173 izin entry'si kaybetmiş (eski sistem `/home/alperen/deckent-dev/` hardcoded path purge), 2 temp agent stats sıfırlanmış (`temp-react-ts-specialist` totalUses 32→0, successRate 1.0→0). `core.fileMode=false` local config'i WSL 4012 mode-diff artifact'ini başarıyla bastırıyor — manuel chmod cleanup gereksiz. `SYSTEM-MIGRATION-2026-04-22.md` proje kökünde sağlam (22824 B, 597 satır, 117ae31 commit'inde), silme olayı git reflog'a düşmedi — yerel tracked working-copy delete olduğu anlaşılıyor. `origin/master` **1 commit ileride** (`8434387 docs(claude-md): sync — sprint-151 state...`) — yerel `master` behind durumda, fast-forward pull gerekli; Sprint 151 son commit `9f80755` remote'ta mevcut. Remote URL hâlâ `VerhexIO/deckent-dev` — Sprint 151 `cce408a` commit'inde planlanan `VerhexIO/deckent` flip henüz yapılmamış.

## Bulgular

### 1. git status genel envanter

- **[PASS]** Working tree 41 satır (13 modify / 12 delete / 16 untracked). Kaynak kodda (src/, tests/) **0 satır değişiklik** — Sprint 152 READ-ONLY kuralı ihlal edilmedi (kanıt: `git diff --stat src/ tests/` boş).
- **[PASS]** `git stash list`: 6 eski stash (stash@{0} ... stash@{5}, en eski Sprint 047). Saklanıyor, sorun yok — ama hijyen için Sprint 153+ cleanup önerilir.
- **[PASS]** `git log --all` toplam 379 commit. Reflog sağlıklı (bugünkü ilk entry `9f80755 HEAD@{2026-04-24}: reset: moving to HEAD`).

### 2. 4 core diff analizi (task directive'inde belirtilen)

| Dosya | +/- | Etki | Kategori |
|-------|-----|------|----------|
| `.claude/rules/auditor.md` | +1 / −100 | 114 → 14 satır (AUTO-START ADR block stripped) | **REGRESSION** |
| `.claude/rules/brain.md` | +10 / −110 | 128 → 18 satır (AUTO-START block stripped) | **REGRESSION** |
| `.claude/rules/worker-default.md` | +2 / −102 | 120 → 16 satır (AUTO-START block stripped) | **REGRESSION** |
| `.claude/settings.local.json` | +20 / −173 | 193 satır purge (`/home/alperen/deckent-dev/` hardcoded path'ler) | **DRIFT** (beklenen — eski sistem artifact'i) |

**[REGRESSION]** `.claude/rules/*` kök sebep: `src/core/rule-generator.ts#regenerateRules()` Sprint 152 PLAN fazında (mtime 2026-04-24 12:16:30) çalıştı, ancak AUTO-START bloğundaki zengin içeriği (42 ADR + Agent/Skill Monitoring + Provider Health + Sprint Phase Tracking bölümleri) **üretemedi** → template minimum output'a düştü. `regenerateRules()` `memory.db` yoksa veya yüklemezse `adrs = []` fallback ile devam ediyor (`rule-generator.ts:297-314`) → AUTO-END içinde sadece boş header + boşluk kalıyor, committed versiyondaki ~90 satır içerik kayboluyor. `memory.db` fiziksel olarak var (2330624 B, 2026-04-24 06:25), ama `better-sqlite3` native binding (NODE_MODULE_VERSION 127 → 137 migration artifact'i) yüklenemediyse sessizce swallow oluyor (`try/catch` block, hiçbir log). **Sprint 153 öncesi P0 fix gerekli** — aksi halde worker'lara eksik rules gidiyor.

**[DRIFT]** `.claude/settings.local.json` purge: 173 satır kaldırma eski sistem mutlak path'leri içeriyor (`Bash(find /home/alperen/deckent-dev/...)`, `Bash(/tmp/deckent-test/node_modules/.bin/deckent ...)`, `Bash(tar -xf /home/alperen/deckent-dev/deckent-0.2.0-beta.1.tgz ...)`). Bu path'ler yeni sistemde (`/workspace` + `/tmp/deckent-home`) geçersiz, Claude Code izin prompt sistemi otomatik purge ediyor — **beklenen davranış**. Commit edilmemesi doğru; izinler yeni sistemde organik olarak tekrar toplanmalı.

### 3. SYSTEM-MIGRATION-2026-04-22.md dispozisyonu

- **[PASS]** Dosya proje kökünde mevcut: `22824 B`, `597 satır`, mtime `2026-04-24 08:03`.
- **[PASS]** Commit geçmişi: tek commit `117ae31 docs(migration): system migration playbook + Sprint 152 handoff` (2026-04-22).
- **[PASS]** `git log --all --oneline -- SYSTEM-MIGRATION-2026-04-22.md` sadece 1 entry → silinme ve geri-ekleme **commit seviyesinde yaşanmadı**. Task directive'inde belirtilen "silinme olayı `git restore` ile geri geldi" → yerel working-copy'den yanlışlıkla silinmiş, commit'e yansımadan restore ile geri getirilmiş. Git history temiz.
- **Disposition:** Dosya proje kökünde kalmalı — migration playbook'u onboarding + incident retrospektif dokümanıdır. **Öneri:** Sprint 160+ "messaging polish" fazında `docs/playbooks/SYSTEM-MIGRATION-2026-04-22.md` altına taşıma değerlendirilebilir (proje kökü şişmesin). `.brain/archive/` altına **taşınmamalı** — arşive alınırsa onboarding için görünürlük kaybolur (.brain/ auto-decay hedefi).

### 4. git config core.fileMode davranışı

- **[PASS]** `git config --local core.fileMode` → `false` (exit 0). Kalıcı (proje-local, `.git/config` satır 4).
- **[PASS]** Global `~/.gitconfig` yok (`/tmp/deckent-home/.gitconfig: No such file or directory`) → sadece local ayar etkin.
- **[PASS]** Ayar doğru **fileMode** camelCase + **filemode** alt satırda otomatik alias'lı — git her iki formu da tanıyor.
- **Kanıt:** `.git/config` → `[core] fileMode = false`.

### 5. WSL 4012 mode-diff artifact'i

- **[PASS]** `git -c core.fileMode=true diff --raw | wc -l` → **4012** satır. Bunların **3988**'i saf mode flip (100755 ↔ 100644). Kalan 24 satır gerçek içerik değişikliği.
- **[PASS]** `core.fileMode=false` override'ı bu 3988 mode-only diff'i başarıyla gizliyor → `git diff --stat` gerçek içerik değişikliklerini temiz gösteriyor.
- **Sonuç:** Manuel `chmod -R` cleanup **gereksiz**. WSL taşıması Linux dosya sistemine executable bit'leri yanlış atamış, ama git ignore ediyor. Tek risk: cross-platform worker (Docker non-WSL, Windows native git) `core.fileMode=true` default'uyla başlarsa 4012 fantom diff görebilir → **Sprint 153 için P1 action:** Dockerfile.worker içinde `git config --global core.fileMode false` eklenmeli ya da `.gitattributes` üzerinden `text eol=lf` + binary mode normalize edilmeli.
- **Repo toplam dosya:** 4048 tracked file (neredeyse hepsi etkilenmiş — 3988/4048 = %98).

### 6. origin/master senkronu

- **[FAIL]** Yerel `master` → `[origin/master: behind 1]` durumda. Fast-forward pull gerekli.
- **[PASS]** Sprint 151 son commit `9f80755 test(orchestra): Brain Evaluator 5-in-1 — 35 yeni test dosyası (T-151-012 follow-up)` origin'e **push edilmiş**.
- **[DRIFT]** Remote tarafta yerelde olmayan `8434387 docs(claude-md): sync — sprint-151 state + nervous/monitor/connectors + gotchas` commit'i var. Bu muhtemelen sistem taşıması sırasında eski makinede yapılmış son push; yeni sistemde henüz `git pull` yapılmamış.
- **Sprint 153+ aksiyon:** `git pull --ff-only` ile remote'u yakala, sonra uncommitted diff'leri review et → commit veya discard.

### 7. Remote URL + repo flip durumu

- **[DRIFT]** `origin` URL → `https://github.com/VerhexIO/deckent-dev.git`. Sprint 151 commit `cce408a docs(launch): npm + repo flip handoff` içinde planlanan `VerhexIO/deckent-dev → VerhexIO/deckent` flip (Beta GA gate #11) **henüz yapılmadı**. Alperen manuel adımlarda (GitHub UI rename + `git remote set-url origin https://github.com/VerhexIO/deckent.git`) execute etmeli.

### 8. Modified file envanteri (4 core diff dışı — kısa)

- **[DRIFT]** `.deckent/config.json` (+5/−5): Sprint 152 legitimate config: `last_sprint_id` 151→152, `performance.max_workers` 3→6, `balanced/api.haiku_allowed` true→false, root `max_workers` 3→6. Beklenen.
- **[REGRESSION]** `.deckent/agents/temp-react-specialist/agent.json` + `.deckent/agents/temp-react-ts-specialist/agent.json`: **stats sıfırlanmış** (temp-react-ts totalUses 32→0, successRate 1.0→0, lastUsedInSprint "sprint-151"→""). Agent manifest loader'ın başka bir agent stats reset pathway'i var — Sprint 152 agent routing audit (T-152-021) kapsamı. Burada sadece not.
- **[PASS]** `.deckent/ci-baseline.json`, `.deckent/project-stack.json`, `.deckent/provider-cache.json`: runtime-regenerated dosyalar. Beklenen drift.
- **[PASS]** `DIRECTIVES.md` (+677): Sprint 152 spec'i (bu task'ın kendisi dahil 30 task). Beklenen.
- **[PASS]** `.brain/ERRORS.md` (+538/−538): log rotation (tam rewrite, aynı satır sayısı). Runtime behavior.
- **[PASS]** `docs/audits/sprint-139/dead-code-report.md`: date header update (2026-04-22 → 2026-04-24) + importer order reshuffle. Minor drift, muhtemelen dead-code-audit script re-run output'u. Sprint 139 arşivinde şikâyet seviyesinde değil.

### 9. Deleted (D) entries — PID dosyaları

- **[PASS]** 12 D entry: `.deckent/pids/sprint-{137..142}.{pid,snapshot.json}`. Bu dosyalar `.gitignore` satır 52 (`.deckent/pids/`) ile ignore edilmiş olmasına rağmen, geçmişte commit'e girmişler (ignore öncesi) → şimdi Sprint 152 kickoff'unda `.brain/archive/sprint-{137..142}_2026-04-24T12-16-29-*.{pid,snapshot.json}` altına otomatik taşınmışlar (16 untracked archive dosyası = 6 sprint × 2 file + eski). Runtime auto-archive davranışı.
- **Sprint 153+ P2:** PID tracked-then-ignored artifact'leri tek seferlik `git rm --cached .deckent/pids/sprint-{137..142}.{pid,snapshot.json}` ile temizle + commit "chore(git): untrack deprecated PID artifacts" → working tree 12 D entry eksilir.

### 10. Untracked (??) entries — 16 satır

| Path | Beklenen? | Action |
|------|-----------|--------|
| `.brain/archive/sprint-{137..142}_2026-04-24T12-16-29-*.{pid,snapshot.json}` (12 file) | Evet (yukarıda açıklandı) | git add sonrası commit |
| `.deckent/decisions/` (60 JSON file, sprint-152 decisions) | **[DRIFT]** — `.gitignore`'da yok | **Sprint 153 P1:** `.gitignore`'a `.deckent/decisions/` ya da `.deckent/sprint-*-decisions.json` ekle |
| `.deckent/run-gate.json` | **[DRIFT]** — `.gitignore`'da yok | **Sprint 153 P2:** `.gitignore`'a ekle |
| `.deckent/sprint-152-metrics.jsonl` | **[DRIFT]** — `.gitignore`'da sadece `.deckent/metrics.jsonl` var, `sprint-*-metrics.jsonl` pattern eksik | **Sprint 153 P1:** `.gitignore`'a `.deckent/sprint-*-metrics.jsonl` ekle |
| `docs/audits/sprint-152/` | Evet (bu sprint output) | commit-able |

### 11. Yan bulgular (git dışı ama yaşam döngüsüne bağlı)

- **[DRIFT]** `.brain/ERRORS.md` içinde `resolveSkillPrompts:readSkillFile ENOENT: '/home/alperen/deckent-dev/.deckent/skills/code-reviewer/SKILL.md'` → eski sistem mutlak path'i skill resolver'da hâlâ hardcoded. Config drift, bu task kapsamı değil (T-152-024 config-duplicate audit'e ait) — sadece not.
- **[PASS]** 18 lokal `deckent-backup-sprint-*` branch'i birikiyor (047, 064, 067, ..., 152). Yedek amaçlı, sorun değil — ama Sprint 160+ cleanup ile 5'e indirilebilir.
- **[PASS]** 10 `remotes/origin/dependabot/*` branch'i aktif — güvenlik bakımı canlı.

## Sprint 153+ İçin Aksiyon Listesi

### P0 (kritik — Sprint 153 açılış ilk saat)
- **P0-1:** `.claude/rules/{auditor,brain,worker-default}.md` regresyon fix: `src/core/rule-generator.ts:297-314` içindeki `try/catch` swallow'u loglayacak hale getir ya da `better-sqlite3` binding load fail durumunda **hata fırlat** (sessiz empty-adrs fallback yerine). Kanıt: Sprint 152 PLAN fazında rich AUTO-START bloğunu yeniden üret. Effort: 1-2 saat.
- **P0-2:** `git pull --ff-only origin master` → remote'taki `8434387` commit'i yakala; sonra working tree diff'lerini review et. Effort: 10 dk.

### P1 (önemli — Sprint 153 ortası)
- **P1-1:** `.gitignore` drift fix: `.deckent/decisions/`, `.deckent/run-gate.json`, `.deckent/sprint-*-metrics.jsonl` ekle. Effort: 5 dk.
- **P1-2:** Remote URL flip: `VerhexIO/deckent-dev` → `VerhexIO/deckent` (Alperen manual step — GitHub UI rename + `git remote set-url`). Gate #11 closure. Effort: 15 dk.
- **P1-3:** `Dockerfile.worker` içinde `git config --global core.fileMode false` enforce — cross-backend 4012 fantom mode-diff gelecekte oluşmasın. Effort: 10 dk.
- **P1-4:** Temp agent stats regresyonunu T-152-021 kapsamında root-cause et (bu task'ta sadece kayıt).

### P2 (hijyenik — Sprint 153-155 arası)
- **P2-1:** `git rm --cached .deckent/pids/sprint-{137..142}.{pid,snapshot.json}` tek seferlik temizlik → 12 D entry eksilir. Effort: 5 dk.
- **P2-2:** 6 eski `git stash` (Sprint 047–139 arası WIP) review et → ya uygula ya drop et. Effort: 30 dk.
- **P2-3:** Sprint 160+ içinde 18 backup branch'i en son 5'e indir (`deckent-backup-sprint-{134,140,145,150,152}`). Effort: 20 dk.
- **P2-4:** `SYSTEM-MIGRATION-2026-04-22.md` → `docs/playbooks/` altına migrate (proje kökü temiz kalsın). Effort: 5 dk. **Note:** `.brain/archive/`'ye **taşınmamalı** (onboarding görünürlüğü).

## Kanıt Ekleri

### Komut çıktıları

```
$ git status --short | wc -l
41

$ git status --porcelain | awk '{print $1}' | sort | uniq -c
     16 ??
     12 D
     13 M

$ git rev-parse HEAD
9f80755245d607b24b3c18fb9f440a49c73c9895

$ git branch -vv | grep '^\* master'
* master                    9f80755 [origin/master: behind 1] test(orchestra): Brain Evaluator 5-in-1 ...

$ git log HEAD..origin/master --oneline
8434387 docs(claude-md): sync — sprint-151 state + nervous/monitor/connectors + gotchas

$ git config --get core.fileMode
false

$ git -c core.fileMode=true diff --raw | wc -l
4012

$ git -c core.fileMode=true diff --raw | grep -E "^:100755 100644|^:100644 100755" | wc -l
3988

$ git ls-files | wc -l
4048

$ git log --oneline -- SYSTEM-MIGRATION-2026-04-22.md
117ae31 docs(migration): system migration playbook + Sprint 152 handoff

$ stat -c "%s %y %n" SYSTEM-MIGRATION-2026-04-22.md
22824 2026-04-24 08:03:... SYSTEM-MIGRATION-2026-04-22.md

$ wc -l .claude/rules/*.md                # current working copy
  14 .claude/rules/auditor.md
  18 .claude/rules/brain.md
  16 .claude/rules/worker-default.md

$ git show HEAD:.claude/rules/auditor.md | wc -l
114                                        # committed version richer

$ git stash list | wc -l
6

$ git branch -a | grep backup | wc -l
18

$ git remote -v | head -1
origin	https://github.com/VerhexIO/deckent-dev.git (fetch)
```

### Modified file matrix

| Path | ±Lines | Category | Action |
|------|-------|----------|--------|
| `.brain/ERRORS.md` | +538/−538 | Runtime rotation | ignore (PASS) |
| `.claude/rules/auditor.md` | +1/−100 | **REGRESSION** | P0 rule-generator fix |
| `.claude/rules/brain.md` | +10/−110 | **REGRESSION** | P0 rule-generator fix |
| `.claude/rules/worker-default.md` | +2/−102 | **REGRESSION** | P0 rule-generator fix |
| `.claude/settings.local.json` | +20/−173 | DRIFT (OK) | no commit — permissions regather |
| `.deckent/agents/temp-react-specialist/agent.json` | stats reset | **REGRESSION** | T-152-021 follow-up |
| `.deckent/agents/temp-react-ts-specialist/agent.json` | stats reset | **REGRESSION** | T-152-021 follow-up |
| `.deckent/ci-baseline.json` | runtime | PASS | ignore |
| `.deckent/config.json` | +5/−5 | PASS (Sprint 152 config) | commit-able |
| `.deckent/pids/sprint-{137..142}.{pid,snapshot.json}` | deleted (12) | PASS (auto-archived) | P2 git rm --cached |
| `.deckent/project-stack.json` | runtime | PASS | ignore |
| `.deckent/provider-cache.json` | runtime | PASS | ignore |
| `DIRECTIVES.md` | +677 | PASS (Sprint 152 spec) | commit-able |
| `docs/audits/sprint-139/dead-code-report.md` | +42/−42 | Minor drift | review-commit-able |

### Untracked file matrix

| Path | Expected | Gitignore status | Action |
|------|----------|------------------|--------|
| `.brain/archive/sprint-{137..142}_*.{pid,snapshot.json}` (12) | Yes (auto-archive) | `!.brain/archive/` allow | commit-able |
| `.deckent/decisions/` (60 JSON) | New | **MISSING** | P1 .gitignore add |
| `.deckent/run-gate.json` | New | **MISSING** | P2 .gitignore add |
| `.deckent/sprint-152-metrics.jsonl` | New | **MISSING** (wildcard needed) | P1 .gitignore fix |
| `docs/audits/sprint-152/` | Yes (Sprint 152 output) | not ignored | commit-able |

## SYSTEM-MIGRATION Yaşam Döngüsü Özeti

| Aşama | Durum | Not |
|-------|-------|-----|
| Commit (`117ae31`) | ✅ | 2026-04-22, Sprint 152 handoff ile |
| Yerel silme | ✅ (reverted) | reflog'da yok → working-copy only |
| `git restore` | ✅ | 2026-04-24 08:03 mtime kanıt |
| Mevcut konum | Proje kökü | 22824 B, 597 satır |
| Disposition (öneri) | **Proje kökünde kalmalı** | Sprint 160+ `docs/playbooks/` migrate opsiyonu |
| `.brain/archive/`'ye taşı? | ❌ | Onboarding görünürlüğü kaybolur, decay hedefi |

## Acceptance Criteria Uyumu

- ✅ Rapor `docs/audits/sprint-152/T-152-025-git-hygiene.md` yazıldı
- ✅ Bulgular [PASS|FAIL|REGRESSION|DRIFT|MISSING] etiketli
- ✅ Kanıt (komut çıktıları, matris tabloları, satır numaraları) ekli
- ✅ Sprint 153+ aksiyon listesi (P0/P1/P2) mevcut
- ✅ Kod değişikliği yok (`git diff --stat src/ tests/` = boş)
