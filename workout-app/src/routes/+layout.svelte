<script>
// @ts-nocheck
import '../app.css';
import { onMount } from 'svelte';
import { auth, db } from '$lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { user, loading } from '$lib/store';
import { goto } from '$app/navigation';
import AdminNav from '$lib/components/AdminNav.svelte';

// A store to track admin status
import { writable } from 'svelte/store';
export const isAdmin = writable(false);

onMount(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                if (firebaseUser) {
                        $user = {
                                email: firebaseUser.email,
                                uid: firebaseUser.uid
                        };

                        // Check for admin status
                        const profileRef = doc(db, 'profiles', firebaseUser.uid);
                        const profileSnap = await getDoc(profileRef);

                        if (profileSnap.exists()) {
                                // User has a profile, check if they are an admin
                                $isAdmin = profileSnap.data().isAdmin === true;
                        } else {
                                // New user, no profile yet. Not an admin.
                                $isAdmin = false;
                                // Redirect new users to setup their profile
                                if (window.location.pathname !== '/account/setup') {
                                        goto('/account/setup');
                                }
                        }
                } else {
                        $user = null;
                        $isAdmin = false; // Not logged in, not an admin
                }
                $loading = false;
        });

        return () => unsubscribe();
});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
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
