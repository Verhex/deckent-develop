# Screenshot Vision — Playwright Capture + Claude Vision Analysis

## Trigger Patterns
- "take a screenshot", "capture the page", "analyze this screenshot"
- "visual regression", "OCR this image", "what does this page look like"
- "screenshot comparison", "visual diff", "UI check"

## Core API Patterns

### Playwright Screenshot Capture
```typescript
import { chromium } from 'playwright';

async function captureScreenshot(url: string, outputPath: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  const buffer = await page.screenshot({ path: outputPath, fullPage: true });
  await browser.close();
  return buffer;
}
```

### Element-Specific Capture
```typescript
const element = await page.locator('.dashboard-card').first();
await element.screenshot({ path: 'card.png' });
```

### Claude Vision Analysis
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';

const client = new Anthropic();

async function analyzeScreenshot(imagePath: string, prompt: string): Promise<string> {
  const imageData = readFileSync(imagePath).toString('base64');
  const mediaType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

### Visual Regression Pipeline
```typescript
// 1. Capture baseline and current screenshots
const baseline = await captureScreenshot(url, 'baseline.png');
const current = await captureScreenshot(url, 'current.png');

// 2. Ask Claude to compare
const diff = await analyzeScreenshot('current.png',
  'Compare this screenshot with the baseline. List any visual differences: layout shifts, color changes, missing elements, broken styles.');
```

## Error Handling
- **Browser not installed**: Run `npx playwright install chromium` before first use.
- **Timeout on page load**: Use `page.goto(url, { timeout: 30000 })` and catch `TimeoutError`.
- **Large screenshots**: Full-page screenshots can be very large. Use `quality: 80` for JPEG or crop to viewport.
- **Base64 size limits**: Claude Vision accepts images up to 20MB base64. Resize large screenshots before sending.
- **Headless GPU issues**: On CI/Docker, use `chromium.launch({ headless: true, args: ['--no-sandbox'] })`.

## Best Practices
- Cache browser instances for batch captures (launch once, create multiple pages)
- Use `page.waitForSelector('.loaded')` instead of `waitUntil: 'networkidle'` for SPAs
- Store screenshots with timestamps for audit trails: `screenshot-${Date.now()}.png`
- For OCR tasks, ask Claude: "Extract all visible text from this screenshot as structured data"
