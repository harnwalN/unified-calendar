// <option>s for picking a class or topic: grouped when both exist, plus "New class…" / "New topic…".
import type { ClassInfo } from '../types';
import { isTopic } from '../store/tasks';

export const NEW_CLASS = '__new_class__';
export const NEW_TOPIC = '__new_topic__';

/** Which kind a "New…" option value creates, or null for any other value. */
export const newKindOf = (value: string): 'class' | 'topic' | null =>
  value === NEW_CLASS ? 'class' : value === NEW_TOPIC ? 'topic' : null;

export default function ClassOptions({ classes, exclude, withNew = true }: { classes: ClassInfo[]; exclude?: string; withNew?: boolean }) {
  const shown = classes.filter((c) => c.id !== exclude);
  const schoolClasses = shown.filter((c) => !isTopic(c));
  const topics = shown.filter(isTopic);
  const opts = (list: ClassInfo[]) =>
    list.map((c) => (
      <option key={c.id} value={c.id}>
        {c.name}
      </option>
    ));
  return (
    <>
      {topics.length ? (
        <>
          {schoolClasses.length > 0 && <optgroup label="Classes">{opts(schoolClasses)}</optgroup>}
          <optgroup label="Topics">{opts(topics)}</optgroup>
        </>
      ) : (
        opts(schoolClasses)
      )}
      {withNew && (
        <>
          <option value={NEW_CLASS}>＋ New class…</option>
          <option value={NEW_TOPIC}>＋ New topic…</option>
        </>
      )}
    </>
  );
}
