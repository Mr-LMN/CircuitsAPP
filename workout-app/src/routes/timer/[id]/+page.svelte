<script>
	import { onMount, onDestroy } from 'svelte';

	export let data;
	const { workout } = data;

	// --- Sound Imports ---
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
			console.warn('Tone playback failed', error);
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
			console.warn('Bell playback failed', error);
		}
	}
	function countBeep(n) {
		const f = { 3: 520, 2: 680, 1: 940 };
		tone(f[n] || 720, 180, 'sine', 0.35);
	}

	// --- NEW: Session Setup State ---
	let isSetupVisible = true; // Show the modal by default
	let sessionConfig = {
		work: 60,
		swap: 15,
		move: 15,
		rounds: 1
	};

	// --- Core Timer State ---
	let state = {
		phase: 'Ready',
		phaseIndex: -1, // -1=Ready, 0=Work1, 1=Swap, 2=Work2, 3=Move
		remaining: sessionConfig.work,
		duration: sessionConfig.work,
		currentStation: 0,
		currentRound: 1,
		isRunning: false,
		isComplete: false,
		lastCue: 0
	};
	let timerId = null;
	let stationListEl; // Element binding for autoscroll

	// Derived state for UI clarity
	let partnerAssignments = { p1: '', p2: '' };
	let phaseMessage = '';
	let progress = 0;

	$: currentStationData = workout.exercises?.[state.currentStation] ?? {
		name: '',
		p1_task: '',
		p2_task: ''
	};
	$: partnerAssignments = (() => {
		if (workout.mode === 'Partner' && workout.type === 'Circuit') {
			if (state.phaseIndex === 2) {
				return { p1: currentStationData.p2_task, p2: currentStationData.p1_task };
			}
			return { p1: currentStationData.p1_task, p2: currentStationData.p2_task };
		}
		return { p1: currentStationData.p1_task ?? '', p2: currentStationData.p2_task ?? '' };
	})();
	$: phaseMessage = (() => {
		if (state.phaseIndex === 1) {
			return 'Swap positions and get ready to switch roles.';
		}
		if (state.phaseIndex === 3) {
			return 'Move smoothly to the next station together.';
		}
		if (state.phaseIndex === 2) {
			return 'Roles swapped – stay sharp and keep the pace!';
		}
		return '';
	})();
	$: progress =
		state.duration > 0
			? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100))
			: 0;

	// --- NEW: Autoscroll Function ---
	function scrollToCurrentStation() {
		if (!stationListEl) return;
		const currentEl = stationListEl.querySelector(
			`.station-item[data-index="${state.currentStation}"]`
		);
		if (currentEl) {
			currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	// --- NEW: Advanced Timer Logic ---
	function advancePhase() {
		state.lastCue = 0;
		const nextPhaseIndex = state.phaseIndex + 1;

		if (workout.mode === 'Partner' && workout.type === 'Circuit') {
			// Full Partner Circuit State Machine
			if (nextPhaseIndex === 0) {
				// Starting Work 1
				state.phaseIndex = 0;
				state.phase = 'WORK 1';
				state.remaining = state.duration = Number(sessionConfig.work) || 0;
				whistleBell();
				scrollToCurrentStation();
			} else if (nextPhaseIndex === 1) {
				// Starting Swap
				state.phaseIndex = 1;
				state.phase = 'SWAP';
				state.remaining = state.duration = Number(sessionConfig.swap) || 0;
				tone(420, 160);
			} else if (nextPhaseIndex === 2) {
				// Starting Work 2
				state.phaseIndex = 2;
				state.phase = 'WORK 2 (Swapped)';
				state.remaining = state.duration = Number(sessionConfig.work) || 0;
				whistleBell();
			} else if (nextPhaseIndex === 3) {
				// Starting Move
				state.phaseIndex = 3;
				state.phase = 'MOVE TO NEXT';
				state.remaining = state.duration = Number(sessionConfig.move) || 0;
				tone(420, 160);
			} else {
				// Move is over, advance station/round
				state.currentStation++;
				if (state.currentStation >= workout.exercises.length) {
					state.currentStation = 0;
					state.currentRound++;
					if (
						state.currentRound > Number(sessionConfig.rounds) ||
						Number(sessionConfig.rounds) <= 0
					) {
						workoutComplete();
						return;
					}
				}
				state.phaseIndex = 0;
				state.phase = 'WORK 1';
				state.remaining = state.duration = Number(sessionConfig.work) || 0;
				whistleBell();
				scrollToCurrentStation();
			}
		} else {
			// Simplified logic for other workout types (can be expanded later)
			state.currentStation++;
			if (state.currentStation >= workout.exercises.length) {
				workoutComplete();
				return;
			}
			state.phase = `Round ${state.currentStation + 1}`;
			state.remaining = state.duration = Number(sessionConfig.work) || 0;
			whistleBell();
			scrollToCurrentStation();
		}
		state = state;
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
		state = state; // Trigger Svelte reactivity
	}

	function startTimer() {
		if (state.isComplete) return;
		if (state.isRunning) return;
		if (state.phaseIndex === -1) {
			// First start
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
		state.remaining = Number(sessionConfig.work) || 0;
		state.duration = Number(sessionConfig.work) || 0;
		state.currentStation = 0;
		state.currentRound = 1;
		state.isComplete = false;
		state = state;
		scrollToCurrentStation();
	}

	function workoutComplete() {
		pauseTimer();
		state.phase = 'SESSION COMPLETE!';
		state.isComplete = true;
		state = state;
		whistleBell();
	}

	function initializeAndStart() {
		sessionConfig = {
			work: Math.max(0, Number(sessionConfig.work) || 0),
			swap: Math.max(0, Number(sessionConfig.swap) || 0),
			move: Math.max(0, Number(sessionConfig.move) || 0),
			rounds: Math.max(1, Math.floor(Number(sessionConfig.rounds) || 1))
		};
		isSetupVisible = false;
		resetTimer(); // Initialize state with new config
		startTimer();
	}

	function formatTime(s) {
		const secs = Math.max(0, Math.ceil(s));
		const m = Math.floor(secs / 60);
		const r = secs % 60;
		return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
	}

	onMount(() => {
		scrollToCurrentStation();
	});

	onDestroy(() => clearInterval(timerId));
</script>

{#if isSetupVisible}
	<div class="modal-overlay">
		<div class="modal-content">
			<h2>Session Setup</h2>
			<p>Configure the timer for this workout.</p>
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
			<button class="primary" on:click={initializeAndStart}>Start Session</button>
		</div>
	</div>
{/if}

<div class="timer-wrapper" class:blur={isSetupVisible}>
	{#if workout.mode === 'Partner' && workout.type === 'Circuit'}
		<div class="partner-circuit-layout">
			<div class="left-panel">
				<h2>Stations</h2>
				<div class="station-list" bind:this={stationListEl}>
					{#each workout.exercises as station, i (station.id ?? station.name ?? i)}
						<div class="station-item" class:current={i === state.currentStation} data-index={i}>
							<div class="station-number">{i + 1}</div>
							<div class="station-details">
								<h3>{station.name}</h3>
								<p class="p1"><span>P1:</span> {station.p1_task}</p>
								<p class="p2"><span>P2:</span> {station.p2_task}</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="right-panel">
				<header class="timer-header">
					<div class="header-meta">
						<h1>{workout.title}</h1>
						<div class="badges">
							{#if workout.isBenchmark}<span class="badge benchmark">★ Benchmark</span>{/if}
							<span class="badge {workout.type.toLowerCase()}">{workout.type}</span>
							<span class="badge {workout.mode.toLowerCase()}">{workout.mode}</span>
						</div>
					</div>
					<div class="round-info">
						<span>Round {state.currentRound}/{sessionConfig.rounds}</span>
						<span>Station {state.currentStation + 1}/{workout.exercises.length}</span>
					</div>
				</header>
				<main class="timer-main">
					<div class="phase-display">{state.phase}</div>
					{#if phaseMessage}
						<p class="phase-subtext">{phaseMessage}</p>
					{/if}
					<div class="time-display">{formatTime(state.remaining)}</div>
					<div class="progress-bar-container">
						<div class="progress-bar-fill" style="width: {progress}%"></div>
					</div>
					<div class="current-tasks">
						<div class="task-card p1" class:swap-phase={state.phaseIndex === 2}>
							<h4>PARTNER 1</h4>
							<p>{partnerAssignments.p1}</p>
						</div>
						<div class="task-card p2" class:swap-phase={state.phaseIndex === 2}>
							<h4>PARTNER 2</h4>
							<p>{partnerAssignments.p2}</p>
						</div>
					</div>
				</main>
				<footer class="timer-controls">
					<button on:click={resetTimer}>Reset</button>
					<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}>
						{state.isRunning ? 'Pause' : 'Start'}
					</button>
				</footer>
			</div>
		</div>
	{:else}
		<div class="default-timer-layout">
			<h1>{workout.title}</h1>
			<p>
				This is the default timer view. The logic for {workout.type} has not been implemented yet.
			</p>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background:
			radial-gradient(circle at top, rgba(10, 40, 24, 0.45), transparent 55%),
			radial-gradient(circle at bottom, rgba(10, 40, 24, 0.35), transparent 60%), #050505;
		color: white;
		font-family: 'Inter', system-ui, sans-serif;
	}
	.blur {
		filter: blur(10px);
		pointer-events: none;
		user-select: none;
		transition: filter 0.3s ease;
	}

	/* --- Modal Styles --- */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}
	.modal-content {
		background: linear-gradient(145deg, rgba(8, 12, 10, 0.95), rgba(13, 19, 16, 0.95));
		border: 1px solid rgba(102, 255, 153, 0.08);
		border-radius: 20px;
		padding: 2.5rem;
		max-width: 560px;
		width: min(92vw, 560px);
		text-align: center;
		box-shadow: 0 30px 70px rgba(0, 0, 0, 0.45);
	}
	.modal-content h2 {
		color: var(--yellow);
		margin-bottom: 0.5rem;
		font-size: 2rem;
		letter-spacing: 0.08em;
	}
	.modal-content p {
		color: rgba(255, 255, 255, 0.7);
	}
	.setup-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25rem;
		margin: 2.5rem 0 2rem;
		text-align: left;
	}
	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		color: rgba(255, 255, 255, 0.65);
		font-size: 0.9rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.form-group input {
		width: 100%;
		font-size: 1.25rem;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		border: 1px solid rgba(102, 255, 153, 0.15);
		background: rgba(12, 18, 15, 0.9);
		color: white;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}
	.form-group input:focus {
		outline: none;
		border-color: var(--yellow);
		box-shadow: 0 0 0 4px rgba(255, 214, 10, 0.2);
	}
	.modal-content button.primary {
		width: 100%;
		font-size: 1.25rem;
		padding: 1rem;
		border-radius: 10px;
		border: none;
		background: linear-gradient(135deg, var(--green), #0c8b63);
		color: var(--yellow);
		cursor: pointer;
		letter-spacing: 0.08em;
		font-weight: 700;
		box-shadow: 0 15px 45px rgba(6, 95, 70, 0.45);
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}
	.modal-content button.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 25px 55px rgba(6, 95, 70, 0.55);
	}

	/* --- Partner Circuit Layout Styles --- */
	.timer-wrapper {
		min-height: 100vh;
		width: 100%;
		display: flex;
		align-items: stretch;
		justify-content: center;
		padding: 0;
	}
	.partner-circuit-layout {
		display: grid;
		grid-template-columns: minmax(320px, 420px) 1fr;
		width: min(1200px, 100%);
		margin: 0 auto;
		background: rgba(10, 13, 12, 0.85);
		border: 1px solid rgba(102, 255, 153, 0.08);
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(12px);
	}
	.left-panel {
		background: linear-gradient(180deg, rgba(10, 23, 16, 0.95) 0%, rgba(5, 10, 8, 0.95) 100%);
		padding: 2rem 1.75rem;
		display: flex;
		flex-direction: column;
		border-right: 1px solid rgba(102, 255, 153, 0.08);
	}
	.left-panel h2 {
		color: var(--yellow);
		margin-bottom: 1.5rem;
		font-size: 1.5rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.station-list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-right: 0.5rem;
		scroll-behavior: smooth;
	}
	.station-item {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		align-items: start;
		background: rgba(20, 30, 25, 0.85);
		padding: 1rem;
		border-radius: 14px;
		border: 1px solid rgba(102, 255, 153, 0.08);
		transition:
			transform 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}
	.station-item.current {
		border-color: var(--yellow);
		transform: translateX(6px);
		box-shadow: 0 12px 35px rgba(255, 214, 10, 0.15);
		background: rgba(32, 45, 38, 0.95);
	}
	.station-number {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		background: rgba(255, 214, 10, 0.15);
		color: var(--yellow);
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.1rem;
		border: 1px solid rgba(255, 214, 10, 0.35);
	}
	.station-details h3 {
		font-size: 1.1rem;
		margin-bottom: 0.5rem;
		font-weight: 600;
	}
	.station-item p {
		font-size: 0.9rem;
		color: rgba(230, 240, 232, 0.8);
		margin-left: 0.25rem;
		line-height: 1.4;
	}
	.station-item p span {
		display: inline-block;
		min-width: 2.25rem;
		font-weight: 700;
	}
	.station-item p.p1 span {
		color: #7af5c6;
	}
	.station-item p.p2 span {
		color: #fbcfe8;
	}

	.right-panel {
		display: flex;
		flex-direction: column;
		padding: 2.5rem 3rem;
		gap: 1.5rem;
		text-align: center;
		background: linear-gradient(180deg, rgba(7, 10, 9, 0.9) 0%, rgba(5, 10, 8, 0.95) 100%);
	}
	.timer-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.timer-header h1 {
		font-size: clamp(2rem, 4vw, 2.75rem);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-align: left;
	}
	.header-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}
	.badges {
		display: flex;
		justify-content: flex-start;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.badge {
		display: inline-block;
		padding: 0.35rem 0.85rem;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.badge.circuit {
		background-color: rgba(6, 95, 70, 0.9);
		color: #dfffe0;
	}
	.badge.partner {
		background-color: rgba(219, 39, 119, 0.85);
		color: white;
	}
	.badge.benchmark {
		background-color: var(--yellow);
		color: #050505;
	}
	.round-info {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.35rem;
		color: rgba(255, 255, 255, 0.75);
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.timer-main {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1.75rem;
		align-items: center;
	}
	.phase-display {
		font-size: clamp(2rem, 6vw, 4.25rem);
		font-weight: 300;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		color: rgba(255, 255, 255, 0.9);
		text-shadow: 0 8px 30px rgba(255, 214, 10, 0.15);
	}
	.phase-subtext {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.68);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.time-display {
		font-size: clamp(6rem, 18vw, 15rem);
		font-weight: 800;
		line-height: 1;
		font-family: 'Segment', 'SF Mono', monospace;
		text-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.progress-bar-container {
		width: min(90%, 720px);
		height: 14px;
		background-color: rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		margin: 0 auto;
		overflow: hidden;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
	}
	.progress-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--yellow), #ffef9a);
		transition: width 0.1s linear;
	}

	.current-tasks {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		align-items: stretch;
		width: 100%;
	}
	.task-card {
		background: rgba(17, 27, 22, 0.85);
		border-radius: 16px;
		padding: 1.75rem;
		min-width: 250px;
		flex: 1;
		max-width: 360px;
		border: 1px solid rgba(102, 255, 153, 0.08);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
		transition:
			transform 0.25s ease,
			border-color 0.25s ease,
			box-shadow 0.25s ease;
	}
	.task-card h4 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.2em;
		margin-bottom: 0.75rem;
		color: rgba(122, 245, 198, 0.9);
	}
	.task-card.p2 h4 {
		color: rgba(249, 168, 212, 0.9);
	}
	.task-card p {
		font-size: 1.65rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.3;
	}
	.task-card.swap-phase {
		border-color: var(--yellow);
		box-shadow: 0 20px 45px rgba(255, 214, 10, 0.18);
		transform: translateY(-6px);
	}

	.timer-controls {
		padding-top: 1rem;
		display: flex;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.timer-controls button {
		border: 1px solid rgba(102, 255, 153, 0.25);
		background: rgba(13, 19, 16, 0.8);
		color: rgba(255, 255, 255, 0.9);
		border-radius: 12px;
		font-size: 1.15rem;
		padding: 0.9rem 2.5rem;
		cursor: pointer;
		min-width: 160px;
		font-weight: 600;
		letter-spacing: 0.06em;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease,
			background-color 0.2s ease;
	}
	.timer-controls button:hover {
		transform: translateY(-2px);
		box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
	}
	.timer-controls button.primary {
		background: linear-gradient(135deg, var(--green), #0c8b63);
		color: var(--yellow);
		border-color: transparent;
		box-shadow: 0 18px 45px rgba(6, 95, 70, 0.5);
	}

	/* --- Default Layout --- */
	.default-timer-layout {
		width: 100%;
		padding: 4rem;
		text-align: center;
	}
	.default-timer-layout h1 {
		font-size: 2.5rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 1080px) {
		.partner-circuit-layout {
			grid-template-columns: 1fr;
			border-radius: 0;
		}
		.left-panel {
			max-height: 50vh;
			border-right: none;
			border-bottom: 1px solid rgba(102, 255, 153, 0.08);
		}
		.right-panel {
			padding: 2rem 1.5rem 2.5rem;
		}
		.timer-header {
			flex-direction: column;
			align-items: flex-start;
		}
		.round-info {
			align-items: flex-start;
		}
		.current-tasks {
			flex-direction: column;
		}
		.task-card {
			max-width: 100%;
		}
	}

	@media (max-width: 640px) {
		.modal-content {
			padding: 2rem 1.5rem;
		}
		.setup-form {
			grid-template-columns: 1fr;
		}
		.time-display {
			font-size: clamp(4.5rem, 20vw, 8rem);
		}
		.partner-circuit-layout {
			box-shadow: none;
		}
		.left-panel {
			padding: 1.5rem;
		}
		.right-panel {
			padding: 1.75rem;
		}
		.timer-controls button {
			width: 100%;
		}
	}
</style>
