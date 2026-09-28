const VERSION = 1;
/** @param {string} userId @param {string} workoutId */
export const independentStorageKey = (userId, workoutId) =>
	`circuits:independent:${userId}:${workoutId}`;

/** @param {Record<string, any>} state @param {number} now */
export function remainingSeconds(state, now = Date.now()) {
	if (!state?.running || !state.endsAt) return Math.max(0, Number(state?.remaining) || 0);
	return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

/** @param {Record<string, any> | null} raw @param {number} now */
export function recoverIndependentState(raw, now = Date.now()) {
	if (!raw || raw.version !== VERSION || raw.complete) return null;
	return { ...raw, remaining: remainingSeconds(raw, now) };
}

/** @param {Record<string, any>} state */
export function persistedIndependentState(state) {
	return { ...state, version: VERSION, savedAt: Date.now() };
}
