<script>
        // @ts-nocheck
        import { get } from 'svelte/store';
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
        import { loading, user } from '$lib/store';

let stats = { sessionsAttended: 0, personalBests: [] };
let upcomingSession = null;
let userProfile = null;
let hasBooked = false;
let isBooking = false;
let isLoading = true;
let loadError = '';

let lastLoadedUid = null;
let fetchToken = 0;

const DEFAULT_AMRAP_ROUNDS = 20;
const MAX_AMRAP_ROUNDS = 40;
const AMRAP_ROUND_OPTIONS = [10, 12, 15, 20, 25, 30, 35, 40];
let amrapRounds = Array(DEFAULT_AMRAP_ROUNDS).fill(false);
let amrapRoundSlots = DEFAULT_AMRAP_ROUNDS;

$: completedAmrapRounds = amrapRounds.filter(Boolean).length;

function toggleAmrapRound(index) {
        amrapRounds = amrapRounds.map((value, i) => (i === index ? !value : value));
}

function resetAmrapTracker() {
        amrapRounds = amrapRounds.map(() => false);
}

function setAmrapRoundSlots(next) {
        const safeValue = Math.min(
                MAX_AMRAP_ROUNDS,
                Math.max(1, Math.round(Number(next) || DEFAULT_AMRAP_ROUNDS))
        );

        if (safeValue === amrapRounds.length) return;

        if (safeValue > amrapRounds.length) {
            amrapRounds = [
                ...amrapRounds,
                ...Array(safeValue - amrapRounds.length).fill(false)
            ];
        } else {
                amrapRounds = amrapRounds.slice(0, safeValue);
        }

        amrapRoundSlots = safeValue;
}

function handleAmrapSelectChange(event) {
        setAmrapRoundSlots(event.currentTarget?.value ?? event.target?.value ?? DEFAULT_AMRAP_ROUNDS);
}

        function normaliseDate(value) {
                if (!value) return null;
                if (value instanceof Date) return value;
                if (typeof value === 'number') return new Date(value);
                if (typeof value === 'string') {
                        const parsed = new Date(value);
                        return Number.isNaN(parsed.getTime()) ? null : parsed;
                }
                if (typeof value.toDate === 'function') {
                        return value.toDate();
                }
                if (typeof value.seconds === 'number') {
                        return new Date(value.seconds * 1000);
                }
                return null;
        }

        async function loadDashboard(uid) {
                const currentToken = ++fetchToken;
                isLoading = true;
                loadError = '';

                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);

                try {
                        const attendanceQuery = getDocs(query(collection(db, 'attendance'), where('userId', '==', uid)));
                        const scoresQuery = getDocs(
                                query(collection(db, 'scores'), where('userId', '==', uid), orderBy('date', 'desc'))
                        );
                        const sessionsQuery = getDocs(
                                query(
                                        collection(db, 'sessions'),
                                        where('sessionDate', '>=', startOfToday),
                                        orderBy('sessionDate', 'asc'),
                                        limit(1)
                                )
                        );
                        const profileQuery = getDoc(doc(db, 'profiles', uid));

                        const [attendanceSnapshot, scoresSnapshot, sessionsSnapshot, profileSnap] = await Promise.all([
                                attendanceQuery,
                                scoresQuery,
                                sessionsQuery,
                                profileQuery
                        ]);

                        if (currentToken !== fetchToken) {
                                return;
                        }

                        stats.sessionsAttended = attendanceSnapshot.size;
                        const scores = scoresSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
                        const personalBests = new Map();
                        for (const score of scores) {
                                const existingBest = personalBests.get(score.workoutId);
                                if (!existingBest || Number(score.score) > Number(existingBest.score)) {
                                        personalBests.set(score.workoutId, score);
                                }
                        }
                        stats.personalBests = Array.from(personalBests.values());

                        userProfile = profileSnap.exists() ? profileSnap.data() : null;

                        if (!sessionsSnapshot.empty) {
                                const sessionDoc = sessionsSnapshot.docs[0];
                                const sessionData = sessionDoc.data();
                                const sessionDate = normaliseDate(sessionData.sessionDate);

                                if (sessionDate) {
                                        upcomingSession = {
                                                id: sessionDoc.id,
                                                ...sessionData,
                                                sessionDate
                                        };
                                        hasBooked = Boolean(upcomingSession.rsvps?.some((rsvp) => rsvp.userId === uid));
                                } else {
                                        upcomingSession = null;
                                        hasBooked = false;
                                }
                        } else {
                                upcomingSession = null;
                                hasBooked = false;
                        }
                } catch (error) {
                        console.error('Failed to load dashboard data', error);
                        if (currentToken === fetchToken) {
                                loadError = 'We could not load your dashboard data. Please refresh or try again later.';
                                stats = { sessionsAttended: 0, personalBests: [] };
                                upcomingSession = null;
                                userProfile = null;
                                hasBooked = false;
                        }
                } finally {
                        if (currentToken === fetchToken) {
                                isLoading = false;
                        }
                }
        }

        $: {
                const uid = $user?.uid ?? null;

                if (!uid) {
                        lastLoadedUid = null;
                        hasBooked = false;
                        upcomingSession = null;
                        userProfile = null;
                        stats = { sessionsAttended: 0, personalBests: [] };
                        isLoading = get(loading);
                        loadError = '';
                } else if (uid !== lastLoadedUid) {
                        lastLoadedUid = uid;
                        void loadDashboard(uid);
                }
        }

        $: isSessionToday = (() => {
                if (!upcomingSession?.sessionDate) return false;
                const today = new Date();
                return (
                        upcomingSession.sessionDate.getFullYear() === today.getFullYear() &&
                        upcomingSession.sessionDate.getMonth() === today.getMonth() &&
                        upcomingSession.sessionDate.getDate() === today.getDate()
                );
        })();

        async function bookSpot() {
                if (!upcomingSession || !userProfile || isBooking) return;

                const currentUser = get(user);
                if (!currentUser?.uid) return;

                isBooking = true;
                try {
                        const sessionRef = doc(db, 'sessions', upcomingSession.id);
                        await updateDoc(sessionRef, {
                                rsvps: arrayUnion({
                                        userId: currentUser.uid,
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

                const currentUser = get(user);
                if (!currentUser?.uid) return;

                isBooking = true;
                try {
                        const sessionRef = doc(db, 'sessions', upcomingSession.id);
                        await updateDoc(sessionRef, {
                                rsvps: arrayRemove({
                                        userId: currentUser.uid,
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

</script>

<div class="page-container">
<header class="dashboard-header">
<h1>Welcome, {userProfile?.displayName || 'Member'}!</h1>
<p>Here's a look at your progress and the next session.</p>
</header>

{#if isLoading}
<p>Loading your dashboard...</p>
{:else if loadError}
<p class="error-state">{loadError}</p>
{:else}
<div class="dashboard-grid">
<div class="main-col">
<section class="dashboard-section amrap-section">
<h2>Benchmark AMRAP</h2>
<div class="amrap-card">
<div class="amrap-header">
<div>
        <p class="eyebrow">Today's benchmark</p>
        <p class="amrap-subhead">Tap a round every time you finish it to keep score fast.</p>
</div>
<div class="amrap-count">
        <span>Rounds completed</span>
        <strong>{completedAmrapRounds}</strong>
</div>
</div>
<div class="round-grid" role="group" aria-label="Benchmark AMRAP rounds">
        {#each amrapRounds as isComplete, index}
                <button
                        type="button"
                        class="round-chip"
                        class:done={isComplete}
                        on:click={() => toggleAmrapRound(index)}
                        aria-pressed={isComplete}
                        aria-label={`Round ${index + 1} ${isComplete ? 'completed' : 'not completed'}`}
                >
                        <span class="round-number">{index + 1}</span>
                        {#if isComplete}
                                <span class="round-check" aria-hidden="true">✓</span>
                        {/if}
                </button>
        {/each}
</div>
<div class="amrap-footer">
        <label class="round-count-select">
                Rounds to track
                <select value={amrapRoundSlots} on:change={handleAmrapSelectChange}>
                        {#each AMRAP_ROUND_OPTIONS as option}
                                <option value={option} selected={option === amrapRoundSlots}>{option}</option>
                        {/each}
                </select>
        </label>
        <button type="button" class="ghost-btn" on:click={resetAmrapTracker}>Reset Tracker</button>
</div>
</div>
</section>
<section class="dashboard-section">
<h2>Upcoming Session</h2>
{#if upcomingSession}
<div class="session-card" class:today={isSessionToday}>
<div class="session-info">
<span class="session-date">
        {upcomingSession.sessionDate.toLocaleDateString('en-GB', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
        })}
</span>
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
                    {#each stats.personalBests as pb (pb.id ?? pb.workoutId ?? pb.workoutTitle)}
                            <a
                                    class="pb-card"
                                    href={`/dashboard/personal-bests/${pb.id}`}
                                    aria-label={`View personal best details for ${pb.workoutTitle}`}
                            >
                                    <span class="pb-workout-title">{pb.workoutTitle}</span>
                                    <span class="pb-score">{pb.score}</span>
                                    <span class="pb-date">{normaliseDate(pb.date)?.toLocaleDateString() ?? ''}</span>
                            </a>
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
.page-container {
        width: min(1400px, 100%);
        margin: 0 auto;
        padding: clamp(1rem, 4vw, 2rem);
}
.dashboard-header h1 {
        font-family: var(--font-display);
        color: var(--brand-yellow);
        font-size: 3rem;
        margin: 0;
}
.dashboard-header p {
        font-size: 1.1rem;
        color: var(--text-secondary);
        margin-top: 0.5rem;
}
.dashboard-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 2rem;
        margin-top: 2rem;
}
.main-col,
.sidebar-col {
        display: flex;
        flex-direction: column;
        gap: 2rem;
}
.dashboard-section h2 {
        font-family: var(--font-display);
        font-size: 1.75rem;
        letter-spacing: 1px;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
}
.session-card {
        background: var(--surface-1);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
}
.session-card.today { border-color: var(--brand-green); box-shadow: 0 0 20px rgba(22, 163, 74, 0.2); }
.session-title { font-size: 1.5rem; font-weight: 600; margin: 0.25rem 0; }
.primary-btn, .secondary-btn, .live-btn { text-decoration: none; text-align: center; border: none; padding: 0.8rem 2rem; border-radius: 999px; font-weight: 700; cursor: pointer; }
.live-btn { background: var(--brand-yellow); color: var(--deep-space); }
.stat-card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.5rem; }
.stat-value { font-family: var(--font-display); font-size: 3rem; color: var(--brand-yellow); }
.stat-label { font-size: 0.9rem; color: var(--text-muted); }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
.pb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.pb-card {
        display: block;
        background: var(--surface-2);
        border-radius: 12px;
        padding: 1rem;
        text-decoration: none;
        color: inherit;
        border: 1px solid transparent;
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.pb-card:hover,
.pb-card:focus-visible {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.25);
        border-color: var(--brand-yellow);
}
.pb-card:focus-visible {
        outline: 2px solid var(--brand-yellow);
        outline-offset: 2px;
}
.pb-workout-title { font-weight: 600; }
.pb-score { font-family: var(--font-display); font-size: 2rem; color: var(--brand-yellow); }
.pb-date { font-size: 0.8rem; color: var(--text-muted); }
.amrap-card {
        background: linear-gradient(135deg, rgba(255, 201, 71, 0.08), rgba(34, 197, 94, 0.08));
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 20px;
        padding: 1.75rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
}

.amrap-header {
        display: flex;
        justify-content: space-between;
        gap: 1.5rem;
        flex-wrap: wrap;
}

.eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.2em;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin: 0;
}

.amrap-subhead {
        margin: 0.4rem 0 0;
        color: var(--text-secondary);
}

.amrap-count {
        background: rgba(0, 0, 0, 0.35);
        border-radius: 18px;
        padding: 1rem 1.5rem;
        min-width: 180px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        border: 1px solid rgba(255, 255, 255, 0.08);
}

.amrap-count span {
        font-size: 0.85rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
}

.amrap-count strong {
        font-family: var(--font-display);
        font-size: 3.5rem;
        line-height: 1;
        color: var(--brand-yellow);
}

.round-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(3.25rem, 1fr));
        gap: 0.85rem;
}

.round-chip {
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: var(--surface-2);
        color: var(--text-primary);
        font-weight: 600;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.75rem;
        position: relative;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.round-chip:hover,
.round-chip:focus-visible {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
        outline: none;
}

.round-chip.done {
        background: var(--brand-green);
        border-color: var(--brand-green);
        color: #071b10;
}

.round-number {
        font-family: var(--font-display);
}

.round-check {
        position: absolute;
        bottom: -0.2rem;
        right: -0.2rem;
        background: #071b10;
        color: var(--brand-green);
        width: 1.4rem;
        height: 1.4rem;
        border-radius: 999px;
        font-size: 0.95rem;
        display: grid;
        place-items: center;
        border: 2px solid var(--brand-green);
}

.amrap-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
}

.round-count-select {
        display: flex;
        flex-direction: column;
        font-size: 0.85rem;
        color: var(--text-muted);
        gap: 0.35rem;
}

.round-count-select select {
        min-width: 120px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(0, 0, 0, 0.35);
        color: var(--text-primary);
        padding: 0.4rem 1rem;
}

.ghost-btn {
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        padding: 0.5rem 1.5rem;
        color: var(--text-primary);
        background: transparent;
        font-weight: 600;
        cursor: pointer;
}

.ghost-btn:hover,
.ghost-btn:focus-visible {
        border-color: var(--brand-yellow);
        color: var(--brand-yellow);
        outline: none;
}

@media (max-width: 640px) {
        .page-container {
                padding: 1.25rem;
        }

        .dashboard-header h1 {
                font-size: 2.25rem;
        }

        .dashboard-header p {
                font-size: 1rem;
        }

        .dashboard-grid {
                gap: 1.25rem;
        }

        .session-card {
                flex-direction: column;
                align-items: stretch;
        }

        .session-action,
        .session-action .primary-btn,
        .session-action .secondary-btn,
        .session-action .live-btn {
                width: 100%;
                display: block;
        }

        .amrap-count {
                width: 100%;
                align-items: center;
                text-align: center;
        }

        .round-grid {
                grid-template-columns: repeat(auto-fit, minmax(2.75rem, 1fr));
        }

        .amrap-footer {
                flex-direction: column;
                align-items: flex-start;
        }

        .round-count-select,
        .ghost-btn,
        .pb-grid,
        .stats-grid {
                width: 100%;
        }

        .pb-grid {
                grid-template-columns: 1fr;
        }
}
.empty-state { color: var(--text-muted); }
.error-state { color: var(--error); margin-top: 1rem; text-align: center; }
@media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr; } }
</style>
