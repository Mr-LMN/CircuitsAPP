// src/lib/firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
	apiKey: 'AIzaSyCDGQJNmkpycpMm-TfShvukxfGPgTgBoD8',
	authDomain: 'pencoedtre-circuits-app.firebaseapp.com',
	projectId: 'pencoedtre-circuits-app',
	storageBucket: 'pencoedtre-circuits-app.firebasestorage.app',
	messagingSenderId: '776510815016',
	appId: '1:776510815016:web:9c0a8b3b19f2f108302e1d'
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
