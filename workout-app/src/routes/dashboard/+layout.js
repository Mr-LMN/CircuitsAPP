// src/routes/dashboard/+layout.js
import { user } from '$lib/store';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';

export function load() {
	// Get the current value of the user from the store
	const currentUser = get(user);

	// If there is no user logged in, redirect them to the home page
	if (!currentUser) {
		throw redirect(307, '/');
	}
}
