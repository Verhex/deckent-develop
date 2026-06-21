// tests/connectors/markdown-to-html.test.ts
import { describe, it, expect } from 'vitest';
import { markdownToTelegramHtml as md } from '../../src/connectors/markdown-to-html.js';

describe('markdownToTelegramHtml', () => {
  it('renders bold, italic, strikethrough', () => {
    expect(md('**deckent_recover**')).toBe('<b>deckent_recover</b>');
    expect(md('__bold__')).toBe('<b>bold</b>');
    expect(md('*it*')).toBe('<i>it</i>');
    expect(md('_it_')).toBe('<i>it</i>');
    expect(md('~~gone~~')).toBe('<s>gone</s>');
  });
  it('renders inline code + code blocks without inner formatting, escaping inside', () => {
    expect(md('`a < b & **x**`')).toBe('<code>a &lt; b &amp; **x**</code>'); // no bold inside code
    expect(md('```\nx<1 & y\n```')).toBe('<pre>x&lt;1 &amp; y</pre>');
    expect(md('```ts\nconst a=1;\n```')).toBe('<pre>const a=1;</pre>'); // language label dropped
  });
  it('escapes HTML-special chars in plain text (no injection)', () => {
    expect(md('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    expect(md('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('renders links and escapes the url/text', () => {
    expect(md('[deckent](https://x.io?a=1&b=2)')).toBe('<a href="https://x.io?a=1&amp;b=2">deckent</a>');
  });
  it('converts headings to bold and list bullets', () => {
    expect(md('# Title')).toBe('<b>Title</b>');
    expect(md('- one\n- two')).toBe('• one\n• two');
  });
  it('leaves unbalanced markdown as escaped literal text (no broken tags)', () => {
    expect(md('**oops no close')).toBe('**oops no close'); // not matched → literal (no <b>)
  });
  it('handles a realistic mixed reply', () => {
    const out = md('Use **deckent_recover** to recover. Run `deckent status` first.');
    expect(out).toBe('Use <b>deckent_recover</b> to recover. Run <code>deckent status</code> first.');
  });
  it('does not corrupt when model text contains a code-placeholder-like pattern', () => {
    // Real text containing "C0" / "I0" must round-trip unharmed (no injected code).
    expect(md('grade C0 and I0 today')).toBe('grade C0 and I0 today');
    // …and code still works alongside it:
    expect(md('grade C0 then `x` done')).toBe('grade C0 then <code>x</code> done');
  });
  it('does not linkify non-http(s)/tg schemes (javascript: etc.)', () => {
    expect(md('[click](javascript:alert(1))')).toBe('[click](javascript:alert(1))'); // left as escaped literal text
    expect(md('[ok](https://x.io)')).toBe('<a href="https://x.io">ok</a>');
    expect(md('[tgok](tg://resolve?domain=x)')).toBe('<a href="tg://resolve?domain=x">tgok</a>');
  });
});
