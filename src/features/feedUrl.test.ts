import { describe, expect, it } from 'vitest';
import { checkFeedUrl } from './feedUrl';

describe('checkFeedUrl', () => {
  it('accepts a Canvas feed link', () => {
    const r = checkFeedUrl(' https://canvas.ucsd.edu/feeds/calendars/user_abc.ics ', 'canvas');
    expect(r).toEqual({ ok: true, url: 'https://canvas.ucsd.edu/feeds/calendars/user_abc.ics', host: 'canvas.ucsd.edu', warning: undefined });
  });
  it('rewrites webcal to https', () => {
    const r = checkFeedUrl('webcal://example.com/cal.ics', 'ics');
    expect(r.ok && r.url).toBe('https://example.com/cal.ics');
  });
  it('warns when a canvas link is not a feed', () => {
    const r = checkFeedUrl('https://canvas.ucsd.edu/calendar', 'canvas');
    expect(r.ok && r.warning).toMatch(/feeds\/calendars/);
  });
  it('rejects junk and other protocols', () => {
    expect(checkFeedUrl('', 'ics').ok).toBe(false);
    expect(checkFeedUrl('not a url', 'ics').ok).toBe(false);
    expect(checkFeedUrl('ftp://x.com/a.ics', 'ics').ok).toBe(false);
  });
});
