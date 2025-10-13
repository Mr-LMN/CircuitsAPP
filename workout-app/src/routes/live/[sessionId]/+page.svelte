<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { db } from '$lib/firebase';
import { normaliseStationAssignments, serialiseStationAssignments } from '$lib/stationAssignments';
import { doc, onSnapshot, updateDoc, addDoc, serverTimestamp, collection, setDoc, runTransaction } from 'firebase/firestore';
import { user } from '$lib/store';

export let data;
const { session, workout } = data;

// This holds the live state broadcast from the admin's timer
let liveState = { phase: 'Connecting...', remaining: 0, currentStation: 0, isComplete: false, movesCompleted: 0 };

let userProfile = {};
let myCurrentStationIndex = -1;
let myNextStationIndex = -1;
let hasSavedFinalScore = false;
let hasJoinedRoster = false;

// This holds a structured score for every station in the workout
let liveScores = workout.exercises.map(ex => ({
stationName: ex.name,
category: ex.category,
score: { reps: 0, weight: 0, cals: 0, dist: '' }
}));

let unsubscribe = [];

onMount(() => {
const userUid = $user?.uid;
if (!userUid) return;

const profileRef = doc(db, 'profiles', userUid);
const unsubProfile = onSnapshot(profileRef, (doc) => { if (doc.exists()) { userProfile = doc.data(); } });

const liveStateRef = doc(db, 'sessions', session.id, 'liveState', 'data');
const unsubState = onSnapshot(liveStateRef, (doc) => {
if (doc.exists()) {
liveState = doc.data();
if (liveState.isComplete && !hasSavedFinalScore) {
saveFinalScores();
}
}
});

const myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);
const unsubScore = onSnapshot(myScoreRef, (doc) => {
if (doc.exists()) {
// This part is for the live scoreboard on the admin screen, we don't need to read it back here
} else {
// Announce presence to the admin's live scoreboard
setDoc(myScoreRef, { displayName: userProfile.displayName, score: 0, currentStation: 0 });
}
});

unsubscribe = [unsubProfile, unsubState, unsubScore];
return () => unsubscribe.forEach(unsub => unsub());
});

async function updateLiveScore(scoreObject) {
const userUid = $user?.uid;
if (!userUid || myCurrentStationIndex < 0) return;

const myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);
await updateDoc(myScoreRef, {
score: scoreObject,
currentStation: myCurrentStationIndex + 1
});
}

async function saveFinalScores() {
if (hasSavedFinalScore || !$user?.uid) return;
hasSavedFinalScore = true;

const cleanedScores = liveScores.map(item => {
const cleanedScore = {};
for (const key in item.score) {
if (item.score[key] !== null && item.score[key] !== '' && item.score[key] > 0) {
cleanedScore[key] = item.score[key];
}
}
return { ...item, score: cleanedScore };
}).filter(item => Object.keys(item.score).length > 0);

if (cleanedScores.length === 0) return;

await addDoc(collection(db, 'scores'), {
userId: $user.uid,
displayName: userProfile.displayName,
workoutId: workout.id,
workoutTitle: workout.title,
date: serverTimestamp(),
exerciseScores: cleanedScores
});
}

async function joinStationRoster() {
 if (hasJoinedRoster || !$user?.uid) return;

 const displayName = (userProfile.displayName || '').trim();
 const totalStations = workout.exercises?.length ?? 0;
 if (!displayName || totalStations === 0) return;

 const uppercaseName = displayName.toUpperCase();
 const sessionRef = doc(db, 'sessions', session.id);

 try {
 await runTransaction(db, async (transaction) => {
 const snap = await transaction.get(sessionRef);
 if (!snap.exists()) return;

 const data = snap.data();
 let assignments = normaliseStationAssignments(data?.stationAssignments, totalStations);

 if (assignments.length < totalStations) {
 assignments = assignments.concat(Array.from({ length: totalStations - assignments.length }, () => []));
 } else if (assignments.length > totalStations) {
 assignments = assignments.slice(0, totalStations);
 }

 assignments = assignments.map((codes) => codes.filter((code) => code !== uppercaseName));

 const counts = assignments.map((codes) => codes.length);
 const minCount = counts.length ? Math.min(...counts) : 0;
 let targetIndex = counts.findIndex((count) => count === minCount);
 if (targetIndex === -1) {
 targetIndex = 0;
 }

 assignments[targetIndex] = [...(assignments[targetIndex] ?? []), uppercaseName];

 transaction.set(
 sessionRef,
 { stationAssignments: serialiseStationAssignments(assignments, totalStations) },
 { merge: true }
 );
 });

 hasJoinedRoster = true;
 } catch (error) {
 console.error('Failed to join station roster', error);
 }
}

$: if (userProfile.displayName && !hasJoinedRoster) {
 void joinStationRoster();
}

$: if (userProfile.displayName) {
const assignments = normaliseStationAssignments(
 liveState.stationAssignments ?? session.stationAssignments,
 workout.exercises.length
);
if (assignments.length && liveState.movesCompleted !== undefined) {
let myStartingIndex = -1;
assignments.forEach((roster, index) => {
if (roster.includes(userProfile.displayName?.toUpperCase())) {
myStartingIndex = index;
}
});

if (myStartingIndex !== -1) {
const totalStations = workout.exercises.length;
myCurrentStationIndex = (myStartingIndex + liveState.movesCompleted) % totalStations;
myNextStationIndex = (myCurrentStationIndex + 1) % totalStations;
}
}
}

$: myStationData = myCurrentStationIndex !== -1 ? workout.exercises[myCurrentStationIndex] : null;
$: nextStationData = myNextStationIndex !== -1 ? workout.exercises[myNextStationIndex] : null;
$: intervalDuration = liveState?.duration || liveState?.timing?.work || session?.timing?.work || null;
$: metricLabel = myStationData
        ? myStationData.category === 'Resistance'
                ? 'Reps & Weight'
                : myStationData.category === 'Cardio Machine'
                ? 'Calories & Distance'
                : 'Reps'
        : '';

function formatTime(s) { const secs = Math.max(0, Math.ceil(s)); return (String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0')); }
</script>

<div class="tracker-container">
<header class="tracker-header">
<h1>{liveState.phase}</h1>
<div class="main-time">{formatTime(liveState.remaining)}</div>
{#if (liveState.currentStationMeta?.category || intervalDuration)}
<div class="phase-meta">
{#if liveState.currentStationMeta?.category}<span class="phase-chip">{liveState.currentStationMeta.category}</span>{/if}
{#if intervalDuration}<span class="phase-chip">Interval: {Math.round(intervalDuration)}s</span>{/if}
</div>
{/if}
</header>

{#if myStationData}
<main class="tracker-main">
<div class="score-card">
<span class="score-label">Log Your Score</span>
{#if metricLabel || intervalDuration}
<div class="score-meta">
{#if metricLabel}<span class="score-chip">{metricLabel}</span>{/if}
{#if intervalDuration}<span class="score-chip">Interval: {Math.round(intervalDuration)}s</span>{/if}
</div>
{/if}
{#if myStationData.category === 'Resistance'}
<div class="input-row">
<label><span>Reps</span><input type="number" placeholder="0" bind:value={liveScores[myCurrentStationIndex].score.reps} on:change={() => updateLiveScore(liveScores[myCurrentStationIndex].score)} /></label>
<label><span>Weight (kg)</span><input type="number" placeholder="0" bind:value={liveScores[myCurrentStationIndex].score.weight} on:change={() => updateLiveScore(liveScores[myCurrentStationIndex].score)} /></label>
</div>
{:else if myStationData.category === 'Cardio Machine'}
<div class="input-row">
<label><span>Calories</span><input type="number" placeholder="0" bind:value={liveScores[myCurrentStationIndex].score.cals} on:change={() => updateLiveScore(liveScores[myCurrentStationIndex].score)} /></label>
<label><span>Distance</span><input type="text" placeholder="0" bind:value={liveScores[myCurrentStationIndex].score.dist} on:change={() => updateLiveScore(liveScores[myCurrentStationIndex].score)} /></label>
</div>
{:else} <div class="input-row single">
<button on:click={() => { liveScores[myCurrentStationIndex].score.reps--; updateLiveScore(liveScores[myCurrentStationIndex].score); }}>-</button>
<span class="score-value">{liveScores[myCurrentStationIndex].score.reps || 0}</span>
<button on:click={() => { liveScores[myCurrentStationIndex].score.reps++; updateLiveScore(liveScores[myCurrentStationIndex].score); }}>+</button>
</div>
<span class="score-label-bottom">Reps</span>
{/if}
</div>
</main>

<footer class="station-info">
<div class="station-display current">
<h2>NOW: Station {myCurrentStationIndex + 1} - {myStationData.name}</h2>
<div class="task-line"><span class="task-label p1">P1</span><span class="task-text">{myStationData.p1?.task}</span></div>
{#if myStationData.p2?.task}<div class="task-line"><span class="task-label p2">P2</span><span class="task-text">{myStationData.p2.task}</span></div>{/if}
</div>
{#if nextStationData}
<div class="station-display next">
<h2>NEXT: Station {myNextStationIndex + 1} - {nextStationData.name}</h2>
</div>
{/if}
</footer>
{:else}
<main class="tracker-main">
<div class="waiting-message">
<h2>Connecting to Session...</h2>
<p>Waiting for the admin to start the workout and assign you to a station.</p>
</div>
</main>
{/if}
</div>

<style>
.tracker-container { display: flex; flex-direction: column; height: 100vh; background: var(--deep-space); padding: 1.5rem; text-align: center; gap: 1rem; }
.tracker-header h1 { font-family: var(--font-display); font-size: 2.5rem; color: var(--text-secondary); }
.main-time { font-family: var(--font-display); font-size: 4rem; color: var(--brand-yellow); line-height: 1; }
.phase-meta { margin-top: 0.5rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
.phase-chip { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 999px; padding: 0.2rem 0.75rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.tracker-main { flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; width: 100%; }
.score-card { background: var(--surface-1); width: 100%; max-width: 400px; padding: 1.5rem; border-radius: 16px; border: 1px solid var(--border-color); }
.score-label { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; }
.score-meta { margin-top: 0.75rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
.score-chip { background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border-color); border-radius: 999px; padding: 0.3rem 0.75rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }
.input-row { display: flex; gap: 1rem; align-items: center; justify-content: center; margin-top: 0.5rem; }
.input-row label { flex: 1; text-align: center; }
.input-row label span { font-size: 0.8rem; color: var(--text-muted); }
.input-row input { font-size: 2.5rem; width: 100%; text-align: center; background: var(--deep-space); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 8px; padding: 0.5rem; font-family: var(--font-display); }
.input-row.single { justify-content: space-around; }
.score-value { font-family: var(--font-display); font-size: 5rem; line-height: 1; flex-grow: 1; }
.score-label-bottom { margin-top: -0.5rem; }
.input-row button { background: var(--brand-green); color: var(--text-primary); width: 60px; height: 60px; border-radius: 50%; border: none; font-size: 2.5rem; }
.station-info { flex-shrink: 0; display: flex; flex-direction: column; gap: 1rem; width: 100%; }
.station-display { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 1rem; text-align: left; }
.station-display.current { border-left: 4px solid var(--brand-yellow); }
.station-display.next { opacity: 0.6; }
.station-info h2 { font-size: 1.1rem; margin-bottom: 0.75rem; }
.task-line { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; margin-bottom: 0.5rem; }
.task-label { width: 22px; height: 22px; border-radius: 50%; font-size: 0.6rem; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
.task-label.p1 { background: #34d39933; color: #34d399; }
.task-label.p2 { background: #f472b633; color: #f472b6; }
.waiting-message { padding: 2rem; }
.waiting-message h2 { font-size: 1.5rem; color: var(--brand-yellow); }
.waiting-message p { color: var(--text-secondary); margin-top: 0.5rem; }
</style>
