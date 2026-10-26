import { describe, expect, it } from 'vitest';
import { htmlToText, linkify, safeHref } from './eventText';

describe('htmlToText', () => {
  it('strips tags, scripts and decodes entities', () => {
    expect(htmlToText('<p>Hi&nbsp;<b>there</b> &amp; you</p><script>alert(1)</script><br>Line &#39;2&#x27;')).toBe(
      "Hi there & you\n\nLine '2'",
    );
  });
});

describe('linkify', () => {
  it('extracts links without trailing punctuation', () => {
    expect(linkify('See https://x.com/a. Done')).toEqual([
      { text: 'See ' },
      { text: 'https://x.com/a', href: 'https://x.com/a' },
      { text: '. Done' },
    ]);
  });
});

describe('safeHref', () => {
  it('only allows http(s)', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('https://canvas.ucsd.edu/x')).toBe('https://canvas.ucsd.edu/x');
  });
});
