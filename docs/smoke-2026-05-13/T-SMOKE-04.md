# deckent_set_directives MCP Tool

## Genel Bakış

`deckent_set_directives`, bir sprint'in görev hedeflerini tanımlamak için kullanılan MCP aracıdır. Bu araç, proje kök dizinindeki `DIRECTIVES.md` dosyasını verilen içerikle **tamamen üzerine yazar**. Sprint planlama sürecinin ikinci adımıdır: önce `deckent_init` ile proje başlatılır, ardından `deckent_set_directives` ile görevler tanımlanır, son olarak `deckent_plan` çağrılarak task JSON dosyaları üretilir.

---

## Parametre

### `content` (string, zorunlu)

Formatlanmış DIRECTIVES.md içeriği. Brain motoru bu içeriği ayrıştırarak sprint task'larını oluşturur. İçerik, `## Task N:` veya `## Görev N:` başlıkları içermelidir (her iki dil de desteklenir).

**Temel format:**

```markdown
# DIRECTIVES — Sprint 001: Başlık

## Task 1: Kimlik doğrulama middleware ekle
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/middleware/auth.ts
- Scope: src/middleware/

### Description
JWT tabanlı kimlik doğrulama middleware'ini uygula...
```

**Desteklenen alan etiketleri (her task bloğunda):**

| Alan | Açıklama | Örnek |
|------|----------|-------|
| `Model` | Kullanılacak AI modeli | `opus`, `sonnet`, `haiku` |
| `Effort` | Tahmini iş yükü | `low`, `normal`, `high` |
| `Skills` | Uzmanlık alanları | `typescript-expert, testing-expert` |
| `Files` | Yazılacak dosya yolları | `src/core/auth.ts` |
| `Scope` | İzin verilen dizinler | `src/core/` |
| `Agent` | Agent override | `security-auditor`, `none` |
| `Provider` | Provider override | `claude`, `codex`, `gemini` |
| `Dependencies` | Bağımlı task ID'leri | `155-001, 155-002` |
| `Priority` | Öncelik seviyesi | `CRITICAL`, `HIGH`, `NORMAL`, `LOW` |

---

## parseStructuredDirectives — Parser Çalışma Mantığı

Araç `DIRECTIVES.md` dosyasını yazdıktan sonra, `deckent_plan` aşamasında `src/orchestra/task-builder.ts` içindeki `parseStructuredDirectives()` fonksiyonu devreye girer.

### Ayrıştırma Adımları

1. **Kod bloklarını maskele** — `\`\`\`` içindeki kod örnekleri, sahte yol tespitini önlemek için boş satırlarla maskelenir.
2. **Başlıklara göre böl** — İçerik `/^##\s+(?:G[öo]rev|Task)\s+\d+[^:]*:/m` regex'iyle bölümlere ayrılır.
3. **Her bloğu işle:**
   - İlk boş olmayan satır **başlık** olarak alınır.
   - `Dosya:` / `Files:` ve `Kapsam:` / `Scope:` etiketli satırlar kapsam bilgisini oluşturur.
   - `Model:`, `Effort:`, `Agent:`, `Skills:`, `Provider:`, `Dependencies:`, `Priority:` satırları ayrıştırılarak ilgili override değerleri belirlenir.
4. **Fallback** — Eğer hiç `## Task N:` başlığı bulunamazsa, madde işareti veya numaralı liste formatı ayrıştırılmaya çalışılır.

### Araç Yanıtı

`deckent_set_directives` başarılı olduğunda şu alanları döner:

```json
{
  "success": true,
  "taskCount": 5,
  "breakdown": {
    "code": 3,
    "docs": 1,
    "test": 1,
    "analysis": 0
  },
  "estimatedModels": {
    "opus": 2,
    "sonnet": 2,
    "haiku": 1
  }
}
```

- **`taskCount`** — Tespit edilen `## Task N:` başlık sayısı.
- **`breakdown`** — Görev içeriklerine göre sınıflandırma (kod, dokümantasyon, test, analiz).
- **`estimatedModels`** — Görev karmaşıklığına göre tahmini model dağılımı.

---

## Kullanım Örneği

```typescript
// MCP aracılığıyla
const result = await client.callTool('deckent_set_directives', {
  content: `# DIRECTIVES — Sprint 001

## Task 1: API endpoint ekle
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, api-builder
- Files: src/api/routes/users.ts
- Scope: src/api/

### Description
GET /users endpoint'ini uygula, pagination desteği ekle.
`
});
```

**CLI karşılığı:**

```bash
# Doğrudan içerik
deckent set-directives --content "# DIRECTIVES..."

# Dosyadan oku
deckent set-directives --file ./my-directives.md

# stdin pipe
cat my-directives.md | deckent set-directives
```

---

## Önemli Notlar

- **Önkoşul:** `deckent_init` çalıştırılmış olmalıdır; aksi hâlde `DIRECTIVES_FILE` yazma hatası alınır.
- **İdempotent değildir:** Her çağrı `DIRECTIVES.md` dosyasını tamamen üzerine yazar.
- **Planlama tetiklenmez:** Bu araç yalnızca dosyayı yazar; task JSON'larını üretmek için ardından `deckent_plan` çağrılmalıdır.
- **İki dil desteği:** `## Task N:` (İngilizce) ve `## Görev N:` (Türkçe) başlıklar eşdeğer olarak işlenir.
