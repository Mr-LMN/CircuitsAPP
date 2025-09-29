<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { db } from '$lib/firebase';
	import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
	import { user } from '$lib/store';

	let stats = {
		sessionsAttended: 0,
		personalBests: []
	};
	let isLoading = true;

	onMount(async () => {
		if (!$user?.uid) {
			isLoading = false;
			return;
		}

		// --- Step 1: Fetch attendance and scores at the same time ---
		const attendanceQuery = query(collection(db, 'attendance'), where('userId', '==', $user.uid));
		const scoresQuery = query(
			collection(db, 'scores'),
			where('userId', '==', $user.uid),
			orderBy('date', 'desc') // Get newest scores first
		);

		const [attendanceSnapshot, scoresSnapshot] = await Promise.all([
			getDocs(attendanceQuery),
			getDocs(scoresQuery)
		]);

		// --- Step 2: Calculate total attendance ---
		stats.sessionsAttended = attendanceSnapshot.size;

		// --- Step 3: Process scores to find Personal Bests ---
		const scores = scoresSnapshot.docs.map((doc) => doc.data());
		const personalBests = {};

		for (const score of scores) {
			// We only care about workouts flagged as benchmarks
			// NOTE: We need to fetch workout data to check isBenchmark flag.
			// For now, we'll assume all logged scores are for benchmarks.

			const existingBest = personalBests[score.workoutId];

			// This assumes higher scores are better (e.g., reps, cals).
			// We can add logic later for timed events where lower is better.
			if (!existingBest || Number(score.score) > Number(existingBest.score)) {
				personalBests[score.workoutId] = score;
			}
		}

		stats.personalBests = Object.values(personalBests);

		isLoading = false;
	});
</script>

<div class="page-container">
	<header class="dashboard-header">
		<h1>Your Dashboard</h1>
		<p>Welcome back, {$user?.email || 'member'}!</p>
	</header>

	{#if isLoading}
		<p>Loading your stats...</p>
	{:else}
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
					{#each stats.personalBests as pb, i (pb.workoutId ?? pb.workoutTitle ?? pb.date?.seconds ?? i)}
						<div class="pb-card">
							<span class="pb-workout-title">{pb.workoutTitle}</span>
							<span class="pb-score">{pb.score}</span>
							<span class="pb-date">
								{new Date(pb.date.seconds * 1000).toLocaleDateString()}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
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
		letter-spacing: 2px;
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
		line-height: 1;
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
	.pb-section h2 {
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
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.pb-workout-title {
		font-weight: 600;
		font-size: 1.1rem;
		color: var(--text-primary);
	}
	.pb-score {
		font-family: var(--font-display);
		font-size: 2.5rem;
		color: var(--brand-yellow);
		line-height: 1.2;
		margin: 0.5rem 0;
	}
	.pb-date {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.empty-state {
		color: var(--text-muted);
	}
</style>
