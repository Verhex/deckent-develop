# OPERATION-001 — Versioned Canonical Operation Catalog: Tasarım Önerisi (2026-08-06)

> Work ID: `OPERATION-001` (satır 4030, truth `0/0/0/?/0/?/?` — zincirin tek sıfırdan-inşası).
> Rota B Katman-2; 35 iş bağlı. Bu doküman mutating değildir — Dalga-1 paralel tasarım
> görevi (Alperen onayı, karar-turu 2026-08-06). Karar noktaları §6'dadır.

## 1. Problem — tek cümle

Deckent'te her yüzey (CLI 55+ komut, MCP 49 tool, API route'ları, autonomous/process,
iç bakım işlemleri) kendi fiillerini kendi diliyle tanımlar; "bu eylem TAM OLARAK nedir,
hangi risk sınıfındadır, hangi gate'i gerektirir, hangi kimlik adına yürür" sorusunun
tek, versiyonlu, makine-okur cevabı YOKTUR — approval, receipt, audit ve routing bu
cevabı her seferinde metinden türetir (kod-gerçeği taraması: kanonik katalog yok).

## 2. Kod-gerçeği envanteri (2026-08-06)

| Mevcut parça | Durum | Katalogla ilişkisi |
|---|---|---|
| KERNEL ontolojisi `…→Attempt→Operation` | Operation = zincirin yaprağı; tip düzeyinde var, katalog yok | Katalog, Operation'ın TÜR sözlüğüdür |
| `G0–G7` gate sınıfları (MASTER §2) | Yazılı sözleşme, koda bağlı değil | Her katalog girdisinin zorunlu `gate` alanı |
| `CapabilityRegistry` + `ROLE_CAPABILITY_MAP` (capability-broker.ts) | ÇALIŞAN tek enforcement-seam (rol→capability) | Katalogun runtime tüketicisi #1 |
| `tool-scope-gate.ts` | Yazılmış, 0 production caller (4200 wire-or-retire) | Katalog gelince wire hedefi #2 |
| Receipt register (`GR-…`) | Operasyonlar receipt'lerde SERBEST METİN | `operations:` alanı katalog-ID listesine döner |
| `ExecutionAuthorityOpsV2` | Dosya-sistemi alt-operasyon ailesi örneği | Katalog `fs.*` ailesinin ilk somut üyeleri |

## 3. Tasarım

### 3.1 Katalog girdisi (şema v1)

```jsonc
{
  "id": "op.sprint.start",            // stable, dot-hierarchic, ASLA yeniden kullanılmaz
  "version": 1,                        // davranış-anlamı değişirse ++; eski sürüm retired-verify
  "title": { "en": "...", "tr": "..." },  // i18n-FIRST
  "effect": "MUTATE_LOCAL",           // READ | MUTATE_LOCAL | MUTATE_EXTERNAL | SPAWN_EXECUTION | DESTRUCTIVE | DB | MEMORY_LAW | PROVIDER_CALL
  "gate": "G1",                       // G0–G7 (MASTER §2 ile birebir; effect→gate tutarlılığı lint'li)
  "risk": "HIGH",                     // LOW | MEDIUM | HIGH | CRITICAL (approval-matrix girdisi)
  "capabilities": ["sprint.write"],  // CapabilityRegistry kelime dağarcığıyla birebir
  "surfaces": ["cli", "mcp", "api"],  // hangi ingress'ler bu op'u üretebilir
  "idempotency": "NONE",              // NONE | KEYED | NATURAL — Attempt/retry kontratı
  "auditEvent": "sprint.start.v1"     // audit-satırının tip adı; AUDIT-001'e hazırlık
}
```

Kaynak: `src/core/operation-catalog/catalog.v1.json` (izlenen, tek dosya) + üretilmiş
TS tipleri. 0-hardcode: ID'ler koda literal yazılmaz; üretilen `Op.SprintStart` sabitleri
kullanılır (lint: katalog-dışı op-string'i FAIL).

### 3.2 Zorunlu tüketim zinciri (production-wiring closure)

`katalog → resolveOperation(ingress çağrısı) → CapabilityRegistry.check(principal, op) →
gate-admission (receipt/approval) → Attempt kaydı (opId+version) → audit(auditEvent)`

- **Ingress adapter'ları** (CLI command registrar, MCP tool registrar, API route tablosu)
  kayıt ANINDA opId bildirmek zorunda — opId'siz kayıt derleme/lint hatası. Böylece katalog
  kapsam-tamlığı yapısal olur ("her mutation/read/tool action maps" kabul kriteri).
- **tool-scope-gate** buraya wire olur (4200 disposition'ı 'wire' çıkar): scope kontrolü
  op.effect + capabilities üzerinden tipler.
- Attempt kaydına `opId@version` yazılır → replay-certification (490 ailesi) operasyon
  kimliğiyle deterministik karşılaştırma yapabilir.

### 3.3 Sürümleme ve yaşam döngüsü

- Girdi immutable: davranış değişimi = `version++` + eski sürümün `retiredAt` alması
  (SSOT kimlik-sürekliliği deseniyle aynı ruh). Silme yok; `DISPOSED` işaretlemesi var.
- Katalog dosyası MASTER-benzeri lint'e bağlanır: benzersiz ID, enum doğrulama,
  effect→gate tutarlılık matrisi, capabilities'in registry'de varlığı, i18n alan tamlığı.

### 3.4 Dilimleme önerisi (her biri kendi receipt'iyle)

| Dilim | İçerik | Kanıt |
|---|---|---|
| O1 | Şema + lint + boş katalog + üretilen tipler | lint fail-closed testleri |
| O2 | İlk aile: `op.fs.*` (ExecutionAuthorityOpsV2 yüzeyi) + `op.memory.*` (backup/export/update — bugünkü G4 prosedürünün tipleşmesi) | mevcut çağrıların opId eşlemesi |
| O3 | CLI+MCP ingress-registrar zorunluluğu (kademeli: önce WARN envanteri, sonra FAIL) | kapsam-tamlık raporu |
| O4 | CapabilityRegistry + tool-scope-gate tüketimi (4200-wire) | negative-test: katalogsuz op reddi |
| O5 | Attempt/audit alan bağlama | replay-uyumluluk testi |

## 4. Neden bu şekil (alternatifler ve reddi)

- **"Her yüzey kendi enum'unu tutsun"** → bugünkü durumun resmileşmesi; cross-surface
  approval/audit eşlemesi yine metin-türetimli kalır. RED.
- **"Capability = Operation"** → capability YETKİ dilidir (kim yapabilir), operation EYLEM
  dilidir (ne yapılıyor); 1:N ilişkilidir. Birleştirmek ROLE_CAPABILITY_MAP'i patlatır. RED.
- **DB'de katalog** → governance-by-construction için izlenen dosya + lint, DB'den üstün
  (diff'lenebilir, receipt'lenebilir, migration'sız). Katalog OKUMA yolu runtime'da cache'lenir.

## 5. Riskler

| Risk | Karşılık |
|---|---|
| Kapsam patlaması (55 CLI + 49 MCP tek dilimde) | O3 kademeli WARN→FAIL ratchet'i; envanter raporu ile ölçülür |
| ID-taksonomi bikeshed'i | Dot-hiyerarşi + mevcut modül adları; O1'de 10-girdilik örnek set onaya gelir |
| PRINCIPAL-001'e bağımlılık | Şema `principal` alanını TAŞIMAZ — principal, çağrı bağlamıdır; katalog principal-bağımsız (dependency yalnız admission-sırası) |

## 6. Alperen karar noktaları

- **D1:** Şema v1 alan seti (§3.1) — özellikle `idempotency` ve `auditEvent`'in v1'e girmesi.
- **D2:** O3'ün zorlama stratejisi (WARN-envanter süresi; hangi sürümde FAIL'e döner).
- **D3:** Katalog dosya konumu/formatı (JSON + üretilen tip önerildi; YAML alternatifi).
