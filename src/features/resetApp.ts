import { useStore } from '../store';
import { disconnectGoogleAccount } from '../sources/google';
import { FIRED_KEY } from './reminders';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

const timeout = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Revokes Google access (best effort), wipes every local trace of the app, then reloads. */
export async function resetApp(): Promise<void> {
  const { accounts } = useStore.getState();
  await Promise.race([
    Promise.allSettled(accounts.map((a) => disconnectGoogleAccount(a.id))),
    timeout(4000),
  ]);
  // Every key the app writes (store, reminders, granted Google scopes, last timed task, collapsed sections).
  for (const key of ['unified-calendar', FIRED_KEY, 'unified-calendar:granted-scopes', 'time:lastRef', 'tasks-home:collapsed']) {
    localStorage.removeItem(key);
  }
  await Promise.race([deleteDatabase('unified-calendar'), timeout(3000)]);
  location.reload();
}
