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
                        const scores = scoresSnapshot.docs.map((docSnap) => docSnap.data());
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
{#each stats.personalBests as pb}
<div class="pb-card">
<span class="pb-workout-title">{pb.workoutTitle}</span>
<span class="pb-score">{pb.score}</span>
<span class="pb-date">{normaliseDate(pb.date)?.toLocaleDateString() ?? ''}</span>
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
.error-state { color: var(--error); margin-top: 1rem; text-align: center; }
@media (max-width: 900px) { .dashboard-grid { grid-template-columns: 1fr; } }
</style>
