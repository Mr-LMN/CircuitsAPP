// src/routes/live/[sessionId]/+page.js
import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
    // Get the session data
    const sessionRef = doc(db, 'sessions', params.sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
        throw error(404, 'Session not found');
    }
    const session = { id: sessionSnap.id, ...sessionSnap.data() };

    // --- THIS IS THE FIX ---
    // Check if the workoutId exists on the session before trying to fetch it
    if (!session.workoutId) {
        throw error(500, 'This session does not have a workout linked to it. Please create a new session and assign a workout.');
    }
    // --- END OF FIX ---

    // Now, use the workoutId from the session to get the workout details
    const workoutRef = doc(db, 'workouts', session.workoutId);
    const workoutSnap = await getDoc(workoutRef);

    if (!workoutSnap.exists()) {
        throw error(404, `The assigned workout (ID: ${session.workoutId}) could not be found.`);
    }
    const workout = { id: workoutSnap.id, ...workoutSnap.data() };

    return {
        session,
        workout
    };
}
