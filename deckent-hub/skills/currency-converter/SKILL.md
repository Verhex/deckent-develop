# Currency Converter — Exchange Rates API Integration

## Trigger Patterns
- "convert USD to EUR", "exchange rate", "currency conversion"
- "forex rates", "how much is 100 TRY in USD"
- "multi-currency pricing", "money conversion"

## Core API Patterns

### Fetch Latest Rates (Free API — No Key Required)
```typescript
interface ExchangeRateResponse {
  result: string;
  base_code: string;
  conversion_rates: Record<string, number>;
  time_last_update_utc: string;
}

async function getLatestRates(baseCurrency: string): Promise<ExchangeRateResponse> {
  const url = `https://open.er-api.com/v6/latest/${baseCurrency.toUpperCase()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Exchange rate API failed: ${response.status}`);
  return response.json() as Promise<ExchangeRateResponse>;
}
```

### Convert Amount
```typescript
async function convert(amount: number, from: string, to: string): Promise<number> {
  const rates = await getLatestRates(from);
  const rate = rates.conversion_rates[to.toUpperCase()];
  if (!rate) throw new Error(`Unknown currency: ${to}`);
  return Math.round(amount * rate * 100) / 100; // 2 decimal places
}

// Usage: await convert(100, 'USD', 'TRY') => 3245.50
```

### Batch Conversion (Multiple Targets)
```typescript
async function convertBatch(
  amount: number,
  from: string,
  targets: string[]
): Promise<Record<string, number>> {
  const rates = await getLatestRates(from);
  const result: Record<string, number> = {};
  for (const to of targets) {
    const rate = rates.conversion_rates[to.toUpperCase()];
    if (rate) result[to.toUpperCase()] = Math.round(amount * rate * 100) / 100;
  }
  return result;
}

// Usage: await convertBatch(1000, 'EUR', ['USD', 'GBP', 'TRY', 'JPY'])
```

### Rate Caching (Avoid Excessive API Calls)
```typescript
let cache: { rates: ExchangeRateResponse; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 3600000; // 1 hour

async function getCachedRates(base: string): Promise<ExchangeRateResponse> {
  if (cache && cache.rates.base_code === base && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }
  const rates = await getLatestRates(base);
  cache = { rates, fetchedAt: Date.now() };
  return rates;
}
```

### Format Currency Output
```typescript
function formatCurrency(amount: number, currency: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

// formatCurrency(3245.50, 'TRY', 'tr-TR') => "3.245,50 TL"
```

## Error Handling
- **Network failures**: Wrap fetch in try/catch. Use cached rates as fallback if available.
- **Invalid currency code**: Validate against ISO 4217 list before API call. Common mistake: "TL" vs "TRY".
- **API rate limits**: Free tier allows ~1500 requests/month. Cache aggressively. Consider `exchangerate-api.com` paid tier for production.
- **Stale rates**: Exchange rates update daily on free APIs. For real-time forex, use a paid provider.
- **Precision**: Use `Math.round(val * 100) / 100` for display. For financial calculations, consider a decimal library.

## Best Practices
- Always show the rate timestamp so users know data freshness
- Cache rates for at least 1 hour (free APIs update daily anyway)
- Support common aliases: "dollar" -> USD, "euro" -> EUR, "lira" -> TRY
- Use `Intl.NumberFormat` for locale-aware currency formatting
- For `.deck` integration: store paid API key as `$DECK:EXCHANGE_API_KEY`
