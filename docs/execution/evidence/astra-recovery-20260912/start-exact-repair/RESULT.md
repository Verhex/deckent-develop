# START exact admission — gerçek canary sonucu

MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120. Owner start→do→diğer yüzeyler sırası.

Normal start artık planRunFlow→decideRunFlowPlan→createLiveExactSprintExecutor tüketir. Cost preview ile live plan ayrı üretilmez; scope/prompt/sandbox/timeout/connector seçenekleri taşınır. Cursor orphan düzeltmesi korunmuştur.

LOCAL: ilk test12FAIL eski adapter mockları; son77/77 PASS(exit0), tsc exit0. İlk build:all exit0. Gerçek start exit1. Son hata-detay düzeltmesinden sonra77/77 PASS; final build exit1 E_CLEAN_ACTIVE_EXECUTION_HOLD, clean gate dist silmedi. Son source/dist tam eşit değildir. MASTER validator: ilk metin boyutu/identity-continuity hataları düzeltildi, final --write exit0; OPEN korunur.

Canary flow9ff8a134-f592-4f6e-a769-a36dcedc999c / sprint752 / task752-001 / Docker attempt73b051f9-8b97-8359-8f15-aae828921b36 generation1. Önceki EXACT_DOCKER_TASK_PROJECTION_ADMISSION_REQUIRED aşıldı. Gerçek worker w-752-001 / sol ve skill-delivery doğdu. Worker NO_GO: heartbeat attemptId/backend host-bound değil; kaynak değişikliği ve verification yapılmadı. Worker bildirimi prompt üreticisindeki HOLD markerıyla uyumlu.

Host attempt settlement/archive dosyaları mevcut; doğrulanmış ürün başarı kanıtı değildir. Outer exact start FAILED: EXACT_RUNTIME_FAILED_AFTER_ADMISSION / EXACT_HANDOFF_TERMINAL_AUTHORITY_HOLD:752-001:exact-terminal-result-authority-mismatch. CLI ilk denemede yalnız failed yazdı; source artık reasonCode/detail koruyor.

Süre: hazırlık >6dk; toplam17:27 örneğinden sonra exit1 (~18dk); örnek RSS yaklaşık4.9GiB. timeout300000 toplam başlangıcı/host synchronous work süresini sınırlamadı. Final process yok; canonical activefalse/coordinatordead/ABORTED projection; .tasks task hâlâ EXECUTING. Build gate ayrıca RunFlow INVALID_EVENT_ENVELOPE görüyor. PID yokluğu runtime cleanup/terminal task closure değildir.

Kalan BLOCKS_CURRENT_DONE:
1. Exact Docker host attempt kimliğini prompt/heartbeat authorityye seal/digest disipliniyle bağla; compile-time HOLD'u sahte kimlikle değiştirme.
2. scheduler-effects read terminal authority: accepted result ile terminal result karşılaştırmasının gerçek mismatch alanını kanıtla; guardı kaldırma.
3. RunFlow projection envelope ve task terminal-state reconciliation; canonical recovery/settlement üzerinden kapat.
4. Başlangıç/terminal doğrulama maliyeti ve timeout/event-loop responsive sınırı.

Yeni start/do yok; cleanup/kill/auth/commit/push yok. Formal XVerify ve start surface DONE yok. Sonraki canary ancak değişen kanıt + doğru build sonrası.
