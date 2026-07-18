import { describe, expect, it } from 'vitest';
import { parseDevHashSession } from '../src/renderer/shell/dev-hash-session.js';

describe('parseDevHashSession (eye-loop browser fallback)', () => {
  it('parses the launcher hash format into a loopback session', () => {
    expect(parseDevHashSession('#port=3179&token=abc123')).toEqual({
      profileId: 'dev-hash',
      url: 'http://127.0.0.1:3179',
      apiToken: 'abc123',
    });
  });

  it('accepts swapped param order and a missing leading #', () => {
    expect(parseDevHashSession('token=t&port=4317')).toEqual({
      profileId: 'dev-hash',
      url: 'http://127.0.0.1:4317',
      apiToken: 't',
    });
  });

  it('omits apiToken when the token param is empty or absent', () => {
    expect(parseDevHashSession('#port=3179&token=')).toEqual({
      profileId: 'dev-hash',
      url: 'http://127.0.0.1:3179',
    });
    expect(parseDevHashSession('#port=3179')).toEqual({
      profileId: 'dev-hash',
      url: 'http://127.0.0.1:3179',
    });
  });

  it('rejects missing, non-numeric, and out-of-range ports', () => {
    expect(parseDevHashSession('#token=abc')).toBeNull();
    expect(parseDevHashSession('#port=abc&token=t')).toBeNull();
    expect(parseDevHashSession('#port=3179x&token=t')).toBeNull();
    expect(parseDevHashSession('#port=0&token=t')).toBeNull();
    expect(parseDevHashSession('#port=65536&token=t')).toBeNull();
    expect(parseDevHashSession('#port=-1&token=t')).toBeNull();
  });

  it('rejects router hashes and empty input', () => {
    expect(parseDevHashSession('#/command')).toBeNull();
    expect(parseDevHashSession('#/console')).toBeNull();
    expect(parseDevHashSession('#')).toBeNull();
    expect(parseDevHashSession('')).toBeNull();
  });
});
