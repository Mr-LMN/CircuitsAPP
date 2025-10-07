<script>
	let isOpen = false;
</script>

<div class="admin-nav">
	<button class="hamburger" on:click={() => (isOpen = !isOpen)}>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			stroke-width="2"
			stroke="currentColor"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
		</svg>
	</button>

	{#if isOpen}
		<div class="menu-overlay" on:click={() => (isOpen = false)}></div>
		<div class="menu">
			<h3>Admin Menu</h3>
			<ul>
				<li><a href="/dashboard" on:click={() => (isOpen = false)}>Dashboard</a></li>
				<li><a href="/admin/workouts" on:click={() => (isOpen = false)}>My Workouts</a></li>
				<li><a href="/admin/create" on:click={() => (isOpen = false)}>Create Workout</a></li>
				<li><a href="/admin/sessions" on:click={() => (isOpen = false)}>Manage Sessions</a></li>
				<li><a href="/admin/attendance" on:click={() => (isOpen = false)}>Member Check-in</a></li>
			</ul>
		</div>
	{/if}
</div>

<style>
	.admin-nav {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 2000;
	}

	.hamburger {
		background: rgba(31, 41, 55, 0.7);
		border: 1px solid var(--border-color);
		border-radius: 50%;
		width: 48px;
		height: 48px;
		color: var(--text-secondary);
		cursor: pointer;
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hamburger svg {
		width: 24px;
		height: 24px;
	}

	.menu-overlay {
		position: fixed;
		inset: 0;
	}

	.menu {
		position: absolute;
		top: 60px;
		left: 0;
		background: var(--surface-1);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 1rem;
		width: 250px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
	}

	.menu h3 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		letter-spacing: 1px;
		margin: 0 0 1rem 0;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--brand-yellow);
	}

	.menu ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.menu a {
		display: block;
		padding: 0.75rem 0.5rem;
		text-decoration: none;
		color: var(--text-secondary);
		border-radius: 6px;
	}

	.menu a:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}
</style>
