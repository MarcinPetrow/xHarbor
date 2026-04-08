# xHarbor

xHarbor is an open source platform for running software delivery teams. It combines team structure, planning, communication, reporting, and documentation into a single composable system built as a monorepo.

<p>
  <strong>Powered by</strong>
  <img src="./go_home.png" alt="Bold Merge" width="180" valign="middle">
</p>

xHarbor is designed as an open alternative to fragmented delivery tooling. The platform keeps each module focused on its own domain while sharing identity, contracts, and runtime foundations across the system.

## Why xHarbor

Most delivery organizations spread their operating model across separate tools for identity, planning, communication, reporting, and documentation. That fragmentation creates duplicated data, unclear ownership boundaries, and brittle integrations.

xHarbor brings those concerns into one platform with explicit module boundaries, shared contracts, and a local-first development workflow. The goal is not one giant app. The goal is one coherent system.

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

`xGroup` is the organizational backbone of the platform. It owns people, teams, memberships, invitations, sessions, and reporting structure.

Responsibilities:
- organization and team directory
- user lifecycle, status, and manager relationships
- memberships and invitations
- session administration
- organizational structure chart

### xBacklog

`xBacklog` is the work management module for projects and tasks. It consumes team and user structure from `xGroup`.

Responsibilities:
- projects and delivery scope
- task board with `new -> in_progress -> done`
- task detail, comments, and change history
- filtering and drag-and-drop workflow

### xDashboard

`xDashboard` is the reporting surface for cross-module delivery insights built from `xGroup` and `xBacklog`.

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
- unread state and mark-as-read flows
- shared web and native chat experience
- presence with automatic inactivity handling

### xTag

`xTag` is the cross-system tag indexing and search module. It aggregates case-insensitive hashtag usage across platform sources and exposes a unified discovery layer.

Responsibilities:
- normalize and index `#tags`
- aggregate matches across modules
- expose tag search and reindex flows
- keep tag usage coherent across source systems

### xDoc

`xDoc` is the documentation workspace for structured Markdown content with revision history.

Responsibilities:
- hierarchical document tree
- Markdown preview and edit flows
- per-page revision history
- authorship and change traceability

## Architecture

xHarbor is a modular monorepo. Each domain module has its own API and web app. Modules share contracts and platform services where that reduces duplication without collapsing ownership boundaries.

`xTalk` also has a native macOS client implemented in Swift. The active runtime path for web and backend modules is Node. Local persistence uses SQLite.

Web apps also share one browser shell in `apps/_shared-web`. That shell owns the top bar, bottom bar, avatar rendering, preferences, and the common interaction helpers used across CRUD views, routing, delegated actions, forms, and board/tree interactions.

## Design principles

- explicit domain boundaries
- shared contracts across modules
- minimal coupling between apps
- local-first development experience

## Shared packages

- `packages/contracts`: shared state shapes, contract helpers, and cross-module data conventions
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

- [docs/wiki/README.md](docs/wiki/README.md)
- [docs/product/vision.md](docs/product/vision.md)
- [docs/architecture/monorepo.md](docs/architecture/monorepo.md)
- [docs/architecture/domain-model.md](docs/architecture/domain-model.md)
