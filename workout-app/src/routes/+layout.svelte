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

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link
		href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="app-container">
	{#if $loading}
		<p>Loading...</p>
	{:else}
		<slot />
	{/if}
</div>
