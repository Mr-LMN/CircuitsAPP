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

        // --- Station assignment helpers ---
        let totalStations = workout.exercises?.length ?? 0;
        $: totalStations = workout.exercises?.length ?? 0;

        let stationAssignments = (workout.exercises ?? []).map(() => []);
        let assignmentInputs = (workout.exercises ?? []).map(() => '');

        $: if ((workout.exercises?.length ?? 0) !== stationAssignments.length) {
                const base = workout.exercises ?? [];
                stationAssignments = base.map((_, index) => stationAssignments[index] ?? []);
                assignmentInputs = base.map(
                        (_, index) =>
                                assignmentInputs[index] ?? stationAssignments[index]?.join(', ') ?? ''
                );
        }

        function parseAssignments(value = '') {
                return value
                        .split(/[\n,]/)
                        .map((code) => code.trim())
                        .filter(Boolean)
                        .map((code) => code.toUpperCase());
        }

        function updateAssignmentInput(index, value) {
                assignmentInputs = assignmentInputs.map((input, i) => (i === index ? value : input));
                const parsed = parseAssignments(value);
                stationAssignments = stationAssignments.map((codes, i) => (i === index ? parsed : codes));
        }

        function commitAssignmentInput(index) {
                const parsed = parseAssignments(assignmentInputs[index] ?? '');
                stationAssignments = stationAssignments.map((codes, i) => (i === index ? parsed : codes));
                assignmentInputs = assignmentInputs.map((input, i) =>
                        i === index ? parsed.join(', ') : input
                );
        }

        function commitAllAssignments() {
                stationAssignments = stationAssignments.map((codes, index) =>
                        parseAssignments(assignmentInputs[index] ?? codes.join(', '))
                );
                assignmentInputs = stationAssignments.map((codes) => codes.join(', '));
        }

        $: movesCompleted =
                totalStations > 0
                        ? (state.currentRound - 1) * totalStations + state.currentStation
                        : 0;

        $: stationRoster = (workout.exercises ?? []).map((_, targetIndex) => {
                if (!totalStations) return [];
                const roster = [];
                stationAssignments.forEach((codes, startIndex) => {
                        if (!codes?.length) return;
                        const destination = (startIndex + movesCompleted) % totalStations;
                        if (destination === targetIndex) {
                                roster.push(...codes);
                        }
                });
                return roster;
        });

        $: nextStationRoster = (workout.exercises ?? []).map((_, targetIndex) => {
                if (!totalStations) return [];
                const roster = [];
                stationAssignments.forEach((codes, startIndex) => {
                        if (!codes?.length) return;
                        const destination = (startIndex + movesCompleted + 1) % totalStations;
                        if (destination === targetIndex) {
                                roster.push(...codes);
                        }
                });
                return roster;
        });

        $: nextStationIndex = totalStations > 0 ? (state.currentStation + 1) % totalStations : 0;

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
                commitAllAssignments();
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
                        <div class="assignment-setup">
                                <div class="assignment-setup__header">
                                        <h3>Starting Positions</h3>
                                        <p>Enter staff initials where each person begins. They rotate automatically every move.</p>
                                </div>
                                <div class="assignment-grid">
                                        {#each workout.exercises as station, i (station.id ?? station.name ?? i)}
                                                <div class="assignment-card">
                                                        <label for={`assignment-${i}`}>
                                                                Station {i + 1}: {station.name}
                                                        </label>
                                                        <input
                                                                id={`assignment-${i}`}
                                                                placeholder="e.g. AB, CD"
                                                                bind:value={assignmentInputs[i]}
                                                                on:input={(event) => updateAssignmentInput(i, event.target.value)}
                                                                on:blur={() => commitAssignmentInput(i)}
                                                        />
                                                        {#if stationAssignments[i]?.length}
                                                                <div class="assignment-preview">
                                                                        {#each stationAssignments[i] as code, codeIndex (`${i}-${codeIndex}-${code}`)}
                                                                                <span class="assignment-chip">{code}</span>
                                                                        {/each}
                                                                </div>
                                                        {/if}
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
	{#if workout.mode === 'Partner' && workout.type === 'Circuit'}
		<div class="partner-circuit-layout">
                        <div class="left-panel">
                                <div class="left-panel-header">
                                        <h2>Stations</h2>
                                        <div class="legend">
                                                <span><span class="legend-dot current"></span>Current</span>
                                                <span><span class="legend-dot next"></span>Next Up</span>
                                        </div>
                                </div>
                                <div class="station-list" bind:this={stationListEl}>
                                        {#each workout.exercises as station, i (station.id ?? station.name ?? i)}
                                                <div
                                                        class="station-item"
                                                        class:current={i === state.currentStation}
                                                        data-index={i}
                                                >
                                                        <div class="station-header">
                                                                <div class="station-number">{i + 1}</div>
                                                                <div class="station-title">
                                                                        <h3>{station.name}</h3>
                                                                </div>
                                                        </div>
                                                        <div class="station-body">
                                                                <div class="task-line">
                                                                        <span class="task-label p1">P1</span>
                                                                        <span class="task-text">{station.p1_task}</span>
                                                                </div>
                                                                <div class="task-line">
                                                                        <span class="task-label p2">P2</span>
                                                                        <span class="task-text">{station.p2_task}</span>
                                                                </div>
                                                        </div>
                                                        <div class="station-assignments">
                                                                <div class="assignment-row current" class:active={i === state.currentStation}>
                                                                        <span class="assignment-title">Now</span>
                                                                        <div class="assignment-chips">
                                                                                {#if stationRoster[i]?.length}
                                                                                        {#each stationRoster[i] as code, codeIndex (`current-${i}-${codeIndex}-${code}`)}
                                                                                                <span class="assignment-chip">{code}</span>
                                                                                        {/each}
                                                                                {:else}
                                                                                        <span class="assignment-empty">Open</span>
                                                                                {/if}
                                                                        </div>
                                                                </div>
                                                                {#if !state.isComplete}
                                                                        <div
                                                                                class="assignment-row next"
                                                                                class:move-target={state.phaseIndex === 3 && i === nextStationIndex}
                                                                        >
                                                                                <span class="assignment-title">Next</span>
                                                                                <div class="assignment-chips">
                                                                                        {#if nextStationRoster[i]?.length}
                                                                                                {#each nextStationRoster[i] as code, codeIndex (`next-${i}-${codeIndex}-${code}`)}
                                                                                                        <span class="assignment-chip">{code}</span>
                                                                                                {/each}
                                                                                        {:else}
                                                                                                <span class="assignment-empty">Open</span>
                                                                                        {/if}
                                                                                </div>
                                                                        </div>
                                                                {:else}
                                                                        <div class="assignment-row next">
                                                                                <span class="assignment-title">Next</span>
                                                                                <span class="assignment-empty">Session complete</span>
                                                                        </div>
                                                                {/if}
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
                                        <div class="station-roster-glance">
                                                <div class="roster-card">
                                                        <p class="roster-title">Now at Station {state.currentStation + 1}</p>
                                                        {#if stationRoster[state.currentStation]?.length}
                                                                <div class="assignment-chips">
                                                                        {#each stationRoster[state.currentStation] as code, codeIndex (`active-${codeIndex}-${code}`)}
                                                                                <span class="assignment-chip">{code}</span>
                                                                        {/each}
                                                                </div>
                                                        {:else}
                                                                <p class="assignment-empty">No staff assigned</p>
                                                        {/if}
                                                </div>
                                                {#if !state.isComplete && totalStations > 0}
                                                        <div class="roster-card" class:move-phase={state.phaseIndex === 3}>
                                                                <p class="roster-title">Heading to Station {nextStationIndex + 1}</p>
                                                                {#if nextStationRoster[nextStationIndex]?.length}
                                                                        <div class="assignment-chips">
                                                                                {#each nextStationRoster[nextStationIndex] as code, codeIndex (`upnext-${codeIndex}-${code}`)}
                                                                                        <span class="assignment-chip">{code}</span>
                                                                                {/each}
                                                                        </div>
                                                                {:else}
                                                                        <p class="assignment-empty">No rotation assigned</p>
                                                                {/if}
                                                        </div>
                                                {/if}
                                        </div>
                                </main>
                                <footer class="timer-controls">
                                        <button class="secondary" on:click={openSetup}>Setup</button>
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
                max-width: 720px;
                width: min(94vw, 720px);
                text-align: left;
                box-shadow: 0 30px 70px rgba(0, 0, 0, 0.45);
                display: flex;
                flex-direction: column;
                gap: 1.75rem;
                max-height: min(90vh, 820px);
                overflow-y: auto;
        }
        .modal-content h2 {
                color: var(--yellow);
                margin: 0;
                font-size: 2rem;
                letter-spacing: 0.08em;
        }
        .modal-content p {
                color: rgba(255, 255, 255, 0.72);
                margin: 0;
        }
        .setup-form {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 1.25rem;
                margin-top: 1.5rem;
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
        .assignment-setup {
                display: flex;
                flex-direction: column;
                gap: 1rem;
        }
        .assignment-setup__header h3 {
                margin: 0;
                color: var(--yellow);
                font-size: 1.25rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
        }
        .assignment-setup__header p {
                color: rgba(255, 255, 255, 0.6);
                font-size: 0.9rem;
                line-height: 1.5;
        }
        .assignment-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 1rem;
                max-height: clamp(220px, 45vh, 420px);
                overflow-y: auto;
                padding-right: 0.5rem;
        }
        .assignment-card {
                background: rgba(14, 20, 17, 0.85);
                border: 1px solid rgba(102, 255, 153, 0.12);
                border-radius: 12px;
                padding: 1rem 1.25rem;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                box-shadow: 0 15px 30px rgba(0, 0, 0, 0.35);
        }
        .assignment-card label {
                font-size: 0.85rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: rgba(255, 255, 255, 0.65);
        }
        .assignment-card input {
                width: 100%;
                padding: 0.65rem 0.75rem;
                border-radius: 8px;
                border: 1px solid rgba(102, 255, 153, 0.18);
                background: rgba(9, 13, 11, 0.9);
                color: white;
                font-size: 0.95rem;
                letter-spacing: 0.06em;
        }
        .assignment-card input:focus {
                outline: none;
                border-color: var(--yellow);
                box-shadow: 0 0 0 3px rgba(255, 214, 10, 0.2);
        }
        .assignment-preview {
                display: flex;
                flex-wrap: wrap;
                gap: 0.35rem;
        }
        .modal-actions {
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
                flex-wrap: wrap;
        }
        .modal-actions button {
                border-radius: 10px;
                font-size: 1rem;
                padding: 0.85rem 1.75rem;
                cursor: pointer;
                font-weight: 600;
                letter-spacing: 0.06em;
                transition:
                        transform 0.2s ease,
                        box-shadow 0.2s ease,
                        background-color 0.2s ease;
        }
        .modal-actions button.primary {
                border: none;
                background: linear-gradient(135deg, var(--green), #0c8b63);
                color: var(--yellow);
                box-shadow: 0 15px 45px rgba(6, 95, 70, 0.45);
        }
        .modal-actions button.primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 25px 55px rgba(6, 95, 70, 0.55);
        }
        .modal-actions button.secondary {
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: rgba(15, 20, 17, 0.85);
                color: rgba(255, 255, 255, 0.82);
        }
        .modal-actions button.secondary:hover {
                transform: translateY(-2px);
                box-shadow: 0 18px 35px rgba(0, 0, 0, 0.35);
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
        .left-panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                margin-bottom: 1.5rem;
        }
        .left-panel h2 {
                color: var(--yellow);
                margin: 0;
                font-size: 1.5rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
        }
        .legend {
                display: flex;
                gap: 0.75rem;
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: rgba(255, 255, 255, 0.55);
        }
        .legend span {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
        }
        .legend-dot {
                width: 0.65rem;
                height: 0.65rem;
                border-radius: 50%;
                display: inline-block;
        }
        .legend-dot.current {
                background: var(--yellow);
                box-shadow: 0 0 0 3px rgba(255, 214, 10, 0.25);
        }
        .legend-dot.next {
                background: rgba(122, 245, 198, 0.85);
                box-shadow: 0 0 0 3px rgba(122, 245, 198, 0.25);
        }
        .station-list {
                overflow-y: auto;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                gap: 1rem;
                padding-right: 0.5rem;
                scroll-behavior: smooth;
                align-content: start;
        }
        .station-item {
                display: flex;
                flex-direction: column;
                gap: 1rem;
                background: rgba(20, 30, 25, 0.85);
                padding: 1.1rem 1.25rem;
                border-radius: 16px;
                border: 1px solid rgba(102, 255, 153, 0.08);
                transition:
                        transform 0.2s ease,
                        border-color 0.2s ease,
                        box-shadow 0.2s ease;
                min-height: 190px;
        }
        .station-item.current {
                border-color: var(--yellow);
                transform: translateY(-4px);
                box-shadow: 0 16px 40px rgba(255, 214, 10, 0.18);
                background: rgba(32, 45, 38, 0.95);
        }
        .station-header {
                display: flex;
                align-items: center;
                gap: 0.9rem;
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
                flex-shrink: 0;
        }
        .station-title h3 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 600;
        }
        .station-body {
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
        }
        .task-line {
                display: flex;
                align-items: flex-start;
                gap: 0.5rem;
        }
        .task-label {
                width: 32px;
                height: 32px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                font-weight: 700;
                letter-spacing: 0.1em;
        }
        .task-label.p1 {
                background: rgba(122, 245, 198, 0.2);
                color: #7af5c6;
                border: 1px solid rgba(122, 245, 198, 0.45);
        }
        .task-label.p2 {
                background: rgba(249, 168, 212, 0.2);
                color: #fbcfe8;
                border: 1px solid rgba(249, 168, 212, 0.45);
        }
        .task-text {
                color: rgba(230, 240, 232, 0.86);
                font-size: 0.95rem;
                line-height: 1.45;
        }
        .station-assignments {
                display: flex;
                flex-direction: column;
                gap: 0.45rem;
        }
        .assignment-row {
                display: flex;
                align-items: center;
                gap: 0.65rem;
        }
        .assignment-title {
                font-size: 0.75rem;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.55);
                min-width: 3.5rem;
        }
        .assignment-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 0.35rem;
        }
        .assignment-chip {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.25rem 0.6rem;
                border-radius: 999px;
                border: 1px solid rgba(102, 255, 153, 0.35);
                background: rgba(102, 255, 153, 0.12);
                color: #eafff3;
                font-size: 0.75rem;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
        }
        .assignment-empty {
                font-size: 0.7rem;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.4);
        }
        .assignment-row.current.active .assignment-title,
        .assignment-row.current.active .assignment-chip {
                color: var(--yellow);
        }
        .assignment-row.current.active .assignment-chip {
                background: rgba(255, 214, 10, 0.2);
                border-color: rgba(255, 214, 10, 0.4);
                box-shadow: 0 0 20px rgba(255, 214, 10, 0.18);
        }
        .assignment-row.next .assignment-chip {
                border-color: rgba(122, 245, 198, 0.3);
                background: rgba(122, 245, 198, 0.12);
                color: rgba(224, 255, 241, 0.9);
        }
        .assignment-row.next.move-target .assignment-title,
        .assignment-row.next.move-target .assignment-chip {
                color: rgba(122, 245, 198, 0.95);
        }
        .assignment-row.next.move-target .assignment-chip {
                border-color: rgba(122, 245, 198, 0.55);
                background: rgba(122, 245, 198, 0.24);
                box-shadow: 0 0 18px rgba(122, 245, 198, 0.25);
        }

        .station-roster-glance {
                width: 100%;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 1rem;
        }
        .roster-card {
                background: rgba(15, 24, 19, 0.82);
                border: 1px solid rgba(102, 255, 153, 0.12);
                border-radius: 14px;
                padding: 1.1rem 1.25rem;
                text-align: left;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
        }
        .roster-card.move-phase {
                border-color: rgba(122, 245, 198, 0.38);
                box-shadow: 0 16px 45px rgba(122, 245, 198, 0.22);
        }
        .roster-title {
                margin: 0;
                font-size: 0.85rem;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: rgba(255, 255, 255, 0.65);
        }
        .roster-card.move-phase .roster-title {
                color: rgba(122, 245, 198, 0.88);
        }
        .roster-card .assignment-chips {
                gap: 0.45rem;
        }
        .roster-card .assignment-empty {
                margin: 0;
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
        .timer-controls button.secondary {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.18);
                color: rgba(255, 255, 255, 0.82);
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
                .station-list {
                        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                }
                .station-item {
                        min-height: 0;
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
                .assignment-grid {
                        grid-template-columns: 1fr;
                        max-height: 280px;
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
                .station-list {
                        grid-template-columns: 1fr;
                }
                .right-panel {
                        padding: 1.75rem;
                }
                .timer-controls button {
                        width: 100%;
		}
	}
</style>
