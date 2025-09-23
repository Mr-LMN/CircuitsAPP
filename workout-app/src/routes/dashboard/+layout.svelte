<script>
	import { user, loading } from '$lib/store';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	$: if (!$loading && !$user) {
		goto(resolve('/'));
	}
</script>

{#if $user}
	<slot />
{:else}
	<p>Verifying access...</p>
{/if}
