<script>
	// @ts-nocheck
	import { notify } from '$lib/toasts';
	export let workoutId;
	export let title = 'Workout';
	async function share() {
		const url = new URL(`/workout/${workoutId}`, window.location.origin).toString();
		try {
			if (navigator.share)
				await navigator.share({ title, text: `Try ${title} in CircuitsAPP`, url });
			else {
				await navigator.clipboard.writeText(url);
				notify('✓ Workout link copied', 'success');
			}
		} catch (error) {
			if (error?.name !== 'AbortError') notify('Could not share this workout', 'error');
		}
	}
</script>

<button type="button" class="share" on:click={share}>SHARE WORKOUT</button>

<style>
	.share {
		border: 1px solid var(--border-color);
		background: var(--surface-2);
		color: var(--text-primary);
		border-radius: 8px;
		padding: 0.65rem 0.85rem;
		font-weight: 800;
		cursor: pointer;
	}
</style>
