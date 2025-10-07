<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { db, auth } from '$lib/firebase';
	import { collection, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// Form state
	let title = '';
	let type = 'Circuit';
	let mode = 'Individual'; // Default mode is now Individual
	let isBenchmark = false;
	let notes = '';

	// This will now hold different shaped objects based on the 'mode'
        const categoryOptions = ['Cardio Machine', 'Resistance', 'Bodyweight'];
        const defaultCategory = categoryOptions[0];

        let exercises = [{ name: '', description: '', category: defaultCategory }];
        let structureMode = mode;

        function normalizeStarter(value) {
                return value?.toString?.().toUpperCase() === 'P2' ? 'P2' : 'P1';
        }

        function convertToPartner(list) {
                return list.map((exercise, index) => ({
                        name: exercise.name || `Station ${index + 1}`,
                        p1_task: exercise.p1_task ?? exercise.description ?? '',
                        p2_task: exercise.p2_task ?? '',
                        startsWith: normalizeStarter(exercise.startsWith ?? exercise.starter),
                        category: exercise.category ?? defaultCategory
                }));
        }

        function convertToIndividual(list) {
                return list.map((exercise) => ({
                        name: exercise.name ?? '',
                        description:
                                exercise.description ??
                                [exercise.p1_task, exercise.p2_task].filter(Boolean).join(' / '),
                        category: exercise.category ?? defaultCategory
                }));
        }

        // UI state
        let isSubmitting = false;
        let successMessage = '';
        let errorMessage = '';
        let allExerciseNames = [];

        // Keep exercise data aligned with the currently selected mode
        $: if (mode !== structureMode) {
                exercises = mode === 'Partner' ? convertToPartner(exercises) : convertToIndividual(exercises);
                structureMode = mode;
        }

	onMount(async () => {
		const querySnapshot = await getDocs(collection(db, 'exercises'));
		allExerciseNames = querySnapshot.docs.map((doc) => doc.data().name);
	});

        function addExercise() {
                exercises =
                        mode === 'Partner'
                                ? [
                                          ...exercises,
                                          {
                                                  name: `Station ${exercises.length + 1}`,
                                                  p1_task: '',
                                                  p2_task: '',
                                                  startsWith: 'P1',
                                                  category: defaultCategory
                                          }
                                  ]
                                : [
                                          ...exercises,
                                          { name: '', description: '', category: defaultCategory }
                                  ];
        }

        function removeExercise(index) {
                exercises = exercises.filter((_, i) => i !== index);
        }

        function updateStarter(index, value) {
                exercises = exercises.map((exercise, i) =>
                        i === index ? { ...exercise, startsWith: normalizeStarter(value) } : exercise
                );
        }

        async function saveWorkout() {
                // Validation logic needs to be aware of the different structures
                const isInvalid =
                        mode === 'Partner'
				? exercises.some((ex) => !ex.name || !ex.p1_task || !ex.p2_task)
				: exercises.some((ex) => !ex.name);

		if (!title || isInvalid) {
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
                                                  name: exercise.name || `Station ${index + 1}`,
                                                  p1_task: exercise.p1_task,
                                                  p2_task: exercise.p2_task,
                                                  startsWith: normalizeStarter(exercise.startsWith),
                                                  category: exercise.category ?? defaultCategory
                                          }))
                                        : exercises.map((exercise) => ({
                                                  name: exercise.name,
                                                  description: exercise.description,
                                                  category: exercise.category ?? defaultCategory
                                          }));

                        const workoutData = {
                                title,
                                type,
                                mode,
                                isBenchmark,
                                notes,
                                exercises: normalizedExercises,
                                creatorId: auth.currentUser.uid,
                                createdAt: serverTimestamp()
                        };
                        await addDoc(collection(db, 'workouts'), workoutData);

                        for (const exercise of normalizedExercises) {
                                // Store individual names or Partner A/B tasks for future suggestions
                                const namesToSave =
                                        mode === 'Partner' ? [exercise.p1_task, exercise.p2_task] : [exercise.name];
				for (const name of namesToSave) {
					const exerciseName = name.trim();
					if (exerciseName) {
						const exerciseRef = doc(db, 'exercises', exerciseName.toLowerCase());
						await setDoc(exerciseRef, { name: exerciseName });
					}
				}
			}

			successMessage = 'Workout saved successfully!';
			setTimeout(() => goto(resolve('/admin/workouts')), 1500);
		} catch (error) {
			console.error('Error saving workout: ', error);
			errorMessage = 'Failed to save workout. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="form-container">
	<h1>Create New Workout</h1>
	<form on:submit|preventDefault={saveWorkout}>
		<div class="form-group">
			<label for="title">Workout Title</label>
			<input
				id="title"
				type="text"
				bind:value={title}
				placeholder="e.g., Full Body Blast"
				required
			/>
		</div>
		<div class="split-group">
			<div class="form-group">
				<label for="type">Workout Type</label>
				<select id="type" bind:value={type}>
					<option>Circuit</option> <option>AMRAP</option> <option>EMOM</option>
					<option>Timed Rounds</option>
				</select>
			</div>
			<div class="form-group">
				<label for="mode">Participation Mode</label>
				<select id="mode" bind:value={mode}>
					<option>Individual</option> <option>Partner</option>
				</select>
			</div>
		</div>
		<div class="form-group">
			<label for="notes">Notes / Instructions (for equipment, technique, etc.)</label>
			<textarea id="notes" bind:value={notes} rows="3"></textarea>
		</div>
		<div class="form-group-checkbox">
			<input id="benchmark" type="checkbox" bind:checked={isBenchmark} />
			<label for="benchmark">Make this a Benchmark Workout</label>
		</div>

                <fieldset>
                        <legend>
                                Exercises
                                {#if mode === 'Partner'}
                                        <span class="fieldset-note">Partners alternate between A &amp; B tasks.</span>
                                {/if}
                        </legend>
                        {#if mode === 'Partner'}
                                <p class="partner-helper">
                                        Assign a task for Partner A and Partner B. The timer automatically adds a swap
                                        window so they can trade positions each round.
                                </p>
                        {/if}
                        <datalist id="exercise-suggestions">
                                {#each allExerciseNames as name (name)}
                                        <option value={name}></option>
                                {/each}
                        </datalist>

                        {#if mode === 'Partner'}
                                {#each exercises as exercise, i (i)}
                                        <div class="exercise-item partner">
                                                <input
                                                        class="station-name"
                                                        type="text"
                                                        bind:value={exercise.name}
                                                        placeholder="Station #{i + 1} Name"
                                                        required
                                                />
                                                <select
                                                        class="category-select"
                                                        bind:value={exercise.category}
                                                        aria-label="Exercise category"
                                                >
                                                        {#each categoryOptions as option}
                                                                <option value={option}>{option}</option>
                                                        {/each}
                                                </select>
                                                <div class="partner-tasks">
                                                        <label class="task-label" for={`partner-a-${i}`}>
                                                                Partner A Task
                                                        </label>
                                                        <input
                                                                id={`partner-a-${i}`}
                                                                type="text"
                                                                bind:value={exercise.p1_task}
                                                                placeholder="e.g., Treadmill Run"
                                                                required
                                                                list="exercise-suggestions"
                                                        />
                                                        <label class="task-label" for={`partner-b-${i}`}>
                                                                Partner B Task
                                                        </label>
                                                        <input
                                                                id={`partner-b-${i}`}
                                                                type="text"
                                                                bind:value={exercise.p2_task}
                                                                placeholder="e.g., Plank Hold"
                                                                required
                                                                list="exercise-suggestions"
                                                        />
                                                </div>
                                                <div class="starter-select">
                                                        <span class="starter-label">Who starts this station?</span>
                                                        <div class="starter-options">
                                                                <label>
                                                                        <input
                                                                                type="radio"
                                                                                name={`starter-${i}`}
                                                                                value="P1"
                                                                                checked={normalizeStarter(exercise.startsWith) === 'P1'}
                                                                                on:change={() => updateStarter(i, 'P1')}
                                                                        />
                                                                        Partner A
                                                                </label>
                                                                <label>
                                                                        <input
                                                                                type="radio"
                                                                                name={`starter-${i}`}
                                                                                value="P2"
                                                                                checked={normalizeStarter(exercise.startsWith) === 'P2'}
                                                                                on:change={() => updateStarter(i, 'P2')}
                                                                        />
                                                                        Partner B
                                                                </label>
                                                        </div>
                                                </div>
                                                <button type="button" class="remove-btn" on:click={() => removeExercise(i)}
                                                        >&times;</button
                                                >
                                        </div>
                                {/each}
                        {:else}
                                {#each exercises as exercise, i (i)}
                                        <div class="exercise-item">
                                                <input
                                                        type="text"
                                                        bind:value={exercise.name}
                                                        placeholder="Exercise #{i + 1} Name"
                                                        required
                                                        list="exercise-suggestions"
                                                />
                                                <select
                                                        class="category-select"
                                                        bind:value={exercise.category}
                                                        aria-label="Exercise category"
                                                >
                                                        {#each categoryOptions as option}
                                                                <option value={option}>{option}</option>
                                                        {/each}
                                                </select>
                                                <input
                                                        type="text"
                                                        bind:value={exercise.description}
                                                        placeholder="Description (e.g., 12 reps, 45s)"
                                                />
						<button type="button" class="remove-btn" on:click={() => removeExercise(i)}
							>&times;</button
						>
					</div>
				{/each}
			{/if}
			<button type="button" class="secondary-btn" on:click={addExercise}>+ Add Exercise</button>
		</fieldset>

		{#if successMessage}
			<p class="success-message">{successMessage}</p>
		{/if}
		{#if errorMessage}
			<p class="error-message">{errorMessage}</p>
		{/if}
		<button type="submit" class="primary-btn" disabled={isSubmitting}
			>{isSubmitting ? 'Saving...' : 'Save Workout'}</button
		>
	</form>
</div>

<style>
	/* ... (all previous styles) ... */
	.form-container {
		width: 100%;
		max-width: 700px;
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
	.split-group {
		display: flex;
		gap: 1rem;
	}
	.split-group > .form-group {
		flex: 1;
	}
	select,
	textarea {
		width: 100%;
		background-color: var(--bg);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		color: var(--text);
		padding: 0.75rem;
		font-size: 1rem;
	}
	select {
		-webkit-appearance: none;
		-moz-appearance: none;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='%23ffd60a' class='w-6 h-6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19.5 8.25-7.5 7.5-7.5-7.5' /%3E%3C/svg%3E%0A");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 1.25em;
	}
	textarea {
		font-family: inherit;
	}
	fieldset {
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 1rem;
		margin-top: 1.5rem;
	}
	legend {
		padding: 0 0.5rem;
		color: var(--text-muted);
	}
	.exercise-item {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}
        .exercise-item input:first-child {
                flex: 3;
        }
        .exercise-item .category-select {
                flex: 2;
        }
        .exercise-item input:last-of-type {
                flex: 2;
        }
	.remove-btn {
		background: none;
		border: 1px solid var(--error);
		color: var(--error);
		border-radius: 50%;
		width: 28px;
		height: 28px;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
	}
	.success-message {
		color: var(--green);
		background-color: rgba(6, 95, 70, 0.2);
		border: 1px solid var(--green);
		padding: 0.75rem;
		border-radius: 8px;
		text-align: center;
		margin-top: 1rem;
	}
	.form-group-checkbox {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 0.75rem;
		background-color: var(--bg);
		border: 1px solid var(--border-color);
		border-radius: 8px;
	}
	.form-group-checkbox input[type='checkbox'] {
		width: 1.25em;
		height: 1.25em;
	}
	.secondary-btn {
		border: 1px solid var(--border-color);
		background: none;
		color: var(--text-muted);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		display: block;
		width: 100%;
		margin-top: 0.5rem;
	}

	/* NEW styles for Partner form */
        .fieldset-note {
                display: inline-block;
                margin-left: 0.75rem;
                font-size: 0.8rem;
                color: var(--text-muted);
        }
        .exercise-item.partner {
                flex-direction: column;
                align-items: stretch;
                background: rgba(0, 0, 0, 0.2);
                padding: 1rem;
                border-radius: 8px;
                position: relative;
        }
        .exercise-item.partner .remove-btn {
                position: absolute;
                top: 0.5rem;
                right: 0.5rem;
        }
        .station-name {
                font-weight: bold;
                margin-bottom: 0.75rem;
        }
        .partner-tasks {
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
        }
        .partner-tasks .task-label {
                font-size: 0.75rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-muted);
        }
        .partner-tasks input {
                width: 100%;
        }
        .starter-select {
                margin-top: 1rem;
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
        }
        .starter-label {
                font-size: 0.75rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-muted);
        }
        .starter-options {
                display: flex;
                gap: 1rem;
                flex-wrap: wrap;
        }
        .starter-options label {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                font-size: 0.85rem;
                color: var(--text-muted);
        }
        .starter-options input[type='radio'] {
                accent-color: var(--yellow);
        }
        .partner-helper {
                margin: 0.5rem 0 1rem;
                font-size: 0.9rem;
                color: var(--text-muted);
        }
</style>
