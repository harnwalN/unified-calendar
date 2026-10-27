import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { isDone, taskRef, useStore } from '../store';
import { plannedTaskRef, useAllEvents, useCalendarColor } from '../store/selectors';
import { describeWhen } from '../lib/time';
import type { CalEvent, SourceKind } from '../types';
import Icon from './Icon';
import { useClasses } from '../store/tasks';
import { assignEventTitle, isMeetingCandidate, useClassMatcher } from '../features/classMeetings';
import { htmlToText, linkify, safeHref } from './eventText';
import './EventPopover.css';

const OPEN_LABEL: Record<SourceKind, string> = {
  google: 'Open in Google Calendar',
  canvas: 'Open in Canvas',
  ics: 'Open link',
};

export default function EventPopover() {
  const selectedId = useStore((s) => s.selectedEventId);
  const all = useAllEvents();
  const event = useMemo(() => (selectedId ? all.find((e) => e.id === selectedId) : undefined), [all, selectedId]);
  const assignmentUid = event?.kind === 'assignment' ? event.uid : undefined;
  const plannedRef = selectedId ? plannedTaskRef(selectedId) : null;
  // Assignments and scheduled work blocks are tasks: open them in the TaskDetail drawer instead.
  useEffect(() => {
    const ref = plannedRef ?? (assignmentUid ? taskRef.assignment(assignmentUid) : null);
    if (!ref) return;
    const s = useStore.getState();
    s.selectEvent(null);
    s.selectTask(ref);
  }, [assignmentUid, plannedRef]);
  if (!event || assignmentUid) return null;
  return <PopoverCard event={event} />;
}

function PopoverCard({ event }: { event: CalEvent }) {
  const selectEvent = useStore((s) => s.selectEvent);
  const calendar = useStore((s) => s.calendars[event.calendarId]);
  const done = useStore((s) => isDone(s, event.uid));
  const toggleDone = useStore((s) => s.toggleDone);
  const color = useCalendarColor(event.calendarId);
  const cardRef = useRef<HTMLDivElement>(null);
  const close = () => selectEvent(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>('.event-popover-close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useStore.getState().selectEvent(null);
      } else if (e.key === 'Tab' && cardRef.current) {
        // Keep focus inside the dialog.
        const items = cardRef.current.querySelectorAll<HTMLElement>('button, a[href], input, select');
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  const description = event.description ? htmlToText(event.description) : '';
  const href = safeHref(event.url);
  const assignment = event.kind === 'assignment';

  return (
    <>
      <div className="scrim event-popover-scrim" onClick={close} />
      <div
        ref={cardRef}
        className="event-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-popover-title"
        style={{ '--ev': color } as CSSProperties}
      >
        <div className="event-popover-bar">
          <span className="event-popover-handle" aria-hidden="true" />
          <button className="icon-btn event-popover-close" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <div className="event-popover-body">
          <div className="ep-row ep-title-row">
            <span className="ep-swatch" aria-hidden="true" />
            <div className="ep-main">
              <h2 id="event-popover-title" className={done ? 'done' : undefined}>
                {event.title || '(No title)'}
              </h2>
              <p className="ep-when">{describeWhen(event)}</p>
            </div>
          </div>

          {assignment && (
            <label className="ep-row ep-done">
              <span className="ep-icon">
                <input type="checkbox" checked={done} onChange={() => toggleDone(event.uid)} />
              </span>
              <span>{done ? 'Done' : 'Mark as done'}</span>
            </label>
          )}

          {isMeetingCandidate(event) && <ClassPick event={event} />}
          {event.course && !isMeetingCandidate(event) && (
            <div className="ep-row">
              <Icon name="school" className="ep-icon" />
              <span>{event.course}</span>
            </div>
          )}
          {event.location && (
            <div className="ep-row">
              <Icon name="location_on" className="ep-icon" />
              <span className="ep-text">
                <Linkified text={event.location} />
              </span>
            </div>
          )}
          {description && (
            <div className="ep-row">
              <Icon name="notes" className="ep-icon" />
              <p className="ep-text ep-desc">
                <Linkified text={description} />
              </p>
            </div>
          )}
          {calendar && (
            <div className="ep-row">
              <Icon name="calendar_today" className="ep-icon" />
              <span>{calendar.name}</span>
            </div>
          )}

          {href && (
            <div className="ep-actions">
              <a className="filled-btn" href={href} target="_blank" rel="noopener noreferrer">
                <Icon name="open_in_new" size={18} />
                {OPEN_LABEL[calendar?.kind ?? 'ics']}
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Which class this event (and every event with the same title) is a meeting of. */
function ClassPick({ event }: { event: CalEvent }) {
  const classes = useClasses();
  const match = useClassMatcher()(event);
  if (!classes.length) return null;
  const value = match ? (match.source === 'manual' ? match.cls.id : 'auto') : 'none';
  return (
    <div className="ep-row class-pick">
      <Icon name="school" className="ep-icon" />
      <label className="ep-text">
        <span className="sr-only">Class</span>
        <select value={value} onChange={(e) => assignEventTitle(event.title, e.target.value)}>
          {match?.source === 'auto' && <option value="auto">{match.cls.name} (from the title)</option>}
          {!match && <option value="none">Not a class</option>}
          {classes
            .filter((c) => !(match?.source === 'auto' && c.id === match.cls.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          {match && <option value="none">Not a class</option>}
          {value !== 'auto' && <option value="auto">Detect automatically</option>}
        </select>
        <span className="class-pick-hint">Applies to every “{event.title.trim()}”</span>
      </label>
    </div>
  );
}

function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
