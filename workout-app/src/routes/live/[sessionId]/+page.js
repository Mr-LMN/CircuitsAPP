// src/routes/live/[sessionId]/+page.js
import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	// First, get the session data
	const sessionRef = doc(db, 'sessions', params.sessionId);
	const sessionSnap = await getDoc(sessionRef);

	if (!sessionSnap.exists()) {
		throw error(404, 'Session not found');
	}
	const session = { id: sessionSnap.id, ...sessionSnap.data() };

	// Now, use the workoutId from the session to get the workout details
	const workoutRef = doc(db, 'workouts', session.workoutId);
	const workoutSnap = await getDoc(workoutRef);

	if (!workoutSnap.exists()) {
		throw error(404, 'Workout for this session not found');
	}
	const workout = { id: workoutSnap.id, ...workoutSnap.data() };

	// Return both so the page has all the info it needs
	return {
		session,
		workout
	};
}
