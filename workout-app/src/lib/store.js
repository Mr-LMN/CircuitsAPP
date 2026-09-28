// src/lib/store.js
import { writable } from 'svelte/store';

/**
 * @typedef {{ email: string | null; uid: string } | null} AuthUser
 */

export const user = writable(/** @type {AuthUser} */ (null));
export const loading = writable(true);
export const isAdmin = writable(false);
export const role = writable('staff');

/**
 * Convenience helper used throughout the app to clear authentication state.
 */
export function resetAuthState() {
	user.set(null);
	isAdmin.set(false);
	role.set('staff');
	loading.set(false);
}
