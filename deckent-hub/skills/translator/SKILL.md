# Translator — DeepL API Integration

## Trigger Patterns
- "translate this to Turkish", "translate file to English"
- "DeepL translation", "localize", "i18n"
- "multilingual content", "language detection"

## Core API Patterns

### Client Setup
```typescript
import * as deepl from 'deepl-node';

const translator = new deepl.Translator(process.env.DEEPL_API_KEY!);
// Free tier: 500K chars/month. Pro: unlimited.
```

### Translate Text
```typescript
const result = await translator.translateText(
  'Merhaba, nasilsiniz?',
  null,              // auto-detect source language
  'en-US'            // target language
);
console.log(result.text);           // "Hello, how are you?"
console.log(result.detectedSourceLang); // "tr"
```

### Translate Multiple Texts (Batch)
```typescript
const texts = ['Hello world', 'Good morning', 'Thank you'];
const results = await translator.translateText(texts, 'en', 'tr');
// results is an array: ["Merhaba dunya", "Gunaydin", "Tesekkur ederim"]
```

### Translate Document (File)
```typescript
import { createReadStream, createWriteStream } from 'node:fs';

await translator.translateDocument(
  'input.docx',
  'output.docx',
  null,       // auto-detect source
  'de'        // target: German
);
// Supported: .docx, .pptx, .xlsx, .pdf, .htm, .html, .txt
```

### Get Supported Languages
```typescript
const sourceLangs = await translator.getSourceLanguages();
const targetLangs = await translator.getTargetLanguages();

// Check if a language is supported
const supportsKorean = targetLangs.some(l => l.code === 'ko');
```

### Get Usage Statistics
```typescript
const usage = await translator.getUsage();
if (usage.character) {
  console.log(`Used: ${usage.character.count} / ${usage.character.limit} chars`);
}
```

### Formality Control
```typescript
const formal = await translator.translateText(
  'How are you?', 'en', 'de',
  { formality: 'more' }  // "Wie geht es Ihnen?" (formal)
);

const informal = await translator.translateText(
  'How are you?', 'en', 'de',
  { formality: 'less' }  // "Wie geht's dir?" (informal)
);
```

## Error Handling
- **AuthorizationException**: Invalid API key. Check `$DECK:DEEPL_API_KEY`. Free keys end with `:fx`.
- **QuotaExceededException**: Monthly character limit reached. Check `getUsage()` before large batches.
- **TooManyRequestsException**: Rate limited. Implement exponential backoff (start 1s, max 30s).
- **Unsupported language pair**: Not all pairs are supported. Check `getSourceLanguages()` / `getTargetLanguages()` first.
- **Document too large**: Max 10MB for documents. Split large files before translation.

## Best Practices
- Use `null` for source language to leverage DeepL's auto-detection (very accurate)
- For i18n workflows: extract strings first, translate batch, write back to locale files
- Cache translations for repeated content (hash input + target lang as cache key)
- Use `formality` parameter for Turkish (more = "siz", less = "sen")
- Store API key in `.deck` file: `$DECK:DEEPL_API_KEY`
- For large projects: use glossaries (`translator.createGlossary()`) to enforce consistent terminology
- Always preserve placeholders: translate `"Hello {{name}}"` carefully — use `tagHandling: 'xml'` option
