# Weekend Publish Runbook — deckent-dev → deckent (public) — 2026-08-01/02

> **Sahip:** Alperen (tüm dış-etkili adımlar elle) · **Hazırlayan:** Claude (Fable 5) oturumu, 2026-07-31
> **Plan satırları:** `RELEASE-BETA-001` (8090) · `REPO-MIGRATION-001` (8070) · `NPM-CHANNEL-001` (8091) ·
> `DOCS-TRUTH-PASS-001` (8092) · `LAUNCH-COMMS-001` (8093) · `EXEC-TEMPO-001` (440)
> **Çakışma protokolü:** Paralel session sprint yürütürken bu dosya bu track'in TEK çalışma yüzeyidir.
> MASTER-PLAN mutasyonları önce buradaki "Plan-sync bekleyen" bölümüne yazılır, session'lar
> ayrıştığında tek pakette plana işlenir. Bu runbook migration exclude listesindedir (public'e gitmez).

---

## 0. Bugün doğrulanan kritik gerçekler (2026-07-31)

| # | Bulgu | Sonuç |
|---|---|---|
| 1 | `npm view deckent` → **404** | Ad boşta; rezerve edilene kadar squatting riski sürüyor |
| 2 | `prepublishOnly` = `lint:master-plan && docs:stats:check && docs:ref:check && lint:identity && npm run build` | **`npm publish` build tetikler → sprint çalışırken publish YASAK.** Sprint-sessiz pencere şart |
| 3 | `npm pack --dry-run` (build tetiklemez): 2.210 dosya = `dist/`(2.206) + `LICENSE` + `README.md` + `assets/Dockerfile.worker` + `package.json`; 5.0 MB/17.8 MB; shasum `9375e32b…` | Tarball whitelist temiz — iç dosya sızıntısı YOK |
| 4 | Kök dizinde `.deck` **VAR** (S165 handoff "yok" diyordu — bayat) | npm'e girmiyor (`files` whitelist) ama **migration exclude'una kesin girecek** (token riski) |
| 5 | `scripts/public-repo-sync.sh` ve `../deckent-public` **yok** | Taşıma altyapısı sıfırdan; taslak §3'te |
| 6 | `lint:master-plan --check` **yeşil** (281 satır, projections in sync) | prepublishOnly'nin ilk gate'i şimdiden geçiyor |
| 7 | Aktif sprint: 487 (paralel session) | Bu track sprint bitene kadar yalnız yeni-dosya işi yapar |

---

## 1. CUMA (mümkünse bugün) — NPM-CHANNEL-001: ad rezervi

**Önkoşul:** sprint-sessiz pencere (`deckent status` → aktif run yok) — prepublishOnly build koşacak.

```bash
# 1. Öngörü: publish gate'lerini tek tek önden koş (build hariç hepsi güvenli)
npm run lint:master-plan && npm run docs:stats:check && npm run docs:ref:check && npm run lint:identity
# Herhangi biri kırmızıysa → publish'i deneme; önce gate'i yeşillet (muhtemel fail: docs:stats — bayat sayımlar)

# 2. Son tarball kontrolü (build tetiklemez)
npm pack --dry-run 2>&1 | grep -vE ' dist/' | head -20   # dist-dışı sadece 4 dosya görünmeli

# 3. PUBLISH (SEN — sprint-sessiz pencerede; prepublishOnly otomatik: gate'ler + build)
npm publish --tag beta
# publishConfig.access=public zaten package.json'da; --tag beta sayesinde `latest` BOŞ kalır

# 4. Doğrulama + smoke (temiz dizinde)
npm view deckent dist-tags        # → beta: 1.0.0-beta.1
cd "$(mktemp -d)" && npx deckent@beta --version && npx deckent@beta init --project-name smoke-test
```

**Rollback:** 72 saat içinde `npm unpublish deckent@1.0.0-beta.1`; alternatif `npm deprecate`.
**Not:** Bu rezerv publish'in `dist`'i o anki build'dir; Pazar günkü asıl beta yeni sürüm numarasıyla
(`1.0.0-beta.2+`) tazelenir.

---

## 2. CUMARTESİ — REPO-MIGRATION-001: temizlik + taşıma altyapısı

### 2.1 Settle-first (önkoşul)

Paralel session'ın sprint'i settle olduktan sonra: working-tree'deki değişiklikler mantıksal
commit'lere bölünür (manifest bu dosyanın §6'sına eklenecek), `git branch -vv` kontrolü, açık
worktree branch'leri (`checkpoint/d16-approval-20260720`, `goal/m1-graceful-budget-landing`,
`feat/docs-json-ai-author`) merge/typed-PAUSED devir kararı alır.

### 2.2 Yeni sync script taslağı

> Cumartesi `scripts/public-repo-sync.sh` olarak kaydedilecek — bugün scripts/'e yazılmadı
> (çakışma önleme). Taslak, 2026-07-31 kök envanterinden türetildi.

```bash
#!/usr/bin/env bash
# public-repo-sync.sh — deckent-dev → ../deckent-public filtreli sync (clean-start)
# Kullanım: bash scripts/public-repo-sync.sh [--dry-run]
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${SRC}/../deckent-public"
DRY=""; [[ "${1:-}" == "--dry-run" ]] && DRY="--dry-run"
[[ -d "$DST/.git" ]] || { echo "HATA: $DST git klonu yok"; exit 1; }

EXCLUDES=(
  # VCS + runtime state (ASLA)
  '.git' '.brain' '.deckent' '.deck' '.tasks' '.locks' '.dashboard'
  '.deckent-execution-lock-authority.anchor.json'
  # Provider/host internal
  '.claude' '.codex' '.gemini' '.cursor' '.agents' '.superpowers' '.playwright-mcp'
  'AGENTS.md' 'CLAUDE.md' 'GEMINI.md' 'DECKENT.md'
  # İç strateji / iç analiz / iç plan
  'DIRECTIVES.md' 'MIGRATION-PLAN.md' 'MCPV2.md' 'PROMPT-MECHANICS-ANALYSIS.md'
  'PROVIDER-AUTHORITY-EXECUTION-PLAN.md' '.analysis' 'alp-discipline' 'design'
  'docs/MASTER-PLAN.md' 'docs/generated' 'docs/audits' 'docs/archive' 'docs/superpowers'
  'docs/release/weekend-publish-runbook.md'
  # Build/test artifact
  'node_modules' 'dist' 'coverage' '.test' '.test-e2e-*' '.tmp-test' '.git-guard-bin'
  # Güvenlik/tooling
  '.secrets-baseline' '.npmrc' '.pre-commit-config.yaml' '.lintlinkignore'
)
RSYNC_EX=(); for e in "${EXCLUDES[@]}"; do RSYNC_EX+=("--exclude=$e"); done
rsync -av --delete $DRY "${RSYNC_EX[@]}" "$SRC/" "$DST/"
echo "--- sync bitti ($DRY) ---"
# Sızıntı taraması hedef ağaçta (staged tree):
grep -rIlE '(BLUEPRINT|ANA-PLAN|DIRECTIVES|sk-[A-Za-z0-9]{20}|api[_-]?key\s*[:=])' "$DST" \
  --exclude-dir=.git | head -20 && echo '⚠️ ŞÜPHELİ BULGU — incele' || echo '✅ desen taraması temiz'
```

### 2.3 Karar-bekleyen include/exclude kalemleri (Alperen)

| Kalem | Öneri | Neden |
|---|---|---|
| `docs/MASTER-PLAN.md` + generated | **Exclude** | İç iş-SSOT'u, owner receipt'leri içeriyor |
| `README-TR.md` | Include | i18n vitrini — ama truth-pass'ten geçmeli |
| `deckent-hub/`, `native/`, `examples/` | Include | S151'de include; kaynak parçası |
| `.github/` workflows | Include (denetimle) | CI public'te lazım; secret referansları taranacak |
| `CROSS-PLATFORM-TESTING.md` | Truth-pass sonrası include | Yararlı ama bayat olabilir |
| `.npmignore` | Include + gözden geçir | Publish public repo'dan yapılacaksa kritik |

### 2.4 Kurulum + tek launch commit

```bash
git clone https://github.com/VerhexIO/deckent.git ../deckent-public   # (repo GitHub'da hazır olmalı)
bash scripts/public-repo-sync.sh --dry-run   # önce simülasyon + sızıntı taraması
bash scripts/public-repo-sync.sh
cd ../deckent-public
git add -A && git status --stat              # beklenen: src/ tests/ docs(filtreli) + kök whitelist
# gitleaks varsa: gitleaks detect --source . --no-git
git commit -m "feat: Deckent v1.0.0-beta public launch"   # push PAZAR günü
```

---

## 3. CUMARTESİ — DOCS-TRUTH-PASS-001: README gerçeklik geçişi

**Kaynak = kod, doküman değil.** 2026-07-31 doğrulanmış envanter:
7 provider adapter ailesi (claude, codex, gemini, ollama, openrouter, openai-compatible, bedrock) ·
XVerify alt-sistemi (cross-verify-adjudication / invocation-coordinator / execution-contract /
ingress+docker authority) · typed settlement (`DONE/GO_WITH_TECH_DEBT/NO_GO/HOLD/PAUSED`) ·
42 MCP tool · 8-faz yaşam döngüsü · FTS5 memory + ADR + decay + promotion pipeline · 2.384 test dosyası.

**README iskeleti (yeniden yazım):**
1. Tek cümle: *"Deckent is a provider-neutral orchestration runtime that runs multi-agent
   software-delivery work with evidence-backed, cross-provider-verified settlement."*
2. Neden farklı (3 madde): typed GO/NO_GO settlement + disk-verify · XVerify (üreten provider
   kendi işini doğrulayamaz) · outcome→routing→promotion öğrenme döngüsü
3. 60 saniyede başlangıç (`npx deckent@beta init` → `deckent plan` → `deckent start`)
4. Mimari şeması (Brain–Auditor–Worker + yaşam döngüsü)
5. **Current Status (dürüstlük bölümü):** beta; platform matrisi tablosu (Linux ✅ / WSL ✅ /
   macOS-Windows-native: durumlarını dürüst yaz); bilinen sınırlar; roadmap işaretçisi
6. MCP server+client, provider matrisi, konfigürasyon
7. Security policy linki + katkı rehberi

**Hijyen kontrol listesi:** `SECURITY.md` içeriği güncel mi (zafiyet kanalı) · `CONTRIBUTING.md` ·
`CODE_OF_CONDUCT.md` · `CHANGELOG.md` beta girdisi · README'de bayat sayı/iddia sıfır ·
i18n: README-TR paritesi.

---

## 4. PAZAR — RELEASE-BETA-001: flip + publish + arşiv

```bash
# 1. Son doğrulama (public klonda)
cd ../deckent-public && git log --stat -1 && git push origin master
# 2. SEN: GitHub UI → Settings → Change visibility → Public   (veya: gh repo edit VerhexIO/deckent --visibility public)
curl -s https://api.github.com/repos/VerhexIO/deckent | grep '"private"'   # → false
# 3. SEN: güncel beta publish (sprint-sessiz; sürüm artır: 1.0.0-beta.2)
npm version prerelease --preid=beta --no-git-tag-version && npm publish --tag beta
# 4. Smoke (temiz makine/dizin): npx deckent@beta init → 0 hata
# 5. SEN: deckent-dev → GitHub Settings → Archive (read-only)
# 6. Lokal devir: .brain/ + .deckent/ dizinlerini yeni klona KOPYALA (gitignored kalırlar; memory.db ASLA silinmez)
```

**Rollback:** flip kısmen geri-alınamaz (cache/star kalıcı). Sızıntı bulunursa: repo'yu tekrar
private yap → `git filter-repo` ile temizle → force-push (Alperen onayı) → GitHub Support cache purge.
npm: 72h unpublish penceresi.

**GitHub repo ayarları (flip sonrası):** Description: *"Provider-neutral AI agent orchestration
runtime — evidence-backed multi-agent software delivery"* · Topics: `ai-agents`,
`multi-agent-orchestration`, `agent-orchestration`, `mcp`, `cli`, `developer-tools` ·
Issues açık, Discussions açık, branch protection master.

---

## 5. LAUNCH-COMMS-001 — taslak iskeleti (her gönderi yayın öncesi Alperen onaylı)

- **Konumlandırma (tek cümle):** "Orchestration you can audit: every agent verdict is typed,
  disk-verified, and cross-checked by a *different* provider."
- **Show HN başlık adayları:** "Show HN: Deckent – multi-agent orchestration where a different
  provider verifies every result" / "…with typed GO/NO_GO settlement instead of vibes"
- **X/LinkedIn thread iskeleti:** problem (agent çıktısına güven) → mevcut araçların sahte-verdikt
  sorunu (bağımsız denetim bulgularına atıf, isim vermeden) → XVerify + typed settlement +
  öğrenme döngüsü → demo GIF → beta çağrısı
- **Demo asset:** asciinema/VHS: `init → plan → start → evaluate → settlement raporu` tek akış
- **Kadans:** hafta 2-3 gönderi; en özgün format = gerçek sprint settlement raporları

---

## 6. Plan-sync bekleyen mutasyonlar (MASTER-PLAN'a işlenecek)

- **2026-08-01 — PUBLISH ERTELENDİ (Alperen kararı):** Deckent ciddi fonksiyon kaybı yaşıyor;
  öncelik = recovery/onarım. Plana işlenecek mutasyonlar (session'lar ayrışınca tek pakette):
  - `RELEASE-BETA-001` (8090), `NPM-CHANNEL-001` (8091), `DOCS-TRUTH-PASS-001` (8092),
    `LAUNCH-COMMS-001` (8093), `REPO-MIGRATION-001` (8070) → **DEFERRED**
    (gerekçe: owner kararı 2026-08-01, recovery önceliği; review: recovery settle olduktan
    sonraki ilk sprint-sessiz pencere)
  - `EXEC-TEMPO-001` (440) → kalır (OPEN) — recovery sonrası tempo işi geçerliliğini koruyor

## 7. Bu track'in durum günlüğü

- **2026-08-01 — PUBLISH ERTELENDİ.** Deckent fonksiyonalitesini kaybetti; ayağa kaldırma +
  onarım önceliklendirildi (Alperen). Hafta sonu cutover planı askıda; bu runbook'un tüm
  mekanik içeriği (sync script taslağı, exclude manifest, README iskeleti, flip checklist)
  geçerli kalır ve recovery sonrası aynen devreye girer. ⚠️ Açık risk: npm'de `deckent` adı
  hâlâ rezerve edilmedi (404) — rezerv de `prepublishOnly` build'i gerektirdiğinden deckent
  yeşile dönmeden yapılamaz; recovery sonrası İLK iş olarak öne alınmalı.
- **2026-07-31:** Runbook oluşturuldu. npm 404 doğrulandı; tarball audit temiz; `prepublishOnly`
  build-kısıtı tespit edildi; `.deck` root'ta bulundu (migration exclude'una eklendi); sync script
  taslağı hazırlandı. Bekleyen: sprint-sessiz pencerede rezerv publish (Alperen).
