// Going / Skip for one class or topic meeting; "Skip" marks just this occurrence not attending.
import type { CalEvent } from '../types';
import { setMeetingSkipped } from '../features/classMeetings';
import './GoingToggle.css';

export default function GoingToggle({ classId, event, skipped }: { classId: string; event: CalEvent; skipped: boolean }) {
  return (
    <div className="going" role="radiogroup" aria-label={`Going to ${event.title}?`}>
      <button role="radio" aria-checked={!skipped} className={!skipped ? 'on' : undefined} onClick={() => skipped && setMeetingSkipped(classId, event, false)}>
        Going
      </button>
      <button role="radio" aria-checked={skipped} className={skipped ? 'on' : undefined} onClick={() => !skipped && setMeetingSkipped(classId, event, true)}>
        Skip
      </button>
    </div>
  );
}
