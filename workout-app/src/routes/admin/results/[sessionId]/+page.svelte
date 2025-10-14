<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { get } from 'svelte/store';
import { page } from '$app/stores';
import { db } from '$lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

let isLoading = true;
let loadError = '';
let session = null;
let workout = null;
let scoreEntries = [];
let feedback = [];

let totalAttendees = 0;
let totalResults = 0;
let averageRating = null;
let feedbackCount = 0;
let attendeeSummaries = [];
let sessionDateDisplay = '—';

const metricLabels = {
        reps: 'Reps',
        weight: 'Weight',
        cals: 'Calories',
        dist: 'Distance'
};

function toDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') {
                return value.toDate();
        }
        if (value.seconds) {
                return new Date(value.seconds * 1000);
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, options) {
        const date = toDate(value);
        if (!date) return '—';
        return date.toLocaleString('en-GB', options);
}

function formatMetric(metric, value) {
        if (metric === 'weight') {
                return `${value} kg`;
        }
        return value;
}

onMount(async () => {
        const { sessionId } = get(page).params;
        if (!sessionId) {
                loadError = 'No session ID provided.';
                isLoading = false;
                return;
        }

        try {
                const sessionRef = doc(db, 'sessions', sessionId);
                const sessionSnap = await getDoc(sessionRef);

                if (!sessionSnap.exists()) {
                        loadError = 'Session not found.';
                        return;
                }

                const sessionData = sessionSnap.data();
                session = {
                        id: sessionSnap.id,
                        ...sessionData,
                        attendance: sessionData.attendance ?? []
                };

                if (session.workoutId) {
                        const workoutSnap = await getDoc(doc(db, 'workouts', session.workoutId));
                        if (workoutSnap.exists()) {
                                workout = { id: workoutSnap.id, ...workoutSnap.data() };
                        }
                }

                const scoresSnapshot = await getDocs(query(collection(db, 'scores'), where('sessionId', '==', sessionId)));
                scoreEntries = scoresSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

                const feedbackSnapshot = await getDocs(collection(db, 'sessions', sessionId, 'feedback'));
                feedback = feedbackSnapshot.docs
                        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
                        .sort((a, b) => {
                                const aTime = toDate(a.createdAt)?.getTime() ?? 0;
                                const bTime = toDate(b.createdAt)?.getTime() ?? 0;
                                return bTime - aTime;
                        });
        } catch (error) {
                console.error('Failed to load session results', error);
                loadError = 'Unable to load session results. Please try again.';
        } finally {
                isLoading = false;
        }
});

$: totalAttendees = session?.attendance?.length ?? 0;
$: totalResults = scoreEntries.length;
$: feedbackCount = feedback.length;
$: sessionDateDisplay = formatDate(session?.sessionDate, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
});

$: {
        const ratings = feedback
                .map((item) => Number(item.rating))
                .filter((value) => Number.isFinite(value) && value > 0);
        averageRating = ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : null;
}

$: attendeeSummaries = (() => {
        const resultMap = new Map(scoreEntries.map((entry) => [entry.userId, entry]));
        const ids = new Set();
        (session?.attendance ?? []).forEach((attendee) => ids.add(attendee.userId));
        scoreEntries.forEach((entry) => ids.add(entry.userId));

        const summaries = Array.from(ids).map((userId) => {
                const attendanceInfo = (session?.attendance ?? []).find((item) => item.userId === userId) ?? null;
                const result = resultMap.get(userId) ?? null;
                const displayName = result?.displayName || attendanceInfo?.displayName || 'Member';
                return { userId, displayName, attendanceInfo, result };
        });

        return summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));
})();
</script>

<div class="page-container">
        <header class="page-header">
                <div>
                        <h1>{workout?.title ?? session?.workoutTitle ?? 'Session Results'}</h1>
                        <p>
                                {#if sessionDateDisplay !== '—'}Held on {sessionDateDisplay}{/if}
                                {#if workout?.type}
                                        <span> · {workout.type} workout</span>
                                {/if}
                        </p>
                </div>
                <a href="/admin/sessions" class="back-link">&larr; Back to Sessions</a>
        </header>

        {#if isLoading}
                <p class="loading-message">Loading session insights…</p>
        {:else if loadError}
                <p class="error-message">{loadError}</p>
        {:else}
                <section class="summary-grid">
                        <div class="summary-card">
                                <span class="summary-label">Session Date</span>
                                <span class="summary-value">{sessionDateDisplay}</span>
                                {#if session?.sessionDate}
                                        <span class="summary-subtext">{formatDate(session.sessionDate, { hour: '2-digit', minute: '2-digit' })}</span>
                                {/if}
                        </div>
                        <div class="summary-card">
                                <span class="summary-label">Attendees</span>
                                <span class="summary-value">{totalAttendees}</span>
                                <span class="summary-subtext">
                                        {#if totalAttendees === 0}
                                                No attendance recorded
                                        {:else if totalAttendees === 1}
                                                Member checked in
                                        {:else}
                                                Members checked in
                                        {/if}
                                </span>
                        </div>
                        <div class="summary-card">
                                <span class="summary-label">Results Uploaded</span>
                                <span class="summary-value">{totalResults}</span>
                                <span class="summary-subtext">
                                        {totalResults === 1 ? 'Score recorded' : 'Scores recorded'}
                                </span>
                        </div>
                        <div class="summary-card">
                                <span class="summary-label">Average Rating</span>
                                <span class="summary-value">{averageRating ?? '—'}</span>
                                <span class="summary-subtext">
                                        {feedbackCount === 0
                                                ? 'No feedback yet'
                                                : `${feedbackCount} response${feedbackCount === 1 ? '' : 's'}`}
                                </span>
                        </div>
                </section>

                <section class="results-section">
                        <h2>Attendee Results</h2>
                        {#if attendeeSummaries.length === 0}
                                <p class="empty-state">No attendance recorded for this session yet.</p>
                        {:else}
                                <div class="results-grid">
                                        {#each attendeeSummaries as summary}
                                                <article class="result-card">
                                                        <header>
                                                                <h3>{summary.displayName}</h3>
                                                                <div class="result-meta">
                                                                        {#if Number(summary.result?.totalTimeMinutes) > 0}
                                                                                <span>{summary.result.totalTimeMinutes} min on floor</span>
                                                                        {/if}
                                                                        {#if summary.result?.date}
                                                                                <span>
                                                                                        Uploaded {formatDate(summary.result.date, { dateStyle: 'medium', timeStyle: 'short' })}
                                                                                </span>
                                                                        {/if}
                                                                </div>
                                                        </header>

                                                        {#if summary.result}
                                                                {#if summary.result.timeScore}
                                                                        <p class="time-score">Completion time: {summary.result.timeScore}</p>
                                                                {/if}

                                                                {#if summary.result.exerciseScores?.length}
                                                                        <ul class="station-breakdown">
                                                                                {#each summary.result.exerciseScores as station}
                                                                                        <li>
                                                                                                <div class="station-heading">
                                                                                                        <span class="station-name">{station.stationName}</span>
                                                                                                        <span class="station-category">{station.category}</span>
                                                                                                </div>
                                                                                                <div class="station-metrics">
                                                                                                        {#each Object.entries(station.score) as [metric, value]}
                                                                                                                <span>{metricLabels[metric] ?? metric}: {formatMetric(metric, value)}</span>
                                                                                                        {/each}
                                                                                                </div>
                                                                                        </li>
                                                                                {/each}
                                                                        </ul>
                                                                {:else}
                                                                        <p class="empty-note">No station details recorded.</p>
                                                                {/if}
                                                        {:else}
                                                                <p class="empty-note">No results uploaded yet.</p>
                                                        {/if}
                                                </article>
                                        {/each}
                                </div>
                        {/if}
                </section>

                <section class="feedback-section">
                        <h2>Session Feedback</h2>
                        {#if feedback.length === 0}
                                <p class="empty-state">No feedback submitted yet.</p>
                        {:else}
                                <ul class="feedback-list">
                                        {#each feedback as item}
                                                <li class="feedback-item">
                                                        {#if item.rating}
                                                                <div class="feedback-stars-row" aria-label={`${item.rating} star rating`}>
                                                                        {#each [1, 2, 3, 4, 5] as star}
                                                                                <span class:filled={item.rating && star <= item.rating}>★</span>
                                                                        {/each}
                                                                </div>
                                                        {/if}
                                                        {#if item.comment}
                                                                <p>{item.comment}</p>
                                                        {/if}
                                                        <span class="timestamp">{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                                </li>
                                        {/each}
                                </ul>
                        {/if}
                </section>
        {/if}
</div>

<style>
        .page-container {
                max-width: 1200px;
                margin: 2rem auto 4rem;
                padding: 0 1.5rem;
        }

        .page-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 1.5rem;
                margin-bottom: 2.5rem;
        }

        .page-header h1 {
                margin: 0;
                font-family: var(--font-display);
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--brand-yellow);
                font-size: clamp(2.5rem, 5vw, 3.5rem);
        }

        .page-header p {
                margin: 0.75rem 0 0;
                color: var(--text-secondary);
                font-size: 1rem;
        }

        .back-link {
                align-self: center;
                color: var(--brand-yellow);
                text-decoration: none;
                font-weight: 600;
        }

        .back-link:hover {
                text-decoration: underline;
        }

        .summary-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 1.25rem;
                margin-bottom: 2.5rem;
        }

        .summary-card {
                background: var(--surface-1);
                border: 1px solid var(--border-color);
                border-radius: 18px;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
        }

        .summary-label {
                font-size: 0.85rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: var(--text-muted);
        }

        .summary-value {
                font-size: 2rem;
                font-family: var(--font-display);
                letter-spacing: 0.06em;
                color: var(--text-primary);
        }

        .summary-subtext {
                font-size: 0.85rem;
                color: var(--text-secondary);
        }

        .results-section,
        .feedback-section {
                margin-bottom: 2.5rem;
        }

        .results-section h2,
        .feedback-section h2 {
                font-family: var(--font-display);
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--brand-yellow);
                font-size: clamp(2rem, 4vw, 2.75rem);
                margin-bottom: 1.5rem;
        }

        .results-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 1.5rem;
        }

        .result-card {
                background: var(--surface-1);
                border: 1px solid var(--border-color);
                border-radius: 20px;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 1rem;
                box-shadow: 0 25px 50px rgba(15, 23, 42, 0.25);
        }

        .result-card h3 {
                margin: 0;
                font-size: 1.25rem;
                color: var(--text-primary);
        }

        .result-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 0.6rem;
                font-size: 0.85rem;
                color: var(--text-muted);
        }

        .result-meta span {
                background: var(--surface-2);
                border-radius: 999px;
                padding: 0.3rem 0.75rem;
        }

        .time-score {
                color: var(--brand-yellow);
                font-weight: 600;
        }

        .station-breakdown {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 1rem;
        }

        .station-breakdown li {
                background: var(--surface-2);
                border-radius: 14px;
                padding: 1rem;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
        }

        .station-heading {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 0.5rem;
        }

        .station-name {
                font-weight: 600;
                color: var(--text-primary);
        }

        .station-category {
                font-size: 0.75rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--brand-yellow);
                background: rgba(253, 224, 71, 0.1);
                border-radius: 999px;
                padding: 0.2rem 0.6rem;
        }

        .station-metrics {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem 1rem;
                font-size: 0.9rem;
                color: var(--text-secondary);
        }

        .empty-note {
                color: var(--text-muted);
                font-size: 0.9rem;
        }

        .feedback-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 1rem;
        }

        .feedback-item {
                background: var(--surface-1);
                border: 1px solid var(--border-color);
                border-radius: 18px;
                padding: 1.25rem;
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
        }

        .feedback-stars-row {
                display: flex;
                gap: 0.2rem;
                font-size: 1.2rem;
                color: rgba(253, 224, 71, 0.3);
        }

        .feedback-stars-row span.filled {
                color: var(--brand-yellow);
        }

        .feedback-item p {
                margin: 0;
                color: var(--text-primary);
        }

        .timestamp {
                font-size: 0.8rem;
                color: var(--text-muted);
        }

        .empty-state {
                color: var(--text-muted);
        }

        .error-message {
                color: #f87171;
                background: rgba(248, 113, 113, 0.15);
                border: 1px solid rgba(248, 113, 113, 0.3);
                padding: 1rem 1.25rem;
                border-radius: 12px;
        }

        .loading-message {
                color: var(--text-secondary);
        }

        @media (max-width: 720px) {
                .page-header {
                        flex-direction: column;
                        align-items: flex-start;
                }

                .back-link {
                        align-self: flex-start;
                }
        }
</style>
