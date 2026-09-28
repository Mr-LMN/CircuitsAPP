<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	export let title = 'Are you sure?';
	export let message = '';
	export let confirmLabel = 'Confirm';
	export let destructive = false;
	export let onConfirm = () => {};
	export let onCancel = () => {};
	let dialog;
	let cancelButton;

	onMount(() => cancelButton?.focus());
	function keydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onCancel();
		}
		if (event.key !== 'Tab') return;
		const focusable = [...dialog.querySelectorAll('button:not(:disabled)')];
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}
</script>

<svelte:window on:keydown={keydown} />
<div class="dialog-backdrop" role="presentation">
	<div
		bind:this={dialog}
		class="confirm-dialog"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="confirm-title"
		aria-describedby="confirm-message"
	>
		<h2 id="confirm-title">{title}</h2>
		<p id="confirm-message">{message}</p>
		<div>
			<button bind:this={cancelButton} type="button" class="cancel" on:click={onCancel}
				>Cancel</button
			><button type="button" class:destructive on:click={onConfirm}>{confirmLabel}</button>
		</div>
	</div>
</div>

<style>
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1200;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(2, 6, 23, 0.82);
		backdrop-filter: blur(8px);
	}
	.confirm-dialog {
		width: min(480px, 100%);
		padding: 1.5rem;
		border: 1px solid var(--border-color);
		border-radius: 24px;
		background: var(--bg-panel);
		box-shadow: var(--shadow-soft);
	}
	.confirm-dialog h2 {
		font-family: var(--font-display);
		font-size: 2.4rem;
	}
	.confirm-dialog p {
		margin: 0.5rem 0 1.2rem;
		color: var(--text-secondary);
	}
	.confirm-dialog div {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}
	button {
		min-height: 44px;
		border-radius: 999px;
		padding: 0.7rem 1rem;
		background: var(--brand-green);
		color: #052e16;
		font-weight: 900;
		cursor: pointer;
	}
	button.cancel {
		border: 1px solid var(--border-color);
		background: transparent;
		color: var(--text-secondary);
	}
	button.destructive {
		background: var(--error);
		color: #19070b;
	}
</style>
