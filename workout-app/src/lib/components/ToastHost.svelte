<script>
	import { dismissToast, toasts } from '$lib/toasts';
</script>

<div class="toast-host" aria-live="polite" aria-atomic="false">
	{#each $toasts as toast (toast.id)}
		<div class="toast {toast.type}" role={toast.type === 'error' ? 'alert' : 'status'}>
			<span>{toast.message}</span><button
				aria-label="Dismiss notification"
				on:click={() => dismissToast(toast.id)}>×</button
			>
		</div>
	{/each}
</div>

<style>
	.toast-host {
		position: fixed;
		z-index: 3000;
		right: max(1rem, env(safe-area-inset-right));
		bottom: max(5.5rem, calc(env(safe-area-inset-bottom) + 1rem));
		display: grid;
		gap: 0.6rem;
		width: min(24rem, calc(100vw - 2rem));
		pointer-events: none;
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border-color);
		border-left: 5px solid #60a5fa;
		border-radius: 12px;
		color: white;
		background: #172033;
		box-shadow: 0 12px 35px #0008;
		animation: enter 0.18s ease-out;
		font-weight: 700;
	}
	.toast.success {
		border-left-color: #34d399;
	}
	.toast.warning {
		border-left-color: #fbbf24;
	}
	.toast.error {
		border-left-color: #fb7185;
	}
	button {
		border: 0;
		background: transparent;
		color: inherit;
		font-size: 1.4rem;
		cursor: pointer;
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toast {
			animation: none;
		}
	}
</style>
