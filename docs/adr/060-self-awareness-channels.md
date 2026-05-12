# ADR-060: Self-Awareness Propagation — 5-Channel Context Enrichment Architecture

**Status:** proposed

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-12

**Sprint:** Sprint 156

---

## Status

proposed (Sprint 156 — kanal 5 (worker-enrichment) T-007 ile seed edildi; tam mimari ayrı sprint'e planlandı)

---

## Context

Deckent worker'ları görevlerini bağımsız, izole bir ortamda yürütür. Bu izolasyon kasıtlıdır — ADR-034 (Multi-Project Isolation) ve ADR-037 (RBAC) gereği. Ancak izolasyonun bir yan etkisi vardır: worker'lar proje bağlamından habersiz kalabilir. Bu durum çeşitli sprint'lerde gözlemlenen aşağıdaki sorunların kaynağıdır:

**1. Agent Alignment Drift (Sprint 145–153 boyunca gözlemlendi):** Worker'lar mimari kararlar (ADR'ler) hakkında bilgilendirilmese, uyguladıkları çözümler kabul edilmiş ADR'leri ihlal edebilir. Örneğin, worker `shell: true` kullanarak bir komut çalıştırabilir ve ADR-006 ihlali yaratabilir. Sprint 138'de ADR yönetimi çerçevesi (`queryRelevantADRs()` + `prompt-god-template.ts` "Mandatory Architecture Rules" bloğu) bu sorunun bir kısmını çözdü — ancak bağlam enjeksiyonu yalnızca ADR katmanıyla sınırlı kaldı.

**2. Bağımlılık Sonuçlarının Bilinmezliği (Sprint 135–139 boyunca):** Worker T-002, T-001'in sonucundan haberdar değildi. Sprint 135 T-005 (Planner Priority/Dependencies) ve Sprint 134 T-001 (Task Dependency Pipeline) bağımlılık zincirini pipeline düzeyinde kurdu; ancak T-002 worker'ının prompt'unda T-001'in *ne yaptığı* yer almıyordu. Yalnızca "T-001 tamamlandı" bilgisi vardı. Bu eksiklik Sprint 156 T-007 (Worker Prompt Previous-Result Enrichment) ile giderildi.

**3. Skill ve Agent Bağlamının Parçalı Aktarımı:** Skill seçimi (`selectSkills()`), agent seçimi (`selectAgent()`) ve ADR enjeksiyonu ayrı ayrı fonksiyonlarda gerçekleşiyor, her biri prompt'un farklı bir bölümüne yazıyor. Sonuçta worker prompt'u birbiriyle ilişkili ama koordine edilmemiş bağlam parçalarından oluşuyor. Worker, "Bu skill neden seçildi?" veya "Önceki sprint'teki benzer görevde ne oldu?" bilgisine erişemiyor.

**4. Manifest Uyumsuzluğu.** Worker'ların hangi agent ve skill versiyonunu kullandığını bilmemesi, manifest güncellemesi sonrasında ortaya çıkan uyumsuzlukları Sprint 148'de gözlemlendiği gibi yakalamayı güçleştirdi. Spawn zamanında agent manifest snapshot'ı worker prompt'una eklenseydi, worker beklenen API'yi ve değişiklikleri daha iyi yorumlayabilirdi.

**5. Self-Awareness Eksikliği.** "Self-awareness" terimi burada şu anlama gelir: worker'ın yalnızca kendi görevini değil, görevinin bulunduğu *bağlamı* — sprint kimliği, seçilen agent, seçilen skill'ler, ilgili ADR'ler, bağımlılık sonuçları — bilmesi. Bu bağlam eksikliği, worker'ların tekrarlayan hatalara düşmesine ve Brain'in fazladan FIX döngüsü çalıştırmasına neden olmaktaydı.

Mevcut `prompt-god-template.ts` içindeki `buildHeader()`, `buildAgentBlock()`, `buildSkillBlock()`, `buildDependenciesBlock()`, `buildADRBlock()` fonksiyonları bu bağlam enjeksiyonunu kısmen çözüyor. Ancak koordineli bir mimari eksik. Bu ADR, bağlam yayılımını beş kanalda organize eden bir çerçeve tanımlar.

---

## Decision

**Self-Awareness Propagation Architecture** — 5 kanal tanımlanır. Her kanal farklı bir bağlam tipini worker prompt'una taşır. Kanallar `prompt-god-template.ts` içinde `buildWorkerContext()` çatı fonksiyonu altında koordine edilir:

```typescript
interface WorkerContextBundle {
  channel1_init:         InitChannel;
  channel2_sync:         SyncChannel;
  channel3_manifest:     ManifestChannel;
  channel4_skill_declare: SkillDeclareChannel;
  channel5_enrichment:   EnrichmentChannel;
}

async function buildWorkerContext(task: Task, sprintId: string): Promise<WorkerContextBundle>
```

### Kanal 1 — Init Channel (Sprint + Task Identity)

Worker'ın kim olduğunu ve nerede çalıştığını aktarır.

**İçerik:**
- Sprint kimliği ve numarası (`sprint-156`)
- Task kimliği ve başlığı
- Seçilen model ve effort seviyesi
- Scope tanımı (directories, filesRead, filesWrite)
- GO/NO-GO kriterleri

**Mevcut durum:** `buildHeader()` fonksiyonu bu bilgilerin büyük bölümünü zaten üretiyor. ADR-060, bu fonksiyonun "Kanal 1 sorumluluğu" olduğunu resmen belirler.

**Yeni eklenti:** Sprint kimliğinden türetilen `sprint_sequence_number` (ör. sprint-156 → 156) ve bu sprint'teki görev sırası (ör. "15 task'tan 7.si") worker'a sprint'teki yerini gösterir.

### Kanal 2 — Sync Channel (ADR + Memory Snapshot)

Projenin geçmiş mimari kararlarını ve ilgili sprint öğrenmelerini aktarır.

**İçerik:**
- İlgili ADR'ler (zaten `queryRelevantADRs()` + `buildADRBlock()` ile yapılıyor)
- İlgili sprint learnings (hafıza DB'sinden `searchMemory()` ile)
- Aktif teknik borç maddeleri (görevle ilişkili olanlar)

**Mevcut durum:** ADR enjeksiyonu Sprint 138'de hayata geçti. Öğrenim ve borç snapshot'ı opsiyonel. ADR-060 bu bağlamı zorunlu hale getirir.

**Yeni eklenti:** `sprint_learning_digest` — son 3 sprint'teki benzer görevlerin sonuçlarından çıkarılan 3–5 cümlelik özet.

### Kanal 3 — Manifest Channel (Agent + Skill Version Snapshot)

Görev için seçilen agent ve skill'lerin anlık versiyonlarını aktarır.

**İçerik:**
- Agent tanımı: isim, versiyon, uzmanlık özeti
- Her skill için: isim, kapsam, son güncellenme tarihi
- Agent/skill uyumsuzluğu uyarıları (manifest checksum mevcut versiyonla eşleşmiyorsa)

**Mevcut durum:** `buildAgentBlock()` ve `buildSkillBlock()` prompt içeriğini yazıyor; ancak versiyon ve checksum bilgisi dahil değil.

**Yeni eklenti:** `manifest_checksum` alanı — spawn zamanındaki agent.json hash değeri. Worker bunu bilirse, manifest güncellemesini fark edebilir ve Not uygulanamaz durumlarda Brain'i uyarabilir.

### Kanal 4 — Skill Declare Channel (Active Skill Instructions)

Seçilen skill'lerin tam içeriğini aktarır (önceden kısmen yapılıyor).

**İçerik:**
- Her skill'in tam `SKILL_PROMPT` içeriği
- Skill prioritization: çakışan talimatlar için öncelik sırası
- Anti-pattern listesi: bu skill'i kullanan worker'ların önceki sprint'lerde yaptığı yaygın hatalar

**Mevcut durum:** Skill içerikleri `buildSkillBlock()` ile zaten ekleniyor. ADR-060, anti-pattern listesini yeni bir eklenti olarak tanımlar.

**Yeni eklenti:** `skill_anti_patterns` — `outcome-tracker.ts` kayıtlarından çıkarılan, bu skill ile yapılan yaygın hatalar listesi. Ör: "react-specialist skill kullanırken 3 sprint boyunca `useEffect` cleanup eksikliği gözlemlendi."

### Kanal 5 — Enrichment Channel (Dependency Result Propagation)

Bağımlılık görevlerinin sonuçlarını aktarır.

**İçerik:**
- Her bağımlılık task'ı için `.result` dosyasından `selfAssessment`, `filesChanged`, `notes` alanları
- Bağımlılık tamamlanmamışsa: "Beklemede (henüz tamamlanmadı)"
- Bağımlılık NO_GO ise: NO_GO sebebi ve önerilen çözüm

**Mevcut durum:** Sprint 156 T-007 (Worker Prompt Previous-Result Enrichment) bu kanalı hayata geçirdi. `buildDependenciesBlock()` fonksiyonu güncellendi: artık yalnızca task ID listesi değil, her bağımlılığın `.result` içeriği embed ediliyor.

**Format örneği:**
```markdown
## Dependency 154-001 (DONE)
- Files: src/orchestra/rubric-registry.ts (+196 satır)
- Self-assessment: DONE
- Notes: TaskType taxonomy oluşturuldu. audit/document-write/code-development tipleri ve rubric registry.
```

### Koordinasyon

Tüm kanallar `buildWorkerContext()` içinde birleşir ve tek bir `WorkerContextBundle` nesnesi döndürülür. Bu nesne `spawn-backend-docker.ts` ve `spawn-backend.ts` içinde kullanılarak final worker prompt'u oluşturulur. Token bütçesi aşılırsa (max context window) kanallar öncelik sırasına göre kısaltılır:

```
1 → 2 → 3 → 4 → 5  (öncelik sırası: 1 en yüksek)
Kanal 5 (enrichment) en büyük ve en ilk kesilendir.
```

---

## Consequences

### Olumlu

- **Alignment drift azalır.** Worker'lar ADR'leri, geçmiş öğrenmeleri ve önceki bağımlılık sonuçlarını bilerek çalışır. Sprint 154 boyunca gözlemlenen tekrarlayan hataların önemli bir kısmı bağlam eksikliğinden kaynaklandı.
- **FIX döngüsü sayısı düşer.** Daha zengin bağlam, ilk denemede daha iyi çıktı anlamına gelir. Sprint sonuçlarında FIX → DONE oranı izlenerek doğrulanabilir.
- **Manifest uyumsuzluğu erken yakalanır.** Kanal 3 sayesinde worker, kullandığı agent'ın beklenmedik şekilde güncellendiğini görebilir ve Brain'i uyarabilir.
- **Skill anti-pattern öğrenmesi döngüsel hale gelir.** Her sprint'te `outcome-tracker.ts` yeni anti-pattern verisi üretir; kanal 4 bunu sonraki worker'lara iletir. Bu öğrenme döngüsü ADR-036 (ADR governance) ile uyumludur.

### Olumsuz

- **Prompt token maliyeti artışı.** 5 kanal, mevcut prompt boyutuna önemli bir ek yük getirir. Kanal 5 (dependency enrichment) özellikle büyük olabilir — 10+ bağımlılıklı bir görevde potansiyel olarak binlerce token. Token bütçesi yönetimi ve kanal önceliklendirmesi zorunlu.
- **Uygulama süresi.** Tam 5-kanal entegrasyonu `prompt-god-template.ts`'in yeniden yapılandırılmasını gerektiriyor. Sprint 156 yalnızca Kanal 5'i tamamladı; kalan kanallar Sprint 157+ roadmap.
- **Anti-pattern veri kalitesi.** Kanal 4 anti-pattern verisi `outcome-tracker.ts` kayıtlarına bağımlı. Erken sprint'lerde veri yetersiz olacak; anti-pattern listesi boş döner. Bu durumda kanal 4 gürültü değil sessizlik üretmeli.
- **Manifest checksum false-positive riski.** Kanal 3 checksum eşleşmezliği uyarı üretir; ancak her güncelleme gerçek bir uyumsuzluk değildir (ör. JSDoc güncellemesi). Uyarı seviyesi "warning" olmalı; "block" olmamalı.

---

## Related ADRs

- **ADR-007** — SpawnOptions Interface: `buildWorkerContext()` sonucu spawn options aracılığıyla worker'a iletilir.
- **ADR-035** — Verification Protocol: Kanal 2 (Sync) öğrenme snapshot'ı, `CODE_VERIFY_REQUEST` kanalı hakkında worker'a önceki deneyimleri aktarabilir.
- **ADR-036** — ADR Governance: Kanal 2 zorunlu ADR enjeksiyonunu formalize eder; `queryRelevantADRs()` bu kanalın uygulamasıdır.
- **ADR-041** — Agent Taxonomy: Kanal 3 (Manifest) agent seçim gerekçesini ve versiyon bilgisini aktarır.
- **ADR-053** — TaskType Taxonomy (proposed): Kanal 1 (Init) görev tipini aktarır; kanal 4 bu tipe özgü anti-pattern verisi içerebilir.
- **ADR-055** — Hybrid Scoring Pipeline (proposed): Kanal 1 ve 2'deki bağlam bilgisi, Layer 4 (Outcome Weighting) ve Layer 5 (Auditor) skorlamaya girdi sağlar.

---

## Notes

"Self-awareness" terimi bilerek seçilmiştir ve şu anlamı taşır: worker'ın yalnızca görevini değil, görevinin sistemdeki *yerini* bilmesi. Bu kavramsal çerçeve ADR-040 (Nervous System Architecture) ile örtüşür — nervous system sistemin genel durumunu izlerken, self-awareness kanalları bu bilgiyi görev düzeyinde yayar.

Sprint 156 T-007'nin tamamlanması Kanal 5'in canlıya alındığını kanıtlar. Kalan 4 kanal (özellikle Kanal 1 için sprint_sequence_number ve Kanal 3 için manifest_checksum) Sprint 157 ADR consolidation sprint'inde hayata geçirilecektir.
