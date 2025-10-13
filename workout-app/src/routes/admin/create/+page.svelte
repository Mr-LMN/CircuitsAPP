<script>
  // @ts-nocheck
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { db, auth } from '$lib/firebase';
  import { collection, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';

  const FALLBACK_CATEGORIES = ['Bodyweight', 'Cardio Machine', 'Resistance'];

  let categoryOptions = [...FALLBACK_CATEGORIES].sort((a, b) => a.localeCompare(b));
  let defaultCategory = categoryOptions[0];

  let title = '';
  let type = 'Circuit';
  let mode = 'Individual';
  let previousMode = mode;
  let isBenchmark = false;
  let notes = '';

  function getDefaultIndividualExercise() {
    return { name: '', description: '', category: defaultCategory, equipment: [] };
  }

  function getDefaultPartnerStation(index = 0) {
    return {
      name: `Station ${index + 1}`,
      p1: { task: '', category: defaultCategory, equipment: [] },
      p2: { task: '', category: defaultCategory, equipment: [] },
      startsOn: 'P1'
    };
  }

  function sanitizeCategory(category) {
    return categoryOptions.includes(category) ? category : defaultCategory;
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
  let selectedLibraryIds = [];
  let isSubmitting = false;
  let successMessage = '';
  let errorMessage = '';

  onMount(async () => {
    const querySnapshot = await getDocs(collection(db, 'exercises'));
    exerciseLibrary = querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

    const derivedCategories = Array.from(
      new Set(
        exerciseLibrary
          .map((exercise) => (typeof exercise.category === 'string' ? exercise.category.trim() : ''))
          .filter((category) => category.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    categoryOptions =
      derivedCategories.length > 0
        ? derivedCategories
        : [...FALLBACK_CATEGORIES].sort((a, b) => a.localeCompare(b));
    defaultCategory = categoryOptions[0];

    exercises =
      mode === 'Partner'
        ? exercises.map((exercise) => ({
            ...exercise,
            p1: { ...exercise.p1, category: sanitizeCategory(exercise.p1?.category) },
            p2: { ...exercise.p2, category: sanitizeCategory(exercise.p2?.category) }
          }))
        : exercises.map((exercise) => ({
            ...exercise,
            category: sanitizeCategory(exercise.category)
          }));
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
    selectedLibraryIds = [];
    isLibraryOpen = true;
  }

  function closeLibrary() {
    isLibraryOpen = false;
    librarySearchTerm = '';
    selectedLibraryIds = [];
  }

  function clearLibrarySearch() {
    librarySearchTerm = '';
    librarySearchInput?.focus?.();
  }

  function toggleLibrarySelection(libraryExerciseId) {
    if (!libraryExerciseId) return;

    selectedLibraryIds = selectedLibraryIds.includes(libraryExerciseId)
      ? selectedLibraryIds.filter((id) => id !== libraryExerciseId)
      : [...selectedLibraryIds, libraryExerciseId];
  }

  function importSelectedExercises() {
    if (!selectedLibraryIds.length) return;

    const exercisesById = new Map(exerciseLibrary.map((exercise) => [exercise.id, exercise]));

    for (const exerciseId of selectedLibraryIds) {
      const libraryExercise = exercisesById.get(exerciseId);

      if (libraryExercise) {
        addExerciseFromLibrary(libraryExercise);
      }
    }

    closeLibrary();
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
      event.target === event.currentTarget &&
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
        <div class="library-toolbar">
          <div class="search-bar">
            <svg
              class="search-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M15.5 14h-.79l-.28-.27a6 6 0 1 0-.71.71l.27.28v.79l4.75 4.74a1 1 0 0 0 1.41-1.41zm-5.5 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8"
              />
            </svg>
            <input
              type="search"
              bind:value={librarySearchTerm}
              placeholder="Search exercises..."
              aria-label="Search exercises"
              bind:this={librarySearchInput}
            />
            {#if librarySearchTerm.trim().length}
              <button
                type="button"
                class="clear-search"
                on:click={clearLibrarySearch}
                aria-label="Clear search term"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            {/if}
          </div>

          <span class="result-count" aria-live="polite">
            {#if librarySearchTerm.trim().length === 0}
              {exerciseLibrary.length} exercises available
            {:else if filteredLibrary.length === 0}
              No matches
            {:else}
              {filteredLibrary.length} match{filteredLibrary.length === 1 ? '' : 'es'}
            {/if}
          </span>
        </div>

        {#if filteredLibrary.length === 0}
          <p class="empty-state">No exercises found. Try a different search.</p>
        {:else}
          <div class="library-grid">
            {#each filteredLibrary as libraryExercise (libraryExercise.id)}
              {@const isSelected = selectedLibraryIds.includes(libraryExercise.id)}
              <button
                type="button"
                class="library-item"
                class:selected={isSelected}
                aria-pressed={isSelected}
                on:click={() => toggleLibrarySelection(libraryExercise.id)}
              >
                <div class="library-item-header">
                  <span class="library-item-checkbox" aria-hidden="true">
                    {#if isSelected}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.704 5.29a1 1 0 0 1 0 1.42l-7.2 7.19a1 1 0 0 1-1.414 0l-3.2-3.19a1 1 0 1 1 1.414-1.42l2.493 2.48 6.493-6.48a1 1 0 0 1 1.414 0Z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    {/if}
                  </span>
                  <span class="library-item-name">{libraryExercise.name}</span>
                </div>
                <span class="library-item-category">{libraryExercise.category}</span>
                {#if libraryExercise.equipment?.length}
                  <span class="library-item-equipment">
                    {libraryExercise.equipment.join(', ')}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
          <div class="library-footer">
            <span class="selection-count" aria-live="polite">
              {#if selectedLibraryIds.length === 0}
                No exercises selected
              {:else if selectedLibraryIds.length === 1}
                1 exercise selected
              {:else}
                {selectedLibraryIds.length} exercises selected
              {/if}
            </span>
            <button
              type="button"
              class="primary-btn import-btn"
              on:click={importSelectedExercises}
              disabled={!selectedLibraryIds.length}
            >
              Add Selected
            </button>
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
                  {#each categoryOptions as option}
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
                  {#each categoryOptions as option}
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
              {#each categoryOptions as option}
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
    background: rgba(5, 8, 15, 0.78);
    backdrop-filter: blur(4px);
    padding: clamp(1.5rem, 4vw, 3rem);
    z-index: 10;
  }

  .modal-content {
    width: min(720px, 100%);
    background: var(--surface-1);
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: clamp(1.5rem, 4vw, 2.25rem);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    position: relative;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
    max-height: min(720px, calc(100vh - 4rem));
    overflow: hidden;
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

  .library-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: stretch;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: rgba(17, 23, 34, 0.85);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .search-bar:focus-within {
    border-color: var(--brand-yellow);
    box-shadow: 0 0 0 3px rgba(247, 224, 120, 0.18);
  }

  .search-bar input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 0.95rem;
    outline: none;
  }

  .search-bar input::placeholder {
    color: var(--text-muted);
  }

  .search-icon {
    width: 1.1rem;
    height: 1.1rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .clear-search {
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 0.25rem;
    border-radius: 999px;
    cursor: pointer;
    transition: color 0.2s ease, background 0.2s ease;
  }

  .clear-search:hover,
  .clear-search:focus-visible {
    color: var(--brand-yellow);
    background: rgba(247, 224, 120, 0.08);
  }

  .clear-search:focus-visible {
    outline: 2px solid var(--brand-yellow);
    outline-offset: 2px;
  }

  .result-count {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  @media (min-width: 560px) {
    .library-toolbar {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .result-count {
      text-align: right;
    }
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    max-height: clamp(320px, 55vh, 540px);
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .library-grid::-webkit-scrollbar {
    width: 0.4rem;
  }

  .library-grid::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
  }

  .library-item {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(17, 24, 39, 0.78));
    color: var(--text-primary);
    padding: 1rem;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }

  .library-item.selected {
    border-color: rgba(247, 224, 120, 0.6);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
  }

  .library-item:hover {
    border-color: rgba(247, 224, 120, 0.6);
    transform: translateY(-2px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
  }

  .library-item:focus-visible {
    outline: 2px solid var(--brand-yellow);
    outline-offset: 3px;
  }

  .library-item-header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .library-item-checkbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 8px;
    border: 1.5px solid rgba(255, 255, 255, 0.16);
    background: rgba(17, 24, 39, 0.75);
    color: var(--brand-yellow);
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .library-item.selected .library-item-checkbox {
    border-color: rgba(247, 224, 120, 0.9);
    background: rgba(247, 224, 120, 0.15);
  }

  .library-item-checkbox svg {
    width: 1rem;
    height: 1rem;
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

  .library-footer {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  .selection-count {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .import-btn {
    align-self: flex-start;
    padding-inline: 1.75rem;
  }

  .import-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  @media (min-width: 560px) {
    .library-footer {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .import-btn {
      align-self: unset;
    }
  }
</style>
