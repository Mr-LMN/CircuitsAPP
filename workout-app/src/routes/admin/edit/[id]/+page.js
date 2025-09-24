import { doc, getDoc } from 'firebase/firestore';
import { db } from '$lib/firebase';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	// 'params.id' gives us the unique ID from the URL
	const docRef = doc(db, 'workouts', params.id);
	const docSnap = await getDoc(docRef);

	if (docSnap.exists()) {
		// If the document exists, we get its data
		const data = docSnap.data();

		// We need to handle the Firestore Timestamp object
		// so it can be passed from the server to the browser.
		const workout = {
			...data,
			id: docSnap.id,
			// Convert timestamp to a plain string if it exists
			createdAt: data.createdAt?.toDate().toISOString() || null
		};

		return {
			workout
		};
	} else {
		// If no document is found, throw a 404 error
		throw error(404, 'Workout not found');
	}
}
