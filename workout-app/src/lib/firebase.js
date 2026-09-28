// src/lib/firebase.js

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const requiredEnvironmentVariables = [
	'VITE_API_KEY',
	'VITE_AUTH_DOMAIN',
	'VITE_PROJECT_ID',
	'VITE_APP_ID'
];

export const missingFirebaseVariables = requiredEnvironmentVariables.filter(
	(key) => !String(import.meta.env[key] ?? '').trim()
);
export const isFirebaseConfigured = missingFirebaseVariables.length === 0;

// Firebase validates configuration as soon as Auth is created. Development and
// preview builds should still render a useful setup screen when no .env exists,
// so harmless local placeholders are used until real values are supplied.
const firebaseConfig = {
	apiKey: import.meta.env.VITE_API_KEY || 'local-development-key',
	authDomain: import.meta.env.VITE_AUTH_DOMAIN || 'localhost',
	projectId: import.meta.env.VITE_PROJECT_ID || 'circuits-app-local',
	storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_APP_ID || '1:000000000000:web:local'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

if (
	typeof window !== 'undefined' &&
	import.meta.env.VITE_FIREBASE_EMULATOR === 'true' &&
	!globalThis.__circuitsEmulatorsConnected
) {
	connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
	connectFirestoreEmulator(db, '127.0.0.1', 8080);
	globalThis.__circuitsEmulatorsConnected = true;
}
