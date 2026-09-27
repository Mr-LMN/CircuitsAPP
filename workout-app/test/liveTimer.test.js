import test from 'node:test';
import assert from 'node:assert/strict';
import { clampAdjustment, deriveRemaining, phaseDeadline, toMillis } from '../src/lib/liveTimer.js';

test('derives time from the authoritative phase start after a throttled interval', () => {
	const state = { isRunning: true, phaseStartedAt: 10_000, phaseDuration: 60, remaining: 60 };
	assert.equal(deriveRemaining(state, 35_000), 35);
});

test('uses paused remaining and keeps legacy live states compatible', () => {
	assert.equal(deriveRemaining({ isRunning: false, remainingWhenPaused: 12, remaining: 40 }), 12);
	assert.equal(deriveRemaining({ isRunning: true, remaining: 7 }, 50_000), 7);
});

test('supports Firestore timestamp shapes and safe coach adjustments', () => {
	assert.equal(toMillis({ seconds: 12, nanoseconds: 500_000_000 }), 12_500);
	assert.equal(phaseDeadline({ phaseStartedAt: 2_000, phaseDuration: 10 }), 12_000);
	assert.equal(clampAdjustment(4, -10), 1);
	assert.equal(clampAdjustment(4.25, 10), 14.3);
});
