# Autonomous Engine — Otonom Yürütme Motoru

deckent Autonomous Engine, sprint gerektirmeden tekrarlayan veya tetikleyici tabanlı görevleri otomatik olarak çalıştırabilen dayanıklı bir iş kuyruğu sistemidir. Backlog `.deckent/autonomous/backlog.json` dosyasında git-takipli olarak saklanır; 3-kapı yönetişim (RBAC → policy → risk) sayesinde hangi işlerin otomatik çalışacağı ve hangilerinin onay bekleneceği kontrol edilir.

---

## Temel Kavramlar

### BacklogEntry (`src/orchestra/autonomous/backlog-types.ts`)

Her otonom iş birimi bir `BacklogEntry` nesnesidir:

```typescript
interface BacklogEntry {
  id: string;               // benzersiz, dedup için
  title: string;
  kind: 'task' | 'sprint' | 'capability';
  spec: {
    description?: string;    // kind=task: satır-içi açıklama
    directivesRef?: string;  // kind=sprint: DIRECTIVES referansı
    scopeDir?: string;
    capabilityTarget?: CapabilityTarget;  // kind=capability: F8 broker
  };
  policy: 'auto' | 'approval-required' | 'risk-tagged';
  trigger: BacklogTrigger;
  status: 'pending' | 'running' | 'parked' | 'done' | 'failed';
  lastRun: string | null;
  lastResult: { ok: boolean; reason: string } | null;
}
```

### Trigger Türleri

| Tür | Açıklama | Gerekli Alan |
|-----|---------|-------------|
| `recurring` | cron ifadesine göre periyodik çalışma | `trigger.cron` zorunlu |
| `one-off` | tek seferlik çalışma | — |
| `reactive` | Nervous System detector tetiklemesi | `trigger.detector` zorunlu |

---

## Backlog Dosyası

`.deckent/autonomous/backlog.json` — tek doğruluk kaynağı, git-trackable:

```json
{
  "_version": "1.0",
  "entries": [
    {
      "id": "weekly-audit",
      "title": "Haftalık güvenlik denetimi",
      "kind": "sprint",
      "spec": { "directivesRef": "DIRECTIVES-audit.md", "scopeDir": "src/" },
      "policy": "approval-required",
      "trigger": { "type": "recurring", "cron": "0 9 * * 1" },
      "status": "pending",
      "lastRun": null,
      "lastResult": null
    }
  ]
}
```

**Eksik dosya** → boş backlog olarak yorumlanır, hata değil.

---

## Doğrulama (`src/orchestra/autonomous/backlog.ts`)

`validateBacklogEntry()` el-yazımı doğrulama (ADR-010: tek runtime bağımlılığı, yeni şema bağımlılığı yok):

- `id` ve `title` boş olamaz
- `kind` ∈ `task | sprint | capability`
- `policy` ∈ `auto | approval-required | risk-tagged`
- `status` ∈ geçerli değer kümesi
- `trigger.type = recurring` → `trigger.cron` string zorunlu
- `trigger.type = reactive` → `trigger.detector` string zorunlu
- `kind = capability` → `spec.capabilityTarget.capability` dolu string zorunlu

`loadBacklog()` geçersiz bir giriş bulduğunda hard throw atar — sessizce geçmez.

---

## Durum Yaşam Döngüsü

```
pending → running → done | failed
        ↘ parked  (policy kapısında bekliyor — approval-required / risk-tagged)

recurring: done → pending (lastRun sonraki cron zamanı gelince yeniden kuyruğa)
```

- `queryDue()`: tüm `pending` girdileri döndürür — "pending = şimdi çalışabilir"
- `applyRecurringReenqueue()`: done→pending geçişini sadece cron zamanı gelmişse yapар; boş tick'lerde dosyayı yeniden yazmaz
- `purgeCompletedBacklog()`: varsayılan son 5 tamamlanan girdiyi tutar, gerisi silinir

---

## 3-Kapı Yönetişim

Her backlog girdisi çalıştırılmadan önce 3 kapıdan geçer:

### Kapı 1 — RBAC Authority (`src/orchestra/autonomous/authority-adapter.ts`)

ADR-037 Authority Matrix'e göre aktör `deckent.autonomous.run` iznine sahip mi? İzin yoksa → park.

### Kapı 2 — Policy Gate (`src/orchestra/autonomous/policy-gate.ts`)

`policy` alanına göre karar:

| Policy | Karar |
|--------|-------|
| `auto` | Effect class kontrolüne geç |
| `approval-required` | Kullanıcı onayı olmadan → park |
| `risk-tagged` | Risk değerlendirmesine göre → auto veya park |

### Kapı 3 — Effect Class Risk (`src/orchestra/autonomous/policy-gate.ts`)

Görevin içeriğinden etki sınıfı çıkarılır:

| Etki Sınıfı | Örnekler | Karar |
|-------------|---------|-------|
| `pure` | read-only audit, fs.read | auto |
| `reversible` | working-tree değişikliği, sprint kodu | auto |
| `idempotent` | db-migration, schema-create | park |
| `compensable` | outbound API, webhook | park |
| `critical-irreversible` | npm publish, deploy, force-push | park |

Belirsiz/bilinmeyen etki → `critical-irreversible` (fail-safe: ADR-040 varsayılan reddet).

---

## Runtime Loop (`src/orchestra/autonomous/runtime-loop.ts`)

Sprint 226'da hayata geçirilen `composition root` — 5 adaptörü bağlar:

```typescript
makeAuthorityChecker()   // G1 RBAC
makeAuditSink()          // denetim izi
makeApprovalGate()       // G2 onay kapısı
makeActionExecutor()     // yürütücü
makeTriggerSource()      // tetikleyici
```

Tick döngüsü `runAutonomousCycle()` üzerinde deterministik olarak çalışır. Sprint 226 öncesinde bu modül 0-çağıran (dormant) durumdaydı.

---

## CLI Komutları

```bash
deckent autonomous status           # Backlog durumu ve aktif işler
deckent autonomous add              # Yeni backlog girdisi ekle
deckent autonomous stop             # Otonom motorü durdur
```

MCP aracı: `deckent_autonomous` — `status/stop/backlog` yönetimi, `add` desteği (cron, capability).

---

## Entegrasyon Noktaları

### Nervous System ile

Reactive trigger tipi doğrudan Nervous System detektörleriyle bağlantılıdır:

```json
{
  "trigger": { "type": "reactive", "detector": "stale_worker" }
}
```

Bir detektör tetiklendiğinde, ilgili `reactive` backlog girdileri `pending` durumuna geçer.

### Work Generator ile

`src/orchestra/autonomous/work-generator.ts` ve `work-generator-source.ts`: AI-tabanlı iş önerisi üretimi — Brain, gereksinimleri analiz ederek yeni backlog girdileri önerebilir.

---

## Konfigürasyon

`.deckent/config.json`:

```json
{
  "autonomous": {
    "enabled": true,
    "backlog_path": ".deckent/autonomous/backlog.json",
    "tick_interval_ms": 60000,
    "max_concurrent": 2
  }
}
```

---

## Güvenlik Notları

- Autonomous Engine, ADR-040 Nervous System'in Safety Floor kurallarını miras alır: `KILL_LIVE_SPRINT`, `DESTRUCTIVE_GIT` gibi 5 kilitli eylem hiçbir zaman otomatik çalışmaz
- `applyRecurringReenqueue()` atomik yazar — dosya ortasında hata alırsa backlog bozulmaz
- Tüm çalıştırmalar `writeAuditEvent()` ile audit kaydına düşer
