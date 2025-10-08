<script>
// @ts-nocheck
import { onDestroy, onMount } from 'svelte';
import { db } from '$lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

export let data;
const { workout, url } = data;

// --- Sound Functions ---
let audioCtx = null;
function getCtx() { return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) { try { const ctx = getCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000); o.start(); o.stop(ctx.currentTime + dur / 1000); } catch (e) {} }
function whistleBell() { try { const ctx = getCtx(); for (let i = 0; i < 2; i += 1) { const g = ctx.createGain(); const t0 = ctx.currentTime + i * 0.15; g.connect(ctx.destination); g.gain.setValueAtTime(1e-4, t0); g.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2); const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator(); o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.setValueAtTime(620, t0); o2.frequency.setValueAtTime(930, t0); o1.connect(g); o2.connect(g); o1.start(t0); o2.start(t0); o1.stop(t0 + 1.25); o2.stop(t0 + 1.25); } } catch (e) {} }
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
let sessionId = null;

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

onMount(async () => {
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);
const sessionsQuery = query(collection(db, 'sessions'), where('workoutId', '==', workout.id), where('sessionDate', '>=', startOfToday), orderBy('sessionDate', 'asc'), limit(1));
const sessionsSnapshot = await getDocs(sessionsQuery);
if (!sessionsSnapshot.empty) { sessionId = sessionsSnapshot.docs[0].id; }
});

// --- Timer Core Functions ---
function advancePhase() {
if (!totalStations) return; state.lastCue = 0; const nextPhaseIndex = state.phaseIndex + 1;
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
} else { state.currentStation++; if (state.currentStation >= totalStations) { workoutComplete(); return; } state.phase = `Round ${state.currentStation + 1}`; state.remaining = state.duration = sessionConfig.work; whistleBell(); }
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

<div class="mission-control">
<header class="setup-panel">
</header>
<main class="main-content">
<div class="left-panel">
<div class="station-grid">
{#each workout.exercises as station, i}
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
{#each stationRoster[i] as code}<span>{code}</span>{/each}
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
/* ... (all styles from our last good version) ... */
:root { --font-body: 'Inter', sans-serif; --font-display: 'Bebas Neue', sans-serif; --brand-yellow: #fde047; --brand-green: #16a34a; --bg-main: #111827; --bg-panel: #1f2937; --border-color: #374151; --text-primary: #f9fafb; --text-secondary: #9ca3af; --text-muted: #6b7280; }
:global(body) { background-color: var(--bg-main); color: var(--text-primary); font-family: var(--font-body); }

.control-row { display: flex; justify-content: center; gap: 1rem; }
.control-row button { border-radius: 999px; font-size: 1.1rem; padding: 0.9rem 2rem; cursor: pointer; font-weight: 600; border: none; min-width: 120px; }
.control-row button.secondary { background: var(--surface-2); color: var(--text-secondary); border: 1px solid var(--border-color); }
.control-row button.primary { background: var(--brand-green); color: var(--text-primary); }
.control-row button:disabled { opacity: 0.5; cursor: not-allowed; }
.control-row button.finish { border-color: #ef4444; color: #ef4444; }
</style>
