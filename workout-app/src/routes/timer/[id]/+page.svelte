<script>
import { onDestroy } from 'svelte';

export let data;
const { workout } = data;

// --- Sound Imports ---
let audioCtx = null;
function getCtx() { return audioCtx || (audioCtx = new (window.AudioContext||window.webkitAudioContext)()); }
function tone(freq=800, dur=200, type='sine', gain=0.25){ try{ const ctx=getCtx(),o=ctx.createOscillator(),g=ctx.createGain();o.type=type; o.frequency.setValueAtTime(freq,ctx.currentTime);o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(gain,ctx.currentTime);g.gain.exponentialRampToValueAtTime(1e-4,ctx.currentTime+dur/1000);o.start(); o.stop(ctx.currentTime+dur/1000);}catch(e){}};
function whistleBell(){ try{ const ctx=getCtx(); for(let i=0;i<2;i++){ const g=ctx.createGain(),t0=ctx.currentTime+i*0.15; g.connect(ctx.destination);g.gain.setValueAtTime(1e-4,t0);g.gain.linearRampToValueAtTime(i===0?0.85:0.7,t0+0.02); g.gain.exponentialRampToValueAtTime(1e-4,t0+1.2); const o1=ctx.createOscillator(),o2=ctx.createOscillator(); o1.type=o2.type='triangle';o1.frequency.setValueAtTime(620,t0);o2.frequency.setValueAtTime(930,t0);o1.connect(g);o2.connect(g);o1.start(t0);o2.start(t0); o1.stop(t0+1.25);o2.stop(t0+1.25);}}catch(e){}};
function countBeep(n){ const f={3:520,2:680,1:940}; tone(f[n]||720,180,'sine',0.35);};

// --- Session Setup State ---
let isSetupVisible = true;
let sessionConfig = { work: 60, swap: 15, move: 15, rounds: 1 };

// --- Core Timer State ---
let state = {
phase: 'Ready', phaseIndex: -1, remaining: sessionConfig.work, duration: sessionConfig.work,
currentStation: 0, currentRound: 1, isRunning: false, isComplete: false, lastCue: 0
};
let timerId = null;

// --- Staff Roster Logic ---
let totalStations = workout.exercises?.length ?? 0;
let stationAssignments = (workout.exercises ?? []).map(() => []);
let assignmentInputs = (workout.exercises ?? []).map(() => '');

function parseAssignments(value = '') { return value.split(/[\n,]/).map(c => c.trim()).filter(Boolean).map(c => c.toUpperCase()); }
function updateAssignmentInput(index, value) { assignmentInputs[index] = value; }
function commitAssignmentInput(index) { const parsed = parseAssignments(assignmentInputs[index] ?? ''); stationAssignments[index] = parsed; assignmentInputs[index] = parsed.join(', '); }
function commitAllAssignments() { stationAssignments = stationAssignments.map((codes, i) => parseAssignments(assignmentInputs[i] ?? codes.join(', '))); assignmentInputs = stationAssignments.map(codes => codes.join(', ')); }

// --- Svelte Reactive Statements ---
$: movesCompleted = totalStations > 0 ? (state.currentRound - 1) * totalStations + state.currentStation : 0;

$: stationRoster = (workout.exercises ?? []).map((_, targetIndex) => {
if (!totalStations) return [];
const roster = [];
stationAssignments.forEach((codes, startIndex) => {
if (!codes?.length) return;
const destination = (startIndex + movesCompleted) % totalStations;
if (destination === targetIndex) roster.push(...codes);
});
return roster;
});

$: phaseMessage = (() => {
if (state.phaseIndex === 1) return 'Prepare to switch roles.';
if (state.phaseIndex === 3) return 'Move to your next station now.';
if (state.phaseIndex === 2) return 'Roles are now swapped!';
return '';
})();

$: progress = state.duration > 0 ? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100)) : 0;

// --- Timer Logic ---
function advancePhase() {
state.lastCue = 0;
const nextPhaseIndex = state.phaseIndex + 1;
if (workout.mode === 'Partner' && workout.type === 'Circuit') {
if (nextPhaseIndex === 0) {
state.phaseIndex = 0; state.phase = 'WORK 1'; state.remaining = state.duration = sessionConfig.work; whistleBell();
} else if (nextPhaseIndex === 1) {
state.phaseIndex = 1; state.phase = 'SWAP'; state.remaining = state.duration = sessionConfig.swap; tone(420, 160);
} else if (nextPhaseIndex === 2) {
state.phaseIndex = 2; state.phase = 'WORK 2'; state.remaining = state.duration = sessionConfig.work; whistleBell();
} else if (nextPhaseIndex === 3) {
state.phaseIndex = 3; state.phase = 'MOVE'; state.remaining = state.duration = sessionConfig.move; tone(420, 160);
} else {
state.currentStation++;
if (state.currentStation >= totalStations) {
state.currentStation = 0; state.currentRound++;
if (state.currentRound > sessionConfig.rounds) { workoutComplete(); return; }
}
state.phaseIndex = 0; state.phase = 'WORK 1'; state.remaining = state.duration = sessionConfig.work; whistleBell();
}
} else { 
state.currentStation++;
if (state.currentStation >= totalStations) { workoutComplete(); return; }
state.phase = `Round ${state.currentStation + 1}`; state.remaining = state.duration = sessionConfig.work; whistleBell();
}
}

function tick() {
state.remaining -= 0.1;
const secs = Math.ceil(state.remaining);
if (secs <= 3 && secs >= 1 && secs !== state.lastCue) { state.lastCue = secs; countBeep(secs); }
if (state.remaining <= 0) { advancePhase(); }
state = state;
}

function startTimer() { if (state.isComplete || state.isRunning) return; if (state.phaseIndex === -1) { advancePhase(); } state.isRunning = true; timerId = setInterval(tick, 100); }
function pauseTimer() { if (!state.isRunning) return; state.isRunning = false; clearInterval(timerId); }
function resetTimer() { pauseTimer(); state.phase = 'Ready'; state.phaseIndex = -1; state.remaining = sessionConfig.work; state.duration = sessionConfig.work; state.currentStation = 0; state.currentRound = 1; state.isComplete = false; state = state; }
function workoutComplete() { pauseTimer(); state.phase = 'SESSION COMPLETE!'; state.isComplete = true; state = state; whistleBell(); }
function initializeAndStart() { commitAllAssignments(); isSetupVisible = false; resetTimer(); startTimer(); }
function openSetup() { pauseTimer(); isSetupVisible = true; }
function closeSetup() { commitAllAssignments(); isSetupVisible = false; }
function formatTime(s) { const secs = Math.max(0, Math.ceil(s)); return String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0'); }
onDestroy(() => clearInterval(timerId));
</script>

{#if isSetupVisible}
<div class="modal-overlay">
<div class="modal-content">
<h2>Session Setup</h2>
<p>Configure timer intervals and assign staff to their starting stations.</p>
<div class="setup-form">
<div class="form-group"><label for="work">Work (s)</label><input id="work" type="number" min="0" bind:value={sessionConfig.work} /></div>
<div class="form-group"><label for="swap">Swap (s)</label><input id="swap" type="number" min="0" bind:value={sessionConfig.swap} /></div>
<div class="form-group"><label for="move">Move/Rest (s)</label><input id="move" type="number" min="0" bind:value={sessionConfig.move} /></div>
<div class="form-group"><label for="rounds">Rounds</label><input id="rounds" type="number" min="1" bind:value={sessionConfig.rounds} /></div>
</div>
<div class="assignment-setup">
<div class="assignment-setup__header"><h3>Starting Positions</h3><p>Enter staff initials, separated by commas. They will rotate automatically.</p></div>
<div class="assignment-grid">
{#each workout.exercises as station, i}
<div class="assignment-card">
<label for={`assignment-${i}`}>Station {i + 1}: {station.name}</label>
<input id={`assignment-${i}`} placeholder="e.g. LMN, DVE" bind:value={assignmentInputs[i]} on:input|self={e => updateAssignmentInput(i, e.target.value)} on:blur={() => commitAssignmentInput(i)} />
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
<div class="left-panel-header"><h2>Stations</h2></div>
<div class="station-list">
{#each workout.exercises as station, i}
{@const nextDestinationIndex = (i + 1) % totalStations}
<div class="station-item" class:current={i === state.currentStation}>
<div class="station-header">
<div class="station-number">{i + 1}</div>
<div class="station-title"><h3>{station.name}</h3></div>
</div>
<div class="station-body">
<div class="task-line"><span class="task-label p1">P1</span><span class="task-text">{station.p1_task}</span></div>
<div class="task-line"><span class="task-label p2">P2</span><span class="task-text">{station.p2_task}</span></div>
</div>
<div class="station-roster">
<div class="roster-line">
<span class="roster-title">NOW HERE:</span>
<div class="roster-chips">
{#if stationRoster[i]?.length}
{#each stationRoster[i] as code}<span>{code}</span>{/each}
{:else}<span class="roster-empty">OPEN</span>{/if}
</div>
</div>
<div class="roster-line destination" class:pulse={state.phaseIndex === 3}>
<span class="roster-title">NEXT&nbsp;DESTINATION:</span>
<span class="roster-destination-station">STATION {nextDestinationIndex + 1}</span>
</div>
</div>
</div>
{/each}
</div>
</div>
<div class="right-panel">
<header class="timer-header">
<div class="header-meta"><h1>{workout.title}</h1></div>
<div class="round-info">
<span>Round {state.currentRound}/{sessionConfig.rounds}</span>
<span>Station {state.currentStation + 1}/{totalStations}</span>
</div>
</header>
<main class="timer-main">
<div class="phase-display">{state.phase}</div>
{#if phaseMessage}<p class="phase-subtext">{phaseMessage}</p>{/if}
<div class="time-display">{formatTime(state.remaining)}</div>
<div class="progress-bar-container"><div class="progress-bar-fill" style="width: {progress}%"></div></div>
</main>
<footer class="timer-controls">
<button class="secondary" on:click={openSetup}>Setup</button>
<button on:click={resetTimer}>Reset</button>
<button class="primary" on:click={state.isRunning ? pauseTimer : startTimer}>{state.isRunning ? 'Pause' : 'Start'}</button>
</footer>
</div>
</div>

<style>
:global(body) { background: #050505; color: white; font-family: 'Inter', system-ui, sans-serif; }
.blur { filter: blur(10px); pointer-events: none; }
/* Modal Styles */
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
.modal-content { background: linear-gradient(145deg, #080c0a, #0d1310); border: 1px solid #66ff9914; border-radius: 20px; padding: 2.5rem; max-width: 720px; width: min(94vw, 720px); text-align: left; box-shadow: 0 30px 70px #00000073; display: flex; flex-direction: column; gap: 1.75rem; max-height: 90vh; }
.modal-content h2 { color: var(--yellow); margin: 0; font-size: 2rem; letter-spacing: .08em; }
.modal-content p { color: #ffffffb8; margin: 0; }
.setup-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; margin-top: 1.5rem; }
.form-group label { display: block; margin-bottom: 0.5rem; color: #ffffffa6; font-size: .9rem; letter-spacing: .05em; text-transform: uppercase; }
.form-group input { width: 100%; font-size: 1.25rem; padding: .75rem 1rem; border-radius: 10px; border: 1px solid #66ff9926; background: #0c120fcc; color: white; }
.assignment-setup { display: flex; flex-direction: column; gap: 1rem; overflow-y: auto; flex-grow: 1; padding-right: 1rem; margin-right: -1rem; }
.assignment-setup__header h3 { margin: 0; color: var(--yellow); font-size: 1.25rem; letter-spacing: .08em; text-transform: uppercase; }
.assignment-setup__header p { color: #ffffff99; font-size: .9rem; line-height: 1.5; }
.assignment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; padding-top: .5rem; }
.assignment-card { background: #0e1411cc; border: 1px solid #66ff991f; border-radius: 12px; padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .75rem; }
.assignment-card label { font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; color: #ffffffa6; }
.assignment-card input { width: 100%; padding: .65rem .75rem; border-radius: 8px; border: 1px solid #66ff992e; background: #090d0bfa; color: white; font-size: .95rem; letter-spacing: .06em; }
.modal-actions { display: flex; gap: 1rem; justify-content: flex-end; flex-shrink: 0; margin-top: 1.75rem; }
.modal-actions button { border-radius: 10px; font-size: 1rem; padding: .85rem 1.75rem; cursor: pointer; font-weight: 600; letter-spacing: .06em; }
.modal-actions button.primary { border: none; background: linear-gradient(135deg, var(--green), #0c8b63); color: var(--yellow); }
.modal-actions button.secondary { border: 1px solid #ffffff2e; background: #0f1411d9; color: #ffffffd1; }

/* Layout Styles */
.timer-wrapper { min-height: 100vh; width: 100%; display: flex; align-items: stretch; justify-content: center; padding: 2rem; }
.partner-circuit-layout { display: grid; grid-template-columns: 1fr 1fr; width: 100%; max-width: 1800px; background: #0a0d0c; border: 1px solid #66ff9914; border-radius: 24px; overflow: hidden; box-shadow: 0 30px 80px #00000080; }

/* Left Panel Styles */
.left-panel { background: linear-gradient(180deg, #0a1710, #050a08); padding: 2rem 1.75rem; display: flex; flex-direction: column; border-right: 1px solid #66ff9914; }
.left-panel-header { margin-bottom: 1.5rem; }
.left-panel-header h2 { color: var(--yellow); margin: 0; font-size: 1.5rem; letter-spacing: .08em; text-transform: uppercase; }
.station-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; overflow-y: auto; align-content: start; flex-grow: 1; padding: 0 .5rem 0 0; }
.station-item { display: flex; flex-direction: column; gap: 1rem; background: #141e19; padding: 1rem 1.25rem; border-radius: 16px; border: 1px solid #66ff9914; transition: all .3s ease; }
.station-item.current { border-color: var(--yellow); box-shadow: 0 16px 40px #ffd60a2e; background: #202d26; }
.station-header { display: flex; align-items: center; gap: .9rem; }
.station-number { width: 38px; height: 38px; border-radius: 50%; background: #ffffff1a; color: #ffffffbf; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
.station-item.current .station-number { background: var(--yellow); color: #000; }
.station-title h3 { margin: 0; font-size: 1.1rem; font-weight: 600; }
.station-body { display: flex; flex-direction: column; gap: .6rem; }
.task-line { display: flex; align-items: flex-start; gap: .5rem; }
.task-label { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 700; letter-spacing: .1em; flex-shrink: 0; }
.task-label.p1 { background: #7af5c633; color: #7af5c6; border: 1px solid #7af5c673; }
.task-label.p2 { background: #fbcfe833; color: #fbcfe8; border: 1px solid #fbcfe873; }
.task-text { color: #e6f0e8; font-size: .95rem; line-height: 1.45; }
.station-roster { margin-top: auto; padding-top: .75rem; border-top: 1px solid #66ff9914; display: flex; flex-direction: column; gap: .5rem; }
.roster-line { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.roster-title { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: #ffffff7d; }
.roster-chips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem; justify-items: start; width: 100%; }
.roster-chips span { display: inline-flex; padding: .15rem .5rem; border-radius: 6px; background: #ffffff1a; color: #ffffffd1; font-size: .8rem; font-weight: 500; width: 100%; justify-content: center; }
.roster-empty { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: #ffffff4d; }
.roster-destination-station { font-size: .9rem; font-weight: bold; color: #e6f0e8; }
.pulse { animation: pulse 1.5s infinite; }
@keyframes pulse { 0%, 100% { color: #e6f0e8; } 50% { color: var(--yellow); } }

/* Right Panel Styles */
.right-panel { display: flex; flex-direction: column; padding: 2.5rem 3rem; text-align: center; }
.timer-header { display: flex; justify-content: space-between; align-items: flex-start; }
.header-meta { text-align: left; }
.round-info { text-align: right; font-size: 1.25rem; color: #ffffffa6; letter-spacing: .08em; text-transform: uppercase; }
.timer-main { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
.phase-display { font-size: clamp(2rem, 6vw, 4rem); font-weight: 300; text-transform: uppercase; color: #ddd; }
.phase-subtext { margin-top: -0.5rem; font-size: 1.2rem; color: #ffffffb8; font-style: italic; }
.time-display { font-size: clamp(8rem, 25vw, 18rem); font-weight: 800; line-height: 1; margin: 1rem 0; font-family: monospace; }
.progress-bar-container { width: 90%; max-width: 900px; height: 10px; background-color: #222; border-radius: 999px; margin: 2rem auto; overflow: hidden; }
.progress-bar-fill { height: 100%; background-color: var(--yellow); }
.timer-controls { padding-top: 1rem; display: flex; justify-content: center; gap: 1rem; }
.timer-controls button { border: 1px solid #66ff993f; background: #0d1310cc; color: #ffffffe0; border-radius: 12px; font-size: 1.15rem; padding: .9rem 2.5rem; cursor: pointer; min-width: 160px; font-weight: 600; letter-spacing: .06em; }
.timer-controls button.primary { background: linear-gradient(135deg, var(--green), #0c8b63); color: var(--yellow); border-color: transparent; }

/* Responsive Breakpoints */
@media (max-width: 1400px) { .station-list { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .partner-circuit-layout { grid-template-columns: 1fr; } .left-panel { max-height: 50vh; border-right: none; border-bottom: 1px solid #66ff9914; } .station-list { grid-template-columns: 1fr 1fr; } }
@media (max-width: 640px) { .station-list { grid-template-columns: 1fr; } .right-panel { padding: 1.75rem; } .timer-controls button { width: 100%; } }
</style>
