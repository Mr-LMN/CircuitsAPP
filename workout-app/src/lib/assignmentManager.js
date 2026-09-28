/** @param {unknown} value */
const clean = (value) =>
	String(value ?? '')
		.trim()
		.toUpperCase();

/** @param {string[][]} assignments @param {string} participant @param {number} targetIndex */
export function moveParticipant(assignments, participant, targetIndex) {
	const name = clean(participant);
	if (!name || targetIndex < 0 || targetIndex >= assignments.length)
		return assignments.map((row) => [...row]);
	const next = assignments.map((row) => row.map(clean).filter((item) => item && item !== name));
	next[targetIndex].push(name);
	return next;
}

/** @param {string[][]} assignments @param {string} first @param {string} second */
export function swapParticipants(assignments, first, second) {
	const a = clean(first);
	const b = clean(second);
	const firstStation = assignments.findIndex((row) => row.map(clean).includes(a));
	const secondStation = assignments.findIndex((row) => row.map(clean).includes(b));
	if (!a || !b || a === b || firstStation < 0 || secondStation < 0)
		return assignments.map((row) => [...row]);
	let next = moveParticipant(assignments, a, secondStation);
	next = moveParticipant(next, b, firstStation);
	return next;
}

/** @param {string[][]} assignments @param {string[]} participants */
export function auditAssignments(assignments, participants = []) {
	const counts = new Map();
	assignments
		.flat()
		.map(clean)
		.filter(Boolean)
		.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
	const roster = [...new Set(participants.map(clean).filter(Boolean))];
	return {
		duplicates: [...counts].filter(([, count]) => count > 1).map(([name]) => name),
		unassigned: roster.filter((name) => !counts.has(name)),
		emptyStations: assignments
			.map((row, index) => (row.length ? -1 : index))
			.filter((index) => index >= 0),
		counts: assignments.map((row) => row.length)
	};
}

/** @param {string[]} participants @param {number} stationCount */
export function autoFixAssignments(participants, stationCount) {
	/** @type {string[][]} */
	const stations = Array.from({ length: Math.max(1, stationCount) }, () => []);
	[...new Set(participants.map(clean).filter(Boolean))].forEach((name, index) =>
		stations[index % stations.length].push(name)
	);
	return stations;
}
