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
		} catch {
			/* noop */
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
		} catch {
			/* noop */
		}
	}
	function countBeep(n) {
		const f = { 3: 520, 2: 680, 1: 940 };
		tone(f[n] || 720, 180, 'sine', 0.35);
	}

	// --- Session Config & Timer State ---
        let sessionConfig = {
                work: 60,
                swap: 15,
                move: 15,
                rounds: 1,
                totalTime: 600,
                showStationCallout: false
        };
	let amrapMinutes = sessionConfig.totalTime / 60;
	let state = {
		phase: 'Ready',
		phaseIndex: -1,
		remaining: 60,
		duration: 60,
		currentStation: 0,
		currentRound: 1,
		isRunning: false,
		isComplete: false,
		lastCue: 0
	};
	let timerId = null;
	let isSetupVisible = false;

	// --- Staff Roster Logic ---
	let totalStations = workout.exercises?.length ?? 0;
	let stationAssignments = (workout.exercises ?? []).map(() => []);
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
        $: partnerBadges = stationRoster.map((roster) => ({
                a: roster?.[0] || 'Partner 1',
                b: roster?.[1] || 'Partner 2'
        }));
        $: progress =
                state.duration > 0
                        ? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100))
                        : 0;
        $: if (workout.type === 'AMRAP') {
                amrapMinutes = sessionConfig.totalTime / 60;
        }
        $: activeStation = workout.exercises?.[state.currentStation] ?? null;
        $: partnerCallout =
                workout.mode === 'Partner' && sessionConfig.showStationCallout
                        ? (() => {
                                  if (!activeStation) return null;
                                  if (state.phase === 'PARTNER A') {
                                          return {
                                                  title: 'Partner A Work',
                                                  task: activeStation.p1_task || activeStation.name
                                          };
                                  }
                                  if (state.phase === 'PARTNER B') {
                                          return {
                                                  title: 'Partner B Work',
                                                  task: activeStation.p2_task || activeStation.name
                                          };
                                  }
                                  if (state.phase === 'SWAP') {
                                          return {
                                                  title: 'Swap & Transition',
                                                  task: 'Trade positions and reset equipment.'
                                          };
                                  }
                                  if (state.phase === 'MOVE') {
                                          return {
                                                  title: 'Move Stations',
                                                  task: 'Rotate to the next station together.'
                                          };
                                  }
                                  return null;
                          })()
                        : null;

        function getStationStarter(station) {
                return station?.startsWith?.toString?.().toUpperCase() === 'P2' ? 'P2' : 'P1';
        }

        function getPartnerSequence(stationIndex) {
                const station = workout.exercises?.[stationIndex];
                if (!station) {
                        return ['PARTNER A', 'SWAP', 'PARTNER B', 'MOVE'];
                }
                return getStationStarter(station) === 'P2'
                        ? ['PARTNER B', 'SWAP', 'PARTNER A', 'MOVE']
                        : ['PARTNER A', 'SWAP', 'PARTNER B', 'MOVE'];
        }

        function getPhaseDuration(phase) {
                switch (phase) {
                        case 'PARTNER A':
                        case 'PARTNER B':
                        case 'WORK':
                                return sessionConfig.work;
                        case 'SWAP':
                                return sessionConfig.swap;
                        case 'MOVE':
                                return sessionConfig.move;
                        default:
                                return sessionConfig.work;
                }
        }

        function playCueForPhase(phase) {
                if (phase === 'PARTNER A' || phase === 'PARTNER B' || phase === 'WORK') {
                        whistleBell();
                } else if (phase === 'SWAP' || phase === 'MOVE') {
                        tone(420, 160);
                }
        }

        function applyPhase(phase, phaseIndex) {
                state.phaseIndex = phaseIndex;
                state.phase = phase;
                state.remaining = state.duration = getPhaseDuration(phase);
                playCueForPhase(phase);
        }

	function handleAmrapInput(event) {
		const value = Number(event.target.value);
		amrapMinutes = Number.isFinite(value) ? value : 0;
		sessionConfig.totalTime = Math.max(0, amrapMinutes * 60);
	}

	// --- MULTI-MODE TIMER LOGIC ---
	function advancePhase() {
		if (state.isComplete) return;
		state.lastCue = 0;

		// --- LOGIC FOR CIRCUITS ---
                if (workout.type === 'Circuit' || workout.type === 'Timed Rounds') {
                        const nextPhaseIndex = state.phaseIndex + 1;
                        if (workout.mode === 'Partner') {
                                const sequence = getPartnerSequence(state.currentStation);
                                if (nextPhaseIndex < sequence.length) {
                                        applyPhase(sequence[nextPhaseIndex], nextPhaseIndex);
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
                                        state.phaseIndex = -1;
                                        advancePhase();
                                        return;
                                }
                        } else {
                                // Individual Circuit
                                // Simplified Work -> Move logic
                                if (nextPhaseIndex % 2 === 0) {
                                        applyPhase('WORK', nextPhaseIndex);
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
                                        applyPhase('MOVE', nextPhaseIndex);
                                }
                        }
                }
		// --- LOGIC FOR EMOM ---
		else if (workout.type === 'EMOM') {
			state.currentRound++; // Use 'round' as the minute counter
			if (state.currentRound > sessionConfig.rounds) {
				workoutComplete();
				return;
			}
			state.phase = `Minute ${state.currentRound}`;
			state.remaining = state.duration = 60; // EMOM is always 60 seconds
			state.currentStation = (state.currentRound - 1) % totalStations; // Cycle through exercises each minute
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
			if (workout.type === 'AMRAP') {
				workoutComplete();
			} else {
				advancePhase();
			}
		}
		state = state;
	}

	function startTimer() {
		if (state.isComplete || state.isRunning || totalStations === 0) return;
		if (state.phaseIndex === -1) {
			if (workout.type === 'AMRAP') {
				state.phase = 'WORK';
				state.remaining = state.duration = sessionConfig.totalTime;
				whistleBell();
			} else {
				advancePhase();
			}
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
		state.currentStation = 0;
		state.currentRound = 1;
		state.isComplete = false;
		// Set initial time based on workout type
		if (workout.type === 'AMRAP') {
			state.remaining = state.duration = sessionConfig.totalTime;
		} else if (workout.type === 'EMOM') {
			state.remaining = state.duration = 60;
		} else {
			state.remaining = state.duration = sessionConfig.work;
		}
		state = state;
	}
	function workoutComplete() {
		pauseTimer();
		state.phase = 'SESSION COMPLETE!';
		state.isComplete = true;
		state = state;
		whistleBell();
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
			<div class="setup-form">
				{#if workout.type === 'Circuit' || workout.type === 'Timed Rounds'}
                                        <div class="form-group">
                                                <label for="work">Work per Partner (s)</label><input
                                                        id="work"
                                                        type="number"
                                                        min="0"
                                                        bind:value={sessionConfig.work}
                                                />
                                        </div>
                                        {#if workout.mode === 'Partner'}
                                                <div class="form-group">
                                                        <label for="swap">Swap / Transition (s)</label><input
                                                                id="swap"
                                                                type="number"
                                                                min="0"
                                                                bind:value={sessionConfig.swap}
                                                        />
                                                        <p class="input-hint">Time for partners to trade stations.</p>
                                                </div>
                                                <div class="form-group checkbox-group">
                                                        <label>
                                                                <input
                                                                        type="checkbox"
                                                                        bind:checked={sessionConfig.showStationCallout}
                                                                />
                                                                Show station callout under timer
                                                        </label>
                                                        <p class="input-hint">
                                                                Display the active partner task beneath the countdown.
                                                        </p>
                                                </div>
                                        {/if}
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
				{:else if workout.type === 'AMRAP'}
					<div class="form-group">
						<label for="totalTime">Total Time (min)</label><input
							id="totalTime"
							type="number"
							min="1"
							bind:value={amrapMinutes}
							on:input={handleAmrapInput}
						/>
					</div>
				{:else if workout.type === 'EMOM'}
					<div class="form-group">
						<label for="rounds">Total Minutes</label><input
							id="rounds"
							type="number"
							min="1"
							bind:value={sessionConfig.rounds}
						/>
					</div>
				{/if}
			</div>
			{#if workout.mode === 'Partner'}
				<div class="assignment-setup">
					<h3>Starting Positions</h3>
					<div class="assignment-grid">
						{#each workout.exercises as station, i (station.id ?? station.name ?? i)}
							<div class="assignment-card">
								<label for={`assignment-${i}`}>Station {i + 1}: {station.name}</label>
								<input
									id={`assignment-${i}`}
									placeholder="e.g. LMN, DVE"
									bind:value={assignmentInputs[i]}
									on:blur={commitAllAssignments}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			<div class="modal-actions">
				<button class="secondary" on:click={closeSetup}>Close</button>
				<button
					class="primary"
					on:click={() => {
						isSetupVisible = false;
						resetTimer();
					}}>Apply & Close</button
				>
			</div>
		</div>
	</div>
{/if}

<div class="timer-wrapper" class:blur={isSetupVisible}>
	{#if workout.type === 'Circuit' || workout.type === 'Timed Rounds'}
		<div class="mission-control">
			<header class="setup-panel">
				<div class="logo"><span>{workout.title}</span></div>
				<div class="setup-controls">
					<button class="roster-btn" on:click={openSetup}>Setup</button>
				</div>
			</header>
			<main class="main-content">
				<div class="left-panel">
					<div class="station-grid">
						{#each workout.exercises as station, i (station.id ?? station.name ?? i)}
							<article class="station-card" class:current={i === state.currentStation}>
								<header class="station-card__header">
									<span class="station-number">{i + 1}</span>
									<h3>{station.name}</h3>
								</header>
                                                                <div class="station-card__tasks">
                                                                        <div class="task-line">
                                                                                <span class="task-badge partner-a">
                                                                                        {workout.mode === 'Partner'
                                                                                                ? partnerBadges[i]?.a || 'Partner 1'
                                                                                                : 'Partner A'}
                                                                                </span>
                                                                                <span class="task-text">{station.p1_task || station.name}</span>
                                                                        </div>
                                                                        {#if station.p2_task}
                                                                                <div class="task-line">
                                                                                        <span class="task-badge partner-b">
                                                                                                {workout.mode === 'Partner'
                                                                                                        ? partnerBadges[i]?.b || 'Partner 2'
                                                                                                        : 'Partner B'}
                                                                                        </span>
                                                                                        <span class="task-text">{station.p2_task}</span>
                                                                                </div>
                                                                        {/if}
                                                                </div>
								{#if workout.mode === 'Partner'}
									<footer class="station-card__roster">
										<div class="roster-chips">
											{#if stationRoster[i]?.length}{#each stationRoster[i] as code (code)}<span
														>{code}</span
													>{/each}{:else}<span class="roster-empty">OPEN</span>{/if}
										</div>
									</footer>
								{/if}
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
                                                {#if partnerCallout}
                                                        <div class="partner-callout">
                                                                <span class="callout-title">{partnerCallout.title}</span>
                                                                <span class="callout-task">{partnerCallout.task}</span>
                                                        </div>
                                                {/if}
                                        </main>
                                        <footer class="timer-footer">
                                                <div class="meta-info">
                                                        <span
                                                                >Station {Math.min(state.currentStation + 1, totalStations)}/{totalStations}</span
							>
							<span
								>Round {Math.min(
									state.currentRound,
									sessionConfig.rounds
								)}/{sessionConfig.rounds}</span
							>
						</div>
						<div class="control-row">
							<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}
								>{state.isRunning ? 'Pause' : 'Start'}</button
							>
							<button class="secondary" on:click={resetTimer}>Reset</button>
						</div>
					</footer>
				</div>
			</main>
		</div>
	{:else}
		<div class="focus-timer-layout">
			<header class="timer-header">
				<h1 class="workout-title">{workout.title}</h1>
				<div class="round-info">
					{#if workout.type === 'EMOM'}
						<span>Minute {state.currentRound} / {sessionConfig.rounds}</span>
					{/if}
				</div>
			</header>
			<main class="timer-main">
				<div class="time-display">{formatTime(state.remaining)}</div>
				<div class="progress-bar-container">
					<div class="progress-bar-fill" style="width: {progress}%"></div>
				</div>
			</main>
			<section class="focus-exercises">
				<h2>{workout.type === 'EMOM' ? 'This Minute:' : 'Complete This Round:'}</h2>
				<div class="exercise-list">
					{#each workout.exercises as exercise, i (exercise.id ?? exercise.name ?? i)}
						<div
							class="exercise-item"
							class:current={workout.type === 'EMOM' && i === state.currentStation}
						>
							<span>{exercise.name}</span>
							<span>{exercise.description}</span>
						</div>
					{/each}
				</div>
			</section>
			<footer class="control-row">
				<button class="secondary" on:click={openSetup}>Setup</button>
				<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}
					>{state.isRunning ? 'Pause' : 'Start'}</button
				>
				<button class="secondary" on:click={resetTimer}>Reset</button>
			</footer>
		</div>
	{/if}
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
                --surface-2: #1f2937;
                --surface-3: #374151;
                --text-primary: #f9fafb;
                --text-secondary: #9ca3af;
                --text-muted: #6b7280;
        }
	:global(body) {
		background-color: var(--bg-main);
		color: var(--text-primary);
		font-family: var(--font-body);
	}

	/* Shared Modal & Control Styles */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(17, 24, 39, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(8px);
		padding: 1.5rem;
	}
	.modal-content {
		background: var(--bg-panel);
		border: 1px solid var(--border-color);
		border-radius: 24px;
		padding: 2.5rem;
		max-width: 900px;
		width: 100%;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-height: 90vh;
	}
        .modal-content h2 {
                font-family: var(--font-display);
                color: var(--brand-yellow);
                letter-spacing: 0.08em;
        }
	.setup-form {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 1rem;
	}
        .form-group label {
                display: block;
                margin-bottom: 0.25rem;
                color: var(--text-muted);
                font-size: 0.75rem;
        }
        .form-group input {
                width: 100%;
                font-size: 1rem;
                padding: 0.5rem;
                border-radius: 6px;
                border: 1px solid var(--border-color);
                background: var(--bg-main);
                color: var(--text-primary);
        }
        .checkbox-group {
                align-self: flex-start;
        }
        .checkbox-group label {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 0.85rem;
                color: var(--text-primary);
        }
        .checkbox-group input[type='checkbox'] {
                width: auto;
                height: auto;
        }
        .form-group .input-hint {
                margin-top: 0.35rem;
                font-size: 0.75rem;
                color: var(--text-muted);
        }
	.assignment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		overflow-y: auto;
		max-height: 40vh;
		padding: 0.5rem;
	}
	.assignment-card {
		background: var(--bg-main);
		border-radius: 8px;
		padding: 0.75rem;
	}
	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}
	.control-row,
	.modal-actions {
		font-family: var(--font-body);
	}
	.control-row button,
	.modal-actions button {
		border-radius: 999px;
		font-size: 1rem;
		padding: 0.75rem 2rem;
		cursor: pointer;
		font-weight: 700;
		border: none;
	}
	.control-row button.secondary,
	.modal-actions button.secondary {
		background: var(--surface-2);
		color: var(--text-secondary);
	}
	.control-row button.primary,
	.modal-actions button.primary {
		background: var(--brand-green);
		color: var(--text-primary);
	}

	/* --- Circuit Layout Styles --- */
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
	.main-content {
		flex-grow: 1;
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 1.5rem;
		min-height: 0;
	}
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
        }
        .station-card__tasks {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
        }
        .task-line {
                display: flex;
                align-items: center;
                gap: 0.75rem;
        }
        .task-badge {
                font-size: 0.7rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                padding: 0.25rem 0.5rem;
                border-radius: 999px;
                background: var(--surface-2);
                color: var(--text-secondary);
                font-weight: 700;
        }
        .task-badge.partner-a {
                background: rgba(253, 224, 71, 0.15);
                color: var(--brand-yellow);
        }
        .task-badge.partner-b {
                background: rgba(34, 197, 94, 0.15);
                color: var(--brand-green);
        }
        .task-text {
                font-size: 0.95rem;
                color: var(--text-primary);
                flex: 1;
        }
	.station-card.current {
		border-color: var(--brand-yellow);
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
	.right-panel {
		background: var(--bg-panel);
		border-radius: 1rem;
		border: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 2rem;
	}
        .timer-main {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
        }
        .phase-display {
                font-family: var(--font-display);
                font-size: clamp(3rem, 10vw, 6rem);
        }
        .time-display {
                font-family: var(--font-display);
                font-size: clamp(10rem, 30vh, 20rem);
                line-height: 1;
        }
        .progress-bar-container {
                width: 100%;
                max-width: 700px;
                height: 6px;
                background: var(--bg-main);
                border-radius: 999px;
        }
        .progress-bar-fill {
                height: 100%;
                background: var(--brand-yellow);
        }
        .partner-callout {
                margin-top: 1.5rem;
                padding: 1rem 1.25rem;
                border-radius: 12px;
                background: rgba(15, 23, 42, 0.65);
                border: 1px solid rgba(253, 224, 71, 0.25);
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
                max-width: 480px;
        }
        .partner-callout .callout-title {
                font-size: 0.95rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--brand-yellow);
        }
        .partner-callout .callout-task {
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--text-primary);
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
		font-family: var(--font-display);
	}

	/* --- AMRAP/EMOM Layout Styles --- */
	.focus-timer-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 2rem;
		text-align: center;
		justify-content: space-between;
	}
	.focus-timer-layout .timer-main {
		margin: auto 0;
	}
	.focus-timer-layout .time-display {
		font-size: clamp(12rem, 40vh, 25rem);
	}
	.focus-exercises {
		max-width: 800px;
		margin: 0 auto;
		width: 100%;
	}
	.focus-exercises h2 {
		font-family: var(--font-display);
		font-size: 2rem;
		color: var(--brand-yellow);
		letter-spacing: 2px;
	}
	.exercise-list {
		margin-top: 1rem;
		background: var(--bg-panel);
		border-radius: 1rem;
		padding: 1.5rem;
	}
	.exercise-item {
		display: flex;
		justify-content: space-between;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--border-color);
	}
	.exercise-item:last-child {
		border-bottom: none;
	}
	.exercise-item.current {
		color: var(--brand-yellow);
		font-weight: bold;
	}
</style>
