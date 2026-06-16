# `docs/guide/` Audit — Kullanıcı Kılavuzları — 2026-05-22

**Kapsam:** `docs/guide/` altındaki 14 kullanıcı kılavuzu (4.474 satır) — doğruluk, güncellik, kod-gerçeğiyle tutarlılık, guide-içi çapraz tutarlılık
**Metodoloji:** Sistematik debugging — her doc iddiası kod/dosya gerçeğine karşı `grep` + dosya kontrolü ile doğrulandı
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı (OSS okuyucu — `docs/guide/` ilk temas noktası)

---

## Genel Tablo

| Doküman | Satır | Durum | Özet |
|---------|-------|-------|------|
| `nervous-system.md` | 325 | ✅ **Sağlam** | 12 detector ✓, Faz 1 ✓, ADR-040 ✓; tek kırık link (sprint-180 plan dosyası) |
| `workers.md` | 441 | ✅ **Sağlam** | Canonical konsolidasyon, ADR-037 V1.0 doğru; tek nokta: 15dk CRITICAL lock kademesi kodda yok |
| `installation.md` | 157 | 🟡 **Hafif stale** | Node 24 ✓; ama `docker build -f Dockerfile` **yanlış Dockerfile** (worker imajı `Dockerfile.worker`) |
| `getting-started.md` | 228 | 🟡 **Hafif stale** | Akış doğru; `.brain/MEMORY.md`/`DEBT.md` legacy yol, Memory V2 yok, "46+ komut" |
| `first-sprint.md` | 257 | 🟡 **Hafif stale** | `deckent config --show` hayalet flag, `.brain/RETRO.md`/`DEBT.md` legacy yol, tmux-merkezli |
| `config-recovery.md` | 137 | 🟡 **Hafif stale** | `regenerateConfigSafe` ✓ doğrulandı; `deckent config read` hayalet subcommand, import yolu tutarsız |
| `terminal.md` | 207 | 🟡 **Hafif stale** | Detaylı + güncel; port **3000 yanlış** (gerçek 3100) |
| `terminal-tr.md` | 207 | 🟡 **Hafif stale** | `terminal.md` TR aynası; aynı port 3000 hatası |
| `concepts.md` | 246 | 🟡 **Orta stale** | Bellek tablosu yanlış (600 vs 1500), `DECISIONS/PATTERNS` `.brain/` (V2), PROJECT-IDENTITY "kalıcı" stale, skill bölümü pre-V1 |
| `quickstart.md` | 366 | 🟡 **Orta stale** | "tmux varsayılan backend" **yanlış** (docker default), init wizard tier etiketleri yanlış, legacy bellek yolları |
| `troubleshooting.md` | 85 | 🟡 **Orta stale** | İçerik Sprint 177 koduna doğru; ama "Sprint 178'de tmux kaldırılacak" zaman çizelgesi geçti ve **gerçekleşmedi** |
| `docker-backend.md` | 375 | ✅ **düzeltildi** | 3 sorun da giderildi (2026-05-22): read-only mount iddiası → `rw` + ADR-037 advisory, "Node.js 22"→24, §1 backend tablosu "tmux Default"→"docker Default" |
| `faq.md` | 555 | 🔴 **Ağır stale** | "Last Updated: Sprint 065"; "tmux required" yanlış premis, yanlış model isimleri, yanlış worker/tool sayıları, yanlış GitHub org |
| `deckent-nedir.md` | 888 | 🔴 **Ağır stale** | "Sprint 099" donmuş (~87 sprint); 34 komut/19 MCP/9 agent/11 skill/4 sayfa — hepsi defunct |

**Özet:** 2 sağlam · 9 hafif/orta stale · 2 ağır stale · 1 kritik içerik hatası → **audit sonrası düzeltildi** (`docker-backend.md`).

---

## Kesişen Sorun #1 — Memory V2 tüm "kavram" kılavuzlarında yok

`getting-started.md`, `quickstart.md`, `first-sprint.md`, `concepts.md`, `deckent-nedir.md` — beşi de belleği **pre-V2** mimariyle anlatıyor:

- Proje yapısı diyagramlarında `.brain/MEMORY.md` + `.brain/DEBT.md` canonical gösteriliyor
- `cat .brain/MEMORY.md`, `cat .brain/DEBT.md`, `cat .brain/RETRO.md` komutları öneriliyor
- `memory.db`, `.brain/exports/`, `deckent recall`, `deckent remember`, `deckent memory`, `deckent_memory_query` MCP, FTS5 dual-layer search — **hiçbiri hiçbir kılavuzda geçmiyor**

**Kök Neden:** Bu kılavuzlar Memory V2 DB-first geçişinden (DECKENT.md "Memory V2") önce yazıldı, güncellenmedi.

**Nüans (incomplete migration kesişimi):** `.brain/` diski kontrol edildi — `MEMORY.md`, `DEBT.md`, `PATTERNS.md`, `RETRO.md`, `PROJECT-IDENTITY.md` **fiziksel olarak hâlâ duruyor** (`memory.db` 5.7MB + `exports/` ile yan yana). Yani legacy `.md` yazıcıları kaldırılmadı — bu, bilinen GA-blocking borç [[brain-memory-v2-migration-incomplete]]. Sonuç: kılavuzların gösterdiği yollar "kırık" değil (dosya var) ama **mimari olarak yanıltıcı** — kullanıcı `.md` dosyasını tek kaynak sanır, asıl kaynak `memory.db`'dir, `.md`'ler generated export. Bir OSS kullanıcısı bu kılavuzlardan `deckent recall`'ı asla öğrenemez.

---

## Kesişen Sorun #2 — `deckent config read` hayalet subcommand

`src/cli/commands/config.ts` gerçek subcommand'ları: bare `config` (`--raw` flag'li), `set <key> <value>`, `get <key>`, `export [file]`, `import <file>`, `list`, `keys`, `migrate`. **`read` subcommand'ı yok.**

| Dosya | Yanlış kullanım |
|-------|-----------------|
| `config-recovery.md` | `deckent config read` — satır 70, 79, 98 (×3) |
| `docker-backend.md` | `deckent config read \| grep spawn_backend` — satır 130, 132 |
| `troubleshooting.md` | `deckent config read` — satır 19, 22, 76 |
| `first-sprint.md` | `deckent config --show` — satır 215 (bu da hayalet flag) |

Doğru: durum görüntüleme için bare `deckent config` (veya `deckent config --raw`); tek değer için `deckent config get <key>`.

---

## Kesişen Sorun #3 — "tmux varsayılan backend" miti vs guide-içi çelişki

Gerçek: `spawn_backend` default `'docker'` (`config.ts:684` + `REGEN_TEMPLATE_DEFAULTS` `config.ts:1181`). `resolveBackend()` `'auto' → 'docker'` (`spawn-backend.ts:245`, Sprint 177).

- `quickstart.md:28` — "**tmux** is the default backend for spawning workers" ❌
- `docker-backend.md:23-27` tablo — `tmux` satırı **Default: Yes** ❌
- `faq.md` §3 — "Why is tmux **required**?" — yanlış premis, tüm bölüm bu varsayım üzerine ❌
- `troubleshooting.md` — `auto → docker`, tmux deprecated diyor ✅ **doğru**

Yani `docs/guide/` kendi içinde çelişiyor: bir kılavuz tmux'u varsayılan/zorunlu anlatırken diğeri deprecated diyor.

---

## Kesişen Sorun #4 — Link konvansiyonu + sayısal ground-truth karmaşası

- **Link stilleri karışık:** `getting-started.md`/`concepts.md`/`first-sprint.md` VitePress-absolute (`/reference/config`, `/guide/concepts`) — GitHub raw görünümde kırık. `quickstart.md`/`installation.md`/`faq.md` relative (`../reference/x.md`) — çalışıyor. Tek repo, iki konvansiyon.
- **CLI komut sayısı:** kılavuzlar "34+" (deckent-nedir), "46+" (getting-started); IDENTITY.md "55+"; gerçek `src/cli/commands/*.ts` = 56 dosya. Projenin kendi ground-truth'u bile tutarsız.
- **MCP tool sayısı:** `faq.md` "16 tools / 9 resources", `deckent-nedir.md` "19 tool / 5 resource"; gerçek **31 tool / 8 resource** (DECKENT.md).

---

## Tespit Edilen Sorunlar (doküman bazında)

### docker-backend.md — 🔴 Merkezî güvenlik iddiası kod-gerçeğiyle çelişiyor

**Kök Neden:** Doküman, worker imajı bir zamanlar `node:22` iken yazıldı ve "read-only mount" tasarımı sonradan `rw`'ye değişti — doküman güncellenmedi.

- **Read-only mount iddiası YANLIŞ.** `spawn-backend-docker.ts:387` kod yorumu birebir: `// Project mounted read-write — workers need to create/edit files in scope`. Satır 388 `-v ${dir}:${CONTAINER_WORKSPACE}` — **`:ro` eki yok**. Aynı şekilde `.claude` (satır 394, yorum: "rw: session-env must be writable") ve `.claude.json` (satır 397) de `:ro`'suz. **4 mount'un dördü de `rw`.** Doküman ise §1 "the project is mounted read-only", §1 "workers cannot... corrupt the project directory", §5.1 tablo (proje `/workspace` mode `ro`), §5.2 (".claude ro", ".credentials.json ro") — hepsi yanlış. Bu, kullanıcının var olmayan bir filesystem korumasına güvenmesine yol açar — **OSS güvenlik dokümantasyonu açısından en ağır bulgu.**
- **"Node.js 22 (slim base)"** (§3, satır 95) — gerçek `Dockerfile.worker:9` = `FROM node:24-trixie-slim`.
- Geri kalan yapı (volume lifecycle, non-root UID/GID, `deckent-w-<taskId>` isimlendirme, `docker_timeout` default 1200s ✓) doğru.

**Durum:** ✅ **3 sorunun 3'ü de düzeltildi** (2026-05-22): (1) read-only mount iddiası §1/§5.1/§5.2/§2.2'de `rw`'ye + "process/namespace izolasyonu, scope advisory (ADR-037 V1.0)" anlatımına hizalandı, `~/.claude` rw mount'u için güvenlik notu eklendi; (2) "Node.js 22 (slim)" → "Node.js 24 (trixie-slim)"; (3) §1 backend tablosu `Default` sütunu gerçeğe çekildi — `docker` = Default (`auto`→docker, Sprint 177), `subprocess` = Windows fallback, `tmux` = Deprecated. **Karar:** kod değiştirilmedi (`:ro` eklenmedi); doküman gerçeğe hizalandı.

---

### deckent-nedir.md — 🔴 Sprint 099'da donmuş (~87 sprint stale)

**Kök Neden:** Başlıkta "Son güncelleme: 2026-04-06 (Sprint 099)". Mevcut sprint 186. Hiç güncellenmemiş tam-durum snapshot'ı.

- **34+ komut / 19 MCP tool / 5 resource** → gerçek 56 komut dosyası / 31 tool / 8 resource
- **9 yerleşik agent** (`test-writer` dahil) → gerçek **15**; `test-writer` ADR-041 ile kaldırıldı
- **11 yerleşik skill** → gerçek **21**
- **8 model** ("Sprint 038") → gerçek **13** (model-registry.ts, 3 provider)
- **4 web dashboard sayfası** → gerçek **7**
- **8.555 test** → IDENTITY.md "16.697 descriptors"
- **Brain `brain.ts` 975 satır, "tek orchestrator"** → `sprint-controller.ts` split olmuş; `brain.ts` re-export katmanı
- Bellek bölümü tümüyle pre-V2; "Decision Engine 6-adım / decision-logger" → V2 routing (ADR-028) ile deprecated

**Durum:** Belgelendi — neredeyse her sayısal/yapısal iddia defunct. Yeniden yazım veya silme/redirect gerekiyor (öneri #2).

---

### faq.md — 🔴 Sprint 065'te donmuş + yanlış teknik iddialar

**Kök Neden:** "Last Updated: Sprint 065". ~120 sprint stale.

- **Q2 worker sayıları:** "Pro = 2 worker" ❌ — `mode-presets.ts` economic (Pro eşleniği) = **3**. (`quickstart.md` "Pro up to 3" ✓ — guide-içi çelişki.)
- **Q3 "Why is tmux required":** tmux zorunlu değil — Kesişen Sorun #3.
- **Q4 MCP:** "16 tools / 9 resources" → 31 / 8.
- **Q9 Codex modelleri:** "gpt-4.1, **gpt-4o**, **gpt-4o-mini**" — `gpt-4o`/`gpt-4o-mini` registry'de **yok**. Gerçek Codex: `o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini`.
- **Q10 fallback haritası:** "sonnet→gpt-4o", "haiku→gpt-4o-mini", "haiku→**gemini-2.0-flash-lite**" — `gemini-2.0-flash-lite` registry'de yok; tier eşlemesi DECKENT.md ile uyumsuz.
- **GitHub org yanlış:** `github.com/anthropics/deckent/discussions` (satır 555) — gerçek `VerhexIO/deckent` (`package.json:59`). `docker-backend.md` doğru org'u kullanıyor.
- CI örneği `node-version: "22"` — gerçek ≥24.

**Durum:** Belgelendi — yeniden yazım gerekiyor (öneri #2).

---

### concepts.md — 🟡 Bellek + skill bölümleri stale

- **Bellek tablosu:** `MEMORY.md` "600 satır" → gerçek `MEMORY_MAX_LINES = 1500` (`constants.ts:67`); `RETRO.md` "100" → `RETRO_MAX_LINES = 400`; `PATTERNS.md` budget'tan hariç gösteriliyor → `PATTERNS_MAX_LINES = 800`.
- **`DECISIONS.md` / `PATTERNS.md` `.brain/` kökünde** gösteriliyor — V2'de `exports/decisions.md`; ADR'ler `memory.db`'de.
- **PROJECT-IDENTITY.md "kalıcı, asla decay olmaz":** Sprint 166'da `.deckent/workspace/IDENTITY.md` ile supersede edildi (`identity-generator.ts:93` yorumu + `api-surface.md`). Dosya diskte hâlâ var ama canonical değil.
- **"Skill" bölümü** skill'leri yalnız `design/testing/docs/default` olarak anlatıyor — bu `skill_routing` config kovaları (`config-types.ts:160` ✓ doğru), ama 21-skill registry (`typescript-expert` vb.) ile karıştırılmış.
- Sprint lifecycle numaralı listesi 6 madde (FIX + CLEANUP atlanmış) oysa üstteki diyagram 8 faz.

**Durum:** Belgelendi — bellek tablosu + skill bölümü güncellenmeli (öneri #3).

---

### quickstart.md — 🟡 tmux-merkezli + wizard etiketleri yanlış

- "tmux is the default backend" — Kesişen Sorun #3.
- **init wizard tier etiketleri:** Doküman "Max 20x ($200/mo)", "Max 5x ($100/mo)", "Pro ($20/mo)", "API" gösteriyor. Gerçek wizard (`init.ts:178-181`): "Performance — 8 workers", "Balanced — 5 workers", "Economic — 3 workers", "API (pay-as-you-go) — 10 workers". Abonelik-tier etiketleri değil, preset isimleri.
- "Spawn one Claude worker per task in separate tmux windows" + `tmux attach -t deckent` — docker default ile tmux window yok.
- `.brain/MEMORY.md`/`DEBT.md` legacy yollar — Kesişen Sorun #1.

**Durum:** Belgelendi (öneri #3).

---

### troubleshooting.md — 🟡 Doğru ama zaman çizelgesi geçti

İçerik Sprint 177 koduna **doğru** (deprecation warning metni `spawn-backend.ts:263` ile birebir, `auto→docker` ✓). Ama:

- Başlık "tmux backend will be removed in **Sprint 178**" + tablo "178: tmux backend code removed". **Sprint 178 geçti, şu an 186; `tmux.ts` + `TmuxBackend` (`spawn-backend.ts:121`) hâlâ duruyor.** Kaldırma gerçekleşmedi — hem doküman hem kod yorumu (`spawn-backend.ts:247`) bu konuda stale.
- `deckent config read` — Kesişen Sorun #2.

**Durum:** Belgelendi — "Sprint 178" iddiası ya gerçekleştirilmeli ya doküman/kod yorumu düzeltilmeli (öneri #3).

---

### installation.md — 🟡 Yanlış Dockerfile

- Satır 117: `docker build -f Dockerfile -t deckent-worker:latest .` — kök `Dockerfile` = `node:22-slim` + tmux + `WORKDIR /app` = **deckent uygulama imajı**, worker değil. Worker imajı `Dockerfile.worker` (`node:24-trixie-slim`; kod hata mesajı `spawn-backend-docker.ts:215` da `-f Dockerfile.worker` der). `docker-backend.md:87` doğru dosyayı kullanıyor — guide-içi çelişki.
- Geri kalan (Node ≥24 ✓, platform notları, npx consent flow) sağlam.

**Durum:** Belgelendi (öneri #3).

---

### getting-started.md / first-sprint.md — 🟡 Hafif stale

- **getting-started.md:** Proje yapısı diyagramı `.brain/MEMORY.md`/`DEBT.md` (legacy), `AGENTS.md` + `.claude/` eksik (quickstart'taki diyagramla tutmuyor); "All 46+ commands"; VitePress-absolute linkler.
- **first-sprint.md:** `deckent config --show` hayalet flag (Kesişen Sorun #2); `cat .brain/RETRO.md`/`DEBT.md` legacy yollar; tmux `attach`/window anlatımı docker default ile uyumsuz. Çekirdek sprint akışı doğru.

**Durum:** Belgelendi (öneri #3).

---

### config-recovery.md — 🟡 Sağlam içerik, küçük kusurlar

- `regenerateConfigSafe()` + `REGEN_TEMPLATE_DEFAULTS` **doğrulandı** (`config.ts:1180/1208`); template defaults (`spawn_backend: docker, dependency_pipeline_enabled: false, haiku_allowed: false, brain_planning: structured`) kodla birebir ✓.
- `deckent config read` — Kesişen Sorun #2.
- Import yolu tutarsız: satır 23 `from 'deckent/core/config'`, satır 124 `from './src/core/config.js'` — ikisi farklı, ikisi de yayınlanan paket için doğru kullanıcı-yolu değil.
- Satır 50: "Bu değerler **deckent-dev projesi için** güvenli defaults'lardır (ADR-047)" — deckent-dev iç detayı bir **kullanıcı kılavuzuna** sızmış; kullanıcı projelerinde `dependency_pipeline_enabled` default `true`.

**Durum:** Belgelendi (öneri #3).

---

### terminal.md / terminal-tr.md — 🟡 Port hatası

- Her ikisi satır 23: "Open `http://localhost:**3000**`" — gerçek default **3100** (`serve.ts:61`, `web.ts:29`, `server.ts:47`). (`server.ts:455` `retry: 3000` SSE retry-ms'i — port değil; muhtemelen karışıklık kaynağı.)
- Terminal başlatma `deckent serve` ile anlatılıyor; `getting-started.md` aynı dashboard'u `deckent web` ile açıyor. İkisi de gerçek komut — hangisinin gömülü terminali sunduğu netleştirilmeli.
- İçerik aksi hâlde detaylı + güncel (sub-project #1, B-022, ADR-062). EN/TR ayna tutarlı.

**Durum:** Belgelendi (öneri #3).

---

### nervous-system.md / workers.md — ✅ Sağlam

- **nervous-system.md:** 12 detector ✓ (`src/nervous/detectors/` = 12 dosya), Faz 1 üçlüsü (`stale_worker`, `dead_event_stream`, `directives_protection`) ✓, ADR-040 ✓, design spec yolu ✓. Tek kusur: `docs/superpowers/plans/2026-05-24-sprint-180-hybrid-beta-nervous.md` referansı — dosya **yok** (kırık link). Ayrıca Faz 2 detector isimleri (`cost_threshold`, `prompt_quality`) gerçek dosya isimleriyle (`token-spike`, `notification-delivery-health`) birebir değil — ileriye dönük, düşük öncelik.
- **workers.md:** Canonical konsolidasyon, ADR-037 V1.0 advisory enforcement doğru anlatılmış, `worker.ts` API tablosu makul. Tek nokta: §6 "lock > 15 min → CRITICAL alert" — `checkStaleLocks` (`auditor.ts:456`) yalnız tek eşik (`300_000`ms = 5dk) kullanıyor; 15dk CRITICAL kademesi kodda yok.

**Durum:** nervous-system.md kırık linki + workers.md 15dk kademesi düzeltilmeli (öneri #4) — aksi hâlde model kılavuzlar.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- `workers.md` + `nervous-system.md` tek-kaynak + güncel — diğer kılavuzlar için model.
- `docs/guide/` kendi içinde çelişiyor (tmux default mi deprecated mi, Pro 2 mi 3 worker mı, port 3000 mi 3100 mi). Yeni kullanıcı hangi kılavuzu okuduğuna göre farklı "gerçek" öğreniyor.

**Kullanıcı perspektifi (kritik):**
- `docs/guide/` bir OSS kullanıcısının **ilk temas yüzeyi**. Şu hâliyle: var olmayan komut (`config read`), var olmayan model (`gpt-4o`), yanlış Dockerfile, yanlış GitHub org, ve en kötüsü **var olmayan bir güvenlik garantisi** (docker read-only mount) öğretiyor.
- Memory V2'nin tüm kavram kılavuzlarında yokluğu — kullanıcı Deckent'in amiral özelliğini (`deckent recall`/`remember`, FTS5 hafıza) hiç keşfedemiyor.
- Bu, `development-docs-audit`'te işaretlenen aynı sınıf: ground-truth/doc-sync savunması (Sprint 166 Bug Y2) yalnız task açıklamalarını tarıyor, statik `docs/`'u değil.

---

## Gelecek Öneriler

1. **docker-backend.md:** ✅ **Tamamlandı** (2026-05-22) — mount-mode iddiaları (karar: doküman düzeltildi, kod `:ro` eklenmedi — proje `rw` mount + scope advisory), "Node.js 22"→24, ve §1 backend tablosu "tmux Default"→"docker Default" düzeltildi.
2. **2 kılavuz yeniden yazım/redirect:** `deckent-nedir.md` (Sprint 099) ve `faq.md` (Sprint 065) kod-gerçeğiyle baştan hizalanmalı veya `docs/reference/` canonical sayfalarına redirect edilmeli — stale kalma eğilimleri yüksek.
3. **Orta düzeltmeler:** `concepts.md` bellek tablosu (1500/400/800) + skill bölümü; `quickstart.md` wizard etiketleri (Performance/Balanced/Economic/API) + tmux→docker default; `troubleshooting.md` "Sprint 178" zaman çizelgesi; `installation.md` `Dockerfile`→`Dockerfile.worker`; `config-recovery.md` + diğerleri `config read`→bare `config`; `terminal.md`/`terminal-tr.md` port 3000→3100.
4. **Memory V2 entegrasyonu:** `getting-started`/`quickstart`/`first-sprint`/`concepts`'e `memory.db` + `.brain/exports/` + `deckent recall`/`remember`/`memory` + `deckent_memory_query` eklenmeli; `.brain/MEMORY.md` legacy yolları kaldırılmalı.
5. **Guide-içi tutarlılık + link-lint CI:** Tek link konvansiyonu seç (relative `.md` önerilir); `docs/` dead-link kontrolü CI adımı; sayısal ground-truth (komut/tool/agent/skill sayısı) tek kaynaktan (`docs/reference/` veya auto-generated) çekilsin.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `docs/guide/` 14 kullanıcı kılavuzu (4.474 satır) kod-gerçeğine ve birbirine karşı doğrulandı. **2 sağlam** (`nervous-system.md`, `workers.md`), **9 hafif/orta stale**, **1 kritik içerik hatası** (`docker-backend.md` — read-only mount güvenlik iddiası kod tarafından çürütüldü), **2 ağır stale** (`deckent-nedir.md` Sprint 099, `faq.md` Sprint 065). 4 kesişen sorun: Memory V2'nin yokluğu, `config read` hayalet komutu, tmux-default miti, link/sayı tutarsızlığı. Audit sonrası **`docker-backend.md` tümüyle düzeltildi** (2026-05-22): read-only mount iddiası (§1/§5.1/§5.2/§2.2), "Node.js 22"→24, ve §1 backend tablosu `Default` sütunu — karar: kod değil doküman gerçeğe hizalandı. Kalan düzeltme kapsamı (2 yeniden yazım + diğer nokta düzeltmeler) ayrı efor olduğu için "Gelecek Öneriler"de bırakıldı. Tüm bulgular `grep` + dosya kontrolü ile kanıtlandı.
