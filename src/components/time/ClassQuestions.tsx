// "Are these classes?" — repeating events no class claims, with a quick picker for each.
import { useMemo } from 'react';
import { useAllEvents } from '../../store/selectors';
import { useClasses } from '../../store/tasks';
import { assignEventTitle, suggestClassName, unclassifiedRecurring, useClassMatcher } from '../../features/classMeetings';
import { useStore } from '../../store';
import ClassSelect from '../ClassSelect';
import Icon from '../Icon';

const MAX_SHOWN = 5;
const NOT_A_CLASS = [{ value: 'none', label: 'Not a class' }];

export default function ClassQuestions() {
  const events = useAllEvents();
  const match = useClassMatcher();
  const hasClasses = useClasses().length > 0;
  const notClass = useStore((s) => s.settings.notClassTitles);
  const questions = useMemo(() => unclassifiedRecurring(events, match, notClass), [events, match, notClass]);

  if (!questions.length) return null;
  return (
    <section className="class-questions" aria-labelledby="class-questions-title">
      <h3 id="class-questions-title">
        <Icon name="school" /> Are any of these classes?
      </h3>
      <p>
        {hasClasses
          ? 'Pick a class for repeating events so their meetings count toward that class. Course codes in titles are matched automatically.'
          : 'Choose “New class…” for repeating events that are classes, so their meetings count toward that class.'}
      </p>
      <ul>
        {questions.slice(0, MAX_SHOWN).map((q) => (
          <li key={q.key}>
            <span title={q.title}>
              {q.title}
              <small>×{q.count}</small>
            </span>
            <ClassSelect
              label={`Class for ${q.title}`}
              value=""
              placeholder="Which class?"
              extraOptions={NOT_A_CLASS}
              suggestedName={suggestClassName(q.title)}
              onChange={(v) => v && assignEventTitle(q.title, v)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
