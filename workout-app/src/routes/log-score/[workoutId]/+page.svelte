<script>
        // @ts-nocheck
        import { db } from '$lib/firebase';
        import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
        import { goto } from '$app/navigation';

        export let data;
        const { workout, profiles } = data;

        let selectedUserId = '';
        // Create an array to hold the scores for each exercise, bound to the inputs
        let exerciseScores = workout.exercises.map((ex) => ({
                stationName: ex.name,
                score: ''
        }));

        let isSubmitting = false;
        let successMessage = '';
        let errorMessage = '';

        async function saveScores() {
                if (!selectedUserId) {
                        errorMessage = 'Please select a member to log a score for.';
                        return;
                }
                isSubmitting = true;
                errorMessage = '';
                successMessage = '';

                const selectedProfile = profiles.find((p) => p.id === selectedUserId);

                try {
                        const scoreData = {
                                userId: selectedProfile.id,
                                displayName: selectedProfile.displayName,
                                email: selectedProfile.email,
                                workoutId: workout.id,
                                workoutTitle: workout.title,
                                date: serverTimestamp(),
                                // Filter out any stations where a score wasn't entered
                                exerciseScores: exerciseScores.filter((s) => s.score.trim() !== '')
                        };

                        await addDoc(collection(db, 'scores'), scoreData);

                        successMessage = `Score for ${selectedProfile.displayName} saved successfully!`;
                        // Reset form for next entry
                        selectedUserId = '';
                        exerciseScores = workout.exercises.map((ex) => ({
                                stationName: ex.name,
                                score: ''
                        }));
                } catch (error) {
                        console.error('Error saving score:', error);
                        errorMessage = 'Failed to save score. Please try again.';
                } finally {
                        isSubmitting = false;
                }
        }
</script>

<div class="page-container">
        <header class="page-header">
                <h1>Log Score</h1>
                <p>For workout: <strong>{workout.title}</strong></p>
        </header>

        <section class="card">
                <form on:submit|preventDefault={saveScores}>
                        <div class="form-group">
                                <label for="member-select">Select Member</label>
                                <select id="member-select" bind:value={selectedUserId} required>
                                        <option value="" disabled>Choose a member...</option>
                                        {#each profiles as profile}
                                                <option value={profile.id}>{profile.displayName} ({profile.email})</option>
                                        {/each}
                                </select>
                        </div>

                        {#if selectedUserId}
                                <fieldset>
                                        <legend>Enter Scores per Station</legend>
                                        {#each exerciseScores as item, i}
                                                <div class="score-entry">
                                                        <label for={`score-${i}`}>{i + 1}. {item.stationName}</label>
                                                        <input
                                                                id={`score-${i}`}
                                                                type="text"
                                                                bind:value={item.score}
                                                                placeholder="e.g., 25 reps, 50 cals"
                                                        />
                                                </div>
                                        {/each}
                                </fieldset>
                        {/if}

                        {#if successMessage}<p class="success-message">{successMessage}</p>{/if}
                        {#if errorMessage}<p class="error-message">{errorMessage}</p>{/if}

                        <button type="submit" class="primary-btn" disabled={isSubmitting || !selectedUserId}>
                                {isSubmitting ? 'Saving...' : 'Save Score'}
                        </button>
                        <a href="/admin/workouts" class="secondary-btn">Back to Workouts</a>
                </form>
        </section>
</div>

<style>
        .page-container {
                width: 100%;
                max-width: 800px;
                margin: 2rem auto;
                padding: 2rem;
        }
        .page-header {
                margin-bottom: 2rem;
        }
        h1 {
                font-family: var(--font-display);
                color: var(--brand-yellow);
                font-size: 3rem;
                margin: 0;
        }
        .page-header p {
                font-size: 1.1rem;
                color: var(--text-secondary);
                margin-top: 0.5rem;
        }
        .card {
                background: var(--surface-1);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 2rem;
        }
        .form-group, fieldset {
                margin-bottom: 2rem;
        }
        label {
                display: block;
                margin-bottom: 0.5rem;
                color: var(--text-muted);
                font-size: 0.9rem;
                font-weight: 600;
        }
        select, input {
                width: 100%;
                font-size: 1rem;
                padding: 0.75rem 1rem;
                border-radius: 12px;
                border: 1px solid var(--border-color);
                background: var(--deep-space);
                color: var(--text-primary);
        }
        fieldset {
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 1.5rem;
        }
        legend {
                padding: 0 0.5rem;
                font-weight: 600;
                color: var(--text-secondary);
        }
        .score-entry {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
                align-items: center;
                margin-bottom: 1rem;
        }
        .score-entry:last-child {
                margin-bottom: 0;
        }
        .score-entry label {
                margin-bottom: 0;
        }
        .primary-btn {
                border: none;
                background: var(--brand-green);
                color: var(--text-primary);
                padding: 0.75rem 2rem;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
                font-size: 1.1rem;
        }
        .secondary-btn {
                display: block;
                text-align: center;
                margin-top: 1rem;
                color: var(--text-muted);
                font-size: 0.9rem;
        }
        .success-message, .error-message {
                text-align: center;
                margin-bottom: 1rem;
                padding: 0.75rem;
                border-radius: 8px;
        }
        .success-message {
                color: var(--brand-green);
                background-color: rgba(22, 163, 74, 0.1);
        }
        .error-message {
                color: #ef4444;
                background-color: rgba(239, 68, 68, 0.1);
        }
</style>
