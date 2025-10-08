import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params, url }) {
        const docRef = doc(db, 'workouts', params.id);
	const docSnap = await getDoc(docRef);

	if (docSnap.exists()) {
		const data = docSnap.data();
		const workout = {
			...data,
			id: docSnap.id,
			createdAt: data.createdAt?.toDate().toISOString() || null
		};
                return {
                        workout,
                        sessionId: params.id,
                        url: { origin: url.origin }
                };
	} else {
		throw error(404, 'Workout not found');
	}
}
