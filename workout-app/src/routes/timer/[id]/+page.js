// src/routes/timer/[id]/+page.js
import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

export async function load({ params, url }) {
	// NEW: Get the sessionId from the URL search parameter
	const sessionId = url.searchParams.get('session_id');

	const workoutRef = doc(db, 'workouts', params.id);
	const workoutSnap = await getDoc(workoutRef);

	if (workoutSnap.exists()) {
		const workout = {
			id: workoutSnap.id,
			...workoutSnap.data()
		};
		// Pass both the workout and the sessionId to the page
		return { workout, sessionId };
	} else {
		throw error(404, 'Workout not found');
	}
}
