<script>
        // @ts-nocheck
        export let data;
        const { score, session, workout } = data;

        const metricLabels = {
                reps: 'Reps',
                weight: 'Weight',
                cals: 'Calories',
                dist: 'Distance',
                notes: 'Notes'
        };

        function toDate(value) {
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

        function formatDate(value, options) {
                const date = toDate(value);
                if (!date) return '—';
                return date.toLocaleString('en-GB', options);
        }

        function formatMetricValue(metric, value) {
                if (value === undefined || value === null || value === '') {
                        return '—';
                }

                if (metric === 'weight') {
                        const numeric = Number(value);
                        return Number.isFinite(numeric) ? `${numeric} kg` : `${value}`;
                }

                if (metric === 'dist') {
                        return `${value}`;
                }

                return `${value}`;
        }

        function derivePrimaryResult(result) {
                if (typeof result.timeScore === 'string' && result.timeScore.trim()) {
                        return { label: 'Time', value: result.timeScore.trim() };
                }

                if (Number.isFinite(result.totalTimeMinutes) && result.totalTimeMinutes > 0) {
                        const totalMinutes = Number(result.totalTimeMinutes);
                        const rounded = totalMinutes % 1 === 0 ? totalMinutes : totalMinutes.toFixed(2);
                        return { label: 'Total Time', value: `${rounded} min` };
                }

                if (result.score) {
                        return { label: 'Score', value: result.score };
                }

                return null;
        }

        const exerciseScores = Array.isArray(score.exerciseScores) ? score.exerciseScores : [];
        const sessionDate = score.sessionDate ?? session?.sessionDate ?? null;
        const recordedDate = score.date ?? score.createdAt ?? null;
        const personalBestSummary = derivePrimaryResult(score);
</script>

<div class="page-container">
        <header class="page-header">
                <h1>Personal Best Details</h1>
                <p>
                        {workout?.title ?? score.workoutTitle ?? 'Workout'}
                        <span class="muted"> · Logged by {score.displayName ?? 'Member'}</span>
                </p>
        </header>

        <section class="card overview-card">
                <div class="overview-grid">
                        <div class="overview-item">
                                <span class="label">Session Date</span>
                                <span class="value">{formatDate(sessionDate, { dateStyle: 'long' })}</span>
                        </div>
                        <div class="overview-item">
                                <span class="label">Recorded On</span>
                                <span class="value">{formatDate(recordedDate, { dateStyle: 'long', timeStyle: 'short' })}</span>
                        </div>
                        <div class="overview-item">
                                <span class="label">Workout Type</span>
                                <span class="value">{workout?.type ?? 'Benchmark'}</span>
                        </div>
                </div>
        </section>

        {#if personalBestSummary}
                <section class="card highlight-card">
                        <h2>{personalBestSummary.label}</h2>
                        <p class="highlight-value">{personalBestSummary.value}</p>
                </section>
        {/if}

        <section class="card">
                <div class="card-header">
                        <h2>Station Breakdown</h2>
                        <p class="card-subtitle">See the metrics that were captured for each station.</p>
                </div>

                {#if exerciseScores.length}
                        <ul class="station-list">
                                {#each exerciseScores as entry, index (entry.stationName ?? `${index}`)}
                                        <li class="station-item">
                                                <div class="station-heading">
                                                        <h3>{entry.stationName ?? `Station ${index + 1}`}</h3>
                                                        {#if entry.category}
                                                                <span class="category-chip">{entry.category}</span>
                                                        {/if}
                                                </div>
                                                <div class="metrics-grid">
                                                        {#each Object.entries(entry.score ?? {}) as [metric, value] (metric)}
                                                                <div class="metric-item">
                                                                        <span class="metric-label">{metricLabels[metric] ?? metric}</span>
                                                                        <span class="metric-value">{formatMetricValue(metric, value)}</span>
                                                                </div>
                                                        {/each}
                                                </div>
                                        </li>
                                {/each}
                        </ul>
                {:else}
                        <p class="empty-state">No detailed station metrics were captured for this personal best.</p>
                {/if}
        </section>

        <a class="back-link" href="/dashboard">&larr; Back to dashboard</a>
</div>

<style>
        .page-container {
                max-width: 960px;
                margin: 3rem auto;
                padding: 0 1.5rem 3rem;
                display: flex;
                flex-direction: column;
                gap: 2rem;
        }

        .page-header h1 {
                font-family: var(--font-display);
                font-size: 3rem;
                color: var(--brand-yellow);
                margin: 0;
        }

        .page-header p {
                margin: 0.5rem 0 0;
                color: var(--text-secondary);
                font-size: 1.1rem;
        }

        .page-header .muted {
                color: var(--text-muted);
        }

        .card {
                background: var(--surface-1);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 1.75rem;
                box-shadow: 0 18px 45px rgba(7, 16, 19, 0.35);
        }

        .overview-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 1.5rem;
        }

        .overview-item .label {
                display: block;
                font-size: 0.85rem;
                color: var(--text-muted);
                letter-spacing: 0.08em;
                text-transform: uppercase;
        }

        .overview-item .value {
                display: block;
                margin-top: 0.35rem;
                font-size: 1.25rem;
                font-weight: 600;
        }

        .highlight-card {
                text-align: center;
                background: linear-gradient(135deg, rgba(252, 211, 77, 0.12), rgba(59, 130, 246, 0.12));
        }

        .highlight-card h2 {
                margin: 0;
                font-size: 1.5rem;
        }

        .highlight-value {
                font-family: var(--font-display);
                font-size: 2.75rem;
                color: var(--brand-yellow);
                margin: 0.75rem 0 0;
        }

        .card-header {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                margin-bottom: 1.5rem;
        }

        .card-header h2 {
                font-size: 1.6rem;
                margin: 0;
        }

        .card-subtitle {
                margin: 0;
                color: var(--text-muted);
        }

        .station-list {
                list-style: none;
                padding: 0;
                margin: 0;
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
        }

        .station-item {
                background: var(--surface-2);
                border-radius: 14px;
                padding: 1.5rem;
                border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .station-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                margin-bottom: 1rem;
        }

        .station-heading h3 {
                margin: 0;
                font-size: 1.25rem;
        }

        .category-chip {
                background: rgba(252, 211, 77, 0.15);
                color: var(--brand-yellow);
                border-radius: 999px;
                padding: 0.35rem 0.75rem;
                font-size: 0.8rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
        }

        .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 1rem;
        }

        .metric-item {
                background: rgba(255, 255, 255, 0.04);
                border-radius: 12px;
                padding: 1rem;
                display: flex;
                flex-direction: column;
                gap: 0.4rem;
        }

        .metric-label {
                font-size: 0.85rem;
                color: var(--text-muted);
                letter-spacing: 0.05em;
                text-transform: uppercase;
        }

        .metric-value {
                font-size: 1.2rem;
                font-weight: 600;
        }

        .empty-state {
                margin: 1rem 0 0;
                color: var(--text-muted);
        }

        .back-link {
                align-self: flex-start;
                text-decoration: none;
                color: var(--brand-yellow);
                font-weight: 600;
                transition: color 0.2s ease;
        }

        .back-link:hover,
        .back-link:focus-visible {
                color: var(--text-primary);
        }

        @media (max-width: 720px) {
                .page-header h1 {
                        font-size: 2.4rem;
                }

                .metrics-grid {
                        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                }
        }
</style>
