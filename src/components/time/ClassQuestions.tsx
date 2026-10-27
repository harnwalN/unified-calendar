// "Are these classes?" — repeating events no class claims, with a quick picker for each.
import { useMemo } from 'react';
import { useAllEvents } from '../../store/selectors';
import { useClasses } from '../../store/tasks';
import { assignEventTitle, unclassifiedRecurring, useClassMatcher } from '../../features/classMeetings';
import { useStore } from '../../store';
import Icon from '../Icon';

const MAX_SHOWN = 5;

export default function ClassQuestions() {
  const events = useAllEvents();
  const match = useClassMatcher();
  const classes = useClasses();
  const notClass = useStore((s) => s.settings.notClassTitles);
  const questions = useMemo(() => unclassifiedRecurring(events, match, notClass), [events, match, notClass]);

  if (!questions.length || !classes.length) return null;
  return (
    <section className="class-questions" aria-labelledby="class-questions-title">
      <h3 id="class-questions-title">
        <Icon name="school" /> Are any of these classes?
      </h3>
      <p>Pick a class for repeating events so their meetings count toward that class. Course codes in titles are matched automatically.</p>
      <ul>
        {questions.slice(0, MAX_SHOWN).map((q) => (
          <li key={q.key}>
            <span title={q.title}>
              {q.title}
              <small>×{q.count}</small>
            </span>
            <select
              aria-label={`Class for ${q.title}`}
              value=""
              onChange={(e) => e.target.value && assignEventTitle(q.title, e.target.value)}
            >
              <option value="">Which class?</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="none">Not a class</option>
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
