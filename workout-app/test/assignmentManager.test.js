import test from 'node:test';
import assert from 'node:assert/strict';
import {
	auditAssignments,
	autoFixAssignments,
	moveParticipant,
	swapParticipants
} from '../src/lib/assignmentManager.js';

test('moves a participant exactly once without losing anyone', () => {
	assert.deepEqual(moveParticipant([['SAM', 'ALEX'], ['JAMIE']], 'Sam', 1), [
		['ALEX'],
		['JAMIE', 'SAM']
	]);
});

test('swaps two assigned participants', () => {
	assert.deepEqual(swapParticipants([['SAM'], ['JAMIE', 'LEE']], 'SAM', 'JAMIE'), [
		['JAMIE'],
		['LEE', 'SAM']
	]);
});

test('audits duplicate, missing and empty assignments', () => {
	assert.deepEqual(auditAssignments([['SAM'], ['SAM'], []], ['SAM', 'TAYLOR']), {
		duplicates: ['SAM'],
		unassigned: ['TAYLOR'],
		emptyStations: [2],
		counts: [1, 1, 0]
	});
});

test('auto-fix balances and serializes every unique participant', () => {
	const fixed = autoFixAssignments(['A', 'B', 'C', 'D', 'E', 'A'], 3);
	assert.deepEqual(fixed, [['A', 'D'], ['B', 'E'], ['C']]);
	const reloaded = auditAssignments(fixed, ['A', 'B', 'C', 'D', 'E']);
	assert.deepEqual(reloaded.duplicates, []);
	assert.deepEqual(reloaded.unassigned, []);
	assert.equal(
		reloaded.counts.reduce((sum, count) => sum + count, 0),
		5
	);
});
