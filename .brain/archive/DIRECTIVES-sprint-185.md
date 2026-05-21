# Sprint 184 (rerun) — Zero-Config Dinamik Task Split Limiti Testi

> **Deney amacı:** AI Planner manifest **olmadan** "src/ altındaki her dosya için ayrı audit task üret" goal'u görünce kaç task üretir? Mimari hipotez: zero-config split kuralı (`planner.ts:147`) 3-5 task'la sınırlar, 479 dosya için dinamik üretim YOK.

---

# DIRECTIVES — Sprint 184 (rerun): Codebase Self-Audit Tam Kapsamlı (DOC-ONLY, NO MANIFEST)

## Goal

src/ altındaki **479 TypeScript dosyasının HER BİRİ için ayrı bir audit task** üret. Her task tek dosyayı satır-satır okuyup `docs/audits/dynamic-split/<flat-path>.md` altına 9-section markdown rapor yazsın: Inventory + Bağlam + Debt Risk + Dead Code + Documentation Gaps + ADR Compliance + Refactor Recommendations + Sprint 187 Follow-up + Summary.

**Manifest dosyası YOK** — Brain AI Planner kendi dinamik file-tree split kapasitesiyle 479 task üretmek zorunda. **KOD YAZIMI MUTLAK YASAK** — sadece `docs/audits/dynamic-split/<flat>.md` markdown raporları.

Her audit task:
- Model: opus (deep code reading)
- Effort: dosya LoC'ye göre (low <200, normal 200-600, high 600+)
- Agent: code-reviewer
- Skills: typescript-expert, documentation-writer, security-specialist
- Scope.directories: ["docs/audits/dynamic-split/"]
- Scope.filesRead: ["<source-file>", "src/**", "docs/**"]
- Scope.filesWrite: ["docs/audits/dynamic-split/<flat-path>.md"] (tek dosya whitelist)

## Brain Planning Instructions

- **Mode:** ai (AI Planner DIRECTIVES'i + file tree'yi yorumlasın)
- **dependency_pipeline_enabled:** false (manuel wave gate)
- **nervous_system.enabled:** false
- **max_workers:** 6
- **Provider:** claude

## GO/NO_GO

- **GO** = ≥400 audit task üretildi + her task scope ihlali yok + ≥85% DONE
- **NO_GO** = <100 task üretildi (mimari sınır kanıtı — Brain dinamik file-tree split yapamıyor)

## Beklenen Bulgular

1. **Hipotez A (en muhtemel):** AI Planner zero-config split → 3-5 task üretir, her task'a ~95 dosya bunch'lar
2. **Hipotez B:** AI Planner file tree (`fileTree.slice(0, 100)`) gördüğü için 100 task üretir (sınırlı, 479 değil)
3. **Hipotez C (sürpriz):** AI Planner aksi gerçekten 479'a yakın üretir — bu durumda mimari kapasitenin tahminden büyük olduğunu görürüz

Hipotez ne çıkarsa çıksın, **bulgu Sprint 185+ için spec input** — "Brain'e AI Planner.dynamicFileTreeSplit() özelliği gerekli mi" kararı bu testin sonucuna bağlı.

## Worker Contract (sprint başlarsa)

- Sadece atanan tek `docs/audits/dynamic-split/<flat-path>.md` dosyası yazılır
- src/, tests/, scripts/, .deckent/, .brain/, NERVOUS-TODO.md YASAK
- Output template Sprint 184 ilk denemedeki 9-section format
- Truncation YASAK — full audit content
- selfAssessment honest: DONE = 9 section eksiksiz + tek output dosyası yazıldı + src/ dokunulmadı
