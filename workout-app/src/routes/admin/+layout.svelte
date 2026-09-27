<script>
	import { user, loading, isAdmin } from '$lib/store';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// This is a "reactive statement". It will re-run whenever
	// the value of 'loading' or 'user' changes.
	$: if (!$loading && (!$user || !$isAdmin)) {
		goto(resolve('/dashboard'));
	}
</script>

{#if $user && $isAdmin}
	<slot />
{:else}
	<p role="status">Verifying coach access...</p>
{/if}
