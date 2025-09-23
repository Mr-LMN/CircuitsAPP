<script>
	import { user } from '$lib/store';
	import { auth } from '$lib/firebase';
	import { signOut } from 'firebase/auth';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	async function handleSignOut() {
		await signOut(auth);
		// After signing out, redirect the user to the home page
		goto(resolve('/'));
	}
</script>

<div class="dashboard-card">
	<h1>Dashboard</h1>
	<p>Welcome, <strong>{$user?.email}</strong>!</p>
	<p>This is a protected page. Only logged-in users can see this.</p>
	<button class="primary-btn" on:click={handleSignOut}> Sign Out </button>
</div>

<style>
	.dashboard-card {
		background-color: var(--card);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		width: 100%;
		max-width: 500px;
	}
</style>
