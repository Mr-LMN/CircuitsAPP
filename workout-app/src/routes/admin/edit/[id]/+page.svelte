<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { db } from '$lib/firebase';
  import { doc, updateDoc, getDocs, collection, setDoc } from 'firebase/firestore';
  import { DEFAULT_CHIPPER_REP_SCHEME, createDefaultChipperStep, normaliseChipperSteps, hasIncompleteChipperStep } from '$lib/chipper';

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

  function getDefaultChipperSteps() {
    return DEFAULT_CHIPPER_REP_SCHEME.map((_, index) => createDefaultChipperStep(index, DEFAULT_CATEGORY));
  }

  function sanitizeChipperStep(step, index = 0) {
    const schemeIndex = Math.min(index, DEFAULT_CHIPPER_REP_SCHEME.length - 1);
    const fallback = DEFAULT_CHIPPER_REP_SCHEME[schemeIndex] ?? 10;
    const repsValue = Number(step?.reps);
    return {
      name: step?.name ?? '',
      reps: Number.isFinite(repsValue) && repsValue > 0 ? Math.round(repsValue) : Math.round(fallback),
      category: sanitizeCategory(step?.category)
    };
  }

  function sanitizeFinisher(finisher = {}) {
    const defaultDescription = 'Max calories until the clock hits zero.';
    const rawName = typeof finisher?.name === 'string' ? finisher.name.trim() : '';
    const rawDescription = typeof finisher?.description === 'string' ? finisher.description.trim() : '';
    return {
      name: rawName || 'Max Calories',
      description: rawDescription || defaultDescription,
      category: sanitizeCategory(finisher?.category)
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

  function toChipperStep(exercise, index = 0) {
    const name = exercise?.name ?? '';
    const repsSource = exercise?.reps ?? exercise?.targetReps ?? exercise?.description;
    let repsValue = Number(repsSource);
    if (!Number.isFinite(repsValue) || repsValue <= 0) {
      const match = typeof repsSource === 'string' ? repsSource.match(/\d+/) : null;
      if (match) {
        repsValue = Number(match[0]);
      }
    }
    const schemeIndex = Math.min(index, DEFAULT_CHIPPER_REP_SCHEME.length - 1);
    const fallback = DEFAULT_CHIPPER_REP_SCHEME[schemeIndex] ?? 10;
    return {
      name,
      reps: Number.isFinite(repsValue) && repsValue > 0 ? Math.round(repsValue) : Math.round(fallback),
      category: sanitizeCategory(exercise?.category)
    };
  }

  function initializeExercises(initialExercises = []) {
    if (!Array.isArray(initialExercises) || initialExercises.length === 0) {
      if (mode === 'Partner') return [getDefaultPartnerStation()];
      if (mode === 'Chipper') return getDefaultChipperSteps();
      return [getDefaultIndividualExercise()];
    }

    if (mode === 'Partner') {
      return initialExercises.map((exercise, index) => toPartnerExercise(exercise, index));
    }

    if (mode === 'Chipper') {
      const steps = data.workout?.chipper?.steps ?? initialExercises;
      return steps.map((exercise, index) => sanitizeChipperStep(toChipperStep(exercise, index), index));
    }

    return initialExercises.map((exercise) => toIndividualExercise(exercise));
  }

  let exercises = initializeExercises(data.workout.exercises ?? []);

  let chipperFinisher =
    mode === 'Chipper'
      ? sanitizeFinisher(data.workout?.chipper?.finisher ?? { category: 'Cardio Machine' })
      : sanitizeFinisher({ category: 'Cardio Machine' });

  // UI state
  let isSubmitting = false;
  let successMessage = '';
  let errorMessage = '';
  let libraryNames = [];
  let allExerciseNames = [];

  // Reactive statement to automatically reset the exercises when the mode changes
  $: if (mode !== previousMode) {
    if (mode === 'Partner') {
      exercises = [getDefaultPartnerStation()];
    } else if (mode === 'Chipper') {
      exercises = getDefaultChipperSteps();
      chipperFinisher = sanitizeFinisher(chipperFinisher);
    } else {
      exercises = [getDefaultIndividualExercise()];
    }
    previousMode = mode;
  }

  onMount(async () => {
    const querySnapshot = await getDocs(collection(db, 'exercises'));
    libraryNames = querySnapshot.docs.map((docSnap) => docSnap.data().name);
  });

  $: allExerciseNames = Array.from(
    new Set([
      ...libraryNames,
      ...(
        mode === 'Partner'
          ? exercises.flatMap((exercise) => [exercise.p1?.task, exercise.p2?.task])
          : mode === 'Chipper'
          ? exercises.map((exercise) => exercise.name)
          : exercises.map((exercise) => exercise.name)
      ).filter(Boolean),
      ...(mode === 'Chipper' && chipperFinisher.name ? [chipperFinisher.name] : [])
    ])
  ).sort((a, b) => a.localeCompare(b));

  function addExercise() {
    if (mode === 'Partner') {
      exercises = [...exercises, getDefaultPartnerStation(exercises.length)];
    } else if (mode === 'Chipper') {
      exercises = [
        ...exercises,
        sanitizeChipperStep(createDefaultChipperStep(exercises.length, DEFAULT_CATEGORY), exercises.length)
      ];
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

    if (mode === 'Chipper') {
      const hasInvalidStep = exercises.some((step) => hasIncompleteChipperStep(step));
      const finisherName = chipperFinisher.name?.trim?.();
      return hasInvalidStep || !finisherName;
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
      let normalizedExercises = [];
      let chipperPayload = null;

      if (mode === 'Partner') {
        normalizedExercises = exercises.map((exercise, index) => ({
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
        }));
      } else if (mode === 'Chipper') {
        const steps = normaliseChipperSteps(exercises, sanitizeCategory);
        const finisher = sanitizeFinisher(chipperFinisher);
        chipperPayload = {
          steps,
          finisher
        };

        normalizedExercises = [
          {
            name: finisher.name?.trim?.() || 'Max Calories',
            description: finisher.description?.trim?.() || 'Max calories until the clock hits zero.',
            category: sanitizeCategory(finisher.category),
            isFinisher: true,
            metric: 'Calories'
          }
        ];
      } else {
        normalizedExercises = exercises.map((exercise) => ({
          name: exercise.name?.trim?.() ?? '',
          description: exercise.description?.trim?.() ?? '',
          category: sanitizeCategory(exercise.category)
        }));
      }

      const workoutRef = doc(db, 'workouts', data.workout.id);
      const updatedData = {
        title: trimmedTitle,
        type,
        mode,
        isBenchmark,
        notes: notes?.trim?.() ?? '',
        exercises: normalizedExercises,
        chipper: chipperPayload
      };

      await updateDoc(workoutRef, updatedData);

      const namesToPersist =
        mode === 'Partner'
          ? normalizedExercises.flatMap((exercise) => [exercise.p1.task, exercise.p2.task])
          : mode === 'Chipper'
          ? [
              ...new Set([
                ...chipperPayload.steps.map((step) => step.name),
                chipperPayload.finisher?.name ?? ''
              ])
            ]
          : normalizedExercises.map((exercise) => exercise.name);

      for (const rawName of namesToPersist) {
        const exerciseName = rawName?.trim?.();
        if (!exerciseName) continue;

        const exerciseRef = doc(db, 'exercises', exerciseName.toLowerCase());
        await setDoc(exerciseRef, { name: exerciseName });
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
          <option>Chipper</option>
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
      {:else if mode === 'Chipper'}
        <div class="chipper-editor">
          <header class="chipper-heading">
            <h3>Chipper sequence</h3>
            <p>Update the movements and reps. We'll surface this order on the live timer.</p>
          </header>

          <div class="chipper-grid chipper-grid-header" aria-hidden="true">
            <span>Movement</span>
            <span>Reps</span>
            <span>Category</span>
          </div>

          {#each exercises as step, index}
            <div class="chipper-grid">
              <div class="chipper-movement">
                <span class="chipper-index" aria-hidden="true">#{index + 1}</span>
                <label class="sr-only" for={`chipper-move-${index}`}>Movement {index + 1}</label>
                <input
                  id={`chipper-move-${index}`}
                  type="text"
                  bind:value={step.name}
                  placeholder={`Exercise #${index + 1}`}
                  required
                  list="exercise-suggestions"
                />
              </div>
              <div class="chipper-reps">
                <label class="sr-only" for={`chipper-reps-${index}`}>Repetitions for movement {index + 1}</label>
                <input
                  id={`chipper-reps-${index}`}
                  type="number"
                  min="1"
                  inputmode="numeric"
                  bind:value={step.reps}
                  required
                />
              </div>
              <div class="chipper-category">
                <label class="sr-only" for={`chipper-cat-${index}`}>Category for movement {index + 1}</label>
                <select id={`chipper-cat-${index}`} bind:value={step.category}>
                  {#each CATEGORY_OPTIONS as option}
                    <option>{option}</option>
                  {/each}
                </select>
              </div>
              <button
                type="button"
                class="remove-btn"
                on:click={() => removeExercise(index)}
                aria-label={`Remove movement ${index + 1}`}
              >
                &times;
              </button>
            </div>
          {/each}

          <div class="chipper-finisher">
            <h4>Finisher</h4>
            <p>Use this section for the max calorie push once the chipper work is done.</p>
            <div class="finisher-grid">
              <div class="finisher-name">
                <label for="finisher-name">Finisher name</label>
                <input
                  id="finisher-name"
                  type="text"
                  bind:value={chipperFinisher.name}
                  placeholder="Max Calories"
                  required
                />
              </div>
              <div class="finisher-category">
                <label for="finisher-category">Category</label>
                <select id="finisher-category" bind:value={chipperFinisher.category}>
                  {#each CATEGORY_OPTIONS as option}
                    <option>{option}</option>
                  {/each}
                </select>
              </div>
            </div>
            <label for="finisher-notes" class="finisher-notes-label">Description (optional)</label>
            <input
              id="finisher-notes"
              type="text"
              bind:value={chipperFinisher.description}
              placeholder="E.g. Max calories on the Echo Bike"
            />
          </div>
        </div>
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
        {mode === 'Partner' ? '+ Add Station' : mode === 'Chipper' ? '+ Add Movement' : '+ Add Exercise'}
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

  .chipper-editor {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
  }

  .chipper-heading h3 {
    margin: 0;
    font-size: 1.25rem;
  }

  .chipper-heading p {
    margin: 0.25rem 0 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .chipper-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px 160px auto;
    gap: 0.75rem;
    align-items: center;
  }

  .chipper-grid + .chipper-grid {
    border-top: 1px solid var(--border-color);
    padding-top: 0.85rem;
    margin-top: 0.85rem;
  }

  .chipper-grid-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 0.35rem;
  }

  .chipper-grid-header span:last-child {
    justify-self: center;
  }

  .chipper-movement {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .chipper-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--card);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.9rem;
  }

  .chipper-movement input {
    flex: 1;
  }

  .chipper-reps input {
    text-align: center;
  }

  .chipper-category select {
    width: 100%;
  }

  .chipper-finisher {
    border-top: 1px solid var(--border-color);
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .chipper-finisher h4 {
    margin: 0;
    font-size: 1.1rem;
  }

  .chipper-finisher p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .finisher-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(140px, 200px);
    gap: 1rem;
  }

  .finisher-grid label {
    font-size: 0.85rem;
    color: var(--text-muted);
    display: block;
    margin-bottom: 0.35rem;
  }

  .finisher-notes-label {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .finisher-grid input,
  .finisher-grid select,
  #finisher-notes {
    width: 100%;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  @media (max-width: 720px) {
    .chipper-grid {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }

    .chipper-grid-header {
      display: none;
    }

    .chipper-index {
      width: 28px;
      height: 28px;
      font-size: 0.8rem;
    }

    .remove-btn {
      justify-self: flex-start;
      padding-left: 0;
    }

    .finisher-grid {
      grid-template-columns: 1fr;
    }
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
