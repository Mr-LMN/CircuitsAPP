<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { db } from '$lib/firebase';
import {
collection,
query,
where,
getDocs,
orderBy,
limit,
doc,
updateDoc,
arrayUnion,
arrayRemove,
getDoc
} from 'firebase/firestore';
import { user } from '$lib/store';

let stats = { sessionsAttended: 0, personalBests: [] };
let upcomingSession = null;
let userProfile = null;
let hasBooked = false;
let isBooking = false;
let isLoading = true;

// NEW: Reactive variable to check if the session is today
$: isSessionToday = (() => {
if (!upcomingSession) return false;
const sessionDate = upcomingSession.sessionDate.toDate();
const today = new Date();
return (
sessionDate.getFullYear() === today.getFullYear() &&
sessionDate.getMonth() === today.getMonth() &&
sessionDate.getDate() === today.getDate()
);
})();

onMount(async () => {
if (!$user?.uid) {
isLoading = false;
return;
}

const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

const attendanceQuery = getDocs(query(collection(db, 'attendance'), where('userId', '==', $user.uid)));
const scoresQuery = getDocs(query(collection(db, 'scores'), where('userId', '==', $user.uid), orderBy('date', 'desc')));
const sessionsQuery = getDocs(
query(
collection(db, 'sessions'),
where('sessionDate', '>=', startOfToday),
orderBy('sessionDate', 'asc'),
limit(1)
)
);
const profileQuery = getDoc(doc(db, 'profiles', $user.uid));

const [attendanceSnapshot, scoresSnapshot, sessionsSnapshot, profileSnap] = await Promise.all([
attendanceQuery,
scoresQuery,
sessionsQuery,
profileQuery
]);

stats.sessionsAttended = attendanceSnapshot.size;
const scores = scoresSnapshot.docs.map((doc) => doc.data());
const personalBests = new Map();
for (const score of scores) {
const existingBest = personalBests.get(score.workoutId);
if (!existingBest || Number(score.score) > Number(existingBest.score)) {
personalBests.set(score.workoutId, score);
}
}
stats.personalBests = Array.from(personalBests.values());

if (profileSnap.exists()) {
userProfile = profileSnap.data();
}

if (!sessionsSnapshot.empty) {
const sessionDoc = sessionsSnapshot.docs[0];
upcomingSession = { id: sessionDoc.id, ...sessionDoc.data() };
if (upcomingSession.rsvps?.some((rsvp) => rsvp.userId === $user.uid)) {
hasBooked = true;
}
}

isLoading = false;
});

async function bookSpot() {
if (!upcomingSession || !userProfile || isBooking) return;
isBooking = true;
try {
const sessionRef = doc(db, 'sessions', upcomingSession.id);
await updateDoc(sessionRef, {
rsvps: arrayUnion({
userId: $user.uid,
displayName: userProfile.displayName
})
});
hasBooked = true;
} catch (error) {
console.error('Error booking spot:', error);
alert('Could not book your spot. Please try again.');
} finally {
isBooking = false;
}
}

async function cancelBooking() {
if (!upcomingSession || !userProfile || isBooking) return;
isBooking = true;
try {
const sessionRef = doc(db, 'sessions', upcomingSession.id);
await updateDoc(sessionRef, {
rsvps: arrayRemove({
userId: $user.uid,
displayName: userProfile.displayName
})
});
hasBooked = false;
} catch (error) {
console.error('Error cancelling booking:', error);
alert('Could not cancel your booking. Please try again.');
} finally {
isBooking = false;
}
}

// NEW: Function to navigate to the live session tracker
function joinLiveSession() {
if (!upcomingSession) return;
goto(`/live/${upcomingSession.id}`);
}
</script>

<div class="page-container">
<header class="dashboard-header">
<h1>Welcome, {userProfile?.displayName || 'Member'}!</h1>
<p>Here's a look at your progress and the next session.</p>
</header>

{#if isLoading}
<p>Loading your dashboard...</p>
{:else}
<div class="dashboard-grid">
<div class="main-col">
<section class="dashboard-section">
<h2>Upcoming Session</h2>
{#if upcomingSession}
<div class="session-card" class:today={isSessionToday}>
<div class="session-info">
<span class="session-date">{new Date(upcomingSession.sessionDate.seconds * 1000).toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
<h3 class="session-title">{upcomingSession.workoutTitle}</h3>
</div>
<div class="session-action">
{#if isSessionToday}
<a href={`/live/${upcomingSession.id}`} class="live-btn">I'm Here & Ready to Go!</a>
{:else if hasBooked}
<button class="secondary-btn" on:click={cancelBooking} disabled={isBooking}>{isBooking ? '...' : 'Cancel Booking'}</button>
{:else}
<button class="primary-btn" on:click={bookSpot} disabled={isBooking}>{isBooking ? '...' : 'Book My Spot'}</button>
{/if}
</div>
</div>
{:else}
<p class="empty-state">No upcoming sessions are scheduled yet.</p>
{/if}
</section>

<section class="dashboard-section">
<h2>Personal Bests</h2>
{#if stats.personalBests.length === 0}
<p class="empty-state">Complete a benchmark workout to see your results here!</p>
{:else}
<div class="pb-grid">
{#each stats.personalBests as pb}
<div class="pb-card">
<span class="pb-workout-title">{pb.workoutTitle}</span>
<span class="pb-score">{pb.score}</span>
<span class="pb-date">{new Date(pb.date.seconds * 1000).toLocaleDateString()}</span>
</div>
{/each}
</div>
{/if}
</section>
</div>
<div class="sidebar-col">
<section class="dashboard-section">
<h2>At a Glance</h2>
<div class="stats-grid">
<div class="stat-card">
<span class="stat-value">{stats.sessionsAttended}</span>
<span class="stat-label">Sessions Attended</span>
</div>
<div class="stat-card">
<span class="stat-value">{stats.personalBests.length}</span>
<span class="stat-label">Benchmarks Logged</span>
</div>
</div>
</section>
</div>
</div>
{/if}
</div>

<style>
/* NEW Professional Dashboard Styles */
.page-container { max-width: 1400px; }
.dashboard-header h1 { font-family: var(--font-display); color: var(--brand-yellow); font-size: 3rem; margin: 0; }
.dashboard-header p { font-size: 1.1rem; color: var(--text-secondary); margin-top: 0.5rem; }
.dashboard-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-top: 2rem; }
.main-col, .sidebar-col { display: flex; flex-direction: column; gap: 2rem; }
.dashboard-section h2 { font-family: var(--font-display); font-size: 1.75rem; letter-spacing: 1px; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); }
.session-card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
.session-card.today { border-color: var(--brand-green); box-shadow: 0 0 20px rgba(22, 163, 74, 0.2); }
.session-title { font-size: 1.5rem; font-weight: 600; margin: 0.25rem 0; }
.primary-btn, .secondary-btn, .live-btn { text-decoration: none; text-align: center; border: none; padding: 0.8rem 2rem; border-radius: 999px; font-weight: 700; cursor: pointer; }
.live-btn { background: var(--brand-yellow); color: var(--deep-space); }
.stat-card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; }
.stat-value { font-family: var(--font-display); font-size: 3rem; color: var(--brand-yellow); }
.stat-label { font-size: 0.9rem; color: var(--text-muted); }
.pb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.pb-card { background: var(--surface-2); border-radius: 12px; padding: 1rem; }
.pb-workout-title { font-weight: 600; }
.pb-score { font-family: var(--font-display); font-size: 2rem; color: var(--brand-yellow); }
.pb-date { font-size: 0.8rem; color: var(--text-muted); }
.empty-state { color: var(--text-muted); }
@media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr; } }
</style>
