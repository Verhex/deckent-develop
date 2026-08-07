# Soğuk-Start Smoke — 2026-08-07 (owner-onaylı build sonrası)

> Amaç: ilk dogfood'un NEREDE patlayacağını tahminle değil ölçümle bulmak.
> Ortam: `npm run build` (Alperen onayı) sonrası paketlenmiş `dist/cli/entry.js`,
> atılabilir proje + izole `DECKENT_HOME` (host global config'e sıfır temas).
> Maliyet: 1 AI planner çağrısı (sprint-1); kalan her basamak provider'sız.

## Sonuç tek cümlede

API/authority katmanı binary'ye kadar sağlam ve **dürüst**; kırılma tam
öngörülen yerde — sprint runtime'ın EXECUTE/spawn bölgesinde. "Büyük patlama"
olmuyor çünkü governance tutuyor (typed HOLD, exit=1, sahte DONE settle yok,
maliyet kaçağı yok); ama onaylı bir planı **gerçekten yürütmenin yolu** soğuk
startta yok.

## Merdiven (ölçülen)

| # | Basamak | Sonuç |
|---|---------|-------|
| 1 | `--version` | ✅ |
| 2 | `init` TTY'siz | ✅ typed hata + `--yes` önerisi, exit=1 |
| 2b | `init --yes` | ✅ READY — ⚠️ doctor'la çelişiyor (aşağıda B6) |
| 3 | `doctor` | ✅ dürüst NOT READY: keyring yok → run `keyring_unavailable` HOLD olur — ⚠️ exit=0 |
| 3b | `provider-authority keyring init` | ✅ izole DECKENT_HOME'a yazdı |
| 4 | `analyze` | ✅ boş projede dürüst "unknown" |
| 5 | `plan --structured` (git YOK) | 🔴 scope gate **mesajsız FAIL** (B5) |
| 5c | git repo ile plan | ✅ gate dolu mesaj + `--force-scope` çaresi |
| 5d | `plan --structured --yes --force-scope` | ✅ onay + flowId + planDigest + 3 task dosyası |
| 6 | binary `serve` + gerçek ws | ✅ strict AÇIK → 4403, 0 çerçeve; KAPALI → açık; Bearer `/api/status=200` (T4a binary kanıtı) |
| 7 | `start --sandbox` | 🔴 SPAWN'da typed blok: ExecutionBudget yok (B4) — ama fail-closed ve provider-işi-öncesi ✅ |
| 8 | `start` (local, structured) | 🔴 2m35s "boş" sprint: 0 worker, 0 result, banner "Complete" → terminal authority **TERMINAL_EVIDENCE_HOLD** ile yakaladı, exit=1 (B2) |
| 9 | `start --flow-id … --plan-digest … --dry-run` (run_flow_v2=true) | 🔴 "requires a complete detached-child capability", çare yok (B1) |

## Bulgular (şiddet sırasıyla)

### B1 — Onaylı plan soğuk startta YÜRÜTÜLEMEZ (plan→start el-sıkışması)
Çıplak `start`, store'da `APPROVAL_GRANTED` flow dururken uyarısız **AI ile
yeniden planlıyor** (provider parası) ve farklı bir plan üretiyor (2 task/haiku
vs onaylı 3 task/sonnet). CAS-doğrulamalı tüketim yolu (426-001) var ama:
3 el bayrağı + `terminal.run_flow_v2=true` opt-in'i gerekiyor ve o zaman da
"detached-child capability" hatasıyla düşüyor — provision yolu yazmıyor.
**Dogfood-blocker: DOGFOOD-MANDATORY akışının tam ortası.**

### B2 — EXECUTE içi boş dönüyor; "erken zafer" banner'ı basılıyor
8 planSprint döngüsü (~60-90sn arayla; MODEL-GUARD → temp-skill →
routing-escalation), metriklerde tek bir worker-spawn olayı yok
(`wave.start:2, skill.prompt_generated:3`, başka hiçbir şey), heartbeat yok,
task'lar `PENDING/agent:None`, 0 `.result`. Buna rağmen özet "Sprint #1
Complete / All tasks complete" basıyor. Terminal authority kanıtsız settle'ı
**yakalıyor** (FINALIZER_FAILED:TERMINAL_EVIDENCE_HOLD, exit=1) — governance ✅,
yürütme 🔴, banner dürüstlüğü 🔴. Routing escalation'ları hep tie@1.00 →
Brain'e; Brain tie-break'inin neden hiç spawn üretmediği kök-neden adayı.

### B3 — İki store layout uyumsuzluğu CANLIDA yakalandı
Sprint-1'in terk edilmiş AI planının task dosyaları (2 task, haiku) `.tasks/`ta
kaldı; sonraki sprint 3 task'a inanırken diskteki dosyalar bayat. Satır 4020
code-truth notu ("iki store layout, registry/scheduler yalnız flow.id ile key
ediyor") ölçümle doğrulandı. Ayrıca tier-guard'ın haiku→sonnet yükseltmesi
yalnız bellekte — dosyaya yansımıyor.

### B4 — İki bütçe sistemi birbirine bağlı değil (raporlar-ama-taşınmaz, 4. örnek)
Cost gate `cost_limits.sprint_max_usd=$5.00`'ı okuyup GEÇTİ diyor; sandbox
executor'ın istediği `ExecutionBudget` nesnesini kimse o bütçeden türetmiyor →
`assertExecutionBudgetShape` fail-closed düşüyor (`live-execution-budget.ts:267`).
Hint metni yanlış: "check provider credentials and system resources".

### B5 — Scope gate git-olmayan projede MESAJSIZ fail
`run-flow-plan-service.ts` ~688: `scopeInput.status !== 'available'` dalı
`fail` atarken mesaj üretmiyor; kullanıcı tek satır "Scope gate: FAIL" görüyor.
`init` git repo kurmuyor → her soğuk-start kullanıcısı bu tuzağa düşer.
Git varken aynı gate örnek-kalite mesaj veriyor (yollar + neden + çare).

### B6 — init READY / doctor NOT READY çelişkisi
`init --yes`: "All usage blockers are clear". Hemen ardından `doctor`: keyring
yok → her run HOLD. İki hazırlık kararı farklı kontrol listesi kullanıyor.

### B7 — CLI çıktıktan sonra ~15 dk yaşayan artık süreç
`start` exit=1 ile döndükten sonra planSprint döngüsü 15:17'ye kadar sürdü
(son kayıt `runSprint:activeResourcesAtExit`). Kaynak sızıntısı sınıfı.

### Küçükler
`serve --port 0` desteklenmiyor (typed hata var) · `doctor` NOT READY'de
exit=0 · structured parser goal satırını task olarak duplike ediyor (001-001).

## Çalışan governance (hakkını teslim)
Typed spawn admission (provider-işi-ÖNCESİ blok) · terminal evidence hold ·
cost gate + subscription-quota dürüstlüğü ("USD $0 is not a quota-availability
verdict") · MODEL-GUARD tier yükseltmesi · scope gate (git'li) · CAS digest
zinciri · keyring fail-closed. Patlama senaryosunu bunlar engelliyor.

---

## Ek: Temiz-oda kök-neden koşusu (aynı gün, ~15:32)

Enstrüman: taze proje + `DECKENT_OFFLINE=1` + 2sn'lik süreç-ağacı izleyici + 4dk sınır.

### Ölçülen kök nedenler

**KN1 — Routing tie-judge gizli AI çağrısı (B2'nin "boşluk" gizemi).**
Süreç-ağacı suçüstü: `claude -p "You are a routing tie-judge…"`. Routing V3, soğuk
projede sinyal kümesi BOŞ (`over []`) olduğundan adayları hep @1.00 eşitliyor ve
her task için gerçek bir AI tie-judge çağrısı yapıyor (~60-90sn + provider parası).
`brain_planning=structured` planner-AI'ı atlıyor ama routing-AI'ı atlamıyor.
Smoke'taki "8 döngü" = 2 planSprint (bare start önce cost-estimate için, sonra
runSprint içinde İKİNCİ kez planlıyor) × ~3'er tie-judge çağrısı.

**KN2 — Executor çözümü + bütçe kopukluğu (B2 = B4).**
Temiz odada sandbox'sız spawn executor'ı "docker"a çözüldü → remote sınıf →
`ExecutionBudget` şart (`task.budget` üzerinden gelir; kimse effective config'in
`cost_limits`'inden türetmiyor) → `assertExecutionBudgetShape` fail-closed →
`Spawn phase failed after retry` typed hata. Soğuk startta spawn HİÇBİR yoldan
başarılı olamıyor.

**KN3 — Bayat projeksiyon = boş "Complete" (B3'ün mekanizması).**
Smoke'taki sprint-3'te bayat 2-task dosyaları spawn'ı boş-başarıya çevirdi →
EXECUTE worker'sız aktı → "All tasks complete" banner'ı → terminal authority
hold. Temiz odada (bayat dosya yok) aynı koşu KN2'nin typed hatasını bastı —
mekanizma doğrulandı.

### Düzeltmeler (rapor dürüstlüğü)

- **B7 GERİ ÇEKİLDİ:** "CLI-sonrası 15dk yaşayan süreç" bulgusu iki ölçüm
  hatamın bileşimiydi: ERRORS.md okumalarım `head` pencereleriydi ve 15:09+
  kayıtlarının yazarı benim CAS dry-run probumdu (invocations.db birincil
  kanıt). Smoke projesi paylaşılan mutable alan — problarım forensiği kirletti;
  temiz-oda koşusunun varlık sebebi bu.
- **Banner süresi:** "Sprint #1 Complete 2m 35s" gerçek ~7-18dk koşuları
  raporluyor — süre ölçümü ayrı küçük bulgu.
