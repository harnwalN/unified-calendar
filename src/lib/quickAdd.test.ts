import { describe, expect, it } from 'vitest';
import { buildDraft, parseQuickAdd } from './quickAdd';
import type { ClassInfo } from '../types';

// Monday, Oct 26 2026, 2:00 PM local.
const NOW = new Date(2026, 9, 26, 14, 0);

const cls = (id: string, name: string, aliases: string[] = []): ClassInfo => ({
  id,
  name,
  color: '#000',
  aliases,
  order: 0,
  updatedAt: 0,
});
const CLASSES = [
  cls('cse', 'CSE 110', ['CSE 110 - LECTURE A00 (FA26)']),
  cls('math', 'MATH 183'),
  cls('gone', 'COGS 9'),
];
CLASSES[2].deleted = true;

const local = (y: number, m: number, d: number, h = 23, min = 59) => new Date(y, m, d, h, min).toISOString();
const parse = (text: string) => parseQuickAdd(text, NOW, CLASSES);

describe('parseQuickAdd', () => {
  it('returns plain text unchanged with defaults', () => {
    expect(parse('  Buy milk  ')).toEqual({ title: 'Buy milk', priority: 'none', list: 'personal' });
  });

  it('parses the full example', () => {
    const r = parse('PA 3 fri 11:59pm #CSE110 !high ~2h @wed');
    expect(r).toEqual({
      title: 'PA 3',
      due: local(2026, 9, 30),
      doDate: '2026-10-28',
      classId: 'cse',
      priority: 'high',
      estimateMin: 120,
      list: 'personal',
    });
  });

  describe('due dates', () => {
    it('weekday without time → 11:59 PM next occurrence', () => {
      expect(parse('Essay thursday').due).toBe(local(2026, 9, 29));
      expect(parse('Essay thu').due).toBe(local(2026, 9, 29));
      expect(parse('Essay thurs').due).toBe(local(2026, 9, 29));
      expect(parse('Essay tues').due).toBe(local(2026, 9, 27));
      expect(parse('Essay Sun').due).toBe(local(2026, 10, 1));
    });

    it('today’s weekday means today', () => {
      expect(parse('Essay mon').due).toBe(local(2026, 9, 26));
    });

    it('today / tomorrow / tmr', () => {
      expect(parse('A today').due).toBe(local(2026, 9, 26));
      expect(parse('A tomorrow').due).toBe(local(2026, 9, 27));
      expect(parse('A tmr 9am').due).toBe(local(2026, 9, 27, 9, 0));
    });

    it('month name + day', () => {
      expect(parse('Report oct 30').due).toBe(local(2026, 9, 30));
      expect(parse('Report November 3rd 5pm').due).toBe(local(2026, 10, 3, 17, 0));
      expect(parse('Report Dec 1,').due).toBe(local(2026, 11, 1));
    });

    it('numeric dates', () => {
      expect(parse('Report 10/30').due).toBe(local(2026, 9, 30));
      expect(parse('Report 1/15').due).toBe(local(2027, 0, 15));
      expect(parse('Report 2/3/2027').due).toBe(local(2027, 1, 3));
      expect(parse('Report 13/40').title).toBe('Report 13/40');
    });

    it('rolls dates far in the past into next year', () => {
      expect(parse('x jan 5').due).toBe(local(2027, 0, 5));
      // Recent past stays this year (shows as overdue).
      expect(parse('x oct 20').due).toBe(local(2026, 9, 20));
    });

    it('times', () => {
      expect(parse('Call 5pm').due).toBe(local(2026, 9, 26, 17, 0));
      expect(parse('Call 11:59pm').due).toBe(local(2026, 9, 26, 23, 59));
      expect(parse('Call 17:00').due).toBe(local(2026, 9, 26, 17, 0));
      expect(parse('Call 12pm').due).toBe(local(2026, 9, 27, 12, 0));
      expect(parse('Call 12am fri').due).toBe(local(2026, 9, 30, 0, 0));
      expect(parse('Call noon wed').due).toBe(local(2026, 9, 28, 12, 0));
      expect(parse('Call at 6pm').due).toBe(local(2026, 9, 26, 18, 0));
    });

    it('time without a date that already passed → tomorrow', () => {
      expect(parse('Call 9am').due).toBe(local(2026, 9, 27, 9, 0));
      expect(parse('Call 14:00').due).toBe(local(2026, 9, 27, 14, 0));
    });

    it('time before the date also works', () => {
      expect(parse('HW 5pm fri').due).toBe(local(2026, 9, 30, 17, 0));
    });

    it('drops a dangling "due"/"by"', () => {
      expect(parse('Lab report due fri').title).toBe('Lab report');
      expect(parse('Lab report by 10/30').title).toBe('Lab report');
    });

    it('ignores invalid times', () => {
      expect(parse('Room 25:00').title).toBe('Room 25:00');
      expect(parse('Room 13pm').due).toBeUndefined();
    });

    it('only the first date is used', () => {
      const r = parse('Move mon to fri');
      expect(r.due).toBe(local(2026, 9, 26));
      expect(r.title).toBe('Move to fri');
    });
  });

  describe('classes', () => {
    it('matches by course code in several spellings', () => {
      expect(parse('x #CSE110').classId).toBe('cse');
      expect(parse('x #cse-110').classId).toBe('cse');
      expect(parse('x #cse_110').classId).toBe('cse');
      expect(parse('x #math183').classId).toBe('math');
    });

    it('ignores deleted classes and unknown tags (kept in title)', () => {
      const r = parse('x #cogs9 #phys2');
      expect(r.classId).toBeUndefined();
      expect(r.title).toBe('x #cogs9 #phys2');
    });

    it('a bare # stays', () => {
      expect(parse('Item # 2').title).toBe('Item # 2');
    });
  });

  describe('priority', () => {
    it.each([
      ['!high', 'high'],
      ['!HIGH', 'high'],
      ['!med', 'medium'],
      ['!medium', 'medium'],
      ['!low', 'low'],
      ['!1', 'high'],
      ['!2', 'medium'],
      ['!3', 'low'],
    ])('%s → %s', (tok, p) => {
      const r = parse(`Thing ${tok}`);
      expect(r.priority).toBe(p);
      expect(r.title).toBe('Thing');
    });

    it('leaves unknown bang words alone', () => {
      expect(parse('Wow !nice').title).toBe('Wow !nice');
    });
  });

  describe('estimates and quick list', () => {
    it.each([
      ['~30m', 30],
      ['~30', 30],
      ['~45min', 45],
      ['~2h', 120],
      ['~1.5h', 90],
      ['~1h30m', 90],
    ])('%s → %i min', (tok, min) => {
      expect(parse(`Study ${tok}`).estimateMin).toBe(min);
    });

    it('estimate ≤ 15m makes a quick item', () => {
      expect(parse('Email TA ~10m').list).toBe('quick');
      expect(parse('Email TA ~15m').list).toBe('quick');
      expect(parse('Email TA ~16m').list).toBe('personal');
    });

    it('leading "q " forces quick', () => {
      const r = parse('q Reply to Sam');
      expect(r.list).toBe('quick');
      expect(r.title).toBe('Reply to Sam');
      expect(parse('Q tidy desk').list).toBe('quick');
    });

    it('a lone "q" is a title', () => {
      expect(parse('q')).toMatchObject({ title: 'q', list: 'personal' });
    });

    it('rejects nonsense estimates', () => {
      expect(parse('x ~abc').title).toBe('x ~abc');
      expect(parse('x ~0m').estimateMin).toBeUndefined();
    });
  });

  describe('do dates', () => {
    it('@weekday, @today, @tomorrow, @date', () => {
      expect(parse('x @wed').doDate).toBe('2026-10-28');
      expect(parse('x @today').doDate).toBe('2026-10-26');
      expect(parse('x @tomorrow').doDate).toBe('2026-10-27');
      expect(parse('x @tmr').doDate).toBe('2026-10-27');
      expect(parse('x @11/2').doDate).toBe('2026-11-02');
    });

    it('do date does not set due', () => {
      expect(parse('x @wed').due).toBeUndefined();
    });

    it('unknown @mentions stay in the title', () => {
      expect(parse('Ask @sam').title).toBe('Ask @sam');
    });
  });

  it('empty input', () => {
    expect(parse('   ')).toEqual({ title: '', priority: 'none', list: 'personal' });
  });
});

describe('buildDraft', () => {
  it('typed tokens win over the picker', () => {
    expect(buildDraft(parse('PA 3 fri #CSE110 !high'), 'class:math')).toMatchObject({
      classId: 'cse',
      priority: 'high',
      list: 'personal',
      due: local(2026, 9, 30),
      subtasks: [],
    });
    expect(buildDraft(parse('Read'), 'class:math').classId).toBe('math');
    expect(buildDraft(parse('Read'), 'quick')).toMatchObject({ list: 'quick', classId: undefined });
    // A typed class beats the Quick picker; a typed "q" beats a picked class.
    expect(buildDraft(parse('Read #CSE110'), 'quick')).toMatchObject({ list: 'personal', classId: 'cse' });
    expect(buildDraft(parse('q Read'), 'class:math')).toMatchObject({ list: 'quick', classId: undefined });
  });

  it('form edits win over typed tokens, including clearing them', () => {
    const d = buildDraft(parse('PA 3 fri #CSE110 ~2h'), 'personal', { due: undefined, classId: 'math', estimateMin: 45 });
    expect(d.due).toBeUndefined();
    expect(d.classId).toBe('math');
    expect(d.estimateMin).toBe(45);
    expect(buildDraft(parse('PA 3 #CSE110'), 'personal', { list: 'quick', classId: 'cse' }).classId).toBeUndefined();
  });

  it('works before anything is typed', () => {
    expect(buildDraft(null, 'personal', { notes: 'n' })).toEqual({
      due: undefined,
      doDate: undefined,
      classId: undefined,
      priority: 'none',
      estimateMin: undefined,
      list: 'personal',
      subtasks: [],
      notes: 'n',
    });
  });
});
