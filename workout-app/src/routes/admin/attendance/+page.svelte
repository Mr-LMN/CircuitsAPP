<script>
// @ts-nocheck
import { get } from 'svelte/store';
import { onMount } from 'svelte';
import { db } from '$lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, where, Timestamp } from 'firebase/firestore';
import { SvelteSet } from 'svelte/reactivity';
import { user } from '$lib/store';

let profiles = [];
let todaysAttendees = new SvelteSet(); // A Set for quick lookups of who has attended today
let isLoading = true;
let searchTerm = '';

// This function runs when the page loads
onMount(async () => {
// --- Step 1: Get today's date range ---
const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

// Convert to Firebase Timestamps for the query
const startTimestamp = Timestamp.fromDate(startOfToday);
const endTimestamp = Timestamp.fromDate(endOfToday);

// --- Step 2: Fetch all profiles AND today's attendance in parallel ---
const profilesQuery = getDocs(collection(db, 'profiles'));
const attendanceQuery = getDocs(
query(
collection(db, 'attendance'),
where('date', '>=', startTimestamp),
where('date', '<=', endTimestamp)
)
);

const [profilesSnapshot, attendanceSnapshot] = await Promise.all([profilesQuery, attendanceQuery]);

// --- Step 3: Process the results ---
profiles = profilesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

const attendeeIds = attendanceSnapshot.docs.map(doc => doc.data().userId);
todaysAttendees = new SvelteSet(attendeeIds);

isLoading = false;
});

async function checkIn(profile) {
if (todaysAttendees.has(profile.id)) return; // Already checked in

try {
// Disable the button to prevent double clicks
profile.isCheckingIn = true;
profiles = profiles;

    const currentUser = get(user);
    const payload = {
        userId: profile.id,
        displayName: profile.displayName,
        email: profile.email,
        date: serverTimestamp() // Use server's timestamp for accuracy
    };

    if (currentUser?.uid) {
        payload.creatorId = currentUser.uid;
    }

    await addDoc(collection(db, 'attendance'), payload);

// Update the UI instantly without needing to refresh the page
todaysAttendees.add(profile.id);
todaysAttendees = todaysAttendees;

} catch (error) {
console.error("Error checking in:", error);
alert("Could not check in the user. Please try again.");
} finally {
profile.isCheckingIn = false;
profiles = profiles;
}
}

// A reactive statement to filter profiles based on the search term
$: filteredProfiles = profiles.filter(p => 
p.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
);
</script>

<div class="page-container">
<div class="header">
<h1>Member Check-in</h1>
<div class="search-bar">
<input type="text" bind:value={searchTerm} placeholder="Search by name..." />
</div>
</div>

{#if isLoading}
<p>Loading members...</p>
{:else}
<div class="members-grid">
{#each filteredProfiles as profile (profile.id)}
<div class="member-card">
<div class="member-info">
<span class="avatar">{profile.displayName?.charAt(0) || '?'}</span>
<div class="name-details">
<span class="display-name">{profile.displayName || 'No Name Set'}</span>
<span class="email">{profile.email}</span>
</div>
</div>
<div class="check-in-action">
{#if todaysAttendees.has(profile.id)}
<div class="checked-in-status">
<span>✔</span> Checked In
</div>
{:else}
<button 
class="check-in-btn" 
on:click={() => checkIn(profile)}
disabled={profile.isCheckingIn}
>
{profile.isCheckingIn ? '...' : 'Check In'}
</button>
{/if}
</div>
</div>
{/each}
</div>
{/if}
</div>

<style>
.page-container {
width: 100%;
max-width: 1200px;
margin: 2rem auto;
padding: 2rem;
}
.header {
display: flex;
justify-content: space-between;
align-items: center;
flex-wrap: wrap;
gap: 1.5rem;
margin-bottom: 2rem;
padding-bottom: 2rem;
border-bottom: 1px solid var(--surface-2);
}
h1 {
font-family: var(--font-display);
color: var(--brand-yellow);
font-size: 3rem;
letter-spacing: 2px;
margin: 0;
}
.search-bar input {
font-size: 1rem;
padding: 0.75rem 1.25rem;
min-width: 300px;
border-radius: 999px;
border: 1px solid var(--surface-2);
background: var(--surface-1);
color: var(--text-primary);
}
.members-grid {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
gap: 1.5rem;
}
.member-card {
background: var(--surface-1);
border: 1px solid var(--surface-2);
border-radius: 16px;
padding: 1.5rem;
display: flex;
justify-content: space-between;
align-items: center;
gap: 1rem;
transition: transform 0.2s ease, box-shadow 0.2s ease;
}
    .member-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
.member-info {
display: flex;
align-items: center;
gap: 1rem;
}
.avatar {
width: 48px;
height: 48px;
border-radius: 50%;
background: var(--brand-green);
color: var(--text-primary);
display: flex;
align-items: center;
justify-content: center;
font-size: 1.5rem;
font-weight: 600;
flex-shrink: 0;
}
.name-details {
display: flex;
flex-direction: column;
}
.display-name {
font-size: 1.1rem;
font-weight: 600;
color: var(--text-primary);
}
.email {
font-size: 0.85rem;
color: var(--text-muted);
}
.check-in-btn {
border: none;
background: var(--surface-2);
color: var(--text-secondary);
padding: 0.6rem 1.2rem;
border-radius: 999px;
font-weight: 600;
cursor: pointer;
transition: background-color 0.2s ease, color 0.2s ease;
}
.check-in-btn:hover {
background: var(--brand-green);
color: var(--text-primary);
}
.checked-in-status {
color: var(--brand-green);
font-weight: 600;
background: rgba(22, 163, 74, 0.1);
padding: 0.6rem 1.2rem;
border-radius: 999px;
display: flex;
align-items: center;
gap: 0.5rem;
}
</style>
