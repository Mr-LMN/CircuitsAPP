import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	const docRef = doc(db, 'workouts', params.id);
	const docSnap = await getDoc(docRef);

	if (docSnap.exists()) {
		const data = docSnap.data();
		const workout = {
			...data,
			id: docSnap.id,
			createdAt: data.createdAt?.toDate().toISOString() || null
		};
		return { workout };
	} else {
		throw error(404, 'Workout not found');
	}
}
