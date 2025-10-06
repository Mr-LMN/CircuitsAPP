// src/routes/log-score/[workoutId]/+page.js
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
        // Fetch the specific workout data
        const workoutRef = doc(db, 'workouts', params.workoutId);
        const workoutSnap = await getDoc(workoutRef);

        if (!workoutSnap.exists()) {
                throw error(404, 'Workout not found');
        }

        // Fetch all user profiles to populate the dropdown
        const profilesSnap = await getDocs(collection(db, 'profiles'));
        const profiles = profilesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        const workout = {
                id: workoutSnap.id,
                ...workoutSnap.data()
        };

        return {
                workout,
                profiles
        };
}
