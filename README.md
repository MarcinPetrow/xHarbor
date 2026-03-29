# xHarbor

xHarbor is an open source monorepo for managing software delivery teams.

## Platform modules

### xGroup

`xGroup` is the source of truth for people, teams, memberships, invitations, sessions, and user identity metadata.

Current scope:

- organization directory
- teams and memberships
- user lifecycle and status
- invitations
- session administration
- user hover-card data model:
  `firstName`, `lastName`, `nickname`, `department`, `title`, `managerUserID`

Runtime:

- `apps/xgroup-api`
- `apps/xgroup-web`

### xBacklog

`xBacklog` is the planning and execution module for projects and tasks. It consumes workspace structure from `xGroup`.

Current scope:

- projects owned by teams
- task board with statuses `new -> in_progress -> done`
- task detail with description, assignee, timestamps, comments, and history
- board filtering and drag-and-drop workflow
- user hover-cards on assignees and comment authors

Runtime:

- `apps/xbacklog-api`
- `apps/xbacklog-web`

### xDashboard

`xDashboard` is the reporting surface for cross-module insights built from `xGroup` and `xBacklog`.

Current scope:

- executive overview
- team load
- recent activity
- recently completed work
- risk views
- user hover-cards in user, comment, and activity contexts

Runtime:

- `apps/xdashboard-api`
- `apps/xdashboard-web`

### xTalk

`xTalk` is the communication module. It exists as both a web app and a native macOS client.

Current scope:

- team rooms
- direct conversations
- unread state
- mark-as-read actions
- presence colors:
  gray `offline`, amber `brb`, green `online`
- automatic `brb` after 60 seconds of inactivity
- shared visual and interaction model between web and native client
- user hover-cards in the web client

Runtime:

- `apps/xtalk-api`
- `apps/xtalk-web`
- `apps/xtalk-macos`

### xDoc

`xDoc` is the documentation workspace for structured Markdown pages, nested page trees, and edit history.

Current scope:

- markdown page authoring
- parent/child page hierarchy
- per-page revision history
- author and last-editor metadata
- workspace-wide revision timeline
- user hover-cards on authors and editors

Runtime:

- `apps/xdoc-api`
- `apps/xdoc-web`

## Target architecture

- `xGroup`: web + Node API
- `xBacklog`: web + Node API
- `xDashboard`: web + Node API
- `xTalk`: web + native macOS client
- `xDoc`: web + Node API

## Shared packages

- `packages/contracts`: demo state, shared constants, and domain contract helpers
- `packages/platform-auth`: authorization and permission checks
- `packages/platform-session`: cookie-backed session handling and presence state
- `packages/sqlite-store`: SQLite-backed document persistence

## Active runtime

The active implementation path is now Node-based monorepo workspaces.

Current active modules:

- `apps/xgroup-api`
- `apps/xbacklog-api`
- `apps/xdashboard-api`
- `apps/xtalk-api`
- `apps/xdoc-api`
- `apps/xgroup-web`
- `apps/xbacklog-web`
- `apps/xdashboard-web`
- `apps/xtalk-web`
- `apps/xdoc-web`
- `packages/contracts`
- `packages/platform-auth`
- `packages/platform-session`
- `packages/sqlite-store`

Web UI standard:

- shared top navigation bar across all web apps
- sign-in controls on the right side of the nav bar
- shared visual shell and compact multi-view layout
- shared UI preferences for accent palette and timezone
- shared delayed user hover-card for user identity details

Run:

```bash
npm install
npm run dev:xgroup
npm run dev:xbacklog
npm run dev:xdashboard
npm run dev:xtalk
npm run dev:xdoc
swift run xtalk-macos
```

Recommended local start:

```bash
npm install
npm run stack:start
swift run xtalk-macos
```

Local stack management:

```bash
npm run stack:start
npm run stack:status
npm run stack:logs
npm run stack:stop
npm run stack:restart
```

The stack launcher manages all Node APIs and web apps together.

Full local workspace management, including native `xtalk-macos`:

```bash
npm run workspace:start
npm run workspace:status
npm run workspace:logs
npm run workspace:stop
npm run workspace:restart
```

## Swift Scope

Swift remains in the repository only for the native `xtalk-macos` client and its shared `XTalkDomain`.
Web and backend modules are implemented in the Node monorepo.

## Persistence

Primary persistence for active web services now targets SQLite at `data/sqlite/xharbor.db`.
Active runtime expects the current SQLite schema only.

## Repository layout

- `apps/`: application entry points, APIs, web apps, and the native macOS client
- `packages/`: shared libraries used by multiple apps
- `Sources/`: Swift code for native `xTalk`
- `Tests/`: Swift tests for the native client domain
- `docs/`: product and architecture notes

## Docs

- [docs/product/vision.md](/Users/marcin/Projects/xCompany/xHarbor/docs/product/vision.md)
- [docs/architecture/monorepo.md](/Users/marcin/Projects/xCompany/xHarbor/docs/architecture/monorepo.md)
- [docs/architecture/domain-model.md](/Users/marcin/Projects/xCompany/xHarbor/docs/architecture/domain-model.md)
