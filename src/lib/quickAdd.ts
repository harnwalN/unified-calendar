// Pure natural-language parser behind the home screen's quick-add box.
// "PA 3 fri 11:59pm #CSE110 !high ~2h @wed" → title "PA 3", due Fri 11:59 PM, class CSE 110, …
import { addDays, format, startOfDay } from 'date-fns';
import type { ClassInfo, Priority, Subtask } from '../types';
import { courseCode } from '../store/tasks';

export interface QuickAddResult {
  title: string;
  /** ISO from `toISOString()`. */
  due?: string;
  /** Local `yyyy-MM-dd`. */
  doDate?: string;
  classId?: string;
  priority: Priority;
  estimateMin?: number;
  list: 'personal' | 'quick';
}

/** Everything the add form can set besides the title. */
export interface TaskDraft {
  /** ISO. */
  due?: string;
  /** Local `yyyy-MM-dd`. */
  doDate?: string;
  classId?: string;
  priority: Priority;
  estimateMin?: number;
  list: 'personal' | 'quick';
  notes?: string;
  subtasks: Subtask[];
}

/** Where a new task goes unless the text or the form says otherwise. */
export type AddTarget = 'personal' | 'quick' | `class:${string}`;

/**
 * Form values for a new task. Typed tokens win over the "Add to" picker (#CSE110 picks a class,
 * a leading "q" or a short estimate makes it quick); fields edited in the form win over both
 * (an explicit `undefined` in `edits` clears a typed value). Quick items never keep a class.
 */
export function buildDraft(parsed: QuickAddResult | null, target: AddTarget, edits: Partial<TaskDraft> = {}): TaskDraft {
  const picked = target.startsWith('class:') ? target.slice(6) : undefined;
  const quick = parsed?.list === 'quick' || (!parsed?.classId && target === 'quick');
  const draft: TaskDraft = {
    due: parsed?.due,
    doDate: parsed?.doDate,
    classId: parsed?.classId ?? picked,
    priority: parsed?.priority ?? 'none',
    estimateMin: parsed?.estimateMin,
    list: quick ? 'quick' : 'personal',
    subtasks: [],
    ...edits,
  };
  if (draft.list === 'quick') draft.classId = undefined;
  return draft;
}

/** Estimates at or below this many minutes make a task a quick item. */
export const QUICK_MAX_MIN = 15;

const WEEKDAYS: [RegExp, number][] = [
  [/^sun(day)?$/, 0],
  [/^mon(day)?$/, 1],
  [/^tue(s|sday)?$/, 2],
  [/^wed(s|nesday)?$/, 3],
  [/^thu(r|rs|rsday)?$/, 4],
  [/^fri(day)?$/, 5],
  [/^sat(urday)?$/, 6],
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const PRIORITIES: Record<string, Priority> = {
  high: 'high', hi: 'high', h: 'high', '1': 'high',
  medium: 'medium', med: 'medium', m: 'medium', '2': 'medium',
  low: 'low', lo: 'low', l: 'low', '3': 'low',
};

function monthIndex(word: string): number {
  return MONTH_WORD.test(word) ? MONTHS.findIndex((m) => word.startsWith(m)) : -1;
}

/** A day word ("fri", "tmr", "today") relative to `now`; weekdays mean the next occurrence (today counts). */
function parseDayWord(word: string, now: Date): Date | undefined {
  const w = word.toLowerCase();
  const today = startOfDay(now);
  if (w === 'today' || w === 'tod') return today;
  if (w === 'tomorrow' || w === 'tmr' || w === 'tmrw' || w === 'tom') return addDays(today, 1);
  for (const [re, dow] of WEEKDAYS) {
    if (re.test(w)) return addDays(today, (dow - today.getDay() + 7) % 7);
  }
  return undefined;
}

/** A calendar date this year, rolling to next year if it is more than ~2 months past. */
function makeDate(month: number, day: number, now: Date): Date | undefined {
  if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  let d = new Date(now.getFullYear(), month, day);
  if (d.getMonth() !== month) return undefined;
  if (d.getTime() < startOfDay(now).getTime() - 60 * 86_400_000) d = new Date(now.getFullYear() + 1, month, day);
  return d;
}

/** "5pm", "11:59pm", "17:00", "9am", "noon", "midnight" → minutes after midnight. */
function parseTime(word: string): number | undefined {
  const w = word.toLowerCase();
  if (w === 'noon') return 12 * 60;
  if (w === 'midnight') return 23 * 60 + 59;
  let m = w.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return undefined;
    if (m[3].startsWith('p') && h !== 12) h += 12;
    if (m[3].startsWith('a') && h === 12) h = 0;
    return h * 60 + min;
  }
  m = w.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return undefined;
    return h * 60 + min;
  }
  return undefined;
}

/** "~30m", "~2h", "~1.5h", "~1h30m", "~45" → minutes. */
function parseEstimate(body: string): number | undefined {
  const w = body.toLowerCase();
  const hm = w.match(/^(\d+(?:\.\d+)?)h(?:(\d+)m?)?$/);
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] ?? 0));
  const m = w.match(/^(\d+)(?:m|min|mins)?$/);
  if (m) return Number(m[1]);
  return undefined;
}

function findClass(tag: string, classes: ClassInfo[]): ClassInfo | undefined {
  const live = classes.filter((c) => !c.deleted);
  const code = courseCode(tag.replace(/[-_]/g, ' '));
  const squash = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return (
    live.find((c) => courseCode(c.name) === code || c.aliases.some((a) => courseCode(a) === code)) ??
    live.find((c) => squash(c.name) === squash(tag) || c.aliases.some((a) => squash(a) === squash(tag)))
  );
}

/**
 * Parse a quick-add line. Recognised tokens are removed from the title; anything
 * unrecognised (e.g. "#unknown") stays in it.
 */
export function parseQuickAdd(text: string, now: Date, classes: ClassInfo[]): QuickAddResult {
  let tokens = text.trim().split(/\s+/).filter(Boolean);
  const result: QuickAddResult = { title: '', priority: 'none', list: 'personal' };
  let forcedQuick = false;
  if (tokens.length > 1 && tokens[0].toLowerCase() === 'q') {
    forcedQuick = true;
    tokens = tokens.slice(1);
  }

  const keep: string[] = [];
  let dueDay: Date | undefined;
  let dueMin: number | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const low = tok.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    if (tok.length > 1 && tok.startsWith('#')) {
      const cls = findClass(tok.slice(1), classes);
      if (cls && !result.classId) {
        result.classId = cls.id;
        continue;
      }
    }
    if (tok.length > 1 && tok.startsWith('!')) {
      const p = PRIORITIES[low.slice(1)];
      if (p) {
        result.priority = p;
        continue;
      }
    }
    if (tok.length > 1 && tok.startsWith('~')) {
      const est = parseEstimate(tok.slice(1));
      if (est !== undefined && est > 0) {
        result.estimateMin = est;
        continue;
      }
    }
    if (tok.length > 1 && tok.startsWith('@')) {
      const body = low.slice(1);
      const d = parseDayWord(body, now) ?? parseNumericDate(body, now);
      if (d) {
        result.doDate = format(d, 'yyyy-MM-dd');
        continue;
      }
    }

    if (!dueDay) {
      // "oct 30" / "october 30th" / "30 oct"
      const mi = monthIndex(low);
      const dayNum = next?.match(/^(\d{1,2})(st|nd|rd|th)?,?$/);
      if (mi >= 0 && dayNum) {
        const d = makeDate(mi, Number(dayNum[1]), now);
        if (d) {
          dueDay = d;
          i++;
          continue;
        }
      }
      const d = parseDayWord(low, now) ?? parseNumericDate(low, now);
      if (d) {
        dueDay = d;
        continue;
      }
    }
    if (dueMin === undefined) {
      const t = parseTime(low);
      if (t !== undefined) {
        dueMin = t;
        continue;
      }
      // "at 5pm"
      if (low === 'at' && next && parseTime(next) !== undefined) {
        dueMin = parseTime(next);
        i++;
        continue;
      }
    }
    keep.push(tok);
  }

  if (dueDay || dueMin !== undefined) {
    let day = dueDay ?? startOfDay(now);
    const minutes = dueMin ?? 23 * 60 + 59;
    let due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    if (!dueDay && due.getTime() <= now.getTime()) {
      day = addDays(day, 1);
      due = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
    }
    result.due = due.toISOString();
  }

  // Drop a dangling "due"/"by" left behind after its date was parsed.
  if (result.due && keep.length > 1 && /^(due|by|on)$/i.test(keep[keep.length - 1])) keep.pop();
  result.title = keep.join(' ');
  if (forcedQuick || (result.estimateMin !== undefined && result.estimateMin <= QUICK_MAX_MIN)) result.list = 'quick';
  return result;
}

const MONTH_WORD = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)$/;

/** "10/30" or "10/30/2026" (US order). */
function parseNumericDate(word: string, now: Date): Date | undefined {
  const m = word.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return undefined;
  if (m[3]) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    return d.getMonth() === Number(m[1]) - 1 ? d : undefined;
  }
  return makeDate(Number(m[1]) - 1, Number(m[2]), now);
}
