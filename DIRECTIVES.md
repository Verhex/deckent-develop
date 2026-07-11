# DIRECTIVES — SPRINT-409: REPL-KALİTE + ROUTING-TEK-OTORİTE (born-527 · born-528 · 641-spawner)

## Goal
Terminal-deneyim kalitesi (Alperen'in ana-yüzeyi): input-bar bug-kümesi + denied-tool görünürlüğü +
routing çifte-otoritesinin tekleşmesi.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build dahil)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: INPUT-BAR-FIXES — born-527: Home/End algılama + paste-history + keylog platform-farkındalığı
- Model: sonnet
- Files: src/cli/repl/input-bar.tsx, tests/cli/input-bar-527.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
Üç kalem (correctness-review bulgusu): (1) Home/End tuş-algılama Ink'in HİÇ doldurmadığı Key-property'lerini
kontrol ediyor → çalışmıyor; Ink'in gerçekten doldurduğu property'lere (ya da raw-sequence eşlemesine —
mevcut key→aksiyon tablosu desenine uy) geçir. (2) Çok-satırlı/sonu-newline'lı paste yolu history'ye BOŞ
girdi itiyor → guard (boş/whitespace-only history-push yok; mevcut redaksiyon+cap korunur). (3) Debug-keylog
yolu hardcoded /tmp → non-POSIX'te sessiz no-op (Yasa #2); platform-farkındalı (os.tmpdir()) ya da
config-driven yap; kapalıyken sıfır-IO. Üçü de RED-önce: Ink-key fixture'larıyla bugünkü kırık davranış
kanıtlanır (ink-testing-library deseni mevcut testlerde var — reuse).
### goNogo
- goCriteria: 3 kalem RED→GREEN (Home/End imleç-hareketi; boş-history-push yok; keylog os.tmpdir/config + kapalı=0-IO); cursor-model/input-history mevcut testleri yeşil; NO_COLOR/i18n etkilenmez.
- nogo: key-tablosu yeniden-yazılırsa (surgical-ihlal) NO_GO.

## Task 2: DENIED-TOOL-HONESTY — born-528: confirm-red'i toolSink dürüst-çıktı yolundan geçir
- Model: sonnet
- Files: src/cli/repl/run.tsx, tests/cli/denied-tool-honesty.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
SORUN: run.tsx CLI-bridge tool'unda kullanıcı confirm'i REDDEDİNCE erken-return toolSink'i atlıyor →
reddedilen çağrı transcript'ten SESSİZCE kayboluyor (kullanıcı ne olduğunu göremiyor; 633'ün
kardeş-dürüstlük vakası). FIX: denial erken-return'ü diğer her tool-sonucunun geçtiği toolSink
honest-outcome render yolundan geçir — görünür `denied` işaretli kayıt (633'te eklenen status-'denied'
sınıfıyla TUTARLI etiket; nested-yol zaten dürüst — dış-yol da aynı sözlüğü kullansın). RED-önce:
bugün denial'da toolSink'e hiçbir kaydın düşmediği fixture-kanıtı. Model-görünürlüğü: tool-result
metni de "user denied" bilgisini taşısın (yeniden-deneme yağmuruna karşı 630-deny-cache zaten var —
bozma).
### goNogo
- goCriteria: RED-kanıt; denial → toolSink'te denied-işaretli kayıt + model'e dürüst tool-result; onaylı-yol byte-aynı (pin); run.tsx/toolSink importer testleri (calltool-exec-wire + nested-dispatch-honesty dahil) yeşil.
- nogo: onay-akışının davranışı değişirse NO_GO.

## Task 3: ROUTING-TEK-OTORİTE — 641-spawner: spawn-time agent-override'ı plan-time otoriteyle birleştir
- Model: sonnet | Agent: bug-fixer
- Files: src/orchestra/sprint-spawner.ts, tests/orchestra/spawner-single-authority.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
641-kalanı: `sprint-spawner.ts:1260` civarı `if (routing.agent !== 'generic') task.assignedAgent = routing.agent;`
— spawn-anında İKİNCİ bir routing ataması. Plan-time routing artık CANLI (641-dirilişi) olduğundan bu
yol: (a) plan-time atamayı sessizce EZEBİLİR (çifte-otorite çatışması), (b) journal'SIZ (görünmez-karar,
622-kontratının ihlali). FIX (tek-otorite): task.assignedAgent zaten anlamlı (generic-değil VE boş-değil)
ise spawn-time yeniden-atama YAPILMAZ (plan-time otorite kazanır); yalnız assignedAgent yok/generic'se
spawn-time fallback devreye girer VE bu karar routing-decision-journal'a `source:'spawn-fallback'`
işaretli yazılır (routingDecisionJournalPath/append mevcut — reuse; sprintId/taskId spawn-bağlamında
mevcut). Önce bu spawn-yolunun NE ZAMAN tetiklendiğini analiz et (hangi akış: respawn? fix-task? normal?)
ve notes'a yaz — davranış-koruma sınırını ona göre kur (fix-task model-mirası 476-kuralı BOZULMAZ).
RED-önce: plan-time atamalı task fixture'ında spawn-yolunun bugün atamayı ezdiğini (ya da ezebildiğini)
kanıtla.
### goNogo
- goCriteria: RED-kanıt + tetiklenme-analizi notes'ta; plan-time atama artık ezilmiyor (pin); spawn-fallback journal'lı (source-etiketli, fail-soft); 476 fix-task-mirası + spawner importer testleri yeşil.
- nogo: spawn-fallback tamamen kaldırılırsa (assignedAgent'sız task agent'sız kalır) NO_GO.
