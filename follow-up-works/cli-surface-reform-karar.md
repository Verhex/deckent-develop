# CLI-SURFACE-REFORM — Karar-Dokümanı **v2** (owner yönlendirmeleri işlendi, 2026-08-27)

> **Silinme-tetiği (delete-on-consume):** Alperen v2 gruplamayı + §4 kalan-soruları
> onaylayınca dilim-1 DIRECTIVES'ine dönüşür ve bu doküman SİLİNİR (kalıcı kayıt MASTER 545).
> **v2 değişiklikleri (owner, 2026-08-27):** approvals+confirmations TEK onay-yüzeyi ·
> audit+audit-verify birleşir · otonom grubu yeniden düzenlendi · paralel komutlar alias
> değil KALDIRILIR (pencere-sonrası) · yaşam-döngüsü derin-çalışıldı · bar: claude/codex.

## 1. Konsolidasyon politikası (v2 — sertleşti)

Aynı işlevin paralel komutu YAŞAMAZ: tek kanonik komut + flag/alt-komut. Eskiler bir
sürüm-penceresi typed-deprecation uyarısı verir, sonra **KALDIRILIR** (kalıcı alias yok).

## 2. TEK ONAY-YÜZEYİ tasarımı (owner-talimatı; en büyük birleşim)

**Bulgu:** bugün ALTI ayrı onay-kapısı var: `approvals` · `confirmations` · `checkpoint
approve/reject` · `autonomous pending/approve/reject` · `nervous accept/reject` ·
`runs --approve/--reject`. **Backend federasyonu ZATEN mevcut**
(`approval-inbox-federation.ts`: confirmation/checkpoint/autonomous-trigger/nervous/
panic-guard/bot-action/gateway-pairing origin'leri) — iş, CLI'ı tek kapıya bağlamak:

```
deckent approvals                       # federated inbox (tüm sınıflar, tek liste)
deckent approvals list [--class checkpoint|confirmation|autonomous|nervous|plan]
deckent approvals decide <id>           # tek karar-verbi (interaktif TTY re-auth — §12.2 korunur)
deckent approvals rules                 # kalıcı kurallar (mevcut)
deckent approvals run-llm               # confirmations'ın LLM-adapter koşusu (xverify runtime)
```

Emilen komutlar (pencere-sonrası kaldırılır): `confirmations` (list/decide/run) ·
`checkpoint` (list/approve/reject) · `autonomous pending/approve/reject` ·
`nervous accept/reject/accept-panic` (nervous'un edit/undo/history'si kalır — onlar
onay değil, öneri-yönetimi). `runs --approve/--reject` de inbox'a `plan` sınıfı olarak
düşer (runs listesi kalır; karar-verbi approvals'a taşınır).
Kural korunur: **MCP read-only inbox; decide YALNIZ CLI live-auth** (CLOSURE-brief §12.2).

## 3. Yaşam-döngüsü DERİN-ÇALIŞMASI (owner-talebi: "ne işe yaradıkları, gerçek birleşme")

| Komut | Gerçekte ne yapıyor (probe-kanıtlı) | Hüküm |
|---|---|---|
| `review` | Sprint task'larını değerlendirmeyle listeler; `--approve-all/--reject-all` insan-kararı içerir | KALIR (Run-sonrası değerlendirme); onay-verbleri §2 inbox'ına devrolur |
| `retro` | SALT-OKUR retrospektif projeksiyonu (--compare/--perf/--trend) | **İZLEME grubuna taşınır** (aksiyon değil rapor) |
| `explain` | Son sprint'in NL özeti + task routing-log projeksiyonu | **`retro`'ya emilir** → `retro --explain [--task id]` (aynı okuma-ailesi; paralel-komut kuralı) |
| `cleanup` | Sprint-sonrası artifact süpürme + `--decay` + runtime-history planı | KALIR |
| `finalize` | Terminal settlement projeksiyonu (DB-first; normalde lifecycle otomatiği) | İLERİ (elle-seam; recover ile aynı aile) |
| `kill` | Worker sonlandırma (panic-guard'lı) | KALIR |
| `recover` | Çökmüş/takılı sprint kanonik kurtarma (--resume dahil) | KALIR |
| `checkpoint` | Faz-bazlı insan onayı list/approve/reject | **§2 inbox'ına emilir** |

Grup adı önerisi: "Yaşam-döngüsü" yerine **Control** (kill · recover · cleanup) — review
Run-ailesine yaslanır, retro/explain İZLEME'ye gider. (claude/codex'te de lifecycle diye
ayrı başlık yok; az-grup = profesyonel.)

## 4. Diğer birleşimler (owner-talimatları uygulandı)

- **`audit verify`**: `audit-verify` ayrı komut olmaktan çıkar → `deckent audit verify`
  alt-komutu (HMAC-zincir doğrulaması; tek verb'lük ayrı komut gereksizdi). ✔ birleşebilir.
- **`autonomous mission ...`**: `autonomous-mission` ayrı komut olmaktan çıkar →
  `deckent autonomous mission create-list|create-goal|list`.
- **`memory recall|remember`**: `recall` ve `remember` bağımsız komutları `memory`
  altına iner (`deckent memory recall "<q>"` · `memory remember "<not>"`) — paralel-komut
  kuralının aynısı.
- **`status --watch` / `watch <task>`**: `dashboard` ve `attach` KALDIRILIR (pencere
  sonrası); `output <taskId>` → `watch --logs <taskId>`. Tek canlı-izleme çifti kalır:
  genel = `status --watch`, tekil-worker = `watch`.
- `analyze-project` alias'ı, `plan-nl`, `archive-debt` → kaldırma-listesi (do /
  status --debt emer).

## 5. v2.1 hedef `-h` (owner: "daha sade" — 4 grup + Advanced)

```
Usage: deckent [options] [prompt]

  deckent "<prompt>"     start a native chat session
  deckent do "<goal>"    plan a run from a goal (dry-run first)

Run        do · run · plan · start · runs · review
Observe    status · watch · inspect · history · retro
Control    approvals · kill · recover · cleanup · autonomous · nervous · xverify
System     init · config · doctor · sync · upgrade · connect · limits · usage ·
           agent · skill · models · memory · serve · bot · mcp
Advanced   deckent help advanced
```

- **5 başlık, ~32 görünür komut** (80'den). Katalog/sağlayıcı/ortam/servis ayrı başlık
  değil — hepsi System (claude/codex az-başlık ilkesi).
- Autonomy ayrı başlık değil: `autonomous`/`nervous` Control'de (onay-verbleri zaten tek
  inbox'ta); `heartbeat` Advanced.
- Advanced'e inenler: heartbeat · rbac · gateway · audit · truth · cost · docs · plugin ·
  analyze · onboard · local-llm · resources · cu-status · spawn · test · process · mode ·
  flow · task · archive · trace · image · set-directives · finalize · features ·
  openrouter-probe · provider-observations · execution-authority · provider-authority.
  (Görünmez değil — `deckent help advanced` tam listeyi basar; enterprise/RBAC yüzeyi
  burada yaşar, ürünleşince kendi başlığına terfi edebilir.)
- Kaldırma-listesi (§4) aynen: 12 paralel komut pencere-sonrası silinir.

## 6. Kalan owner-soruları (v2 tüketim-koşulu)

1. **Autonomy grubu v2:** `autonomous` (mission'lı) · `nervous` · `heartbeat` üçlüsü —
   şimdi doğru mu, yoksa nervous/heartbeat'i başka başlık altında mı istersin?
2. **`review`nin yeri:** Run-ailesinde mi (önerim), Control'de mi?
3. **`explain`→`retro --explain` emilimi:** onay?
4. **Kaldırma-penceresi:** bir minör sürüm mü, ilk public release'e kadar mı?
5. **`runs --approve/--reject`'in inbox'a devri:** onay? (runs listesi kalıyor, yalnız
   karar-verbi taşınıyor.)

## 7. Mekanizma + dilim-2/3 (değişmedi)

Surface-contract registry (help/docs/completion/MCP-parity tek kaynaktan) + consumer-closure
gate + EN-default. Dilim-2 onarımlar: kpi+evolve tek analitik-yüzey (tarihçe/trend),
limits+usage provider-geneli, truth `undefined`-hücre, runtime-çıktı dili. Dilim-3:
prompt-first native chat. Uygulama: ladder-dalga sonrası, dogfood sprint dilimleriyle.
