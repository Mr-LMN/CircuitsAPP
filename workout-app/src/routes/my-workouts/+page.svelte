<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		addDoc,
		collection,
		deleteDoc,
		doc,
		getDocs,
		query,
		serverTimestamp,
		updateDoc,
		where
	} from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { role, user } from '$lib/store';
	import { notify } from '$lib/toasts';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ShareWorkout from '$lib/components/ShareWorkout.svelte';
	import { studentSessionData } from '$lib/sessionFactory';
	let workouts = [];
	let editing = null;
	let deleting = null;
	let loading = true;
	let form = {
		title: '',
		type: 'Circuit',
		mode: 'Circuit',
		work: 45,
		move: 15,
		rounds: 2,
		notes: '',
		exerciseText: ''
	};
	async function load() {
		if (!$user?.uid) return;
		const snap = await getDocs(
			query(collection(db, 'workouts'), where('creatorId', '==', $user.uid))
		);
		workouts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
		loading = false;
	}
	onMount(() => {
		if ($role !== 'student') goto(resolve('/dashboard'));
		else load();
	});
	function open(workout = null) {
		editing = workout ?? {};
		form = workout
			? {
					title: workout.title,
					type: workout.type || 'Circuit',
					mode: workout.mode || 'Circuit',
					work: workout.timing?.work || 45,
					move: workout.timing?.move || 15,
					rounds: workout.timing?.rounds || 2,
					notes: workout.notes || '',
					exerciseText: (workout.exercises || []).map((e) => e.name).join('\n')
				}
			: {
					title: '',
					type: 'Circuit',
					mode: 'Circuit',
					work: 45,
					move: 15,
					rounds: 2,
					notes: '',
					exerciseText: ''
				};
	}
	async function save() {
		const exercises = form.exerciseText
			.split('\n')
			.map((name) => name.trim())
			.filter(Boolean)
			.map((name) => ({ name }));
		if (!form.title.trim() || !exercises.length) {
			notify('Add a title and at least one station', 'warning');
			return;
		}
		const payload = {
			title: form.title.trim(),
			type: form.type,
			mode: form.mode,
			notes: form.notes.trim(),
			exercises,
			timing: {
				work: Number(form.work),
				move: Number(form.move),
				swap: 0,
				rounds: Number(form.rounds)
			},
			creatorId: $user.uid,
			updatedAt: serverTimestamp()
		};
		if (editing.id) await updateDoc(doc(db, 'workouts', editing.id), payload);
		else await addDoc(collection(db, 'workouts'), { ...payload, createdAt: serverTimestamp() });
		editing = null;
		notify('✓ Workout saved', 'success');
		await load();
	}
	async function duplicate(workout) {
		await addDoc(collection(db, 'workouts'), {
			...workout,
			id: undefined,
			title: `${workout.title} – Copy`,
			creatorId: $user.uid,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		});
		notify('✓ Workout duplicated', 'success');
		await load();
	}
	async function remove() {
		await deleteDoc(doc(db, 'workouts', deleting.id));
		deleting = null;
		notify('Workout deleted', 'success');
		await load();
	}
	async function runSession(workout) {
		const created = await addDoc(collection(db, 'sessions'), {
			...studentSessionData(workout, $user.uid),
			createdAt: serverTimestamp()
		});
		goto(resolve(`/timer/${workout.id}?session_id=${created.id}`));
	}
</script>

<main>
	<header>
		<div>
			<p class="eyebrow">Student training</p>
			<h1>My Workouts</h1>
		</div>
		<button class="primary" on:click={() => open()}>CREATE WORKOUT</button>
	</header>
	{#if loading}<p>Loading…</p>{:else}<div class="grid">
			{#each workouts as workout}<article>
					<h2>{workout.title}</h2>
					<p>
						{workout.mode} · {workout.exercises?.length || 0} stations · {workout.timing?.rounds ||
							1} rounds
					</p>
					<div class="actions">
						<button on:click={() => open(workout)}>Edit</button><button
							on:click={() => duplicate(workout)}>Duplicate</button
						><ShareWorkout workoutId={workout.id} title={workout.title} /><a
							href={resolve(`/workout/${workout.id}`)}>Do workout</a
						><button class="primary" on:click={() => runSession(workout)}>RUN SESSION</button
						><button class="danger" on:click={() => (deleting = workout)}>Delete</button>
					</div>
				</article>{/each}
		</div>{/if}
</main>
{#if editing}<div class="overlay">
		<form on:submit|preventDefault={save}>
			<h2>{editing.id ? 'Edit' : 'Create'} workout</h2>
			<label>Name<input bind:value={form.title} required /></label>
			<div class="row">
				<label
					>Mode<select bind:value={form.mode}
						><option>Circuit</option><option>Partner</option><option>Chipper</option></select
					></label
				><label
					>Type<select bind:value={form.type}
						><option>Circuit</option><option>AMRAP</option><option>EMOM</option><option
							>For Time</option
						></select
					></label
				>
			</div>
			<label
				>Stations / exercises <small>one per line</small><textarea
					rows="7"
					bind:value={form.exerciseText}
				></textarea></label
			>
			<div class="row">
				<label>Work seconds<input type="number" min="1" bind:value={form.work} /></label><label
					>Move seconds<input type="number" min="0" bind:value={form.move} /></label
				><label>Rounds<input type="number" min="1" bind:value={form.rounds} /></label>
			</div>
			<label>Notes<textarea bind:value={form.notes}></textarea></label>
			<div class="actions">
				<button type="button" on:click={() => (editing = null)}>Cancel</button><button
					class="primary">SAVE WORKOUT</button
				>
			</div>
		</form>
	</div>{/if}
{#if deleting}<ConfirmDialog
		title="Delete workout?"
		message={`Delete ${deleting.title}?`}
		confirmLabel="Delete"
		destructive
		onCancel={() => (deleting = null)}
		onConfirm={remove}
	/>{/if}

<style>
	main {
		width: min(1100px, 100%);
		margin: auto;
		padding: 2rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h1 {
		font: 3.5rem var(--font-display);
		color: var(--brand-yellow);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}
	article,
	form {
		background: var(--surface-1);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 1.2rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.actions button,
	.actions a,
	.primary {
		padding: 0.7rem;
		border-radius: 8px;
		border: 1px solid var(--border-color);
		background: var(--surface-2);
		color: var(--text-primary);
		font-weight: 800;
		text-decoration: none;
	}
	.primary {
		background: var(--brand-yellow) !important;
		color: #111827 !important;
	}
	.danger {
		color: #fb7185 !important;
	}
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: #020617dd;
		display: grid;
		place-items: center;
		padding: 1rem;
		overflow: auto;
	}
	.overlay form {
		width: min(650px, 100%);
		display: grid;
		gap: 1rem;
	}
	.overlay label {
		display: grid;
		gap: 0.35rem;
		font-weight: 800;
	}
	.overlay input,
	.overlay select,
	.overlay textarea {
		padding: 0.75rem;
		border-radius: 8px;
	}
	.row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.7rem;
	}
	@media (max-width: 600px) {
		.row {
			grid-template-columns: 1fr;
		}
		header {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
