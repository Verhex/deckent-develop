# Weather Forecast Skill

## Trigger Patterns
- "get weather", "check forecast", "temperature in [city]"
- "humidity levels", "wind speed", "climate data"
- Any task involving OpenWeatherMap API integration

## OpenWeatherMap API Patterns

### Current Weather
```typescript
const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const BASE = 'https://api.openweathermap.org/data/2.5';

async function getCurrentWeather(city: string): Promise<WeatherData> {
  const url = `${BASE}/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}: ${await res.text()}`);
  return res.json();
}
```

### 5-Day Forecast
```typescript
async function getForecast(lat: number, lon: number): Promise<ForecastData> {
  const url = `${BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Forecast API ${res.status}: ${await res.text()}`);
  return res.json();
}
```

### Geocoding (City to Coordinates)
```typescript
async function geocode(city: string): Promise<{ lat: number; lon: number }> {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.length) throw new Error(`City not found: ${city}`);
  return { lat: data[0].lat, lon: data[0].lon };
}
```

## Key Response Fields
- `main.temp` — temperature in requested units (metric = Celsius)
- `main.humidity` — humidity percentage
- `wind.speed` — wind speed (m/s for metric)
- `weather[0].description` — human-readable condition
- `dt` — Unix timestamp of measurement

## Error Handling
- **401**: Invalid API key. Verify OPENWEATHERMAP_API_KEY env var.
- **404**: City not found. Use geocoding endpoint for fuzzy matching.
- **429**: Rate limit (free tier: 60 calls/min). Implement exponential backoff.
- **5xx**: API outage. Cache last-known data and return stale with warning.
- Always validate `units` param: "metric" (Celsius), "imperial" (Fahrenheit), "standard" (Kelvin).

## Best Practices
- Cache responses for 10 minutes (weather data is not real-time).
- Use lat/lon over city name for accuracy (avoids ambiguity: "Springfield" exists in 30+ US states).
- Free tier supports current weather + 5-day/3-hour forecast. One Call API 3.0 requires paid subscription.
- Always pass `units=metric` explicitly; default is Kelvin which surprises users.
