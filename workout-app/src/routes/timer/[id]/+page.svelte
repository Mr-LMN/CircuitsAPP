<script>
// @ts-nocheck
import { onDestroy } from 'svelte';

export let data;
const { workout, sessionId } = data;
const urlOrigin = typeof window !== 'undefined' ? window.location.origin : '';

// --- Sound Functions ---
let audioCtx = null;
function getCtx() { return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) { try { const ctx = getCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000); o.start(); o.stop(ctx.currentTime + dur / 1000); } catch {} }
function whistleBell() { try { const ctx = getCtx(); for (let i = 0; i < 2; i += 1) { const g = ctx.createGain(); const t0 = ctx.currentTime + i * 0.15; g.connect(ctx.destination); g.gain.setValueAtTime(1e-4, t0); g.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2); const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator(); o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.setValueAtTime(620, t0); o2.frequency.setValueAtTime(930, t0); o1.connect(g); o2.connect(g); o1.start(t0); o2.start(t0); o1.stop(t0 + 1.25); o2.stop(t0 + 1.25); } } catch {} }
function countBeep(n) { const f = { 3: 520, 2: 680, 1: 940 }; tone(f[n] || 720, 180, 'sine', 0.35); }

// --- Session Config & Timer State ---
let sessionConfig = { work: 60, swap: 15, move: 15, rounds: 1 };
let state = {
phase: 'Ready', phaseIndex: -1, remaining: sessionConfig.work, duration: sessionConfig.work,
currentStation: 0, currentRound: 1, isRunning: false, isComplete: false, lastCue: 0
};
let timerId = null;
let isSetupVisible = false;
let showQr = false;

// --- Roster Logic ---
let totalStations = workout.exercises?.length ?? 0;
let stationAssignments = (workout.exercises ?? []).map(() => []);
let assignmentInputs = (workout.exercises ?? []).map(() => '');
function parseAssignments(value = '') { return value.split(/[\n,]/).map(c => c.trim()).filter(Boolean).map(c => c.toUpperCase()); }
function commitAllAssignments() {
stationAssignments = stationAssignments.map((codes, i) => parseAssignments(assignmentInputs[i] ?? codes.join(', ')));
assignmentInputs = stationAssignments.map(codes => codes.join(', '));
}

// --- Reactive Derivations ---
$: movesCompleted = totalStations > 0 ? (state.currentRound - 1) * totalStations + state.currentStation : 0;
$: stationRoster = (workout.exercises ?? []).map((_, targetIndex) => {
if (!totalStations) return []; const roster = [];
stationAssignments.forEach((codes, startIndex) => { if (codes?.length) { const dest = (startIndex + movesCompleted) % totalStations; if (dest === targetIndex) roster.push(...codes); } });
return roster;
});
$: progress = state.duration > 0 ? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100)) : 0;
$: totalTime = totalStations > 0 ? Math.round(((sessionConfig.work * 2 + sessionConfig.swap + sessionConfig.move) * totalStations * sessionConfig.rounds) / 60) : 0;
$: startButtonLabel = state.isRunning ? 'Pause' : state.phaseIndex >= 0 && !state.isComplete ? 'Resume' : 'Start';

// --- Timer Core Functions ---
function advancePhase() {
if (state.isComplete || !totalStations) return;
state.lastCue = 0; const nextPhaseIndex = state.phaseIndex + 1;
if (workout.mode === 'Partner') {
if (nextPhaseIndex === 0) { state.phaseIndex = 0; state.phase = 'WORK 1'; state.remaining = state.duration = sessionConfig.work; whistleBell(); } 
else if (nextPhaseIndex === 1) { state.phaseIndex = 1; state.phase = 'SWAP'; state.remaining = state.duration = sessionConfig.swap; tone(420, 160); } 
else if (nextPhaseIndex === 2) { state.phaseIndex = 2; state.phase = 'WORK 2'; state.remaining = state.duration = sessionConfig.work; whistleBell(); } 
else if (nextPhaseIndex === 3) { state.phaseIndex = 3; state.phase = 'MOVE'; state.remaining = state.duration = sessionConfig.move; tone(420, 160); } 
else {
state.currentStation++;
if (state.currentStation >= totalStations) { state.currentStation = 0; state.currentRound++; if (state.currentRound > sessionConfig.rounds) { workoutComplete(); return; } }
state.phaseIndex = 0; state.phase = 'WORK 1'; state.remaining = state.duration = sessionConfig.work; whistleBell();
}
} else { // Fallback logic for Individual workouts
state.currentStation++;
if (state.currentStation >= totalStations) { workoutComplete(); return; }
state.phase = `Round ${state.currentStation + 1}`; state.remaining = state.duration = sessionConfig.work; whistleBell();
}
}
function tick() { state.remaining -= 0.1; const secs = Math.ceil(state.remaining); if (secs <= 3 && secs >= 1 && secs !== state.lastCue) { state.lastCue = secs; countBeep(secs); } if (state.remaining <= 0) { advancePhase(); } state = state; }
function startTimer() { if (state.isComplete || state.isRunning || totalStations === 0) return; if (state.phaseIndex === -1) { advancePhase(); } state.isRunning = true; timerId = setInterval(tick, 100); commitAllAssignments(); }
function pauseTimer() { if (!state.isRunning) return; state.isRunning = false; clearInterval(timerId); }
function resetTimer() { pauseTimer(); state.phase = 'Ready'; state.phaseIndex = -1; state.remaining = sessionConfig.work; state.duration = sessionConfig.work; state.currentStation = 0; state.currentRound = 1; state.isComplete = false; state = state; }
function workoutComplete() { pauseTimer(); state.phase = 'SESSION COMPLETE!'; state.isComplete = true; state = state; whistleBell(); }

function openSetup() { pauseTimer(); isSetupVisible = true; }
function closeSetup() { commitAllAssignments(); isSetupVisible = false; }
function formatTime(s) { const secs = Math.max(0, Math.ceil(s)); return (String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')); }

// NEW: Functions for new control buttons
function skipPhase() {
if (state.isComplete || state.phaseIndex === -1) return;
const wasRunning = state.isRunning;
pauseTimer();
advancePhase();
if (wasRunning && !state.isComplete) { startTimer(); }
}
function finishWorkout() {
if (state.phaseIndex === -1) return;
workoutComplete();
}

onDestroy(() => clearInterval(timerId));
</script>

<svelte:head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
</svelte:head>

{#if isSetupVisible}
<div class="modal-overlay" on:click|self={closeSetup}>
<div class="modal-content setup-modal">
<header class="modal-header">
<div>
<h2>Session Setup</h2>
<p>Adjust timing and assign staff before starting the clock.</p>
</div>
<button class="close-btn" on:click={closeSetup} aria-label="Close setup">×</button>
</header>
<section class="modal-section">
<h3>Timing</h3>
<div class="timing-grid">
<label for="setup-work">Work (seconds)<input id="setup-work" type="number" min="1" bind:value={sessionConfig.work} /></label>
<label for="setup-swap">Swap (seconds)<input id="setup-swap" type="number" min="0" bind:value={sessionConfig.swap} disabled={workout.mode !== 'Partner'} /></label>
<label for="setup-move">Move (seconds)<input id="setup-move" type="number" min="0" bind:value={sessionConfig.move} /></label>
<label for="setup-rounds">Rounds<input id="setup-rounds" type="number" min="1" bind:value={sessionConfig.rounds} /></label>
</div>
</section>
<section class="modal-section">
<h3>Station Roster</h3>
<p class="modal-help">Enter member or staff initials separated by commas. We'll rotate them through the circuit automatically.</p>
<div class="assignment-grid">
{#each workout.exercises as station, i (station.id ?? i)}
<div class="assignment-card">
<header>
<span class="station-pill">Station {i + 1}</span>
<h4>{station.name}</h4>
</header>
<input id={`assignment-${i}`} placeholder="e.g. LMN, DVE" bind:value={assignmentInputs[i]} on:blur={commitAllAssignments} />
</div>
{/each}
</div>
</section>
<div class="modal-actions"><button class="ghost" on:click={closeSetup}>Done</button></div>
</div>
</div>
{/if}
{#if showQr && sessionId}
<div class="modal-overlay" on:click|self={() => showQr = false}>
<div class="modal-content qr-modal">
<button class="modal-close" type="button" aria-label="Close QR code" on:click={() => showQr = false}>&times;</button>
<h2>Scan to Join Live Session</h2>
<p>Members can scan this with their phone to join.</p>
<img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${urlOrigin}/join/${sessionId}`)}`} alt="QR Code to join session" />
</div>
</div>
{/if}

<div class="mission-control" class:blur={isSetupVisible || showQr}>
<header class="setup-panel">
<div class="logo">
<span class="title">{workout.title}</span>
<span class="mode-chip">{workout.mode}</span>
</div>
<div class="session-highlights">
<div class="highlight"><span class="label">Work</span><span class="value">{sessionConfig.work}s</span></div>
{#if workout.mode === 'Partner'}
<div class="highlight"><span class="label">Swap</span><span class="value">{sessionConfig.swap}s</span></div>
{/if}
<div class="highlight"><span class="label">Move</span><span class="value">{sessionConfig.move}s</span></div>
<div class="highlight"><span class="label">Rounds</span><span class="value">{sessionConfig.rounds}</span></div>
</div>
<div class="header-actions">
<button class="ghost" on:click={openSetup}>Setup</button>
<button class="ghost" on:click={() => showQr = true} disabled={!sessionId}>QR Code</button>
</div>
</header>
<main class="main-content">
<div class="left-panel">
<div class="station-grid">
{#each workout.exercises as station, i (station.id ?? i)}
<article class="station-card" class:current={i === state.currentStation}>
<header class="station-card__header">
<span class="station-number">{i + 1}</span><h3>{station.name}</h3>
</header>
<div class="station-card__tasks">
<div class="task-line"><span class="task-label p1">P1</span><span class="task-text">{station.p1?.task || station.p1_task || station.name}</span></div>
{#if station.p2?.task || station.p2_task}<div class="task-line"><span class="task-label p2">P2</span><span class="task-text">{station.p2?.task || station.p2_task}</span></div>{/if}
</div>
<footer class="station-card__roster">
<div class="roster-chips">
{#if stationRoster[i]?.length}
{#each stationRoster[i] as code, codeIndex (`${code}-${codeIndex}`)}<span>{code}</span>{/each}
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
<div class="progress-bar-container"><div class="progress-bar-fill" style="width: {progress}%"></div></div>
</main>
<footer class="timer-footer">
<div class="meta-info">
<span>Station {Math.min(state.currentStation + 1, totalStations)}/{totalStations}</span>
<span>Round {Math.min(state.currentRound, sessionConfig.rounds)}/{sessionConfig.rounds}</span>
<span>Total: ~{totalTime} min</span>
</div>
<div class="control-row">
<button class="secondary" on:click={resetTimer}>Reset</button>
<button class="secondary" on:click={skipPhase} disabled={state.phaseIndex === -1 || state.isComplete}>Skip</button>
<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}>{startButtonLabel}</button>
<button class="secondary finish" on:click={finishWorkout} disabled={state.phaseIndex === -1 || state.isComplete}>Finish</button>
</div>
</footer>
</div>
</main>
</div>

<style>
:root { --font-body: 'Inter', sans-serif; --font-display: 'Bebas Neue', sans-serif; --brand-yellow: #fde047; --brand-green: #16a34a; --bg-main: #0f172a; --bg-panel: #111c32; --surface-1: rgba(255, 255, 255, 0.06); --surface-2: rgba(255, 255, 255, 0.08); --surface-3: rgba(255, 255, 255, 0.12); --border-color: rgba(255, 255, 255, 0.08); --text-primary: #f9fafb; --text-secondary: #cbd5f5; --text-muted: #94a3b8; }
:global(body) { background-color: var(--bg-main); color: var(--text-primary); font-family: var(--font-body); }
.blur { filter: blur(8px); }

/* Modals */
.modal-overlay { position: fixed; inset: 0; background: rgba(3, 7, 18, 0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(10px); padding: 1.5rem; }
.modal-content { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 24px; padding: 2rem 2.5rem; width: 100%; box-shadow: 0 35px 80px -20px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 1.75rem; max-height: 92vh; max-width: 960px; overflow: hidden; }
.modal-content { position: relative; }
.setup-modal { overflow: hidden; }
.modal-close { position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; color: var(--text-secondary); font-size: 2rem; line-height: 1; cursor: pointer; }
.modal-close:hover { color: var(--text-primary); }
.qr-modal { align-items: center; text-align: center; }
.modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; }
.modal-header h2 { font-family: var(--font-display); color: var(--brand-yellow); font-size: 2.5rem; letter-spacing: 1px; margin: 0; }
.modal-header p { margin: 0.35rem 0 0; color: var(--text-secondary); }
.close-btn { width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--surface-3); color: var(--text-primary); font-size: 1.75rem; line-height: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.modal-section { display: flex; flex-direction: column; gap: 1rem; }
.modal-section h3 { font-family: var(--font-display); letter-spacing: 1px; font-size: 1.5rem; margin: 0; color: var(--text-secondary); }
.modal-help { color: var(--text-muted); margin: 0; font-size: 0.9rem; }
.timing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
.timing-grid label { display: flex; flex-direction: column; gap: 0.5rem; background: var(--surface-1); padding: 1rem; border-radius: 14px; border: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.timing-grid input { font-size: 1.2rem; font-weight: 700; background: transparent; border: none; outline: none; color: var(--text-primary); }
.assignment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; overflow-y: auto; padding-right: 0.5rem; max-height: 40vh; }
.assignment-card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.assignment-card header { display: flex; flex-direction: column; gap: 0.25rem; }
.assignment-card h4 { margin: 0; font-size: 1rem; color: var(--text-primary); }
.assignment-card input { width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(15, 23, 42, 0.4); color: var(--text-primary); font-size: 0.95rem; }
.station-pill { align-self: flex-start; background: var(--surface-3); color: var(--brand-yellow); font-weight: 600; padding: 0.2rem 0.75rem; border-radius: 999px; font-size: 0.75rem; letter-spacing: 0.08em; }
.modal-actions { display: flex; justify-content: flex-end; }
.modal-actions .ghost { border-radius: 999px; font-size: 1rem; padding: 0.75rem 2.25rem; cursor: pointer; font-weight: 700; border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); }
.qr-modal { text-align: center; max-width: 420px; }
.qr-modal img { background: white; padding: 1rem; border-radius: 12px; margin-top: 1rem; max-width: 100%; height: auto; }

/* Main Layout */
.mission-control { display: flex; flex-direction: column; min-height: 100vh; padding: clamp(1rem, 2vw, 1.75rem); gap: 1.5rem; }
.setup-panel { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(30, 58, 138, 0.35)); padding: 1.5rem 1.75rem; border-radius: 1.25rem; border: 1px solid var(--border-color); box-shadow: 0 20px 40px -25px rgba(8, 47, 73, 0.8); gap: 1.5rem; }
.logo { display: flex; flex-direction: column; gap: 0.35rem; }
.title { font-family: var(--font-display); font-size: clamp(2rem, 3vw, 2.6rem); color: var(--brand-yellow); letter-spacing: 0.08em; text-transform: uppercase; }
.mode-chip { align-self: flex-start; background: rgba(255, 255, 255, 0.12); color: var(--text-secondary); font-size: 0.75rem; letter-spacing: 0.12em; padding: 0.25rem 0.65rem; border-radius: 999px; text-transform: uppercase; }
.session-highlights { display: flex; gap: 1rem; align-items: center; }
.highlight { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.75rem 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; min-width: 100px; }
.highlight .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-muted); }
.highlight .value { font-family: var(--font-display); font-size: 1.5rem; letter-spacing: 0.05em; }
.header-actions { display: flex; gap: 0.75rem; }
.ghost { background: transparent; border-radius: 999px; padding: 0.65rem 1.4rem; border: 1px solid var(--border-color); color: var(--text-secondary); font-weight: 600; letter-spacing: 0.05em; cursor: pointer; transition: all 160ms ease; }
.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.ghost:not(:disabled):hover { background: var(--surface-2); color: var(--text-primary); }
.main-content { flex-grow: 1; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.5rem; min-height: 0; align-items: stretch; }

/* Left Panel */
.left-panel { background: var(--bg-panel); border-radius: 1rem; border: 1px solid var(--border-color); padding: clamp(1rem, 2vw, 1.5rem); overflow-y: auto; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02); }
.station-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.station-card { background: radial-gradient(circle at top left, rgba(148, 163, 184, 0.1), transparent 70%); border: 1px solid var(--border-color); border-radius: 16px; padding: clamp(0.9rem, 1.2vw, 1.2rem); display: flex; flex-direction: column; gap: 0.75rem; transition: all 200ms ease; position: relative; overflow: hidden; min-height: 100%; }
.station-card::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04); }
.station-card.current { border-color: rgba(253, 224, 71, 0.8); box-shadow: 0 0 30px rgba(253, 224, 71, 0.25); transform: translateY(-4px); }
.station-card__header { display: flex; align-items: center; gap: 0.75rem; }
.station-number { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-2); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.95rem; flex-shrink: 0; }
.station-card.current .station-number { background: var(--brand-yellow); color: var(--bg-main); }
.station-card h3 { margin: 0; font-size: 1.05rem; font-weight: 600; letter-spacing: 0.02em; }
.station-card__tasks { display: flex; flex-direction: column; gap: 0.35rem; }
.task-line { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); }
.task-label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.1em; }
.task-text { color: var(--text-secondary); }
.station-card__roster { margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--border-color); }
.roster-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.roster-chips span { padding: 0.2rem 0.5rem; border-radius: 6px; background: rgba(99, 102, 241, 0.18); color: #c7d2fe; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; }
.roster-empty { color: var(--text-muted); font-size: 0.75rem; }

/* Right Panel */
.right-panel { background: radial-gradient(circle at top right, rgba(96, 165, 250, 0.15), rgba(15, 23, 42, 0.6)); border-radius: 1.25rem; border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: clamp(2rem, 4vw, 3rem) clamp(1.5rem, 3vw, 2.5rem); box-shadow: 0 30px 60px -30px rgba(37, 99, 235, 0.6); position: relative; overflow: hidden; }
.right-panel::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at center, rgba(59, 130, 246, 0.15), transparent 65%); opacity: 0.7; pointer-events: none; }
.timer-main { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; position: relative; z-index: 1; }
.phase-display { font-family: var(--font-display); font-size: clamp(2.75rem, min(6vw, 9vh), 7rem); letter-spacing: clamp(0.15rem, 0.5vw, 0.35rem); line-height: 1; text-transform: uppercase; color: var(--text-secondary); }
.time-display { font-family: var(--font-display); font-size: clamp(8rem, min(18vw, 32vh), 22rem); line-height: 1; margin: clamp(0.75rem, 2vh, 1.5rem) 0; color: var(--text-primary); text-shadow: 0 8px 25px rgba(0, 0, 0, 0.4); }
.progress-bar-container { width: min(100%, 720px); height: clamp(6px, 0.9vh, 10px); background: rgba(15, 23, 42, 0.6); border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); margin-inline: auto; }
.progress-bar-fill { height: 100%; background: linear-gradient(90deg, #fde047, #f97316); box-shadow: 0 0 15px rgba(250, 204, 21, 0.5); }
.timer-footer { width: 100%; margin-top: auto; padding-top: 1rem; position: relative; z-index: 1; }
.meta-info { display: flex; justify-content: center; gap: clamp(1rem, 4vw, 2.5rem); margin-bottom: clamp(0.75rem, 2vh, 1.5rem); color: var(--text-secondary); font-size: clamp(0.9rem, 2vw, 1.2rem); font-family: var(--font-display); letter-spacing: clamp(0.1em, 0.6vw, 0.25em); text-transform: uppercase; flex-wrap: wrap; row-gap: 0.5rem; }
.control-row { display: flex; justify-content: center; gap: clamp(0.75rem, 2vw, 1.25rem); flex-wrap: wrap; }
.control-row button { border-radius: 999px; font-size: clamp(1rem, 2vw, 1.2rem); padding: clamp(0.75rem, 2vh, 1rem) clamp(1.75rem, 4vw, 2.5rem); cursor: pointer; font-weight: 700; border: none; min-width: clamp(120px, 20vw, 150px); transition: transform 140ms ease, box-shadow 140ms ease; }
.control-row button.secondary { background: rgba(15, 23, 42, 0.65); color: var(--text-secondary); border: 1px solid var(--border-color); }
.control-row button.secondary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 20px -14px rgba(148, 163, 184, 0.8); }
.control-row button.primary { background: var(--brand-green); color: var(--text-primary); box-shadow: 0 18px 35px -18px rgba(22, 163, 74, 0.8); }
.control-row button.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 24px 45px -20px rgba(22, 163, 74, 0.9); }
.control-row button:disabled { opacity: 0.5; cursor: not-allowed; }
.control-row button.finish { border-color: #ef4444; color: #ef4444; background: transparent; }
.control-row button.finish:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 20px 35px -22px rgba(239, 68, 68, 0.85); }

@media (max-width: 1200px) { .main-content { grid-template-columns: minmax(0, 1fr); } .session-highlights { flex-wrap: wrap; } }
@media (max-width: 900px) { .mission-control { padding: 1rem; } .left-panel { max-height: 50vh; } .setup-panel { flex-direction: column; gap: 1.25rem; align-items: stretch; } .header-actions { width: 100%; justify-content: flex-end; } .session-highlights { width: 100%; justify-content: flex-start; flex-wrap: wrap; } }
</style>
