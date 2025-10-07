<script lang="ts">
        import { db } from '$lib/firebase';
        import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
        import { resolve } from '$app/paths';

        export let data;
        const { workout, profiles } = data;

        const isForTime = workout?.type === 'For Time';

        type ExerciseScore = {
                stationName: string;
                description: string;
                category: string;
                calories: string;
                distance: string;
                reps: string;
                weight: string;
                notes: string;
        };

        const createInitialExerciseScores = (): ExerciseScore[] =>
                (workout?.exercises ?? []).map((exercise, index) => ({
                        stationName: exercise?.name ?? `Station ${index + 1}`,
                        description: exercise?.description ?? '',
                        category: exercise?.category ?? 'General',
                        calories: '',
                        distance: '',
                        reps: '',
                        weight: '',
                        notes: ''
                }));

        let selectedUserId = '';
        let totalTime = '';
        let exerciseScores: ExerciseScore[] = isForTime ? [] : createInitialExerciseScores();

        let isSubmitting = false;
        let successMessage = '';
        let errorMessage = '';

        const trimValue = (value: string) => value?.trim?.() ?? '';

        const buildMetrics = (score: ExerciseScore) => {
                const metrics: Record<string, string> = {};

                if (score.category === 'Cardio Machine') {
                        const calories = trimValue(score.calories);
                        const distance = trimValue(score.distance);
                        if (calories) metrics.calories = calories;
                        if (distance) metrics.distance = distance;
                } else if (score.category === 'Resistance') {
                        const reps = trimValue(score.reps);
                        const weight = trimValue(score.weight);
                        if (reps) metrics.reps = reps;
                        if (weight) metrics.weight = weight;
                } else if (score.category === 'Bodyweight') {
                        const reps = trimValue(score.reps);
                        if (reps) metrics.reps = reps;
                } else {
                        const notes = trimValue(score.notes);
                        if (notes) metrics.notes = notes;
                }

                return metrics;
        };

        const resetForm = () => {
                selectedUserId = '';
                totalTime = '';
                exerciseScores = isForTime ? [] : createInitialExerciseScores();
        };

        async function saveScores() {
                if (!selectedUserId) {
                        errorMessage = 'Please select a member to log a score for.';
                        return;
                }

                const selectedProfile = profiles.find((p) => p.id === selectedUserId);

                if (!selectedProfile) {
                        errorMessage = 'Selected member could not be found. Please try again.';
                        return;
                }

                errorMessage = '';
                successMessage = '';
                isSubmitting = true;

                try {
                        let structuredScores: unknown;

                        if (isForTime) {
                                const trimmedTime = trimValue(totalTime);
                                if (!trimmedTime) {
                                        errorMessage = 'Please enter a completion time.';
                                        isSubmitting = false;
                                        return;
                                }

                                structuredScores = {
                                        format: 'for_time',
                                        totalTime: trimmedTime
                                };
                        } else {
                                const capturedScores = exerciseScores
                                        .map((score) => {
                                                const metrics = buildMetrics(score);

                                                if (!Object.keys(metrics).length) {
                                                        return null;
                                                }

                                                return {
                                                        stationName: score.stationName,
                                                        category: score.category,
                                                        metrics
                                                };
                                        })
                                        .filter(Boolean);

                                if (!capturedScores.length) {
                                        errorMessage = 'Please enter at least one score before saving.';
                                        isSubmitting = false;
                                        return;
                                }

                                structuredScores = capturedScores;
                        }

                        const scoreData = {
                                userId: selectedProfile.id,
                                displayName: selectedProfile.displayName,
                                email: selectedProfile.email,
                                workoutId: workout.id,
                                workoutTitle: workout.title,
                                workoutType: workout.type,
                                date: serverTimestamp(),
                                exerciseScores: structuredScores
                        };

                        await addDoc(collection(db, 'scores'), scoreData);

                        successMessage = `Score for ${selectedProfile.displayName} saved successfully!`;
                        resetForm();
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
                                        {#each profiles as profile (profile.id)}
                                                <option value={profile.id}>{profile.displayName} ({profile.email})</option>
                                        {/each}
                                </select>
                        </div>

                        {#if selectedUserId}
                                {#if isForTime}
                                        <div class="form-group">
                                                <label for="total-time">Total Completion Time</label>
                                                <input
                                                        id="total-time"
                                                        type="text"
                                                        bind:value={totalTime}
                                                        placeholder="e.g., 15:32"
                                                />
                                        </div>
                                {:else}
                                        <fieldset>
                                                <legend>Enter Scores per Station</legend>
                                                {#each exerciseScores as item, index (`${item.stationName}-${index}`)}
                                                        <div class="score-entry">
                                                                <div class="station-header">
                                                                        <h3>{index + 1}. {item.stationName}</h3>
                                                                        <span class="category-pill">{item.category}</span>
                                                                </div>
                                                                {#if item.description}
                                                                        <p class="station-description">{item.description}</p>
                                                                {/if}

                                                                {#if item.category === 'Cardio Machine'}
                                                                        <div class="metric-grid">
                                                                                <label class="metric-input">
                                                                                        <span>Calories</span>
                                                                                        <input
                                                                                                type="text"
                                                                                                bind:value={item.calories}
                                                                                                placeholder="e.g., 25"
                                                                                        />
                                                                                </label>
                                                                                <label class="metric-input">
                                                                                        <span>Distance</span>
                                                                                        <input
                                                                                                type="text"
                                                                                                bind:value={item.distance}
                                                                                                placeholder="e.g., 1.2 mi"
                                                                                        />
                                                                                </label>
                                                                        </div>
                                                                {:else if item.category === 'Resistance'}
                                                                        <div class="metric-grid">
                                                                                <label class="metric-input">
                                                                                        <span>Reps</span>
                                                                                        <input
                                                                                                type="text"
                                                                                                bind:value={item.reps}
                                                                                                placeholder="e.g., 12"
                                                                                        />
                                                                                </label>
                                                                                <label class="metric-input">
                                                                                        <span>Weight</span>
                                                                                        <input
                                                                                                type="text"
                                                                                                bind:value={item.weight}
                                                                                                placeholder="e.g., 35 lb"
                                                                                        />
                                                                                </label>
                                                                        </div>
                                                                {:else if item.category === 'Bodyweight'}
                                                                        <div class="metric-grid single">
                                                                                <label class="metric-input">
                                                                                        <span>Reps</span>
                                                                                        <input
                                                                                                type="text"
                                                                                                bind:value={item.reps}
                                                                                                placeholder="e.g., 20"
                                                                                        />
                                                                                </label>
                                                                        </div>
                                                                {:else}
                                                                        <div class="metric-grid">
                                                                                <label class="metric-input">
                                                                                        <span>Notes</span>
                                                                                        <input
                                                                                                type="text"
                                                                                                bind:value={item.notes}
                                                                                                placeholder="Enter score details"
                                                                                        />
                                                                                </label>
                                                                        </div>
                                                                {/if}
                                                        </div>
                                                {/each}
                                        </fieldset>
                                {/if}
                        {/if}

                        {#if successMessage}<p class="success-message">{successMessage}</p>{/if}
                        {#if errorMessage}<p class="error-message">{errorMessage}</p>{/if}

                        <button type="submit" class="primary-btn" disabled={isSubmitting || !selectedUserId}>
                                {isSubmitting ? 'Saving...' : 'Save Score'}
                        </button>
                        <a href={resolve('/admin/workouts')} class="secondary-btn">Back to Workouts</a>
                </form>
        </section>
</div>

<style>
        .page-container {
                width: 100%;
                max-width: 900px;
                margin: 2rem auto;
                padding: 2rem 1.5rem 3rem;
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
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
        }

        form {
                display: flex;
                flex-direction: column;
                gap: 2rem;
        }

        .form-group,
        fieldset {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
        }

        label,
        legend {
                color: var(--text-muted);
                font-size: 0.95rem;
                font-weight: 600;
        }

        select,
        input {
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
                padding: 1.75rem;
                gap: 1.75rem;
        }

        legend {
                padding: 0 0.5rem;
        }

        .score-entry {
                background: rgba(19, 27, 40, 0.65);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 14px;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 1rem;
        }

        .station-header {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 1rem;
        }

        .station-header h3 {
                margin: 0;
                font-size: 1.2rem;
                color: var(--text-primary);
        }

        .category-pill {
                background: rgba(255, 255, 255, 0.08);
                border-radius: 999px;
                padding: 0.25rem 0.75rem;
                font-size: 0.8rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
        }

        .station-description {
                margin: 0;
                color: var(--text-secondary);
                font-size: 0.95rem;
        }

        .metric-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 1rem;
        }

        .metric-grid.single {
                grid-template-columns: minmax(180px, 1fr);
        }

        .metric-input {
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
                color: var(--text-muted);
                font-size: 0.85rem;
        }

        .success-message {
                color: #4caf50;
                margin: 0;
        }

        .error-message {
                color: #ff6b6b;
                margin: 0;
        }

        .primary-btn,
        .secondary-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                padding: 0.75rem 1.5rem;
                border-radius: 999px;
                text-decoration: none;
                font-weight: 600;
                transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .primary-btn {
                background: var(--brand-yellow);
                color: #0d1117;
                border: none;
                cursor: pointer;
        }

        .primary-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
        }

        .secondary-btn {
                background: transparent;
                color: var(--text-secondary);
                border: 1px solid var(--border-color);
        }

        .primary-btn:not(:disabled):hover,
        .secondary-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }

        @media (max-width: 640px) {
                .card {
                        padding: 1.5rem;
                }

                fieldset {
                        padding: 1.25rem;
                }
        }
</style>
