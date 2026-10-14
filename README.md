# CampusOS — Academic Lifecycle Planner

A React + Vite + TypeScript single-page planner starter for degree progress, prerequisites, assignments, calendar scheduling, deep work, and privacy-first storage. The shipped interface includes sample academic data so the app is usable immediately after installing dependencies.

## Stack

- React 18, Vite, TypeScript
- Tailwind CSS 3 with CSS-token-based light/dark themes
- Local shadcn-style primitives in `src/components/ui.tsx` (`Button`, `Card`, `Badge`, `Progress`, `SectionHeading`)
- LocalForage over IndexedDB for persisted state
- Web Crypto API: PBKDF2-SHA-256 + AES-256-GCM encrypted JSON backups
- Optional Google Identity Services OAuth + Google Calendar REST API

## Start locally

Requires Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

For a production bundle:

```bash
npm run build
npm run preview
```

## Main modules

### Degree plan
- Multi-year degree canvas, grouped by academic year and semester
- Prerequisite dependency graph; a course is locked until all prerequisites are marked passed
- ECTS-weighted GPA based on passed courses with grades on a 0.0–4.0 scale; edit grades in the course table

### Planner
- Kanban task board with drag-and-drop status changes
- Day, week, and month calendar views
- Drag tasks to move deadlines and drag study blocks/calendar events to move their day while retaining the time of day; conflicts with classes, events, or other reserved study blocks are rejected
- Detects pairs of exam/project/high-priority deadlines within 48 hours and flags their calendar week as high-stress

### Smart blocking and deep work
- Assignment effort is divided into preferred 90- or 120-minute blocks, subject to available hours, recurring class meetings, calendar events, existing study blocks, due date, and daily study cap
- Missed blocks are redistributed across remaining free time; overdue blocks are detected periodically while the app is open
- Next Up recommends one task using due-date urgency, priority, remaining effort, and in-progress status
- Pomodoro focus timer, short and long breaks, manual time logging, and per-task session history

### Local-first data and backups
- Planner state is persisted in the browser's IndexedDB via LocalForage. There is no application backend.
- Encrypted backup export/import transfers the planner state in one JSON file. The passphrase is not saved in app state.
- Use a strong passphrase and retain it separately: encrypted backups cannot be restored without it.

## Optional Google Calendar OAuth

Google Calendar is disabled unless `VITE_GOOGLE_CLIENT_ID` is configured. To enable it:

1. In Google Cloud Console, create or select a project, enable **Google Calendar API**, and configure the OAuth consent screen.
2. Create an OAuth 2.0 **Web application** client ID. Add the exact development origin (usually `http://localhost:5173`) to **Authorized JavaScript origins**.
3. Put the client ID in `.env.local`:

   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

4. Restart the Vite dev server and select **Connect & sync** in Settings.

OAuth is initiated client-side after the user clicks Connect. The app requests the `calendar.events` scope. Sync imports calendar events in the next 14 days, publishes open task deadlines and scheduled study blocks, and upserts planner events. Event/task/block date and time changes are reconciled on subsequent sync using Google event `updated` timestamps and local `updatedAt` timestamps. Deleted tasks and completed/missed linked study blocks queue remote-event deletion for the next sync. No OAuth access token is persisted; the user may need to authorize again after a page refresh.

For production deployment, configure OAuth origins/consent correctly and review Google API usage, account policies, and privacy disclosures. Since this is a client-side SPA, never put a client secret in environment variables or ship one to the browser.

## Scheduling notes

- The initial demo has an illustrative weekly class schedule. Edit it in **Settings & backup** so generated blocks reflect the student's actual timetable.
- Scheduling is heuristic and local: it aims to distribute blocks across days and respects events and the configured daily window/cap. It does not guarantee every requested hour fits; when no free slots remain, the task stays open and no conflicting block is forced.
- Automatic overdue-block detection runs while the app is open. No background process runs after the browser is closed; an overdue block is reconciled on the next app visit.
- The GPA scale is explicitly shown as 4.0. Adapt it if the target institution uses a different grading system.

## Project layout

```text
src/
  App.tsx                 Application screens and interactions
  components/ui.tsx       Shared shadcn-style UI primitives
  lib/crypto.ts           Encrypted backup helpers
  lib/googleCalendar.ts   Optional client-side Calendar OAuth/sync
  lib/scheduler.ts        Study block generation, rescheduling, stress and Next Up logic
  lib/storage.ts          IndexedDB persistence
  types.ts                Planner state/domain types
  index.css               Theme tokens, Tailwind directives, responsive styles
```

## License

Open-source starter. Add your preferred OSI-approved license before publishing (for example, MIT).
