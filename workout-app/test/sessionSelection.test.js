import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRelevantSession } from '../src/lib/sessionSelection.js';

const sessions = [
	{ id: 'first', creatorId: 'other', organisationId: 'school-b' },
	{ id: 'booked', creatorId: 'other', organisationId: 'school-a' },
	{ id: 'coached', creatorId: 'coach', organisationId: 'school-a' },
	{ id: 'legacy', creatorId: 'other' }
];

test('new RSVP subcollection bookings outrank the first global session', () => {
	assert.equal(
		selectRelevantSession(sessions, { userId: 'member', bookedSessionIds: ['booked'] }).id,
		'booked'
	);
});

test('coach ownership outranks organisation fallback', () => {
	assert.equal(
		selectRelevantSession(sessions, {
			userId: 'coach',
			isAdmin: true,
			organisationId: 'school-a'
		}).id,
		'coached'
	);
});

test('participant sees their organisation and legacy remains a final fallback', () => {
	assert.equal(
		selectRelevantSession(sessions, { userId: 'member', organisationId: 'school-a' }).id,
		'booked'
	);
	assert.equal(selectRelevantSession(sessions, { userId: 'member' }).id, 'legacy');
});
