import test from 'node:test';
import assert from 'node:assert/strict';
import { combineLocalDateAndTime, recurrenceDates, sessionStart } from '../src/lib/sessionDates.js';

test('combines a local date and start time', () => {
	const result = combineLocalDateAndTime('2026-09-30', '15:15');
	assert.equal(result.getFullYear(), 2026);
	assert.equal(result.getMonth(), 8);
	assert.equal(result.getDate(), 30);
	assert.equal(result.getHours(), 15);
	assert.equal(result.getMinutes(), 15);
});

test('prefers authoritative startsAt while supporting legacy sessionDate', () => {
	assert.equal(sessionStart({ startsAt: new Date('2026-09-30T15:15:00Z'), sessionDate: new Date(0) }).getTime(), Date.parse('2026-09-30T15:15:00Z'));
	assert.equal(sessionStart({ sessionDate: { seconds: 10 } }).getTime(), 10_000);
});

test('builds inclusive weekly recurrence dates', () => {
	const dates = recurrenceDates(new Date(2026, 8, 30, 15, 15), 1, new Date(2026, 9, 21, 23, 59));
	assert.equal(dates.length, 4);
	assert.ok(dates.every((date) => date.getDay() === 3 && date.getHours() === 15));
});
