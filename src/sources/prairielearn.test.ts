import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookmarkletSource, decodePayload, parsePrairieLearnDue, payloadToImport, type PlPayload } from './prairielearn';

const NOW = new Date('2026-10-26T12:00:00-07:00');

describe('parsePrairieLearnDue', () => {
  it('parses the standard credit text with a time zone', () => {
    expect(parsePrairieLearnDue('100% until 23:59, Fri, Oct 30 (PDT)', NOW)).toBe('2026-10-31T06:59:00.000Z');
  });

  it('uses the first deadline when several are listed', () => {
    expect(parsePrairieLearnDue('100% until 23:59, Fri, Oct 30 (PDT) 80% until 23:59, Sun, Nov 1 (PST)', NOW)).toBe(
      '2026-10-31T06:59:00.000Z',
    );
  });

  it('infers the year closest to now', () => {
    const jan = new Date('2026-12-20T12:00:00Z');
    expect(parsePrairieLearnDue('100% until 09:00, Tue, Jan 5 (PST)', jan)).toBe('2027-01-05T17:00:00.000Z');
  });

  it('handles explicit years, 12-hour clocks and ISO dates', () => {
    expect(parsePrairieLearnDue('until 11:59pm, Friday, October 30, 2026 (EDT)', NOW)).toBe('2026-10-31T03:59:00.000Z');
    expect(parsePrairieLearnDue('100% until 2026-11-02 17:00:00 (UTC)', NOW)).toBe('2026-11-02T17:00:00.000Z');
  });

  it('falls back to local time without a known zone', () => {
    expect(parsePrairieLearnDue('Due Oct 30 at 23:59', NOW)).toBe(new Date(2026, 9, 30, 23, 59).toISOString());
  });

  it('returns undefined without a deadline', () => {
    expect(parsePrairieLearnDue('Assessment closed.', NOW)).toBeUndefined();
    expect(parsePrairieLearnDue('', NOW)).toBeUndefined();
    expect(parsePrairieLearnDue('None', NOW)).toBeUndefined();
  });
});

const payload: PlPayload = {
  v: 1,
  ciid: '4242',
  course: 'CSE 110, Fa26',
  url: 'https://us.prairielearn.com/pl/course_instance/4242/assessments',
  items: [
    { label: 'HW1', title: 'Recursion', href: 'https://us.prairielearn.com/pl/course_instance/4242/assessment/1/', due: '100% until 23:59, Fri, Oct 30 (PDT)' },
    { label: 'HW1', title: 'Duplicate', href: 'https://us.prairielearn.com/pl/course_instance/4242/assessment/9/', due: '100% until 23:59, Fri, Oct 30 (PDT)' },
    { label: 'E1', title: 'Exam', href: 'https://us.prairielearn.com/pl/course_instance/4242/assessment/2/', due: 'Assessment closed.' },
    { label: '', title: 'Practice', href: 'https://us.prairielearn.com/pl/course_instance/4242/assessment/3/', due: 'until 12:00, Mon, Nov 2 (PST)' },
  ],
};

describe('payloadToImport', () => {
  it('builds assignment events keyed by course instance + label', () => {
    const { source, skipped } = payloadToImport(payload, NOW);
    expect(skipped).toBe(2);
    expect(source).toMatchObject({ id: 'pl:4242', kind: 'prairielearn', name: 'CSE 110, Fa26', importedAt: NOW.getTime() });
    expect(source.events).toHaveLength(2);
    expect(source.events[0]).toMatchObject({
      uid: 'pl:4242:HW1',
      calendarId: 'pl:4242',
      title: 'HW1: Recursion',
      kind: 'assignment',
      course: 'CSE 110, Fa26',
      allDay: false,
      start: '2026-10-31T06:59:00.000Z',
      end: '2026-10-31T06:59:00.000Z',
      url: payload.items[0].href,
    });
    expect(source.events[1].uid).toBe('pl:4242:3');
  });

  it('falls back to the page title for the course name', () => {
    const { source } = payloadToImport({ ...payload, course: '', pageTitle: 'Assessments | CSE 110 | PrairieLearn' }, NOW);
    expect(source.name).toBe('CSE 110');
  });
});

describe('decodePayload', () => {
  const encode = (v: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  it('round-trips base64url JSON with unicode', () => {
    const p = decodePayload(encode({ ...payload, course: 'Café – CSE 110' }));
    expect(p.course).toBe('Café – CSE 110');
    expect(p.items).toHaveLength(4);
  });

  it('rejects bad input', () => {
    expect(() => decodePayload('!!!')).toThrow();
    expect(() => decodePayload(encode({ v: 2 }))).toThrow();
    expect(() => decodePayload(encode({ ...payload, ciid: '../x' }))).toThrow();
    expect(() => decodePayload('a'.repeat(400_000))).toThrow(/too large/);
  });

  it('drops non-http links', () => {
    const p = decodePayload(encode({ ...payload, items: [{ ...payload.items[0], href: 'javascript:alert(1)' }] }));
    expect(p.items[0].href).toBe('');
  });
});

describe('bookmarkletSource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
  });

  const run = (url: string) => {
    expect(url.startsWith('javascript:')).toBe(true);
    new Function(decodeURIComponent(url.slice('javascript:'.length)))();
  };

  it('is a valid javascript: URL that alerts off the assessments page', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    run(bookmarkletSource('https://example.github.io/cal/#x'));
    expect(alert).toHaveBeenCalledOnce();
  });

  it('extracts the assessments table and opens the app with the payload', () => {
    history.replaceState(null, '', '/pl/course_instance/4242/assessments');
    document.title = 'Assessments | CSE 110 | PrairieLearn';
    document.body.innerHTML = `
      <nav class="navbar"><span class="navbar-text">CSE 110: Software Engineering</span></nav>
      <table><tbody>
        <tr><th colspan="3">Homework</th></tr>
        <tr>
          <td><span class="badge">HW1</span></td>
          <td><a href="/pl/course_instance/4242/assessment/1/">Recursion</a></td>
          <td>100% until 23:59, Fri, Oct 30 (PDT)</td>
        </tr>
      </tbody></table>`;
    const open = vi.spyOn(window, 'open').mockImplementation(() => ({}) as Window);
    run(bookmarkletSource('https://example.github.io/cal/'));
    const dest = open.mock.calls[0][0] as string;
    expect(dest.startsWith('https://example.github.io/cal/#import=')).toBe(true);
    const p = decodePayload(dest.split('#import=')[1]);
    expect(p).toMatchObject({ ciid: '4242', course: 'CSE 110: Software Engineering' });
    expect(p.items).toEqual([
      { label: 'HW1', title: 'Recursion', href: `${location.origin}/pl/course_instance/4242/assessment/1/`, due: '100% until 23:59, Fri, Oct 30 (PDT)' },
    ]);
  });
});
