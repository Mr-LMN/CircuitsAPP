// Firebase is a browser SDK and every route in this application is backed by
// the signed-in user's live Firestore data. Rendering the route tree as a
// client-side app avoids initialising Auth during SSR and keeps auth state in a
// single, predictable browser lifecycle.
export const ssr = false;
