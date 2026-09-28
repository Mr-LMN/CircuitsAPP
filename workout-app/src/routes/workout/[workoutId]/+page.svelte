<script>
	// @ts-nocheck
	import { resolve } from '$app/paths';
	export let data;
	const { workout, sourceSessionId } = data;
	const timing = workout.timing ?? {};
	const exercises =
		workout.mode === 'Chipper' ? (workout.chipper?.steps ?? []) : (workout.exercises ?? []);
	$: equipment = [
		...new Set(
			exercises
				.flatMap((exercise) =>
					Array.isArray(exercise.equipment)
						? exercise.equipment
						: exercise.equipment
							? [exercise.equipment]
							: []
				)
				.filter(Boolean)
		)
	];
	$: estimatedSeconds = workout.durationMinutes
		? workout.durationMinutes * 60
		: Number(timing.rounds || 1) *
			exercises.length *
			(Number(timing.work || 60) + Number(timing.move || timing.rest || 0));
	$: runUrl = `/workout/${workout.id}/run${sourceSessionId ? `?source_session=${encodeURIComponent(sourceSessionId)}` : ''}`;
</script>

<svelte:head><title>{workout.title} · CircuitsAPP</title></svelte:head>
<main class="share-page">
	<header>
		<p class="eyebrow">Shared workout</p>
		<h1>{workout.title}</h1>
		<div class="badges">
			<span>{workout.type || 'Workout'}</span><span>{workout.mode || 'Circuit'}</span>
		</div>
	</header>
	<section class="summary" aria-label="Workout summary">
		<div><small>Rounds</small><strong>{timing.rounds || workout.rounds || 1}</strong></div>
		<div><small>Work</small><strong>{timing.work || 60}s</strong></div>
		<div><small>Rest / move</small><strong>{timing.rest ?? timing.move ?? 0}s</strong></div>
		<div>
			<small>Estimated</small><strong>{Math.max(1, Math.round(estimatedSeconds / 60))} min</strong>
		</div>
	</section>
	{#if workout.notes || workout.instructions}<section class="notes">
			<h2>Coach notes</h2>
			<p>{workout.notes || workout.instructions}</p>
		</section>{/if}
	<section>
		<h2>{workout.mode === 'Chipper' ? 'Movements' : 'Stations'}</h2>
		<ol class="stations">
			{#each exercises as exercise}<li>
					<strong>{exercise.name || exercise.exercise}</strong>{#if exercise.reps}<span
							>{exercise.reps} reps</span
						>{/if}{#if exercise.target}<span>{exercise.target}</span
						>{/if}{#if exercise.description}<p>
							{exercise.description}
						</p>{/if}{#if workout.mode === 'Partner'}<p>
							P1: {exercise.p1?.task || exercise.p1_task || 'Work'} · P2: {exercise.p2?.task ||
								exercise.p2_task ||
								'Work'}
						</p>{/if}
				</li>{/each}
		</ol>
	</section>
	{#if equipment.length}<section>
			<h2>Equipment</h2>
			<p>{equipment.join(' · ')}</p>
		</section>{/if}
	<a class="start" href={resolve(/** @type {any} */ (runUrl))}>START WORKOUT</a>
</main>

<style>
	.share-page {
		width: min(760px, 100%);
		margin: auto;
		padding: clamp(1rem, 4vw, 3rem);
		display: grid;
		gap: 1.5rem;
	}
	h1 {
		font-family: var(--font-display);
		font-size: clamp(2.6rem, 9vw, 5rem);
		color: var(--brand-yellow);
		margin: 0.2rem 0;
	}
	.eyebrow,
	small {
		color: var(--text-muted);
		text-transform: uppercase;
		font-weight: 800;
		letter-spacing: 0.1em;
	}
	.badges {
		display: flex;
		gap: 0.5rem;
	}
	.badges span {
		background: var(--surface-2);
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.6rem;
	}
	.summary div,
	.notes,
	.stations li {
		padding: 1rem;
		background: var(--surface-1);
		border: 1px solid var(--border-color);
		border-radius: 14px;
	}
	.summary strong,
	.summary small {
		display: block;
	}
	.stations {
		display: grid;
		gap: 0.65rem;
		padding: 0;
		list-style-position: inside;
	}
	.stations span {
		margin-left: 0.7rem;
		color: var(--text-muted);
	}
	.start {
		position: sticky;
		bottom: max(1rem, env(safe-area-inset-bottom));
		text-align: center;
		padding: 1rem;
		border-radius: 14px;
		background: var(--brand-yellow);
		color: #111827;
		font-weight: 900;
		text-decoration: none;
	}
	@media (max-width: 560px) {
		.summary {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
