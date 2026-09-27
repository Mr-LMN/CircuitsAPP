/**
 * Return an epoch millisecond value for Firestore timestamps, Dates or numbers.
 * @param {number | Date | { toMillis?: () => number, seconds?: number, nanoseconds?: number } | null | undefined} value
 */
export function toMillis(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (value instanceof Date) return value.getTime();
	if (!value || typeof value !== 'object') return null;
	if (typeof value.toMillis === 'function') return value.toMillis();
	if (Number.isFinite(value.seconds)) {
		return Number(value.seconds) * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
	}
	return null;
}

/**
 * Calculate a live countdown from an authoritative phase start rather than from
 * the number of local interval callbacks. Legacy `remaining` is retained as a
 * fallback so sessions created by older versions keep working.
 * @param {Record<string, any> | null | undefined} liveState
 * @param {number} now
 */
export function deriveRemaining(liveState, now = Date.now()) {
	if (!liveState) return 0;
	const fallback = Math.max(0, Number(liveState.remaining) || 0);
	if (!liveState.isRunning) {
		return Math.max(0, Number(liveState.remainingWhenPaused ?? fallback) || 0);
	}

	const startedAt = toMillis(liveState.phaseStartedAt);
	const duration = Number(liveState.phaseDuration);
	if (startedAt === null || !Number.isFinite(duration) || duration < 0) return fallback;

	return Math.max(0, duration - (now - startedAt) / 1000);
}

/** @param {Record<string, any> | null | undefined} liveState */
export function phaseDeadline(liveState) {
	const startedAt = toMillis(liveState?.phaseStartedAt);
	const duration = Number(liveState?.phaseDuration);
	return startedAt === null || !Number.isFinite(duration) ? null : startedAt + duration * 1000;
}

/** @param {number} remaining @param {number} deltaSeconds */
export function clampAdjustment(remaining, deltaSeconds) {
	return Math.max(1, Math.round((Math.max(0, Number(remaining) || 0) + deltaSeconds) * 10) / 10);
}
