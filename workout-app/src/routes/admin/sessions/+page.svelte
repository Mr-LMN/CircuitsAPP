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
		updateDoc,
		onSnapshot,
		writeBatch,
		Timestamp
	} from 'firebase/firestore';
	import { loading, user } from '$lib/store';
	import { repeatSessionData } from '$lib/duplication';
	import { combineLocalDateAndTime, recurrenceDates, sessionStart } from '$lib/sessionDates';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let allWorkouts = [];
	let upcomingSessions = [];
	let pastSessions = [];
	let newSession = {
		date: '',
		time: '15:15',
		duration: '',
		workoutId: '',
		capacity: '',
		repeat: 'never',
		repeatEnd: ''
	};
	let isLoading = true;
	let isSubmitting = false;
	let searchTerm = '';
	let unsubscribeSessions = () => {};
	let currentUid = null;
	let repeatCandidate = null;
	let repeatDate = '';
	let formMessage = '';
	let deleteCandidate = null;
	let noteDrafts = {};

	function formatDate(date) {
		if (!date) return null;
		if (date.seconds) {
			return new Date(date.seconds * 1000);
		}
		const d = new Date(date);
		return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	}

	function startFor(session) {
		return sessionStart(session);
	}

	$: recurrencePreview = (() => {
		if (newSession.repeat === 'never' || !newSession.repeatEnd) return [];
		const first = combineLocalDateAndTime(newSession.date, newSession.time);
		const end = combineLocalDateAndTime(newSession.repeatEnd, '23:59');
		return recurrenceDates(first, Number(newSession.repeat), end);
	})();

	async function fetchAttendanceForSessions(sessionIds, creatorId) {
		const attendanceMap = new Map();

		if (!sessionIds.length) {
			return attendanceMap;
		}

		try {
			const chunks = [];
			for (let index = 0; index < sessionIds.length; index += 30) {
				chunks.push(sessionIds.slice(index, index + 30));
			}
			const attendanceSnapshots = await Promise.all(
				chunks.map((ids) =>
					getDocs(
						query(
							collection(db, 'attendance'),
							...(creatorId ? [where('creatorId', '==', creatorId)] : []),
							where('sessionId', 'in', ids)
						)
					)
				)
			);

			sessionIds.forEach((sessionId) => attendanceMap.set(sessionId, []));
			attendanceSnapshots.forEach((snapshot) => {
				snapshot.docs.forEach((docSnap) => {
					const record = { id: docSnap.id, ...docSnap.data() };
					if (record.sessionId && attendanceMap.has(record.sessionId)) {
						attendanceMap.get(record.sessionId).push(record);
					}
				});
			});
		} catch (error) {
			console.error('Failed to fetch attendance records for sessions', error);
		}

		return attendanceMap;
	}

	async function fetchModernRsvps(sessionIds) {
		const rsvpMap = new Map(sessionIds.map((id) => [id, []]));
		if (!sessionIds.length) return rsvpMap;
		try {
			const snapshots = await Promise.all(
				sessionIds.map((id) => getDocs(collection(db, 'sessions', id, 'rsvps')))
			);
			snapshots.forEach((snapshot, index) => {
				snapshot.docs.forEach((item) => rsvpMap.get(sessionIds[index]).push(item.data()));
			});
		} catch (error) {
			console.error('Failed to load RSVP records', error);
		}
		return rsvpMap;
	}

	async function fetchCatchUpCounts(sessionIds) {
		const counts = new Map(sessionIds.map((id) => [id, 0]));
		try {
			const snapshots = await Promise.all(
				sessionIds.map((id) =>
					getDocs(query(collection(db, 'scores'), where('sourceSessionId', '==', id)))
				)
			);
			snapshots.forEach((snapshot, index) =>
				counts.set(
					sessionIds[index],
					snapshot.docs.filter((item) => item.data().completionType === 'catch-up').length
				)
			);
		} catch (error) {
			console.error('Failed to load catch-up counts', error);
		}
		return counts;
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
					const [attendanceMap, modernRsvpMap, catchUpCounts] = await Promise.all([
						fetchAttendanceForSessions(sessionIds, uid),
						fetchModernRsvps(sessionIds),
						fetchCatchUpCounts(sessionIds)
					]);

					if (currentToken !== sessionUpdateToken) {
						return;
					}

					const enrichedSessions = baseSessions.map((session) => {
						const merged = new Map((session.rsvps ?? []).map((rsvp) => [rsvp.userId, rsvp]));
						(modernRsvpMap.get(session.id) ?? []).forEach((rsvp) => merged.set(rsvp.userId, rsvp));
						return {
							...session,
							rsvps: [...merged.values()],
							attendance: attendanceMap.get(session.id) ?? [],
							catchUpCount: catchUpCounts.get(session.id) ?? 0
						};
					});

					const startOfToday = new Date();
					startOfToday.setHours(0, 0, 0, 0);

					upcomingSessions = enrichedSessions
						.filter((session) => {
							const date = startFor(session);
							return date && date >= startOfToday;
						})
						.reverse();

					pastSessions = enrichedSessions.filter((session) => {
						const date = startFor(session);
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
		if (!newSession.date || !newSession.time || !newSession.workoutId || isSubmitting) {
			formMessage = 'Please select a date, start time and workout.';
			return;
		}

		const currentUser = get(user);
		if (!currentUser?.uid) {
			formMessage = 'You need to be signed in to create sessions.';
			return;
		}

		const selectedWorkout = allWorkouts.find((w) => w.id === newSession.workoutId);
		if (!selectedWorkout) {
			formMessage = 'Please choose a valid workout.';
			return;
		}

		isSubmitting = true;
		try {
			const startsAt = combineLocalDateAndTime(newSession.date, newSession.time);
			const dates = newSession.repeat === 'never' ? [startsAt] : recurrencePreview;
			if (!startsAt || dates.length === 0) throw new Error('INVALID_DATES');
			const recurrenceId = dates.length > 1 ? crypto.randomUUID() : null;
			const sessionData = {
				creatorId: currentUser.uid,
				creatorRole: 'coach',
				sessionType: 'staff-class',
				workoutId: selectedWorkout.id,
				workoutTitle: selectedWorkout.title,
				...(Number(newSession.capacity) > 0
					? { capacity: Math.floor(Number(newSession.capacity)) }
					: {}),
				...(Number(newSession.duration) > 0
					? { durationMinutes: Math.floor(Number(newSession.duration)) }
					: {}),
				...(recurrenceId ? { recurrenceId } : {}),
				rsvps: [],
				attendance: []
			};
			const batch = writeBatch(db);
			for (const date of dates) {
				const ref = doc(collection(db, 'sessions'));
				batch.set(ref, {
					...sessionData,
					startsAt: Timestamp.fromDate(date),
					sessionDate: Timestamp.fromDate(date),
					createdAt: serverTimestamp()
				});
			}
			await batch.commit();
			newSession = {
				date: '',
				time: '15:15',
				duration: '',
				workoutId: '',
				capacity: '',
				repeat: 'never',
				repeatEnd: ''
			};
			formMessage = dates.length === 1 ? 'Session created.' : `${dates.length} sessions created.`;
		} catch (error) {
			console.error('Error creating session:', error);
			formMessage = 'Failed to create session.';
		} finally {
			isSubmitting = false;
		}
	}

	async function createRepeatedSession() {
		const currentUser = get(user);
		if (!repeatCandidate || !repeatDate || !currentUser?.uid || isSubmitting) return;
		isSubmitting = true;
		try {
			await addDoc(collection(db, 'sessions'), {
				...repeatSessionData(repeatCandidate, formatDate(repeatDate), currentUser.uid),
				createdAt: serverTimestamp()
			});
			formMessage = `${repeatCandidate.workoutTitle} scheduled as a clean new session.`;
			repeatCandidate = null;
			repeatDate = '';
		} catch (error) {
			console.error('Failed to repeat session', error);
			formMessage = 'Failed to repeat this session.';
		} finally {
			isSubmitting = false;
		}
	}

	async function deleteSession(sessionId) {
		try {
			await deleteDoc(doc(db, 'sessions', sessionId));
			deleteCandidate = null;
			formMessage = 'Session deleted.';
		} catch (error) {
			console.error('Error deleting session:', error);
			formMessage = 'Failed to delete session.';
		}
	}

	async function saveNotes(session) {
		await updateDoc(doc(db, 'sessions', session.id), {
			sessionNotes: String(noteDrafts[session.id] ?? session.sessionNotes ?? '').trim(),
			updatedAt: serverTimestamp()
		});
		formMessage = 'Session notes saved.';
	}

	function exportCsv() {
		const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
		const rows = [
			[
				'Date',
				'Time',
				'Workout',
				'Session type',
				'Booked',
				'Attended',
				'Catch-up completions',
				'Average RPE',
				'Session notes'
			],
			...pastSessions.map((session) => {
				const start = startFor(session);
				const rpes = (session.attendance ?? [])
					.map((record) => Number(record.rpe))
					.filter(Number.isFinite);
				return [
					start?.toLocaleDateString('en-GB') ?? '',
					start?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) ?? '',
					session.workoutTitle,
					session.sessionType || 'legacy',
					session.rsvps?.length ?? 0,
					session.attendance?.length ?? 0,
					session.catchUpCount ?? '',
					rpes.length
						? (rpes.reduce((total, value) => total + value, 0) / rpes.length).toFixed(1)
						: '',
					session.sessionNotes || ''
				];
			})
		];
		const url = URL.createObjectURL(
			new Blob([rows.map((row) => row.map(quote).join(',')).join('\r\n')], {
				type: 'text/csv;charset=utf-8'
			})
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'circuits-session-history.csv';
		link.click();
		URL.revokeObjectURL(url);
	}

	$: filteredPastSessions = pastSessions.filter((s) =>
		s.workoutTitle.toLowerCase().includes(searchTerm.toLowerCase())
	);
</script>

<div class="page-container">
	<header class="page-header">
		<div>
			<p class="eyebrow">Coach planner</p>
			<h1>Manage Sessions</h1>
			<p>Create class events, launch the live timer and review results from one clean workspace.</p>
		</div>
		<div class="session-stats" aria-label="Session overview">
			<span><strong>{upcomingSessions.length}</strong> upcoming</span>
			<span><strong>{pastSessions.length}</strong> completed</span>
		</div>
	</header>

	<section class="card create-session-card">
		<div class="create-card-heading">
			<div>
				<p class="eyebrow">Quick schedule</p>
				<h2>Create New Session</h2>
			</div>
			<p>Pick the class date and attach the workout your clients should see.</p>
		</div>
		<form on:submit|preventDefault={createSession} class="create-form">
			<div class="form-group">
				<label for="sessionDate">Session Date</label>
				<input id="sessionDate" type="date" bind:value={newSession.date} required />
			</div>
			<div class="form-group">
				<label for="sessionTime">Start time</label>
				<input id="sessionTime" type="time" bind:value={newSession.time} required />
			</div>
			<div class="form-group">
				<label for="duration">Expected duration <span>(minutes, optional)</span></label>
				<input
					id="duration"
					type="number"
					min="1"
					inputmode="numeric"
					bind:value={newSession.duration}
					placeholder="e.g. 45"
				/>
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
			<div class="form-group">
				<label for="repeat">Repeat</label>
				<select id="repeat" bind:value={newSession.repeat}>
					<option value="never">Never</option><option value="1">Weekly</option><option value="2"
						>Every 2 weeks</option
					>
				</select>
			</div>
			{#if newSession.repeat !== 'never'}
				<div class="form-group">
					<label for="repeatEnd">Repeat until</label>
					<input
						id="repeatEnd"
						type="date"
						min={newSession.date}
						bind:value={newSession.repeatEnd}
						required
					/>
					{#if recurrencePreview.length}<small
							>This will create {recurrencePreview.length}
							{recurrencePreview[0].toLocaleDateString('en-GB', { weekday: 'long' })} sessions.</small
						>{/if}
				</div>
			{/if}
			<div class="form-group">
				<label for="capacity">Capacity <span>(optional)</span></label>
				<input
					id="capacity"
					type="number"
					min="1"
					inputmode="numeric"
					bind:value={newSession.capacity}
					placeholder="Unlimited"
				/>
			</div>
			<button type="submit" class="primary-btn" disabled={isSubmitting}>
				{isSubmitting ? 'Creating...' : 'Create Session'}
			</button>
		</form>
		{#if formMessage}<p class="form-message" role="status">{formMessage}</p>{/if}
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
					{@const displayDate = startFor(session)}
					<div class="session-card">
						<div class="session-header">
							<div class="session-date">
								{#if displayDate}
									<span>{displayDate.toLocaleString('en-GB', { weekday: 'long' })}</span>
									<span>{displayDate.toLocaleDateString('en-GB')}</span>
									<strong
										>{displayDate.toLocaleTimeString('en-GB', {
											hour: '2-digit',
											minute: '2-digit'
										})}</strong
									>
								{/if}
							</div>
							<button
								class="delete-btn"
								aria-label={`Delete ${session.workoutTitle}`}
								on:click={() => (deleteCandidate = session)}>&times;</button
							>
						</div>
						<div class="session-details">
							<h3>{session.workoutTitle}</h3>
							<p>
								{session.rsvps?.length ?? 0}{session.capacity ? ` / ${session.capacity}` : ''} places
							</p>
							{#if session.durationMinutes}<p>{session.durationMinutes} min expected</p>{/if}
						</div>
						<div class="card-actions">
							<a href={`/timer/${session.workoutId}?session_id=${session.id}`} class="start-btn">
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
			<button type="button" class="secondary-btn" on:click={exportCsv}>Export CSV</button>
			<input type="search" bind:value={searchTerm} placeholder="Search past workouts..." />
		</div>
		{#if isLoading}
			<p>Loading...</p>
		{:else if pastSessions.length === 0}
			<p class="empty-state">No past sessions found.</p>
		{:else}
			<div class="sessions-grid">
				{#each filteredPastSessions as session}
					{@const displayDate = startFor(session)}
					<div class="session-card past">
						<div class="session-header">
							<div class="session-date">
								{#if displayDate}
									<span>{displayDate.toLocaleDateString('en-GB')}</span>
								{/if}
							</div>
							<button
								class="delete-btn"
								aria-label={`Delete ${session.workoutTitle}`}
								on:click={() => (deleteCandidate = session)}>&times;</button
							>
						</div>
						<div class="session-details">
							<h3>{session.workoutTitle}</h3>
							<p class:empty={!session.attendance?.length}>
								{session.attendance?.length ?? 0} Attended
							</p>
							<p>
								{session.rsvps?.length ?? 0} booked · {session.catchUpCount ?? 0} caught up later
							</p>
							<label
								>Session notes<textarea
									rows="2"
									value={noteDrafts[session.id] ?? session.sessionNotes ?? ''}
									on:input={(event) =>
										(noteDrafts = { ...noteDrafts, [session.id]: event.currentTarget.value })}
									placeholder="What should you remember next time?"
								></textarea></label
							>
						</div>
						<div class="card-actions">
							<a href={`/admin/results/${session.id}`} class="secondary-btn">View Results</a>
							<button
								type="button"
								class="secondary-btn"
								on:click={() => {
									repeatCandidate = session;
									repeatDate = '';
								}}>Repeat session</button
							>
							<button type="button" class="secondary-btn" on:click={() => saveNotes(session)}
								>Save notes</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
{#if repeatCandidate}
	<div class="repeat-overlay" role="presentation">
		<div class="repeat-dialog" role="dialog" aria-modal="true" aria-labelledby="repeat-title">
			<form on:submit|preventDefault={createRepeatedSession}>
				<h2 id="repeat-title">Repeat {repeatCandidate.workoutTitle}</h2>
				<p>
					Timing and capacity will be copied. Bookings, attendance, scores, live state and
					assignments will start clean.
				</p>
				<label for="repeat-date"
					>New session date<input
						id="repeat-date"
						type="date"
						bind:value={repeatDate}
						required
					/></label
				>
				<div class="repeat-actions">
					<button type="button" class="secondary-btn" on:click={() => (repeatCandidate = null)}
						>Cancel</button
					><button type="submit" class="primary-btn" disabled={isSubmitting}
						>{isSubmitting ? 'Scheduling…' : 'Schedule repeat'}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}
{#if deleteCandidate}<ConfirmDialog
		title="Delete session?"
		message={`Delete ${deleteCandidate.workoutTitle}? This does not automatically remove historical score documents.`}
		confirmLabel="Delete session"
		destructive
		onCancel={() => (deleteCandidate = null)}
		onConfirm={() => deleteSession(deleteCandidate.id)}
	/>{/if}

<style>
	.page-container {
		width: min(1400px, 100%);
		margin: 0 auto;
		padding: clamp(0.5rem, 2vw, 1rem) 0 2rem;
	}
	.form-message {
		margin-top: 0.75rem;
		color: var(--text-secondary);
		font-weight: 800;
	}
	.repeat-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(2, 6, 23, 0.82);
		backdrop-filter: blur(8px);
	}
	.repeat-dialog {
		width: min(520px, 100%);
		padding: 1.5rem;
		border: 1px solid var(--border-color);
		border-radius: 24px;
		background: var(--bg-panel);
		box-shadow: var(--shadow-card);
	}
	.repeat-dialog p {
		color: var(--text-secondary);
	}
	.repeat-dialog label {
		display: grid;
		gap: 0.45rem;
		margin-top: 0.8rem;
		color: var(--text-muted);
		font-weight: 800;
	}
	.repeat-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.8rem;
	}

	.page-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: end;
		margin-bottom: 1rem;
		padding: clamp(1.4rem, 4vw, 2.3rem);
		border: 1px solid rgba(226, 232, 240, 0.14);
		border-radius: var(--radius-xl);
		background: linear-gradient(145deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.6));
		box-shadow: var(--shadow-card);
	}

	.eyebrow {
		color: var(--brand-yellow);
		font-size: 0.76rem;
		font-weight: 900;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: clamp(3rem, 7vw, 5.5rem);
		line-height: 0.9;
	}

	.page-header p:last-child,
	.create-card-heading p {
		color: var(--text-secondary);
	}

	.session-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(120px, 1fr));
		gap: 0.75rem;
	}

	.session-stats span {
		display: grid;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border-color);
		border-radius: 18px;
		background: rgba(2, 6, 23, 0.36);
		color: var(--text-muted);
	}

	.session-stats strong {
		color: var(--text-primary);
		font-size: 1.8rem;
		line-height: 1;
	}

	.card {
		background: linear-gradient(145deg, rgba(15, 23, 42, 0.82), rgba(30, 41, 59, 0.58));
		border: 1px solid rgba(226, 232, 240, 0.14);
		border-radius: var(--radius-xl);
		padding: clamp(1.2rem, 3vw, 2rem);
		box-shadow: var(--shadow-card);
	}

	.create-card-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.2rem;
	}

	.create-card-heading h2,
	.sessions-list h2 {
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 3rem);
		line-height: 0.95;
	}

	.create-form {
		display: grid;
		grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.2fr) auto;
		gap: 1rem;
		align-items: flex-end;
	}

	.primary-btn {
		border: none;
		background: linear-gradient(135deg, var(--brand-green), #86efac);
		color: #052e16;
		padding: 0.88rem 2rem;
		border-radius: 16px;
		font-weight: 900;
		cursor: pointer;
		height: fit-content;
		box-shadow: 0 18px 36px -22px rgba(34, 197, 94, 0.9);
	}

	.sessions-list {
		margin-top: 2rem;
	}

	.sessions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.session-card {
		position: relative;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.72);
		border: 1px solid rgba(226, 232, 240, 0.14);
		border-radius: 22px;
		padding: 1.3rem;
		display: flex;
		flex-direction: column;
		box-shadow: 0 18px 50px rgba(0, 0, 0, 0.2);
	}

	.session-card::before {
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		background: linear-gradient(var(--brand-yellow), var(--brand-green));
		content: '';
	}

	.session-card.past {
		background: rgba(15, 23, 42, 0.54);
		opacity: 0.86;
	}

	.session-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.session-date {
		display: grid;
		gap: 0.15rem;
		font-family: var(--font-display);
		font-size: 1.5rem;
		line-height: 1;
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
		background: linear-gradient(135deg, var(--brand-yellow), var(--brand-green));
		color: #07111f;
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
		padding: 0.7rem 1rem;
		border-radius: 999px;
		border: 1px solid var(--border-color);
		background: rgba(2, 6, 23, 0.58);
		color: var(--text-primary);
	}

	@media (max-width: 860px) {
		.page-header,
		.create-form {
			grid-template-columns: 1fr;
		}

		.create-card-heading {
			flex-direction: column;
		}
	}
</style>
