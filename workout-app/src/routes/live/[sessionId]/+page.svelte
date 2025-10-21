<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { db } from '$lib/firebase';
import { normaliseStationAssignments, serialiseStationAssignments } from '$lib/stationAssignments';
import { buildChipperGroups } from '$lib/chipper';
import {
        doc,
        onSnapshot,
        addDoc,
        serverTimestamp,
        collection,
        setDoc,
        runTransaction,
        deleteDoc,
        updateDoc,
        arrayUnion
} from 'firebase/firestore';
import { user } from '$lib/store';

export let data;
const { session, workout } = data;
const isChipperMode = workout.mode === 'Chipper';

let chipperGroups = [];
let chipperFinisher = null;
let chipperSteps = [];

let liveState = { phase: 'Connecting...', remaining: 0, currentStation: 0, isComplete: false, movesCompleted: 0 };

let userProfile = {};
let myCurrentStationIndex = -1;
let myNextStationIndex = -1;
let previousStationIndex = -1;

let hasSavedFinalScore = false;
let hasJoinedRoster = false;
let wantsPartnerPairing = workout.mode !== 'Partner';
let pairingLocked = workout.mode !== 'Partner';
let isTrainingSolo = false;

let myPartnerSlot = -1;
let myPartnerRole = '';
let myActiveTaskLabel = '';
let currentP1Task = '';
let currentP2Task = '';
let soloPrimaryTask = '';
let soloSecondaryTask = '';
const DEFAULT_CATEGORY = 'Bodyweight';
let stationCategory = DEFAULT_CATEGORY;
let primaryTaskDetails = { name: '', category: DEFAULT_CATEGORY };
let secondaryTaskDetails = { name: '', category: DEFAULT_CATEGORY };
let activeTask = { name: '', category: DEFAULT_CATEGORY };
let upcomingTask = null;
let metricCategory = DEFAULT_CATEGORY;
let hasSessionStarted = false;
let showPairingControls = workout.mode === 'Partner';
let nextStationCategory = '';

let rosterStatus = 'idle';
let rosterError = '';
let partnerStatusText = '';

let myScoreRef = null;
let unsubscribe = [];

const createEntryScore = () => ({ reps: '', weight: '', cals: '', dist: '', notes: '' });
const createCumulativeScore = () => ({ reps: 0, weight: 0, cals: 0, dist: '', notes: '' });

function normaliseCategory(category, fallback = '') {
        const raw = String(category ?? '').trim();
        if (!raw) return fallback;
        const lower = raw.toLowerCase();
        if (lower.includes('cardio')) return 'Cardio Machine';
        if (lower.includes('resist') || lower.includes('strength') || lower.includes('weight')) return 'Resistance';
        if (lower.includes('body')) return 'Bodyweight';
        return raw;
}

function getMetricLabelForCategory(category) {
        switch (category) {
                case 'Resistance':
                        return 'Reps & Weight';
                case 'Cardio Machine':
                        return 'Calories & Distance';
                case 'Bodyweight':
                        return 'Reps';
                default:
                        return category || '';
        }
}

function formatDistance(value) {
        if (!value) return '';
        const trimmed = String(value).trim();
        if (!trimmed) return '';
        const lower = trimmed.toLowerCase();
        if (lower.endsWith('m') || lower.endsWith('km')) {
                return trimmed;
        }
        if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
                return `${trimmed}m`;
        }
        return trimmed;
}

let currentEntries = workout.exercises.map((ex) => ({
        stationName: ex.name ?? '',
        category: ex.category ?? '',
        score: createEntryScore()
}));

let cumulativeScores = workout.exercises.map((ex) => ({
        stationName: ex.name ?? '',
        category: ex.category ?? '',
        score: createCumulativeScore()
}));

let pendingStations = new Set();

let lastSavedStationIndex = -1;
let lastSaveMessage = '';
let lastSaveType = 'idle';

let finalSaveStatus = 'idle';
let finalSaveMessage = '';
let previousCompletionState = false;
let totalTime = 0;

let showFeedbackModal = false;
let feedbackRating = 0;
let feedbackComment = '';

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
                if (workout.mode === 'Partner') {
                        if (didJoin) {
                                if (!isTrainingSolo && !pairingLocked) {
                                        wantsPartnerPairing = true;
                                }
                        } else if (!pairingLocked) {
                                wantsPartnerPairing = false;
                                isTrainingSolo = false;
                        }
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
        return (
                ['reps', 'weight', 'cals'].some((key) => Number(entry[key]) > 0) ||
                (entry.dist && entry.dist.trim().length > 0) ||
                (entry.notes && entry.notes.trim().length > 0)
        );
}

function handleEntryChange(index, field, rawValue) {
        if (index < 0 || !currentEntries[index]) return;

        const entry = { ...currentEntries[index].score };
        if (field === 'dist') {
                entry.dist = rawValue;
        } else if (field === 'notes') {
                entry.notes = rawValue;
        } else {
                const numeric = Number(rawValue);
                entry[field] = rawValue === '' ? '' : Math.max(0, Number.isFinite(numeric) ? numeric : 0);
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

        const formattedDistance = formatDistance(entry.dist);
        if (formattedDistance) {
                cumulative.dist = cumulative.dist ? `${cumulative.dist} + ${formattedDistance}` : formattedDistance;
                hasUpdates = true;
        }

        if (entry.notes && entry.notes.trim()) {
                const trimmedNotes = entry.notes.trim();
                cumulative.notes = cumulative.notes ? `${cumulative.notes}\n${trimmedNotes}` : trimmedNotes;
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
        const formattedDistance = formatDistance(scoreObject.dist);
        if (formattedDistance) {
                cleanedScore.dist = formattedDistance;
        }

        if (scoreObject.notes && String(scoreObject.notes).trim()) {
                cleanedScore.notes = String(scoreObject.notes).trim();
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

async function joinStationRoster({ trainingSolo = false } = {}) {
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
                if (workout.mode === 'Partner') {
                        isTrainingSolo = trainingSolo;
                        wantsPartnerPairing = !trainingSolo;
                } else {
                        wantsPartnerPairing = true;
                }
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
                if (workout.mode === 'Partner') {
                        if (!pairingLocked) {
                                wantsPartnerPairing = false;
                        }
                        isTrainingSolo = false;
                        myPartnerSlot = -1;
                } else {
                        wantsPartnerPairing = false;
                }
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

function selectSoloMode() {
        if (workout.mode !== 'Partner' || pairingLocked || rosterStatus !== 'idle') return;

        isTrainingSolo = true;
        wantsPartnerPairing = false;
        pairingLocked = true;
        rosterError = '';

        if (!hasJoinedRoster) {
                void joinStationRoster({ trainingSolo: true });
        }
}

function selectPartnerMode() {
        if (workout.mode !== 'Partner' || pairingLocked || rosterStatus !== 'idle') return;

        isTrainingSolo = false;
        wantsPartnerPairing = true;
        pairingLocked = true;
        rosterError = '';

        if (!hasJoinedRoster) {
                void joinStationRoster({ trainingSolo: false });
        }
}

function hasTotals(index) {
        if (index < 0 || !cumulativeScores[index]) return false;
        const totals = cumulativeScores[index].score;
        return (
                ['reps', 'weight', 'cals'].some((key) => Number(totals[key]) > 0) ||
                (totals.dist && totals.dist.trim()) ||
                (totals.notes && totals.notes.trim())
        );
}

function hasLoggedScores() {
        return cumulativeScores.some((item) => {
                const score = item?.score;
                if (!score) return false;
                return (
                        Number(score.reps) > 0 ||
                        Number(score.weight) > 0 ||
                        Number(score.cals) > 0 ||
                        (score.dist && String(score.dist).trim().length > 0) ||
                        (score.notes && String(score.notes).trim().length > 0)
                );
        });
}

function startUpload() {
        if (finalSaveStatus === 'saving' || hasSavedFinalScore) return;
        if (!hasLoggedScores()) {
                finalSaveStatus = 'error';
                finalSaveMessage = 'Log at least one score before uploading your workout.';
                return;
        }

        feedbackRating = 0;
        feedbackComment = '';
        finalSaveStatus = 'idle';
        finalSaveMessage = '';
        showFeedbackModal = true;
}

function handleFeedbackSubmit(includeFeedback) {
        if (!includeFeedback) {
                feedbackRating = 0;
                feedbackComment = '';
        }
        showFeedbackModal = false;
        void saveFinalScores();
}

function cancelFeedback() {
        showFeedbackModal = false;
}

async function saveFinalScores() {
        if (hasSavedFinalScore || !$user?.uid) return;

        showFeedbackModal = false;
        finalSaveStatus = 'saving';
        finalSaveMessage = '';

        const displayName = (userProfile.displayName ?? '').trim();
        const resolvedDisplayName = displayName || userProfile.email || 'Member';

        const cleanedScores = cumulativeScores
                .map((item) => {
                        const cleaned = {};
                        if (Number(item.score.reps) > 0) cleaned.reps = Number(item.score.reps);
                        if (Number(item.score.weight) > 0) cleaned.weight = Number(item.score.weight);
                        if (Number(item.score.cals) > 0) cleaned.cals = Number(item.score.cals);
                        const formattedDistance = formatDistance(item.score.dist);
                        if (formattedDistance) cleaned.dist = formattedDistance;
                        if (item.score.notes && String(item.score.notes).trim()) {
                                cleaned.notes = String(item.score.notes).trim();
                        }

                        if (!Object.keys(cleaned).length) {
                                return null;
                        }

                        const stationName =
                                typeof item.stationName === 'string' && item.stationName.trim()
                                        ? item.stationName.trim()
                                        : null;
                        const category =
                                typeof item.category === 'string' && item.category.trim()
                                        ? item.category.trim()
                                        : null;

                        return {
                                ...(stationName !== null ? { stationName } : {}),
                                ...(category !== null ? { category } : {}),
                                score: cleaned
                        };
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
                        displayName: resolvedDisplayName,
                        email: userProfile.email ?? '',
                        workoutId: workout.id,
                        workoutTitle: workout.title,
                        sessionId: session.id,
                        sessionDate: session.sessionDate ?? null,
                        totalTimeMinutes: totalTime,
                        date: serverTimestamp(),
                        exerciseScores: cleanedScores
                });

                const attendanceRef = doc(db, 'attendance', `${session.id}_${$user.uid}`);
                const attendanceWrite = setDoc(
                        attendanceRef,
                        {
                                userId: $user.uid,
                                displayName: resolvedDisplayName,
                                email: userProfile.email ?? '',
                                sessionId: session.id,
                                workoutId: workout.id,
                                workoutTitle: workout.title,
                                sessionDate: session.sessionDate ?? null,
                                date: serverTimestamp()
                        },
                        { merge: true }
                );

                const sessionRef = doc(db, 'sessions', session.id);
                const sessionUpdate = updateDoc(sessionRef, {
                        attendance: arrayUnion({
                                userId: $user.uid,
                                displayName: resolvedDisplayName,
                                email: userProfile.email ?? ''
                        })
                });

                const ratingValue = Number(feedbackRating);
                const trimmedComment = feedbackComment.trim();
                const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;
                const shouldRecordFeedback = hasRating || trimmedComment.length;

                const writes = [attendanceWrite, sessionUpdate];

                if (shouldRecordFeedback) {
                        writes.push(
                                addDoc(collection(db, 'sessions', session.id, 'feedback'), {
                                        rating: hasRating ? ratingValue : null,
                                        comment: trimmedComment,
                                        createdAt: serverTimestamp()
                                })
                        );
                }

                const writeResults = await Promise.allSettled(writes);
                const failedWrites = writeResults.filter((result) => result.status === 'rejected');

                failedWrites.forEach((result) => {
                        console.error('Follow-up write failed:', result.reason);
                });

                hasSavedFinalScore = true;
                if (failedWrites.length) {
                        finalSaveStatus = 'warning';
                        finalSaveMessage = 'Workout saved, but we could not update attendance automatically. Your coach will double-check it.';
                } else {
                        finalSaveStatus = 'success';
                        finalSaveMessage = 'Workout uploaded to your dashboard.';
                }
        } catch (error) {
                console.error('Error saving score:', error);
                finalSaveStatus = 'error';
                finalSaveMessage = 'Failed to upload workout. Please try again.';
        } finally {
                feedbackRating = 0;
                feedbackComment = '';
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
        void joinStationRoster({ trainingSolo: false });
}

$: if (
        workout.mode === 'Partner' &&
        !wantsPartnerPairing &&
        hasJoinedRoster &&
        rosterStatus === 'idle' &&
        !isTrainingSolo
) {
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
                let startingRoster = [];
                assignments.forEach((roster, index) => {
                        if (roster.includes(uppercaseName)) {
                                startingIndex = index;
                                startingRoster = roster;
                        }
                });

                if (startingIndex !== -1) {
                        const total = workout.exercises.length;
                        myPartnerSlot = startingRoster.indexOf(uppercaseName);
                        myCurrentStationIndex = (startingIndex + liveState.movesCompleted) % total;
                        myNextStationIndex = (myCurrentStationIndex + 1) % total;
                } else {
                        myPartnerSlot = -1;
                        myCurrentStationIndex = -1;
                        myNextStationIndex = -1;
                }
        }
} else {
        myPartnerSlot = -1;
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
$: nextStationCategory = nextStationData
        ? normaliseCategory(
                  workout.mode === 'Partner'
                          ? nextStationData.p1?.category || nextStationData.category
                          : nextStationData.category,
                  DEFAULT_CATEGORY
          )
        : '';
$: intervalDuration = liveState?.duration || liveState?.timing?.work || session?.timing?.work || null;
$: hasPendingForCurrent = myCurrentStationIndex >= 0 && pendingStations.has(myCurrentStationIndex);
$: chipperSteps = isChipperMode ? workout.chipper?.steps ?? [] : [];
$: chipperGroups = isChipperMode ? buildChipperGroups(chipperSteps) : [];
$: chipperFinisher = isChipperMode ? workout.chipper?.finisher ?? null : null;

$: currentP1Task = myStationData?.p1?.task ? String(myStationData.p1.task).trim() : '';
$: currentP2Task = myStationData?.p2?.task ? String(myStationData.p2.task).trim() : '';
$: stationCategory = myStationData ? normaliseCategory(myStationData.category, DEFAULT_CATEGORY) : DEFAULT_CATEGORY;
$: primaryTaskDetails = myStationData
        ? {
                  name: currentP1Task || myStationData.name || '',
                  category: normaliseCategory(myStationData.p1?.category, stationCategory)
          }
        : { name: '', category: DEFAULT_CATEGORY };
$: secondaryTaskDetails = myStationData
        ? {
                  name: currentP2Task || primaryTaskDetails.name || myStationData.name || '',
                  category: normaliseCategory(myStationData.p2?.category, primaryTaskDetails.category)
          }
        : { name: '', category: DEFAULT_CATEGORY };
$: if (workout.mode === 'Partner') {
        if (myPartnerSlot === 0) {
                myPartnerRole = 'Partner A';
        } else if (myPartnerSlot === 1) {
                myPartnerRole = 'Partner B';
        } else if (myPartnerSlot >= 0) {
                myPartnerRole = `Partner ${myPartnerSlot + 1}`;
        } else {
                myPartnerRole = '';
        }
} else {
        myPartnerRole = '';
}
$: {
        if (!myStationData) {
                soloPrimaryTask = '';
                soloSecondaryTask = '';
                myActiveTaskLabel = '';
                activeTask = { name: '', category: DEFAULT_CATEGORY };
                upcomingTask = null;
                metricCategory = DEFAULT_CATEGORY;
        } else {
                const fallbackName = myStationData.name || '';
                const primaryName = primaryTaskDetails.name || fallbackName;
                const secondaryName = secondaryTaskDetails.name || primaryName;
                const hasDistinctSecondary = Boolean(secondaryTaskDetails.name && secondaryName !== primaryName);
                const isSecondWorkBlock = liveState?.phaseIndex === 2;

                soloPrimaryTask = primaryName;
                soloSecondaryTask = hasDistinctSecondary ? secondaryName : '';

                let nextActive = { ...primaryTaskDetails, name: primaryName };
                let nextUpcoming = hasDistinctSecondary ? { ...secondaryTaskDetails, name: secondaryName } : null;

                if (workout.mode === 'Partner') {
                        if (isTrainingSolo || myPartnerSlot === 0) {
                                if (isSecondWorkBlock && hasDistinctSecondary) {
                                        nextActive = { ...secondaryTaskDetails, name: secondaryName };
                                        nextUpcoming = null;
                                }
                        } else if (myPartnerSlot === 1) {
                                if (!isSecondWorkBlock && hasDistinctSecondary) {
                                        nextActive = { ...secondaryTaskDetails, name: secondaryName };
                                        nextUpcoming = { ...primaryTaskDetails, name: primaryName };
                                } else {
                                        nextActive = { ...primaryTaskDetails, name: primaryName };
                                        nextUpcoming = null;
                                }
                        } else if (myPartnerSlot >= 0) {
                                nextActive = { ...primaryTaskDetails, name: primaryName };
                                nextUpcoming = hasDistinctSecondary ? { ...secondaryTaskDetails, name: secondaryName } : null;
                        }
                } else if (!hasDistinctSecondary) {
                        nextUpcoming = null;
                }

                activeTask = nextActive;
                upcomingTask = nextUpcoming;
                myActiveTaskLabel = activeTask.name || fallbackName || primaryName;
                metricCategory = activeTask.category || stationCategory || DEFAULT_CATEGORY;
        }
}
$: metricLabel = myStationData ? getMetricLabelForCategory(metricCategory) : '';
$: hasSessionStarted = Number.isFinite(liveState?.phaseIndex) && liveState.phaseIndex >= 0 && !liveState.isComplete;
$: showPairingControls = workout.mode === 'Partner' && !hasSessionStarted;
$: {
        if (rosterStatus === 'joining') {
                partnerStatusText = 'Adding you to the partner rotation...';
        } else if (rosterStatus === 'leaving') {
                partnerStatusText = 'Updating your selection...';
        } else if (isTrainingSolo) {
                if (hasJoinedRoster) {
                        partnerStatusText = "You're locked in to train solo for this partner session.";
                } else if (rosterError) {
                        partnerStatusText = "We're unable to add you just yet. Please review the message below.";
                } else {
                        partnerStatusText = "We'll load your solo station as soon as it's assigned.";
                }
        } else if (wantsPartnerPairing) {
                if (hasJoinedRoster) {
                        partnerStatusText = "You're set to rotate with a partner.";
                } else if (rosterError) {
                        partnerStatusText = "We're unable to add you just yet. Please review the message below.";
                } else {
                        partnerStatusText = "We'll add you as soon as there's an open station.";
                }
        } else {
                partnerStatusText = "You're logged to train solo for this session.";
        }
}

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

        {#if isChipperMode}
                <section class="chipper-overview" aria-labelledby="chipper-title">
                        <div class="chipper-header">
                                <h2 id="chipper-title">Chipper flow</h2>
                                <p>Work from the top of the pyramid down, then hit the finisher for max calories.</p>
                        </div>

                        {#if chipperGroups.length}
                                <div class="chipper-pyramid">
                                        {#each chipperGroups as group, groupIndex}
                                                <div class="chipper-tier" data-group={groupIndex}>
                                                        <div class="tier-reps">{typeof group.reps === 'number' ? `${group.reps}` : group.reps}</div>
                                                        <ul class="tier-movements">
                                                                {#each group.items as item}
                                                                        <li>
                                                                                <span class="tier-order">#{item.order}</span>
                                                                                <span class="tier-name">{item.name}</span>
                                                                                {#if item.category}
                                                                                        <span class="tier-category">{item.category}</span>
                                                                                {/if}
                                                                        </li>
                                                                {/each}
                                                        </ul>
                                                </div>
                                        {/each}
                                </div>
                        {:else}
                                <p class="chipper-empty">No chipper movements configured yet.</p>
                        {/if}

                        {#if chipperFinisher?.name}
                                <div class="chipper-finisher-card">
                                        <span class="finisher-label">Finisher</span>
                                        <div class="finisher-details">
                                                <strong>{chipperFinisher.name}</strong>
                                                <span>{chipperFinisher.description || 'Max calories until the clock hits zero.'}</span>
                                        </div>
                                </div>
                        {/if}
                </section>
        {/if}

        {#if workout.mode === 'Partner' && showPairingControls}
                <section class="pairing-controls" aria-live="polite">
                        <div class="pairing-copy">
                                <h2>Partner pairing</h2>
                                <p>Choose how you'd like to train for this partner workout.</p>
                        </div>
                        <div class="pairing-actions">
                                <div class="pairing-toggle" role="radiogroup" aria-label="Partner preference">
                                        <button
                                                type="button"
                                                class:active={isTrainingSolo}
                                                class:locked={pairingLocked}
                                                on:click={selectSoloMode}
                                                aria-pressed={isTrainingSolo}
                                                disabled={rosterStatus !== 'idle' || pairingLocked}
                                        >
                                                I'm riding solo
                                        </button>
                                        <button
                                                type="button"
                                                class:active={!isTrainingSolo}
                                                class:locked={pairingLocked}
                                                on:click={selectPartnerMode}
                                                aria-pressed={!isTrainingSolo}
                                                disabled={rosterStatus !== 'idle' || pairingLocked}
                                        >
                                                Pair me up
                                        </button>
                                </div>
                                <p class="pairing-status" aria-live="polite">{partnerStatusText}</p>
                                {#if pairingLocked}
                                        <p class="pairing-note">Selection locked for this session. Chat with your coach if you need to change it.</p>
                                {/if}
                                {#if rosterError}
                                        <p class="pairing-error">{rosterError}</p>
                                {/if}
                        </div>
                </section>
        {:else if workout.mode === 'Partner'}
                <div class="pairing-summary" aria-live="polite">
                        <div class="summary-row">
                                <span class={`summary-chip ${isTrainingSolo ? 'solo' : 'partner'}`}>
                                        {isTrainingSolo ? 'Training solo' : 'Partner rotation'}
                                </span>
                                {#if myPartnerRole}
                                        <span class="summary-chip role">{myPartnerRole}</span>
                                {/if}
                                {#if pairingLocked}
                                        <span class="summary-chip locked">Locked</span>
                                {/if}
                        </div>
                        <p class="pairing-status">{partnerStatusText}</p>
                        {#if rosterError}<p class="pairing-error">{rosterError}</p>{/if}
                        {#if pairingLocked}
                                <p class="pairing-note">Selection locked for this session. Chat with your coach if you need to change it.</p>
                        {/if}
                </div>
        {/if}

        {#if myStationData}
                <main class="tracker-main">
                        <div class="score-card">
                                <header class="score-header">
                                        <div class="score-title">
                                                <span class="score-eyebrow">Log your score</span>
                                                <h2>{myActiveTaskLabel || myStationData.name}</h2>
                                                <p class="score-subtitle">
                                                        {#if isChipperMode}
                                                                Finisher · {myStationData.name}
                                                        {:else}
                                                                Station {myCurrentStationIndex + 1} · {myStationData.name}
                                                        {/if}
                                                </p>
                                        </div>
                                        <div class="score-meta">
                                                {#if metricLabel}<span class="score-chip emphasis">{metricLabel}</span>{/if}
                                                {#if activeTask.category && metricLabel !== activeTask.category}
                                                        <span class="score-chip subtle">{activeTask.category}</span>
                                                {/if}
                                                {#if intervalDuration}
                                                        <span class="score-chip">Interval: {Math.round(intervalDuration)}s</span>
                                                {/if}
                                        </div>
                                </header>

                                <p class="score-helper">
                                        {#if isChipperMode}
                                                Log the calories you rack up once you reach the finisher. Add a new entry each time you hop back on the machine.
                                        {:else}
                                                Record the effort you hit for this interval. We'll add it to your running total automatically.
                                        {/if}
                                </p>

                                <div class="input-grid" class:two-column={metricCategory === 'Resistance' || metricCategory === 'Cardio Machine'}>
                                        {#if metricCategory === 'Resistance'}
                                                <label class="input-field">
                                                        <span>Reps</span>
                                                        <input
                                                                type="number"
                                                                inputmode="numeric"
                                                                min="0"
                                                                placeholder="e.g. 12"
                                                                value={currentEntries[myCurrentStationIndex].score.reps}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'reps', event.target.value)}
                                                        />
                                                </label>
                                                <label class="input-field">
                                                        <span>Weight (kg)</span>
                                                        <input
                                                                type="number"
                                                                inputmode="decimal"
                                                                min="0"
                                                                placeholder="e.g. 40"
                                                                value={currentEntries[myCurrentStationIndex].score.weight}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'weight', event.target.value)}
                                                        />
                                                </label>
                                        {:else if metricCategory === 'Cardio Machine'}
                                                <label class="input-field">
                                                        <span>Calories</span>
                                                        <input
                                                                type="number"
                                                                inputmode="numeric"
                                                                min="0"
                                                                placeholder="e.g. 20"
                                                                value={currentEntries[myCurrentStationIndex].score.cals}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'cals', event.target.value)}
                                                        />
                                                </label>
                                                <label class="input-field">
                                                        <span>Distance (m)</span>
                                                        <input
                                                                type="text"
                                                                inputmode="decimal"
                                                                placeholder="e.g. 250m"
                                                                value={currentEntries[myCurrentStationIndex].score.dist}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'dist', event.target.value)}
                                                        />
                                                </label>
                                        {:else}
                                                <label class="input-field full">
                                                        <span>Reps</span>
                                                        <input
                                                                type="number"
                                                                inputmode="numeric"
                                                                min="0"
                                                                placeholder="e.g. 15"
                                                                value={currentEntries[myCurrentStationIndex].score.reps}
                                                                on:input={(event) => handleEntryChange(myCurrentStationIndex, 'reps', event.target.value)}
                                                        />
                                                </label>
                                        {/if}

                                        <label class="input-field full notes-field">
                                                <span>Notes (optional)</span>
                                                <textarea
                                                        rows="2"
                                                        placeholder="Add cues, scaling or modifications"
                                                        on:input={(event) => handleEntryChange(myCurrentStationIndex, 'notes', event.target.value)}
                                                >{currentEntries[myCurrentStationIndex].score.notes}</textarea>
                                        </label>
                                </div>

                                <div class="actions-row">
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
                                </div>

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
                                                        {#if cumulativeScores[myCurrentStationIndex].score.notes && cumulativeScores[myCurrentStationIndex].score.notes.trim()}
                                                                <li class="notes-total"><span>Notes</span><span>{cumulativeScores[myCurrentStationIndex].score.notes}</span></li>
                                                        {/if}
                                                </ul>
                                        </div>
                                {/if}
                        </div>
                </main>

                <footer class="station-info">
                        <div class="station-display current">
                                <div class="station-heading">
                                        <span class="station-eyebrow">Now</span>
                                        <h2>{myStationData.name}</h2>
                                        <p class="station-meta">
                                                {#if isChipperMode}
                                                        Finisher
                                                {:else}
                                                        Station {myCurrentStationIndex + 1}
                                                {/if}
                                                {#if stationCategory}
                                                        <span aria-hidden="true">·</span>
                                                        {stationCategory}
                                                {/if}
                                        </p>
                                </div>
                                {#if workout.mode === 'Partner'}
                                        {#if isTrainingSolo}
                                                {#if soloPrimaryTask}
                                                        <p class="start-callout">
                                                                Training solo? Start on <strong>{soloPrimaryTask}</strong>
                                                                {#if soloSecondaryTask}
                                                                        , then transition to <strong>{soloSecondaryTask}</strong>
                                                                {/if}
                                                                .
                                                        </p>
                                                {/if}
                                        {:else if myPartnerSlot !== -1 && myActiveTaskLabel}
                                                <p class="start-callout">
                                                        {#if myPartnerRole}<span class="start-role">{myPartnerRole}</span>{/if}
                                                        Start on <strong>{myActiveTaskLabel}</strong>.
                                                </p>
                                        {/if}
                                {/if}
                                {#if workout.mode === 'Partner' && upcomingTask && !isTrainingSolo && myPartnerSlot !== -1 && upcomingTask.name !== myActiveTaskLabel}
                                        <p class="upcoming-note">Next interval: <strong>{upcomingTask.name}</strong></p>
                                {/if}
                                <div class="task-list">
                                        <div class="task-line">
                                                <span class="task-label p1">P1</span>
                                                <div class="task-content">
                                                        <span class="task-text">{myStationData.p1?.task}</span>
                                                        {#if primaryTaskDetails.category}
                                                                <span class="task-chip">{primaryTaskDetails.category}</span>
                                                        {/if}
                                                </div>
                                        </div>
                                        {#if myStationData.p2?.task}
                                                <div class="task-line">
                                                        <span class="task-label p2">P2</span>
                                                        <div class="task-content">
                                                                <span class="task-text">{myStationData.p2.task}</span>
                                                                {#if secondaryTaskDetails.category}
                                                                        <span class="task-chip">{secondaryTaskDetails.category}</span>
                                                                {/if}
                                                        </div>
                                                </div>
                                        {/if}
                                </div>
                        </div>
                        {#if nextStationData}
                                <div class="station-display next">
                                        <div class="station-heading">
                                                <span class="station-eyebrow">Up next</span>
                                                <h2>{nextStationData.name}</h2>
                                                <p class="station-meta">
                                                        Station {myNextStationIndex + 1}
                                                        {#if nextStationCategory}
                                                                <span aria-hidden="true">·</span>
                                                                {nextStationCategory}
                                                        {/if}
                                                </p>
                                        </div>
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
                                        {#if !hasJoinedRoster && !pairingLocked}
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
                                on:click={startUpload}
                                disabled={finalSaveStatus === 'saving' || hasSavedFinalScore}
                        >
                                {hasSavedFinalScore ? 'Uploaded' : finalSaveStatus === 'saving' ? 'Uploading...' : 'Upload workout'}
                        </button>
                        {#if finalSaveMessage}
                                <p class={`status ${finalSaveStatus}`}>{finalSaveMessage}</p>
                        {/if}
                </section>
        {/if}

        {#if showFeedbackModal}
                <div class="feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
                        <div class="feedback-card">
                                <h3 id="feedback-title">How was that session?</h3>
                                <p>Share anonymous feedback to help shape future workouts.</p>
                                <div class="feedback-stars" role="group" aria-label="Rate this workout">
                                        {#each [1, 2, 3, 4, 5] as star}
                                                <button
                                                        type="button"
                                                        class="star-button"
                                                        class:active={feedbackRating >= star}
                                                        aria-label={`${star} star${star === 1 ? '' : 's'}`}
                                                        aria-pressed={feedbackRating === star}
                                                        on:click={() => (feedbackRating = star)}
                                                >
                                                        ★
                                                </button>
                                        {/each}
                                </div>
                                <textarea
                                        aria-label="Optional feedback comments"
                                        bind:value={feedbackComment}
                                        placeholder="Add an optional comment (your name won't be shown)"
                                ></textarea>
                                <div class="feedback-actions">
                                        <button type="button" class="btn btn-outline" on:click={cancelFeedback}>Cancel</button>
                                        <button
                                                type="button"
                                                class="btn ghost"
                                                on:click={() => handleFeedbackSubmit(false)}
                                        >
                                                Skip &amp; Upload
                                        </button>
                                        <button
                                                type="button"
                                                class="btn btn-primary"
                                                on:click={() => handleFeedbackSubmit(true)}
                                        >
                                                Submit &amp; Upload
                                        </button>
                                </div>
                        </div>
                </div>
        {/if}
</div>

<style>
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
        flex-direction: column;
        gap: 0.75rem;
        flex: 1;
}

.pairing-toggle {
        display: grid;
        grid-template-columns: repeat(2, minmax(140px, 1fr));
        gap: 0.75rem;
}

.pairing-toggle button {
        border-radius: 999px;
        padding: 0.65rem 1rem;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid var(--border-color);
        background: transparent;
        color: var(--text-secondary);
        transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.pairing-toggle button.active {
        background: var(--brand-yellow);
        border-color: var(--brand-yellow);
        color: var(--deep-space);
}

.pairing-toggle button.locked {
        border-style: dashed;
}

.pairing-toggle button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
}

.pairing-status {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.85rem;
}

.pairing-note {
        margin: -0.35rem 0 0;
        color: var(--text-muted);
        font-size: 0.8rem;
}

.chipper-overview {
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.5rem;
        margin-bottom: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        text-align: left;
}

.chipper-header h2 {
        margin: 0;
        font-size: 1.4rem;
        color: var(--text-secondary);
}

.chipper-header p {
        margin: 0.35rem 0 0;
        color: var(--text-muted);
}

.chipper-pyramid {
        display: grid;
        gap: 1rem;
}

.chipper-tier {
        display: grid;
        grid-template-columns: 80px 1fr;
        gap: 1rem;
        align-items: start;
}

.tier-reps {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 68px;
        height: 68px;
        border-radius: 14px;
        background: var(--surface-2, rgba(255, 255, 255, 0.04));
        border: 1px solid rgba(255, 255, 255, 0.08);
        font-family: var(--font-display);
        font-size: 1.4rem;
        color: var(--brand-yellow);
}

.tier-movements {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.45rem;
}

.tier-movements li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        color: var(--text-primary);
        font-size: 0.95rem;
}

.tier-order {
        font-weight: 600;
        color: var(--text-muted);
}

.tier-category {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 0.1rem 0.6rem;
        font-size: 0.75rem;
        color: var(--text-muted);
}

.chipper-empty {
        margin: 0;
        color: var(--text-muted);
        font-style: italic;
}

.chipper-finisher-card {
        display: grid;
        grid-template-columns: 90px 1fr;
        gap: 1rem;
        align-items: start;
        padding-top: 1rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.finisher-label {
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-muted);
}

.finisher-details {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        color: var(--text-muted);
}

.finisher-details strong {
        color: var(--text-secondary);
        font-size: 1rem;
}

@media (max-width: 720px) {
        .chipper-tier {
                grid-template-columns: 1fr;
        }

        .tier-reps {
                width: 54px;
                height: 54px;
                font-size: 1.1rem;
        }

        .chipper-finisher-card {
                grid-template-columns: 1fr;
        }
}

.pairing-summary {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.25rem 1.5rem;
        text-align: left;
}

.summary-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        align-items: center;
}

.summary-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border: 1px solid transparent;
}

.summary-chip.solo {
        background: rgba(59, 130, 246, 0.16);
        border-color: rgba(59, 130, 246, 0.35);
        color: #60a5fa;
}

.summary-chip.partner {
        background: rgba(34, 197, 94, 0.16);
        border-color: rgba(34, 197, 94, 0.35);
        color: #34d399;
}

.summary-chip.role {
        background: rgba(253, 224, 71, 0.16);
        border-color: rgba(253, 224, 71, 0.35);
        color: var(--brand-yellow);
}

.summary-chip.locked {
        background: rgba(148, 163, 184, 0.12);
        border-color: rgba(148, 163, 184, 0.3);
        color: var(--text-muted);
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
        max-width: 480px;
        padding: 1.75rem;
        border-radius: 20px;
        border: 1px solid var(--border-color);
        text-align: left;
        box-shadow: 0 24px 60px -45px rgba(15, 23, 42, 0.9);
}

.score-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1.5rem;
        flex-wrap: wrap;
}

.score-title {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
}

.score-eyebrow {
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted);
}

.score-title h2 {
        margin: 0;
        font-size: 1.75rem;
        color: var(--text-secondary);
}

.score-subtitle {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-muted);
}

.score-helper {
        margin: 1rem 0 0;
        font-size: 0.85rem;
        color: var(--text-muted);
        line-height: 1.4;
}

.score-meta {
        margin-top: 0;
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        flex-wrap: wrap;
        align-items: center;
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

.score-chip.emphasis {
        background: rgba(253, 224, 71, 0.16);
        border-color: rgba(253, 224, 71, 0.45);
        color: var(--brand-yellow);
}

.score-chip.subtle {
        background: rgba(148, 163, 184, 0.12);
        border-color: rgba(148, 163, 184, 0.3);
        color: var(--text-muted);
}

.input-grid {
        margin-top: 1.5rem;
        display: grid;
        gap: 1rem;
}

.input-grid.two-column {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.input-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
}

.input-field.full {
        grid-column: 1 / -1;
}

.input-field span {
        font-size: 0.8rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
}

.input-field input,
.input-field textarea {
        font-size: 1.6rem;
        font-family: var(--font-display);
        width: 100%;
        border-radius: 12px;
        border: 1px solid var(--border-color);
        background: var(--deep-space);
        color: var(--text-primary);
        padding: 0.65rem 0.85rem;
        text-align: center;
}

.input-field textarea {
        font-size: 0.95rem;
        font-family: var(--font-body);
        line-height: 1.5;
        min-height: 72px;
        resize: vertical;
        text-align: left;
}

.notes-field span {
        text-transform: none;
        letter-spacing: normal;
}

.notes-field textarea {
        background: rgba(15, 23, 42, 0.85);
}

.actions-row {
        margin-top: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: stretch;
}

.actions-row .btn-save {
        margin-top: 0;
}

.actions-row .save-feedback {
        margin: 0;
        text-align: center;
}

.save-feedback {
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
        margin-top: 1.5rem;
        text-align: left;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 1.1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
}

.totals h3 {
        margin: 0;
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
        align-items: flex-start;
        gap: 0.75rem;
        color: var(--text-primary);
        font-size: 0.95rem;
}

.totals li span:first-child {
        color: var(--text-muted);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
}

.totals li span:last-child {
        font-weight: 600;
        font-size: 0.95rem;
        text-align: right;
}

.notes-total span:last-child {
        white-space: pre-wrap;
        font-family: var(--font-body);
        font-size: 0.85rem;
        font-weight: 400;
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
        border-radius: 18px;
        padding: 1.25rem 1.5rem;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 1rem;
}
.start-callout {
        margin: 0 0 0.75rem;
        padding: 0.75rem;
        border-radius: 12px;
        background: rgba(56, 189, 248, 0.08);
        border: 1px solid rgba(56, 189, 248, 0.25);
        font-size: 0.9rem;
        color: var(--text-secondary);
        line-height: 1.5;
}
.start-callout strong {
        color: var(--brand-yellow);
}
.start-role {
        display: inline-block;
        margin-right: 0.5rem;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        background: rgba(253, 224, 71, 0.18);
        color: var(--brand-yellow);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
}

.upcoming-note {
        margin: -0.25rem 0 0.25rem;
        font-size: 0.85rem;
        color: var(--text-muted);
}

.upcoming-note strong {
        color: var(--text-secondary);
}

.station-display.current {
        border-left: 4px solid var(--brand-yellow);
        box-shadow: 0 26px 70px -52px rgba(253, 224, 71, 0.35);
}

.station-display.next {
        opacity: 0.75;
}

.station-heading {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
}

.station-eyebrow {
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted);
}

.station-heading h2 {
        margin: 0;
        font-size: 1.4rem;
        color: var(--text-secondary);
}

.station-meta {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-muted);
        display: flex;
        gap: 0.35rem;
        align-items: center;
}

.station-meta span[aria-hidden='true'] {
        color: var(--text-muted);
}

.task-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
}

.task-line {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        font-size: 0.95rem;
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

.task-content {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        align-items: flex-start;
}

.task-text {
        color: var(--text-primary);
        font-size: 1rem;
        font-weight: 500;
}

.task-chip {
        background: rgba(148, 163, 184, 0.12);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 999px;
        padding: 0.2rem 0.65rem;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
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

.post-workout-card .status.warning {
        color: var(--brand-yellow);
}

.feedback-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        z-index: 1200;
}

.feedback-card {
        background: var(--bg-panel);
        border: 1px solid var(--border-color);
        border-radius: 20px;
        padding: 2rem;
        width: 100%;
        max-width: 420px;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        box-shadow: 0 30px 70px rgba(15, 23, 42, 0.45);
}

.feedback-card h3 {
        margin: 0;
        font-family: var(--font-display);
        letter-spacing: 0.08em;
        color: var(--brand-yellow);
        font-size: 2.1rem;
        text-transform: uppercase;
}

.feedback-card p {
        margin: 0;
        color: var(--text-secondary);
}

.feedback-stars {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
}

.star-button {
        background: transparent;
        border: none;
        color: rgba(148, 163, 184, 0.6);
        font-size: 2.25rem;
        cursor: pointer;
        transition: transform var(--transition), color var(--transition);
}

.star-button.active,
.star-button:hover,
.star-button:focus-visible {
        color: var(--brand-yellow);
        transform: scale(1.05);
        outline: none;
}

.feedback-card textarea {
        background: var(--deep-space);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        color: var(--text-primary);
        padding: 0.85rem 1rem;
        min-height: 120px;
        resize: vertical;
        font-family: inherit;
}

.feedback-card textarea::placeholder {
        color: rgba(148, 163, 184, 0.7);
}

.feedback-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: flex-end;
}

.feedback-actions .btn {
        flex: 1;
        min-width: 140px;
}

.btn.ghost {
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
}

.btn.ghost:not(:disabled):hover,
.btn.ghost:focus-visible {
        color: var(--text-primary);
        border-color: var(--text-secondary);
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
        }

        .pairing-toggle {
                grid-template-columns: 1fr;
        }

        .pairing-toggle button {
                width: 100%;
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
