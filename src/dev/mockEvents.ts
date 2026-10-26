// Dev-only fixture: open http://localhost:5173/?mock to fill the store with realistic data.
import { addDays, setHours, setMinutes, startOfDay, startOfWeek } from 'date-fns';
import { isDone, useStore } from '../store';
import type { CalEvent, CalendarInfo } from '../types';

const SOURCE = 'mock:dev';

const calendars: CalendarInfo[] = [
  { id: 'mock:work', sourceKey: SOURCE, kind: 'google', name: 'Work', color: '#039be5', visible: true },
  { id: 'mock:personal', sourceKey: SOURCE, kind: 'google', name: 'Personal', color: '#33b679', visible: true },
  { id: 'mock:classes', sourceKey: SOURCE, kind: 'google', name: 'Class schedule', color: '#7986cb', visible: true },
  { id: 'mock:canvas', sourceKey: SOURCE, kind: 'canvas', name: 'Canvas — UC San Diego', color: '#e67c73', visible: true },
  { id: 'mock:holidays', sourceKey: SOURCE, kind: 'ics', name: 'US Holidays', color: '#0b8043', visible: true },
];

function at(day: Date, h: number, m = 0): string {
  return setMinutes(setHours(day, h), m).toISOString();
}

function buildEvents(now: Date): CalEvent[] {
  const today = startOfDay(now);
  const week = startOfWeek(today);
  const day = (offset: number) => addDays(week, offset);
  const events: CalEvent[] = [];
  let n = 0;
  const add = (e: Omit<CalEvent, 'id' | 'uid' | 'kind'> & Partial<Pick<CalEvent, 'kind'>>) => {
    const id = `mock-${n++}`;
    events.push({ kind: 'event', id, uid: id, ...e });
  };

  // Recurring-ish classes across five weeks.
  for (let w = -2; w <= 2; w++) {
    for (const d of [1, 3, 5]) {
      const dd = day(w * 7 + d);
      add({ calendarId: 'mock:classes', title: 'CSE 110 Lecture', start: at(dd, 9, 30), end: at(dd, 10, 50), allDay: false, location: 'CENTR 115', course: 'CSE 110' });
    }
    for (const d of [2, 4]) {
      const dd = day(w * 7 + d);
      add({ calendarId: 'mock:classes', title: 'MATH 183 Discussion', start: at(dd, 14), end: at(dd, 14, 50), allDay: false, location: 'APM 2402', course: 'MATH 183' });
    }
    const gym = day(w * 7 + 6);
    add({ calendarId: 'mock:personal', title: 'Gym', start: at(gym, 8), end: at(gym, 9), allDay: false });
  }

  // Overlapping meetings today.
  add({
    calendarId: 'mock:work',
    title: 'Team standup',
    start: at(today, 11),
    end: at(today, 11, 15),
    allDay: false,
    url: 'https://calendar.google.com/',
    description: '<p>Daily sync. Join: <a href="https://meet.google.com/abc-defg-hij">https://meet.google.com/abc-defg-hij</a></p><ul><li>Blockers</li><li>Demos</li></ul>',
  });
  add({ calendarId: 'mock:work', title: 'Design review', start: at(today, 11), end: at(today, 12, 30), allDay: false, location: 'Room 4B' });
  add({ calendarId: 'mock:personal', title: 'Lunch with Sam', start: at(today, 12), end: at(today, 13), allDay: false, location: 'Price Center' });
  add({ calendarId: 'mock:work', title: '1:1 with manager', start: at(today, 15), end: at(today, 15, 30), allDay: false });
  add({ calendarId: 'mock:work', title: 'Interview loop', start: at(today, 15), end: at(today, 17), allDay: false });
  add({ calendarId: 'mock:personal', title: 'Call mom', start: at(today, 16), end: at(today, 16, 20), allDay: false });

  // Late-night event crossing midnight.
  const fri = day(5);
  add({ calendarId: 'mock:personal', title: 'Movie night', start: at(fri, 22), end: at(addDays(fri, 1), 0, 30), allDay: false });

  // Multi-day and all-day events.
  add({ calendarId: 'mock:work', title: 'Hackathon', start: day(3).toISOString(), end: day(6).toISOString(), allDay: true, location: 'Atkinson Hall' });
  add({ calendarId: 'mock:work', title: 'Conference trip', start: at(day(9), 7), end: at(day(11), 19), allDay: false, location: 'San Francisco' });
  add({ calendarId: 'mock:holidays', title: 'Halloween', start: day(6).toISOString(), end: day(7).toISOString(), allDay: true });
  add({ calendarId: 'mock:holidays', title: 'Daylight Saving Time ends', start: day(7).toISOString(), end: day(8).toISOString(), allDay: true });
  add({ calendarId: 'mock:personal', title: "Alex's birthday", start: day(2).toISOString(), end: day(3).toISOString(), allDay: true });

  // Canvas-style assignments (start === end).
  const assignment = (offset: number, h: number, m: number, title: string, course: string) => {
    const due = at(day(offset), h, m);
    add({
      calendarId: 'mock:canvas',
      kind: 'assignment',
      title,
      course,
      start: due,
      end: due,
      allDay: false,
      url: 'https://canvas.ucsd.edu/courses/1/assignments/2',
      description: `${title} for ${course}. Submit on Canvas &amp; Gradescope.`,
    });
  };
  assignment(-3, 23, 59, 'Lab 3: Git workflows', 'CSE 110');
  assignment(1, 23, 59, 'Homework 4', 'MATH 183');
  assignment(2, 17, 0, 'Reading quiz 6', 'CSE 110');
  assignment(4, 23, 59, 'Project milestone 2', 'CSE 110');
  assignment(4, 23, 59, 'Problem set 5', 'MATH 183');
  assignment(5, 11, 0, 'Discussion post', 'COGS 9');
  assignment(8, 23, 59, 'Homework 5', 'MATH 183');
  assignment(12, 23, 59, 'Midterm reflection', 'COGS 9');
  assignment(19, 23, 59, 'Final project proposal', 'CSE 110');

  // Pad a busy day in month view to exercise "+N more".
  const busy = day(4);
  for (const [h, t] of [[8, 'Coffee chat'], [10, 'Office hours'], [13, 'Study group'], [18, 'Club meeting']] as const) {
    add({ calendarId: 'mock:personal', title: t, start: at(busy, h), end: at(busy, h + 1), allDay: false });
  }
  return events;
}

export function loadMockData(): void {
  const s = useStore.getState();
  s.setCalendarsForSource(SOURCE, calendars);
  s.setEventsForSource(SOURCE, buildEvents(new Date()));
  // Mark one deadline as done so the checked-off style is visible.
  const first = useStore.getState().eventsBySource[SOURCE].find((e) => e.kind === 'assignment');
  if (first && !isDone(useStore.getState(), first.uid)) s.toggleDone(first.uid);
  s.setOnboarded(true);
}
