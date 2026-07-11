# DIRECTIVES — SPRINT-408: TERM-DEV-LOOP HALKA-1 + GOVERNANCE-KUYRUK (642 bg-turns · 644 build-ihlali · 639-QoL)

## Goal
Alperen'in terminal-hedefi (511) için en kritik kopuk-halka: detached-run bitişi REPL'e yeni-turn
olarak düşsün (642). Yanına: sprint-içi izinsiz-build ihlalinin audit+önlemi (644) ve trace-QoL (639-3).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build dahil)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: BG-TURNS-PRODUCER — born-642 (P0): detached-run bitişi → REPL yeni-turn (ChatTurnQueue üreticisi)
- Model: sonnet
- Files: src/cli/repl/run.tsx, src/cli/repl/chat-turn-queue.ts, src/cli/repl/run-completion-watch.ts, tests/cli/bg-turns-producer.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
GAP (gap-rapor 2026-07-11, halka-7): ChatTurnQueue kurulur + her turn-end'de drain edilir ama HEP BOŞ —
run.tsx `registerBgEventSink`/`bgQueue`'yu ReplApp'e/engine'e GEÇİRMİYOR; `repl_surface.bg_turns` flag'i
rezerve ama HİÇ okunmuyor; detached-run bitişini event'e çeviren watcher YOK → kullanıcı detached-sprint
başlatıyor, sonuç REPL'e asla dönmüyor (511'in "sonucu değerlendir" halkası ölü). FIX (flag'li,
default-off — dormant kuralı): (1) YENİ `src/cli/repl/run-completion-watch.ts`: `.deckent/runtime/jobs/`
dizinini izler (mevcut job-json'ları: status COMPLETE/FAILED damgalı — sprint-401'de doğrulandı);
watch+HER-ZAMAN-poll deseni (approval-store-watch.ts 358-001 EMSAL — fs.watch güvenilmez, unref'd
poll şart) + dedup (aynı jobId bir kez) + dispose; bitişte kompakt `ChatTurnBgEvent` üretir (jobId,
sprintId, sonuç-özeti: N/M task + verdict-dağılımı — job-json metrics'ten). (2) run.tsx: flag
`repl_surface.bg_turns === true` iken watcher'ı kur, event'leri MEVCUT ChatTurnQueue'ya enqueueBg ile
besle (mid-turn-enjekte-YOK kontratı zaten kuyrukta — bozma) + exit'te dispose. (3) bg_turns flag'inin
resolver-passthrough'unu DOĞRULA (repl_surface bloğu zaten geçiyor — alan-seviyesi kontrol; eksikse
üçlüyü tamamla). RED-önce: bugün enqueueBg'nin prod'da 0-çağıranı olduğu (grep-kanıt) + fixture'da
watcher-yokken event düşmediği. Kullanıcı-görünür metinler: turn-içeriği i18n-uyumlu üretilsin
(getMessage-anahtarları en+tr — cli/ katmanındasın, serbest).
### goNogo
- goCriteria: RED-kanıt; flag-off byte-aynı (watcher hiç kurulmaz — pin); flag-on: fixture job-COMPLETE → kuyruğa event → turn-end drain'inde görünür (hermetik tmpdir; fake-timer poll); dedup+dispose testli; composition-pin (run.tsx kurulum-sitesi + enqueueBg besleme-sitesi); repl importer testleri yeşil.
- nogo: watcher ref'li interval bırakırsa (MOAT-2 linger) NO_GO; mid-turn-enjekte kontratı bozulursa NO_GO.

## Task 2: BUILD-VIOLATION-GUARD — born-644 (P1): sprint-içi izinsiz-build audit + önleme
- Model: sonnet | Agent: bug-fixer
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/build-violation-guard.test.ts, docs/analysis/build-violation-audit-2026-07-11.md
- Scope: src/orchestra/, tests/orchestra/, docs/analysis/
- Dependencies: none
### Description
CANLI-VAKA (2026-07-11): sprint-403 koşarken host-dist 08:43'te yeniden derlendi — şüphe: bir worker
container'da `npm run build` koştu (volume-mount → host dist'i ezer; ESM-cache zehirlenmesi + kural-ihlali).
İKİ İŞ: (1) AUDIT: sprint-403/404 arşiv-loglarında (.brain/archive/sprints/sprint-40{3,4}-tasks/*.log —
stream-JSONL; tool_use Bash içeriklerinde) `npm run build|tsc -b|build:all` ara; bulguyu (hangi task,
hangi komut, timestamp) `docs/analysis/build-violation-audit-2026-07-11.md`'ye dürüst yaz (bulunamazsa
"kanıt yok — alternatif hipotezler" bölümü: ör. hangi süreçler dist'e yazabilir). (2) ÖNLEME
(NPM-ADVISORY emsali, born-454 — fiziksel-engel DEĞİL advisory+görünürlük): worker god-prompt'una
statik BUILD-YASAK bloğu ZATEN var mı kontrol et ("build YASAK" DIRECTIVES'ten geliyor — prompt'ta
kalıcı değil); spawn-backend-docker wrapper'ına dist-mtime nöbetçisi ekle: container-exit'te host
`dist/` mtime'ı spawn-öncesi kayıtla karşılaştır → değiştiyse `.result`'a `distMutated: true` işareti
+ stderr loud-warn (Brain'e görünür; bloke ETMEZ — advisory). RED-önce: fixture'da dist-mutasyonunun
bugün hiçbir iz bırakmadığı.
### goNogo
- goCriteria: audit-raporu dürüst (bulgu ya da kanıt-yok+hipotezler); dist-mtime nöbetçisi testli (mutasyon → distMutated işareti + warn; mutasyon-yok → işaret yok); wrapper-testleri + docker-backend importer testleri yeşil.
- nogo: nöbetçi worker'ı BLOKE ederse (advisory-kuralı ihlali) NO_GO; audit yalnız "bulunamadı" deyip hipotezsiz bırakırsa NO_GO.

## Task 3: TRACE-QOL — born-639(3): worker-logs ham-tail'e insan-okur LogEvent render
- Model: sonnet
- Files: src/api/worker-logs.ts, tests/api/worker-logs-render.test.ts
- Scope: src/api/, tests/api/
- Dependencies: none
### Description
402-002 sonrası claude+docker `.log` artık LogEvent-JSONL — `worker-logs.ts` ham-tail görünümü insan
için okunaksız JSON-satırları döndürüyor (dashboard raw-log paneli). FIX: worker-logs'a opsiyonel
render-katmanı: satır LogEvent-parse olursa `[type] content-özeti` biçiminde insan-okur satıra çevir
(tool_use → araç-adı+kısa-arg; text → içerik; usage/lifecycle → kompakt); parse-olmayan satır AYNEN
geçer (codex/gemini eski-loglar + kısmi-satırlar — veri-kaybı yok); API-şekli geriye-uyum: mevcut
tüketici (dashboard SSE ayrı — output-stream.ts DOKUNMA) ham-metni bekliyorsa yeni davranış
query-param/opsiyon arkasında (`?render=human` gibi mevcut param-desenine uy). RED-önce: bugünkü
çıktının ham-JSONL olduğu fixture-kanıtı.
### goNogo
- goCriteria: RED-kanıt; render insan-okur + parse-olmayan passthrough (iki-yönlü test); geriye-uyum (opsiyonsuz istek eski-davranış — pin); api importer testleri yeşil.
- nogo: output-stream.ts'e dokunursa NO_GO; ham-veri kaybolursa NO_GO.
