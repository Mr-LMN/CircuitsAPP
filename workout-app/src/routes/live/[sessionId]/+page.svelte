<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { db } from '$lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { user } from '$lib/store';

export let data;
const { session, workout } = data;
let myScore = 0;
let userProfile = {};

let liveState = { phase: 'Connecting...', remaining: 0, currentStation: 0, isRunning: false, movesCompleted: 0 };
let myCurrentStationIndex = -1;
let hasSyncedProfile = false;

onMount(() => {
const userUid = $user?.uid;
if (!userUid) return;

const profileRef = doc(db, 'profiles', userUid);
const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
if (docSnap.exists()) {
userProfile = docSnap.data();
}
});

const liveStateRef = doc(db, 'sessions', session.id, 'liveState', 'data');
const unsubscribeState = onSnapshot(liveStateRef, (docSnap) => {
if (docSnap.exists()) {
liveState = docSnap.data();
}
});

const myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);
const unsubscribeScore = onSnapshot(myScoreRef, async (docSnap) => {
if (docSnap.exists()) {
myScore = docSnap.data().score || 0;
} else if (userProfile?.displayName) {
await setDoc(myScoreRef, { displayName: userProfile.displayName, score: 0 }, { merge: true });
}
});

return () => {
unsubscribeProfile?.();
unsubscribeState?.();
unsubscribeScore?.();
};
});

async function incrementScore() {
const userUid = $user?.uid;
if (!userUid) return;

const newScore = myScore + 1;
const myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);

await setDoc(myScoreRef, { score: newScore }, { merge: true });
}

function formatTime(s) {
const secs = Math.max(0, Math.ceil(s));
return String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
}

$: {
if (userProfile.displayName && Array.isArray(session.stationAssignments) && workout.exercises?.length) {
let myStartingIndex = -1;

session.stationAssignments.forEach((roster, index) => {
if (Array.isArray(roster) && roster.includes(userProfile.displayName.toUpperCase())) {
myStartingIndex = index;
}
});

if (myStartingIndex !== -1 && typeof liveState.movesCompleted === 'number') {
myCurrentStationIndex = (myStartingIndex + liveState.movesCompleted) % workout.exercises.length;
} else {
myCurrentStationIndex = myStartingIndex;
}
} else {
myCurrentStationIndex = -1;
}
}

$: if (!hasSyncedProfile && userProfile.displayName && $user?.uid) {
const attendeeRef = doc(db, 'sessions', session.id, 'attendees', $user.uid);
setDoc(attendeeRef, { displayName: userProfile.displayName }, { merge: true });
hasSyncedProfile = true;
}

$: myStationData = myCurrentStationIndex !== -1 && workout.exercises ? workout.exercises[myCurrentStationIndex] : null;
</script>

<div class="tracker-container">
<header class="tracker-header">
<h1>{liveState.phase}</h1>
<div class="main-time">{formatTime(liveState.remaining)}</div>
</header>

<main class="tracker-main">
<div class="score-card">
<span class="score-label">Your Score</span>
<span class="score-value">{myScore}</span>
</div>
<button class="add-btn" on:click={incrementScore} disabled={!liveState.isRunning}>+</button>
</main>

<footer class="station-info">
{#if myStationData}
<h2>Station {myCurrentStationIndex + 1}: {myStationData.name}</h2>
<div class="task-line">
<span class="task-label p1">P1</span>
<span class="task-text">{myStationData.p1?.task || myStationData.p1_task || myStationData.name}</span>
</div>
{#if myStationData.p2?.task || myStationData.p2_task}
<div class="task-line">
<span class="task-label p2">P2</span>
<span class="task-text">{myStationData.p2?.task || myStationData.p2_task}</span>
</div>
{/if}
{:else}
<h2>Waiting for admin to start session...</h2>
{/if}
</footer>
</div>

<style>
.tracker-container {
display: flex;
flex-direction: column;
height: 100vh;
background: var(--deep-space);
padding: 1.5rem;
text-align: center;
}
.tracker-header {
flex-shrink: 0;
}
h1 {
font-family: var(--font-display);
font-size: 2.5rem;
color: var(--text-secondary);
letter-spacing: 2px;
}
.main-time {
font-family: var(--font-display);
font-size: 4rem;
color: var(--brand-yellow);
line-height: 1;
}
.tracker-main {
flex-grow: 1;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 1.5rem;
}
.score-card {
background: var(--surface-1);
border-radius: 50%;
width: 180px;
height: 180px;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
border: 1px solid var(--border-color);
}
.score-label {
font-size: 0.9rem;
color: var(--text-muted);
}
.score-value {
font-family: var(--font-display);
font-size: 5rem;
line-height: 1;
}
.add-btn {
background: var(--brand-green);
color: var(--text-primary);
width: 100px;
height: 100px;
border-radius: 50%;
border: none;
font-size: 4rem;
font-weight: 200;
cursor: pointer;
display: flex;
align-items: center;
justify-content: center;
padding-bottom: 0.5rem;
}
.station-info {
flex-shrink: 0;
background: var(--surface-1);
border: 1px solid var(--border-color);
border-radius: 16px;
padding: 1rem;
text-align: left;
}
.station-info h2 {
font-size: 1.2rem;
margin-bottom: 0.75rem;
}
.task-line {
display: flex;
align-items: center;
gap: 0.5rem;
font-size: 0.9rem;
margin-bottom: 0.5rem;
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
</style>
