<script>
	import { onDestroy } from 'svelte';

	export let data;
	const { workout } = data;

	// --- Sound Imports (from original timer) ---
	let audioCtx = null;
	function getCtx() {
		return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
	}
	function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) {
		try {
			const ctx = getCtx(),
				o = ctx.createOscillator(),
				g = ctx.createGain();
			o.type = type;
			o.frequency.setValueAtTime(freq, ctx.currentTime);
			o.connect(g);
			g.connect(ctx.destination);
			g.gain.setValueAtTime(gain, ctx.currentTime);
			g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000);
			o.start();
			o.stop(ctx.currentTime + dur / 1000);
		} catch (error) {
			console.error(error);
		}
	}
	function whistleBell() {
		try {
			const ctx = getCtx();
			for (let i = 0; i < 2; i++) {
				const g = ctx.createGain(),
					t0 = ctx.currentTime + i * 0.15;
				g.connect(ctx.destination);
				g.gain.setValueAtTime(1e-4, t0);
				g.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02);
				g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2);
				const o1 = ctx.createOscillator(),
					o2 = ctx.createOscillator();
				o1.type = o2.type = 'triangle';
				o1.frequency.setValueAtTime(620, t0);
				o2.frequency.setValueAtTime(930, t0);
				o1.connect(g);
				o2.connect(g);
				o1.start(t0);
				o2.start(t0);
				o1.stop(t0 + 1.25);
				o2.stop(t0 + 1.25);
			}
		} catch (error) {
			console.error(error);
		}
	}
	function countBeep(n) {
		const f = { 3: 520, 2: 680, 1: 940 };
		tone(f[n] || 720, 180, 'sine', 0.35);
	}

	// --- Core Timer State ---
	let state = {
		phase: 'Ready',
		remaining: 60,
		duration: 60,
		currentStation: 0,
		currentRound: 1,
		isRunning: false,
		lastCue: 0
	};

	let timerId = null;

	// --- Timer Logic ---
	// We will add specific logic for AMRAP, EMOM etc. later.
	// For now, we'll build the advanced Partner Circuit logic.
	function tick() {
		state.remaining -= 0.1;

		// Countdown beeps
		const secs = Math.ceil(state.remaining);
		if (secs <= 3 && secs >= 1 && secs !== state.lastCue) {
			state.lastCue = secs;
			countBeep(secs);
		}

		if (state.remaining <= 0) {
			advancePhase();
		}

		// This triggers Svelte to re-render
		state = state;
	}

	function startTimer() {
		if (state.isRunning) return;
		state.isRunning = true;
		timerId = setInterval(tick, 100);
		whistleBell();
	}
	function pauseTimer() {
		if (!state.isRunning) return;
		state.isRunning = false;
		clearInterval(timerId);
	}
	function resetTimer() {
		pauseTimer();
		// Logic to reset to initial state will go here
		state.phase = 'Ready';
		state.remaining = 60; // Placeholder
		state = state;
	}

	function advancePhase() {
		// This will contain the logic for Work -> Swap -> Move etc.
		// We will build this out fully next. For now, it just stops.
		pauseTimer();
		state.phase = 'Finished';
		state.remaining = 0;
	}

	function formatTime(s) {
		const secs = Math.max(0, Math.ceil(s));
		const m = Math.floor(secs / 60);
		const r = secs % 60;
		return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
	}

	onDestroy(() => {
		clearInterval(timerId); // Clean up on leaving page
	});
</script>

<div class="timer-wrapper">
	{#if workout.mode === 'Partner' && workout.type === 'Circuit'}
		<div class="partner-circuit-layout">
			<div class="left-panel">
				<h2>Stations</h2>
				<div class="station-list">
					{#each workout.exercises as station, i (station.name ?? i)}
						<div class="station-item" class:current={i === state.currentStation}>
							<h3>{station.name}</h3>
							<p><span>P1:</span> {station.p1_task}</p>
							<p><span>P2:</span> {station.p2_task}</p>
						</div>
					{/each}
				</div>
			</div>
			<div class="right-panel">
				<div class="timer-header">
					<h1>{workout.title}</h1>
					<span class="badge {workout.type.toLowerCase()}">{workout.type}</span>
					<span class="badge {workout.mode.toLowerCase()}">{workout.mode}</span>
				</div>
				<main class="timer-main">
					<div class="phase-display">{state.phase}</div>
					<div class="time-display">{formatTime(state.remaining)}</div>
					<div class="progress-bar-container">
						<div
							class="progress-bar-fill"
							style="width: {(100 * (state.duration - state.remaining)) / state.duration}%"
						></div>
					</div>
					<div class="meta-info">
						<span>Station {state.currentStation + 1}/{workout.exercises.length}</span>
						<span>Round {state.currentRound}/1</span>
					</div>
				</main>
				<footer class="timer-controls">
					<button on:click={resetTimer}>Reset</button>
					<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}>
						{state.isRunning ? 'Pause' : 'Start'}
					</button>
					<button on:click={advancePhase}>Next</button>
				</footer>
			</div>
		</div>
	{:else}
		<div class="default-timer-layout">
			<header class="timer-header">
				<h1>{workout.title}</h1>
			</header>
			<main class="timer-main">
				<div class="phase-display">{state.phase}</div>
				<div class="time-display">{formatTime(state.remaining)}</div>
				<div class="progress-bar-container">
					<div
						class="progress-bar-fill"
						style="width: {(100 * (state.duration - state.remaining)) / state.duration}%"
					></div>
				</div>
			</main>
			<section class="exercise-display"></section>
			<footer class="timer-controls">
				<button on:click={resetTimer}>Reset</button>
				<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}>
					{state.isRunning ? 'Pause' : 'Start'}
				</button>
				<button on:click={advancePhase}>Next</button>
			</footer>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background-color: #000;
		color: white;
		font-family: system-ui, sans-serif;
	}

	/* --- Partner Circuit Layout Styles --- */
	.partner-circuit-layout {
		display: grid;
		grid-template-columns: 400px 1fr;
		height: 100vh;
		width: 100vw;
	}
	.left-panel {
		background: #111;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		border-right: 1px solid #333;
	}
	.left-panel h2 {
		color: var(--yellow);
		margin-bottom: 1rem;
	}
	.station-list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.station-item {
		background: #222;
		padding: 1rem;
		border-radius: 8px;
		border-left: 4px solid #444;
	}
	.station-item.current {
		border-left-color: var(--yellow);
		outline: 1px solid var(--yellow);
	}
	.station-item h3 {
		font-size: 1.1rem;
		margin-bottom: 0.5rem;
	}
	.station-item p {
		font-size: 0.9rem;
		color: #ccc;
	}
	.station-item span {
		font-weight: bold;
		color: #ddd;
	}

	.right-panel {
		display: flex;
		flex-direction: column;
		padding: 2rem;
		text-align: center;
	}

	/* --- Shared Styles for Timer Panels --- */
	.timer-header h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		color: var(--yellow);
	}
	.timer-main {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.phase-display {
		font-size: clamp(2rem, 6vw, 4rem);
		font-weight: 300;
		text-transform: uppercase;
		color: #ddd;
	}
	.time-display {
		font-size: clamp(6rem, 20vw, 15rem);
		font-weight: 800;
		line-height: 1;
		margin: 1rem 0;
		font-family: monospace;
	}
	.progress-bar-container {
		width: 80%;
		max-width: 800px;
		height: 20px;
		background-color: #222;
		border-radius: 999px;
		margin: 0 auto;
		overflow: hidden;
	}
	.progress-bar-fill {
		height: 100%;
		width: 0%;
		background-color: var(--yellow);
		transition: width 0.1s linear;
	}
	.meta-info {
		margin-top: 1rem;
		color: #ccc;
	}
	.meta-info span {
		margin: 0 1rem;
	}
	.timer-controls {
		padding-top: 2rem;
		display: flex;
		justify-content: center;
		gap: 1rem;
	}
	.timer-controls button {
		border: 1px solid #444;
		background: #222;
		color: white;
		border-radius: 12px;
		font-size: 1.25rem;
		padding: 1rem 2rem;
		cursor: pointer;
		min-width: 150px;
	}
	.timer-controls button.primary {
		background-color: var(--green);
		color: var(--yellow);
		border-color: var(--green);
	}

	/* --- Default Layout Styles (copied from before for simplicity) --- */
	.default-timer-layout {
		/* Styles for the full-screen timer go here */
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 2rem;
		text-align: center;
	}
	.exercise-display {
		display: flex;
		justify-content: space-between;
		gap: 2rem;
		margin-top: 2rem;
	}
	/* (Add the rest of the full-screen styles as needed) */
</style>
