import { user } from '$lib/store';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';

export function load() {
  const currentUser = get(user);

  // If there is no user logged in, they cannot access the admin area.
  if (!currentUser) {
    throw redirect(307, '/');
  }
}
