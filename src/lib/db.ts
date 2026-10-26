// IndexedDB cache of synced events, one entry per source key.
import { clear, createStore, del, entries, set } from 'idb-keyval';
import type { CalEvent } from '../types';

const store = createStore('unified-calendar', 'events');

export async function saveSourceEvents(sourceKey: string, events: CalEvent[]): Promise<void> {
  await set(sourceKey, events, store);
}

export async function loadAllSourceEvents(): Promise<Record<string, CalEvent[]>> {
  const all = await entries<string, CalEvent[]>(store);
  return Object.fromEntries(all.filter(([, v]) => Array.isArray(v)));
}

export async function deleteSourceEvents(sourceKey: string): Promise<void> {
  await del(sourceKey, store);
}

export async function clearAll(): Promise<void> {
  await clear(store);
}
