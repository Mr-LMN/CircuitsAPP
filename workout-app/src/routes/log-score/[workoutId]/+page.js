import { doc, getDoc } from 'firebase/firestore';
import { error } from '@sveltejs/kit';
import { db } from '$lib/firebase';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
        const workoutRef = doc(db, 'workouts', params.workoutId);
        const workoutSnap = await getDoc(workoutRef);

        if (!workoutSnap.exists()) {
                throw error(404, 'Workout not found');
        }

        const data = workoutSnap.data();
        const workout = {
                ...data,
                id: workoutSnap.id,
                createdAt: data.createdAt?.toDate().toISOString() ?? null
        };

        return { workout };
}
