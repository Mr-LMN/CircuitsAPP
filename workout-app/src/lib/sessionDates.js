/** @param {Date|string|number|{seconds?: number, toDate?: () => Date}|null|undefined} value Convert Firestore/legacy date values to a Date. */
export function toDate(value) {
	if (!value) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
	if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
	if (typeof value === 'object') return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** @param {{startsAt?: any, sessionDate?: any, date?: any}} session startsAt is authoritative; sessionDate remains a backwards-compatible fallback. */
export function sessionStart(session) {
	return toDate(session?.startsAt ?? session?.sessionDate ?? session?.date);
}

/** @param {string} date @param {string} time */
export function combineLocalDateAndTime(date, time = '') {
	if (!date) return null;
	const [year, month, day] = String(date).split('-').map(Number);
	const [hour = 0, minute = 0] = String(time || '00:00').split(':').map(Number);
	const result = new Date(year, month - 1, day, hour, minute, 0, 0);
	return Number.isNaN(result.getTime()) ? null : result;
}

/** @param {Date|string|number} firstStart @param {number} intervalWeeks @param {Date|string|number} endDate */
export function recurrenceDates(firstStart, intervalWeeks, endDate) {
	const first = toDate(firstStart);
	const end = toDate(endDate);
	if (!first || !end || intervalWeeks < 1 || first > end) return [];
	const dates = [];
	for (let cursor = new Date(first); cursor <= end; cursor.setDate(cursor.getDate() + intervalWeeks * 7)) {
		dates.push(new Date(cursor));
	}
	return dates;
}
