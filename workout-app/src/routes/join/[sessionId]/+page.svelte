<script>
// @ts-nocheck
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/stores';
import { user, loading } from '$lib/store';

let hasRedirected = false;

$: sessionId = $page.params.sessionId;
$: if (!hasRedirected && !$loading && sessionId) {
        hasRedirected = true;
        if ($user) {
                goto(resolve(`/dashboard?session=${sessionId}`));
        } else {
                goto(resolve('/?signup=1'));
        }
}
</script>

<main class="join-redirect">
        <h1>Preparing your workout...</h1>
        <p>Hang tight while we get you to the right place.</p>
</main>

<style>
.join-redirect {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        text-align: center;
        padding: 2rem;
}

.join-redirect h1 {
        font-size: 2rem;
}

.join-redirect p {
        color: var(--text-secondary);
}
</style>
