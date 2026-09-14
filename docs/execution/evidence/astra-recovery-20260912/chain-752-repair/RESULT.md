# 752 chain repair — canlı doğrulama sürüyor

MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120 STATE-RETENTION-001.
DOGFOOD_MODE=ON, DOGFOOD_HEALTH=DEGRADED; owner-authorized R1-752-CHAIN-20260913.

Onarımlar:
- Terminal authority karşılaştırmaları JSON property sırasından bağımsız; mevcut shape/identity/digest kontrolleri korunur.
- Scheduler V2 accepted/settled sonuç eşitliği legacy write serializer kullanmaz. Gerçek752 `notes` satır sonu eski serializer'da invalid-value üretti. İki immutable sonuç içerikçe aynı. Deep strict equality tüm alanları ve türleri karşılaştırır; satır sonunu silmez veya normalleştirmez.
- Docker PID1, execution commit ve doğrulanmış provider-start authorization sonrasında heartbeat attempt/backend kimliğini bağlar; provider spawn öncesi prompt yazar. Admission öncesi uydurma kimlik yok.
- Build clean guard narrative intentSummary için canonical RunFlow whitespace sözleşmesiyle uyumlu; ID/receipt/liveness kontrolleri korunur.

Kanıt:
- JSON order regression RED exit1 → GREEN exit0.
- Multiline scheduler regression RED exit1 → GREEN; beş dosya203/203 exit0. Ek scheduler21/21 exit0. Eski no-mint fixture provider alanı eksikti; fixture'a açık provider eklendi, ürün routing değişmedi.
- build:all exit0; final tsc build içinde exit0. git diff --check exit0.
- Canonical recover752 dry-run exit0; force exit0. İki task artifaktının arşiv hash'leri MATCH, kaynaklar artık yok. Checkpoint korunur; başarısız sonuç başarıya çevrilmez. Clean artık ALLOW.
- Recovery geniş self-audit GATE_FAILURE. Owner bunu bilinen genel gate/metrik tasarımı olarak ayrı tuttu; bu pakette gate değişmedi, repo-green iddiası yok.
- Gerçek752 salt-okunur Store→accepted→terminal reader: exit0, current, guard=true, sameAcceptedResult=true, verdict=NO_GO. 752-reread.log; read probe kopyası aynı disk zincirini sorgular, receipt üretmez.

Yeni normal start canary sprint753 başladı. Log /tmp/deckent-chain-start-canary.log; worker/effect/terminal proof bekleniyor. Bu rapor ürün DONE veya formal XVerify değildir. Başlangıç/history doğrulama maliyeti ve operation-level timeout U02/U03 açık. start doğrulanmadan do yüzeyine geçilmeyecek.

Updated UTC: 2026-09-13T10:17:05.083298+00:00

## 753 canlı sonuç ve takip onarımı

Gerçek worker71/71 exit0; iki izinli dosya effect landing üzerinden main'e girdi (+27/-41). Altı task chain aşaması var; evaluation verdict DONE. Outer CLI exit1: aynı exact-terminal-result-authority-mismatch; canonical ABORTED/non-resumable. Yeni canary tekrar edilmedi. 753 cold accepted→terminal read exit0,current,guard=true,DONE.

Yeni bulgu: canlı backend snapshotExactPlainData accepted result record'larını recursively null-prototype yapıyor; terminal parser normal record döndürüyor. Eklenen deepStrictEqual içerikçe aynı iki temsil için false üretiyor. Production-like fixture null prototype eklendi: RED exit1. Scheduler backend ile aynı canonicalJson eşitliğine geçti; multiline korunur, tam alan/değer eşitliği ve authority gate'leri kalır. Üç dosya61/61 exit0. Son build bu follow-up düzeltmesini henüz içermiyor; dirty task projection nedeniyle canonical recovery önce gerekli.

Kaynak verisi resource-753.json ve observations.jsonl içinde. 4.04GiB erken peak sonrası coordinator en az5.78GiB RSS/HWM gözlendi. WorkerCPU/RAM kayıt boşluğu: monitor enabled5s, legacy prefix deckent-w-, exact deckent-x- dışlanıyor. Eski resource-log60569 satır; son2026-08-29,753 eşleşme0. Prefix-only rename lifecycle/recovery ve taskId eşleştirmesini etkiler; ileriki monitoring paketi doğrulanmış registry/label tabanlı olmalı. Canlı ayar/adlandırma değiştirilmedi.
2026-09-13T10:42:05.882154+00:00
