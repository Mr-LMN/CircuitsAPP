<script>
	// @ts-nocheck
	export let station = null;
	export let index = -1;
	export let prominent = false;
</script>

{#if station && index >= 0}
	<section class="next-station" class:prominent aria-labelledby="next-station-title">
		<span>Next</span>
		<div>
			<strong id="next-station-title">Station {index + 1}</strong>
			<p>{station.name}</p>
		</div>
		{#if station.target}<b>{station.target}</b>{/if}
	</section>
{/if}

<style>
	.next-station {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.8rem;
		border: 1px solid var(--border-color);
		border-radius: 16px;
		background: var(--surface-1);
	}
	.next-station > span {
		color: var(--brand-blue);
		font-size: 0.68rem;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.next-station div {
		flex: 1;
	}
	.next-station p {
		color: var(--text-secondary);
	}
	.next-station b {
		color: var(--text-muted);
	}
	.next-station.prominent {
		border-color: rgba(56, 189, 248, 0.45);
		transform: scale(1.01);
	}
	@media (prefers-reduced-motion: reduce) {
		.next-station.prominent {
			transform: none;
		}
	}
</style>
