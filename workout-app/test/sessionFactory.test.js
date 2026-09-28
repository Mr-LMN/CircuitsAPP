import test from 'node:test';
import assert from 'node:assert/strict';
import { quickSessionData, studentSessionData } from '../src/lib/sessionFactory.js';
test('quick session is current, owned, and starts with clean participation state', () => {
	const now = new Date();
	const value = quickSessionData(
		{ id: 'w', title: 'Lunch', timing: { work: 45 }, rsvps: ['old'] },
		'coach',
		now
	);
	assert.equal(value.startsAt, now);
	assert.equal(value.sessionType, 'quick');
	assert.deepEqual(value.rsvps, []);
	assert.deepEqual(value.attendance, []);
	assert.equal('liveState' in value, false);
});
test('student session is explicitly student-led', () =>
	assert.equal(
		studentSessionData({ id: 'w', title: 'Mine' }, 'student').sessionType,
		'student-led'
	));
