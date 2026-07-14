# sinav2-devops
NL: cross-platform-e2e workflow dosyasına macos bacağı için node-gyp cache adımı ekle ve packed-install smoke süresini kısalt
planner: fable (170s) — 4 task

## macOS bacağına node-gyp cache adımı ve workflow-seviyesi smoke süre kısaltması
- intent: devops (conf=0.95)
- model:sonnet effort:normal
- filesWrite: .github/workflows/cross-platform-e2e.yml
- filesRead: .github/workflows/cross-platform-e2e.yml, package.json, package-lock.json, scripts/xplat-install-smoke.mjs
- goCriteria: macOS bacaklarında (e2e + packed-install) node-gyp cache adımı ci:rebuild-native'den önce ve `if: runner.os == 'macOS'` koşuluyla mevcut; cache key pa

## xplat-install-smoke script'inde platform-farkındalıklı süre optimizasyonu
- intent: implementation (conf=0.36)
- model:sonnet effort:normal
- filesWrite: scripts/xplat-install-smoke.mjs
- filesRead: scripts/xplat-install-smoke.mjs, .github/workflows/cross-platform-e2e.yml, package.json
- goCriteria: Windows timeout'u 360s'de değişmeden; macOS/Linux tavanı tek merkezi platform-tablosundan geliyor; --prefer-offline eklenmiş ve cache-miss'te davranış

## CI süre-bütçesi ve cache-stratejisi referans dokümantasyonu
- intent: documentation (conf=0.85)
- model:haiku effort:low
- filesWrite: docs/reference/ci-cross-platform-timing.md
- filesRead: .github/workflows/cross-platform-e2e.yml, scripts/xplat-install-smoke.mjs
- goCriteria: Doküman üç bölümü de içeriyor (süre-bütçesi haritası + cache stratejisi/invalidation + smoke süre-anatomisi); born-695 referansı doğru; üç platformun 

## Entegrasyon doğrulaması — workflow lint ve smoke gerçek-koşu kanıtı
- intent: documentation (conf=0.74)
- model:sonnet effort:normal
- filesWrite: docs/reference/ci-cross-platform-timing.md
- filesRead: .github/workflows/cross-platform-e2e.yml, scripts/xplat-install-smoke.mjs, docs/reference/ci-cross-platform-timing.md, package.json
- goCriteria: Workflow lint temiz; smoke script'i gerçek-binary lokal koşuda exit 0 ve wall-time önce/sonra ölçümüyle raporlanmış; doküman-kod sayısal tutarlılığı d
