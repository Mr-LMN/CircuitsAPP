<script>
	// @ts-nocheck
	import { onDestroy } from 'svelte';

	export let data;
	const { workout } = data;

	// --- Sound Imports & Functions (No Change) ---
	let audioCtx = null;
	function getCtx() {
		return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
	}
	function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) {
		try {
			const ctx = getCtx();
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = type;
			o.frequency.setValueAtTime(freq, ctx.currentTime);
			o.connect(g);
			g.connect(ctx.destination);
			g.gain.setValueAtTime(gain, ctx.currentTime);
			g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000);
			o.start();
			o.stop(ctx.currentTime + dur / 1000);
		} catch (error) {
			void error;
		}
	}
	function whistleBell() {
		try {
			const ctx = getCtx();
			for (let i = 0; i < 2; i += 1) {
				const g = ctx.createGain();
				const t0 = ctx.currentTime + i * 0.15;
				g.connect(ctx.destination);
				g.gain.setValueAtTime(1e-4, t0);
				g.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02);
				g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2);
				const o1 = ctx.createOscillator();
				const o2 = ctx.createOscillator();
				o1.type = 'triangle';
				o2.type = 'triangle';
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
			void error;
		}
	}
	function countBeep(n) {
		const f = { 3: 520, 2: 680, 1: 940 };
		tone(f[n] || 720, 180, 'sine', 0.35);
	}

	// --- Session Config & Timer State ---
	let sessionConfig = { work: 60, swap: 15, move: 15, rounds: 1 };
	let state = {
		phase: 'Ready',
		phaseIndex: -1,
		remaining: sessionConfig.work,
		duration: sessionConfig.work,
		currentStation: 0,
		currentRound: 1,
		isRunning: false,
		isComplete: false,
		lastCue: 0
	};
	let timerId = null;

	// --- Staff Roster Logic ---
	let totalStations = workout.exercises?.length ?? 0;
	let stationAssignments = (workout.exercises ?? []).map(() => []);
	// We can pre-populate the roster for testing/demo
	// let assignmentInputs = ['LMN, DFH', 'XET, LKL', 'KOP, LKP', 'JLO, JKL', 'GTOH, SDHP', 'OPEN', 'OPEN', 'OPEN', 'OPEN', 'OPEN'];
	let assignmentInputs = (workout.exercises ?? []).map(() => '');

	function parseAssignments(value = '') {
		return value
			.split(/[\n,]/)
			.map((c) => c.trim())
			.filter(Boolean)
			.map((c) => c.toUpperCase());
	}
	function commitAllAssignments() {
		stationAssignments = stationAssignments.map((codes, i) =>
			parseAssignments(assignmentInputs[i] ?? codes.join(', '))
		);
		assignmentInputs = stationAssignments.map((codes) => codes.join(', '));
	}
	$: movesCompleted =
		totalStations > 0 ? (state.currentRound - 1) * totalStations + state.currentStation : 0;
	$: stationRoster = (workout.exercises ?? []).map((_, targetIndex) => {
		if (!totalStations) return [];
		const roster = [];
		stationAssignments.forEach((codes, startIndex) => {
			if (codes?.length) {
				const destination = (startIndex + movesCompleted) % totalStations;
				if (destination === targetIndex) roster.push(...codes);
			}
		});
		return roster;
	});
	$: progress =
		state.duration > 0
			? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100))
			: 0;
	$: totalTime =
		totalStations > 0
			? Math.round(
					((sessionConfig.work * 2 + sessionConfig.swap + sessionConfig.move) *
						totalStations *
						sessionConfig.rounds) /
						60
				)
			: 0;

	// --- Timer Logic ---
	function advancePhase() {
		if (!totalStations) return;
		state.lastCue = 0;
		const nextPhaseIndex = state.phaseIndex + 1;
		if (workout.mode === 'Partner' && workout.type === 'Circuit') {
			if (nextPhaseIndex === 0) {
				state.phaseIndex = 0;
				state.phase = 'WORK 1';
				state.remaining = state.duration = sessionConfig.work;
				whistleBell();
			} else if (nextPhaseIndex === 1) {
				state.phaseIndex = 1;
				state.phase = 'SWAP';
				state.remaining = state.duration = sessionConfig.swap;
				tone(420, 160);
			} else if (nextPhaseIndex === 2) {
				state.phaseIndex = 2;
				state.phase = 'WORK 2';
				state.remaining = state.duration = sessionConfig.work;
				whistleBell();
			} else if (nextPhaseIndex === 3) {
				state.phaseIndex = 3;
				state.phase = 'MOVE';
				state.remaining = state.duration = sessionConfig.move;
				tone(420, 160);
			} else {
				state.currentStation++;
				if (state.currentStation >= totalStations) {
					state.currentStation = 0;
					state.currentRound++;
					if (state.currentRound > sessionConfig.rounds) {
						workoutComplete();
						return;
					}
				}
				state.phaseIndex = 0;
				state.phase = 'WORK 1';
				state.remaining = state.duration = sessionConfig.work;
				whistleBell();
			}
		} else {
			state.currentStation++;
			if (state.currentStation >= totalStations) {
				workoutComplete();
				return;
			}
			state.phase = `Round ${state.currentStation + 1}`;
			state.remaining = state.duration = sessionConfig.work;
			whistleBell();
		}
	}
	function tick() {
		state.remaining -= 0.1;
		const secs = Math.ceil(state.remaining);
		if (secs <= 3 && secs >= 1 && secs !== state.lastCue) {
			state.lastCue = secs;
			countBeep(secs);
		}
		if (state.remaining <= 0) {
			advancePhase();
		}
		state = state;
	}
	function startTimer() {
		if (state.isComplete || state.isRunning || totalStations === 0) return;
		if (state.phaseIndex === -1) {
			advancePhase();
		}
		state.isRunning = true;
		timerId = setInterval(tick, 100);
		commitAllAssignments();
	}
	function pauseTimer() {
		if (!state.isRunning) return;
		state.isRunning = false;
		clearInterval(timerId);
	}
	function resetTimer() {
		pauseTimer();
		state.phase = 'Ready';
		state.phaseIndex = -1;
		state.remaining = sessionConfig.work;
		state.duration = sessionConfig.work;
		state.currentStation = 0;
		state.currentRound = 1;
		state.isComplete = false;
		state = state;
	}
	function workoutComplete() {
		pauseTimer();
		state.phase = 'SESSION COMPLETE!';
		state.isComplete = true;
		state = state;
		whistleBell();
	}
	function formatTime(s) {
		const secs = Math.max(0, Math.ceil(s));
		return (
			String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')
		);
	}
	onDestroy(() => clearInterval(timerId));
</script>

<div class="mission-control">
	<header class="setup-panel">
		<div class="logo">
			<span>{workout.title}</span>
		</div>
		<div class="setup-controls">
			<div class="form-group">
				<label for="work">Work (s)</label>
				<input id="work" type="number" bind:value={sessionConfig.work} disabled={state.isRunning} />
			</div>
			<div class="form-group">
				<label for="swap">Swap (s)</label>
				<input id="swap" type="number" bind:value={sessionConfig.swap} disabled={state.isRunning} />
			</div>
			<div class="form-group">
				<label for="move">Move (s)</label>
				<input id="move" type="number" bind:value={sessionConfig.move} disabled={state.isRunning} />
			</div>
			<div class="form-group">
				<label for="rounds">Rounds</label>
				<input
					id="rounds"
					type="number"
					bind:value={sessionConfig.rounds}
					disabled={state.isRunning}
				/>
			</div>
		</div>
	</header>

	<main class="main-content">
		<div class="left-panel">
			<div class="station-grid">
				{#each workout.exercises as station, i (station.id ?? i)}
					<article class="station-card" class:current={i === state.currentStation}>
						<header class="station-card__header">
							<span class="station-number">{i + 1}</span>
							<h3>{station.name}</h3>
							{#if station.shared}<span class="shared-badge">Shared</span>{/if}
						</header>
						<div class="station-card__tasks">
							<div class="task-line">
								<span class="task-label p1">P1</span><span class="task-text">{station.p1_task}</span
								>
							</div>
							<div class="task-line">
								<span class="task-label p2">P2</span><span class="task-text">{station.p2_task}</span
								>
							</div>
						</div>
						<footer class="station-card__roster">
							<div class="roster-chips">
								{#if stationRoster[i]?.length}
									{#each stationRoster[i] as code, codeIndex (`${code}-${codeIndex}`)}
										<span>{code}</span>
									{/each}
								{:else}<span class="roster-empty">OPEN</span>{/if}
							</div>
						</footer>
					</article>
				{/each}
			</div>
		</div>

		<div class="right-panel">
			<main class="timer-main">
				<div class="phase-display">{state.phase}</div>
				<div class="time-display">{formatTime(state.remaining)}</div>
				<div class="progress-bar-container">
					<div class="progress-bar-fill" style="width: {progress}%"></div>
				</div>
			</main>
			<footer class="timer-footer">
				<div class="meta-info">
					<span>Station {Math.min(state.currentStation + 1, totalStations)}/{totalStations}</span>
					<span
						>Round {Math.min(state.currentRound, sessionConfig.rounds)}/{sessionConfig.rounds}</span
					>
					<span>Total: ~{totalTime} min</span>
				</div>
				<div class="control-row">
					<button on:click={state.isRunning ? pauseTimer : startTimer}
						>{state.isRunning ? 'Pause' : 'Start'}</button
					>
					<button class="secondary" on:click={resetTimer}>Reset</button>
				</div>
			</footer>
		</div>
	</main>
</div>

<style>
	:root {
		--font-body: 'Inter', sans-serif;
		--font-display: 'Bebas Neue', sans-serif;
		--brand-yellow: #fde047;
		--brand-green: #16a34a;
		--bg-main: #111827;
		--bg-panel: #1f2937;
		--border-color: #374151;
		--text-primary: #f9fafb;
		--text-secondary: #9ca3af;
		--text-muted: #6b7280;
	}
	:global(body) {
		background-color: var(--bg-main);
		color: var(--text-primary);
		font-family: var(--font-body);
	}

	/* Main Layout */
	.mission-control {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 1.5rem;
		gap: 1.5rem;
	}
	.setup-panel {
		flex-shrink: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--bg-panel);
		padding: 1rem 1.5rem;
		border-radius: 1rem;
		border: 1px solid var(--border-color);
	}
	.logo span {
		font-family: var(--font-display);
		font-size: 2rem;
		color: var(--brand-yellow);
		letter-spacing: 1px;
	}
	.setup-controls {
		display: flex;
		gap: 1.5rem;
	}
	.form-group label {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	.form-group input {
		width: 80px;
		font-size: 1rem;
		padding: 0.5rem;
		border-radius: 6px;
		border: 1px solid var(--border-color);
		background: var(--bg-main);
		color: var(--text-primary);
	}
	.main-content {
		flex-grow: 1;
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 1.5rem;
		min-height: 0;
	}

	/* Left Panel */
	.left-panel {
		background: var(--bg-panel);
		border-radius: 1rem;
		border: 1px solid var(--border-color);
		padding: 1.5rem;
		overflow-y: auto;
	}
	.station-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.station-card {
		background: var(--bg-main);
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: all 200ms ease;
	}
	.station-card.current {
		border-color: var(--brand-yellow);
		box-shadow: 0 0 20px rgba(253, 224, 71, 0.2);
		transform: scale(1.02);
	}
	.station-card__header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.station-number {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.9rem;
		flex-shrink: 0;
	}
	.station-card.current .station-number {
		background: var(--brand-yellow);
		color: var(--bg-main);
	}
	.station-card h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}
	.shared-badge {
		font-size: 0.7rem;
		background: #3b82f6;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		margin-left: auto;
	}
	.station-card__tasks {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.task-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	.task-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text-muted);
	}
	.task-text {
		color: var(--text-secondary);
	}
	.station-card__roster {
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border-color);
	}
	.roster-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.roster-chips span {
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: var(--surface-3);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.roster-empty {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	/* Right Panel */
	.right-panel {
		background: var(--bg-panel);
		border-radius: 1rem;
		border: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem;
	}
	.timer-main {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		width: 100%;
	}
	.phase-display {
		font-family: var(--font-display);
		font-size: clamp(3rem, 10vw, 6rem);
		letter-spacing: 4px;
		line-height: 1;
	}
	.time-display {
		font-family: var(--font-display);
		font-size: clamp(10rem, 30vh, 20rem);
		line-height: 1;
		margin: 1rem 0;
	}
	.progress-bar-container {
		width: 100%;
		max-width: 700px;
		height: 6px;
		background: var(--bg-main);
		border-radius: 999px;
		overflow: hidden;
	}
	.progress-bar-fill {
		height: 100%;
		background: var(--brand-yellow);
	}
	.timer-footer {
		width: 100%;
		margin-top: auto;
		padding-top: 1rem;
	}
	.meta-info {
		display: flex;
		justify-content: center;
		gap: 2rem;
		margin-bottom: 1rem;
		color: var(--text-secondary);
		font-size: 1.25rem;
		font-family: var(--font-display);
		letter-spacing: 1px;
	}
	.control-row {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}
	.control-row button {
		border-radius: 999px;
		font-size: 1.25rem;
		padding: 1rem 3rem;
		cursor: pointer;
		font-weight: 700;
		border: none;
	}
	.control-row button.secondary {
		background: var(--surface-2);
		color: var(--text-secondary);
	}
	.control-row button {
		background: var(--brand-green);
		color: var(--text-primary);
	}

	@media (max-width: 1200px) {
		.main-content {
			grid-template-columns: 1.1fr 1fr;
		}
		.station-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 900px) {
		.mission-control {
			padding: 1rem;
		}
		.main-content {
			display: flex;
			flex-direction: column;
		}
		.left-panel {
			max-height: 50vh;
		}
		.setup-panel {
			flex-direction: column;
			gap: 1rem;
		}
	}
</style>
