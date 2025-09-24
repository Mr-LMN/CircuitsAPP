<script>
	// @ts-nocheck
	import { onDestroy } from 'svelte';

	export let data;
	const { workout } = data;

	// --- Sound Imports & Functions ---
	let audioCtx = null;
	function getCtx() {
		return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
	}
	function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) {
		try {
			const ctx = getCtx();
			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();
			oscillator.type = type;
			oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
			oscillator.connect(gainNode);
			gainNode.connect(ctx.destination);
			gainNode.gain.setValueAtTime(gain, ctx.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000);
			oscillator.start();
			oscillator.stop(ctx.currentTime + dur / 1000);
		} catch (error) {
			console.warn('Tone playback failed', error);
		}
	}
	function whistleBell() {
		try {
			const ctx = getCtx();
			for (let i = 0; i < 2; i += 1) {
				const gainNode = ctx.createGain();
				const t0 = ctx.currentTime + i * 0.15;
				gainNode.connect(ctx.destination);
				gainNode.gain.setValueAtTime(1e-4, t0);
				gainNode.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02);
				gainNode.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2);
				const o1 = ctx.createOscillator();
				const o2 = ctx.createOscillator();
				o1.type = 'triangle';
				o2.type = 'triangle';
				o1.frequency.setValueAtTime(620, t0);
				o2.frequency.setValueAtTime(930, t0);
				o1.connect(gainNode);
				o2.connect(gainNode);
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
		const freqMap = { 3: 520, 2: 680, 1: 940 };
		tone(freqMap[n] || 720, 180, 'sine', 0.35);
	}

	// --- Session Setup & Timer State ---
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

	// --- Staff Roster Logic ---
	let totalStations = workout.exercises?.length ?? 0;
	let stationAssignments = (workout.exercises ?? []).map(() => []);
	let assignmentInputs = (workout.exercises ?? []).map(() => '');
	function parseAssignments(value = '') {
		return value
			.split(/[\n,]/)
			.map((code) => code.trim())
			.filter(Boolean)
			.map((code) => code.toUpperCase());
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

	// --- Svelte Reactive Statements ---
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
				state.currentStation += 1;
				if (state.currentStation >= totalStations) {
					state.currentStation = 0;
					state.currentRound += 1;
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
			state.currentStation += 1;
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
		const secondsRemaining = Math.ceil(state.remaining);
		if (secondsRemaining <= 3 && secondsRemaining >= 1 && secondsRemaining !== state.lastCue) {
			state.lastCue = secondsRemaining;
			countBeep(secondsRemaining);
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
	function formatTime(value) {
		const seconds = Math.max(0, Math.ceil(value));
		const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
		const remainder = String(seconds % 60).padStart(2, '0');
		return `${minutes}:${remainder}`;
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
					<label for="work">Work (s)</label>
					<input id="work" type="number" min="0" bind:value={sessionConfig.work} />
				</div>
				<div class="form-group">
					<label for="swap">Swap (s)</label>
					<input id="swap" type="number" min="0" bind:value={sessionConfig.swap} />
				</div>
				<div class="form-group">
					<label for="move">Move/Rest (s)</label>
					<input id="move" type="number" min="0" bind:value={sessionConfig.move} />
				</div>
				<div class="form-group">
					<label for="rounds">Rounds</label>
					<input id="rounds" type="number" min="1" bind:value={sessionConfig.rounds} />
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
	<div class="left-panel">
		<div class="station-list">
			{#each workout.exercises as station, i (i)}
				{@const nextDestinationIndex = (i + 1) % totalStations}
				<article class="station-card" class:current={i === state.currentStation}>
					<header class="station-card__header">
						<span class="station-number">{i + 1}</span>
						<h3>{station.name}</h3>
					</header>
					<div class="station-card__tasks">
						<div class="task-line">
							<span class="task-label p1">P1</span><span class="task-text">{station.p1_task}</span>
						</div>
						<div class="task-line">
							<span class="task-label p2">P2</span><span class="task-text">{station.p2_task}</span>
						</div>
					</div>
					<footer class="station-card__roster">
						<div class="roster-line">
							<span class="roster-title">Now Here</span>
							<div class="roster-chips">
								{#if stationRoster[i]?.length}
									{#each stationRoster[i] as code, j (j)}<span>{code}</span>{/each}
								{:else}
									<span class="roster-empty">OPEN</span>
								{/if}
							</div>
						</div>
						<div class="roster-line destination" class:pulse={state.phaseIndex === 3}>
							<span class="roster-title">Next Stop</span>
							<span class="roster-destination-station">Station {nextDestinationIndex + 1}</span>
						</div>
					</footer>
				</article>
			{/each}
		</div>
	</div>

	<div class="right-panel">
		<header class="timer-header">
			<h1 class="workout-title">{workout.title}</h1>
			<div class="round-info">
				<span
					>Round {Math.min(state.currentRound, sessionConfig.rounds)} / {sessionConfig.rounds}</span
				>
				<span>Station {Math.min(state.currentStation + 1, totalStations)} / {totalStations}</span>
			</div>
		</header>
		<main class="timer-main">
			<div class="phase-display">{state.phase}</div>
			<div class="time-display">{formatTime(state.remaining)}</div>
			<div class="progress-bar-container">
				<div class="progress-bar-fill" style="width: {progress}%"></div>
			</div>
		</main>
		<footer class="control-row">
			<button class="secondary" on:click={openSetup}>Setup</button>
			<button class="secondary" on:click={resetTimer}>Reset</button>
			<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}
				>{state.isRunning ? 'Pause' : 'Start'}</button
			>
		</footer>
	</div>
</div>

<style>
	/* --- DESIGN SYSTEM VARIABLES --- */
	:root {
		--font-body: 'Inter', sans-serif;
		--font-display: 'Bebas Neue', sans-serif;

		--brand-yellow: #fde047; /* Brighter, more vibrant yellow */
		--brand-green: #16a34a;

		--deep-space: #0f172a;
		--surface-1: #1e293b;
		--surface-2: #334155;
		--surface-3: #475569;

		--text-primary: #f8fafc;
		--text-secondary: #cbd5e1;
		--text-muted: #94a3b8;
	}

	/* --- GLOBAL STYLES --- */
	:global(body) {
		background-color: var(--deep-space);
		background-image: radial-gradient(var(--surface-1) 1px, transparent 1px);
		background-size: 20px 20px;
		color: var(--text-primary);
		font-family: var(--font-body);
	}

	.blur {
		filter: blur(8px);
		pointer-events: none;
	}

	/* --- MODAL STYLES --- */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.8);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(8px);
		overflow-y: auto;
		padding: 2rem 1.5rem;
	}
	.modal-content {
		background: var(--surface-1);
		border: 1px solid var(--surface-2);
		border-radius: 24px;
		padding: 2.5rem;
		max-width: 900px;
		width: 100%;
		text-align: left;
		box-shadow: 0 30px 70px #00000073;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		margin: auto 0;
	}
	.modal-content h2 {
		color: var(--brand-yellow);
		margin: 0;
		font-family: var(--font-display);
		font-size: 2.5rem;
		letter-spacing: 0.08em;
	}
	.modal-content p {
		color: var(--text-secondary);
		margin: 0;
	}
	.setup-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1.25rem;
	}
	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.form-group input {
		width: 100%;
		font-size: 1.25rem;
		padding: 0.75rem 1rem;
		border-radius: 12px;
		border: 1px solid var(--surface-2);
		background: var(--deep-space);
		color: var(--text-primary);
	}
	.assignment-setup {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.assignment-setup__header h3 {
		margin: 0;
		color: var(--brand-yellow);
		font-size: 1.25rem;
		font-family: var(--font-display);
		letter-spacing: 0.08em;
	}
	.assignment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1.1rem;
	}
	.assignment-card {
		background: var(--surface-2);
		border-radius: 14px;
		padding: 1.1rem 1.25rem;
	}
	.assignment-card label {
		font-size: 0.85rem;
		color: var(--text-secondary);
	}
	.assignment-card input {
		width: 100%;
		padding: 0.7rem 0.85rem;
		margin-top: 0.5rem;
		border-radius: 10px;
		border: 1px solid var(--surface-3);
		background: var(--surface-1);
		color: var(--text-primary);
	}
	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
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
		background: var(--brand-green);
		color: var(--text-primary);
	}
	.modal-actions button.secondary {
		border: 1px solid var(--surface-3);
		background: var(--surface-2);
		color: var(--text-secondary);
	}

	/* --- MAIN LAYOUT --- */
	.timer-wrapper {
		min-height: 100vh;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: stretch;
		padding: 2rem;
	}
	.left-panel,
	.right-panel {
		padding: 2.5rem;
	}

	/* --- LEFT PANEL: STATION MAP --- */
	.left-panel {
		flex: 1 1 58%;
		background: var(--surface-1);
		border-radius: 28px 0 0 28px;
		border: 1px solid var(--surface-2);
		border-right: none;
		display: flex;
		flex-direction: column;
	}
	.station-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
		overflow-y: auto;
		flex-grow: 1;
		padding: 0.2rem;
	}
	.station-card {
		background: var(--surface-2);
		border: 1px solid var(--surface-3);
		border-radius: 16px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		transition: all 200ms ease;
	}
	.station-card.current {
		border-color: var(--brand-yellow);
		background: var(--surface-3);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
		transform: scale(1.03);
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
		color: var(--deep-space);
	}
	.station-card h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary);
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
	.station-card__roster {
		margin-top: auto;
		padding-top: 0.75rem;
		border-top: 1px solid var(--surface-3);
	}
	.roster-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.roster-title {
		font-size: 0.7rem;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.roster-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.roster-chips span {
		padding: 0.15rem 0.5rem;
		border-radius: 6px;
		background: var(--surface-3);
		color: var(--text-secondary);
		font-size: 0.8rem;
		font-weight: 600;
	}
	.roster-empty {
		color: var(--surface-3);
		font-size: 0.8rem;
	}
	.roster-destination-station {
		font-size: 0.9rem;
		font-weight: bold;
		color: var(--text-primary);
	}
	.pulse .roster-destination-station {
		animation: pulse 1.5s infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			color: var(--text-primary);
		}
		50% {
			color: var(--brand-yellow);
		}
	}

	/* --- RIGHT PANEL: LIVE TIMER --- */
	.right-panel {
		flex: 1 1 42%;
		background: linear-gradient(160deg, var(--deep-space), #000000);
		border-radius: 0 28px 28px 0;
		border: 1px solid var(--surface-2);
		border-left: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.timer-header {
		width: 100%;
		text-align: left;
	}
	.workout-title {
		font-family: var(--font-display);
		font-size: clamp(3rem, 6vw, 4.5rem);
		color: var(--brand-yellow);
		line-height: 1;
		letter-spacing: 2px;
	}
	.round-info {
		display: flex;
		gap: 1rem;
		color: var(--text-muted);
		text-transform: uppercase;
		font-size: 1.1rem;
		margin-top: 0.5rem;
	}
	.timer-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		flex-grow: 1;
		justify-content: center;
	}
	.phase-display {
		font-family: var(--font-display);
		font-size: clamp(3rem, 8vw, 5rem);
		color: var(--text-primary);
		letter-spacing: 4px;
	}
	.time-display {
		font-family: var(--font-display);
		font-size: clamp(10rem, 28vw, 20rem);
		font-weight: 400;
		line-height: 1;
		margin: 1rem 0;
		color: var(--text-primary);
	}
	.progress-bar-container {
		width: 100%;
		max-width: 600px;
		height: 8px;
		background: var(--surface-2);
		border-radius: 999px;
		overflow: hidden;
	}
	.progress-bar-fill {
		height: 100%;
		background: var(--brand-yellow);
	}
	.control-row {
		display: flex;
		justify-content: center;
		gap: 1rem;
		width: 100%;
		margin-top: auto;
		padding-top: 1.5rem;
	}
	.control-row button {
		border: 1px solid var(--surface-3);
		background: var(--surface-2);
		color: var(--text-secondary);
		border-radius: 999px;
		font-size: 1.1rem;
		padding: 0.9rem 2.5rem;
		cursor: pointer;
		font-weight: 600;
	}
	.control-row button.primary {
		background: var(--brand-green);
		border-color: transparent;
		color: var(--text-primary);
	}

	/* --- RESPONSIVE ADJUSTMENTS --- */
	@media (max-width: 1200px) {
		.timer-wrapper {
			flex-direction: column;
			padding: 1rem;
		}
		.left-panel {
			border-radius: 28px 28px 0 0;
			border-right: 1px solid var(--surface-2);
			border-bottom: none;
			max-height: 50vh;
		}
		.right-panel {
			border-radius: 0 0 28px 28px;
			border-left: 1px solid var(--surface-2);
		}
	}
	@media (max-width: 768px) {
		.station-list {
			grid-template-columns: 1fr;
		}
		.left-panel,
		.right-panel {
			padding: 1.5rem;
		}
		.time-display {
			font-size: clamp(6rem, 25vw, 10rem);
		}
	}
</style>
