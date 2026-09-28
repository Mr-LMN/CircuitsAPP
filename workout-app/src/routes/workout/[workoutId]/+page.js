import { doc, getDoc } from 'firebase/firestore';
import { error } from '@sveltejs/kit';
import { db } from '$lib/firebase';

export async function load({ params, url }) {
	const snapshot = await getDoc(doc(db, 'workouts', params.workoutId));
	if (!snapshot.exists()) throw error(404, 'Workout not found');
	return {
		workout: { id: snapshot.id, ...snapshot.data() },
		sourceSessionId: url.searchParams.get('source_session')
	};
}
