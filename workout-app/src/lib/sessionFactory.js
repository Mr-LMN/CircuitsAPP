/** @param {Record<string, any>} workout @param {string} creatorId @param {Date} now */
export function quickSessionData(workout, creatorId, now = new Date()) {
	return {
		creatorId,
		creatorRole: 'coach',
		sessionType: 'quick',
		startsAt: now,
		sessionDate: now,
		workoutId: workout.id,
		workoutTitle: workout.title,
		...(workout.timing ? { timing: structuredClone(workout.timing) } : {}),
		rsvps: [],
		attendance: []
	};
}

/** @param {Record<string, any>} workout @param {string} creatorId @param {Date} now */
export function studentSessionData(workout, creatorId, now = new Date()) {
	return {
		creatorId,
		creatorRole: 'student',
		sessionType: 'student-led',
		startsAt: now,
		sessionDate: now,
		workoutId: workout.id,
		workoutTitle: workout.title,
		timing: structuredClone(workout.timing ?? {}),
		participantCount: 1,
		rsvps: [],
		attendance: []
	};
}
