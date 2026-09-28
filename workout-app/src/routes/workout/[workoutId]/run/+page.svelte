<script>
	// @ts-nocheck
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { user } from '$lib/store';
	import { notify } from '$lib/toasts';
	import {
		independentStorageKey,
		persistedIndependentState,
		recoverIndependentState
	} from '$lib/independentWorkout';
	export let data;
	const { workout, sourceSessionId } = data;
	const timing = workout.timing ?? {};
	const items =
		workout.mode === 'Chipper' ? (workout.chipper?.steps ?? []) : (workout.exercises ?? []);
	const isContinuous =
		workout.mode === 'Chipper' ||
		['amrap', 'emom'].includes(String(workout.type || '').toLowerCase());
	let state = {
		index: 0,
		round: 1,
		phase: 'ready',
		remaining: Number(timing.work || (isContinuous ? 1200 : 60)),
		running: false,
		endsAt: null,
		complete: false
	};
	let interval;
	let scores = items.map((item) => ({
		stationName: item.name || item.exercise,
		category: item.category || '',
		score: { reps: '', weight: '', cals: '', dist: '', notes: '' }
	}));
	let saving = false;
	$: key = $user?.uid ? independentStorageKey($user.uid, workout.id) : '';
	$: current = items[state.index] ?? { name: 'Workout' };

	function durationForPhase(phase) {
		return phase === 'work'
			? Number(timing.work || (isContinuous ? 1200 : 60))
			: Number(timing.move ?? timing.rest ?? 15);
	}
	function saveLocal() {
		if (key) localStorage.setItem(key, JSON.stringify(persistedIndependentState(state)));
	}
	function start() {
		state = {
			...state,
			phase: state.phase === 'ready' ? 'work' : state.phase,
			running: true,
			endsAt: Date.now() + state.remaining * 1000
		};
		saveLocal();
	}
	function pause() {
		state = { ...state, running: false, endsAt: null };
		saveLocal();
	}
	function advance() {
		if (
			isContinuous ||
			(state.index >= items.length - 1 &&
				state.round >= Number(timing.rounds || workout.rounds || 1))
		) {
			state = { ...state, running: false, complete: true, phase: 'complete', remaining: 0 };
			saveLocal();
			return;
		}
		if (state.phase === 'work' && durationForPhase('move') > 0)
			state = {
				...state,
				phase: 'move',
				remaining: durationForPhase('move'),
				running: false,
				endsAt: null
			};
		else {
			const last = state.index >= items.length - 1;
			state = {
				...state,
				index: last ? 0 : state.index + 1,
				round: last ? state.round + 1 : state.round,
				phase: 'work',
				remaining: durationForPhase('work'),
				running: false,
				endsAt: null
			};
		}
		saveLocal();
	}
	function tick() {
		if (!state.running) return;
		const remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
		state = { ...state, remaining };
		if (!remaining) advance();
	}
	async function finish() {
		if (!$user?.uid || saving) return;
		saving = true;
		try {
			const profile = await getDoc(doc(db, 'profiles', $user.uid));
			const cleaned = scores
				.map((entry) => ({
					...entry,
					score: Object.fromEntries(Object.entries(entry.score).filter(([, v]) => v !== ''))
				}))
				.filter((entry) => Object.keys(entry.score).length);
			await addDoc(collection(db, 'scores'), {
				userId: $user.uid,
				displayName: profile.data()?.displayName || 'Member',
				workoutId: workout.id,
				workoutTitle: workout.title,
				date: serverTimestamp(),
				completionType: sourceSessionId ? 'catch-up' : 'independent',
				sourceSessionId: sourceSessionId || null,
				exerciseScores: cleaned
			});
			localStorage.removeItem(key);
			notify('✓ Workout completed', 'success');
			goto(resolve('/dashboard'));
		} catch (error) {
			console.error(error);
			notify('Could not save this completion', 'error');
			saving = false;
		}
	}
	onMount(() => {
		if (key) {
			try {
				const recovered = recoverIndependentState(JSON.parse(localStorage.getItem(key)));
				if (recovered) state = recovered;
			} catch {}
		}
		interval = setInterval(tick, 250);
	});
	onDestroy(() => clearInterval(interval));
</script>

<main class="player">
	<header>
		<span
			>{workout.mode || workout.type || 'Workout'} · Round {state.round}/{timing.rounds ||
				workout.rounds ||
				1}</span
		>
		<h1>{current.name || current.exercise || workout.title}</h1>
	</header>
	{#if !state.complete}
		<div class="clock">
			{Math.floor(state.remaining / 60)
				.toString()
				.padStart(2, '0')}:{(state.remaining % 60).toString().padStart(2, '0')}
		</div>
		<p class="phase">
			{state.phase === 'move' ? 'NEXT / MOVE' : state.phase === 'ready' ? 'READY' : 'WORK'}
		</p>
		<div class="controls">
			<button class="primary" on:click={state.running ? pause : start}
				>{state.running ? 'PAUSE' : state.phase === 'ready' ? 'START' : 'RESUME'}</button
			><button on:click={advance}>NEXT</button>
		</div>
	{:else}
		<section>
			<h2>Log your result</h2>
			{#each scores as entry}<div class="score">
					<strong>{entry.stationName}</strong><input
						type="number"
						min="0"
						bind:value={entry.score.reps}
						placeholder="Reps"
					/><input
						type="number"
						min="0"
						step="0.5"
						bind:value={entry.score.weight}
						placeholder="kg"
					/><input bind:value={entry.score.notes} placeholder="Notes" />
				</div>{/each}<button class="primary save" on:click={finish} disabled={saving}
				>{saving ? 'SAVING…' : 'SAVE COMPLETION'}</button
			>
		</section>
	{/if}
</main>

<style>
	.player {
		min-height: 100vh;
		width: min(760px, 100%);
		margin: auto;
		padding: clamp(1rem, 4vw, 3rem);
		display: flex;
		flex-direction: column;
		text-align: center;
		gap: 1rem;
	}
	.player header span,
	.phase {
		color: var(--text-muted);
		font-weight: 900;
		letter-spacing: 0.12em;
	}
	.player h1 {
		font-family: var(--font-display);
		color: var(--brand-yellow);
		font-size: clamp(2.5rem, 9vw, 5rem);
	}
	.clock {
		font: clamp(6rem, 25vw, 13rem) / 0.8 var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.controls {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 0.7rem;
		margin-top: auto;
	}
	.controls button,
	.save {
		min-height: 64px;
		border: 0;
		border-radius: 14px;
		font-weight: 900;
		font-size: 1.1rem;
	}
	.primary {
		background: var(--brand-yellow);
		color: #111827;
	}
	.score {
		display: grid;
		grid-template-columns: 1fr repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem 0;
	}
	.score input {
		min-width: 0;
		padding: 0.7rem;
		border-radius: 8px;
	}
	.save {
		width: 100%;
		margin-top: 1rem;
	}
	@media (max-width: 600px) {
		.score {
			grid-template-columns: 1fr 1fr;
		}
		.score strong {
			grid-column: 1/-1;
		}
	}
</style>
