<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { db, auth } from '$lib/firebase';
	import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let workouts = [];
	let isLoading = true;

	// This function runs when the component loads
	onMount(async () => {
		const user = auth.currentUser;
		if (!user) return;

		// Create a query to get only the workouts created by the current user
		const q = query(collection(db, 'workouts'), where('creatorId', '==', user.uid));

		const querySnapshot = await getDocs(q);

		// Loop through the results and add them to our local array
		workouts = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

		isLoading = false;
	});

	const createWorkoutUrl = resolve('/admin/create');

	async function deleteWorkout(id, index) {
		if (!confirm('Are you sure you want to delete this workout?')) {
			return;
		}
		try {
			// Delete the document from Firestore
			await deleteDoc(doc(db, 'workouts', id));
			// Remove the workout from our local array to update the UI instantly
			workouts.splice(index, 1);
			workouts = workouts; // Trigger Svelte's reactivity
		} catch (error) {
			console.error('Error deleting workout: ', error);
			alert('Failed to delete workout.');
		}
	}

	function editWorkout(id) {
		// We'll build this page in a future step
		goto(resolve(`/admin/edit/${id}`));
	}

	function startWorkout(id) {
		// We'll build the live timer view in a future step
		goto(resolve(`/timer/${id}`));
	}
</script>

<div class="page-container">
	<div class="header">
		<h1>My Workouts</h1>
		<a href={createWorkoutUrl} class="primary-btn">Create New Workout</a>
	</div>

	{#if isLoading}
		<p>Loading your workouts...</p>
	{:else if workouts.length === 0}
		<div class="empty-state">
			<p>You haven't created any workouts yet.</p>
			<p>Click the "Create New Workout" button to get started!</p>
		</div>
	{:else}
		<div class="workouts-grid">
			{#each workouts as workout, i (workout.id)}
				<div class="workout-card">
					<div class="card-header">
						<h3>{workout.title}</h3>
						<span class="badge {workout.type.toLowerCase()}">{workout.type}</span>
						<span class="badge {workout.mode.toLowerCase()}">{workout.mode}</span>
					</div>
					<p class="notes">{workout.notes || 'No notes for this workout.'}</p>
                                        <div class="exercise-list">
                                                <strong>Exercises:</strong>
                                                <ul>
                                                        {#each workout.exercises as exercise, j (`${workout.id}-${j}`)}
                                                                {#if workout.mode === 'Partner'}
                                                                        <li class="partner-station">
                                                                                <div class="station-title-row">
                                                                                        <span class="station-name">{exercise.name}</span>
                                                                                        {#if exercise.startsOn}
                                                                                                <span class="starts-on">Starts on {exercise.startsOn}</span>
                                                                                        {/if}
                                                                                </div>
                                                                                <div class="task-line">
                                                                                        <span class="task-label p1">P1</span>
                                                                                        <span class="task-text">{exercise.p1?.task || exercise.p1_task || exercise.description || 'No task provided'}</span>
                                                                                </div>
                                                                                {#if exercise.p2?.task || exercise.p2_task}
                                                                                        <div class="task-line">
                                                                                                <span class="task-label p2">P2</span>
                                                                                                <span class="task-text">{exercise.p2?.task || exercise.p2_task}</span>
                                                                                        </div>
                                                                                {/if}
                                                                        </li>
                                                                {:else}
                                                                        <li>
                                                                                <span class="exercise-name">{exercise.name}</span>
                                                                                {#if exercise.description}
                                                                                        <span class="exercise-description"> – {exercise.description}</span>
                                                                                {/if}
                                                                        </li>
                                                                {/if}
                                                        {/each}
                                                </ul>
                                        </div>
					<div class="card-actions">
						<button class="action-btn edit" on:click={() => editWorkout(workout.id)}>Edit</button>
						<button class="action-btn delete" on:click={() => deleteWorkout(workout.id, i)}
							>Delete</button
						>
						<button class="action-btn start" on:click={() => startWorkout(workout.id)}
							>Start Session</button
						>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page-container {
		width: 100%;
		max-width: 1200px;
		margin: 2rem auto;
		padding: 2rem;
	}
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}
	h1 {
		color: var(--yellow);
	}
	.empty-state {
		text-align: center;
		padding: 3rem;
		background-color: var(--card);
		border: 1px dashed var(--border-color);
		border-radius: 16px;
		color: var(--text-muted);
	}
	.workouts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1rem;
	}
	.workout-card {
		background-color: var(--card);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
	}
	.card-header {
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
		padding-bottom: 1rem;
	}
	.card-header h3 {
		margin-bottom: 0.5rem;
	}
	.badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		margin-right: 0.5rem;
		text-transform: uppercase;
		background-color: #333;
		color: #eee;
	}
	.badge.circuit {
		background-color: #059669;
	}
	.badge.amrap {
		background-color: #d97706;
	}
	.badge.emom {
		background-color: #6d28d9;
	}
	.badge.partner {
		background-color: #db2777;
	}
	.notes {
		color: var(--text-muted);
		font-style: italic;
		margin-bottom: 1rem;
		flex-grow: 1;
	}
        .exercise-list ul {
                list-style-type: none;
                padding-left: 0;
                font-size: 0.9rem;
        }
        .exercise-list li {
                padding: 0.25rem 0;
        }
        .exercise-list li.partner-station {
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                margin-bottom: 0.5rem;
                background-color: rgba(255, 255, 255, 0.02);
        }
        .station-title-row {
                display: flex;
                justify-content: space-between;
                gap: 0.5rem;
                font-weight: 600;
        }
        .station-name {
                color: var(--text-primary);
        }
        .starts-on {
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: var(--text-muted);
        }
        .exercise-name {
                font-weight: 600;
        }
        .exercise-description {
                color: var(--text-muted);
        }
        .task-line {
                display: flex;
                align-items: center;
                gap: 0.5rem;
        }
        .task-label {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                font-size: 0.75rem;
                font-weight: 700;
                color: #111827;
        }
        .task-label.p1 {
                background-color: #fcd34d;
        }
        .task-label.p2 {
                background-color: #38bdf8;
        }
        .task-text {
                flex: 1;
                color: var(--text-muted);
        }
	.card-actions {
		margin-top: 1.5rem;
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
	.action-btn {
		border: none;
		border-radius: 8px;
		padding: 0.5rem 1rem;
		cursor: pointer;
		font-weight: 600;
	}
	.action-btn.edit {
		background-color: #2563eb;
		color: white;
	}
	.action-btn.delete {
		background-color: var(--error);
		color: white;
	}
	.action-btn.start {
		background-color: var(--green);
		color: var(--yellow);
		flex-grow: 1;
	}
	.primary-btn {
		/* Assuming styles from app.css */
		text-decoration: none;
	}
</style>
