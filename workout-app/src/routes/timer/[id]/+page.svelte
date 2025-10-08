<script>
// @ts-nocheck
import { onDestroy } from 'svelte';
import { db } from '$lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export let data;
const { workout } = data;

// --- Sound Functions ---
let audioCtx = null;
function getCtx() { return audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)()); }
function tone(freq = 800, dur = 200, type = 'sine', gain = 0.25) { try { const ctx = getCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime); o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + dur / 1000); o.start(); o.stop(ctx.currentTime + dur / 1000); } catch (e) {} }
function whistleBell() { try { const ctx = getCtx(); for (let i = 0; i < 2; i += 1) { const g = ctx.createGain(); const t0 = ctx.currentTime + i * 0.15; g.connect(ctx.destination); g.gain.setValueAtTime(1e-4, t0); g.gain.linearRampToValueAtTime(i === 0 ? 0.85 : 0.7, t0 + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, t0 + 1.2); const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator(); o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.setValueAtTime(620, t0); o2.frequency.setValueAtTime(930, t0); o1.connect(g); o2.connect(g); o1.start(t0); o2.start(t0); o1.stop(t0 + 1.25); o2.stop(t0 + 1.25); } } catch (e) {} }
function countBeep(n) { const f = { 3: 520, 2: 680, 1: 940 }; tone(f[n] || 720, 180, 'sine', 0.35); }

// --- Session State ---
let sessionConfig = { work: 60, swap: 15, move: 15, rounds: 1, totalTime: 600, showStationCallout: false, amrapTagline: '' };
let state = { phase: 'Ready', phaseIndex: -1, remaining: 60, duration: 60, currentStation: 0, currentRound: 1, isRunning: false, isComplete: false, lastCue: 0 };
let timerId = null;
let isSetupVisible = false;

// --- AMRAP / Benchmark State ---
let amrapMinutes = sessionConfig.totalTime / 60;
const defaultAmrapTagline = (minutes) => `As Many Rounds As Possible in ${Math.max(1, Math.round(minutes || 0))} minutes`;
sessionConfig.amrapTagline = workout.amrapTagline || defaultAmrapTagline(amrapMinutes);
let amrapTaglineDirty = Boolean(workout.amrapTagline);
function makeId() { return Math.random().toString(36).slice(2, 8); }
let attendeeRecords = Array.isArray(workout.attendees) ? workout.attendees.map(name => ({ id: makeId(), name, rounds: '' })) : [];
let attendeeInput = attendeeRecords.map(record => record.name).join('\n');
let isSavingResults = false;
let hasSavedResults = false;
let resultsStatus = { type: 'idle', message: '' };

// --- Roster Logic ---
let totalStations = workout.exercises?.length ?? 0;
let stationAssignments = (workout.exercises ?? []).map(() => []);
let assignmentInputs = (workout.exercises ?? []).map(() => '');

function parseAssignments(value = '') { return value.split(/[\n,]/).map(c => c.trim()).filter(Boolean).map(c => c.toUpperCase()); }
function commitAllAssignments() {
stationAssignments = stationAssignments.map((codes, i) => parseAssignments(assignmentInputs[i] ?? codes.join(', ')));
assignmentInputs = stationAssignments.map(codes => codes.join(', '));
}

$: progress = state.duration > 0 ? Math.min(100, Math.max(0, ((state.duration - state.remaining) / state.duration) * 100)) : 0;

// --- Timer Logic ---
function advancePhase() {
if (state.isComplete || !totalStations) return;
state.lastCue = 0;
const nextPhaseIndex = state.phaseIndex + 1;

if (workout.type === 'Circuit' || workout.type === 'Timed Rounds') {
if (workout.mode === 'Partner') {
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
} else { // Individual Circuit
if (nextPhaseIndex % 2 === 0) { state.phase = 'WORK'; state.remaining = state.duration = sessionConfig.work; whistleBell(); } 
else {
state.currentStation++;
if (state.currentStation >= totalStations) {
state.currentStation = 0; state.currentRound++;
if (state.currentRound > sessionConfig.rounds) { workoutComplete(); return; }
}
state.phase = 'MOVE'; state.remaining = state.duration = sessionConfig.move; tone(420, 160);
}
state.phaseIndex = nextPhaseIndex;
}
} else if (workout.type === 'EMOM') {
state.currentRound++;
if (state.currentRound > sessionConfig.rounds) { workoutComplete(); return; }
state.phase = `Minute ${state.currentRound}`;
state.remaining = state.duration = 60;
state.currentStation = (state.currentRound - 1) % totalStations;
whistleBell();
}
}

function tick() {
state.remaining = Math.max(0, state.remaining - 0.1);
const secs = Math.ceil(state.remaining);
if (secs <= 3 && secs >= 1 && secs !== state.lastCue) { state.lastCue = secs; countBeep(secs); }
if (state.remaining <= 0) {
if (workout.type === 'AMRAP') { workoutComplete(); } else { advancePhase(); }
}
state = state;
}

function startTimer() {
if (state.isComplete || state.isRunning) return;
if (workout.type !== 'AMRAP' && totalStations === 0) return;
if (state.phaseIndex === -1) {
if (workout.type === 'AMRAP') {
state.phase = 'WORK'; state.remaining = state.duration = sessionConfig.totalTime;
state.phaseIndex = 0; whistleBell();
} else {
advancePhase();
}
}
state.isRunning = true;
timerId = setInterval(tick, 100);
}

function pauseTimer() { if (!state.isRunning) return; state.isRunning = false; clearInterval(timerId); timerId = null; }

function resetTimer() {
pauseTimer();
state.phase = 'Ready'; state.phaseIndex = -1; state.currentStation = 0;
state.currentRound = 1; state.isComplete = false; hasSavedResults = false;
resultsStatus = { type: 'idle', message: '' };
attendeeRecords = attendeeRecords.map(record => ({ ...record, rounds: '' }));
if (workout.type === 'AMRAP') { state.remaining = state.duration = sessionConfig.totalTime; } 
else if (workout.type === 'EMOM') { state.remaining = state.duration = 60; } 
else { state.remaining = state.duration = sessionConfig.work; }
state = state;
}

function skipPhase() { if (state.isComplete || state.phaseIndex === -1 || totalStations === 0) return; const wasRunning = state.isRunning; pauseTimer(); advancePhase(); if (wasRunning && !state.isComplete) { startTimer(); } }

function workoutComplete() { pauseTimer(); state.phase = 'SESSION COMPLETE!'; state.isComplete = true; state.remaining = 0; state = state; whistleBell(); }

function applySetup() { commitAllAssignments(); applyAttendeeInput(); isSetupVisible = false; resetTimer(); }
function openSetup() { pauseTimer(); attendeeInput = attendeeRecords.map(r => r.name).join('\n'); isSetupVisible = true; }
function closeSetup() { isSetupVisible = false; }

function formatTime(s) { const secs = Math.max(0, Math.ceil(s)); return (String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')); }

function getExerciseDetail(exercise) { return (exercise?.description || exercise?.target || exercise?.reps || exercise?.details || ''); }

async function saveAmrapResults() { /* ... function from previous turn ... */ }

$: startButtonLabel = state.isRunning ? 'Pause' : (state.phaseIndex >= 0 && !state.isComplete ? 'Resume' : 'Start');

onDestroy(() => clearInterval(timerId));
</script>

<style>
/* Final, clean CSS */
</style>
