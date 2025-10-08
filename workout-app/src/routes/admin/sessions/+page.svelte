<script>
	// @ts-nocheck
	import { onMount, onDestroy } from 'svelte';
	import { db, auth } from '$lib/firebase';
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

	let allWorkouts = [];
	let sessions = [];
	let newSession = { date: '', workoutId: '' };
	let isLoading = true;
	let isSubmitting = false;
	let unsubscribeSessions = () => {};

	function formatDate(date) {
		if (!date) return null;
		if (date.seconds) {
			return new Date(date.seconds * 1000);
		}
		const d = new Date(date);
		return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	}

	onMount(async () => {
		const user = auth.currentUser;
		if (!user) return;

		// Fetch workouts for the dropdown (this only needs to happen once)
		const workoutsQuery = query(collection(db, 'workouts'), where('creatorId', '==', user.uid));
		const workoutsSnapshot = await getDocs(workoutsQuery);
		allWorkouts = workoutsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

		// NEW: Set up a real-time listener for sessions
		const sessionsQuery = query(
			collection(db, 'sessions'),
			where('creatorId', '==', user.uid),
			orderBy('sessionDate', 'desc')
		);
		unsubscribeSessions = onSnapshot(sessionsQuery, snapshot => {
			sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
			isLoading = false;
		});
	});

	// Clean up the listener when the page is left
	onDestroy(() => {
		unsubscribeSessions();
	});

	async function createSession() {
		if (!newSession.date || !newSession.workoutId || isSubmitting) {
			alert('Please select a date and a workout.');
			return;
		}
		isSubmitting = true;

		try {
			const selectedWorkout = allWorkouts.find(w => w.id === newSession.workoutId);
			const sessionData = {
				creatorId: auth.currentUser.uid,
				sessionDate: formatDate(newSession.date),
				workoutId: selectedWorkout.id,
				workoutTitle: selectedWorkout.title,
				rsvps: [],
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
			// The onSnapshot listener will automatically remove it from the UI
		} catch (error) {
			console.error('Error deleting session:', error);
			alert('Failed to delete session.');
		}
	}
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
		<h2>Upcoming & Past Sessions</h2>
		{#if isLoading}
			<p>Loading sessions...</p>
		{:else if sessions.length === 0}
			<p class="empty-state">You haven't created any sessions yet.</p>
		{:else}
			<div class="sessions-grid">
				{#each sessions as session}
					{@const displayDate = formatDate(session.sessionDate)}
					<div class="session-card">
						<div class="session-header">
							<div class="session-date">
								{#if displayDate}
									<span>{displayDate.toLocaleString('en-GB', { weekday: 'long' })}</span>
									<span>{displayDate.toLocaleDateString('en-GB')}</span>
								{:else}
									<span>Invalid Date</span>
								{/if}
							</div>
							<button class="delete-btn" on:click={() => deleteSession(session.id)}>&times;</button>
						</div>
						<div class="session-details">
							<h3>{session.workoutTitle}</h3>
							<div class="rsvp-section">
								<h4>Attendees ({session.rsvps.length})</h4>
								{#if session.rsvps.length > 0}
									<div class="attendee-list">
										{#each session.rsvps as rsvp}
											<span class="attendee-chip">{rsvp.displayName}</span>
										{/each}
									</div>
								{:else}
									<p class="no-rsvps">No bookings yet.</p>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	/* ... (all previous styles for this page) ... */
	.page-container { width: 100%; max-width: 1200px; margin: 2rem auto; padding: 2rem; }
	.page-header h1 { font-family: var(--font-display); color: var(--brand-yellow); font-size: 3rem; margin: 0; }
	.card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 2rem; }
	.create-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 1.5rem; align-items: flex-end; }
	.form-group label { display: block; margin-bottom: 0.5rem; color: var(--text-muted); }
	.form-group input, .form-group select { width: 100%; font-size: 1rem; padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--border-color); background: var(--deep-space); color: var(--text-primary); }
	.primary-btn { border: none; background: var(--brand-green); color: var(--text-primary); padding: 0.75rem 2rem; border-radius: 12px; font-weight: 600; cursor: pointer; height: fit-content; }
        .sessions-list { margin-top: 3rem; }
        .sessions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
        .session-card { background: var(--surface-2); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	
	/* NEW: Styles for the card header */
        .session-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding-bottom: 1rem;
                border-bottom: 1px solid var(--border-color);
        }
        .session-date { font-family: var(--font-display); font-size: 1.5rem; color: var(--brand-yellow); }
	.delete-btn {
		background: none;
		border: 1px solid var(--text-muted);
		color: var(--text-muted);
		width: 32px;
		height: 32px;
		border-radius: 50%;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
	}
	.delete-btn:hover {
		background: #ef4444;
		color: white;
		border-color: #ef4444;
	}
</style>
