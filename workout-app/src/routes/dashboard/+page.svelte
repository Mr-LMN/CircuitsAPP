<script>
	// @ts-nocheck
	import { get } from 'svelte/store';
	import { resolve } from '$app/paths';
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
	import { isAdmin, loading, user } from '$lib/store';

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
			const attendanceQuery = getDocs(
				query(collection(db, 'attendance'), where('userId', '==', uid))
			);
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

			const [attendanceSnapshot, scoresSnapshot, sessionsSnapshot, profileSnap] = await Promise.all(
				[attendanceQuery, scoresQuery, sessionsQuery, profileQuery]
			);

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

	$: attendanceTotal = stats.sessionsAttended;
	$: benchmarkTotal = stats.personalBests.length;
	$: nextSessionCount = upcomingSession?.rsvps?.length ?? 0;
	$: nextSessionDateLabel = upcomingSession?.sessionDate
		? upcomingSession.sessionDate.toLocaleDateString('en-GB', {
				weekday: 'long',
				month: 'long',
				day: 'numeric'
			})
		: '';
	$: nextSessionTimeLabel = upcomingSession?.sessionDate
		? upcomingSession.sessionDate.toLocaleTimeString('en-GB', {
				hour: '2-digit',
				minute: '2-digit'
			})
		: '';
	$: coachChecklist = [
		{
			label: 'Create or confirm the next session',
			done: Boolean(upcomingSession)
		},
		{
			label: 'Check attendance before class starts',
			done: Boolean(upcomingSession && nextSessionCount > 0)
		},
		{
			label: 'Review member PBs for shout-outs',
			done: benchmarkTotal > 0
		}
	];

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
	<header class="dashboard-hero">
		<div>
			<p class="eyebrow">Training hub</p>
			<h1>Welcome, {userProfile?.displayName || 'Member'}.</h1>
			<p class="hero-copy">
				Your next class, recent benchmarks and coach actions are now in one cleaner place.
			</p>
		</div>
		{#if $isAdmin}
			<div class="hero-actions" aria-label="Coach shortcuts">
				<a href={resolve('/admin/create')} class="quick-action primary">Create workout</a>
				<a href={resolve('/admin/sessions')} class="quick-action">Schedule class</a>
			</div>
		{/if}
	</header>

	{#if isLoading}
		<section class="dashboard-section loading-panel" aria-live="polite">
			<span class="mini-loader" aria-hidden="true"></span>
			<p>Loading your dashboard...</p>
		</section>
	{:else if loadError}
		<p class="error-state">{loadError}</p>
	{:else}
		<section class="metric-strip" aria-label="Dashboard overview">
			<div class="metric-card">
				<span class="metric-label">Sessions attended</span>
				<strong>{attendanceTotal}</strong>
				<span>Keep stacking consistency.</span>
			</div>
			<div class="metric-card">
				<span class="metric-label">Benchmarks logged</span>
				<strong>{benchmarkTotal}</strong>
				<span>{benchmarkTotal ? 'Tap a PB for detail.' : 'Log your first score.'}</span>
			</div>
			<div class="metric-card accent">
				<span class="metric-label">Next class bookings</span>
				<strong>{nextSessionCount}</strong>
				<span>{upcomingSession ? upcomingSession.workoutTitle : 'No class scheduled'}</span>
			</div>
		</section>

		<div class="dashboard-grid">
			<div class="main-col">
				<section class="dashboard-section session-section">
					<div class="section-heading">
						<div>
							<p class="eyebrow">Next up</p>
							<h2>Upcoming Session</h2>
						</div>
						{#if upcomingSession && isSessionToday}
							<span class="today-badge">Today</span>
						{/if}
					</div>
					{#if upcomingSession}
						<div class="session-card" class:today={isSessionToday}>
							<div class="session-info">
								<span class="session-date">{nextSessionDateLabel}</span>
								<h3 class="session-title">{upcomingSession.workoutTitle}</h3>
								<div class="session-meta">
									<span>{nextSessionTimeLabel || 'Time TBC'}</span>
									<span>{nextSessionCount} booked</span>
									<span
										>{isSessionToday
											? 'Ready for check-in'
											: hasBooked
												? 'You are booked'
												: 'Book when ready'}</span
									>
								</div>
							</div>
							<div class="session-action">
								{#if isSessionToday}
									<a
										href={resolve(/** @type {any} */ (`/live/${upcomingSession.id}`))}
										class="live-btn">I'm here & ready</a
									>
								{:else if hasBooked}
									<button class="secondary-btn" on:click={cancelBooking} disabled={isBooking}>
										{isBooking ? 'Updating...' : 'Cancel booking'}
									</button>
								{:else}
									<button class="primary-btn" on:click={bookSpot} disabled={isBooking}>
										{isBooking ? 'Booking...' : 'Book my spot'}
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<div class="empty-state rich">
							<strong>No upcoming sessions yet.</strong>
							<span
								>{$isAdmin
									? 'Schedule the next class so members can book in.'
									: 'Your coach has not scheduled the next session yet.'}</span
							>
							{#if $isAdmin}
								<a href={resolve('/admin/sessions')} class="inline-link">Create a session</a>
							{/if}
						</div>
					{/if}
				</section>

				<section class="dashboard-section">
					<div class="section-heading">
						<div>
							<p class="eyebrow">Progress</p>
							<h2>Personal Bests</h2>
						</div>
					</div>
					{#if stats.personalBests.length === 0}
						<div class="empty-state rich">
							<strong>No benchmarks yet.</strong>
							<span>Complete a benchmark workout and your best score will appear here.</span>
						</div>
					{:else}
						<div class="pb-grid">
							{#each stats.personalBests as pb (pb.id ?? pb.workoutId ?? pb.workoutTitle)}
								<a
									class="pb-card"
									href={resolve(/** @type {any} */ (`/dashboard/personal-bests/${pb.id}`))}
									aria-label={`View personal best details for ${pb.workoutTitle}`}
								>
									<span class="pb-workout-title">{pb.workoutTitle}</span>
									<span class="pb-score">{pb.score}</span>
									<span class="pb-date"
										>{normaliseDate(pb.date)?.toLocaleDateString() ?? 'Date not set'}</span
									>
								</a>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<aside class="sidebar-col">
				{#if $isAdmin}
					<section class="dashboard-section coach-panel">
						<p class="eyebrow">Coach QOL</p>
						<h2>Class checklist</h2>
						<ul class="checklist">
							{#each coachChecklist as item (item.label)}
								<li class:done={item.done}>
									<span>{item.done ? '✓' : '•'}</span>
									{item.label}
								</li>
							{/each}
						</ul>
						<div class="coach-links">
							<a href={resolve('/admin/attendance')}>Open check-in</a>
							<a href={resolve('/admin/workouts')}>Workout library</a>
							{#if upcomingSession}
								<a href={resolve(/** @type {any} */ (`/admin/results/${upcomingSession.id}`))}
									>Session results</a
								>
							{/if}
						</div>
					</section>
				{/if}

				<section class="dashboard-section tip-panel">
					<p class="eyebrow">Today’s focus</p>
					<h2>{upcomingSession ? 'Arrive prepared' : 'Build momentum'}</h2>
					<p>
						{upcomingSession
							? 'Hydrate, check the workout notes and arrive five minutes early so the warm-up starts smoothly.'
							: 'A benchmark score gives you and your coach a better baseline for future programming.'}
					</p>
				</section>
			</aside>
		</div>
	{/if}
</div>

<style>
	.page-container {
		width: min(1180px, 100%);
		margin: 0 auto;
		padding: clamp(0.25rem, 2vw, 1rem) 0 2rem;
	}

	.dashboard-hero,
	.dashboard-section,
	.metric-card {
		border: 1px solid var(--border-color);
		background: rgba(15, 23, 42, 0.68);
		box-shadow: var(--shadow-card);
		backdrop-filter: blur(18px);
	}

	.dashboard-hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.5rem;
		padding: clamp(1.4rem, 4vw, 2.4rem);
		border-radius: var(--radius-xl);
	}

	.eyebrow {
		margin-bottom: 0.45rem;
		color: var(--brand-yellow);
		font-size: 0.76rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.16em;
	}

	.dashboard-hero h1,
	.dashboard-section h2 {
		font-family: var(--font-display);
		letter-spacing: 0.04em;
		line-height: 0.95;
	}

	.dashboard-hero h1 {
		max-width: 760px;
		font-size: clamp(3rem, 8vw, 6rem);
	}

	.hero-copy {
		max-width: 680px;
		margin-top: 0.9rem;
		color: var(--text-secondary);
		font-size: clamp(1rem, 2vw, 1.15rem);
	}

	.hero-actions,
	.session-meta,
	.coach-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}

	.quick-action,
	.live-btn,
	.inline-link,
	.coach-links a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 0.75rem 1rem;
		font-weight: 900;
		text-decoration: none;
	}

	.quick-action,
	.coach-links a {
		border: 1px solid var(--border-color);
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-secondary);
	}

	.quick-action.primary,
	.live-btn,
	.inline-link {
		border: 1px solid rgba(250, 204, 21, 0.3);
		background: linear-gradient(135deg, var(--brand-yellow), var(--brand-green));
		color: #07111f;
	}

	.metric-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		margin: 1rem 0;
	}

	.metric-card {
		display: grid;
		gap: 0.35rem;
		padding: 1.25rem;
		border-radius: var(--radius-lg);
	}

	.metric-card strong {
		font-size: clamp(2rem, 5vw, 3.5rem);
		line-height: 1;
	}

	.metric-card span:last-child {
		color: var(--text-muted);
	}

	.metric-card.accent {
		background: linear-gradient(145deg, rgba(250, 204, 21, 0.16), rgba(34, 197, 94, 0.1));
	}

	.metric-label {
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.dashboard-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
		gap: 1rem;
	}

	.main-col,
	.sidebar-col {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.dashboard-section {
		border-radius: var(--radius-xl);
		padding: clamp(1.2rem, 3vw, 1.6rem);
	}

	.section-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.dashboard-section h2 {
		font-size: clamp(2rem, 5vw, 3rem);
	}

	.today-badge,
	.session-meta span {
		border: 1px solid var(--border-color);
		border-radius: 999px;
		padding: 0.4rem 0.65rem;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-weight: 800;
	}

	.today-badge {
		color: #07111f;
		background: var(--brand-yellow);
	}

	.session-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.25rem;
		padding: clamp(1rem, 3vw, 1.4rem);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.07);
	}

	.session-card.today {
		border-color: rgba(250, 204, 21, 0.45);
		box-shadow:
			0 0 0 1px rgba(250, 204, 21, 0.12),
			var(--shadow-card);
	}

	.session-info {
		display: grid;
		gap: 0.7rem;
	}

	.session-date {
		color: var(--brand-yellow);
		font-weight: 900;
	}

	.session-title {
		font-size: clamp(1.5rem, 4vw, 2.4rem);
		line-height: 1.05;
	}

	.session-action {
		min-width: min(260px, 100%);
	}

	.pb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.85rem;
	}

	.pb-card {
		display: grid;
		gap: 0.45rem;
		min-height: 150px;
		padding: 1rem;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-lg);
		background: rgba(255, 255, 255, 0.07);
		text-decoration: none;
		transition:
			transform var(--transition),
			border-color var(--transition),
			background var(--transition);
	}

	.pb-card:hover {
		transform: translateY(-3px);
		border-color: rgba(250, 204, 21, 0.35);
		background: rgba(255, 255, 255, 0.1);
	}

	.pb-workout-title,
	.pb-date {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.pb-score {
		align-self: end;
		color: var(--text-primary);
		font-size: 2.2rem;
		font-weight: 900;
	}

	.empty-state.rich {
		display: grid;
		gap: 0.7rem;
		padding: 1.25rem;
		border: 1px dashed var(--border-color);
		border-radius: var(--radius-lg);
		color: var(--text-muted);
		background: rgba(255, 255, 255, 0.045);
	}

	.empty-state strong {
		color: var(--text-primary);
	}

	.inline-link {
		width: fit-content;
		margin-top: 0.25rem;
	}

	.checklist {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0;
		list-style: none;
	}

	.checklist li {
		display: flex;
		gap: 0.65rem;
		align-items: flex-start;
		color: var(--text-secondary);
	}

	.checklist span {
		display: grid;
		width: 1.45rem;
		height: 1.45rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 900;
	}

	.checklist li.done span {
		background: var(--success);
		color: #052e16;
	}

	.tip-panel p:last-child {
		color: var(--text-secondary);
	}

	.loading-panel {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1rem;
	}

	.mini-loader {
		width: 1rem;
		height: 1rem;
		border-radius: 999px;
		background: var(--brand-yellow);
		box-shadow: 0 0 24px rgba(250, 204, 21, 0.65);
		animation: pulse 1s infinite;
	}

	.error-state {
		margin-top: 1rem;
		padding: 1rem;
		border: 1px solid rgba(251, 113, 133, 0.3);
		border-radius: var(--radius-lg);
		color: var(--error);
		background: rgba(251, 113, 133, 0.08);
		text-align: center;
	}

	@media (max-width: 900px) {
		.dashboard-hero,
		.session-card {
			align-items: stretch;
			flex-direction: column;
		}

		.hero-actions,
		.session-action,
		.session-action .primary-btn,
		.session-action .secondary-btn,
		.session-action .live-btn {
			width: 100%;
		}

		.metric-strip,
		.dashboard-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
