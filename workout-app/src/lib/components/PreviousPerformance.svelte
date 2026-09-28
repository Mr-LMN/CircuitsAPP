<script>
	// @ts-nocheck
	import { formatPerformance } from '$lib/performance';
	export let performance = null;
</script>

{#if performance && formatPerformance(performance.latest)}
	<aside class="previous-performance" aria-label="Previous performance">
		<div><span>Last time</span><strong>{formatPerformance(performance.latest)}</strong></div>
		{#if performance.best && formatPerformance(performance.best) !== formatPerformance(performance.latest)}
			<div><span>PB</span><strong>{formatPerformance(performance.best)}</strong></div>
		{/if}
	</aside>
{/if}

<style>
	.previous-performance {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin: 0.8rem 0;
	}
	.previous-performance div {
		display: grid;
		gap: 0.1rem;
		min-width: 120px;
		padding: 0.65rem 0.8rem;
		border: 1px solid var(--border-color);
		border-radius: 14px;
		background: rgba(56, 189, 248, 0.06);
	}
	.previous-performance span {
		color: var(--text-muted);
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.previous-performance strong {
		color: var(--text-secondary);
	}
</style>
