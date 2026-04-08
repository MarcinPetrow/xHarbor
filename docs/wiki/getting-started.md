# Getting started

## What xHarbor gives you

xHarbor combines six platform modules into one local-first system:

- `xGroup` for people, teams, invitations, sessions, and reporting lines
- `xBacklog` for projects, tasks, and delivery workflow
- `xDashboard` for reporting built from platform data
- `xTalk` for rooms and direct communication across web and macOS
- `xTag` for cross-system hashtag search and normalization
- `xDoc` for structured Markdown documentation and revision history

## Run the platform

Install dependencies and start the full local web stack:

```bash
npm install
npm run stack:start
```

The stack launcher starts all Node APIs and web apps together.

## Native xTalk client

Launch the macOS client for `xTalk` with:

```bash
swift run xtalk-macos
```

## First login

Each web app uses the shared xHarbor shell and the same login flow. Use the top-right sign-in control and choose a workspace user. The local demo workspace includes seeded organizational data, planning data, chat threads, and documentation pages.

## Suggested walkthrough

1. Open `xGroup` and inspect the organizational directory and reporting structure.
2. Open `xBacklog` and review the board, project catalog, and task detail flow.
3. Open `xDashboard` to see reporting built from `xGroup` and `xBacklog`.
4. Open `xTalk` to review rooms, direct messages, and presence behavior.
5. Open `xTag` to inspect cross-system tag search and alias management.
6. Open `xDoc` to browse Markdown pages, preview content, edit a page, and inspect its revision history.
