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
```

## Firestore security and data compatibility

Recommended production rules live at [`../firestore.rules`](../firestore.rules). Review them against
your Firebase project, create the required admin profile explicitly, then deploy with:

```sh
firebase deploy --only firestore:rules
```

Session booking now writes both the existing `sessions.rsvps` array and a uniquely keyed
`sessions/{sessionId}/rsvps/{userId}` document in one transaction. Existing sessions remain readable;
new bookings can therefore migrate gradually without breaking historical data. Optional `capacity`
and `organisationId` fields are backwards-compatible: omitted values retain the original unlimited,
single-organisation behaviour.

The rules file is intentionally not deployed automatically. Test it with the Firebase Emulator Suite
and confirm the first coach/admin account before applying it to production.
