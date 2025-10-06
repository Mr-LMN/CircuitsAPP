<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
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

	let stats = {
		sessionsAttended: 0,
		personalBests: []
	};

	// --- NEW: State for the booking system ---
	let upcomingSession = null;
	let userProfile = null;
	let hasBooked = false;
	let isBooking = false; // To disable button during action

	let isLoading = true;

	onMount(async () => {
		if (!$user?.uid) {
			isLoading = false;
			return;
		}

		// --- Step 1: Fetch all necessary data in parallel ---
		const attendanceQuery = getDocs(
			query(collection(db, 'attendance'), where('userId', '==', $user.uid))
		);
		const scoresQuery = getDocs(
			query(collection(db, 'scores'), where('userId', '==', $user.uid), orderBy('date', 'desc'))
		);

		// Query for the next session that is on or after today's date
		const sessionsQuery = getDocs(
			query(
				collection(db, 'sessions'),
				where('sessionDate', '>=', new Date()),
				orderBy('sessionDate', 'asc'),
				limit(1)
			)
		);

		// Fetch the user's profile to get their display name
		const profileQuery = getDoc(doc(db, 'profiles', $user.uid));

		const [attendanceSnapshot, scoresSnapshot, sessionsSnapshot, profileSnap] = await Promise.all([
			attendanceQuery,
			scoresQuery,
			sessionsQuery,
			profileQuery
		]);

		// --- Step 2: Process stats (as before) ---
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

		// --- Step 3: Process session and profile data ---
		if (profileSnap.exists()) {
			userProfile = profileSnap.data();
		}

		if (!sessionsSnapshot.empty) {
			const sessionDoc = sessionsSnapshot.docs[0];
			upcomingSession = { id: sessionDoc.id, ...sessionDoc.data() };

			// Check if the current user is in the rsvps list
			if (upcomingSession.rsvps?.some((rsvp) => rsvp.userId === $user.uid)) {
				hasBooked = true;
			}
		}

		isLoading = false;
	});

	// --- NEW: Booking and Cancelling Logic ---
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
</script>

<div class="page-container">
	<header class="dashboard-header">
		<h1>Your Dashboard</h1>
		<p>Welcome back, {userProfile?.displayName || $user?.email || 'member'}!</p>
	</header>

	{#if isLoading}
		<p>Loading your stats...</p>
	{:else}
		<section class="upcoming-session-section">
			<h2>Upcoming Session</h2>
			{#if upcomingSession}
				<div class="session-card">
					<div class="session-info">
						<span class="session-date">
							{new Date(upcomingSession.sessionDate.seconds * 1000).toLocaleDateString('en-GB', {
								weekday: 'long',
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							})}
						</span>
						<h3 class="session-title">{upcomingSession.workoutTitle}</h3>
						<span class="session-attendees"
							>{upcomingSession.rsvps?.length || 0} Members Booked</span
						>
					</div>
					<div class="session-action">
						{#if hasBooked}
							<button class="secondary-btn" on:click={cancelBooking} disabled={isBooking}>
								{isBooking ? '...' : 'Cancel Booking'}
							</button>
							<p class="confirmation-text">You're booked in. See you there!</p>
						{:else}
							<button class="primary-btn" on:click={bookSpot} disabled={isBooking}>
								{isBooking ? '...' : 'Book My Spot'}
							</button>
						{/if}
					</div>
				</div>
			{:else}
				<p class="empty-state">No upcoming sessions are scheduled yet. Check back soon!</p>
			{/if}
		</section>

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

		<div class="pb-section">
			<h2>Personal Bests</h2>
			{#if stats.personalBests.length === 0}
				<p class="empty-state">
					You haven't logged any benchmark scores yet. Complete a benchmark workout to see your
					results here!
				</p>
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
		</div>
	{/if}
</div>

<style>
	/* ... all previous dashboard styles ... */
	.page-container {
		width: 100%;
		max-width: 1200px;
		margin: 2rem auto;
		padding: 2rem;
	}
	.dashboard-header {
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--border-color);
		margin-bottom: 2rem;
	}
	h1 {
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
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
		margin-top: 3rem;
	}
	.stat-card {
		background: var(--surface-1);
		border: 1px solid var(--border-color);
		border-radius: 16px;
		padding: 2rem;
	}
	.stat-value {
		display: block;
		font-family: var(--font-display);
		font-size: 4rem;
		color: var(--brand-yellow);
	}
	.stat-label {
		display: block;
		font-size: 1rem;
		color: var(--text-muted);
		margin-top: 0.5rem;
	}
	.pb-section {
		margin-top: 4rem;
	}
	.pb-section h2,
	.upcoming-session-section h2 {
		font-family: var(--font-display);
		font-size: 2rem;
		letter-spacing: 2px;
		margin-bottom: 1.5rem;
	}
	.pb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1rem;
	}
	.pb-card {
		background: var(--surface-2);
		border-radius: 12px;
		padding: 1.5rem;
	}
	.pb-workout-title {
		font-weight: 600;
		font-size: 1.1rem;
	}
	.pb-score {
		font-family: var(--font-display);
		font-size: 2.5rem;
		color: var(--brand-yellow);
		margin: 0.5rem 0;
		display: block;
	}
	.pb-date {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.empty-state {
		color: var(--text-muted);
	}

	/* --- NEW: Styles for Upcoming Session card --- */
	.upcoming-session-section {
		margin-bottom: 3rem;
	}
	.session-card {
		background: linear-gradient(135deg, var(--surface-1), var(--deep-space));
		border: 1px solid var(--brand-green);
		box-shadow: 0 0 30px rgba(22, 163, 74, 0.2);
		border-radius: 16px;
		padding: 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.5rem;
	}
	.session-info {
		flex: 1 1 500px;
	}
	.session-date {
		font-family: var(--font-display);
		font-size: 1.25rem;
		color: var(--text-muted);
		letter-spacing: 1px;
	}
	.session-title {
		font-family: var(--font-body);
		font-size: 1.75rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0.25rem 0;
	}
	.session-attendees {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.session-action {
		flex-shrink: 0;
		text-align: center;
	}
	.primary-btn,
	.secondary-btn {
		border: none;
		padding: 1rem 2.5rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 1.1rem;
		cursor: pointer;
	}
	.primary-btn {
		background: var(--brand-green);
		color: var(--text-primary);
	}
	.secondary-btn {
		background: var(--surface-2);
		color: var(--text-secondary);
	}
	.confirmation-text {
		font-size: 0.9rem;
		color: var(--brand-green);
		margin-top: 0.5rem;
	}
</style>
