# NPM Advisory — Bağımlılık-Mutasyonu Eskalasyon Kanalı (born-454)

> **Config:** yok — her worker prompt'unda **her zaman açık** (prompt-seviyesi advisory)
> **Kaynak:** `src/orchestra/prompt-god-template.ts` (`NPM_ADVISORY_BLOCK`) +
> `src/orchestra/ipc-registry.ts` (`[NPM-ADVISORY]` dalı) · **Doğuş:** 2026-07-02, sprint-356
> canlı-vakası üzerine (born-454) · **Tasarım kararı:** Alperen, 2026-07-02 — fiziksel engel
> (PATH-shim / RO-mount) yerine **worker→Brain iletişim kanalı üzerinden advisory** (CC-advisory benzeri).

## Neden var — canlı vaka

Sprint-356'da bir worker, mount'lu workspace'te `npm install` çalıştırdı. Repo'nun
`.npmrc ignore-scripts=true` ayarı + container-ABI'si host-ABI'sinden farklı olduğu için
`better-sqlite3`'ün native binding'i silindi ve **host'taki tüm DB erişimi çöktü** (runtime dahil).
Kural prompt'ta örtük vardı (Karpathy D2: yeni runtime bağımlılığı ekleme) ama ne açık bir yasak
ne de bir eskalasyon yolu tanımlıydı.

## Ne yapar

İki yarımdan oluşur — ikisi de bloke etmez, **yönlendirir** (advisory):

1. **Worker tarafı** (`NPM_ADVISORY_BLOCK`, her god-prompt'ta statik T0 segmenti):
   - `npm install|ci|rebuild|update|prune|dedupe|link` ve yarn/pnpm eşdeğerleri workspace'te
     **asla çalıştırılmaz** — gerekçesi (ABI + ignore-scripts vakası) prompt'ta anlatılır.
   - Task gerçekten bağımlılık değişikliği gerektiriyorsa worker, mevcut dosya-tabanlı
     soru kanalını kullanır: `.tasks/task-<id>.question` dosyasına `[NPM-ADVISORY]` işaretli
     JSON yazar, 60 sn `.answer` bekler, **cevap ne olursa olsun install koşmaz**; ihtiyacı
     `.result` `notes`'una `npmAdvisory:` satırıyla kaydeder ve dürüst self-assessment yapar
     (çekirdek kriterler karşılanıyorsa GO_WITH_TECH_DEBT, imkânsızsa NO_GO).
2. **Brain tarafı** (`handleWorkerQuestion` — `waitForResults` poll döngüsü her tick'te sorar):
   - `[NPM-ADVISORY]` işaretli soru **deterministik fail-closed** cevaplanır: `action: continue`
     + açık "NOT approved" mesajı. `honor_worker_question_action` flag'i açık olsa bile
     `suggestedAction` bu sınıfta ASLA onurlandırılmaz — worker bağımlılık mutasyonunu
     kendine onaylatamaz.
   - İnsan operatöre **tek seferlik** bildirim düşer (`notifyAsync`, `human-checkpoint-required`;
     cevap dosyası zaten diskteyse re-notify edilmez — poll-döngüsü spam'i yok).
   - Gerçek bağımlılık değişikliği her zaman **host-side** yapılır (operatör/CC), worker içinde asla.

## Akış

```
worker: bağımlılık ihtiyacı
  → .tasks/task-<id>.question  {"question": "[NPM-ADVISORY] left-pad@1.3.0 — tablo hizalama", ...}
  → Brain (poll): fail-closed answer (continue + NOT-approved) + operatöre 1× bildirim
  → worker: install YOK; notes: "npmAdvisory: left-pad@1.3.0 gerekti"; dürüst self-assessment
  → operatör: ihtiyacı görür; kararı host-side verir (install + rebuild kendi elleriyle)
```

## Neden fiziksel engel değil

- **Advisory model (CC-advisory benzeri)**: worker'ı düşmanca kısıtlamak yerine doğru davranışa
  yönlendirir + ihtiyacı görünür kılar. Fiziksel PATH-shim/RO-mount, meşru ihtiyaç sinyalini de
  öldürürdü (worker sessizce NO_GO'ya düşer, kimse nedenini görmezdi).
- Kanal zaten vardı (`askBrain` dosya-IPC'si, sprint-135) — yeni mekanizma icat edilmedi (Karpathy D2).
- Fail-closed cevap + tek-yönlü yetki (host-side mutasyon) güvenlik sınırını korur; enforcement
  gerektiğinde [approval-runtime.md](approval-runtime.md) `shell-exec` scope'u ile sertleştirilebilir.

## Kanıt

- `tests/orchestra/ipc-registry.test.ts` — "handleWorkerQuestion — NPM-ADVISORY" (5 test: fail-closed
  cevap, flag-bağışıklığı, 1× bildirim, sprintId'siz sessizlik, whitespace-toleransı).
- `tests/orchestra/prompt-segmentation.test.ts` — "npm-advisory block" (3 test: her prompt'ta varlık,
  statik T0 / task-id'siz içerik, tier sınıflandırması).
