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
			console.warn('Tone playback failed', error);
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
			console.warn('Whistle playback failed', error);
		}
	}
	function countBeep(n) {
		const f = { 3: 520, 2: 680, 1: 940 };
		tone(f[n] || 720, 180, 'sine', 0.35);
	}

	// --- Session Setup & Timer State (No Change) ---
	let isSetupVisible = true;
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
	let totalStations = workout.exercises?.length ?? 0;
	let stationAssignments = (workout.exercises ?? []).map(() => []);
	let assignmentInputs = (workout.exercises ?? []).map(() => '');

	// --- Logic & Functions (No Change) ---
	function parseAssignments(value = '') {
		return value
			.split(/[\n,]/)
			.map((c) => c.trim())
			.filter(Boolean)
			.map((c) => c.toUpperCase());
	}
	function commitAssignmentInput(index) {
		const parsed = parseAssignments(assignmentInputs[index] ?? '');
		stationAssignments[index] = parsed;
		assignmentInputs[index] = parsed.join(', ');
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
	$: phaseMessage = (() => {
		if (state.phaseIndex === 1) return 'Prepare to switch roles.';
		if (state.phaseIndex === 3) return 'Move to your next station now.';
		if (state.phaseIndex === 2) return 'Roles are now swapped!';
		return '';
	})();
	$: progress =
		state.duration > 0
			? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100))
			: 0;
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
	function initializeAndStart() {
		commitAllAssignments();
		isSetupVisible = false;
		resetTimer();
		startTimer();
	}
	function openSetup() {
		pauseTimer();
		isSetupVisible = true;
	}
	function closeSetup() {
		commitAllAssignments();
		isSetupVisible = false;
	}
	function formatTime(s) {
		const secs = Math.max(0, Math.ceil(s));
		return (
			String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')
		);
	}
	onDestroy(() => clearInterval(timerId));
</script>

{#if isSetupVisible}
	<div class="modal-overlay">
		<div class="modal-content">
			<h2>Session Setup</h2>
			<p>Configure timer intervals and assign staff to their starting stations.</p>
			<div class="setup-form">
				<div class="form-group">
					<label for="work">Work (s)</label><input
						id="work"
						type="number"
						min="0"
						bind:value={sessionConfig.work}
					/>
				</div>
				<div class="form-group">
					<label for="swap">Swap (s)</label><input
						id="swap"
						type="number"
						min="0"
						bind:value={sessionConfig.swap}
					/>
				</div>
				<div class="form-group">
					<label for="move">Move/Rest (s)</label><input
						id="move"
						type="number"
						min="0"
						bind:value={sessionConfig.move}
					/>
				</div>
				<div class="form-group">
					<label for="rounds">Rounds</label><input
						id="rounds"
						type="number"
						min="1"
						bind:value={sessionConfig.rounds}
					/>
				</div>
			</div>
			<div class="assignment-setup">
				<div class="assignment-setup__header">
					<h3>Starting Positions</h3>
					<p>Enter staff initials, separated by commas. They will rotate automatically.</p>
				</div>
				<div class="assignment-grid">
					{#each workout.exercises as station, i (i)}
						<div class="assignment-card">
							<label for={`assignment-${i}`}>Station {i + 1}: {station.name}</label>
							<input
								id={`assignment-${i}`}
								placeholder="e.g. LMN, DVE"
								bind:value={assignmentInputs[i]}
								on:blur={() => commitAssignmentInput(i)}
							/>
						</div>
					{/each}
				</div>
			</div>
			<div class="modal-actions">
				<button class="secondary" on:click={closeSetup}>Close</button>
				<button class="primary" on:click={initializeAndStart}>Start Session</button>
			</div>
		</div>
	</div>
{/if}

<div class="timer-wrapper" class:blur={isSetupVisible}>
	<div class="timer-layout">
		<section class="station-overview">
			<div class="station-overview__header">
				<h2>Stations</h2>
				<div class="station-overview__meta">
					<span>{totalStations} Stations</span>
					<button class="ghost-button" on:click={openSetup}>Adjust Setup</button>
				</div>
			</div>
			<div class="station-strip">
				{#each workout.exercises as station, i (i)}
					<article class="station-card" class:current={i === state.currentStation}>
						<header class="station-card__header">
							<span class="station-number">{i + 1}</span>
							<h3>{station.name}</h3>
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
									{#each stationRoster[i] as code, j (j)}<span>{code}</span>{/each}
								{:else}<span class="roster-empty">OPEN</span>{/if}
							</div>
						</footer>
					</article>
				{/each}
			</div>
		</section>

		<section class="timer-panel">
			<header class="timer-header">
				<div class="header-meta">
					<h1>{workout.title}</h1>
					<p class="workout-meta">{workout.mode} • {workout.type}</p>
				</div>
				<div class="round-info">
					<span
						>Round {Math.min(state.currentRound, sessionConfig.rounds)}/{sessionConfig.rounds}</span
					>
					<span>Station {Math.min(state.currentStation + 1, totalStations)}/{totalStations}</span>
				</div>
			</header>
			<main class="timer-main">
				<div class="phase-display">{state.phase}</div>
				{#if phaseMessage}<p class="phase-subtext">{phaseMessage}</p>{/if}
				<div class="time-display">{formatTime(state.remaining)}</div>
				<div class="progress-bar-container">
					<div class="progress-bar-fill" style="width: {progress}%"></div>
				</div>
			</main>
			<footer class="control-row">
				<button on:click={resetTimer}>Reset</button>
				<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}
					>{state.isRunning ? 'Pause' : 'Start'}</button
				>
			</footer>
		</section>
	</div>
</div>

<style>
	:root {
		--green: #065f46;
		--yellow: #ffd60a;
	}
	:global(body) {
		background: #050505;
		color: white;
		font-family: 'Inter', system-ui, sans-serif;
	}
	.blur {
		filter: blur(10px);
		pointer-events: none;
	}
	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
		overflow-y: auto;
		padding: 2rem 1.5rem;
	}
	.modal-content {
		background: linear-gradient(145deg, #080c0a, #0d1310);
		border: 1px solid #66ff991f;
		border-radius: 24px;
		padding: 2.75rem;
		max-width: 900px;
		width: min(96vw, 900px);
		text-align: left;
		box-shadow: 0 30px 70px #00000073;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		margin: auto 0;
	}
	.modal-content h2 {
		color: var(--yellow);
		margin: 0;
		font-size: 2rem;
	}
	.modal-content p {
		color: #ffffffb8;
		margin: 0;
	}
	.setup-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1.25rem;
		margin-top: 1.5rem;
	}
	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		color: #ffffffa6;
		font-size: 0.9rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.form-group input {
		width: 100%;
		font-size: 1.25rem;
		padding: 0.75rem 1rem;
		border-radius: 12px;
		border: 1px solid #66ff9926;
		background: #0c120fcc;
		color: white;
	}
	.assignment-setup {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.assignment-setup__header h3 {
		margin: 0;
		color: var(--yellow);
		font-size: 1.25rem;
		text-transform: uppercase;
	}
	.assignment-setup__header p {
		color: #ffffff99;
		font-size: 0.95rem;
		line-height: 1.5;
	}
	.assignment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1.1rem;
		padding-top: 0.5rem;
	}
	.assignment-card {
		background: #0e1411cc;
		border: 1px solid #66ff991f;
		border-radius: 14px;
		padding: 1.1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.assignment-card label {
		font-size: 0.85rem;
		text-transform: uppercase;
		color: #ffffffa6;
	}
	.assignment-card input {
		width: 100%;
		padding: 0.7rem 0.85rem;
		border-radius: 10px;
		border: 1px solid #66ff992e;
		background: #090d0bfa;
		color: white;
		font-size: 0.95rem;
	}
	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		flex-shrink: 0;
	}
	.modal-actions button {
		border-radius: 999px;
		font-size: 1rem;
		padding: 0.85rem 1.75rem;
		cursor: pointer;
		font-weight: 600;
	}
	.modal-actions button.primary {
		border: none;
		background: var(--green);
		color: var(--yellow);
	}
	.modal-actions button.secondary {
		border: 1px solid #ffffff2e;
		background: #0f1411d9;
		color: #ffffffd1;
	}

	/* NEW Single-Panel Layout */
	.timer-wrapper {
		min-height: 100vh;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: stretch;
		padding: 2rem;
	}
	.timer-layout {
		width: 100%;
		max-width: 1920px;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		background: #0a0d0c;
		border: 1px solid #66ff9914;
		border-radius: 28px;
		padding: 2rem;
	}

	/* Top Section: Station Strip */
	.station-overview {
		border-bottom: 1px solid #66ff9914;
		padding-bottom: 2rem;
	}
	.station-overview__header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.station-overview__header h2 {
		color: var(--yellow);
		margin: 0;
		font-size: 1.65rem;
		text-transform: uppercase;
	}
	.station-overview__meta {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.95rem;
		color: #ffffff99;
	}
	.ghost-button {
		border: 1px solid #ffffff33;
		background: transparent;
		color: #ffffffe0;
		border-radius: 999px;
		padding: 0.5rem 1.2rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	.station-strip {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}
	.station-card {
		background: #121b16;
		border: 1px solid #66ff9914;
		border-radius: 18px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		transition: all 200ms ease;
	}
	.station-card.current {
		border-color: var(--yellow);
		background: #1d2a23;
		box-shadow: 0 10px 30px #ffd60a1a;
		transform: translateY(-2px);
	}
	.station-card__header {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	.station-number {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #ffffff1a;
		color: #ffffffbf;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 0.9rem;
		flex-shrink: 0;
	}
	.station-card.current .station-number {
		background: var(--yellow);
		color: #050505;
	}
	.station-card h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
	}
	.station-card__tasks {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-left: 0.5rem;
	}
	.task-line {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	.task-label {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: 700;
		flex-shrink: 0;
	}
	.task-label.p1 {
		background: #7af5c633;
		color: #7af5c6;
	}
	.task-label.p2 {
		background: #fbcfe833;
		color: #fbcfe8;
	}
	.task-text {
		color: #e6f0e8;
	}
	.station-card__roster {
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid #66ff9914;
	}
	.roster-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.roster-chips span {
		display: inline-flex;
		padding: 0.2rem 0.6rem;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: #ffffffe0;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.roster-empty {
		color: #ffffff4d;
		font-size: 0.8rem;
	}

	/* Bottom Section: Timer Panel */
	.timer-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		width: 100%;
		flex-grow: 1;
		justify-content: center;
	}
	.timer-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 2rem;
	}
	.header-meta {
		text-align: left;
	}
	.header-meta h1 {
		margin: 0;
		color: var(--yellow);
		font-size: clamp(2rem, 4vw, 3rem);
		text-transform: uppercase;
	}
	.workout-meta {
		margin-top: 0.5rem;
		color: #ffffffa6;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-size: 0.95rem;
	}
	.round-info {
		display: flex;
		gap: 1rem;
		color: #ffffffc9;
		font-size: 1.1rem;
		text-transform: uppercase;
	}
	.round-info span {
		display: inline-flex;
		padding: 0.55rem 1.2rem;
		border-radius: 999px;
		background: #ffffff0f;
	}
	.timer-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}
	.phase-display {
		font-size: clamp(2rem, 5vw, 3.5rem);
		font-weight: 300;
		text-transform: uppercase;
		color: #dddddd;
	}
	.phase-subtext {
		margin-top: -0.5rem;
		font-size: 1.1rem;
		color: #ffffffb8;
		font-style: italic;
	}
	.time-display {
		font-size: clamp(8rem, 20vw, 16rem);
		font-weight: 800;
		line-height: 1;
		font-family: monospace;
		margin: 1.5rem 0;
	}
	.progress-bar-container {
		width: min(860px, 100%);
		height: 10px;
		background: #1a1f1d;
		border-radius: 999px;
		overflow: hidden;
	}
	.progress-bar-fill {
		height: 100%;
		background: var(--yellow);
	}
	.control-row {
		display: flex;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
		width: 100%;
		margin-top: 2rem;
	}
	.control-row button {
		border: 1px solid #66ff9938;
		background: #131a17;
		color: #ffffffe0;
		border-radius: 999px;
		font-size: 1.1rem;
		padding: 0.9rem 2.5rem;
		cursor: pointer;
		min-width: 160px;
		font-weight: 600;
	}
	.control-row button.primary {
		background: var(--green);
		border-color: transparent;
		color: var(--yellow);
	}
</style>
