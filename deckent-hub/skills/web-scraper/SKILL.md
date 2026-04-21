# Web Scraper Skill

## Trigger Patterns
- "scrape website", "extract data from page", "crawl URLs"
- "browser automation", "headless Chrome", "Playwright scraping"
- Any task involving DOM extraction or web data collection

## Playwright Setup

### Browser Launch
```typescript
import { chromium, type Browser, type Page } from 'playwright';

async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function scrapePage(url: string): Promise<{ title: string; html: string }> {
  const browser = await createBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const title = await page.title();
    const html = await page.content();
    return { title, html };
  } finally {
    await browser.close();
  }
}
```

### Structured Data Extraction
```typescript
async function extractStructured(page: Page, selectors: Record<string, string>): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const [key, selector] of Object.entries(selectors)) {
    result[key] = await page.$$eval(selector, els => els.map(el => el.textContent?.trim() ?? ''));
  }
  return result;
}

// Usage:
const data = await extractStructured(page, {
  titles: 'h2.article-title',
  prices: '.price-tag',
  links: 'a.product-link',
});
```

### Waiting for Dynamic Content
```typescript
// Wait for specific element (SPA content)
await page.waitForSelector('.results-loaded', { timeout: 10000 });

// Wait for network idle after interaction
await page.click('#load-more');
await page.waitForLoadState('networkidle');

// Wait for specific response
const [response] = await Promise.all([
  page.waitForResponse(r => r.url().includes('/api/data') && r.status() === 200),
  page.click('#fetch-data'),
]);
const json = await response.json();
```

### Screenshot for Visual Verification
```typescript
await page.screenshot({ path: 'debug.png', fullPage: true });
```

## Anti-Detection Patterns
```typescript
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  viewport: { width: 1920, height: 1080 },
  locale: 'en-US',
});
```

## Error Handling
- **TimeoutError**: Page takes too long. Increase timeout or use `waitUntil: 'domcontentloaded'` instead of `networkidle`.
- **Navigation failed**: URL may redirect or require auth. Check response status via `page.on('response')`.
- **Selector not found**: DOM structure changed. Use resilient selectors (data attributes over class names).
- **Rate limiting**: Add delays between requests: `await page.waitForTimeout(2000)`.
- **Memory leaks**: Always close browser in `finally` block. Reuse browser across pages, not per-page.

## Best Practices
- Respect `robots.txt` — check before scraping.
- Use `page.route()` to block images/fonts/CSS for faster scraping when only text is needed.
- For paginated content, extract "next page" URL and loop with a max-page safety limit.
- Prefer API endpoints over scraping when available (check Network tab for XHR calls).
- Store raw HTML alongside extracted data for debugging and re-extraction.
