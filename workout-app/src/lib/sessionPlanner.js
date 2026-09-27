/**
 * Suggest a practical circuit plan while keeping every value coach-editable.
 * @param {{ participantCount?: number, stationCount: number, availableMinutes: number, partnerMode?: boolean }} input
 */
export function suggestSessionPlan(input) {
	const stations = Math.max(1, Math.floor(Number(input.stationCount) || 1));
	const availableSeconds = Math.max(60, Math.floor(Number(input.availableMinutes) || 1) * 60);
	const move = 15;
	const targetBlock = input.partnerMode ? 135 : 75;
	const rounds = Math.max(1, Math.min(5, Math.floor(availableSeconds / (stations * targetBlock))));
	const blocksPerStation = input.partnerMode ? 2 : 1;
	const swap = input.partnerMode ? 15 : 0;
	const rawWork = (availableSeconds / rounds / stations - move - swap) / blocksPerStation;
	const work = Math.max(20, Math.min(180, Math.floor(rawWork / 5) * 5));

	return {
		work,
		swap,
		move,
		rounds,
		distribution: distributeParticipants(input.participantCount ?? 0, stations)
	};
}

/** @param {number} participantCount @param {number} stationCount */
export function distributeParticipants(participantCount, stationCount) {
	const participants = Math.max(0, Math.floor(Number(participantCount) || 0));
	const stations = Math.max(1, Math.floor(Number(stationCount) || 1));
	return Array.from(
		{ length: stations },
		(_, index) => Math.floor(participants / stations) + (index < participants % stations ? 1 : 0)
	);
}
