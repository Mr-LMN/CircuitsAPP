<script>
	import { onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';

	let isOpen = false;
	let lastPathname = '';

	const navItems = [
		{ path: '/dashboard', href: resolve('/dashboard'), label: 'Dashboard', icon: '⌁' },
		{ path: '/admin/workouts', href: resolve('/admin/workouts'), label: 'Workouts', icon: '▦' },
		{ path: '/admin/create', href: resolve('/admin/create'), label: 'Create', icon: '+' },
		{ path: '/admin/sessions', href: resolve('/admin/sessions'), label: 'Sessions', icon: '◷' },
		{ path: '/admin/attendance', href: resolve('/admin/attendance'), label: 'Check-in', icon: '✓' }
	];

	const stopWatchingPage = page.subscribe(($page) => {
		if (lastPathname && lastPathname !== $page.url.pathname) {
			isOpen = false;
		}
		lastPathname = $page.url.pathname;
	});

	onDestroy(() => {
		stopWatchingPage();
	});

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function closeMenu() {
		isOpen = false;
	}

	/** @param {KeyboardEvent} event */
	function handleKeydown(event) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeMenu();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="admin-nav">
	<a class="brand-pill" href={resolve('/dashboard')} aria-label="Coach dashboard">
		<span class="brand-mark">C</span>
		<span class="brand-copy">Coach</span>
	</a>

	<nav class="desktop-menu" aria-label="Admin quick links">
		{#each navItems as item (item.path)}
			<a
				href={resolve(/** @type {any} */ (item.path))}
				class:active={$page.url.pathname.startsWith(item.path)}
			>
				<span>{item.icon}</span>
				{item.label}
			</a>
		{/each}
	</nav>

	<button
		class="hamburger"
		on:click={toggleMenu}
		aria-label="Toggle admin navigation"
		aria-expanded={isOpen}
	>
		<span></span>
		<span></span>
		<span></span>
	</button>

	{#if isOpen}
		<button
			type="button"
			class="menu-overlay"
			aria-label="Close admin navigation"
			on:click={closeMenu}
		></button>
		<nav class="mobile-menu" aria-label="Admin">
			<p class="eyebrow">Admin Menu</p>
			{#each navItems as item (item.path)}
				<a
					href={resolve(/** @type {any} */ (item.path))}
					class:active={$page.url.pathname.startsWith(item.path)}
					on:click={closeMenu}
				>
					<span>{item.icon}</span>
					{item.label}
				</a>
			{/each}
		</nav>
	{/if}
</div>

<style>
	.admin-nav {
		position: sticky;
		top: 1rem;
		z-index: 50;
		display: flex;
		width: min(1180px, calc(100vw - 2rem));
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin: 1rem auto 0;
		padding: 0.55rem;
		border: 1px solid var(--border-color);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.25);
		backdrop-filter: blur(18px);
	}

	.brand-pill,
	.desktop-menu a,
	.mobile-menu a {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.brand-pill {
		gap: 0.55rem;
		padding: 0.35rem 0.75rem 0.35rem 0.4rem;
		border-radius: 999px;
		color: var(--text-primary);
		font-weight: 900;
	}

	.brand-mark {
		display: grid;
		width: 2.2rem;
		height: 2.2rem;
		place-items: center;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--brand-yellow), var(--brand-green));
		color: #07111f;
		font-weight: 900;
	}

	.brand-copy {
		letter-spacing: 0.02em;
	}

	.desktop-menu {
		display: flex;
		gap: 0.35rem;
	}

	.desktop-menu a,
	.mobile-menu a {
		gap: 0.45rem;
		border-radius: 999px;
		color: var(--text-secondary);
		font-size: 0.92rem;
		font-weight: 800;
		transition:
			background var(--transition),
			color var(--transition),
			transform var(--transition);
	}

	.desktop-menu a {
		padding: 0.65rem 0.85rem;
	}

	.desktop-menu a:hover,
	.desktop-menu a.active,
	.mobile-menu a:hover,
	.mobile-menu a.active {
		background: rgba(255, 255, 255, 0.11);
		color: var(--text-primary);
	}

	.hamburger {
		display: none;
		width: 2.6rem;
		height: 2.6rem;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 0.25rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-secondary);
		cursor: pointer;
	}

	.hamburger span {
		width: 1.1rem;
		height: 2px;
		border-radius: 999px;
		background: currentColor;
	}

	.menu-overlay {
		position: fixed;
		inset: 0;
		z-index: 48;
		background: rgba(2, 6, 23, 0.4);
		cursor: pointer;
	}

	.mobile-menu {
		position: absolute;
		top: calc(100% + 0.65rem);
		right: 0;
		z-index: 49;
		display: grid;
		width: min(320px, calc(100vw - 2rem));
		gap: 0.35rem;
		padding: 1rem;
		border: 1px solid var(--border-color);
		border-radius: 24px;
		background: rgba(15, 23, 42, 0.96);
		box-shadow: var(--shadow-card);
	}

	.mobile-menu a {
		padding: 0.9rem 1rem;
	}

	.eyebrow {
		padding: 0 0.7rem 0.45rem;
		color: var(--brand-yellow);
		font-size: 0.74rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.16em;
	}

	@media (max-width: 860px) {
		.admin-nav {
			position: sticky;
			width: calc(100vw - 1rem);
			margin-top: 0.5rem;
		}

		.desktop-menu {
			display: none;
		}

		.hamburger {
			display: inline-flex;
		}
	}
</style>
