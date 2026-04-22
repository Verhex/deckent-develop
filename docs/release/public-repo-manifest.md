# Public Repository Manifest

> **Status:** Sprint 150 güncellemesi — Sprint 151'de Alperen tarafından manuel olarak flip edilecek.
> **Hedef Repo:** `github.com/VerhexIO/deckent` (henüz public değil)
> **Sync Script:** `scripts/public-repo-sync.sh`
> **Bağımlılık:** T-150-037 (`.deckent/docs.json` private/public split) tamamlanmalı önce.

Bu belge, `deckent-dev` (private geliştirme reposu) ile `VerhexIO/deckent` (public açık kaynak repo) arasındaki sınırı tanımlar. Sürüm 1.0.0-beta.1 için geçerlidir.

---

## Include — Public Repoya Gidecekler (✅)

| Yol | Tür | Açıklama |
|-----|-----|----------|
| `src/` | Dizin | Tüm TypeScript kaynak kodu (core, cli, mcp, api, agents, orchestra, nervous, connectors) |
| `tests/` | Dizin | Tüm test dosyaları (unit, integration, e2e) |
| `docs/` | Dizin | Kullanıcıya yönelik dokümanlar (audits hariç — iç kullanım) |
| `examples/` | Dizin | Örnek kullanım senaryoları ve demo projeleri |
| `deckent-hub/` | Dizin | Skill registry — 20 seed skill + CI workflow |
| `README.md` | Dosya | Ana proje tanıtımı ve hızlı başlangıç (TR/EN) |
| `README-TR.md` | Dosya | Türkçe README (TR kullanıcı tabanı için) |
| `LICENSE` | Dosya | MIT lisansı |
| `CHANGELOG.md` | Dosya | Sürüm geçmişi (keepachangelog.com formatı) |
| `CONTRIBUTING.md` | Dosya | Katkı rehberi |
| `CODE_OF_CONDUCT.md` | Dosya | Topluluk davranış kuralları |
| `SECURITY.md` | Dosya | Güvenlik açığı bildirme süreci |
| `AGENTS.md` | Dosya | Ajan listesi ve açıklamaları |
| `package.json` | Dosya | npm metadata, scripts, dependencies |
| `package-lock.json` | Dosya | Kilitli bağımlılık versiyonları |
| `tsconfig.json` | Dosya | TypeScript yapılandırması |
| `Dockerfile` | Dosya | Worker Docker imajı |
| `Dockerfile.worker` | Dosya | Worker-specific Docker imajı |
| `docker-compose.yml` | Dosya | Docker Compose yapılandırması |
| `.github/` | Dizin | CI workflows, issue templates, PR templates |

---

## Exclude — Public Repoya GİTMEYECEKLER (❌)

| Yol | Neden Hariç? |
|-----|-------------|
| `.brain/` | İç proje hafızası — SQLite DB, sprint logları, retro dosyaları. Kullanıcının kendi `.brain/` dizini olacak. |
| `.deckent/` | Proje-özgü deckent yapılandırması — sprint ID'leri, agent pool, safety point. Her proje kendi oluşturacak. |
| `.deckent/docs.json` | Dev-private lokal runtime config — T-150-037 Alperen kararı: private lokal (`.deckent/` zaten exclude kapsamında, bu satır açıklık için eklendi). |
| `.deck` | Gizli dosya — API token'ları, Discord/Telegram bot token'ları. ASLA repoya girmez. |
| `DECKENT-MASTER-BLUEPRINT.md` | Özel iç doküman — ADR-033 Product Vision governance (yönetim kararları dahili). |
| `DECKENT-ANA-PLAN-TR.md` | Özel iç plan — Türkçe master plan, stratejik kararlar, yayınlanmaya hazır değil. |
| `DECKENT-TEST-REPORT.md` | İç test raporu — Sprint sürecine ait, public context olmaz. |
| `NEXT-SESSION-PROMPT.md` | İç koordinatör notu — bir sonraki sprint için hazırlık promptu. |
| `DIRECTIVES.md` | Aktif sprint direktifleri — proje-özgü görev tanımları, public'e anlam ifade etmez. |
| `DECKENT.md` | İç proje kuralları (DECKENT.md adapter pattern — ADR-013). Kullanıcı kendi oluşturacak. |
| `CLAUDE.md` | İç Claude Code yapılandırması — workspace-özgü kurallar. |
| `.claude/` | Claude Code agent kuralları — worker/brain/auditor prompt'ları (iç kullanım). |
| `coverage/` | Test coverage çıktıları — CI'da üretilir, repoda tutulmaz. |
| `dist/` | Build çıktıları — `tsc` ile üretilir, npm publish tarball'da ayrıca derlenir. |
| `node_modules/` | Bağımlılıklar — `npm install` ile kurulur. |
| `.tasks/` | Sprint task dosyaları — aktif sprint state (iç kullanım). |
| `.locks/` | Dosya kilitleri — worker coordination (iç kullanım). |
| `docs/audits/` | İç denetim raporları — sprint-bazlı kod kalitesi analizleri (yönetim iç kullanımı). |
| `.env` | Ortam değişkenleri — asla repoya girmez. |
| `COMPETITIVE-ANALYSIS.md` | İç strateji belgesi — fiyatlandırma + rakip analiz. T-151-002 kararı: exclude. |
| `.codex/` | OpenAI Codex provider internal config — iç kullanım. |
| `.gemini/` | Google Gemini provider internal config — iç kullanım. |
| `.secrets.baseline` | detect-secrets tool baseline — internal security tooling. |
| `.test-e2e-*` | E2E test geçici dizinleri — ephemeral sprint artifacts. |

---

## Sınır Kararları

### `docs/` — Kısmi Include
`docs/` dizini public repoya gider **ancak** `docs/audits/` alt dizini **hariç tutulur**. Audit raporları iç proje yönetimine aittir.

### `deckent-hub/` — Full Include
Sprint 149'da oluşturulan skill registry dizini public repoya gider. Bu, topluluk katkısına açık olacak.

### `VISION.md` / `VISION-TR.md`
Public vizyon belgeleri — public repoya dahil edilir.

### `COMPETITIVE-ANALYSIS.md`
Rakip analizi — **iç strateji belgesi olarak hariç tutulur** (T-151-002 kararı). Fiyatlandırma stratejisi ve rakip zayıf noktaları gibi hassas bilgiler içerir; public repoda görünmemeli.

---

## Sprint 151 Flip Talimatları

Alperen Sprint 151'de şu adımları izler:

**Önkoşul:** T-150-037 tamamlanmış olmalı (`.deckent/docs.json` gitignore'a eklenmiş, `git rm --cached` yapılmış).

1. **Repo oluştur** (eğer yoksa):
   ```bash
   gh repo create VerhexIO/deckent --public --description "AI agent orchestration CLI for developers"
   git clone https://github.com/VerhexIO/deckent.git ../deckent-public
   ```

2. **Dry-run ile doğrula (ÖNCE — ZORUNLU):**
   ```bash
   bash scripts/public-repo-sync.sh --dry-run
   ```

3. **Gizli dosya sızıntısını kontrol et:**
   ```bash
   grep -r "BLUEPRINT\|ANA-PLAN-TR\|BETA-TRACKER" /tmp/sync-dry-run.log 2>/dev/null || \
   grep -l "BLUEPRINT\|ANA-PLAN-TR" ../deckent-public/ 2>/dev/null && echo "❌ GİZLİ DOSYA BULUNDU" || echo "✅ Temiz"
   ```

4. **Live sync:**
   ```bash
   bash scripts/public-repo-sync.sh
   ```

5. **Review et** — `../deckent-public/` dizinine geçip `git diff HEAD` ile inceleme yap.

6. **Push et:**
   ```bash
   cd ../deckent-public
   git push origin main
   ```

7. **npm publish:**
   ```bash
   npm publish --tag beta
   ```

---

## Versiyon Bilgisi

| Alan | Değer |
|------|-------|
| Manifest versiyonu | 1.0 |
| Oluşturulma | Sprint 149 (2026-04-20) |
| Hedef release | v1.0.0-beta.1 |
| Sprint flip tarihi | Sprint 151 — Per 24-25 Nis 2026 TRT |
| Son güncelleme | Sprint 151 T-151-002 (COMPETITIVE-ANALYSIS.md + .codex/.gemini + .test-e2e-* exclude eklendi) |
