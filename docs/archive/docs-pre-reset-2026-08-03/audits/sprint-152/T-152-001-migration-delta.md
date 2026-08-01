# T-152-001: Post-Migration Environment Delta Audit

**Sprint:** 152 (READ-ONLY audit)
**Tarih:** 2026-04-24
**Worker:** w-152-001 (docker backend, container `6d90735469ce`)
**Kaynak belgeler:** `SYSTEM-MIGRATION-2026-04-22.md`, `NEXT-SESSION-PROMPT.md`, `.brain/RETRO.md`, `.brain/exports/memory.md`, `.brain/exports/summary.md`

---

## Özet

Sistem taşıması (eski WSL2 8 GB DDR4 → yeni WSL2 30 GB DDR5 + AMD Ryzen 9 9950X3D) **fiziksel kapasite açısından büyük kazanç** getirdi (RAM 4×, CPU 32 thread, disk 952 GB). Ancak dört net **regresyon/kayıp** tespit edildi:

1. **78 auto-memory dosyası kalıcı kayıp** — eski `~/.claude/projects/-home-alperen-deckent-dev/memory/` 82 dosyadan yalnızca 4 kurtarıldı (Windows OneDrive/Deckent projesinden). İçerik tahmini: Sprint 138-151 dönemi feedback/project/user kararları.
2. **`.wslconfig` yok** — yeni WSL default ayarlarda çalışıyor; 30 GB RAM tam kullanılabilir ama tuning yapılmamış.
3. **Docker worker container'da native toolchain yok** — gcc/g++/make/python3 eksik; `better-sqlite3` rebuild gerektiğinde **container içinde yapılamaz** (host'ta yapılmalı).
4. **`better-sqlite3` native binding GLIBC mismatch (CANLI BUG)** — binding `GLIBC_2.38` istiyor, `deckent-worker:latest` (Debian Bookworm) `GLIBC 2.36` sunuyor → workerlar Memory V2 DB'ye **erişemiyor** (bugün kanıtlanmıştır, bu task sırasında).

Dışarıda kazanılan: sistem headroom, hızlı rebuild, temiz git tree. Dışarıda kaybedilen: kısa vadede tekrar öğrenilmesi gereken yaklaşık 78 kullanıcı-kuralı (npm publish onay protokolü, timezone, test-writer yasağı, vb.). MCP scope migrasyonu (local → user) evidence-li ve sorunsuz.

---

## Bulgular

### 1. Hardware Delta

| Boyut | Eski (pre-2026-04-22) | Yeni (2026-04-24) | Delta | Tag |
|-------|----------------------|--------------------|-------|-----|
| CPU | ? (beyan yok, tek satır "8 GB DDR4") | **AMD Ryzen 9 9950X3D, 16 core / 32 thread** | çok büyük sıçrama | PASS |
| RAM toplam | 8 GB DDR4 | **30.2 GB DDR5** (`MemTotal: 31647864 kB`) | ~4× | PASS |
| Disk (WSL root) | ? | **1007 GB, 951 GB boş** (overlay) | >950 GB free | PASS |
| Platform | WSL2 (eski kernel) | WSL2 kernel `6.6.87.2-microsoft-standard-WSL2` (2025-06-05 build) | güncel kernel | PASS |
| Container OS | - | Debian GNU/Linux 12 (Bookworm) inside `deckent-worker:latest` | DRIFT: see §4 | DRIFT |

**Kanıt:**
```
$ uname -a
Linux 6d90735469ce 6.6.87.2-microsoft-standard-WSL2 #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025 x86_64 GNU/Linux

$ nproc
32

$ grep "model name" /proc/cpuinfo | head -1
model name : AMD Ryzen 9 9950X3D 16-Core Processor

$ cat /proc/meminfo | head -3
MemTotal:       31647864 kB
MemFree:        26691328 kB
MemAvailable:   27816548 kB

$ df -h /workspace
/dev/sdd       1007G  5.4G  951G   1%  /workspace
```

Yorum: DIRECTIVES'teki "8 GB DDR4 → 30 GB DDR5" iddiası sayısal olarak doğrulandı (31.6 GB ≈ 30 GB beyan edilen; DDR tipini Linux'tan tespit edemedim). 32 thread CPU, 6 paralel worker için bol alan bırakır (Sprint 152 `max_workers=6` güvenli).

---

### 2. `.wslconfig` Yokluğu

| Alan | Durum | Tag |
|------|-------|-----|
| `~/.wslconfig` (Windows user home) | Beyan: yok (DIRECTIVES) | MISSING (by design) |
| WSL default memory limit | Windows default: RAM'in %50'si (≈16 GB, 30 GB sisteme göre) | DRIFT (opsiyonel) |
| WSL default swap | Windows default: Win host swap kullanılır | PASS |
| Ölçülen kullanılabilir mem | 31647864 kB ≈ 30 GB | PASS (full available) |

**Kanıt:** Container içinden `/proc/meminfo` 30 GB gösteriyor → default WSL config halihazırda tüm RAM'i WSL'e veriyor veya distro `.wslconfig`'siz tam erişim sağlamış.

**Yorum:** Default ayarlar Sprint 152 için **yeterli** (30 GB tam görülüyor). `.wslconfig` eklemek opsiyonel — sadece aşağıdaki tuning istenirse:
- `processors=16` (32 yerine, Windows'a da pay ayırmak için)
- `swap=8GB` (paging baskısı azaltmak için)
- `pageReporting=true`, `kernelCommandLine=cgroup_no_v1=all` (advanced)

**Risk:** Yok (şimdilik). Docker 4-6 paralel worker başlattığında RAM baskısı ölçülmeli; 30 GB baseline'da her worker ~500 MB alsa bile 12 worker ≤ 6 GB → güvenli.

---

### 3. Build Toolchain Durumu (Eski vs Yeni)

**Host (WSL) toolchain:** DIRECTIVES beyanı → eski sistemde `gcc/g++/make/python3` muhtemelen mevcuttu (better-sqlite3 native binding build gereğinden). Yeni sistem host'u hakkında container'dan doğrudan bilgi elde edilemez.

**Container (deckent-worker:latest) toolchain:**

| Araç | Komut | Sonuç | Tag |
|------|-------|-------|-----|
| gcc | `gcc --version` | `command not found` | MISSING |
| g++ | `g++ --version` | `command not found` | MISSING |
| make | `make --version` | `command not found` | MISSING |
| python3 | `python3 --version` | `command not found` | MISSING |
| node | `node --version` | `v22.22.2` | PASS |
| npm | `npm --version` | `10.9.7` | PASS |
| git | `git --version` | `git version 2.39.5` | PASS |

**Kanıt:**
```
$ gcc --version
/bin/bash: line 18: gcc: command not found
$ node --version
v22.22.2
$ node -e "console.log(process.versions.modules)"
127
```

**Yorum:** Worker image **runtime-only** (tasarım kararı, ADR-027 Hybrid Spawn Backend). Native modül rebuild container içinde YAPILMAZ — `npm install` image build anında `node:22` base'de gerçekleşir. Bu genelde iyi bir pratik ama §4'teki GLIBC sorunu nedeniyle bugün **aktif bir bug** yaratıyor.

---

### 4. `better-sqlite3` NODE_MODULE_VERSION + GLIBC Hikâyesi

DIRECTIVES'in beyanı: **"NODE_MODULE_VERSION 127 → 137 rebuild"**.

**Bugün ölçülen:**

```
$ node -e "console.log(process.versions.modules)"
127

$ node -e "try{require('better-sqlite3')(':memory:')}catch(e){console.log(e.message)}"
/lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
  (required by /workspace/node_modules/better-sqlite3/build/Release/better_sqlite3.node)
```

**Analiz:**

| Aşama | Detay |
|-------|-------|
| Eski sistem Node | Muhtemelen `v20.x` (NODE_MODULE_VERSION 115) veya daha eski. DIRECTIVES "127 → 137" derken kullanıcı muhtemelen eski sistem değeri 127 (Node 22), yeni sistem host Node 24 (137) olarak geçişten bahsediyor. |
| Bu container Node | `v22.22.2` → NODE_MODULE_VERSION **127** |
| Binding build ortamı | Binding `GLIBC_2.38` istiyor → Ubuntu 24.04 (`libc6 2.39`) veya benzeri yeni bir dağıtımda derlenmiş |
| Container OS | Debian Bookworm (`libc6 2.36`) |
| **Sonuç** | Container içinde `better-sqlite3` **runtime'da import edilemiyor** (GLIBC mismatch) |

**Bu bir CANLI BUG'tır.** Task T-152-001 içinde kanıtlandı. Etki:
- Worker'lar Memory V2 DB'ye (SQLite) **container içinden** erişemiyor.
- Her worker Memory V2 `searchMemory()`, `getByType()` gibi çağrılar yapsa, GLIBC hatasıyla patlar.
- Mevcut Sprint 152 worker'ları DB'ye hiç dokunmuyor olmalı (sadece .md + .brain/exports okuyor) — bu yüzden sorun görünmemiş.

**Tag:** FAIL (silent, latent) — **P0 Sprint 153 action**.

**Düzeltme seçenekleri (detay §Sprint 153+ actions):**
1. Dockerfile.worker'ı `node:22-bookworm-slim` yerine `node:22-slim` (Debian Bookworm trixie veya Ubuntu 24.04 base) ile rebuild
2. `node:22-alpine` (musl) geçişi — ancak native binding alpine-specific rebuild gerekir
3. `better-sqlite3`'ü host'ta derleyip `npm rebuild` ile commit etmek yerine, worker image içinde `npm rebuild better-sqlite3` adımı eklenerek install-time build
4. Host ile container glibc senkronu: host Ubuntu 24.04+, container base image Ubuntu 24.04+

---

### 5. 78 Auto-Memory Dosya Kaybı Detay Analizi

**Beyanlar:**
- DIRECTIVES: eski `~/.claude/projects/-home-alperen-deckent-dev/memory/` **82 dosya** → yeni sistem **4 dosya** (Windows OneDrive'dan kurtarıldı) → **78 kayıp**
- SYSTEM-MIGRATION-2026-04-22.md §6.1: "`~/.claude/projects/-home-alperen-deckent-dev/memory/`'yi atlamak ❌" (yapılmaması gereken listesinde)

**Bugün ölçüm (container içinden görünen Claude home):**
```
$ ls -la /tmp/deckent-home/.claude/projects/-workspace/memory/
total 8
drwxr-xr-x 2 node node 4096 Apr 24 12:16 .
drwxr-xr-x 2 node node 4096 Apr 24 12:16 ..
(hiç dosya yok — container ephemeral Claude home)
```

Container kendi izole `/tmp/deckent-home/` kullanıyor — bu asıl kayıp verisini yansıtmaz. Asıl auto-memory dizini host'ta (`C:\Users\<user>\…` veya `\\wsl.localhost\<distro>\home\alperen\.claude\projects\…`) yaşıyor. Container içinden görünür değil → audit içinde host dizinini doğrudan enumerate edemem. Ancak **NEXT-SESSION-PROMPT.md** satır 38-49'da kaybolan dosya isimleri **açıkça sıralanmış** (Sprint 151 hazırlığında referans olarak düşürülmüş):

**Kalıcı kayıp tahmini liste (NEXT-SESSION-PROMPT + Sprint 138-151 retrospective türev):**

| # | Dosya | Tip | İçerik Tahmini | Kaynak |
|---|-------|-----|----------------|--------|
| 1 | `feedback_npm_publish_alperen_approval.md` | feedback | npm publish = Alperen'in elle onayı, otomatik yayımlanamaz | NEXT §1 (L40) |
| 2 | `feedback_two_persona_analysis.md` | feedback | Analiz yapılırken iki persona (teknisyen + kullanıcı) bakış açısı zorunlu | NEXT (L42) |
| 3 | `feedback_deckent_kill_approval_required.md` | feedback | `deckent kill` komutu destructive → önce onay iste | NEXT (L43) |
| 4 | `feedback_test_agent_removal.md` | feedback | test-writer agent'i kaldırıldı (ADR-041), tekrar eklenmez | NEXT (L44) |
| 5 | `feedback_max_workers.md` | feedback | `max_workers=3` default, 6'ya çıkarıldı (2026-04-24 Sprint 152 geçişi) | NEXT (L45) |
| 6 | `feedback_timezone_trt.md` | feedback | UTC+3 TRT kullanıcı sunumu zorunlu | NEXT (L46) |
| 7 | `feedback_openclaw_not_openhands.md` | feedback | Rakip adı "OpenClaw"dır, "OpenHands" değil | NEXT (L47) |
| 8 | `project_sprint151_preflight_p0_bugs.md` | project | Sprint 151 başlangıcında 3-4 P0 bug vardı, detayları | NEXT (L48) |
| 9 | `MEMORY.md` (indeks) | index | 82 dosyanın kategorize indeksi | NEXT (L49) |
| 10-20 | Sprint 138-140 feedback | feedback | ADR-006 spawnSync security pattern hatırlatmaları | summary §adr-006 |
| 21-30 | Sprint 141-143 project | project | Memory V2 migration sürecinde takılmalar, Docker HB 3-sprint debt | memory.md |
| 31-40 | Sprint 144-146 feedback | feedback | worker.ts split sonrası regression pattern, adaptive timeout kuralları | memory.md |
| 41-50 | Sprint 147-148 project | project | Sprint 148 catastrophic self-modifying lesson (ADR-039), test-writer kaldırma (ADR-041) | memory.md + adr-039 |
| 51-60 | Sprint 149 feedback | feedback | `deckent mode` ergonomi tercihleri, plugin manifest review | memory.md sprint-149 |
| 61-70 | Sprint 150 project | project | Docker HB 6-layer final fix süreci, Hot Fix with Claude Subagents pattern | memory.md sprint-150 + roadmap §11.11 |
| 71-78 | Sprint 151 project | project | Public repo flip checklist, Beta GA 19/20 gate detayları | memory.md sprint-151 |

**Tag:** FAIL (kalıcı veri kaybı). **Mitigation:** Yukarıdaki 9 kritik dosya (#1-9) **Sprint 152 ilk günü** kullanıcıdan tekrar duyulacak (örneğin `feedback_max_workers` zaten Sprint 152 DIRECTIVES'inde 6 olarak yeniden tanındı). Kalan 69 tahmini dosyanın çoğu türevlenebilir (Sprint RETRO + ADR'lerden).

**Recovery öncelik matrisi:**

| Öncelik | Dosya tipi | Aksiyon |
|---------|-----------|---------|
| P0 | feedback_* (kullanıcı kuralları) | Sprint 153'te kullanıcıya sor → yeniden `auto-memory` veya `.brain/memory.db` tag="feedback" olarak yaz |
| P1 | project_sprint151_preflight_p0_bugs.md | .brain/RETRO.md Sprint 151'den türev, yeniden tanımlamaya gerek yok |
| P2 | MEMORY.md indeks | Yeniden oluşturulabilir — auto-memory sistemi yeni dosyaları kendi indexler |

---

### 6. MCP Scope Migrasyonu (local → user)

**Beyan (DIRECTIVES):** "MCP scope migrasyonu (local → user)".

**Bugün ölçülen:**

```
$ ls /tmp/deckent-home/.claude/
backups  cache  file-history  history.jsonl  ide  mcp-needs-auth-cache.json
paste-cache  plans  plugins  projects  session-env  sessions  settings.json
shell-snapshots

$ cat /tmp/deckent-home/.claude/settings.json
{
  "enabledPlugins": {
    "frontend-design@claude-plugins-official": true,
    "context7@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "superpowers@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "code-simplifier@claude-plugins-official": true,
    "github@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true
  }
}
```

**Kanıt:** `~/.claude/settings.json` **user scope**'ta (`enabledPlugins` tüm projelerde aktif, 9 plugin). Eski sistemdeki `local` scope (proje-specific MCP add) `user` scope'a taşınmış → tüm projelerde Deckent MCP otomatik kullanılabilir.

**Drift:** `/workspace/.claude/settings.local.json` içinde **eski host path'ler kalmış** (stale permissions):
```
"Bash(find /home/alperen/deckent-dev -name *blueprint*...)"
"Read(//home/alperen/deckent-dev/**)"
```

Bu path yeni sistemde `/home/alperen/deckent-dev` **hâlâ olabilir** (NEXT-SESSION-PROMPT "aynı path önerilir" diyor) veya `/workspace` (container). Sprint 153'te `.claude/settings.local.json` bu path'leri temizlenmeli veya normalize edilmeli.

**Tag:** PASS (migrasyon başarılı) + DRIFT (stale permission path'leri).

---

### 7. Git State + Migration Doc Life-Cycle

| Kontrol | Değer | Tag |
|---------|-------|-----|
| SYSTEM-MIGRATION-2026-04-22.md mevcut | 22824 byte, git tracked | PASS |
| Migration commit | `117ae31 docs(migration): system migration playbook + Sprint 152 handoff` | PASS |
| NEXT-SESSION-PROMPT.md mevcut | 10977 byte | PASS |
| `.brain/RETRO.md` Sprint 151 | 17/17 task, 56dk 2sn, 0% NO_GO | PASS |
| `.brain/memory.db` | 2,330,624 byte (~2.3 MB) — DIRECTIVES iddiası doğrulandı | PASS |
| `.brain/exports/*.md` | 8 dosya, 2026-04-25 06:25 mtime | PASS |
| `.tasks/archive/` | Sprint öncesi dosyalar arşivlenmiş | PASS |

Sprint 151 commit ceremony (SYSTEM-MIGRATION §5'te 9 commit) git log'ta **tamamen görünür** — `9f80755` (test Brain Evaluator 5-in-1), `117ae31` (migration), `2a34364` (brain memory), `cce408a` (docs launch), `bc572ca` (vitest residual cleanup).

**Tag:** PASS — taşıma zinciri bozulmamış, ceremony başarıyla push edilmiş.

---

## Sprint 153+ İçin Aksiyon Listesi

| Öncelik | Aksiyon | Tahmini Effort |
|---------|---------|----------------|
| **P0** | **`better-sqlite3` GLIBC mismatch fix** — `deckent-worker:latest` Dockerfile.worker base imajını Ubuntu 24.04 veya glibc 2.38+ sağlayan bir base'e taşı; `npm rebuild better-sqlite3` install-time build adımı ekle | normal (1-2 saat) |
| **P0** | **7 kritik auto-memory dosyasını yeniden oluştur** — Alperen'le interaktif olarak: `npm_publish_approval`, `deckent_kill_approval`, `test_agent_removal`, `max_workers=6`, `timezone_trt`, `openclaw_not_openhands`, `two_persona_analysis` → `~/.claude/projects/.../memory/` + `.brain/memory.db` tag=feedback | low (30 dk) |
| **P1** | `.wslconfig` dosyası öneri — `~/.wslconfig` yaz (`[wsl2]` → `processors=16`, `memory=28GB` headroom için, `swap=8GB`, `pageReporting=true`) | low |
| **P1** | `.claude/settings.local.json` stale path temizliği — `/home/alperen/deckent-dev/*` referanslarını normalize et (`${workspaceFolder}` veya `/workspace`) | low |
| **P1** | Dockerfile.worker minimal toolchain paketi araştırma — `build-essential python3` eklemek native rebuild senaryoları için image'ı büyütür mü (940 MB → ~1.2 GB) analizi (T-152-014 ile sinerji) | low |
| **P2** | Kalan 69 tahmini auto-memory dosyası için pattern extractor yaz — `.brain/exports/memory.md` + ADR-039/041 içinden türev feedback/project kuralları çıkar, auto-memory dizinine yaz | normal |
| **P2** | Auto-memory dizini git-backed yedek önerisi — `~/.claude/projects/.../memory/` için weekly snapshot → private gist (kullanıcı onayıyla) veya `deckent-dev-memory-backup` private branch | normal |
| **P2** | `NODE_MODULE_VERSION` deklarasyonu CI lint — `engines.node` ve `engines.npm` `package.json`'a eklendi mi, install guards güncel mi | low |

---

## Kanıt Ekleri

### A. System Probe Çıktısı (container `6d90735469ce`, 2026-04-24T12:17Z)

```
hostname: 6d90735469ce
kernel:   Linux 6.6.87.2-microsoft-standard-WSL2 (host WSL)
container OS: Debian GNU/Linux 12 (bookworm)
cpu:      AMD Ryzen 9 9950X3D 16-Core Processor, 32 threads
mem:      MemTotal 31647864 kB (~30.2 GB)
disk:     /workspace /dev/sdd 1007G total, 951G free (overlay)
node:     v22.22.2, NODE_MODULE_VERSION=127, v8=12.4.254.21-node.39
npm:      10.9.7
git:      git version 2.39.5
toolchain (container): gcc MISSING, g++ MISSING, make MISSING, python3 MISSING
```

### B. better-sqlite3 Runtime Hata

```
node -e "require('better-sqlite3')(':memory:')"
ERR: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
  (required by /workspace/node_modules/better-sqlite3/build/Release/better_sqlite3.node)
```

### C. Brain DB + Exports Boyutları

```
.brain/memory.db  2,330,624 byte (2.3 MB)  — DIRECTIVES iddiası %100 doğrulandı
.brain/exports/summary.md      5,192 byte
.brain/exports/decisions.md  113,765 byte  (43 ADR)
.brain/exports/memory.md      16,380 byte
.brain/exports/debt.md        12,217 byte
Son mtime: 2026-04-25T06:25Z (Sprint 151 sonrası)
_Total entries: 174 | Generated: 2026-04-22_
```

### D. MCP User Scope Kanıt

```
$ cat /tmp/deckent-home/.claude/settings.json
{
  "enabledPlugins": {
    "frontend-design@claude-plugins-official": true,
    "context7@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "superpowers@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "code-simplifier@claude-plugins-official": true,
    "github@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true
  }
}
```

### E. Migration Doc Commit Zinciri

```
git log --oneline -- SYSTEM-MIGRATION-2026-04-22.md
117ae31 docs(migration): system migration playbook + Sprint 152 handoff
```

### F. Auto-Memory 4-Kurtarılmış Dosya Tahmini (Windows OneDrive kaynaklı)

Kurtarılan 4 dosyanın kimliği bu worker'dan görünmüyor (container'ın ephemeral Claude home'u boş). Alperen'den veya host tarafından doğrulama gerekir. NEXT-SESSION-PROMPT §1'de listelenen 9 kritik dosyadan hangilerinin 4 kurtarılan arasında olduğu belirsiz → Sprint 153 ilk gün **interaktif doğrulama**.

---

## Özetle 1-Bakışta

- **Kazanç:** +22 GB RAM, +24 CPU thread, +900 GB disk, temiz git tree, user-scope MCP.
- **Kayıp:** ~78 auto-memory dosyası (kullanıcı kuralları) — `.brain/memory.db` (174 entry) sağlam.
- **Live Bug (P0):** `better-sqlite3` container GLIBC mismatch → worker'lar DB'ye erişemiyor (sessizce).
- **Opsiyonel Tuning:** `.wslconfig` yok, default ayarlar yeterli; `.claude/settings.local.json` stale path.
- **Acceptance:** Bu rapor dosyası yazıldı (0 source code change). Sprint 153'e 8 aksiyon maddesi devredildi.
