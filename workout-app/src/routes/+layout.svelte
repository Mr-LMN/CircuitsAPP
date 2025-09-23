<script>
	import { onMount } from 'svelte';
	import { auth } from '$lib/firebase';
	import { onAuthStateChanged } from 'firebase/auth';
	import { user, loading } from '$lib/store';
	import '../app.css'; // Import our global styles

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
			if (firebaseUser) {
				$user = { email: firebaseUser.email, uid: firebaseUser.uid };
			} else {
				$user = null;
			}
			$loading = false;
		});

		return () => unsubscribe();
	});
</script>

<div class="app-container">
	{#if $loading}
		<p>Loading...</p>
	{:else}
		<slot />
	{/if}
</div>
