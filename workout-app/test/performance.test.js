import test from 'node:test';
import assert from 'node:assert/strict';
import { selectExercisePerformance } from '../src/lib/performance.js';

test('selects the latest matching result and highest repetition PB', () => {
	const scores = [
		{ date: 100, exerciseScores: [{ stationName: 'Squat', score: { reps: 12 } }] },
		{ date: 200, exerciseScores: [{ stationName: 'Squat', score: { reps: 10 } }] }
	];
	const result = selectExercisePerformance(scores, 'Squat', 'Bodyweight');
	assert.equal(result.latest.score.reps, 10);
	assert.equal(result.best.score.reps, 12);
});

test('uses lower-is-better semantics for timed results', () => {
	const scores = [
		{ date: 100, exerciseScores: [{ stationName: 'Run', score: { time: '01:20' } }] },
		{ date: 200, exerciseScores: [{ stationName: 'Run', score: { time: '01:35' } }] }
	];
	const result = selectExercisePerformance(scores, 'Run', 'Cardio');
	assert.equal(result.best.score.time, '01:20');
});

test('does not confuse results from another exercise', () => {
	assert.equal(
		selectExercisePerformance(
			[{ exerciseScores: [{ stationName: 'Row', score: { cals: 20 } }] }],
			'Bike',
			'Cardio'
		),
		null
	);
});
