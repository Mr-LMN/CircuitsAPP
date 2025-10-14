<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { db } from '$lib/firebase';
import { normaliseStationAssignments, serialiseStationAssignments } from '$lib/stationAssignments';
import { doc, onSnapshot, addDoc, serverTimestamp, collection, setDoc, runTransaction, deleteDoc } from 'firebase/firestore';
import { user } from '$lib/store';

export let data;
const { session, workout } = data;

let liveState = { phase: 'Connecting...', remaining: 0, currentStation: 0, isComplete: false, movesCompleted: 0 };

let userProfile = {};
let myCurrentStationIndex = -1;
let myNextStationIndex = -1;
let previousStationIndex = -1;

let hasSavedFinalScore = false;
let hasJoinedRoster = false;
let wantsPartnerPairing = workout.mode !== 'Partner';

let rosterStatus = 'idle';
let rosterError = '';

let myScoreRef = null;
let unsubscribe = [];

const createEntryScore = () => ({ reps: '', weight: '', cals: '', dist: '' });
const createCumulativeScore = () => ({ reps: 0, weight: 0, cals: 0, dist: '' });

let currentEntries = workout.exercises.map((ex) => ({
        stationName: ex.name,
        category: ex.category,
        score: createEntryScore()
}));

let cumulativeScores = workout.exercises.map((ex) => ({
        stationName: ex.name,
        category: ex.category,
        score: createCumulativeScore()
}));

let pendingStations = new Set();

let lastSavedStationIndex = -1;
let lastSaveMessage = '';
let lastSaveType = 'idle';

let finalSaveStatus = 'idle';
let finalSaveMessage = '';
let previousCompletionState = false;

onMount(() => {
        const userUid = $user?.uid;
        if (!userUid) return;

        myScoreRef = doc(db, 'sessions', session.id, 'attendees', userUid);

        const profileRef = doc(db, 'profiles', userUid);
        const unsubProfile = onSnapshot(profileRef, (docSnap) => {
                if (docSnap.exists()) {
                        userProfile = docSnap.data();
                }
        });

        const liveStateRef = doc(db, 'sessions', session.id, 'liveState', 'data');
        const unsubState = onSnapshot(liveStateRef, (docSnap) => {
                if (docSnap.exists()) {
                        liveState = docSnap.data();
                }
        });

        const unsubScore = onSnapshot(myScoreRef, (docSnap) => {
                const didJoin = docSnap.exists();
                if (didJoin !== hasJoinedRoster) {
                        hasJoinedRoster = didJoin;
                }
                if (didJoin && workout.mode === 'Partner') {
                        wantsPartnerPairing = true;
                }
        });

        unsubscribe = [unsubProfile, unsubState, unsubScore];

        return () => unsubscribe.forEach((unsub) => unsub && unsub());
});

function setEntryScore(index, newScore) {
        const next = [...currentEntries];
        next[index] = { ...next[index], score: newScore };
        currentEntries = next;
}

function setCumulativeScore(index, newScore) {
        const next = [...cumulativeScores];
        next[index] = { ...next[index], score: newScore };
        cumulativeScores = next;
}

function resetEntry(index) {
        setEntryScore(index, createEntryScore());
}

function hasEntryValue(entry) {
        if (!entry) return false;
        return ['reps', 'weight', 'cals'].some((key) => Number(entry[key]) > 0) || (entry.dist && entry.dist.trim().length > 0);
}

function handleEntryChange(index, field, rawValue) {
        if (index < 0 || !currentEntries[index]) return;

        const entry = { ...currentEntries[index].score };
        if (field === 'dist') {
                entry.dist = rawValue;
        } else {
                const numeric = Number(rawValue);
                entry[field] = rawValue === '' ? '' : Math.max(0, Number.isFinite(numeric) ? Math.round(numeric) : 0);
        }

        setEntryScore(index, entry);

        if (hasEntryValue(entry)) {
                pendingStations.add(index);
        } else {
                pendingStations.delete(index);
        }
        pendingStations = new Set(pendingStations);

        if (lastSavedStationIndex === index && !hasEntryValue(entry)) {
                lastSaveMessage = '';
                lastSaveType = 'idle';
        }
}

async function commitStationScore(index, { auto = false } = {}) {
        if (!hasJoinedRoster || index < 0 || !currentEntries[index]) return;

        const entry = currentEntries[index].score;
        if (!hasEntryValue(entry)) {
                pendingStations.delete(index);
                pendingStations = new Set(pendingStations);
                resetEntry(index);
                if (!auto) {
                        lastSavedStationIndex = index;
                        lastSaveType = 'info';
                        lastSaveMessage = 'Add a value before saving.';
                }
                return;
        }

        const cumulative = { ...cumulativeScores[index].score };
        const numericFields = ['reps', 'weight', 'cals'];
        let hasUpdates = false;

        numericFields.forEach((field) => {
                const amount = Number(entry[field]);
                if (Number.isFinite(amount) && amount > 0) {
                        cumulative[field] = (cumulative[field] || 0) + amount;
                        hasUpdates = true;
                }
        });

        if (entry.dist && entry.dist.trim()) {
                cumulative.dist = cumulative.dist ? `${cumulative.dist} + ${entry.dist.trim()}` : entry.dist.trim();
                hasUpdates = true;
        }

        if (!hasUpdates) {
                pendingStations.delete(index);
                pendingStations = new Set(pendingStations);
                resetEntry(index);
                return;
        }

        setCumulativeScore(index, cumulative);
        pendingStations.delete(index);
        pendingStations = new Set(pendingStations);
        resetEntry(index);

        try {
                await updateLiveScore(cumulative);
                lastSavedStationIndex = index;
                lastSaveType = auto ? 'auto' : 'success';
                lastSaveMessage = auto
                        ? 'Saved automatically for your last station.'
                        : 'Score saved!'
                ;
        } catch (error) {
                console.error('Failed to update live score', error);
                lastSavedStationIndex = index;
                lastSaveType = 'error';
                lastSaveMessage = 'Could not save your score. Please try again.';
        }
}

async function updateLiveScore(scoreObject) {
        if (!hasJoinedRoster || !myScoreRef) return;

        const cleanedScore = {};
        ['reps', 'weight', 'cals'].forEach((field) => {
                const value = Number(scoreObject[field]);
                if (Number.isFinite(value) && value > 0) {
                        cleanedScore[field] = value;
                }
        });
        if (scoreObject.dist && String(scoreObject.dist).trim()) {
                cleanedScore.dist = String(scoreObject.dist).trim();
        }

        try {
                await setDoc(
                        myScoreRef,
                        {
                                displayName: userProfile.displayName ?? '',
                                score: cleanedScore,
                                currentStation: myCurrentStationIndex >= 0 ? myCurrentStationIndex + 1 : 0,
                                updatedAt: serverTimestamp()
                        },
                        { merge: true }
                );
        } catch (error) {
                console.error('Failed to sync live score', error);
                throw error;
        }
}

async function joinStationRoster() {
        if (rosterStatus === 'joining' || hasJoinedRoster || !$user?.uid || !myScoreRef) return;

        const displayName = (userProfile.displayName || '').trim();
        const totalStations = workout.exercises?.length ?? 0;

        if (!displayName) {
                rosterError = 'Add your display name in your profile to join the rotation.';
                return;
        }
        if (!totalStations) {
                rosterError = 'This workout has no stations configured yet.';
                return;
        }

        const uppercaseName = displayName.toUpperCase();
        const sessionRef = doc(db, 'sessions', session.id);

        rosterStatus = 'joining';
        rosterError = '';

        try {
                await runTransaction(db, async (transaction) => {
                        const snap = await transaction.get(sessionRef);
                        if (!snap.exists()) return;

                        const data = snap.data();
                        let assignments = normaliseStationAssignments(data?.stationAssignments, totalStations);

                        if (assignments.length < totalStations) {
                                assignments = assignments.concat(
                                        Array.from({ length: totalStations - assignments.length }, () => [])
                                );
                        } else if (assignments.length > totalStations) {
                                assignments = assignments.slice(0, totalStations);
                        }

                        assignments = assignments.map((codes) => codes.filter((code) => code !== uppercaseName));

                        const counts = assignments.map((codes) => codes.length);
                        const minCount = counts.length ? Math.min(...counts) : 0;
                        let targetIndex = counts.findIndex((count) => count === minCount);
                        if (targetIndex === -1) targetIndex = 0;

                        assignments[targetIndex] = [...(assignments[targetIndex] ?? []), uppercaseName];

                        transaction.set(
                                sessionRef,
                                { stationAssignments: serialiseStationAssignments(assignments, totalStations) },
                                { merge: true }
                        );
                });

                await setDoc(
                        myScoreRef,
                        { displayName, score: {}, currentStation: 0, joinedAt: serverTimestamp() },
                        { merge: true }
                );

                hasJoinedRoster = true;
                wantsPartnerPairing = true;
        } catch (error) {
                console.error('Failed to join station roster', error);
                rosterError = 'Could not join the rotation. Please try again.';
        } finally {
                rosterStatus = 'idle';
        }
}

async function leaveStationRoster() {
        if (rosterStatus === 'leaving' || !$user?.uid || !hasJoinedRoster || !myScoreRef) return;

        const displayName = (userProfile.displayName || '').trim();
        const uppercaseName = displayName.toUpperCase();
        const totalStations = workout.exercises?.length ?? 0;
        const sessionRef = doc(db, 'sessions', session.id);

        rosterStatus = 'leaving';
        rosterError = '';

        try {
                if (uppercaseName && totalStations) {
                        await runTransaction(db, async (transaction) => {
                                const snap = await transaction.get(sessionRef);
                                if (!snap.exists()) return;

                                const data = snap.data();
                                let assignments = normaliseStationAssignments(data?.stationAssignments, totalStations);
                                assignments = assignments.map((codes) => codes.filter((code) => code !== uppercaseName));

                                transaction.set(
                                        sessionRef,
                                        { stationAssignments: serialiseStationAssignments(assignments, totalStations) },
                                        { merge: true }
                                );
                        });
                }

                await deleteDoc(myScoreRef);

                hasJoinedRoster = false;
                wantsPartnerPairing = false;
                myCurrentStationIndex = -1;
                myNextStationIndex = -1;
                previousStationIndex = -1;
        } catch (error) {
                console.error('Failed to leave station roster', error);
                rosterError = 'Could not update the roster. Please try again.';
        } finally {
                rosterStatus = 'idle';
        }
}

function hasTotals(index) {
        if (index < 0 || !cumulativeScores[index]) return false;
        const totals = cumulativeScores[index].score;
        return ['reps', 'weight', 'cals'].some((key) => Number(totals[key]) > 0) || (totals.dist && totals.dist.trim());
}

async function saveFinalScores() {
        if (hasSavedFinalScore || !$user?.uid) return;

        finalSaveStatus = 'saving';
        finalSaveMessage = '';

        const cleanedScores = cumulativeScores
                .map((item) => {
                        const cleaned = {};
                        if (Number(item.score.reps) > 0) cleaned.reps = Number(item.score.reps);
                        if (Number(item.score.weight) > 0) cleaned.weight = Number(item.score.weight);
                        if (Number(item.score.cals) > 0) cleaned.cals = Number(item.score.cals);
                        if (item.score.dist && item.score.dist.trim()) cleaned.dist = item.score.dist.trim();

                        return Object.keys(cleaned).length
                                ? { stationName: item.stationName, category: item.category, score: cleaned }
                                : null;
                })
                .filter(Boolean);

        if (!cleanedScores.length) {
                finalSaveStatus = 'error';
                finalSaveMessage = 'Log at least one score before uploading your workout.';
                return;
        }

        try {
                await addDoc(collection(db, 'scores'), {
                        userId: $user.uid,
                        displayName: userProfile.displayName,
                        workoutId: workout.id,
                        workoutTitle: workout.title,
                        date: serverTimestamp(),
                        exerciseScores: cleanedScores
                });

                hasSavedFinalScore = true;
                finalSaveStatus = 'success';
                finalSaveMessage = 'Workout uploaded to your dashboard.';
        } catch (error) {
                console.error('Error saving score:', error);
                finalSaveStatus = 'error';
                finalSaveMessage = 'Failed to upload workout. Please try again.';
        }
}

$: totalStations = workout.exercises?.length ?? 0;

$: if (myScoreRef && userProfile.displayName && workout.mode !== 'Partner' && !hasJoinedRoster && rosterStatus === 'idle') {
        wantsPartnerPairing = true;
        void joinStationRoster();
}

$: if (
        myScoreRef &&
        userProfile.displayName &&
        workout.mode === 'Partner' &&
        wantsPartnerPairing &&
        !hasJoinedRoster &&
        rosterStatus === 'idle'
) {
        void joinStationRoster();
}

$: if (workout.mode === 'Partner' && !wantsPartnerPairing && hasJoinedRoster && rosterStatus === 'idle') {
        void leaveStationRoster();
}

$: if (userProfile.displayName && hasJoinedRoster) {
        const assignments = normaliseStationAssignments(
                liveState.stationAssignments ?? session.stationAssignments,
                workout.exercises.length
        );
        if (assignments.length && liveState.movesCompleted !== undefined) {
                const uppercaseName = userProfile.displayName?.toUpperCase();
                let startingIndex = -1;
                assignments.forEach((roster, index) => {
                        if (roster.includes(uppercaseName)) {
                                startingIndex = index;
                        }
                });

                if (startingIndex !== -1) {
                        const total = workout.exercises.length;
                        myCurrentStationIndex = (startingIndex + liveState.movesCompleted) % total;
                        myNextStationIndex = (myCurrentStationIndex + 1) % total;
                } else {
                        myCurrentStationIndex = -1;
                        myNextStationIndex = -1;
                }
        }
} else {
        myCurrentStationIndex = -1;
        myNextStationIndex = -1;
}

$: if (hasJoinedRoster && myCurrentStationIndex !== previousStationIndex) {
        if (previousStationIndex !== -1) {
                void commitStationScore(previousStationIndex, { auto: true });
        }
        previousStationIndex = myCurrentStationIndex;
        if (myCurrentStationIndex !== lastSavedStationIndex) {
                lastSaveMessage = '';
                lastSaveType = 'idle';
        }
}

$: if (liveState.isComplete && !previousCompletionState) {
        previousCompletionState = true;
        if (myCurrentStationIndex !== -1) {
                void commitStationScore(myCurrentStationIndex, { auto: true });
        }
} else if (!liveState.isComplete && previousCompletionState) {
        previousCompletionState = false;
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
$: hasPendingForCurrent = myCurrentStationIndex >= 0 && pendingStations.has(myCurrentStationIndex);

function formatTime(s) {
        const secs = Math.max(0, Math.ceil(s));
        return String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
}
</script>

<div class="tracker-container">
        <header class="tracker-header">
                <h1>{liveState.phase}</h1>
                <div class="main-time">{formatTime(liveState.remaining)}</div>
                {#if liveState.currentStationMeta?.category || intervalDuration}
                        <div class="phase-meta">
                                {#if liveState.currentStationMeta?.category}
                                        <span class="phase-chip">{liveState.currentStationMeta.category}</span>
                                {/if}
                                {#if intervalDuration}
                                        <span class="phase-chip">Interval: {Math.round(intervalDuration)}s</span>
                                {/if}
                        </div>
                {/if}
        </header>

        {#if workout.mode === 'Partner'}
                <section class="pairing-controls" aria-live="polite">
                        <div class="pairing-copy">
                                <h2>Partner pairing</h2>
                                <p>
                                        {#if hasJoinedRoster}
                                                You are currently rotating with a partner. Leave the rotation if you would rather train solo.
                                        {:else}
                                                Choose whether to be added to the partner rotation for this workout.
                                        {/if}
                                </p>
                                {#if rosterError}
                                        <p class="pairing-error">{rosterError}</p>
                                {/if}
                        </div>
                        <div class="pairing-actions">
                                {#if hasJoinedRoster}
                                        <button
                                                class="btn btn-outline"
                                                on:click={() => {
                                                        wantsPartnerPairing = false;
                                                        void leaveStationRoster();
                                                }}
                                                disabled={rosterStatus === 'joining' || rosterStatus === 'leaving'}
                                        >
                                                {rosterStatus === 'leaving' ? 'Leaving...' : 'Leave rotation'}
                                        </button>
                                {:else}
                                        <button
                                                class="btn btn-primary"
                                                on:click={() => {
                                                        wantsPartnerPairing = true;
                                                        void joinStationRoster();
                                                }}
                                                disabled={!userProfile.displayName || rosterStatus === 'joining'}
                                        >
                                                {rosterStatus === 'joining' ? 'Joining...' : 'Join rotation'}
                                        </button>
                                {/if}
                        </div>
                </section>
        {/if}

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
                                        <div class="input-row column">
                                                <label>
                                                        <span>Reps</span>
                                                        <input
                                                                type="number"
                                                                inputmode="numeric"
                                                                min="0"
                                                                placeholder="0"
                                                                value={currentEntries[myCurrentStationIndex].score.reps}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'reps', event.target.value)}
                                                        />
                                                </label>
                                                <label>
                                                        <span>Weight (kg)</span>
                                                        <input
                                                                type="number"
                                                                inputmode="decimal"
                                                                min="0"
                                                                placeholder="0"
                                                                value={currentEntries[myCurrentStationIndex].score.weight}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'weight', event.target.value)}
                                                        />
                                                </label>
                                        </div>
                                {:else if myStationData.category === 'Cardio Machine'}
                                        <div class="input-row column">
                                                <label>
                                                        <span>Calories</span>
                                                        <input
                                                                type="number"
                                                                inputmode="numeric"
                                                                min="0"
                                                                placeholder="0"
                                                                value={currentEntries[myCurrentStationIndex].score.cals}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'cals', event.target.value)}
                                                        />
                                                </label>
                                                <label>
                                                        <span>Distance</span>
                                                        <input
                                                                type="text"
                                                                inputmode="text"
                                                                placeholder="e.g. 200m"
                                                                value={currentEntries[myCurrentStationIndex].score.dist}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'dist', event.target.value)}
                                                        />
                                                </label>
                                        </div>
                                {:else}
                                        <div class="input-row column single-input">
                                                <label>
                                                        <span>Reps</span>
                                                        <input
                                                                type="number"
                                                                inputmode="numeric"
                                                                min="0"
                                                                placeholder="0"
                                                                value={currentEntries[myCurrentStationIndex].score.reps}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'reps', event.target.value)}
                                                        />
                                                </label>
                                        </div>
                                {/if}

                                <button
                                        class="btn btn-save"
                                        on:click={() => commitStationScore(myCurrentStationIndex)}
                                        disabled={!hasPendingForCurrent || rosterStatus === 'leaving'}
                                >
                                        ✓ Save interval
                                </button>

                                {#if lastSaveMessage && lastSavedStationIndex === myCurrentStationIndex}
                                        <p class={`save-feedback ${lastSaveType}`}>{lastSaveMessage}</p>
                                {/if}

                                {#if hasTotals(myCurrentStationIndex)}
                                        <div class="totals">
                                                <h3>Totals logged</h3>
                                                <ul>
                                                        {#if Number(cumulativeScores[myCurrentStationIndex].score.reps) > 0}
                                                                <li><span>Reps</span><span>{cumulativeScores[myCurrentStationIndex].score.reps}</span></li>
                                                        {/if}
                                                        {#if Number(cumulativeScores[myCurrentStationIndex].score.weight) > 0}
                                                                <li><span>Weight</span><span>{cumulativeScores[myCurrentStationIndex].score.weight} kg</span></li>
                                                        {/if}
                                                        {#if Number(cumulativeScores[myCurrentStationIndex].score.cals) > 0}
                                                                <li><span>Calories</span><span>{cumulativeScores[myCurrentStationIndex].score.cals}</span></li>
                                                        {/if}
                                                        {#if cumulativeScores[myCurrentStationIndex].score.dist && cumulativeScores[myCurrentStationIndex].score.dist.trim()}
                                                                <li><span>Distance</span><span>{cumulativeScores[myCurrentStationIndex].score.dist}</span></li>
                                                        {/if}
                                                </ul>
                                        </div>
                                {/if}
                        </div>
                </main>

                <footer class="station-info">
                        <div class="station-display current">
                                <h2>NOW: Station {myCurrentStationIndex + 1} - {myStationData.name}</h2>
                                <div class="task-line"><span class="task-label p1">P1</span><span class="task-text">{myStationData.p1?.task}</span></div>
                                {#if myStationData.p2?.task}
                                        <div class="task-line"><span class="task-label p2">P2</span><span class="task-text">{myStationData.p2.task}</span></div>
                                {/if}
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
                                {#if workout.mode === 'Partner'}
                                        <h2>{hasJoinedRoster ? 'Waiting for your station...' : 'Ready to partner up?'}</h2>
                                        <p>
                                                {#if hasJoinedRoster}
                                                        Hang tight while we slot you into the next station.
                                                {:else}
                                                        Join the rotation when you're ready and we'll assign you to a station as soon as the next interval starts.
                                                {/if}
                                        </p>
                                        {#if !hasJoinedRoster}
                                                <button
                                                        class="btn btn-primary"
                                                        on:click={() => {
                                                                wantsPartnerPairing = true;
                                                                void joinStationRoster();
                                                        }}
                                                        disabled={!userProfile.displayName || rosterStatus === 'joining'}
                                                >
                                                        {rosterStatus === 'joining' ? 'Joining...' : 'Join rotation'}
                                                </button>
                                        {/if}
                                {:else}
                                        <h2>Connecting to Session...</h2>
                                        <p>Waiting for the admin to start the workout and assign you to a station.</p>
                                {/if}
                        </div>
                </main>
        {/if}

        {#if liveState.isComplete}
                <section class="post-workout-card" aria-live="polite">
                        <h2>Workout complete</h2>
                        <p>Upload your results to save them to your dashboard.</p>
                        <button
                                class="btn btn-primary"
                                on:click={saveFinalScores}
                                disabled={finalSaveStatus === 'saving' || hasSavedFinalScore}
                        >
                                {hasSavedFinalScore ? 'Uploaded' : finalSaveStatus === 'saving' ? 'Uploading...' : 'Upload workout'}
                        </button>
                        {#if finalSaveMessage}
                                <p class={`status ${finalSaveStatus}`}>{finalSaveMessage}</p>
                        {/if}
                </section>
        {/if}
</div>

<style>
:root {
        --font-body: 'Inter', sans-serif;
        --font-display: 'Bebas Neue', sans-serif;
        --brand-yellow: #fde047;
        --brand-green: #16a34a;
        --bg-main: #0f172a;
        --bg-panel: #111c32;
        --surface-1: rgba(255, 255, 255, 0.06);
        --surface-2: rgba(255, 255, 255, 0.08);
        --surface-3: rgba(255, 255, 255, 0.12);
        --border-color: rgba(255, 255, 255, 0.08);
        --text-primary: #f9fafb;
        --text-secondary: #cbd5f5;
        --text-muted: #94a3b8;
}

:global(body) {
        background-color: var(--bg-main);
        color: var(--text-primary);
        font-family: var(--font-body);
}

.tracker-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--deep-space);
        padding: 1.5rem;
        text-align: center;
        gap: 1rem;
}

.tracker-header h1 {
        font-family: var(--font-display);
        font-size: 2.5rem;
        color: var(--text-secondary);
}

.main-time {
        font-family: var(--font-display);
        font-size: 4rem;
        color: var(--brand-yellow);
        line-height: 1;
}

.phase-meta {
        margin-top: 0.5rem;
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        flex-wrap: wrap;
}

.phase-chip {
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 999px;
        padding: 0.2rem 0.75rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
}

.pairing-controls {
        display: flex;
        gap: 1rem;
        align-items: center;
        justify-content: space-between;
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.25rem 1.5rem;
        text-align: left;
}

.pairing-copy h2 {
        margin: 0 0 0.25rem;
        font-size: 1.1rem;
        color: var(--text-secondary);
}

.pairing-copy p {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.9rem;
}

.pairing-error {
        margin-top: 0.5rem;
        color: #f87171;
        font-size: 0.85rem;
}

.pairing-actions {
        display: flex;
        gap: 0.75rem;
        flex-shrink: 0;
}

.btn {
        border-radius: 999px;
        padding: 0.65rem 1.5rem;
        font-weight: 700;
        cursor: pointer;
        border: none;
        transition: transform 140ms ease, box-shadow 140ms ease;
        font-size: 1rem;
}

.btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
}

.btn-primary {
        background: var(--brand-green);
        color: var(--text-primary);
        box-shadow: 0 12px 30px -18px rgba(22, 163, 74, 0.9);
}

.btn-primary:not(:disabled):hover {
        transform: translateY(-2px);
        box-shadow: 0 18px 40px -16px rgba(22, 163, 74, 0.9);
}

.btn-outline {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
}

.btn-outline:not(:disabled):hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 24px -18px rgba(148, 163, 184, 0.6);
}

.btn-save {
        margin-top: 1rem;
        width: 100%;
        border-radius: 12px;
        background: var(--brand-green);
        color: var(--text-primary);
        box-shadow: 0 16px 32px -20px rgba(22, 163, 74, 0.9);
}

.btn-save:not(:disabled):hover {
        transform: translateY(-2px);
        box-shadow: 0 22px 45px -18px rgba(22, 163, 74, 0.9);
}

.tracker-main {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        width: 100%;
}

.score-card {
        background: var(--surface-1);
        width: 100%;
        max-width: 420px;
        padding: 1.5rem;
        border-radius: 16px;
        border: 1px solid var(--border-color);
        text-align: center;
}

.score-label {
        font-size: 0.9rem;
        color: var(--text-muted);
        text-transform: uppercase;
}

.score-meta {
        margin-top: 0.75rem;
        display: flex;
        gap: 0.5rem;
        justify-content: center;
        flex-wrap: wrap;
}

.score-chip {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid var(--border-color);
        border-radius: 999px;
        padding: 0.3rem 0.75rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
}

.input-row {
        display: flex;
        gap: 1rem;
        align-items: center;
        justify-content: center;
        margin-top: 0.75rem;
}

.input-row.column {
        flex-direction: column;
}

.input-row label {
        width: 100%;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
}

.input-row label span {
        font-size: 0.8rem;
        color: var(--text-muted);
}

.input-row input {
        font-size: 2rem;
        width: 100%;
        text-align: center;
        background: var(--deep-space);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: 8px;
        padding: 0.6rem;
        font-family: var(--font-display);
}

.input-row.single-input input {
        max-width: 100%;
}

.save-feedback {
        margin-top: 0.75rem;
        font-size: 0.85rem;
}

.save-feedback.success {
        color: var(--brand-green);
}

.save-feedback.error {
        color: #f87171;
}

.save-feedback.auto {
        color: var(--text-secondary);
}

.save-feedback.info {
        color: var(--text-muted);
}

.totals {
        margin-top: 1.25rem;
        text-align: left;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1rem;
}

.totals h3 {
        margin: 0 0 0.75rem;
        font-size: 0.95rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-secondary);
}

.totals ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
}

.totals li {
        display: flex;
        justify-content: space-between;
        color: var(--text-primary);
        font-size: 0.95rem;
}

.station-info {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
}

.station-display {
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1rem;
        text-align: left;
}

.station-display.current {
        border-left: 4px solid var(--brand-yellow);
}

.station-display.next {
        opacity: 0.6;
}

.station-info h2 {
        font-size: 1.1rem;
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
        width: 22px;
        height: 22px;
        border-radius: 50%;
        font-size: 0.6rem;
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

.waiting-message {
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 2rem;
        max-width: 420px;
}

.waiting-message h2 {
        font-size: 1.5rem;
        color: var(--brand-yellow);
}

.waiting-message p {
        color: var(--text-secondary);
        margin: 0.75rem 0 1rem;
}

.post-workout-card {
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.5rem;
        text-align: center;
}

.post-workout-card h2 {
        margin-bottom: 0.5rem;
        font-size: 1.4rem;
        color: var(--text-secondary);
}

.post-workout-card p {
        margin: 0.5rem 0 1rem;
        color: var(--text-muted);
}

.post-workout-card .status {
        margin-top: 0.75rem;
        font-size: 0.9rem;
}

.post-workout-card .status.success {
        color: var(--brand-green);
}

.post-workout-card .status.error {
        color: #f87171;
}

@media (max-width: 640px) {
        .tracker-container {
                padding: 1rem;
        }

        .pairing-controls {
                flex-direction: column;
                align-items: flex-start;
        }

        .pairing-actions {
                width: 100%;
                justify-content: flex-start;
        }

        .btn {
                width: 100%;
                justify-content: center;
        }

        .score-card {
                padding: 1.25rem;
        }

        .station-info {
                gap: 0.75rem;
        }
}
</style>
