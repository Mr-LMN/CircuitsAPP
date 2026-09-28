import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
	initializeTestEnvironment,
	assertFails,
	assertSucceeds
} from '@firebase/rules-unit-testing';
import {
	doc,
	getDoc,
	runTransaction,
	serverTimestamp,
	setDoc,
	updateDoc,
	deleteDoc
} from 'firebase/firestore';

const projectId = 'demo-circuits';
let env;

before(async () => {
	env = await initializeTestEnvironment({
		projectId,
		firestore: {
			rules: await fs.readFile('../firestore.rules', 'utf8'),
			host: '127.0.0.1',
			port: 8080
		}
	});
});
after(async () => env?.cleanup());

beforeEach(async () => {
	await env.clearFirestore();
	await env.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		await Promise.all([
			setDoc(doc(db, 'profiles/coach'), { displayName: 'Coach', isAdmin: true }),
			setDoc(doc(db, 'profiles/a'), { displayName: 'Participant A', isAdmin: false }),
			setDoc(doc(db, 'profiles/b'), { displayName: 'Participant B', isAdmin: false }),
			setDoc(doc(db, 'workouts/workout'), {
				title: 'Eight Station Circuit',
				creatorId: 'coach',
				exercises: [{ name: 'Squat' }]
			}),
			setDoc(doc(db, 'sessions/session'), {
				creatorId: 'coach',
				workoutId: 'workout',
				capacity: 1,
				rsvps: []
			}),
			setDoc(doc(db, 'scores/a-score'), { userId: 'a', workoutId: 'workout', score: 12 }),
			setDoc(doc(db, 'attendance/a-record'), { userId: 'a', creatorId: 'coach' })
		]);
	});
});

const dbFor = (uid) => env.authenticatedContext(uid).firestore();

test('unauthenticated users cannot read protected data', async () => {
	await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sessions/session')));
});

test('participant cannot edit workouts, timer state, another score, RSVP, attendance, or admin role', async () => {
	const db = dbFor('a');
	await assertFails(updateDoc(doc(db, 'workouts/workout'), { title: 'Changed' }));
	await assertFails(setDoc(doc(db, 'sessions/session/liveState/data'), { phase: 'FINISHED' }));
	await assertFails(setDoc(doc(db, 'scores/b-score'), { userId: 'b', score: 99 }));
	await assertFails(setDoc(doc(db, 'sessions/session/rsvps/b'), { userId: 'b' }));
	await assertFails(updateDoc(doc(db, 'attendance/a-record'), { userId: 'b' }));
	await assertFails(updateDoc(doc(db, 'profiles/a'), { isAdmin: true }));
});

test('coach can manage workout and authoritative live state', async () => {
	const db = dbFor('coach');
	await assertSucceeds(updateDoc(doc(db, 'workouts/workout'), { title: 'Updated Circuit' }));
	await assertSucceeds(
		setDoc(doc(db, 'sessions/session/liveState/data'), {
			phase: 'WORK',
			phaseStartedAt: serverTimestamp(),
			phaseDuration: 60,
			isRunning: true
		})
	);
});

test('participant can read live state and write only their attendee and score data', async () => {
	await env.withSecurityRulesDisabled((context) =>
		setDoc(doc(context.firestore(), 'sessions/session/liveState/data'), { phase: 'WORK' })
	);
	const db = dbFor('a');
	await assertSucceeds(getDoc(doc(db, 'sessions/session/liveState/data')));
	await assertSucceeds(
		setDoc(doc(db, 'sessions/session/attendees/a'), {
			displayName: 'Participant A',
			score: { reps: 10 }
		})
	);
	await assertSucceeds(setDoc(doc(db, 'scores/a-new'), { userId: 'a', score: 10 }));
	await assertFails(
		setDoc(doc(db, 'sessions/session/attendees/b'), { displayName: 'Participant B' })
	);
});

async function bookFinalPlace(db, uid) {
	const sessionRef = doc(db, 'sessions/session');
	const rsvpRef = doc(db, `sessions/session/rsvps/${uid}`);
	return runTransaction(db, async (transaction) => {
		await transaction.get(sessionRef);
		const own = await transaction.get(rsvpRef);
		if (own.exists()) return 'duplicate';
		const slotRef = doc(db, 'sessions/session/bookingSlots/0');
		const slot = await transaction.get(slotRef);
		if (slot.exists()) throw new Error('SESSION_FULL');
		transaction.set(slotRef, { userId: uid });
		transaction.set(rsvpRef, { userId: uid, slot: 0 });
		return 'booked';
	});
}

test('booking is unique, cancellable, and enforces the final space under concurrency', async () => {
	const dbA = dbFor('a');
	const dbB = dbFor('b');
	const results = await Promise.allSettled([bookFinalPlace(dbA, 'a'), bookFinalPlace(dbB, 'b')]);
	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
	const winner = results[0].status === 'fulfilled' ? { db: dbA, uid: 'a' } : { db: dbB, uid: 'b' };
	assert.equal(await bookFinalPlace(winner.db, winner.uid), 'duplicate');
	await assertSucceeds(deleteDoc(doc(winner.db, `sessions/session/bookingSlots/0`)));
	await assertSucceeds(deleteDoc(doc(winner.db, `sessions/session/rsvps/${winner.uid}`)));
	const loser = winner.uid === 'a' ? { db: dbB, uid: 'b' } : { db: dbA, uid: 'a' };
	assert.equal(await bookFinalPlace(loser.db, loser.uid), 'booked');
});

test('participant cannot claim extra capacity slots or spoof RSVP ownership', async () => {
	const db = dbFor('a');
	await assertFails(setDoc(doc(db, 'sessions/session/rsvps/a'), { userId: 'b', slot: 0 }));
	await assertFails(setDoc(doc(db, 'sessions/session/bookingSlots/0'), { userId: 'a' }));
	await assertFails(
		runTransaction(db, async (transaction) => {
			transaction.set(doc(db, 'sessions/session/rsvps/a'), { userId: 'a', slot: 0 });
			transaction.set(doc(db, 'sessions/session/bookingSlots/0'), { userId: 'a' });
			transaction.set(doc(db, 'sessions/session/bookingSlots/1'), { userId: 'a' });
		})
	);
});
