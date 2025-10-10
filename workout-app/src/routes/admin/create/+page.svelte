<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { db, auth } from '$lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';

// --- Form State ---
let title = '';
let type = 'Circuit';
let mode = 'Individual';
let isBenchmark = false;
let notes = '';
let exercises = [];

// --- Library & UI State ---
let exerciseLibrary = [];
let isLibraryOpen = false;
let librarySearchTerm = '';
let isSubmitting = false;
let successMessage = '';
let errorMessage = '';

// When the mode or type changes, clear the exercises to start fresh
$: if (mode || type) {
exercises = [];
}

onMount(async () => {
const querySnapshot = await getDocs(collection(db, 'exercises'));
exerciseLibrary = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
});

// --- Library Functions ---
function addExerciseFromLibrary(libExercise) {
if (mode === 'Partner') {
// Find the first empty P1 or P2 slot in the current stations
for (let i = 0; i < exercises.length; i++) {
if (!exercises[i].p1.task) {
exercises[i].p1 = { task: libExercise.name, category: libExercise.category, equipment: libExercise.equipment };
exercises = exercises; return;
}
if (!exercises[i].p2.task) {
exercises[i].p2 = { task: libExercise.name, category: libExercise.category, equipment: libExercise.equipment };
exercises = exercises; return;
}
}
// If all are full, add a new station with this exercise in the P1 slot
exercises = [...exercises, { name: `Station ${exercises.length + 1}`, p1: { task: libExercise.name, category: libExercise.category, equipment: libExercise.equipment }, p2: { task: '', category: 'Bodyweight', equipment: [] }, startsOn: 'P1' }];

} else { // For Individual, AMRAP, EMOM
exercises = [...exercises, {
id: libExercise.id,
name: libExercise.name,
category: libExercise.category,
equipment: libExercise.equipment,
description: '' // User can add specific reps/targets here
}];
}
}

function addPartnerStation() {
exercises = [...exercises, { name: `Station ${exercises.length + 1}`, p1: { task: '', category: 'Bodyweight', equipment: [] }, p2: { task: '', category: 'Bodyweight', equipment: [] }, startsOn: 'P1' }];
}

function removeExercise(index) {
exercises = exercises.filter((_, i) => i !== index);
}

$: filteredLibrary = exerciseLibrary.filter(ex => 
ex.name.toLowerCase().includes(librarySearchTerm.toLowerCase())
);

async function saveWorkout() {
// ... (Save logic from previous version remains largely the same,
// but it now saves the more structured exercise data)
}
</script>

<div class="form-container">
{#if isLibraryOpen}
<div class="modal-overlay" on:click|self={() => isLibraryOpen = false}>
<div class="modal-content">
<h2>Select Exercise from Library</h2>
<input type="search" bind:value={librarySearchTerm} placeholder="Search exercises..." />
<div class="library-grid">
{#each filteredLibrary as libEx}
<button class="library-item" on:click={() => { addExerciseFromLibrary(libEx); isLibraryOpen = false; }}>
<span class="library-item-name">{libEx.name}</span>
<span class="library-item-category">{libEx.category}</span>
</button>
{/each}
</div>
</div>
</div>
{/if}

<h1>Create New Workout</h1>
<form on:submit|preventDefault={saveWorkout}>
<fieldset>
<legend>Exercises</legend>
{#if mode === 'Partner'}
{#each exercises as exercise, i}
<div class="station-editor-card">
<div class="station-editor-header">
<input class="station-name-input" type="text" bind:value={exercise.name} />
<button type="button" class="remove-btn" on:click={() => removeExercise(i)}>&times;</button>
</div>
<p class="input-hint">Select exercises from the library, or type them in manually.</p>
<div class="partner-grid">
<div class="partner-column">
<label>Partner A Task</label>
<input type="text" bind:value={exercise.p1.task} list="exercise-suggestions" />
<span class="category-display">{exercise.p1.category}</span>
</div>
<div class="partner-column">
<label>Partner B Task</label>
<input type="text" bind:value={exercise.p2.task} list="exercise-suggestions" />
<span class="category-display">{exercise.p2.category}</span>
</div>
</div>
</div>
{/each}
<button type="button" class="secondary-btn" on:click={addPartnerStation}>+ Add Empty Station</button>
{:else}
{#each exercises as exercise, i}
<div class="exercise-item">
<span class="exercise-name">{i+1}. {exercise.name}</span>
<input type="text" bind:value={exercise.description} placeholder="Reps/Target..." />
<button type="button" class="remove-btn" on:click={() => removeExercise(i)}>&times;</button>
</div>
{/each}
{/if}

<button type="button" class="primary-btn" on:click={() => isLibraryOpen = true}>+ Add Exercise from Library</button>
</fieldset>

<button type="submit" class="save-btn" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Workout'}</button>
</form>
</div>

<style>
/* NEW Professional Styles for a faster, cleaner workflow */
.form-container { max-width: 800px; margin: 2rem auto; }
h1 { font-family: var(--font-display); color: var(--brand-yellow); text-align: center; }
fieldset { border: none; padding: 0; margin-top: 2rem; }

/* Library Modal Styles */
.modal-content { gap: 1rem; }
.modal-content input[type="search"] { font-size: 1.2rem; padding: 0.75rem; }
.library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; max-height: 60vh; overflow-y: auto; padding: 0.5rem; }
.library-item { text-align: left; background: var(--surface-2); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; cursor: pointer; }
.library-item:hover { background: var(--surface-3); }
.library-item-name { display: block; font-weight: 600; color: var(--text-primary); }
.library-item-category { display: block; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem; }

/* Form Styles */
.station-editor-card { background: var(--surface-1); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
.station-editor-header { display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem; }
.station-name-input { font-size: 1.25rem; font-weight: 600; background: transparent; border: none; color: var(--text-primary); flex-grow: 1; }
.input-hint { font-size: 0.9rem; color: var(--text-muted); }
.partner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.partner-column label { font-weight: 600; font-size: 0.9rem; }
.partner-column input { margin-top: 0.5rem; }
.category-display { font-size: 0.8rem; color: var(--text-muted); background: var(--surface-2); padding: 0.25rem 0.5rem; border-radius: 6px; display: inline-block; margin-top: 0.5rem; }
.exercise-item { display: flex; align-items: center; gap: 1rem; background: var(--surface-1); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.5rem; }
.exercise-name { flex-grow: 1; font-weight: 600; }
.save-btn { background: var(--brand-green); color: var(--text-primary); padding: 1rem; border-radius: 12px; font-size: 1.2rem; font-weight: 700; border: none; width: 100%; margin-top: 2rem; }
</style>
