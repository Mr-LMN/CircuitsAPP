import { deriveRemaining, toMillis } from './liveTimer.js';

export const MAX_RECOVERABLE_AGE_MS = 12 * 60 * 60 * 1000;

/** @param {Record<string, any> | null | undefined} liveState @param {number} now */
export function isRecoverableLiveState(liveState, now = Date.now()) {
	if (!liveState || liveState.isComplete || liveState.sessionStatus === 'ready') return false;
	if (!Number.isFinite(Number(liveState.phaseIndex)) || Number(liveState.phaseIndex) < 0)
		return false;
	const updatedAt = toMillis(liveState.updatedAt) ?? toMillis(liveState.phaseStartedAt);
	if (updatedAt === null || now - updatedAt > MAX_RECOVERABLE_AGE_MS) return false;
	return liveState.isRunning || Number(liveState.remainingWhenPaused ?? liveState.remaining) > 0;
}

/** @param {Record<string, any>} liveState @param {number} now */
export function buildRecoveredTimerState(liveState, now = Date.now()) {
	const remaining = deriveRemaining(liveState, now);
	return {
		phase: liveState.phase || 'Paused',
		phaseIndex: Number(liveState.phaseIndex),
		phaseType: liveState.phaseType || 'work',
		remaining,
		duration: Math.max(
			remaining,
			Number(liveState.duration) || Number(liveState.phaseDuration) || 0
		),
		currentStation: Math.max(0, Number(liveState.currentStation) || 0),
		currentRound: Math.max(1, Number(liveState.currentRound) || 1),
		isRunning: Boolean(liveState.isRunning),
		isComplete: false,
		lastCue: 0
	};
}

/** @param {Record<string, any>} liveState */
export function recoveredPhaseClock(liveState) {
	if (liveState.isRunning) {
		return {
			startedAtMs: toMillis(liveState.phaseStartedAt),
			duration: Math.max(0, Number(liveState.phaseDuration) || 0)
		};
	}
	return {
		startedAtMs: null,
		duration: Math.max(0, Number(liveState.remainingWhenPaused ?? liveState.remaining) || 0)
	};
}
