<script>
    // @ts-nocheck
    import { onMount } from 'svelte';
    import { db, auth } from '$lib/firebase';
    import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore';

    let allWorkouts = [];
    let sessions = [];
    
    let newSession = { date: '', workoutId: '' };
    let isLoading = true;
    let isSubmitting = false;

    // NEW: A helper function to safely format dates
    function formatDate(date) {
        if (!date) return null;
        // Check if it's a Firestore Timestamp object (from loading)
        if (date.seconds) {
            return new Date(date.seconds * 1000);
        }
        // Otherwise, it's a JS Date or a string (from a new session)
        const d = new Date(date);
        // The date from the input is UTC, so adjust for timezone to prevent day-off errors
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }

    onMount(async () => {
        const user = auth.currentUser;
        if (!user) return;

        const workoutsQuery = query(collection(db, 'workouts'), where('creatorId', '==', user.uid));
        const sessionsQuery = query(collection(db, 'sessions'), where('creatorId', '==', user.uid), orderBy('sessionDate', 'desc'));

        const [workoutsSnapshot, sessionsSnapshot] = await Promise.all([
            getDocs(workoutsQuery),
            getDocs(sessionsQuery)
        ]);

        allWorkouts = workoutsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        isLoading = false;
    });

    async function createSession() {
        if (!newSession.date || !newSession.workoutId || isSubmitting) {
            alert('Please select a date and a workout.');
            return;
        }
        isSubmitting = true;

        try {
            const selectedWorkout = allWorkouts.find(w => w.id === newSession.workoutId);

            const sessionData = {
                creatorId: auth.currentUser.uid,
                sessionDate: formatDate(newSession.date), // Use our helper to ensure it's a correct JS Date
                workoutId: selectedWorkout.id,
                workoutTitle: selectedWorkout.title,
                rsvps: [],
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, 'sessions'), sessionData);

            sessions = [{ id: docRef.id, ...sessionData }, ...sessions];
            newSession = { date: '', workoutId: '' };

        } catch (error) {
            console.error("Error creating session:", error);
            alert('Failed to create session.');
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="page-container">
    <header class="page-header">
        <h1>Manage Sessions</h1>
        <p>Create new class events and view upcoming and past sessions.</p>
    </header>

    <section class="card create-session-card">
        <h2>Create New Session</h2>
        <form on:submit|preventDefault={createSession} class="create-form">
            <div class="form-group">
                <label for="sessionDate">Session Date</label>
                <input id="sessionDate" type="date" bind:value={newSession.date} required />
            </div>
            <div class="form-group">
                <label for="workout">Select Workout</label>
                <select id="workout" bind:value={newSession.workoutId} required>
                    <option value="" disabled>Choose a workout...</option>
                    {#each allWorkouts as workout}
                        <option value={workout.id}>{workout.title}</option>
                    {/each}
                </select>
            </div>
            <button type="submit" class="primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Session'}
            </button>
        </form>
    </section>

    <section class="sessions-list">
        <h2>Upcoming & Past Sessions</h2>
        {#if isLoading}
            <p>Loading sessions...</p>
        {:else if sessions.length === 0}
            <p class="empty-state">You haven't created any sessions yet.</p>
        {:else}
            <div class="sessions-grid">
                {#each sessions as session}
                    {@const displayDate = formatDate(session.sessionDate)}
                    <div class="session-card">
                        <div class="session-date">
                            {#if displayDate}
                                <span>{displayDate.toLocaleString('en-GB', { weekday: 'long' })}</span>
                                <span>{displayDate.toLocaleDateString('en-GB')}</span>
                            {:else}
                                <span>Invalid Date</span>
                            {/if}
                        </div>
                        <div class="session-details">
                            <h3>{session.workoutTitle}</h3>
                            <div class="rsvp-section">
                                <h4>Attendees ({session.rsvps.length})</h4>
                                {#if session.rsvps.length > 0}
                                    <div class="attendee-list">
                                        {#each session.rsvps as rsvp}
                                            <span class="attendee-chip">{rsvp.displayName}</span>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="no-rsvps">No bookings yet.</p>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </section>
</div>

<style>
    /* ... (all previous styles for this page) ... */
    .page-container { width: 100%; max-width: 1200px; margin: 2rem auto; padding: 2rem; }
    .page-header h1 { font-family: var(--font-display); color: var(--brand-yellow); font-size: 3rem; margin: 0; }
    .card { background: var(--surface-1); border: 1px solid var(--border-color); border-radius: 16px; padding: 2rem; }
    .card h2 { font-family: var(--font-display); font-size: 1.75rem; margin-top: 0; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
    .create-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 1.5rem; align-items: flex-end; }
    .form-group label { display: block; margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.9rem; font-weight: 600; }
    .form-group input, .form-group select { width: 100%; font-size: 1rem; padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--border-color); background: var(--deep-space); color: var(--text-primary); }
    input[type="date"] { font-family: inherit; } /* Ensures date picker uses the app font */
    .primary-btn { border: none; background: var(--brand-green); color: var(--text-primary); padding: 0.75rem 2rem; border-radius: 12px; font-weight: 600; cursor: pointer; height: fit-content; }
    .sessions-list { margin-top: 3rem; }
    .sessions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
    .session-card { background: var(--surface-2); border-radius: 12px; padding: 1.5rem; }
    .session-date { font-family: var(--font-display); font-size: 1.5rem; color: var(--brand-yellow); padding-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
    .session-details h3 { font-size: 1.1rem; margin: 1rem 0; }
    .rsvp-section h4 { font-size: 0.9rem; color: var(--text-muted); margin: 0 0 0.5rem 0; }
    .attendee-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .attendee-chip { background: var(--surface-3); color: var(--text-secondary); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.8rem; }
    .no-rsvps, .empty-state { font-size: 0.9rem; color: var(--text-muted); }
</style>
