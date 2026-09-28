import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateWorkoutData, repeatSessionData } from '../src/lib/duplication.js';

test('duplicates complete workout configuration without historical data', () => {
	const copy = duplicateWorkoutData(
		{
			id: 'old',
			title: 'Full Body',
			mode: 'Partner',
			exercises: [{ name: 'Row' }],
			timing: { work: 60 },
			scores: [1],
			attendance: [2],
			liveState: { phase: 'WORK' }
		},
		'coach'
	);
	assert.equal(copy.title, 'Full Body – Copy');
	assert.deepEqual(copy.exercises, [{ name: 'Row' }]);
	assert.equal(copy.creatorId, 'coach');
	assert.equal('scores' in copy, false);
	assert.equal('liveState' in copy, false);
});

test('repeated session keeps setup but starts with clean participation data', () => {
	const repeated = repeatSessionData(
		{
			id: 'old',
			workoutId: 'w1',
			timing: { work: 45 },
			capacity: 20,
			rsvps: [{ userId: 'a' }],
			attendance: ['a'],
			stationAssignments: { 0: { A: true } },
			liveState: {}
		},
		new Date('2026-10-01'),
		'coach'
	);
	assert.equal(repeated.workoutId, 'w1');
	assert.deepEqual(repeated.timing, { work: 45 });
	assert.equal(repeated.capacity, 20);
	assert.deepEqual(repeated.rsvps, []);
	assert.deepEqual(repeated.attendance, []);
	assert.equal('stationAssignments' in repeated, false);
});
