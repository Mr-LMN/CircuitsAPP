// src/lib/store.js
import { writable } from 'svelte/store';

/**
 * @typedef {{ email: string | null; uid: string } | null} AuthUser
 */

export const user = writable(/** @type {AuthUser} */ (null));
export const loading = writable(true);
