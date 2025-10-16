<script>
        import { onDestroy } from 'svelte';
        import { page } from '$app/stores';

        let isOpen = false;
        let lastPathname = '';

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

<div class="admin-nav">
        <button
                class="hamburger"
                on:click={toggleMenu}
                on:keydown={handleKeydown}
                aria-label="Toggle admin navigation"
                aria-expanded={isOpen}
        >
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
                <button type="button" class="menu-overlay" aria-label="Close admin navigation" on:click={closeMenu}></button>
                <nav class="menu" aria-label="Admin">
                        <h3>Admin Menu</h3>
                        <ul>
                                <li><a href="/dashboard" on:click={closeMenu}>Dashboard</a></li>
                                <li><a href="/admin/workouts" on:click={closeMenu}>My Workouts</a></li>
                                <li><a href="/admin/create" on:click={closeMenu}>Create Workout</a></li>
                                <li><a href="/admin/sessions" on:click={closeMenu}>Manage Sessions</a></li>
                                <li><a href="/admin/attendance" on:click={closeMenu}>Member Check-in</a></li>
                        </ul>
                </nav>
        {/if}
</div>

<style>
	.admin-nav {
		position: fixed;
		top: 1.5rem;
		left: 1.5rem;
		z-index: 50; /* Ensures the button is on top of page content */
	}
	.hamburger {
		background: rgba(31, 41, 55, 0.7); /* Semi-transparent background */
		border: 1px solid var(--border-color);
		border-radius: 50%;
		width: 48px;
		height: 48px;
		color: var(--text-secondary);
		cursor: pointer;
		backdrop-filter: blur(8px); /* Frosted glass effect */
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s ease;
	}
	.hamburger:hover {
		background: rgba(55, 65, 81, 0.8);
	}
	.hamburger svg {
		width: 24px;
		height: 24px;
	}
        .menu-overlay {
                position: fixed;
                inset: 0;
                z-index: 48; /* Below the menu, above the page */
                background: transparent;
                border: none;
                cursor: pointer;
        }
	.menu {
		position: absolute;
		top: 60px;
		left: 0;
		background: var(--surface-1); /* This provides the solid background */
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 1rem;
		width: 280px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
		z-index: 49; /* Ensures menu is on top of the overlay */
	}
	.menu h3 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		letter-spacing: 1px;
		margin: 0 0.5rem 1rem 0.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--brand-yellow);
	}
	.menu ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.menu a {
		display: block;
		padding: 0.75rem 1rem;
		text-decoration: none;
		color: var(--text-secondary);
		border-radius: 8px;
		font-weight: 600;
	}
	.menu a:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}
</style>
