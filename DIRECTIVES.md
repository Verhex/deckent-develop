# DIRECTIVES — Sprint 075: Faz 2 Devam — Docs Tutarlılık + Güvenlik + Refactor

## Goal: Dokümantasyon dil tutarlılığı, VISION.md oluşturma, docs link audit, .detect-secrets güvenlik kurulumu ve god object split devamı. Blocker'sız task'lar — hemen başlanabilir.

---

## Task 1: Dokümantasyon Dil Stratejisi — TR/EN Tutarlılık
- Model: opus
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/CHANGELOG.md, docs/SPRINT-LOG.md, docs/index.md, BETA-ROADMAP.md, AGENTS.md
- Scope: docs/, BETA-ROADMAP.md, AGENTS.md

### Description
Dokümantasyon dosyalarında dil karışıklığı var. Strateji:

**Karar: Türkçe birincil, İngilizce sadece teknik terimler.**

Kurallar:
- docs/CHANGELOG.md: Section başlıkları İngilizce kalabilir (Added/Changed/Fixed — Keep a Changelog standardı), açıklama metinleri Türkçe
- docs/SPRINT-LOG.md: Zaten Türkçe — dokunma
- docs/index.md: İngilizce kalabilir (VitePress public-facing)
- BETA-ROADMAP.md: Zaten Türkçe — dokunma
- AGENTS.md: İçeriği kontrol et, Türkçe olmalı

Yapılacaklar:
A) docs/CHANGELOG.md'deki karışık satırları düzelt — İngilizce açıklamaları Türkçeye çevir
B) Dosya başlarına `<!-- Dil: TR | Teknik terimler EN -->` yorum satırı ekle
C) AGENTS.md'yi kontrol et ve gerekiyorsa Türkçeleştir

DİKKAT: Keep a Changelog format bozulmasın. Section başlıkları (Added/Changed/Fixed/Removed) İngilizce KALMALI.

**Kanıt:** `grep -c "^[A-Z].*:" docs/CHANGELOG.md` → sadece section başlıkları İngilizce

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 2: VISION.md — Proje Vizyonu ve Yol Haritası
- Model: opus
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer
- Files: VISION.md
- Scope: VISION.md

### Description
VISION.md oluştur — projenin vizyonunu, hedeflerini ve stratejisini tanımla.

İçerik yapısı:
1. **Vizyon** — Deckent ne olmak istiyor? (1 paragraf)
   - AI agent orkestrasyon CLI — multi-agent sprint'ler ile otonom yazılım geliştirme
   - İnsan sadece hedef belirler, Deckent planlar-çalıştırır-değerlendirir

2. **Misyon** — Neden varız? (1 paragraf)
   - Solo AI asistanından multi-agent ekibe geçiş
   - Brain-Worker-Auditor mimarisi ile kalite garantisi

3. **Hedef Kullanıcılar**
   - Bireysel geliştiriciler (indie dev, freelancer)
   - Küçük takımlar (2-10 kişi)
   - Enterprise (gelecekte)

4. **Rakip Analizi** (tablo formatında)
   - Devin, OpenClaw/OpenHands, Aider, Cursor, Claude Code solo
   - Deckent farkı: orkestrasyon, multi-agent, sprint lifecycle, memory/learning

5. **Teknoloji Kararları**
   - TypeScript + ESM (neden)
   - Multi-provider (Claude + Codex + Gemini) (neden)
   - tmux + subprocess backend (neden)
   - MCP entegrasyonu (neden)

6. **Yol Haritası** (Faz 1-4 BETA-ROADMAP'tan özet)

7. **Değerler** — Açık kaynak, şeffaflık, kalite, otonom ama kontrollü

Dil: Türkçe (teknik terimler İngilizce)

**Kanıt:** `test -f VISION.md && echo "exists"` → exists

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 3: docs/ Link Audit — Kırık Link Kontrolü
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/CHANGELOG.md, docs/SPRINT-LOG.md, docs/index.md, README.md
- Scope: docs/, README.md

### Description
Tüm Markdown dosyalarındaki linkleri kontrol et:

A) İç linkler: `[text](relative/path.md)` — hedef dosya var mı?
B) Dış linkler: `[text](https://...)` — format doğru mu? (ping etme, sadece URL formatı)
C) Anchor linkler: `[text](#heading)` — heading var mı?
D) Kırık linkleri düzelt veya kaldır
E) docs/archive/ altındaki referansları kontrol et

Yaklaşım:
1. `grep -r "\[.*\](.*)" docs/ README.md` ile tüm linkleri listele
2. İç linklerin hedeflerini dosya sistemiyle doğrula
3. Kırık olanları düzelt

**Kanıt:** `grep -r "\[.*\](" docs/ | grep -v "http" | head -20` → tüm iç linkler geçerli

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 4: .detect-secrets Kurulumu — Pre-commit Güvenlik
- Model: sonnet
- Effort: normal
- Skills: security-expert, ci-cd-expert
- Files: .pre-commit-config.yaml, .secrets.baseline
- Scope: .pre-commit-config.yaml, .secrets.baseline, .gitignore

### Description
Secret leak koruması ekle:

A) `.pre-commit-config.yaml` oluştur:
```yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

B) `.secrets.baseline` oluştur — mevcut false positive'leri baseline'a ekle:
- Test dosyalarındaki mock API key'ler
- Docs'taki örnek key formatları

C) `.gitignore`'a .env ve credential pattern'leri ekle (zaten varsa kontrol et):
```
.env
.env.local
*.pem
credentials.json
```

D) Kurulum notunu README.md veya CONTRIBUTING.md'ye ekle (opsiyonel)

DİKKAT: `detect-secrets` Python paketi — pre-commit hook olarak çalışır. Eğer Python yoksa sadece config dosyalarını oluştur, kurulum komutunu dokümante et.

**Kanıt:** `test -f .pre-commit-config.yaml && echo "exists"` → exists

**Test:** Bu task test gerektirmez — altyapı.

---

## Task 5: God Object Split Faz 2 — sprint-controller Utility Extract
- Model: opus
- Effort: high
- Skills: typescript-expert, refactoring-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-utils.ts
- Scope: src/orchestra/

### Description
Sprint 072'de sprint-phases.ts extract edildi. Şimdi sprint-controller.ts'den utility fonksiyonlarını çıkar.

Yeni dosya: `src/orchestra/sprint-utils.ts`

Taşınabilecek adaylar (sprint-controller.ts'yi oku ve tespit et):
- Config yükleme/merge yardımcıları
- Sprint ID üretme/artırma
- Task dosyası okuma/yazma yardımcıları
- Log/output formatting fonksiyonları
- Timeout/retry yardımcıları

Yaklaşım:
1. sprint-controller.ts'yi oku — hangi fonksiyonlar pure utility?
2. State'e bağımlı olmayanları sprint-utils.ts'ye taşı
3. sprint-controller.ts'de import edip kullan
4. Re-export pattern: public API DEĞİŞMEZ

DİKKAT: Sadece pure utility extract. İş mantığını DEĞİŞTİRME. Mevcut testler regression-free geçmeli.

**Kanıt:** `wc -l src/orchestra/sprint-controller.ts` → öncekinden kısa + `test -f src/orchestra/sprint-utils.ts` → yeni dosya var

**Test:** Mevcut testler regression-free geçmeli. Yeni test gerekmez (extract only).

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail, 0 regresyon
- Dokümantasyon: dil tutarlı, linkler geçerli
- God object split: public API değişmez, backward compat
- %100 GO hedefli