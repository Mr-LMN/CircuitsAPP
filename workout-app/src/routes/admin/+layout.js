import { user, loading } from '$lib/store';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';

/**
 * @type {import('./$types').LayoutLoad}
 */
export async function load() {
	const waitForAuth = new Promise((resolve) => {
		const unsubscribe = loading.subscribe((isLoading) => {
			if (!isLoading) {
				unsubscribe();
				resolve();
			}
		});
	});

	await waitForAuth;

	const currentUser = get(user);
	if (!currentUser) {
		throw redirect(307, '/');
	}

	return {
		waitForAuth
	};
}
