// Pure request-validation helpers (no Worker globals) so they can be unit-tested in Node.

/** Splits the ALLOWED_ORIGINS var into normalized (lower-case, no trailing slash) origins. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin.trim().replace(/\/+$/, '').toLowerCase());
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validates a user-supplied calendar feed URL. Accepts https:// and webcal:// (rewritten to
 * https://); rejects anything that could point the proxy at private infrastructure.
 */
export function validateFeedUrl(raw: string | null): UrlCheck {
  if (!raw || !raw.trim()) return { ok: false, error: 'Missing url parameter' };
  let input = raw.trim();
  if (/^webcals?:\/\//i.test(input)) input = input.replace(/^webcals?:\/\//i, 'https://');

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'Only https:// and webcal:// links are supported' };
  if (url.username || url.password) return { ok: false, error: 'URLs with credentials are not allowed' };
  if (url.port && url.port !== '443') return { ok: false, error: 'Non-standard ports are not allowed' };

  const hostError = checkHost(url.hostname);
  if (hostError) return { ok: false, error: hostError };
  url.hash = '';
  return { ok: true, url: url.toString() };
}

function checkHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return 'Missing host';

  if (host.startsWith('[')) {
    return isPublicIPv6(host.slice(1, -1)) ? null : 'Private or loopback addresses are not allowed';
  }
  const v4 = parseIPv4(host);
  if (v4) return isPublicIPv4(v4) ? null : 'Private or loopback addresses are not allowed';

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    !host.includes('.')
  ) {
    return 'Local hostnames are not allowed';
  }
  return null;
}

/** WHATWG URL already canonicalizes IPv4 (e.g. 2130706433 -> 127.0.0.1), so dotted-quad suffices. */
export function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

export function isPublicIPv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false; // 192.0.0.0/24 + TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}

export function isPublicIPv6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === '::' || a === '::1') return false;
  // IPv4-mapped / -translated, e.g. ::ffff:7f00:1 or ::ffff:127.0.0.1
  const mapped = /^::ffff:(?:0:)?(.+)$/.exec(a);
  if (mapped) {
    const tail = mapped[1];
    const dotted = parseIPv4(tail);
    if (dotted) return isPublicIPv4(dotted);
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPublicIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    }
    return false;
  }
  const first = parseInt(a.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (a.startsWith('64:ff9b:')) return false; // NAT64 can reach IPv4 private ranges
  return true;
}

/** True if the body (after an optional BOM / leading whitespace) starts with BEGIN:VCALENDAR. */
export function looksLikeIcs(text: string): boolean {
  return /^﻿?\s*BEGIN:VCALENDAR/i.test(text);
}

/** Decodes the (unverified) payload of a JWT. Returns null when malformed. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
