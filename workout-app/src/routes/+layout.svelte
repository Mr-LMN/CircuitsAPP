<script>
        import '../app.css';
        import { onDestroy, onMount } from 'svelte';
        import { auth, db } from '$lib/firebase';
        import { onAuthStateChanged } from 'firebase/auth';
        import { doc, getDoc } from 'firebase/firestore';
        import { goto } from '$app/navigation';
        import { resolve } from '$app/paths';
        import { page } from '$app/stores';
        import AdminNav from '$lib/components/AdminNav.svelte';
        import { isAdmin, loading, resetAuthState, user } from '$lib/store';

        let currentPath = '/';
        const stopWatchingPage = page.subscribe(($page) => {
                currentPath = $page.url.pathname;
        });

        onDestroy(() => {
                stopWatchingPage();
        });

        onMount(() => {
                loading.set(true);

                let active = true;
                const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                        if (!active) return;

                        if (firebaseUser) {
                                user.set({
                                        email: firebaseUser.email ?? null,
                                        uid: firebaseUser.uid
                                });

                                let admin = false;
                                let hasProfile = false;

                                try {
                                        const profileRef = doc(db, 'profiles', firebaseUser.uid);
                                        const profileSnap = await getDoc(profileRef);

                                        if (profileSnap.exists()) {
                                                const profile = profileSnap.data();
                                                admin = profile.isAdmin === true;
                                                hasProfile = true;
                                        }
                                } catch (error) {
                                        console.error('Failed to load profile metadata', error);
                                }

                                isAdmin.set(admin);

                                if (!hasProfile && currentPath !== '/account/setup') {
                                        goto(resolve('/account/setup'));
                                }

                                loading.set(false);
                                return;
                        }

                        resetAuthState();

                        if (currentPath.startsWith('/admin') || currentPath.startsWith('/dashboard')) {
                                goto(resolve('/'));
                        }
                });

                return () => {
                        active = false;
                        unsubscribe();
                };
        });
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
	<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</svelte:head>

{#if $isAdmin}
        <AdminNav />
{/if}

<div class="app-container">
	{#if $loading}
		<p>Loading...</p>
	{:else}
		<slot />
	{/if}
</div>

<style>
	.app-container {
		min-height: 100vh;
	}
</style>
