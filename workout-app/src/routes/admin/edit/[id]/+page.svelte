<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { db } from '$lib/firebase';
	import { doc, updateDoc, getDocs, setDoc, collection } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// This is how SvelteKit passes data from a load function to a page.
	// The 'workout' object comes directly from our +page.js file.
	export let data;

	// Pre-fill all our form variables with the loaded data.
	let title = data.workout.title;
	let type = data.workout.type;
	let mode = data.workout.mode;
	let isBenchmark = data.workout.isBenchmark;
	let notes = data.workout.notes;
	// We deep-copy the exercises array to avoid weird reactivity issues.
        let exercises = JSON.parse(JSON.stringify(data.workout.exercises));
        let structureMode = mode;

        function normalizeStarter(value) {
                return value?.toString?.().toUpperCase() === 'P2' ? 'P2' : 'P1';
        }

        function convertToPartner(list) {
                return list.map((exercise, index) => ({
                        name: exercise.name || `Station ${index + 1}`,
                        p1_task: exercise.p1_task ?? exercise.description ?? '',
                        p2_task: exercise.p2_task ?? '',
                        startsWith: normalizeStarter(exercise.startsWith ?? exercise.starter)
                }));
        }

        function convertToIndividual(list) {
                return list.map((exercise) => ({
                        name: exercise.name ?? '',
                        description:
                                exercise.description ??
                                [exercise.p1_task, exercise.p2_task].filter(Boolean).join(' / ')
                }));
        }

	let isSubmitting = false;
	let successMessage = '';
	let errorMessage = '';
	let allExerciseNames = [];

	onMount(async () => {
		const querySnapshot = await getDocs(collection(db, 'exercises'));
		allExerciseNames = querySnapshot.docs.map((doc) => doc.data().name);
	});

        $: if (mode !== structureMode) {
                exercises = mode === 'Partner' ? convertToPartner(exercises) : convertToIndividual(exercises);
                structureMode = mode;
        }

        function addExercise() {
                exercises =
                        mode === 'Partner'
                                ? [
                                          ...exercises,
                                          {
                                                  name: `Station ${exercises.length + 1}`,
                                                  p1_task: '',
                                                  p2_task: '',
                                                  startsWith: 'P1'
                                          }
                                  ]
                                : [...exercises, { name: '', description: '' }];
        }

        function removeExercise(index) {
                exercises = exercises.filter((_, i) => i !== index);
        }

        function updateStarter(index, value) {
                exercises = exercises.map((exercise, i) =>
                        i === index ? { ...exercise, startsWith: normalizeStarter(value) } : exercise
                );
        }

	// The main difference is this function now UPDATES an existing document.
        async function updateWorkout() {
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
			// 1. Get a reference to the existing document using its ID
			const workoutRef = doc(db, 'workouts', data.workout.id);

			// 2. Create the object with the updated data
                        const normalizedExercises =
                                mode === 'Partner'
                                        ? exercises.map((exercise, index) => ({
                                                  name: exercise.name || `Station ${index + 1}`,
                                                  p1_task: exercise.p1_task,
                                                  p2_task: exercise.p2_task,
                                                  startsWith: normalizeStarter(exercise.startsWith)
                                          }))
                                        : exercises.map((exercise) => ({
                                                  name: exercise.name,
                                                  description: exercise.description
                                          }));

                        const updatedData = {
                                title,
                                type,
                                mode,
                                isBenchmark,
                                notes,
                                exercises: normalizedExercises
                        };

                        // 3. Call 'updateDoc' instead of 'addDoc'
                        await updateDoc(workoutRef, updatedData);

                        // 4. Save any new unique exercises for the autocomplete feature
                        for (const exercise of normalizedExercises) {
                                const namesToSave =
                                        mode === 'Partner' ? [exercise.p1_task, exercise.p2_task] : [exercise.name];
                                for (const name of namesToSave) {
                                        const exerciseName = name?.trim?.() ?? '';
                                        if (exerciseName) {
                                                const exerciseRef = doc(db, 'exercises', exerciseName.toLowerCase());
                                                await setDoc(exerciseRef, { name: exerciseName });
                                        }
                                }
                        }

			successMessage = 'Workout updated successfully!';
			setTimeout(() => goto(resolve('/admin/workouts')), 1500);
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
			<label for="notes">Notes / Instructions</label>
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
                                        Assign the Partner A and Partner B duties for each station. The timer will include
                                        a swap window so athletes can trade tasks between rounds.
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

		<button type="submit" class="primary-btn" disabled={isSubmitting}>
			{isSubmitting ? 'Updating...' : 'Update Workout'}
		</button>
	</form>
</div>

<style>
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
	/* Assuming other styles like .primary-btn are in app.css */
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
        .fieldset-note {
                display: inline-block;
                margin-left: 0.75rem;
                font-size: 0.8rem;
                color: var(--text-muted);
        }
        .partner-helper {
                margin: 0.5rem 0 1rem;
                font-size: 0.9rem;
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
        .exercise-item.partner .station-name {
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
</style>
