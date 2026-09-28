import test from 'node:test';
import assert from 'node:assert/strict';
import {
	buildRecoveredTimerState,
	isRecoverableLiveState,
	recoveredPhaseClock
} from '../src/lib/liveRecovery.js';

const now = 1_000_000;

test('detects and reconstructs a running session from authoritative time', () => {
	const live = {
		phase: 'WORK',
		phaseIndex: 2,
		phaseType: 'work',
		phaseStartedAt: now - 15_000,
		phaseDuration: 60,
		duration: 60,
		currentStation: 4,
		currentRound: 2,
		isRunning: true,
		updatedAt: now - 1_000
	};
	assert.equal(isRecoverableLiveState(live, now), true);
	assert.deepEqual(buildRecoveredTimerState(live, now), {
		phase: 'WORK',
		phaseIndex: 2,
		phaseType: 'work',
		remaining: 45,
		duration: 60,
		currentStation: 4,
		currentRound: 2,
		isRunning: true,
		isComplete: false,
		lastCue: 0
	});
	assert.deepEqual(recoveredPhaseClock(live), { startedAtMs: now - 15_000, duration: 60 });
});

test('reconstructs paused sessions without consuming paused time', () => {
	const live = {
		phase: 'MOVE',
		phaseIndex: 3,
		remainingWhenPaused: 8,
		isRunning: false,
		updatedAt: now
	};
	assert.equal(isRecoverableLiveState(live, now), true);
	assert.equal(buildRecoveredTimerState(live, now).remaining, 8);
});

test('does not recover completed, reset, or stale sessions', () => {
	assert.equal(
		isRecoverableLiveState({ phaseIndex: 1, isComplete: true, updatedAt: now }, now),
		false
	);
	assert.equal(
		isRecoverableLiveState({ phaseIndex: -1, isRunning: false, updatedAt: now }, now),
		false
	);
	assert.equal(
		isRecoverableLiveState(
			{ phaseIndex: 1, isRunning: true, updatedAt: now - 13 * 60 * 60 * 1000 },
			now
		),
		false
	);
});
