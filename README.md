# xHarbor

xHarbor is an open source platform for running software delivery teams. It combines team structure, planning, communication, reporting, and documentation into a single composable system built as a monorepo.

It is positioned as an open alternative to fragmented delivery tooling. The goal is not to replace every workflow with one giant app, but to unify the core system boundaries that teams usually spread across separate products.

## Why xHarbor

Most delivery organizations operate across disconnected tools for identity, planning, communication, and documentation. That fragmentation creates duplicated data, unclear ownership, and weak runtime boundaries between systems.

xHarbor aims to unify those concerns with shared domain models, shared contracts, and explicit module boundaries. Each application stays focused on its own job while still participating in one coherent platform.

## Quick start

Install dependencies and start the local web stack:

```bash
npm install
npm run stack:start
```

To launch the native macOS client for `xTalk`:

```bash
swift run xtalk-macos
```

The stack launcher manages all Node APIs and web apps together.

## Platform modules

### xGroup

`xGroup` is the source of truth for people, teams, memberships, invitations, and session-aware identity data.

Responsibilities:
- organization and team directory
- user lifecycle and status
- memberships and invitations
- session administration

### xBacklog

`xBacklog` is the planning and execution module for projects and tasks. It consumes workspace structure from `xGroup`.

Responsibilities:
- team-owned projects
- task board with `new -> in_progress -> done`
- task detail, comments, and change history
- board filtering and drag-and-drop workflow

### xDashboard

`xDashboard` is the reporting surface for cross-module insights built from `xGroup` and `xBacklog`.

Responsibilities:
- executive overview
- team load and delivery activity
- completed work and risk views
- cross-module reporting snapshots

### xTalk

`xTalk` is the communication module. It exists as both a web app and a native macOS client.

Responsibilities:
- team rooms
- direct conversations
- unread state and mark-as-read actions
- shared web and native chat experience
- presence with automatic inactivity handling

### xDoc

`xDoc` is the documentation workspace for structured Markdown pages and revision history.

Responsibilities:
- hierarchical page tree
- Markdown authoring and preview
- page-level revision history
- author and editor traceability

## Architecture

xHarbor is a modular monorepo. Each domain module has its own API and web app. Modules share contracts and platform services where that reduces duplication without collapsing boundaries.

`xTalk` also has a native macOS client implemented in Swift. The active backend and web runtime path is Node. Local persistence uses SQLite.

## Design principles

- explicit domain boundaries
- shared contracts across modules
- minimal coupling between apps
- local-first development experience

## Shared packages

- `packages/contracts`: shared demo state, constants, and contract helpers
- `packages/platform-auth`: authorization rules and permission checks
- `packages/platform-session`: session handling and presence state
- `packages/sqlite-store`: SQLite-backed document persistence

## Stack management

Start the full local web stack:

```bash
npm run stack:start
```

Inspect or control the stack:

```bash
npm run stack:status
npm run stack:logs
npm run stack:stop
npm run stack:restart
```

## Full workspace management

Manage the full workspace, including the native macOS client:

```bash
npm run workspace:start
npm run workspace:status
npm run workspace:logs
npm run workspace:stop
npm run workspace:restart
```

## Optional native macOS client launch

Run the native `xTalk` client directly:

```bash
swift run xtalk-macos
```

Swift remains in the repository for the native `xtalk-macos` client and its shared `XTalkDomain`. Web and backend modules are implemented in the Node monorepo.

## Persistence

Primary local persistence uses SQLite at:

`data/sqlite/xharbor.db`

## Repository layout

- `apps/`: application entry points, APIs, web apps, and the native macOS client
- `packages/`: shared libraries used across modules
- `Sources/`: Swift code for native `xTalk`
- `Tests/`: Swift tests for the native client domain
- `docs/`: product and architecture notes

## Docs

- [docs/product/vision.md](/Users/marcin/Projects/xCompany/xHarbor/docs/product/vision.md)
- [docs/architecture/monorepo.md](/Users/marcin/Projects/xCompany/xHarbor/docs/architecture/monorepo.md)
- [docs/architecture/domain-model.md](/Users/marcin/Projects/xCompany/xHarbor/docs/architecture/domain-model.md)
