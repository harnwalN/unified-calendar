// Running-timer pill for the TopBar; also owns the Shift+Space shortcut and the tab-title prefix.
import { useEffect } from 'react';
import { useStore } from '../../store';
import { stopOrResume, stopTimer, useRunningElapsed, useTaskTitle } from '../../features/timer';
import { formatClock } from '../../features/timeStats';
import Icon from '../Icon';
import './TimerPill.css';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Shift+Space (when not typing): stop the timer, or resume the last-timed task. */
function useTimerShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.defaultPrevented || isTyping(e.target)) return;
      e.preventDefault();
      stopOrResume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** "▶ 0:25 · Calendar" while a timer runs; restores the original title afterwards. */
function useTitlePrefix(elapsed: number, running: boolean) {
  const label = running ? formatClock(elapsed).replace(/:\d\d$/, '') : null;
  useEffect(() => {
    if (!label) return;
    const base = document.title;
    document.title = `▶ ${label} · ${base}`;
    return () => {
      document.title = base;
    };
  }, [label]);
}

export default function TimerPill() {
  const timer = useStore((s) => s.runningTimer);
  const elapsed = useRunningElapsed();
  const label = useTaskTitle(timer?.taskRef);
  useTimerShortcut();
  useTitlePrefix(elapsed, !!timer);

  if (!timer || !label) return null;
  const clock = formatClock(elapsed);
  return (
    <div className="timer-pill" role="group" aria-label="Running timer">
      <button
        className="timer-pill-main"
        onClick={() => useStore.getState().selectTask(timer.taskRef)}
        title={`${label.title} · ${label.groupName} — open task`}
        aria-label={`Timing ${label.title}, ${clock}. Open task`}
      >
        <span className="timer-pill-dot" style={{ background: label.color }} aria-hidden="true" />
        <span className="timer-pill-title">{label.title}</span>
        <span className="timer-pill-clock" aria-hidden="true">{clock}</span>
      </button>
      <button className="timer-pill-stop" onClick={stopTimer} aria-label="Stop timer" title="Stop timer (Shift+Space)">
        <Icon name="stop" />
      </button>
    </div>
  );
}
