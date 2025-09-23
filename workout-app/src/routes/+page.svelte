<script>
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';
	import {
		createUserWithEmailAndPassword,
		signInWithEmailAndPassword,
		signOut
	} from 'firebase/auth';
	import { user } from '$lib/store';

	let email = '';
	let password = '';
	let errorMessage = '';
	let isNewUser = false;

	async function handleSubmit() {
		if (!email || !password) {
			errorMessage = 'Email and password are required.';
			return;
		}
		errorMessage = '';
		try {
			if (isNewUser) {
				await createUserWithEmailAndPassword(auth, email, password);
			} else {
				await signInWithEmailAndPassword(auth, email, password);
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}
	}

	async function handleSignOut() {
		await signOut(auth);
	}

	const dashboardUrl = resolve(/** @type {any} */ ('/dashboard'));
</script>

<main class="auth-page">
	{#if $user}
		<div class="auth-card">
			<h1>Welcome!</h1>
			<p>You are signed in as: <strong>{$user?.email}</strong></p>
			<button class="primary-btn" on:click={handleSignOut}>Sign Out</button>
			<a href={dashboardUrl} class="secondary-btn">Go to Dashboard</a>
		</div>
	{:else}
		<div class="auth-card">
			<h1>{isNewUser ? 'Create Account' : 'Sign In'}</h1>
			<p>
				{isNewUser ? 'Already have an account?' : 'Need an account?'}
				<button class="link-btn" on:click={() => (isNewUser = !isNewUser)}>
					{isNewUser ? 'Sign In' : 'Sign Up'}
				</button>
			</p>

			<form on:submit|preventDefault={handleSubmit}>
				<div class="form-group">
					<label for="email">Email</label>
					<input id="email" type="email" bind:value={email} placeholder="you@email.com" />
				</div>
				<div class="form-group">
					<label for="password">Password</label>
					<input id="password" type="password" bind:value={password} placeholder="••••••" />
				</div>

				{#if errorMessage}
					<p class="error-message">{errorMessage}</p>
				{/if}

				<button type="submit" class="primary-btn">
					{isNewUser ? 'Create Account' : 'Sign In'}
				</button>
			</form>
		</div>
	{/if}
</main>
