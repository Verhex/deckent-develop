# 2026-07-22 — Repo-DIŞI Çevre (b) + Küçükler (c) Analizi

> **Kapsam:** Temizlik-programının son iki ayağı — (b) repo-dışı çevre: GitHub-ayarları · npm ·
> HOME global-state; (c) küçükler: dal-hijyeni · gitignore-konsolidasyon · memory.db içerik-audit.
> **Yalnız analiz — aksiyon yok.** Yöntem: gh/npm/git/curl canlı-sorgu + 2 keşif + el-teyitleri.
> Kardeş-defter: `2026-07-21-dokuman-temizlik-karar-tablosu.md` (#29-30).
> **✅ Kararlar (Alperen 2026-07-22):** 29a KABUL · 29b KURMA (ürün-repo `deckent`te kurulacak) ·
> 29c ONAY · 30a/b/c/d HEPSİ ONAY (decay-incelemesi ayrı-iş). Uygulama: `2026-07-22-temizlik-gunu-plani.md`.

---

## A. REPO-DIŞI ÇEVRE (b)

### A1. GitHub repo-ayarları (`VerhexIO/deckent-develop` = origin)
Canlı gh-sorgu sonuçları (2026-07-22):
- Repo **PUBLIC**, default=main, arşivlenmemiş, son push 07-21.
- **Branch-protection: YOK** (`branches/main/protection` → 404 "Branch not protected") — public repoda
  main'e korumasız direct-push açık.
- **Pages: KURULMAMIŞ** (404) ve **repo-variable listesi BOŞ** → `DECKENT_PAGES_ENABLED` unset →
  `docs.yml` deploy-adımı tasarımı gereği hep dürüst-SKIP. `docs.deckent.agency` bu repodan yayında değil.
- **GitHub Release: SIFIR.** `release.yml`'in "tek-seferlik manuel kurulum" dediği şeyler (npm
  trusted-publisher, Pages) fiilen hiç kurulmamış/test edilmemiş — ilk gerçek release'te ilk kez sınanacak.

### A2. 🔴 README ölü-URL vitrini (canlı-doğrulanmış)
`README.md` **26 mutlak-URL** ile `VerhexIO/deckent`e işaret ediyor (25 link + 1 raw-logo) — ve
**`VerhexIO/deckent` çözümlenemiyor: curl 404** (repo yok ya da private). Sonuç: PUBLIC
`deckent-develop`i bugün ziyaret eden herkes **kırık-logolu + 25 ölü-linkli README** görüyor.
Bağlam: URL-uzayı ürün-repoya (göç-hedefi, MIGRATION-PLAN) önceden yazılmış. **Karar-noktası (⬜):**
(a) göçe kadar bilinçli-kabul (CC-önerisi: kabul — geçici s/deckent/deckent-develop/ düzeltmesi göçte
geri alınacak churn üretir; kabul kaydı defterde dursun) (b) geçici düzeltme.

### A3. npm-paket durumu
`npm view deckent` → **E404 — paket HİÇ yayınlanmamış.** `1.0.0-beta.1` yalnız lokal;
validate-publish/trusted-publisher/OIDC zinciri henüz gerçek-yayınla hiç test edilmedi.

### A4. HOME global-state (~2.28GB toplam)
| Grup | Boyut | Durum |
|---|---|---|
| `~/.claude` | **1.7G** | `projects/` 1.4G (20 proje — 2 aktif kütle: `-workspace` 707M + `deckent-dev` 698M, DOKUNULMAZ) · `file-history/` 133M · `plugins/` 64M · `security/` 13M/2017-dosya · `session-env/` 9.8M/2450-dosya |
| `~/.codex` | 534M | `sessions/` 297M (taze-aktif) + `logs_2.sqlite` 86M + plugins 34M; `auth.json` VAR (dokunulmaz) |
| `~/.gemini` | 47M | ~%100'ü `tmp/` (06-29→07-21, kısmen bayat); credentials VAR (dokunulmaz) |
| `~/.deckent` | **64K** | TEMİZ-NİZAMİ: keyring/keys(600) + desktop/gateway state + 6 model-probe-cache; tek bayat: 0-byte `model-auto-detect-claude-api.json` |

**Bayat-aday sınıfları (silme YOK — aday):** ① `~/.claude/projects/*-claude-worktrees-*` 7 dizin ~2.5M
(kaynak worktree'ler yok, Haz-24..26) ② `-tmp-*` ~11 ephemeral-proje (en büyük 11M) ③
`security_warnings_state_*.json` **1008 dosya / 9.9M** (session-başına bloat-deseni) ④
session-env/file-history/shell-snapshots Haziran-kuyruğu ⑤ `~/.gemini/tmp` 47M retention-adayı.
Not: hiçbir HOME-state 1 aydan eski değil (en eski mtime 06-22) — birikim genç ama desenler rotasyonsuz.

**2 premise-düzeltme (el-teyitli):** `pricing-updater.ts:415` global değil **proje-local** cache kullanıyor
(global `~/.deckent/cache` sahibi `model-catalog.ts:30`) · `~/.deckent/config.json` global-config katmanı
**kodda tanımlı (`adr-seed.ts:53` 3-katman) ama bu makinede dosya YOK** — config fiilen default+proje-local.

---

## B. KÜÇÜKLER (c)

### B1. Dal-hijyeni (git)
Remote'lar: `origin` = **deckent-develop** (aktif) · `origin-archive` = deckent-dev (tamamı 05-08'de donmuş arşiv).
- **Lokal temizlik-adayları:** `master` (05-08, origin-archive'i izliyor — bayat) ·
  **`origin-archive` ADINDA lokal dal** (05-08 — remote-adıyla çakışan adlandırma-kazası, ⚠️ karışıklık-riski) ·
  `feat/docs-json-ai-author` (06-09, upstream'siz) · `sp1-native-agent-finish` (06-15, upstream'siz;
  merge-durumu temizlik-günü kontrol) · `checkpoint/d16-approval-20260720` (07-20; remote-eşi var — karar).
- **DOKUNULMAZ:** `main` (aktif) · `goal/release-gate-truth` (07-21 — **Codex-goal dalı**, goal kapanana dek).
- **Remote-adaylar:** origin'de 5 bayat konu-dalı (05-20→06-02: ci-node-modernization ·
  embedded-web-terminal-spec · recover-sprint223 · repl-layout-spinner) + ~14 dependabot-dalı
  (dependabot kendi kapatır; konu-dalları elle) · `origin-archive` remote-kaydı kaldırılabilir
  (GitHub-arşiv durur, lokal referans-kirliliği gider).
- **`.git` = 485MB** — çalışma-ağacından büyük; `git gc --aggressive`/repack + büyük-blob analizi ayrı
  mini-iş adayı (worktree'ler + 2568-dosyalık arşiv-tarihçesi pack'i şişirmiş olabilir).

### B2. Gitignore-konsolidasyon
Metrikler: `.gitignore` 232 satır / **158 desen** / 43 yorum; kardeşleri `.lintlinkignore` 78 ·
`.npmignore` 73 · `.dockerignore` 30. **Tracked-ama-ignored (ignore-inert) kesin-liste: 80 dosya** —
75 `.deckent/runtime/evaluations` + 3 `.test/*` (SİL-kararlı #9b) + `settings/docs.json` + `run-gate.json`
→ tamamı T9 git-hijyen diliminin kapsamında (yeni sürpriz YOK — tarama tam-listeyi teyit etti).
Diskteki ignored-untracked öğe: 531. Yara-bandı test-desenleri (`.test-e2e*`, `.tmp-test/`,
`.test-archive-debt-*`) TS1 tmpdir-göçüyle gereksizleşecek → **konsolidasyon-sırası: temizlik-günü +
TS1 SONRASI tek-geçiş sadeleştirme** (önce yapmak churn üretir).

### B3. memory.db içerik-audit (readonly)
**Genel hüküm: TEMİZ — canlı ve tutarlı.** 20.4MB · `entries` 1606 kayıt (chat 358 · memory 300 ·
debt 235 · sprint 219 · retro 212 · audit 165 · pattern 69 · **adr 47** · identity 1); soft-delete
kirliliği sıfır; test-artığı ~sıfır; duplicate'ler tasarımca-tekrarlanan event-log'lar (çöp değil);
**ADR: DB 47 = docs/adr 47 birebir** (decisions.md 50-slug = superset/aggregate, tutarsızlık değil);
retro/debt 07-20'ye kadar canlı; **açık debt: 0** (235/235 resolved).

Bakım-kalemleri (küçük, ⬜): ① 4 boş memory-kaydı (`mem-sprint-258/259/339/366` — yalnız başlık)
② sprint<300'den **93 non-exempt aktif memory** (decay-cadence gözden-geçirme adayı) ③ 1 normalizasyon-glitch
(`sprint-448` kaydında `sprint_num=0`) ④ boyutu 2 dev chat-blob domine ediyor (~115K-karakter transkriptler).

**El-teyit düzeltmesi (Kanun-3):** ajanın "routeTaskV2 kodda CANLI → memory-kayıtları bayat değil"
düzeltmesi **YANLIŞ-gerekçeli** — grep-teyidi: src'deki 10 `routeTaskV2` referansının **10'u da
yorum/veri-string'i**, tek canlı çağrı yok (V2-motoru `2c63b777`de silinmiş durumda; Alan-1 doğru).
Memory-kayıtları yine de meşru (tarihsel-öğrenme atfı — memory'nin işi bu); asıl bulgu **src-yorumlarının
bayat-anlatısı** (`sprint-planner.ts:693-700` "V2 engine" diye anlatıyor, `config-types.ts:1029`
"Only 'v2' exists" diyor) → src kod-sağlık programının truth-hijyen kalemi.
