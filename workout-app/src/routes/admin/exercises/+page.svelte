<script>
// @ts-nocheck
import { onMount, onDestroy } from 'svelte';
import { db } from '$lib/firebase';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// Pre-defined options for consistency
const CATEGORY_OPTIONS = ['Bodyweight', 'Resistance', 'Cardio Machine'];
const EQUIPMENT_OPTIONS = ['BW', 'DB', 'KB', 'BB', 'MB', 'SB', 'WB', 'RB', 'WP', 'PB', 'BlazePods'];

let exercises = [];
let isLoading = true;
let unsubscribe = () => {};

// State for the form
let isEditing = null; // Will hold the ID of the exercise being edited
let formState = {
name: '',
category: 'Bodyweight',
equipment: []
};

onMount(() => {
const exercisesQuery = collection(db, 'exercises');
unsubscribe = onSnapshot(exercisesQuery, (snapshot) => {
exercises = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
isLoading = false;
});
});

onDestroy(() => unsubscribe());

function resetForm() {
isEditing = null;
formState = { name: '', category: 'Bodyweight', equipment: [] };
}

function editExercise(exercise) {
isEditing = exercise.id;
formState = {
name: exercise.name,
category: exercise.category,
equipment: [...exercise.equipment] // Create a copy to avoid direct mutation
};
}

async function saveOrUpdateExercise() {
if (!formState.name.trim()) {
alert('Exercise name is required.');
return;
}

const dataToSave = {
name: formState.name.trim(),
category: formState.category,
equipment: formState.equipment,
updatedAt: serverTimestamp()
};

try {
if (isEditing) {
// Update existing exercise
await setDoc(doc(db, 'exercises', isEditing), dataToSave, { merge: true });
} else {
// Create new exercise
await addDoc(collection(db, 'exercises'), {
...dataToSave,
createdAt: serverTimestamp()
});
}
resetForm(); // Clear the form after saving
} catch (error) {
console.error("Error saving exercise:", error);
alert("Failed to save exercise.");
}
}

async function deleteExercise(id) {
if (confirm('Are you sure you want to permanently delete this exercise?')) {
try {
await deleteDoc(doc(db, 'exercises', id));
} catch (error) {
console.error("Error deleting exercise:", error);
alert("Failed to delete exercise.");
}
}
}
</script>

<div class="page-container">
<header class="page-header">
<h1>Exercise Manager</h1>
<p>Create and manage your master list of available exercises.</p>
</header>

<div class="manager-layout">
<div class="form-panel card">
<h2>{isEditing ? 'Edit Exercise' : 'Add New Exercise'}</h2>
<form on:submit|preventDefault={saveOrUpdateExercise}>
<div class="form-group">
<label for="name">Exercise Name</label>
<input id="name" type="text" bind:value={formState.name} required />
</div>
<div class="form-group">
<label for="category">Category</label>
<select id="category" bind:value={formState.category}>
{#each CATEGORY_OPTIONS as category}
<option value={category}>{category}</option>
{/each}
</select>
</div>
<fieldset>
<legend>Equipment</legend>
<div class="checkbox-group">
{#each EQUIPMENT_OPTIONS as equipment}
<label>
<input type="checkbox" bind:group={formState.equipment} value={equipment} />
{equipment}
</label>
{/each}
</div>
</fieldset>
<div class="form-actions">
{#if isEditing}
<button type="button" class="secondary-btn" on:click={resetForm}>Cancel</button>
{/if}
<button type="submit" class="primary-btn">{isEditing ? 'Update' : 'Save'} Exercise</button>
</div>
</form>
</div>

<div class="list-panel">
<h2>Exercise Library ({exercises.length})</h2>
{#if isLoading}
<p>Loading library...</p>
{:else if exercises.length === 0}
<p class="empty-state">Your library is empty. Add an exercise using the form.</p>
{:else}
<div class="exercise-list">
{#each exercises as exercise (exercise.id)}
<div class="exercise-item">
<div class="exercise-details">
<span class="exercise-name">{exercise.name}</span>
<span class="exercise-category">{exercise.category}</span>
<div class="equipment-tags">
{#each exercise.equipment as tag}
<span class="tag">{tag}</span>
{/each}
</div>
</div>
<div class="exercise-actions">
<button on:click={() => editExercise(exercise)}>Edit</button>
<button class="delete" on:click={() => deleteExercise(exercise.id)}>Delete</button>
</div>
</div>
{/each}
</div>
{/if}
</div>
</div>
</div>

<style>
.page-container { max-width: 1400px; margin: 2rem auto; padding: 2rem; }
.page-header h1 { font-family: var(--font-display); color: var(--brand-yellow); font-size: 3rem; }
.manager-layout { display: grid; grid-template-columns: 400px 1fr; gap: 2rem; align-items: flex-start; margin-top: 2rem; }
.card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 2rem; }
h2 { font-family: var(--font-display); font-size: 1.75rem; margin-top: 0; }

/* Form Styles */
.form-panel form { display: flex; flex-direction: column; gap: 1.5rem; }
.form-group label, legend { font-size: 0.9rem; font-weight: 600; color: var(--text-muted); }
input[type="text"], select { width: 100%; font-size: 1rem; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--deep-space); color: var(--text-primary); }
fieldset { border: none; padding: 0; }
.checkbox-group { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 0.5rem; }
.checkbox-group label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
.form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
.form-actions button { border: none; padding: 0.75rem 1.5rem; border-radius: 999px; font-weight: 600; cursor: pointer; }
.primary-btn { background: var(--brand-green); color: var(--text-primary); }
.secondary-btn { background: var(--surface-2); color: var(--text-secondary); }

/* List Styles */
.list-panel { display: flex; flex-direction: column; gap: 1.5rem; }
.exercise-list { display: flex; flex-direction: column; gap: 0.75rem; }
.exercise-item { display: flex; justify-content: space-between; align-items: center; background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 12px; padding: 1rem; }
.exercise-name { font-weight: 600; font-size: 1.1rem; }
.exercise-category { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; }
.equipment-tags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
.tag { background: var(--surface-2); color: var(--text-secondary); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.exercise-actions button { background: var(--surface-2); color: var(--text-secondary); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 600; }
.exercise-actions button.delete { border-color: #ef4444; color: #ef4444; }
</style>
