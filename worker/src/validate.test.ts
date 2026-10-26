// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decodeJwtPayload,
  isOriginAllowed,
  isPublicIPv6,
  looksLikeIcs,
  parseAllowedOrigins,
  validateFeedUrl,
} from './validate';

describe('origins', () => {
  const allowed = parseAllowedOrigins(' https://User.github.io/ ,http://localhost:5173,, ');

  it('normalizes the list', () => {
    expect(allowed).toEqual(['https://user.github.io', 'http://localhost:5173']);
  });

  it('matches case-insensitively and rejects others', () => {
    expect(isOriginAllowed('https://USER.github.io', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5174', allowed)).toBe(false);
    expect(isOriginAllowed('https://user.github.io.evil.com', allowed)).toBe(false);
    expect(isOriginAllowed(null, allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });
});

describe('validateFeedUrl', () => {
  const ok = (raw: string) => validateFeedUrl(raw);

  it('accepts https and rewrites webcal', () => {
    expect(ok('https://canvas.ucsd.edu/feeds/calendars/user_abc.ics')).toEqual({
      ok: true,
      url: 'https://canvas.ucsd.edu/feeds/calendars/user_abc.ics',
    });
    expect(ok('webcal://p01-calendars.icloud.com/published/2/x')).toEqual({
      ok: true,
      url: 'https://p01-calendars.icloud.com/published/2/x',
    });
    expect(ok('WEBCAL://example.com/a.ics').ok).toBe(true);
  });

  it.each([
    [''],
    ['not a url'],
    ['http://example.com/a.ics'],
    ['ftp://example.com/a.ics'],
    ['file:///etc/passwd'],
    ['https://user:pass@example.com/a.ics'],
    ['https://token@example.com/a.ics'],
    ['https://localhost/a.ics'],
    ['https://foo.localhost/a.ics'],
    ['https://printer.local/a.ics'],
    ['https://intranet/a.ics'],
    ['https://example.com:8443/a.ics'],
    ['https://127.0.0.1/a.ics'],
    ['https://2130706433/a.ics'],
    ['https://0x7f.1/a.ics'],
    ['https://10.1.2.3/a.ics'],
    ['https://172.16.0.1/a.ics'],
    ['https://172.31.255.255/a.ics'],
    ['https://192.168.1.1/a.ics'],
    ['https://169.254.169.254/latest/meta-data'],
    ['https://100.64.0.1/a.ics'],
    ['https://0.0.0.0/a.ics'],
    ['https://[::1]/a.ics'],
    ['https://[::ffff:127.0.0.1]/a.ics'],
    ['https://[fe80::1]/a.ics'],
    ['https://[fd00::1]/a.ics'],
  ])('rejects %s', (raw) => {
    expect(ok(raw).ok).toBe(false);
  });

  it('accepts public IP literals', () => {
    expect(ok('https://8.8.8.8/a.ics').ok).toBe(true);
    expect(ok('https://172.32.0.1/a.ics').ok).toBe(true);
    expect(ok('https://[2606:4700::1111]/a.ics').ok).toBe(true);
  });

  it('classifies IPv6', () => {
    expect(isPublicIPv6('::ffff:7f00:1')).toBe(false);
    expect(isPublicIPv6('::ffff:808:808')).toBe(true);
  });
});

describe('looksLikeIcs', () => {
  it('accepts a VCALENDAR with BOM / whitespace', () => {
    expect(looksLikeIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBe(true);
    expect(looksLikeIcs('﻿\r\n  BEGIN:VCALENDAR\r\n')).toBe(true);
  });
  it('rejects HTML', () => {
    expect(looksLikeIcs('<!doctype html><html>')).toBe(false);
    expect(looksLikeIcs('')).toBe(false);
  });
});

describe('decodeJwtPayload', () => {
  it('decodes base64url UTF-8 payloads', () => {
    const payload = { sub: '123', email: 'a@b.c', name: 'Zoë' };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(decodeJwtPayload(`x.${b64}.y`)).toEqual(payload);
  });
  it('returns null for garbage', () => {
    expect(decodeJwtPayload('nope')).toBeNull();
    expect(decodeJwtPayload('a.!!!.b')).toBeNull();
  });
});
