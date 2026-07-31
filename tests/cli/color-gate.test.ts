import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { colorTier, isColorSuppressed, shouldUseColor, theme } from '../../src/cli/helpers/theme.js';
import { color } from '../../src/cli/helpers/ansi.js';
import { showSplash } from '../../src/cli/helpers/splash.js';

/**
 * DESIGN-SYSTEM-001 slice-2 — tek renk-kapısı (theme.ts SSOT) + kademe çözümü
 * + palet-parite garantisi. Hermetik: yalnız process.env/argv manipüle edilir
 * ve her test sonrası birebir geri yüklenir; fs/subprocess yok. Vitest
 * ortamında stdout TTY değildir — TTY-varsayılan yolu bununla test edilir.
 */
const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'COLORFGBG', 'TERM'] as const;
let savedEnv: Record<string, string | undefined>;
let savedArgv: string[];

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  savedArgv = [...process.argv];
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  process.argv = savedArgv;
});

describe('renk-kapısı (SSOT) — öncelik zinciri', () => {
  it('varsayılan: env yok + TTY değil → renk kapalı', () => {
    expect(shouldUseColor()).toBe(false);
    expect(isColorSuppressed()).toBe(false); // bastırılmadı ama TTY de yok
  });

  it('FORCE_COLOR=1 TTY olmasa da rengi açar', () => {
    process.env.FORCE_COLOR = '1';
    expect(shouldUseColor()).toBe(true);
  });

  it('FORCE_COLOR=0 bastırır', () => {
    process.env.FORCE_COLOR = '0';
    expect(isColorSuppressed()).toBe(true);
    expect(shouldUseColor()).toBe(false);
  });

  it('NO_COLOR spec: BOŞ STRING dahil varlığı bastırır', () => {
    process.env.NO_COLOR = '';
    expect(isColorSuppressed()).toBe(true);
    expect(shouldUseColor()).toBe(false);
  });

  it("FORCE_COLOR>0, NO_COLOR override edilir", () => {
    process.env.NO_COLOR = '1';
    process.env.FORCE_COLOR = '1';
    expect(shouldUseColor()).toBe(true);
  });

  it("--no-color flag, FORCE_COLOR dahil her seyi ezer", () => {
    process.env.FORCE_COLOR = '1';
    expect(shouldUseColor(true)).toBe(false);
    expect(isColorSuppressed(true)).toBe(true);
  });

  it('argv --no-color da bastırır', () => {
    process.env.FORCE_COLOR = '1';
    process.argv = [...process.argv, '--no-color'];
    expect(shouldUseColor()).toBe(false);
  });
});

describe('kademe (tier) — işlevsellik-önce degrade', () => {
  it('bastırılmışsa none', () => {
    process.env.NO_COLOR = '1';
    expect(colorTier()).toBe('none');
  });

  it('FORCE_COLOR=3 açık istek: truecolor (zemin sezgisiz)', () => {
    process.env.FORCE_COLOR = '3';
    expect(colorTier()).toBe('truecolor');
  });

  it('FORCE_COLOR=2 → ansi256', () => {
    process.env.FORCE_COLOR = '2';
    expect(colorTier()).toBe('ansi256');
  });

  it('truecolor YETENEĞİ tek başına yetmez — zemin bilinmiyor → ansi16', () => {
    process.env.FORCE_COLOR = '1';
    process.env.COLORTERM = 'truecolor';
    expect(colorTier()).toBe('ansi16');
  });

  it('koyu zemin biliniyor (COLORFGBG) + truecolor yeteneği → truecolor', () => {
    process.env.FORCE_COLOR = '1';
    process.env.COLORTERM = 'truecolor';
    process.env.COLORFGBG = '15;0';
    expect(colorTier()).toBe('truecolor');
  });

  it('AÇIK zemin biliniyor → ansi16 (terminal şeması okunabilirliği çözer)', () => {
    process.env.FORCE_COLOR = '1';
    process.env.COLORTERM = 'truecolor';
    process.env.COLORFGBG = '0;15';
    expect(colorTier()).toBe('ansi16');
  });

  it('256-yetenek + koyu zemin → ansi256', () => {
    process.env.FORCE_COLOR = '1';
    process.env.TERM = 'xterm-256color';
    process.env.COLORFGBG = '15;8';
    expect(colorTier()).toBe('ansi256');
  });
});

describe('Theme — palet-parite (16-renk davranışı flip-öncesiyle birebir)', () => {
  it('ansi16 kademesinde SGR kodları eski Theme ile aynı', () => {
    process.env.FORCE_COLOR = '1';
    expect(theme.success('x')).toBe('\x1b[32mx\x1b[0m');
    expect(theme.error('x')).toBe('\x1b[31mx\x1b[0m');
    expect(theme.warning('x')).toBe('\x1b[33mx\x1b[0m');
    expect(theme.info('x')).toBe('\x1b[34mx\x1b[0m');
    expect(theme.muted('x')).toBe('\x1b[2mx\x1b[0m');
    expect(theme.accent('x')).toBe('\x1b[36mx\x1b[0m');
    expect(theme.bold('x')).toBe('\x1b[1mx\x1b[0m');
  });

  it("truecolor kademesinde NOVA token hex'i akar (success = novaGo #43E39A)", () => {
    process.env.FORCE_COLOR = '3';
    expect(theme.success('x')).toBe('\x1b[38;2;67;227;154mx\x1b[0m');
  });

  it('renk kapalıyken düz metin (bilgi kaybı yok)', () => {
    process.env.NO_COLOR = '1';
    expect(theme.success('x')).toBe('x');
    expect(theme.bold('x')).toBe('x');
  });

  it("strip bileşik SGR'yi de söker", () => {
    expect(theme.strip('\x1b[1;38;2;1;2;3mX\x1b[0m y \x1b[38;5;81mZ\x1b[0m')).toBe('X y Z');
  });
});

describe('splash — kapı + kademe-degrade', () => {
  it("NO_COLOR boş-string: düz metin (eski lokal kontrol bug'ının kapanışı)", () => {
    process.env.NO_COLOR = '';
    expect(showSplash('1.0.0')).not.toContain('\x1b[');
    expect(showSplash('1.0.0')).toContain('DECKENT');
  });

  it('truecolor kademesinde marka truecolor kodları', () => {
    process.env.FORCE_COLOR = '3';
    expect(showSplash('1.0.0')).toContain('38;2;77;184;164');
  });

  it('ansi16 kademesinde truecolor SIZMAZ, 16-renk degrade basılır', () => {
    process.env.FORCE_COLOR = '1';
    const out = showSplash('1.0.0');
    expect(out).not.toContain('38;2;');
    expect(out).toContain('\x1b[36m');
  });
});

describe('ansi.color — kapıya bağlandı (eski hali kapısızdı)', () => {
  it('NO_COLOR ile düz metin', () => {
    process.env.NO_COLOR = '1';
    expect(color.red('x')).toBe('x');
    expect(color.bold('x')).toBe('x');
  });

  it('renk açıkken SGR birebir eski davranış', () => {
    process.env.FORCE_COLOR = '1';
    expect(color.red('x')).toBe('\x1b[31mx\x1b[0m');
    expect(color.gray('x')).toBe('\x1b[90mx\x1b[0m');
  });
});
