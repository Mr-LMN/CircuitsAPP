import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeParticipants, suggestSessionPlan } from '../src/lib/sessionPlanner.js';

test('balances odd participant counts without losing anyone', () => {
	const distribution = distributeParticipants(18, 8);
	assert.deepEqual(distribution, [3, 3, 2, 2, 2, 2, 2, 2]);
	assert.equal(
		distribution.reduce((sum, count) => sum + count, 0),
		18
	);
});

test('suggests a usable and overrideable plan for a 32 minute class', () => {
	assert.deepEqual(
		suggestSessionPlan({ participantCount: 18, stationCount: 8, availableMinutes: 32 }),
		{
			work: 65,
			swap: 0,
			move: 15,
			rounds: 3,
			distribution: [3, 3, 2, 2, 2, 2, 2, 2]
		}
	);
});

test('partner suggestions include a swap interval', () => {
	const plan = suggestSessionPlan({ stationCount: 6, availableMinutes: 30, partnerMode: true });
	assert.equal(plan.swap, 15);
	assert.ok(plan.work >= 20);
});
