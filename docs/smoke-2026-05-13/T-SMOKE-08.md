# deckent_recover MCP Tool

## Genel Bakış

`deckent_recover`, çökmüş, takılmış veya yarım kalmış bir sprintin ardından sistemi temiz bir duruma getiren kurtarma aracıdır. Dört aşamalı bir boru hattı çalıştırır: Self-Audit kapısı → orphan IPC dizin temizliği → eski kilit dosyası temizliği → terminal görev dosyası arşivleme. Aktif durumdaki görevler (`PENDING`, `EXECUTING`, `PAUSED` vb.) hiçbir zaman silinmez; yalnızca terminal duruma ulaşmış (`DONE`, `NO_GO`) veya sahipsiz kalmış dosyalar arşivlenir.

Bu araç ağırlıklı olarak şu durumlarda kullanılır: sprint takılıp kaldığında, bir tmux/subprocess worker beklenmedik şekilde sonlandığında, `.locks/` altında 5 dakikadan eski kilit dosyaları biriktiğinde ya da `.deckent/` içinde önceki sprintlerden kalan IPC dizinleri temizlenmediğinde. `deckent_start` veya `deckent_cleanup` çalıştırmadan önce bu araçla sistemi hazır hale getirmek iyi bir pratiktir.

---

## Parametreler

| Alan | Tür | Varsayılan | Açıklama |
|------|-----|-----------|----------|
| `sprintId` | `string` | — | Kurtarılacak sprint kimliği (`"sprint-150"` gibi). Zorunludur. |
| `dryRun` | `boolean` | `false` | `true` ise değişiklik yapmadan önizleme raporu döner. Güvenli ön kontrol için kullanılır. |
| `skipAudit` | `boolean` | `false` | `true` ise Self-Audit kapısı (tsc/vitest/honesty kontrolü) atlanır. Hızlı kurtarma gerektiğinde tercih edilir. |

---

## 4-Adımlı Kurtarma Akışı

### Adım 1 — Self-Audit Kapısı (`skipAudit: false` ise)

`runSelfAuditGate(sprintId, root)` çağrılır. Bu kapı TypeScript derleme, Vitest test suite ve worker dürüstlük boyutlarını değerlendirir ve `overallGate: "PASS" | "GATE_FAILURE" | "SKIPPED"` sonucu döndürür. Kapı başarısız olsa bile kurtarma akışı devam eder (hard-stop yoktur); sonuç raporda görünür.

### Adım 2 — Orphan IPC Dizin Temizliği

`.deckent/sprint-*-ipc/` kalıbıyla eşleşen dizinler taranır. Her dizin için:

- `config.json` yoksa ve dizin yeterince eskiyse (varsayılan ≥ 30 sn) silinir.
- `config.json` varsa ve `pid` alanı okunabiliyorsa, PID canlı mı kontrol edilir (`kill(pid, 0)` ile). Canlı PID varsa dizin korunur.
- Ölü PID veya eksik PID → dizin silinir.

Bu mekanizma, eş zamanlı çalışan başka bir sprinti etkilemeden eski IPC artıklarını güvenle kaldırır.

### Adım 3 — Eski Kilit Dosyası Temizliği

`.locks/` altındaki `.lock` dosyaları son değişiklik zamanına (mtime) göre değerlendirilir. 5 dakikadan eski (≥ 300 000 ms) olan kilitler silinir. Bu eşik, bir worker'ın normal heartbeat döngüsünün (her dosya yazımında güncellenir) izin verdiği maksimum sessizlik süresinden çok daha büyüktür; dolayısıyla yanlış pozitif riski düşüktür.

### Adım 4 — Terminal Görev Dosyası Arşivleme

`postFinalizeCleanup` ile `.tasks/task-<sprintNum>-*.json` kalıbındaki dosyalar okunur. Her görevin `status` alanı kontrol edilir:

- `DRAFT`, `PENDING`, `CLAIMED`, `EXECUTING`, `TESTING`, `DOCUMENTING`, `PAUSED` → **korunur**.
- `DONE`, `NO_GO` veya `status` okunamıyorsa → `.tasks/archive/<sprintId>/` altına kopyalanıp kaynak silinir.

Arşivlenen dosya uzantıları: `.json`, `.result`, `.hb`, `.plan`, `.log`, `.timeout`, `.verify-delta.json`.

---

## Çıktı Alanları

```json
{
  "success": true,
  "sprintId": "sprint-150",
  "auditGate": "PASS",
  "orphanIpcDirsRemoved": 2,
  "staleLocksCleaned": 1,
  "taskFilesArchived": 14,
  "taskFilesPreserved": 0
}
```

`dryRun: true` modunda `success` yerine `dryRun: true` alanı gelir ve hiçbir dosya değiştirilmez.

---

## Ne Zaman Çağrılır?

| Senaryo | Önerilen Kullanım |
|---------|-------------------|
| Sprint takıldı, workers ölü | `deckent_recover { sprintId, dryRun: true }` → önizle, ardından gerçek çalıştır |
| `deckent_start` "lock mevcut" hatası | `deckent_recover { sprintId }` ile eski kilitleri temizle |
| `.deckent/` içi büyüdü, IPC artıkları var | `deckent_recover { sprintId, skipAudit: true }` |
| Yeni sprint başlamadan önce alan açmak | `deckent_recover { sprintId: "sprint-önceki" }` |

---

## CLI Eşdeğeri

```bash
# Kuru çalıştır — önizleme
deckent recover sprint-150 --dry-run

# Onay sormadan kurtarma
deckent recover sprint-150 --force

# Audit atla, hızlı temizlik
deckent recover sprint-150 --force --skip-audit
```

---

## Örnek MCP Çağrısı

```json
{
  "tool": "deckent_recover",
  "arguments": {
    "sprintId": "sprint-150",
    "dryRun": false,
    "skipAudit": false
  }
}
```

> **Not:** Bu araç yıkıcıdır (`destructiveHint: true`). `.tasks/`, `.locks/` ve `.deckent/` dizinlerini değiştirir. Üretim ortamında önce `dryRun: true` ile önizleme yapılması önerilir.
