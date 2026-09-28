import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
	initializeTestEnvironment,
	assertFails,
	assertSucceeds
} from '@firebase/rules-unit-testing';
import {
	collection,
	collectionGroup,
	doc,
	getDocs,
	getDoc,
	runTransaction,
	serverTimestamp,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	limit,
	Timestamp
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
			setDoc(doc(db, 'profiles/staff'), {
				displayName: 'Explicit Staff',
				isAdmin: false,
				role: 'staff'
			}),
			setDoc(doc(db, 'profiles/student'), {
				displayName: 'Student',
				isAdmin: false,
				role: 'student'
			}),
			setDoc(doc(db, 'profiles/student2'), {
				displayName: 'Student 2',
				isAdmin: false,
				role: 'student'
			}),
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

async function runDashboardReads(uid) {
	const db = dbFor(uid);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	await Promise.all([
		assertSucceeds(getDocs(query(collection(db, 'attendance'), where('userId', '==', uid)))),
		assertSucceeds(
			getDocs(query(collection(db, 'scores'), where('userId', '==', uid), orderBy('date', 'desc')))
		),
		assertSucceeds(
			getDocs(
				query(
					collection(db, 'sessions'),
					where('sessionDate', '>=', today),
					orderBy('sessionDate', 'asc'),
					limit(25)
				)
			)
		),
		assertSucceeds(getDoc(doc(db, 'profiles', uid))),
		assertSucceeds(getDocs(query(collectionGroup(db, 'rsvps'), where('userId', '==', uid))))
	]);
	await assertSucceeds(getDoc(doc(db, 'sessions/session')));
	await assertSucceeds(getDocs(collection(db, 'sessions/session/rsvps')));
}

test('all dashboard reads work for legacy and explicit staff profiles', async () => {
	await env.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		await Promise.all([
			updateDoc(doc(db, 'sessions/session'), {
				sessionDate: Timestamp.fromDate(new Date(Date.now() + 86_400_000))
			}),
			setDoc(doc(db, 'sessions/session/rsvps/a'), { userId: 'a', sessionId: 'session' }),
			setDoc(doc(db, 'sessions/session/rsvps/staff'), { userId: 'staff', sessionId: 'session' }),
			updateDoc(doc(db, 'scores/a-score'), { date: Timestamp.now() }),
			setDoc(doc(db, 'scores/staff-score'), {
				userId: 'staff',
				workoutId: 'workout',
				score: 8,
				date: Timestamp.now()
			})
		]);
	});
	await runDashboardReads('a');
	await runDashboardReads('staff');
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

test('student owns workouts and student-led sessions without gaining coach privileges', async () => {
	const db = dbFor('student');
	await assertSucceeds(
		setDoc(doc(db, 'workouts/student-workout'), {
			title: 'My circuit',
			creatorId: 'student',
			exercises: []
		})
	);
	await assertSucceeds(
		updateDoc(doc(db, 'workouts/student-workout'), { title: 'My updated circuit' })
	);
	await assertSucceeds(
		setDoc(doc(db, 'workouts/student-copy'), {
			title: 'My copy',
			creatorId: 'student',
			exercises: []
		})
	);
	await assertSucceeds(deleteDoc(doc(db, 'workouts/student-copy')));
	await assertFails(updateDoc(doc(db, 'workouts/workout'), { title: 'Not mine' }));
	await assertFails(
		setDoc(doc(db, 'workouts/spoofed'), { title: 'Spoofed', creatorId: 'student2' })
	);
	await assertSucceeds(
		setDoc(doc(db, 'sessions/student-session'), {
			creatorId: 'student',
			creatorRole: 'student',
			sessionType: 'student-led',
			workoutId: 'student-workout'
		})
	);
	await assertSucceeds(
		setDoc(doc(db, 'sessions/student-session/liveState/data'), { phase: 'WORK' })
	);
	await assertFails(updateDoc(doc(db, 'sessions/student-session'), { sessionType: 'staff-class' }));
	await assertFails(updateDoc(doc(db, 'sessions/session'), { capacity: 99 }));
	await assertFails(
		setDoc(doc(db, 'sessions/official'), {
			creatorId: 'student',
			sessionType: 'staff-class',
			workoutId: 'student-workout'
		})
	);
});

test('catch-up score remains separate from source session attendance and RSVP', async () => {
	const db = dbFor('a');
	await assertSucceeds(
		setDoc(doc(db, 'scores/catch-up'), {
			userId: 'a',
			workoutId: 'workout',
			completionType: 'catch-up',
			sourceSessionId: 'session',
			exerciseScores: []
		})
	);
	assert.equal(
		(await getDocs(query(collection(db, 'attendance'), where('userId', '==', 'a')))).size,
		1
	);
	assert.equal((await getDoc(doc(db, 'sessions/session/rsvps/a'))).exists(), false);
});

test('student cannot control another student session', async () => {
	await env.withSecurityRulesDisabled((context) =>
		setDoc(doc(context.firestore(), 'sessions/student-session'), {
			creatorId: 'student',
			sessionType: 'student-led',
			workoutId: 'student-workout'
		})
	);
	const db = dbFor('student2');
	await assertFails(
		setDoc(doc(db, 'sessions/student-session/liveState/data'), { phase: 'FINISHED' })
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

test('signed-in dashboard can discover sessions and its RSVP subcollection booking', async () => {
	await env.withSecurityRulesDisabled((context) =>
		setDoc(doc(context.firestore(), 'sessions/session/rsvps/a'), {
			userId: 'a',
			sessionId: 'session'
		})
	);
	const db = dbFor('a');
	await assertSucceeds(getDocs(collection(db, 'sessions')));
	const bookings = await assertSucceeds(
		getDocs(query(collectionGroup(db, 'rsvps'), where('userId', '==', 'a')))
	);
	assert.equal(bookings.size, 1);
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
