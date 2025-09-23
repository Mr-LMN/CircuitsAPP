<script>
	import { user, loading } from '$lib/store';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// This is a "reactive statement". It will re-run whenever
	// the value of 'loading' or 'user' changes.
	$: if (!$loading && !$user) {
		goto(resolve('/')); // If loading is done and there's no user, redirect.
	}
</script>

{#if $user}
	<slot />
{:else}
	<p>Verifying access...</p>
{/if}
