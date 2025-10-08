<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { db, auth } from '$lib/firebase';
	import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
	import { user } from '$lib/store';

	export let data;
	const { session, workout } = data;
	let myScore = 0;

	// This state will be updated in real-time from the admin's timer
	let liveState = {
		phase: 'Connecting...',
		remaining: 0,
		currentStation: 0,
		isRunning: false
	};

	let myCurrentStationIndex = -1;

	onMount(() => {
		const userUid = $user?.uid;
		if (!userUid) return;

		// --- Real-time listener for the main timer's state ---
		// We will create the code that WRITES to this document in the next step
		const liveStateRef = doc(db, 'sessions', session.id, 'liveState', 'data');
		const unsubscribeState = onSnapshot(liveStateRef, (doc) => {
			if (doc.exists()) {
				liveState = doc.data();
			}
		});

		// --- Logic to find the user's current station ---
		// This requires the admin to have filled out the roster first
		// We'll add a real-time listener for the roster in the next step for full accuracy

		// --- Real-time listener for THIS user's score ---
		const myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);
		const unsubscribeScore = onSnapshot(myScoreRef, (doc) => {
			if (doc.exists()) {
				myScore = doc.data().score || 0;
			}
		});

		return () => {
			unsubscribeState();
			unsubscribeScore();
		};
	});

	async function incrementScore() {
		const userUid = $user?.uid;
		if (!userUid) return;

		const newScore = myScore + 1;
		const myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);

		// setDoc with merge is used to create the doc if it doesn't exist, or update it if it does
		await setDoc(myScoreRef, { score: newScore }, { merge: true });
	}

	function formatTime(s) {
		const secs = Math.max(0, Math.ceil(s));
		return String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
	}

	// Reactive statement to find the user's current station details
	$: myStationData = workout.exercises[myCurrentStationIndex] || null;
</script>

<div class="tracker-container">
	<header class="tracker-header">
		<h1>{liveState.phase}</h1>
		<div class="main-time">{formatTime(liveState.remaining)}</div>
	</header>

	<main class="tracker-main">
		<div class="score-card">
			<span class="score-label">Your Score</span>
			<span class="score-value">{myScore}</span>
		</div>
		<button class="add-btn" on:click={incrementScore}>+</button>
	</main>

	<footer class="station-info">
		{#if myStationData}
			<h2>Your Station: {myStationData.name}</h2>
			<div class="task-line">
				<span class="task-label p1">P1</span>
				<span class="task-text">{myStationData.p1_task}</span>
			</div>
			<div class="task-line">
				<span class="task-label p2">P2</span>
				<span class="task-text">{myStationData.p2_task}</span>
			</div>
		{:else}
			<h2>Connecting to session...</h2>
		{/if}
	</footer>
</div>

<style>
	.tracker-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--deep-space);
		padding: 1.5rem;
		text-align: center;
	}
	.tracker-header {
		flex-shrink: 0;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 2.5rem;
		color: var(--text-secondary);
		letter-spacing: 2px;
	}
	.main-time {
		font-family: var(--font-display);
		font-size: 4rem;
		color: var(--brand-yellow);
		line-height: 1;
	}
	.tracker-main {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
	}
	.score-card {
		background: var(--surface-1);
		border-radius: 50%;
		width: 180px;
		height: 180px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-color);
	}
	.score-label {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.score-value {
		font-family: var(--font-display);
		font-size: 5rem;
		line-height: 1;
	}
	.add-btn {
		background: var(--brand-green);
		color: var(--text-primary);
		width: 100px;
		height: 100px;
		border-radius: 50%;
		border: none;
		font-size: 4rem;
		font-weight: 200;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-bottom: 0.5rem;
	}
	.station-info {
		flex-shrink: 0;
		background: var(--surface-1);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 1rem;
		text-align: left;
	}
	.station-info h2 {
		font-size: 1.2rem;
		margin-bottom: 0.75rem;
	}
	.task-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}
	.task-label {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 0.65rem;
		font-weight: 700;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.task-label.p1 {
		background: #34d39933;
		color: #34d399;
	}
	.task-label.p2 {
		background: #f472b633;
		color: #f472b6;
	}
	.task-text {
		color: var(--text-secondary);
	}
</style>
