import { doc, getDoc } from 'firebase/firestore';
import { error } from '@sveltejs/kit';
import { db } from '$lib/firebase';

/**
 * @typedef {import('firebase/firestore').DocumentData & {
 * sessionId?: string;
 * workoutId?: string;
 * }} PersonalBestScore
 */

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
        const { scoreId } = params;

        if (!scoreId) {
                throw error(400, 'A score identifier is required.');
        }

        const scoreRef = doc(db, 'scores', scoreId);
        const scoreSnap = await getDoc(scoreRef);

        if (!scoreSnap.exists()) {
                throw error(404, 'Personal best not found.');
        }

        const scoreData = /** @type {PersonalBestScore} */ (scoreSnap.data() ?? {});

        const score = { id: scoreSnap.id, ...scoreData };

        const [sessionSnap, workoutSnap] = await Promise.all([
                score.sessionId ? getDoc(doc(db, 'sessions', score.sessionId)) : Promise.resolve(null),
                score.workoutId ? getDoc(doc(db, 'workouts', score.workoutId)) : Promise.resolve(null)
        ]);

        const session = sessionSnap && sessionSnap.exists() ? { id: sessionSnap.id, ...sessionSnap.data() } : null;
        const workout = workoutSnap && workoutSnap.exists() ? { id: workoutSnap.id, ...workoutSnap.data() } : null;

        return {
                score,
                session,
                workout
        };
}
