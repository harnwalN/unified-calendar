export type FeedUrlCheck =
  | { ok: true; url: string; host: string; warning?: string }
  | { ok: false; error: string };

/** Validates a pasted calendar link; `webcal://` is rewritten to `https://` so it can be fetched. */
export function checkFeedUrl(input: string, kind: 'canvas' | 'ics'): FeedUrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Paste a calendar link first.' };
  let url: URL;
  try {
    url = new URL(raw.replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return { ok: false, error: 'That doesn’t look like a link. It should start with https://' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Only http, https or webcal links are supported.' };
  }
  const warning =
    kind === 'canvas' && !url.pathname.includes('/feeds/calendars/')
      ? 'This doesn’t look like a Canvas Calendar Feed link (they contain “/feeds/calendars/”). It may not work.'
      : undefined;
  return { ok: true, url: url.toString(), host: url.host, warning };
}

export function feedHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
