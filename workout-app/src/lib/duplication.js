const OMIT_WORKOUT = new Set(['id', 'createdAt', 'updatedAt', 'scores', 'attendance', 'liveState']);
const OMIT_SESSION = new Set([
	'id',
	'sessionDate',
	'createdAt',
	'updatedAt',
	'rsvps',
	'attendance',
	'scores',
	'liveState',
	'stationAssignments'
]);

/** @param {Record<string, unknown>} source @param {Set<string>} omitted */
function copyWithout(source, omitted) {
	return Object.fromEntries(Object.entries(source ?? {}).filter(([key]) => !omitted.has(key)));
}

/** @param {Record<string, any>} workout @param {string} creatorId */
export function duplicateWorkoutData(workout, creatorId) {
	return {
		...structuredClone(copyWithout(workout, OMIT_WORKOUT)),
		title: `${String(workout?.title || 'Workout').trim()} – Copy`,
		creatorId
	};
}

/** @param {Record<string, any>} session @param {Date} sessionDate @param {string} creatorId */
export function repeatSessionData(session, sessionDate, creatorId) {
	return {
		...structuredClone(copyWithout(session, OMIT_SESSION)),
		creatorId,
		sessionDate,
		rsvps: [],
		attendance: []
	};
}
