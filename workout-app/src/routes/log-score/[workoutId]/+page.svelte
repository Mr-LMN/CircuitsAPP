<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { get } from 'svelte/store';
	import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
	import { db } from '$lib/firebase';
	import { user, loading } from '$lib/store';

	/**
	 * @typedef {{
	 *      id: string;
	 *      title?: string;
	 *      exercises?: Array<{
	 *              name?: string;
	 *              p1_task?: string;
	 *              p2_task?: string;
	 *      }>;
	 * }} Workout
	 */

	/** @type {{ workout: Workout }} */
	export let data;
	/** @type {Workout} */
	const workout = data.workout;
	/** @type {Array<{ name?: string; p1_task?: string; p2_task?: string; }>} */
	const exercises = workout.exercises ?? [];

	let scoreInputs = exercises.map(() => '');
	let errorMessage = '';
	let successMessage = '';
	let isSaving = false;

	$: if (!$loading && !$user) {
		goto(resolve('/'));
	}

	async function saveScores() {
		errorMessage = '';
		successMessage = '';

		const currentUser = get(user);
		if (!currentUser) {
			errorMessage = 'You must be signed in to log your score.';
			return;
		}

		isSaving = true;
		try {
			const exerciseScores = exercises.map(
				/**
				 * @param {{ name?: string } | undefined} station
				 * @param {number} index
				 */
				(station, index) => ({
					stationName: station?.name ?? `Station ${index + 1}`,
					score: scoreInputs[index]?.trim() ?? ''
				})
			);

			await addDoc(collection(db, 'scores'), {
				userId: currentUser.uid,
				workoutId: workout.id,
				date: serverTimestamp(),
				exerciseScores
			});

			successMessage = 'Scores saved successfully!';
			await goto(resolve('/dashboard'));
		} catch (error) {
			console.error('Failed to save scores', error);
			errorMessage = 'Something went wrong while saving. Please try again.';
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Log Score • {workout.title}</title>
</svelte:head>

<section class="score-page">
	<div class="score-card">
		<header>
			<h1>Log Your Score</h1>
			<p>Workout: <strong>{workout.title}</strong></p>
			<p class="meta">Fill in your results for each station below.</p>
		</header>

		<form class="score-form" on:submit|preventDefault={saveScores}>
			<div class="station-list">
                                {#each exercises as station, index (station?.name ?? index)}
					<div class="station-row">
						<div class="station-details">
							<span class="station-index">{index + 1}</span>
							<div class="station-text">
								<h3>{station.name}</h3>
                                                                <p class="tasks">
                                                                        {#if station.p1_task}
                                                                                <span>Partner A: {station.p1_task}</span>
                                                                        {/if}
                                                                        {#if station.p1_task && station.p2_task}
                                                                                <span class="divider">•</span>
                                                                        {/if}
                                                                        {#if station.p2_task}
                                                                                <span>Partner B: {station.p2_task}</span>
                                                                        {/if}
                                                                </p>
							</div>
						</div>
						<input
							class="score-input"
							type="text"
							placeholder="e.g. 25 cals, 18 reps"
							bind:value={scoreInputs[index]}
						/>
					</div>
				{/each}
			</div>

			{#if errorMessage}
				<p class="error">{errorMessage}</p>
			{/if}
			{#if successMessage}
				<p class="success">{successMessage}</p>
			{/if}

			<button class="primary-btn" type="submit" disabled={isSaving}>
				{isSaving ? 'Saving…' : 'Save Score'}
			</button>
		</form>
	</div>
</section>

<style>
	.score-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--deep-space, #0f172a);
		padding: 2rem;
	}

	.score-card {
		width: 100%;
		max-width: 900px;
		background: rgba(15, 23, 42, 0.9);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 24px;
		padding: 2.5rem;
		color: var(--text-primary, #f8fafc);
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	header h1 {
		font-family: 'Bebas Neue', sans-serif;
		font-size: 3rem;
		letter-spacing: 4px;
		margin: 0 0 0.5rem;
	}

	header p {
		margin: 0.25rem 0;
		color: var(--text-secondary, #cbd5e1);
	}

	.meta {
		color: var(--text-muted, #94a3b8);
	}

	.station-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.station-row {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-radius: 16px;
		background: rgba(30, 41, 59, 0.85);
		border: 1px solid rgba(71, 85, 105, 0.4);
	}

	.station-details {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1 1 auto;
	}

	.station-index {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: rgba(253, 224, 71, 0.15);
		color: var(--brand-yellow, #fde047);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.station-text h3 {
		margin: 0;
		font-size: 1.2rem;
	}

        .tasks {
                margin: 0.35rem 0 0;
                color: var(--text-muted, #94a3b8);
                font-size: 0.9rem;
        }
        .tasks span {
                display: inline-flex;
                gap: 0.25rem;
                align-items: center;
        }
        .tasks .divider {
                margin: 0 0.4rem;
        }

	.score-input {
		min-width: 220px;
		padding: 0.85rem 1rem;
		border-radius: 999px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: rgba(15, 23, 42, 0.7);
		color: inherit;
		font-size: 1rem;
	}

	.score-input:focus {
		outline: 2px solid var(--brand-yellow, #fde047);
		outline-offset: 2px;
	}

	.primary-btn {
		align-self: center;
		padding: 0.95rem 2.5rem;
		border-radius: 999px;
		border: none;
		background: var(--brand-green, #16a34a);
		color: #fff;
		font-weight: 700;
		font-size: 1.1rem;
		cursor: pointer;
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}

	.primary-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.primary-btn:not(:disabled):hover {
		transform: translateY(-1px);
		box-shadow: 0 12px 30px rgba(22, 163, 74, 0.4);
	}

	.error {
		color: #f87171;
		font-weight: 600;
		text-align: center;
	}

	.success {
		color: #34d399;
		font-weight: 600;
		text-align: center;
	}

	@media (max-width: 720px) {
		.station-row {
			flex-direction: column;
			align-items: flex-start;
		}

		.score-input {
			width: 100%;
			min-width: 0;
		}
	}
</style>
