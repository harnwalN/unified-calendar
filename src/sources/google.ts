// STUB – replaced by the data-sources worker. Signatures are the contract.
import type { GoogleAccount } from '../types';

/**
 * Opens Google's consent popup (must be called from a click handler), exchanges the code
 * via the Worker, stores the account in the store, and returns it. Pass `loginHint`
 * (an email) to reconnect a specific account.
 */
export async function connectGoogleAccount(_loginHint?: string): Promise<GoogleAccount> {
  throw new Error('Google sign-in not implemented yet');
}

/** Revokes the refresh token (best effort) and removes the account + its calendars. */
export async function disconnectGoogleAccount(_accountId: string): Promise<void> {}
