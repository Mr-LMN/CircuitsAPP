<script>
  export let data;
  const { workout } = data;

  // We'll add all the timer logic here in the next step
  let currentExerciseIndex = 0;
  let phase = "Ready";
  let time = "01:00"; // Placeholder

</script>

<div class="timer-container">
  <header class="timer-header">
    <h1>{workout.title}</h1>
    <div class="badges">
      {#if workout.isBenchmark}<span class="badge benchmark">★ Benchmark</span>{/if}
      <span class="badge {workout.type.toLowerCase()}">{workout.type}</span>
      <span class="badge {workout.mode.toLowerCase()}">{workout.mode}</span>
    </div>
  </header>

  <main class="timer-main">
    <div class="phase-display">{phase}</div>
    <div class="time-display">{time}</div>
    <div class="progress-bar-container">
      <div class="progress-bar-fill" style="width: 0%;"></div>
    </div>
  </main>

  <section class="exercise-display">
    <div class="current-exercise">
      <h2>CURRENT</h2>
      <p>{workout.exercises[currentExerciseIndex].name}</p>
      <small>{workout.exercises[currentExerciseIndex].description}</small>
    </div>
    <div class="next-exercise">
      <h2>NEXT</h2>
      {#if workout.exercises[currentExerciseIndex + 1]}
        <p>{workout.exercises[currentExerciseIndex + 1].name}</p>
        <small>{workout.exercises[currentExerciseIndex + 1].description}</small>
      {:else}
        <p>Last exercise!</p>
      {/if}
    </div>
  </section>

  <footer class="timer-controls">
    <button class="control-btn secondary">Reset</button>
    <button class="control-btn primary">Start</button>
    <button class="control-btn secondary">Next</button>
  </footer>
</div>

<style>
  :global(body) {
    background-color: #000; /* Force black background for timer view */
  }
  .timer-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    padding: 2rem;
    color: white;
    text-align: center;
  }
  .timer-header h1 {
    font-size: clamp(2rem, 5vw, 3rem);
    color: var(--yellow);
  }
  .badges {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
  .badge {
    /* Styles from previous components */
    display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px;
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
  }
  .badge.circuit { background-color: #059669; }
  .badge.amrap { background-color: #D97706; }
  .badge.emom { background-color: #6D28D9; }
  .badge.partner { background-color: #DB2777; }
  .badge.benchmark { background-color: var(--yellow); color: var(--bg); }

  .timer-main {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .phase-display {
    font-size: clamp(2rem, 6vw, 4rem);
    font-weight: 300;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #ddd;
  }
  .time-display {
    font-size: clamp(8rem, 25vw, 18rem);
    font-weight: 800;
    line-height: 1;
    margin: 1rem 0;
    font-family: monospace;
  }
  .progress-bar-container {
    width: 80%;
    max-width: 800px;
    height: 20px;
    background-color: #222;
    border-radius: 999px;
    margin: 0 auto;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    width: 0%;
    background-color: var(--yellow);
  }

  .exercise-display {
    display: flex;
    justify-content: space-between;
    gap: 2rem;
    margin-top: 2rem;
  }
  .current-exercise, .next-exercise {
    flex: 1;
    background: #111;
    border-radius: 16px;
    padding: 1.5rem;
  }
  .current-exercise {
    border-left: 5px solid var(--yellow);
  }
  .next-exercise {
    opacity: 0.6;
  }
  .exercise-display h2 {
    font-size: 1rem;
    font-weight: 300;
    letter-spacing: 2px;
    margin-bottom: 0.5rem;
  }
  .exercise-display p {
    font-size: clamp(1.2rem, 3vw, 2rem);
  }
  .exercise-display small {
    font-size: 0.9rem;
    color: #aaa;
  }

  .timer-controls {
    padding-top: 2rem;
    display: flex;
    justify-content: center;
    gap: 1rem;
  }
  .control-btn {
    border: none;
    border-radius: 12px;
    font-size: 1.25rem;
    padding: 1rem 2rem;
    cursor: pointer;
    min-width: 150px;
  }
  .control-btn.primary { background-color: var(--green); color: var(--yellow); }
  .control-btn.secondary { background-color: #333; color: white; }
</style>
