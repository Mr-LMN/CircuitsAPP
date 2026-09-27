<script>
	import { resolve } from '$app/paths';
	import { auth, isFirebaseConfigured, missingFirebaseVariables } from '$lib/firebase';
	import {
		createUserWithEmailAndPassword,
		signInWithEmailAndPassword,
		signOut
	} from 'firebase/auth';
	import { user } from '$lib/store';
	import { page } from '$app/stores';

	let email = '';
	let password = '';
	let errorMessage = '';
	let isNewUser = false;
	let initializedFromQuery = false;
	let redirectUrl = '/dashboard';

	$: if (!initializedFromQuery) {
		const signupParam = $page.url.searchParams.get('signup');
		const redirectParam = $page.url.searchParams.get('redirect');
		if (redirectParam?.startsWith('/') && !redirectParam.startsWith('//')) {
			redirectUrl = redirectParam;
		}
		if (signupParam === '1') {
			isNewUser = true;
		}
		initializedFromQuery = true;
	}

	async function handleSubmit() {
		if (!isFirebaseConfigured) {
			errorMessage = 'Firebase is not configured yet. Add the environment values listed above.';
			return;
		}
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
	import { goto } from '$app/navigation';
	$: if ($user && redirectUrl) {
		// Only redirect automatically if we came from a join link
		if (redirectUrl !== '/dashboard') {
			goto(resolve(/** @type {any} */ (redirectUrl)));
		}
	}
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
			{#if !isFirebaseConfigured}
				<div class="setup-notice" role="alert">
					<strong>Setup needed</strong>
					<span>Add these values to <code>.env</code>: {missingFirebaseVariables.join(', ')}</span>
				</div>
			{/if}
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

				<button type="submit" class="primary-btn" disabled={!isFirebaseConfigured}>
					{isNewUser ? 'Create Account' : 'Sign In'}
				</button>
			</form>
		</div>
	{/if}
</main>

<style>
	.setup-notice {
		position: relative;
		display: grid;
		gap: 0.25rem;
		margin-bottom: 1.25rem;
		padding: 0.9rem 1rem;
		border: 1px solid rgba(250, 204, 21, 0.35);
		border-radius: var(--radius-md);
		background: rgba(250, 204, 21, 0.09);
		color: var(--text-secondary);
		font-size: 0.86rem;
	}

	.setup-notice strong {
		color: var(--brand-yellow);
	}

	.setup-notice span {
		overflow-wrap: anywhere;
	}

	.setup-notice code {
		color: var(--text-primary);
	}
</style>
