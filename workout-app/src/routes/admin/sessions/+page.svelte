<script>
// @ts-nocheck
import { onMount } from 'svelte';
import { get } from 'svelte/store';
import { db } from '$lib/firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  doc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { loading, user } from '$lib/store';

let allWorkouts = [];
let upcomingSessions = [];
let pastSessions = [];
let newSession = { date: '', workoutId: '' };
let isLoading = true;
let isSubmitting = false;
let searchTerm = '';
let unsubscribeSessions = () => {};
let currentUid = null;

function formatDate(date) {
if (!date) return null;
if (date.seconds) {
return new Date(date.seconds * 1000);
}
const d = new Date(date);
return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function fetchAttendanceForSessions(sessionIds, creatorId) {
  const attendanceMap = new Map();

  if (!sessionIds.length) {
    return attendanceMap;
  }

  try {
    const attendanceSnapshots = await Promise.all(
      sessionIds.map((id) =>
        getDocs(
          query(
            collection(db, 'attendance'),
            ...(creatorId ? [where('creatorId', '==', creatorId)] : []),
            where('sessionId', '==', id)
          )
        )
      )
    );

    attendanceSnapshots.forEach((snapshot, index) => {
      const sessionId = sessionIds[index];
      attendanceMap.set(
        sessionId,
        snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      );
    });
  } catch (error) {
    console.error('Failed to fetch attendance records for sessions', error);
  }

  return attendanceMap;
}

async function watchSessions(uid) {
  unsubscribeSessions();

  const workoutsQuery = query(collection(db, 'workouts'), where('creatorId', '==', uid));
  const workoutsSnapshot = await getDocs(workoutsQuery);
  allWorkouts = workoutsSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

  const sessionsQuery = query(
    collection(db, 'sessions'),
    where('creatorId', '==', uid),
    orderBy('sessionDate', 'desc')
  );

  let sessionUpdateToken = 0;

  unsubscribeSessions = onSnapshot(
    sessionsQuery,
    (snapshot) => {
      const baseSessions = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          rsvps: data.rsvps ?? [],
          attendance: []
        };
      });

      const sessionIds = baseSessions.map((session) => session.id);
      const currentToken = ++sessionUpdateToken;

      void (async () => {
        const attendanceMap = await fetchAttendanceForSessions(sessionIds, uid);

        if (currentToken !== sessionUpdateToken) {
          return;
        }

        const enrichedSessions = baseSessions.map((session) => ({
          ...session,
          attendance: attendanceMap.get(session.id) ?? []
        }));

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        upcomingSessions = enrichedSessions
          .filter((session) => {
            const date = formatDate(session.sessionDate);
            return date && date >= startOfToday;
          })
          .reverse();

        pastSessions = enrichedSessions.filter((session) => {
          const date = formatDate(session.sessionDate);
          return date && date < startOfToday;
        });

        isLoading = false;
      })();
    },
    (error) => {
      console.error('Failed to subscribe to sessions', error);
      isLoading = false;
    }
  );
}

onMount(() => {
  const unsubscribeUser = user.subscribe(async ($user) => {
    const uid = $user?.uid ?? null;

    if (!uid) {
      unsubscribeSessions();
      currentUid = null;
      allWorkouts = [];
      upcomingSessions = [];
      pastSessions = [];
      isLoading = get(loading);
      return;
    }

    if (uid === currentUid) return;
    currentUid = uid;
    isLoading = true;
    try {
      await watchSessions(uid);
    } catch (error) {
      console.error('Failed to initialise sessions dashboard', error);
      isLoading = false;
    }
  });

  const unsubscribeLoading = loading.subscribe(($loading) => {
    if (!get(user)?.uid) {
      isLoading = $loading;
    }
  });

  unsubscribeSessions = () => {};

  return () => {
    unsubscribeSessions();
    unsubscribeUser();
    unsubscribeLoading();
  };
});

async function createSession() {
  if (!newSession.date || !newSession.workoutId || isSubmitting) {
    alert('Please select a date and a workout.');
    return;
  }

  const currentUser = get(user);
  if (!currentUser?.uid) {
    alert('You need to be signed in to create sessions.');
    return;
  }

  const selectedWorkout = allWorkouts.find((w) => w.id === newSession.workoutId);
  if (!selectedWorkout) {
    alert('Please choose a valid workout.');
    return;
  }

  isSubmitting = true;
  try {
    const sessionData = {
      creatorId: currentUser.uid,
      sessionDate: formatDate(newSession.date),
      workoutId: selectedWorkout.id,
      workoutTitle: selectedWorkout.title,
      rsvps: [],
      attendance: [],
      createdAt: serverTimestamp()
    };
    await addDoc(collection(db, 'sessions'), sessionData);
    newSession = { date: '', workoutId: '' };
  } catch (error) {
    console.error('Error creating session:', error);
    alert('Failed to create session.');
  } finally {
    isSubmitting = false;
  }
}

async function deleteSession(sessionId) {
if (!confirm('Are you sure you want to delete this session?')) return;
try {
await deleteDoc(doc(db, 'sessions', sessionId));
} catch (error) {
console.error('Error deleting session:', error);
alert('Failed to delete session.');
}
}

$: filteredPastSessions = pastSessions.filter((s) =>
s.workoutTitle.toLowerCase().includes(searchTerm.toLowerCase())
);
</script>

<div class="page-container">
	<header class="page-header">
		<h1>Manage Sessions</h1>
		<p>Create new class events and view upcoming and past sessions.</p>
	</header>

	<section class="card create-session-card">
		<h2>Create New Session</h2>
		<form on:submit|preventDefault={createSession} class="create-form">
			<div class="form-group">
				<label for="sessionDate">Session Date</label>
				<input id="sessionDate" type="date" bind:value={newSession.date} required />
			</div>
			<div class="form-group">
				<label for="workout">Select Workout</label>
				<select id="workout" bind:value={newSession.workoutId} required>
					<option value="" disabled>Choose a workout...</option>
					{#each allWorkouts as workout}
						<option value={workout.id}>{workout.title}</option>
					{/each}
				</select>
			</div>
			<button type="submit" class="primary-btn" disabled={isSubmitting}>
				{isSubmitting ? 'Creating...' : 'Create Session'}
			</button>
		</form>
	</section>

	<section class="sessions-list">
		<h2>Upcoming Sessions</h2>
		{#if isLoading}
			<p>Loading...</p>
		{:else if upcomingSessions.length === 0}
			<p class="empty-state">You have no upcoming sessions scheduled.</p>
		{:else}
			<div class="sessions-grid">
				{#each upcomingSessions as session}
					{@const displayDate = formatDate(session.sessionDate)}
					<div class="session-card">
						<div class="session-header">
							<div class="session-date">
								{#if displayDate}
									<span>{displayDate.toLocaleString('en-GB', { weekday: 'long' })}</span>
									<span>{displayDate.toLocaleDateString('en-GB')}</span>
								{/if}
							</div>
							<button class="delete-btn" on:click={() => deleteSession(session.id)}>&times;</button>
						</div>
                                                        <div class="session-details">
                                                        <h3>{session.workoutTitle}</h3>
                                                        <p>{session.rsvps?.length ?? 0} Attendees Booked</p>
                                                </div>
                                                <div class="card-actions">
                                                        <a
                                                                href={`/timer/${session.workoutId}?session_id=${session.id}`}
                                                                class="start-btn"
                                                        >
                                                                Start Session
                                                        </a>
                                                </div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="sessions-list">
		<div class="list-header">
			<h2>Past Sessions</h2>
			<input type="search" bind:value={searchTerm} placeholder="Search past workouts..." />
		</div>
		{#if isLoading}
			<p>Loading...</p>
		{:else if pastSessions.length === 0}
			<p class="empty-state">No past sessions found.</p>
		{:else}
			<div class="sessions-grid">
				{#each filteredPastSessions as session}
					{@const displayDate = formatDate(session.sessionDate)}
                                        <div class="session-card past">
                                                <div class="session-header">
                                                        <div class="session-date">
                                                                {#if displayDate}
                                                                        <span>{displayDate.toLocaleDateString('en-GB')}</span>
                                                                {/if}
                                                        </div>
                                                        <button class="delete-btn" on:click={() => deleteSession(session.id)}>&times;</button>
                                                </div>
                                                <div class="session-details">
                                                        <h3>{session.workoutTitle}</h3>
                                                        <p class:empty={!session.attendance?.length}>
                                                                {session.attendance?.length ?? 0} Attended
                                                        </p>
                                                </div>
						<div class="card-actions">
							<a href={`/admin/results/${session.id}`} class="secondary-btn">View Results</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.page-container {
		max-width: 1400px;
		margin: 2rem auto;
	}

	.card {
		background: var(--surface-1);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 2rem;
	}

	.create-form {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 1rem;
		align-items: flex-end;
	}

	.primary-btn {
		border: none;
		background: var(--brand-green);
		color: var(--text-primary);
		padding: 0.75rem 2rem;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		height: fit-content;
	}

	.sessions-list {
		margin-top: 3rem;
	}

	.sessions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
		gap: 1.5rem;
		margin-top: 1.5rem;
	}

	.session-card {
		background: var(--surface-2);
		border-radius: 12px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
	}

	.session-card.past {
		background: var(--surface-1);
		opacity: 0.7;
	}

	.session-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.session-date {
		font-family: var(--font-display);
		font-size: 1.5rem;
		color: var(--brand-yellow);
	}

        .session-details {
                flex-grow: 1;
        }

        .session-details p.empty {
                color: var(--text-muted);
        }

	.session-details h3 {
		font-size: 1.25rem;
		margin: 1rem 0;
	}

	.delete-btn {
		background: none;
		border: 1px solid var(--text-muted);
		color: var(--text-muted);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		font-size: 1.5rem;
		cursor: pointer;
	}

	.card-actions {
		margin-top: 1rem;
	}

	.start-btn,
	.secondary-btn {
		display: block;
		text-align: center;
		text-decoration: none;
		padding: 0.75rem;
		border-radius: 12px;
		font-weight: 600;
	}

	.start-btn {
		background: var(--brand-green);
		color: var(--text-primary);
	}

	.secondary-btn {
		background: var(--surface-3);
		color: var(--text-secondary);
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.list-header input {
		padding: 0.5rem 1rem;
		border-radius: 999px;
		border: 1px solid var(--border-color);
		background: var(--deep-space);
		color: var(--text-primary);
	}
</style>
