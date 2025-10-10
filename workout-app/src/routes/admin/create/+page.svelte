<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { db, auth } from '$lib/firebase';
  import { collection, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';

  const CATEGORY_OPTIONS = ['Bodyweight', 'Resistance', 'Cardio Machine'];
  const DEFAULT_CATEGORY = CATEGORY_OPTIONS[0];

  let title = '';
  let type = 'Circuit';
  let mode = 'Individual';
  let previousMode = mode;
  let isBenchmark = false;
  let notes = '';

  function getDefaultIndividualExercise() {
    return { name: '', description: '', category: DEFAULT_CATEGORY, equipment: [] };
  }

  function getDefaultPartnerStation(index = 0) {
    return {
      name: `Station ${index + 1}`,
      p1: { task: '', category: DEFAULT_CATEGORY, equipment: [] },
      p2: { task: '', category: DEFAULT_CATEGORY, equipment: [] },
      startsOn: 'P1'
    };
  }

  function sanitizeCategory(category) {
    return CATEGORY_OPTIONS.includes(category) ? category : DEFAULT_CATEGORY;
  }

  function normalizeStartsOn(value) {
    return value === 'P2' ? 'P2' : 'P1';
  }

  let exercises = mode === 'Partner' ? [getDefaultPartnerStation()] : [getDefaultIndividualExercise()];

  let exerciseLibrary = [];
  let allExerciseNames = [];
  let isLibraryOpen = false;
  let librarySearchTerm = '';
  let librarySearchInput;
  let isSubmitting = false;
  let successMessage = '';
  let errorMessage = '';

  onMount(async () => {
    const querySnapshot = await getDocs(collection(db, 'exercises'));
    exerciseLibrary = querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  });

  $: allExerciseNames = Array.from(
    new Set([
      ...exerciseLibrary.map((exercise) => exercise.name).filter(Boolean),
      ...(
        mode === 'Partner'
          ? exercises.flatMap((exercise) => [exercise.p1?.task, exercise.p2?.task])
          : exercises.map((exercise) => exercise.name)
      ).filter((name) => Boolean(name))
    ])
  ).sort((a, b) => a.localeCompare(b));

  $: filteredLibrary = exerciseLibrary
    .filter((exercise) => {
      const name = exercise.name ?? '';
      return name.toLowerCase().includes(librarySearchTerm.toLowerCase());
    })
    .sort((a, b) => {
      const nameA = a.name ?? '';
      const nameB = b.name ?? '';
      return nameA.localeCompare(nameB);
    });

  $: if (mode !== previousMode) {
    exercises = mode === 'Partner' ? [getDefaultPartnerStation()] : [getDefaultIndividualExercise()];
    previousMode = mode;
  }

  function addExercise() {
    exercises = [
      ...exercises,
      mode === 'Partner' ? getDefaultPartnerStation(exercises.length) : getDefaultIndividualExercise()
    ];
  }

  function removeExercise(index) {
    exercises = exercises.filter((_, i) => i !== index);
  }

  function addExerciseFromLibrary(libraryExercise) {
    if (!libraryExercise?.name) return;

    const category = sanitizeCategory(libraryExercise.category);
    const equipment = Array.isArray(libraryExercise.equipment) ? libraryExercise.equipment : [];

    if (mode === 'Partner') {
      for (let i = 0; i < exercises.length; i += 1) {
        const station = exercises[i];
        if (!station.p1.task?.trim?.()) {
          const updatedStation = {
            ...station,
            p1: { ...station.p1, task: libraryExercise.name, category, equipment }
          };
          exercises = exercises.map((ex, idx) => (idx === i ? updatedStation : ex));
          return;
        }

        if (!station.p2.task?.trim?.()) {
          const updatedStation = {
            ...station,
            p2: { ...station.p2, task: libraryExercise.name, category, equipment }
          };
          exercises = exercises.map((ex, idx) => (idx === i ? updatedStation : ex));
          return;
        }
      }

      const newStation = getDefaultPartnerStation(exercises.length);
      newStation.p1.task = libraryExercise.name;
      newStation.p1.category = category;
      newStation.p1.equipment = equipment;
      exercises = [...exercises, newStation];
      return;
    }

    const newExercise = getDefaultIndividualExercise();
    newExercise.name = libraryExercise.name;
    newExercise.category = category;
    newExercise.equipment = equipment;
    newExercise.description = '';
    exercises = [...exercises, newExercise];
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

  $: if (isLibraryOpen && librarySearchInput) {
    librarySearchInput.focus();
  }

  function openLibrary() {
    librarySearchTerm = '';
    isLibraryOpen = true;
  }

  function closeLibrary() {
    isLibraryOpen = false;
    librarySearchTerm = '';
  }

  function handleOverlayKeyDown(event) {
    if (!isLibraryOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeLibrary();
      return;
    }

    if (
      event.currentTarget !== window &&
      (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
    ) {
      event.preventDefault();
      closeLibrary();
    }
  }

  async function saveWorkout() {
    const trimmedTitle = title?.trim?.() ?? '';

    if (!trimmedTitle || validateExercises()) {
      errorMessage = 'Please complete the workout title and all required exercise fields before saving.';
      successMessage = '';
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      errorMessage = 'You need to be signed in to create workouts.';
      successMessage = '';
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
                category: sanitizeCategory(exercise.p1?.category),
                equipment: Array.isArray(exercise.p1?.equipment) ? exercise.p1.equipment : []
              },
              p2: {
                task: exercise.p2?.task?.trim?.() ?? '',
                category: sanitizeCategory(exercise.p2?.category),
                equipment: Array.isArray(exercise.p2?.equipment) ? exercise.p2.equipment : []
              },
              startsOn: normalizeStartsOn(exercise.startsOn)
            }))
          : exercises.map((exercise) => ({
              name: exercise.name?.trim?.() ?? '',
              description: exercise.description?.trim?.() ?? '',
              category: sanitizeCategory(exercise.category),
              equipment: Array.isArray(exercise.equipment) ? exercise.equipment : []
            }));

      const workoutData = {
        title: trimmedTitle,
        type,
        mode,
        isBenchmark,
        notes: notes?.trim?.() ?? '',
        exercises: normalizedExercises,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'workouts'), workoutData);

      for (const exercise of normalizedExercises) {
        const namesToPersist =
          mode === 'Partner'
            ? [exercise.p1.task, exercise.p2.task]
            : [exercise.name];

        for (const rawName of namesToPersist) {
          const exerciseName = rawName?.trim?.();
          if (!exerciseName) continue;

          const exerciseRef = doc(db, 'exercises', exerciseName.toLowerCase());
          await setDoc(exerciseRef, { name: exerciseName }, { merge: true });
        }
      }

      successMessage = 'Workout created successfully! Redirecting...';
      setTimeout(() => goto('/admin/workouts'), 1200);
    } catch (error) {
      console.error('Error saving workout: ', error);
      errorMessage = 'Failed to save workout. Please try again.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:window on:keydown={handleOverlayKeyDown} />

<div class="form-container">
  {#if isLibraryOpen}
    <div
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Exercise library"
      tabindex="0"
      on:click|self={closeLibrary}
      on:keydown={handleOverlayKeyDown}
    >
      <div class="modal-content" role="document">
        <header class="modal-header">
          <h2>Add from Exercise Library</h2>
          <button type="button" class="close-btn" on:click={closeLibrary}>&times;</button>
        </header>
        <input
          type="search"
          bind:value={librarySearchTerm}
          placeholder="Search exercises..."
          bind:this={librarySearchInput}
        />

        {#if filteredLibrary.length === 0}
          <p class="empty-state">No exercises found. Try a different search.</p>
        {:else}
          <div class="library-grid">
            {#each filteredLibrary as libraryExercise (libraryExercise.id)}
              <button
                type="button"
                class="library-item"
                on:click={() => {
                  addExerciseFromLibrary(libraryExercise);
                  closeLibrary();
                }}
              >
                <span class="library-item-name">{libraryExercise.name}</span>
                <span class="library-item-category">{libraryExercise.category}</span>
                {#if libraryExercise.equipment?.length}
                  <span class="library-item-equipment">
                    {libraryExercise.equipment.join(', ')}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <h1>Create New Workout</h1>
  <form on:submit|preventDefault={saveWorkout}>
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
          <option>For Time</option>
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
      <textarea id="notes" bind:value={notes} rows="3" placeholder="Coaching notes, setup reminders, etc."></textarea>
    </div>

    <div class="form-group-checkbox">
      <input id="benchmark" type="checkbox" bind:checked={isBenchmark} />
      <label for="benchmark">Make this a Benchmark Workout</label>
    </div>

    <fieldset>
      <legend>Exercises</legend>
      <p class="input-hint">
        Use the exercise library for quick selections or add stations manually. Station names and tasks are required.
      </p>

      <datalist id="exercise-suggestions">
        {#each allExerciseNames as exerciseName}
          <option value={exerciseName}></option>
        {/each}
      </datalist>

      {#if mode === 'Partner'}
        {#each exercises as exercise, index}
          <div class="station-editor-card">
            <div class="station-editor-header">
              <input
                class="station-name-input"
                type="text"
                bind:value={exercise.name}
                placeholder={`Station ${index + 1}`}
                required
              />
              <button type="button" class="remove-btn" on:click={() => removeExercise(index)}>&times;</button>
            </div>

            <div class="partner-grid">
              <div class="partner-column">
                <label for={`p1-task-${index}`}>Partner A Task</label>
                <input
                  id={`p1-task-${index}`}
                  type="text"
                  bind:value={exercise.p1.task}
                  required
                  list="exercise-suggestions"
                />
                <label for={`p1-cat-${index}`}>Category</label>
                <select id={`p1-cat-${index}`} bind:value={exercise.p1.category}>
                  {#each CATEGORY_OPTIONS as option}
                    <option>{option}</option>
                  {/each}
                </select>
              </div>

              <div class="partner-column">
                <label for={`p2-task-${index}`}>Partner B Task</label>
                <input
                  id={`p2-task-${index}`}
                  type="text"
                  bind:value={exercise.p2.task}
                  required
                  list="exercise-suggestions"
                />
                <label for={`p2-cat-${index}`}>Category</label>
                <select id={`p2-cat-${index}`} bind:value={exercise.p2.category}>
                  {#each CATEGORY_OPTIONS as option}
                    <option>{option}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="starter-select">
              <p class="starter-label">Who starts this station?</p>
              <div class="radio-group">
                <label>
                  <input type="radio" bind:group={exercise.startsOn} value="P1" /> Partner A
                </label>
                <label>
                  <input type="radio" bind:group={exercise.startsOn} value="P2" /> Partner B
                </label>
              </div>
            </div>
          </div>
        {/each}
      {:else}
        {#each exercises as exercise, index}
          <div class="exercise-item">
            <input
              type="text"
              bind:value={exercise.name}
              placeholder={`Exercise #${index + 1}`}
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
            <button type="button" class="remove-btn" on:click={() => removeExercise(index)}>&times;</button>
          </div>
        {/each}
      {/if}

      <div class="exercise-actions">
        <button type="button" class="secondary-btn" on:click={addExercise}>
          {mode === 'Partner' ? '+ Add Station' : '+ Add Exercise'}
        </button>
        <button
          type="button"
          class="primary-btn library-btn"
          on:click={openLibrary}
        >
          + Add from Library
        </button>
      </div>
    </fieldset>

    {#if successMessage}
      <p class="success-message">{successMessage}</p>
    {/if}
    {#if errorMessage}
      <p class="error-message">{errorMessage}</p>
    {/if}

    <button type="submit" class="primary-btn submit-btn" disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : 'Save Workout'}
    </button>
  </form>
</div>

<style>
  .form-container {
    width: 100%;
    max-width: 760px;
    margin: 2rem auto;
    padding: 2rem;
    background: var(--surface-1);
    border: 1px solid var(--border-color);
    border-radius: 16px;
  }

  h1 {
    font-family: var(--font-display);
    color: var(--brand-yellow);
    text-align: center;
    margin-bottom: 1.5rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .split-group {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .split-group .form-group {
    flex: 1 1 220px;
  }

  .form-group-checkbox {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  input[type='text'],
  input[type='search'],
  select,
  textarea {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--deep-space);
    color: var(--text-primary);
    padding: 0.75rem;
    font-size: 1rem;
  }

  textarea {
    resize: vertical;
  }

  fieldset {
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  legend {
    font-weight: 600;
    padding: 0 0.5rem;
    color: var(--text-muted);
  }

  .input-hint {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0;
  }

  .exercise-item {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr auto;
    gap: 0.75rem;
    align-items: center;
  }

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
    align-items: center;
    gap: 1rem;
  }

  .station-name-input {
    flex: 1;
    font-size: 1.1rem;
    font-weight: 600;
    border: none;
    border-bottom: 2px solid var(--border-color);
    background: transparent;
    color: var(--text-primary);
    padding-bottom: 0.35rem;
  }

  .partner-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.25rem;
  }

  .partner-column {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .starter-select {
    border-top: 1px solid var(--border-color);
    padding-top: 1rem;
  }

  .starter-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .radio-group {
    display: flex;
    gap: 1.5rem;
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 0.35rem;
  }

  .remove-btn:hover {
    color: var(--brand-yellow);
  }

  .exercise-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .secondary-btn,
  .primary-btn {
    border: none;
    border-radius: 999px;
    padding: 0.85rem 1.5rem;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  .secondary-btn:hover {
    border-color: var(--brand-yellow);
    color: var(--brand-yellow);
  }

  .primary-btn {
    background: var(--brand-green);
    color: var(--deep-space);
  }

  .library-btn {
    background: var(--brand-yellow);
    color: var(--deep-space);
  }

  .submit-btn {
    align-self: flex-end;
    padding: 1rem 2.5rem;
    font-size: 1.1rem;
  }

  .primary-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .success-message {
    color: var(--brand-green);
    font-weight: 600;
  }

  .error-message {
    color: #f87171;
    font-weight: 600;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    padding: 2rem;
    z-index: 10;
  }

  .modal-content {
    width: min(680px, 100%);
    background: var(--surface-1);
    border-radius: 16px;
    border: 1px solid var(--border-color);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    position: relative;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.75rem;
    cursor: pointer;
  }

  .close-btn:hover {
    color: var(--brand-yellow);
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    max-height: 55vh;
    overflow-y: auto;
  }

  .library-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    background: var(--deep-space);
    color: var(--text-primary);
    padding: 1rem;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }

  .library-item:hover {
    border-color: var(--brand-yellow);
    transform: translateY(-2px);
  }

  .library-item-name {
    font-weight: 600;
  }

  .library-item-category {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .library-item-equipment {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .empty-state {
    text-align: center;
    color: var(--text-muted);
  }

  @media (max-width: 680px) {
    .exercise-item {
      grid-template-columns: 1fr;
    }

    .exercise-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .submit-btn {
      width: 100%;
      align-self: stretch;
    }
  }
</style>
