<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { db } from '$lib/firebase';
  import { doc, updateDoc, getDocs, collection, setDoc } from 'firebase/firestore';

  export let data;

  const CATEGORY_OPTIONS = ['Bodyweight', 'Resistance', 'Cardio Machine'];
  const DEFAULT_CATEGORY = CATEGORY_OPTIONS[0];

  let title = data.workout.title ?? '';
  let type = data.workout.type ?? 'Circuit';
  let mode = data.workout.mode ?? 'Individual';
  let previousMode = mode;
  let isBenchmark = Boolean(data.workout.isBenchmark);
  let notes = data.workout.notes ?? '';

  function getDefaultIndividualExercise() {
    return { name: '', description: '', category: DEFAULT_CATEGORY };
  }

  function getDefaultPartnerStation(index = 0) {
    return {
      name: `Station ${index + 1}`,
      p1: { task: '', category: DEFAULT_CATEGORY },
      p2: { task: '', category: DEFAULT_CATEGORY },
      startsOn: 'P1'
    };
  }

  function sanitizeCategory(category) {
    return CATEGORY_OPTIONS.includes(category) ? category : DEFAULT_CATEGORY;
  }

  function normalizeStartsOn(value) {
    return value === 'P2' ? 'P2' : 'P1';
  }

  function toPartnerExercise(exercise, index) {
    return {
      name: exercise?.name || `Station ${index + 1}`,
      p1: {
        task: exercise?.p1?.task ?? exercise?.p1_task ?? exercise?.description ?? '',
        category: sanitizeCategory(
          exercise?.p1?.category ?? exercise?.p1_category ?? exercise?.category
        )
      },
      p2: {
        task: exercise?.p2?.task ?? exercise?.p2_task ?? '',
        category: sanitizeCategory(
          exercise?.p2?.category ?? exercise?.p2_category ?? exercise?.category
        )
      },
      startsOn: normalizeStartsOn(exercise?.startsOn ?? exercise?.startsWith ?? exercise?.starter)
    };
  }

  function toIndividualExercise(exercise) {
    return {
      name: exercise?.name ?? '',
      description:
        exercise?.description ??
        exercise?.p1?.task ??
        exercise?.p2?.task ??
        exercise?.p1_task ??
        exercise?.p2_task ??
        '',
      category: sanitizeCategory(
        exercise?.category ?? exercise?.p1?.category ?? exercise?.p1_category
      )
    };
  }

  function initializeExercises(initialExercises = []) {
    if (!Array.isArray(initialExercises) || initialExercises.length === 0) {
      return mode === 'Partner' ? [getDefaultPartnerStation()] : [getDefaultIndividualExercise()];
    }

    return mode === 'Partner'
      ? initialExercises.map((exercise, index) => toPartnerExercise(exercise, index))
      : initialExercises.map((exercise) => toIndividualExercise(exercise));
  }

  let exercises = initializeExercises(data.workout.exercises ?? []);

  // UI state
  let isSubmitting = false;
  let successMessage = '';
  let errorMessage = '';
  let allExerciseNames = [];

  // Reactive statement to automatically reset the exercises when the mode changes
  $: if (mode !== previousMode) {
    exercises = mode === 'Partner' ? [getDefaultPartnerStation()] : [getDefaultIndividualExercise()];
    previousMode = mode;
  }

  onMount(async () => {
    const querySnapshot = await getDocs(collection(db, 'exercises'));
    allExerciseNames = querySnapshot.docs.map((docSnap) => docSnap.data().name);
  });

  function addExercise() {
    if (mode === 'Partner') {
      exercises = [...exercises, getDefaultPartnerStation(exercises.length)];
    } else {
      exercises = [...exercises, getDefaultIndividualExercise()];
    }
  }

  function removeExercise(index) {
    exercises = exercises.filter((_, i) => i !== index);
  }

  function validateExercises() {
    if (mode === 'Partner') {
      return exercises.some((exercise) => {
        const stationName = exercise.name?.trim?.();
        const p1Task = exercise.p1?.task?.trim?.();
        const p2Task = exercise.p2?.task?.trim?.();
        return !stationName || !p1Task || !p2Task;
      });
    }

    return exercises.some((exercise) => !exercise.name?.trim?.());
  }

  async function updateWorkout() {
    const trimmedTitle = title?.trim?.() ?? '';
    const isInvalid = validateExercises();

    if (!trimmedTitle || isInvalid) {
      errorMessage = 'Workout title and all required exercise/task fields are required.';
      return;
    }

    isSubmitting = true;
    errorMessage = '';
    successMessage = '';

    try {
      const normalizedExercises =
        mode === 'Partner'
          ? exercises.map((exercise, index) => ({
              name: exercise.name?.trim?.() || `Station ${index + 1}`,
              p1: {
                task: exercise.p1?.task?.trim?.() ?? '',
                category: sanitizeCategory(exercise.p1?.category)
              },
              p2: {
                task: exercise.p2?.task?.trim?.() ?? '',
                category: sanitizeCategory(exercise.p2?.category)
              },
              startsOn: normalizeStartsOn(exercise.startsOn)
            }))
          : exercises.map((exercise) => ({
              name: exercise.name?.trim?.() ?? '',
              description: exercise.description?.trim?.() ?? '',
              category: sanitizeCategory(exercise.category)
            }));

      const workoutRef = doc(db, 'workouts', data.workout.id);
      const updatedData = {
        title: trimmedTitle,
        type,
        mode,
        isBenchmark,
        notes: notes?.trim?.() ?? '',
        exercises: normalizedExercises
      };

      await updateDoc(workoutRef, updatedData);

      for (const exercise of normalizedExercises) {
        const namesToPersist =
          mode === 'Partner'
            ? [exercise.p1.task, exercise.p2.task]
            : [exercise.name];

        for (const rawName of namesToPersist) {
          const exerciseName = rawName?.trim?.();
          if (!exerciseName) continue;

          const exerciseRef = doc(db, 'exercises', exerciseName.toLowerCase());
          await setDoc(exerciseRef, { name: exerciseName });
        }
      }

      successMessage = 'Workout updated successfully!';
      setTimeout(() => goto('/admin/workouts'), 1500);
    } catch (error) {
      console.error('Error updating workout: ', error);
      errorMessage = 'Failed to update workout. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="form-container">
  <h1>Edit Workout</h1>
  <form on:submit|preventDefault={updateWorkout}>
    <div class="form-group">
      <label for="title">Workout Title</label>
      <input id="title" type="text" bind:value={title} required />
    </div>

    <div class="split-group">
      <div class="form-group">
        <label for="type">Workout Type</label>
        <select id="type" bind:value={type}>
          <option>Circuit</option>
          <option>AMRAP</option>
          <option>EMOM</option>
          <option>Timed Rounds</option>
        </select>
      </div>
      <div class="form-group">
        <label for="mode">Participation Mode</label>
        <select id="mode" bind:value={mode}>
          <option>Individual</option>
          <option>Partner</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label for="notes">Notes / Instructions</label>
      <textarea id="notes" bind:value={notes} rows="3"></textarea>
    </div>

    <div class="form-group-checkbox">
      <input id="benchmark" type="checkbox" bind:checked={isBenchmark} />
      <label for="benchmark">Make this a Benchmark Workout</label>
    </div>

    <fieldset>
      <legend>Exercises</legend>
      <datalist id="exercise-suggestions">
        {#each allExerciseNames as name}<option value={name}></option>{/each}
      </datalist>

      {#if mode === 'Partner'}
        {#each exercises as exercise, i}
          <div class="station-editor-card">
            <div class="station-editor-header">
              <input class="station-name-input" type="text" bind:value={exercise.name} required />
              <button type="button" class="remove-btn" on:click={() => removeExercise(i)}>&times;</button>
            </div>

            <div class="partner-grid">
              <div class="partner-column">
                <label for={`p1-task-${i}`}>Partner A Task</label>
                <input
                  id={`p1-task-${i}`}
                  type="text"
                  bind:value={exercise.p1.task}
                  required
                  list="exercise-suggestions"
                />
                <label for={`p1-cat-${i}`}>Category</label>
                <select id={`p1-cat-${i}`} bind:value={exercise.p1.category}>
                  {#each CATEGORY_OPTIONS as option}
                    <option>{option}</option>
                  {/each}
                </select>
              </div>

              <div class="partner-column">
                <label for={`p2-task-${i}`}>Partner B Task</label>
                <input
                  id={`p2-task-${i}`}
                  type="text"
                  bind:value={exercise.p2.task}
                  required
                  list="exercise-suggestions"
                />
                <label for={`p2-cat-${i}`}>Category</label>
                <select id={`p2-cat-${i}`} bind:value={exercise.p2.category}>
                  {#each CATEGORY_OPTIONS as option}
                    <option>{option}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="starter-select">
              <p class="starter-label">Who Starts This Station?</p>
              <div class="radio-group">
                <label>
                  <input type="radio" bind:group={exercise.startsOn} value={'P1'} /> Partner A
                </label>
                <label>
                  <input type="radio" bind:group={exercise.startsOn} value={'P2'} /> Partner B
                </label>
              </div>
            </div>
          </div>
        {/each}
      {:else}
        {#each exercises as exercise, i}
          <div class="exercise-item">
            <input
              type="text"
              bind:value={exercise.name}
              placeholder={`Exercise #${i + 1}`}
              required
              list="exercise-suggestions"
            />
            <select bind:value={exercise.category}>
              {#each CATEGORY_OPTIONS as option}
                <option>{option}</option>
              {/each}
            </select>
            <input
              type="text"
              bind:value={exercise.description}
              placeholder="Description (e.g., 12 reps, 45s)"
            />
            <button type="button" class="remove-btn" on:click={() => removeExercise(i)}>&times;</button>
          </div>
        {/each}
      {/if}

      <button type="button" class="secondary-btn" on:click={addExercise}>
        {mode === 'Partner' ? '+ Add Station' : '+ Add Exercise'}
      </button>
    </fieldset>

    {#if successMessage}<p class="success-message">{successMessage}</p>{/if}
    {#if errorMessage}<p class="error-message">{errorMessage}</p>{/if}
    <button type="submit" class="primary-btn" disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : 'Update Workout'}
    </button>
  </form>
</div>

<style>
  .form-container {
    width: 100%;
    max-width: 720px;
    margin: 2rem auto;
    padding: 2rem;
    background-color: var(--card);
    border: 1px solid var(--border-color);
    border-radius: 16px;
  }

  h1 {
    color: var(--yellow);
    text-align: center;
    margin-bottom: 2rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group-checkbox {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .split-group {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .split-group > .form-group {
    flex: 1 1 220px;
  }

  input[type='text'],
  textarea,
  select {
    width: 100%;
    background-color: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text);
    padding: 0.75rem;
    font-size: 1rem;
  }

  textarea {
    font-family: inherit;
    resize: vertical;
  }

  fieldset {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  legend {
    padding: 0 0.5rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .exercise-item {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr auto;
    gap: 0.75rem;
    align-items: center;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 0.5rem;
  }

  .remove-btn:hover {
    color: var(--yellow);
  }

  .secondary-btn,
  .primary-btn {
    padding: 0.85rem 1.25rem;
    border-radius: 999px;
    border: none;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text);
    align-self: flex-start;
  }

  .secondary-btn:hover {
    border-color: var(--yellow);
    color: var(--yellow);
  }

  .primary-btn {
    background: var(--yellow);
    color: var(--deep-space);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .success-message {
    color: var(--success);
  }

  .error-message {
    color: var(--danger);
  }

  /* NEW Professional Card Layout for Partner Exercises */
  .station-editor-card {
    background: var(--deep-space);
    border-radius: 12px;
    border: 1px solid var(--border-color);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .station-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .station-name-input {
    font-size: 1.25rem;
    font-weight: 600;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--border-color);
    color: var(--text-primary);
    padding: 0.5rem 0;
    flex-grow: 1;
  }

  .partner-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.5rem;
  }

  .partner-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .partner-column label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .starter-select {
    margin-top: 0.5rem;
  }

  .starter-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .radio-group {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .radio-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
  }

  @media (max-width: 600px) {
    .exercise-item {
      grid-template-columns: 1fr;
    }
  }
</style>
