<script>
	export let status = 'connected';

	$: label =
		status === 'offline'
			? 'Offline – timer continuing locally'
			: status === 'reconnecting'
				? 'Reconnecting'
				: 'Connected';
</script>

<div
	class="connection-status"
	class:offline={status === 'offline'}
	class:reconnecting={status === 'reconnecting'}
	role="status"
	aria-live="polite"
>
	<span class="dot" aria-hidden="true"></span>
	{label}
</div>

<style>
	.connection-status {
		display: inline-flex;
		min-height: 2rem;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgba(74, 222, 128, 0.24);
		border-radius: 999px;
		padding: 0.35rem 0.65rem;
		background: rgba(74, 222, 128, 0.08);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 800;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--success);
	}
	.connection-status.reconnecting {
		border-color: rgba(250, 204, 21, 0.28);
		background: rgba(250, 204, 21, 0.08);
	}
	.connection-status.reconnecting .dot {
		background: var(--brand-yellow);
		animation: pulse 1.2s infinite;
	}
	.connection-status.offline {
		border-color: rgba(251, 113, 133, 0.3);
		background: rgba(251, 113, 133, 0.08);
	}
	.connection-status.offline .dot {
		background: var(--error);
	}
	@media (prefers-reduced-motion: reduce) {
		.connection-status.reconnecting .dot {
			animation: none;
		}
	}
</style>
