<script>
// @ts-nocheck
import { onDestroy } from 'svelte';
import { goto } from '$app/navigation';

export let data;
const { workout } = data;

// --- Sound Imports & Functions (No Change) ---
let audioCtx = null;
function getCtx() { return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) { try { const ctx = getCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000); o.start(); o.stop(ctx.currentTime + dur / 1000); } catch (e) {} }
function whistleBell() { try { const ctx = getCtx(); for (let i = 0; i < 2; i += 1) { const g = ctx.createGain(); const t0 = ctx.currentTime + i * 0.15; g.connect(ctx.destination); g.gain.setValueAtTime(1e-4, t0); g.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2); const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator(); o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.setValueAtTime(620, t0); o2.frequency.setValueAtTime(930, t0); o1.connect(g); o2.connect(g); o1.start(t0); o2.start(t0); o1.stop(t0 + 1.25); o2.stop(t0 + 1.25); } } catch (e) {} }
function countBeep(n) { const f = { 3: 520, 2: 680, 1: 940 }; tone(f[n] || 720, 180, 'sine', 0.35); }

// --- Session Setup & Timer State (No Change) ---
let isSetupVisible = true;
let sessionConfig = { work: 60, swap: 15, move: 15, rounds: 1 };
let state = {
phase: 'Ready', phaseIndex: -1, remaining: sessionConfig.work, duration: sessionConfig.work,
currentStation: 0, currentRound: 1, isRunning: false, isComplete: false, lastCue: 0
};
let timerId = null;

// --- Staff Roster Logic (No Change) ---
let totalStations = workout.exercises?.length ?? 0;
let stationAssignments = (workout.exercises ?? []).map(() => []);
let assignmentInputs = (workout.exercises ?? []).map(() => '');

function parseAssignments(value = '') { return value.split(/[\n,]/).map((c) => c.trim()).filter(Boolean).map((c) => c.toUpperCase()); }
function commitAllAssignments() {
stationAssignments = stationAssignments.map((codes, i) => parseAssignments(assignmentInputs[i] ?? codes.join(', ')));
assignmentInputs = stationAssignments.map((codes) => codes.join(', '));
}
$: movesCompleted = totalStations > 0 ? (state.currentRound - 1) * totalStations + state.currentStation : 0;
$: stationRoster = (workout.exercises ?? []).map((_, targetIndex) => {
if (!totalStations) return []; const roster = [];
stationAssignments.forEach((codes, startIndex) => {
if (codes?.length) { const destination = (startIndex + movesCompleted) % totalStations; if (destination === targetIndex) roster.push(...codes); }
});
return roster;
});
$: progress = state.duration > 0 ? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100)) : 0;

// --- Timer Logic (No Change) ---
function advancePhase() {
if (!totalStations) return; state.lastCue = 0; const nextPhaseIndex = state.phaseIndex + 1;
if (workout.mode === 'Partner' && workout.type === 'Circuit') {
if (nextPhaseIndex === 0) { state.phaseIndex = 0; state.phase = 'WORK 1'; state.remaining = state.duration = sessionConfig.work; whistleBell(); } 
            else if (nextPhaseIndex === 1) { state.phaseIndex = 1; state.phase = 'SWAP'; state.remaining = state.duration = sessionConfig.swap; tone(420, 160); } 
            else if (nextPhaseIndex === 2) { state.phaseIndex = 2; state.phase = 'WORK 2'; state.remaining = state.duration = sessionConfig.work; whistleBell(); } 
            else if (nextPhaseIndex === 3) { state.phaseIndex = 3; state.phase = 'MOVE'; state.remaining = state.duration = sessionConfig.move; tone(420, 160); } 
            else {
state.currentStation++;
if (state.currentStation >= totalStations) {
state.currentStation = 0; state.currentRound++;
if (state.currentRound > sessionConfig.rounds) { workoutComplete(); return; }
}
state.phaseIndex = 0; state.phase = 'WORK 1'; state.remaining = state.duration = sessionConfig.work; whistleBell();
}
} else { state.currentStation++; if (state.currentStation >= totalStations) { workoutComplete(); return; } state.phase = `Round ${state.currentStation + 1}`; state.remaining = state.duration = sessionConfig.work; whistleBell(); }
}
function tick() { state.remaining -= 0.1; const secs = Math.ceil(state.remaining); if (secs <= 3 && secs >= 1 && secs !== state.lastCue) { state.lastCue = secs; countBeep(secs); } if (state.remaining <= 0) { advancePhase(); } state = state; }
function startTimer() { if (state.isComplete || state.isRunning || totalStations === 0) return; if (state.phaseIndex === -1) { advancePhase(); } state.isRunning = true; timerId = setInterval(tick, 100); }
function pauseTimer() { if (!state.isRunning) return; state.isRunning = false; clearInterval(timerId); }
function resetTimer() { pauseTimer(); state.phase = 'Ready'; state.phaseIndex = -1; state.remaining = sessionConfig.work; state.duration = sessionConfig.work; state.currentStation = 0; state.currentRound = 1; state.isComplete = false; state = state; }
function workoutComplete() { pauseTimer(); state.phase = 'SESSION COMPLETE!'; state.isComplete = true; state = state; whistleBell(); goto(`/log-score/${workout.id}`); }
function initializeAndStart() { commitAllAssignments(); isSetupVisible = false; resetTimer(); startTimer(); }
function openSetup() { pauseTimer(); isSetupVisible = true; }
function closeSetup() { commitAllAssignments(); isSetupVisible = false; }
function formatTime(s) { const secs = Math.max(0, Math.ceil(s)); return (String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')); }
onDestroy(() => clearInterval(timerId));
</script>

{#if isSetupVisible}
<div class="modal-overlay">
<div class="modal-content">
<h2>Session Setup</h2>
<div class="setup-form">
<div class="form-group"><label for="work">Work (s)</label><input id="work" type="number" min="0" bind:value={sessionConfig.work} /></div>
<div class="form-group"><label for="swap">Swap (s)</label><input id="swap" type="number" min="0" bind:value={sessionConfig.swap} /></div>
<div class="form-group"><label for="move">Move/Rest (s)</label><input id="move" type="number" min="0" bind:value={sessionConfig.move} /></div>
<div class="form-group"><label for="rounds">Rounds</label><input id="rounds" type="number" min="1" bind:value={sessionConfig.rounds} /></div>
</div>
<div class="assignment-setup">
<h3>Starting Positions</h3>
<div class="assignment-grid">
{#each workout.exercises as station, i}
<div class="assignment-card">
<label for={`assignment-${i}`}>Station {i + 1}: {station.name}</label>
<input id={`assignment-${i}`} placeholder="e.g. LMN, DVE" bind:value={assignmentInputs[i]} on:blur={() => commitAllAssignments()} />
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
<div class="station-strip">
{#each workout.exercises as station, i}
<article class="station-card" class:current={i === state.currentStation}>
<header class="station-card__header">
<span class="station-number">{i + 1}</span>
<h3>{station.name}</h3>
</header>
<div class="station-card__tasks">
<div class="task-line"><span class="task-label p1">P1</span><span class="task-text">{station.p1_task}</span></div>
<div class="task-line"><span class="task-label p2">P2</span><span class="task-text">{station.p2_task}</span></div>
</div>
<footer class="station-card__roster">
<div class="roster-chips">
{#if stationRoster[i]?.length}
{#each stationRoster[i] as code}<span>{code}</span>{/each}
{:else}<span class="roster-empty">OPEN</span>{/if}
</div>
</footer>
</article>
{/each}
</div>
</section>

<section class="timer-panel">
<header class="timer-header">
<h1 class="workout-title">{workout.title}</h1>
<div class="round-info">
<span>Round {Math.min(state.currentRound, sessionConfig.rounds)} / {sessionConfig.rounds}</span>
<span>Station {Math.min(state.currentStation + 1, totalStations)} / {totalStations}</span>
</div>
</header>
<main class="timer-main">
<div class="phase-display">{state.phase}</div>
<div class="time-display">{formatTime(state.remaining)}</div>
<div class="progress-bar-container"><div class="progress-bar-fill" style="width: {progress}%"></div></div>
</main>
<footer class="control-row">
<button class="secondary" on:click={openSetup}>Setup</button>
<button class="secondary" on:click={resetTimer}>Reset</button>
<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}>{state.isRunning ? 'Pause' : 'Start'}</button>
</footer>
</section>
</div>
</div>

<style>
/* --- DESIGN SYSTEM VARIABLES --- */
:root {
--font-body: 'Inter', sans-serif;
--font-display: 'Bebas Neue', sans-serif;
--brand-yellow: #fde047;
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
:global(body) { background-color: var(--deep-space); color: var(--text-primary); font-family: var(--font-body); }
.blur { filter: blur(8px); }

/* --- MODAL STYLES --- */
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.8); display: flex; align-items: flex-start; justify-content: center; z-index: 1000; backdrop-filter: blur(8px); overflow-y: auto; padding: 2rem 1.5rem; }
.modal-content { background: var(--surface-1); border: 1px solid var(--surface-2); border-radius: 24px; padding: 2.5rem; max-width: 900px; width: 100%; box-shadow: 0 30px 70px #00000073; display: flex; flex-direction: column; gap: 2rem; margin: auto 0; }
.modal-content h2 { color: var(--brand-yellow); margin: 0; font-family: var(--font-display); font-size: 2.5rem; letter-spacing: .08em; }
.setup-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem; }
.form-group label { display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem; font-weight: 600; }
.form-group input { width: 100%; font-size: 1.25rem; padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--surface-2); background: var(--deep-space); color: var(--text-primary); }
.assignment-setup__header h3 { margin: 0; color: var(--brand-yellow); font-family: var(--font-display); font-size: 1.5rem; letter-spacing: .08em; }
.assignment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.1rem; }
.assignment-card { background: var(--surface-2); border-radius: 14px; padding: 1.1rem 1.25rem; }
.assignment-card label { font-size: 0.85rem; color: var(--text-secondary); }
.assignment-card input { width: 100%; padding: 0.7rem 0.85rem; margin-top: 0.5rem; border-radius: 10px; border: 1px solid var(--surface-3); background: var(--surface-1); color: var(--text-primary); }
.modal-actions { display: flex; gap: 1rem; justify-content: flex-end; }
.modal-actions button { border-radius: 999px; font-size: 1rem; padding: 0.85rem 1.75rem; cursor: pointer; font-weight: 600; }
.modal-actions button.primary { border: none; background: var(--brand-green); color: var(--text-primary); }
.modal-actions button.secondary { border: 1px solid var(--surface-3); background: var(--surface-2); color: var(--text-secondary); }

/* --- NEW COMMAND CENTER LAYOUT --- */
.timer-wrapper { min-height: 100vh; width: 100%; display: flex; justify-content: center; align-items: stretch; padding: 2rem; }
.timer-layout { width: 100%; max-width: 1920px; display: flex; flex-direction: column; gap: 2rem; background: var(--deep-space); border: 1px solid var(--surface-2); border-radius: 28px; padding: 2rem; }

    /* Top Section: Station Strip */
.station-overview { border-bottom: 1px solid var(--surface-2); padding-bottom: 2rem; }
.station-overview__header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.station-overview__header h2 { font-family: var(--font-display); color: var(--brand-yellow); margin: 0; font-size: 2rem; letter-spacing: 2px; }
.station-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
.station-card { background: var(--surface-1); border: 1px solid var(--surface-2); border-radius: 16px; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.8rem; transition: all 200ms ease; }
.station-card.current { border-color: var(--brand-yellow); background: var(--surface-2); box-shadow: 0 0 25px rgba(253, 224, 71, 0.2); transform: translateY(-3px); }
.station-card__header { display: flex; align-items: center; gap: 0.9rem; }
.station-number { width: 30px; height: 30px; border-radius: 50%; background: var(--surface-3); color: var(--text-muted); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; flex-shrink: 0; }
.station-card.current .station-number { background: var(--brand-yellow); color: var(--deep-space); }
.station-card h3 { margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--text-primary); }
.station-card__tasks { display: flex; flex-direction: column; gap: 0.4rem; padding-left: 0.5rem; }
.task-line { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
.task-label { width: 22px; height: 22px; border-radius: 50%; font-size: 0.6rem; font-weight: 700; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
.task-label.p1 { background: #34d39933; color: #34d399; }
.task-label.p2 { background: #f472b633; color: #f472b6; }
.task-text { color: var(--text-secondary); }
.station-card__roster { margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--surface-2); }
.roster-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.roster-chips span { padding: 0.15rem 0.5rem; border-radius: 6px; background: var(--surface-2); color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; }
.roster-empty { color: var(--surface-3); font-size: 0.8rem; }

    /* Bottom Section: Timer Panel */
.timer-panel { display: flex; flex-direction: column; align-items: center; width: 100%; flex-grow: 1; justify-content: center; }
.timer-header { width: 100%; display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; position: absolute; top: 2rem; left: 0; padding: 0 2rem; }
.workout-title { font-family: var(--font-display); font-size: clamp(3rem, 6vw, 4.5rem); color: var(--brand-yellow); line-height: 1; letter-spacing: 2px; text-align: left; }
.round-info { text-align: right; font-size: 1.25rem; color: var(--text-muted); font-family: var(--font-display); letter-spacing: 2px; }
.timer-main { display: flex; flex-direction: column; align-items: center; width: 100%; }
.phase-display { font-family: var(--font-display); font-size: clamp(3rem, 8vw, 5rem); color: var(--text-primary); letter-spacing: 4px; }
.time-display { font-family: var(--font-display); font-size: clamp(10rem, 30vh, 22rem); font-weight: 400; line-height: 1; margin: 1rem 0; color: var(--text-primary); }
.progress-bar-container { width: 100%; max-width: 800px; height: 8px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
.progress-bar-fill { height: 100%; background: var(--brand-yellow); }
.control-row { display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; width: 100%; margin-top: 2.5rem; }
.control-row button { border: 1px solid var(--surface-3); background: var(--surface-2); color: var(--text-secondary); border-radius: 999px; font-size: 1.1rem; padding: 0.9rem 2.5rem; cursor: pointer; font-weight: 600; }
.control-row button.primary { background: var(--brand-green); border-color: transparent; color: var(--text-primary); }

@media (max-width: 900px) {
.timer-wrapper { padding: 0; }
.timer-layout { border-radius: 0; }
.station-overview { padding-bottom: 1rem; }
.timer-panel { padding-bottom: 1rem; }
.station-strip { grid-template-columns: 1fr; }
}
</style>
