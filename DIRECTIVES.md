# DIRECTIVES — PUBLISH-P1P2: MISSION-VERDICT DÜRÜSTLÜĞÜ + DASHBOARD HIZLI-KAZANÇ (3 task)

## Goal
Publish-convergence ilk-dalga: mission-verdict eşlemesi dürüstleşir (DEBT≠fail), dashboard
etkileşim-hissini bozan iki yapısal sorun (eager-bundle + polling-fırtınası) kapanır.
HER task canlı-smoke kanıtlı. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- DISTINCT-FILE: sprint-planner/result-evaluator/sprint-phases/result-collector/sprint-controller/
  server.ts/config.ts KAPALI.
- Hermetik test; i18n getMessage (dashboard: i18n/en+tr.ts); dashboard EMOJI YASAK (lucide).
- Worker `notes` TEK STRING. Honest self-assessment.

## Task 1: MISSION-VERDICT-FIX — dürüst-DEBT fail sayılmaz
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-engine-wire.ts, src/orchestra/autonomous/mission-store/mission-types.ts, src/dashboard/src/pages/MissionsPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, tests/orchestra/mission-verdict-honesty.test.ts
- Scope: src/orchestra/autonomous/, src/dashboard/, src/api/, tests/
- Dependencies: none
### Description
Canlı-bug (mission-w1): madde-2 worker'ı DÜRÜST `GO_WITH_TECH_DEBT` döndürdü ama mission "failed
1/2" göründü. ÖNCE eşlemeyi koddan bul: runV2Engine deps.runTask adapter'ının ResultLike.ok'u
selfAssessment'tan nasıl türettiğini izle (autonomous.ts runV2Engine çağrı-bloğu ~:506-540 +
mission-engine-wire). FIX: ok = (selfAssessment !== 'NO_GO') — DEBT başarı sayılır, reason'a
debt-notu taşınır; WorkItem'a settle-detayı (done|debt|failed üçlü) eklenir (tip + store-migrasyonu
GEREKMEZse alan opsiyonel). MissionsPage: üçlü-durumu doğru renk/etiketle gösterir (debt=amber,
i18n en/tr). mission-w1'in mevcut kaydı yeniden-yazılmaz (tarihsel).
### goNogo
- goCriteria: DONE/DEBT/NO_GO üç-yol eşleme-testli (fake-runTask); MissionsPage render-testi
  (üç-durum + emoji-grep=0); mevcut mission-testleri kırılmadı; `tsc`+dashboard-test yeşil.
- nogo: mission-store şema-kırılması; tarihsel-kayıt değiştirme.

## Task 2: DASH-LAZY-LOAD — route-bazlı code-splitting
- Model: sonnet
- Effort: high
- Skills: frontend-design, typescript-expert
- Files: src/dashboard/src/App.tsx, tests/dashboard/lazy-routes.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: none
### Description
App.tsx:6-26 17 sayfayı eager-import ediyor (Recharts+xterm dahil tek başlangıç-bundle).
React.lazy()+Suspense'e çevir: "/" (Dashboard) + ChatPage eager KALIR (ilk-boya kritik),
kalan sayfalar lazy; Suspense-fallback mevcut SkeletonCard desenini kullanır (yeni spinner icat
etme). cards-mounted/nav-render/route-sidebar testleri KIRILMAMALI (App'in route-ağacı aynı).
Kanıt: vite-build chunk-listesi notes'a (ana-chunk küçülmesi sayıyla).
### goNogo
- goCriteria: lazy-route render-testi (Suspense-fallback + sayfa-yüklenmesi); mevcut dashboard-suite
  TAM yeşil (97 dosya); build-chunk kanıtı notes'ta; `tsc` temiz.
- nogo: sayfa-davranış değişikliği; nav-items.ts.

## Task 3: DASH-POLLING-DEDUP — istek-tekilleştirme katmanı
- Model: sonnet
- Effort: high
- Skills: typescript-expert, frontend-design
- Files: src/dashboard/src/lib/use-live-data.ts, src/dashboard/src/lib/request-cache.ts, tests/dashboard/request-dedup.test.ts
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: none
### Description
Sayfa-başına bağımsız polling (2-5sn) aynı-URL'e eşzamanlı-mükerrer GET fırtınası yaratıyor.
Paylaşılan in-flight istek-önbelleği: aynı-URL'e uçuşta-istek varken yeni çağrı AYNI promise'i
paylaşır (SWR-tarzı dedup; kısa TTL yok — yalnız in-flight paylaşımı + son-değer cache'i
mevcut stale-while-revalidate davranışını korur). use-live-data + useApi tek-chokepoint'ten geçer.
### goNogo
- goCriteria: eşzamanlı-çift-çağrı tek-fetch testli (fake-fetch sayaç); SWR-davranışı korunur
  (mevcut use-live-data testleri yeşil); `tsc`+dashboard-suite yeşil.
- nogo: SSE-yoluna dokunma; API-şekli değişikliği.
