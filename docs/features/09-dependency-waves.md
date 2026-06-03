# Dependency Waves — Sprint Görevlerini Akıllıca Sırala
> Deckent, task bağımlılıklarını analiz ederek paralel çalıştırılabilecek grupları (wave) otomatik belirler ve hiçbir task öncesinden önce bitmez.

## Ne işe yarar?
- Sprint task'larını bağımlılık grafiğine göre topological wave'lere böler.
- Aynı wave içindeki task'lar tam paralel olarak spawn edilir.
- Sonraki wave, mevcut wave'deki tüm task'lar DONE olmadan başlamaz.
- Aynı dosyalara yazan task'lar arasına otomatik bağımlılık kenarı ekler (scope collision).
- Döngü (cycle) tespit eder ve raporlar; sprint takılmaz.

## Neden önemli?
- **Hız:** Bağımsız task'lar aynı anda çalışır — sıralı yürütmeye göre çok daha kısa sprint süresi.
- **Güvenlik:** Scope collision detection (Sprint 138), aynı dosyayı yazmaya çalışan iki worker'ı otomatik sıralar; çakışma olmaz.
- **Dayanıklılık:** Bir task NO_GO olursa sadece ona bağlı olan task'lar cascade-blocked olur, bağımsız task'lar devam eder.

## Nasıl çalışır?

```
buildDependencyGraph(tasks)
  │
  ├─ 1. Bağımlılık kenarları kurulur (task.dependencies)
  ├─ 2. Scope collision dedektörü ek kenarlar ekler (aynı dosya çakışmaları)
  └─ 3. Kahn algoritması → topological sıra → wave ataması
        Wave 0: [T1, T2, T3]   ← bağımlısız, paralel spawn
        Wave 1: [T4, T5]        ← T1/T2/T3 DONE olduktan sonra
        Wave 2: [T6]            ← T4/T5 DONE olduktan sonra

Çalışma zamanı:
  enforceWaveDependency()  → henüz başlamayacak task'ları filtreler
  cascadeBlockDependents() → NO_GO sonrası transitif bağımlıları BLOCKED yapar
  unblockDependents()      → FIX başarılı olunca bağımlıları serbest bırakır
```

Grafik JSON + Mermaid `.mmd` formatında kalıcı hale getirilir; sprint resume sırasında yüklenir.

## Komut / Örnek

```bash
# Dependency pipeline aktif mi?
deckent config read | grep dependency_pipeline_enabled
# → "dependency_pipeline_enabled": true

# Task'lar arasına bağımlılık eklemek (DIRECTIVES.md):
## Task 2: API Uç Noktası
# - Dependencies: task-001

# Sprint planında wave dağılımını gör
deckent status --json | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  console.log(d.waves);
"
```

```markdown
# DIRECTIVES bağımlılık örneği
## Task 3: Entegrasyon Testi
- Dependencies: task-001, task-002
```

## Durum
- Olgunluk: ✅ canlı — `dependency_pipeline_enabled: true` (varsayılan); manifest: `dependency-scheduler` aktif
- **Not (deckent-dev projesi):** Deckent'in kendi dogfood sprint'lerinde `dependency_pipeline_enabled: false` — Brain wave geçişlerini manuel yönetir (ADR-047). Kullanıcı projelerinde default `true`.
- İlgili: ADR-045 · `src/orchestra/dependency-scheduler.ts` · `src/orchestra/conflict-resolver.ts`
