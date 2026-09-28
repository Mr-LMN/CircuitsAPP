# CircuitsAPP

A lightweight SvelteKit app for running circuits classes, live timers, attendance and member leaderboards.

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Install dependencies, copy the environment template, and add the Firebase web app configuration:

```sh
npm install
cp .env.example .env
```

Then start the development server:

```sh
npm run dev
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Quality checks

```sh
npm run check
npm run lint
npm test
npm run test:emulator
```

## Firestore security and data compatibility

Recommended production rules live at [`../firestore.rules`](../firestore.rules). Review them against
your Firebase project, create the required admin profile explicitly, then deploy with:

```sh
firebase deploy --only firestore:rules
```

Session booking reads the existing `sessions.rsvps` array for compatibility and writes new bookings to
the uniquely keyed `sessions/{sessionId}/rsvps/{userId}` path. Capacity-limited sessions also claim a
transactional booking slot so two participants cannot take the final place. Existing sessions remain
readable while new bookings migrate away from mutable arrays. Optional `capacity` and `organisationId`
fields are backwards-compatible: omitted values retain the original unlimited, single-organisation
behaviour.

The rules file is intentionally not deployed automatically. Test it with the Firebase Emulator Suite
and confirm the first coach/admin account before applying it to production.

The emulator suite now covers unauthenticated access, participant isolation, coach live-state control,
participant score/attendee writes, duplicate booking, cancellation, capacity and concurrent attempts
to claim the final place. A passing `npm run test:emulator` is required before rules changes are deployed.
