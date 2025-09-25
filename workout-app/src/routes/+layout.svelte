<script>
        import '../app.css';
        import { onMount } from 'svelte';
        import { goto } from '$app/navigation';
        import { resolve } from '$app/paths';
        import { page } from '$app/stores';
        import { get } from 'svelte/store';
        import { onAuthStateChanged } from 'firebase/auth';
        import { doc, getDoc } from 'firebase/firestore';
        import { auth, db } from '$lib/firebase';
        import { user, loading } from '$lib/store';

        let profileExists = false;
        let checkingProfile = false;

        /**
         * @param {string} uid
         * @param {string} currentPath
         */
        async function ensureProfile(uid, currentPath) {
                if (!uid || checkingProfile) return;
                checkingProfile = true;
                try {
                        const profileRef = doc(db, 'profiles', uid);
                        const profileSnap = await getDoc(profileRef);
                        profileExists = profileSnap.exists();
                        if (!profileExists && !currentPath.startsWith('/account/setup')) {
                                await goto(resolve('/account/setup'));
                        }
                } catch (error) {
                        console.error('Failed to verify profile', error);
                } finally {
                        checkingProfile = false;
                }
        }

        onMount(() => {
                const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                        try {
                                if (firebaseUser) {
                                        $user = { email: firebaseUser.email, uid: firebaseUser.uid };
                                        const currentPath = get(page).url.pathname;
                                        await ensureProfile(firebaseUser.uid, currentPath);
                                } else {
                                        $user = null;
                                        profileExists = false;
                                }
                        } finally {
                                $loading = false;
                        }
                });

                return () => unsubscribe();
        });

        $: currentPath = $page.url.pathname;
        $: if (!$loading && $user) {
                ensureProfile($user.uid, currentPath);
        }
</script>

<svelte:head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
                href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&display=swap"
                rel="stylesheet"
        />
</svelte:head>

<div class="app-container">
        {#if $loading}
                <p>Loading...</p>
        {:else}
                <slot />
        {/if}
</div>
