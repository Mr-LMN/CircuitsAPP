<script>
	// @ts-nocheck
        import { onMount } from 'svelte';
        import { get } from 'svelte/store';
        import { db } from '$lib/firebase';
        import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
        import { goto } from '$app/navigation';
        import { resolve } from '$app/paths';
        import { loading, user } from '$lib/store';

        let workouts = [];
        let isLoading = true;
        let loadError = '';

        let lastLoadedUid = null;

        async function fetchWorkouts(uid) {
                isLoading = true;
                loadError = '';

                try {
                        const workoutsQuery = query(collection(db, 'workouts'), where('creatorId', '==', uid));
                        const snapshot = await getDocs(workoutsQuery);
                        workouts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
                } catch (error) {
                        console.error('Failed to load workouts', error);
                        loadError = 'We were unable to load your workouts. Please try again.';
                        workouts = [];
                } finally {
                        isLoading = false;
                }
        }

        onMount(() => {
                const unsubscribeUser = user.subscribe(($user) => {
                        const uid = $user?.uid ?? null;

                        if (!uid) {
                                workouts = [];
                                loadError = '';
                                isLoading = get(loading);
                                lastLoadedUid = null;
                                return;
                        }

                        if (uid === lastLoadedUid) return;
                        lastLoadedUid = uid;
                        void fetchWorkouts(uid);
                });

                const unsubscribeLoading = loading.subscribe(($loading) => {
                        if (!get(user)?.uid) {
                                isLoading = $loading;
                                if (!$loading) {
                                        loadError = '';
                                }
                        }
                });

                return () => {
                        unsubscribeUser();
                        unsubscribeLoading();
                };
        });

	const createWorkoutUrl = resolve('/admin/create');

        async function deleteWorkout(id) {
                if (!confirm('Are you sure you want to delete this workout?')) {
                        return;
                }
                try {
                        await deleteDoc(doc(db, 'workouts', id));
                        workouts = workouts.filter((workout) => workout.id !== id);
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
        {:else if loadError}
                <p class="error-message">{loadError}</p>
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
                                                <button class="action-btn delete" on:click={() => deleteWorkout(workout.id)}
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
.page-container { width: 100%; max-width: 1200px; margin: 2rem auto; padding: 2rem; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
h1 { color: var(--brand-yellow); font-family: var(--font-display); font-size: 3rem; letter-spacing: 2px; }
.empty-state { text-align: center; padding: 3rem; background-color: var(--surface-1); border: 1px dashed var(--border-color); border-radius: 16px; color: var(--text-muted); }
.error-message { margin: 1rem 0; color: var(--error); text-align: center; font-weight: 600; }
.workouts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; }
.workout-card {
background-color: var(--surface-1);
border: 1px solid var(--border-color);
border-radius: 16px;
padding: 1.5rem;
display: flex;
flex-direction: column; /* Ensures content flows top-to-bottom */
}
.card-header { margin-bottom: 1rem; }
.card-header h3 { font-size: 1.25rem; margin-bottom: 0.5rem; }
.badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; margin-right: 0.5rem; text-transform: uppercase; }
.badge.circuit { background-color: #059669; color: white; }
.badge.partner { background-color: #DB2777; color: white; }
.badge.benchmark { background-color: var(--brand-yellow); color: var(--bg-main); }

.notes {
color: var(--text-muted);
font-style: italic;
margin-bottom: 1rem;
min-height: 40px; /* Ensures a minimum height but doesn't force expansion */
flex-grow: 0; /* FIX: This prevents the notes from pushing exercises to the bottom */
}

.exercise-list {
margin-top: auto; /* Pushes this section to the bottom if there's space */
padding-top: 1rem;
border-top: 1px solid var(--border-color);
}
.exercise-list strong { font-size: 0.9rem; color: var(--text-secondary); }
.exercise-list ul { list-style: none; padding: 0; margin-top: 0.5rem; font-size: 0.85rem; }
.exercise-list li { margin-bottom: 0.3rem; } /* Tighter spacing */
.exercise-list li span { color: var(--text-muted); margin-left: 0.5rem; }

.card-actions { margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: flex-end; }
.action-btn { border: none; border-radius: 8px; padding: 0.5rem 1rem; cursor: pointer; font-weight: 600; }
.action-btn.edit { background-color: #2563EB; color: white; }
.action-btn.delete { background-color: #ef4444; color: white; }
.action-btn.start { background-color: var(--brand-green); color: var(--brand-yellow); flex-grow: 1; }

.link-btn { background: none; border: none; color: var(--brand-yellow); cursor: pointer; }
</style>
