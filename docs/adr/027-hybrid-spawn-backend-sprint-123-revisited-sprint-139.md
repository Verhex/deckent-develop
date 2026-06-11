# ADR-027: Hybrid Spawn Backend (Sprint 123, Revisited Sprint 139)

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Hibrit backend desteği **kalıcı olarak reddedildi** (Option B: reject). Mevcut tek-backend modeli yeterli ve Sprint 139 backend parity çalışması bu kararı güçlendirdi. `SpawnBackendFactory` docker → tmux → subprocess fallback zinciriyle TEK bir backend seçer; hibrit mod (worker Docker'da, auditor subprocess olarak) implementasyona alınmayacak.

**Context (Sprint 123 — Özgün):** Auditor scan loop `sprint-controller.ts` içinde in-process olarak çalışır — tmux/subprocess/docker backend'lerinden tamamen bağımsızdır. Worker'lar backend üzerinden spawn edilirken auditor dosya sistemi üzerinden `.hb` heartbeat dosyalarını okur. Auditor'ın backend seçimiyle hiçbir doğrudan bağlantısı olmadığından, hibrit mod için ayrı bir mekanizma gerekmez. Worker isolation Docker container'larıyla sağlanmaktadır.

**Sprint 139 Revisit Analizi:**

Sprint 139'da 3 backend'in (Docker, subprocess, tmux) E2E test coverage'ı tamamlandı ve aşağıdaki bulgular elde edildi:

1. **ADR-035 Event Stream (Sprint 138) hibrit gereksinimini ortadan kaldırıyor:** `.deckent/sprint-NNN-events.jsonl` append-only event stream tüm backend'lerin üzerinde ortak iletişim kanalı sağlıyor. Worker hangi backend'de çalışırsa çalışsın, auditor event stream'den okuyarak bağımsız doğrulama yapabiliyor. "Auditor'ın ayrı process olarak çalışması" senaryosu event stream sayesinde zaten çözüldü.

2. **3-backend parity (Sprint 139 Task 17-19):** Docker, subprocess ve tmux backend'lerinin her biri kendi E2E test suite'ine sahip. Her backend `SpawnBackend` arayüzünü tam olarak implement ediyor. Hybrid senaryosu için gereken "farklı backend'lerin birbirini tamamlaması" ihtiyacı yok — her backend zaten tam özellikli.

3. **Hibrit senaryosunun anlamsızlığı:** "Worker Docker'da, auditor subprocess olarak" senaryosu ADR-035 sonrasında gereksiz:
   - Auditor zaten in-process (sprint-controller içinde)
   - Event stream file-based olduğundan tüm backend'ler transparently mesaj üretiyor
   - Docker worker'lar shared `.tasks/` volume üzerinden heartbeat ve event yazıyor

4. **Complexity cost vs benefit:** Hibrit backend implementasyonu `SpawnBackend` interface'ini genişletmeyi, multi-backend lifecycle yönetimi eklemeyi ve `SpawnBackendFactory` sinyal koordinasyonu yazmayı gerektirir — zero user-visible benefit karşılığında ~400 LoC complexity.

5. **Product vision uyumu (ADR-033):** "Kur-çalıştır" prensibi konfigürasyon complexity'sini minimumda tutar. Kullanıcının "hangi backend'i ne için kullanayım?" sorusuna cevap vermek zorunda kalması ürün deneyimini kırar.

**Karar Rationale (Alperen'e Sunulan):**

| Seçenek | Değerlendirme | Karar |
|---------|--------------|-------|
| **Option A:** Sprint 140'ta hybrid implement et | ADR-035 event stream zaten bu ihtiyacı karşılıyor; ek complexity getirir, net fayda yok | **Reddedildi** |
| **Option B:** Kalıcı olarak reddet (tek backend at a time) | Mevcut model çalışıyor, test coverage tam, event stream entegrasyonu sorunsuz | **Kabul edildi** |
| **Option C:** Yeniden ertele | 3. deferred → kararsızlık işareti; net karar verilmeli | **Reddedildi** |

**Consequence(s):**
- Hibrit backend implementasyonu yapılmayacak — kalıcı karar.
- `SpawnBackendFactory` tek-backend-seçer semantiğini korur.
- Event stream (ADR-035) hibrit senaryosunun gerçek ihtiyacını (cross-backend observability) doldurdu.
- Sprint 140'ta backend ile ilgili çalışma olursa: mevcut 3 backend'in stabilizasyonu ve edge case fix'i üzerine yoğunlaşılır, hibrit mod değil.
- Distributed sprint execution ihtiyacı doğarsa (Sprint 145+), bu ADR revisit edilmeli ve event stream üzerine inşa edilen lightweight coordinator pattern değerlendirilmeli.

**References:**
- Sprint 123 özgün deferred kararı
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream hibrit ihtiyacı ortadan kaldırdı
- Sprint 139 Task 17: Docker E2E tests
- Sprint 139 Task 18: Tmux E2E tests
- Sprint 139 Task 19: Subprocess E2E tests (DONE — 33 test, 1.2s)
- ADR-033: Product Vision — complexity minimization principle

---

## Amendment — Sprint 281 (2026-06-11, Alperen ADR-review): kapsam ayrımı + ADR-089 supersession

ADR-027'nin orijinal "hibrit backend KALICI reddedildi" kararı **dar yorumda hâlâ geçerli, geniş yorumda superseded** — ayırmak gerekiyor:

**✅ Hâlâ geçerli (rol-split reddi):** "Worker Docker'da + auditor AYRI subprocess olarak" senaryosu reddedilmeye devam eder. Auditor in-process kalır; cross-backend gözlemlenebilirlik event-stream (ADR-035) ile çözülür. Rol-bazlı backend-mixing'e gerek yok.

**🔄 Superseded ("sprint başına tek backend" iddiası → ADR-089):** ADR-027 yazıldığında SpawnBackendFactory sprint için TEK backend seçiyordu. Bugün:
- **Per-task backend override CANLI:** `sprint-spawner.ts` `effectiveBackend = task.backend && task.backend !== config.spawn_backend ? SpawnBackendFactory.create({ backend: task.backend, … }) : backend` (`- Backend: docker|tmux|subprocess` DIRECTIVES, Sprint 252 PSL-1 + mixed-fleet 248-254). Farklı task'lar farklı backend'de koşabiliyor.
- **ADR-089 (Backend-Agnostic Worker Observation + Per-Worker Independent Backends):** açık vizyon = her worker/akış bağımsız backend (tmux/docker/firecracker/cloud/ollama-host). ADR-027'nin öngördüğü "distributed execution gerekirse revisit (Sprint 145+)" noktası geldi.

**Net:** Bu ADR artık yalnız **rol-split-hibrit reddini** temsil eder; **heterojen per-worker backend** ADR-089 tarafından yönetilir (kabul edildi). "Hibrit kalıcı red" çerçevesi geniş anlamda ADR-089'a devredildi.

**Amendment log:** 2026-06-11 — kapsam ayrıldı (rol-split-reddi geçerli ↔ tek-backend-per-sprint ADR-089'a superseded); per-task override + ADR-089 cross-ref'lendi (Alperen ADR-review). md+db senkron.
