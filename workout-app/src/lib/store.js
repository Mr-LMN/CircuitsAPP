// src/lib/store.js

import { writable } from 'svelte/store';

export const user = writable(null); // Starts as null because no user is logged in
export const loading = writable(true); // To track the initial auth check