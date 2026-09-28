/** @typedef {{ score?: Record<string, any>, stationName?: string, timeScore?: string }} ExerciseEntry */
/** @typedef {{ date?: any, exerciseScores?: ExerciseEntry[] }} ScoreRecord */
/** @param {any} value */
function timestamp(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value?.toMillis === 'function') return value.toMillis();
	if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
	const parsed = new Date(value ?? 0).getTime();
	return Number.isFinite(parsed) ? parsed : 0;
}

/** @param {unknown} value */
export function parseDuration(value) {
	if (typeof value === 'number') return value;
	const parts = String(value ?? '')
		.trim()
		.split(':')
		.map(Number);
	if (parts.some((part) => !Number.isFinite(part))) return null;
	return parts.length === 2 ? parts[0] * 60 + parts[1] : Number(value);
}

/** @param {ExerciseEntry | Record<string, any>} entry @param {string} scoringType */
function scoreValue(entry, scoringType) {
	const score = entry?.score ?? entry ?? {};
	if (scoringType === 'time') return parseDuration(score.time ?? score.timeScore ?? score.notes);
	if (scoringType === 'weight') return Number(score.weight) || null;
	if (scoringType === 'distance') return Number.parseFloat(score.dist) || null;
	if (scoringType === 'calories') return Number(score.cals) || null;
	return Number(score.reps) || null;
}

/** @param {unknown} category @param {ExerciseEntry} entry */
export function inferScoringType(category, entry = {}) {
	const normalised = String(category ?? '').toLowerCase();
	if (entry?.score?.time || entry?.timeScore) return 'time';
	if (normalised.includes('resist') && Number(entry?.score?.weight) > 0) return 'weight';
	if (normalised.includes('cardio') && entry?.score?.dist) return 'distance';
	if (normalised.includes('cardio')) return 'calories';
	return 'reps';
}

/** @param {ScoreRecord[]} scores @param {unknown} exerciseName @param {unknown} category */
export function selectExercisePerformance(scores, exerciseName, category) {
	const name = String(exerciseName ?? '')
		.trim()
		.toLowerCase();
	const matches = scores
		.flatMap((record) => (record.exerciseScores ?? []).map((entry) => ({ record, entry })))
		.filter(
			({ entry }) =>
				String(entry.stationName ?? '')
					.trim()
					.toLowerCase() === name
		)
		.sort((a, b) => timestamp(b.record.date) - timestamp(a.record.date));
	if (!matches.length) return null;
	const scoringType = inferScoringType(category, matches[0].entry);
	const valid = matches.filter(({ entry }) => scoreValue(entry, scoringType) !== null);
	const best = valid.reduce((winner, candidate) => {
		if (!winner) return candidate;
		const candidateValue = scoreValue(candidate.entry, scoringType);
		const winnerValue = scoreValue(winner.entry, scoringType);
		if (candidateValue === null || winnerValue === null) return winner;
		return scoringType === 'time'
			? candidateValue < winnerValue
				? candidate
				: winner
			: candidateValue > winnerValue
				? candidate
				: winner;
	}, /** @type {{record: ScoreRecord, entry: ExerciseEntry} | null} */ (null));
	return { latest: matches[0].entry, best: best?.entry ?? null, scoringType };
}

/** @param {ExerciseEntry | Record<string, any> | null} entry */
export function formatPerformance(entry) {
	const score = entry?.score ?? entry ?? {};
	if (score.time || score.timeScore) return String(score.time ?? score.timeScore);
	const parts = [];
	if (Number(score.reps) > 0) parts.push(`${score.reps} reps`);
	if (Number(score.weight) > 0) parts.push(`${score.weight}kg`);
	if (Number(score.cals) > 0) parts.push(`${score.cals} cal`);
	if (score.dist) parts.push(String(score.dist));
	return parts.join(' × ') || score.notes || '';
}
