<script>
        import { onMount } from 'svelte';
        import { goto } from '$app/navigation';
        import { resolve } from '$app/paths';
        import { get } from 'svelte/store';
        import { doc, getDoc, setDoc } from 'firebase/firestore';
        import { db } from '$lib/firebase';
        import { user, loading } from '$lib/store';

        let displayName = '';
        let errorMessage = '';
        let successMessage = '';
        let isSaving = false;
        let hasLoadedProfile = false;

        $: if (!$loading && !$user) {
                goto(resolve('/'));
        }

        onMount(() => {
                const unsubscribe = user.subscribe(async (currentUser) => {
                        if (currentUser && !hasLoadedProfile) {
                                await loadExistingProfile(currentUser.uid);
                        }
                });

                return () => unsubscribe();
        });

        /**
         * @param {string} uid
         */
        async function loadExistingProfile(uid) {
                try {
                        const profileRef = doc(db, 'profiles', uid);
                        const profileSnap = await getDoc(profileRef);
                        if (profileSnap.exists()) {
                                const data = profileSnap.data();
                                displayName = data.displayName ?? '';
                        }
                        hasLoadedProfile = true;
                } catch (error) {
                        console.error('Failed to load profile', error);
                        errorMessage = 'Unable to load your profile. Please try again.';
                }
        }

        async function saveProfile() {
                errorMessage = '';
                successMessage = '';

                const currentUser = get(user);
                if (!currentUser) {
                        errorMessage = 'You must be signed in to save your profile.';
                        return;
                }

                const trimmedName = displayName.trim();
                if (!trimmedName) {
                        errorMessage = 'Display name is required.';
                        return;
                }

                isSaving = true;
                try {
                        const profileRef = doc(db, 'profiles', currentUser.uid);
                        await setDoc(profileRef, {
                                email: currentUser.email ?? '',
                                displayName: trimmedName
                        });
                        successMessage = 'Profile saved!';
                        goto(resolve('/dashboard'));
                } catch (error) {
                        console.error('Failed to save profile', error);
                        errorMessage = 'Saving failed. Please try again.';
                } finally {
                        isSaving = false;
                }
        }
</script>

<svelte:head>
        <title>Account Setup</title>
</svelte:head>

<section class="setup-page">
        <div class="setup-card">
                <h1>Account Setup</h1>
                <p class="subtitle">Choose the display name or initials you want everyone to see.</p>

                <label for="display-name">Display Name</label>
                <input
                        id="display-name"
                        type="text"
                        maxlength="12"
                        bind:value={displayName}
                        placeholder="e.g. LMN"
                        autocomplete="off"
                />

                {#if errorMessage}
                        <p class="error">{errorMessage}</p>
                {/if}
                {#if successMessage}
                        <p class="success">{successMessage}</p>
                {/if}

                <button class="primary-btn" on:click={saveProfile} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Profile'}
                </button>
        </div>
</section>

<style>
        .setup-page {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--deep-space, #0f172a);
                padding: 2rem;
        }

        .setup-card {
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 24px;
                padding: 2.5rem;
                width: 100%;
                max-width: 480px;
                display: flex;
                flex-direction: column;
                gap: 1rem;
                color: var(--text-primary, #f8fafc);
        }

        h1 {
                font-family: 'Bebas Neue', sans-serif;
                letter-spacing: 3px;
                font-size: 3rem;
                margin: 0;
        }

        .subtitle {
                margin: 0 0 1rem;
                color: var(--text-muted, #94a3b8);
        }

        label {
                font-weight: 600;
                letter-spacing: 0.05em;
        }

        input {
                padding: 0.9rem 1rem;
                border-radius: 12px;
                border: 1px solid rgba(148, 163, 184, 0.3);
                background: rgba(15, 23, 42, 0.6);
                color: inherit;
                font-size: 1.1rem;
        }

        input:focus {
                outline: 2px solid var(--brand-yellow, #fde047);
                outline-offset: 2px;
        }

        .primary-btn {
                margin-top: 1.5rem;
                padding: 0.9rem 1.5rem;
                border-radius: 999px;
                border: none;
                background: var(--brand-green, #16a34a);
                color: #fff;
                font-weight: 700;
                font-size: 1rem;
                cursor: pointer;
                transition: transform 150ms ease, box-shadow 150ms ease;
        }

        .primary-btn:disabled {
                opacity: 0.7;
                cursor: not-allowed;
        }

        .primary-btn:not(:disabled):hover {
                transform: translateY(-1px);
                box-shadow: 0 10px 25px rgba(22, 163, 74, 0.35);
        }

        .error {
                color: #f87171;
                font-weight: 600;
        }

        .success {
                color: #34d399;
                font-weight: 600;
        }
</style>
