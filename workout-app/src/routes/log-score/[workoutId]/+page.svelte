<script>
  // @ts-nocheck
  import { db } from '$lib/firebase';
  import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

  export let data;
  const { workout, profiles } = data;

  let selectedUserId = '';
  
  // --- NEW: More structured state for scores ---
  let timeScore = ''; // For 'For Time' workouts
  const formatDistance = (value) => {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower.endsWith('m') || lower.endsWith('km')) {
      return trimmed;
    }
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return `${trimmed}m`;
    }
    return trimmed;
  };

  const buildScoreState = () =>
    workout.exercises.map((ex) => ({
      stationName: ex.name,
      category: ex.category,
      score: { reps: null, weight: null, cals: null, dist: null, notes: '' }
    }));

  let exerciseScores = buildScoreState();

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
      let scorePayload;
      if (workout.type === 'For Time') {
        scorePayload = { timeScore: timeScore };
      } else {
        const cleanedExerciseScores = exerciseScores
          .map((item) => {
            const cleanedScore = {};
            for (const key in item.score) {
              if (item.score[key] !== null && item.score[key] !== '') {
                cleanedScore[key] = item.score[key];
              }
            }
            return { ...item, score: cleanedScore };
          })
          .filter((item) => Object.keys(item.score).length > 0);

        scorePayload = { exerciseScores: cleanedExerciseScores };
      }

      const scoreData = {
        userId: selectedProfile?.id || 'unknown',
        displayName: selectedProfile?.displayName || 'Unknown Member',
        email: selectedProfile?.email || '',
        workoutId: workout?.id || 'unknown',
        workoutTitle: workout?.title || 'Untitled Workout',
        date: serverTimestamp(),
        ...scorePayload
      };

      await addDoc(collection(db, 'scores'), scoreData);

      successMessage = `Score for ${selectedProfile.displayName} saved successfully!`;
      // Reset form
      selectedUserId = '';
      timeScore = '';
      exerciseScores = workout.exercises.map((ex) => ({
        stationName: ex.name,
        category: ex.category,
        score: { reps: null, weight: null, cals: null, dist: null, notes: null }
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
        {#if workout.type === 'For Time'}
          <fieldset>
            <legend>Enter Final Time</legend>
            <div class="form-group">
              <label for="time-score">Completion Time</label>
              <input id="time-score" type="text" bind:value={timeScore} placeholder="e.g., 15:32" required />
            </div>
          </fieldset>
        {:else}
          <fieldset>
            <legend>Enter Scores per Station</legend>
            <p class="fieldset-hint">Only fill in the metrics completed for each station. Leave any unused fields blank.</p>
            {#each exerciseScores as item, i}
              <div class="score-entry">
                <label for={`score-${i}`}>{i + 1}. {item.stationName}</label>
                <div class="input-group">
                  {#if item.category === 'Resistance'}
                    <input type="number" min="0" inputmode="numeric" bind:value={item.score.reps} placeholder="e.g. 12" />
                    <input type="number" min="0" step="0.5" inputmode="decimal" bind:value={item.score.weight} placeholder="e.g. 40" />
                    <span class="metric-hint">Record reps, load (kg), or both.</span>
                  {:else if item.category === 'Cardio Machine'}
                    <input type="number" min="0" inputmode="numeric" bind:value={item.score.cals} placeholder="e.g. 20" />
                    <input type="text" inputmode="decimal" bind:value={item.score.dist} placeholder="e.g. 250m" />
                    <span class="metric-hint">Log calories burned, distance (m), or both.</span>
                  {:else if item.category === 'Bodyweight'}
                    <input type="number" min="0" inputmode="numeric" bind:value={item.score.reps} placeholder="e.g. 15" />
                  {:else}
                    <input type="text" bind:value={item.score.notes} placeholder="Notes (optional)" />
                  {/if}
                </div>
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
      <a href="/admin/workouts" class="secondary-btn">Back to Workouts</a>
    </form>
  </section>
</div>

<style>
  /* ... (all previous styles for this page) ... */
  .page-container {
    width: min(960px, 100%);
    margin: clamp(1rem, 3vw, 2.5rem) auto;
    padding: clamp(1rem, 3vw, 2rem);
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

  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: clamp(1.25rem, 3vw, 2rem);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group,
  fieldset {
    margin-bottom: 0.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
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
    padding: 1.5rem;
  }

  legend {
    padding: 0 0.5rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .fieldset-hint {
    margin: 0.75rem 0 1.25rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .score-entry {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .score-entry:last-child {
    margin-bottom: 0;
  }

  .score-entry label {
    margin-bottom: 0;
    grid-column: 1 / -1;
  } /* Label on its own row */

  .primary-btn {
    border: none;
    background: var(--brand-green);
    color: var(--text-primary);
    padding: 1rem;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    font-size: 1.1rem;
  }

  .secondary-btn {
    display: block;
    text-align: center;
    margin-top: 0.5rem;
    color: var(--text-muted);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 0.9rem 1rem;
  }

  .success-message,
  .error-message {
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

  /* --- NEW: Styles for input groups --- */
  .input-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .metric-hint {
    grid-column: 1 / -1;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: -0.25rem;
  }

  /* Make single inputs span both columns */
  .input-group input:only-child {
    grid-column: 1 / -1;
  }

  @media (max-width: 640px) {
    .page-container {
      padding: 1rem;
      margin: 1rem auto;
    }

    h1 {
      font-size: 2.25rem;
    }

    .card {
      padding: 1.25rem;
    }

    .input-group {
      grid-template-columns: 1fr;
    }

    .secondary-btn {
      width: 100%;
    }
  }
</style>
