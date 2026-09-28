import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverIndependentState, remainingSeconds } from '../src/lib/independentWorkout.js';

test('independent timer recovers from an authoritative end timestamp', () => {
	assert.equal(remainingSeconds({ running: true, endsAt: 16_500 }, 10_000), 7);
	assert.equal(
		recoverIndependentState({ version: 1, running: true, endsAt: 12_000 }, 10_000).remaining,
		2
	);
});

test('completed independent workouts are not recovered', () => {
	assert.equal(recoverIndependentState({ version: 1, complete: true }), null);
});
