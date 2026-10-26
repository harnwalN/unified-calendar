// STUB – replaced by the data-sources worker. Signatures are the contract.

/** Sync every Google account and feed now. Safe to call repeatedly (deduped). */
export async function syncAll(): Promise<void> {}

/** Sync a single source by its source key (see store/sourceKeyFor). */
export async function syncSource(_sourceKey: string): Promise<void> {}

/**
 * Mount once in <App/>: hydrates cached events from IndexedDB, syncs on open,
 * every SYNC_INTERVAL_MS, and when the tab regains focus / comes back online.
 */
export function useSync(): void {}
